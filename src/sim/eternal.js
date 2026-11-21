// Eternal gear (0.71): the tier above Immortal. Only the Granted, Caelum's four bosses, let it fall.
//
// - Each class gathers its own five pieces (weapon, helm, chest, boots, ring), one of each: a piece that
//   falls is always one the hero does not have yet, and with all five it falls as Eternity Essence.
// - Soulbound: never in the gear box, never traded, scrapped, sold or thrown away. It lives in its own
//   panel and is worn in its slot like anything else. A rebirth keeps every piece (worn and stowed),
//   brought back to level 1 with you like an Heirloom, and it grows with you.
// - It grows by Feeding: an Immortal from the gear box, or Eternity Essence, gives it experience. Each
//   level adds to its stats; levels 4, 7 and 10 open another passive slot. Feeding past the last level
//   comes back as Essence.
// - Its passives are its own pool, about one thing: bringing a boss down (see ETERNAL_PASSIVES).
import { RARITIES, ETERNAL_RARITY, statValue, WEAPONS, SLOTS } from './items.js';

export const ETERNAL = {
  maxLevel: 10,
  slotsAt: [1, 4, 7, 10], // the levels that open a passive slot (one at level 1)
  statPerLevel: 0.04, // +4% to every stat a level, on top of what it rolled
  potencyPerLevel: 0.05, // and +5% to its passives
  /** Experience from one level to the next. 4,500 from 1 to 10. */
  xpFor: (level) => 100 * level,
  // What Feeding gives
  immortalXp: 100, // an Immortal...
  starXp: 25, // ...and a little more for each of its stars
  plusXp: 5, // and each blacksmith +
  essenceXp: 600, // one Eternity Essence
  essencePerDrop: 3, // what a piece falls as when the hero has all five
  // The chance a Granted lets one fall, by Caelum map (the Sky Road first)
  chance: { skyroad: 0.05, answers: 0.06, wants: 0.07, zenith: 0.08 },
};

const NAMES = {
  weapon: { warrior: 'Everblade', archer: 'Everstring', rogue: 'Everfangs', mage: 'Everflame Staff' },
  helm: 'Crown Without End',
  chest: 'Mantle of Always',
  boots: 'Unending Stride',
  ring: 'The Last Ring',
};

/**
 * The pool: every passive is about a boss (a Primordial, a Granted, the Unmade...) and most only work on
 * one. [lo, hi] is the range a roll lands in (q, 0 to 1); level adds potencyPerLevel on top. {v} is the
 * number, worked out, in the text.
 */
export const ETERNAL_PASSIVES = {
  colossus: { name: 'Colossus Breaker', range: [0.15, 0.25], pct: true, desc: 'You deal {v} more damage to bosses.' },
  sunder: { name: 'Sunder', range: [0.004, 0.006], pct: true, dec: 1, desc: 'Each of your hits on a boss makes it take {v} more from you, stacking up to 30 times (for 8 s after your last hit).' },
  focus: { name: 'Fixed Gaze', range: [0.015, 0.025], pct: true, dec: 1, desc: 'Each hit on the same enemy deals {v} more than the last, up to 20 hits. Hitting another starts again.' },
  titanfall: { name: 'Titanfall', range: [1.5, 2.5], pct: true, desc: 'Your hits on a boss deal an extra {v} of your attack damage (at most 4 times a second).' },
  openwound: { name: 'Open Wound', range: [0.4, 0.6], pct: true, desc: 'Your critical hits on bosses deal {v} more.' },
  relentless: { name: 'Relentless', range: [0.08, 0.15], dec: 2, unit: ' s', desc: 'Each hit on a boss takes {v} off your other cooldowns (at most 4 times a second).' },
  guardbreak: { name: 'Guardbreaker', range: [0.5, 0.8], pct: true, desc: 'A boss whose guard you have broken (stunned) takes {v} more from you.' },
  duelist: { name: 'Duelist', range: [0.2, 0.3], pct: true, desc: 'While only one enemy is within 12 m of you, you deal {v} more to it.' },
  deathmark: { name: 'Death Mark', range: [3, 5], pct: true, desc: 'Every 8 seconds, your next hit on a boss deals {v} more.' },
};
export const ETERNAL_KEYS = Object.keys(ETERNAL_PASSIVES);

/** How strong a passive is on this piece (its roll and the piece's level). */
export function passiveValue(p, item) {
  const P = ETERNAL_PASSIVES[p.key];
  if (!P) return 0;
  const [lo, hi] = P.range;
  return (lo + (p.q || 0) * (hi - lo)) * (1 + ETERNAL.potencyPerLevel * ((item.level || 1) - 1));
}

/** A passive's text, its number worked out (and in gold for the html tooltip). */
export function passiveText(p, item, html = false) {
  const P = ETERNAL_PASSIVES[p.key];
  if (!P) return '';
  const v = passiveValue(p, item);
  const num = P.pct ? `${(v * 100).toFixed(P.dec || 0)}%` : `${v.toFixed(P.dec || 0)}${P.unit || ''}`;
  return P.desc.replace('{v}', html ? `<b class="pot">${num}</b>` : num);
}

/** How many passive slots a piece has open at its level. */
export const slotsOpen = (item) => ETERNAL.slotsAt.filter((l) => (item.level || 1) >= l).length;

/** Experience still to go to the last level. */
export function xpToMax(item) {
  let need = 0;
  for (let l = item.level || 1; l < ETERNAL.maxLevel; l++) need += ETERNAL.xpFor(l);
  return Math.max(0, need - (item.xp || 0));
}

/** What an Immortal is worth fed to an Eternal. */
export function feedValue(item) {
  return ETERNAL.immortalXp + ETERNAL.starXp * (item.stars || 0) + ETERNAL.plusXp * (item.plus || 0);
}

/** Roll a passive the piece does not have yet. */
function newPassive(item, rng) {
  const have = new Set((item.passives || []).map((p) => p.key));
  const left = ETERNAL_KEYS.filter((k) => !have.has(k));
  const key = left[Math.floor(rng() * left.length)] || ETERNAL_KEYS[0];
  return { key, q: Math.round(rng() * 100) / 100 };
}

/** Fill any passive slot its level has opened. */
export function fillSlots(item, rng) {
  item.passives = item.passives || [];
  while (item.passives.length < slotsOpen(item)) item.passives.push(newPassive(item, rng));
}

/**
 * Give a piece experience. Returns what did not fit (past the last level), in experience, so the caller
 * hands it back as Essence. Levels add to its stats (see eternalStats) and may open passive slots.
 */
export function feed(item, xp, rng) {
  item.xp = (item.xp || 0) + xp;
  item.level = item.level || 1;
  while (item.level < ETERNAL.maxLevel && item.xp >= ETERNAL.xpFor(item.level)) {
    item.xp -= ETERNAL.xpFor(item.level);
    item.level++;
  }
  let over = 0;
  if (item.level >= ETERNAL.maxLevel) {
    over = item.xp;
    item.xp = 0;
  }
  fillSlots(item, rng);
  return over;
}

/** A new Eternal piece for this class and slot. */
export function rollEternal(rng, ilvl, slot, cls) {
  const R = RARITIES[ETERNAL_RARITY];
  const weapon = slot === 'weapon' ? WEAPONS[cls] || WEAPONS.warrior : null;
  const main = weapon ? weapon.main : { weapon: 'ad', helm: 'hp', chest: 'armor', boots: 'ms', ring: 'haste' }[slot];
  const bonus = weapon ? weapon.bonus : { helm: ['armor', 'haste', 'crit', 'lifesteal'], chest: ['hp', 'lifesteal', 'haste', 'as'], boots: ['as', 'hp', 'armor', 'crit'], ring: ['crit', 'lifesteal', 'ad', 'as'] }[slot];
  const stats = { [main]: statValue(main, ilvl, R.mult, rng) };
  for (const k of bonus.slice(0, R.affixes)) stats[k] = statValue(k, ilvl, R.mult * 0.5, rng);
  const n = NAMES[slot];
  const item = {
    id: 'e' + slot + '-' + Math.floor(rng() * 1e9).toString(36),
    name: typeof n === 'string' ? n : n[cls] || n.warrior,
    slot, rarity: ETERNAL_RARITY, ilvl, stats, plus: 0, rv: 2,
    eternal: true, level: 1, xp: 0, passives: [],
  };
  if (weapon && cls) item.cls = cls;
  fillSlots(item, rng);
  return item;
}

/** The pieces a hero has, worn or stowed, by slot. */
export function eternalsOwned(p) {
  const out = {};
  for (const slot of SLOTS) {
    const worn = p.equipped && p.equipped[slot];
    if (worn && worn.eternal) out[slot] = worn;
    else if (p.eternals && p.eternals[slot]) out[slot] = p.eternals[slot];
  }
  return out;
}

/** The slots a falling piece may take (ones the hero has none for). */
export const eternalMissing = (p) => SLOTS.filter((s) => !eternalsOwned(p)[s]);

/** The passives of every Eternal worn, added up by key. */
export function eternalMods(equipped) {
  const out = {};
  for (const slot of SLOTS) {
    const it = equipped && equipped[slot];
    if (!it || !it.eternal) continue;
    for (const p of it.passives || []) out[p.key] = (out[p.key] || 0) + passiveValue(p, it);
  }
  return out;
}

/** A save's Eternal store, cleaned: one piece a slot, only real Eternals. */
export function cleanEternals(raw) {
  const out = {};
  for (const slot of SLOTS) {
    const it = raw && raw[slot];
    out[slot] = it && it.eternal && it.slot === slot ? it : null;
  }
  return out;
}
