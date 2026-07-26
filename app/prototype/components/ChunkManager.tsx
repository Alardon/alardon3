"use client";

/**
 * ChunkManager.tsx
 * Tracks the camera position every frame and maintains a set of loaded
 * chunk keys within LOAD_RADIUS. Chunks outside UNLOAD_RADIUS are removed.
 * Renders <TerrainChunk> + <NatureChunk> for each active chunk.
 */

import { useRef, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CHUNK_SIZE } from "./WorldNoise";
import TerrainChunk from "./TerrainChunk";
import NatureChunk from "./NatureChunk";

// Tune these for performance vs. view distance:
const LOAD_RADIUS   = 2;   // chunks — (2*2+1)²=25 max active
const UNLOAD_RADIUS = 3;

type ChunkKey = `${number},${number}`;
function key(cx: number, cz: number): ChunkKey { return `${cx},${cz}`; }
function parse(k: ChunkKey): [number, number] {
  const [a, b] = k.split(",");
  return [parseInt(a, 10), parseInt(b, 10)];
}

interface ChunkState {
  cx: number; cz: number; key: ChunkKey;
}

interface HmapStore {
  [k: ChunkKey]: Float32Array;
}

interface ChunkManagerProps {
  /** Callback fired when a chunk becomes loaded (used by Settlement to snap to terrain) */
  onChunkLoaded?: (cx: number, cz: number, hmap: Float32Array) => void;
}

export default function ChunkManager({ onChunkLoaded }: ChunkManagerProps) {
  const [chunks, setChunks] = useState<ChunkState[]>(() => {
    // Bootstrap with a 3×3 grid around origin so the player spawns into terrain
    const init: ChunkState[] = [];
    for (let cz = -1; cz <= 1; cz++)
      for (let cx = -1; cx <= 1; cx++)
        init.push({ cx, cz, key: key(cx, cz) });
    return init;
  });

  const loadedKeys  = useRef<Set<ChunkKey>>(new Set(chunks.map((c) => c.key)));
  const lastCamChunk = useRef<ChunkKey>("999,999"); // force first update
  const hmaps        = useRef<HmapStore>({});

  const handleChunkReady = useCallback(
    (cx: number, cz: number, hmap: Float32Array) => {
      hmaps.current[key(cx, cz)] = hmap;
      onChunkLoaded?.(cx, cz, hmap);
    },
    [onChunkLoaded]
  );

  useFrame(({ camera }) => {
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const camCX = Math.floor(camX / CHUNK_SIZE);
    const camCZ = Math.floor(camZ / CHUNK_SIZE);
    const camKey = key(camCX, camCZ);

    if (camKey === lastCamChunk.current) return;
    lastCamChunk.current = camKey;

    // Build desired set
    const desired = new Set<ChunkKey>();
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        // circular radius
        if (dx * dx + dz * dz > LOAD_RADIUS * LOAD_RADIUS) continue;
        desired.add(key(camCX + dx, camCZ + dz));
      }
    }

    // Chunks to add
    const toAdd: ChunkState[] = [];
    desired.forEach((k) => {
      if (!loadedKeys.current.has(k)) {
        const [cx, cz] = parse(k);
        toAdd.push({ cx, cz, key: k });
        loadedKeys.current.add(k);
      }
    });

    // Chunks to remove (beyond unload radius)
    const toRemove = new Set<ChunkKey>();
    loadedKeys.current.forEach((k) => {
      const [cx, cz] = parse(k);
      const dx = cx - camCX, dz = cz - camCZ;
      if (dx * dx + dz * dz > UNLOAD_RADIUS * UNLOAD_RADIUS) {
        toRemove.add(k);
        loadedKeys.current.delete(k);
        delete hmaps.current[k];
      }
    });

    if (toAdd.length > 0 || toRemove.size > 0) {
      setChunks((prev) => [
        ...prev.filter((c) => !toRemove.has(c.key)),
        ...toAdd,
      ]);
    }
  });

  return (
    <>
      {chunks.map((c) => (
        <group key={c.key}>
          <TerrainChunk
            chunkX={c.cx}
            chunkZ={c.cz}
            onReady={handleChunkReady}
          />
          <NatureChunk chunkX={c.cx} chunkZ={c.cz} />
        </group>
      ))}
    </>
  );
}
