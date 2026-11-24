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
  reward: { kill: [45, 7], boss: [70, 10], offer: [40, 5], tide: [75, 12], tell: [30, 3] }, // (0.82.1: half as much again)
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
  trainMax: (lodge, tier = 0) => (lodge ? 3 + 2 * lodge : 1) + tier, // a hero's level cap (the Lodge's level, and its tier, 0.82.1)
  arm: (gear) => ({ faith: 40 * (gear + 1), stone: 8 * (gear + 1) }), // gear to gear + 1 (at the Bastion)
  armMax: (bastion, tier = 0) => 3 * bastion + tier, // (and the Bastion's tier, 0.82.1)
  learn: { faith: 100 }, // teaching a hero a skill
  perLvl: 0.12, // a hero's health and damage per level
  perGear: 0.15, // ... and per point of gear
  buildHp: { hearth: 600, hall: 400 },
  perBastionHp: 0.25, // every building's health, per level of the Bastion
  repairPer: 120, // health a Wishstone mends (0.82.1: three times as much)
  produce: { base: 4, perMarket: 15, capHours: 24 }, // Faith an hour, while you are away (the Market; 0.82.1: a day banked)
  trade: { stoneFor: (market) => 40 + 10 * market, faithPer: 100, stoneOut: (market) => 6 + 2 * market }, // 10 Wishstone sells for stoneFor Faith; 100 Faith buys stoneOut
};

/** (0.81) The keep's heroes, by class: their own small numbers (tide units, as FOES). */
export const TROOPS = {
  // (0.83) Each class has its job. The warrior holds the line: the Unmade would rather fight him (bulwark), he
  // takes a fifth less, and his swings carry into whatever stands beside his mark (arc). The rogue duels: he
  // slips a quarter of blows, his crits cut deeper, and he drinks a little of what he deals. Archers and
  // mages keep their reach, a little sturdier.
  warrior: { hp: 420, dmg: 30, cd: 1.0, range: 2.0, speed: 4.6, guard: 0.2, arc: 0.6, bulwark: 4 },
  archer: { hp: 190, dmg: 18, cd: 0.9, range: 9, speed: 4.6 },
  mage: { hp: 175, dmg: 20, cd: 1.3, range: 8, speed: 4.2, splash: 1.8 },
  rogue: { hp: 270, dmg: 17, cd: 0.55, range: 1.8, speed: 5.4, crit: 0.3, critX: 2.5, dodge: 0.25, leech: 0.06 },
};
export const TROOP_NAMES = {
  warrior: ['Bram the Younger', 'Ida', 'Tobin', 'Greta', 'Osric', 'Halla', 'Wendel', 'Runa'],
  archer: ['Fenna', 'Arlo', 'Sable', 'Kit', 'Merrow', 'Lark', 'Tamsin', 'Rook'],
  mage: ['Elowen', 'Cassius', 'Nim', 'Orla', 'Peregrin', 'Vesna', 'Aurel', 'Quill'],
  rogue: ['Jory', 'Vix', 'Moth', 'Dace', 'Sly', 'Wren the Less', 'Penn', 'Ash'],
};
/** (0.83) Who is a man and who a woman (their models follow it). */
export const TROOP_WOMEN = new Set(['Ida', 'Greta', 'Halla', 'Runa', 'Fenna', 'Sable', 'Lark', 'Tamsin', 'Elowen', 'Nim', 'Orla', 'Vesna', 'Vix', 'Moth', 'Wren the Less', 'Ash']);
export const troopGender = (t) => (TROOP_WOMEN.has(t.name) ? 'f' : TROOP_NAMES[t.cls] && TROOP_NAMES[t.cls].includes(t.name) ? 'm' : t.id % 2 ? 'm' : 'f');

/**
 * (0.81) Skills a hero can learn: physical at the Lodge, magic at the Observatory (the hall's level is the rank
 * it teaches). (0.83) Four to a hero: two physical and two magic, the second of each from level SKILL_SLOT2.
 * x: times the hero's damage. support: a healer's skill (a hero who knows one fights as a healer).
 */
export const SKILLS = {
  cleave: { name: 'Cleave', school: 'phys', rank: 1, cd: 6, x: 2.2, r: 2.8, desc: 'Strikes every enemy within 2.8 m for 2.2 times their damage.' },
  bash: { name: 'Shield Bash', school: 'phys', rank: 1, cd: 7, x: 2.5, stun: 1.5, desc: 'Slams the nearest enemy for 2.5 times their damage and stuns it for 1.5 seconds.' },
  pierce: { name: 'Piercing Shot', school: 'phys', rank: 1, cd: 7, x: 2.6, len: 14, desc: 'A shot that goes through every enemy in a line, 2.6 times their damage to each.' },
  volley: { name: 'Volley', school: 'phys', rank: 2, cd: 7, x: 1.8, n: 4, desc: 'Four shots at the four nearest enemies, each for 1.8 times their damage.' },
  warcry: { name: 'War Cry', school: 'phys', rank: 2, cd: 14, dur: 6, pow: 0.25, r: 8, desc: 'Heroes within 8 m deal 25% more damage and strike 25% faster for 6 seconds.' },
  taunt: { name: 'Challenge', school: 'phys', rank: 2, cd: 10, dur: 4, r: 7, guard: 0.4, desc: 'Every enemy within 7 m turns on this hero for 4 seconds, and they take 40% less damage meanwhile.' },
  lunge: { name: 'Lunge', school: 'phys', rank: 3, cd: 8, x: 4, stun: 0.6, desc: 'Leaps onto the enemy nearest a building and strikes for four times their damage.' },
  whirlwind: { name: 'Whirlwind', school: 'phys', rank: 3, cd: 9, x: 3.5, r: 3.5, dur: 3, guard: 0.3, desc: 'Spins through everything within 3.5 m for 3.5 times their damage, then takes 30% less damage for 3 seconds.' },
  fireball: { name: 'Fireball', school: 'magic', rank: 1, cd: 7, x: 2.5, r: 2.5, desc: 'A blast where the enemies are thickest: 2.5 times their damage to all within 2.5 m.' },
  frostnova: { name: 'Frost Nova', school: 'magic', rank: 1, cd: 8, x: 1.8, r: 3, slow: 0.5, dur: 3, desc: 'Ice bursts where the enemies are thickest: 1.8 times their damage to all within 3 m, slowed by half for 3 seconds.' },
  mend: { name: 'Mend', school: 'magic', rank: 1, cd: 8, heal: 0.4, support: true, desc: 'Heals the most hurt hero nearby for 40% of their health.' },
  chain: { name: 'Chain Lightning', school: 'magic', rank: 2, cd: 8, x: 2.4, n: 5, desc: 'Lightning leaps through up to five enemies, 2.4 times their damage to the first and a little less to each after.' },
  barrier: { name: 'Barrier', school: 'magic', rank: 2, cd: 10, shield: 0.35, dur: 6, support: true, desc: 'The hero in most danger is shielded from 35% of their health in damage for 6 seconds.' },
  meteor: { name: 'Meteor', school: 'magic', rank: 3, cd: 12, x: 5, r: 3.2, delay: 0.8, desc: 'Calls a star down where the enemies are thickest: five times their damage to all within 3.2 m.' },
  ward: { name: 'Ward', school: 'magic', rank: 3, cd: 12, desc: 'The building in most danger takes no damage for 5 seconds.' },
  radiance: { name: 'Radiance', school: 'magic', rank: 3, cd: 15, heal: 0.25, r: 9, support: true, desc: 'Every hero within 9 m heals a quarter of their health, and one fallen there rises with a third.' },
};
export const SKILL_SLOT2 = 6;
/** (0.83) A hero's four skill slots: 0 and 1 physical, 2 and 3 magic. */
export const skillSlotSchool = (i) => (i < 2 ? 'phys' : 'magic');
export const skillSlotOpen = (t, i) => i === 0 || i === 2 || (t.lvl || 1) >= SKILL_SLOT2;
export const troopSkills = (t) => (t.skills || []).filter((s) => SKILLS[s]);
export const troopSupport = (t) => troopSkills(t).some((s) => SKILLS[s].support);
export const SKILL_IDS = Object.keys(SKILLS);

/** (0.81) Blessings, from the Observatory: bought for the next Tide only. */
export const BLESSINGS = {
  fury: { name: 'Fury', rank: 1, faith: 60, desc: 'Your heroes deal 30% more damage.' },
  stoneskin: { name: 'Stoneskin', rank: 2, faith: 80, desc: 'Your heroes take 30% less damage.' },
  swift: { name: 'Swiftness', rank: 3, faith: 100, desc: 'Your heroes move and strike 30% faster.' },
};
export const BLESSING_IDS = Object.keys(BLESSINGS);

/**
 * (0.81) The god's miracles in a Tide (the hero keys Q, W and E), paid in Faith. (0.87) Remade so the god
 * leads the heroes rather than fighting for them: Judgement says what they strike, Benediction keeps them
 * fighting, Hallowed Ground says where they hold.
 */
export const MIRACLES = {
  judge: {
    key: 'q', name: 'Judgement', faith: 20, cd: 7, radius: 3.5, hit: 0.08, dur: 8, mark: 0.4,
    desc: 'Judge the Unmade where you aim: a blow of light (8% of their health), then for 8 seconds your heroes deal 40% more to them, go for them first, and no Veil hides them.',
  },
  bless: {
    key: 'w', name: 'Benediction', faith: 25, cd: 12, radius: 6, heal: 0.4, raise: 0.4, dur: 6, pow: 0.3,
    desc: 'Your heroes where you aim heal 40% of their health and the fallen there rise; all of them are Blessed for 6 seconds: 30% faster to strike and to move.',
  },
  hallow: {
    key: 'e', name: 'Hallowed Ground', faith: 30, cd: 15, radius: 6, dur: 8, slow: 0.4, shelter: 0.7, regen: 0.03,
    desc: 'Consecrate a circle where you aim for 8 seconds: the Unmade in it are slowed by 40% and their blows on buildings do 70% less; your heroes in it heal 3% a second, and those with nothing to fight gather there.',
  },
};
export const MIRACLE_IDS = Object.keys(MIRACLES);
/**
 * (0.81.1) Incarnate: the god walks among the heroes for a while (R in a Tide) and fights with their own
 * kit; the Tide can strike back, and falling to it only ends the incarnation. (0.82.4) Only the keeper.
 * (0.85) A rescue, not a sweep: R begins a channel where you aim, gathering aura for up to `chan` seconds
 * (R again lands early, after `chanMin`, with less); you land in a blast that mends, shields and raises the
 * heroes near and staggers the Unmade, all scaled by the aura gathered; then `dur` seconds on the field.
 * Your blows count as a mortal's, like your health: a hit worth N times your attack deals N times `atk`
 * of the night's strength, whatever your gear. Once or twice a night (`cd`).
 */
/** (0.89) The incarnate god's dodge roll (Shift): how far, how quick, how long blows pass through, how often. */
export const DODGE = { dist: 4.5, dur: 0.3, grace: 0.4, cd: 2.5 };
export const INCARNATE = {
  key: 'r', name: 'Incarnate', faith: 40, chan: 5, chanMin: 1.5, dur: 20, cd: 60, body: 600, atk: 35,
  land: { r: 7, heal: 0.45, shield: 0.3, shieldDur: 6, raise: 0.4, stun: 1.6, hit: 0.15 },
  desc: 'Channel where you aim for up to 5 seconds, gathering aura (R again to land early). You land in a blast that mends, shields and raises your heroes nearby and staggers the Unmade, then fight beside them for 20 seconds, seen from over your shoulder.',
};

/** (0.81) The Unmade in a Tide: their own numbers. siege: how much harder they hit buildings. */
export const FOES = {
  hush: { hp: 70, dmg: 7, speed: 4.4, range: 1.6, cd: 1.0 },
  echo: { hp: 55, dmg: 9, speed: 3.6, range: 6, cd: 1.4, ranged: true },
  unnamed: { hp: 170, dmg: 12, speed: 2.8, range: 1.8, cd: 1.3 },
  ashwalker: { hp: 110, dmg: 9, speed: 3.2, range: 1.7, cd: 1.1, siege: 2.5 },
  rootbound: { hp: 240, dmg: 14, speed: 2.4, range: 1.9, cd: 1.3, siege: 1.5 },
  // (0.84) the night's stranger children, each with a way of its own (from: the first Night they come)
  thief: { name: 'Ember Thief', hp: 60, dmg: 0, speed: 6.0, range: 1.6, cd: 1.0, role: 'thief', from: 3, desc: 'Ignores your heroes: takes Faith from a building and runs for the dark. Catch it and the Faith comes back, with interest.' },
  cinderling: { name: 'Cinderlings', hp: 26, dmg: 5, speed: 5.6, range: 1.3, cd: 0.8, role: 'swarm', from: 4, pack: 5, burst: { r: 2.4, x: 2.5 }, desc: 'Come in packs and burst when they die, burning heroes close by.' },
  veilbearer: { name: 'Veilbearer', hp: 160, dmg: 6, speed: 3.0, range: 7, cd: 1.6, ranged: true, role: 'veil', from: 6, veil: { r: 5.5, cut: 0.5 }, desc: 'The Unmade near it take half damage. Break through to it first.' },
  gatebreaker: { name: 'Gatebreaker', hp: 950, dmg: 30, speed: 1.9, range: 2.6, cd: 2.4, siege: 4, role: 'breaker', from: 8, big: true, desc: 'A siege giant: walks straight for the halls, never turns on a hero, and shrugs off half a stun.' },
  mourner: { name: 'Mourner', hp: 190, dmg: 8, speed: 2.8, range: 8, cd: 1.8, ranged: true, role: 'mourn', from: 11, raise: { cd: 7, r: 12, hp: 0.6 }, desc: 'Hangs back and raises the Unmade who fell near her.' },
  tidecaller: { name: 'The Tidecaller', hp: 4200, dmg: 40, speed: 2.6, range: 3, cd: 2.0, siege: 3, role: 'boss', big: true, slam: { cd: 6, r: 4.5, x: 1.6, wind: 0.8 }, call: { cd: 12, n: 3 }, desc: 'The night\'s king, on the last wave of every fifth Night: slams those near, calls the Hush, and rages when hurt.' },
};
export const FOE_SPECIALS = ['thief', 'cinderling', 'veilbearer', 'gatebreaker', 'mourner'];
/**
 * (0.84) How many of each special foe a wave brings on a Night: wave w (1-based) of W.
 */
export function tideSpecials(L, w, W) {
  const out = {};
  if (L >= 3) out.thief = 1 + (L >= 12) + (L >= 22);
  if (L >= 4 && w >= 2) out.cinderling = 1 + (L >= 15) + (L >= 25); // packs
  if (L >= 6 && w >= 2) out.veilbearer = 1 + (L >= 18);
  if (L >= 8 && (w === W || (L >= 16 && w === 2))) out.gatebreaker = 1 + (L >= 24 && w === W);
  if (L >= 11 && w >= 2) out.mourner = 1 + (L >= 21);
  if (L % 5 === 0 && w === W) out.tidecaller = 1;
  return out;
}
/**
 * (0.84) Omens: from Night 6 each Night level has its own, the same every time (so a keeper can plan a
 * night's skills and come back better ready). Each makes the night harder and pays more.
 */
export const OMENS = {
  bloodmoon: { name: 'Blood Moon', pay: 0.25, desc: 'The Unmade move and strike a quarter faster.' },
  fog: { name: 'Fog', pay: 0.2, desc: 'Archers and mages reach a third less far.' },
  hunger: { name: 'Hunger', pay: 0.2, desc: 'The Unmade heal by a third of what they deal to heroes.' },
  starfall: { name: 'Starfall', pay: 0.25, desc: 'Stars fall where the fighting is, every few seconds, on heroes and Unmade alike.' },
  legion: { name: 'Legion', pay: 0.3, desc: 'A third more Unmade in every wave.' },
  ironhide: { name: 'Iron Hide', pay: 0.25, desc: 'The Unmade have a quarter more health.' },
};
export const OMEN_IDS = Object.keys(OMENS);
/**
 * (0.86) Raids: smaller than a night, unasked. While you are in your keep one comes every so often (a horn,
 * then a single wave, a little below your best Night); while you are away the heroes meet one every
 * `awayEvery` hours on their own (up to `awayMax`), fought out when you next come to the keep.
 */
export const RAID = {
  every: [360, 600], // seconds in the keep between raids (from, to)
  warn: 8, // seconds of horns before it arrives
  below: 2, // Night levels under your best
  pay: 0.35, // of a held night's Faith and Wishstone
  gear: 0.35, // chance of a piece of Hero gear
  awayEvery: 3, // hours away, a raid
  awayMax: 3,
  awayFrom: 10 / 60, // hours: a gap shorter than this is not "away"
};
export const raidLevel = (keep) => Math.max(1, (keep.nightMax || 0) - RAID.below);
export const nightOmen = (L) => (L >= 6 ? OMEN_IDS[(L * 7 + 3) % OMEN_IDS.length] : null);

// ---------------------------------------------------------------------------------------------- (0.82.1)
/**
 * (0.82.1) The keep's works: the Mine (Wishstone) and the Fields (Faith), built and raised with Faith and
 * worked by its heroes (more by rarer ones) and settlers between nights. They pay while you are there and
 * while you are away (banked up to KEEP.produce.capHours).
 */
const WORK_KINDS = {
  mine: { what: 'Wishstone', max: 5, cost: (lvl) => ({ faith: 120 * lvl * lvl, stone: 6 * lvl * (lvl - 1) }), rate: (lvl, hands) => lvl * (1.5 + 0.35 * hands) },
  fields: { what: 'Faith', max: 5, cost: (lvl) => ({ faith: 100 * lvl * lvl, stone: 5 * lvl * (lvl - 1) }), rate: (lvl, hands) => lvl * (8 + 2 * hands) },
};
/**
 * (0.88) The works grow with the keep: each growth stage opens another site out past the halls, a field or
 * a mine in turn. Each is built and raised on its own; the later ones cost more (`mult`). `a`, `r`: where
 * it lies (an angle from the Hearth, and how far).
 */
const site = (kind, name, stage, a, r, mult, desc) => ({ kind, name, stage, a, r, mult, desc, what: WORK_KINDS[kind].what, max: WORK_KINDS[kind].max, cost: (lvl) => { const c = WORK_KINDS[kind].cost(lvl); return { faith: Math.round(c.faith * mult), stone: Math.round(c.stone * mult) }; }, rate: WORK_KINDS[kind].rate });
export const WORKS = {
  mine: site('mine', 'The Mine', 0, 1.18, 23, 1, 'Star-glass in the rock under the keep. Wishstone, every hour.'),
  fields: site('fields', 'The Fields', 0, -1.18, 23, 1, "Bread for the keep's table, and what is left is offered at the Hearth. Faith, every hour."),
  fields2: site('fields', 'The East Fields', 1, -0.42, 25, 1.8, 'More rows of grain for a keep with more mouths. Faith, every hour.'),
  mine2: site('mine', 'The Deep Seam', 2, 1.95, 25, 1.8, 'A second shaft, down to where the star-glass runs thick. Wishstone, every hour.'),
  fields3: site('fields', 'The Orchard', 3, -1.95, 25, 3, 'Apple trees and beehives: the village offers its sweetness at the Hearth. Faith, every hour.'),
  mine3: site('mine', 'The Star Quarry', 4, 0.42, 25, 3, 'An open pit where a fallen star broke the hill. Wishstone, every hour.'),
  fields4: site('fields', 'The Pilgrim Farms', 5, -2.75, 26, 4.5, 'Farms worked by pilgrims who came to see the Wishkeep. Faith, every hour.'),
};
export const WORK_IDS = Object.keys(WORKS);
/** Hands at the works: each hero (1, and a quarter more for each step of rarity) and each settler (a half). */
export function workHands(keep) {
  if (!keep) return 0;
  let h = 0;
  for (const t of keep.troops || []) h += 1 + 0.25 * (t.rar || 0);
  return h + 0.5 * Object.keys(keep.settlers || {}).length;
}
/** What the keep makes an hour: Faith (the base, the Market, the fields) and Wishstone (the mines). */
export function keepRates(keep, marketWorks = false) {
  if (!keep) return { faith: 0, stone: 0 };
  const P = KEEP.produce, hands = workHands(keep), w = keep.works || {};
  const market = marketWorks ? P.perMarket * (keep.halls.rogue || 0) * (1 + 0.25 * ((keep.btier && keep.btier.rogue) || 0)) : 0;
  // (0.88) every site the keep has built, each worked by all its hands
  let fields = 0, stone = 0;
  for (const id of WORK_IDS) {
    if (!w[id]) continue;
    const r = WORKS[id].rate(w[id], hands);
    if (WORKS[id].kind === 'fields') fields += r;
    else stone += r;
  }
  return { faith: P.base + market + fields, stone };
}

/**
 * (0.82.1) Building tiers: once a hall is at its last level (the Hearth: once the keep is at tier III), it
 * can be raised through the rarities, Common to Immortal. Each tier makes it far sturdier and its work
 * stronger (BUILD_TIER.perk).
 */
export const BUILD_TIER = {
  max: 6,
  hp: [1, 1.7, 2.8, 4.6, 7.5, 12, 20],
  cost: (t) => ({ faith: 800 * t * t, stone: 60 * t * t }),
  perk: {
    hearth: (t) => `Every hero deals ${4 * t}% more, and every answered wish gives ${5 * t}% more Faith.`,
    warrior: (t) => `${t} more points of arms a hero can take.`,
    archer: (t) => `Heroes can be trained ${t} levels further.`,
    mage: (t) => `Blessings are ${10 * t}% stronger.`,
    rogue: (t) => `The Market makes ${25 * t}% more Faith.`,
  },
};

/**
 * (0.82.1) The keep grows with what is spent on it (Faith, and Wishstone counted ten times): a wider
 * map, more cottages, lanterns and people. GROWTH.at are the spends for each stage.
 */
export const GROWTH = {
  at: [0, 1500, 6000, 18000, 45000, 110000],
  names: ['A Fire in the Dark', 'A Few Roofs', 'A Hamlet', 'A Village', 'A Market Town', 'The Wishkeep Entire'],
  radius: (stage) => 32 + 3 * stage,
};
export const keepStage = (keep) => {
  const s = (keep && keep.spent) || 0;
  let st = 0;
  while (st + 1 < GROWTH.at.length && s >= GROWTH.at[st + 1]) st++;
  return st;
};

// ------------------------------------------------------------------------------------------------ (0.82)
/**
 * (0.82) A hero's rarity, Common (0) to Immortal (6), in gear's colours: each one multiplies their health
 * and damage, and the rarer ones bring their skill round sooner. Raised one step at a time ("ascending",
 * at the Hearth) with Faith and Ascension Sigils, which the night gives.
 */
export const HERO_RARITY = {
  names: ['Common', 'Uncommon', 'Rare', 'Epic', 'Mythic', 'Ancient', 'Immortal'],
  mult: [1, 1.45, 2.1, 3, 4.3, 6.2, 9],
  skillCdr: [0, 0, 0, 0.2, 0.3, 0.4, 0.5], // their skill comes round this much sooner
  aura: 0.1, // an Immortal hero lifts every hero's damage this much (up to three of them)
  ascend: (to) => ({ faith: [0, 150, 350, 700, 1300, 2400, 4200][to], sigils: [0, 2, 5, 10, 18, 30, 50][to] }),
  perk: [null, null, null, 'Epic: their skill comes round 20% sooner.', 'Mythic: their skill comes round 30% sooner.', 'Ancient: their skill comes round 40% sooner.', 'Immortal: their skill comes round twice as often, and every hero of the keep deals 10% more while they stand.'],
};
export const HERO_RAR_MAX = 6;

/**
 * (0.82) Night levels. Called at a level from 1 to one past the highest held (NIGHT.max at most): each is
 * stronger (power), pays more, and gives rarer Hero gear and more Sigils.
 */
export const NIGHT = {
  max: 30,
  power: (L) => {
    let x = 0.6; // the Unmade's health and damage: 0.6, then 28% more each level (0.84: up from 0.55 and 27%,
    for (let i = 1; i < L; i++) x *= 1.28; // for heroes who know four skills; whole powers: the same in every browser)
    return x;
  },
  siege: (L) => {
    let x = 0.7; // what the buildings feel of it: about power^0.6 (stone outlasts flesh)
    for (let i = 1; i < L; i++) x *= 1.154;
    return x;
  },
  extra: (L) => Math.floor((L - 1) / 4), // more of them in each wave
  waves: (L) => 3 + (L >= 10) + (L >= 20), // (0.84) a fourth wave from Night 10, a fifth from 20
  reward: (L) => 1 + 0.4 * (L - 1), // Faith and Wishstone (0.84: steeper, from 0.3)
  sigils: (L) => 1 + Math.floor(L / 2),
  pieces: (L) => Math.min(4, 1 + Math.floor(L / 5)), // Hero gear held nights give
  // (0.84) stars: held; no hall wrecked; no hero fell. Each star won for the first time on a Night pays
  starSigils: (L) => 2 + Math.floor(L / 3),
};

/**
 * (0.82) Hero gear: for the keep's heroes only, kept in the Armory (keep.armory), three slots a hero. Each
 * piece has a main line (damage on weapons, health on armour, either on a charm, as a share), bonus lines
 * by rarity, and at Immortal an effect of its own. Its strength comes from its rarity and the Night level
 * it was won on.
 */
export const HERO_SLOTS = ['weapon', 'armor', 'charm'];
export const HERO_SLOT_NAMES = { weapon: 'Weapon', armor: 'Armour', charm: 'Charm' };
export const ARMORY_MAX = 80;
export const HERO_GEAR = {
  main: [0.1, 0.15, 0.22, 0.32, 0.45, 0.62, 0.85], // the main line's share, by rarity (before the night's level)
  perNight: 0.04, // and 4% more for each Night level it was won on past the first
  lines: [0, 1, 1, 2, 2, 3, 3], // bonus lines, by rarity
  // bonus lines: the most each can roll at Immortal (rarer pieces roll nearer it)
  bonus: {
    crit: { name: 'Critical chance', max: 0.25 },
    haste: { name: 'Attack speed', max: 0.35 },
    guard: { name: 'Damage taken', max: 0.3, less: true },
    leech: { name: 'Lifesteal', max: 0.12 },
    focus: { name: 'Skill cooldown', max: 0.3, less: true },
    siege: { name: 'Damage to wreckers and to foes at a building', max: 0.6 },
  },
  // Immortal effects, one a slot
  effects: {
    weapon: { name: 'Hearthflame', desc: 'Every fourth strike bursts over 3 m for one and a half times the blow.' },
    armor: { name: 'Unbroken', desc: 'Once a night, a blow that would fell them leaves them at 30% instead.' },
    charm: { name: "Warden's Oath", desc: 'Unmade at a building take 40% more from them, and they run to defend it.' },
  },
  names: {
    weapon: ['Hearth-forged Blade', 'Ember Spear', 'Watch Bow', 'Lantern Staff', 'Hook Knife'],
    armor: ['Keep Mail', 'Ward Coat', 'Rime Cloak', 'Hearthguard Plate', 'Pilgrim Leathers'],
    charm: ['Ember Charm', 'Star-glass Bead', 'Wish Token', 'Hearthstone', 'Bell of Morning'],
  },
  salvage: (g) => Math.round((1 + g.r) * (1 + g.r) * (1 + (g.L - 1) / 10)), // Wishstone back
};
export const HERO_BONUS_IDS = Object.keys(HERO_GEAR.bonus);

/** (0.82) A new piece of Hero gear for a night held at level L (rng: the sim's stream, so every browser agrees). */
export function rollHeroGear(rng, L, id, slot = null) {
  const r = heroGearRarity(rng, L);
  slot = slot || HERO_SLOTS[Math.floor(rng() * HERO_SLOTS.length)];
  const names = HERO_GEAR.names[slot];
  const main = slot === 'weapon' ? 'dmg' : slot === 'armor' ? 'hp' : rng() < 0.5 ? 'dmg' : 'hp';
  const q = 0.8 + 0.4 * rng();
  const g = { id, slot, r, L, name: names[Math.floor(rng() * names.length)], main: { k: main, v: Math.round(HERO_GEAR.main[r] * (1 + HERO_GEAR.perNight * (L - 1)) * q * 1000) / 1000 }, lines: [], hero: null, locked: false };
  const pool = HERO_BONUS_IDS.slice();
  for (let i = 0; i < HERO_GEAR.lines[r] && pool.length; i++) {
    const k = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const top = HERO_GEAR.bonus[k].max * (0.35 + 0.65 * (r / HERO_RAR_MAX));
    g.lines.push({ k, v: Math.round(top * (0.6 + 0.4 * rng()) * 1000) / 1000 });
  }
  return g;
}
/** (0.82) The rarity of a piece the night gives: rarer the higher the level; Immortal from level 10. */
export function heroGearRarity(rng, L) {
  const imm = L >= 10 ? Math.min(0.15, 0.012 * (L - 9)) : 0;
  if (rng() < imm) return 6;
  const base = [50, 28, 14, 5.5, 1.8, 0.5];
  const floor = Math.min(4, Math.floor((L - 1) / 6)); // nothing below this from deep nights
  const g = Math.sqrt(1 + 0.18 * L); // (sqrt is exact in every browser)
  const w = base.map((b, i) => {
    if (i < floor) return 0;
    let x = b;
    for (let j = 0; j < i; j++) x *= g;
    return x;
  });
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i;
  return 5;
}
/** (0.82) How good a piece is, to sort and to pick the best for a hero. */
export function heroGearScore(g) {
  let s = g.main.v * 100;
  for (const l of g.lines) s += (l.v / HERO_GEAR.bonus[l.k].max) * 18;
  return s + (g.r >= 6 ? 30 : 0);
}

/** A hero's numbers: class, level, the Bastion's arming, their rarity, and the Hero gear they wear. */
/** (0.83) Four skill slots, from the saved four (or one skill from before 0.83, in its school's first slot). */
function cleanSkills(t) {
  const out = [null, null, null, null];
  const raw = Array.isArray(t.skills) ? t.skills.slice(0, 4) : [];
  if (!raw.length && SKILLS[t.skill]) raw[SKILLS[t.skill].school === 'phys' ? 0 : 2] = t.skill;
  raw.forEach((s, i) => {
    if (SKILLS[s] && SKILLS[s].school === skillSlotSchool(i) && !out.includes(s)) out[i] = s;
  });
  return out;
}
export function troopStats(t, armory = null) {
  const T = TROOPS[t.cls] || TROOPS.warrior;
  const rar = Math.max(0, Math.min(HERO_RAR_MAX, t.rar || 0));
  const m = (1 + KEEP.perLvl * ((t.lvl || 1) - 1)) * (1 + KEEP.perGear * (t.gear || 0)) * HERO_RARITY.mult[rar];
  const out = { ...T, rar, crit: T.crit || 0, haste: 0, guard: T.guard || 0, leech: T.leech || 0, focus: HERO_RARITY.skillCdr[rar], siege: 0, fx: {} };
  let dmgP = 0, hpP = 0;
  for (const g of armory || []) {
    if (!g || g.hero !== t.id) continue;
    if (g.main.k === 'dmg') dmgP += g.main.v;
    else hpP += g.main.v;
    for (const l of g.lines) out[l.k] = (out[l.k] || 0) + l.v;
    if (g.r >= 6) out.fx[g.slot] = true;
  }
  out.guard = Math.min(0.6, out.guard);
  out.focus = Math.min(0.75, out.focus);
  out.crit = Math.min(0.75, out.crit);
  out.hp = Math.round(T.hp * m * (1 + hpP));
  out.dmg = Math.round(T.dmg * m * (1 + dmgP) * 10) / 10;
  out.cd = T.cd / (1 + out.haste);
  return out;
}
/**
 * (0.82.5) Is a piece an upgrade for one of the keep's heroes: one has that slot empty, or wears something
 * worse there? (Auto-salvage and Break down leave such pieces alone, as the hero's own scrap does.)
 */
export function heroGearUpgrade(g, keep) {
  if (!keep || !g) return false;
  for (const t of keep.troops || []) {
    const now = (keep.armory || []).find((o) => o.hero === t.id && o.slot === g.slot && o !== g);
    if (!now || heroGearScore(g) > heroGearScore(now)) return true;
  }
  return false;
}
/** (0.82.5) What Break down would take: unworn, unlocked, not of a kept rarity, and no hero's upgrade. */
export function heroSalvageable(keep, keepRar = []) {
  const kept = new Set(keepRar);
  return (keep.armory || []).filter((g) => g.hero == null && !g.locked && !kept.has(g.r) && !heroGearUpgrade(g, keep));
}

/** (0.82) What a hero wears, slot by slot. */
export function heroWorn(t, armory) {
  const out = {};
  for (const g of armory || []) if (g && g.hero === t.id) out[g.slot] = g;
  return out;
}

/** A building's full health (the Bastion makes them all sturdier). */
export const buildMax = (id, keep) => Math.round((id === 'hearth' ? KEEP.buildHp.hearth : KEEP.buildHp.hall) * (1 + KEEP.perBastionHp * ((keep && keep.halls.warrior) || 0)) * BUILD_TIER.hp[(keep && keep.btier && keep.btier[id]) || 0]);
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
    last: int(raw.last, 0, 0, 1e15), // (0.81) when Faith last came in (ms). (0.82.3: was capped at 1e12, which today's clock is past, so every load rewound it and paid a full day again)
    sigils: int(raw.sigils), // (0.82) Ascension Sigils, from the night
    nightMax: int(raw.nightMax, 0, 0, NIGHT.max), // (0.82) the highest Night level held
    night: int(raw.night, 1, 1, NIGHT.max), // (0.82) the level last chosen
    // (0.84) stars won on each Night level: bit 1 held, 2 no hall wrecked, 4 no hero fell
    stars: Object.fromEntries(Object.entries(raw.stars && typeof raw.stars === 'object' ? raw.stars : {}).filter(([L]) => int(L, 0, 0, NIGHT.max) >= 1).map(([L, v]) => [int(L, 1, 1, NIGHT.max), int(v, 0, 0, 7)])),
    bosses: int(raw.bosses), // (0.84) Tidecallers felled
    raidsOn: raw.raidsOn !== false, // (0.86) surprise raids in the keep (the keeper may turn them off)
    raids: int(raw.raids), // (0.86) raids held
    raidAcc: Math.max(0, Math.min(24, Number(raw.raidAcc) || 0)), // (0.86) hours away not yet met by a raid
    raidsDue: int(raw.raidsDue, 0, 0, 3), // (0.86) raids the heroes met while you were away, fought when you come
    armory: [], // (0.82) Hero gear
    gearN: int(raw.gearN),
    autoSalvageAt: raw.autoSalvageAt == null ? null : int(raw.autoSalvageAt, 0, 0, 5), // (0.82.5) Hero gear broken down as it comes, up to this rarity
    works: {}, // (0.82.1) the Mine and the Fields
    btier: {}, // (0.82.1) each building's tier, Common (0) to Immortal (6)
    spent: int(raw.spent), // (0.82.1) everything spent on the keep, for its growth
    acc: { faith: Math.max(0, Math.min(1, Number(raw.acc && raw.acc.faith) || 0)), stone: Math.max(0, Math.min(1, Number(raw.acc && raw.acc.stone) || 0)) },
  };
  for (const w of WORK_IDS) if (raw.works && raw.works[w]) k.works[w] = int(raw.works[w], 0, 0, WORKS[w].max);
  for (const b of BUILD_IDS) if (raw.btier && raw.btier[b]) k.btier[b] = int(raw.btier[b], 0, 0, BUILD_TIER.max);
  if (Array.isArray(raw.armory)) {
    for (const g of raw.armory.slice(0, ARMORY_MAX)) {
      if (!g || !HERO_SLOTS.includes(g.slot) || !g.main || !['dmg', 'hp'].includes(g.main.k)) continue;
      const r = int(g.r, 0, 0, HERO_RAR_MAX);
      k.armory.push({
        id: String(g.id || '').slice(0, 16), slot: g.slot, r, L: int(g.L, 1, 1, NIGHT.max), name: String(g.name || 'Hero gear').slice(0, 32),
        main: { k: g.main.k, v: Math.max(0, Math.min(5, Number(g.main.v) || 0)) },
        lines: (Array.isArray(g.lines) ? g.lines : []).filter((l) => l && HERO_GEAR.bonus[l.k]).slice(0, 3).map((l) => ({ k: l.k, v: Math.max(0, Math.min(HERO_GEAR.bonus[l.k].max, Number(l.v) || 0)) })),
        hero: g.hero == null ? null : int(g.hero, 0, 0, 1e6), locked: !!g.locked,
      });
    }
  }
  if (Array.isArray(raw.troops)) {
    for (const t of raw.troops.slice(0, 8)) {
      if (!t || !TROOPS[t.cls]) continue;
      k.troops.push({ id: int(t.id, 0, 0, 1e6), cls: t.cls, name: String(t.name || 'A hero').slice(0, 24), lvl: int(t.lvl, 1, 1, 16), gear: int(t.gear, 0, 0, 15), skills: cleanSkills(t), rar: int(t.rar, 0, 0, HERO_RAR_MAX) });
    }
  }
  // (0.82) gear on a hero who has gone home goes back to the Armory; one piece a slot a hero
  const ids = new Set(k.troops.map((t) => t.id));
  const worn = new Set();
  for (const g of k.armory) {
    if (g.hero == null) continue;
    const key = g.hero + ':' + g.slot;
    if (!ids.has(g.hero) || worn.has(key)) g.hero = null;
    else worn.add(key);
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
