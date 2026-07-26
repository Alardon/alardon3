"use client";

/**
 * NatureChunk.tsx
 * Dense forest patches rendered via InstancedMesh — one draw call per
 * tree "type" per chunk.  Trees are 30× model scale to match castle walls.
 *
 * Forest placement:
 *   • Coarse grid (8 m spacing) + jitter
 *   • Accept only where forestMask > threshold  → big dense patches
 *   • Reject sea, river centres, castle area, mountain peaks
 */

import { useMemo, useRef, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  CHUNK_SIZE,
  SEA_LEVEL,
  worldHeight,
  forestMask,
  isRiver,
} from "./WorldNoise";
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & { scene: THREE.Group };

// ── Asset paths ───────────────────────────────────────────────────────────────
const PINE_URLS = [
  "/assets/prototype/nature/Meshy_AI_tree_pine_01_0726155650_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_pine_02_0726155451_texture.glb",
];
const OAK_URLS = [
  "/assets/prototype/nature/Meshy_AI_tree_oak_01_0726155718_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_oak_02_0726155710_texture.glb",
];
const ROCK_URLS = [
  "/assets/prototype/nature/Meshy_AI_rock_01_0726155735_texture.glb",
];

[...PINE_URLS, ...OAK_URLS, ...ROCK_URLS].forEach((u) => useGLTF.preload(u));

// ── Scale — 30× so trees match castle-wall height ─────────────────────────────
const TREE_SCALE = 30;

// ── Seeded LCG ────────────────────────────────────────────────────────────────
function lcg(seed: number) {
  let s = (seed ^ 0x5d4e21f3) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Point data ────────────────────────────────────────────────────────────────
interface Pt {
  wx: number; wy: number; wz: number;
  scale: number; rot: number;
}

function generatePoints(chunkX: number, chunkZ: number): {
  pines: Pt[]; oaks: Pt[]; rocks: Pt[];
} {
  const rng = lcg(chunkX * 73856093 ^ chunkZ * 19349663);
  const pines: Pt[] = [];
  const oaks: Pt[]  = [];
  const rocks: Pt[] = [];

  const clearCastle = (wx: number, wz: number) =>
    Math.abs(wx) < 32 && Math.abs(wz - 10) < 32;

  // Coarser grid for performance: 8 m step
  const STEP   = 8.0;
  const JITTER = 3.5;
  const cols   = Math.ceil(CHUNK_SIZE / STEP);
  const rows   = Math.ceil(CHUNK_SIZE / STEP);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lx  = col * STEP + (rng() * 2 - 1) * JITTER;
      const lz  = row * STEP + (rng() * 2 - 1) * JITTER;
      const wx  = chunkX * CHUNK_SIZE + lx;
      const wz  = chunkZ * CHUNK_SIZE + lz;
      const wy  = worldHeight(wx, wz);

      if (wy <= SEA_LEVEL + 0.8) continue;
      if (wy > 32)               continue;
      if (clearCastle(wx, wz))   continue;
      if (isRiver(wx, wz))       continue;

      const fm  = forestMask(wx, wz);
      const thr = 0.42 + rng() * 0.12;

      if (fm < thr) {
        // sparse rock on open plain
        if (rng() < 0.03 && wy > 1.5) {
          rocks.push({ wx, wy, wz, scale: 1.2 + rng() * 2.2, rot: rng() * Math.PI * 2 });
        }
        continue;
      }

      const sc  = TREE_SCALE * (0.80 + rng() * 0.40);
      const rot = rng() * Math.PI * 2;

      // Oaks on flatter low ground; pines on slopes / mountain sides
      if (wy < 7 && rng() < 0.30) {
        oaks.push({ wx, wy, wz, scale: sc, rot });
      } else {
        pines.push({ wx, wy, wz, scale: sc, rot });
      }
    }
  }

  return { pines, oaks, rocks };
}

// ── Extract first Mesh from a loaded GLB ──────────────────────────────────────
function extractMesh(scene: THREE.Group): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  scene.traverse((obj) => {
    if (!found && obj instanceof THREE.Mesh) found = obj;
  });
  return found;
}

// ── Wind sway vertex shader (applied to tree material) ────────────────────────
const swayVert = /* glsl */`
  uniform float time;
  void main() {
    vec3 pos  = position;
    float h   = pos.y;
    float sw  = sin(time * 1.1 + pos.x * 0.6 + pos.z * 0.5) * 0.07
              + sin(time * 0.72 + pos.z * 0.7) * 0.04;
    pos.x    += sw * h * 0.09;
    pos.z    += sw * h * 0.05;
    // instanceMatrix is automatically available in THREE.ShaderMaterial on InstancedMesh
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  }
`;
const swayFrag = /* glsl */`
  uniform vec3 leafColor;
  void main() { gl_FragColor = vec4(leafColor, 1.0); }
`;

// ── InstancedForest — one instanced mesh draw call ────────────────────────────
function InstancedForest({
  url,
  points,
  leafColor,
}: {
  url: string;
  points: Pt[];
  leafColor: THREE.Color;
}) {
  const { scene } = useGLTF(url) as GLTFResult;
  const meshRef   = useRef<THREE.InstancedMesh>(null!);
  const timeRef   = useRef({ value: 0 });

  const { geo, count } = useMemo(() => {
    const m   = extractMesh(scene);
    const geo = m ? (m.geometry as THREE.BufferGeometry).clone() : new THREE.SphereGeometry(0.5);
    return { geo, count: points.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, url]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time:      timeRef.current,
      leafColor: { value: leafColor },
    },
    vertexShader:   swayVert,
    fragmentShader: swayFrag,
    side: THREE.DoubleSide,
  }), [leafColor]);

  // Set instance transforms after mount
  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    points.forEach((p, i) => {
      dummy.position.set(p.wx, p.wy, p.wz);
      dummy.rotation.y = p.rot;
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  useFrame(({ clock }) => { timeRef.current.value = clock.elapsedTime; });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, material, count]}
      castShadow
      receiveShadow
    />
  );
}

// ── InstancedRocks ─────────────────────────────────────────────────────────────
function InstancedRocks({ url, points }: { url: string; points: Pt[] }) {
  const { scene } = useGLTF(url) as GLTFResult;
  const meshRef   = useRef<THREE.InstancedMesh>(null!);

  const geo = useMemo(() => {
    const m = extractMesh(scene);
    return m ? (m.geometry as THREE.BufferGeometry).clone() : new THREE.SphereGeometry(0.5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, url]);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#706055", roughness: 0.95,
  }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const d = new THREE.Object3D();
    points.forEach((p, i) => {
      d.position.set(p.wx, p.wy, p.wz);
      d.rotation.y = p.rot;
      d.scale.setScalar(p.scale);
      d.updateMatrix();
      meshRef.current.setMatrixAt(i, d.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  if (points.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, points.length]}
      castShadow receiveShadow
    />
  );
}

// ── Module-level colour constants ─────────────────────────────────────────────
const PINE_GREEN = new THREE.Color(0.16, 0.34, 0.10);
const OAK_GREEN  = new THREE.Color(0.24, 0.46, 0.10);

// ── NatureChunk ────────────────────────────────────────────────────────────────
export default function NatureChunk({ chunkX, chunkZ }: { chunkX: number; chunkZ: number }) {
  const { pines, oaks, rocks } = useMemo(
    () => generatePoints(chunkX, chunkZ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chunkX, chunkZ]
  );

  return (
    <group>
      {pines.length > 0 && <InstancedForest url={PINE_URLS[0]} points={pines} leafColor={PINE_GREEN} />}
      {oaks.length  > 0 && <InstancedForest url={OAK_URLS[0]}  points={oaks}  leafColor={OAK_GREEN} />}
      {rocks.length > 0 && <InstancedRocks  url={ROCK_URLS[0]} points={rocks} />}
    </group>
  );
}
