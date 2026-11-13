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
  { key: 'legendary', prefix: 'Ancient', name: 'Legendary', color: '#ffa53a', mult: 2.3, affixes: 3, weight: 1.8 },
  { key: 'mythic', prefix: 'Mythic', name: 'Mythic', color: '#ff5d7a', mult: 2.8, affixes: 4, weight: 0.5 },
  { key: 'immortal', prefix: '', name: 'Immortal', color: '#7ff5e1', mult: 3.4, affixes: 4, weight: 0.1, effect: true },
];
export const IMMORTAL = RARITIES.length - 1;

// Special effects. Every Immortal item carries the effect for its slot.
// The game logic for each lives in sim/world.js (search for `mods.<key>`).
export const EFFECTS = {
  stormcaller: {
    slot: 'weapon',
    name: 'Stormcaller',
    itemName: 'Stormcaller',
    desc: 'Every 4th basic attack calls lightning for 150% attack damage on your target and enemies near it.',
  },
  undying: {
    slot: 'helm',
    name: 'Undying',
    itemName: 'Crown of the Undying',
    desc: 'Once per wave, a killing blow leaves you alive and restores 35% of your health.',
  },
  retribution: {
    slot: 'chest',
    name: 'Retribution',
    itemName: 'Aegis of Retribution',
    desc: 'Every parry releases a shockwave for 120% attack damage around you. Perfect parries deal 200%.',
  },
  slipstream: {
    slot: 'boots',
    name: 'Slipstream',
    itemName: 'Slipstream Treads',
    desc: 'A perfect parry or perfect dodge gives +40% move speed and +30% attack speed for 4 seconds.',
  },
  timekeeper: {
    slot: 'ring',
    name: 'Timekeeper',
    itemName: 'The Timekeeper',
    desc: 'Slowed time lasts 60% longer, and every kill takes 0.5s off your ability cooldowns.',
  },
};
const EFFECT_FOR_SLOT = {};
for (const key in EFFECTS) EFFECT_FOR_SLOT[EFFECTS[key].slot] = key;

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
  const item = { id: 'i' + Date.now().toString(36) + '-' + itemCounter++, name: '', slot, rarity: ri, ilvl, stats, plus: 0 };
  if (rarity.effect) {
    item.effect = EFFECT_FOR_SLOT[slot];
    item.name = EFFECTS[item.effect].itemName;
  } else {
    item.name = (rarity.prefix ? rarity.prefix + ' ' : '') + (weapon ? weapon.names : BASE_NAMES[slot])[tier];
  }
  if (weapon && cls) item.cls = cls;
  return item;
}

export function starterWeapon(cls = 'warrior') {
  const w = WEAPONS[cls] || WEAPONS.warrior;
  return { id: 'starter', name: w.starter, slot: 'weapon', cls, rarity: 0, ilvl: 1, stats: { [w.main]: 5, [w.bonus[0]]: 3 }, plus: 0 };
}

// --- Blacksmith upgrades ---------------------------------------------------
export const MAX_PLUS = 10;
export const PLUS_BONUS = 0.08; // each +1 adds 8% to every stat on the item

/** The stats an item actually gives, including its blacksmith upgrades. */
export function itemStats(item) {
  const plus = item.plus || 0;
  if (!plus) return item.stats;
  const out = {};
  for (const k in item.stats) out[k] = Math.round(item.stats[k] * (1 + PLUS_BONUS * plus));
  return out;
}

export function itemName(item) {
  return item.plus ? `${item.name} +${item.plus}` : item.name;
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
  iron: { name: 'Iron Cache', cost: { gold: 150 }, odds: [0, 50, 32, 13, 4, 0.9, 0.1] },
  gilded: { name: 'Gilded Cache', cost: { gold: 600 }, odds: [0, 0, 45, 33, 15, 5.5, 1.5] },
  warden: { name: "Warden's Cache", cost: { keys: 1 }, odds: [0, 0, 0, 50, 32, 14, 4] },
};
