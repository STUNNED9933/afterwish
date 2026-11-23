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
const sBind = worldRot(S, new Map());
const tBind = worldRot(T, new Map());
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
