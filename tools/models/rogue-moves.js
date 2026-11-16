// The Rogue's animations posed in code (0.37.3), with author.js. His basic attacks are jab and
// cross stabs from Quaternius' library (retarget.js); everything here is our own. He holds a
// dagger in each hand (the game places them; see rigged.js). Distances in heights of the model.
import { curve, FWD, RIGHT, UP } from './author.js';
import { runCycle, forwardFall, wideStance } from './common-moves.js';

/** Both hands to points in his chest's frame ([forward, up, right]), elbows out and back. */
function hands(P, l, r) {
  const at = (v) => P.at('Spine02', v);
  P.reach('L', at(l), at([-0.15, -0.1, -0.3]));
  P.reach('R', at(r), at([-0.15, -0.1, 0.3]));
}

export const ROGUE_MOVES = {
  // (0.42) A low, driven run: leaning well in, long strides, blades held back low behind him,
  // each hand drifting on its own small rhythm. Purposeful, not bouncy.
  rog_run: runCycle({
    duration: 0.5, lean: -24, reach: 1.08, kick: 0.85, twist: 0.6, bob: 0.7,
    hold(P, ph) {
      // hands just behind and beside the hips (in the model's own frame, not the leaning chest's)
      const T = Math.PI * 2;
      const hip = P.pos('Hip');
      const by = (f, u, r) => hip.clone().addScaledVector(FWD, f * P.H).addScaledVector(UP, u * P.H).addScaledVector(RIGHT, r * P.H);
      P.reach('L', by(-0.13 + 0.02 * Math.sin(T * ph + 0.4), -0.03 + 0.012 * Math.sin(T * 2 * ph + 1.1), -0.19), by(0.05, 0.2, -0.45));
      P.reach('R', by(-0.15 + 0.025 * Math.sin(T * ph + 2.9), -0.01 + 0.01 * Math.sin(T * 2 * ph + 2.4), 0.2), by(0.05, 0.2, 0.45));
    },
  }),
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
  // (0.42) Nightstep, Ambush, Veilstep: a sudden dip, then he is gone low, almost flat over a
  // long stride, both blades swept back behind him, and he rises out of it at the end.
  rog_dash: {
    duration: 0.6,
    pose(P, t) {
      const dip = curve([[0, 0], [0.05, 1], [0.1, 0]], t); // the coil before the burst
      const k = curve([[0, 0], [0.08, 0.35], [0.13, 1], [0.38, 1], [0.6, 0]], t);
      wideStance(P, { yaw: 8, spread: 1 + 0.8 * k, crouch: 0.03 + 0.05 * dip + 0.15 * k, lean: 8 * dip - 46 * k, step: 0.09 * k });
      P.rot('NeckTwist01', P.axis('Spine02', RIGHT), 26 * k); // eyes stay on where he is going
      // blades swept back low beside the hips (the model's own frame), the left a beat behind
      const lag = curve([[0, 0], [0.1, 0], [0.18, 1], [0.6, 1]], t);
      const hip = P.pos('Hip');
      const by = (f, u, r) => hip.clone().addScaledVector(FWD, f * P.H).addScaledVector(UP, u * P.H).addScaledVector(RIGHT, r * P.H);
      const ready = (s) => P.at('Spine02', [0.14, -0.08, s * 0.12]);
      const swept = (s, w) => by(-0.2, 0.02, s * 0.22);
      const kl = k * lag;
      P.reach('L', ready(-1).lerp(swept(-1), kl), by(0.05, 0.25, -0.5));
      P.reach('R', ready(1).lerp(swept(1), k), by(0.05, 0.25, 0.5));
    },
  },
  // (0.42) Starglass Kunai: weight back, the throwing hand drawn past the ear, then whipped
  // through and across, the free hand out for balance; the kunai leaves early in the whip.
  rog_throw: {
    duration: 0.55,
    pose(P, t) {
      wideStance(P, { yaw: 35, spread: 1.15, crouch: 0.05, lean: curve([[0, 4], [0.08, 10], [0.16, -18], [0.32, -12], [0.55, -3]], t) });
      P.rot('Spine01', P.axis('Spine01', UP), curve([[0, 0], [0.08, 22], [0.18, -26], [0.34, -18], [0.55, -4]], t)); // the shoulders whip round
      const r = curve([[0, [0.14, -0.05, 0.12]], [0.08, [-0.1, 0.17, 0.2]], [0.15, [0.36, 0.06, 0.05]], [0.3, [0.3, -0.12, -0.12]], [0.55, [0.16, -0.08, 0.1]]], t);
      const l = curve([[0, [0.14, -0.08, -0.12]], [0.08, [0.28, 0.02, -0.2]], [0.2, [0.06, -0.1, -0.3]], [0.55, [0.12, -0.1, -0.14]]], t);
      hands(P, l, r);
    },
  },
  rog_death: forwardFall,
};
