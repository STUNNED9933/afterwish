// Augment priority (0.66): with auto-pick on, the Ring picks for you from your own ranking of every
// augment your class can be offered. The default ranking puts damage first, then cooldowns and speed,
// then reach and control, and the defensive ones last; you can drag (or nudge) them into any order.
import { AUGMENTS, AUGMENT_IDS } from '../sim/augments.js';

/** How much damage an augment adds, roughly, judged from what it says: higher first. */
function score(a) {
  const d = `${a.name} ${a.desc}`.toLowerCase();
  let s = 1;
  if (/health|lifesteal|heal|shield|armou?r|block|taunt|ward/.test(d)) s = 0;
  if (/wider|further|reach|slow|stun|freeze|pull|lasts|longer|range/.test(d)) s = 1;
  if (/cooldown|sooner|reset|haste|faster|attack speed|unlocked now/.test(d)) s = 2;
  if (/damage|deals|% more\b|\bcrits?\b|crit chance|burn|bleed|erupts|strikes one more|\d+ more (arrows?|motes|stacks|times)|two bolts|1 more (arrow|hoarfrost)|takes? \d+% more/.test(d)) s = 3;
  if (/maximum health/.test(d) && /attack damage/.test(d)) s = 3; // Glass Cannon: damage first
  return s + (a.tier === 2 ? 0.5 : 0);
}

/** Every augment this class (any subclass) can be offered. */
export function augmentsFor(cls) {
  return AUGMENT_IDS.filter((id) => !AUGMENTS[id].cls || AUGMENTS[id].cls === cls);
}

/** The default ranking: damage at the top, the defensive ones at the bottom. */
export function defaultOrder(cls) {
  const ids = augmentsFor(cls);
  return ids.map((id, i) => [id, score(AUGMENTS[id]), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0]);
}

/** A saved ranking, with any augment it does not know yet put where the default would have it. */
export function orderFor(saved, cls) {
  const def = defaultOrder(cls);
  const mine = (saved && saved[cls] || []).filter((id) => def.includes(id));
  for (const id of def) {
    if (mine.includes(id)) continue;
    // after the last known augment that comes before it in the default ranking
    const at = def.indexOf(id);
    let pos = 0;
    for (let i = at - 1; i >= 0; i--) {
      const j = mine.indexOf(def[i]);
      if (j >= 0) { pos = j + 1; break; }
    }
    mine.splice(pos, 0, id);
  }
  return mine;
}

/** The pick from `choices` that ranks highest. */
export function pickFrom(choices, order) {
  let best = choices[0], at = Infinity;
  for (const id of choices) {
    const i = order.indexOf(id);
    if (i >= 0 && i < at) { at = i; best = id; }
  }
  return best;
}
