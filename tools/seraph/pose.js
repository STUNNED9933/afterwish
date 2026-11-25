// Author a clip on a Tripo humanoid from a few keyframes: the model's own idle underneath, the spine bent, the
// arms placed by two-bone IK (wrist targets in the chest's frame, metres; +X forward, +Y up, +Z her right),
// the legs pitched. Every keyframe has a weight (0: the idle as it is, 1: the pose).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const D2R = Math.PI / 180;
const smooth = (x) => x * x * (3 - 2 * x);
const lerpKey = (keys, t, f) => {
  // keys sorted by t; values blended with smoothstep; f(a, b, u) blends two key values
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) return f(a, b, smooth((t - a.t) / (b.t - a.t || 1)));
  }
  return keys[keys.length - 1];
};
const mix = (a, b, u) => (a == null ? b : b == null ? a : Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * u) : a + (b - a) * u);

window.pose = async (url, height, spec) => {
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const G = await l.loadAsync(url); const T = G.scene; T.updateMatrixWorld(true);
  const bones = []; T.traverse((o) => { if (o.isBone) bones.push(o); });
  const B = (n) => T.getObjectByName(n);
  const unit = height / new THREE.Box3().setFromObject(T).getSize(new THREE.Vector3()).y;
  const M = (m) => m / unit;
  const idle = G.animations.find((c) => c.name === (spec.base || 'idle'));
  const mixer = new THREE.AnimationMixer(T); const act = mixer.clipAction(idle); act.play();
  const wp = (n) => B(n).getWorldPosition(new THREE.Vector3());
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const setWorld = (b, q) => { b.quaternion.copy(wq(b.parent).invert().multiply(q)); b.updateMatrixWorld(true); };
  const turn = (b, from, to) => { setWorld(b, new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize()).multiply(wq(b))); };
  const info = { armLen: 0, shoulders: 0 };
  const blend = (a, b, u) => {
    const o = { t: 0 };
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== 't') o[k] = typeof (a[k] ?? b[k]) === 'object' && !Array.isArray(a[k] ?? b[k]) ? blend(a[k] || {}, b[k] || {}, u) : mix(a[k], b[k], u);
    return o;
  };
  const dur = spec.dur, fps = 30, n = Math.round(dur * fps) + 1;
  const times = [], rot = {}, hipPos = [];
  for (const b of bones) rot[b.name] = [];
  const hip = B('Hip');
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * dur;
    mixer.setTime(spec.baseTime != null ? spec.baseTime : t % idle.duration);
    T.updateMatrixWorld(true);
    const base = new Map(bones.map((b) => [b.name, b.quaternion.clone()]));
    const K = lerpKey(spec.keys, t, blend);
    const w = K.w ?? 1;
    // the body: bent forward (+) or back from the waist up, and turned
    const bend = K.bend || 0, twist = K.twist || 0;
    for (const [name, share] of [['Waist', 0.3], ['Spine01', 0.35], ['Spine02', 0.35]]) {
      const b = B(name);
      setWorld(b, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bend * share * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist * share * D2R)).multiply(wq(b)));
    }
    if (K.head) { const h = B('Head'); setWorld(h, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -K.head * D2R).multiply(wq(h))); }
    // the legs: each thigh and calf pitched (forward +)
    for (const s of ['L', 'R']) {
      const lg = K[s + 'leg'];
      if (!lg) continue;
      const th = B(s + '_Thigh'), ca = B(s + '_Calf');
      setWorld(th, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (lg[0] || 0) * D2R).multiply(wq(th)));
      setWorld(ca, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (lg[1] || 0) * D2R).multiply(wq(ca)));
    }
    // the shoulders (and the wings on them since 0.98): raised (+) and drawn back (+)
    if (K.clav) for (const sd of ['L', 'R']) {
      const c = B(sd + '_Clavicle'), sg = sd === 'R' ? 1 : -1;
      setWorld(c, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sg * K.clav[0] * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg * (K.clav[1] || 0) * D2R)).multiply(wq(c)));
    }
    // the arms: wrist to its target (in the chest's frame from the chest bone), the elbow toward its pole
    const chest = B('Spine02'), chestP = wp('Spine02'), chestQ = wq(chest);
    // the chest's own frame, as the model's at rest (bones' axes differ per rig): its turn since the bind pose
    if (!info.chestBind) info.chestBind = null;
    for (const s of ['L', 'R']) {
      const a = K[s];
      if (!a) continue;
      const up = B(s + '_Upperarm'), fo = B(s + '_Forearm'), ha = B(s + '_Hand');
      const S = wp(s + '_Upperarm'), E = wp(s + '_Forearm'), Wr = wp(s + '_Hand');
      const L1 = E.distanceTo(S), L2 = Wr.distanceTo(E);
      info.armLen = +((L1 + L2) * unit).toFixed(3);
      const sgn = s === 'R' ? 1 : -1;
      const frame = spec.chestFrame ? chestQ.clone().multiply(spec.chestInv) : new THREE.Quaternion();
      const off = new THREE.Vector3(a.at[0], a.at[1], a.at[2] * (a.mirror === false ? 1 : 1)).multiplyScalar(1 / unit);
      const target = chestP.clone().add(off.applyQuaternion(spinOnly(bend, twist)));
      const d = target.clone().sub(S); const dist = Math.min(d.length(), (L1 + L2) * 0.995); const dn = d.clone().normalize();
      const pole = new THREE.Vector3(...a.pole).normalize().applyQuaternion(spinOnly(bend, twist));
      pole.addScaledVector(dn, -pole.dot(dn)).normalize();
      const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
      const elbow = S.clone().addScaledVector(dn, L1 * cosA).addScaledVector(pole, L1 * Math.sqrt(1 - cosA * cosA));
      turn(up, E.clone().sub(S), elbow.clone().sub(S));
      const E2 = wp(s + '_Forearm'), W2 = wp(s + '_Hand');
      turn(fo, W2.clone().sub(E2), S.clone().addScaledVector(dn, dist).sub(E2));
      if (a.roll) { const ax = wp(s + '_Hand').sub(wp(s + '_Forearm')).normalize(); setWorld(fo, new THREE.Quaternion().setFromAxisAngle(ax, a.roll * sgn * D2R).multiply(wq(fo))); }
      if (a.wrist) setWorld(ha, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a.wrist * D2R).multiply(wq(ha)));
    }
    // weight: back toward the idle as it was
    for (const b of bones) b.quaternion.copy(base.get(b.name).clone().slerp(b.quaternion, w));
    T.updateMatrixWorld(true);
    times.push(t);
    for (const b of bones) rot[b.name].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    hipPos.push(hip.position.x, hip.position.y + M(K.rise || 0) * w, hip.position.z);
  }
  function spinOnly(bend, twist) {
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bend * D2R).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist * D2R));
  }
  mixer.setTime(0); T.updateMatrixWorld(true);
  info.shoulders = +(wp('R_Upperarm').distanceTo(wp('L_Upperarm')) * unit).toFixed(3);
  const c = wp('Spine02'); info.shoulderFromChest = wp('R_Upperarm').sub(c).multiplyScalar(unit).toArray().map((x) => +x.toFixed(3));
  info.handIdleFromChest = wp('R_Hand').sub(c).multiplyScalar(unit).toArray().map((x) => +x.toFixed(3));
  return { clip: { times, rot, hipPos }, info };
};
