// Exploration surprises and Remnant bosses (0.29): things worth chasing between boss fights.
//
//   Storied enemies  now and then a camp spawns a named, Storied enemy: two modifiers, five times the
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
  better: 0.3, // chance its guaranteed Epic is Mythic or better instead
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
  items: 3, // gear when caught (one of them Mythic or better)
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
  attack: { boss: 'Mirrored Oath', boss2: 'Spore Bloom', boss3: 'Unwishing' },
  unique: 0.2, // its own Immortal (items.js REMNANT_UNIQUE)
  glow: 0.3, // its own weapon glow (cosmetics.js)
  // The Warden: two shades of itself, fighting with its combo, every 18 s (they fall with it).
  shades: { every: 18, first: 6, count: 2, hp: 0.06, dmg: 0.5 },
  // The Mycelord: spore pools that grow under your feet and hurt while you stand in them.
  pools: { every: 14, first: 5, count: 2, from: 1, to: 4.5, grow: 0.8, life: 14, tick: 0.5, dmg: 0.1, near: 2.5, far: 7 },
  // The Unmade: three wish-stars. Break them inside 10 s, or each one left heals it 5% and makes it hit 10% harder.
  stars: { every: 20, first: 8, count: 3, dist: 9, hp: 0.03, life: 10, heal: 0.05, dmg: 0.1 },
};

// World events (0.31): now and then something happens on the map you are on.
export const EVENTS = {
  first: 45, // seconds on a map before the first chance
  every: 90, // then a chance this often
  chance: 0.3,
  // A meteor: it lands, a pack crawls out of the crater; clear it for a radiant chest.
  meteor: { warn: 3, r: 9, pack: 6, time: 120, hit: 3, impact: 1.5 },
  // A shrine: step in and hold it 60 s against waves; leave it empty 6 s and it goes dark.
  shrine: { r: 6, wait: 90, hold: 60, wave: 8, per: 3, grace: 6, dust: 5, tickets: 1 },
};

// The travelling merchant (0.31): shows up on a map now and then for 3 minutes.
export const MERCHANT = {
  chance: 0.15, // on arriving at a map
  gap: 360, // at least this long between visits
  stay: 180,
  // Prices: gold scales with the map's level (as gear and upgrades do).
  stock: [
    { kind: 'gear', min: 3, label: 'Mystery gear (Epic or better)', gold: 450 },
    { kind: 'gear', min: 3, label: 'Mystery gear (Epic or better)', gold: 450 },
    { kind: 'gear', min: 4, label: 'Mystery gear (Mythic or better)', tickets: 2 },
    { kind: 'dust', n: 5, label: '5 Wishdust', gold: 350 },
    { kind: 'set', label: 'A set piece (usually your own subclass\'s)', tickets: 3 },
    { kind: 'glass', label: 'An Unwishing Glass (resets your Wish points)', tickets: 4, chance: 0.4 }, // only on some visits
  ],
};

// Bounties (0.33): three jobs on the board in Haven. A finished one is handed in there for
// Immortal Fragments and a second reward, and a new job takes its place.
export const BOUNTY = {
  slots: 3,
  swapGold: 120, // times (1 + level/10): swap one job for another
  fragments: [6, 10],
  glass: 0.1, // chance of an Unwishing Glass as well
  kinds: {
    kill: { need: 40, text: (b) => `Clear ${b.need} enemies in ${b.mapName}` },
    elite: { need: 10, text: (b) => `Bring down ${b.need} elites`, from: 20 },
    storied: { need: 1, text: () => 'Bring down a Storied enemy' },
    event: { need: 1, text: () => 'See a world event through (a meteor or a shrine)' },
    thief: { need: 1, text: () => 'Catch a Wishthief' },
    remnant: { need: 1, text: () => 'Defeat a Remnant' },
    rift: { need: 1, text: () => 'Clear an Echo Rift in time' },
  },
};
// Immortal Fragments (0.33): from bounties and the best of the road; enough of them craft an Immortal.
export const FRAGMENTS = { craft: 250, craftLevel: 70, storied: 2, remnant: 4, thief: 2, event: 3, elite: 0.05 };
// Remnant Sigils (0.33): call a Remnant at its boss's altar, no waiting.
export const SIGIL = { storied: 0.1, event: 0.25, altar: 4 };
// The Wilds (0.33): a big open map for world tier II and up, busier than the rest.
export const WILDS = { events: 45, eventChance: 0.6, thiefIn: 0.6, thiefAgain: 0.35, merchant: 0.4, storied: 2, elite: 0.03 };

// Where an Unwishing Glass turns up (0.32), besides the merchant.
export const GLASS = { remnant: 0.15, thief: 0.1, storied: 0.04 };
export const remnantName = (def) => `Remnant of ${def.name}`;
