"use client";

/**
 * TerrainChunk.tsx
 * Renders a single CHUNK_SIZE×CHUNK_SIZE terrain tile at world position
 * (chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE).
 * Heightmap is computed once on mount via useMemo.
 */

import { useMemo, useRef, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CHUNK_SIZE,
  CHUNK_VERTS,
  SEA_LEVEL,
  buildChunkHeightmap,
} from "./WorldNoise";

// ── Shared terrain shaders (splat-blended PBR-style) ─────────────────────────
const vertexShader = /* glsl */`
  varying vec2  vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    vUv       = uv;
    vHeight   = position.y;
    vec3 n    = normalize(normalMatrix * normal);
    vNormal   = n;
    vSlope    = 1.0 - clamp(dot(n, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tGrass;
  uniform sampler2D tDirt;
  uniform sampler2D tRock;
  uniform sampler2D tSand;
  uniform sampler2D tSnow;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;
  uniform vec3  uSkyColor;
  uniform vec3  uGroundColor;
  uniform vec3  uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3  uCamPos;

  varying vec2  vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3  vNormal;
  varying vec3  vWorldPos;

  void main() {
    // Tiled UVs at two scales to reduce repetition
    vec2 uvA = vUv * 20.0;
    vec2 uvB = vUv * 60.0;

    vec4 cGrass = mix(texture2D(tGrass, uvA), texture2D(tGrass, uvB), 0.35);
    vec4 cDirt  = mix(texture2D(tDirt,  uvA), texture2D(tDirt,  uvB), 0.35);
    vec4 cRock  = mix(texture2D(tRock,  uvA), texture2D(tRock,  uvB), 0.35);
    vec4 cSand  = mix(texture2D(tSand,  uvA), texture2D(tSand,  uvB), 0.35);
    vec4 cSnow  = mix(texture2D(tSnow,  uvA), texture2D(tSnow,  uvB), 0.35);

    float h  = vHeight;
    float sl = vSlope;

    // Splat weights
    float wSand  = smoothstep(-2.0,  2.0, h) * (1.0 - smoothstep(2.0,   4.5, h));
    float wGrass = smoothstep( 1.5,  4.5, h) * (1.0 - smoothstep(12.0, 17.0, h));
    float wDirt  = smoothstep( 0.5,  3.0, h) * (1.0 - smoothstep(15.0, 20.0, h));
    float wRockH = smoothstep(12.0, 18.0, h);
    float wSnow  = smoothstep(26.0, 34.0, h);
    float wSlope = smoothstep(0.42,  0.68, sl);
    float wRock  = max(wRockH, wSlope);

    float total = wSand + wGrass + wDirt + wRock + wSnow + 0.001;
    wSand  /= total; wGrass /= total; wDirt /= total;
    wRock  /= total; wSnow  /= total;

    vec4 col = cDirt * 0.01;
    col += cSand  * wSand;
    col += cGrass * wGrass;
    col += cDirt  * wDirt;
    col += cRock  * wRock;
    col += cSnow  * wSnow;

    // Lighting
    float hemiT  = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
    vec3  ambient = mix(uGroundColor, uSkyColor, hemiT) * 0.7;

    float NdotL   = max(dot(vNormal, normalize(uSunDir)), 0.0);
    float selfSh  = clamp(dot(vNormal, normalize(uSunDir + vec3(0,0.6,0))) * 0.5 + 0.65, 0.3, 1.0);

    // Sub-surface scatter on grass
    float sss     = wGrass * (1.0 - wRock) * smoothstep(0.0, 0.4, NdotL) * 0.10;
    vec3  sssCol  = vec3(0.15, 0.40, 0.04) * sss;

    // Specular gloss on snow
    vec3 viewDir  = normalize(uCamPos - vWorldPos);
    vec3 halfDir  = normalize(normalize(uSunDir) + viewDir);
    float spec    = wSnow * pow(max(dot(vNormal, halfDir), 0.0), 64.0) * 0.6;

    vec3 lit = col.rgb * (ambient + uSunColor * NdotL * selfSh) + sssCol + uSunColor * spec;

    // Exponential distance fog
    float dist  = length(vWorldPos - uCamPos);
    float fogF  = 1.0 - exp(-max(0.0, dist - uFogNear) / (uFogFar - uFogNear) * 3.5);
    lit = mix(lit, uFogColor, clamp(fogF, 0.0, 0.9));

    gl_FragColor = vec4(lit, 1.0);
  }
`;

// Preload textures once
const TEX_PATHS = [
  "/assets/prototype/terrain/grass_diffuse.png",
  "/assets/prototype/terrain/dirt_diffuse.png",
  "/assets/prototype/terrain/rock_diffuse.png",
  "/assets/prototype/terrain/sand_diffuse.png",
  "/assets/prototype/terrain/snow_diffuse.png",
];

const SUN_DIR      = new THREE.Vector3(0.55, 0.85, 0.35).normalize();
const SUN_COLOR    = new THREE.Color(1.0, 0.90, 0.70);
const SKY_COLOR    = new THREE.Color(0.50, 0.66, 0.90);
const GROUND_COLOR = new THREE.Color(0.20, 0.16, 0.11);
const FOG_COLOR    = new THREE.Color(0.68, 0.77, 0.88);

interface TerrainChunkProps {
  chunkX: number;
  chunkZ: number;
  onReady?: (chunkX: number, chunkZ: number, hmap: Float32Array) => void;
}

export default function TerrainChunk({ chunkX, chunkZ, onReady }: TerrainChunkProps) {
  const waterRef = useRef<THREE.Mesh>(null!);
  const matRef   = useRef<THREE.ShaderMaterial>(null!);

  const textures = useTexture(TEX_PATHS);
  textures.forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  const [tGrass, tDirt, tRock, tSand, tSnow] = textures;

  // Build geometry from heightmap
  const { geometry, hmap } = useMemo(() => {
    const hm   = buildChunkHeightmap(chunkX, chunkZ);
    const n    = CHUNK_VERTS + 1;
    const geo  = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_VERTS, CHUNK_VERTS);
    geo.rotateX(-Math.PI / 2);
    const pos  = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, hm[i]);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return { geometry: geo, hmap: hm };
  // chunkX/Z are stable for the lifetime of this component
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkX, chunkZ]);

  // Notify parent once ready
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!reportedRef.current && onReady) {
      reportedRef.current = true;
      onReady(chunkX, chunkZ, hmap);
    }
  }, [hmap, chunkX, chunkZ, onReady]);

  const uniforms = useMemo(() => ({
    tGrass:       { value: tGrass },
    tDirt:        { value: tDirt  },
    tRock:        { value: tRock  },
    tSand:        { value: tSand  },
    tSnow:        { value: tSnow  },
    uSunDir:      { value: SUN_DIR },
    uSunColor:    { value: SUN_COLOR },
    uSkyColor:    { value: SKY_COLOR },
    uGroundColor: { value: GROUND_COLOR },
    uFogColor:    { value: FOG_COLOR },
    uFogNear:     { value: 80.0 },
    uFogFar:      { value: 320.0 },
    uCamPos:      { value: new THREE.Vector3() },
  }), [tGrass, tDirt, tRock, tSand, tSnow]);

  const waterUniforms = useMemo(() => ({
    time:         { value: 0 },
    deepColor:    { value: new THREE.Color(0x06284a) },
    shallowColor: { value: new THREE.Color(0x1460a0) },
  }), []);

  useFrame(({ clock, camera }) => {
    if (matRef.current) {
      matRef.current.uniforms.uCamPos.value.copy(camera.position);
    }
    if (waterRef.current) {
      (waterRef.current.material as THREE.ShaderMaterial).uniforms.time.value = clock.elapsedTime;
    }
  });

  const worldOffsetX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2;
  const worldOffsetZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2;

  return (
    <group position={[worldOffsetX, 0, worldOffsetZ]}>
      {/* Terrain mesh */}
      <mesh geometry={geometry} receiveShadow castShadow>
        <shaderMaterial
          ref={matRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Water plane at sea level — covers full chunk */}
      <mesh
        ref={waterRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, SEA_LEVEL + 0.25, 0]}
        receiveShadow
      >
        <planeGeometry args={[CHUNK_SIZE, CHUNK_SIZE, 1, 1]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          uniforms={waterUniforms}
          vertexShader={/* glsl */`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={/* glsl */`
            uniform float time;
            uniform vec3 deepColor;
            uniform vec3 shallowColor;
            varying vec2 vUv;
            void main() {
              float w = sin(vUv.x * 10.0 + time * 1.3) * 0.25
                      + sin(vUv.y *  8.0 + time * 0.9) * 0.25 + 0.5;
              vec3 col = mix(deepColor, shallowColor, w * 0.6);
              float foam = smoothstep(0.78, 1.0, w);
              col = mix(col, vec3(0.75, 0.88, 0.96), foam * 0.45);
              gl_FragColor = vec4(col, 0.86);
            }
          `}
        />
      </mesh>
    </group>
  );
}
