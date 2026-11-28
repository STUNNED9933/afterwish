// (1.3) What a fight looks like, in the manner of an action game: a bright crescent for every cut (each blow of a string
// its own angle; the finisher a full sweep), sparks and a flash where a blow lands, shockwaves for slams and plunges,
// a ring that fills while a heavy blow is charged, afterimages for dodges, and glowing trails behind arrows.
// All of it additive (the bloom makes it glow), short-lived, and pooled by kind; none of it decides anything (the sim
// does): it is only drawn.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const add = (o) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...o });

/** A soft round glow (for flashes and sparks), drawn once. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A crescent: a ribbon round part of a circle, thick in the middle and thin at its ends, bright at its outer edge
 * (vertex colours: the edge white, fading inward). `sweep` radians round; built facing +x, lying flat.
 */
function crescentGeometry(r, width, sweep, seg = 32) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = -sweep / 2 + sweep * u;
    const thick = Math.sin(Math.PI * u) ** 0.7 * width;
    const fade = Math.min(1, u * 4) * Math.min(1, (1 - u) * 1.6); // the tail fades out, the head stays bright
    const co = Math.cos(a), si = Math.sin(a);
    pos.push(co * r, 0, si * r, co * (r - thick), 0, si * (r - thick));
    col.push(fade, fade, fade, 0, 0, 0);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Colours of the two paths' blows (and the Oath's red). */
export const HUES = {
  warrior: 0xffc27a, // warm steel, gold at the edge
  oath: 0xff4a3a,
  archer: 0x9fe8ff, // cold light
  novice: 0xfff0d6,
  perfect: 0x7fd8ff,
  heavy: 0xffe08a,
};

export class CombatFx {
  constructor(scene) {
    this.scene = scene;
    this.live = []; // { obj, t, life, tick(k, dt) }
    this.glow = glowTexture();
    this.flashMat = new THREE.SpriteMaterial(add({ map: this.glow, color: 0xffffff }));
    // the crescents, by kind (one geometry each, shared)
    this.geo = {
      cut: crescentGeometry(1, 0.5, Math.PI * 0.68),
      wide: crescentGeometry(1, 0.42, Math.PI * 1.45, 48),
      thrust: crescentGeometry(1, 0.16, Math.PI * 0.32, 12),
      ring: new THREE.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2),
      softRing: new THREE.RingGeometry(0.55, 1, 64).rotateX(-Math.PI / 2),
      disc: new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
      spark: new THREE.PlaneGeometry(1, 1),
    };
    this.charges = new Map(); // hero -> the ring under him while a heavy blow is charged
  }

  _keep(obj, life, tick) {
    this.scene.add(obj);
    this.live.push({ obj, t: 0, life, tick });
  }

  /**
   * A cut: a crescent round the hero at chest height, along his facing. `n`: which blow of the string (each its own
   * tilt and sweep direction), 'heavy', 'counter' or 'spin'. `r`: reach.
   */
  slash(x, y, z, facing, r, n, hue = HUES.warrior, scale = 1) {
    const kind = n === 3 || n === 'spin' ? 'wide' : n === 2 ? 'thrust' : 'cut';
    const m = new THREE.Mesh(this.geo[kind], new THREE.MeshBasicMaterial(add({ color: hue, vertexColors: true, opacity: 1 })));
    const g = new THREE.Group();
    g.add(m);
    // tilt by blow: across rising, back falling, the thrust straight, the finisher flat round
    const tilt = n === 0 ? 0.55 : n === 1 ? -0.6 : n === 'heavy' ? 1.35 : n === 'counter' ? 0.25 : 0.08;
    const flip = n === 1 ? -1 : 1;
    m.rotation.x = tilt;
    m.scale.set(1, 1, flip);
    g.position.set(x, y, z);
    g.rotation.y = -facing;
    const reach = Math.max(1.0, r * (kind === 'wide' ? 0.7 : 0.6)) * scale;
    const spin = n === 3 || n === 'spin' ? 1.4 : 0.55;
    this._keep(g, kind === 'wide' ? 0.32 : 0.22, (k) => {
      // swept on (a quick turn as it appears), grown out a little, gone
      m.rotation.y = flip * (1 - Math.min(1, k * 3)) * spin * 0.6;
      const s = reach * (0.82 + 0.25 * Math.min(1, k * 2.5));
      g.scale.set(s, s, s);
      m.material.opacity = 0.9 * (k < 0.15 ? 1 : Math.max(0, 1 - (k - 0.15) / 0.85) ** 1.5);
    });
    if (kind === 'thrust') {
      // a thrust: a streak of light straight ahead as well
      const st = new THREE.Mesh(this.geo.spark, new THREE.MeshBasicMaterial(add({ map: this.glow, color: hue })));
      const sg = new THREE.Group();
      sg.add(st);
      st.rotation.x = -Math.PI / 2;
      st.scale.set(reach * 1.4, 0.32, 1);
      st.position.x = reach * 0.55;
      sg.position.set(x, y, z);
      sg.rotation.y = -facing;
      this._keep(sg, 0.18, (k) => { st.material.opacity = 1 - k; st.scale.y = 0.32 * (1 - k * 0.6); });
    }
  }

  /** Where a blow lands: a flash, and sparks flung out (more for a crit or a heavy blow). */
  impact(x, y, z, hue = 0xffe6b0, big = false) {
    const fl = new THREE.Sprite(this.flashMat.clone());
    fl.material.color.set(hue);
    fl.position.set(x, y, z);
    const s0 = big ? 1.9 : 1.1;
    this._keep(fl, 0.14, (k) => { fl.scale.setScalar(s0 * (0.6 + k)); fl.material.opacity = 1 - k; });
    const n = big ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(this.flashMat.clone());
      sp.material.color.set(hue);
      const a = Math.random() * Math.PI * 2, up = (Math.random() - 0.2) * 4;
      const v = new THREE.Vector3(Math.cos(a) * (3 + Math.random() * 5), up, Math.sin(a) * (3 + Math.random() * 5));
      sp.position.set(x, y, z);
      const life = 0.18 + Math.random() * 0.2, sz = (big ? 0.22 : 0.15) * (0.6 + Math.random() * 0.8);
      this._keep(sp, life, (k, dt) => {
        sp.position.addScaledVector(v, dt);
        v.y -= 14 * dt;
        v.multiplyScalar(1 - 3 * dt);
        sp.scale.set(sz * (1 + v.length() * 0.05), sz, 1);
        sp.material.opacity = 1 - k;
      });
    }
  }

  /** A shockwave on the ground (a slam, a plunge, a perfect dodge): a bright ring out, a soft one behind it. */
  shock(x, z, r, hue = 0xffcf8a, life = 0.45) {
    for (const [geo, delay, op] of [[this.geo.ring, 0, 1], [this.geo.softRing, 0.06, 0.45]]) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(add({ color: hue, opacity: 0 })));
      m.position.set(x, 0.09, z);
      this._keep(m, life + delay, (k) => {
        const t = Math.max(0, k * (life + delay) - delay) / life;
        m.scale.setScalar(Math.max(0.01, r * (0.15 + 0.85 * (1 - (1 - t) ** 3))));
        m.material.opacity = t <= 0 ? 0 : op * (1 - t);
      });
    }
    const d = new THREE.Mesh(this.geo.disc, new THREE.MeshBasicMaterial(add({ color: hue, opacity: 0.4 })));
    d.position.set(x, 0.08, z);
    this._keep(d, 0.2, (k) => { d.scale.setScalar(r * 0.7 * (0.5 + k)); d.material.opacity = 0.4 * (1 - k); });
  }

  /** A column of light (a perfect dodge, the Oath taken, a level gained). */
  pillar(x, z, hue, h = 2.2, life = 0.5) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, h, 24, 1, true), new THREE.MeshBasicMaterial(add({ color: hue, opacity: 0.3 })));
    m.position.set(x, h / 2, z);
    this._keep(m, life, (k) => { m.scale.set(1 + k * 0.6, 1 - k * 0.3, 1 + k * 0.6); m.material.opacity = 0.3 * (1 - k) ** 1.5; });
  }

  /** The ring under a hero charging a heavy blow: it fills as it charges, and flashes when full. Ends with chargeEnd. */
  charge(key, x, z, full, hue = HUES.heavy) {
    this.chargeEnd(key);
    const g = new THREE.Group();
    const edge = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial(add({ color: hue, opacity: 0.6 })));
    const fill = new THREE.Mesh(this.geo.disc, new THREE.MeshBasicMaterial(add({ color: hue, opacity: 0.18 })));
    g.add(edge, fill);
    g.position.set(x, 0.08, z);
    g.scale.setScalar(0.9);
    this.scene.add(g);
    this.charges.set(key, { g, edge, fill, t: 0, full, flashed: false });
  }
  chargeAt(key, x, z) { const c = this.charges.get(key); if (c) c.g.position.set(x, 0.08, z); }
  chargeEnd(key) {
    const c = this.charges.get(key);
    if (!c) return;
    this.scene.remove(c.g);
    c.edge.material.dispose(); c.fill.material.dispose();
    this.charges.delete(key);
  }

  /** A glowing streak behind an arrow (or a Deadeye): a thin line from where it was a moment ago. */
  streak(from, to, hue = HUES.archer, w = 0.06) {
    const len = from.distanceTo(to);
    if (len < 0.05) return;
    const m = new THREE.Mesh(this.geo.spark, new THREE.MeshBasicMaterial(add({ map: this.glow, color: hue, opacity: 0.85 })));
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.rotateY(Math.PI / 2);
    m.scale.set(len * 1.2, w * 2.4, 1);
    this._keep(m, 0.16, (k) => { m.material.opacity = 0.85 * (1 - k); m.scale.y = w * 2.4 * (1 - k * 0.7); });
  }

  /**
   * An afterimage of a hero (a dodge, a perfect dodge, a counter's dash): a glowing copy of his body as it stands
   * now, left behind, fading.
   */
  ghost(rigGroup, hue = HUES.perfect, life = 0.45, op = 0.55) {
    if (!rigGroup) return;
    let copy;
    try { copy = SkeletonUtils.clone(rigGroup); } catch { return; }
    const mat = new THREE.MeshBasicMaterial(add({ color: hue, opacity: op }));
    const bones = new Map();
    rigGroup.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
    copy.traverse((o) => {
      if (o.isBone && bones.has(o.name)) { const b = bones.get(o.name); o.position.copy(b.position); o.quaternion.copy(b.quaternion); o.scale.copy(b.scale); }
      if (o.isMesh) { o.material = mat; o.castShadow = false; o.frustumCulled = false; }
    });
    rigGroup.updateMatrixWorld(true);
    rigGroup.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    this._keep(copy, life, (k) => { mat.opacity = op * (1 - k) ** 1.5; });
    copy.userData.mat = mat;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const L = this.live[i];
      L.t += dt;
      const k = Math.min(1, L.t / L.life);
      L.tick(k, dt);
      if (k >= 1) {
        this.scene.remove(L.obj);
        L.obj.traverse((o) => { if (o.material && o.material !== this.flashMat) o.material.dispose(); });
        this.live.splice(i, 1);
      }
    }
    for (const c of this.charges.values()) {
      c.t += dt;
      const k = Math.min(1, c.t / c.full);
      c.fill.scale.setScalar(0.15 + 0.85 * k);
      c.fill.material.opacity = 0.14 + 0.18 * k;
      if (k >= 1 && !c.flashed) { c.flashed = true; this.shock(c.g.position.x, c.g.position.z, 1.6, HUES.heavy, 0.3); }
      c.edge.material.opacity = k >= 1 ? 0.6 + 0.35 * Math.sin(c.t * 18) : 0.6;
    }
  }
}
