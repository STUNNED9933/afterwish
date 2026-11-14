// What travels between the host and the friends who join them.
//
// The host's browser runs the one true World (sim/world.js) with every hero in
// it. About 20 times a second it sends each friend a snapshot: the map, the
// enemies, shots, warnings on the ground, the other heroes, and that friend's
// own hero. Friends send back commands (the same {type: 'move' ...} objects
// the keyboard and mouse already produce). Nothing here touches the screen.

import { ENEMIES } from '../sim/defs.js';

export const NET_VERSION = 1; // host and friends must run the same build of the rules

/** Hero fields that rarely change and are big: sent only when they change. */
const HEAVY = ['equipped', 'bag', 'quests', 'signs', 'visited', 'bossKills', 'talents', 'ranks'];

/** Events everyone in the party should see, whoever caused them. Everything else is personal. */
const PUBLIC = new Set(['death', 'spawn', 'windup', 'strike', 'impact', 'burst', 'zoneTick', 'orbTick', 'shatter', 'mark', 'markPop', 'shadowSwap', 'shadowSlash', 'starBolt', 'slowStart', 'slowEnd', 'enrage', 'stagger', 'postureHit', 'lightning', 'partyJoin', 'partyLeave']);
export function isPublic(ev) {
  return PUBLIC.has(ev.type) || (ev.type === 'damage' && ev.who === 'enemy');
}
/** Should the hero `pid` see this event? */
export function eventFor(ev, pid) {
  return ev.hero === pid || ev.hero === undefined || isPublic(ev);
}

const r2 = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
const ENEMY_KEYS = ['id', 'type', 'x', 'z', 'px', 'pz', 'facing', 'state', 't', 'dur', 'moving', 'hitFlash', 'vulnT', 'slowT', 'bleedT', 'markT', 'enraged', 'cue', 'atkName', 'hp', 'maxHp', 'level', 'aggro', 'radius', 'dead'];
const PROJ_KEYS = ['id', 'owner', 'kind', 'x', 'z', 'px', 'pz', 'parryable', 'reflected', 'radius', 'pid'];
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
      shadows: world.shadows.map((s) => ({ id: s.id, pid: s.pid, src: s.src, swapped: !!s.swapped, x: r2(s.x), z: r2(s.z), t: r2(s.t), dur: s.dur, facing: r2(s.facing), cls: s.cls, throwT: r2(s.throwT) })),
      loot: world.loot.filter((l) => l.owner === undefined || l.owner === pid).map((l) => ({ id: l.id, x: r2(l.x), z: r2(l.z), item: l.item, age: l.age, magnet: l.magnet })),
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
export function applySnapshot(world, snap) {
  let mapChanged = false;
  if (!world.map || world.map.id !== snap.map) {
    world.loadMapMirror(snap.map);
    mapChanged = true;
  }
  world.slowT = snap.slowT;
  const p = world.player;
  // Keep the last position as the starting point of the glide to the new one.
  const ox = p.x, oz = p.z;
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
    return { ...a, px: o && !mapChanged ? o.x : a.x, pz: o && !mapChanged ? o.z : a.z };
  });
  const oldEnemies = new Map(world.enemies.map((e) => [e.id, e]));
  world.enemies = snap.enemies.map((arr) => {
    const e = unpack(arr, ENEMY_KEYS);
    const o = oldEnemies.get(e.id);
    e.def = ENEMIES[e.type];
    e.atk = e.atkName ? e.def.attackByName[e.atkName] : null;
    e.px = o ? o.x : e.x;
    e.pz = o ? o.z : e.z;
    return e;
  });
  const oldShots = new Map(world.projectiles.map((pr) => [pr.id, pr]));
  world.projectiles = snap.proj.map((arr) => {
    const pr = unpack(arr, PROJ_KEYS);
    const o = oldShots.get(pr.id);
    pr.px = o ? o.x : pr.px ?? pr.x;
    pr.pz = o ? o.z : pr.pz ?? pr.z;
    return pr;
  });
  world.telegraphs = snap.tele.map((arr) => unpack(arr, TELE_KEYS));
  world.shadows = snap.shadows || [];
  world.loot = snap.loot;
  return mapChanged;
}
