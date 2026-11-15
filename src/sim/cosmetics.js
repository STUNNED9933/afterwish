// Cosmetics (0.31): weapon glows. They change nothing but how you look, which matters
// in co-op. Each is earned once and kept by that character; pick one on the gear screen.
export const GLOWS = {
  ember: { name: 'Oathfire', color: 0xff8a3a, how: 'Sometimes dropped by the Remnant of The Warden' },
  spore: { name: 'Sporelight', color: 0x9fe07a, how: 'Sometimes dropped by the Remnant of The Mycelord' },
  void: { name: 'Voidlight', color: 0xa64bff, how: 'Sometimes dropped by the Remnant of The Unmade' },
  rift: { name: 'Riftfire', color: 0x7fd8ff, how: 'Clear Echo Rift tier 10' },
  gold: { name: "Thief's Gold", color: 0xffd27a, how: 'Catch 10 Wishthieves' },
  star: { name: 'Afterwish', color: 0xfff2c0, how: 'Beat The Unmade on world tier V' },
};
export const GLOW_IDS = Object.keys(GLOWS);
/** Which glow each Remnant can drop. */
export const REMNANT_GLOW = { boss: 'ember', boss2: 'spore', boss3: 'void' };
