// Subclasses and their talent trees.
//
// At level 15 a hero picks one of two subclasses for its class. From level 16
// it earns a talent point every 4 levels (22 by level 100), which is exactly
// enough to fill the subclass's tree.
//
// A tree has three rows:
//   minor     three talents, 5 ranks each. Small, steady stat gains.
//   major     two talents, 3 ranks each. They change how an ability plays.
//             Open after 5 points are spent.
//   capstone  one talent, 1 rank. The thing the subclass is known for.
//             Opens after 12 points are spent.
//
// Like augments, a talent only changes numbers in `mods` (see sim/augments.js).
// Balance rule of thumb: a full tree is worth roughly a third more power, and
// the two trees of a class get the same budget, one leaning into damage and
// the other into staying alive or controlling the fight.

import { CONFIG } from '../config.js';

const pct = (n) => Math.round(n * 100);

export const SPECS = {
  // ------------------------------------------------------------------ Warrior
  berserker: {
    cls: 'warrior', name: 'Berserker',
    blurb: 'Fights harder the closer it is to falling. Fast swings, stolen health, a Cleave that never stops.',
    talents: [
      { id: 'bz_haste', row: 'minor', name: 'Bloodlust', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'bz_might', row: 'minor', name: 'Savagery', max: 5, desc: (r) => `+${2 * r}% attack damage.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'bz_leech', row: 'minor', name: 'Red Thirst', max: 5, desc: (r) => `+${r}% lifesteal.`, apply: (m, r) => { m.lifesteal += r; } },
      { id: 'bz_whirl', row: 'major', name: 'Rampage', max: 3, desc: (r) => `Whirlwind deals ${10 * r}% more damage and its cooldown is ${6 * r}% shorter.`, apply: (m, r) => { m.wDmg *= 1 + 0.1 * r; m.wCd *= 1 - 0.06 * r; } },
      { id: 'bz_reckless', row: 'major', name: 'Reckless', max: 3, desc: (r) => `Deal ${8 * r}% more damage while below half health.`, apply: (m, r) => { m.lowHpDmg += 0.08 * r; } },
      { id: 'bz_cap', row: 'capstone', name: "Executioner's Rhythm", max: 1, desc: () => 'Cleave strikes a second time for 40% damage, and a Cleave kill resets its cooldown.', apply: (m) => { m.qEcho = Math.max(m.qEcho, 0.4); m.qResetOnKill = true; } },
    ],
  },
  bulwark: {
    cls: 'warrior', name: 'Bulwark',
    blurb: 'The wall. A wider parry, a harder riposte, and armor that makes the big hits survivable.',
    talents: [
      { id: 'bw_armor', row: 'minor', name: 'Iron Skin', max: 5, desc: (r) => `+${4 * r}% armor.`, apply: (m, r) => { m.armorPct += 0.04 * r; } },
      { id: 'bw_vigor', row: 'minor', name: 'Vigor', max: 5, desc: (r) => `+${2 * r}% maximum health.`, apply: (m, r) => { m.hpPct += 0.02 * r; } },
      { id: 'bw_guard', row: 'minor', name: 'Steady Guard', max: 5, desc: (r) => `Your parry window is ${4 * r}% longer.`, apply: (m, r) => { m.parryWindow *= 1 + 0.04 * r; } },
      { id: 'bw_riposte', row: 'major', name: 'Riposte', max: 3, desc: (r) => `Parrying a melee hit strikes the attacker for ${50 * r}% attack damage.`, apply: (m, r) => { m.riposte = Math.max(m.riposte, 0.5 * r); } },
      { id: 'bw_mirror', row: 'major', name: 'Mirror Guard', max: 3, desc: (r) => `Projectiles you send back deal ${30 * r}% more, and time stays slowed ${15 * r}% longer after a perfect parry.`, apply: (m, r) => { m.reflectDmg *= 1 + 0.3 * r; m.slowDur *= 1 + 0.15 * r; } },
      { id: 'bw_cap', row: 'capstone', name: 'Unbreakable', max: 1, desc: () => 'Take 12% less damage. A perfect parry heals you for a further 5% of your maximum health.', apply: (m) => { m.dmgTaken += 0.12; m.parryHeal += 0.05; } },
    ],
  },

  // ------------------------------------------------------------------- Archer
  sharpshooter: {
    cls: 'archer', name: 'Sharpshooter',
    blurb: 'One arrow, one problem solved, from further away than anyone else. Longer range, crits that hit harder, and a Piercing Shot that marks what it touches.',
    talents: [
      { id: 'ss_eye', row: 'minor', name: 'Keen Eye', max: 5, desc: (r) => `+${2 * r}% crit chance.`, apply: (m, r) => { m.crit += 2 * r; } },
      { id: 'ss_draw', row: 'minor', name: 'Longbow', max: 5, desc: (r) => `Your basic attacks reach ${5 * r}% further.`, apply: (m, r) => { m.rangePct += 0.05 * r; } },
      { id: 'ss_deadly', row: 'minor', name: 'Deadly Aim', max: 5, desc: (r) => `Crits deal a further ${4 * r}% damage.`, apply: (m, r) => { m.critMult += 0.04 * r; } },
      { id: 'ss_pierce', row: 'major', name: 'Bodkin Point', max: 3, desc: (r) => `Piercing Shot deals ${10 * r}% more damage and reaches ${5 * r}% further.`, apply: (m, r) => { m.qDmg *= 1 + 0.1 * r; m.qRange *= 1 + 0.05 * r; } },
      { id: 'ss_mark', row: 'major', name: 'Marked Prey', max: 3, desc: (r) => `Enemies hit by Piercing Shot take ${6 * r}% more damage for 4 seconds.`, apply: (m, r) => { m.qSunder = Math.max(m.qSunder, 0.06 * r); } },
      { id: 'ss_cap', row: 'capstone', name: 'Rapid Aim', max: 1, desc: () => 'Steady Aim works on every second basic attack, instead of every third, and your basic attacks reach 10% further.', apply: (m) => { m.critEvery = Math.min(m.critEvery, 2); m.rangePct += 0.1; } },
    ],
  },
  windrunner: {
    cls: 'archer', name: 'Windrunner',
    blurb: 'Never where the blow lands. Quicker feet, a Tumble that turns into a flurry, a bigger Barrage and a longer storm of arrows.',
    talents: [
      { id: 'wr_fleet', row: 'minor', name: 'Fleet', max: 5, desc: (r) => `+${1.5 * r}% move speed.`, apply: (m, r) => { m.msPct += 0.015 * r; } },
      { id: 'wr_hands', row: 'minor', name: 'Quick Hands', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'wr_roll', row: 'minor', name: 'Light Step', max: 5, desc: (r) => `Tumble cooldown is ${4 * r}% shorter.`, apply: (m, r) => { m.eCd *= 1 - 0.04 * r; } },
      { id: 'wr_volley', row: 'major', name: 'Rolling Barrage', max: 3, desc: (r) => `Barrage looses ${r} more arrow${r > 1 ? 's' : ''}, and each deals ${5 * r}% more.`, apply: (m, r) => { m.wExtra += r; m.wDmg *= 1 + 0.05 * r; } },
      { id: 'wr_shot', row: 'major', name: 'Flurry', max: 3, desc: (r) => `Tumble's attack speed bonus is ${10 * r}% higher and lasts ${0.5 * r} seconds longer.`, apply: (m, r) => { m.eRush += 0.1 * r; m.eRushTime += 0.5 * r; } },
      { id: 'wr_cap', row: 'capstone', name: 'Gale', max: 1, desc: () => 'Arrow Storm lasts 1.5 seconds longer and its cooldown is 25% shorter.', apply: (m) => { m.rDuration += 1.5; m.rCd *= 0.75; } },
    ],
  },

  // -------------------------------------------------------------------- Rogue
  assassin: {
    cls: 'rogue', name: 'Assassin',
    blurb: 'Picks one target and ends it. Brutal Backstabs, heavier crits, and a Death Mark that chains.',
    talents: [
      { id: 'as_eye', row: 'minor', name: 'Find the Gap', max: 5, desc: (r) => `+${2 * r}% crit chance.`, apply: (m, r) => { m.crit += 2 * r; } },
      { id: 'as_deadly', row: 'minor', name: 'Twist the Knife', max: 5, desc: (r) => `Crits deal a further ${4 * r}% damage.`, apply: (m, r) => { m.critMult += 0.04 * r; } },
      { id: 'as_might', row: 'minor', name: 'Honed Edge', max: 5, desc: (r) => `+${2 * r}% attack damage.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'as_back', row: 'major', name: 'Cheap Shot', max: 3, desc: (r) => `Backstab deals a further ${20 * r}% from behind or on a stunned enemy.`, apply: (m, r) => { m.qBehind += 0.2 * r; } },
      { id: 'as_mark', row: 'major', name: 'Contract', max: 3, desc: (r) => `Death Mark deals ${10 * r}% more damage and its cooldown is ${8 * r}% shorter.`, apply: (m, r) => { m.rDmg *= 1 + 0.1 * r; m.rCd *= 1 - 0.08 * r; } },
      { id: 'as_cap', row: 'capstone', name: 'Chain Kill', max: 1, desc: () => 'A Death Mark kill resets its cooldown completely.', apply: (m) => { m.rResetOnKill = true; } },
    ],
  },
  shadowdancer: {
    cls: 'rogue', name: 'Shadowdancer',
    blurb: 'In, out, and everything is bleeding. Speed, stolen health, and a Shadowstep that is nearly always ready.',
    talents: [
      { id: 'sd_fleet', row: 'minor', name: 'Soft Shoes', max: 5, desc: (r) => `+${1.5 * r}% move speed.`, apply: (m, r) => { m.msPct += 0.015 * r; } },
      { id: 'sd_hands', row: 'minor', name: 'Flurry', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'sd_leech', row: 'minor', name: 'Bloodletter', max: 5, desc: (r) => `+${r}% lifesteal.`, apply: (m, r) => { m.lifesteal += r; } },
      { id: 'sd_fan', row: 'major', name: 'Wide Fan', max: 3, desc: (r) => `Fan of Knives deals ${10 * r}% more damage in an ${8 * r}% wider circle.`, apply: (m, r) => { m.wDmg *= 1 + 0.1 * r; m.wRadius *= 1 + 0.08 * r; } },
      { id: 'sd_bleed', row: 'major', name: 'Serrated Blade', max: 3, desc: (r) => `Backstab makes its target bleed for ${30 * r}% attack damage over 3 seconds.`, apply: (m, r) => { m.qBleed = Math.max(m.qBleed, 0.3 * r); } },
      { id: 'sd_cap', row: 'capstone', name: 'Dance of Shadows', max: 1, desc: () => 'Shadowstep cooldown is 30% shorter, and the attack after it deals a further 100% damage.', apply: (m) => { m.eCd *= 0.7; m.eEmpower += 1; } },
    ],
  },

  // --------------------------------------------------------------------- Mage
  pyromancer: {
    cls: 'mage', name: 'Pyromancer',
    blurb: 'Everything burns. Bigger Fire Bolts that leave enemies alight, and a Meteor that lands twice.',
    talents: [
      { id: 'py_power', row: 'minor', name: 'Kindling', max: 5, desc: (r) => `+${2 * r}% spell power.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'py_crit', row: 'minor', name: 'Flashpoint', max: 5, desc: (r) => `+${2 * r}% crit chance.`, apply: (m, r) => { m.crit += 2 * r; } },
      { id: 'py_haste', row: 'minor', name: 'Quick Burn', max: 5, desc: (r) => `+${3 * r} ability haste.`, apply: (m, r) => { m.haste += 3 * r; } },
      { id: 'py_ball', row: 'major', name: 'Fireball', max: 3, desc: (r) => `Fire Bolt deals ${8 * r}% more damage and bursts ${15 * r}% wider.`, apply: (m, r) => { m.qDmg *= 1 + 0.08 * r; m.qRadius *= 1 + 0.15 * r; } },
      { id: 'py_burn', row: 'major', name: 'Ignite', max: 3, desc: (r) => `Fire Bolt sets its target burning for ${30 * r}% spell power over 3 seconds.`, apply: (m, r) => { m.qBleed = Math.max(m.qBleed, 0.3 * r); } },
      { id: 'py_cap', row: 'capstone', name: 'Second Sun', max: 1, desc: () => 'One second after Meteor lands, the ground erupts again for 50% damage. Meteor is 15% wider.', apply: (m) => { m.rAftershock = Math.max(m.rAftershock, 0.5); m.rRadius *= 1.15; } },
    ],
  },
  frostbinder: {
    cls: 'mage', name: 'Frostbinder',
    blurb: 'Nothing reaches you. A Frost Nova that freezes solid, a tougher body, and a Blink that bites.',
    talents: [
      { id: 'fb_vigor', row: 'minor', name: 'Cold Blood', max: 5, desc: (r) => `+${2 * r}% maximum health.`, apply: (m, r) => { m.hpPct += 0.02 * r; } },
      { id: 'fb_armor', row: 'minor', name: 'Rime Coat', max: 5, desc: (r) => `+${4 * r}% armor.`, apply: (m, r) => { m.armorPct += 0.04 * r; } },
      { id: 'fb_haste', row: 'minor', name: 'Clear Mind', max: 5, desc: (r) => `+${3 * r} ability haste.`, apply: (m, r) => { m.haste += 3 * r; } },
      { id: 'fb_nova', row: 'major', name: 'Wide Winter', max: 3, desc: (r) => `Frost Nova is ${8 * r}% wider and its cooldown is ${8 * r}% shorter.`, apply: (m, r) => { m.wRadius *= 1 + 0.08 * r; m.wCd *= 1 - 0.08 * r; } },
      { id: 'fb_freeze', row: 'major', name: 'Deep Freeze', max: 3, desc: (r) => `Frost Nova freezes normal enemies solid for ${(0.4 * r).toFixed(1)} seconds.`, apply: (m, r) => { m.wStun = Math.max(m.wStun, 0.4 * r); } },
      { id: 'fb_cap', row: 'capstone', name: 'Absolute Zero', max: 1, desc: () => 'Take 12% less damage. Blink leaves a blast where you stood for 120% spell power.', apply: (m) => { m.dmgTaken += 0.12; m.eBlast = Math.max(m.eBlast, 1.2); } },
    ],
  },
};
for (const id in SPECS) SPECS[id].id = id;
export const SPEC_IDS = Object.keys(SPECS);
/** Points that must already be spent in the tree before a row opens. */
export const ROW_NEED = { minor: 0, major: 5, capstone: 12 };

/** The two subclasses a class can choose between. */
export const specsFor = (cls) => SPEC_IDS.filter((id) => SPECS[id].cls === cls);

/** Talent points a hero of this level has earned in total. */
export function talentPointsAt(level) {
  return level >= CONFIG.TALENT_LEVEL ? Math.floor((level - CONFIG.TALENT_LEVEL) / CONFIG.TALENT_EVERY) + 1 : 0;
}
export { pct };
