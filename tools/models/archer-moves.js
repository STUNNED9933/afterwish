// The Archer's own animations (0.37), posed in code with author.js: shots, the skills, a roll
// and a fall. The bow is not part of the clips: the game holds it in her left hand and pulls its
// string to her right hand when that hand is drawn back behind it (see rigged.js).
// Distances are in heights of the model; angles in degrees.
import * as THREE from 'three';
import { FWD, UP, RIGHT, curve, mix } from './author.js';

const BASE = ['idle', 1.0]; // her own idle, for the legs and anything not posed here
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Side-on archer's stance: hips and chest turned so the left shoulder leads, face to the target. */
function stance(P, { yaw = 60, lean = 0, crouch = 0, step = 0, hipLift = 0 } = {}) {
  P.reset(BASE, true);
  P.hips([step, hipLift - crouch, 0]);
  P.rot('Hip', UP, -yaw * 0.65);
  P.rot('Spine01', UP, -yaw * 0.35);
  if (lean) P.rot('Waist', P.axis('Waist', RIGHT), lean); // + leans back
  if (crouch > 0) bendKnees(P, crouch);
  P.rot('NeckTwist01', UP, yaw * 0.6);
  P.rot('Head', UP, yaw * 0.4);
}

/** Bend both knees so the feet stay put when the hips drop by d. */
function bendKnees(P, d, extra = 1) {
  const a = Math.min(80, d * 760 * extra);
  for (const s of ['L', 'R']) {
    const ax = P.axis(`${s}_Thigh`, RIGHT);
    P.rot(`${s}_Thigh`, ax, a);
    P.rot(`${s}_Calf`, ax, -2 * a);
    P.rot(`${s}_Foot`, ax, a);
  }
}

/** Bow arm straight out toward the target (raised by elev), the elbow turned out. */
function bowArm(P, elev = 0, ext = 0.98) {
  const sh = P.pos('L_Upperarm');
  const e = (elev * Math.PI) / 180;
  const dir = FWD.clone().multiplyScalar(Math.cos(e)).addScaledVector(UP, Math.sin(e));
  const T = sh.clone().addScaledVector(dir, 0.255 * ext * P.H).addScaledVector(UP, 0.012 * P.H);
  P.reach('L', T, sh.clone().addScaledVector(UP, -0.12 * P.H).addScaledVector(RIGHT, -0.18 * P.H));
  return { T, dir };
}

/** String hand: k behind the bow hand along the arrow; q blends to the quiver on her back. */
function drawArm(P, bow, k, q = 0) {
  const nock = bow.T.clone().addScaledVector(bow.dir, -k * P.H).addScaledVector(RIGHT, 0.012 * P.H).addScaledVector(UP, -0.008 * P.H);
  const quiver = P.at('Spine02', [-0.07, 0.15, 0.05]);
  const T = nock.lerp(quiver, q);
  const sh = P.pos('R_Upperarm');
  const pole = sh.clone().addScaledVector(FWD, -0.25 * P.H).addScaledVector(UP, mix(0.05, -0.1, q) * P.H).addScaledVector(RIGHT, 0.12 * P.H);
  P.reach('R', T, pole);
}

const FULL = 0.27; // full draw: the string hand at her chin
const SNAP = 0.345; // just after the release, the hand flicks back past it (the string is let go)
const NOCK = 0.04; // a new arrow set on the string, at the bow

export const ARCHER_MOVES = {
  // Her run: light and upright, the bow held low and steady in front, the free arm pumping.
  // One loop is two strides; the game plays it faster or slower with her move speed.
  arc_run: {
    duration: 0.66,
    pose(P, t) {
      const TAU = Math.PI * 2;
      const ph = t / 0.66;
      P.reset(BASE, true);
      const side = () => P.axis('Hip', RIGHT);
      // hips: a small twist with the stride, a slight forward lean through the body
      P.rot('Hip', UP, 6 * Math.sin(TAU * ph));
      P.rot('Waist', side(), -9);
      P.rot('Spine01', UP, -9 * Math.sin(TAU * ph)); // shoulders turn against the hips
      P.rot('NeckTwist01', UP, 3 * Math.sin(TAU * ph));
      P.rot('NeckTwist01', side(), 6);
      for (const [s, off] of [['L', 0], ['R', 0.5]]) {
        const a = TAU * (ph + off);
        const thigh = 8 + 34 * Math.sin(a); // forward at the reach, back at the push-off
        const knee = 14 + 92 * Math.pow(Math.max(0, Math.cos(a - 0.35)), 1.6); // folds as the leg swings through
        const ax = side();
        P.rot(`${s}_Thigh`, ax, thigh);
        P.rot(`${s}_Calf`, ax, -knee);
        P.rot(`${s}_Foot`, ax, -0.45 * (thigh - knee) - 12 * Math.max(0, -Math.sin(a)));
      }
      // feet to the ground, then a little lift in the stride's flight
      P.ground(0.012 * Math.max(0, Math.sin(2 * TAU * ph - 0.6)));
      // bow hand low and forward, the free arm swinging opposite the left leg
      const sw = Math.sin(TAU * ph);
      P.reach('L', P.at('Spine02', [0.15 + 0.02 * sw, -0.2, -0.13]), P.at('Spine02', [-0.05, -0.15, -0.3]));
      P.reach('R', P.at('Spine02', [0.03 - 0.13 * sw, -0.16 + 0.04 * Math.abs(sw), 0.15]), P.at('Spine02', [-0.2, -0.2, 0.2]));
    },
  },
  // Basic attack, one full cycle, played over the time between shots: draw, loose (the game
  // fires the arrow 30% of the way in), reach back to the quiver, nock, start the next draw.
  arc_shot: {
    duration: 1.0,
    pose(P, t) {
      stance(P, { yaw: 62, crouch: 0.012 });
      const bow = bowArm(P, 0);
      const k = curve([[0, 0.14], [0.3, FULL], [0.34, SNAP], [0.52, SNAP], [0.74, NOCK], [1, 0.14]], t);
      const q = curve([[0.34, 0], [0.52, 1], [0.68, 0]], t);
      drawArm(P, bow, k, q);
    },
  },
  // Piercing Shot: a deep draw leaning back, a hard release that rocks her back a step.
  arc_power: {
    duration: 0.9,
    pose(P, t) {
      const lean = curve([[0, 6], [0.08, 14], [0.4, 4], [0.9, 0]], t);
      const step = curve([[0, 0], [0.1, -0.04], [0.5, -0.02], [0.9, 0]], t);
      stance(P, { yaw: 72, lean, crouch: curve([[0, 0.035], [0.15, 0.02], [0.9, 0.01]], t), step });
      const bow = bowArm(P, curve([[0, 2], [0.1, 8], [0.6, 0]], t));
      const k = curve([[0, 0.3], [0.05, 0.38], [0.35, 0.36], [0.65, NOCK], [0.9, NOCK]], t);
      drawArm(P, bow, k, curve([[0.3, 0], [0.48, 0.7], [0.62, 0]], t));
    },
  },
  // Barrage: five arrows, 0.09 s apart: short pulls and snaps, crouched and leaning in.
  arc_barrage: {
    duration: 0.85,
    pose(P, t) {
      stance(P, { yaw: 66, lean: -6, crouch: 0.03 });
      const bow = bowArm(P, 1);
      const keys = [];
      for (let i = 0; i < 5; i++) {
        const t0 = i * 0.09;
        keys.push([t0, FULL - 0.04], [t0 + 0.035, SNAP], [t0 + 0.07, 0.17]);
      }
      keys.push([0.46, SNAP], [0.65, NOCK], [0.85, NOCK]);
      drawArm(P, bow, curve(keys, t));
    },
  },
  // Arrow Storm: aim high, loose, watch it fall.
  arc_volley: {
    duration: 1.0,
    pose(P, t) {
      stance(P, { yaw: 58, lean: curve([[0, 12], [0.1, 16], [0.6, 6], [1, 0]], t), crouch: 0.02 });
      const bow = bowArm(P, curve([[0, 52], [0.1, 56], [0.5, 40], [1, 8]], t));
      drawArm(P, bow, curve([[0, FULL], [0.06, SNAP], [0.35, 0.3], [0.7, NOCK], [1, NOCK]], t));
    },
  },
  // Evasive Roll: a forward roll, low and tucked, bow held close, back on her feet.
  arc_roll: {
    duration: 0.55,
    pose(P, t) {
      P.reset(BASE, true);
      const tuck = curve([[0, 0], [0.07, 1], [0.32, 1], [0.48, 0]], t);
      const spin = curve([[0, 0], [0.05, -25], [0.36, -360]], t);
      const drop = curve([[0, 0], [0.06, 0.2], [0.3, 0.24], [0.46, 0.03], [0.55, 0]], t);
      P.hips([curve([[0, 0], [0.3, 0.06], [0.55, 0]], t), -drop, 0]);
      P.rot('Hip', RIGHT, spin);
      const side = P.axis('Hip', RIGHT);
      // curl the back and head, pull the knees in
      P.rot('Waist', side, -30 * tuck).rot('Spine01', side, -25 * tuck).rot('NeckTwist01', side, -30 * tuck);
      for (const s of ['L', 'R']) {
        P.rot(`${s}_Thigh`, side, 105 * tuck);
        P.rot(`${s}_Calf`, side, -125 * tuck);
      }
      // arms in front of the chest, bow hugged
      const w = tuck;
      if (w > 0.01) {
        const chest = (f, u, r) => P.at('Spine02', [f, u, r]);
        P.reach('L', P.pos('L_Hand').lerp(chest(0.16, -0.02, -0.04), w), chest(-0.05, -0.12, -0.2));
        P.reach('R', P.pos('R_Hand').lerp(chest(0.15, 0.0, 0.05), w), chest(-0.05, -0.12, 0.2));
      }
    },
  },
  // Falling: hit, a stagger back, the knees go and she drops onto her back.
  arc_death: {
    duration: 1.5,
    pose(P, t) {
      P.reset(BASE, true);
      const back = curve([[0, 0], [0.18, 12], [0.55, 20], [0.95, 82], [1.15, 90], [1.5, 90]], t);
      const drop = curve([[0, 0], [0.2, 0.02], [0.6, 0.2], [0.95, 0.43], [1.12, 0.47], [1.5, 0.47]], t);
      P.hips([curve([[0, 0], [0.3, -0.08], [1.0, -0.14], [1.5, -0.14]], t), -drop, 0]);
      P.rot('Hip', RIGHT, back); // tips over backwards
      P.rot('Hip', P.axis('Hip', FWD), curve([[0, 0], [0.6, 6], [1.2, 12]], t)); // a little to one side
      const side = P.axis('Hip', RIGHT);
      const knees = curve([[0, 0], [0.25, 10], [0.6, 55], [0.95, 40], [1.2, 18], [1.5, 15]], t);
      for (const [s, f] of [['L', 1], ['R', 0.7]]) {
        P.rot(`${s}_Thigh`, side, knees * f);
        P.rot(`${s}_Calf`, side, -knees * 1.6 * f);
      }
      P.rot('Waist', side, curve([[0, 0], [0.2, 8], [0.7, -8], [1.2, 4]], t));
      P.rot('NeckTwist01', side, curve([[0, 0], [0.15, 18], [0.6, -12], [1.15, 10], [1.5, 6]], t));
      // arms fling out and flop down
      const fl = curve([[0, 0], [0.2, 0.6], [0.9, 1], [1.5, 1]], t);
      const spine = (f, u, r) => P.at('Spine02', [f, u, r]);
      P.reach('L', P.pos('L_Hand').lerp(spine(0.05, 0.1, -0.33), fl), spine(-0.1, 0, -0.2));
      P.reach('R', P.pos('R_Hand').lerp(spine(0.08, 0.06, 0.32), fl), spine(-0.1, 0, 0.2));
    },
  },
};
