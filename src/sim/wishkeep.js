// The Wishkeep (0.80): the account's sanctuary, opened once any class has beaten the Quiet. The people
// the Unmade took wishes from come to the hero who ended it; the hero answers their wishes, raises the
// keep, and keeps the night (a Tide) off them. Nothing here makes a hero stronger: the keep grows, its
// people level, and it gives back ease, looks and story. What the hero achieved in the endgame (the
// classes mastered, the Eternal pieces, the Granted beaten, Wishborne levels, rebirths) decides what the
// keep starts with and can become: see keepRecord in world.js.
//
// The keep is the account's, like gold (player.keep, carried with the wallet). These are its rules and
// numbers; world.js runs them.

export const KEEP = {
  map: 'wishkeep',
  tiers: [
    null,
    { numeral: 'I', name: 'A Fire in the Dark', board: 3, settlers: 3 },
    { numeral: 'II', name: 'A Village', board: 4, settlers: 5, cost: { faith: 300, stone: 30 } },
    { numeral: 'III', name: 'The Wishkeep', board: 5, settlers: 6, cost: { faith: 900, stone: 90 } },
  ],
  // what each answered wish gives, by kind (before the keep's own bonuses)
  reward: { kill: [30, 4], boss: [45, 6], offer: [25, 2], tide: [50, 8], tell: [20, 1] },
  killNeed: [30, 50], // a pilgrimage: this many on its map
  offers: { scrap: 400, dust: 120, gold: 25000, fragment: 3 }, // what an offering asks
  skip: 10, // Faith to swap a wish for another
  hallMax: 3,
  hallCost: (lvl) => ({ faith: 150 * lvl, stone: 15 * lvl }), // to raise a hall to `lvl`
  faithPerRelic: 0.05, // each Eternal slot the account has filled
  faithPerSettlerLvl: 0.01,
  bondPerLvl: 3, // answered wishes for each of a settler's levels
  settlerMax: 5,
  start: { perWish: 6, wishMax: 400, perRebirth: 20, rebirthMax: 200 }, // Faith the faithful bring on the first day
  tide: {
    waves: 3,
    perWave: (tier) => 6 + 3 * tier,
    warmth: 60, // the keep's (the Hearth's), shared by its four fires, which the Tide goes for
    perBastion: 10,
    perEcho: 5, // each Granted beaten: one of its echoes guards the Hearth
    reach: 2.2, // how close to the fire it goes for an enemy must be to take the keep's warmth
    every: 2, // seconds between each enemy's bites at it
    aggro: 3, // seconds an enemy a hero has struck turns on them, before it goes back to the Hearth
    gap: 4, // seconds between waves
    level: 100,
    roster: ['hush', 'echo', 'unnamed', 'ashwalker', 'rootbound'],
  },
};

/** The four halls, one for each class, opened by mastering it. */
export const HALLS = {
  warrior: { name: 'The Bastion', what: 'walls and watchmen', per: 'The keep holds 10 more warmth in a Tide for each level.' },
  archer: { name: 'The Lodge', what: 'scouts who find the lost', per: 'Pilgrimages ask 15% fewer for each level.' },
  mage: { name: 'The Observatory', what: 'the keep\'s learning', per: 'Every answered wish brings 10% more Faith for each level.' },
  rogue: { name: 'The Market', what: 'trade, and a little haggling', per: 'Offerings ask 15% less for each level.' },
};
export const HALL_IDS = Object.keys(HALLS);
export const RELIC_NAMES = { weapon: 'the Blade', helm: 'the Crown', chest: 'the Heart', boots: 'the Road', ring: 'the Promise' };

/** The people who come. `tier`: the keep's tier at which they arrive. */
export const SETTLERS = {
  ysolde: {
    tier: 1, name: 'Old Ysolde', role: 'The Teller',
    look: { robe: 0x5a4a6a, trim: 0xe8dcc8, hair: 0xe8e4dc, scale: 0.92 },
    greet: '"Sit by the fire. Everyone who comes here wants the story, and I am the one who tells it. You may correct me. I will not listen."',
  },
  maren: {
    tier: 1, name: 'Maren', role: 'Lampwright',
    look: { robe: 0x8a5a2a, trim: 0xffd08a, hair: 0x3a2418, scale: 1 },
    greet: '"The Unmade took my wish for light. Funny thing to lose. I make lamps now, by hand, the slow way. They work better."',
  },
  bastian: {
    tier: 1, name: 'Bastian', role: 'Once a gate guard',
    look: { robe: 0x4a5a6a, trim: 0xb8b8c0, hair: 0x6a5a48, scale: 1.12 },
    greet: '"I stood at a gate for twenty years and nobody came through it. Now somebody does, every night. I prefer it."',
  },
  liesl: {
    tier: 2, name: 'Liesl', role: 'Gardener',
    look: { robe: 0x4a7a4a, trim: 0xe8e0b0, hair: 0xc89048, scale: 0.96 },
    greet: '"Things grow here. Properly, I mean: slowly, and then they die, and then other things grow. I had forgotten how much I missed it."',
  },
  corwin: {
    tier: 2, name: 'Corwin', role: 'Wants to be you',
    look: { robe: 0xa83a3a, trim: 0xe8e8e8, hair: 0x2a1a10, scale: 0.72 },
    greet: '"Is it true you went down to the bottom of everything and told it to stop? Can I come next time? I can carry things."',
  },
  hesper: {
    tier: 3, name: 'Hesper', role: 'A reformed Wishthief',
    look: { robe: 0x2a2a3a, trim: 0xffd27a, hair: 0x1a1a22, scale: 0.98 },
    greet: '"I used to steal wishes for a living. You caught me nine times. The tenth time you let me go, and I followed you home. I am not sorry."',
  },
};
export const SETTLER_IDS = Object.keys(SETTLERS);
/** Where each settler stands round the plaza (the same spots every time). */
export const SETTLER_SPOTS = { ysolde: [-2.6, 3.4], maren: [3.6, 4.6], bastian: [-5.6, -1.6], liesl: [5.8, -0.4], corwin: [-3.2, -5.2], hesper: [2.2, -6.0] };

/** What each kind of wish sounds like, in its settler's mouth ({map}, {boss}, {n}, {what}). */
export const WISH_LINES = {
  kill: [
    'My brother went to {map} and never came back. Clear the road there, so I can go and look.',
    'Something on {map} walks through my sleep every night. Make it stop walking.',
    'We used to take the sheep across {map}. Make it safe enough to try again.',
  ],
  boss: [
    '{boss} took our village. Not the houses. The wanting to live in them. Bring it down, once, for us.',
    'I want to know {boss} can fall. I need to see it in your face when you come back.',
  ],
  offer: {
    scrap: 'The roofs leak. {n} scrap would see us through the rains.',
    dust: 'Lamps for the long nights: {n} Wishdust, ground fine, and Maren can do the rest.',
    gold: 'A wedding, if you can believe it. {n} gold would make it a feast.',
    fragment: 'The shrine wants {n} wish fragments. Old habits. They make the children feel safe.',
  },
  tide: [
    'They come at night, the Unmade. Keep the Hearth warm until morning.',
    'The children want to see you fight. Not for the fighting. For the morning after.',
  ],
  tell: ['Sit. I will tell it the way it is told now. Stop me if I get it wrong.'],
};

/** The story, as the keep tells it: how the one they keep came to be. `need` reads the keep's record. */
export const CHAPTERS = [
  {
    id: 'road', name: 'The One Who Came Back', need: () => true,
    text: [
      'There was a village at the foot of a mountain, and a star had fallen on the mountain, and everybody\'s wishes were coming true at once. That is worse than it sounds.',
      'People went up the road and came down as husks, still walking, still wanting. A small boy watched the gate. He said one of them always came back. Just one.',
      'That was you. Ysolde is not sure you knew it yet.',
    ],
  },
  {
    id: 'star', name: 'What You Did Not Ask For', need: () => true,
    text: [
      'At the top of the mountain was the thing that asks. It asked you what you wanted, the way it had asked a queen once, and she had said "everyone, kept".',
      'You looked at it for a long time. Then you broke the glass and wanted nothing at all.',
      'The husks lay down that night, every one, the way people lie down when they are finally tired. That is the part the children like.',
    ],
  },
  {
    id: 'quiet', name: 'Enough', need: () => true,
    text: [
      'But wanting nothing leaves a hole, and things live in holes. You went down under the mountain, past the fire and the water and the roots and the choir, to the bottom of everything.',
      'At the bottom was the Quiet, which wanted nothing too, and was very good at it.',
      'You told it: enough. And it listened. Bastian says that is the most frightening thing he has ever heard of. Corwin says it is the best.',
    ],
  },
  {
    id: 'lives', name: 'More Than One Life', need: (r) => r.halls.length >= 2,
    text: [
      'Then you did it again. Not the same you. A different hand on the hilt, a different way of standing in a doorway, the same stubbornness.',
      'Ysolde says the star remembers every life you have lived. She says that is why the keep has more than one hall.',
      'Maren says Ysolde makes things up. Ysolde says that is what a story is for.',
    ],
  },
  {
    id: 'granted', name: 'The Ones Who Never Said No', need: (r) => r.echoes.length >= 1,
    text: [
      'Above the sky lives the Granted, who have never once refused a wish. You walked their white road, and you refused them.',
      'Some of what they were came down with you. You can see it at night by the Hearth, standing guard, not quite there.',
      'Hesper says the echoes are the only thing in the keep she is afraid of. Then she brings them tea.',
    ],
  },
  {
    id: 'eternal', name: 'What Does Not End', need: (r) => r.relics.length >= 5,
    text: [
      'They say you carry five things that will not end: a blade, a crown, a heart, a road and a promise. Their light is on the Altar now, so we can see it when you are away.',
      'Ysolde says a god is only someone who kept going after everyone else stopped.',
      'Corwin has started standing in doorways the way you do. Nobody has the heart to tell him.',
    ],
  },
];
export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

const int = (v, d = 0, lo = 0, hi = 1e12) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(+v) ? +v : d)));

/** A keep from a save (or the server), every field checked; null if there is none yet. */
export function cleanKeep(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const k = {
    v: 1,
    tier: int(raw.tier, 1, 1, 3),
    faith: int(raw.faith),
    stone: int(raw.stone),
    answered: int(raw.answered),
    tides: int(raw.tides),
    wishN: int(raw.wishN),
    halls: {},
    settlers: {},
    told: Array.isArray(raw.told) ? raw.told.filter((c) => CHAPTER_IDS.includes(c)).slice(0, CHAPTER_IDS.length) : [],
    wishes: [],
  };
  for (const h of HALL_IDS) k.halls[h] = int(raw.halls && raw.halls[h], 0, 0, KEEP.hallMax);
  for (const s of SETTLER_IDS) {
    const r = raw.settlers && raw.settlers[s];
    if (r && typeof r === 'object') k.settlers[s] = { bond: int(r.bond, 0, 0, KEEP.bondPerLvl * KEEP.settlerMax * 10) };
  }
  if (Array.isArray(raw.wishes)) {
    for (const w of raw.wishes.slice(0, 6)) {
      if (!w || typeof w !== 'object' || !WISH_LINES[w.kind]) continue;
      const c = {
        id: String(w.id || '').slice(0, 20), kind: w.kind, who: SETTLERS[w.who] ? w.who : 'ysolde', line: int(w.line, 0, 0, 9),
        n: int(w.n), need: int(w.need, 1, 1, 1e9), done: !!w.done,
        reward: { faith: int(w.reward && w.reward.faith, 10, 0, 1e6), stone: int(w.reward && w.reward.stone, 0, 0, 1e5) },
      };
      if (w.map) c.map = String(w.map).slice(0, 24);
      if (w.mapName) c.mapName = String(w.mapName).slice(0, 48);
      if (w.boss) c.boss = String(w.boss).slice(0, 24);
      if (w.bossName) c.bossName = String(w.bossName).slice(0, 48);
      if (w.what && KEEP.offers[w.what]) c.what = w.what;
      if (w.ch && CHAPTER_IDS.includes(w.ch)) c.ch = w.ch;
      k.wishes.push(c);
    }
  }
  return k;
}

/** A settler's level (0 to settlerMax) from their bond. */
export const settlerLevel = (s) => Math.min(KEEP.settlerMax, Math.floor(((s && s.bond) || 0) / KEEP.bondPerLvl));

/** Who lives in the keep at its tier, in the order they came. */
export const settlersAt = (tier) => SETTLER_IDS.filter((s) => SETTLERS[s].tier <= tier);

/** The words of a wish, as its settler says it. */
export function wishText(w) {
  let t;
  if (w.kind === 'offer') t = WISH_LINES.offer[w.what] || '';
  else {
    const list = WISH_LINES[w.kind] || [''];
    t = list[w.line % list.length];
  }
  return t.replace('{map}', w.mapName || 'the road').replace('{boss}', w.bossName || 'It').replace('{n}', (w.need || 0).toLocaleString('en-US'));
}

/** What a wish asks, in a few words (for the board). */
export function wishGoal(w) {
  if (w.kind === 'kill') return `Defeat ${w.need} enemies on ${w.mapName}`;
  if (w.kind === 'boss') return `Defeat ${w.bossName}`;
  if (w.kind === 'offer') return `Give ${w.need.toLocaleString('en-US')} ${{ scrap: 'scrap', dust: 'Wishdust', gold: 'gold', fragment: 'wish fragments' }[w.what]}`;
  if (w.kind === 'tide') return "Win a Tide: hold the keep's fires through three waves";
  if (w.kind === 'tell') {
    const c = CHAPTERS.find((x) => x.id === w.ch);
    return `Hear "${c ? c.name : 'the story'}"`;
  }
  return '';
}

/** (0.80) What a class's save gives the account's Wishkeep: its Eternal slots, the Granted it has beaten, its Wishborne levels. */
export function lifeOfSave(sv) {
  const et = [];
  if (sv) for (const s of ['weapon', 'helm', 'chest', 'boots', 'ring']) if ((sv.equipped && sv.equipped[s] && sv.equipped[s].eternal) || (sv.eternals && sv.eternals[s])) et.push(s);
  return { et, gr: sv && Array.isArray(sv.eternalFirsts) ? sv.eternalFirsts.slice(0, 8) : [], wish: (sv && sv.wish) || 0 };
}
