// Animations shared by the heroes posed in code (0.37.3): a run and a fall, each limb with its
// own timing (nothing moves as a mirror image of anything else; see archer-moves.js).
import { FWD, UP, RIGHT, curve } from './author.js';

export const BASE = ['idle', 1.0]; // the character's own idle, for anything not posed here
const TAU = Math.PI * 2;
const flat = (v) => {
  v.y = 0;
  return v.normalize();
};


/**
 * A run cycle (two strides). arms: per arm [side, sign (1 right, -1 left), swing degrees,
 * elbow bend, out from the body, lag, second-rhythm phase]; lean: forward lean of the waist.
 * (0.42) reach / kick scale the stride and the heel kick, twist the hips' and shoulders' turn,
 * bob the bounce; hold(P, ph) poses arms that do not swing (say, blades held back).
 */
export function runCycle({ duration = 0.56, lean = -10, arms = [], reach = 1, kick = 1, twist = 1, bob = 1, hold = null } = {}) {
  return {
    duration,
    pose(P, t) {
      const ph = t / duration;
      P.reset(BASE, true);
      const side = () => P.axis('Hip', RIGHT);
      P.rot('Hip', UP, 8 * twist * Math.sin(TAU * ph));
      P.rot('Hip', side(), -5); // pelvis tipped into the run
      P.rot('Waist', side(), lean);
      P.rot('Spine01', side(), -5);
      P.rot('Spine01', UP, -13 * twist * Math.sin(TAU * ph - 0.25)); // shoulders against the hips, a beat late
      P.rot('NeckTwist01', UP, 5 * Math.sin(TAU * ph - 0.6) + 1.5 * Math.sin(2 * TAU * ph + 1)); // the head steadies itself
      P.rot('NeckTwist01', side(), 12); // eyes up, ahead
      // each leg has its own reach, kick and timing, plus a small second rhythm of its own
      for (const [s, off, reachL, kickL, lag, h2] of [['L', 0, 41, 104, 0.4, 0.9], ['R', 0.5, 44, 112, 0.48, 2.3]]) {
        const a = TAU * (ph + off);
        const thigh = 14 + reachL * reach * Math.sin(a) + 3 * Math.sin(2 * a + h2); // driven forward, pushed far back
        const knee = 18 + kickL * kick * Math.pow(Math.max(0, Math.cos(a - lag)), 1.4); // heel kicks up behind
        const ax = side();
        P.rot(`${s}_Thigh`, ax, thigh);
        P.rot(`${s}_Calf`, ax, -knee);
        P.rot(`${s}_Foot`, ax, -0.45 * (thigh - knee) - 18 * Math.max(0, -Math.sin(a - 0.1)));
      }
      P.ground(0.022 * bob * Math.max(0, Math.sin(2 * TAU * ph - 0.6)));
      // arms swing from the shoulder, elbows bent, a beat behind the legs, crossing a little
      // toward the middle as they come forward; each with its own lag and second rhythm
      const across = P.axis('Spine02', RIGHT), ahead = P.axis('Spine02', FWD), down = P.axis('Spine02', UP).negate();
      for (const [s, sign, amp, flex, out, lag, h2] of arms) {
        const a = TAU * ph + (sign > 0 ? 0 : Math.PI) - lag; // opposite the same-side leg, lagging
        const swing = amp * (Math.sin(a) + 0.2 * Math.sin(2 * a + h2));
        const outward = sign > 0 ? across : across.clone().negate();
        P.aim(`${s}_Upperarm`, `${s}_Forearm`, down.clone().addScaledVector(outward, out));
        P.rot(`${s}_Upperarm`, across, swing); // forward and back
        P.rot(`${s}_Upperarm`, ahead, -sign * Math.max(0, swing) * 0.25); // in toward the middle as it comes forward
        P.rot(`${s}_Clavicle`, across, swing * 0.15);
        P.rot(`${s}_Forearm`, across, flex + 18 * Math.max(0, Math.sin(a))); // bends more on the way up
      }
      if (hold) hold(P, ph);
    },
  };
}

/**
 * A fall: the blow rocks them back, one knee gives and then the other, they pitch forward,
 * throw their hands out to catch themselves, the arms fold and they go down on their front.
 */
export const forwardFall = {
  duration: 1.6,
  pose(P, t) {
    P.reset(BASE, true);
    const pitch = curve([[0, 0], [0.14, 9], [0.42, -12], [0.72, -48], [0.92, -72], [1.08, -88], [1.25, -90], [1.6, -90]], t);
    const drop = curve([[0, 0], [0.14, 0.01], [0.42, 0.16], [0.72, 0.27], [0.92, 0.36], [1.08, 0.445], [1.25, 0.455], [1.6, 0.455]], t);
    const fwd = curve([[0, 0], [0.14, -0.025], [0.42, 0.0], [0.92, 0.07], [1.25, 0.1], [1.6, 0.1]], t);
    P.hips([fwd, -drop, 0]);
    P.rot('Hip', RIGHT, pitch); // negative pitches her forward
    P.rot('Hip', P.axis('Hip', UP), curve([[0, 0], [0.7, 6], [1.2, 14]], t)); // twisting a little as she goes
    const side = P.axis('Hip', RIGHT);
    // the left knee goes first; the right gives a moment later and slides back as she falls
    const kneeL = curve([[0, 0], [0.12, 4], [0.36, 68], [0.72, 74], [0.95, 32], [1.2, 12], [1.6, 10]], t);
    const kneeR = curve([[0, 0], [0.3, 6], [0.55, 26], [0.78, 52], [0.98, 22], [1.2, 6], [1.6, 4]], t);
    const backR = curve([[0, 0], [0.5, 0], [0.85, 18], [1.1, 10], [1.6, 8]], t);
    P.rot('L_Thigh', side, kneeL * 0.9).rot('L_Calf', side, -kneeL * 1.5);
    P.rot('R_Thigh', side, kneeR * 0.7 - backR).rot('R_Calf', side, -kneeR * 1.4);
    P.rot('L_Foot', side, curve([[0, 0], [0.9, 10], [1.15, 38], [1.6, 42]], t));
    P.rot('R_Foot', side, curve([[0, 0], [0.7, 6], [1.05, 30], [1.6, 36]], t)); // toes point back once down
    P.rot('Hip', P.axis('Hip', FWD), curve([[0, 0], [0.36, -7], [0.8, -4], [1.2, 3]], t)); // dips to the side that gave first
    // the back curls as she falls, then lies flat
    P.rot('Waist', side, curve([[0, 0], [0.14, 6], [0.72, -12], [1.05, -6], [1.3, 2]], t));
    P.rot('Spine01', side, curve([[0, 0], [0.72, -8], [1.1, 0]], t));
    P.rot('NeckTwist01', P.axis('Spine02', RIGHT), curve([[0, 0], [0.14, 16], [0.5, -6], [0.95, 14], [1.6, 18]], t)); // chin up as she lands
    P.rot('NeckTwist01', P.axis('Spine02', UP), curve([[0, 0], [1.0, 0], [1.4, 55], [1.6, 60]], t)); // head turned on the ground
    // hands: thrown out ahead toward the ground, then the elbows give and slide out to the sides
    const catchW = curve([[0, 0], [0.3, 0], [0.62, 1], [1.6, 1]], t);
    const give = curve([[0, 0], [0.9, 0], [1.12, 1], [1.6, 1]], t);
    for (const [s, z] of [['L', -1], ['R', 1]]) {
      const sh = P.pos(`${s}_Upperarm`);
      const reach = sh.clone().addScaledVector(FWD, 0.2 * P.H).addScaledVector(RIGHT, z * 0.05 * P.H);
      reach.y = Math.max(0.02 * P.H, Math.min(reach.y, curve([[0.3, 0.5], [0.7, 0.2], [0.95, 0.03]], t) * P.H));
      const down = sh.clone().addScaledVector(FWD, 0.05 * P.H).addScaledVector(RIGHT, z * 0.2 * P.H);
      down.y = 0.025 * P.H;
      const target = P.pos(`${s}_Hand`).lerp(reach.lerp(down, give), catchW);
      P.reach(s, target, sh.clone().addScaledVector(RIGHT, z * 0.3 * P.H).addScaledVector(UP, 0.1 * P.H));
    }
  },
};

/** A wide, low standing stance: front (left) foot toward the target, back foot turned out. */
export function wideStance(P, { yaw = 70, spread = 1, crouch = 0.04, lean = 0, step = 0 } = {}) {
  P.reset(BASE, true);
  const footY = P.pos('L_Foot').y;
  P.hips([step, -crouch, 0]);
  P.rot('Hip', UP, -yaw * 0.7);
  const hr = P.axis('Hip', RIGHT), hf = P.axis('Hip', FWD);
  const ground = (f, r) => {
    const v = P.pos('Hip').addScaledVector(FWD, f * P.H).addScaledVector(hr, r * P.H);
    v.y = footY;
    return v;
  };
  const hip = P.pos('Hip');
  P.step('L', ground(0.17 * spread, -0.05 * spread), hip.clone().addScaledVector(FWD, 0.4 * P.H));
  P.step('R', ground(-0.15 * spread, 0.07 * spread), hip.clone().addScaledVector(FWD, -0.05 * P.H).addScaledVector(hr, 0.3 * P.H).addScaledVector(hf, 0.2 * P.H));
  P.aim('L_Foot', 'L_ToeBase', FWD.clone().addScaledVector(UP, -0.25));
  P.aim('R_Foot', 'R_ToeBase', flat(hf.clone().addScaledVector(FWD, 0.3)).addScaledVector(UP, -0.25));
  P.rot('Spine01', UP, -yaw * 0.3);
  if (lean) P.rot('Waist', P.axis('Waist', RIGHT), lean); // + leans back
  P.rot('NeckTwist01', UP, yaw * 0.6);
  P.rot('Head', UP, yaw * 0.4);
}

