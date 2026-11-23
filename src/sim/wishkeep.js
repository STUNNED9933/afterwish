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
  // (0.81) A Tide: the keep's own heroes defend it; the player is its god (miracles, no sword). Its enemies
  // have their own small numbers (FOES), apart from the hero's world, so a keep's strength is its heroes'.
  tide: {
    waves: 3,
    perWave: (tier) => 6 + 2 * tier,
    gap: 5, // seconds between waves
    level: 100, // (only for how they look and what they drop)
    roster: ['hush', 'echo', 'unnamed', 'ashwalker', 'rootbound'],
    engage: 4.5, // an enemy turns on a hero of the keep this close
    night: (tier, tides) => 1 + 0.3 * (tier - 1) + 0.05 * Math.min(tides, 30), // the night grows stronger as the keep does
  },
  heroCap: [0, 3, 5, 8], // heroes the keep can have, by tier: few, and good
  recruit: (n) => ({ faith: 120 * (n + 1) }), // the n-th (from 0)
  train: (lvl) => ({ faith: 50 * lvl }), // from lvl to lvl + 1 (at the Lodge)
  trainMax: (lodge) => (lodge ? 3 + 2 * lodge : 1), // a hero's level cap (the Lodge's level)
  arm: (gear) => ({ faith: 40 * (gear + 1), stone: 8 * (gear + 1) }), // gear to gear + 1 (at the Bastion)
  armMax: (bastion) => 3 * bastion,
  learn: { faith: 100 }, // teaching a hero a skill
  perLvl: 0.12, // a hero's health and damage per level
  perGear: 0.15, // ... and per point of gear
  buildHp: { hearth: 600, hall: 400 },
  perBastionHp: 0.25, // every building's health, per level of the Bastion
  repairPer: 40, // health a Wishstone mends
  produce: { base: 4, perMarket: 15, capHours: 16 }, // Faith an hour, while you are away (the Market)
  trade: { stoneFor: (market) => 40 + 10 * market, faithPer: 100, stoneOut: (market) => 6 + 2 * market }, // 10 Wishstone sells for stoneFor Faith; 100 Faith buys stoneOut
};

/** (0.81) The keep's heroes, by class: their own small numbers (tide units, as FOES). */
export const TROOPS = {
  warrior: { hp: 300, dmg: 20, cd: 1.0, range: 2.0, speed: 4.4 },
  archer: { hp: 170, dmg: 17, cd: 0.9, range: 9, speed: 4.6 },
  mage: { hp: 150, dmg: 18, cd: 1.3, range: 8, speed: 4.2, splash: 1.8 },
  rogue: { hp: 210, dmg: 13, cd: 0.55, range: 1.8, speed: 5.2, crit: 0.3 },
};
export const TROOP_NAMES = {
  warrior: ['Bram the Younger', 'Ida', 'Tobin', 'Greta', 'Osric', 'Halla', 'Wendel', 'Runa'],
  archer: ['Fenna', 'Arlo', 'Sable', 'Kit', 'Merrow', 'Lark', 'Tamsin', 'Rook'],
  mage: ['Elowen', 'Cassius', 'Nim', 'Orla', 'Peregrin', 'Vesna', 'Aurel', 'Quill'],
  rogue: ['Jory', 'Vix', 'Moth', 'Dace', 'Sly', 'Wren the Less', 'Penn', 'Ash'],
};

/** (0.81) Skills a hero can learn: physical at the Lodge, magic at the Observatory (the hall's level is the rank it teaches). */
export const SKILLS = {
  cleave: { name: 'Cleave', school: 'phys', rank: 1, cd: 6, desc: 'Strikes every enemy within 2.8 m for twice their damage.' },
  volley: { name: 'Volley', school: 'phys', rank: 2, cd: 7, desc: 'Three shots at the three nearest enemies, each for 1.6 times their damage.' },
  lunge: { name: 'Lunge', school: 'phys', rank: 3, cd: 8, desc: 'Leaps onto the enemy nearest a building and strikes for four times their damage.' },
  fireball: { name: 'Fireball', school: 'magic', rank: 1, cd: 7, desc: 'A blast where the enemies are thickest: 2.5 times their damage to all within 2.5 m.' },
  mend: { name: 'Mend', school: 'magic', rank: 2, cd: 9, desc: 'Heals the most hurt hero nearby for 40% of their health.' },
  ward: { name: 'Ward', school: 'magic', rank: 3, cd: 12, desc: 'The building in most danger takes no damage for 5 seconds.' },
};
export const SKILL_IDS = Object.keys(SKILLS);

/** (0.81) Blessings, from the Observatory: bought for the next Tide only. */
export const BLESSINGS = {
  fury: { name: 'Fury', rank: 1, faith: 60, desc: 'Your heroes deal 30% more damage.' },
  stoneskin: { name: 'Stoneskin', rank: 2, faith: 80, desc: 'Your heroes take 30% less damage.' },
  swift: { name: 'Swiftness', rank: 3, faith: 100, desc: 'Your heroes move and strike 30% faster.' },
};
export const BLESSING_IDS = Object.keys(BLESSINGS);

/** (0.81) The god's miracles in a Tide (the hero keys Q, W and E), paid in Faith. */
export const MIRACLES = {
  smite: { key: 'q', name: 'Smite', faith: 20, cd: 3, radius: 3.2, dmg: 140, desc: 'Fire from above: 140 to every enemy where you aim.' },
  mend: { key: 'w', name: 'Mend', faith: 25, cd: 8, radius: 5, desc: 'Heals your heroes where you aim by half their health, and raises the fallen.' },
  ward: { key: 'e', name: 'Ward', faith: 20, cd: 12, radius: 7, dur: 6, desc: 'The building nearest where you aim takes no damage for 6 seconds.' },
};
export const MIRACLE_IDS = Object.keys(MIRACLES);
/**
 * (0.81.1) Incarnate: the god walks among the heroes for a while (R in a Tide) and fights with their own
 * kit. A god is too strong for a mortal fight, so no single blow takes more than hitCap of a Tide foe's
 * health (dotCap for burns and bleeds); while incarnate Q, W and E are the hero's own again, and the Tide
 * can strike back. Falling to it only ends the incarnation.
 */
export const INCARNATE = { key: 'r', name: 'Incarnate', faith: 30, dur: 20, cd: 45, hitCap: 0.2, dotCap: 0.06, body: 600, desc: 'Walk among your heroes for 20 seconds and fight with your own skills (each blow takes at most a fifth of an Unmade\'s health). The Tide can strike you back; falling only ends it.' };

/** (0.81) The Unmade in a Tide: their own numbers. siege: how much harder they hit buildings. */
export const FOES = {
  hush: { hp: 70, dmg: 7, speed: 4.4, range: 1.6, cd: 1.0 },
  echo: { hp: 55, dmg: 9, speed: 3.6, range: 6, cd: 1.4, ranged: true },
  unnamed: { hp: 170, dmg: 12, speed: 2.8, range: 1.8, cd: 1.3 },
  ashwalker: { hp: 110, dmg: 9, speed: 3.2, range: 1.7, cd: 1.1, siege: 2.5 },
  rootbound: { hp: 240, dmg: 14, speed: 2.4, range: 1.9, cd: 1.6, siege: 1.5 },
};

/** A hero's health and damage, with their level and gear. */
export function troopStats(t) {
  const T = TROOPS[t.cls] || TROOPS.warrior;
  const m = (1 + KEEP.perLvl * ((t.lvl || 1) - 1)) * (1 + KEEP.perGear * (t.gear || 0));
  return { ...T, hp: Math.round(T.hp * m), dmg: Math.round(T.dmg * m * 10) / 10 };
}

/** A building's full health (the Bastion makes them all sturdier). */
export const buildMax = (id, keep) => Math.round((id === 'hearth' ? KEEP.buildHp.hearth : KEEP.buildHp.hall) * (1 + KEEP.perBastionHp * ((keep && keep.halls.warrior) || 0)));
export const BUILD_IDS = ['hearth', 'warrior', 'archer', 'mage', 'rogue'];

/** The four halls, one for each class, opened by mastering it. */
export const HALLS = {
  warrior: { name: 'The Bastion', what: 'arms and walls', per: 'Arms your heroes (each level, three more points of gear) and makes every building 25% sturdier.' },
  archer: { name: 'The Lodge', what: 'training and the hunt', per: 'Trains your heroes (each level, two more levels they can reach) and teaches physical skills up to its rank.' },
  mage: { name: 'The Observatory', what: 'magic and blessings', per: 'Teaches magic skills up to its rank, and blesses your heroes before a Tide.' },
  rogue: { name: 'The Market', what: 'trade and plenty', per: 'Faith comes in while you are away (15 an hour each level), and Wishstone and Faith trade here.' },
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
    troops: [], // (0.81) the keep's heroes
    troopN: int(raw.troopN),
    builds: {}, // (0.81) each building's health (missing: whole)
    blessings: Array.isArray(raw.blessings) ? raw.blessings.filter((b) => BLESSING_IDS.includes(b)).slice(0, 3) : [],
    last: int(raw.last), // (0.81) when Faith last came in (ms)
  };
  if (Array.isArray(raw.troops)) {
    for (const t of raw.troops.slice(0, 8)) {
      if (!t || !TROOPS[t.cls]) continue;
      k.troops.push({ id: int(t.id, 0, 0, 1e6), cls: t.cls, name: String(t.name || 'A hero').slice(0, 24), lvl: int(t.lvl, 1, 1, 10), gear: int(t.gear, 0, 0, 9), skill: SKILLS[t.skill] ? t.skill : null });
    }
  }
  for (const b of BUILD_IDS) if (raw.builds && raw.builds[b] != null) k.builds[b] = int(raw.builds[b], 0, 0, 1e5);
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
  if (w.kind === 'kill') return `Defeat ${w.need} enemies in ${w.mapName}`;
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
