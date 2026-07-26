"use client";

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getHeightAt, getSlopeAt, SIZE } from "./Terrain";
import type { GLTF } from "three-stdlib";

// ─────────────────────────────────────────────────────────────────────────────
// Seeded pseudo-random (LCG)
// ─────────────────────────────────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scatter points that pass height / slope filters
// clearRects = list of [cx, cz, halfW, halfH] zones to avoid (castle area)
// ─────────────────────────────────────────────────────────────────────────────
function scatter(
  count: number,
  minDist: number,
  seed: number,
  hmap: Float32Array,
  minH: number,
  maxH: number,
  maxSlope: number,
  clearRects: [number, number, number, number][] = [],
): [number, number, number][] {
  const rng = seededRng(seed);
  const pts: [number, number, number][] = [];
  let tries = 0;
  while (pts.length < count && tries < count * 60) {
    tries++;
    const wx = (rng() - 0.5) * SIZE * 0.96;
    const wz = (rng() - 0.5) * SIZE * 0.96;
    const h  = getHeightAt(hmap, wx, wz);
    const sl = getSlopeAt(hmap, wx, wz);
    if (h < minH || h > maxH || sl > maxSlope) continue;
    // avoid clear rects
    let blocked = false;
    for (const [cx, cz, hw, hh] of clearRects) {
      if (Math.abs(wx - cx) < hw && Math.abs(wz - cz) < hh) { blocked = true; break; }
    }
    if (blocked) continue;
    // min-distance check
    let ok = true;
    for (const [px, , pz] of pts) {
      const dx = px - wx, dz = pz - wz;
      if (dx * dx + dz * dz < minDist * minDist) { ok = false; break; }
    }
    if (ok) pts.push([wx, h, wz]);
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wind-sway vertex shader applied to tree crowns
// ─────────────────────────────────────────────────────────────────────────────
const swayVertex = /* glsl */ `
  uniform float time;
  uniform float swayAmt;
  void main() {
    vec3 pos = position;
    float h = pos.y;
    // two overlapping sines give organic feel
    float s = sin(time * 1.1 + pos.x * 0.5 + pos.z * 0.4) * 0.07
            + sin(time * 0.7 + pos.z * 0.6            ) * 0.05;
    pos.x += s * h * swayAmt;
    pos.z += s * h * swayAmt * 0.6;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const swayFragment = /* glsl */ `
  // will be overridden by map per mesh — we only keep geometry correct
  uniform vec3 leafColor;
  void main() { gl_FragColor = vec4(leafColor, 1.0); }
`;

type GLTFResult = GLTF & { scene: THREE.Group };

// ─────────────────────────────────────────────────────────────────────────────
// Single instanced nature object with optional wind sway
// ─────────────────────────────────────────────────────────────────────────────
function NatureModel({
  url,
  position,
  rotation,
  scale,
  sway,
  leafColor,
}: {
  url: string;
  position: [number, number, number];
  rotation: number;
  scale: number;
  sway: boolean;
  leafColor?: THREE.Color;
}) {
  const { scene } = useGLTF(url) as GLTFResult;
  const cloned   = useMemo(() => scene.clone(true), [scene]);
  const timeUni  = useRef({ value: 0 });
  const swayUni  = useRef({ value: 0.12 });
  const colorUni = useRef({ value: leafColor ?? new THREE.Color(0.22, 0.42, 0.14) });

  // Apply sway shader to leaf meshes (upper half of bounding box)
  useMemo(() => {
    if (!sway) return;
    const totalBB = new THREE.Box3().setFromObject(cloned);
    const mid = (totalBB.min.y + totalBB.max.y) * 0.5;
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const bb = new THREE.Box3().setFromObject(obj);
      if (bb.min.y > mid * 0.3) {
        obj.material = new THREE.ShaderMaterial({
          uniforms: {
            time:      timeUni.current,
            swayAmt:   swayUni.current,
            leafColor: colorUni.current,
          },
          vertexShader: swayVertex,
          fragmentShader: swayFragment,
          side: THREE.DoubleSide,
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, sway]);

  useFrame(({ clock }) => { timeUni.current.value = clock.elapsedTime; });

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <primitive object={cloned} castShadow receiveShadow />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset lists
// ─────────────────────────────────────────────────────────────────────────────
const PINE_MODELS = [
  "/assets/prototype/nature/Meshy_AI_tree_pine_01_0726155650_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_pine_02_0726155451_texture.glb",
];
const OAK_MODELS = [
  "/assets/prototype/nature/Meshy_AI_tree_oak_01_0726155718_texture.glb",
  "/assets/prototype/nature/Meshy_AI_tree_oak_02_0726155710_texture.glb",
];
const ROCK_MODELS = [
  "/assets/prototype/nature/Meshy_AI_rock_01_0726155735_texture.glb",
  "/assets/prototype/nature/Meshy_AI_rock_03_0726155728_texture.glb",
];

[...PINE_MODELS, ...OAK_MODELS, ...ROCK_MODELS].forEach((u) => useGLTF.preload(u));

// ─────────────────────────────────────────────────────────────────────────────
// Pine colours — slight variety for visual depth
// ─────────────────────────────────────────────────────────────────────────────
const PINE_COLORS = [
  new THREE.Color(0.18, 0.38, 0.12),
  new THREE.Color(0.14, 0.32, 0.10),
  new THREE.Color(0.22, 0.44, 0.16),
  new THREE.Color(0.16, 0.35, 0.11),
];

// Castle clear zone: centred at (0,0), 20×20 units
const CASTLE_CLEAR: [number, number, number, number][] = [[0, 0, 20, 20]];

export default function Nature({ hmap }: { hmap: Float32Array }) {

  // ── Dense mountain forest (pines, north side z < -20) ──────────────────
  const mountainTrees = useMemo(
    () => scatter(220, 3.2, 11, hmap, 3.0, 30, 0.7, CASTLE_CLEAR),
    [hmap]
  );

  // ── Plain forest belt — ring around the castle, but not on mountain ────
  const plainTrees = useMemo(
    () => scatter(140, 3.5, 17, hmap, 0.5, 6.0, 0.30, [
      ...CASTLE_CLEAR,
      // also keep the north mountain area out (handled by height: plain is <6)
    ]),
    [hmap]
  );

  // ── Sparse oaks on plain edges ─────────────────────────────────────────
  const oakTrees = useMemo(
    () => scatter(60, 5.0, 23, hmap, 0.5, 5.5, 0.25, CASTLE_CLEAR),
    [hmap]
  );

  // ── Rocks — on slopes and mountain base ───────────────────────────────
  const rocks = useMemo(
    () => scatter(45, 5.5, 31, hmap, 1.0, 24, 0.9, CASTLE_CLEAR),
    [hmap]
  );

  return (
    <group>
      {/* Mountain pines */}
      {mountainTrees.map(([wx, wy, wz], i) => {
        const model = PINE_MODELS[i % PINE_MODELS.length];
        const rot   = (i * 137.508) * (Math.PI / 180);
        const sc    = 0.9 + ((i * 0.317) % 1) * 0.5;   // 0.9–1.4 — match castle scale
        return (
          <NatureModel
            key={`mt-${i}`}
            url={model}
            position={[wx, wy, wz]}
            rotation={rot}
            scale={sc}
            sway
            leafColor={PINE_COLORS[i % PINE_COLORS.length]}
          />
        );
      })}

      {/* Plain pines */}
      {plainTrees.map(([wx, wy, wz], i) => {
        const model = PINE_MODELS[i % PINE_MODELS.length];
        const rot   = (i * 113.5) * (Math.PI / 180);
        const sc    = 0.8 + ((i * 0.213) % 1) * 0.45;
        return (
          <NatureModel
            key={`pl-${i}`}
            url={model}
            position={[wx, wy, wz]}
            rotation={rot}
            scale={sc}
            sway
            leafColor={PINE_COLORS[(i + 2) % PINE_COLORS.length]}
          />
        );
      })}

      {/* Oaks */}
      {oakTrees.map(([wx, wy, wz], i) => {
        const model = OAK_MODELS[i % OAK_MODELS.length];
        const rot   = (i * 91.7) * (Math.PI / 180);
        const sc    = 0.75 + ((i * 0.41) % 1) * 0.4;
        return (
          <NatureModel
            key={`oak-${i}`}
            url={model}
            position={[wx, wy, wz]}
            rotation={rot}
            scale={sc}
            sway
            leafColor={new THREE.Color(0.28, 0.50, 0.10)}
          />
        );
      })}

      {/* Rocks */}
      {rocks.map(([wx, wy, wz], i) => {
        const model = ROCK_MODELS[i % ROCK_MODELS.length];
        const rot   = (i * 77.3) * (Math.PI / 180);
        const sc    = 0.5 + ((i * 0.53) % 1) * 0.9;
        return (
          <NatureModel
            key={`rk-${i}`}
            url={model}
            position={[wx, wy, wz]}
            rotation={rot}
            scale={sc}
            sway={false}
          />
        );
      })}
    </group>
  );
}
