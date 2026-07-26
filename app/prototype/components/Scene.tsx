"use client";

import { Suspense, useRef, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import Terrain from "./Terrain";
import Nature from "./Nature";
import Settlement from "./Settlement";
import Units from "./SpriteBillboard";

const MIN_POLAR   = THREE.MathUtils.degToRad(28);
const MAX_POLAR   = THREE.MathUtils.degToRad(65);
const MIN_DISTANCE = 16;
const MAX_DISTANCE = 110;

// ── RTS camera ────────────────────────────────────────────────────────────────
function RTSCamera() {
  const ref = useRef<CameraControls>(null!);
  return (
    <CameraControls
      ref={ref}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      dollySpeed={0.9}
      truckSpeed={2.8}
      smoothTime={0.22}
      draggingSmoothTime={0.08}
    />
  );
}

// ── Lighting — golden-hour sun + atmosphere ───────────────────────────────────
// Sun position: azimuth from the south-east, elevation ~25° (long shadows)
const SUN_POSITION = new THREE.Vector3(80, 55, 45).normalize();

function Lighting() {
  return (
    <>
      {/* Primary sun — warm golden light, sharp long shadows */}
      <directionalLight
        position={[80, 55, 45]}
        intensity={3.2}
        color="#ffe8b0"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
        shadow-radius={2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      {/* Sky hemisphere — cool blue sky / warm brown earth */}
      <hemisphereLight
        args={["#aac8f8", "#5a3d22", 1.1]}
      />

      {/* Soft fill from opposite side (blue-sky bounce) */}
      <directionalLight
        position={[-50, 30, -25]}
        intensity={0.55}
        color="#90b8e8"
      />

      {/* Subtle ground bounce (warm) */}
      <directionalLight
        position={[0, -10, 0]}
        intensity={0.18}
        color="#c8a870"
      />
    </>
  );
}

// ── World content ─────────────────────────────────────────────────────────────
function WorldContent({ onHeightmapReady }: { onHeightmapReady: (h: Float32Array) => void }) {
  const [hmap, setHmap] = useState<Float32Array | null>(null);

  const handleHeightmap = useCallback(
    (h: Float32Array) => { setHmap(h); onHeightmapReady(h); },
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

// ── Scene root ────────────────────────────────────────────────────────────────
export default function Scene() {
  const [hmapReady, setHmapReady] = useState(false);
  const onHmapReady = useCallback(() => setHmapReady(true), []);

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{
          fov: 42,
          near: 0.4,
          far: 1200,
          position: [0, 50, 80],
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          antialias: true,
          powerPreference: "high-performance",
        }}
        className="w-full h-full"
      >
        <Suspense fallback={<LoadingFallback />}>
          {/* Procedural sky + sun disc */}
          <Sky
            distance={6000}
            sunPosition={SUN_POSITION}
            inclination={0.36}
            azimuth={0.22}
            turbidity={7}
            rayleigh={1.8}
            mieCoefficient={0.004}
            mieDirectionalG={0.82}
          />

          <Lighting />
          <RTSCamera />
          <WorldContent onHeightmapReady={onHmapReady} />

          {/* Atmospheric fog */}
          <fog attach="fog" args={["#b8cce0", 120, 280]} />
        </Suspense>
      </Canvas>

      {/* HUD */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="bg-black/50 border border-yellow-700/50 rounded px-3 py-2">
          <h1 className="font-serif text-yellow-300 text-lg tracking-widest uppercase">Alardon</h1>
          <p className="font-sans text-stone-300 text-xs mt-0.5 tracking-wide">World Prototype</p>
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

      {/* Loading screen */}
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
