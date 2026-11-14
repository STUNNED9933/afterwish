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
  { n: 1, numeral: 'I', name: 'The Road', hp: 1, dmg: 1, exp: 1, loot: 1, elite: 0.03, affixes: 1, minRarity: 0 },
  { n: 2, numeral: 'II', name: 'The Unwished', hp: 2.2, dmg: 1.5, exp: 1.6, loot: 1.5, elite: 0.1, affixes: 1, minRarity: 1 },
  { n: 3, numeral: 'III', name: 'Hollow Stars', hp: 3.6, dmg: 1.9, exp: 2.4, loot: 2, elite: 0.14, affixes: 2, minRarity: 2 },
  { n: 4, numeral: 'IV', name: 'The Unmaking', hp: 6, dmg: 2.5, exp: 3.4, loot: 2.6, elite: 0.18, affixes: 2, minRarity: 3 },
  { n: 5, numeral: 'V', name: 'Afterwish', hp: 9.5, dmg: 3.2, exp: 4.6, loot: 3.2, elite: 0.22, affixes: 3, minRarity: 3 },
];
export const MAX_TIER = TIERS.length - 1;
/** Elites only start showing up on tier I from this map level (the first maps stay gentle). */
export const ELITE_FROM_LEVEL = 20;

/**
 * Elite modifiers. An elite has more health, hits a little harder, is bigger, and pays three
 * times the EXP and gold plus an extra piece of gear. Each modifier changes how you fight it.
 */
export const AFFIXES = {
  vampiric: { name: 'Vampiric', color: 0xd0303a, desc: 'Heals 4% of its health each time it hits you.' },
  frostbound: { name: 'Frostbound', color: 0x9fe6ff, desc: 'Its hits chill you: 35% slower for 2 seconds.' },
  reflective: { name: 'Reflective', color: 0xe8e4dc, desc: 'Sends 20% of your basic attack damage back at you. Abilities are safe.' },
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
  might: { name: 'Might', each: 0.6, unit: '% attack damage', apply: (m, n) => { m.adPct += 0.006 * n; } },
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
