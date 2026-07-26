"use client";

import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getHeightAt } from "./Terrain";

// ─────────────────────────────────────────────────────────────────────────────
// Castle sits on the flat plain at world (0, y, 10).
// All elements are scaled so their height matches a tree (~3-5 units tall).
// ─────────────────────────────────────────────────────────────────────────────

const CX = 0;   // castle centre X
const CZ = 10;  // castle centre Z (plain side, away from mountain)

const STONE  = "#8c7c6a";
const STONE2 = "#a89880";
const ROOF   = "#6b3a2a";
const DARK   = "#5c4e3d";
const TOWER_C = "#7a6d5e";

// ── Individual building components (all ~3-5 units tall to match trees) ──────

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
      {/* walls */}
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 2.0, 2.4]} />
        <meshStandardMaterial color={STONE2} roughness={0.88} metalness={0.02} />
      </mesh>
      {/* roof */}
      <mesh position={[0, 2.45, 0]} castShadow>
        <cylinderGeometry args={[0, 1.9, 1.2, 4, 1]} />
        <meshStandardMaterial color={roofColor} roughness={0.82} />
      </mesh>
      {/* door */}
      <mesh position={[0, 0.55, 1.21]}>
        <boxGeometry args={[0.6, 1.1, 0.05]} />
        <meshStandardMaterial color={DARK} roughness={1.0} />
      </mesh>
    </group>
  );
}

function Townhall({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* main hall */}
      <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.0, 3.5, 4.0]} />
        <meshStandardMaterial color={STONE} roughness={0.85} metalness={0.02} />
      </mesh>
      {/* pitched roof */}
      <mesh position={[0, 4.25, 0]} castShadow>
        <cylinderGeometry args={[0, 3.2, 2.0, 4, 1]} />
        <meshStandardMaterial color="#4a2a1a" roughness={0.75} />
      </mesh>
      {/* flagpole */}
      <mesh position={[0, 6.8, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 2.6, 5]} />
        <meshStandardMaterial color="#7a6040" roughness={1.0} />
      </mesh>
      {/* flag */}
      <mesh position={[0.55, 7.8, 0]}>
        <planeGeometry args={[1.0, 0.65]} />
        <meshStandardMaterial color="#9b2020" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      {/* steps */}
      <mesh position={[0, 0.12, 2.1]} receiveShadow>
        <boxGeometry args={[2.8, 0.25, 0.7]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
    </group>
  );
}

function Tower({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* shaft */}
      <mesh position={[0, 2.8, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1.1, 5.6, 8]} />
        <meshStandardMaterial color={TOWER_C} roughness={0.9} metalness={0.02} />
      </mesh>
      {/* battlements */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.9, 6.0, Math.sin(a) * 0.9]} castShadow>
            <boxGeometry args={[0.28, 0.45, 0.28]} />
            <meshStandardMaterial color={TOWER_C} roughness={0.95} />
          </mesh>
        );
      })}
      {/* conical roof */}
      <mesh position={[0, 6.8, 0]} castShadow>
        <coneGeometry args={[1.1, 1.8, 8]} />
        <meshStandardMaterial color={ROOF} roughness={0.78} />
      </mesh>
    </group>
  );
}

// ── Animated wall segment ────────────────────────────────────────────────────
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
  const bodyRef      = useRef<THREE.Group>(null!);
  const animT        = useRef(0);
  const prevDestroyed = useRef(false);

  useFrame((_, dt) => {
    if (destroyed !== prevDestroyed.current) {
      prevDestroyed.current = destroyed;
      animT.current = 0;
    }
    if (destroyed && animT.current < 1) animT.current = Math.min(1, animT.current + dt * 3);
    if (bodyRef.current) {
      const t  = animT.current;
      const sy = destroyed ? Math.max(0.3, 1 - t * 0.70) : 1;
      const tx = destroyed ? t * 0.45 : 0;
      bodyRef.current.scale.set(1, sy, 1);
      bodyRef.current.rotation.set(tx, 0, 0);
      bodyRef.current.position.set(0, 1.0 * sy, 0);
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <group ref={bodyRef} position={[0, 1.0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.8, 2.0, 0.55]} />
          <meshStandardMaterial color={destroyed ? "#5a4a38" : STONE} roughness={0.95} />
        </mesh>
      </group>
      {!destroyed && [-0.75, 0, 0.75].map((ox, i) => (
        <mesh key={i} position={[ox, 2.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.42, 0.55]} />
          <meshStandardMaterial color={STONE} roughness={0.95} />
        </mesh>
      ))}
      {destroyed && (
        <>
          <mesh position={[-0.7, 0.18, 0.35]} rotation={[0.4, 0.3, 0.2]} castShadow>
            <boxGeometry args={[0.6, 0.35, 0.45]} />
            <meshStandardMaterial color="#4a3a28" roughness={1.0} />
          </mesh>
          <mesh position={[0.5, 0.14, -0.25]} rotation={[-0.3, 0.6, 0.1]} castShadow>
            <boxGeometry args={[0.5, 0.28, 0.38]} />
            <meshStandardMaterial color="#4a3a28" roughness={1.0} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ── Settlement ───────────────────────────────────────────────────────────────
export default function Settlement({ hmap }: { hmap: Float32Array }) {
  const [brokenWall, setBrokenWall] = useState<number | null>(null);

  const baseY = useMemo(() => getHeightAt(hmap, CX, CZ), [hmap]);

  // Wall ring radius matches house scale
  const WALL_R = 8;

  const wallDefs = useMemo(() => {
    const defs: { pos: [number, number, number]; rot: number; clickable: boolean }[] = [];
    // North side (z = CZ - WALL_R)
    for (const ox of [-3, 0, 3]) {
      defs.push({
        pos: [CX + ox, getHeightAt(hmap, CX + ox, CZ - WALL_R), CZ - WALL_R],
        rot: 0,
        clickable: ox === 0,
      });
    }
    // South side (z = CZ + WALL_R)
    for (const ox of [-3, 0, 3]) {
      defs.push({
        pos: [CX + ox, getHeightAt(hmap, CX + ox, CZ + WALL_R), CZ + WALL_R],
        rot: 0,
        clickable: false,
      });
    }
    // East side (x = CX + WALL_R)
    for (const oz of [-3, 0, 3]) {
      defs.push({
        pos: [CX + WALL_R, getHeightAt(hmap, CX + WALL_R, CZ + oz), CZ + oz],
        rot: Math.PI / 2,
        clickable: false,
      });
    }
    // West side (x = CX - WALL_R)
    for (const oz of [-3, 0, 3]) {
      defs.push({
        pos: [CX - WALL_R, getHeightAt(hmap, CX - WALL_R, CZ + oz), CZ + oz],
        rot: Math.PI / 2,
        clickable: false,
      });
    }
    return defs;
  }, [hmap]);

  const h = {
    hall:   baseY,
    house1: useMemo(() => getHeightAt(hmap, CX - 4, CZ - 2), [hmap]),
    house2: useMemo(() => getHeightAt(hmap, CX + 4, CZ + 2), [hmap]),
    house3: useMemo(() => getHeightAt(hmap, CX - 3, CZ + 3), [hmap]),
    towerNE: useMemo(() => getHeightAt(hmap, CX + WALL_R + 0.5, CZ - WALL_R - 0.5), [hmap]),
    towerSW: useMemo(() => getHeightAt(hmap, CX - WALL_R - 0.5, CZ + WALL_R + 0.5), [hmap]),
  };

  return (
    <group>
      <Townhall position={[CX, h.hall, CZ]} />
      <House position={[CX - 4, h.house1, CZ - 2]} scale={0.95} roofColor="#7a3a22" />
      <House position={[CX + 4, h.house2, CZ + 2]} scale={0.88} roofColor="#5a3318" />
      <House position={[CX - 3, h.house3, CZ + 3]} scale={1.0}  roofColor="#6b4028" />
      <Tower position={[CX + WALL_R + 0.5, h.towerNE, CZ - WALL_R - 0.5]} />
      <Tower position={[CX - WALL_R - 0.5, h.towerSW, CZ + WALL_R + 0.5]} />

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
