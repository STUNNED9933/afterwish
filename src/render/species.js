// The shapes of the world (0.41): every kind of tree, rock and ground cover, built from code.
// Each species returns up to three geometries that share one set of materials per map:
//   solid: matte, vertex-coloured (bark, stone, leaves)
//   gloss: shiny (ice, obsidian, crystal, wet caps)
//   glow:  unlit and bright (embers, gills, runes, star-glass)
// Sizes: a "tree" is drawn for scale 1 (the simulation's circle is 0.55 * scale), a "rock" for
// radius 1 (scaled by the rock's own radius), so nothing you bump into moves or changes size.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lumpy, paint, makeRnd, noise3 } from './environment.js';

const col = (c) => new THREE.Color(c);

/** Ready a geometry for merging: no uvs, not indexed, with normals. */
function prep(g) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/** Paint a whole part one colour, darker toward its own base (soft contact shadow). */
function tint(g, color, { ao = 0.35, top = null, topAmt = 0.6, aoFrom = null, aoTo = null } = {}) {
  g = prep(g);
  return paint(g, color, top, { ao, topAmt, aoFrom, aoTo });
}
/** Paint with a per-vertex function (x, y, z, nx, ny, nz) -> THREE.Color. */
function paintBy(g, fn) {
  g = prep(g);
  const p = g.attributes.position, n = g.attributes.normal;
  const arr = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const merge = (list) => {
  const parts = list.filter(Boolean).map((g) => {
    const out = prep(g);
    // every part must carry the same attributes
    for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color'].includes(k)) out.deleteAttribute(k);
    return out;
  });
  return parts.length ? mergeGeometries(parts) : null;
};
/** A bent cylinder from a to b (a branch, a stem). */
function limb(r0, r1, a, b, seg = 7) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 2, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  g.translate(va.x, va.y, va.z);
  return g;
}
/** A soft clump of leaves: a lumpy, slightly flattened ball. */
function clump(r, x, y, z, seed, detail = 1) {
  let g = new THREE.IcosahedronGeometry(r, detail).scale(1, 0.78, 1);
  g = lumpy(g, r * 0.22, 2.4 / r, seed);
  g.translate(x, y, z);
  return g;
}
/** A trunk with roots, dark at the base. */
function trunkGeo(h, r0, r1, color, seed = 2, lean = 0) {
  let t = new THREE.CylinderGeometry(r1, r0, h, 9, 4).translate(0, h / 2, 0);
  if (lean) {
    const p = t.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + lean * (y / h) ** 2); }
  }
  const roots = [0, 1, 2, 3].map((i) => new THREE.ConeGeometry(r0 * 0.45, r0 * 1.7, 5).rotateZ(Math.PI / 2.5).translate(r0 * 0.75, r0 * 0.3, 0).rotateY((i / 4) * Math.PI * 2 + seed));
  const g = lumpy(merge([t, ...roots]), 0.04, 3.1, seed);
  return tint(g, color, { ao: 0.55 });
}

// =====================================================================================
// Trees (scale 1: footprint about 0.55)
// =====================================================================================
export const TREES = {
  /** Round, layered broadleaf (an oak). leaves: [dark, light] */
  broadleaf({ bark = '#4a3626', leaves = ['#183420', '#3a6438'], seed = 1, size = 1 } = {}) {
    const rnd = makeRnd(seed * 977 + 13);
    const trunk = trunkGeo(2.4 * size, 0.36, 0.2, bark, seed);
    const br = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rnd();
      br.push(limb(0.13, 0.06, [0, 1.8 * size, 0], [Math.cos(a) * 0.9 * size, 2.8 * size, Math.sin(a) * 0.9 * size], 5));
    }
    const branches = tint(merge(br), bark, { ao: 0.2 });
    const cl = [];
    const n = 6 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const d = i === 0 ? 0 : 0.6 + rnd() * 0.55;
      const y = (i === 0 ? 3.9 : 2.9 + rnd() * 0.9) * size;
      cl.push(clump((0.75 + rnd() * 0.45) * size, Math.cos(a) * d * size, y, Math.sin(a) * d * size, seed + i));
    }
    const lo = col(leaves[0]), hi = col(leaves[1]);
    const crown = paintBy(merge(cl), (c, x, y, z, nx, ny) => {
      const k = Math.max(0, Math.min(1, (y - 2.2 * size) / (2.6 * size)));
      c.copy(lo).lerp(hi, 0.1 + 0.45 * k + 0.3 * Math.max(0, ny) + 0.18 * noise3(x * 2.3, y * 2.3, z * 2.3));
    });
    return { solid: merge([trunk, branches, crown]) };
  },
  /** A slim pale birch with a light, airy crown. */
  birch({ leaves = ['#36602e', '#6a8a48'], seed = 3 } = {}) {
    const rnd = makeRnd(seed * 31 + 7);
    let t = new THREE.CylinderGeometry(0.13, 0.24, 3.6, 8, 8).translate(0, 1.8, 0);
    t = paintBy(lumpy(t, 0.02, 4, seed), (c, x, y) => {
      const band = Math.sin(y * 9 + Math.sin(y * 3.1) * 2) > 0.82 ? 0.25 : 0.88;
      c.setRGB(band, band, band * 0.96).multiplyScalar(0.55 + 0.45 * Math.min(1, y / 1.5));
    });
    const cl = [];
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2, d = 0.25 + rnd() * 0.4;
      cl.push(clump(0.55 + rnd() * 0.3, Math.cos(a) * d, 3.0 + rnd() * 1.4, Math.sin(a) * d, seed + i * 5));
    }
    const lo = col(leaves[0]), hi = col(leaves[1]);
    const crown = paintBy(merge(cl), (c, x, y, z, nx, ny) => c.copy(lo).lerp(hi, 0.35 + 0.5 * Math.max(0, ny) + 0.1 * noise3(x * 3, y * 3, z * 3)));
    return { solid: merge([t, crown]) };
  },
  /** A pine: tiers of drooping cones. snow: how much snow lies on the tiers (0..1). */
  pine({ bark = '#3b2c22', needles = ['#16322a', '#30583e'], snow = 0, seed = 4, tiers = 4 } = {}) {
    const trunk = trunkGeo(1.6, 0.3, 0.18, bark, seed);
    const list = [];
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1);
      const r = 1.75 - k * 1.15, h = 1.9 - k * 0.5, y = 1.6 + k * 2.9;
      let cone = new THREE.ConeGeometry(r, h, 12, 3, true).translate(0, y + h * 0.35, 0).rotateY(i * 0.7);
      // droop: pull the hem down a little between "branches"
      const p = cone.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const ang = Math.atan2(p.getZ(v), p.getX(v));
        const rr = Math.hypot(p.getX(v), p.getZ(v)) / r;
        p.setY(v, p.getY(v) - Math.max(0, rr - 0.6) * (0.25 + 0.2 * Math.sin(ang * 7 + i)));
      }
      list.push(cone);
    }
    list.push(new THREE.ConeGeometry(0.35, 0.9, 8).translate(0, 1.6 + 2.9 + 1.2, 0));
    const lo = col(needles[0]), hi = col(needles[1]), white = col('#f2f8ff');
    const crown = paintBy(lumpy(merge(list), 0.12, 2.2, seed), (c, x, y, z, nx, ny) => {
      c.copy(lo).lerp(hi, Math.min(1, 0.2 + (y - 1.5) / 5 + 0.15 * noise3(x * 3, y * 3, z * 3)));
      if (snow) c.lerp(white, Math.min(1, Math.max(0, ny - 0.15) * 1.6 * snow + (noise3(x * 5, y * 5, z * 5) > 0.55 ? 0.3 * snow : 0)));
    });
    return { solid: merge([trunk, crown]) };
  },
  /** A weeping willow: a broad, low canopy whose fringe hangs down to the ground. */
  willow({ bark = '#2e2a24', leaves = ['#22402c', '#6a8a4a'], seed = 5 } = {}) {
    const rnd = makeRnd(seed * 53 + 1);
    const trunk = trunkGeo(2.6, 0.42, 0.24, bark, seed, 0.4);
    const cl = [clump(1.15, 0.4, 3.6, 0, seed, 1)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd() * 0.4;
      cl.push(clump(0.8 + rnd() * 0.25, 0.4 + Math.cos(a) * 1.05, 3.15 + rnd() * 0.3, Math.sin(a) * 1.05, seed + i));
    }
    const strands = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.15;
      const r = 1.55 + rnd() * 0.35, len = 1.3 + rnd() * 1.3;
      // hanging curtains along the rim, wide enough to read from above as a ragged fringe
      strands.push(new THREE.PlaneGeometry(0.42, len, 1, 3).translate(0, -len / 2 + 0.1, 0).rotateY(-a + Math.PI / 2).translate(0.4 + Math.cos(a) * r, 3.25, Math.sin(a) * r));
    }
    const lo = col(leaves[0]), hi = col(leaves[1]);
    const crown = paintBy(merge([...cl, ...strands]), (c, x, y, z, nx, ny) => c.copy(lo).lerp(hi, Math.min(1, Math.max(0, (y - 1.2) / 3.2) + 0.2 * Math.max(0, ny) + 0.12 * noise3(x * 3, y * 3, z * 3))));
    return { solid: merge([trunk, crown]) };
  },
  /** A dead or burnt tree: bare, twisting branches. ember: glowing cracks (burnt). */
  dead({ bark = '#2a2420', ember = null, seed = 6, tall = 1 } = {}) {
    const rnd = makeRnd(seed * 71 + 9);
    const parts = [trunkGeo(2.2 * tall, 0.34, 0.16, bark, seed, 0.25)];
    const tips = [];
    const grow = (from, dir, len, r, depth) => {
      const to = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len];
      parts.push(tint(limb(r, r * 0.6, from, to, 5), bark, { ao: 0.1 }));
      if (depth <= 0) { tips.push(to); return; }
      const k = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i <= k; i++) {
        const a = rnd() * Math.PI * 2;
        const nd = [dir[0] * 0.6 + Math.cos(a) * 0.55, dir[1] * 0.7 + 0.35, dir[2] * 0.6 + Math.sin(a) * 0.55];
        const l = Math.hypot(...nd);
        grow(to, nd.map((v) => v / l), len * (0.55 + rnd() * 0.2), r * 0.6, depth - 1);
      }
    };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rnd();
      const d = [Math.cos(a) * 0.55, 0.8, Math.sin(a) * 0.55];
      const l = Math.hypot(...d);
      grow([0, (1.5 + rnd() * 0.5) * tall, 0], d.map((v) => v / l), 1.1 * tall, 0.13, 2);
    }
    parts.push(tint(limb(0.15, 0.05, [0, 2.1 * tall, 0], [0.1, 3.4 * tall, -0.1], 5), bark, { ao: 0.1 }));
    const out = { solid: merge(parts) };
    if (ember) {
      // glowing splits in the bark, low on the trunk
      const g = [];
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, y = 0.2 + rnd() * 1.2;
        g.push(new THREE.BoxGeometry(0.04, 0.35 + rnd() * 0.3, 0.04).rotateZ((rnd() - 0.5) * 0.6).translate(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3));
      }
      out.glow = tint(merge(g), ember, { ao: 0 });
    }
    return out;
  },
  /** A giant mushroom: a curved stem, a wide spotted cap, glowing gills underneath. */
  mushroom({ cap = '#4a2456', stem = '#cfc4b2', gills = '#e86ad8', spots = '#e8d8f0', seed = 7, h = 3.2, w = 1.9 } = {}) {
    const rnd = makeRnd(seed * 13 + 3);
    const bend = (rnd() - 0.5) * 0.6;
    let st = new THREE.CylinderGeometry(0.28, 0.42, h, 10, 6).translate(0, h / 2, 0);
    const p = st.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + bend * Math.sin(y * Math.PI * 0.8)); }
    const stemG = tint(lumpy(st, 0.03, 4, seed), stem, { ao: 0.5 });
    const top = [bend * 0.95, h, 0];
    let capG = new THREE.SphereGeometry(w, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1);
    capG = lumpy(capG, 0.08, 1.6, seed);
    capG.translate(top[0], top[1] - 0.05, top[2]);
    const cc = col(cap), edge = col(cap).multiplyScalar(0.55);
    capG = paintBy(capG, (c, x, y) => c.copy(edge).lerp(cc, Math.min(1, (y - top[1]) / (w * 0.4) + 0.2)));
    const dots = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 0.8;
      const yy = Math.sqrt(Math.max(0, 1 - rr * rr)) * w * 0.55;
      dots.push(new THREE.SphereGeometry(0.1 + rnd() * 0.12, 6, 3).scale(1, 0.4, 1).translate(top[0] + Math.cos(a) * rr * w, top[1] + yy - 0.02, top[2] + Math.sin(a) * rr * w));
    }
    const under = new THREE.RingGeometry(0.3, w * 0.97, 22, 1).rotateX(Math.PI / 2).translate(top[0], top[1] - 0.04, top[2]);
    return { solid: merge([stemG, capG]), gloss: tint(merge(dots), spots, { ao: 0 }), glow: tint(under, gills, { ao: 0 }) };
  },
  /** A saguaro: a ribbed column with arms that turn upward. */
  saguaro({ skin = '#4e7a3e', seed = 8 } = {}) {
    const rnd = makeRnd(seed * 19 + 5);
    const rib = (g, r) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + 0.09 * Math.cos(a * 10);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      return g;
    };
    const parts = [rib(new THREE.CapsuleGeometry(0.42, 3.6, 4, 20).translate(0, 2.2, 0), 0.42)];
    const arms = 1 + Math.floor(rnd() * 2.5);
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + rnd();
      const y = 1.6 + rnd() * 1.3, out = 0.75 + rnd() * 0.2, up = 0.9 + rnd() * 0.9;
      const dx = Math.cos(a), dz = Math.sin(a);
      parts.push(rib(new THREE.CapsuleGeometry(0.24, out, 3, 12).rotateZ(Math.PI / 2).translate(out / 2, 0, 0).rotateY(-a).translate(0, y, 0), 0.24));
      parts.push(rib(new THREE.CapsuleGeometry(0.25, up, 3, 12).translate(dx * out, y + up / 2, dz * out), 0.25));
    }
    const base = col(skin), light = col(skin).offsetHSL(0.02, 0.05, 0.12);
    const g = paintBy(merge(parts), (c, x, y, z, nx, ny, nz) => {
      const a = Math.atan2(z, x);
      c.copy(base).lerp(light, 0.5 + 0.5 * Math.cos(a * 10)).multiplyScalar(0.6 + 0.4 * Math.min(1, y / 1.2));
    });
    return { solid: g };
  },
  /** Basalt columns: a cluster of hexagonal stone pillars. */
  basalt({ stone = '#4a505c', top = '#7a8494', seed = 9, tall = 1 } = {}) {
    const rnd = makeRnd(seed * 41 + 11);
    const parts = [];
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5, d = i === 0 ? 0 : 0.42 + rnd() * 0.18;
      const h = (i === 0 ? 4.6 : 1.4 + rnd() * 3.2) * tall;
      const r = 0.3 + rnd() * 0.08;
      parts.push(new THREE.CylinderGeometry(r, r * 1.04, h, 6, 1).rotateY(rnd()).translate(Math.cos(a) * d, h / 2, Math.sin(a) * d));
    }
    const s = col(stone), t = col(top);
    return { solid: paintBy(merge(parts), (c, x, y, z, nx, ny) => c.copy(s).lerp(t, ny > 0.9 ? 0.8 : 0.1 * noise3(x * 4, y * 2, z * 4) + 0.08).multiplyScalar(0.55 + 0.45 * Math.min(1, y / 2))) };
  },
  /** Obsidian: tall black glassy shards with molten seams at the foot. */
  obsidian({ glass = '#14101a', seam = '#ff6a1a', seed = 10 } = {}) {
    const rnd = makeRnd(seed * 23 + 17);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const h = (i === 0 ? 4.2 : 1.8 + rnd() * 1.6);
      const g = new THREE.ConeGeometry(0.42 - i * 0.07, h, 4 + (i % 2), 1).translate(0, h / 2, 0).rotateZ((i ? 1 : 0) * (rnd() - 0.5) * 0.7).rotateY(rnd() * 3);
      g.translate(i ? (rnd() - 0.5) * 0.7 : 0, 0, i ? (rnd() - 0.5) * 0.7 : 0);
      parts.push(g);
    }
    const gl = col(glass);
    const solid = paintBy(merge(parts), (c, x, y, z, nx, ny) => c.copy(gl).multiplyScalar(0.8 + 0.6 * Math.abs(nx)));
    const glow = tint(new THREE.TorusGeometry(0.42, 0.05, 4, 10).rotateX(Math.PI / 2).translate(0, 0.06, 0), seam, { ao: 0 });
    return { gloss: solid, glow };
  },
  /** A crystal cluster: hexagonal prisms with points. */
  crystal({ color = '#8fe8ff', core = '#d8f8ff', seed = 11, tall = 1 } = {}) {
    const rnd = makeRnd(seed * 29 + 3);
    const parts = [];
    const n = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const h = (i === 0 ? 3.8 : 1.2 + rnd() * 1.8) * tall, r = i === 0 ? 0.42 : 0.18 + rnd() * 0.14;
      const body = new THREE.CylinderGeometry(r, r * 0.9, h, 6, 1).translate(0, h / 2, 0);
      const tip = new THREE.ConeGeometry(r, r * 2.2, 6, 1).translate(0, h + r * 1.1, 0);
      const g = merge([body, tip]);
      const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : 0.35 + rnd() * 0.2;
      g.rotateZ(i ? (0.25 + rnd() * 0.35) * (rnd() < 0.5 ? -1 : 1) : 0).rotateY(a).translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      parts.push(g);
    }
    const c0 = col(color), c1 = col(core);
    return { gloss: paintBy(merge(parts), (c, x, y) => c.copy(c0).lerp(c1, Math.min(1, y / (4.4 * tall)))) };
  },
  /** A broken stone column: fluted shaft snapped off, a drum fallen beside it. */
  pillar({ stone = '#7a7884', moss = '#4a5a3a', seed = 12 } = {}) {
    const rnd = makeRnd(seed * 61 + 5);
    const h = 2.4 + rnd() * 1.6;
    const flute = (g) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 - 0.05 * Math.max(0, Math.cos(a * 12));
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
        if (p.getY(i) > h - 0.05) p.setY(i, p.getY(i) + (noise3(p.getX(i) * 4, 0, p.getZ(i) * 4) - 0.2) * 0.45);
      }
      return g;
    };
    const shaft = flute(new THREE.CylinderGeometry(0.42, 0.46, h, 24, 6).translate(0, h / 2, 0));
    const base = new THREE.CylinderGeometry(0.62, 0.66, 0.35, 12).translate(0, 0.17, 0);
    const plinth = new THREE.BoxGeometry(1.3, 0.22, 1.3).translate(0, 0.06, 0);
    const drum = flute(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 16, 1)).rotateZ(Math.PI / 2).rotateY(rnd() * 3).translate(0.9, 0.38, 0.5);
    const s = col(stone), m = col(moss);
    return { solid: paintBy(merge([shaft, base, plinth, drum]), (c, x, y, z, nx, ny) => c.copy(s).multiplyScalar(0.6 + 0.4 * Math.min(1, y / 1.2) + 0.12 * noise3(x * 3, y * 3, z * 3)).lerp(m, ny > 0.5 ? 0.45 : y < 0.4 ? 0.35 : 0)) };
  },
  /** Ice spikes jutting from the snow. */
  iceSpikes({ ice = '#9fd8f0', seed = 13 } = {}) {
    return TREES.crystal({ color: ice, core: '#f0fbff', seed, tall: 0.8 });
  },
  /** A spire of gold star-glass on a sandstone foot (Asterfell). */
  glassSpire({ glass = '#ffd890', stone = '#c4a476', seed = 14 } = {}) {
    const c = TREES.crystal({ color: glass, core: '#fff6dc', seed, tall: 1.15 });
    const foot = tint(lumpy(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 8, 1).translate(0, 0.25, 0), 0.05, 3, seed), stone, { ao: 0.4 });
    return { solid: foot, gloss: c.gloss };
  },
  /** A palm-like date tree for the city's courtyards. */
  palm({ bark = '#8a6a44', fronds = ['#4a6a2a', '#9ab048'], seed = 15 } = {}) {
    const rnd = makeRnd(seed * 37 + 1);
    const segs = [];
    const lean = (rnd() - 0.5) * 0.9;
    for (let i = 0; i < 7; i++) {
      const y0 = i * 0.62, y1 = y0 + 0.66;
      segs.push(limb(0.26 - i * 0.015, 0.22 - i * 0.015, [lean * (y0 / 4.3) ** 2, y0, 0], [lean * (y1 / 4.3) ** 2, y1, 0], 7));
    }
    const trunk = tint(merge(segs), bark, { ao: 0.5 });
    const top = [lean, 4.4, 0];
    const fr = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.3;
      const leaf = new THREE.PlaneGeometry(0.5, 2.2, 1, 4).translate(0, 1.1, 0);
      const p = leaf.attributes.position;
      for (let v = 0; v < p.count; v++) { const y = p.getY(v); p.setZ(v, -0.4 * (y / 2.2) ** 2 * 2.2); p.setX(v, p.getX(v) * (1 - y / 2.6)); }
      leaf.rotateX(-1.05).rotateY(a).translate(...top);
      fr.push(leaf);
    }
    const lo = col(fronds[0]), hi = col(fronds[1]);
    const crown = paintBy(merge(fr), (c, x, y) => c.copy(lo).lerp(hi, Math.min(1, Math.max(0, (y - 3.4) / 1.2))));
    return { solid: merge([trunk, crown]) };
  },
};

// =====================================================================================
// Rocks (radius 1)
// =====================================================================================
export const ROCKS = {
  /** A lumpy boulder with something settled on top (moss, snow, ash, sand). */
  boulder({ stone = '#6a6a72', top = '#5a7a3a', topAmt = 0.6, seed = 1, flat = 0.78 } = {}) {
    let g = new THREE.IcosahedronGeometry(1, 2).scale(1, flat, 1);
    g = lumpy(g, 0.22, 1.6 + (seed % 3) * 0.4, seed * 3.1 + 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.35) p.setY(i, -0.35 + (p.getY(i) + 0.35) * 0.25);
    g.translate(0, 0.3, 0);
    g.computeVertexNormals();
    const s = col(stone), t = top ? col(top) : null;
    return { solid: paintBy(g, (c, x, y, z, nx, ny) => {
      c.copy(s).multiplyScalar(0.62 + 0.38 * Math.min(1, (y + 0.1) / 1) + 0.12 * noise3(x * 3, y * 3, z * 3));
      if (t) c.lerp(t, Math.max(0, Math.min(1, (ny - 0.3) * 1.7 + 0.25 * noise3(x * 5, y * 5, z * 5))) * topAmt);
    }) };
  },
  /** A layered sandstone outcrop with a flat top (a little mesa). */
  mesa({ bands = ['#b07848', '#c89460', '#9a6438'], top = '#d8b078', seed = 2 } = {}) {
    const rnd = makeRnd(seed * 17 + 5);
    const parts = [];
    let y = 0;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const h = 0.35 + rnd() * 0.25, r = 1 - i * 0.12 + rnd() * 0.08;
      parts.push(lumpy(new THREE.CylinderGeometry(r * 0.94, r, h, 11, 1).translate(0, y + h / 2, 0), 0.08, 2, seed + i));
      y += h;
    }
    const B = bands.map(col), T = col(top);
    const g = paintBy(merge(parts), (c, x, yy, z, nx, ny) => {
      const k = Math.floor((yy / y) * 7 + noise3(x * 2, 0, z * 2) * 0.6);
      c.copy(B[((k % 3) + 3) % 3]).multiplyScalar(0.7 + 0.3 * Math.min(1, yy / 0.6));
      if (ny > 0.85) c.lerp(T, 0.7);
    });
    return { solid: g };
  },
  /** A broken piece of castle wall: courses of cut stone, the top ragged. */
  ruinWall({ stone = '#5a5a66', mortar = '#2e2e36', moss = '#3a4a30', seed = 3 } = {}) {
    const rnd = makeRnd(seed * 43 + 7);
    const parts = [];
    const len = 2.2, courses = 6;
    for (let row = 0; row < courses; row++) {
      const y = row * 0.42;
      const cut = len * (0.55 + 0.45 * Math.cos((row / courses) * 1.4)) * (0.8 + rnd() * 0.4); // ragged top
      let x = -len / 2 + (row % 2 ? 0.25 : 0);
      while (x < -len / 2 + cut) {
        const w = 0.45 + rnd() * 0.25;
        parts.push(new THREE.BoxGeometry(w - 0.04, 0.38, 0.62).translate(x + w / 2, y + 0.2, (rnd() - 0.5) * 0.05).rotateY((rnd() - 0.5) * 0.03));
        x += w;
      }
    }
    for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(0.35 + rnd() * 0.2, 0.3, 0.35).rotateY(rnd() * 3).rotateZ((rnd() - 0.5) * 0.4).translate((rnd() - 0.5) * 2.2, 0.12, 0.55 + rnd() * 0.4));
    const g = merge(parts);
    const s = col(stone), m = col(moss), d = col(mortar);
    return { solid: paintBy(g, (c, x, y, z, nx, ny) => {
      c.copy(s).multiplyScalar(0.7 + 0.3 * Math.min(1, y / 1.5) + 0.15 * noise3(x * 6, y * 6, z * 6));
      if (ny > 0.7) c.lerp(m, 0.55);
      if (Math.abs(ny) < 0.2 && Math.abs(noise3(x * 9, y * 9, z * 9)) < 0.04) c.lerp(d, 0.5);
    }) };
  },
  /** A dark lava rock with glowing veins. */
  lavaRock({ stone = '#2a1e1c', vein = '#ff5a14', seed = 4 } = {}) {
    const b = ROCKS.boulder({ stone, top: '#4a3430', topAmt: 0.4, seed, flat: 0.7 });
    const rnd = makeRnd(seed * 11 + 3);
    const veins = [];
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      veins.push(new THREE.BoxGeometry(0.05, 0.05, 0.9 + rnd() * 0.5).rotateY(a).translate(Math.cos(a + 1.57) * 0.82, 0.12 + rnd() * 0.3, Math.sin(a + 1.57) * 0.82));
    }
    return { solid: b.solid, glow: tint(merge(veins), vein, { ao: 0 }) };
  },
  /** An ice-crusted boulder: pale stone under snow, glassy blue patches. */
  iceRock({ seed = 5 } = {}) {
    const b = ROCKS.boulder({ stone: '#8aa4b8', top: '#f4faff', topAmt: 0.95, seed, flat: 0.75 });
    let ice = new THREE.IcosahedronGeometry(0.55, 1).scale(1, 1.4, 0.8);
    ice = lumpy(ice, 0.1, 2, seed).translate(0.62, 0.35, 0.2);
    return { solid: b.solid, gloss: tint(ice, '#9ad8f4', { ao: 0.2 }) };
  },
  /** A boulder grown over with small glowing mushrooms. */
  fungusRock({ stone = '#3a2e4a', cap = '#c060ff', seed = 6 } = {}) {
    const b = ROCKS.boulder({ stone, top: '#5a3a6a', topAmt: 0.6, seed });
    const rnd = makeRnd(seed * 7 + 1);
    const caps = [], stems = [];
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, d = 0.35 + rnd() * 0.6, h = 0.15 + rnd() * 0.25;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.3 + Math.sqrt(Math.max(0, 1 - d * d)) * 0.62;
      stems.push(new THREE.CylinderGeometry(0.03, 0.04, h, 5).translate(x, y + h / 2, z));
      caps.push(new THREE.SphereGeometry(0.09 + rnd() * 0.08, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y + h, z));
    }
    return { solid: merge([b.solid, tint(merge(stems), '#d8d0c0', { ao: 0.2 })]), glow: tint(merge(caps), cap, { ao: 0 }) };
  },
  /** A big old stump with roots and a ring of shelf fungus. */
  stump({ bark = '#4a3626', wood = '#a07a50', seed = 7 } = {}) {
    const trunk = new THREE.CylinderGeometry(0.75, 0.95, 0.9, 14, 2).translate(0, 0.45, 0);
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.85) p.setY(i, 0.9 + noise3(p.getX(i) * 3, 0, p.getZ(i) * 3) * 0.25);
    const roots = [0, 1, 2, 3, 4].map((i) => new THREE.ConeGeometry(0.28, 1.1, 5).rotateZ(Math.PI / 2.3).translate(0.85, 0.15, 0).rotateY((i / 5) * Math.PI * 2 + seed));
    const b = col(bark), w = col(wood);
    const g = paintBy(lumpy(merge([trunk, ...roots]), 0.05, 3, seed), (c, x, y, z, nx, ny) => {
      c.copy(b).multiplyScalar(0.6 + 0.4 * Math.min(1, y / 0.8));
      if (ny > 0.75 && y > 0.7) c.copy(w).multiplyScalar(0.85 + 0.15 * Math.sin(Math.hypot(x, z) * 30));
    });
    return { solid: g };
  },
  /** A rock floating over a small standing stone, a crystal on top (the Sanctum). */
  floating({ stone = '#3a3a6a', crystal = '#9fe0ff', seed = 8 } = {}) {
    const rnd = makeRnd(seed * 5 + 1);
    let isle = new THREE.ConeGeometry(0.95, 1.4, 9, 3).rotateX(Math.PI).translate(0, 1.6, 0);
    const topD = new THREE.CylinderGeometry(0.95, 0.95, 0.25, 9).translate(0, 2.4, 0);
    isle = lumpy(merge([isle, topD]), 0.12, 2, seed);
    const stub = lumpy(new THREE.CylinderGeometry(0.35, 0.6, 0.6, 7).translate(0, 0.3, 0), 0.08, 3, seed + 2);
    const s = col(stone);
    const solid = paintBy(merge([isle, stub]), (c, x, y, z, nx, ny) => c.copy(s).multiplyScalar(0.55 + 0.5 * Math.max(0, ny) + 0.1 * noise3(x * 4, y * 4, z * 4)));
    const cr = TREES.crystal({ color: crystal, seed: seed + 3, tall: 0.35 }).gloss.translate((rnd() - 0.5) * 0.4, 2.5, (rnd() - 0.5) * 0.4);
    return { solid, gloss: cr };
  },
  /** Sandstone ruins of the city: column drums and a carved block. */
  cityRubble({ stone = '#c4a476', dark = '#8a6a48', seed = 9 } = {}) {
    const rnd = makeRnd(seed * 3 + 11);
    const parts = [new THREE.BoxGeometry(1.4, 0.9, 1.0).rotateY(rnd()).translate(-0.2, 0.45, 0)];
    for (let i = 0; i < 3; i++) parts.push(new THREE.CylinderGeometry(0.38, 0.38, 0.6, 14).rotateZ(i ? Math.PI / 2 : 0).rotateY(rnd() * 3).translate((rnd() - 0.3) * 1.3, i ? 0.38 : 1.2, (rnd() - 0.5) * 1.2));
    const s = col(stone), d = col(dark);
    return { solid: paintBy(lumpy(merge(parts), 0.03, 4, seed), (c, x, y, z, nx, ny) => c.copy(d).lerp(s, 0.4 + 0.6 * Math.min(1, y / 0.8) + 0.12 * noise3(x * 5, y * 5, z * 5))) };
  },
  /** A wind-carved storm rock: tall, leaning, grooved. */
  windRock({ stone = '#5a6270', top = '#8a94a4', seed = 10 } = {}) {
    let g = new THREE.CylinderGeometry(0.55, 1, 2.2, 10, 8).translate(0, 1.1, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) + y * y * 0.12);
      const k = 1 + 0.12 * Math.sin(y * 5 + seed);
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g = lumpy(g, 0.12, 1.8, seed);
    const s = col(stone), t = col(top);
    return { solid: paintBy(g, (c, x, y, z, nx, ny) => c.copy(s).lerp(t, Math.max(0, ny) * 0.7).multiplyScalar(0.6 + 0.4 * Math.min(1, y / 1.2) + 0.1 * Math.sin(y * 10))) };
  },
};

// =====================================================================================
// Ground cover (decor, not solid: walk right through it). Unit size.
// =====================================================================================
export const DECOR = {
  bush({ leaves = ['#2a4a22', '#5a8a36'], seed = 1, berries = null } = {}) {
    const rnd = makeRnd(seed * 7 + 2);
    const cl = [];
    for (let i = 0; i < 4; i++) cl.push(clump(0.35 + rnd() * 0.2, (rnd() - 0.5) * 0.6, 0.25 + rnd() * 0.15, (rnd() - 0.5) * 0.6, seed + i, 1));
    const lo = col(leaves[0]), hi = col(leaves[1]);
    const out = { solid: paintBy(merge(cl), (c, x, y, z, nx, ny) => c.copy(lo).lerp(hi, Math.min(1, y / 0.6 + 0.2 * ny))) };
    if (berries) {
      const b = [];
      for (let i = 0; i < 6; i++) { const a = rnd() * 6.28; b.push(new THREE.SphereGeometry(0.05, 5, 3).translate(Math.cos(a) * 0.4, 0.35 + rnd() * 0.2, Math.sin(a) * 0.4)); }
      out.gloss = tint(merge(b), berries, { ao: 0 });
    }
    return out;
  },
  fern({ color = ['#2a5a26', '#6aa040'], seed = 2 } = {}) {
    const fr = [];
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.PlaneGeometry(0.16, 0.8, 1, 3).translate(0, 0.4, 0);
      const p = leaf.attributes.position;
      for (let v = 0; v < p.count; v++) { const y = p.getY(v); p.setZ(v, -0.3 * (y / 0.8) ** 2); }
      leaf.rotateX(-0.7).rotateY((i / 7) * Math.PI * 2 + seed);
      fr.push(leaf);
    }
    const lo = col(color[0]), hi = col(color[1]);
    return { solid: paintBy(merge(fr), (c, x, y) => c.copy(lo).lerp(hi, Math.min(1, y / 0.45))) };
  },
  flowers({ colors = ['#ffd84a', '#ff7aa8', '#ffffff', '#a88aff'], seed = 3 } = {}) {
    const rnd = makeRnd(seed * 13 + 5);
    const stems = [], heads = [];
    const C = colors.map(col);
    for (let i = 0; i < 9; i++) {
      const x = (rnd() - 0.5) * 0.9, z = (rnd() - 0.5) * 0.9, h = 0.2 + rnd() * 0.2;
      stems.push(new THREE.CylinderGeometry(0.012, 0.015, h, 3).translate(x, h / 2, z));
      const hd = new THREE.IcosahedronGeometry(0.055, 0).translate(x, h, z);
      heads.push(paintBy(hd, (c) => c.copy(C[i % C.length])));
    }
    return { solid: merge([tint(merge(stems), '#3a6a2a', { ao: 0.3 }), ...heads]) };
  },
  log({ bark = '#4a3424', wood = '#9a7450', seed = 4 } = {}) {
    const g = new THREE.CylinderGeometry(0.22, 0.26, 2.2, 10, 3).rotateZ(Math.PI / 2).translate(0, 0.2, 0);
    const b = col(bark), w = col(wood);
    return { solid: paintBy(lumpy(g, 0.03, 4, seed), (c, x, y, z, nx) => c.copy(Math.abs(nx) > 0.9 ? w : b).multiplyScalar(0.7 + 0.3 * Math.min(1, y / 0.35))) };
  },
  reeds({ color = ['#3a4a2a', '#9aa060'], seed = 5 } = {}) {
    const rnd = makeRnd(seed * 3 + 9);
    const r = [], heads = [];
    for (let i = 0; i < 9; i++) {
      const x = (rnd() - 0.5) * 0.5, z = (rnd() - 0.5) * 0.5, h = 0.9 + rnd() * 0.8;
      r.push(new THREE.ConeGeometry(0.025, h, 3).translate(x, h / 2, z).rotateZ((rnd() - 0.5) * 0.2));
      if (i % 3 === 0) heads.push(new THREE.CapsuleGeometry(0.045, 0.18, 2, 5).translate(x, h * 0.85, z));
    }
    const lo = col(color[0]), hi = col(color[1]);
    return { solid: merge([paintBy(merge(r), (c, x, y) => c.copy(lo).lerp(hi, Math.min(1, y / 1.4))), tint(merge(heads), '#5a3a22', { ao: 0 })]) };
  },
  lilypads({ seed = 6 } = {}) {
    const rnd = makeRnd(seed * 5 + 3);
    const p = [], fl = [];
    for (let i = 0; i < 4; i++) {
      const r = 0.18 + rnd() * 0.15, x = (rnd() - 0.5) * 1.2, z = (rnd() - 0.5) * 1.2;
      p.push(new THREE.CircleGeometry(r, 9, 0.3, Math.PI * 2 - 0.4).rotateX(-Math.PI / 2).translate(x, 0.04, z));
      if (i === 0) fl.push(new THREE.ConeGeometry(0.07, 0.1, 6).rotateX(Math.PI).translate(x, 0.1, z));
    }
    return { solid: merge([tint(merge(p), '#3a6a32', { ao: 0 }), tint(merge(fl), '#ffd0e8', { ao: 0 })]) };
  },
  bones({ seed = 7 } = {}) {
    const rnd = makeRnd(seed * 9 + 1);
    const parts = [new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.85, 1.2).translate(0, 0.12, 0)];
    for (let i = 0; i < 4; i++) parts.push(new THREE.CapsuleGeometry(0.03, 0.5, 2, 5).rotateZ(Math.PI / 2).rotateY(rnd() * 3).translate((rnd() - 0.5) * 0.8, 0.04, (rnd() - 0.5) * 0.8));
    for (let i = 0; i < 4; i++) parts.push(new THREE.TorusGeometry(0.22 - i * 0.03, 0.02, 3, 8, Math.PI).rotateY(1.57).translate(0.55, 0.03, -0.2 + i * 0.12));
    return { solid: tint(merge(parts), '#e8dcc0', { ao: 0.25 }) };
  },
  embers({ seed = 8 } = {}) {
    // a smouldering patch: cinders that glow
    const rnd = makeRnd(seed * 3 + 1);
    const g = [], s = [];
    for (let i = 0; i < 8; i++) {
      const x = (rnd() - 0.5) * 0.9, z = (rnd() - 0.5) * 0.9;
      (i % 2 ? g : s).push(new THREE.IcosahedronGeometry(0.06 + rnd() * 0.07, 0).translate(x, 0.03, z));
    }
    return { solid: tint(merge(s), '#2a2420', { ao: 0 }), glow: tint(merge(g), '#ff6a1a', { ao: 0 }) };
  },
  smallCrystals({ color = '#9fe0ff', seed = 9 } = {}) {
    const c = TREES.crystal({ color, seed, tall: 0.18 });
    return { gloss: c.gloss.scale(0.6, 1, 0.6) };
  },
  tombstone({ stone = '#6a6a74', seed = 10 } = {}) {
    const rnd = makeRnd(seed * 7 + 1);
    const top = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.75, 0);
    const slab = new THREE.BoxGeometry(0.6, 0.75, 0.14).translate(0, 0.37, 0);
    const g = merge([slab, top]).rotateZ((rnd() - 0.5) * 0.3).rotateX((rnd() - 0.5) * 0.25);
    return { solid: paintBy(g, (c, x, y, z) => c.set(stone).multiplyScalar(0.6 + 0.4 * Math.min(1, y / 0.7) + 0.1 * noise3(x * 8, y * 8, z * 8))) };
  },
  snowDrift({ seed = 11 } = {}) {
    let g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.16, 0.5);
    g = lumpy(g, 0.05, 2, seed);
    return { solid: tint(g, '#c8d8e6', { ao: 0.3 }) };
  },
  sporeCaps({ cap = '#ff8ae8', seed = 12 } = {}) {
    const rnd = makeRnd(seed * 3 + 5);
    const st = [], cp = [];
    for (let i = 0; i < 5; i++) {
      const x = (rnd() - 0.5) * 0.6, z = (rnd() - 0.5) * 0.6, h = 0.2 + rnd() * 0.35;
      st.push(new THREE.CylinderGeometry(0.03, 0.045, h, 5).translate(x, h / 2, z));
      cp.push(new THREE.SphereGeometry(0.08 + rnd() * 0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(x, h, z));
    }
    return { solid: tint(merge(st), '#e0d8c8', { ao: 0.2 }), glow: tint(merge(cp), cap, { ao: 0 }) };
  },
  pottery({ seed = 13 } = {}) {
    const rnd = makeRnd(seed * 3 + 7);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const pts = [];
      const h = 0.35 + rnd() * 0.25;
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector2(0.06 + Math.sin(t * Math.PI) * (0.13 + rnd() * 0.02) + (t > 0.9 ? 0.03 : 0), t * h)); }
      parts.push(new THREE.LatheGeometry(pts, 10).translate((rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6));
    }
    return { solid: tint(merge(parts), '#b8784a', { ao: 0.4 }) };
  },
  ashPile({ seed = 14 } = {}) {
    let g = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 0.12, 0.45);
    g = lumpy(g, 0.05, 2.5, seed);
    return { solid: tint(g, '#5e5852', { ao: 0.25 }) };
  },
};
