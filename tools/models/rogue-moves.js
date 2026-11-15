// The Rogue's animations posed in code (0.37.3), with author.js. His basic attacks are jab and
// cross stabs from Quaternius' library (retarget.js); everything here is our own. He holds a
// dagger in each hand (the game places them; see rigged.js). Distances in heights of the model.
import { curve } from './author.js';
import { runCycle, forwardFall, wideStance } from './common-moves.js';

/** Both hands to points in his chest's frame ([forward, up, right]), elbows out and back. */
function hands(P, l, r) {
  const at = (v) => P.at('Spine02', v);
  P.reach('L', at(l), at([-0.15, -0.1, -0.3]));
  P.reach('R', at(r), at([-0.15, -0.1, 0.3]));
}

export const ROGUE_MOVES = {
  // A low, quick run, leaning in, both blades held ready; each arm on its own timing.
  rog_run: runCycle({ duration: 0.52, lean: -15, arms: [['R', 1, 33, 96, 0.1, 0.42, 0.6], ['L', -1, 29, 90, 0.14, 0.58, 2.0]] }),
  // Mercy Stroke and Last Rites: both daggers raised, then driven down and forward together,
  // the right a moment ahead of the left.
  rog_stab: {
    duration: 0.7,
    pose(P, t) {
      wideStance(P, { yaw: 20, spread: 1.1, crouch: curve([[0, 0.05], [0.12, 0.09], [0.4, 0.07], [0.7, 0.03]], t), lean: curve([[0, 6], [0.12, -16], [0.4, -12], [0.7, -4]], t) });
      const up = [0.05, 0.2, 0], down = [0.34, -0.12, 0];
      const k = (lag) => curve([[0, 0], [0.04 + lag, 0], [0.13 + lag, 1], [0.42, 1], [0.7, 0.35]], t);
      const mix3 = (a, b, w) => a.map((x, i) => x + (b[i] - x) * w);
      const kr = k(0), kl = k(0.03);
      hands(P, mix3([up[0], up[1], -0.12], [down[0], down[1], -0.07], kl), mix3([up[0], up[1] + 0.02, 0.12], [down[0] + 0.03, down[1], 0.06], kr));
    },
  },
  // Fan of Knives: crouched low, arms flung wide, while the game spins him round.
  rog_spin: {
    duration: 0.1,
    pose(P) {
      wideStance(P, { yaw: 0, spread: 1.3, crouch: 0.09, lean: -12 });
      hands(P, [0.06, 0.04, -0.42], [0.1, 0.02, 0.42]);
    },
  },
  // Nightstep: a long, low lunge, the right blade thrust ahead, the left swept back.
  rog_dash: {
    duration: 0.6,
    pose(P, t) {
      const k = curve([[0, 0], [0.1, 1], [0.35, 0.9], [0.6, 0]], t);
      wideStance(P, { yaw: 25 * k, spread: 1 + 0.5 * k, crouch: 0.02 + 0.1 * k, lean: -28 * k, step: 0.04 * k });
      hands(P, [-0.1 * k + 0.12 * (1 - k), -0.12, -0.2], [0.12 + 0.3 * k, -0.02 * k - 0.1 * (1 - k), 0.12]);
    },
  },
  rog_death: forwardFall,
};
