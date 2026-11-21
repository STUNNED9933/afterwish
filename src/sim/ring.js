// The Echo Ring's spoils (0.59; 0.61.1; 0.65): what a run is for, and what it pays.
//
// (0.65) Every wave pays out as it is cleared (world.js ringGive): no waiting for the next boss. Waves
// grow 8% each up to wave 50, gear comes about every other wave, and Immortals from wave 15. From wave
// 20 the Ring's enemies attack faster (ringPace). Starting further in costs no augments: the picks you
// would have had are offered before the first wave.
//
// Before waking the Ring you choose a focus: gold, Immortal Fragments, Wishdust, or gear for one slot.
// Every wave you clear adds to the run's spoils in that focus, more the deeper the wave: each wave is
// worth 7% more than the one before (a boss three times a wave), up to wave 40, then the same. After
// every boss you may take them home or push on. Whatever you have gathered comes home with you however
// the run ends, a fall too, and whatever drops in the Ring is gathered for you.
// Waking it costs starglass shards, more the further in you start (ringCost).

export const RING_FOCUS = {
  gold: { name: 'Gold', desc: 'Gold, plenty of it.' },
  fragment: { name: 'Immortal Fragments', desc: 'Fragments toward an Immortal of your choice (250 make one).' },
  dust: { name: 'Wishdust', desc: 'Wishdust, for reforging and rerolls.' },
  gear: { name: 'Gear', desc: 'Gear for the slot you choose: rarer the deeper you go, and from wave 20 a chance of an Immortal.' },
};
export const RING_FOCUS_IDS = Object.keys(RING_FOCUS);

export const RING = {
  growth: 1.08, // each wave is worth 8% more than the one before (0.65: was 7%)...
  cap: 50, // ...up to this wave (0.65: was 40)
  boss: 3, // a boss wave is worth this many
  gold: (level) => 30 + 4.5 * level, // gold a wave, before growth
  fragment: 1, // Immortal Fragments a wave, before growth (0.65: was 0.8)
  dust: 2.5, // Wishdust a wave (0.65: was 2)
  gearWave: (wave) => 0.5 + Math.min(0.5, wave / 100), // (0.65) gear pieces an ordinary wave: one every other wave, every wave by 50
  gearBoss: (wave) => 1 + Math.floor(wave / 15), // pieces a boss wave (0.65: one more every 15 waves, was 20)
  gearRarity: (wave) => Math.min(5, 3 + Math.floor(wave / 10)), // Epic, then Mythic from 10, Ancient from 20
  // the chance that a piece of gear is an Immortal, by the deepest wave cleared: none before 20, then 1%,
  // and half a percent more every 5 waves, up to 4% from wave 50. A run to wave 40 is about 30 pieces
  // at 3%, about one Immortal: about what the Fragment focus pays to wave 40 (some 220 of the 250).
  // (0.65) from wave 15: 1.5%, and half a percent more every 5 waves, up to 5% from wave 45
  immortal: (wave) => (wave < 15 ? 0 : Math.min(0.05, 0.015 + 0.005 * Math.floor((wave - 15) / 5))),
  // (0.65) how fast the Ring's enemies are from wave 20: wind-ups to 80% and rests to 65% by wave 60
  pace: (wave) => (wave < 20 ? 1 : Math.max(0.8, 1 - 0.005 * (wave - 20))),
  tempo: (wave) => (wave < 20 ? 1 : Math.max(0.65, 1 - 0.00875 * (wave - 20))),
  move: (wave) => (wave < 20 ? 1 : Math.min(1.2, 1 + 0.005 * (wave - 20))),
  shards: { base: 5, per: 2 }, // starting at wave 1 costs 5 shards; each checkpoint further in, 2 more
};

/** How much wave `n` is worth, against the first. */
export function ringWorth(n, boss) {
  let w = 1;
  for (let k = 1; k < Math.min(RING.cap, Math.max(1, n)); k++) w *= RING.growth; // (whole powers, the same in every browser)
  return w * (boss ? RING.boss : 1);
}

/** Starglass shards to wake the Ring at `startWave`. */
export function ringCost(startWave = 1) {
  return RING.shards.base + RING.shards.per * Math.floor((Math.max(1, startWave) - 1) / 5);
}

/** A new run's spoils for a focus ({ kind, slot }). */
export function newRing(focus) {
  const kind = RING_FOCUS[focus && focus.kind] ? focus.kind : 'gold';
  const slot = kind === 'gear' ? focus.slot || 'weapon' : null;
  return { kind, slot, pot: 0, wave: 0, paid: {}, given: {} };
}

/** What clearing wave `n` adds (a number: gold, fragments, dust or pieces; fractions add up). */
export function ringGain(ring, n, boss, level) {
  const w = ringWorth(n, boss);
  if (ring.kind === 'gold') return Math.round(RING.gold(level) * w);
  if (ring.kind === 'fragment') return RING.fragment * w;
  if (ring.kind === 'dust') return RING.dust * w;
  return boss ? RING.gearBoss(n) : RING.gearWave(n);
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

/**
 * (0.61.1) What the Stones Remember, for its info tab: for each of `waves`, what that wave adds in each focus
 * (waves that are multiples of 5 are boss waves) and what a run from `from` up to and including it adds
 * up to, with the gear's rarity and Immortal chance there.
 */
export function ringTable(level, from = 1, waves = [1, 5, 10, 15, 20, 25, 30, 35, 40, 50]) {
  const rows = [];
  for (const n of waves) {
    if (n < from) continue;
    const boss = n % 5 === 0;
    const total = { gold: 0, fragment: 0, dust: 0, gear: 0 };
    for (let k = from; k <= n; k++) for (const kind of RING_FOCUS_IDS) total[kind] += ringGain({ kind }, k, k % 5 === 0, level);
    rows.push({
      wave: n, boss,
      gold: ringGain({ kind: 'gold' }, n, boss, level), fragment: ringGain({ kind: 'fragment' }, n, boss, level), dust: ringGain({ kind: 'dust' }, n, boss, level), gear: ringGain({ kind: 'gear' }, n, boss, level),
      total, rarity: RING.gearRarity(n), immortal: RING.immortal(n),
    });
  }
  return rows;
}
