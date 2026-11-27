// (1.0) The ways between maps, drawn.
//  - buildBeacon: an ordinary exit, as in MapleStory: a ring of light on the ground, a soft column rising from it,
//    rings drifting up the column and motes of light climbing; brighter and quicker while it carries you off.
//  - buildWayDown: the Verge's way to the Deep: the old stone arch (the portal every map used to have), its veil
//    gone dark violet, a slow swirl in it.
//  - buildWayUp: the Verge's way to Caelum: three white steps floating up to a ring of gold, a warm veil in it,
//    two slim white posts at its foot.
//  - buildCrack: the crack in the air: (0.99.22) a black wound taller than a door, a pale rim, lightning and
//    dark tendrils off it, scorched ground and ash
// Each returns { group, anim(dt, time, k) } (k: 0 at rest, rising to 1 while it is taking you).
import * as THREE from 'three';
import { propInstances } from './props.js';

const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

/** A column whose light fades out toward the top (an open tube with vertex colours). */
function fadeTube(r0, r1, h) {
  const geo = new THREE.CylinderGeometry(r1, r0, h, 40, 6, true).translate(0, h / 2, 0);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    // clamped: float rounding puts the top ring a hair above h, and a negative base gives NaN, which the bloom
    // pass spreads into black blocks across the screen (0.99.7)
    const k = Math.pow(Math.min(1, Math.max(0, 1 - pos.getY(i) / h)), 1.6);
    col.push(k, k, k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export function buildBeacon(ringGeo) {
  const group = new THREE.Group();
  const pad = new THREE.Mesh(ringGeo, add(0x9fdcff, 0.55));
  pad.position.y = 0.05;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), add(0x5fb8ff, 0.12));
  glow.position.y = 0.04;
  const colMat = add(0x6fc4ff, 0.2);
  colMat.vertexColors = true;
  const column = new THREE.Mesh(fadeTube(1.25, 1.0, 3.6), colMat);
  const coreMat = add(0xbfe6ff, 0.16);
  coreMat.vertexColors = true;
  const core = new THREE.Mesh(fadeTube(0.22, 0.12, 2.4), coreMat);
  const rings = [];
  const ringShape = new THREE.RingGeometry(0.94, 1.04, 48).rotateX(-Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(ringShape, add(0xbfe8ff, 0.7));
    m.userData.phase = i / 3;
    rings.push(m);
  }
  const motes = [];
  const moteGeo = new THREE.OctahedronGeometry(0.06, 0);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(moteGeo, add(0xeaf8ff, 0.9));
    const a = (i / 14) * Math.PI * 2;
    m.userData = { a, r: 0.35 + ((i * 37) % 10) / 14, phase: ((i * 53) % 14) / 14, speed: 0.22 + ((i * 17) % 7) / 40 };
    motes.push(m);
  }
  group.add(glow, pad, column, core, ...rings, ...motes);
  return { group, pad, glow, column, core, rings, motes };
}

/** Animate a beacon (k: how far it has got with taking you, 0 to 1). */
export function animBeacon(v, dt, time, k) {
  const r = v.gate ? v.gate.r : 2;
  v.pad.scale.setScalar(r * (1 - 0.35 * k) * (1 + Math.sin(time * 2.4) * 0.03));
  v.glow.scale.setScalar(r * 1.05);
  v.glow.material.opacity = 0.1 + 0.25 * k;
  v.column.scale.set(r / 2, 1 + 0.25 * k, r / 2);
  v.column.material.opacity = 0.18 + Math.sin(time * 2) * 0.04 + 0.35 * k;
  v.core.material.opacity = 0.14 + 0.4 * k;
  v.pad.material.opacity = 0.5 + 0.35 * k;
  v.column.rotation.y += dt * 0.4;
  const pace = 0.45 + 1.6 * k;
  for (const m of v.rings) {
    const t = (m.userData.phase + time * pace * 0.5) % 1;
    m.position.y = 0.15 + t * 3.2;
    m.scale.setScalar((r / 2) * (1.05 - 0.25 * t));
    m.material.opacity = (1 - t) * (0.45 + 0.4 * k);
  }
  for (const m of v.motes) {
    const u = m.userData, t = (u.phase + time * u.speed * (1 + 2 * k)) % 1;
    const a = u.a + time * 0.6;
    m.position.set(Math.cos(a) * u.r * (r / 2), 0.1 + t * 3.6, Math.sin(a) * u.r * (r / 2));
    m.material.opacity = Math.sin(t * Math.PI) * 0.9;
    m.rotation.y += dt * 3;
  }
}

/** The way to the Deep: the old stone arch, its veil dark violet and slowly turning. */
export function buildWayDown(ringGeo, keep) {
  const group = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 6, 22), new THREE.MeshBasicMaterial({ color: 0x6a4a9a }));
  arch.position.y = 1.9;
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0x140726, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
  veil.position.y = 1.9;
  const swirl = new THREE.Mesh(new THREE.RingGeometry(0.35, 1.5, 40, 1, 0, Math.PI * 1.4), add(0x8a4cff, 0.35));
  swirl.position.set(0, 1.9, 0.02);
  const swirl2 = swirl.clone();
  swirl2.material = add(0x4a2aa0, 0.3);
  swirl2.position.z = -0.02;
  const pad = new THREE.Mesh(ringGeo, add(0x8a5cff, 0.75));
  pad.position.y = 0.05;
  pad.scale.setScalar(2);
  group.add(arch, veil, swirl, swirl2, pad);
  propInstances('waygate', [{ x: 0, z: 0, rot: Math.PI / 2, sx: 4.6, sz: 1.2, sy: 4.4 }]).then((mesh) => {
    if (!mesh || !keep(mesh)) return;
    group.add(mesh);
    arch.visible = false;
    for (const m of [veil, swirl, swirl2]) {
      m.scale.set(0.62, 0.92, 1);
      m.position.y = 1.75;
    }
  });
  return {
    group,
    anim(dt, time, k) {
      swirl.rotation.z -= dt * (0.5 + 3 * k);
      swirl2.rotation.z += dt * (0.3 + 2 * k);
      swirl.material.opacity = 0.3 + 0.12 * Math.sin(time * 1.7) + 0.4 * k;
      pad.scale.setScalar(2 * (1 - 0.4 * k));
      pad.material.opacity = 0.6 + 0.3 * k;
    },
  };
}

/** The way to Caelum: white steps floating up to a ring of gold, a warm veil in it. */
export function buildWayUp(ringGeo) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.35, metalness: 0.6, emissive: 0x6a4a10, emissiveIntensity: 0.4 });
  const steps = [];
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.8 - i * 0.2, 0.18, 0.8), stone);
    st.position.set(0, 0.25 + i * 0.55, -0.3 - i * 0.55);
    st.castShadow = true;
    st.userData.y = st.position.y;
    steps.push(st);
  }
  const posts = [-1.15, 1.15].map((x) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.4, 10), stone);
    p.position.set(x, 1.2, 0.4);
    p.castShadow = true;
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), gold);
    cap.position.set(x, 2.55, 0.4);
    group.add(cap);
    return p;
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 10, 48), gold);
  halo.position.set(0, 3.0, -1.4);
  const veil = new THREE.Mesh(new THREE.CircleGeometry(1.08, 40), add(0xfff0c8, 0.45));
  veil.position.copy(halo.position);
  const rays = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.9, 48), add(0xffe6a8, 0.18));
  rays.position.copy(halo.position);
  const pad = new THREE.Mesh(ringGeo, add(0xffe9b0, 0.8));
  pad.position.y = 0.05;
  pad.scale.setScalar(2);
  group.add(...steps, ...posts, halo, veil, rays, pad);
  return {
    group,
    anim(dt, time, k) {
      steps.forEach((st, i) => (st.position.y = st.userData.y + Math.sin(time * 1.3 + i * 0.9) * 0.05));
      halo.position.y = veil.position.y = rays.position.y = 3.0 + Math.sin(time * 1.1) * 0.08;
      halo.rotation.z += dt * 0.15;
      veil.material.opacity = 0.38 + 0.08 * Math.sin(time * 2.2) + 0.45 * k;
      rays.rotation.z -= dt * (0.2 + 1.5 * k);
      rays.material.opacity = 0.15 + 0.35 * k;
      pad.scale.setScalar(2 * (1 - 0.4 * k));
    },
  };
}

/** The crack in the air: a jagged tear of light, taller than a door; shards turn slowly round it. */
export function buildCrack(o) {
  // (0.99.22) a wound in the air, not a light: a black void with a thin pale-violet rim, lightning crawling off it,
  // dark tendrils clawing out from its edges, scorched ground beneath and ash drifting up
  const group = new THREE.Group();
  group.position.set(o.x, 0, o.z);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tear = (w, h, jag) => {
    // a long thin lens, ragged on both sides, narrower at the top and bottom than in the middle
    const pts = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = 0.35 + t * h, x = Math.pow(Math.sin(t * Math.PI), 1.4) * w * (0.6 + rnd() * jag);
      pts.push(new THREE.Vector2(x, y));
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n, y = 0.35 + t * h, x = Math.pow(Math.sin(t * Math.PI), 1.4) * w * (0.6 + rnd() * jag);
      pts.push(new THREE.Vector2(-x, y));
    }
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  };
  const dark = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const haze = new THREE.Mesh(tear(1.5, 5.0, 0.5), dark(0x14051f, 0.55)); // a bruise in the air round it
  haze.position.y = -0.3;
  const rim = new THREE.Mesh(tear(0.5, 4.4, 0.7), add(0xc6a6ff, 0.55)); // the thin pale edge
  rim.position.y = -0.12;
  const rim2 = new THREE.Mesh(tear(0.8, 4.7, 0.8), add(0x6a2aa8, 0.3));
  rim2.position.y = -0.22;
  const voidM = new THREE.Mesh(tear(0.4, 4.2, 0.55), new THREE.MeshBasicMaterial({ color: 0x030106, side: THREE.DoubleSide })); // the hole itself
  // stars far inside the void (a few points, slowly turning)
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 26; i++) sp.push((rnd() - 0.5) * 0.4, 0.9 + rnd() * 3.4, (rnd() - 0.5) * 0.02);
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd8c8ff, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  const face = new THREE.Group();
  face.add(haze, rim2, rim, voidM, stars);
  for (const m of [haze, rim2, rim, voidM, stars]) m.renderOrder = 2;
  const back = face.clone();
  back.rotation.y = Math.PI / 2; // seen from any side
  // tendrils: dark curling roots reaching out of its edges
  const tendrils = [];
  const tMat = new THREE.MeshLambertMaterial({ color: 0x120a18, emissive: 0x1a0626 });
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, y0 = 0.9 + rnd() * 3.2, reach = 1.1 + rnd() * 1.6;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(new THREE.Vector3(side * (0.15 + t * reach), y0 + Math.sin(t * 3 + i) * 0.35 * t - t * t * 0.6, Math.sin(t * 4 + i * 2) * 0.3 * t));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.045, 5, false);
    // taper toward the tip
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const seg = Math.floor(v / 6) / 18;
      const c = new THREE.Vector3().fromBufferAttribute(pos, v);
      const p0 = new THREE.CatmullRomCurve3(pts).getPoint(Math.min(1, seg));
      c.sub(p0).multiplyScalar(1.4 - seg * 1.2).add(p0);
      pos.setXYZ(v, c.x, c.y, c.z);
    }
    const m = new THREE.Mesh(geo, tMat);
    m.userData = { phase: rnd() * 6.283, y0, side };
    m.rotation.y = (i % 4) * (Math.PI / 4) + (i > 4 ? Math.PI / 2 : 0);
    tendrils.push(m);
  }
  // lightning: jagged bolts off the rim, remade every moment
  const boltGeo = new THREE.BufferGeometry();
  const BOLTS = 4, SEGS = 7;
  boltGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(BOLTS * SEGS * 2 * 3), 3));
  const bolts = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xe6dcff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  const remake = () => {
    const a = boltGeo.attributes.position.array;
    let o = 0;
    for (let b = 0; b < BOLTS; b++) {
      let x = (rnd() - 0.5) * 0.4, y = 0.8 + rnd() * 3.6, z = (rnd() - 0.5) * 0.4;
      const dir = rnd() * Math.PI * 2, out = 0.18 + rnd() * 0.22;
      for (let s2 = 0; s2 < SEGS; s2++) {
        const nx = x + Math.cos(dir) * out + (rnd() - 0.5) * 0.25, ny = y + (rnd() - 0.6) * 0.35, nz = z + Math.sin(dir) * out + (rnd() - 0.5) * 0.25;
        a[o++] = x; a[o++] = y; a[o++] = z; a[o++] = nx; a[o++] = ny; a[o++] = nz;
        x = nx; y = ny; z = nz;
      }
    }
    boltGeo.attributes.position.needsUpdate = true;
  };
  remake();
  // scorched ground, and ash rising
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32).rotateX(-Math.PI / 2), dark(0x0a0410, 0.55));
  scorch.position.y = 0.04;
  const ashGeo = new THREE.BufferGeometry();
  const ASH = 40, ap = new Float32Array(ASH * 3), av = [];
  for (let i = 0; i < ASH; i++) { ap[i * 3] = (rnd() - 0.5) * 2.4; ap[i * 3 + 1] = rnd() * 5; ap[i * 3 + 2] = (rnd() - 0.5) * 2.4; av.push(0.2 + rnd() * 0.5); }
  ashGeo.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0x2a1a36, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false }));
  group.add(face, back, ...tendrils, bolts, scorch, ash);
  let boltT = 0;
  return {
    group,
    anim(dt, time) {
      // the rim breathes and stutters; lightning comes in bursts
      const flick = 0.75 + 0.25 * Math.sin(time * 11.7) * Math.sin(time * 4.3);
      rim.material.opacity = 0.5 * flick;
      rim2.material.opacity = 0.22 + 0.1 * Math.sin(time * 1.7);
      haze.material.opacity = 0.5 + 0.08 * Math.sin(time * 0.9);
      face.rotation.y = Math.sin(time * 0.3) * 0.12;
      back.rotation.y = Math.PI / 2 + Math.sin(time * 0.3) * 0.12;
      stars.rotation.y += dt * 0.2;
      boltT -= dt;
      if (boltT <= 0) { remake(); boltT = 0.06 + rnd() * 0.18; bolts.visible = rnd() > 0.25; }
      bolts.material.opacity = 0.6 + rnd() * 0.4;
      for (const m of tendrils) {
        const u = m.userData;
        m.rotation.z = Math.sin(time * 0.8 + u.phase) * 0.12 * u.side;
        m.rotation.x = Math.sin(time * 0.6 + u.phase * 2) * 0.1;
        m.scale.setScalar(0.92 + Math.sin(time * 0.7 + u.phase) * 0.08);
      }
      const p = ashGeo.attributes.position.array;
      for (let i = 0; i < ASH; i++) {
        p[i * 3 + 1] += av[i] * dt;
        p[i * 3] += Math.sin(time + i) * dt * 0.1;
        if (p[i * 3 + 1] > 5.5) p[i * 3 + 1] = 0.1;
      }
      ashGeo.attributes.position.needsUpdate = true;
    },
  };
}
