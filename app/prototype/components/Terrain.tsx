"use client";

import { useMemo, useRef, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { useFrame } from "@react-three/fiber";

export const GRID = 200;
export const SIZE = 200;
export const MAX_HEIGHT = 32;
export const SEA_LEVEL = -2;

// ─────────────────────────────────────────────
// Heightmap: one mountain on the NORTH side (z < -30),
// everywhere else is a flat-ish plain with gentle rolling.
// Castle sits at (0,0) on the plain.
// ─────────────────────────────────────────────
function buildHeightmap(noise2D: ReturnType<typeof createNoise2D>): Float32Array {
  const verts = (GRID + 1) * (GRID + 1);
  const hmap = new Float32Array(verts);

  for (let z = 0; z <= GRID; z++) {
    for (let x = 0; x <= GRID; x++) {
      const wx = (x / GRID - 0.5) * SIZE; // -100..100
      const wz = (z / GRID - 0.5) * SIZE; // -100..100

      const nx = x / GRID;
      const nz = z / GRID;

      // --- Micro detail noise (applies everywhere) ---
      let detail = 0;
      let da = 1, df = 4.5, dn = 0;
      for (let o = 0; o < 4; o++) {
        detail += noise2D(nx * df, nz * df) * da;
        dn += da; da *= 0.45; df *= 2.2;
      }
      detail = (detail / dn) * 1.8; // small bumps ±1.8

      // --- Mountain region: z < -20 (north) ---
      // mountain mask: smooth ramp from z=-20 to z=-50, full at z<-50
      const mountainMask = Math.max(0, Math.min(1, (-wz - 20) / 30));

      // mountain fBm
      let mHeight = 0;
      let ma = 1, mf = 1.2, mn = 0;
      for (let o = 0; o < 6; o++) {
        mHeight += noise2D(nx * mf + 5.3, nz * mf + 2.1) * ma;
        mn += ma; ma *= 0.52; mf *= 2.0;
      }
      mHeight = ((mHeight / mn) * 0.5 + 0.55) * MAX_HEIGHT; // 0..32 range

      // centre the mountain peak around x=0, spread it
      const mxOff = Math.abs(wx) / 60;
      const mPeak = Math.max(0, mHeight - mxOff * mxOff * 8);

      // --- Plain region ---
      const plainH = 1.5 + detail * 0.6; // gently bumpy, ~0..3

      // blend
      const h = plainH + mountainMask * (mPeak - plainH);
      hmap[z * (GRID + 1) + x] = Math.max(SEA_LEVEL - 0.5, h);
    }
  }
  return hmap;
}

export function getHeightAt(hmap: Float32Array, wx: number, wz: number): number {
  const hx = ((wx + SIZE / 2) / SIZE) * GRID;
  const hz = ((wz + SIZE / 2) / SIZE) * GRID;
  const ix = Math.max(0, Math.min(GRID - 1, Math.floor(hx)));
  const iz = Math.max(0, Math.min(GRID - 1, Math.floor(hz)));
  const fx = hx - ix;
  const fz = hz - iz;
  const h00 = hmap[iz * (GRID + 1) + ix];
  const h10 = hmap[iz * (GRID + 1) + (ix + 1)];
  const h01 = hmap[(iz + 1) * (GRID + 1) + ix];
  const h11 = hmap[(iz + 1) * (GRID + 1) + (ix + 1)];
  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
}

export function getSlopeAt(hmap: Float32Array, wx: number, wz: number): number {
  const step = SIZE / GRID;
  const h0 = getHeightAt(hmap, wx, wz);
  const hx = getHeightAt(hmap, wx + step, wz);
  const hz = getHeightAt(hmap, wx, wz + step);
  const dx = (hx - h0) / step;
  const dz = (hz - h0) / step;
  return Math.sqrt(dx * dx + dz * dz);
}

// ─────────────────────────────────────────────
// Terrain splat shader — PBR-style with per-vertex
// diffuse lighting baked in; receives R3F shadows.
// ─────────────────────────────────────────────
const vertexShader = /* glsl */ `
  varying vec2  vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    vUv       = uv;
    vHeight   = position.y;
    vNormal   = normalize(normalMatrix * normal);
    vSlope    = 1.0 - clamp(dot(vNormal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tGrass;
  uniform sampler2D tDirt;
  uniform sampler2D tRock;
  uniform sampler2D tSand;
  uniform sampler2D tSnow;
  uniform float maxHeight;
  uniform float seaLevel;
  uniform vec3  sunDir;
  uniform vec3  sunColor;
  uniform vec3  skyColor;
  uniform vec3  groundColor;
  uniform float time;
  uniform float shadowStrength;

  varying vec2  vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    // ── tiling UVs ───────────────────────────────────────────────────
    vec2 uv16 = vUv * 16.0;
    vec2 uv32 = vUv * 32.0;

    vec4 cGrass = texture2D(tGrass, uv16);
    vec4 cDirt  = texture2D(tDirt,  uv32);
    vec4 cRock  = texture2D(tRock,  uv16);
    vec4 cSand  = texture2D(tSand,  uv32);
    vec4 cSnow  = texture2D(tSnow,  uv16);

    float h = vHeight;
    float sl = vSlope;

    // ── height / slope splat weights ─────────────────────────────────
    float wSand  = smoothstep(-1.0, 1.5, h)    * (1.0 - smoothstep(1.5, 3.5, h));
    float wGrass = smoothstep(1.0, 4.0, h)     * (1.0 - smoothstep(10.0, 16.0, h));
    float wDirt  = smoothstep(0.5, 3.0, h)     * (1.0 - smoothstep(14.0, 18.0, h));
    float wRockH = smoothstep(12.0, 18.0, h);
    float wSnow  = smoothstep(22.0, 28.0, h);
    float wSlope = smoothstep(0.40, 0.65, sl);  // steep → rock

    // normalise
    float total = wSand + wGrass + wDirt + max(wRockH, wSlope) + wSnow + 0.001;
    wSand  /= total; wGrass /= total; wDirt /= total;
    float wR = max(wRockH, wSlope) / total;
    wSnow  /= total;

    // ── splat colour ──────────────────────────────────────────────────
    vec4 col = cDirt;
    col = mix(col, cSand,  wSand);
    col = mix(col, cGrass, wGrass);
    col = mix(col, cRock,  wR);
    col = mix(col, cSnow,  wSnow);

    // ── lighting ──────────────────────────────────────────────────────
    // hemisphere ambient
    float hemiT = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 ambient = mix(groundColor, skyColor, hemiT);

    // directional diffuse (sun)
    float diff = max(dot(vNormal, normalize(sunDir)), 0.0);

    // soft self-shadow: darken north-facing terrain slightly
    float selfShadow = clamp(dot(vNormal, vec3(0.0, 0.5, 0.3)) * 0.5 + 0.7, 0.3, 1.0);

    // SSS-like sub-surface on grass (bright green tint in shallow sunlight)
    float sss = (1.0 - wR) * (1.0 - wSnow) * smoothstep(0.0, 0.3, diff) * 0.12;
    vec3 sssColor = vec3(0.2, 0.45, 0.05) * sss;

    vec3 lit = col.rgb * (ambient + sunColor * diff * selfShadow) + sssColor;

    // ── distance fog ──────────────────────────────────────────────────
    float dist = length(vWorldPos) / 180.0;
    float fog  = smoothstep(0.5, 1.0, dist);
    vec3 fogColor = vec3(0.68, 0.78, 0.90);
    lit = mix(lit, fogColor, fog * 0.55);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

interface TerrainProps {
  onHeightmapReady: (hmap: Float32Array) => void;
}

export default function Terrain({ onHeightmapReady }: TerrainProps) {
  const waterRef = useRef<THREE.Mesh>(null!);

  const [tGrass, tDirt, tRock, tSand, tSnow] = useTexture([
    "/assets/prototype/terrain/grass_diffuse.png",
    "/assets/prototype/terrain/dirt_diffuse.png",
    "/assets/prototype/terrain/rock_diffuse.png",
    "/assets/prototype/terrain/sand_diffuse.png",
    "/assets/prototype/terrain/snow_diffuse.png",
  ]);

  [tGrass, tDirt, tRock, tSand, tSnow].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });

  const { geometry, heightmap } = useMemo(() => {
    const noise2D = createNoise2D();
    const hmap = buildHeightmap(noise2D);

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, GRID, GRID);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, hmap[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    return { geometry: geo, heightmap: hmap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!reportedRef.current) {
      reportedRef.current = true;
      onHeightmapReady(heightmap);
    }
  }, [heightmap, onHeightmapReady]);

  const uniforms = useMemo(
    () => ({
      tGrass:      { value: tGrass },
      tDirt:       { value: tDirt  },
      tRock:       { value: tRock  },
      tSand:       { value: tSand  },
      tSnow:       { value: tSnow  },
      maxHeight:   { value: MAX_HEIGHT },
      seaLevel:    { value: SEA_LEVEL  },
      sunDir:      { value: new THREE.Vector3(0.6, 0.9, 0.4).normalize() },
      sunColor:    { value: new THREE.Color(1.0, 0.88, 0.68) },
      skyColor:    { value: new THREE.Color(0.52, 0.68, 0.92) },
      groundColor: { value: new THREE.Color(0.22, 0.18, 0.12) },
      time:        { value: 0 },
      shadowStrength: { value: 0.65 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tGrass, tDirt, tRock, tSand, tSnow]
  );

  useFrame(({ clock }) => {
    if (uniforms.time) uniforms.time.value = clock.elapsedTime;
    if (waterRef.current) {
      const mat = waterRef.current.material as THREE.ShaderMaterial;
      if (mat.uniforms?.time) mat.uniforms.time.value = clock.elapsedTime;
    }
  });

  const waterUniforms = useMemo(() => ({
    time:         { value: 0 },
    deepColor:    { value: new THREE.Color(0x07305a) },
    shallowColor: { value: new THREE.Color(0x1566a0) },
    foamColor:    { value: new THREE.Color(0xb8dcf0) },
  }), []);

  return (
    <>
      <mesh geometry={geometry} receiveShadow castShadow>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Water plane */}
      <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL + 0.2, 0]} receiveShadow>
        <planeGeometry args={[SIZE, SIZE, 1, 1]} />
        <shaderMaterial
          transparent
          uniforms={waterUniforms}
          vertexShader={/* glsl */ `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            uniform float time;
            uniform vec3 deepColor;
            uniform vec3 shallowColor;
            uniform vec3 foamColor;
            varying vec2 vUv;
            float wave(vec2 uv, float t) {
              return sin(uv.x * 9.0 + t * 1.4) * 0.5
                   + sin(uv.y * 7.0 + t * 1.0) * 0.5;
            }
            void main() {
              float w = wave(vUv, time) * 0.5 + 0.5;
              vec3 col = mix(deepColor, shallowColor, w * 0.65);
              float foam = smoothstep(0.82, 1.0, w);
              col = mix(col, foamColor, foam * 0.5);
              gl_FragColor = vec4(col, 0.88);
            }
          `}
          side={THREE.FrontSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
