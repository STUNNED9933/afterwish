// Lacuna (Chapter 2), engine phase 1: the land.
//
// A square land 512 m across, cut into 64 m chunks (8 by 8). Everything on it is worked out from a seed and the
// chunk's own coordinates, so a chunk comes out the same on the server and in every browser, whenever and in
// whatever order it is made: a browser only ever builds the chunks near its player (streaming), the server
// only the ones near someone.
//
// What is where (working layout for the test land):
//   - Sunmere, the first town, in the middle: a paved plaza, rings of houses, four roads out to the edges.
//   - The Wakewood (the opening forest) to the west: dense trees.
//   - Meadows with groves elsewhere, a lake to the south-east, rocky ground to the north.
//
// Collisions use a spatial hash (8 m cells): a body only ever looks at the few cells it overlaps, never at
// every tree on the land. This is simulation code: no Math.sin/cos/atan2/hypot/pow/random (see sim/dmath.js).
import { makeRng } from '../sim/rng.js';
import { dCos, dSin, dHypot } from '../sim/dmath.js';

export const LAND = { size: 512, chunk: 64, cell: 8, seed: 20261126 };
export const HALF = LAND.size / 2;
export const CHUNKS = LAND.size / LAND.chunk; // chunks along a side
const CELLS = LAND.size / LAND.cell; // hash cells along a side

export const TOWN = { x: 0, z: 0, plaza: 14, r: 44 }; // Sunmere
// (0.99.20) the Adventurers' Guild on the plaza's north side, and its reading crystal in the yard before it
const GUILD_A = -1.84;
export const GUILD = { x: TOWN.x + dCos(GUILD_A) * 21.5, z: TOWN.z + dSin(GUILD_A) * 21.5, a: GUILD_A, hw: 4.4, hd: 3.4 };
export const CRYSTAL = { x: TOWN.x + dCos(GUILD_A) * 16, z: TOWN.z + dSin(GUILD_A) * 16, a: GUILD_A, r: 0.7 };
export const LAKE = { x: 132, z: 118, r: 26 };
// (0.99.21) the Iron Hounds' training ground, outside Sunmere's east gate: a ring of posts (Rowan's) and a range of
// three targets at 8, 16 and 24 m from the shooting line (Juni's). Packed earth: nothing grows there, no beast lives there.
export const TRAINING = {
  x0: 46, x1: 90, z0: 11, z1: 32,
  ring: { x: 54, z: 25, r: 2.4 },
  line: { x: 60, z: 16 },
  targets: [{ x: 68, z: 13 }, { x: 76, z: 17.5 }, { x: 84, z: 21 }], // staggered: the near ones never block the far one
};
// (0.99.24) the plaza's well (the days with the Hounds: water for Ilse)
export const WELL = { x: 6, z: 4.5, r: 0.85 };
export const inTraining = (x, z, pad = 0) => x > TRAINING.x0 - pad && x < TRAINING.x1 + pad && z > TRAINING.z0 - pad && z < TRAINING.z1 + pad;
/** Every post of the training ground: four round the ring, then the three targets (the order the sim makes them in). */
export function trainingPosts() {
  const R = TRAINING.ring;
  const out = [];
  for (let i = 0; i < 4; i++) out.push({ x: R.x + dCos((i * Math.PI) / 2) * R.r, z: R.z + dSin((i * Math.PI) / 2) * R.r, ring: true });
  for (const t of TRAINING.targets) out.push({ x: t.x, z: t.z, ring: false });
  return out;
}
export const GLADE = { x: -150, z: 34, r: 11 }; // (phase 2) where the hero wakes, in the Wakewood: open grass, no beasts near
export const ROAD_W = 3.2; // half the width of a road

/** A number in [0, 1) from two integers and a seed (the same everywhere). */
export function hash2(x, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1103515245)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1), one feature every `1` unit. */
export function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** The four roads: from the town out to each edge, gently winding. Distance from (x, z) to the nearest. */
export function roadDist(x, z) {
  const ew = Math.abs(z - 7 * dSin(x / 37)); // east-west road
  const ns = Math.abs(x - 6 * dSin(z / 41 + 1)); // north-south road
  return Math.min(ew, ns);
}

/** What the ground is at (x, z): for placing things here, and for colouring the ground in the renderer. */
export function groundAt(x, z, seed = LAND.seed) {
  const town = dHypot(x - TOWN.x, z - TOWN.z);
  if (town < TOWN.plaza) return 'plaza';
  if (dHypot(x - (CRYSTAL.x + GUILD.x) / 2, z - (CRYSTAL.z + GUILD.z) / 2) < 6.2) return 'plaza'; // the Guild's yard, paved
  if (dHypot(x - GLADE.x, z - GLADE.z) < GLADE.r) return 'glade';
  if (inTraining(x, z)) return 'yard';
  if (dHypot(x - LAKE.x, z - LAKE.z) < LAKE.r) return 'water';
  if (dHypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3) return 'shore';
  if (roadDist(x, z) < ROAD_W) return town < TOWN.r + 4 ? 'street' : 'road';
  if (town < TOWN.r) return 'town';
  return forest(x, z, seed) > 0.55 ? 'forest' : z < -150 ? 'stony' : 'meadow';
}

/** How wooded (x, z) is, 0 to 1: the Wakewood to the west, groves elsewhere. */
export function forest(x, z, seed = LAND.seed) {
  const groves = noise(x / 46, z / 46, seed + 7) * 0.75 + noise(x / 13, z / 13, seed + 9) * 0.25;
  const west = x < -70 ? Math.min(1, (-70 - x) / 60) : 0; // the Wakewood
  return Math.min(1, groves * (1 - west) + west * (0.78 + groves * 0.3));
}

/** Sunmere's houses: rings round the plaza, never on a street. The same list everywhere. */
export function townHouses(seed = LAND.seed) {
  const out = [];
  const rings = [{ r: 21, n: 10 }, { r: 33, n: 15 }];
  for (const [ri, ring] of rings.entries()) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.21 + 0.09;
      const x = TOWN.x + dCos(a) * ring.r, z = TOWN.z + dSin(a) * ring.r;
      if (roadDist(x, z) < ROAD_W + 4.2) continue; // leave the streets open
      if (dHypot(x - GUILD.x, z - GUILD.z) < 9) continue; // the Guild stands here
      const big = hash2(i, ri, seed + 31) < 0.3;
      out.push({ kind: 'house', shape: 'box', x, z, hw: big ? 3.2 : 2.5, hd: big ? 2.6 : 2.1, rot: a + Math.PI / 2, r: big ? 4.2 : 3.3, v: Math.floor(hash2(i, ri, seed + 37) * 1000) });
    }
  }
  out.push({ kind: 'house', guild: true, id: 'barracks_red', shape: 'box', x: GUILD.x, z: GUILD.z, hw: GUILD.hw, hd: GUILD.hd, rot: GUILD.a + Math.PI / 2, r: 5.6, v: 0 });
  return out;
}

/** Which chunk (cx, cz from 0 to CHUNKS - 1) holds (x, z), and the chunk's index. */
export function chunkOf(x, z) {
  const cx = Math.max(0, Math.min(CHUNKS - 1, Math.floor((x + HALF) / LAND.chunk)));
  const cz = Math.max(0, Math.min(CHUNKS - 1, Math.floor((z + HALF) / LAND.chunk)));
  return { cx, cz, i: cz * CHUNKS + cx };
}

/** Enemy kinds of the test land (placeholder beasts: real ones come with phase 2). */
// (0.99.22) hp and dmg are tuned for a hero with no Link (it sleeps until the story wakes it): a third of what they
// were when they were tuned for Eternal level 10 in every slot
export const BEASTS = {
  wolf: { name: 'Mossback Wolf', speed: 5.0, aggro: 11, leash: 30, r: 0.6, where: 'forest', hp: 140, dmg: 14, every: 1.3, xp: 12 },
  hog: { name: 'Thornhog', speed: 4.2, aggro: 8, leash: 24, r: 0.7, where: 'meadow', hp: 190, dmg: 12, every: 1.5, xp: 14 },
  golem: { name: 'Cairn Golem', speed: 2.8, aggro: 9, leash: 20, r: 1.0, where: 'stony', hp: 500, dmg: 32, every: 2.1, xp: 30 },
  // (0.99.21) not a beast: the training ground's posts and targets (they never move, fight back or fall)
  dummy: { name: 'Training Post', speed: 0, aggro: 0, leash: 0, r: 0.45, where: 'none', hp: 5000, dmg: 0, every: 99, xp: 0, post: true },
};

/** The land: chunks made on demand, and a spatial hash of everything solid on what has been made. */
export class Land {
  constructor(seed = LAND.seed) {
    this.seed = seed;
    this.chunks = new Array(CHUNKS * CHUNKS).fill(null);
    this.cells = new Array(CELLS * CELLS).fill(null);
    this.stamp = 0;
    this.houses = townHouses(seed);
    // The lake is one big solid circle, in the hash from the start (it spans several chunks).
    this.insert({ kind: 'water', shape: 'circle', x: LAKE.x, z: LAKE.z, r: LAKE.r - 1.2 });
    this.insert({ kind: 'crystal', shape: 'circle', x: CRYSTAL.x, z: CRYSTAL.z, r: CRYSTAL.r }); // (0.99.20) the Guild's Telling Glass
    this.insert({ kind: 'well', shape: 'circle', x: WELL.x, z: WELL.z, r: WELL.r }); // (0.99.24) the plaza's well
  }

  /** The chunk at (cx, cz), made the first time it is asked for. */
  chunk(cx, cz) {
    const i = cz * CHUNKS + cx;
    if (!this.chunks[i]) {
      this.chunks[i] = this.makeChunk(cx, cz);
      for (const o of this.chunks[i].solid) this.insert(o);
    }
    return this.chunks[i];
  }

  /** Make every chunk now (the server and the tests: 64 chunks take a few milliseconds). */
  all() {
    for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) this.chunk(cx, cz);
    return this.chunks;
  }

  makeChunk(cx, cz) {
    const rng = makeRng(Math.floor(hash2(cx, cz, this.seed) * 4294967296));
    const x0 = -HALF + cx * LAND.chunk, z0 = -HALF + cz * LAND.chunk;
    const solid = [];
    const trees = [], rocks = [];
    const free = (x, z, r, gap) => solid.every((o) => o.shape === 'box' || dHypot(o.x - x, o.z - z) > o.r + r + gap) && !this.housesNear(x, z, r + 1.5);
    // Trees: many tries, kept where the land is wooded enough and there is room.
    for (let k = 0; k < 220; k++) {
      const x = x0 + rng() * LAND.chunk, z = z0 + rng() * LAND.chunk, roll = rng(), size = rng(), kind = rng();
      const g = groundAt(x, z, this.seed);
      if (g !== 'forest' && g !== 'meadow' && g !== 'stony') continue;
      const want = g === 'forest' ? 0.55 : g === 'meadow' ? 0.04 : 0.02;
      if (roll > want || roadDist(x, z) < ROAD_W + 1.5 || !free(x, z, 0.5, 1.6)) continue;
      const t = { kind: 'tree', shape: 'circle', x, z, r: 0.45, s: 0.8 + size * 0.7, pine: kind < (x < -70 ? 0.55 : 0.25) };
      trees.push(t);
      solid.push(t);
    }
    // Rocks: a few everywhere, many on the stony ground.
    for (let k = 0; k < 40; k++) {
      const x = x0 + rng() * LAND.chunk, z = z0 + rng() * LAND.chunk, roll = rng(), size = rng(), turn = rng();
      const g = groundAt(x, z, this.seed);
      const want = g === 'stony' ? 0.55 : g === 'forest' || g === 'meadow' ? 0.07 : 0;
      if (roll > want || roadDist(x, z) < ROAD_W + 1 || !free(x, z, 1, 1.2)) continue;
      const rk = { kind: 'rock', shape: 'circle', x, z, r: 0.5 + size * 1.0, turn: turn * 6.283 };
      rk.top = rk.r * 0.95; // (0.99.35) a rock can be stood on: its top (as drawn: a squashed dodecahedron)
      rocks.push(rk);
      solid.push(rk);
    }
    const houses = this.houses.filter((h) => chunkOf(h.x, h.z).i === cz * CHUNKS + cx);
    solid.push(...houses);
    // Where beasts live (the sim makes them): further from town, more of them.
    const spawns = [];
    const far = dHypot(x0 + 32 - TOWN.x, z0 + 32 - TOWN.z);
    const n = far < 80 ? 0 : Math.min(18, 6 + Math.floor((far - 80) / 22));
    for (let k = 0; k < n * 4 && spawns.length < n; k++) {
      const x = x0 + 4 + rng() * (LAND.chunk - 8), z = z0 + 4 + rng() * (LAND.chunk - 8);
      const g = groundAt(x, z, this.seed);
      const type = g === 'forest' ? 'wolf' : g === 'meadow' ? 'hog' : g === 'stony' ? 'golem' : null;
      if (!type || !free(x, z, 1.2, 1) || spawns.some((s) => dHypot(s.x - x, s.z - z) < 4)) continue;
      if (roadDist(x, z) < 16 || dHypot(x - GLADE.x, z - GLADE.z) < 45 || inTraining(x, z, 22)) continue; // (phase 2) the roads, the glade and the training ground are safe
      spawns.push({ type, x, z });
    }
    return { cx, cz, x0, z0, trees, rocks, houses, solid, spawns };
  }

  housesNear(x, z, r) {
    if (dHypot(x - TOWN.x, z - TOWN.z) > TOWN.r + 8) return false;
    return this.houses.some((h) => dHypot(h.x - x, h.z - z) < h.r + r);
  }

  /** Put a solid thing in every hash cell its bounds touch. */
  insert(o) {
    const r = o.shape === 'box' ? o.hw + o.hd : o.r;
    const c0 = this.cellIdx(o.x - r), c1 = this.cellIdx(o.x + r), r0 = this.cellIdx(o.z - r), r1 = this.cellIdx(o.z + r);
    for (let rz = r0; rz <= r1; rz++)
      for (let cx = c0; cx <= c1; cx++) {
        const i = rz * CELLS + cx;
        (this.cells[i] || (this.cells[i] = [])).push(o);
      }
  }

  cellIdx(v) {
    return Math.max(0, Math.min(CELLS - 1, Math.floor((v + HALF) / LAND.cell)));
  }

  /** Everything solid within `r` of (x, z) (each once), making the chunks there if need be. */
  near(x, z, r, out = []) {
    const k0 = chunkOf(x - r, z - r), k1 = chunkOf(x + r, z + r);
    for (let cz = k0.cz; cz <= k1.cz; cz++) for (let cx = k0.cx; cx <= k1.cx; cx++) this.chunk(cx, cz);
    const s = ++this.stamp;
    const c0 = this.cellIdx(x - r), c1 = this.cellIdx(x + r), r0 = this.cellIdx(z - r), r1 = this.cellIdx(z + r);
    for (let rz = r0; rz <= r1; rz++)
      for (let cx = c0; cx <= c1; cx++) {
        const cell = this.cells[rz * CELLS + cx];
        if (!cell) continue;
        for (const o of cell) {
          if (o._s === s) continue;
          o._s = s;
          out.push(o);
        }
      }
    return out;
  }

  /**
   * (0.99.35) The ground under (x, z) for a body whose feet are at height y: the top of a rock it is over (and up to
   * a step above), or the land itself.
   */
  groundAt(x, z, y = 0) {
    let g = 0;
    for (const ob of this.near(x, z, 2, this._scratchG || (this._scratchG = []))) {
      if (ob.top === undefined) continue;
      if (dHypot(x - ob.x, z - ob.z) < ob.r * 0.8 && y >= ob.top - 0.3 && ob.top > g) g = ob.top;
    }
    this._scratchG.length = 0;
    return g;
  }

  /** Whether a body at (x, z), feet at y, is against something it could kick off (a tree, a rock's side, a wall): the
   * way out from it, or null. */
  wallAt(x, z, y, rad) {
    let best = null, bd = Infinity;
    for (const ob of this.near(x, z, rad + 2, this._scratchW || (this._scratchW = []))) {
      if (ob.kind === 'water' || ob.kind === 'crystal') continue;
      if (ob.top !== undefined && y >= ob.top - 0.15) continue;
      let nx, nz, gap;
      if (ob.shape === 'box') {
        const c = dCos(ob.rot), s = dSin(ob.rot), dx = x - ob.x, dz = z - ob.z;
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        const cx = Math.max(-ob.hw, Math.min(ob.hw, lx)), cz = Math.max(-ob.hd, Math.min(ob.hd, lz));
        const ex = lx - cx, ez = lz - cz, d = dHypot(ex, ez) || 1e-6;
        gap = d - rad;
        nx = ((ex / d) * c - (ez / d) * s); nz = ((ex / d) * s + (ez / d) * c);
      } else {
        const dx = x - ob.x, dz = z - ob.z, d = dHypot(dx, dz) || 1e-6;
        gap = d - ob.r - rad;
        nx = dx / d; nz = dz / d;
      }
      if (gap < 0.55 && gap < bd) { bd = gap; best = { nx, nz }; }
    }
    this._scratchW.length = 0;
    return best;
  }

  /** Push a round body (o.x, o.z, radius rad) out of anything solid, and keep it on the land. */
  pushOut(o, rad) {
    const near = this.near(o.x, o.z, rad + 1, this._scratch || (this._scratch = []));
    let pushed = false;
    for (const ob of near) {
      const dx = o.x - ob.x, dz = o.z - ob.z;
      if (ob.shape === 'box') {
        const c = dCos(ob.rot), s = dSin(ob.rot);
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        const cx = Math.max(-ob.hw, Math.min(ob.hw, lx)), cz = Math.max(-ob.hd, Math.min(ob.hd, lz));
        let nx = lx - cx, nz = lz - cz;
        let d = dHypot(nx, nz);
        if (d >= rad) continue;
        if (d < 1e-6) {
          const px = ob.hw - Math.abs(lx), pz = ob.hd - Math.abs(lz);
          if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; d = -px; } else { nx = 0; nz = lz < 0 ? -1 : 1; d = -pz; }
        } else { nx /= d; nz /= d; }
        const push = rad - d;
        o.x += (nx * c - nz * s) * push;
        o.z += (nx * s + nz * c) * push;
        pushed = true;
      } else {
        if (ob.top !== undefined && (o.y || 0) >= ob.top - 0.15) continue; // (0.99.35) above a rock: over it, not into it
        const d = dHypot(dx, dz), min = ob.r + rad;
        if (d >= min) continue;
        if (d < 1e-6) { o.x += min; pushed = true; continue; }
        o.x = ob.x + (dx / d) * min;
        o.z = ob.z + (dz / d) * min;
        pushed = true;
      }
    }
    near.length = 0;
    const edge = HALF - 2;
    if (o.x < -edge) o.x = -edge; else if (o.x > edge) o.x = edge;
    if (o.z < -edge) o.z = -edge; else if (o.z > edge) o.z = edge;
    return pushed;
  }
}
