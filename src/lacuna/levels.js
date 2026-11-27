// (0.99.36) Levels in Lacuna: experience from beasts, quests and tricks; a level is a little more health and might,
// and a point for the talent web. Shared by the browser and the server (plain numbers, no randomness).

export const MAX_LEVEL = 60;

/** Experience from level L to L + 1: quick at first (a few wolves), slower later. */
export function xpNeed(L) {
  return Math.round(60 + 30 * Math.pow(Math.max(0, L - 1), 1.45));
}

/** Where `xp` (all of it, ever) puts you: { level, into (this level), need (for the next), total }. */
export function levelOf(xp) {
  let L = 1, left = Math.max(0, Math.floor(xp || 0));
  while (L < MAX_LEVEL && left >= xpNeed(L)) { left -= xpNeed(L); L++; }
  return { level: L, into: L < MAX_LEVEL ? left : 0, need: L < MAX_LEVEL ? xpNeed(L) : 0, total: Math.floor(xp || 0) };
}

/** What a level is worth: health and might (the Link multiplies these again). */
export const PER_LEVEL = { hp: 0.04, dmg: 0.02 };
export const levelHp = (L) => 1 + PER_LEVEL.hp * (Math.max(1, Math.min(MAX_LEVEL, L)) - 1);
export const levelDmg = (L) => 1 + PER_LEVEL.dmg * (Math.max(1, Math.min(MAX_LEVEL, L)) - 1);

/** Talent points: one a level after the first. */
export const pointsAt = (L) => Math.max(0, Math.min(MAX_LEVEL, L) - 1);

/** Experience for finishing each part of the story (the stage being left), once. */
export const QUEST_XP = {
  stumble: 30, rescued: 30, waking: 40, asking: 40, days: 180, crystal: 80, path: 120, ambush: 60, hunt: 150,
  mourning: 300, contracts: 450, report: 200,
};
/** For each trick learned (moving well). */
export const TRICK_XP = 40;
/** A story's beast (ashen, a contract's quarry) is worth more than its kind. */
export const STORY_BEAST = 2;
