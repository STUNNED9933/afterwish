// The Echo Ring's spoils (0.59): what a run is for, and when you may take it home.
//
// Before waking the Ring you choose a focus: gold, Immortal Fragments, Wishdust, or gear for one slot.
// Every wave you clear adds to the run's spoils in that focus, more the deeper the wave (and three
// times as much for a boss). After every boss the spoils are safe: you may leave with all of them,
// or push on for more. Fall, or leave between bosses, and you keep what was safe at the last boss.
// Whatever drops in the Ring is gathered for you when the run ends.

export const RING_FOCUS = {
  gold: { name: 'Gold', desc: 'Gold, plenty of it.' },
  fragment: { name: 'Immortal Fragments', desc: 'Fragments toward an Immortal of your choice.' },
  dust: { name: 'Wishdust', desc: 'Wishdust, for reforging and rerolls.' },
  gear: { name: 'Gear', desc: 'Gear for the slot you choose, rarer the deeper you go.' },
};
export const RING_FOCUS_IDS = Object.keys(RING_FOCUS);

export const RING = {
  growth: 0.25, // each wave is worth (1 + growth x (wave - 1)) of the first
  boss: 3, // a boss wave is worth this many
  gold: (level) => 20 + 3 * level, // gold a wave, before growth
  fragment: 0.6, // Immortal Fragments a wave, before growth
  dust: 1.5, // Wishdust a wave
  gear: 0.25, // pieces a wave (a boss: 2, and 1 more every 10 waves)
  gearRarity: (wave) => Math.min(5, 3 + Math.floor(wave / 10)), // Epic, then Mythic from 10, Ancient from 20
};

/** How much wave `n` is worth, against the first. */
export function ringWorth(n, boss) {
  return (1 + RING.growth * Math.max(0, n - 1)) * (boss ? RING.boss : 1);
}

/** A new run's spoils for a focus ({ kind, slot }). */
export function newRing(focus) {
  const kind = RING_FOCUS[focus && focus.kind] ? focus.kind : 'gold';
  const slot = kind === 'gear' ? focus.slot || 'weapon' : null;
  return { kind, slot, pot: 0, safe: 0, safeWave: 0, wave: 0, paid: {} };
}

/** What clearing wave `n` adds (a number: gold, fragments, dust or pieces; fractions add up). */
export function ringGain(ring, n, boss, level) {
  const w = ringWorth(n, boss);
  if (ring.kind === 'gold') return Math.round(RING.gold(level) * w);
  if (ring.kind === 'fragment') return RING.fragment * w;
  if (ring.kind === 'dust') return RING.dust * w;
  return boss ? 2 + Math.floor(n / 10) : RING.gear * (1 + RING.growth * Math.max(0, n - 1));
}

/** The spoils as a whole number to hand over. */
export const ringWhole = (x) => Math.floor(x + 1e-9);

/** "1,240 gold", "12 Immortal Fragments", "3 boots pieces", for messages. */
export function ringText(ring, amount) {
  const n = ringWhole(amount);
  if (ring.kind === 'gold') return `${n.toLocaleString('en-US')} gold`;
  if (ring.kind === 'fragment') return `${n} Immortal Fragment${n === 1 ? '' : 's'}`;
  if (ring.kind === 'dust') return `${n} Wishdust`;
  return `${n} ${ring.slot === 'chest' ? 'armor' : ring.slot} piece${n === 1 ? '' : 's'}`;
}
