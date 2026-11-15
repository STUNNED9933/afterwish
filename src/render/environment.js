// The look of the world (0.34): painted ground, smoother rocks and trees, grass and
// pebbles, drifting motes, and the materials that make it all feel like one place.
// Drawing only: nothing here changes the game, and all of it is made from code at load
// (no texture files), so the download stays small. Seeded, so a map looks the same every time.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Quality --------------------------------------------------------------------------
// low: no shadows, no grass, simple ground. medium: shadows, grass, full ground.
// high: everything, plus bloom and colour grading.
export const QUALITY = {
  low: { shadows: false, grass: 0, pebbles: 0.4, bump: false, octaves: 3, post: false, pixelRatio: 1, motes: 80, shadowMap: 1024 },
  medium: { shadows: true, grass: 0.55, pebbles: 0.8, bump: true, octaves: 4, post: false, pixelRatio: 1.25, motes: 160, shadowMap: 1536 },
  high: { shadows: true, grass: 1, pebbles: 1, bump: true, octaves: 5, post: true, pixelRatio: 1.75, motes: 260, shadowMap: 2048 },
};

// --- Ground palettes by theme ---------------------------------------------------------
// a: the main ground, b: darker patches, c: worn / dirt patches, top: what settles on rocks
// (moss, ash, snow), crack: veins that glow (with strength), wet: puddles, stones: flagstones.
export const GROUND = {
  town: { a: '#3a4a30', b: '#232c1e', c: '#5c4d38', top: '#4a6a32', grass: ['#3f5a2a', '#6a8a3a'], debris: 'pebble', light: 0xffc890 },
  forest: { a: '#2f4a2a', b: '#18261a', c: '#4a3e2c', top: '#3f6a30', grass: ['#2e4a22', '#5f8a34'], debris: 'pebble', light: 0xffc890 },
  swamp: { a: '#25393a', b: '#121e20', c: '#3a3a2a', top: '#3a5a3a', wet: 0.75, grass: ['#2a4438', '#5a7a4a'], tall: 1.8, debris: 'pebble', light: 0xc8ffd8 },
  ash: { a: '#463a34', b: '#241c19', c: '#625248', top: '#7a6e66', crack: ['#ff5a1a', 0.35], grass: ['#3a302a', '#6a5a48'], dry: true, debris: 'pebble', light: 0xffb070 },
  keep: { a: '#363640', b: '#1c1c24', c: '#4c4a52', top: '#55565e', stones: true, grass: ['#2e3a2a', '#4a5a3a'], sparse: 0.35, debris: 'rubble', light: 0xffc890 },
  frost: { a: '#8fa6b8', b: '#5c7486', c: '#d6e4ee', top: '#eef6fc', wet: 0.45, bright: 0.55, grass: ['#9ab8c8', '#e0f0f8'], shards: true, sparse: 0.5, debris: 'pebble', light: 0xd8ecff },
  desert: { a: '#a8824c', b: '#7e5f36', c: '#c7a46a', top: '#c8a870', ripple: true, bright: 0.7, grass: ['#8a7a3a', '#c4a85a'], dry: true, sparse: 0.25, debris: 'pebble', light: 0xffd8a0 },
  fungal: { a: '#33294a', b: '#1a1226', c: '#4a3858', top: '#6a4a7a', crack: ['#c04aff', 0.5], grass: ['#3a2a4a', '#9a5ac0'], caps: true, sparse: 0.3, debris: 'pebble', light: 0xe0b0ff },
  storm: { a: '#38404c', b: '#20252e', c: '#56606e', top: '#6a7484', crack: ['#8fd8ff', 0.3], grass: ['#3a4448', '#6a7a78'], dry: true, sparse: 0.5, debris: 'rubble', light: 0xc8dcff },
  volcano: { a: '#3a2a26', b: '#1c1210', c: '#4c3630', top: '#5a4038', crack: ['#ff5a14', 2.2], grass: ['#2a1c18', '#4a2a20'], dry: true, sparse: 0.3, debris: 'rubble', light: 0xffa060 },
  astral: { a: '#201e44', b: '#0e0d24', c: '#2e2c5e', top: '#5a5aa8', crack: ['#6aa8ff', 1.0], grass: ['#3a3a7a', '#8fd8ff'], shards: true, sparse: 0.6, debris: 'pebble', light: 0xb8c8ff },
};

// --- Shared GLSL ----------------------------------------------------------------------
const NOISE_GLSL = /* glsl */ `
float awHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float awNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(awHash(i), awHash(i + vec2(1.0, 0.0)), u.x), mix(awHash(i + vec2(0.0, 1.0)), awHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float awFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < AW_OCT; i++) { s += a * awNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// Distance to the nearest cell edge of a jittered grid: flagstones and cracked earth.
float awCells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(awHash(i + g), awHash(i + g + 31.7)) * 0.8 + 0.1;
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
`;

const col = (hex) => new THREE.Color(hex);

/**
 * The ground: one big disc whose colour, grain, bumps, puddles and glowing cracks are all
 * worked out per pixel from world position. Lit and shadowed like everything else.
 */
export function groundMaterial(theme, radius, quality) {
  const P = GROUND[theme] || GROUND.forest;
  const Q = QUALITY[quality] || QUALITY.high;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const crack = P.crack ? col(P.crack[0]).multiplyScalar(P.crack[1]) : new THREE.Color(0, 0, 0);
  const uniforms = {
    uA: { value: col(P.a) }, uB: { value: col(P.b) }, uC: { value: col(P.c) },
    uCrack: { value: crack }, uWet: { value: P.wet || 0 }, uR: { value: radius },
    uStones: { value: P.stones ? 1 : 0 }, uRipple: { value: P.ripple ? 1 : 0 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.defines = Object.assign(sh.defines || {}, { AW_OCT: Q.octaves, AW_BUMP: Q.bump ? 1 : 0, AW_CRACK: P.crack ? 1 : 0, AW_STONES: P.stones ? 1 : 0 });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAwPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAwPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vAwPos;
uniform vec3 uA, uB, uC, uCrack;
uniform float uWet, uR, uStones, uRipple;
${NOISE_GLSL}
float awWet;`)
      .replace('#include <map_fragment>', `
  vec2 wp = vAwPos;
  float n1 = awFbm(wp * 0.035);
  float n2 = awFbm(wp * 0.17 + 13.0);
  float grain = awNoise(wp * 2.3) * 0.6 + awNoise(wp * 7.1) * 0.4;
  vec3 gcol = mix(uA, uB, smoothstep(0.38, 0.72, n1));
  gcol = mix(gcol, uC, smoothstep(0.56, 0.78, n2) * 0.85);
  gcol *= 0.78 + 0.36 * grain;
#if AW_STONES == 1
  {
    float e = awCells(wp * 0.55);
    gcol *= mix(0.45, 1.0, smoothstep(0.02, 0.09, e));
    gcol *= 0.85 + 0.3 * awHash(floor(wp * 0.55));
  }
#endif
  if (uRipple > 0.5) gcol *= 0.9 + 0.12 * sin(wp.x * 2.2 + wp.y * 0.9 + n1 * 14.0);
  awWet = uWet * smoothstep(0.62, 0.7, n1);
  gcol = mix(gcol, gcol * 0.45, awWet);
  float rr = length(wp) / uR;
  gcol *= mix(1.0, 0.28, smoothstep(0.97, 1.08, rr));
  diffuseColor.rgb *= gcol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.18, awWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if AW_BUMP == 1
  {
    float h0 = awNoise(vAwPos * 1.3) + 0.5 * awNoise(vAwPos * 4.1);
    float hx = awNoise((vAwPos + vec2(0.06, 0.0)) * 1.3) + 0.5 * awNoise((vAwPos + vec2(0.06, 0.0)) * 4.1);
    float hz = awNoise((vAwPos + vec2(0.0, 0.06)) * 1.3) + 0.5 * awNoise((vAwPos + vec2(0.0, 0.06)) * 4.1);
    float k = 2.2 * (1.0 - awWet);
    vec3 nw = normalize(vec3(-(hx - h0) / 0.06 * k * 0.08, 1.0, -(hz - h0) / 0.06 * k * 0.08));
    normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
  }
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#if AW_CRACK == 1
  {
    // Cracked earth: thin glowing seams along cell edges, only in some patches.
    vec2 cp = vAwPos * 0.3 + 7.0 + vec2(awNoise(vAwPos * 0.21), awNoise(vAwPos * 0.21 + 9.0)) * 1.6;
    float e = awCells(cp);
    float width = 0.012 + 0.04 * awNoise(vAwPos * 0.4 + 3.0);
    float line = 1.0 - smoothstep(0.0, width, e);
    float mask = smoothstep(0.56, 0.68, awFbm(vAwPos * 0.045 + 23.0));
    float pulse = 0.7 + 0.3 * awNoise(vAwPos * 0.6);
    totalEmissiveRadiance += uCrack * line * mask * pulse * smoothstep(1.02, 0.95, length(vAwPos) / uR);
  }
#endif`);
  };
  m.customProgramCacheKey = () => `aw-ground-${Q.octaves}-${Q.bump}-${!!P.crack}-${!!P.stones}`;
  return m;
}

// --- Small seeded noise for shaping meshes --------------------------------------------
function makeRnd(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function noise3(x, y, z) {
  // Cheap smooth 3D noise from a few sines; plenty for bumping rocks and leaves.
  return (Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 - x * 0.7) + Math.sin(y * 3.1 + z * 2.7) * 0.5 + Math.sin(x * 4.3 - z * 3.9 + y) * 0.25) / 1.75;
}

/** A smooth, lumpy geometry: welded, pushed out along its normals by noise, then re-shaded. */
function lumpy(geo, amount, freq, seed = 0) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length() || 1;
    const n = noise3(v.x * freq + seed, v.y * freq + seed * 0.7, v.z * freq - seed);
    v.multiplyScalar(1 + (n * amount) / len);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Vertex colours: dark at the base (fake ambient occlusion), a tint on top (moss, snow, ash). */
function paint(geo, base, top, { aoFrom = null, aoTo = null, topAmt = 0.65, ao = 0.45 } = {}) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  geo.computeBoundingBox();
  const y0 = aoFrom ?? geo.boundingBox.min.y, y1 = aoTo ?? geo.boundingBox.max.y;
  const c = new THREE.Color(), b = col(base), t = top ? col(top) : null;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0 || 1)));
    c.copy(b);
    if (t) c.lerp(t, Math.max(0, nor.getY(i) - 0.35) * topAmt * 1.5);
    c.multiplyScalar(1 - ao + ao * Math.sqrt(h));
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// --- Rocks ----------------------------------------------------------------------------
/** A few rock shapes for one theme, each a lumpy smooth boulder with a tinted top. */
export function rockGeometries(theme, baseColor, detail = 2) {
  const P = GROUND[theme] || GROUND.forest;
  const out = [];
  for (let k = 0; k < 3; k++) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.scale(1, 0.78, 1);
    g = lumpy(g, 0.22, 1.6 + k * 0.4, k * 3.1 + 1);
    // flatten the base so it sits on the ground
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.35) p.setY(i, -0.35 + (p.getY(i) + 0.35) * 0.25);
    g.computeVertexNormals();
    out.push(paint(g, baseColor, P.top, { topAmt: P.stones ? 0.25 : 0.6, ao: 0.55 }));
  }
  return out;
}

/** Small stones and rubble scattered over the ground. */
export function pebbleGeometry(theme, baseColor) {
  const P = GROUND[theme] || GROUND.forest;
  let g = new THREE.IcosahedronGeometry(1, 0);
  g.scale(1, P.debris === 'rubble' ? 0.7 : 0.5, P.debris === 'rubble' ? 0.8 : 1);
  g = lumpy(g, 0.25, 2.2, 7);
  return paint(g, baseColor, P.top, { ao: 0.4 });
}

// --- Trees ----------------------------------------------------------------------------
/**
 * Smooth trees by theme: layered pines, mushroom caps, dead spires, crystal clusters,
 * cacti. Returns { trunk, crown } geometries with vertex colours, sized like the old ones
 * (the simulation's collision does not change).
 */
export function treeGeometries(kind, trunkColor, crownColor) {
  let trunk = new THREE.CylinderGeometry(0.22, 0.48, 1.9, 9, 3).translate(0, 0.95, 0);
  // roots: three small flared wedges at the base
  const roots = [0, 1, 2].map((i) => new THREE.ConeGeometry(0.2, 0.7, 5).rotateZ(Math.PI / 2.6).translate(0.35, 0.18, 0).rotateY((i / 3) * Math.PI * 2 + 0.4));
  trunk = lumpy(mergeGeometries([trunk, ...roots].map((g) => g.toNonIndexed())), 0.05, 3.1, 2);
  paint(trunk, trunkColor, null, { ao: 0.5 });
  let crown;
  if (kind === 'cap') {
    const cap = new THREE.SphereGeometry(1.9, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1).translate(0, 1.6, 0);
    const under = new THREE.CircleGeometry(1.88, 18).rotateX(Math.PI / 2).translate(0, 1.6, 0);
    crown = lumpy(mergeGeometries([cap, under].map((g) => g.toNonIndexed())), 0.12, 1.4, 5);
    paint(crown, crownColor, '#ffffff', { topAmt: 0.12, ao: 0.6, aoFrom: 1.55 });
  } else if (kind === 'spike') {
    crown = lumpy(new THREE.ConeGeometry(0.75, 4.6, 8, 6).translate(0, 2.6, 0), 0.16, 2.4, 9);
    paint(crown, crownColor, null, { ao: 0.5 });
  } else if (kind === 'crystal') {
    const parts = [
      new THREE.OctahedronGeometry(1.25, 0).scale(0.72, 1.9, 0.72).translate(0, 3.3, 0),
      new THREE.OctahedronGeometry(0.7, 0).scale(0.6, 1.6, 0.6).rotateZ(0.45).translate(0.75, 2.3, 0.2),
      new THREE.OctahedronGeometry(0.55, 0).scale(0.6, 1.6, 0.6).rotateZ(-0.5).translate(-0.6, 2.1, -0.3),
    ];
    crown = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    crown.computeVertexNormals();
    paint(crown, crownColor, '#ffffff', { topAmt: 0.25, ao: 0.35 });
  } else if (kind === 'cactus') {
    const parts = [
      new THREE.CylinderGeometry(0.42, 0.5, 2.8, 10, 4).translate(0, 2.4, 0),
      new THREE.CapsuleGeometry(0.26, 0.9, 3, 8).translate(0.62, 2.7, 0),
      new THREE.CapsuleGeometry(0.22, 0.7, 3, 8).translate(-0.58, 2.2, 0),
    ];
    crown = lumpy(mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); })), 0.03, 4, 3);
    paint(crown, crownColor, null, { ao: 0.45 });
  } else {
    // A pine: three tiers of drooping, lumpy cones.
    const tiers = [[1.75, 2.0, 2.0], [1.35, 1.8, 3.1], [0.9, 1.7, 4.1]].map(([r, h, y], i) =>
      new THREE.ConeGeometry(r, h, 12, 3, true).translate(0, y, 0).rotateY(i * 0.7));
    crown = lumpy(mergeGeometries(tiers.map((g) => g.toNonIndexed())), 0.16, 1.9, 4);
    paint(crown, crownColor, null, { ao: 0.6, aoFrom: 1.0 });
  }
  return { trunk, crown };
}

// --- Grass and ground cover -----------------------------------------------------------
/** One tuft: a few thin blades fanned out, darker at the root. */
export function tuftGeometry(theme) {
  const P = GROUND[theme] || GROUND.forest;
  const blades = P.caps ? 0 : P.shards ? 3 : 7;
  const pos = [], cols = [];
  const lo = col(P.grass[0]), hi = col(P.grass[1]);
  const rnd = makeRnd(theme.length * 97 + 5);
  const tall = (P.tall || 1) * (P.dry ? 0.8 : 1);
  if (P.caps) {
    // tiny glowing mushrooms
    const g = mergeGeometries([
      new THREE.CylinderGeometry(0.03, 0.04, 0.18, 5).translate(0, 0.09, 0),
      new THREE.SphereGeometry(0.11, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.17, 0),
      new THREE.CylinderGeometry(0.02, 0.03, 0.12, 5).translate(0.14, 0.06, 0.05),
      new THREE.SphereGeometry(0.07, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.14, 0.11, 0.05),
    ].map((x) => { x.deleteAttribute('uv'); return x.toNonIndexed(); }));
    return paint(g, P.grass[0], P.grass[1], { ao: 0.5, topAmt: 0.5 });
  }
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rnd() * 0.6;
    const r = 0.05 + rnd() * 0.12;
    const h = (P.shards ? 0.22 : 0.28) * tall * (0.6 + rnd() * 0.7);
    const w = P.shards ? 0.06 : 0.035;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const lean = P.shards ? 0.05 : 0.18;
    const tx = bx + Math.cos(a) * lean * h, tz = bz + Math.sin(a) * lean * h;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    const tip = lo.clone().lerp(hi, 0.4 + rnd() * 0.6);
    const root = lo.clone().multiplyScalar(0.85);
    cols.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  // Light grass from above, not by its thin blade normals (avoids black blades).
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** A material that sways in the wind (by height above the ground) and shares one clock. */
export function swayMaterial(clock, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = clock;
    // Light every blade from above, both faces (a back face would otherwise be lit from below: black).
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  nonPerturbedNormal = normal;`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec2 ip = instanceMatrix[3].xz;
  #else
    vec2 ip = vec2(0.0);
  #endif
  float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.y * 0.27) * 0.6 + sin(uTime * 3.1 + ip.x * 0.9) * 0.25;
  transformed.x += sway * transformed.y * 0.35;
  transformed.z += sway * transformed.y * 0.18;`);
  };
  m.customProgramCacheKey = () => 'aw-sway';
  return m;
}

/**
 * Where to scatter ground cover: random spots inside the map that do not sit in a
 * building, rock, portal or the town square.
 */
export function scatterSpots(map, count, seed, { minGap = 0.4 } = {}) {
  const rnd = makeRnd(seed);
  const R = map.radius - 1.2;
  const out = [];
  const blocks = [];
  for (const o of map.obstacles || []) {
    if (o.kind === 'house') blocks.push([o.x, o.z, Math.hypot(o.hw, o.hd) + 0.6]);
    else if (o.kind === 'tree') blocks.push([o.x, o.z, o.r * 0.7]);
    else blocks.push([o.x, o.z, (o.r || 1) + minGap]);
  }
  for (const g of map.portals || []) if (g.x != null) blocks.push([g.x, g.z, (g.r || 2) + 1]);
  if (map.waygate) blocks.push([map.waygate.x, map.waygate.z, 4]);
  for (const ws of map.waystones || []) blocks.push([ws.x, ws.z, 2.5]);
  if (map.safe) blocks.push([0, 0, 10]);
  // a coarse grid of blockers, so this stays fast with thousands of spots
  const cell = 6, grid = new Map();
  for (const b of blocks) {
    const r = Math.ceil(b[2] / cell);
    const cx = Math.floor(b[0] / cell), cz = Math.floor(b[1] / cell);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const k = (cx + i) * 4096 + (cz + j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(b);
    }
  }
  let tries = 0;
  while (out.length < count && tries++ < count * 4) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const near = grid.get(Math.floor(x / cell) * 4096 + Math.floor(z / cell));
    if (near && near.some((b) => (x - b[0]) ** 2 + (z - b[1]) ** 2 < b[2] * b[2])) continue;
    out.push([x, z, rnd(), rnd()]);
  }
  return out;
}

// --- Motes ----------------------------------------------------------------------------
const MOTE = {
  forest: { color: 0xd8ffb0, size: 0.09, rise: 0.15, glow: 0.7 }, town: { color: 0xffe0a0, size: 0.08, rise: 0.12, glow: 0.6 },
  swamp: { color: 0xb8ffd0, size: 0.1, rise: 0.08, glow: 0.9 }, ash: { color: 0xff8a40, size: 0.08, rise: 0.5, glow: 1 },
  keep: { color: 0xc8c8d8, size: 0.06, rise: 0.05, glow: 0.4 }, frost: { color: 0xffffff, size: 0.09, rise: -0.6, glow: 0.8 },
  desert: { color: 0xf0d8a0, size: 0.06, rise: 0.1, glow: 0.5 }, fungal: { color: 0xd890ff, size: 0.1, rise: 0.2, glow: 1 },
  storm: { color: 0xa8d8ff, size: 0.07, rise: 0.1, glow: 0.7 }, volcano: { color: 0xff6a20, size: 0.1, rise: 0.9, glow: 1.2 },
  astral: { color: 0x9fd0ff, size: 0.1, rise: 0.25, glow: 1.1 },
};
/** Drifting specks around the camera: pollen, embers, snow, spores. Returns { points, update }. */
export function buildMotes(theme, count) {
  const M = MOTE[theme] || MOTE.forest;
  const rnd = makeRnd(theme.length * 31 + 7);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * 50; pos[i * 3 + 1] = rnd() * 6; pos[i * 3 + 2] = (rnd() - 0.5) * 40;
    seed[i] = rnd() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = new THREE.Color(M.color).multiplyScalar(M.glow);
  const mat = new THREE.PointsMaterial({ color: c, size: M.size, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  const update = (dt, cx, cz, t) => {
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      let x = pos[i * 3] + Math.sin(t * 0.4 + s) * dt * 0.4, y = pos[i * 3 + 1] + M.rise * dt * (0.6 + (s % 1)), z = pos[i * 3 + 2] + Math.cos(t * 0.3 + s) * dt * 0.4;
      // keep them in a box around the camera's target
      if (x - cx > 25) x -= 50; else if (x - cx < -25) x += 50;
      if (z - cz > 20) z -= 40; else if (z - cz < -20) z += 40;
      if (y > 6) y -= 6; else if (y < 0) y += 6;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    g.attributes.position.needsUpdate = true;
  };
  return { points, update };
}

// --- Rim light for characters ---------------------------------------------------------
/** Adds a soft edge light to a character material so heroes and enemies read on dark ground. */
export function addRim(material, color = 0x9fb8ff, strength = 0.35) {
  if (material.userData.rim) return material;
  material.userData.rim = true;
  const c = new THREE.Color(color).multiplyScalar(strength);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uRim = { value: c };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float f = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); totalEmissiveRadiance += uRim * pow(f, 3.0); }`);
  };
  material.customProgramCacheKey = () => 'aw-rim';
  return material;
}
