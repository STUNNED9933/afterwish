// Lacuna: the Adventurers' Guild's Telling Glass (Quest 2). A tall glass of pale sand on a stone stand in the Guild's
// yard. Two hands on the glass and your mana goes into the sand, which answers in the way of your element (a
// spiral for wind, embers rising for fire, frost climbing the glass for ice, the sand heaving up for earth); how
// much of it answers is your aptitude. For the hero, a few grains stir and no element at all. (0.99.25) Afterwards
// the sand he stirred has gone a little dull, and it never answers anyone again: the next hands on the glass get
// nothing, and a hairline crack runs up it.
//   const g = buildTellingGlass(CRYSTAL); scene.add(g.group); g.read('wind', 0.8); g.rest(); g.spend(true); g.crack(true)
import * as THREE from 'three';

const N = 420; // grains
const GLASS = { r: 0.34, h: 1.35, y: 1.2, sand: 0.42 }; // radius, height, where it stands, how deep the sand
const SAND = new THREE.Color(0xe8d9b0);
const LOOK = {
  wind: new THREE.Color(0xf2e6b8),
  fire: new THREE.Color(0xff7a2a),
  frost: new THREE.Color(0xdaf2ff),
  earth: new THREE.Color(0x8a6a3a),
  none: new THREE.Color(0xe8d9b0),
};
const DULL = new THREE.Color(0xa8a194); // spent sand: greyer, flatter, like ash

export function buildTellingGlass(at) {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a948a, flatShading: true });
  const brass = new THREE.MeshLambertMaterial({ color: 0xb08a3a, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.35, 8), stone);
  base.position.y = 0.175;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 8), stone);
  post.position.y = 0.7;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(GLASS.r + 0.08, GLASS.r + 0.1, 0.12, 16), brass);
  foot.position.y = GLASS.y - 0.06;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(GLASS.r + 0.02, 0.035, 6, 24).rotateX(Math.PI / 2), brass);
  lip.position.y = GLASS.y + GLASS.h;
  // the glass: clear, a little blue, open at the top; two brass hand plates on its sides
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(GLASS.r, GLASS.r, GLASS.h, 24, 1, true), glassMat);
  glass.position.y = GLASS.y + GLASS.h / 2;
  glass.renderOrder = 3;
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.16), brass);
    plate.position.set(0, GLASS.y + 0.6, s * (GLASS.r + 0.02));
    plate.rotation.y = Math.PI / 2;
    group.add(plate);
  }
  for (const m of [base, post, foot, lip]) { m.castShadow = true; m.receiveShadow = true; }
  group.add(base, post, foot, lip, glass);

  // the grains: each has a place in the bed of sand, and is moved from there by the reading
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const g = [];
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (GLASS.r - 0.03), y = rnd() * GLASS.sand;
    g.push({ bx: Math.cos(a) * r, by: y, bz: Math.sin(a) * r, a, k: rnd(), marked: -1 });
  }
  // the grains the hero stirs (the few nearest the top of the bed): those that turn black and stand in a line
  const order = g.map((p, i) => i).sort((i, j) => g[j].by - g[i].by);
  const MARKED = 34;
  for (let n = 0; n < MARKED; n++) g[order[n]].marked = n;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 16;
  const dg = dot.getContext('2d');
  dg.fillStyle = '#fff';
  dg.beginPath(); dg.arc(8, 8, 7, 0, Math.PI * 2); dg.fill();
  const grains = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, map: new THREE.CanvasTexture(dot), alphaTest: 0.5 }));
  grains.position.y = GLASS.y;
  grains.renderOrder = 2;
  grains.frustumCulled = false;
  group.add(grains);
  // (0.99.25) the hairline crack: a thin jagged dark line up one side of the glass
  const crackPts = [];
  {
    let a = 0.6, y = 0.08;
    for (let i = 0; i < 14; i++) {
      const a2 = a + (Math.sin(i * 2.3) * 0.09), y2 = y + 0.065 + (i % 3) * 0.02;
      crackPts.push(Math.cos(a) * (GLASS.r + 0.003), y, Math.sin(a) * (GLASS.r + 0.003), Math.cos(a2) * (GLASS.r + 0.003), y2, Math.sin(a2) * (GLASS.r + 0.003));
      if (i === 6) crackPts.push(Math.cos(a2) * (GLASS.r + 0.003), y2, Math.sin(a2) * (GLASS.r + 0.003), Math.cos(a2 + 0.16) * (GLASS.r + 0.003), y2 + 0.05, Math.sin(a2 + 0.16) * (GLASS.r + 0.003)); // a branch
      a = a2; y = y2;
    }
  }
  const crackGeo = new THREE.BufferGeometry();
  crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(crackPts, 3));
  const crackLine = new THREE.LineSegments(crackGeo, new THREE.LineBasicMaterial({ color: 0x2a2a30, transparent: true, opacity: 0.85 }));
  crackLine.position.y = GLASS.y;
  crackLine.visible = false;
  group.add(crackLine);
  // a faint light over the glass while a reading is strong
  const light = new THREE.PointLight(0xffe7a0, 0, 6, 1.6);
  light.position.y = GLASS.y + 0.8;
  group.add(light);

  let element = 'none', power = 0, want = 0, t = 0, mark = 0, markWant = 0, crackT = -1;
  const c = new THREE.Color();
  const api = {
    group,
    /** A reading: an element ('wind', 'fire', 'frost', 'earth', or 'none') and how much of the sand answers (0 to 1). */
    read(el, p) {
      element = LOOK[el] ? el : 'none';
      want = Math.max(0, Math.min(1, p));
    },
    /** The sand settles. */
    rest() {
      want = 0;
    },
    /** (0.99.25) The sand the hero stirred, spent: a shade greyer and flatter (easy to miss). */
    spend(on) {
      markWant = on ? 1 : 0;
    },
    /** (0.99.25) The hairline crack up the glass (it runs up quickly when it first comes). */
    crack(on) {
      crackLine.visible = !!on;
      crackT = on ? 0 : -1;
    },
    /** The old name for spend (the sand is still marked). */
    mark(on) {
      markWant = on ? 1 : 0;
      crackLine.visible = !!on;
    },
    get level() {
      return power;
    },
    update(dt) {
      t += dt;
      power += (want - power) * Math.min(1, dt * (want > power ? 2.2 : 0.9));
      mark += (markWant - mark) * Math.min(1, dt * 0.5);
      for (let i = 0; i < N; i++) {
        const p = g[i];
        // how far this grain answers: about the first `power` of them, each easing in by its own k
        const on = Math.max(0, Math.min(1, (power - p.k * 0.98) * 12));
        let x = p.bx, y = p.by, z = p.bz;
        if (on > 0) {
          if (element === 'wind') {
            const h = GLASS.sand + p.k * (GLASS.h - GLASS.sand - 0.05) * power;
            const a = p.a + t * (2.5 + p.k * 2), r = 0.06 + p.k * (GLASS.r - 0.1);
            x += (Math.cos(a) * r - x) * on; z += (Math.sin(a) * r - z) * on; y += (h - y) * on;
          } else if (element === 'fire') {
            const life = (t * (0.5 + p.k) + p.k * 7) % 1;
            y += (GLASS.sand + life * (GLASS.h - GLASS.sand) * power - y) * on;
            x += Math.sin(t * 3 + p.a * 5) * 0.02 * on;
          } else if (element === 'frost') {
            const h = p.by + p.k * (GLASS.h - 0.1) * power;
            x += (Math.cos(p.a) * (GLASS.r - 0.035) - x) * on; z += (Math.sin(p.a) * (GLASS.r - 0.035) - z) * on; y += (h - y) * on;
          } else if (element === 'earth') {
            y += (p.by * (1 + power * 1.6) - y) * on;
            x *= 1 - 0.4 * on; z *= 1 - 0.4 * on;
          } else {
            // no element: a stir, barely
            x += Math.sin(t * 7 + p.a * 3) * 0.015 * on; z += Math.cos(t * 6 + p.a * 2) * 0.015 * on; y += Math.abs(Math.sin(t * 5 + p.k * 9)) * 0.06 * on;
          }
        }
        let colr = SAND;
        if (mark > 0.01) {
          // spent: the whole bed a shade greyer and settled a little lower, the grains he stirred most of all
          const k2 = p.marked >= 0 ? 1 : 0.45;
          y *= 1 - 0.12 * mark * k2;
          colr = c.copy(SAND).lerp(DULL, mark * k2);
        } else if (on > 0 && element !== 'none') colr = c.copy(SAND).lerp(LOOK[element], on * 0.85);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        col[i * 3] = colr.r; col[i * 3 + 1] = colr.g; col[i * 3 + 2] = colr.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (crackT >= 0 && crackT < 1) {
        crackT = Math.min(1, crackT + dt * 2.5);
        crackGeo.setDrawRange(0, Math.floor((crackPts.length / 3) * crackT));
      }
      light.color.copy(LOOK[element]);
      light.intensity = power > 0.2 ? power * 4 : 0;
    },
  };
  api.update(0);
  return api;
}
