// Lacuna (Chapter 2), engine phase 1: Sunmere's townsfolk, a crowd run in each browser (not in the sim: the
// server never hears of them, so a busy town costs no bandwidth). They walk a network of streets (rings round
// the plaza, joined along the four roads), stop to chat, and go on. Level of detail by distance:
//   near (under 40 m)   moved and drawn every frame
//   mid (40 to 100 m)   moved every fourth frame (their time saved up, so they keep their pace)
//   far (past 100 m)    not drawn; moved every sixteenth frame
// Two draws for the whole crowd (bodies and heads, instanced).
import * as THREE from 'three';
import { TOWN, CRYSTAL, GUILD, roadDist } from './land.js';

const RINGS = [{ r: 9, n: 8 }, { r: 16, n: 12 }, { r: 27, n: 20 }, { r: 38, n: 24 }];
const SPOKES = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // along the four roads

/** The street network: nodes { x, z, links: [index] }. */
export function streets() {
  const nodes = [];
  const ringStart = [];
  for (const ring of RINGS) {
    ringStart.push(nodes.length);
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2;
      let r = ring.r;
      // (0.99.20) round the Guild's crystal, not through it: corners near it move in onto the plaza
      if (Math.hypot(TOWN.x + Math.cos(a) * r - CRYSTAL.x, TOWN.z + Math.sin(a) * r - CRYSTAL.z) < 5) r = 12;
      if (Math.hypot(TOWN.x + Math.cos(a) * r - GUILD.x, TOWN.z + Math.sin(a) * r - GUILD.z) < 8) r = 28.5; // and round the back of the Guild hall
      nodes.push({ x: TOWN.x + Math.cos(a) * r, z: TOWN.z + Math.sin(a) * r, a, ring: ring.r, links: [] });
    }
  }
  const link = (a, b) => { if (a !== b && !nodes[a].links.includes(b)) { nodes[a].links.push(b); nodes[b].links.push(a); } };
  RINGS.forEach((ring, k) => { for (let i = 0; i < ring.n; i++) link(ringStart[k] + i, ringStart[k] + ((i + 1) % ring.n)); });
  // Spokes: a node on the road at each ring's distance, joined to the ring nodes either side of it
  for (const sa of SPOKES) {
    let prev = null;
    RINGS.forEach((ring, k) => {
      // walk out along the direction until on the road's centre line (the roads wind a little)
      let x = TOWN.x + Math.cos(sa) * ring.r, z = TOWN.z + Math.sin(sa) * ring.r;
      for (let t = 0; t < 20 && roadDist(x, z) > 0.4; t++) {
        const step = 0.3;
        const ox = Math.abs(Math.cos(sa)) < 0.5 ? 1 : 0, oz = 1 - ox; // nudge across the road
        if (roadDist(x + ox * step, z + oz * step) < roadDist(x, z)) { x += ox * step; z += oz * step; } else { x -= ox * step; z -= oz * step; }
      }
      const id = nodes.push({ x, z, a: sa, ring: ring.r, links: [] }) - 1;
      // the two ring nodes nearest in angle
      const near = [];
      for (let i = 0; i < ring.n; i++) {
        const n = nodes[ringStart[k] + i];
        near.push({ i: ringStart[k] + i, d: Math.hypot(n.x - x, n.z - z) });
      }
      near.sort((p, q) => p.d - q.d);
      link(id, near[0].i);
      link(id, near[1].i);
      if (prev !== null) link(prev, id);
      prev = id;
    });
  }
  return nodes;
}

export class Crowd {
  constructor(scene, count = 260, seed = 7) {
    this.nodes = streets();
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.rnd = rnd;
    this.people = [];
    const body = new THREE.CylinderGeometry(0.2, 0.3, 1.1, 7).translate(0, 0.75, 0);
    const head = new THREE.SphereGeometry(0.19, 8, 6).translate(0, 1.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.bodies = new THREE.InstancedMesh(body, mat, count);
    this.heads = new THREE.InstancedMesh(head, mat, count);
    for (const m of [this.bodies, this.heads]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    const cloth = [0xc0533f, 0x3f6fc0, 0xd9a13b, 0x4f9a63, 0x8a4fb0, 0xe0dccf, 0x3b3b46, 0xc77d9b, 0x6aa3b8, 0x9b6a3f];
    const skin = [0xf2d0b0, 0xe0b48e, 0xc48c66, 0x9a6a48, 0x6e4a33];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const at = Math.floor(rnd() * this.nodes.length);
      const n = this.nodes[at];
      const p = { at, to: n.links[Math.floor(rnd() * n.links.length)], x: n.x, z: n.z, side: (rnd() - 0.5) * 2.2, speed: 1.0 + rnd() * 0.6, pause: rnd() * 3, h: 0.85 + rnd() * 0.25, facing: 0, saved: 0, moving: false, phase: rnd() * 6 };
      if (rnd() < 0.12) p.h *= 0.72; // children
      this.people.push(p);
      this.bodies.setColorAt(i, c.setHex(cloth[Math.floor(rnd() * cloth.length)]));
      this.heads.setColorAt(i, c.setHex(skin[Math.floor(rnd() * skin.length)]));
    }
    this.frame = 0;
    this.stats = { near: 0, mid: 0, far: 0, moved: 0 };
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  walk(p, dt) {
    if (p.pause > 0) { p.pause -= dt; p.moving = false; return; }
    const a = this.nodes[p.at], b = this.nodes[p.to];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    // keep to one side of the street (each person their own side), so they pass instead of queueing
    const tx = b.x - (dz / len) * p.side, tz = b.z + (dx / len) * p.side;
    const ex = tx - p.x, ez = tz - p.z, d = Math.hypot(ex, ez);
    if (d < 0.25) {
      // arrived: sometimes stop a while, then on (not straight back, unless there is no other way)
      if (this.rnd() < 0.3) p.pause = 1 + this.rnd() * 5;
      const choices = b.links.filter((k) => k !== p.at);
      const prevAt = p.at;
      p.at = p.to;
      p.to = choices.length ? choices[Math.floor(this.rnd() * choices.length)] : prevAt;
      return;
    }
    const step = Math.min(d, p.speed * dt);
    p.x += (ex / d) * step;
    p.z += (ez / d) * step;
    p.facing = Math.atan2(ez, ex);
    p.moving = true;
  }

  /** Move and draw the crowd, as seen from (cx, cz). */
  update(dt, cx, cz, time) {
    this.frame++;
    let near = 0, mid = 0, far = 0, moved = 0;
    this.people.forEach((p, i) => {
      const d = Math.hypot(p.x - cx, p.z - cz);
      const every = d < 40 ? 1 : d < 100 ? 4 : 16;
      p.saved += dt;
      if ((this.frame + i) % every === 0) {
        this.walk(p, Math.min(p.saved, 0.5));
        p.saved = 0;
        moved++;
      }
      // (0.99.20) a scene may want a stretch of town to itself: nobody is drawn inside `keepOut`
      const k = this.keepOut;
      if (d >= 100 || (k && Math.hypot(p.x - k.x, p.z - k.z) < k.r)) {
        if (d >= 100) far++;
        this.bodies.setMatrixAt(i, this.hidden);
        this.heads.setMatrixAt(i, this.hidden);
        return;
      }
      if (d < 40) near++; else mid++;
      const bob = p.moving ? Math.abs(Math.sin(time * 7 + p.phase)) * 0.05 : 0;
      this.m.compose(this.v.set(p.x, bob, p.z), this.q.setFromAxisAngle(this.up, Math.PI / 2 - p.facing), this.sc.set(p.h, p.h, p.h));
      this.bodies.setMatrixAt(i, this.m);
      this.heads.setMatrixAt(i, this.m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.stats = { near, mid, far, moved };
  }
}
