// What travels between the host and the friends who join them.
//
// The host's browser runs the one true World (sim/world.js) with every hero in
// it. About 20 times a second it sends each friend a snapshot: the map, the
// enemies, shots, warnings on the ground, the other heroes, and that friend's
// own hero. Friends send back commands (the same {type: 'move' ...} objects
// the keyboard and mouse already produce). Nothing here touches the screen.

import { ENEMIES } from '../sim/defs.js';
import { buildRiftMap } from '../sim/maps.js';

export const NET_VERSION = 3; // host and friends must run the same build of the rules (3: 0.26 tiers and rifts)

/** Hero fields that rarely change and are big: sent only when they change. */
const HEAVY = ['equipped', 'bag', 'quests', 'signs', 'visited', 'bossKills', 'talents', 'ranks'];

/** Events everyone in the party should see, whoever caused them. Everything else is personal. */
const PUBLIC = new Set(['death', 'spawn', 'windup', 'strike', 'impact', 'burst', 'zoneTick', 'orbTick', 'shatter', 'starfall', 'starImpact', 'bossLeap', 'bossPhase', 'itemDropped', 'shieldBreak', 'riftGuardian', 'riftLate', 'riftStart', 'tierSet', 'frostShatter', 'chestOpen', 'mark', 'markPop', 'shadowSwap', 'shadowSlash', 'starBolt', 'smoulder', 'emberTick', 'burnSpread', 'wallRise', 'wallShatter', 'motes', 'slowStart', 'slowEnd', 'enrage', 'stagger', 'postureHit', 'lightning', 'partyJoin', 'partyLeave']);
export function isPublic(ev) {
  return PUBLIC.has(ev.type) || (ev.type === 'damage' && ev.who === 'enemy');
}
/** Should the hero `pid` see this event? */
export function eventFor(ev, pid) {
  return ev.hero === pid || ev.hero === undefined || isPublic(ev);
}

const r2 = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
const ENEMY_KEYS = ['id', 'type', 'phase', 'elite', 'shield', 'maxShield', 'riftGuardian', 'x', 'z', 'px', 'pz', 'facing', 'state', 't', 'dur', 'moving', 'hitFlash', 'vulnT', 'slowT', 'bleedT', 'markT', 'burnT', 'burnStacks', 'smoulderT', 'frostStacks', 'frostT', 'frostLock', 'brittle', 'bleedFire', 'patience', 'returning', 'enraged', 'cue', 'atkName', 'hp', 'maxHp', 'level', 'aggro', 'radius', 'dead'];
const PROJ_KEYS = ['id', 'owner', 'kind', 'x', 'z', 'px', 'pz', 'parryable', 'reflected', 'radius', 'pid', 'ice'];
const TELE_KEYS = ['id', 'kind', 'x', 'z', 'dir', 'radius', 'range', 'angle', 'length', 'width', 't', 'dur', 'parryable', 'friendly', 'cue'];
const pack = (o, keys) => keys.map((k) => r2(o[k]));
const unpack = (a, keys) => {
  const o = {};
  keys.forEach((k, i) => {
    if (a[i] !== null && a[i] !== undefined) o[k] = a[i];
  });
  return o;
};

/** Light hero state: everything except the HEAVY parts. */
function lightPlayer(p) {
  const out = {};
  for (const k in p) if (!HEAVY.includes(k)) out[k] = p[k];
  return out;
}
function heavyPlayer(p) {
  const out = {};
  for (const k of HEAVY) out[k] = p[k];
  return out;
}

/**
 * Host side: the snapshot for one friend. `memo` is that friend's record, used
 * to send the heavy hero data only when it has changed.
 */
export function makeSnapshot(world, pid, memo) {
  const h = world.heroByPid(pid);
  if (!h) return null;
  return world.as(h, (p) => {
    const snap = {
      t: 'snap',
      map: world.map.id,
      slowT: r2(world.slowT),
      me: lightPlayer(p),
      hero: { portalT: r2(world.portalT), portalArmed: world.portalArmed, portalOn: world.portalOn ? world.map.portals.indexOf(world.portalOn) : -1, wayT: r2(world.wayT), wayArmed: world.wayArmed, respawnT: r2(world.respawnT), stats: world.stats },
      allies: world.allies().map((a) => ({ ...a, x: r2(a.x), z: r2(a.z), px: r2(a.px), pz: r2(a.pz), facing: r2(a.facing), hp: Math.round(a.hp) })),
      enemies: world.enemies.map((e) => pack({ ...e, atkName: e.atk ? e.atk.name : 0 }, ENEMY_KEYS)),
      proj: world.projectiles.filter((pr) => pr.owner === 'enemy' || pr.kind).map((pr) => pack(pr, PROJ_KEYS)),
      tele: world.telegraphs.map((t) => pack(t, TELE_KEYS)),
      walls: world.walls.map((wl) => ({ id: wl.id, x: r2(wl.x), z: r2(wl.z), rot: r2(wl.rot), hw: r2(wl.hw), hd: wl.hd, t: r2(wl.t), dur: wl.dur })),
      shadows: world.shadows.map((s) => ({ id: s.id, pid: s.pid, src: s.src, swapped: !!s.swapped, x: r2(s.x), z: r2(s.z), t: r2(s.t), dur: s.dur, facing: r2(s.facing), cls: s.cls, throwT: r2(s.throwT) })),
      loot: world.loot.filter((l) => l.owner === undefined || l.owner === pid).map((l) => ({ id: l.id, x: r2(l.x), z: r2(l.z), item: l.item, age: l.age, magnet: l.magnet })),
      chests: world.chests.map((c) => ({ id: c.id, x: r2(c.x), z: r2(c.z), tier: c.tier })),
      tick: world.ticks, // the host's clock, so the friend can play updates back at an even pace
      tier: world.worldTier(),
      rift: world.rift ? { tier: world.rift.tier, theme: world.rift.theme, seed: world.rift.seed, progress: world.rift.progress, need: world.rift.need, timeLeft: r2(world.rift.timeLeft), state: world.rift.state, won: world.rift.won } : null,
    };
    const heavy = JSON.stringify(heavyPlayer(p));
    if (memo.heavy !== heavy) {
      memo.heavy = heavy;
      snap.heavy = heavyPlayer(p);
    }
    return snap;
  });
}

/**
 * Friend side: copy a snapshot into the friend's own World, which is only ever
 * used to draw the screen and answer menu questions (it never steps).
 * Returns true if the map changed.
 */
export function applySnapshot(world, snap, alpha = 1) {
  // Each glide starts from where things are drawn right now (part way along the last glide),
  // so an update that arrives early never makes anything jump.
  const at = (o, k) => (o['p' + k] === undefined ? o[k] : o['p' + k] + (o[k] - o['p' + k]) * alpha);
  let mapChanged = false;
  const riftKey = snap.rift ? `${snap.rift.theme}:${snap.rift.seed}` : '';
  world.rift = snap.rift || null;
  world.syncTier = snap.tier || 1;
  if (!world.map || world.map.id !== snap.map || (snap.map === 'rift' && world.riftKey !== riftKey)) {
    world.loadMapMirror(snap.map);
    if (snap.map === 'rift' && snap.rift) {
      // The rift's layout is built from its theme and seed, the same as on the host.
      const m = buildRiftMap(snap.rift.theme, snap.rift.seed);
      world.map = m;
      world.radius = m.radius;
      world.obstacles = m.obstacles;
    }
    world.riftKey = riftKey;
    mapChanged = true;
  }
  world.slowT = snap.slowT;
  const p = world.player;
  // Keep the last position as the starting point of the glide to the new one.
  const ox = at(p, 'x'), oz = at(p, 'z');
  Object.assign(p, snap.me);
  p.px = mapChanged ? p.x : ox;
  p.pz = mapChanged ? p.z : oz;
  if (snap.heavy) {
    Object.assign(p, snap.heavy);
    world.recalcMods();
    world.questStamp++;
  }
  const hs = snap.hero;
  world.portalT = hs.portalT;
  world.portalArmed = hs.portalArmed;
  world.portalOn = hs.portalOn >= 0 ? world.map.portals[hs.portalOn] : null;
  world.wayT = hs.wayT;
  world.wayArmed = hs.wayArmed;
  world.respawnT = hs.respawnT;
  world.stats = hs.stats;

  const oldAllies = new Map((world.alliesList || []).map((a) => [a.pid, a]));
  world.alliesList = snap.allies.map((a) => {
    const o = oldAllies.get(a.pid);
    return { ...a, px: o && !mapChanged ? at(o, 'x') : a.x, pz: o && !mapChanged ? at(o, 'z') : a.z };
  });
  const oldEnemies = new Map(world.enemies.map((e) => [e.id, e]));
  world.enemies = snap.enemies.map((arr) => {
    const e = unpack(arr, ENEMY_KEYS);
    const o = oldEnemies.get(e.id);
    e.def = ENEMIES[e.type];
    e.atk = e.atkName ? e.def.attackByName[e.atkName] : null;
    e.px = o && !mapChanged ? at(o, 'x') : e.x;
    e.pz = o && !mapChanged ? at(o, 'z') : e.z;
    return e;
  });
  const oldShots = new Map(world.projectiles.map((pr) => [pr.id, pr]));
  world.projectiles = snap.proj.map((arr) => {
    const pr = unpack(arr, PROJ_KEYS);
    const o = oldShots.get(pr.id);
    pr.px = o ? at(o, 'x') : pr.px ?? pr.x;
    pr.pz = o ? at(o, 'z') : pr.pz ?? pr.z;
    return pr;
  });
  world.telegraphs = snap.tele.map((arr) => unpack(arr, TELE_KEYS));
  world.shadows = snap.shadows || [];
  world.walls = snap.walls || [];
  world.loot = snap.loot;
  world.chests = snap.chests || [];
  return mapChanged;
}
