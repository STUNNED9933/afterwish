// Item icons (0.61.2): every named item has its own picture.
//
// Each class's weapon and each armour slot has ten names, one per ten levels (Rusted Blade, Iron Sword ...
// Starforged Edge). Each name gets its own silhouette here, tinted with the material it is made of (rust,
// iron, steel, runed, frost, sun, gloom, storm, obsidian, star). Immortals have pictures of their own, and
// set pieces wear their set's colours. The outline is always the item's rarity colour (currentColor).
//
// A picture is a list of parts:
//   ['b', d]   body: filled with the material, outlined
//   ['l', d]   line: outlined only
//   ['a', d]   accent: a line in the material's accent colour
//   ['f', d]   accent fill: a small solid shape (gems, stars) in the accent colour
//   ['r', d]   rod: a thick outlined stroke filled with the material (staff shafts)
// Pictures are drawn on a 24 x 24 grid.
import { WEAPONS, BASE_NAMES, RARITIES } from '../sim/items.js';

// --- little shapes -----------------------------------------------------------
const r1 = (n) => Math.round(n * 100) / 100;
const circ = (x, y, r) => `M${r1(x - r)} ${y}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0Z`;
const spark = (x, y, r) => `M${x} ${r1(y - r)}Q${x} ${y} ${r1(x + r)} ${y}Q${x} ${y} ${x} ${r1(y + r)}Q${x} ${y} ${r1(x - r)} ${y}Q${x} ${y} ${x} ${r1(y - r)}Z`;
const flake = (x, y, r) => {
  const h = r1(r * 0.87), q = r1(r / 2);
  return `M${x} ${r1(y - r)}V${r1(y + r)}M${r1(x - h)} ${r1(y - q)}L${r1(x + h)} ${r1(y + q)}M${r1(x - h)} ${r1(y + q)}L${r1(x + h)} ${r1(y - q)}`;
};
const sunRays = (x, y, r) => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    d += `M${r1(x + Math.cos(a) * (r + 0.9))} ${r1(y + Math.sin(a) * (r + 0.9))}L${r1(x + Math.cos(a) * (r + 2))} ${r1(y + Math.sin(a) * (r + 2))}`;
  }
  return d;
};
const bolt = (x, y, s = 1) => `M${x} ${y}l${-1.6 * s} ${2.6 * s}h${1.8 * s}l${-1.8 * s} ${3 * s}`;
const dots = (pts, r = 0.55) => pts.map(([x, y]) => circ(x, y, r)).join('');
// a ring band, as two circles (filled with evenodd so the middle stays open)
const band = (x, y, ro, ri) => circ(x, y, ro) + circ(x, y, ri);

// --- materials, one per ten levels ------------------------------------------
const MAT = [
  { f: '#8a5c40', a: '#d08a55', o: 0.6 }, // rusted, worn, leather
  { f: '#7d8793', a: '#b4bcc8', o: 0.55 }, // iron
  { f: '#b7c4d4', a: '#eef3fa', o: 0.45 }, // steel
  { f: '#4f63ad', a: '#8fd6ff', o: 0.6 }, // runed
  { f: '#8fd3ff', a: '#effaff', o: 0.45 }, // frost
  { f: '#e2943a', a: '#ffd27a', o: 0.55 }, // sunscar (the Dunes)
  { f: '#68498f', a: '#c08cff', o: 0.65 }, // gloom
  { f: '#3a78b0', a: '#ffe25a', o: 0.6 }, // storm
  { f: '#231e2e', a: '#b583ff', o: 0.9 }, // obsidian
  { f: '#f1d98a', a: '#fffbe6', o: 0.5 }, // star
];
const TRAINING = { f: '#a27a50', a: '#d9bb8e', o: 0.55 };
const IMMORTAL = { f: '#ffd24a', a: '#fff6d6', o: 0.42 };
const SET_MAT = {
  bloodbound: { f: '#8e1f2a', a: '#ff6a74', o: 0.7 },
  wardstone: { f: '#6f7480', a: '#d8dde6', o: 0.6 },
  farsight: { f: '#2f7a6a', a: '#9ff0d8', o: 0.6 },
  galeborn: { f: '#5fae8a', a: '#d6fff0', o: 0.5 },
  nightcut: { f: '#1c1a26', a: '#9aa2ff', o: 0.9 },
  veilweave: { f: '#5a3f8f', a: '#e0c8ff', o: 0.65 },
  ashen: { f: '#a5401c', a: '#ffb070', o: 0.65 },
  rimeheart: { f: '#6fb6e6', a: '#f0fbff', o: 0.5 },
};

// --- swords: blade from the bottom left to the top right -------------------
const HILT = [['l', 'M5.5 13.5L10.5 18.5'], ['l', 'M8 16L5 19'], ['b', circ(4.4, 19.6, 1.1)]];
const SWORD = [
  // 0 Rusted Blade: short and notched
  [['b', 'M7.6 14.4L10.5 11.5L11.3 12.2L13.8 9.7L17.5 6.5L16.8 9.2L13.5 12.5L12.6 11.9L9.6 16.4Z'], ...HILT, ['f', dots([[12.3, 13.3], [15.1, 10.1]], 0.5)]],
  // 1 Iron Sword: plain and honest
  [['b', 'M7.5 14.5L17.2 4.8L20 4L19.2 6.8L9.5 16.5Z'], ['a', 'M9.2 14.8L17.5 6.5'], ...HILT],
  // 2 Steel Saber: curved, with a knuckle bow
  [['b', 'M7.5 14.5C11 11 15 7.5 20.5 3.5C19 7.5 14 13 9.5 16.5Z'], ['a', 'M10 13.6C12.5 11.4 15 9 18 6.2'], ['l', 'M5.5 13.5L10.5 18.5'], ['l', 'M8 16L5 19'], ['l', 'M10.4 18.4Q8.2 21.6 4.6 19.8']],
  // 3 Runed Longsword: long, with runes down the fuller
  [['b', 'M7.5 14.5L18.6 3.6L21.2 2.8L20.4 5.4L9.5 16.5Z'], ['l', 'M4.6 12.6L11.4 19.4'], ['l', 'M8 16L5 19'], ['b', circ(4.4, 19.6, 1.1)], ['f', dots([[11, 13], [13.6, 10.4], [16.2, 7.8]], 0.55)]],
  // 4 Frostbrand: broad, with an icy edge
  [['b', 'M7.2 14.2L9 12.4L9.6 13L11.8 10.2L12.6 10.8L15 7.8L15.6 8.4L17.6 5.6L20.6 3.4L19.6 7.2L9.8 16.8Z'], ...HILT, ['a', flake(5.8, 6, 2.6)]],
  // 5 Sunscar Scimitar: widening toward the point
  [['b', 'M8 15C11 12 13 10 15.5 6.5C17 4.5 19.5 3.2 21 3.4C20.5 7.5 17.5 10.5 14.5 12.5C12.5 14 11 15.5 9.8 16.8Z'], ...HILT, ['f', circ(5.6, 6.2, 1.5)], ['a', sunRays(5.6, 6.2, 1.5)]],
  // 6 Gloomthorn Blade: thorns down both edges
  [['b', 'M7.5 14.5L17.2 4.8L20 4L19.2 6.8L9.5 16.5Z'], ['l', 'M10.6 11.4L9.2 10.2M13.6 8.4L12.2 7.2M12.6 13.4L13.8 14.8M15.6 10.4L16.8 11.8'], ['a', 'M9.4 14.4C11 12 12.4 13 14 10.6S16.4 9 18 6.6'], ...HILT],
  // 7 Stormcleaver: a broad, squared-off cleaver
  [['b', 'M7.3 14.3L14.5 7L18.2 3.6L21.4 6.8L10 17.7Z'], ['a', 'M17 6.4L14.8 9.4L16.6 9.8L13.6 13.4'], ...HILT],
  // 8 Obsidian Greatsword: huge, faceted black glass
  [['b', 'M6.8 13.8L17.5 3.3L21.3 2.7L20.7 6.5L10.2 17.2Z'], ['a', 'M10.4 13.6L12.4 13.4M13.4 10.6L15.4 10.4M16.4 7.6L18.4 7.4M12.4 9L12.6 11'], ['l', 'M4 12L12 20'], ['l', 'M8 16L5 19'], ['b', circ(4.4, 19.6, 1.2)]],
  // 9 Starforged Edge: slender, winged guard, a star where blade meets hilt
  [['b', 'M7.8 14.8L19 3.6L21 3L20.4 5L9.2 16.2Z'], ['l', 'M4.6 11.6Q7.6 13.2 8.3 15.7Q10.8 16.4 12.4 19.4'], ['l', 'M8 16L5 19'], ['f', spark(8.4, 15.6, 2.4)], ['f', spark(20.6, 3.4, 1.6)]],
];

// --- bows: upright, string on the left ---------------------------------------
const LIMB = 'M9 2.5C17 6 17 18 9 21.5C14.5 17 14.5 7 9 2.5Z';
const STRING = 'M9 2.5V21.5';
const ARROW = [['l', 'M4.5 12H19.5'], ['l', 'M17.4 10.2L19.8 12L17.4 13.8'], ['a', 'M4.5 12L3 10.5M4.5 12L3 13.5M6 12L4.5 10.5M6 12L4.5 13.5']];
const BOW = [
  // 0 Bent Shortbow: small, and the string has gone slack
  [['b', 'M9 5C15.5 7 16 17 10 20C13.5 16 13.5 8.5 9 5Z'], ['l', 'M9 5Q7.6 12.5 10 20'], ['a', 'M13.4 11.2L14.2 13.4']],
  // 1 Hunter Bow: an arrow on the string
  [['b', LIMB], ['l', STRING], ...ARROW, ['a', 'M14.6 10.8V13.2']],
  // 2 Recurve Bow: the tips curl forward
  [['b', 'M10 3.4C16.4 6.6 16.4 17.4 10 20.6C14 16.6 14 7.4 10 3.4Z'], ['l', 'M10 3.4Q7.4 2.2 7 4.4M10 20.6Q7.4 21.8 7 19.6'], ['l', 'M10 3.4V20.6'], ['a', 'M14.2 10.6V13.4']],
  // 3 Runed Longbow: tall, with runes along the limb
  [['b', 'M8.6 1.6C17.4 5.6 17.4 18.4 8.6 22.4C14.8 17.4 14.8 6.6 8.6 1.6Z'], ['l', 'M8.6 1.6V22.4'], ['f', dots([[14.1, 6.4], [15.3, 12], [14.1, 17.6]], 0.6)]],
  // 4 Frostwood Bow: icicles hang from it
  [['b', LIMB], ['l', STRING], ['a', 'M13.4 16.4L13.8 19.2M15 13.8L15.6 16.6M15.4 9.6L16.2 11.8'], ['a', flake(4.6, 6.4, 2.2)]],
  // 5 Sunscar Greatbow: heavy limbs, a sun on the grip
  [['b', 'M8.4 2C18.6 5.6 18.6 18.4 8.4 22C15 17.4 15 6.6 8.4 2Z'], ['l', 'M8.4 2V22'], ['f', circ(16, 12, 1.7)], ['a', sunRays(16, 12, 1.7)]],
  // 6 Gloomthorn Bow: thorns down its back
  [['b', LIMB], ['l', STRING], ['l', 'M14.4 6.2L16 5.2M16.4 10L18.2 9.6M16.4 14L18.2 14.4M14.4 17.8L16 18.8'], ['a', 'M13.6 5.6C15 8 13.6 10 15 12.4S14.2 16 13.2 18.6']],
  // 7 Stormcall Bow: the string is a lightning bolt
  [['b', LIMB], ['a', 'M9 2.5L10.6 8L7.8 12L10.6 16L9 21.5'], ['l', 'M14.4 10.8V13.2']],
  // 8 Obsidian Warbow: angular glass limbs
  [['b', 'M9 2L15 5L17.6 12L15 19L9 22L13 17.6L14.8 12L13 6.4Z'], ['l', 'M9 2V22'], ['a', 'M13.6 8L16 8.6M14.4 12H17M13.6 16L16 15.4']],
  // 9 Starstring Bow: starlight on the string, a star at the grip
  [['b', LIMB], ['l', STRING], ['f', spark(15, 12, 2.4)], ['f', spark(9, 7.4, 1.2)], ['f', spark(9, 16.6, 1.2)]],
];

// --- daggers: a crossed pair (the second is the first, mirrored) -------------
const DHILT = [['l', 'M6.3 14.1L9.9 17.7'], ['l', 'M8 16L5 19'], ['b', circ(4.6, 19.4, 0.8)]];
const DAGGERS = [
  // 0 Rusted Shivs
  [['b', 'M7.7 14.7L11 11.6L11.5 12.3L15.8 7.2L17.4 6.6L16.5 9L12.4 13L11.8 12.6L9.3 16.3Z'], ['l', 'M8 16L5 19'], ['a', 'M7.2 17.2L6.4 16.4M6.4 18L5.6 17.2']],
  // 1 Iron Daggers
  [['b', 'M7.7 14.7L16.6 5.8L18.8 5.2L18.2 7.4L9.3 16.3Z'], ...DHILT],
  // 2 Steel Stilettos: needle-thin
  [['b', 'M7.9 15L19.4 4.2L9 16.1Z'], ['l', 'M7 14.4L9.6 17'], ['l', 'M8.3 15.7L5 19'], ['b', circ(4.6, 19.4, 0.9)]],
  // 3 Runed Fangs: curved, runed
  [['b', 'M7.7 14.7C11 10 14.5 7 19 4.5C17.5 9 13.5 13 9.3 16.3Z'], ...DHILT, ['f', dots([[12.2, 11.6], [14.8, 9.2]], 0.5)]],
  // 4 Frostbite Knives: jagged ice
  [['b', 'M7.7 14.7L10.4 12L10.8 12.8L13.4 9.6L13.8 10.4L16.4 7.2L19 5L18.2 8.2L9.3 16.3Z'], ...DHILT, ['a', 'M15 11.6l1.2 1.2M12.8 13.8l1.2 1.2']],
  // 5 Sunscar Kris: wavy blades
  [['b', 'M7.7 14.7Q9.6 12 10.8 12.4Q11.6 10.4 13.2 10.6Q14 8.6 15.6 8.6L19 4.6L17.8 8.4Q16.4 9.6 16.1 10.6Q14.2 11 13.7 12.6Q11.9 12.8 11.3 14.6Q9.6 15 9.3 16.3Z'], ...DHILT, ['f', circ(4.6, 19.4, 0.7)]],
  // 6 Gloomthorn Needles: thin, thorned, dripping
  [['b', 'M7.9 15L19.2 4.4L9 16.1Z'], ['l', 'M12.6 11.2L11.4 10.2M15.6 8.4L14.4 7.4'], ['l', 'M7 14.4L9.6 17'], ['l', 'M8.3 15.7L5 19'], ['a', 'M16.6 9.6Q17.4 10.8 16.8 11.6']],
  // 7 Stormcut Blades: zigzag edges
  [['b', 'M7.7 14.7L11.2 11.6L11 10.6L14.6 8.2L14.4 7.2L19 4.8L16.8 9.4L15.8 9.2L13.4 12.8L12.4 12.6L9.3 16.3Z'], ...DHILT, ['a', 'M17 5.6L18.6 3.4']],
];
// 8 and 9 are drawn on their own (not mirrored): see DAGGER_SOLO
const DAGGER_SOLO = {
  // 8 Obsidian Claws: three black glass claws over a knuckle bar
  8: [['b', 'M6 15C6 10 8 6 12 3C10.2 7 9.2 11 8.6 15Z'], ['b', 'M9.6 15C10 10 12.6 6.6 16.6 4C14.2 8 12.8 11.6 12.2 15Z'], ['b', 'M13 15C14 11 16.6 8 20.6 6.6C17.6 9.6 16.2 12.6 15.6 15Z'], ['b', 'M4.6 15H17.4V18.6H4.6Z'], ['a', 'M9 8.6L10.2 9.4M13.2 8.4L14.4 9.2M17 10L18 11'], ['l', 'M7.6 18.6V21M11 18.6V21M14.4 18.6V21']],
  // 9 Starforged Fangs: crossed fangs of star metal, sparkling
  9: null,
};
const FANG = [['b', 'M7.7 14.7C11 10 14.5 7 19.6 4C18 9 13.5 13 9.3 16.3Z'], ['l', 'M5.8 13.6Q8 14.2 8.4 16Q10 16.8 10.4 18.2'], ['l', 'M8 16L5 19']];

// --- staves: a shaft from the bottom left, the head at the top right ---------
const SHAFT = 'M4 21L16 8.6';
const STAFF = [
  // 0 Cracked Wand: short, cracked, a little spark left in it
  [['r', 'M7 18.6L16 9.6'], ['a', 'M10.6 15L12 14.8L11.6 13.4L13 13.2'], ['f', spark(17.6, 8, 1.8)]],
  // 1 Oak Staff: knotted wood with a leaf at the top
  [['r', 'M4 21L17 6.6'], ['b', 'M17 6.6C17.6 3.6 20.6 2.4 21.8 2.4C21.8 5 20.4 7.6 17 6.6Z'], ['l', 'M9.4 15.4L8 14.6M13 11.4L14.4 12.2'], ['a', 'M17.6 6L20.6 3.2']],
  // 2 Iron-shod Staff: iron bands and an iron cap
  [['r', 'M4 21L17 6.6'], ['l', 'M5.4 18.6L7.4 20.6M14.2 9.6L16.2 11.6'], ['b', 'M16.4 7.2L17.6 3.6L20.6 4.4L19.6 8Z'], ['a', 'M17.4 5.6L19.8 6.2']],
  // 3 Runed Staff: rune rings and an orb
  [['r', SHAFT], ['b', circ(18, 6.4, 3)], ['f', circ(18, 6.4, 1.1)], ['a', 'M8.4 16.8L9.8 18.2M11.4 13.6L12.8 15']],
  // 4 Rimewood Staff: a crown of ice crystals
  [['r', SHAFT], ['b', 'M18.2 1.6L20.6 5.8L18.2 10L15.8 5.8Z'], ['b', 'M21 6.6L23 8.4L20.6 9.6L19.8 7.6Z'], ['a', 'M18.2 3.4V8.2'], ['a', flake(6, 6, 2)]],
  // 5 Sunscar Rod: a sun disc
  [['r', SHAFT], ['b', circ(18.2, 6.2, 2.6)], ['a', sunRays(18.2, 6.2, 2.6)]],
  // 6 Gloomcap Staff: topped with a slow, thinking mushroom
  [['r', 'M4 21L15.4 8.4'], ['b', 'M12.6 8C12.6 3.2 21.8 1.6 22.2 6.8Q17.6 6.2 12.6 8Z'], ['f', dots([[16, 4.6], [19, 4], [17.8, 6.2]], 0.55)], ['a', 'M14 9.6V11M20.6 7.6V9']],
  // 7 Stormcall Staff: a fork with lightning between the prongs
  [['r', 'M4 21L15 9'], ['l', 'M15 9L14.4 3.6M15 9L20.6 9.8'], ['a', 'M15.6 3.4L18 6.2L16.4 6.8L19.8 9']],
  // 8 Obsidian Scepter: short, with a great shard of black glass
  [['r', 'M6 19L13.6 10.6'], ['b', 'M13.4 10.8L14.6 4.4L19.2 2.4L21.8 5L19.8 9.6Z'], ['a', 'M14.6 4.4L17.6 7.2L21.8 5M17.6 7.2L13.4 10.8'], ['l', 'M4.6 17.6L7.4 20.4']],
  // 9 Starcall Staff: a crescent holding a star
  [['r', 'M4 21L14.6 9.8'], ['b', 'M14.2 10.2A5.6 5.6 0 1 1 21.6 3.4A4.2 4.2 0 1 0 14.2 10.2Z'], ['f', spark(18.6, 6.6, 2.2)]],
];

// --- armour -------------------------------------------------------------------
const HELM = [
  // 0 Leather Cap
  [['b', 'M5 15C5 7 19 7 19 15Z'], ['l', 'M3.4 15H20.6'], ['a', 'M12 8.4V14.6M8.2 10.4Q12 9.2 15.8 10.4']],
  // 1 Iron Helm: a nasal guard and rivets
  [['b', 'M5 17V12A7 7 0 0 1 19 12V17Z'], ['l', 'M12 9V20'], ['f', dots([[7, 15], [17, 15], [8.6, 9.6], [15.4, 9.6]], 0.6)]],
  // 2 Visored Helm
  [['b', 'M5 19.5V11A7 7 0 0 1 19 11V19.5Z'], ['l', 'M6.6 13H17.4'], ['l', 'M9.6 16V18.4M12 16V18.4M14.4 16V18.4'], ['a', 'M12 4V8']],
  // 3 Duelist Mask
  [['b', 'M3.4 9C7 7 17 7 20.6 9C20 14 16 16.2 12 14C8 16.2 4 14 3.4 9Z'], ['l', 'M6.8 10.6Q8.6 9.4 10.4 10.8M13.6 10.8Q15.4 9.4 17.2 10.6'], ['a', 'M12 14.4V20M10.4 18.6L12 20L13.6 18.6']],
  // 4 Rimeguard Helm: a fur trim and icicle spikes
  [['b', 'M5 17V12A7 7 0 0 1 19 12V17Z'], ['a', 'M4.6 15.4Q6 14.2 7.4 15.4T10.2 15.4T13 15.4T15.8 15.4T18.6 15.4'], ['a', 'M9 5.4L8.2 2.6M12 4.8V1.6M15 5.4L15.8 2.6']],
  // 5 Dune Veil: a head wrap with a veil across the face
  [['b', 'M5 20C4 9 8 4 12 4C16 4 20 9 19 20Z'], ['l', 'M8 11H16'], ['l', 'M5.6 14Q12 17.6 18.4 14'], ['a', 'M5.8 8.6Q12 6.4 18.2 8.6']],
  // 6 Gloomcap Hood: a deep hood speckled with spores
  [['b', 'M4 20.5C4 10 8 3.5 12 3.5C16 3.5 20 10 20 20.5C17.4 17.6 15.4 13.4 12 13.4C8.6 13.4 6.6 17.6 4 20.5Z'], ['f', dots([[9.4, 7.4], [14, 6.4], [16.6, 9.6], [7, 10.8]], 0.65)]],
  // 7 Stormcrest Helm: a lightning-bolt crest
  [['b', 'M5 18V13A7 7 0 0 1 19 13V18Z'], ['b', 'M12 6.2L9.6 1.8L13.4 3L12.2 0.8L16.4 4.2L13.6 4.4Z'], ['l', 'M6.6 14.4H17.4'], ['a', bolt(16.2, 9, 0.8)]],
  // 8 Obsidian Visage: a faceted glass face
  [['b', 'M6 3.6H18L20.4 11L16 20.4H8L3.6 11Z'], ['l', 'M7.6 10L11 11.2M16.4 10L13 11.2'], ['a', 'M12 3.6V8M6 3.6L9 8.6M18 3.6L15 8.6M9.6 16.6H14.4']],
  // 9 Crown of Dusk
  [['b', 'M4 18.5V9L8 13L12 5.6L16 13L20 9V18.5Z'], ['l', 'M4 15.6H20'], ['f', dots([[8, 17.1], [12, 17.1], [16, 17.1]], 0.75)], ['f', spark(12, 2.4, 1.8)]],
];
const CHEST = [
  // 0 Padded Vest: quilted
  [['b', 'M7 4L10 5.6Q12 7 14 5.6L17 4L19.6 8L18 9.6V20H6V9.6L4.4 8Z'], ['a', 'M6 12.4H18M6 16.2H18M12 7V20']],
  // 1 Chain Hauberk: sleeves and ring-mail
  [['b', 'M7 4L12 6L17 4L21.2 9L18.6 11L18 20.4H6L5.4 11L2.8 9Z'], ['a', dots([[9, 10], [12, 10], [15, 10], [10.5, 13], [13.5, 13], [9, 16], [12, 16], [15, 16]], 0.7)]],
  // 2 Plate Cuirass
  [['b', 'M6 5L12 7L18 5L20 9L18 10V20H6V10L4 9Z'], ['l', 'M12 7V20'], ['l', 'M6 14H18M6 17H18'], ['a', 'M8.4 9.4Q12 11.4 15.6 9.4']],
  // 3 Runed Aegis: a breastplate with a ward circle
  [['b', 'M6 5L12 7L18 5L20 9L18 10V18L12 21L6 18V10L4 9Z'], ['l', circ(12, 13, 3.4)], ['f', dots([[12, 9.6], [15.4, 13], [12, 16.4], [8.6, 13]], 0.55)]],
  // 4 Rimeguard Plate: fur collar, frost on the plate
  [['b', 'M6 6L12 8L18 6L20 10L18 11V20H6V11L4 10Z'], ['a', 'M4.4 6.4Q6 4.6 8 6Q10 4.2 12 6Q14 4.2 16 6Q18 4.6 19.6 6.4'], ['l', 'M12 8V20'], ['a', flake(15, 15, 2)]],
  // 5 Dune Wraps: layers wound round
  [['b', 'M7.4 4L12 5.6L16.6 4L19 8.4L17.6 9.6L18 20H6L6.4 9.6L5 8.4Z'], ['l', 'M6.2 11L17.8 14.4M6.2 15L17.8 18.4'], ['a', 'M16.6 4L6.2 11M16.6 9.6L13 20']],
  // 6 Gloomweave Coat: long, high-collared, dark
  [['b', 'M8 3.4H16L18.4 8L17.6 21H6.4L5.6 8Z'], ['l', 'M8 3.4L12 9L16 3.4M12 9V21'], ['a', 'M6.4 21L7 12.6M17.6 21L17 12.6'], ['f', dots([[12, 12.4], [12, 15.6]], 0.6)]],
  // 7 Stormplate: a lightning emblem
  [['b', 'M6 5L12 7L18 5L20 9L18 10V20H6V10L4 9Z'], ['l', 'M6 17H18'], ['a', 'M13.6 8.6L10.6 12.6H13.4L10.4 16.6']],
  // 8 Obsidian Cuirass: overlapping glass scales
  [['b', 'M6 5L12 7L18 5L20 9L18 10V20H6V10L4 9Z'], ['a', 'M6 12.4L9 14L12 12.4L15 14L18 12.4M6 16.2L9 17.8L12 16.2L15 17.8L18 16.2M9 10L12 8.4L15 10']],
  // 9 Titan Carapace: great pauldrons
  [['b', 'M2 7.6C3 4.2 7 3 9 5L12 6.6L15 5C17 3 21 4.2 22 7.6L19 10V20.4H5V10Z'], ['l', 'M5 10Q3.4 9.6 2 7.6M19 10Q20.6 9.6 22 7.6'], ['l', 'M7 14.4H17M8 17.6H16'], ['f', spark(12, 10.6, 2.2)]],
];
const BOOTS = [
  // 0 Worn Boots: patched
  [['b', 'M8 3H13V14Q19 14.4 20 18V20.4H8Z'], ['l', 'M8 18.2H20'], ['a', 'M9.6 9H11.6V11.4H9.6Z']],
  // 1 Traveler Boots: a turned-down cuff and laces
  [['b', 'M8 4.6H13.4V14Q19 14.4 20 18V20.4H8Z'], ['b', 'M7.2 2.6H14.2V6H7.2Z'], ['l', 'M8 18.2H20'], ['a', 'M11.4 8L13.6 9.4M11.4 10.6L13.6 12']],
  // 2 Striders: tall and buckled
  [['b', 'M8.4 2H12.6V15Q18.6 15.2 19.6 18.4V20.4H8.4Z'], ['l', 'M8.4 18.6H19.6'], ['l', 'M8.4 7H12.6M8.4 11H12.6'], ['f', dots([[11, 7], [11, 11]], 0.6)]],
  // 3 Windrunners: a wing at the heel
  [['b', 'M9 3H14V14Q19.6 14.4 20.6 18V20.4H9Z'], ['l', 'M9 18.2H20.6'], ['a', 'M9 8C6 6.8 4.4 5 3.6 3.2C5.4 4.4 7 4.8 9 4.6M9 11.6C6.4 11 4.6 9.6 3.4 7.8']],
  // 4 Frostwalkers: spiked soles
  [['b', 'M8 3H13V14Q19 14.4 20 18V19.6H8Z'], ['l', 'M8.6 19.6L9.4 21.6M12 19.6L12.6 21.6M15.4 19.6L16 21.6M18.6 19.6L19.2 21.6'], ['a', flake(5, 8, 2)]],
  // 5 Dune Sandals: a sole and straps
  [['b', 'M4.6 17.6H19.6Q21.4 18.8 19.4 20.6H5.6Q3.8 19.6 4.6 17.6Z'], ['l', 'M8.6 17.6V4.4M8.6 7.6Q11.6 8.2 12.2 10.6M8.6 12.2Q12 12.6 13.4 17.6M15.6 17.6Q15 15.4 12.2 14.6'], ['f', circ(17.4, 7, 1.4)], ['a', sunRays(17.4, 7, 1.4)]],
  // 6 Gloomstep Boots: soft, curled, mossy
  [['b', 'M9 4H13.4V13.6C17 13.6 20.6 15 20.6 18.6C20.6 19.8 19.6 20.4 18.4 20.4H9Z'], ['l', 'M20.6 18.6Q22.4 18 22 16'], ['f', dots([[10.6, 18], [14, 18.6], [17.4, 18.2]], 0.7)], ['a', 'M9 7.4Q11 8.4 13.4 7.4']],
  // 7 Stormstriders: a bolt down the side
  [['b', 'M8 3H13V14Q19 14.4 20 18V20.4H8Z'], ['l', 'M8 18.2H20'], ['a', 'M11.8 4.8L9.8 9.4H11.8L9.8 14']],
  // 8 Obsidian Greaves: armoured shins and a knee plate
  [['b', 'M8 6H13.4V14L19.6 15.4L20.6 20.4H8Z'], ['b', 'M7 1.6H14.4L13.4 6.4H8Z'], ['a', 'M8 10L13.4 11.4M13.4 14L15.4 17.4M8 15.4L10.6 20.4']],
  // 9 Phase Treads: a ghost of the boot a step ahead
  [['a', 'M11 2H16V13Q22 13.4 23 17V19.4H11'], ['b', 'M7 4H12V15Q18 15.4 19 19V21.4H7Z'], ['l', 'M7 19.2H19'], ['f', spark(4, 8, 1.6)]],
];
const RING = [
  // 0 Copper Band: plain, green at the edges
  [['b', band(12, 13.6, 6.4, 4.2)], ['f', dots([[7, 16.4], [16.4, 9.4]], 0.6)]],
  // 1 Silver Ring: a small stone
  [['b', band(12, 15, 5.6, 4.2)], ['b', 'M12 4.6L14.2 7.4L12 10.2L9.8 7.4Z'], ['a', 'M12 4.6V10.2']],
  // 2 Signet
  [['b', band(12, 15, 5.6, 3.8)], ['b', 'M8.8 3.4H15.2V9H8.8Z'], ['a', 'M10.6 5L13.4 7.4M13.4 5L10.6 7.4']],
  // 3 Arcane Loop: runes circle it
  [['b', band(12, 13, 5.6, 3.8)], ['f', dots([[12, 3.4], [20.6, 13], [12, 22.6], [3.4, 13]], 0.7)], ['a', 'M6.2 6.2L5.4 5.4M17.8 6.2L18.6 5.4M17.8 19.8L18.6 20.6M6.2 19.8L5.4 20.6']],
  // 4 Rime Band: an ice crystal
  [['b', band(12, 15.4, 5.4, 3.8)], ['b', 'M12 1.6L14.4 5.8L12 10L9.6 5.8Z'], ['a', 'M9 3.4L7 2.4M15 3.4L17 2.4']],
  // 5 Sunscar Seal: the sun, stamped
  [['b', band(12, 15.6, 5.4, 3.8)], ['b', circ(12, 6, 3)], ['a', sunRays(12, 6, 3)]],
  // 6 Gloom Ring: something grows on it
  [['b', band(12, 15.2, 5.6, 4)], ['b', 'M8 9.6C8 5 16 4.2 16 9.6Q12 8.4 8 9.6Z'], ['l', 'M12 9V10.4'], ['f', dots([[10.6, 7.2], [13.6, 7]], 0.55)]],
  // 7 Storm Loop: a bolt rising from it
  [['b', band(12, 15.4, 5.4, 3.8)], ['a', 'M13.4 1.6L10.4 5.8H13.6L10.6 10']],
  // 8 Obsidian Band: wide and faceted
  [['b', 'M8.2 6.4H15.8L19.6 10.2V17.8L15.8 21.6H8.2L4.4 17.8V10.2ZM9.4 9.6H14.6L16.6 11.6V16.4L14.6 18.4H9.4L7.4 16.4V11.6Z'], ['a', 'M8.2 6.4L9.4 9.6M15.8 6.4L14.6 9.6M19.6 17.8L16.6 16.4M4.4 17.8L7.4 16.4']],
  // 9 Eternity Band: stones all the way round
  [['b', band(12, 13, 6.4, 4.2)], ['f', dots([[12, 7.7], [17.3, 13], [12, 18.3], [6.7, 13], [15.75, 9.25], [15.75, 16.75], [8.25, 16.75], [8.25, 9.25]], 0.75)], ['f', spark(19.6, 4, 1.8)]],
];

// --- Immortals: pictures of their own ----------------------------------------
const IMM = {
  // Stormcaller (sword): a broad blade, lightning off the point
  stormcaller: [['b', 'M7 14L17.6 3.4L21 2.8L20.6 6.4L10 17Z'], ['l', 'M4.4 12.4L11.6 19.6'], ['l', 'M8 16L5 19'], ['b', circ(4.4, 19.6, 1.2)], ['a', 'M10.4 13.6L13 13.2L12.4 11L15.4 10.6L14.8 8.4L18 7.8'], ['a', 'M21.4 1.6L23 0.6M22.6 4L24 4.2']],
  // Stormstring (bow): a lightning arrow on the string
  stormstring: [['b', LIMB], ['l', STRING], ['a', 'M4 12L8 10.6L11 13L15 11.2L19.6 12'], ['l', 'M17.6 10.4L19.8 12L17.6 13.6'], ['f', spark(15, 4.4, 1.6)]],
  // Nightfang (daggers): black fangs and a crescent moon
  nightfang: null,
  // Wishfall (staff): a star falling onto the head of the staff
  wishfall: [['r', 'M4 21L15 9'], ['b', circ(16.6, 7.6, 2.4)], ['f', spark(20.4, 3.4, 2.6)], ['a', 'M18.4 5.4L16.2 2.6M19.8 6.4L18.8 9.2M17.2 1.6L15.6 0.6']],
  // Crown of the Undying: a crown with laurel wings and a halo
  undying: [['b', 'M6 19V11L9 14L12 8L15 14L18 11V19Z'], ['l', 'M6 16.4H18'], ['a', 'M6 13C3.4 12 2.2 9.4 2.4 6.6M6 16C2.6 15.4 1.2 12.4 1.4 9.6M18 13C20.6 12 21.8 9.4 21.6 6.6M18 16C21.4 15.4 22.8 12.4 22.6 9.6'], ['a', 'M8 4.4Q12 2 16 4.4'], ['f', circ(12, 17.7, 0.8)]],
  // Aegis of Retribution: a shield that hits back
  retribution: [['b', 'M12 3L19 5.6V11.6C19 16 16 19.4 12 21C8 19.4 5 16 5 11.6V5.6Z'], ['l', 'M12 3V21M5 10.6H19'], ['a', 'M2.4 4L4 5.4M21.6 4L20 5.4M1.6 12H3.4M22.4 12H20.6M3.2 19.4L5 18M20.8 19.4L19 18']],
  // Slipstream Treads: winged boots trailing wind
  slipstream: [['b', 'M10 3H15V14Q21 14.4 22 18V20.4H10Z'], ['l', 'M10 18.2H22'], ['a', 'M10 7.6C7.2 6.6 5.8 4.8 5.2 3C6.8 4.2 8.2 4.6 10 4.4M10 11C7.6 10.4 6 9.2 4.8 7.4'], ['a', 'M1.4 14H6.6M2.6 17H7.4M1 20H7']],
  // Oathbreaker's Signet: a cracked seal with a blade through it
  oathsignet: [['b', band(12, 15.4, 5.4, 3.8)], ['b', 'M8.4 2.6H15.6V9.4H8.4Z'], ['a', 'M12 0.6V11.4M10.6 3L12.6 5.4L11 7.4'], ['l', 'M10.4 1.6H13.6']],
  // Sporeheart: a breastplate with a living heart, breathing spores
  sporeheart: [['b', 'M6 5L12 7L18 5L20 9L18 10V20H6V10L4 9Z'], ['f', 'M12 16.6C9 14.4 8.4 12.6 9.6 11.4C10.6 10.4 11.6 11 12 11.8C12.4 11 13.4 10.4 14.4 11.4C15.6 12.6 15 14.4 12 16.6Z'], ['a', circ(4, 3.4, 0.9) + circ(20.6, 2.6, 0.7) + circ(21.6, 12.4, 0.8) + circ(2.4, 14, 0.7)]],
  // The Unwished Crown: a crown coming apart into motes
  unwished: [['b', 'M4 18.5V9L8 13L12 5.6L15 11'], ['l', 'M4 15.6H14M4 18.5H13'], ['a', 'M12 5.6L13.4 8.4M15 11L16.2 13.2'], ['f', dots([[17, 9.4], [19.4, 7.4], [18.4, 13.4], [20.8, 11.4], [16.4, 17.4], [19.6, 16.4], [22, 14.8]], 0.65)]],
  // Edric's Sword: a plain blade with a blue grip and a blue ribbon at the guard
  edric: [['b', 'M7.5 14.5L17.2 4.8L20 4L19.2 6.8L9.5 16.5Z'], ['l', 'M5.5 13.5L10.5 18.5'], ['f', 'M8.6 15.4L9.4 16.2L5.6 20L4.8 19.2Z'], ['b', circ(4.4, 19.6, 1.1)], ['f', 'M10.6 17.6Q13.4 19.8 12.4 22.4Q11.6 20.4 9.8 19.4Z']],
  // Edric's Colours: a band of gate iron with blue cloth knotted round it
  bluetrim: [['b', band(12, 14.6, 5.8, 4)], ['f', 'M9.4 7.4L14.6 7.4L15.4 10L8.6 10Z'], ['f', 'M10.6 9.8Q8.4 13.4 9.4 15.8L11 12.4Z'], ['f', 'M13.4 9.8Q15.6 13.4 14.6 15.8L13 12.4Z']],
  // The Timekeeper: an hourglass set on a ring
  timekeeper: [['b', band(12, 16.6, 5, 3.4)], ['b', 'M8.6 1.6H15.4L12 6L15.4 10.4H8.6L12 6Z'], ['l', 'M7.8 1.6H16.2M7.8 10.4H16.2'], ['f', 'M10.4 9.8H13.6L12 7.8Z']],
};
const IMM_MAT = {
  nightfang: { f: '#221a34', a: '#c9a8ff', o: 0.9 },
  edric: { f: '#c7ccd6', a: '#4a7aff', o: 0.45 },
  bluetrim: { f: '#9aa3b2', a: '#4a7aff', o: 0.5 },
  sporeheart: { f: '#ffd24a', a: '#8ae0a0', o: 0.4 },
  unwished: { f: '#ffd24a', a: '#fff6d6', o: 0.35 },
};

// --- finding an item's picture ----------------------------------------------
const PREFIXES = RARITIES.map((r) => r.prefix).filter(Boolean);
/** "Exalted Frostbrand" -> "Frostbrand". */
export function baseName(name) {
  for (const p of PREFIXES) if (name && name.startsWith(p + ' ')) return name.slice(p.length + 1);
  return name || '';
}
// "Frostbrand" -> { cls: 'warrior', slot: 'weapon', tier: 4 }
const BY_NAME = new Map();
for (const cls in WEAPONS) WEAPONS[cls].names.forEach((n, tier) => BY_NAME.set(n, { cls, slot: 'weapon', tier }));
for (const slot in BASE_NAMES) if (slot !== 'weapon') BASE_NAMES[slot].forEach((n, tier) => BY_NAME.set(slot + ':' + n, { slot, tier }));
const STARTERS = Object.fromEntries(Object.entries(WEAPONS).map(([cls, w]) => [w.starter, cls]));
const WEAPON_ART = { warrior: SWORD, archer: BOW, rogue: DAGGERS, mage: STAFF };
const ARMOUR_ART = { helm: HELM, chest: CHEST, boots: BOOTS, ring: RING };
// set pieces: the shape they borrow, in their set's colours
const SET_TIER = { weapon: 8, helm: 9, chest: 2, boots: 8, ring: 2 };
// a class Immortal weapon looks like the class's own
const IMM_WEAPON = { warrior: 'stormcaller', archer: 'stormstring', rogue: 'nightfang', mage: 'wishfall' };

const tierOf = (item) => Math.max(0, Math.min(9, Math.floor(((item.ilvl || 1) - 1) / 10)));

function partsFor(item) {
  const slot = item.slot;
  const cls = item.cls || 'warrior';
  if (item.effect) {
    const key = item.effect === 'stormcaller' && slot === 'weapon' ? IMM_WEAPON[cls] || 'stormcaller' : item.effect;
    return { key: 'imm:' + key, mat: IMM_MAT[key] || IMMORTAL };
  }
  if (item.set && SET_MAT[item.set]) return { key: slot, tier: SET_TIER[slot], cls, mat: SET_MAT[item.set] };
  if (slot === 'weapon' && STARTERS[item.name]) return { key: slot, tier: 1, cls: STARTERS[item.name], mat: TRAINING };
  const base = baseName(item.name);
  const hit = slot === 'weapon' ? BY_NAME.get(base) : BY_NAME.get(slot + ':' + base);
  const tier = hit ? hit.tier : tierOf(item);
  return { key: slot, tier, cls: hit && hit.cls ? hit.cls : cls, mat: MAT[tier] };
}

function art({ key, tier, cls }) {
  if (key.startsWith('imm:')) {
    const k = key.slice(4);
    if (k === 'nightfang') return { mirror: FANG, extra: [['b', 'M15 1.6A4 4 0 1 0 19.6 7.4A3.2 3.2 0 1 1 15 1.6Z']] };
    return { solo: IMM[k] };
  }
  if (key === 'weapon') {
    if (cls === 'rogue') {
      if (tier === 8) return { solo: DAGGER_SOLO[8] };
      if (tier === 9) return { mirror: FANG, extra: [['f', spark(12, 3.6, 2.2)], ['f', spark(12, 20.4, 1.2)]] };
      return { mirror: DAGGERS[tier] };
    }
    return { solo: (WEAPON_ART[cls] || SWORD)[tier] };
  }
  return { solo: (ARMOUR_ART[key] || RING)[tier] };
}

function draw(parts, mat) {
  let s = '';
  for (const [kind, d] of parts) {
    if (kind === 'b') s += `<path d="${d}" fill="${mat.f}" fill-opacity="${mat.o}" fill-rule="evenodd"/>`;
    else if (kind === 'l') s += `<path d="${d}"/>`;
    else if (kind === 'a') s += `<path d="${d}" stroke="${mat.a}" stroke-width="1.3"/>`;
    else if (kind === 'f') s += `<path d="${d}" fill="${mat.a}" stroke="none"/>`;
    else if (kind === 'r') s += `<path d="${d}" stroke-width="3.6"/><path d="${d}" stroke="${mat.f}" stroke-width="1.7"/>`;
  }
  return s;
}

const cache = new Map();
/** The inside of an item's <svg viewBox="0 0 24 24">, or '' if it has no picture of its own. */
export function itemIconInner(item) {
  if (!item || !item.slot) return '';
  const p = partsFor(item);
  const id = `${p.key}|${p.tier}|${p.cls}|${p.mat.f}|${p.mat.a}`;
  if (cache.has(id)) return cache.get(id);
  const a = art(p);
  let s = '';
  if (a.solo) s = draw(a.solo, p.mat);
  else if (a.mirror) s = `<g transform="matrix(-1 0 0 1 24 0)">${draw(a.mirror, p.mat)}</g>${draw(a.mirror, p.mat)}`;
  if (a.extra) s += draw(a.extra, p.mat);
  cache.set(id, s);
  return s;
}
