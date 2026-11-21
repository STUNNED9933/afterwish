// The game simulation. No rendering, no DOM, no input devices in here.
//
//   commands in  ->  world.command({ type: 'move', x, z })
//   time passes  ->  world.step(dt)
//   events out   ->  world.events  (hits, parries, deaths, level ups ...)
//
// The renderer, HUD and audio only read state and react to events. Keeping
// that boundary is what makes multiplayer possible later: commands can come
// from a network connection instead of the local mouse and keyboard, and the
// same World can run on a server.
import { DEEP, DEPTH_IDS, emberOf, emberForGear, emberScale, TIERS, MAX_TIER, ELITE_FROM_LEVEL, AFFIXES, AFFIX_IDS, ELITE, RIFT, riftScale, WISH_STATS, WISH_IDS, wishNeed, DOOM , masteryFor, MASTERY } from './endgame.js';
const DEPTH_FIRST = DEPTH_IDS[0]; // (0.57.6) the Depth the main story opens (VI)

/** Commands that mean a player is at the keys (anything else, like sorting the bag, does not). */
// Map objects you can interact with (G, or right-click to walk over). New kinds go here.
const INTERACT_KINDS = new Set(['npc', 'sign', 'board', 'delve', 'ring']);
const r2n = (n) => Math.round((n || 0) * 100) / 100;
// How long a friend's hits may wait for their parry to arrive (0.41.1): about a slow connection's round trip.
const LAG_CAP = 0.5;
const ACTIVE_CMDS = new Set(['move', 'attackMove', 'attack', 'stop', 'cast', 'parry', 'potion', 'warp', 'travel']);
import { CONFIG } from '../config.js';
import { makeRng } from './rng.js';
import { ABILITIES, OLD_SELVES, ENEMIES, buildWave, enemyScale, expToNext, checkpointFor, levelBandMult } from './defs.js';
import { migrateRebirth, rebirthBlock, starmarksFor, starmarksForGear, rebirthSave, perkRank, expMult, PERKS, ECHOES, essenceFor, rebirthGear, REBIRTH_GLOWS, REBIRTH } from './rebirth.js';
import { relevelItem, SLOTS, rollItem, starterWeapon, itemScore, sumGearStats, scrapValue, upgradeCost, MAX_PLUS, CACHES, CASTER_CLASSES, bestUpgrades, statRange, KEPT_RATE, REROLL_PITY, immortalLine, ROLL_TIER_AT, CHEST_TIERS, SETS, setCounts, rollSetPiece, enchantable, enchantCost, rollBonusStat, ENCHANT_POOL, rerollCost, rollLine, reforgeChoices, rollQuality, rollTier, dustValue, migrateItem, rollUnique, REMNANT_UNIQUE, MAX_STARS, IMMORTAL, SPEC_IMMORTALS, EFFECTS } from './items.js';
import { classPower } from './balance.js';
// Deadeye's pierces (0.51): damage for the 1st to 4th enemy on the line, and what each pierce adds.
const DEADEYE_PIERCE = { mult: [1, 0.7, 0.5, 0.35], mark: 0.2, markTime: 5, pin: 1.5, splinter: 0.35, splinterR: 3 };
import { RARE, rareName, THIEF, REMNANT, remnantName, EVENTS, MERCHANT, GLASS, BOUNTY, FRAGMENTS, SIGIL, WILDS, ELITE_SPOILS } from './surprises.js';
import { GLOWS, REMNANT_GLOW } from './cosmetics.js';
import { CLASSES } from './classes.js';
import { buildRiftMap, buildMap, buildDelveRoom, delveRoute, DELVE_ROOMS, MAPS, MAP_IDS } from './maps.js';
import { AUGMENTS, AUGMENT_IDS, defaultMods } from './augments.js';
import { SPECS, ROW_NEED, talentPointsAt } from './talents.js';

/** Talents renamed in 0.17 (Bulwark rework) keep the points put into them. */
const RENAMED_TALENTS = { bw_riposte: 'bw_wall', bw_mirror: 'bw_tide' };
function migrateTalents(saved) {
  const out = {};
  for (const id in saved || {}) {
    const to = RENAMED_TALENTS[id] || id;
    out[to] = (out[to] || 0) + saved[id];
  }
  return out;
}
function migrateBuilds(saved) {
  const out = {};
  for (const spec in saved || {}) if (Array.isArray(saved[spec])) out[spec] = saved[spec].map((id) => RENAMED_TALENTS[id] || id);
  return out;
}
import { QUESTS, QUEST_IDS, SIGNS, NPCS, BOSS_LOOT, BOSS_LINES } from './story.js';
import { dAtan2, dCos, dExp, dHypot, dSin } from './dmath.js';

const TAU = Math.PI * 2;
const MAPS_START = 'town'; // exploration always begins, and you always wake up, in town
const dist = (ax, az, bx, bz) => dHypot(ax - bx, az - bz);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Signed smallest difference between two angles. */
export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function turnToward(current, target, maxStep) {
  const d = angDiff(target, current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/**
 * Everything on the World that belongs to one hero rather than to the shared
 * world. In a party each hero keeps its own copy, and use(hero) swaps them in,
 * so all the single-hero code below works unchanged for whichever hero is
 * acting (casting, being attacked, picking up loot ...).
 */
const HERO_KEYS = ['player', 'cls', 'kit', 'basic', 'mods', 'augments', 'offer', 'rerolls', 'portalT', 'portalArmed', 'portalOn', 'wayT', 'wayArmed', 'stoneT', 'stoneArmed', 'stoneOn', 'respawnT', 'stats', 'bestWave', 'maxCheckpoint', 'parryPreset'];

/** Rarity weights that allow exactly one rarity. */
/** Commands the Weekly Echo ignores: its gear and build are fixed by the week. */
const TRIAL_LOCKED = new Set(['recall', 'echoUp', 'scarfChoice', 'meetOdile', 'enterDelve', 'unwish', 'autoTalents', 'equip', 'autoEquip', 'discard', 'scrap', 'upgrade', 'enchant', 'reforge', 'rebirth', 'rebirthPerk', 'ascend', 'buyMerchant', 'wishReset', 'claimBounty', 'swapBounty', 'craftImmortal', 'summonRemnant', 'openCache', 'buyTome', 'rankUp', 'chooseSpec', 'talent', 'respec', 'travel']);
import { newRing, ringGain, ringWhole, ringCost, RING } from './ring.js';
import { WEEKLY_REWARD } from './trial.js';
const RARITY_ONLY = (r) => [0, 0, 0, 0, 0, 0, 0].map((_, i) => (i === r ? 1 : 0));

/**
 * (0.62) Pieces recalled with Echo Essence before 0.62 came back at the level you were then, with their
 * +levels and stars reset and their rolls worn down by rounding. Give them their prime back: each line at the
 * best of its quality now and its quality in the memory it came from, the memory's +levels and stars if
 * higher, and from now on following your level. An Heirloom remembered from a past life is mended the same
 * way. Safe to run on every load: it only ever raises things.
 */
function restoreRecalled(p) {
  const mems = p.rebirth && p.rebirth.memories;
  if (!mems) return;
  const pieces = [...SLOTS.map((s) => p.equipped[s]), ...(p.bag || [])];
  for (const it of pieces) {
    if (!it || !it.slot) continue;
    const mem = mems[it.slot];
    if (!mem) continue;
    const wasRecalled = it.recalled || /^r\d+-[a-z]+-\d+$/.test(String(it.id));
    const sameOne = mem.id === it.id || (wasRecalled && mem.name === it.name && mem.rarity === it.rarity);
    if (!sameOne || !(wasRecalled || it.heirloom)) continue;
    const q = {}, qv = {};
    let raised = false;
    for (const k in it.stats) {
      const now = rollQuality(it, k);
      const then = k in mem.stats ? rollQuality(mem, k) : 0;
      q[k] = Math.max(now, then);
      if (q[k] > now + 1e-9) raised = true;
    }
    if (wasRecalled) it.recalled = true;
    if ((mem.plus || 0) > (it.plus || 0)) { it.plus = mem.plus; raised = true; }
    if ((mem.stars || 0) > (it.stars || 0)) { it.stars = mem.stars; raised = true; }
    if (!raised && it.q) continue;
    // re-make each line from its quality, at the level it is now
    for (const k in it.stats) {
      const { lo, hi } = statRange(it, k);
      it.stats[k] = Math.max(1, Math.round(lo + q[k] * (hi - lo)));
      qv[k] = it.stats[k];
    }
    it.q = q;
    it.qv = qv;
  }
}

export class World {
  /**
   * @param {object} opts
   * @param {number} [opts.seed]
   * @param {object} [opts.save]         saved character (see toSave)
   * @param {string} [opts.parryPreset]  key of CONFIG.PARRY_PRESETS
   */
  constructor(opts = {}) {
    this.seed = (opts.seed ?? (Date.now() & 0xffffffff)) >>> 0;
    this.rng = makeRng(this.seed);
    this.ticks = 0; // simulation steps taken; replays put each command back on the step it came in
    this.recorder = null; // an array while a run is being recorded: [tick, command] pairs
    // Weekly Echo: fixed rules (see sim/trial.js). Normal play leaves this null.
    this.trial = opts.trial || null;
    this.travelHook = null; // the server world sets this (see goMap)
    this.offerCount = 0;
    this.parryPreset = CONFIG.DEFAULT_PARRY_PRESET; // (0.61) Standard for everyone: no parry-timing choice any more
    this.time = 0;
    this.nextId = 1;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.chests = []; // treasure chests out in the world (explore maps)
    this.chestRefill = []; // ticks at which an opened chest comes back
    this.chestMaps = {}; // map id -> { chests, refill }: kept while you are away, for this session
    this.campDown = {}; // 'map:camp' -> tick when a beaten boss comes back (see loadMap)
    for (const k in opts.save?.campDown || {}) this.campDown[k] = Math.round(opts.save.campDown[k] / CONFIG.TICK);
    this.chestCount = 0;
    this.surpriseN = 0; // dice for Rares, the Wishthief and Remnants (their own streams)
    this.thiefClock = 0;
    this.hazards = []; // ground that hurts (a Mycelord Remnant's spore pools)
    this.happening = null; // a world event on this map (0.31)
    this.eventClock = EVENTS.first;
    this.merchant = null; // the travelling merchant, while here
    this.merchantAt = -1e9; // tick of his last visit
    this.telegraphs = [];
    this.events = [];
    this.commands = [];
    this.gameOver = false;
    this.lastWindupAt = -10;
    // 'arena' = waves in the ring. 'explore' = open map with a town and enemy camps.
    this.mode = opts.mode === 'explore' ? 'explore' : 'arena';
    this.radius = CONFIG.ARENA_RADIUS; // exploration maps set their own size in loadMap()
    this.obstacles = []; // solid things on the current map (none in the arena)
    // Which class this character is (see sim/classes.js). A save remembers its class.
    this.cls = CLASSES[opts.cls] ? opts.cls : CLASSES[opts.save?.cls] ? opts.save.cls : 'warrior';
    this.kit = CLASSES[this.cls].abilities;
    this.basic = CLASSES[this.cls].basic;
    this.zones = [];
    this.shadows = []; // Shadowdancer shadows: { id, pid, src, x, z, t, dur, facing, cls }
    this.walls = []; // Frostbinder Rimewalls: { id, pid, x, z, rot, hw, hd, t, dur, dmg, stun, ob }

    const save = opts.save || null;
    this.questStamp = 0; // goes up whenever quests or signs change, so the UI knows to redraw
    this.bestWave = save?.bestWave ?? 0;
    // The furthest checkpoint ever reached. A run may start there or at any earlier one.
    this.maxCheckpoint = save?.maxCheckpoint ?? save?.checkpoint ?? 1;
    const startWave = Math.max(1, Math.min(opts.startWave ?? this.maxCheckpoint, this.maxCheckpoint));
    this.slowT = 0; // > 0 while a perfect parry is slowing time
    this.delayed = [];
    this.falls = []; // the final boss's falling stars (stepFalls)
    this.augments = []; // ids of augments taken this run
    this.offer = null; // { choices: [augment ids], boss } while a pick is waiting
    this.rerolls = CONFIG.AUGMENT_REROLLS;
    this.mods = defaultMods();
    this.wave = { n: startWave - 1, phase: 'intermission', timer: CONFIG.FIRST_WAVE_DELAY, queue: [], spawnT: 0, maxAlive: 4, cleared: startWave - 1 };
    this.ring = this.mode === 'arena' && opts.focus ? newRing(opts.focus) : null; // (0.59) the run's spoils (ring.js)
    this.twist = (opts.trial && opts.trial.twist) || null; // (0.60) the Weekly Echo's twist on the rules (trial.js TWISTS)
    this.knownSigns = opts.signs; // (0.56.4) what the account has already read: signs are read once per account
    this.player = this.makePlayer(save);
    this.knownSigns = null;
    this.stats = { parries: 0, perfects: 0, kills: 0, dodges: 0 };
    this.respawnT = 0;
    this.portalT = this.wayT = this.stoneT = 0;
    this.portalArmed = this.wayArmed = this.stoneArmed = false;
    this.stoneOn = null;
    this.portalOn = null;
    // The heroes in this world. Alone, there is one and nothing ever switches.
    this.cur = { pid: 0, name: opts.name || 'Player' };
    for (const k of HERO_KEYS) this.cur[k] = this[k];
    this.heroes = [this.cur];
    if (this.mode === 'explore') {
      this.wave.phase = 'explore'; // no waves out here
      this.loadMap(MAPS_START, null);
    }
  }

  // =========================================================================
  // Party (co-op exploration). The host's World holds every hero.
  // =========================================================================
  get party() {
    return this.heroes.length > 1;
  }

  // -------------------------------------------------------------------------
  // The server world (0.55): one World per map copy. A hero who leaves goes alone, to another
  // copy, through travelHook(hero, to, from, extra), which the server answers after the step.
  // Without a hook (single player, a host's room) the whole party goes, as always.
  // -------------------------------------------------------------------------
  /** The acting hero leaves for map `to` (from `from`); `extra` carries a rift or delve to start. */
  goMap(to, from, extra = null) {
    if (this.travelHook) {
      this.travelHook(this.cur, to, from, extra);
      this.portalArmed = false;
      this.portalT = 0;
      return true;
    }
    if (extra && extra.rift) return this.startRift(extra.rift);
    if (extra && extra.delve) return this.startDelve(extra.delve);
    this.loadMap(to, from);
    return false;
  }

  /** Everyone here leaves for `to` (the whole party down, a run over). */
  goMapAll(to, from) {
    if (this.travelHook) {
      for (const h of this.heroes) this.travelHook(h, to, from, null);
      return true;
    }
    this.loadMap(to, from);
    return false;
  }

  /** Server: hero `h` (just added) arrives on this copy's map from `from`, as loadMap would place them. */
  arriveHero(h, from) {
    this.as(h, (p) => {
      const map = this.map;
      const gate = map.portals.find((g) => g.to === from);
      const k = gate ? 1 - 5.5 / dHypot(gate.x, gate.z) : 0;
      const a = this.rng() * TAU;
      p.x = p.px = (gate ? gate.x * k : 0) + dCos(a) * 1.2;
      p.z = p.pz = (gate ? gate.z * k : 0) + dSin(a) * 1.2;
      if (gate) p.facing = dAtan2(-gate.z, -gate.x);
      this.pushOut(p, p.radius);
      p.moveTarget = null;
      p.targetId = null;
      p.dash = null;
      p.leap = null;
      p.atkWind = 0;
      this.portalT = this.wayT = 0;
      this.portalOn = null;
      this.portalArmed = this.wayArmed = false;
      if (!p.visited.includes(map.id) && map.id !== 'rift' && map.id !== 'delve') {
        p.visited.push(map.id);
        this.emit('discovered', { id: map.id, name: map.name });
      }
      if (map.safe) this.fillBounties();
      this.emit('mapChange', { id: map.id, name: map.name, from });
      this.questEvent('reach', map.id);
    });
  }

  /** Make `h` the acting hero (see HERO_KEYS). */
  use(h) {
    if (!h || h === this.cur) return;
    for (const k of HERO_KEYS) this.cur[k] = this[k];
    for (const k of HERO_KEYS) this[k] = h[k];
    this.cur = h;
  }

  heroByPid(pid) {
    return this.heroes.find((h) => h.pid === pid) || null;
  }

  /** Run fn as hero h, then switch back. */
  as(h, fn) {
    const back = this.cur;
    this.use(h);
    try {
      return fn(this.player);
    } finally {
      this.use(back);
    }
  }

  /** A friend joins: build their hero from their own save and put them next to the others. */
  addHero(pid, hello = {}) {
    const save = hello.save && hello.save.level >= 1 ? hello.save : null;
    const name = hello.name;
    const back = this.cur;
    for (const k of HERO_KEYS) back[k] = this[k];
    const h = { pid, name: String(name || 'Friend').slice(0, 16) };
    this.cur = h;
    this.cls = CLASSES[save?.cls] ? save.cls : CLASSES[hello.cls] ? hello.cls : 'warrior';
    this.kit = CLASSES[this.cls].abilities;
    this.basic = CLASSES[this.cls].basic;
    this.mods = defaultMods();
    this.augments = [];
    this.offer = null;
    this.rerolls = CONFIG.AUGMENT_REROLLS;
    this.portalT = this.wayT = this.stoneT = this.respawnT = 0;
    this.portalArmed = this.wayArmed = this.stoneArmed = false;
    this.stoneOn = null;
    this.portalOn = null;
    this.stats = { parries: 0, perfects: 0, kills: 0, dodges: 0 };
    this.bestWave = save?.bestWave ?? 0;
    this.maxCheckpoint = save?.maxCheckpoint ?? 1;
    this.parryPreset = CONFIG.DEFAULT_PARRY_PRESET; // (0.61) Standard for everyone
    this.knownSigns = hello.signs; // (0.56.4) the friend's account's signs
    const p = this.makePlayer(save);
    this.knownSigns = null;
    p.id = pid;
    p.autoAttack = hello.autoAttack !== false;
    p.gold = Math.max(0, Number(hello.gold) || 0);
    p.tickets = Math.max(0, Number(hello.tickets) || 0);
    // Arrive next to the host.
    const lead = back.player;
    const a = this.rng() * TAU;
    p.x = p.px = lead.x + dCos(a) * 2;
    p.z = p.pz = lead.z + dSin(a) * 2;
    this.pushOut(p, p.radius);
    if (this.map && !p.visited.includes(this.map.id)) p.visited.push(this.map.id);
    for (const k of HERO_KEYS) h[k] = this[k];
    this.heroes.push(h);
    this.use(back);
    this.emit('partyJoin', { pid, name: h.name });
    return h;
  }

  removeHero(pid) {
    const h = this.heroByPid(pid);
    if (!h || (h === this.heroes[0] && !(this.travelHook && this.heroes.length > 1))) return;
    if (this.tradeFor(pid)) this.as(h, () => this.tradeCancel('gone'));
    this.use(this.heroes.find((x) => x !== h)); // (0.55) on the server, the first hero can leave a copy too
    this.heroes = this.heroes.filter((x) => x !== h);
    this.loot = this.loot.filter((l) => l.owner !== pid);
    this.projectiles = this.projectiles.filter((pr) => pr.pid !== pid);
    this.zones = this.zones.filter((z) => z.pid !== pid);
    this.shadows = this.shadows.filter((s) => s.pid !== pid);
    for (const wl of this.walls) if (wl.pid === pid) this.obstacles = this.obstacles.filter((o) => o !== wl.ob);
    this.walls = this.walls.filter((wl) => wl.pid !== pid);
    this.delayed = this.delayed.filter((d) => d.pid !== pid);
    this.emit('partyLeave', { pid, name: h.name });
  }

  /** The other heroes, as the screen needs them (for the host; a joiner gets this list over the network). */
  allies() {
    if (this.alliesList) return this.alliesList;
    const out = [];
    for (const h of this.heroes) {
      if (h === this.cur) continue;
      const p = h.player;
      out.push({ pid: h.pid, name: h.name, cls: h.cls, x: p.x, z: p.z, px: p.px, pz: p.pz, facing: p.facing, dead: !!p.dead, hp: p.hp, maxHp: p.stats.maxHp, level: p.level, moving: !!p.moving, glow: p.glow || null,
        // what their model should be doing (0.41.1): rolling, leaping, spinning, parrying
        dash: p.dash ? r2n(p.dash.dur) : 0, leap: p.leap ? r2n(p.leap.dur) : 0, spin: !!p.spin, parry: p.parryT > 0, as: r2n(p.stats.as), spec: p.spec || null });
    }
    return out;
  }

  /** Who this enemy goes for: its current target if still fair game, else the nearest standing hero. */
  targetFor(e) {
    if (e.tauntT > 0) {
      // Taunted (Bulwark's The Warden's Call): it goes for the hero who taunted it.
      const t = this.heroByPid(e.tauntPid);
      if (t && !t.player.dead) {
        e.targetPid = t.pid;
        return t;
      }
    }
    const cur = e.targetPid != null ? this.heroByPid(e.targetPid) : null;
    if (cur && !cur.player.dead && (e.state === 'windup' || e.state === 'charge')) return cur;
    let best = null, bd = 1e9;
    for (const h of this.heroes) {
      const p = h.player;
      if (p.dead) continue;
      const d = dist(p.x, p.z, e.x, e.z);
      if (d < bd) { bd = d; best = h; }
    }
    best = best || cur || this.heroes[0];
    e.targetPid = best.pid;
    return best;
  }

  /** Mark new shots, zones and delayed effects with the hero that made them. */
  tagOwned() {
    const pid = this.cur.pid;
    for (const z of this.zones) if (z.pid === undefined) z.pid = pid;
    for (const d of this.delayed) if (d.pid === undefined) d.pid = pid;
    for (const pr of this.projectiles) if (pr.owner !== 'enemy' && pr.pid === undefined) pr.pid = pid;
  }

  get parry() {
    return CONFIG.PARRY_PRESETS[this.parryPreset];
  }

  emit(type, data) {
    this.events.push(Object.assign({ type, hero: this.cur ? this.cur.pid : 0 }, data));
  }

  /** Queue a command. It is applied at the start of the next step. */
  command(cmd) {
    if (this.trial) {
      // Weekly Echo: positions to the centimetre, so a recorded run stays small and replays exactly.
      if (typeof cmd.x === 'number') cmd = Object.assign({}, cmd, { x: Math.round(cmd.x * 100) / 100 });
      if (typeof cmd.z === 'number') cmd = Object.assign({}, cmd, { z: Math.round(cmd.z * 100) / 100 });
    }
    this.commands.push(cmd);
  }

  /**
   * A random stream of its own for one purpose (waves, augment offers), seeded from the run's seed.
   * Everyone with the same seed then meets the same waves and offers, however their fights went.
   */
  streamRng(tag, n) {
    let h = (this.seed ^ 0x9e3779b9) >>> 0;
    const s = `${tag}:${n}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return makeRng(h);
  }

  // =========================================================================
  // Player
  // =========================================================================
  makePlayer(save) {
    const p = {
      id: 0,
      x: 0,
      z: 0,
      px: 0,
      pz: 0,
      facing: Math.PI / 2,
      radius: 0.6,
      level: save?.level ?? 1,
      exp: (save?.exp ?? 0) * (save && !save.pace4 ? 4 : 1), // (0.49) levels need 4x the EXP: keep how far along the bar you were
      hp: 1,
      stats: {},
      equipped: { weapon: null, helm: null, chest: null, boots: null, ring: null },
      bag: [],
      potions: CONFIG.MAX_POTIONS, // every run starts with a full belt
      potionCd: 0,
      moveTarget: null,
      targetId: null,
      autoAcquire: true,
      autoAttack: true, // false: only attack what you click or attack-move onto (pause menu setting)
      attackMove: null, // { x, z, near } while walking somewhere ready to attack (Shift + right-click)
      atkWind: 0, // > 0 while a basic attack is winding up
      attackCd: 0,
      cd: { q: 0, w: 0, e: 0, r: 0 },
      castLock: 0,
      channel: null, // (0.51) an archer's ultimate being drawn: slowed, no attacks or casts, the shot leaves at the end
      parryT: 0, // > 0 while the parry window is open
      parryAge: 0,
      parryCd: 0,
      parryHit: false,
      parryBuffer: 0,
      dash: null,
      leap: null,
      hurtT: 0,
      moving: false,
      dead: false,
      // Carried between runs
      gold: save?.gold ?? 0,
      scrap: save?.scrap ?? 0,
      keys: save?.keys ?? 0, // boss keys, each opens one Warden's Cache
      tickets: save?.tickets ?? 0, // arena tickets, earned in exploration
      visited: Array.isArray(save?.visited) ? save.visited.slice() : ['town'], // maps the Waygate can reach
      tomes: save?.tomes ?? 0, // skill points bought from the trainer
      quests: save?.quests ? JSON.parse(JSON.stringify(save.quests)) : {}, // id -> { s: 'active' | 'ready' | 'done', n }
      // signs read so far: this hero's, and (0.56.4) every one the account has read in any class or life
      signs: [...new Set([...(Array.isArray(save?.signs) ? save.signs : []), ...(Array.isArray(this.knownSigns) ? this.knownSigns : [])])].filter((id) => SIGNS[id]),
      bossKills: Object.assign({}, save?.bossKills), // boss type -> times beaten out in the world
      spec: save?.spec && SPECS[save.spec] && SPECS[save.spec].cls === this.cls ? save.spec : null, // subclass
      talents: migrateTalents(save?.talents), // talent id -> rank
      // 0.37.2: the order talents were learned in, per subclass, so a build comes back in one click
      talentBuilds: migrateBuilds(save?.talentBuilds),
      talentSeq: [], // this subclass's points, in the order spent this time
      ranks: Object.assign({ q: 1, w: 1, e: 1, r: 1 }, save?.ranks || {}),
      skillPoints: save?.skillPoints ?? Math.max(0, (save?.level ?? 1) - 1),
      // After The Unmade (0.26): world tiers, Echo Rifts, Wishborne levels
      tierMax: Math.max(1, Math.min(MAX_TIER, save?.tierMax ?? 1)),
      worldTier: Math.max(1, Math.min(save?.tierMax ?? 1, save?.worldTier ?? 1)),
      riftMax: Math.max(1, save?.riftMax ?? 1),
      riftBest: save?.riftBest || null, // { tier, secs }
      wish: save?.wish ?? 0,
      wishExp: (save?.wishExp ?? 0) * (save && !save.pace4 ? 4 : 1),
      wishPts: save?.wishPts ?? 0,
      wishStats: Object.assign({}, save?.wishStats),
      rebirth: migrateRebirth(save?.rebirth), // Rebirth (0.43): Starmarks, perks, past lives
      endings: Object.assign({}, save?.endings), // (0.45) { self: times you unwished yourself, place: times you took her place }
      tomasMet: !!save?.tomasMet, // Pip's father came home and you saw him
      delveBest: save?.delveBest ?? 0, // the highest tier of delve cleared (0.46)
      choices: Object.assign({}, save?.choices), // side stories (0.47): { scarf: 'rest' | 'walk' }, never undone
      acctRebirths: save?.acctRebirths ?? 0, // rebirths on every hero of the account (main.js keeps it current)
      lives: save?.acctLives || null, // (0.63) the account's other classes: { cls: { prim, ember } } (main.js / the server keep it current)
      streak: save?.streak ?? 0, // tier bosses beaten in a row without being knocked out (0.28)
      dust: save?.dust ?? 0, // Wishdust: enchanting (0.29)
      glows: Array.isArray(save?.glows) ? save.glows.slice() : [], // weapon glows earned (0.31)
      glow: save?.glow ?? null, // ...and the one shown
      thieves: save?.thieves ?? 0, // Wishthieves caught
      misc: Object.assign({}, save?.misc), // stackable things in the pouch (0.32): { glass: 2, ... }
      bounties: Array.isArray(save?.bounties) ? save.bounties.map((b) => Object.assign({}, b)) : [], // jobs from the board (0.33)
      bank: { b: Object.assign({}, save?.bank?.b), q: Object.assign({}, save?.bank?.q) }, // (0.53) progress no job was waiting for
      depth: Math.max(0, Math.floor(Number(save?.depth) || 0)), // (0.54) the Depth chosen (0: the world above)
      keepsake: save?.keepsake ? migrateItem(save.keepsake) : null, // (0.53) the keepsake slot: Edric's Colours, kept through rebirth, at your level
      bountyN: save?.bountyN ?? 0,
      lsPool: 0, // lifesteal you can still heal this second (0.32)
      unwishedT: 0, // The Unwished Crown: > 0 after avoiding a Doom
      sporeT: 0, // Sporeheart: time to the next heal
      nightcutT: 0, // Nightcut set: > 0 after a Clean Kill
      chillT: 0, // Frostbound elites: slower while > 0
      swingCount: 0,
      empowerT: 0, // > 0 while the next ability is empowered (after Nightstep)
      empowerMult: 1,
      veilT: 0, // > 0 while Veiled (Shadowdancer's Veilstep)
      spin: null, // a Berserker's moving Whirlwind
      reck: 0, // Reckoning stacks (Bulwark)
      reckAcc: 0,
      ward: 0, // Arcane Ward (Mage): a barrier that soaks damage first
      wardT: 0, // > 0: hurt recently, the ward waits
      slipT: 0,
      rushT: 0, // > 0 while Evasive Roll's attack speed bonus lasts
      rushAs: 0,
      barrage: null, // Barrage arrows still to come
      undyingUsed: false,
    };
    if (save) {
      for (const slot of SLOTS) p.equipped[slot] = migrateItem(save.equipped?.[slot] || null);
      p.bag = (save.bag || []).slice(0, CONFIG.BAG_SIZE + 4 * perkRank(p.rebirth, 'pockets')).map(migrateItem); // (0.30: rarity names moved)
    } else {
      p.equipped.weapon = starterWeapon(this.cls);
    }
    this.player = p;
    restoreRecalled(p); // (0.62) pieces recalled before 0.62 get their prime back
    if (!p.keepsake && p.quests && p.quests.edric && p.quests.edric.s === 'done') {
      // (0.53) Edric's Colours already earned before the keepsake slot existed: it is yours now too
      p.keepsake = rollUnique(this.streamRng('keepsake', 1), p.level, 'bluetrim', this.cls);
      p.keepsake.keepsake = true;
    }
    this.recalcStats();
    p.hp = p.stats.maxHp;
    p.lsPool = p.stats.maxHp * CONFIG.LIFESTEAL_RATE; // the lifesteal budget starts full
    return p;
  }

  /** Rebuild the modifier set from this run's augments and equipped Immortal effects. */
  recalcMods() {
    const m = defaultMods();
    // Talents first, so an augment that sets the same thing higher wins for the run.
    const spec = SPECS[this.player.spec];
    if (spec && spec.perk) spec.perk.apply(m); // the subclass trait, from the moment it is chosen
    // A subclass can swap out an ability (the Shadowdancer's Starglass Kunai).
    const base = CLASSES[this.cls].abilities;
    this.kit = spec && spec.kit && spec.cls === this.cls ? Object.assign({}, base, spec.kit) : base;
    if (spec) for (const t of spec.talents) if (this.player.talents[t.id] > 0) t.apply(m, this.player.talents[t.id]);
    // Sets (0.29): two pieces worn give the first bonus, four the second too.
    const sets = setCounts(this.player.equipped);
    for (const id in sets) {
      const set = SETS[id];
      if (!set || set.cls !== this.cls) continue;
      if (sets[id] >= 2) set.two.apply(m);
      if (sets[id] >= 4) set.four.apply(m);
    }
    for (const id of this.augments) if (AUGMENTS[id]) AUGMENTS[id].apply(m);
    for (const slot of [...SLOTS, 'keepsake']) {
      const it = slot === 'keepsake' ? this.player.keepsake : this.player.equipped[slot];
      if (!it || !it.effect) continue;
      // From level 15 an Immortal's effect is its subclass version (0.32); a Remnant's own is the same for all.
      const spc = this.player.spec && SPEC_IMMORTALS[this.player.spec];
      const own = EFFECTS[it.effect] && !EFFECTS[it.effect].unique && spc ? spc[EFFECTS[it.effect].slot] : null;
      if (own) own.apply(m);
      else if (it.effect in m) m[it.effect] = true;
    }
    // Wishborne points (past level 100), never in the Weekly Echo (its build is fixed).
    if (!this.trial) for (const k of WISH_IDS) if (this.player.wishStats && this.player.wishStats[k] > 0) WISH_STATS[k].apply(m, this.player.wishStats[k], this.cls, this.player.spec);
    // Rebirth perks (0.43): Starborn, never in the Weekly Echo either
    const star = this.trial ? 0 : perkRank(this.player.rebirth, 'starborn');
    if (star > 0) { m.adPct += 0.02 * star; m.hpPct += 0.02 * star; }
    this.mods = m;
  }

  /** Recompute derived stats from level + equipped gear + augments. */
  recalcStats() {
    const p = this.player;
    this.recalcMods();
    const m = this.mods;
    if (p.keepsake) relevelItem(p.keepsake, p.level); // (0.53) the keepsake is always your level
    const M = this.mastery(); // (0.63) Mastery from every life on the account
    p.headStart = M.headStart;
    p.animus = M.animus; // (0.63) Animus: Mind-Locked is shorter by this much
    for (const slot of SLOTS) if (p.equipped[slot] && (p.equipped[slot].heirloom || p.equipped[slot].recalled)) relevelItem(p.equipped[slot], p.level); // ...and an Heirloom, and (0.62) a recalled piece
    for (const it of p.bag) if (it && (it.heirloom || it.recalled)) relevelItem(it, p.level);
    const g = sumGearStats(p.keepsake ? Object.assign({}, p.equipped, { keepsake: p.keepsake }) : p.equipped);
    const L = p.level - 1;
    const prevMax = p.stats.maxHp || 0;
    const slip = p.slipT > 0;
    const c = CLASSES[this.cls].stats; // class multipliers on the base numbers
    p.stats = {
      maxHp: Math.round(((220 + 30 * L) * c.hp + g.hp) * (1 + m.hpPct)),
      // `ad` is the hero's power for every damage formula. Spell Power (staves) feeds it for the Mage.
      ad: Math.round(((18 + 3.2 * L) * c.ad + g.ad + (this.cls === 'mage' ? g.sp : 0)) * (1 + m.adPct)),
      armor: Math.round(((8 + 2 * L) * c.armor + g.armor) * (1 + m.armorPct)),
      as: 1.05 * c.as * (1 + 0.015 * L + g.as / 100 + m.asPct + (slip && !CASTER_CLASSES.has(this.cls) ? 0.3 : 0) + (p.rushT > 0 ? p.rushAs : 0) + (p.hurricaneT > 0 ? p.hurricaneAs : 0) + (p.bloodied ? m.bloodAs : 0)) * m.asMult, // attacks per second
      ms: 6.4 * c.ms * (1 + g.ms / 100 + m.msPct + (slip ? 0.4 : 0) + (p.bloodied ? m.bloodMs : 0)),
      haste: g.haste + m.haste + c.haste,
      crit: g.crit + m.crit + c.crit,
      lifesteal: g.lifesteal + m.lifesteal,
      regen: 1 + 0.1 * p.level,
    };
    if (p.wished && p.wished.speed) {
      // The Asker's speed (0.40): for the rest of the fight
      p.stats.ms *= 1 + 0.2 * p.wished.speed;
      p.stats.as *= 1 + 0.2 * p.wished.speed;
    }
    if (prevMax && p.stats.maxHp > prevMax) p.hp += p.stats.maxHp - prevMax;
    p.hp = Math.min(p.hp, p.stats.maxHp);
  }

  toSave() {
    const p = this.player;
    const maxCheckpoint = Math.max(this.maxCheckpoint, checkpointFor(this.wave.cleared + 1));
    return {
      v: 2,
      pace4: true, // EXP saved at the 0.49 pace
      cls: this.cls,
      level: p.level,
      exp: p.exp,
      equipped: p.equipped,
      bag: p.bag,
      gold: p.gold,
      scrap: p.scrap,
      keys: p.keys,
      tickets: p.tickets,
      visited: p.visited,
      quests: p.quests,
      signs: p.signs,
      bossKills: p.bossKills,
      spec: p.spec,
      talents: p.talents,
      talentBuilds: p.talentBuilds,
      tomes: p.tomes,
      ranks: p.ranks,
      skillPoints: p.skillPoints,
      tierMax: p.tierMax,
      worldTier: p.worldTier,
      riftMax: p.riftMax,
      riftBest: p.riftBest,
      wish: p.wish,
      wishExp: p.wishExp,
      wishPts: p.wishPts,
      rebirth: p.rebirth,
      acctRebirths: p.acctRebirths,
      endings: p.endings,
      tomasMet: p.tomasMet,
      delveBest: p.delveBest,
      choices: p.choices,
      wishStats: p.wishStats,
      streak: p.streak,
      dust: p.dust,
      glows: p.glows,
      glow: p.glow,
      thieves: p.thieves,
      misc: p.misc,
      bounties: p.bounties,
      bank: p.bank,
      keepsake: p.keepsake,
      depth: p.depth,
      bountyN: p.bountyN,
      bestWave: this.bestWave,
      maxCheckpoint,
      checkpoint: maxCheckpoint,
      // Beaten world bosses still on their way back: seconds left, by camp.
      campDown: Object.fromEntries(Object.entries(this.campDown || {}).map(([k, t]) => [k, Math.round((t - this.ticks) * CONFIG.TICK)]).filter(([, s]) => s > 0)),
    };
  }

  runCommands() {
    const cmds = this.commands;
    this.commands = [];
    if (!this.party) return this.applyCommands(cmds);
    const lead = this.heroes[0];
    for (const h of this.heroes.slice()) {
      const mine = cmds.filter((c) => (c.pid || 0) === h.pid);
      if (!mine.length || !this.heroes.includes(h)) continue;
      // A friend's commands say which moment of the host's world their screen showed (0.41.1):
      // how far behind that is (there and back) is how long their hits wait for a parry.
      for (const c of mine) {
        if (h === lead || typeof c.seen !== 'number') continue;
        const lag = Math.max(0, Math.min(LAG_CAP, (this.ticks - c.seen) * CONFIG.TICK));
        h.lag = h.lag == null ? lag : h.lag * 0.8 + lag * 0.2;
      }
      this.use(h);
      this.applyCommands(mine);
      this.tagOwned();
    }
    this.use(lead);
  }

  applyCommands(cmds) {
    const p = this.player;
    for (const c of cmds) {
      if (this.recorder) this.recorder.push([this.ticks, c]);
      if (ACTIVE_CMDS.has(c.type)) {
        p.idleT = 0; // someone is at the keys (see Doom)
        p.idleDooms = 0;
      }
      if (this.trial && TRIAL_LOCKED.has(c.type)) continue; // the week fixes gear and build
      // Inventory commands work even while dead or between waves.
      if (c.type === 'equip') this.equip(c.index);
      else if (c.type === 'autoEquip') this.equipUpgrades();
      else if (c.type === 'discard') this.discard(c.index);
      else if (c.type === 'scrap') this.scrapNonUpgrades(c.keep);
      else if (c.type === 'upgrade') this.upgradeItem(c.slot);
      else if (c.type === 'enchant') this.rerollLine(c.slot, c.key, !!c.essence);
      else if (c.type === 'recall') this.recallMemory(c.slot);
      else if (c.type === 'echoUp') this.echoUpgrade(c.slot);
      else if (c.type === 'reforge') this.enchantItem(c.slot, c.key, c.to);
      else if (c.type === 'ascend') this.ascendItem(c.slot, c.index);
      else if (c.type === 'setGlow') { if (c.id === null || p.glows.includes(c.id)) p.glow = c.id; }
      else if (c.type === 'buyMerchant') this.buyMerchant(c.i);
      else if (c.type === 'wishReset') this.wishReset();
      else if (c.type === 'claimBounty') this.claimBounty(c.i);
      else if (c.type === 'swapBounty') this.swapBounty(c.i);
      else if (c.type === 'craftImmortal') this.craftImmortal(c.slot);
      else if (c.type === 'summonRemnant') this.summonRemnant();
      else if (c.type === 'openCache') this.openCache(c.tier);
      else if (c.type === 'buyTome') this.buyTome();
      else if (c.type === 'rankUp') this.rankUp(c.slot);
      else if (c.type === 'augment') this.takeAugment(c.id);
      else if (c.type === 'reroll') this.rerollOffer();
      else if (c.type === 'nextWave') {
        if (this.wave.phase === 'intermission' && !this.offer) this.wave.timer = Math.min(this.wave.timer, 0.05);
        if (this.ring) this.ring.hold = false; // (0.59) pushing on
      }
      if (p.dead) continue;
      switch (c.type) {
        case 'move': {
          const r = dHypot(c.x, c.z);
          const max = this.radius - p.radius;
          const k = r > max ? max / r : 1;
          p.moveTarget = { x: c.x * k, z: c.z * k };
          p.bestLeft = null;
          p.targetId = null;
          p.autoAcquire = false;
          p.attackMove = null;
          p.atkWind = 0;
          break;
        }
        case 'attackMove': {
          // Shift + right-click: attack the enemy nearest you (or your cursor) if one is in reach,
          // else walk to the spot and attack the first enemy that comes into reach on the way.
          const r = dHypot(c.x, c.z);
          const max = this.radius - p.radius;
          const k = r > max ? max / r : 1;
          const am = { x: c.x * k, z: c.z * k, near: c.near === 'hero' ? 'hero' : 'cursor' };
          p.targetId = null;
          p.atkWind = 0;
          p.bestLeft = null;
          const t = this.attackMoveTarget(am, true);
          if (t) {
            p.targetId = t.id;
            p.moveTarget = null;
            p.attackMove = null;
            p.autoAcquire = true;
          } else {
            p.moveTarget = { x: am.x, z: am.z };
            p.attackMove = am;
            p.autoAcquire = false;
          }
          break;
        }
        case 'setAutoAttack':
          p.autoAttack = c.on !== false;
          break;
        case 'attack':
          if (this.enemyById(c.id)) {
            p.targetId = c.id;
            p.moveTarget = null;
            p.attackMove = null;
            p.autoAcquire = true;
          }
          break;
        case 'stop':
          p.moveTarget = null;
          p.targetId = null;
          p.autoAcquire = false;
          p.attackMove = null;
          p.atkWind = 0;
          break;
        case 'cast':
          this.castAbility(c.slot, c.x, c.z);
          break;
        case 'parry':
          this.tryParry(c.seen);
          break;
        case 'potion':
          this.usePotion();
          break;
        case 'acceptQuest':
          this.acceptQuest(c.id);
          break;
        case 'claimQuest':
          this.claimQuest(c.id);
          break;
        case 'readSign':
          this.readSign(c.id);
          break;
        case 'chooseSpec':
          this.chooseSpec(c.id);
          break;
        case 'talent':
          this.learnTalent(c.id);
          break;
        case 'autoTalents':
          this.autoTalents();
          break;
        case 'askerAnswer':
          this.askerAnswer(c.pick);
          break;
        case 'respec':
          this.respec();
          break;
        case 'travel':
          // Waygate: jump to a discovered map, arriving at its entrance.
          if (this.mode === 'explore' && MAPS[c.to] && MAPS[c.to].deep) {
            // The Deep (0.54): a Primordial's domain, once its Depth is open (the party's leader decides)
            const lead = this.travelHook ? p : this.heroes[0].player; // (0.55) on the server, each hero for themselves
            if (this.depthOpen(lead, MAPS[c.to].deep)) this.goMap(c.to, MAPS[c.to].portals[0].to);
            else this.emit('depthLocked', { depth: MAPS[c.to].deep, name: MAPS[c.to].name });
          } else if (this.mode === 'explore' && MAPS[c.to] && MAPS[c.to].unlock && this.questState(MAPS[c.to].unlock) !== 'done') this.emit('mapLocked', { name: MAPS[c.to].name, quest: QUESTS[MAPS[c.to].unlock].name });
          else if (this.mode === 'explore' && MAPS[c.to] && MAPS[c.to].fromTier && this.worldTier() < MAPS[c.to].fromTier) this.emit('wildsLocked', { tier: MAPS[c.to].fromTier, name: MAPS[c.to].name });
          else if (this.mode === 'explore' && MAPS[c.to] && (p.visited.includes(c.to) || c.to === 'town' || (MAPS[c.to].fromTier && this.worldTier() >= MAPS[c.to].fromTier))) this.goMap(c.to, MAPS[c.to].portals[0].to);
          break;
        case 'setDepth':
          // The Deep (0.54): choose a Depth (0: back to the world above), in Haven, by the party's leader
          if ((this.cur === this.heroes[0] || this.travelHook) && this.mode === 'explore' && this.map.safe) {
            const d = Math.floor(Number(c.depth) || 0);
            if (d === 0 || this.depthOpen(p, d)) {
              p.depth = d;
              this.emit('depthSet', d ? { depth: d, numeral: DEEP.depths[d].numeral, name: DEEP.depths[d].name, need: DEEP.depths[d].ember, ember: this.ember(p) } : { depth: 0 });
            }
          }
          break;
        case 'setTier':
          if ((this.cur === this.heroes[0] || this.travelHook) && this.mode === 'explore' && this.map.safe) {
            p.depth = 0; // a world tier is the world above
            p.worldTier = Math.max(1, Math.min(p.tierMax, Math.floor(Number(c.tier) || 1)));
            this.emit('tierSet', { tier: p.worldTier, numeral: TIERS[p.worldTier].numeral, name: TIERS[p.worldTier].name });
          }
          break;
        case 'enterRift':
          this.enterRift(c.tier);
          break;
        case 'riftHome':
          this.riftHome();
          break;
        case 'ringLeave':
          if (this.mode === 'arena' && this.ring) {
            this.ringPay();
            if (this.travelHook && !this.ringGone) {
              this.ringGone = true; // (0.59) on the server: home to Haven
              this.travelHook(this.cur, 'town', 'ring', null);
            }
          }
          break;
        case 'enterRing':
          this.enterRing(c.startWave, c.focus);
          break;
        case 'ringOn':
          if (this.ring) this.ring.hold = false;
          break;
        case 'rebirth':
          this.rebirth(c.heirloom || null);
          break;
        case 'unwish':
          this.unwish(c.choice);
          break;
        case 'enterDelve':
          this.enterDelve(c.tier);
          break;
        case 'scarfChoice':
          this.scarfChoice(c.choice);
          break;
        case 'meetOdile':
          this.meetOdile();
          break;
        case 'metTomas':
          this.player.tomasMet = true;
          break;
        case 'rebirthPerk':
          this.buyPerk(c.id);
          break;
        case 'wishSpend':
          this.wishSpend(c.stat, c.n);
          break;
        case 'dropItem':
          this.dropItem(c.index);
          break;
        case 'tradeAsk':
          this.tradeAsk(c.to);
          break;
        case 'tradeAnswer':
          this.tradeAnswer(!!c.yes);
          break;
        case 'tradeSet':
          this.tradeSet(c.items, c.gold);
          break;
        case 'tradeOk':
          this.tradeOk();
          break;
        case 'tradeCancel':
          this.tradeCancel('cancelled');
          break;
        case 'warp': {
          // Waystone to waystone on the same map: only this hero moves.
          const to = this.map.waystones && this.map.waystones[c.to];
          if (this.mode !== 'explore' || !to || this.stoneOn == null || this.stoneOn === c.to || p.dead) break;
          const d = dHypot(to.x, to.z) || 1;
          p.x = p.px = to.x - (to.x / d) * 2.2; // step off the stone, toward the middle
          p.z = p.pz = to.z - (to.z / d) * 2.2;
          p.moveTarget = null;
          p.targetId = null;
          this.pushOut(p, p.radius);
          this.stoneOn = null;
          this.stoneArmed = false;
          this.emit('warp', { x: p.x, z: p.z, name: to.name });
          break;
        }
      }
    }
  }

  tryParry(seen = null) {
    const p = this.player;
    if (p.dash || p.leap) return;
    if (p.parryT > 0) return;
    if (p.parryCd > 0) {
      // Pressed a touch early: remember it and parry the moment the cooldown ends.
      if (p.parryCd <= CONFIG.PARRY_BUFFER) p.parryBuffer = CONFIG.PARRY_BUFFER;
      else this.emit('parryNotReady');
      return;
    }
    const window = this.parry.window * this.mods.parryWindow;
    p.parryT = window;
    p.parryAge = 0;
    p.parryCd = this.parry.cooldown;
    p.parryHit = false;
    p.parryBuffer = 0;
    p.atkWind = 0;
    this.emit('parryStart');
    const h = this.cur;
    if (typeof seen === 'number' && h !== this.heroes[0] && this.party) {
      // A friend pressed this on their screen a little while ago (0.41.1): the window opened then.
      const age = Math.max(0, Math.min(LAG_CAP, (this.ticks - seen) * CONFIG.TICK));
      // Hits that landed since then were held back (hitPlayer): parry the ones that fall inside it.
      const late = (h.lateHits || []).filter((x) => x.tick >= seen - 1 && (x.tick - seen) * CONFIG.TICK <= window);
      h.lateHits = (h.lateHits || []).filter((x) => !late.includes(x));
      for (const x of late) {
        p.parryAge = Math.max(0, (x.tick - seen) * CONFIG.TICK);
        p.parryT = Math.max(p.parryT, 0.01);
        this.hitPlayer(x.dmg, Object.assign({}, x.opts, { held: true }));
      }
      p.parryAge = Math.max(p.parryAge, age);
      p.parryT = p.parryHit ? Math.max(0.15, window - age) : Math.max(0, window - age);
    }
  }

  /** Hits held back for a friend's parry (0.41.1) land once that friend's lag has passed. */
  landLateHits() {
    const h = this.cur;
    if (!h.lateHits || !h.lateHits.length) return;
    const due = h.lateHits.filter((x) => this.time >= x.due);
    if (!due.length) return;
    h.lateHits = h.lateHits.filter((x) => this.time < x.due);
    for (const x of due) this.hitPlayer(x.dmg, Object.assign({}, x.opts, { held: true, noParry: true }));
  }

  usePotion() {
    const p = this.player;
    if (this.twist === 'dry') return; // (0.60) Dry Spell
    if (p.potions <= 0 || p.potionCd > 0 || p.hp >= p.stats.maxHp) return;
    p.potions--;
    p.potionCd = CONFIG.POTION_COOLDOWN;
    this.healPlayer(p.stats.maxHp * CONFIG.POTION_HEAL, true);
    this.emit('potion');
  }

  healPlayer(amount, show) {
    const p = this.player;
    if (p.dead) return 0; // a fallen teammate's level-up waits until they are back up
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    const healed = Math.round(p.hp - before);
    if (show && healed > 0) this.emit('heal', { x: p.x, z: p.z, amount: healed });
  }

  abilityUnlocked(slot) {
    return this.player.level >= this.kit[slot].unlock || (slot === 'r' && this.mods.rUnlock);
  }

  /** Cooldown in seconds after ranks, augments and ability haste, before Overflow's floor. */
  rawCooldown(slot) {
    const p = this.player;
    return this.kit[slot].cd * this.mods[slot + 'Cd'] * (1 - CONFIG.RANK_COOLDOWN * (p.ranks[slot] - 1)) * (100 / (100 + p.stats.haste)) * (this.twist === 'haste' ? 1 / 1.3 : 1); // (0.60) Haste
  }

  /** Overflow (0.43 for Warrior and Mage; every class since 0.50): the shortest a cooldown can be. */
  overflowFloor() {
    return CONFIG.CD_FLOOR;
  }

  /** Cooldown in seconds after ranks, augments and ability haste. */
  abilityCooldown(slot) {
    const raw = this.rawCooldown(slot);
    const floor = this.overflowFloor();
    return floor > 0 && this.kit[slot].cd > floor ? Math.max(floor, raw) : raw;
  }

  /**
   * Overflow (0.43): haste that would take a cooldown below the floor is not lost, it becomes
   * damage. A cooldown that would be 0.25 s stays at 1 s and the ability hits 4 times as hard.
   * (0.50) Skills that deal no damage get a stronger effect instead: Evasive Roll's attack speed,
   * Nightstep's empower, Skirmish Step's quick shots (see the dash's end in stepPlayer).
   */
  overflowMult(slot) {
    const floor = this.overflowFloor();
    if (!(floor > 0) || !(this.kit[slot].cd > floor)) return 1;
    const raw = this.rawCooldown(slot);
    return raw < floor ? floor / raw : 1;
  }

  /** Weight of Iron's share of armor (Bulwark), more while Hold the Line holds with Bastion Plate (0.61.5). */
  ironWeightNow() {
    const m = this.mods;
    return m.ironWeight * (1 + (this.player.bastionT > 0 ? m.bastionIron || 0 : 0));
  }

  /** (0.62.1) Three quarters of `n` Wishdust, rounded by chance so small amounts still come in on average. */
  keptRate(n) {
    const x = n * KEPT_RATE;
    const whole = Math.floor(x);
    return whole + (this.rng() < x - whole ? 1 : 0);
  }

  /** A damage streak (0.61.5): `per` more damage for each stack, up to `max` stacks, for `dur` seconds from the last. */
  addSurge(per, max, dur) {
    const p = this.player;
    p.surgeN = Math.min(max, (p.surgeT > 0 ? p.surgeN || 0 : 0) + 1);
    p.surgePer = per;
    p.surgeT = dur;
  }

  abilityDamage(slot) {
    const p = this.player;
    let s = p.stats;
    // Weight of Iron (Bulwark, 0.43): armor counts toward ability damage
    if (this.mods.ironWeight > 0) s = Object.assign({}, s, { ad: s.ad + s.armor * this.ironWeightNow() });
    return this.kit[slot].dmg(s, p.level) * this.mods[slot + 'Dmg'] * (1 + CONFIG.RANK_DAMAGE * (p.ranks[slot] - 1)) * this.overflowMult(slot);
  }

  /**
   * A skill's damage taken apart for its tooltip (0.52): the formula's own parts (a flat amount, an
   * amount per level, a share of attack damage, and for Deadeye your attacks per second), then each
   * multiplier on top, ending at the number abilityDamage gives times class power (what lands on an
   * enemy of your level, before crits and Steady Breath or Ambush). Every skill formula in the game has
   * that shape; one that did not would come back with `exact: false` and only its total shown.
   */
  abilityBreakdown(slot) {
    const p = this.player, def = this.kit[slot], m = this.mods;
    const s = p.stats;
    const iron = m.ironWeight > 0 ? s.armor * this.ironWeightNow() : 0;
    const f = (ad, lvl, as) => def.dmg(Object.assign({}, s, { ad, as }), lvl);
    const flat = f(0, 0, 1), perLevel = f(0, 1, 1) - flat, adRatio = f(1, 0, 1) - flat;
    const asScales = Math.abs(f(1, 0, 2) / Math.max(1e-9, f(1, 0, 1)) - 2) < 1e-6;
    const ad = s.ad + iron;
    const formula = (flat + perLevel * p.level + adRatio * ad) * (asScales ? Math.max(1, s.as || 1) : 1);
    const real = def.dmg(Object.assign({}, s, { ad }), p.level);
    const rank = 1 + CONFIG.RANK_DAMAGE * (p.ranks[slot] - 1);
    const mods = m[slot + 'Dmg'];
    const over = this.overflowMult(slot);
    const power = classPower(this.cls, SPECS[p.spec] && SPECS[p.spec].cls === this.cls ? p.spec : null, p.level);
    // cooldown: base, talents and augments, rank, haste, and the 1 s floor
    const cdMods = m[slot + 'Cd'];
    const cdRank = 1 - CONFIG.RANK_COOLDOWN * (p.ranks[slot] - 1);
    return {
      flat, perLevel, adRatio, ad, iron, level: p.level, asScales, as: s.as, formula: real,
      exact: Math.abs(formula - real) <= Math.max(1e-6, Math.abs(real) * 1e-9),
      rank, mods, over, power, final: real * rank * mods * over * power,
      crit: Math.min(100, s.crit), critMult: this.critMultiplier(),
      cd: { base: def.cd, mods: cdMods, rank: cdRank, haste: s.haste, raw: this.rawCooldown(slot), final: this.abilityCooldown(slot), floor: this.overflowFloor() },
    };
  }

  /** Damage every enemy in a cone in front of the hero (Cleave and its echo). */
  cleaveHit(dir, range, angle, dmg, slot = 'q', def = null) {
    const p = this.player;
    const m = this.mods;
    let hits = 0;
    const struck = [];
    const inCone = (e) => {
      if (e.dead || e.state === 'spawn') return false;
      const de = dist(e.x, e.z, p.x, p.z);
      if (de > range + e.radius) return false;
      const ae = dAtan2(e.z - p.z, e.x - p.x);
      return !(de > e.radius + 0.8 && Math.abs(angDiff(ae, dir)) > angle / 2 + 0.1);
    };
    const caught = this.enemies.filter(inCone);
    dmg *= this.momentum(slot === 'cleave' ? 'q' : slot, caught.length); // Momentum (Warrior)
    for (const e of caught) {
      if (slot === 'q' && m.qSunder > 0) {
        e.vulnT = 4;
        e.vuln = m.qSunder;
      }
      const slow = Math.max((def && def.slow) || 0, m[slot + 'Slow'] || 0);
      if (slow > 0) {
        e.slowT = (def && def.slowDur) || 2;
        e.slow = slow;
      }
      this.hitEnemy(e, dmg, { source: slot });
      hits++;
      if (def) struck.push(e);
    }
    if (struck.length) this.warriorStorm(struck);
    return hits;
  }

  /**
   * Hit everything around the hero (Fan of Knives, Whirlwind, each beat of a Berserker's spin).
   * `interrupt`: knock back / interrupt as the ability says (a spin only does it on its first beat).
   */
  novaHit(slot, def, dmg, radius, interrupt = true, storm = true) {
    const p = this.player;
    const m = this.mods;
    const pull = slot === 'w' && m.wPull;
    const bleed = (slot === 'w' ? m.wBleed : 0) || def.bleed || 0;
    const slow = (slot === 'w' ? m.wSlow : 0) || def.slow || 0;
    const knock = def.knockback || 0;
    const knockOn = interrupt;
    // Momentum (Warrior): more for every enemy caught after the first.
    let caught = 0;
    for (const e of this.enemies) if (!e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= radius + e.radius) caught++;
    dmg *= this.momentum(slot, caught);
    let hits = 0;
    const struck = [];
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const de = dist(e.x, e.z, p.x, p.z);
      if (de > radius + e.radius) continue;
      hits++;
      if (slot === 'w') struck.push(e);
      // Gravity Well: heavy enemies (never bosses) get dragged and stunned too.
      const heavy = e.def.heavy && !(pull && m.wPullHeavy && !e.def.boss);
      if (bleed > 0) {
        e.bleedT = 3;
        e.bleedDps = (p.stats.ad * bleed) / 3;
      }
      if (slow > 0) {
        e.slowT = def.slowDur || 3;
        e.slow = slow;
      }
      if (def.expose > 0) {
        // Death Lotus (Assassin): Exposed takes more from you, and every side of it is its back.
        e.exposedT = def.expose;
        e.exposedPid = this.cur.pid;
      }
      this.hitEnemy(e, dmg, { source: slot });
      if (this.breakNext && !e.dead) {
        if (e.def.boss) this.addPosture(e, 2, true);
        else this.stun(e, 1.5);
        e.vulnT = Math.max(e.vulnT, 4);
        e.vuln = Math.max(e.vuln || 0, 0.2);
      }
      if (slot === 'w' && m.wTaunt > 0 && !e.dead) {
        // The Warden's Call: whatever it hits fights you for a while.
        e.tauntPid = this.cur.pid;
        e.tauntT = m.wTaunt;
        e.tauntVuln = m.tauntVuln || 0; // Wardbreaker
      }
      if (m[slot + 'Stun'] > 0 && !e.dead && !heavy) this.stun(e, m[slot + 'Stun']);
      if (e.dead || heavy || !interrupt || !(knock || def.interrupt)) continue;
      if (!knock) {
        // (a Berserker's spin: no push, but its first beat interrupts)
      } else if (pull) {
        // Drag it to just in front of you (knockback slows at 9/s, so speed = 9 x distance).
        const gap = Math.max(0, de - (e.radius + p.radius + 0.4));
        const de1 = Math.max(de, 0.01);
        e.kx = ((p.x - e.x) / de1) * gap * 9;
        e.kz = ((p.z - e.z) / de1) * gap * 9;
      } else {
        const k = knock / Math.max(de, 0.4);
        e.kx = (e.x - p.x) * k;
        e.kz = (e.z - p.z) * k;
      }
      if (e.state === 'windup' || e.state === 'chase') {
        this.removeTelegraph(e);
        e.state = 'recover';
        e.t = 0.6;
        e.cue = 0;
      }
    }
    if (storm) this.warriorStorm(struck);
    this.breakNext = false;
    return hits;
  }

  /** Momentum (Warrior): Cleave and Whirlwind deal more for every enemy they catch after the first. */
  momentum(slot, n) {
    const ps = CLASSES[this.cls].passive;
    if (!ps || !ps.momentum || (slot !== 'q' && slot !== 'w') || n < 2) return 1;
    return 1 + Math.min(ps.momentumMax, ps.momentum * (n - 1));
  }

  /** Stormcaller (Warrior): lightning on every enemy a Cleave or Whirlwind hit, up to 6. */
  warriorStorm(list) {
    if (!this.mods.stormcaller || this.cls !== 'warrior') return;
    const p = this.player;
    let n = 0;
    for (const e of list) {
      if (e.dead || n >= 6) continue;
      n++;
      this.emit('lightning', { x: e.x, z: e.z, small: true });
      this.hitEnemy(e, p.stats.ad * 0.6, { source: 'storm', canCrit: false });
    }
  }

  /** Warrior passive: every enemy Cleave or Whirlwind hits takes time off the other cooldowns. */
  battleRhythm(slot, hits) {
    const ps = CLASSES[this.cls].passive;
    if (!ps || !ps.rhythm || !hits) return;
    const p = this.player;
    const cut = Math.min(ps.rhythmMax, ps.rhythm * hits);
    for (const k of ['q', 'w', 'e', 'r']) if (k !== slot && p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - cut);
  }

  /** A Shadowdancer afterimage (one from Nightstep, one from Last Rites with Crowd of One). */
  addShadow(src, x, z, facing) {
    const pid = this.cur.pid;
    this.shadows = this.shadows.filter((s) => !(s.pid === pid && s.src === src));
    const dur = this.mods.shadowDur || 5;
    this.shadows.push({ id: this.nextId++, pid, src, x, z, t: dur, dur, facing, cls: this.cls, throwT: 0 });
  }

  /**
   * Most burn stacks an enemy can carry: 50, plus ten for every 120 ability haste with Searing (0.43;
   * tenfold, 0.56.3: talents and gear still name the old numbers, CONFIG.BURN scales them).
   */
  burnCap() {
    const m = this.mods;
    return CONFIG.BURN.cap * ((m.burnMax || 5) + (m.burnHaste > 0 ? Math.floor(this.player.stats.haste / m.burnHaste) : 0));
  }

  /**
   * Pyromancer burns: stacks (up to burnCap) that all renew when a new one lands. `stacks` is as talents
   * and gear name it (CONFIG.BURN.add times that many land); `exact` for a burn passed on whole (Wildfire).
   */
  addBurn(e, stacks, exact = false) {
    const m = this.mods;
    if (!(m.burnPerStack > 0) || e.dead) return;
    const p = this.player;
    // Like an ability: spell power plus a bit per level, and it grows with Fire Bolt's rank.
    const per = CONFIG.BURN.dmg * (p.stats.ad * m.burnPerStack + p.level * (m.burnPerLevel || 0)) * (m.burnMult || 1) * (1 + CONFIG.RANK_DAMAGE * ((p.ranks.q || 1) - 1));
    const live = e.burnT > 0;
    const cap = this.burnCap();
    e.burnStacks = Math.min(cap, (live ? e.burnStacks : 0) + (exact ? stacks : stacks * CONFIG.BURN.add));
    e.burnCap = cap; // (the roar is measured against it, and the health bar shows it)
    e.burnDps = Math.max(live ? e.burnDps : 0, per);
    e.burnT = m.burnTime || 4;
    e.burnPid = this.cur.pid;
    if (!live) e.burnAcc = 0;
  }

  /**
   * Hoarfrost (Frostbinder): stacks that last 5 seconds (each new one renews them). At frostMax the
   * enemy Shatters: heavy damage, a freeze (bosses turn Brittle instead), and shards that give
   * Hoarfrost to enemies nearby, which can set off a chain through a pack.
   */
  addFrost(e, n, depth = 0) {
    const m = this.mods;
    if (!(m.frostMax > 0) || e.dead || e.state === 'spawn' || e.frostLock > 0) return;
    e.frostStacks = (e.frostT > 0 ? e.frostStacks : 0) + n;
    e.frostT = 5;
    if (e.frostStacks >= m.frostMax) this.shatterFrost(e, depth);
  }

  shatterFrost(e, depth = 0) {
    const m = this.mods;
    const p = this.player;
    e.frostStacks = 0;
    e.frostT = 0;
    // a moment before it can build Hoarfrost again (Deep Winter, 0.43: shorter with ability haste, never under 0.3 s)
    e.frostLock = m.frostHaste ? Math.max(0.3, 1.5 * (100 / (100 + p.stats.haste))) : 1.5;
    const dmg = (1.7 * p.stats.ad + 40 + 10 * p.level) * (1 + CONFIG.RANK_DAMAGE * ((p.ranks.q || 1) - 1)) * (m.frostDmg || 1);
    // Shards fly further as Ice Bolt grows (0.28): 3 m, plus half a metre a rank.
    const reach = (m.frostReach || 3) + 0.5 * ((p.ranks.q || 1) - 1);
    this.emit('frostShatter', { id: e.id, x: e.x, z: e.z, radius: reach });
    if (m.shatterSurge > 0) this.addSurge(m.shatterSurge, 5, 6); // Rimeguard Mantle (0.61.5)
    this.hitEnemy(e, dmg, { source: 'shatter' });
    if (!e.dead) {
      if (e.def.boss) {
        e.vulnT = Math.max(e.vulnT, 4);
        e.vuln = Math.max(e.vuln || 0, m.brittle || 0.15);
        e.brittle = true;
      } else if (!(e.freezeWait > 0)) {
        // the freeze has its own wait, so a fast Shatter chain never keeps anything frozen for good
        const fz = (e.def.heavy ? 0.4 : 1) * (m.frostFreeze || 1);
        this.stun(e, fz);
        e.freezeWait = fz + 1;
      }
    }
    if (m.shatterChain && depth === 0) {
      // Rimeheart: each Shatter also Shatters the nearest other enemy within 6 m.
      let o = null, od = 6;
      for (const x of this.enemies) {
        if (x === e || x.dead || x.state === 'spawn') continue;
        const dx = dist(x.x, x.z, e.x, e.z) - x.radius;
        if (dx < od) { od = dx; o = x; }
      }
      if (o) this.shatterFrost(o, 1);
    }
    if (depth >= 3) return; // a chain stops after a few jumps
    for (const o of this.enemies) {
      if (o === e || o.dead || o.state === 'spawn') continue;
      if (dist(o.x, o.z, e.x, e.z) > reach + o.radius) continue;
      this.addFrost(o, 2, depth + 1);
    }
  }

  /** Starwake: homing motes from where the Mage lands, one per enemy while there are enough. */
  fireMotes(ds) {
    const p = this.player;
    const mo = ds.motes;
    const count = mo.count + (this.mods.eMotes || 0);
    const near = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= mo.range + e.radius)
      .sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z));
    if (!near.length) return;
    for (let i = 0; i < count; i++) {
      const t = near[i % near.length];
      const a = dAtan2(t.z - p.z, t.x - p.x) + (i - (count - 1) / 2) * 0.5; // fan out, then curve in
      this.projectiles.push({
        id: this.nextId++, owner: 'player', kind: 'mote', slot: ds.slot, pid: this.cur.pid, targetId: t.id,
        x: p.x + dCos(a) * 0.6, z: p.z + dSin(a) * 0.6, px: p.x, pz: p.z,
        vx: dCos(a) * mo.speed, vz: dSin(a) * mo.speed, speed: mo.speed,
        radius: 0.4, dmg: ds.dmg, parryable: false, reflected: false, life: 1.6, dead: false,
      });
    }
    this.emit('motes', { x: p.x, z: p.z, count });
  }

  /** Rimewalls: stand, then shatter, freezing what is beside them. */
  stepWalls(dt) {
    if (!this.walls.length) return;
    for (const wl of this.walls) {
      wl.t -= dt;
      if (wl.t > 0) continue;
      wl.done = true;
      this.obstacles = this.obstacles.filter((o) => o !== wl.ob);
      const h = this.heroByPid(wl.pid);
      if (!h) continue;
      this.as(h, () => {
        const m = this.mods;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn' || this.wallDist(wl, e.x, e.z) > 1.8 + e.radius) continue;
          e.slowT = 2;
          e.slow = 0.5;
          if (m.chillWeak > 0) e.chillWeak = Math.max(e.chillWeak || 0, m.chillWeak);
          this.hitEnemy(e, wl.dmg, { source: 'r' });
          if (e.dead) continue;
          if (m.frostMax > 0) this.addFrost(e, 3);
          if (e.dead) continue;
          if (e.def.boss) this.addPosture(e, 1, false);
          else this.stun(e, wl.stun);
        }
        this.emit('wallShatter', { x: wl.x, z: wl.z, rot: wl.rot, hw: wl.hw });
      });
    }
    this.walls = this.walls.filter((wl) => !wl.done);
  }

  /** Distance from a point to a Rimewall's box (0 inside it). */
  wallDist(wl, x, z) {
    const c = dCos(wl.rot), s = dSin(wl.rot);
    const dx = x - wl.x, dz = z - wl.z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return dHypot(Math.max(0, Math.abs(lx) - wl.hw), Math.max(0, Math.abs(lz) - wl.hd));
  }

  stepShadows(dt) {
    if (!this.shadows.length) return;
    for (const s of this.shadows) {
      s.t -= dt;
      if (s.throwT > 0) s.throwT -= dt;
    }
    this.shadows = this.shadows.filter((s) => s.t > 0);
  }

  /** Starglass Kunai: flies straight and stops in the first enemy; a second kunai of the same throw deals less. */
  stepKunai(pr, dt) {
    pr.px = pr.x;
    pr.pz = pr.z;
    if (pr.targetId != null) {
      // Follows its target (aimed at the enemy nearest the cursor when thrown).
      const t = this.enemyById(pr.targetId);
      if (t && !t.dead) {
        const d = dist(t.x, t.z, pr.x, pr.z);
        if (d > 0.05) {
          pr.vx = ((t.x - pr.x) / d) * pr.speed;
          pr.vz = ((t.z - pr.z) / d) * pr.speed;
        }
      } else pr.targetId = null;
    }
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    pr.life -= dt;
    if (pr.life <= 0 || dHypot(pr.x, pr.z) > this.radius + 4) {
      pr.dead = true;
      return;
    }
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (dist(pr.x, pr.z, e.x, e.z) > pr.radius + e.radius) continue;
      pr.dead = true; // a kunai stops in the first thing it hits
      const again = pr.group.hit.has(e.id);
      pr.group.hit.add(e.id);
      if (pr.slow > 0) {
        e.slowT = 3;
        e.slow = pr.slow;
      }
      this.hitEnemy(e, pr.dmg * (again ? pr.repeat : 1), { source: 'w' });
      return;
    }
  }

  /** Second Death: the mark goes off and the target takes a share of what it took meanwhile. */
  popMark(e) {
    const h = this.heroByPid(e.markPid);
    const amount = e.markAcc * e.markPct;
    e.markT = 0;
    e.markAcc = 0;
    if (!h || amount < 1 || e.dead) return;
    this.as(h, () => {
      this.emit('markPop', { id: e.id, x: e.x, z: e.z, amount: Math.round(amount) });
      this.hitEnemy(e, amount, { raw: true, canCrit: false, source: 'mark' });
    });
  }

  /** Frozen Orb: drift toward the target point, chilling and cutting what it passes, then shatter. */
  stepOrb(pr, dt) {
    pr.px = pr.x;
    pr.pz = pr.z;
    const len = Math.min(pr.speed * dt, Math.max(0, pr.left));
    pr.x += (pr.vx / pr.speed) * len;
    pr.z += (pr.vz / pr.speed) * len;
    pr.left -= len;
    pr.next -= dt;
    if (pr.next <= 0) {
      pr.next += pr.tick;
      for (const e of this.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        if (dist(e.x, e.z, pr.x, pr.z) > pr.aura + e.radius) continue;
        if (!(e.slowT > 0 && e.slow > pr.chill)) {
          e.slow = pr.chill;
          e.slowT = Math.max(e.slowT || 0, 1);
        }
        if (this.mods.chillWeak > 0) e.chillWeak = Math.max(e.chillWeak || 0, this.mods.chillWeak);
        this.hitEnemy(e, pr.dmg * pr.shard, { source: 'w' });
        if (this.mods.orbFrost > 0 && pr.ticks % 2 === 0 && !e.dead) this.addFrost(e, this.mods.orbFrost);
      }
      pr.ticks = (pr.ticks || 0) + 1;
      this.emit('orbTick', { x: pr.x, z: pr.z, radius: pr.aura });
    }
    if (pr.left <= 0) this.shatterOrb(pr);
  }

  shatterOrb(pr) {
    if (pr.dead) return;
    pr.dead = true;
    const m = this.mods;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (dist(e.x, e.z, pr.x, pr.z) > pr.burst + e.radius) continue;
      e.slowT = pr.slowDur;
      e.slow = pr.slow;
      if (m.chillWeak > 0) e.chillWeak = Math.max(e.chillWeak || 0, m.chillWeak);
      this.hitEnemy(e, pr.dmg, { source: 'w' });
      if (m.orbFrost > 0 && !e.dead) this.addFrost(e, Math.max(2, m.orbBurstFrost || 0)); // (Winter's Loop: 3)
      if (e.dead || e.def.heavy) continue;
      if (m.wStun > 0) this.stun(e, m.wStun);
      else if (e.state === 'windup' || e.state === 'chase') {
        this.removeTelegraph(e);
        e.state = 'recover';
        e.t = 0.6;
        e.cue = 0;
      }
    }
    this.emit('shatter', { x: pr.x, z: pr.z, radius: pr.burst });
  }

  /** The living enemy nearest a point, within `pick` of it and within `reach` of the hero. */
  enemyNear(x, z, pick, reach) {
    const p = this.player;
    let best = null;
    let bestD = pick;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (dist(e.x, e.z, p.x, p.z) - e.radius > reach) continue;
      const d = dist(e.x, e.z, x, z) - e.radius;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** One heavy single-target hit (Mercy Stroke, Last Rites). */
  strike(target, slot, dmg) {
    const p = this.player;
    const def = this.kit[slot];
    const toHero = dAtan2(p.z - target.z, p.x - target.x);
    // "Exposed" = you are behind it, or it is stunned (a parry sets this up).
    const marked = target.exposedT > 0 && target.exposedPid === this.cur.pid && !target.def.boss; // Death Lotus (a boss keeps its guard)
    const exposed = target.state === 'stunned' || marked || Math.abs(angDiff(target.facing, toHero)) > 1.9;
    const m = this.mods;
    let bonus = def.behind && exposed ? 1 + def.behind + (m[slot + 'Behind'] || 0) : 1;
    // Shadowstrike (Assassin): double damage on an enemy already below 30% health.
    const execute = def.execute > 0 && !target.def.boss && target.hp < target.maxHp * (def.execute + (m.qExecute || 0)); // (Nightfang: 40%)
    if (execute) bonus *= 2;
    if (m[slot + 'Bleed'] > 0) {
      target.bleedT = 3;
      target.bleedDps = (p.stats.ad * m[slot + 'Bleed']) / 3;
    }
    p.facing = dAtan2(target.z - p.z, target.x - p.x);
    this.emit('cast', { slot, fx: 'strike', x: target.x, z: target.z, exposed: bonus > 1, execute });
    if (slot === 'r' && m.rMark > 0) {
      // Second Death: count everything this hero deals it for 3 seconds (this strike included).
      target.markT = 3;
      target.markPid = this.cur.pid;
      target.markAcc = 0;
      target.markPct = m.rMark;
      this.emit('mark', { id: target.id, x: target.x, z: target.z });
    }
    this.hitEnemy(target, dmg * bonus, { source: slot });
    if (slot === 'q' && m.nightcutChain && p.nightcutT > 0) {
      // Nightcut: after a Clean Kill, Shadowstrike also cuts everything close to its target.
      p.nightcutT = 0;
      for (const o of this.enemies) {
        if (o === target || o.dead || o.state === 'spawn' || dist(o.x, o.z, target.x, target.z) > 3 + o.radius) continue;
        this.hitEnemy(o, dmg * bonus, { source: 'q' });
      }
      this.emit('nightcut', { x: target.x, z: target.z, radius: 3 });
    }
    if (slot === 'q' && m.shadowSlash > 0) {
      // Mirrored Cut: each afterimage copies the Mercy Stroke on whatever is nearest it.
      for (const s of this.shadows) {
        if (s.pid !== this.cur.pid) continue;
        let best = null, bd = 4;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          const de = dist(e.x, e.z, s.x, s.z) - e.radius;
          if (de < bd) { bd = de; best = e; }
        }
        if (!best) continue;
        s.facing = dAtan2(best.z - s.z, best.x - s.x);
        s.throwT = 0.25;
        this.emit('shadowSlash', { x: s.x, z: s.z, tx: best.x, tz: best.z });
        this.hitEnemy(best, dmg * m.shadowSlash, { source: 'q' });
      }
    }
    if (!target.dead && m[slot + 'Stun'] > 0) {
      if (target.def.boss) this.addPosture(target, 1, false);
      else this.stun(target, m[slot + 'Stun']);
    }
    if (target.dead && def.refundOnKill) {
      p.cd[slot] *= 1 - def.refundOnKill;
      this.emit('cdReset', { slot });
    }
  }

  /** How far basic attacks reach (talents and augments can stretch it; a Bloodied Berserker's crescents, 0.60.2). */
  basicRange() {
    const base = this.basic.range * (1 + (this.mods.rangePct || 0));
    const lv = this.bloodReach();
    return lv ? Math.max(base, CONFIG.CRESCENT.reach[lv] * (this.mods.crescentFar || 1)) : base; // (0.61.1) Crimson Arc
  }

  /** (0.60.2) Hurricane (Windrunner, passive from level 6): the wind never leaves her back, so Tailwind is always on. */
  galeAlways() {
    const r = this.kit && this.kit.r;
    return !!(r && r.passive && r.tailwind && this.abilityUnlocked('r'));
  }

  /**
   * (0.60.2) Crimson Reach (Berserker): 0 normally, 1 while Bloodied, 2 while Crimson Oath burns.
   * It stretches his swings into red crescents, and Cleave and Whirlwind further and wider.
   */
  bloodReach() {
    const p = this.player;
    if (!this.mods.bloodRage || !p) return 0;
    return p.frenzyT > 0 ? 2 : p.bloodied ? 1 : 0;
  }

  /**
   * The basic attack lands (melee) or leaves the bow or staff (ranged).
   * `dmgOverride` is used by Barrage, whose arrows count as basic attacks.
   */
  basicAttack(target, dmgOverride = null) {
    const p = this.player;
    const b = this.basic;
    p.swingCount++;
    const dmg = dmgOverride ?? p.stats.ad * b.mult;
    // Steady Aim: every third shot gets +100% crit chance; anything over 100% becomes crit damage.
    const critBonus = this.cls === 'archer' && p.swingCount % this.mods.critEvery === 0 ? 100 : 0;
    const forceCrit = false;
    let gale = false;
    if (p.quickShots > 0 && dmgOverride === null) {
      // Skirmish Step's shots are gusts: harder, and no mirror turns them back (0.42)
      p.quickShots--;
      gale = true;
    }
    if (b.shot) {
      const a = dAtan2(target.z - p.z, target.x - p.x);
      this.projectiles.push({
        id: this.nextId++, owner: 'player', kind: b.shot, basic: true, gale, targetId: target.id, forceCrit, critBonus, pierce: gale || (critBonus > 0 && this.mods.steadyPierce) ? [] : null,
        x: p.x + dCos(a) * 0.7, z: p.z + dSin(a) * 0.7, px: p.x, pz: p.z,
        vx: dCos(a) * b.speed, vz: dSin(a) * b.speed, speed: b.speed,
        radius: 0.3, dmg: gale ? dmg * (p.quickMult || 1.25) : dmg, parryable: false, reflected: false, life: 1.2, dead: false,
      });
    } else if (this.bloodReach()) {
      // (0.60.2) Crimson Reach: a Bloodied Berserker's swing flies on as a red crescent, cutting all in its
      // path. Within arm's reach the swing lands as ever and the crescent cuts what is behind (for less);
      // further off, the crescent carries the whole blow.
      const lv = this.bloodReach(), C = CONFIG.CRESCENT;
      const near = dist(p.x, p.z, target.x, target.z) - target.radius <= this.basic.range * (1 + (this.mods.rangePct || 0)) + 0.3;
      if (near) this.hitEnemy(target, dmg, { basic: true, source: 'basic', forceCrit, critBonus });
      const a = dAtan2(target.z - p.z, target.x - p.x);
      this.projectiles.push({
        id: this.nextId++, owner: 'player', kind: 'crescent', basic: true, pierce: near ? [target.id] : [], critBonus: near ? 0 : critBonus,
        x: p.x + dCos(a) * 0.6, z: p.z + dSin(a) * 0.6, px: p.x, pz: p.z,
        vx: dCos(a) * C.speed, vz: dSin(a) * C.speed, speed: C.speed,
        radius: C.width[lv] * (this.mods.crescentWide || 1), dmg: near ? dmg * C.behind[lv] : dmg, parryable: false, reflected: false, life: (C.reach[lv] * (this.mods.crescentFar || 1) + 1.5) / C.speed, dead: false, lv,
      });
      p.facing = a;
    } else {
      this.hitEnemy(target, dmg, { basic: true, source: 'basic', forceCrit, critBonus });
      if (p.veilT > 0 && this.mods.veilCopy > 0) {
        // Veiled (Shadowdancer): every afterimage throws a knife at the same target.
        for (const s of this.shadows) {
          if (s.pid !== this.cur.pid || target.dead) continue;
          if (dist(s.x, s.z, target.x, target.z) > 18) continue;
          s.facing = dAtan2(target.z - s.z, target.x - s.x);
          s.throwT = 0.25;
          this.emit('shadowSlash', { x: s.x, z: s.z, tx: target.x, tz: target.z, veil: true });
          this.hitEnemy(target, dmg * this.mods.veilCopy, { source: 'veil' });
        }
      }
    }
    if (b.shot && this.mods.crosswind > 0 && dmgOverride === null && !target.dead) {
      // Crosswind (Windrunner, 0.43): extra arrows at the same target, more the faster you shoot
      // (attacks per second squared, over 32: half an arrow at 4 a second, 2 at 8, 4.5 at 12; at most 6)
      p.crossAcc = (p.crossAcc || 0) + (p.stats.as * p.stats.as) / 32;
      const n = Math.min(6, Math.floor(p.crossAcc));
      p.crossAcc -= n;
      for (let i = 0; i < n; i++) {
        const a3 = dAtan2(target.z - p.z, target.x - p.x) + (i % 2 ? 1 : -1) * (0.08 + 0.05 * (i >> 1));
        this.projectiles.push({
          id: this.nextId++, owner: 'player', kind: b.shot, basic: true, targetId: target.id, critBonus: 0, gust: true, cross: true,
          x: p.x + dCos(a3) * 0.7, z: p.z + dSin(a3) * 0.7, px: p.x, pz: p.z,
          vx: dCos(a3) * b.speed, vz: dSin(a3) * b.speed, speed: b.speed,
          radius: 0.3, dmg: dmg * this.mods.crosswind, parryable: false, reflected: false, life: 1.2, dead: false,
        });
      }
    }
    const hur = this.kit.r;
    if (b.shot && hur && hur.passive && hur.extra && dmgOverride === null && this.abilityUnlocked('r')) {
      // Hurricane (Windrunner, passive since 0.60.2): every real basic attack also looses arrows that sweep
      // out wide and curve in (like a gust), at other enemies nearby, or at the target if there are none.
      const n = hur.extra + (this.mods.hurricaneExtra || 0);
      const reach = this.basicRange() + 1.5;
      const others = this.enemies.filter((e) => e !== target && !e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= reach + e.radius)
        .sort((a, c) => dist(a.x, a.z, p.x, p.z) - dist(c.x, c.z, p.x, p.z)).slice(0, n);
      const aims = others.slice();
      while (aims.length < n && !target.dead) aims.push(target);
      const mult = Math.max(hur.extraMult, this.mods.hurricaneMult || 0) * (1 + (hur.rankMult || 0) * Math.max(0, (p.ranks.r || 1) - 1)) * (this.mods.hurricaneDmg || 1);
      aims.forEach((o, i) => {
        const side = i % 2 ? 1 : -1;
        const a2 = dAtan2(o.z - p.z, o.x - p.x) + side * (0.95 + 0.15 * (i >> 1)); // out wide first...
        this.projectiles.push({
          id: this.nextId++, owner: 'player', kind: b.shot, basic: true, noTail: true, targetId: o.id, critBonus: 0, gust: true, arc: 3.2, // ...then curving in (no Tailwind of their own)
          x: p.x + dCos(a2) * 0.7, z: p.z + dSin(a2) * 0.7, px: p.x, pz: p.z,
          vx: dCos(a2) * b.speed * 0.8, vz: dSin(a2) * b.speed * 0.8, speed: b.speed * 0.8,
          radius: 0.3, dmg: dmg * mult, parryable: false, reflected: false, life: 1.8, dead: false,
        });
      });
    }
    if (this.mods.stormcaller && this.cls === 'archer' && p.swingCount % 4 === 0) this.lightning(target); // Stormstring
  }

  /**
   * Cast Q, W, E or R. What happens depends on the ability's `type`
   * (see sim/classes.js); the numbers come from the class kit.
   */
  castAbility(slot, x, z) {
    const p = this.player;
    const m = this.mods;
    const def = this.kit[slot];
    if (def && def.type === 'orb') {
      // Frozen Orb: casting again while it is out shatters it where it is.
      const mine = this.projectiles.find((pr) => pr.kind === 'orb' && !pr.dead && pr.pid === this.cur.pid);
      if (mine) {
        this.shatterOrb(mine);
        return;
      }
    }
    if (slot === 'e' && m.shadowStep && !p.dash && !p.leap) {
      // Afterimage: E again trades places with the afterimage Nightstep left.
      const sh = this.shadows.find((s) => s.pid === this.cur.pid && s.src === 'e' && !s.swapped);
      if (sh) {
        const ox = p.x, oz = p.z;
        p.x = p.px = sh.x;
        p.z = p.pz = sh.z;
        sh.x = ox;
        sh.z = oz;
        sh.swapped = true;
        p.moveTarget = null;
        this.emit('shadowSwap', { x: p.x, z: p.z, fx: ox, fz: oz });
        if (m.swapVeil) {
          // Veilweave: the swap Veils you and Veilstep is ready again.
          p.veilT = Math.max(p.veilT, ((this.kit.q && this.kit.q.veil) || 4) + (m.veilTime || 0));
          p.cd.q = 0;
          this.emit('veil', { x: p.x, z: p.z, time: p.veilT });
        }
        return;
      }
    }
    if (!def || def.passive || !this.abilityUnlocked(slot) || p.cd[slot] > 0 || p.dash || p.leap || p.castLock > 0.05 || p.channel || (p.sealT > 0 && p.sealSlot === slot)) return; // (0.60.2) a passive is never cast
    let a = dAtan2(z - p.z, x - p.x);
    if (!Number.isFinite(a)) a = p.facing;
    const d = dist(x, z, p.x, p.z);
    const cos = dCos(a);
    const sin = dSin(a);
    const reach = slot === 'q' || slot === 'w' ? CONFIG.CRESCENT.grow[this.bloodReach()] : 1; // (0.60.2) Crimson Reach
    const range = (def.range || 0) * (m[slot + 'Range'] || 1) * reach;
    const radius = (def.radius || 0) * (m[slot + 'Radius'] || 1) * reach;

    // Single-target abilities need someone to hit before they go on cooldown.
    let target = null;
    if (def.type === 'strike' || def.type === 'barrage' || def.type === 'ricochet') {
      target = this.enemyNear(x, z, 3.5, range) || this.enemyNear(p.x, p.z, range + 2, range);
      if (!target) {
        this.emit('noTarget', { slot, x: p.x, z: p.z });
        return;
      }
    }

    p.cd[slot] = this.abilityCooldown(slot);
    p.lastSlot = slot; // (0.54) what a seal takes
    if (slot === 'q' && m.bloodQcd && p.bloodied) p.cd.q *= 0.5; // Bloodreaver
    if (m.bloodCost > 0 && (slot === 'q' || slot === 'w')) {
      // Blood Rage: Cleave and Whirlwind are paid for in health, but never below 10%.
      const cost = Math.min(p.stats.maxHp * m.bloodCost, Math.max(0, p.hp - p.stats.maxHp * 0.1));
      if (cost >= 1) {
        p.hp -= cost;
        this.emit('bloodCost', { x: p.x, z: p.z, amount: Math.round(cost) });
      }
    }
    p.atkWind = 0;
    p.parryT = 0; // casting drops the parry stance
    let dmg = this.abilityDamage(slot);
    let empCrit = false;
    if (p.empowerT > 0 && slot !== 'e' && dmg > 0) {
      // Nightstep (and Steady Breath): the next ability hits harder.
      dmg *= p.empowerMult;
      empCrit = !!p.empowerCrit;
      p.empowerT = 0;
      p.empowerCrit = false;
      this.emit('empowered', { slot, x: p.x, z: p.z });
    }
    /** A point toward the cursor, no further than the ability's range, inside the map. */
    const aimPoint = () => {
      const len = Math.min(d, range);
      return this.clampToArena(p.x + cos * len, p.z + sin * len, p.radius);
    };

    switch (def.type) {
      case 'cone': {
        const angle = Math.min(TAU, def.angle * (m[slot + 'Angle'] || 1) * (slot === 'q' ? CONFIG.CRESCENT.wide[this.bloodReach()] : 1)); // (0.60.2) wider when Bloodied
        p.facing = a;
        p.castLock = 0.16;
        this.battleRhythm(slot, this.cleaveHit(a, range, angle, dmg, slot, def));
        if (slot === 'q' && (m.qEcho > 0 || m.qExtra > 0)) {
          // a second strike, and (0.61.1) one more for each Twin Cleave
          const strikes = (m.qEcho > 0 ? 1 : 0) + (m.qExtra || 0);
          const mult = m.qExtra > 0 ? Math.max(m.qEcho, 0.6) : m.qEcho;
          for (let k = 1; k <= strikes; k++) this.delayed.push({ t: 0.28 * k, kind: 'cleave', dir: a, range, angle, dmg: dmg * mult });
        }
        this.emit('cast', { slot, fx: 'cone', x: p.x, z: p.z, dir: a, range, angle });
        break;
      }
      case 'nova': {
        p.castLock = 0.12;
        if (slot === 'w' && m.reckoning && p.reck > 0) {
          // Reckoning (Bulwark): every blow you took or turned aside comes back in this Whirlwind.
          dmg *= 1 + (CONFIG.RECKON_PER + (m.reckonPer || 0)) * p.reck; // (0.61.1) Long Memory
          this.breakNext = m.reckonBreak && p.reck >= 5; // Wardstone: a big Reckoning Breaks what it hits
          this.emit('reckoning', { x: p.x, z: p.z, stacks: p.reck });
          p.reck = 0;
          p.reckAcc = 0;
        }
        const hits = this.novaHit(slot, def, dmg, radius, true, true);
        this.emit('cast', { slot, fx: 'nova', x: p.x, z: p.z, radius, pull: slot === 'w' && m.wPull });
        this.battleRhythm(slot, hits);
        break;
      }
      case 'spin': {
        // Whirlwind (Berserker): a spin you can move in, hitting all around every half second.
        // Red Tempo (0.43): the spin keeps time with your hands, one beat per basic attack (2 to 10 a second)
        const tick = m.spinTempo ? clamp(1 / Math.max(0.1, p.stats.as), 0.1, def.tick) : def.tick;
        const ticks = Math.max(1, Math.round((def.duration + (m.wSpinTime || 0)) / tick)); // Bloodbound: longer
        p.spin = { left: ticks, next: 0, tick, dmg: dmg * def.tickMult, radius: radius / reach, slot, first: true }; // (0.60.2) its reach is taken beat by beat
        this.emit('cast', { slot, fx: 'spin', x: p.x, z: p.z, radius, dur: def.duration });
        break;
      }
      case 'dash': {
        p.facing = a;
        if (m[slot + 'Blast'] > 0) {
          // Rift: a blast where the hero was standing.
          for (const e of this.enemies) {
            if (e.dead || e.state === 'spawn') continue;
            if (dist(e.x, e.z, p.x, p.z) <= 3.5 + e.radius) this.hitEnemy(e, p.stats.ad * m[slot + 'Blast'], { source: slot });
          }
          this.emit('burst', { x: p.x, z: p.z, radius: 3.5 });
        }
        const len = clamp(d, def.minRange || 0, range);
        let end = this.clampToArena(p.x + cos * len, p.z + sin * len, p.radius);
        let faceId = null;
        if (def.ambush) {
          // Ambush (Assassin): land behind the enemy nearest the cursor, facing its back.
          const t = this.enemyNear(x, z, 3.5, range + 1);
          if (t) {
            const back = t.facing + Math.PI;
            const stand = t.radius + p.radius + 0.3;
            end = this.clampToArena(t.x + dCos(back) * stand, t.z + dSin(back) * stand, p.radius);
            faceId = t.id;
          }
        }
        if (slot === 'e' && m.shadowStep) this.addShadow('e', p.x, p.z, a);
        if (def.veil) this.addShadow(slot, p.x, p.z, a); // Veilstep leaves one too
        p.dash = { t: 0, dur: def.duration, sx: p.x, sz: p.z, ex: end.x, ez: end.z, hit: new Set(), dmg, refunded: false, slot, width: def.width || 0, empower: def.empower || null, rush: def.rush || null, motes: def.motes || null, veil: def.veil || 0, faceId, quick: def.quick || null };
        p.moveTarget = null;
        this.emit('cast', { slot, fx: 'dash', x: p.x, z: p.z, dir: a, ex: end.x, ez: end.z });
        break;
      }
      case 'leap': {
        p.facing = a;
        const end = aimPoint();
        p.leap = { t: 0, dur: def.duration, sx: p.x, sz: p.z, ex: end.x, ez: end.z, dmg, radius, stun: def.stun || 0 };
        p.moveTarget = null;
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: end.x, z: end.z, dir: 0, radius, t: 0, dur: def.duration, parryable: false };
        this.telegraphs.push(tele);
        p.leap.tele = tele;
        this.emit('cast', { slot, fx: 'leap', x: p.x, z: p.z, ex: end.x, ez: end.z });
        break;
      }
      case 'line': {
        p.facing = a;
        p.castLock = 0.16;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          const rx = e.x - p.x;
          const rz = e.z - p.z;
          const along = rx * cos + rz * sin;
          if (along < -e.radius || along > range + e.radius) continue;
          if (Math.abs(rz * cos - rx * sin) > def.width / 2 + e.radius) continue;
          if (slot === 'q' && m.qSunder > 0) {
            e.vulnT = 4;
            e.vuln = m.qSunder;
          }
          this.hitEnemy(e, dmg, { source: slot, forceCrit: slot === 'q' && m.qCrit }); // Bullseye Loop
        }
        this.emit('cast', { slot, fx: 'line', x: p.x, z: p.z, dir: a, range, width: def.width });
        break;
      }
      case 'bolt': {
        p.facing = a;
        p.castLock = 0.12;
        const bolts = m[slot + 'Bolts'] || 1;
        for (let i = 0; i < bolts; i++) {
          const ba = a + (i - (bolts - 1) / 2) * 0.16;
          this.projectiles.push({
            id: this.nextId++, owner: 'player', kind: 'bolt', slot,
            x: p.x + dCos(ba) * 0.8, z: p.z + dSin(ba) * 0.8, px: p.x, pz: p.z,
            vx: dCos(ba) * def.speed, vz: dSin(ba) * def.speed, speed: def.speed,
            radius: 0.5, dmg: dmg * (bolts > 1 ? 0.65 : 1),
            splash: (def.splash || 0) * (m[slot + 'Radius'] || 1), splashMult: slot === 'q' && m.qSplashFull ? 1 : def.splashMult || 0,
            bleed: m[slot + 'Bleed'] || 0, ice: !!def.ice,
            parryable: false, reflected: false, life: range / def.speed, dead: false,
          });
        }
        this.emit('cast', { slot, fx: 'bolt', x: p.x, z: p.z, dir: a });
        break;
      }
      case 'smoulder': {
        // Smoulder (Pyromancer): burn stacks and a mark that makes burns bite harder.
        const c = aimPoint();
        p.facing = a;
        p.castLock = 0.14;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(e.x, e.z, c.x, c.z) > radius + e.radius) continue;
          this.addBurn(e, m.smoulderStacks || 2);
          e.smoulderT = 5;
          e.smoulderAmp = m.smoulderAmp || 0.5;
          this.hitEnemy(e, dmg, { source: slot });
        }
        this.emit('smoulder', { x: c.x, z: c.z, radius });
        this.emit('cast', { slot, fx: 'bolt', x: p.x, z: p.z, dir: a });
        break;
      }
      case 'wall': {
        // Rimewall (Frostbinder): a box of ice across the aim line. See stepWalls.
        const c = aimPoint();
        p.facing = a;
        p.castLock = 0.18;
        const rot = a + Math.PI / 2;
        const hw = (def.length * (m.wallLen || 1)) / 2;
        const dur = def.duration + (m.wallDur || 0);
        const ob = { shape: 'box', x: c.x, z: c.z, hw, hd: 0.45, rot, kind: 'icewall' };
        this.obstacles = this.obstacles.concat([ob]); // a new array: the map's own list is never changed
        this.walls.push({ id: this.nextId++, pid: this.cur.pid, x: c.x, z: c.z, rot, hw, hd: 0.45, t: dur, dur, dmg, stun: def.stun || 1, ob });
        // (0.56.3) It rises hard: everything it comes up beside is hit, given Hoarfrost and staggered.
        const near = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && this.wallDist(this.walls[this.walls.length - 1], e.x, e.z) <= 1.4 + e.radius);
        for (const e of near) {
          this.hitEnemy(e, dmg * (def.rise || 0.6), { source: 'r' });
          if (e.dead) continue;
          if (m.frostMax > 0) this.addFrost(e, 2);
          if (e.dead) continue;
          if (e.def.boss) this.addPosture(e, 1, false);
          else this.stun(e, 0.5);
        }
        // Anyone standing where it rises is pushed aside.
        for (const e of this.enemies) if (!e.dead) this.pushOut(e, e.radius);
        for (const h of this.heroes) if (!h.player.dead) this.pushOut(h.player, h.player.radius);
        this.emit('cast', { slot, fx: 'bolt', x: p.x, z: p.z, dir: a });
        this.emit('wallRise', { x: c.x, z: c.z, rot, hw });
        break;
      }
      case 'kunai': {
        // Starglass Kunai: one from you and one from each of your afterimages, all at the
        // enemy nearest the cursor (they follow it), or at the cursor with no one near it.
        const seek = def.seek ? this.enemyNear(x, z, def.seek, range) : null;
        const tx = seek ? seek.x : x, tz = seek ? seek.z : z;
        if (seek) {
          a = dAtan2(tz - p.z, tx - p.x);
          if (!Number.isFinite(a)) a = p.facing;
        }
        p.facing = a;
        p.castLock = 0.12;
        const group = { hit: new Set() };
        const from = [{ x: p.x, z: p.z, ang: a }];
        for (const s of this.shadows) {
          if (s.pid !== this.cur.pid) continue;
          let sa = dAtan2(tz - s.z, tx - s.x);
          if (!Number.isFinite(sa) || dist(tx, tz, s.x, s.z) < 0.3) sa = a;
          s.facing = sa;
          s.throwT = 0.25;
          from.push({ x: s.x, z: s.z, ang: sa });
          if (m.kunaiTwice) from.push({ x: s.x, z: s.z, ang: sa + 0.12 }); // Starglass Edge: two from each afterimage
        }
        const width = (def.width || 1) * (m[slot + 'Radius'] || 1);
        const kdmg = dmg * (p.veilT > 0 ? 1 + (m.veilKunai || 0) : 1); // (Starglass Edge: more while Veiled)
        for (const f of from) {
          const c = dCos(f.ang), sn = dSin(f.ang);
          this.projectiles.push({
            id: this.nextId++, owner: 'player', kind: 'kunai', slot, pid: this.cur.pid,
            x: f.x + c * 0.6, z: f.z + sn * 0.6, px: f.x, pz: f.z, vx: c * def.speed, vz: sn * def.speed, speed: def.speed,
            radius: width / 2, dmg: kdmg, group, repeat: p.veilT > 0 ? 1 : def.repeat || 0.6, slow: m[slot + 'Slow'] || 0,
            targetId: seek ? seek.id : null, // afterimages may be further off: a homing kunai flies a little longer
            parryable: false, reflected: false, life: (range / def.speed) * (seek ? 1.6 : 1), dead: false,
          });
        }
        this.emit('cast', { slot, fx: 'kunai', x: p.x, z: p.z, dir: a, count: from.length });
        break;
      }
      case 'orb': {
        // Frozen Orb: drifts to the cursor (see stepOrb), then shatters.
        p.facing = a;
        p.castLock = 0.14;
        const len = clamp(d, def.minRange || 0, range);
        const end = this.clampToArena(p.x + cos * len, p.z + sin * len, 0.5);
        const sx = p.x + cos * 0.8;
        const sz = p.z + sin * 0.8;
        this.projectiles.push({
          id: this.nextId++, owner: 'player', kind: 'orb', slot, pid: this.cur.pid,
          x: sx, z: sz, px: p.x, pz: p.z, vx: cos * def.speed, vz: sin * def.speed, speed: def.speed,
          radius: 0.6, dmg, left: Math.max(0, dHypot(end.x - sx, end.z - sz)), next: 0.05, tick: def.tick,
          aura: radius, burst: def.burst * (m[slot + 'Radius'] || 1), shard: def.shard, chill: def.chill,
          slow: def.slow, slowDur: def.slowDur, parryable: false, reflected: false, life: 99, dead: false,
        });
        this.emit('cast', { slot, fx: 'orb', x: p.x, z: p.z, dir: a });
        break;
      }
      case 'barrage': {
        // Arrows leave one after another (see stepPlayer); each is a basic attack.
        p.facing = dAtan2(target.z - p.z, target.x - p.x);
        p.barrage = { id: target.id, left: def.count + (m.wExtra || 0), t: 0, gap: def.gap, dmg: this.abilityDamage(slot), range: range + 2 };
        p.targetId = target.id;
        this.emit('cast', { slot, fx: 'barrage', x: target.x, z: target.z });
        break;
      }
      case 'strike': {
        p.targetId = target.id;
        p.moveTarget = null;
        p.autoAcquire = true;
        if (def.gap) {
          if (slot === 'r' && m.rShadow) this.addShadow('r', p.x, p.z, dAtan2(target.z - p.z, target.x - p.x));
          // Jump next to the target, then strike on arrival.
          const ta = dAtan2(p.z - target.z, p.x - target.x);
          const stand = target.radius + p.radius + 0.4;
          const end = this.clampToArena(target.x + dCos(ta) * stand, target.z + dSin(ta) * stand, p.radius);
          p.dash = { t: 0, dur: 0.14, sx: p.x, sz: p.z, ex: end.x, ez: end.z, hit: new Set(), dmg: 0, refunded: true, slot, width: 0, strike: { id: target.id, dmg } };
          this.emit('cast', { slot, fx: 'dash', x: p.x, z: p.z, dir: dAtan2(end.z - p.z, end.x - p.x), ex: end.x, ez: end.z });
        } else {
          p.castLock = 0.12;
          this.strike(target, slot, dmg);
        }
        break;
      }
      case 'zone': {
        const c = aimPoint();
        const ticks = Math.max(1, Math.round(def.duration / def.tick));
        const lasts = def.duration + (m[slot + 'Duration'] || 0); // Endless Rain adds ticks, each as strong as before
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius, t: 0, dur: lasts + (def.channel || 0), parryable: false };
        this.telegraphs.push(tele);
        const zone = { x: c.x, z: c.z, radius, lasts, tick: def.tick, dmg: dmg / ticks, total: dmg, slow: def.slow || 0, slowDur: def.slowDur || 1, slot, tele, opening: def.opening || 0, pin: def.pin || 0 };
        p.facing = a;
        if (def.channel) {
          // (0.51) Arrow Storm is drawn for a second, slowed, and only then loosed
          p.channel = { kind: 'zone', t: def.channel, dur: def.channel, slow: def.channelSlow || 0.6, slot, zone, tele };
          p.castLock = 0.05;
        } else {
          this.startZone(zone);
          p.castLock = 0.16;
        }
        this.emit('cast', { slot, fx: 'zone', x: c.x, z: c.z, radius, channel: def.channel || 0 });
        break;
      }
      case 'hurricane': {
        // Hurricane (Windrunner): a burst of speed, arrows at everything nearby, and the roll is ready.
        p.hurricaneT = def.duration + (m.rDuration || 0);
        p.hurricaneAs = def.as;
        p.cd.e = 0;
        p.castLock = 0.1;
        this.recalcStats();
        this.emit('cast', { slot, fx: 'hurricane', x: p.x, z: p.z });
        this.emit('buff', { name: 'Hurricane', x: p.x, z: p.z });
        break;
      }
      case 'deadeye': {
        // Deadeye (Sharpshooter, 0.42; 0.51: drawn for a second, slowed, then loosed, and it pierces)
        p.facing = a;
        if (def.channel) {
          p.channel = { kind: 'deadeye', t: def.channel, dur: def.channel, slow: def.channelSlow || 0.6, slot, a, range, width: def.width, dmg };
          p.castLock = 0.05;
          this.emit('cast', { slot, fx: 'aim', x: p.x, z: p.z, dir: a, range, channel: def.channel });
        } else {
          this.fireDeadeye(a, range, def.width, dmg, slot);
          p.castLock = 0.32;
        }
        break;
      }
      case 'focus': {
        // Steady Breath (Sharpshooter): the next ability hits harder and always crits.
        p.empowerT = def.time;
        p.empowerMult = def.mult + (m.wEmpower || 0);
        p.empowerCrit = true;
        p.swingCount = Math.ceil((p.swingCount + 1) / m.critEvery) * m.critEvery - 1; // the next basic is Steady Aim's
        if (m.focusRcd > 0 && p.cd.r > 0) p.cd.r = Math.max(0, p.cd.r - m.focusRcd); // One Shot
        p.castLock = 0.1;
        this.emit('cast', { slot, fx: 'focus', x: p.x, z: p.z });
        this.emit('buff', { name: 'Steady Breath', x: p.x, z: p.z });
        break;
      }
      case 'ricochet': {
        // Ricochet (Sharpshooter): an arrow glancing from enemy to enemy, each within range of the last.
        const first = target;
        const chain = [first];
        const most = 1 + (def.bounces || 5) + (m.qBounces || 0);
        while (chain.length < most) {
          const last = chain[chain.length - 1];
          let best = null, bd = range;
          for (const e of this.enemies) {
            if (e.dead || e.state === 'spawn' || chain.includes(e)) continue;
            const de = dist(e.x, e.z, last.x, last.z) - e.radius;
            if (de < bd) { bd = de; best = e; }
          }
          if (!best) break;
          chain.push(best);
        }
        p.facing = dAtan2(first.z - p.z, first.x - p.x);
        p.castLock = 0.14;
        let t = 0, fx = p.x, fz = p.z;
        const pts = [[p.x, p.z]];
        for (const e of chain) {
          t += dist(fx, fz, e.x, e.z) / def.speed;
          fx = e.x;
          fz = e.z;
          pts.push([e.x, e.z]);
          const far = m.qFar > 0 && dist(p.x, p.z, e.x, e.z) > 10 ? 1 + m.qFar : 1; // Bullseye Loop
          this.delayed.push({ t, kind: 'ricochet', id: e.id, dmg: dmg * far, crit: empCrit || m.qCrit, sunder: m.qSunder || 0 });
        }
        this.emit('cast', { slot, fx: 'ricochet', x: p.x, z: p.z, pts, speed: def.speed });
        break;
      }
      case 'frenzy': {
        // Crimson Oath (Berserker): pay in blood, then you cannot fall for a while.
        const floor = p.stats.maxHp * def.hpTo;
        if (p.hp > floor) {
          const cost = p.hp - floor;
          p.hp = floor;
          this.emit('bloodCost', { x: p.x, z: p.z, amount: Math.round(cost) });
        }
        if (m.bloodRage && !p.bloodied) {
          p.bloodied = true; // Bloodied from this moment, so the roar's lifesteal already stops below half
          this.recalcStats();
          this.emit('bloodied', { on: true, x: p.x, z: p.z });
        }
        p.frenzyT = def.duration + (m.rDuration || 0);
        p.castLock = 0.15;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(e.x, e.z, p.x, p.z) <= radius + e.radius) this.hitEnemy(e, dmg, { source: slot });
        }
        this.emit('cast', { slot, fx: 'frenzy', x: p.x, z: p.z, radius });
        this.emit('buff', { name: 'Crimson Oath', x: p.x, z: p.z });
        break;
      }
      case 'bastion': {
        // Hold the Line (Bulwark): drag everything in, make it fight you, and shield everyone close.
        p.castLock = 0.18;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          const de = dist(e.x, e.z, p.x, p.z);
          if (de > radius + e.radius) continue;
          this.hitEnemy(e, dmg, { source: slot });
          if (e.dead) continue;
          e.tauntPid = this.cur.pid;
          e.tauntT = def.taunt;
          e.tauntVuln = m.tauntVuln || 0;
          if (!e.def.boss) {
            const gap = Math.max(0, de - (e.radius + p.radius + 0.4));
            const de1 = Math.max(de, 0.01);
            e.kx = ((p.x - e.x) / de1) * gap * 9;
            e.kz = ((p.z - e.z) / de1) * gap * 9;
            if (!e.def.heavy) this.stun(e, def.stun);
          } else this.addPosture(e, 1, false);
        }
        p.bastionT = def.duration + (m.rDuration || 0);
        this.emit('cast', { slot, fx: 'bastion', x: p.x, z: p.z, radius });
        this.emit('buff', { name: 'Hold the Line', x: p.x, z: p.z });
        break;
      }
      case 'meteor': {
        const c = aimPoint();
        const delay = def.delay * (m[slot + 'Delay'] || 1);
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius, t: 0, dur: delay, parryable: false };
        this.telegraphs.push(tele);
        this.delayed.push({ t: delay, kind: 'quake', x: c.x, z: c.z, radius, dmg, tele, stun: def.stun || 0, slot, fx: def.burnZone ? 'cinderfall' : 'skyfall', burnZone: def.burnZone || null });
        p.facing = a;
        p.castLock = 0.2;
        this.emit('cast', { slot, fx: 'meteor', x: c.x, z: c.z, radius });
        break;
      }
    }
    if (m.stormcaller && this.cls === 'mage') {
      // Wishfall: every third ability calls down a shard of the star on the cursor.
      p.spellCount = (p.spellCount || 0) + 1;
      if (p.spellCount % 3 === 0) {
        const len = Math.min(d, 13);
        const c = this.clampToArena(p.x + cos * len, p.z + sin * len, 0.5);
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius: 3, t: 0, dur: 0.45, parryable: false };
        this.telegraphs.push(tele);
        this.delayed.push({ t: 0.45, kind: 'quake', x: c.x, z: c.z, radius: 3, dmg: p.stats.ad * 1.6, tele, slot: 'wish', fx: 'starfall' });
      }
    }
  }

  /** Areas that keep hurting for a while (Arrow Storm). */
  /**
   * A damage zone begins (Arrow Storm, Pyromancer fire...). (0.51) Arrow Storm opens with Skyfall: the
   * first arrows land together, a heavy volley worth `opening` of the whole storm, pinning everything
   * inside (90% slower for `pin` seconds), before the rain.
   */
  startZone(z) {
    const p = this.player;
    z.tele.t = 0;
    z.tele.dur = z.lasts;
    if (!this.telegraphs.includes(z.tele)) this.telegraphs.push(z.tele);
    this.zones.push({ x: z.x, z: z.z, radius: z.radius, left: z.lasts, dur: z.lasts, next: z.opening ? z.tick : 0, tick: z.tick, dmg: z.dmg, slow: z.slow, slowDur: z.slowDur, slot: z.slot, tele: z.tele });
    if (z.opening) {
      this.emit('zoneLoose', { x: p.x, z: p.z, tx: z.x, tz: z.z, radius: z.radius });
      for (const e of this.enemies) {
        if (e.dead || e.state === 'spawn' || dist(e.x, e.z, z.x, z.z) > z.radius + e.radius) continue;
        if (z.pin) {
          e.slowT = Math.max(e.slowT || 0, z.pin);
          e.slow = Math.max(e.slow || 0, 0.9);
        }
        this.hitEnemy(e, z.total * z.opening, { source: z.slot, heavy: true });
      }
    }
  }

  /**
   * Deadeye (0.51): one shot along a line that pierces up to 3 times. Each enemy after the first takes less
   * and something more: the 2nd is Marked (takes 20% more for 5 s), the 3rd Pinned (stunned 1.5 s), and the
   * 4th Splinters, the arrow bursting into shards that hit everything near it.
   */
  fireDeadeye(a, range, width, dmg, slot) {
    const p = this.player;
    const cos = dCos(a), sin = dSin(a);
    const hits = [];
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const rx = e.x - p.x, rz = e.z - p.z;
      const along = rx * cos + rz * sin;
      if (along < -e.radius || along > range + e.radius) continue;
      if (Math.abs(rz * cos - rx * sin) > width / 2 + e.radius) continue;
      hits.push({ e, along });
    }
    hits.sort((x, y) => x.along - y.along);
    const P = DEADEYE_PIERCE;
    const struck = hits.slice(0, P.mult.length);
    struck.forEach(({ e }, i) => {
      if (e.dead) return;
      this.hitEnemy(e, dmg * P.mult[i], { source: slot, forceCrit: true, heavy: true });
      if (e.dead) return;
      if (i === 1) {
        e.vulnT = Math.max(e.vulnT || 0, P.markTime);
        e.vuln = Math.max(e.vuln || 0, P.mark);
      } else if (i === 2) this.stun(e, e.def.boss ? P.pin * 0.4 : P.pin);
      else if (i === 3) {
        for (const o of this.enemies) if (o !== e && !o.dead && o.state !== 'spawn' && dist(o.x, o.z, e.x, e.z) <= P.splinterR + o.radius) this.hitEnemy(o, dmg * P.splinter, { source: slot });
        this.emit('burst', { x: e.x, z: e.z, radius: P.splinterR, color: 0xfff0b0 });
      }
    });
    const last = struck.length ? struck[struck.length - 1] : null;
    this.emit('cast', { slot, fx: 'deadeye', x: p.x, z: p.z, dir: a, range: last ? Math.max(1, last.along) : range, width, last: true, hit: !!last, tx: last ? last.e.x : null, tz: last ? last.e.z : null, pierced: Math.max(0, struck.length - 1), noMove: true });
  }

  stepZones(dt) {
    if (!this.zones.length) return;
    for (const zn of this.zones) {
      zn.left -= dt;
      zn.next -= dt;
      zn.tele.t = zn.dur - zn.left;
      if (zn.next <= 0) {
        zn.next += zn.tick;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(e.x, e.z, zn.x, zn.z) > zn.radius + e.radius) continue;
          if (zn.slow) {
            e.slowT = zn.slowDur;
            e.slow = zn.slow;
          }
          if (zn.burn) this.addBurn(e, zn.burn);
          if (zn.dmg > 0) this.hitEnemy(e, zn.dmg, { source: zn.slot });
        }
        this.emit(zn.fire ? 'emberTick' : 'zoneTick', { x: zn.x, z: zn.z, radius: zn.radius });
      }
      if (zn.left <= 0) {
        zn.done = true;
        this.telegraphs = this.telegraphs.filter((t) => t !== zn.tele);
      }
    }
    this.zones = this.zones.filter((zn) => !zn.done);
  }

  /** Things that happen a moment after a cast (Twin Cleave, Aftershock). */
  stepDelayed(dt) {
    if (!this.delayed.length) return;
    const p = this.player;
    for (const d of this.delayed) {
      d.t -= dt;
      if (d.tele) d.tele.t = d.tele.dur - d.t;
      if (d.t > 0) continue;
      d.done = true;
      if (d.kind === 'ricochet') {
        const e = this.enemyById(d.id);
        if (e && !e.dead) {
          if (d.sunder > 0) { e.vulnT = 4; e.vuln = Math.max(e.vuln || 0, d.sunder); } // Marked Prey
          this.hitEnemy(e, d.dmg, { source: 'q', forceCrit: d.crit });
          if (e.dead && this.mods.qResetOnKill) p.cd.q = 0;
        }
      } else if (d.kind === 'cleave') {
        this.cleaveHit(d.dir, d.range, d.angle, d.dmg);
        this.emit('cast', { slot: 'q', echo: true, x: p.x, z: p.z, dir: d.dir, range: d.range, angle: d.angle });
      } else if (d.kind === 'quake') {
        this.telegraphs = this.telegraphs.filter((t) => t !== d.tele);
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(e.x, e.z, d.x, d.z) > d.radius + e.radius) continue;
          this.hitEnemy(e, d.dmg, { source: d.slot || 'r' });
          if (d.stun && !e.dead) {
            if (e.def.boss) this.addPosture(e, 1, false);
            else this.stun(e, d.stun);
          }
        }
        this.emit('impact', { x: d.x, z: d.z, radius: d.radius, kind: d.fx || 'aftershock' });
        if (d.burnZone) {
          // Cinderfall: the ground stays on fire, adding burn stacks to whatever stands in it.
          const bz = d.burnZone;
          const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: d.x, z: d.z, dir: 0, radius: d.radius, t: 0, dur: bz.time, parryable: false };
          this.telegraphs.push(tele);
          this.zones.push({ x: d.x, z: d.z, radius: d.radius, left: bz.time, dur: bz.time, next: 0, tick: bz.tick, dmg: 0, burn: bz.stacks, slow: 0, slowDur: 0, slot: 'r', tele, fire: true });
        }
        if ((d.fx === 'skyfall' || d.fx === 'cinderfall') && !d.echo && this.mods.rAftershock > 0) {
          // Second Impact: the Mage's Meteor erupts again a second later.
          const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: d.x, z: d.z, dir: 0, radius: d.radius, t: 0, dur: 1, parryable: false };
          this.telegraphs.push(tele);
          this.delayed.push({ t: 1, kind: 'quake', x: d.x, z: d.z, radius: d.radius, dmg: d.dmg * this.mods.rAftershock, tele, slot: d.slot, echo: true });
        }
      }
    }
    this.delayed = this.delayed.filter((d) => !d.done);
  }

  /** Perfect parry: enemies and their projectiles slow down for a moment. */
  startSlow() {
    const m = this.mods;
    this.slowT = CONFIG.PERFECT_SLOW * m.slowDur * (m.timekeeper ? 1.6 : 1);
    this.emit('slowStart', { duration: this.slowT });
  }

  triggerSlipstream() {
    if (!this.mods.slipstream) return;
    this.player.slipT = 4;
    this.recalcStats();
    this.emit('slipstream');
  }

  lightning(target) {
    const p = this.player;
    const x = target.x;
    const z = target.z;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (dist(e.x, e.z, x, z) <= 3 + e.radius) this.hitEnemy(e, p.stats.ad * 1.5, { source: 'storm', canCrit: false });
    }
    this.emit('lightning', { x, z });
  }

  clampToArena(x, z, radius) {
    const r = dHypot(x, z);
    const max = this.radius - radius;
    if (r > max) {
      x *= max / r;
      z *= max / r;
    }
    return { x, z };
  }

  stepPlayer(dt) {
    const p = this.player;
    p.px = p.x;
    p.pz = p.z;
    if (p.dead) return;
    p.moving = false;

    // Slipstream on a Rogue or Mage: cooldowns run 60% faster while it lasts.
    const cdRate = p.slipT > 0 && this.mods.slipstream && CASTER_CLASSES.has(this.cls) ? 1.6 : 1;
    for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt * cdRate);
    if (p.fangT > 0) p.fangT -= dt;
    p.idleT = (p.idleT || 0) + dt; // reset by any input (applyCommands)
    // Lifesteal budget (0.32): it fills at LIFESTEAL_RATE of max health a second, holding one second's worth.
    p.lsPool = Math.min(p.stats.maxHp * CONFIG.LIFESTEAL_RATE, (p.lsPool || 0) + p.stats.maxHp * CONFIG.LIFESTEAL_RATE * dt);
    if (p.unwishedT > 0) p.unwishedT -= dt;
    if (p.nightcutT > 0) p.nightcutT -= dt;
    if (p.surgeT > 0 && (p.surgeT -= dt) <= 0) p.surgeN = 0;
    if (this.mods.farDmg > 0) p.farClear = !this.enemies.some((o) => !o.dead && o.state !== 'spawn' && dist(o.x, o.z, p.x, p.z) <= 6 + o.radius); // Rangekeeper's Coat
    if (this.mods.burnRage > 0) {
      // Ashen Robe: burning enemies close by (counted once a tick, not once a hit)
      let n = 0;
      for (const o of this.enemies) if (!o.dead && o.burnT > 0 && o.burnStacks > 0 && dist(o.x, o.z, p.x, p.z) <= 8 + o.radius) n++;
      p.ashN = n;
    }
    if (this.mods.sporeheart) {
      // Sporeheart (0.61.5): every 4 seconds the spores burst, hurting and weakening everything close by.
      p.sporeT = (p.sporeT || 0) - dt;
      if (p.sporeT <= 0) {
        p.sporeT = 4;
        const near = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= 6 + e.radius);
        if (near.length) {
          const dmg = 1.2 * Math.max(p.stats.ad || 0, p.stats.sp || 0);
          for (const e of near) {
            this.hitEnemy(e, dmg, { source: 'spore' });
            if (!e.dead) {
              e.vulnT = Math.max(e.vulnT || 0, 4);
              e.vuln = Math.max(e.vuln || 0, 0.1);
            }
          }
          this.emit('sporeHeal', { x: p.x, z: p.z, n: near.length, burst: true });
        }
      }
    }
    const cps = CLASSES[this.cls].passive;
    if (cps && cps.ward) {
      // Arcane Ward: back to full a few seconds after the last hit.
      const max = p.stats.maxHp * cps.ward;
      if (p.wardT > 0) p.wardT -= dt;
      else if (p.ward < max) {
        p.ward = Math.min(max, p.ward + (max * dt) / CONFIG.WARD_REFILL);
        if (p.ward >= max) this.emit('wardUp', { x: p.x, z: p.z });
      }
      if (p.ward > max) p.ward = max;
    }
    if (p.spin) {
      // Whirlwind (Berserker): a beat every half second while you move.
      const sp = p.spin;
      sp.next -= dt;
      if (sp.next <= 0) {
        const def = this.kit[sp.slot];
        const spinR = sp.radius * (sp.slot === 'w' ? CONFIG.CRESCENT.grow[this.bloodReach()] : 1); // (0.60.2) Crimson Reach, beat by beat
        const hits = this.novaHit(sp.slot, def, sp.dmg, spinR, sp.first, sp.first);
        this.battleRhythm(sp.slot, hits * sp.tick); // every beat gives Battle Rhythm for its share of the spin (four beats: half each)
        this.emit('spinTick', { x: p.x, z: p.z, radius: spinR, first: sp.first });
        sp.first = false;
        sp.left--;
        sp.next += sp.tick;
        if (sp.left <= 0) p.spin = null;
      }
    }
    if (p.undyingUsed && p.undyingT > 0) {
      // Crown of the Undying recharges 2 minutes after it saves you.
      p.undyingT -= dt;
      if (p.undyingT <= 0) p.undyingUsed = false;
    }
    if (p.channel) {
      // (0.51) an archer's ultimate, drawn: it leaves the string when the channel ends
      const ch = p.channel;
      ch.t -= dt;
      if (p.dead) {
        if (ch.tele) this.telegraphs = this.telegraphs.filter((t) => t !== ch.tele);
        p.channel = null;
      } else if (ch.t <= 0) {
        p.channel = null;
        if (ch.kind === 'zone') this.startZone(ch.zone);
        else if (ch.kind === 'deadeye') this.fireDeadeye(ch.a, ch.range, ch.width, ch.dmg, ch.slot);
      } else p.facing = ch.kind === 'zone' ? dAtan2(ch.zone.z - p.z, ch.zone.x - p.x) : ch.a;
    }
    if (p.sealT > 0) p.sealT = Math.max(0, p.sealT - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.parryCd = Math.max(0, p.parryCd - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);
    p.castLock = Math.max(0, p.castLock - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.empowerT = Math.max(0, p.empowerT - dt);
    if (p.quickT > 0) {
      p.quickT -= dt;
      if (p.quickT <= 0) p.quickShots = 0;
    }
    p.veilT = Math.max(0, p.veilT - dt);
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * dt);
    // Berserker: Bloodied while below half health (attack speed needs a stat rebuild when it flips).
    const bloodied = !!this.mods.bloodRage && p.hp < p.stats.maxHp * 0.5;
    if (bloodied !== !!p.bloodied) {
      p.bloodied = bloodied;
      this.recalcStats();
      this.emit('bloodied', { on: bloodied, x: p.x, z: p.z });
    }
    if (p.edricT > 0) p.edricT -= dt;
    if (p.slipT > 0) {
      p.slipT -= dt;
      if (p.slipT <= 0) {
        p.slipT = 0;
        this.recalcStats();
      }
    }
    if (p.rushT > 0) {
      p.rushT -= dt;
      if (p.rushT <= 0) {
        p.rushT = 0;
        this.recalcStats();
      }
    }
    if (p.hurricaneT > 0) {
      p.hurricaneT -= dt;
      if (p.hurricaneT <= 0) {
        p.hurricaneT = 0;
        this.recalcStats();
        this.emit('buffEnd', { name: 'Hurricane' });
      }
    }

    if (p.frenzyT > 0) p.frenzyT -= dt;
    if (p.bastionT > 0) p.bastionT -= dt;
    if (p.bloodSaveT > 0) p.bloodSaveT -= dt;
    if (p.chillT > 0) p.chillT -= dt;
    if (this.delve && this.map.id === 'delve' && this.cur === this.heroes[0]) this.stepDelve(dt);
    if (this.map && this.map.id === 'keep' && !this.edricHere && this.mode === 'explore' && (this.cur === this.heroes[0] || this.travelHook) && this.questState('edric') === 'active') this.spawnEdric(); // (0.58.1) on the server: anyone who has the quest
    if (this.rift && this.map.id === 'rift' && (this.rift.state === 'run' || this.rift.state === 'guardian') && this.cur === this.heroes[0]) {
      // The rift's clock (counted once, on the party leader's step).
      this.rift.timeLeft -= dt;
      if (this.rift.timeLeft <= 0) {
        this.rift.timeLeft = 0;
        this.rift.state = 'late';
        this.emit('riftLate', { tier: this.rift.tier });
      }
    }
    if (p.barrage) {
      // Barrage: the next arrow when its moment comes, at the same target if it still stands, else the nearest.
      const bg = p.barrage;
      bg.t -= dt;
      if (bg.t <= 0) {
        let t = this.enemyById(bg.id);
        if (!t || t.dead || dist(t.x, t.z, p.x, p.z) > bg.range) t = this.enemyNear(p.x, p.z, bg.range, bg.range);
        if (!t) p.barrage = null;
        else {
          bg.id = t.id;
          p.facing = dAtan2(t.z - p.z, t.x - p.x);
          this.basicAttack(t, bg.dmg);
          this.emit('swing', { dur: 0.08 });
          bg.left--;
          bg.t = bg.gap;
          if (bg.left <= 0) p.barrage = null;
        }
      }
    }

    // Parry window
    if (p.parryT > 0) {
      p.parryAge += dt;
      p.parryT -= dt;
      if (p.parryT <= 0) {
        p.parryT = 0;
        if (p.parryHit) p.parryCd = 0;
        else this.emit('parryWhiff');
      }
    }
    if (p.parryBuffer > 0) {
      p.parryBuffer -= dt;
      if (p.parryCd <= 0 && p.parryT <= 0) this.tryParry();
    }

    // Breakthrough (E)
    if (p.dash) {
      const ds = p.dash;
      ds.t += dt;
      const k = Math.min(1, ds.t / ds.dur);
      p.x = ds.sx + (ds.ex - ds.sx) * k;
      p.z = ds.sz + (ds.ez - ds.sz) * k;
      p.moving = true;
      for (const e of ds.width > 0 ? this.enemies : []) {
        if (e.dead || e.state === 'spawn' || ds.hit.has(e.id)) continue;
        if (dist(e.x, e.z, p.x, p.z) <= ds.width + e.radius) {
          ds.hit.add(e.id);
          this.hitEnemy(e, ds.dmg, { source: ds.slot });
        }
      }
      if (k >= 1) {
        p.dash = null;
        const over = this.overflowMult(ds.slot); // (0.50) haste past the 1 s floor makes the buff stronger
        if (ds.rush) {
          p.rushT = ds.rush.time + (this.mods.eRushTime || 0);
          p.rushAs = (ds.rush.as + (this.mods.eRush || 0)) * over;
          this.recalcStats();
          this.emit('rush', { time: p.rushT });
        }
        if (ds.motes) this.fireMotes(ds);
        if (ds.quick) {
          // Skirmish Step (Windrunner): the next shots leave the string at once.
          p.quickShots = ds.quick.shots;
          p.quickT = ds.quick.time;
          p.quickMult = 1 + (ds.quick.mult - 1) * over;
          p.attackCd = 0;
          p.atkWind = 0;
          p.autoAcquire = true;
        }
        if (ds.empower) {
          p.empowerT = ds.empower.time;
          p.empowerMult = 1 + (ds.empower.mult - 1 + (this.mods[ds.slot + 'Empower'] || 0)) * over;
        }
        if (ds.veil) {
          p.veilT = ds.veil + (this.mods.veilTime || 0);
          this.emit('veil', { x: p.x, z: p.z, time: p.veilT });
        }
        if (ds.faceId != null) {
          const t = this.enemyById(ds.faceId);
          if (t) {
            p.facing = dAtan2(t.z - p.z, t.x - p.x);
            p.targetId = t.id;
            this.emit('ambush', { x: p.x, z: p.z, id: t.id });
          }
        }
        if (ds.strike) {
          const t = this.enemyById(ds.strike.id);
          if (t) this.strike(t, ds.slot, ds.strike.dmg);
        }
      }
      return;
    }
    // Skyfall (R)
    if (p.leap) {
      const lp = p.leap;
      lp.t += dt;
      lp.tele.t = lp.t;
      const k = Math.min(1, lp.t / lp.dur);
      p.x = lp.sx + (lp.ex - lp.sx) * k;
      p.z = lp.sz + (lp.ez - lp.sz) * k;
      if (k >= 1) {
        const def = this.kit.r;
        this.telegraphs = this.telegraphs.filter((t) => t !== lp.tele);
        p.leap = null;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(e.x, e.z, p.x, p.z) > lp.radius + e.radius) continue;
          this.hitEnemy(e, lp.dmg, { source: 'r' });
          if (e.dead) continue;
          if (e.def.boss) this.addPosture(e, 1, false);
          else this.stun(e, lp.stun);
        }
        this.emit('impact', { x: p.x, z: p.z, radius: lp.radius, kind: 'skyfall' });
        if (this.mods.rAftershock > 0) {
          const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: p.x, z: p.z, dir: 0, radius: lp.radius, t: 0, dur: 1, parryable: false };
          this.telegraphs.push(tele);
          this.delayed.push({ t: 1, kind: 'quake', x: p.x, z: p.z, radius: lp.radius, dmg: lp.dmg * this.mods.rAftershock, tele });
        }
      }
      return;
    }
    if (p.castLock > 0) return;

    // Targeting
    let target = p.targetId != null ? this.enemyById(p.targetId) : null;
    if (p.targetId != null && !target) p.targetId = null;
    if (!target && p.attackMove) {
      // Attack-move: the first enemy that comes into reach on the way.
      const t = this.attackMoveTarget(p.attackMove, false);
      if (t) {
        target = t;
        p.targetId = t.id;
        p.moveTarget = null;
        p.attackMove = null;
        p.autoAcquire = true;
      }
    }
    // Auto-attack (can be switched off in the pause menu): an idle hero picks the nearest enemy.
    if (!target && !p.moveTarget && p.autoAcquire && p.autoAttack !== false && p.parryT <= 0) {
      let best = null;
      let bestD = Math.max(CONFIG.ACQUIRE_RANGE, this.basicRange());
      for (const e of this.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        const d = dist(e.x, e.z, p.x, p.z) - e.radius;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        target = best;
        p.targetId = best.id;
      }
    }

    const parrying = p.parryT > 0;
    const speed = p.stats.ms * (parrying && !this.mods.parryFree ? CONFIG.PARRY_MOVE_MULT : 1) * (p.chillT > 0 ? 0.65 : 1) * (p.channel ? 1 - p.channel.slow : 1); // Frostbound elites (Unyielding Greaves: parry at full speed)

    if (target) {
      const d = dist(target.x, target.z, p.x, p.z) - target.radius;
      const a = dAtan2(target.z - p.z, target.x - p.x);
      // A swing that has started finishes if the target only slipped a little out of reach (0.29),
      // so a running target cannot dance on the edge of your range and never be hit.
      const reach = p.atkWind > 0 ? this.basicRange() * 1.25 + 1 : this.basicRange();
      if (d > reach) {
        if (p.atkWind > 0) p.attackCd = 0; // and a swing that never landed costs nothing
        p.atkWind = 0;
        this.movePlayer(dCos(a), dSin(a), speed * dt);
        p.facing = turnToward(p.facing, a, 14 * dt);
      } else {
        p.facing = turnToward(p.facing, a, 14 * dt);
        if (!parrying && !p.channel) {
          if (p.atkWind > 0) {
            p.atkWind -= dt;
            if (p.atkWind <= 0) {
              p.atkWind = 0;
              this.basicAttack(target);
            }
          } else if (p.attackCd <= 0) {
            const period = 1 / p.stats.as;
            const quick = p.quickShots > 0; // Skirmish Step: straight off the string
            p.atkWind = quick ? 0.05 : period * 0.3;
            p.attackCd = quick ? 0.16 : period;
            this.emit('swing', { who: 'player', dir: a, x: p.x, z: p.z, dur: p.atkWind });
          }
        }
      }
    } else if (p.moveTarget) {
      const dx = p.moveTarget.x - p.x;
      const dz = p.moveTarget.z - p.z;
      const d = dHypot(dx, dz);
      const stepLen = speed * dt;
      if (d <= stepLen) {
        p.x = p.moveTarget.x;
        p.z = p.moveTarget.z;
        p.moveTarget = null;
        p.attackMove = null;
        p.autoAcquire = true;
      } else {
        p.facing = turnToward(p.facing, dAtan2(dz, dx), 14 * dt);
        this.movePlayer(dx / d, dz / d, stepLen);
      }
    }
  }

  /**
   * The enemy an attack-move goes for: in reach of the hero, nearest the hero or nearest the
   * clicked spot. On the click itself, an enemy right under the cursor counts even if it is further.
   */
  attackMoveTarget(am, click) {
    const p = this.player;
    const reach = Math.max(CONFIG.ACQUIRE_RANGE, this.basicRange()) + 1;
    let best = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const dh = dist(e.x, e.z, p.x, p.z) - e.radius;
      const dc = dist(e.x, e.z, am.x, am.z) - e.radius;
      if (dh > reach && !(click && am.near === 'cursor' && dc < 1.5)) continue;
      const score = am.near === 'cursor' ? dc : dh;
      if (score < bd) {
        bd = score;
        best = e;
      }
    }
    return best;
  }

  movePlayer(dx, dz, len) {
    const p = this.player;
    const c = this.clampToArena(p.x + dx * len, p.z + dz * len, p.radius);
    p.x = c.x;
    p.z = c.z;
    p.moving = true;
  }

  /**
   * Something is trying to damage the player.
   * @returns {'parried'|'dodged'|'hit'|'none'}
   */
  /** Damage multipliers from the level gap between an enemy and the hero (see CONFIG). */
  gapScale(level) {
    const C = CONFIG;
    const gap = (level || this.player.level) - this.player.level;
    if (gap >= 0) return { taken: 1 + Math.min(C.GAP_DMG_TAKEN_UP_MAX, C.GAP_DMG_TAKEN_UP * gap + C.GAP_DMG_TAKEN_UP2 * gap * gap), dealt: Math.max(C.GAP_DMG_DEALT_UP_MIN, 1 - C.GAP_DMG_DEALT_UP * gap) };
    return { taken: Math.max(C.GAP_DMG_TAKEN_DOWN_MIN, 1 + C.GAP_DMG_TAKEN_DOWN * gap), dealt: Math.min(C.GAP_DMG_DEALT_DOWN_MAX, 1 - C.GAP_DMG_DEALT_DOWN * gap) };
  }

  /** Crit damage multiplier, including crit chance over 100% turned into crit damage. */
  critMultiplier(bonus = 0) {
    return CONFIG.CRIT_MULT + this.mods.critMult + Math.max(0, this.player.stats.crit + bonus - 100) * CONFIG.CRIT_OVERFLOW;
  }

  hitPlayer(rawDamage, { parryable = true, src = null, proj = null, doom = 0, held = false, noParry = false } = {}) {
    const p = this.player;
    const m = this.mods;
    if (p.dead) return 'none';
    if (!held && !doom && parryable && this.party && this.cur !== this.heroes[0] && this.cur.lag > 0.02 && !(p.parryT > 0) && !p.dash && !p.leap) {
      // A friend sees this hit late and their parry arrives late (0.41.1): hold it for as long as
      // their lag, so a parry they pressed in time on their own screen still counts.
      const h = this.cur;
      (h.lateHits = h.lateHits || []).push({ tick: this.ticks, due: this.time + Math.min(LAG_CAP, h.lag), dmg: rawDamage, opts: { parryable, src, proj: proj ? { level: proj.level, srcId: proj.srcId } : null } });
      if (proj) proj.dead = true;
      return 'held';
    }
    if (doom > 0) {
      // Doom (0.28): a share of your max health that nothing reduces. Only dodging helps.
      if (p.dash || p.leap) {
        this.emit('dodge', { x: p.x, z: p.z });
        return 'dodged';
      }
      return this.takeDamage(Math.round(p.stats.maxHp * doom), src, true);
    }
    if (this.party && !(p.parryT > 0) && !p.dash && !p.leap) {
      // Shield Wall: a parrying Bulwark standing close catches the hit instead (red ones too, with Iron Answer).
      const g = this.heroes.find((h) => h !== this.cur && h.mods.guardRange > 0 && (parryable || h.mods.blockRed) && !h.player.dead && h.player.parryT > 0 && dist(h.player.x, h.player.z, p.x, p.z) <= h.mods.guardRange);
      if (g) return this.as(g, () => this.hitPlayer(rawDamage, { parryable, src, proj, held: true }));
    }
    rawDamage *= CONFIG.ENEMY_DMG * this.gapScale(src ? src.level : proj ? proj.level : 0).taken;
    const from = src || (proj && proj.srcId != null ? this.enemyById(proj.srcId) : null);
    if (from && from.ember > 0) rawDamage *= emberScale(this.ember(p), from.ember).taken; // Ember (0.54)
    if (this.twist === 'glass') rawDamage *= 1.5; // (0.60) Glass Cannon
    else if (this.twist === 'haste') rawDamage *= 1.3; // (0.60) Haste
    // Hold the Line (Bulwark): you and friends near a Bulwark holding the line take less.
    const holder = this.heroes.find((h) => h.player.bastionT > 0 && !h.player.dead && dist(h.player.x, h.player.z, p.x, p.z) <= 8);
    if (holder) rawDamage *= 1 - Math.min(0.75, holder.kit.r.dr || 0.35);
    // Subclass Immortals that make you harder to hurt in the right moment (0.32).
    if (p.bloodied && m.bloodGuard > 0) rawDamage *= 1 - m.bloodGuard; // Blood Rage
    const chiller = src || (proj && proj.srcId != null ? this.enemyById(proj.srcId) : null);
    if (chiller && chiller.chillWeak > 0 && (chiller.slowT > 0 || chiller.state === 'stunned')) rawDamage *= 1 - chiller.chillWeak; // Deep Winter
    if (p.dash || p.leap) {
      if (p.dash && !p.dash.refunded) {
        // Perfect dodge: Breakthrough carried you through an attack, so most of its cooldown comes back.
        p.dash.refunded = true;
        p.cd[p.dash.slot] = Math.min(p.cd[p.dash.slot], CONFIG.DODGE_REFUND_CD);
        this.stats.dodges++;
        if (m.galeHurricane > 0 && p.dash.slot === 'e') {
          // Galeborn: rolling through an attack whips up a short Hurricane.
          p.hurricaneT = Math.max(p.hurricaneT || 0, m.galeHurricane);
          p.hurricaneAs = Math.max(p.hurricaneAs || 0, (this.kit.r && this.kit.r.as) || 0.4);
          this.recalcStats();
          this.emit('galeburst', { x: p.x, z: p.z });
        }
        this.emit('perfectDodge', { x: p.x, z: p.z });
        this.triggerSlipstream();
      } else {
        this.emit('dodge', { x: p.x, z: p.z });
      }
      return 'dodged';
    }
    if (p.parryT > 0 && !noParry) {
      if (parryable) {
        const perfect = p.parryAge <= this.parry.perfect;
        p.parryHit = true;
        p.parryT = Math.max(p.parryT, 0.15); // also catches the rest of a multi-hit
        this.stats.parries++;
        if (perfect) {
          this.stats.perfects++;
          if (this.twist === 'riposte') this.healPlayer(p.stats.maxHp * 0.1, true); // (0.60) Riposte
          if (m.edric) {
            // Edric's Sword (0.47): blue trim; the parried enemy is struck back, and you hit harder for a while
            p.edricStacks = Math.min(3, (p.edricT > 0 ? p.edricStacks || 0 : 0) + 1);
            p.edricT = 8;
            const who = src && !src.dead ? src : proj && proj.srcId != null ? this.enemyById(proj.srcId) : null;
            if (who && !who.dead) this.hitEnemy(who, p.stats.ad * 1.5, { source: 'oath', canCrit: true });
          }
          this.healPlayer(p.stats.maxHp * (CONFIG.PERFECT_HEAL + m.parryHeal), true);
          if (m.allyParryHeal > 0 && this.party) {
            // Bastion: a perfect parry also heals friends nearby.
            for (const h of this.heroes) {
              if (h === this.cur || h.player.dead || dist(h.player.x, h.player.z, p.x, p.z) > 8) continue;
              this.as(h, (hp) => this.healPlayer(hp.stats.maxHp * m.allyParryHeal, true));
            }
          }
          for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - CONFIG.PERFECT_CD_REFUND);
          if (m.oathsignet) {
            // Oathbreaker's Signet: a spectral blade on everything close.
            for (const o of this.enemies) {
              if (o.dead || o.state === 'spawn' || dist(o.x, o.z, p.x, p.z) > 6 + o.radius) continue;
              this.hitEnemy(o, p.stats.ad * 2.5, { source: 'oath', canCrit: false });
            }
            this.emit('oathBlade', { x: p.x, z: p.z, radius: 6 });
          }
          this.startSlow();
          this.triggerSlipstream();
        }
        this.emit('parry', { perfect, x: p.x, z: p.z, srcId: src ? src.id : null, projectile: !!proj });
        this.addReckoning(1);
        if (m.parryCdrW > 0) p.cd.w = Math.max(0, p.cd.w - m.parryCdrW); // Unyielding Greaves
        if (proj) {
          // Send the projectile back where it came from (it now belongs to whoever parried it).
          proj.pid = this.cur.pid;
          proj.owner = 'player';
          proj.reflected = true;
          let a = dAtan2(-proj.vz, -proj.vx);
          if (src && !src.dead) a = dAtan2(src.z - proj.z, src.x - proj.x);
          const sp = dHypot(proj.vx, proj.vz) * 1.7;
          proj.vx = dCos(a) * sp;
          proj.vz = dSin(a) * sp;
          proj.dmg = (proj.dmg * 2.5 + p.stats.ad) * m.reflectDmg;
          proj.life = 3;
        } else if (src && !src.dead) {
          if (src.elite && src.elite.includes('reflective') && !(src.mirrorT > 0)) this.shatterMirror(src); // (0.42)
          if (src.shield > 0) {
            // Shielded elites: a parried attack shatters the shield at once.
            src.shield = 0;
            this.emit('shieldBreak', { id: src.id, x: src.x, z: src.z });
          }
          this.addPosture(src, perfect ? 2 : 1, perfect);
          if (m.riposte > 0 && !src.dead) this.hitEnemy(src, p.stats.ad * m.riposte, { source: 'riposte', canCrit: false });
        }
        if (m.retribution && this.basic.range > 5) {
          // Archer and Mage: a bolt of starlight at the nearest enemy instead of a shockwave they would never be close enough to use.
          let best = null, bd = 12;
          for (const e of this.enemies) {
            if (e.dead || e.state === 'spawn') continue;
            const de = dist(e.x, e.z, p.x, p.z) - e.radius;
            if (de < bd) { bd = de; best = e; }
          }
          if (best) {
            this.emit('starBolt', { x: p.x, z: p.z, tx: best.x, tz: best.z });
            this.hitEnemy(best, p.stats.ad * (perfect ? 2.5 : 1.5), { source: 'retribution', canCrit: false });
          }
        } else if (m.retribution) {
          const radius = 4.5;
          for (const e of this.enemies) {
            if (e.dead || e.state === 'spawn') continue;
            if (dist(e.x, e.z, p.x, p.z) <= radius + e.radius) this.hitEnemy(e, p.stats.ad * (perfect ? 2 : 1.2), { source: 'retribution', canCrit: false });
          }
          this.emit('impact', { x: p.x, z: p.z, radius, kind: 'retribution' });
        }
        return 'parried';
      }
      if (m.blockRed) {
        // Iron Answer (Bulwark): the shield takes the red attack, and whoever threw it is Broken.
        p.parryHit = true;
        p.parryT = Math.max(p.parryT, 0.15);
        this.stats.parries++;
        const who = src && !src.dead ? src : proj && proj.srcId != null ? this.enemyById(proj.srcId) : null;
        if (proj) proj.dead = true;
        if (who) {
          if (who.def.boss) this.addPosture(who, 2, true);
          else this.stun(who, 1.5);
          who.vulnT = Math.max(who.vulnT, 4);
          who.vuln = Math.max(who.vuln || 0, 0.2 + (m.brokenVuln || 0)); // (Crown of the Iron Answer: 35%)
        }
        this.emit('ironAnswer', { x: p.x, z: p.z, srcId: who ? who.id : null });
        this.addReckoning(1 + (m.blockReckon || 0));
        if (m.parryCdrW > 0) p.cd.w = Math.max(0, p.cd.w - m.parryCdrW);
        return 'parried';
      }
      this.emit('unparryable', { x: p.x, z: p.z });
    }
    return this.takeDamage(Math.max(1, Math.round(rawDamage * (100 / (100 + p.stats.armor)) * (1 - m.dmgTaken))), src, false);
  }

  /** A Reflective elite's mirror breaks (0.42): for 6 seconds it reflects nothing and takes 20% more. */
  shatterMirror(e) {
    e.mirrorT = 6;
    e.mirrorCracks = 0;
    this.emit('mirrorBreak', { id: e.id, x: e.x, z: e.z });
  }

  /** Reckoning (Bulwark): stacks for the next Whirlwind. */
  addReckoning(n) {
    if (!this.mods.reckoning) return;
    const p = this.player;
    const was = p.reck;
    p.reck = Math.min((this.mods.reckonMax || CONFIG.RECKON_MAX) + (this.mods.reckonMaxAdd || 0), p.reck + n);
    if (p.reck > was) this.emit('reckonStack', { stacks: p.reck });
  }

  /** Damage that got through: the Arcane Ward first, then health (and what follows from that). */
  takeDamage(dmg, src, doom) {
    const p = this.player;
    const m = this.mods;
    const cps = CLASSES[this.cls].passive;
    let warded = 0;
    if (cps && cps.ward) {
      p.wardT = CONFIG.WARD_DELAY;
      if (p.ward > 0) {
        warded = Math.min(p.ward, dmg);
        p.ward -= warded;
        dmg -= warded;
        if (p.ward <= 0) this.emit('wardBreak', { x: p.x, z: p.z });
      }
    }
    if (m.reckoning && dmg > 0) {
      p.reckAcc += dmg;
      const step = p.stats.maxHp * (m.reckonHp || CONFIG.RECKON_HP); // (Warden's Seal: every 5%)
      while (p.reckAcc >= step) {
        p.reckAcc -= step;
        this.addReckoning(1);
      }
    }
    p.hp -= dmg;
    if (this.mode === 'arena' && dmg + warded > 0) this.wave.hurt = true; // no Flawless bonus this floor
    if (src && src.elite && !src.dead) {
      if (src.elite.includes('vampiric')) src.hp = Math.min(src.maxHp, src.hp + src.maxHp * 0.04);
      if (src.elite.includes('frostbound')) p.chillT = 2;
    }
    p.hurtT = 0.25;
    this.emit('damage', { who: 'player', x: p.x, z: p.z, amount: dmg, warded, doom });
    if (p.hp <= 0 && p.spin && m.spinGuard) p.hp = 1; // Bloodbound: not while you spin
    if (p.hp <= 0 && m.bloodSave > 0 && p.hp + dmg < p.stats.maxHp * 0.5 && !(p.bloodSaveT > 0)) {
      // Blood Rage: a Bloodied Berserker shrugs off one killing blow every 30 seconds.
      p.hp = 1;
      p.bloodSaveT = m.bloodSave;
      this.emit('lastBreath', { x: p.x, z: p.z });
      if (m.lastBreathOath > 0) p.frenzyT = Math.max(p.frenzyT || 0, m.lastBreathOath); // Crown of the Last Breath
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.parryT = 0;
      p.spin = null;
      if (this.mode === 'explore') {
        // Out in the wilds you are only knocked out: you wake up in town (in a party, at the map's entrance).
        this.respawnT = CONFIG.EXPLORE_RESPAWN_DELAY * (this.party ? 2 : 1);
        this.emit('playerDown', { x: p.x, z: p.z, foe: this.fellTo(p, src) });
        if (p.streak > 0) {
          this.emit('streakLost', { n: p.streak });
          p.streak = 0;
        }
        return 'hit';
      }
      this.gameOver = true;
      this.telegraphs = [];
      this.delayed = [];
      this.falls = []; // the final boss's falling stars (stepFalls)
      if (this.mode === 'arena' && this.ring) this.ringPay(); // (0.59) what was safe at the last boss comes home
      this.emit('playerDeath', { wave: this.wave.n, foe: this.fellTo(p, src) });
    }
    return 'hit';
  }

  /**
   * The Casebook (0.56): which boss a fallen hero was fighting. The one that struck, whoever called up
   * what struck, or else the nearest boss still standing within reach of the fight. null if none.
   */
  fellTo(p, src) {
    let e = src && src.def ? src : null;
    if (e && !e.def.boss && e.summoner != null) e = this.enemyById(e.summoner) || e;
    if (e && e.def.boss) return e.type;
    let best = null;
    let bd = 30 * 30;
    for (const o of this.enemies) {
      if (o.dead || !o.def.boss) continue;
      const d = (o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best ? best.type : null;
  }

  // =========================================================================
  // Progression: EXP, loot, inventory
  // =========================================================================
  /** Bag slots: 24, and more with Deep Pockets (Rebirth, 0.43). */
  bagSize(p = this.player) {
    return CONFIG.BAG_SIZE + 4 * perkRank(p.rebirth, 'pockets');
  }

  /** EXP for the next Wishborne level, with Old Wishes (Rebirth, 0.43). */
  wishNeedNow(p = this.player) {
    return Math.round(wishNeed(p.wish) * (1 - 0.05 * perkRank(p.rebirth, 'wishes')));
  }

  gainExp(amount) {
    const p = this.player;
    if (this.trial) return; // the Weekly Echo fixes your level
    amount *= expMult(p.rebirth, p.acctRebirths); // Quick Study, and every rebirth on the account (0.43)
    if (p.level >= CONFIG.MAX_LEVEL) {
      // Wishborne: endless small levels past 100, each a Wish point.
      p.wishExp += Math.round(amount);
      while (p.wishExp >= this.wishNeedNow()) {
        p.wishExp -= this.wishNeedNow();
        p.wish++;
        p.wishPts++;
        this.emit('wishUp', { wish: p.wish, x: p.x, z: p.z });
      }
      return;
    }
    p.exp += Math.round(amount);
    while (p.level < CONFIG.MAX_LEVEL && p.exp >= expToNext(p.level)) {
      p.exp -= expToNext(p.level);
      p.level++;
      p.skillPoints++;
      this.recalcStats();
      this.healPlayer(p.stats.maxHp * 0.15, false);
      const unlocked = Object.keys(this.kit).filter((k) => this.kit[k].unlock === p.level);
      this.emit('levelUp', { level: p.level, unlocked, x: p.x, z: p.z });
    }
    if (p.level >= CONFIG.MAX_LEVEL) p.exp = 0;
  }

  dropLoot(e, fall = 1) {
    const def = e.def;
    const p = this.player;
    const hoard = this.mode === 'explore' && def.boss && !e.riftGuardian ? BOSS_LOOT[e.type] : null; // world bosses drop a pile
    // World tiers drop more, and nothing below their rarity floor; elites always drop a good extra piece.
    const T = this.mode === 'explore' && this.map.id !== 'rift' ? TIERS[this.worldTier()] : TIERS[1];
    const riftFloor = this.mode === 'explore' && this.map.id === 'rift' && this.rift ? Math.min(3, Math.floor(this.rift.tier / 5)) : 0;
    const floor = Math.max(T.minRarity, riftFloor);
    // A streak (tier II and up) means more; a boss you have outgrown, less (bossFalloff).
    const streak = T.n >= 2 ? 1 + (p.streak || 0) * CONFIG.STREAK_LOOT : 1;
    const pile = hoard ? Math.max(1, Math.round(hoard.items * fall * streak)) : 0;
    let count = this.trial ? 0 : (hoard ? pile : def.boss ? 2 : this.rng() < Math.min(1, def.drop * T.loot * streak) ? 1 : 0) + (e.elite ? 1 : 0); // the Weekly Echo drops no gear
    if (!this.trial && this.mode === 'explore') {
      // Exploration surprises (0.29): more and better from Rares, the Wishthief and Remnants, and set pieces.
      const extra = [];
      if (def.thief) {
        count = 0;
        for (let i = 0; i < THIEF.items; i++) extra.push(rollItem(this.rng, Math.max(1, Math.round(e.level)), { minRarity: Math.max(floor, i === 0 ? 4 : 2), cls: this.cls }));
      }
      if (e.rare) {
        extra.push(rollItem(this.rng, Math.max(1, Math.round(e.level)), { minRarity: Math.max(floor, this.rng() < RARE.better ? 4 : 3), cls: this.cls }));
        if (this.rng() < RARE.set) extra.push(rollSetPiece(this.rng, Math.max(1, Math.round(e.level)), this.cls, p.spec));
      }
      if (e.remnant) {
        extra.push(rollSetPiece(this.rng, Math.max(1, Math.round(e.level)), this.cls, p.spec));
        if (hoard) count++;
        // Its own Immortal, now and then (0.31).
        if (REMNANT_UNIQUE[e.type] && this.rng() < REMNANT.unique) extra.push(rollUnique(this.rng, Math.max(1, Math.round(e.level)), REMNANT_UNIQUE[e.type], this.cls));
      }
      extra.forEach((item, i) => {
        if (!item) return;
        const a = (i / Math.max(1, extra.length)) * TAU + 0.6;
        const c = this.clampToArena(e.x + dCos(a) * 2.2, e.z + dSin(a) * 2.2, 1);
        const drop = { id: this.nextId++, x: c.x, z: c.z, item, age: 0, magnet: false, owner: this.cur.pid };
        this.loot.push(drop);
        this.emit('lootDrop', { id: drop.id, x: c.x, z: c.z, rarity: item.rarity, set: item.set || null });
      });
    }
    const ilvl = Math.max(1, Math.round(e.level || this.wave.n));
    for (let i = 0; i < count; i++) {
      let opts = { minRarity: Math.max(floor, def.boss ? 2 : 0, e.elite && i === count - 1 ? 3 : 0), cls: this.cls };
      if (e.elite && !e.rare && !def.boss && i === count - 1 && this.mode === 'explore') opts = { weights: ELITE_SPOILS.weights.map((w, r) => (r < floor ? 0 : w)), cls: this.cls }; // its sure piece leans Mythic (0.49)
      if (hoard) {
        // The first item is the prize: guaranteed top rarity on your first kill, good odds after.
        if (i === 0) opts = e.firstKill ? { minRarity: hoard.first, weights: RARITY_ONLY(hoard.first), cls: this.cls } : { weights: hoard.top, cls: this.cls };
        else opts = { minRarity: hoard.min + (i <= hoard.better ? 1 : 0), cls: this.cls };
      }
      let item = rollItem(this.rng, ilvl, opts);
      const luck = 0.04 * perkRank(p.rebirth, 'luck');
      if (luck > 0 && item.rarity < 5 && !item.set && this.rng() < luck) {
        // Lucky Star (Rebirth, 0.43): one rarity higher, up to Ancient
        item = rollItem(this.rng, ilvl, { weights: RARITY_ONLY(item.rarity + 1), slot: item.slot, cls: this.cls });
      }
      const a = this.rng() * TAU;
      const c = this.clampToArena(e.x + dCos(a) * (0.8 + i), e.z + dSin(a) * (0.8 + i), 1);
      const drop = { id: this.nextId++, x: c.x, z: c.z, item, age: 0, magnet: false, owner: this.cur.pid }; // in a party, only its owner sees and takes it
      this.loot.push(drop);
      this.emit('lootDrop', { id: drop.id, x: c.x, z: c.z, rarity: item.rarity });
    }
  }

  /** A boss beaten out in the world: keys, tickets, a pile of gold, and (in dropLoot) a pile of gear. */
  bossRewards(e, fall = 1) {
    const p = this.player;
    const loot = BOSS_LOOT[e.type];
    if (!loot) return;
    const first = !p.bossKills[e.type];
    e.falloff = fall;
    e.firstKill = first;
    if (e.type === 'boss3') {
      // Beating The Unmade opens the next world tier.
      const t = this.worldTier();
      if (t >= p.tierMax && t < MAX_TIER) {
        p.tierMax = t + 1;
        this.emit('tierUnlocked', { tier: t + 1, numeral: TIERS[t + 1].numeral, name: TIERS[t + 1].name });
      }
    }
    p.bossKills[e.type] = (p.bossKills[e.type] || 0) + 1;
    // Keys and shards from a boss you have outgrown come only some of the time.
    const keys = fall >= 1 || this.rng() < fall ? loot.keys : 0;
    const tickets = fall >= 1 || this.rng() < fall ? loot.tickets : 0;
    p.keys += keys;
    p.tickets += tickets;
    if (first) p.skillPoints += 2;
    this.emit('bossFall', { boss: e.type, name: e.def.name, first, keys, tickets, gold: Math.round(e.goldValue * fall), items: Math.max(1, Math.round(loot.items * fall)), falloff: Math.round(fall * 100), x: e.x, z: e.z });
  }

  // =========================================================================
  // Quests, signs and people (the data is in sim/story.js)
  // =========================================================================
  /** null (never taken) | 'active' | 'ready' (go and hand it in) | 'done' */
  questState(id) {
    const q = QUESTS[id];
    if (q && q.act3 && this.player.rebirth && this.player.rebirth.act3[id]) return 'done'; // (0.54) kept through rebirth
    return this.player.quests[id] ? this.player.quests[id].s : null;
  }

  /** (0.58) The world tiers a once-per-tier quest has been handed in on, this life. */
  questTiersDone(id) {
    const st = this.player.quests[id];
    return (st && Array.isArray(st.tiers) && st.tiers) || [];
  }

  /** (0.58) The world tier a once-per-tier quest is for: the one it was taken on, else the one you are on. */
  questTier(id) {
    const st = this.player.quests[id];
    return st && st.s !== 'done' && st.tier ? st.tier : this.worldTier();
  }

  /** Can this quest be taken right now? */
  questOpen(id) {
    const q = QUESTS[id];
    const st = this.questState(id);
    if (!q || (st && !(q.repeat && st === 'done'))) return false;
    if (q.after && this.questState(q.after) !== 'done') return false;
    if (q.perTier && this.questTiersDone(id).includes(this.worldTier())) return false; // (0.58) once on each world tier, each life
    if (q.act3) {
      // Act III (0.54): after the Unwish ending, and at least one rebirth; level 100 every life
      const p = this.player;
      if (!(p.endings && p.endings.self > 0) || !(p.rebirth && p.rebirth.n >= 1) || p.level < q.level) return false;
    }
    return this.player.level >= q.level - 4;
  }

  /** How many of the quest's goal are needed, and how to say what it is. */
  questNeed(q) {
    return q.goal.kill || q.goal.read || q.goal.stories || (q.goal.signs && q.goal.signs.length) || 1;
  }

  /** Signs read that count for a quest goal ({ read: n, map? } or { sign: id }). */
  signsFor(g) {
    const p = this.player;
    if (g.sign) return p.signs.includes(g.sign) ? 1 : 0;
    if (g.signs) return g.signs.filter((id) => p.signs.includes(id)).length;
    return g.map ? p.signs.filter((id) => SIGNS[id] && SIGNS[id].map === g.map).length : p.signs.length;
  }

  acceptQuest(id) {
    if (!this.questOpen(id)) return;
    const q = QUESTS[id];
    const p = this.player;
    const tiersBefore = q.perTier ? this.questTiersDone(id).slice() : null;
    const st = (p.quests[id] = { s: 'active', n: 0 });
    if (q.perTier) Object.assign(st, { tier: this.worldTier(), tiers: tiersBefore }); // (0.58) it counts on the tier it was taken on
    if (q.give && q.give.glass) this.giveMisc('glass', q.give.glass); // Wren's own Unwishing Glass (0.45)
    if (q.goal.ending && (p.endings.self || p.endings.place)) st.n = 1;
    if (q.goal.stories) this.sideStoryCount();
    // Some goals may already be met: a map you have been to, signs you have read.
    if (q.goal.reach && p.visited.includes(q.goal.reach)) st.n = 1;
    if (q.goal.read || q.goal.sign || q.goal.signs) st.n = Math.min(this.questNeed(q), this.signsFor(q.goal));
    if (q.goal.wave && this.bestWave >= q.goal.wave) st.n = 1;
    if (q.goal.kill && !q.goal.boss && this.isSideQuest(q) && !(q.goal.enemy && !ENEMIES[q.goal.enemy])) {
      // (0.53) kills you made before taking it count: taken from the bank, enemy by enemy, map by map
      const need = this.questNeed(q);
      for (const key of Object.keys(p.bank.q)) {
        if (st.n >= need) break;
        const [type, map] = key.split('@');
        if ((q.goal.enemy && q.goal.enemy !== type) || (q.goal.map && q.goal.map !== map)) continue;
        const take = Math.min(need - st.n, p.bank.q[key]);
        p.bank.q[key] -= take;
        if (!p.bank.q[key]) delete p.bank.q[key];
        st.n += take;
        st.pre = (st.pre || 0) + take;
      }
    }
    if (st.n >= this.questNeed(q)) st.s = 'ready';
    this.questStamp++;
    this.emit('quest', { id, what: 'accepted', name: q.name, state: st.s, pre: st.pre || 0 });
  }

  /** Something happened that quests might care about: 'kill' (an enemy), 'reach' (a map id), 'read'. */
  /**
   * (0.63) Coming down into a Depth short of its Ember, beside someone who has it: say so now, before the
   * fight, that its Primordial will not count for you (nor give you Mastery). Once a Depth a visit.
   */
  carryCheck(mapId) {
    const d = DEPTH_IDS.find((n) => DEEP.depths[n].map === mapId);
    if (!d) return;
    const p = this.player, need = DEEP.depths[d].ember;
    if (this.ember(p) >= need) return;
    const strong = this.heroes.filter((h) => h !== this.cur && this.ember(h.player) >= need);
    if (strong.length) this.emit('carryWarn', { id: p.id, depth: DEEP.depths[d].numeral, need, have: this.ember(p), by: strong.map((h) => h.name).join(', ') });
  }

  questEvent(kind, data) {
    if (kind === 'reach') this.carryCheck(data); // (0.63) warn early: being carried through the Deep does not count
    const p = this.player;
    let used = false;
    for (const id in p.quests) {
      const st = p.quests[id];
      const q = QUESTS[id];
      if (!q || st.s !== 'active') continue;
      const g = q.goal;
      let hit = false;
      if (kind === 'kill' && g.kill) {
        hit = (!g.enemy || g.enemy === data.type || g.enemy === data.named) && (!g.boss || g.boss === data.type) && (!g.map || (this.map && this.map.id === g.map));
        if (g.boss && this.mode !== 'explore') hit = false; // the story's bosses are the ones out in the world
        if (hit && q.perTier && st.tier && this.worldTier() !== st.tier) hit = false; // (0.58) on the tier it was taken on
        if (hit && q.act3 && g.boss) {
          // (0.62) Short of a Depth's Ember, beating its Primordial still counts: fighting under-Embered is
          // a challenge, and it pays. The one exception is being carried, when someone in the fight meets it.
          const D = Object.values(DEEP.depths).find((d) => d.primordial === g.boss);
          if (D && this.ember(p) < D.ember) {
            const carried = this.heroes.some((h) => h !== this.cur && this.ember(h.player) >= D.ember);
            if (carried) {
              hit = false;
              this.emit('emberShort', { name: q.name, need: D.ember, have: this.ember(p) });
            } else this.emit('emberDefied', { name: q.name, need: D.ember, have: this.ember(p) });
          }
        }
        if (hit) {
          st.n++;
          used = true;
        }
      } else if (kind === 'reach' && g.reach === data) {
        hit = true;
        st.n = 1;
      } else if (kind === 'wave' && g.wave && data >= g.wave) {
        hit = true;
        st.n = 1;
      } else if (kind === 'ending' && g.ending) {
        hit = true;
        st.n = 1;
      } else if (kind === 'read' && (g.read || g.sign || g.signs)) {
        hit = true;
        st.n = Math.min(this.questNeed(q), this.signsFor(g));
      }
      if (!hit) continue;
      const need = this.questNeed(q);
      if (st.n >= need) st.s = 'ready';
      this.questStamp++;
      this.emit('quest', { id, what: st.s === 'ready' ? 'ready' : 'progress', name: q.name, n: st.n, need, giver: NPCS[this.questTaker(q.giver)].name });
    }
    // (0.53) a kill no side quest was waiting for is kept, by enemy and map, for side quests taken later
    if (kind === 'kill' && !used && this.mode === 'explore' && !this.trial && this.map && data && !data.def.boss && !data.def.summon && !data.named) {
      const key = `${data.type}@${this.map.id}`;
      p.bank.q[key] = (p.bank.q[key] || 0) + 1;
    }
  }

  /** (0.53) The story's own quests (Elder Wren's) start from nothing; side quests can use banked kills. */
  isSideQuest(q) {
    return q.giver !== 'wren';
  }

  /** What a quest pays, with the numbers worked out for its level. */
  questReward(id) {
    const q = QUESTS[id];
    const r = (q.tiers && q.tiers[this.questTier(id)]) || q.reward || {};
    const scale = 1 + 0.12 * (q.level - 1);
    return {
      exp: r.exp ? Math.round(expToNext(Math.min(Math.max(q.level, Math.min(this.player.level, q.level + CONFIG.QUEST_EXP_LATE)), CONFIG.MAX_LEVEL - 1)) * r.exp * CONFIG.QUEST_EXP) : 0,
      gold: r.gold ? Math.round((r.gold * scale) / 5) * 5 : 0,
      scrap: r.scrap ? Math.round(r.scrap * scale) : 0,
      keys: r.keys || 0, tickets: r.tickets || 0, skill: r.skill || 0, fragments: r.fragments || 0, dust: r.dust || 0,
      item: r.item ?? null, slot: r.slot || null,
      ember: r.ember && !(this.player.rebirth && this.player.rebirth.gifts && this.player.rebirth.gifts[id]) ? r.ember : 0, // (0.57.6) once per hero
    };
  }

  claimQuest(id) {
    const p = this.player;
    const q = QUESTS[id];
    if (!q || this.questState(id) !== 'ready') return;
    const r = this.questReward(id);
    const was = p.quests[id] || {};
    p.quests[id] = { s: 'done', n: this.questNeed(q) };
    if (q.perTier) p.quests[id].tiers = [...new Set([...(was.tiers || []), was.tier || this.worldTier()])]; // (0.58)
    if (q.act3 && p.rebirth) {
      // (0.54) Act III stays done through rebirth, and opens the next Depth for good
      p.rebirth.act3[id] = true;
      if (q.deep) {
        p.rebirth.deepMax = Math.max(p.rebirth.deepMax || 0, q.deep);
        this.emit('depthOpened', { depth: q.deep, numeral: DEEP.depths[q.deep].numeral, name: DEEP.depths[q.deep].name, need: DEEP.depths[q.deep].ember, ember: this.ember(p) });
      }
      if (id === 'deep6q') this.emit('ending', { kind: 'primordial' });
    }
    if (r.ember && p.rebirth) {
      // (0.57.6) Ember from the story: kept through every rebirth, given once per hero
      p.rebirth.gifts = p.rebirth.gifts || {};
      p.rebirth.gifts[id] = true;
      p.rebirth.ember = (p.rebirth.ember || 0) + r.ember;
      this.emit('emberGift', { amount: r.ember, ember: this.ember(p), x: p.x, z: p.z });
    }
    p.gold += r.gold;
    p.scrap += r.scrap;
    p.keys += r.keys;
    p.tickets += r.tickets;
    p.skillPoints += r.skill;
    if (r.fragments) this.giveMisc('fragment', r.fragments); // (0.58) Immortal Fragments
    if (r.dust) p.dust += r.dust;
    let item = null;
    if (r.item !== null) {
      // Gear of your own level (within reason), so a quest handed in late is still worth having.
      const ilvl = Math.max(q.level, Math.min(p.level, q.level + 12));
      item = rollItem(this.rng, ilvl, { minRarity: r.item, weights: RARITY_ONLY(r.item), slot: r.slot, cls: this.cls });
      this.giveItem(item);
    }
    if (q.reward.unique) {
      // Edric's Colours: his sword for a warrior (0.47)...
      const key = q.reward.unique[this.cls];
      if (key) {
        item = rollUnique(this.rng, Math.max(q.level, Math.min(p.level, q.level + 12)), key, this.cls);
        this.giveItem(item);
      }
    }
    if (q.reward.keepsake && !p.keepsake) {
      // ...and (0.53) for everyone his colours, in a slot of their own that stays through rebirth, always at your level
      p.keepsake = rollUnique(this.rng, p.level, q.reward.keepsake, this.cls);
      p.keepsake.keepsake = true;
      this.recalcStats();
      this.emit('keepsake', { name: p.keepsake.name });
      if (!item) item = p.keepsake;
    }
    if (q.reward.glow) this.unlockGlow(q.reward.glow);
    if (q.side) this.sideStoryCount();
    this.questStamp++;
    this.emit('quest', { id, what: 'claimed', name: q.name, reward: r, item, alt: id === 'scarf2' && p.choices && p.choices.scarf === 'walk' });
    this.gainExp(r.exp);
  }

  /** Haven Grows (0.47): counts the side stories finished. */
  sideStoryCount() {
    const p = this.player;
    const st = p.quests.havengrows;
    if (!st || st.s !== 'active') return;
    st.n = ['scarf2', 'edric', 'tobin'].filter((id) => this.questState(id) === 'done').length;
    if (st.n >= 3) {
      st.s = 'ready';
      this.emit('quest', { id: 'havengrows', what: 'ready', name: QUESTS.havengrows.name });
    }
  }

  /** Hand the hero an item directly: wear it if the slot is empty, else bag it, else drop it at their feet. */
  giveItem(item) {
    const p = this.player;
    if (!p.equipped[item.slot]) {
      p.equipped[item.slot] = item;
      this.recalcStats();
    } else if (p.bag.length < this.bagSize(p)) p.bag.push(item);
    else this.loot.push({ id: this.nextId++, x: p.x, z: p.z, item, age: 0, magnet: false, owner: this.cur.pid }); // only theirs, even in a party
  }

  /** The person or sign close enough to interact with, or null. */
  /**
   * Everything on this map you can interact with right now (G when close, or right-click to
   * walk over): people, signs, the bounty board, a free boss altar, the travelling merchant.
   * The one list both G and right-click use, so anything added here works with both.
   * Each entry: { kind, id, name, x, z, r, reach?, pickR? } (reach: how close you must be,
   * past r; pickR: how wide a target it is for the mouse).
   */
  interactables() {
    if (this.mode !== 'explore' || !this.map) return [];
    const list = [];
    for (const ob of this.obstacles) if (INTERACT_KINDS.has(ob.kind)) list.push(ob);
    const alt = this.bossAltar(); // a boss's altar, while its boss is down (0.33)
    if (alt) list.push(Object.assign(alt, { reach: SIGIL.altar - alt.r, pickR: 1.4 }));
    if (this.merchant) list.push({ kind: 'merchant', id: 'merchant', name: 'Travelling Merchant', x: this.merchant.x, z: this.merchant.z, r: 0.6 }); // (0.31)
    return list;
  }

  /** The nearest thing close enough to interact with (see interactables), or null. */
  interactable() {
    if (this.mode !== 'explore' || !this.map || this.player.dead) return null;
    const p = this.player;
    let best = null, bd = 1e9;
    for (const ob of this.interactables()) {
      const d = dist(p.x, p.z, ob.x, ob.z) - ob.r;
      if (d <= (ob.reach ?? CONFIG.INTERACT_RANGE) && d < bd) { best = ob; bd = d; }
    }
    return best;
  }

  /** Read a sign: it goes in the journal the first time. */
  readSign(id) {
    const p = this.player;
    if (!SIGNS[id] || p.signs.includes(id)) return;
    p.signs.push(id);
    this.questStamp++;
    this.emit('lore', { id, title: SIGNS[id].title, found: p.signs.length });
    this.questEvent('read', id);
  }

  /**
   * The marker over a person's head: 'ready' (a quest to hand in, shown as a book),
   * 'available' (a quest to take, '!'), 'progress' (one of theirs you are still on, '?'),
   * or '' for nothing. The most useful one wins.
   */
  npcMarker(npcId) {
    let mark = '';
    if (npcId === 'odile' && this.questState('tobin') === 'done') return ''; // (0.54.6) she is in the garden; Lark keeps her quests
    const as = (NPCS[npcId] && NPCS[npcId].as) || npcId;
    for (const id of QUEST_IDS) {
      if (QUESTS[id].giver !== as) continue;
      const st = this.questState(id);
      if (st === 'ready') return 'ready';
      if (this.questOpen(id)) mark = 'available';
      else if (st === 'active' && !mark) mark = 'progress';
    }
    return mark;
  }

  // =========================================================================
  // Subclasses and talents (the data is in sim/talents.js)
  // =========================================================================
  talentsSpent() {
    let n = 0;
    for (const id in this.player.talents) n += this.player.talents[id];
    return n;
  }

  talentPoints() {
    return Math.max(0, talentPointsAt(this.player.level) - this.talentsSpent());
  }

  chooseSpec(id) {
    const p = this.player;
    const spec = SPECS[id];
    if (!spec || spec.cls !== this.cls || p.spec || p.level < CONFIG.SPEC_LEVEL) return;
    p.spec = id;
    p.talents = {};
    p.talentSeq = [];
    this.recalcStats();
    this.emit('spec', { id, name: spec.name });
  }

  /** Why a talent cannot be learned right now, or '' if it can. */
  talentBlock(id) {
    const p = this.player;
    const spec = SPECS[p.spec];
    const t = spec && spec.talents.find((x) => x.id === id);
    if (!t) return 'not in your tree';
    if ((p.talents[id] || 0) >= t.max) return 'max';
    if (this.talentsSpent() < ROW_NEED[t.row]) return `needs ${ROW_NEED[t.row]} points spent`;
    if (this.talentPoints() <= 0) return 'no points';
    return '';
  }

  learnTalent(id, quiet = false) {
    if (this.talentBlock(id)) return false;
    const p = this.player;
    p.talents[id] = (p.talents[id] || 0) + 1;
    // remember the build (the longest one spent in this subclass)
    p.talentSeq.push(id);
    const kept = p.talentBuilds[p.spec];
    if (!kept || p.talentSeq.length >= kept.length) p.talentBuilds[p.spec] = p.talentSeq.slice();
    if (!quiet) {
      this.recalcStats();
      this.emit('talent', { id, rank: p.talents[id] });
    }
    return true;
  }

  /**
   * Spend every free talent point at once (0.37.2): your last build in this subclass, in the
   * order you spent it; past that (or with none), the deepest row open first, evening out ranks.
   */
  autoTalents() {
    const p = this.player;
    const spec = SPECS[p.spec];
    if (!spec || this.talentPoints() <= 0) return;
    const before = this.talentsSpent();
    const plan = (p.talentBuilds[p.spec] || []).slice();
    // replay the remembered build, skipping ranks already held
    const held = Object.assign({}, p.talents);
    for (const id of plan) {
      if (this.talentPoints() <= 0) break;
      if (held[id] > 0) {
        held[id]--;
        continue;
      }
      this.learnTalent(id, true);
    }
    const ROW = { capstone: 3, major: 2, minor: 1 };
    while (this.talentPoints() > 0) {
      const open = spec.talents.filter((t) => !this.talentBlock(t.id));
      if (!open.length) break;
      open.sort((a, b) => ROW[b.row] - ROW[a.row] || (p.talents[a.id] || 0) / a.max - (p.talents[b.id] || 0) / b.max);
      this.learnTalent(open[0].id, true);
    }
    const n = this.talentsSpent() - before;
    if (n > 0) {
      this.recalcStats();
      this.emit('talentsAuto', { n, remembered: plan.length > 0 });
    }
  }

  respecCost() {
    return CONFIG.RESPEC_GOLD * this.player.level;
  }

  /** Forget the subclass and every talent, for gold. The points come back. */
  respec() {
    const p = this.player;
    if (!p.spec) return;
    if (p.gold < this.respecCost()) {
      this.emit('cantAfford');
      return;
    }
    p.gold -= this.respecCost();
    p.spec = null;
    p.talents = {};
    this.recalcStats();
    this.emit('respec');
  }

  // =========================================================================
  // Treasure chests (0.23): a few lie around every map out in the world. Most hold
  // a little gold and gear, some are gilded, and a rare radiant one can hold an Immortal.
  // An opened chest comes back somewhere else on the map a few minutes later.
  // =========================================================================
  placeChests() {
    const kept = this.instanced() ? null : this.chestMaps[this.map.id];
    if (kept) {
      this.chests = kept.chests;
      this.chestRefill = kept.refill;
      return;
    }
    this.chests = [];
    this.chestRefill = [];
    if (this.mode !== 'explore' || this.map.safe || this.trial || !this.map.portals || !this.map.portals.length) return;
    const rng = this.streamRng('chest', this.chestCount);
    const n = CONFIG.CHESTS_PER_MAP + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.addChest();
  }

  addChest() {
    const rng = this.streamRng('chest', ++this.chestCount); // its own dice: chests never change any other roll
    const map = this.map;
    for (let tries = 0; tries < 80; tries++) {
      const a = rng() * TAU;
      const r = 6 + Math.sqrt(rng()) * (this.radius - 10);
      const x = dCos(a) * r, z = dSin(a) * r;
      const probe = { x, z };
      if (this.pushOut(probe, 1.1)) continue; // inside or touching a tree, rock or house
      if (map.portals.some((g) => dist(g.x, g.z, x, z) < 8)) continue;
      if (this.chests.some((c) => dist(c.x, c.z, x, z) < 12)) continue;
      if (this.heroes.some((h) => dist(h.player.x, h.player.z, x, z) < 8)) continue; // never appear right under you
      const roll = rng();
      const tier = roll < CONFIG.CHEST_RADIANT ? 'radiant' : roll < CONFIG.CHEST_RADIANT + CONFIG.CHEST_GILDED ? 'gilded' : 'wooden';
      // Deeper into the map (further from the entrance) means stronger gear, like the enemies there.
      const depth = Math.min(1, dist(x, z, map.portals[0].x, map.portals[0].z) / (2 * this.radius - 12));
      const level = Math.max(1, (map.level || 1) + Math.round((map.levelSpan || 0) * depth));
      const chest = { id: this.nextId++, x, z, tier, level, seed: Math.floor(rng() * 1e9) };
      this.chests.push(chest);
      return chest;
    }
    return null;
  }

  // =========================================================================
  // After The Unmade (0.26): world tiers, elites, Echo Rifts, Wishborne
  // =========================================================================
  /** The world tier the party plays on (the leader's choice). */
  worldTier() {
    if (this.syncTier) return this.syncTier; // a joiner's copy: the host says
    if (this.depthNow()) return MAX_TIER; // the Deep is built on tier V (0.54)
    // (0.61.3) On the server, Haven is shared with strangers on every tier: there each hero's tier is their
    // own (out on a map, a copy is one party's, and its first hero's tier holds for everyone in it).
    const own = this.travelHook && this.map && this.map.safe;
    const lead = !own && this.heroes && this.heroes[0] ? this.heroes[0].player : this.player;
    return Math.max(1, Math.min(MAX_TIER, (lead && lead.worldTier) || 1));
  }

  /**
   * The Depth this map is at (0.54): a Primordial's own domain is always its Depth; any other map out in
   * the world is at the Depth the party's leader has chosen, if they may be there; 0 is the world above.
   */
  depthNow() {
    if (this.mode !== 'explore' || this.trial || !this.map || this.map.safe || this.map.id === 'rift') return 0;
    if (this.map.deep) return this.map.deep;
    if (this.syncDepth != null) return this.syncDepth;
    const lead = this.heroes && this.heroes[0] ? this.heroes[0].player : this.player;
    return lead && lead.depth && this.depthOpen(lead, lead.depth) ? lead.depth : 0;
  }

  /**
   * May this hero go down to Depth d? Level 100, and its story quest done (kept through rebirth). (0.57.6)
   * The first Depth also opens in the main story: from taking The Breath Below, in any life.
   */
  depthOpen(p, d) {
    if (!DEEP.depths[d] || p.level < DEEP.level) return false;
    if (((p.rebirth && p.rebirth.deepMax) || 0) >= d) return true;
    return d === DEPTH_FIRST && !!((p.quests && p.quests.breath) || (p.rebirth && p.rebirth.gifts && p.rebirth.gifts.breath));
  }

  /** (0.57.6) Has the Deep opened to this hero at all (in the story, or by Act III)? */
  deepKnown(p = this.player) {
    return ((p.rebirth && p.rebirth.deepMax) || 0) > 0 || this.depthOpen(p, DEPTH_FIRST) || !!(p.quests && p.quests.breath);
  }

  /** This hero's Ember (0.54). */
  ember(p = this.player) {
    return emberOf(p.rebirth) + (p.headStart || 0); // (0.63) plus the head start from the account's other classes
  }

  /** (0.63) Mastery: the account's Primordials beaten class by class, Animus, the Ember head start. */
  mastery(p = this.player) {
    return masteryFor(p.lives, this.cls, p.rebirth);
  }

  /** Spawn a camp's enemy, at the world tier's level and strength (or the rift's), maybe as an elite. */
  spawnCamp(slot, camp) {
    const rift = this.map.id === 'rift' && this.rift ? this.rift : null;
    const tier = rift ? 1 : this.worldTier();
    let at = camp.def;
    if (rift) at = Object.assign({}, camp.def, { level: Math.max(1, this.heroes[0].player.level) });
    else if (tier >= 2) at = Object.assign({}, camp.def, { level: CONFIG.MAX_LEVEL });
    const e = this.spawnEnemy(slot.type, at);
    let hp = 1, dmg = 1, exp = 1;
    if (rift) {
      const sc = riftScale(rift.tier);
      hp = sc.hp;
      dmg = sc.dmg;
      exp = 1 + 0.08 * (rift.tier - 1);
      slot.respawn = 1e9; // nothing comes back in a rift
    } else if (tier >= 2) {
      hp = TIERS[tier].hp;
      dmg = TIERS[tier].dmg;
      exp = TIERS[tier].exp;
    }
    const depth = rift ? 0 : this.depthNow();
    if (depth) {
      // The Deep (0.54): tier V times the Depth's own, and an Ember requirement on everything
      const D = DEEP.depths[depth];
      hp *= D.hp;
      dmg *= D.dmg;
      exp *= D.exp;
      e.ember = D.ember;
      e.depth = depth;
    }
    const T = TIERS[tier];
    const chance = (rift ? 0.1 : tier >= 2 || (this.map.level || 0) >= ELITE_FROM_LEVEL ? T.elite : 0) + (this.map.wilds ? WILDS.elite : 0);
    if (!e.def.boss && this.rng() < chance) this.makeElite(e, rift ? Math.min(3, 1 + Math.floor(rift.tier / 8)) : T.affixes);
    if (!rift && !this.trial) {
      // Exploration surprises (0.29): now and then a named Rare; a boss you know well may come back as its Remnant.
      if (!e.def.boss && !this.enemies.some((o) => o.rare && !o.dead)) {
        const r = this.streamRng('rare', this.surpriseN++);
        if (r() < RARE.chance * (this.map.wilds ? WILDS.storied : 1)) this.makeRare(e, r, Math.max(RARE.affixes, tier >= 2 || (this.map.level || 0) >= ELITE_FROM_LEVEL ? T.affixes : 0));
      } else if (e.def.boss && BOSS_LOOT[e.type] && (this.heroes[0].player.bossKills[e.type] || 0) >= REMNANT.after) {
        const r = this.streamRng('remnant', this.surpriseN++);
        if (r() < REMNANT.chance) this.makeRemnant(e);
      }
    }
    e.maxHp = e.hp = Math.round(e.maxHp * hp);
    e.dmgMult *= dmg;
    e.expValue *= exp;
    e.goldValue = Math.round(e.goldValue * exp);
    if (e.elite && e.elite.includes('shielded')) e.shield = e.maxShield = Math.round(e.maxHp * 0.4);
    else if (e.def.shield) e.shield = e.maxShield = Math.round(e.maxHp * e.def.shield); // Court Guards (0.39)
    return e;
  }

  /** A named Rare: an elite with two modifiers, far tougher, far better paid. */
  makeRare(e, r, affixes = RARE.affixes) {
    if (e.elite) {
      // Already an elite: top its modifiers up (a Rare never has fewer than an elite of its tier).
      const pool = AFFIX_IDS.filter((a) => !e.elite.includes(a));
      while (e.elite.length < affixes && pool.length) e.elite.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      e.swift = e.elite.includes('swift');
    }
    if (!e.elite) {
      const pool = AFFIX_IDS.slice();
      e.elite = [];
      for (let i = 0; i < affixes && pool.length; i++) e.elite.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      e.swift = e.elite.includes('swift');
      e.maxHp = e.hp = Math.round(e.maxHp * RARE.hp);
      e.dmgMult *= RARE.dmg;
      e.expValue *= RARE.reward;
      e.goldValue = Math.round(e.goldValue * RARE.reward);
      e.radius *= RARE.scale;
    } else {
      e.maxHp = e.hp = Math.round(e.maxHp * (RARE.hp / ELITE.hp));
      e.dmgMult *= RARE.dmg / ELITE.dmg;
      e.expValue *= RARE.reward / ELITE.reward;
      e.goldValue = Math.round(e.goldValue * (RARE.reward / ELITE.reward));
      e.radius *= RARE.scale / 1.12;
    }
    e.rare = rareName(r);
    this.emit('rareSpawn', { id: e.id, name: e.rare, map: this.map.name, x: e.x, z: e.z });
  }

  /** A Remnant: the boss again, tougher, with one new attack (stepDoom) and a set piece to drop. */
  makeRemnant(e) {
    e.remnant = true;
    e.maxHp = e.hp = Math.round(e.maxHp * REMNANT.hp);
    e.dmgMult *= REMNANT.dmg;
    e.expValue *= REMNANT.reward;
    e.goldValue = Math.round(e.goldValue * REMNANT.reward);
    e.remnantT = e.type === 'boss' ? REMNANT.shades.first : e.type === 'boss2' ? REMNANT.pools.first : e.type === 'boss3' ? REMNANT.stars.first : REMNANT.first;
    this.emit('remnantRise', { id: e.id, name: remnantName(e.def), attack: REMNANT.attack[e.type] || 'Echo', map: this.map.name, x: e.x, z: e.z });
  }

  /** The Wishthief: hides on a map; bolts when someone comes near or hits it, and gets away in the end. */
  spawnThief() {
    if (this.mode !== 'explore' || this.trial || this.map.safe || this.instanced() || !this.map.portals || !this.map.portals.length) return null;
    if (this.enemies.some((o) => o.def.thief && !o.dead)) return null;
    const r = this.streamRng('thief', this.surpriseN++);
    const lead = this.heroes[0].player;
    const tier = this.worldTier();
    let x = 0, z = 0;
    for (let i = 0; i < 20; i++) {
      const a = r() * TAU, d = 16 + r() * 8;
      const c = this.clampToArena(lead.x + dCos(a) * d, lead.z + dSin(a) * d, 1);
      x = c.x;
      z = c.z;
      if (!this.obstacles.some((o) => dist(o.x, o.z, x, z) < (o.r || 1) + 1)) break;
    }
    const level = tier >= 2 ? CONFIG.MAX_LEVEL : Math.max(1, (this.map.level || 1) + Math.round((this.map.levelSpan || 0) * 0.5));
    const e = this.spawnEnemy('wishthief', { x, z, level });
    e.x = e.px = x;
    e.z = e.pz = z;
    e.state = 'recover';
    e.t = 0;
    e.maxHp = e.hp = Math.round(e.maxHp * THIEF.hp * (tier >= 2 ? 1 + (TIERS[tier].hp - 1) * 0.5 : 1));
    e.goldValue = Math.round(e.goldValue * 8);
    e.home = null;
    e.fleeing = false;
    e.coinAcc = 0;
    this.emit('thiefSpawn', { id: e.id, map: this.map.name, x, z });
    return e;
  }

  /** The Wishthief runs from whoever is nearest, along the edge when it has to. */
  stepThief(e, dt) {
    let h = null, hd = 1e9;
    for (const x of this.heroes) {
      if (x.player.dead) continue;
      const d = dist(x.player.x, x.player.z, e.x, e.z);
      if (d < hd) {
        hd = d;
        h = x.player;
      }
    }
    if (!e.fleeing) {
      if (!h || (hd > THIEF.near && e.hp >= e.maxHp)) return;
      e.fleeing = true;
      e.lifeT = THIEF.life;
      this.emit('thiefFlee', { id: e.id, x: e.x, z: e.z });
    }
    e.lifeT -= dt;
    if (e.lifeT <= 0) {
      e.dead = true;
      e.escaped = true;
      this.emit('thiefEscape', { id: e.id, x: e.x, z: e.z });
      return;
    }
    if (e.state === 'stunned') {
      e.stunT -= dt;
      if (e.stunT <= 0) e.state = 'recover';
      return;
    }
    if (!h) return;
    // Runs, stumbles to catch its breath, runs again.
    e.runT = (e.runT ?? THIEF.run) - dt;
    if (e.runT < 0) {
      if (e.runT > -THIEF.stumble) {
        if (!e.panting) this.emit('thiefStumble', { id: e.id, x: e.x, z: e.z });
        e.panting = true;
        e.moving = false;
        return;
      }
      e.runT = THIEF.run;
    }
    e.panting = false;
    let a = dAtan2(e.z - h.z, e.x - h.x);
    if (dHypot(e.x, e.z) > this.radius - 7) {
      // Near the edge: run along it instead of into it (whichever way is closer to straight away).
      const out = dAtan2(e.z, e.x);
      const t1 = out + Math.PI / 2, t2 = out - Math.PI / 2;
      a = Math.abs(angDiff(t1, a)) < Math.abs(angDiff(t2, a)) ? t1 : t2;
    }
    const speed = THIEF.speed * h.stats.ms * (e.slowT > 0 ? 1 - (e.slow || 0) : 1);
    e.x += dCos(a) * speed * dt;
    e.z += dSin(a) * speed * dt;
    e.facing = a;
    e.moving = true;
  }

  /** Rerolling (0.43): a fresh number for one line of an equipped item, the same stat, for gold and scrap. */
  rerollLine(slot, key, essence = false) {
    const p = this.player;
    const item = p.equipped[slot];
    if (!item || !(key in item.stats)) return;
    if (essence) {
      // Echoes (0.53): a reroll for Echo Essence instead of gold and scrap
      if (!p.rebirth || p.rebirth.essence < ECHOES.reroll) return this.emit('cantAfford');
      p.rebirth.essence -= ECHOES.reroll;
    } else {
      const cost = rerollCost(item);
      if (p.gold < cost.gold || p.scrap < cost.scrap) {
        this.emit('cantAfford');
        return;
      }
      p.gold -= cost.gold;
      p.scrap -= cost.scrap;
    }
    const from = item.stats[key];
    item.stats[key] = rollLine(key, item, this.rng);
    item.rerolls = (item.rerolls || 0) + 1;
    // (0.62) pity: the 30th reroll without an Immortal-tier line lands one
    const top = ROLL_TIER_AT.length;
    let pity = false;
    if (rollTier(rollQuality(item, key)) >= top) item.pity = 0;
    else if ((item.pity = (item.pity || 0) + 1) >= REROLL_PITY) {
      item.stats[key] = immortalLine(key, item, this.rng);
      item.pity = 0;
      pity = true;
    }
    this.recalcStats();
    this.emit('rerolled', { slot, key, from, value: item.stats[key], tier: rollTier(rollQuality(item, key)), name: item.name, pity });
  }

  /** Reforging (0.29 enchanting; 0.43: you choose the stat): turn one bonus stat into another, for gold and Wishdust. */
  enchantItem(slot, key, to) {
    const p = this.player;
    const item = p.equipped[slot];
    if (!item || !enchantable(item).includes(key)) return;
    const pool = reforgeChoices(item);
    if (!pool.includes(to)) return;
    const cost = enchantCost(item);
    if (p.gold < cost.gold || p.dust < cost.dust) {
      this.emit('cantAfford');
      return;
    }
    p.gold -= cost.gold;
    p.dust -= cost.dust;
    const next = to;
    const value = rollBonusStat(next, item, this.rng);
    const stats = {};
    for (const k in item.stats) {
      if (k === key) stats[next] = value;
      else stats[k] = item.stats[k];
    }
    item.stats = stats;
    item.enchantKey = next;
    item.enchants = (item.enchants || 0) + 1;
    this.recalcStats();
    this.emit('enchanted', { slot, from: key, to: next, value, name: item.name });
  }

  // =========================================================================
  // Act II bosses (0.40): the Herald's proclamation, the Asker's wishes
  // =========================================================================
  /** The Herald reads a line of your naming-day proclamation, and Court Guards answer it. */
  stepHerald(e, dt) {
    const H = e.def.herald;
    e.heraldT = (e.heraldT ?? H.every * 0.5) - dt;
    if (e.heraldT > 0) return;
    e.heraldT = H.every;
    e.heraldLine = (e.heraldLine || 0) + 1;
    const alive = this.enemies.filter((o) => o.summoner === e.id && !o.dead).length;
    for (let i = 0; i < Math.min(H.guards, H.max - alive); i++) {
      const a = e.facing + (i % 2 ? 2 : -2);
      const c = this.clampToArena(e.x + dCos(a) * 5, e.z + dSin(a) * 5, 1);
      const o = this.spawnEnemy('heraldguard', { x: c.x, z: c.z, level: e.level });
      o.x = o.px = c.x;
      o.z = o.pz = c.z;
      o.maxHp = o.hp = Math.round(e.maxHp * H.hp);
      o.shield = o.maxShield = Math.round(o.maxHp * o.def.shield);
      o.dmgMult = e.dmgMult * H.dmg;
      o.summoner = e.id;
      o.home = null;
      o.aggro = true;
      o.state = 'chase';
    }
    this.emit('proclaim', { id: e.id, line: e.heraldLine, x: e.x, z: e.z });
  }

  /** The Asker stops at 75%, 50% and 25% health and offers every hero there a wish. */
  askerCheck(e) {
    const A = e.def.asker;
    const n = e.askerOffers || 0;
    if (n < A.at.length && e.hp <= e.maxHp * A.at[n]) {
      e.askerOffers = n + 1;
      e.offerT = A.time;
      this.removeTelegraph(e);
      e.state = 'recover';
      e.t = 0;
      e.offerTo = new Set(this.heroes.filter((h) => !h.player.dead).map((h) => h.pid));
      this.emit('askerOffer', { id: e.id, n: e.askerOffers, time: A.time, x: e.x, z: e.z, to: [...e.offerTo] });
    }
    if (!e.askerLast && e.hp <= e.maxHp * A.last) {
      // The last stretch: it grows from what was wanted of it; refusals no longer count against you.
      e.askerLast = true;
      e.dmgMult /= e.refuseMult || 1;
      e.refuseMult = 1;
      const grown = e.askerGrown || 0;
      if (grown > 0) {
        e.dmgMult *= 1 + 0.3 * grown;
        e.shield = e.maxShield = Math.round(e.maxHp * 0.08 * grown);
      }
      this.emit('askerLast', { id: e.id, grown, x: e.x, z: e.z });
    }
  }

  /** A hero answers the Asker: 'power', 'shield', 'speed', or nothing at all. */
  askerAnswer(pick) {
    const e = this.enemies.find((o) => o.def.asker && !o.dead && o.offerT > 0 && o.offerTo && o.offerTo.has(this.cur.pid));
    if (!e) return;
    const p = this.player;
    e.offerTo.delete(this.cur.pid);
    if (pick === 'power' || pick === 'shield' || pick === 'speed') {
      // Granted exactly: for the rest of this fight.
      p.wished = p.wished || {};
      p.wished[pick] = (p.wished[pick] || 0) + 1;
      if (pick === 'shield') p.ward = (p.ward || 0) + p.stats.maxHp * 0.3;
      e.askerGrown = (e.askerGrown || 0) + 1;
      this.recalcStats();
      this.emit('askerGranted', { id: e.id, pick, x: p.x, z: p.z, pid: this.cur.pid });
    } else {
      // Refused: it presses harder until the end (where refusals stop counting).
      e.refuseMult = (e.refuseMult || 1) * 1.08;
      e.dmgMult *= 1.08;
      this.emit('askerRefused', { id: e.id, pid: this.cur.pid });
    }
    if (!e.offerTo.size) e.offerT = Math.min(e.offerT, 0.6); // everyone has answered: a breath, then on
  }

  /** The Asker's wishes last only while it stands (and only on its map). */
  clearWishes() {
    for (const h of this.heroes || []) {
      if (h.player.wished) {
        h.player.wished = null;
        this.as(h, () => this.recalcStats());
      }
    }
  }

  // =========================================================================
  // 0.31: unique Remnants, world events, the travelling merchant, ascending, glows
  // =========================================================================
  /** Each Remnant's own mechanic (bosses without one fall back to a ring of blows). */
  stepRemnant(e, near, dt) {
    e.remnantT -= dt;
    if (e.remnantT > 0) return;
    const pick = near[Math.floor(this.rng() * near.length)].player;
    const name = REMNANT.attack[e.type] || 'Echo';
    if (e.type === 'boss') {
      // Mirrored Oath: shades of the Warden, fighting with its own combo.
      const S = REMNANT.shades;
      e.remnantT = S.every;
      const alive = this.enemies.filter((o) => o.summoner === e.id && !o.dead).length;
      for (let i = alive; i < S.count; i++) {
        const a = e.facing + (i % 2 ? 1.6 : -1.6);
        const c = this.clampToArena(e.x + dCos(a) * 4, e.z + dSin(a) * 4, 1);
        const o = this.spawnEnemy('oathshade', { x: c.x, z: c.z, level: e.level });
        o.x = o.px = c.x;
        o.z = o.pz = c.z;
        o.maxHp = o.hp = Math.round(e.maxHp * S.hp);
        o.dmgMult = e.dmgMult * S.dmg;
        o.summoner = e.id;
        o.home = null;
        o.aggro = true;
        o.state = 'chase';
      }
    } else if (e.type === 'boss2') {
      // Spore Bloom: pools that grow under you and hurt while you stand in them.
      const P = REMNANT.pools;
      e.remnantT = P.every;
      const dmg = (e.def.attacks[0].dmg || 20) * e.dmgMult * P.dmg;
      for (let i = 0; i < P.count; i++) {
        // Near you, never under you: they take ground away rather than chase you out of a fight.
        const a = this.rng() * TAU, d = P.near + this.rng() * (P.far - P.near);
        const c = this.clampToArena(pick.x + dCos(a) * d, pick.z + dSin(a) * d, 1);
        const tele = { id: this.nextId++, owner: null, kind: 'circle', x: c.x, z: c.z, dir: 0, radius: P.from, offset: 0, t: 0, dur: P.life, parryable: false, cue: false, pool: true };
        this.telegraphs.push(tele);
        this.hazards.push({ x: c.x, z: c.z, r: P.from, to: P.to, grow: P.grow, left: P.life, life: P.life, tick: P.tick, next: P.tick, dmg, level: e.level, srcId: e.id, tele });
      }
    } else if (e.type === 'boss3') {
      // Unwishing: wish-stars to break before they feed it.
      const S = REMNANT.stars;
      e.remnantT = S.every;
      if (this.enemies.some((o) => o.summoner === e.id && !o.dead)) return;
      for (let i = 0; i < S.count; i++) {
        const a = (i / S.count) * TAU + this.rng();
        const c = this.clampToArena(e.x + dCos(a) * S.dist, e.z + dSin(a) * S.dist, 1.5);
        const o = this.spawnEnemy('wishstar', { x: c.x, z: c.z, level: e.level });
        o.x = o.px = c.x;
        o.z = o.pz = c.z;
        o.maxHp = o.hp = Math.round(e.maxHp * S.hp);
        o.summoner = e.id;
        o.lifeT = S.life;
        o.home = null;
        o.aggro = true;
        o.state = 'recover';
      }
    } else {
      e.remnantT = REMNANT.every;
      const blow = (e.def.attacks[0].dmg || 20) * e.dmgMult * REMNANT.blow;
      for (let i = 0; i < REMNANT.count; i++) {
        const a = this.rng() * TAU, d = i === 0 ? 0 : 1.5 + this.rng() * REMNANT.spread;
        const c = this.clampToArena(pick.x + dCos(a) * d, pick.z + dSin(a) * d, 1);
        this.falls.push({ x: c.x, z: c.z, r: REMNANT.radius, t: -i * 0.15, dur: REMNANT.warn, dmg: blow, level: e.level, srcId: e.id, tele: null });
      }
    }
    this.emit('remnantCast', { id: e.id, name, x: pick.x, z: pick.z });
  }

  /** A wish-star waits; if it is still there when its time runs out, it feeds the Remnant that called it. */
  stepStill(e, dt) {
    e.moving = false;
    e.lifeT -= dt;
    if (e.lifeT > 0) return;
    const S = REMNANT.stars;
    const b = this.enemyById(e.summoner);
    e.dead = true;
    if (b && !b.dead) {
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * S.heal);
      b.dmgMult *= 1 + S.dmg;
      b.unwished = (b.unwished || 0) + 1;
    }
    this.emit('starFeeds', { id: e.id, x: e.x, z: e.z, bx: b ? b.x : e.x, bz: b ? b.z : e.z });
  }

  /** Ground that hurts (Spore Bloom): it grows, ticks on whoever stands in it, then fades. */
  /**
   * Ground that hurts (0.44): fever where a Spitter's bile lands, spores, embers, tears. pool:
   * { r, life, dmg (share of the attack's damage each tick), tick, grow (to this radius), slow }.
   */
  addPool(e, x, z, pool) {
    if (!e || this.hazards.length > 40) return;
    const life = pool.life || 4;
    const c = this.clampToArena(x, z, 0.5);
    const base = (e.def.attacks[0] && e.def.attacks[0].dmg) || 15;
    const tele = { id: this.nextId++, owner: null, kind: 'circle', x: c.x, z: c.z, dir: 0, radius: pool.r, offset: 0, t: 0, dur: life, parryable: false, cue: false, pool: true, poolKind: pool.kind || null };
    this.telegraphs.push(tele);
    const tick = pool.tick || 0.5;
    this.hazards.push({ x: c.x, z: c.z, r: pool.r, to: pool.grow || pool.r, grow: pool.grow ? (pool.grow - pool.r) / life : 0, left: life, life, tick, next: tick, dmg: base * e.dmgMult * (pool.dmg ?? 0.25), level: e.level, srcId: e.id, tele, slow: pool.slow || 0 });
  }

  stepHazards(dt) {
    if (!this.hazards.length) return;
    const was = this.cur;
    for (const hz of this.hazards) {
      hz.left -= dt;
      hz.r = Math.min(hz.to, hz.r + hz.grow * dt);
      hz.tele.radius = hz.r;
      hz.tele.t = hz.life - hz.left;
      hz.next -= dt;
      if (hz.next <= 0) {
        hz.next += hz.tick;
        const src = this.enemyById(hz.srcId);
        for (const h of this.heroes) {
          if (h.player.dead || dist(h.player.x, h.player.z, hz.x, hz.z) > hz.r + h.player.radius * 0.4) continue;
          this.use(h);
          this.hitPlayer(hz.dmg, src ? { parryable: false, src } : { parryable: false, proj: { level: hz.level, srcId: hz.srcId } });
          if (hz.slow > 0) h.player.chillT = Math.max(h.player.chillT || 0, hz.slow); // frost and tar slow you
        }
      }
    }
    this.use(was);
    const gone = this.hazards.filter((hz) => hz.left <= 0).map((hz) => hz.tele);
    if (gone.length) this.telegraphs = this.telegraphs.filter((t) => !gone.includes(t));
    this.hazards = this.hazards.filter((hz) => hz.left > 0);
  }

  /** A chest put exactly here (world events). */
  addChestAt(x, z, tier) {
    const rng = this.streamRng('chest', ++this.chestCount);
    const map = this.map;
    const depth = map.portals && map.portals[0] ? Math.min(1, dist(x, z, map.portals[0].x, map.portals[0].z) / (2 * this.radius - 12)) : 0.5;
    const level = this.worldTier() >= 2 ? CONFIG.MAX_LEVEL : Math.max(1, (map.level || 1) + Math.round((map.levelSpan || 0) * depth));
    const chest = { id: this.nextId++, x, z, tier, level, seed: Math.floor(rng() * 1e9) };
    this.chests.push(chest);
    return chest;
  }

  /** A clear spot this far from the party's leader, for an event or the merchant. */
  spotAway(rng, from, to) {
    const lead = this.heroes[0].player;
    for (let i = 0; i < 40; i++) {
      const a = rng() * TAU, d = from + rng() * (to - from);
      const c = this.clampToArena(lead.x + dCos(a) * d, lead.z + dSin(a) * d, 4);
      const probe = { x: c.x, z: c.z };
      if (this.pushOut(probe, 2)) continue;
      if (this.map.portals.some((g) => dist(g.x, g.z, c.x, c.z) < 8)) continue;
      return c;
    }
    return null;
  }

  /** The level and strength of a map's enemies, for packs that events call up. */
  spawnHere(x, z) {
    const types = this.map.spawns.filter((s) => !ENEMIES[s.type].boss).map((s) => s.type);
    const t = types.length ? types[Math.floor(this.rng() * types.length)] : 'grunt';
    const depth = Math.min(1, dist(x, z, this.map.portals[0].x, this.map.portals[0].z) / (2 * this.radius - 12));
    const level = Math.max(1, (this.map.level || 1) + Math.round((this.map.levelSpan || 0) * depth));
    const e = this.spawnCamp({ type: t, respawn: 1e9 }, { def: { x, z, level, type: t } });
    e.home = null;
    e.aggro = true;
    e.state = 'chase';
    return e;
  }

  /** World events (0.31): a meteor that brings a pack and a chest, or a shrine to hold. */
  startEvent(kind) {
    if (this.happening || this.mode !== 'explore' || this.trial || this.map.safe || this.instanced() || !this.map.portals || !this.map.portals.length) return null;
    const rng = this.streamRng('event', this.surpriseN++);
    const c = this.spotAway(rng, 18, 28);
    if (!c) return null;
    if (kind === 'meteor') {
      const M = EVENTS.meteor;
      this.happening = { kind, x: c.x, z: c.z, r: M.r, state: 'falling', t: M.warn, ids: [], left: 0 };
      this.falls.push({ x: c.x, z: c.z, r: M.hit, t: 0, dur: M.warn, dmg: 40 * enemyScale(Math.max(1, this.map.level || 1)).dmg * M.impact, level: this.map.level || 1, srcId: null, tele: null });
    } else {
      const S = EVENTS.shrine;
      this.happening = { kind, x: c.x, z: c.z, r: S.r, state: 'waiting', t: S.wait, wave: 0, grace: S.grace, hold: S.hold };
    }
    this.emit('eventStart', { kind, map: this.map.name, x: c.x, z: c.z });
    return this.happening;
  }

  /** Everyone who saw a world event through, nearby and at the keys: bounty credit, fragments, maybe a sigil. */
  eventCredit(ev, reach) {
    const was = this.cur;
    for (const h of this.heroes) {
      if (h.player.dead || (h.player.idleT || 0) >= CONFIG.IDLE_NO_REWARD || dist(h.player.x, h.player.z, ev.x, ev.z) > reach) continue;
      this.use(h);
      this.bountyEvent('event');
      this.giveMisc('fragment', FRAGMENTS.event);
      if (this.rng() < SIGIL.event) this.giveMisc('sigil', 1);
    }
    this.use(was);
  }

  stepEvents(dt) {
    if (this.mode !== 'explore' || this.trial || !this.map || this.map.safe || this.instanced()) return;
    const ev = this.happening;
    if (!ev) {
      this.eventClock -= dt;
      if (this.eventClock <= 0) {
        this.eventClock = this.map.wilds ? WILDS.events : EVENTS.every;
        const r = this.streamRng('eventRoll', this.surpriseN++);
        if (r() < (this.map.wilds ? WILDS.eventChance : EVENTS.chance)) this.startEvent(r() < 0.5 ? 'meteor' : 'shrine');
      }
      return;
    }
    const near = (rad) => this.heroes.filter((h) => !h.player.dead && dist(h.player.x, h.player.z, ev.x, ev.z) <= rad);
    if (ev.kind === 'meteor') {
      const M = EVENTS.meteor;
      if (ev.state === 'falling') {
        ev.t -= dt;
        if (ev.t > 0) return;
        ev.state = 'fight';
        ev.t = M.time;
        for (let i = 0; i < M.pack; i++) {
          const a = (i / M.pack) * TAU, d = 2 + (i % 3);
          const c = this.clampToArena(ev.x + dCos(a) * d, ev.z + dSin(a) * d, 1);
          ev.ids.push(this.spawnHere(c.x, c.z).id);
        }
        this.emit('meteorLands', { x: ev.x, z: ev.z, n: M.pack });
        return;
      }
      ev.t -= dt;
      ev.left = ev.ids.filter((id) => this.enemyById(id)).length;
      if (ev.left === 0) {
        this.addChestAt(ev.x, ev.z, 'radiant');
        this.eventCredit(ev, 30);
        this.emit('eventDone', { kind: 'meteor', x: ev.x, z: ev.z });
        this.happening = null;
      } else if (ev.t <= 0) {
        this.emit('eventFail', { kind: 'meteor' });
        this.happening = null;
      }
      return;
    }
    // The shrine
    const S = EVENTS.shrine;
    if (ev.state === 'waiting') {
      ev.t -= dt;
      if (near(ev.r).length) {
        ev.state = 'hold';
        ev.t = S.hold;
        ev.next = 2;
        this.emit('shrineStart', { x: ev.x, z: ev.z, secs: S.hold });
      } else if (ev.t <= 0) {
        this.emit('eventFail', { kind: 'shrine', faded: true });
        this.happening = null;
      }
      return;
    }
    ev.t -= dt;
    ev.next -= dt;
    if (ev.next <= 0) {
      ev.next = S.wave;
      ev.wave++;
      for (let i = 0; i < S.per; i++) {
        const a = this.rng() * TAU, d = 10 + this.rng() * 3;
        const c = this.clampToArena(ev.x + dCos(a) * d, ev.z + dSin(a) * d, 1);
        this.spawnHere(c.x, c.z);
      }
    }
    if (near(ev.r).length) ev.grace = S.grace;
    else ev.grace -= dt;
    if (ev.grace <= 0) {
      this.emit('eventFail', { kind: 'shrine' });
      this.happening = null;
    } else if (ev.t <= 0) {
      this.addChestAt(ev.x, ev.z, 'radiant');
      const was = this.cur;
      for (const h of near(ev.r + 6)) {
        if ((h.player.idleT || 0) >= CONFIG.IDLE_NO_REWARD) continue; // away from the keys: nothing
        this.use(h);
        this.player.dust += S.dust;
        this.player.tickets += S.tickets;
      }
      this.use(was);
      this.eventCredit(ev, ev.r + 6);
      this.emit('eventDone', { kind: 'shrine', x: ev.x, z: ev.z, dust: S.dust, tickets: S.tickets });
      this.happening = null;
    }
  }

  /** The travelling merchant: arrives on a map now and then and stays a few minutes. */
  spawnMerchant() {
    if (this.mode !== 'explore' || this.trial || this.map.safe || this.instanced() || !this.map.portals || !this.map.portals.length) return null;
    const rng = this.streamRng('merchant', this.surpriseN++);
    const c = this.spotAway(rng, 9, 14);
    if (!c) return null;
    const L = this.worldTier() >= 2 ? CONFIG.MAX_LEVEL : Math.max(1, (this.map.level || 1) + Math.round((this.map.levelSpan || 0) * 0.5));
    const lv = 1 + 0.1 * (L - 1);
    const stock = MERCHANT.stock.filter((s) => !s.chance || rng() < s.chance).map((s) => Object.assign({}, s, { gold: s.gold ? Math.round(s.gold * lv) : 0, tickets: s.tickets || 0, sold: false }));
    this.merchant = { x: c.x, z: c.z, left: MERCHANT.stay, level: L, stock };
    this.merchantAt = this.ticks;
    this.emit('merchantArrive', { map: this.map.name, x: c.x, z: c.z });
    return this.merchant;
  }

  /** Buy from the merchant (stock is shared in a party: first come, first served). */
  buyMerchant(i) {
    const mc = this.merchant;
    const p = this.player;
    if (!mc || dist(p.x, p.z, mc.x, mc.z) > CONFIG.INTERACT_RANGE + 1.5) return;
    const s = mc.stock[i];
    if (!s || s.sold) return;
    if (p.gold < s.gold || p.tickets < s.tickets) {
      this.emit('cantAfford');
      return;
    }
    if (s.kind !== 'dust' && s.kind !== 'glass' && p.bag.length >= this.bagSize(p)) {
      this.emit('bagFull');
      return;
    }
    p.gold -= s.gold;
    p.tickets -= s.tickets;
    s.sold = true;
    let item = null;
    if (s.kind === 'dust') p.dust += s.n;
    else if (s.kind === 'glass') this.giveMisc('glass', 1);
    else if (s.kind === 'set') item = rollSetPiece(this.rng, mc.level, this.cls, p.spec);
    else item = rollItem(this.rng, mc.level, { minRarity: s.min, cls: this.cls });
    if (item) p.bag.push(item);
    this.emit('merchantSold', { label: s.label, item, dust: s.kind === 'dust' ? s.n : 0 });
  }

  /** Ascending (0.31): feed a duplicate Immortal (same effect) from the bag into the one you wear. */
  ascendItem(slot, index) {
    const p = this.player;
    const item = p.equipped[slot];
    const dup = p.bag[index];
    if (!item || !dup || item.rarity !== IMMORTAL || dup.rarity !== IMMORTAL || !item.effect || dup.effect !== item.effect || dup === item) return;
    if ((item.stars || 0) >= MAX_STARS) return;
    this.tradeItemGone(dup.id);
    p.bag.splice(index, 1);
    item.stars = (item.stars || 0) + 1;
    this.recalcStats();
    this.emit('ascended', { slot, stars: item.stars, name: item.name });
  }

  /** Weapon glows (0.31): earned once, kept by the character. */
  unlockGlow(id) {
    const p = this.player;
    if (!GLOWS[id] || p.glows.includes(id)) return;
    p.glows.push(id);
    if (!p.glow) p.glow = id;
    this.emit('glowUnlocked', { id, name: GLOWS[id].name });
  }

  // =========================================================================
  // 0.33: bounties, Immortal Fragments, Remnant Sigils, The Wilds
  // =========================================================================
  /** A new job for the board, fitted to what this hero can do now. */
  makeBounty() {
    const p = this.player;
    const rng = this.streamRng('bounty', (p.bountyN = (p.bountyN || 0) + 1) + (p.wish || 0) * 1000 + p.level * 7);
    const tier = this.worldTier();
    const kinds = ['kill', 'kill', 'storied', 'event', 'thief'];
    if (p.level >= BOUNTY.kinds.elite.from || tier >= 2) kinds.push('elite');
    if (Object.values(p.bossKills).some((n) => n >= REMNANT.after)) kinds.push('remnant');
    if (p.bossKills.boss > 0) kinds.push('rift');
    // No two of the same job on the board (two kill jobs, but on different maps).
    const onBoard = new Set((p.bounties || []).filter((b) => b && b.kind !== 'kill').map((b) => b.kind));
    const free = kinds.filter((k) => !onBoard.has(k));
    let kind = (free.length ? free : kinds)[Math.floor(rng() * (free.length ? free : kinds).length)];
    const b = { id: `b${p.bountyN}`, kind, n: 0, need: BOUNTY.kinds[kind].need, done: false };
    if (kind === 'kill') {
      // A map you know that fits your level (on world tier II and up, any map: they are all level 100).
      const fits = (id) => {
        const M = MAPS[id];
        if (M.safe) return false;
        if (M.fromTier) return tier >= M.fromTier; // The Wilds
        if (!p.visited.includes(id)) return false;
        return tier >= 2 || (M.level <= p.level + 3 && M.level + M.levelSpan >= p.level - 15);
      };
      const taken = new Set((p.bounties || []).filter((b) => b && b.kind === 'kill').map((b) => b.map));
      const maps = MAP_IDS.filter((id) => fits(id) && !taken.has(id));
      const id = maps.length ? maps[Math.floor(rng() * maps.length)] : null;
      if (!id) {
        kind = b.kind = 'storied';
        b.need = 1;
      } else {
        b.map = id;
        b.mapName = MAPS[id].name;
      }
    }
    const extra = ['tickets', 'dust', 'gold'];
    if (Object.values(p.bossKills).some((n) => n >= REMNANT.after)) extra.push('sigil');
    const ex = extra[Math.floor(rng() * extra.length)];
    b.reward = {
      fragments: BOUNTY.fragments[0] + Math.floor(rng() * (BOUNTY.fragments[1] - BOUNTY.fragments[0] + 1)),
      [ex]: ex === 'tickets' ? 1 + Math.floor(rng() * 2) : ex === 'dust' ? 4 + Math.floor(rng() * 3) : ex === 'sigil' ? 1 : Math.round(60 * (1 + 0.15 * p.level) * (tier >= 2 ? TIERS[tier].loot : 1)),
      glass: rng() < BOUNTY.glass ? 1 : 0,
    };
    b.text = BOUNTY.kinds[b.kind].text(b);
    // (0.53) what you already did counts: the job takes what it needs from the bank, the rest stays there
    const key = b.kind === 'kill' ? `kill@${b.map}` : b.kind;
    const have = Math.min(b.need, (p.bank && p.bank.b[key]) || 0);
    if (have > 0) {
      p.bank.b[key] -= have;
      b.n = have;
      b.pre = have;
      if (b.n >= b.need) b.done = true;
    }
    return b;
  }

  /** Keep three jobs on this hero's board. */
  fillBounties() {
    const p = this.player;
    if (this.trial || this.mode !== 'explore') return;
    p.bounties = (p.bounties || []).filter(Boolean);
    while (p.bounties.length < BOUNTY.slots) p.bounties.push(this.makeBounty());
  }

  /** Something a bounty might be waiting for happened (to the acting hero). */
  bountyEvent(kind, ctx = {}) {
    const p = this.player;
    if (!p.bounties || this.trial) return;
    let used = false;
    for (const b of p.bounties) {
      if (b.done || b.kind !== kind) continue;
      if (kind === 'kill' && b.map !== ctx.map) continue;
      b.n++;
      used = true;
      if (b.n >= b.need) {
        b.done = true;
        this.emit('bountyDone', { text: b.text });
      }
    }
    // (0.53) nothing on the board wanted it: it is kept, and a job like it later starts with it done
    if (!used) {
      const key = kind === 'kill' ? `kill@${ctx.map}` : kind;
      p.bank.b[key] = (p.bank.b[key] || 0) + 1;
    }
  }

  /** Hand in a finished job at the board (in Haven): its rewards, and a new job in its place. */
  claimBounty(i) {
    const p = this.player;
    const b = p.bounties && p.bounties[i];
    if (!b || !b.done || !this.map.safe) return;
    const r = b.reward;
    if (r.fragments) this.giveMisc('fragment', r.fragments);
    if (r.sigil) this.giveMisc('sigil', r.sigil);
    if (r.glass) this.giveMisc('glass', r.glass);
    if (r.tickets) p.tickets += r.tickets;
    if (r.dust) p.dust += r.dust;
    if (r.gold) p.gold += r.gold;
    p.bounties[i] = this.makeBounty();
    this.emit('bountyClaimed', { text: b.text, reward: r });
  }

  /** Swap a job you do not want for another, for a little gold. */
  swapBounty(i) {
    const p = this.player;
    if (!p.bounties || !p.bounties[i] || p.bounties[i].done || !this.map.safe) return;
    const cost = Math.round(BOUNTY.swapGold * (1 + p.level / 10));
    if (p.gold < cost) {
      this.emit('cantAfford');
      return;
    }
    p.gold -= cost;
    p.bounties[i] = this.makeBounty();
    this.emit('bountySwapped', {});
  }

  /** Immortal Fragments: craft an Immortal for the chosen slot, at your level. */
  craftImmortal(slot) {
    const p = this.player;
    if (!SLOTS.includes(slot) || p.level < FRAGMENTS.craftLevel || (p.misc.fragment || 0) < FRAGMENTS.craft || this.trial) return;
    if (p.bag.length >= this.bagSize(p) && p.equipped[slot]) {
      this.emit('bagFull');
      return;
    }
    p.misc.fragment -= FRAGMENTS.craft;
    const item = rollItem(this.rng, p.level, { weights: [0, 0, 0, 0, 0, 0, 1], slot, cls: this.cls });
    this.giveItem(item);
    this.emit('crafted', { item });
  }

  /** The boss altar on this map, if it is free for a Remnant to be called (no boss standing there). */
  bossAltar() {
    const sp = this.map && this.map.spawns ? this.map.spawns.find((s) => ENEMIES[s.type] && ENEMIES[s.type].boss) : null;
    if (!sp || this.instanced()) return null;
    if (this.enemies.some((e) => e.def.boss && !e.dead)) return null;
    return { kind: 'altar', id: 'altar', name: sp.type === 'asker' ? 'the Starwell' : `${ENEMIES[sp.type].name}'s altar`, type: sp.type, x: sp.x, z: sp.z, r: 1.2 };
  }

  /** A Remnant Sigil pressed into the altar: the Remnant rises at once. */
  summonRemnant() {
    const p = this.player;
    const alt = this.bossAltar();
    if (!alt || dist(p.x, p.z, alt.x, alt.z) > SIGIL.altar || !((p.misc.sigil || 0) > 0)) return;
    if ((this.heroes[0].player.bossKills[alt.type] || 0) < REMNANT.after) {
      this.emit('altarLocked', { name: ENEMIES[alt.type].name });
      return;
    }
    const camp = this.camps.find((c) => c.def.type === alt.type);
    if (!camp) return;
    const slot = camp.slots[0];
    p.misc.sigil--;
    const e = this.spawnCamp(slot, camp);
    if (!e.remnant) this.makeRemnant(e);
    slot.id = e.id;
    delete this.campDown[camp.key];
    this.emit('remnantSummoned', { name: remnantName(e.def) });
  }

  /** Make an enemy an elite with `n` different modifiers. */
  makeElite(e, n) {
    const pool = AFFIX_IDS.slice();
    e.elite = [];
    for (let i = 0; i < n && pool.length; i++) e.elite.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    e.maxHp = e.hp = Math.round(e.maxHp * ELITE.hp);
    e.dmgMult *= ELITE.dmg;
    e.expValue *= ELITE.reward;
    e.goldValue = Math.round(e.goldValue * ELITE.reward);
    e.radius *= 1.12;
    e.swift = e.elite.includes('swift');
  }

  /** Echo Rifts: the leader spends a shard in Haven and takes the party in. */
  enterRift(tier) {
    const p = this.player;
    if ((this.cur !== this.heroes[0] && !this.travelHook) || this.mode !== 'explore' || !this.map.safe || this.rift) return;
    if (!(p.bossKills.boss > 0)) {
      this.emit('riftLocked'); // rifts open once The Warden has fallen
      return;
    }
    const t = Math.max(1, Math.min(p.riftMax, Math.floor(Number(tier) || 1)));
    if (p.tickets < 1) {
      this.emit('riftNoShard');
      return;
    }
    p.tickets--;
    const rift = { tier: t, theme: RIFT.themes[Math.floor(this.rng() * RIFT.themes.length)], seed: Math.floor(this.rng() * 1e9), progress: 0, need: 0, timeLeft: RIFT.time, state: 'run', guardianId: null, won: false };
    this.goMap('rift', 'town', { rift });
  }

  /** Begin a rift on this World (its party goes in). On the server, in the rift's own copy. */
  startRift(rift) {
    this.rift = rift;
    this.loadMap('rift', 'town');
    this.rift.need = Math.max(6, Math.round(this.enemies.length * RIFT.need));
    this.emit('riftStart', { tier: rift.tier, name: MAPS[rift.theme].name });
  }

  /**
   * (0.60) The Weekly Echo's rewards: `weeks` weeks taken part in (each worth WEEKLY_REWARD), and the
   * Echo Champion glow for a Champion. Given by the server world (shards.js) after asking the boards,
   * or by the game for a character in this browser. Never a command a player can send.
   */
  weeklyReward(weeks, champion = false) {
    const p = this.player;
    const n = Math.max(0, Math.floor(weeks) || 0);
    if (n) {
      this.giveMisc('fragment', WEEKLY_REWARD.fragments * n);
      p.dust += WEEKLY_REWARD.dust * n;
      p.tickets += WEEKLY_REWARD.tickets * n;
    }
    if (champion) this.unlockGlow('echoed');
    if (n || champion) this.emit('weeklyReward', { weeks: n, fragments: WEEKLY_REWARD.fragments * n, dust: WEEKLY_REWARD.dust * n, tickets: WEEKLY_REWARD.tickets * n, champion: !!champion });
  }

  /**
   * (0.59) On the server world: wake the Echo Ring from Haven (a shard), with what you are here for.
   * The run is a copy of its own (shards.js); in the browser the camp starts one instead (main.js).
   */
  enterRing(startWave, focus) {
    const p = this.player;
    if (!this.travelHook || this.mode !== 'explore' || !this.map || !this.map.safe || this.trial) return;
    const max = Math.max(1, this.maxCheckpoint || 1);
    const wave = Math.max(1, Math.min(max, Math.floor(Number(startWave) || max)));
    const cost = ringCost(wave); // (0.61.1) more than one shard, more the further in
    if (p.tickets < cost) {
      this.emit('riftNoShard');
      return;
    }
    p.tickets -= cost;
    const f = focus && typeof focus === 'object' ? { kind: String(focus.kind || 'gold'), slot: SLOTS.includes(focus.slot) ? focus.slot : 'weapon' } : { kind: 'gold', slot: 'weapon' };
    this.travelHook(this.cur, 'ring', 'town', { ring: { startWave: wave, focus: f } });
  }

  /**
   * (0.59) The Echo Ring's spoils come home with this hero: everything that was safe at the last boss
   * (all of it, if you leave right after one), and whatever dropped, gathered up. Once a run.
   */
  ringPay() {
    // (0.61.1) everything gathered comes home, however the run ends (a fall too)
    const r = this.ring;
    const p = this.player;
    if (!r || r.paid[this.cur.pid]) return;
    r.paid[this.cur.pid] = true;
    const n = ringWhole(r.pot);
    let scrapped = 0, immortals = 0;
    if (r.kind === 'gold') p.gold += n;
    else if (r.kind === 'fragment' && n) this.giveMisc('fragment', n);
    else if (r.kind === 'dust') p.dust += n;
    else if (r.kind === 'gear') {
      const deep = r.wave || 0;
      const rar = RING.gearRarity(deep);
      const rng = this.streamRng('ringGear', (this.ticks + this.nextId) | 0);
      for (let i = 0; i < n; i++) {
        const imm = rng() < RING.immortal(deep); // (0.61.1) from wave 20, a chance of an Immortal
        const r2 = imm ? 6 : rar;
        if (imm) immortals++;
        const item = rollItem(this.rng, Math.max(1, p.level), { minRarity: r2, weights: RARITY_ONLY(r2), slot: r.slot, cls: this.cls });
        if (!p.equipped[item.slot]) {
          p.equipped[item.slot] = item;
          this.recalcStats();
        } else if (p.bag.length < this.bagSize(p)) p.bag.push(item);
        else {
          p.scrap += scrapValue(item);
          scrapped++;
        }
      }
    }
    this.sweepLoot();
    this.emit('ringPaid', { kind: r.kind, slot: r.slot, n, wave: r.wave || 0, scrapped, immortals });
  }

  /**
   * (0.58) A rift that is over: straight home, without the walk back to the portal. Its loot comes
   * with you (worn if the slot is empty, else into the bag; anything that does not fit is scrapped).
   * On the server each hero goes alone; in a room the host takes everyone.
   */
  riftHome() {
    if (this.mode !== 'explore' || !this.rift || !this.map || this.map.id !== 'rift' || this.rift.state !== 'done') return;
    if (!this.travelHook && this.heroes.length > 1 && this.cur !== this.heroes[0]) return;
    const movers = this.travelHook ? [this.cur] : this.heroes;
    for (const h of movers) this.as(h, () => this.sweepLoot());
    if (this.travelHook) this.goMap('town', 'rift');
    else this.loadMap('town', 'rift');
  }

  /** (0.58) Take every piece on the ground that is this hero's, as walking over it would. */
  sweepLoot() {
    const p = this.player;
    let got = 0, scrapped = 0;
    for (const l of this.loot) {
      if (l.taken || (l.owner !== undefined && l.owner !== this.cur.pid) || l.droppedBy !== undefined) continue;
      l.taken = true;
      if (!p.equipped[l.item.slot]) {
        p.equipped[l.item.slot] = l.item;
        this.recalcStats();
        got++;
      } else if (p.bag.length < this.bagSize(p)) {
        p.bag.push(l.item);
        got++;
      } else {
        p.scrap += scrapValue(l.item);
        scrapped++;
      }
    }
    this.loot = this.loot.filter((l) => !l.taken);
    if (got || scrapped) this.emit('lootSwept', { got, scrapped });
  }

  /** A map made for one run (an Echo Rift, a delve room): no world events, chests or altars of its own. */
  instanced() {
    return !!this.map && (this.map.id === 'rift' || this.map.id === 'delve');
  }

  // =========================================================================
  // Asterfell delves (0.46): down the palace stair, room by room, to the Throne Room
  // =========================================================================
  /** Go down the palace stair at world tier `tier` (any you have reached). The party comes too. */
  enterDelve(tier) {
    const p = this.player;
    if ((this.cur !== this.heroes[0] && !this.travelHook) || this.mode !== 'explore' || this.trial || this.delve || !this.map || this.map.id !== 'asterfell') return;
    const t = Math.max(1, Math.min(p.tierMax, Math.floor(Number(tier) || 1)));
    const rooms = 3 + (t >= 3 ? 1 : 0) + (t >= 5 ? 1 : 0);
    const delve = { tier: t, rooms, room: 0, route: delveRoute(rooms), seed: Math.floor(this.rng() * 1e9), state: 'fight', wait: 0 };
    this.goMap('delve', 'asterfell', { delve });
  }

  /** Begin a delve on this World. On the server, in the delve's own copy. */
  startDelve(delve) {
    this.delve = delve;
    this.loadMap('delve', 'asterfell');
    this.delveSpawn();
  }

  /** The enemies of the room the delve is in, all awake at once; the last room's boss. */
  delveSpawn() {
    const D = this.delve;
    const idx = D.route[D.room];
    const last = D.room === D.rooms - 1;
    const T = TIERS[Math.max(1, D.tier)];
    const lvl = CONFIG.MAX_LEVEL;
    const pools = [
      ['glassbound', 'glassbound', 'wishling', 'courtguard'], // Bakers' Row: the city's people
      ['courtguard', 'courtguard', 'knight', 'knight', 'wraith'], // the Guard Hall
      ['glassbound', 'glassbound', 'wishling', 'wishling', 'courtguard'], // the Ballroom
      ['wishling', 'wishling', 'glassbound', 'wraith'], // the Royal Nursery
      ['courtguard', 'knight', 'glassbound'], // the Throne Room
    ][idx];
    const count = (last ? 4 : 7) + 2 * D.room + D.tier;
    const scale = (e) => {
      e.maxHp = e.hp = Math.round(e.maxHp * T.hp);
      e.dmgMult *= T.dmg;
      e.expValue *= T.exp;
      e.goldValue = Math.round(e.goldValue * T.exp);
      e.home = null;
      e.aggro = true;
    };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + this.rng() * 0.6, r = 7 + this.rng() * 8;
      const c = this.clampToArena(dCos(a) * r, dSin(a) * r, 1.5);
      const e = this.spawnEnemy(pools[Math.floor(this.rng() * pools.length)], { x: c.x, z: c.z, level: lvl });
      e.x = e.px = c.x;
      e.z = e.pz = c.z;
      scale(e);
      if (this.rng() < T.elite * 2) this.makeElite(e, T.affixes);
    }
    if (last) {
      // Something sits beside the empty throne: a different one at each tier.
      const type = ['boss', 'boss2', 'herald', 'boss3', 'asker'][Math.min(4, D.tier - 1)];
      const e = this.spawnEnemy(type, { x: 0, z: 9, level: lvl });
      e.x = e.px = 0;
      e.z = e.pz = 9;
      scale(e);
      e.delveBoss = true;
    }
    const room = DELVE_ROOMS[idx];
    this.emit('delveRoom', { name: room.name, line: room.line, n: D.room + 1, of: D.rooms, tier: D.tier });
  }

  /** A cleared room opens the next after a breath; the last ends the delve with a radiant chest. */
  stepDelve(dt) {
    const D = this.delve;
    if (D.state === 'fight') {
      if (this.enemies.some((e) => !e.dead && !e.noLoot)) return;
      if (D.room < D.rooms - 1) {
        D.state = 'open';
        D.wait = 3.5;
        this.emit('delveClear', { n: D.room + 1, of: D.rooms });
        return;
      }
      D.state = 'done';
      const p = this.heroes[0].player;
      this.addChestAt(0, 4, 'radiant');
      const first = !((p.delveBest || 0) >= D.tier);
      p.delveBest = Math.max(p.delveBest || 0, D.tier);
      if (first) {
        // the first time down at each tier: a Remnant Sigil and an Unwishing Glass for everyone
        for (const h of this.heroes) this.as(h, () => { this.giveMisc('sigil', 1); this.giveMisc('glass', 1); });
      }
      this.emit('delveDone', { tier: D.tier, first });
    } else if (D.state === 'open') {
      D.wait -= dt;
      if (D.wait > 0) return;
      D.room++;
      D.state = 'fight';
      this.loadMap('delve', 'delve');
      this.delveSpawn();
    }
  }

  /** A kill in a rift fills the bar; a full bar calls the guardian. */
  riftKill(e) {
    const r = this.rift;
    if (e.riftGuardian) return this.riftComplete(e);
    if (r.state === 'done' || r.guardianId) return;
    r.progress += e.elite ? 3 : 1;
    if (r.progress < r.need) return;
    const lead = this.heroes[0].player;
    const d = dHypot(lead.x, lead.z) || 1;
    const at = this.clampToArena(lead.x - (lead.x / d) * 9, lead.z - (lead.z / d) * 9, 2);
    const type = RIFT.guardians[(r.tier - 1) % RIFT.guardians.length];
    const g = this.spawnEnemy(type, { x: at.x, z: at.z, level: Math.max(1, lead.level) });
    const sc = riftScale(r.tier);
    g.x = g.px = at.x;
    g.z = g.pz = at.z;
    g.home = null;
    g.aggro = true;
    g.maxHp = g.hp = Math.round(g.maxHp * sc.hp * 0.8);
    g.dmgMult *= sc.dmg;
    g.riftGuardian = true;
    r.guardianId = g.id;
    if (r.state === 'run') r.state = 'guardian';
    this.emit('riftGuardian', { id: g.id, name: g.def.name, x: g.x, z: g.z });
  }

  /** The guardian fell: in time, the next tier opens and everyone gets a pile of loot. */
  riftComplete(e) {
    const r = this.rift;
    const won = r.state !== 'late';
    r.state = 'done';
    r.won = won;
    const secs = Math.round(RIFT.time - r.timeLeft);
    const was = this.cur;
    for (const h of this.heroes) {
      this.use(h);
      const p = this.player;
      const before = p.riftMax;
      if (won) {
        p.riftMax = Math.max(p.riftMax, r.tier + 1);
        if (r.tier >= 10) this.unlockGlow('rift');
        this.bountyEvent('rift');
        if (!p.riftBest || r.tier > p.riftBest.tier || (r.tier === p.riftBest.tier && secs < p.riftBest.secs)) p.riftBest = { tier: r.tier, secs };
        p.tickets += 1; // your shard back, to go again
      }
      p.gold += Math.round((50 + 12 * r.tier) * (won ? 3 : 1));
      const count = won ? 2 + Math.floor(r.tier / 4) : 1;
      const min = won ? Math.min(4, 2 + Math.floor(r.tier / 6)) : 2;
      const ilvl = Math.max(1, Math.round(e.level || p.level));
      for (let i = 0; i < count; i++) {
        const item = rollItem(this.rng, ilvl, { minRarity: min, cls: this.cls });
        const a = (i / count) * TAU;
        const c = this.clampToArena(e.x + dCos(a) * 1.6, e.z + dSin(a) * 1.6, 1);
        const drop = { id: this.nextId++, x: c.x, z: c.z, item, age: 0, magnet: false, owner: this.cur.pid };
        this.loot.push(drop);
        this.emit('lootDrop', { id: drop.id, x: c.x, z: c.z, rarity: item.rarity });
      }
      if (won) this.gainExp(e.expValue * 2);
      this.emit('riftDone', { tier: r.tier, won, secs, opened: p.riftMax > before ? p.riftMax : 0, cls: this.cls, spec: p.spec });
    }
    this.use(was);
  }

  /** Wishborne: put Wish points into a bonus. */
  wishSpend(stat, n) {
    const p = this.player;
    if (!WISH_STATS[stat]) return;
    const k = Math.max(0, Math.min(p.wishPts, Math.floor(Number(n) || 1)));
    if (!k) return;
    p.wishStats[stat] = (p.wishStats[stat] || 0) + k;
    p.wishPts -= k;
    this.recalcStats();
    this.emit('wishSpent', { stat, n: k });
  }

  /**
   * Rebirth (0.43): ask the star to begin again. The world does not rebuild itself: it hands the new
   * save to the game (main.js), which stores it and starts the new life in Haven. Alone only.
   */
  rebirth(heirloom = null) {
    const p = this.player;
    if (this.trial || (this.heroes.length > 1 && !this.travelHook) || rebirthBlock(p)) return; // (0.55.2) on the server, a rebirth is this hero's alone
    if (heirloom && !(SLOTS.includes(heirloom) && p.equipped[heirloom])) heirloom = null;
    const save = rebirthSave(this.toSave(), starterWeapon, heirloom, relevelItem);
    this.emit('reborn', { save, n: save.rebirth.n, marks: save.rebirth.marks - p.rebirth.marks, glow: save.glow, essence: save.rebirth.lastEssence || 0, ember: save.rebirth.lastEmber || 0, heirloom: heirloom ? save.equipped[heirloom].name : null });
  }

  /** Ember a rebirth now would give (0.54.1; 0.58.2): by everything given up, worn (not the Heirloom) and in the bag. */
  rebirthEmber(heirloom = null) {
    return emberForGear(rebirthGear(this.player, heirloom).value);
  }

  /** Echo Essence a rebirth would give now (0.53), keeping `heirloom` (a slot): worn gear and, from 0.58, the bag too. */
  rebirthEssence(heirloom = null) {
    return rebirthGear(this.player, heirloom).essence;
  }

  /** (0.58) Everything a rebirth now would give, and what it would leave behind, for the Begin again panel. */
  rebirthPreview(heirloom = null) {
    const p = this.player, rb = p.rebirth;
    const g = rebirthGear(p, heirloom);
    const next = (rb.n || 0) + 1;
    const acctNow = Math.min(REBIRTH.acctExpMax, REBIRTH.acctExp * (p.acctRebirths || 0));
    const acctNext = Math.min(REBIRTH.acctExpMax, REBIRTH.acctExp * ((p.acctRebirths || 0) + 1));
    let remembered = 0;
    for (const slot of SLOTS) {
      const it = p.equipped[slot];
      if (it && !it.gift && (!rb.memories[slot] || it.rarity * 1000 + (it.stars || 0) * 100 + (it.plus || 0) > rb.memories[slot].rarity * 1000 + (rb.memories[slot].stars || 0) * 100 + (rb.memories[slot].plus || 0))) remembered++;
    }
    return {
      marks: this.rebirthMarks(heirloom), marksGear: p.level >= REBIRTH.level ? starmarksForGear(g.value) : 0, marksWish: p.level >= REBIRTH.level ? starmarksFor(p.level, p.wish || 0) - REBIRTH.base : 0,
      essence: g.essence, essenceWorn: g.worn, essenceBag: g.bag, bagPieces: g.bagPieces, gifts: g.gifts,
      ember: emberForGear(g.value), emberNow: this.ember(p),
      glow: REBIRTH_GLOWS[next] || null,
      acctExp: acctNext > acctNow ? Math.round((acctNext - acctNow) * 100) : 0,
      remembered,
      left: { fragments: (p.misc && p.misc.fragment) || 0, sigils: (p.misc && p.misc.sigil) || 0 },
    };
  }

  /** Echoes (0.53): make a remembered piece again at your level, once a life, for Echo Essence. */
  recallMemory(slot) {
    const p = this.player, rb = p.rebirth;
    const mem = rb && rb.memories && rb.memories[slot];
    if (!mem || rb.recalled[slot]) return;
    const cost = ECHOES.recall[mem.rarity] || 0;
    if (p.level < (ECHOES.recallFrom[mem.rarity] || 1) || rb.essence < cost) {
      this.emit('cantAfford');
      return;
    }
    if (p.bag.length >= this.bagSize(p)) {
      this.emit('bagFull');
      return;
    }
    const item = JSON.parse(JSON.stringify(mem));
    item.id = `r${rb.n}-${slot}-${p.level}`;
    // (0.62) it comes back in its prime: its rolls, its +levels and its stars as they were, and from now on
    // it follows your level like an Heirloom
    delete item.heirloom;
    item.recalled = true;
    relevelItem(item, p.level);
    rb.essence -= cost;
    rb.recalled[slot] = true;
    this.giveItem(item);
    this.emit('recalled', { name: item.name, rarity: item.rarity, cost });
  }

  /**
   * Echoes (0.53): one more +level (or, at the most +level you once had, one more star) for the piece in
   * this slot, for Echo Essence, up to what you had there in a past life.
   */
  echoUpgrade(slot) {
    const p = this.player, rb = p.rebirth;
    const item = p.equipped[slot];
    const mem = rb && rb.memories && rb.memories[slot];
    if (!item || !mem) return;
    let cost = 0, what = null;
    if ((item.plus || 0) < Math.min(MAX_PLUS, mem.plus || 0)) [cost, what] = [ECHOES.plusCost, 'plus'];
    else if (item.rarity === IMMORTAL && item.effect && (item.stars || 0) < Math.min(MAX_STARS, mem.stars || 0)) [cost, what] = [ECHOES.starCost, 'star'];
    if (!what) return;
    if (rb.essence < cost) {
      this.emit('cantAfford');
      return;
    }
    rb.essence -= cost;
    if (what === 'plus') item.plus = (item.plus || 0) + 1;
    else item.stars = (item.stars || 0) + 1;
    this.recalcStats();
    this.emit(what === 'plus' ? 'upgrade' : 'ascended', { item, slot, stars: item.stars, name: item.name, echo: true });
  }

  /** Has the hero seen the end of the wish (0.45)? Haven changes once they have. */
  afterWish(p = this.heroes[0].player) {
    return !!(p.endings && (p.endings.self > 0));
  }

  /** Is this person in Haven right now? (Tomas only after the Unwish, until you have seen him.) */
  /** Who takes a quest of `giver`'s now (0.54.6): once Odile stays in the garden, Lark keeps her quests at the stall. */
  questTaker(giver) {
    return giver === 'odile' && this.questState('tobin') === 'done' ? 'lark' : giver;
  }

  npcHere(id) {
    const n = NPCS[id];
    if (!n) return true;
    const p = this.heroes[0].player;
    const tobinDone = this.as(this.heroes[0], () => this.questState('tobin') === 'done');
    if (id === 'odile') return !tobinDone; // she stays in the garden (0.47)
    if (n.onlyFlag === 'tobin') return tobinDone; // Lark has her stall
    if (n.onlyAfter) return this.afterWish(p) && !p.tomasMet && !(p.choices && p.choices.scarf === 'rest'); // laid to rest, he does not come home
    return true;
  }

  /**
   * Side stories (0.47): who stands where outside Haven, and what Haven has grown. Called as a map loads.
   * Tomas on the Greenwood road while Red Scarf, Part Two is open; Odile at the garden's heart once she
   * has gone to Tobin; a lantern, Edric's banner and a herb stall in Haven as the stories end.
   */
  sideStoryProps(map) {
    if (this.travelHook) return; // (0.58.1) the server's shared maps: each hero's story is their own (see storyObjects)
    map.obstacles.push(...this.storyObjects(map.id, map, this.heroes[0]));
  }

  /**
   * (0.58.1) The story's people and things on `mapId` as hero `h`'s own story has them. On the server
   * a map is shared, so they are not put on it: each player's game draws its own, and what a hero
   * does with them (untie Tomas's scarf, reach Odile) is checked against that hero's own.
   */
  storyObjects(mapId, map, h) {
    if (!h || !map) return [];
    const st = (id) => this.as(h, () => this.questState(id));
    const p = h.player;
    const out = [];
    if (mapId === 'greenwood' && st('scarf2') === 'active' && !(p.choices && p.choices.scarf)) {
      const g = map.portals[0];
      out.push({ kind: 'npc', shape: 'circle', id: 'tomashusk', name: 'Tomas', x: g.x * 0.55 + 3, z: g.z * 0.55, r: 0.6, soft: true });
    }
    if (mapId === 'hollow' && (st('tobin') === 'active' || st('tobin') === 'ready' || st('tobin') === 'done')) {
      const sp = map.spawns.find((s) => s.type === 'boss2');
      if (sp) out.push({ kind: 'npc', shape: 'circle', id: 'odile', name: 'Sister Odile', x: sp.x + 3.5, z: sp.z + 2, r: 0.55, soft: true });
    }
    if (mapId === 'town') {
      if (st('scarf2') === 'done') out.push({ kind: 'decor', what: 'lantern', shape: 'circle', id: 'lantern', x: 3.4, z: 6.6, r: 0.3, soft: true });
      if (st('edric') === 'done') out.push({ kind: 'decor', what: 'banner', shape: 'circle', id: 'banner', x: NPCS.bram.at[0] + 1.8, z: NPCS.bram.at[1] - 1.6, r: 0.3, soft: true });
      if (st('tobin') === 'done') out.push({ kind: 'decor', what: 'stall', shape: 'circle', id: 'stall', x: NPCS.odile.at[0] - 1.6, z: NPCS.odile.at[1] - 0.6, r: 1.0, soft: true });
    }
    return out;
  }

  /** (0.58.1) One of the story's people where this hero's own story has them (or null). */
  storyObject(id) {
    return this.storyObjects(this.map && this.map.id, this.map, this.cur).find((o) => o.id === id) || null;
  }

  /** Red Scarf, Part Two: untie his scarf and let him lie down, or let him keep walking. For good. */
  scarfChoice(choice) {
    const p = this.player;
    if (choice !== 'rest' && choice !== 'walk') return;
    if (this.questState('scarf2') !== 'active' || (p.choices && p.choices.scarf) || !this.map || this.map.id !== 'greenwood') return;
    const t = this.storyObject('tomashusk');
    if (!t || dist(p.x, p.z, t.x, t.z) > 5) return;
    p.choices = Object.assign({}, p.choices, { scarf: choice });
    p.quests.scarf2.n = 1;
    p.quests.scarf2.s = 'ready';
    if (choice === 'rest') this.giveMisc('scarf', 1);
    this.map.obstacles = this.obstacles = this.obstacles.filter((o) => o.id !== 'tomashusk');
    this.questStamp++;
    this.emit('npcGone', { id: 'tomashusk', choice, x: t.x, z: t.z });
  }

  /** An Ending for Tobin: you reach Odile at the heart of the garden. */
  meetOdile() {
    const p = this.player;
    if (this.questState('tobin') !== 'active' || !this.map || this.map.id !== 'hollow') return;
    const o = this.storyObject('odile');
    if (!o || dist(p.x, p.z, o.x, o.z) > 5) return;
    p.quests.tobin.n = 1;
    p.quests.tobin.s = 'ready';
    this.questStamp++;
    this.emit('quest', { id: 'tobin', what: 'ready', name: QUESTS.tobin.name });
  }

  /** The Keep's Storied knight with blue trim (Edric's Colours), once per visit while the quest is open. */
  spawnEdric() {
    this.edricHere = true;
    const sp = this.map.spawns.find((s) => s.type === 'knight') || this.map.spawns[0];
    if (!sp) return;
    const e = this.spawnEnemy('knight', { x: sp.x, z: sp.z, level: this.map.levelMax || this.map.level });
    e.x = e.px = sp.x;
    e.z = e.pz = sp.z;
    this.makeRare(e, () => this.rng());
    e.rare = 'Edric of the Blue Trim';
    e.named = 'edric';
    e.home = { x: sp.x, z: sp.z };
  }

  /**
   * The ending (0.45), at the Starwell once the Asker is gone. 'self': press in an Unwishing Glass and
   * want nothing; the wish lets go, and the world carries on after it. 'place': only once 'self' has
   * been seen; wish to keep them all, as she did: a rebirth into New Game+ in which the wish begins
   * again, stronger, and the Unmade wears your old face. Alone only.
   */
  unwish(choice) {
    const p = this.player;
    if (this.trial || (this.heroes.length > 1 && !this.travelHook) || !this.map || this.map.id !== 'starwell') return;
    if (this.enemies.some((e) => e.def.boss && !e.dead)) return;
    if (choice === 'self') {
      if (!((p.misc.glass || 0) > 0)) return;
      p.misc.glass--;
      const first = !(p.endings.self > 0);
      p.endings.self = (p.endings.self || 0) + 1;
      p.tomasMet = false;
      this.unlockGlow('afterlight');
      this.questEvent('ending', 'self');
      this.questStamp++;
      this.emit('ending', { choice: 'self', first });
    } else if (choice === 'place') {
      if (!(p.endings.self > 0) || rebirthBlock(p)) return;
      const save = rebirthSave(this.toSave(), starterWeapon);
      const rb = save.rebirth;
      rb.ng = (rb.ng || 0) + 1; // New Game+: the wish begins again, stronger
      save.endings = Object.assign({}, p.endings, { place: (p.endings.place || 0) + 1 });
      this.emit('reborn', { save, n: rb.n, marks: rb.marks - p.rebirth.marks, glow: save.glow, ng: rb.ng, ember: rb.lastEmber || 0 });
    }
  }

  /** New Game+ (0.45): how many times this hero took her place. */
  ngLevel() {
    const p = this.heroes[0] ? this.heroes[0].player : this.player;
    return (p && p.rebirth && p.rebirth.ng) || 0;
  }

  /** Starmarks the hero would get for a rebirth now. */
  rebirthMarks(heirloom = null) {
    return starmarksFor(this.player.level, this.player.wish || 0, rebirthGear(this.player, heirloom).value);
  }

  /** Buy one rank of a Rebirth perk with Starmarks. */
  buyPerk(id) {
    const p = this.player;
    const perk = PERKS[id];
    const rb = p.rebirth;
    if (!perk || this.trial) return;
    const r = perkRank(rb, id);
    if (r >= perk.max || rb.marks < perk.cost) return;
    rb.marks -= perk.cost;
    rb.perks[id] = r + 1;
    if (id === 'head') p.skillPoints++; // a Head Start bought mid-life counts at once
    this.recalcStats();
    this.emit('perkBought', { id, rank: r + 1 });
  }

  /** Something for the pouch (0.32). */
  giveMisc(id, n = 1) {
    const p = this.player;
    p.misc[id] = (p.misc[id] || 0) + n;
    this.emit('miscGot', { id, n, total: p.misc[id] });
  }

  /** An Unwishing Glass: every Wish point spent comes back to spend again. */
  wishReset() {
    const p = this.player;
    if (!(p.misc.glass > 0)) return;
    let back = 0;
    for (const k in p.wishStats) back += p.wishStats[k] || 0;
    if (!back) return;
    p.misc.glass--;
    p.wishStats = {};
    p.wishPts += back;
    this.recalcStats();
    this.emit('wishReset', { points: back });
  }

  stepChests() {
    if (!this.chests.length && !this.chestRefill.length) return;
    let opened = false;
    for (const c of this.chests) {
      const h = this.heroes.find((x) => !x.player.dead && dist(x.player.x, x.player.z, c.x, c.z) < 1.7);
      if (!h) continue;
      const was = this.cur;
      this.use(h);
      this.openChest(c);
      this.use(was);
      opened = true;
    }
    if (opened) {
      for (const c of this.chests) if (c.opened) this.chestRefill.push(this.ticks + Math.round(CONFIG.CHEST_RESPAWN / CONFIG.TICK));
      this.chests = this.chests.filter((c) => !c.opened);
    }
    if (this.chestRefill.length && this.chestRefill[0] <= this.ticks) {
      this.chestRefill.shift();
      this.addChest();
    }
  }

  openChest(c) {
    c.opened = true;
    const p = this.player;
    const rng = makeRng(c.seed);
    const T = CHEST_TIERS[c.tier];
    const gold = Math.round((12 + c.level * 3) * T.gold * (1 + 0.1 * perkRank(p.rebirth, 'fortune')));
    p.gold += gold;
    if (T.tickets) p.tickets += T.tickets;
    if (T.potions) p.potions = CONFIG.MAX_POTIONS;
    const tierNow = this.worldTier();
    const odds = (o) => (o.immortal ? o.weights.map((w, i) => (i === IMMORTAL ? (tierNow >= o.immortalFromTier ? o.immortalHigh : o.immortal) : w)) : o.weights);
    const items = T.items.map((o) => rollItem(rng, c.level, o.weights ? { weights: odds(o), cls: this.cls } : { minRarity: o.min, cls: this.cls }));
    if (c.tier === 'radiant' && !this.trial && rng() < 0.2) items.push(rollSetPiece(rng, c.level, this.cls, this.player.spec)); // a set piece, now and then (0.29; 0.49: more often)
    const frags = T.fragments && !this.trial ? FRAGMENTS.radiant[0] + Math.floor(rng() * (FRAGMENTS.radiant[1] - FRAGMENTS.radiant[0] + 1)) : 0;
    if (frags) this.giveMisc('fragment', frags); // (0.49)
    items.forEach((item, i) => {
      const a = (i / items.length) * TAU + 0.6;
      const at = this.clampToArena(c.x + dCos(a) * 1.1, c.z + dSin(a) * 1.1, 1);
      const drop = { id: this.nextId++, x: at.x, z: at.z, item, age: 0, magnet: false, owner: this.cur.pid }; // in a party, the opener's
      this.loot.push(drop);
      this.emit('lootDrop', { id: drop.id, x: at.x, z: at.z, rarity: item.rarity });
    });
    const best = items.reduce((m, it) => Math.max(m, it.rarity), 0);
    this.emit('chestOpen', { id: c.id, x: c.x, z: c.z, tier: c.tier, gold, tickets: T.tickets || 0, best, frags });
  }

  stepLoot(dt) {
    const p = this.player;
    if (p.dead) return;
    for (const l of this.loot) {
      if (l.owner !== undefined && l.owner !== this.cur.pid) continue;
      if (l.droppedBy === this.cur.pid && this.ticks - l.dropTick < 4 / CONFIG.TICK) continue; // dropped for a friend: not straight back up
      l.age += dt;
      const d = dist(l.x, l.z, p.x, p.z);
      if (l.magnet && d > 0.01) {
        const sp = Math.min(d, 26 * dt);
        l.x += ((p.x - l.x) / d) * sp;
        l.z += ((p.z - l.z) / d) * sp;
      }
      if (d < 1.5 && l.age > 0.35) {
        if (p.bag.length >= this.bagSize(p) && p.equipped[l.item.slot]) {
          if (!l.warned) {
            l.warned = true;
            this.emit('bagFull');
          }
          l.magnet = false;
          continue;
        }
        l.taken = true;
        if (l.droppedBy !== undefined && l.droppedBy !== this.cur.pid) l.item.gift = true; // (0.58) dropped by a friend: a gift
        const current = p.equipped[l.item.slot];
        const upgrade = itemScore(l.item) > itemScore(current);
        if (!current) {
          p.equipped[l.item.slot] = l.item; // empty slot: wear it straight away
          this.recalcStats();
          this.emit('pickup', { item: l.item, equipped: true, upgrade: true });
        } else {
          p.bag.push(l.item);
          this.emit('pickup', { item: l.item, equipped: false, upgrade });
        }
      }
    }
    this.loot = this.loot.filter((l) => !l.taken);
  }

  // =========================================================================
  // Trading (0.25, in a party): drop an item for a friend, or trade through a
  // window where both sides put in items and gold and both must accept.
  // Everything is checked again at the moment of the swap.
  // =========================================================================
  dropItem(index) {
    const p = this.player;
    const item = p.bag[index];
    if (!item || !this.party || this.mode !== 'explore' || p.dead) return;
    if (item.gift) return this.emit('giftBound', { name: item.name }); // (0.58)
    p.bag.splice(index, 1);
    this.tradeItemGone(item.id);
    const a = this.rng() * TAU;
    const at = this.clampToArena(p.x + dCos(a) * 1.4, p.z + dSin(a) * 1.4, 1);
    const drop = { id: this.nextId++, x: at.x, z: at.z, item, age: 0, magnet: false, droppedBy: this.cur.pid, dropTick: this.ticks }; // anyone in the party can take it
    this.loot.push(drop);
    this.emit('itemDropped', { id: drop.id, x: at.x, z: at.z, rarity: item.rarity, name: item.name, by: this.cur.name });
  }

  tradeFor(pid) {
    return (this.trades || []).find((t) => t.a === pid || t.b === pid) || null;
  }

  /** Tell both sides how the trade stands (each sees their own side as "mine"). */
  tradeTell(t, state, reason = '') {
    for (const pid of [t.a, t.b]) {
      const h = this.heroByPid(pid);
      if (!h) continue;
      const other = pid === t.a ? t.b : t.a;
      const oh = this.heroByPid(other);
      const side = (q) => {
        const bag = this.heroByPid(q)?.player.bag || [];
        return { items: t.items[q].map((id) => bag.find((it) => it.id === id)).filter(Boolean), ids: t.items[q].slice(), gold: t.gold[q], ok: t.ok[q] };
      };
      this.as(h, () => this.emit('trade', { state, reason, asker: t.a === pid, with: oh ? oh.name : 'your friend', withPid: other, mine: side(pid), theirs: side(other) }));
    }
  }

  tradeAsk(to) {
    const me = this.cur.pid;
    const other = this.heroByPid(to);
    if (!this.party || !other || to === me || this.mode !== 'explore') return;
    if (this.tradeFor(me) || this.tradeFor(to)) {
      this.emit('tradeBusy', { name: other.name });
      return;
    }
    if (!this.trades) this.trades = [];
    const t = { a: me, b: to, open: false, items: { [me]: [], [to]: [] }, gold: { [me]: 0, [to]: 0 }, ok: { [me]: false, [to]: false } };
    this.trades.push(t);
    this.tradeTell(t, 'asked');
  }

  tradeAnswer(yes) {
    const t = this.tradeFor(this.cur.pid);
    if (!t || t.open || t.b !== this.cur.pid) return;
    if (!yes) return this.tradeCancel('declined');
    t.open = true;
    this.tradeTell(t, 'open');
  }

  /** Put items (by id, from your bag) and gold into your side of the trade. Either side changing anything un-readies both. */
  tradeSet(ids, gold) {
    const me = this.cur.pid;
    const t = this.tradeFor(me);
    if (!t || !t.open) return;
    const p = this.player;
    const list = Array.isArray(ids) ? [...new Set(ids)].filter((id) => p.bag.some((it) => it.id === id && !it.gift)).slice(0, 8) : []; // (0.58) not a gift
    t.items[me] = list;
    t.gold[me] = Math.max(0, Math.min(p.gold, Math.floor(Number(gold) || 0)));
    t.ok[t.a] = t.ok[t.b] = false;
    this.tradeTell(t, 'open');
  }

  tradeOk() {
    const t = this.tradeFor(this.cur.pid);
    if (!t || !t.open) return;
    t.ok[this.cur.pid] = true;
    if (!(t.ok[t.a] && t.ok[t.b])) return this.tradeTell(t, 'open');
    // Both accepted: check everything once more, then swap.
    const ha = this.heroByPid(t.a), hb = this.heroByPid(t.b);
    if (!ha || !hb) return this.tradeCancel('gone');
    const pa = ha.player, pb = hb.player;
    const take = (p, ids) => ids.map((id) => p.bag.find((it) => it.id === id));
    const ia = take(pa, t.items[t.a]), ib = take(pb, t.items[t.b]);
    if (ia.some((x) => !x) || ib.some((x) => !x) || pa.gold < t.gold[t.a] || pb.gold < t.gold[t.b]) return this.tradeCancel('changed');
    if (pa.bag.length - ia.length + ib.length > this.bagSize(pa) || pb.bag.length - ib.length + ia.length > this.bagSize(pb)) return this.tradeCancel('full');
    for (const it of [...ia, ...ib]) it.gift = true; // (0.58) a gift stays with whoever it was given to
    pa.bag = pa.bag.filter((it) => !ia.includes(it)).concat(ib);
    pb.bag = pb.bag.filter((it) => !ib.includes(it)).concat(ia);
    pa.gold += t.gold[t.b] - t.gold[t.a];
    pb.gold += t.gold[t.a] - t.gold[t.b];
    this.trades = this.trades.filter((x) => x !== t);
    for (const [h, got, gave, goldIn] of [[ha, ib, ia, t.gold[t.b] - t.gold[t.a]], [hb, ia, ib, t.gold[t.a] - t.gold[t.b]]]) {
      this.as(h, () => this.emit('trade', { state: 'done', with: (h === ha ? hb : ha).name, got: got.map((it) => it.name), gave: gave.map((it) => it.name), gold: goldIn }));
    }
  }

  tradeCancel(reason) {
    const t = this.tradeFor(this.cur.pid);
    if (!t) return;
    this.trades = this.trades.filter((x) => x !== t);
    this.tradeTell(t, 'closed', reason);
  }

  /** An item left your bag some other way (equipped, scrapped, dropped): take it out of any trade. */
  tradeItemGone(id) {
    const t = this.tradeFor(this.cur.pid);
    if (!t || !t.items[this.cur.pid].includes(id)) return;
    t.items[this.cur.pid] = t.items[this.cur.pid].filter((x) => x !== id);
    t.ok[t.a] = t.ok[t.b] = false;
    this.tradeTell(t, 'open');
  }

  equip(index) {
    const p = this.player;
    const item = p.bag[index];
    if (!item) return;
    if (item.cls && item.cls !== this.cls) {
      this.emit('cantEquip', { item }); // another class's weapon
      return;
    }
    this.tradeItemGone(item.id);
    const old = p.equipped[item.slot];
    p.equipped[item.slot] = item;
    if (old) p.bag[index] = old;
    else p.bag.splice(index, 1);
    this.recalcStats();
    this.emit('equip', { item });
  }

  /**
   * (0.61.9) Put on every upgrade in the bag: for each slot, the best item that outscores what is worn (the
   * green arrow). It never takes off an Immortal or a set piece for an ordinary item, never equips another
   * class's weapon, and leaves alone anything on offer in a trade. Returns how many it put on.
   */
  equipUpgrades() {
    const p = this.player;
    const trading = new Set(this.tradeFor(this.cur.pid)?.items[this.cur.pid] || []);
    const picks = bestUpgrades(p.equipped, p.bag, this.cls, trading);
    let count = 0;
    for (const slot of SLOTS) {
      if (!(slot in picks)) continue;
      const i = picks[slot];
      const item = p.bag[i];
      const worn = p.equipped[slot];
      p.equipped[slot] = item;
      p.bag[i] = worn || null; // swapped in place, so the other picks' indices still hold
      count++;
      this.emit('equip', { item, auto: true });
    }
    if (count) {
      p.bag = p.bag.filter(Boolean);
      this.recalcStats();
    } else this.emit('noUpgrades');
    return count;
  }

  /** Break one bag item down into scrap. */
  discard(index) {
    const p = this.player;
    const item = p.bag[index];
    if (!item) return;
    this.tradeItemGone(item.id);
    p.bag.splice(index, 1);
    const scrap = scrapValue(item);
    p.scrap += scrap;
    const dust = this.keptRate(dustValue(item));
    p.dust += dust;
    this.emit('discard', { count: 1, scrap, dust });
  }

  /** Scrap every bag item that scores lower than what is equipped in its slot. */
  /** Scrap every bag item that is not an upgrade, except rarities in `keep` (indices into RARITIES). */
  scrapNonUpgrades(keep = []) {
    const p = this.player;
    const kept = new Set(Array.isArray(keep) ? keep.map(Number) : []);
    let scrap = 0;
    let dust = 0;
    let count = 0;
    const trading = new Set(this.tradeFor(this.cur.pid)?.items[this.cur.pid] || []);
    p.bag = p.bag.filter((it) => {
      if (kept.has(it.rarity) || trading.has(it.id)) return true; // never scrap what is on offer in a trade
      if (itemScore(it) > itemScore(p.equipped[it.slot])) return true;
      scrap += scrapValue(it);
      dust += dustValue(it);
      count++;
      return false;
    });
    if (count) {
      dust = this.keptRate(dust);
      p.scrap += scrap;
      p.dust += dust;
      this.emit('discard', { count, scrap, dust });
    }
  }

  // --- Town: blacksmith, caches, trainer -----------------------------------
  /** Blacksmith: raise an equipped item by +1 for scrap and gold. */
  upgradeItem(slot) {
    const p = this.player;
    const item = p.equipped[slot];
    if (!item || (item.plus || 0) >= MAX_PLUS) return;
    const cost = upgradeCost(item);
    if (p.scrap < cost.scrap || p.gold < cost.gold) {
      this.emit('cantAfford');
      return;
    }
    p.scrap -= cost.scrap;
    p.gold -= cost.gold;
    item.plus = (item.plus || 0) + 1;
    this.recalcStats();
    this.emit('upgrade', { item });
  }

  /** Open a loot cache. The item goes to the bag. */
  openCache(tier) {
    const p = this.player;
    const def = CACHES[tier];
    if (!def) return;
    if (p.bag.length >= this.bagSize(p)) {
      this.emit('bagFull');
      return;
    }
    const { gold, keys } = this.cacheCost(tier);
    if (p.gold < gold || p.keys < keys) {
      this.emit('cantAfford');
      return;
    }
    p.gold -= gold;
    p.keys -= keys;
    const item = rollItem(this.rng, Math.max(1, this.player.level), { weights: def.odds, cls: this.cls });
    p.bag.push(item);
    this.emit('cacheOpened', { item, tier });
  }

  /** Skill points still worth having: ranks left to buy minus points already held. */
  ranksLeft() {
    const p = this.player;
    let left = 0;
    for (const k in p.ranks) left += CONFIG.MAX_RANK - p.ranks[k];
    return left - p.skillPoints;
  }

  /** What a cache costs right now. Caches hold gear of your level, so the gold price rises with it. */
  cacheCost(tier) {
    const cost = CACHES[tier].cost;
    return { gold: Math.round(((cost.gold || 0) * (1 + 0.1 * (this.player.level - 1))) / 10) * 10, keys: cost.keys || 0 };
  }

  tomeCost() {
    return CONFIG.TOME_BASE_COST + CONFIG.TOME_COST_GROWTH * this.player.tomes;
  }

  /** Trainer: buy one extra skill point. */
  buyTome() {
    const p = this.player;
    const cost = this.tomeCost();
    if (this.ranksLeft() <= 0) return;
    if (p.gold < cost) {
      this.emit('cantAfford');
      return;
    }
    p.gold -= cost;
    p.tomes++;
    p.skillPoints++;
    this.emit('tome');
  }

  /** Spend a skill point to rank up an ability. */
  rankUp(slot) {
    const p = this.player;
    if (!this.kit[slot] || p.skillPoints <= 0 || p.ranks[slot] >= CONFIG.MAX_RANK || !this.abilityUnlocked(slot)) return;
    p.ranks[slot]++;
    p.skillPoints--;
    this.emit('rankUp', { slot, rank: p.ranks[slot] });
  }

  // --- Augments --------------------------------------------------------------
  /** Put three augments on offer. The next wave waits until one is taken. */
  makeOffer(boss, exclude = []) {
    const rng = this.streamRng('offer', this.offerCount++); // the same offers for everyone on the same seed
    const pool = AUGMENT_IDS.filter((id) => {
      const a = AUGMENTS[id];
      if (this.augments.includes(id) || exclude.includes(id)) return false;
      if (a.cls && a.cls !== this.cls) return false; // another class's augment
      if (a.spec && a.spec !== this.player.spec) return false; // another subclass's augment
      if (a.notSpec && a.notSpec.includes(this.player.spec)) return false;
      // An augment for an ability the subclass has swapped for a different one (Frozen Orb for a Pyromancer).
      if (!a.spec && 'qwer'.includes(a.slot) && a.slot.length === 1) {
        const base = CLASSES[a.cls || this.cls].abilities[a.slot];
        if (this.kit[a.slot] !== base && this.kit[a.slot].type !== base.type) return false;
      }
      return a.slot === 'parry' || a.slot === 'hero' || id === 'r_early' || this.abilityUnlocked(a.slot);
    });
    const t1 = pool.filter((id) => AUGMENTS[id].tier === 1);
    const t2 = pool.filter((id) => AUGMENTS[id].tier === 2);
    const choices = [];
    for (let i = 0; i < 3; i++) {
      const strong = boss || rng() < 0.12;
      const src = strong && t2.length ? t2 : t1.length ? t1 : t2;
      if (!src.length) break;
      choices.push(src.splice(Math.floor(rng() * src.length), 1)[0]);
    }
    if (!choices.length) return;
    this.offer = { choices, boss: !!boss };
    this.emit('augmentOffer', { boss: !!boss });
  }

  takeAugment(id) {
    if (!this.offer || !this.offer.choices.includes(id)) return;
    this.offer = null;
    this.augments.push(id);
    this.recalcStats();
    this.emit('augmentTaken', { id });
  }

  rerollOffer() {
    if (!this.offer || this.rerolls <= 0) return;
    this.rerolls--;
    const old = this.offer;
    this.offer = null;
    this.makeOffer(old.boss, old.choices);
    if (!this.offer) this.offer = old; // nothing else left to offer
  }

  // =========================================================================
  // Enemies
  // =========================================================================
  enemyById(id) {
    for (const e of this.enemies) if (e.id === id && !e.dead) return e;
    return null;
  }

  /**
   * The level of arena enemies. It follows the hero, so the arena is worth
   * fighting in whether you are level 3 or level 80, and creeps up with the wave.
   */
  arenaLevel() {
    return Math.max(1, Math.round(this.player.level * 0.9 - 1 + this.wave.n * 0.35));
  }

  /** @param at  exploration only: the camp { x, z, level } this enemy belongs to */
  spawnEnemy(type, at = null) {
    const def = ENEMIES[type];
    const p = this.player;
    const level = at ? at.level : this.arenaLevel();
    const scale = enemyScale(level);
    const ng = this.mode === 'explore' && !this.trial ? this.ngLevel() : 0;
    if (ng > 0) {
      // New Game+ (0.45): the wish began again, stronger. A third more health and a fifth more damage each time.
      scale.hp *= 1 + 0.33 * ng;
      scale.dmg *= 1 + 0.2 * ng;
    }
    if (!at) {
      // Arena: later waves hit harder and last longer whatever the level, and pay less EXP.
      scale.hp *= 1 + CONFIG.ARENA_WAVE_HP * (this.wave.n - 1);
      if (this.twist === 'swarm') scale.hp *= 0.75; // (0.60) Swarm
      scale.dmg *= 1 + CONFIG.ARENA_WAVE_DMG * (this.wave.n - 1);
      scale.exp *= CONFIG.ARENA_EXP;
    }
    // Pick a point near the arena edge that is not right on top of the player.
    let x = 0;
    let z = 0;
    for (let i = 0; i < 12; i++) {
      const a = this.rng() * TAU;
      const r = this.radius - 2.5 - this.rng() * 3;
      x = dCos(a) * r;
      z = dSin(a) * r;
      if (dist(x, z, p.x, p.z) > 10) break;
    }
    if (at) {
      const a = this.rng() * TAU;
      const r = 1.5 + this.rng() * 4.5;
      x = at.x + dCos(a) * r;
      z = at.z + dSin(a) * r;
    }
    const e = {
      id: this.nextId++,
      type,
      def,
      x,
      z,
      px: x,
      pz: z,
      facing: dAtan2(p.z - z, p.x - x),
      aim: 0,
      radius: def.radius,
      hp: Math.round(def.hp * scale.hp),
      maxHp: Math.round(def.hp * scale.hp),
      dmgMult: scale.dmg,
      expValue: def.exp * scale.exp * (at && def.boss ? CONFIG.BOSS_EXP : 1),
      chaseT: 0, // how long it has been chasing without getting an attack off
      goldValue: Math.round(def.exp * 0.5 * scale.gold * (at && def.boss ? CONFIG.BOSS_GOLD : 1)),
      level,
      home: at ? { x: at.x, z: at.z } : null, // camp enemies stay near home
      aggro: !at,
      returning: false,
      patience: 1, // drains while dragged far from home (see stepLeash)
      vulnT: 0, // Sunder: takes `vuln` more damage while > 0
      vuln: 0,
      bleedT: 0,
      bleedDps: 0,
      bleedAcc: 0,
      frostStacks: 0, // Hoarfrost (Frostbinder)
      frostT: 0,
      frostLock: 0,
      slowT: 0, // Hamstring: moves `slow` slower while > 0
      slow: 0,
      state: 'spawn',
      t: 0.9,
      dur: 0,
      atk: null,
      tele: null,
      atkCd: 0.4 + this.rng() * 0.8,
      posture: 0,
      stunT: 0,
      cue: 0,
      hitFlash: 0,
      kx: 0,
      kz: 0,
      strafe: this.rng() < 0.5 ? 1 : -1,
      strafeT: 1 + this.rng() * 2,
      farT: 0,
      lastAtk: null,
      moving: false,
      dead: false,
    };
    if (type === 'boss3' && ng > 0) {
      // New Game+ (0.45): you took her place. The Unmade is the hero you were.
      const past = (this.heroes[0].player.rebirth.past || []).slice(-1)[0];
      const cls = past && OLD_SELVES[past.cls] ? past.cls : null;
      if (cls) {
        e.oldCls = cls;
        e.kitDef = OLD_SELVES[cls];
      }
    }
    this.enemies.push(e);
    this.emit('spawn', { id: e.id, enemyType: type, x, z });
    return e;
  }

  /** Limits how many enemies attack at once so each hit is a distinct beat you can parry. */
  canStartAttack(e) {
    if (e.def.boss) return true;
    if (this.time - this.lastWindupAt < CONFIG.ATTACK_STAGGER) return false;
    let busy = 0;
    let bossAlive = false;
    for (const o of this.enemies) {
      if (o.dead) continue;
      if (o.def.boss) bossAlive = true;
      else if (o.state === 'windup' || o.state === 'charge') busy++;
    }
    return busy < (bossAlive ? 1 : CONFIG.MAX_ATTACKERS);
  }

  chooseAttack(e, d) {
    const def = e.def;
    if (def.kit) return this.pickFromKit(e, d);
    if (!def.boss) {
      const atk = def.attacks[0];
      return d <= atk.trigger ? atk : null;
    }
    const A = def.attackByName;
    // The final boss's own attacks, by phase (see bossPhase).
    if (def.final) {
      const phase = e.phase || 1;
      if (phase >= 3 && A.collapse && !(e.collapseCd > 0) && d < 13 && this.rng() < 0.4) {
        e.collapseCd = 10;
        return A.collapse;
      }
      if (phase >= 2 && A.starfall && !(e.rainCd > 0) && this.rng() < 0.45) {
        e.rainCd = 7;
        return A.starfall;
      }
    }
    if (d <= A.combo1.trigger) {
      const comboChance = e.lastAtk === 'slam' ? 0.92 : 0.62;
      return this.rng() < comboChance ? A.combo1 : A.slam;
    }
    if (e.farT > 1.1) {
      // From range: a charge or a leap onto you as often as the fan of shots, so it cannot be kited.
      e.farT = 0;
      const r = this.rng();
      if (A.lunge && d > 7 && d < 16 && r < 0.35) return A.lunge;
      if (A.leap && d > 8 && r < 0.7) return A.leap;
      return A.fan;
    }
    return null;
  }

  /**
   * Kits (0.44): an enemy with more than one move picks among those it can use from where it stands.
   * Each move may say how far it reaches (trigger) and how close is too close (min), how long before
   * it comes again (cd), from which phase or below what health it is used (phase, hpBelow), and how
   * likely it is next to the others (weight). A move only ever used as another's follow-up (chain)
   * is never picked on its own.
   */
  pickFromKit(e, d) {
    const def = e.kitDef || e.def; // (0.45) the Unmade in New Game+ fights with your old class's moves
    const frac = e.hp / Math.max(1, e.maxHp);
    const phase = e.phase || 1;
    const cds = e.atkCds || (e.atkCds = {});
    let total = 0;
    const opts = [];
    for (const a of def.attacks) {
      if (def.chainOnly.has(a.name) || a.trigger < 0) continue;
      if (a.trigger != null && d > a.trigger) continue;
      if (a.min && d < a.min) continue;
      if (a.phase && phase < a.phase) continue;
      if (a.hpBelow && frac > a.hpBelow) continue;
      if (cds[a.name] > 0) continue;
      if (a.summon && this.enemies.filter((o) => o.summoner === e.id && !o.dead).length >= (a.summon.max || 4)) continue;
      const w = a.weight ?? 1;
      if (w <= 0) continue;
      opts.push(a);
      total += w;
    }
    if (!opts.length) return null;
    let r = this.rng() * total;
    for (const a of opts) {
      r -= a.weight ?? 1;
      if (r <= 0) return a;
    }
    return opts[opts.length - 1];
  }

  /** A boss says something (0.44): who it was, coming through. Not too often. */
  bossLine(e, key, force = false) {
    const lines = e.def.boss && BOSS_LINES[e.oldCls ? 'oldself' : e.type];
    const text = lines && lines[key];
    if (!text || (!force && e.voiceT > 0)) return;
    e.voiceT = 9;
    this.emit('bossLine', { id: e.id, type: e.type, name: e.def.name, key, text });
  }

  startWindup(e, atk, isChain) {
    const p = this.player;
    if (atk.cd) (e.atkCds || (e.atkCds = {}))[atk.name] = atk.cd;
    if (e.def.boss) {
      this.bossLine(e, atk.name);
      if (!e.saidLow && e.hp < e.maxHp * 0.25) {
        e.saidLow = true;
        this.bossLine(e, 'low', true);
      }
    }
    if (atk.blink) {
      // Storm Wraiths step through the air: it reappears beside you before it strikes.
      const ang = this.rng() * TAU;
      const c = this.clampToArena(p.x + dCos(ang) * atk.blink, p.z + dSin(ang) * atk.blink, e.radius);
      this.emit('blink', { id: e.id, x: e.x, z: e.z, tx: c.x, tz: c.z });
      e.x = e.px = c.x;
      e.z = e.pz = c.z;
    }
    e.state = 'windup';
    e.atk = atk;
    e.t = 0;
    e.dur = atk.windup * (e.enraged ? 0.82 : 1) * (e.swift ? 0.75 : 1);
    e.chaseT = 0;
    e.aim = dAtan2(p.z - e.z, p.x - e.x);
    e.facing = e.aim;
    e.moving = false;
    if (!isChain) this.lastWindupAt = this.time;
    if (atk.shape === 'call') {
      // a call to its own (no blow): nothing on the ground to dodge
      e.tele = null;
      this.emit('windup', { id: e.id, enemyType: e.type, attack: atk.name, parryable: false, call: true });
      return;
    }
    const tele = { id: this.nextId++, owner: e.id, foe: true, kind: atk.shape, x: e.x, z: e.z, dir: e.aim, t: 0, dur: e.dur, parryable: atk.parryable, cue: false };
    if (atk.shape === 'arc') {
      tele.range = atk.range;
      tele.angle = atk.angle;
    } else if (atk.shape === 'circle') {
      tele.radius = atk.radius;
      tele.offset = atk.offset;
      if (atk.at === 'target') {
        // (0.54) it opens under you, where you stand as it begins
        tele.x = e.atX = p.x;
        tele.z = e.atZ = p.z;
        tele.offset = 0;
      }
      if (atk.leap) {
        tele.leap = true; // drawn where it will land, on you
        e.leapX = p.x;
        e.leapZ = p.z;
      }
    } else if (atk.shape === 'rain') {
      tele.kind = 'circle';
      tele.radius = 1.4;
      tele.offset = 0;
    } else if (atk.shape === 'rect') {
      tele.length = atk.length;
      tele.width = atk.width;
    } else if (atk.shape === 'ring') {
      tele.radius = atk.radius;
      tele.inner = atk.inner;
      tele.offset = 0;
    } else if (atk.shape === 'beam') {
      // a still line of force; with cross, four of them from the enemy (each its own telegraph)
      tele.kind = 'rect';
      tele.length = atk.length;
      tele.width = atk.width;
      if (atk.cross) {
        e.teles = [1, 2, 3].map((k) => {
          const x = { ...tele, id: this.nextId++, turn: (k * Math.PI) / 2 };
          this.telegraphs.push(x);
          return x;
        });
      }
    } else if (atk.shape === 'shot') {
      if (atk.around) {
        tele.kind = 'ring';
        tele.radius = 4;
        tele.inner = 3.2;
        tele.offset = 0;
      } else if (atk.count > 1) {
        tele.kind = 'arc';
        tele.range = 13;
        tele.angle = atk.spread + 0.25;
      } else {
        tele.kind = 'rect';
        tele.length = 13;
        tele.width = 0.5;
      }
    }
    this.positionTelegraph(e, tele);
    this.telegraphs.push(tele);
    e.tele = tele;
    this.emit('windup', { id: e.id, enemyType: e.type, attack: atk.name, parryable: atk.parryable });
  }

  /** The final boss's falling stars: a warning circle each, then a hit on anyone still inside. */
  /** How much a Doom takes here (0 = bosses here do not cast it, except on the idle). */
  doomPct() {
    if (this.mode !== 'explore' || this.trial) return 0;
    if (this.map.id === 'rift' && this.rift) return DOOM.rift(this.rift.tier);
    return TIERS[this.worldTier()].doom || 0;
  }

  /** Bosses cast Doom on a timer (tier II+), and on any hero idle near them (every tier). */
  stepDoom(dt) {
    if (this.mode !== 'explore' || this.trial) return;
    const pct = this.doomPct();
    for (const e of this.enemies) {
      if (!e.def.boss || e.dead || e.state === 'spawn' || !e.aggro || e.returning) continue;
      const near = this.heroes.filter((h) => !h.player.dead && dist(h.player.x, h.player.z, e.x, e.z) <= DOOM.range);
      if (!near.length) continue;
      if (e.remnant) this.stepRemnant(e, near, dt); // each Remnant's own mechanic (0.31)
      if (e.def.herald && !e.remnant) this.stepHerald(e, dt); // the proclamation (0.40)
      // Idle heroes first: standing still with no input near a boss is never safe.
      for (const h of near) {
        if (h.player.idleT < DOOM.idle) continue;
        h.player.idleT = DOOM.idle - DOOM.idleAgain;
        // Each one in a row hits harder, until someone touches the keys again.
        const n = h.player.idleDooms = (h.player.idleDooms || 0) + 1;
        this.castDoom(e, h, Math.min(1, Math.max(DOOM.idlePct, pct) + DOOM.idleStep * (n - 1)), true);
      }
      if (!(pct > 0)) continue;
      if (e.doomT == null) e.doomT = DOOM.first;
      e.doomT -= dt;
      if (e.doomT > 0) continue;
      e.doomT = e.def.final ? DOOM.finalEvery : DOOM.every;
      // At the hero it is fighting (the nearest), and The Unmade follows with a second one.
      let h = near[0], hd = 1e9;
      for (const x of near) {
        const d = dist(x.player.x, x.player.z, e.x, e.z);
        if (d < hd) { hd = d; h = x; }
      }
      this.castDoom(e, h, pct, false);
      if (e.def.final) this.falls.push({ follow: h.pid, hero: h.pid, r: DOOM.radius, t: -DOOM.second, dur: DOOM.warn, dmg: 0, doom: pct, level: e.level, srcId: e.id, tele: null });
    }
  }

  castDoom(e, h, pct, idle) {
    this.falls.push({ x: h.player.x, z: h.player.z, r: DOOM.radius, t: 0, dur: DOOM.warn, dmg: 0, doom: pct, hero: h.pid, level: e.level, srcId: e.id, tele: null });
    this.emit('doomCast', { id: e.id, x: h.player.x, z: h.player.z, radius: DOOM.radius, pct, idle, hero: h.pid, name: e.def.name });
  }

  stepFalls(dt) {
    if (!this.falls.length) return;
    for (const f of this.falls) {
      f.t += dt;
      if (f.t < 0) continue;
      if (f.follow != null) {
        // The Unmade's second Doom: wherever that hero went.
        const h = this.heroByPid(f.follow);
        if (!h) { f.done = true; continue; }
        f.x = h.player.x;
        f.z = h.player.z;
        f.follow = null;
        this.emit('doomCast', { id: f.srcId, x: f.x, z: f.z, radius: f.r, pct: f.doom, idle: false, hero: h.pid });
      }
      if (!f.tele) {
        f.tele = { id: this.nextId++, owner: null, kind: 'circle', x: f.x, z: f.z, dir: 0, radius: f.r, offset: 0, t: 0, dur: f.dur, parryable: false, cue: false, doom: !!f.doom };
        this.telegraphs.push(f.tele);
      }
      f.tele.t = f.t;
      if (f.t < f.dur) continue;
      f.done = true;
      this.telegraphs = this.telegraphs.filter((x) => x !== f.tele);
      const src = this.enemyById(f.srcId);
      const was = this.cur;
      for (const h of this.heroes) {
        if (h.player.dead || dist(h.player.x, h.player.z, f.x, f.z) > f.r + h.player.radius * 0.4) {
          // The Unwished Crown: a Doom aimed at you that you got away from.
          if (f.doom && h.pid === f.hero && !h.player.dead && h.mods.unwished) {
            h.player.unwishedT = 6;
            this.emit('unwishedBoon', { x: h.player.x, z: h.player.z, hero: h.pid });
          }
          continue;
        }
        this.use(h);
        if (f.doom) this.hitPlayer(0, { doom: f.doom, src });
        else this.hitPlayer(f.dmg, src ? { parryable: false, src } : { parryable: false, proj: { level: f.level, srcId: f.srcId } });
      }
      this.use(was);
      if (f.doom) {
        this.emit('doomImpact', { x: f.x, z: f.z, radius: f.r });
        continue;
      }
      this.emit('strike', { id: f.srcId, shape: 'circle', x: f.x, z: f.z, radius: f.r, parryable: false, fx: f.fx || null });
      this.emit('starImpact', { x: f.x, z: f.z, radius: f.r, fx: f.fx || null });
      if (f.pool && src) this.addPool(src, f.x, f.z, f.pool);
    }
    this.falls = this.falls.filter((f) => !f.done);
  }

  positionTelegraph(e, tele) {
    if (e.teles) for (const x of e.teles) { x.x = e.x; x.z = e.z; x.dir = e.aim + x.turn; x.t = tele.t; x.cue = tele.cue; }
    if (tele.leap) {
      tele.x = e.leapX;
      tele.z = e.leapZ;
      tele.dir = e.aim;
      return;
    }
    const off = tele.offset || 0;
    tele.x = e.x + dCos(e.aim) * off;
    tele.z = e.z + dSin(e.aim) * off;
    tele.dir = e.aim;
  }

  removeTelegraph(e) {
    if (e.teles) {
      const xs = e.teles;
      e.teles = null;
      this.telegraphs = this.telegraphs.filter((x) => !xs.includes(x));
    }
    if (!e.tele) return;
    const t = e.tele;
    e.tele = null;
    this.telegraphs = this.telegraphs.filter((x) => x !== t);
  }

  resolveAttack(e, atk) {
    const p = this.player;
    this.removeTelegraph(e);
    e.cue = 0;
    const a = e.aim;
    let hit = false;

    if (atk.shape === 'arc') {
      const d = dist(p.x, p.z, e.x, e.z);
      const ap = dAtan2(p.z - e.z, p.x - e.x);
      hit = d <= atk.range + p.radius * 0.5 && (d < e.radius + p.radius || Math.abs(angDiff(ap, a)) <= atk.angle / 2 + 0.15);
      this.emit('strike', { id: e.id, shape: 'arc', x: e.x, z: e.z, dir: a, range: atk.range, angle: atk.angle, parryable: atk.parryable });
    } else if (atk.shape === 'rain') {
      const vx = (p.x - p.px) / CONFIG.TICK, vz = (p.z - p.pz) / CONFIG.TICK;
      const ld = dist(p.x, p.z, e.x, e.z);
      for (let i = 0; i < atk.count; i++) {
        let c;
        if (atk.line) {
          // in a line from the enemy toward you and past you, one after another (the Warden counting)
          const step = (ld + 4) / atk.count;
          c = this.clampToArena(e.x + dCos(a) * step * (i + 1), e.z + dSin(a) * step * (i + 1), 1);
        } else if (atk.scatter) {
          // all over the ground near the enemy (spore beds, tears)
          const ang = this.rng() * TAU, s = 2 + this.rng() * atk.scatter;
          c = this.clampToArena((i === 0 ? p.x : e.x) + dCos(ang) * (i === 0 ? 0 : s), (i === 0 ? p.z : e.z) + dSin(ang) * (i === 0 ? 0 : s), 1);
        } else {
          // on you and on where you are heading (Starfall)
          const lead = i * 0.35;
          const s = i === 0 ? 0 : 1 + this.rng() * 3;
          const ang = this.rng() * TAU;
          c = this.clampToArena(p.x + vx * lead + dCos(ang) * s, p.z + vz * lead + dSin(ang) * s, 1);
        }
        this.falls.push({ x: c.x, z: c.z, r: atk.radius, t: -i * atk.gap, dur: atk.fall, dmg: atk.dmg * e.dmgMult, level: e.level, srcId: e.id, tele: null, pool: atk.pool || null, fx: atk.fx || null });
      }
      this.emit('starfall', { id: e.id, x: e.x, z: e.z, fx: atk.fx || null });
    } else if (atk.shape === 'ring') {
      // A ring: safe close in, or out past it.
      const d = dist(p.x, p.z, e.x, e.z);
      hit = d > atk.inner - p.radius * 0.4 && d <= atk.radius + p.radius * 0.4;
      this.emit('strike', { id: e.id, shape: 'ring', x: e.x, z: e.z, radius: atk.radius, inner: atk.inner, parryable: atk.parryable, fx: atk.fx || null });
    } else if (atk.shape === 'beam') {
      const dirs = atk.cross ? [0, 1, 2, 3].map((k) => a + (k * Math.PI) / 2) : [a];
      for (const dir of dirs) {
        const along = (p.x - e.x) * dCos(dir) + (p.z - e.z) * dSin(dir);
        const across = Math.abs(-(p.x - e.x) * dSin(dir) + (p.z - e.z) * dCos(dir));
        if (along > -p.radius && along <= atk.length + p.radius && across <= atk.width / 2 + p.radius * 0.4) hit = true;
        this.emit('strike', { id: e.id, shape: 'beam', x: e.x, z: e.z, dir, length: atk.length, width: atk.width, parryable: atk.parryable, fx: atk.fx || null });
      }
    } else if (atk.shape === 'circle') {
      if (atk.leap) {
        const c = this.clampToArena(e.leapX, e.leapZ, e.radius);
        e.x = e.px = c.x; // it lands where the circle was
        e.z = e.pz = c.z;
        this.emit('bossLeap', { id: e.id, x: e.x, z: e.z, radius: atk.radius });
      }
      const cx = atk.at === 'target' ? e.atX : e.x + dCos(a) * atk.offset;
      const cz = atk.at === 'target' ? e.atZ : e.z + dSin(a) * atk.offset;
      hit = dist(p.x, p.z, cx, cz) <= atk.radius + p.radius * 0.4;
      this.emit('strike', { id: e.id, shape: 'circle', x: cx, z: cz, radius: atk.radius, parryable: atk.parryable, fx: atk.fx || null });
      if (atk.pool) this.addPool(e, cx, cz, atk.pool);
    } else if (atk.shape === 'rect') {
      e.state = 'charge';
      e.t = 0;
      e.dur = atk.chargeDur;
      e.chargeHit = false;
      this.emit('strike', { id: e.id, shape: 'rect', x: e.x, z: e.z, dir: a, parryable: false });
      return;
    } else if (atk.shape === 'shot') {
      for (let i = 0; i < atk.count; i++) {
        const off = atk.around ? (i / atk.count) * TAU : atk.count > 1 ? (i / (atk.count - 1) - 0.5) * atk.spread : 0;
        const pa = a + off;
        this.projectiles.push({
          id: this.nextId++,
          owner: 'enemy',
          srcId: e.id,
          x: e.x + dCos(pa) * (e.radius + 0.3),
          z: e.z + dSin(pa) * (e.radius + 0.3),
          px: e.x,
          pz: e.z,
          vx: dCos(pa) * atk.speed,
          vz: dSin(pa) * atk.speed,
          radius: 0.35,
          dmg: atk.dmg * e.dmgMult,
          level: e.level,
          parryable: atk.parryable,
          reflected: false,
          life: atk.life || 3,
          dead: false,
          seek: atk.seek || 0, // turns toward the hero this many radians a second (the Unmade's lullaby)
          pool: atk.pool || null, // leaves ground that hurts where it lands (fever, spores)
          fx: atk.fx || null,
          speed: atk.speed,
        });
      }
      this.emit('strike', { id: e.id, shape: 'shot', x: e.x, z: e.z, dir: a, parryable: atk.parryable, fx: atk.fx || null });
    }
    if (atk.summon) {
      // Calls its own to fight beside it (the Warden's men, the Mycelord's garden, the Unmade's people).
      const S = atk.summon;
      const live = this.enemies.filter((o) => o.summoner === e.id && !o.dead).length;
      for (let i = 0; i < Math.min(S.count, (S.max || 4) - live); i++) {
        const ang = this.rng() * TAU;
        const c = this.clampToArena(e.x + dCos(ang) * 3, e.z + dSin(ang) * 3, 1);
        const o = this.spawnEnemy(S.type, { x: c.x, z: c.z, level: e.level });
        o.x = o.px = c.x;
        o.z = o.pz = c.z;
        o.summoner = e.id;
        o.exp = 0;
        o.expValue = 0;
        o.goldValue = 0;
        o.noLoot = true;
        o.home = null;
        o.aggro = true;
        o.state = 'chase';
        this.emit('spawn', { id: o.id, x: c.x, z: c.z });
      }
    }
    if (atk.heal) {
      const back = Math.round(e.maxHp * atk.heal);
      e.hp = Math.min(e.maxHp, e.hp + back);
      this.emit('enemyHeal', { id: e.id, x: e.x, z: e.z, amount: back });
    }

    if (hit) {
      const res = this.hitPlayer(atk.dmg * e.dmgMult, { parryable: atk.parryable, src: e });
      if (atk.chill && res === 'hit') p.chillT = Math.max(p.chillT || 0, atk.chill);
      if (atk.seal && res === 'hit' && p.lastSlot) {
        // (0.54) Unasked, Forget, Enough: the last skill you used is sealed for a while
        p.sealSlot = p.lastSlot;
        p.sealT = atk.seal;
        this.emit('sealed', { slot: p.sealSlot, name: this.kit[p.sealSlot] ? this.kit[p.sealSlot].name : '', time: atk.seal, by: e.def.name });
      }
    }
    if (this.party && (atk.shape === 'arc' || atk.shape === 'circle')) {
      // Anyone else standing in it is hit too (and can parry it too).
      const target = this.cur;
      for (const h of this.heroes) {
        if (h === target || h.player.dead || e.dead || e.state === 'stunned') continue;
        const q = h.player;
        let also;
        if (atk.shape === 'arc') {
          const d = dist(q.x, q.z, e.x, e.z);
          also = d <= atk.range + q.radius * 0.5 && (d < e.radius + q.radius || Math.abs(angDiff(dAtan2(q.z - e.z, q.x - e.x), a)) <= atk.angle / 2 + 0.15);
        } else also = dist(q.x, q.z, e.x + dCos(a) * atk.offset, e.z + dSin(a) * atk.offset) <= atk.radius + q.radius * 0.4;
        if (also) this.as(h, () => this.hitPlayer(atk.dmg * e.dmgMult, { parryable: atk.parryable, src: e }));
      }
    }
    if (e.dead || e.state === 'stunned') return; // its guard was broken by the parry

    e.lastAtk = atk.name;
    if (atk.chain) {
      this.startWindup(e, (e.kitDef || e.def).attackByName[atk.chain], true);
    } else {
      e.state = 'recover';
      e.t = atk.recover;
      e.atkCd = e.def.atkCd[0] + this.rng() * (e.def.atkCd[1] - e.def.atkCd[0]);
    }
  }

  /** Parries fill an enemy's posture; when it reaches the enemy's poise, the enemy is stunned. */
  addPosture(e, amount, perfect) {
    if (e.dead || e.state === 'stunned') return;
    e.posture += amount;
    if (e.posture >= e.def.poise * (e.poiseMult || 1)) this.stun(e, e.def.parryStun * (perfect ? 1.25 : 1)); // (0.61) a party's boss is steadier
    else this.emit('postureHit', { id: e.id, x: e.x, z: e.z });
  }

  stun(e, duration) {
    if (e.dead) return;
    this.removeTelegraph(e);
    e.state = 'stunned';
    e.stunT = Math.max(e.stunT, duration);
    e.posture = 0;
    e.cue = 0;
    e.moving = false;
    this.emit('stagger', { id: e.id, x: e.x, z: e.z, duration });
  }

  hitEnemy(e, base, opts = {}) {
    if (e.dead) return;
    if (e.offerT > 0) return; // the Asker, waiting for your answer, cannot be hurt
    const p = this.player;
    let dmg = base;
    if (this.twist === 'glass') dmg *= 1.5; // (0.60) Glass Cannon
    if (p.wished && p.wished.power) dmg *= 1 + 0.4 * p.wished.power; // the Asker's power (0.40)
    if (p.edricT > 0) dmg *= 1 + 0.12 * (p.edricStacks || 0); // Edric's Sword (0.47)
    if (this.mods.bluetrim && p.hp > p.stats.maxHp * 0.7) dmg *= 1.18; // Edric's Colours (0.61.5: 18% above 70%)
    if (opts.basic && !opts.noTail && this.mods.tailwind > 0 && (p.rushT > 0 || p.hurricaneT > 0 || this.galeAlways())) {
      // Tailwind (Windrunner): on-hit damage (before the crit roll since 0.43, so it crits too), and the next roll comes sooner.
      dmg += p.stats.ad * this.mods.tailwind + 2 * p.level;
      if (p.cd.e > 0) p.cd.e = Math.max(0, p.cd.e - this.mods.tailwindCdr);
    }
    let crit = false;
    const chance = p.stats.crit + (opts.critBonus || 0);
    if (opts.canCrit !== false && (opts.forceCrit || this.rng() < chance / 100)) {
      dmg *= this.critMultiplier(opts.critBonus || 0);
      crit = true;
    }
    const stunned = e.state === 'stunned';
    let far = false;
    if (!opts.raw) {
      // (raw: already-final damage, like Second Death going off, is not scaled again)
      dmg *= this.gapScale(e.level).dealt;
      dmg *= classPower(this.cls, SPECS[p.spec] && SPECS[p.spec].cls === this.cls ? p.spec : null, p.level); // class power (0.51, balance.js)
      if (this.mods.farShot > 0 && !opts.dot) {
        // Long Watch (Sharpshooter): the further the target, the harder the hit.
        const bonus = Math.min(this.mods.farShotMax, Math.max(0, dist(p.x, p.z, e.x, e.z) - e.radius - 2) * this.mods.farShot);
        dmg *= 1 + bonus;
        far = bonus >= 0.25;
      }
      if (this.mods.lowHpDmg > 0 && p.hp < p.stats.maxHp * 0.5) dmg *= 1 + this.mods.lowHpDmg;
      if (stunned) dmg *= CONFIG.STUN_DAMAGE_BONUS;
      if (e.vulnT > 0) dmg *= 1 + e.vuln;
      if (e.exposedT > 0 && e.exposedPid === this.cur.pid) dmg *= 1.15;
      if (p.unwishedT > 0 && this.mods.unwished) dmg *= 1.25; // The Unwished Crown, after a Doom avoided
      const im = this.mods;
      // (0.61.5) Immortals that turn a situation into damage
      if (im.unwished && e.def.boss) dmg *= 1.12; // The Unwished Crown: against bosses
      if (im.missingDmg > 0) dmg *= 1 + Math.min(9 * im.missingDmg, im.missingDmg * Math.floor(Math.max(0, 1 - p.hp / p.stats.maxHp) * 10 + 1e-9)); // Crown of the Last Breath
      if (im.farDmg > 0 && p.farClear) dmg *= 1 + im.farDmg; // Rangekeeper's Coat
      if (im.rushDmg > 0 && p.rushT > 0) dmg *= 1 + im.rushDmg; // Quickstep Boots
      if (im.veilDmg > 0 && p.veilT > 0) dmg *= 1 + im.veilDmg; // Shadowweave
      if (im.burnRage > 0 && p.ashN > 0) dmg *= 1 + Math.min(0.24, p.ashN * im.burnRage); // Ashen Robe
      if (p.surgeT > 0 && p.surgeN > 0) dmg *= 1 + p.surgeN * (p.surgePer || 0); // Undying, Shroud of Last Rites, Rimeguard Mantle
      if (im.bloodQW > 0 && p.bloodied && (opts.source === 'q' || opts.source === 'w')) dmg *= 1 + im.bloodQW; // Bloodreaver
      if (opts.source === 'basic' || opts.source === 'q' || opts.source === 'w') {
        // (0.60.3) Red Embrace: a Bloodied Berserker hits far harder up close (more in Crimson Oath), the risk paid for
        const lv = this.bloodReach();
        if (lv && dist(p.x, p.z, e.x, e.z) - e.radius <= CONFIG.CRESCENT.closeAt) dmg *= 1 + CONFIG.CRESCENT.close[lv] + (im.closeExtra || 0); // (0.61.1) Blood Embrace
      }
      if (e.tauntT > 0 && e.tauntVuln > 0) dmg *= 1 + e.tauntVuln; // Wardbreaker (anyone's hits)
      if (im.qFar > 0 && opts.source === 'q' && dist(p.x, p.z, e.x, e.z) > 10) dmg *= 1 + im.qFar; // Bullseye Loop
      if (im.pctHp && !opts.dot && (opts.source === 'q' || opts.source === 'w' || opts.source === 'e' || opts.source === 'r')) {
        // Culling Edge (Assassin, 0.51): a share of its maximum health, most on enemies below your level;
        // capped for bosses, Storied enemies and Remnants by your attack damage
        const H = im.pctHp;
        const k = Math.min(1, Math.max(0, ((e.level || p.level) - p.level + H.span) / (2 * H.span)));
        let extra = e.maxHp * (H.max + (H.min - H.max) * k);
        if (e.def.boss || e.rare || e.remnant) extra = Math.min(extra, p.stats.ad * H.cap);
        dmg += extra;
      }
      if (e.ember > 0) {
        // Ember (0.54): short of what it needs, your blows barely land; below half, every one is 1
        const es = emberScale(this.ember(p), e.ember);
        dmg = es.one ? 1 : Math.max(1, dmg * es.dealt);
        if (es.one) opts = Object.assign({}, opts, { emberOne: true });
      }
    }
    if (crit && this.mods.stormcaller && this.cls === 'rogue' && (opts.source === 'q' || opts.source === 'w' || opts.source === 'r')) {
      // Nightfang: ability crits cut deeper and bring Nightstep back sooner.
      dmg *= 1.4;
      if (!(p.fangT > 0)) {
        p.cd.e = Math.max(0, p.cd.e - 1);
        p.fangT = 0.3;
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    if (this.mods.timekeeper && e.def.boss) {
      // The Timekeeper: every 4% of a boss's health taken away counts as a kill for cooldowns.
      p.tkAcc = (p.tkAcc || 0) + Math.min(dmg, Math.max(0, e.hp));
      const chunk = e.maxHp * 0.04;
      while (p.tkAcc >= chunk) {
        p.tkAcc -= chunk;
        for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - 0.5);
      }
    }
    if (e.mirrorT > 0) dmg *= 1.2; // a shattered mirror (Reflective, 0.42)
    if (e.shield > 0) {
      // Shielded elites: the shield takes it first.
      const soak = Math.min(e.shield, dmg);
      e.shield -= soak;
      dmg -= soak;
      if (e.shield <= 0) this.emit('shieldBreak', { id: e.id, x: e.x, z: e.z });
    }
    if (e.elite && e.elite.includes('reflective') && dmg > 0 && !(e.mirrorT > 0) && (opts.gale || ['q', 'w', 'e', 'r'].includes(opts.source))) {
      // Reflective (0.42): abilities (and Skirmish Step's gusts) crack the mirror; two cracks shatter it.
      e.mirrorCracks = (e.mirrorCracks || 0) + 1;
      if (e.mirrorCracks >= 2) this.shatterMirror(e);
      else this.emit('mirrorCrack', { id: e.id, x: e.x, z: e.z });
    }
    if (opts.basic && !opts.gale && e.elite && e.elite.includes('reflective') && !(e.mirrorT > 0) && !p.dead && dmg > 0) {
      // Reflective elites: a fifth of a basic attack comes back (abilities are safe). Never fatal.
      const back = Math.min(Math.round(dmg * 0.2), Math.floor(p.hp) - 1);
      if (back > 0) {
        p.hp -= back;
        this.emit('damage', { who: 'player', x: p.x, z: p.z, amount: back, reflected: true });
      }
    }
    if (e.markT > 0 && e.markPid === this.cur.pid && opts.source !== 'mark') e.markAcc += Math.min(dmg, Math.max(0, e.hp));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (e.def.thief && dmg > 0 && e.hp > 0) {
      // The Wishthief spills gold as it is hit.
      if (!e.fleeing) {
        e.fleeing = true;
        e.lifeT = THIEF.life;
        this.emit('thiefFlee', { id: e.id, x: e.x, z: e.z });
      }
      e.coinAcc += dmg;
      const step = e.maxHp * 0.1;
      while (e.coinAcc >= step) {
        e.coinAcc -= step;
        const gold = Math.max(1, Math.round(e.goldValue * THIEF.coins));
        p.gold += gold;
        this.emit('thiefCoins', { x: e.x, z: e.z, gold });
      }
    }
    if (e.home && !e.aggro && dist(e.x, e.z, e.home.x, e.home.z) < CONFIG.LEASH_RANGE) {
      e.aggro = true; // hitting a camp enemy wakes it up
      e.returning = false;
    }
    if (!p.dead && !opts.dot) {
      // Lifesteal: full from basic attacks, a third from abilities, capped (see CONFIG).
      let ls = Math.min(p.stats.lifesteal, CONFIG.LIFESTEAL_CAP) + (p.bloodied ? this.mods.bloodLeech : 0);
      if (!opts.basic) ls *= CONFIG.ABILITY_LIFESTEAL;
      if (p.frenzyT > 0) ls *= 2; // Crimson Oath
      let heal = (dmg * ls) / 100;
      // The budget (0.32): no more than LIFESTEAL_RATE of max health a second (twice that during Crimson Oath).
      const boost = p.frenzyT > 0 ? 2 : 1;
      heal = Math.min(heal, (p.lsPool || 0) * boost);
      p.lsPool = Math.max(0, (p.lsPool || 0) - heal / boost);
      // Blood Rage: while Bloodied, lifesteal stops just below half health, so it keeps you Bloodied.
      if (this.mods.bloodCap && p.bloodied) heal = Math.min(heal, Math.max(0, p.stats.maxHp * 0.495 - p.hp));
      if (heal > 0) this.healPlayer(heal, false);
    }
    this.emit('damage', { who: 'enemy', id: e.id, x: e.x, z: e.z, amount: dmg, crit, stunned, far, basic: !!opts.basic, dot: !!opts.dot });
    if (e.def.asker && e.hp > 0) this.askerCheck(e);
    if (e.def.final && e.hp > 0) {
      // The final boss fights in three phases: new attacks at two thirds and one third health.
      const phase = e.hp < e.maxHp / 3 ? 3 : e.hp < (2 * e.maxHp) / 3 ? 2 : 1;
      if (phase > (e.phase || 1)) {
        e.phase = phase;
        e.rainCd = 0;
        e.collapseCd = 2;
        this.emit('bossPhase', { id: e.id, phase, name: e.def.name, x: e.x, z: e.z });
        this.bossLine(e, 'phase' + phase, true);
      }
    }
    if (e.def.boss && !e.enraged && e.hp > 0 && e.hp < e.maxHp * 0.4) {
      e.enraged = true;
      this.emit('enrage', { id: e.id });
    }
    if (e.hp <= 0) this.killEnemy(e, opts.source);
  }

  killEnemy(e, source) {
    const p = this.player;
    const m = this.mods;
    e.hp = 0;
    e.dead = true;
    if (e.burnT > 0 && e.burnStacks > 0) {
      // Wildfire (Pyromancer): the burn jumps to the nearest enemies.
      const h = this.heroByPid(e.burnPid);
      const n = h ? (h === this.cur ? this.mods : h.mods).burnSpread : 0;
      if (h && n > 0) {
        const near = this.enemies.filter((o) => !o.dead && o !== e && o.state !== 'spawn' && dist(o.x, o.z, e.x, e.z) <= 5 + o.radius)
          .sort((a, b) => dist(a.x, a.z, e.x, e.z) - dist(b.x, b.z, e.x, e.z)).slice(0, n);
        if (near.length) this.as(h, () => {
          for (const o of near) {
            this.addBurn(o, e.burnStacks, true);
            this.emit('burnSpread', { x: e.x, z: e.z, tx: o.x, tz: o.z });
          }
        });
      }
    }
    this.removeTelegraph(e);
    this.stats.kills++;
    if (this.mode === 'explore') {
      for (const camp of this.camps) {
        for (const slot of camp.slots) {
          if (slot.id === e.id) {
            slot.id = null;
            slot.timer = slot.respawn;
            if (e.def.boss) this.campDown[camp.key] = this.ticks + Math.round(slot.respawn / CONFIG.TICK);
          }
        }
      }
    }
    if (source === 'q' && m.qResetOnKill && p.cd.q > 0) {
      p.cd.q = 0;
      this.emit('cdReset', { slot: 'q' });
    }
    if (source === 'e' && m.eResetOnKill && p.cd.e > 0) {
      p.cd.e = 0;
      this.emit('cdReset', { slot: 'e' });
    }
    if ((source === 'w' || source === 'r') && m[source + 'ResetOnKill'] && p.cd[source] > 0) {
      p.cd[source] = 0;
      this.emit('cdReset', { slot: source });
    }
    if (m.killReset && source !== 'bleed' && source !== 'burn' && source !== 'mark') {
      // Clean Kill (Assassin): a kill brings Q, W and E straight back (not R).
      for (const k of ['q', 'w', 'e']) {
        if (p.cd[k] > 0) {
          p.cd[k] = 0;
          this.emit('cdReset', { slot: k });
        }
      }
      if (m.killResetR > 0 && p.cd.r > 0) p.cd.r = Math.max(0, p.cd.r - m.killResetR);
      if (m.nightcutChain) p.nightcutT = 3; // Nightcut: the next Shadowstrike cuts a crowd
      if (m.killSurge > 0) this.addSurge(m.killSurge, 5, 6); // Shroud of Last Rites (0.61.5)
    }
    if (m.timekeeper) for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - 0.5);
    if (m.undying && dist(e.x, e.z, p.x, p.z) <= 8 + e.radius) this.addSurge(0.04, 10, 6); // Crown of the Undying (0.61.5)
    this.emit('death', { id: e.id, enemyType: e.type, x: e.x, z: e.z, boss: !!e.def.boss, elite: !!e.elite, remnant: e.remnant ? 1 : undefined, old: e.oldCls || undefined });
    if (e.def.boss) this.bossLine(e, 'death', true);
    if (e.def.asker) this.clearWishes();
    if (e.def.shatter) {
      // Glassbound (0.39): the glass gives way a moment after they fall.
      this.falls.push({ x: e.x, z: e.z, r: e.def.shatter.r, t: 0, dur: 1.0, dmg: (e.def.attacks[0].dmg || 10) * e.dmgMult * e.def.shatter.mult, level: e.level, srcId: e.id, tele: null });
    }
    if (e.elite && e.elite.includes('volatile')) {
      // Volatile elites burst a moment after they fall (uses the falling-star warning circles).
      this.falls.push({ x: e.x, z: e.z, r: 3.2, t: 0, dur: 1.2, dmg: (e.def.attacks[0].dmg || 10) * e.dmgMult * 2.5, level: e.level, srcId: e.id, tele: null });
    }
    if (this.mode === 'explore' && this.map.id === 'rift' && this.rift && !e.def.summon && !e.noLoot) this.riftKill(e);
    {
      // Whatever an enemy called up goes with it: a Remnant's shades and wish-stars, the Herald's
      // guards (0.40), and every boss's summons (0.44).
      // A Remnant's shades and wish-stars go with it (and the Herald's guards, 0.40).
      for (const o of this.enemies) {
        if (o.summoner !== e.id || o.dead) continue;
        o.dead = true;
        this.emit('death', { id: o.id, enemyType: o.type, x: o.x, z: o.z, boss: false, elite: false });
      }
    }
    if (e.noLoot) {
      // Called up by a boss (0.44): it pays nothing of its own.
      for (const h of this.heroes) if (h.player.targetId === e.id) h.player.targetId = null;
      return;
    }
    // Everyone in the party who is up and close by gets the rewards: their own gold,
    // their own loot roll, quest credit and a share of the EXP.
    const killer = this.cur;
    // A teammate who fell in the fight still shares in it; a boss is shared with the whole party on the map.
    const share = this.party ? this.heroes.filter((h) => h === killer || e.def.boss || dist(h.player.x, h.player.z, e.x, e.z) < CONFIG.PARTY_SHARE_RANGE) : [killer];
    for (const h of share) {
      this.use(h);
      this.killRewards(e, share.length);
    }
    this.use(killer);
    for (const h of this.heroes) if (h.player.targetId === e.id) h.player.targetId = null;
  }

  /**
   * A boss you have outgrown pays less: 10% less for every level you are above it, down to 10%
   * (first kills always pay in full). Rift guardians are your own level.
   */
  bossFalloff(e) {
    if (!e.def.boss || this.mode !== 'explore' || e.riftGuardian) return 1;
    if (!this.player.bossKills[e.type]) return 1;
    const over = this.player.level - (e.level || 1);
    return over <= 0 ? 1 : Math.max(CONFIG.BOSS_FALLOFF_MIN, 1 - CONFIG.BOSS_FALLOFF * over);
  }

  /** What the acting hero gets for a kill. */
  killRewards(e, partySize) {
    const p = this.player;
    if (this.mode === 'explore' && (p.idleT || 0) >= CONFIG.IDLE_NO_REWARD) {
      // Away from the keys: whatever your auto-attacks kill pays nothing until you are back.
      if (!p.idleWarned) {
        p.idleWarned = true;
        this.emit('idleNoReward', { secs: CONFIG.IDLE_NO_REWARD });
      }
      this.questEvent('kill', e);
      return;
    }
    p.idleWarned = false;
    if (this.mode === 'explore' && !this.trial && !e.def.summon) {
      // Bounties and fragments (0.33)
      if (!e.def.thief && !e.def.boss) this.bountyEvent('kill', { map: this.map.id });
      if (e.elite && !e.rare && !e.def.boss) this.bountyEvent('elite');
      if (e.rare) {
        this.bountyEvent('storied');
        this.giveMisc('fragment', FRAGMENTS.storied);
        if (this.rng() < SIGIL.storied) this.giveMisc('sigil', 1);
      }
      if (e.def.thief) {
        this.bountyEvent('thief');
        this.giveMisc('fragment', FRAGMENTS.thief);
      }
      if (e.remnant) {
        this.bountyEvent('remnant');
        this.giveMisc('fragment', FRAGMENTS.remnant);
      }
      if (e.depth && p.rebirth) {
        // Kindling (0.54): each Depth's own, up to +5 Ember for good (a Primordial always gives one)
        const K = DEEP.kindling, have = p.rebirth.kindling[e.depth] || 0;
        if (have < DEEP.kindlingMax && this.rng() < (e.def.boss ? K.boss : e.elite || e.rare ? K.elite : K.normal)) {
          p.rebirth.kindling[e.depth] = have + 1;
          this.emit('kindling', { depth: e.depth, n: have + 1, max: DEEP.kindlingMax, ember: this.ember(p), x: e.x, z: e.z });
        }
      }
      if (e.elite && !e.rare && !e.def.boss) {
        // Elite spoils (0.49): Wishdust, maybe a fragment, and once in a while the radiant chest it was guarding.
        const S = ELITE_SPOILS;
        const dust = this.keptRate(S.dust[0] + Math.floor(this.rng() * (S.dust[1] - S.dust[0] + 1)));
        p.dust += dust;
        const frag = this.rng() < S.fragment;
        if (frag) this.giveMisc('fragment', 1);
        const chest = !this.instanced() && this.rng() < S.chest;
        if (chest) this.addChestAt(e.x, e.z, 'radiant');
        this.emit('eliteSpoils', { x: e.x, z: e.z, dust, frag, chest });
      }
    }
    if (this.mode === 'explore' && !this.trial) {
      // Exploration surprises (0.29): Wishdust, and a shard from the Wishthief.
      if (e.def.thief) {
        p.tickets++;
        const td = this.keptRate(THIEF.dust);
        p.dust += td;
        p.thieves = (p.thieves || 0) + 1;
        if (this.rng() < GLASS.thief) this.giveMisc('glass', 1);
        this.emit('thiefCaught', { x: e.x, z: e.z, dust: td });
        if (p.thieves >= 10) this.unlockGlow('gold');
      } else if (e.rare) {
        const n = this.keptRate(RARE.dust[0] + Math.floor(this.rng() * (RARE.dust[1] - RARE.dust[0] + 1)));
        p.dust += n;
        this.emit('rareSlain', { name: e.rare, x: e.x, z: e.z, dust: n });
        if (this.rng() < GLASS.storied) this.giveMisc('glass', 1);
      } else if (e.remnant) {
        const rd = this.keptRate(REMNANT.dust);
        p.dust += rd;
        this.emit('remnantSlain', { name: remnantName(e.def), x: e.x, z: e.z, dust: rd });
        if (REMNANT_GLOW[e.type] && this.rng() < REMNANT.glow) this.unlockGlow(REMNANT_GLOW[e.type]);
        if (this.rng() < GLASS.remnant) this.giveMisc('glass', 1);
      }
      if (e.type === 'boss3' && e.def.boss && !e.riftGuardian && this.worldTier() >= 5) this.unlockGlow('star');
    }
    const fall = this.bossFalloff(e);
    p.gold += Math.round(e.goldValue * fall * (1 + 0.1 * perkRank(p.rebirth, 'fortune'))); // Fortune (Rebirth)
    if (this.mode === 'explore' && (e.def.heavy || this.rng() < CONFIG.TICKET_CHANCE)) {
      p.tickets++;
      this.emit('ticket', { x: e.x, z: e.z });
    }
    if (e.def.boss) {
      if (this.mode === 'arena') {
        if (!this.trial) {
          // (The Weekly Echo's build is fixed for the run: no skill point or key there.)
          p.keys++;
          p.skillPoints++; // bosses out in the world can be farmed, so they pay in loot instead
          this.emit('bossReward');
        }
      } else if (!e.riftGuardian) this.bossRewards(e, fall);
    }
    const band = levelBandMult((e.level || p.level) - p.level); // near your level pays most (0.49)
    if (band <= 4 && !e.def.boss) this.emit('farLevel', { gap: (e.level || p.level) - p.level });
    this.gainExp(e.expValue * fall * band * (partySize > 1 ? CONFIG.PARTY_EXP : 1));
    this.dropLoot(e, fall);
    if (e.def.boss && this.mode === 'explore' && !e.riftGuardian && this.worldTier() >= 2 && !this.trial) {
      // A streak: tier bosses beaten without being knocked out in between drop more.
      if (p.streak < CONFIG.STREAK_MAX) {
        p.streak++;
        this.emit('streak', { n: p.streak, pct: Math.round(p.streak * CONFIG.STREAK_LOOT * 100) });
      }
    }
    this.questEvent('kill', e);
  }

  stepEnemies(dt) {
    const party = this.party;
    let p = this.player;
    for (const e of this.enemies) {
      if (party && !e.dead) {
        this.use(this.targetFor(e));
        p = this.player;
      }
      e.px = e.x;
      e.pz = e.z;
      e.moving = false;
      if (e.dead) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.offerT > 0) {
        // The Asker waits for your answer (0.40); whoever has not answered when time runs out has refused.
        e.offerT -= dt;
        if (e.offerT <= 0) {
          e.offerT = 1e-9; // (still open while the silent refuse)
          for (const pid of [...(e.offerTo || [])]) {
            const h = this.heroes.find((x) => x.pid === pid);
            if (h) this.as(h, () => this.askerAnswer('none'));
          }
          e.offerT = 0;
          e.offerTo = null;
          this.emit('askerResume', { id: e.id });
        }
        continue;
      }
      if (e.mirrorT > 0) e.mirrorT = Math.max(0, e.mirrorT - dt);
      if (e.wishedT > 0) {
        // Given what it wanted by a Wishling (0.39): stronger for a while.
        e.wishedT -= dt;
        if (e.wishedT <= 0) e.dmgMult /= e.wishedMult || 1;
      }
      if (e.def.grants && e.state !== 'spawn') {
        e.grantT = (e.grantT ?? e.def.grants.every * 0.5) - dt;
        if (e.grantT <= 0) {
          e.grantT = e.def.grants.every;
          const g = e.def.grants;
          let best = null, bd = g.range;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.def.grants || o.wishedT > 0 || o.state === 'spawn') continue;
            const d = dist(o.x, o.z, e.x, e.z);
            if (d < bd) [best, bd] = [o, d];
          }
          if (best) {
            best.wishedT = g.time;
            best.wishedMult = g.dmg;
            best.dmgMult *= g.dmg;
            this.emit('wished', { id: best.id, from: e.id, x: e.x, z: e.z, tx: best.x, tz: best.z });
          }
        }
      }
      if (e.vulnT > 0) e.vulnT -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.tauntT > 0) e.tauntT -= dt;
      if (e.exposedT > 0) e.exposedT -= dt;
      if (e.markT > 0) {
        e.markT -= dt;
        if (e.markT <= 0) {
          this.popMark(e);
          if (e.dead) continue;
        }
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnAcc = (e.burnAcc || 0) + dt;
        if (e.burnAcc >= 0.5) {
          e.burnAcc -= 0.5;
          const h = this.heroByPid(e.burnPid) || this.heroes[0];
          // Roaring (0.56.3): a burn gets hotter as it piles up, every stack burning more the fuller it is.
          const roar = 1 + CONFIG.BURN.roar * Math.min(1, e.burnStacks / (e.burnCap || 50));
          const amount = e.burnDps * e.burnStacks * roar * 0.5 * (e.smoulderT > 0 ? 1 + e.smoulderAmp : 1);
          // Searing (0.43): a Pyromancer's burns can crit
          this.as(h, () => this.hitEnemy(e, amount, { canCrit: !!this.mods.burnCrit, source: 'burn', dot: true, burn: true }));
          if (e.dead) continue;
        }
        if (e.burnT <= 0) e.burnStacks = 0;
      }
      if (e.smoulderT > 0) e.smoulderT -= dt;
      if (e.frostT > 0) {
        e.frostT -= dt;
        if (e.frostT <= 0) e.frostStacks = 0;
      }
      if (e.frostLock > 0) e.frostLock -= dt;
      if (e.atkCds) for (const k in e.atkCds) if (e.atkCds[k] > 0) e.atkCds[k] -= dt; // each move's own cooldown (0.44)
      if (e.voiceT > 0) e.voiceT -= dt;
      if (e.freezeWait > 0) e.freezeWait -= dt;
      if (e.brittle && !(e.vulnT > 0)) e.brittle = false;
      if (e.bleedT > 0) {
        e.bleedT -= dt;
        e.bleedAcc += dt;
        if (e.bleedAcc >= 0.5) {
          e.bleedAcc -= 0.5;
          this.hitEnemy(e, e.bleedDps * 0.5, { canCrit: false, source: 'bleed', dot: true });
          if (e.dead) continue;
        }
      }
      if (e.kx || e.kz) {
        e.x += e.kx * dt;
        e.z += e.kz * dt;
        const f = dExp(-9 * dt);
        e.kx *= f;
        e.kz *= f;
        if (Math.abs(e.kx) + Math.abs(e.kz) < 0.2) e.kx = e.kz = 0;
      }
      if (e.def.thief) {
        this.stepThief(e, dt);
        continue;
      }
      if (e.def.still) {
        this.stepStill(e, dt);
        continue;
      }
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = dHypot(dx, dz) || 0.001;
      const toPlayer = dAtan2(dz, dx);

      if (e.home && e.aggro && e.state !== 'chase' && e.state !== 'spawn') this.drainPatience(e, dist(e.x, e.z, e.home.x, e.home.z), dt);
      switch (e.state) {
        case 'spawn':
          e.t -= dt;
          if (e.t <= 0) e.state = 'chase';
          break;

        case 'stunned':
          e.stunT -= dt;
          if (e.stunT <= 0) {
            e.stunT = 0;
            e.state = 'recover';
            e.t = 0.35;
          }
          break;

        case 'recover':
          e.t -= dt;
          e.facing = turnToward(e.facing, toPlayer, 3 * dt);
          if (e.t <= 0) e.state = 'chase';
          break;

        case 'chase': {
          if (e.home && !this.stepLeash(e, d, dt)) break;
          e.facing = turnToward(e.facing, toPlayer, 7 * dt);
          e.atkCd -= dt;
          if (p.dead) break;
          if (e.def.boss) {
            e.farT = d > 5.5 ? e.farT + dt : 0;
            if (e.rainCd > 0) e.rainCd -= dt;
            if (e.collapseCd > 0) e.collapseCd -= dt;
          }
          if (e.atkCd <= 0) {
            const atk = this.chooseAttack(e, d);
            if (atk && this.canStartAttack(e)) {
              this.startWindup(e, atk, false);
              break;
            }
          }
          let mx = 0;
          let mz = 0;
          let sp = e.def.speed * (e.slowT > 0 ? 1 - e.slow : 1) * (e.swift ? 1.4 : 1);
          if (e.def.ai === 'ranged') {
            const [min, max] = e.def.band;
            if (d > max) {
              mx = dx / d;
              mz = dz / d;
            } else if (d < min) {
              mx = -dx / d;
              mz = -dz / d;
              sp *= 0.8;
            } else {
              e.strafeT -= dt;
              if (e.strafeT <= 0) {
                e.strafe *= -1;
                e.strafeT = 1.5 + this.rng() * 2;
              }
              mx = (-dz / d) * e.strafe;
              mz = (dx / d) * e.strafe;
              sp *= 0.45;
            }
          } else {
            const stop = e.def.attacks[0].trigger * 0.8;
            if (d > stop) {
              mx = dx / d;
              mz = dz / d;
              // Close but cannot catch you: speed up the longer the chase goes on.
              if (d < 14) e.chaseT += dt;
              sp *= 1 + Math.min(CONFIG.CHASE_RAMP_MAX, Math.max(0, e.chaseT - CONFIG.CHASE_RAMP_DELAY) * CONFIG.CHASE_RAMP_RATE);
            }
          }
          if (mx || mz) {
            e.x += mx * sp * dt;
            e.z += mz * sp * dt;
            e.moving = true;
          }
          break;
        }

        case 'windup': {
          const atk = e.atk;
          e.t += dt;
          const remain = e.dur - e.t;
          if (remain > atk.lockAt) e.aim = turnToward(e.aim, toPlayer, 5 * dt);
          e.facing = e.aim;
          if (atk.leap && remain > atk.lockAt) {
            // The landing spot follows you until the last moment.
            const c = this.clampToArena(p.x, p.z, e.radius);
            e.leapX = c.x;
            e.leapZ = c.z;
          }
          if (atk.pull) {
            // Collapse: everything near is dragged in toward the coming burst. Dash out!
            for (const h of this.heroes) {
              const hp = h.player;
              if (hp.dead || hp.dash || hp.leap) continue;
              const dd = dist(hp.x, hp.z, e.x, e.z);
              if (dd > 16 || dd < e.radius + 0.6) continue;
              hp.x += ((e.x - hp.x) / dd) * atk.pull * dt;
              hp.z += ((e.z - hp.z) / dd) * atk.pull * dt;
            }
          }
          if (e.tele) {
            this.positionTelegraph(e, e.tele);
            e.tele.t = e.t;
            e.tele.cue = remain <= CONFIG.PARRY_CUE_LEAD;
          }
          e.cue = remain <= CONFIG.PARRY_CUE_LEAD ? 1 : 0;
          if (remain <= 0) this.resolveAttack(e, atk);
          break;
        }

        case 'charge': {
          const atk = e.atk;
          e.t += dt;
          const sp = atk.length / atk.chargeDur;
          e.x += dCos(e.aim) * sp * dt;
          e.z += dSin(e.aim) * sp * dt;
          e.moving = true;
          if (!e.chargeHit && d < e.radius + p.radius + 0.45) {
            e.chargeHit = true;
            this.hitPlayer(atk.dmg * e.dmgMult, { parryable: false, src: e });
          }
          const edge = dHypot(e.x, e.z) > this.radius - e.radius;
          if (e.t >= e.dur || edge) {
            e.state = 'recover';
            e.t = atk.recover;
            e.atkCd = e.def.atkCd[0] + this.rng() * (e.def.atkCd[1] - e.def.atkCd[0]);
          }
          break;
        }
      }
    }

    // Keep bodies from overlapping.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = dHypot(dx, dz) || 0.001;
        const overlap = a.radius + b.radius - d;
        if (overlap > 0) {
          const wa = a.def.heavy ? 0.15 : 0.5;
          const wb = b.def.heavy ? 0.15 : 0.5;
          const total = wa + wb;
          a.x -= (dx / d) * overlap * (wa / total);
          a.z -= (dz / d) * overlap * (wa / total);
          b.x += (dx / d) * overlap * (wb / total);
          b.z += (dz / d) * overlap * (wb / total);
        }
      }
      if (!p.dead && !p.dash && !p.leap && a.state !== 'charge') {
        const dx = a.x - p.x;
        const dz = a.z - p.z;
        const d = dHypot(dx, dz) || 0.001;
        const overlap = a.radius + p.radius - d;
        if (overlap > 0) {
          if (a.def.heavy) {
            const c = this.clampToArena(p.x - (dx / d) * overlap, p.z - (dz / d) * overlap, p.radius);
            p.x = c.x;
            p.z = c.z;
          } else {
            a.x += (dx / d) * overlap;
            a.z += (dz / d) * overlap;
          }
        }
      }
      const c = this.clampToArena(a.x, a.z, a.radius);
      a.x = c.x;
      a.z = c.z;
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // =========================================================================
  // Projectiles
  // =========================================================================
  /** @param dt normal step  @param edt step for enemy projectiles (shorter while time is slowed) */
  stepProjectiles(dt, edt) {
    let p = this.player;
    const party = this.party;
    for (const pr of this.projectiles) {
      if (party && pr.owner !== 'enemy') {
        this.use(this.heroByPid(pr.pid ?? 0) || this.heroes[0]); // its damage uses its owner's stats
        p = this.player;
      }
      const d = pr.owner === 'enemy' ? edt : dt;
      if (pr.kind === 'orb') {
        this.stepOrb(pr, d);
        continue;
      }
      if (pr.kind === 'kunai') {
        this.stepKunai(pr, d);
        continue;
      }
      if (pr.targetId != null) {
        // Basic-attack shots curve toward their target so they do not miss.
        const t = this.enemyById(pr.targetId);
        if (t) {
          let a = dAtan2(t.z - pr.z, t.x - pr.x);
          if (pr.arc > 0) {
            // (0.60.2) Hurricane's arrows swing round to it, turning harder the longer they fly
            a = turnToward(dAtan2(pr.vz, pr.vx), a, pr.arc * d);
            pr.arc += 9 * d;
          }
          pr.vx = dCos(a) * pr.speed;
          pr.vz = dSin(a) * pr.speed;
        }
      }
      if (pr.seek > 0 && pr.owner === 'enemy' && !pr.reflected) {
        // a seeking shot leans toward the nearest hero
        let tgt = null, td = 1e9;
        for (const h of this.heroes) { if (h.player.dead) continue; const dd = dist(h.player.x, h.player.z, pr.x, pr.z); if (dd < td) { td = dd; tgt = h.player; } }
        if (tgt) {
          const cur = dAtan2(pr.vz, pr.vx);
          const na = turnToward(cur, dAtan2(tgt.z - pr.z, tgt.x - pr.x), pr.seek * d);
          pr.vx = dCos(na) * pr.speed;
          pr.vz = dSin(na) * pr.speed;
        }
      }
      pr.px = pr.x;
      pr.pz = pr.z;
      pr.x += pr.vx * d;
      pr.z += pr.vz * d;
      pr.life -= d;
      if (pr.life <= 0 || dHypot(pr.x, pr.z) > this.radius + 4) {
        pr.dead = true;
        if (pr.pool && pr.owner === 'enemy') this.addPool(this.enemyById(pr.srcId), pr.x, pr.z, pr.pool);
        continue;
      }
      if (pr.owner === 'enemy' && this.walls.length) {
        const wl = this.walls.find((x) => this.wallDist(x, pr.x, pr.z) <= pr.radius);
        if (wl) {
          // Rimewall: the shot flies back, belonging to the Frostbinder who raised the wall.
          const h = this.heroByPid(wl.pid) || this.heroes[0];
          const nx = -dSin(wl.rot), nz = dCos(wl.rot); // the wall's face
          const dot = pr.vx * nx + pr.vz * nz;
          pr.vx = (pr.vx - 2 * dot * nx) * 1.5;
          pr.vz = (pr.vz - 2 * dot * nz) * 1.5;
          pr.x += pr.vx * d;
          pr.z += pr.vz * d;
          pr.owner = 'player';
          pr.reflected = true;
          pr.walled = true;
          pr.pid = h.pid;
          pr.life = 3;
          pr.dmg = pr.dmg * 2.5 + h.player.stats.ad;
          this.emit('reflect', { x: pr.x, z: pr.z });
          continue;
        }
      }
      if (pr.owner === 'enemy') {
        if (party) {
          // Whoever it reaches first.
          const h = this.heroes.find((x) => !x.player.dead && dist(pr.x, pr.z, x.player.x, x.player.z) < pr.radius + x.player.radius);
          if (h) {
            this.use(h);
            p = this.player;
          }
        }
        if (!pr.spent && !p.dead && dist(pr.x, pr.z, p.x, p.z) < pr.radius + p.radius) {
          const res = this.hitPlayer(pr.dmg, { parryable: pr.parryable, src: this.enemyById(pr.srcId), proj: pr });
          if (res === 'parried') {
            this.emit('reflect', { x: pr.x, z: pr.z });
          }
          else if (res === 'dodged') pr.spent = true;
          else {
            pr.dead = true;
            if (pr.pool) this.addPool(this.enemyById(pr.srcId), pr.x, pr.z, pr.pool);
          }
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(pr.x, pr.z, e.x, e.z) < pr.radius + e.radius) {
            if (pr.pierce) {
              // Farsight: a piercing shot hits each enemy in its path once, and keeps going.
              if (pr.pierce.includes(e.id)) continue;
              pr.pierce.push(e.id);
              pr.targetId = null;
            } else pr.dead = true;
            if (pr.kind) {
              // The hero's own shot: an arrow, a spark or a fire bolt.
              if (pr.bleed > 0) {
                e.bleedT = 3;
                e.bleedDps = (p.stats.ad * pr.bleed) / 3;
                e.bleedFire = this.cls === 'mage'; // a mage's Ignite burns rather than bleeds
              }
              if (pr.slot === 'q' && this.mods.qBurn > 0 && !e.dead) this.addBurn(e, this.mods.qBurn); // Everything Burns
              if (pr.basic && this.mods.basicBurn > 0 && !e.dead) this.addBurn(e, this.mods.basicBurn);
              this.hitEnemy(e, pr.dmg, { basic: !!pr.basic, noTail: !!pr.noTail, gale: !!pr.gale, source: pr.basic ? 'basic' : pr.slot, forceCrit: pr.forceCrit, critBonus: pr.critBonus || 0 });
              const m = this.mods;
              if (m.frostMax > 0 && !e.dead) {
                // Hoarfrost (Frostbinder)
                const n = pr.basic ? m.basicFrost : pr.kind === 'mote' ? m.moteFrost : pr.slot === 'q' && pr.ice ? m.qFrost : 0;
                if (n > 0) this.addFrost(e, n);
              }
              if (pr.splash) {
                for (const o of this.enemies) {
                  if (o === e || o.dead || o.state === 'spawn') continue;
                  if (dist(o.x, o.z, pr.x, pr.z) > pr.splash + o.radius) continue;
                  if (pr.slot === 'q' && this.mods.qBurn > 0) this.addBurn(o, 1);
                  this.hitEnemy(o, pr.dmg * pr.splashMult, { source: pr.slot });
                  if (pr.ice && m.frostMax > 0 && !o.dead) this.addFrost(o, m.qSplashFrost || 1);
                }
                this.emit('burst', { x: pr.x, z: pr.z, radius: pr.splash, ice: !!pr.ice });
              }
            } else {
              // An enemy projectile you parried back (or a Rimewall threw back).
              this.hitEnemy(e, pr.dmg, { canCrit: false });
              if (pr.walled && this.mods.frostMax > 0 && !e.dead) this.addFrost(e, this.mods.frostMax);
              if (!e.dead) {
                if (e.def.boss) this.addPosture(e, 1, false);
                else this.stun(e, 1.2);
              }
            }
            break;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  // =========================================================================
  // Waves
  // =========================================================================
  startWave() {
    const w = this.wave;
    w.n++;
    w.queue = buildWave(w.n, this.streamRng('wave', w.n));
    if (this.twist === 'swarm') {
      // (0.60) Swarm: a third more of the floor's own kinds (never another boss), each a quarter weaker (enemyScale)
      const small = w.queue.filter((t) => !(ENEMIES[t] && ENEMIES[t].boss));
      for (let i = 0; i < Math.ceil(small.length / 3); i++) w.queue.push(small[i % small.length]);
    }
    w.total = w.queue.length;
    w.phase = 'active';
    w.spawnT = 0;
    w.maxAlive = Math.min(10, 5 + Math.floor(w.n / 2));
    w.hurt = false; // any hero hurt on this floor (no Flawless bonus)
    w.startTick = this.ticks;
    this.player.undyingUsed = false;
    const boss = w.n % CONFIG.BOSS_EVERY === 0;
    this.emit('waveStart', { n: w.n, boss, bossName: boss ? ENEMIES[w.queue[0]].name : '' });
  }

  stepWave(dt) {
    const w = this.wave;
    const p = this.player;
    if (p.dead) return;
    if (w.phase === 'intermission') {
      if (this.offer) return; // the next wave waits for the augment pick
      if (this.ring && this.ring.hold) return; // (0.59) ...and, after a boss, for you to take the spoils home or push on
      w.timer -= dt;
      if (w.timer <= 0) this.startWave();
      return;
    }
    w.spawnT -= dt;
    if (w.queue.length && this.enemies.length < w.maxAlive && w.spawnT <= 0) {
      this.spawnEnemy(w.queue.shift());
      w.spawnT = 0.35; // (0.62) a quicker trickle: the floor fills faster (was 0.55 s)
    }
    if (!w.queue.length && this.enemies.length === 0) {
      w.cleared = w.n;
      this.clearTick = this.ticks; // Weekly Echo tie-break: how soon this floor fell
      w.phase = 'intermission';
      w.timer = CONFIG.INTERMISSION;
      this.bestWave = Math.max(this.bestWave, w.n);
      this.projectiles = [];
      this.healPlayer(p.stats.maxHp * (this.twist === 'dry' ? 1 : CONFIG.WAVE_CLEAR_HEAL), true); // (0.60) Dry Spell: a full heal
      p.potions = Math.min(CONFIG.MAX_POTIONS, p.potions + 1);
      for (const l of this.loot) l.magnet = true;
      const boss = w.n % CONFIG.BOSS_EVERY === 0;
      const base = 10 + 4 * w.n + (boss ? 80 : 0);
      // Skill bonuses: Flawless (nobody took damage) and Swift (cleared under par time).
      const secs = (this.ticks - (w.startTick || this.ticks)) * CONFIG.TICK;
      const par = boss ? CONFIG.PAR_BOSS : CONFIG.PAR_BASE + CONFIG.PAR_PER_ENEMY * w.total;
      const flawless = !w.hurt;
      const swift = secs <= par;
      const gold = base + (flawless ? base : 0) + (swift ? Math.round(base * 0.5) : 0);
      for (const h of this.heroes) {
        const was = this.cur;
        this.use(h);
        this.player.gold += gold;
        if (flawless) {
          this.player.potions = Math.min(CONFIG.MAX_POTIONS, this.player.potions + 1);
          this.rerolls++;
        }
        this.use(was);
      }
      this.emit('waveClear', { n: w.n, boss, gold, flawless, swift, secs: Math.round(secs), par: Math.round(par) });
      if (this.ring) {
        // (0.59) the run's spoils grow; after a boss they are safe, and you may take them home
        const r = this.ring;
        r.pot += ringGain(r, w.n, boss, this.player.level);
        r.wave = w.n;
        if (boss) r.hold = true; // the next wave waits: take it all home, or push on
        this.emit('ringGain', { n: w.n, boss, kind: r.kind, pot: ringWhole(r.pot) });
      }
      this.questEvent('wave', w.n);
      // Augments: a pick after every odd wave, and a stronger one after every boss.
      if (w.n % 2 === 1 || boss || this.twist === 'draft') this.makeOffer(boss); // (0.60) Deep Draft: every floor
    }
  }

  // =========================================================================
  // Exploration
  // =========================================================================
inTown() {
    return this.mode === 'explore' && this.map.safe;
  }

  /** Where the hero is, for the HUD. */
  zone() {
    const m = this.map;
    const r = this.rift;
    if (m.id === 'rift' && r) {
      const clock = `${Math.floor(r.timeLeft / 60)}:${String(Math.floor(r.timeLeft % 60)).padStart(2, '0')}`;
      const sub = r.state === 'done' ? (r.won ? 'cleared · H or the portal to go home' : 'finished · H or the portal to go home') : r.state === 'guardian' ? `the guardian has come · ${clock}` : r.state === 'late' ? 'out of time · you can still finish it' : `${Math.min(100, Math.floor((100 * r.progress) / r.need))}% · ${clock}`;
      return { name: `Echo Rift · Tier ${r.tier}`, sub };
    }
    const dn = this.depthNow();
    if (dn) return { name: m.name, sub: `Depth ${DEEP.depths[dn].numeral} · Ember ${this.ember()} of ${DEEP.depths[dn].ember}` }; // (0.54)
    const tier = this.worldTier();
    if (tier >= 2 && !m.safe) return { name: m.name, sub: `Tier ${TIERS[tier].numeral} · ${TIERS[tier].name} · enemy level ${CONFIG.MAX_LEVEL}` };
    if (this.portalOn && this.portalArmed) return { name: m.name, sub: `travelling to ${this.portalOn.name}…` };
    if (m.safe) return { name: m.name, sub: 'safe · you heal here' };
    return { name: m.name, sub: m.level === m.levelMax ? `enemy level ${m.level}` : `enemy levels ${m.level} to ${m.levelMax}` };
  }

  /**
   * Switch to another exploration map. `from` is the map you came from, so you
   * arrive at the portal that leads back to it (or in the middle if there is none).
   */
  loadMap(id, from = null) {
    this.clearWishes(); // the Asker's wishes stay in the Starwell (0.40)
    if (this.map && this.mode === 'explore' && !this.trial && !this.instanced()) this.chestMaps[this.map.id] = { chests: this.chests, refill: this.chestRefill || [] };
    if (id !== 'rift' && this.rift) {
      // Leaving an Echo Rift ends it.
      if (this.rift.state !== 'done') this.emit('riftEnd', { tier: this.rift.tier, won: false });
      this.rift = null;
    }
    if (id !== 'delve' && this.delve) this.delve = null; // leaving a delve ends it (0.46)
    const map = (this.map = id === 'rift' && this.rift ? buildRiftMap(this.rift.theme, this.rift.seed) : id === 'delve' && this.delve ? buildDelveRoom(this.delve.route[this.delve.room], this.delve.seed + this.delve.room) : buildMap(id));
    const actor = this.cur;
    const p = this.player;
    this.radius = map.radius;
    if (id === 'town' && !this.travelHook) map.obstacles = map.obstacles.filter((o) => o.kind !== 'npc' || this.npcHere(o.id)); // (0.45) Tomas, after; (0.58.1) on the server, each player's game shows its own
    if (this.mode === 'explore' && !this.trial) this.sideStoryProps(map);
    this.edricHere = false;
    this.obstacles = map.obstacles;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.telegraphs = [];
    this.zones = [];
    this.shadows = [];
    this.walls = [];
    this.delayed = [];
    this.falls = []; // the final boss's falling stars (stepFalls)
    this.slowT = 0;
    const gate = map.portals.find((g) => g.to === from);
    const k = gate ? 1 - 5.5 / dHypot(gate.x, gate.z) : 0; // a few steps inside the portal
    p.x = p.px = gate ? gate.x * k : 0;
    p.z = p.pz = gate ? gate.z * k : 0;
    if (gate) p.facing = dAtan2(-gate.z, -gate.x);
    p.moveTarget = null;
    p.targetId = null;
    p.dash = null;
    p.leap = null;
    p.atkWind = 0;
    const arrive = (q, i) => {
      // The party arrives in a little cluster.
      const a = (i / Math.max(1, this.heroes.length)) * TAU;
      q.x = q.px = p.x + (i ? dCos(a) * 1.6 : 0);
      q.z = q.pz = p.z + (i ? dSin(a) * 1.6 : 0);
      q.facing = p.facing;
      q.moveTarget = null;
      q.targetId = null;
      q.dash = null;
      q.leap = null;
      q.atkWind = 0;
      if (i) this.pushOut(q, q.radius);
      this.portalT = 0;
      this.portalOn = null;
      this.portalArmed = false; // must step off the arrival portal before it works again
      this.wayT = 0;
      this.wayArmed = false;
      if (!q.visited.includes(map.id) && map.id !== 'rift') {
        q.visited.push(map.id);
        this.emit('discovered', { id: map.id, name: map.name });
      }
    };
    arrive(p, 0);
    if (this.party) {
      let i = 1;
      for (const h of this.heroes) {
        if (h === actor) continue;
        this.use(h);
        arrive(this.player, i++);
      }
      this.use(actor);
    }
    // Every spawn point is a "camp" of one enemy that comes back after a while. A camp beaten
    // before you left stays beaten until its timer runs out: leaving and coming back does not
    // bring a boss back early (campDown is kept in the save, so reloading does not either).
    this.camps = map.spawns.map((def, i) => ({ def, key: `${map.id}:${i}`, slots: [{ type: def.type, id: null, timer: 0, respawn: def.respawn || CONFIG.RESPAWN_TIME }] }));
    for (const camp of this.camps) {
      const left = (this.campDown[camp.key] || 0) - this.ticks;
      for (const slot of camp.slots) {
        if (left > 0) slot.timer = left * CONFIG.TICK;
        else slot.id = this.spawnCamp(slot, camp).id;
      }
    }
    this.placeChests();
    this.thiefClock = 0;
    this.hazards = [];
    this.happening = null;
    this.eventClock = EVENTS.first;
    this.merchant = null;
    if (this.mode === 'explore' && !this.trial && !map.safe && map.id !== 'rift' && this.ticks - this.merchantAt > MERCHANT.gap / CONFIG.TICK && this.streamRng('merchantIn', this.surpriseN++)() < (map.wilds ? WILDS.merchant : MERCHANT.chance)) this.spawnMerchant();
    if (this.mode === 'explore' && map.safe && !this.trial) for (const h of this.heroes) { this.use(h); this.fillBounties(); } // fresh jobs on the board
    this.use(actor);
    if (this.mode === 'explore' && !this.trial && !map.safe && map.id !== 'rift' && this.streamRng('thiefIn', this.surpriseN++)() < (map.wilds ? WILDS.thiefIn : THIEF.onEnter)) this.spawnThief();
    this.emit('mapChange', { id: map.id, name: map.name, from });
    for (const h of this.heroes) {
      this.use(h);
      this.questEvent('reach', map.id);
    }
    this.use(actor);
  }

  /** A joiner's copy of the world: show a map without spawning anything (the host sends what is on it). */
  loadMapMirror(id) {
    const map = (this.map = buildMap(id));
    this.radius = map.radius;
    if (id === 'town') map.obstacles = map.obstacles.filter((o) => o.kind !== 'npc' || this.npcHere(o.id));
    this.sideStoryProps(map);
    this.obstacles = map.obstacles;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.telegraphs = [];
    this.zones = [];
    this.shadows = [];
    this.walls = [];
    this.delayed = [];
    this.falls = []; // the final boss's falling stars (stepFalls)
    this.camps = [];
  }

  /** Keep a round body out of everything solid on the map. Returns true if it was pushed. */
  pushOut(o, rad) {
    let pushed = false;
    for (const ob of this.obstacles) {
      if (ob.soft) continue; // (0.58.1) story people and things: seen by some, in nobody's way
      const dx = o.x - ob.x;
      const dz = o.z - ob.z;
      if (ob.shape === 'box') {
        if (Math.abs(dx) + Math.abs(dz) > ob.hw + ob.hd + rad + 2) continue; // far away, skip the maths
        const c = dCos(ob.rot);
        const s = dSin(ob.rot);
        const lx = dx * c + dz * s; // the body's position in the box's own frame
        const lz = -dx * s + dz * c;
        const cx = clamp(lx, -ob.hw, ob.hw);
        const cz = clamp(lz, -ob.hd, ob.hd);
        let nx = lx - cx;
        let nz = lz - cz;
        let d = dHypot(nx, nz);
        if (d >= rad) continue;
        if (d < 1e-6) {
          // The centre is inside the box: leave through the nearest wall.
          const px = ob.hw - Math.abs(lx);
          const pz = ob.hd - Math.abs(lz);
          if (px < pz) {
            nx = lx < 0 ? -1 : 1;
            nz = 0;
            d = -px;
          } else {
            nx = 0;
            nz = lz < 0 ? -1 : 1;
            d = -pz;
          }
        } else {
          nx /= d;
          nz /= d;
        }
        const push = rad - d;
        this.hitNx = nx * c - nz * s; // which way the surface faces, for sliding along it
        this.hitNz = nx * s + nz * c;
        o.x += this.hitNx * push;
        o.z += this.hitNz * push;
        pushed = true;
      } else {
        const min = ob.r + rad;
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = dHypot(dx, dz);
        if (d >= min) continue;
        this.hitNx = d < 1e-6 ? 1 : dx / d;
        this.hitNz = d < 1e-6 ? 0 : dz / d;
        o.x += this.hitNx * (min - d);
        o.z += this.hitNz * (min - d);
        pushed = true;
      }
    }
    return pushed;
  }

  /**
   * pushOut for something that is walking. Walking straight at a tree or a wall
   * would otherwise stop it dead, so it slides sideways along the surface and
   * flows around the obstacle instead.
   */
  moveSolid(o, rad) {
    const wantX = o.x - o.px; // the step it tried to take
    const wantZ = o.z - o.pz;
    if (!this.pushOut(o, rad)) {
      o.slideSide = 0;
      return false;
    }
    const want = dHypot(wantX, wantZ);
    const got = dHypot(o.x - o.px, o.z - o.pz);
    if (want > 1e-4 && got < want * 0.7) {
      const tx = -this.hitNz; // along the surface
      const tz = this.hitNx;
      const lean = wantX * tx + wantZ * tz;
      // Pick a side when it first touches, then keep following the surface that way
      // until it is clear. Changing sides halfway would leave it pacing in front of a wall.
      if (!o.slideSide) o.slideSide = lean >= 0 ? 1 : -1;
      const extra = want * 0.7 - got;
      o.x += tx * o.slideSide * extra;
      o.z += tz * o.slideSide * extra;
      this.pushOut(o, rad);
    }
    return true;
  }

  /** Stop the hero and the enemies walking through houses, trees and rocks. */
  collide(dt) {
    if (!this.obstacles.length) return;
    const p = this.player;
    if (!p.leap && !p.dead) {
      if (this.moveSolid(p, p.radius)) {
        const c = this.clampToArena(p.x, p.z, p.radius);
        p.x = c.x;
        p.z = c.z;
      }
      // Give up on a move order that is getting no closer (the spot is inside or behind something solid).
      if (p.moveTarget) {
        const left = dist(p.x, p.z, p.moveTarget.x, p.moveTarget.z);
        if (p.bestLeft == null || left < p.bestLeft - 0.25) {
          p.bestLeft = left;
          p.stuckT = 0;
        } else {
          p.stuckT += dt;
          if (p.stuckT > 1.8 && p.castLock <= 0 && p.parryT <= 0) {
            p.moveTarget = null;
            p.attackMove = null;
            p.autoAcquire = true;
          }
        }
      } else {
        p.bestLeft = null;
        p.stuckT = 0;
      }
    }
    for (const e of this.enemies) if (!e.dead) this.moveSolid(e, e.radius);
    for (const l of this.loot) this.pushOut(l, 0.4);
  }

  /**
   * Camp enemies ignore you until you come close, and give up if you drag them
   * too far from home or step into town. Returns true while the enemy should fight.
   */
  /** Patience drains while an enemy is dragged far from home, whatever it is doing (0.44: kits keep it busy). */
  drainPatience(e, dh, dt) {
    const boss = !!e.def.boss;
    if (e.aggro && dh > (boss ? CONFIG.PATIENCE_RANGE_BOSS : CONFIG.PATIENCE_RANGE)) e.patience = Math.max(0, e.patience - dt / (boss ? CONFIG.PATIENCE_TIME_BOSS : CONFIG.PATIENCE_TIME));
    else if (e.patience < 1) e.patience = Math.min(1, e.patience + dt / 2);
  }

  stepLeash(e, d, dt) {
    const p = this.player;
    const dh = dist(e.x, e.z, e.home.x, e.home.z);
    // Patience, like a jungle camp: dragged out past PATIENCE_RANGE it loses patience; back near home it recovers.
    this.drainPatience(e, dh, dt);
    const boss = !!e.def.boss;
    if (e.aggro && (p.dead || this.inTown(p) || dh > (boss ? CONFIG.LEASH_RANGE_BOSS : CONFIG.LEASH_RANGE) || e.patience <= 0)) {
      e.aggro = false;
      e.returning = true;
    }
    if (e.returning && dh < 3) e.patience = 1;
    if (!e.aggro && !e.returning && !p.dead && d < CONFIG.AGGRO_RANGE && !this.inTown(p)) e.aggro = true;
    if (e.aggro) return true;
    e.chaseT = 0;
    if (!e.returning && dh <= 7 && !e.def.boss) {
      // Nothing to fight: amble around the spot it lives at.
      e.wanderT = (e.wanderT || 0) - dt;
      if (e.wanderT <= 0) {
        e.wanderT = 2 + this.rng() * 4;
        const a = this.rng() * TAU;
        const r = this.rng() * CONFIG.WANDER_RANGE;
        e.wander = this.rng() < 0.6 ? { x: e.home.x + dCos(a) * r, z: e.home.z + dSin(a) * r } : null;
      }
      if (e.wander) {
        const wd = dist(e.x, e.z, e.wander.x, e.wander.z);
        if (wd < 0.3) e.wander = null;
        else {
          const sp = e.def.speed * 0.35 * dt;
          e.x += ((e.wander.x - e.x) / wd) * sp;
          e.z += ((e.wander.z - e.z) / wd) * sp;
          e.facing = dAtan2(e.wander.z - e.z, e.wander.x - e.x);
          e.moving = true;
        }
      }
    }
    if (e.returning || dh > 7) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt); // heals on the walk home
      if (dh < 3) {
        e.returning = false;
      } else {
        const sp = e.def.speed * 1.4 * dt;
        e.x += ((e.home.x - e.x) / dh) * sp;
        e.z += ((e.home.z - e.z) / dh) * sp;
        e.facing = dAtan2(e.home.z - e.z, e.home.x - e.x);
        e.moving = true;
      }
    }
    return false;
  }

  /** Waystones: stand on one for a moment to open the travel menu (see the 'warp' command). */
  stepWaystones(dt) {
    const p = this.player;
    const stones = this.map.waystones || [];
    let on = null;
    stones.forEach((w, i) => {
      if (dist(p.x, p.z, w.x, w.z) < w.r) on = i;
    });
    if (on == null) {
      this.stoneArmed = true;
      this.stoneT = 0;
      this.stoneOn = null;
    } else if (this.stoneArmed) {
      this.stoneT += dt;
      this.stoneOn = on;
      if (this.stoneT >= CONFIG.PORTAL_TIME) {
        this.stoneArmed = false;
        this.emit('waystone', { index: on, name: stones[on].name });
      }
    }
  }

  stepExplore(dt) {
    const p = this.player;
    if (p.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        p.dead = false;
        this.goMap(MAPS_START, null); // wake up in town
        p.hp = p.stats.maxHp;
        this.emit('respawn');
      }
      return;
    }
    if (this.inTown(p)) {
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * CONFIG.TOWN_HEAL * dt);
      p.potions = CONFIG.MAX_POTIONS;
      p.undyingUsed = false;
    }
    if (this.partySeen > 1 || this.enemies.some((e) => e.partyN > 1)) this.scaleBossesForParty(); // (0.61) the party went: back to one
    // Enemies come back a while after they are killed, but not right on top of you.
    for (const camp of this.camps) {
      const away = dist(p.x, p.z, camp.def.x, camp.def.z) > 10;
      for (const slot of camp.slots) {
        if (slot.id != null) continue;
        slot.timer -= dt;
        if (slot.timer <= 0 && away) slot.id = this.spawnCamp(slot, camp).id;
      }
    }
    // The Wishthief (0.29): every so often, another one may be hiding here.
    if (this.map && !this.map.safe && this.map.id !== 'rift' && !this.trial) {
      this.thiefClock += dt;
      if (this.thiefClock >= THIEF.every) {
        this.thiefClock = 0;
        if (this.streamRng('thiefAgain', this.surpriseN++)() < (this.map.wilds ? WILDS.thiefAgain : THIEF.again)) this.spawnThief();
      }
    }
    // World events and the travelling merchant (0.31)
    this.stepEvents(dt);
    if (this.merchant) {
      this.merchant.left -= dt;
      if (this.merchant.left <= 0) {
        this.emit('merchantLeave', {});
        this.merchant = null;
      }
    }
    // The Waygate in town: stand on it to choose a map you have already reached.
    const wg = this.map.waygate;
    if (wg) {
      if (dist(p.x, p.z, wg.x, wg.z) >= wg.r) {
        this.wayArmed = true;
        this.wayT = 0;
      } else if (this.wayArmed) {
        this.wayT += dt;
        if (this.wayT >= CONFIG.PORTAL_TIME) {
          this.wayArmed = false;
          this.emit('waygate');
        }
      }
    }
    this.stepWaystones(dt);
    // Portals: stand in one for a moment to travel to the next map.
    let on = null;
    for (const g of this.map.portals) if (dist(p.x, p.z, g.x, g.z) < g.r) on = g;
    this.portalOn = on;
    if (!on) {
      this.portalArmed = true;
      this.portalT = 0;
    } else if (this.portalArmed) {
      this.portalT += dt;
      if (this.portalT >= CONFIG.PORTAL_TIME) this.goMap(on.to, this.map.id);
    }
  }

  /** Number of enemies still to deal with this wave (alive + not yet spawned). */
  get remaining() {
    return this.enemies.length + this.wave.queue.length;
  }

  // =========================================================================
  step(dt) {
    this.runCommands();
    // (0.61.2) an enemy's wind-up warning goes with it, however it went (killed mid-charge, despawned)
    if (this.telegraphs.length && this.telegraphs.some((t) => t.foe)) {
      this.telegraphs = this.telegraphs.filter((t) => {
        if (!t.foe) return true;
        const e = this.enemyById(t.owner);
        return !!(e && !e.dead && (e.tele === t || (e.teles && e.teles.includes(t))));
      });
    }
    if (this.gameOver && this.travelHook && this.mode === 'arena') {
      // (0.59) on the server, a fallen hero goes home from the Ring after a moment (spoils already paid)
      this.ringOutT = (this.ringOutT ?? 2.5) - dt;
      if (this.ringOutT <= 0 && !this.ringGone) {
        this.ringGone = true;
        this.travelHook(this.heroes[0], 'town', 'ring', null);
      }
    }
    if (this.gameOver) return;
    this.ticks++;
    this.time += dt;
    // While a perfect parry is slowing time, enemies and their projectiles get a shorter step.
    const edt = this.slowT > 0 ? dt * CONFIG.SLOW_FACTOR : dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) {
        this.slowT = 0;
        this.emit('slowEnd');
      }
    }
    if (!this.party) {
      this.stepPlayer(dt);
      this.stepDelayed(dt);
      this.stepZones(dt);
      this.stepShadows(dt);
      this.stepWalls(dt);
      this.stepEnemies(edt);
      this.stepDoom(edt);
      this.stepFalls(edt);
      this.stepHazards(edt);
      this.collide(dt);
      this.stepProjectiles(dt, edt);
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.stepLoot(dt);
      if (this.mode === 'explore') {
        this.stepChests();
        this.stepExplore(dt);
      }
      else this.stepWave(dt);
      return;
    }
    // A party: the same steps, each run as the hero it belongs to.
    const lead = this.heroes[0];
    const each = (fn) => {
      for (const h of this.heroes.slice()) {
        if (!this.heroes.includes(h)) continue;
        this.use(h);
        fn();
        this.tagOwned();
      }
      this.use(lead);
    };
    each(() => {
      this.stepPlayer(dt);
      this.landLateHits(); // a friend's held hits that no parry caught (0.41.1)
    });
    this.byOwner(this.delayed, (list) => { this.delayed = list; this.stepDelayed(dt); return this.delayed; }, (all) => (this.delayed = all));
    this.byOwner(this.zones, (list) => { this.zones = list; this.stepZones(dt); return this.zones; }, (all) => (this.zones = all));
    this.stepShadows(dt);
    this.stepWalls(dt);
    this.stepEnemies(edt);
    this.stepDoom(edt);
    this.stepFalls(edt);
    this.stepHazards(edt);
    this.use(lead);
    each(() => this.collide(dt));
    this.stepProjectiles(dt, edt);
    this.use(lead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    each(() => this.stepLoot(dt));
    if (this.mode === 'explore') {
      this.stepChests();
      this.scaleBossesForParty(); // (0.61)
      this.stepPartyExplore(dt);
    }
    this.use(lead);
  }

  /**
   * Run a step over a list of owned things (zones, delayed effects) one owner at a time,
   * so their damage uses the right hero's stats. New things made meanwhile are kept.
   */
  byOwner(list, run, store) {
    const lead = this.heroes[0];
    const groups = new Map();
    for (const it of list) {
      const k = it.pid ?? 0;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    let out = [];
    for (const [pid, items] of groups) {
      const h = this.heroByPid(pid);
      if (!h) continue;
      this.use(h);
      out = out.concat(run(items));
      this.tagOwned();
    }
    this.use(lead);
    store(out);
  }

  /**
   * (0.61) Wishes against a boss: for each hero beyond the first sharing its map, a boss has more health
   * and poise. Taken again whenever the number changes (a friend arrives or leaves mid-fight), keeping
   * its share of health. The heroes hear why the first time (main.js, 'partyBoss').
   */
  scaleBossesForParty() {
    const n = Math.max(1, this.heroes.length);
    if (n > 1 && n > (this.partySeen || 1)) {
      for (const h of this.heroes) this.as(h, () => this.emit('partyEchoes', { n }));
    }
    this.partySeen = n;
    for (const e of this.enemies) {
      if (e.dead || !e.def.boss) continue;
      const was = e.partyN || 1;
      if (was === n) continue;
      const hpOf = (k) => 1 + CONFIG.PARTY_BOSS_HP * (k - 1);
      const ratio = hpOf(n) / hpOf(was);
      e.maxHp = Math.round(e.maxHp * ratio);
      e.hp = Math.max(1, Math.round(e.hp * ratio));
      e.poiseMult = 1 + CONFIG.PARTY_BOSS_POISE * (n - 1);
      e.partyN = n;
      if (n > was) for (const h of this.heroes) this.as(h, () => this.emit('partyBoss', { name: e.def.name, n, hp: hpOf(n), id: e.id }));
    }
  }

  /** Exploration upkeep in a party: shared enemy respawns, then each hero's own portals and knockouts. */
  stepPartyExplore(dt) {
    const lead = this.heroes[0];
    // Enemies come back a while after they are killed, but not right on top of anyone; (0.61) faster
    // the more heroes share the map (not the bosses), so each can hold a stretch of it.
    const faster = 1 + CONFIG.PARTY_RESPAWN * (this.heroes.length - 1);
    for (const camp of this.camps) {
      const away = this.heroes.every((h) => dist(h.player.x, h.player.z, camp.def.x, camp.def.z) > 10);
      for (const slot of camp.slots) {
        if (slot.id != null) continue;
        slot.timer -= dt * (camp.def.boss || (ENEMIES[slot.type] && ENEMIES[slot.type].boss) ? 1 : faster);
        if (slot.timer <= 0 && away) slot.id = this.spawnCamp(slot, camp).id;
      }
    }
    // The Wishthief (0.29): every so often, another one may be hiding here.
    if (this.map && !this.map.safe && this.map.id !== 'rift' && !this.trial) {
      this.thiefClock += dt;
      if (this.thiefClock >= THIEF.every) {
        this.thiefClock = 0;
        if (this.streamRng('thiefAgain', this.surpriseN++)() < (this.map.wilds ? WILDS.thiefAgain : THIEF.again)) this.spawnThief();
      }
    }
    // World events and the travelling merchant (0.31)
    this.stepEvents(dt);
    if (this.merchant) {
      this.merchant.left -= dt;
      if (this.merchant.left <= 0) {
        this.emit('merchantLeave', {});
        this.merchant = null;
      }
    }
    const allDown = this.heroes.every((h) => h.player.dead);
    for (const h of this.heroes.slice()) {
      this.use(h);
      const p = this.player;
      if (p.dead) {
        this.respawnT -= dt;
        if (this.respawnT <= 0 && !allDown) {
          // Back on your feet at the map's entrance, next to the way you came in.
          p.dead = false;
          p.hp = p.stats.maxHp;
          const g = this.map.portals[0];
          const k = g ? 1 - 5.5 / dHypot(g.x, g.z) : 0;
          p.x = p.px = g ? g.x * k : 0;
          p.z = p.pz = g ? g.z * k : 0;
          p.moveTarget = null;
          p.targetId = null;
          this.pushOut(p, p.radius);
          this.emit('respawn');
        }
        continue;
      }
      if (this.inTown(p)) {
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * CONFIG.TOWN_HEAL * dt);
        p.potions = CONFIG.MAX_POTIONS;
        p.undyingUsed = false;
      }
      const wg = this.map.waygate;
      if (wg) {
        if (dist(p.x, p.z, wg.x, wg.z) >= wg.r) {
          this.wayArmed = true;
          this.wayT = 0;
        } else if (this.wayArmed) {
          this.wayT += dt;
          if (this.wayT >= CONFIG.PORTAL_TIME) {
            this.wayArmed = false;
            this.emit('waygate');
          }
        }
      }
      this.stepWaystones(dt);
      let on = null;
      for (const g of this.map.portals) if (dist(p.x, p.z, g.x, g.z) < g.r) on = g;
      this.portalOn = on;
      if (!on) {
        this.portalArmed = true;
        this.portalT = 0;
      } else if (this.portalArmed) {
        this.portalT += dt;
        if (this.portalT >= CONFIG.PORTAL_TIME) {
          // One hero takes the portal and the whole party goes with them (on the server, just them).
          this.goMap(on.to, this.map.id);
          this.use(lead);
          return;
        }
      }
    }
    this.use(lead);
    if (allDown && this.heroes.every((h) => (h === this.cur ? this.respawnT : h.respawnT) <= 0)) {
      // The whole party is down: everyone wakes up in Haven.
      this.goMapAll(MAPS_START, null);
      for (const h of this.heroes) {
        this.use(h);
        this.player.dead = false;
        this.player.hp = this.player.stats.maxHp;
        this.emit('respawn');
      }
    }
    this.use(lead);
  }
}
