// Lacuna (Chapter 2), engine phase 1: drawing the land, streamed.
//
// Only chunks within DRAW metres of the camera's target are built; one at most each frame (nearest first), so
// walking never stalls on a burst of building; chunks well behind (past DROP) are taken down. A haze hides the
// edge. Trees, rocks and each kind of beast are instanced (one draw for all of a kind in a chunk, or on the
// whole land for beasts), so the draw count stays near a hundred wherever you stand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAND, HALF, CHUNKS, groundAt, LAKE, noise } from './land.js';
import { placeBuilding, TOWN_SET } from '../render/buildings.js';
import { CREATURES } from '../render/creatures.js';
import { WATCHTOWER } from './land.js';
import { RIGGED } from '../render/rigged.js';
// (0.99.29) the Thornhog's own model (made for Lacuna; registered here, as the main game does its own)
if (!RIGGED.e_thornhog) RIGGED.e_thornhog = { url: 'models/e_thornhog.glb', height: 1, turn: -Math.PI / 2, recentre: '*', rootBones: ['Hip', 'Root', 'BoneRoot', 'Pelvis', 'Hips'] };
import { Lively } from './lively.js';

// (0.99.29) beasts drawn close up as the main game's own animated models (and the Thornhog's own)
const LIVE_BEAST = {
  wolf: { ...CREATURES.wolf, height: 1.05, tint: 0x6a7a5a, back: 0.35 }, // (the Wakewood's Mossback: smaller, mossier than the frost wolf it is)
  golem: { ...CREATURES.golem, height: 2.6, attack: { kind: 'chop', from: 0.19, strike: 0.318, to: 0.43 } }, // (1.1.2) where its swing is (measured from the hands)
  hog: { model: 'e_thornhog', height: 0.8, beast: true, back: 0.45 },
};
const ASHEN = new Map(); // (Quest 4 and 5) ash in their fur or their cracks: the same body, greyed and darkened
// (1.0) a story's foe can wear another body: the Unbound's ash-thralls and acolytes (the main game's ashwalker and
// thurifer, darkened)
const LOOKS = {
  thrall: { ...CREATURES.ashwalker, height: 1.9, attack: { kind: 'slash', from: 0.19, strike: 0.318, to: 0.43 } },
  acolyte: { ...CREATURES.thurifer, height: 2.0, tint: 0x2a1840, dark: 0.55, attack: { kind: 'cast', from: 0.14, strike: 0.24, to: 0.4 } },
};
// (1.1) an elite (ember), a rare named beast (violet), a world boss (blood red): the same body, tinted
const RANK_TINT = { 1: 0xd08a4a, 2: 0xa07ae0, 3: 0xb03a2a };
const RANKED = new Map();
const liveSpec = (b) => {
  if (b.look && LOOKS[b.look]) return LOOKS[b.look];
  if (b.rank && LIVE_BEAST[b.type]) {
    const k = b.type + b.rank;
    if (!RANKED.has(k)) RANKED.set(k, { ...LIVE_BEAST[b.type], tint: RANK_TINT[b.rank] });
    return RANKED.get(k);
  }
  const base = LIVE_BEAST[b.type];
  if (!base || b.story !== 'ashen') return base;
  if (!ASHEN.has(b.type)) ASHEN.set(b.type, { ...base, tint: 0x3a3436, dark: 0.55 });
  return ASHEN.get(b.type);
};
const LIVE_R = 45, LIVE_N = 12;

export const DRAW = 150; // metres of land drawn round you
const DROP = DRAW + 50; // past this, a built chunk is taken down
const SKY = 0xbfd9ec;

const GROUND = { glade: 0x8fbf5a, yard: 0xb39a72, plaza: 0xbdae8e, street: 0xae9470, road: 0xa3865c, town: 0x86a75c, meadow: 0x7cab50, forest: 0x557f3b, stony: 0x8f927c, shore: 0xcbbb8b, water: 0x4f7f99 };

/** One low-poly creature (facing +z, feet on y = 0) per beast kind, coloured by vertex. */
export function beastGeometry(type) {
  const parts = [];
  const add = (geo, color, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const g = geo.index ? geo.clone().toNonIndexed() : geo.clone();
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    const c = new THREE.Color(color);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const box = new THREE.BoxGeometry(1, 1, 1), ball = new THREE.IcosahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 1, 5), rock = new THREE.DodecahedronGeometry(1, 0);
  if (type === 'wolf') {
    add(box, 0x5d6b4f, 0, 0.78, 0, 0.5, 0.48, 1.25);
    add(box, 0x6f7d5c, 0, 0.98, 0.78, 0.38, 0.36, 0.48);
    add(box, 0x2b2b26, 0, 0.92, 1.06, 0.18, 0.14, 0.18);
    add(cone, 0x4c5a40, 0.12, 1.24, 0.72, 0.07, 0.18, 0.07);
    add(cone, 0x4c5a40, -0.12, 1.24, 0.72, 0.07, 0.18, 0.07);
    for (const [x, z] of [[0.17, 0.45], [-0.17, 0.45], [0.17, -0.45], [-0.17, -0.45]]) add(box, 0x3f4936, x, 0.3, z, 0.13, 0.6, 0.13);
    add(box, 0x7c9a4a, 0, 0.95, -0.72, 0.14, 0.14, 0.5); // the mossy tail
    add(box, 0x7c9a4a, 0, 1.05, -0.1, 0.34, 0.08, 0.7); // moss along the back
  } else if (type === 'hog') {
    add(ball, 0x8a5f46, 0, 0.6, 0, 0.62, 0.5, 0.82);
    add(ball, 0x9a6d52, 0, 0.62, 0.72, 0.36, 0.32, 0.34);
    add(box, 0xd9c7a0, 0.13, 0.5, 1.0, 0.05, 0.05, 0.2);
    add(box, 0xd9c7a0, -0.13, 0.5, 1.0, 0.05, 0.05, 0.2);
    for (let i = 0; i < 5; i++) add(cone, 0x5c7a3a, 0, 1.0 + (i % 2) * 0.05, -0.5 + i * 0.24, 0.1, 0.35, 0.1);
    for (const [x, z] of [[0.3, 0.38], [-0.3, 0.38], [0.3, -0.38], [-0.3, -0.38]]) add(box, 0x5a3e2e, x, 0.15, z, 0.14, 0.3, 0.14);
  } else if (type === 'dummy') {
    // a training post: a wooden stake, a straw body bound with rope, a crossbar for arms, a painted target
    add(box, 0x7a5a3a, 0, 0.9, 0, 0.14, 1.8, 0.14);
    add(box, 0xd8c27a, 0, 1.25, 0, 0.5, 0.75, 0.36);
    add(box, 0x8a6a3a, 0, 1.0, 0, 0.52, 0.06, 0.38);
    add(box, 0x8a6a3a, 0, 1.5, 0, 0.52, 0.06, 0.38);
    add(ball, 0xe0cf8a, 0, 1.85, 0, 0.2, 0.22, 0.2);
    add(box, 0x7a5a3a, 0, 1.5, 0, 1.2, 0.1, 0.1);
    add(box, 0xd8d0c0, 0, 1.3, -0.2, 0.34, 0.34, 0.03);
    add(box, 0xc83a32, 0, 1.3, -0.215, 0.2, 0.2, 0.03);
    add(box, 0xf2ead8, 0, 1.3, -0.23, 0.07, 0.07, 0.03);
  } else {
    add(rock, 0x8b8c80, 0, 1.25, 0, 0.82, 0.78, 0.7);
    add(rock, 0x9a9b8e, 0, 2.15, 0.12, 0.42, 0.38, 0.4);
    add(box, 0xa8f0d0, 0.14, 2.2, 0.48, 0.09, 0.06, 0.04); // the eyes glow
    add(box, 0xa8f0d0, -0.14, 2.2, 0.48, 0.09, 0.06, 0.04);
    add(rock, 0x7d7e72, 0.95, 1.05, 0.1, 0.36, 0.62, 0.36);
    add(rock, 0x7d7e72, -0.95, 1.05, 0.1, 0.36, 0.62, 0.36);
    add(rock, 0x6f7065, 0.36, 0.32, 0, 0.3, 0.38, 0.3);
    add(rock, 0x6f7065, -0.36, 0.32, 0, 0.3, 0.38, 0.3);
    add(box, 0x6f9a52, 0, 1.75, -0.2, 0.7, 0.12, 0.5); // grass on its shoulders
  }
  return mergeGeometries(parts);
}

export class LandView {
  constructor(canvas, world) {
    this.world = world;
    this.land = world.land;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, DRAW * 0.42, DRAW);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, DRAW + 25);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x5d6b3a, 1.15));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 2.1));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun, sun.target);
    // Shared by every chunk
    this.mats = {
      ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a30, flatShading: true }),
      leaf: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      rock: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      beast: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      house: new THREE.MeshLambertMaterial({ color: 0xe8dcc4, flatShading: true }),
      roof: new THREE.MeshLambertMaterial({ color: 0xb5553a, flatShading: true }),
    };
    this.geo = {
      trunk: new THREE.CylinderGeometry(0.17, 0.26, 1.7, 6).translate(0, 0.85, 0),
      crown: new THREE.IcosahedronGeometry(1.45, 0).translate(0, 2.9, 0),
      pine: mergeGeometries([new THREE.ConeGeometry(1.3, 2.6, 7).translate(0, 2.6, 0), new THREE.ConeGeometry(0.95, 2.1, 7).translate(0, 3.9, 0)]),
      rock: new THREE.DodecahedronGeometry(1, 0),
      house: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      roof: new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    };
    this.built = new Map(); // chunk index -> { group, dist }
    this.treeRefs = new Map(); // tree -> [[instanced mesh, index, how it is placed]] (to clear the view, below)
    this.hiddenTrees = new Set();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.buildQueue = [];
    this.stats = { built: 0, made: 0, dropped: 0 };
    // The lake: one disc, always there (cheap)
    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5c9bbd, transparent: true, opacity: 0.88 }));
    lake.position.set(LAKE.x, 0.06, LAKE.z);
    this.scene.add(lake);
    // Every beast on the land: one instanced mesh per kind (only the ones in view are filled in each frame)
    this.beastMeshes = {};
    const counts = {};
    for (const b of world.beasts) counts[b.type] = (counts[b.type] || 0) + 1;
    for (const type in counts) {
      const m = new THREE.InstancedMesh(beastGeometry(type), this.mats.beast, counts[type]);
      m.castShadow = true;
      m.frustumCulled = false; // spread over the whole land: culled by distance here instead
      m.count = 0;
      this.scene.add(m);
      this.beastMeshes[type] = m;
    }
    this.prev = new Map(); // beast id -> last position drawn (for smooth motion between sim steps)
    this.lively = new Lively(this.scene);
    // (1.0) the old watchtower on the north ridge (weathered grey)
    placeBuilding('tower_a_yellow', { x: WATCHTOWER.x, z: WATCHTOWER.z, rot: 0, fw: WATCHTOWER.hw * 2 + 0.4, fd: WATCHTOWER.hd * 2 + 0.4, tint: 0x9a968c }).then((b) => {
      if (!b) return;
      b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(b);
    });
    this.liveT = null;
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.tmpP = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Chunks to have round (x, z): build the nearest missing one this frame, take down far ones. */
  stream(x, z) {
    const want = [];
    for (let cz = 0; cz < CHUNKS; cz++)
      for (let cx = 0; cx < CHUNKS; cx++) {
        const x0 = -HALF + cx * LAND.chunk, z0 = -HALF + cz * LAND.chunk;
        const dx = Math.max(x0 - x, 0, x - (x0 + LAND.chunk)), dz = Math.max(z0 - z, 0, z - (z0 + LAND.chunk));
        const d = Math.sqrt(dx * dx + dz * dz); // to the chunk's nearest edge
        const i = cz * CHUNKS + cx;
        if (d < DRAW && !this.built.has(i)) want.push({ i, cx, cz, d });
        else if (d > DROP && this.built.has(i)) this.drop(i);
      }
    want.sort((a, b) => a.d - b.d);
    if (want.length) this.build(want[0].cx, want[0].cz);
    this.stats.built = this.built.size;
    this.stats.waiting = want.length;
  }

  drop(i) {
    const c = this.built.get(i);
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.isMesh && o.userData.own) o.geometry.dispose();
    });
    c.alive = false;
    for (const t of c.trees || []) { this.treeRefs.delete(t); this.hiddenTrees.delete(t); }
    this.built.delete(i);
    this.stats.dropped++;
  }

  build(cx, cz) {
    const ch = this.land.chunk(cx, cz);
    const group = new THREE.Group();
    const rec = { group, alive: true, trees: ch.trees };
    this.built.set(cz * CHUNKS + cx, rec);
    this.stats.made++;
    // The ground: 2 m squares, coloured by what is there (with a little mottling)
    const seg = 32;
    const g = new THREE.PlaneGeometry(LAND.chunk, LAND.chunk, seg, seg).rotateX(-Math.PI / 2);
    g.translate(ch.x0 + LAND.chunk / 2, 0, ch.z0 + LAND.chunk / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      c.setHex(GROUND[groundAt(x, z, this.land.seed)]);
      const m = 0.9 + noise(x / 5, z / 5, 3) * 0.2;
      col[i * 3] = c.r * m; col[i * 3 + 1] = c.g * m; col[i * 3 + 2] = c.b * m;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(g, this.mats.ground);
    ground.receiveShadow = true;
    ground.userData.own = true;
    group.add(ground);
    // Trees: trunks, round crowns and pines, each one draw for the chunk
    const leafy = ch.trees.filter((t) => !t.pine), pines = ch.trees.filter((t) => t.pine);
    const inst = (geo, mat, list, place, colour) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, k) => {
        place(t, this.tmpM);
        m.setMatrixAt(k, this.tmpM);
        if (colour) m.setColorAt(k, colour(t));
        if (t.kind === 'tree') { let r = this.treeRefs.get(t); if (!r) this.treeRefs.set(t, (r = [])); r.push([m, k, this.tmpM.clone()]); }
      });
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      group.add(m);
    };
    const at = (t, s, turn = 0) => this.tmpM.compose(this.tmpP.set(t.x, 0, t.z), this.tmpQ.setFromAxisAngle(this.up, turn), this.tmpS.set(s, s, s));
    const leafColour = (t) => c.setHSL(0.27 + ((t.x * 13.1 + t.z * 7.3) % 1 + 1) % 1 * 0.06, 0.45, 0.32 + ((t.x * 3.7) % 1 + 1) % 1 * 0.08);
    inst(this.geo.trunk, this.mats.trunk, ch.trees, (t) => at(t, t.s));
    inst(this.geo.crown, this.mats.leaf, leafy, (t) => at(t, t.s, t.x), leafColour);
    inst(this.geo.pine, this.mats.leaf, pines, (t) => at(t, t.s, t.z), (t) => c.setHSL(0.33, 0.42, 0.22 + ((t.z * 5.1) % 1 + 1) % 1 * 0.06));
    inst(this.geo.rock, this.mats.rock, ch.rocks, (rk) => this.tmpM.compose(this.tmpP.set(rk.x, rk.r * 0.25, rk.z), this.tmpQ.setFromAxisAngle(this.up, rk.turn), this.tmpS.set(rk.r, rk.r * 0.75, rk.r)), (rk) => c.setHSL(0.12, 0.06, 0.48 + ((rk.x * 2.3) % 1 + 1) % 1 * 0.12));
    // Houses: a KayKit building each (the plain box until it has loaded, or if it cannot)
    for (const h of ch.houses) {
      const id = h.id || TOWN_SET[h.v % TOWN_SET.length];
      const stand = new THREE.Group();
      const body = new THREE.Mesh(this.geo.house, this.mats.house);
      body.scale.set(h.hw * 2, 3, h.hd * 2);
      const roof = new THREE.Mesh(this.geo.roof, this.mats.roof);
      roof.scale.set(Math.max(h.hw, h.hd) * 2.4, 2.2, Math.max(h.hw, h.hd) * 2.4);
      roof.position.y = 3;
      stand.add(body, roof);
      stand.position.set(h.x, 0, h.z);
      stand.rotation.y = -h.rot;
      stand.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(stand);
      placeBuilding(id, { x: h.x, z: h.z, rot: -h.rot, fw: h.hw * 2 + 0.3, fd: h.hd * 2 + 0.3 }).then((b) => {
        if (!b || !rec.alive) return;
        group.remove(stand);
        group.add(b);
      });
    }
    this.scene.add(group);
  }

  /**
   * Trees between the camera and the hero step aside (are not drawn this frame), so the Wakewood never fills the
   * screen with leaves. (fx, fz): the hero; (cx, cz): the camera.
   */
  clearView(fx, fz, cx, cz) {
    const want = new Set();
    const dx = cx - fx, dz = cz - fz, len = Math.hypot(dx, dz);
    const mx = (fx + cx) / 2, mz = (fz + cz) / 2;
    for (const o of this.land.near(mx, mz, len / 2 + 3.5)) {
      if (o.kind !== 'tree' || !this.treeRefs.has(o)) continue;
      // nearest point of the hero-camera line (and a little past the camera) to the tree
      let t = len > 0 ? ((o.x - fx) * dx + (o.z - fz) * dz) / (len * len) : 0;
      t = Math.max(0.15, Math.min(1.15, t));
      const px = fx + dx * t - o.x, pz = fz + dz * t - o.z;
      if (px * px + pz * pz < (1.7 * o.s + 0.6) ** 2) want.add(o);
    }
    const touched = new Set();
    for (const t of this.hiddenTrees) if (!want.has(t)) { for (const [m, k, mat] of this.treeRefs.get(t) || []) { m.setMatrixAt(k, mat); touched.add(m); } this.hiddenTrees.delete(t); }
    for (const t of want) if (!this.hiddenTrees.has(t)) { for (const [m, k] of this.treeRefs.get(t)) { m.setMatrixAt(k, this.zero); touched.add(m); } this.hiddenTrees.add(t); }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  /**
   * (0.99.29) The nearest beasts (of the kinds that have a model) as animated bodies: `near` is [{ b, x, z, d }].
   * Returns the ids drawn that way (their cheap shapes are left out).
   */
  liveBeasts(near, time) {
    const dt = this.liveT === null ? 0 : Math.min(0.1, Math.max(0, time - this.liveT));
    this.liveT = time;
    const want = near.filter((n) => n.d < LIVE_R && !n.b.hidden && (LIVE_BEAST[n.b.type] || LOOKS[n.b.look])).sort((p, q) => p.d - q.d).slice(0, LIVE_N).map((n) => ({
      key: n.b.id,
      spec: liveSpec(n.b),
      x: n.x, z: n.z, facing: n.b.facing, scale: n.b.size || 1,
      // (1.1.2) its blow: a swing (the bodies with an attack of their own) or a lunge (the wolf's and the hog's)
      state: { moving: this.steady(n.b, time), speed: n.b.type === 'golem' ? 2.4 : n.b.type === 'hog' ? 4.2 : 5, stunned: !!(n.b.stunUntil && this.world && n.b.stunUntil > this.world.time), swung: n.b.swungAt != null && time - n.b.swungAt < 0.9 ? time - n.b.swungAt : -1, wind: n.b.windAt != null && (n.b.swungAt == null || n.b.swungAt < n.b.windAt) && time - n.b.windAt < 0.8 ? time - n.b.windAt : -1 },
    }));
    return this.lively.frame(dt, want);
  }

  /**
   * (0.99.32) Whether a beast's body walks: the sim's word, held a moment either way, so a beast that stops and
   * starts on alternate steps does not flicker between its walk and its stand (each change restarts the clip).
   */
  steady(b, time) {
    const was = !!b.drawnMoving;
    if (!!b.moving !== was) {
      b.flipAt = b.flipAt ?? time;
      if (time - b.flipAt > (was ? 0.3 : 0.12)) { b.drawnMoving = !!b.moving; b.flipAt = null; }
    } else b.flipAt = null;
    return !!b.drawnMoving;
  }

  /** (0.99.29) A beast struck at someone: its body (if it has one) swings. */
  /** (1.1.2) A beast began to wind up a blow. */
  winding(id, seen = null) {
    const b = seen || this.world.beasts[id - 1];
    if (b && b.id === id) b.windAt = this.liveT || 0;
  }

  swiped(id, seen = null) {
    // (1.1.2) its own field: the sim's swipeT is the beast's cooldown, and writing the clock into it stalled the
    // beast for minutes after its first blow. Online, the beast drawn is the one seen, not the world's.
    const b = seen || this.world.beasts[id - 1];
    if (b && b.id === id) b.swungAt = this.liveT || 0;
  }

  /** Put every beast near (x, z) where the sim has it (eased between steps by `alpha`). */
  drawBeasts(x, z, alpha, time) {
    const fill = {};
    for (const type in this.beastMeshes) fill[type] = 0;
    const far2 = DRAW * DRAW;
    const near = [];
    for (const b of this.world.beasts) {
      if (b.dead) continue;
      const dx = b.x - x, dz = b.z - z;
      if (dx * dx + dz * dz > far2) continue;
      let pv = this.prev.get(b.id);
      if (!pv) this.prev.set(b.id, (pv = { x: b.x, z: b.z, fx: b.x, fz: b.z, t: this.world.time }));
      // (0.99.33) one step back each sim step, moved or not. (It only stepped when the beast moved: one that
      // stopped kept being drawn sliding from where it was a step ago to where it is, over and over, thirty
      // times a second: the shudder of a beast standing next to you.)
      if (pv.t !== this.world.time) { pv.x = pv.fx; pv.z = pv.fz; pv.fx = b.x; pv.fz = b.z; pv.t = this.world.time; }
      near.push({ b, x: pv.x + (b.x - pv.x) * alpha, z: pv.z + (b.z - pv.z) * alpha, d: Math.sqrt(dx * dx + dz * dz) });
    }
    const real = this.liveBeasts(near, time);
    for (const { b, x: bx, z: bz } of near) {
      if (real.has(b.id)) continue;
      const bob = b.moving ? Math.abs(Math.sin(time * 9 + b.id)) * 0.08 : 0;
      this.tmpM.compose(this.tmpP.set(bx, bob, bz), this.tmpQ.setFromAxisAngle(this.up, Math.PI / 2 - b.facing), this.tmpS.setScalar(b.size || 1));
      const m = this.beastMeshes[b.type];
      if (!m || b.hidden) continue; // (0.99.26) a story foe drawn as a person instead
      m.setMatrixAt(fill[b.type]++, this.tmpM);
    }
    for (const type in this.beastMeshes) {
      const m = this.beastMeshes[type];
      m.count = fill[type];
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** (together) Draw the beasts the server says are in sight: { type, x, z, facing, moving, id } (already eased). */
  drawSeen(list, time, hx = 0, hz = 0) {
    const fill = {};
    for (const type in this.beastMeshes) fill[type] = 0;
    const real = this.liveBeasts(list.filter((b) => !b.dead).map((b) => ({ b, x: b.x, z: b.z, d: Math.hypot(b.x - hx, b.z - hz) })), time);
    for (const b of list) {
      if (b.dead || real.has(b.id)) continue;
      const m = this.beastMeshes[b.type];
      if (!m || fill[b.type] >= m.instanceMatrix.count) continue;
      const bob = b.moving ? Math.abs(Math.sin(time * 9 + b.id)) * 0.08 : 0;
      this.tmpM.compose(this.tmpP.set(b.x, bob, b.z), this.tmpQ.setFromAxisAngle(this.up, Math.PI / 2 - b.facing), this.tmpS.setScalar(b.size || 1));
      m.setMatrixAt(fill[b.type]++, this.tmpM);
    }
    for (const type in this.beastMeshes) {
      const m = this.beastMeshes[type];
      m.count = fill[type];
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** Keep the sun's shadows round the player (only there: the rest of the land is lit but unshadowed). */
  followSun(x, z) {
    const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4; // stepped, so shadows do not shimmer
    this.sun.position.set(sx + 40, 70, sz + 25);
    this.sun.target.position.set(sx, 0, sz);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
