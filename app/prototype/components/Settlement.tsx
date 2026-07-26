"use client";

import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getHeightAt } from "./Terrain";

interface SettlementProps {
  hmap: Float32Array;
}

// Stone / timber material colors
const STONE_COLOR  = "#8c7c6a";
const ROOF_COLOR   = "#6b3a2a";
const WALL_COLOR   = "#a89880";
const TOWER_COLOR  = "#7a6d5e";
const GATE_COLOR   = "#5c4e3d";

function House({
  position,
  scale = 1,
  roofColor = ROOF_COLOR,
}: {
  position: [number, number, number];
  scale?: number;
  roofColor?: string;
}) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Walls */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 2.4, 2.8]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      {/* Roof ridge */}
      <mesh position={[0, 2.95, 0]} castShadow>
        <cylinderGeometry args={[0, 2.0, 1.6, 4, 1]} />
        <meshStandardMaterial color={roofColor} roughness={0.8} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.65, 1.41]} receiveShadow>
        <boxGeometry args={[0.8, 1.3, 0.05]} />
        <meshStandardMaterial color={GATE_COLOR} roughness={1.0} />
      </mesh>
    </group>
  );
}

function Townhall({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.5, 4.0, 4.5]} />
        <meshStandardMaterial color={STONE_COLOR} roughness={0.85} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 4.8, 0]} castShadow>
        <cylinderGeometry args={[0, 3.5, 2.2, 4, 1]} />
        <meshStandardMaterial color="#4a2a1a" roughness={0.7} />
      </mesh>
      {/* Banner pole */}
      <mesh position={[0, 7.6, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 3.0, 6]} />
        <meshStandardMaterial color="#6b5a42" roughness={1.0} />
      </mesh>
      {/* Banner */}
      <mesh position={[0.55, 8.5, 0]}>
        <planeGeometry args={[1.1, 0.7]} />
        <meshStandardMaterial color="#9b2020" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      {/* Steps */}
      <mesh position={[0, 0.2, 2.5]} receiveShadow>
        <boxGeometry args={[3.0, 0.4, 0.8]} />
        <meshStandardMaterial color={STONE_COLOR} roughness={0.95} />
      </mesh>
    </group>
  );
}

function Tower({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.1, 1.3, 7.0, 8]} />
        <meshStandardMaterial color={TOWER_COLOR} roughness={0.9} />
      </mesh>
      {/* Battlements */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.1, 7.4, Math.sin(a) * 1.1]}
            castShadow
          >
            <boxGeometry args={[0.3, 0.6, 0.3]} />
            <meshStandardMaterial color={TOWER_COLOR} roughness={0.95} />
          </mesh>
        );
      })}
      {/* Conical roof */}
      <mesh position={[0, 8.1, 0]} castShadow>
        <coneGeometry args={[1.3, 2.2, 8]} />
        <meshStandardMaterial color={ROOF_COLOR} roughness={0.75} />
      </mesh>
    </group>
  );
}

function WallSegment({
  position,
  rotation,
  destroyed,
  onClick,
}: {
  position: [number, number, number];
  rotation?: number;
  destroyed: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [animT, setAnimT] = useState(0);
  const [wasDestroyed, setWasDestroyed] = useState(false);

  useFrame((_, delta) => {
    if (destroyed && animT < 1) {
      const next = Math.min(1, animT + delta * 3);
      setAnimT(next);
    }
    if (destroyed !== wasDestroyed) {
      setWasDestroyed(destroyed);
      setAnimT(0);
    }
  });

  const scaleY = destroyed ? Math.max(0.35, 1 - animT * 0.65) : 1;
  const tiltX = destroyed ? animT * 0.4 : 0;

  return (
    <group
      position={position}
      rotation={[0, rotation ?? 0, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Wall body */}
      <mesh
        ref={meshRef}
        position={[0, 1.2 * scaleY, 0]}
        rotation={[tiltX, 0, 0]}
        scale={[1, scaleY, 1]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[3.0, 2.4, 0.6]} />
        <meshStandardMaterial
          color={destroyed ? "#5a4a38" : STONE_COLOR}
          roughness={0.95}
        />
      </mesh>
      {/* Battlements on top if intact */}
      {!destroyed && [-0.9, 0, 0.9].map((ox, i) => (
        <mesh key={i} position={[ox, 2.7, 0]} castShadow>
          <boxGeometry args={[0.55, 0.5, 0.6]} />
          <meshStandardMaterial color={STONE_COLOR} roughness={0.95} />
        </mesh>
      ))}
      {/* Rubble if destroyed */}
      {destroyed && animT > 0.5 && (
        <>
          <mesh position={[-0.8, 0.2, 0.4]} rotation={[0.5, 0.3, 0.2]} castShadow>
            <boxGeometry args={[0.7, 0.4, 0.5]} />
            <meshStandardMaterial color="#4a3a28" roughness={1.0} />
          </mesh>
          <mesh position={[0.6, 0.15, -0.3]} rotation={[-0.3, 0.7, 0.1]} castShadow>
            <boxGeometry args={[0.5, 0.3, 0.4]} />
            <meshStandardMaterial color="#4a3a28" roughness={1.0} />
          </mesh>
        </>
      )}
      {/* Click hint outline for intact segment */}
      {!destroyed && (
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[3.05, 2.45, 0.65]} />
          <meshStandardMaterial
            color="#ffcc44"
            transparent
            opacity={0.0}
            wireframe
          />
        </mesh>
      )}
    </group>
  );
}

export default function Settlement({ hmap }: SettlementProps) {
  const [brokenWall, setBrokenWall] = useState<number | null>(null);

  // Place buildings at center of map
  const baseY = useMemo(() => getHeightAt(hmap, 0, 0), [hmap]);

  // wall layout: ring around townhall
  const wallDefs = useMemo(() => {
    const defs: { pos: [number, number, number]; rot: number; isClickable: boolean }[] = [];
    const r = 9;
    // N, S, E, W sides + corners
    const positions: { x: number; z: number; rot: number }[] = [
      { x:  0,  z: -r, rot: 0 },
      { x:  3,  z: -r, rot: 0 },
      { x: -3,  z: -r, rot: 0 },
      { x:  0,  z:  r, rot: 0 },
      { x:  3,  z:  r, rot: 0 },
      { x: -3,  z:  r, rot: 0 },
      { x:  r,  z:  0, rot: Math.PI / 2 },
      { x:  r,  z:  3, rot: Math.PI / 2 },
      { x:  r,  z: -3, rot: Math.PI / 2 },
      { x: -r,  z:  0, rot: Math.PI / 2 },
      { x: -r,  z:  3, rot: Math.PI / 2 },
      { x: -r,  z: -3, rot: Math.PI / 2 },
    ];
    positions.forEach(({ x, z, rot }, i) => {
      const h = getHeightAt(hmap, x, z);
      defs.push({ pos: [x, h, z], rot, isClickable: i === 0 });
    });
    return defs;
  }, [hmap]);

  const h_house1 = getHeightAt(hmap, -5, -3);
  const h_house2 = getHeightAt(hmap, 5, 3);
  const h_house3 = getHeightAt(hmap, -4, 4);
  const h_tower  = getHeightAt(hmap, 9, 9);

  return (
    <group>
      <Townhall position={[0, baseY, 0]} />
      <House position={[-5, h_house1, -3]} scale={1.0} roofColor="#7a3a22" />
      <House position={[5, h_house2, 3]} scale={0.9} roofColor="#5a3318" />
      <House position={[-4, h_house3, 4]} scale={1.1} roofColor="#6b4028" />
      <Tower position={[9, h_tower, 9]} />

      {wallDefs.map((def, i) => (
        <WallSegment
          key={i}
          position={def.pos}
          rotation={def.rot}
          destroyed={brokenWall === i}
          onClick={() => {
            if (def.isClickable) setBrokenWall(i);
          }}
        />
      ))}

      {/* Click hint label in 3D space */}
      {brokenWall === null && (
        <mesh position={[0, baseY + 5.5, -9.5]}>
          <planeGeometry args={[5, 0.8]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
    </group>
  );
}
