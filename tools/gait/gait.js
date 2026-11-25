// A procedural walk written straight onto the Tripo hero skeleton.
// The feet are placed first (a planted foot stays put on the ground as the body passes over it: heel strike,
// flat foot, roll onto the ball, toe-off, then an arcing swing to the next heel strike), and the legs reach them
// by two-bone IK. The pelvis turns, tilts and bobs, the chest turns against it, and the arms swing against the
// legs. Two styles: 'm' (wider base, bigger arm and shoulder swing, weight in the step) and 'f' (feet near one
// line, more hip turn and sway, arms closer in, lighter step). Timed so the feet hold the ground at `speed`.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const D2R = Math.PI / 180;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const R = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * D2R);
const mul = (...qs) => qs.reduce((a, b) => a.multiply(b), new THREE.Quaternion());
const frac = (t) => ((t % 1) + 1) % 1;

// periodic cubic (Catmull-Rom) through [phase 0..1, value] keys
function curve(keys) {
  const k = keys.slice().sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const at = (m) => { const q = ((m % n) + n) % n; return [k[q][0] + Math.floor(m / n), k[q][1]]; };
  return (t) => {
    t = frac(t);
    let i = -1;
    for (let j = 0; j < n; j++) if (k[j][0] <= t) i = j;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const h = p2[0] - p1[0];
    const u = (t - p1[0]) / h;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * h, m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
}

export const STYLES = {
  // lengths in metres (game), angles in degrees
  m: { cadence: 124, under: 0.18, toeOff: 0.62, width: 0.085, toeOut: 7, lift: 0.07, heelUp: 10, toeOffPitch: -44, reach: 0.995, settle: 0.0, envW: 0.03, smW: 0.05, bob: 0.028, sway: 0.014,
    pYaw: 4.5, pRoll: 3, chestYaw: 7, lean: 6, arm: 20, armMid: -4, elbow: 14, elbowGain: 0.6, armAbd: 10, mid: 0.012, twist: 80 },
  f: { cadence: 134, under: 0.18, toeOff: 0.61, width: 0.05, toeOut: 4, lift: 0.06, heelUp: 9, toeOffPitch: -42, reach: 0.995, settle: 0.0, envW: 0.03, smW: 0.05, bob: 0.022, sway: 0.022,
    pYaw: 7, pRoll: 5.5, chestYaw: 4, lean: 4, arm: 14, armMid: -3, elbow: 18, elbowGain: 0.45, armAbd: 5, mid: 0.0, twist: 80 },
};

const ARMS = { L_Upperarm: 'L_Forearm', R_Upperarm: 'R_Forearm', L_Forearm: 'L_Hand', R_Forearm: 'R_Hand' };
const LEGS = { L_Thigh: 'L_Calf', R_Thigh: 'R_Calf', L_Calf: 'L_Foot', R_Calf: 'R_Foot', L_Foot: 'L_ToeBase', R_Foot: 'R_ToeBase' };

// rotation taking the canonical frame (down = -Y, forward = +X) onto (down, fwd)
function frame(down, fwd) {
  const d = down.clone().normalize();
  const f = fwd.clone().sub(d.clone().multiplyScalar(fwd.dot(d))).normalize();
  const s = new THREE.Vector3().crossVectors(f, d.clone().negate()); // X x Y = Z
  const m = new THREE.Matrix4().makeBasis(f, d.clone().negate(), s);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

window.gait = async (targetUrl, styleName, height = 2.0, speed = 2.0, fps = 30, over = {}) => {
  const P = { ...STYLES[styleName], ...over };
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const G = await l.loadAsync(targetUrl); const T = G.scene; T.updateMatrixWorld(true);
  const bones = []; T.traverse((o) => { if (o.isBone) bones.push(o); });
  const byName = (n) => T.getObjectByName(n);
  const wp = (n) => byName(n).getWorldPosition(new THREE.Vector3());
  const Tref = new Map(), restLocal = new Map();
  const restPos = new Map();
  for (const b of bones) { Tref.set(b.name, b.getWorldQuaternion(new THREE.Quaternion())); restLocal.set(b.name, b.quaternion.clone()); restPos.set(b.name, b.position.clone()); }
  const AXIS = new Map(); // each arm bone's length direction in its own frame
  for (const sd of ['L_', 'R_']) for (const [b, c] of [['Upperarm', 'Forearm'], ['Forearm', 'Hand']]) {
    const d = wp(sd + c).sub(wp(sd + b)).applyQuaternion(Tref.get(sd + b).clone().invert()).normalize(); AXIS.set(sd + b, d);
  }
  // the arms hang as in the hero's own idle (each model's hands, wrists and elbows sit right there); the walk swings them
  const IDLE = {};
  const ARMCHAIN = ['Clavicle', 'Upperarm', 'UpperarmTwist01', 'UpperarmTwist02', 'Forearm', 'ForearmTwist01', 'ForearmTwist02', 'Hand'];
  {
    const idle = G.animations.find((c) => c.name === 'idle');
    const mx = new THREE.AnimationMixer(T); mx.clipAction(idle).play(); mx.setTime(0); T.updateMatrixWorld(true);
    const chestI = T.getObjectByName('Spine02').getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const sd of ['L_', 'R_']) for (const k of ARMCHAIN) { const b = T.getObjectByName(sd + k); if (b) IDLE[sd + k] = chestI.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())); }
    const P3 = (n) => T.getObjectByName(n).getWorldPosition(new THREE.Vector3());
    IDLE.elbow = P3('L_Forearm').sub(P3('L_Upperarm')).angleTo(P3('L_Hand').sub(P3('L_Forearm'))) / D2R;
    mx.stopAllAction(); mx.uncacheRoot(T);
    for (const b of bones) { b.quaternion.copy(restLocal.get(b.name)); b.position.copy(restPos.get(b.name)); }
    T.updateMatrixWorld(true);
  }
  const unit = height / new THREE.Box3().setFromObject(T).getSize(new THREE.Vector3()).y; // metres per model unit
  const M = (m) => m / unit; // metres -> model units
  // canonical rest: arms out level, legs straight down, feet level and forward (a little toe-out)
  const C = new Map();
  for (const [tb, tc] of Object.entries({ ...ARMS, ...LEGS })) {
    const dt = wp(tc).sub(wp(tb)).normalize();
    const left = tb.startsWith('L_');
    let ds;
    if (ARMS[tb]) ds = new THREE.Vector3(0, 0, left ? -1 : 1);
    else if (/Thigh|Calf/.test(tb)) ds = new THREE.Vector3(0, -1, 0);
    else { const a = P.toeOut * D2R, h = Math.hypot(dt.x, dt.z); ds = new THREE.Vector3(h * Math.cos(a), dt.y, (left ? -1 : 1) * h * Math.sin(a)).normalize(); }
    C.set(tb, new THREE.Quaternion().setFromUnitVectors(dt, ds));
  }
  // the pelvis is squared up (some binds stand with one hip higher or ahead of the other)
  C.set('Hip', new THREE.Quaternion().setFromUnitVectors(wp('R_Thigh').sub(wp('L_Thigh')).normalize(), new THREE.Vector3(0, 0, 1)));
  // the walk centres on the feet's rest spot, not the hips' (a bind that leans puts the hips well ahead of the feet)
  const X0 = (wp('L_Foot').x + wp('R_Foot').x) / 2, Z0 = (wp('L_Thigh').z + wp('R_Thigh').z) / 2;
  // hands and toes keep their rest set against the forearm / foot
  for (const sd of ['L_', 'R_']) { for (const k of ['Hand', 'ForearmTwist01', 'ForearmTwist02']) C.set(sd + k, C.get(sd + 'Forearm')); C.set(sd + 'ToeBase', C.get(sd + 'Foot')); }
  // leg geometry
  const L1 = wp('L_Calf').distanceTo(wp('L_Thigh')), L2 = wp('L_Foot').distanceTo(wp('L_Calf'));
  const ground = new THREE.Box3().setFromObject(T).min.y;
  const ankleH = Math.max(M(0.05), wp('L_Foot').y - ground);
  const HEEL = new THREE.Vector2(-M(0.055), -ankleH), BALL = new THREE.Vector2(M(0.13), -ankleH); // contact points from the ankle, foot flat
  const hip = byName('Hip');
  const hipRest = hip.position.clone(), hipRefPos = wp('Hip');
  const hipParentInv = new THREE.Matrix4().copy(hip.parent.matrixWorld).invert();

  const dur = 120 / P.cadence; // one cycle = two steps
  const v = M(speed) * dur; // model units the body travels per cycle (phase 0..1)
  const to = P.toeOff;
  // foot pitch (+ toes up), phase 0 = this foot's heel strike
  const pitch = curve([[0, P.heelUp], [0.06, 3], [0.1, 0], [0.38, 0], [0.48, -7], [to, P.toeOffPitch], [to + 0.08, -18], [to + 0.2, 0], [0.92, P.heelUp * 0.8], [0.97, P.heelUp]]);
  const pitchStance = (ph) => (ph < 0.1 ? P.heelUp * Math.pow(1 - ph / 0.1, 2) : ph < 0.4 ? 0 : P.toeOffPitch * Math.pow((ph - 0.4) / (to - 0.4), 1.6));
  const footPitch = (ph) => (ph <= to ? pitchStance(ph) : pitch(ph));
  const rot2 = (p, deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return new THREE.Vector2(p.x * c - p.y * s, p.x * s + p.y * c); };
  // in the body's frame (hips at x = 0) the planted contact point slides back at the walking speed
  const heelX0 = -HEEL.x + P.under * v + M(P.mid); // flat-foot ankle passes under the hip near mid-stance
  const stanceAnkle = (ph) => {
    const th = pitchStance(ph);
    const contactX = heelX0 - v * ph; // where the heel would be if the foot were flat
    // pivot: heel while toes are up, ball once the heel lifts; flat in between
    const piv = th >= 0 ? HEEL : BALL;
    const pivX = contactX + (piv.x - HEEL.x);
    const off = rot2(piv, th);
    return new THREE.Vector2(X0 + pivX - off.x, ground - off.y);
  };
  const A_to = stanceAnkle(to), A_hs = stanceAnkle(0);
  const smooth = (u) => u * u * u * (u * (6 * u - 15) + 10);
  const ankleAt = (ph) => {
    if (ph <= to) return stanceAnkle(ph);
    const u = (ph - to) / (1 - to), s = smooth(u);
    const x = A_to.x + (A_hs.x - A_to.x) * smooth(Math.pow(u, 0.8));
    const y = A_to.y + (A_hs.y - A_to.y) * s + M(P.lift) * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 1.3);
    return new THREE.Vector2(x, y);
  };

  const torso = (t) => {
    const c = Math.cos(2 * Math.PI * t), s = Math.sin(2 * Math.PI * t);
    const pelvis = mul(R(Y, P.pYaw * c), R(X, -P.pRoll * s), R(Z, -P.lean * 0.3));
    const W = {
      Hip: pelvis,
      Waist: mul(R(Y, P.pYaw * c * 0.35), R(X, -P.pRoll * s * 0.4), R(Z, -P.lean * 0.6)),
      Spine01: mul(R(Y, -P.chestYaw * c * 0.4), R(X, P.pRoll * s * 0.15), R(Z, -P.lean * 0.85)),
      Spine02: mul(R(Y, -P.chestYaw * c), R(X, P.pRoll * s * 0.3), R(Z, -P.lean)),
      Head: R(Y, P.chestYaw * c * 0.1),
    };
    const chestW = W.Spine02.clone().multiply(Tref.get('Spine02'));
    W.__abs = {};
    for (const [side, ph] of [['R', t], ['L', t + 0.5]]) {
      const swing = P.armMid - P.arm * Math.cos(2 * Math.PI * ph); // the right arm is back as the right heel strikes
      const S = R(Z, swing);
      const at = (k) => (IDLE[side + k] ? S.clone().multiply(chestW).multiply(IDLE[side + k]) : null);
      W.__abs[side + '_Clavicle'] = chestW.clone().multiply(IDLE[side + '_Clavicle']);
      const upper = at('_Upperarm');
      const fore0 = at('_Forearm');
      const ud = AXIS.get(side + '_Upperarm').clone().applyQuaternion(upper), fd = AXIS.get(side + '_Forearm').clone().applyQuaternion(fore0);
      const ax = new THREE.Vector3().crossVectors(ud, fd);
      const E = ax.lengthSq() > 1e-8 ? new THREE.Quaternion().setFromAxisAngle(ax.normalize(), (P.elbow - IDLE.elbow + P.elbowGain * Math.max(0, swing)) * D2R) : new THREE.Quaternion();
      for (const k of ['_Upperarm', '_UpperarmTwist01', '_UpperarmTwist02']) if (IDLE[side + k]) W.__abs[side + k] = at(k);
      for (const k of ['_Forearm', '_ForearmTwist01', '_ForearmTwist02', '_Hand']) if (IDLE[side + k]) W.__abs[side + k] = E.clone().multiply(at(k));
    }
    return W;
  };
  const write = (W, dy, dz) => {
    for (const b of bones) b.quaternion.copy(restLocal.get(b.name));
    hip.position.copy(hipRefPos.clone().add(new THREE.Vector3(X0 - hipRefPos.x, dy, dz)).applyMatrix4(hipParentInv));
    T.updateMatrixWorld(true);
    const world = new Map();
    for (const b of bones) {
      const pw = world.get(b.parent && b.parent.name) || b.parent.getWorldQuaternion(new THREE.Quaternion());
      const w = W.__abs && W.__abs[b.name] ? W.__abs[b.name].clone() : W[b.name] ? W[b.name].clone().multiply(C.get(b.name) || new THREE.Quaternion()).multiply(Tref.get(b.name)) : pw.clone().multiply(restLocal.get(b.name));
      b.quaternion.copy(pw.clone().invert().multiply(w));
      world.set(b.name, w);
    }
    T.updateMatrixWorld(true);
  };
  const legs = (t, W, dz, report) => {
    for (const [side, ph0, sgn] of [['R', t, 1], ['L', t + 0.5, -1]]) {
      const ph = frac(ph0);
      const Hj = wp(side + '_Thigh');
      const a2 = ankleAt(ph);
      // a planted foot stays put across the ground while the hips sway over it
      const A = new THREE.Vector3(a2.x, a2.y, Z0 + sgn * M(P.width)); // the hips sway over a planted foot; it stays put
      let d = A.clone().sub(Hj); let dist = d.length();
      const reach = (L1 + L2) * 0.999;
      if (report) report.push(dist / (L1 + L2));
      if (dist > reach) { d.multiplyScalar(reach / dist); dist = reach; }
      const u = d.clone().normalize();
      const alpha = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))));
      const fw = new THREE.Vector3(Math.cos(P.toeOut * 0.5 * D2R), 0, sgn * Math.sin(P.toeOut * 0.5 * D2R)); // knees track the feet
      const kf = fw.clone().sub(u.clone().multiplyScalar(fw.dot(u))).normalize();
      const thighDir = u.clone().multiplyScalar(Math.cos(alpha)).add(kf.clone().multiplyScalar(Math.sin(alpha)));
      const knee = Hj.clone().add(thighDir.clone().multiplyScalar(L1));
      const calfDir = Hj.clone().add(d).sub(knee).normalize();
      W[side + '_Thigh'] = frame(thighDir, fw);
      W[side + '_Calf'] = frame(calfDir, fw);
      const th = footPitch(ph);
      W[side + '_Foot'] = R(Z, th);
      const toeBend = ph <= to ? Math.max(0, -th) : Math.max(0, -P.toeOffPitch) * Math.max(0, 1 - (ph - to) / 0.12);
      W[side + '_ToeBase'] = R(Z, th + toeBend);
    }
  };
  // hips: lowered only as far as the legs need to reach both feet (most as both feet are down), smoothed
  const NS = 96, need = [], dbg = [];
  for (let i = 0; i < NS; i++) {
    const t = i / NS, W = torso(t), dz = M(P.sway) * Math.sin(2 * Math.PI * t);
    write(W, 0, dz);
    let worst = -Infinity;
    for (const [side, ph0] of [['R', t], ['L', t + 0.5]]) {
      const Hj = wp(side + '_Thigh'), a2 = ankleAt(frac(ph0));
      const sgn = side === 'R' ? 1 : -1;
      const hz = Z0 + sgn * M(P.width) - Hj.z, hx = a2.x - Hj.x;
      const r = (L1 + L2) * P.reach;
      const dyMax = Math.sqrt(Math.max(0, r * r - hx * hx - hz * hz)); // highest the hip may be above the ankle
      worst = Math.max(worst, Hj.y - a2.y - dyMax);
      if (i % 8 === 0) dbg.push(`${t.toFixed(2)}${side} ph${frac(ph0).toFixed(2)} ax${((a2.x - Hj.x) * unit).toFixed(2)} ay${((a2.y - ground) * unit).toFixed(2)} need${((Hj.y - a2.y - dyMax) * unit).toFixed(3)}`);
    }
    need.push(worst + M(P.settle));
  }
  const W6 = Math.round(P.envW * NS), W7 = Math.round(P.smW * NS);
  const env = need.map((_, i) => { let m = -Infinity; for (let j = -W6; j <= W6; j++) m = Math.max(m, need[(i + j + NS) % NS]); return m; });
  const sm = env.map((_, i) => { let a = 0; for (let j = -W7; j <= W7; j++) a += env[(i + j + NS) % NS]; return a / (2 * W7 + 1); });
  const drop = (t) => { const x = frac(t) * NS, i = Math.floor(x), f = x - i; return sm[i % NS] * (1 - f) + sm[(i + 1) % NS] * f; };
  const base = 0;
  const bob = (t) => -drop(t) * unit;
  const n = Math.round(dur * fps) + 1;
  const times = [], rot = {}, hipPos = [];
  for (const b of bones) rot[b.name] = [];
  let worst = 0; const ratios = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const W = torso(t), dz = M(P.sway) * Math.sin(2 * Math.PI * t), dy = M(bob(t));
    write(W, dy, dz);
    const rep = []; legs(t, W, dz, rep); worst = Math.max(worst, ...rep);
    write(W, dy, dz);
    if (i % 4 === 0) { const k = (sd) => { const a = wp(sd + '_Calf').sub(wp(sd + '_Thigh')), b = wp(sd + '_Foot').sub(wp(sd + '_Calf')); return Math.round(a.angleTo(b) * 57.3); }; ratios.push(`${t.toFixed(2)} R${rep[0].toFixed(3)}/${k('R')} L${rep[1].toFixed(3)}/${k('L')} dy${(dy * unit).toFixed(3)}`); }
    times.push(t * dur);
    for (const b of bones) rot[b.name].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    hipPos.push(hip.position.x, hip.position.y, hip.position.z);
  }
  return { clip: { times, rot, hipPos }, info: { dur: +dur.toFixed(3), step: +(speed * dur / 2).toFixed(3), drop: [Math.min(...sm), Math.max(...sm)].map((x) => +(x * unit).toFixed(3)), reach: +worst.toFixed(3), legM: +((L1 + L2) * unit).toFixed(3), ratios } };
};
