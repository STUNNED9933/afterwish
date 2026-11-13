// Characters built from simple shapes. No art files are needed, which keeps the
// whole game in a single small download. Swap these for real models later.
//
// Every builder returns { group, mats, parts } where:
//   group - the THREE.Group to add to the scene (model faces +Z)
//   mats  - materials whose emissive colour is driven by game state (flashes)
//   parts - named pieces the animator moves (weapon pivot, legs ...)
import * as THREE from 'three';
import { ENEMIES } from '../sim/defs.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.08, flatShading: true, ...o });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
const cyl = (rt, rb, h, material, x, y, z, seg = 8) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z);
const ball = (r, material, x, y, z) => mesh(new THREE.IcosahedronGeometry(r, 1), material, x, y, z);
const cone = (r, h, material, x, y, z, seg = 6) => mesh(new THREE.ConeGeometry(r, h, seg), material, x, y, z);

function finish(group, mats, parts) {
  // Stun stars: three small shapes that orbit the head while an enemy is stunned.
  return { group, mats, parts };
}

function addStunStars(group, height) {
  const stars = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffe27a });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), m);
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    stars.add(s);
  }
  stars.position.y = height + 0.35;
  stars.visible = false;
  group.add(stars);
  return stars;
}

// ---------------------------------------------------------------------------
const HERO_LOOK = {
  warrior: { cloth: 0x2d6e8e, cape: 0x8e2f3c },
  archer: { cloth: 0x3f7a4a, cape: 0x5a4a2a },
  rogue: { cloth: 0x4a3a66, cape: 0x1c1826 },
  mage: { cloth: 0x3a4fa8, cape: 0x6a2a8a },
};

/** @param cls  'warrior' | 'archer' | 'rogue' | 'mage': changes colours and the weapon in hand */
export function buildHero(cls = 'warrior') {
  const look = HERO_LOOK[cls] || HERO_LOOK.warrior;
  const g = new THREE.Group();
  const cloth = mat(look.cloth);
  const dark = mat(0x1b2636);
  const skin = mat(0xe6b592);
  const trim = mat(0xd9c9a3, { metalness: 0.5, roughness: 0.4 });
  const cape = mat(look.cape, { side: THREE.DoubleSide });
  const wood = mat(0x6b4a2e);
  const steel = mat(0xe8f1f8, { metalness: 0.85, roughness: 0.22, emissive: 0x7fd8ff, emissiveIntensity: 0.25 });

  const body = new THREE.Group();
  g.add(body);
  const legL = box(0.24, 0.72, 0.28, dark, -0.19, 0.36, 0);
  const legR = box(0.24, 0.72, 0.28, dark, 0.19, 0.36, 0);
  body.add(legL, legR);
  body.add(cyl(0.34, 0.44, 0.85, cloth, 0, 1.12, 0));
  body.add(box(0.8, 0.1, 0.5, trim, 0, 0.74, 0));
  body.add(box(1.08, 0.2, 0.46, trim, 0, 1.5, 0));
  body.add(ball(0.26, skin, 0, 1.84, 0));
  const helm = mesh(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 1.88, -0.02);
  body.add(helm);
  body.add(box(0.06, 0.2, 0.5, trim, 0, 2.14, -0.02));
  const capeMesh = box(0.78, 1.15, 0.05, cape, 0, 1.0, -0.32);
  capeMesh.rotation.x = 0.16;
  body.add(capeMesh);
  body.add(box(0.2, 0.68, 0.22, cloth, -0.6, 1.14, 0));

  // Sword arm: a pivot at the shoulder so one rotation swings arm + blade.
  const arm = new THREE.Group();
  arm.position.set(0.6, 1.4, 0);
  arm.rotation.order = 'YXZ';
  arm.add(box(0.2, 0.2, 0.62, cloth, 0, 0, 0.26));
  if (cls === 'archer') {
    // Bow: a half ring standing upright in the hand, with a glowing string.
    const bow = mesh(new THREE.TorusGeometry(0.78, 0.05, 5, 14, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), wood, 0, 0, 0.62);
    arm.add(bow);
    arm.add(box(0.03, 1.56, 0.03, steel, 0, 0, 0.62));
  } else if (cls === 'rogue') {
    // Two short daggers.
    arm.add(box(0.3, 0.08, 0.08, trim, 0, 0, 0.6));
    arm.add(box(0.07, 0.14, 0.75, steel, 0, 0, 1.0));
    body.add(box(0.07, 0.14, 0.7, steel, -0.6, 0.9, 0.42));
  } else if (cls === 'mage') {
    // Staff with a glowing orb, and a pointed hat.
    arm.add(box(0.08, 0.08, 2.0, wood, 0, 0, 0.8));
    arm.add(ball(0.2, steel, 0, 0, 1.9));
    body.add(cone(0.36, 0.7, cloth, 0, 2.3, -0.02));
  } else {
    arm.add(box(0.42, 0.1, 0.1, trim, 0, 0, 0.6));
    arm.add(box(0.07, 0.16, 1.5, steel, 0, 0, 1.38));
  }
  body.add(arm);

  // Parry guard: a curved pane of light held in front of the hero.
  const guardMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.7, 20, 1, true, -0.95, 1.9), guardMat);
  guard.position.y = 1.15;
  g.add(guard);

  return finish(g, [cloth, dark, skin, trim, cape], { body, legL, legR, arm, guard, guardMat, steel });
}

// ---------------------------------------------------------------------------
function buildGrunt() {
  const g = new THREE.Group();
  const hide = mat(0x7a4a58);
  const bone = mat(0xd8cdb8);
  const dark = mat(0x3a2530);
  const legL = box(0.26, 0.6, 0.3, dark, -0.22, 0.3, 0);
  const legR = box(0.26, 0.6, 0.3, dark, 0.22, 0.3, 0);
  const body = new THREE.Group();
  body.add(box(0.95, 0.85, 0.6, hide, 0, 1.0, 0));
  body.add(box(0.6, 0.45, 0.5, hide, 0, 1.6, 0.08));
  const hornL = cone(0.1, 0.4, bone, -0.26, 1.95, 0.05);
  hornL.rotation.z = 0.5;
  const hornR = cone(0.1, 0.4, bone, 0.26, 1.95, 0.05);
  hornR.rotation.z = -0.5;
  body.add(hornL, hornR);
  body.add(box(0.12, 0.08, 0.05, new THREE.MeshBasicMaterial({ color: 0xffd27a }), -0.14, 1.66, 0.34));
  body.add(box(0.12, 0.08, 0.05, new THREE.MeshBasicMaterial({ color: 0xffd27a }), 0.14, 1.66, 0.34));
  body.add(box(0.22, 0.6, 0.24, hide, -0.6, 1.0, 0.05));
  const arm = new THREE.Group();
  arm.position.set(0.6, 1.3, 0);
  arm.add(box(0.22, 0.24, 0.6, hide, 0, 0, 0.25));
  arm.add(cyl(0.07, 0.07, 1.0, dark, 0, 0, 0.9));
  arm.children[1].rotation.x = Math.PI / 2;
  arm.add(box(0.3, 0.3, 0.45, bone, 0, 0, 1.4));
  body.add(arm);
  g.add(legL, legR, body);
  return finish(g, [hide, dark, bone], { body, legL, legR, arm, stars: addStunStars(g, 2.1) });
}

function buildSpitter() {
  const g = new THREE.Group();
  const robe = mat(0x3f6b55);
  const dark = mat(0x1f3329);
  const glow = new THREE.MeshStandardMaterial({ color: 0xc8ff9a, emissive: 0x9dff5a, emissiveIntensity: 1.6, flatShading: true });
  const body = new THREE.Group();
  body.add(cone(0.55, 1.5, robe, 0, 0.75, 0, 7));
  body.add(ball(0.26, dark, 0, 1.62, 0));
  body.add(cone(0.3, 0.5, robe, 0, 1.95, -0.04, 6));
  const orb = ball(0.2, glow, 0, 1.25, 0.55);
  const arm = new THREE.Group();
  arm.position.set(0, 1.25, 0);
  arm.add(orb);
  orb.position.set(0, 0, 0.55);
  body.add(arm);
  g.add(body);
  return finish(g, [robe, dark], { body, arm, orb, stars: addStunStars(g, 2.1) });
}

function buildBrute() {
  const g = new THREE.Group();
  const stone = mat(0x55586a);
  const dark = mat(0x2b2d3a);
  const ember = new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff7a2a, emissiveIntensity: 1.2, flatShading: true });
  const legL = box(0.45, 0.8, 0.5, dark, -0.4, 0.4, 0);
  const legR = box(0.45, 0.8, 0.5, dark, 0.4, 0.4, 0);
  const body = new THREE.Group();
  body.add(box(1.7, 1.2, 1.0, stone, 0, 1.45, 0));
  body.add(box(0.7, 0.5, 0.6, stone, 0, 2.3, 0.15));
  body.add(box(0.36, 0.08, 0.05, ember, 0, 2.34, 0.46));
  body.add(box(0.6, 0.6, 0.7, dark, -1.1, 1.75, 0));
  body.add(box(0.36, 0.9, 0.4, stone, -1.1, 1.0, 0.1));
  const arm = new THREE.Group();
  arm.position.set(1.1, 1.85, 0);
  arm.add(box(0.6, 0.6, 0.7, dark, 0, 0, 0));
  arm.add(box(0.36, 0.4, 0.95, stone, 0, 0, 0.6));
  arm.add(cyl(0.1, 0.1, 1.4, dark, 0, 0, 1.5));
  arm.children[2].rotation.x = Math.PI / 2;
  arm.add(box(0.75, 0.75, 0.6, stone, 0, 0, 2.2));
  arm.add(box(0.5, 0.5, 0.64, ember, 0, 0, 2.2));
  body.add(arm);
  g.add(legL, legR, body);
  return finish(g, [stone, dark], { body, legL, legR, arm, stars: addStunStars(g, 2.8) });
}

function buildStalker() {
  const g = new THREE.Group();
  const shell = mat(0x6d2a36);
  const dark = mat(0x26141a);
  const eye = new THREE.MeshBasicMaterial({ color: 0xff5566 });
  const body = new THREE.Group();
  const hull = cone(0.55, 1.9, shell, 0, 0.7, 0.1, 5);
  hull.rotation.x = Math.PI / 2;
  body.add(hull);
  body.add(box(0.9, 0.3, 0.8, dark, 0, 0.55, -0.5));
  body.add(box(0.1, 0.1, 0.05, eye, -0.16, 0.86, 0.72));
  body.add(box(0.1, 0.1, 0.05, eye, 0.16, 0.86, 0.72));
  const fin = cone(0.18, 0.8, dark, 0, 1.25, -0.2, 4);
  body.add(fin);
  const legL = box(0.16, 0.5, 0.9, dark, -0.5, 0.25, 0);
  const legR = box(0.16, 0.5, 0.9, dark, 0.5, 0.25, 0);
  g.add(body, legL, legR);
  return finish(g, [shell, dark], { body, legL, legR, stars: addStunStars(g, 1.6) });
}

function buildBoss() {
  const g = new THREE.Group();
  const plate = mat(0x2d3044, { metalness: 0.5, roughness: 0.45 });
  const gold = mat(0xc9a55a, { metalness: 0.7, roughness: 0.35 });
  const dark = mat(0x15161f);
  const core = new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0xff8a3a, emissiveIntensity: 1.5, flatShading: true });
  const blade = mat(0xb8bfd0, { metalness: 0.8, roughness: 0.3, emissive: 0xff8a3a, emissiveIntensity: 0.25 });
  const legL = box(0.5, 1.2, 0.55, plate, -0.45, 0.6, 0);
  const legR = box(0.5, 1.2, 0.55, plate, 0.45, 0.6, 0);
  const body = new THREE.Group();
  body.add(cyl(0.75, 0.6, 1.3, plate, 0, 1.85, 0));
  body.add(box(0.4, 0.4, 0.1, core, 0, 1.95, 0.66));
  body.add(box(2.3, 0.4, 0.8, gold, 0, 2.6, 0));
  body.add(box(0.6, 0.6, 0.6, dark, 0, 3.05, 0.05));
  body.add(box(0.44, 0.08, 0.05, core, 0, 3.08, 0.36));
  for (let i = -1; i <= 1; i++) body.add(cone(0.1, 0.45, gold, i * 0.2, 3.55, 0.05, 4));
  const capeMesh = box(1.7, 2.3, 0.08, mat(0x4a1a24), 0, 1.5, -0.55);
  capeMesh.rotation.x = 0.14;
  body.add(capeMesh);
  body.add(box(0.4, 1.3, 0.45, plate, -1.15, 1.85, 0));
  const arm = new THREE.Group();
  arm.position.set(1.15, 2.4, 0);
  arm.add(box(0.4, 0.45, 1.0, plate, 0, 0, 0.4));
  arm.add(box(0.8, 0.14, 0.14, gold, 0, 0, 1.0));
  arm.add(box(0.16, 0.4, 3.0, blade, 0, 0, 2.55));
  body.add(arm);
  g.add(legL, legR, body);
  return finish(g, [plate, gold, dark], { body, legL, legR, arm, stars: addStunStars(g, 3.9) });
}

/** A townsperson: robe, head, hair, and a little trim. They stand still, so no moving parts. */
export function buildNpc(look) {
  const g = new THREE.Group();
  const robe = mat(look.robe);
  const trim = mat(look.trim);
  const skin = mat(0xd9a57e);
  const hair = mat(look.hair);
  g.add(cyl(0.3, 0.52, 1.25, robe, 0, 0.63, 0, 7));
  g.add(cyl(0.34, 0.34, 0.12, trim, 0, 1.2, 0, 7)); // collar
  g.add(box(0.16, 0.5, 0.16, robe, -0.38, 0.95, 0.05), box(0.16, 0.5, 0.16, robe, 0.38, 0.95, 0.05));
  g.add(ball(0.25, skin, 0, 1.5, 0));
  g.add(ball(0.27, hair, 0, 1.56, -0.06));
  g.scale.setScalar(look.scale || 1);
  return g;
}

/** A signpost with a board. `read` signs are drawn duller. */
export function buildSign() {
  const g = new THREE.Group();
  const wood = mat(0x6a4a30);
  const board = mat(0xb9966a);
  g.add(cyl(0.09, 0.11, 1.5, wood, 0, 0.75, 0, 6));
  const b = box(1.1, 0.62, 0.1, board, 0, 1.45, 0.02);
  g.add(b);
  for (let i = 0; i < 3; i++) g.add(box(0.7 - i * 0.12, 0.05, 0.02, wood, -0.05 * i, 1.6 - i * 0.14, 0.08));
  return g;
}

const BUILDERS = { grunt: buildGrunt, spitter: buildSpitter, brute: buildBrute, stalker: buildStalker, boss: buildBoss };

/**
 * Build the model for an enemy type. Later enemies reuse one of the five body
 * shapes (def.model) with their own colours and size (def.look).
 */
export function buildEnemy(type) {
  const def = ENEMIES[type] || {};
  const built = (BUILDERS[def.model || type] || buildGrunt)();
  const look = def.look;
  if (!look) return built;
  (look.colors || []).forEach((c, i) => built.mats[i] && built.mats[i].color.set(c));
  // The renderer animates group.scale (spawning, dying), so the size goes on an inner group.
  const inner = built.group;
  inner.scale.setScalar(look.scale || 1);
  const group = new THREE.Group();
  group.add(inner);
  return { ...built, group };
}
