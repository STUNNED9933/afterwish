// The Mage's animations posed in code (0.37.3), with author.js. Her spark and Fire Bolt use a
// spell cast from Quaternius' library, Frozen Orb an overhand throw (retarget.js); the rest are
// our own. She holds her staff in the right hand; the game keeps it upright, leaning the way her
// forearm points (rigged.js). Distances in heights of the model.
import { curve } from './author.js';
import { runCycle, forwardFall, wideStance } from './common-moves.js';

/** Both hands to points in her chest's frame ([forward, up, right]), elbows out. */
function hands(P, l, r) {
  const at = (v) => P.at('Spine02', v);
  P.reach('L', at(l), at([-0.1, -0.15, -0.3]));
  P.reach('R', at(r), at([-0.1, -0.15, 0.3]));
}
const mix3 = (a, b, w) => a.map((x, i) => x + (b[i] - x) * w);

export const MAGE_MOVES = {
  // A light, upright run: the staff arm steadier, the free arm swinging, out of step.
  mag_run: runCycle({ duration: 0.6, lean: -7, arms: [['R', 1, 17, 82, 0.18, 0.7, 0.9], ['L', -1, 36, 86, 0.12, 0.45, 2.2]] }),
  // Starwake: she gathers herself low, vanishes, and rises where she lands, arms opening.
  mag_blink: {
    duration: 0.55,
    pose(P, t) {
      const low = curve([[0, 0], [0.08, 1], [0.22, 0.6], [0.55, 0]], t);
      wideStance(P, { yaw: 0, spread: 1, crouch: 0.02 + 0.08 * low, lean: -14 * low });
      const open = curve([[0, 0], [0.12, 0], [0.3, 1], [0.55, 0.2]], t);
      hands(P, mix3([0.14, -0.05, -0.05], [0.12, 0.02, -0.38], open), mix3([0.14, -0.04, 0.06], [0.14, 0.02, 0.36], open));
    },
  },
  // Meteor: staff and free hand raised high to call it down, then brought down and forward
  // hard as it falls, left hand a moment behind.
  mag_meteor: {
    duration: 1.2,
    pose(P, t) {
      wideStance(P, { yaw: 15, spread: 1.2, crouch: curve([[0, 0.02], [0.3, 0.01], [0.48, 0.08], [0.9, 0.06], [1.2, 0.02]], t), lean: curve([[0, 0], [0.3, 10], [0.48, -14], [0.9, -10], [1.2, 0]], t) });
      const raise = [0.06, 0.42, 0], strike = [0.34, -0.02, 0];
      const k = (lag) => curve([[0, 0], [0.3, 0], [0.46 + lag, 1], [0.9, 1], [1.2, 0.3]], t);
      const up = curve([[0, 0], [0.28, 1], [0.46, 1], [1.2, 1]], t);
      const pose = (side, lag) => mix3(mix3([0.12, -0.06, side * 0.12], [raise[0], raise[1], side * 0.1], up), [strike[0], strike[1], side * 0.08], k(lag));
      hands(P, pose(-1, 0.04), pose(1, 0));
    },
  },
  // Basic attack, a whole cycle over the time between sparks (the spark leaves 30% in): the free
  // hand snaps forward, palm out, and draws back; the staff hand answers a moment later.
  mag_cast: {
    duration: 1.0,
    pose(P, t) {
      const k = curve([[0, 0.15], [0.3, 1], [0.42, 0.9], [1, 0.15]], t);
      const s2 = curve([[0, 0], [0.36, 1], [0.6, 0.3], [1, 0]], t); // the staff hand, a beat later
      wideStance(P, { yaw: 30, spread: 1, crouch: 0.03, lean: -4 * k });
      hands(P, mix3([0.12, -0.02, -0.14], [0.4, 0.06, -0.06], k), mix3([0.08, -0.16, 0.2], [0.14, -0.1, 0.2], s2));
    },
  },
  // Fire Bolt: both hands thrust forward together (the staff a little ahead), leaning into it.
  mag_bolt: {
    duration: 0.8,
    pose(P, t) {
      const k = curve([[0, 0.2], [0.08, 1], [0.32, 0.95], [0.8, 0]], t);
      const k2 = curve([[0, 0.2], [0.11, 1], [0.36, 0.9], [0.8, 0]], t);
      wideStance(P, { yaw: 25, spread: 1.15, crouch: 0.03 + 0.04 * k, lean: -12 * k, step: 0.02 * k });
      hands(P, mix3([0.12, -0.02, -0.12], [0.4, 0.04, -0.07], k2), mix3([0.1, -0.12, 0.18], [0.36, 0.02, 0.06], k));
    },
  },
  mag_death: forwardFall,
};
