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
import { DEEP, DEPTH_IDS, emberOf, emberForGear, emberScale, TIERS, MAX_TIER, ELITE_FROM_LEVEL, AFFIXES, AFFIX_IDS, ELITE, RIFT, riftScale, WISH_STATS, WISH_IDS, wishNeed, DOOM , masteryFor, MASTERY, CAELUM, animusShort, hoardTop, primordialsOf } from './endgame.js';
const DEPTH_FIRST = DEPTH_IDS[0]; // (0.57.6) the Depth the main story opens (VI)

/** Commands that mean a player is at the keys (anything else, like sorting the bag, does not). */
// Map objects you can interact with (G, or right-click to walk over). New kinds go here.
const INTERACT_KINDS = new Set(['npc', 'sign', 'board', 'delve', 'ring', 'hall', 'keepaltar', 'works', 'statue']); // (0.80: the Wishkeep's halls and Hearth)
const r2n = (n) => Math.round((n || 0) * 100) / 100;
// How long a friend's hits may wait for their parry to arrive (0.41.1): about a slow connection's round trip.
const LAG_CAP = 0.5;
const ACTIVE_CMDS = new Set(['move', 'attackMove', 'attack', 'stop', 'cast', 'parry', 'potion', 'warp', 'travel']);
import { CONFIG } from '../config.js';
import { makeRng } from './rng.js';
import { ABILITIES, OLD_SELVES, ENEMIES, buildWave, enemyScale, expToNext, checkpointFor, levelBandMult } from './defs.js';
import { migrateRebirth, rebirthBlock, starmarksFor, starmarksForGear, rebirthSave, perkRank, expMult, PERKS, ECHOES, essenceFor, rebirthGear, REBIRTH_GLOWS, REBIRTH } from './rebirth.js';
import { relevelItem, SLOTS, rollItem, starterWeapon, itemScore, sumGearStats, scrapValue, upgradeCost, MAX_PLUS, CACHES, CASTER_CLASSES, bestUpgrades, statRange, KEPT_RATE, REROLL_PITY, immortalLine, ROLL_TIER_AT, CHEST_TIERS, starPotency, applyPotent, SETS, setCounts, rollSetPiece, enchantable, enchantCost, rollBonusStat, ENCHANT_POOL, rerollCost, rollLine, reforgeChoices, rollQuality, rollTier, dustValue, migrateItem, topTier, lineTier, rollUnique, REMNANT_UNIQUE, MAX_STARS, IMMORTAL, SPEC_IMMORTALS, EFFECTS } from './items.js';
import { classPower } from './balance.js';
// Deadeye's pierces (0.51): damage for the 1st to 4th enemy on the line, and what each pierce adds.
const DEADEYE_PIERCE = { mult: [1, 0.7, 0.5, 0.35], mark: 0.2, markTime: 5, pin: 1.5, splinter: 0.35, splinterR: 3 };
import { RARE, rareName, THIEF, REMNANT, remnantName, EVENTS, MERCHANT, GLASS, BOUNTY, FRAGMENTS, SIGIL, WILDS, ELITE_SPOILS } from './surprises.js';
import { GLOWS, REMNANT_GLOW } from './cosmetics.js';
import { CLASSES } from './classes.js';
import { buildRiftMap, buildMap, buildKeepMap, buildDelveRoom, delveRoute, DELVE_ROOMS, MAPS, MAP_IDS } from './maps.js';
import { AUGMENTS, AUGMENT_IDS, defaultMods } from './augments.js';
import { BORROW_SLOTS, borrowable, borrowedKit, OATH } from './borrowed.js';
import { ETERNAL, rollEternal, eternalMods, cleanEternals, feed as feedEternalXp, feedValue, xpToMax, remakeEternal, OTHER_SHARE, eternalForm } from './eternal.js';
const MOD_BASE = defaultMods(); // (0.65) each modifier's starting value, for applyPotent
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
/** (0.74) Loot lying on the ground is scrapped for its owner after this long, or past this many pieces. */
const LOOT_AGE = 25;
const LOOT_KEEP = 24;

/** (0.71.6) How far Hold the Line drags a boss: a fifth of the way. */
const BASTION_BOSS_PULL = 0.2;

/** (0.70.1) The road the Waygate opens once the Cinder has fallen: the Greenwood to Starfall Sanctum. */
export const ROAD_MAPS = MAP_IDS.slice(MAP_IDS.indexOf('greenwood'), MAP_IDS.indexOf('sanctum') + 1);

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
const HERO_KEYS = ['player', 'cls', 'kit', 'basic', 'mods', 'augments', 'offer', 'picks', 'rerolls', 'portalT', 'portalArmed', 'portalOn', 'wayT', 'wayArmed', 'stoneT', 'stoneArmed', 'stoneOn', 'respawnT', 'stats', 'bestWave', 'maxCheckpoint', 'parryPreset'];

/** Rarity weights that allow exactly one rarity. */
/** Commands the Weekly Echo ignores: its gear and build are fixed by the week. */
const ETERNAL_FORGE = 'forgeEternal'; // (0.74)
const AUTO_FEED = ['low', 'weapon', 'helm', 'chest', 'boots', 'ring']; // (0.75) where new Immortals go when auto-feeding
const ETERNAL_LOCKED = new Set(['recall', 'echoUp', 'reforge', 'ascend']); // (0.71) never on a worn Eternal; (0.75) rerolls and the blacksmith are open to it
const KEEP_CMDS = ['keepPossess', 'keepStatue', 'keepOffer', 'keepRaids', 'keepAutoSalvage', 'keepWork', 'keepBuildTier', 'keepAscend', 'keepGearOn', 'keepGearOff', 'keepGearLock', 'keepSalvage', 'keepGearBest', 'keepAnswer', 'keepSkip', 'keepTier', 'keepHall', 'keepTide', 'keepRecruit', 'keepTrain', 'keepArm', 'keepLearn', 'keepBless', 'keepTrade', 'keepRepair', 'keepDismiss', 'keepClock']; // (0.80; 0.81)
export const AUTO_ROLL_MAX = 500; // (0.81.6) rerolls one press of the auto-roller may spend
const TRIAL_LOCKED = new Set([ETERNAL_FORGE, ...KEEP_CMDS, 'autoRoll', 'lockItem', 'autoScrap', 'wearEternal', 'stowEternal', 'feedEternal', 'eternalAuto', 'recall', 'echoUp', 'scarfChoice', 'meetOdile', 'enterDelve', 'unwish', 'autoTalents', 'equip', 'autoEquip', 'discard', 'scrap', 'upgrade', 'enchant', 'reforge', 'rebirth', 'rebirthPerk', 'ascend', 'buyMerchant', 'wishReset', 'claimBounty', 'swapBounty', 'craftImmortal', 'summonRemnant', 'openCache', 'buyTome', 'rankUp', 'chooseSpec', 'talent', 'respec', 'travel']);
import { newRing, ringGain, ringWhole, ringCost, RING } from './ring.js';
import { nightOmen2, STATUE, STATUE_KIT, STATUE_BASIC, statuePower, statueCap } from './wishkeep.js'; // (0.92)
import { KEEP, HALLS, HALL_IDS, SETTLERS, SETTLER_IDS, settlersAt, settlerLevel, cleanKeep, CHAPTERS, RELIC_NAMES, TROOPS, TROOP_NAMES, SKILLS, BLESSINGS, MIRACLES, INCARNATE, FOES, troopStats, troopSkills, troopSupport, troopGender, skillSlotSchool, skillSlotOpen, buildMax, BUILD_IDS, WORKS, WORK_IDS, BUILD_TIER, GROWTH, keepRates, keepStage, HERO_RARITY, HERO_RAR_MAX, NIGHT, tideSpecials, OMENS, nightOmen, RAID, raidLevel, DODGE, HERO_GEAR, HERO_SLOTS, ARMORY_MAX, rollHeroGear, heroGearScore, heroGearUpgrade } from './wishkeep.js';
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
    this.troops = []; // (0.81) the Wishkeep's heroes, while you are there
    this.keepBuilds = []; // (0.81) ... and its buildings
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
    this.picks = []; // (0.65) picks still owed (boss: true/false), from starting the Ring further in
    this.rerolls = CONFIG.AUGMENT_REROLLS;
    this.mods = defaultMods();
    this.wave = { n: startWave - 1, phase: 'intermission', timer: CONFIG.FIRST_WAVE_DELAY, queue: [], spawnT: 0, maxAlive: 4, cleared: startWave - 1, startN: startWave };
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
      p.lockT = 0;
      h.will = null; // (0.68) a new map asks afresh
      this.portalT = this.wayT = 0;
      this.portalOn = null;
      this.portalArmed = this.wayArmed = false;
      if (!p.visited.includes(map.id) && map.id !== 'rift' && map.id !== 'delve') {
        p.visited.push(map.id);
        this.emit('discovered', { id: map.id, name: map.name });
      }
      if (map.safe) this.fillBounties();
      this.emit('mapChange', { id: map.id, name: map.name, from });
      this.caelumWarn(map.id);
      this.questEvent('reach', map.id);
      this.autoRoadQuests(); // (0.71.3)
      for (const h of this.heroes) if (h.player && (h.player.frenzyOn || h.player.oathOn)) {
        // (0.71.5) a new map turns the Oaths off (online, you arrive as a new hero): never shown on when it is not
        h.player.frenzyOn = h.player.oathOn = false;
        this.emit('buffEnd', { name: 'Oath' });
      }
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
      out.push({ pid: h.pid, name: h.name, cls: h.cls, x: p.x, z: p.z, px: p.px, pz: p.pz, facing: p.facing, dead: !!p.dead, hp: p.hp, maxHp: p.stats.maxHp, level: p.level, moving: !!p.moving, glow: p.glow || null, eform: eternalForm(p), // (0.76) their Eternal form
        // what their model should be doing (0.41.1): rolling, leaping, spinning, parrying
        seraph: !!p.possess, // (0.92) in their keep's Seraph
        dash: p.dash ? r2n(p.dash.dur) : 0, leap: p.leap ? r2n(p.leap.dur) : 0, spin: !!p.spin, parry: p.parryT > 0, as: r2n(p.stats.as), spec: p.spec || null, lock: p.lockT > 0,
        shade: p.shadeAt || null, clones: p.fireClones && p.fireClones.length ? p.fireClones : null, rime: p.rimeT > 0 ? p.rimeR : 0 }); // (0.81.3)
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
      cd: { q: 0, w: 0, e: 0, r: 0, d: 0, f: 0 },
      castLock: 0,
      channel: null, // (0.51) an archer's ultimate being drawn: slowed, no attacks or casts, the shot leaves at the end
      parryT: 0, // > 0 while the parry window is open
      lockT: 0, lockAge: 0, lockN: 0, lockEnd: -99, lockImmT: 0, lockShort: false, lockNeed: 0, // Mind-Locked (0.64)
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
      merchantCd: Math.max(0, Number(save?.merchantCd) || 0), merchantId: save?.merchantId ?? null, // (0.66) see MERCHANT.buyerCd
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
      ranks: Object.assign({ q: 1, w: 1, e: 1, r: 1 }, save?.ranks || {}, { d: 1, f: 1 }),
      frenzyOn: false, // (0.71.5) the Oath toggles, always present so a friend's game always hears when they go off
      oathOn: false,
      eternals: cleanEternals(save?.eternals), // (0.71) the Eternal pieces not being worn (sim/eternal.js)
      eternalEssence: Math.max(0, Number(save?.eternalEssence) || 0),
      eternalPity: Math.max(0, Math.min(200, Math.floor(Number(save?.eternalPity) || 0))), // (0.71.1) kills since the last Eternal
      eternalFirsts: Array.isArray(save?.eternalFirsts) ? save.eternalFirsts.filter((t) => typeof t === 'string').slice(0, 16) : [], // (0.73) the Granted this hero has beaten once
      eternalAuto: AUTO_FEED.includes(save?.eternalAuto) ? save.eternalAuto : null, // (0.75) off unless the player turns it on
      eformOff: save?.eformOff === true, // (0.76)
      keep: null, // (0.80) the account's Wishkeep, set like gold from outside (main.js, the server): never in this hero's save
      autoScrapAt: Number.isInteger(save?.autoScrapAt) && save.autoScrapAt >= 0 && save.autoScrapAt < IMMORTAL ? save.autoScrapAt : null, // (0.75.3)
      eternalVet: save?.eternalVet === true, // (0.74) the once-only thanks for those who beat the Granted at their hardest
      borrowed: { d: (save?.borrowed && typeof save.borrowed.d === 'string' && save.borrowed.d) || null, f: (save?.borrowed && typeof save.borrowed.f === 'string' && save.borrowed.f) || null }, // (0.70) borrowed skills on D and F
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
      for (const slot of SLOTS) {
        // (0.75) Eternal pieces from before 0.75 made over with every stat, at ten times a made Immortal
        remakeEternal(p.equipped[slot], this.cls);
        remakeEternal(p.eternals[slot], this.cls);
      }
      // (0.74) Thanks, once, to a hero who had beaten Granted before now (at twice today's health, or before
      // they had a hundred bars and anything worth having): each one's first-kill Essence if it was missed
      // (kills before 0.73), and a veteran's share more.
      if (!p.eternalVet) {
        p.eternalVet = true;
        let got = 0, beat = 0;
        for (const t of ETERNAL.GRANTED) {
          if (!(p.bossKills[t] > 0) && !p.eternalFirsts.includes(t)) continue;
          beat++;
          if (!p.eternalFirsts.includes(t)) {
            p.eternalFirsts.push(t);
            got += ETERNAL.firstKill;
          }
          got += ETERNAL.veteran;
        }
        if (got) {
          p.eternalEssence += got;
          p.vetGift = { essence: got, beat }; // told once the hero is in the world
        }
      }
      // (0.71) an Eternal is never in the gear box, and one a slot: a worn one is not also stowed
      p.bag = p.bag.filter((it) => it && !it.eternal);
      for (const slot of SLOTS) if (p.equipped[slot] && p.equipped[slot].eternal) { if (p.equipped[slot].slot !== slot) p.equipped[slot] = null; else p.eternals[slot] = null; }
    } else {
      p.equipped.weapon = starterWeapon(this.cls);
    }
    this.player = p;
    restoreRecalled(p); // (0.62) pieces recalled before 0.62 get their prime back
    if (p.level >= CONFIG.MAX_LEVEL && p.tierMax < MAX_TIER && this.roadOpen(p)) p.tierMax = MAX_TIER; // (0.66) see cinderTiers; (0.70.4) any class's Cinder
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
    if (this.player.possess) {
      // (0.92) in the Seraph: its own kit and strike, and nothing of the hero's (talents, sets, augments)
      this.kit = Object.assign({}, STATUE_KIT);
      this.basic = STATUE_BASIC;
      this.mods = m;
      return;
    }
    this.basic = CLASSES[this.cls].basic;
    // Talents first, so an augment that sets the same thing higher wins for the run.
    const spec = SPECS[this.player.spec];
    if (spec && spec.perk) spec.perk.apply(m); // the subclass trait, from the moment it is chosen
    // A subclass can swap out an ability (the Shadowdancer's Starglass Kunai).
    const base = CLASSES[this.cls].abilities;
    this.kit = Object.assign({}, base, spec && spec.kit && spec.cls === this.cls ? spec.kit : {});
    // (0.70) Borrowed skills on D and F, from classes whose Quiet has fallen (sim/borrowed.js)
    const may = this.borrowable();
    for (const slot of BORROW_SLOTS) {
      const want = this.player.borrowed && this.player.borrowed[slot];
      const def = want && may.includes(want) ? borrowedKit(this.cls, want, slot) : null;
      if (!def) continue;
      this.kit[slot] = def;
      if (def.apply) def.apply(m);
    }
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
    m.pot = {}; // (0.65) how strong each worn Immortal's passive is, by its stars (items.js starPotency)
    for (const slot of [...SLOTS, 'keepsake']) {
      const it = slot === 'keepsake' ? this.player.keepsake : this.player.equipped[slot];
      if (!it || !it.effect) continue;
      // From level 15 an Immortal's effect is its subclass version (0.32); a Remnant's own is the same for all.
      const spc = this.player.spec && SPEC_IMMORTALS[this.player.spec];
      const own = EFFECTS[it.effect] && !EFFECTS[it.effect].unique && spc ? spc[EFFECTS[it.effect].slot] : null;
      const k = starPotency(it);
      if (own) applyPotent(m, own.apply, k, MOD_BASE);
      else if (it.effect in m) {
        m[it.effect] = true;
        m.pot[it.effect] = Math.max(m.pot[it.effect] || 1, k);
      }
    }
    m.eternal = this.trial ? null : eternalMods(this.player.equipped); // (0.71) Eternal passives, never in the Weekly Echo
    if (m.eternal && !Object.keys(m.eternal).length) m.eternal = null;
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
    for (const slot of SLOTS) {
      // (0.71) every Eternal, worn or stowed, is always your level, like an Heirloom
      if (p.equipped[slot] && p.equipped[slot].eternal) relevelItem(p.equipped[slot], p.level);
      if (p.eternals && p.eternals[slot]) relevelItem(p.eternals[slot], p.level);
    }
    const gearNow = p.keepsake ? Object.assign({}, p.equipped, { keepsake: p.keepsake }) : p.equipped;
    const g = sumGearStats(gearNow);
    if (SLOTS.some((s) => gearNow[s] && gearNow[s].eternal)) {
      // (0.75) the speeds from Eternal gear stop at ETERNAL_GEAR_CAP (never below what the rest gives alone)
      const rest = {};
      for (const k in gearNow) if (!(gearNow[k] && gearNow[k].eternal)) rest[k] = gearNow[k];
      const g0 = sumGearStats(rest);
      for (const k in CONFIG.ETERNAL_GEAR_CAP) g[k] = Math.min(g[k], Math.max(CONFIG.ETERNAL_GEAR_CAP[k], g0[k]));
    }
    const L = p.level - 1;
    const prevMax = p.stats.maxHp || 0;
    const slip = p.slipT > 0;
    const c = CLASSES[this.cls].stats; // class multipliers on the base numbers
    p.stats = {
      maxHp: Math.round(((220 + 30 * L) * c.hp + g.hp) * (1 + m.hpPct)),
      // `ad` is the hero's power for every damage formula. Spell Power (staves) feeds it for the Mage.
      ad: Math.round(((18 + 3.2 * L) * c.ad + g.ad + (this.cls === 'mage' ? g.sp : 0)) * (1 + m.adPct)),
      armor: Math.round(((8 + 2 * L) * c.armor + g.armor) * (1 + m.armorPct)),
      as: 1.05 * c.as * (1 + 0.015 * L + g.as / 100 + m.asPct + (slip && !CASTER_CLASSES.has(this.cls) ? 0.3 * this.pot('slipstream') : 0) + (p.rushT > 0 ? p.rushAs : 0) + (p.hurricaneT > 0 ? p.hurricaneAs : 0) + (p.bloodied ? m.bloodAs : 0)) * m.asMult, // attacks per second
      ms: 6.4 * c.ms * (1 + g.ms / 100 + m.msPct + (slip ? 0.4 * this.pot('slipstream') : 0) + (p.bloodied ? m.bloodMs : 0)),
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
    if (p.possess) Object.assign(p.stats, { as: STATUE.as, ms: STATUE.ms, crit: STATUE.crit, haste: 0, lifesteal: 0 }); // (0.92) the Seraph's own pace
    if (prevMax && p.stats.maxHp > prevMax && !p.possess) p.hp += p.stats.maxHp - prevMax;
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
      merchantCd: Math.round(p.merchantCd || 0),
      merchantId: p.merchantId ?? null,
      tickets: p.tickets,
      visited: p.visited,
      quests: p.quests,
      signs: p.signs,
      bossKills: p.bossKills,
      spec: p.spec,
      talents: p.talents,
      talentBuilds: p.talentBuilds,
      tomes: p.tomes,
      ranks: p.possess ? p.possess.ranks : p.ranks, // (0.92) never the Seraph's
      borrowed: p.borrowed,
      eternals: p.eternals,
      eternalEssence: p.eternalEssence,
      eternalPity: p.eternalPity,
      eternalFirsts: p.eternalFirsts,
      eternalVet: p.eternalVet,
      eternalAuto: p.eternalAuto,
      autoScrapAt: p.autoScrapAt,
      eformOff: !!p.eformOff,
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
      if (ETERNAL_LOCKED.has(c.type) && p.equipped[c.slot] && p.equipped[c.slot].eternal) continue; // (0.71) an Eternal grows only by Feeding
      if (c.type === 'equip') this.equip(c.index);
      else if (c.type === 'wearEternal') this.wearEternal(c.slot);
      else if (c.type === 'stowEternal') this.stowEternal(c.slot);
      else if (c.type === 'feedEternal') this.feedEternal(c.slot, c.index, c.essence, c.ids);
      else if (c.type === 'eternalAuto') p.eternalAuto = AUTO_FEED.includes(c.to) ? c.to : null; // (0.75)
      else if (c.type === 'forgeEternal') this.forgeEternal(c.slot); // (0.74)
      else if (c.type === 'autoEquip') this.equipUpgrades();
      else if (c.type === 'discard') this.discard(c.index);
      else if (c.type === 'lockItem') this.lockItem(c.index, c.slot); // (0.75.2)
      else if (c.type === 'eternalForm') p.eformOff = c.on === false; // (0.76) show (or hide) the Eternal form
      else if (c.type === 'autoScrap') this.setAutoScrap(c.to == null ? null : Number(c.to)); // (0.75.3)
      else if (c.type === 'scrap') this.scrapNonUpgrades(c.keep);
      else if (c.type === 'upgrade') this.upgradeItem(c.slot);
      else if (c.type === 'enchant') this.rerollLine(c.slot, c.key, !!c.essence);
      else if (c.type === 'autoRoll') this.autoRoll(c.slot, c.targets, c.max, !!c.essence); // (0.81.6)
      else if (c.type === 'recall') this.recallMemory(c.slot);
      else if (c.type === 'echoUp') this.echoUpgrade(c.slot);
      else if (c.type === 'reforge') this.enchantItem(c.slot, c.key, c.to);
      else if (c.type === 'ascend') this.ascendItem(c.slot, c.index);
      else if (c.type === 'setGlow') { if (c.id === null || p.glows.includes(c.id)) p.glow = c.id; }
      else if (c.type === 'buyMerchant') this.buyMerchant(c.i);
      else if (c.type === 'wishReset') this.wishReset();
      else if (c.type === 'claimBounty') this.claimBounty(c.i);
      else if (c.type === 'keepAnswer') this.keepAnswer(c.i); // (0.80) the Wishkeep
      else if (c.type === 'keepSkip') this.keepSkip(c.i);
      else if (c.type === 'keepTier') this.keepTier();
      else if (c.type === 'keepHall') this.keepHall(c.cls);
      else if (c.type === 'keepTide') this.keepTideStart(c.level); // (0.82) at a Night level
      else if (c.type === 'keepAscend') this.keepAscend(c.id); // (0.82) a hero's rarity, a step up
      else if (c.type === 'keepGearOn') this.keepGearOn(c.gid, c.hero); // (0.82) the Armory
      else if (c.type === 'keepGearOff') this.keepGearOff(c.gid);
      else if (c.type === 'keepGearLock') this.keepGearLock(c.gid);
      else if (c.type === 'keepSalvage') this.keepSalvage(c.ids);
      else if (c.type === 'keepGearBest') this.keepGearBest();
      else if (c.type === 'keepAutoSalvage') this.keepAutoSalvage(c.to == null ? null : Number(c.to)); // (0.82.5)
      else if (c.type === 'keepWork') this.keepWork(c.id); // (0.82.1) the Mine and the Fields
      else if (c.type === 'keepBuildTier') this.keepBuildTier(c.id); // (0.82.1) building tiers
      else if (c.type === 'keepRecruit') this.keepRecruit(c.cls); // (0.81) the keep's heroes and halls
      else if (c.type === 'keepTrain') this.keepTrain(c.id);
      else if (c.type === 'keepArm') this.keepArm(c.id);
      else if (c.type === 'keepLearn') this.keepLearn(c.id, c.skill, c.slot);
      else if (c.type === 'keepRaids') this.keepRaidsSet(c.on); // (0.86)
      else if (c.type === 'keepDismiss') this.keepDismiss(c.id);
      else if (c.type === 'keepBless') this.keepBless(c.id);
      else if (c.type === 'keepTrade') this.keepTrade(c.dir);
      else if (c.type === 'keepRepair') this.keepRepair();
      else if (c.type === 'keepClock') this.keepClock(c.now);
      else if (c.type === 'swapBounty') this.swapBounty(c.i);
      else if (c.type === 'craftImmortal') this.craftImmortal(c.slot);
      else if (c.type === 'summonRemnant') this.summonRemnant();
      else if (c.type === 'openCache') this.openCache(c.tier, c.n);
      else if (c.type === 'buyTome') this.buyTome();
      else if (c.type === 'rankUp') this.rankUp(c.slot, c.n); // (0.91.1) n at once, for a held key
      else if (c.type === 'augment') this.takeAugment(c.id);
      else if (c.type === 'borrow') this.setBorrowed(c.slot, c.spec ?? null); // (0.70)
      else if (c.type === 'reroll') this.rerollOffer();
      else if (c.type === 'nextWave') {
        if (this.wave.phase === 'intermission' && !this.offer) this.wave.timer = Math.min(this.wave.timer, 0.05);
        if (this.ring) this.ring.hold = false; // (0.59) pushing on
      }
      if (p.dead) continue;
      if (p.lockT > 0) {
        if (c.type === 'parry') this.breakLock(c.seen); // (0.64) the only way out of a Mind-Lock
        continue;
      }
      if (this.tide && this.tide.chan != null && ['move', 'attack', 'attackMove', 'potion', 'parry'].includes(c.type)) continue; // (0.85) channelling: still, gathering aura
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
        case 'dodge':
          this.dodge(c.x, c.z); // (0.89)
          break;
        case 'swing':
          this.freeSwing(c.x, c.z); // (0.90)
          break;
        case 'keepWalk':
          this.keepWalkSet(c.on); // (0.91)
          break;
        case 'keepPossess':
          this.possessSet(c.on); // (0.92)
          break;
        case 'keepStatue':
          this.statueRaise(); // (0.92)
          break;
        case 'keepOffer':
          this.statueOffer(c.n); // (0.92)
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
          } else if (this.mode === 'explore' && c.to === KEEP.map) {
            // (0.80) the Wishkeep: once any class has beaten the Quiet; on the server a copy of your own, offline alone
            if (!this.keepOpen()) this.emit('keepLocked', {});
            else if (this.heroes.length > 1 && !this.travelHook) this.emit('keepAlone', {});
            else this.goMap(KEEP.map, 'town');
          } else if (this.mode === 'explore' && CAELUM.maps[c.to]) {
            // Caelum (0.64): open from taking The Sky Road; past the first map, once you have walked there.
            // Short of a map's Animus you may still go (with a warning on arrival, see caelumWarn).
            if (!this.questState(CAELUM.quest)) this.emit('mapLocked', { name: MAPS[c.to].name, quest: QUESTS[CAELUM.quest].name });
            else if (c.to === CAELUM.ids[0] || p.visited.includes(c.to)) this.goMap(c.to, MAPS[c.to].portals[0].to);
          } else if (this.mode === 'explore' && MAPS[c.to] && MAPS[c.to].unlock && this.questState(MAPS[c.to].unlock) !== 'done') this.emit('mapLocked', { name: MAPS[c.to].name, quest: QUESTS[MAPS[c.to].unlock].name });
          else if (this.mode === 'explore' && MAPS[c.to] && MAPS[c.to].fromTier && this.worldTier() < MAPS[c.to].fromTier) this.emit('wildsLocked', { tier: MAPS[c.to].fromTier, name: MAPS[c.to].name });
          else if (this.mode === 'explore' && MAPS[c.to] && (this.mapKnown(c.to) || c.to === 'town' || (MAPS[c.to].fromTier && this.worldTier() >= MAPS[c.to].fromTier))) this.goMap(c.to, MAPS[c.to].portals[0].to);
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
          this.buyPerk(c.id, c.n); // (0.71.7) Shift: up to 10 at once
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
    if (p.possess) return; // (0.92) stone drinks nothing
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
    p.hp = Math.min(p.stats.maxHp * (this.oathLeech(p) ? OATH.hpCap : 1), p.hp + amount); // (0.71.5) no higher than 49% under an Oath
    const healed = Math.round(p.hp - before);
    if (show && healed > 0) this.emit('heal', { x: p.x, z: p.z, amount: healed });
  }

  abilityUnlocked(slot) {
    if (!this.kit[slot]) return false; // (0.70) an empty borrowed slot
    if (this.player.possess) return ((this.player.keep && this.player.keep.statue && this.player.keep.statue.lvl) || 1) >= this.kit[slot].unlock; // (0.92) the Seraph's level
    return this.player.level >= this.kit[slot].unlock || (slot === 'r' && this.mods.rUnlock);
  }

  /** Cooldown in seconds after ranks, augments and ability haste, before Overflow's floor. */
  rawCooldown(slot) {
    const p = this.player;
    return this.kit[slot].cd * (this.mods[slot + 'Cd'] ?? 1) * (1 - CONFIG.RANK_COOLDOWN * ((p.ranks[slot] || 1) - 1)) * (100 / (100 + p.stats.haste)) * (this.twist === 'haste' ? 1 / 1.3 : 1); // (0.60) Haste
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
    const def = this.kit[slot];
    // (0.70.5) a borrowed skill grows with your main skill: Q's rank, and what talents and augments give Q
    const rank = def.borrowed ? p.ranks.q || 1 : p.ranks[slot] || 1;
    const main = def.borrowed ? this.mods.qDmg ?? 1 : 1;
    return (this.recasting || 1) * def.dmg(s, p.level) * (this.mods[slot + 'Dmg'] ?? 1) * main * (1 + CONFIG.RANK_DAMAGE * (rank - 1)) * this.overflowMult(slot);
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
      if (def.borrowed && def.stun > 0 && !e.dead) {
        // (0.70) Glacier Slam: frozen solid (a boss staggers instead)
        if (e.def.boss) this.addPosture(e, 2, false);
        else this.stun(e, def.stun);
        if (def.freeze && m.frostMax > 0 && !e.dead) this.addFrost(e, 2);
      }
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
      this.hitEnemy(e, p.stats.ad * 0.6 * this.pot('stormcaller'), { source: 'storm', canCrit: false });
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
    const ow = this.oathOf();
    const dmg = (1.7 * p.stats.ad + 40 + 10 * p.level) * (1 + CONFIG.RANK_DAMAGE * ((p.ranks.q || 1) - 1)) * (m.frostDmg || 1) * (ow && ow.shatter ? ow.shatter : 1); // (0.70) Blood Oath
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
          this.hitEnemy(e, wl.dmg, { source: wl.slot || 'r' });
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

  /**
   * (0.81.3) Umbra Gemina (and the shades of Echo Caster and Mirror Blade): a twin shadow walks at your
   * shoulder for as long as the borrowing is slotted, so you can see where its copies come from.
   */
  stepShade(dt) {
    const p = this.player, m = this.mods;
    if (!(m.shadeEcho > 0 || m.echoQ > 0)) {
      if (p.shadeAt) p.shadeAt = null;
      return;
    }
    const a = p.facing + Math.PI * 0.72; // behind you, to one side
    const tx = p.x + dCos(a) * 1.5, tz = p.z + dSin(a) * 1.5;
    if (!p.shadeAt || dist(p.shadeAt.x, p.shadeAt.z, p.x, p.z) > 8) p.shadeAt = { x: tx, z: tz, facing: p.facing, atk: 0, moving: false };
    const s = p.shadeAt;
    const k = Math.min(1, dt * 8);
    const nx = s.x + (tx - s.x) * k, nz = s.z + (tz - s.z) * k;
    s.moving = dist(nx, nz, s.x, s.z) > 0.6 * dt;
    s.x = Math.round(nx * 1000) / 1000;
    s.z = Math.round(nz * 1000) / 1000;
    if (this.ticks - (s.atk || 0) > 20) s.facing = p.facing;
  }

  /** (0.81.3) Ember Clones in flight: to their target, a strike and a burn, then on to the next. */
  stepFireClones(dt) {
    const p = this.player;
    if (!p.fireClones || !p.fireClones.length) return;
    for (const c of p.fireClones) {
      c.px = c.x;
      c.pz = c.z;
      c.life -= dt;
      if (c.hitT > 0) c.hitT -= dt;
      if (c.wait > 0) {
        c.wait -= dt;
        continue;
      }
      let t = c.targetId != null ? this.enemyById(c.targetId) : null;
      if (!t || t.dead) {
        t = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && dist(e.x, e.z, c.x, c.z) <= c.seek + e.radius && e.id !== c.last).sort((u, v) => dist(u.x, u.z, c.x, c.z) - dist(v.x, v.z, c.x, c.z))[0]
          || this.enemies.find((e) => !e.dead && e.state !== 'spawn' && e.id === c.last && dist(e.x, e.z, c.x, c.z) <= c.seek + e.radius) || null;
        c.targetId = t ? t.id : null;
      }
      if (!t) {
        // nothing left to strike: back to you, and out
        if (dist(c.x, c.z, p.x, p.z) < 1 || c.strikes <= 0) c.life = 0;
        else this.cloneFly(c, p.x, p.z, dt);
        continue;
      }
      const reach = t.radius + 0.9;
      if (dist(c.x, c.z, t.x, t.z) > reach) {
        this.cloneFly(c, t.x, t.z, dt);
        continue;
      }
      // a strike
      c.facing = dAtan2(t.z - c.z, t.x - c.x);
      c.hitT = 0.25;
      c.strikes--;
      this.hitEnemy(t, c.dmg, { source: c.slot });
      if (!t.dead) this.addBurn(t, c.burn);
      this.emit('cloneStrike', { id: c.id, x: c.x, z: c.z, tx: t.x, tz: t.z, last: c.strikes <= 0 });
      if (c.strikes <= 0) {
        for (const o of this.enemies) {
          if (o.dead || o.state === 'spawn' || dist(o.x, o.z, t.x, t.z) > c.burst + o.radius) continue;
          this.hitEnemy(o, c.dmg, { source: c.slot });
          if (!o.dead) this.addBurn(o, c.burn);
        }
        this.emit('burst', { x: t.x, z: t.z, radius: c.burst, color: 0xff7a2a });
        c.life = 0;
        continue;
      }
      c.last = t.id;
      c.targetId = null; // on to the next
      c.wait = 0.1;
    }
    p.fireClones = p.fireClones.filter((c) => c.life > 0);
  }
  cloneFly(c, x, z, dt) {
    const a = dAtan2(z - c.z, x - c.x);
    const d = dist(c.x, c.z, x, z);
    const step = Math.min(d, c.speed * dt);
    c.x += dCos(a) * step;
    c.z += dSin(a) * step;
    c.facing = a;
  }

  /** (0.81.3) Where the Rime Halo stands: round you, and round each of your Shadows. */
  rimeCenters(h = this.cur) {
    const p = h.player;
    return [{ x: p.x, z: p.z }].concat(this.shadows.filter((s) => s.pid === h.pid).map((s) => ({ x: s.x, z: s.z })));
  }
  stepRime(dt) {
    const p = this.player;
    if (!(p.rimeT > 0)) return;
    p.rimeT -= dt;
    p.rimeAcc = (p.rimeAcc || 0) + dt;
    if (p.rimeAcc < p.rimeTick || p.dead) return;
    p.rimeAcc -= p.rimeTick;
    const hit = new Set();
    for (const c of this.rimeCenters()) {
      for (const e of this.enemies) {
        if (e.dead || e.state === 'spawn' || hit.has(e) || dist(e.x, e.z, c.x, c.z) > p.rimeR + e.radius) continue;
        hit.add(e);
        this.hitEnemy(e, p.rimeDmg, { source: p.rimeSlot || 'd' });
        if (!e.dead) this.addFrost(e, p.rimeFrost || 1);
      }
    }
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
      this.hitEnemy(e, pr.dmg * (again ? pr.repeat : 1), { source: pr.slot || 'w' });
      if (pr.mark > 0 && !e.dead) {
        // (0.70) Long Kunai: Marked, it takes more from everyone
        e.vulnT = Math.max(e.vulnT || 0, 5);
        e.vuln = Math.max(e.vuln || 0, pr.mark);
        this.emit('mark', { id: e.id, x: e.x, z: e.z });
      }
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
    this.hitEnemy(target, dmg * bonus, { source: slot, forceCrit: !!def.sureCrit });
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
    return this.frenzyActive(p) ? 2 : p.bloodied ? 1 : 0;
  }

  /**
   * The basic attack lands (melee) or leaves the bow or staff (ranged).
   * `dmgOverride` is used by Barrage, whose arrows count as basic attacks.
   */
  basicAttack(target, dmgOverride = null) {
    const p = this.player;
    const b = this.basic;
    p.swingCount++;
    let dmg = dmgOverride ?? p.stats.ad * b.mult;
    // (0.81.4) Gale Force (Windrunner): every arrow hits harder the faster she shoots, on top of Crosswind
    // loosing more of them, so attack speed counts twice over
    if (b.shot && this.mods.galeForce > 0) dmg *= this.galeForce();
    // Steady Aim: every third shot gets +100% crit chance; anything over 100% becomes crit damage.
    const critBonus = this.cls === 'archer' && !p.possess && p.swingCount % this.mods.critEvery === 0 ? 100 : 0;
    const forceCrit = false;
    let gale = false;
    if (p.quickShots > 0 && dmgOverride === null) {
      // Skirmish Step's shots are gusts: harder, and no mirror turns them back (0.42)
      p.quickShots--;
      gale = true;
    }
    let mainShot = null; // (0.81.5) what Crosswind and Hurricane fold into
    if (b.shot) {
      const a = dAtan2(target.z - p.z, target.x - p.x);
      this.projectiles.push(mainShot = {
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
          this.hitEnemy(target, dmg * this.mods.veilCopy * (this.oathOf() && this.oathOf().copy ? this.oathOf().copy : 1), { source: 'veil' }); // (0.70) Blood Oath: twice the strength
        }
      }
    }
    if (dmgOverride === null && !target.dead) {
      // (0.70) borrowed passives on the basic attack
      const m2 = this.mods;
      if (m2.shadeEcho > 0) {
        // Umbra Gemina (was Shade Partner): the twin shadow at your shoulder looses the same attack, weaker
        const sa = dAtan2(target.z - p.z, target.x - p.x) + Math.PI / 2;
        const sx = p.shadeAt ? p.shadeAt.x : p.x + dCos(sa) * 1.1, sz = p.shadeAt ? p.shadeAt.z : p.z + dSin(sa) * 1.1;
        if (p.shadeAt) {
          p.shadeAt.atk = this.ticks; // (0.81.3) its model swings with you
          p.shadeAt.facing = dAtan2(target.z - sz, target.x - sx);
        }
        if (b.shot) {
          const a3 = dAtan2(target.z - sz, target.x - sx);
          // (0.81.4) a Windrunner's shadow looses everything her bow does, as one heavier arrow: Hurricane's
          // and Crosswind's extra arrows are folded into its damage, not flown (fewer arrows in the air)
          const more = (1 + this.windExtras()) * (gale ? p.quickMult || 1.25 : 1); // (and a Skirmish Step shot's strength)
          this.projectiles.push({ id: this.nextId++, owner: 'player', kind: b.shot, basic: true, noTail: true, targetId: target.id, critBonus: 0, shade: true, x: sx, z: sz, px: sx, pz: sz, vx: dCos(a3) * b.speed, vz: dSin(a3) * b.speed, speed: b.speed, radius: more > 1 ? 0.4 : 0.3, dmg: dmg * m2.shadeEcho * more, parryable: false, reflected: false, life: 1.2, dead: false, volley: more > 1.5 ? 2 : undefined });
        } else this.hitEnemy(target, dmg * m2.shadeEcho, { source: 'shade' });
        this.emit('shadowSlash', { x: sx, z: sz, tx: target.x, tz: target.z, veil: true });
      }
      if (m2.daggerEvery > 0 && p.swingCount % m2.daggerEvery === 0) {
        // Tailwind Daggers: two homing daggers at enemies near the target
        const near = this.enemies.filter((o) => !o.dead && o.state !== 'spawn' && dist(o.x, o.z, target.x, target.z) <= 7).sort((u, v) => dist(u.x, u.z, target.x, target.z) - dist(v.x, v.z, target.x, target.z));
        const nd = m2.daggerCount || 2;
        for (let i = 0; i < nd; i++) {
          const t2 = near[i % Math.max(1, near.length)] || target;
          const a4 = dAtan2(t2.z - p.z, t2.x - p.x) + (i - (nd - 1) / 2) * 0.8;
          this.projectiles.push({ id: this.nextId++, owner: 'player', kind: 'mote', slot: 'basic', pid: this.cur.pid, targetId: t2.id, x: p.x + dCos(a4) * 0.6, z: p.z + dSin(a4) * 0.6, px: p.x, pz: p.z, vx: dCos(a4) * 24, vz: dSin(a4) * 24, speed: 24, radius: 0.35, dmg: p.stats.ad * (m2.daggerDmg || 0.4), parryable: false, reflected: false, life: 1.4, dead: false });
        }
      }
    }
    if (b.shot && this.mods.crosswind > 0 && dmgOverride === null && !target.dead) {
      // Crosswind (Windrunner, 0.43): extra arrows at the same target, more the faster you shoot
      // (attacks per second squared, over 32: half an arrow at 4 a second, 2 at 8, 4.5 at 12; at most 6)
      p.crossAcc = (p.crossAcc || 0) + (p.stats.as * p.stats.as) / 32;
      const n = Math.min(6, Math.floor(p.crossAcc));
      p.crossAcc -= n;
      // (0.81.5) folded into the arrow just loosed, not flown: they land with it, and the renderer rains
      // them down on the target (dozens of arrows a second in the air were slowing the game)
      if (n > 0 && mainShot) {
        (mainShot.fold = mainShot.fold || []).push({ dmg: dmg * this.mods.crosswind * n, tails: n, gust: true });
        mainShot.volley = (mainShot.volley || 0) + n;
      }
    }
    const hur = this.kit.r;
    if (b.shot && hur && hur.passive && hur.extra && dmgOverride === null && this.abilityUnlocked('r')) {
      // Hurricane (Windrunner, passive since 0.60.2): every real basic attack also looses arrows that sweep
      // out wide and curve in (like a gust), at other enemies nearby, or at the target if there are none.
      const oh = this.oathOf();
      const n = hur.extra + (this.mods.hurricaneExtra || 0) + (oh && oh.extra ? oh.extra : 0); // (0.70) Blood Oath: more
      const reach = this.basicRange() + 1.5;
      const others = this.enemies.filter((e) => e !== target && !e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= reach + e.radius)
        .sort((a, c) => dist(a.x, a.z, p.x, p.z) - dist(c.x, c.z, p.x, p.z)).slice(0, n);
      const aims = others.slice(0, 2); // (0.81.5) at most two arcs in the air, at other enemies...
      const mult = Math.max(hur.extraMult, this.mods.hurricaneMult || 0) * (1 + (hur.rankMult || 0) * Math.max(0, (p.ranks.r || 1) - 1)) * (this.mods.hurricaneDmg || 1) * (oh && oh.extra ? oh.mult : 1);
      const rest = n - aims.length; // ...and the rest land on the target with the arrow just loosed
      if (rest > 0 && mainShot && !target.dead) {
        (mainShot.fold = mainShot.fold || []).push({ dmg: dmg * mult * rest, tails: 0 });
        mainShot.volley = (mainShot.volley || 0) + rest;
      }
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

  /** (0.81.4) Umbra Gemina's copy of Skirmish Step: more of its shots, and each harder (no second hop). */
  quickEcho(mult, q) {
    const p = this.player;
    p.quickShots += Math.max(1, Math.round(q.shots * mult));
    p.quickMult = (p.quickMult || 1) * (1 + 0.5 * mult);
    p.quickT = Math.max(p.quickT || 0, q.time);
    this.emit('buff', { name: 'Twin Step', x: p.x, z: p.z });
  }

  /** (0.81.4) Gale Force: how much harder each of a Windrunner's arrows hits at her attack speed. */
  galeForce() {
    const m = this.mods, p = this.player;
    return 1 + (m.galeForce || 0) * Math.min(p.stats.as, CONFIG.GALE_FORCE_CAP);
  }
  /**
   * (0.81.4) A Windrunner's extra arrows on one basic attack, in arrows' worth of damage: Hurricane's
   * (at their own strength) and Crosswind's (on average, at her attack speed).
   */
  windExtras() {
    const p = this.player, m = this.mods;
    let more = 0;
    const hur = this.kit.r;
    if (hur && hur.passive && hur.extra && this.abilityUnlocked('r')) {
      const oh = this.oathOf();
      const n = hur.extra + (m.hurricaneExtra || 0) + (oh && oh.extra ? oh.extra : 0);
      more += n * Math.max(hur.extraMult, m.hurricaneMult || 0) * (1 + (hur.rankMult || 0) * Math.max(0, (p.ranks.r || 1) - 1)) * (m.hurricaneDmg || 1) * (oh && oh.extra ? oh.mult : 1);
    }
    if (m.crosswind > 0) more += Math.min(6, (p.stats.as * p.stats.as) / 32) * m.crosswind;
    return more;
  }

  /**
   * Cast Q, W, E or R. What happens depends on the ability's `type`
   * (see sim/classes.js); the numbers come from the class kit.
   */
  castAbility(slot, x, z) {
    if (this.map && this.map.id === KEEP.map && !this.keepOwns()) return; // (0.82.5) a visitor casts nothing in a friend's keep (no walls, freezes or pulls in their night)
    if (this.tide && this.tide.state === 'on' && !this.inField() && this.keepOwns()) {
      // (0.81; 0.81.1; 0.82.2 a visitor fights) (0.85) R channels where you aim, R again lands early; no miracles meanwhile
      if (slot === INCARNATE.key) return this.tide.chan != null ? this.incarnateLand() : this.incarnate(x, z);
      return this.tide.chan != null ? undefined : this.miracle(slot, x, z);
    }
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
    const oath = this.oathOf(); // (0.70) Blood Oath
    const range = (def.range || 0) * (m[slot + 'Range'] || 1) * reach * (oath && oath.range && slot === 'q' ? oath.range : 1);
    let radius = (def.radius || 0) * (m[slot + "Radius"] || 1) * reach;

    // Single-target abilities need someone to hit before they go on cooldown.
    let target = null;
    if (def.type === 'strike' || def.type === 'barrage' || def.type === 'ricochet') {
      target = this.enemyNear(x, z, 3.5, range) || this.enemyNear(p.x, p.z, range + 2, range);
      if (!target) {
        this.emit('noTarget', { slot, x: p.x, z: p.z });
        return;
      }
    }
    if (def.type === 'fireclones' && !this.enemyNear(p.x, p.z, def.seek || 11, def.seek || 11)) {
      this.emit('noTarget', { slot, x: p.x, z: p.z }); // (0.81.3) the clones need someone to fly at
      return;
    }

    p.cd[slot] = this.abilityCooldown(slot);
    p.lastSlot = slot; // (0.54) what a seal takes
    if (slot === 'q' && m.bloodQcd && p.bloodied) p.cd.q *= 0.5; // Bloodreaver
    if (m.bloodCost > 0 && !this.recasting && (slot === 'q' || slot === 'w')) {
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
    if (p.empowerT > 0 && slot !== 'e' && def.type !== 'blink' && dmg > 0) {
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
        if (def.mend && this.tide && this.tide.state === 'on') for (const tr of this.troops || []) if (!tr.dead && dist(tr.x, tr.z, p.x, p.z) <= radius) this.troopMend(tr, tr.maxHp * def.mend); // (0.92) Wingbeat
        this.emit('cast', { slot, fx: 'nova', x: p.x, z: p.z, radius, pull: slot === 'w' && m.wPull, wings: !!def.mend });
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
          this.hitEnemy(e, dmg * (def.far ? 1 + (def.far * Math.max(0, along)) / range : 1), { source: slot, forceCrit: slot === 'q' && m.qCrit }); // Bullseye Loop; (0.70) Javelin: further, harder
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
      // ---------------------------------------------------------------- (0.70) borrowed skills
      case 'bloodoath': {
        // Blood Oath (from the Berserker): drained to 40% and held there; your own subclass's signature goes past its limits
        // (0.71.2) A toggle: on until you turn it off.
        p.cd[slot] = def.toggleCd || 3;
        if (p.oathOn) {
          p.oathOn = false;
          this.emit('buffEnd', { name: 'Blood Oath' });
          break;
        }
        const floor = p.stats.maxHp * def.hpTo;
        if (p.hp > floor) {
          const cost = p.hp - floor;
          p.hp = floor;
          this.emit('bloodCost', { x: p.x, z: p.z, amount: Math.round(cost) });
        }
        p.oathOn = true;
        p.castLock = 0.15;
        this.emit('cast', { slot, fx: 'frenzy', x: p.x, z: p.z, radius: 3 });
        this.emit('buff', { name: 'Blood Oath', x: p.x, z: p.z });
        this.emit('bloodOath', { x: p.x, z: p.z, what: (OATH[p.spec] || OATH.none).name });
        break;
      }
      case 'breath': {
        // Dragon's Breath (from the Pyromancer): a cone of fire, a stun, burns, and the ground left burning
        const angle = def.angle * (m[slot + 'Angle'] || 1);
        p.facing = a;
        p.castLock = 0.2;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          const de = dist(e.x, e.z, p.x, p.z);
          if (de > range + e.radius || Math.abs(angDiff(dAtan2(e.z - p.z, e.x - p.x), a)) > angle / 2 + dAtan2(e.radius, Math.max(0.5, de))) continue;
          this.hitEnemy(e, dmg, { source: slot });
          if (e.dead) continue;
          this.addBurn(e, def.burn);
          if (!e.dead) { if (e.def.boss) this.addPosture(e, 1, false); else this.stun(e, def.stun); }
        }
        const c = this.clampToArena(p.x + cos * range * 0.55, p.z + sin * range * 0.55, p.radius);
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius: def.lingerRadius, t: 0, dur: def.linger, parryable: false };
        this.telegraphs.push(tele);
        this.startZone({ x: c.x, z: c.z, radius: def.lingerRadius, lasts: def.linger, tick: 0.5, dmg: (dmg * 0.6) / (def.linger / 0.5), total: dmg * 0.6, slow: 0, slowDur: 1, slot, tele, opening: 0, pin: 0, burn: 1 });
        this.emit('cast', { slot, fx: 'cone', x: p.x, z: p.z, dir: a, range, angle, fire: true });
        break;
      }
      case 'anchor': {
        // Anchor Shot (from the Bulwark): everything near where it lands is dragged together and stunned
        const c = aimPoint();
        p.facing = a;
        p.castLock = 0.16;
        this.pullStun(c.x, c.z, radius, def.stun, dmg, slot);
        this.emit('cast', { slot, fx: 'bolt', x: p.x, z: p.z, dir: a });
        break;
      }
      case 'snare': {
        // Smoke Snare (from the Bulwark): everything around you is dragged to you and stunned
        p.castLock = 0.14;
        this.pullStun(p.x, p.z, radius, def.stun, dmg, slot);
        break;
      }
      case 'blink': {
        // Blink Strike (from the Assassin): behind the enemy nearest your cursor; the next spell hits harder and crits
        const t = this.enemyNear(x, z, 4, range) || this.enemyNear(p.x, p.z, range + 1, range);
        if (!t) {
          p.cd[slot] = 0;
          this.emit('noTarget', { slot, x: p.x, z: p.z });
          return;
        }
        const ta = dAtan2(t.z - p.z, t.x - p.x);
        const stand = t.radius + p.radius + 0.5;
        const end = this.clampToArena(t.x + dCos(ta) * stand, t.z + dSin(ta) * stand, p.radius);
        this.emit('shadowSwap', { x: end.x, z: end.z, fx: p.x, fz: p.z });
        p.x = p.px = end.x;
        p.z = p.pz = end.z;
        p.facing = dAtan2(t.z - p.z, t.x - p.x);
        p.moveTarget = null;
        p.empowerT = 6;
        p.empowerMult = def.empower;
        p.empowerCrit = true;
        p.castLock = 0.1;
        if (def.burst > 0 && dmg > 0) {
          // (0.70.5) and a burst where you land
          for (const e of this.enemies) if (!e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= def.burst + e.radius) this.hitEnemy(e, dmg, { source: slot });
          this.emit('cast', { slot, fx: 'nova', x: p.x, z: p.z, radius: def.burst });
        }
        this.emit('buff', { name: 'Blink Strike', x: p.x, z: p.z });
        break;
      }
      case 'trap': {
        // Frost Trap (from the Frostbinder): waits; the first enemy on it freezes everything near
        const c = aimPoint();
        p.facing = a;
        p.castLock = 0.12;
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius: def.trigger, t: 0, dur: def.life, parryable: false };
        this.telegraphs.push(tele);
        this.delayed.push({ t: def.life, kind: 'trap', x: c.x, z: c.z, radius, trigger: def.trigger, freeze: def.freeze, dmg, tele, slot, arm: 0.5 });
        this.emit('cast', { slot, fx: 'zone', x: c.x, z: c.z, radius: def.trigger, channel: 0 });
        break;
      }
      case 'wall': {
        // Rimewall (Frostbinder): a box of ice across the aim line. See stepWalls.
        const c = aimPoint();
        p.facing = a;
        p.castLock = 0.18;
        const rot = a + Math.PI / 2;
        const oathWall = oath && oath.length && slot === 'r'; // (0.70) Blood Oath: a longer Rimewall that stuns longer
        const hw = (def.length * (m.wallLen || 1) * (oathWall ? oath.length : 1)) / 2;
        const dur = def.duration + (m.wallDur || 0);
        if (def.borrowed) for (const old of this.walls) if (old.pid === this.cur.pid && old.slot === slot && old.t > 0.05) old.t = 0.01; // (0.70.5) one borrowed wall at a time: the old one shatters
        const ob = { shape: 'box', x: c.x, z: c.z, hw, hd: 0.45, rot, kind: 'icewall' };
        this.obstacles = this.obstacles.concat([ob]); // a new array: the map's own list is never changed
        this.walls.push({ id: this.nextId++, pid: this.cur.pid, x: c.x, z: c.z, rot, hw, hd: 0.45, t: dur, dur, dmg, stun: (def.stun || 1) * (oathWall ? oath.stun : 1), ob, slot });
        // (0.56.3) It rises hard: everything it comes up beside is hit, given Hoarfrost and staggered.
        const near = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && this.wallDist(this.walls[this.walls.length - 1], e.x, e.z) <= 1.4 + e.radius);
        for (const e of near) {
          this.hitEnemy(e, dmg * (def.rise || 0.6), { source: slot });
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
            radius: width / 2, dmg: kdmg, group, repeat: p.veilT > 0 ? 1 : def.repeat || 0.6, slow: m[slot + 'Slow'] || 0, mark: def.mark || 0,
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
          const ta = def.borrowed ? dAtan2(target.z - p.z, target.x - p.x) : dAtan2(p.z - target.z, p.x - target.x); // (0.70) a borrowed blink lands behind it
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
        const zone = { x: c.x, z: c.z, radius, lasts, tick: def.tick, dmg: dmg / ticks, total: dmg, slow: def.slow || 0, slowDur: def.slowDur || 1, slot, tele, opening: def.opening || 0, pin: def.pin || 0, burn: def.burnTick || 0 };
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
      case 'fireclones': {
        // (0.81.3) Ember Clones: copies of you in fire fly out at the nearest enemies, strike, and leap on
        p.facing = a;
        p.castLock = 0.18;
        const clones = p.fireClones || (p.fireClones = []);
        const n = def.count || 3;
        const near = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= (def.seek || 11) + e.radius).sort((u, v) => dist(u.x, u.z, p.x, p.z) - dist(v.x, v.z, p.x, p.z));
        for (let i = 0; i < n; i++) {
          const fa = a + (i - (n - 1) / 2) * 0.7;
          const t = near.length ? near[i % near.length] : null;
          clones.push({ id: this.nextId++, x: p.x + dCos(fa) * 0.8, z: p.z + dSin(fa) * 0.8, px: p.x, pz: p.z, facing: fa, targetId: t ? t.id : null, strikes: def.strikes || 4, life: def.life || 4.5, wait: 0.12 * i, hitT: 0, dmg, burn: def.burn || 2, burst: def.burst || 2.6, speed: def.speed || 20, seek: def.seek || 11, slot, last: null });
        }
        this.emit('cast', { slot, fx: 'fireclones', x: p.x, z: p.z, n });
        break;
      }
      case 'rimehalo': {
        // (0.81.3) Rime Halo: a ring of rime round you and each of your Shadows; shots that cross it fly back
        p.castLock = 0.15;
        p.rimeT = def.duration || 6;
        p.rimeR = def.radius || 4.5;
        p.rimeTick = def.tick || 0.5;
        p.rimeDmg = dmg;
        p.rimeFrost = def.tickFrost || 1;
        p.rimeSlot = slot;
        const centers = this.rimeCenters();
        const hit = new Set();
        for (const c of centers) {
          for (const e of this.enemies) {
            if (e.dead || e.state === 'spawn' || hit.has(e) || dist(e.x, e.z, c.x, c.z) > p.rimeR + e.radius) continue;
            hit.add(e);
            this.hitEnemy(e, dmg * (def.burst || 2.4), { source: slot });
            if (!e.dead) this.addFrost(e, def.frost || 2);
          }
          this.emit('iceGuard', { x: c.x, z: c.z, radius: p.rimeR, halo: true });
        }
        this.emit('cast', { slot, fx: 'rimehalo', x: p.x, z: p.z, radius: p.rimeR });
        break;
      }
      case 'deadeye': {
        // Deadeye (Sharpshooter, 0.42; 0.51: drawn for a second, slowed, then loosed, and it pierces)
        p.facing = a;
        const oathEye = oath && oath.noChannel && slot === 'r';
        if (oathEye) {
          // (0.70) Blood Oath: no draw, far wider, harder, and it goes through everything
          this.fireDeadeye(a, range, def.width * oath.width, dmg * oath.mult, slot);
          p.castLock = 0.2;
        } else if (def.channel) {
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
        // (0.71.2) A toggle: on until you turn it off, and while it is on you are held at 40% health.
        p.cd[slot] = def.toggleCd || 3;
        if (p.frenzyOn) {
          p.frenzyOn = false;
          this.emit('buffEnd', { name: 'Crimson Oath' });
          break;
        }
        p.frenzyOn = true;
        dmg *= 1 + (m.oathRoar || 0);
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
          // (0.71.6) a harder drag: everything right up to you (a boss a fifth of the way)
          const gap = Math.max(0, de - (e.radius + p.radius + 0.4)) * (e.def.boss ? BASTION_BOSS_PULL : 1.1);
          const de1 = Math.max(de, 0.01);
          e.kx = ((p.x - e.x) / de1) * gap * 9;
          e.kz = ((p.z - e.z) / de1) * gap * 9;
          if (!e.def.boss) {
            if (!e.def.heavy) this.stun(e, def.stun);
          } else this.addPosture(e, 1, false);
          if (m.wFrostSpin > 0 && !e.dead) this.addFrost(e, m.frostMax || 6); // (0.71.6) Glacier Spin: frozen solid at once
        }
        if (m.wFrostSpin > 0) {
          // (0.71.6) Glacier Spin: Hold the Line is a Rimewall round you too, for as long as it holds
          p.frostSpinT = Math.max(p.frostSpinT || 0, def.duration + (m.rDuration || 0));
          p.frostSpinR = Math.max(p.frostSpinR || 0, 4.8);
          this.emit('iceGuard', { x: p.x, z: p.z, radius: p.frostSpinR });
        }
        p.bastionT = def.duration + (m.rDuration || 0);
        this.emit('cast', { slot, fx: 'bastion', x: p.x, z: p.z, radius });
        this.emit('buff', { name: 'Hold the Line', x: p.x, z: p.z });
        break;
      }
      case 'meteor': {
        const c = aimPoint();
        const instant = oath && oath.instant && slot === 'r'; // (0.70) Blood Oath: Cinderfall lands at once, wider and harder
        const delay = instant ? 0.05 : def.delay * (m[slot + 'Delay'] || 1);
        if (instant) {
          radius *= oath.radius;
          dmg *= oath.mult;
        }
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius, t: 0, dur: delay, parryable: false };
        this.telegraphs.push(tele);
        this.delayed.push({ t: delay, kind: 'quake', x: c.x, z: c.z, radius, dmg, tele, stun: def.stun || 0, slot, fx: def.burnZone ? 'cinderfall' : 'skyfall', burnZone: def.burnZone || null });
        p.facing = a;
        p.castLock = 0.2;
        this.emit('cast', { slot, fx: 'meteor', x: c.x, z: c.z, radius });
        break;
      }
    }
    if (!this.recasting) {
      // (0.70) borrowed passives that answer a cast
      if (m.echoQ > 0 && slot === 'q') this.delayed.push({ t: 0.3, kind: 'recast', slot, x, z, mult: m.echoQ }); // a shade casts it again
      if (m.castMotes > 0 && slot !== 'd' && slot !== 'f') this.looseCastMotes(m.castMotes);
      const grav = slot === 'r' ? m.rGravity : slot === 'w' ? m.wGravity : 0;
      if (grav > 0) {
        const c = aimPoint();
        this.pullStun(c.x, c.z, grav, 1.5, 0, slot, m.gravityVuln || 0); // Gravity Anchor: drawn in first, then the spell lands
      }
      if (m.wFrostSpin > 0 && slot === 'w') {
        // (0.71.4) Glacier Spin: a Rimewall turned round you for as long as you spin
        const spinFor = def.type === 'spin' ? def.duration + (m.wSpinTime || 0) : 0;
        p.frostSpinT = Math.max(p.frostSpinT || 0, spinFor + m.wFrostSpin);
        p.frostSpinR = Math.max(3.2, (def.radius || 4) * reach + 0.6);
        this.emit('iceGuard', { x: p.x, z: p.z, radius: p.frostSpinR }); // (0.72) its own look and sound
      }
      if (m.wTornado > 0 && slot === 'w') {
        const tr = 3.2, td = p.stats.ad * (m.wTornadoDmg || 0.25);
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: p.x, z: p.z, dir: 0, radius: tr, t: 0, dur: m.wTornado, parryable: false };
        this.telegraphs.push(tele);
        this.startZone({ x: p.x, z: p.z, radius: tr, lasts: m.wTornado, tick: 0.5, dmg: td, total: td * (m.wTornado / 0.5), slow: 0.2, slowDur: 1, slot: 'w', tele, opening: 0, pin: 0 });
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
        this.delayed.push({ t: 0.45, kind: 'quake', x: c.x, z: c.z, radius: 3, dmg: p.stats.ad * 1.6 * this.pot('stormcaller'), tele, slot: 'wish', fx: 'starfall' });
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
    const def = this.kit[slot] || {};
    const oath = this.oathOf();
    const all = !!(oath && oath.noChannel && slot === 'r'); // (0.70) a Blood Oath Deadeye goes through everything
    const struck = all ? hits : hits.slice(0, P.mult.length);
    struck.forEach(({ e }, i) => {
      if (e.dead) return;
      this.hitEnemy(e, dmg * P.mult[Math.min(i, P.mult.length - 1)], { source: slot, forceCrit: true, heavy: true });
      if (e.dead) return;
      if (def.lance) {
        // (0.70) Elemental Lance: burns for a Pyromancer, Hoarfrost for a Frostbinder, both (halved) before either
        const sp = this.player.spec;
        if (sp !== 'frostbinder') this.addBurn(e, sp === 'pyromancer' ? def.lance.burn : def.lance.burn / 2);
        if (sp !== 'pyromancer' && !e.dead) this.addFrost(e, sp === 'frostbinder' ? def.lance.frost : Math.ceil(def.lance.frost / 2));
        if (e.dead) return;
      }
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
    this.emit('cast', { slot, fx: 'deadeye', x: p.x, z: p.z, dir: a, range: last ? Math.max(1, last.along) : range, width, last: true, hit: !!last, tx: last ? last.e.x : null, tz: last ? last.e.z : null, pierced: Math.max(0, struck.length - 1), noMove: true, echo: this.shadeFiring || undefined });
    if (slot === 'r' && this.mods.shadeEye > 0 && p.shadeAt && !this.shadeFiring && !def.lance) {
      // (0.81.3) Umbra Gemina: the shadow draws with you, and looses a breath later
      this.delayed.push({ t: 0.22, kind: 'shadeEye', a, range, width, dmg: dmg * this.mods.shadeEye, slot });
    }
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
      if (d.kind === 'trap' && d.t > 0) {
        // (0.70) Frost Trap: armed after a moment, set off by the first enemy on it
        d.arm -= dt;
        if (d.arm > 0 || !this.enemies.some((e) => !e.dead && e.state !== 'spawn' && dist(e.x, e.z, d.x, d.z) <= d.trigger + e.radius)) continue;
        d.sprung = true;
        d.t = 0;
      }
      if (d.t > 0) continue;
      d.done = true;
      if (d.kind === 'recast' && this.kit[d.slot] && this.kit[d.slot].type === 'dash') {
        // (0.81.4) a shade never hops you a second time: it feeds the hop's gift instead (Skirmish Step:
        // more shots at once, each harder)
        const q = this.kit[d.slot].quick;
        if (q) {
          if (p.dash && p.dash.quick) p.dash.quickEcho = d.mult;
          else if (p.quickShots > 0) this.quickEcho(d.mult, q);
        }
        if (p.shadeAt) p.shadeAt.atk = this.ticks;
        this.emit('shadowSlash', { x: p.shadeAt ? p.shadeAt.x : p.x, z: p.shadeAt ? p.shadeAt.z : p.z, tx: d.x, tz: d.z, veil: false });
        continue;
      }
      if (d.kind === 'recast') {
        // (0.70) a shade casts your Q again, weaker (Echo Caster, Mirror Blade, Shade Partner)
        const keep = { cd: p.cd[d.slot], lock: p.castLock, emp: p.empowerT };
        p.cd[d.slot] = 0;
        p.castLock = 0;
        p.empowerT = 0;
        this.recasting = d.mult;
        // (0.81.3) from where the shade stands, if one walks with you
        const home = p.shadeAt ? { x: p.x, z: p.z, px: p.px, pz: p.pz, facing: p.facing } : null;
        if (home) {
          p.x = p.px = p.shadeAt.x;
          p.z = p.pz = p.shadeAt.z;
          p.shadeAt.atk = this.ticks;
        }
        try { this.castAbility(d.slot, d.x, d.z); } finally {
          this.recasting = null;
          if (home) {
            if (p.shadeAt) p.shadeAt.facing = p.facing;
            Object.assign(p, home);
          }
        }
        Object.assign(p, { castLock: keep.lock, empowerT: keep.emp });
        p.cd[d.slot] = keep.cd;
        this.emit('shadowSlash', { x: p.shadeAt ? p.shadeAt.x : p.x, z: p.shadeAt ? p.shadeAt.z : p.z, tx: d.x, tz: d.z, veil: false });
        continue;
      }
      if (d.kind === 'shadeEye') {
        // (0.81.3) Umbra Gemina: the Sharpshooter's shadow looses its own Deadeye, from where it stands
        if (!p.shadeAt || p.dead) continue;
        const home = { x: p.x, z: p.z };
        p.x = p.shadeAt.x;
        p.z = p.shadeAt.z;
        p.shadeAt.atk = this.ticks;
        p.shadeAt.facing = d.a;
        this.shadeFiring = true;
        try { this.fireDeadeye(d.a, d.range, d.width, d.dmg, d.slot); } finally {
          this.shadeFiring = false;
          Object.assign(p, home);
        }
        continue;
      }
      if (d.kind === 'trap') {
        this.telegraphs = this.telegraphs.filter((t) => t !== d.tele);
        if (!d.sprung) continue;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn' || dist(e.x, e.z, d.x, d.z) > d.radius + e.radius) continue;
          this.hitEnemy(e, d.dmg, { source: d.slot });
          if (e.dead) continue;
          if (e.def.boss) this.addPosture(e, 2, false);
          else this.stun(e, d.freeze);
          if (!e.dead) this.addFrost(e, 3);
        }
        this.emit('frostShatter', { x: d.x, z: d.z, radius: d.radius });
        continue;
      }
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
          this.zones.push({ x: d.x, z: d.z, radius: d.radius, left: bz.time, dur: bz.time, next: 0, tick: bz.tick, dmg: 0, burn: bz.stacks, slow: 0, slowDur: 0, slot: d.slot || 'r', tele, fire: true });
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
    this.slowT = CONFIG.PERFECT_SLOW * m.slowDur * (m.timekeeper ? 1 + 0.6 * this.pot('timekeeper') : 1);
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
      if (dist(e.x, e.z, x, z) <= 3 + e.radius) this.hitEnemy(e, p.stats.ad * 1.5 * this.pot('stormcaller'), { source: 'storm', canCrit: false });
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
    {
      // (0.89; 0.91) over the shoulder: the roll's cooldown and grace, a free strike landing
      const me = this.player;
      if (me.dodgeCd > 0) me.dodgeCd = Math.max(0, me.dodgeCd - dt);
      if (me.dodgeT > 0) me.dodgeT -= dt;
      if (me.freeSwing && (me.freeSwing.t -= dt) <= 0) {
        const fs = me.freeSwing;
        me.freeSwing = null;
        if (this.handsOn() && !me.dead) this.landFreeSwing(fs); // (0.90)
      }
    }
    const p = this.player;
    p.px = p.x;
    p.pz = p.z;
    this.stepShade(dt); // (0.81.3)
    this.stepFireClones(dt);
    this.stepRime(dt);
    if (p.dead) return;
    p.moving = false;

    // Slipstream on a Rogue or Mage: cooldowns run 60% faster while it lasts.
    const cdRate = p.slipT > 0 && this.mods.slipstream && CASTER_CLASSES.has(this.cls) ? 1 + 0.6 * this.pot('slipstream') : 1;
    for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt * cdRate);
    if (p.fangT > 0) p.fangT -= dt;
    p.idleT = (p.idleT || 0) + dt; // reset by any input (applyCommands)
    // Lifesteal budget (0.32): it fills at LIFESTEAL_RATE of max health a second, holding one second's worth.
    p.lsPool = Math.min(p.stats.maxHp * CONFIG.LIFESTEAL_RATE, (p.lsPool || 0) + p.stats.maxHp * CONFIG.LIFESTEAL_RATE * dt);
    if (p.unwishedT > 0) p.unwishedT -= dt;
    if (p.nightcutT > 0) p.nightcutT -= dt;
    if (p.surgeT > 0 && (p.surgeT -= dt) <= 0) p.surgeN = 0;
    if (p.lockImmT > 0) p.lockImmT -= dt;
    if (p.merchantCd > 0) p.merchantCd -= dt;
    if (p.frostSpinT > 0) p.frostSpinT -= dt; // (0.71.4) Glacier Spin
    if (p.vetGift) {
      this.emit('vetGift', p.vetGift); // (0.74) told once, in the world
      p.vetGift = null;
    }
    if (p.dead) p.oathOn = p.frenzyOn = false; // (0.71.2) the toggles go off when you fall
    if (p.oathT > 0) p.oathT -= dt;
    // (0.71.5) While an Oath is on, nothing takes you above 49%: you stay alive by hitting (lifesteal
    // 25 times over, uncapped, see hitEnemy), not by waiting.
    if (p.frenzyOn && !(this.kit.r && this.kit.r.type === 'frenzy')) p.frenzyOn = false; // no longer a Berserker (a respec)
    if (!p.dead && this.oathLeech(p) && p.hp > p.stats.maxHp * OATH.hpCap) p.hp = p.stats.maxHp * OATH.hpCap;
    if (p.lockT > 0) {
      // Mind-Locked (0.64): nothing but a parry press (applyCommands) until it ends or breaks.
      const L = CONFIG.MIND_LOCK;
      const was = p.lockAge;
      p.lockAge += dt;
      p.lockT -= dt;
      p.moveTarget = null;
      p.atkWind = 0;
      p.barrage = null;
      if (p.lockT <= 0) this.endLock(false);
      else if (p.lockAge >= L.first && Math.floor((p.lockAge - L.first) / L.every) !== Math.floor((was - L.first) / L.every)) this.emit('lockCrack', { x: p.x, z: p.z });
      else if (was < L.first && p.lockAge >= L.first) this.emit('lockCrack', { x: p.x, z: p.z });
      if (p.lockT > 0) return;
    }
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
          const dmg = 1.2 * this.pot('sporeheart') * Math.max(p.stats.ad || 0, p.stats.sp || 0);
          for (const e of near) {
            this.hitEnemy(e, dmg, { source: 'spore' });
            if (!e.dead) {
              e.vulnT = Math.max(e.vulnT || 0, 4);
              e.vuln = Math.max(e.vuln || 0, 0.1 * this.pot('sporeheart'));
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
    if (!this.oathLeech(p) || p.hp < p.stats.maxHp * OATH.hpCap) p.hp = Math.min(p.stats.maxHp * (this.oathLeech(p) ? OATH.hpCap : 1), p.hp + p.stats.regen * dt); // (0.71.5)
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
        const over = ds.slot === 'dodge' ? 1 : this.overflowMult(ds.slot); // (0.50) haste past the 1 s floor makes the buff stronger
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
          if (ds.quickEcho) this.quickEcho(ds.quickEcho, ds.quick); // (0.81.4) the shadow's copy of the hop
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
    if (this.tide && this.tide.state === 'on' && (!this.keepOwns() || !this.inField())) {
      // (0.81) in a Tide the hero is the keep's god; (0.82.5) a visitor attacks nothing in it: miracles (Q, W, E), never a sword (unless incarnate, 0.81.1)
      p.targetId = null;
      p.attackMove = null;
      p.autoAcquire = false;
    }
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
    const handsOn = this.handsOn(); // (0.90) Incarnate (0.91: or walking the keep): you choose every strike
    if (!target && !p.moveTarget && p.autoAcquire && p.autoAttack !== false && p.parryT <= 0 && !handsOn) {
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

  hitPlayer(rawDamage, opts = {}) {
    if (opts.willHit && !this.willHit) {
      // (0.69) a friend's held Will strike, landing now: still not softened by the guard
      this.willHit = true;
      try {
        return this.hitPlayer(rawDamage, { ...opts, willHit: false });
      } finally {
        this.willHit = false;
      }
    }
    // (0.64) Mind-Lock riders: `lock` seconds of Mind-Lock if the hit lands; `need` is the Animus the
    // map asks (it decides chains, immunity and Dominion); `dominion`: one of the Granted's great attacks.
    const { dominion = false, lock = 0, need = 0, held = false, noParry = false, src = null, proj = null, parryWin = null } = opts;
    if (dominion && !this.player.dead && (held || !(this.party && this.cur !== this.heroes[0] && this.cur.lag > 0.02 && !(this.player.parryT > 0) && !this.player.dash && !this.player.leap))) {
      const p = this.player;
      const short = animusShort(p.animus, need);
      const D = CONFIG.DOMINION;
      const base = { src, proj, held: true, need };
      if (p.parryT > 0 && !noParry && p.parryAge <= (parryWin ?? (short ? D.frame : this.parry.perfect))) {
        this.emit('dominionParried', { x: p.x, z: p.z, short });
        return this.hitPlayerCore(rawDamage, { ...base, parryable: true });
      }
      if ((p.dash || p.leap) && !short) return this.hitPlayerCore(rawDamage, { ...base, parryable: false });
      if (p.parryT > 0) p.parryT = 0; // too early or too late: it goes straight through the guard
      this.emit('dominion', { x: p.x, z: p.z, short, by: src && src.def ? src.def.name : '' });
      const res = short ? this.takeDamage(Math.round(p.stats.maxHp * D.short), src, true) : this.hitPlayerCore(rawDamage, { ...base, parryable: false, noParry: true });
      if (res === 'hit' && !p.dead) this.mindLock(short ? D.lockShort : D.lock, need, src);
      return res;
    }
    const res = this.hitPlayerCore(rawDamage, opts);
    if (lock > 0 && res === 'hit' && !this.player.dead) this.mindLock(lock, need, src);
    return res;
  }

  hitPlayerCore(rawDamage, { parryable = true, src = null, proj = null, doom = 0, held = false, noParry = false, dominion = false, lock = 0, need = 0, parryWin = null } = {}) {
    const p = this.player;
    const m = this.mods;
    if (p.dead) return 'none';
    if (!held && !doom && parryable && this.party && this.cur !== this.heroes[0] && this.cur.lag > 0.02 && !(p.parryT > 0) && !p.dash && !p.leap) {
      // A friend sees this hit late and their parry arrives late (0.41.1): hold it for as long as
      // their lag, so a parry they pressed in time on their own screen still counts.
      const h = this.cur;
      (h.lateHits = h.lateHits || []).push({ tick: this.ticks, due: this.time + Math.min(LAG_CAP, h.lag), dmg: rawDamage, opts: { parryable, src, proj: proj ? { level: proj.level, srcId: proj.srcId } : null, dominion, lock, need, parryWin, willHit: !!this.willHit } });
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
      if (g) return this.as(g, () => this.hitPlayer(rawDamage, { parryable, src, proj, held: true, lock, need }));
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
    if (m.oathDr > 0 && this.frenzyActive(p)) rawDamage *= 1 - m.oathDr; // (0.71.2) Oathsworn
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
            if (who && !who.dead) this.hitEnemy(who, p.stats.ad * 1.5 * this.pot('edric'), { source: 'oath', canCrit: true });
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
              this.hitEnemy(o, p.stats.ad * 2.5 * this.pot('oathsignet'), { source: 'oath', canCrit: false });
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
            this.hitEnemy(best, p.stats.ad * (perfect ? 2.5 : 1.5) * this.pot('retribution'), { source: 'retribution', canCrit: false });
          }
        } else if (m.retribution) {
          const radius = 4.5;
          for (const e of this.enemies) {
            if (e.dead || e.state === 'spawn') continue;
            if (dist(e.x, e.z, p.x, p.z) <= radius + e.radius) this.hitEnemy(e, p.stats.ad * (perfect ? 2 : 1.2) * this.pot('retribution'), { source: 'retribution', canCrit: false });
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

  /**
   * Mind-Locked (0.64): `dur` seconds before Animus and chains. `need`: the Animus this map asks. Short
   * of it there is no immunity afterwards; at or above it, a moment of immunity after every lock.
   */
  mindLock(dur, need = 0, src = null) {
    const p = this.player;
    const L = CONFIG.MIND_LOCK;
    if (p.dead || dur <= 0) return;
    const short = animusShort(p.animus, need);
    // (0.71.1) With the Animus asked here, Mind-Lock cannot touch you; with all of it (100%), nowhere can.
    if ((need > 0 && !short) || (p.animus || 0) >= MASTERY.animusMax - 1e-6) return;
    if (p.lockImmT > 0 && !short) return;
    const chained = p.lockT > 0 || this.time - (p.lockEnd ?? -99) <= L.chain;
    const n = chained ? Math.min(L.dr.length - 1, (p.lockN || 0) + 1) : 0;
    const t = dur * (1 - Math.min(MASTERY.animusMax, p.animus || 0)) * L.dr[n];
    if (t < 0.1) return;
    if (!(p.lockT > 0)) p.lockAge = 0;
    p.lockN = n;
    p.lockT = Math.max(p.lockT || 0, t);
    p.lockShort = short;
    p.lockNeed = need;
    p.moveTarget = null;
    p.targetId = null;
    p.parryT = 0;
    p.parryBuffer = 0;
    p.barrage = null;
    p.atkWind = 0;
    this.emit('mindLock', { time: t, short, x: p.x, z: p.z, by: src && src.def ? src.def.name : '' });
  }

  endLock(broken) {
    const p = this.player;
    p.lockT = 0;
    p.lockEnd = this.time;
    if (!p.lockShort) p.lockImmT = CONFIG.MIND_LOCK.immune;
    this.emit('lockEnd', { broken, x: p.x, z: p.z });
  }

  /** A parry press while Mind-Locked: inside a crack it breaks the lock; outside one the lock holds longer. */
  breakLock(seen = null) {
    const p = this.player;
    const L = CONFIG.MIND_LOCK;
    let age = p.lockAge;
    // A friend pressed this on their screen a little while ago (as tryParry): judge it then.
    if (typeof seen === 'number' && this.party && this.cur !== this.heroes[0]) age -= Math.max(0, Math.min(LAG_CAP, (this.ticks - seen) * CONFIG.TICK));
    const into = age - L.first - Math.floor((age - L.first) / L.every) * L.every;
    if (age >= L.first - 1e-9 && into <= L.crack + 1e-9) {
      this.stats.lockBreaks = (this.stats.lockBreaks || 0) + 1;
      this.endLock(true);
      this.healPlayer(p.stats.maxHp * CONFIG.PERFECT_HEAL, true);
    } else {
      p.lockT += L.miss;
      this.emit('lockSlip', { x: p.x, z: p.z });
    }
  }

  /**
   * (0.66) Once the Cinder has fallen, in this life or one before, a level-100 hero has all five world
   * tiers open: no climbing back through the Unmade four times after every rebirth. (0.70.4) On any class
   * of the account, as the road (roadOpen).
   */
  cinderTiers() {
    const p = this.player;
    if (p.tierMax >= MAX_TIER || p.level < CONFIG.MAX_LEVEL) return;
    if (!this.roadOpen(p)) return;
    p.tierMax = MAX_TIER;
    this.emit('tierUnlocked', { tier: MAX_TIER, numeral: TIERS[MAX_TIER].numeral, name: TIERS[MAX_TIER].name, all: true });
  }

  /**
   * (0.70.1) Once the Cinder has fallen on ANY class of the account (in any life), the whole road, the
   * Greenwood to Starfall Sanctum (the Unmade), is open on the Waygate from the start of every life: no
   * walking it again for each rebirth. Quest gates (Asterfell, the Starwell) and world tiers still apply.
   */
  roadOpen(p = this.player) {
    if (!p) return false;
    if ((p.bossKills && p.bossKills.cinder > 0) || primordialsOf(p.rebirth).includes(6)) return true;
    return !!(p.lives && Object.values(p.lives).some((l) => l && Array.isArray(l.prim) && l.prim.includes(6)));
  }

  /**
   * (0.70.4) Why Wren's Act III (the Deep's quests) has not begun for this hero, once the Starwell is
   * done: 'unwish' (not yet seen), 'rebirth' (no rebirth yet), 'level' (below 100), or null (it has, or
   * it is not time yet). Shown in the journal, so nobody stands in the Deep wondering where the quest is.
   */
  actThreeWait() {
    const p = this.player;
    if (this.trial || this.questState('starwell') !== 'done') return null;
    if (this.questState('deep1') || this.questOpen('deep1')) return null;
    if (this.actThreeReady(p)) return p.level < QUESTS.deep1.level ? 'level' : null;
    if (!(p.endings && p.endings.self > 0)) return 'unwish';
    if (!(p.rebirth && p.rebirth.n >= 1)) return 'rebirth';
    if (p.level < QUESTS.deep1.level) return 'level';
    return null;
  }

  /** (0.70.5) Has this hero (or any class of the account) seen the Unwish and begun again once? */
  actThreeReady(p = this.player) {
    if (p.endings && p.endings.self > 0 && p.rebirth && p.rebirth.n >= 1) return true;
    return !!(p.lives && Object.values(p.lives).some((l) => l && l.act3));
  }

  /** (0.70.4) EXP from Mastery: +25% for each class mastered on the account (its Quiet beaten), up to +75%. */
  masteryExp(p = this.player) {
    return Math.min(MASTERY.expMax, MASTERY.exp * this.mastery(p).mastered.length);
  }

  /**
   * (0.70.4) The deepest Depth any class of the account has opened: the one past the deepest
   * Primordial it has beaten (VI once any has; the Quiet is the last). The Primordial quests still have to
   * be done on each class: they are what count for its Mastery.
   */
  acctDeep(p = this.player) {
    let best = 0;
    for (const c in p.lives || {}) {
      const l = p.lives[c];
      if (!l || !Array.isArray(l.prim) || !l.prim.length) continue;
      best = Math.max(best, Math.min(DEPTH_IDS[DEPTH_IDS.length - 1], Math.max(...l.prim) + 1));
    }
    return best;
  }

  /** (0.70.1) Can the Waygate take this hero to this ordinary map (found already, or the road open)? */
  mapKnown(id, p = this.player) {
    return p.visited.includes(id) || (ROAD_MAPS.includes(id) && this.roadOpen(p));
  }

  /** (0.65) How strong a worn class or unique Immortal's passive is, by its stars: 1 to 2. */
  pot(key) {
    return (this.mods.pot && this.mods.pot[key]) || 1;
  }

  /** (0.70) The subclasses this hero may borrow from: those of every class whose Quiet has fallen, but its own. */
  borrowable() {
    return borrowable(this.cls, this.mastery().mastered, SPECS);
  }

  /** (0.70) Put a borrowed skill in D or F (null empties it). Only between fights: in a safe place or not in combat. */
  setBorrowed(slot, spec) {
    const p = this.player;
    if (!BORROW_SLOTS.includes(slot)) return;
    if (spec != null && !this.borrowable().includes(spec)) return;
    const other = slot === 'd' ? 'f' : 'd';
    if (spec && p.borrowed[other] === spec) p.borrowed[other] = p.borrowed[slot]; // swap them over
    p.borrowed[slot] = spec || null;
    if (p.borrowed.d !== 'berserker' && p.borrowed.f !== 'berserker') p.oathOn = false; // (0.71.2) Blood Oath taken off: it goes off
    p.cd[slot] = Math.max(p.cd[slot] || 0, this.map && this.map.safe ? 0 : 5); // no swapping one in fresh mid-fight
    this.recalcStats();
    this.emit('borrowed', { slot, spec: p.borrowed[slot] });
  }

  /** (0.71.5) Is an Oath on that turns lifesteal up (Crimson Oath, or the Berserker's Blood Oath borrowed)? */
  oathLeech(p = this.player) {
    return this.frenzyActive(p) || !!(p && (p.oathOn || p.oathT > 0));
  }

  /** (0.71.2) Is Crimson Oath on (the toggle, or the Crown of the Last Breath's few seconds)? */
  frenzyActive(p = this.player) {
    return !!(p && (p.frenzyOn || p.frenzyT > 0));
  }

  /** (0.70) The Blood Oath your subclass gets, while it holds (null otherwise). */
  oathOf() {
    const p = this.player;
    return p && (p.oathOn || p.oathT > 0) ? OATH[p.spec] || OATH.none : null;
  }

  /** (0.70) Anchor Shot, Smoke Snare, Gravity Anchor: drag everything near a point into it, stun it (bosses stagger), and hit it. */
  pullStun(x, z, radius, stun, dmg, slot, vuln = 0) {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn' || dist(e.x, e.z, x, z) > radius + e.radius) continue;
      if (!e.def.boss && !e.def.heavy) {
        const a = dAtan2(e.z - z, e.x - x);
        const to = this.clampToArena(x + dCos(a) * (e.radius + 0.4), z + dSin(a) * (e.radius + 0.4), e.radius);
        e.x = e.px = to.x;
        e.z = e.pz = to.z;
      }
      if (vuln > 0) {
        e.vulnT = Math.max(e.vulnT || 0, 5);
        e.vuln = Math.max(e.vuln || 0, vuln);
      }
      if (dmg > 0) this.hitEnemy(e, dmg, { source: slot });
      if (e.dead) continue;
      if (e.def.boss) this.addPosture(e, 2, false);
      else this.stun(e, stun);
    }
    this.emit('cast', { slot, fx: 'nova', x, z, radius, pull: true });
  }

  /** (0.70) Gale Motes: homing motes at enemies near you whenever a spell is cast. */
  looseCastMotes(count) {
    const p = this.player;
    const near = this.enemies.filter((e) => !e.dead && e.state !== 'spawn' && dist(e.x, e.z, p.x, p.z) <= 13 + e.radius).sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z));
    if (!near.length) return;
    for (let i = 0; i < count; i++) {
      const t = near[i % near.length];
      const a = dAtan2(t.z - p.z, t.x - p.x) + (i - (count - 1) / 2) * 0.7;
      this.projectiles.push({ id: this.nextId++, owner: 'player', kind: 'mote', slot: 'gale', pid: this.cur.pid, targetId: t.id, x: p.x + dCos(a) * 0.6, z: p.z + dSin(a) * 0.6, px: p.x, pz: p.z, vx: dCos(a) * 22, vz: dSin(a) * 22, speed: 22, radius: 0.4, dmg: p.stats.ad * (this.mods.castMotesDmg || 0.35), parryable: false, reflected: false, life: 1.6, dead: false });
    }
    this.emit('motes', { x: p.x, z: p.z, count });
  }

  /** (0.68) The Animus asked of this hero here: the most any enemy within reach asks (0 if none). */
  willNeed(p) {
    const W = CONFIG.WILL;
    if (this.trial) return 0;
    if (this.mode === 'arena') return this.ring && this.wave && this.wave.phase === 'active' && this.enemies.some((e) => !e.dead) ? RING.animus(this.wave.n) : 0;
    if (this.mode !== 'explore' || !this.map || !CAELUM.maps[this.map.id]) return 0;
    let need = 0;
    for (const e of this.enemies) if (!e.dead && e.animusNeed > need && dist(e.x, e.z, p.x, p.z) <= W.range) need = e.animusNeed;
    return need;
  }

  /**
   * The Will (0.68, CONFIG.WILL): every few seconds, while this hero is short of the Animus asked here,
   * an amber ring follows them and lands as a Dominion. Those with the Animus are never asked.
   */
  stepWill(dt) {
    const p = this.player;
    const h = this.cur; // its state lives on the hero record, not the player (which is sent to friends whole)
    const W = CONFIG.WILL;
    if (!p || !h) return;
    if (h.willGrace > 0) h.willGrace -= dt;
    if (p.dead) {
      if (h.will) this.endWill(h);
      return;
    }
    const need = this.willNeed(p);
    if (!need || !animusShort(p.animus, need)) {
      if (h.will) this.endWill(h);
      h.willT = Math.max(h.willT ?? 0, W.first);
      return;
    }
    if (h.will) {
      const wl = h.will;
      wl.t += dt;
      Object.assign(wl.tele, { x: p.x, z: p.z, t: wl.t, dur: wl.dur, cue: wl.dur - wl.t <= CONFIG.PARRY_CUE_LEAD, dominion: need });
      if (wl.t >= wl.dur) {
        wl.n++;
        this.willHit = true; // its own strike is not softened by the guard
        const res = p.lockT > 0 && wl.n > 1 ? 'locked' : this.hitPlayer(W.dmg, { parryable: true, dominion: true, need, src: null, parryWin: this.parry.perfect });
        this.willHit = false;
        // (a friend's strike held for their lag is judged later: carry on unless it has already locked them)
        if ((res === 'parried' || (res === 'held' && !(p.lockT > 0))) && wl.n < W.strikes && !p.dead) {
          wl.t = 0; // the next strike comes quickly
          wl.dur = W.gap;
          this.emit('willAgain', { n: wl.n, of: W.strikes, x: p.x, z: p.z });
        } else {
          if (res === 'parried') this.emit('willPassed', { x: p.x, z: p.z });
          this.endWill(h);
          h.willT = W.every[0] + this.rng() * (W.every[1] - W.every[0]);
        }
      }
      return;
    }
    h.willT = (h.willT ?? W.first) - dt;
    if (h.willT > 0) return;
    const tele = { id: this.nextId++, will: true, kind: 'circle', x: p.x, z: p.z, dir: 0, radius: W.radius, t: 0, dur: W.windup, parryable: true, cue: false, dominion: need };
    this.telegraphs.push(tele);
    h.will = { t: 0, dur: W.windup, tele, n: 0 };
    if (!h.willSeen) {
      h.willSeen = true;
      this.emit('willFirst', { need, have: p.animus || 0, strikes: W.strikes });
    }
  }

  endWill(h) {
    if (h.will) {
      this.telegraphs = this.telegraphs.filter((t) => t !== h.will.tele);
      h.willGrace = CONFIG.WILL.grace;
    }
    h.will = null;
  }

  /** (0.69) While the Will is on this hero (and a moment after), everything else hits them softly. */
  willGuarded() {
    const h = this.cur;
    return !this.willHit && !!h && (!!h.will || h.willGrace > 0);
  }

  /** Arriving on a Caelum map short of what it asks: say so (0.64). You may still try. */
  caelumWarn(id) {
    const C = CAELUM.maps[id];
    const p = this.player;
    if (C && animusShort(p.animus, C.animus)) this.emit('animusShort', { id, name: C.name, need: C.animus, have: p.animus || 0 });
  }

  /** Damage that got through: the Arcane Ward first, then health (and what follows from that). */
  takeDamage(dmg, src, doom) {
    const p = this.player;
    if (this.willGuarded()) dmg *= CONFIG.WILL.guard; // (0.69) the Will's test is the parries
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
    amount *= 1 + this.masteryExp(); // (0.70.4) and each class mastered on the account
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
      if (p.level >= CONFIG.MAX_LEVEL) this.cinderTiers();
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
    const run = T.n >= 2 ? 1 + (p.streak || 0) * CONFIG.STREAK_LOOT : 1;
    const streak = run * (e.lootMult || 1); // (0.65) the Deep and Caelum pay their own share
    const pile = hoard ? Math.max(1, Math.round(hoard.items * fall * run * Math.min(1.5, e.lootMult || 1) * (e.bars ? CAELUM.bossLoot.items : 1))) : 0; // (0.71.1) twice the pile from a Granted
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
      if (e.bars && hoard) for (let k = 0; k < CAELUM.bossLoot.immortal; k++) extra.push(rollItem(this.rng, Math.max(1, Math.round(e.level)), { weights: RARITY_ONLY(IMMORTAL), cls: this.cls })); // (0.71.1) a sure Immortal (food for an Eternal)
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
        if (i === 0) opts = e.firstKill ? { minRarity: hoard.first, weights: RARITY_ONLY(hoard.first), cls: this.cls } : { weights: e.bars ? CAELUM.bossLoot.top : hoardTop(hoard.top, this.depthNow() || T.n), cls: this.cls }; // (0.66) better each world; (0.71.1) a Granted's best
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
    this.eternalDrop(e); // (0.71) a Granted, in Caelum
    if (e.type === DEEP.depths[6].primordial) this.cinderTiers();
    // Keys and shards from a boss you have outgrown come only some of the time.
    const more = e.bars ? CAELUM.bossLoot.keys : 1; // (0.71.1)
    const keys = (fall >= 1 || this.rng() < fall ? loot.keys : 0) * more;
    const tickets = (fall >= 1 || this.rng() < fall ? loot.tickets : 0) * more;
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
      // Act III (0.54): after the Unwish ending, and at least one rebirth; level 100 every life.
      // (0.70.5) Or once any class of the account has done both: the next class goes straight on.
      const p = this.player;
      if (!this.actThreeReady(p) || p.level < q.level) return false;
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
    if (st.n < this.questNeed(q)) this.autoRoadQuests(); // (0.71.3) the road's steps, done for you
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

  /**
   * (0.71.3) Once the road is open (any class has beaten the Cinder), the story's "go there" steps on it
   * are done for you: reaching a map from the Greenwood to Starfall Sanctum, or reading the one stone
   * a quest sends you to on it (W.'s, at Frostfall Pass). After a rebirth you need not walk back to them.
   */
  autoRoadQuests() {
    const p = this.player;
    if (!p || !this.roadOpen(p)) return;
    for (const id in p.quests) {
      const st = p.quests[id];
      const q = QUESTS[id];
      if (!q || st.s !== 'active') continue;
      const g = q.goal;
      const onRoad = (g.reach && ROAD_MAPS.includes(g.reach)) || (g.sign && SIGNS[g.sign] && ROAD_MAPS.includes(SIGNS[g.sign].map));
      if (!onRoad) continue;
      st.n = this.questNeed(q);
      st.s = 'ready';
      st.road = true;
      this.questStamp++;
      this.emit('quest', { id, what: 'ready', name: q.name, n: st.n, need: st.n, giver: NPCS[this.questTaker(q.giver)].name, road: true });
    }
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
      if (id === 'deep6q') {
        this.emit('ending', { kind: 'primordial' });
        // (0.70.2) the Quiet beaten: this class is mastered, and every other class may borrow from its subclasses
        this.emit('mastered', { cls: this.cls, name: CLASSES[this.cls].name, specs: Object.keys(SPECS).filter((s) => SPECS[s].cls === this.cls).map((s) => SPECS[s].name) });
      }
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
    } else if (this.autoTake(item)) {
      // (0.75) fed to an Eternal
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
    if (SETTLERS[npcId]) {
      // (0.80) a settler: a book when one of their wishes is answered and waiting, '!' while one is on the board
      const k = this.player.keep;
      const mine = k ? k.wishes.filter((w) => w.who === npcId) : [];
      return mine.some((w) => w.done) ? 'ready' : mine.length ? 'progress' : '';
    }
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
    const n = CONFIG.CHESTS_PER_MAP + (rng() < 0.5 ? 1 : 0) + (this.map.chestSpots ? this.map.chestSpots.length : 0);
    for (let i = 0; i < n; i++) this.addChest();
  }

  addChest() {
    const rng = this.streamRng('chest', ++this.chestCount); // its own dice: chests never change any other roll
    const map = this.map;
    // (0.64) a road map's shrines each keep a chest at the end of their side path, and fill it first
    const spot = (map.chestSpots || []).find((c) => !this.chests.some((o) => dist(o.x, o.z, c.x, c.z) < 3));
    if (spot) {
      const chest = { id: this.nextId++, x: spot.x, z: spot.z, tier: rng() < 0.4 ? 'radiant' : 'gilded', level: Math.max(1, (map.level || 1) + (map.levelSpan || 0)), seed: Math.floor(rng() * 1e9) };
      this.chests.push(chest);
      return chest;
    }
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
    if (this.mode === 'explore' && this.map && CAELUM.maps[this.map.id]) return MAX_TIER; // and Caelum (0.64)
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
    if (CAELUM.maps[this.map.id]) return 0; // Caelum (0.64) is its own place, whatever Depth is chosen in Haven
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
    if (this.acctDeep(p) >= d) return true; // (0.70.4) as deep as any class of the account has gone
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
    const C = !rift && CAELUM.maps[this.map.id];
    if (C) {
      // Caelum (0.64): tier V times the map's own; no Ember, an Animus instead (see hitPlayer)
      hp *= C.hp * CAELUM.hard.hp; // (0.70) and harder again, now that borrowed skills are earned before it
      if (e.def.boss && e.def.granted) {
        hp *= CAELUM.bossHp; // (0.71) a hundred lives deep
        e.bars = CAELUM.bossBars;
      }
      dmg *= C.dmg * CAELUM.hard.dmg;
      exp *= C.exp;
      e.animusNeed = C.animus;
    }
    // (0.65) Faster from world tier II up, and faster again in the Deep and Caelum (endgame.js TIERS pace)
    if (!rift) {
      const Tp = TIERS[tier];
      const zone = depth ? DEEP.depths[depth] : C || null;
      this.setPace(e, Tp.pace * ((zone && zone.pace) || 1), Tp.tempo * ((zone && zone.pace) || 1), Tp.move);
      if (zone && zone.loot) e.lootMult = zone.loot; // ...and paid for it
    }
    const T = TIERS[tier];
    const chance = (rift ? 0.1 : tier >= 2 || (this.map.level || 0) >= ELITE_FROM_LEVEL ? T.elite : 0) + (this.map.wilds ? WILDS.elite : 0);
    if (!e.def.boss && (camp.def.elite || this.rng() < chance)) this.makeElite(e, rift ? Math.min(3, 1 + Math.floor(rift.tier / 8)) : T.affixes); // (0.64) a camp's captain is always one
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
    e.goldValue = Math.round(e.goldValue * exp * (e.bars ? CAELUM.bossLoot.gold : 1)); // (0.71.1) a Granted pays for its hundred bars
    if (e.elite && e.elite.includes('shielded')) e.shield = e.maxShield = Math.round(e.maxHp * 0.4);
    else if (e.def.shield) e.shield = e.maxShield = Math.round(e.maxHp * e.def.shield); // Court Guards (0.39)
    return e;
  }

  /** (0.65) How quickly an enemy attacks: `pace` scales wind-ups (never under 0.3 s), `tempo` the rest between attacks, `move` its speed. */
  setPace(e, pace = 1, tempo = 1, move = 1) {
    e.pace = (e.pace || 1) * pace;
    e.tempo = (e.tempo || 1) * tempo;
    e.move = (e.move || 1) * move;
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
  rerollLine(slot, key, essence = false, quiet = false) {
    const p = this.player;
    const item = p.equipped[slot];
    if (!item || !(key in item.stats)) return false;
    if (essence) {
      // Echoes (0.53): a reroll for Echo Essence instead of gold and scrap
      if (!p.rebirth || p.rebirth.essence < ECHOES.reroll) return quiet ? false : this.emit('cantAfford');
      p.rebirth.essence -= ECHOES.reroll;
    } else {
      const cost = rerollCost(item);
      if (p.gold < cost.gold || p.scrap < cost.scrap) {
        if (!quiet) this.emit('cantAfford');
        return false;
      }
      p.gold -= cost.gold;
      p.scrap -= cost.scrap;
    }
    const from = item.stats[key];
    item.stats[key] = rollLine(key, item, this.rng);
    item.rerolls = (item.rerolls || 0) + 1;
    // (0.62) pity: the 30th reroll without an Immortal-tier line lands one
    const top = topTier(item); // (0.75.3) on Eternal gear the pity is for an Eternal-tier line
    let pity = false;
    if (lineTier(item, key) >= top) item.pity = 0;
    else if ((item.pity = (item.pity || 0) + 1) >= REROLL_PITY) {
      item.stats[key] = immortalLine(key, item, this.rng);
      item.pity = 0;
      pity = true;
    }
    if (quiet) return true; // (0.81.6) the auto-roller tells it all at once
    this.recalcStats();
    this.emit('rerolled', { slot, key, from, value: item.stats[key], tier: lineTier(item, key), name: item.name, pity });
    return true;
  }

  /**
   * (0.81.6) The auto-roller, once a class on the account has beaten the Quiet: reroll the chosen lines of
   * one equipped piece until each is at least the tier asked for, or the rerolls allowed (at most
   * AUTO_ROLL_MAX), or the gold and scrap (or Echo Essence), run out. A line already there is never touched.
   * `targets`: { statKey: tier } with tier a rarity index (3 Epic ... 6 Immortal, 7 Eternal on Eternal gear).
   */
  autoRoll(slot, targets, max, essence = false) {
    const p = this.player;
    const item = p.equipped[slot];
    if (!item || !targets || typeof targets !== 'object') return;
    if (!this.autoRollOpen()) return this.emit('autoRollShut');
    const top = topTier(item);
    const want = {};
    for (const k of Object.keys(item.stats)) {
      const t = Math.floor(Number(targets[k]));
      if (Number.isFinite(t) && t >= 1) want[k] = Math.min(top, t);
    }
    if (!Object.keys(want).length) return;
    max = Math.max(1, Math.min(AUTO_ROLL_MAX, Math.floor(Number(max)) || 50));
    const before = {};
    for (const k in want) before[k] = { tier: lineTier(item, k), value: item.stats[k] };
    const g0 = p.gold, s0 = p.scrap, e0 = p.rebirth ? p.rebirth.essence : 0;
    let rolls = 0, why = 'done';
    for (;;) {
      const k = Object.keys(want).find((x) => lineTier(item, x) < want[x] && rollQuality(item, x) < 1);
      if (!k) break;
      if (rolls >= max) {
        why = 'limit';
        break;
      }
      if (!this.rerollLine(slot, k, essence, true)) {
        why = 'funds';
        break;
      }
      rolls++;
    }
    if (rolls) this.recalcStats();
    const lines = Object.keys(want).map((k) => ({ key: k, from: before[k].value, to: item.stats[k], fromTier: before[k].tier, tier: lineTier(item, k), want: want[k] }));
    this.emit('autoRolled', { slot, name: item.name, rolls, why, gold: g0 - p.gold, scrap: s0 - p.scrap, essence: e0 - (p.rebirth ? p.rebirth.essence : 0), lines });
  }
  /** (0.81.6) The auto-roller opens with the first class on the account to beat the Quiet. */
  autoRollOpen(p = this.player) {
    return !this.trial && this.mastery(p).mastered.length > 0;
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
    const stock = MERCHANT.stock.filter((s) => !s.chance || rng() < s.chance).map((s) => Object.assign({}, s, { gold: s.gold ? Math.round(s.gold * lv) : 0, tickets: s.tickets || 0, bought: {} }));
    // (0.66) and five wares, fresh each visit
    const total = MERCHANT.wares.reduce((a, w) => a + w.weight, 0);
    for (let i = 0; i < MERCHANT.wareSlots; i++) {
      let roll = rng() * total, w = MERCHANT.wares[0];
      for (const o of MERCHANT.wares) if ((roll -= o.weight) <= 0) { w = o; break; }
      const n = w.n ? w.n[0] + Math.floor(rng() * (w.n[1] - w.n[0] + 1)) : 0;
      stock.push({ kind: w.kind, n, min: w.min || 0, label: w.label(n), gold: w.goldEach ? Math.round(w.goldEach * n * lv) : 0, tickets: w.tickets || 0, ware: true, bought: {} });
    }
    const id = this.nextId++;
    this.merchant = { id, x: c.x, z: c.z, left: MERCHANT.stay, level: L, stock };
    this.merchantAt = this.ticks;
    const frag = stock.filter((s) => s.kind === 'fragment').reduce((a, s) => a + s.n, 0);
    this.emit('merchantArrive', { map: this.map.name, x: c.x, z: c.z, fragments: frag, immortal: stock.some((s) => s.kind === 'immortal') });
    return this.merchant;
  }

  /**
   * Buy from the merchant. (0.66) In a party everyone may buy each ware once (`bought` by player); your
   * first buy from a merchant keeps you from buying from another one for MERCHANT.buyerCd seconds.
   */
  buyMerchant(i) {
    const mc = this.merchant;
    const p = this.player;
    if (!mc || dist(p.x, p.z, mc.x, mc.z) > CONFIG.INTERACT_RANGE + 1.5) return;
    const s = mc.stock[i];
    const me = this.cur.pid;
    if (!s) return;
    s.bought = s.bought || {};
    if (s.bought[me] || s.sold) return;
    if (p.merchantCd > 0 && p.merchantId !== mc.id) {
      this.emit('merchantWait', { left: Math.ceil(p.merchantCd) });
      return;
    }
    if (p.gold < s.gold || p.tickets < s.tickets) {
      this.emit('cantAfford');
      return;
    }
    const goods = s.kind === 'gear' || s.kind === 'set' || s.kind === 'immortal';
    if (goods && p.bag.length >= this.bagSize(p)) {
      this.emit('bagFull');
      return;
    }
    p.gold -= s.gold;
    p.tickets -= s.tickets;
    s.bought[me] = true;
    if (p.merchantId !== mc.id) {
      p.merchantId = mc.id;
      p.merchantCd = MERCHANT.buyerCd;
    }
    let item = null;
    if (s.kind === 'dust') p.dust += s.n;
    else if (s.kind === 'glass') this.giveMisc('glass', 1);
    else if (s.kind === 'fragment') this.giveMisc('fragment', s.n);
    else if (s.kind === 'keys') p.keys = (p.keys || 0) + s.n;
    else if (s.kind === 'set') item = rollSetPiece(this.rng, mc.level, this.cls, p.spec);
    else if (s.kind === 'immortal') item = rollItem(this.rng, mc.level, { minRarity: 6, weights: [0, 0, 0, 0, 0, 0, 1], cls: this.cls });
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
    if (dup.locked) return this.emit('itemIsLocked', { name: dup.name }); // (0.75.2)
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
      [ex]: ex === 'tickets' || ex === 'dust' ? BOUNTY.extra[ex][0] + Math.floor(rng() * (BOUNTY.extra[ex][1] - BOUNTY.extra[ex][0] + 1)) : ex === 'sigil' ? 1 : Math.round(60 * (1 + 0.15 * p.level) * (tier >= 2 ? TIERS[tier].loot : 1)),
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

  // =========================================================================
  // The Wishkeep (0.80, the rules and numbers are in sim/wishkeep.js)
  // =========================================================================
  /** What the account has done that the keep is built on: the classes mastered, the Eternal slots filled, the Granted beaten, Wishborne levels and rebirths. */
  keepRecord() {
    const p = this.player;
    const halls = masteryFor(p.lives, this.cls, p.rebirth).mastered.slice();
    const relics = new Set(), echoes = new Set();
    let wish = p.wish || 0;
    for (const s of SLOTS) if ((p.equipped[s] && p.equipped[s].eternal) || (p.eternals && p.eternals[s])) relics.add(s);
    for (const t of p.eternalFirsts || []) echoes.add(t);
    for (const c in p.lives || {}) {
      if (c === this.cls || !p.lives[c]) continue;
      const L = p.lives[c];
      for (const s of Array.isArray(L.et) ? L.et : []) if (SLOTS.includes(s)) relics.add(s);
      for (const t of Array.isArray(L.gr) ? L.gr : []) echoes.add(String(t));
      wish += Math.max(0, Math.floor(Number(L.wish) || 0));
    }
    return { halls, relics: SLOTS.filter((s) => relics.has(s)), echoes: [...echoes].sort(), wish, rebirths: p.acctRebirths || 0 };
  }

  /** The keep opens once any class on the account has beaten the Quiet. */
  keepOpen() {
    const p = this.player;
    return !this.trial && masteryFor(p.lives, this.cls, p.rebirth).mastered.length >= 1;
  }

  /** On arriving: found the keep the first time, bring in whoever has come, fill the board. */
  keepStart() {
    const p = this.player;
    if (!this.keepOpen()) return;
    if (!p.keep) {
      const r = this.keepRecord(), S = KEEP.start;
      p.keep = cleanKeep({ tier: 1, faith: Math.min(S.wishMax, Math.round(S.perWish * Math.sqrt(r.wish))) + Math.min(S.rebirthMax, S.perRebirth * r.rebirths) });
      // the first wish is always the start of the story
      p.keep.wishN = 1;
      p.keep.wishes.push({ id: 'k1', kind: 'tell', who: 'ysolde', line: 0, n: 0, need: 1, done: false, ch: CHAPTERS[0].id, reward: { faith: KEEP.reward.tell[0], stone: KEEP.reward.tell[1] } });
      this.emit('keepFounded', { faith: p.keep.faith });
    }
    for (const id of settlersAt(p.keep.tier)) if (!p.keep.settlers[id]) p.keep.settlers[id] = { bond: 0 };
    this.keepFill();
    if (p.keep.tier >= 3 && !p.glows.includes('wishkeep')) this.unlockGlow('wishkeep');
  }

  /** (0.81) After the map is in place: the keep's heroes at their posts and its buildings as they were left. */
  keepArrive() {
    this.troops = [];
    this.keepBuilds = [];
    if (!this.inKeep()) return;
    this.keepTroopsUp();
    this.keepBuildsUp();
  }

  /** Faith answered wishes bring, times this: the Observatory, the Altar's relics and the settlers' levels. */
  keepMult() {
    const k = this.player.keep;
    if (!k) return 1;
    let lv = 0;
    for (const id in k.settlers) lv += settlerLevel(k.settlers[id]);
    return (1 + KEEP.faithPerRelic * this.keepRecord().relics.length + KEEP.faithPerSettlerLvl * lv) * (1 + 0.05 * ((k.btier && k.btier.hearth) || 0)); // (0.82.1) the Hearth's tier
  }

  keepFill() {
    const k = this.player.keep;
    if (!k) return;
    const size = KEEP.tiers[k.tier].board;
    while (k.wishes.length < size) k.wishes.push(this.keepWish());
  }

  /** A new wish from one of the settlers. */
  keepWish() {
    const p = this.player, k = p.keep;
    k.wishN = (k.wishN || 0) + 1;
    const rng = this.streamRng('keepwish', k.wishN * 7919 + k.answered * 31 + k.tier);
    const on = k.wishes;
    const has = (kind) => on.some((w) => w.kind === kind);
    const rec = this.keepRecord();
    const chapter = CHAPTERS.find((c) => !k.told.includes(c.id) && c.need(rec) && !on.some((w) => w.ch === c.id));
    const BOSSES = ['boss', 'boss2', 'boss3', 'herald', 'cinder', 'undertow', 'rootmother', 'choir', 'stillness'];
    const bosses = BOSSES.filter((t) => p.bossKills[t] > 0 && !on.some((w) => w.boss === t));
    const maps = MAP_IDS.filter((id) => !MAPS[id].safe && !MAPS[id].bossOnly && !MAPS[id].caelum && p.visited.includes(id) && !on.some((w) => w.map === id));
    const kinds = ['offer', 'offer'];
    if (chapter && !has('tell')) kinds.push('tell', 'tell', 'tell');
    if (!has('tide')) kinds.push('tide', 'tide');
    if (maps.length) kinds.push('kill', 'kill', 'kill');
    if (bosses.length && !has('boss')) kinds.push('boss');
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const here = settlersAt(k.tier);
    const w = { id: 'k' + k.wishN, kind, who: kind === 'tell' ? 'ysolde' : here[Math.floor(rng() * here.length)], line: Math.floor(rng() * 9), n: 0, need: 1, done: false };
    if (kind === 'kill') {
      w.map = maps[Math.floor(rng() * maps.length)];
      w.mapName = MAPS[w.map].name;
      const [lo, hi] = KEEP.killNeed;
      w.need = Math.max(5, Math.round((lo + Math.floor(rng() * (hi - lo + 1)))));
    } else if (kind === 'boss') {
      w.boss = bosses[Math.floor(rng() * bosses.length)];
      w.bossName = ENEMIES[w.boss].name;
    } else if (kind === 'offer') {
      const whats = Object.keys(KEEP.offers).filter((x) => !on.some((o) => o.kind === 'offer' && o.what === x)); // (0.80.1) never the same offering twice
      w.what = (whats.length ? whats : Object.keys(KEEP.offers))[Math.floor(rng() * (whats.length || Object.keys(KEEP.offers).length))];
      w.need = Math.max(1, Math.round(KEEP.offers[w.what]));
    } else if (kind === 'tell') w.ch = chapter.id;
    const base = KEEP.reward[kind];
    w.reward = { faith: Math.round(base[0] * (0.85 + rng() * 0.3)), stone: base[1] };
    return w;
  }

  /** Something a wish might be waiting for happened. */
  keepEvent(kind, ctx = {}) {
    const k = this.player.keep;
    if (!k || this.trial) return;
    // (0.82.1) a tithe from the hero's road: a little Faith for every kill, more and Wishstone for a boss
    if (kind === 'kill' || kind === 'boss') {
      const acc = k.acc || (k.acc = { faith: 0, stone: 0 });
      const f = acc.faith + (kind === 'boss' ? 12 : 0.25), st = acc.stone + (kind === 'boss' ? 2 : 0.02);
      k.faith += Math.floor(f);
      k.stone += Math.floor(st);
      acc.faith = Math.round((f - Math.floor(f)) * 1000) / 1000;
      acc.stone = Math.round((st - Math.floor(st)) * 1000) / 1000;
    }
    for (const w of k.wishes) {
      if (w.done) continue;
      if (kind === 'kill' && w.kind === 'kill' && w.map === ctx.map) w.n++;
      else if (kind === 'boss' && w.kind === 'boss' && w.boss === ctx.type) w.n++;
      else if (kind === 'tide' && w.kind === 'tide') w.n++;
      else continue;
      if (w.n >= w.need) {
        w.n = w.need;
        w.done = true;
        this.emit('keepWishDone', { who: SETTLERS[w.who].name, kind: w.kind });
      }
    }
  }

  /** Answer a wish at the board: an offering is paid and a story heard here; the rest once they are done. */
  keepAnswer(i) {
    const p = this.player, k = p.keep;
    const w = k && k.wishes[i];
    if (!w || !this.map || this.map.id !== KEEP.map) return;
    if (w.kind === 'offer' && !w.done) {
      const have = w.what === 'fragment' ? p.misc.fragment || 0 : p[w.what] || 0;
      if (have < w.need) return this.emit('keepShort', { what: w.what, need: w.need, have });
      if (w.what === 'fragment') p.misc.fragment = have - w.need;
      else p[w.what] = have - w.need;
      w.done = true;
    }
    if (w.kind === 'tell' && !w.done) {
      w.done = true;
      if (!k.told.includes(w.ch)) k.told.push(w.ch);
      this.emit('keepStory', { ch: w.ch });
    }
    if (!w.done) return;
    const faith = Math.round(w.reward.faith * this.keepMult());
    k.faith += faith;
    k.stone += w.reward.stone;
    k.answered++;
    const s = k.settlers[w.who] || (k.settlers[w.who] = { bond: 0 });
    const before = settlerLevel(s);
    s.bond++;
    const after = settlerLevel(s);
    k.wishes.splice(i, 1);
    this.keepFill();
    this.emit('keepAnswered', { who: SETTLERS[w.who].name, faith, stone: w.reward.stone, level: after > before ? after : 0 });
  }

  /** Swap a wish for another (a little Faith). */
  keepSkip(i) {
    const k = this.player.keep;
    if (!k || !k.wishes[i] || k.wishes[i].done || !this.map || this.map.id !== KEEP.map) return;
    if (k.faith < KEEP.skip) return this.emit('keepShort', { what: 'faith', need: KEEP.skip, have: k.faith });
    k.faith -= KEEP.skip;
    this.keepSpend({ faith: KEEP.skip });
    k.wishes.splice(i, 1);
    this.keepFill();
  }

  /** Raise the keep a tier, at the Hearth: more people, a bigger board. */
  keepTier() {
    const k = this.player.keep;
    const next = k && KEEP.tiers[k.tier + 1];
    if (!next || !this.map || this.map.id !== KEEP.map) return;
    if (k.faith < next.cost.faith || k.stone < next.cost.stone) return this.emit('keepShort', { what: 'tier', need: next.cost.faith, have: k.faith });
    k.faith -= next.cost.faith;
    k.stone -= next.cost.stone;
    this.keepSpend(next.cost);
    const had = new Set(settlersAt(k.tier));
    k.tier++;
    const came = settlersAt(k.tier).filter((id) => !had.has(id));
    for (const id of came) k.settlers[id] = k.settlers[id] || { bond: 0 };
    this.keepFill();
    if (k.tier >= 3) this.unlockGlow('wishkeep');
    this.emit('keepTier', { tier: k.tier, numeral: next.numeral, name: next.name, came: came.map((id) => SETTLERS[id].name) });
  }

  /** Raise a class's hall a level (open once that class is mastered). */
  keepHall(cls) {
    const k = this.player.keep;
    if (!k || !HALLS[cls] || !this.map || this.map.id !== KEEP.map) return;
    if (!this.keepRecord().halls.includes(cls)) return this.emit('keepHallShut', { name: HALLS[cls].name, cls });
    const lvl = k.halls[cls] || 0;
    if (lvl >= KEEP.hallMax) return;
    const cost = KEEP.hallCost(lvl + 1);
    if (k.faith < cost.faith || k.stone < cost.stone) return this.emit('keepShort', { what: 'hall', need: cost.faith, have: k.faith });
    k.faith -= cost.faith;
    k.stone -= cost.stone;
    this.keepSpend(cost);
    k.halls[cls] = lvl + 1;
    this.emit('keepHallUp', { name: HALLS[cls].name, level: lvl + 1 });
  }

  // ---------------------------------------------------------------- (0.81) the keep's heroes and halls
  /** Is this hall standing and raised (level 1+), so its work can be used? */
  hallWorks(cls) {
    const k = this.player.keep;
    return !!k && (k.halls[cls] || 0) >= 1 && this.keepRecord().halls.includes(cls) && !this.wrecked(cls);
  }
  wrecked(id) {
    const k = this.player.keep;
    return !!k && k.builds[id] != null && k.builds[id] <= 0;
  }
  /** Pay from the keep, or say what is short. True if paid. */
  keepPay(cost, what) {
    const k = this.player.keep;
    if (!k || k.faith < (cost.faith || 0) || k.stone < (cost.stone || 0)) {
      this.emit('keepShort', { what: what || 'faith', need: cost.faith || 0, have: k ? k.faith : 0, stone: cost.stone || 0 });
      return false;
    }
    k.faith -= cost.faith || 0;
    k.stone -= cost.stone || 0;
    this.keepSpend(cost);
    return true;
  }
  /** (0.82.1) What is spent on the keep makes it grow (Wishstone counted ten times). */
  keepSpend(cost) {
    const k = this.player.keep;
    if (!k) return;
    const before = keepStage(k);
    k.spent = (k.spent || 0) + (cost.faith || 0) + 10 * (cost.stone || 0);
    const after = keepStage(k);
    if (after > before) this.emit('keepGrew', { stage: after, name: GROWTH.names[after] });
  }
  /** (0.82.1) Build or raise one of the works (a mine, a field). (0.88) Once the keep has grown enough for it. */
  keepWork(id) {
    const k = this.player.keep, W = WORKS[id];
    if (!this.inKeep() || !W) return;
    if (W.stage > keepStage(k)) return this.emit('keepMaxed', { name: W.name, what: 'stage', stage: W.stage });
    const lvl = (k.works[id] || 0) + 1;
    if (lvl > W.max) return this.emit('keepMaxed', { name: W.name, what: 'level' });
    this.keepClock(this.keepNow || 0); // (bank what came in at the old rate first)
    if (!this.keepPay(W.cost(lvl))) return;
    k.works[id] = lvl;
    this.emit('keepWorkUp', { id, name: W.name, level: lvl });
  }
  /** (0.82.1) Raise a building a tier (Common to Immortal), once its hall is at its last level. */
  keepBuildTier(id) {
    const k = this.player.keep;
    if (!this.inKeep() || !BUILD_IDS.includes(id) || (this.tide && this.tide.state === 'on')) return;
    const ready = id === 'hearth' ? k.tier >= 3 : (k.halls[id] || 0) >= KEEP.hallMax;
    if (!ready) return this.emit('keepTierShut', { id });
    const t = (k.btier[id] || 0) + 1;
    if (t > BUILD_TIER.max) return this.emit('keepMaxed', { name: id, what: 'tier' });
    const hurt = k.builds[id] != null ? buildMax(id, k) - k.builds[id] : 0;
    if (!this.keepPay(BUILD_TIER.cost(t))) return;
    k.btier[id] = t;
    if (k.builds[id] != null) k.builds[id] = Math.max(0, buildMax(id, k) - hurt); // (what it had taken, it still has)
    this.keepBuildsUp();
    if (id === 'hearth') this.keepTroopsUp();
    this.emit('keepBuildTier', { id, tier: t, name: id === 'hearth' ? 'The Hearth' : HALLS[id].name });
  }
  inKeep() {
    return !!(this.map && this.map.id === KEEP.map && this.player.keep && this.keepOwns());
  }
  /** (0.82.2) Is the hero in hand the keep's owner (not a party member visiting it)? */
  keepOwns() {
    return this.keepOwner == null || !this.cur || this.cur.pid === this.keepOwner;
  }

  /** Raise a new hero (Faith), of a class whose hall is open: the keep holds few, and good. */
  keepRecruit(cls) {
    const k = this.player.keep;
    if (!this.inKeep() || !TROOPS[cls] || (this.tide && this.tide.state === 'on')) return;
    if (!this.keepRecord().halls.includes(cls)) return this.emit('keepHallShut', { name: HALLS[cls].name, cls });
    if (k.troops.length >= KEEP.heroCap[k.tier]) return this.emit('keepFull', { cap: KEEP.heroCap[k.tier] });
    if (!this.keepPay(KEEP.recruit(k.troops.length))) return;
    k.troopN++;
    const names = TROOP_NAMES[cls];
    const used = new Set(k.troops.map((t) => t.name));
    const name = names.find((n) => !used.has(n)) || names[k.troopN % names.length];
    const t = { id: k.troopN, cls, name, lvl: 1, gear: 0, skill: null };
    k.troops.push(t);
    this.keepTroopsUp();
    this.emit('keepRecruited', { name, cls });
  }
  keepDismiss(id) {
    const k = this.player.keep;
    if (!this.inKeep() || (this.tide && this.tide.state === 'on')) return;
    const i = k.troops.findIndex((t) => t.id === id);
    if (i < 0) return;
    const [t] = k.troops.splice(i, 1);
    for (const g of k.armory || []) if (g.hero === t.id) g.hero = null; // (0.82) their gear goes back to the Armory
    this.keepTroopsUp();
    this.emit('keepDismissed', { name: t.name });
  }
  keepTroop(id) {
    const k = this.player.keep;
    return k ? k.troops.find((t) => t.id === id) : null;
  }
  /** Train a hero a level, at the Lodge (its level sets how far). */
  keepTrain(id) {
    const k = this.player.keep, t = this.keepTroop(id);
    if (!this.inKeep() || !t) return;
    if (!this.hallWorks('archer')) return this.emit('keepHallShut', { name: HALLS.archer.name, cls: 'archer', down: this.wrecked('archer') });
    if (t.lvl >= KEEP.trainMax(k.halls.archer, k.btier.archer || 0, k.nightMax)) return this.emit('keepMaxed', { name: t.name, what: 'level' });
    if (!this.keepPay(KEEP.train(t.lvl))) return;
    t.lvl++;
    this.keepTroopsUp();
    this.emit('keepTrained', { name: t.name, lvl: t.lvl });
  }
  /** Arm a hero a point of gear, at the Bastion. */
  keepArm(id) {
    const k = this.player.keep, t = this.keepTroop(id);
    if (!this.inKeep() || !t) return;
    if (!this.hallWorks('warrior')) return this.emit('keepHallShut', { name: HALLS.warrior.name, cls: 'warrior', down: this.wrecked('warrior') });
    if (t.gear >= KEEP.armMax(k.halls.warrior, k.btier.warrior || 0, k.nightMax)) return this.emit('keepMaxed', { name: t.name, what: 'gear' });
    if (!this.keepPay(KEEP.arm(t.gear))) return;
    t.gear++;
    this.keepTroopsUp();
    this.emit('keepArmed', { name: t.name, gear: t.gear });
  }
  /** (0.82) Raise a hero a rarity, at the Hearth: Faith and Ascension Sigils (the night gives them). */
  keepAscend(id) {
    const k = this.player.keep, t = this.keepTroop(id);
    if (!this.inKeep() || !t || (this.tide && this.tide.state === 'on')) return;
    const to = (t.rar || 0) + 1;
    if (to > HERO_RAR_MAX) return this.emit('keepMaxed', { name: t.name, what: 'rarity' });
    const c = HERO_RARITY.ascend(to);
    if (k.sigils < c.sigils) return this.emit('keepShort', { what: 'sigils', need: c.sigils, have: k.sigils });
    if (!this.keepPay({ faith: c.faith })) return;
    k.sigils -= c.sigils;
    t.rar = to;
    this.keepTroopsUp();
    this.emit('keepAscended', { name: t.name, rar: to, cls: t.cls });
  }
  /** (0.82) The Armory: put a piece on a hero (what they wore in that slot goes back), take it off, lock, break down. */
  keepGearOn(gid, hero) {
    const k = this.player.keep;
    if (!k || (this.tide && this.tide.state === 'on')) return;
    const g = k.armory.find((x) => x.id === gid), t = this.keepTroop(Math.floor(Number(hero)));
    if (!g || !t) return;
    for (const o of k.armory) if (o.hero === t.id && o.slot === g.slot) o.hero = null;
    g.hero = t.id;
    this.keepTroopsUp();
    this.emit('keepGeared', { name: t.name, piece: g.name, r: g.r });
  }
  keepGearOff(gid) {
    const k = this.player.keep;
    const g = k && k.armory.find((x) => x.id === gid);
    if (!g || (this.tide && this.tide.state === 'on')) return;
    g.hero = null;
    this.keepTroopsUp();
  }
  keepGearLock(gid) {
    const k = this.player.keep;
    const g = k && k.armory.find((x) => x.id === gid);
    if (g) g.locked = !g.locked;
  }
  /** Break pieces down for Wishstone (never one worn or locked). */
  keepSalvage(ids) {
    const k = this.player.keep;
    if (!k || !Array.isArray(ids)) return;
    const want = new Set(ids.slice(0, ARMORY_MAX).map(String));
    let stone = 0, n = 0;
    k.armory = k.armory.filter((g) => {
      if (!want.has(g.id) || g.hero != null || g.locked) return true;
      stone += HERO_GEAR.salvage(g);
      n++;
      return false;
    });
    if (!n) return;
    k.stone += stone;
    this.emit('keepSalvaged', { n, stone });
  }
  /**
   * (0.82.5) Auto-salvage for Hero gear (null: off; 0 Common up to 5 Ancient): new pieces at or below it are
   * broken down for Wishstone as the night gives them, unless one is a hero's upgrade. Choosing it clears
   * the Armory of such pieces once (never worn or locked ones).
   */
  keepAutoSalvage(to) {
    const k = this.player.keep;
    if (!k) return;
    k.autoSalvageAt = Number.isInteger(to) && to >= 0 && to <= 5 ? to : null;
    if (k.autoSalvageAt == null) return;
    const ids = k.armory.filter((g) => g.hero == null && !g.locked && g.r <= k.autoSalvageAt && !heroGearUpgrade(g, k)).map((g) => g.id);
    if (ids.length) this.keepSalvage(ids);
  }

  /** Put the best piece for each slot on every hero, the rarest heroes choosing first. */
  keepGearBest() {
    const k = this.player.keep;
    if (!k || (this.tide && this.tide.state === 'on')) return;
    for (const g of k.armory) g.hero = null;
    const order = k.troops.slice().sort((a, b) => (b.rar || 0) - (a.rar || 0) || b.lvl - a.lvl);
    for (const slot of HERO_SLOTS) {
      const pool = k.armory.filter((g) => g.slot === slot).sort((a, b) => heroGearScore(b) - heroGearScore(a));
      order.forEach((t, i) => {
        if (pool[i]) pool[i].hero = t.id;
      });
    }
    this.keepTroopsUp();
    this.emit('keepGeared', { all: true });
  }

  /**
   * Teach a hero a skill: physical at the Lodge, magic at the Observatory, up to the hall's rank. (0.83) Into
   * one of four slots (0 and 1 physical, 2 and 3 magic; the second of each from level 6), replacing what is there.
   */
  keepLearn(id, skill, slot) {
    const k = this.player.keep, t = this.keepTroop(id), S = SKILLS[skill];
    if (!this.inKeep() || !t || !S) return;
    const sk = t.skills || (t.skills = [null, null, null, null]);
    let i = Number.isInteger(slot) && slot >= 0 && slot < 4 ? slot : -1;
    if (i < 0) {
      // (no slot named: the school's first empty open slot, else its first)
      const own = [0, 1, 2, 3].filter((j) => skillSlotSchool(j) === S.school && skillSlotOpen(t, j));
      i = own.find((j) => !sk[j]) ?? own[0];
    }
    if (skillSlotSchool(i) !== S.school || !skillSlotOpen(t, i) || sk.includes(skill)) return;
    const hall = S.school === 'phys' ? 'archer' : 'mage';
    if (!this.hallWorks(hall)) return this.emit('keepHallShut', { name: HALLS[hall].name, cls: hall, down: this.wrecked(hall) });
    if ((k.halls[hall] || 0) < S.rank) return this.emit('keepMaxed', { name: S.name, what: 'rank', rank: S.rank, hall: HALLS[hall].name });
    if (!this.keepPay(KEEP.learn)) return;
    sk[i] = skill;
    this.keepTroopsUp();
    this.emit('keepLearned', { name: t.name, skill: S.name, slot: i });
  }
  /** A blessing for the next Tide, at the Observatory. */
  keepBless(id) {
    const k = this.player.keep, B = BLESSINGS[id];
    if (!this.inKeep() || !B || k.blessings.includes(id) || (this.tide && this.tide.state === 'on')) return;
    if (!this.hallWorks('mage')) return this.emit('keepHallShut', { name: HALLS.mage.name, cls: 'mage', down: this.wrecked('mage') });
    if ((k.halls.mage || 0) < B.rank) return this.emit('keepMaxed', { name: B.name, what: 'rank', rank: B.rank, hall: HALLS.mage.name });
    if (!this.keepPay({ faith: B.faith })) return;
    k.blessings.push(id);
    this.emit('keepBlessed', { name: B.name });
  }
  /** Trade at the Market: 10 Wishstone for Faith, or 100 Faith for Wishstone. */
  keepTrade(dir) {
    const k = this.player.keep;
    if (!this.inKeep()) return;
    if (!this.hallWorks('rogue')) return this.emit('keepHallShut', { name: HALLS.rogue.name, cls: 'rogue', down: this.wrecked('rogue') });
    const T = KEEP.trade, L = k.halls.rogue;
    if (dir === 'sell') {
      if (!this.keepPay({ stone: 10 }, 'stone')) return;
      k.faith += T.stoneFor(L);
    } else {
      if (!this.keepPay({ faith: T.faithPer })) return;
      k.stone += T.stoneOut(L);
    }
    this.emit('keepTraded', { dir });
  }
  /** Mend every damaged building, with Wishstone (one mends KEEP.repairPer). */
  keepRepair() {
    const k = this.player.keep;
    if (!this.inKeep() || (this.tide && this.tide.state === 'on')) return;
    const need = this.keepRepairCost();
    if (!need) return;
    if (k.stone <= 0) return this.emit('keepShort', { what: 'stone', need, have: 0, mend: true });
    // (0.81.1) as much as the Wishstone on hand allows, the Hearth first
    let stone = 0;
    for (const b of BUILD_IDS) {
      if (k.builds[b] == null) continue;
      const max = buildMax(b, k);
      const n = Math.min(k.stone, Math.ceil((max - k.builds[b]) / KEEP.repairPer));
      if (n <= 0) break;
      k.stone -= n;
      stone += n;
      this.keepSpend({ stone: n });
      k.builds[b] = Math.min(max, k.builds[b] + n * KEEP.repairPer);
      if (k.builds[b] >= max) delete k.builds[b];
    }
    this.keepBuildsUp();
    this.emit('keepRepaired', { stone, left: this.keepRepairCost(), hearth: !this.wrecked('hearth') });
  }
  /** (0.81.1) Wishstone it would take to mend every building. */
  keepRepairCost() {
    const k = this.player.keep;
    let stone = 0;
    if (k) for (const b of BUILD_IDS) if (k.builds[b] != null) stone += Math.ceil((buildMax(b, k) - k.builds[b]) / KEEP.repairPer);
    return stone;
  }
  /**
   * (0.81) Faith that came in while away: the host gives the time (the server its own clock), banked up
   * to produce.capHours. The first call only starts the clock.
   */
  keepClock(now) {
    const k = this.player.keep;
    now = Math.floor(Number(now) || 0);
    if (!k || now <= 0) return;
    if (k.last > 0 && now > k.last) {
      // (0.82.1) the Market and the Fields make Faith, the Mine Wishstone; fractions carry over
      const P = KEEP.produce;
      const hours = Math.min(P.capHours, (now - k.last) / 3.6e6);
      const r = keepRates(k, this.hallWorks('rogue'));
      const acc = k.acc || (k.acc = { faith: 0, stone: 0 });
      const f = r.faith * hours + acc.faith, st = r.stone * hours + acc.stone;
      const faith = Math.floor(f), stone = Math.floor(st);
      acc.faith = Math.round((f - faith) * 1000) / 1000;
      acc.stone = Math.round((st - stone) * 1000) / 1000;
      k.faith += faith;
      k.stone += stone;
      if ((faith || stone) && hours >= 0.25) this.emit('keepProduced', { faith, stone, hours: Math.round(hours * 10) / 10, rate: r.faith, srate: Math.round(r.stone * 10) / 10 });
      // (0.86) while you were away, every few hours the Unmade came; the heroes met them alone
      if (hours >= RAID.awayFrom && this.raidsCan()) {
        k.raidAcc = Math.min(24, (k.raidAcc || 0) + hours);
        const n = Math.floor(k.raidAcc / RAID.awayEvery);
        if (n > 0) {
          k.raidAcc -= n * RAID.awayEvery;
          k.raidsDue = Math.min(RAID.awayMax, (k.raidsDue || 0) + n);
        }
      }
    }
    k.last = now;
    if (k.raidsDue > 0 && this.inKeep() && !this.tide) this.keepRaidsAway();
  }

  /** (0.86) The keeper turns surprise raids on or off (at the Hearth). */
  keepRaidsSet(on) {
    const k = this.player.keep;
    if (!k || !this.inKeep()) return;
    k.raidsOn = !!on;
    this.raidT = null;
    this.emit('keepRaidsSet', { on: k.raidsOn });
  }
  /** (0.86) Can raids come: a keep with heroes that has held a night, raids not turned off. */
  raidsCan() {
    const k = this.player.keep;
    return !!(k && k.raidsOn !== false && k.troops.length && (k.nightMax || 0) >= 1);
  }
  /** (0.86) In your keep, between nights: now and then, a raid. */
  stepRaidClock(dt) {
    if (!this.inKeep() || !this.keepOwns() || !this.raidsCan()) return;
    if (this.raidT == null) {
      const rng = this.streamRng('raid', this.player.keep.raids * 31 + this.player.keep.tides * 7 + 1);
      this.raidT = RAID.every[0] + rng() * (RAID.every[1] - RAID.every[0]);
    }
    this.raidT -= dt;
    if (this.raidT <= 0) {
      this.raidT = null;
      this.keepRaidStart(false);
    }
  }
  /** (0.86) A raid: one wave, a little below your best Night, after a few seconds of horns (none when away). */
  keepRaidStart(away) {
    const k = this.player.keep;
    if (!this.inKeep() || (this.tide && this.tide.state === 'on')) return;
    const L = raidLevel(k);
    this.keepTroopsUp();
    this.keepBuildsUp();
    this.tide = {
      state: 'on', raid: true, away: !!away, wave: 0, waves: 1, next: away ? 0 : RAID.warn, seed: k.raids * 211 + k.tides * 13 + (this.ticks % 9973),
      night: NIGHT.power(L), level: L, blessPow: 1 + 0.1 * (k.btier.mage || 0), hearthDmg: 1 + 0.04 * (k.btier.hearth || 0), bless: [], echo: 1,
      mcd: { judge: 0, bless: 0, hallow: 0 }, zones: [], lost: 0, inc: 0, icd: 0, omen: null, fell: 0, stolen: 0, caught: 0, corpses: [], stars: [], starT: 4, boss: 0,
    };
    for (const tr of this.troops) tr.unbroken = !!(tr.fx && tr.fx.armor);
    if (!away) this.emit('raidWarn', { in: RAID.warn, level: L });
    if (this.player.keepWalk) this.keepWalkSet(false); // (0.91) the god is wanted above
  }
  /** (0.86) The raids the heroes met while you were away, fought out now (quickly, unseen), and a word on how they went. */
  keepRaidsAway() {
    const k = this.player.keep;
    const n = k.raidsDue || 0;
    k.raidsDue = 0;
    if (!n || !this.raidsCan()) return;
    const outer = this.events;
    const dt = 0.05;
    const out = [];
    for (let i = 0; i < n; i++) {
      this.events = [];
      this.quietKills = true;
      this.keepRaidStart(true);
      for (let j = 0; j < 90 / dt && this.tide && this.tide.state === 'on'; j++) {
        this.stepTide(dt);
        if (!this.tide || this.tide.state !== 'on') break;
        for (const e of this.enemies) {
          if (!e.tide || e.dead) continue;
          [e.px, e.pz, e.moving] = [e.x, e.z, false];
          if (e.hitFlash > 0) e.hitFlash -= dt;
          this.stepTideFoe(e, dt);
        }
        this.enemies = this.enemies.filter((e) => !(e.tide && e.dead));
      }
      if (this.tide && this.tide.state === 'on') this.tideEnd(false); // (it ran long: the dark had its way)
      const end = this.events.find((e) => e.type === 'raidEnd');
      if (end) out.push(end);
      this.quietKills = false;
      this.tide = null;
      this.enemies = this.enemies.filter((e) => !e.tide);
    }
    this.events = outer;
    this.keepTroopsUp();
    this.keepBuildsUp();
    this.emit('keepRaidsAway', {
      raids: out.length, held: out.filter((r) => r.won).length,
      faith: out.reduce((a, r) => a + (r.faith || 0), 0), stone: out.reduce((a, r) => a + (r.stone || 0), 0),
      gear: out.flatMap((r) => r.gear || []), wrecked: [...new Set(out.flatMap((r) => r.wrecked || []))],
    });
  }

  /** The keep's buildings as the world uses them (where, how big, how hurt). */
  keepBuildsUp() {
    const k = this.player.keep;
    if (!this.inKeep()) return (this.keepBuilds = []);
    const at = { hearth: { x: 0, z: 0, r: 2.2 } };
    for (const o of this.obstacles) if (o.kind === 'house' && o.hall) at[o.hall] = { x: o.x, z: o.z, r: 3.4 };
    this.keepBuilds = BUILD_IDS.filter((b) => at[b]).map((b) => {
      const max = buildMax(b, k);
      return { id: b, x: at[b].x, z: at[b].z, r: at[b].r, max, hp: k.builds[b] != null ? Math.min(max, k.builds[b]) : max, wardT: 0 };
    });
  }
  /** The keep's heroes in the world, from the keep (keeping where they stand and how hurt they are). */
  keepTroopsUp() {
    const k = this.player.keep;
    if (!this.inKeep()) return (this.troops = []);
    const old = new Map((this.troops || []).map((t) => [t.id, t]));
    const n = k.troops.length;
    // (0.82) posts between the Hearth and the halls, spread over them (the Unmade come for the halls first)
    const halls = this.obstacles.filter((o) => o.kind === 'house' && o.hall);
    this.troops = k.troops.map((src, i) => {
      const st = troopStats(src, k.armory); // (0.82) rarity and Hero gear
      const a = halls.length ? dAtan2(halls[i % halls.length].z, halls[i % halls.length].x) + (i >= halls.length ? 0.35 : 0) : (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
      const pr = halls.length ? 10.5 - (i >= halls.length ? 3 : 0) : 5.2;
      const post = { x: dCos(a) * pr, z: dSin(a) * pr };
      const o = old.get(src.id);
      const t = o || { id: src.id, x: post.x, z: post.z, facing: a + Math.PI, hp: st.hp, atkT: 0.5, scd: {}, dead: false, swing: 0 };
      const frac = o ? o.hp / o.maxHp : 1;
      const skills = troopSkills(src);
      Object.assign(t, { cls: src.cls, name: src.name, gender: troopGender(src), lvl: src.lvl, gear: src.gear, skills, support: troopSupport(src), rar: st.rar, post, maxHp: st.hp, dmg: st.dmg, cd: st.cd, range: st.range, speed: st.speed, splash: st.splash || 0, crit: st.crit || 0, critX: st.critX || 2, dodge: st.dodge || 0, arc: st.arc || 0, bulwark: st.bulwark || 0, guard: st.guard, leech: st.leech, focus: st.focus, siege: st.siege, fx: st.fx });
      // (0.83) each skill its own cooldown, the first ones staggered so a hero does not open with all four
      t.scd = t.scd || {};
      skills.forEach((sk, j) => {
        if (t.scd[sk] == null) t.scd[sk] = 1.5 + j * 1.2;
      });
      t.hp = Math.max(t.dead ? 0 : 1, Math.round(st.hp * frac));
      t.px = t.x;
      t.pz = t.z;
      return t;
    });
  }

  /** Call the night: a Tide, three waves of the Unmade for the keep's buildings. Its heroes fight; its god works miracles. */
  keepTideStart(level) {
    const k = this.player.keep;
    if (!this.inKeep() || (this.tide && this.tide.state === 'on') || this.player.dead) return;
    // (0.82) at a Night level: up to one past the highest held
    const L = Math.max(1, Math.min(NIGHT.max, k.nightMax + 1, Math.floor(Number(level)) || k.night || 1));
    k.night = L;
    this.raidT = null; // (0.86) a night called resets the raid clock
    if (this.player.keepWalk) this.keepWalkSet(false); // (0.91) the god is wanted above
    if (this.wrecked('hearth')) return this.emit('keepShort', { what: 'repair', need: Math.ceil(buildMax('hearth', k) / KEEP.repairPer), have: k.stone });
    const T = KEEP.tide;
    this.keepTroopsUp();
    this.keepBuildsUp();
    const rec = this.keepRecord();
    this.tide = {
      state: 'on', wave: 0, next: 3, seed: k.tides * 101 + k.answered * 7 + (this.ticks % 9973),
      night: NIGHT.power(L), level: L, blessPow: 1 + 0.1 * (k.btier.mage || 0), hearthDmg: 1 + 0.04 * (k.btier.hearth || 0), bless: k.blessings.slice(), echo: 1 + 0.1 * rec.echoes.length,
      mcd: { judge: 0, bless: 0, hallow: 0 }, zones: [], lost: 0, inc: 0, icd: 0,
      // (0.84) waves by Night, its omen, and what the stars are measured on
      waves: NIGHT.waves(L), omen: nightOmen(L), omen2: nightOmen2(L), fell: 0, stolen: 0, caught: 0, corpses: [], stars: [], starT: 4, boss: 0,
    };
    if (this.omenOn('fog')) for (const tr of this.troops) if (tr.range > 3) tr.range *= 0.65; // (until the morning's keepTroopsUp)
    k.blessings = []; // (they are for this night)
    for (const tr of this.troops) tr.unbroken = !!(tr.fx && tr.fx.armor); // (0.82) Unbroken: once a night
    this.emit('tideStart', { waves: this.tide.waves, heroes: this.troops.length, bless: this.tide.bless, level: L, omen: this.tide.omen, omen2: this.tide.omen2 });
  }

  stepTide(dt) {
    const t = this.tide;
    if (t.state !== 'on') {
      t.after = (t.after || 0) + dt;
      if (t.after > 10) this.tide = null;
      return;
    }
    for (const c in t.mcd) if (t.mcd[c] > 0) t.mcd[c] = Math.max(0, t.mcd[c] - dt);
    if (t.icd > 0) t.icd = Math.max(0, t.icd - dt);
    if (t.chan != null) this.stepIncarnateChannel(dt); // (0.85)

    if (t.inc > 0) {
      t.inc -= dt;
      if (t.inc <= 0) this.incarnateEnd(false);
    }
    for (const b of this.keepBuilds || []) if (b.wardT > 0) b.wardT -= dt;
    if (t.zones && t.zones.length) {
      // (0.87) Hallowed Ground: it fades; heroes on it heal
      for (const zo of t.zones) zo.t -= dt;
      t.zones = t.zones.filter((zo) => zo.t > 0);
      for (const tr of this.troops) if (!tr.dead && tr.hp < tr.maxHp && this.hallowed(tr.x, tr.z)) this.troopMend(tr, tr.maxHp * MIRACLES.hallow.regen * dt);
    }
    this.stepTideOmen(dt);
    this.stepTroops(dt);
    const hearth = (this.keepBuilds || []).find((b) => b.id === 'hearth');
    if (hearth && hearth.hp <= 0) return this.tideEnd(false);
    if (this.enemies.some((e) => e.tide && !e.dead)) return;
    if (t.wave >= (t.waves || KEEP.tide.waves)) return this.tideEnd(true);
    t.next -= dt;
    if (t.next <= 0) this.tideWave();
  }

  tideWave() {
    const t = this.tide, k = this.player.keep, T = KEEP.tide;
    const W = t.waves || T.waves, L = t.level || 1;
    t.wave++;
    t.next = T.gap;
    const rng = this.streamRng('tide', t.seed * 13 + t.wave);
    let n = T.perWave(k.tier) + (t.wave === W ? 2 : 0) + NIGHT.extra(L); // (0.82) more on deeper nights
    if (this.omenOn('legion')) n = Math.round(n * 4 / 3); // (0.84)
    const gates = this.map.gates || [{ x: this.radius - 4, z: 0 }];
    let gi = 0;
    const gate = () => gates[gi++ % gates.length];
    for (let i = 0; i < n; i++) this.spawnTideFoe(T.roster[Math.floor(rng() * T.roster.length)], gate(), rng);
    // (0.84) the night's stranger children
    const sp = t.raid ? tideSpecials(L, 2, 3) : tideSpecials(L, t.wave, W); // (0.86) a raid: a night's middle, never its king
    let specials = 0;
    for (const type of Object.keys(sp)) {
      for (let j = 0; j < sp[type]; j++) {
        const g = gate();
        const pack = FOES[type].pack || 1;
        for (let m = 0; m < pack; m++) this.spawnTideFoe(type, { x: g.x + (m % 3 - 1) * 1.2, z: g.z + Math.floor(m / 3) * 1.2 }, rng);
        specials += pack;
      }
    }
    if (sp.tidecaller) this.emit('tideBoss', { name: FOES.tidecaller.name });
    this.emit('tideWave', { wave: t.wave, of: W, n: n + specials, specials: Object.keys(sp) });
  }

  /** (0.86) A raid's end: a share of a night's pay, maybe a piece of Hero gear; no stars, no new Night. */
  raidEnd(won, wrecked, L) {
    const t = this.tide, k = this.player.keep;
    if (!won) return this.emit('raidEnd', { won: false, wrecked, level: L, away: t.away });
    k.raids++;
    const thieves = 0.05 * t.caught - Math.min(0.5, 0.1 * Math.max(0, t.stolen - t.caught));
    const R = NIGHT.reward(L) * RAID.pay * (1 + thieves);
    const faith = Math.round((40 + 10 * k.tier) * this.keepMult() * R);
    const stone = Math.round((6 + 2 * k.tier) * R);
    k.faith += faith;
    k.stone += stone;
    const rng = this.streamRng('raidgear', t.seed * 5 + L);
    const gear = [];
    if (rng() < RAID.gear) {
      const g = rollHeroGear(rng, L, 'g' + ++k.gearN);
      if ((k.autoSalvageAt != null && g.r <= k.autoSalvageAt && !heroGearUpgrade(g, k)) || k.armory.length >= ARMORY_MAX) k.stone += HERO_GEAR.salvage(g);
      else {
        k.armory.push(g);
        gear.push({ r: g.r, slot: g.slot, name: g.name });
      }
    }
    this.emit('raidEnd', { won: true, faith, stone, gear, wrecked, level: L, away: t.away, stolen: t.stolen - t.caught });
  }

  /** (0.84) One of the Tide's enemies, at a gate, with the night's numbers. */
  spawnTideFoe(type, g, rng) {
    const t = this.tide, F = FOES[type];
    const e = this.spawnEnemy(type, { x: g.x, z: g.z, level: KEEP.tide.level });
    e.home = null;
    e.aggro = true;
    e.tide = true;
    e.noLoot = true; // (the night pays in Faith and Wishstone when it is held, not in loot: no farming the dark)
    e.maxHp = e.hp = Math.round(F.hp * t.night * (this.omenOn('ironhide') ? 1.25 : 1));
    e.tdmg = F.dmg * t.night;
    e.tbdmg = F.dmg * NIGHT.siege(t.level || 1); // (0.82) what a building takes (stone outlasts flesh)
    e.tAtk = 0.6 + rng() * 0.6;
    e.tTarget = null;
    e.tRe = 0;
    if (F.role === 'boss') [e.slamT, e.callT] = [3, F.call.cd * 0.5];
    if (F.role === 'mourn') e.raiseT = F.raise.cd * 0.6;
    return e;
  }

  /** (0.84) The night's omen at work, and the Veilbearers' shroud and the Mourners' dead kept up to date. */
  stepTideOmen(dt) {
    const t = this.tide;
    if (this.enemies.some((e) => e.gone)) this.enemies = this.enemies.filter((e) => !e.gone); // (thieves into the dark)
    const foes = this.enemies.filter((e) => e.tide && !e.dead);
    const veils = foes.filter((e) => FOES[e.type] && FOES[e.type].veil && e.state !== 'spawn');
    for (const e of foes) e.veiled = veils.some((v) => v !== e && dist(v.x, v.z, e.x, e.z) <= FOES.veilbearer.veil.r);
    // (0.92) a Rotmother's rot: heroes near her mend by half
    const rots = foes.filter((e) => FOES[e.type] && FOES[e.type].rot && e.state !== 'spawn');
    for (const tr of this.troops) tr.rotT = !tr.dead && rots.some((e) => dist(e.x, e.z, tr.x, tr.z) <= FOES.rotmother.rot.r + e.radius) ? 0.5 : 0;
    t.corpses = t.corpses.filter((c) => this.time - c.at < 20);
    // Starfall: where the fighting is
    if (this.omenOn('starfall')) {
      for (const st of t.stars) st.t -= dt;
      for (const st of t.stars.filter((x) => x.t <= 0)) {
        for (const tr of this.troops) if (!tr.dead && dist(tr.x, tr.z, st.x, st.z) <= st.r) this.troopHurt(tr, st.dmg);
        for (const e of foes) if (dist(e.x, e.z, st.x, st.z) <= st.r + e.radius) this.troopStrike(e, e.maxHp * 0.12, false);
        this.emit('starFall', { x: st.x, z: st.z, r: st.r });
      }
      t.stars = t.stars.filter((x) => x.t > 0);
      t.starT -= dt;
      const live = this.troops.filter((tr) => !tr.dead);
      if (t.starT <= 0 && live.length && foes.length) {
        t.starT = 3.5;
        const rng = this.streamRng('star', t.seed + this.ticks);
        const tr = live[Math.floor(rng() * live.length)];
        const a = rng() * Math.PI * 2, d = rng() * 3;
        const st = { x: tr.x + dCos(a) * d, z: tr.z + dSin(a) * d, r: 2.6, t: 1.2, dmg: FOES.unnamed.dmg * t.night * 1.5 };
        t.stars.push(st);
        this.emit('starWarn', { x: st.x, z: st.z, r: st.r, t: st.t });
      }
    }
  }

  /** (0.84) One of the Tide's enemies falls: what it leaves behind. */
  tideFoeDown(e) {
    const t = this.tide, F = FOES[e.type];
    if (!F) return;
    if (F.role === 'thief' && e.loot) {
      t.caught++;
      this.emit('thiefCaught', { x: e.x, z: e.z });
    }
    if (F.burst) {
      // a Cinderling bursts
      for (const tr of this.troops) if (!tr.dead && dist(tr.x, tr.z, e.x, e.z) <= F.burst.r) this.troopHurt(tr, e.tdmg * F.burst.x);
      if (this.inField() && !this.player.dead && dist(this.player.x, this.player.z, e.x, e.z) <= F.burst.r) this.incarnateHurt(e.tdmg * F.burst.x);
      this.emit('cinderBurst', { x: e.x, z: e.z, r: F.burst.r });
    }
    if (F.role === 'boss') {
      t.boss++;
      this.emit('tideBossDown', { name: F.name, x: e.x, z: e.z });
    }
    if (F.split && t.state === 'on') {
      // (0.92) a Rotmother breaks into Rotlings
      const rng = this.streamRng('rot', t.seed + e.id);
      for (let i = 0; i < F.split.n; i++) {
        const a = (i / F.split.n) * Math.PI * 2;
        const o = this.spawnTideFoe(F.split.into, { x: e.x + dCos(a) * 1.4, z: e.z + dSin(a) * 1.4 }, rng);
        o.state = 'chase';
        this.pushOut(o, o.radius);
      }
      this.emit('rotSplit', { x: e.x, z: e.z, n: F.split.n });
    }
    if (!F.big && F.role !== 'mourn' && !e.raised) t.corpses.push({ type: e.type, x: e.x, z: e.z, at: this.time });
  }

  tideEnd(won) {
    const t = this.tide, k = this.player.keep;
    t.state = won ? 'won' : 'lost';
    t.after = 0;
    t.inc = 0; // (0.81.1)
    t.chan = null; // (0.85)
    this.enemies = this.enemies.filter((e) => !e.tide || e.dead); // (on a loss, the rest melt back into the dark)
    // what the buildings took stays until it is mended (at the Hearth, with Wishstone)
    for (const b of this.keepBuilds || []) {
      if (b.hp >= b.max) delete k.builds[b.id];
      else k.builds[b.id] = Math.max(0, Math.round(b.hp));
    }
    // the fallen get up at morning
    for (const tr of this.troops || []) {
      tr.dead = false;
      tr.hp = tr.maxHp;
    }
    const wrecked = (this.keepBuilds || []).filter((b) => b.hp <= 0).map((b) => (b.id === 'hearth' ? 'the Hearth' : HALLS[b.id].name));
    const L = t.level || 1;
    if (won && k.statue && t.posT > 10) {
      // (0.92) a night (or raid) the Seraph fought in and held
      k.statue.nights++;
      this.statueXp(STATUE.held * STATUE.kill(L, null) * (t.raid ? 0.35 : 1) * (L >= k.statue.lvl - 2 ? 1 : STATUE.low));
    }
    if (t.raid) return this.raidEnd(won, wrecked, L);
    if (!won) return this.emit('tideEnd', { won: false, wrecked, level: L });
    // (0.82.1) a held night: the keep's people mend a quarter of every building by morning, free
    for (const b of BUILD_IDS) {
      if (k.builds[b] == null) continue;
      const max = buildMax(b, k);
      k.builds[b] = Math.min(max, k.builds[b] + Math.round(max * 0.25));
      if (k.builds[b] >= max) delete k.builds[b];
    }
    this.keepBuildsUp();
    k.tides++;
    // (0.84) stars: held (always, here); no hall wrecked; no hero fell. The first time each is won on a Night pays Sigils.
    const stars = 1 | (wrecked.length ? 0 : 2) | (t.fell ? 0 : 4);
    const had = k.stars[L] || 0;
    const fresh = stars & ~had;
    k.stars[L] = had | stars;
    const newStars = ((fresh & 1) ? 1 : 0) + ((fresh & 2) ? 1 : 0) + ((fresh & 4) ? 1 : 0);
    const starCount = ((stars & 1) ? 1 : 0) + ((stars & 2) ? 1 : 0) + ((stars & 4) ? 1 : 0);
    // (0.84) the omen pays; a thief who got away costs a tenth (half at most), one caught gives a twentieth back
    const omenPay = (t.omen ? OMENS[t.omen].pay : 0) + (t.omen2 ? OMENS[t.omen2].pay : 0); // (0.92) two on a deep Night
    const thieves = 0.05 * t.caught - Math.min(0.5, 0.1 * Math.max(0, t.stolen - t.caught));
    if (t.boss) k.bosses += t.boss;
    const R = NIGHT.reward(L) * (1 + omenPay + thieves + 0.5 * (t.boss ? 1 : 0));
    const faith = Math.round((40 + 10 * k.tier) * this.keepMult() * R);
    const stone = Math.round((6 + 2 * k.tier) * R);
    k.faith += faith;
    k.stone += stone;
    // (0.82) Ascension Sigils and Hero gear, more and rarer the deeper the night
    const sigils = NIGHT.sigils(L) + newStars * NIGHT.starSigils(L) + (t.boss ? 3 : 0);
    k.sigils += sigils;
    const first = L > k.nightMax;
    if (first) k.nightMax = L;
    const rng = this.streamRng('herogear', t.seed * 7 + L);
    const got = [];
    let salvaged = 0;
    let auto = 0;
    const pieces = NIGHT.pieces(L) + (starCount === 3 ? 1 : 0) + (t.boss ? 1 : 0); // (0.84) a flawless night, a felled Tidecaller
    for (let i = 0; i < pieces; i++) {
      let g = rollHeroGear(rng, L, 'g' + ++k.gearN);
      if (t.boss && i === pieces - 1) {
        // the Tidecaller's own: Epic at least (Mythic from Night 10, Ancient from 20)
        const floor = L >= 20 ? 5 : L >= 10 ? 4 : 3;
        for (let j = 0; j < 200 && g.r < floor; j++) g = rollHeroGear(rng, Math.min(NIGHT.max, L + 4 + j), 'g' + k.gearN);
        if (g.r < floor) g.r = floor;
      }
      if (k.autoSalvageAt != null && g.r <= k.autoSalvageAt && !heroGearUpgrade(g, k)) {
        salvaged += HERO_GEAR.salvage(g); // (0.82.5) auto-salvage: broken down as it comes (never a hero's upgrade)
        auto++;
        continue;
      }
      if (k.armory.length >= ARMORY_MAX) {
        salvaged += HERO_GEAR.salvage(g); // (a full Armory: broken down for Wishstone at once)
        continue;
      }
      k.armory.push(g);
      got.push({ r: g.r, slot: g.slot, name: g.name });
    }
    k.stone += salvaged;
    this.keepEvent('tide');
    this.emit('tideEnd', { won: true, faith, stone, wrecked, level: L, sigils, gear: got, salvaged, auto, first, stars, newStars, omen: t.omen, omen2: t.omen2, stolen: t.stolen - t.caught, caught: t.caught, boss: t.boss });
  }

  /** Damage to a building (a ward stops it). */
  hurtBuild(b, dmg, from) {
    if (b.hp <= 0 || b.wardT > 0) return;
    b.hp = Math.max(0, b.hp - dmg);
    this.emit('buildHit', { id: b.id, x: b.x, z: b.z, hp: Math.round(b.hp), max: b.max, fx: from ? from.x : b.x, fz: from ? from.z : b.z });
    if (b.hp <= 0) this.emit('buildWrecked', { id: b.id, x: b.x, z: b.z, name: b.id === 'hearth' ? 'The Hearth' : HALLS[b.id].name });
  }

  /** A Tide's enemy: the nearest of the keep's heroes if one is close, else the nearest standing building. */
  stepTideFoe(e, dt) {
    if (e.state === 'spawn') {
      e.t -= dt;
      if (e.t <= 0) e.state = 'chase';
      return;
    }
    if (!this.tide || this.tide.state !== 'on') return;
    const F = FOES[e.type] || FOES.hush;
    const T = KEEP.tide;
    // (0.83) slows wear off; a stunned foe stands; one Challenged fights its challenger
    if (e.slowT > 0) e.slowT -= dt;
    if (e.judgedT > 0) e.judgedT -= dt; // (0.87)
    const holy = this.hallowed(e.x, e.z, e.radius); // (0.87) Hallowed Ground slows them, and shelters the buildings
    if (e.stunT > 0) {
      e.stunT -= dt * (F.big ? 2 : 1); // (0.84) the big ones shrug off half
      return;
    }
    if (F.role === 'breaker' || F.role === 'thief' || F.role === 'boss' || F.role === 'duel') e.tTauntT = 0; // (0.84) not to be Challenged (0.92: nor an Oathbreaker)
    // (0.92) an Oathbreaker keeps to its chosen while they stand; a Gloamwing hunts the back line
    if (F.role === 'duel' && (!e.duel || e.duel.dead)) e.duel = this.duelPick();
    if (F.role === 'duel' && e.duel) [e.tTarget, e.tRe] = [e.duel, 1];
    if (F.role === 'dive' && (!e.tTarget || e.tTarget.dead || e.tTarget.max != null || e.tRe <= 0)) [e.tTarget, e.tRe] = [this.divePick(e) || e.tTarget, 1];
    // (0.84) each of the stranger children has its own way
    if (F.role === 'boss' && this.tideBossTurn(e, F, dt)) return;
    if (F.role === 'mourn') this.mournerTurn(e, F, dt);
    if (F.role === 'thief') return this.thiefTurn(e, F, dt);
    if (F.role === 'breaker' && (!e.tTarget || !(e.tTarget.max != null && e.tTarget.r != null) || e.tTarget.hp <= 0)) e.tTarget = this.nearestBuild(e);
    if (e.tTauntT > 0) {
      e.tTauntT -= dt;
      if (e.tTauntBy && !e.tTauntBy.dead) e.tTarget = e.tTauntBy;
    }
    e.tRe -= dt;
    if (F.role !== 'breaker' && !(F.role === 'duel' && e.duel) && !(F.role === 'dive' && e.tTarget && !e.tTarget.dead) && !(e.tTauntT > 0) && (e.tRe <= 0 || !e.tTarget || (e.tTarget.hp != null && e.tTarget.hp <= 0) || e.tTarget.dead)) {
      e.tRe = 0.5;
      let best = null, bd = T.engage;
      for (const tr of this.troops) {
        if (tr.dead) continue;
        const d = dist(tr.x, tr.z, e.x, e.z) - (tr.bulwark || 0); // (0.83) the Unmade would rather fight a warrior
        if (d < bd) [best, bd] = [tr, d];
      }
      const me = this.player;
      if (this.inField() && !me.dead && dist(me.x, me.z, e.x, e.z) < bd) best = me; // (0.81.1) the god, walking among them (0.92: or the Seraph)
      if (!best) {
        bd = 1e9;
        for (const b of this.keepBuilds || []) {
          if (b.hp <= 0) continue;
          const d = dist(b.x, b.z, e.x, e.z) - b.r;
          if (d < bd) [best, bd] = [b, d];
        }
      }
      e.tTarget = best;
    }
    const tg = e.tTarget;
    if (!tg) return;
    if (tg === this.player && !this.inField()) {
      e.tTarget = null;
      return;
    }
    const isB = tg.max != null && tg.r != null && tg.hp != null && !tg.cls && tg !== this.player;
    const reach = F.range + e.radius + (isB ? tg.r : 0.4);
    const dx = tg.x - e.x, dz = tg.z - e.z;
    const d = dHypot(dx, dz) || 0.001;
    e.facing = turnToward(e.facing, dAtan2(dz, dx), 8 * dt);
    const fast = (this.omenOn('bloodmoon') ? 1.25 : 1) * (e.enraged ? 1.3 : 1); // (0.84)
    if (d > reach) {
      const sp = F.speed * fast * (e.slowT > 0 ? 1 - e.slow : 1) * (holy ? 1 - MIRACLES.hallow.slow : 1);
      e.px = e.x;
      e.pz = e.z;
      this.navStep(e, tg.x, tg.z, sp, dt, e.radius); // (0.82.1) round what is in the way
      e.moving = true;
      return;
    }
    e.tAtk -= dt;
    if (e.tAtk > 0) return;
    e.tAtk = F.cd / fast;
    e.state = 'chase';
    this.emit('foeHit', { id: e.id, x: e.x, z: e.z, tx: tg.x, tz: tg.z, ranged: !!F.ranged });
    if (isB) this.hurtBuild(tg, e.tbdmg * (F.siege || 1) * (this.omenOn('siegefire') ? 1.5 : 1) * (holy || this.hallowed(tg.x, tg.z, tg.r) ? 1 - MIRACLES.hallow.shelter : 1), e); // (0.82) buildings feel deep nights less than heroes do; (0.87) Hallowed Ground shelters them
    else if (tg === this.player) this.incarnateHurt(e.tdmg);
    else {
      const stone = this.tide.bless.includes('stoneskin') ? 1 - Math.min(0.6, 0.3 * (this.tide.blessPow || 1)) : 1;
      const hp0 = tg.hp;
      const pounce = F.pounce && !(e.pounced || (e.pounced = [])).includes(tg.id) ? (e.pounced.push(tg.id), F.pounce) : 1; // (0.92) a Gloamwing's first blow on each
      this.troopHurt(tg, e.tdmg * stone * pounce);
      if (this.omenOn('hunger') && tg.hp < hp0) e.hp = Math.min(e.maxHp, e.hp + (hp0 - tg.hp) / 3); // (0.84) Hunger
    }
  }

  /** (0.92) Is this omen on tonight (a deep Night has two)? */
  omenOn(id) {
    const t = this.tide;
    return !!t && (t.omen === id || t.omen2 === id);
  }
  /** (0.92) Mend one of the keep's heroes: half as much in a Rotmother's rot. */
  troopMend(tr, amt) {
    if (!tr || tr.dead || !(amt > 0)) return;
    if (tr.rotT > 0) amt *= 1 - FOES.rotmother.rot.cut;
    tr.hp = Math.min(tr.maxHp, tr.hp + amt);
  }
  /** (0.92) An Oathbreaker's chosen: the strongest hero standing (health times damage). */
  duelPick() {
    let best = null, bs = -1;
    for (const tr of this.troops) {
      if (tr.dead) continue;
      const s = tr.maxHp * tr.dmg;
      if (s > bs) [best, bs] = [tr, s];
    }
    return best;
  }
  /** (0.92) A Gloamwing's prey: the nearest archer or mage, else the nearest hero. */
  divePick(e) {
    let best = null, bd = 1e9, back = false;
    for (const tr of this.troops) {
      if (tr.dead) continue;
      const far = tr.range > 3;
      const d = dist(tr.x, tr.z, e.x, e.z);
      if ((far && !back) || ((far === back) && d < bd)) [best, bd, back] = [tr, d, far];
    }
    return best;
  }

  /** (0.84) The nearest standing building. */
  nearestBuild(e) {
    let best = null, bd = 1e9;
    for (const b of this.keepBuilds || []) {
      if (b.hp <= 0) continue;
      const d = dist(b.x, b.z, e.x, e.z) - b.r;
      if (d < bd) [best, bd] = [b, d];
    }
    return best;
  }

  /** (0.84) An Ember Thief: to a building, take its Faith, and run for the dark. */
  thiefTurn(e, F, dt) {
    const t = this.tide;
    if (!e.loot && (!e.tTarget || e.tTarget.hp <= 0)) e.tTarget = this.nearestBuild(e);
    if (e.loot && !e.tTarget) {
      let g = null, gd = 1e9;
      for (const o of this.map.gates || [{ x: this.radius - 4, z: 0 }]) {
        const d = dist(o.x, o.z, e.x, e.z);
        if (d < gd) [g, gd] = [o, d];
      }
      e.tTarget = { x: g.x, z: g.z, gate: true };
    }
    const tg = e.tTarget;
    if (!tg) return;
    const reach = tg.gate ? 1.2 : F.range + e.radius + tg.r;
    const d = dist(tg.x, tg.z, e.x, e.z);
    e.facing = turnToward(e.facing, dAtan2(tg.z - e.z, tg.x - e.x), 8 * dt);
    if (d > reach) {
      e.px = e.x;
      e.pz = e.z;
      const sp = F.speed * (e.loot ? 1.1 : 1) * (this.omenOn('bloodmoon') ? 1.25 : 1) * (e.slowT > 0 ? 1 - e.slow : 1);
      this.navStep(e, tg.x, tg.z, sp, dt, e.radius);
      e.moving = true;
      return;
    }
    if (!e.loot) {
      e.loot = true;
      e.tTarget = null;
      t.stolen++;
      this.emit('thiefStole', { x: e.x, z: e.z, from: tg.id === 'hearth' ? 'the Hearth' : (HALLS[tg.id] && HALLS[tg.id].name) || 'a building' });
      return;
    }
    // into the dark, with it
    e.dead = true;
    e.gone = true;
    e.hp = 0;
    this.emit('thiefEscaped', { x: e.x, z: e.z });
  }

  /** (0.84) A Mourner raises one who fell near her, now and then. */
  mournerTurn(e, F, dt) {
    const t = this.tide;
    e.raiseT -= dt;
    if (e.raiseT > 0) return;
    const c = t.corpses.find((o) => dist(o.x, o.z, e.x, e.z) <= F.raise.r);
    if (!c) {
      e.raiseT = 1;
      return;
    }
    e.raiseT = F.raise.cd;
    t.corpses.splice(t.corpses.indexOf(c), 1);
    const o = this.spawnTideFoe(c.type, c, this.streamRng('mourn', t.seed + this.ticks));
    o.hp = Math.round(o.maxHp * F.raise.hp);
    o.raised = true;
    o.state = 'chase';
    this.emit('mournerRaise', { id: e.id, x: e.x, z: e.z, tx: c.x, tz: c.z });
  }

  /** (0.84) The Tidecaller: slams, calls the Hush, rages when hurt. True while it is busy (the slam's wind-up). */
  tideBossTurn(e, F, dt) {
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      this.emit('tideBossRage', { x: e.x, z: e.z });
    }
    const pace = e.enraged ? 1.3 : 1;
    e.callT -= dt * pace;
    if (e.callT <= 0) {
      e.callT = F.call.cd;
      const rng = this.streamRng('call', this.tide.seed + this.ticks);
      for (let i = 0; i < F.call.n; i++) {
        const a = (i / F.call.n) * Math.PI * 2;
        const o = this.spawnTideFoe('hush', { x: e.x + dCos(a) * 2.5, z: e.z + dSin(a) * 2.5 }, rng);
        o.state = 'chase';
        o.raised = true;
      }
      this.emit('tideCall', { x: e.x, z: e.z, n: F.call.n });
    }
    if (e.slamWind > 0) {
      e.slamWind -= dt;
      if (e.slamWind <= 0) {
        for (const tr of this.troops) if (!tr.dead && dist(tr.x, tr.z, e.x, e.z) <= F.slam.r) this.troopHurt(tr, e.tdmg * F.slam.x);
        if (this.inField() && !this.player.dead && dist(this.player.x, this.player.z, e.x, e.z) <= F.slam.r) this.incarnateHurt(e.tdmg * F.slam.x);
        this.emit('tideSlam', { x: e.x, z: e.z, r: F.slam.r });
      }
      return true;
    }
    e.slamT -= dt * pace;
    if (e.slamT <= 0 && this.troops.some((tr) => !tr.dead && dist(tr.x, tr.z, e.x, e.z) <= F.slam.r)) {
      e.slamT = F.slam.cd;
      e.slamWind = F.slam.wind;
      this.emit('tideSlamWarn', { id: e.id, x: e.x, z: e.z, r: F.slam.r, t: F.slam.wind });
      return true;
    }
    return false;
  }

  /** (0.83) One of the keep's heroes is struck: a rogue may slip it, guard and a Barrier soak it. */
  troopHurt(tg, dmg) {
    if (tg.dead) return;
    if (tg.dodge && this.rng() < tg.dodge) return this.emit('troopDodge', { id: tg.id, x: tg.x, z: tg.z });
    dmg *= 1 - Math.min(0.75, (tg.guard || 0) + (tg.guardT > 0 ? tg.guardB || 0 : 0)); // (0.82) Hero gear: Damage taken
    if (tg.shield > 0) {
      const soak = Math.min(tg.shield, dmg);
      tg.shield -= soak;
      dmg -= soak;
    }
    if (dmg <= 0) return;
    tg.hp -= dmg;
    tg.hurtT = 0.25;
    if (tg.hp <= 0 && tg.unbroken) {
      // (0.82) Unbroken (an Immortal armour): once a night
      tg.unbroken = false;
      tg.hp = tg.maxHp * 0.3;
      this.emit('troopUnbroken', { id: tg.id, x: tg.x, z: tg.z });
    }
    if (tg.hp <= 0) {
      tg.hp = 0;
      tg.dead = true;
      if (this.tide) this.tide.fell++; // (0.84) a star lost
      this.emit('troopFall', { id: tg.id, name: tg.name, x: tg.x, z: tg.z });
    }
  }

  /** The keep's heroes: to the nearest enemy and at it, their skills when they are ready; back to their posts after. */
  stepTroops(dt) {
    const t = this.tide;
    const bp = t.blessPow || 1; // (0.82.1) the Observatory's tier
    const swift = t.bless.includes('swift') ? 1 + 0.3 * bp : 1;
    let fury = (t.bless.includes('fury') ? 1 + 0.3 * bp : 1) * t.echo * (t.hearthDmg || 1);
    // (0.82) an Immortal hero lifts them all
    const imm = this.troops.filter((tr) => !tr.dead && tr.rar >= HERO_RAR_MAX).length;
    fury *= 1 + HERO_RARITY.aura * Math.min(3, imm);
    const foes = this.enemies.filter((e) => e.tide && !e.dead && e.state !== 'spawn');
    // (0.82) Smarter heroes: how much each of the Unmade threatens the keep. One at a building (worse at
    // the Hearth, or at one already hurt) or a wrecker comes first; heroes spread over the threats rather
    // than all chasing the nearest, and archers and mages do not chase far from what they guard.
    const isB = (x) => x && x.max != null && x.r != null && !x.cls && x !== this.player;
    const threat = new Map();
    for (const e of foes) {
      const tg = e.tTarget;
      let th = 0;
      if (isB(tg)) {
        th += dist(e.x, e.z, tg.x, tg.z) - tg.r < 4 ? 14 : 6;
        if (tg.id === 'hearth') th += 6;
        if (tg.hp < tg.max * 0.5) th += 4;
      }
      const F = FOES[e.type];
      if (F && F.siege) th += 3 * F.siege;
      if (F && F.role) th += { thief: e.loot ? 16 : 8, veil: 9, mourn: 9, boss: 5, breaker: 4 }[F.role] || 0; // (0.84) the ones that matter most
      if (e.judgedT > 0) th += 12; // (0.87) Judged: the god has said
      threat.set(e, th);
    }
    const claims = new Map();
    this.stepTroopFalls(dt, foes, fury);
    for (const tr of this.troops) {
      this.striker = tr; // (0.92) whose blows these are (an Oathbreaker cares)
      tr.px = tr.x;
      tr.pz = tr.z;
      tr.moving = false;
      if (tr.hurtT > 0) tr.hurtT -= dt;
      if (tr.guardT > 0) tr.guardT -= dt;
      if (tr.cryT > 0) tr.cryT -= dt;
      if (tr.benT > 0) tr.benT -= dt; // (0.87) Benediction
      if (tr.shieldT > 0 && (tr.shieldT -= dt) <= 0) tr.shield = 0;
      if (tr.dead) continue;
      // (0.83) a War Cry: harder and faster for a while
      const cry = tr.cryT > 0 ? 1 + (tr.cryPow || 0) : 1;
      const ben = tr.benT > 0 ? 1 + (tr.benPow || 0) : 1; // (0.87) Blessed: faster to strike and to move
      const myFury = fury * cry;
      tr.atkT -= dt * swift * cry * ben;
      // (0.83) up to four skills, each on its own cooldown; one a moment, the first that has a reason
      const scd = tr.scd || (tr.scd = {});
      for (const sk of tr.skills || []) if (scd[sk] > 0) scd[sk] -= dt;
      for (const sk of tr.skills || []) {
        if (scd[sk] > 0) continue;
        if (this.troopSkill(tr, sk, foes, myFury)) {
          scd[sk] = SKILLS[sk].cd * (1 - (tr.focus || 0)) * (this.omenOn('eclipse') ? 4 / 3 : 1); // (0.92) Eclipse
          break;
        }
      }
      // (0.83) A healer (one who knows Mend, Barrier or Radiance) keeps the others standing: to whoever is
      // hurt worst, and their own strikes mend instead of wound while anyone needs it.
      if (tr.support && this.troopTend(tr, dt, swift, myFury)) continue;
      tr.reT = (tr.reT || 0) - dt;
      let best = tr.targetId != null ? foes.find((e) => e.id === tr.targetId) || null : null;
      if (!best || tr.reT <= 0) {
        tr.reT = 0.35;
        const was = best;
        let bs = 1e9;
        best = null;
        const many = foes.length > this.troops.length;
        for (const e of foes) {
          const d = dist(e.x, e.z, tr.x, tr.z);
          const th = threat.get(e) || 0;
          const crowd = (claims.get(e) || 0) * (many ? 5 : 2);
          const oath = tr.fx && tr.fx.charm && th >= 6 ? 8 : 0; // Warden's Oath: they run to a building
          const leash = tr.range > 3 && d > 14 && !(e.tTarget && e.tTarget.id === 'hearth') ? (d - 14) * 2 : 0; // (never kept from the Hearth)
          const detour = d > 3 && !this.navClear(tr.x, tr.z, e.x, e.z) ? 5 : 0; // (0.82.1) something in the way: further than it looks
          const finish = e.hp < e.maxHp * 0.25 ? 3 : 0; // one nearly down: finish it
          const score = d - th - oath + crowd + leash + detour - finish + (e === was ? -2 : 0);
          if (score < bs) [best, bs] = [e, score];
        }
        tr.targetId = best ? best.id : null;
      }
      if (best) claims.set(best, (claims.get(best) || 0) + 1);
      // (0.87) with nothing to fight, to Hallowed Ground if there is some
      const zone = !best && this.tide.zones && this.tide.zones.length ? this.tide.zones[this.tide.zones.length - 1] : null;
      const goal = best || (zone ? { x: zone.x + dCos(tr.id) * zone.r * 0.5, z: zone.z + dSin(tr.id) * zone.r * 0.5 } : tr.post);
      const reach = best ? tr.range + best.radius : 0.3;
      const dx = goal.x - tr.x, dz = goal.z - tr.z;
      const d = dHypot(dx, dz) || 0.001;
      if (d > 0.05) tr.facing = turnToward(tr.facing, dAtan2(dz, dx), 9 * dt);
      if (d > reach) {
        // (0.82.1) round the halls and the trees, not into them
        const fa = this.navStep(tr, goal.x, goal.z, Math.min((d - reach + 0.01) / dt, tr.speed * swift * ben), dt, 0.5);
        tr.facing = turnToward(tr.facing, fa, 9 * dt);
        tr.moving = true;
        continue;
      }
      if (!best || tr.atkT > 0) continue;
      tr.atkT = tr.cd;
      let dmg = tr.dmg * myFury;
      const atB = (threat.get(best) || 0) >= 6;
      if (atB || (FOES[best.type] && FOES[best.type].siege)) dmg *= 1 + (tr.siege || 0); // Hero gear: wreckers and foes at a building
      if (atB && tr.fx && tr.fx.charm) dmg *= 1.4; // Warden's Oath
      const crit = tr.crit && this.rng() < tr.crit;
      if (crit) dmg *= tr.critX || 2; // (0.83) a rogue's cut deeper
      this.emit('troopHit', { id: tr.id, cls: tr.cls, x: tr.x, z: tr.z, tx: best.x, tz: best.z, dir: tr.facing, ranged: tr.range > 3 });
      this.troopStrike(best, dmg, crit);
      if (tr.arc) for (const o of foes) if (o !== best && !o.dead && dist(o.x, o.z, best.x, best.z) <= 1.6 + o.radius) this.troopStrike(o, dmg * tr.arc, false); // (0.83) a warrior's swing carries
      if (tr.leech > 0) this.troopMend(tr, dmg * tr.leech);
      if (tr.splash) for (const o of foes) if (o !== best && !o.dead && dist(o.x, o.z, best.x, best.z) <= tr.splash) this.troopStrike(o, dmg * 0.5, false);
      if (tr.fx && tr.fx.weapon && (tr.strikes = (tr.strikes || 0) + 1) % 4 === 0) {
        // Hearthflame (an Immortal weapon): every fourth strike bursts
        for (const o of foes) if (!o.dead && dist(o.x, o.z, best.x, best.z) <= 3 + o.radius) this.troopStrike(o, dmg * 1.5, false);
        this.emit('burst', { x: best.x, z: best.z, radius: 3, color: 0xff7a2a });
      }
    }
    this.striker = null;
  }

  /** One of the keep's heroes hits an enemy of the Tide (its own numbers). */
  troopStrike(e, dmg, crit) {
    if (e.dead) return;
    if (e.judgedT > 0) dmg *= 1 + MIRACLES.judge.mark; // (0.87) Judged: no Veil hides it, and it takes more
    else if (e.veiled) dmg *= 1 - FOES.veilbearer.veil.cut; // (0.84) shrouded by a Veilbearer
    if (e.duel && this.striker && this.striker !== e.duel) dmg *= 1 - FOES.oathbreaker.duel.cut; // (0.92) not its chosen
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    this.emit('damage', { who: 'enemy', id: e.id, x: e.x, z: e.z, amount: dmg, crit, troop: true });
    if (e.hp <= 0) this.killEnemy(e, 'troop');
  }

  /**
   * (0.83) A healer's turn, while someone is hurt: near them, and mending. Heroes first; when none needs it,
   * a hurt hall or the Hearth (not a wrecked one: that is mended at the Hearth by day). True if it took the turn.
   */
  troopTend(tr, dt, swift, fury) {
    let hurt = null, worst = 0.95;
    for (const o of this.troops) {
      if (o.dead) continue;
      const f = o.hp / o.maxHp;
      if (f < worst) [hurt, worst] = [o, f];
    }
    let build = false;
    if (!hurt) {
      worst = 0.97;
      for (const b of this.keepBuilds || []) {
        if (b.hp <= 0 || dist(b.x, b.z, tr.x, tr.z) > 30) continue;
        const f = b.hp / b.max;
        if (f < worst) [hurt, worst, build] = [b, f, true];
      }
    }
    if (!hurt) return false;
    const reach = Math.max(6, tr.range) + (build ? hurt.r : 0);
    const d = dist(hurt.x, hurt.z, tr.x, tr.z);
    if (d > 0.05) tr.facing = turnToward(tr.facing, dAtan2(hurt.z - tr.z, hurt.x - tr.x), 9 * dt);
    if (d > reach) {
      const fa = this.navStep(tr, hurt.x, hurt.z, Math.min((d - reach + 0.01) / dt, tr.speed * swift), dt, 0.5);
      tr.facing = turnToward(tr.facing, fa, 9 * dt);
      tr.moving = true;
      return true;
    }
    if (tr.atkT > 0) return true;
    tr.atkT = tr.cd;
    const top = build ? hurt.max : hurt.maxHp;
    const heal = Math.min(top - hurt.hp, tr.dmg * fury * (build ? 3 : 1.5) * (!build && hurt.rotT > 0 ? 1 - FOES.rotmother.rot.cut : 1)); // (0.92) a Rotmother's rot
    hurt.hp += heal;
    this.emit('troopHeal', { id: tr.id, cls: tr.cls, x: tr.x, z: tr.z, tx: hurt.x, tz: hurt.z, to: build ? 'b:' + hurt.id : hurt.id, amount: Math.round(heal) });
    return true;
  }

  /** (0.83) Meteors on their way down. */
  stepTroopFalls(dt, foes, fury) {
    const falls = this.tide.falls;
    if (!falls || !falls.length) return;
    for (const f of falls) {
      f.t -= dt;
      if (f.t > 0) continue;
      for (const e of foes) if (!e.dead && dist(e.x, e.z, f.x, f.z) <= f.r + e.radius) this.troopStrike(e, f.dmg, false);
      this.emit('troopMeteor', { x: f.x, z: f.z, r: f.r });
    }
    this.tide.falls = falls.filter((f) => f.t > 0);
  }

  /** A hero's skill, if there is a reason to use it now. True if used. (0.83: sixteen of them, four to a hero.) */
  troopSkill(tr, sk, foes, fury) {
    const S = SKILLS[sk];
    if (!S) return false;
    const live = foes.filter((e) => !e.dead);
    const near = (r, x = tr.x, z = tr.z) => live.filter((e) => dist(e.x, e.z, x, z) <= r + e.radius);
    const nearest = (range) => {
      let best = null, bd = range;
      for (const e of live) {
        const d = dist(e.x, e.z, tr.x, tr.z) - e.radius;
        if (d < bd) [best, bd] = [e, d];
      }
      return best;
    };
    // where the enemies are thickest, within range of the hero
    const thickest = (range, r) => {
      let best = null, bn = 0;
      for (const e of live) {
        if (dist(e.x, e.z, tr.x, tr.z) > range) continue;
        const n = near(r, e.x, e.z).length;
        if (n > bn) [best, bn] = [e, n];
      }
      return best;
    };
    const allies = (r) => this.troops.filter((o) => !o.dead && dist(o.x, o.z, tr.x, tr.z) <= r);
    const fx = (tx, tz, extra) => this.emit('troopSkill', { id: tr.id, skill: sk, x: tr.x, z: tr.z, tx, tz, ...extra });
    const hit = (e, x, crit = false) => this.troopStrike(e, tr.dmg * x * fury, crit);
    if (sk === 'cleave' || sk === 'whirlwind') {
      const got = near(S.r);
      if (!got.length) return false;
      for (const e of got) hit(e, S.x);
      if (S.guard) [tr.guardT, tr.guardB] = [S.dur, S.guard];
      fx(tr.x, tr.z, { r: S.r });
      return true;
    }
    if (sk === 'bash') {
      const e = nearest(Math.max(3, tr.range + 1));
      if (!e) return false;
      hit(e, S.x);
      e.stunT = Math.max(e.stunT || 0, S.stun);
      fx(e.x, e.z);
      return true;
    }
    if (sk === 'pierce') {
      const e = nearest(S.len - 2);
      if (!e) return false;
      const a = dAtan2(e.z - tr.z, e.x - tr.x), ux = dCos(a), uz = dSin(a);
      for (const o of live) {
        const along = (o.x - tr.x) * ux + (o.z - tr.z) * uz;
        const off = Math.abs((o.x - tr.x) * uz - (o.z - tr.z) * ux);
        if (along > -0.5 && along <= S.len && off <= 0.9 + o.radius) hit(o, S.x);
      }
      fx(tr.x + ux * S.len, tr.z + uz * S.len);
      return true;
    }
    if (sk === 'volley') {
      const got = live.filter((e) => dist(e.x, e.z, tr.x, tr.z) <= 11).sort((a, b) => dist(a.x, a.z, tr.x, tr.z) - dist(b.x, b.z, tr.x, tr.z)).slice(0, S.n);
      if (!got.length) return false;
      for (const e of got) {
        this.emit('troopHit', { id: tr.id, cls: tr.cls, x: tr.x, z: tr.z, tx: e.x, tz: e.z, dir: tr.facing, ranged: true, skill: 'volley' });
        hit(e, S.x);
      }
      return true;
    }
    if (sk === 'warcry') {
      if (!near(10).length) return false;
      for (const o of allies(S.r)) [o.cryT, o.cryPow] = [S.dur, S.pow];
      fx(tr.x, tr.z, { r: S.r });
      return true;
    }
    if (sk === 'taunt') {
      const got = near(S.r);
      if (!got.some((e) => e.tTarget !== tr)) return false;
      for (const e of got) [e.tTauntT, e.tTauntBy, e.tTarget] = [S.dur, tr, tr];
      [tr.guardT, tr.guardB] = [S.dur, S.guard];
      fx(tr.x, tr.z, { r: S.r });
      return true;
    }
    if (sk === 'lunge') {
      let best = null, bd = 1e9;
      for (const e of live) {
        if (!e.tTarget || e.tTarget.cls) continue; // (one going for a building)
        const d = dist(e.x, e.z, tr.x, tr.z);
        if (d < bd && d < 16) [best, bd] = [e, d];
      }
      if (!best) return false;
      const a = dAtan2(tr.z - best.z, tr.x - best.x);
      tr.x = best.x + dCos(a) * (best.radius + 0.9);
      tr.z = best.z + dSin(a) * (best.radius + 0.9);
      this.pushOut(tr, 0.5);
      hit(best, S.x, true);
      best.stunT = Math.max(best.stunT || 0, S.stun);
      fx(best.x, best.z);
      return true;
    }
    if (sk === 'fireball' || sk === 'frostnova') {
      const e = thickest(11, S.r);
      if (!e) return false;
      for (const o of near(S.r, e.x, e.z)) {
        hit(o, S.x);
        if (S.slow) [o.slowT, o.slow] = [S.dur, S.slow];
      }
      fx(e.x, e.z, { r: S.r });
      return true;
    }
    if (sk === 'chain') {
      let e = nearest(11);
      if (!e) return false;
      const pts = [[tr.x, tr.z]];
      const done = new Set();
      for (let i = 0; i < S.n && e; i++) {
        hit(e, S.x * (1 - 0.15 * i));
        done.add(e);
        pts.push([e.x, e.z]);
        let nx = null, nd = 5;
        for (const o of live) {
          if (done.has(o)) continue;
          const d = dist(o.x, o.z, e.x, e.z);
          if (d < nd) [nx, nd] = [o, d];
        }
        e = nx;
      }
      fx(pts[1][0], pts[1][1], { pts });
      return true;
    }
    if (sk === 'meteor') {
      const e = thickest(13, S.r);
      if (!e) return false;
      (this.tide.falls = this.tide.falls || []).push({ x: e.x, z: e.z, t: S.delay, r: S.r, dmg: tr.dmg * S.x * fury });
      fx(e.x, e.z, { r: S.r, delay: S.delay });
      return true;
    }
    if (sk === 'mend') {
      const hurt = allies(12).filter((o) => o.hp < o.maxHp * (tr.support ? 0.8 : 0.7)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!hurt) return false;
      this.troopMend(hurt, hurt.maxHp * S.heal);
      fx(hurt.x, hurt.z);
      return true;
    }
    if (sk === 'barrier') {
      // the one in most danger: the most hunted, then the most hurt
      const hunted = new Map();
      for (const e of live) if (e.tTarget && e.tTarget.cls && !e.tTarget.dead) hunted.set(e.tTarget, (hunted.get(e.tTarget) || 0) + 1);
      let best = null, bs = 0;
      for (const o of allies(12)) {
        if (o.shield > 0) continue;
        const sc = (hunted.get(o) || 0) + (1 - o.hp / o.maxHp) * 3;
        if (sc > bs) [best, bs] = [o, sc];
      }
      if (!best || bs < 1) return false;
      [best.shield, best.shieldT] = [best.maxHp * S.shield, S.dur];
      fx(best.x, best.z);
      return true;
    }
    if (sk === 'radiance') {
      const round = allies(S.r);
      const fallen = this.troops.find((o) => o.dead && dist(o.x, o.z, tr.x, tr.z) <= S.r);
      const need = round.reduce((n, o) => n + (o.hp < o.maxHp * 0.7 ? 1 : 0), 0);
      if (!fallen && need < 2) return false;
      for (const o of round) this.troopMend(o, o.maxHp * S.heal);
      if (fallen) {
        fallen.dead = false;
        fallen.hp = Math.round(fallen.maxHp / 3);
        this.emit('troopRaised', { id: fallen.id, name: fallen.name, x: fallen.x, z: fallen.z });
      }
      fx(tr.x, tr.z, { r: S.r });
      return true;
    }
    if (sk === 'ward') {
      const b = (this.keepBuilds || []).filter((o) => o.hp > 0 && o.hp < o.max && !(o.wardT > 0)).sort((a, b2) => a.hp / a.max - b2.hp / b2.max)[0];
      if (!b) return false;
      b.wardT = 5;
      fx(b.x, b.z);
      return true;
    }
    return false;
  }

  /** The god's miracles (the hero's Q, W and E in a Tide), paid in Faith. */
  miracle(slot, x, z) {
    const t = this.tide, k = this.player.keep;
    const id = Object.keys(MIRACLES).find((m) => MIRACLES[m].key === slot);
    if (!id || !t || !k) return;
    const M = MIRACLES[id];
    if (t.mcd[id] > 0) return;
    if (k.faith < M.faith) return this.emit('keepShort', { what: 'faith', need: M.faith, have: k.faith });
    x = Number.isFinite(x) ? x : this.player.x;
    z = Number.isFinite(z) ? z : this.player.z;
    k.faith -= M.faith;
    this.keepSpend({ faith: M.faith });
    t.mcd[id] = M.cd;
    let n = 0;
    if (id === 'judge') {
      // (0.87) Judgement: what the heroes strike
      for (const e of this.enemies) {
        if (!e.tide || e.dead || e.state === 'spawn' || dist(e.x, e.z, x, z) > M.radius + e.radius) continue;
        e.judgedT = M.dur;
        this.troopStrike(e, e.maxHp * M.hit, false);
        n++;
      }
    } else if (id === 'bless') {
      // (0.87) Benediction: mend, raise, and quicken
      for (const tr of this.troops) {
        if (dist(tr.x, tr.z, x, z) > M.radius) continue;
        if (tr.dead) {
          tr.dead = false;
          tr.hp = tr.maxHp * M.raise;
          this.emit('troopRaised', { id: tr.id, name: tr.name, x: tr.x, z: tr.z });
        } else this.troopMend(tr, tr.maxHp * M.heal);
        [tr.benT, tr.benPow] = [M.dur, M.pow];
        n++;
      }
    } else if (id === 'hallow') {
      // (0.87) Hallowed Ground: where they hold
      const r = dHypot(x, z), max = this.radius - 2;
      if (r > max) [x, z] = [(x * max) / r, (z * max) / r];
      (t.zones = t.zones || []).push({ x, z, r: M.radius, t: M.dur });
    }
    this.emit('miracle', { id, x, z, r: M.radius, n, dur: M.dur });
  }
  /** (0.87) Is this point on Hallowed Ground? */
  hallowed(x, z, pad = 0) {
    const zs = this.tide && this.tide.zones;
    if (!zs || !zs.length) return null;
    for (const zo of zs) if (dist(zo.x, zo.z, x, z) <= zo.r + pad) return zo;
    return null;
  }

  /** (0.81.1) R in a Tide: the god takes the field with the heroes for a while (Faith). */
  /** (0.85) R in a Tide: pay, and begin the channel where you aim (in the keep, clear of its buildings). */
  incarnate(x, z) {
    const t = this.tide, k = this.player.keep, p = this.player;
    if (!t || t.state !== 'on' || !k || p.dead || p.possess || t.inc > 0 || t.icd > 0 || t.chan != null) return; // (0.92: not from inside the Seraph)
    if (k.faith < INCARNATE.faith) return this.emit('keepShort', { what: 'faith', need: INCARNATE.faith, have: k.faith });
    k.faith -= INCARNATE.faith;
    this.keepSpend({ faith: INCARNATE.faith });
    x = Number.isFinite(x) ? x : p.x;
    z = Number.isFinite(z) ? z : p.z;
    const r = dHypot(x, z), max = this.radius - 3;
    if (r > max) [x, z] = [(x * max) / r, (z * max) / r];
    const at = { x, z, radius: 0.6 };
    this.pushOut(at, 0.6);
    t.chan = 0;
    t.chanAt = { x: at.x, z: at.z };
    t.icd = INCARNATE.cd;
    p.moveTarget = null;
    p.targetId = null;
    p.attackMove = null;
    this.emit('incarnateChannel', { x: at.x, z: at.z, px: p.x, pz: p.z, t: INCARNATE.chan });
  }
  /** (0.89) Incarnate: a quick roll toward (x, z); blows pass through you for a moment. */
  dodge(x, z) {
    const t = this.tide, p = this.player;
    if (!this.handsOn() || p.dead || p.dash || p.dodgeCd > 0) return;
    if (!Number.isFinite(x) || !Number.isFinite(z) || dist(x, z, p.x, p.z) < 0.01) return;
    const a = dAtan2(z - p.z, x - p.x);
    const end = this.clampToArena(p.x + dCos(a) * DODGE.dist, p.z + dSin(a) * DODGE.dist, p.radius);
    p.dash = { t: 0, dur: DODGE.dur, sx: p.x, sz: p.z, ex: end.x, ez: end.z, hit: new Set(), dmg: 0, refunded: true, slot: 'dodge', width: 0 };
    p.dodgeCd = DODGE.cd;
    p.dodgeT = DODGE.grace;
    p.moveTarget = null;
    p.facing = a;
    this.emit('cast', { slot: 'dodge', fx: 'dash', x: p.x, z: p.z, dir: a, ex: end.x, ez: end.z });
  }

  /**
   * (0.90) Incarnate: a strike at nothing in particular, where you aim, at your own pace: a blade cuts what is
   * in its arc (the nearest in full, the rest by half), a bow or a staff looses a shot that flies straight.
   */
  freeSwing(x, z) {
    const t = this.tide, p = this.player;
    if (!this.handsOn() || p.dead || p.dash || p.channel || p.freeSwing) return;
    if (p.attackCd > 0 || p.atkWind > 0) return;
    const a = Number.isFinite(x) && Number.isFinite(z) && dist(x, z, p.x, p.z) > 0.05 ? dAtan2(z - p.z, x - p.x) : p.facing;
    const period = 1 / p.stats.as;
    p.facing = a;
    p.targetId = null;
    p.attackMove = null;
    p.attackCd = period;
    p.freeSwing = { t: period * 0.3, a };
    this.emit('swing', { who: 'player', dir: a, x: p.x, z: p.z, dur: period * 0.3 });
  }
  /** (0.90) A free strike lands. */
  landFreeSwing(fs) {
    const p = this.player, b = this.basic;
    const dmg = p.stats.ad * b.mult;
    const a = fs.a;
    p.swingCount++;
    if (b.shot) {
      this.projectiles.push({
        id: this.nextId++, owner: 'player', kind: b.shot, basic: true, targetId: null, critBonus: 0, pierce: null,
        x: p.x + dCos(a) * 0.7, z: p.z + dSin(a) * 0.7, px: p.x, pz: p.z,
        vx: dCos(a) * b.speed, vz: dSin(a) * b.speed, speed: b.speed, radius: 0.35, dmg, parryable: false, reflected: false, life: 1.2, dead: false,
      });
      return;
    }
    const reach = b.range * (1 + (this.mods.rangePct || 0)) + 0.6;
    const hit = [];
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const d = dist(e.x, e.z, p.x, p.z) - e.radius;
      if (d > reach) continue;
      let da = dAtan2(e.z - p.z, e.x - p.x) - a;
      da = Math.abs(dAtan2(dSin(da), dCos(da)));
      if (da <= 0.95 || d < 0.4) hit.push([e, d]);
    }
    hit.sort((u, v) => u[1] - v[1]);
    hit.forEach(([e], i) => this.hitEnemy(e, i === 0 ? dmg : dmg * 0.5, { basic: i === 0, source: 'basic' }));
  }

  /**
   * (0.91) Over the shoulder, in your hands: Incarnate in your keep's night, or walking a keep between
   * nights (V).
   */
  handsOn() {
    const t = this.tide, p = this.player;
    if (t && t.state === 'on') return (t.inc > 0 || !!p.possess) && this.keepOwns();
    return (!!p.keepWalk || !!p.possess) && !!this.map && this.map.id === KEEP.map; // (0.92) or in the Seraph
  }
  /** (0.91) Walk a keep over your shoulder between nights (on or off). */
  keepWalkSet(on) {
    const p = this.player;
    if (on && (!this.map || this.map.id !== KEEP.map || (this.tide && this.tide.state === 'on') || p.dead)) return;
    p.keepWalk = !!on;
    if (!on) p.freeSwing = null;
    this.emit('keepWalk', { on: p.keepWalk });
  }

  /** (0.85) The channel at work: aura gathers; full, the god lands. */
  stepIncarnateChannel(dt) {
    const t = this.tide;
    t.chan += dt;
    if (t.chan >= INCARNATE.chan) this.incarnateLand();
  }
  /** (0.85) Landing: the blast that saves the heroes (stronger the more aura was gathered), then the fight. */
  incarnateLand() {
    const t = this.tide, p = this.player;
    if (!t || t.chan == null || t.chan < INCARNATE.chanMin) return;
    const aura = Math.min(1, t.chan / INCARNATE.chan);
    const s = 0.4 + 0.6 * aura;
    const L = INCARNATE.land;
    const { x, z } = t.chanAt;
    t.chan = null;
    t.chanAt = null;
    p.x = p.px = x;
    p.z = p.pz = z;
    p.moveTarget = null;
    t.inc = INCARNATE.dur;
    for (const c of ['q', 'w', 'e', 'r']) if (p.cd[c] > 0) p.cd[c] = 0; // (a fresh start for the hero's own kit)
    p.hp = p.stats.maxHp;
    let saved = 0, raised = 0;
    for (const tr of this.troops) {
      if (dist(tr.x, tr.z, x, z) > L.r) continue;
      if (tr.dead) {
        tr.dead = false;
        tr.hp = Math.round(tr.maxHp * L.raise * s);
        raised++;
        this.emit('troopRaised', { id: tr.id, name: tr.name, x: tr.x, z: tr.z });
      } else this.troopMend(tr, tr.maxHp * L.heal * s);
      [tr.shield, tr.shieldT] = [tr.maxHp * L.shield * s, L.shieldDur];
      saved++;
    }
    for (const e of this.enemies) {
      if (!e.tide || e.dead || e.state === 'spawn' || dist(e.x, e.z, x, z) > L.r + e.radius) continue;
      e.stunT = Math.max(e.stunT || 0, L.stun * s);
      // thrown back from where the god lands
      const a = dAtan2(e.z - z, e.x - x), d = dist(e.x, e.z, x, z);
      const push = Math.max(0, (L.r - d) * 0.5);
      e.x += dCos(a) * push;
      e.z += dSin(a) * push;
      this.pushOut(e, e.radius);
      this.troopStrike(e, e.maxHp * L.hit * s, false);
    }
    this.emit('incarnate', { x, z, dur: INCARNATE.dur, aura, r: L.r, saved, raised });
  }
  incarnateEnd(fell) {
    const t = this.tide, p = this.player;
    if (!t) return;
    t.inc = 0;
    p.targetId = null;
    p.attackMove = null;
    if (fell) p.hp = Math.max(1, Math.round(p.stats.maxHp * 0.25));
    this.emit('incarnateEnd', { fell: !!fell, x: p.x, z: p.z });
  }
  /** A Tide foe's blow on the incarnate god: a fall ends the incarnation, never the hero. */
  incarnateHurt(dmg) {
    const p = this.player;
    if (p.dodgeT > 0 || (p.dash && !p.dash.refunded && p.possess)) return this.emit('dodged', { x: p.x, z: p.z }); // (0.89) rolled through it (0.92: or mid-glide)
    const stone = this.tide.bless.includes('stoneskin') ? 0.7 : 1;
    // (as a mortal: health counted as if it were INCARNATE.body, so any hero's gear makes the same fight)
    // (0.92) the Seraph: its body at the Night its level matches
    const k = p.keep;
    const body = p.possess ? STATUE.body * statuePower(k && k.statue ? k.statue.lvl : 1) : INCARNATE.body;
    const n = Math.max(1, Math.round((p.stats.maxHp * dmg * stone) / body));
    p.hp -= n;
    this.emit('damage', { who: 'player', x: p.x, z: p.z, amount: n });
    if (p.hp <= 1) return p.possess ? this.possessEnd(true) : this.incarnateEnd(true);
  }

  /** (0.92) Is the keeper on the field in a night: incarnate, or in the Seraph? */
  inField() {
    const t = this.tide;
    return !!t && (t.inc > 0 || !!this.player.possess);
  }
  /** (0.92) The Seraph's level (0 if it is not raised). */
  statueLvl() {
    const k = this.player.keep;
    return k && k.statue ? k.statue.lvl : 0;
  }
  /** (0.92) The worshippers raise the Seraph (at its plinth, once a Night this deep is held). */
  statueRaise() {
    const k = this.player.keep;
    if (!this.inKeep() || !k || k.statue) return;
    if ((k.nightMax || 0) < STATUE.needNight) return this.emit('keepShort', { what: 'night', need: STATUE.needNight, have: k.nightMax || 0 });
    const c = STATUE.raise;
    if (k.sigils < c.sigils) return this.emit('keepShort', { what: 'sigils', need: c.sigils, have: k.sigils });
    if (!this.keepPay({ faith: c.faith, stone: c.stone })) return;
    k.sigils -= c.sigils;
    k.statue = { lvl: Math.max(1, Math.min(statueCap(k), k.nightMax - STATUE.startBelow)), xp: 0, rest: 0, hp: 1, fells: 0, nights: 0 };
    this.emit('statueRaised', { lvl: k.statue.lvl, x: STATUE.at.x, z: STATUE.at.z });
  }
  /** (0.92) Faith laid at the Seraph's feet: a quarter of a level each time (n times at once). */
  statueOffer(n = 1) {
    const k = this.player.keep;
    if (!this.inKeep() || !k || !k.statue) return;
    n = Math.max(1, Math.min(100, Math.floor(Number(n) || 1)));
    let done = 0;
    for (let i = 0; i < n; i++) {
      const s = k.statue;
      if (s.lvl >= statueCap(k)) {
        if (!done) this.emit('keepMaxed', { name: STATUE.name, what: 'level', cap: statueCap(k) });
        break;
      }
      const c = STATUE.offer(s.lvl);
      if (k.faith < c.faith) {
        if (!done) this.emit('keepShort', { what: 'faith', need: c.faith, have: k.faith });
        break;
      }
      k.faith -= c.faith;
      this.keepSpend({ faith: c.faith });
      this.statueXp(STATUE.need(s.lvl) * STATUE.offerShare, true);
      done++;
    }
    if (done) this.emit('statueOffered', { n: done, lvl: k.statue.lvl, xp: k.statue.xp });
  }
  /** (0.92) The Seraph grows (never past the best Night held). */
  statueXp(n, quiet = false) {
    const k = this.player.keep, s = k && k.statue;
    if (!s || !(n > 0)) return;
    const cap = statueCap(k);
    if (s.lvl >= cap) return;
    s.xp += Math.round(n);
    let up = 0;
    while (s.lvl < cap && s.xp >= STATUE.need(s.lvl)) {
      s.xp -= STATUE.need(s.lvl);
      s.lvl++;
      up++;
    }
    if (s.lvl >= cap) s.xp = Math.min(s.xp, STATUE.need(s.lvl) - 1);
    if (up) this.emit('statueLevel', { lvl: s.lvl, cap, unlocked: Object.keys(STATUE_KIT).filter((c) => STATUE_KIT[c].unlock > s.lvl - up && STATUE_KIT[c].unlock <= s.lvl).map((c) => STATUE_KIT[c].name) });
  }
  /** (0.92) P in your keep: into the Seraph, or (on false) back out. */
  possessSet(on) {
    const p = this.player, k = p.keep, t = this.tide;
    if (!on) return this.possessEnd(false);
    if (p.possess || !this.inKeep() || !k || p.dead) return;
    if (!k.statue) return this.emit('statueNone', { need: STATUE.needNight, have: k.nightMax || 0 });
    if (k.statue.rest > 0) return this.emit('statueResting', { t: Math.ceil(k.statue.rest) });
    if (t && t.state === 'on' && (t.inc > 0 || t.chan != null)) return; // already on the field as yourself
    p.possess = { ranks: p.ranks, hp: p.hp, x: p.x, z: p.z, walk: !!p.keepWalk };
    p.keepWalk = false;
    p.ranks = { q: 1, w: 1, e: 1, r: 1, d: 1, f: 1 };
    // it steps down from its plinth, toward the Hearth
    const a = dAtan2(-STATUE.at.z, -STATUE.at.x);
    const at = { x: STATUE.at.x + dCos(a) * 1.8, z: STATUE.at.z + dSin(a) * 1.8, radius: p.radius };
    this.pushOut(at, p.radius);
    [p.x, p.z, p.px, p.pz, p.facing] = [at.x, at.z, at.x, at.z, a];
    [p.moveTarget, p.targetId, p.attackMove, p.dash, p.leap, p.channel, p.freeSwing, p.spin] = [null, null, null, null, null, null, null, null];
    for (const c of ['q', 'w', 'e', 'r']) p.cd[c] = 0;
    this.recalcStats();
    p.hp = Math.max(1, Math.round(p.stats.maxHp * k.statue.hp));
    this.emit('possess', { on: true, x: p.x, z: p.z, lvl: k.statue.lvl });
  }
  /** (0.92) Out of the Seraph: it is stone on its plinth again (felled: for a while), and you are yourself. */
  possessEnd(fell) {
    const p = this.player, k = p.keep, P = p.possess;
    if (!P) return;
    const x = p.x, z = p.z;
    if (k && k.statue) {
      k.statue.hp = fell ? 1 : Math.max(0.05, Math.min(1, p.hp / Math.max(1, p.stats.maxHp)));
      if (fell) {
        k.statue.rest = STATUE.rest;
        k.statue.fells++;
      }
    }
    p.possess = null;
    p.ranks = P.ranks;
    [p.dash, p.leap, p.channel, p.freeSwing, p.spin, p.targetId, p.attackMove, p.moveTarget] = [null, null, null, null, null, null, null, null];
    this.recalcStats();
    p.hp = Math.max(1, Math.min(p.stats.maxHp, P.hp));
    [p.x, p.z, p.px, p.pz] = [P.x, P.z, P.x, P.z];
    if (P.walk && !(this.tide && this.tide.state === 'on') && this.map && this.map.id === KEEP.map) p.keepWalk = true;
    this.emit('possess', { on: false, fell: !!fell, x, z, rest: fell ? STATUE.rest : 0 });
  }
  /** (0.92) The Seraph between times: stone mends, and a felled one wakes. */
  stepStatue(dt) {
    const k = this.player.keep, s = k && k.statue;
    if (!s || !this.inKeep()) return;
    if (s.rest > 0) {
      s.rest -= dt;
      if (s.rest <= 0) {
        s.rest = 0;
        this.emit('statueWakes', { x: STATUE.at.x, z: STATUE.at.z });
      }
    }
    if (!this.player.possess && s.hp < 1 && !(this.tide && this.tide.state === 'on')) s.hp = Math.min(1, s.hp + dt / 60);
    if (this.player.possess && this.tide && this.tide.state === 'on') this.tide.posT = (this.tide.posT || 0) + dt;
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
    // (0.61.1) everything gathered comes home, however the run ends (a fall too). (0.65) It is handed over
    // wave by wave (ringGive), so this only settles what is left and says what the run gave in all.
    const r = this.ring;
    if (!r || r.paid[this.cur.pid]) return;
    r.given = r.given || {};
    const due = ringWhole(r.pot) - (r.given[this.cur.pid] || 0);
    const got = due > 0 ? this.ringHand(r, due) : { scrapped: 0, immortals: 0 };
    r.given[this.cur.pid] = ringWhole(r.pot);
    r.paid[this.cur.pid] = true;
    this.sweepLoot();
    this.emit('ringPaid', { kind: r.kind, slot: r.slot, n: ringWhole(r.pot), wave: r.wave || 0, scrapped: got.scrapped, immortals: got.immortals, total: true });
  }

  /** (0.65) After every wave: each hero gets what the spoils have grown by since they were last paid. */
  ringGive() {
    const r = this.ring;
    if (!r) return;
    r.given = r.given || {};
    for (const h of this.heroes) {
      if (r.paid[h.pid]) continue;
      const due = ringWhole(r.pot) - (r.given[h.pid] || 0);
      if (due <= 0) continue;
      r.given[h.pid] = (r.given[h.pid] || 0) + due;
      this.as(h, () => {
        const got = this.ringHand(r, due);
        this.emit('ringDrop', { kind: r.kind, slot: r.slot, n: due, wave: r.wave || 0, scrapped: got.scrapped, immortals: got.immortals });
      });
    }
  }

  /** Hand `n` of the run's focus to the acting hero (gold, Fragments, Wishdust or gear for its slot). */
  ringHand(r, n) {
    const p = this.player;
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
        } else if (this.autoTake(item)) {
          // (0.75) fed to an Eternal
        } else if (p.bag.length < this.bagSize(p)) p.bag.push(item);
        else {
          p.scrap += scrapValue(item);
          scrapped++;
        }
      }
    }
    return { scrapped, immortals };
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
      } else if (this.autoTake(l.item)) {
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
      return; // (0.66) withdrawn for now (see main.js renderWell); what follows is kept for when it returns
      // eslint-disable-next-line no-unreachable
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
  buyPerk(id, n = 1) {
    const p = this.player;
    const perk = PERKS[id];
    const rb = p.rebirth;
    if (!perk || this.trial) return;
    const want = Math.max(1, Math.min(10, Math.floor(Number(n) || 1)));
    let got = 0;
    for (let i = 0; i < want; i++) {
      const r = perkRank(rb, id);
      if (r >= perk.max || rb.marks < perk.cost) break;
      rb.marks -= perk.cost;
      rb.perks[id] = r + 1;
      if (id === 'head') p.skillPoints++; // a Head Start bought mid-life counts at once
      got++;
    }
    if (!got) return;
    this.recalcStats();
    this.emit('perkBought', { id, rank: perkRank(rb, id), n: got });
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
        } else if (this.autoTake(l.item)) {
          // (0.75) fed to an Eternal (its own message)
        } else {
          p.bag.push(l.item);
          this.emit('pickup', { item: l.item, equipped: false, upgrade });
        }
      }
    }
    this.autoScrapLoot(); // (0.74)
    this.loot = this.loot.filter((l) => !l.taken);
  }

  /**
   * (0.74) Loot left lying is scrapped for you: after 25 seconds, or at once past 24 pieces on the ground
   * (oldest first), you get its scrap and Wishdust as if you had scrapped it. Immortals, Eternals, set
   * pieces and anything a friend dropped for you are never touched. (A hundred pieces lying about a
   * boss fight made every update heavy.)
   */
  autoScrapLoot() {
    const mine = this.loot.filter((l) => !l.taken && (l.owner === undefined || l.owner === this.cur.pid) && l.item && l.item.rarity < IMMORTAL && !l.item.eternal && !l.item.set && l.droppedBy === undefined);
    const over = Math.max(0, mine.length - LOOT_KEEP);
    const old = mine.filter((l) => l.age > LOOT_AGE);
    const go = new Set(old);
    for (const l of mine.slice().sort((a, b) => b.age - a.age).slice(0, over)) go.add(l);
    if (!go.size) return;
    const p = this.player;
    let scrap = 0, dust = 0;
    for (const l of go) {
      l.taken = true;
      scrap += scrapValue(l.item);
      dust += dustValue(l.item);
    }
    dust = this.keptRate(dust);
    p.scrap += scrap;
    p.dust += dust;
    p.autoScrapN = (p.autoScrapN || 0) + go.size;
    p.autoScrapS = (p.autoScrapS || 0) + scrap;
    p.autoScrapD = (p.autoScrapD || 0) + dust;
    if (!(p.groundScrapTold > this.time)) {
      // told in one line every few seconds, not a line a piece
      p.groundScrapTold = this.time + 5; // (0.75.5: was autoScrapAt, the same name as the auto-scrap setting, which it overwrote)
      this.emit('autoScrap', { count: p.autoScrapN, scrap: p.autoScrapS, dust: p.autoScrapD });
      p.autoScrapN = p.autoScrapS = p.autoScrapD = 0;
    }
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
    if (item.locked) return this.emit('itemIsLocked', { name: item.name }); // (0.75.2)
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
    const list = Array.isArray(ids) ? [...new Set(ids)].filter((id) => p.bag.some((it) => it.id === id && !it.gift && !it.locked)).slice(0, 8) : []; // (0.58) not a gift
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
    if (old && old.eternal) {
      // (0.71) an Eternal taken off goes back to its own place, never the gear box
      p.eternals[item.slot] = old;
      p.bag.splice(index, 1);
    } else if (old) p.bag[index] = old;
    else p.bag.splice(index, 1);
    this.recalcStats();
    this.emit('equip', { item });
  }

  /** (0.71) Wear the Eternal piece for this slot; what was worn there goes to the gear box (if there is room). */
  wearEternal(slot) {
    const p = this.player;
    const it = p.eternals && p.eternals[slot];
    if (!it) return;
    if (it.cls && it.cls !== this.cls) return;
    const old = p.equipped[slot];
    if (old && old.id !== 'starter') {
      if (p.bag.length >= this.bagSize()) {
        this.emit('bagFull', {});
        return;
      }
      p.bag.push(old);
    }
    p.equipped[slot] = it;
    p.eternals[slot] = null;
    this.recalcStats();
    this.emit('equip', { item: it });
  }

  /** (0.71) Take an Eternal off: back to its place; the slot stays empty (a weapon slot takes the training weapon). */
  stowEternal(slot) {
    const p = this.player;
    const it = p.equipped[slot];
    if (!it || !it.eternal) return;
    p.eternals[slot] = it;
    p.equipped[slot] = slot === 'weapon' ? starterWeapon(this.cls) : null;
    this.recalcStats();
    this.emit('unequip', { item: it });
  }

  /** The Eternal piece for this slot, worn or stowed. */
  eternalAt(slot) {
    const p = this.player;
    const worn = p.equipped[slot];
    return worn && worn.eternal ? worn : (p.eternals && p.eternals[slot]) || null;
  }

  /**
   * (0.71) Feed an Eternal: an Immortal from the gear box (index), or Eternity Essence (essence: how much,
   * as much as it can take when not said). What would go past its last level comes back as Essence.
   */
  feedEternal(slot, index, essence, ids) {
    const p = this.player;
    const it = this.eternalAt(slot);
    if (!it) return;
    const room = xpToMax(it);
    if (room <= 0) return this.emit('eternalFull', { slot });
    const before = it.level;
    let xp = 0, eaten = 0;
    if (Array.isArray(ids) || index != null) {
      // (0.75) the Immortals the player chose, all at once (or one by its place in the bag, as before 0.75).
      // Only as many as it can still take: once it is full, the rest stay in the bag.
      const want = new Set(Array.isArray(ids) ? ids.slice(0, 200).map(String) : p.bag[index] ? [String(p.bag[index].id)] : []);
      const take = [];
      for (let i = 0; i < p.bag.length && xp < room; i++) {
        const food = p.bag[i];
        if (!food || food.locked || !want.has(String(food.id)) || food.rarity !== IMMORTAL || food.eternal) continue; // Immortals only, (0.75.2) never a locked one
        take.push(i);
        xp += feedValue(food);
      }
      if (!take.length) return;
      for (let j = take.length - 1; j >= 0; j--) {
        this.tradeItemGone(p.bag[take[j]].id);
        p.bag.splice(take[j], 1);
      }
      eaten = take.length;
    } else {
      const want = essence == null ? Infinity : Math.max(0, Number(essence) || 0);
      const units = Math.min(p.eternalEssence, want, room / ETERNAL.essenceXp);
      if (!(units > 0)) return;
      p.eternalEssence = Math.max(0, p.eternalEssence - units);
      xp = units * ETERNAL.essenceXp;
    }
    const over = feedEternalXp(it, xp, this.streamRng('eternal', this.ticks + it.level * 7 + xp));
    if (over > 0) p.eternalEssence += over / ETERNAL.essenceXp; // the rest comes back
    this.recalcStats();
    this.emit('eternalFed', { slot, name: it.name, level: it.level, from: before, back: over / ETERNAL.essenceXp, slots: it.passives.length, eaten });
  }

  /** (0.75.3) A piece coming to the hero: auto-scrapped, auto-fed, or neither (false: it goes to the bag). */
  autoTake(item) {
    return this.autoScrapNew(item) || this.autoFeed(item);
  }

  /**
   * (0.75.3) Auto-scrap, when the player has chosen a rarity: a new piece of that rarity or lower is broken
   * down as it comes (scrap and Wishdust, as Shift-click gives), unless it would be an upgrade on them or
   * is a set piece. Never an Immortal or better.
   */
  autoScrapNew(item) {
    const p = this.player;
    const at = p.autoScrapAt;
    if (at == null || this.trial || !item || item.rarity > at || item.rarity >= IMMORTAL || item.set || item.eternal || item.locked) return false;
    // (0.81.4) kept only if it beats what you wear AND anything already waiting in the bag for that slot:
    // after a rebirth every slot is bare, and "an upgrade" used to keep every piece that dropped
    if (itemScore(item) > this.bestFor(item.slot)) return false;
    const scrap = scrapValue(item);
    const dust = this.keptRate(dustValue(item));
    p.scrap += scrap;
    p.dust += dust;
    this.emit('autoScrapNew', { scrap, dust, rarity: item.rarity });
    return true;
  }

  /** (0.81.4) The best score among what is worn in a slot and what waits in the bag for it. */
  bestFor(slot, skip = null) {
    const p = this.player;
    let best = itemScore(p.equipped[slot]);
    for (const it of p.bag) if (it && it !== skip && it.slot === slot) best = Math.max(best, itemScore(it));
    return best;
  }

  /** (0.75.3) Choose the auto-scrap rarity (null: off; 0 Common up to 5 Ancient), and clear the bag of it once. */
  setAutoScrap(to) {
    const p = this.player;
    p.autoScrapAt = Number.isInteger(to) && to >= 0 && to < IMMORTAL ? to : null;
    if (p.autoScrapAt == null) return;
    const trading = new Set(this.tradeFor(this.cur.pid)?.items[this.cur.pid] || []);
    let scrap = 0, dust = 0, count = 0;
    // (0.81.4) of the pieces that beat what you wear, only the best for each slot is kept
    const keep = new Set();
    for (const it of p.bag) {
      if (!it || itemScore(it) <= itemScore(p.equipped[it.slot])) continue;
      const cur = [...keep].find((k) => k.slot === it.slot);
      if (!cur || itemScore(it) > itemScore(cur)) {
        if (cur) keep.delete(cur);
        keep.add(it);
      }
    }
    p.bag = p.bag.filter((it) => {
      if (!it || it.locked || it.set || it.rarity > p.autoScrapAt || trading.has(it.id) || keep.has(it)) return true;
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

  /**
   * (0.75) Auto-feed, when the player has turned it on: an Immortal that comes to them (picked up, from a
   * cache or the Ring) goes straight to an Eternal that is not full yet, the one they chose or else the
   * lowest. Never a set piece, an Heirloom, or one that would be an upgrade on them. True if it was eaten.
   */
  autoFeed(item) {
    const p = this.player;
    if (!p.eternalAuto || this.trial || !item || item.rarity !== IMMORTAL || item.eternal || item.set || item.heirloom) return false;
    if (itemScore(item) > itemScore(p.equipped[item.slot])) return false;
    const lv = (s) => (this.eternalAt(s) ? this.eternalAt(s).level || 1 : 99);
    const order = [...(p.eternalAuto === 'low' ? [] : [p.eternalAuto]), ...SLOTS.slice().sort((a, b) => lv(a) - lv(b))];
    const slot = order.find((s) => this.eternalAt(s) && xpToMax(this.eternalAt(s)) > 0);
    if (!slot) return false;
    const it = this.eternalAt(slot);
    const before = it.level;
    const xp = feedValue(item);
    const over = feedEternalXp(it, xp, this.streamRng('eternal', this.ticks + it.level * 7 + xp));
    if (over > 0) p.eternalEssence += over / ETERNAL.essenceXp;
    this.recalcStats();
    this.emit('eternalFed', { slot, name: it.name, level: it.level, from: before, back: over / ETERNAL.essenceXp, slots: it.passives.length, eaten: 1, auto: true, food: item.name });
    return true;
  }

  /** (0.74) Forge an Eternal piece you lack, from Eternity Essence. */
  forgeEternal(slot) {
    const p = this.player;
    if (this.trial || !SLOTS.includes(slot) || this.eternalAt(slot)) return;
    if (p.eternalEssence < ETERNAL.forgeCost - 1e-9) return this.emit('eternalShort', { need: ETERNAL.forgeCost });
    p.eternalEssence = Math.max(0, p.eternalEssence - ETERNAL.forgeCost);
    const it = rollEternal(this.streamRng('eternalForge', this.ticks + SLOTS.indexOf(slot) * 31), Math.max(1, Math.round(p.level)), slot, this.cls);
    p.eternals[slot] = it;
    this.emit('eternalDrop', { slot, name: it.name, forged: true, x: p.x, z: p.z });
  }

  /** (0.71) A Granted beaten in Caelum: now and then, an Eternal piece the hero lacks (or Essence once they have all five). */
  eternalDrop(e) {
    const p = this.player;
    const chance = this.map && ETERNAL.chance[this.map.id];
    if (!chance || !e.def.granted || !e.def.boss || this.trial) return;
    if (!p.eternalFirsts.includes(e.type)) {
      // (0.73) the first time each Granted falls to this hero: Eternity Essence, waiting in the Eternal
      // panel for the first piece (and kept through every rebirth)
      p.eternalFirsts.push(e.type);
      p.eternalEssence += ETERNAL.firstKill;
      this.emit('eternalDrop', { essence: ETERNAL.firstKill, first: true, boss: e.def.name, x: e.x, z: e.z });
    }
    const r = this.streamRng('eternalDrop', (p.bossKills[e.type] || 0) * 13 + this.ticks);
    // (0.71.1) +2% for every kill without one (reset when one falls), and in a party the chance is shared
    // out among those there: each rolls their own, at a share of it. (0.74.1) A party shares twice the
    // chance: a pair each roll the whole of it, three two-thirds each, four half each.
    const party = Math.max(1, this.heroes.filter((h) => h.player && !h.player.dead).length || 1);
    const share = party === 1 ? 1 : ETERNAL.partyShare / party;
    const odds = (chance + ETERNAL.pity * (p.eternalPity || 0)) * share;
    if (r() >= odds) {
      p.eternalPity = (p.eternalPity || 0) + 1;
      return;
    }
    p.eternalPity = 0;
    const missing = SLOTS.filter((s) => !this.eternalAt(s));
    if (!missing.length) {
      p.eternalEssence += ETERNAL.essencePerDrop;
      this.emit('eternalDrop', { essence: ETERNAL.essencePerDrop, x: e.x, z: e.z });
      return;
    }
    const slot = missing[Math.floor(r() * missing.length)];
    const it = rollEternal(r, Math.max(1, Math.round(p.level)), slot, this.cls);
    p.eternals[slot] = it;
    this.emit('eternalDrop', { slot, name: it.name, x: e.x, z: e.z });
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
  /** (0.75.2) Lock (or unlock) a piece in the bag or worn: a locked piece is never scrapped, fed, traded or dropped. */
  lockItem(index, slot) {
    const p = this.player;
    const item = slot != null ? SLOTS.includes(slot) && p.equipped[slot] : p.bag[index];
    if (!item || item.eternal) return; // an Eternal can never be lost anyway
    if (item.locked) delete item.locked;
    else item.locked = true;
    if (item.locked) this.tradeItemGone(item.id);
    this.emit('itemLocked', { name: item.name, locked: !!item.locked });
  }

  discard(index) {
    const p = this.player;
    const item = p.bag[index];
    if (!item) return;
    if (item.locked) return this.emit('itemIsLocked', { name: item.name }); // (0.75.2)
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
      if (it.locked || kept.has(it.rarity) || trading.has(it.id)) return true; // never scrap what is on offer in a trade, or (0.75.2) locked
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
  /** Open a cache; `n` (0.65, Shift+click: 10) opens that many, stopping when the bag is full or the keys run out. */
  openCache(tier, n = 1) {
    const p = this.player;
    const def = CACHES[tier];
    if (!def) return;
    n = Math.max(1, Math.min(10, Math.floor(Number(n) || 1)));
    const items = [];
    for (let i = 0; i < n; i++) {
      if (p.bag.length >= this.bagSize(p)) {
        if (!items.length) this.emit('bagFull');
        break;
      }
      const { gold, keys } = this.cacheCost(tier);
      if (p.gold < gold || p.keys < keys) {
        if (!items.length) this.emit('cantAfford');
        break;
      }
      p.gold -= gold;
      p.keys -= keys;
      const item = rollItem(this.rng, Math.max(1, this.player.level), { weights: def.odds, cls: this.cls });
      if (!this.autoTake(item)) p.bag.push(item);
      items.push(item);
    }
    if (items.length === 1) this.emit('cacheOpened', { item: items[0], tier });
    else if (items.length) this.emit('cacheOpened', { item: items.reduce((b, it) => (it.rarity > b.rarity ? it : b)), items, tier });
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
  rankUp(slot, n = 1) {
    const p = this.player;
    if (p.possess || !this.kit[slot] || p.skillPoints <= 0 || p.ranks[slot] >= CONFIG.MAX_RANK || !this.abilityUnlocked(slot)) return; // (0.92: not while in the Seraph)
    // (0.91.1) as many as asked (a held key or button asks for more each moment), as far as the points and
    // the cap allow
    const want = Math.max(1, Math.min(1000, Math.floor(Number(n) || 1)));
    const k = Math.min(want, p.skillPoints, CONFIG.MAX_RANK - p.ranks[slot]);
    p.ranks[slot] += k;
    p.skillPoints -= k;
    this.emit('rankUp', { slot, rank: p.ranks[slot], n: k });
  }

  // --- Augments --------------------------------------------------------------
  /** Put three augments on offer. The next wave waits until one is taken. */
  /** Every augment this hero could be offered now (not yet taken, its class and subclass, unlocked). */
  augmentPool(exclude = []) {
    return AUGMENT_IDS.filter((id) => {
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
  }

  makeOffer(boss, exclude = []) {
    const rng = this.streamRng('offer', this.offerCount++); // the same offers for everyone on the same seed
    const pool = this.augmentPool(exclude);
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
    if (this.picks && this.picks.length) this.makeOffer(this.picks.shift()); // (0.65) the next one owed
  }

  /**
   * (0.65) Starting the Ring further in costs nothing: before the first wave, every hero is offered the
   * picks waves 1 to the one before would have given (one after every odd wave, a stronger one after
   * every boss), one after another.
   */
  ringCatchUp() {
    this.ring.caught = true;
    const before = this.wave.cleared || 0;
    if (before < 1 || this.twist) return;
    const owed = [];
    for (let n = 1; n <= before; n++) {
      const boss = n % CONFIG.BOSS_EVERY === 0;
      if (n % 2 === 1 || boss) owed.push(boss);
    }
    for (const h of this.heroes) {
      this.as(h, () => {
        // (0.66) owed at least as many as there are left to take: take them all, no picking
        const pool = this.augmentPool();
        if (owed.length >= pool.length) {
          for (const id of pool) this.augments.push(id);
          this.recalcStats();
          this.emit('augmentsAll', { n: pool.length });
          return;
        }
        this.picks = owed.slice();
        if (!this.offer && this.picks.length) this.makeOffer(this.picks.shift());
      });
    }
    this.emit('ringCatchUp', { picks: owed.length, from: before + 1 });
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
    const wind = atk.windup * (e.enraged ? 0.82 : 1) * (e.swift ? 0.75 : 1);
    e.dur = e.pace < 1 ? Math.max(Math.min(wind, 0.3), wind * e.pace) : wind; // (0.65) faster on later tiers, never under 0.3 s
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
    const tele = { id: this.nextId++, owner: e.id, foe: true, kind: atk.shape, x: e.x, z: e.z, dir: e.aim, t: 0, dur: e.dur, parryable: atk.parryable, cue: false, ...(atk.dominion ? { dominion: e.animusNeed || 0 } : {}) };
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
        else this.hitPlayer(f.dmg, src ? { parryable: false, src, lock: f.lock || 0, need: f.need || 0 } : { parryable: false, proj: { level: f.level, srcId: f.srcId }, lock: f.lock || 0, need: f.need || 0 });
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
        this.falls.push({ x: c.x, z: c.z, r: atk.radius, t: -i * atk.gap, dur: atk.fall, dmg: atk.dmg * e.dmgMult, level: e.level, srcId: e.id, tele: null, pool: atk.pool || null, fx: atk.fx || null, lock: atk.lock || 0, need: e.animusNeed || 0 });
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
        if (e.animusNeed) o.animusNeed = e.animusNeed; // (0.64) the Granted's own ask the same
        if (e.pace) this.setPace(o, e.pace, e.tempo, e.move); // (0.65) and keep their pace
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
      const res = this.hitPlayer(atk.dmg * e.dmgMult, { parryable: atk.parryable, src: e, dominion: !!atk.dominion, lock: atk.lock || 0, need: e.animusNeed || 0 });
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
        if (also) this.as(h, () => this.hitPlayer(atk.dmg * e.dmgMult, { parryable: atk.parryable, src: e, dominion: !!atk.dominion, lock: atk.lock || 0, need: e.animusNeed || 0 }));
      }
    }
    if (e.dead || e.state === 'stunned') return; // its guard was broken by the parry

    e.lastAtk = atk.name;
    if (atk.chain) {
      this.startWindup(e, (e.kitDef || e.def).attackByName[atk.chain], true);
    } else {
      e.state = 'recover';
      e.t = atk.recover * (e.tempo || 1);
      e.atkCd = (e.def.atkCd[0] + this.rng() * (e.def.atkCd[1] - e.def.atkCd[0])) * (e.tempo || 1);
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
    if (p.edricT > 0) dmg *= 1 + 0.12 * this.pot('edric') * (p.edricStacks || 0); // Edric's Sword (0.47); (0.65) stars
    if (this.mods.bluetrim && p.hp > p.stats.maxHp * 0.7) dmg *= 1 + 0.18 * this.pot('bluetrim'); // Edric's Colours (0.61.5: 18% above 70%)
    if (opts.basic && !opts.noTail && this.mods.tailwind > 0 && (p.rushT > 0 || p.hurricaneT > 0 || this.galeAlways())) {
      // Tailwind (Windrunner): on-hit damage (before the crit roll since 0.43, so it crits too), and the next roll comes sooner.
      const k = opts.tails ?? 1; // (0.81.5) a folded volley carries the Tailwind of every arrow in it
      dmg += (p.stats.ad * this.mods.tailwind + 2 * p.level) * k;
      if (p.cd.e > 0) p.cd.e = Math.max(0, p.cd.e - this.mods.tailwindCdr * k);
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
      if (!p.possess) {
        // (0.92) the Seraph's blows are its own, whatever hero is in it
        dmg *= this.gapScale(e.level).dealt;
        dmg *= classPower(this.cls, SPECS[p.spec] && SPECS[p.spec].cls === this.cls ? p.spec : null, p.level); // class power (0.51, balance.js)
      }
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
      if (p.unwishedT > 0 && this.mods.unwished) dmg *= 1 + 0.25 * this.pot('unwished'); // The Unwished Crown, after a Doom avoided
      const im = this.mods;
      // (0.61.5) Immortals that turn a situation into damage
      if (im.unwished && e.def.boss) dmg *= 1 + 0.12 * ((im.pot && im.pot.unwished) || 1); // The Unwished Crown: against bosses
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
      const oath = this.oathOf();
      if (oath) {
        // (0.70) Blood Oath: everything harder, and the subclass's own push
        dmg *= 1 + OATH.dmg;
        if (oath === OATH.none && ['q', 'w', 'e', 'r'].includes(opts.source)) dmg *= oath.mult;
        if (oath === OATH.assassin && opts.source === 'q') dmg *= oath.mult;
        if (oath === OATH.shadowdancer && opts.source === 'w' && this.kit.w && this.kit.w.type === 'kunai') dmg *= oath.kunai;
      }
      if (im.wBurning > 0 && opts.source === 'w' && e.burnT > 0) dmg *= 1 + im.wBurning; // (0.70) Ember Brand
      if (im.oathDmg > 0 && this.frenzyActive(p)) dmg *= 1 + im.oathDmg; // (0.71.2) Oathsworn, Oathblood Signet
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
      const ev = im.eternal; // (0.71) Eternal passives; (0.75.1) all damage, full on a boss, OTHER_SHARE on the rest
      if (ev) {
        const boss = !!e.def.boss;
        const sh = boss ? 1 : OTHER_SHARE;
        const hit = !opts.dot;
        const pid = this.cur.pid;
        if (ev.colossus) dmg *= 1 + ev.colossus * sh;
        if (ev.sunder) {
          const st = (e.sund || (e.sund = {}))[pid] || (e.sund[pid] = { n: 0, t: 0 });
          if (st.t < this.time) st.n = 0; // 8 s since your last hit
          dmg *= 1 + ev.sunder * st.n;
          if (hit) {
            st.n = Math.min(boss ? 30 : 10, st.n + 1);
            st.t = this.time + 8;
          }
        }
        if (ev.focus && hit) {
          if (p.focusId !== e.id) { p.focusId = e.id; p.focusN = 0; }
          dmg *= 1 + ev.focus * (p.focusN || 0);
          p.focusN = Math.min(boss ? 30 : 20, (p.focusN || 0) + 1);
        }
        if (ev.openwound && crit) dmg *= 1 + ev.openwound * sh;
        if (ev.relentless && e.maxHp > 0) dmg *= 1 + ev.relentless * sh * Math.min(10, Math.floor(10 * (1 - Math.max(0, e.hp) / e.maxHp)));
        if (ev.guardbreak && (stunned || e.slowT > 0)) dmg *= 1 + ev.guardbreak * sh;
        if (ev.duelist && !this.enemies.some((o) => o !== e && !o.dead && o.state !== 'spawn' && (!boss || o.def.boss) && dist(o.x, o.z, p.x, p.z) <= 12)) dmg *= 1 + ev.duelist;
        if (ev.deathmark && hit && !(p.markAt > this.time)) {
          dmg *= 1 + ev.deathmark * sh;
          p.markAt = this.time + 8;
          if (boss) this.emit('deathMark', { id: e.id, x: e.x, z: e.z });
        }
        if (ev.titanfall && hit && !(p.titanAt > this.time)) {
          dmg += p.stats.ad * ev.titanfall * sh;
          p.titanAt = this.time + 0.25;
        }
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
      dmg *= 1 + 0.4 * this.pot('stormcaller');
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
    // (0.81.1) the Tide is the keep's heroes' to fight; the god's hand only while incarnate (0.82.6: at full
    // strength). (0.82.4) A visiting friend's blows never land: it is the keeper's night.
    if (e.tide && (!this.tide || !this.inField() || !this.keepOwns())) return;
    if (e.tide) {
      // (0.85) as a mortal: N times your attack lands as N times INCARNATE.atk of the night's strength;
      // (0.92) the Seraph as the Night its level matches
      const k = this.player.keep;
      dmg = (dmg / Math.max(1, this.player.stats.ad)) * (this.player.possess ? STATUE.atk * statuePower(k && k.statue ? k.statue.lvl : 1) : INCARNATE.atk * (this.tide.night || 1));
      if (e.veiled) dmg *= 1 - FOES.veilbearer.veil.cut; // (0.84)
    }
    if (e.markT > 0 && e.markPid === this.cur.pid && opts.source !== 'mark') e.markAcc += Math.min(dmg, Math.max(0, e.hp));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.hitAt = this.time; // (0.74) a boss being fought keeps its patience
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
      // (0.71.5) Under an Oath (Crimson or Blood): no cap and no budget, 25 times over, up to 49% health.
      const oath = this.oathLeech(p);
      let ls = (oath ? Math.max(p.stats.lifesteal, OATH.leechFloor) : Math.min(p.stats.lifesteal, CONFIG.LIFESTEAL_CAP)) + (p.bloodied ? this.mods.bloodLeech : 0);
      if (!opts.basic) ls *= CONFIG.ABILITY_LIFESTEAL;
      if (oath) ls *= OATH.leech;
      let heal = (dmg * ls) / 100;
      if (oath) heal = Math.min(heal, Math.max(0, p.stats.maxHp * OATH.hpCap - p.hp));
      else {
        // The budget (0.32): no more than LIFESTEAL_RATE of max health a second.
        heal = Math.min(heal, p.lsPool || 0);
        p.lsPool = Math.max(0, (p.lsPool || 0) - heal);
        // Blood Rage: while Bloodied, lifesteal stops just below half health, so it keeps you Bloodied.
        if (this.mods.bloodCap && p.bloodied) heal = Math.min(heal, Math.max(0, p.stats.maxHp * 0.495 - p.hp));
      }
      if (heal > 0) this.healPlayer(heal, false);
    }
    this.emit('damage', { who: 'enemy', id: e.id, x: e.x, z: e.z, amount: dmg, crit, stunned, far, basic: !!opts.basic, dot: !!opts.dot });
    if (!opts.dot && dmg > 0 && e.hp > 0) {
      // (0.70) borrowed: blows that set burns or Hoarfrost (a moment apart on each enemy), Cleave's burns, a Blood Oath's leech
      const bm = this.mods;
      if (bm.hitBurn > 0 && !(e.hitBurnT > this.time)) { e.hitBurnT = this.time + 0.4; this.addBurn(e, bm.hitBurn); }
      if (bm.hitFrost > 0 && !(e.hitFrostT > this.time) && !e.dead) { e.hitFrostT = this.time + 0.5; this.addFrost(e, bm.hitFrost); }
      if (bm.qBurn > 0 && opts.source === 'q' && this.kit.q && this.kit.q.type !== 'bolt' && !e.dead) this.addBurn(e, bm.qBurn);
      if (bm.wFrost > 0 && opts.source === 'w' && !e.dead && !(e.wFrostT > this.time)) { e.wFrostT = this.time + 0.2; this.addFrost(e, bm.wFrost); } // (0.71.4) Glacier Spin
      if (bm.wBurn > 0 && opts.source === 'w' && !e.dead && !(e.wBurnT > this.time)) { e.wBurnT = this.time + 0.25; this.addBurn(e, bm.wBurn); } // Ember Brand on Whirlwind
      const ol = this.oathOf();
      if (ol && ol.leech && !opts.basic && !p.dead) this.healPlayer(dmg * ol.leech, false);
    }
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
    if (e.tide && this.tide && this.tide.state === 'on') this.tideFoeDown(e); // (0.84)
    if (e.tide && this.tide && p.possess && source !== 'troop') this.statueXp(STATUE.kill(this.tide.level || 1, FOES[e.type]) * (this.tide.level >= this.statueLvl() - 2 ? 1 : STATUE.low)); // (0.92) the Seraph learns from what it fells
    if (this.quietKills && e.tide) return; // (0.86) a raid fought while you were away: no kills of yours
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
    if (m.timekeeper) for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - 0.5 * this.pot('timekeeper'));
    if (m.undying && dist(e.x, e.z, p.x, p.z) <= 8 + e.radius) this.addSurge(0.04 * this.pot('undying'), 10, 6); // Crown of the Undying (0.61.5)
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
      if (!e.tide) this.keepEvent(e.def.boss ? 'boss' : 'kill', { map: this.map.id, type: e.type }); // (0.80) the Wishkeep's pilgrimages
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
      if (e.tide) {
        this.stepTideFoe(e, dt); // (0.81) a Tide's own: for the keep's buildings and heroes
        continue;
      }
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
          let sp = e.def.speed * (e.slowT > 0 ? 1 - e.slow : 1) * (e.swift ? 1.4 : 1) * (e.move || 1);
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
            e.t = atk.recover * (e.tempo || 1);
            e.atkCd = (e.def.atkCd[0] + this.rng() * (e.def.atkCd[1] - e.def.atkCd[0])) * (e.tempo || 1);
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
      if (pr.owner === 'enemy') {
        // (0.71.4) Glacier Spin: a Warrior spinning in ice sends shots back, outward, as their own
        let ring = null; // (0.81.3) and the Rime Halo, round a Rogue and each of their Shadows
        const sh = this.heroes.find((x) => {
          const q = x.player;
          if (q.dead) return false;
          if (q.frostSpinT > 0 && dist(pr.x, pr.z, q.x, q.z) <= (q.frostSpinR || 3.5) + pr.radius) return (ring = { x: q.x, z: q.z });
          if (q.rimeT > 0) return (ring = this.rimeCenters(x).find((c) => dist(pr.x, pr.z, c.x, c.z) <= q.rimeR + pr.radius) || null);
          return false;
        });
        if (sh) {
          const hp = sh.player;
          const oa = dAtan2(pr.z - ring.z, pr.x - ring.x);
          const sp = Math.max(pr.speed || 12, dHypot(pr.vx, pr.vz)) * 1.5;
          pr.vx = dCos(oa) * sp;
          pr.vz = dSin(oa) * sp;
          pr.x += pr.vx * d;
          pr.z += pr.vz * d;
          pr.owner = 'player';
          pr.reflected = true;
          pr.walled = true;
          pr.pid = sh.pid;
          pr.life = 3;
          pr.seek = 0;
          pr.dmg = pr.dmg * 2.5 + hp.stats.ad;
          this.emit('reflect', { x: pr.x, z: pr.z });
          continue;
        }
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
              if (pr.fold) {
                // (0.81.5) the arrows folded into this one (Crosswind's, Hurricane's on the same target) land with
                // it: each kind its own hit, its own crit roll, and its own Tailwind for every arrow in it
                for (const f of pr.fold) if (!e.dead) this.hitEnemy(e, f.dmg, { basic: true, noTail: !f.tails, tails: f.tails || 0, gale: !!f.gust, source: 'basic', critBonus: 0 });
                pr.fold = null;
              }
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
    if (this.ring && w.n >= RING.granted.from) {
      // (0.66) from wave 50 the Granted come to the Ring too (never in place of a boss)
      const g = this.streamRng('granted', w.n);
      w.queue = w.queue.map((t) => (!(ENEMIES[t] && ENEMIES[t].boss) && g() < RING.granted.share ? RING.granted.types[Math.floor(g() * RING.granted.types.length)] : t));
    }
    if (this.ring && (w.n === 25 || w.n === RING.granted.from || (w.n > 25 && w.n === w.startN))) this.emit('ringDeep', { n: w.n, ember: RING.ember(w.n), animus: RING.animus(w.n) });
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
      if (this.ring && !this.ring.caught) this.ringCatchUp();
      if (this.offer) return; // the next wave waits for the augment pick
      if (this.ring && this.ring.hold) return; // (0.59) ...and, after a boss, for you to take the spoils home or push on
      w.timer -= dt;
      if (w.timer <= 0) this.startWave();
      return;
    }
    w.spawnT -= dt;
    if (w.queue.length && this.enemies.length < w.maxAlive && w.spawnT <= 0) {
      const e = this.spawnEnemy(w.queue.shift());
      if (this.ring && e) {
        this.setPace(e, RING.pace(w.n), RING.tempo(w.n), RING.move(w.n)); // (0.65) faster from wave 20
        if (RING.ember(w.n)) e.ember = RING.ember(w.n); // (0.66) Ember from wave 25
        if (RING.animus(w.n)) e.animusNeed = RING.animus(w.n); // and Animus from wave 50
      }
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
        this.ringGive(); // (0.65) paid out as each wave falls
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
    if (m.id === KEEP.map && this.tide) {
      const t = this.tide; // (0.80)
      const h = (this.keepBuilds || []).find((b) => b.id === 'hearth');
      const up = (this.troops || []).filter((tr) => !tr.dead).length;
      return { name: m.name, sub: t.state === 'won' ? 'morning · the keep held' : t.state === 'lost' ? 'morning · the Hearth went dark' : `${t.raid ? 'Raid' : 'Tide'}${t.level ? ` · Night ${t.level}` : ''}${t.omen ? ` · ${OMENS[t.omen].name}` : ''} · wave ${t.wave} of ${t.waves || KEEP.tide.waves} · Hearth ${h ? Math.ceil((h.hp / h.max) * 100) : 0}% · ${up} of ${(this.troops || []).length} heroes standing · ${this.player.keep.faith} Faith` };
    }
    if (m.id === KEEP.map && this.player.keep) return { name: m.name, sub: `Tier ${KEEP.tiers[this.player.keep.tier].numeral} · ${this.player.keep.faith.toLocaleString('en-US')} Faith · ${this.player.keep.stone} Wishstone` };
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
    this.player.keepWalk = false; // (0.91) walking over the shoulder ends at the Waygate
    if (this.player.possess) this.possessEnd(false); // (0.92) and the Seraph stays home
    this.clearWishes(); // the Asker's wishes stay in the Starwell (0.40)
    if (this.map && this.mode === 'explore' && !this.trial && !this.instanced()) this.chestMaps[this.map.id] = { chests: this.chests, refill: this.chestRefill || [] };
    if (id !== 'rift' && this.rift) {
      // Leaving an Echo Rift ends it.
      if (this.rift.state !== 'done') this.emit('riftEnd', { tier: this.rift.tier, won: false });
      this.rift = null;
    }
    if (id !== 'delve' && this.delve) this.delve = null; // leaving a delve ends it (0.46)
    const map = (this.map = id === 'rift' && this.rift ? buildRiftMap(this.rift.theme, this.rift.seed) : id === 'delve' && this.delve ? buildDelveRoom(this.delve.route[this.delve.room], this.delve.seed + this.delve.room) : id === KEEP.map ? buildKeepMap(keepStage(this.player.keep)) : buildMap(id)); // (0.82.1) the keep, as grown
    const actor = this.cur;
    const p = this.player;
    this.radius = map.radius;
    if (id === 'town' && !this.travelHook) map.obstacles = map.obstacles.filter((o) => o.kind !== 'npc' || this.npcHere(o.id)); // (0.45) Tomas, after; (0.58.1) on the server, each player's game shows its own
    if (id === KEEP.map) {
      // (0.80) the Wishkeep: begun on the first visit; only the settlers who have come so far
      this.keepStart();
      const here = new Set(settlersAt(this.player.keep ? this.player.keep.tier : 1));
      map.obstacles = map.obstacles.filter((o) => o.kind !== 'npc' || here.has(o.id));
    }
    this.tide = null; // (0.80) a Tide ends when you leave
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
    this.keepOwner = id === KEEP.map && this.cur ? this.cur.pid : null; // (0.82.2) whose keep this copy is (visitors may come)
    this.keepOwnerName = id === KEEP.map && this.cur ? this.cur.name || null : null;
    this.keepTierShown = id === KEEP.map && this.player.keep ? this.player.keep.tier : 1;
    this.keepArrive(); // (0.81) the Wishkeep's heroes and buildings (none anywhere else)
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
      if (q.frenzyOn || q.oathOn) {
        // (0.71.5) a new map turns the Oaths off, offline as online (where you arrive as a new hero)
        q.frenzyOn = q.oathOn = false;
        this.emit('buffEnd', { name: 'Oath' });
      }
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
      this.player.lockT = 0;
      h.will = null;
      this.caelumWarn(map.id);
      this.questEvent('reach', map.id);
    }
    this.use(actor);
  }

  /**
   * (0.70.3) What decides who stands in Haven for this hero: past the Unwish, Tomas laid to rest, Odile
   * gone to the garden. (Not having met Tomas: he stays until you leave, as offline.)
   */
  townKey() {
    const p = this.heroes[0] && this.heroes[0].player;
    if (!p) return '';
    return [this.afterWish(p) ? 1 : 0, p.choices && p.choices.scarf === 'rest' ? 1 : 0, this.as(this.heroes[0], () => this.questState('tobin') === 'done') ? 1 : 0].join('');
  }

  /** A joiner's copy of the world: show a map without spawning anything (the host sends what is on it). */
  loadMapMirror(id) {
    const info = id === KEEP.map ? this.keepMapInfo : null; // (0.82.2) someone else's keep: as theirs has grown
    const map = (this.map = id === KEEP.map ? buildKeepMap(info ? info.stage : keepStage(this.player.keep)) : buildMap(id)); // (0.82.1)
    this.radius = map.radius;
    if (id === 'town') this.townShown = this.townKey();
    if (id === 'town') map.obstacles = map.obstacles.filter((o) => o.kind !== 'npc' || this.npcHere(o.id));
    if (id === KEEP.map) {
      const here = new Set(settlersAt(info ? info.tier : this.player.keep ? this.player.keep.tier : 1)); // (0.81) the settlers who have come, online too
      map.obstacles = map.obstacles.filter((o) => o.kind !== 'npc' || here.has(o.id));
    }
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
  /**
   * (0.82.1) A walking grid for the Wishkeep (one cell a metre), so its heroes and the Unmade go round the
   * halls, cottages, trees and rocks instead of pressing into them. Built once a map.
   */
  navGrid() {
    if (this.nav && this.nav.map === this.map) return this.nav;
    const R = Math.ceil(this.radius), n = 2 * R + 1, pad = 0.6;
    const block = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dHypot(i - R, j - R) > this.radius - 1.2) block[j * n + i] = 1;
    for (const ob of this.obstacles) {
      if (ob.soft) continue;
      const ext = (ob.shape === 'box' ? dHypot(ob.hw, ob.hd) : ob.r) + pad;
      const c = ob.shape === 'box' ? dCos(ob.rot) : 1, sn = ob.shape === 'box' ? dSin(ob.rot) : 0;
      for (let j = Math.max(0, Math.floor(ob.z - ext) + R); j <= Math.min(n - 1, Math.ceil(ob.z + ext) + R); j++) {
        for (let i = Math.max(0, Math.floor(ob.x - ext) + R); i <= Math.min(n - 1, Math.ceil(ob.x + ext) + R); i++) {
          const dx = i - R - ob.x, dz = j - R - ob.z;
          let hit;
          if (ob.shape === 'box') {
            const lx = dx * c + dz * sn, lz = -dx * sn + dz * c;
            hit = Math.abs(lx) < ob.hw + pad && Math.abs(lz) < ob.hd + pad;
          } else hit = dHypot(dx, dz) < ob.r + pad;
          if (hit) block[j * n + i] = 1;
        }
      }
    }
    return (this.nav = { map: this.map, R, n, block });
  }
  navFree(x, z) {
    const N = this.navGrid();
    const i = Math.round(x) + N.R, j = Math.round(z) + N.R;
    return i >= 0 && j >= 0 && i < N.n && j < N.n && !N.block[j * N.n + i];
  }
  /** A straight walk from a to b crosses nothing solid. */
  navClear(ax, az, bx, bz) {
    const d = dHypot(bx - ax, bz - az), steps = Math.ceil(d / 0.5);
    for (let k = 1; k < steps; k++) if (!this.navFree(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps)) return false;
    return true;
  }
  /** A* over the grid (8 ways), smoothed to the fewest straight legs. Null if there is no way. */
  navPath(sx, sz, tx, tz) {
    const N = this.navGrid(), n = N.n, R = N.R;
    const cell = (x, z) => [Math.max(0, Math.min(n - 1, Math.round(x) + R)), Math.max(0, Math.min(n - 1, Math.round(z) + R))];
    let [si, sj] = cell(sx, sz);
    let [ti, tj] = cell(tx, tz);
    const free = (i, j) => i >= 0 && j >= 0 && i < n && j < n && !N.block[j * n + i];
    const nearestFree = (i0, j0) => {
      if (free(i0, j0)) return [i0, j0];
      for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if ((Math.abs(di) === r || Math.abs(dj) === r) && free(i0 + di, j0 + dj)) return [i0 + di, j0 + dj];
      return null;
    };
    const s0 = nearestFree(si, sj), t0 = nearestFree(ti, tj);
    if (!s0 || !t0) return null;
    [si, sj] = s0;
    [ti, tj] = t0;
    const start = sj * n + si, goal = tj * n + ti;
    const g = new Map([[start, 0]]), from = new Map();
    const heap = [[0, 0, start]]; // [f, order, cell]
    let order = 1, found = false, budget = 6000;
    const push = (it) => {
      heap.push(it);
      let c = heap.length - 1;
      while (c > 0) {
        const pa = (c - 1) >> 1;
        if (heap[pa][0] < it[0] || (heap[pa][0] === it[0] && heap[pa][1] < it[1])) break;
        heap[c] = heap[pa];
        c = pa;
      }
      heap[c] = it;
    };
    const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1;
          let m = c;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === c) break;
          [heap[c], heap[m]] = [heap[m], heap[c]];
          c = m;
        }
      }
      return top;
    };
    const h = (i, j) => {
      const dx = Math.abs(i - ti), dz = Math.abs(j - tj);
      return 10 * (dx + dz) - 6 * Math.min(dx, dz);
    };
    while (heap.length && budget-- > 0) {
      const [, , cur] = pop();
      if (cur === goal) {
        found = true;
        break;
      }
      const ci = cur % n, cj = (cur - ci) / n, gc = g.get(cur);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!free(ni, nj) || (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj)))) continue; // no cutting corners
          const nc = nj * n + ni, ng = gc + (di && dj ? 14 : 10);
          if (g.has(nc) && g.get(nc) <= ng) continue;
          g.set(nc, ng);
          from.set(nc, cur);
          push([ng + h(ni, nj), order++, nc]);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== undefined; c = from.get(c)) cells.push([(c % n) - R, ((c - (c % n)) / n) - R]);
    cells.reverse();
    // smooth: from each point, the furthest one still in a straight, clear line
    const pts = [];
    let a = [sx, sz], k = 0;
    while (k < cells.length - 1) {
      let best = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--) if (this.navClear(a[0], a[1], cells[m][0], cells[m][1])) { best = m; break; }
      pts.push({ x: cells[best][0], z: cells[best][1] });
      a = cells[best];
      k = best;
    }
    return pts;
  }
  /**
   * (0.82.1) Walk toward (gx, gz) at `speed`: straight when the way is clear, else along a path round what
   * is in the way (worked out again now and then, or when the goal moves). Sliding along walls as ever.
   */
  navStep(o, gx, gz, speed, dt, rad) {
    o.navT = (o.navT || 0) - dt;
    let wx = gx, wz = gz;
    if (!this.navClear(o.x, o.z, gx, gz)) {
      const stale = !o.navPath || o.navT <= 0 || dHypot((o.navGoal ? o.navGoal.x : 1e9) - gx, (o.navGoal ? o.navGoal.z : 1e9) - gz) > 2;
      if (stale) {
        o.navPath = this.navPath(o.x, o.z, gx, gz) || [];
        o.navGoal = { x: gx, z: gz };
        o.navT = 0.7;
      }
      while (o.navPath.length && dHypot(o.navPath[0].x - o.x, o.navPath[0].z - o.z) < 0.7) o.navPath.shift();
      if (o.navPath.length) {
        wx = o.navPath[0].x;
        wz = o.navPath[0].z;
      }
    } else o.navPath = null;
    const dx = wx - o.x, dz = wz - o.z, d = dHypot(dx, dz) || 0.001;
    const step = Math.min(d, speed * dt);
    o.x += (dx / d) * step;
    o.z += (dz / d) * step;
    this.moveSolid(o, rad);
    return dAtan2(dz, dx);
  }

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
    // (0.74) A boss someone hit in the last 6 seconds is being fought, wherever it has been dragged: its
    // patience holds. (Long fights drifted past 22 m, it lost patience and walked home healing to full.)
    if (boss && this.time - (e.hitAt ?? -99) < 6) {
      if (e.patience < 1) e.patience = Math.min(1, e.patience + dt / 2);
      return;
    }
    if (e.aggro && dh > (boss ? CONFIG.PATIENCE_RANGE_BOSS : CONFIG.PATIENCE_RANGE)) e.patience = Math.max(0, e.patience - dt / (boss ? CONFIG.PATIENCE_TIME_BOSS : CONFIG.PATIENCE_TIME));
    else if (e.patience < 1) e.patience = Math.min(1, e.patience + dt / 2);
  }

  stepLeash(e, d, dt) {
    const p = this.player;
    const dh = dist(e.x, e.z, e.home.x, e.home.z);
    // Patience, like a jungle camp: dragged out past PATIENCE_RANGE it loses patience; back near home it recovers.
    this.drainPatience(e, dh, dt);
    const boss = !!e.def.boss;
    const fought = boss && this.time - (e.hitAt ?? -99) < 6; // (0.74) not leashed while it is being fought
    if (e.aggro && (p.dead || this.inTown(p) || (!fought && dh > (boss ? CONFIG.LEASH_RANGE_BOSS : CONFIG.LEASH_RANGE)) || e.patience <= 0)) {
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
      // heals on the walk home; (0.74) a boss of many bars only back to the top of the bar it is on
      const per = e.bars > 1 ? e.maxHp / e.bars : 0;
      const top = per ? Math.min(e.maxHp, Math.ceil(e.hp / per - 1e-9) * per) : e.maxHp;
      if (e.hp < top) e.hp = Math.min(top, e.hp + e.maxHp * (per ? 0.3 / e.bars : 0.3) * dt);
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
    if (this.tide) this.stepTide(dt); // (0.80)
    else this.stepRaidClock(dt); // (0.86)
    this.stepStatue(dt); // (0.92)
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
      this.stepWill(edt);
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
      this.stepWill(edt); // (0.68) each hero short of the Animus is asked on their own
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
    if (this.tide) {
      // (0.82.2) a night in a keep with visitors: it is the owner's
      const owner = (this.keepOwner != null && this.heroByPid(this.keepOwner)) || lead;
      this.as(owner, () => this.stepTide(dt));
    } else if (this.keepOwner != null && this.heroByPid(this.keepOwner)) this.as(this.heroByPid(this.keepOwner), () => this.stepRaidClock(dt)); // (0.86)
    if (this.keepOwner != null && this.heroByPid(this.keepOwner)) this.as(this.heroByPid(this.keepOwner), () => this.stepStatue(dt)); // (0.92)
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
