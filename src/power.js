// Combat Power: a feel-good number that grows as a hero gets stronger (levels, gear,
// talents, a subclass, Immortal effects). It is only shown, never used by the rules.
//
//   Might    how hard you hit: attack damage, attack speed, crits and ability haste.
//   Resolve  how much you can take: health, armor, damage reduction and lifesteal.
//   Combat Power = Might^0.85 x Resolve^0.15: mostly how hard you hit, with toughness
//   counting too. Tanks shine in their own rating, Resolve.
import { CONFIG } from './config.js';

// How each subclass's trait shows up in the two ratings (on top of the stats it changes).
// Tanky traits count toward Resolve, damage traits toward Might.
const TRAIT = {
  berserker: [1.1, 1.1], // more damage while Bloodied, but also less taken and a Last Breath
  bulwark: [1.0, 1.25], // red attacks blocked, Hold the Line: a tank, so its pride is Resolve
  windrunner: [1.12, 1.04],
  sharpshooter: [1.14, 1.0],
  assassin: [1.12, 1.02],
  shadowdancer: [1.12, 1.02],
  pyromancer: [1.14, 1.0],
  frostbinder: [1.1, 1.06], // freezes keep enemies off you
};

// Classes that do most of their damage with abilities rather than basic attacks (the Mage's
// basic attacks only deal 60%) would look weaker than they play without this.
const CLASS_MIGHT = { warrior: 1, archer: 1, rogue: 1.05, mage: 1.32 };

/**
 * Ratings without anything temporary (Evasive Roll's burst of speed, Hurricane, Blood Rage's
 * Bloodied bonus, this run's augments), so the number only moves when the hero really grows.
 */
export function steadyRatings(world, swap = null) {
  const p = world.player;
  if (!world.recalcStats || !p.stats) return ratings(world);
  // Work it out on the side, then put back exactly what was there (stats, modifiers, kit, health).
  const keep = { rushT: p.rushT, slipT: p.slipT, hurricaneT: p.hurricaneT, bloodied: p.bloodied, hp: p.hp, stats: p.stats };
  const saved = { augments: world.augments, mods: world.mods, kit: world.kit };
  const slot = swap && swap.slot;
  const worn = slot ? p.equipped[slot] : null;
  try {
    p.rushT = p.slipT = p.hurricaneT = 0;
    p.bloodied = false;
    p.stats = Object.assign({}, p.stats);
    world.augments = [];
    if (slot) p.equipped[slot] = swap;
    world.recalcStats();
    return ratings(world);
  } finally {
    if (slot) p.equipped[slot] = worn;
    Object.assign(p, keep);
    Object.assign(world, saved);
  }
}

export function ratings(world) {
  const p = world.player;
  const s = p.stats || {};
  const m = world.mods || {};
  if (!s.ad || !s.maxHp) return { cp: 0, might: 0, resolve: 0 };
  const crit = Math.min(100, s.crit || 0) / 100;
  const critF = 1 + crit * ((world.critMultiplier ? world.critMultiplier() : 1.75) - 1);
  const basicMult = (world.basic && world.basic.mult) || 1;
  const offense = s.ad * critF * (0.5 * s.as * basicMult + 0.5 * (1 + (s.haste || 0) / 100));
  const taken = Math.max(0.3, 1 - (m.dmgTaken || 0));
  const leech = Math.min(s.lifesteal || 0, CONFIG.LIFESTEAL_CAP) / 100;
  const ehp = ((s.maxHp * (1 + (s.armor || 0) / 100)) / taken) * (1 + leech * 1.5);
  const [tm, tr] = (p.spec && TRAIT[p.spec]) || [1, 1];
  let imm = 1;
  for (const slot in p.equipped) if (p.equipped[slot] && p.equipped[slot].effect) imm *= 1.05; // Immortal effects
  const might = Math.round(offense * 16 * tm * imm * (CLASS_MIGHT[world.cls] || 1));
  const resolve = Math.round((ehp / 2) * tr * imm);
  // Combat Power leans toward Might (how fast you clear things); Resolve still counts,
  // and tanks show it off in their own Resolve rating.
  return { cp: Math.round(Math.pow(might, 0.85) * Math.pow(resolve, 0.15)), might, resolve };
}

/** The ratings if `item` were worn instead of what is in its slot now (the world is left as it was). */
export function ratingsWith(world, item) {
  return steadyRatings(world, item);
}

/** "+1,234" or "−56" */
export function signed(n) {
  return (n >= 0 ? '+' : '−') + Math.abs(n).toLocaleString();
}
