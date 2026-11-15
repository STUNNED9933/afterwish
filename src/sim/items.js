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
export const ROLL_SPREAD = 0.06;
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
  { key: 'immortal', prefix: '', name: 'Immortal', color: '#7ff5e1', mult: 3.4, affixes: 4, weight: 0, effect: true },
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
    desc: 'A killing blow leaves you alive with 35% of your health instead. Ready again each arena wave, in Haven, or 2 minutes after it saves you.',
    byClass: Object.fromEntries(Object.entries(ESCAPE).map(([cls, e]) => [cls, { desc: `A killing blow leaves you alive with 35% of your health instead, and ${e} is ready again at once. Ready again each arena wave, in Haven, or 2 minutes after it saves you.` }])),
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
    desc: 'Every 4 seconds, spores heal you for 1.5% of your max health for every enemy within 6 m (up to 9%).',
  },
  unwished: {
    slot: 'helm', unique: 'boss3',
    name: 'The Unwished Crown',
    itemName: 'The Unwished Crown',
    desc: 'Doom takes half as much from you. Each Doom aimed at you that you avoid makes you deal 20% more damage for 5 seconds.',
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
    helm: { name: 'Crown of the Last Breath', desc: "Blood Rage's last breath is ready every 15 seconds instead of 30, and it gives you 3 seconds of Crimson Oath.", apply: (m) => { m.bloodSave = Math.min(m.bloodSave || 30, 15); m.lastBreathOath = 3; } },
    chest: { name: 'Scarred Hauberk', desc: 'While Bloodied, you take a further 15% less damage.', apply: (m) => { m.bloodGuard += 0.15; } },
    boots: { name: 'Red Stride', desc: 'While Bloodied, +25% move speed; Whirlwind spins 1 second longer.', apply: (m) => { m.bloodMs += 0.25; m.wSpinTime += 1; } },
    ring: { name: 'Oathblood Signet', desc: "Crimson Oath's cooldown is 40% shorter and it lasts 3 seconds longer.", apply: (m) => { m.rCd *= 0.6; m.rDuration += 3; } },
  },
  bulwark: {
    weapon: { name: 'Wardbreaker', desc: 'Cleave strikes a second time for 60%, and enemies you have taunted take 20% more damage from everyone.', apply: (m) => { m.qEcho = Math.max(m.qEcho, 0.6); m.tauntVuln += 0.2; } },
    helm: { name: 'Crown of the Iron Answer', desc: 'Blocking a red attack with Iron Answer heals you for 10% of your max health and gives 2 Reckoning stacks.', apply: (m) => { m.blockHeal += 0.1; m.blockReckon += 1; } },
    chest: { name: 'Bastion Plate', desc: 'Hold the Line cuts damage by 50% instead of 35%, and lasts 3 seconds longer.', apply: (m) => { m.bastionDr += 0.15; m.rDuration += 3; } },
    boots: { name: 'Unyielding Greaves', desc: 'Parrying no longer slows you, and every parry or block takes 1 second off Whirlwind.', apply: (m) => { m.parryFree = true; m.parryCdrW += 1; } },
    ring: { name: "Warden's Seal", desc: 'Reckoning gains a stack for every 5% of your health lost (instead of 10%) and holds 2 more.', apply: (m) => { m.reckonHp = 0.05; m.reckonMaxAdd += 2; } },
  },
  sharpshooter: {
    weapon: { name: 'Farstring', desc: 'Long Watch goes up to 70% more damage (instead of 40%).', apply: (m) => { m.farShotMax += 0.3; } },
    helm: { name: "Hawk's Hood", desc: 'Deadeye fires 2 more shots and comes back 30% sooner.', apply: (m) => { m.rExtraShots += 2; m.rCd *= 0.7; } },
    chest: { name: "Rangekeeper's Coat", desc: 'While no enemy is within 6 m of you, you take 25% less damage.', apply: (m) => { m.farGuard += 0.25; } },
    boots: { name: 'Quickstep Boots', desc: 'Evasive Roll comes back 40% sooner.', apply: (m) => { m.eCd *= 0.6; } },
    ring: { name: 'Bullseye Loop', desc: 'Piercing Shot always crits and deals 30% more to enemies more than 10 m away.', apply: (m) => { m.qCrit = true; m.qFar += 0.3; } },
  },
  windrunner: {
    weapon: { name: 'Galestring', desc: "Tailwind's on-hit damage is 50% higher.", apply: (m) => { m.tailwind *= 1.5; } },
    helm: { name: 'Eye of the Gale', desc: "Hurricane lasts 3 seconds longer, and its extra arrows deal 80% (instead of 45%).", apply: (m) => { m.rDuration += 3; m.hurricaneMult = Math.max(m.hurricaneMult, 0.8); } },
    chest: { name: 'Windwoven Vest', desc: 'While you have Tailwind, you take 20% less damage.', apply: (m) => { m.tailGuard += 0.2; } },
    boots: { name: 'Zephyr Treads', desc: 'Every basic attack with Tailwind takes 0.5 seconds off Evasive Roll (instead of 0.3).', apply: (m) => { m.tailwindCdr = Math.max(m.tailwindCdr, 0.5); } },
    ring: { name: 'Storm Sigil', desc: 'Barrage looses 3 more arrows.', apply: (m) => { m.wExtra += 3; } },
  },
  assassin: {
    weapon: { name: 'Nightfang', desc: "Shadowstrike's double damage works below 40% health (instead of 30%), and your crits deal a further 25%.", apply: (m) => { m.qExecute += 0.1; m.critMult += 0.25; } },
    helm: { name: 'Mask of the Unseen', desc: "Ambush's empowered ability deals 85% more (instead of 35%).", apply: (m) => { m.eEmpower += 0.5; } },
    chest: { name: 'Shroud of Last Rites', desc: 'Every Clean Kill heals you for 5% of your max health.', apply: (m) => { m.killHeal += 0.05; } },
    boots: { name: 'Silent Step', desc: 'Shadowstrike leaps 50% further, and Ambush comes back 30% sooner.', apply: (m) => { m.qRange *= 1.5; m.eCd *= 0.7; } },
    ring: { name: 'Contract Seal', desc: 'Every Clean Kill also takes 8 seconds off Last Rites.', apply: (m) => { m.killResetR += 8; } },
  },
  shadowdancer: {
    weapon: { name: 'Starglass Edge', desc: 'Starglass Kunai thrown while Veiled deal 40% more, and each afterimage throws two.', apply: (m) => { m.veilKunai += 0.4; m.kunaiTwice = true; } },
    helm: { name: 'Mirror Veil', desc: 'Afterimages last 3 seconds longer, and Veil lasts 2 seconds longer.', apply: (m) => { m.shadowDur += 3; m.veilTime += 2; } },
    chest: { name: 'Shadowweave', desc: 'While Veiled, you take 25% less damage.', apply: (m) => { m.veilGuard += 0.25; } },
    boots: { name: 'Twinstep', desc: 'Veilstep comes back 40% sooner.', apply: (m) => { m.qCd *= 0.6; } },
    ring: { name: 'Loop of the Second Death', desc: 'Second Death repeats a further 25%, and Last Rites comes back 25% sooner.', apply: (m) => { m.rMark += 0.25; m.rCd *= 0.75; } },
  },
  pyromancer: {
    weapon: { name: 'Emberheart', desc: 'Burns stack 3 higher, and every stack burns 20% more.', apply: (m) => { m.burnMax += 3; m.burnMult *= 1.2; } },
    helm: { name: 'Crown of Cinders', desc: 'Smoulder bursts 50% wider and gives 3 burn stacks instead of 2.', apply: (m) => { m.wRadius *= 1.5; m.smoulderStacks = Math.max(m.smoulderStacks, 3); } },
    chest: { name: 'Ashen Robe', desc: 'For each burning enemy within 8 m, you take 4% less damage (up to 24%).', apply: (m) => { m.burnGuard += 0.04; } },
    boots: { name: 'Cinderwalk', desc: '+15% move speed, and Fire Bolt comes back 30% sooner.', apply: (m) => { m.msPct += 0.15; m.qCd *= 0.7; } },
    ring: { name: 'Seal of the Second Sun', desc: 'Cinderfall comes back 40% sooner and erupts again for 70%.', apply: (m) => { m.rCd *= 0.6; m.rAftershock = Math.max(m.rAftershock, 0.7); } },
  },
  frostbinder: {
    weapon: { name: 'Rimecaller', desc: 'Ice Bolt gives 3 Hoarfrost instead of 2, and Shatter deals 30% more.', apply: (m) => { m.qFrost = Math.max(m.qFrost, 3); m.frostDmg *= 1.3; } },
    helm: { name: 'Glacial Crown', desc: 'Frozen enemies stay frozen 50% longer, and Brittle bosses take 25% more (instead of 15%).', apply: (m) => { m.frostFreeze *= 1.5; m.brittle = Math.max(m.brittle, 0.25); } },
    chest: { name: 'Rimeguard Mantle', desc: 'Every Shatter restores 30% of your Arcane Ward.', apply: (m) => { m.shatterWard += 0.3; } },
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
// every star adds 10% to all its stats (on top of blacksmith upgrades).
export const MAX_STARS = 5;
export const STAR_BONUS = 0.1;

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

const BASE_NAMES = {
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
    four: { desc: 'Rolling through an attack (a perfect dodge) whips up 3 seconds of Hurricane.', apply: (m) => { m.galeHurricane = Math.max(m.galeHurricane, 3); } } },
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
  fragment: { name: 'Immortal Fragment', desc: 'Gather enough and craft an Immortal of your choice of slot (gear screen, from level 70).', color: '#7ff5e1' },
  sigil: { name: 'Remnant Sigil', desc: "Press it into a boss's altar (where it fights) to call up its Remnant at once, if you have beaten that boss three times.", color: '#a64bff' },
};
export const MISC_IDS = Object.keys(MISC);

// --- Enchanting (0.29) -------------------------------------------------------
// Reroll one bonus stat on an item into another stat (never the main stat). Once an item
// has been enchanted, only that same line can be enchanted again, and each time costs more.
export const ENCHANT_POOL = ['as', 'crit', 'lifesteal', 'haste', 'armor', 'hp'];
export function enchantCost(item) {
  const n = item.enchants || 0;
  const lv = 1 + 0.1 * ((item.ilvl || 1) - 1);
  return { gold: Math.round(120 * (1 + item.rarity) * lv * (1 + n)), dust: 1 + item.rarity + n };
}
/** Which of an item's stats can be enchanted right now. */
export function enchantable(item) {
  if (!item) return [];
  const keys = Object.keys(item.stats).slice(1); // the first is the main stat
  if (item.enchantKey && keys.includes(item.enchantKey)) return [item.enchantKey];
  return keys;
}
/** A fresh bonus-stat roll for an item (what enchanting gives). */
export function rollBonusStat(key, item, rng) {
  return statValue(key, item.ilvl, RARITIES[item.rarity].mult * 0.5, rng);
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

/** Scrap you get for breaking an item down. */
export function scrapValue(item) {
  return Math.round((3 + item.ilvl) * SCRAP_BY_RARITY[item.rarity] * (1 + 0.25 * (item.plus || 0)));
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
  for (const slot of SLOTS) {
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
 * (one weight per rarity, Common to Immortal). A radiant chest has a 12% chance of an Immortal.
 */
export const CHEST_TIERS = {
  wooden: { name: 'Chest', gold: 1, items: [{ min: 1 }] },
  gilded: { name: 'Gilded chest', gold: 3, potions: true, items: [{ min: 3 }, { min: 2 }] },
  // (an Immortal only on world tier IV and up, 3%: world.js openChest)
  radiant: { name: 'Radiant chest', gold: 6, tickets: 1, potions: true, items: [{ weights: [0, 0, 0, 0, 64, 36, 0], immortalFromTier: 4, immortal: 3 }, { min: 3 }] },
};
