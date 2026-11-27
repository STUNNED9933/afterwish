// Copies animation clips from one Tripo-rigged hero onto another rig with the same bone names
// (the Eternal forms, 0.76): each bone's motion is moved across in world space against both
// rigs' bind poses (both T-poses), T_world = S_world · S_bind⁻¹ · T_bind, then turned back into
// local rotations; the hips' travel is scaled by the two hip heights. Clips the target already
// has (its own Tripo idle, run, flinch...) are kept as they are.
//   node tools/models/copy-clips.mjs <source hero.glb> <target rig.glb> <out.glb> [skip,names]
// Run from a folder where @gltf-transform/core, @gltf-transform/extensions, meshoptimizer and
// three are installed (NODE_PATH pointing at its node_modules).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

const [srcPath, tgtPath, outPath, skipArg = ''] = process.argv.slice(2);
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(srcPath);
const tgt = await io.read(tgtPath);
const skip = new Set(skipArg.split(',').filter(Boolean));

const q = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
/** Every node with its parent, in an order where parents come first. */
function tree(doc) {
  const parent = new Map();
  const order = [];
  const walk = (n, p) => {
    parent.set(n, p);
    order.push(n);
    for (const c of n.listChildren()) walk(c, n);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) walk(n, null);
  return { parent, order, byName: new Map(order.map((n) => [n.getName(), n])) };
}
const S = tree(src), T = tree(tgt);

/** World rotations of every node for a pose (local rotations by node; rest where absent). */
function worldRot(t, local) {
  const w = new Map();
  for (const n of t.order) {
    const l = local.get(n) || q(n.getRotation());
    const p = t.parent.get(n);
    w.set(n, p ? w.get(p).clone().multiply(l) : l.clone());
  }
  return w;
}
/**
 * (0.99.22) Rest rotations with the arms turned level, for a rig made in an A-pose (see retarget.js): each upper
 * arm, then each forearm, turned so the next bone along lies level. Returns node -> local rotation overrides.
 */
function straightArms(t) {
  const over = new Map();
  const world = (n) => {
    const m = new THREE.Matrix4();
    for (let c = n; c; c = t.parent.get(c)) m.premultiply(new THREE.Matrix4().compose(new THREE.Vector3(...c.getTranslation()), over.get(c) || q(c.getRotation()), new THREE.Vector3(...c.getScale())));
    return m;
  };
  const turn = (bn, cn) => {
    const b = t.byName.get(bn), c = t.byName.get(cn);
    if (!b || !c) return;
    const p0 = new THREE.Vector3().setFromMatrixPosition(world(b)), p1 = new THREE.Vector3().setFromMatrixPosition(world(c));
    const dir = p1.sub(p0).normalize();
    const level = new THREE.Vector3(dir.x, 0, dir.z);
    if (level.lengthSq() < 1e-6 || dir.angleTo(level.normalize()) < 0.1) return;
    const C = new THREE.Quaternion().setFromUnitVectors(dir, level);
    const rots = worldRot(t, over);
    const wq = C.multiply(rots.get(b));
    const pw = t.parent.get(b) ? rots.get(t.parent.get(b)) : new THREE.Quaternion();
    over.set(b, pw.clone().invert().multiply(wq).normalize());
  };
  for (const side of ['L_', 'R_']) { turn(side + 'Upperarm', side + 'Forearm'); turn(side + 'Forearm', side + 'Hand'); }
  // (0.99.25) the legs too (see retarget.js straightenLegs): a bent knee straightened, a foot pointing up set forward
  const pos = (n) => new THREE.Vector3().setFromMatrixPosition(world(n));
  const turnTo = (bn, cn, want) => {
    const b = t.byName.get(bn), c = t.byName.get(cn);
    if (!b || !c) return;
    const dir = pos(c).sub(pos(b)).normalize();
    if (dir.angleTo(want) < 0.1) return;
    const C = new THREE.Quaternion().setFromUnitVectors(dir, want);
    const rots = worldRot(t, over);
    const wq = C.multiply(rots.get(b));
    const pw = t.parent.get(b) ? rots.get(t.parent.get(b)) : new THREE.Quaternion();
    over.set(b, pw.clone().invert().multiply(wq).normalize());
  };
  for (const side of ['L_', 'R_']) {
    const T = t.byName.get(side + 'Thigh'), K = t.byName.get(side + 'Calf');
    if (!T || !K) continue;
    turnTo(side + 'Calf', side + 'Foot', pos(K).sub(pos(T)).normalize());
    const F = t.byName.get(side + 'Foot'), Toe = t.byName.get(side + 'ToeBase');
    if (!F || !Toe) continue;
    const d = pos(Toe).sub(pos(F)).normalize();
    const pitch = Math.asin(-d.y);
    if (pitch < -0.05 || pitch > 0.6) {
      const flat = new THREE.Vector3(d.x, 0, d.z);
      if (flat.lengthSq() < 0.04 || flat.x < 0) flat.set(1, 0, 0);
      flat.normalize();
      turnTo(side + 'Foot', side + 'ToeBase', flat.multiplyScalar(Math.cos(0.2)).add(new THREE.Vector3(0, -Math.sin(0.2), 0)).normalize());
    }
  }
  return over;
}
const sBind = worldRot(S, straightArms(S));
const tBind = worldRot(T, straightArms(T));
const hipS = S.byName.get('Hip'), hipT = T.byName.get('Hip');
const hipH = (t, n) => {
  // the hip's height above the rig's root, in the root's space (bind pose)
  const m = new THREE.Matrix4();
  for (let c = n; c; c = t.parent.get(c)) m.premultiply(new THREE.Matrix4().compose(new THREE.Vector3(...c.getTranslation()), q(c.getRotation()), new THREE.Vector3(...c.getScale())));
  return new THREE.Vector3().setFromMatrixPosition(m).y;
};
const ratio = hipS && hipT ? hipH(T, hipT) / hipH(S, hipS) : 1;

/** Sample a sampler at time x (linear; rotations slerped). */
function sample(s, x, path) {
  const ti = s.getInput().getArray(), out = s.getOutput().getArray();
  const k = path === 'rotation' ? 4 : 3;
  let i = 0;
  while (i < ti.length - 1 && ti[i + 1] < x) i++;
  const j = Math.min(i + 1, ti.length - 1);
  const f = j === i ? 0 : Math.min(1, Math.max(0, (x - ti[i]) / (ti[j] - ti[i])));
  const a = Array.from(out.slice(i * k, i * k + k)), b = Array.from(out.slice(j * k, j * k + k));
  if (k === 4) return q(a).slerp(q(b), f);
  return new THREE.Vector3(...a).lerp(new THREE.Vector3(...b), f);
}

const have = new Set(tgt.getRoot().listAnimations().map((a) => a.getName()));
const buffer = tgt.getRoot().listBuffers()[0];
const copied = [];
for (const a of src.getRoot().listAnimations()) {
  const name = a.getName();
  if (have.has(name) || skip.has(name)) continue;
  const rot = new Map(), hipPos = [];
  let hipTr = null;
  const times = new Set();
  for (const ch of a.listChannels()) {
    const n = ch.getTargetNode(), path = ch.getTargetPath();
    if (path === 'rotation') rot.set(n, ch.getSampler());
    if (path === 'translation' && n === hipS) hipTr = ch.getSampler();
    for (const t of ch.getSampler().getInput().getArray()) times.add(Math.round(t * 1000) / 1000);
  }
  const ts = [...times].sort((x, y) => x - y);
  const outRot = new Map(); // target node → flat quaternions
  for (const t of ts) {
    const local = new Map();
    for (const [n, s] of rot) local.set(n, sample(s, t, 'rotation'));
    const sw = worldRot(S, local);
    // the target, top down: its world rotation copied from the source's, then made local
    const tw = new Map();
    for (const n of T.order) {
      const sn = S.byName.get(n.getName());
      const p = T.parent.get(n);
      const pw = p ? tw.get(p) : new THREE.Quaternion();
      let w;
      if (sn && rot.has(sn)) w = sw.get(sn).clone().multiply(sBind.get(sn).clone().invert()).multiply(tBind.get(n));
      else w = pw.clone().multiply(q(n.getRotation()));
      tw.set(n, w);
      if (sn && rot.has(sn)) {
        const l = pw.clone().invert().multiply(w).normalize();
        if (!outRot.has(n)) outRot.set(n, []);
        outRot.get(n).push(l.x, l.y, l.z, l.w);
      }
    }
    if (hipTr && hipT) {
      const v = sample(hipTr, t, 'translation').sub(new THREE.Vector3(...hipS.getTranslation())).multiplyScalar(ratio).add(new THREE.Vector3(...hipT.getTranslation()));
      hipPos.push(v.x, v.y, v.z);
    }
  }
  const anim = tgt.createAnimation(name);
  const input = tgt.createAccessor().setType('SCALAR').setArray(new Float32Array(ts)).setBuffer(buffer);
  const add = (node, path, type, arr) => {
    const output = tgt.createAccessor().setType(type).setArray(new Float32Array(arr)).setBuffer(buffer);
    const s = tgt.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(tgt.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
  };
  for (const [n, arr] of outRot) add(n, 'rotation', 'VEC4', arr);
  if (hipPos.length) add(hipT, 'translation', 'VEC3', hipPos);
  copied.push(name);
}
await io.write(outPath, tgt);
console.log(`hip ratio ${ratio.toFixed(3)}; copied ${copied.length}: ${copied.join(', ')}`);
console.log('clips now:', tgt.getRoot().listAnimations().map((x) => x.getName()).join(', '));
