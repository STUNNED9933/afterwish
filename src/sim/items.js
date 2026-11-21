// Gear: slots, rarities, stat rolls, upgrades, scrap, loot caches.

export const SLOTS = ['weapon', 'helm', 'chest', 'boots', 'ring'];
export const SLOT_NAMES = { weapon: 'Weapon', helm: 'Helm', chest: 'Armor', boots: 'Boots', ring: 'Ring' };

// base:   value on an item-level 1 common item when this is the main stat
// growth: extra fraction per item level
// weight: how much one point is worth when scoring an item (used for the upgrade arrow)
export const STATS = {
  ad: { label: 'Attack Damage', base: 6, growth: 0.17, weight: 3 },
  sp: { label: 'Spell Power', base: 6, growth: 0.17, weight: 3 }, // only on staves; powers the Mage like Attack Damage
  hp: { label: 'Health', base: 38, growth: 0.17, weight: 0.33 },
  armor: { label: 'Armor', base: 7, growth: 0.14, weight: 1.4 },
  as: { label: 'Attack Speed', base: 6, growth: 0.04, weight: 1.1, pct: true },
  ms: { label: 'Move Speed', base: 4, growth: 0.03, weight: 1.3, pct: true },
  haste: { label: 'Ability Haste', base: 8, growth: 0.05, weight: 1 },
  crit: { label: 'Crit Chance', base: 5, growth: 0.03, weight: 1.3, pct: true },
  lifesteal: { label: 'Lifesteal', base: 2, growth: 0.01, weight: 2.2, pct: true },
};
export const STAT_KEYS = Object.keys(STATS);

const MAIN_STAT = { weapon: 'ad', helm: 'hp', chest: 'armor', boots: 'ms', ring: 'haste' };

// Every slot has one main stat and a fixed order of bonus stats. A rarity with
// n bonus stats gets the first n of them, so a higher rarity has everything the
// rarity below has, plus more.
const BONUS_STATS = {
  weapon: ['as', 'crit', 'lifesteal', 'haste'],
  helm: ['armor', 'haste', 'crit', 'lifesteal'],
  chest: ['hp', 'lifesteal', 'haste', 'as'],
  boots: ['as', 'hp', 'armor', 'crit'],
  ring: ['crit', 'lifesteal', 'ad', 'as'],
};

// How rarity works:
//   mult     multiplies every stat on the item. Rolls only vary by +/-ROLL_SPREAD,
//            and the gaps between multipliers are wider than that, so at the same
//            item level and slot a higher rarity is never worse in ANY stat.
//   affixes  number of bonus stats on top of the main stat.
//   prefix   goes in front of the item name.
//   weight   drop chance relative to the others.
// There are no negative stats on any item.
// (0.43: +/-8%, up from 6%, so rerolling a line for a better number is worth doing. The narrowest
// gap between two rarities is 21%, and 1.08 / 0.92 is under 1.18, so the rule above still holds,
// whole-number rounding included.)
export const ROLL_SPREAD = 0.08;
export const RARITIES = [
  { key: 'common', prefix: '', name: 'Common', color: '#b9bdc7', mult: 1, affixes: 0, weight: 50 },
  { key: 'uncommon', prefix: 'Fine', name: 'Uncommon', color: '#58c98b', mult: 1.25, affixes: 1, weight: 28 },
  { key: 'rare', prefix: 'Superior', name: 'Rare', color: '#5aa2ff', mult: 1.55, affixes: 2, weight: 14 },
  { key: 'epic', prefix: 'Exalted', name: 'Epic', color: '#b97aff', mult: 1.9, affixes: 3, weight: 5.5 },
  // (0.30: Ancient, the old Legendary, moved above Mythic, just below Immortal: see migrateItem)
  { key: 'mythic', prefix: 'Mythic', name: 'Mythic', color: '#ff5d7a', mult: 2.3, affixes: 3, weight: 1.8 },
  { key: 'ancient', prefix: 'Ancient', name: 'Ancient', color: '#ffa53a', mult: 2.8, affixes: 4, weight: 0.5 },
  // weight 0: since 0.32 an Immortal never comes from an ordinary roll, only from the endgame sources that ask for one
  // (The Unmade, Remnants, the Warden's Cache, radiant chests on tier IV and up).
  // (0.43: radiant gold, not the old pale teal, which was too easy to mistake for Common; the gear screen also gives it a moving border)
  { key: 'immortal', prefix: '', name: 'Immortal', color: '#ffd24a', mult: 3.4, affixes: 4, weight: 0, effect: true },
];
export const IMMORTAL = RARITIES.length - 1;

// Special effects. Every Immortal item carries the effect for its slot, and the
// effect plays to the class wearing it: a bow's storm rides on basic attacks,
// daggers and staves reward abilities, and so on. `byClass` overrides the plain
// name, item name and text for one class. The game logic lives in sim/world.js
// (search for `mods.<key>`); effectFor() below picks the right text.
const ESCAPE = { warrior: 'Breakthrough', archer: 'Evasive Roll', rogue: 'Nightstep', mage: 'Starwake' };
export const EFFECTS = {
  stormcaller: {
    slot: 'weapon',
    name: 'Stormcaller',
    itemName: 'Stormcaller',
    desc: 'Every 4th basic attack calls lightning for 150% attack damage on your target and enemies near it.',
    byClass: {
      warrior: { name: 'Stormcaller', itemName: 'Stormcaller', desc: 'Cleave and Whirlwind call lightning down on every enemy they hit (up to 6), for 60% attack damage each. The bigger the crowd, the bigger the storm.' },
      archer: { name: 'Stormstring', itemName: 'Stormstring', desc: 'Every 4th basic attack calls lightning for 150% attack damage on your target and enemies near it. Barrage arrows count.' },
      rogue: { name: 'Nightfang', itemName: 'Nightfang', desc: 'Your abilities deal 40% more when they crit, and every ability crit takes 1 second off Nightstep.' },
      mage: { name: 'Wishfall', itemName: 'Wishfall', desc: 'Every third ability you cast calls a shard of the fallen star down on your cursor a moment later, for 160% spell power around it.' },
    },
  },
  undying: {
    slot: 'helm',
    name: 'Undying',
    itemName: 'Crown of the Undying',
    // (0.61.5) was a cheat-death; every Immortal is about damage now (defence only where it turns into damage)
    desc: 'Every enemy that falls within 8 m of you makes you deal 4% more damage for 6 seconds, up to 10 times (40%).',
  },
  retribution: {
    slot: 'chest',
    name: 'Retribution',
    itemName: 'Aegis of Retribution',
    desc: 'Every parry releases a shockwave for 120% attack damage around you. Perfect parries deal 200%.',
    byClass: {
      archer: { desc: 'Every parry looses a bolt of starlight at the nearest enemy within 12 m, for 150% attack damage (250% on a perfect parry).' },
      mage: { desc: 'Every parry looses a bolt of starlight at the nearest enemy within 12 m, for 150% spell power (250% on a perfect parry).' },
    },
  },
  slipstream: {
    slot: 'boots',
    name: 'Slipstream',
    itemName: 'Slipstream Treads',
    desc: 'A perfect parry or perfect dodge gives +40% move speed and +30% attack speed for 4 seconds.',
    byClass: {
      rogue: { desc: 'A perfect parry or perfect dodge gives +40% move speed for 4 seconds, and your ability cooldowns run 60% faster meanwhile.' },
      mage: { desc: 'A perfect parry or perfect dodge gives +40% move speed for 4 seconds, and your ability cooldowns run 60% faster meanwhile.' },
    },
  },
  // Unique Immortals (0.31): one from each Remnant, never from anywhere else. Any class can wear them.
  oathsignet: {
    slot: 'ring', unique: 'boss',
    name: "Oathbreaker's Signet",
    itemName: "Oathbreaker's Signet",
    desc: 'A perfect parry calls the broken oath down: a spectral blade strikes every enemy within 6 m for 250% attack damage.',
  },
  sporeheart: {
    slot: 'chest', unique: 'boss2',
    name: 'Sporeheart',
    itemName: 'Sporeheart',
    desc: 'Every 4 seconds, spores burst from you: every enemy within 6 m takes 120% of your attack damage or spell power (whichever is higher) and takes 10% more damage for 4 seconds.',
  },
  unwished: {
    slot: 'helm', unique: 'boss3',
    name: 'The Unwished Crown',
    itemName: 'The Unwished Crown',
    desc: 'You deal 12% more damage to bosses. Each Doom aimed at you that you avoid makes you deal a further 25% for 6 seconds.',
  },
  // Edric's Colours (0.47): the reward from Bram, never a drop. The blade for a warrior, the ring for anyone else.
  edric: {
    slot: 'weapon', unique: 'quest',
    name: 'Blue Trim',
    itemName: "Edric's Sword",
    desc: 'Bram made it; Edric kept it. Every perfect parry adds 12% damage for 8 seconds (up to 3 times), and strikes the enemy you parried for 150% attack damage.',
  },
  bluetrim: {
    slot: 'ring', unique: 'quest',
    name: 'Keep the Gate',
    itemName: "Edric's Colours",
    desc: 'A ring of blue cloth and steel. While above 70% health you deal 18% more damage.',
  },
  timekeeper: {
    slot: 'ring',
    name: 'Timekeeper',
    itemName: 'The Timekeeper',
    desc: 'Slowed time lasts 60% longer. Every kill takes 0.5 seconds off your ability cooldowns, and so does every 4% of a boss\'s health you take away.',
  },
};

// --- Subclass Immortals (0.32) ---------------------------------------------
// From level 15, an Immortal's effect is the one for the subclass you play, made to fit how it fights
// (before that, the class effect above). The item keeps its slot and name; only the effect follows you.
export const SPEC_IMMORTALS = {
  berserker: {
    weapon: { name: 'Bloodreaver', desc: 'While Bloodied, Cleave and Whirlwind deal 25% more, and Cleave comes back twice as fast.', apply: (m) => { m.bloodQW += 0.25; m.bloodQcd = true; } },
    helm: { name: 'Crown of the Last Breath', desc: "You deal 3% more damage for every 10% of health you are missing (up to 27%), and Blood Rage's last breath gives you 3 seconds of Crimson Oath.", apply: (m) => { m.missingDmg = Math.max(m.missingDmg, 0.03); m.lastBreathOath = 3; } },
    chest: { name: 'Scarred Hauberk', desc: 'While Bloodied, you deal a further 15% damage.', apply: (m) => { m.lowHpDmg += 0.15; } },
    boots: { name: 'Red Stride', desc: 'While Bloodied, Cleave and Whirlwind deal 15% more, and Whirlwind spins 1 second longer.', apply: (m) => { m.bloodQW += 0.15; m.wSpinTime += 1; } },
    ring: { name: 'Oathblood Signet', desc: "Crimson Oath's cooldown is 40% shorter and it lasts 3 seconds longer.", apply: (m) => { m.rCd *= 0.6; m.rDuration += 3; } },
  },
  bulwark: {
    weapon: { name: 'Wardbreaker', desc: 'Cleave strikes a second time for 60%, and enemies you have taunted take 20% more damage from everyone.', apply: (m) => { m.qEcho = Math.max(m.qEcho, 0.6); m.tauntVuln += 0.2; } },
    helm: { name: 'Crown of the Iron Answer', desc: 'Blocking a red attack with Iron Answer gives 3 Reckoning stacks, and the enemy you Broke takes 35% more damage instead of 20%.', apply: (m) => { m.blockReckon += 2; m.brokenVuln = Math.max(m.brokenVuln, 0.15); } },
    chest: { name: 'Bastion Plate', desc: 'Hold the Line lasts 3 seconds longer, and while it holds, Weight of Iron counts your armor 60% more toward your damage.', apply: (m) => { m.bastionIron = Math.max(m.bastionIron, 0.6); m.rDuration += 3; } },
    boots: { name: 'Unyielding Greaves', desc: 'Parrying no longer slows you, and every parry or block takes 1 second off Whirlwind.', apply: (m) => { m.parryFree = true; m.parryCdrW += 1; } },
    ring: { name: "Warden's Seal", desc: 'Reckoning gains a stack for every 5% of your health lost (instead of 10%) and holds 2 more.', apply: (m) => { m.reckonHp = 0.05; m.reckonMaxAdd += 2; } },
  },
  sharpshooter: {
    weapon: { name: 'Farstring', desc: 'Long Watch goes up to 70% more damage (instead of 40%).', apply: (m) => { m.farShotMax += 0.3; } },
    helm: { name: "Hawk's Hood", desc: 'Deadeye comes back 35% sooner and deals 15% more.', apply: (m) => { m.rCd *= 0.65; m.rDmg *= 1.15; } },
    chest: { name: "Rangekeeper's Coat", desc: 'While no enemy is within 6 m of you, you deal 15% more damage.', apply: (m) => { m.farDmg += 0.15; } },
    boots: { name: 'Quickstep Boots', desc: "Evasive Roll comes back 30% sooner, and for as long as its attack speed lasts you deal 20% more damage.", apply: (m) => { m.eCd *= 0.7; m.rushDmg += 0.2; } },
    ring: { name: 'Bullseye Loop', desc: 'Ricochet always crits and deals 30% more to enemies more than 10 m from you.', apply: (m) => { m.qCrit = true; m.qFar += 0.3; } },
  },
  windrunner: {
    weapon: { name: 'Galestring', desc: "Tailwind's on-hit damage is 50% higher.", apply: (m) => { m.tailwind *= 1.5; } },
    helm: { name: 'Eye of the Gale', desc: 'Hurricane looses a third arrow, and its arrows deal 25% more.', apply: (m) => { m.hurricaneExtra += 1; m.hurricaneDmg *= 1.25; } },
    chest: { name: 'Windwoven Vest', desc: "+12% attack speed, and Hurricane's arrows deal 15% more.", apply: (m) => { m.asMult *= 1.12; m.hurricaneDmg *= 1.15; } },
    boots: { name: 'Zephyr Treads', desc: "Tailwind's on-hit damage is 25% higher, and every basic attack with Tailwind takes 0.5 seconds off Evasive Roll (instead of 0.3).", apply: (m) => { m.tailwind *= 1.25; m.tailwindCdr = Math.max(m.tailwindCdr, 0.5); } },
    ring: { name: 'Storm Sigil', desc: 'Barrage looses 3 more arrows.', apply: (m) => { m.wExtra += 3; } },
  },
  assassin: {
    weapon: { name: 'Nightfang', desc: "Shadowstrike's double damage works below 40% health (instead of 30%), and your crits deal a further 25%.", apply: (m) => { m.qExecute += 0.1; m.critMult += 0.25; } },
    helm: { name: 'Mask of the Unseen', desc: "Ambush's empowered ability deals 125% more (instead of 75%).", apply: (m) => { m.eEmpower += 0.5; } },
    chest: { name: 'Shroud of Last Rites', desc: 'Every Clean Kill makes you deal 8% more damage for 6 seconds, up to 5 times (40%).', apply: (m) => { m.killSurge = Math.max(m.killSurge, 0.08); } },
    boots: { name: 'Silent Step', desc: 'Shadowstrike leaps 50% further and deals 20% more, and Ambush comes back 30% sooner.', apply: (m) => { m.qRange *= 1.5; m.qDmg *= 1.2; m.eCd *= 0.7; } },
    ring: { name: 'Contract Seal', desc: 'Every Clean Kill also takes 8 seconds off Last Rites.', apply: (m) => { m.killResetR += 8; } },
  },
  shadowdancer: {
    weapon: { name: 'Starglass Edge', desc: 'Starglass Kunai thrown while Veiled deal 40% more, and each afterimage throws two.', apply: (m) => { m.veilKunai += 0.4; m.kunaiTwice = true; } },
    helm: { name: 'Mirror Veil', desc: 'Afterimages last 3 seconds longer, and Veil lasts 2 seconds longer.', apply: (m) => { m.shadowDur += 3; m.veilTime += 2; } },
    chest: { name: 'Shadowweave', desc: 'While Veiled, you deal 20% more damage.', apply: (m) => { m.veilDmg += 0.2; } },
    boots: { name: 'Twinstep', desc: 'Veilstep comes back 40% sooner.', apply: (m) => { m.qCd *= 0.6; } },
    ring: { name: 'Loop of the Second Death', desc: 'Second Death repeats a further 25%, and Last Rites comes back 25% sooner.', apply: (m) => { m.rMark += 0.25; m.rCd *= 0.75; } },
  },
  pyromancer: {
    weapon: { name: 'Emberheart', desc: 'Burns stack 30 higher, and every stack burns 20% more.', apply: (m) => { m.burnMax += 3; m.burnMult *= 1.2; } },
    helm: { name: 'Crown of Cinders', desc: 'Smoulder bursts 50% wider and gives 6 burn stacks instead of 4.', apply: (m) => { m.wRadius *= 1.5; m.smoulderStacks = Math.max(m.smoulderStacks, 3); } },
    chest: { name: 'Ashen Robe', desc: 'For each burning enemy within 8 m, you deal 4% more damage (up to 24%).', apply: (m) => { m.burnRage += 0.04; } },
    boots: { name: 'Cinderwalk', desc: 'Fire Bolt comes back 30% sooner and deals 25% more.', apply: (m) => { m.qCd *= 0.7; m.qDmg *= 1.25; } },
    ring: { name: 'Seal of the Second Sun', desc: 'Cinderfall comes back 40% sooner and erupts again for 70%.', apply: (m) => { m.rCd *= 0.6; m.rAftershock = Math.max(m.rAftershock, 0.7); } },
  },
  frostbinder: {
    weapon: { name: 'Rimecaller', desc: 'Ice Bolt gives 3 Hoarfrost instead of 2, and Shatter deals 30% more.', apply: (m) => { m.qFrost = Math.max(m.qFrost, 3); m.frostDmg *= 1.3; } },
    helm: { name: 'Glacial Crown', desc: 'Frozen enemies stay frozen 50% longer, and Brittle bosses take 25% more (instead of 15%).', apply: (m) => { m.frostFreeze *= 1.5; m.brittle = Math.max(m.brittle, 0.25); } },
    chest: { name: 'Rimeguard Mantle', desc: 'Every Shatter makes you deal 4% more damage for 6 seconds, up to 5 times (20%).', apply: (m) => { m.shatterSurge = Math.max(m.shatterSurge, 0.04); } },
    boots: { name: 'Frostwalkers', desc: "Starwake's motes give 2 Hoarfrost each, and Starwake comes back 30% sooner.", apply: (m) => { m.moteFrost = Math.max(m.moteFrost, 2); m.eCd *= 0.7; } },
    ring: { name: "Winter's Loop", desc: "Frozen Orb comes back 30% sooner, and its shattering burst gives 3 Hoarfrost.", apply: (m) => { m.wCd *= 0.7; m.orbBurstFrost = Math.max(m.orbBurstFrost, 3); } },
  },
};

/**
 * The effect as the given class (and subclass, from level 15) gets it: { key, slot, name, itemName, desc }.
 * Unique Immortals (a Remnant's own) are the same for everyone.
 */
export function effectFor(key, cls, spec = null) {
  const e = EFFECTS[key];
  if (!e) return null;
  const base = Object.assign({ key, slot: e.slot, name: e.name, itemName: e.itemName, desc: e.desc }, (e.byClass && e.byClass[cls]) || {});
  const s = !e.unique && spec && SPEC_IMMORTALS[spec] && SPEC_IMMORTALS[spec][e.slot];
  return s ? Object.assign(base, { name: s.name, desc: s.desc, spec }) : base;
}
/** Classes whose Slipstream speeds up cooldowns instead of attacks. */
export const CASTER_CLASSES = new Set(['rogue', 'mage']);
const EFFECT_FOR_SLOT = {};
for (const key in EFFECTS) if (!EFFECTS[key].unique) EFFECT_FOR_SLOT[EFFECTS[key].slot] = key;
/** The unique Immortal a Remnant drops: { boss: 'oathsignet', ... }. */
export const REMNANT_UNIQUE = Object.fromEntries(Object.entries(EFFECTS).filter(([, e]) => e.unique).map(([k, e]) => [e.unique, k]));

// --- Ascending Immortals (0.31) ---------------------------------------------
// Feed a duplicate Immortal (same effect) into one you wear: it gains a star, up to 5, and
// every star adds 10% to all its stats (on top of blacksmith upgrades), and (0.65) 20% to the potency of
// its passive: twice as strong at 5 stars. See starPotency and applyPotent.
export const MAX_STARS = 5;
export const STAR_BONUS = 0.1;
export const STAR_POTENCY = 0.2;
/** How strong an Immortal's passive is for its stars: 1 with none, 2 at 5 stars (0.65). */
export const starPotency = (item) => 1 + STAR_POTENCY * Math.min(MAX_STARS, (item && item.stars) || 0);
/**
 * Apply a passive (a mods function) at `k` times its potency (0.65). Every number it changes moves k times
 * as far: a share added (+15% damage) becomes +30%; a multiplier above 1 (25% more) adds k times its
 * share; a multiplier below 1 (40% shorter cooldown) is read as speed, so twice the potency is a cooldown
 * running 2 x 0.67 = 1.33 faster, never zero. Counts stay whole numbers. Yes/no effects are what they are.
 * `base` holds each modifier's starting value (augments.js defaultMods): 1 marks a multiplier.
 */
export function applyPotent(m, fn, k, base) {
  if (!(k > 1)) return fn(m);
  const before = Object.assign({}, m);
  fn(m);
  for (const key in m) {
    const b = before[key], a = m[key];
    if (typeof a !== 'number' || typeof b !== 'number' || a === b) continue;
    if (key === 'reckonHp') {
      // a threshold: a stack for every 10% lost by default, lower is better. Read as how often.
      const was = b || 0.1;
      m[key] = was / (1 + (was / a - 1) * k);
    } else if (base[key] === 1 && b > 0) {
      const r = a / b;
      m[key] = b * (r < 1 ? 1 / (1 + (1 / r - 1) * k) : 1 + (r - 1) * k);
    } else {
      const v = b + (a - b) * k;
      m[key] = Number.isInteger(a) && Number.isInteger(b) ? Math.round(v) : v;
    }
  }
}

// Each class has its own weapon type. Only that class can equip it, and weapon
// drops are always for the class you are playing, so nothing you find is useless.
//   main   the weapon's main stat
//   bonus  its bonus stats in order; the first one is on EVERY weapon of the type,
//          even a Common one (bows are fast, daggers crit, staves cast more often)
export const WEAPONS = {
  warrior: { type: 'Sword', main: 'ad', bonus: ['as', 'crit', 'lifesteal', 'haste'], starter: 'Training Sword',
    names: ['Rusted Blade', 'Iron Sword', 'Steel Saber', 'Runed Longsword', 'Frostbrand', 'Sunscar Scimitar', 'Gloomthorn Blade', 'Stormcleaver', 'Obsidian Greatsword', 'Starforged Edge'] },
  archer: { type: 'Bow', main: 'ad', bonus: ['as', 'crit', 'haste', 'lifesteal'], starter: 'Training Bow',
    names: ['Bent Shortbow', 'Hunter Bow', 'Recurve Bow', 'Runed Longbow', 'Frostwood Bow', 'Sunscar Greatbow', 'Gloomthorn Bow', 'Stormcall Bow', 'Obsidian Warbow', 'Starstring Bow'] },
  rogue: { type: 'Daggers', main: 'ad', bonus: ['crit', 'as', 'lifesteal', 'haste'], starter: 'Training Daggers',
    names: ['Rusted Shivs', 'Iron Daggers', 'Steel Stilettos', 'Runed Fangs', 'Frostbite Knives', 'Sunscar Kris', 'Gloomthorn Needles', 'Stormcut Blades', 'Obsidian Claws', 'Starforged Fangs'] },
  mage: { type: 'Staff', main: 'sp', bonus: ['haste', 'crit', 'lifesteal', 'as'], starter: 'Training Staff',
    names: ['Cracked Wand', 'Oak Staff', 'Iron-shod Staff', 'Runed Staff', 'Rimewood Staff', 'Sunscar Rod', 'Gloomcap Staff', 'Stormcall Staff', 'Obsidian Scepter', 'Starcall Staff'] },
};

/** "Bow", "Staff" ... for weapons; the slot name for everything else. */
export function itemTypeName(item) {
  if (item.slot === 'weapon') return WEAPONS[item.cls || 'warrior'].type;
  return SLOT_NAMES[item.slot];
}

export const BASE_NAMES = {
  weapon: ['Rusted Blade', 'Iron Sword', 'Steel Saber', 'Runed Longsword', 'Starforged Edge'],
  helm: ['Leather Cap', 'Iron Helm', 'Visored Helm', 'Duelist Mask', 'Rimeguard Helm', 'Dune Veil', 'Gloomcap Hood', 'Stormcrest Helm', 'Obsidian Visage', 'Crown of Dusk'],
  chest: ['Padded Vest', 'Chain Hauberk', 'Plate Cuirass', 'Runed Aegis', 'Rimeguard Plate', 'Dune Wraps', 'Gloomweave Coat', 'Stormplate', 'Obsidian Cuirass', 'Titan Carapace'],
  boots: ['Worn Boots', 'Traveler Boots', 'Striders', 'Windrunners', 'Frostwalkers', 'Dune Sandals', 'Gloomstep Boots', 'Stormstriders', 'Obsidian Greaves', 'Phase Treads'],
  ring: ['Copper Band', 'Silver Ring', 'Signet', 'Arcane Loop', 'Rime Band', 'Sunscar Seal', 'Gloom Ring', 'Storm Loop', 'Obsidian Band', 'Eternity Band'],
};
function statValue(key, ilvl, mult, rng) {
  const s = STATS[key];
  const v = s.base * (1 + s.growth * (ilvl - 1)) * mult * (1 - ROLL_SPREAD + 2 * ROLL_SPREAD * rng());
  return Math.max(1, Math.round(v));
}

let itemCounter = 1;

/**
 * Roll a random item.
 * @param {function} rng
 * @param {number} ilvl             item level (the level of the enemy that dropped it)
 * @param {object} [o]
 * @param {number} [o.minRarity]    index into RARITIES (bosses pass 2 = rare)
 * @param {number[]} [o.weights]    explicit rarity odds (loot caches use this)
 * @param {string} [o.slot]
 */
export function rollItem(rng, ilvl, { minRarity = 0, weights = null, slot = null, cls = null } = {}) {
  // Higher waves nudge the odds toward better rarities.
  const w = weights || RARITIES.map((r, i) => (i < minRarity ? 0 : r.weight * (1 + Math.min(ilvl, 30) * 0.035 * i))); // the nudge stops at level 30, so rare gear stays rare at level 100
  let roll = rng() * w.reduce((a, b) => a + b, 0);
  let ri = minRarity;
  for (let i = 0; i < w.length; i++) {
    roll -= w[i];
    if (roll <= 0) {
      ri = i;
      break;
    }
  }
  const rarity = RARITIES[ri];
  slot = slot || SLOTS[Math.floor(rng() * SLOTS.length)];
  const weapon = slot === 'weapon' ? WEAPONS[cls] || WEAPONS.warrior : null;
  const main = weapon ? weapon.main : MAIN_STAT[slot];
  const bonus = weapon ? weapon.bonus : BONUS_STATS[slot];
  const stats = { [main]: statValue(main, ilvl, rarity.mult, rng) };

  // Weapons carry one more bonus stat than other slots: their class's signature stat.
  const count = Math.min(bonus.length, rarity.affixes + (weapon ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const k = bonus[i];
    stats[k] = statValue(k, ilvl, rarity.mult * 0.5, rng);
  }

  // One name per ten levels, so gear from each map sounds like it came from there.
  const tier = Math.min(9, Math.floor((ilvl - 1) / 10));
  const item = { id: 'i' + Date.now().toString(36) + '-' + itemCounter++, name: '', slot, rarity: ri, ilvl, stats, plus: 0, rv: 2 };
  if (rarity.effect) {
    item.effect = EFFECT_FOR_SLOT[slot];
    item.name = effectFor(item.effect, weapon ? cls : null).itemName;
  } else {
    item.name = (rarity.prefix ? rarity.prefix + ' ' : '') + (weapon ? weapon.names : BASE_NAMES[slot])[tier];
  }
  if (weapon && cls) item.cls = cls;
  return item;
}

export function starterWeapon(cls = 'warrior') {
  const w = WEAPONS[cls] || WEAPONS.warrior;
  return { id: 'starter', name: w.starter, slot: 'weapon', cls, rarity: 0, ilvl: 1, stats: { [w.main]: 5, [w.bonus[0]]: 3 }, plus: 0, rv: 2 };
}

/**
 * Items saved before 0.30, when the order was ... Epic, Legendary ("Ancient ..."), Mythic, Immortal.
 * Now it is ... Epic, Mythic, Ancient, Immortal, so a rarity number keeps its strength and only its
 * name moves: the old Legendary (4) is a Mythic now and the old Mythic (5) is Ancient. Set pieces were
 * Legendary and are Ancient now, so they move up a step (and their stats with them). Safe to run twice.
 */
export function migrateItem(item) {
  if (!item || item.rv === 2) return item;
  if (item.set && item.rarity === 4) {
    const k = RARITIES[5].mult / RARITIES[4].mult;
    for (const s in item.stats) item.stats[s] = Math.max(1, Math.round(item.stats[s] * k));
    item.rarity = 5;
  } else if (item.rarity === 4 && typeof item.name === 'string' && item.name.startsWith('Ancient ')) {
    item.name = 'Mythic ' + item.name.slice(8);
  } else if (item.rarity === 5 && typeof item.name === 'string' && item.name.startsWith('Mythic ')) {
    item.name = 'Ancient ' + item.name.slice(7);
  }
  item.rv = 2;
  return item;
}

// --- Sets (0.29) -------------------------------------------------------------
// One set per subclass. Set pieces are Ancient items (just below Immortal) of the set's class with a set
// name; two pieces worn give the first bonus, four give the second as well. They drop
// from Remnant bosses (always), Rare enemies (sometimes) and radiant chests (now and then).
export const SETS = {
  bloodbound: { name: 'Bloodbound', cls: 'warrior', spec: 'berserker',
    two: { desc: 'While Bloodied, deal a further 10% damage.', apply: (m) => { m.lowHpDmg += 0.1; } },
    four: { desc: 'Whirlwind spins 1 second longer, and nothing can drop you below 1 health while it spins.', apply: (m) => { m.wSpinTime += 1; m.spinGuard = true; } } },
  wardstone: { name: 'Wardstone', cls: 'warrior', spec: 'bulwark',
    two: { desc: '+15% armor.', apply: (m) => { m.armorPct += 0.15; } },
    four: { desc: 'Reckoning holds up to 8 stacks, and a Whirlwind with 5 or more Breaks everything it hits, like Iron Answer.', apply: (m) => { m.reckonMax = Math.max(m.reckonMax, 8); m.reckonBreak = true; } } },
  farsight: { name: 'Farsight', cls: 'archer', spec: 'sharpshooter',
    two: { desc: 'Crits deal a further 15% damage.', apply: (m) => { m.critMult += 0.15; } },
    four: { desc: "Steady Aim's guaranteed crits pierce, hitting every enemy in their path.", apply: (m) => { m.steadyPierce = true; } } },
  galeborn: { name: 'Galeborn', cls: 'archer', spec: 'windrunner',
    two: { desc: '+8% attack speed.', apply: (m) => { m.asMult *= 1.08; } },
    four: { desc: 'Rolling through an attack (a perfect dodge) whips up a 3-second gale: 40% faster attacks, and Tailwind the whole time.', apply: (m) => { m.galeHurricane = Math.max(m.galeHurricane, 3); } } },
  nightcut: { name: 'Nightcut', cls: 'rogue', spec: 'assassin',
    two: { desc: 'Shadowstrike deals 15% more.', apply: (m) => { m.qDmg *= 1.15; } },
    four: { desc: 'After a Clean Kill, your next Shadowstrike within 3 seconds also cuts every enemy within 3 m of its target.', apply: (m) => { m.nightcutChain = true; } } },
  veilweave: { name: 'Veilweave', cls: 'rogue', spec: 'shadowdancer',
    two: { desc: 'Veil lasts 1 second longer.', apply: (m) => { m.veilTime += 1; } },
    four: { desc: 'Trading places with your Nightstep afterimage Veils you and brings Veilstep straight back.', apply: (m) => { m.swapVeil = true; } } },
  ashen: { name: 'Ashen', cls: 'mage', spec: 'pyromancer',
    two: { desc: 'Burns deal 15% more.', apply: (m) => { m.burnMult *= 1.15; } },
    four: { desc: 'A burning enemy that dies bursts: everything within 5 m catches its burn, every stack of it.', apply: (m) => { m.burnSpread = Math.max(m.burnSpread, 99); m.ashBurst = true; } } },
  rimeheart: { name: 'Rimeheart', cls: 'mage', spec: 'frostbinder',
    two: { desc: 'Shatter deals 20% more.', apply: (m) => { m.frostDmg *= 1.2; } },
    four: { desc: 'Shatter chains: each one also Shatters the nearest other enemy within 6 m.', apply: (m) => { m.shatterChain = true; } } },
};
export const SET_IDS = Object.keys(SETS);
const SET_PIECE = { helm: 'Crown', chest: 'Mantle', boots: 'Treads', ring: 'Seal' };
const SET_WEAPON = { warrior: 'Blade', archer: 'Longbow', rogue: 'Fangs', mage: 'Staff' };
export const SET_RARITY = 5; // Ancient

/** A set piece for a class: usually of its current subclass's set, sometimes the other one. */
export function rollSetPiece(rng, ilvl, cls, spec = null) {
  const mine = SET_IDS.filter((id) => SETS[id].cls === cls);
  if (!mine.length) return null;
  const pick = spec && mine.some((id) => SETS[id].spec === spec) && rng() < 0.7 ? mine.find((id) => SETS[id].spec === spec) : mine[Math.floor(rng() * mine.length)];
  const slot = SLOTS[Math.floor(rng() * SLOTS.length)];
  const weights = RARITIES.map((_, i) => (i === SET_RARITY ? 1 : 0));
  const item = rollItem(rng, ilvl, { weights, slot, cls });
  item.set = pick;
  item.cls = cls; // a set is for one class
  item.name = `${SETS[pick].name} ${slot === 'weapon' ? SET_WEAPON[cls] : SET_PIECE[slot]}`;
  return item;
}

/** How many pieces of each set are worn. */
export function setCounts(equipped) {
  const n = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it && it.set) n[it.set] = (n[it.set] || 0) + 1;
  }
  return n;
}

// --- Misc items (0.32): stackable things kept in the pouch, not the bag -------------
export const MISC = {
  glass: { name: 'Unwishing Glass', desc: 'Takes back every Wish point you have spent, to spend again (on the Wishborne panel, T).', color: '#c9a6ff' },
  fragment: { name: 'Immortal Fragment', desc: 'Gather enough and craft an Immortal of your choice of slot (gear screen, from level 70).', color: '#ffd24a' },
  scarf: { name: 'Red Scarf', desc: "Knitted by Pip's mother, twice round the neck. A keepsake (Red Scarf, Part Two).", color: '#d0402a' },
  sigil: { name: 'Remnant Sigil', desc: "Press it into a boss's altar (where it fights) to call up its Remnant at once, if you have beaten that boss three times.", color: '#a64bff' },
};
export const MISC_IDS = Object.keys(MISC);

// --- Rerolling and reforging (0.43; enchanting since 0.29) -------------------
// Reroll: any line on an item (the main stat too) gets a fresh number for the same stat. As often as
// you like, for gold and scrap, at the same price every time. Each line shows how good its roll is,
// in the rarity colours: Common for a low roll up to Immortal for the very best.
// Reforge: turn one bonus line into a stat you choose (never at random), for gold and Wishdust. Once an
// item is reforged only that line can be reforged again, and each time costs more.
export const ENCHANT_POOL = ['as', 'crit', 'lifesteal', 'haste', 'armor', 'hp'];
const itemLv = (item) => 1 + 0.1 * ((item.ilvl || 1) - 1);
/** Price of one reroll of one line: the same every time. */
export function rerollCost(item) {
  const lv = itemLv(item);
  return { gold: Math.round(60 * (1 + item.rarity) * lv), scrap: Math.round(4 * (1 + item.rarity) * lv) };
}
/** Price of a reforge: more each time. */
export function enchantCost(item) {
  const n = item.enchants || 0;
  return { gold: Math.round(120 * (1 + item.rarity) * itemLv(item) * (1 + n)), dust: 1 + item.rarity + n };
}
/** Which of an item's bonus stats can be reforged right now. */
export function enchantable(item) {
  if (!item) return [];
  const keys = Object.keys(item.stats).slice(1); // the first is the main stat
  if (item.enchantKey && keys.includes(item.enchantKey)) return [item.enchantKey];
  return keys;
}
/** The stats a bonus line could be reforged into. */
export function reforgeChoices(item) {
  return item ? ENCHANT_POOL.filter((k) => !(k in item.stats)) : [];
}
/** Is this the item's main stat (the first line)? */
export function isMainStat(item, key) {
  return Object.keys(item.stats)[0] === key;
}
/** The value a line would have at an average roll, before upgrades. */
function nominalStat(item, key) {
  const s = STATS[key];
  const mult = RARITIES[item.rarity].mult * (isMainStat(item, key) ? 1 : 0.5);
  return s.base * (1 + s.growth * ((item.ilvl || 1) - 1)) * mult;
}
/** Lowest and highest whole number a line can roll. */
export function statRange(item, key) {
  const n = nominalStat(item, key);
  return { lo: Math.max(1, Math.round(n * (1 - ROLL_SPREAD))), hi: Math.max(1, Math.round(n * (1 + ROLL_SPREAD))) };
}
/** How good a line's roll is, 0 (the lowest it can be) to 1 (the highest). */
export function rollQuality(item, key) {
  // (0.62) a piece made again for another level keeps the quality it was rolled with (item.q), as long as the
  // line still holds the number that quality was made into (item.qv): a reroll since then counts as it is
  if (item.q && item.qv && item.q[key] != null && item.qv[key] === item.stats[key]) return item.q[key];
  const { lo, hi } = statRange(item, key);
  if (hi <= lo) return 1;
  return Math.max(0, Math.min(1, (item.stats[key] - lo) / (hi - lo)));
}
/**
 * An item made again for another level (0.53: Edric's Colours in the keepsake slot, heirlooms, recalled
 * pieces): every line keeps how good its roll was, at the new level's numbers. +levels, stars, enchants
 * and its effect stay as they were.
 */
export function relevelItem(item, ilvl) {
  if (!item || item.ilvl === ilvl) return item;
  // (0.62) The quality is worked out once and kept (item.q), not read back from the rounded numbers each
  // time: at low levels the ranges are a few points wide, and rounding used to wear Immortal-tier rolls down.
  const q = {};
  for (const k in item.stats) q[k] = rollQuality(item, k);
  item.ilvl = ilvl;
  item.q = q;
  item.qv = {};
  for (const k in item.stats) {
    const { lo, hi } = statRange(item, k);
    item.stats[k] = Math.max(1, Math.round(lo + q[k] * (hi - lo)));
    item.qv[k] = item.stats[k];
  }
  return item;
}
/** Roll quality as a rarity index, Common (0) to Immortal (6): Immortal is the very top of the range. */
export const ROLL_TIER_AT = [0.3, 0.5, 0.68, 0.82, 0.92, 0.98];
export function rollTier(q) {
  let t = 0;
  while (t < ROLL_TIER_AT.length && q >= ROLL_TIER_AT[t] - 1e-9) t++;
  return t;
}
/** A fresh roll for one line of an item (main or bonus), as rerolling and reforging give. */
export function rollLine(key, item, rng, main = isMainStat(item, key)) {
  return statValue(key, item.ilvl, RARITIES[item.rarity].mult * (main ? 1 : 0.5), rng);
}
/**
 * (0.62) Reroll pity: an item rerolled this many times without landing an Immortal-tier line (the best 2% of
 * its range) gets one on the next reroll. The count is the item's own and starts over whenever one lands.
 */
export const REROLL_PITY = 30;
/** A roll for one line in its Immortal tier (the top of ROLL_TIER_AT), for the pity. */
export function immortalLine(key, item, rng) {
  const { lo, hi } = statRange(item, key);
  const min = Math.min(hi, Math.ceil(lo + ROLL_TIER_AT[ROLL_TIER_AT.length - 1] * (hi - lo)));
  return min + Math.floor(rng() * (hi - min + 1));
}
/** (0.29 name) A fresh bonus-stat roll. */
export function rollBonusStat(key, item, rng) {
  return rollLine(key, item, rng, false);
}
/** Wishdust from scrapping an item (Mythic and better only). */
export function dustValue(item) {
  return item.rarity >= 6 ? 4 : item.rarity === 5 ? 2 : item.rarity === 4 ? 1 : 0;
}

// --- Blacksmith upgrades ---------------------------------------------------
export const MAX_PLUS = 10;
export const PLUS_BONUS = 0.08; // each +1 adds 8% to every stat on the item

/** The stats an item actually gives, including its blacksmith upgrades. */
export function itemStats(item) {
  const plus = item.plus || 0;
  const stars = item.stars || 0;
  if (!plus && !stars) return item.stats;
  const out = {};
  for (const k in item.stats) out[k] = Math.round(item.stats[k] * (1 + PLUS_BONUS * plus) * (1 + STAR_BONUS * stars));
  return out;
}

/** A unique Immortal (a Remnant's own drop). */
export function rollUnique(rng, ilvl, key, cls) {
  const e = EFFECTS[key];
  if (!e) return null;
  const item = rollItem(rng, ilvl, { weights: RARITIES.map((_, i) => (i === IMMORTAL ? 1 : 0)), slot: e.slot, cls });
  item.effect = key;
  item.name = e.itemName;
  return item;
}

export function itemName(item) {
  // An Immortal weapon is named for its class (an old Stormcaller dagger is Nightfang now).
  const name = item.effect && item.cls ? effectFor(item.effect, item.cls).itemName : item.name;
  const stars = item.stars ? ' ' + '★'.repeat(item.stars) : '';
  return (item.plus ? `${name} +${item.plus}` : name) + stars;
}

const SCRAP_BY_RARITY = [1, 2, 4, 7, 12, 20, 35];
/** (0.62.1) Scrap and Wishdust are kept through a rebirth now, so a little less of each comes in: three quarters. */
export const KEPT_RATE = 0.75;

/** Scrap you get for breaking an item down. */
export function scrapValue(item) {
  return Math.round((3 + item.ilvl) * SCRAP_BY_RARITY[item.rarity] * (1 + 0.25 * (item.plus || 0)) * KEPT_RATE);
}

/** Cost of taking an item from +n to +n+1. */
export function upgradeCost(item) {
  const n = (item.plus || 0) + 1;
  const lv = 1 + 0.1 * ((item.ilvl || 1) - 1); // better gear costs more to work on, in step with what enemies of that level pay
  return { scrap: Math.round(6 * n * (1 + item.rarity * 0.5) * lv), gold: Math.round(25 * n * n * (1 + item.rarity * 0.25) * lv) };
}

export function itemScore(item) {
  if (!item) return 0;
  const stats = itemStats(item);
  let s = 0;
  for (const k in stats) s += stats[k] * STATS[k].weight;
  if (item.effect) s *= 1.15;
  return s;
}

export function sumGearStats(equipped) {
  const total = {};
  for (const k of STAT_KEYS) total[k] = 0;
  for (const slot of [...SLOTS, 'keepsake']) {
    const it = equipped[slot];
    if (!it) continue;
    const stats = itemStats(it);
    for (const k in stats) total[k] += stats[k];
  }
  return total;
}

export function formatStat(key, value) {
  const s = STATS[key];
  return `${value > 0 ? '+' : ''}${value}${s.pct ? '%' : ''} ${s.label}`;
}

// --- Loot caches (opened in town) -----------------------------------------
// `odds` lines up with RARITIES. They are shown to the player as percentages.
// Caches are bought with gold earned in the arena, or with a key from a boss.
export const CACHES = {
  iron: { name: 'Iron Cache', cost: { gold: 150 }, odds: [0, 50, 32, 13, 4, 1, 0] },
  gilded: { name: 'Gilded Cache', cost: { gold: 600 }, odds: [0, 0, 45, 33, 15, 7, 0] },
  warden: { name: "Warden's Cache", cost: { keys: 1 }, odds: [0, 0, 0, 50, 32, 17, 1] },
};

/**
 * Treasure chests out in the world (world.js openChest). Gold is (12 + 3 per level) times `gold`.
 * Each entry in `items` is one piece of gear: at least rarity `min`, or rolled on `weights`
 * (one weight per rarity, Common to Immortal). A radiant chest (0.49) holds Immortal Fragments too, and
 * its first piece is an Immortal 1.5% of the time (4% on world tier IV and up).
 */
export const CHEST_TIERS = {
  wooden: { name: 'Chest', gold: 1, items: [{ min: 1 }] },
  gilded: { name: 'Gilded chest', gold: 3, potions: true, items: [{ min: 3 }, { min: 2 }] },
  radiant: { name: 'Radiant chest', gold: 10, tickets: 2, potions: true, fragments: true, items: [{ weights: [0, 0, 0, 0, 40, 60, 0], immortal: 1.5, immortalFromTier: 4, immortalHigh: 4 }, { min: 4 }, { min: 3 }] },
};

/**
 * (0.61.9) What "Equip every upgrade" would put on: for each slot, the bag index of the best item that
 * outscores what is worn (the green arrow). Never another class's weapon, never something on offer in a
 * trade, and never an ordinary item over an Immortal or a set piece. Returns { slot: bagIndex }.
 */
export function bestUpgrades(equipped, bag, cls, skip = new Set()) {
  const out = {};
  for (const slot of SLOTS) {
    const worn = equipped[slot];
    let best = -1;
    let bestScore = itemScore(worn);
    bag.forEach((it, i) => {
      if (!it || it.slot !== slot || skip.has(it.id) || (it.cls && it.cls !== cls)) return;
      if (worn && worn.effect && !it.effect) return; // an Immortal stays on
      if (worn && worn.set && !it.set && !it.effect) return; // so does a set piece
      const sc = itemScore(it);
      if (sc > bestScore) { best = i; bestScore = sc; }
    });
    if (best >= 0) out[slot] = best;
  }
  return out;
}
