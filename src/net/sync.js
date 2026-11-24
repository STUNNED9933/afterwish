// What travels between the host and the friends who join them.
//
// The host's browser runs the one true World (sim/world.js) with every hero in
// it. About 20 times a second it sends each friend a snapshot: the map, the
// enemies, shots, warnings on the ground, the other heroes, and that friend's
// own hero. Friends send back commands (the same {type: 'move' ...} objects
// the keyboard and mouse already produce). Nothing here touches the screen.

import { ENEMIES, OLD_SELVES } from '../sim/defs.js';
import { buildRiftMap, buildDelveRoom } from '../sim/maps.js';

import { SIM_VERSION } from '../sim/version.js';
import { CONFIG } from '../config.js';

// Host and friends must run the same build of the rules: the protocol's own number, plus a
// fingerprint of the rules themselves (0.41.1), so a friend on an older tab is told, not broken.
export const NET_VERSION = `10:${SIM_VERSION}`; // 10 (0.54.8): ping and pong

/** Hero fields that rarely change and are big: sent only when they change. */
const HEAVY = ['equipped', 'bag', 'quests', 'signs', 'visited', 'bossKills', 'talents', 'ranks', 'borrowed', 'eternals'];

/** Events everyone in the party should see, whoever caused them. Everything else is personal. */
const PUBLIC = new Set(['mirrorCrack', 'mirrorBreak', 'askerOffer', 'askerResume', 'askerLast', 'proclaim', 'wished', 'death', 'spawn', 'windup', 'strike', 'impact', 'burst', 'zoneTick', 'zoneLoose', 'orbTick', 'shatter', 'starfall', 'starImpact', 'bossLeap', 'bossPhase', 'itemDropped', 'shieldBreak', 'riftGuardian', 'riftLate', 'riftStart', 'tierSet', 'doomCast', 'doomImpact', 'spinTick', 'reckoning', 'rareSpawn', 'thiefSpawn', 'thiefFlee', 'thiefEscape', 'thiefCoins', 'thiefStumble', 'remnantRise', 'remnantCast', 'starFeeds', 'oathBlade', 'eventStart', 'meteorLands', 'shrineStart', 'eventDone', 'eventFail', 'merchantArrive', 'merchantLeave', 'nightcut', 'galeburst', 'frostShatter', 'chestOpen', 'mark', 'markPop', 'shadowSwap', 'shadowSlash', 'starBolt', 'smoulder', 'emberTick', 'burnSpread', 'wallRise', 'wallShatter', 'motes', 'slowStart', 'slowEnd', 'enrage', 'stagger', 'postureHit', 'lightning', 'partyJoin', 'partyLeave']);
/** A hero's own attacks and skills: shown on everyone's screen, as that hero's (0.41.1). */
export const ALLY_FX = new Set(['swing', 'cast']);
export function isPublic(ev) {
  return PUBLIC.has(ev.type) || ALLY_FX.has(ev.type) || (ev.type === 'damage' && ev.who === 'enemy');
}
/** (0.66) The merchant's stock as this player sees it (what they bought marked sold), only when it changed. */
function merchantStock(mc, pid, memo) {
  const stock = mc.stock.map((s) => Object.assign({}, s, { bought: undefined, sold: !!(s.sold || (s.bought && s.bought[pid])) }));
  const key = `${mc.id}:${stock.map((s) => (s.sold ? 1 : 0)).join('')}`;
  if (memo && memo.merchant === key) return undefined;
  if (memo) memo.merchant = key;
  return stock;
}

/** Should the hero `pid` see this event? */
export function eventFor(ev, pid) {
  return ev.hero === pid || ev.hero === undefined || isPublic(ev);
}

const r2 = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);
// What an enemy is (sent once, and again only if it changes) and what it is doing (sent every update).
const ENEMY_FIXED = ['type', 'elite', 'maxShield', 'riftGuardian', 'maxHp', 'level', 'radius', 'rare', 'remnant'];
const ENEMY_KEYS = ['id', 'phase', 'shield', 'x', 'z', 'facing', 'state', 't', 'dur', 'moving', 'hitFlash', 'vulnT', 'slowT', 'bleedT', 'markT', 'burnT', 'burnStacks', 'smoulderT', 'frostStacks', 'frostT', 'frostLock', 'mirrorT', 'brittle', 'bleedFire', 'patience', 'returning', 'enraged', 'cue', 'atkName', 'hp', 'aggro', 'dead', 'exposedT', 'oldCls', 'ember', 'burnCap', 'loot', 'enraged', 'judgedT'];
const PROJ_KEYS = ['id', 'owner', 'kind', 'x', 'z', 'px', 'pz', 'parryable', 'reflected', 'radius', 'pid', 'ice', 'fx', 'volley']; // (0.81.5) volley: arrows folded into this one, rained down where it lands
const TELE_KEYS = ['id', 'kind', 'x', 'z', 'dir', 'radius', 'range', 'angle', 'length', 'width', 't', 'dur', 'parryable', 'friendly', 'cue', 'doom', 'pool', 'inner', 'poolKind', 'dominion', 'will']; // (0.68) dominion: amber online too (it was missing)
const pack = (o, keys) => {
  const a = keys.map((k) => r2(o[k]));
  while (a.length && (a[a.length - 1] === null || a[a.length - 1] === undefined)) a.pop(); // (0.44: trailing blanks cost bytes)
  return a;
};
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

/** Enemies this friend has not been told about yet (or whose fixed details changed): [id, ...ENEMY_FIXED]. */
function fixedEnemies(world, memo) {
  const was = memo.fixed || new Map();
  const now = new Map();
  const out = [];
  for (const e of world.enemies) {
    const row = [e.id, ...ENEMY_FIXED.map((k) => e[k] ?? null)];
    const str = JSON.stringify(row);
    now.set(e.id, str);
    if (was.get(e.id) !== str) out.push(row);
  }
  memo.fixed = now;
  return out.length ? out : undefined;
}

/**
 * Enemies: a new one goes in full; after that, only the fields that changed
 * ([id, index, value, index, value...] as {d}), or just its id if nothing did.
 * The connection is reliable and in order, so the friend rebuilds full rows as updates arrive.
 */
function enemyRows(world, memo) {
  const was = memo.rows || new Map();
  const now = new Map();
  const out = world.enemies.map((e) => {
    const row = pack({ ...e, atkName: e.atk ? e.atk.name : 0 }, ENEMY_KEYS).map((v) => (v === undefined ? null : v));
    now.set(e.id, row);
    const old = was.get(e.id);
    if (!old) return row;
    const d = [];
    for (let i = 1; i < row.length; i++) if (JSON.stringify(row[i]) !== JSON.stringify(old[i])) d.push(i, row[i]);
    return d.length ? { i: e.id, d } : e.id;
  });
  memo.rows = now;
  return out;
}

/** Your own hero: only the fields that changed since the last update (null for one that went away). */
function changedOnly(me, memo) {
  const was = memo.me || {};
  const now = {};
  const out = {};
  for (const k in me) {
    const str = JSON.stringify(me[k] ?? null);
    now[k] = str;
    if (was[k] !== str) out[k] = me[k] ?? null;
  }
  for (const k in was) if (!(k in now)) out[k] = null;
  memo.me = now;
  return out;
}

/**
 * Loot this friend can see: a new drop in full, once; then just its id, or
 * {id, x, z} while it moves (flying to whoever picks it up).
 */
function lootFor(world, pid, memo) {
  const was = memo.loot || new Map();
  const now = new Map();
  const out = [];
  for (const l of world.loot) {
    if (l.owner !== undefined && l.owner !== pid) continue;
    const x = r2(l.x), z = r2(l.z);
    const at = x + ',' + z;
    now.set(l.id, at);
    const old = was.get(l.id);
    if (old === undefined) out.push({ id: l.id, x, z, item: l.item });
    else if (old !== at) out.push({ id: l.id, x, z });
    else out.push(l.id);
  }
  memo.loot = now;
  return out;
}

/**
 * Friend side, as each update arrives (before it waits in the playback queue): keep
 * the once-only parts (enemy details, loot items), so they are there even if this
 * update is skipped to catch up. Safe to call twice.
 */
export function receiveSnapshot(world, snap) {
  if (snap._got) return !snap._bad;
  snap._got = true;
  const c = world.netCache || (world.netCache = { fixed: new Map(), items: new Map(), rows: new Map(), me: {}, n: 0, seq: null });
  if (snap.full) {
    c.rows = new Map();
    c.me = {};
  } else if (c.seq == null || snap.seq !== c.seq + 1) {
    snap._bad = true; // an update went missing: this one cannot be pieced together
    return false;
  }
  c.seq = snap.seq;
  c.n++;
  // Rebuild full rows from the changes (updates arrive complete and in order).
  const rows = new Map();
  snap.enemies = (snap.enemies || []).map((x) => {
    let row;
    if (Array.isArray(x)) row = x;
    else if (typeof x === 'number') row = c.rows.get(x);
    else {
      row = (c.rows.get(x.i) || [x.i]).slice();
      for (let j = 0; j < x.d.length; j += 2) row[x.d[j]] = x.d[j + 1];
    }
    if (row) rows.set(row[0], row);
    return row;
  }).filter(Boolean);
  c.rows = rows;
  c.me = { ...c.me, ...(snap.me || {}) };
  snap.me = c.me;
  for (const row of snap.fixed || []) c.fixed.set(row[0], { row, seen: c.n });
  for (const e of snap.enemies || []) {
    const f = c.fixed.get(e[0]);
    if (f) f.seen = c.n;
  }
  snap.loot = (snap.loot || []).map((l) => {
    const id = typeof l === 'number' ? l : l.id;
    const it = l.item ? { item: l.item } : c.items.get(id);
    if (!it) return null;
    if (typeof l !== 'number') {
      it.x = l.x;
      it.z = l.z;
    }
    it.seen = c.n;
    c.items.set(id, it);
    return { id, x: it.x, z: it.z, item: it.item };
  }).filter(Boolean);
  // Forget what has not been in an update for a while (a few seconds' worth).
  if (c.n % 60 === 0) {
    for (const [id, f] of c.fixed) if (c.n - f.seen > 120) c.fixed.delete(id);
    for (const [id, it] of c.items) if (c.n - it.seen > 120) c.items.delete(id);
  }
  return true;
}

/**
 * Host side: the snapshot for one friend. `memo` is that friend's record, used
 * to send the heavy hero data only when it has changed.
 */
export function makeSnapshot(world, pid, memo) {
  const h = world.heroByPid(pid);
  if (!h) return null;
  // Updates are numbered; a friend who sees a gap asks for a full one (memo reset to {}).
  const full = !memo.seq;
  memo.seq = (memo.seq || 0) + 1;
  return world.as(h, (p) => {
    const snap = {
      t: 'snap',
      seq: memo.seq,
      full: full || undefined,
      map: world.mode === 'arena' ? 'ring' : world.map.id, // (0.59) an Echo Ring run has no map
      keepMap: world.map && world.map.id === 'wishkeep' ? { stage: world.map.keepStage || 0, tier: world.keepTierShown || 1, visit: world.keepOwner != null && world.keepOwner !== pid, owner: world.keepOwnerName || null } : undefined, // (0.82.2) whose keep, how grown
      arena: world.mode === 'arena' ? { wave: { n: world.wave.n, phase: world.wave.phase, timer: r2(world.wave.timer), cleared: world.wave.cleared, total: world.wave.total || 0, qn: world.wave.queue.length }, ring: world.ring ? { kind: world.ring.kind, slot: world.ring.slot, pot: world.ring.pot, wave: world.ring.wave, hold: !!world.ring.hold } : null, offer: world.offer, augments: world.augments, rerolls: world.rerolls, bestWave: world.bestWave, over: !!world.gameOver } : undefined,
      slowT: r2(world.slowT),
      me: changedOnly(lightPlayer(p), memo),
      hero: { portalT: r2(world.portalT), portalArmed: world.portalArmed, portalOn: world.portalOn && world.map ? world.map.portals.indexOf(world.portalOn) : -1, wayT: r2(world.wayT), wayArmed: world.wayArmed, respawnT: r2(world.respawnT), stats: world.stats, ckpt: world.maxCheckpoint || 1 }, // (0.61.1) how far this hero has reached in the Echo Ring
      allies: world.allies().map((a) => ({ ...a, x: r2(a.x), z: r2(a.z), px: r2(a.px), pz: r2(a.pz), facing: r2(a.facing), hp: Math.round(a.hp) })),
      enemies: enemyRows(world, memo),
      fixed: fixedEnemies(world, memo),
      proj: world.projectiles.filter((pr) => pr.owner === 'enemy' || pr.kind).map((pr) => pack(pr, PROJ_KEYS)),
      tele: world.telegraphs.map((t) => pack(t, TELE_KEYS)),
      walls: world.walls.map((wl) => ({ id: wl.id, x: r2(wl.x), z: r2(wl.z), rot: r2(wl.rot), hw: r2(wl.hw), hd: wl.hd, t: r2(wl.t), dur: wl.dur })),
      shadows: world.shadows.map((s) => ({ id: s.id, pid: s.pid, src: s.src, swapped: !!s.swapped, x: r2(s.x), z: r2(s.z), t: r2(s.t), dur: s.dur, facing: r2(s.facing), cls: s.cls, throwT: r2(s.throwT) })),
      loot: lootFor(world, pid, memo),
      chests: world.chests.map((c) => ({ id: c.id, x: r2(c.x), z: r2(c.z), tier: c.tier })),
      tick: world.ticks, // the host's clock, so the friend can play updates back at an even pace
      tier: world.worldTier(),
      depth: world.depthNow() || undefined, // (0.54)
      happening: world.happening ? { kind: world.happening.kind, x: r2(world.happening.x), z: r2(world.happening.z), r: world.happening.r, state: world.happening.state, t: r2(world.happening.t), left: world.happening.left || 0, grace: r2(world.happening.grace || 0) } : null,
      merchant: world.merchant ? { id: world.merchant.id, x: r2(world.merchant.x), z: r2(world.merchant.z), left: r2(world.merchant.left), level: world.merchant.level, stock: merchantStock(world.merchant, pid, memo) } : null, // (0.66) what this player has bought, only when it changes
      // (0.81) the Wishkeep: its night, its heroes and its buildings
      keep: world.map && world.map.id === 'wishkeep' ? {
        tide: world.tide ? { state: world.tide.state, raid: world.tide.raid || undefined, wave: world.tide.wave, waves: world.tide.waves, omen: world.tide.omen || undefined, level: world.tide.level || 1, mcd: world.tide.mcd, zones: world.tide.zones && world.tide.zones.length ? world.tide.zones.map((zo) => ({ x: r2(zo.x), z: r2(zo.z), r: zo.r, t: r2(zo.t) })) : undefined, bless: world.tide.bless, inc: world.tide.inc > 0 ? r2(world.tide.inc) : 0, chan: world.tide.chan != null ? r2(world.tide.chan) : undefined, chanAt: world.tide.chanAt || undefined, icd: world.tide.icd > 0 ? r2(world.tide.icd) : 0 } : null,
        troops: (world.troops || []).map((t) => ({ id: t.id, cls: t.cls, name: t.name, x: r2(t.x), z: r2(t.z), facing: r2(t.facing), hp: Math.round(t.hp), maxHp: t.maxHp, dead: t.dead || undefined, moving: t.moving || undefined, lvl: t.lvl, rar: t.rar || 0, shield: t.shield > 0 ? 1 : undefined, gender: t.gender })),
        builds: (world.keepBuilds || []).map((b) => ({ id: b.id, x: b.x, z: b.z, r: b.r, hp: Math.round(b.hp), max: b.max, wardT: b.wardT > 0 ? r2(b.wardT) : undefined })),
      } : undefined,
      delve: world.delve ? { tier: world.delve.tier, rooms: world.delve.rooms, room: world.delve.room, route: world.delve.route, seed: world.delve.seed, state: world.delve.state } : null,
      rift: world.rift ? { tier: world.rift.tier, theme: world.rift.theme, seed: world.rift.seed, progress: world.rift.progress, need: world.rift.need, timeLeft: r2(world.rift.timeLeft), state: world.rift.state, won: world.rift.won } : null,
    };
    // The heavy parts one by one, so picking up an item resends the bag and nothing else.
    memo.heavy = memo.heavy && typeof memo.heavy === 'object' ? memo.heavy : {};
    for (const k of HEAVY) {
      const str = JSON.stringify(p[k] ?? null);
      if (memo.heavy[k] === str) continue;
      memo.heavy[k] = str;
      (snap.heavy = snap.heavy || {})[k] = p[k];
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
  if (!receiveSnapshot(world, snap)) return false;
  const cache = world.netCache;
  // Each glide starts from where things are drawn right now (part way along the last glide),
  // so an update that arrives early never makes anything jump.
  const at = (o, k) => (o['p' + k] === undefined ? o[k] : o['p' + k] + (o[k] - o['p' + k]) * alpha);
  let mapChanged = false;
  const riftKey = snap.rift ? `${snap.rift.theme}:${snap.rift.seed}` : snap.delve ? `delve:${snap.delve.seed}:${snap.delve.room}` : '';
  world.delve = snap.delve || null;
  world.rift = snap.rift || null;
  world.tide = snap.keep ? snap.keep.tide : null; // (0.81)
  world.keepVisit = !!(snap.keepMap && snap.keepMap.visit); // (0.82.2) in a friend's keep
  world.keepVisitOf = snap.keepMap && snap.keepMap.visit ? snap.keepMap.owner : null;
  world.keepBuilds = snap.keep ? snap.keep.builds : [];
  world.syncTier = snap.tier || 1;
  world.syncDepth = snap.depth || 0;
  if (snap.map === 'ring') {
    // (0.59) an Echo Ring run on the server: the arena, no map
    if (world.mode !== 'arena') {
      world.mode = 'arena';
      world.map = null;
      world.obstacles = [];
      world.radius = CONFIG.ARENA_RADIUS;
      mapChanged = true;
    }
    const a = snap.arena || {};
    world.wave = Object.assign(world.wave || {}, a.wave || {}, { queue: new Array((a.wave && a.wave.qn) || 0).fill(0) });
    world.ring = a.ring || null;
    world.offer = a.offer || null;
    world.augments = a.augments || [];
    world.rerolls = a.rerolls || 0;
    world.bestWave = a.bestWave || world.bestWave;
    world.gameOver = !!a.over;
  } else if (!world.map || world.mode === 'arena' || world.map.id !== snap.map || ((snap.map === 'rift' || snap.map === 'delve') && world.riftKey !== riftKey)) {
    if (world.mode === 'arena') {
      world.mode = 'explore'; // (0.59) home from the Ring
      world.ring = null;
      world.offer = null;
      world.augments = [];
      world.gameOver = false;
      world.wave = Object.assign(world.wave || {}, { phase: 'explore', queue: [] });
    }
    world.keepMapInfo = snap.keepMap || null; // (0.82.2) a keep is built as its owner's has grown
    world.loadMapMirror(snap.map);
    if (snap.map === 'rift' && snap.rift) {
      // The rift's layout is built from its theme and seed, the same as on the host.
      const m = buildRiftMap(snap.rift.theme, snap.rift.seed);
      world.map = m;
      world.radius = m.radius;
      world.obstacles = m.obstacles;
    }
    if (snap.map === 'delve' && snap.delve) {
      // A delve room (0.46): built from its place in the route and the delve's seed, as on the host.
      const m = buildDelveRoom(snap.delve.route[snap.delve.room], snap.delve.seed + snap.delve.room);
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
  if (world.map && world.map.id === 'town' && world.mode !== 'arena' && world.townKey() !== world.townShown) {
    // (0.70.3) Haven's people as THIS hero's story has them. The picture of the world starts from this
    // browser's own save, not the online character, so Tomas could stand in Haven for a hero who had
    // not seen the Unwish (or be missing for one who had). Rebuilt once the server's word arrives.
    world.loadMapMirror('town');
    mapChanged = true;
  }
  const hs = snap.hero;
  if (hs.ckpt) world.maxCheckpoint = hs.ckpt; // (0.61.1) the server's own, not a save from before a class switch
  world.portalT = hs.portalT;
  world.portalArmed = hs.portalArmed;
  world.portalOn = hs.portalOn >= 0 && world.map ? world.map.portals[hs.portalOn] : null;
  world.wayT = hs.wayT;
  world.wayArmed = hs.wayArmed;
  world.respawnT = hs.respawnT;
  world.stats = hs.stats;

  const oldAllies = new Map((world.alliesList || []).map((a) => [a.pid, a]));
  world.alliesList = snap.allies.map((a) => {
    const o = oldAllies.get(a.pid);
    return { ...a, px: o && !mapChanged ? at(o, 'x') : a.x, pz: o && !mapChanged ? at(o, 'z') : a.z };
  });
  // (0.82.6) The keep's heroes glide between updates like everyone else (they used to stand still and
  // then jump, a step behind their name plates). A hero back from the dead appears where they stand.
  const oldTroops = new Map((world.troops || []).map((t) => [t.id, t]));
  world.troops = (snap.keep ? snap.keep.troops : []).map((t) => {
    const o = oldTroops.get(t.id);
    const glide = o && !mapChanged && !!o.dead === !!t.dead && Math.abs(o.x - t.x) + Math.abs(o.z - t.z) < 8;
    return { ...t, px: glide ? at(o, 'x') : t.x, pz: glide ? at(o, 'z') : t.z };
  });
  const oldEnemies = new Map(world.enemies.map((e) => [e.id, e]));
  world.enemies = snap.enemies.filter((arr) => cache.fixed.has(arr[0])).map((arr) => {
    const e = unpack(arr, ENEMY_KEYS);
    const f = cache.fixed.get(e.id);
    if (f) ENEMY_FIXED.forEach((k, i) => {
      if (f.row[i + 1] !== null) e[k] = f.row[i + 1];
    });
    const o = oldEnemies.get(e.id);
    e.def = ENEMIES[e.type];
    e.atk = e.atkName ? (e.oldCls && OLD_SELVES[e.oldCls] ? OLD_SELVES[e.oldCls] : e.def).attackByName[e.atkName] || null : null;
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
  world.happening = snap.happening || null;
  if (snap.merchant && !snap.merchant.stock && world.merchant && world.merchant.id === snap.merchant.id) snap.merchant.stock = world.merchant.stock; // (0.66) unchanged: keep what we have
  world.merchant = snap.merchant || null;
  return mapChanged;
}

/** (0.54.8) Events on their way to a friend, with positions and times cut to two decimals (half the bytes). */
export function compactEvents(list) {
  return list.map((ev) => {
    const o = {};
    for (const k in ev) {
      const v = ev[k];
      if (v === false || v === undefined || v === null) continue;
      o[k] = typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
    }
    return o;
  });
}
