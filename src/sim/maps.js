// Exploration maps. The world is a chain of separate maps joined by portals,
// each with its own enemies, ten levels tougher than the one before:
//
//   Haven > Greenwood Trail (1) > Spitter Fen (10) > Ashen Ridge (20) > Warden's Keep (30)
//         > Frostfall Pass (40) > Sunscar Dunes (50) > Gloomcap Hollow (60)
//         > Stormspire Cliffs (70) > Obsidian Maw (80) > Starfall Sanctum (90, boss at 100)
//
// Haven's Waygate takes you straight to any map you have already reached.
//
// A map is described by a few numbers in MAPS; buildMap() turns that into the
// actual layout: where the portals, enemy spawn points, trees, rocks and
// houses are. The layout is generated from the map's name, so it is the same
// every time and the same for every player.
//
// Everything solid is in `obstacles`. The simulation stops heroes and enemies
// walking through them, and the renderer draws them, from this one list.
import { NPCS, SIGNS } from './story.js';
import { makeRng } from './rng.js';

// roster:  enemy types and how common each is on this map
// spawns:  how many enemies live here (each returns a while after it is killed)
// level:   enemy level at the entrance; it rises by up to levelSpan as you cross the map
// portals: where you can go from here; `angle` places the portal on the map's edge
export const MAPS = {
  town: {
    name: 'Haven', theme: 'town', safe: true, radius: 24, level: 0, levelSpan: 0,
    roster: {}, spawns: 0, trees: 16, rocks: 0, houses: 6,
    portals: [{ to: 'greenwood', angle: 0 }],
  },
  greenwood: {
    name: 'Greenwood Trail', theme: 'forest', radius: 46, level: 1, levelSpan: 8,
    roster: { grunt: 5, spitter: 1 }, spawns: 16, trees: 75, rocks: 10,
    portals: [{ to: 'town', angle: Math.PI }, { to: 'fen', angle: 0.35 }],
  },
  fen: {
    name: 'Spitter Fen', theme: 'swamp', radius: 46, level: 10, levelSpan: 9,
    roster: { spitter: 4, stalker: 2, grunt: 2 }, spawns: 18, trees: 42, rocks: 16,
    portals: [{ to: 'greenwood', angle: Math.PI + 0.35 }, { to: 'ridge', angle: -0.7 }],
  },
  ridge: {
    name: 'Ashen Ridge', theme: 'ash', radius: 48, level: 20, levelSpan: 9,
    roster: { imp: 4, grunt: 2, brute: 2, stalker: 2 }, spawns: 18, trees: 20, rocks: 48,
    portals: [{ to: 'fen', angle: Math.PI - 0.7 }, { to: 'keep', angle: 0.9 }],
  },
  keep: {
    name: "Warden's Keep", theme: 'keep', radius: 44, level: 30, levelSpan: 9,
    roster: { knight: 4, brute: 2, stalker: 2, spitter: 2 }, spawns: 15, trees: 6, rocks: 34,
    boss: 'boss', // The Warden waits in the middle and returns two minutes after it falls
    portals: [{ to: 'ridge', angle: Math.PI + 0.9 }, { to: 'frost', angle: -0.5 }],
  },
  frost: {
    name: 'Frostfall Pass', theme: 'frost', radius: 48, level: 40, levelSpan: 9,
    roster: { wolf: 5, shaman: 3, brute: 1 }, spawns: 18, trees: 55, rocks: 22,
    portals: [{ to: 'keep', angle: Math.PI - 0.5 }, { to: 'dunes', angle: 0.6 }],
  },
  dunes: {
    name: 'Sunscar Dunes', theme: 'desert', radius: 52, level: 50, levelSpan: 9,
    roster: { scarab: 4, golem: 2, imp: 3 }, spawns: 18, trees: 16, rocks: 30,
    portals: [{ to: 'frost', angle: Math.PI + 0.6 }, { to: 'hollow', angle: -0.3 }],
  },
  hollow: {
    name: 'Gloomcap Hollow', theme: 'fungal', radius: 46, level: 60, levelSpan: 9,
    roster: { sporecap: 4, wolf: 2, shaman: 2, golem: 1 }, spawns: 17, trees: 60, rocks: 14,
    boss: 'boss2',
    portals: [{ to: 'dunes', angle: Math.PI - 0.3 }, { to: 'spire', angle: 0.8 }],
  },
  spire: {
    name: 'Stormspire Cliffs', theme: 'storm', radius: 50, level: 70, levelSpan: 9,
    roster: { wraith: 4, knight: 3, wolf: 2 }, spawns: 18, trees: 24, rocks: 44,
    portals: [{ to: 'hollow', angle: Math.PI + 0.8 }, { to: 'maw', angle: -0.6 }],
  },
  maw: {
    name: 'Obsidian Maw', theme: 'volcano', radius: 50, level: 80, levelSpan: 9,
    roster: { imp: 4, golem: 3, knight: 2, wraith: 2 }, spawns: 19, trees: 26, rocks: 46,
    portals: [{ to: 'spire', angle: Math.PI - 0.6 }, { to: 'sanctum', angle: 0.4 }],
  },
  sanctum: {
    name: 'Starfall Sanctum', theme: 'astral', radius: 48, level: 90, levelSpan: 9,
    roster: { wraith: 3, knight: 3, shaman: 3, golem: 2 }, spawns: 18, trees: 34, rocks: 28,
    boss: 'boss3', // The Unmade: the level 100 fight
    portals: [{ to: 'maw', angle: Math.PI + 0.4 }],
  },
};
export const MAP_IDS = Object.keys(MAPS);

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Build the full layout of a map. */
export function buildMap(id) {
  const def = MAPS[id] || MAPS.town;
  if (!MAPS[id]) id = 'town';
  const rng = makeRng(hash(id));
  const R = def.radius;
  const far = (x, z, list, pad = 0) => list.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + pad);

  const portals = def.portals.map((g) => ({
    to: g.to, name: MAPS[g.to].name, angle: g.angle,
    x: Math.cos(g.angle) * (R - 4.5), z: Math.sin(g.angle) * (R - 4.5), r: 2.2,
  }));

  // Areas that must stay open: around portals, the town plaza, enemy spawn points.
  const keepClear = portals.map((g) => ({ x: g.x, z: g.z, r: 6 }));
  const obstacles = [];

  if (def.theme === 'town') {
    keepClear.push({ x: 0, z: 0, r: 9 });
    for (let i = 0; i < def.houses; i++) {
      const a = (i / def.houses) * Math.PI * 2 + 0.52;
      if (portals.some((g) => Math.abs(Math.atan2(Math.sin(a - g.angle), Math.cos(a - g.angle))) < 0.45)) continue; // leave the road to a portal open
      const x = Math.cos(a) * 15;
      const z = Math.sin(a) * 15;
      // A box: `rot` turns it to face the plaza; hw / hd are half the width and depth.
      obstacles.push({ kind: 'house', shape: 'box', x, z, hw: 2.6, hd: 2.2, rot: a + Math.PI / 2, height: 3 + (i % 2) * 0.8, r: 3.4 });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      obstacles.push({ kind: 'brazier', shape: 'circle', x: Math.cos(a) * 8, z: Math.sin(a) * 8, r: 0.5, lit: i % 2 === 0 });
    }
    obstacles.push({ kind: 'well', shape: 'circle', x: 0, z: -4.5, r: 1.3 });
  }
  // People to talk to (Haven) and signs to read (two on every map). See sim/story.js.
  if (def.theme === 'town') {
    for (const nid in NPCS) obstacles.push({ kind: 'npc', shape: 'circle', id: nid, name: NPCS[nid].name, x: NPCS[nid].at[0], z: NPCS[nid].at[1], r: 0.55 });
  }
  for (const sid in SIGNS) {
    const sg = SIGNS[sid];
    if (sg.map !== id) continue;
    let x, z;
    if (Array.isArray(sg.spot)) [x, z] = sg.spot;
    else {
      // 'in': a few steps inside the entrance, off to one side. 'out': the same by the far
      // portal, or on the far side of the middle when the road ends here.
      const gate = sg.spot === 'in' ? portals[0] : portals[1];
      if (gate) {
        const d = Math.hypot(gate.x, gate.z);
        const side = sg.spot === 'in' ? 1 : -1;
        x = gate.x * (1 - 8 / d) + (-gate.z / d) * 3.6 * side;
        z = gate.z * (1 - 8 / d) + (gate.x / d) * 3.6 * side;
      } else {
        const d = Math.hypot(portals[0].x, portals[0].z);
        x = (-portals[0].x / d) * 17;
        z = (-portals[0].z / d) * 17;
      }
    }
    obstacles.push({ kind: 'sign', shape: 'circle', id: sid, name: sg.title, x, z, r: 0.45 });
    keepClear.push({ x, z, r: 3 });
  }
  // The Waygate: fast travel to maps you have discovered. Stand on it like a portal.
  const waygate = def.theme === 'town' ? { x: 0, z: 5.5, r: 1.8 } : null;

  // Enemy spawn points, spread over the whole map.
  const spawns = [];
  const types = Object.keys(def.roster);
  const total = types.reduce((n, t) => n + def.roster[t], 0);
  if (def.boss) {
    spawns.push({ x: 0, z: 0, type: def.boss, level: def.level + def.levelSpan + 1, respawn: 120, r: 12 });
    keepClear.push({ x: 0, z: 0, r: 9 });
  }
  for (let tries = 0; spawns.length < def.spawns + (def.boss ? 1 : 0) && tries < 4000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 7 + Math.sqrt(rng()) * (R - 13);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!far(x, z, spawns, -1) || portals.some((g) => Math.hypot(g.x - x, g.z - z) < 11) || !far(x, z, obstacles, 3)) continue;
    let roll = rng() * total;
    let type = types[0];
    for (const t of types) {
      roll -= def.roster[t];
      if (roll <= 0) {
        type = t;
        break;
      }
    }
    // Enemies get tougher the further you are from the entrance (the first portal).
    const depth = Math.min(1, Math.hypot(x - portals[0].x, z - portals[0].z) / (2 * R - 12));
    spawns.push({ x, z, type, level: def.level + Math.round(def.levelSpan * depth), r: 6.5 });
  }
  for (const s of spawns) keepClear.push({ x: s.x, z: s.z, r: 2.5 });

  // Trees and rocks: solid, scattered wherever there is room.
  const scatter = (count, make) => {
    for (let n = 0, tries = 0; n < count && tries < count * 40; tries++) {
      const a = rng() * Math.PI * 2;
      const r = (def.theme === 'town' ? 11 : 3) + Math.sqrt(rng()) * (R - (def.theme === 'town' ? 12 : 4.5));
      const ob = make(Math.cos(a) * r, Math.sin(a) * r);
      if (!far(ob.x, ob.z, keepClear, ob.r) || !far(ob.x, ob.z, obstacles, ob.r + 1.6)) continue;
      obstacles.push(ob);
      n++;
    }
  };
  scatter(def.trees, (x, z) => {
    const scale = 0.8 + rng() * 0.7;
    return { kind: 'tree', shape: 'circle', x, z, r: 0.55 * scale, scale, turn: rng() * 6 };
  });
  scatter(def.rocks, (x, z) => {
    const r = 0.8 + rng() * 1.1;
    return { kind: 'rock', shape: 'circle', x, z, r, scale: r, turn: rng() * 6 };
  });

  return {
    id, name: def.name, theme: def.theme, safe: !!def.safe, radius: R,
    level: def.level, levelMax: def.level + def.levelSpan,
    portals, obstacles, spawns, waygate,
  };
}
