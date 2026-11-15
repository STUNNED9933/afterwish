// The Archer's own animations (0.37), posed in code with author.js: her run, shots, the skills, a
// roll and a fall. The bow is not part of the clips: the game holds it in her left hand and pulls
// its string to her right hand when that hand is drawn back behind it (see rigged.js).
// Distances are in heights of the model; angles in degrees.
//
// 0.37.1: shots from a kneel (right knee down, left foot forward, so nothing is in the bow's
// way), skills from a wide, low stance; the drawing hand travels outside the body (over the
// shoulder to the quiver, round in front of the chest to the bow, back to the chin along the
// arrow); a quicker, more urgent run; a fall forward, hands out to catch herself.
import { FWD, UP, RIGHT, curve } from './author.js';

const BASE = ['idle', 1.0]; // her own idle, for anything not posed here
const TAU = Math.PI * 2;
const flat = (v) => {
  v.y = 0;
  return v.normalize();
};

/** A wide, low standing stance: front (left) foot toward the target, back foot turned out. */
function wideStance(P, { yaw = 70, spread = 1, crouch = 0.04, lean = 0, step = 0 } = {}) {
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

/** Kneeling: right knee on the ground, left foot planted forward toward the target. */
function kneel(P, { yaw = 72, lean = -4 } = {}) {
  P.reset(BASE, true);
  P.rot('Hip', UP, -yaw * 0.55);
  const len = (a, b) => P.pos(a).distanceTo(P.pos(b));
  const thigh = len('L_Thigh', 'L_Calf'), shin = len('L_Calf', 'L_Foot');
  const footY = P.pos('L_Foot').y;
  const kneeY = 0.035 * P.H;
  // hips over the kneeling knee, thigh upright
  const hipY = kneeY + thigh * 0.97;
  P.hips([0, (hipY - P.pos('Hip').y) / P.H, 0]);
  const hf = P.axis('Hip', FWD), hr = P.axis('Hip', RIGHT);
  const front = flat(hf.clone().add(FWD)); // the front knee points between the hips and the target
  // left (front) leg: thigh forward and a little down, shin straight down to the planted foot
  const lKneeY = footY + shin;
  const tilt = Math.asin(Math.max(-0.9, Math.min(0.9, (P.pos('L_Thigh').y - lKneeY) / thigh)));
  P.aim('L_Thigh', 'L_Calf', front.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(UP, -Math.sin(tilt)).addScaledVector(hr, -0.12));
  P.aim('L_Calf', 'L_Foot', UP.clone().negate().addScaledVector(front, 0.08));
  P.aim('L_Foot', 'L_ToeBase', front.clone().addScaledVector(UP, -0.15));
  // right (back) leg: knee on the ground under the hip, shin back along the ground, toes tucked
  P.aim('R_Thigh', 'R_Calf', UP.clone().negate().addScaledVector(front, -0.18).addScaledVector(hr, 0.12));
  P.aim('R_Calf', 'R_Foot', front.clone().negate().addScaledVector(UP, 0.12));
  P.aim('R_Foot', 'R_ToeBase', UP.clone().negate().addScaledVector(front, -0.4));
  P.rot('Spine01', UP, -yaw * 0.45);
  if (lean) P.rot('Waist', P.axis('Waist', RIGHT), lean);
  P.rot('NeckTwist01', UP, yaw * 0.6);
  P.rot('Head', UP, yaw * 0.4);
}

/**
 * The arms. The bow arm reaches straight at the target (raised by elev). The arrow runs from the
 * bow hand back to her chin; the drawing hand is placed by a key: a number is how far along the
 * arrow from the bow (0) to the chin (1, a full draw; past 1, the hand flicking back after the
 * release), 'quiver' is over her right shoulder, 'front' is round in front of her chest.
 */
function arms(P, elev) {
  const sh = P.pos('L_Upperarm');
  const e = (elev * Math.PI) / 180;
  const dir = FWD.clone().multiplyScalar(Math.cos(e)).addScaledVector(UP, Math.sin(e));
  const chest = flat(P.axis('Spine02', FWD)); // the way her chest faces (sideways to the target)
  const bowT = sh.clone().addScaledVector(dir, 0.255 * P.H).addScaledVector(UP, 0.012 * P.H);
  P.reach('L', bowT, sh.clone().addScaledVector(UP, -0.12 * P.H).addScaledVector(chest, -0.16 * P.H));
  // anchor at the side of the jaw, on the cheek that faces out, clear of the face
  const chin = P.pos('Head').addScaledVector(dir, 0.02 * P.H).addScaledVector(chest, 0.08 * P.H).addScaledVector(UP, -0.02 * P.H);
  const nock = bowT.clone().addScaledVector(dir, -0.035 * P.H).addScaledVector(chest, 0.02 * P.H);
  const along = (k) => {
    if (k <= 1) return nock.clone().lerp(chin, k);
    const back = chin.clone().sub(nock).normalize();
    return chin.clone().addScaledVector(back, (k - 1) * 0.28 * P.H).addScaledVector(chest, (k - 1) * 0.12 * P.H);
  };
  // the way round her head and shoulder (waypoints in her chest's frame: forward, up, her right)
  const WAY = { quiver: [-0.09, 0.2, 0.12], over: [0.02, 0.17, 0.21], side: [0.08, 0.06, 0.19], front: [0.22, 0.04, 0.03] };
  const point = (a) => (WAY[a] ? P.at('Spine02', WAY[a]) : along(a));
  const rs = P.pos('R_Upperarm');
  // elbow: high and back behind the arrow while drawing, up and out when reaching for the quiver
  const drawPole = rs.clone().addScaledVector(dir, -0.3 * P.H).addScaledVector(UP, 0.04 * P.H).addScaledVector(chest, 0.1 * P.H);
  const reachPole = rs.clone().addScaledVector(UP, 0.12 * P.H).addScaledVector(chest, 0.2 * P.H);
  return { point, drawPole, reachPole };
}

/** Move the drawing hand along a path of keys [[t, at], ...] (smooth between neighbours). */
function drawHand(P, A, keys, t) {
  let i = 1;
  while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [t0, a0] = keys[i - 1], [t1, a1] = keys[i];
  const k = t <= t0 ? 0 : t >= t1 ? 1 : (t - t0) / (t1 - t0);
  const s = k * k * (3 - 2 * k);
  const target = A.point(a0).lerp(A.point(a1), s);
  const reaching = (a) => ({ quiver: 1, over: 1, side: 0.7, front: 0.4 })[a] || 0;
  const pole = A.drawPole.clone().lerp(A.reachPole, reaching(a0) * (1 - s) + reaching(a1) * s);
  P.reach('R', target, pole);
}

export const ARCHER_MOVES = {
  // Her run: quick and urgent, leaning into it, knees driving, the free arm pumping hard and the
  // bow carried low. One loop is two strides; the game plays it faster or slower with her speed.
  arc_run: {
    duration: 0.56,
    pose(P, t) {
      const ph = t / 0.56;
      P.reset(BASE, true);
      const side = () => P.axis('Hip', RIGHT);
      P.rot('Hip', UP, 8 * Math.sin(TAU * ph));
      P.rot('Hip', side(), -5); // pelvis tipped into the run
      P.rot('Waist', side(), -10);
      P.rot('Spine01', side(), -5);
      P.rot('Spine01', UP, -13 * Math.sin(TAU * ph)); // shoulders against the hips
      P.rot('NeckTwist01', UP, 5 * Math.sin(TAU * ph));
      P.rot('NeckTwist01', side(), 12); // eyes up, ahead
      for (const [s, off] of [['L', 0], ['R', 0.5]]) {
        const a = TAU * (ph + off);
        const thigh = 14 + 42 * Math.sin(a); // driven forward, pushed far back
        const knee = 18 + 108 * Math.pow(Math.max(0, Math.cos(a - 0.4)), 1.4); // heel kicks up behind
        const ax = side();
        P.rot(`${s}_Thigh`, ax, thigh);
        P.rot(`${s}_Calf`, ax, -knee);
        P.rot(`${s}_Foot`, ax, -0.45 * (thigh - knee) - 18 * Math.max(0, -Math.sin(a)));
      }
      P.ground(0.022 * Math.max(0, Math.sin(2 * TAU * ph - 0.6)));
      // Arms swing from the shoulder with the elbows held bent, a beat behind the legs, the
      // hand crossing a little toward the middle as it comes forward (not pushed back and forth
      // along a line, which read as a march). The bow arm swings less and stays out from the leg.
      const across = P.axis('Spine02', RIGHT), ahead = P.axis('Spine02', FWD), down = P.axis('Spine02', UP).negate();
      for (const [s, sign, amp, flex, out] of [['R', 1, 38, 88, 0.12], ['L', -1, 22, 72, 0.3]]) {
        const a = TAU * ph * sign + (sign > 0 ? 0 : Math.PI) - 0.45; // opposite the same-side leg, lagging
        const swing = amp * Math.sin(a);
        const outward = sign > 0 ? across : across.clone().negate();
        P.aim(`${s}_Upperarm`, `${s}_Forearm`, down.clone().addScaledVector(outward, out));
        P.rot(`${s}_Upperarm`, across, swing); // forward and back
        P.rot(`${s}_Upperarm`, ahead, -sign * Math.max(0, swing) * 0.25); // in toward the middle as it comes forward
        P.rot(`${s}_Clavicle`, across, swing * 0.15);
        P.rot(`${s}_Forearm`, across, flex + 18 * Math.max(0, Math.sin(a))); // bends more on the way up
      }
    },
  },
  // Basic attack, one full cycle played over the time between shots, from a kneel: draw to the
  // chin and loose (the game fires the arrow 30% of the way in), reach over the shoulder for the
  // next arrow, bring it round in front to the bow, nock, start the next draw.
  arc_shot: {
    duration: 1.0,
    pose(P, t) {
      kneel(P, { yaw: 74 });
      const A = arms(P, 0);
      drawHand(P, A, [[0, 0.4], [0.3, 1], [0.35, 1.25], [0.43, 'over'], [0.52, 'quiver'], [0.6, 'side'], [0.68, 'front'], [0.8, 0], [1, 0.4]], t);
    },
  },
  // Piercing Shot: a wide, low stance, a deep draw, and a release that drives her back a step.
  arc_power: {
    duration: 0.9,
    pose(P, t) {
      wideStance(P, {
        yaw: 78,
        spread: 1.15,
        crouch: curve([[0, 0.06], [0.12, 0.045], [0.9, 0.03]], t),
        lean: curve([[0, 4], [0.08, 12], [0.45, 3], [0.9, 0]], t),
        step: curve([[0, 0], [0.1, -0.045], [0.5, -0.02], [0.9, 0]], t),
      });
      const A = arms(P, curve([[0, 2], [0.1, 7], [0.6, 0]], t));
      drawHand(P, A, [[0, 1.08], [0.05, 1.35], [0.32, 1.3], [0.42, 'over'], [0.52, 'quiver'], [0.6, 'side'], [0.7, 'front'], [0.82, 0], [0.9, 0]], t);
    },
  },
  // Barrage: five arrows 0.09 s apart from the kneel: short, hard pulls and snaps.
  arc_barrage: {
    duration: 0.85,
    pose(P, t) {
      kneel(P, { yaw: 74, lean: -7 });
      const A = arms(P, 1);
      const keys = [];
      for (let i = 0; i < 5; i++) {
        const t0 = i * 0.09;
        keys.push([t0, 0.92], [t0 + 0.035, 1.22], [t0 + 0.07, 0.6]);
      }
      keys.push([0.46, 1.25], [0.56, 'side'], [0.66, 'front'], [0.76, 0], [0.85, 0]);
      drawHand(P, A, keys, t);
    },
  },
  // Arrow Storm: a wide stance, aimed high, loosed, the bow brought down after it.
  arc_volley: {
    duration: 1.0,
    pose(P, t) {
      wideStance(P, { yaw: 66, spread: 1.05, crouch: 0.045, lean: curve([[0, 14], [0.1, 18], [0.6, 7], [1, 0]], t) });
      const A = arms(P, curve([[0, 52], [0.1, 56], [0.5, 40], [1, 8]], t));
      drawHand(P, A, [[0, 1], [0.06, 1.25], [0.32, 1.2], [0.42, 'over'], [0.52, 'quiver'], [0.62, 'side'], [0.72, 'front'], [0.86, 0], [1, 0]], t);
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
  // Falling: the blow rocks her back, her knees give, she pitches forward and throws her hands
  // out to catch herself, the arms fold under her and she goes down on her front, head turned.
  arc_death: {
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
  },
};
