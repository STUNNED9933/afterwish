// Rigged, animated character models (0.35), made with the Tripo API (tools/models).
// Each model is loaded once, when first needed, and copied for every character that uses it.
// Until it has loaded, or if it cannot load (opening the game from a file, no network), the
// hand-built model from models.js stays: nothing about the game depends on these.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { addRim } from './environment.js';

/**
 * What each model is and how its clips map to what the character is doing.
 * height: metres in game; turn: rotation so the model faces +Z like the hand-built ones;
 * hand: the bone a weapon is held by (the blade along the bone's +Z);
 * attack: the part of a clip that is the swing itself (seconds), played fast for each attack.
 */
export const RIGGED = {
  hero_warrior: {
    url: 'models/warrior.glb',
    height: 2.05,
    turn: -Math.PI / 2,
    hand: 'R_Hand',
    weaponScale: 0.82,
    // The blade runs between the hand bone's +Y and +Z: lowered at rest, overhead in the
    // wind-up, forward and down at the strike. While running it trails back and low instead
    // (the pumping arm would flip it up and down). trail: blade direction in model space.
    gripTilt: -Math.PI / 4,
    trail: [-0.55, -0.83, 0.1],
    idle: 'idle',
    run: 'run',
    death: 'ual_Death',
    deathFrom: 0.45, // skip the stagger at the start: he drops when the blow lands
    hit: 'hit',
    attack: { clip: 'attack', from: 1.6, to: 2.7 },
    // 0.37.3: basic attacks alternate two slashes that flow into each other (up and across, then
    // down and back), from the same library as the skills; after a pause it starts again.
    attacks: [
      { clip: 'ual_SlashA', from: 0.08, to: 0.43 },
      { clip: 'ual_SlashB', from: 0.08, to: 0.45 },
    ],
    // Skills (0.36): sword moves from Quaternius' Universal Animation Library (CC0), moved onto
    // this skeleton by tools/models/retarget.js. Those clips hold the blade along the hand's +Z.
    // keys: [seconds since the cast, clip time] (the clip is played through these, so a move can
    // wind up quickly, strike on time and recover slowly). land: the key that must line up with
    // the end of a dash or leap (keys up to it stretch with its duration). stop: a short freeze
    // at the moment of impact. slash: when the blade leaves a glowing trail.
    libraryGrip: /^ual_/,
    moves: {
      cone: { clip: 'ual_Cleave', keys: [[0, 0.85], [0.12, 1.1], [0.22, 1.3], [0.5, 1.45]], stop: [0.2, 0.05], slash: [0.06, 0.3], fade: 0.3 },
      dash: { clip: 'ual_Lunge', keys: [[0, 0.02], [0.12, 0.27], [0.2, 0.42], [0.5, 0.95], [0.8, 1.42]], land: 2, slash: [0.1, 0.3], fade: 0.3 },
      leap: { clip: 'ual_Smash', keys: [[0, 2.1], [0.42, 2.5], [0.5, 2.64], [0.85, 3.2], [1.3, 3.98]], land: 2, stop: [0.5, 0.08], slash: [0.36, 0.62], fade: 0.35 },
    },
    // Whirlwind: crouched, blade held out flat, while the game turns the whole model.
    spin: { clip: 'ual_Spin', at: 0.57 },
    rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis'],
  },
  // The Archer (0.37): her idle, run and flinch are Tripo's; every shot, the skills, the roll and
  // the fall are our own, posed in code (tools/models/archer-moves.js). She holds a bow made here,
  // whose string follows her drawing hand.
  hero_archer: {
    url: 'models/archer.glb',
    height: 1.92,
    turn: -Math.PI / 2,
    hand: 'L_Hand',
    bow: { drawHand: 'R_Hand', shoulder: 'L_Upperarm' },
    idle: 'idle',
    run: 'arc_run', // her own (Tripo's sprint leaned too hard for a bow)
    runRef: 5.6, // the speed it is played at its own pace (quicker, shorter strides)
    death: 'arc_death',
    hit: 'hit',
    // a whole draw-and-loose cycle, played over the time between two shots (the arrow leaves
    // 30% of the way in, when the game fires it)
    attack: { clip: 'arc_shot', cycle: true, fadeIn: 0.14 }, // (dropping to the kneel takes a moment)
    aiming: /^arc_(shot|power|barrage|volley)$/,
    moves: {
      line: { clip: 'arc_power', keys: [[0, 0], [0.9, 0.9]], fade: 0.25 },
      deadeye: { clip: 'arc_power', keys: [[0, 0], [0.9, 0.9]], fade: 0.25 },
      ricochet: { clip: 'arc_power', keys: [[0, 0.2], [0.6, 0.85]], fade: 0.2 },
      barrage: { clip: 'arc_barrage', keys: [[0, 0], [0.85, 0.85]], fade: 0.25 },
      zone: { clip: 'arc_volley', keys: [[0, 0], [1, 1]], fade: 0.3 },
      dash: { clip: 'arc_roll', keys: [[0, 0], [0.36, 0.36], [0.55, 0.55]], land: 1, fade: 0.2 },
    },
    recentre: ['idle', 'run', 'hit'],
    recentreMin: 0.04,
    rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis'],
  },
  // The Rogue (0.37.3): Tripo's idle and flinch; jab and cross stabs from the library, one per
  // hand, alternating; his run, Mercy Stroke / Last Rites, Fan of Knives, Nightstep and the fall
  // are our own (tools/models/rogue-moves.js). A dagger in each hand.
  hero_rogue: {
    url: 'models/rogue.glb',
    height: 2.0,
    turn: -Math.PI / 2,
    hand: 'R_Hand',
    offhand: 'L_Hand',
    weaponScale: 0.82,
    idle: 'idle',
    run: 'rog_run',
    runRef: 6.0,
    death: 'rog_death',
    hit: 'hit',
    attack: { clip: 'ual_Punch_Cross', from: 0.05, to: 0.75 },
    attacks: [
      { clip: 'ual_Punch_Jab', from: 0.0, to: 0.6 }, // the left blade
      { clip: 'ual_Punch_Cross', from: 0.05, to: 0.75 }, // the right
    ],
    moves: {
      strike: { clip: 'rog_stab', keys: [[0, 0], [0.7, 0.7]], stop: [0.13, 0.04], slash: [0.04, 0.22], fade: 0.25 },
      dash: { clip: 'rog_dash', keys: [[0, 0], [0.13, 0.13], [0.6, 0.6]], land: 1, slash: [0.02, 0.14], fade: 0.15 },
      kunai: { clip: 'rog_throw', keys: [[0, 0], [0.55, 0.55]], fade: 0.12 }, // (0.42) Starglass Kunai
    },
    spin: { clip: 'rog_spin', at: 0.05 },
    recentre: ['idle', 'hit'],
    recentreMin: 0.04,
    rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis'],
  },
  // The rogue once he has chosen Assassin or Shadowdancer (0.42): a hooded ninja in a steel mask,
  // the same moves (tools/models/rogue-moves.js baked onto his own rig).
  get hero_ninja() {
    return { ...RIGGED.hero_rogue, url: 'models/ninja.glb', height: 2.0 };
  },
  // The Mage (0.37.3): Tripo's idle and flinch; Frozen Orb is an overhand throw from the
  // library; her run, sparks, Fire Bolt, Starwake, Meteor and the fall are our own
  // (tools/models/mage-moves.js). Her staff stays upright, leaning with her forearm.
  hero_mage: {
    url: 'models/mage.glb',
    height: 1.9,
    turn: -Math.PI / 2,
    hand: 'R_Hand',
    staff: true,
    weaponScale: 0.82,
    idle: 'idle',
    run: 'mag_run',
    runRef: 5.6,
    death: 'mag_death',
    hit: 'hit',
    attack: { clip: 'mag_cast', cycle: true, fadeIn: 0.1 },
    moves: {
      bolt: { clip: 'mag_bolt', keys: [[0, 0], [0.8, 0.8]], fade: 0.25 },
      orb: { clip: 'ual_OverhandThrow', keys: [[0, 0.15], [0.16, 0.38], [0.7, 1.0], [0.9, 1.3]], fade: 0.25 },
      dash: { clip: 'mag_blink', keys: [[0, 0], [0.08, 0.08], [0.55, 0.55]], land: 1, fade: 0.2 },
      meteor: { clip: 'mag_meteor', keys: [[0, 0], [1.2, 1.2]], fade: 0.3 },
    },
    recentre: ['idle', 'hit'],
    recentreMin: 0.04,
    rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis'],
  },
};

/**
 * Weapon models (0.38.1), made with the Tripo API as props. Each is measured once in its own
 * file (tools/models: the long axis and its ends); here it is turned so the blade (or the
 * staff's head) points along +Z from the grip at the origin, as the hand-built weapons did,
 * and sized in the same units (metres / weaponScale). side: the file's axis the guard runs along.
 */
export const WEAPON_MODELS = {
  warrior: { url: 'models/w_sword.glb', tip: [0, -0.5, 0], butt: [0, 0.5, 0], grip: 0.13, length: 1.15, side: [0, 0, 1] },
  rogue: { url: 'models/w_dagger.glb', tip: [0.158, -0.5, 0.424], butt: [-0.116, 0.479, -0.404], grip: 0.2, length: 0.55 },
  mage: { url: 'models/w_staff.glb', tip: [-0.004, 0.5, -0.014], butt: [0.001, -0.5, 0.007], grip: 0.4, length: 1.85 },
  // Weapon looks by rarity (0.48), made with Tripo; tip, butt and guard measured by tools/models/calib.mjs
  warrior_edric: { url: 'models/w_edric.glb', tip: [-0.03, -0.433, 0.493], butt: [0.02, 0.399, -0.501], grip: 0.13, length: 1.2, side: [-0.647, 0.6, 0.47] },
  warrior_fine: { url: 'models/w_sword_fine.glb', tip: [0, -0.5, 0], butt: [0, 0.5, 0], grip: 0.13, length: 1.15, side: [0, 0, 1] },
  warrior_ancient: { url: 'models/w_sword_ancient.glb', tip: [-0.189, 0.487, -0.497], butt: [0.175, -0.496, 0.491], grip: 0.13, length: 1.15, side: [-0.471, 0.532, 0.704] },
  warrior_immortal: { url: 'models/w_sword_immortal.glb', tip: [-0.313, 0.494, -0.493], butt: [0.29, -0.491, 0.488], grip: 0.13, length: 1.2, side: [-0.391, 0.519, 0.76] },
  rogue_fine: { url: 'models/w_dagger_fine.glb', tip: [0.252, -0.507, 0.445], butt: [-0.234, 0.487, -0.436], grip: 0.2, length: 0.55, side: [-0.321, 0.535, 0.781] },
  rogue_ancient: { url: 'models/w_dagger_ancient.glb', tip: [-0.065, 0.477, -0.504], butt: [0.035, -0.493, 0.468], grip: 0.2, length: 0.55, side: [-0.288, 0.663, 0.691] },
  rogue_immortal: { url: 'models/w_dagger_immortal.glb', tip: [0.415, -0.542, 0.32], butt: [-0.387, 0.48, -0.382], grip: 0.2, length: 0.58, side: [-0.209, 0.437, 0.875] },
  mage_fine: { url: 'models/w_staff_fine.glb', tip: [-0.001, 0.5, 0.003], butt: [0.001, -0.5, -0.001], grip: 0.4, length: 1.85 },
  mage_ancient: { url: 'models/w_staff_ancient.glb', tip: [0.001, 0.498, -0.005], butt: [0.001, -0.5, 0.012], grip: 0.4, length: 1.85 },
  mage_immortal: { url: 'models/w_staff_immortal.glb', tip: [-0.028, 0.486, -0.407], butt: [0.077, -0.509, 0.401], grip: 0.4, length: 1.9 },
};
const weaponCache = new Map();

/**
 * Weapon looks by rarity (0.48): Common to Rare carry the plain weapon; Epic and Mythic a finer one;
 * Ancient an old royal one; Immortal a radiant one of starglass. Edric's Sword is its own.
 */
export function weaponLook(item) {
  if (!item) return null;
  if (item.effect === 'edric') return 'edric';
  if (item.rarity >= 6) return 'immortal';
  if (item.rarity >= 5) return 'ancient';
  if (item.rarity >= 3) return 'fine';
  return null;
}

/** A fresh copy of a class's weapon model (its own materials, so its glow is its own), or null. */
/**
 * Where a held thing sits (0.48.1): the middle of the palm, a little past the wrist, as a point in the
 * hand bone's own space. The rigs have no finger bones, so the palm is found along the forearm's line,
 * a share of the forearm's length past the wrist (read in the bind pose, before any clip plays).
 */
export const PALM = 0.42;
export function palmOf(hand, share = PALM) {
  if (!hand) return new THREE.Vector3();
  return hand.position.clone().applyQuaternion(hand.quaternion.clone().invert()).multiplyScalar(share);
}

export function loadWeapon(cls, weaponScale = 1, look = null) {
  const key = look && WEAPON_MODELS[`${cls}_${look}`] ? `${cls}_${look}` : cls;
  const w = WEAPON_MODELS[key];
  if (!w) return Promise.resolve(null);
  if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve(null);
  if (!weaponCache.has(key)) {
    weaponCache.set(
      key,
      loader.loadAsync(w.url).then(
        (gltf) => gltf.scene,
        () => null,
      ),
    );
  }
  return weaponCache.get(key).then((scene) => {
    if (!scene) return null;
    const inner = scene.clone();
    const mats = [];
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.castShadow = true;
      mats.push(o.material);
    });
    const tip = new THREE.Vector3(...w.tip), butt = new THREE.Vector3(...w.butt);
    const along = tip.clone().sub(butt);
    const grip = butt.clone().addScaledVector(along, w.grip);
    const dir = along.clone().normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 0, 1));
    if (w.side) {
      // twist about the blade so the guard lies along +X
      const side = new THREE.Vector3(...w.side).applyQuaternion(turn);
      side.z = 0;
      if (side.lengthSq() > 1e-6) turn.premultiply(new THREE.Quaternion().setFromUnitVectors(side.normalize(), new THREE.Vector3(1, 0, 0)));
    }
    inner.position.copy(grip).negate();
    const pivot = new THREE.Group();
    pivot.quaternion.copy(turn);
    pivot.scale.setScalar(w.length / weaponScale / along.length());
    pivot.add(inner);
    const group = new THREE.Group();
    group.add(pivot);
    group.userData.mats = mats;
    return group;
  });
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map(); // id -> Promise<template | null>

/** Load a model once (null if it cannot be loaded here). */
export function loadRigged(id) {
  const spec = RIGGED[id];
  if (!spec) return Promise.resolve(null);
  if (typeof location !== 'undefined' && location.protocol === 'file:') return Promise.resolve(null); // browsers block loading files from file://
  if (!cache.has(id)) {
    cache.set(
      id,
      loader
        .loadAsync(spec.url)
        .then((gltf) => prepare(spec, gltf))
        .catch((err) => {
          console.warn(`Model ${id} did not load; keeping the hand-built one.`, err && err.message);
          return null;
        }),
    );
  }
  return cache.get(id);
}

/** One-time work on a loaded model: size, clips cut and cleaned, shared things marked. */
function prepare(spec, gltf) {
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const scale = spec.height / Math.max(0.01, box.max.y - box.min.y);
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds do not follow the animation
      o.geometry.userData.keep = true; // shared by every copy
      const m = o.material;
      if (m && m.map) m.map.userData.keep = true;
    }
  });
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  const h = box.max.y - box.min.y;
  if (clips[spec.run]) stripDrift(clips[spec.run], spec.rootBones);
  for (const name of spec.recentre || [spec.run]) if (clips[name]) recentre(clips[name], spec.rootBones, scene, spec.recentreMin ?? 0.15, h);
  (spec.attacks || []).forEach((a, i) => {
    if (clips[a.clip]) clips[`__attack${i}`] = THREE.AnimationUtils.subclip(clips[a.clip], a.clip, Math.round(a.from * 30), Math.round(a.to * 30), 30);
  });
  if (spec.attack && spec.attack.cycle && clips[spec.attack.clip]) clips.__attack = clips[spec.attack.clip];
  else if (spec.attack && clips[spec.attack.clip]) {
    const src = clips[spec.attack.clip];
    const fps = 30;
    clips.__attack = THREE.AnimationUtils.subclip(src, 'attack', Math.round(spec.attack.from * fps), Math.round(spec.attack.to * fps), fps);
  }
  return { spec, scene, scale, clips };
}

/** Remove forward travel from a run cycle, keeping its bob and sway (the game moves the character). */
function stripDrift(clip, rootBones) {
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (prop !== 'position' || !rootBones.includes(bone)) continue;
    const v = t.values;
    const n = v.length / 3;
    if (n < 2) continue;
    const dx = v[(n - 1) * 3] - v[0], dy = v[(n - 1) * 3 + 1] - v[1], dz = v[(n - 1) * 3 + 2] - v[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) continue;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    for (let i = 0; i < n; i++) {
      const ox = v[i * 3] - v[0], oy = v[i * 3 + 1] - v[1], oz = v[i * 3 + 2] - v[2];
      const along = ox * ux + oy * uy + oz * uz;
      v[i * 3] -= along * ux;
      v[i * 3 + 1] -= along * uy;
      v[i * 3 + 2] -= along * uz;
    }
  }
}

/**
 * Some "in place" clips sit off to one side of where the character stands (a Tripo run had its
 * hips over half a body-height forward, the Archer's idle stands a step to her left). Move the
 * hips back over the rest pose's spot, across the ground only (the bob and a lower stance stay),
 * when they are more than minFrac of the model's height away from it.
 */
function recentre(clip, rootBones, scene, minFrac = 0.15, height = 1) {
  scene.updateMatrixWorld(true);
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (prop !== 'position' || !rootBones.includes(bone)) continue;
    const node = scene.getObjectByName(bone);
    if (!node) continue;
    const pm = node.parent.matrixWorld;
    const pmInv = pm.clone().invert();
    const rest = node.position.clone().applyMatrix4(pm);
    const v = t.values;
    const n = v.length / 3;
    const p = new THREE.Vector3();
    const mean = new THREE.Vector3();
    for (let i = 0; i < n; i++) mean.add(p.fromArray(v, i * 3).applyMatrix4(pm).divideScalar(n));
    const dx = rest.x - mean.x, dz = rest.z - mean.z;
    if (Math.hypot(dx, dz) < minFrac * height) continue;
    for (let i = 0; i < n; i++) {
      p.fromArray(v, i * 3).applyMatrix4(pm);
      p.x += dx;
      p.z += dz;
      p.applyMatrix4(pmInv).toArray(v, i * 3);
    }
  }
}

/**
 * A copy of a loaded model with its own animation player. state() picks the clip each frame:
 * { dead, attackStart (true on the frame an attack begins), attackDur, moving, speed }.
 */
export function instantiate(tpl) {
  const { spec, clips } = tpl;
  const root = SkeletonUtils.clone(tpl.scene);
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = addRim(o.material.clone(), 0x9fb8ff, 0.3);
    mats.push(o.material);
  });
  const holder = new THREE.Group();
  holder.rotation.y = spec.turn || 0;
  holder.scale.setScalar(tpl.scale);
  holder.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const act = (name, once) => {
    const c = clips[name];
    if (!c) return null;
    const a = mixer.clipAction(c);
    if (once) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    return a;
  };
  const actions = { idle: act(spec.idle), run: act(spec.run), attack: act('__attack', true), death: act(spec.death, true), hit: act(spec.hit, true) };
  // alternating basic attacks (spec.attacks), in place of the single one
  const combo = (spec.attacks || []).map((_, i) => act(`__attack${i}`, true)).filter(Boolean);
  let comboAt = 0;
  let sinceAttack = 99;
  if (combo.length) actions.attack = combo[0];
  // Skill moves and the spin pose are posed by hand each frame (time set, not played).
  const moves = {};
  for (const [k, m] of Object.entries(spec.moves || {})) {
    const a = act(m.clip, true);
    if (a) moves[k] = { ...m, action: a };
  }
  if (spec.spin) {
    actions.spin = act(spec.spin.clip);
    if (actions.spin) actions.spin.timeScale = 0;
  }
  const library = Object.values(actions).concat(Object.values(moves).map((m) => m.action), combo).filter((a) => a && spec.libraryGrip && spec.libraryGrip.test(a.getClip().name));
  let move = null; // { def, t, keys, stop, end }
  let endFade = 0; // how slowly to leave the move that just ended
  let current = null;
  let attackLeft = 0;
  let attackLen = 0;
  let hitLeft = 0;
  let slash = 0; // how strongly the blade trails light (0..1)
  let weapon = null;
  let bladeLen = 1;
  const held = []; // other things in hand: { obj, hand, mode: 'blade' | 'staff', grip }
  // The grip that points a blade (+Z) forward from a fist, for a hand: worked out from the bind
  // pose (a T-pose: the thumb up, so a held blade points forward). Library clips assume it.
  root.updateMatrixWorld(true);
  const rootInv0 = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const forwardGrip = (h) => {
    const q = new THREE.Quaternion();
    new THREE.Matrix4().multiplyMatrices(rootInv0, h.matrixWorld).decompose(new THREE.Vector3(), q, new THREE.Vector3());
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0).applyQuaternion(q.invert()).normalize());
  };
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const staffA = new THREE.Vector3(), staffB = new THREE.Vector3(), staffUp = new THREE.Vector3();
  const tripoGrip = new THREE.Quaternion().setFromAxisAngle(xAxis, spec.gripTilt || 0);
  const libraryGrip = spec.hand && root.getObjectByName(spec.hand) ? forwardGrip(root.getObjectByName(spec.hand)) : new THREE.Quaternion();
  const gripQ = new THREE.Quaternion();
  const trailQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...(spec.trail || [0, -1, 0])).normalize());
  // Cross-fade to an action (restart: play it again from the start if it is already on).
  const fadeTo = (a, fade = 0.15, restart = false) => {
    if (!a) return;
    if (a === current) {
      if (restart) a.reset().play();
      return;
    }
    a.reset().play();
    if (current) a.crossFadeFrom(current, fade, false);
    current = a;
  };
  fadeTo(actions.idle, 0);
  const hand = spec.hand ? root.getObjectByName(spec.hand) : null;
  const palm = palmOf(hand, spec.palm); // weapons sit in the palm, not at the wrist joint
  const aiming = Object.values(actions).concat(Object.values(moves).map((m) => m.action)).filter((a) => a && spec.aiming && spec.aiming.test(a.getClip().name));
  let bow = null;
  return {
    group: holder,
    mats,
    hand,
    /** Hold a weapon (an Object3D whose blade runs along +Z from its grip at the origin). */
    holdWeapon(w) {
      if (!hand) return;
      weapon = w;
      if (spec.staff) {
        held.push({ obj: w, hand, mode: 'staff', grip: null, palm });
        weapon = null; // a staff is not a blade (no swing trail, no warrior grips)
        w.scale.setScalar((spec.weaponScale || 1) / tpl.scale);
        root.add(w);
        return;
      }
      bladeLen = Math.max(0.5, new THREE.Box3().setFromObject(w).max.z || 1); // (not yet scaled or placed)
      weapon.scale.setScalar((spec.weaponScale || 1) / tpl.scale); // the model is scaled by tpl.scale
      root.add(weapon); // placed at the hand every frame (see update)
    },
    /** A second weapon, in another hand (the Rogue's off-hand dagger), held like a blade. */
    holdOffhand(w, handName) {
      const h = root.getObjectByName(handName);
      if (!h) return;
      w.scale.setScalar((spec.weaponScale || 1) / tpl.scale);
      held.push({ obj: w, hand: h, mode: 'blade', grip: forwardGrip(h), palm: palmOf(h, spec.palm) });
      root.add(w);
    },
    /** Hold a bow made here (spec.bow): wood for the limbs, the string glows like a blade. */
    holdBow(wood, string) {
      if (!hand || !spec.bow) return;
      bow = makeBow(wood, string, tpl.scale, root, hand, palm, root.getObjectByName(spec.bow.drawHand), root.getObjectByName(spec.bow.shoulder), root.getObjectByName('Hip'));
      mats.push(wood);
    },
    /** How strongly the blade should trail light this frame (0 = not at all). */
    get slash() {
      return weapon ? slash : 0;
    },
    /** The blade's world position: a point part-way up it, and its tip. */
    blade(base, tip) {
      if (!weapon) return false;
      weapon.updateMatrixWorld(true);
      base.set(0, 0, bladeLen * 0.6).applyMatrix4(weapon.matrixWorld);
      tip.set(0, 0, bladeLen * 1.08).applyMatrix4(weapon.matrixWorld);
      return true;
    },
    update(dt, s) {
      slash = 0;
      if (s.dead) {
        move = null;
        if (actions.death && current !== actions.death) {
          fadeTo(actions.death, 0.1);
          actions.death.time = spec.deathFrom || 0;
        } else fadeTo(actions.death || actions.idle, 0.1);
      } else {
        if (s.move && moves[s.move]) {
          // A skill: its keys, stretched so the strike lands as the dash or leap ends.
          const def = moves[s.move];
          let keys = def.keys.map((k) => k.slice());
          if (def.land != null && s.moveDur > 0) {
            const at = keys[def.land][0];
            const shift = s.moveDur - at;
            keys = keys.map(([t, c], i) => [i <= def.land ? (t * s.moveDur) / at : t + shift, c]);
          }
          const stop = def.stop ? [def.stop[0] + (def.land != null && s.moveDur > 0 ? s.moveDur - def.keys[def.land][0] : 0), def.stop[1]] : null;
          move = { def, t: 0, keys, stop, end: keys[keys.length - 1][0] + (stop ? stop[1] : 0) };
          def.action.timeScale = 0;
          attackLeft = 0;
          hitLeft = 0;
          fadeTo(def.action, 0.05, true);
        }
        if (move) {
          move.t += dt;
          if (move.t >= move.end) {
            endFade = move.def.fade || 0.25;
            move = null;
          }
        }
        sinceAttack += dt;
        if (s.attackStart && actions.attack && !move && !s.move) {
          if (combo.length) {
            // the next slash of the combo; a fresh combo after a pause
            comboAt = sinceAttack > 1.2 ? 0 : (comboAt + 1) % combo.length;
            actions.attack = combo[comboAt];
          }
          sinceAttack = 0;
          const len = actions.attack.getClip().duration;
          const cycle = spec.attack.cycle && s.period > 0;
          attackLeft = cycle ? Math.max(0.2, s.period) : Math.max(0.35, s.attackDur * 1.8);
          attackLen = attackLeft;
          actions.attack.timeScale = len / attackLeft;
          if (cycle) attackLeft *= 1.2; // hold the end a moment, so steady shooting flows on
          fadeTo(actions.attack, current === actions.attack ? 0.06 : spec.attack.fadeIn || 0.06, true); // from the start, even if already swinging
        }
        if (s.hitStart && actions.hit && attackLeft <= 0 && !move && !s.spinning && !s.moving) {
          // A flinch, when standing (running and attacking carry on).
          hitLeft = 0.55;
          actions.hit.timeScale = actions.hit.getClip().duration / 0.75;
          fadeTo(actions.hit, 0.06, true);
        }
        if (hitLeft > 0) hitLeft -= dt;
        const flinching = hitLeft > 0 && !s.moving;
        if (attackLeft > 0) attackLeft -= dt;
        if (move) {
          // Pose the move at its clip time (held still for a moment at the impact).
          const m = move;
          let t = m.t;
          if (m.stop) t = t < m.stop[0] ? t : t < m.stop[0] + m.stop[1] ? m.stop[0] : t - m.stop[1];
          m.def.action.time = warp(m.keys, t);
          const [a, b] = m.def.slash || [0, 0];
          const sh = m.def.land != null && s.moveDur > 0 ? m.keys[m.def.land][0] - m.def.keys[m.def.land][0] : 0;
          if (m.t >= a + sh && m.t <= b + sh) slash = 1;
        } else if (s.spinning && actions.spin) {
          actions.spin.time = spec.spin.at;
          fadeTo(actions.spin, 0.08);
          slash = 1;
        } else if (attackLeft > 0) {
          const k = 1 - attackLeft / attackLen;
          if (k > 0.3 && k < 0.7) slash = 0.55;
        } else if (flinching) {
          // let the flinch play out
        } else if (s.moving && actions.run) {
          actions.run.timeScale = Math.max(0.6, Math.min(1.8, (s.speed || 6) / (spec.runRef || 6.5)));
          fadeTo(actions.run, endFade || 0.2);
        } else fadeTo(actions.idle, endFade || (current === actions.run ? 0.35 : current === actions.spin ? 0.2 : 0.25)); // ease into a stop
        if (!move) endFade = 0;
      }
      mixer.update(dt);
      if (bow) {
        let aimW = 0;
        for (const a of aiming) if (a.isRunning() || a === current) aimW += a.getEffectiveWeight();
        bow.update(s.dead ? 0 : Math.min(1, aimW));
      }
      if (weapon) {
        // In the hand, at the grip angle, blending to the trailing pose while the run plays.
        root.updateMatrixWorld(true);
        tmpM.copy(root.matrixWorld).invert().multiply(hand.matrixWorld).decompose(tmpP, tmpQ, tmpS);
        weapon.position.copy(palm).applyMatrix4(tmpM);
        // The two clip sets hold the blade differently; blend by how much each is playing.
        // (an action that has never played still reports full weight, so ask if it is running)
        let libW = 0;
        for (const a of library) if (a.isRunning() || a === current) libW += a.getEffectiveWeight();
        if (spec.gripTilt != null) gripQ.copy(tripoGrip).slerp(libraryGrip, Math.min(1, libW));
        else gripQ.copy(libraryGrip); // every clip of this character holds the blade forward
        weapon.quaternion.copy(tmpQ).multiply(gripQ);
        const runW = actions.run && actions.run.isRunning() && !s.dead && !s.spinning && !move && attackLeft <= 0 ? actions.run.getEffectiveWeight() : 0;
        if (spec.trail && runW > 0.01) weapon.quaternion.slerp(trailQ, runW);
      }
      if (held.length) {
        root.updateMatrixWorld(true);
        const inv = tmpM.copy(root.matrixWorld).invert();
        for (const h of held) {
          const hm = new THREE.Matrix4().multiplyMatrices(inv, h.hand.matrixWorld);
          hm.decompose(tmpP, tmpQ, tmpS);
          h.obj.position.copy(h.palm).applyMatrix4(hm);
          if (h.mode === 'blade') h.obj.quaternion.copy(tmpQ).multiply(h.grip);
          else {
            // a staff stays upright, leaning the way the forearm points (forward when casting)
            const fore = h.hand.parent;
            fore.getWorldPosition(staffA);
            h.hand.getWorldPosition(staffB);
            staffB.sub(staffA).transformDirection(inv);
            staffUp.set(0, 1, 0).addScaledVector(staffB, 0.35).normalize();
            h.obj.quaternion.setFromUnitVectors(zAxis, staffUp);
          }
        }
      }
    },
  };
}

/**
 * A bow in the left hand, made here so its string can be drawn: the string runs from the limb
 * tips to the drawing hand while that hand is pulled back behind the bow, with an arrow on it,
 * and snaps straight when the hand lets go. While shooting, the bow points down the bow arm and
 * stands upright; otherwise it is carried upright, turned with her hips.
 */
function makeBow(wood, stringMat, scale, root, hand, palm, drawHand, shoulder, hip) {
  const group = new THREE.Group(); // bow space, in metres: +X toward the target, +Y up the bow
  group.scale.setScalar(1 / scale);
  const L = 0.62;
  const pts = [[-0.19, L], [-0.08, L * 0.78], [-0.015, L * 0.42], [0, 0], [-0.015, -L * 0.42], [-0.08, -L * 0.78], [-0.19, -L]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const limbs = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.02, 6), wood);
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), leather);
  const top = pts[0], bottom = pts[6];
  const segGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4).translate(0, 0.5, 0);
  const upper = new THREE.Mesh(segGeo, stringMat);
  const lower = new THREE.Mesh(segGeo, stringMat);
  const arrow = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.7 });
  arrow.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.78, 5).rotateZ(-Math.PI / 2).translate(0.39, 0, 0), shaftMat));
  arrow.add(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 5).rotateZ(-Math.PI / 2).translate(0.8, 0, 0), stringMat));
  const fl = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.9, side: THREE.DoubleSide });
  for (const r of [0, Math.PI / 2]) arrow.add(new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.035).translate(0.08, 0, 0).rotateX(r), fl));
  group.add(limbs, grip, upper, lower, arrow);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  root.add(group);
  const inv = new THREE.Matrix4(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qc = new THREE.Quaternion();
  const hp = new THREE.Vector3(), sp = new THREE.Vector3(), dp = new THREE.Vector3(), tmp = new THREE.Vector3(), sc = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const hipBind = new THREE.Quaternion();
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  m.multiplyMatrices(inv, hip.matrixWorld).decompose(tmp, hipBind, sc);
  hipBind.invert();
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.85); // carried slanting forward, not upright over her shoulder
  const local = (bone, out) => out.setFromMatrixPosition(m.multiplyMatrices(inv, bone.matrixWorld));
  const seg = (mesh, a, b) => {
    mesh.position.copy(a);
    tmp.subVectors(b, a);
    mesh.scale.set(1, tmp.length(), 1);
    mesh.quaternion.setFromUnitVectors(Y.set(0, 1, 0), tmp.normalize());
  };
  const rest = new THREE.Vector3(-0.19, 0, 0);
  const nock = new THREE.Vector3();
  return {
    update(aimW) {
      root.updateMatrixWorld(true);
      inv.copy(root.matrixWorld).invert();
      hp.copy(palm).applyMatrix4(m.multiplyMatrices(inv, hand.matrixWorld)); // the grip, in her palm
      local(shoulder, sp);
      local(drawHand, dp);
      // aiming: down the bow arm, upright
      X.subVectors(hp, sp).normalize();
      Y.set(0, 1, 0).addScaledVector(X, -X.y).normalize();
      Z.crossVectors(X, Y);
      qa.setFromRotationMatrix(m.makeBasis(X, Y, Z));
      // carried: upright, turned with the hips, leaning forward
      m.multiplyMatrices(inv, hip.matrixWorld).decompose(tmp, qc, sc);
      qc.multiply(hipBind);
      qc.multiply(tilt);
      q.copy(qc).slerp(qa, aimW);
      group.quaternion.copy(q);
      group.position.copy(hp);
      group.updateMatrix();
      // the string: to the drawing hand while it is pulled back behind the bow
      tmp.copy(dp).applyMatrix4(m.copy(group.matrix).invert());
      const drawn = aimW > 0.4 && tmp.x < -0.24 && tmp.x > -0.72 && Math.abs(tmp.y) < 0.3 && Math.abs(tmp.z) < 0.25;
      nock.copy(drawn ? tmp.set(tmp.x, 0, 0) : rest);
      seg(upper, nock, top);
      seg(lower, nock, bottom);
      arrow.visible = drawn;
      arrow.position.copy(nock);
    },
  };
}

/** Clip time at time t along keys [[t, clipTime], ...] (straight lines between keys). */
function warp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, c1] = keys[i];
    if (t <= t1) {
      const [t0, c0] = keys[i - 1];
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return c0 + (c1 - c0) * k;
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Swap a hand-built hero's look for its rigged model once that has loaded. The hand-built
 * model's group stays (so position, facing, glow and the parry guard work as before); its body
 * is hidden and its weapon moves into the rigged model's hand.
 */
/** Which model a hero wears (0.42): a rogue with a subclass becomes the ninja. */
export function heroLook(cls, spec) {
  return cls === 'rogue' && spec ? 'ninja' : cls;
}

export function upgradeHero(model, cls, look = cls) {
  const id = `hero_${look}`;
  model.lookId = look;
  if (!RIGGED[id]) return;
  Promise.all([loadRigged(id), loadWeapon(cls, (RIGGED[id] && RIGGED[id].weaponScale) || 1)]).then(([tpl, made]) => {
    if (!tpl || model.disposed || model.rig) return;
    const rig = instantiate(tpl);
    const arm = model.parts.arm;
    if (tpl.spec.bow) {
      // her own bow (the hand-built one stays with the hidden hand-built body)
      model.parts.bowWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.65 });
      rig.holdBow(model.parts.bowWood, model.parts.steel);
      model.parts.body.visible = false;
      model.group.add(rig.group);
      model.mats.push(...rig.mats);
      rig.baseTurn = rig.group.rotation.y;
      model.rig = rig;
      return;
    }
    const weapon = new THREE.Group();
    // The arm's first child is the sleeve; the rest is the weapon, held along +Z from z≈0.6.
    if (made) {
      // the weapon model; its metal takes the weapon glow (see renderer applyGlow)
      weapon.add(made);
      model.parts.weaponMats = made.userData.mats;
    } else {
      for (const c of arm.children.slice(1)) weapon.add(c);
      weapon.children.forEach((c) => (c.position.z -= 0.6));
    }
    rig.holdWeapon(weapon);
    model.parts.heldWeapon = weapon;
    model.weaponLook = null;
    if (tpl.spec.offhand) {
      // the Rogue's second dagger (its own materials, glowing with the first)
      const off = weapon.clone();
      off.traverse((o) => {
        if (o.isMesh && made) {
          o.material = o.material.clone();
          model.parts.weaponMats.push(o.material);
        }
      });
      rig.holdOffhand(off, tpl.spec.offhand);
      model.parts.heldOff = off;
    }
    if (model.glowId !== undefined && model.applyGlowAgain) model.applyGlowAgain();
    model.parts.body.visible = false;
    model.group.add(rig.group);
    model.mats.push(...rig.mats);
    rig.baseTurn = rig.group.rotation.y;
    model.rig = rig;
  });
}

/** Bow looks by rarity (0.48): the archer's bow is made in code, so its look is its wood. */
const BOW_LOOKS = {
  null: { color: 0x6b4a2e, emissive: 0x000000, metal: 0 },
  fine: { color: 0x2e2228, emissive: 0x000000, metal: 0.35 },
  ancient: { color: 0xc9a46a, emissive: 0x000000, metal: 0.55 },
  immortal: { color: 0xffcf4a, emissive: 0xffa020, metal: 0.5 },
  edric: { color: 0x6b4a2e, emissive: 0x000000, metal: 0 },
};

/**
 * Put a new look in a hero's hands (0.48) when their weapon's rarity changes: the held weapon
 * (and the Rogue's second dagger) gets the new model; the bow its new wood.
 */
export function setWeaponLook(model, cls, look) {
  if (!model.rig || model.weaponLook === look) return;
  model.weaponLook = look;
  if (model.parts.bowWood) {
    const b = BOW_LOOKS[look] || BOW_LOOKS.null;
    model.parts.bowWood.color.set(b.color);
    model.parts.bowWood.emissive.set(b.emissive);
    model.parts.bowWood.emissiveIntensity = look === 'immortal' ? 0.5 : 0;
    model.parts.bowWood.metalness = b.metal;
    return;
  }
  const held = model.parts.heldWeapon;
  if (!held) return;
  const id = `hero_${model.lookId || cls}`;
  loadWeapon(cls, (RIGGED[id] && RIGGED[id].weaponScale) || 1, look).then((made) => {
    if (!made || model.disposed || model.weaponLook !== look) return;
    held.clear();
    held.add(made);
    model.parts.weaponMats = made.userData.mats.slice();
    if (model.parts.heldOff) {
      const c = made.clone();
      c.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          model.parts.weaponMats.push(o.material);
        }
      });
      model.parts.heldOff.clear();
      model.parts.heldOff.add(c);
    }
    if (model.applyGlowAgain) model.applyGlowAgain();
  });
}
