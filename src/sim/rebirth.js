import { emberForGear } from './endgame.js';
// Rebirth (0.43): begin again from level 1, and keep what the star remembers of you.
//
// Once a hero is level 100 and has beaten The Unmade, they can ask the fallen star to begin again.
// Everything about that life goes: level, gear, gold in the bag aside (gold belongs to the account),
// story, quests, world tiers, talents and Wishborne levels (0.62.1: scrap, Wishdust and keys stay). What stays is what the
// star remembers: Starmarks, spent on Rebirth perks that last for every life after, the weapon glows
// that hero has earned (one more for some rebirths), and a little EXP for every hero on the account.
//
// Starmarks for one rebirth = 10 for reaching level 100, plus 2 x the square root of Wishborne levels
// (25 Wishborne levels: +10, 100: +20, 400: +40). The root means a long life pays well without making
// one endless life worth more than starting again.
//
// The story (see docs/design/act-ii.md): the star grants exactly what is asked. Ask it to begin again
// and it will; it does not forget. The second ending planned for Unwish ("Take her place") is a
// special rebirth that builds on this one: `past` keeps a short record of each life it can use.

export const REBIRTH = {
  level: 100, // the least level to be reborn
  boss: 'boss3', // ...having beaten The Unmade at least once
  base: 10, // Starmarks for reaching level 100
  wishK: 2, // ...plus wishK x sqrt(Wishborne levels)
  gearDiv: 4, // ...(0.58.2) plus sqrt(what you give up) / gearDiv...
  gearMax: 15, // ...up to this many
  acctExp: 0.05, // every rebirth on any hero: +5% EXP for every hero on the account
  acctExpMax: 0.5,
  pastMax: 12, // lives remembered
};

/** Rebirth perks: bought with Starmarks, kept for every life after. `cost` is per rank. */
export const PERKS = {
  starborn: { name: 'Starborn', max: 25, cost: 2, each: '+2% damage and health', desc: (r) => `+${2 * r}% damage and health.` },
  study: { name: 'Quick Study', max: 10, cost: 1, each: '+10% EXP', desc: (r) => `+${10 * r}% EXP.` },
  fortune: { name: 'Fortune', max: 10, cost: 1, each: '+10% gold', desc: (r) => `+${10 * r}% gold from enemies and chests.` },
  luck: { name: 'Lucky Star', max: 5, cost: 3, each: '+4% better drops', desc: (r) => `${4 * r}% of gear that drops comes one rarity higher (up to Ancient).` },
  head: { name: 'Head Start', max: 5, cost: 2, each: '+1 skill point', desc: (r) => `Begin each life with ${r} extra skill point${r === 1 ? '' : 's'}.` },
  pockets: { name: 'Deep Pockets', max: 3, cost: 3, each: '+4 bag slots', desc: (r) => `+${4 * r} bag slots.` },
  wishes: { name: 'Old Wishes', max: 6, cost: 2, each: '5% quicker Wishborne levels', desc: (r) => `Wishborne levels need ${5 * r}% less EXP.` },
};
export const PERK_IDS = Object.keys(PERKS);

/**
 * Echoes (0.53): what giving up your gear is worth. At a rebirth every piece you wear turns into Echo
 * Essence (more for rarer pieces, +levels and stars) and the star remembers the best piece you have
 * worn in each slot. Later lives spend Essence to:
 *   - recall a remembered piece, made again at your level (rarity, effect, how good its rolls were,
 *     its enchant; +levels and stars start again), Ancients from level 30 and Immortals from 40;
 *   - bring any piece in that slot back up to the +level and stars you once had (Essence instead of
 *     gold, scrap and duplicate Immortals);
 *   - reroll a line (1 Essence instead of gold and scrap).
 * And one piece can go with you as an Heirloom: chosen at the rebirth, back at level 1, growing with you.
 */
export const ECHOES = {
  rarity: [0, 1, 2, 4, 8, 15, 30], // Essence a piece gives, by rarity...
  plus: 0.25, // ...times (1 + 0.25 a +level)
  star: 0.5, // ...times (1 + 0.5 a star)
  recall: [0, 10, 20, 40, 80, 150, 300], // Essence to recall a remembered piece, by rarity
  recallFrom: [1, 1, 1, 10, 20, 30, 40], // the least level to recall it at
  plusCost: 4, // Essence for each +level, up to the remembered one
  starCost: 40, // Essence for each star, up to the remembered ones (no duplicate needed)
  reroll: 1, // Essence for a reroll
};
export function essenceFor(item) {
  if (!item) return 0;
  return Math.round((ECHOES.rarity[item.rarity] || 0) * (1 + ECHOES.plus * (item.plus || 0)) * (1 + ECHOES.star * (item.stars || 0)));
}
const memoryRank = (it) => (it ? it.rarity * 1000 + (it.stars || 0) * 100 + (it.plus || 0) : -1);

/** Weapon glows for some rebirths (see sim/cosmetics.js). */
export const REBIRTH_GLOWS = { 1: 'dawn', 3: 'thrice', 5: 'evermore', 10: 'eternal' };

/**
 * (0.58) What a rebirth turns this hero's gear into: Echo Essence, Ember and Starmarks, all from
 * what is given up: everything worn (but the Heirloom, which is kept) and everything in the bag. A gift from a
 * friend (`gift`) gives nothing: otherwise friends could hold gear through a rebirth, or pour theirs
 * into one hero's. `save` is a save or a player (equipped, bag).
 */
export function rebirthGear(save, heirloomSlot = null) {
  const out = { essence: 0, worn: 0, bag: 0, value: 0, gifts: 0, bagPieces: 0 };
  const worn = save.equipped || {};
  for (const slot in worn) {
    const it = worn[slot];
    if (!it) continue;
    if (it.gift) {
      out.gifts++;
      continue;
    }
    if (it.eternal) continue; // (0.71) an Eternal is kept, never given up
    if (slot !== heirloomSlot) out.worn += essenceFor(it);
  }
  for (const it of save.bag || []) {
    if (!it) continue;
    if (it.gift) {
      out.gifts++;
      continue;
    }
    out.bag += essenceFor(it);
    out.bagPieces++;
  }
  out.essence = out.worn + out.bag;
  out.value = out.essence; // (0.58.2) Ember and Starmarks follow everything given up too
  return out;
}

/** A hero's rebirth record, from a save (or a fresh one). */
export function migrateRebirth(r) {
  const out = { n: 0, marks: 0, earned: 0, perks: {}, past: [], ng: 0, essence: 0, memories: {}, recalled: {}, kindling: {}, deepMax: 0, act3: {}, gifts: {} };
  if (!r || typeof r !== 'object') return out;
  out.n = Math.max(0, Math.floor(Number(r.n) || 0));
  out.marks = Math.max(0, Math.floor(Number(r.marks) || 0));
  out.earned = Math.max(out.marks, Math.floor(Number(r.earned) || 0));
  out.ng = Math.max(0, Math.floor(Number(r.ng) || 0)); // New Game+ (0.45): times this hero took her place
  for (const id of PERK_IDS) {
    const v = Math.floor(Number(r.perks && r.perks[id]) || 0);
    if (v > 0) out.perks[id] = Math.min(PERKS[id].max, v);
  }
  if (Array.isArray(r.past)) out.past = r.past.slice(-REBIRTH.pastMax).map((x) => Object.assign({}, x));
  out.essence = Math.max(0, Math.floor(Number(r.essence) || 0)); // Echoes (0.53)
  if (r.memories && typeof r.memories === 'object') for (const k in r.memories) if (r.memories[k]) out.memories[k] = JSON.parse(JSON.stringify(r.memories[k]));
  if (r.recalled && typeof r.recalled === 'object') for (const k in r.recalled) if (r.recalled[k]) out.recalled[k] = true;
  // The Deep (0.54): Kindling found in each Depth, the deepest Depth opened, and Act III's quests done; all kept
  if (r.kindling && typeof r.kindling === 'object') for (const k in r.kindling) out.kindling[k] = Math.max(0, Math.floor(Number(r.kindling[k]) || 0));
  out.deepMax = Math.max(0, Math.floor(Number(r.deepMax) || 0));
  // Ember from rebirths (0.54.1): saved from 0.54.1; a hero reborn before then keeps 10 for each rebirth
  out.ember = r.ember != null ? Math.max(0, Math.floor(Number(r.ember) || 0)) : 10 * out.n;
  if (r.lastEmber != null) out.lastEmber = Math.max(0, Math.floor(Number(r.lastEmber) || 0));
  if (r.act3 && typeof r.act3 === 'object') for (const k in r.act3) if (r.act3[k]) out.act3[k] = true;
  // (0.57.6) story gifts of Ember already given (once per hero, whatever the life)
  out.gifts = {};
  if (r.gifts && typeof r.gifts === 'object') for (const k in r.gifts) if (r.gifts[k]) out.gifts[k] = true;
  return out;
}

/** Starmarks a rebirth would give now. */
export function starmarksFor(level, wish, given = 0) {
  if (level < REBIRTH.level) return 0;
  return REBIRTH.base + Math.floor(REBIRTH.wishK * Math.sqrt(Math.max(0, wish || 0))) + starmarksForGear(given);
}
/** (0.58.2) Starmarks for what you give up (its Echo value). */
export function starmarksForGear(given) {
  return Math.min(REBIRTH.gearMax, Math.floor(Math.sqrt(Math.max(0, given || 0)) / REBIRTH.gearDiv));
}

/** Why this hero cannot be reborn yet, or null if they can. */
export function rebirthBlock(p) {
  if (p.level < REBIRTH.level) return `Reach level ${REBIRTH.level} first.`;
  if (!((p.bossKills && p.bossKills[REBIRTH.boss]) > 0)) return 'Beat The Unmade first.';
  return null;
}

export const perkRank = (rb, id) => (rb && rb.perks && rb.perks[id]) || 0;

/** EXP multiplier from Quick Study and the account's rebirths. */
export function expMult(rb, acctRebirths = 0) {
  return 1 + 0.1 * perkRank(rb, 'study') + Math.min(REBIRTH.acctExpMax, REBIRTH.acctExp * Math.max(0, acctRebirths || 0));
}

/**
 * The save a hero wakes up with after a rebirth: a full fresh start that keeps only what the star
 * remembers. `old` is the hero's save now (World#toSave); `extra` is what the account carries.
 */
export function rebirthSave(old, starterWeapon, heirloomSlot = null, relevel = null) {
  const rb = migrateRebirth(old.rebirth);
  // Echoes (0.53): the gear you wear turns into Essence (all but the Heirloom you take with you), and the
  // best piece ever worn in each slot is remembered
  const worn = old.equipped || {};
  const heir = heirloomSlot && worn[heirloomSlot] && relevel ? JSON.parse(JSON.stringify(worn[heirloomSlot])) : null;
  const sum = rebirthGear(old, heirloomSlot);
  const essence = sum.essence;
  const value = sum.value; // what was given up (Ember, 0.54.1; worn and bag, not the Heirloom, 0.58.2)
  for (const slot in worn) {
    const it = worn[slot];
    if (!it || it.gift || it.eternal) continue; // (0.58) a gift is not the star's to remember; (0.71) nor an Eternal (it is kept)
    if (memoryRank(it) > memoryRank(rb.memories[slot])) rb.memories[slot] = JSON.parse(JSON.stringify(it));
  }
  rb.essence += essence;
  rb.lastEssence = essence;
  rb.lastEmber = emberForGear(value);
  rb.ember += rb.lastEmber;
  rb.recalled = {}; // each memory can be recalled once a life
  const equipped = { weapon: starterWeapon(old.cls) };
  if (heir && !heir.eternal) {
    heir.heirloom = true;
    relevel(heir, 1);
    equipped[heirloomSlot] = heir;
  }
  // (0.71) every Eternal comes too, worn where it was worn, back to level 1 like an Heirloom (it grows with you)
  const eternals = {};
  for (const slot in old.eternals || {}) {
    const it = old.eternals[slot];
    if (it && it.eternal) eternals[slot] = relevel ? relevel(JSON.parse(JSON.stringify(it)), 1) : it;
  }
  for (const slot in worn) {
    const it = worn[slot];
    if (it && it.eternal) equipped[slot] = relevel ? relevel(JSON.parse(JSON.stringify(it)), 1) : it;
  }
  const marks = starmarksFor(old.level, old.wish || 0, value);
  rb.n += 1;
  rb.marks += marks;
  rb.earned += marks;
  rb.past.push({ n: rb.n, cls: old.cls, level: old.level, wish: old.wish || 0, spec: old.spec || null, marks, tier: old.tierMax || 1 });
  rb.past = rb.past.slice(-REBIRTH.pastMax);
  const glows = Array.isArray(old.glows) ? old.glows.slice() : [];
  const glow = REBIRTH_GLOWS[rb.n];
  if (glow && !glows.includes(glow)) glows.push(glow);
  return {
    v: 2,
    cls: old.cls,
    level: 1,
    exp: 0,
    equipped,
    bag: [],
    gold: old.gold, // (the account's: shared by every hero)
    tickets: old.tickets,
    scrap: old.scrap || 0, // (0.62.1) kept through a rebirth (and a quarter rarer to come by)
    dust: old.dust || 0, // (0.62.1) Wishdust too
    keys: old.keys || 0, // (0.62) Warden keys are kept through a rebirth
    maxCheckpoint: old.maxCheckpoint || old.checkpoint || 1, // (0.65) and where the Echo Ring can start, and its best wave
    checkpoint: old.maxCheckpoint || old.checkpoint || 1,
    bestWave: old.bestWave || 0,
    skillPoints: perkRank(rb, 'head'),
    glows,
    glow: glow || old.glow || null,
    talentBuilds: old.talentBuilds, // a remembered build is a preference, not power
    eternals, // (0.71)
    eternalEssence: old.eternalEssence || 0,
    eternalPity: old.eternalPity || 0,
    borrowed: old.borrowed ? { d: old.borrowed.d || null, f: old.borrowed.f || null } : undefined, // (0.70) the skills borrowed from old lives stay chosen
    rebirth: rb,
    acctRebirths: (old.acctRebirths || 0) + 1,
    endings: Object.assign({}, old.endings), // (0.45) the endings you have seen stay seen
    signs: Array.isArray(old.signs) ? old.signs.slice() : [], // (0.56.4) what the road remembers stays remembered
    keepsake: old.keepsake || null, // (0.53) Edric's Colours stays, made again at your new level
  };
}
