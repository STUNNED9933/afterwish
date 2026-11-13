// Small seeded random number generator (mulberry32).
// The simulation only ever uses this, never Math.random(), so two machines
// given the same seed and the same commands produce the same game. That is
// the property lockstep / server-authoritative multiplayer will need later.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
