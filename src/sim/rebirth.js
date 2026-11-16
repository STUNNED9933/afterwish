// Rebirth (0.43): begin again from level 1, and keep what the star remembers of you.
//
// Once a hero is level 100 and has beaten The Unmade, they can ask the fallen star to begin again.
// Everything about that life goes: level, gear, gold in the bag aside (gold belongs to the account),
// scrap, Wishdust, story, quests, world tiers, talents and Wishborne levels. What stays is what the
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

/** Weapon glows for some rebirths (see sim/cosmetics.js). */
export const REBIRTH_GLOWS = { 1: 'dawn', 3: 'thrice', 5: 'evermore', 10: 'eternal' };

/** A hero's rebirth record, from a save (or a fresh one). */
export function migrateRebirth(r) {
  const out = { n: 0, marks: 0, earned: 0, perks: {}, past: [], ng: 0 };
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
  return out;
}

/** Starmarks a rebirth would give now. */
export function starmarksFor(level, wish) {
  if (level < REBIRTH.level) return 0;
  return REBIRTH.base + Math.floor(REBIRTH.wishK * Math.sqrt(Math.max(0, wish || 0)));
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
export function rebirthSave(old, starterWeapon) {
  const rb = migrateRebirth(old.rebirth);
  const marks = starmarksFor(old.level, old.wish || 0);
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
    equipped: { weapon: starterWeapon(old.cls) },
    bag: [],
    gold: old.gold, // (the account's: shared by every hero)
    tickets: old.tickets,
    scrap: 0,
    keys: 0,
    skillPoints: perkRank(rb, 'head'),
    glows,
    glow: glow || old.glow || null,
    talentBuilds: old.talentBuilds, // a remembered build is a preference, not power
    rebirth: rb,
    acctRebirths: (old.acctRebirths || 0) + 1,
    endings: Object.assign({}, old.endings), // (0.45) the endings you have seen stay seen
  };
}
