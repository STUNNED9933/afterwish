// Rigged, animated character models (0.35), made with the Tripo API (tools/models).
// Each model is loaded once, when first needed (or ahead of time: preload), and copied for every
// character that uses it. (0.56.2) While one is on its way, the hand-built model from models.js is
// hidden, so the old block shapes never flash up; it is only shown if the model cannot load here
// (opening the game from a file, no network) or takes longer than SLOW seconds.
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
// (0.97.4) the mage running: tuned against her run, frame by frame, so the staff clears her legs and body
const RUN_AT = [0.42, 0.24, 0.38], RUN_DIR = [0.5, 0.84, 0.05], RUN_HOLD = 0.56, RUN_SWING = { fwd: 0.15, bob: 0.05, tilt: 14, phase: 0 };
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
    // (0.96.2) Walking, the swinging arm would sweep the blade through his legs: it is carried forward and
    // low instead, as he holds it standing, and still sways a little with the hand (w: how firmly it is held
    // so). Worked out against the walk, frame by frame (tools/gait/README.md): it clears the body by as much
    // as the hand itself does.
    walkCarry: { main: [0.8, -0.6, 0.05], w: 0.8 },
    // (0.97) walking, the sword goes into a scabbard on his left hip (at: where the grip sits, metres from
    // the bone in the bind pose, model space +X forward +Y up +Z his right; dir: the blade, hilt up front)
    stow: { main: { bone: 'Pelvis', at: [0.12, 0.04, -0.23], dir: [-0.72, -0.67, -0.14], hang: true, slide: 0.42 }, sheath: true, time: 0.85 },
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
    // (0.97) walking, the bow is slung across her back, over her left shoulder, crossing the quiver (dir: up the
    // bow; flat: the way its belly faces, out from her back)
    stow: { main: { bone: 'Spine02', at: [-0.24, -0.06, 0.0], dir: [0.0, 0.86, -0.5], flat: [-1, 0, 0], bow: true, reach: { bone: 'L_Upperarm', at: [-0.16, 0.2, 0.06] } }, time: 0.75 },
    idle: 'idle',
    run: 'arc_run', // her own (Tripo's sprint leaned too hard for a bow)
    runRef: 5.6, // the speed it is played at its own pace (quicker, shorter strides)
    death: 'arc_death',
    hit: 'hit',
    // a whole draw-and-loose cycle, played over the time between two shots (the arrow leaves
    // 30% of the way in, when the game fires it)
    attack: { clip: 'arc_shot', cycle: true, fadeIn: 0.14 }, // (dropping to the kneel takes a moment)
    aiming: /^arc_(shot|power|barrage|volley|storm|deadeye)$/,
    moves: {
      line: { clip: 'arc_power', keys: [[0, 0], [0.9, 0.9]], fade: 0.25 },
      deadeye: { clip: 'arc_power', keys: [[0, 0], [0.9, 0.9]], fade: 0.25 },
      aim: { clip: 'arc_deadeye', keys: [[0, 0.5], [0.5, 1.0], [0.95, 1.45]], fade: 0.35 }, // (0.52) Deadeye: from the nock (the arrow is already in hand), drawn in half a second, loosed at 0.5 s
      ricochet: { clip: 'arc_power', keys: [[0, 0.2], [0.6, 0.85]], fade: 0.2 },
      barrage: { clip: 'arc_barrage', keys: [[0, 0], [0.85, 0.85]], fade: 0.25 },
      zone: { clip: 'arc_storm', keys: [[0, 0], [1.45, 1.45]], fade: 0.35 }, // (0.51) drawn for a second, loosed at 1 s with the game's shot
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
    walkCarry: { main: [-0.61, -0.61, 0.51], off: [-0.61, -0.61, -0.51], w: 0.7 }, // (0.96.2) walking, both daggers held reversed along the forearms, clear of the body
    // (0.97) walking, both daggers go into sheaths on his belt, one on each hip, hilts up
    stow: { main: { bone: 'Pelvis', at: [-0.05, -0.02, 0.22], dir: [-0.28, -0.94, 0.15], hang: true, slide: 0.16 }, off: { bone: 'Pelvis', at: [-0.05, -0.02, -0.22], dir: [-0.28, -0.94, -0.15], hang: true, slide: 0.16 }, sheath: true, time: 0.55 },
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
  // (0.76) The Eternal forms: each hero ascended, in white and crimson, worn with a full set of Eternal
  // gear. Their own Tripo idle and flinch (and the Warrior's swing and run); every other move is the
  // hero's own, copied onto the new rig by tools/models/copy-clips.mjs.
  // (0.83) The Wishkeep's own heroes, a man and a woman of each class in the keep's crimson, white and gold
  // (Tripo, tools/models/roster.json keep_*): their own idle and flinch, every other move their class's.
  // (defined below, after RIGGED)
  get hero_warrior_eternal() {
    return { ...RIGGED.hero_warrior, url: 'models/warrior_eternal.glb' };
  },
  get hero_archer_eternal() {
    return { ...RIGGED.hero_archer, url: 'models/archer_eternal.glb' };
  },
  get hero_mage_eternal() {
    return { ...RIGGED.hero_mage, url: 'models/mage_eternal.glb' };
  },
  get hero_rogue_eternal() {
    return { ...RIGGED.hero_rogue, url: 'models/rogue_eternal.glb' };
  },
  // The Mage (0.37.3): Tripo's idle and flinch; Frozen Orb is an overhand throw from the
  // library; her run, sparks, Fire Bolt, Starwake, Meteor and the fall are our own
  // (tools/models/mage-moves.js). Her staff stays upright, leaning with her forearm.
  // (0.92) The Seraph: the keep's angel of stone (Tripo, roster k_statue), its own idle, run, slash, cast and
  // flinch; no weapon (light from its hands). Its skills play the slash and the cast at their strongest part.
  hero_statue: {
    url: 'models/k_statue.glb',
    height: 2.4,
    turn: -Math.PI / 2,
    hand: 'R_Hand',
    noWeapon: true,
    idle: 'idle',
    run: 'run',
    runRef: 6.5,
    death: 'hit_to_body_01',
    hit: 'hit_to_body_01',
    attack: { clip: 'seraph_pray', from: 0, to: 0.9 }, // (0.98) hands together in prayer, then thrust out: the light leaves them (tools/seraph)
    moves: {
      line: { clip: 'cast_a_spell', keys: [[0, 2.1], [0.2, 2.6], [0.5, 3.4], [0.75, 4.3]], fade: 0.25 },
      nova: { clip: 'cast_a_spell', keys: [[0, 0.9], [0.15, 1.2], [0.45, 1.6], [0.7, 2.2]], fade: 0.25 },
      dash: { clip: 'seraph_glide', keys: [[0, 0.1], [0.15, 0.35], [0.3, 0.6], [0.55, 0.95]], land: 2, fade: 0.18 }, // (0.98) wings spread, leaning into the flight
      leap: { clip: 'slash', keys: [[0, 1.6], [0.45, 1.85], [0.55, 2.05], [0.95, 2.8]], land: 2, stop: [0.55, 0.12], fade: 0.3 },
      // (0.93) gathering light before a skill: arms drawn back and up, held
      wind_q: { clip: 'cast_a_spell', keys: [[0, 1.3], [0.3, 2.0], [0.45, 2.2], [1.2, 2.25]], fade: 0.2 },
      wind_w: { clip: 'cast_a_spell', keys: [[0, 0.5], [0.3, 0.9], [1.0, 0.95]], fade: 0.15 },
      wind_r: { clip: 'slash', keys: [[0, 0.9], [0.7, 1.55], [0.9, 1.65], [1.6, 1.7]], fade: 0.2 },
    },
    float: 0.45, // (0.93) it never touches the ground: it hovers, and glides rather than runs
    rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis'],
  },
  hero_mage: {
    url: 'models/mage.glb',
    height: 1.9,
    turn: -Math.PI / 2,
    hand: 'R_Hand',
    staff: true,
    weaponScale: 0.82,
    // (0.97.2) Standing, she holds the staff upright at her side, its foot on the ground by her right foot, her
    // left hand on her hip; running, she carries it out ahead of her, head high, held above its middle. at: where her right hand is
    // (metres from the bone, bind pose, model space +X forward +Y up +Z her right); dir: the staff, foot to head.
    staffPose: {
      idle: { bone: 'Pelvis', at: [0.15, 0.06, 0.3], dir: [0.08, 1, -0.03], hang: true, ground: true },
      run: { bone: 'Pelvis', at: RUN_AT, dir: RUN_DIR, hang: true, hold: RUN_HOLD, swing: RUN_SWING }, // (0.97.3) carried ahead of her, head high and forward, its foot back past her legs
      hip: { bone: 'Pelvis', at: [0.03, 0.06, -0.2], hang: true, hand: 'L_Hand', pole: [-0.35, -0.25, -1] },
    },
    // (0.97) walking, the staff is slung across her back, its head over her right shoulder
    stow: { main: { bone: 'Spine02', at: [-0.24, -0.02, 0.02], dir: [-0.1, 0.84, 0.53], reach: { bone: 'R_Upperarm', at: [-0.16, 0.2, -0.06] } }, time: 0.75 },
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

/** Seconds to wait for a model before showing the hand-built one instead (a very slow connection). */
export const SLOW = 10;
/** Can rigged models load here at all? (Browsers block loading files from file://.) */
export const canLoad = () => !(typeof location !== 'undefined' && location.protocol === 'file:');

/**
 * Hide `parts` (hand-built pieces) while `promise` (a model) loads; show them again only if it comes
 * back empty, or is still not here after SLOW seconds. `alive()` says the view still exists.
 */
export function hideWhileLoading(parts, promise, alive = () => true) {
  if (!canLoad()) return;
  let done = false;
  for (const o of parts) o.visible = false;
  const reveal = () => {
    if (!alive()) return;
    for (const o of parts) o.visible = true;
  };
  promise.then((ok) => {
    done = true;
    if (!ok) reveal();
  });
  setTimeout(() => {
    if (!done) reveal(); // (the model, if it does turn up later, hides them again as it swaps in)
  }, SLOW * 1000);
}

/** Start loading models before they are needed, a few at a time (ids are RIGGED keys). */
const preloadQueue = [];
let preloading = 0;
export function preload(ids) {
  if (!canLoad()) return;
  for (const id of ids) if (RIGGED[id] && !cache.has(id) && !preloadQueue.includes(id)) preloadQueue.push(id);
  pump();
}
function pump() {
  while (preloading < 2 && preloadQueue.length) {
    const id = preloadQueue.shift();
    if (cache.has(id)) continue;
    preloading++;
    loadRigged(id).finally(() => {
      preloading--;
      pump();
    });
  }
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

/**
 * Close a hand around what it holds (0.48.1). The hero rigs have no finger bones, so the fingers
 * cannot be curled by a clip; instead the part of the hand mesh past the knuckles is bent once, at
 * load, around a cylinder under the palm (where the handle runs), the way a fist wraps a grip.
 * Done in the bind pose: the palm faces down there, so "down" is the side the fingers close to.
 */
const FIST = { knuckle: 0.42, radius: 0.3, most: 2.9 }; // knuckles at 42% of the hand; curl radius 30% of it; at most ~165°
const IDENTITY_Q = new THREE.Quaternion();
const FIST_AT = new Map(); // model url -> { hand bone name: [x, y, z] }, the middle of the fist in the bone's own space
function closeHands(scene, names, url) {
  const at = {};
  FIST_AT.set(url, at);
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3(), q = new THREE.Quaternion();
  scene.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton || !o.geometry.attributes.skinIndex) return;
    const g = o.geometry;
    if (g.userData.fists) return;
    g.userData.fists = true;
    const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bones = o.skeleton.bones;
    const bindInv = o.bindMatrixInverse;
    for (const name of names) {
      const bi = bones.findIndex((b) => b.name === name);
      const fi = bi < 0 ? -1 : bones.indexOf(bones[bi].parent);
      if (fi < 0) continue;
      const H = new THREE.Vector3().setFromMatrixPosition(o.skeleton.boneInverses[bi].clone().invert());
      const F = new THREE.Vector3().setFromMatrixPosition(o.skeleton.boneInverses[fi].clone().invert());
      const d = H.clone().sub(F).normalize(); // along the hand, toward the fingertips
      const list = [];
      for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).sub(H);
        if (v.dot(d) > 0) list.push(i);
      }
      if (list.length < 12) continue;
      // the hand's length, and the back of the hand: up, across the hand from the palm
      let L = 0;
      for (const i of list) L = Math.max(L, v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).sub(H).dot(d));
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();
      const axis = new THREE.Vector3().crossVectors(up, d).normalize(); // turning about it takes the fingers from d toward -up
      const t0 = L * FIST.knuckle, R = L * FIST.radius;
      const C = H.clone().addScaledVector(d, t0).addScaledVector(up, -R);
      const toBone = o.skeleton.boneInverses[bi];
      at[name] = {
        at: C.clone().applyMatrix4(toBone).toArray(), // what is held goes through here
        hole: axis.clone().transformDirection(toBone).toArray(), // ...and runs this way through the fist
        along: d.clone().transformDirection(toBone).toArray(), // the hand's own line, from the wrist
      };
      for (const i of list) {
        const p = v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).sub(H);
        const t = p.dot(d);
        if (t <= t0) continue;
        const y = p.dot(up);
        const side = p.clone().addScaledVector(d, -t).addScaledVector(up, -y);
        const th = Math.min(FIST.most, (t - t0) / R);
        const rho = R + y;
        const out = C.clone().add(side).addScaledVector(d, rho * Math.sin(th)).addScaledVector(up, rho * Math.cos(th)).applyMatrix4(bindInv);
        pos.setXYZ(i, out.x, out.y, out.z);
        if (nor) {
          q.setFromAxisAngle(axis, th);
          const n = new THREE.Vector3().fromBufferAttribute(nor, i).transformDirection(o.bindMatrix).applyQuaternion(q).transformDirection(bindInv);
          nor.setXYZ(i, n.x, n.y, n.z);
        }
      }
      pos.needsUpdate = true;
      if (nor) nor.needsUpdate = true;
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });
}

/** One-time work on a loaded model: size, clips cut and cleaned, shared things marked. */
function prepare(spec, gltf) {
  const scene = gltf.scene;
  const grips = [spec.hand, spec.offhand, spec.bow && spec.bow.drawHand].filter(Boolean);
  if (spec.fists !== false && grips.length) closeHands(scene, grips, spec.url); // hands close around what they hold
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
  if (clips[spec.walk || 'gait_Walk']) stripDrift(clips[spec.walk || 'gait_Walk'], spec.rootBones); // (0.95) the walk stays where the body is
  if (spec.recentre === '*') {
    // (0.54.7) creatures: any clip that walks itself away (a Tripo walk with its travel left in) is put back
    // in place, so the body stays on its hitbox. A fall keeps its own stagger back.
    for (const name in clips) {
      if (name === 'fall') continue;
      if (travel(clips[name], spec.rootBones, scene) > 0.1 * h) stripDrift(clips[name], spec.rootBones);
      recentre(clips[name], spec.rootBones, scene, spec.recentreMin ?? 0.15, h);
    }
  } else for (const name of spec.recentre || [spec.run]) if (clips[name]) recentre(clips[name], spec.rootBones, scene, spec.recentreMin ?? 0.15, h);
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

/** How far a clip's root bone travels across the ground from its first frame to its last, in world units. */
function travel(clip, rootBones, scene) {
  scene.updateMatrixWorld(true);
  let most = 0;
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (prop !== 'position' || !rootBones.includes(bone)) continue;
    const node = scene.getObjectByName(bone);
    if (!node) continue;
    const pm = node.parent.matrixWorld;
    const v = t.values, n = v.length / 3;
    const a = new THREE.Vector3().fromArray(v, 0).applyMatrix4(pm), b = new THREE.Vector3().fromArray(v, (n - 1) * 3).applyMatrix4(pm);
    most = Math.max(most, Math.hypot(b.x - a.x, b.z - a.z));
  }
  return most;
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
  const actions = { idle: act(spec.idle), run: act(spec.run), walk: act(spec.walk || 'gait_Walk'), attack: act('__attack', true), death: act(spec.death, true), hit: act(spec.hit, true) }; // (0.96.1) a walk made for each model: feet planted by IK, arms from its own idle; a man's and a woman's gait (tools/gait)
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
  const carry = (v) => (v ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...v).normalize()) : null);
  const walkMainQ = spec.walkCarry ? carry(spec.walkCarry.main) : null, walkOffQ = spec.walkCarry ? carry(spec.walkCarry.off) : null;
  // (0.97) Put away while walking (spec.stow): each place as a bone and a pose in that bone's own space, read
  // from the bind pose, so it rides the hips or the back as they move.
  const fistAt = FIST_AT.get(spec.url) || {};
  const gripAt = (h) => (fistAt[h.name] ? new THREE.Vector3(...fistAt[h.name].at) : palmOf(h, spec.palm)); // in the fist (or the palm)
  const stows = {};
  for (const [k, def] of Object.entries(spec.stow || {})) {
    if (!def || !def.bone) continue;
    const bone = root.getObjectByName(def.bone);
    if (!bone) continue;
    const bp = new THREE.Vector3(), bq = new THREE.Quaternion();
    new THREE.Matrix4().multiplyMatrices(rootInv0, bone.matrixWorld).decompose(bp, bq, new THREE.Vector3());
    const bqi = bq.clone().invert();
    const along = new THREE.Vector3(...def.dir).normalize();
    const flat = new THREE.Vector3(...(def.flat || [1, 0, 0]));
    flat.addScaledVector(along, -flat.dot(along)).normalize();
    const basis = new THREE.Matrix4();
    // a blade or staff runs along its +Z (guard along +X); the bow along its +Y, its belly to +X
    if (def.bow) basis.makeBasis(flat, along, new THREE.Vector3().crossVectors(flat, along));
    else basis.makeBasis(flat, new THREE.Vector3().crossVectors(along, flat), along);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const atM = new THREE.Vector3(...def.at).multiplyScalar(1 / tpl.scale);
    const handBone = root.getObjectByName(k === 'off' ? spec.offhand : spec.hand);
    let reach = null; // a back carry is reached over the shoulder, not at the grip
    if (def.reach) {
      const rb = root.getObjectByName(def.reach.bone);
      if (rb) {
        const rq = new THREE.Quaternion();
        new THREE.Matrix4().multiplyMatrices(rootInv0, rb.matrixWorld).decompose(new THREE.Vector3(), rq, new THREE.Vector3());
        reach = { bone: rb, at: new THREE.Vector3(...def.reach.at).multiplyScalar(1 / tpl.scale).applyQuaternion(rq.invert()), pos: new THREE.Vector3() };
      }
    }
    stows[k] = { bone, hang: !!def.hang, bqi, atM, qM: q, at: atM.clone().applyQuaternion(bqi), q: bqi.clone().multiply(q), pos: new THREE.Vector3(), quat: new THREE.Quaternion(), hand: handBone, palm: handBone ? gripAt(handBone) : null, slide: (def.slide || 0.3) / tpl.scale, reach };
  }
  const stowM = new THREE.Matrix4(), stowP = new THREE.Vector3(), stowQ = new THREE.Quaternion(), stowS = new THREE.Vector3(), stowF = new THREE.Vector3(), stowY = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const placeStows = (inv) => {
    for (const st of Object.values(stows)) {
      if (st.reach) {
        stowM.multiplyMatrices(inv, st.reach.bone.matrixWorld).decompose(stowP, stowQ, stowS);
        st.reach.pos.copy(st.reach.at).applyQuaternion(stowQ).add(stowP);
      }
      stowM.multiplyMatrices(inv, st.bone.matrixWorld).decompose(stowP, stowQ, stowS);
      if (st.hang) {
        // on a belt it hangs: it turns with the hips, but does not lean or tip with them
        stowF.set(1, 0, 0).applyQuaternion(stowQ.multiply(st.bqi));
        stowY.setFromAxisAngle(Y_AXIS, Math.atan2(-stowF.z, stowF.x));
        st.pos.copy(st.atM).applyQuaternion(stowY).add(stowP);
        st.quat.copy(stowY).multiply(st.qM);
        continue;
      }
      st.pos.copy(st.at).applyQuaternion(stowQ).add(stowP);
      st.quat.copy(stowQ).multiply(st.q);
    }
  };
  // a scabbard fitted to whatever is in it (made again when the weapon's look changes)
  const sheaths = {};
  const sheathFor = (k, obj) => {
    if (!spec.stow || !spec.stow.sheath || !stows[k] || !obj) return null;
    let first = null;
    obj.traverse((o) => { if (!first && o.isMesh) first = o; });
    if (!first) return null;
    const sh = sheaths[k];
    if (sh && sh.key === first.uuid) return sh.group;
    if (sh) { root.remove(sh.group); sh.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    const group = makeSheath(obj);
    if (!group) return null;
    root.add(group);
    sheaths[k] = { key: first.uuid, group };
    return group;
  };
  const putAway = (obj, k) => {
    obj.position.copy(stows[k].pos);
    obj.quaternion.copy(stows[k].quat);
  };
  // (0.97.1) Sheathing: after a blow or a skill, walking, the hand takes the weapon to its place. It turns
  // the weapon to the scabbard's line on the way (or lifts it over the shoulder), slides it home, lets go,
  // and the arm goes back to the walk. Drawing is instant (the blow needs it).
  const SH_TURN = 0.4, SH_HOME = 0.66; // shares of the time: turned by, home by
  const sheathing = {}; // stow key -> seconds since it began
  let wasStowed = null;
  const ikRest = [];
  const shSmooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const ikS = new THREE.Vector3(), ikE = new THREE.Vector3(), ikW = new THREE.Vector3(), ikT = new THREE.Vector3(), ikP = new THREE.Vector3(), ikD = new THREE.Vector3(), ikE2 = new THREE.Vector3();
  const ikQ = new THREE.Quaternion(), ikPW = new THREE.Quaternion(), ikBW = new THREE.Quaternion();
  const turnBone = (bone, from, to, w) => {
    // turn a bone (in the world) so the direction `from` lies along `to`, by share w
    ikQ.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(ikBW);
    bone.parent.getWorldQuaternion(ikPW);
    ikBW.premultiply(ikQ).premultiply(ikPW.invert());
    bone.quaternion.slerp(ikBW, w);
    bone.updateWorldMatrix(false, true);
  };
  // two-bone reach: the palm to targetW (world), the elbow staying on the side the walk had it
  const reachArm = (st, targetW, w, poleW = null) => {
    const hand = st.hand, fore = hand && hand.parent, upper = fore && fore.parent;
    if (!upper || w <= 0.001) return;
    ikRest.push([upper, upper.quaternion.clone()], [fore, fore.quaternion.clone()]);
    upper.updateWorldMatrix(true, true);
    upper.getWorldPosition(ikS); fore.getWorldPosition(ikE); hand.getWorldPosition(ikW);
    ikP.copy(st.palm).applyMatrix4(hand.matrixWorld).sub(ikW); // palm from wrist, as it is now
    ikT.copy(targetW).sub(ikP);
    const a = ikE.distanceTo(ikS), b = ikW.distanceTo(ikE);
    ikD.copy(ikT).sub(ikS);
    const d = Math.min(Math.max(ikD.length(), 1e-4), (a + b) * 0.999);
    ikD.normalize();
    const pole = poleW ? poleW.clone() : ikE.clone().sub(ikS);
    pole.addScaledVector(ikD, -pole.dot(ikD));
    if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0);
    pole.normalize();
    const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
    ikE2.copy(ikS).addScaledVector(ikD, a * cosA).addScaledVector(pole, a * Math.sqrt(1 - cosA * cosA));
    turnBone(upper, ikE.clone().sub(ikS), ikE2.clone().sub(ikS), w);
    fore.getWorldPosition(ikE); hand.getWorldPosition(ikW);
    turnBone(fore, ikW.clone().sub(ikE), ikT.clone().sub(ikE), w);
  };
  // (0.97.2) the mage's own ways of holding her staff (spec.staffPose), each an anchor riding the hips
  const anchors = {};
  for (const [k, def] of Object.entries(spec.staffPose || {})) {
    const bone = root.getObjectByName(def.bone);
    const handBone = root.getObjectByName(def.hand || spec.hand);
    if (!bone || !handBone) continue;
    const bp = new THREE.Vector3(), bq = new THREE.Quaternion();
    new THREE.Matrix4().multiplyMatrices(rootInv0, bone.matrixWorld).decompose(bp, bq, new THREE.Vector3());
    anchors[k] = { def, bone, hand: handBone, palm: gripAt(handBone), bqi: bq.clone().invert(), atM: new THREE.Vector3(...def.at).multiplyScalar(1 / tpl.scale), dirM: def.dir ? new THREE.Vector3(...def.dir).normalize() : null, poleM: def.pole ? new THREE.Vector3(...def.pole).normalize() : null, pos: new THREE.Vector3(), dir: new THREE.Vector3(), yaw: new THREE.Quaternion(), w: 0 };
  }
  const groundY = new THREE.Box3().setFromObject(root).min.y; // the floor, in the model's own space
  const SIDE_AXIS = new THREE.Vector3(0, 0, 1);
  const placeAnchors = (inv, phase = null) => {
    for (const an of Object.values(anchors)) {
      stowM.multiplyMatrices(inv, an.bone.matrixWorld).decompose(stowP, stowQ, stowS);
      stowF.set(1, 0, 0).applyQuaternion(stowQ.multiply(an.bqi));
      an.yaw.setFromAxisAngle(Y_AXIS, Math.atan2(-stowF.z, stowF.x));
      an.pos.copy(an.atM);
      if (an.dirM) an.dir.copy(an.dirM);
      const sw = an.def.swing;
      if (sw && phase != null) {
        // (0.97.4) the arm keeps time with the run: a little forward and back with each stride, a bob with each step
        const c = Math.sin(2 * Math.PI * (phase + (sw.phase || 0))), b = Math.cos(4 * Math.PI * (phase + (sw.phase || 0)));
        an.pos.x += (sw.fwd * c) / tpl.scale;
        an.pos.y += (sw.bob * b) / tpl.scale;
        if (an.dirM) an.dir.applyAxisAngle(SIDE_AXIS, (sw.tilt * c * Math.PI) / 180);
      }
      an.pos.applyQuaternion(an.yaw).add(stowP);
      if (an.dirM) an.dir.applyQuaternion(an.yaw);
    }
  };
  let staffSpan = null; // the staff's own ends (its local z), measured once
  // where the weapon is while it is being sheathed (in hand at palmPos / inHandQ to begin with)
  const sheathPose = (k, pos, quat) => {
    const st = stows[k], f = sheathing[k] / ((spec.stow && spec.stow.time) || 0.7);
    if (f >= SH_HOME) { pos.copy(st.pos); quat.copy(st.quat); return; }
    if (f < SH_TURN) { quat.slerp(st.quat, shSmooth(f / SH_TURN)); return; }
    quat.copy(st.quat);
    if (st.reach) pos.lerp(st.pos, shSmooth((f - SH_TURN) / (SH_HOME - SH_TURN)));
  };
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
  const fistHole = hand && fistAt[hand.name] ? new THREE.Vector3(...fistAt[hand.name].hole) : null;
  const handRest = new THREE.Quaternion(); // the wrist as the clips left it, before the staff bend
  let handBent = null;
  const holeW = new THREE.Vector3(), wantW = new THREE.Vector3(), twistQ = new THREE.Quaternion();
  const palm = hand ? gripAt(hand) : new THREE.Vector3(); // weapons sit in the hand, not at the wrist joint
  const aiming = Object.values(actions).concat(Object.values(moves).map((m) => m.action)).filter((a) => a && spec.aiming && spec.aiming.test(a.getClip().name));
  let bow = null;
  return {
    /** (0.95) the clip playing now (tests) */
    get clipName() {
      return current ? current.getClip().name : null;
    },
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
      held.push({ obj: w, hand: h, mode: 'blade', grip: forwardGrip(h), palm: gripAt(h) });
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
        } else if (s.moving && actions.walk && (s.walk || (s.speed || 6) < (spec.walkBelow || 4.2))) {
          // (0.95) walking (Ctrl or Caps Lock, or simply slow): a walk, not a slowed run
          actions.walk.timeScale = Math.max(0.7, Math.min(1.8, (s.speed || 1.8) / (spec.walkRef || 1.8))); // (0.96.1) the walk is made to cover 1.8 m a second at its own pace: matched, so the feet hold the ground
          fadeTo(actions.walk, endFade || 0.25);
        } else if (s.moving && actions.run) {
          actions.run.timeScale = Math.max(0.6, Math.min(1.8, (s.speed || 6) / (spec.runRef || 6.5)));
          fadeTo(actions.run, endFade || 0.2);
        } else fadeTo(actions.idle, endFade || (current === actions.run || current === actions.walk ? 0.35 : current === actions.spin ? 0.2 : 0.25)); // ease into a stop
        if (!move) endFade = 0;
      }
      // (0.50) put back the wrist the clips posed before they pose it again: while clips fade in and out
      // they blend from the bone's current turn, so a bend left in place built up frame on frame
      if (handBent) {
        handBent.quaternion.copy(handRest);
        handBent = null;
      }
      for (const [b, q] of ikRest) b.quaternion.copy(q); // (0.97.1) the sheathing reach, put back before the clips pose the arm again
      ikRest.length = 0;
      mixer.update(dt);
      // (0.97) walking (Ctrl), weapons are put away: on the hip or across the back, until a blow or a skill
      const stowed = !!s.walk && !s.dead && !s.spinning && !move && attackLeft <= 0;
      if (spec.stow) {
        root.updateMatrixWorld(true);
        placeStows(tmpM.copy(root.matrixWorld).invert());
        if (stowed && wasStowed === false) for (const k of Object.keys(stows)) if (stows[k].hand) sheathing[k] = 0;
        if (!stowed) for (const k of Object.keys(sheathing)) delete sheathing[k];
        wasStowed = stowed;
        const T = spec.stow.time || 0.7;
        for (const k of Object.keys(sheathing)) {
          sheathing[k] += dt;
          const f = sheathing[k] / T;
          if (f >= 1) { delete sheathing[k]; continue; }
          const st = stows[k];
          const w = f < 0.3 ? shSmooth(f / 0.3) : f < SH_HOME ? 1 : 1 - shSmooth((f - SH_HOME) / (1 - SH_HOME));
          // the hand: to the scabbard's mouth with the blade still out (or over the shoulder), then home
          const out = tmpP.set(0, 0, -st.slide).applyQuaternion(st.quat).add(st.pos);
          if (st.reach) out.copy(st.reach.pos);
          else if (f >= SH_TURN) out.lerp(st.pos, shSmooth((f - SH_TURN) / (SH_HOME - SH_TURN)));
          reachArm(st, root.localToWorld(out.clone()), w);
        }
        if (Object.keys(sheathing).length) root.updateMatrixWorld(true);
      }
      if (anchors.idle || anchors.run) {
        // (0.97.2) how much she stands or runs (and nothing else moves her arms): the staff held her own way
        const free = !s.dead && !s.spinning && !move && attackLeft <= 0 && !stowed;
        const wOf = (a) => (free && a && (a.isRunning() || a === current) ? a.getEffectiveWeight() : 0);
        const idleW = wOf(actions.idle), runW = wOf(actions.run);
        root.updateMatrixWorld(true);
        const inv = tmpM.copy(root.matrixWorld).invert();
        placeAnchors(inv, actions.run && runW > 0.01 ? actions.run.time / actions.run.getClip().duration : null);
        if (anchors.idle) anchors.idle.w = idleW;
        if (anchors.run) anchors.run.w = runW;
        if (anchors.hip) anchors.hip.w = idleW;
        for (const an of Object.values(anchors)) {
          if (an.w < 0.01) continue;
          const pole = an.poleM ? an.poleM.clone().applyQuaternion(an.yaw).transformDirection(root.matrixWorld) : null;
          reachArm(an, root.localToWorld(an.pos.clone()), an.w, pole);
        }
        root.updateMatrixWorld(true);
      }
      if (bow) {
        let aimW = 0;
        for (const a of aiming) if (a.isRunning() || a === current) aimW += a.getEffectiveWeight();
        const slung = !!s.walk && !s.dead && !move && attackLeft <= 0 && aimW < 0.05 && stows.main;
        bow.update(s.dead ? 0 : Math.min(1, aimW), slung && sheathing.main == null ? stows.main : null, slung && sheathing.main != null ? (p, q) => sheathPose('main', p, q) : null);
      }
      // (0.96.2) how much the walk is playing (and nothing else is moving the arms): weapons are carried clear of the legs
      const walkW = actions.walk && (actions.walk.isRunning() || actions.walk === current) && !s.dead && !s.spinning && !move && attackLeft <= 0 ? actions.walk.getEffectiveWeight() : 0;
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
        if (walkMainQ && walkW > 0.01) weapon.quaternion.slerp(walkMainQ, walkW * spec.walkCarry.w);
        const sh = sheathFor('main', weapon);
        if (sh) { putAway(sh, 'main'); sh.scale.copy(weapon.scale); }
        if (stowed && stows.main) {
          if (sheathing.main != null) sheathPose('main', weapon.position, weapon.quaternion);
          else putAway(weapon, 'main');
        }
      }
      if (held.length) {
        root.updateMatrixWorld(true);
        const inv = tmpM.copy(root.matrixWorld).invert();
        for (const h of held) {
          if (h.mode === 'blade') {
            const hm = new THREE.Matrix4().multiplyMatrices(inv, h.hand.matrixWorld);
            hm.decompose(tmpP, tmpQ, tmpS);
            h.obj.position.copy(h.palm).applyMatrix4(hm);
            h.obj.quaternion.copy(tmpQ).multiply(h.grip);
            if (walkOffQ && walkW > 0.01 && h.hand.name === spec.offhand) h.obj.quaternion.slerp(walkOffQ, walkW * spec.walkCarry.w);
            if (h.hand.name === spec.offhand && stows.off) {
              const sh = sheathFor('off', h.obj);
              if (sh) { putAway(sh, 'off'); sh.scale.copy(h.obj.scale); }
              if (stowed) {
                if (sheathing.off != null) sheathPose('off', h.obj.position, h.obj.quaternion);
                else putAway(h.obj, 'off');
              }
            }
          } else {
            // a staff stays upright, leaning the way the forearm points (forward when casting)
            const fore = h.hand.parent;
            fore.getWorldPosition(staffA);
            h.hand.getWorldPosition(staffB);
            staffB.sub(staffA).transformDirection(inv);
            staffUp.set(0, 1, 0).addScaledVector(staffB, 0.35).normalize();
            // (0.97.2) upright at her side standing, trailing behind her running
            let slideW = 0, slideAn = null;
            for (const an of [anchors.idle, anchors.run]) {
              if (!an || an.w < 0.01) continue;
              staffUp.lerp(an.dir, an.w).normalize();
              if (an.w > slideW) { slideW = an.w; slideAn = an; }
            }
            h.obj.quaternion.setFromUnitVectors(zAxis, staffUp);
            if (fistHole && !(stowed && stows.main)) {
              // bend the wrist so the fist closes round the staff, knuckles along it, as a hand holds a
              // walking stick (0.48.1): the smallest turn of the hand that lines its fist up with the staff
              const hm0 = new THREE.Matrix4().multiplyMatrices(inv, h.hand.matrixWorld);
              hm0.decompose(tmpP, tmpQ, tmpS);
              holeW.copy(fistHole).applyQuaternion(tmpQ);
              wantW.copy(staffUp);
              if (holeW.dot(wantW) < 0) wantW.negate(); // the hole runs both ways: turn the short way
              twistQ.setFromUnitVectors(holeW, wantW); // in the model's space...
              const ang = holeW.angleTo(wantW);
              if (ang > 1.4) twistQ.slerp(IDENTITY_Q, 1 - 1.4 / ang); // at most ~80°: a wrist bends only so far
              twistQ.premultiply(tmpQ.clone().invert()).multiply(tmpQ); // ...as a turn of the hand itself
              handRest.copy(h.hand.quaternion);
              handBent = h.hand;
              h.hand.quaternion.multiply(twistQ);
              h.hand.updateMatrixWorld(true);
            }
            const hm = new THREE.Matrix4().multiplyMatrices(inv, h.hand.matrixWorld);
            h.obj.position.copy(h.palm).applyMatrix4(hm);
            if (slideAn) {
              // slide it through her hand: its foot on the ground (standing), or held near its foot (running)
              let firstMesh = null;
              h.obj.traverse((o) => { if (!firstMesh && o.isMesh) firstMesh = o; });
              if (!staffSpan || staffSpan.key !== (firstMesh && firstMesh.uuid)) {
                const bb = new THREE.Box3();
                h.obj.updateMatrixWorld(true);
                const invO = new THREE.Matrix4().copy(h.obj.matrixWorld).invert();
                h.obj.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(invO, o.matrixWorld))); } });
                staffSpan = [bb.min.z, bb.max.z];
                staffSpan.key = firstMesh && firstMesh.uuid; // (a new look is measured again)
              }
              const sc = h.obj.scale.x, axis = staffUp;
              let t;
              if (slideAn.def.ground) t = axis.y > 0.2 ? (groundY + 0.01 - (h.obj.position.y + axis.y * staffSpan[0] * sc)) / axis.y : 0;
              else t = -(staffSpan[0] + (slideAn.def.hold || 0.2) * (staffSpan[1] - staffSpan[0])) * sc;
              h.obj.position.addScaledVector(axis, t * slideW);
            }
            if (stowed && stows.main) {
              // (0.97) across her back
              if (sheathing.main != null) sheathPose('main', h.obj.position, h.obj.quaternion);
              else putAway(h.obj, 'main');
            }
          }
        }
      }
    },
  };
}

/**
 * A scabbard (0.97) fitted to a blade: measured from the weapon itself (grip at the origin, blade along +Z),
 * from just past the guard (the widest part near the grip) to the tip, a little wider than the blade.
 * Leather, with a metal throat and chape. Built in the weapon's own units; it takes the weapon's scale.
 */
const SHEATH_LEATHER = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.75, metalness: 0.05 });
const SHEATH_METAL = new THREE.MeshStandardMaterial({ color: 0xb39255, roughness: 0.35, metalness: 0.8 });
export function makeSheath(obj) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const pts = [];
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const p = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 4000));
    for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
  });
  if (!pts.length) return null;
  let tip = -Infinity;
  for (let i = 2; i < pts.length; i += 3) tip = Math.max(tip, pts[i]);
  if (!(tip > 0)) return null;
  // the guard: the widest part near the grip (in any direction across the blade)
  const N = 40, rad = new Array(N).fill(0);
  for (let i = 0; i < pts.length; i += 3) {
    const z = pts[i + 2];
    if (z < 0) continue;
    const b = Math.min(N - 1, Math.floor((z / tip) * N));
    rad[b] = Math.max(rad[b], Math.hypot(pts[i], pts[i + 1]));
  }
  let guard = 0;
  for (let b = 0; b < N * 0.45; b++) if (rad[b] > rad[guard]) guard = b;
  const from = ((guard + 1.5) / N) * tip;
  // the blade's cross-section, along its own flat (a blade need not lie square to the file's axes)
  let sx = 0, sy = 0, n = 0;
  const bp = [];
  for (let i = 0; i < pts.length; i += 3) {
    const z = pts[i + 2];
    if (z < ((guard + 2) / N) * tip || z > 0.97 * tip) continue;
    bp.push(pts[i], pts[i + 1], z); sx += pts[i]; sy += pts[i + 1]; n++;
  }
  if (n < 10) return null;
  const mx = sx / n, my = sy / n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < bp.length; i += 3) { const dx = bp[i] - mx, dy = bp[i + 1] - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), c = Math.cos(th), sn = Math.sin(th);
  const lo = new Array(N).fill(Infinity), hi = new Array(N).fill(-Infinity), loY = new Array(N).fill(Infinity), hiY = new Array(N).fill(-Infinity);
  for (let i = 0; i < bp.length; i += 3) {
    const dx = bp[i] - mx, dy = bp[i + 1] - my, u = dx * c + dy * sn, w = -dx * sn + dy * c;
    const b = Math.min(N - 1, Math.floor((bp[i + 2] / tip) * N));
    lo[b] = Math.min(lo[b], u); hi[b] = Math.max(hi[b], u); loY[b] = Math.min(loY[b], w); hiY[b] = Math.max(hiY[b], w);
  }
  const ws = [], ts = [];
  for (let b = 0; b < N; b++) if (hi[b] > lo[b]) { ws.push(hi[b] - lo[b]); ts.push(hiY[b] - loY[b]); }
  if (ws.length < 3) return null;
  const pct = (a, f) => a.slice().sort((p, q) => p - q)[Math.min(a.length - 1, Math.floor(a.length * f))];
  const bw = pct(ws, 0.8), bt = pct(ts, 0.8);
  const x0 = -bw / 2, x1 = bw / 2, y0 = -bt / 2, y1 = bt / 2;
  const len = tip * 1.03 - from, cx = mx, cy = my;
  const hw = (x1 - x0) * 0.56 + tip * 0.005, ht = (y1 - y0) * 0.56 + tip * 0.007; // flat like the blade, a little over it
  const body = new THREE.CylinderGeometry(0.62, 1, len, 16).rotateX(Math.PI / 2).scale(hw, ht, 1).rotateZ(th).translate(cx, cy, from + len / 2);
  const throat = new THREE.CylinderGeometry(1.08, 1.08, tip * 0.05, 16).rotateX(Math.PI / 2).scale(hw, ht, 1).rotateZ(th).translate(cx, cy, from + tip * 0.025);
  const chape = new THREE.CylinderGeometry(0.12, 0.66, tip * 0.09, 16).rotateX(Math.PI / 2).scale(hw, ht, 1).rotateZ(th).translate(cx, cy, from + len - tip * 0.045);
  const group = new THREE.Group();
  for (const [g, mat] of [[body, SHEATH_LEATHER], [throat, SHEATH_METAL], [chape, SHEATH_METAL]]) {
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.userData.keepMat = true;
    group.add(mesh);
  }
  return group;
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
    update(aimW, stow = null, adjust = null) {
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
      if (stow) {
        // (0.97) slung across her back, the string slack
        group.quaternion.copy(stow.quat);
        group.position.copy(stow.pos);
      }
      if (adjust) adjust(group.position, group.quaternion); // (0.97.1) on its way there
      group.updateMatrix();
      // the string: to the drawing hand while it is pulled back behind the bow
      tmp.copy(dp).applyMatrix4(m.copy(group.matrix).invert());
      // (0.52: the arrow shows again whenever the hand is drawing, as before 0.50: it is the next arrow
      // coming from the quiver to the string, which is what she is doing)
      const drawn = !stow && !adjust && aimW > 0.4 && tmp.x < -0.24 && tmp.x > -0.72 && Math.abs(tmp.y) < 0.3 && Math.abs(tmp.z) < 0.25;
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
for (const c of ['warrior', 'archer', 'mage', 'rogue']) {
  for (const g of ['m', 'f']) {
    Object.defineProperty(RIGGED, `hero_keep_${c}_${g}`, { get: () => ({ ...RIGGED[`hero_${c}`], url: `models/keep_${c}_${g}.glb` }), enumerable: true, configurable: true });
  }
}

export function heroLook(cls, spec, eternal = false) {
  if (eternal && RIGGED[`hero_${cls}_eternal`]) return `${cls}_eternal`; // (0.76) the Eternal form comes first
  return cls === 'rogue' && spec ? 'ninja' : cls;
}

export function upgradeHero(model, cls, look = cls) {
  const id = `hero_${look}`;
  model.lookId = look;
  if (!RIGGED[id]) return;
  const both = Promise.all([loadRigged(id), loadWeapon(cls, (RIGGED[id] && RIGGED[id].weaponScale) || 1)]);
  hideWhileLoading([model.parts.body], both.then(([tpl]) => !!tpl), () => !model.disposed && !model.rig); // (0.56.2) no blocky hero first
  both.then(([tpl, made]) => {
    if (!tpl || model.disposed || model.rig) return;
    const rig = instantiate(tpl);
    const arm = model.parts.arm;
    if (tpl.spec.noWeapon) {
      // (0.92) the Seraph holds nothing; (0.93) its stone glows a little from within, pale gold
      if (tpl.spec.float) rig.group.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.set(0x6a6250); o.material.emissiveIntensity = 0.55; } });
      model.parts.body.visible = false;
      model.group.add(rig.group);
      model.mats.push(...rig.mats);
      rig.baseTurn = rig.group.rotation.y;
      model.rig = rig;
      return;
    }
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
