// (1.1.4) Natural walks and trots for four-legged Tripo models, generated rather than hand-keyed.
//
//   node tools/models/gait.mjs in.glb out.glb [--keep-old]
//
// Tripo's auto-animated quadruped walks are poor (stiff, splayed front legs; hind paws that curl up mid-stride;
// no planted feet). This builds the gait from how four-legged animals move instead:
//   - walk: a lateral-sequence walk (back-left, front-left, back-right, front-right, a quarter-cycle apart), each
//     foot on the ground about two thirds of the time;
//   - trot: diagonal pairs (back-left with front-right), each foot down a little under half the time.
// A foot on the ground stays planted (it moves back under the body at exactly the clip's travel speed, so played at
// the right rate nothing slides); a foot in the air lifts in an arc, its paw curled, and is set down ahead. The legs
// are solved by inverse kinematics (FABRIK) in each leg's own plane, starting from the model's rest pose, so knees and
// hocks keep bending the way the model was made. The back bobs, the head nods and the tail sways a little.
//
// The rig is found by Tripo's names: tripo::Root, N_Left|Right_Limb_k (N = 0 front, 1 back), Head_k, Tail_k.
// Whatever the walk was, the new 'walk' and 'trot' replace it (the old one is kept as 'tripo_walk_old' with --keep-old).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

export const GAITS = {
  // (six legs: a tripod gait, front and hind of one side with the middle of the other)
  walk6: { period: 0.9, stride: 0.8, duty: 0.6, lift: 0.22, bob: 0.008, nod: 0.02, tail: 0, phase: { frontLeft: 0, midRight: 0, hindLeft: 0, frontRight: 0.5, midLeft: 0.5, hindRight: 0.5 } },
  trot6: { period: 0.5, stride: 1.0, duty: 0.5, lift: 0.26, bob: 0.012, nod: 0.02, tail: 0, phase: { frontLeft: 0, midRight: 0, hindLeft: 0, frontRight: 0.5, midLeft: 0.5, hindRight: 0.5 } },
  walk: { period: 1.0, stride: 0.95, duty: 0.66, lift: 0.17, bob: 0.012, nod: 0.05, tail: 0.14, phase: { hindLeft: 0, frontLeft: 0.25, hindRight: 0.5, frontRight: 0.75 } },
  trot: { period: 0.6, stride: 1.35, duty: 0.44, lift: 0.24, bob: 0.03, nod: 0.03, tail: 0.1, phase: { hindLeft: 0, frontRight: 0, hindRight: 0.5, frontLeft: 0.5 } },
};
/**
 * (1.1.5) And the rest of what a four-legged enemy needs, built the same way (feet planted by IK where they stand):
 *   idle: standing, breathing, the head looking about; bite: a draw back and a lunge, the head down at the strike
 *   (its strike at 45%: the checker and the games read it so); fall: it goes over onto its side and stays.
 */
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export const MOVES = {
  idle: { period: 3.2, move: (t) => ({ body: [0, -0.01 * (1 - Math.cos(2 * Math.PI * t))], nod: 0.06 * Math.sin(2 * Math.PI * t * 2), yaw: 0.35 * Math.sin(2 * Math.PI * t), tail: 0.12 * Math.sin(2 * Math.PI * t * 2), legs: 'plant' }) },
  attack_bite: { period: 0.9, loop: false, move: (t) => {
    const back = t < 0.4 ? ease(t / 0.4) : 1 - ease((t - 0.4) / 0.12);
    const lunge = t < 0.4 ? 0 : t < 0.52 ? ease((t - 0.4) / 0.12) : 1 - ease((t - 0.52) / 0.48);
    return { body: [-0.16 * back + 0.42 * lunge, -0.07 * back - 0.03 * lunge], pitch: -0.1 * back + 0.16 * lunge, nod: -0.25 * back + 0.45 * lunge, tail: 0.3 * back, legs: 'plant' };
  } },
  fall: { period: 1.3, loop: false, move: (t) => ({ roll: 1.5 * ease(t / 0.7), body: [-0.1 * ease(t / 0.7), 0], nod: 0.4 * ease((t - 0.4) / 0.6), legs: t < 0.15 ? 'plant' : 'limp', ground: true }) },
};
const FPS = 30;

/** A three.js copy of the document's node tree (rest pose), with a map back to the glTF nodes. */
function mirror(doc) {
  const root = doc.getRoot();
  const map = new Map(); // gltf node -> Object3D
  const scene = new THREE.Group();
  const make = (n, parent) => {
    const o = new THREE.Object3D();
    o.name = n.getName();
    o.position.fromArray(n.getTranslation());
    o.quaternion.fromArray(n.getRotation());
    o.scale.fromArray(n.getScale());
    parent.add(o);
    map.set(n, o);
    for (const c of n.listChildren()) make(c, o);
  };
  for (const s of root.listScenes()) for (const n of s.listChildren()) make(n, scene);
  scene.updateMatrixWorld(true);
  return { scene, map };
}

const smooth = (x) => x * x * (3 - 2 * x);

/** Find the rig: legs (chains of joints, hip to toe), head and tail chains, the root. */
export function findRig(scene) {
  const legs = {};
  let root = null;
  const head = [], tail = [];
  scene.traverse((o) => {
    const m = /(\d)_(Left|Right)_Limb_(\d+)$/.exec(o.name);
    if (m) {
      const key = `${m[2]}${m[1]}`; // (1.1.5) 'Left0', 'Right2'...: which is front, middle or hind is found by where they are
      (legs[key] = legs[key] || [])[+m[3]] = o;
    }
    if (/::Root$/.test(o.name) || o.name === 'Root') root = root || o;
    const h = /Head_(\d+)$/.exec(o.name);
    if (h) head[+h[1]] = o;
    const t = /Tail_(\d+)$/.exec(o.name);
    if (t) tail[+t[1]] = o;
  });
  for (const k in legs) legs[k] = legs[k].filter(Boolean);
  // (1.1.5) a leg of only two joints (a Tripo hexapod's, now and then) takes the bone it hangs from as its hip
  for (const k in legs) if (legs[k].length === 2 && legs[k][0].parent && /bone_|Limb/.test(legs[k][0].parent.name)) legs[k].unshift(legs[k][0].parent);
  return { legs, root, head: head.filter(Boolean), tail: tail.filter(Boolean) };
}

const wpos = (o) => o.getWorldPosition(new THREE.Vector3());
const wquat = (o) => o.getWorldQuaternion(new THREE.Quaternion());

/** Turn a joint (in world space) so its child points along `dir`. */
function aim(joint, child, dir) {
  joint.updateMatrixWorld(true);
  const from = wpos(child).sub(wpos(joint)).normalize();
  const to = dir.clone().normalize();
  if (from.lengthSq() < 1e-12) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const world = wquat(joint);
  const parentWorld = joint.parent ? wquat(joint.parent) : new THREE.Quaternion();
  joint.quaternion.copy(parentWorld.invert().multiply(delta).multiply(world));
  joint.updateMatrixWorld(true);
}

/** FABRIK in a plane: positions P (P[0] fixed), segment lengths L, the end to `target`. Changes P. */
function fabrik(P, L, target, plane) {
  const base = P[0].clone();
  const proj = (v) => plane.projectPoint(v, v.clone());
  const reach = L.reduce((a, b) => a + b, 0);
  const t = proj(target.clone());
  if (t.distanceTo(base) >= reach * 0.999) {
    // out of reach: stretched toward it (but never quite straight, or the knee would flip)
    const d = t.clone().sub(base).normalize();
    t.copy(base).addScaledVector(d, reach * 0.995);
  }
  for (let it = 0; it < 24; it++) {
    P[P.length - 1].copy(t);
    for (let i = P.length - 2; i >= 0; i--) P[i].copy(proj(P[i].clone().sub(P[i + 1]).setLength(L[i]).add(P[i + 1])));
    P[0].copy(base);
    for (let i = 1; i < P.length; i++) P[i].copy(proj(P[i].clone().sub(P[i - 1]).setLength(L[i - 1]).add(P[i - 1])));
    if (P[P.length - 1].distanceTo(t) < 1e-5) break;
  }
}

/** Build the samples of one gait clip. Returns { times, tracks: [{ node, path, values }] , speed } */
export function buildGait(scene, rig, G) {
  const N = Math.round(G.period * FPS) + (G.loop === false ? 1 : 0);
  const joints = new Set();
  scene.traverse((o) => { if (/tripo|bone_|Limb|Spine|Head|Tail/.test(o.name)) joints.add(o); });
  const rest = new Map();
  scene.traverse((o) => rest.set(o, { p: o.position.clone(), q: o.quaternion.clone() }));
  const reset = () => { for (const [o, r] of rest) { o.position.copy(r.p); o.quaternion.copy(r.q); } scene.updateMatrixWorld(true); };
  reset();
  let legKeys = Object.keys(rig.legs).filter((k) => rig.legs[k].length >= 3);
  if (legKeys.length !== 4 && legKeys.length !== 6) throw new Error(`expected four or six legs, found ${legKeys.join(',')}`);
  // the body's axes, from the rest pose: toward the head from the middle of the hips (or the tail)
  const hips = legKeys.map((k) => wpos(rig.legs[k][0]));
  const mid = hips.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / hips.length);
  const fwd = (rig.head.length ? wpos(rig.head[0]).sub(mid) : mid.clone().sub(wpos(rig.tail[0]))); fwd.y = 0; fwd.normalize();
  // (1.1.5) each leg's role, by where it is along the body: front, (middle,) hind
  const roleOf = {};
  for (const sideName of ['Left', 'Right']) {
    const mine = legKeys.filter((k) => k.startsWith(sideName)).sort((a, b) => wpos(rig.legs[b][0]).dot(fwd) - wpos(rig.legs[a][0]).dot(fwd));
    const roles = mine.length === 3 ? ['front', 'mid', 'hind'] : ['front', 'hind'];
    mine.forEach((k, i) => (roleOf[k] = roles[i] + sideName));
  }
  // a parent leg before its children (a Tripo hexapod rig can hang one leg from another)
  legKeys = legKeys.sort((a, b) => depth(rig.legs[a][0]) - depth(rig.legs[b][0]));
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const legs = legKeys.map((k) => {
    const J = rig.legs[k];
    const P = J.map(wpos);
    const ankle = J.length - 2; // the last joint before the toe tip
    const L = [];
    for (let i = 0; i < ankle; i++) L.push(P[i].distanceTo(P[i + 1]));
    // the leg's own plane: through the hip and its ankle, along the body (so it swings fore and aft, as splayed as
    // the model is)
    const down = P[ankle].clone().sub(P[0]).normalize();
    const normal = new THREE.Vector3().crossVectors(fwd, down).normalize();
    if (normal.dot(side) < 0) normal.negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, P[0]);
    // which way each knee or hock sits off the hip-ankle line at rest (kept so: a solve never flips a joint)
    const bendSide = [];
    for (let i = 1; i < ankle; i++) bendSide[i] = Math.sign(new THREE.Vector3().crossVectors(P[i].clone().sub(P[0]), P[ankle].clone().sub(P[0])).dot(normal)) || 1;
    return { k: roleOf[k], J, ankle, L, restP: P, plane, normal, bendSide, hipH: P[0].y, pawDir: P[ankle + 1].clone().sub(P[ankle]), toeY: P[J.length - 1].y };
  });
  const ground = Math.min(...legs.map((l) => l.toeY));
  const legH = Math.min(...legs.map((l) => l.hipH - ground));
  const S = G.stride * legH, lift = G.lift * legH;
  const tracks = new Map(); // Object3D -> { q: [], p: [] }
  const keep = (o, withPos = false) => { if (!tracks.has(o)) tracks.set(o, { q: [], p: withPos ? [] : null }); return tracks.get(o); };
  const times = [];
  for (let f = 0; f < N; f++) {
    const t = f / N;
    times.push(G.loop === false ? (f / (N - 1)) * G.period : (f / N) * G.period);
    reset();
    const mv = G.move ? G.move(G.loop === false ? f / (N - 1) : t) : null;
    if (mv) {
      // a move: the body shifted (in leg-heights, along the body and up), tipped and rolled; the head and tail turned
      const r0 = rest.get(rig.root);
      const [dx, dy] = mv.body || [0, 0];
      rig.root.position.copy(r0.p).addScaledVector(fwd, dx * legH).addScaledVector(up, dy * legH);
      rig.root.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(fwd, mv.roll || 0).multiply(new THREE.Quaternion().setFromAxisAngle(side, mv.pitch || 0)).multiply(r0.q));
      if (rig.head[0]) rig.head[0].quaternion.copy(rest.get(rig.head[0]).q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), mv.nod || 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), mv.yaw || 0));
      if (rig.tail[0]) rig.tail[0].quaternion.copy(rest.get(rig.tail[0]).q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), mv.tail || 0));
      scene.updateMatrixWorld(true);
      if (mv.ground) {
        // lying down: the lowest bone kept on the ground
        let low = Infinity;
        scene.traverse((o) => { if (o !== rig.root && joints.has(o)) low = Math.min(low, wpos(o).y); });
        rig.root.position.y += ground + 0.03 * legH - low;
        scene.updateMatrixWorld(true);
      }
      if (mv.legs === 'plant') for (const l of legs) {
        const P = l.J.slice(0, l.ankle + 1).map(wpos);
        fabrik(P, l.L, l.restP[l.ankle].clone(), new THREE.Plane().setFromNormalAndCoplanarPoint(l.normal, P[0]));
        for (let i = 1; i < l.ankle; i++) {
          const axis = P[l.ankle].clone().sub(P[0]), rel = P[i].clone().sub(P[0]);
          if ((Math.sign(new THREE.Vector3().crossVectors(rel, axis).dot(l.normal)) || 1) !== l.bendSide[i]) { const ax = axis.clone().normalize(), along = ax.clone().multiplyScalar(rel.dot(ax)); P[i].copy(P[0]).add(along).sub(rel.clone().sub(along)); }
        }
        for (let i = 0; i < l.ankle; i++) aim(l.J[i], l.J[i + 1], P[i + 1].clone().sub(P[i]));
        aim(l.J[l.ankle], l.J[l.ankle + 1], l.pawDir.clone());
      }
      if (rig.root) keep(rig.root, true);
      for (const l of legs) for (let i = 0; i <= l.ankle; i++) keep(l.J[i]);
      if (rig.head[0]) keep(rig.head[0]);
      if (rig.tail[0]) keep(rig.tail[0]);
      for (const [o, tr] of tracks) { tr.q.push(...o.quaternion.toArray()); if (tr.p) tr.p.push(...o.position.toArray()); }
      continue;
    }
    // the body: down a little as each foot takes the weight (twice a cycle)
    if (rig.root) {
      rig.root.position.y = rest.get(rig.root).p.y - G.bob * legH * Math.cos(4 * Math.PI * t);
      rig.root.updateMatrixWorld(true);
    }
    if (rig.head[0] && !legs.some((l) => isUnder(l.J[0], rig.head[0]))) {
      // (a model whose front legs hang from its head, as Tripo sometimes rigs a boar, keeps its head still)
      rig.head[0].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), G.nod * Math.sin(4 * Math.PI * t + 0.6)));
    }
    if (rig.tail[0]) rig.tail[0].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), G.tail * Math.sin(2 * Math.PI * t)));
    scene.updateMatrixWorld(true);
    for (const l of legs) {
      const u = (t + G.phase[l.k] + 1) % 1;
      let off, up2 = 0, curl = 0;
      if (u < G.duty) off = S / 2 - S * (u / G.duty); // planted: the ground goes back under it
      else {
        const v = (u - G.duty) / (1 - G.duty);
        off = -S / 2 + S * smooth(v);
        up2 = lift * (l.k.startsWith('front') ? 0.8 : 1) * Math.pow(Math.sin(Math.PI * v), 0.85);
        curl = Math.sin(Math.PI * Math.min(1, v * 1.15));
      }
      const target = l.restP[l.ankle].clone().addScaledVector(fwd, off).addScaledVector(up, up2);
      const P = l.J.slice(0, l.ankle + 1).map(wpos);
      // start from the rest pose, moved with the body (keeps every knee bending its own way)
      fabrik(P, l.L, target, new THREE.Plane().setFromNormalAndCoplanarPoint(l.normal, P[0]));
      // a joint that came out on the wrong side of the hip-ankle line is mirrored back (knees bend their own way)
      for (let i = 1; i < l.ankle; i++) {
        const axis = P[l.ankle].clone().sub(P[0]);
        const rel = P[i].clone().sub(P[0]);
        if ((Math.sign(new THREE.Vector3().crossVectors(rel, axis).dot(l.normal)) || 1) !== l.bendSide[i]) {
          const ax = axis.clone().normalize();
          const along = ax.clone().multiplyScalar(rel.dot(ax));
          P[i].copy(P[0]).add(along).sub(rel.clone().sub(along));
        }
      }
      for (let i = 0; i < l.ankle; i++) aim(l.J[i], l.J[i + 1], P[i + 1].clone().sub(P[i]));
      // the paw: flat on the ground while planted; curled back in the air (toes trailing), more at mid-swing
      // (rotating about `side` by a positive angle turns a forward-pointing paw down and under: a flexed wrist or hock)
      const pawDir = l.pawDir.clone().applyAxisAngle(side, (l.k.startsWith('front') ? 0.75 : 0.7) * curl * Math.sign(l.pawDir.dot(fwd) || 1));
      aim(l.J[l.ankle], l.J[l.ankle + 1], pawDir);
    }
    // what moved this frame
    if (rig.root) keep(rig.root, true);
    for (const l of legs) for (let i = 0; i <= l.ankle; i++) keep(l.J[i]);
    if (rig.head[0]) keep(rig.head[0]);
    if (rig.tail[0]) keep(rig.tail[0]);
    for (const [o, tr] of tracks) {
      tr.q.push(...o.quaternion.toArray());
      if (tr.p) tr.p.push(...o.position.toArray());
    }
  }
  reset();
  return { times, tracks, speed: G.move ? 0 : S / (G.duty * G.period), legH, ground };
}

function depth(o) { let n = 0; for (let p = o.parent; p; p = p.parent) n++; return n; }
function isUnder(o, anc) { for (let p = o.parent; p; p = p.parent) if (p === anc) return true; return false; }

/** Add a clip to the document from built samples. */
function writeClip(doc, map, name, built) {
  const root = doc.getRoot();
  const buf = root.listBuffers()[0];
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor(`${name}_t`).setType('SCALAR').setArray(new Float32Array(built.times)).setBuffer(buf);
  const back = new Map([...map].map(([n, o]) => [o, n]));
  for (const [o, tr] of built.tracks) {
    const node = back.get(o);
    const add = (path, arr, type) => {
      const out = doc.createAccessor(`${name}_${o.name}_${path}`).setType(type).setArray(new Float32Array(arr)).setBuffer(buf);
      const s = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
    };
    add('rotation', tr.q, 'VEC4');
    if (tr.p) add('translation', tr.p, 'VEC3');
  }
  return anim;
}

async function main() {
  const [inp, out, ...flags] = process.argv.slice(2);
  const doc = await io.read(inp);
  const root = doc.getRoot();
  const { scene, map } = mirror(doc);
  const rig = findRig(scene);
  const made = {};
  const six = Object.values(rig.legs).filter((l) => l.length >= 3).length === 6;
  for (const [name, G] of Object.entries(GAITS)) if (name.endsWith('6') === six) made[name.replace('6', '')] = buildGait(scene, rig, G);
  for (const [name, G] of Object.entries(MOVES)) made[name] = buildGait(scene, rig, G);
  for (const a of root.listAnimations()) {
    if (!/walk|run|trot|idle|bite|fall/i.test(a.getName())) continue;
    if (flags.includes('--keep-old')) a.setName('tripo_walk_old');
    else a.dispose();
  }
  for (const [name, b] of Object.entries(made)) writeClip(doc, map, name, b);
  await io.write(out, doc);
  console.log(JSON.stringify({ legs: Object.keys(rig.legs), legH: +made.walk.legH.toFixed(3), walkSpeed: +made.walk.speed.toFixed(3), trotSpeed: +made.trot.speed.toFixed(3) }));
}
if (process.argv[1] && process.argv[1].endsWith('gait.mjs')) await main();
