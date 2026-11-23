// (0.81.1) The Wishkeep's own people: its heroes (the keep's sworn, in its crimson and bone, each class with
// its own kit and silhouette, nothing like a player's hero) and the folk who live there (a farmer, a baker,
// an elder, children, a smith, a washerwoman, a pilgrim, a lamplighter). Built from simple shapes like the
// rest of the cast, with jointed legs and arms so they walk and fight without a rig.
//
// buildKeepHero(cls, seed) and buildVillager(kind, seed) return { group, mats, parts, keep: true, anim(dt, s) }.
// anim() is called every frame with { moving, dead, swing (0..1 through an attack, 1 when idle), speed }.
import * as THREE from 'three';
import { addRim } from './environment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const matCache = new Map();
/** Materials are shared by colour (and kept: never disposed with one model). */
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = matCache.get(key);
  if (!m) {
    m = addRim(new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.06, ...o }));
    m.userData.keep = true;
    matCache.set(key, m);
  }
  return m;
}
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.keep = true;
    geoCache.set(key, g);
  }
  return g;
}
function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
const f3 = (n) => n.toFixed(3);
const box = (w, h, d, m, x, y, z) => mesh(geo(`b${f3(w)},${f3(h)},${f3(d)}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.25)), m, x, y, z);
const cyl = (rt, rb, h, m, x, y, z, seg = 10) => mesh(geo(`c${f3(rt)},${f3(rb)},${f3(h)},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z);
const ball = (r, m, x, y, z, d = 1) => mesh(geo(`s${f3(r)},${d}`, () => new THREE.IcosahedronGeometry(r, d)), m, x, y, z);
const cone = (r, h, m, x, y, z, seg = 10) => mesh(geo(`k${f3(r)},${f3(h)},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), m, x, y, z);
const dome = (r, m, x, y, z, cut = 0.5) => mesh(geo(`d${f3(r)},${cut}`, () => new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * cut)), m, x, y, z);
const torus = (r, t, arc, m, x, y, z) => mesh(geo(`t${f3(r)},${f3(t)},${f3(arc)}`, () => new THREE.TorusGeometry(r, t, 6, 16, arc)), m, x, y, z);

// a small seeded pick, so the same hero always looks the same
function picker(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return { next, pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length] };
}
const SKINS = [0xf0c8a4, 0xe0ae86, 0xc68e64, 0x9a6844, 0x6e4a32];
const HAIRS = [0x2a1a10, 0x4a2e18, 0x7a5228, 0xb88a48, 0xd8c8a8, 0x8a2a1a, 0x1a1a1e];

// the keep's colours
const CRIMSON = 0x9e1e2e;
const BONE = 0xe8dcc0;
const GOLD = 0xd8a840;

/**
 * A body on two legs: hips, legs on pivots (they swing when walking), a torso, a head, and two arms on
 * shoulder pivots. Arms hang down their local -Y; rotating an arm's x by a negative angle swings it forward.
 */
function body({ skin, tunic, legs, boots, h = 1, wide = 1, robe = false, stoop = 0 }) {
  const g = new THREE.Group();
  const root = new THREE.Group(); // everything that bobs and leans
  g.add(root);
  const hipY = 0.78 * h;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.15 * wide, hipY, 0);
  legR.position.set(0.15 * wide, hipY, 0);
  for (const leg of [legL, legR]) {
    leg.add(box(0.2 * wide, 0.62 * h, 0.24, mat(legs), 0, -0.3 * h, 0));
    leg.add(box(0.23 * wide, 0.16, 0.34, mat(boots), 0, -0.7 * h, 0.04));
  }
  root.add(legL, legR);
  const torso = new THREE.Group();
  torso.position.y = hipY;
  torso.rotation.x = stoop;
  root.add(torso);
  if (robe) torso.add(cyl(0.3 * wide, 0.48 * wide, 0.95 * h, mat(tunic), 0, 0.0 * h, 0, 12)); // a robe down past the knees
  torso.add(cyl(0.3 * wide, 0.33 * wide, 0.78 * h, mat(tunic), 0, 0.4 * h, 0, 12));
  const neck = 0.86 * h;
  const head = new THREE.Group();
  head.position.y = neck + 0.2;
  head.add(ball(0.23, mat(skin), 0, 0, 0, 2));
  head.add(ball(0.05, mat(skin), 0, -0.02, 0.22)); // a nose, so you can tell which way they face
  const eye = mat(0x1a1210);
  head.add(ball(0.032, eye, -0.085, 0.05, 0.2, 0), ball(0.032, eye, 0.085, 0.05, 0.2, 0));
  torso.add(head);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.42 * wide, neck - 0.08, 0);
  armR.position.set(0.42 * wide, neck - 0.08, 0);
  for (const arm of [armL, armR]) {
    arm.add(box(0.17, 0.56 * h, 0.19, mat(tunic), 0, -0.26 * h, 0));
    arm.add(ball(0.09, mat(skin), 0, -0.58 * h, 0.02));
    arm.rotation.order = 'XYZ';
  }
  torso.add(armL, armR);
  const handL = new THREE.Group(), handR = new THREE.Group();
  handL.position.y = -0.58 * h;
  handR.position.y = -0.58 * h;
  armL.add(handL);
  armR.add(handR);
  return { g, root, torso, head, legL, legR, armL, armR, handL, handR, h };
}

/** Walking, falling and the idle sway, the same for everyone; the attack is each model's own. */
function baseAnim(B, st, dt, rest) {
  const a = B.anim || (B.anim = { walk: 0, idle: Math.random() * 6, fall: 0 });
  a.idle += dt;
  if (st.dead) {
    a.fall = Math.min(1, a.fall + dt * 3);
    B.g.rotation.x = -(Math.PI / 2 - 0.15) * a.fall;
    B.g.position.y = 0.25 * a.fall;
    return false;
  }
  a.fall = 0;
  B.g.rotation.x = 0;
  const sp = st.speed || 1;
  if (st.moving) a.walk += dt * 9 * sp;
  else a.walk *= Math.max(0, 1 - dt * 10);
  const s = Math.sin(a.walk);
  const amp = st.moving ? 0.55 : 0;
  B.legL.rotation.x = s * amp;
  B.legR.rotation.x = -s * amp;
  B.root.position.y = st.moving ? Math.abs(Math.cos(a.walk)) * 0.07 : Math.sin(a.idle * 2) * 0.012;
  B.armL.rotation.x = (rest.l || 0) - s * amp * 0.6;
  B.armR.rotation.x = (rest.r || 0) + s * amp * 0.6;
  B.armL.rotation.z = rest.lz || 0;
  B.armR.rotation.z = rest.rz || 0;
  return true;
}
/** 0 → 1 → 0 across an attack: a quick wind-up, a fast strike, a slower return. */
function strikeCurve(t) {
  if (t >= 1) return { wind: 0, hit: 0 };
  if (t < 0.3) return { wind: t / 0.3, hit: 0 };
  if (t < 0.5) return { wind: 1 - (t - 0.3) / 0.2, hit: (t - 0.3) / 0.2 };
  return { wind: 0, hit: 1 - (t - 0.5) / 0.5 };
}

function tabard(B, wide = 1) {
  // the keep's colours over the chest: crimson, a bone border and the Hearth's diamond
  B.torso.add(box(0.5 * wide, 0.74 * B.h, 0.05, mat(CRIMSON), 0, 0.32 * B.h, 0.35 * wide));
  B.torso.add(box(0.52 * wide, 0.07, 0.07, mat(BONE), 0, 0.68 * B.h, 0.35 * wide));
  const d = box(0.17, 0.17, 0.05, mat(GOLD, { metalness: 0.6, roughness: 0.35, emissive: 0x7a3a10, emissiveIntensity: 0.3 }), 0, 0.42 * B.h, 0.39 * wide);
  d.rotation.z = Math.PI / 4;
  B.torso.add(d);
  B.torso.add(box(0.66 * wide, 0.09, 0.62 * wide, mat(0x3a2418), 0, 0.02, 0)); // belt
  B.torso.add(box(0.12, 0.1, 0.06, mat(GOLD, { metalness: 0.6, roughness: 0.35 }), 0, 0.02, 0.32 * wide));
}

// ---------------------------------------------------------------------------------------------- heroes
/** The Shieldbearer (warrior): kettle helm, mail, a great round shield in the keep's colours, a spear. */
function shieldbearer(r, skin) {
  const B = body({ skin, tunic: 0x7a8088, legs: 0x3a3a40, boots: 0x2a1e16, wide: 1.12 });
  tabard(B, 1.12);
  const steel = mat(0xb8c0c8, { metalness: 0.7, roughness: 0.32 });
  // pauldrons and a kettle helm with a brim
  B.torso.add(dome(0.2, steel, -0.46, 0.8, 0), dome(0.2, steel, 0.46, 0.8, 0));
  B.head.add(dome(0.26, steel, 0, 0.04, 0, 0.5));
  B.head.add(cyl(0.4, 0.4, 0.04, steel, 0, 0.05, 0, 16));
  B.head.add(box(0.5, 0.05, 0.05, mat(CRIMSON), 0, 0.2, 0)); // a crest
  if (r.next() < 0.5) B.head.add(box(0.3, 0.12, 0.1, mat(r.pick(HAIRS)), 0, -0.17, 0.15)); // a beard
  // shield on the left arm, facing out and forward
  const shield = new THREE.Group();
  shield.position.set(-0.12, -0.32, 0.18);
  shield.rotation.y = -0.35;
  shield.add(cyl(0.48, 0.48, 0.07, mat(CRIMSON), 0, 0, 0, 18).rotateX(Math.PI / 2));
  shield.add(torus(0.48, 0.04, Math.PI * 2, steel, 0, 0, 0.0));
  shield.add(ball(0.1, mat(GOLD, { metalness: 0.7, roughness: 0.3 }), 0, 0, 0.05));
  const band = box(0.9, 0.08, 0.04, mat(BONE), 0, 0, 0.04);
  band.rotation.z = Math.PI / 4;
  shield.add(band);
  B.armL.add(shield);
  // a spear in the right hand, point down its hand's -Y (lowered at rest, level in a thrust)
  const spear = new THREE.Group();
  spear.add(cyl(0.035, 0.035, 2.3, mat(0x6b4a2e), 0, -0.55, 0, 6));
  spear.add(cone(0.08, 0.34, steel, 0, -1.85, 0, 6).rotateX(Math.PI));
  spear.add(box(0.14, 0.06, 0.06, mat(CRIMSON), 0, -1.6, 0)); // a pennon
  B.handR.add(spear);
  B.handR.rotation.x = 0.2;
  return {
    B,
    anim(dt, st) {
      if (!baseAnim(B, st, dt, { l: -0.75, lz: 0.25, r: -0.5 })) return;
      const { wind, hit } = strikeCurve(st.swing);
      B.armR.rotation.x += 0.5 * wind - 1.0 * hit; // draw back, then thrust level
      B.torso.rotation.y = -0.25 * wind + 0.3 * hit;
      B.armL.rotation.x -= 0.4 * hit; // the shield comes up too
    },
  };
}

/** The Warden (archer): hood and short cape, a quiver on the back, a tall longbow. */
function warden(r, skin) {
  const B = body({ skin, tunic: 0x4a5a3a, legs: 0x3a3226, boots: 0x3a2618 });
  tabard(B, 0.95);
  const hood = mat(CRIMSON, { side: THREE.DoubleSide });
  B.head.add(dome(0.28, hood, 0, 0.0, -0.03, 0.62));
  B.head.add(cone(0.12, 0.3, hood, 0, 0.0, -0.3).rotateX(-Math.PI / 2 - 0.5)); // the hood's tail
  B.head.add(box(0.36, 0.08, 0.12, mat(r.pick(HAIRS)), 0, 0.08, 0.16)); // a fringe of hair
  const cape = box(0.62, 0.7, 0.04, hood, 0, 0.4, -0.33);
  cape.rotation.x = 0.12;
  B.torso.add(cape);
  // quiver
  const q = new THREE.Group();
  q.position.set(0.18, 0.5, -0.3);
  q.rotation.z = -0.35;
  q.add(cyl(0.1, 0.09, 0.6, mat(0x5a3a22), 0, 0, 0, 8));
  for (let i = 0; i < 4; i++) q.add(box(0.03, 0.12, 0.08, mat(i % 2 ? BONE : CRIMSON), (i - 1.5) * 0.04, 0.36, 0));
  B.torso.add(q);
  // longbow in the left hand, held upright (the hand turns to keep it so), its belly forward
  const bow = new THREE.Group();
  bow.rotation.y = -Math.PI / 2;
  const R = 0.85;
  const limb = torus(R, 0.035, Math.PI * 0.9, mat(0x7a5232), -R, 0, 0);
  limb.rotation.z = -Math.PI * 0.45;
  bow.add(limb);
  bow.add(cyl(0.009, 0.009, 2 * R * Math.sin(Math.PI * 0.45), mat(0xf0ead8), -R + R * Math.cos(Math.PI * 0.45), 0, 0, 3));
  bow.add(box(0.08, 0.2, 0.08, mat(CRIMSON), 0, 0, 0)); // the grip
  B.handL.add(bow);
  return {
    B,
    anim(dt, st) {
      if (!baseAnim(B, st, dt, { l: -0.5, r: -0.15 })) return;
      const { wind, hit } = strikeCurve(st.swing);
      const draw = Math.max(wind, st.swing < 1 ? 0.6 * hit : 0);
      B.armL.rotation.x -= 1.05 * draw; // the bow comes up and level
      B.handL.rotation.x = -B.armL.rotation.x; // (and stays upright)
      B.armR.rotation.x -= 1.3 * wind; // the string hand to the cheek
      B.armR.rotation.z = -0.5 * wind;
      B.torso.rotation.y = -0.35 * draw;
    },
  };
}

/** The Lanternkeeper (mage): a long robe, a deep cowl and a crooked staff with a lantern of the Hearth's fire. */
function lanternkeeper(r, skin) {
  const B = body({ skin, tunic: 0x3a2a4a, legs: 0x2a2030, boots: 0x22181a, robe: true });
  // a crimson stole over the robe, and a book at the hip
  B.torso.add(box(0.16, 0.95, 0.06, mat(CRIMSON), -0.13, 0.3, 0.32), box(0.16, 0.95, 0.06, mat(CRIMSON), 0.13, 0.3, 0.32));
  B.torso.add(box(0.2, 0.26, 0.1, mat(0x5a2a1a), 0.32, -0.05, 0.12));
  B.torso.add(box(0.66, 0.08, 0.62, mat(GOLD, { metalness: 0.5, roughness: 0.4 }), 0, 0.02, 0));
  const cowl = mat(0x2a1e36, { side: THREE.DoubleSide });
  B.head.add(dome(0.3, cowl, 0, -0.02, -0.04, 0.66));
  B.head.add(box(0.42, 0.14, 0.3, cowl, 0, -0.2, -0.02)); // the cowl about the shoulders
  if (r.next() < 0.6) B.head.add(cone(0.14, 0.34, mat(r.pick([0xd8d0c0, 0xa89a88, 0x6a5a48])), 0, -0.28, 0.14).rotateX(Math.PI)); // a beard
  // the staff, upright in the right hand, with a crook and a lantern hanging from it
  const staff = new THREE.Group();
  staff.add(cyl(0.04, 0.05, 2.1, mat(0x4a3220), 0, 0.3, 0, 6));
  const crook = torus(0.16, 0.035, Math.PI * 1.2, mat(0x4a3220), 0.16, 1.36, 0);
  staff.add(crook);
  const lantern = new THREE.Group();
  lantern.position.set(0.3, 1.18, 0);
  lantern.add(box(0.14, 0.04, 0.14, mat(0x2a2a2a), 0, 0.12, 0), box(0.14, 0.04, 0.14, mat(0x2a2a2a), 0, -0.12, 0));
  const fire = new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff7a20, emissiveIntensity: 2.2, roughness: 0.4 });
  lantern.add(mesh(new THREE.OctahedronGeometry(0.09, 0), fire));
  staff.add(lantern);
  B.handR.add(staff);
  B.handR.rotation.x = 0.3;
  return {
    B,
    fire,
    anim(dt, st) {
      if (!baseAnim(B, st, dt, { l: -0.3, r: -0.35 })) return;
      const { wind, hit } = strikeCurve(st.swing);
      B.armR.rotation.x -= 0.9 * wind + 0.3 * hit; // the lantern held up ...
      B.handR.rotation.x = 0.3 + 0.7 * hit; // ... and thrust at them
      B.armL.rotation.x -= 1.2 * hit;
      fire.emissiveIntensity = 2.2 + 4 * hit + 0.4 * Math.sin(performance.now() / 90);
    },
  };
}

/** The Nightwatch (rogue): hooded, masked to the eyes, a short cloak, a hooked knife in each hand. */
function nightwatch(r, skin) {
  const B = body({ skin, tunic: 0x2e2a30, legs: 0x241e22, boots: 0x1a1414, wide: 0.92 });
  B.torso.add(box(0.46, 0.5, 0.05, mat(CRIMSON), 0, 0.44, 0.3)); // a crimson vest
  B.torso.add(box(0.62, 0.08, 0.58, mat(0x3a2418), 0, 0.02, 0));
  B.torso.add(box(0.1, 0.14, 0.1, mat(0x5a3a22), -0.3, -0.02, 0.18), box(0.1, 0.14, 0.1, mat(0x5a3a22), 0.3, -0.02, 0.18)); // pouches
  B.torso.add(box(0.16, 0.04, 0.6, mat(BONE), 0.18, 0.5, 0).rotateZ(-0.7)); // a bandolier
  const hood = mat(0x1e1a22, { side: THREE.DoubleSide });
  B.head.add(dome(0.27, hood, 0, 0.0, -0.03, 0.6));
  B.head.add(box(0.4, 0.16, 0.2, mat(CRIMSON), 0, -0.1, 0.1)); // the mask
  const cloak = box(0.6, 0.56, 0.04, hood, 0, 0.5, -0.32);
  cloak.rotation.x = 0.2;
  B.torso.add(cloak);
  const steel = mat(0xd0d8e0, { metalness: 0.8, roughness: 0.25 });
  for (const hand of [B.handL, B.handR]) {
    const k = new THREE.Group();
    k.add(box(0.06, 0.16, 0.06, mat(0x3a2418), 0, 0, 0));
    const blade = box(0.04, 0.08, 0.5, steel, 0, 0, 0.3);
    k.add(blade);
    k.add(box(0.04, 0.08, 0.12, steel, 0, -0.05, 0.53).rotateX(0.6)); // the hook
    hand.add(k);
  }
  return {
    B,
    anim(dt, st) {
      if (!baseAnim(B, st, dt, { l: -0.55, r: -0.55, lz: 0.2, rz: -0.2 })) return;
      const { wind, hit } = strikeCurve(st.swing);
      B.root.position.y += 0.0;
      B.torso.rotation.x = 0.25 * (wind + hit); // a crouch into it
      B.armR.rotation.x -= 0.9 * hit - 0.4 * wind;
      B.armL.rotation.x -= 0.9 * Math.max(0, hit - 0.3) - 0.4 * wind;
      B.torso.rotation.y = 0.3 * wind - 0.4 * hit;
    },
  };
}

const HERO_BUILD = { warrior: shieldbearer, archer: warden, mage: lanternkeeper, rogue: nightwatch };

/** One of the Wishkeep's heroes: the same look every time for the same seed (their id). */
export function buildKeepHero(cls, seed = 1) {
  const r = picker(seed * 7 + 3);
  const made = (HERO_BUILD[cls] || shieldbearer)(r, r.pick(SKINS));
  const B = made.B;
  B.g.scale.setScalar(0.96 + r.next() * 0.1);
  return { group: B.g, mats: [], parts: { body: B.root }, keep: true, anim: made.anim };
}

// ------------------------------------------------------------------------------------------- villagers
export const VILLAGER_KINDS = ['farmer', 'baker', 'elder', 'child', 'smith', 'washer', 'pilgrim', 'lamplighter', 'child', 'farmer'];

function villagerHair(B, r, long = false) {
  const hair = mat(r.pick(HAIRS));
  B.head.add(dome(0.25, hair, 0, 0.02, -0.02, 0.55));
  if (long) B.head.add(box(0.36, 0.34, 0.12, hair, 0, -0.12, -0.17));
  return hair;
}

const FOLK = {
  farmer(r, skin) {
    const B = body({ skin, tunic: r.pick([0x8a6a3a, 0x6a7a4a, 0x9a5a3a]), legs: 0x4a3a2a, boots: 0x3a2618 });
    villagerHair(B, r);
    // a wide straw hat, and a hoe over the shoulder
    B.head.add(cyl(0.44, 0.46, 0.04, mat(0xd8b868), 0, 0.14, 0, 14), cone(0.24, 0.22, mat(0xd8b868), 0, 0.26, 0, 12));
    const hoe = new THREE.Group();
    hoe.add(cyl(0.03, 0.03, 1.5, mat(0x7a5232), 0, 0.1, 0, 6));
    hoe.add(box(0.26, 0.05, 0.14, mat(0x6a6e72, { metalness: 0.6 }), 0.1, 0.85, 0));
    B.handR.add(hoe);
    B.handR.rotation.set(-0.4, 0, 0.2);
    return { B, rest: { r: -1.9, rz: 0.15 } };
  },
  baker(r, skin) {
    const B = body({ skin, tunic: 0xd8d0c0, legs: 0x5a4a3a, boots: 0x3a2a1e, wide: 1.15 });
    villagerHair(B, r);
    B.torso.add(box(0.52, 0.8, 0.05, mat(0xf4f0e8), 0, 0.2, 0.36)); // an apron
    B.head.add(cyl(0.2, 0.24, 0.24, mat(0xf4f0e8), 0, 0.24, 0, 10), ball(0.22, mat(0xf4f0e8), 0, 0.38, 0)); // a cap
    // a basket of loaves on the arm
    const basket = new THREE.Group();
    basket.position.set(0, -0.05, 0.22);
    basket.add(cyl(0.22, 0.16, 0.18, mat(0xa87a3a), 0, 0, 0, 10));
    for (let i = 0; i < 3; i++) basket.add(box(0.1, 0.08, 0.26, mat(0xc88a3a), (i - 1) * 0.1, 0.1, 0).rotateY(0.3 * (i - 1)));
    B.handL.add(basket);
    return { B, rest: { l: -1.1, lz: 0.3 } };
  },
  elder(r, skin) {
    const B = body({ skin, tunic: r.pick([0x5a4a6a, 0x4a5a5a, 0x6a4a3a]), legs: 0x3a3030, boots: 0x2a2020, h: 0.95, robe: true, stoop: 0.32 });
    villagerHair(B, { pick: () => r.pick([0xe8e4dc, 0xc8c4bc, 0xa8a49c]), next: r.next });
    B.head.add(cone(0.12, 0.3, mat(0xe8e4dc), 0, -0.26, 0.14).rotateX(Math.PI)); // a white beard
    B.torso.add(cyl(0.36, 0.46, 0.3, mat(0x7a5a3a), 0, 0.68, 0, 12)); // a shawl about the shoulders
    const cane = cyl(0.03, 0.03, 0.95, mat(0x5a3a22), 0, -0.4, 0.05, 6);
    B.handR.add(cane);
    return { B, rest: { r: -0.45 }, speed: 0.55 };
  },
  child(r, skin) {
    const B = body({ skin, tunic: r.pick([0xc84a3a, 0x3a7ac8, 0xd8a83a, 0x4aa86a, 0xa84ac8]), legs: 0x4a3a2a, boots: 0x3a2618, h: 0.62, wide: 0.85 });
    B.head.scale.setScalar(1.15);
    villagerHair(B, r, r.next() < 0.5);
    if (r.next() < 0.5) {
      // a wooden sword: they play at being the keep's heroes
      B.handR.add(box(0.05, 0.5, 0.05, mat(0xb88a4a), 0, -0.25, 0.05), box(0.22, 0.05, 0.06, mat(0x7a5232), 0, -0.02, 0.05));
    }
    return { B, rest: {}, speed: 1.5, skip: true };
  },
  smith(r, skin) {
    const B = body({ skin, tunic: 0x6a5a4a, legs: 0x3a3028, boots: 0x22180e, wide: 1.2 });
    villagerHair(B, r);
    B.head.add(box(0.3, 0.14, 0.1, mat(r.pick(HAIRS)), 0, -0.17, 0.15)); // a beard
    B.torso.add(box(0.56, 0.9, 0.06, mat(0x3a2418), 0, 0.22, 0.36)); // a leather apron
    const hammer = new THREE.Group();
    hammer.add(cyl(0.03, 0.03, 0.6, mat(0x6b4a2e), 0, -0.2, 0, 6));
    hammer.add(box(0.24, 0.12, 0.12, mat(0x5a5e62, { metalness: 0.7, roughness: 0.3 }), 0, -0.5, 0));
    B.handR.add(hammer);
    return { B, rest: { r: -0.2 } };
  },
  washer(r, skin) {
    const B = body({ skin, tunic: r.pick([0x6a8aa8, 0xa86a7a, 0x8aa86a]), legs: 0x5a4a5a, boots: 0x3a2a2a, robe: true });
    B.head.add(dome(0.27, mat(r.pick([0xe8d8a8, 0xc8a8d8, 0xa8c8e8])), 0, 0.03, -0.04, 0.52)); // a headscarf
    // a basket of washing on the hip
    const basket = new THREE.Group();
    basket.position.set(0.05, -0.05, 0.18);
    basket.add(cyl(0.26, 0.2, 0.2, mat(0xa87a3a), 0, 0, 0, 10));
    basket.add(box(0.34, 0.1, 0.3, mat(0xf0ece4), 0, 0.12, 0), box(0.2, 0.1, 0.2, mat(0x8ab0d8), 0.05, 0.18, 0.02));
    B.handR.add(basket);
    return { B, rest: { r: -0.9, rz: -0.35 } };
  },
  pilgrim(r, skin) {
    const B = body({ skin, tunic: 0x8a7a62, legs: 0x5a4a3a, boots: 0x3a2a1e, robe: true });
    const cloak = mat(0x6a5a46, { side: THREE.DoubleSide });
    B.head.add(dome(0.29, cloak, 0, 0.0, -0.03, 0.64));
    B.torso.add(box(0.5, 0.4, 0.22, mat(0x7a5a3a), 0, 0.45, -0.34)); // a pack
    B.torso.add(cyl(0.07, 0.07, 0.04, mat(0xf0e8d8), 0.22, 0.7, 0.3, 8).rotateX(Math.PI / 2)); // a scallop badge
    const staff = cyl(0.03, 0.035, 1.8, mat(0x6b4a2e), 0, 0.3, 0, 6);
    B.handR.add(staff);
    B.handR.add(ball(0.06, mat(0xc8a858), 0, 1.22, 0)); // a gourd tied at the top
    return { B, rest: { r: -0.35 }, speed: 0.8 };
  },
  lamplighter(r, skin) {
    const B = body({ skin, tunic: 0x2a3a5a, legs: 0x2a2a3a, boots: 0x1e1a1a });
    villagerHair(B, r);
    B.head.add(cyl(0.2, 0.22, 0.3, mat(0x1e1e26), 0, 0.28, 0, 10), cyl(0.34, 0.34, 0.03, mat(0x1e1e26), 0, 0.14, 0, 12)); // a tall hat
    const pole = new THREE.Group();
    pole.add(cyl(0.025, 0.025, 2.0, mat(0x3a2a1a), 0, 0.55, 0, 6));
    const flame = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff8a2a, emissiveIntensity: 2.5 });
    pole.add(mesh(new THREE.OctahedronGeometry(0.07, 0), flame, 0, 1.6, 0));
    B.handR.add(pole);
    B.handR.rotation.x = -0.3;
    return { B, rest: { r: -0.6 } };
  },
};

/** One of the keep's folk: kind from VILLAGER_KINDS, the look from the seed. */
export function buildVillager(kind, seed = 1) {
  const r = picker(seed * 13 + 5);
  const made = (FOLK[kind] || FOLK.farmer)(r, r.pick(SKINS));
  const B = made.B;
  B.g.scale.setScalar(0.92 + r.next() * 0.12);
  return {
    group: B.g,
    mats: [],
    parts: { body: B.root },
    keep: true,
    speed: made.speed || 1,
    anim(dt, st) {
      if (!baseAnim(B, { ...st, speed: (made.speed || 1) * (st.speed || 1) }, dt, made.rest)) return;
      if (made.skip && st.moving) B.root.position.y *= 1.8; // children skip
    },
  };
}
