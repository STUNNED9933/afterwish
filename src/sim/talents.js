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
    blurb: 'Strongest on the edge of falling. Spend your own blood to drop below half health, then stay there: every hit you take could be the last.',
    perk: {
      name: 'Blood Rage',
      desc: 'Below half health you are Bloodied: +15% damage, +20% attack speed and 15% less damage taken. While Bloodied, lifesteal stops just below half health so it keeps you there, and once every 30 seconds a blow that would kill you leaves you at 1 health instead. Cleave and Whirlwind cost 4% of your maximum health (never below 10%). Skyfall becomes Crimson Oath.',
      apply: (m) => { m.bloodRage = true; m.lowHpDmg += 0.15; m.bloodAs += 0.2; m.bloodCost = Math.max(m.bloodCost, 0.04); m.bloodGuard = Math.max(m.bloodGuard, 0.15); m.bloodCap = true; m.bloodSave = Math.max(m.bloodSave, 30); },
    },
    kit: {
      r: {
        key: 'R', name: 'Crimson Oath', type: 'frenzy', icon: 'frenzy', unlock: 6, cd: 50, radius: 4.5, duration: 6, hpTo: 0.4,
        dmg: (s, lvl) => 1.4 * s.ad + 25 + 7 * lvl,
        desc: 'Cut yourself open: drop to 40% health at once (if you are above it) with a roar that damages everything near you. For 6 seconds you cannot fall below 1 health and your lifesteal is doubled.',
      },
    },
    talents: [
      { id: 'bz_haste', row: 'minor', name: 'Red Haze', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'bz_might', row: 'minor', name: 'Ash Fever', max: 5, desc: (r) => `+${2 * r}% attack damage.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'bz_leech', row: 'minor', name: 'Red Thirst', max: 5, desc: (r) => `While Bloodied, +${r}% lifesteal (over the usual cap).`, apply: (m, r) => { m.bloodLeech += r; } },
      { id: 'bz_whirl', row: 'major', name: 'Rampage', max: 3, desc: (r) => `Whirlwind deals ${10 * r}% more damage and its cooldown is ${6 * r}% shorter.`, apply: (m, r) => { m.wDmg *= 1 + 0.1 * r; m.wCd *= 1 - 0.06 * r; } },
      { id: 'bz_reckless', row: 'major', name: 'Reckless', max: 3, desc: (r) => `While Bloodied, deal a further ${8 * r}% damage and attack ${5 * r}% faster.`, apply: (m, r) => { m.lowHpDmg += 0.08 * r; m.bloodAs += 0.05 * r; } },
      { id: 'bz_cap', row: 'capstone', name: "Executioner's Rhythm", max: 1, desc: () => 'Cleave strikes a second time for 40% damage, and a Cleave kill resets its cooldown.', apply: (m) => { m.qEcho = Math.max(m.qEcho, 0.4); m.qResetOnKill = true; } },
    ],
  },
  bulwark: {
    cls: 'warrior', name: 'Bulwark',
    blurb: 'The wall the party stands behind. Drags enemies into one place for the others to hit, makes them look only at you, and parries for the whole group.',
    perk: {
      name: "The Warden's Call",
      desc: 'Whirlwind drags enemies to you instead of pushing them away, stuns normal enemies for a moment, and makes everything it hits fight you for 3 seconds. Iron Answer: your parry also blocks red attacks no one else can parry. A blocked red attack does no harm, and whoever threw it is Broken: stunned for 1.5 seconds (bosses take two posture hits) and 20% more damage taken for 4 seconds. Skyfall becomes Hold the Line.',
      apply: (m) => { m.wPull = true; m.wStun = Math.max(m.wStun, 0.35); m.wTaunt = Math.max(m.wTaunt, 3); m.blockRed = true; },
    },
    kit: {
      r: {
        key: 'R', name: 'Hold the Line', type: 'bastion', icon: 'bastion', unlock: 6, cd: 45, radius: 8, duration: 5, dr: 0.35, taunt: 4, stun: 0.75,
        dmg: (s, lvl) => 1.4 * s.ad + 30 + 8 * lvl,
        desc: 'Slam your shield down: everything within 8 m is dragged to you, stunned for a moment (not bosses) and must fight you for 4 seconds. For 5 seconds you and every friend within 8 m of you take 35% less damage.',
      },
    },
    talents: [
      { id: 'bw_armor', row: 'minor', name: 'Iron Skin', max: 5, desc: (r) => `+${4 * r}% armor.`, apply: (m, r) => { m.armorPct += 0.04 * r; } },
      { id: 'bw_vigor', row: 'minor', name: 'Vigor', max: 5, desc: (r) => `+${2 * r}% maximum health.`, apply: (m, r) => { m.hpPct += 0.02 * r; } },
      { id: 'bw_guard', row: 'minor', name: 'Steady Guard', max: 5, desc: (r) => `Your parry window is ${4 * r}% longer.`, apply: (m, r) => { m.parryWindow *= 1 + 0.04 * r; } },
      { id: 'bw_tide', row: 'major', name: 'Gravity Well', max: 3, desc: (r) => `Whirlwind reaches ${10 * r}% further and stuns ${(0.1 * r).toFixed(1)} seconds longer. It now drags and stuns heavy enemies too (never bosses).`, apply: (m, r) => { m.wRadius *= 1 + 0.1 * r; m.wStun += 0.1 * r; m.wPullHeavy = true; } },
      { id: 'bw_wall', row: 'major', name: 'Shield Wall', max: 3, desc: (r) => `Your parry also catches attacks aimed at friends within ${2 + r} m of you, and a parried melee hit strikes back for ${50 * r}% attack damage.`, apply: (m, r) => { m.guardRange = Math.max(m.guardRange, 2 + r); m.riposte = Math.max(m.riposte, 0.5 * r); } },
      { id: 'bw_cap', row: 'capstone', name: 'Bastion', max: 1, desc: () => 'Take 12% less damage. A perfect parry heals you and every friend within 8 m for 5% of their maximum health.', apply: (m) => { m.dmgTaken += 0.12; m.parryHeal += 0.05; m.allyParryHeal = Math.max(m.allyParryHeal, 0.05); } },
    ],
  },

  // ------------------------------------------------------------------- Archer
  sharpshooter: {
    cls: 'archer', name: 'Sharpshooter',
    blurb: 'One arrow, one problem solved, from further away than anyone else. The further the target, the harder it hits: stay behind your front line, or keep your distance on your own.',
    perk: {
      name: 'Long Watch',
      desc: 'Your hits deal 4% more for every metre between you and the target past the first 2, up to 40% more (about 30% at your normal range). Damage numbers turn gold at long range.',
      apply: (m) => { m.farShot = Math.max(m.farShot, 0.04); m.farShotMax = Math.max(m.farShotMax, 0.4); },
    },
    kit: {
      r: {
        key: 'R', name: 'Deadeye', type: 'deadeye', icon: 'deadeye', unlock: 6, cd: 40, range: 40, width: 1.3, shots: 3, window: 8, lastMult: 1.5,
        dmg: (s, lvl) => 1.5 * s.ad + 25 + 7 * lvl,
        desc: 'Take aim: for 8 seconds, R fires a shot across the whole map at your cursor (up to 3 shots). Each stops in the first enemy it meets and always crits; the third deals 50% more. Long Watch makes the far ones hurt most.',
      },
    },
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
    blurb: 'Never where the blow lands. Roll, and the wind is at your back: every arrow hits harder and brings the next roll sooner. Hurricane turns every shot into three.',
    perk: {
      name: 'Tailwind',
      desc: "After Evasive Roll, for as long as its attack speed bonus lasts, you have Tailwind: every basic attack (Barrage arrows too) deals extra damage on hit equal to 30% attack damage plus 2 per level, and takes 0.3 seconds off Evasive Roll's cooldown. The faster you attack, the more it adds up. Arrow Storm becomes Hurricane.",
      apply: (m) => { m.tailwind = Math.max(m.tailwind, 0.3); m.tailwindCdr = Math.max(m.tailwindCdr, 0.3); },
    },
    kit: {
      r: {
        key: 'R', name: 'Hurricane', type: 'hurricane', icon: 'hurricane', unlock: 6, cd: 55, duration: 6, as: 0.4, extra: 2, extraMult: 0.45,
        dmg: () => 0,
        desc: 'Call up a gale for 6 seconds: you attack 40% faster, have Tailwind the whole time, and every basic attack also looses 2 arrows at other enemies nearby for 45% damage. Evasive Roll is ready again at once.',
      },
    },
    talents: [
      { id: 'wr_fleet', row: 'minor', name: 'Fleet', max: 5, desc: (r) => `+${1.5 * r}% move speed.`, apply: (m, r) => { m.msPct += 0.015 * r; } },
      { id: 'wr_hands', row: 'minor', name: 'Quick Hands', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'wr_roll', row: 'minor', name: 'Light Step', max: 5, desc: (r) => `Evasive Roll cooldown is ${4 * r}% shorter.`, apply: (m, r) => { m.eCd *= 1 - 0.04 * r; } },
      { id: 'wr_volley', row: 'major', name: 'Rolling Barrage', max: 3, desc: (r) => `Barrage looses ${r} more arrow${r > 1 ? 's' : ''}, and each deals ${5 * r}% more.`, apply: (m, r) => { m.wExtra += r; m.wDmg *= 1 + 0.05 * r; } },
      { id: 'wr_shot', row: 'major', name: 'Flurry', max: 3, desc: (r) => `Evasive Roll's attack speed bonus is ${10 * r}% higher and lasts ${0.5 * r} seconds longer.`, apply: (m, r) => { m.eRush += 0.1 * r; m.eRushTime += 0.5 * r; } },
      { id: 'wr_cap', row: 'capstone', name: 'Eye of the Storm', max: 1, desc: () => 'Hurricane lasts 2 seconds longer and its cooldown is 20% shorter, and Tailwind adds a further 10% attack damage on hit.', apply: (m) => { m.rDuration += 2; m.rCd *= 0.8; m.tailwind += 0.1; } },
    ],
  },

  // -------------------------------------------------------------------- Rogue
  assassin: {
    cls: 'rogue', name: 'Assassin',
    blurb: 'Clears the road one throat at a time. Brutal Mercy Strokes, heavier crits, and Last Rites that chains from kill to kill: the subclass for farming.',
    talents: [
      { id: 'as_eye', row: 'minor', name: 'Find the Gap', max: 5, desc: (r) => `+${2 * r}% crit chance.`, apply: (m, r) => { m.crit += 2 * r; } },
      { id: 'as_deadly', row: 'minor', name: 'Twist the Knife', max: 5, desc: (r) => `Crits deal a further ${4 * r}% damage.`, apply: (m, r) => { m.critMult += 0.04 * r; } },
      { id: 'as_might', row: 'minor', name: 'Honed Edge', max: 5, desc: (r) => `+${2 * r}% attack damage.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'as_back', row: 'major', name: 'Cheap Shot', max: 3, desc: (r) => `Mercy Stroke deals a further ${20 * r}% from behind or on a stunned enemy.`, apply: (m, r) => { m.qBehind += 0.2 * r; } },
      { id: 'as_mark', row: 'major', name: 'Contract', max: 3, desc: (r) => `Last Rites deals ${10 * r}% more damage and its cooldown is ${8 * r}% shorter.`, apply: (m, r) => { m.rDmg *= 1 + 0.1 * r; m.rCd *= 1 - 0.08 * r; } },
      { id: 'as_cap', row: 'capstone', name: 'Chain Kill', max: 1, desc: () => 'A Last Rites kill resets its cooldown completely.', apply: (m) => { m.rResetOnKill = true; } },
    ],
  },
  shadowdancer: {
    cls: 'rogue', name: 'Shadowdancer',
    blurb: 'Fights from two places at once. Nightstep leaves an afterimage you can trade places with, every afterimage throws your kunai, and Last Rites makes a boss die twice over. Built for long fights against one big enemy.',
    perk: {
      name: 'Afterimage',
      desc: 'Nightstep leaves an afterimage of you where you stood for 5 seconds: press E again to trade places with it. Fan of Knives becomes Starglass Kunai, and every afterimage throws one too, aimed at your cursor. A kunai stops at the first enemy it hits; a second one on the same enemy deals 60%.',
      apply: (m) => { m.shadowStep = true; m.shadowDur = Math.max(m.shadowDur, 5); },
    },
    kit: {
      w: {
        key: 'W', name: 'Starglass Kunai', type: 'kunai', icon: 'kunai', unlock: 2, cd: 7, range: 11, speed: 26, width: 1.1, repeat: 0.6,
        dmg: (s, lvl) => 1.05 * s.ad + 10 + 4 * lvl,
        desc: 'Throw a kunai of starglass toward your cursor. It stops in the first enemy it hits. Each of your afterimages throws one too, at the same spot, so aim where they cross: a second kunai on the same enemy deals 60%.',
      },
    },
    talents: [
      { id: 'sd_fleet', row: 'minor', name: 'Soft Shoes', max: 5, desc: (r) => `+${1.5 * r}% move speed.`, apply: (m, r) => { m.msPct += 0.015 * r; } },
      { id: 'sd_hands', row: 'minor', name: 'Flurry', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'sd_leech', row: 'minor', name: 'Slow to Fade', max: 5, desc: (r) => `Afterimages last ${(0.4 * r).toFixed(1)} seconds longer and Starglass Kunai deals ${4 * r}% more.`, apply: (m, r) => { m.shadowDur += 0.4 * r; m.wDmg *= 1 + 0.04 * r; } },
      { id: 'sd_fan', row: 'major', name: 'Mirrored Cut', max: 3, desc: (r) => `When you Mercy Stroke, each afterimage cuts the enemy nearest it for ${15 * r + 15}% of Mercy Stroke's damage.`, apply: (m, r) => { m.shadowSlash = Math.max(m.shadowSlash, 0.15 * r + 0.15); } },
      { id: 'sd_bleed', row: 'major', name: 'Second Death', max: 3, desc: (r) => `Nothing here stays down, so make it fall twice. Last Rites marks its target, and 3 seconds later it takes ${10 * r + 5}% of all the damage you dealt it in that time, again.`, apply: (m, r) => { m.rMark = Math.max(m.rMark, 0.1 * r + 0.05); } },
      { id: 'sd_cap', row: 'capstone', name: 'Crowd of One', max: 1, desc: () => 'Last Rites leaves an afterimage where you leapt from, Second Death repeats a further 15%, and Nightstep comes back 20% sooner.', apply: (m) => { m.rShadow = true; m.rMark += 0.15; m.eCd *= 0.8; } },
    ],
  },

  // --------------------------------------------------------------------- Mage
  pyromancer: {
    cls: 'mage', name: 'Pyromancer',
    blurb: 'Everything burns, and keeps burning. Stack fire on your enemies, make the burns bite harder, and leave the ground itself on fire.',
    perk: {
      name: 'Everything Burns',
      desc: "Fire Bolt and your basic attacks set their target burning. Burns stack up to 5 times and last 4 seconds; a new stack renews them all. Each stack burns for 15% spell power plus 1.5 per level every second, and grows with Fire Bolt's rank. Frozen Orb becomes Smoulder and Meteor becomes Cinderfall.",
      apply: (m) => { m.qBurn = Math.max(m.qBurn, 1); m.basicBurn = 1; m.burnPerStack = Math.max(m.burnPerStack, 0.15); m.burnPerLevel = Math.max(m.burnPerLevel, 1.5); m.burnMax = Math.max(m.burnMax, 5); m.burnTime = Math.max(m.burnTime, 4); m.smoulderAmp = Math.max(m.smoulderAmp, 0.5); },
    },
    kit: {
      w: {
        key: 'W', name: 'Smoulder', type: 'smoulder', icon: 'smoulder', unlock: 2, cd: 8, range: 12, radius: 3.5,
        dmg: (s, lvl) => 0.7 * s.ad + 10 + 4 * lvl,
        desc: 'Throw a cinder at your cursor. Everything in the burst catches 2 stacks of burn and Smoulders for 5 seconds: burns on a Smouldering enemy deal 50% more.',
      },
      r: {
        key: 'R', name: 'Cinderfall', type: 'meteor', icon: 'r', unlock: 6, cd: 38, range: 13, radius: 5.5, delay: 0.9, stun: 0.5,
        burnZone: { time: 4, tick: 0.5, stacks: 1 },
        dmg: (s, lvl) => 3.2 * s.ad + 70 + 16 * lvl,
        desc: 'Call down a burning star on your cursor. It lands after a moment for heavy damage, and leaves the ground on fire for 4 seconds: everything standing in it gains a burn stack every half second.',
      },
    },
    talents: [
      { id: 'py_power', row: 'minor', name: 'Kindling', max: 5, desc: (r) => `+${2 * r}% spell power.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'py_crit', row: 'minor', name: 'Slow Burn', max: 5, desc: (r) => `Burns last ${(0.3 * r).toFixed(1)} seconds longer and deal ${4 * r}% more.`, apply: (m, r) => { m.burnTime += 0.3 * r; m.burnMult *= 1 + 0.04 * r; } },
      { id: 'py_haste', row: 'minor', name: 'Quick Burn', max: 5, desc: (r) => `+${3 * r} ability haste.`, apply: (m, r) => { m.haste += 3 * r; } },
      { id: 'py_ball', row: 'major', name: 'Fireball', max: 3, desc: (r) => `Fire Bolt deals ${8 * r}% more damage and bursts ${15 * r}% wider.`, apply: (m, r) => { m.qDmg *= 1 + 0.08 * r; m.qRadius *= 1 + 0.15 * r; } },
      { id: 'py_burn', row: 'major', name: 'Wildfire', max: 3, desc: (r) => `When a burning enemy dies, its burn jumps to the ${r} nearest enem${r > 1 ? 'ies' : 'y'} within 5 m, every stack of it.`, apply: (m, r) => { m.burnSpread = Math.max(m.burnSpread, r); } },
      { id: 'py_cap', row: 'capstone', name: 'Second Sun', max: 1, desc: () => 'One second after Cinderfall lands, the ground erupts again for 50% damage. Cinderfall is 15% wider, and Fire Bolt adds 2 burn stacks instead of 1.', apply: (m) => { m.rAftershock = Math.max(m.rAftershock, 0.5); m.rRadius *= 1.15; m.qBurn = Math.max(m.qBurn, 2); } },
    ],
  },
  frostbinder: {
    cls: 'mage', name: 'Frostbinder',
    blurb: 'Pile Hoarfrost on everything, then watch it Shatter: frozen solid, cut open, and the shards spread the cold to whatever stands nearby. A wall of ice keeps the rest away.',
    perk: {
      name: 'Hoarfrost',
      desc: "Ice Bolt, Frozen Orb, Starwake's motes and your basic attacks build Hoarfrost on enemies. At 6 stacks the enemy Shatters: it takes heavy damage that grows with Ice Bolt's rank, freezes solid for 1 second (heavy enemies 0.4 s; bosses turn Brittle instead and take 15% more damage for 4 s), and the shards give 2 Hoarfrost to enemies within 3 m. Frozen Orb comes back 20% sooner. Fire Bolt becomes Ice Bolt and Meteor becomes Rimewall.",
      apply: (m) => { m.frostMax = 6; m.basicFrost = 1; m.qFrost = Math.max(m.qFrost, 2); m.orbFrost = 1; m.moteFrost = 1; m.wCd *= 0.8; },
    },
    kit: {
      q: {
        key: 'Q', name: 'Ice Bolt', type: 'bolt', icon: 'icebolt', ice: true, unlock: 1, cd: 2.6, range: 14, speed: 26, splash: 1.8, splashMult: 0.5,
        dmg: (s, lvl) => 1.45 * s.ad + 16 + 5 * lvl,
        desc: 'Hurl a shard of ice at your cursor. It gives the first enemy 2 Hoarfrost and splinters into those nearby for 50% damage and 1 Hoarfrost.',
      },
      r: {
        key: 'R', name: 'Rimewall', type: 'wall', icon: 'wall', unlock: 6, cd: 32, range: 10, length: 8, duration: 5, stun: 1.2,
        dmg: (s, lvl) => 2.4 * s.ad + 40 + 10 * lvl,
        desc: 'Raise a wall of ice across your cursor for 5 seconds. Nothing can walk through it, and enemy shots that hit it fly back and Shatter what they hit. When it melts it bursts, damaging everything beside it and giving it 3 Hoarfrost.',
      },
    },
    talents: [
      { id: 'fb_vigor', row: 'minor', name: 'Bitter Cold', max: 5, desc: (r) => `Shatter deals ${6 * r}% more damage.`, apply: (m, r) => { m.frostDmg *= 1 + 0.06 * r; } },
      { id: 'fb_armor', row: 'minor', name: 'Biting Wind', max: 5, desc: (r) => `+${2 * r}% spell power.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'fb_haste', row: 'minor', name: 'Clear Mind', max: 5, desc: (r) => `+${3 * r} ability haste.`, apply: (m, r) => { m.haste += 3 * r; } },
      { id: 'fb_nova', row: 'major', name: 'Wide Winter', max: 3, desc: (r) => `Frozen Orb is ${8 * r}% bigger and its cooldown is ${8 * r}% shorter.`, apply: (m, r) => { m.wRadius *= 1 + 0.08 * r; m.wCd *= 1 - 0.08 * r; } },
      { id: 'fb_freeze', row: 'major', name: 'Splintering Cold', max: 3, desc: (r) => `Shatter freezes ${15 * r}% longer and its shards reach ${(0.5 * r).toFixed(1)} m further.`, apply: (m, r) => { m.frostFreeze *= 1 + 0.15 * r; m.frostReach += 0.5 * r; } },
      { id: 'fb_cap', row: 'capstone', name: 'Heart of Frostfall', max: 1, desc: () => 'Enemies Shatter at 5 Hoarfrost instead of 6. Rimewall is 40% longer and stands 2 seconds longer.', apply: (m) => { m.frostMax = Math.min(m.frostMax || 5, 5); m.wallLen *= 1.4; m.wallDur += 2; } },
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
