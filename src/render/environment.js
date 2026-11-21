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
  // (0.54.9) for a weak or software-only graphics chip: Low, drawn at a lower resolution and scaled up
  lowest: { shadows: false, grass: 0, pebbles: 0.2, bump: false, octaves: 2, post: false, pixelRatio: 0.6, motes: 0, shadowMap: 512 },
  high: { shadows: true, grass: 1, pebbles: 1, bump: true, octaves: 5, post: true, pixelRatio: 1.75, motes: 260, shadowMap: 2048 },
};

// --- Ground palettes by theme ---------------------------------------------------------
// a: the main ground, b: darker patches, c: worn / dirt patches, top: what settles on rocks
// (moss, ash, snow), crack: veins that glow (with strength), wet: puddles, stones: flagstones.
export const GROUND = {
  town: { path: '#7a6448', a: '#4a6236', b: '#2e3e24', c: '#6a5940', top: '#5a7a3a', grass: ['#4a6a2e', '#86a848'], debris: 'pebble', light: 0xffc890 },
  forest: { path: '#6a5438', a: '#3e5e30', b: '#26381f', c: '#5a4a32', top: '#4a7a36', grass: ['#3a5a26', '#7aa840'], debris: 'pebble', light: 0xffc890 },
  swamp: { path: '#3a3426', poolColor: '#24423e', poolGlow: '#0c2220', a: '#25393a', b: '#121e20', c: '#3a3a2a', top: '#3a5a3a', wet: 0.75, grass: ['#2a4438', '#5a7a4a'], tall: 1.8, debris: 'pebble', light: 0xc8ffd8 },
  ash: { path: '#2e2622', a: '#4a4440', b: '#2a2624', c: '#6e6862', top: '#9a948e', grass: ['#3a302a', '#6a5a48'], dry: true, debris: 'pebble', light: 0xffb070 },
  keep: { path: '#5e5c66', a: '#46464f', b: '#2a2a32', c: '#5a5862', top: '#6a6b74', stones: true, grass: ['#2e3a2a', '#4a5a3a'], sparse: 0.35, debris: 'rubble', light: 0xffc890 },
  frost: { pebbles: 0.25, path: '#7890a4', a: '#8fa6b8', b: '#5c7486', c: '#d6e4ee', top: '#eef6fc', wet: 0.45, bright: 0.55, grass: ['#9ab8c8', '#e0f0f8'], shards: true, sparse: 0.5, debris: 'pebble', light: 0xd8ecff },
  desert: { path: '#8e6a3c', a: '#a8824c', b: '#7e5f36', c: '#c7a46a', top: '#c8a870', ripple: true, bright: 0.7, grass: ['#8a7a3a', '#c4a85a'], dry: true, sparse: 0.25, debris: 'pebble', light: 0xffd8a0 },
  fungal: { path: '#2a2036', poolColor: '#12061c', poolGlow: '#3a1066', crackKind: 2, a: '#33294a', b: '#1a1226', c: '#4a3858', top: '#6a4a7a', crack: ['#c04aff', 0.7], grass: ['#3a2a4a', '#9a5ac0'], caps: true, sparse: 0.3, debris: 'pebble', light: 0xe0b0ff },
  storm: { path: '#5a5e66', a: '#38404c', b: '#20252e', c: '#56606e', top: '#6a7484', grass: ['#3a4448', '#6a7a78'], dry: true, sparse: 0.5, debris: 'rubble', light: 0xc8dcff },
  volcano: { lavaEdge: true, a: '#3a2a26', b: '#1c1210', c: '#4c3630', top: '#5a4038', crack: ['#ff5a14', 2.2], grass: ['#2a1c18', '#4a2a20'], dry: true, sparse: 0.3, debris: 'rubble', light: 0xffa060 },
  astral: { voidEdge: true, poolGlow: '#3a6aff', a: '#201e44', b: '#0e0d24', c: '#2e2c5e', top: '#5a5aa8', crack: ['#6aa8ff', 1.0], grass: ['#3a3a7a', '#8fd8ff'], shards: true, sparse: 0.6, debris: 'pebble', light: 0xb8c8ff },
  // The Deep (0.54): each Primordial's domain, darker than anything above it
  deepash: { path: '#1a1210', a: '#221a16', b: '#0e0a08', c: '#3a2e28', top: '#6a605a', crack: ['#ff4a0a', 2.6], grass: ['#1a1210', '#3a2418'], dry: true, sparse: 0.2, debris: 'rubble', light: 0xff8a50 },
  drowned: { path: '#1a2a2a', poolColor: '#0a2a2e', poolGlow: '#0a4a4a', a: '#16282a', b: '#0a1416', c: '#2a3a36', top: '#3a5a52', wet: 0.95, stones: true, grass: ['#1a3430', '#3a5a4a'], tall: 1.6, sparse: 0.4, debris: 'rubble', light: 0x9ae8e0 },
  rootdeep: { path: '#24180e', poolColor: '#141a08', poolGlow: '#2a4a10', crackKind: 2, a: '#241c12', b: '#120c06', c: '#3a2a18', top: '#4a5a2a', crack: ['#8ad04a', 0.9], grass: ['#2a3418', '#5a7a2a'], tall: 2, debris: 'pebble', light: 0xd8ffa0 },
  choir: { path: '#5a6878', a: '#3a4452', b: '#202832', c: '#6a7a8c', top: '#c8dcf0', crack: ['#9ad0ff', 1.2], grass: ['#5a6a7a', '#c8e0f8'], shards: true, sparse: 0.3, debris: 'rubble', light: 0xd8ecff },
  // Caelum (0.64): pale stone paving above the clouds, gold in the joints
  caelum: { voidEdge: true, path: '#e8e0cc', a: '#b8b0a0', b: '#8a8478', c: '#d0c8b8', top: '#f4efe4', crack: ['#e8b850', 0.8], grass: ['#c8c0a8', '#f0e8d0'], stones: true, sparse: 0.25, debris: 'rubble', light: 0xfff2d8 },
  quiet: { voidEdge: true, a: '#16141a', b: '#08070a', c: '#222028', top: '#3a3842', grass: ['#18161c', '#2a2830'], dry: true, sparse: 0.1, debris: 'pebble', light: 0x8a84a0 },
  // Asterfell (0.39): paved streets of the Queen's city, star-glass glowing gold in the cracks.
  // The Shattered Wilds (0.41): drawn per region (see biomes.js shardField); these are the verdant pieces.
  shattered: { path: '#5a4a3a', a: '#3e5a30', b: '#26381f', c: '#5a4a32', top: '#4a7a36', grass: ['#3a5a26', '#7aa840'], sparse: 0.5, debris: 'rubble', light: 0xd8c8ff },
  glass: { paving: true, crackKind: 3, a: '#988266', b: '#6a5844', c: '#b49c7c', top: '#c4ae8c', stones: true, crack: ['#ffd27a', 0.8], grass: ['#a08a4a', '#e0c070'], shards: true, sparse: 0.2, debris: 'rubble', light: 0xffd8a0 },
};

// Each map's mood (0.34.1): bright daylight for the cheerful places, dusk for the uneasy ones,
// night only where it belongs. sky/sun/hero: light strengths; haze: how far the fog sits;
// vignette and bloom: the High setting's grade.
export const MOODS = {
  day: { sky: 1.85, skyTint: 0xd0e2ff, bounce: 0x6a5a3e, sun: 3.5, sunColor: 0xfff2dc, hero: 6, haze: 0xa9bfcc, hazeMix: 0.8, near: 50, far: 140, vignette: 0.14, bloom: 0.3 },
  dusk: { sky: 1.0, skyTint: 0xb4c4ff, bounce: 0x3a2a24, sun: 2.5, sunColor: 0xffd8b0, hero: 34, haze: 0x6a6070, hazeMix: 0.35, near: 40, far: 110, vignette: 0.24, bloom: 0.45 },
  // Asterfell: warm light through the sand overhead, a city on its happiest day.
  amber: { sky: 1.2, skyTint: 0xf2e0c8, bounce: 0x5a4632, sun: 2.6, sunColor: 0xffdcaa, hero: 14, haze: 0xb49a7a, hazeMix: 0.55, near: 46, far: 130, vignette: 0.2, bloom: 0.42 },
  // The Wilds (0.41): a torn violet dusk.
  rift: { sky: 1.05, skyTint: 0xc8b4ff, bounce: 0x2a2030, sun: 2.4, sunColor: 0xffe2d0, hero: 30, haze: 0x4a3a66, hazeMix: 0.45, near: 44, far: 120, vignette: 0.24, bloom: 0.5 },
  // Warden's Keep (0.41): cold moonlight over the ruins, so the stones read.
  moon: { sky: 1.35, skyTint: 0xa8bcff, bounce: 0x22222c, sun: 2.4, sunColor: 0xc8d8ff, hero: 30, haze: 0x3a4258, hazeMix: 0.5, near: 40, far: 112, vignette: 0.26, bloom: 0.4 },
  night: { sky: 0.75, skyTint: 0x9db4ff, bounce: 0x1a1414, sun: 2.1, sunColor: 0xffe0c0, hero: 70, haze: 0x000000, hazeMix: 0, near: 34, far: 92, vignette: 0.32, bloom: 0.55 },
};
export const THEME_MOOD = { shattered: 'rift', town: 'day', forest: 'day', swamp: 'dusk', ash: 'dusk', keep: 'moon', frost: 'day', desert: 'day', fungal: 'night', storm: 'dusk', volcano: 'night', astral: 'night', glass: 'amber', deepash: 'night', drowned: 'night', rootdeep: 'night', choir: 'moon', quiet: 'night', caelum: 'amber' };

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
 * extra (0.41): mask (paths, pools, seams; see groundMask), shards (the Wilds' regions),
 * clock (shared time, for water and lava).
 */
export function groundMaterial(theme, radius, quality, extra = {}) {
  const P = GROUND[theme] || GROUND.forest;
  const Q = QUALITY[quality] || QUALITY.high;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const crack = P.crack ? col(P.crack[0]).multiplyScalar(P.crack[1]) : new THREE.Color(0, 0, 0);
  const mask = extra.mask || null;
  const POOL = { water: 1, ice: 2, glow: 3, void: 4 }[extra.pool] || 0;
  const SH = extra.shards ? 1 : 0;
  const pal = (k) => (GROUND[k] ? [col(GROUND[k].a), col(GROUND[k].b), col(GROUND[k].c)] : [col(0), col(0), col(0)]);
  const uniforms = {
    uA: { value: col(P.a) }, uB: { value: col(P.b) }, uC: { value: col(P.c) },
    uCrack: { value: crack }, uWet: { value: P.wet || 0 }, uR: { value: radius },
    uStones: { value: P.stones ? 1 : 0 }, uRipple: { value: P.ripple ? 1 : 0 },
    uMask: { value: mask ? mask.texture : null }, uExt: { value: mask ? mask.ext : 1 },
    uShards: { value: extra.shards ? extra.shards.texture : null },
    uPath: { value: col(P.path || P.c) }, uPathAmt: { value: P.path ? 1 : 0 },
    uPoolCol: { value: col(P.poolColor || '#0e2224') }, uPoolGlow: { value: col(P.poolGlow || '#000000') },
    uTime: extra.clock || { value: 0 },
    uFz: { value: pal('frost') }, uSd: { value: pal('desert') }, uEm: { value: pal('ash') },
    uSeam: { value: col('#b07aff').multiplyScalar(1.6) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.defines = Object.assign(sh.defines || {}, {
      AW_OCT: Q.octaves, AW_BUMP: Q.bump ? 1 : 0, AW_CRACK: P.crack ? P.crackKind || 1 : 0, AW_STONES: P.stones ? (P.paving ? 2 : 1) : 0,
      AW_MASK: mask ? 1 : 0, AW_POOL: POOL, AW_SHARDS: SH, AW_LAVA: P.lavaEdge ? 1 : 0, AW_VOIDEDGE: P.voidEdge ? 1 : 0,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAwPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAwPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vAwPos;
uniform vec3 uA, uB, uC, uCrack, uPath, uPoolCol, uPoolGlow, uSeam;
uniform vec3 uFz[3], uSd[3], uEm[3];
uniform float uWet, uR, uStones, uRipple, uExt, uPathAmt, uTime;
uniform sampler2D uMask, uShards;
${NOISE_GLSL}
float awWet, awPool, awRough, awSeam, awStoneEdge;
vec3 awEmit;`)
      .replace('#include <map_fragment>', `
  vec2 wp = vAwPos;
  awEmit = vec3(0.0); awPool = 0.0; awRough = -1.0; awSeam = 0.0; awStoneEdge = 1.0;
  float n1 = awFbm(wp * 0.035);
  float n2 = awFbm(wp * 0.17 + 13.0);
  float grain = awNoise(wp * 2.3) * 0.6 + awNoise(wp * 7.1) * 0.4;
  vec3 pA = uA, pB = uB, pC = uC;
#if AW_SHARDS == 1
  {
    // The Wilds: pieces of four lands; the shard texture holds how much of each is here.
    vec3 w = texture2D(uShards, wp / (2.0 * uExt) + 0.5).rgb;
    float w0 = clamp(1.0 - w.r - w.g - w.b, 0.0, 1.0);
    pA = uA * w0 + uFz[0] * w.r + uSd[0] * w.g + uEm[0] * w.b;
    pB = uB * w0 + uFz[1] * w.r + uSd[1] * w.g + uEm[1] * w.b;
    pC = uC * w0 + uFz[2] * w.r + uSd[2] * w.g + uEm[2] * w.b;
  }
#endif
  vec3 gcol = mix(pA, pB, smoothstep(0.38, 0.72, n1));
  gcol = mix(gcol, pC, smoothstep(0.56, 0.78, n2) * 0.85);
  gcol *= 0.78 + 0.36 * grain;
#if AW_STONES == 1
  {
    // flagstones: irregular cells
    float e = awCells(wp * 0.55);
    awStoneEdge = e;
    gcol *= mix(0.45, 1.0, smoothstep(0.02, 0.09, e));
    gcol *= 0.85 + 0.3 * awHash(floor(wp * 0.55));
  }
#elif AW_STONES == 2
  {
    // paving: long cut stones in offset rows (Asterfell's streets)
    vec2 sp = wp * vec2(0.62, 0.95);
    sp.x += floor(sp.y) * 0.5;
    vec2 f = fract(sp);
    float e = min(min(f.x, 1.0 - f.x) / 0.62, min(f.y, 1.0 - f.y) / 0.95);
    awStoneEdge = e;
    gcol *= mix(0.5, 1.0, smoothstep(0.03, 0.1, e));
    gcol *= 0.86 + 0.26 * awHash(floor(sp));
    gcol *= 0.92 + 0.12 * awNoise(wp * 3.0);
  }
#endif
  if (uRipple > 0.5) gcol *= 0.9 + 0.12 * sin(wp.x * 2.2 + wp.y * 0.9 + n1 * 14.0);
  awWet = uWet * smoothstep(0.62, 0.7, n1);
  gcol = mix(gcol, gcol * 0.45, awWet);
#if AW_MASK == 1
  {
    vec4 mk = texture2D(uMask, wp / (2.0 * uExt) + 0.5);
    // Paths (0.41): worn ground from each way in toward the heart of the map.
    float path = smoothstep(0.28, 0.7, mk.r + (awNoise(wp * 0.8) - 0.5) * 0.45) * uPathAmt;
    gcol = mix(gcol, uPath * (0.82 + 0.3 * grain), path * 0.9);
    // Pools: still water, ice, glowing spore-water or holes into the stars.
    awPool = smoothstep(0.42, 0.62, mk.g + (awNoise(wp * 1.1) - 0.5) * 0.18);
    float shore = smoothstep(0.18, 0.45, mk.g) * (1.0 - awPool);
    gcol = mix(gcol, gcol * 0.55, shore);
    awSeam = mk.b;
  }
#endif
  float rr = length(wp) / uR;
#if AW_LAVA == 1
  {
    // A sea of lava beyond the edge (the Maw).
    float lv = smoothstep(1.06, 1.14, rr + (awNoise(wp * 0.3) - 0.5) * 0.06);
    float flow = awFbm(wp * 0.12 + vec2(uTime * 0.05, uTime * 0.031));
    float crust = smoothstep(0.42, 0.58, flow);
    vec3 hot = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.25), smoothstep(0.55, 0.85, flow));
    gcol = mix(gcol * mix(1.0, 0.3, smoothstep(0.97, 1.06, rr)), vec3(0.05, 0.02, 0.02), lv * (1.0 - crust));
    awEmit += hot * 2.4 * lv * crust;
    awPool = max(awPool, lv);
  }
#elif AW_VOIDEDGE == 1
  {
    // The ground simply ends: beyond it, stars (the Sanctum).
    float vd = smoothstep(1.03, 1.1, rr + (awNoise(wp * 0.4) - 0.5) * 0.05);
    gcol = mix(gcol * mix(1.0, 0.4, smoothstep(0.96, 1.03, rr)), vec3(0.01, 0.01, 0.03), vd);
    vec2 sc = floor(wp * 3.0);
    float star = step(0.986, awHash(sc)) * (0.6 + 0.4 * sin(uTime * 2.0 + awHash(sc + 3.0) * 30.0));
    awEmit += vec3(0.7, 0.8, 1.0) * star * vd * 1.5;
    awEmit += vec3(0.25, 0.4, 1.0) * (smoothstep(1.0, 1.04, rr) - smoothstep(1.04, 1.1, rr)) * 0.8;
  }
#else
  gcol *= mix(1.0, 0.28, smoothstep(0.97, 1.08, rr));
#endif
#if AW_POOL == 1
  {
    // water: dark, a little green, taking the sky
    vec3 wc = uPoolCol * (0.85 + 0.2 * awNoise(wp * 0.5 + uTime * 0.05));
    gcol = mix(gcol, wc, awPool);
    awEmit += uPoolGlow * awPool;
  }
#elif AW_POOL == 2
  {
    // ice: pale and smooth, with white fractures
    float e = awCells(wp * 0.7 + 5.0);
    vec3 ic = mix(vec3(0.62, 0.8, 0.9), vec3(0.85, 0.94, 1.0), awNoise(wp * 0.4)) * mix(1.25, 1.0, smoothstep(0.0, 0.05, e));
    gcol = mix(gcol, ic, awPool);
  }
#elif AW_POOL == 3
  {
    // glowing spore-water
    float pulse = 0.65 + 0.35 * sin(uTime * 1.3 + awNoise(wp * 0.6) * 6.0);
    gcol = mix(gcol, uPoolCol, awPool);
    awEmit += uPoolGlow * awPool * pulse * (0.7 + 0.5 * awNoise(wp * 2.0 + uTime * 0.2));
  }
#elif AW_POOL == 4
  {
    // a hole into the stars
    gcol = mix(gcol, vec3(0.01, 0.01, 0.03), awPool);
    vec2 sc = floor(wp * 4.0);
    float star = step(0.975, awHash(sc)) * (0.6 + 0.4 * sin(uTime * 2.5 + awHash(sc + 7.0) * 40.0));
    awEmit += vec3(0.75, 0.85, 1.0) * star * awPool * 1.6;
    awEmit += uPoolGlow * (smoothstep(0.2, 0.5, awPool) - smoothstep(0.6, 1.0, awPool)) * 1.4;
  }
#endif
  diffuseColor.rgb *= gcol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.18, awWet);
#if AW_POOL == 1 || AW_POOL == 2 || AW_POOL == 3
  roughnessFactor = mix(roughnessFactor, (AW_POOL == 2 ? 0.14 : 0.06), awPool);
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if AW_BUMP == 1
  {
    float h0 = awNoise(vAwPos * 1.3) + 0.5 * awNoise(vAwPos * 4.1);
    float hx = awNoise((vAwPos + vec2(0.06, 0.0)) * 1.3) + 0.5 * awNoise((vAwPos + vec2(0.06, 0.0)) * 4.1);
    float hz = awNoise((vAwPos + vec2(0.0, 0.06)) * 1.3) + 0.5 * awNoise((vAwPos + vec2(0.0, 0.06)) * 4.1);
    float k = 2.2 * (1.0 - awWet) * (1.0 - awPool);
    vec3 nw = normalize(vec3(-(hx - h0) / 0.06 * k * 0.08, 1.0, -(hz - h0) / 0.06 * k * 0.08));
#if AW_POOL == 1 || AW_POOL == 3
    // ripples on still water
    vec2 rp = vAwPos * 1.7 + vec2(uTime * 0.35, uTime * 0.21);
    vec2 rq = vAwPos * 2.9 - vec2(uTime * 0.27, -uTime * 0.31);
    vec2 rip = vec2(awNoise(rp) - awNoise(rp + vec2(0.3, 0.0)), awNoise(rp) - awNoise(rp + vec2(0.0, 0.3))) + 0.6 * vec2(awNoise(rq) - awNoise(rq + vec2(0.3, 0.0)), awNoise(rq) - awNoise(rq + vec2(0.0, 0.3)));
    nw = normalize(mix(nw, normalize(vec3(rip.x * 0.9, 1.0, rip.y * 0.9)), awPool));
#endif
    normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
  }
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += awEmit;
#if AW_SHARDS == 1
  // the seams where the lands broke apart glow violet, flickering
  totalEmissiveRadiance += uSeam * smoothstep(0.35, 0.9, awSeam) * (0.6 + 0.4 * sin(uTime * 1.7 + vAwPos.x * 0.2 + vAwPos.y * 0.13));
#endif
#if AW_CRACK == 1
  {
    // Cracked earth: thin glowing seams along cell edges, only in some patches (the Maw, the Sanctum).
    vec2 cp = vAwPos * 0.3 + 7.0 + vec2(awNoise(vAwPos * 0.21), awNoise(vAwPos * 0.21 + 9.0)) * 1.6;
    float e = awCells(cp);
    float width = 0.012 + 0.04 * awNoise(vAwPos * 0.4 + 3.0);
    float line = 1.0 - smoothstep(0.0, width, e);
    float mask = smoothstep(0.56, 0.68, awFbm(vAwPos * 0.045 + 23.0));
    float pulse = 0.7 + 0.3 * awNoise(vAwPos * 0.6 + uTime * 0.15);
    totalEmissiveRadiance += uCrack * line * mask * pulse * smoothstep(1.02, 0.95, length(vAwPos) / uR) * (1.0 - awPool);
  }
#elif AW_CRACK == 2
  {
    // Mycelium: thin glowing threads wandering through the soil (Gloomcap).
    float t = abs(awNoise(vAwPos * 0.45 + vec2(awNoise(vAwPos * 0.13) * 3.0)) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.025, t);
    float mask = smoothstep(0.45, 0.7, awFbm(vAwPos * 0.05 + 4.0));
    totalEmissiveRadiance += uCrack * line * mask * (0.6 + 0.4 * sin(uTime * 0.9 + vAwPos.x * 0.3)) * (1.0 - awPool);
  }
#elif AW_CRACK == 3
  {
    // Star-glass in the joints between paving stones (Asterfell), brighter in some streets.
    float line = 1.0 - smoothstep(0.0, 0.05, awStoneEdge);
    float mask = smoothstep(0.5, 0.7, awFbm(vAwPos * 0.06 + 11.0));
    totalEmissiveRadiance += uCrack * line * mask * (0.75 + 0.25 * sin(uTime * 0.8 + awHash(floor(vAwPos)) * 6.0));
  }
#endif`);
  };
  m.customProgramCacheKey = () => `aw-ground-${Q.octaves}-${Q.bump}-${P.crack ? P.crackKind || 1 : 0}-${P.stones ? (P.paving ? 2 : 1) : 0}-${!!mask}-${POOL}-${SH}-${!!P.lavaEdge}-${!!P.voidEdge}`;
  return m;
}

/**
 * The ground's mask (0.41), painted once per map: R = paths, G = pools, B = the Wilds' seams.
 * shards (the Wilds only): a second texture, R/G/B = frozen / sands / ember (verdant is the rest).
 */
export function groundMask(map, { pools = [], field = null, poolRadius = null, paths = true } = {}) {
  const N = map.radius > 70 ? 1024 : 512;
  const ext = map.radius + 45;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  const px = (v) => ((v / ext) * 0.5 + 0.5) * N;
  const sc = N / (2 * ext);
  g.globalCompositeOperation = 'lighter';
  if (paths && map.portals && map.portals.length) {
    const rnd = makeRnd(map.id.length * 59 + 7);
    const stroke = (pts, w) => {
      for (const [k, a] of [[1.5, 0.25], [1.0, 0.45], [0.6, 0.6]]) {
        g.strokeStyle = `rgba(255,0,0,${a})`;
        g.lineWidth = w * k * sc;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))));
        g.stroke();
      }
    };
    const wander = (x0, z0, x1, z1, w) => {
      const pts = [];
      const len = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const ph = rnd() * 6, amp = Math.min(5, len * 0.12);
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, side = Math.sin(t * Math.PI * 1.6 + ph) * amp * Math.sin(t * Math.PI);
        pts.push([x0 + (x1 - x0) * t + nx * side, z0 + (z1 - z0) * t + nz * side]);
      }
      stroke(pts, w);
    };
    const hub = map.safe ? 9 : 0;
    if (map.road) {
      // (0.64) a laid road from the way in to the far end, and narrower side paths off it
      stroke(map.road, 4.4);
      for (const sp of map.sidePaths || []) stroke(sp, 2.6);
    }
    for (const p of map.road ? [] : map.portals) {
      const d = Math.hypot(p.x, p.z) || 1;
      const endD = map.safe ? hub : 4;
      wander(p.x, p.z, (p.x / d) * endD, (p.z / d) * endD, map.safe ? 2.6 : 3.2);
    }
    for (const w of map.waystones || []) {
      const d = Math.hypot(w.x, w.z) || 1;
      if (d > 12) wander(w.x, w.z, (w.x / d) * 6, (w.z / d) * 6, 2.2);
    }
  }
  // pools: soft blobs in green
  for (const p of pools) {
    for (const [k, a] of [[1.12, 0.35], [1.0, 0.5], [0.85, 0.6]]) {
      g.fillStyle = `rgba(0,255,0,${a})`;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const ang = (i / 40) * Math.PI * 2, r = poolRadius(p, ang) * k;
        const x = px(p.x + Math.cos(ang) * r), z = px(p.z + Math.sin(ang) * r);
        i ? g.lineTo(x, z) : g.moveTo(x, z);
      }
      g.fill();
    }
  }
  let shards = null;
  if (field) {
    // per texel: which land, and how close to a seam
    const img = g.getImageData(0, 0, N, N);
    const sv = document.createElement('canvas');
    const S = 256;
    sv.width = sv.height = S;
    const sg = sv.getContext('2d');
    const simg = sg.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = ((i + 0.5) / S - 0.5) * 2 * ext, z = ((j + 0.5) / S - 0.5) * 2 * ext;
      const { k } = field.at(x, z);
      const o = (j * S + i) * 4;
      simg.data[o] = k === 1 ? 255 : 0;
      simg.data[o + 1] = k === 2 ? 255 : 0;
      simg.data[o + 2] = k === 3 ? 255 : 0;
      simg.data[o + 3] = 255;
    }
    sg.putImageData(simg, 0, 0);
    // soften the borders between lands
    const sv2 = document.createElement('canvas');
    sv2.width = sv2.height = S;
    const sg2 = sv2.getContext('2d');
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      sg2.globalAlpha = 1 / (dy * dy + dx * dx + 1) / 6;
      sg2.globalCompositeOperation = 'lighter';
      sg2.drawImage(sv, dx, dy);
    }
    const tex = new THREE.CanvasTexture(sv2);
    tex.flipY = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    shards = { texture: tex };
    // the seams, in blue on the mask
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * 2 * ext, z = ((j + 0.5) / N - 0.5) * 2 * ext;
      if (x * x + z * z > (map.radius + 3) ** 2) continue;
      const { seam } = field.at(x, z);
      const v = Math.max(0, 1 - seam / 1.4);
      img.data[(j * N + i) * 4 + 2] = Math.round(v * v * 255);
    }
    g.putImageData(img, 0, 0);
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  // read back once, so ground cover can stay off the paths and out of the pools
  const data = g.getImageData(0, 0, N, N).data;
  const sample = (x, z) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor(px(x)))), j = Math.min(N - 1, Math.max(0, Math.floor(px(z))));
    const o = (j * N + i) * 4;
    return { path: data[o] / 255, pool: data[o + 1] / 255 };
  };
  return { texture, ext, shards, sample };
}

// --- Small seeded noise for shaping meshes --------------------------------------------
export function makeRnd(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
export function noise3(x, y, z) {
  // Cheap smooth 3D noise from a few sines; plenty for bumping rocks and leaves.
  return (Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 - x * 0.7) + Math.sin(y * 3.1 + z * 2.7) * 0.5 + Math.sin(x * 4.3 - z * 3.9 + y) * 0.25) / 1.75;
}

/** A smooth, lumpy geometry: welded, pushed out along its normals by noise, then re-shaded. */
export function lumpy(geo, amount, freq, seed = 0) {
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
export function paint(geo, base, top, { aoFrom = null, aoTo = null, topAmt = 0.65, ao = 0.45 } = {}) {
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
  swamp: { color: 0xb8ffd0, size: 0.1, rise: 0.08, glow: 0.9 }, ash: { color: 0x9a948e, size: 0.1, rise: -0.45, glow: 0.55, wind: 0.8, normal: true },
  keep: { color: 0xc8c8d8, size: 0.06, rise: 0.05, glow: 0.4 }, frost: { color: 0xffffff, size: 0.11, rise: -0.9, glow: 0.8, wind: 0.6 },
  desert: { color: 0xe8c890, size: 0.05, rise: 0.05, glow: 0.45, wind: 5 }, fungal: { color: 0xd890ff, size: 0.1, rise: 0.2, glow: 1 },
  storm: { color: 0xa8d8ff, size: 0.07, rise: 0.1, glow: 0.7 }, volcano: { color: 0xff6a20, size: 0.1, rise: 0.9, glow: 1.2 },
  astral: { color: 0x9fd0ff, size: 0.1, rise: 0.25, glow: 1.1 },
  glass: { color: 0xffe8a8, size: 0.07, rise: 0.05, glow: 1.1 },
  shattered: { color: 0xc8a8ff, size: 0.08, rise: 0.3, glow: 1.1 },
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
  // (falling ash is grey, not glowing: drawn normally rather than added as light)
  const mat = new THREE.PointsMaterial({ color: c, size: M.size, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, blending: M.normal ? THREE.NormalBlending : THREE.AdditiveBlending, fog: true });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  const update = (dt, cx, cz, t) => {
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      let x = pos[i * 3] + Math.sin(t * 0.4 + s) * dt * 0.4 + (M.wind || 0) * dt * (0.7 + (s % 0.6)), y = pos[i * 3 + 1] + M.rise * dt * (0.6 + (s % 1)), z = pos[i * 3 + 2] + Math.cos(t * 0.3 + s) * dt * 0.4;
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

// --- Rain --------------------------------------------------------------------------
/** Slanting rain around the camera (Stormspire, 0.41). Returns { lines, update }. */
export function buildRain(count) {
  const rnd = makeRnd(4242);
  const pos = new Float32Array(count * 6);
  const head = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { head[i * 3] = (rnd() - 0.5) * 50; head[i * 3 + 1] = rnd() * 14; head[i * 3 + 2] = (rnd() - 0.5) * 40; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x9ab4d0, transparent: true, opacity: 0.35, depthWrite: false, fog: true });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  const fall = 26, drift = 6;
  const update = (dt, cx, cz) => {
    for (let i = 0; i < count; i++) {
      let x = head[i * 3] + drift * dt, y = head[i * 3 + 1] - fall * dt, z = head[i * 3 + 2];
      if (y < 0) { y += 14; x = cx + (Math.random() - 0.5) * 50; z = cz + (Math.random() - 0.5) * 40; }
      if (x - cx > 25) x -= 50; else if (x - cx < -25) x += 50;
      if (z - cz > 20) z -= 40; else if (z - cz < -20) z += 40;
      head[i * 3] = x; head[i * 3 + 1] = y; head[i * 3 + 2] = z;
      const o = i * 6;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x - drift * 0.03; pos[o + 4] = y + fall * 0.03; pos[o + 5] = z;
    }
    g.attributes.position.needsUpdate = true;
  };
  return { lines, update };
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
