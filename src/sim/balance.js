// Class power (0.51): the last step of balancing, one damage multiplier per base class and one per
// subclass (a subclass's stacks on its class's). It scales everything the hero deals: abilities, basic
// attacks, burns, bleeds and procs. Tuned on the boss bench (late game: level 100, Immortals +10 with 5
// stars, 120 Wish points, world tier V, a minute on The Unmade) so that:
//   - every base class is within 70% of the strongest base class;
//   - every subclass is within 70% of the strongest subclass, and the ones built for clearing packs
//     (Assassin, Bulwark the tank) sit at the low end of that, the boss specialists (Shadowdancer,
//     Sharpshooter) at the top.
// Raise or lower a number here to move a class without touching its skills.
// Two tables: up to level 75 (cooldowns still above the 1 s floor), and level 100 (haste past the floor
// turns into damage, which favours some kits far more than others). Between 75 and 100 the two blend.
export const POWER = {
  mid: {
    base: { warrior: 1, archer: 1.05, rogue: 1, mage: 0.9 }, // (0.56.3) 1.55 -> 0.9, measured fairly
    spec: { berserker: 1.52, bulwark: 1.36, sharpshooter: 0.9, windrunner: 1.06, assassin: 0.89, shadowdancer: 1, pyromancer: 0.7, frostbinder: 1.05 },
  },
  late: {
    base: { warrior: 1.6, archer: 1.95, rogue: 1, mage: 1.22 }, // (0.56.3) mage 2.55 -> 1.22: measured fairly (the bench no longer drifts off the map)
    spec: { berserker: 1.79, bulwark: 1.08, sharpshooter: 0.61, windrunner: 1.1, assassin: 1.8, shadowdancer: 0.98, pyromancer: 1.29, frostbinder: 1.54 }, // (0.56.3) assassin 1.71 -> 1.8: within 70% of a fully burning Pyromancer
  },
};

const one = (T, cls, spec) => (T.base[cls] || 1) * ((spec && T.spec[spec]) || 1);
export function classPower(cls, spec, level = 1) {
  const k = Math.min(1, Math.max(0, (level - 75) / 25));
  const a = one(POWER.mid, cls, spec), b = one(POWER.late, cls, spec);
  return a + (b - a) * k;
}
