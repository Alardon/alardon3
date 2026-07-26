"use client";

import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { worldHeight } from "./WorldNoise";

// ─────────────────────────────────────────────────────────────────────────────
// Castle at world (0, y, 10) — flat plain south of origin.
// All elements scaled so height ≈ 30× tree model height (matching NatureChunk).
// ─────────────────────────────────────────────────────────────────────────────

const CX = 0;
const CZ = 10;

// Colour palette
const STONE   = "#8c7c6a";
const STONE2  = "#a89880";
const ROOF    = "#6b3a2a";
const DARK    = "#4c3e2e";
const TOWER_C = "#7a6d5e";

// ── House ─────────────────────────────────────────────────────────────────────
function House({
  position,
  scale = 1,
  roofColor = ROOF,
}: {
  position: [number, number, number];
  scale?: number;
  roofColor?: string;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.0, 3.0, 3.5]} />
        <meshStandardMaterial color={STONE2} roughness={0.88} metalness={0.02} />
      </mesh>
      <mesh position={[0, 3.6, 0]} castShadow>
        <cylinderGeometry args={[0, 2.8, 1.8, 4, 1]} />
        <meshStandardMaterial color={roofColor} roughness={0.80} />
      </mesh>
      <mesh position={[0, 0.8, 1.76]}>
        <boxGeometry args={[0.8, 1.5, 0.07]} />
        <meshStandardMaterial color={DARK} roughness={1.0} />
      </mesh>
    </group>
  );
}

// ── Townhall ──────────────────────────────────────────────────────────────────
function Townhall({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 3.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[8.0, 6.0, 6.5]} />
        <meshStandardMaterial color={STONE} roughness={0.85} metalness={0.02} />
      </mesh>
      <mesh position={[0, 7.2, 0]} castShadow>
        <cylinderGeometry args={[0, 5.2, 3.5, 4, 1]} />
        <meshStandardMaterial color="#4a2a1a" roughness={0.75} />
      </mesh>
      {/* Flagpole */}
      <mesh position={[0, 12.0, 0]}>
        <cylinderGeometry args={[0.10, 0.10, 4.5, 5]} />
        <meshStandardMaterial color="#806040" roughness={1.0} />
      </mesh>
      <mesh position={[0.9, 13.8, 0]}>
        <planeGeometry args={[1.8, 1.1]} />
        <meshStandardMaterial color="#9b2020" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      {/* Steps */}
      <mesh position={[0, 0.2, 3.3]} receiveShadow>
        <boxGeometry args={[4.5, 0.4, 1.0]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
    </group>
  );
}

// ── Tower ─────────────────────────────────────────────────────────────────────
function Tower({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 5.0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.4, 1.7, 10.0, 8]} />
        <meshStandardMaterial color={TOWER_C} roughness={0.90} metalness={0.02} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.45, 10.8, Math.sin(a) * 1.45]} castShadow>
            <boxGeometry args={[0.45, 0.75, 0.45]} />
            <meshStandardMaterial color={TOWER_C} roughness={0.95} />
          </mesh>
        );
      })}
      <mesh position={[0, 12.2, 0]} castShadow>
        <coneGeometry args={[1.75, 3.0, 8]} />
        <meshStandardMaterial color={ROOF} roughness={0.76} />
      </mesh>
    </group>
  );
}

// ── Wall segment (animated on click) ─────────────────────────────────────────
function WallSegment({
  position,
  rotation = 0,
  destroyed,
  onClick,
}: {
  position: [number, number, number];
  rotation?: number;
  destroyed: boolean;
  onClick: () => void;
}) {
  const bodyRef       = useRef<THREE.Group>(null!);
  const animT         = useRef(0);
  const prevDestroyed = useRef(false);

  useFrame((_, dt) => {
    if (destroyed !== prevDestroyed.current) {
      prevDestroyed.current = destroyed;
      animT.current = 0;
    }
    if (destroyed && animT.current < 1) animT.current = Math.min(1, animT.current + dt * 2.5);
    if (bodyRef.current) {
      const t  = animT.current;
      const sy = destroyed ? Math.max(0.28, 1 - t * 0.72) : 1;
      const tx = destroyed ? t * 0.5 : 0;
      bodyRef.current.scale.set(1, sy, 1);
      bodyRef.current.rotation.set(tx, 0, 0);
      bodyRef.current.position.setY(1.8 * sy);
    }
  });

  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={bodyRef} position={[0, 1.8, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[4.5, 3.6, 0.85]} />
          <meshStandardMaterial color={destroyed ? "#5a4a38" : STONE} roughness={0.95} />
        </mesh>
      </group>
      {!destroyed && [-1.2, 0, 1.2].map((ox, i) => (
        <mesh key={i} position={[ox, 3.8, 0]} castShadow>
          <boxGeometry args={[0.75, 0.65, 0.85]} />
          <meshStandardMaterial color={STONE} roughness={0.95} />
        </mesh>
      ))}
      {destroyed && (
        <>
          <mesh position={[-1.1, 0.25, 0.5]} rotation={[0.3, 0.4, 0.25]} castShadow>
            <boxGeometry args={[1.0, 0.55, 0.70]} />
            <meshStandardMaterial color="#4a3a28" roughness={1.0} />
          </mesh>
          <mesh position={[0.8, 0.20, -0.4]} rotation={[-0.2, 0.5, 0.15]} castShadow>
            <boxGeometry args={[0.80, 0.42, 0.55]} />
            <meshStandardMaterial color="#4a3a28" roughness={1.0} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ── Settlement root ───────────────────────────────────────────────────────────
export default function Settlement({ hmap }: { hmap: Float32Array | null }) {
  const [brokenWall, setBrokenWall] = useState<number | null>(null);

  // Use worldHeight directly (chunk world)
  const h = (wx: number, wz: number) => worldHeight(wx, wz);

  const baseY = useMemo(() => h(CX, CZ), []);

  const WALL_R = 14;  // wall ring radius in world units

  const wallDefs = useMemo(() => {
    const defs: { pos: [number, number, number]; rot: number; clickable: boolean }[] = [];
    for (const ox of [-4.5, 0, 4.5]) {
      defs.push({ pos: [CX + ox, h(CX + ox, CZ - WALL_R), CZ - WALL_R], rot: 0, clickable: ox === 0 });
    }
    for (const ox of [-4.5, 0, 4.5]) {
      defs.push({ pos: [CX + ox, h(CX + ox, CZ + WALL_R), CZ + WALL_R], rot: 0, clickable: false });
    }
    for (const oz of [-4.5, 0, 4.5]) {
      defs.push({ pos: [CX + WALL_R, h(CX + WALL_R, CZ + oz), CZ + oz], rot: Math.PI / 2, clickable: false });
    }
    for (const oz of [-4.5, 0, 4.5]) {
      defs.push({ pos: [CX - WALL_R, h(CX - WALL_R, CZ + oz), CZ + oz], rot: Math.PI / 2, clickable: false });
    }
    return defs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hy = {
    house1: useMemo(() => h(CX - 6,  CZ - 4), []),
    house2: useMemo(() => h(CX + 6,  CZ + 4), []),
    house3: useMemo(() => h(CX - 4,  CZ + 5), []),
    house4: useMemo(() => h(CX + 5,  CZ - 5), []),
    towerNE: useMemo(() => h(CX + WALL_R + 1, CZ - WALL_R - 1), []),
    towerNW: useMemo(() => h(CX - WALL_R - 1, CZ - WALL_R - 1), []),
    towerSE: useMemo(() => h(CX + WALL_R + 1, CZ + WALL_R + 1), []),
    towerSW: useMemo(() => h(CX - WALL_R - 1, CZ + WALL_R + 1), []),
  };

  return (
    <group>
      <Townhall position={[CX, baseY, CZ]} />
      <House position={[CX - 6,  hy.house1, CZ - 4]} scale={1.0}  roofColor="#7a3a22" />
      <House position={[CX + 6,  hy.house2, CZ + 4]} scale={0.92} roofColor="#5a3318" />
      <House position={[CX - 4,  hy.house3, CZ + 5]} scale={1.05} roofColor="#6b4028" />
      <House position={[CX + 5,  hy.house4, CZ - 5]} scale={0.88} roofColor="#7a3a22" />
      <Tower position={[CX + WALL_R + 1, hy.towerNE, CZ - WALL_R - 1]} />
      <Tower position={[CX - WALL_R - 1, hy.towerNW, CZ - WALL_R - 1]} />
      <Tower position={[CX + WALL_R + 1, hy.towerSE, CZ + WALL_R + 1]} />
      <Tower position={[CX - WALL_R - 1, hy.towerSW, CZ + WALL_R + 1]} />

      {wallDefs.map((d, i) => (
        <WallSegment
          key={i}
          position={d.pos}
          rotation={d.rot}
          destroyed={brokenWall === i}
          onClick={() => { if (d.clickable) setBrokenWall(i); }}
        />
      ))}
    </group>
  );
}
