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
/** (0.60.2) Hurricane (Windrunner, passive): what each extra arrow deals, and how much more per rank after the first. */
export const HURRICANE = { mult: 0.3, rank: 0.03 };
export const GALE_FORCE = 0.06; // (0.81.4) each arrow +6% damage for every attack a second (see world.js galeForce)

export const SPECS = {
  // ------------------------------------------------------------------ Warrior
  berserker: {
    cls: 'warrior', name: 'Berserker',
    blurb: 'Strongest on the edge of falling. Spend your own blood to drop below half health, then stay there: every hit you take could be the last.',
    perk: {
      name: 'Blood Rage',
      desc: 'Below half health you are Bloodied: +15% damage, +20% attack speed and 15% less damage taken. While Bloodied, lifesteal stops just below half health so it keeps you there, and once every 30 seconds a blow that would kill you leaves you at 1 health instead. Cleave and Whirlwind cost 4% of your maximum health (never below 10%). Red Tempo: Whirlwind becomes a spin you can run with that keeps time with your hands, one beat for every basic attack you could make (from 2 to 10 beats a second), so attack speed makes it spin faster. Crimson Reach: while Bloodied, every swing flies on as a red crescent up to 6 m, cutting everything in its path (within reach of your arm the swing lands as ever and the crescent cuts those behind for 60%), Cleave reaches 35% further and 20% wider, and Whirlwind spins 35% wider. Red Embrace: but up close is where it pays. While Bloodied, your basic attacks, Cleave and Whirlwind deal 30% more to enemies within 3 m. Skyfall becomes Crimson Oath.',
      apply: (m) => { m.spinTempo = true; m.bloodRage = true; m.lowHpDmg += 0.15; m.bloodAs += 0.2; m.bloodCost = Math.max(m.bloodCost, 0.04); m.bloodGuard = Math.max(m.bloodGuard, 0.15); m.bloodCap = true; m.bloodSave = Math.max(m.bloodSave, 30); },
    },
    kit: {
      w: {
        key: 'W', name: 'Whirlwind', type: 'spin', icon: 'w', unlock: 2, cd: 9, radius: 4.2, duration: 2, tick: 0.5, tickMult: 0.22, interrupt: true,
        dmg: (s, lvl) => 1.1 * s.ad + 15 + 5 * lvl,
        desc: 'Spin for 2 seconds while you keep moving, hitting everything around you for 22% on every beat. Red Tempo sets the beat: one for each basic attack you could make in that time (at least 4 beats, at most 20). The first hit interrupts normal enemies. Plough through a pack.',
      },
      r: {
        key: 'R', name: 'Crimson Oath', type: 'frenzy', icon: 'frenzy', unlock: 6, cd: 3, toggleCd: 3, toggle: true, radius: 4.5, duration: 6, hpTo: 0.4,
        dmg: (s, lvl) => 1.4 * s.ad + 25 + 7 * lvl,
        desc: 'A toggle. Turn it on to cut yourself open: drop to 40% health at once (if you are above it) with a roar that damages everything near you. Until you turn it off nothing takes you above 49%, but your lifesteal is 25 times over with no cap (at least 2%), so you live by hitting, Red Embrace rises to 50% more up close, and Crimson Reach burns brighter: crescents fly 9.5 m and cut wider (80% to those behind), Cleave reaches 75% further and 40% wider, and Whirlwind spins 75% wider.',
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
      desc: 'Whirlwind drags enemies to you instead of pushing them away, stuns normal enemies for a moment, and makes everything it hits fight you for 3 seconds. Iron Answer: your parry also blocks red attacks no one else can parry. A blocked red attack does no harm, and whoever threw it is Broken: stunned for 1.5 seconds (bosses take two posture hits) and 20% more damage taken for 4 seconds. Reckoning: every attack you parry or block, and every 10% of your health you lose, is a stack (up to 5); your next Whirlwind deals 25% more per stack. Weight of Iron: 70% of your armor counts as attack damage for your abilities. Skyfall becomes Hold the Line.',
      apply: (m) => { m.ironWeight = Math.max(m.ironWeight, 0.7); m.wPull = true; m.wStun = Math.max(m.wStun, 0.35); m.wTaunt = Math.max(m.wTaunt, 3); m.blockRed = true; m.reckoning = true; },
    },
    kit: {
      r: {
        key: 'R', name: 'Hold the Line', type: 'bastion', icon: 'bastion', unlock: 6, cd: 45, radius: 8, duration: 5, dr: 0.35, taunt: 4, stun: 0.75,
        dmg: (s, lvl) => 1.4 * s.ad + 30 + 8 * lvl,
        desc: 'Slam your shield down: everything within 8 m is dragged right up to you (a boss a fifth of the way), stunned for a moment (not bosses) and must fight you for 4 seconds. For 5 seconds you and every friend within 8 m of you take 35% less damage.',
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
    blurb: 'One arrow, one problem solved. Built for the big fights: breathe, take aim, and put a single shot through a boss from across the map. Ricochet keeps the small fry honest on the way there.',
    perk: {
      name: 'Long Watch',
      desc: 'Your hits deal 4% more for every metre between you and the target past the first 2, up to 40% more (about 30% at your normal range). Damage numbers turn gold at long range. Piercing Shot becomes Ricochet, Barrage becomes Steady Breath, and Arrow Storm becomes Deadeye.',
      apply: (m) => { m.farShot = Math.max(m.farShot, 0.04); m.farShotMax = Math.max(m.farShotMax, 0.4); },
    },
    kit: {
      q: {
        key: 'Q', name: 'Ricochet', type: 'ricochet', icon: 'line', unlock: 1, cd: 6, range: 11, bounces: 3, speed: 42,
        dmg: (s, lvl) => 0.55 * s.ad + 5 + 2 * lvl,
        desc: 'Loose an arrow at the enemy nearest your cursor (up to 11 m). It glances off to the next enemy within 11 m of the last one, and the next, hitting up to 4 different enemies for full damage. Enough to clear a road.',
      },
      w: {
        key: 'W', name: 'Steady Breath', type: 'focus', icon: 'barrage', unlock: 2, cd: 12, time: 6, mult: 1.6,
        dmg: () => 0,
        desc: 'Slow your breathing. Your next ability within 6 seconds deals 60% more and always crits, and your next basic attack is a Steady Aim crit. Breathe before Deadeye.',
      },
      r: {
        key: 'R', name: 'Deadeye', type: 'deadeye', icon: 'deadeye', unlock: 6, cd: 40, range: 44, width: 1.3, channel: 0.5, channelSlow: 0.6, // (0.51) drawn, slowed (0.52: half a second)
        // one shot, multiplied by attacks per second: the faster your hands, the harder the one shot lands
        dmg: (s, lvl) => (2.4 * s.ad + 45 + 12 * lvl) * Math.max(1, s.as || 1),
        desc: 'Draw for half a second (you can walk, slowly), then one shot across the whole map at your cursor. It always crits, its damage is multiplied by your attacks per second, and it pierces up to 3 times: the 2nd enemy takes 70% and is Marked (20% more damage for 5 s), the 3rd takes 50% and is Pinned (stunned 1.5 s; bosses less), the 4th takes 35% and Splinters, shards hitting everything within 3 m for 35%. Long Watch makes a far one hurt most.',
      },
    },
    talents: [
      { id: 'ss_eye', row: 'minor', name: 'Keen Eye', max: 5, desc: (r) => `+${2 * r}% crit chance.`, apply: (m, r) => { m.crit += 2 * r; } },
      { id: 'ss_draw', row: 'minor', name: 'Longbow', max: 5, desc: (r) => `Your basic attacks reach ${5 * r}% further.`, apply: (m, r) => { m.rangePct += 0.05 * r; } },
      { id: 'ss_deadly', row: 'minor', name: 'Deadly Aim', max: 5, desc: (r) => `Crits deal a further ${4 * r}% damage.`, apply: (m, r) => { m.critMult += 0.04 * r; } },
      { id: 'ss_pierce', row: 'major', name: 'Glancing Blow', max: 3, desc: (r) => `Ricochet deals ${10 * r}% more damage and glances off ${r} more enem${r > 1 ? 'ies' : 'y'}.`, apply: (m, r) => { m.qDmg *= 1 + 0.1 * r; m.qBounces += r; } },
      { id: 'ss_mark', row: 'major', name: 'Marked Prey', max: 3, desc: (r) => `Enemies hit by Ricochet take ${6 * r}% more damage for 4 seconds (bosses too: Ricochet, then Deadeye).`, apply: (m, r) => { m.qSunder = Math.max(m.qSunder, 0.06 * r); } },
      { id: 'ss_cap', row: 'capstone', name: 'One Shot', max: 1, desc: () => 'Deadeye deals 25% more, and every Steady Breath takes 5 seconds off its cooldown.', apply: (m) => { m.rDmg *= 1.25; m.focusRcd = Math.max(m.focusRcd, 5); } },
    ],
  },
  windrunner: {
    cls: 'archer', name: 'Windrunner',
    blurb: 'Never where the blow lands. Roll, and the wind is at your back: every arrow hits harder and brings the next roll sooner, and the faster she shoots, the harder every arrow lands. Hurricane, always with her, turns every shot into three.',
    perk: {
      name: 'Tailwind',
      desc: "After Evasive Roll, for as long as its attack speed bonus lasts, you have Tailwind: every basic attack (Barrage arrows too) deals extra damage on hit equal to 30% attack damage plus 2 per level, and takes 0.3 seconds off Evasive Roll's cooldown. The faster you attack, the more it adds up. Crosswind: your basic attacks loose extra arrows at the same target for 65% damage, and more the faster you shoot: half an extra arrow per shot at 4 attacks a second, 2 at 8, 4 and a half at 12 (up to 6). Gale Force: every arrow she looses deals 6% more for each attack a second (up to 20 a second: +120%), so attack speed counts twice over, in more arrows and in harder ones. Piercing Shot becomes Skirmish Step and Arrow Storm becomes Hurricane.",
      apply: (m) => { m.crosswind = Math.max(m.crosswind, 0.65); m.tailwind = Math.max(m.tailwind, 0.3); m.tailwindCdr = Math.max(m.tailwindCdr, 0.3); m.galeForce = Math.max(m.galeForce || 0, GALE_FORCE); },
    },
    kit: {
      q: {
        key: 'Q', name: 'Skirmish Step', type: 'dash', icon: 'e', unlock: 1, cd: 3.5, range: 3.5, minRange: 2.5, duration: 0.14, width: 0,
        quick: { shots: 3, time: 2.5, mult: 1.5 },
        dmg: () => 0,
        desc: 'Hop a few steps toward your cursor without breaking stride. Your next 3 basic attacks within 2.5 seconds leave the string at once, one after the other, for 50% more. They are gusts: they blow through every enemy in their path, Reflective enemies cannot turn them back, and they crack the mirror. Hop, shoot shoot shoot, hop.',
      },
      r: {
        key: 'R', name: 'Hurricane', type: 'passive', passive: true, icon: 'hurricane', unlock: 6, cd: 0, extra: 2, extraMult: HURRICANE.mult, rankMult: HURRICANE.rank, tailwind: true,
        dmg: () => 0,
        desc: `Passive (0.60.2): the gale is always with you. Tailwind never leaves you (no roll needed), and every basic attack also looses 2 arrows that sweep out wide and curve in, at other enemies nearby, or at your target if there are none, for ${pct(HURRICANE.mult)}% damage (+${pct(HURRICANE.rank)}% for every rank after the first). They count as basic attacks, but Tailwind does not add to them. Nothing to press.`,
      },
    },
    talents: [
      { id: 'wr_fleet', row: 'minor', name: 'Fleet', max: 5, desc: (r) => `+${1.5 * r}% move speed.`, apply: (m, r) => { m.msPct += 0.015 * r; } },
      { id: 'wr_hands', row: 'minor', name: 'Quick Hands', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'wr_roll', row: 'minor', name: 'Light Step', max: 5, desc: (r) => `Evasive Roll and Skirmish Step come back ${4 * r}% sooner.`, apply: (m, r) => { m.eCd *= 1 - 0.04 * r; m.qCd *= 1 - 0.04 * r; } },
      { id: 'wr_volley', row: 'major', name: 'Rolling Barrage', max: 3, desc: (r) => `Barrage looses ${r} more arrow${r > 1 ? 's' : ''}, and each deals ${5 * r}% more.`, apply: (m, r) => { m.wExtra += r; m.wDmg *= 1 + 0.05 * r; } },
      { id: 'wr_shot', row: 'major', name: 'Flurry', max: 3, desc: (r) => `Evasive Roll's attack speed bonus is ${10 * r}% higher and lasts ${0.5 * r} seconds longer.`, apply: (m, r) => { m.eRush += 0.1 * r; m.eRushTime += 0.5 * r; } },
      { id: 'wr_cap', row: 'capstone', name: 'Eye of the Storm', max: 1, desc: () => "Hurricane's arrows deal 20% more, and Tailwind adds a further 10% attack damage on hit.", apply: (m) => { m.hurricaneDmg *= 1.2; m.tailwind += 0.1; } },
    ],
  },

  // -------------------------------------------------------------------- Rogue
  assassin: {
    cls: 'rogue', name: 'Assassin',
    blurb: 'Clears the road one throat at a time. His blows are slow to come back and land like an executioner\'s, and every kill brings Q, W and E straight back, so you jump from enemy to enemy faster than they can turn round.',
    perk: {
      name: 'Clean Kill',
      desc: 'Killing an enemy resets Shadowstrike, Death Lotus and Ambush (not Last Rites). Culling Edge: every ability hit also deals a share of the enemy\'s maximum health: 10% on enemies 10 or more levels below you, 6% at your level, down to 2% on enemies 10 or more levels above (bosses, Storied enemies and Remnants: at most 3 times your attack damage a hit). Mercy Stroke becomes Shadowstrike, Fan of Knives becomes Death Lotus and Nightstep becomes Ambush.',
      apply: (m) => { m.killReset = true; m.pctHp = { max: 0.1, min: 0.02, span: 10, cap: 3 }; }, // (0.51) Culling Edge
    },
    kit: {
      q: {
        key: 'Q', name: 'Shadowstrike', type: 'strike', icon: 'strike', unlock: 1, cd: 15, range: 7.5, gap: true, behind: 0.6, execute: 0.3,
        // (0.42: cooldown 2.5x, damage 2.4x; 0.43: cooldown 1.5x again, damage 1.9x: rarer, heavier, and a kill still brings it back at once)
        dmg: (s, lvl) => 8 * s.ad + 52 + 21 * lvl,
        desc: 'Leap to the enemy nearest your cursor and stab it. 60% more damage from behind, on a stunned enemy or on one Death Lotus has Exposed, and double damage on an enemy below 30% health (not bosses).',
      },
      w: {
        key: 'W', name: 'Death Lotus', type: 'nova', icon: 'w', unlock: 2, cd: 20, radius: 5.5, knockback: 0, bleed: 3, expose: 4,
        dmg: (s, lvl) => 3.6 * s.ad + 36 + 15 * lvl,
        desc: 'Spin a ring of knives around you. Everything hit bleeds for 300% attack damage over 3 seconds and is Exposed for 4 seconds: it takes 15% more damage from you, and every side of it counts as its back (bosses keep their guard: only the 15%).',
      },
      e: {
        key: 'E', name: 'Ambush', type: 'dash', icon: 'e', unlock: 3, cd: 16, range: 9, minRange: 2, duration: 0.16, width: 0, ambush: true,
        empower: { mult: 2.2, time: 3 },
        dmg: () => 0,
        desc: 'Blink behind the enemy nearest your cursor (or toward your cursor, with no one there), facing its back. The next ability you use within 3 seconds deals 120% more.',
      },
    },
    talents: [
      { id: 'as_eye', row: 'minor', name: 'Find the Gap', max: 5, desc: (r) => `+${2 * r}% crit chance.`, apply: (m, r) => { m.crit += 2 * r; } },
      { id: 'as_deadly', row: 'minor', name: 'Twist the Knife', max: 5, desc: (r) => `Crits deal a further ${4 * r}% damage.`, apply: (m, r) => { m.critMult += 0.04 * r; } },
      { id: 'as_might', row: 'minor', name: 'Honed Edge', max: 5, desc: (r) => `+${2 * r}% attack damage.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'as_back', row: 'major', name: 'Cheap Shot', max: 3, desc: (r) => `Shadowstrike deals a further ${20 * r}% from behind, on a stunned enemy or on an Exposed one.`, apply: (m, r) => { m.qBehind += 0.2 * r; } },
      { id: 'as_mark', row: 'major', name: 'Contract', max: 3, desc: (r) => `Last Rites deals ${10 * r}% more damage and its cooldown is ${8 * r}% shorter.`, apply: (m, r) => { m.rDmg *= 1 + 0.1 * r; m.rCd *= 1 - 0.08 * r; } },
      { id: 'as_cap', row: 'capstone', name: 'Chain Kill', max: 1, desc: () => 'A Last Rites kill resets its cooldown completely.', apply: (m) => { m.rResetOnKill = true; } },
    ],
  },
  shadowdancer: {
    cls: 'rogue', name: 'Shadowdancer',
    blurb: 'Fights from three places at once. Slip about leaving afterimages, and every one of them throws your kunai and copies your attacks. Never still, never where the blow lands: built for long fights against one big enemy.',
    perk: {
      name: 'Afterimage',
      desc: 'Veilstep and Nightstep leave an afterimage of you where you stood for 5 seconds; press E again to trade places with Nightstep\'s. Mercy Stroke becomes Veilstep and Fan of Knives becomes Starglass Kunai: every afterimage throws one too, at the same enemy.',
      apply: (m) => { m.shadowStep = true; m.shadowDur = Math.max(m.shadowDur, 5); m.veilCopy = Math.max(m.veilCopy, 0.5); },
    },
    kit: {
      q: {
        key: 'Q', name: 'Veilstep', type: 'dash', icon: 'veil', unlock: 1, cd: 6, range: 5, minRange: 3, duration: 0.09, width: 1.2, veil: 4,
        dmg: (s, lvl) => 1.2 * s.ad + 10 + 4 * lvl,
        desc: 'Slip a short way toward your cursor, untouchable, cutting whatever you pass through and leaving an afterimage where you stood. For 4 seconds you are Veiled: each afterimage throws a knife at your target whenever you land a basic attack (50% of its damage), and Starglass Kunai thrown while Veiled lose their 60% limit on a second hit.',
      },
      w: {
        key: 'W', name: 'Starglass Kunai', type: 'kunai', icon: 'kunai', unlock: 2, cd: 7, range: 16, speed: 34, width: 1.1, repeat: 0.6, seek: 7,
        dmg: (s, lvl) => 1.35 * s.ad + 12 + 5 * lvl,
        desc: 'Throw a kunai of starglass at the enemy nearest your cursor (up to 16 m away); it follows its target and stops in the first enemy it hits. Each of your afterimages throws one too, at the same enemy: a second kunai on it deals 60% (100% while Veiled).',
      },
    },
    talents: [
      { id: 'sd_fleet', row: 'minor', name: 'Soft Shoes', max: 5, desc: (r) => `+${1.5 * r}% move speed.`, apply: (m, r) => { m.msPct += 0.015 * r; } },
      { id: 'sd_hands', row: 'minor', name: 'Flurry', max: 5, desc: (r) => `+${3 * r}% attack speed.`, apply: (m, r) => { m.asMult *= 1 + 0.03 * r; } },
      { id: 'sd_leech', row: 'minor', name: 'Slow to Fade', max: 5, desc: (r) => `Afterimages last ${(0.4 * r).toFixed(1)} seconds longer and Starglass Kunai deals ${4 * r}% more.`, apply: (m, r) => { m.shadowDur += 0.4 * r; m.wDmg *= 1 + 0.04 * r; } },
      { id: 'sd_fan', row: 'major', name: 'Mirrored Cut', max: 3, desc: (r) => `While Veiled, afterimages' knives deal a further ${10 * r}% of your basic attack, and Veil lasts ${0.5 * r} seconds longer.`, apply: (m, r) => { m.veilCopy += 0.1 * r; m.veilTime += 0.5 * r; } },
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
      desc: "Fire Bolt and your basic attacks set their target burning, 2 stacks a hit. Burns stack up to 50 times and last 4 seconds; a new stack renews them all. Each stack burns for 3% spell power plus 0.3 per level every second, growing with Fire Bolt's rank. Roaring: a burn gets hotter as it piles up; at a full burn every stack burns twice as hot. When a burning enemy dies, its burn jumps to the nearest enemy within 5 m, every stack of it. Searing: your burns can crit, and an enemy can carry 10 more stacks for every 120 ability haste you have. Frozen Orb becomes Smoulder and Meteor becomes Cinderfall.",
      apply: (m) => { m.burnCrit = true; m.burnHaste = Math.max(m.burnHaste, 120); m.burnSpread = Math.max(m.burnSpread, 1); m.qBurn = Math.max(m.qBurn, 1); m.basicBurn = 1; m.burnPerStack = Math.max(m.burnPerStack, 0.15); m.burnPerLevel = Math.max(m.burnPerLevel, 1.5); m.burnMax = Math.max(m.burnMax, 5); m.burnTime = Math.max(m.burnTime, 4); m.smoulderAmp = Math.max(m.smoulderAmp, 0.5); },
    },
    kit: {
      w: {
        key: 'W', name: 'Smoulder', type: 'smoulder', icon: 'smoulder', unlock: 2, cd: 8, range: 15, radius: 4,
        dmg: (s, lvl) => 0.7 * s.ad + 10 + 4 * lvl,
        desc: 'Throw a cinder at your cursor. Everything in the burst catches 4 stacks of burn and Smoulders for 5 seconds: burns on a Smouldering enemy deal 50% more.',
      },
      r: {
        key: 'R', name: 'Cinderfall', type: 'meteor', icon: 'r', unlock: 6, cd: 38, range: 16, radius: 6.2, delay: 0.9, stun: 0.5,
        burnZone: { time: 4, tick: 0.5, stacks: 1 },
        dmg: (s, lvl) => 3.2 * s.ad + 70 + 16 * lvl,
        desc: 'Call down a burning star on your cursor. It lands after a moment for heavy damage, and leaves the ground on fire for 4 seconds: everything standing in it gains 2 burn stacks every half second.',
      },
    },
    talents: [
      { id: 'py_power', row: 'minor', name: 'Kindling', max: 5, desc: (r) => `+${2 * r}% spell power.`, apply: (m, r) => { m.adPct += 0.02 * r; } },
      { id: 'py_crit', row: 'minor', name: 'Slow Burn', max: 5, desc: (r) => `Burns last ${(0.3 * r).toFixed(1)} seconds longer and deal ${4 * r}% more.`, apply: (m, r) => { m.burnTime += 0.3 * r; m.burnMult *= 1 + 0.04 * r; } },
      { id: 'py_haste', row: 'minor', name: 'Quick Burn', max: 5, desc: (r) => `+${3 * r} ability haste.`, apply: (m, r) => { m.haste += 3 * r; } },
      { id: 'py_ball', row: 'major', name: 'Fireball', max: 3, desc: (r) => `Fire Bolt deals ${8 * r}% more damage and bursts ${15 * r}% wider.`, apply: (m, r) => { m.qDmg *= 1 + 0.08 * r; m.qRadius *= 1 + 0.15 * r; } },
      { id: 'py_burn', row: 'major', name: 'Wildfire', max: 3, desc: (r) => `A dying enemy's burn jumps to ${r} more enem${r > 1 ? 'ies' : 'y'} (${r + 1} in all).`, apply: (m, r) => { m.burnSpread += r; } },
      { id: 'py_cap', row: 'capstone', name: 'Second Sun', max: 1, desc: () => 'One second after Cinderfall lands, the ground erupts again for 50% damage. Cinderfall is 15% wider, and Fire Bolt adds 4 burn stacks instead of 2.', apply: (m) => { m.rAftershock = Math.max(m.rAftershock, 0.5); m.rRadius *= 1.15; m.qBurn = Math.max(m.qBurn, 2); } },
    ],
  },
  frostbinder: {
    cls: 'mage', name: 'Frostbinder',
    blurb: 'Pile Hoarfrost on everything, then watch it Shatter: frozen solid, cut open, and the shards spread the cold to whatever stands nearby. A wall of ice keeps the rest away.',
    perk: {
      name: 'Hoarfrost',
      desc: "Ice Bolt, Frozen Orb, Starwake's motes and your basic attacks build Hoarfrost on enemies. At 6 stacks the enemy Shatters: it takes heavy damage that grows with Ice Bolt's rank, freezes solid for 1 second (heavy enemies 0.4 s; bosses turn Brittle instead and take 15% more damage for 4 s), and the shards give 2 Hoarfrost to enemies within 3 m (half a metre further for each rank of Ice Bolt past the first). Frozen Orb comes back 20% sooner. Deep Winter: after a Shatter an enemy normally waits 1.5 seconds before it can gather Hoarfrost again; ability haste shortens the wait (down to 0.3 s), so the faster you cast the more often it Shatters. The freeze itself still comes at most once every few seconds. Fire Bolt becomes Ice Bolt and Meteor becomes Rimewall.",
      apply: (m) => { m.frostHaste = true; m.frostMax = 6; m.basicFrost = 1; m.qFrost = Math.max(m.qFrost, 2); m.orbFrost = 1; m.moteFrost = 1; m.wCd *= 0.8; },
    },
    kit: {
      q: {
        key: 'Q', name: 'Ice Bolt', type: 'bolt', icon: 'icebolt', ice: true, unlock: 1, cd: 2.6, range: 16, speed: 32, splash: 2.2, splashMult: 0.5,
        dmg: (s, lvl) => 1.45 * s.ad + 16 + 5 * lvl,
        desc: 'Hurl a shard of ice at your cursor. It gives the first enemy 2 Hoarfrost and splinters into those nearby for 50% damage and 1 Hoarfrost.',
      },
      r: {
        key: 'R', name: 'Rimewall', type: 'wall', icon: 'wall', unlock: 6, cd: 32, range: 14, length: 10, duration: 5, stun: 1.2, rise: 0.6,
        dmg: (s, lvl) => 2.4 * s.ad + 40 + 10 * lvl,
        desc: 'Raise a wall of ice across your cursor for 5 seconds. Nothing can walk through it, and enemy shots that hit it fly back and Shatter what they hit. It rises hard, striking everything beside it for 60% damage and giving it 2 Hoarfrost. When it melts it bursts, damaging everything beside it and giving it 3 Hoarfrost.',
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
