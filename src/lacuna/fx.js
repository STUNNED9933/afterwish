// Lacuna (Chapter 2), phase 2: what combat looks like. Arrows in flight (drawn here from the shots the sim or the
// server reports: where they really land is the sim's business, these stop at the first beast they reach),
// damage numbers, health bars over hurt beasts, rings for the Berserker's slam and whirlwind, a glow for
// Bloodrage, and a puff where a beast falls.
import * as THREE from 'three';

const ARROW_Y = 0.62; // (0.99.27) the bow of a boy a metre tall (it was a grown man's: arrows over his head)

export class Fx {
  constructor(scene, layer) {
    this.scene = scene;
    this.layer = layer; // a DOM element over the canvas, for numbers and bars
    this.arrows = [];
    this.rings = [];
    this.puffs = [];
    this.nums = [];
    this.bars = new Map(); // beast id -> div
    const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5).rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(0.06, 0.18, 6).rotateX(Math.PI / 2).translate(0, 0, 0.54);
    this.arrowGeo = { shaft, tip };
    this.mats = {
      shaft: new THREE.MeshBasicMaterial({ color: 0x8a6a44 }),
      tip: new THREE.MeshBasicMaterial({ color: 0xdfe6ee }),
      deadeye: new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      trail: new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    this.puffGeo = new THREE.IcosahedronGeometry(1, 1);
    this.v = new THREE.Vector3();
    this.rage = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.rage.position.y = 0.06;
    scene.add(this.rage);
  }

  /** An arrow leaving (x, z) along (dx, dz). */
  shot({ x, z, dx, dz, speed, range, kind, y = ARROW_Y }) {
    const g = new THREE.Group();
    const big = kind === 'deadeye';
    const shaft = new THREE.Mesh(this.arrowGeo.shaft, big ? this.mats.deadeye : this.mats.shaft);
    const tip = new THREE.Mesh(this.arrowGeo.tip, big ? this.mats.deadeye : this.mats.tip);
    g.add(shaft, tip);
    if (big) {
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.01, 4, 6).rotateX(Math.PI / 2).translate(0, 0, -2.2), this.mats.trail);
      g.add(trail);
      g.scale.setScalar(1.6);
    }
    g.position.set(x, y, z);
    g.lookAt(x + dx, y, z + dz);
    this.scene.add(g);
    this.arrows.push({ g, x, z, y, dx, dz, speed, left: range, big });
  }

  /**
   * (0.99.27) An arrow struck at (x, z) (the sim says so): the one in flight nearest there stops in it, there. So an
   * arrow that hits is seen to hit, even when the beast drawn is a step behind the beast the sim moved.
   */
  landed(x, z) {
    let best = -1, bd = 3.5 * 3.5;
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i];
      if (a.big || a.stuck !== undefined) continue;
      // nearest, and not yet far past it
      const d = (a.x - x) ** 2 + (a.z - z) ** 2, ahead = (x - a.x) * a.dx + (z - a.z) * a.dz;
      if (d < bd && ahead > -1.5) { bd = d; best = i; }
    }
    if (best < 0) return;
    const a = this.arrows[best];
    a.x = x - a.dx * 0.35; a.z = z - a.dz * 0.35;
    a.g.position.set(a.x, a.y, a.z);
    a.stuck = 0.18; // a beat in the beast, then gone
  }

  /** (0.99.27) Where a cut lands: a pale fan on the ground, its true reach and width, gone in a moment. */
  arc(x, z, facing, r, width) {
    const geo = new THREE.RingGeometry(0.25, r, 24, 1, -facing - width / 2, width).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, 0.07, z);
    this.scene.add(m);
    this.fans = this.fans || [];
    this.fans.push({ m, t: 0 });
  }

  ring(x, z, r, colour = 0xffd27a, life = 0.45) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, 0.08, z);
    m.scale.setScalar(r * 0.3);
    this.scene.add(m);
    this.rings.push({ m, r, t: 0, life });
  }

  puff(x, z, colour = 0xd8d2c4) {
    const m = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.set(x, 0.8, z);
    m.scale.setScalar(0.4);
    this.scene.add(m);
    this.puffs.push({ m, t: 0 });
  }

  /** A number rising from (x, z): what was dealt (gold), taken (red), or a heal (green). */
  number(x, z, text, kind = 'dealt') {
    const d = document.createElement('div');
    d.className = 'num ' + kind;
    d.textContent = text;
    this.layer.appendChild(d);
    this.nums.push({ d, x: x + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6, t: 0 });
  }

  /**
   * Each frame. `beasts`: what is drawn now ({ id, x, z, r, hp (0-1), dead }), for arrows to stop at and bars;
   * `camera` and the canvas size, to put numbers and bars on the screen.
   */
  update(dt, beasts, camera, w, h, rageOn, heroX, heroZ) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck !== undefined) {
        a.stuck -= dt;
        if (a.stuck <= 0) { this.scene.remove(a.g); this.arrows.splice(i, 1); }
        continue;
      }
      const step = Math.min(a.left, a.speed * dt);
      a.x += a.dx * step;
      a.z += a.dz * step;
      a.left -= step;
      a.g.position.set(a.x, a.y, a.z);
      // (0.99.27) the arrow goes where it goes: it stops in a beast only when the sim says it struck (landed), so a
      // miss is seen to miss. (Out of range, it is gone.)
      if (a.left <= 0) { this.scene.remove(a.g); this.arrows.splice(i, 1); }
    }
    for (let i = (this.fans || []).length - 1; i >= 0; i--) {
      const f = this.fans[i];
      f.t += dt;
      f.m.material.opacity = f.t < 0.06 ? 0.32 * (f.t / 0.06) : 0.32 * Math.max(0, 1 - (f.t - 0.06) / 0.3);
      if (f.t >= 0.36) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); this.fans.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      r.m.scale.setScalar(r.r * (0.3 + 0.7 * Math.min(1, k * 1.4)));
      r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.m.scale.setScalar(0.4 + p.t * 2.4);
      p.m.material.opacity = 0.7 * (1 - p.t / 0.6);
      if (p.t >= 0.6) { this.scene.remove(p.m); p.m.material.dispose(); this.puffs.splice(i, 1); }
    }
    // Bloodrage: a red ring at the hero's feet
    this.rage.position.x = heroX;
    this.rage.position.z = heroZ;
    this.rage.material.opacity = rageOn ? 0.55 + Math.sin(performance.now() / 120) * 0.15 : 0;
    // numbers
    const place = (el, x, y, z, dy = 0) => {
      this.v.set(x, y, z).project(camera);
      if (this.v.z > 1 || this.v.x < -1.2 || this.v.x > 1.2) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h - dy}px) translate(-50%, -50%)`;
    };
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      place(n.d, n.x, 2.2, n.z, n.t * 46);
      n.d.style.opacity = String(Math.min(1, 2.2 - n.t * 2.2));
      if (n.t >= 1) { n.d.remove(); this.nums.splice(i, 1); }
    }
    // health bars over hurt beasts nearby
    const want = new Set();
    for (const b of beasts) {
      if (b.dead || b.hp >= 0.999 || (b.x - heroX) ** 2 + (b.z - heroZ) ** 2 > 45 * 45) continue;
      want.add(b.id);
      let d = this.bars.get(b.id);
      if (!d) {
        d = document.createElement('div');
        d.className = 'bar';
        d.appendChild(document.createElement('i'));
        this.layer.appendChild(d);
        this.bars.set(b.id, d);
      }
      d.firstChild.style.width = `${Math.max(0, b.hp) * 100}%`;
      place(d, b.x, b.tall || 1.9, b.z);
    }
    for (const [id, d] of this.bars) if (!want.has(id)) { d.remove(); this.bars.delete(id); }
  }
}
