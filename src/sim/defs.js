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
    icon: 'cleave', // (1.3)
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
    icon: 'whirl', // (1.3)
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
    icon: 'breakthrough', // (1.3)
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
    icon: 'skyfall', // (1.3)
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
// The Asker, again (0.54, Act III): the first of six Primordials, and it fights like one. Far more health,
// and three new answers: Unasked (a circle that, if it catches you, seals the last skill you used for 6 s),
// Every Wish at Once (wishlings that give it what it wants), and below half health, the Answer.
Object.assign(ENEMIES.asker, { hp: 5600, exp: 520, title: 'Wanting, the first of six' });
ENEMIES.asker.attacks.push(
  { name: 'unasked', shape: 'circle', trigger: 16, radius: 3.6, offset: 0, at: 'target', windup: 1.1, recover: 1.0, dmg: 40, parryable: false, lockAt: 0, seal: 6, cd: 9, fx: 'gold' },
  CALL('everywish', { summon: { type: 'wishling', count: 4, max: 6 }, cd: 22 }),
  { name: 'answer', shape: 'ring', trigger: 14, radius: 11, inner: 4, windup: 1.4, recover: 1.2, dmg: 60, parryable: false, lockAt: 0, hpBelow: 0.5, cd: 8, fx: 'gold' },
  { name: 'granted2', shape: 'shot', around: true, trigger: 22, windup: 0.8, recover: 1.0, dmg: 22, parryable: true, lockAt: 0, speed: 10, count: 22, spread: 0, seek: 0.8, life: 4, hpBelow: 0.5, cd: 9, fx: 'gold' },
);

// --- Act III: the Primordials and the Deep (0.54) ---------------------------------------------
// Five more of the oldest things in the world, equals of the star: neither cruel nor kind, only what the
// world does, given a will. Each waits at the bottom of its Depth (sim/endgame.js DEEP, maps.js deep6..10).
const PRIMORDIAL = (name, title, colors, hp, more) => ({
  name, model: 'boss', look: { scale: 1.3, colors }, title,
  hp, speed: 3.1, radius: 1.7, height: 4.4, heavy: true, boss: true, primordial: true, exp: 560, poise: 5, parryStun: 3.5, drop: 1, cost: 0, ai: 'boss', atkCd: [0.6, 1.0],
  attacks: [], ...more,
});
Object.assign(ENEMIES, {
  cinder: PRIMORDIAL('The Cinder', 'Ending', [0x2a1a14, 0xff7a2a, 0x0c0806], 6000),
  undertow: PRIMORDIAL('The Undertow', 'Forgetting', [0x0c2a30, 0x3ac0c0, 0x041014], 6400),
  rootmother: PRIMORDIAL('The Rootmother', 'Growing', [0x2a2014, 0x9ad06a, 0x100c08], 7200),
  choir: PRIMORDIAL('The Choir', 'Remembering', [0xd8e8f0, 0xc8e8ff, 0x1c2430], 6800),
  stillness: PRIMORDIAL('The Stillness', 'Enough', [0xd8d4e0, 0x1a1828, 0x08080c], 8000),
  // Their own: the mountain's dead, changed by each Depth
  ashwalker: { ...ENEMIES.brute, name: 'Ashwalker', look: { scale: 1.0, colors: [0x2a1a14, 0xff7a2a, 0x0c0806] }, exp: 60, drop: 0.5 },
  unnamed: { ...ENEMIES.grunt, name: 'The Unnamed', look: { scale: 1.05, colors: [0x2a3a40, 0x8ab0b8, 0x0c1418] }, hp: 90, exp: 40, drop: 0.35 },
  rootbound: { ...ENEMIES.knight, name: 'Rootbound', look: { scale: 0.66, colors: [0x3a3020, 0x9ad06a, 0x14100c] }, hp: 190, exp: 50, drop: 0.45 },
  echo: { ...ENEMIES.knight, name: 'Echo', look: { scale: 0.6, colors: [0xd8e8f0, 0xc8e8ff, 0x1c2430] }, hp: 130, speed: 4.4, exp: 50, drop: 0.45 },
  hush: { ...ENEMIES.wraith, name: 'Hush', look: { scale: 1.3, colors: [0x2a2834, 0x0c0a14] }, hp: 80, exp: 45, drop: 0.35 },
  // (0.84) the Tide's stranger children (they only come to the Wishkeep: their numbers are its FOES)
  thief: { ...ENEMIES.wishthief, name: 'Ember Thief', look: { scale: 0.75, colors: [0x2a2420, 0xff9a3a, 0x0c0806] }, exp: 0, drop: 0, tideOnly: true, thief: false },
  cinderling: { ...ENEMIES.imp, name: 'Cinderling', look: { scale: 0.55, colors: [0x1a1410, 0xff7a2a, 0xffc070] }, exp: 0, drop: 0, tideOnly: true },
  veilbearer: { ...ENEMIES.shaman, name: 'Veilbearer', look: { scale: 1.15, colors: [0x14101c, 0x8a6aff] }, exp: 0, drop: 0, tideOnly: true },
  gatebreaker: { ...ENEMIES.golem, name: 'Gatebreaker', look: { scale: 1.45, colors: [0x3a3a40, 0x8a6aff] }, exp: 0, drop: 0, tideOnly: true },
  mourner: { ...ENEMIES.wraith, name: 'Mourner', look: { scale: 1.15, colors: [0x18141c, 0xb08aff] }, exp: 0, drop: 0, tideOnly: true },
  // (0.92) the deep Nights' own
  oathbreaker: { ...ENEMIES.knight, name: 'Oathbreaker', look: { scale: 1.2, colors: [0x1a1424, 0xc04a6a, 0x08060c] }, exp: 0, drop: 0, tideOnly: true },
  gloamwing: { ...ENEMIES.wraith, name: 'Gloamwing', look: { scale: 0.9, colors: [0x101830, 0x6a9aff] }, exp: 0, drop: 0, tideOnly: true },
  rotmother: { ...ENEMIES.golem, name: 'Rotmother', look: { scale: 1.3, colors: [0x2a3018, 0x9ac040, 0x0c1008] }, exp: 0, drop: 0, tideOnly: true },
  rotling: { ...ENEMIES.grunt, name: 'Rotling', look: { scale: 0.7, colors: [0x2a3018, 0x9ac040, 0x0c1008] }, exp: 0, drop: 0, tideOnly: true },
  // (0.98) the Eternal trial: a choir of eyes from the far sky, and its lesser eyes (their AI is the trial's own)
  unblinking: { name: 'Omnividens', model: 'watcher', hp: 1, speed: 3.2, radius: 1.8, height: 5.2, heavy: true, boss: true, exp: 0, drop: 0, cost: 0, ai: 'boss', poise: 6, parryStun: 2, atkCd: [1, 1], attacks: [], tideOnly: true, title: 'The All-Seeing Truth' },
  eyelet: { name: 'Vigil', model: 'eyelet', hp: 1, speed: 5.2, radius: 0.6, height: 2.2, exp: 0, drop: 0, cost: 0, ai: 'melee', attacks: [], tideOnly: true },
  tidecaller: { ...ENEMIES.boss3, name: 'The Tidecaller', look: { scale: 1.3, colors: [0x0c1a2e, 0x8a6aff, 0x04080c] }, exp: 0, drop: 0, tideOnly: true, boss: false },
});
// The Cinder: the ash-fever was its breath. It does not hate you. It is only very late.
ENEMIES.cinder.attacks = [
  ...BOSS_BASE({ size: 1.3, pace: 0.85, dmg: 34, slam: 8.5, shots: 11, spread: 2, shotSpeed: 13 }).map((a) => (a.name === 'slam' ? { ...a, pool: POOL('ash', 4, 5, 0.2), fx: 'ash' } : a)),
  { name: 'fever', shape: 'shot', around: true, trigger: 18, windup: 1.0, recover: 1.0, dmg: 20, parryable: true, lockAt: 0, speed: 7, count: 14, spread: 0, seek: 0.5, life: 5, cd: 9, fx: 'ember' },
  { name: 'ashfall', shape: 'rain', scatter: 9, trigger: 26, windup: 0.9, recover: 1.0, dmg: 30, parryable: false, lockAt: 0, count: 9, gap: 0.14, fall: 0.9, radius: 2.4, pool: POOL('ash', 2.2, 5, 0.2), cd: 10, fx: 'ash' },
  { name: 'banked', shape: 'beam', cross: true, trigger: 16, length: 16, width: 2.6, windup: 1.2, recover: 1.2, dmg: 52, parryable: false, lockAt: 0.6, cd: 9, fx: 'ember' },
  { name: 'lastbreath', shape: 'circle', trigger: 14, radius: 7, offset: 0, windup: 1.8, recover: 1.6, dmg: 80, parryable: false, lockAt: 0, pull: 4, hpBelow: 0.5, cd: 12, fx: 'ember' },
  CALL('kindle', { summon: { type: 'ashwalker', count: 2, max: 3 }, hpBelow: 0.75, cd: 24 }),
  ...CHASE_KIT({ size: 1.3, pace: 0.85, dmg: 34 }),
];
// The Undertow: the low water the fever came up with. It took the first city's name and wants yours.
ENEMIES.undertow.attacks = [
  ...BOSS_BASE({ size: 1.3, pace: 0.9, dmg: 32, slam: 8, shots: 9, spread: 1.8, shotSpeed: 12 }),
  { name: 'tide', shape: 'beam', trigger: 20, length: 20, width: 4.2, windup: 1.2, recover: 1.3, dmg: 50, parryable: false, lockAt: 0.3, cd: 8, fx: 'tears' },
  { name: 'lowwater', shape: 'ring', trigger: 10, radius: 10, inner: 3, windup: 1.3, recover: 1.2, dmg: 44, parryable: false, lockAt: 0, pool: POOL('tears', 3, 4, 0.12, { slow: 0.6 }), cd: 9, fx: 'tears' },
  { name: 'drown', shape: 'circle', trigger: 14, radius: 5, offset: 0, windup: 1.6, recover: 1.5, dmg: 62, parryable: false, lockAt: 0, pull: 4.4, cd: 12, fx: 'tears' },
  { name: 'forget', shape: 'circle', trigger: 16, radius: 3.4, offset: 0, at: 'target', windup: 1.0, recover: 1.0, dmg: 36, parryable: false, lockAt: 0, seal: 5, hpBelow: 0.6, cd: 10, fx: 'tears' },
  CALL('nameless', { summon: { type: 'unnamed', count: 3, max: 5 }, cd: 22 }),
  ...CHASE_KIT({ size: 1.3, pace: 0.9, dmg: 32 }),
];
// The Rootmother: growth, which is why things rot. Tobin's cure was her touch.
ENEMIES.rootmother.attacks = [
  ...BOSS_BASE({ size: 1.35, pace: 0.95, dmg: 34, slam: 9, shots: 8, spread: 1.6, shotSpeed: 10 }).map((a) => (a.name === 'slam' ? { ...a, pool: POOL('spore', 4.5, 5, 0.18), fx: 'spore' } : a)),
  { name: 'roots', shape: 'rain', line: true, trigger: 20, windup: 0.8, recover: 1.1, dmg: 38, parryable: false, lockAt: 0.1, count: 8, gap: 0.16, fall: 0.7, radius: 2.4, cd: 8, fx: 'rot' },
  { name: 'thicket', shape: 'ring', trigger: 9, radius: 9, inner: 3.5, windup: 1.3, recover: 1.3, dmg: 48, parryable: false, lockAt: 0, cd: 9, fx: 'rot' },
  { name: 'bloom', shape: 'rain', scatter: 8, trigger: 22, windup: 1.0, recover: 1.1, dmg: 24, parryable: false, lockAt: 0, count: 7, gap: 0.15, fall: 1.0, radius: 2.4, pool: POOL('spore', 2.4, 6, 0.2), cd: 11, fx: 'spore' },
  { name: 'embrace', shape: 'circle', trigger: 14, radius: 5.5, offset: 0, windup: 1.7, recover: 1.6, dmg: 70, parryable: false, lockAt: 0, pull: 4, hpBelow: 0.6, cd: 13, fx: 'rot' },
  CALL('grow', { summon: { type: 'rootbound', count: 2, max: 3 }, heal: 0.03, hpBelow: 0.7, cd: 24 }),
  ...CHASE_KIT({ size: 1.35, pace: 0.95, dmg: 34 }),
];
// The Choir: every voice the mountain ever lost, still singing. It sings yours back to you.
ENEMIES.choir.attacks = [
  ...BOSS_BASE({ size: 1.25, pace: 0.85, dmg: 32, slam: 8, shots: 13, spread: 2.6, shotSpeed: 15 }),
  { name: 'chorus', shape: 'shot', around: true, trigger: 20, windup: 0.9, recover: 1.0, dmg: 20, parryable: true, lockAt: 0, speed: 11, count: 20, spread: 0, cd: 8, fx: 'glass' },
  { name: 'refrain', shape: 'beam', cross: true, trigger: 16, length: 16, width: 2.2, windup: 1.1, recover: 1.1, dmg: 50, parryable: false, lockAt: 0.6, cd: 8, fx: 'glass' },
  { name: 'requiem', shape: 'ring', trigger: 12, radius: 11, inner: 5, windup: 1.4, recover: 1.2, dmg: 56, parryable: false, lockAt: 0, cd: 10, fx: 'star' },
  { name: 'recall', shape: 'rain', trigger: 28, windup: 0.6, recover: 0.9, dmg: 34, parryable: false, lockAt: 0, count: 10, gap: 0.2, fall: 0.8, radius: 2.3, hpBelow: 0.6, cd: 8, fx: 'star' },
  CALL('echoes', { summon: { type: 'echo', count: 2, max: 4 }, cd: 20 }),
  ...CHASE_KIT({ size: 1.25, pace: 0.85, dmg: 32 }),
];
// The Stillness: Enough, the counterweight to Wanting. It asks what you do not want.
ENEMIES.stillness.attacks = [
  ...BOSS_BASE({ size: 1.3, pace: 0.8, dmg: 36, slam: 9, shots: 12, spread: 2.2, shotSpeed: 14 }),
  { name: 'hush', shape: 'circle', trigger: 16, radius: 8, offset: 0, windup: 2.0, recover: 1.6, dmg: 90, parryable: false, lockAt: 0, pull: 5, cd: 12, fx: 'oath' },
  { name: 'quiet', shape: 'ring', trigger: 12, radius: 12, inner: 4.5, windup: 1.4, recover: 1.2, dmg: 60, parryable: false, lockAt: 0, cd: 9, fx: 'oath' },
  { name: 'nothing', shape: 'beam', cross: true, trigger: 18, length: 18, width: 2.8, windup: 1.2, recover: 1.2, dmg: 58, parryable: false, lockAt: 0.6, cd: 9, fx: 'oath' },
  { name: 'enough', shape: 'circle', trigger: 18, radius: 3.8, offset: 0, at: 'target', windup: 1.0, recover: 1.0, dmg: 44, parryable: false, lockAt: 0, seal: 6, hpBelow: 0.5, cd: 9, fx: 'oath' },
  CALL('stillmore', { summon: { type: 'hush', count: 3, max: 5 }, cd: 22 }),
  ...CHASE_KIT({ size: 1.3, pace: 0.8, dmg: 36 }),
];
for (const id of ['boss', 'boss2', 'boss3', 'herald', 'asker', 'cinder', 'undertow', 'rootmother', 'choir', 'stillness']) ENEMIES[id].kit = true;
// The Granted (0.64, docs/design/mastery.md): the ones whose wishes the star answered completely, and who
// became the answer. They live in Caelum, above the Starwell. Their great attacks are Dominions (gold
// telegraphs, `dominion: true`): with the Animus their map asks, a perfect parry turns one; short of it,
// only a near-frame-perfect one does, and one that lands takes most of your health and Mind-Locks you
// (world.js hitPlayer). `lock`: a smaller Mind-Lock riding on an ordinary blow.
const DOM = (more) => ({ parryable: true, dominion: true, lockAt: 0, fx: 'gold', ...more });
const GRANTED_BOSS = (name, title, colors, hp, more) => ({
  name, model: 'boss', look: { scale: 1.25, colors }, title,
  hp, speed: 3.2, radius: 1.6, height: 4.2, heavy: true, boss: true, granted: true, exp: 700, poise: 5, parryStun: 3.2, drop: 1, cost: 0, ai: 'boss', atkCd: [0.5, 0.9],
  attacks: [], ...more,
});
Object.assign(ENEMIES, {
  answered: {
    name: 'The Answered', model: 'boss', look: { scale: 0.64, colors: [0xf2ead8, 0xd8b25a, 0x3a2a14] }, granted: true,
    hp: 180, speed: 3.5, radius: 0.85, height: 2.3, exp: 70, poise: 2, parryStun: 2.4, drop: 0.45, cost: 2.5, ai: 'melee', atkCd: [0.6, 1.0],
    attacks: [
      { name: 'thrust', shape: 'arc', trigger: 3.2, range: 3.8, angle: 1.2, windup: 0.6, recover: 0, dmg: 18, parryable: true, lockAt: 0.2, chain: 'sweep', weight: 2 },
      { name: 'sweep', shape: 'arc', trigger: 99, range: 3.4, angle: 2.6, windup: 0.45, recover: 1.0, dmg: 18, parryable: true, lockAt: 0.2, lock: 0.5 },
      DOM({ name: 'kneel', shape: 'circle', trigger: 4, radius: 4.4, offset: 0, windup: 1.2, recover: 1.3, dmg: 16, cd: 8 }),
    ],
  },
  cantor: {
    name: 'Cantor', model: 'spitter', look: { scale: 1.1, colors: [0xf2ead8, 0xe8c27a] }, granted: true,
    hp: 85, speed: 3.4, radius: 0.55, height: 2.1, exp: 60, poise: 1, parryStun: 1.6, drop: 0.35, cost: 2, ai: 'ranged', band: [9, 13], atkCd: [0.9, 1.5],
    attacks: [
      { name: 'note', shape: 'shot', trigger: 14, windup: 0.7, recover: 1.0, dmg: 14, parryable: true, lockAt: 0.1, speed: 13, count: 3, spread: 0.35, weight: 2, fx: 'gold' },
      DOM({ name: 'hymn', shape: 'circle', at: 'target', trigger: 15, radius: 3.2, offset: 0, windup: 1.3, recover: 1.2, dmg: 14, cd: 9 }),
    ],
  },
  thurifer: {
    name: 'Thurifer', model: 'spitter', look: { scale: 1.2, colors: [0xe8dcc0, 0xc89a4a] }, granted: true,
    hp: 110, speed: 2.8, radius: 0.6, height: 2.2, exp: 60, poise: 1, parryStun: 1.8, drop: 0.35, cost: 2, ai: 'ranged', band: [6, 10], atkCd: [1.1, 1.8],
    grants: { every: 5, range: 9, time: 5, dmg: 1.3 }, // its incense gives the Granted near it what they want: 30% more damage
    attacks: [
      { name: 'censer', shape: 'arc', trigger: 3, range: 3.2, angle: 2.2, windup: 0.7, recover: 1.0, dmg: 16, parryable: true, lockAt: 0.2, weight: 1 },
      { name: 'incense', shape: 'rain', scatter: 6, trigger: 12, windup: 0.9, recover: 1.2, dmg: 18, parryable: false, lockAt: 0, count: 4, gap: 0.2, fall: 1.0, radius: 2.2, lock: 0.6, cd: 7, weight: 2, fx: 'gold' },
    ],
  },
  colossus: {
    name: 'Gilded Colossus', model: 'brute', look: { scale: 1.3, colors: [0xf2ead8, 0xd8b25a] }, granted: true,
    hp: 420, speed: 2.3, radius: 1.35, height: 3.3, heavy: true, exp: 110, poise: 3, parryStun: 3, drop: 0.6, cost: 3.5, ai: 'melee', atkCd: [0.8, 1.3],
    attacks: [
      { name: 'fist', shape: 'arc', trigger: 3.4, range: 3.8, angle: 1.8, windup: 0.8, recover: 1.1, dmg: 26, parryable: true, lockAt: 0.25, lock: 0.7, weight: 2 },
      DOM({ name: 'weight', shape: 'circle', trigger: 5, radius: 6, offset: 0, windup: 1.5, recover: 1.6, dmg: 22, cd: 9 }),
    ],
  },
  veiled: {
    name: 'The Veiled', model: 'stalker', look: { scale: 1.1, colors: [0xf8f4ea, 0xd8b25a] }, granted: true,
    hp: 110, speed: 5.0, radius: 0.6, height: 1.6, exp: 65, poise: 1, parryStun: 1.8, drop: 0.4, cost: 2, ai: 'melee', atkCd: [0.5, 0.9],
    attacks: [
      { name: 'cut', shape: 'arc', trigger: 2.6, range: 2.9, angle: 1.6, windup: 0.42, recover: 0, dmg: 15, parryable: true, lockAt: 0.15, chain: 'cut2', weight: 2 },
      { name: 'cut2', shape: 'arc', trigger: 99, range: 2.9, angle: 1.6, windup: 0.32, recover: 0.8, dmg: 15, parryable: true, lockAt: 0.12 },
      DOM({ name: 'unseen', shape: 'circle', at: 'target', blink: 2.2, trigger: 10, radius: 2.6, offset: 0, windup: 0.9, recover: 1.1, dmg: 14, cd: 8 }),
    ],
  },
  wishmote: { ...ENEMIES.wishling, name: 'Wish-mote', look: { scale: 0.6, colors: [0xfff8e0, 0xffd870] }, granted: true, hp: 60, exp: 30, drop: 0.2 },
  // The four who keep Caelum, one at the end of each map
  ianitor: GRANTED_BOSS('Ianitor', 'the Doorkeeper', [0xf2ead8, 0xd8b25a, 0x2a2014], 9000),
  arbiter: GRANTED_BOSS('The Arbiter', 'of Answers', [0xe8e0cc, 0xc8a050, 0x1c1810], 10000),
  desiderium: GRANTED_BOSS('Desiderium', 'the Want', [0xf8f0e0, 0xf0b860, 0x2a1810], 11000),
  fiat: GRANTED_BOSS('Fiat', 'the Answer', [0xffffff, 0xffe8a0, 0x302810], 13000, { radius: 1.8, height: 4.6 }),
});
// Ianitor: the door between the Starwell and the sky. One face sees you come, the other sees you leave.
ENEMIES.ianitor.attacks = [
  ...BOSS_BASE({ size: 1.25, pace: 0.9, dmg: 36, slam: 8, shots: 10, spread: 1.8, shotSpeed: 13 }),
  DOM({ name: 'turnkey', shape: 'circle', trigger: 14, radius: 7, offset: 0, windup: 1.4, recover: 1.4, dmg: 22, cd: 10 }),
  DOM({ name: 'shut', shape: 'arc', trigger: 6, range: 7, angle: 3.4, windup: 1.1, recover: 1.2, dmg: 20, cd: 7 }),
  { name: 'doors', shape: 'rain', scatter: 8, trigger: 22, windup: 0.9, recover: 1.1, dmg: 28, parryable: false, lockAt: 0, count: 7, gap: 0.16, fall: 0.9, radius: 2.4, lock: 0.6, cd: 9, fx: 'gold' },
  CALL('keepers', { summon: { type: 'answered', count: 2, max: 3 }, hpBelow: 0.7, cd: 24 }),
  // (0.71) a hundred lives deep: quick, hard, and harder as they go (GRANTED_FAST)
  DOM({ name: 'latch', shape: 'arc', trigger: 7, range: 7.5, angle: 2.6, windup: 0.5, recover: 0.2, dmg: 46, chain: 'latch2', cd: 6, weight: 1.6 }),
  DOM({ name: 'latch2', shape: 'arc', trigger: 99, range: 7.5, angle: 2.6, windup: 0.4, recover: 0.2, dmg: 46, chain: 'latch3' }),
  { name: 'latch3', shape: 'circle', trigger: 99, radius: 6, offset: 0, windup: 0.5, recover: 0.9, dmg: 70, parryable: false, lockAt: 0, fx: 'gold' },
  { name: 'threshold', shape: 'beam', cross: true, trigger: 20, length: 22, width: 3, windup: 0.6, recover: 0.8, dmg: 80, parryable: false, lockAt: 0.4, lock: 0.5, cd: 8, hpBelow: 0.75, fx: 'gold' },
  { name: 'everydoor', shape: 'rain', scatter: 9, trigger: 24, windup: 0.5, recover: 0.8, dmg: 60, parryable: false, lockAt: 0, count: 12, gap: 0.08, fall: 0.5, radius: 2.6, lock: 0.4, cd: 9, hpBelow: 0.5, fx: 'gold' },
  ...CHASE_KIT({ size: 1.25, pace: 0.9, dmg: 36 }),
];
// The Arbiter: every wish is a question, and it gives every question an answer, whether you like it or not.
ENEMIES.arbiter.attacks = [
  ...BOSS_BASE({ size: 1.25, pace: 0.9, dmg: 38, slam: 8.5, shots: 11, spread: 2, shotSpeed: 14 }),
  DOM({ name: 'verdict', shape: 'arc', trigger: 7, range: 8, angle: 1.4, windup: 1.0, recover: 1.2, dmg: 22, cd: 6 }),
  DOM({ name: 'sentence', shape: 'circle', at: 'target', trigger: 18, radius: 3.6, offset: 0, windup: 1.1, recover: 1.1, dmg: 20, cd: 8 }),
  { name: 'scales', shape: 'ring', trigger: 10, radius: 10, inner: 3.5, windup: 1.3, recover: 1.2, dmg: 44, parryable: false, lockAt: 0, lock: 0.8, cd: 9, fx: 'gold' },
  CALL('chorus', { summon: { type: 'cantor', count: 2, max: 4 }, cd: 22 }),
  // (0.71)
  DOM({ name: 'gavel', shape: 'circle', at: 'target', trigger: 20, radius: 3.2, offset: 0, windup: 0.5, recover: 0.15, dmg: 50, chain: 'gavel2', cd: 6, weight: 1.6 }),
  DOM({ name: 'gavel2', shape: 'circle', at: 'target', trigger: 99, radius: 3.2, offset: 0, windup: 0.4, recover: 0.15, dmg: 50, chain: 'gavel3' }),
  { name: 'gavel3', shape: 'circle', at: 'target', trigger: 99, radius: 4.5, offset: 0, windup: 0.4, recover: 0.9, dmg: 80, parryable: false, lockAt: 0, fx: 'gold' },
  { name: 'judgement', shape: 'ring', trigger: 12, radius: 13, inner: 4, windup: 0.6, recover: 0.8, dmg: 85, parryable: false, lockAt: 0, lock: 0.5, cd: 8, hpBelow: 0.75, fx: 'gold' },
  { name: 'objection', shape: 'shot', around: true, trigger: 20, windup: 0.5, recover: 0.8, dmg: 40, parryable: true, lockAt: 0, speed: 16, count: 24, spread: 0, life: 4, cd: 9, hpBelow: 0.5, fx: 'gold' },
  ...CHASE_KIT({ size: 1.25, pace: 0.9, dmg: 38 }),
];
// Desiderium: what was left over when every want was met. It still wants.
ENEMIES.desiderium.attacks = [
  ...BOSS_BASE({ size: 1.25, pace: 0.95, dmg: 40, slam: 9, shots: 14, spread: 2.4, shotSpeed: 13 }),
  DOM({ name: 'grasp', shape: 'circle', trigger: 14, radius: 6.5, offset: 0, pull: 4.5, windup: 1.6, recover: 1.5, dmg: 24, cd: 11 }),
  DOM({ name: 'reach', shape: 'arc', trigger: 6, range: 7.5, angle: 2.4, windup: 0.9, recover: 1.1, dmg: 20, cd: 6 }),
  { name: 'covet', shape: 'rain', trigger: 22, windup: 0.8, recover: 1.0, dmg: 26, parryable: false, lockAt: 0, count: 6, gap: 0.2, fall: 0.8, radius: 2.2, lock: 0.5, cd: 8, fx: 'gold' },
  { name: 'hunger', shape: 'shot', around: true, trigger: 18, windup: 1.0, recover: 1.0, dmg: 20, parryable: true, lockAt: 0, speed: 8, count: 16, spread: 0, seek: 0.4, life: 5, cd: 10, fx: 'gold' },
  CALL('wanting', { summon: { type: 'veiled', count: 2, max: 3 }, hpBelow: 0.75, cd: 22 }),
  // (0.71)
  { name: 'take', shape: 'circle', trigger: 16, radius: 9, offset: 0, pull: 6, windup: 0.7, recover: 0.1, dmg: 30, parryable: false, lockAt: 0, chain: 'devour', cd: 8, weight: 1.4, fx: 'gold' },
  DOM({ name: 'devour', shape: 'circle', trigger: 99, radius: 4.2, offset: 0, windup: 0.45, recover: 1.0, dmg: 90 }),
  { name: 'craving', shape: 'shot', around: true, trigger: 22, windup: 0.5, recover: 0.8, dmg: 38, parryable: true, lockAt: 0, speed: 14, count: 12, spread: 0, seek: 1.2, life: 5, cd: 9, hpBelow: 0.75, fx: 'gold' },
  { name: 'more', shape: 'rain', scatter: 10, trigger: 24, windup: 0.45, recover: 0.8, dmg: 58, parryable: false, lockAt: 0, count: 14, gap: 0.07, fall: 0.45, radius: 2.4, lock: 0.4, cd: 9, hpBelow: 0.5, fx: 'gold' },
  ...CHASE_KIT({ size: 1.25, pace: 0.95, dmg: 40 }),
];
// Fiat: let it be done. The answer to every wish ever made on the mountain, and it has never once said no.
ENEMIES.fiat.attacks = [
  ...BOSS_BASE({ size: 1.3, pace: 0.95, dmg: 44, slam: 9.5, shots: 14, spread: 2.4, shotSpeed: 15 }),
  DOM({ name: 'letitbe', shape: 'circle', trigger: 16, radius: 8.5, offset: 0, windup: 1.6, recover: 1.6, dmg: 26, cd: 11 }),
  DOM({ name: 'decree', shape: 'circle', at: 'target', trigger: 20, radius: 3.8, offset: 0, windup: 1.0, recover: 1.0, dmg: 22, cd: 7 }),
  DOM({ name: 'amen', shape: 'arc', trigger: 7, range: 8, angle: 3.0, windup: 1.0, recover: 1.1, dmg: 22, chain: 'amen2', cd: 9 }),
  DOM({ name: 'amen2', shape: 'arc', trigger: 99, range: 8, angle: 3.0, windup: 0.7, recover: 1.3, dmg: 22 }),
  { name: 'granted', shape: 'beam', cross: true, trigger: 18, length: 18, width: 2.8, windup: 1.2, recover: 1.2, dmg: 60, parryable: false, lockAt: 0.6, lock: 0.8, cd: 9, fx: 'gold' },
  CALL('answered', { summon: { type: 'colossus', count: 1, max: 2 }, hpBelow: 0.6, cd: 26 }),
  // (0.71)
  { name: 'fiatlux', shape: 'beam', cross: true, trigger: 22, length: 24, width: 3.2, windup: 0.55, recover: 0.1, dmg: 95, parryable: false, lockAt: 0.4, lock: 0.4, chain: 'fiatlux2', cd: 8, weight: 1.5, fx: 'gold' },
  { name: 'fiatlux2', shape: 'beam', trigger: 99, length: 24, width: 4, windup: 0.45, recover: 0.8, dmg: 95, parryable: false, lockAt: 0.3, lock: 0.4, fx: 'gold' },
  DOM({ name: 'itisdone', shape: 'circle', at: 'target', trigger: 22, radius: 3.6, offset: 0, windup: 0.45, recover: 0.1, dmg: 60, chain: 'itisdone2', cd: 7, hpBelow: 0.75 }),
  DOM({ name: 'itisdone2', shape: 'circle', at: 'target', trigger: 99, radius: 3.6, offset: 0, windup: 0.35, recover: 0.1, dmg: 60, chain: 'itisdone3' }),
  { name: 'itisdone3', shape: 'ring', trigger: 99, radius: 14, inner: 4.5, windup: 0.5, recover: 0.9, dmg: 100, parryable: false, lockAt: 0, fx: 'gold' },
  { name: 'everything', shape: 'shot', around: true, trigger: 22, windup: 0.45, recover: 0.8, dmg: 45, parryable: true, lockAt: 0, speed: 17, count: 28, spread: 0, seek: 0.6, life: 4, cd: 8, hpBelow: 0.5, fx: 'gold' },
  ...CHASE_KIT({ size: 1.3, pace: 0.95, dmg: 44 }),
];
for (const id of ['answered', 'cantor', 'thurifer', 'colossus', 'veiled', 'ianitor', 'arbiter', 'desiderium', 'fiat']) ENEMIES[id].kit = true;


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
  return Math.round(10 * expWorth(level) * (3 + 0.6 * level + 0.015 * level * level) * CONFIG.EXP_PACE * midgameEase(level));
}

/**
 * The middle of the climb (0.54.3): the 40s felt stagnant, so the bar there is shorter. Levels 38 to 48 need
 * 40% less EXP, easing in from 28 and back out by 66, so the climb keeps its pace instead of sagging in the middle.
 */
export const MIDGAME_EASE = { from: 28, full: 38, until: 48, to: 66, cut: 0.4 };
export function midgameEase(level) {
  const E = MIDGAME_EASE;
  const ease = (t) => t * t * (3 - 2 * t);
  let w = 0;
  if (level >= E.full && level <= E.until) w = 1;
  else if (level > E.from && level < E.full) w = ease((level - E.from) / (E.full - E.from));
  else if (level > E.until && level < E.to) w = ease((E.to - level) / (E.to - E.until));
  return 1 - E.cut * w;
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
