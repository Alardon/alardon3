"use client";

import { useMemo, useRef, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { useFrame } from "@react-three/fiber";

const GRID = 200;
const SIZE = 200;
const MAX_HEIGHT = 28;
const SEA_LEVEL = 0;

// fBm — fractional Brownian motion
function buildHeightmap(noise2D: ReturnType<typeof createNoise2D>): Float32Array {
  const verts = (GRID + 1) * (GRID + 1);
  const hmap = new Float32Array(verts);
  for (let z = 0; z <= GRID; z++) {
    for (let x = 0; x <= GRID; x++) {
      const nx = x / GRID;
      const nz = z / GRID;
      let v = 0;
      let amp = 1;
      let freq = 1.8;
      let norm = 0;
      for (let o = 0; o < 7; o++) {
        v += noise2D(nx * freq, nz * freq) * amp;
        norm += amp;
        amp *= 0.48;
        freq *= 2.1;
      }
      v /= norm;
      // push terrain up overall so we have peaks
      v = (v + 0.3) * MAX_HEIGHT;
      hmap[z * (GRID + 1) + x] = v;
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

// vertex + fragment shader for splat blending
const vertexShader = /* glsl */ `
  uniform sampler2D heightMap;
  varying vec2 vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vHeight = position.y;
    // slope from normal
    vNormal = normalize(normalMatrix * normal);
    vSlope = 1.0 - abs(dot(vNormal, vec3(0.0, 1.0, 0.0)));
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

  varying vec2 vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3 vNormal;

  // smoothstep blend
  float sbend(float lo, float hi, float v) {
    return smoothstep(lo, hi, v);
  }

  void main() {
    vec2 tiledUV = vUv * 32.0;

    vec4 grass = texture2D(tGrass, tiledUV);
    vec4 dirt  = texture2D(tDirt,  tiledUV);
    vec4 rock  = texture2D(tRock,  tiledUV);
    vec4 sand  = texture2D(tSand,  tiledUV);
    vec4 snow  = texture2D(tSnow,  tiledUV);

    float h = vHeight;
    float slope = vSlope;

    // --- height-based blend (low->high)
    // grass: 0 ~ 8, transitions to dirt 6~10
    float fGrass = sbend(2.0, 6.0, h) * (1.0 - sbend(6.0, 10.0, h));
    float fDirt  = sbend(0.0, 4.0, h) * (1.0 - sbend(10.0, 14.0, h));
    float fRockH = sbend(10.0, 15.0, h);
    float fSnow  = sbend(18.0, 24.0, h);

    // sand at beach level
    float sandLevel = seaLevel + 1.5;
    float fSand = sbend(seaLevel - 1.0, sandLevel, h) * (1.0 - sbend(sandLevel, sandLevel + 2.0, h));

    // --- slope override: steep becomes rock regardless of height
    float slopeMask = sbend(0.45, 0.7, slope);

    // --- compose
    vec4 col = dirt; // base fallback
    col = mix(col, grass, clamp(fGrass, 0.0, 1.0));
    col = mix(col, sand,  clamp(fSand  * (1.0 - slopeMask), 0.0, 1.0));
    col = mix(col, rock,  clamp(fRockH, 0.0, 1.0));
    col = mix(col, rock,  slopeMask);
    col = mix(col, snow,  clamp(fSnow * (1.0 - slopeMask * 0.7), 0.0, 1.0));

    // simple hemisphere ambient + directional light
    vec3 lightDir = normalize(vec3(1.0, 1.8, 0.8));
    float diff = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;
    gl_FragColor = vec4(col.rgb * diff, 1.0);
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

  // make all textures repeat
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

  // Report heightmap after render (not during)
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!reportedRef.current) {
      reportedRef.current = true;
      onHeightmapReady(heightmap);
    }
  }, [heightmap, onHeightmapReady]);

  const uniforms = useMemo(
    () => ({
      tGrass: { value: tGrass },
      tDirt:  { value: tDirt  },
      tRock:  { value: tRock  },
      tSand:  { value: tSand  },
      tSnow:  { value: tSnow  },
      maxHeight: { value: MAX_HEIGHT },
      seaLevel:  { value: SEA_LEVEL  },
    }),
    [tGrass, tDirt, tRock, tSand, tSnow]
  );

  // scroll water UV over time
  useFrame(({ clock }) => {
    if (waterRef.current) {
      const mat = waterRef.current.material as THREE.ShaderMaterial;
      if (mat.uniforms?.time) {
        mat.uniforms.time.value = clock.elapsedTime;
      }
    }
  });

  const waterUniforms = useMemo(
    () => ({
      time:      { value: 0 },
      deepColor: { value: new THREE.Color(0x0a3d6b) },
      shallowColor: { value: new THREE.Color(0x1a7aad) },
      foamColor: { value: new THREE.Color(0xaaddff) },
    }),
    []
  );

  return (
    <>
      {/* Main terrain */}
      <mesh geometry={geometry} receiveShadow castShadow>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Water plane */}
      <mesh
        ref={waterRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, SEA_LEVEL + 0.15, 0]}
        receiveShadow
      >
        <planeGeometry args={[SIZE, SIZE, 1, 1]} />
        <shaderMaterial
          transparent
          uniforms={waterUniforms}
          vertexShader={/* glsl */ `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
              vUv = uv;
              vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */ `
            uniform float time;
            uniform vec3 deepColor;
            uniform vec3 shallowColor;
            uniform vec3 foamColor;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            float wave(vec2 uv, float t) {
              return sin(uv.x * 8.0 + t * 1.2) * 0.5
                   + sin(uv.y * 6.0 + t * 0.9) * 0.5;
            }

            void main() {
              float w = wave(vUv, time) * 0.5 + 0.5;
              vec3 col = mix(deepColor, shallowColor, w * 0.6);
              float foam = smoothstep(0.8, 1.0, w);
              col = mix(col, foamColor, foam * 0.4);
              float fresnel = 0.3 + 0.7 * pow(1.0 - abs(dot(vec3(0,1,0), normalize(vec3(0.2, 0.8, 0.3)))), 3.0);
              gl_FragColor = vec4(col, 0.82 * fresnel + 0.18);
            }
          `}
          side={THREE.FrontSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
