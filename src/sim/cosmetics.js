// Cosmetics (0.31): weapon glows. They change nothing but how you look, which matters
// in co-op. Each is earned once and kept by that character; pick one on the gear screen.
export const GLOWS = {
  ember: { name: 'Oathfire', color: 0xff8a3a, how: 'Sometimes dropped by the Remnant of The Warden' },
  spore: { name: 'Sporelight', color: 0x9fe07a, how: 'Sometimes dropped by the Remnant of The Mycelord' },
  void: { name: 'Voidlight', color: 0xa64bff, how: 'Sometimes dropped by the Remnant of The Unmade' },
  rift: { name: 'Riftfire', color: 0x7fd8ff, how: 'Clear Echo Rift tier 10' },
  gold: { name: "Thief's Gold", color: 0xffd27a, how: 'Catch 10 Wishthieves' },
  star: { name: 'Afterwish', color: 0xfff2c0, how: 'Beat The Unmade on world tier V' },
  // Rebirth (0.43)
  dawn: { name: 'Second Dawn', color: 0xff9e7a, how: 'Be reborn once' },
  thrice: { name: 'Thrice Wished', color: 0x8fd4ff, how: 'Be reborn three times' },
  evermore: { name: 'Evermore', color: 0xd38cff, how: 'Be reborn five times' },
  eternal: { name: 'The Star Remembers', color: 0xffffff, how: 'Be reborn ten times' },
  gloomcap: { name: 'Gloomcap', color: 0xb98aff, how: 'An Ending for Tobin' }, // (0.47)
  hearth: { name: 'Hearthlight', color: 0xffb060, how: 'Haven Grows' },
  afterlight: { name: 'Afterlight', color: 0xfff6d6, how: 'Unwish yourself at the Starwell' }, // (0.45)
};
export const GLOW_IDS = Object.keys(GLOWS);
/** Which glow each Remnant can drop. */
export const REMNANT_GLOW = { boss: 'ember', boss2: 'spore', boss3: 'void' };
