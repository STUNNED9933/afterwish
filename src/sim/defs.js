// Data definitions: hero abilities, enemy types, and how waves are put together.
// Adding a new enemy is mostly a matter of adding an entry to ENEMIES and a
// model for it in render/models.js.
import { CONFIG } from '../config.js';

// ---------------------------------------------------------------------------
// Hero abilities
// ---------------------------------------------------------------------------
export const ABILITIES = {
  q: {
    key: 'Q',
    name: 'Cleave',
    unlock: 1,
    cd: 4,
    range: 4.8,
    angle: 1.9, // full cone angle in radians
    dmg: (s, lvl) => 1.5 * s.ad + 10 + 4 * lvl,
    desc: 'Slash in a wide cone toward your cursor.',
  },
  w: {
    key: 'W',
    name: 'Whirlwind',
    unlock: 2,
    cd: 9,
    radius: 4.2,
    knockback: 9,
    dmg: (s, lvl) => 1.1 * s.ad + 15 + 5 * lvl,
    desc: 'Spin, hitting and knocking back everything around you. Interrupts normal enemies.',
  },
  e: {
    key: 'E',
    name: 'Breakthrough',
    unlock: 3,
    cd: 9,
    range: 7.5,
    minRange: 3,
    duration: 0.2,
    width: 1.5,
    dmg: (s, lvl) => 0.9 * s.ad + 8 + 3 * lvl,
    desc: 'Dash toward your cursor, cutting through enemies. Nothing can hit you mid-dash, and dodging an attack this way refunds almost all of the cooldown.',
  },
  r: {
    key: 'R',
    name: 'Skyfall',
    unlock: 6,
    cd: 45,
    range: 10,
    radius: 5.2,
    duration: 0.5,
    stun: 1.25,
    dmg: (s, lvl) => 3.2 * s.ad + 60 + 15 * lvl,
    desc: 'Leap to your cursor and crash down for heavy damage, stunning everything hit.',
  },
};
export const ABILITY_SLOTS = ['q', 'w', 'e', 'r'];

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
// Attack shapes:
//   arc    - cone in front of the enemy            (range, angle)
//   circle - disc, `offset` units in front         (radius, offset)
//   rect   - a charge along a line, cannot be parried (length, width, chargeDur)
//   shot   - fires `count` projectiles             (speed, count, spread)
// windup:  seconds of telegraph before the hit lands
// lockAt:  the enemy stops turning to track you this long before the hit
// chain:   name of an attack that follows immediately (boss combos)
// 0.25: bosses no longer let you kite them. From range they charge at you or leap onto where you stand.
const CHASE_ATTACKS = (o) => [
  { name: 'lunge', shape: 'rect', trigger: 22, length: 15 * o.size, width: 2.6 * o.size, windup: 0.8 * o.pace, recover: 1.0, dmg: o.dmg * 1.4, parryable: false, lockAt: 0.25, chargeDur: 0.38 },
  { name: 'leap', shape: 'circle', leap: true, trigger: 22, radius: 3.6 * o.size, offset: 0, windup: 1.1 * o.pace, recover: 1.2, dmg: o.dmg * 1.6, parryable: false, lockAt: 0.3 },
];

export const ENEMIES = {
  grunt: {
    name: 'Husk',
    hp: 55,
    speed: 3.7,
    radius: 0.65,
    height: 1.8,
    exp: 10,
    poise: 1,
    parryStun: 2.2,
    drop: 0.2,
    cost: 1,
    ai: 'melee',
    atkCd: [0.5, 1.1],
    attacks: [
      { name: 'swipe', shape: 'arc', trigger: 2.3, range: 2.9, angle: 1.9, windup: 0.75, recover: 0.9, dmg: 17, parryable: true, lockAt: 0.25 },
    ],
  },
  spitter: {
    name: 'Spitter',
    hp: 38,
    speed: 3.3,
    radius: 0.55,
    height: 1.9,
    exp: 12,
    poise: 1,
    parryStun: 1.5,
    drop: 0.22,
    cost: 1.5,
    ai: 'ranged',
    band: [8, 12],
    atkCd: [0.9, 1.7],
    attacks: [
      { name: 'bolt', shape: 'shot', trigger: 13, windup: 0.85, recover: 1.3, dmg: 15, parryable: true, lockAt: 0.1, speed: 13, count: 1, spread: 0 },
    ],
  },
  brute: {
    name: 'Crusher',
    hp: 190,
    speed: 2.5,
    radius: 1.05,
    height: 2.6,
    heavy: true,
    exp: 32,
    poise: 1,
    parryStun: 3,
    drop: 0.5,
    cost: 3,
    ai: 'melee',
    atkCd: [0.6, 1.2],
    attacks: [
      { name: 'slam', shape: 'circle', trigger: 3.3, radius: 3.0, offset: 2.4, windup: 1.25, recover: 1.5, dmg: 44, parryable: true, lockAt: 0.35 },
    ],
  },
  stalker: {
    name: 'Stalker',
    hp: 70,
    speed: 4.2,
    radius: 0.6,
    height: 1.3,
    exp: 18,
    poise: 1,
    parryStun: 1.5,
    drop: 0.28,
    cost: 2,
    ai: 'ranged',
    band: [6, 9],
    atkCd: [1.0, 1.8],
    attacks: [
      { name: 'charge', shape: 'rect', trigger: 10, length: 11, width: 1.8, windup: 0.9, recover: 1.3, dmg: 30, parryable: false, lockAt: 0.3, chargeDur: 0.4 },
    ],
  },
  boss: {
    name: 'The Warden',
    hp: 900,
    speed: 3.1,
    radius: 1.35,
    height: 3.4,
    heavy: true,
    boss: true,
    exp: 180,
    poise: 3, // parries needed to break its guard (a perfect parry counts double)
    parryStun: 4,
    drop: 1,
    cost: 0,
    ai: 'boss',
    atkCd: [0.7, 1.3],
    attacks: [
      { name: 'combo1', shape: 'arc', trigger: 4.4, range: 4.6, angle: 2.2, windup: 0.85, recover: 0, dmg: 28, parryable: true, lockAt: 0.25, chain: 'combo2' },
      { name: 'combo2', shape: 'arc', trigger: 99, range: 4.6, angle: 2.2, windup: 0.55, recover: 0, dmg: 28, parryable: true, lockAt: 0.2, chain: 'combo3' },
      { name: 'combo3', shape: 'circle', trigger: 99, radius: 3.4, offset: 2.8, windup: 0.8, recover: 1.5, dmg: 42, parryable: true, lockAt: 0.3 },
      { name: 'slam', shape: 'circle', trigger: 4.4, radius: 6.5, offset: 0, windup: 1.5, recover: 1.6, dmg: 62, parryable: false, lockAt: 0 },
      { name: 'fan', shape: 'shot', trigger: 16, windup: 0.9, recover: 1.3, dmg: 19, parryable: true, lockAt: 0.15, speed: 12, count: 5, spread: 0.9 },
    ],
  },
};
ENEMIES.boss.attacks.push(...CHASE_ATTACKS({ size: 1, pace: 1, dmg: 28 }));
// --- Enemies of the later maps ------------------------------------------------
// They reuse the five body shapes above (`model`), recoloured and resized by `look`,
// with their own numbers and attacks. colors are applied to the model's materials in order.
const BOSS_ATTACKS = (o) => [
  { name: 'combo1', shape: 'arc', trigger: 4.4 * o.size, range: 4.6 * o.size, angle: 2.2, windup: 0.85 * o.pace, recover: 0, dmg: o.dmg, parryable: true, lockAt: 0.25, chain: 'combo2' },
  { name: 'combo2', shape: 'arc', trigger: 99, range: 4.6 * o.size, angle: 2.2, windup: 0.55 * o.pace, recover: 0, dmg: o.dmg, parryable: true, lockAt: 0.2, chain: 'combo3' },
  { name: 'combo3', shape: 'circle', trigger: 99, radius: 3.4 * o.size, offset: 2.8 * o.size, windup: 0.8 * o.pace, recover: 1.5, dmg: o.dmg * 1.5, parryable: true, lockAt: 0.3 },
  { name: 'slam', shape: 'circle', trigger: 4.4 * o.size, radius: o.slam, offset: 0, windup: 1.5 * o.pace, recover: 1.6, dmg: o.dmg * 2.1, parryable: false, lockAt: 0 },
  { name: 'fan', shape: 'shot', trigger: 16, windup: 0.9 * o.pace, recover: 1.3, dmg: o.dmg * 0.7, parryable: true, lockAt: 0.15, speed: o.shotSpeed, count: o.shots, spread: o.spread },
  ...CHASE_ATTACKS(o),
];
Object.assign(ENEMIES, {
  imp: {
    name: 'Cinder Imp', model: 'grunt', look: { scale: 0.7, colors: [0xc2562e, 0x3a1c14, 0xffd28a] },
    hp: 32, speed: 5.0, radius: 0.5, height: 1.3, exp: 8, poise: 1, parryStun: 1.8, drop: 0.16, cost: 0.8, ai: 'melee', atkCd: [0.4, 0.9],
    attacks: [{ name: 'claw', shape: 'arc', trigger: 2.0, range: 2.5, angle: 1.7, windup: 0.5, recover: 0.7, dmg: 9, parryable: true, lockAt: 0.2 }],
  },
  knight: {
    name: 'Oathbound Knight', model: 'boss', look: { scale: 0.62, colors: [0x4a5068, 0x8a8f9c, 0x1c1e28] },
    hp: 150, speed: 3.4, radius: 0.85, height: 2.2, exp: 26, poise: 2, parryStun: 2.6, drop: 0.4, cost: 2.5, ai: 'melee', atkCd: [0.6, 1.1],
    attacks: [
      { name: 'cut1', shape: 'arc', trigger: 2.9, range: 3.4, angle: 2.0, windup: 0.7, recover: 0, dmg: 16, parryable: true, lockAt: 0.25, chain: 'cut2' },
      { name: 'cut2', shape: 'arc', trigger: 99, range: 3.4, angle: 2.0, windup: 0.45, recover: 1.1, dmg: 18, parryable: true, lockAt: 0.2 },
    ],
  },
  wolf: {
    name: 'Frost Wolf', model: 'stalker', look: { scale: 1.0, colors: [0xcfe3f0, 0x5a6f80] },
    hp: 60, speed: 5.4, radius: 0.6, height: 1.3, exp: 13, poise: 1, parryStun: 1.8, drop: 0.2, cost: 1.5, ai: 'melee', atkCd: [0.5, 1.0],
    attacks: [{ name: 'bite', shape: 'arc', trigger: 2.2, range: 2.7, angle: 1.5, windup: 0.45, recover: 0.8, dmg: 14, parryable: true, lockAt: 0.18 }],
  },
  shaman: {
    name: 'Rime Caller', model: 'spitter', look: { scale: 1.1, colors: [0x5a7fb0, 0x1c2a44] },
    hp: 55, speed: 3.2, radius: 0.55, height: 2.1, exp: 16, poise: 1, parryStun: 1.5, drop: 0.25, cost: 2, ai: 'ranged', band: [8, 12], atkCd: [1.0, 1.8],
    attacks: [{ name: 'shards', shape: 'shot', trigger: 13, windup: 0.9, recover: 1.4, dmg: 9, parryable: true, lockAt: 0.12, speed: 12, count: 3, spread: 0.5 }],
  },
  scarab: {
    name: 'Dune Scarab', model: 'stalker', look: { scale: 1.25, colors: [0xc9a24a, 0x4a3a1c] },
    hp: 110, speed: 4.4, radius: 0.75, height: 1.5, exp: 20, poise: 1, parryStun: 1.5, drop: 0.3, cost: 2, ai: 'ranged', band: [5, 8], atkCd: [0.8, 1.4],
    attacks: [{ name: 'charge', shape: 'rect', trigger: 9, length: 12, width: 2.2, windup: 0.75, recover: 1.2, dmg: 22, parryable: false, lockAt: 0.25, chargeDur: 0.4 }],
  },
  golem: {
    name: 'Stone Colossus', model: 'brute', look: { scale: 1.25, colors: [0x8a7a5a, 0x3a3226] },
    hp: 300, speed: 2.2, radius: 1.3, height: 3.2, heavy: true, exp: 44, poise: 2, parryStun: 3, drop: 0.55, cost: 3.5, ai: 'melee', atkCd: [0.8, 1.4],
    attacks: [{ name: 'quake', shape: 'circle', trigger: 3.6, radius: 4.6, offset: 0, windup: 1.4, recover: 1.6, dmg: 30, parryable: false, lockAt: 0 }],
  },
  sporecap: {
    name: 'Sporecap', model: 'spitter', look: { scale: 0.95, colors: [0x7a4a8a, 0x2a1c34] },
    hp: 70, speed: 2.6, radius: 0.7, height: 1.9, exp: 17, poise: 1, parryStun: 1.5, drop: 0.25, cost: 2, ai: 'ranged', band: [7, 11], atkCd: [1.1, 1.9],
    attacks: [{ name: 'spore', shape: 'shot', trigger: 12, windup: 1.0, recover: 1.5, dmg: 20, parryable: false, lockAt: 0.3, speed: 8.5, count: 1, spread: 0 }],
  },
  wraith: {
    name: 'Storm Wraith', model: 'spitter', look: { scale: 1.2, colors: [0x9ab8e0, 0x2a3450] },
    hp: 60, speed: 4.6, radius: 0.55, height: 2.3, exp: 19, poise: 1, parryStun: 1.5, drop: 0.25, cost: 2, ai: 'ranged', band: [7, 11], atkCd: [0.6, 1.2],
    attacks: [{ name: 'bolt', shape: 'shot', trigger: 12, windup: 0.6, recover: 0.9, dmg: 13, parryable: true, lockAt: 0.08, speed: 19, count: 1, spread: 0 }],
  },
  boss2: {
    name: 'The Mycelord', model: 'boss', look: { scale: 1.1, colors: [0x5a3a6a, 0x9fe07a, 0x1c1424] },
    hp: 1700, speed: 2.9, radius: 1.5, height: 3.7, heavy: true, boss: true, exp: 260, poise: 3, parryStun: 4, drop: 1, cost: 0, ai: 'boss', atkCd: [0.7, 1.3],
    attacks: BOSS_ATTACKS({ size: 1.1, pace: 1, dmg: 26, slam: 7.5, shots: 7, spread: 1.3, shotSpeed: 11 }),
  },
  boss3: {
    name: 'The Unmade', model: 'boss', look: { scale: 1.25, colors: [0x2a1c5a, 0x7ff5e1, 0x0c0c1c] },
    hp: 2400, speed: 3.4, radius: 1.6, height: 4.2, heavy: true, boss: true, exp: 340, poise: 4, parryStun: 4, drop: 1, cost: 0, ai: 'boss', atkCd: [0.6, 1.1],
    final: true, // the last boss: three phases, its own bar (see world.js bossPhase)
    title: 'What the wish left behind',
    attacks: [
      ...BOSS_ATTACKS({ size: 1.2, pace: 0.88, dmg: 30, slam: 8, shots: 9, spread: 1.6, shotSpeed: 14 }),
      // Phase two: stars fall on you and on where you are heading. Phase three: it drags you in and bursts.
      { name: 'starfall', shape: 'rain', trigger: 30, windup: 0.7, recover: 0.9, dmg: 34, parryable: false, lockAt: 0, count: 6, gap: 0.28, fall: 0.85, radius: 2.6, phase: 2 },
      { name: 'collapse', shape: 'circle', trigger: 30, radius: 7.5, offset: 0, windup: 1.8, recover: 1.8, dmg: 70, parryable: false, lockAt: 0, pull: 4.2, phase: 3 },
    ],
  },
});
/** The arena's bosses take turns: wave 5 The Warden, 10 The Mycelord, 15 The Unmade, 20 The Warden ... */
export const BOSSES = ['boss', 'boss2', 'boss3'];

for (const key in ENEMIES) {
  const def = ENEMIES[key];
  def.type = key;
  def.attackByName = {};
  for (const a of def.attacks) def.attackByName[a.name] = a;
}

/**
 * How strong a level-N enemy is compared with level 1.
 *
 * The first bracket in each line is fitted to the hero: it keeps a fight
 * against an enemy of your own level the same length, and its hits the same
 * share of your health, whether you are level 5 or level 95. The second
 * bracket is the difficulty ramp on top of that: by level 100 an enemy takes
 * about three times as long to kill and hits about twice as hard, which is
 * what better gear, ability ranks and parrying are for.
 */
export function enemyScale(level) {
  const n = Math.max(0, level - 1);
  return {
    hp: (1 + 0.2 * n) * (1 + n / 60) * (1 + n / 50),
    dmg: (1 + 0.2 * n) * (1 + 0.02 * n) * (1 + n / 90),
    exp: expWorth(level),
    gold: 1 + 0.12 * n,
  };
}

/** How much EXP a level-N enemy is worth, as a multiple of its base `exp`. */
export function expWorth(level) {
  const n = Math.max(0, level - 1);
  return 1 + 0.25 * n + 0.02 * n * n;
}

/**
 * EXP needed to go from `level` to `level + 1`. Written as "this many Husks of
 * your own level": 4 at level 1, 11 at level 10, 70 at level 50, 210 at level 99.
 * Most enemies are worth more than a Husk, so the real number of kills is about
 * half that. CONFIG.EXP_PACE stretches or shrinks the whole climb.
 */
export function expToNext(level) {
  return Math.round(10 * expWorth(level) * (3 + 0.6 * level + 0.015 * level * level) * CONFIG.EXP_PACE);
}

/** Which wave you restart from if you die on `wave` (the wave after the last boss). */
export function checkpointFor(wave) {
  return Math.floor((wave - 1) / CONFIG.BOSS_EVERY) * CONFIG.BOSS_EVERY + 1;
}

/** Returns the list of enemy type keys for wave `n`, in spawn order. */
export function buildWave(n, rng) {
  if (n % CONFIG.BOSS_EVERY === 0) {
    const list = [BOSSES[(n / CONFIG.BOSS_EVERY - 1) % BOSSES.length]];
    const adds = list[0] === 'boss3' ? 0 : Math.min(4, Math.floor(n / CONFIG.BOSS_EVERY) - 1); // the final boss fights alone
    for (let i = 0; i < adds; i++) list.push(i % 2 ? 'spitter' : 'grunt');
    return list;
  }
  if (n === 1) return ['grunt', 'grunt'];

  const list = [];
  let budget = 3 + n * 2; // dense floors that ramp quickly (0.25)
  const add = (type) => {
    list.push(type);
    budget -= ENEMIES[type].cost;
  };
  // Each new enemy type is guaranteed on the wave that introduces it.
  if (n === 2) add('spitter');
  if (n === 3) add('brute');
  if (n === 4) add('stalker');

  const pool = ['grunt', 'grunt'];
  if (n >= 2) pool.push('spitter');
  if (n >= 3) pool.push('brute');
  if (n >= 4) pool.push('stalker');
  // Enemies from the later exploration maps join in on deeper waves.
  for (const [type, from] of [['imp', 3], ['wolf', 4], ['knight', 6], ['shaman', 6], ['scarab', 7], ['wraith', 8], ['sporecap', 9], ['golem', 10]]) {
    if (n >= from) pool.push(type);
  }
  let guard = 0;
  while (budget >= 1 && guard++ < 60) {
    const type = pool[Math.floor(rng() * pool.length)];
    if (ENEMIES[type].cost <= budget) add(type);
  }
  // Shuffle so the spawn order varies.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
