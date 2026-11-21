// Each map's own place (0.41): which trees, rocks and ground cover grow there, what stands at
// its edge, and what lies in its hollows. Drawing only: the simulation's obstacles stay exactly
// where they are, and are drawn here at exactly their size.
import * as THREE from 'three';
import { TREES, ROCKS, DECOR } from './species.js';
import { makeRnd, scatterSpots } from './environment.js';

/** The look a map is drawn with (the Wilds have their own since 0.41). */
export const lookOf = (map) => (map.wilds ? 'shattered' : map.riftTheme ? MAP_LOOK[map.riftTheme] || map.theme : map.theme);
const MAP_LOOK = {};

// species: [builder name, options, weight]
const S = (name, opts = {}, w = 1) => ({ name, opts, w });

// The regions of the Shattered Wilds: pieces of four lands, broken apart and pushed together.
export const SHARDS = ['verdant', 'frozen', 'sands', 'ember'];

export const BIOMES = {
  town: {
    trees: [S('broadleaf', { leaves: ['#1a3826', '#3e6a3e'] }, 3), S('broadleaf', { leaves: ['#3a2e1a', '#6a4e2a'], seed: 4 }, 1), S('pine', {}, 1), S('birch', {}, 1)],
    rocks: [S('boulder', { stone: '#6a6a72', top: '#5a7a3a' })],
    decor: [S('flowers', {}, 3), S('bush', { berries: '#c8304a' }, 2), S('fern', {}, 1)], decorDensity: 0.05,
    edge: { kind: 'trees', species: [S('pine', { seed: 9 }, 2), S('broadleaf', { seed: 5 }, 2), S('bush', {}, 2)] },
  },
  forest: {
    trees: [S('broadleaf', {}, 3), S('broadleaf', { leaves: ['#1c3a20', '#40683a'], seed: 7 }, 2), S('birch', {}, 1.5), S('pine', {}, 1.5)],
    rocks: [S('boulder', { stone: '#5e626a', top: '#4a7a30', topAmt: 0.85 }, 2), S('stump', {}, 1)],
    decor: [S('fern', {}, 4), S('bush', {}, 3), S('log', {}, 0.6), S('flowers', { colors: ['#ffffff', '#ffe84a', '#c8a8ff'] }, 1)], decorDensity: 0.07,
    edge: { kind: 'trees', species: [S('broadleaf', { seed: 11 }, 2), S('pine', { seed: 12 }, 2), S('broadleaf', { leaves: ['#1c3a20', '#40683a'], seed: 13 }, 1)] },
  },
  swamp: {
    trees: [S('willow', { leaves: ['#1a3224', '#3e5a30'] }, 3), S('dead', { bark: '#2e2c28', seed: 3 }, 1.5), S('willow', { leaves: ['#1e3626', '#4a5e2e'], seed: 8 }, 1)],
    rocks: [S('boulder', { stone: '#3e4a48', top: '#4a6a3a', topAmt: 0.9 }, 2), S('stump', { bark: '#2e2a22', wood: '#6a5a40' }, 1)],
    decor: [S('reeds', {}, 3), S('fern', { color: ['#24402e', '#4a6a3a'] }, 2), S('lilypads', {}, 0)], decorDensity: 0.06,
    pools: { kind: 'water', count: 9, size: [4, 9], edge: [S('reeds', {}, 3), S('lilypads', {}, 2)] },
    edge: { kind: 'trees', species: [S('willow', { seed: 21, leaves: ['#18301f', '#36502c'] }, 2), S('dead', { bark: '#2a2824', seed: 22 }, 1)] },
  },
  ash: {
    trees: [S('dead', { bark: '#1e1a18', ember: '#ff6a1a', seed: 2 }, 3), S('dead', { bark: '#2a2622', seed: 5, tall: 1.2 }, 2)],
    rocks: [S('boulder', { stone: '#5a5450', top: '#b0aaa4', topAmt: 0.85 }, 3), S('stump', { bark: '#1e1a18', wood: '#3a2a20' }, 1)],
    decor: [S('ashPile', {}, 1.5), S('embers', {}, 2)], decorDensity: 0.03,
    edge: { kind: 'cliff', species: [S('boulder', { stone: '#4a4440', top: '#a8a29c', topAmt: 0.9, flat: 1.1 })], also: [S('dead', { bark: '#1e1a18', ember: '#ff6a1a', seed: 9 })] },
  },
  keep: {
    trees: [S('pillar', {}, 2), S('dead', { bark: '#1e1e24', seed: 4 }, 2)],
    rocks: [S('ruinWall', {}, 3), S('boulder', { stone: '#585a66', top: '#3e4a36', topAmt: 0.5 }, 1)],
    decor: [S('tombstone', {}, 2), S('fern', { color: ['#22301e', '#3e5030'] }, 2)], decorDensity: 0.035,
    edge: { kind: 'wall', species: [S('ruinWall', { seed: 30 })], towers: true },
  },
  frost: {
    trees: [S('pine', { snow: 0.6, needles: ['#173228', '#2e5a40'], tiers: 5 }, 3), S('pine', { snow: 0.45, seed: 8, tiers: 4 }, 2), S('iceSpikes', {}, 1)],
    rocks: [S('iceRock', {}, 3), S('boulder', { stone: '#7a8a98', top: '#f4faff', topAmt: 1 }, 1)],
    decor: [S('smallCrystals', { color: '#bfe8ff' }, 1)], decorDensity: 0.008,
    pools: { kind: 'ice', count: 4, size: [5, 10], edge: [S('snowDrift', {}, 1)] },
    edge: { kind: 'cliff', species: [S('iceRock', { seed: 40 }), S('boulder', { stone: '#8aa0b0', top: '#ffffff', topAmt: 1, flat: 1.2, seed: 41 })], also: [S('pine', { snow: 1, seed: 42 })] },
  },
  desert: {
    trees: [S('saguaro', {}, 3), S('saguaro', { skin: '#5a7a42', seed: 3 }, 2), S('dead', { bark: '#8a6a4a', seed: 6, tall: 0.8 }, 1)],
    rocks: [S('mesa', {}, 3), S('boulder', { stone: '#a87850', top: '#e0c088', topAmt: 0.7 }, 1)],
    decor: [S('bones', {}, 1), S('pottery', {}, 0.5)], decorDensity: 0.012,
    edge: { kind: 'cliff', species: [S('mesa', { seed: 50 }), S('mesa', { seed: 51, bands: ['#a06a40', '#b8844e', '#8a5432'] })] },
  },
  fungal: {
    trees: [S('mushroom', {}, 3), S('mushroom', { cap: '#2a447a', gills: '#6ad8f0', seed: 4, h: 2.4, w: 1.5 }, 2), S('mushroom', { cap: '#8a3226', gills: '#ffa040', seed: 9, h: 3.8, w: 2.2 }, 1)],
    rocks: [S('fungusRock', {}, 3), S('fungusRock', { cap: '#5ad8ff', seed: 3 }, 1)],
    decor: [S('sporeCaps', {}, 3), S('sporeCaps', { cap: '#7ae8ff', seed: 5 }, 2)], decorDensity: 0.05,
    pools: { kind: 'glow', count: 6, size: [3, 6], edge: [S('sporeCaps', {}, 1)] },
    edge: { kind: 'trees', species: [S('mushroom', { seed: 60, h: 4.6, w: 2.6 }, 2), S('mushroom', { cap: '#2a447a', gills: '#6ad8f0', seed: 61, h: 4, w: 2.2 }, 1)] },
  },
  storm: {
    trees: [S('basalt', {}, 3), S('basalt', { seed: 4, tall: 1.3 }, 1)],
    rocks: [S('windRock', {}, 2), S('boulder', { stone: '#4e5664', top: '#7a8494', topAmt: 0.5 }, 1)],
    decor: [S('fern', { color: ['#2e3a36', '#5a6e64'] }, 1)], decorDensity: 0.02,
    edge: { kind: 'cliff', species: [S('basalt', { seed: 70, tall: 1.6 })], also: [S('windRock', { seed: 71 })] },
  },
  volcano: {
    trees: [S('obsidian', {}, 3), S('dead', { bark: '#141010', ember: '#ff5a14', seed: 7 }, 1)],
    rocks: [S('lavaRock', {}, 3)],
    decor: [S('embers', {}, 3)], decorDensity: 0.03,
    edge: { kind: 'lava', species: [S('obsidian', { seed: 80 }), S('lavaRock', { seed: 81 })] },
  },
  astral: {
    trees: [S('crystal', {}, 3), S('crystal', { color: '#c8a8ff', core: '#f4ecff', seed: 4 }, 1)],
    rocks: [S('floating', {}, 3), S('boulder', { stone: '#3a3a7a', top: '#8a8aff', topAmt: 0.4 }, 1)],
    decor: [S('smallCrystals', {}, 3), S('smallCrystals', { color: '#c8a8ff', seed: 3 }, 1)], decorDensity: 0.03,
    pools: { kind: 'void', count: 5, size: [3, 7], edge: [S('smallCrystals', {}, 1)] },
    edge: { kind: 'void', species: [S('floating', { seed: 90 })] },
  },
  glass: {
    trees: [S('glassSpire', {}, 3), S('palm', {}, 2)],
    rocks: [S('cityRubble', {}, 3)],
    decor: [S('pottery', {}, 2), S('smallCrystals', { color: '#ffd890', seed: 4 }, 1)], decorDensity: 0.015,
    edge: { kind: 'wall', species: [S('ruinWall', { stone: '#b8986a', mortar: '#6a4a2a', moss: '#d8c090', seed: 31 })] },
  },
  // The Deep (0.54): the Primordials' domains
  deepash: {
    trees: [S('dead', { bark: '#100a08', ember: '#ff4a0a', seed: 3, tall: 1.3 }, 3), S('obsidian', {}, 1)],
    rocks: [S('lavaRock', {}, 2), S('boulder', { stone: '#2a2220', top: '#8a807a', topAmt: 0.9 }, 2)],
    decor: [S('ashPile', {}, 3), S('embers', {}, 3)], decorDensity: 0.04,
    edge: { kind: 'cliff', species: [S('boulder', { stone: '#1e1816', top: '#6a605a', topAmt: 0.9, flat: 1.2, seed: 100 })], also: [S('dead', { bark: '#100a08', ember: '#ff4a0a', seed: 101 })] },
  },
  drowned: {
    trees: [S('pillar', {}, 2), S('willow', { leaves: ['#0e2224', '#22403a'], seed: 6 }, 2), S('dead', { bark: '#1a2a2a', seed: 9 }, 1)],
    rocks: [S('ruinWall', { stone: '#3a5050', mortar: '#1a2a2a', moss: '#2a5a4a', seed: 7 }, 3), S('boulder', { stone: '#2a3a3c', top: '#3a5a4a', topAmt: 0.9 }, 1)],
    decor: [S('reeds', {}, 3), S('lilypads', {}, 0)], decorDensity: 0.04,
    pools: { kind: 'water', count: 12, size: [5, 11], edge: [S('reeds', {}, 3), S('lilypads', {}, 2)] },
    edge: { kind: 'wall', species: [S('ruinWall', { stone: '#2a4040', mortar: '#122020', moss: '#2a5a4a', seed: 102 })] },
  },
  rootdeep: {
    trees: [S('dead', { bark: '#2a1e12', seed: 11, tall: 1.6 }, 3), S('mushroom', { cap: '#3a4a1a', gills: '#9ad04a', seed: 12, h: 3.2, w: 2 }, 1)],
    rocks: [S('stump', { bark: '#2a1e12', wood: '#5a4428' }, 2), S('boulder', { stone: '#3a3426', top: '#4a6a2a', topAmt: 1 }, 2)],
    decor: [S('fern', { color: ['#1e2a12', '#4a6a24'] }, 3), S('sporeCaps', { cap: '#9ad04a', seed: 13 }, 2), S('log', {}, 1)], decorDensity: 0.07,
    pools: { kind: 'glow', count: 4, size: [3, 6], edge: [S('fern', { color: ['#1e2a12', '#4a6a24'] }, 1)] },
    edge: { kind: 'trees', species: [S('dead', { bark: '#22180e', seed: 103, tall: 2 }, 2), S('mushroom', { cap: '#3a4a1a', gills: '#9ad04a', seed: 104, h: 4.4, w: 2.6 }, 1)] },
  },
  choir: {
    trees: [S('glassSpire', {}, 3), S('crystal', { color: '#cfe4ff', core: '#ffffff', seed: 5 }, 2)],
    rocks: [S('cityRubble', {}, 2), S('iceRock', {}, 1)],
    decor: [S('smallCrystals', { color: '#cfe4ff' }, 3)], decorDensity: 0.03,
    edge: { kind: 'cliff', species: [S('crystal', { color: '#a8c8f0', seed: 105 }), S('iceRock', { seed: 106 })] },
  },
  caelum: {
    trees: [S('glassSpire', { glass: '#ffe8b0', stone: '#e8dcc0', seed: 21 }, 3), S('pillar', { stone: '#e8e2d4', moss: '#d8b25a', seed: 22 }, 2)],
    rocks: [S('boulder', { stone: '#f0ece2', top: '#ffffff', topAmt: 0.8, flat: 0.62, seed: 23 }, 3), S('ruinWall', { stone: '#e8e0cc', mortar: '#c8a050', moss: '#f4efe4', seed: 24 }, 1)],
    decor: [S('smallCrystals', { color: '#ffe2a0' }, 2)], decorDensity: 0.02,
    edge: { kind: 'void', species: [S('floating', { stone: '#e8e2d4', crystal: '#ffd870', seed: 108 })] },
  },
  quiet: {
    trees: [S('dead', { bark: '#1a181e', seed: 14, tall: 1.1 }, 1)],
    rocks: [S('boulder', { stone: '#2a2830', top: '#3a3842', topAmt: 0.4 }, 2), S('tombstone', {}, 1)],
    decor: [S('bones', {}, 1)], decorDensity: 0.004,
    edge: { kind: 'void', species: [S('floating', { seed: 107 })] },
  },
  // The Shattered Wilds: each region keeps the plants of the land it broke from.
  shattered: {
    shards: {
      verdant: { trees: [S('broadleaf', {}, 2), S('pine', {}, 1)], rocks: [S('boulder', { stone: '#5e626a', top: '#4a7a30', topAmt: 0.85 })], decor: [S('fern', {}, 2), S('bush', {}, 1)] },
      frozen: { trees: [S('pine', { snow: 0.6 }, 2), S('iceSpikes', {}, 1)], rocks: [S('iceRock', {})], decor: [S('smallCrystals', { color: '#bfe8ff' }, 1)] },
      sands: { trees: [S('saguaro', {}, 2), S('dead', { bark: '#8a6a4a', tall: 0.8 }, 1)], rocks: [S('mesa', {})], decor: [S('bones', {}, 1)] },
      ember: { trees: [S('obsidian', {}, 1), S('dead', { bark: '#1e1a18', ember: '#ff6a1a' }, 2)], rocks: [S('lavaRock', {})], decor: [S('embers', {}, 2), S('ashPile', {}, 1)] },
    },
    decorDensity: 0.035,
    edge: { kind: 'cliff', species: [S('boulder', { stone: '#3a3444', top: '#8a6aff', topAmt: 0.3, flat: 1.1 }), S('crystal', { color: '#b090ff', seed: 95 })] },
  },
};

// --- The Wilds' regions ----------------------------------------------------------------
/** A few big Voronoi cells over the map, each one piece of a land. Seeded by the map. */
export function shardField(map) {
  const rnd = makeRnd(map.id.length * 7717 + Math.round(map.radius) * 13);
  const R = map.radius;
  const pts = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5, d = (i === 0 ? 0 : 0.35 + rnd() * 0.6) * R;
    pts.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, k: i % 4 });
  }
  // the middle and the entrance are verdant: the Wilds begin somewhere familiar
  pts[0].k = 0;
  const at = (x, z) => {
    let b = 0, d1 = Infinity, d2 = Infinity;
    for (let i = 0; i < pts.length; i++) {
      // a little wobble so the borders are not straight lines
      const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
      if (d < d1) { d2 = d1; d1 = d; b = i; } else if (d < d2) d2 = d;
    }
    return { k: pts[b].k, seam: Math.sqrt(d2) - Math.sqrt(d1) };
  };
  return { pts, at };
}

// --- Building ----------------------------------------------------------------------------
function pick(list, r) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let roll = r * total;
  for (const x of list) if ((roll -= x.w) <= 0) return x;
  return list[list.length - 1];
}

/**
 * Builds the scenery for a map. Returns { group, update(dt, t), pools } where pools are the
 * still water / ice / void patches (for the ground to paint), in world units.
 */
export function buildBiome(map, { quality, mats }) {
  const look = lookOf(map);
  const B = BIOMES[look] || BIOMES.forest;
  const group = new THREE.Group();
  const R = map.radius;
  const rnd = makeRnd(map.id.length * 104729 + Math.round(R) * 31 + 5);
  const field = look === 'shattered' ? shardField(map) : null;
  const listsAt = (x, z) => (field ? B.shards[SHARDS[field.at(x, z).k]] : B);

  // Instances by species (one draw call per species and material).
  const buckets = new Map();
  const cache = new Map();
  const geoOf = (sp) => {
    const key = sp.name + JSON.stringify(sp.opts);
    if (!cache.has(key)) {
      const fn = TREES[sp.name] || ROCKS[sp.name] || DECOR[sp.name];
      cache.set(key, fn(sp.opts));
    }
    return { key, geo: cache.get(key) };
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  // Instances are grouped by sector as well as by species, so whatever is off-screen is
  // skipped whole (one map-wide mesh would always be drawn, and drawn again for shadows).
  const SECTOR = 22;
  const place = (sp, x, y, z, turn, sx, sy = sx, sz = sx, shade = 1, { shadow = true, tilt = 0 } = {}) => {
    const { key: sk, geo } = geoOf(sp);
    const key = `${sk}|${Math.floor(x / SECTOR)},${Math.floor(z / SECTOR)}|${shadow}`;
    if (!buckets.has(key)) buckets.set(key, { geo, list: [], shadow });
    e.set(tilt, turn, 0);
    m.compose(v.set(x, y, z), q.setFromEuler(e), s.set(sx, sy, sz));
    buckets.get(key).list.push([m.clone(), shade]);
  };

  // Solid things: the simulation's trees and rocks, as this land's species.
  map.obstacles.forEach((o, i) => {
    if (o.kind !== 'tree' && o.kind !== 'rock') return;
    const L = listsAt(o.x, o.z);
    const r = ((i * 0.6180339 + 0.13) % 1);
    const sp = pick(o.kind === 'tree' ? L.trees : L.rocks, r);
    const shade = 0.86 + ((i * 0.37) % 1) * 0.28;
    if (o.kind === 'tree') place(sp, o.x, 0, o.z, o.turn, o.scale, o.scale, o.scale, shade);
    else place(sp, o.x, 0, o.z, o.turn * 2, o.r * 1.05, o.r * (0.85 + ((i * 0.29) % 1) * 0.3), o.r * 1.05, shade);
  });

  // Pools: water, ice, glowing spore-water or holes into the stars. Not solid: shallow.
  const pools = [];
  if (B.pools) {
    const spots = scatterSpots(map, B.pools.count * 40, map.id.length * 337 + 1, { minGap: 2.5 });
    for (const [x, z, a, b] of spots) {
      if (pools.length >= B.pools.count) break;
      const r = B.pools.size[0] + a * (B.pools.size[1] - B.pools.size[0]);
      if (Math.hypot(x, z) + r > R - 3) continue;
      if (pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 3)) continue;
      // keep pools off the portals and the boss's ground
      if ((map.portals || []).some((g) => Math.hypot(g.x - x, g.z - z) < r + 6)) continue;
      if ((map.spawns || []).some((sp) => sp.r >= 10 && Math.hypot(sp.x - x, sp.z - z) < r + 8)) continue;
      // and out from under the trees and rocks (a pine standing on a frozen pond looks wrong)
      if (map.obstacles.some((o) => o.shape === 'circle' && Math.hypot(o.x - x, o.z - z) < r * 1.15 + (o.r || 1))) continue;
      if (map.obstacles.some((o) => o.kind === 'house' && Math.hypot(o.x - x, o.z - z) < r + 6)) continue;
      pools.push({ x, z, r, turn: b * 6.28, wob: [a * 7, b * 5] });
    }
    // ground cover around the shores
    for (const p of pools) {
      const n = Math.round(p.r * 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.4, d = poolRadius(p, a) * (0.85 + rnd() * 0.25);
        const sp = pick(B.pools.edge, rnd());
        const inside = sp.name === 'lilypads';
        const dd = inside ? d * 0.55 : d;
        place(sp, p.x + Math.cos(a) * dd, inside ? 0.02 : 0, p.z + Math.sin(a) * dd, rnd() * 6.28, 0.8 + rnd() * 0.6, undefined, undefined, 1, { shadow: false });
      }
    }
  }

  // Ground cover: walk-through plants and odds and ends.
  const area = Math.PI * R * R;
  const density = (B.decorDensity ?? 0.03) * (quality === 'low' || quality === 'lowest' ? 0.35 : quality === 'medium' ? 0.75 : 1);
  const nDecor = Math.min(1600, Math.round(area * density));
  if (nDecor) {
    const spots = scatterSpots(map, nDecor, map.id.length * 7919 + 17, { minGap: 0.6 });
    for (const [x, z, a, b] of spots) {
      if (pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r * 1.05)) continue;
      const L = listsAt(x, z);
      if (!L.decor || !L.decor.length) continue;
      const sp = pick(L.decor, a);
      if (sp.w === 0) continue;
      place(sp, x, 0, z, b * 6.28, 0.75 + b * 0.6, undefined, undefined, 0.85 + a * 0.3, { shadow: false });
    }
  }

  // The edge of the map.
  const E = B.edge;
  if (E) {
    const ring = (rr, n, list, scale, jitter = 0.5) => {
      for (let i = 0; i < n; i++) {
        const a = ((i + rnd() * jitter) / n) * Math.PI * 2;
        const d = rr + rnd() * 2.2;
        const sp = pick(list, rnd());
        const sc = scale[0] + rnd() * (scale[1] - scale[0]);
        const isRock = !!ROCKS[sp.name];
        place(sp, Math.cos(a) * d, isRock ? -0.2 : 0, Math.sin(a) * d, rnd() * 6.28, sc, sc * (isRock ? 0.9 + rnd() * 0.8 : 1), sc, 0.75 + rnd() * 0.3);
      }
    };
    const circ = Math.PI * 2 * R;
    // the far rings are mostly hidden by the near ones: fewer of them on lower settings
    const far = quality === 'low' || quality === 'lowest' ? 0 : quality === 'medium' ? 0.6 : 1;
    if (E.kind === 'trees') {
      ring(R + 1.8, Math.round(circ / 2.5), E.species, [1.1, 1.7]);
      if (far) ring(R + 5.5, Math.round((circ / 3.4) * far), E.species, [1.4, 2.1]);
    } else if (E.kind === 'cliff' || E.kind === 'lava') {
      ring(R + 1.9, Math.round(circ / 2.3), E.species, [1.4, 2.3]);
      if (far) ring(R + 5.5, Math.round((circ / 3.2) * far), E.species, [2.0, 3.2]);
      if (E.also) ring(R + 3.6, Math.round(circ / 7), E.also, [1.2, 1.7]);
    } else if (E.kind === 'wall') {
      // ruined walls along the rim: courses of stone, with gaps
      const n = Math.round(circ / 2.1);
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.12) continue;
        const a = (i / n) * Math.PI * 2;
        const sp = pick(E.species, rnd());
        place(sp, Math.cos(a) * (R + 2.2), 0, Math.sin(a) * (R + 2.2), -a - Math.PI / 2 + (rnd() - 0.5) * 0.15, 1.0, 1.1 + rnd() * 0.9, 1.0, 0.8 + rnd() * 0.25);
      }
      ring(R + 5.5, Math.round(circ / 3), [S('boulder', { stone: '#4e4e58', top: '#3a4a30', topAmt: 0.4 })], [1.4, 2.4]);
    } else if (E.kind === 'void') {
      // floating stones drifting off into the dark
      for (let i = 0; i < Math.round(circ / 6); i++) {
        const a = rnd() * Math.PI * 2, d = R + 3 + rnd() * 14;
        const sp = pick(E.species, rnd());
        const sc = 0.8 + rnd() * 1.8;
        place(sp, Math.cos(a) * d, -1 + rnd() * 3, Math.sin(a) * d, rnd() * 6.28, sc, sc, sc, 0.8);
      }
    }
  }

  // Turn the buckets into instanced meshes.
  for (const { geo, list, shadow } of buckets.values()) {
    for (const kind of ['solid', 'gloss', 'glow']) {
      if (!geo[kind]) continue;
      const mesh = new THREE.InstancedMesh(geo[kind], mats[kind], list.length);
      const c = new THREE.Color();
      list.forEach(([mm, shade], n) => {
        mesh.setMatrixAt(n, mm);
        if (kind !== 'glow') mesh.setColorAt(n, c.setScalar(shade));
      });
      mesh.castShadow = shadow && kind !== 'glow';
      mesh.receiveShadow = kind !== 'glow';
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return { group, pools, field, look };
}

/** The radius of a pool at angle a (an irregular, wobbly blob). */
export function poolRadius(p, a) {
  return p.r * (1 + 0.18 * Math.sin(a * 3 + p.wob[0]) + 0.1 * Math.sin(a * 5 + p.wob[1]) + 0.06 * Math.sin(a * 9 + p.turn));
}

/** Materials shared by every species on a map. */
export function biomeMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.15 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}
