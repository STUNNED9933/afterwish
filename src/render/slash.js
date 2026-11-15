// A glowing ribbon left behind a swinging blade (0.36). Each frame the blade's position (a
// point part-way up it and its tip, in world space) is added while the swing lasts; the ribbon
// fades from the tip inward and vanishes a moment later. Drawn additively, so the bloom pass
// makes it glow; it costs one small mesh, rebuilt each frame.
import * as THREE from 'three';

const MAX = 64; // samples kept
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
      // A fast swing moves the tip far in one frame: fill the gap along a curve through the
      // last two samples (Catmull-Rom), so the ribbon is an arc and not a fan of flat chords.
      if (last && last.age < dt * 1.5) {
        const prev = s[s.length - 2] || last;
        const steps = Math.min(10, Math.floor(last.t.distanceTo(tip) / 0.12));
        for (let i = 1; i <= steps; i++) {
          const f = i / (steps + 1);
          s.push({ b: cr(prev.b, last.b, base, base, f), t: cr(prev.t, last.t, tip, tip, f), age: dt * (1 - f), k: strength });
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
      const f = fade * fade * p.k * 0.85;
      this.pos.set([p.b.x, p.b.y, p.b.z, p.t.x, p.t.y, p.t.z], i * 6);
      // nothing at the inner edge, bright at the tip: a thin crescent, not a filled shape
      this.col.set([0, 0, 0, c.r * f, c.g * f, c.b * f], i * 6);
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

/** Catmull-Rom point between b and c (a before, d after) at f. */
function cr(a, b, c, d, f) {
  const f2 = f * f, f3 = f2 * f;
  const k = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  return new THREE.Vector3(k(a.x, b.x, c.x, d.x), k(a.y, b.y, c.y, d.y), k(a.z, b.z, c.z, d.z));
}
