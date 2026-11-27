// Moves animation clips from Quaternius' Universal Animation Library (CC0, UE-mannequin
// skeleton) onto a Tripo v1.0 humanoid rig (0.36). Runs in a browser page (three.js):
//   window.run(targetGlbUrl, [[sourceGlbUrl, [clipName, ...]], ...]) → { clip: { times, rot, hipPos } }
// Each bone's motion is copied in world space against both rigs' T-poses:
//   T_world = A · S_world · S_ref⁻¹ · A⁻¹ · T_ref
// (A turns the library's +Z-facing rig to Tripo's +X; S_ref is the library's A_TPose clip,
// T_ref the Tripo bind pose). The hips' travel is scaled by the two hip heights.
// Bundle with esbuild (format iife), open it in a page, save the result as JSON, trim it,
// then write it into the model with add-clips.mjs and shrink it with optimize.mjs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const SIDE = (t, s) => [['L_' + t, s + '_l'], ['R_' + t, s + '_r']];
const MAP = Object.fromEntries([
  ['Hip', 'pelvis'], ['Waist', 'spine_01'], ['Spine01', 'spine_02'], ['Spine02', 'spine_03'], ['NeckTwist01', 'neck_01'], ['Head', 'Head'],
  ...SIDE('Clavicle', 'clavicle'), ...SIDE('Upperarm', 'upperarm'), ...SIDE('Forearm', 'lowerarm'), ...SIDE('Hand', 'hand'),
  ...SIDE('Thigh', 'thigh'), ...SIDE('Calf', 'calf'), ...SIDE('Foot', 'foot'), ...SIDE('ToeBase', 'ball'),
]);
/**
 * (0.99.22) Some Tripo models come in an A-pose (arms angled down), and every clip, measured against the bind pose
 * as if it were a T-pose, pushed the arms down a second time: into the body. Turn each upper arm, then each
 * forearm, so the next bone along lies level (keeping its direction round the body), only for the measuring.
 */
export function straightenArms(root) {
  const turn = (boneName, childName) => {
    const b = root.getObjectByName(boneName), c = root.getObjectByName(childName);
    if (!b || !c) return;
    root.updateMatrixWorld(true);
    const p0 = b.getWorldPosition(new THREE.Vector3()), p1 = c.getWorldPosition(new THREE.Vector3());
    const dir = p1.sub(p0).normalize();
    const level = new THREE.Vector3(dir.x, 0, dir.z);
    if (level.lengthSq() < 1e-6 || dir.angleTo(level.normalize()) < 0.1) return; // already level (under 6 degrees)
    const C = new THREE.Quaternion().setFromUnitVectors(dir, level);
    const wq = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(C);
    const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    b.quaternion.copy(pq.multiply(wq));
    root.updateMatrixWorld(true);
  };
  for (const s of ['L_', 'R_']) { turn(s + 'Upperarm', s + 'Forearm'); turn(s + 'Forearm', s + 'Hand'); }
  straightenLegs(root);
}

/**
 * (0.99.25) And the legs: a knee made bent (the shin turned back into line with the thigh), and a foot made pointing
 * up or straight down (turned to point forward and a little down, as a foot stands). Tripo models face +X.
 */
export function straightenLegs(root) {
  const at = (n) => { const o = root.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  const turnTo = (boneName, childName, want) => {
    const b = root.getObjectByName(boneName), c = root.getObjectByName(childName);
    if (!b || !c) return;
    root.updateMatrixWorld(true);
    const dir = at(childName).sub(at(boneName)).normalize();
    if (dir.angleTo(want) < 0.1) return;
    const C = new THREE.Quaternion().setFromUnitVectors(dir, want);
    const wq = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(C);
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    root.updateMatrixWorld(true);
  };
  for (const s of ['L_', 'R_']) {
    const T = at(s + 'Thigh'), K = at(s + 'Calf');
    if (!T || !K) continue;
    turnTo(s + 'Calf', s + 'Foot', K.clone().sub(T).normalize()); // the shin in line with the thigh
    const F = at(s + 'Foot'), Toe = at(s + 'ToeBase');
    if (!F || !Toe) continue;
    const d = Toe.clone().sub(F).normalize();
    const pitch = Math.asin(-d.y);
    if (pitch < -0.05 || pitch > 0.6) {
      const flat = new THREE.Vector3(d.x, 0, d.z);
      if (flat.lengthSq() < 0.04 || flat.x < 0) flat.set(1, 0, 0); // no sensible heading: forward (+X)
      flat.normalize();
      turnTo(s + 'Foot', s + 'ToeBase', flat.multiplyScalar(Math.cos(0.2)).add(new THREE.Vector3(0, -Math.sin(0.2), 0)).normalize());
    }
  }
}

window.run = async (targetUrl, sources, fps = 30) => {
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const tg = await l.loadAsync(targetUrl); const T = tg.scene; T.updateMatrixWorld(true);
  const bones = []; T.traverse((o) => { if (o.isBone) bones.push(o); }); // parents come before children
  const Tref = new Map(), restLocal = new Map();
  for (const b of bones) restLocal.set(b.name, b.quaternion.clone());
  straightenArms(T); // (0.99.22) a model made in an A-pose: measured as if its arms were out level (a T-pose)
  for (const b of bones) Tref.set(b.name, b.getWorldQuaternion(new THREE.Quaternion()));
  const hip = T.getObjectByName('Hip'); const hipRefPos = hip.getWorldPosition(new THREE.Vector3());
  const hipParentInv = new THREE.Matrix4().copy(hip.parent.matrixWorld).invert();
  const A = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), Ai = A.clone().invert();
  const out = {};
  for (const [file, clips] of sources) {
    const sg = await l.loadAsync(file); const S = sg.scene; const mix = new THREE.AnimationMixer(S);
    const pose = (name, t) => { mix.stopAllAction(); mix.clipAction(sg.animations.find((c) => c.name === name)).play(); mix.setTime(t); S.updateMatrixWorld(true); };
    pose('A_TPose', 0);
    const Sref = new Map(); for (const sname of Object.values(MAP)) Sref.set(sname, S.getObjectByName(sname).getWorldQuaternion(new THREE.Quaternion()).invert());
    const pelvisRef = S.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3());
    const ratio = hipRefPos.y / pelvisRef.y;
    for (const name of clips) {
      const clip = sg.animations.find((c) => c.name === name);
      const n = Math.max(2, Math.round(clip.duration * fps) + 1);
      const times = [], rot = {}, hipPos = [];
      for (const b of bones) rot[b.name] = [];
      for (let i = 0; i < n; i++) {
        const t = Math.min(clip.duration, i / fps); times.push(t);
        pose(name, t);
        const world = new Map();
        for (const b of bones) {
          const pw = b.parent && world.has(b.parent.name) ? world.get(b.parent.name) : b.parent.getWorldQuaternion(new THREE.Quaternion());
          let local;
          const sname = MAP[b.name];
          if (sname) {
            const sw = S.getObjectByName(sname).getWorldQuaternion(new THREE.Quaternion());
            const w = A.clone().multiply(sw).multiply(Sref.get(sname)).multiply(Ai).multiply(Tref.get(b.name));
            local = pw.clone().invert().multiply(w);
            world.set(b.name, w);
          } else {
            local = restLocal.get(b.name).clone();
            world.set(b.name, pw.clone().multiply(local));
          }
          rot[b.name].push(local.x, local.y, local.z, local.w);
        }
        const sp = S.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()).sub(pelvisRef).applyQuaternion(A).multiplyScalar(ratio);
        const hp = hipRefPos.clone().add(sp).applyMatrix4(hipParentInv);
        hipPos.push(hp.x, hp.y, hp.z);
      }
      out[name] = { times, rot, hipPos };
    }
  }
  return out;
};
