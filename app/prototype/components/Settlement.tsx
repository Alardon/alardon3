"use client";

import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getHeightAt } from "./Terrain";

interface SettlementProps {
  hmap: Float32Array;
}

const STONE_COLOR = "#8c7c6a";
const ROOF_COLOR  = "#6b3a2a";
const WALL_COLOR  = "#a89880";
const TOWER_COLOR = "#7a6d5e";
const GATE_COLOR  = "#5c4e3d";

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
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 2.4, 2.8]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.95, 0]} castShadow>
        <cylinderGeometry args={[0, 2.0, 1.6, 4, 1]} />
        <meshStandardMaterial color={roofColor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.65, 1.41]}>
        <boxGeometry args={[0.8, 1.3, 0.05]} />
        <meshStandardMaterial color={GATE_COLOR} roughness={1.0} />
      </mesh>
    </group>
  );
}

function Townhall({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.5, 4.0, 4.5]} />
        <meshStandardMaterial color={STONE_COLOR} roughness={0.85} />
      </mesh>
      <mesh position={[0, 4.8, 0]} castShadow>
        <cylinderGeometry args={[0, 3.5, 2.2, 4, 1]} />
        <meshStandardMaterial color="#4a2a1a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 7.6, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 3.0, 6]} />
        <meshStandardMaterial color="#6b5a42" roughness={1.0} />
      </mesh>
      <mesh position={[0.55, 8.5, 0]}>
        <planeGeometry args={[1.1, 0.7]} />
        <meshStandardMaterial color="#9b2020" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
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
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.1, 7.4, Math.sin(a) * 1.1]} castShadow>
            <boxGeometry args={[0.3, 0.6, 0.3]} />
            <meshStandardMaterial color={TOWER_COLOR} roughness={0.95} />
          </mesh>
        );
      })}
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
  const groupBodyRef  = useRef<THREE.Group>(null!);
  const animTRef      = useRef(0);
  const prevDestroyed = useRef(false);

  useFrame((_, delta) => {
    if (destroyed !== prevDestroyed.current) {
      prevDestroyed.current = destroyed;
      animTRef.current = 0;
    }
    if (destroyed && animTRef.current < 1) {
      animTRef.current = Math.min(1, animTRef.current + delta * 3);
    }
    if (groupBodyRef.current) {
      const t      = animTRef.current;
      const scaleY = destroyed ? Math.max(0.35, 1 - t * 0.65) : 1;
      const tiltX  = destroyed ? t * 0.4 : 0;
      groupBodyRef.current.scale.set(1, scaleY, 1);
      groupBodyRef.current.rotation.set(tiltX, 0, 0);
      groupBodyRef.current.position.set(0, 1.2 * scaleY, 0);
    }
  });

  return (
    <group
      position={position}
      rotation={[0, rotation ?? 0, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={groupBodyRef} position={[0, 1.2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[3.0, 2.4, 0.6]} />
          <meshStandardMaterial
            color={destroyed ? "#5a4a38" : STONE_COLOR}
            roughness={0.95}
          />
        </mesh>
      </group>
      {!destroyed && [-0.9, 0, 0.9].map((ox, i) => (
        <mesh key={i} position={[ox, 2.7, 0]} castShadow>
          <boxGeometry args={[0.55, 0.5, 0.6]} />
          <meshStandardMaterial color={STONE_COLOR} roughness={0.95} />
        </mesh>
      ))}
      {destroyed && (
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
    </group>
  );
}

export default function Settlement({ hmap }: SettlementProps) {
  const [brokenWall, setBrokenWall] = useState<number | null>(null);

  const baseY = useMemo(() => getHeightAt(hmap, 0, 0), [hmap]);

  const wallDefs = useMemo(() => {
    const r = 9;
    const positions: { x: number; z: number; rot: number }[] = [
      { x:  0, z: -r, rot: 0 },
      { x:  3, z: -r, rot: 0 },
      { x: -3, z: -r, rot: 0 },
      { x:  0, z:  r, rot: 0 },
      { x:  3, z:  r, rot: 0 },
      { x: -3, z:  r, rot: 0 },
      { x:  r, z:  0, rot: Math.PI / 2 },
      { x:  r, z:  3, rot: Math.PI / 2 },
      { x:  r, z: -3, rot: Math.PI / 2 },
      { x: -r, z:  0, rot: Math.PI / 2 },
      { x: -r, z:  3, rot: Math.PI / 2 },
      { x: -r, z: -3, rot: Math.PI / 2 },
    ];
    return positions.map(({ x, z, rot }, i) => ({
      pos: [x, getHeightAt(hmap, x, z), z] as [number, number, number],
      rot,
      isClickable: i === 0,
    }));
  }, [hmap]);

  const h_house1 = useMemo(() => getHeightAt(hmap, -5, -3), [hmap]);
  const h_house2 = useMemo(() => getHeightAt(hmap,  5,  3), [hmap]);
  const h_house3 = useMemo(() => getHeightAt(hmap, -4,  4), [hmap]);
  const h_tower  = useMemo(() => getHeightAt(hmap,  9,  9), [hmap]);

  return (
    <group>
      <Townhall position={[0, baseY, 0]} />
      <House position={[-5, h_house1, -3]} scale={1.0} roofColor="#7a3a22" />
      <House position={[5,  h_house2,  3]} scale={0.9} roofColor="#5a3318" />
      <House position={[-4, h_house3,  4]} scale={1.1} roofColor="#6b4028" />
      <Tower position={[9, h_tower, 9]} />

      {wallDefs.map((def, i) => (
        <WallSegment
          key={i}
          position={def.pos}
          rotation={def.rot}
          destroyed={brokenWall === i}
          onClick={() => { if (def.isClickable) setBrokenWall(i); }}
        />
      ))}
    </group>
  );
}
