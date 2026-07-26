"use client";

import { Suspense, useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";
import ChunkManager from "./ChunkManager";
import FreeCamera from "./FreeCamera";
import Settlement from "./Settlement";

// ── Sun direction ─────────────────────────────────────────────────────────────
const SUN = new THREE.Vector3(0.55, 0.85, 0.35).normalize();

// ── Lighting ──────────────────────────────────────────────────────────────────
function Lighting() {
  return (
    <>
      {/* Primary sun — warm golden, long cascaded shadows */}
      <directionalLight
        position={[110, 140, 70]}
        intensity={3.8}
        color="#ffe0a0"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-radius={3}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
      />
      {/* Sky hemisphere */}
      <hemisphereLight args={["#a8c8f8", "#503820", 1.4]} />
      {/* Cool blue fill (sky bounce) */}
      <directionalLight position={[-80, 40, -40]} intensity={0.65} color="#80aae0" />
      {/* Warm ground bounce */}
      <directionalLight position={[0, -8, 0]} intensity={0.22} color="#c8a060" />
    </>
  );
}

// ── Static scene objects (castle) ─────────────────────────────────────────────
function WorldObjects() {
  // Settlement needs hmap — pass null initially; it will snap once terrain loads
  // For chunk system, Settlement at (0, 0) chunk uses worldHeight directly
  return <Settlement hmap={null} />;
}

// ── Loading fallback ───────────────────────────────────────────────────────────
function LoadingBox() {
  return (
    <mesh position={[0, 2, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshBasicMaterial color="#4a3820" />
    </mesh>
  );
}

// ── Main Scene ─────────────────────────────────────────────────────────────────
export default function Scene() {
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleChunkLoaded = useCallback(
    (_cx: number, _cz: number, _hmap: Float32Array) => {
      // Could be used to notify Settlement etc. in the future
    },
    []
  );

  return (
    <div ref={canvasRef} className="w-full h-full relative" tabIndex={0}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{
          fov: 70,
          near: 0.5,
          far: 900,
          position: [32, 22, 50],  // start looking over the settlement
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
          antialias: true,
          powerPreference: "high-performance",
        }}
        className="w-full h-full"
      >
        <Suspense fallback={<LoadingBox />}>
          <Sky
            distance={8000}
            sunPosition={SUN}
            inclination={0.35}
            azimuth={0.24}
            turbidity={6}
            rayleigh={1.6}
            mieCoefficient={0.003}
            mieDirectionalG={0.84}
          />

          <Lighting />
          <FreeCamera />
          <ChunkManager onChunkLoaded={handleChunkLoaded} />
          <WorldObjects />

          {/* Exponential fog — hides distant chunk edges smoothly */}
          <fogExp2 attach="fog" args={["#b8cedc", 0.008]} />
        </Suspense>
      </Canvas>

      {/* HUD overlay */}
      <div className="absolute top-4 left-4 pointer-events-none select-none">
        <div className="bg-black/55 border border-yellow-700/40 rounded px-3 py-2">
          <h1 className="font-serif text-yellow-300 text-lg tracking-widest uppercase">Alardon</h1>
          <p className="font-sans text-stone-300 text-xs mt-0.5 tracking-wide">World Prototype</p>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none select-none">
        <div className="bg-black/55 border border-stone-700/40 rounded px-4 py-2 text-center space-y-0.5">
          <p className="font-sans text-stone-300 text-xs tracking-wide">
            <span className="text-yellow-400">WASD</span> — move &nbsp;
            <span className="text-yellow-400">RMB drag</span> — look &nbsp;
            <span className="text-yellow-400">Space / C</span> — up / down
          </p>
          <p className="font-sans text-stone-400 text-xs tracking-wide">
            <span className="text-yellow-400/80">Shift</span> sprint &nbsp;·&nbsp;
            <span className="text-yellow-400/80">Scroll</span> speed &nbsp;·&nbsp;
            <span className="text-yellow-400/80">Ctrl</span> slow
          </p>
        </div>
      </div>
    </div>
  );
}
