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
  palmsDown(root);
}

/**
 * (0.99.28) Tripo makes its models in a T-pose with the palms facing forward; the library's T-pose has them facing
 * down. Measured against each other, every clip kept the difference: arms hanging at the sides, palms forward, like a
 * statue. So, only for the measuring, each forearm is turned about its own length until the palm faces down. Which way
 * a palm faces is read from the hand itself: the skin's thinnest direction (a flat open hand) round the hand bone.
 */
export function palmsDown(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const s of ['L_', 'R_']) {
    const fore = root.getObjectByName(s + 'Forearm'), hand = root.getObjectByName(s + 'Hand');
    if (!fore || !hand || !meshes.length) continue;
    const pts = [];
    const v = new THREE.Vector3();
    for (const m of meshes) {
      const hi = m.skeleton.bones.indexOf(hand);
      if (hi < 0) continue;
      m.skeleton.update();
      const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < pos.count; i += 1) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        v.fromBufferAttribute(pos, i);
        m.applyBoneTransform(i, v);
        pts.push(v.clone().applyMatrix4(m.matrixWorld));
      }
    }
    if (typeof window !== 'undefined') (window.palmDebug = window.palmDebug || {})[s] = { n: pts.length };
    if (pts.length < 20) continue;
    // the thinnest direction of the hand (the smallest axis of its spread): its palm faces along it, one way or the other
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
    let n = new THREE.Vector3(1, 1, 1).normalize();
    // smallest eigenvector: power iteration on (trace·I - C)
    const tr = C[0][0] + C[1][1] + C[2][2];
    for (let it = 0; it < 60; it++) {
      const x = (tr - C[0][0]) * n.x - C[0][1] * n.y - C[0][2] * n.z;
      const y = -C[1][0] * n.x + (tr - C[1][1]) * n.y - C[1][2] * n.z;
      const z = -C[2][0] * n.x - C[2][1] * n.y + (tr - C[2][2]) * n.z;
      n.set(x, y, z).normalize();
    }
    const arm = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
    n.addScaledVector(arm, -n.dot(arm)).normalize();
    if (typeof window !== 'undefined') Object.assign(window.palmDebug[s], { nx: +n.x.toFixed(2), ny: +n.y.toFixed(2), nz: +n.z.toFixed(2), arm: [+arm.x.toFixed(2), +arm.y.toFixed(2), +arm.z.toFixed(2)] });
    // which side is the palm is not in the shape, so take the reading nearest down (never a turn past a right angle)
    const want = new THREE.Vector3(0, -1, 0).addScaledVector(arm, arm.y).normalize();
    if (n.dot(want) < 0) n.negate();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(n, want).dot(arm), n.dot(want));
    if (Math.abs(ang) < 0.44) continue; // within 25 degrees of down already: leave it
    const q = new THREE.Quaternion().setFromAxisAngle(arm, ang);
    const wq = fore.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
    fore.quaternion.copy(fore.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
    root.updateMatrixWorld(true);
    if (typeof window !== 'undefined') (window.palmTurns = window.palmTurns || {})[s] = Math.round((ang * 180) / Math.PI);
  }
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
