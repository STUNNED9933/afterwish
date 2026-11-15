// Our own animations, posed in code (0.37). Runs in a browser page (three.js) on a Tripo v1.0
// humanoid rig: each clip is a function of time that poses the skeleton (start from a base
// pose, turn bones about body axes, reach the hands to points with two-bone IK), sampled at
// 30 fps. The result is the same JSON as retarget.js, written into the model by add-clips.mjs.
//   window.run(targetGlbUrl, clipsModuleExport) → { clip: { times, rot, hipPos } }
// Body axes, in the model's space: the Tripo v1.0 rig faces +X, up is +Y, its right is +Z.
import * as THREE from 'three';

export const FWD = new THREE.Vector3(1, 0, 0);
export const UP = new THREE.Vector3(0, 1, 0);
export const RIGHT = new THREE.Vector3(0, 0, 1);

const by0 = (bones, n) => bones.find((b) => b.name === n);

export function makePoser(scene, clips) {
  scene.updateMatrixWorld(true);
  const bones = [];
  scene.traverse((o) => {
    if (o.isBone) bones.push(o);
  });
  const by = new Map(bones.map((b) => [b.name, b]));
  const bindQ = new Map(bones.map((b) => [b, b.quaternion.clone()]));
  const bindHipW = by0(bones, 'Hip').getWorldPosition(new THREE.Vector3());
  const FEET = ['L_Foot', 'R_Foot', 'L_ToeBase', 'R_ToeBase'].filter((n) => by.has(n));
  const footRest = Math.min(...FEET.map((n) => by.get(n).getWorldPosition(new THREE.Vector3()).y));
  const bindW = new Map(bones.map((b) => [b, b.getWorldQuaternion(new THREE.Quaternion())]));
  const bindP = new Map(bones.map((b) => [b, b.position.clone()]));
  const box = new THREE.Box3().setFromObject(scene);
  const H = box.max.y - box.min.y;
  const mixer = new THREE.AnimationMixer(scene);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3();
  const bone = (n) => {
    const b = by.get(n);
    if (!b) throw new Error(`no bone ${n}`);
    return b;
  };
  const P = {
    H,
    bones,
    bone,
    /** Back to the bind pose, or a frame of one of the model's own clips: [name, seconds]
     * (centre: put the hips back over the spot the character stands on). */
    reset(base, centre = false) {
      mixer.stopAllAction();
      for (const b of bones) {
        b.quaternion.copy(bindQ.get(b));
        b.position.copy(bindP.get(b));
      }
      if (base) {
        const c = clips.find((x) => x.name === base[0]);
        if (!c) throw new Error(`no clip ${base[0]}`);
        const a = mixer.clipAction(c);
        a.play();
        mixer.setTime(Math.min(base[1], c.duration - 1e-3));
        if (centre) {
          scene.updateMatrixWorld(true);
          const hip = bone('Hip');
          const w = hip.getWorldPosition(new THREE.Vector3());
          w.x = bindHipW.x;
          w.z = bindHipW.z;
          hip.position.copy(hip.parent.worldToLocal(w));
        }
      }
      scene.updateMatrixWorld(true);
      return P;
    },
    pos(n, out = new THREE.Vector3()) {
      return bone(n).getWorldPosition(out);
    },
    /** How a bone is turned from the bind pose (world). */
    turn(n) {
      const b = bone(n);
      return b.getWorldQuaternion(new THREE.Quaternion()).multiply(bindW.get(b).clone().invert());
    },
    /** A body axis (FWD, UP, RIGHT) as a bone now carries it. */
    axis(n, v) {
      return v.clone().applyQuaternion(P.turn(n));
    },
    /** A point offset [forward, up, right] (heights of the model) from a bone, in its turned frame. */
    at(n, [f, u, r]) {
      const t = P.turn(n);
      return P.pos(n).add(FWD.clone().applyQuaternion(t).multiplyScalar(f * H)).add(UP.clone().applyQuaternion(t).multiplyScalar(u * H)).add(RIGHT.clone().applyQuaternion(t).multiplyScalar(r * H));
    },
    /** Turn a bone about an axis in the model's space (degrees), children following. */
    rot(n, axis, deg) {
      if (!deg) return P;
      const b = bone(n);
      const w = b.getWorldQuaternion(qa);
      const p = b.parent.getWorldQuaternion(qb);
      const t = new THREE.Quaternion().setFromAxisAngle(axis, (deg * Math.PI) / 180).multiply(w);
      b.quaternion.copy(p.invert().multiply(t));
      b.updateMatrixWorld(true);
      return P;
    },
    /** Move the hips by [forward, up, right] in heights of the model. */
    hips([f, u, r]) {
      const b = bone('Hip');
      const w = b.getWorldPosition(va).addScaledVector(FWD, f * H).addScaledVector(UP, u * H).addScaledVector(RIGHT, r * H);
      b.position.copy(b.parent.worldToLocal(w));
      b.updateMatrixWorld(true);
      return P;
    },
    /** Point a bone so its child (or a given bone) lies along dir. */
    aim(n, childName, dir) {
      const b = bone(n);
      const from = P.pos(childName, vb).sub(b.getWorldPosition(va)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize());
      const w = b.getWorldQuaternion(qa);
      const p = b.parent.getWorldQuaternion(qb);
      b.quaternion.copy(p.invert().multiply(q.multiply(w)));
      b.updateMatrixWorld(true);
      return P;
    },
    /** Two-bone IK: put side's hand ('L' or 'R') at target, the elbow toward pole (points). */
    reach(side, target, pole) {
      const up = `${side}_Upperarm`, lo = `${side}_Forearm`, hand = `${side}_Hand`;
      const S = P.pos(up), E = P.pos(lo), W = P.pos(hand);
      const a = S.distanceTo(E), b = E.distanceTo(W);
      const toT = target.clone().sub(S);
      const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-4), (a + b) * 0.999);
      const dir = toT.normalize();
      const x = (a * a - b * b + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, a * a - x * x));
      const perp = pole.clone().sub(S);
      perp.addScaledVector(dir, -perp.dot(dir)).normalize();
      const elbow = S.clone().addScaledVector(dir, x).addScaledVector(perp, h);
      P.aim(up, lo, elbow.clone().sub(S));
      P.aim(lo, hand, S.clone().addScaledVector(dir, d).sub(elbow));
      return P;
    },
    /** Raise or lower the hips so the lowest foot rests on the ground (plus lift, in heights). */
    ground(lift = 0) {
      const low = Math.min(...FEET.map((n) => P.pos(n).y));
      return P.hips([0, (footRest - low) / H + lift, 0]);
    },
    /** The pose now: every bone's rotation and the hips' position. */
    capture() {
      const rot = {};
      for (const b of bones) rot[b.name] = b.quaternion.toArray();
      return { rot, hip: bone('Hip').position.toArray() };
    },
  };
  return P;
}

/** Sample clips: { name: { duration, pose(P, t) } } at fps → retarget.js-style JSON. */
export function bake(P, defs, fps = 30) {
  const out = {};
  for (const [name, def] of Object.entries(defs)) {
    const n = Math.max(2, Math.round(def.duration * fps) + 1);
    const times = [], rot = {}, hipPos = [];
    for (const b of P.bones) rot[b.name] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(def.duration, i / fps);
      times.push(t);
      def.pose(P, t);
      const c = P.capture();
      for (const b of P.bones) rot[b.name].push(...c.rot[b.name]);
      hipPos.push(...c.hip);
    }
    out[name] = { times, rot, hipPos };
  }
  return out;
}

// Small helpers for writing poses.
export const ease = (t) => t * t * (3 - 2 * t);
export const mix = (a, b, k) => a + (b - a) * k;
/** Value at time t along keys [[t, v], ...] (smooth steps between keys). */
export function curve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const k = ease((t - t0) / Math.max(1e-6, t1 - t0));
      return Array.isArray(v0) ? v0.map((x, j) => mix(x, v1[j], k)) : mix(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
}
