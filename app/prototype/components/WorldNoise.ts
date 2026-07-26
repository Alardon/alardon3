/**
 * WorldNoise.ts
 * Shared deterministic heightmap + biome functions for the infinite chunk world.
 * All coordinates are in world-space metres.
 */

import { createNoise2D } from "simplex-noise";

// ── Constants ─────────────────────────────────────────────────────────────────
export const CHUNK_SIZE  = 64;   // metres per chunk side
export const CHUNK_VERTS = 64;   // vertex resolution (quads = CHUNK_VERTS²)
export const SEA_LEVEL   = -1.5;
export const MAX_HEIGHT  = 48;

// ── Noise instances (seeded, module-level singletons) ─────────────────────────
// Each has a unique seed offset baked into the sample coords.
const n2D_base    = createNoise2D();   // primary terrain
const n2D_ridge   = createNoise2D();   // ridged mountains
const n2D_detail  = createNoise2D();   // micro detail
const n2D_river   = createNoise2D();   // river channels
const n2D_forest  = createNoise2D();   // forest-patch mask
const n2D_warp    = createNoise2D();   // domain warp X
const n2D_warpZ   = createNoise2D();   // domain warp Z

// ── Helpers ────────────────────────────────────────────────────────────────────
function fbm(nx: number, nz: number, octaves: number, lacunarity = 2.0, gain = 0.5): number {
  let val = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    val  += n2D_base(nx * freq + o * 3.1, nz * freq + o * 2.7) * amp;
    norm += amp;
    amp  *= gain;
    freq *= lacunarity;
  }
  return val / norm;
}

function ridgeFbm(nx: number, nz: number): number {
  let val = 0, amp = 1, freq = 0.8, norm = 0;
  for (let o = 0; o < 5; o++) {
    const s = n2D_ridge(nx * freq + 9.1, nz * freq + 7.3);
    val  += (1 - Math.abs(s)) * amp;
    norm += amp;
    amp  *= 0.5;
    freq *= 2.1;
  }
  return val / norm;
}

// ── Mountain mask: north-west quadrant around origin ──────────────────────────
// Returns 0 (plain) → 1 (full mountain)
function mountainMask(wx: number, wz: number): number {
  // mountain centred at roughly (-40, -80) from origin
  const mx = wx + 40;
  const mz = wz + 80;
  const r  = Math.sqrt(mx * mx + mz * mz);
  // ramp: outside r=120 → 0, inside r=60 → 1
  return 1 - Math.min(1, Math.max(0, (r - 60) / 60));
}

// ── River mask: winding east-west river, returns [0,1] — 1 = river centre ─────
function riverMask(wx: number, wz: number): number {
  // river meanders around z = +15, x goes -∞..+∞
  const warpScale = 0.008;
  const warpAmt   = 22;
  const warpX = n2D_warp(wx * warpScale, wz * warpScale) * warpAmt;
  const warpZ = n2D_warpZ(wx * warpScale + 4.1, wz * warpScale + 2.9) * warpAmt;
  const rz    = wz + warpZ - 15;   // offset so river is south of castle
  const rx    = wx + warpX;
  // secondary tributary
  const t2z = wz + warpZ + 35;
  const t2x = wx + warpX * 0.6;
  const mainR = Math.abs(rz) - Math.abs(rx) * 0.01;
  const trib  = Math.abs(t2z) - Math.abs(t2x) * 0.02;
  const v1 = Math.max(0, 1 - mainR / 8);
  const v2 = Math.max(0, 1 - trib  / 5);
  return Math.max(v1, v2);
}

// ── Forest-patch mask: returns 0 (open) → 1 (dense forest) ───────────────────
// Uses low-frequency noise → big blobs.
export function forestMask(wx: number, wz: number): number {
  const scale = 0.012;
  const v = n2D_forest(wx * scale + 11.3, wz * scale + 7.2) * 0.5
          + n2D_forest(wx * scale * 2.2 + 3.1, wz * scale * 2.2) * 0.25
          + n2D_detail(wx * scale * 4.0, wz * scale * 4.0) * 0.12;
  return Math.max(0, Math.min(1, v + 0.2));
}

// ── Master height function ─────────────────────────────────────────────────────
export function worldHeight(wx: number, wz: number): number {
  const scale = 0.006;

  // domain warp for interesting coastlines
  const dwx = n2D_warp(wx * 0.004, wz * 0.004) * 18;
  const dwz = n2D_warpZ(wx * 0.004 + 5.5, wz * 0.004 + 3.1) * 18;
  const nx = (wx + dwx) * scale;
  const nz = (wz + dwz) * scale;

  // base rolling terrain (mostly flat plain)
  const plain = (fbm(nx, nz, 6, 2.0, 0.48) * 0.5 + 0.15) * 7;

  // mountain
  const mm  = mountainMask(wx, wz);
  const mh  = ridgeFbm(nx * 1.4, nz * 1.4) * MAX_HEIGHT * 0.9 + 4;
  const mDetail = n2D_detail(wx * 0.02, wz * 0.02) * 3;

  // river carving: subtract a valley
  const river = riverMask(wx, wz);
  const rivCarve = river * 5;

  let h = plain * (1 - mm) + (mh + mDetail) * mm;
  h -= rivCarve;

  // micro bumps everywhere
  h += n2D_detail(wx * 0.08 + 1.1, wz * 0.08 + 2.3) * 0.6;

  return Math.max(SEA_LEVEL - 0.3, h);
}

// ── Is-river helper (boolean) ─────────────────────────────────────────────────
export function isRiver(wx: number, wz: number): boolean {
  return riverMask(wx, wz) > 0.35;
}

// ── Build a Float32Array heightmap for one chunk ───────────────────────────────
export function buildChunkHeightmap(chunkX: number, chunkZ: number): Float32Array {
  const n = CHUNK_VERTS + 1;
  const hmap = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const wx = chunkX * CHUNK_SIZE + (ix / CHUNK_VERTS) * CHUNK_SIZE;
      const wz = chunkZ * CHUNK_SIZE + (iz / CHUNK_VERTS) * CHUNK_SIZE;
      hmap[iz * n + ix] = worldHeight(wx, wz);
    }
  }
  return hmap;
}

// ── Bilinear height lookup from a chunk's hmap ────────────────────────────────
export function sampleChunkHeight(
  hmap: Float32Array,
  chunkX: number,
  chunkZ: number,
  wx: number,
  wz: number,
): number {
  const lx  = wx - chunkX * CHUNK_SIZE;
  const lz  = wz - chunkZ * CHUNK_SIZE;
  const n   = CHUNK_VERTS + 1;
  const hx  = Math.max(0, Math.min(CHUNK_VERTS - 0.001, (lx / CHUNK_SIZE) * CHUNK_VERTS));
  const hz  = Math.max(0, Math.min(CHUNK_VERTS - 0.001, (lz / CHUNK_SIZE) * CHUNK_VERTS));
  const ix  = Math.floor(hx);
  const iz  = Math.floor(hz);
  const fx  = hx - ix;
  const fz  = hz - iz;
  const h00 = hmap[ iz      * n + ix    ];
  const h10 = hmap[ iz      * n + ix + 1];
  const h01 = hmap[(iz + 1) * n + ix    ];
  const h11 = hmap[(iz + 1) * n + ix + 1];
  return h00*(1-fx)*(1-fz) + h10*fx*(1-fz) + h01*(1-fx)*fz + h11*fx*fz;
}
