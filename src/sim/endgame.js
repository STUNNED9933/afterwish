// After The Unmade (0.26): world tiers, elite enemies, Echo Rifts and Wishborne levels.
// Only data and small pure helpers live here; the World (world.js) uses them.

import { CONFIG } from '../config.js';
import { expToNext } from './defs.js';

/**
 * World tiers. Beating The Unmade on a tier unlocks the next. From tier II every map out in
 * the world is level 100, and the tier multiplies enemy health and damage, EXP and loot.
 *   elite:  chance a camp enemy spawns as an elite      affixes: how many modifiers it gets
 *   minRarity: the least rarity any gear drop can be      loot: drop chance multiplier
 */
export const TIERS = [
  null,
  // doom: how much of your max health a boss's Doom takes (0.28); none on tier I, except on someone idle
  { n: 1, numeral: 'I', name: 'The Road', hp: 1, dmg: 1, exp: 1, loot: 1, elite: 0.03, affixes: 1, minRarity: 0, doom: 0 },
  { n: 2, numeral: 'II', name: 'The Unwished', hp: 2.2, dmg: 1.5, exp: 1.6, loot: 1.5, elite: 0.1, affixes: 1, minRarity: 1, doom: 0.25 },
  { n: 3, numeral: 'III', name: 'Hollow Stars', hp: 3.6, dmg: 1.9, exp: 2.4, loot: 2, elite: 0.14, affixes: 2, minRarity: 2, doom: 0.35 },
  { n: 4, numeral: 'IV', name: 'The Unmaking', hp: 6, dmg: 2.5, exp: 3.4, loot: 2.6, elite: 0.18, affixes: 2, minRarity: 3, doom: 0.45 },
  { n: 5, numeral: 'V', name: 'Afterwish', hp: 9.5, dmg: 3.2, exp: 4.6, loot: 3.2, elite: 0.22, affixes: 3, minRarity: 3, doom: 0.6 },
];
export const MAX_TIER = TIERS.length - 1;

/**
 * Doom (0.28): a violet circle under a hero's feet that takes a share of max health, which
 * no armor, parry or block reduces; only walking out or dashing through avoids it. Every boss
 * out in the world casts one now and then from tier II (The Unmade casts two in a row), and
 * any boss casts one on a hero who has stood idle near it for a few seconds, on every tier.
 */
export const DOOM = {
  radius: 3, // m
  warn: 1.6, // seconds from the circle appearing to the hit
  first: 8, // seconds into a fight before the first one
  every: 14, // seconds between them (The Unmade: 11)
  finalEvery: 11,
  second: 0.9, // The Unmade's second circle, at wherever you went
  idle: 4, // seconds without any input near a boss before it Dooms you
  idleAgain: 2.5, // ...and again while you stay idle
  idlePct: 0.15, // the least an idle Doom takes, even on tier I
  idleStep: 0.15, // ...and each idle Doom in a row takes this much more
  range: 26, // a boss only Dooms heroes this close
  rift: (tier) => Math.min(0.6, 0.2 + 0.02 * tier), // rift guardians
};
/** Elites only start showing up on tier I from this map level (the first maps stay gentle). */
export const ELITE_FROM_LEVEL = 20;

/**
 * Elite modifiers. An elite has more health, hits a little harder, is bigger, and pays three
 * times the EXP and gold plus an extra piece of gear. Each modifier changes how you fight it.
 */
export const AFFIXES = {
  vampiric: { name: 'Vampiric', color: 0xd0303a, desc: 'Heals 4% of its health each time it hits you.' },
  frostbound: { name: 'Frostbound', color: 0x9fe6ff, desc: 'Its hits chill you: 35% slower for 2 seconds.' },
  reflective: { name: 'Reflective', color: 0xe8e4dc, desc: 'Sends 20% of your basic attack damage back at you. Crack its mirror: two ability hits (or a Windrunner\'s gusts) shatter it for 6 seconds, and parrying it shatters it at once. While shattered it reflects nothing and takes 20% more damage.' },
  swift: { name: 'Swift', color: 0x7ff5a0, desc: 'Moves 40% faster and winds up its attacks 25% faster.' },
  shielded: { name: 'Shielded', color: 0xf0c45a, desc: 'A shield worth 40% of its health takes damage first. Parry one of its attacks to shatter it at once.' },
  volatile: { name: 'Volatile', color: 0xff8a3a, desc: 'Bursts a moment after it dies. Step out of the circle.' },
};
export const AFFIX_IDS = Object.keys(AFFIXES);
export const ELITE = { hp: 2.6, dmg: 1.25, scale: 1.22, reward: 3 };

/** Echo Rifts: a timed run through a random map. Each tier is tougher than the last. */
export const RIFT = {
  time: 360, // seconds to beat the guardian
  need: 0.7, // share of the rift's enemies (elites count 3) to call the guardian
  guardians: ['boss', 'boss2', 'boss3'],
  themes: ['greenwood', 'fen', 'ridge', 'keep', 'frost', 'dunes', 'hollow', 'spire', 'maw', 'sanctum'],
};
/** Health and damage multipliers for rift tier r (enemies are the party leader's level). */
export function riftScale(r) {
  // Repeated multiplication rather than Math.pow, which browsers may round differently.
  let hp = 1, dmg = 1;
  for (let i = 1; i < r; i++) {
    hp *= 1.17;
    dmg *= 1.075;
  }
  return { hp, dmg };
}

/**
 * Wishborne: past level 100, EXP keeps filling endless Wishborne levels. Each one is a Wish
 * point to put into a small, uncapped bonus.
 */
export const WISH_STATS = {
  // (0.61.8) Might is adaptive: it raises whatever your damage comes from. That is attack damage, or spell
  // power for a Mage (one stat inside the game), and for a Bulwark armor too, which Weight of Iron turns into damage.
  might: {
    name: 'Might', each: 0.6, unit: '% attack damage',
    unitFor: (cls, spec) => (cls === 'mage' ? '% spell power' : spec === 'bulwark' ? '% attack damage and armor' : '% attack damage'),
    apply: (m, n, cls, spec) => { m.adPct += 0.006 * n; if (spec === 'bulwark') m.armorPct += 0.006 * n; },
  },
  vigor: { name: 'Vigor', each: 0.8, unit: '% health', apply: (m, n) => { m.hpPct += 0.008 * n; } },
  swift: { name: 'Swiftness', each: 0.4, unit: '% attack speed', apply: (m, n) => { m.asPct += 0.004 * n; } },
  focus: { name: 'Focus', each: 0.4, unit: ' ability haste', apply: (m, n) => { m.haste += 0.4 * n; } },
  keen: { name: 'Keen Eye', each: 0.3, unit: '% crit chance', apply: (m, n) => { m.crit += 0.3 * n; } },
};
export const WISH_IDS = Object.keys(WISH_STATS);
/** EXP for the next Wishborne level (a little more each time). */
export function wishNeed(w) {
  return Math.round(expToNext(CONFIG.MAX_LEVEL - 1) * 0.6 * (1 + 0.03 * w));
}

/**
 * The Deep (0.54, Act III; docs: the Act III design doc). Five Depths, VI to X, under the world tiers:
 * an optional extreme mode for heroes past tier V. Choosing a Depth changes every map out in the world,
 * as a world tier does (level 100, tier V's numbers times the Depth's own), and gives every enemy an Ember
 * requirement; each Depth also has its Primordial's own domain, reached from the crack under the Starwell.
 *
 * Ember is what a hero has learned from ending: +10 for every rebirth, and up to +5 a Depth from Kindling
 * found there, all kept through rebirth. Your Ember against an enemy's requirement scales what you deal
 * and take (EMBER_CURVE); below half of it every hit you land is 1.
 */
export const DEEP = {
  // Ember from a rebirth (0.54.1; 0.58.2) follows everything you give up: the gear you wear (not the
  // Heirloom, which you keep) and everything in your bag, by its Echo value (rarity, +levels, stars).
  // Square root: a first life's gear (~400) gives about 15, so with The Breath Below's 8 the first
  // rebirth clears Depth VI comfortably; a built set gives 25 to 30, a maxed one up to the cap, so a
  // new Depth opens every rebirth or two.
  emberK: 0.8, // Ember = emberK x sqrt(what you give up)...
  emberMax: 45, // ...up to this from one rebirth
  kindlingMax: 5, // Ember from each Depth's Kindling
  kindling: { normal: 0.004, elite: 0.06, boss: 1 }, // chance a kill there finds one (a Primordial: always)
  level: 100, // the least level to go down
  depths: {
    6: { n: 6, numeral: 'VI', name: 'The Ashen Deep', map: 'deep6', ember: 15, hp: 1.5, dmg: 1.3, exp: 1.3, loot: 1.2, color: 0xff6a2a, primordial: 'cinder', title: 'Ending' },
    7: { n: 7, numeral: 'VII', name: 'The Drowned Court', map: 'deep7', ember: 50, hp: 2.2, dmg: 1.6, exp: 1.6, loot: 1.4, color: 0x3ac0c0, primordial: 'undertow', title: 'Forgetting' },
    8: { n: 8, numeral: 'VIII', name: 'The Undergrowth', map: 'deep8', ember: 85, hp: 3.2, dmg: 2.0, exp: 2.0, loot: 1.6, color: 0x9ad06a, primordial: 'rootmother', title: 'Growing' },
    9: { n: 9, numeral: 'IX', name: 'The Glass Choir', map: 'deep9', ember: 120, hp: 4.5, dmg: 2.5, exp: 2.4, loot: 1.8, color: 0xc8e8ff, primordial: 'choir', title: 'Remembering' },
    10: { n: 10, numeral: 'X', name: 'The Quiet', map: 'deep10', ember: 155, hp: 6.5, dmg: 3.0, exp: 3.0, loot: 2.0, color: 0xb8b0d8, primordial: 'stillness', title: 'Enough' },
  },
};
export const DEPTH_IDS = [6, 7, 8, 9, 10];
// [your Ember / needed, damage you deal, damage you take], straight lines between; below the last, 1 a hit.
export const EMBER_CURVE = [[1.3, 1.25, 0.8], [1, 1, 1], [0.9, 0.7, 1.3], [0.75, 0.35, 1.7], [0.6, 0.1, 2.2], [0.5, 0.04, 3]];

/** Ember a rebirth gives for gear worth `value` (Echo Essence, see rebirth.js essenceFor). */
export function emberForGear(value) {
  return Math.min(DEEP.emberMax, Math.floor(DEEP.emberK * Math.sqrt(Math.max(0, value || 0))));
}

/**
 * Mastery (0.63, docs/design/mastery.md): every Primordial beaten on a class is a point of Mastery for the whole
 * account (5 a class, 20 in all), read from what each class's save keeps through rebirth (rebirth.act3).
 */
export const MASTERY = {
  quests: { deep2: 6, deep3: 7, deep4: 8, deep5: 9, deep6q: 10 }, // the Primordial quests, and their Depths
  classes: ['warrior', 'archer', 'rogue', 'mage'],
  animus: 0.03, // Animus: Mind-Locked 3% shorter for each point...
  animusMax: 0.6, // ...up to 60% (all 20)
  headStart: 0.5, // an alt starts with half the best Ember among the account's other classes
  quest: 'lives', // The Other Lives: the quest that opens it
};
/** The Depths (6 to 10) whose Primordial this rebirth record has beaten. */
export function primordialsOf(rb) {
  const out = [];
  if (rb && rb.act3) for (const id in MASTERY.quests) if (rb.act3[id]) out.push(MASTERY.quests[id]);
  return out.sort((a, b) => a - b);
}
/**
 * What the account's other lives give one hero. `lives` is { cls: { prim: [depths], ember } } for the
 * account's classes (main.js offline, the server online); the hero's own class is read live from `cls`/`rb`.
 */
export function masteryFor(lives, cls, rb) {
  const by = {};
  for (const c of MASTERY.classes) by[c] = c === cls ? primordialsOf(rb) : (lives && lives[c] && Array.isArray(lives[c].prim) ? lives[c].prim.filter((d) => d >= 6 && d <= 10) : []);
  const points = MASTERY.classes.reduce((n, c) => n + new Set(by[c]).size, 0);
  const mastered = MASTERY.classes.filter((c) => by[c].includes(10));
  let best = 0;
  for (const c of MASTERY.classes) if (c !== cls && lives && lives[c]) best = Math.max(best, Math.floor(lives[c].ember || 0));
  const open = !!(rb && rb.act3 && rb.act3[MASTERY.quest]) || MASTERY.classes.some((c) => c !== cls && lives && lives[c] && lives[c].open);
  return { by, points, mastered, open, animus: Math.min(MASTERY.animusMax, MASTERY.animus * points), headStart: Math.floor(best * MASTERY.headStart) };
}

/** A hero's Ember: what each rebirth gave, and Kindling from each Depth (kept in the rebirth record). */
export function emberOf(rb) {
  if (!rb) return 0;
  let n = rb.ember || 0;
  for (const d of DEPTH_IDS) n += Math.min(DEEP.kindlingMax, (rb.kindling && rb.kindling[d]) || 0);
  return n;
}

/** What your Ember does against a requirement: { dealt, taken, one } (one: every hit you land is 1). */
export function emberScale(ember, need) {
  if (!(need > 0)) return { dealt: 1, taken: 1, one: false };
  const r = ember / need;
  const C = EMBER_CURVE;
  if (r >= C[0][0]) return { dealt: C[0][1], taken: C[0][2], one: false };
  const last = C[C.length - 1];
  if (r < last[0]) return { dealt: 0, taken: last[2], one: true };
  for (let i = 1; i < C.length; i++) {
    const [r0, d0, t0] = C[i - 1], [r1, d1, t1] = C[i];
    if (r >= r1) {
      const k = (r - r1) / (r0 - r1);
      return { dealt: d1 + (d0 - d1) * k, taken: t1 + (t0 - t1) * k, one: false };
    }
  }
  return { dealt: last[1], taken: last[2], one: false };
}
