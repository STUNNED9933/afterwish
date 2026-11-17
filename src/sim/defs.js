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
  // An exploration surprise (0.29): it never fights. It runs, spilling gold when hit, and escapes after a while.
  // Called up by Remnants (0.31). The Warden's shades fight with its own combo; wish-stars just wait to be broken.
  oathshade: {
    name: 'Oath Shade', model: 'boss', look: { scale: 0.62, colors: [0x6a4ab0, 0xc8b8ff, 0x1c1430] },
    hp: 300, speed: 3.6, radius: 0.9, height: 2.3, exp: 0, poise: 2, parryStun: 2.6, drop: 0, cost: 0, ai: 'melee', atkCd: [0.8, 1.3], summon: true,
    attacks: [
      { name: 'combo1', shape: 'arc', trigger: 3.2, range: 3.6, angle: 2.0, windup: 0.8, recover: 0, dmg: 14, parryable: true, lockAt: 0.25, chain: 'combo2' },
      { name: 'combo2', shape: 'arc', trigger: 99, range: 3.6, angle: 2.0, windup: 0.55, recover: 0, dmg: 14, parryable: true, lockAt: 0.2, chain: 'combo3' },
      { name: 'combo3', shape: 'circle', trigger: 99, radius: 2.8, offset: 2.2, windup: 0.8, recover: 1.6, dmg: 20, parryable: true, lockAt: 0.3 },
    ],
  },
  wishstar: {
    name: 'Wish-star', model: 'spitter', look: { scale: 0.75, colors: [0x7ff5e1, 0x1c3a44] },
    hp: 300, speed: 0, radius: 0.7, height: 1.8, exp: 0, poise: 99, parryStun: 0, drop: 0, cost: 0, ai: 'static', still: true, summon: true, atkCd: [99, 99],
    attacks: [{ name: 'none', shape: 'arc', trigger: -1, range: 0, angle: 0, windup: 1, recover: 1, dmg: 0, parryable: true, lockAt: 0 }],
  },
  wishthief: {
    name: 'Wishthief', model: 'grunt', look: { scale: 0.72, colors: [0xffcf5a, 0x5a3a12, 0xfff2c0] },
    hp: 110, speed: 5, radius: 0.5, height: 1.2, exp: 40, poise: 99, parryStun: 0, drop: 0, cost: 0, ai: 'thief', thief: true, atkCd: [99, 99],
    attacks: [{ name: 'none', shape: 'arc', trigger: -1, range: 0, angle: 0, windup: 1, recover: 1, dmg: 0, parryable: true, lockAt: 0 }],
  },
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
  // Asterfell (0.39): the Queen's people, held in glass on their happiest day.
  glassbound: {
    name: 'Glassbound', model: 'grunt', look: { scale: 1.15, colors: [0xe8c27a, 0x7a4a1c, 0xfff0c0] },
    hp: 170, speed: 2.9, radius: 0.75, height: 2.0, exp: 24, poise: 2, parryStun: 2.2, drop: 0.35, cost: 2, ai: 'melee', atkCd: [0.7, 1.3],
    shatter: { r: 2.8, mult: 1.8 }, // bursts into glass a moment after it falls: step out of the circle
    attacks: [{ name: 'smash', shape: 'arc', trigger: 2.6, range: 3.2, angle: 1.8, windup: 0.8, recover: 1.0, dmg: 22, parryable: true, lockAt: 0.25 }],
  },
  courtguard: {
    name: 'Court Guard', model: 'boss', look: { scale: 0.66, colors: [0xd8b25a, 0xf2ead8, 0x4a3218] },
    hp: 160, speed: 3.2, radius: 0.85, height: 2.3, exp: 28, poise: 2, parryStun: 2.6, drop: 0.4, cost: 2.5, ai: 'melee', atkCd: [0.7, 1.2],
    shield: 0.5, // a shield worth half its health takes damage first; a parry shatters it
    attacks: [
      { name: 'bash', shape: 'arc', trigger: 2.8, range: 3.2, angle: 1.6, windup: 0.65, recover: 0, dmg: 15, parryable: true, lockAt: 0.22, chain: 'thrust' },
      { name: 'thrust', shape: 'rect', trigger: 99, length: 5.5, width: 1.4, windup: 0.5, recover: 1.1, dmg: 20, parryable: true, lockAt: 0.2, chargeDur: 0.18 },
    ],
  },
  wishling: {
    name: 'Wishling', model: 'spitter', look: { scale: 0.62, colors: [0xfff2b0, 0xffc860] },
    hp: 48, speed: 4.4, radius: 0.45, height: 1.4, exp: 18, poise: 1, parryStun: 1.6, drop: 0.25, cost: 1.5, ai: 'ranged', band: [8, 12], atkCd: [1.2, 2.0],
    grants: { every: 4, range: 8, time: 4, dmg: 1.3 }, // now and then gives a nearby enemy what it wants: 30% more damage, for a while
    attacks: [{ name: 'mote', shape: 'shot', trigger: 12, windup: 0.8, recover: 1.2, dmg: 12, parryable: true, lockAt: 0.1, speed: 10, count: 1, spread: 0 }],
  },
  // The Herald (0.40): Maren's chamberlain, still reading out your naming-day proclamation. Each line
  // of it calls Court Guards to the court (see world.js stepHerald).
  herald: {
    name: 'The Herald', model: 'boss', look: { scale: 1.05, colors: [0xe8d8b0, 0xd8b25a, 0x5a3a18] },
    hp: 2600, speed: 3.0, radius: 1.4, height: 3.6, heavy: true, boss: true, exp: 360, poise: 3, parryStun: 4, drop: 1, cost: 0, ai: 'boss', atkCd: [0.7, 1.2],
    herald: { every: 12, guards: 2, max: 4, hp: 0.07, dmg: 0.6 },
    title: 'Who reads your name to the city',
    attacks: [], // filled in below (BOSS_ATTACKS is defined after this table)
  },
  // The Asker (0.40): the star itself, in a shape of light. It offers you a wish three times.
  asker: {
    name: 'The Asker', model: 'boss', look: { scale: 1.15, colors: [0xfff2c0, 0xffd27a, 0x3a2a0a] },
    hp: 3200, speed: 3.3, radius: 1.5, height: 4.0, heavy: true, boss: true, exp: 420, poise: 4, parryStun: 4, drop: 1, cost: 0, ai: 'boss', atkCd: [0.6, 1.1],
    asker: { at: [0.75, 0.5, 0.25], time: 10, last: 0.2 },
    title: 'What the star wants to give you',
    attacks: [],
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
// Act II bosses (0.40): their attacks, and the Herald's guards (after every table above is in, before attacks are indexed).
ENEMIES.herald.attacks.push(
  ...BOSS_ATTACKS({ size: 1.05, pace: 0.95, dmg: 30, slam: 7, shots: 7, spread: 1.2, shotSpeed: 13 }),
  // the proclamation's light, falling along your path
  { name: 'proclaim', shape: 'rain', trigger: 22, windup: 0.6, recover: 1.0, dmg: 30, parryable: false, lockAt: 0, count: 7, gap: 0.2, fall: 0.8, radius: 2.2 },
);
ENEMIES.asker.attacks.push(
  ...BOSS_ATTACKS({ size: 1.15, pace: 0.85, dmg: 32, slam: 8, shots: 11, spread: 2.4, shotSpeed: 15 }),
  { name: 'starfall', shape: 'rain', trigger: 30, windup: 0.6, recover: 0.9, dmg: 34, parryable: false, lockAt: 0, count: 8, gap: 0.24, fall: 0.8, radius: 2.4 },
);
// ---------------------------------------------------------------------------
// 0.44: every enemy's moves, fitted to where it lives and what it was before the wish.
// Kits are picked by sim/world.js pickFromKit (trigger, min, cd, weight, phase, hpBelow).
// New shapes and extras: ring (safe close in: inner), beam (a still line; cross = four of them),
// call (no blow: summon / heal only), rain with line or scatter, shots around and seeking (seek),
// pool (ground that hurts after), chill (slows on hit), blink (steps beside you first), fx (colour).
// ---------------------------------------------------------------------------
const POOL = (kind, r, life, dmg = 0.25, more = {}) => ({ kind, r, life, dmg, ...more });
const KITS = {
  // The Husks of the Greenwood: villagers the wish would not let die. They reach for you.
  grunt: [
    { name: 'swipe', shape: 'arc', trigger: 2.3, range: 2.9, angle: 1.9, windup: 0.75, recover: 0.9, dmg: 17, parryable: true, lockAt: 0.25, weight: 3 },
    { name: 'lurch', shape: 'rect', trigger: 6, min: 3, length: 5, width: 1.6, windup: 0.8, recover: 1.1, dmg: 15, parryable: false, lockAt: 0.25, chargeDur: 0.32, cd: 6 },
  ],
  // Fen Spitters: the low-water fever, carried and coughed up. Where it lands, the ground is sick.
  spitter: [
    { name: 'bolt', shape: 'shot', trigger: 13, windup: 0.85, recover: 1.3, dmg: 15, parryable: true, lockAt: 0.1, speed: 13, count: 1, spread: 0, fx: 'fever', weight: 2 },
    { name: 'retch', shape: 'rain', trigger: 13, windup: 0.9, recover: 1.4, dmg: 13, parryable: false, lockAt: 0, count: 1, gap: 0, fall: 1.0, radius: 2.2, pool: POOL('fever', 2.2, 4, 0.22), fx: 'fever', cd: 7 },
  ],
  // Crushers: quarry hands still in their shackles. The chain swings wide; the stomp only misses those who hug them.
  brute: [
    { name: 'slam', shape: 'circle', trigger: 3.3, radius: 3.0, offset: 2.4, windup: 1.25, recover: 1.5, dmg: 44, parryable: true, lockAt: 0.35, weight: 2 },
    { name: 'chain', shape: 'arc', trigger: 4.2, range: 4.6, angle: 4.2, windup: 1.0, recover: 1.3, dmg: 32, parryable: true, lockAt: 0.3, cd: 6, fx: 'iron' },
    { name: 'stomp', shape: 'ring', trigger: 5, radius: 5.6, inner: 2.2, windup: 1.2, recover: 1.5, dmg: 38, parryable: false, lockAt: 0, cd: 9, fx: 'iron' },
  ],
  // Stalkers: starved things that hunt by sound. A charge, or a pounce onto where you stood.
  stalker: [
    { name: 'charge', shape: 'rect', trigger: 10, length: 11, width: 1.8, windup: 0.9, recover: 1.3, dmg: 30, parryable: false, lockAt: 0.3, chargeDur: 0.4, weight: 2 },
    { name: 'pounce', shape: 'circle', leap: true, trigger: 12, min: 4, radius: 2.2, offset: 0, windup: 0.85, recover: 1.1, dmg: 26, parryable: false, lockAt: 0.25, cd: 6 },
  ],
  // Cinder Imps of the Ashen Ridge: they burst into embers that keep burning.
  imp: [
    { name: 'claw', shape: 'arc', trigger: 2.0, range: 2.5, angle: 1.7, windup: 0.5, recover: 0.7, dmg: 9, parryable: true, lockAt: 0.2, weight: 3 },
    { name: 'cinders', shape: 'circle', trigger: 2.6, radius: 2.4, offset: 0, windup: 0.9, recover: 1.0, dmg: 10, parryable: false, lockAt: 0, pool: POOL('ember', 2.0, 3, 0.3), fx: 'ember', cd: 7 },
  ],
  // The Oathbound: the Warden's men, still keeping the gate. Two cuts, a shield to close the gap, and the oath's thrust.
  knight: [
    { name: 'cut1', shape: 'arc', trigger: 2.9, range: 3.4, angle: 2.0, windup: 0.7, recover: 0, dmg: 16, parryable: true, lockAt: 0.25, chain: 'cut2', weight: 3 },
    { name: 'cut2', shape: 'arc', trigger: 99, range: 3.4, angle: 2.0, windup: 0.45, recover: 1.1, dmg: 18, parryable: true, lockAt: 0.2 },
    { name: 'shieldrush', shape: 'rect', trigger: 7, min: 3.2, length: 5.5, width: 1.8, windup: 0.7, recover: 1.0, dmg: 18, parryable: false, lockAt: 0.25, chargeDur: 0.25, cd: 6, fx: 'iron' },
    { name: 'oath', shape: 'beam', trigger: 5.6, length: 6.5, width: 1.3, windup: 0.8, recover: 1.1, dmg: 22, parryable: true, lockAt: 0.2, cd: 6, fx: 'oath' },
  ],
  // Frost Wolves of the high pass: a bite that leaves you cold, and a leap from further out.
  wolf: [
    { name: 'bite', shape: 'arc', trigger: 2.2, range: 2.7, angle: 1.5, windup: 0.45, recover: 0.8, dmg: 14, parryable: true, lockAt: 0.18, chill: 1.5, fx: 'frost', weight: 3 },
    { name: 'pounce', shape: 'circle', leap: true, trigger: 11, min: 4.5, radius: 2.0, offset: 0, windup: 0.75, recover: 1.0, dmg: 16, parryable: false, lockAt: 0.22, chill: 2, cd: 5, fx: 'frost' },
  ],
  // Rime Callers: the pass's priests. Shards, and frost that grows up out of the ground under you.
  shaman: [
    { name: 'shards', shape: 'shot', trigger: 13, windup: 0.9, recover: 1.4, dmg: 9, parryable: true, lockAt: 0.12, speed: 12, count: 3, spread: 0.5, fx: 'frost', weight: 2 },
    { name: 'rime', shape: 'rain', trigger: 13, windup: 0.8, recover: 1.3, dmg: 12, parryable: false, lockAt: 0, count: 1, gap: 0, fall: 1.1, radius: 2.6, pool: POOL('frost', 2.6, 3, 0.12, { slow: 0.8 }), fx: 'frost', cd: 8 },
  ],
  // Dune Scarabs: the old city's beetles. A charge, or a dive under the sand and out beneath you.
  scarab: [
    { name: 'charge', shape: 'rect', trigger: 9, length: 12, width: 2.2, windup: 0.75, recover: 1.2, dmg: 22, parryable: false, lockAt: 0.25, chargeDur: 0.4, weight: 2 },
    { name: 'burrow', shape: 'rain', trigger: 13, windup: 0.7, recover: 1.3, dmg: 24, parryable: false, lockAt: 0, count: 1, gap: 0, fall: 1.2, radius: 2.4, fx: 'sand', cd: 7 },
  ],
  // Stone Colossi: the Queen's guard, carved in sandstone and woken. A fist, the quake, and the statue falling on you.
  golem: [
    { name: 'quake', shape: 'circle', trigger: 3.6, radius: 4.6, offset: 0, windup: 1.4, recover: 1.6, dmg: 30, parryable: false, lockAt: 0, fx: 'sand' },
    { name: 'fist', shape: 'arc', trigger: 4, range: 4.2, angle: 1.4, windup: 1.0, recover: 1.2, dmg: 34, parryable: true, lockAt: 0.3, weight: 2 },
    { name: 'topple', shape: 'beam', trigger: 9, min: 3, length: 9, width: 3, windup: 1.4, recover: 2.0, dmg: 46, parryable: false, lockAt: 0.3, cd: 9, fx: 'sand' },
  ],
  // Sporecaps: Brother Tobin's garden, walking. Spores that take root, and a cloud when you come close.
  sporecap: [
    { name: 'spore', shape: 'shot', trigger: 12, windup: 1.0, recover: 1.5, dmg: 20, parryable: false, lockAt: 0.3, speed: 8.5, count: 1, spread: 0, pool: POOL('spore', 1.8, 4, 0.2), fx: 'spore', weight: 2 },
    { name: 'cloud', shape: 'circle', trigger: 4, radius: 3.2, offset: 0, windup: 1.0, recover: 1.3, dmg: 10, parryable: false, lockAt: 0, pool: POOL('spore', 3.2, 4, 0.2), fx: 'spore', cd: 9 },
  ],
  // Storm Wraiths of the Spire: a bolt, lightning that walks toward you, and a step through the air to your side.
  wraith: [
    { name: 'bolt', shape: 'shot', trigger: 12, windup: 0.6, recover: 0.9, dmg: 13, parryable: true, lockAt: 0.08, speed: 19, count: 1, spread: 0, fx: 'storm', weight: 2 },
    { name: 'arc', shape: 'rain', line: true, trigger: 13, windup: 0.7, recover: 1.1, dmg: 14, parryable: false, lockAt: 0.1, count: 4, gap: 0.12, fall: 0.6, radius: 1.8, fx: 'storm', cd: 6 },
    { name: 'stepcut', shape: 'arc', trigger: 14, min: 4, range: 2.8, angle: 1.8, windup: 0.6, recover: 1.0, dmg: 16, parryable: true, lockAt: 0.2, blink: 2.2, cd: 8, fx: 'storm' },
  ],
  // The Glassbound: Asterfell's people, frozen mid-toast. They raise their glass, and it breaks outward.
  glassbound: [
    { name: 'smash', shape: 'arc', trigger: 2.6, range: 3.2, angle: 1.8, windup: 0.8, recover: 1.0, dmg: 22, parryable: true, lockAt: 0.25, weight: 2 },
    { name: 'toast', shape: 'shot', around: true, trigger: 6, windup: 1.0, recover: 1.3, dmg: 12, parryable: true, lockAt: 0, speed: 9, count: 8, spread: 0, life: 1.4, fx: 'glass', cd: 8 },
  ],
  // Court Guards: still on parade. A bash, the thrust that follows it, and the halberd's sweep.
  courtguard: [
    { name: 'bash', shape: 'arc', trigger: 2.8, range: 3.2, angle: 1.6, windup: 0.65, recover: 0, dmg: 15, parryable: true, lockAt: 0.22, chain: 'thrust', weight: 2 },
    { name: 'thrust', shape: 'rect', trigger: 99, length: 5.5, width: 1.4, windup: 0.5, recover: 1.1, dmg: 20, parryable: true, lockAt: 0.2, chargeDur: 0.18 },
    { name: 'sweep', shape: 'arc', trigger: 4, range: 4.2, angle: 3.2, windup: 0.9, recover: 1.2, dmg: 18, parryable: true, lockAt: 0.3, cd: 6, fx: 'gold' },
  ],
};
for (const id in KITS) {
  ENEMIES[id].attacks = KITS[id];
  ENEMIES[id].kit = true;
}
ENEMIES.heraldguard = { ...ENEMIES.courtguard, exp: 0, drop: 0, summon: true }; // called by the Herald; no reward of their own
ENEMIES.wishling.attacks[0].fx = 'gold';

// --- Bosses (0.44): each fights like who they were ---------------------------------------------
const CHASE_KIT = (o) => CHASE_ATTACKS(o).map((a) => ({ ...a, min: a.name === 'lunge' ? 7 : 8, weight: 0.6, cd: 5 }));
const BOSS_BASE = (o) => BOSS_ATTACKS(o).filter((a) => a.name !== 'lunge' && a.name !== 'leap').map((a) =>
  a.name === 'combo1' ? { ...a, weight: 3 } : a.name === 'fan' ? { ...a, min: 6, weight: 0.8, cd: 4 } : a);
const CALL = (name, more) => ({ name, shape: 'call', trigger: 40, windup: 1.2, recover: 1.0, dmg: 0, parryable: false, lockAt: 0, ...more });

// The Warden, Captain Aldric: barred the gate so the curse stayed up the mountain, and still counts it.
ENEMIES.boss.attacks = [
  ...BOSS_BASE({ size: 1, pace: 1, dmg: 28, slam: 6.5, shots: 5, spread: 0.9, shotSpeed: 12 }),
  { name: 'keys', shape: 'arc', trigger: 6, range: 6, angle: 4.4, windup: 1.0, recover: 1.2, dmg: 30, parryable: true, lockAt: 0.3, cd: 7, fx: 'iron' },
  { name: 'bargate', shape: 'beam', trigger: 16, length: 16, width: 2.6, windup: 1.2, recover: 1.4, dmg: 50, parryable: false, lockAt: 0.25, cd: 9, fx: 'iron' },
  { name: 'count', shape: 'rain', line: true, trigger: 18, windup: 0.8, recover: 1.2, dmg: 32, parryable: false, lockAt: 0.1, count: 6, gap: 0.22, fall: 0.7, radius: 2.2, cd: 10, fx: 'oath' },
  CALL('muster', { summon: { type: 'oathshade', count: 2, max: 2 }, hpBelow: 0.6, cd: 28 }),
  ...CHASE_KIT({ size: 1, pace: 1, dmg: 28 }),
];
// The Mycelord, once Brother Tobin: he tried to teach bodies to rot so they could rest. He is still trying.
ENEMIES.boss2.attacks = [
  ...BOSS_BASE({ size: 1.1, pace: 1, dmg: 26, slam: 7.5, shots: 7, spread: 1.3, shotSpeed: 11 }).map((a) => (a.name === 'slam' ? { ...a, pool: POOL('spore', 4, 4, 0.18), fx: 'spore' } : a)),
  { name: 'remedy', shape: 'shot', trigger: 16, min: 4, windup: 0.9, recover: 1.1, dmg: 18, parryable: true, lockAt: 0.15, speed: 10, count: 3, spread: 0.8, pool: POOL('fever', 2, 4, 0.2), fx: 'fever', cd: 5 },
  { name: 'garden', shape: 'rain', scatter: 7, trigger: 20, windup: 1.0, recover: 1.2, dmg: 22, parryable: false, lockAt: 0, count: 6, gap: 0.15, fall: 1.0, radius: 2.2, pool: POOL('spore', 2.2, 5, 0.18), fx: 'spore', cd: 12 },
  { name: 'rot', shape: 'ring', trigger: 9, radius: 8, inner: 3, windup: 1.3, recover: 1.4, dmg: 44, parryable: false, lockAt: 0, cd: 9, fx: 'rot' },
  { name: 'medicine', shape: 'circle', trigger: 14, radius: 4.2, offset: 0, windup: 1.7, recover: 1.6, dmg: 56, parryable: false, lockAt: 0, pull: 3.4, hpBelow: 0.7, cd: 14, fx: 'rot' },
  CALL('tend', { summon: { type: 'sporecap', count: 2, max: 3 }, heal: 0.03, hpBelow: 0.5, cd: 24 }),
  ...CHASE_KIT({ size: 1.1, pace: 1, dmg: 26 }),
];
// The Unmade, once Queen Maren: "let nothing I love be taken from me". She sings to an empty cradle,
// holds you close, calls her people back, and in the end she weeps the sky down.
ENEMIES.boss3.attacks = [
  ...BOSS_BASE({ size: 1.2, pace: 0.88, dmg: 30, slam: 8, shots: 9, spread: 1.6, shotSpeed: 14 }),
  { name: 'lullaby', shape: 'shot', around: true, trigger: 20, windup: 1.0, recover: 1.0, dmg: 16, parryable: true, lockAt: 0, speed: 6, count: 10, spread: 0, seek: 0.9, life: 5, cd: 9, fx: 'star' },
  { name: 'cradle', shape: 'ring', trigger: 9, radius: 9, inner: 2.8, windup: 1.3, recover: 1.3, dmg: 46, parryable: false, lockAt: 0, cd: 8, fx: 'star' },
  // phase two: the mother
  { name: 'starfall', shape: 'rain', trigger: 30, windup: 0.7, recover: 0.9, dmg: 34, parryable: false, lockAt: 0, count: 6, gap: 0.28, fall: 0.85, radius: 2.6, phase: 2, cd: 7, fx: 'star' },
  { name: 'holdon', shape: 'circle', trigger: 14, radius: 4.6, offset: 0, windup: 1.6, recover: 1.5, dmg: 52, parryable: false, lockAt: 0, pull: 3.2, phase: 2, cd: 12, fx: 'star' },
  CALL('people', { summon: { type: 'grunt', count: 3, max: 4 }, phase: 2, cd: 20 }),
  // phase three: the wish
  { name: 'collapse', shape: 'circle', trigger: 13, radius: 7.5, offset: 0, windup: 1.8, recover: 1.8, dmg: 70, parryable: false, lockAt: 0, pull: 4.2, phase: 3, cd: 10, weight: 1.5, fx: 'star' },
  { name: 'weep', shape: 'rain', scatter: 9, trigger: 30, windup: 1.0, recover: 1.0, dmg: 24, parryable: false, lockAt: 0, count: 10, gap: 0.12, fall: 0.8, radius: 2.0, pool: POOL('tears', 2, 3, 0.15, { slow: 0.6 }), phase: 3, cd: 11, fx: 'tears' },
  { name: 'emptycradle', shape: 'beam', cross: true, trigger: 16, length: 16, width: 2.4, windup: 1.2, recover: 1.3, dmg: 48, parryable: false, lockAt: 0.6, phase: 3, cd: 9, fx: 'star' },
  { name: 'wings', shape: 'shot', around: true, trigger: 20, windup: 0.9, recover: 1.1, dmg: 22, parryable: false, lockAt: 0, speed: 13, count: 14, spread: 0, phase: 3, cd: 10, fx: 'star' },
  ...CHASE_KIT({ size: 1.2, pace: 0.88, dmg: 30 }),
];
// The Herald: the chamberlain reading your naming day to a city held in glass. He wants to present you.
ENEMIES.herald.attacks = [
  ...BOSS_BASE({ size: 1.05, pace: 0.95, dmg: 30, slam: 7, shots: 7, spread: 1.2, shotSpeed: 13 }),
  { name: 'proclaim', shape: 'rain', trigger: 22, windup: 0.6, recover: 1.0, dmg: 30, parryable: false, lockAt: 0, count: 7, gap: 0.2, fall: 0.8, radius: 2.2, cd: 8, fx: 'gold' },
  { name: 'fanfare', shape: 'shot', around: true, trigger: 12, windup: 0.9, recover: 1.0, dmg: 18, parryable: true, lockAt: 0, speed: 11, count: 12, spread: 0, cd: 8, fx: 'gold' },
  { name: 'decree', shape: 'beam', trigger: 18, length: 18, width: 2.2, windup: 1.0, recover: 1.2, dmg: 44, parryable: false, lockAt: 0.25, cd: 7, fx: 'gold' },
  { name: 'present', shape: 'circle', trigger: 14, radius: 4.5, offset: 0, windup: 1.6, recover: 1.5, dmg: 50, parryable: false, lockAt: 0, pull: 3, hpBelow: 0.75, cd: 14, fx: 'gold' },
  ...CHASE_KIT({ size: 1.05, pace: 0.95, dmg: 30 }),
];
// The Asker: the star. It gives what is asked, and every wish ever made is still in the air around it.
ENEMIES.asker.attacks = [
  ...BOSS_BASE({ size: 1.15, pace: 0.85, dmg: 32, slam: 8, shots: 11, spread: 2.4, shotSpeed: 15 }),
  { name: 'starfall', shape: 'rain', trigger: 30, windup: 0.6, recover: 0.9, dmg: 34, parryable: false, lockAt: 0, count: 8, gap: 0.24, fall: 0.8, radius: 2.4, cd: 8, fx: 'gold' },
  { name: 'halo', shape: 'ring', trigger: 10, radius: 9, inner: 3, windup: 1.2, recover: 1.2, dmg: 46, parryable: false, lockAt: 0, cd: 8, fx: 'gold' },
  { name: 'crosslight', shape: 'beam', cross: true, trigger: 15, length: 14, width: 2, windup: 1.3, recover: 1.2, dmg: 46, parryable: false, lockAt: 0.6, cd: 10, fx: 'star' },
  { name: 'granted', shape: 'shot', around: true, trigger: 20, windup: 1.0, recover: 1.1, dmg: 18, parryable: true, lockAt: 0, speed: 8, count: 16, spread: 0, seek: 0.6, life: 4, cd: 12, fx: 'gold' },
  ...CHASE_KIT({ size: 1.15, pace: 0.85, dmg: 32 }),
];
for (const id of ['boss', 'boss2', 'boss3', 'herald', 'asker']) ENEMIES[id].kit = true;

// New Game+ (0.45): the Unmade wears your old face. It fights with your old class's moves, and in its
// later phases with the wish's own (the same as Maren's). These are kits only: the boss is still boss3.
const WISH_LATE = ENEMIES.boss3.attacks.filter((a) => a.phase >= 2);
const OLD = (cls, moves) => ({ name: 'The Unmade', type: 'oldself_' + cls, attacks: [...moves, ...WISH_LATE, ...CHASE_KIT({ size: 1.2, pace: 0.88, dmg: 30 })] });
export const OLD_SELVES = {
  warrior: OLD('warrior', [
    { name: 'combo1', shape: 'arc', trigger: 5, range: 5.2, angle: 2.4, windup: 0.75, recover: 0, dmg: 30, parryable: true, lockAt: 0.25, chain: 'combo2', weight: 3, fx: 'oath' },
    { name: 'combo2', shape: 'arc', trigger: 99, range: 5.2, angle: 2.4, windup: 0.5, recover: 1.0, dmg: 30, parryable: true, lockAt: 0.2 },
    { name: 'slam', shape: 'circle', leap: true, trigger: 14, radius: 5.5, offset: 0, windup: 1.1, recover: 1.4, dmg: 60, parryable: false, lockAt: 0.3, cd: 8, fx: 'oath' },
    { name: 'whirl', shape: 'ring', trigger: 6, radius: 5, inner: 0.6, windup: 1.0, recover: 1.2, dmg: 44, parryable: false, lockAt: 0, cd: 7, fx: 'oath' },
    { name: 'charge', shape: 'rect', trigger: 14, min: 5, length: 12, width: 2.4, windup: 0.8, recover: 1.2, dmg: 40, parryable: false, lockAt: 0.25, chargeDur: 0.35, cd: 6 },
  ]),
  archer: OLD('archer', [
    { name: 'combo1', shape: 'shot', trigger: 20, windup: 0.6, recover: 0.5, dmg: 24, parryable: true, lockAt: 0.1, speed: 26, count: 3, spread: 0.3, weight: 3, fx: 'gold' },
    { name: 'slam', shape: 'beam', trigger: 22, length: 22, width: 1.6, windup: 1.1, recover: 1.0, dmg: 60, parryable: false, lockAt: 0.3, cd: 7, fx: 'gold' },
    { name: 'storm', shape: 'rain', scatter: 6, trigger: 20, windup: 0.9, recover: 1.0, dmg: 30, parryable: false, lockAt: 0, count: 8, gap: 0.12, fall: 0.8, radius: 2.2, cd: 9, fx: 'gold' },
    { name: 'volley', shape: 'shot', around: true, trigger: 8, windup: 0.8, recover: 1.0, dmg: 22, parryable: true, lockAt: 0, speed: 16, count: 12, spread: 0, cd: 8, fx: 'gold' },
  ]),
  rogue: OLD('rogue', [
    { name: 'combo1', shape: 'arc', trigger: 16, range: 3, angle: 1.8, windup: 0.5, recover: 0, dmg: 28, parryable: true, lockAt: 0.15, blink: 2, chain: 'combo2', weight: 3, fx: 'oath' },
    { name: 'combo2', shape: 'arc', trigger: 99, range: 3, angle: 1.8, windup: 0.35, recover: 0.9, dmg: 28, parryable: true, lockAt: 0.1 },
    { name: 'slam', shape: 'shot', around: true, trigger: 10, windup: 0.7, recover: 1.0, dmg: 22, parryable: true, lockAt: 0, speed: 18, count: 14, spread: 0, cd: 7, fx: 'oath' },
    { name: 'lotus', shape: 'circle', trigger: 5, radius: 4.6, offset: 0, windup: 0.9, recover: 1.1, dmg: 46, parryable: false, lockAt: 0, cd: 7, fx: 'oath' },
    { name: 'rites', shape: 'rect', trigger: 14, min: 4, length: 11, width: 1.8, windup: 0.7, recover: 1.2, dmg: 52, parryable: false, lockAt: 0.3, chargeDur: 0.25, cd: 8 },
  ]),
  mage: OLD('mage', [
    { name: 'combo1', shape: 'shot', trigger: 18, windup: 0.7, recover: 0.6, dmg: 30, parryable: true, lockAt: 0.1, speed: 18, count: 1, spread: 0, pool: POOL('ember', 2, 3, 0.2), weight: 3, fx: 'ember' },
    { name: 'slam', shape: 'rain', trigger: 22, windup: 0.9, recover: 1.2, dmg: 64, parryable: false, lockAt: 0, count: 1, gap: 0, fall: 1.3, radius: 4.5, cd: 8, fx: 'ember' },
    { name: 'orb', shape: 'shot', trigger: 18, windup: 1.0, recover: 1.0, dmg: 34, parryable: false, lockAt: 0, speed: 5, count: 1, spread: 0, seek: 1.2, life: 6, cd: 9, fx: 'frost' },
    { name: 'wake', shape: 'circle', trigger: 16, radius: 3.6, offset: 0, windup: 0.8, recover: 1.0, dmg: 40, parryable: false, lockAt: 0, blink: 3, cd: 7, fx: 'star' },
  ]),
};
for (const k in OLD_SELVES) {
  const d = OLD_SELVES[k];
  d.attackByName = {};
  for (const a of d.attacks) d.attackByName[a.name] = a;
  d.chainOnly = new Set(d.attacks.map((a) => a.chain).filter(Boolean));
}

/** The arena's bosses take turns: wave 5 The Warden, 10 The Mycelord, 15 The Unmade, 20 The Warden ... */
export const BOSSES = ['boss', 'boss2', 'boss3'];

for (const key in ENEMIES) {
  const def = ENEMIES[key];
  def.type = key;
  def.attackByName = {};
  for (const a of def.attacks) def.attackByName[a.name] = a;
  def.chainOnly = new Set(def.attacks.map((a) => a.chain).filter(Boolean)); // moves only ever used as a follow-up
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
/**
 * Fight near your own level (0.49): a kill pays 10x EXP when the enemy is within 3 levels of you, sliding
 * down to 2x at 10 or more levels apart (above or below), never less. CONFIG.EXP_PACE is 4 to match, so
 * at-level fighting levels you about 2.5x faster than before and fighting far off level about 2x slower.
 */
export const LEVEL_BAND = { full: 3, far: 10, top: 10, least: 2 };
export function levelBandMult(gap) {
  const g = Math.abs(gap || 0);
  if (g <= LEVEL_BAND.full) return LEVEL_BAND.top;
  if (g >= LEVEL_BAND.far) return LEVEL_BAND.least;
  return LEVEL_BAND.top - ((LEVEL_BAND.top - LEVEL_BAND.least) * (g - LEVEL_BAND.full)) / (LEVEL_BAND.far - LEVEL_BAND.full);
}

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
