"use client";

import { Suspense, useRef, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import Terrain from "./Terrain";
import Nature from "./Nature";
import Settlement from "./Settlement";
import Units from "./SpriteBillboard";

// RTS camera constraints
const MIN_POLAR = THREE.MathUtils.degToRad(32);
const MAX_POLAR = THREE.MathUtils.degToRad(62);
const MIN_DISTANCE = 18;
const MAX_DISTANCE = 90;

function RTSCamera() {
  const controlsRef = useRef<CameraControls>(null!);

  return (
    <CameraControls
      ref={controlsRef}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      dollySpeed={0.8}
      truckSpeed={2.5}
      smoothTime={0.25}
      draggingSmoothTime={0.1}
    />
  );
}

function Lighting() {
  return (
    <>
      {/* Golden-hour directional light */}
      <directionalLight
        position={[60, 50, 30]}
        intensity={2.2}
        color="#ffd27a"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-radius={3}
        shadow-bias={-0.001}
      />
      {/* Ambient fill */}
      <hemisphereLight
        args={["#b8d4ff", "#4a3820", 0.8]}
      />
      {/* Subtle rim from opposite side */}
      <directionalLight
        position={[-40, 20, -20]}
        intensity={0.3}
        color="#a0b8e0"
      />
    </>
  );
}

function WorldContent({ onHeightmapReady }: { onHeightmapReady: (h: Float32Array) => void }) {
  const [hmap, setHmap] = useState<Float32Array | null>(null);

  const handleHeightmap = useCallback(
    (h: Float32Array) => {
      setHmap(h);
      onHeightmapReady(h);
    },
    [onHeightmapReady]
  );

  return (
    <>
      <Terrain onHeightmapReady={handleHeightmap} />
      {hmap && (
        <>
          <Nature hmap={hmap} />
          <Settlement hmap={hmap} />
          <Units hmap={hmap} />
        </>
      )}
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#4a3820" />
    </mesh>
  );
}

export default function Scene() {
  const [hmapReady, setHmapReady] = useState(false);
  const onHmapReady = useCallback(() => setHmapReady(true), []);

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows={{ type: THREE.VSMShadowMap }}
        camera={{
          fov: 45,
          near: 0.5,
          far: 1000,
          position: [0, 40, 60],
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          antialias: true,
          powerPreference: "high-performance",
        }}
        className="w-full h-full"
      >
        <Suspense fallback={<LoadingFallback />}>
          <Environment preset="sunset" background blur={0.04} />
          <Lighting />
          <RTSCamera />
          <WorldContent onHeightmapReady={onHmapReady} />
        </Suspense>
      </Canvas>

      {/* HUD overlay */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="bg-black/50 border border-yellow-700/50 rounded px-3 py-2">
          <h1 className="font-serif text-yellow-300 text-lg tracking-widest uppercase">
            Alardon
          </h1>
          <p className="font-sans text-stone-300 text-xs mt-0.5 tracking-wide">
            World Prototype
          </p>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-black/50 border border-stone-700/50 rounded px-4 py-2 text-center">
          <p className="font-sans text-stone-400 text-xs tracking-wide">
            Drag to rotate &nbsp;·&nbsp; Scroll to zoom &nbsp;·&nbsp; Right-drag to pan
          </p>
          <p className="font-sans text-yellow-500/80 text-xs mt-0.5">
            Click the north wall segment to break it
          </p>
        </div>
      </div>

      {/* Loading indicator */}
      {!hmapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-950/80 pointer-events-none">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-serif text-yellow-300 text-sm tracking-widest uppercase">
              Generating World...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
