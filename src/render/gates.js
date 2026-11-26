// (1.0) The ways between maps, drawn.
//  - buildBeacon: an ordinary exit, as in MapleStory: a ring of light on the ground, a soft column rising from it,
//    rings drifting up the column and motes of light climbing; brighter and quicker while it carries you off.
//  - buildWayDown: the Verge's way to the Deep: the old stone arch (the portal every map used to have), its veil
//    gone dark violet, a slow swirl in it.
//  - buildWayUp: the Verge's way to Caelum: three white steps floating up to a ring of gold, a warm veil in it,
//    two slim white posts at its foot.
//  - buildCrack: the crack in the air: a jagged tear of light taller than a door, shards turning round it.
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
  const group = new THREE.Group();
  group.position.set(o.x, 0, o.z);
  const tear = (w, h) => {
    // a lens with ragged edges, as a crack in glass
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = 0.3 + t * h, x = Math.sin(t * Math.PI) * w * (0.55 + (((i * 7) % 5) / 5) * 0.6);
      pts.push(new THREE.Vector2(x * (i % 2 ? 1 : 0.6), y));
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n, y = 0.3 + t * h, x = Math.sin(t * Math.PI) * w * (0.5 + (((i * 3) % 4) / 4) * 0.6);
      pts.push(new THREE.Vector2(-x * (i % 2 ? 0.7 : 1), y));
    }
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  };
  const core = new THREE.Mesh(tear(0.28, 4.0), add(0xfff6ff, 0.95));
  const edge = new THREE.Mesh(tear(0.6, 4.3), add(0xb07cff, 0.45));
  edge.position.y = -0.15;
  const edge2 = new THREE.Mesh(tear(1.0, 4.6), add(0x5fd8ff, 0.16));
  edge2.position.y = -0.3;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32).rotateX(-Math.PI / 2), add(0x9a7cff, 0.22));
  glow.position.y = 0.05;
  const shards = [];
  const sg = new THREE.TetrahedronGeometry(0.12, 0);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(sg, add(i % 2 ? 0xd8c8ff : 0x9fe8ff, 0.85));
    m.userData = { a: (i / 9) * Math.PI * 2, y: 0.8 + ((i * 41) % 9) * 0.38, r: 0.9 + ((i * 13) % 5) * 0.15 };
    shards.push(m);
  }
  const tearGroup = new THREE.Group();
  tearGroup.add(core, edge, edge2);
  const back = tearGroup.clone();
  back.rotation.y = Math.PI / 2; // seen from any side
  group.add(tearGroup, back, glow, ...shards);
  return {
    group,
    anim(dt, time) {
      const flick = 0.85 + 0.15 * Math.sin(time * 9.3) * Math.sin(time * 3.1);
      core.material.opacity = 0.9 * flick;
      edge.material.opacity = 0.4 + 0.12 * Math.sin(time * 2.3);
      edge2.material.opacity = 0.14 + 0.06 * Math.sin(time * 1.4 + 1);
      tearGroup.rotation.y += dt * 0.25;
      back.rotation.y += dt * 0.25;
      glow.material.opacity = 0.18 + 0.08 * Math.sin(time * 2);
      for (const m of shards) {
        const u = m.userData, a = u.a + time * 0.4;
        m.position.set(Math.cos(a) * u.r, u.y + Math.sin(time * 1.3 + u.a) * 0.15, Math.sin(a) * u.r);
        m.rotation.x += dt * 1.4;
        m.rotation.y += dt * 2;
      }
    },
  };
}
