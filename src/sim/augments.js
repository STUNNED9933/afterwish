// Augments: mutations you pick during a run (three choices after every odd
// wave and after every boss). They last until the run ends, so every run
// plays differently.
//
// An augment only changes numbers and switches in `mods`. The abilities in
// sim/world.js read those mods. To add an augment: add an entry here, and if it
// needs a new behaviour, add a field to defaultMods() and read it in world.js.

import { CLASSES, CLASS_IDS } from './classes.js';

/** The neutral set of modifiers. Multipliers start at 1, bonuses at 0, switches off. */
export function defaultMods() {
  return {
    // Cleave (Q)
    qRange: 1, qRadius: 1, wRange: 1, eRadius: 1, rRange: 1, // every slot has Range / Radius / Dmg / Cd
    qAngle: 1, wAngle: 1, qDmg: 1, qCd: 1,
    // Switches used by the Archer, Rogue and Mage augments. Named <slot><What>, read in world.js.
    eEmpower: 0, eRush: 0, eRushTime: 0, wExtra: 0, rangePct: 0, rDuration: 0, critEvery: 3, qBleed: 0, qBehind: 0, rStun: 0, wStun: 0,
    wResetOnKill: false, rResetOnKill: false, qSplashFull: false, qBolts: 1, eBlast: 0, rDelay: 1, qResetOnKill: false, qSunder: 0, qEcho: 0,
    // Whirlwind (W)
    wRadius: 1, wDmg: 1, wCd: 1, wPull: false, wBleed: 0, wSlow: 0,
    // Breakthrough (E)
    eRange: 1, eDmg: 1, eCd: 1, eResetOnKill: false,
    // Skyfall (R)
    rRadius: 1, rDmg: 1, rCd: 1, rAftershock: 0, rUnlock: false,
    // Parry
    parryWindow: 1, riposte: 0, reflectDmg: 1, slowDur: 1,
    // Hero stats (fractions: 0.25 = +25%; crit, lifesteal and haste are flat points)
    hpPct: 0, adPct: 0, asPct: 0, msPct: 0, crit: 0, lifesteal: 0, haste: 0,
    // Used by talents (sim/talents.js)
    armorPct: 0, asMult: 1, critMult: 0, dmgTaken: 0, lowHpDmg: 0, parryHeal: 0,
    // Subclass traits and talents: Berserker (Bloodied below half health), Bulwark (The Warden's Call, Shield Wall, Bastion)
    bloodRage: false, bloodAs: 0, bloodCost: 0, bloodLeech: 0, wTaunt: 0, wPullHeavy: false, guardRange: 0, allyParryHeal: 0,
    // Shadowdancer (Afterimage and its talents)
    shadowStep: false, shadowDur: 0, shadowSlash: 0, rMark: 0, rShadow: false,
    // Sharpshooter (Long Watch): more damage per metre to the target
    farShot: 0, farShotMax: 0,
    // Pyromancer (Everything Burns): stacking burns. burnPerStack = spell power per second per stack
    qBurn: 0, burnPerStack: 0, burnPerLevel: 0, burnMult: 1, burnMax: 0, burnTime: 0, burnSpread: 0, smoulderAmp: 0, basicBurn: 0,
    // Frostbinder (Deep Winter): chilled enemies deal less damage; Rimewall size and time
    chillWeak: 0, wallLen: 1, wallDur: 0,
    // Immortal item effects (see EFFECTS in items.js)
    stormcaller: false, undying: false, retribution: false, slipstream: false, timekeeper: false,
  };
}

// slot: which ability the augment changes ('hero' = general). It picks the icon
//       and stops augments for abilities you have not unlocked from being offered.
// tier: 2 = stronger. Boss rewards are always tier 2; normal offers rarely are.
export const AUGMENTS = {
  q_reset: { name: 'Executioner', slot: 'q', tier: 1, desc: 'Cleave kills reset its cooldown.', apply: (m) => { m.qResetOnKill = true; } },
  q_reach: { name: 'Long Reach', slot: 'q', tier: 1, desc: 'Cleave reaches 35% further in a 25% wider cone.', apply: (m) => { m.qRange *= 1.35; m.qAngle *= 1.25; } },
  q_sunder: { name: 'Sunder', slot: 'q', tier: 1, desc: 'Enemies hit by Cleave take 20% more damage for 4 seconds.', apply: (m) => { m.qSunder = 0.2; } },
  q_twin: { name: 'Twin Cleave', slot: 'q', tier: 2, desc: 'Cleave strikes a second time for 60% damage.', apply: (m) => { m.qEcho = 0.6; } },

  w_vortex: { name: 'Vortex', slot: 'w', tier: 1, desc: 'Whirlwind is 25% wider and pulls enemies in instead of pushing them away.', apply: (m) => { m.wRadius *= 1.25; m.wPull = true; } },
  w_bleed: { name: 'Bleeding Edge', slot: 'w', tier: 1, desc: 'Whirlwind makes enemies bleed for 90% attack damage over 3 seconds.', apply: (m) => { m.wBleed = 0.9; } },
  w_slow: { name: 'Hamstring', slot: 'w', tier: 1, desc: 'Whirlwind slows enemies by 45% for 3 seconds.', apply: (m) => { m.wSlow = 0.45; } },
  w_cyclone: { name: 'Cyclone', slot: 'w', tier: 2, desc: 'Whirlwind cooldown is 40% shorter and it deals 30% more damage.', apply: (m) => { m.wCd *= 0.6; m.wDmg *= 1.3; } },

  e_reset: { name: "Killer's Rush", slot: 'e', tier: 1, desc: 'Breakthrough kills reset its cooldown.', apply: (m) => { m.eResetOnKill = true; } },
  e_pierce: { name: 'Piercing Breakthrough', slot: 'e', tier: 1, desc: 'Breakthrough travels 30% further and deals 80% more damage.', apply: (m) => { m.eRange *= 1.3; m.eDmg *= 1.8; } },
  e_quick: { name: 'Fleet Foot', slot: 'e', tier: 1, desc: 'Breakthrough cooldown is 30% shorter.', apply: (m) => { m.eCd *= 0.7; } },

  r_early: { name: 'Early Descent', slot: 'r', tier: 2, desc: 'Skyfall is unlocked now, whatever your level, and its cooldown is 35% shorter.', apply: (m) => { m.rUnlock = true; m.rCd *= 0.65; } },
  r_meteor: { name: 'Meteor', slot: 'r', tier: 1, desc: 'Skyfall is 30% wider and deals 40% more damage.', apply: (m) => { m.rRadius *= 1.3; m.rDmg *= 1.4; } },
  r_aftershock: { name: 'Aftershock', slot: 'r', tier: 2, desc: 'One second after Skyfall lands, the ground erupts again for 60% damage.', apply: (m) => { m.rAftershock = 0.6; } },

  p_riposte: { name: 'Counterstroke', slot: 'parry', tier: 1, desc: 'Parrying a melee hit strikes the attacker for 150% attack damage.', apply: (m) => { m.riposte = 1.5; } },
  p_wide: { name: 'Steady Guard', slot: 'parry', tier: 1, desc: 'Your parry window is 25% longer.', apply: (m) => { m.parryWindow *= 1.25; } },
  p_mirror: { name: 'Mirror Guard', slot: 'parry', tier: 1, desc: 'Projectiles you send back deal double damage.', apply: (m) => { m.reflectDmg *= 2; } },
  p_time: { name: 'Stopped Clock', slot: 'parry', tier: 2, desc: 'Time stays slowed 75% longer after a perfect parry.', apply: (m) => { m.slowDur *= 1.75; } },

  h_giant: { name: 'Giant', slot: 'hero', tier: 1, desc: '+25% maximum health.', apply: (m) => { m.hpPct += 0.25; } },
  h_berserk: { name: 'Berserker', slot: 'hero', tier: 1, desc: '+25% attack speed.', apply: (m) => { m.asPct += 0.25; } },
  h_might: { name: 'Whetstone', slot: 'hero', tier: 1, desc: '+20% attack damage.', apply: (m) => { m.adPct += 0.2; } },
  h_leech: { name: 'Bloodthirst', slot: 'hero', tier: 1, desc: '+8% lifesteal.', apply: (m) => { m.lifesteal += 8; } },
  h_keen: { name: 'Keen Eye', slot: 'hero', tier: 1, desc: '+20% crit chance.', apply: (m) => { m.crit += 20; } },
  h_glass: { name: 'Glass Cannon', slot: 'hero', tier: 2, desc: '+45% attack damage, but 20% less maximum health.', apply: (m) => { m.adPct += 0.45; m.hpPct -= 0.2; } },
};
// The augments above that start with q_ w_ e_ r_ are written for the Warrior's kit.
const CLASS_AUGMENTS = {
  // --- Archer ----------------------------------------------------------------
  archer_q_reset: { name: 'Clean Kill', slot: 'q', cls: 'archer', tier: 1, desc: 'Piercing Shot kills reset its cooldown.', apply: (m) => { m.qResetOnKill = true; } },
  archer_q_mark: { name: 'Marked Prey', slot: 'q', cls: 'archer', tier: 1, desc: 'Enemies hit by Piercing Shot take 20% more damage for 4 seconds.', apply: (m) => { m.qSunder = 0.2; } },
  archer_w_more: { name: 'Endless Barrage', slot: 'w', cls: 'archer', tier: 1, desc: 'Barrage looses 3 more arrows.', apply: (m) => { m.wExtra += 3; } },
  archer_w_fast: { name: 'Quick Draw', slot: 'w', cls: 'archer', tier: 1, desc: 'Barrage comes back 35% sooner.', apply: (m) => { m.wCd *= 0.65; } },
  archer_e_rush: { name: 'Second Wind', slot: 'e', cls: 'archer', tier: 1, desc: 'Evasive Roll makes you attack 100% faster instead of 50%, for 2 seconds longer.', apply: (m) => { m.eRush += 0.5; m.eRushTime += 2; } },
  archer_range: { name: 'Eagle Eye', slot: 'hero', cls: 'archer', tier: 1, desc: 'Your basic attacks reach 25% further.', apply: (m) => { m.rangePct += 0.25; } },
  archer_r_rain: { name: 'Endless Rain', slot: 'r', cls: 'archer', tier: 2, desc: 'Arrow Storm lasts 2 seconds longer and covers a 25% wider area.', apply: (m) => { m.rDuration += 2; m.rRadius *= 1.25; } },
  archer_rapid: { name: 'Rapid Aim', slot: 'hero', cls: 'archer', tier: 2, desc: 'Steady Aim works on every second basic attack, instead of every third.', apply: (m) => { m.critEvery = 2; } },
  // --- Rogue -----------------------------------------------------------------
  rogue_q_reset: { name: 'Assassinate', slot: 'q', cls: 'rogue', tier: 1, desc: 'Mercy Stroke kills reset its cooldown.', apply: (m) => { m.qResetOnKill = true; } },
  rogue_q_bleed: { name: 'Serrated Blade', slot: 'q', cls: 'rogue', tier: 1, desc: 'Mercy Stroke makes its target bleed for 100% attack damage over 3 seconds.', apply: (m) => { m.qBleed = 1; } },
  rogue_q_cheap: { name: 'Cheap Shot', slot: 'q', cls: 'rogue', tier: 2, desc: 'Mercy Stroke deals 120% more from behind or on a stunned enemy, instead of 60%.', apply: (m) => { m.qBehind += 0.6; } },
  rogue_w_venom: { name: 'Venom', slot: 'w', cls: 'rogue', tier: 1, desc: 'Fan of Knives is 25% wider and slows enemies by 45% for 3 seconds.', apply: (m) => { m.wSlow = 0.45; m.wRadius *= 1.25; } },
  rogue_e_ambush: { name: 'From Nowhere', slot: 'e', cls: 'rogue', tier: 1, desc: 'The ability after Nightstep deals 100% more damage instead of 35%.', apply: (m) => { m.eEmpower += 0.65; } },
  rogue_r_daze: { name: 'Dazing Blow', slot: 'r', cls: 'rogue', tier: 1, desc: 'Last Rites stuns its target for 1.5 seconds.', apply: (m) => { m.rStun = 1.5; } },
  rogue_r_chain: { name: 'Chain Kill', slot: 'r', cls: 'rogue', tier: 2, desc: 'A Last Rites kill resets its cooldown completely.', apply: (m) => { m.rResetOnKill = true; } },
  // --- Mage ------------------------------------------------------------------
  mage_q_ball: { name: 'Fireball', slot: 'q', cls: 'mage', tier: 1, desc: 'Fire Bolt bursts 60% wider and the burst deals full damage.', apply: (m) => { m.qRadius *= 1.6; m.qSplashFull = true; } },
  mage_q_burn: { name: 'Ignite', slot: 'q', cls: 'mage', tier: 1, desc: 'Fire Bolt sets its target burning for 90% spell power over 3 seconds.', apply: (m) => { m.qBleed = 0.9; } },
  mage_q_twin: { name: 'Twin Bolt', slot: 'q', cls: 'mage', tier: 2, desc: 'Fire Bolt fires two bolts, each dealing 65% damage.', apply: (m) => { m.qBolts = 2; } },
  mage_w_freeze: { name: 'Deep Freeze', slot: 'w', cls: 'mage', tier: 1, desc: "Frozen Orb's shatter freezes normal enemies solid for 1.2 seconds.", apply: (m) => { m.wStun = 1.2; } },
  mage_w_big: { name: 'Glacier', slot: 'w', cls: 'mage', tier: 1, desc: 'Frozen Orb is 30% bigger: a wider trail of shards and a wider shatter.', apply: (m) => { m.wRadius *= 1.3; } },
  mage_e_rift: { name: 'Rift', slot: 'e', cls: 'mage', tier: 1, desc: 'Starwake leaves a blast where you were standing for 120% spell power.', apply: (m) => { m.eBlast = 1.2; } },
  mage_e_motes: { name: 'Constellation', slot: 'e', cls: 'mage', tier: 1, desc: 'Starwake looses 2 more motes.', apply: (m) => { m.eMotes = (m.eMotes || 0) + 2; } },
  mage_r_fast: { name: 'Falling Star', slot: 'r', cls: 'mage', tier: 1, desc: 'Meteor lands twice as fast and its cooldown is 20% shorter.', apply: (m) => { m.rDelay *= 0.5; m.rCd *= 0.8; } },
  mage_r_twin: { name: 'Second Impact', slot: 'r', cls: 'mage', tier: 2, desc: 'One second after Meteor lands, the ground erupts again for 60% damage.', apply: (m) => { m.rAftershock = 0.6; } },
};
Object.assign(AUGMENTS, CLASS_AUGMENTS);
for (const id in AUGMENTS) if (/^[qwer]_/.test(id)) AUGMENTS[id].cls = 'warrior';

// On top of the hand-written ones, every non-Warrior class gets a plain set
// built from its own abilities: more damage (or reach, for movement abilities)
// and a shorter cooldown per ability.
for (const cls of CLASS_IDS) {
  if (cls === 'warrior') continue;
  for (const slot of ['q', 'w', 'e', 'r']) {
    const ab = CLASSES[cls].abilities[slot];
    if (ab.type === 'dash') {
      AUGMENTS[`${cls}_${slot}_far`] = { name: `Long ${ab.name}`, slot, cls, tier: 1, desc: `${ab.name} travels 30% further.`, apply: (m) => { m[slot + 'Range'] *= 1.3; } };
    } else {
      AUGMENTS[`${cls}_${slot}_dmg`] = { name: `${ab.name} Mastery`, slot, cls, tier: 1, desc: `${ab.name} deals 35% more damage.`, apply: (m) => { m[slot + 'Dmg'] *= 1.35; } };
    }
    const cut = slot === 'r' ? 40 : 25;
    AUGMENTS[`${cls}_${slot}_cd`] = { name: `Quick ${ab.name}`, slot, cls, tier: slot === 'r' ? 2 : 1, desc: `${ab.name} cooldown is ${cut}% shorter.`, apply: (m) => { m[slot + 'Cd'] *= 1 - cut / 100; } };
  }
}
for (const id in AUGMENTS) AUGMENTS[id].id = id;
export const AUGMENT_IDS = Object.keys(AUGMENTS);
