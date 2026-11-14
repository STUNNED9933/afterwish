// A simple bot that plays a Weekly Echo run while it is recorded, for the replay tests
// (test/sim.test.mjs) and the cross-browser check (test/determinism.mjs).
import { CONFIG } from '../src/config.js';
import { buildTrialWorld, trialFinished, trialScore, stateHash } from '../src/sim/trial.js';

/** Plays up to `maxTicks` and returns { record, endTick, score, hash }. */
export function playTrialBot(week, build, maxTicks = 60 * 120, seed = 7) {
  const w = buildTrialWorld(week, build);
  w.recorder = [];
  let r = seed >>> 0;
  const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  while (!trialFinished(w) && w.ticks < maxTicks) {
    const p = w.player;
    if (w.offer) {
      // Like the menu: the pick is applied straight away, between steps.
      w.command({ type: 'augment', id: w.offer.choices[Math.floor(rnd() * w.offer.choices.length)] });
      w.runCommands();
      continue;
    }
    if (w.ticks % 6 === 0) {
      let near = null, nd = Infinity;
      for (const e of w.enemies) {
        if (e.dead || e.state === 'spawn') continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < nd) { nd = d; near = e; }
        if (e.state === 'windup' && e.cue && rnd() < 0.5 && p.parryT <= 0) w.command({ type: 'parry' });
      }
      if (near) {
        if (p.targetId !== near.id && rnd() < 0.5) w.command({ type: 'attack', id: near.id });
        for (const k of ['r', 'q', 'w', 'e']) {
          if (p.cd[k] <= 0 && w.abilityUnlocked(k) && rnd() < 0.3) {
            w.command({ type: 'cast', slot: k, x: near.x + (rnd() - 0.5), z: near.z + (rnd() - 0.5) });
            break;
          }
        }
      } else if (rnd() < 0.1) {
        w.command({ type: 'move', x: (rnd() - 0.5) * 10, z: (rnd() - 0.5) * 10 });
      }
      if (p.hp < p.stats.maxHp * 0.4 && rnd() < 0.2) w.command({ type: 'potion' });
    }
    w.step(CONFIG.TICK);
    w.events.length = 0;
  }
  return { record: w.recorder, endTick: w.ticks, score: trialScore(w), hash: stateHash(w) };
}
