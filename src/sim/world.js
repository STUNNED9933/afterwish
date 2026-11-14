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
import { CONFIG } from '../config.js';
import { makeRng } from './rng.js';
import { ABILITIES, ENEMIES, buildWave, enemyScale, expToNext, checkpointFor } from './defs.js';
import { SLOTS, rollItem, starterWeapon, itemScore, sumGearStats, scrapValue, upgradeCost, MAX_PLUS, CACHES, CASTER_CLASSES } from './items.js';
import { CLASSES } from './classes.js';
import { buildMap, MAPS } from './maps.js';
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
import { QUESTS, QUEST_IDS, SIGNS, NPCS, BOSS_LOOT } from './story.js';

const TAU = Math.PI * 2;
const MAPS_START = 'town'; // exploration always begins, and you always wake up, in town
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
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
const HERO_KEYS = ['player', 'cls', 'kit', 'basic', 'mods', 'augments', 'offer', 'rerolls', 'portalT', 'portalArmed', 'portalOn', 'wayT', 'wayArmed', 'respawnT', 'stats', 'bestWave', 'maxCheckpoint', 'parryPreset'];

/** Rarity weights that allow exactly one rarity. */
const RARITY_ONLY = (r) => [0, 0, 0, 0, 0, 0, 0].map((_, i) => (i === r ? 1 : 0));

export class World {
  /**
   * @param {object} opts
   * @param {number} [opts.seed]
   * @param {object} [opts.save]         saved character (see toSave)
   * @param {string} [opts.parryPreset]  key of CONFIG.PARRY_PRESETS
   */
  constructor(opts = {}) {
    this.rng = makeRng(opts.seed ?? (Date.now() & 0xffffffff));
    this.parryPreset = opts.parryPreset || CONFIG.DEFAULT_PARRY_PRESET;
    this.time = 0;
    this.nextId = 1;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
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

    const save = opts.save || null;
    this.questStamp = 0; // goes up whenever quests or signs change, so the UI knows to redraw
    this.bestWave = save?.bestWave ?? 0;
    // The furthest checkpoint ever reached. A run may start there or at any earlier one.
    this.maxCheckpoint = save?.maxCheckpoint ?? save?.checkpoint ?? 1;
    const startWave = Math.max(1, Math.min(opts.startWave ?? this.maxCheckpoint, this.maxCheckpoint));
    this.slowT = 0; // > 0 while a perfect parry is slowing time
    this.delayed = [];
    this.augments = []; // ids of augments taken this run
    this.offer = null; // { choices: [augment ids], boss } while a pick is waiting
    this.rerolls = CONFIG.AUGMENT_REROLLS;
    this.mods = defaultMods();
    this.wave = { n: startWave - 1, phase: 'intermission', timer: CONFIG.FIRST_WAVE_DELAY, queue: [], spawnT: 0, maxAlive: 4, cleared: startWave - 1 };
    this.player = this.makePlayer(save);
    this.stats = { parries: 0, perfects: 0, kills: 0, dodges: 0 };
    this.respawnT = 0;
    this.portalT = this.wayT = 0;
    this.portalArmed = this.wayArmed = false;
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
    const parryPreset = hello.parry;
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
    this.portalT = this.wayT = this.respawnT = 0;
    this.portalArmed = this.wayArmed = false;
    this.portalOn = null;
    this.stats = { parries: 0, perfects: 0, kills: 0, dodges: 0 };
    this.bestWave = save?.bestWave ?? 0;
    this.maxCheckpoint = save?.maxCheckpoint ?? 1;
    this.parryPreset = CONFIG.PARRY_PRESETS[parryPreset] ? parryPreset : CONFIG.DEFAULT_PARRY_PRESET;
    const p = this.makePlayer(save);
    p.id = pid;
    p.gold = Math.max(0, Number(hello.gold) || 0);
    p.tickets = Math.max(0, Number(hello.tickets) || 0);
    // Arrive next to the host.
    const lead = back.player;
    const a = this.rng() * TAU;
    p.x = p.px = lead.x + Math.cos(a) * 2;
    p.z = p.pz = lead.z + Math.sin(a) * 2;
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
    if (!h || h === this.heroes[0]) return;
    this.use(this.heroes[0]);
    this.heroes = this.heroes.filter((x) => x !== h);
    this.loot = this.loot.filter((l) => l.owner !== pid);
    this.projectiles = this.projectiles.filter((pr) => pr.pid !== pid);
    this.zones = this.zones.filter((z) => z.pid !== pid);
    this.shadows = this.shadows.filter((s) => s.pid !== pid);
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
      out.push({ pid: h.pid, name: h.name, cls: h.cls, x: p.x, z: p.z, px: p.px, pz: p.pz, facing: p.facing, dead: !!p.dead, hp: p.hp, maxHp: p.stats.maxHp, level: p.level, moving: !!p.moving });
    }
    return out;
  }

  /** Who this enemy goes for: its current target if still fair game, else the nearest standing hero. */
  targetFor(e) {
    if (e.tauntT > 0) {
      // Taunted (Bulwark's Undertow): it goes for the hero who taunted it.
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
    this.commands.push(cmd);
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
      exp: save?.exp ?? 0,
      hp: 1,
      stats: {},
      equipped: { weapon: null, helm: null, chest: null, boots: null, ring: null },
      bag: [],
      potions: CONFIG.MAX_POTIONS, // every run starts with a full belt
      potionCd: 0,
      moveTarget: null,
      targetId: null,
      autoAcquire: true,
      atkWind: 0, // > 0 while a basic attack is winding up
      attackCd: 0,
      cd: { q: 0, w: 0, e: 0, r: 0 },
      castLock: 0,
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
      signs: Array.isArray(save?.signs) ? save.signs.filter((id) => SIGNS[id]) : [], // signs read so far
      bossKills: Object.assign({}, save?.bossKills), // boss type -> times beaten out in the world
      spec: save?.spec && SPECS[save.spec] && SPECS[save.spec].cls === this.cls ? save.spec : null, // subclass
      talents: migrateTalents(save?.talents), // talent id -> rank
      ranks: Object.assign({ q: 1, w: 1, e: 1, r: 1 }, save?.ranks || {}),
      skillPoints: save?.skillPoints ?? Math.max(0, (save?.level ?? 1) - 1),
      swingCount: 0,
      empowerT: 0, // > 0 while the next ability is empowered (after Shadowstep)
      empowerMult: 1,
      slipT: 0,
      rushT: 0, // > 0 while Tumble's attack speed bonus lasts
      rushAs: 0,
      barrage: null, // Barrage arrows still to come
      undyingUsed: false,
    };
    if (save) {
      for (const slot of SLOTS) p.equipped[slot] = save.equipped?.[slot] || null;
      p.bag = (save.bag || []).slice(0, CONFIG.BAG_SIZE);
    } else {
      p.equipped.weapon = starterWeapon(this.cls);
    }
    this.player = p;
    this.recalcStats();
    p.hp = p.stats.maxHp;
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
    for (const id of this.augments) if (AUGMENTS[id]) AUGMENTS[id].apply(m);
    for (const slot of SLOTS) {
      const it = this.player.equipped[slot];
      if (it && it.effect && it.effect in m) m[it.effect] = true;
    }
    this.mods = m;
  }

  /** Recompute derived stats from level + equipped gear + augments. */
  recalcStats() {
    const p = this.player;
    this.recalcMods();
    const m = this.mods;
    const g = sumGearStats(p.equipped);
    const L = p.level - 1;
    const prevMax = p.stats.maxHp || 0;
    const slip = p.slipT > 0;
    const c = CLASSES[this.cls].stats; // class multipliers on the base numbers
    p.stats = {
      maxHp: Math.round(((220 + 30 * L) * c.hp + g.hp) * (1 + m.hpPct)),
      // `ad` is the hero's power for every damage formula. Spell Power (staves) feeds it for the Mage.
      ad: Math.round(((18 + 3.2 * L) * c.ad + g.ad + (this.cls === 'mage' ? g.sp : 0)) * (1 + m.adPct)),
      armor: Math.round(((8 + 2 * L) * c.armor + g.armor) * (1 + m.armorPct)),
      as: 1.05 * c.as * (1 + 0.015 * L + g.as / 100 + m.asPct + (slip && !CASTER_CLASSES.has(this.cls) ? 0.3 : 0) + (p.rushT > 0 ? p.rushAs : 0) + (p.bloodied ? m.bloodAs : 0)) * m.asMult, // attacks per second
      ms: 6.4 * c.ms * (1 + g.ms / 100 + m.msPct + (slip ? 0.4 : 0)),
      haste: g.haste + m.haste + c.haste,
      crit: g.crit + m.crit + c.crit,
      lifesteal: g.lifesteal + m.lifesteal,
      regen: 1 + 0.1 * p.level,
    };
    if (prevMax && p.stats.maxHp > prevMax) p.hp += p.stats.maxHp - prevMax;
    p.hp = Math.min(p.hp, p.stats.maxHp);
  }

  toSave() {
    const p = this.player;
    const maxCheckpoint = Math.max(this.maxCheckpoint, checkpointFor(this.wave.cleared + 1));
    return {
      v: 2,
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
      tomes: p.tomes,
      ranks: p.ranks,
      skillPoints: p.skillPoints,
      bestWave: this.bestWave,
      maxCheckpoint,
      checkpoint: maxCheckpoint,
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
      this.use(h);
      this.applyCommands(mine);
      this.tagOwned();
    }
    this.use(lead);
  }

  applyCommands(cmds) {
    const p = this.player;
    for (const c of cmds) {
      // Inventory commands work even while dead or between waves.
      if (c.type === 'equip') this.equip(c.index);
      else if (c.type === 'discard') this.discard(c.index);
      else if (c.type === 'scrap') this.scrapNonUpgrades();
      else if (c.type === 'upgrade') this.upgradeItem(c.slot);
      else if (c.type === 'openCache') this.openCache(c.tier);
      else if (c.type === 'buyTome') this.buyTome();
      else if (c.type === 'rankUp') this.rankUp(c.slot);
      else if (c.type === 'augment') this.takeAugment(c.id);
      else if (c.type === 'reroll') this.rerollOffer();
      else if (c.type === 'nextWave') {
        if (this.wave.phase === 'intermission' && !this.offer) this.wave.timer = Math.min(this.wave.timer, 0.05);
      }
      if (p.dead) continue;
      switch (c.type) {
        case 'move': {
          const r = Math.hypot(c.x, c.z);
          const max = this.radius - p.radius;
          const k = r > max ? max / r : 1;
          p.moveTarget = { x: c.x * k, z: c.z * k };
          p.bestLeft = null;
          p.targetId = null;
          p.autoAcquire = false;
          p.atkWind = 0;
          break;
        }
        case 'attack':
          if (this.enemyById(c.id)) {
            p.targetId = c.id;
            p.moveTarget = null;
            p.autoAcquire = true;
          }
          break;
        case 'stop':
          p.moveTarget = null;
          p.targetId = null;
          p.autoAcquire = false;
          p.atkWind = 0;
          break;
        case 'cast':
          this.castAbility(c.slot, c.x, c.z);
          break;
        case 'parry':
          this.tryParry();
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
        case 'respec':
          this.respec();
          break;
        case 'travel':
          // Waygate: jump to a discovered map, arriving at its entrance.
          if (this.mode === 'explore' && MAPS[c.to] && p.visited.includes(c.to)) this.loadMap(c.to, MAPS[c.to].portals[0].to);
          break;
      }
    }
  }

  tryParry() {
    const p = this.player;
    if (p.dash || p.leap) return;
    if (p.parryT > 0) return;
    if (p.parryCd > 0) {
      // Pressed a touch early: remember it and parry the moment the cooldown ends.
      if (p.parryCd <= CONFIG.PARRY_BUFFER) p.parryBuffer = CONFIG.PARRY_BUFFER;
      else this.emit('parryNotReady');
      return;
    }
    p.parryT = this.parry.window * this.mods.parryWindow;
    p.parryAge = 0;
    p.parryCd = this.parry.cooldown;
    p.parryHit = false;
    p.parryBuffer = 0;
    p.atkWind = 0;
    this.emit('parryStart');
  }

  usePotion() {
    const p = this.player;
    if (p.potions <= 0 || p.potionCd > 0 || p.hp >= p.stats.maxHp) return;
    p.potions--;
    p.potionCd = CONFIG.POTION_COOLDOWN;
    this.healPlayer(p.stats.maxHp * CONFIG.POTION_HEAL, true);
    this.emit('potion');
  }

  healPlayer(amount, show) {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    const healed = Math.round(p.hp - before);
    if (show && healed > 0) this.emit('heal', { x: p.x, z: p.z, amount: healed });
  }

  abilityUnlocked(slot) {
    return this.player.level >= this.kit[slot].unlock || (slot === 'r' && this.mods.rUnlock);
  }

  /** Cooldown in seconds after ranks, augments and ability haste. */
  abilityCooldown(slot) {
    const p = this.player;
    return this.kit[slot].cd * this.mods[slot + 'Cd'] * (1 - CONFIG.RANK_COOLDOWN * (p.ranks[slot] - 1)) * (100 / (100 + p.stats.haste));
  }

  abilityDamage(slot) {
    const p = this.player;
    return this.kit[slot].dmg(p.stats, p.level) * this.mods[slot + 'Dmg'] * (1 + CONFIG.RANK_DAMAGE * (p.ranks[slot] - 1));
  }

  /** Damage every enemy in a cone in front of the hero (Cleave and its echo). */
  cleaveHit(dir, range, angle, dmg, slot = 'q', def = null) {
    const p = this.player;
    const m = this.mods;
    let hits = 0;
    const struck = [];
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const de = dist(e.x, e.z, p.x, p.z);
      if (de > range + e.radius) continue;
      const ae = Math.atan2(e.z - p.z, e.x - p.x);
      if (de > e.radius + 0.8 && Math.abs(angDiff(ae, dir)) > angle / 2 + 0.1) continue;
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

  /** A Shadowdancer afterimage (one from Shadowstep, one from Last Rites with Crowd of One). */
  addShadow(src, x, z, facing) {
    const pid = this.cur.pid;
    this.shadows = this.shadows.filter((s) => !(s.pid === pid && s.src === src));
    const dur = this.mods.shadowDur || 5;
    this.shadows.push({ id: this.nextId++, pid, src, x, z, t: dur, dur, facing, cls: this.cls, throwT: 0 });
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
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    pr.life -= dt;
    if (pr.life <= 0 || Math.hypot(pr.x, pr.z) > this.radius + 4) {
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
        this.hitEnemy(e, pr.dmg * pr.shard, { source: 'w' });
      }
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
      this.hitEnemy(e, pr.dmg, { source: 'w' });
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

  /** One heavy single-target hit (Backstab, Last Rites). */
  strike(target, slot, dmg) {
    const p = this.player;
    const def = this.kit[slot];
    const toHero = Math.atan2(p.z - target.z, p.x - target.x);
    // "Exposed" = you are behind it, or it is stunned (a parry sets this up).
    const exposed = target.state === 'stunned' || Math.abs(angDiff(target.facing, toHero)) > 1.9;
    const m = this.mods;
    const bonus = def.behind && exposed ? 1 + def.behind + (m[slot + 'Behind'] || 0) : 1;
    if (m[slot + 'Bleed'] > 0) {
      target.bleedT = 3;
      target.bleedDps = (p.stats.ad * m[slot + 'Bleed']) / 3;
    }
    p.facing = Math.atan2(target.z - p.z, target.x - p.x);
    this.emit('cast', { slot, fx: 'strike', x: target.x, z: target.z, exposed: bonus > 1 });
    if (slot === 'r' && m.rMark > 0) {
      // Second Death: count everything this hero deals it for 3 seconds (this strike included).
      target.markT = 3;
      target.markPid = this.cur.pid;
      target.markAcc = 0;
      target.markPct = m.rMark;
      this.emit('mark', { id: target.id, x: target.x, z: target.z });
    }
    this.hitEnemy(target, dmg * bonus, { source: slot });
    if (slot === 'q' && m.shadowSlash > 0) {
      // Mirrored Cut: each afterimage copies the Backstab on whatever is nearest it.
      for (const s of this.shadows) {
        if (s.pid !== this.cur.pid) continue;
        let best = null, bd = 4;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          const de = dist(e.x, e.z, s.x, s.z) - e.radius;
          if (de < bd) { bd = de; best = e; }
        }
        if (!best) continue;
        s.facing = Math.atan2(best.z - s.z, best.x - s.x);
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

  /** How far basic attacks reach (talents and augments can stretch it). */
  basicRange() {
    return this.basic.range * (1 + (this.mods.rangePct || 0));
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
    if (b.shot) {
      const a = Math.atan2(target.z - p.z, target.x - p.x);
      this.projectiles.push({
        id: this.nextId++, owner: 'player', kind: b.shot, basic: true, targetId: target.id, forceCrit, critBonus,
        x: p.x + Math.cos(a) * 0.7, z: p.z + Math.sin(a) * 0.7, px: p.x, pz: p.z,
        vx: Math.cos(a) * b.speed, vz: Math.sin(a) * b.speed, speed: b.speed,
        radius: 0.3, dmg, parryable: false, reflected: false, life: 1.2, dead: false,
      });
    } else {
      this.hitEnemy(target, dmg, { basic: true, source: 'basic', forceCrit, critBonus });
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
      // Afterimage: E again trades places with the afterimage Shadowstep left.
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
        return;
      }
    }
    if (!def || !this.abilityUnlocked(slot) || p.cd[slot] > 0 || p.dash || p.leap || p.castLock > 0.05) return;
    let a = Math.atan2(z - p.z, x - p.x);
    if (!Number.isFinite(a)) a = p.facing;
    const d = dist(x, z, p.x, p.z);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const range = (def.range || 0) * (m[slot + 'Range'] || 1);
    const radius = (def.radius || 0) * (m[slot + 'Radius'] || 1);

    // Single-target abilities need someone to hit before they go on cooldown.
    let target = null;
    if (def.type === 'strike' || def.type === 'barrage') {
      target = this.enemyNear(x, z, 3.5, range) || this.enemyNear(p.x, p.z, range + 2, range);
      if (!target) {
        this.emit('noTarget', { slot, x: p.x, z: p.z });
        return;
      }
    }

    p.cd[slot] = this.abilityCooldown(slot);
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
    if (p.empowerT > 0 && slot !== 'e') {
      // Shadowstep: the next ability hits harder.
      dmg *= p.empowerMult;
      p.empowerT = 0;
      this.emit('empowered', { slot, x: p.x, z: p.z });
    }
    /** A point toward the cursor, no further than the ability's range, inside the map. */
    const aimPoint = () => {
      const len = Math.min(d, range);
      return this.clampToArena(p.x + cos * len, p.z + sin * len, p.radius);
    };

    switch (def.type) {
      case 'cone': {
        const angle = Math.min(TAU, def.angle * (m[slot + 'Angle'] || 1));
        p.facing = a;
        p.castLock = 0.16;
        this.battleRhythm(slot, this.cleaveHit(a, range, angle, dmg, slot, def));
        if (slot === 'q' && m.qEcho > 0) this.delayed.push({ t: 0.28, kind: 'cleave', dir: a, range, angle, dmg: dmg * m.qEcho });
        this.emit('cast', { slot, fx: 'cone', x: p.x, z: p.z, dir: a, range, angle });
        break;
      }
      case 'nova': {
        const pull = slot === 'w' && m.wPull;
        const bleed = (slot === 'w' ? m.wBleed : 0) || def.bleed || 0;
        const slow = (slot === 'w' ? m.wSlow : 0) || def.slow || 0;
        const knock = def.knockback || 0;
        p.castLock = 0.12;
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
          this.hitEnemy(e, dmg, { source: slot });
          if (slot === 'w' && m.wTaunt > 0 && !e.dead) {
            // Undertow: whatever it hits fights you for a while.
            e.tauntPid = this.cur.pid;
            e.tauntT = m.wTaunt;
          }
          if (m[slot + 'Stun'] > 0 && !e.dead && !heavy) this.stun(e, m[slot + 'Stun']);
          if (e.dead || heavy || !knock) continue;
          if (pull) {
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
        this.emit('cast', { slot, fx: 'nova', x: p.x, z: p.z, radius, pull });
        this.battleRhythm(slot, hits);
        this.warriorStorm(struck);
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
        const end = this.clampToArena(p.x + cos * len, p.z + sin * len, p.radius);
        if (slot === 'e' && m.shadowStep) this.addShadow('e', p.x, p.z, a);
        p.dash = { t: 0, dur: def.duration, sx: p.x, sz: p.z, ex: end.x, ez: end.z, hit: new Set(), dmg, refunded: false, slot, width: def.width || 0, empower: def.empower || null, rush: def.rush || null };
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
          this.hitEnemy(e, dmg, { source: slot });
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
            x: p.x + Math.cos(ba) * 0.8, z: p.z + Math.sin(ba) * 0.8, px: p.x, pz: p.z,
            vx: Math.cos(ba) * def.speed, vz: Math.sin(ba) * def.speed, speed: def.speed,
            radius: 0.5, dmg: dmg * (bolts > 1 ? 0.65 : 1),
            splash: (def.splash || 0) * (m[slot + 'Radius'] || 1), splashMult: slot === 'q' && m.qSplashFull ? 1 : def.splashMult || 0,
            bleed: m[slot + 'Bleed'] || 0,
            parryable: false, reflected: false, life: range / def.speed, dead: false,
          });
        }
        this.emit('cast', { slot, fx: 'bolt', x: p.x, z: p.z, dir: a });
        break;
      }
      case 'kunai': {
        // Starglass Kunai: one from you and one from each of your afterimages, all at the cursor.
        p.facing = a;
        p.castLock = 0.12;
        const group = { hit: new Set() };
        const from = [{ x: p.x, z: p.z, ang: a }];
        for (const s of this.shadows) {
          if (s.pid !== this.cur.pid) continue;
          let sa = Math.atan2(z - s.z, x - s.x);
          if (!Number.isFinite(sa) || dist(x, z, s.x, s.z) < 0.3) sa = a;
          s.facing = sa;
          s.throwT = 0.25;
          from.push({ x: s.x, z: s.z, ang: sa });
        }
        const width = (def.width || 1) * (m[slot + 'Radius'] || 1);
        for (const f of from) {
          const c = Math.cos(f.ang), sn = Math.sin(f.ang);
          this.projectiles.push({
            id: this.nextId++, owner: 'player', kind: 'kunai', slot, pid: this.cur.pid,
            x: f.x + c * 0.6, z: f.z + sn * 0.6, px: f.x, pz: f.z, vx: c * def.speed, vz: sn * def.speed, speed: def.speed,
            radius: width / 2, dmg, group, repeat: def.repeat || 0.6, slow: m[slot + 'Slow'] || 0,
            parryable: false, reflected: false, life: range / def.speed, dead: false,
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
          radius: 0.6, dmg, left: Math.max(0, Math.hypot(end.x - sx, end.z - sz)), next: 0.05, tick: def.tick,
          aura: radius, burst: def.burst * (m[slot + 'Radius'] || 1), shard: def.shard, chill: def.chill,
          slow: def.slow, slowDur: def.slowDur, parryable: false, reflected: false, life: 99, dead: false,
        });
        this.emit('cast', { slot, fx: 'orb', x: p.x, z: p.z, dir: a });
        break;
      }
      case 'barrage': {
        // Arrows leave one after another (see stepPlayer); each is a basic attack.
        p.facing = Math.atan2(target.z - p.z, target.x - p.x);
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
          if (slot === 'r' && m.rShadow) this.addShadow('r', p.x, p.z, Math.atan2(target.z - p.z, target.x - p.x));
          // Jump next to the target, then strike on arrival.
          const ta = Math.atan2(p.z - target.z, p.x - target.x);
          const stand = target.radius + p.radius + 0.4;
          const end = this.clampToArena(target.x + Math.cos(ta) * stand, target.z + Math.sin(ta) * stand, p.radius);
          p.dash = { t: 0, dur: 0.14, sx: p.x, sz: p.z, ex: end.x, ez: end.z, hit: new Set(), dmg: 0, refunded: true, slot, width: 0, strike: { id: target.id, dmg } };
          this.emit('cast', { slot, fx: 'dash', x: p.x, z: p.z, dir: Math.atan2(end.z - p.z, end.x - p.x), ex: end.x, ez: end.z });
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
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius, t: 0, dur: lasts, parryable: false };
        this.telegraphs.push(tele);
        this.zones.push({ x: c.x, z: c.z, radius, left: lasts, dur: lasts, next: 0, tick: def.tick, dmg: dmg / ticks, slow: def.slow || 0, slowDur: def.slowDur || 1, slot, tele });
        p.facing = a;
        p.castLock = 0.16;
        this.emit('cast', { slot, fx: 'zone', x: c.x, z: c.z, radius });
        break;
      }
      case 'meteor': {
        const c = aimPoint();
        const delay = def.delay * (m[slot + 'Delay'] || 1);
        const tele = { id: this.nextId++, kind: 'circle', friendly: true, x: c.x, z: c.z, dir: 0, radius, t: 0, dur: delay, parryable: false };
        this.telegraphs.push(tele);
        this.delayed.push({ t: delay, kind: 'quake', x: c.x, z: c.z, radius, dmg, tele, stun: def.stun || 0, slot, fx: 'skyfall' });
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
          this.hitEnemy(e, zn.dmg, { source: zn.slot });
        }
        this.emit('zoneTick', { x: zn.x, z: zn.z, radius: zn.radius });
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
      if (d.kind === 'cleave') {
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
        if (d.fx === 'skyfall' && !d.echo && this.mods.rAftershock > 0) {
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
    const r = Math.hypot(x, z);
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
    if (p.undyingUsed && p.undyingT > 0) {
      // Crown of the Undying recharges 2 minutes after it saves you.
      p.undyingT -= dt;
      if (p.undyingT <= 0) p.undyingUsed = false;
    }
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.parryCd = Math.max(0, p.parryCd - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);
    p.castLock = Math.max(0, p.castLock - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.empowerT = Math.max(0, p.empowerT - dt);
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * dt);
    // Berserker: Bloodied while below half health (attack speed needs a stat rebuild when it flips).
    const bloodied = !!this.mods.bloodRage && p.hp < p.stats.maxHp * 0.5;
    if (bloodied !== !!p.bloodied) {
      p.bloodied = bloodied;
      this.recalcStats();
      this.emit('bloodied', { on: bloodied, x: p.x, z: p.z });
    }
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
          p.facing = Math.atan2(t.z - p.z, t.x - p.x);
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

    // Lunge (E)
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
        if (ds.rush) {
          p.rushT = ds.rush.time + (this.mods.eRushTime || 0);
          p.rushAs = ds.rush.as + (this.mods.eRush || 0);
          this.recalcStats();
          this.emit('rush', { time: p.rushT });
        }
        if (ds.empower) {
          p.empowerT = ds.empower.time;
          p.empowerMult = ds.empower.mult + (this.mods[ds.slot + 'Empower'] || 0);
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
    if (!target && !p.moveTarget && p.autoAcquire && p.parryT <= 0) {
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
    const speed = p.stats.ms * (parrying ? CONFIG.PARRY_MOVE_MULT : 1);

    if (target) {
      const d = dist(target.x, target.z, p.x, p.z) - target.radius;
      const a = Math.atan2(target.z - p.z, target.x - p.x);
      if (d > this.basicRange()) {
        p.atkWind = 0;
        this.movePlayer(Math.cos(a), Math.sin(a), speed * dt);
        p.facing = turnToward(p.facing, a, 14 * dt);
      } else {
        p.facing = turnToward(p.facing, a, 14 * dt);
        if (!parrying) {
          if (p.atkWind > 0) {
            p.atkWind -= dt;
            if (p.atkWind <= 0) {
              p.atkWind = 0;
              this.basicAttack(target);
            }
          } else if (p.attackCd <= 0) {
            const period = 1 / p.stats.as;
            p.atkWind = period * 0.3;
            p.attackCd = period;
            this.emit('swing', { who: 'player', dir: a, x: p.x, z: p.z, dur: period * 0.3 });
          }
        }
      }
    } else if (p.moveTarget) {
      const dx = p.moveTarget.x - p.x;
      const dz = p.moveTarget.z - p.z;
      const d = Math.hypot(dx, dz);
      const stepLen = speed * dt;
      if (d <= stepLen) {
        p.x = p.moveTarget.x;
        p.z = p.moveTarget.z;
        p.moveTarget = null;
        p.autoAcquire = true;
      } else {
        p.facing = turnToward(p.facing, Math.atan2(dz, dx), 14 * dt);
        this.movePlayer(dx / d, dz / d, stepLen);
      }
    }
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

  hitPlayer(rawDamage, { parryable = true, src = null, proj = null } = {}) {
    const p = this.player;
    const m = this.mods;
    if (p.dead) return 'none';
    if (parryable && this.party && !(p.parryT > 0) && !p.dash && !p.leap) {
      // Shield Wall: a parrying Bulwark standing close catches the hit instead.
      const g = this.heroes.find((h) => h !== this.cur && h.mods.guardRange > 0 && !h.player.dead && h.player.parryT > 0 && dist(h.player.x, h.player.z, p.x, p.z) <= h.mods.guardRange);
      if (g) return this.as(g, () => this.hitPlayer(rawDamage, { parryable, src, proj }));
    }
    rawDamage *= CONFIG.ENEMY_DMG * this.gapScale(src ? src.level : proj ? proj.level : 0).taken;
    if (p.dash || p.leap) {
      if (p.dash && !p.dash.refunded) {
        // Perfect dodge: Lunge carried you through an attack, so most of its cooldown comes back.
        p.dash.refunded = true;
        p.cd[p.dash.slot] = Math.min(p.cd[p.dash.slot], CONFIG.DODGE_REFUND_CD);
        this.stats.dodges++;
        this.emit('perfectDodge', { x: p.x, z: p.z });
        this.triggerSlipstream();
      } else {
        this.emit('dodge', { x: p.x, z: p.z });
      }
      return 'dodged';
    }
    if (p.parryT > 0) {
      if (parryable) {
        const perfect = p.parryAge <= this.parry.perfect;
        p.parryHit = true;
        p.parryT = Math.max(p.parryT, 0.15); // also catches the rest of a multi-hit
        this.stats.parries++;
        if (perfect) {
          this.stats.perfects++;
          this.healPlayer(p.stats.maxHp * (CONFIG.PERFECT_HEAL + m.parryHeal), true);
          if (m.allyParryHeal > 0 && this.party) {
            // Bastion: a perfect parry also heals friends nearby.
            for (const h of this.heroes) {
              if (h === this.cur || h.player.dead || dist(h.player.x, h.player.z, p.x, p.z) > 8) continue;
              this.as(h, (hp) => this.healPlayer(hp.stats.maxHp * m.allyParryHeal, true));
            }
          }
          for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - CONFIG.PERFECT_CD_REFUND);
          this.startSlow();
          this.triggerSlipstream();
        }
        this.emit('parry', { perfect, x: p.x, z: p.z, srcId: src ? src.id : null, projectile: !!proj });
        if (proj) {
          // Send the projectile back where it came from (it now belongs to whoever parried it).
          proj.pid = this.cur.pid;
          proj.owner = 'player';
          proj.reflected = true;
          let a = Math.atan2(-proj.vz, -proj.vx);
          if (src && !src.dead) a = Math.atan2(src.z - proj.z, src.x - proj.x);
          const sp = Math.hypot(proj.vx, proj.vz) * 1.7;
          proj.vx = Math.cos(a) * sp;
          proj.vz = Math.sin(a) * sp;
          proj.dmg = (proj.dmg * 2.5 + p.stats.ad) * m.reflectDmg;
          proj.life = 3;
        } else if (src && !src.dead) {
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
      this.emit('unparryable', { x: p.x, z: p.z });
    }
    const dmg = Math.max(1, Math.round(rawDamage * (100 / (100 + p.stats.armor)) * (1 - m.dmgTaken)));
    p.hp -= dmg;
    p.hurtT = 0.25;
    this.emit('damage', { who: 'player', x: p.x, z: p.z, amount: dmg });
    if (p.hp <= 0) {
      if (m.undying && !p.undyingUsed) {
        p.undyingUsed = true;
        p.undyingT = 120;
        p.hp = Math.round(p.stats.maxHp * 0.35);
        p.cd.e = 0; // and the escape is ready
        this.emit('undying', { x: p.x, z: p.z });
        return 'hit';
      }
      p.hp = 0;
      p.dead = true;
      p.parryT = 0;
      if (this.mode === 'explore') {
        // Out in the wilds you are only knocked out: you wake up in town (in a party, at the map's entrance).
        this.respawnT = CONFIG.EXPLORE_RESPAWN_DELAY * (this.party ? 2 : 1);
        this.emit('playerDown', { x: p.x, z: p.z });
        return 'hit';
      }
      this.gameOver = true;
      this.telegraphs = [];
      this.delayed = [];
      this.emit('playerDeath', { wave: this.wave.n });
    }
    return 'hit';
  }

  // =========================================================================
  // Progression: EXP, loot, inventory
  // =========================================================================
  gainExp(amount) {
    const p = this.player;
    if (p.level >= CONFIG.MAX_LEVEL) return;
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

  dropLoot(e) {
    const def = e.def;
    const hoard = this.mode === 'explore' && def.boss ? BOSS_LOOT[e.type] : null; // world bosses drop a pile
    const count = hoard ? hoard.items : def.boss ? 2 : this.rng() < def.drop ? 1 : 0;
    const ilvl = Math.max(1, Math.round(e.level || this.wave.n));
    for (let i = 0; i < count; i++) {
      let opts = { minRarity: def.boss ? 2 : 0, cls: this.cls };
      if (hoard) {
        // The first item is the prize: guaranteed top rarity on your first kill, good odds after.
        if (i === 0) opts = e.firstKill ? { minRarity: hoard.first, weights: RARITY_ONLY(hoard.first), cls: this.cls } : { weights: hoard.top, cls: this.cls };
        else opts = { minRarity: hoard.min + (i <= hoard.better ? 1 : 0), cls: this.cls };
      }
      const item = rollItem(this.rng, ilvl, opts);
      const a = this.rng() * TAU;
      const c = this.clampToArena(e.x + Math.cos(a) * (0.8 + i), e.z + Math.sin(a) * (0.8 + i), 1);
      const drop = { id: this.nextId++, x: c.x, z: c.z, item, age: 0, magnet: false, owner: this.cur.pid }; // in a party, only its owner sees and takes it
      this.loot.push(drop);
      this.emit('lootDrop', { id: drop.id, x: c.x, z: c.z, rarity: item.rarity });
    }
  }

  /** A boss beaten out in the world: keys, tickets, a pile of gold, and (in dropLoot) a pile of gear. */
  bossRewards(e) {
    const p = this.player;
    const loot = BOSS_LOOT[e.type];
    if (!loot) return;
    const first = !p.bossKills[e.type];
    e.firstKill = first;
    p.bossKills[e.type] = (p.bossKills[e.type] || 0) + 1;
    p.keys += loot.keys;
    p.tickets += loot.tickets;
    if (first) p.skillPoints += 2;
    this.emit('bossFall', { boss: e.type, name: e.def.name, first, keys: loot.keys, tickets: loot.tickets, gold: e.goldValue, items: loot.items, x: e.x, z: e.z });
  }

  // =========================================================================
  // Quests, signs and people (the data is in sim/story.js)
  // =========================================================================
  /** null (never taken) | 'active' | 'ready' (go and hand it in) | 'done' */
  questState(id) {
    return this.player.quests[id] ? this.player.quests[id].s : null;
  }

  /** Can this quest be taken right now? */
  questOpen(id) {
    const q = QUESTS[id];
    const st = this.questState(id);
    if (!q || (st && !(q.repeat && st === 'done'))) return false;
    if (q.after && this.questState(q.after) !== 'done') return false;
    return this.player.level >= q.level - 4;
  }

  /** How many of the quest's goal are needed, and how to say what it is. */
  questNeed(q) {
    return q.goal.kill || q.goal.read || 1;
  }

  acceptQuest(id) {
    if (!this.questOpen(id)) return;
    const q = QUESTS[id];
    const p = this.player;
    const st = (p.quests[id] = { s: 'active', n: 0 });
    // Some goals may already be met: a map you have been to, signs you have read.
    if (q.goal.reach && p.visited.includes(q.goal.reach)) st.n = 1;
    if (q.goal.read) st.n = Math.min(q.goal.read, p.signs.length);
    if (q.goal.wave && this.bestWave >= q.goal.wave) st.n = 1;
    if (st.n >= this.questNeed(q)) st.s = 'ready';
    this.questStamp++;
    this.emit('quest', { id, what: 'accepted', name: q.name, state: st.s });
  }

  /** Something happened that quests might care about: 'kill' (an enemy), 'reach' (a map id), 'read'. */
  questEvent(kind, data) {
    const p = this.player;
    for (const id in p.quests) {
      const st = p.quests[id];
      const q = QUESTS[id];
      if (!q || st.s !== 'active') continue;
      const g = q.goal;
      let hit = false;
      if (kind === 'kill' && g.kill) {
        hit = (!g.enemy || g.enemy === data.type) && (!g.boss || g.boss === data.type) && (!g.map || (this.map && this.map.id === g.map));
        if (g.boss && this.mode !== 'explore') hit = false; // the story's bosses are the ones out in the world
        if (hit) st.n++;
      } else if (kind === 'reach' && g.reach === data) {
        hit = true;
        st.n = 1;
      } else if (kind === 'wave' && g.wave && data >= g.wave) {
        hit = true;
        st.n = 1;
      } else if (kind === 'read' && g.read) {
        hit = true;
        st.n = Math.min(g.read, p.signs.length);
      }
      if (!hit) continue;
      const need = this.questNeed(q);
      if (st.n >= need) st.s = 'ready';
      this.questStamp++;
      this.emit('quest', { id, what: st.s === 'ready' ? 'ready' : 'progress', name: q.name, n: st.n, need, giver: NPCS[q.giver].name });
    }
  }

  /** What a quest pays, with the numbers worked out for its level. */
  questReward(id) {
    const q = QUESTS[id];
    const r = q.reward || {};
    const scale = 1 + 0.12 * (q.level - 1);
    return {
      exp: r.exp ? Math.round(expToNext(Math.min(q.level, CONFIG.MAX_LEVEL - 1)) * r.exp) : 0,
      gold: r.gold ? Math.round((r.gold * scale) / 5) * 5 : 0,
      scrap: r.scrap ? Math.round(r.scrap * scale) : 0,
      keys: r.keys || 0, tickets: r.tickets || 0, skill: r.skill || 0,
      item: r.item ?? null, slot: r.slot || null,
    };
  }

  claimQuest(id) {
    const p = this.player;
    const q = QUESTS[id];
    if (!q || this.questState(id) !== 'ready') return;
    const r = this.questReward(id);
    p.quests[id] = { s: 'done', n: this.questNeed(q) };
    p.gold += r.gold;
    p.scrap += r.scrap;
    p.keys += r.keys;
    p.tickets += r.tickets;
    p.skillPoints += r.skill;
    let item = null;
    if (r.item !== null) {
      // Gear of your own level (within reason), so a quest handed in late is still worth having.
      const ilvl = Math.max(q.level, Math.min(p.level, q.level + 12));
      item = rollItem(this.rng, ilvl, { minRarity: r.item, weights: RARITY_ONLY(r.item), slot: r.slot, cls: this.cls });
      this.giveItem(item);
    }
    this.questStamp++;
    this.emit('quest', { id, what: 'claimed', name: q.name, reward: r, item });
    this.gainExp(r.exp);
  }

  /** Hand the hero an item directly: wear it if the slot is empty, else bag it, else drop it at their feet. */
  giveItem(item) {
    const p = this.player;
    if (!p.equipped[item.slot]) {
      p.equipped[item.slot] = item;
      this.recalcStats();
    } else if (p.bag.length < CONFIG.BAG_SIZE) p.bag.push(item);
    else this.loot.push({ id: this.nextId++, x: p.x, z: p.z, item, age: 0, magnet: false });
  }

  /** The person or sign close enough to interact with, or null. */
  interactable() {
    if (this.mode !== 'explore' || !this.map || this.player.dead) return null;
    const p = this.player;
    let best = null, bd = 1e9;
    for (const ob of this.obstacles) {
      if (ob.kind !== 'npc' && ob.kind !== 'sign') continue;
      const d = dist(p.x, p.z, ob.x, ob.z) - ob.r;
      if (d < CONFIG.INTERACT_RANGE && d < bd) { best = ob; bd = d; }
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
    this.questEvent('read');
  }

  /**
   * The marker over a person's head: 'ready' (a quest to hand in, shown as a book),
   * 'available' (a quest to take, '!'), 'progress' (one of theirs you are still on, '?'),
   * or '' for nothing. The most useful one wins.
   */
  npcMarker(npcId) {
    let mark = '';
    for (const id of QUEST_IDS) {
      if (QUESTS[id].giver !== npcId) continue;
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

  learnTalent(id) {
    if (this.talentBlock(id)) return;
    const p = this.player;
    p.talents[id] = (p.talents[id] || 0) + 1;
    this.recalcStats();
    this.emit('talent', { id, rank: p.talents[id] });
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

  stepLoot(dt) {
    const p = this.player;
    if (p.dead) return;
    for (const l of this.loot) {
      if (l.owner !== undefined && l.owner !== this.cur.pid) continue;
      l.age += dt;
      const d = dist(l.x, l.z, p.x, p.z);
      if (l.magnet && d > 0.01) {
        const sp = Math.min(d, 26 * dt);
        l.x += ((p.x - l.x) / d) * sp;
        l.z += ((p.z - l.z) / d) * sp;
      }
      if (d < 1.5 && l.age > 0.35) {
        if (p.bag.length >= CONFIG.BAG_SIZE && p.equipped[l.item.slot]) {
          if (!l.warned) {
            l.warned = true;
            this.emit('bagFull');
          }
          l.magnet = false;
          continue;
        }
        l.taken = true;
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

  equip(index) {
    const p = this.player;
    const item = p.bag[index];
    if (!item) return;
    if (item.cls && item.cls !== this.cls) {
      this.emit('cantEquip', { item }); // another class's weapon
      return;
    }
    const old = p.equipped[item.slot];
    p.equipped[item.slot] = item;
    if (old) p.bag[index] = old;
    else p.bag.splice(index, 1);
    this.recalcStats();
    this.emit('equip', { item });
  }

  /** Break one bag item down into scrap. */
  discard(index) {
    const p = this.player;
    const item = p.bag[index];
    if (!item) return;
    p.bag.splice(index, 1);
    const scrap = scrapValue(item);
    p.scrap += scrap;
    this.emit('discard', { count: 1, scrap });
  }

  /** Scrap every bag item that scores lower than what is equipped in its slot. */
  scrapNonUpgrades() {
    const p = this.player;
    let scrap = 0;
    let count = 0;
    p.bag = p.bag.filter((it) => {
      if (itemScore(it) > itemScore(p.equipped[it.slot])) return true;
      scrap += scrapValue(it);
      count++;
      return false;
    });
    if (count) {
      p.scrap += scrap;
      this.emit('discard', { count, scrap });
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
    if (p.bag.length >= CONFIG.BAG_SIZE) {
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
    const pool = AUGMENT_IDS.filter((id) => {
      const a = AUGMENTS[id];
      if (this.augments.includes(id) || exclude.includes(id)) return false;
      if (a.cls && a.cls !== this.cls) return false; // another class's augment
      return a.slot === 'parry' || a.slot === 'hero' || id === 'r_early' || this.abilityUnlocked(a.slot);
    });
    const t1 = pool.filter((id) => AUGMENTS[id].tier === 1);
    const t2 = pool.filter((id) => AUGMENTS[id].tier === 2);
    const choices = [];
    for (let i = 0; i < 3; i++) {
      const strong = boss || this.rng() < 0.12;
      const src = strong && t2.length ? t2 : t1.length ? t1 : t2;
      if (!src.length) break;
      choices.push(src.splice(Math.floor(this.rng() * src.length), 1)[0]);
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
    if (!at) {
      // Arena: later waves hit harder and last longer whatever the level, and pay less EXP.
      scale.hp *= 1 + CONFIG.ARENA_WAVE_HP * (this.wave.n - 1);
      scale.dmg *= 1 + CONFIG.ARENA_WAVE_DMG * (this.wave.n - 1);
      scale.exp *= CONFIG.ARENA_EXP;
    }
    // Pick a point near the arena edge that is not right on top of the player.
    let x = 0;
    let z = 0;
    for (let i = 0; i < 12; i++) {
      const a = this.rng() * TAU;
      const r = this.radius - 2.5 - this.rng() * 3;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (dist(x, z, p.x, p.z) > 10) break;
    }
    if (at) {
      const a = this.rng() * TAU;
      const r = 1.5 + this.rng() * 4.5;
      x = at.x + Math.cos(a) * r;
      z = at.z + Math.sin(a) * r;
    }
    const e = {
      id: this.nextId++,
      type,
      def,
      x,
      z,
      px: x,
      pz: z,
      facing: Math.atan2(p.z - z, p.x - x),
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
      vulnT: 0, // Sunder: takes `vuln` more damage while > 0
      vuln: 0,
      bleedT: 0,
      bleedDps: 0,
      bleedAcc: 0,
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
    if (!def.boss) {
      const atk = def.attacks[0];
      return d <= atk.trigger ? atk : null;
    }
    const A = def.attackByName;
    if (d <= A.combo1.trigger) {
      const comboChance = e.lastAtk === 'slam' ? 0.92 : 0.62;
      return this.rng() < comboChance ? A.combo1 : A.slam;
    }
    if (e.farT > 1.1) {
      e.farT = 0;
      return A.fan;
    }
    return null;
  }

  startWindup(e, atk, isChain) {
    const p = this.player;
    e.state = 'windup';
    e.atk = atk;
    e.t = 0;
    e.dur = atk.windup * (e.enraged ? 0.82 : 1);
    e.chaseT = 0;
    e.aim = Math.atan2(p.z - e.z, p.x - e.x);
    e.facing = e.aim;
    e.moving = false;
    if (!isChain) this.lastWindupAt = this.time;
    const tele = { id: this.nextId++, owner: e.id, kind: atk.shape, x: e.x, z: e.z, dir: e.aim, t: 0, dur: e.dur, parryable: atk.parryable, cue: false };
    if (atk.shape === 'arc') {
      tele.range = atk.range;
      tele.angle = atk.angle;
    } else if (atk.shape === 'circle') {
      tele.radius = atk.radius;
      tele.offset = atk.offset;
    } else if (atk.shape === 'rect') {
      tele.length = atk.length;
      tele.width = atk.width;
    } else if (atk.shape === 'shot') {
      if (atk.count > 1) {
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

  positionTelegraph(e, tele) {
    const off = tele.offset || 0;
    tele.x = e.x + Math.cos(e.aim) * off;
    tele.z = e.z + Math.sin(e.aim) * off;
    tele.dir = e.aim;
  }

  removeTelegraph(e) {
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
      const ap = Math.atan2(p.z - e.z, p.x - e.x);
      hit = d <= atk.range + p.radius * 0.5 && (d < e.radius + p.radius || Math.abs(angDiff(ap, a)) <= atk.angle / 2 + 0.15);
      this.emit('strike', { id: e.id, shape: 'arc', x: e.x, z: e.z, dir: a, range: atk.range, angle: atk.angle, parryable: atk.parryable });
    } else if (atk.shape === 'circle') {
      const cx = e.x + Math.cos(a) * atk.offset;
      const cz = e.z + Math.sin(a) * atk.offset;
      hit = dist(p.x, p.z, cx, cz) <= atk.radius + p.radius * 0.4;
      this.emit('strike', { id: e.id, shape: 'circle', x: cx, z: cz, radius: atk.radius, parryable: atk.parryable });
    } else if (atk.shape === 'rect') {
      e.state = 'charge';
      e.t = 0;
      e.dur = atk.chargeDur;
      e.chargeHit = false;
      this.emit('strike', { id: e.id, shape: 'rect', x: e.x, z: e.z, dir: a, parryable: false });
      return;
    } else if (atk.shape === 'shot') {
      for (let i = 0; i < atk.count; i++) {
        const off = atk.count > 1 ? (i / (atk.count - 1) - 0.5) * atk.spread : 0;
        const pa = a + off;
        this.projectiles.push({
          id: this.nextId++,
          owner: 'enemy',
          srcId: e.id,
          x: e.x + Math.cos(pa) * (e.radius + 0.3),
          z: e.z + Math.sin(pa) * (e.radius + 0.3),
          px: e.x,
          pz: e.z,
          vx: Math.cos(pa) * atk.speed,
          vz: Math.sin(pa) * atk.speed,
          radius: 0.35,
          dmg: atk.dmg * e.dmgMult,
          level: e.level,
          parryable: atk.parryable,
          reflected: false,
          life: 3,
          dead: false,
        });
      }
      this.emit('strike', { id: e.id, shape: 'shot', x: e.x, z: e.z, dir: a, parryable: atk.parryable });
    }

    if (hit) this.hitPlayer(atk.dmg * e.dmgMult, { parryable: atk.parryable, src: e });
    if (this.party && (atk.shape === 'arc' || atk.shape === 'circle')) {
      // Anyone else standing in it is hit too (and can parry it too).
      const target = this.cur;
      for (const h of this.heroes) {
        if (h === target || h.player.dead || e.dead || e.state === 'stunned') continue;
        const q = h.player;
        let also;
        if (atk.shape === 'arc') {
          const d = dist(q.x, q.z, e.x, e.z);
          also = d <= atk.range + q.radius * 0.5 && (d < e.radius + q.radius || Math.abs(angDiff(Math.atan2(q.z - e.z, q.x - e.x), a)) <= atk.angle / 2 + 0.15);
        } else also = dist(q.x, q.z, e.x + Math.cos(a) * atk.offset, e.z + Math.sin(a) * atk.offset) <= atk.radius + q.radius * 0.4;
        if (also) this.as(h, () => this.hitPlayer(atk.dmg * e.dmgMult, { parryable: atk.parryable, src: e }));
      }
    }
    if (e.dead || e.state === 'stunned') return; // its guard was broken by the parry

    e.lastAtk = atk.name;
    if (atk.chain) {
      this.startWindup(e, e.def.attackByName[atk.chain], true);
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
    if (e.posture >= e.def.poise) this.stun(e, e.def.parryStun * (perfect ? 1.25 : 1));
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
    const p = this.player;
    let dmg = base;
    let crit = false;
    const chance = p.stats.crit + (opts.critBonus || 0);
    if (opts.canCrit !== false && (opts.forceCrit || this.rng() < chance / 100)) {
      dmg *= this.critMultiplier(opts.critBonus || 0);
      crit = true;
    }
    const stunned = e.state === 'stunned';
    if (!opts.raw) {
      // (raw: already-final damage, like Second Death going off, is not scaled again)
      dmg *= this.gapScale(e.level).dealt;
      if (this.mods.lowHpDmg > 0 && p.hp < p.stats.maxHp * 0.5) dmg *= 1 + this.mods.lowHpDmg;
      if (stunned) dmg *= CONFIG.STUN_DAMAGE_BONUS;
      if (e.vulnT > 0) dmg *= 1 + e.vuln;
    }
    if (crit && this.mods.stormcaller && this.cls === 'rogue' && (opts.source === 'q' || opts.source === 'w' || opts.source === 'r')) {
      // Nightfang: ability crits cut deeper and bring Shadowstep back sooner.
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
    if (e.markT > 0 && e.markPid === this.cur.pid && opts.source !== 'mark') e.markAcc += Math.min(dmg, Math.max(0, e.hp));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (e.home && !e.aggro && dist(e.x, e.z, e.home.x, e.home.z) < CONFIG.LEASH_RANGE) {
      e.aggro = true; // hitting a camp enemy wakes it up
      e.returning = false;
    }
    if (!p.dead && !opts.dot) {
      // Lifesteal: full from basic attacks, a third from abilities, capped (see CONFIG).
      let ls = Math.min(p.stats.lifesteal, CONFIG.LIFESTEAL_CAP) + (p.bloodied ? this.mods.bloodLeech : 0);
      if (!opts.basic) ls *= CONFIG.ABILITY_LIFESTEAL;
      if (ls > 0) this.healPlayer((dmg * ls) / 100, false);
    }
    this.emit('damage', { who: 'enemy', id: e.id, x: e.x, z: e.z, amount: dmg, crit, stunned, basic: !!opts.basic, dot: !!opts.dot });
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
    this.removeTelegraph(e);
    this.stats.kills++;
    if (this.mode === 'explore') {
      for (const camp of this.camps) {
        for (const slot of camp.slots) {
          if (slot.id === e.id) {
            slot.id = null;
            slot.timer = slot.respawn;
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
    if (m.timekeeper) for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - 0.5);
    this.emit('death', { id: e.id, enemyType: e.type, x: e.x, z: e.z, boss: !!e.def.boss });
    // Everyone in the party who is up and close by gets the rewards: their own gold,
    // their own loot roll, quest credit and a share of the EXP.
    const killer = this.cur;
    const share = this.party ? this.heroes.filter((h) => h === killer || (!h.player.dead && dist(h.player.x, h.player.z, e.x, e.z) < CONFIG.PARTY_SHARE_RANGE)) : [killer];
    for (const h of share) {
      this.use(h);
      this.killRewards(e, share.length);
    }
    this.use(killer);
    for (const h of this.heroes) if (h.player.targetId === e.id) h.player.targetId = null;
  }

  /** What the acting hero gets for a kill. */
  killRewards(e, partySize) {
    const p = this.player;
    p.gold += e.goldValue;
    if (this.mode === 'explore' && (e.def.heavy || this.rng() < CONFIG.TICKET_CHANCE)) {
      p.tickets++;
      this.emit('ticket', { x: e.x, z: e.z });
    }
    if (e.def.boss) {
      if (this.mode === 'arena') {
        p.keys++;
        p.skillPoints++; // bosses out in the world can be farmed, so they pay in loot instead
        this.emit('bossReward');
      } else this.bossRewards(e);
    }
    this.gainExp(e.expValue * (partySize > 1 ? CONFIG.PARTY_EXP : 1));
    this.dropLoot(e);
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
      if (e.vulnT > 0) e.vulnT -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.tauntT > 0) e.tauntT -= dt;
      if (e.markT > 0) {
        e.markT -= dt;
        if (e.markT <= 0) {
          this.popMark(e);
          if (e.dead) continue;
        }
      }
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
        const f = Math.exp(-9 * dt);
        e.kx *= f;
        e.kz *= f;
        if (Math.abs(e.kx) + Math.abs(e.kz) < 0.2) e.kx = e.kz = 0;
      }
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const toPlayer = Math.atan2(dz, dx);

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
          if (e.def.boss) e.farT = d > 5.5 ? e.farT + dt : 0;
          if (e.atkCd <= 0) {
            const atk = this.chooseAttack(e, d);
            if (atk && this.canStartAttack(e)) {
              this.startWindup(e, atk, false);
              break;
            }
          }
          let mx = 0;
          let mz = 0;
          let sp = e.def.speed * (e.slowT > 0 ? 1 - e.slow : 1);
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
          e.x += Math.cos(e.aim) * sp * dt;
          e.z += Math.sin(e.aim) * sp * dt;
          e.moving = true;
          if (!e.chargeHit && d < e.radius + p.radius + 0.45) {
            e.chargeHit = true;
            this.hitPlayer(atk.dmg * e.dmgMult, { parryable: false, src: e });
          }
          const edge = Math.hypot(e.x, e.z) > this.radius - e.radius;
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
        const d = Math.hypot(dx, dz) || 0.001;
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
        const d = Math.hypot(dx, dz) || 0.001;
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
          const a = Math.atan2(t.z - pr.z, t.x - pr.x);
          pr.vx = Math.cos(a) * pr.speed;
          pr.vz = Math.sin(a) * pr.speed;
        }
      }
      pr.px = pr.x;
      pr.pz = pr.z;
      pr.x += pr.vx * d;
      pr.z += pr.vz * d;
      pr.life -= d;
      if (pr.life <= 0 || Math.hypot(pr.x, pr.z) > this.radius + 4) {
        pr.dead = true;
        continue;
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
          else pr.dead = true;
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn') continue;
          if (dist(pr.x, pr.z, e.x, e.z) < pr.radius + e.radius) {
            pr.dead = true;
            if (pr.kind) {
              // The hero's own shot: an arrow, a spark or a fire bolt.
              if (pr.bleed > 0) {
                e.bleedT = 3;
                e.bleedDps = (p.stats.ad * pr.bleed) / 3;
              }
              this.hitEnemy(e, pr.dmg, { basic: !!pr.basic, source: pr.basic ? 'basic' : pr.slot, forceCrit: pr.forceCrit, critBonus: pr.critBonus || 0 });
              if (pr.splash) {
                for (const o of this.enemies) {
                  if (o === e || o.dead || o.state === 'spawn') continue;
                  if (dist(o.x, o.z, pr.x, pr.z) <= pr.splash + o.radius) this.hitEnemy(o, pr.dmg * pr.splashMult, { source: pr.slot });
                }
                this.emit('burst', { x: pr.x, z: pr.z, radius: pr.splash });
              }
            } else {
              // An enemy projectile you parried back.
              this.hitEnemy(e, pr.dmg, { canCrit: false });
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
    w.queue = buildWave(w.n, this.rng);
    w.total = w.queue.length;
    w.phase = 'active';
    w.spawnT = 0;
    w.maxAlive = Math.min(9, 4 + Math.floor(w.n / 3));
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
      w.timer -= dt;
      if (w.timer <= 0) this.startWave();
      return;
    }
    w.spawnT -= dt;
    if (w.queue.length && this.enemies.length < w.maxAlive && w.spawnT <= 0) {
      this.spawnEnemy(w.queue.shift());
      w.spawnT = 0.55;
    }
    if (!w.queue.length && this.enemies.length === 0) {
      w.cleared = w.n;
      w.phase = 'intermission';
      w.timer = CONFIG.INTERMISSION;
      this.bestWave = Math.max(this.bestWave, w.n);
      this.projectiles = [];
      this.healPlayer(p.stats.maxHp * CONFIG.WAVE_CLEAR_HEAL, true);
      p.potions = Math.min(CONFIG.MAX_POTIONS, p.potions + 1);
      for (const l of this.loot) l.magnet = true;
      const boss = w.n % CONFIG.BOSS_EVERY === 0;
      const gold = 10 + 4 * w.n + (boss ? 80 : 0);
      p.gold += gold;
      this.emit('waveClear', { n: w.n, boss, gold });
      this.questEvent('wave', w.n);
      // Augments: a pick after every odd wave, and a stronger one after every boss.
      if (w.n % 2 === 1 || boss) this.makeOffer(boss);
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
    if (this.portalOn && this.portalArmed) return { name: m.name, sub: `travelling to ${this.portalOn.name}…` };
    if (m.safe) return { name: m.name, sub: 'safe · you heal here' };
    return { name: m.name, sub: m.level === m.levelMax ? `enemy level ${m.level}` : `enemy levels ${m.level} to ${m.levelMax}` };
  }

  /**
   * Switch to another exploration map. `from` is the map you came from, so you
   * arrive at the portal that leads back to it (or in the middle if there is none).
   */
  loadMap(id, from = null) {
    const map = (this.map = buildMap(id));
    const actor = this.cur;
    const p = this.player;
    this.radius = map.radius;
    this.obstacles = map.obstacles;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.telegraphs = [];
    this.zones = [];
    this.shadows = [];
    this.delayed = [];
    this.slowT = 0;
    const gate = map.portals.find((g) => g.to === from);
    const k = gate ? 1 - 5.5 / Math.hypot(gate.x, gate.z) : 0; // a few steps inside the portal
    p.x = p.px = gate ? gate.x * k : 0;
    p.z = p.pz = gate ? gate.z * k : 0;
    if (gate) p.facing = Math.atan2(-gate.z, -gate.x);
    p.moveTarget = null;
    p.targetId = null;
    p.dash = null;
    p.leap = null;
    p.atkWind = 0;
    const arrive = (q, i) => {
      // The party arrives in a little cluster.
      const a = (i / Math.max(1, this.heroes.length)) * TAU;
      q.x = q.px = p.x + (i ? Math.cos(a) * 1.6 : 0);
      q.z = q.pz = p.z + (i ? Math.sin(a) * 1.6 : 0);
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
      if (!q.visited.includes(map.id)) {
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
    // Every spawn point is a "camp" of one enemy that comes back after a while.
    this.camps = map.spawns.map((def) => ({ def, slots: [{ type: def.type, id: null, timer: 0, respawn: def.respawn || CONFIG.RESPAWN_TIME }] }));
    for (const camp of this.camps) for (const slot of camp.slots) slot.id = this.spawnEnemy(slot.type, camp.def).id;
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
    this.obstacles = map.obstacles;
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.telegraphs = [];
    this.zones = [];
    this.shadows = [];
    this.delayed = [];
    this.camps = [];
  }

  /** Keep a round body out of everything solid on the map. Returns true if it was pushed. */
  pushOut(o, rad) {
    let pushed = false;
    for (const ob of this.obstacles) {
      const dx = o.x - ob.x;
      const dz = o.z - ob.z;
      if (ob.shape === 'box') {
        if (Math.abs(dx) + Math.abs(dz) > ob.hw + ob.hd + rad + 2) continue; // far away, skip the maths
        const c = Math.cos(ob.rot);
        const s = Math.sin(ob.rot);
        const lx = dx * c + dz * s; // the body's position in the box's own frame
        const lz = -dx * s + dz * c;
        const cx = clamp(lx, -ob.hw, ob.hw);
        const cz = clamp(lz, -ob.hd, ob.hd);
        let nx = lx - cx;
        let nz = lz - cz;
        let d = Math.hypot(nx, nz);
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
        const d = Math.hypot(dx, dz);
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
    const want = Math.hypot(wantX, wantZ);
    const got = Math.hypot(o.x - o.px, o.z - o.pz);
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
  stepLeash(e, d, dt) {
    const p = this.player;
    const dh = dist(e.x, e.z, e.home.x, e.home.z);
    if (e.aggro && (p.dead || this.inTown(p) || dh > CONFIG.LEASH_RANGE)) {
      e.aggro = false;
      e.returning = true;
    }
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
        e.wander = this.rng() < 0.6 ? { x: e.home.x + Math.cos(a) * r, z: e.home.z + Math.sin(a) * r } : null;
      }
      if (e.wander) {
        const wd = dist(e.x, e.z, e.wander.x, e.wander.z);
        if (wd < 0.3) e.wander = null;
        else {
          const sp = e.def.speed * 0.35 * dt;
          e.x += ((e.wander.x - e.x) / wd) * sp;
          e.z += ((e.wander.z - e.z) / wd) * sp;
          e.facing = Math.atan2(e.wander.z - e.z, e.wander.x - e.x);
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
        e.facing = Math.atan2(e.home.z - e.z, e.home.x - e.x);
        e.moving = true;
      }
    }
    return false;
  }

  stepExplore(dt) {
    const p = this.player;
    if (p.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        p.dead = false;
        this.loadMap(MAPS_START, null); // wake up in town
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
    // Enemies come back a while after they are killed, but not right on top of you.
    for (const camp of this.camps) {
      const away = dist(p.x, p.z, camp.def.x, camp.def.z) > 10;
      for (const slot of camp.slots) {
        if (slot.id != null) continue;
        slot.timer -= dt;
        if (slot.timer <= 0 && away) slot.id = this.spawnEnemy(slot.type, camp.def).id;
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
    // Portals: stand in one for a moment to travel to the next map.
    let on = null;
    for (const g of this.map.portals) if (dist(p.x, p.z, g.x, g.z) < g.r) on = g;
    this.portalOn = on;
    if (!on) {
      this.portalArmed = true;
      this.portalT = 0;
    } else if (this.portalArmed) {
      this.portalT += dt;
      if (this.portalT >= CONFIG.PORTAL_TIME) this.loadMap(on.to, this.map.id);
    }
  }

  /** Number of enemies still to deal with this wave (alive + not yet spawned). */
  get remaining() {
    return this.enemies.length + this.wave.queue.length;
  }

  // =========================================================================
  step(dt) {
    this.runCommands();
    if (this.gameOver) return;
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
      this.stepEnemies(edt);
      this.collide(dt);
      this.stepProjectiles(dt, edt);
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.stepLoot(dt);
      if (this.mode === 'explore') this.stepExplore(dt);
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
    each(() => this.stepPlayer(dt));
    this.byOwner(this.delayed, (list) => { this.delayed = list; this.stepDelayed(dt); return this.delayed; }, (all) => (this.delayed = all));
    this.byOwner(this.zones, (list) => { this.zones = list; this.stepZones(dt); return this.zones; }, (all) => (this.zones = all));
    this.stepShadows(dt);
    this.stepEnemies(edt);
    this.use(lead);
    each(() => this.collide(dt));
    this.stepProjectiles(dt, edt);
    this.use(lead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    each(() => this.stepLoot(dt));
    if (this.mode === 'explore') this.stepPartyExplore(dt);
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

  /** Exploration upkeep in a party: shared enemy respawns, then each hero's own portals and knockouts. */
  stepPartyExplore(dt) {
    const lead = this.heroes[0];
    // Enemies come back a while after they are killed, but not right on top of anyone.
    for (const camp of this.camps) {
      const away = this.heroes.every((h) => dist(h.player.x, h.player.z, camp.def.x, camp.def.z) > 10);
      for (const slot of camp.slots) {
        if (slot.id != null) continue;
        slot.timer -= dt;
        if (slot.timer <= 0 && away) slot.id = this.spawnEnemy(slot.type, camp.def).id;
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
          const k = g ? 1 - 5.5 / Math.hypot(g.x, g.z) : 0;
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
      let on = null;
      for (const g of this.map.portals) if (dist(p.x, p.z, g.x, g.z) < g.r) on = g;
      this.portalOn = on;
      if (!on) {
        this.portalArmed = true;
        this.portalT = 0;
      } else if (this.portalArmed) {
        this.portalT += dt;
        if (this.portalT >= CONFIG.PORTAL_TIME) {
          // One hero takes the portal and the whole party goes with them.
          this.loadMap(on.to, this.map.id);
          this.use(lead);
          return;
        }
      }
    }
    this.use(lead);
    if (allDown && this.heroes.every((h) => (h === this.cur ? this.respawnT : h.respawnT) <= 0)) {
      // The whole party is down: everyone wakes up in Haven.
      this.loadMap(MAPS_START, null);
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
