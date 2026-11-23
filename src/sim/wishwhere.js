// (0.81.2) Where a Wishkeep wish is done, in words a player can follow: the map's name and, for the Deep,
// its Depth (reached through the Waygate). Kept apart from wishkeep.js, which maps.js imports.
import { MAPS, MAP_IDS } from './maps.js';
import { DEEP } from './endgame.js';

const bossHome = {};
for (const id of MAP_IDS) if (MAPS[id].boss && !bossHome[MAPS[id].boss]) bossHome[MAPS[id].boss] = id;

/** The map a wish sends you to (a pilgrimage's map, or the map its boss lives on), or null. */
export function wishMap(w) {
  if (!w) return null;
  if (w.kind === 'kill') return MAPS[w.map] ? w.map : null;
  if (w.kind === 'boss') return bossHome[w.boss] || null;
  return null;
}

/** "The Drowned Court (Depth VII, by the Waygate)" (short: "The Drowned Court · Depth VII"), "Frostfall Pass", or '' for wishes done at the keep. */
export function wishWhere(w, short = false) {
  const id = wishMap(w);
  if (!id) return '';
  const m = MAPS[id];
  const d = m.deep && DEEP.depths[m.deep];
  if (short) return d ? `${m.name} · Depth ${d.numeral}` : m.name;
  return d ? `${m.name} (Depth ${d.numeral}, by the Waygate)` : m.name;
}
