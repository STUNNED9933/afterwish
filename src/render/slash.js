// A glowing ribbon left behind a swinging blade (0.36). Each frame the blade's position (a
// point part-way up it and its tip, in world space) is added while the swing lasts; the ribbon
// fades from the tip inward and vanishes a moment later. Drawn additively, so the bloom pass
// makes it glow; it costs one small mesh, rebuilt each frame.
import * as THREE from 'three';

const MAX = 40; // samples kept
const LIFE = 0.24; // seconds a sample stays visible

export class SlashTrail {
  constructor(color = 0xcfefff) {
    this.color = new THREE.Color(color);
    this.samples = []; // { b: Vector3, t: Vector3, age, k }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 2 * 3);
    this.col = new Float32Array(MAX * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Age the ribbon and, while strength > 0, add the blade's current position. */
  update(dt, strength, base, tip) {
    const s = this.samples;
    for (const p of s) p.age += dt;
    while (s.length && s[0].age > LIFE) s.shift();
    if (strength > 0 && base && tip) {
      const last = s[s.length - 1];
      // A fast swing moves the tip far in one frame: fill the gap so the ribbon stays curved.
      if (last && last.age < dt * 1.5) {
        const steps = Math.min(4, Math.floor(last.t.distanceTo(tip) / 0.35));
        for (let i = 1; i <= steps; i++) {
          const f = i / (steps + 1);
          s.push({ b: last.b.clone().lerp(base, f), t: last.t.clone().lerp(tip, f), age: dt * (1 - f), k: strength });
        }
      }
      s.push({ b: base.clone(), t: tip.clone(), age: 0, k: strength });
      while (s.length > MAX) s.shift();
    }
    const n = s.length;
    const c = this.color;
    for (let i = 0; i < n; i++) {
      const p = s[i];
      const fade = Math.max(0, 1 - p.age / LIFE);
      const f = fade * fade * p.k * 2.2;
      this.pos.set([p.b.x, p.b.y, p.b.z, p.t.x, p.t.y, p.t.z], i * 6);
      // dim near the hand, bright at the tip
      this.col.set([c.r * f * 0.12, c.g * f * 0.12, c.b * f * 0.12, c.r * f, c.g * f, c.b * f], i * 6);
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.mesh.visible = n > 1;
  }

  clear() {
    this.samples.length = 0;
    this.mesh.visible = false;
  }
}
