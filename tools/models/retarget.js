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
window.run = async (targetUrl, sources, fps = 30) => {
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const tg = await l.loadAsync(targetUrl); const T = tg.scene; T.updateMatrixWorld(true);
  const bones = []; T.traverse((o) => { if (o.isBone) bones.push(o); }); // parents come before children
  const Tref = new Map(), restLocal = new Map();
  for (const b of bones) { Tref.set(b.name, b.getWorldQuaternion(new THREE.Quaternion())); restLocal.set(b.name, b.quaternion.clone()); }
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
