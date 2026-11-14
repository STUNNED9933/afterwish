// Exploration surprises and Remnant bosses (0.29): things worth chasing between boss fights.
//
//   Rare enemies   now and then a camp spawns a named Rare: two modifiers, five times the
//                  health, six times the rewards, a good drop, Wishdust and a chance at a set piece.
//   The Wishthief  a glittering thief that runs from you, spilling gold when hit, and gets
//                  away after 25 seconds. Catch it for a burst of loot, a shard and Wishdust.
//   Remnants       once you have beaten a boss a few times, it sometimes comes back as its
//                  Remnant: tougher, with one new attack, and a set piece guaranteed.
// The numbers live here; the rules are in sim/world.js.

export const RARE = {
  chance: 1 / 60, // per camp spawn (never a boss, never in a rift), at most one Rare on a map
  hp: 5, // times a normal enemy's health (an elite is 2.6)
  dmg: 1.3,
  scale: 1.3,
  reward: 6, // EXP and gold
  affixes: 2,
  dust: [3, 5],
  better: 0.3, // chance its guaranteed Epic is Legendary or better instead
  set: 0.12, // chance of a set piece too
};

const RARE_NAMES = ['Gristle', 'Ashmaw', 'Velka', 'Thorne', 'Murk', 'Sallow', 'Kerrin', 'Brand', 'Ilsa', 'Old Tom', 'Grieve', 'Morrow', 'Quill', 'Rook', 'Wren-that-was', 'Cinder', 'Halloway', 'Nettle', 'Brisk', 'Vane'];
const RARE_EPITHETS = ['the Unwished', 'Who Waits', 'of the Last Light', 'the Unfinished', 'Twice-Promised', 'the Hungry Echo', 'No-Name', 'the Kept Promise', 'Ashes-in-Mouth', 'the Forgotten Wish', 'Who Counted Stars', 'the Long Shadow'];
export function rareName(rng) {
  return `${RARE_NAMES[Math.floor(rng() * RARE_NAMES.length)]} ${RARE_EPITHETS[Math.floor(rng() * RARE_EPITHETS.length)]}`;
}

export const THIEF = {
  onEnter: 0.25, // chance one is hiding on a map when you arrive
  every: 120, // and every this many seconds on a map...
  again: 0.2, // ...this chance of another
  near: 12, // it bolts when someone comes this close (or hits it)
  life: 25, // seconds from bolting until it gets away
  speed: 0.9, // times the move speed of whoever is nearest: you can catch it, just
  run: 3, // it runs this long...
  stumble: 0.8, // ...then stops to catch its breath this long (a window for aimed shots)
  coins: 0.06, // gold spilled for every tenth of its health, as a share of its gold value
  dust: 5,
  items: 3, // gear when caught (one of them Legendary or better)
  hp: 4, // times its listed health, on top of the level scaling (and half a world tier's extra health)
};

export const REMNANT = {
  after: 3, // kills of that boss before its Remnant can appear
  chance: 0.25, // per respawn after that
  hp: 1.8,
  dmg: 1.25,
  reward: 1.5,
  dust: 10,
  // Its new attack: a ring of falling blows around you, every few seconds.
  every: 9,
  first: 5,
  count: 5,
  spread: 5.5,
  radius: 2.4,
  warn: 1.1,
  blow: 1.2, // times its first attack's damage
  attack: { boss: 'Iron Rain', boss2: 'Spore Bloom', boss3: 'Unwishing' },
};
export const remnantName = (def) => `Remnant of ${def.name}`;
