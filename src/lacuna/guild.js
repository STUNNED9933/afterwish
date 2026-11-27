// Lacuna: the Adventurers' Guild's Telling Glass (Quest 2). A tall glass of pale sand on a stone stand in the Guild's
// yard. Two hands on the glass and your mana goes into the sand, which answers in the way of your element (a
// spiral for wind, embers rising for fire, frost climbing the glass for ice, the sand heaving up for earth); how
// much of it answers is your aptitude. For the hero, a few grains stir and no element at all. Afterwards the grains
// he stirred turn black and settle into a thin upright line, like the tear he came through, and stay that way.
//   const g = buildTellingGlass(CRYSTAL); scene.add(g.group); g.read('wind', 0.8); g.rest(); g.mark(true); g.update(dt)
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
const BLACK = new THREE.Color(0x0a0610);

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
  // a faint light over the glass while a reading is strong
  const light = new THREE.PointLight(0xffe7a0, 0, 6, 1.6);
  light.position.y = GLASS.y + 0.8;
  group.add(light);

  let element = 'none', power = 0, want = 0, t = 0, mark = 0, markWant = 0;
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
    /** The hero's grains: black, standing in a thin upright line in the middle of the glass. */
    mark(on) {
      markWant = on ? 1 : 0;
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
        if (p.marked >= 0 && mark > 0.01) {
          // a thin black line standing up the middle
          const ly = 0.08 + (p.marked / MARKED) * (GLASS.h * 0.62);
          x += (0 - x) * mark; z += (0.004 * Math.sin(p.marked) - z) * mark; y += (ly - y) * mark;
          colr = c.copy(SAND).lerp(BLACK, mark);
        } else if (on > 0 && element !== 'none') colr = c.copy(SAND).lerp(LOOK[element], on * 0.85);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        col[i * 3] = colr.r; col[i * 3 + 1] = colr.g; col[i * 3 + 2] = colr.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      light.color.copy(LOOK[element]);
      light.intensity = power > 0.2 ? power * 4 : 0;
    },
  };
  api.update(0);
  return api;
}
