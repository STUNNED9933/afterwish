// Bundled into a page by test/determinism.mjs so each browser engine plays and replays the same runs.
import { trialWeek, defaultBuild, replayTrial } from '../src/sim/trial.js';
import { playTrialBot } from './trialbot.mjs';

export const CASES = [
  ['warrior', 'berserker', 3], ['warrior', 'bulwark', 4], ['archer', 'sharpshooter', 5],
  ['rogue', 'shadowdancer', 6], ['mage', 'pyromancer', 7], ['mage', 'frostbinder', 8],
];

/** Replay recordings made elsewhere (by Node, like the server): what a browser must agree on exactly. */
export function replayAll(weekIndex, runs) {
  const wk = trialWeek(weekIndex);
  return runs.map((r) => {
    const rep = replayTrial(wk, r.build, r.record, r.ticks);
    return { spec: r.spec, floor: rep.floor, clearTick: rep.clearTick, hash: rep.hash };
  });
}

/** For each case: the live bot run's score and hash, then a replay's. */
export function runAll(weekIndex, seconds) {
  const wk = trialWeek(weekIndex);
  return CASES.map(([cls, spec, seed]) => {
    const b = defaultBuild(wk, cls, spec);
    const live = playTrialBot(wk, b, 60 * seconds, seed);
    const rep = replayTrial(wk, b, live.record, live.endTick);
    return { spec, build: b, record: live.record, floor: live.score.floor, clearTick: live.score.clearTick, ticks: live.endTick, hash: live.hash, replayHash: rep.hash };
  });
}
