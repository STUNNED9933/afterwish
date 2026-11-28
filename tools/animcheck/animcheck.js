// (1.1.4) The animation checker: every rigged model and every clip, played at a fixed step (so a slow test
// machine sees what a fast one does), looked over for what players notice. tools/animcheck/run.py drives it.
//
// Each finding is { model, clip, check, level: 'bad' | 'warn' | 'info', value, at, text }:
//   missing   an enemy without an idle, a walk, an attack, a hurt or a fall clip (fallbacks noted)
//   nan       a bone at NaN (the body vanishes or explodes)
//   sink      feet go into the ground (by more than 4% of the body's height)
//   float     a walk or idle with no foot on the ground for most of it
//   seam      a looping clip whose last pose is far from its first (it pops every loop)
//   slide     a walk played at the game's speed whose planted feet slide (the body outruns its feet, or the reverse)
//   cross     left and right legs passing through each other
//   bend      a leg joint bent far past anything in the model's own rest pose (a paw folded back on itself)
//   still     a walk in which the legs barely move (a T-pose shuffle)
//   tear      the skin itself bursting out (shards and spikes far from the body: broken skin weights)
import * as THREE from 'three';
import { RIGGED, loadRigged, stepSpeed } from '../../src/render/rigged.js';
import { CREATURES, PEOPLE } from '../../src/render/creatures.js';
import { ENEMIES } from '../../src/sim/defs.js';

const FPS = 30;
const LOOPS = /^(idle|walk|trot|run|gait_walk)/i;
const ATTACKS = /slash|chop|cast|fire|shoot|attack|smash|box|kick|stab|cleave/i;

/** The bones that make up legs and feet (by name), and the leaf bones that touch the ground. */
function anatomy(scene) {
  const bones = [];
  scene.traverse((o) => { if (o.isBone) bones.push(o); });
  const isLeg = (n) => /(leg|limb|thigh|calf|shin|foot|knee|toe|ankle)/i.test(n) && !/arm|hand|finger|0_(left|right)_limb/i.test(n);
  const isFrontLimb = (n) => /0_(left|right)_limb/i.test(n);
  const side = (n) => (/left|_l_|\bl_|\.l\b|_l$/i.test(n) ? 'L' : /right|_r_|\br_|\.r\b|_r$/i.test(n) ? 'R' : null);
  const legs = bones.filter((b) => isLeg(b.name) || isFrontLimb(b.name));
  const feet = bones.filter((b) => !b.children.some((c) => c.isBone) && (isLeg(b.name) || isFrontLimb(b.name) || /foot|toe/i.test(b.name)));
  return { bones, legs, feet, side };
}

const wp = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);

/** Pose a template at time t of a clip (a mixer per check, removed after). */
function poser(scene, clip) {
  const saved = [];
  scene.traverse((o) => { if (o.isBone) saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const mixer = new THREE.AnimationMixer(scene);
  const act = mixer.clipAction(clip);
  act.play();
  return {
    at(t) { act.time = t; mixer.update(0); scene.updateMatrixWorld(true); },
    done() { act.stop(); mixer.uncacheRoot(scene); for (const [o, p, q, s] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); } scene.updateMatrixWorld(true); },
  };
}

/** Closest distance between two segments. */
function segDist(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) return p1.distanceTo(p2);
  if (a < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

/** Everything about one model. `uses`: how the game uses it ({ enemy: def, height, beast, gait }). */
export function checkModel(id, tpl, uses = {}) {
  const out = [];
  const add = (clip, check, level, value, at, text) => out.push({ model: id, clip, check, level, value: +(+value).toFixed(3), at: at == null ? null : +at.toFixed(2), text });
  const scene = tpl.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const H = Math.max(0.01, box.max.y - box.min.y);
  const A = anatomy(scene);
  const rest = new Map(A.bones.map((b) => [b, wp(b)]));
  // the ground: where the soles are in the model's own pose (its box's floor), as the game stands it
  // (creatures stand with their model's origin on the ground; heroes are lifted by their pose's lowest point)
  const ground = tpl.spec && tpl.spec.recentre === '*' ? 0 : box.min.y;
  const DOWN = /fall|death|defeat|die|lay|roll|knock|kneel|sit|crouch|dodge|slide|lunge|land|jump/i; // clips that go down to the ground on purpose
  const names = Object.keys(tpl.clips).filter((n) => !n.startsWith('__'));
  // the clips an enemy needs
  if (uses.enemy) {
    const has = (re) => names.some((n) => re.test(n));
    if (!has(/idle|standing|wait/i)) add('', 'missing', 'warn', 0, null, 'no idle clip (it stands frozen, or walks on the spot)');
    if (!has(/walk|march|run|trot/i)) add('', 'missing', uses.float ? 'info' : 'bad', 0, null, 'no walk clip (it slides about)');
    if (!has(ATTACKS)) add('', 'missing', uses.float ? 'info' : uses.beast ? 'warn' : 'bad', 0, null, uses.beast ? 'no attack clip (Lacuna lunges it by hand; the main game does not)' : 'no attack clip (its blows land with no swing)');
    if (!has(/hit|hurt/i)) add('', 'missing', 'info', 0, null, 'no hurt clip (no flinch when struck)');
    if (!has(/fall|death|defeat|die/i)) add('', 'missing', 'warn', 0, null, 'no fall clip (it vanishes where it stood)');
  }
  // the skinned meshes, and how big the body is at rest (for 'tear': the skin pulled far out of it)
  const skins = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
  // a sample of the skin's triangle edges, and their length at rest. Skin torn by its weights stretches into long
  // shards and spikes: edges many times their rest length, and long in the world. (A prop that hides by shrinking
  // only gets shorter.)
  const edges = [];
  for (const m of skins) {
    const pos = m.geometry.attributes.position;
    if (!pos || !m.geometry.attributes.skinWeight) continue;
    const idx = m.geometry.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    const step = Math.max(1, Math.floor(tris / 1500));
    const at = (k) => (idx ? idx.getX(k) : k);
    for (let t = 0; t < tris; t += step) {
      const a = at(3 * t), b = at(3 * t + 1);
      const va = m.getVertexPosition(a, new THREE.Vector3()).applyMatrix4(m.matrixWorld), vb = m.getVertexPosition(b, new THREE.Vector3()).applyMatrix4(m.matrixWorld);
      edges.push({ m, a, b, L: va.distanceTo(vb) });
    }
  }
  // leg bone pairs, left against right (for passing through each other)
  const legSegs = A.legs.filter((b) => b.parent && b.parent.isBone && A.legs.includes(b.parent)).map((b) => ({ a: b.parent, b, side: A.side(b.name), front: /0_(left|right)_limb/i.test(b.name) }));
  const pairs = [];
  for (const s of legSegs) for (const t of legSegs) if (s.side === 'L' && t.side === 'R' && s.front === t.front) pairs.push([s, t]);
  // how far each leg bone points from its rest direction, at rest it is 0
  const restDir = new Map(legSegs.map((s) => [s.b, rest.get(s.b).clone().sub(rest.get(s.a)).normalize()]));
  for (const name of names) {
    const clip = tpl.clips[name];
    const P = poser(scene, clip);
    const n = Math.max(2, Math.round(clip.duration * FPS));
    let nan = false, sink = -Infinity, sinkAt = 0, airborne = 0, cross = Infinity, crossAt = 0, bend = 0, bendAt = 0, bendBone = '', crossBones = '', legMove = 0;
    const first = [], last = [];
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    const legStart = new Map();
    let tear = 0, tearAt = 0;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * clip.duration;
      P.at(Math.min(t, clip.duration - 1e-4));
      for (const b of A.bones) {
        wp(b, v);
        if (!Number.isFinite(v.x + v.y + v.z)) nan = true;
        if (i === 0) first.push(v.clone());
        if (i === n) last.push(v.clone());
      }
      if (A.feet.length) {
        const low = Math.min(...A.feet.map((f) => wp(f, v).y));
        if (ground - low > sink) { sink = ground - low; sinkAt = t; }
        if (low - ground > 0.09 * H) airborne++;
      }
      for (const [s, u] of pairs) {
        const d = segDist(wp(s.a), wp(s.b), wp(u.a), wp(u.b));
        if (d < cross) { cross = d; crossAt = t; crossBones = `${s.b.name} / ${u.b.name}`; }
      }
      if (edges.length && i % Math.max(1, Math.round(n / 10)) === 0) {
        // the share of edges stretched to over three times their rest length and over 8% of the body's height
        let torn = 0;
        for (const E of edges) {
          const L2 = E.m.getVertexPosition(E.a, v).applyMatrix4(E.m.matrixWorld).distanceTo(E.m.getVertexPosition(E.b, w).applyMatrix4(E.m.matrixWorld));
          if (L2 > 3 * E.L && L2 > 0.08 * H) torn++;
        }
        if (torn / edges.length > tear) { tear = torn / edges.length; tearAt = t; }
      }
      for (const s of legSegs) {
        const dir = wp(s.b, v).sub(wp(s.a, w)).normalize();
        const ang = dir.angleTo(restDir.get(s.b));
        if (ang > bend) { bend = ang; bendAt = t; bendBone = s.b.name; }
        const p = wp(s.b);
        if (!legStart.has(s.b)) legStart.set(s.b, p.clone());
        legMove = Math.max(legMove, p.distanceTo(legStart.get(s.b)));
      }
    }
    P.done();
    if (nan) add(name, 'nan', 'bad', 1, null, 'a bone goes to NaN');
    if (tear > 0.0015) add(name, 'tear', tear > 0.004 ? 'bad' : 'warn', tear, tearAt, `${(tear * 100).toFixed(1)}% of its skin stretches into shards or spikes (broken skin weights)`);
    if (sink > (DOWN.test(name) ? 0.08 : 0.03) * H) add(name, 'sink', DOWN.test(name) ? 'warn' : 'bad', sink / H, sinkAt, `a foot goes ${Math.round((sink / H) * 100)}% of its height into the ground`);
    if (/^(idle|walk|trot)/i.test(name) && A.feet.length && !uses.float && airborne > 0.6 * (n + 1)) add(name, 'float', 'warn', airborne / (n + 1), null, 'no foot on the ground for most of it (it hovers)');
    if (LOOPS.test(name) && first.length) {
      const rms = Math.sqrt(first.reduce((a, p, k) => a + p.distanceToSquared(last[k]), 0) / first.length) / H;
      if (rms > 0.03) add(name, 'seam', rms > 0.08 ? 'bad' : 'warn', rms, clip.duration, `its last pose is ${Math.round(rms * 100)}% of its height from its first (it pops each loop)`);
    }
    if (cross < 0.006 * H && pairs.length) add(name, 'cross', /^(walk|trot|run|gait_walk)/i.test(name) ? 'bad' : 'warn', cross / H, crossAt, `its left and right legs pass through each other (${crossBones})`);
    if (bend > 2.3) add(name, 'bend', /^(walk|trot|run|idle)/i.test(name) ? 'bad' : 'warn', (bend * 180) / Math.PI, bendAt, `${bendBone} turns ${Math.round((bend * 180) / Math.PI)}° from its rest pose (a joint folded back on itself)`);
    if (/^(walk|trot)/i.test(name) && legSegs.length && legMove < 0.04 * H) add(name, 'still', 'bad', legMove / H, null, 'the legs barely move in its walk');
    // the walk at the game's speed: do the planted feet keep pace with the ground?
    if (/^(walk|gait_walk)/i.test(name) && uses.speed && A.feet.length) {
      const k = (tpl.scale || 1) * (uses.height || 1);
      const foot = stepSpeed(scene, clip) * k; // metres a second at timeScale 1
      let ts;
      // as creatures.js plays it
      if (tpl.gait) ts = uses.speed / Math.max(1e-3, (tpl.gait.walk || foot / k) * k);
      else if (tpl.step > 0.02 && !uses.float) ts = Math.max(0.45, Math.min(3.6, uses.speed / (tpl.step * k)));
      else ts = Math.max(0.6, Math.min(2.2, uses.speed / (uses.beast ? 4 : 2.6)));
      if (tpl.gait && uses.speed > tpl.gait.walk * k * 1.7) ts = null; // it trots at that speed (checked below)
      if (ts != null && foot > 0) {
        const ratio = (foot * ts) / uses.speed; // 1 = feet planted
        if (Math.abs(1 - ratio) > 0.35) add(name, 'slide', Math.abs(1 - ratio) > 0.6 ? 'bad' : 'warn', ratio, null, `at its game speed (${uses.speed} m/s) its planted feet move at ${Math.round(ratio * 100)}% of the ground's pace (${ratio < 1 ? 'it glides' : 'its feet skid'})`);
      }
    }
  }
  return { findings: out, height: H, bones: A.bones.length, clips: names };
}

/** Every model the games use, with how they use it. */
export function inventory() {
  const list = new Map();
  for (const [type, c] of Object.entries(CREATURES)) {
    const def = ENEMIES[type];
    if (!list.has(c.model)) list.set(c.model, { enemy: !!def, beast: !!c.beast, float: c.float != null, height: c.height, speed: def && def.speed, types: [] });
    list.get(c.model).types.push(type);
  }
  for (const [type, c] of Object.entries(PEOPLE)) if (!list.has(c.model)) list.set(c.model, { height: c.height, speed: 1.6, types: [type] });
  for (const id of Object.keys(RIGGED)) if (!list.has(id)) list.set(id, { height: RIGGED[id].height || 1, speed: id.startsWith('hero_') ? 1.8 : 2.6, types: [] });
  // Lacuna's own (it registers them as it loads; listed here so the checker sees them too)
  if (!RIGGED.e_thornhog) RIGGED.e_thornhog = { url: 'models/e_thornhog.glb', height: 1, turn: -Math.PI / 2, recentre: '*', rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis', 'Hips'] };
  list.set('e_thornhog', { enemy: true, beast: true, height: 0.8, speed: 4.2, types: ['lacuna:hog'] });
  if (list.has('e_wolf')) list.get('e_wolf').types.push('lacuna:wolf');
  return list;
}

/** Run it all (or the ids given). */
export async function runAll(only = null) {
  const list = inventory();
  const report = { models: {}, findings: [] };
  for (const [id, uses] of list) {
    if (only && !only.includes(id)) continue;
    let tpl = null;
    try { tpl = await loadRigged(id); } catch (err) { /* reported below */ }
    if (!tpl) { report.findings.push({ model: id, clip: '', check: 'load', level: 'bad', value: 0, at: null, text: 'the model did not load' }); continue; }
    const r = checkModel(id, tpl, uses);
    report.models[id] = { types: uses.types, clips: r.clips, height: +r.height.toFixed(2), bones: r.bones };
    report.findings.push(...r.findings);
  }
  return report;
}

/** A strip of frames of one clip (side view), for a finding: returns a PNG data URL. */
export async function strip(id, clipName, times, side = true) {
  const tpl = await loadRigged(id);
  if (!tpl) return null;
  const W = 200, Hh = 240;
  const r = strip.r || (strip.r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
  r.setSize(W * times.length, Hh);
  r.setClearColor(0xdde4ee);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const holder = new THREE.Group();
  holder.add(tpl.scene);
  scene.add(holder);
  const box = new THREE.Box3().setFromObject(tpl.scene);
  // the ground the game stands it on (a line where the feet should be)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a9a7a, transparent: true, opacity: 0.55 }));
  floor.position.y = tpl.spec && tpl.spec.recentre === '*' ? 0 : box.min.y;
  scene.add(floor);
  const h = box.max.y - box.min.y, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const cam = new THREE.PerspectiveCamera(30, W / Hh, 0.01, 100);
  const len = Math.max(h, box.max.x - box.min.x, box.max.z - box.min.z);
  // from the side: looking across the body's longer axis
  const alongX = box.max.x - box.min.x >= box.max.z - box.min.z;
  if (!side) cam.position.set(alongX ? cx + len * 3.2 : cx, box.min.y + h * 0.5, alongX ? cz : cz + len * 3.2);
  else cam.position.set(alongX ? cx : cx + len * 2.1, box.min.y + h * 0.5, alongX ? cz + len * 2.1 : cz);
  cam.lookAt(cx, box.min.y + h * 0.45, cz);
  const P = poser(tpl.scene, tpl.clips[clipName]);
  r.setScissorTest(true);
  times.forEach((t, i) => {
    P.at(Math.min(t, tpl.clips[clipName].duration - 1e-4));
    r.setViewport(i * W, 0, W, Hh);
    r.setScissor(i * W, 0, W, Hh);
    r.render(scene, cam);
  });
  r.setScissorTest(false);
  P.done();
  holder.remove(tpl.scene);
  floor.geometry.dispose();
  return r.domElement.toDataURL('image/png');
}

/** A clip's length (for strips). */
export async function duration(id, clip) { const t = await loadRigged(id); return t && t.clips[clip] ? t.clips[clip].duration : 1; }

window.animcheck = { runAll, strip, inventory, duration };
