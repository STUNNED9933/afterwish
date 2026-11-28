// (1.1) Lacuna's own gear: what beasts, elites, world bosses and the Ash Rift drop, and what you do with it.
//
// Five slots (weapon, helm, chest, boots, charm). Each piece has an implicit (what its slot always gives) and, by
// rarity, up to four rolled affixes drawn from the same numbers the talent web uses (0.1 = +10%), so the sim reads
// gear and talents alike. Uniques are named pieces with fixed affixes, and some carry a keystone (with its price).
// Item level is the finder's level: the same piece is worth more found later. Stars (upgrades, up to 5) add 10%
// each to everything on it. Unwanted gear salvages into ash shards; shards reroll an affix or add a star.
//
// Shared by the browser and the server (plain data, numbers from a seeded rng): the server rolls drops in its
// own world and checks what a page says it is wearing (`valid`), so nothing can be worn that could not drop.
import { STAT_TEXT, KEYSTONES } from './tree.js';
import { MAX_LEVEL } from './levels.js';
import { WATCHTOWER } from './land.js';

export const GEAR_SLOTS = ['weapon', 'helm', 'chest', 'boots', 'charm'];
export const GEAR_SLOT_NAMES = { weapon: 'Weapon', helm: 'Helm', chest: 'Chest', boots: 'Boots', charm: 'Charm' };

/** Rarities: how many affixes, how well they roll, and how often (weights for an ordinary drop). Same colours as the main game. */
export const GRADES = [
  { key: 'common', name: 'Common', color: '#b9bdc7', affixes: 0, lo: 0.6, hi: 0.85, weight: 60 },
  { key: 'uncommon', name: 'Uncommon', color: '#58c98b', affixes: 1, lo: 0.6, hi: 0.9, weight: 26 },
  { key: 'rare', name: 'Rare', color: '#5aa2ff', affixes: 2, lo: 0.65, hi: 0.95, weight: 10 },
  { key: 'epic', name: 'Epic', color: '#b97aff', affixes: 3, lo: 0.7, hi: 1, weight: 3.2 },
  { key: 'mythic', name: 'Mythic', color: '#ff5d7a', affixes: 3, lo: 0.85, hi: 1.05, weight: 0.7 },
  { key: 'ancient', name: 'Ancient', color: '#ffa53a', affixes: 4, lo: 0.92, hi: 1.12, weight: 0.12 },
];
export const UNIQUE = 6; // r: 6 is a unique (gold, named)
export const UNIQUE_GRADE = { key: 'unique', name: 'Unique', color: '#ffd24a' };
export const gradeOf = (it) => (it && it.r === UNIQUE ? UNIQUE_GRADE : GRADES[(it && it.r) | 0] || GRADES[0]);

/** An affix's full value (at item level 60, a perfect roll); what can roll on each slot. */
export const AFFIX = {
  dmg: 0.1, melee: 0.14, proj: 0.14, crit: 0.05, critMult: 0.25, aspd: 0.08, leech: 0.015, air: 0.15, area: 0.12,
  hp: 0.1, mana: 0.12, regen: 0.2, cdr: 0.08, life: 0.4, armour: 0.06, bloodDmg: 0.15, stillDmg: 0.15,
  move: 0.06, jump: 0.1, hopCap: 0.12, rollFar: 0.25, pour: 0.25, whirlCost: 0.2, pierce: 0.1,
};
export const POOL = {
  weapon: ['dmg', 'melee', 'proj', 'crit', 'critMult', 'aspd', 'leech', 'air', 'area'],
  helm: ['hp', 'mana', 'regen', 'cdr', 'crit', 'life', 'critMult'],
  chest: ['hp', 'armour', 'life', 'leech', 'bloodDmg', 'stillDmg', 'regen'],
  boots: ['move', 'jump', 'hopCap', 'air', 'rollFar', 'armour', 'hp'],
  charm: ['crit', 'critMult', 'cdr', 'leech', 'pour', 'whirlCost', 'pierce', 'regen', 'dmg'],
};
/** What each slot always gives (its implicit), at full value. */
export const IMPLICIT = { weapon: ['dmg', 0.06], helm: ['hp', 0.06], chest: ['armour', 0.04], boots: ['move', 0.03], charm: ['crit', 0.02] };
/** Base names by slot (a tier of base per 15 levels). */
export const BASES = {
  weapon: ['Notched Blade', 'Ridge Sword', 'Wakewood Greatsword', 'Ash-Tempered Edge'],
  helm: ['Leather Cap', 'Banded Helm', 'Hunter\'s Hood', 'Cinder Visor'],
  chest: ['Padded Jerkin', 'Ringmail Shirt', 'Hound\'s Brigandine', 'Ashwoven Hauberk'],
  boots: ['Soft Boots', 'Trail Boots', 'Ridgewalkers', 'Embertread Boots'],
  charm: ['Carved Bead', 'Bone Charm', 'Amber Token', 'Ash-Glass Sigil'],
};
export const baseOf = (slot, ilvl) => BASES[slot][Math.min(3, Math.floor((Math.max(1, ilvl) - 1) / 15))];

/** The uniques: fixed affixes (full values, still scaled by item level), keystones taken with their price. */
export const UNIQUES = {
  cairnbreaker: { slot: 'weapon', name: 'Cairn-Breaker', lore: 'A cairn golem\'s heartstone, set on a haft by someone very patient.', aff: { melee: 0.2, skyStun: 0.5, area: 0.15 } },
  thornbow: { slot: 'weapon', name: 'Thornwood Longbow', lore: 'Strung with hog-gut. Arrows from it never quite stop.', aff: { proj: 0.18, pierce: 0.12 }, flat: { bounce: 1 } },
  cinders: { slot: 'helm', name: 'Crown of Cinders', lore: 'Still warm. It is always still warm.', aff: { hp: 0.08 }, key: 'vampire' },
  mantle: { slot: 'chest', name: 'The Unbound\'s Mantle', lore: 'Taken from an acolyte at the tower. It smells of the other side.', aff: { hp: 0.15, bloodDmg: 0.2 }, key: 'bloodMagic' },
  feather: { slot: 'boots', name: 'Featherweight Soles', lore: 'Juni swears she has never seen these before. She is lying.', aff: { jump: 0.12 }, flat: { kicks: 1 }, key: 'featherfall' },
  slipstream: { slot: 'boots', name: 'Slipstream Greaves', lore: 'Run, and keep running, and the ground forgets to slow you.', aff: { hopCap: 0.25, move: 0.08 } },
  string: { slot: 'charm', name: 'Juni\'s Spare String', lore: '"Give it back when you\'re done." You will not be done.', aff: { proj: 0.1 }, flat: { fork: 1 } },
  ridge: { slot: 'charm', name: 'Eye of the Ridge', lore: 'From the top of the old watchtower you can see the whole land. So can this.', aff: { crit: 0.06, critMult: 0.3 }, key: 'eagleEye' },
};
export const UNIQUE_IDS = Object.keys(UNIQUES);

export const MAX_STARS = 5;
export const STAR = 0.1;
/** How much item level is worth: a level-1 find is 40% of a level-60 one. */
export const ilvlScale = (ilvl) => 0.4 + 0.6 * (Math.max(1, Math.min(MAX_LEVEL, ilvl)) - 1) / (MAX_LEVEL - 1);
const round = (v) => Math.round(v * 10000) / 10000;

/** Pick a rarity: weights shifted toward the rare by `luck` (1 = ordinary), never below `floor`. */
export function rollGrade(rng, luck = 1, floor = 0) {
  const w = GRADES.map((g, i) => (i < floor ? 0 : g.weight * Math.pow(luck, i / 2)));
  let t = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0 && w[i] > 0) return i; }
  return GRADES.length - 1;
}

let made = 0;
/** A fresh id for an item (unique enough for one player's bag). */
function newId(rng) { made = (made + 1) % 1296; return Math.floor(rng() * 2176782336).toString(36) + made.toString(36); }

/** A rolled affix value: full value x item level x the grade's range. */
function affixValue(rng, stat, ilvl, g) { return round(AFFIX[stat] * ilvlScale(ilvl) * (g.lo + rng() * (g.hi - g.lo))); }

/** Roll one item. opts: { ilvl, slot?, r? (a rarity), luck, floor, unique? (an id, or a chance) } */
export function rollItem(rng, { ilvl = 1, slot = null, r = null, luck = 1, floor = 0, unique = 0 } = {}) {
  ilvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(ilvl)));
  if (typeof unique === 'string' || (unique > 0 && rng() < unique)) {
    const u = typeof unique === 'string' ? unique : UNIQUE_IDS[Math.floor(rng() * UNIQUE_IDS.length)];
    return { id: newId(rng), slot: UNIQUES[u].slot, r: UNIQUE, u, ilvl, stars: 0 };
  }
  slot = slot || GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)];
  const ri = r !== null ? Math.max(0, Math.min(GRADES.length - 1, r)) : rollGrade(rng, luck, floor), g = GRADES[ri];
  const pool = POOL[slot].slice(), aff = [];
  for (let k = 0; k < g.affixes && pool.length; k++) {
    const stat = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    aff.push([stat, affixValue(rng, stat, ilvl, g)]);
  }
  return { id: newId(rng), slot, r: ri, ilvl, base: baseOf(slot, ilvl), aff, stars: 0 };
}

/** Everything an item gives, as the sim reads it: { mods, keys }. */
export function itemMods(it) {
  const mods = {}, keys = [];
  if (!it) return { mods, keys };
  const k = ilvlScale(it.ilvl) * (1 + STAR * Math.min(MAX_STARS, it.stars || 0));
  const add = (s, v) => { mods[s] = round((mods[s] || 0) + v); };
  if (it.r === UNIQUE) {
    const U = UNIQUES[it.u];
    if (!U) return { mods, keys };
    for (const [s, v] of Object.entries(U.aff)) add(s, v * k);
    for (const [s, v] of Object.entries(U.flat || {})) add(s, v);
    if (U.key) { keys.push(U.key); for (const [s, v] of Object.entries(KEYSTONES[U.key].mods || {})) add(s, v); }
    return { mods, keys };
  }
  const [is, iv] = IMPLICIT[it.slot];
  add(is, iv * ilvlScale(it.ilvl) * (1 + 0.12 * it.r) * (1 + STAR * Math.min(MAX_STARS, it.stars || 0)));
  const sk = 1 + STAR * Math.min(MAX_STARS, it.stars || 0);
  for (const [s, v] of it.aff || []) add(s, v * sk);
  return { mods, keys };
}

/** What a set of worn items gives together (one per slot). */
export function gearMods(worn) {
  const mods = {}, keys = new Set();
  for (const it of Object.values(worn || {})) {
    const m = itemMods(it);
    for (const [s, v] of Object.entries(m.mods)) mods[s] = round((mods[s] || 0) + v);
    for (const key of m.keys) keys.add(key);
  }
  return { mods, keys };
}

/** An item's lines, for a tooltip: [{ text, kind: 'implicit' | 'affix' | 'key' }]. */
export function itemLines(it) {
  const out = [];
  if (!it) return out;
  const fmt = (s, v) => (STAT_TEXT[s] ? STAT_TEXT[s](Math.abs(v) >= 1 ? Math.round(v) : round(v)) : `${s} ${v}`);
  if (it.r === UNIQUE) {
    const U = UNIQUES[it.u], k = ilvlScale(it.ilvl) * (1 + STAR * Math.min(MAX_STARS, it.stars || 0));
    for (const [s, v] of Object.entries(U.aff)) out.push({ text: fmt(s, v * k), kind: 'affix' });
    for (const [s, v] of Object.entries(U.flat || {})) out.push({ text: fmt(s, v), kind: 'affix' });
    if (U.key) out.push({ text: `Keystone: ${KEYSTONES[U.key].name}. ${KEYSTONES[U.key].text.join('. ')}`, kind: 'key' });
    return out;
  }
  const m0 = itemMods({ ...it, aff: [] });
  for (const [s, v] of Object.entries(m0.mods)) out.push({ text: fmt(s, v), kind: 'implicit' });
  const sk = 1 + STAR * Math.min(MAX_STARS, it.stars || 0);
  for (const [s, v] of it.aff || []) out.push({ text: fmt(s, v * sk), kind: 'affix' });
  return out;
}
export const itemName = (it) => (it.r === UNIQUE ? UNIQUES[it.u].name : `${GRADES[it.r].key === 'common' ? '' : GRADES[it.r].name + ' '}${it.base}`);

/** A rough worth, for comparing and sorting: the sum of what it gives, weighted. */
export const itemScore = (it) => Object.values(itemMods(it).mods).reduce((a, v) => a + Math.abs(v), 0) + (it.r === UNIQUE ? 0.3 : 0);

// ---- salvage and crafting (ash shards)
/** Shards for breaking an item down. */
export const salvageValue = (it) => (it.r === UNIQUE ? 40 : [1, 2, 4, 9, 18, 32][it.r] || 1) + 3 * (it.stars || 0);
/** Shards to reroll one affix (a new stat, a new value), and to add a star. */
export const rerollCost = (it) => 4 + 4 * it.r;
export const starCost = (it) => Math.round((8 + 6 * (it.r === UNIQUE ? 5 : it.r)) * (1 + (it.stars || 0)));
/** Reroll affix `i`: a stat from the slot's pool that is not already on it, at a fresh value. Returns a new item. */
export function reroll(rng, it, i) {
  if (it.r === UNIQUE || !it.aff || !it.aff[i]) return null;
  const have = new Set(it.aff.map(([s]) => s));
  have.delete(it.aff[i][0]);
  const pool = POOL[it.slot].filter((s) => !have.has(s));
  const stat = pool[Math.floor(rng() * pool.length)];
  const aff = it.aff.slice();
  aff[i] = [stat, affixValue(rng, stat, it.ilvl, GRADES[it.r])];
  return { ...it, aff };
}
export const addStar = (it) => ((it.stars || 0) >= MAX_STARS ? null : { ...it, stars: (it.stars || 0) + 1 });

// ---- checking what a page says it wears (the server)
/** Could this item have dropped for someone of level `level`? (Its numbers within what a roll could give.) */
export function valid(it, level = MAX_LEVEL) {
  if (!it || typeof it !== 'object' || !GEAR_SLOTS.includes(it.slot)) return false;
  if (!Number.isInteger(it.ilvl) || it.ilvl < 1 || it.ilvl > Math.min(MAX_LEVEL, level)) return false;
  if (!Number.isInteger(it.stars || 0) || (it.stars || 0) < 0 || it.stars > MAX_STARS) return false;
  if (it.r === UNIQUE) return !!UNIQUES[it.u] && UNIQUES[it.u].slot === it.slot;
  const g = GRADES[it.r];
  if (!g || !Number.isInteger(it.r) || !Array.isArray(it.aff) || it.aff.length > g.affixes) return false;
  const seen = new Set();
  for (const a of it.aff) {
    if (!Array.isArray(a) || !POOL[it.slot].includes(a[0]) || seen.has(a[0]) || typeof a[1] !== 'number') return false;
    seen.add(a[0]);
    if (!(a[1] > 0) || a[1] > AFFIX[a[0]] * ilvlScale(it.ilvl) * g.hi + 1e-4) return false;
  }
  return true;
}
/** What a page says is worn, cleaned: only valid items, one per slot, in their own slot. */
export function cleanWorn(worn, level) {
  const out = {};
  if (!worn || typeof worn !== 'object') return out;
  for (const slot of GEAR_SLOTS) {
    const it = worn[slot];
    if (it && it.slot === slot && valid(it, level)) out[slot] = { id: String(it.id || '').slice(0, 20), slot, r: it.r, ilvl: it.ilvl, stars: it.stars || 0, ...(it.r === UNIQUE ? { u: it.u } : { base: String(it.base || '').slice(0, 40), aff: it.aff.map(([s, v]) => [s, v]) }) };
  }
  return out;
}

// ---- where loot comes from
/**
 * A drop table for something killed: how many items, and at what odds.
 *   rank 0 an ordinary beast, 1 an elite (Ash-touched), 2 a rare named beast, 3 a world boss, 'rift' a Rift chest (tier)
 */
export function dropsFor(rank, rng, ilvl, tier = 1) {
  const out = [];
  if (rank === 0) { if (rng() < 0.09) out.push(rollItem(rng, { ilvl })); }
  else if (rank === 1) { out.push(rollItem(rng, { ilvl, luck: 1.6, floor: 1 })); if (rng() < 0.25) out.push(rollItem(rng, { ilvl })); }
  else if (rank === 2) { out.push(rollItem(rng, { ilvl, luck: 2.2, floor: 2, unique: 0.1 })); out.push(rollItem(rng, { ilvl, luck: 1.6, floor: 1 })); }
  else if (rank === 3) { out.push(rollItem(rng, { ilvl, luck: 2.6, floor: 3, unique: 0.25 })); out.push(rollItem(rng, { ilvl, luck: 2.2, floor: 2 })); out.push(rollItem(rng, { ilvl, luck: 1.6, floor: 1 })); }
  else if (rank === 'rift') {
    const n = 2 + Math.floor(tier / 2);
    for (let k = 0; k < n; k++) out.push(rollItem(rng, { ilvl, luck: 1.4 + 0.15 * tier, floor: Math.min(4, Math.floor(tier / 3)), unique: k === 0 ? Math.min(0.5, 0.04 * tier) : 0 }));
  }
  return out;
}

/** Elites and rare named beasts: how often, how much tougher, and their names. */
export const ELITE = { chance: 0.06, named: 0.009, hp: 3.2, dmg: 1.5, xp: 4, size: 1.25 };
export const NAMED = { hp: 7, dmg: 1.9, xp: 10, size: 1.45 };
export const NAMES = {
  wolf: ['Old Greymuzzle', 'Hollowfang', 'The Widow of the Wakewood', 'Ashpelt'],
  hog: ['Bristleback the Elder', 'Mudking', 'Old Tusk', 'The Barley Thief'],
  golem: ['The Leaning Cairn', 'Graveldown', 'Mossheart', 'Old Stoneshoulder'],
};
/** World bosses: one for each wild ground, back every so often. */
export const BOSSES = {
  wolf: { name: 'Ashmaw, Mother of Wolves', hp: 60, dmg: 2.6, xp: 30, size: 2.3, slam: { r: 4.2, every: 6.5, warn: 1.3, dmg: 2.2 } },
  hog: { name: 'Old Gorge, the Barley Tyrant', hp: 55, dmg: 2.4, xp: 30, size: 2.4, slam: { r: 5, every: 7, warn: 1.4, dmg: 2 } },
  golem: { name: 'The Cairn King', hp: 40, dmg: 2.2, xp: 30, size: 2.1, slam: { r: 5.5, every: 8, warn: 1.6, dmg: 2.4 } },
};
export const BOSS_EVERY = 12 * 60; // seconds between a boss's death and its return
export const BOSS_FIRST = 90; // after the world starts

/** The Ash Rift: tiers and waves. */
export const RIFT = { waves: 5, most: 30, time: 300, reach: 45 };
/** Where it opens: the circle at the watchtower's foot (the one shut at the end of Act I: it still leaks). */
export const RIFT_AT = { x: WATCHTOWER.x, z: WATCHTOWER.z + 5 };
/** Its foes (beasts underneath, as the wards' guards are; tier and level make them tougher). */
export const RIFT_FOES = {
  thrall: { type: 'wolf', look: 'thrall', size: 1, def: { name: 'Ash Thrall', speed: 3.6, aggro: 30, leash: 60, r: 0.5, hp: 300, dmg: 16, every: 1.4, xp: 22 } },
  acolyte: { type: 'golem', look: 'acolyte', size: 1, def: { name: 'Unbound Acolyte', speed: 3.0, aggro: 30, leash: 60, r: 0.6, hp: 1100, dmg: 26, every: 1.7, xp: 70 } },
  warden: { type: 'golem', look: 'acolyte', size: 1.5, def: { name: 'Rift Warden', speed: 3.2, aggro: 30, leash: 60, r: 0.9, hp: 4200, dmg: 38, every: 1.6, xp: 260 } },
};
/** How hard a rift tier is: health and damage on top of the opener's level. */
export const riftScale = (tier) => ({ hp: 1 + 0.5 * (tier - 1), dmg: 1 + 0.22 * (tier - 1) });
