"use client";

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getHeightAt, getSlopeAt } from "./Terrain";
import type { GLTF } from "three-stdlib";

const SIZE = 200;

// Poisson-disk-like scatter with min distance
function poissonScatter(
  count: number,
  minDist: number,
  seed: number,
  hmap: Float32Array,
  minH: number,
  maxH: number,
  maxSlope: number,
  clearRadius = 0
): [number, number, number][] {
  const rng = seededRng(seed);
  const points: [number, number, number][] = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 30) {
    attempts++;
    const wx = (rng() - 0.5) * SIZE * 0.95;
    const wz = (rng() - 0.5) * SIZE * 0.95;
    if (clearRadius > 0 && Math.sqrt(wx * wx + wz * wz) < clearRadius) continue;
    const h = getHeightAt(hmap, wx, wz);
    const sl = getSlopeAt(hmap, wx, wz);
    if (h <= minH || h >= maxH || sl > maxSlope) continue;
    let ok = true;
    for (const [px, , pz] of points) {
      const dx = px - wx, dz = pz - wz;
      if (Math.sqrt(dx * dx + dz * dz) < minDist) { ok = false; break; }
    }
    if (ok) points.push([wx, h, wz]);
  }
  return points;
}

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Wind sway vertex shader
const swayVertex = /* glsl */ `
  uniform float time;
  void main() {
    vec3 pos = position;
    float height = pos.y;
    float sway = sin(time * 1.3 + pos.x * 0.4 + pos.z * 0.3) * 0.06
               + sin(time * 0.8 + pos.z * 0.5) * 0.04;
    pos.x += sway * height * 0.12;
    pos.z += sway * height * 0.08;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const swayFragment = /* glsl */ `
  void main() { gl_FragColor = vec4(0.25, 0.45, 0.18, 1.0); }
`;

type GLTFResult = GLTF & { scene: THREE.Group };

function NatureModel({
  url,
  position,
  rotation,
  scale,
  sway,
}: {
  url: string;
  position: [number, number, number];
  rotation: number;
  scale: number;
  sway: boolean;
}) {
  const { scene } = useGLTF(url) as GLTFResult;
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef<THREE.Group>(null!);
  const timeUniform = useRef({ value: 0 });

  useFrame(({ clock }) => {
    timeUniform.current.value = clock.elapsedTime;
  });

  // Apply sway shader to mesh leaves (top meshes)
  useMemo(() => {
    if (!sway) return;
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { time: timeUniform.current },
          vertexShader: swayVertex,
          fragmentShader: swayFragment,
          side: THREE.DoubleSide,
        });
        // only replace if mesh is upper portion (rough heuristic: bbox.max.y > half)
        const bbox = new THREE.Box3().setFromObject(obj);
        const totalBbox = new THREE.Box3().setFromObject(cloned);
        const mid = (totalBbox.min.y + totalBbox.max.y) / 2;
        if (bbox.min.y > mid * 0.4) {
          obj.material = mat;
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned]);

  return (
    <group ref={ref} position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <primitive object={cloned} castShadow receiveShadow />
    </group>
  );
}

const TREE_MODELS = [
  "/assets/prototype/nature/Meshy_AI_tree_pine_01_0726155650_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_pine_02_0726155451_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_oak_01_0726155718_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_oak_02_0726155710_texture.glb",
];
const ROCK_MODELS = [
  "/assets/prototype/nature/Meshy_AI_rock_01_0726155735_texture.glb",
  "/assets/prototype/nature/Meshy_AI_rock_03_0726155728_texture.glb",
];

// Preload
TREE_MODELS.forEach((url) => useGLTF.preload(url));
ROCK_MODELS.forEach((url) => useGLTF.preload(url));

export default function Nature({ hmap }: { hmap: Float32Array }) {
  const rng = seededRng(42);

  const treePoints = useMemo(
    () => poissonScatter(120, 4.5, 7, hmap, 1.5, 18, 0.55, 14),
    [hmap]
  );

  const rockPoints = useMemo(
    () => poissonScatter(30, 6, 13, hmap, 0.5, 22, 0.8, 10),
    [hmap]
  );

  return (
    <group>
      {treePoints.map(([wx, wy, wz], i) => {
        const modelUrl = TREE_MODELS[i % TREE_MODELS.length];
        const rot = (i * 137.5 * Math.PI) / 180;
        const scale = 0.85 + ((i * 0.317) % 1) * 0.3;
        return (
          <NatureModel
            key={`tree-${i}`}
            url={modelUrl}
            position={[wx, wy, wz]}
            rotation={rot}
            scale={scale}
            sway
          />
        );
      })}
      {rockPoints.map(([wx, wy, wz], i) => {
        const modelUrl = ROCK_MODELS[i % ROCK_MODELS.length];
        const rot = (i * 93.7 * Math.PI) / 180;
        const scale = 0.6 + ((i * 0.417) % 1) * 0.8;
        return (
          <NatureModel
            key={`rock-${i}`}
            url={modelUrl}
            position={[wx, wy, wz]}
            rotation={rot}
            scale={scale}
            sway={false}
          />
        );
      })}
    </group>
  );
}
