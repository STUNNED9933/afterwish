// The Weekly Echo: one fixed arena trial a week, the same for every player of a subclass.
//
// Shared by the game, the replay checker and the server, so all three agree on a week's
// rules, a valid build and a run's score. Nothing here may use the clock except
// weekIndexAt(), which only turns a date into a week number.

import { CONFIG } from '../config.js';
import { World } from './world.js';
import { CLASSES } from './classes.js';
import { SPECS, ROW_NEED, talentPointsAt } from './talents.js';
import { SLOTS, rollItem } from './items.js';
import { makeRng } from './rng.js';

/** Week 0 began Monday 2026-11-09 00:00 UTC (08:00 in Singapore). Weeks run Monday to Monday, UTC. */
export const TRIAL_EPOCH = Date.UTC(2026, 10, 9);
export const WEEK_MS = 7 * 24 * 3600 * 1000;
/** A run ends at this floor, or after this much game time (40 minutes). */
export const TRIAL_MAX_FLOOR = 50;
export const TRIAL_MAX_TICKS = Math.round((40 * 60) / CONFIG.TICK);
const LEVELS = [30, 60, 90];
const FEATURED = ['weapon', 'boots', 'chest', 'helm', 'ring'];
/** Commands a recorded run may contain. Anything else is dropped before a replay. */
export const TRIAL_COMMANDS = new Set(['move', 'attack', 'attackMove', 'stop', 'cast', 'parry', 'potion', 'augment', 'reroll', 'nextWave', 'setAutoAttack']);

export function weekIndexAt(ms) {
  return Math.floor((ms - TRIAL_EPOCH) / WEEK_MS);
}

/** 32-bit FNV-1a, for seeds. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** Everything a week fixes. */
export function trialWeek(index) {
  return {
    index,
    id: `W${index}`,
    seed: hash32(`afterwish-weekly-echo-${index}`),
    level: LEVELS[((index % LEVELS.length) + LEVELS.length) % LEVELS.length],
    featured: FEATURED[((index % FEATURED.length) + FEATURED.length) % FEATURED.length],
    starts: TRIAL_EPOCH + index * WEEK_MS,
    ends: TRIAL_EPOCH + (index + 1) * WEEK_MS,
  };
}

/** The week's standard gear for a class: Epic at the week's level, one Immortal in the featured slot. */
export function trialGear(week, cls) {
  const rng = makeRng(hash32(`gear-${week.seed}-${cls}`));
  const equipped = {};
  for (const slot of SLOTS) {
    const r = slot === week.featured ? 6 : 3;
    const weights = [0, 0, 0, 0, 0, 0, 0].map((_, i) => (i === r ? 1 : 0));
    const item = rollItem(rng, week.level, { minRarity: r, weights, slot, cls });
    item.id = `trial-${slot}`; // ids are not part of the game, but keep them identical everywhere
    equipped[slot] = item;
  }
  return equipped;
}

/** Ability ranks spread the usual way: R whenever it can rank, then Q, W, E in turn. */
export function autoRanks(level) {
  const ranks = { q: 1, w: 1, e: 1, r: 1 };
  let points = level - 1;
  const order = ['q', 'w', 'e'];
  let i = 0;
  while (points > 0) {
    if (ranks.r < Math.min(CONFIG.MAX_RANK, 1 + Math.floor(level / 6))) {
      ranks.r++;
    } else {
      let tries = 0;
      while (ranks[order[i % 3]] >= CONFIG.MAX_RANK && tries < 3) {
        i++;
        tries++;
      }
      if (tries >= 3) break;
      ranks[order[i % 3]]++;
      i++;
    }
    points--;
  }
  return ranks;
}

/** Talents spent the usual way: the first minor talent, both majors, the capstone, then the other minors. */
export function autoTalents(spec, points) {
  const sp = SPECS[spec];
  if (!sp) return {};
  const t = sp.talents;
  const out = {};
  const spent = () => Object.values(out).reduce((a, b) => a + b, 0);
  const minor = t.filter((x) => x.row === 'minor');
  const buy = (x) => {
    if (!x || spent() >= points || (out[x.id] || 0) >= x.max || spent() < ROW_NEED[x.row]) return false;
    out[x.id] = (out[x.id] || 0) + 1;
    return true;
  };
  while (buy(minor[0]));
  for (const x of t.filter((y) => y.row === 'major')) while (buy(x));
  for (let n = 0; n < 60 && spent() < points; n++) {
    if (!buy(t.find((x) => x.row === 'capstone')) && !buy(minor[1])) buy(minor[2]);
  }
  return out;
}

/** A build the player brings: class, subclass, talents, ranks, auto-attack. */
export function defaultBuild(week, cls, spec = null) {
  const specs = Object.keys(SPECS).filter((k) => SPECS[k].cls === cls);
  const s = spec && specs.includes(spec) ? spec : specs[0];
  return { cls, spec: s, talents: autoTalents(s, talentPointsAt(week.level)), ranks: autoRanks(week.level), autoAttack: true };
}

/** Returns null for a build that is allowed this week, or the reason it is not. */
export function validateBuild(week, b) {
  if (!b || typeof b !== 'object') return 'no build';
  if (!CLASSES[b.cls]) return 'unknown class';
  const sp = SPECS[b.spec];
  if (!sp || sp.cls !== b.cls) return 'pick a subclass of your class';
  if (week.level < CONFIG.SPEC_LEVEL) return 'subclasses are not open at this level';
  const talents = b.talents || {};
  let minor = 0, major = 0, cap = 0;
  for (const id in talents) {
    const t = sp.talents.find((x) => x.id === id);
    const r = talents[id];
    if (!t) return `talent ${id} is not part of ${sp.name}`;
    if (!Number.isInteger(r) || r < 0 || r > t.max) return `talent ${id} has a bad rank`;
    if (t.row === 'minor') minor += r;
    else if (t.row === 'major') major += r;
    else cap += r;
  }
  if (minor + major + cap > talentPointsAt(week.level)) return 'too many talent points';
  if (major > 0 && minor < ROW_NEED.major) return `the middle row needs ${ROW_NEED.major} points first`;
  if (cap > 0 && minor + major < ROW_NEED.capstone) return `the capstone needs ${ROW_NEED.capstone} points first`;
  const ranks = b.ranks || {};
  let extra = 0;
  for (const k of ['q', 'w', 'e', 'r']) {
    const r = ranks[k];
    if (!Number.isInteger(r) || r < 1 || r > CONFIG.MAX_RANK) return `rank ${k} is not allowed`;
    extra += r - 1;
  }
  if (extra > week.level - 1) return 'too many ability ranks';
  return null;
}

/** The arena world for a run of this week's echo with this build. */
export function buildTrialWorld(week, build) {
  const save = {
    cls: build.cls,
    level: week.level,
    exp: 0,
    equipped: trialGear(week, build.cls),
    bag: [],
    gold: 0,
    ranks: Object.assign({}, build.ranks),
    skillPoints: 0,
    spec: build.spec,
    talents: Object.assign({}, build.talents),
    bestWave: 0,
    maxCheckpoint: 1,
  };
  const w = new World({ seed: week.seed, mode: 'arena', cls: build.cls, save, parryPreset: 'standard', startWave: 1, trial: { week: week.index } });
  w.player.autoAttack = build.autoAttack !== false;
  return w;
}

/** A run's score: the floor cleared, then the game time it took to clear it. */
export function trialScore(world) {
  return { floor: world.wave.cleared || 0, clearTick: world.clearTick || 0, ticks: world.ticks, over: !!world.gameOver };
}

/** True when a run has nothing left to play: the hero fell, it reached the last floor, or ran out of time. */
export function trialFinished(world) {
  return world.gameOver || (world.wave.cleared || 0) >= TRIAL_MAX_FLOOR || world.ticks >= TRIAL_MAX_TICKS;
}

/** A short fingerprint of the world, to compare two replays of the same run (or the same run in two browsers). */
export function stateHash(world) {
  const p = world.player;
  const parts = [world.ticks, world.wave.n, world.wave.cleared, p.hp.toFixed(6), p.x.toFixed(6), p.z.toFixed(6), world.enemies.length];
  for (const e of world.enemies) parts.push(e.hp.toFixed(4), e.x.toFixed(4), e.z.toFixed(4));
  return hash32(parts.join('|')).toString(16);
}

/** Only allowed commands with plain values; anything odd is dropped. */
export function cleanCommand(c) {
  if (!c || typeof c !== 'object' || !TRIAL_COMMANDS.has(c.type)) return null;
  const out = { type: c.type };
  for (const k of ['x', 'z']) if (k in c) {
    if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) return null;
    out[k] = c[k];
  }
  for (const k of ['slot', 'id', 'near']) if (k in c) {
    if (typeof c[k] !== 'string' && typeof c[k] !== 'number') return null;
    out[k] = c[k];
  }
  if ('on' in c) out.on = !!c.on;
  return out;
}

/**
 * Play a recorded run again from its build and commands. Returns the score it really reaches.
 * `inputs` = [[tick, command], ...] in the order they were applied; `endTick` = where the run stopped.
 */
export function replayTrial(week, build, inputs, endTick = TRIAL_MAX_TICKS) {
  const bad = validateBuild(week, build);
  if (bad) return { ok: false, error: bad };
  if (!Array.isArray(inputs)) return { ok: false, error: 'no inputs' };
  const w = buildTrialWorld(week, build);
  const stop = Math.min(Number(endTick) || 0, TRIAL_MAX_TICKS);
  let i = 0;
  let last = 0;
  while (!trialFinished(w) && w.ticks < stop) {
    while (i < inputs.length) {
      const pair = inputs[i];
      if (!Array.isArray(pair) || !Number.isInteger(pair[0]) || pair[0] < last) return { ok: false, error: 'inputs out of order' };
      if (pair[0] > w.ticks) break;
      last = pair[0];
      const c = cleanCommand(pair[1]);
      if (c && pair[0] === w.ticks) w.command(c);
      i++;
    }
    w.step(CONFIG.TICK);
    w.events.length = 0;
  }
  return Object.assign({ ok: true, hash: stateHash(w) }, trialScore(w));
}
