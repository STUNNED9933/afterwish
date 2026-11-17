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
import { BASE, runCycle, forwardFall, wideStance } from './common-moves.js';

const TAU = Math.PI * 2;
const flat = (v) => {
  v.y = 0;
  return v.normalize();
};

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
function arms(P, elev, kick = 0) {
  const sh = P.pos('L_Upperarm');
  const e = (elev * Math.PI) / 180;
  const dir = FWD.clone().multiplyScalar(Math.cos(e)).addScaledVector(UP, Math.sin(e));
  const chest = flat(P.axis('Spine02', FWD)); // the way her chest faces (sideways to the target)
  // kick: the bow hand jumps forward and dips as the string is let go (a moment after the release)
  const bowT = sh.clone().addScaledVector(dir, (0.255 - 0.012 * kick) * P.H).addScaledVector(UP, (0.012 - 0.022 * kick) * P.H).addScaledVector(chest, -0.015 * kick * P.H);
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

/** A skill drawn for a second and loosed (0.51): an arrow from the quiver, nocked, drawn, held, loosed at 1 s. */
function aimed({ elev, lean, yaw = 66 }) {
  return {
    duration: 1.45,
    pose(P, t) {
      wideStance(P, { yaw, spread: 1.05, crouch: curve([[0, 0.03], [0.7, 0.05], [1.0, 0.055], [1.45, 0.045]], t), lean: curve(lean, t) });
      const kick = t < 1 ? 0 : curve([[1.0, 0], [1.04, 1], [1.2, 0.3], [1.35, 0]], t);
      const A = arms(P, curve(elev, t), kick);
      drawHand(P, A, [[0, 0], [0.1, 'side'], [0.2, 'over'], [0.3, 'quiver'], [0.4, 'side'], [0.5, 'front'], [0.56, 0], [0.76, 1], [0.99, 1], [1.04, 1.25], [1.45, 1.22]], t);
    },
  };
}

export const ARCHER_MOVES = {
  // Her run (common-moves.js): quick and urgent, the free arm swinging freely, the bow arm less,
  // later and out from her leg (it is carrying something).
  arc_run: runCycle({ arms: [['R', 1, 38, 88, 0.12, 0.45, 0.6], ['L', -1, 21, 72, 0.3, 0.8, 2.1]] }),
  // Basic attack, one full cycle played over the time between shots, from a kneel: draw to the
  // chin and loose (the game fires the arrow 30% of the way in), reach over the shoulder for the
  // next arrow, bring it round in front to the bow, nock, start the next draw.
  arc_shot: {
    duration: 1.0,
    pose(P, t) {
      // the body rocks with the release a little after the hand lets go, and settles
      kneel(P, { yaw: 74 + curve([[0.3, 0], [0.4, 3], [0.7, 0]], t), lean: -4 + curve([[0.3, 0], [0.38, 4], [0.6, -1], [0.8, 0]], t) });
      P.rot('NeckTwist01', P.axis('Spine02', RIGHT), curve([[0.32, 0], [0.42, 4], [0.7, 0]], t));
      const A = arms(P, 0, curve([[0.3, 0], [0.35, 1], [0.5, 0.2], [0.7, 0]], t));
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
      const A = arms(P, curve([[0, 2], [0.1, 7], [0.6, 0]], t), curve([[0.02, 0], [0.08, 1.4], [0.3, 0.3], [0.5, 0]], t));
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
  // Arrow Storm (0.50; 0.51: a full second's channel): her own draw before the release, so the shot leaves
  // when the game fires it. Over her shoulder for an arrow, nocked, drawn to full aimed high at the sky, held
  // still at full draw, and loosed at 1 s (classes.js channel); then the follow-through is held, still,
  // until the clip fades into her idle (no reaching about after the arrow has gone).
  arc_storm: aimed({ elev: [[0, 18], [0.4, 38], [0.7, 58], [1.0, 62], [1.15, 60], [1.45, 54]], lean: [[0, 4], [0.5, 16], [1.0, 20], [1.12, 15], [1.45, 12]] }),
  // Deadeye (0.51): the same draw, aimed level down the line, held a second and loosed.
  arc_deadeye: aimed({ elev: [[0, 4], [0.5, 6], [1.0, 5], [1.45, 4]], lean: [[0, 2], [0.6, 7], [1.0, 8], [1.12, 4], [1.45, 3]], yaw: 74 }),
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
  // Falling (common-moves.js): staggered knees, forward, hands out to catch herself.
  arc_death: forwardFall,
};
