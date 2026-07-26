"use client";

import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";

// -------------------------------------------------------------------
// Spritesheet: 832×3456, 13 cols × 54 rows = 64×64 cells
// LPC-style layout:
//   Each action occupies 4 rows: [N, W, S, E] (top to bottom)
//   Action block start rows:
//     CAST(7f)=0, THRUST(8f)=4, WALK(9f)=8, SLASH(6f)=12,
//     SHOOT(13f)=16, HURT(6f)=20, IDLE(1f)=26?, DEATH(6f)=20
// -------------------------------------------------------------------

const SHEET_W = 832;
const SHEET_H = 3456;
const COLS = 13;
const ROWS = 54;
const CELL_W = SHEET_W / COLS;
const CELL_H = SHEET_H / ROWS;

const DIR_ROW: Record<string, number> = { n: 0, w: 1, s: 2, e: 3 };

const ACTION_ROW: Record<string, number> = {
  idle:   8,
  walk:   8,
  attack: 12,
  death:  20,
};

const ACTION_FRAMES: Record<string, number> = {
  idle:   1,
  walk:   9,
  attack: 6,
  death:  6,
};

const ACTION_SPEED: Record<string, number> = {
  idle:   0.5,
  walk:   0.1,
  attack: 0.12,
  death:  0.18,
};

function sectorToDir(sector: number): { dir: "n" | "w" | "s" | "e"; flipX: boolean } {
  const map: { dir: "n" | "w" | "s" | "e"; flipX: boolean }[] = [
    { dir: "n", flipX: false }, // 0 N
    { dir: "e", flipX: false }, // 1 NE
    { dir: "e", flipX: false }, // 2 E
    { dir: "e", flipX: false }, // 3 SE
    { dir: "s", flipX: false }, // 4 S
    { dir: "e", flipX: true  }, // 5 SW → flip E
    { dir: "w", flipX: false }, // 6 W
    { dir: "n", flipX: false }, // 7 NW
  ];
  return map[sector % 8];
}

export interface UnitDef {
  id: number;
  tint: THREE.Color;
  patrolPath: [number, number][];
}

// Each unit is its own component so they update individually
function UnitSprite({
  def,
  hmap,
}: {
  def: UnitDef;
  hmap: Float32Array;
}) {
  const { camera } = useThree();
  const groupRef  = useRef<THREE.Group>(null!);
  const meshRef   = useRef<THREE.Mesh>(null!);
  const matRef    = useRef<THREE.MeshBasicMaterial>(null!);

  // Animation state (refs = no re-render)
  const frameRef     = useRef(0);
  const timeAccRef   = useRef(0);
  const actionRef    = useRef<"idle" | "walk">("walk");

  // Patrol state
  const posRef       = useRef<THREE.Vector3>(null!);
  const wpIdxRef     = useRef(0);
  const facingRef    = useRef(0);

  // Height helper
  const SIZE = 200, GRID = 200;
  function heightAt(wx: number, wz: number) {
    const hx = ((wx + SIZE / 2) / SIZE) * GRID;
    const hz = ((wz + SIZE / 2) / SIZE) * GRID;
    const ix = Math.max(0, Math.min(GRID - 1, Math.floor(hx)));
    const iz = Math.max(0, Math.min(GRID - 1, Math.floor(hz)));
    const fx = hx - ix, fz = hz - iz;
    const h00 = hmap[iz * (GRID + 1) + ix];
    const h10 = hmap[iz * (GRID + 1) + (ix + 1)];
    const h01 = hmap[(iz + 1) * (GRID + 1) + ix];
    const h11 = hmap[(iz + 1) * (GRID + 1) + (ix + 1)];
    return h00 * (1-fx)*(1-fz) + h10*fx*(1-fz) + h01*(1-fx)*fz + h11*fx*fz;
  }

  // Init position
  if (!posRef.current) {
    const [wx, wz] = def.patrolPath[0];
    posRef.current = new THREE.Vector3(wx, heightAt(wx, wz), wz);
  }

  const sharedTex = useTexture("/assets/prototype/units/infantry/spritesheet.png");
  const tex = useMemo(() => {
    const t = sharedTex.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }, [sharedTex]);

  useEffect(() => {
    if (matRef.current) {
      matRef.current.map = tex;
      matRef.current.needsUpdate = true;
    }
  }, [tex]);

  useFrame((_, delta) => {
    if (!groupRef.current || !meshRef.current || !matRef.current) return;

    // --- Move unit along patrol ---
    const path = def.patrolPath;
    const [tx, tz] = path[wpIdxRef.current];
    const ty = heightAt(tx, tz);
    const pos = posRef.current;
    const dx = tx - pos.x, dz = tz - pos.z;
    const dist2 = dx * dx + dz * dz;

    if (dist2 < 0.4) {
      wpIdxRef.current = (wpIdxRef.current + 1) % path.length;
      actionRef.current = "idle";
    } else {
      const dist = Math.sqrt(dist2);
      const speed = 4.5 * delta;
      pos.x += (dx / dist) * speed;
      pos.z += (dz / dist) * speed;
      pos.y += (ty - pos.y) * 0.12;
      facingRef.current = Math.atan2(dx, dz);
      actionRef.current = "walk";
    }

    groupRef.current.position.copy(pos);

    // --- Billboard rotation ---
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const cameraAzimuth = Math.atan2(-camDir.x, -camDir.z);
    meshRef.current.rotation.set(0, cameraAzimuth + Math.PI, 0);

    // --- Sector ---
    const relAngle = facingRef.current - cameraAzimuth;
    const norm = ((relAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.round(norm / (Math.PI / 4)) % 8;
    const { dir, flipX } = sectorToDir(sector);

    // --- Advance frame ---
    const action = actionRef.current;
    const speed2 = ACTION_SPEED[action] ?? 0.15;
    timeAccRef.current += delta;
    if (timeAccRef.current >= speed2) {
      timeAccRef.current = 0;
      frameRef.current = (frameRef.current + 1) % (ACTION_FRAMES[action] ?? 4);
    }

    // --- UV ---
    const blockRow = ACTION_ROW[action] ?? 8;
    const dirRow   = DIR_ROW[dir] ?? 2;
    const sheetRow = blockRow + dirRow;
    const col      = frameRef.current % COLS;

    const scaleX = CELL_W / SHEET_W;
    const scaleY = CELL_H / SHEET_H;
    const offsetX = col * scaleX + (flipX ? scaleX : 0);
    const offsetY = 1.0 - (sheetRow + 1) * scaleY;

    tex.offset.set(offsetX, offsetY);
    tex.repeat.set(flipX ? -scaleX : scaleX, scaleY);
    matRef.current.needsUpdate = false; // texture update handled by Three.js
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        position={[0, 1.6, 0]}
        castShadow
        receiveShadow
      >
        <planeGeometry args={[2.0, 3.4]} />
        <meshBasicMaterial
          ref={matRef}
          map={tex}
          transparent
          alphaTest={0.15}
          side={THREE.DoubleSide}
          color={def.tint}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------------
// Patrol paths (world space X/Z, Y from heightmap)
// -------------------------------------------------------------------
// Patrols centred around castle at (0, 10) on the plain
const PATROL_PATHS: [number, number][][] = [
  [[-18, 2], [-8, -4], [8, -4], [18, 2], [12, 18], [-6, 22]],
  [[20, 8], [12, 22], [-4, 24], [-16, 16], [-18, 4], [4, 0]],
  [[-14, 6], [-6, -2], [10, 0], [18, 10], [10, 22], [-6, 18]],
  [[6, -6], [18, 0], [16, 18], [4, 26], [-10, 20], [-16, 8]],
  [[-10, 12], [-18, 6], [-12, -2], [4, -4], [14, 6], [8, 20]],
];

const UNIT_TINTS = [
  new THREE.Color(0xaabbff),
  new THREE.Color(0xff9999),
  new THREE.Color(0x99ffbb),
  new THREE.Color(0xffdd88),
  new THREE.Color(0xddaaff),
];

const UNIT_DEFS: UnitDef[] = PATROL_PATHS.map((path, i) => ({
  id: i,
  tint: UNIT_TINTS[i],
  patrolPath: path,
}));

export default function Units({ hmap }: { hmap: Float32Array }) {
  return (
    <>
      {UNIT_DEFS.map((def) => (
        <UnitSprite key={def.id} def={def} hmap={hmap} />
      ))}
    </>
  );
}
