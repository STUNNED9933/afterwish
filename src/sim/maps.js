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
import { SETTLERS, SETTLER_SPOTS, GROWTH, WORKS, WORK_IDS, STATUE } from './wishkeep.js';
import { makeRng } from './rng.js';
import { dAtan2, dCos, dHypot, dSin } from './dmath.js';

// roster:  enemy types and how common each is on this map
// spawns:  how many enemies live here (each returns a while after it is killed)
// level:   enemy level at the entrance; it rises by up to levelSpan as you cross the map
// portals: where you can go from here; `angle` places the portal on the map's edge
export const MAPS = {
  town: {
    name: 'Haven', theme: 'town', safe: true, radius: 24, level: 0, levelSpan: 0,
    roster: {}, spawns: 0, trees: 16, rocks: 0, houses: 6,
    // (0.99.8) and, once your keep is open, a beacon home to it and one to the Verge (between the houses)
    portals: [{ to: 'greenwood', angle: 0 }, { to: 'wishkeep', angle: 2.09 }, { to: 'verge', angle: 4.19 }],
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
    boss: 'boss', // The Warden waits in the middle and returns a minute after it falls
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
  // The Wilds (0.33): one big open map for world tier II and up (so always level 100), with a bit of
  // every late region in it, more events, thieves, Storied enemies and merchants. Only by the Waygate.
  wilds: {
    name: 'The Shattered Wilds', theme: 'volcano', radius: 92, level: 90, levelSpan: 9, wilds: true, fromTier: 2,
    blurb: 'Huge and restless: world events, Wishthieves, Storied enemies and the merchant turn up far more often',
    roster: { wraith: 3, knight: 3, golem: 2, shaman: 2, wolf: 2, scarab: 2, sporecap: 2, imp: 2 }, spawns: 56, trees: 110, rocks: 80,
    portals: [{ to: 'town', angle: 0 }],
  },
  // Act II (0.39): the Queen's city under the Dunes, held up by star-glass. By the Waygate only,
  // once Wren has told you about it (quest 'w') and from world tier II (so level 100).
  asterfell: {
    name: 'Asterfell', theme: 'glass', radius: 62, level: 90, levelSpan: 9, fromTier: 2, unlock: 'w',
    blurb: "The Queen's city under the Dunes, still celebrating your naming day",
    roster: { glassbound: 4, courtguard: 3, wishling: 2, knight: 2, wraith: 1 }, spawns: 32, trees: 40, rocks: 30, houses: 22,
    boss: 'herald', // in the Frozen Court, the middle of the city (0.40)
    portals: [{ to: 'town', angle: 0 }],
  },
  // The Starwell (0.40): the round chamber where the star came down. Only the Asker is here.
  starwell: {
    name: 'The Starwell', theme: 'glass', radius: 30, level: 90, levelSpan: 9, fromTier: 2, unlock: 'court', song: 'starwell', bossOnly: true,
    blurb: 'Where the star came down. It will ask you what you want',
    roster: {}, spawns: 0, trees: 14, rocks: 10, boss: 'asker',
    portals: [{ to: 'town', angle: 0 }],
  },
  // The Deep (0.54, Act III): each Primordial's own domain, at the bottom of its Depth (sim/endgame.js DEEP).
  // Reached by the Waygate once that Depth is open; always at its own Depth, whatever is chosen in Haven.
  deep6: {
    name: 'The Ashen Deep', theme: 'deepash', radius: 44, level: 100, levelSpan: 0, deep: 6, song: 'starwell',
    blurb: 'Embers that never cool, and ash falling upward. The Cinder is waiting',
    roster: { ashwalker: 4, grunt: 3, brute: 2, imp: 3 }, spawns: 22, trees: 18, rocks: 30, boss: 'cinder',
    portals: [{ to: 'town', angle: 0 }],
  },
  deep7: {
    name: 'The Drowned Court', theme: 'drowned', radius: 46, level: 100, levelSpan: 0, deep: 7, song: 'starwell',
    blurb: 'The first Asterfell, under the second, forgotten on purpose',
    roster: { unnamed: 5, glassbound: 3, courtguard: 2, wraith: 2 }, spawns: 24, trees: 16, rocks: 26, houses: 10, boss: 'undertow',
    portals: [{ to: 'town', angle: 0 }],
  },
  deep8: {
    name: 'The Undergrowth', theme: 'rootdeep', radius: 46, level: 100, levelSpan: 0, deep: 8, song: 'starwell',
    blurb: 'Roots older than the mountain. Everything here is still growing',
    roster: { rootbound: 4, sporecap: 3, shaman: 2, golem: 2 }, spawns: 24, trees: 40, rocks: 20, boss: 'rootmother',
    portals: [{ to: 'town', angle: 0 }],
  },
  deep9: {
    name: 'The Glass Choir', theme: 'choir', radius: 44, level: 100, levelSpan: 0, deep: 9, song: 'starwell',
    blurb: 'Every voice the mountain lost, still singing. Yours among them',
    roster: { echo: 4, wishling: 3, stalker: 2, spitter: 2 }, spawns: 22, trees: 24, rocks: 24, boss: 'choir',
    portals: [{ to: 'town', angle: 0 }],
  },
  // Caelum (0.64, sim/endgame.js CAELUM): where the Granted live, above the Starwell. Laid out as roads
  // (layout 'road'): a way from the entrance to the keeper at the far end, camps with a captain off to
  // either side, side paths to shrines (a stone to read and a chest), rough ground everywhere else.
  skyroad: {
    name: 'The Sky Road', theme: 'caelum', radius: 62, level: 100, levelSpan: 0, layout: 'road', caelum: true, camps: 4, patrols: 6,
    blurb: 'White stone over nothing, and a door at the end of it',
    roster: { answered: 3, cantor: 2, wishmote: 2, veiled: 1 }, spawns: 0, trees: 50, rocks: 120, boss: 'ianitor',
    portals: [{ to: 'town', angle: Math.PI }, { to: 'answers', angle: 0 }],
  },
  answers: {
    name: 'The Court of Answers', theme: 'caelum', radius: 64, level: 100, levelSpan: 0, layout: 'road', caelum: true, camps: 4, patrols: 7,
    blurb: 'Every question asked on the mountain, answered, and filed',
    roster: { answered: 3, cantor: 3, thurifer: 2, colossus: 1 }, spawns: 0, trees: 60, rocks: 110, boss: 'arbiter',
    portals: [{ to: 'skyroad', angle: Math.PI }, { to: 'wants', angle: 0 }],
  },
  wants: {
    name: 'The Hall of Wants', theme: 'caelum', radius: 66, level: 100, levelSpan: 0, layout: 'road', caelum: true, camps: 5, patrols: 7,
    blurb: 'Everything anyone ever wished for, heaped up and still wanted',
    roster: { veiled: 3, thurifer: 2, wishmote: 3, colossus: 1, answered: 1 }, spawns: 0, trees: 50, rocks: 130, boss: 'desiderium',
    portals: [{ to: 'answers', angle: Math.PI }, { to: 'zenith', angle: 0 }],
  },
  zenith: {
    name: 'The Zenith', theme: 'caelum', radius: 68, level: 100, levelSpan: 0, layout: 'road', caelum: true, camps: 5, patrols: 8,
    blurb: 'The top of the sky. Something there has never once said no',
    roster: { answered: 2, cantor: 2, thurifer: 1, colossus: 2, veiled: 2 }, spawns: 0, trees: 40, rocks: 140, boss: 'fiat',
    portals: [{ to: 'wants', angle: Math.PI }],
  },
  // The Wishkeep (0.80, sim/wishkeep.js): the account's sanctuary. Haven's look, its own layout (buildMap):
  // the Hearth and Altar in the middle, the wishes board, four halls, the settlers, a Waygate home.
  // By the Waygate only, once any class has beaten the Quiet; always a copy of your own.
  wishkeep: {
    name: 'The Wishkeep', theme: 'town', safe: true, wishkeep: true, radius: 32, level: 100, levelSpan: 0,
    blurb: 'The people the Unmade took from, and the fire they keep for you',
    roster: {}, spawns: 0, trees: 26, rocks: 6, houses: 0,
    portals: [{ to: 'town', angle: Math.PI }, { to: 'verge', angle: -0.8 }], // (1.0) and out to the Verge, north-east (clear of the Unmade's ways in)
  },
  // (1.0) The Verge: out past the Wishkeep, where the ways part. A way down to the Deep and a way up to
  // Caelum (stand on one: the list of where it goes), and a crack in the air that nobody can explain yet.
  verge: {
    name: 'The Verge', theme: 'forest', safe: true, verge: true, radius: 30, level: 100, levelSpan: 0,
    blurb: "Where the keep's road ends: a way down, a way up, and a crack in the air",
    roster: {}, spawns: 0, trees: 34, rocks: 14, houses: 0,
    portals: [{ to: 'wishkeep', angle: Math.PI / 2 }, { to: 'town', angle: Math.PI }], // (0.99.8) and a beacon down to Haven
  },
  deep10: {
    name: 'The Quiet', theme: 'quiet', radius: 42, level: 100, levelSpan: 0, deep: 10, song: 'starwell',
    blurb: 'Nothing, and room for it',
    roster: { hush: 5, ashwalker: 1, unnamed: 1, rootbound: 1, echo: 1 }, spawns: 20, trees: 6, rocks: 14, boss: 'stillness',
    portals: [{ to: 'town', angle: 0 }],
  },
};
export const MAP_IDS = Object.keys(MAPS);

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Build the full layout of a map. */
export function buildMap(id, custom = null) {
  // `custom` (Echo Rifts): { def, key } builds a map from a made-up description instead.
  const def = custom ? custom.def : MAPS[id] || MAPS.town;
  if (!custom && !MAPS[id]) id = 'town';
  const rng = makeRng(hash(custom ? custom.key : id));
  const R = def.radius;
  const far = (x, z, list, pad = 0) => list.every((o) => dHypot(o.x - x, o.z - z) >= o.r + pad);

  const portals = def.portals.map((g) => ({
    to: g.to, name: MAPS[g.to].name, angle: g.angle,
    x: dCos(g.angle) * (R - 4.5), z: dSin(g.angle) * (R - 4.5), r: 2.2,
  }));

  // Areas that must stay open: around portals, the town plaza, enemy spawn points.
  const keepClear = portals.map((g) => ({ x: g.x, z: g.z, r: 6 }));
  const obstacles = [];
  const road = def.layout === 'road' && !custom ? layRoad(def, R, portals, rng, keepClear, obstacles) : null;

  if (def.houses && def.theme !== 'town') {
    // A buried city (Asterfell): houses along two rings of streets, gaps left for the roads.
    for (let i = 0; i < def.houses; i++) {
      const ring = i % 2 ? 0.42 : 0.7;
      const a = (i / def.houses) * Math.PI * 2 + rng() * 0.18;
      if (portals.some((g) => Math.abs(dAtan2(dSin(a - g.angle), dCos(a - g.angle))) < 0.3)) continue;
      const x = dCos(a) * R * ring, z = dSin(a) * R * ring;
      if (Object.values(SIGNS).some((sg) => sg.map === id && Array.isArray(sg.spot) && dHypot(sg.spot[0] - x, sg.spot[1] - z) < 7)) continue; // not on a sign
      obstacles.push({ kind: 'house', shape: 'box', x, z, hw: 2.4 + rng() * 1.2, hd: 2.0 + rng(), rot: a + Math.PI / 2, height: 3.2 + rng() * 2.4, r: 3.6 });
      keepClear.push({ x, z, r: 4.5 });
    }
  }
  if (def.wishkeep) layKeep(R, obstacles, keepClear, def.keepStage || 0);
  // (1.0) The Verge: two crossings (stand on one: where it goes) and the crack (G: look at it)
  const crossings = def.verge ? [{ kind: 'deep', name: 'The Way Down', x: -10, z: -7, r: 2 }, { kind: 'caelum', name: 'The Way Up', x: 10, z: -7, r: 2 }] : null;
  if (def.verge) {
    for (const c of crossings) keepClear.push({ x: c.x, z: c.z, r: 6 });
    obstacles.push({ kind: 'crack', shape: 'circle', id: 'crack', name: 'A crack in the air', x: 0, z: -17, r: 1.1, pickR: 2.2, reach: 1.6 });
    keepClear.push({ x: 0, z: -17, r: 6 }, { x: 0, z: 0, r: 8 });
  }
  if (def.theme === 'town' && !def.wishkeep) {
    keepClear.push({ x: 0, z: 0, r: 9 });
    for (let i = 0; i < def.houses; i++) {
      const a = (i / def.houses) * Math.PI * 2 + 0.52;
      if (portals.some((g) => Math.abs(dAtan2(dSin(a - g.angle), dCos(a - g.angle))) < 0.45)) continue; // leave the road to a portal open
      const x = dCos(a) * 15;
      const z = dSin(a) * 15;
      // A box: `rot` turns it to face the plaza; hw / hd are half the width and depth.
      obstacles.push({ kind: 'house', shape: 'box', x, z, hw: 2.6, hd: 2.2, rot: a + Math.PI / 2, height: 3 + (i % 2) * 0.8, r: 3.4 });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      obstacles.push({ kind: 'brazier', shape: 'circle', x: dCos(a) * 8, z: dSin(a) * 8, r: 0.5, lit: i % 2 === 0 });
    }
    obstacles.push({ kind: 'well', shape: 'circle', x: 0, z: -4.5, r: 1.3 });
    // The bounty board (0.33)
    obstacles.push({ kind: 'board', shape: 'circle', id: 'bounties', name: 'Bounty Board', x: 4.6, z: 0.4, r: 0.6, pickR: 1.3 });
    // (0.59) The Echo Ring's stones: wake the Ring from Haven. (0.61) On the west side, opposite the road
    // out and well clear of the Waygate; you walk into the circle (it blocks nobody) and press G.
    obstacles.push({ kind: 'ring', shape: 'circle', id: 'ringstones', name: 'The Echo Ring', x: -15.2, z: -0.4, r: 2.3, pickR: 3.2, soft: true });
  }
  // People to talk to (Haven) and signs to read (two on every map). See sim/story.js.
  // ((1.0) a second copy of the buried city's houses stood here, so Asterfell had them twice, on top of each other)
  if (def.theme === 'town' && !def.wishkeep) {
    // (0.58.1) Someone who is here for some heroes and not others (by their own story) never blocks the
    // way, so a shared Haven on the server moves everyone the same way whatever each of them sees.
    for (const nid in NPCS) if (NPCS[nid].at) obstacles.push({ kind: 'npc', shape: 'circle', id: nid, name: NPCS[nid].name, x: NPCS[nid].at[0], z: NPCS[nid].at[1], r: 0.55, ...(NPCS[nid].onlyAfter || NPCS[nid].onlyFlag || nid === 'odile' ? { soft: true } : {}) });
  }
  for (const sid in SIGNS) {
    const sg = SIGNS[sid];
    if (sg.map !== id) continue;
    let x, z;
    if (Array.isArray(sg.spot)) [x, z] = sg.spot;
    else if (road && /^shrine\d$/.test(sg.spot)) {
      const sh = road.shrines[Number(sg.spot.slice(6)) - 1];
      if (!sh) continue;
      x = sh.x + sh.nx * 2.4;
      z = sh.z + sh.nz * 2.4;
    } else {
      // 'in': a few steps inside the entrance, off to one side. 'out': the same by the far
      // portal, or on the far side of the middle when the road ends here.
      const gate = sg.spot === 'in' ? portals[0] : portals[1];
      if (gate) {
        const d = dHypot(gate.x, gate.z);
        const side = sg.spot === 'in' ? 1 : -1;
        x = gate.x * (1 - 8 / d) + (-gate.z / d) * 3.6 * side;
        z = gate.z * (1 - 8 / d) + (gate.x / d) * 3.6 * side;
      } else {
        const d = dHypot(portals[0].x, portals[0].z);
        x = (-portals[0].x / d) * 17;
        z = (-portals[0].z / d) * 17;
      }
    }
    obstacles.push({ kind: 'sign', shape: 'circle', id: sid, name: sg.title, x, z, r: 0.45 });
    keepClear.push({ x, z, r: 3 });
  }
  // The Waygate: fast travel to maps you have discovered. Stand on it like a portal.
  // (0.99.10) Where you arrive when you did not come through one of its portals (logging in, the Waygate):
  // in the keep, between the Hearth and the Waygate, facing the Hearth; on the Verge, in the middle, facing the crack.
  const centre = def.wishkeep ? { x: 0, z: 5.5, facing: -Math.PI / 2 } : def.verge ? { x: 0, z: 0, facing: -Math.PI / 2 } : null;
  const waygate = def.wishkeep ? { x: 0, z: 9, r: 1.8 } : def.theme === 'town' ? { x: 0, z: 5.5, r: 1.8 } : null;

  // Waystones (out in the world): one by the entrance, where fallen teammates wake up, and one
  // on the far side. Stand on one to jump to the other (just you), or travel on like the Waygate.
  const waystones = [];
  if (def.theme !== 'town' && !def.verge && portals.length && !custom) {
    const g = portals[0];
    const d = dHypot(g.x, g.z);
    waystones.push({ x: g.x * (1 - 10 / d) + (g.z / d) * 4, z: g.z * (1 - 10 / d) - (g.x / d) * 4, r: 1.5, name: 'Entrance waystone' });
    if (road) waystones.push({ x: road.far.x, z: road.far.z, r: 1.5, name: 'Far waystone' }); // (0.64) on the road, before the keeper
    else waystones.push({ x: (-g.x / d) * R * 0.62, z: (-g.z / d) * R * 0.62, r: 1.5, name: 'Far waystone' });
    for (const w of waystones) keepClear.push({ x: w.x, z: w.z, r: 3.5 });
  }

  // Enemy spawn points, spread over the whole map.
  const spawns = [];
  const types = Object.keys(def.roster);
  const total = types.reduce((n, t) => n + def.roster[t], 0);
  if (road) {
    for (const sp of road.spawns) spawns.push(sp);
  } else if (def.boss) {
    spawns.push({ x: 0, z: 0, type: def.boss, level: def.level + def.levelSpan + 1, respawn: def.boss === 'boss3' ? 120 : 60, r: 12 }); // the final boss takes longer
    keepClear.push({ x: 0, z: 0, r: 9 });
  }
  for (let tries = 0; !road && spawns.length < def.spawns + (def.boss ? 1 : 0) && tries < 4000; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 7 + Math.sqrt(rng()) * (R - 13);
    const x = dCos(a) * r;
    const z = dSin(a) * r;
    if (def.boss === 'boss3' && dHypot(x, z) < 24) continue; // the final boss's ground stays clear of small fry
    if (!far(x, z, spawns, -1) || portals.some((g) => dHypot(g.x - x, g.z - z) < 11) || waystones.some((w) => dHypot(w.x - x, w.z - z) < 9) || !far(x, z, obstacles, 3)) continue;
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
    const depth = Math.min(1, dHypot(x - portals[0].x, z - portals[0].z) / (2 * R - 12));
    spawns.push({ x, z, type, level: def.level + Math.round(def.levelSpan * depth), r: 6.5 });
  }
  for (const s of spawns) keepClear.push({ x: s.x, z: s.z, r: 2.5 });

  // Trees and rocks: solid, scattered wherever there is room.
  const scatter = (count, make) => {
    for (let n = 0, tries = 0; n < count && tries < count * 40; tries++) {
      const a = rng() * Math.PI * 2;
      const r = (def.theme === 'town' ? 11 : 3) + Math.sqrt(rng()) * (R - (def.theme === 'town' ? 12 : 4.5));
      const ob = make(dCos(a) * r, dSin(a) * r);
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

  if (id === 'asterfell') {
    // The palace stair (0.46): the way down into the delves, beside the city gate.
    const door = { kind: 'delve', shape: 'circle', id: 'delve', name: 'The palace stair', x: R - 11, z: 6, r: 1.3 };
    const clear = (o) => dHypot(o.x - door.x, o.z - door.z) >= o.r + 3.5;
    while (!obstacles.filter((o) => o.kind === 'sign' || o.kind === 'npc').every(clear)) door.z += 3; // never on a sign
    for (let i = obstacles.length - 1; i >= 0; i--) if (!clear(obstacles[i]) && obstacles[i].kind !== 'sign') obstacles.splice(i, 1);
    obstacles.push(door);
  }

  return {
    id, name: def.name, theme: def.theme, song: def.song || null, safe: !!def.safe, radius: R, wilds: !!def.wilds,
    level: def.level, levelMax: def.level + def.levelSpan, deep: def.deep || 0,
    portals, obstacles, spawns, waygate, waystones, ...(crossings ? { crossings } : {}), ...(centre ? { centre } : {}), ...(def.wishkeep ? { gates: [0, 1.571, 2.75, 4.712].map((a) => ({ x: dCos(a) * (R - 4), z: dSin(a) * (R - 4) })) } : {}),
    ...(road ? { road: road.line, sidePaths: road.sidePaths, chestSpots: road.shrines.map((sh) => ({ x: sh.x - sh.nx * 1.5, z: sh.z - sh.nz * 1.5 })), arena: road.arena } : {}),
  };
}

/** (0.82.1) The Wishkeep's map at a stage of its growth: wider, with more trees and cottages. */
export function buildKeepMap(stage = 0) {
  const st = Math.max(0, Math.min(GROWTH.at.length - 1, Math.floor(stage) || 0));
  const def = Object.assign({}, MAPS.wishkeep, { radius: GROWTH.radius(st), trees: MAPS.wishkeep.trees + 6 * st, rocks: MAPS.wishkeep.rocks + 2 * st, keepStage: st });
  const m = buildMap('wishkeep', { def, key: 'wishkeep' });
  m.keepStage = st;
  return m;
}

/**
 * (0.80) The Wishkeep's ground: the Hearth's Altar in the middle, the wishes board, four braziers, the four
 * class halls round the plaza (a hall, and a banner in front of it you speak to), and a spot for each settler
 * (world.js leaves out those who have not come yet).
 */
function layKeep(R, obstacles, keepClear, stage = 0) {
  keepClear.push({ x: 0, z: 0, r: 11 }, { x: 0, z: 9, r: 3 });
  // (0.82.1) the works, out past the halls: mines (a mouth in the rock) and fields (rows of grain);
  // (0.88) more of them as the keep grows
  const shut = [0, 1.571, 2.75, 4.712, Math.PI]; // gates, the road home
  for (const id of WORK_IDS) {
    const W = WORKS[id];
    if (W.stage > stage) continue;
    const x = dCos(W.a) * W.r, z = dSin(W.a) * W.r;
    obstacles.push({ kind: 'works', shape: 'circle', id, work: W.kind, name: W.name, x, z, r: 1, soft: true, pickR: 2.2, reach: 2.6 });
    // (0.99.3) the mine's rock is solid: its mouth (where you speak to it) at the spot, its body behind, away from the Hearth
    if (W.kind === 'mine') obstacles.push({ kind: 'minebody', shape: 'circle', id: id + '_rock', x: dCos(W.a) * (W.r + 3.3), z: dSin(W.a) * (W.r + 3.3), r: 2.7 });
    keepClear.push({ x, z, r: W.kind === 'mine' ? 5 : 6 });
    shut.push(W.a);
  }
  // (0.82.1) cottages, more as the keep grows, round the edge (never on a gate, the road home or the works)
  let placed = 0;
  for (let i = 0; i < 40 && placed < 2 * stage; i++) {
    const a = ((i * 0.618034) % 1) * Math.PI * 2;
    if (shut.some((b) => Math.abs(dAtan2(dSin(a - b), dCos(a - b))) < 0.22)) continue;
    const rr = R - 7 - (placed % 2) * 2;
    const x = dCos(a) * rr, z = dSin(a) * rr;
    obstacles.push({ kind: 'house', shape: 'box', x, z, hw: 2.1, hd: 1.8, rot: a + Math.PI / 2, height: 3.2, r: 3.1, cottage: true });
    keepClear.push({ x, z, r: 4 });
    placed++;
  }
  obstacles.push({ kind: 'keepaltar', shape: 'circle', id: 'keepaltar', name: 'The Hearth', x: 0, z: 0, r: 1.6, pickR: 2.4 });
  obstacles.push({ kind: 'statue', shape: 'circle', id: 'seraph', name: 'The Seraph', x: STATUE.at.x, z: STATUE.at.z, r: 1.0, pickR: 2.4 }); // (0.92) its plinth, empty until the worshippers raise it
  obstacles.push({ kind: 'board', shape: 'circle', id: 'wishes', name: 'The Wishes', x: 4.6, z: 1.6, r: 0.6, pickR: 1.3 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    obstacles.push({ kind: 'brazier', shape: 'circle', x: dCos(a) * 8.6, z: dSin(a) * 8.6, r: 0.5, lit: true });
  }
  const halls = [['warrior', -2.36], ['archer', -0.79], ['mage', 0.79], ['rogue', 2.36]];
  for (const [cls, a] of halls) {
    const x = dCos(a) * 17, z = dSin(a) * 17;
    obstacles.push({ kind: 'house', shape: 'box', x, z, hw: 3.4, hd: 2.8, rot: a + Math.PI / 2, height: 4.6, r: 4.4, hall: cls });
    keepClear.push({ x, z, r: 6 });
    const bx = dCos(a) * 12.4, bz = dSin(a) * 12.4;
    obstacles.push({ kind: 'hall', shape: 'circle', id: 'hall_' + cls, cls, name: 'hall', x: bx, z: bz, r: 0.5, soft: true, pickR: 1.4 });
    keepClear.push({ x: bx, z: bz, r: 2 });
  }
  for (const id in SETTLER_SPOTS) {
    const [x, z] = SETTLER_SPOTS[id];
    obstacles.push({ kind: 'npc', shape: 'circle', id, name: SETTLERS[id].name, x, z, r: 0.55 }); // (0.99.3) solid: in nobody's keep only some see them
  }
  keepClear.push({ x: -R + 4.5, z: 0, r: 8 }); // the road home
}

/**
 * A road map (0.64): from the entrance across to the far side, winding, the keeper at its end and the
 * way on (the second portal) past it. Fills `keepClear` along everything that must stay walkable, puts
 * pillars round the keeper's arena into `obstacles`, and returns the spawn points it chose: camps of
 * four off to either side (the one in the middle always an elite, `elite: true`), a few on the road.
 */
function layRoad(def, R, portals, rng, keepClear, obstacles) {
  const g = portals[0];
  const gd = dHypot(g.x, g.z);
  const ux = -g.x / gd, uz = -g.z / gd; // across the map, away from the way in
  const nx = -uz, nz = ux; // and to one side of that
  const sx = g.x + ux * 9, sz = g.z + uz * 9;
  const bx = ux * (R - 18), bz = uz * (R - 18); // the keeper's ground
  const amp = R * (0.36 + rng() * 0.1), ph = rng() * Math.PI * 2, turns = 1.5 + rng() * 0.6;
  const at = (t) => {
    const side = dSin(t * Math.PI * turns + ph) * amp * dSin(t * Math.PI);
    let x = sx + (bx - sx) * t + nx * side, z = sz + (bz - sz) * t + nz * side;
    const d = dHypot(x, z);
    if (d > R - 10) { x *= (R - 10) / d; z *= (R - 10) / d; }
    return { x, z };
  };
  const line = [];
  for (let i = 0; i <= 28; i++) {
    const q = at(i / 28);
    line.push([q.x, q.z]);
  }
  line.unshift([g.x, g.z]);
  const out = portals[1];
  if (out) line.push([out.x, out.z]);
  const clearLine = (pts, r) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const n = Math.max(1, Math.ceil(dHypot(x1 - x0, z1 - z0) / 2.2));
      for (let k = 0; k <= n; k++) keepClear.push({ x: x0 + ((x1 - x0) * k) / n, z: z0 + ((z1 - z0) * k) / n, r });
    }
  };
  clearLine(line, 3.6);
  // the arena: open ground, pillars round it with gaps for the road in and out
  keepClear.push({ x: bx, z: bz, r: 12 });
  const inA = dAtan2(line[line.length - (out ? 4 : 3)][1] - bz, line[line.length - (out ? 4 : 3)][0] - bx);
  const outA = out ? dAtan2(out.z - bz, out.x - bx) : null;
  const types = Object.keys(def.roster);
  const total = types.reduce((n, t) => n + def.roster[t], 0);
  const pick = () => {
    let roll = rng() * total;
    for (const t of types) if ((roll -= def.roster[t]) <= 0) return t;
    return types[0];
  };
  const inside = (x, z, m) => {
    const d = dHypot(x, z);
    return d > R - m ? { x: (x * (R - m)) / d, z: (z * (R - m)) / d } : { x, z };
  };
  const spawns = [{ x: bx, z: bz, type: def.boss, level: def.level + def.levelSpan + 1, respawn: 120, r: 12 }];
  // camps, alternating sides of the road, with a short spur out to each
  const camps = [];
  for (let i = 0; i < def.camps; i++) {
    const t = 0.16 + (0.66 * i) / Math.max(1, def.camps - 1);
    const q = at(t);
    const side = i % 2 ? 1 : -1;
    const c = inside(q.x + nx * side * (10 + rng() * 3), q.z + nz * side * (10 + rng() * 3), 9);
    camps.push(c);
    clearLine([[q.x, q.z], [c.x, c.z]], 2.8);
    keepClear.push({ x: c.x, z: c.z, r: 6.5 });
    spawns.push({ x: c.x, z: c.z, type: pick(), level: def.level, r: 6.5, elite: true });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rng();
      spawns.push({ x: c.x + dCos(a) * 3.4, z: c.z + dSin(a) * 3.4, type: pick(), level: def.level, r: 6.5 });
    }
  }
  // on the road itself, between the camps
  for (let i = 0; i < def.patrols; i++) {
    const q = at(0.1 + (0.78 * (i + 0.5)) / def.patrols);
    spawns.push({ x: q.x + nx * (rng() - 0.5) * 3, z: q.z + nz * (rng() - 0.5) * 3, type: pick(), level: def.level, r: 6.5 });
  }
  // two side paths, each to a shrine: out on the side away from the nearest camp
  const shrines = [], sidePaths = [];
  for (const t of [0.34, 0.7]) {
    const q = at(t);
    const near = camps.reduce((b, c) => (dHypot(c.x - q.x, c.z - q.z) < dHypot(b.x - q.x, b.z - q.z) ? c : b), camps[0] || q);
    const side = (near.x - q.x) * nx + (near.z - q.z) * nz > 0 ? -1 : 1;
    const mid = inside(q.x + nx * side * 10 + ux * 4, q.z + nz * side * 10 + uz * 4, 9);
    const end = inside(q.x + nx * side * 20 + ux * 2, q.z + nz * side * 20 + uz * 2, 8);
    const path = [[q.x, q.z], [mid.x, mid.z], [end.x, end.z]];
    sidePaths.push(path);
    clearLine(path, 2.6);
    keepClear.push({ x: end.x, z: end.z, r: 5 });
    const d = dHypot(end.x - mid.x, end.z - mid.z) || 1;
    shrines.push({ x: end.x, z: end.z, nx: (end.x - mid.x) / d, nz: (end.z - mid.z) / d });
  }
  // outposts: the ground furthest from everything above, reached by a path of their own, a harder camp
  // (a captain and four) and a chest at the end. Exploring is paid for.
  const outposts = [];
  const taken = () => [...line.map(([x, z]) => ({ x, z })), ...camps, ...shrines, ...outposts, { x: bx, z: bz }];
  for (let o = 0; o < (def.outposts ?? 2); o++) {
    let best = null, bd = 22;
    for (let gx = -R; gx <= R; gx += 4) {
      for (let gz = -R; gz <= R; gz += 4) {
        if (dHypot(gx, gz) > R - 11) continue;
        const d = taken().reduce((m, q) => Math.min(m, dHypot(q.x - gx, q.z - gz)), 1e9);
        if (d > bd) { bd = d; best = { x: gx, z: gz }; }
      }
    }
    if (!best) break;
    const from = line.slice(1, -1).reduce((b, q) => (dHypot(q[0] - best.x, q[1] - best.z) < dHypot(b[0] - best.x, b[1] - best.z) ? q : b), line[1]);
    const mx = (from[0] + best.x) / 2 + (rng() - 0.5) * 8, mz = (from[1] + best.z) / 2 + (rng() - 0.5) * 8;
    const path = [[from[0], from[1]], [mx, mz], [best.x, best.z]];
    sidePaths.push(path);
    clearLine(path, 2.6);
    keepClear.push({ x: best.x, z: best.z, r: 7 });
    outposts.push(best);
    spawns.push({ x: best.x, z: best.z, type: pick(), level: def.level, r: 7, elite: true });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rng();
      spawns.push({ x: best.x + dCos(a) * 3.8, z: best.z + dSin(a) * 3.8, type: pick(), level: def.level, r: 7 });
    }
    const d = dHypot(best.x - mx, best.z - mz) || 1;
    shrines.push({ x: best.x + ((best.x - mx) / d) * 4.5, z: best.z + ((best.z - mz) / d) * 4.5, nx: (best.x - mx) / d, nz: (best.z - mz) / d, outpost: true });
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const off = (b) => Math.abs(dAtan2(dSin(a - b), dCos(a - b)));
    if (off(inA) < 0.5 || (outA != null && off(outA) < 0.5)) continue;
    const px = bx + dCos(a) * 13.5, pz = bz + dSin(a) * 13.5;
    if (spawns.some((sp) => dHypot(sp.x - px, sp.z - pz) < 3)) continue;
    obstacles.push({ kind: 'tree', shape: 'circle', x: px, z: pz, r: 0.7, scale: 1.3, turn: a });
  }
  for (const sp of spawns) keepClear.push({ x: sp.x, z: sp.z, r: 2.5 });
  const far = at(0.8);
  return { line, sidePaths, shrines, spawns, far: { x: far.x + nx * 4, z: far.z + nz * 4 }, arena: { x: bx, z: bz, r: 12 } };
}

/**
 * Asterfell delves (0.46): the palace under the city, room by room. Each room is a small round hall
 * of the palace, its enemies placed by the world (not camps), with one way out, back up to the city.
 */
export const DELVE_ROOMS = [
  { name: "Bakers' Row", line: 'The ovens are still warm. The bread in them has been rising for nineteen years.' },
  { name: 'The Guard Hall', line: 'Every spear is polished. Every bed is made. Nobody has slept in them.' },
  { name: 'The Ballroom', line: 'The musicians have their bows lifted, waiting for a first note that never came.' },
  { name: 'The Royal Nursery', line: 'A cradle, a rattle, a little coat on a hook. The coat is your size, once.' },
  { name: 'The Throne Room', line: 'Her chair is empty. Something sits beside it, waiting for her to come home.' },
];
/** Which rooms a delve of this many rooms goes through (the Throne Room is always last). */
export function delveRoute(n) {
  return n >= 5 ? [0, 1, 2, 3, 4] : n === 4 ? [0, 1, 3, 4] : [0, 3, 4];
}
export function buildDelveRoom(roomIdx, seed) {
  const def = {
    name: 'Asterfell delve · ' + DELVE_ROOMS[roomIdx].name, theme: 'glass', radius: 21, level: 100, levelSpan: 0, song: 'asterfell',
    roster: {}, spawns: 0, trees: 0, rocks: 8, houses: 0, boss: null,
    portals: [{ to: 'asterfell', angle: Math.PI }],
  };
  const map = buildMap('delve', { def, key: `delve:${roomIdx}:${seed}` });
  map.id = 'delve';
  map.room = roomIdx;
  return map;
}

/**
 * An Echo Rift (0.26): one of the maps out in the world, rearranged by `seed`, with about twice
 * as many enemies, no boss of its own (the rift's guardian comes when enough have fallen) and a
 * single way out, back to Haven.
 */
export function buildRiftMap(theme, seed) {
  const base = MAPS[theme] || MAPS.greenwood;
  const def = Object.assign({}, base, {
    name: 'Echo Rift',
    spawns: Math.round(base.spawns * 1.9),
    boss: null,
    portals: [{ to: 'town', angle: base.portals[0].angle }],
  });
  const map = buildMap('rift', { def, key: `rift:${theme}:${seed}` });
  map.id = 'rift';
  map.riftTheme = theme;
  return map;
}
