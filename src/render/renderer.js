// Draws the World with Three.js. It only reads simulation state and reacts to
// events; it never changes the game. Everything visual (camera, models,
// attack telegraphs, particles) lives here.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { RARITIES } from '../sim/items.js';
import { buildVillager, VILLAGER_KINDS } from './keepmodels.js'; // (0.81.1)
import { benchSpots, villagerRole, stepVillager, heroDay } from './village.js'; // (0.91)
import { buildHero, buildEnemy, buildNpc, buildSign, buildGlimmer, buildBoard, buildAltar } from './models.js';
import { creatureSpec, loadCreature, makeCreature, attackKind, PEOPLE, modelsFor, VILLAGER_PEOPLE } from './creatures.js';
import { MAPS } from '../sim/maps.js';
import { ENEMIES } from '../sim/defs.js';
import { AFFIXES, CAELUM, animusShort } from '../sim/endgame.js';
import { GLOWS } from '../sim/cosmetics.js';
import { NPCS } from '../sim/story.js';
import { buildBiome, biomeMaterials, lookOf, BIOMES, poolRadius } from './biomes.js';
import { QUALITY, GROUND, MOODS, THEME_MOOD, groundMaterial, groundMask, buildRain, pebbleGeometry, tuftGeometry, swayMaterial, scatterSpots, buildMotes, addRim } from './environment.js';
import { PostFX } from './postfx.js';
import { eternalForm } from '../sim/eternal.js';
import { upgradeHero, heroLook, loadRigged, loadWeapon, instantiate, RIGGED , setWeaponLook, weaponLook, hideWhileLoading, preload } from './rigged.js';
import { propInstances, PROPS } from './props.js';
import { SlashTrail } from './slash.js';

const R = CONFIG.ARENA_RADIUS;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const SET_COLOR = 0x6fe08a; // set pieces (0.29)
/** What an enemy's attack is made of (0.44): its trail, its pool, its burst. */
const FX_COLOR = { fever: 0x9cff4a, spore: 0xc07aff, ember: 0xff7a2a, frost: 0x9fe6ff, storm: 0xbfd8ff, star: 0x7ff5e1, gold: 0xffd27a, tears: 0x8fd0ff, iron: 0xc9c4b0, glass: 0xffe0a0, rot: 0x7a8a3a, oath: 0xa98bff, sand: 0xe0c070, ash: 0x8a6a5a, hush: 0x2a2440 };

const COLORS = {
  parry: 0x9fe8ff,
  parryable: 0xffe2a0, // attacks you can parry are drawn in pale gold
  cue: 0xffffff, // ... and turn white at the moment to press parry
  danger: 0xff3b4a, // attacks you must avoid are red
  doom: 0xa64bff, // Doom: a share of your health that nothing reduces (0.28)
  dominion: 0xff6a00, // (0.64) the Granted's Dominions: deep amber, drawn heavier, white at the moment to press
  friendly: 0x7fd8ff,
  ember: 0xff8a3a,
  immortal: 0xffd24a, // matches the Immortal rarity colour (radiant gold since 0.43)
};

// Colours for each kind of exploration map (see sim/maps.js).
const MAP_THEMES = {
  town: { deep: 0.6, ground: '#33483a', hue: 130, sky: 0x0e1620, tree: 0x2a5a3e, trunk: 0x3b2c22, rock: 0x5a5d68, edge: 0x1c2420 },
  forest: { deep: 0.62, ground: '#2c4a34', hue: 125, sky: 0x0c1814, tree: 0x1f5133, trunk: 0x3b2c22, rock: 0x4a4d5a, edge: 0x16201a },
  swamp: { ground: '#223c3e', hue: 178, sky: 0x08141a, tree: 0x2a5560, trunk: 0x24262c, rock: 0x3a4a4c, edge: 0x101c1e },
  ash: { ground: '#4a3c36', hue: 16, sky: 0x1a100e, tree: 0x6a4230, trunk: 0x2a1c18, rock: 0x6a5850, edge: 0x1c1412 },
  keep: { ground: '#32323e', hue: 238, sky: 0x0a0a12, tree: 0x34344a, trunk: 0x1c1c26, rock: 0x585b6a, edge: 0x12121a },
  // crown: the shape on top of each "tree". glow: rocks or crowns that give off light.
  frost: { ground: '#6f8799', hue: 205, light: 42, sky: 0x1a2a3a, tree: 0xdcecf5, trunk: 0x4a4038, rock: 0x9ad4f0, edge: 0x3a5060, rockGlow: 0x2a6a9a, glossGlow: 0x1a3a5a },
  desert: { deep: 0.85, ground: '#b08a52', hue: 36, light: 48, sky: 0x2a1c14, tree: 0x5a8a4a, trunk: 0x4a7a40, rock: 0xb07a4a, edge: 0x5a4028, crown: 'cactus' },
  fungal: { ground: '#2a2238', hue: 280, sky: 0x0c0814, tree: 0xb44a9a, trunk: 0xd8cfc0, rock: 0x4a3a5a, edge: 0x140c1c, crown: 'cap', crownGlow: 0x5a1a4a },
  storm: { ground: '#3a4250', hue: 215, sky: 0x10141e, tree: 0x4a5a6a, trunk: 0x2a2e38, rock: 0x6a7484, edge: 0x1a1e28, crown: 'spike' },
  volcano: { ground: '#241a1a', hue: 8, sky: 0x180806, tree: 0x1a1414, trunk: 0x100c0c, rock: 0x2a1a18, edge: 0x100808, crown: 'spike', rockGlow: 0xc23a0c },
  astral: { ground: '#1c1a3a', hue: 250, sky: 0x06061a, tree: 0x8fe8ff, trunk: 0x2a2a5a, rock: 0x3a3a7a, edge: 0x0c0c24, crown: 'crystal', crownGlow: 0x2a8aa8, rockGlow: 0x2a2a8a, glossGlow: 0x1a5a8a },
  // Asterfell (0.39): sandstone, and spires of gold star-glass where trees would be.
  glass: { ground: '#988266', hue: 36, light: 44, sky: 0x2a1a0c, tree: 0xffe2a0, trunk: 0xc8a060, rock: 0xd8b070, edge: 0x6a4a28, crown: 'crystal', crownGlow: 0xc89030, rockGlow: 0x8a6020, glossGlow: 0x8a5a14 },
  // The Deep (0.54): each Primordial's domain
  deepash: { ground: '#1e1612', hue: 14, sky: 0x0a0504, tree: 0x2a1a14, trunk: 0x140c0a, rock: 0x3a2620, edge: 0x0a0606, crown: 'spike', rockGlow: 0xff5a1a, glossGlow: 0x6a1a08 },
  drowned: { ground: '#14262a', hue: 188, sky: 0x040c10, tree: 0x1a3a40, trunk: 0x0c1a1c, rock: 0x2a4a50, edge: 0x060e10, rockGlow: 0x1a6a6a, glossGlow: 0x0a3a3a },
  rootdeep: { ground: '#1e1a10', hue: 70, sky: 0x080804, tree: 0x3a4a1a, trunk: 0x2a1e12, rock: 0x3a3420, edge: 0x0a0806, crown: 'cap', crownGlow: 0x6aa04a },
  choir: { ground: '#2a3038', hue: 205, light: 40, sky: 0x0c1018, tree: 0xd8eaff, trunk: 0x8aa0b8, rock: 0xa8c0d8, edge: 0x141a22, crown: 'crystal', crownGlow: 0x6a9ac8, glossGlow: 0x3a5a7a },
  quiet: { ground: '#18161e', hue: 260, sky: 0x020204, tree: 0x2a2830, trunk: 0x14121a, rock: 0x2a2832, edge: 0x040406, crown: 'spike', glossGlow: 0x14102a },
  // Caelum (0.64): white stone and gold above the clouds; 'rocks' are cloud banks, 'trees' gold spires
  caelum: { ground: '#bdb6a6', hue: 42, light: 58, sky: 0x8a96aa, tree: 0xffe8b0, trunk: 0xe8dcc0, rock: 0xf4f0ea, edge: 0x9aa4b8, crown: 'crystal', crownGlow: 0xc8a050, glossGlow: 0x8a7040 },
  // The Shattered Wilds (0.41): pieces of four lands, with violet light in the seams between them.
  shattered: { ground: '#3a3a30', hue: 270, sky: 0x120c1c, tree: 0x3a5a2a, trunk: 0x3a2c22, rock: 0x5a5466, edge: 0x140c1c, glossGlow: 0x3a1a6a },
};
/** Split scattered spots ([x, z, ...]) into square sectors of `size` metres. */
function bySector(spots, size) {
  const m = new Map();
  for (const sp of spots) {
    const k = Math.floor(sp[0] / size) * 4096 + Math.floor(sp[1] / size);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(sp);
  }
  return [...m.values()];
}
function makeSeeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** (0.83) How often each of the keep's heroes strikes (their basic swing is timed to it). */
const dCosR = Math.cos, dSinR = Math.sin; // (0.85) (rendering only: Math is fine outside the sim)
/** (0.84) Which clip each of the Tide's own plays when it strikes. */
const TIDE_KIND = { veilbearer: 'cast', mourner: 'cast', gatebreaker: 'chop', echo: 'fire', tidecaller: 'slash', rotmother: 'chop' };
const TROOP_AS = { warrior: 1, archer: 1 / 0.9, mage: 1 / 1.3, rogue: 1 / 0.55 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d16);
    this.scene.fog = new THREE.Fog(0x0a0d16, 42, 90);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
    this.camOffset = new THREE.Vector3(0, 23, 15.5);
    this.camTarget = new THREE.Vector3();
    this.zoom = 1;
    this.shake = 0;
    // (0.85) over the shoulder, while incarnate: on (wanted), k (0..1, eased), yaw (the way you face, as the
    // game's angles: 0 is +x, toward +z), pitch (0 looks far ahead, 1 at your feet)
    this.shoulder = { on: false, k: 0, yaw: -Math.PI / 2, pitch: 0.45 };

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
    this.ndc = new THREE.Vector2();

    this.views = new Map(); // enemy id -> view
    this.projViews = new Map();
    this.lootViews = new Map();
    this.teleViews = new Map();
    this.corpses = [];
    this.flashes = [];
    this.geoCache = new Map();
    this.time = 0;
    this.quality = 'high'; // graphics quality (0.34): low | medium | high, see environment.js
    this.windClock = { value: 0 }; // shared by everything that sways
    this.post = null;
    this.hoverId = null;

    this.buildLights();
    this.buildArena();
    this.buildHero();
    this.buildParticles();
    this.buildMarkers();
    this.resize();
  }

  // -------------------------------------------------------------------------
  // Scene setup
  // -------------------------------------------------------------------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x9db4ff, 0x241a20, 1.15);
    this.scene.add(this.hemi);
    // A warm light carried by the hero (0.34): the world is darker, and lit around you.
    this.heroLight = new THREE.PointLight(0xffc890, 0, 30, 1.4);
    this.scene.add(this.heroLight);
    const sun = (this.sun = new THREE.DirectionalLight(0xffe6c4, 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -24;
    c.right = 24;
    c.top = 24;
    c.bottom = -24;
    c.near = 1;
    c.far = 90;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
  }

  /**
   * Graphics quality (0.34): shadows, ground detail, grass, bloom and resolution.
   * Rebuilds the current map's scenery so the change shows at once. Drawing only.
   */
  /**
   * (0.54.9) Is the browser drawing without the graphics chip (hardware acceleration off, or the chip
   * blocked)? Then everything is drawn by the processor, many times slower. Returns its name, or ''.
   */
  softwareGPU() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name) ? name : '';
    } catch (err) {
      return '';
    }
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'high';
    const Q = QUALITY[q];
    const changed = q !== this.quality;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
    this.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.setShadows(Q.shadows);
    if (Q.post && !this.post) {
      this.post = new PostFX(this.renderer, this.scene, this.camera);
      this.applyGrade();
    }
    else if (!Q.post && this.post) { this.post.dispose(); this.post = null; }
    this.resize();
    if (changed && this.mapRef && this.exploreGroup && this.exploreGroup.visible) this.setMap(this.mapRef);
  }

  /** The High setting's vignette and glow, by the map's mood. */
  applyGrade() {
    if (!this.post) return;
    const M = this.mood || MOODS.night;
    this.post.grade.uniforms.uVignette.value = M.vignette;
    this.post.bloom.strength = M.bloom;
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  groundTexture() {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#2b2e3b';
    g.fillRect(0, 0, S, S);
    const c = S / 2;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Rings of flagstones, each stone a slightly different shade.
    const rings = 11;
    for (let i = rings; i >= 1; i--) {
      const r1 = (i / rings) * c;
      const r0 = ((i - 1) / rings) * c;
      const n = Math.max(6, Math.round(i * 5.5));
      const off = rnd() * Math.PI;
      for (let k = 0; k < n; k++) {
        const a0 = off + (k / n) * Math.PI * 2;
        const a1 = off + ((k + 1) / n) * Math.PI * 2;
        const l = 17 + rnd() * 7;
        g.fillStyle = `hsl(228, 13%, ${l}%)`;
        g.beginPath();
        g.arc(c, c, r1, a0, a1);
        g.arc(c, c, r0, a1, a0, true);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(8,9,14,0.75)';
        g.lineWidth = 3;
        g.stroke();
      }
    }
    // Speckle
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`;
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    // Duelling circle inlay in the centre and a boundary line near the rim.
    g.strokeStyle = 'rgba(217,201,163,0.5)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(c, c, c * 0.3, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c, c, c * 0.33, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * c * 0.06, c + Math.sin(a) * c * 0.06);
      g.lineTo(c + Math.cos(a) * c * 0.3, c + Math.sin(a) * c * 0.3);
      g.stroke();
    }
    g.strokeStyle = 'rgba(217,201,163,0.35)';
    g.lineWidth = 6;
    g.setLineDash([26, 18]);
    g.beginPath();
    g.arc(c, c, c * 0.955, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  buildArena() {
    const g = (this.arenaGroup = new THREE.Group());
    this.scene.add(g);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(R, 80).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: this.groundTexture(), roughness: 0.95, metalness: 0 })
    );
    ground.receiveShadow = true;
    g.add(ground);

    const stone = new THREE.MeshStandardMaterial({ color: 0x23252f, roughness: 0.9, flatShading: true });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.35, 0.55, 5, 80).rotateX(Math.PI / 2), stone);
    rim.position.y = 0.1;
    rim.receiveShadow = true;
    g.add(rim);
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.8, R + 5, 14, 48, 1, true), stone);
    cliff.position.y = -7;
    g.add(cliff);
    const abyss = new THREE.Mesh(new THREE.CircleGeometry(160, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x06080e }));
    abyss.position.y = -14;
    g.add(abyss);

    // Standing stones with braziers around the rim.
    this.braziers = [];
    const fire = new THREE.MeshBasicMaterial({ color: COLORS.ember });
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * (R + 2.4);
      const z = Math.sin(a) * (R + 2.4);
      const h = 4.5 + (i % 3) * 1.2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.5), stone);
      pillar.position.set(x, h / 2 - 0.5, z);
      pillar.rotation.y = -a + 0.2 * (i % 2 ? 1 : -1);
      pillar.castShadow = true;
      g.add(pillar);
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), fire);
      flame.position.set(x, h + 0.25, z);
      g.add(flame);
      this.braziers.push(flame);
      if (i % 2 === 0) {
        const light = new THREE.PointLight(COLORS.ember, 260, 34, 1.8);
        light.position.set(x * 0.93, h + 0.8, z * 0.93);
        g.add(light);
      }
    }
  }

  /**
   * Build the scenery for an exploration map. Everything solid comes from
   * map.obstacles, the same list the simulation uses to stop you walking through it.
   */
  setMap(map) {
    this.villageCtx = null; // (0.91) the day's life of the keep (benches, who is where)
    this.heroLife = new Map();
    for (const b of this.benchViews || []) this.disposeGroup(b);
    this.benchViews = [];
    this.keepFlames = []; // (0.80)
    this.worksViews = []; // (0.82.1)
    this.tierViews = [];
    for (const w of this.walkers || []) this.disposeGroup(w.g);
    this.walkers = [];
    if (this.wardViews) for (const v of this.wardViews.values()) this.scene.remove(v);
    this.wardViews = new Map();
    if (map.id === 'wishkeep') {
      // (0.81) people walking about the keep: more as it grows
      const tier = (this.keepTier && this.keepTier()) || 1;
      const stage = (this.keepStage && this.keepStage()) || 0; // (0.82.1) more people as the keep grows
      // (0.81.1) the keep's own folk, each with a trade: farmers, a baker, elders, children at play ...
      for (let i = 0; i < 3 + 3 * tier + 2 * stage; i++) {
        const m = buildVillager(VILLAGER_KINDS[i % VILLAGER_KINDS.length], i + 1);
        const g = m.group;
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 6;
        g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        this.scene.add(g);
        const w = { g, m, tx: g.position.x, tz: g.position.z, wait: Math.random() * 2, reach: 9 + 2 * tier + 2 * stage, rig: null };
        this.walkers.push(w);
        // (0.88) a villager of their own (Tripo): one of the six, a little taller or shorter, their clothes a
        // little bluer or redder; the hand-built one only until it has loaded
        if (VILLAGER_PEOPLE.length) {
          const base = PEOPLE[VILLAGER_PEOPLE[i % VILLAGER_PEOPLE.length]];
          w.role = villagerRole(base.model); // (0.91) farmer, miner, elder, child
          const tints = [0xc86a4a, 0x4a7ac8, 0x6aa84a, 0xc8a84a, 0x8a5ab8, 0x4ab8a8, 0xd8d0c0, 0x6a4a3a];
          const spec = { ...base, height: base.height * (0.92 + Math.random() * 0.14), vary: tints[(i * 5 + 3) % tints.length], varyK: 0.08 + Math.random() * 0.14 };
          w.speed = base.quick ? 1.35 : 0.85 + Math.random() * 0.3;
          hideWhileLoading([...g.children], loadCreature(spec), () => !!g.parent && !w.rig);
          loadCreature(spec).then((tpl) => {
            if (!tpl || !g.parent) return;
            for (const ch of g.children) ch.visible = false;
            w.rig = makeCreature(tpl, spec);
            g.add(w.rig.group);
          });
        }
      }
    }
    this.ringViews = []; // (0.61) the Echo Ring's stones, animated each frame
    if (this.seraphView) this.seraphView.dead = true;
    this.seraphView = null; // (0.92) the Seraph's plinth, when this is a keep
    if (this.exploreGroup) this.disposeGroup(this.exploreGroup);
    this.people = []; // Haven's people on the last map are gone with it
    this.mapNpcs = []; // (0.85) the map's people, as drawn (the keep's go indoors for the night)
    this.glimmers = []; // (0.56.4) and its glimmers
    this.preloadMap(map);
    const g = (this.exploreGroup = new THREE.Group());
    this.scene.add(g);
    this.mapId = map.id;
    const look = lookOf(map); // the Wilds have their own look (0.41)
    const T = (this.mapTheme = MAP_THEMES[look] || MAP_THEMES.forest);
    const R = map.radius;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });
    const d = new THREE.Object3D();

    // Ground (0.34): painted per pixel from world position (see environment.js), lit and shadowed.
    const Q = QUALITY[this.quality] || QUALITY.high;
    const GP = GROUND[look] || GROUND.forest;
    this.mapRef = map;
    this.look = look;
    // The land first (0.41): its pools and regions shape how the ground is painted.
    const biome = buildBiome(map, { quality: this.quality, mats: this.biomeMats(look) });
    this.biome = biome;
    const B = BIOMES[look] || BIOMES.forest;
    const mask = groundMask(map, { pools: biome.pools, field: biome.field, poolRadius, paths: !map.safe || true });
    this.groundMask = mask;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 45, 96).rotateX(-Math.PI / 2), groundMaterial(look, R, this.quality, { mask, shards: mask.shards, clock: this.windClock, pool: B.pools && B.pools.kind }));
    ground.receiveShadow = true;
    g.add(ground);
    // The land itself (0.41): this map's own trees, rocks, ground cover and edge.
    g.add(biome.group);

    if (map.theme === 'town') {
      if (!this.stoneTex) {
        this.stoneTex = this.groundTexture();
        this.stoneTex.userData.keep = true;
      }
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(9.5, 56).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.stoneTex, roughness: 0.95 }));
      plaza.position.y = 0.03;
      plaza.receiveShadow = true;
      g.add(plaza);
    }

    // Solid things
    const wall = new THREE.MeshStandardMaterial({ color: 0x8c7c66, roughness: 0.95 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x5e2622, roughness: 0.85, flatShading: true });
    const timber = new THREE.MeshStandardMaterial({ color: 0x3a281c, roughness: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    const fire = new THREE.MeshBasicMaterial({ color: COLORS.ember });
    const dark = flat(0x2b2d3a);
    // Houses (0.41): Tripo-made cottages in Haven and sandstone houses in Asterfell, drawn as
    // instances once they arrive; the hand-built ones stand in until then.
    const houseFallback = new THREE.Group();
    const houseList = [];
    const drowned = look === 'drowned'; // (0.54) the first Asterfell, under the water
    const sandstone = look === 'glass' || drowned;
    if (sandstone) {
      wall.color.set(0xc8a878);
      roof.color.set(0xb89868);
      timber.color.set(0x8a6a48);
    }
    g.add(houseFallback);
    for (const o of map.obstacles) {
      if (o.kind === 'house') {
        houseList.push({ x: o.x, z: o.z, rot: -o.rot, sx: o.hw * 2 + 0.3, sz: o.hd * 2 + 0.3 });
        const house = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, o.height, o.hd * 2), wall);
        base.position.y = o.height / 2;
        base.castShadow = true;
        const top = sandstone
          ? new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.4, 0.4, o.hd * 2 + 0.4), roof)
          : new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(o.hw, o.hd) + 0.5, 2.6, 4).rotateY(Math.PI / 4), roof);
        if (!sandstone) top.scale.set(1, 1, o.hd / o.hw + 0.12);
        top.position.y = sandstone ? o.height + 0.2 : o.height + 1.3;
        top.castShadow = true;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), glow);
        win.position.set(0, o.height * 0.55, -o.hd - 0.02);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.1), dark);
        door.position.set(1.3, 0.85, -o.hd - 0.02);
        house.add(base, top, win, door);
        // Timber frame and a chimney (0.34): corner posts, a beam under the eaves.
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, o.height, 0.28), timber);
          post.position.set(sx * (o.hw - 0.1), o.height / 2, sz * (o.hd - 0.1));
          house.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.1, 0.24, o.hd * 2 + 0.1), timber);
        beam.position.y = o.height - 0.1;
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.6), dark);
        chimney.position.set(o.hw * 0.45, o.height + 1.5, o.hd * 0.3);
        chimney.castShadow = true;
        house.add(beam, chimney);
        if (sandstone) chimney.visible = false;
        house.position.set(o.x, 0, o.z);
        house.rotation.y = -o.rot; // the simulation turns the same box by `rot`
        houseFallback.add(house);
      } else if (o.kind === 'brazier') {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.2, 6), dark);
        post.position.set(o.x, 1.1, o.z);
        post.castShadow = true;
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), fire);
        flame.position.set(o.x, 2.6, o.z);
        g.add(post, flame);
        if (o.lit) {
          const light = new THREE.PointLight(COLORS.ember, 170, 30, 1.8);
          light.position.set(o.x * 0.8, 3.4, o.z * 0.8);
          g.add(light);
        }
      } else if (o.kind === 'npc') {
        const npc = buildNpc(NPCS[o.id].look);
        (this.mapNpcs = this.mapNpcs || []).push(npc);
        npc.position.set(o.x, 0, o.z);
        npc.rotation.y = Math.atan2(-o.x, -o.z); // face the middle of the plaza
        g.add(npc);
        // Haven's people, rigged (0.44): they idle, look about, and greet you when you come near.
        const ps = PEOPLE[o.id];
        if (ps) {
          const person = { x: o.x, z: o.z, rig: null, next: 3 + Math.random() * 6, greeted: 0 };
          (this.people = this.people || []).push(person);
          hideWhileLoading([...npc.children], loadCreature(ps), () => !!npc.parent && !person.rig);
          loadCreature(ps).then((tpl) => {
            if (!tpl || !npc.parent) return;
            for (const ch of npc.children) ch.visible = false;
            const rig = makeCreature(tpl, ps);
            npc.add(rig.group);
            person.rig = rig;
          });
        }
      } else if (o.kind === 'decor') {
        // Haven grows (0.47): what each finished side story leaves behind
        const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
        const d = new THREE.Group();
        d.position.set(o.x, 0, o.z);
        if (o.what === 'lantern') {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), wood);
          post.position.y = 1.2;
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.32), new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xffa040, emissiveIntensity: 1.6 }));
          lamp.position.y = 2.45;
          const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12), new THREE.MeshStandardMaterial({ color: 0xc0302a }));
          scarf.position.y = 1.9;
          scarf.rotation.x = Math.PI / 2;
          const light = new THREE.PointLight(0xffb060, 1.4, 7);
          light.position.y = 2.4;
          d.add(post, lamp, scarf, light);
        } else if (o.what === 'banner') {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), wood);
          pole.position.y = 1.7;
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshStandardMaterial({ color: 0x2a4aa8, side: THREE.DoubleSide, roughness: 0.8 }));
          cloth.position.set(0.48, 2.5, 0);
          const trim = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8c070, side: THREE.DoubleSide }));
          trim.position.set(0.48, 1.8, 0.01);
          d.add(pole, cloth, trim);
        } else if (o.what === 'stall') {
          const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.0), wood);
          top.position.y = 0.9;
          for (const [x, z] of [[-0.9, -0.42], [0.9, -0.42], [-0.9, 0.42], [0.9, 0.42]]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
            leg.position.set(x, 0.45, z);
            d.add(leg);
          }
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: 0x5a8a5a, roughness: 0.9 }));
          canopy.position.y = 2.1;
          canopy.rotation.x = 0.18;
          for (let i = 0; i < 6; i++) {
            const herb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: [0x6a9a4a, 0xb98aff, 0xd8c070][i % 3] }));
            herb.position.set(-0.75 + i * 0.3, 1.02, (i % 2) * 0.2 - 0.1);
            d.add(herb);
          }
          d.add(top, canopy);
        }
        g.add(d);
      } else if (o.kind === 'delve') {
        // The palace stair (0.46): a dark doorway of starglass going down
        const door = buildAltar();
        door.position.set(o.x, 0, o.z);
        door.scale.setScalar(1.35);
        door.traverse((m) => { if (m.material && m.material.color) m.material = m.material.clone(), m.material.color.lerp(new THREE.Color(0xffd27a), 0.5); });
        const glow = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, depthWrite: false }));
        glow.scale.setScalar(2.4);
        glow.position.set(o.x, 0.06, o.z);
        g.add(door, glow);
      } else if (o.kind === 'ring') {
        // (0.61) The Echo Ring: seven standing stones, star-glass on each, round a swirling gate you walk into
        const ring = new THREE.Group();
        const R = o.r || 2.3;
        const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.5, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.95 }));
        floor.position.y = 0.03;
        floor.receiveShadow = true;
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b7180, roughness: 0.85 });
        const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fe7ff });
        const shards = [];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.2;
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2 + (i % 3) * 0.25, 0.38), stoneMat);
          st.position.set(Math.cos(a) * R, 1 + (i % 3) * 0.12, Math.sin(a) * R);
          st.rotation.y = -a;
          st.rotation.z = 0.08 * (i % 2 ? 1 : -1);
          st.castShadow = true;
          const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), glassMat);
          shard.position.set(Math.cos(a) * R, 2.45 + (i % 3) * 0.25, Math.sin(a) * R);
          shard.scale.y = 1.7;
          shards.push(shard);
          ring.add(st, shard);
        }
        const add = (geo, color, opacity) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        const swirlA = add(new THREE.RingGeometry(0.4, R * 0.78, 28, 1, 0, Math.PI * 1.3).rotateX(-Math.PI / 2), 0x6fc8ff, 0.42);
        const swirlB = add(new THREE.RingGeometry(0.2, R * 0.55, 24, 1, 0, Math.PI * 1.1).rotateX(-Math.PI / 2), 0xc8f0ff, 0.5);
        swirlA.position.y = 0.08;
        swirlB.position.y = 0.1;
        const glow = add(new THREE.CircleGeometry(R * 0.85, 28).rotateX(-Math.PI / 2), 0x3aa9ff, 0.22);
        glow.position.y = 0.06;
        const column = add(new THREE.CylinderGeometry(R * 0.5, R * 0.75, 4.5, 20, 1, true), 0x7fd0ff, 0.12);
        column.position.y = 2.25;
        ring.add(floor, glow, swirlA, swirlB, column);
        ring.position.set(o.x, 0, o.z);
        g.add(ring);
        this.ringViews.push({ swirlA, swirlB, column, glow, shards });
      } else if (o.kind === 'statue') {
        // (0.92) the Seraph's plinth: white stone and candles; the angel stands on it once raised
        const plinth = new THREE.Group();
        const stoneM = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.8 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.3, 24), stoneM);
        base.position.y = 0.15;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.28, 24), stoneM);
        top.position.y = 0.43;
        base.castShadow = top.castShadow = true;
        base.receiveShadow = top.receiveShadow = true;
        plinth.add(base, top);
        const wax = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.6 });
        const flameM = new THREE.MeshBasicMaterial({ color: 0xffc860 });
        for (let i = 0; i < 5; i++) {
          const a = 0.6 + (i / 5) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16 + 0.06 * (i % 2), 8), wax);
          c.position.set(Math.cos(a) * 1.08, 0.38, Math.sin(a) * 1.08);
          const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), flameM);
          f.position.set(c.position.x, 0.5 + 0.03 * (i % 2), c.position.z);
          f.scale.y = 1.6;
          plinth.add(c, f);
        }
        const glowRing = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
        glowRing.scale.setScalar(1.5);
        glowRing.position.y = 0.6;
        plinth.add(glowRing);
        plinth.position.set(o.x, 0, o.z);
        g.add(plinth);
        // it faces the Hearth
        this.seraphView = { group: plinth, glow: glowRing, model: null, loading: false, face: Math.PI / 2 - Math.atan2(-o.z, -o.x), rest: false, mats: [] };
      } else if (o.kind === 'keepaltar') {
        // (0.80) the Wishkeep's Hearth: a white-and-crimson altar with a fire that never goes out
        const altar = buildAltar(0xf2ece4);
        altar.position.set(o.x, 0, o.z);
        altar.scale.setScalar(1.25);
        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
        flame.position.set(o.x, 2.9, o.z);
        flame.scale.y = 1.6;
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xfff2e0 }));
        core.position.set(o.x, 2.9, o.z);
        core.scale.y = 1.5;
        const light = new THREE.PointLight(0xff7a5a, 150, 22, 1.8);
        light.position.set(o.x, 3.4, o.z);
        const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xff3d4f, transparent: true, opacity: 0.6, depthWrite: false }));
        ring.scale.setScalar(2.6);
        ring.position.set(o.x, 0.06, o.z);
        g.add(altar, flame, core, light, ring);
        (this.keepFlames = this.keepFlames || []).push(flame, core);
      } else if (o.kind === 'works') {
        // (0.82.1) the keep's works: the Mine (a mouth in the rock, timbered, star-glass glinting) and the Fields
        const d = new THREE.Group();
        d.position.set(o.x, 0, o.z);
        d.rotation.y = Math.atan2(-o.x, -o.z); // facing the Hearth
        const lit = [];
        if ((o.work || o.id) === 'mine') {
          const rock = new THREE.MeshStandardMaterial({ color: 0x6a6270, roughness: 0.95, flatShading: true });
          const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), rock);
          mound.scale.set(1.3, 0.75, 1);
          mound.position.set(0, 1.2, -2.2);
          mound.castShadow = mound.receiveShadow = true;
          const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.2), new THREE.MeshBasicMaterial({ color: 0x0a0808 }));
          mouth.position.set(0, 1.1, 0.2);
          const timber = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
          const pL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), timber), pR = pL.clone(), lin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 0.3), timber);
          pL.position.set(-1.05, 1.3, 0.85);
          pR.position.set(1.05, 1.3, 0.85);
          lin.position.set(0, 2.6, 0.85);
          const cart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.8), timber);
          cart.position.set(1.9, 0.5, 1.6);
          d.add(mound, mouth, pL, pR, lin, cart);
          const glass = new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x4ab8ff, emissiveIntensity: 1.6 });
          for (let i = 0; i < 6; i++) {
            const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glass);
            c.position.set(-1.8 + i * 0.7, 1.4 + (i % 3) * 0.6, -0.3 - (i % 2) * 0.8);
            c.scale.y = 1.8;
            d.add(c);
            lit.push(c);
          }
          const cargo = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glass);
          cargo.position.set(1.9, 0.95, 1.6);
          d.add(cargo);
          lit.push(cargo);
        } else {
          const soil = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 1 }));
          soil.position.set(0, 0.06, -1.5);
          soil.receiveShadow = true;
          d.add(soil);
          const grain = new THREE.MeshStandardMaterial({ color: { fields2: 0xb8c05a, fields4: 0xe0c070 }[o.id] || 0xd8b05a, roughness: 0.8 });
          if (o.id === 'fields3') {
            // (0.88) the Orchard: apple trees in rows, and beehives
            const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 });
            const leaf = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.8, flatShading: true });
            const apple = new THREE.MeshStandardMaterial({ color: 0xd84a3a, roughness: 0.5 });
            for (let i = 0; i < 6; i++) {
              const tx = -2.4 + (i % 3) * 2.4, tz = -3 + Math.floor(i / 3) * 2.4;
              const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.2, 6), bark);
              trunk.position.set(tx, 0.6, tz);
              const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), leaf);
              crown.position.set(tx, 1.7, tz);
              crown.castShadow = true;
              d.add(trunk, crown);
              lit.push(crown);
              for (let j = 0; j < 3; j++) {
                const ap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), apple);
                ap.position.set(Math.cos(j * 2.1 + i) * 0.8, -0.2 + (j % 2) * 0.4, Math.sin(j * 2.1 + i) * 0.8); // (on its tree: they come with it)
                crown.add(ap);
              }
            }
            const hiveMat = new THREE.MeshStandardMaterial({ color: 0xd8a84a, roughness: 0.8 });
            for (let i = 0; i < 2; i++) {
              const hive = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 8), hiveMat);
              hive.position.set(-1 + i * 2, 0.35, 0.9);
              d.add(hive);
            }
          } else {
            for (let r = 0; r < 5; r++) {
              const row = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.7, 0.45), grain);
              row.position.set(0, 0.45, -3.4 + r * 0.95);
              row.castShadow = true;
              d.add(row);
              lit.push(row);
            }
          }
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2e }));
          pole.position.set(2.9, 1.1, 0.9);
          const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 8), grain);
          hat.position.set(2.9, 2.3, 0.9);
          const arms = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a5a3a }));
          arms.position.set(2.9, 1.8, 0.9);
          d.add(pole, hat, arms);
        }
        g.add(d);
        (this.worksViews = this.worksViews || []).push({ id: o.id, lit });
      } else if (o.kind === 'hall') {
        // (0.80) a class's hall in the Wishkeep: a banner in its colour before the door
        const color = { warrior: 0xc8463a, archer: 0x4a9a4a, mage: 0x4a6ad8, rogue: 0x8a4ac8 }[o.cls] || 0xd8c070;
        const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
        const d = new THREE.Group();
        d.position.set(o.x, 0, o.z);
        d.rotation.y = Math.atan2(-o.x, -o.z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.8, 6), wood);
        pole.position.y = 1.9;
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
        cloth.position.set(0, 2.6, 0.1);
        const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshStandardMaterial({ color: 0xf2ece4, side: THREE.DoubleSide }));
        trim.position.set(0, 1.72, 0.11);
        const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xff3d4f }));
        cap.position.y = 3.9;
        d.add(pole, cloth, trim, cap);
        g.add(d);
        // (0.82.1) its tier: the cap and a ring at the hall's foot take the tier's colour
        const tierRing = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        tierRing.position.set(o.x * (17 / 12.4), 0.07, o.z * (17 / 12.4));
        tierRing.scale.setScalar(5);
        g.add(tierRing);
        (this.tierViews = this.tierViews || []).push({ id: o.cls, cap, ring: tierRing, tier: -1 });
      } else if (o.kind === 'board') {
        const board = buildBoard();
        board.position.set(o.x, 0, o.z);
        board.rotation.y = Math.atan2(-o.x, -o.z);
        g.add(board);
      } else if (o.kind === 'sign') {
        // (0.56.4) a glimmer where the sign stood
        const gl = buildGlimmer();
        gl.position.set(o.x, 0, o.z);
        g.add(gl);
        this.glimmers.push({ id: o.id, x: o.x, z: o.z, group: gl, parts: gl.userData.glimmer, phase: (o.x * 7.3 + o.z * 3.1) % 6.28, lit: 1 });
      } else if (o.kind === 'well') {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 0.9, 10), flat(0x6a6d78));
        ring.position.set(o.x, 0.45, o.z);
        ring.castShadow = true;
        const water = new THREE.Mesh(new THREE.CircleGeometry(o.r * 0.78, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f8fb0 }));
        water.position.set(o.x, 0.92, o.z);
        g.add(ring, water);
      }
    }

    if (houseList.length) {
      propInstances(sandstone ? 'asterhouse' : 'cottage', houseList).then((mesh) => {
        if (!mesh || this.exploreGroup !== g) return;
        if (drowned) {
          mesh.material = mesh.material.clone(); // its own copy: Asterfell above keeps its gold
          mesh.material.color.set(0x5a7a78);
        }
        g.add(mesh);
        houseFallback.visible = false;
      });
    }
    // The Deep (0.54): each domain's own landmark, in a ring beyond its edge
    const DEEP_PROP = { deepash: 'ashspire', drowned: 'drownedarch', rootdeep: 'rootheart', choir: 'glasspillar', quiet: 'stillstone' };
    const SKY_PROP = { skyroad: 'skygate', answers: 'courtpillar', wants: 'wantaltar', zenith: 'zenithspire' }; // (0.64) Caelum's, by map
    if (SKY_PROP[map.id] && PROPS[SKY_PROP[map.id]]) DEEP_PROP[look] = SKY_PROP[map.id];
    if (DEEP_PROP[look] && PROPS[DEEP_PROP[look]]) {
      const ring = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2;
        const big = 5 + (i % 3) * 1.5;
        ring.push({ x: Math.cos(a) * (R + 5), z: Math.sin(a) * (R + 5), rot: -a, sx: big, sz: big }); // height follows the model's own shape
      }
      propInstances(DEEP_PROP[look], ring).then((mesh) => {
        if (mesh && this.exploreGroup === g) g.add(mesh);
      });
    }
    // The Keep's ruined towers stand along its walls (0.41).
    if (look === 'keep') {
      const towers = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.35;
        towers.push({ x: Math.cos(a) * (R + 4.5), z: Math.sin(a) * (R + 4.5), rot: -a, sx: 6.2, sz: 6.2, sy: 10 + (i % 3) * 1.6 });
      }
      propInstances('tower', towers).then((mesh) => {
        if (mesh && this.exploreGroup === g) g.add(mesh);
      });
    }

    // The altar under each boss (0.33): a Remnant Sigil calls its Remnant here while the boss is down.
    this.altarRunes = [];
    for (const sp of map.spawns || []) {
      if (!ENEMIES[sp.type] || !ENEMIES[sp.type].boss || map.id === 'rift') continue;
      const altar = buildAltar(look === 'caelum' ? 0xd8c494 : undefined); // (0.64) gold-white stone in Caelum
      altar.position.set(sp.x, 0, sp.z);
      g.add(altar);
      this.altarRunes.push(altar.userData.rune);
    }

    // Portals to the neighbouring maps
    this.portalViews = [];
    for (const gate of map.portals) {
      const portal = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.16, 6, 22), new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
      arch.position.y = 1.9;
      const veil = new THREE.Mesh(new THREE.CircleGeometry(1.6, 22), new THREE.MeshBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      veil.position.y = 1.9;
      const pad = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, depthWrite: false }));
      pad.scale.setScalar(gate.r);
      pad.position.y = 0.05;
      portal.add(arch, veil, pad);
      portal.position.set(gate.x, 0, gate.z);
      portal.rotation.y = -gate.angle + Math.PI / 2; // face the middle of the map
      g.add(portal);
      this.portalViews.push({ veil, pad, gate });
      // An old stone arch around it (0.41); the plain ring stays until the arch arrives.
      propInstances('waygate', [{ x: 0, z: 0, rot: Math.PI / 2, sx: 4.6, sz: 1.2, sy: 4.4 }]).then((mesh) => {
        if (!mesh || this.exploreGroup !== g) return;
        portal.add(mesh);
        arch.visible = false;
        veil.scale.set(0.62, 0.92, 1);
        veil.position.y = 1.75;
      });
    }
    // The Waygate in town (0.61): a round dais, four gold-veined obelisks, and a ring of light that turns
    // above it (faster, lower and brighter while it carries you off).
    this.wayView = null;
    if (map.waygate) {
      const wg = map.waygate;
      const gate = new THREE.Group();
      const gold = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false });
      const pad = new THREE.Mesh(this.ringGeo(), gold);
      pad.scale.setScalar(wg.r);
      pad.position.y = 0.2;
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(wg.r + 0.5, wg.r + 0.75, 0.18, 32), new THREE.MeshStandardMaterial({ color: 0x4f4a44, roughness: 0.95 }));
      dais.position.y = 0.09;
      dais.receiveShadow = true;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(wg.r * 0.85, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb84a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.position.y = 0.19;
      gate.add(dais, disc, pad);
      const obeliskMat = new THREE.MeshStandardMaterial({ color: 0x5d564c, roughness: 0.8, emissive: 0xffb84a, emissiveIntensity: 0.12 });
      const caps = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 4), obeliskMat);
        ob.position.set(Math.cos(a) * (wg.r + 0.35), 1.48, Math.sin(a) * (wg.r + 0.35));
        ob.castShadow = true;
        const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
        cap.position.set(ob.position.x, 3.0, ob.position.z);
        caps.push(cap);
        gate.add(ob, cap);
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(wg.r * 0.7, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 2.2;
      const halo2 = new THREE.Mesh(new THREE.TorusGeometry(wg.r * 0.45, 0.05, 8, 32), halo.material);
      halo2.rotation.x = Math.PI / 2;
      halo2.position.y = 2.6;
      gate.add(halo, halo2);
      gate.position.set(wg.x, 0, wg.z);
      g.add(gate);
      this.wayView = { gate, pad, disc, wg, halo, halo2, caps };
    }
    // Waystones out in the world (0.61): a carved pillar with a turning crystal over it and a band of
    // runes that breathes; the pad shrinks as it carries you.
    this.stoneViews = [];
    for (const ws of map.waystones || []) {
      const stone = new THREE.Group();
      const pad = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.75, depthWrite: false }));
      pad.scale.setScalar(ws.r);
      pad.position.y = 0.06;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(ws.r * 0.85, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.position.y = 0.05;
      const px = ws.r + 0.55;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x4d5562, roughness: 0.9 }));
      base.position.set(px, 0.15, 0);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 2.3, 6), new THREE.MeshStandardMaterial({ color: 0x5c6a7a, roughness: 0.8, emissive: 0x3aa9ff, emissiveIntensity: 0.2 }));
      pillar.position.set(px, 1.45, 0);
      pillar.castShadow = true;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      band.rotation.x = Math.PI / 2;
      band.position.set(px, 1.7, 0);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), new THREE.MeshBasicMaterial({ color: 0xbff2ff }));
      crystal.scale.y = 1.6;
      crystal.position.set(px, 3.05, 0);
      stone.add(pad, disc, base, pillar, band, crystal);
      stone.position.set(ws.x, 0, ws.z);
      g.add(stone);
      this.stoneViews.push({ ws, pad, disc, band, crystal });
    }

    // Ground cover (0.34): grass tufts that sway, and pebbles or rubble. One draw call each.
    const area = Math.PI * R * R;
    const nGrass = Math.min(9000, Math.round((area / 3.2) * Q.grass * (GP.sparse ?? 1)));
    if (nGrass > 0) {
      const spots = scatterSpots(map, nGrass, map.id.length * 7919 + 3).filter(([x, z]) => {
        const k = mask.sample(x, z);
        return k.pool < 0.3 && k.path < 0.55;
      });
      // in sectors, so the tufts off-screen are skipped whole (0.41)
      const tuftGeo = tuftGeometry(look);
      const tuftMat = swayMaterial(this.windClock, GP.caps ? { emissive: new THREE.Color(GP.grass[1]).multiplyScalar(0.05) } : {});
      // Ground cover writes no depth, so attack telegraphs on the ground always show through it.
      tuftMat.depthWrite = false;
      const tint = new THREE.Color();
      for (const part of bySector(spots, 22)) {
        const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, part.length);
        part.forEach(([x, z, a, b], n) => {
          d.position.set(x, 0, z);
          d.rotation.set(0, a * 6.28, 0);
          d.scale.setScalar(0.7 + b * 0.9);
          d.updateMatrix();
          tufts.setMatrixAt(n, d.matrix);
          const v = 0.75 + a * 0.4;
          tufts.setColorAt(n, tint.setRGB(v, v, v * (0.9 + b * 0.2)));
        });
        tufts.receiveShadow = true;
        tufts.computeBoundingSphere();
        g.add(tufts);
      }
    }
    const nPebbles = Math.min(2600, Math.round((area / 14) * Q.pebbles * (GP.pebbles ?? 1)));
    if (nPebbles > 0) {
      const spots = scatterSpots(map, nPebbles, map.id.length * 104729 + 11, { minGap: 0.1 }).filter(([x, z]) => mask.sample(x, z).pool < 0.3);
      const pebGeo = pebbleGeometry(look, T.rock);
      const pebMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
      pebMat.depthWrite = false; // (see the grass)
      for (const part of bySector(spots, 22)) {
        const pm = new THREE.InstancedMesh(pebGeo, pebMat, part.length);
        part.forEach(([x, z, a, b], n) => {
          const sz = (GP.debris === 'rubble' ? 0.14 : 0.08) + a * a * 0.28;
          d.position.set(x, sz * 0.15, z);
          d.rotation.set(b * 0.6, a * 6.28, 0);
          d.scale.set(sz, sz, sz * (0.8 + b * 0.5));
          d.updateMatrix();
          pm.setMatrixAt(n, d.matrix);
        });
        pm.receiveShadow = true;
        pm.computeBoundingSphere();
        g.add(pm);
      }
    }
    // Drifting motes: pollen, embers, snow, spores.
    this.motes = buildMotes(look, Q.motes);
    g.add(this.motes.points);
    // Weather (0.41): rain and lightning over Stormspire.
    this.rain = look === 'storm' ? buildRain(Math.round(Q.motes * 2.5)) : null;
    if (this.rain) g.add(this.rain.lines);
    this.lightning = look === 'storm' ? { t: 4, flash: 0 } : null;
    this.setEnvironment('explore');
  }

  /** The shared materials for a land's plants and stones (0.41): crystals and spores give off light. */
  biomeMats(look) {
    const m = biomeMaterials();
    const T = MAP_THEMES[look] || MAP_THEMES.forest;
    // bright daylight washes leaves out: the sunny lands' plants are painted a little deeper
    if (T.deep) m.solid.color.setScalar(T.deep);
    if (T.glossGlow) {
      m.gloss.emissive.set(T.glossGlow);
      m.gloss.emissiveIntensity = 0.55;
    }
    return m;
  }

  /**
   * (0.56.2) Start loading the models this map needs (its enemies, boss and people), then those of
   * the maps its portals lead to, so they are ready before anything appears.
   */
  preloadMap(map) {
    const types = (m) => (m ? [...Object.keys(m.roster || {}), m.boss, ...(m.obstacles || []).filter((o) => o.kind === 'npc').map((o) => o.id)].filter(Boolean) : []);
    preload(modelsFor([...types(map), ...types(MAPS[map.id])]));
    if (map.id === 'town') preload(modelsFor(Object.keys(PEOPLE)));
    for (const p of (MAPS[map.id] && MAPS[map.id].portals) || []) preload(modelsFor(types(MAPS[p.to])));
  }

  /** Every class's hero (the title screen's class picker, and friends who join). */
  preloadHeroes() {
    preload(Object.keys(RIGGED).filter((id) => id.startsWith('hero_')));
  }

  /** The Echo Ring's enemies (and its bosses), before a run's first wave. */
  preloadArena() {
    preload(modelsFor(['grunt', 'spitter', 'brute', 'stalker', 'imp', 'wolf', 'knight', 'shaman', 'scarab', 'wraith', 'sporecap', 'golem', 'boss', 'boss2', 'boss3']));
  }

  /** Switch between the arena ring and the exploration scenery. */
  setEnvironment(mode) {
    const explore = mode === 'explore' && !!this.exploreGroup;
    this.arenaGroup.visible = !explore;
    if (this.exploreGroup) this.exploreGroup.visible = explore;
    const theme = this.mapRef && this.look;
    const M = explore ? MOODS[THEME_MOOD[theme] || 'day'] : null;
    const sky = explore ? new THREE.Color(this.mapTheme.sky).lerp(new THREE.Color(M.haze), M.hazeMix).getHex() : 0x0a0d16;
    this.scene.background.set(sky);
    this.scene.fog.color.set(sky);
    this.scene.fog.near = explore ? M.near : 42;
    this.scene.fog.far = explore ? M.far : 90;
    this.mood = M;
    this.applyGrade();
    // Light by the map's mood (0.34.1): daylight for cheerful maps, dusk or night for the rest.
    const GP = explore ? GROUND[theme] || GROUND.forest : null;
    if (explore) {
      this.hemi.color.copy(new THREE.Color(this.mapTheme.sky)).lerp(new THREE.Color(M.skyTint), 0.7);
      this.hemi.groundColor.set(M.bounce);
      const k = GP.bright || 1; // pale maps (snow, sand) need less light to read
      this.hemi.intensity = M.sky * k;
      this.sun.color.set(M.sunColor).lerp(new THREE.Color(GP.light), 0.25);
      this.sun.intensity = M.sun * k;
      this.heroLight.color.set(GP.light);
      this.heroLight.intensity = M.hero * k;
    } else {
      this.hemi.color.set(0x9db4ff);
      this.hemi.groundColor.set(0x241a20);
      this.hemi.intensity = 1.15;
      this.sun.color.set(0xffe6c4);
      this.sun.intensity = 2.6;
      this.heroLight.intensity = 0;
    }
  }

  /** Swap the hero model when a different class is played. */
  setHeroClass(cls, spec = null, eternal = false) {
    const look = heroLook(cls, spec, eternal);
    if (cls === this.heroCls && look === this.heroLook) return;
    const ascended = look.endsWith('_eternal') && this.heroLook && !this.heroLook.endsWith('_eternal') && cls === this.heroCls;
    this.heroCls = cls;
    this.heroLook = look;
    this.hero.disposed = true;
    this.disposeGroup(this.hero.group);
    this.hero = buildHero(cls);
    upgradeHero(this.hero, cls, look); // the rigged model, when there is one (0.35; the ninja, 0.42)
    this.scene.add(this.hero.group);
    if (ascended && this.lastHeroPos) {
      // (0.76) the moment of becoming Eternal: a white-and-crimson burst where the hero stands
      const { x, z } = this.lastHeroPos;
      this.burst(x, 1.2, z, { count: 60, color: 0xffffff, speed: 7, up: 5, life: 0.9 });
      this.burst(x, 1.0, z, { count: 50, color: 0xff3d4f, speed: 5, up: 6, life: 1.1 });
    }
  }

  buildHero() {
    this.heroCls = 'warrior';
    this.heroLook = 'warrior';
    this.hero = buildHero();
    upgradeHero(this.hero, 'warrior');
    this.scene.add(this.hero.group);
    this.heroAnim = { swing: 1, swingDur: 0.2, spin: 0, walk: 0, deadT: 0 };
  }

  buildParticles() {
    const N = (this.pMax = 420);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const inst = (this.pMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12), mat, N));
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;
    this.particles = [];
    const col = new THREE.Color(0);
    for (let i = 0; i < N; i++) {
      this.particles.push({ life: 0 });
      inst.setColorAt(i, col);
    }
    this.pNext = 0;
    this.pDummy = new THREE.Object3D();
    this.pColor = new THREE.Color();
    this.scene.add(inst);
  }

  buildMarkers() {
    const ring = (color) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false })
      );
      m.position.y = 0.05;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.hoverRing = ring(0xff6b6b);
    this.targetRing = ring(0xffd27a);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
  }

  // -------------------------------------------------------------------------
  // Mouse picking
  // -------------------------------------------------------------------------
  setRay(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }

  /** World position on the arena floor under the mouse. */
  screenToGround(clientX, clientY) {
    const ray = this.setRay(clientX, clientY);
    const hit = ray.intersectPlane(this.groundPlane, this.tmpV);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** The enemy under the mouse, if any. Generous so targets are easy to click. */
  /** The person or sign under the mouse, if any (exploration only). */
  pickInteractable(clientX, clientY, world) {
    if (world.mode !== 'explore' || !world.interactables) return null;
    const ray = this.setRay(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    // The same list the G key uses, so anything you can interact with can be right-clicked too.
    for (const o of world.interactables()) {
      this.tmpV.set(o.x, 0.1, o.z);
      this.tmpV2.set(o.x, 1.8, o.z);
      const d = Math.sqrt(Math.max(0, ray.distanceSqToSegment(this.tmpV, this.tmpV2)));
      if (d < (o.pickR || 0.95) && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  pickEnemy(clientX, clientY, world) {
    const ray = this.setRay(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const v = this.views.get(e.id);
      if (!v) continue;
      const pos = v.model.group.position;
      this.tmpV.set(pos.x, 0.1, pos.z);
      this.tmpV2.set(pos.x, e.def.height, pos.z);
      const d = Math.sqrt(Math.max(0, ray.distanceSqToSegment(this.tmpV, this.tmpV2)));
      if (d < e.radius * 1.35 + 0.35 && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** World point -> screen pixels (for health bars and floating text). */
  project(x, y, z) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, visible: v.z < 1 };
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  burst(x, y, z, { count = 12, color = 0xffffff, speed = 6, up = 3, size = 1, life = 0.5, gravity = 14, spread = 1 } = {}) {
    this.pColor.set(color);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.pNext];
      this.pNext = (this.pNext + 1) % this.pMax;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65) * spread;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.3 + Math.random());
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
      p.r = this.pColor.r;
      p.g = this.pColor.g;
      p.b = this.pColor.b;
    }
  }

  updateParticles(dt) {
    const d = this.pDummy;
    const c = this.pColor;
    for (let i = 0; i < this.pMax; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.06) {
          p.y = 0.06;
          p.vy *= -0.3;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        const k = Math.max(0, p.life / p.max);
        d.position.set(p.x, p.y, p.z);
        d.scale.setScalar(p.size * (0.3 + k));
        d.rotation.set(p.life * 9, p.life * 7, 0);
        d.updateMatrix();
        this.pMesh.setMatrixAt(i, d.matrix);
        this.pMesh.setColorAt(i, c.setRGB(p.r * k, p.g * k, p.b * k));
      } else if (!p.hidden) {
        d.position.set(0, -50, 0);
        d.scale.setScalar(0);
        d.updateMatrix();
        this.pMesh.setMatrixAt(i, d.matrix);
        p.hidden = true;
        continue;
      }
      if (p.life > 0) p.hidden = false;
    }
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  geo(key, make) {
    let g = this.geoCache.get(key);
    if (!g) {
      g = make();
      this.geoCache.set(key, g);
    }
    return g;
  }
  ringGeo() {
    return this.geo('ring', () => new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2));
  }
  discGeo() {
    return this.geo('disc', () => new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));
  }
  sectorGeo(angle, inner = 0) {
    const a = Math.round(angle * 100) / 100;
    return this.geo(`sector:${a}:${inner}`, () =>
      (inner > 0 ? new THREE.RingGeometry(inner, 1, 32, 1, -a / 2, a) : new THREE.CircleGeometry(1, 32, -a / 2, a)).rotateX(-Math.PI / 2)
    );
  }
  rectGeo() {
    // Unit rectangle starting at the origin and extending along +X.
    return this.geo('rect', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0));
  }

  /** A flat shape on the ground that grows and fades (slashes, shockwaves, click markers). */
  flash(geometry, { x, z, y = 0.07, dir = 0, color = 0xffffff, from = 1, to = 1, sx = 1, sz = 1, dur = 0.25, opacity = 0.9, additive = true }) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = -dir;
    this.scene.add(mesh);
    this.flashes.push({ mesh, mat, t: 0, dur, from, to, sx, sz, opacity });
    return mesh;
  }

  /** Run fn after `t` seconds of drawing (effects that play out in steps, like Ricochet's legs). */
  later(t, fn) {
    if (t <= 0) return fn();
    (this.laters = this.laters || []).push({ t, fn });
  }

  /** (0.93) The Seraph's hover: a slow bob, higher and leaning forward while it glides. Returns the height. */
  seraphHover(model, moving, dt) {
    model.seraT = (model.seraT || 0) + dt;
    const want = moving ? 0.22 : 0;
    model.seraLean = (model.seraLean || 0) + (want - (model.seraLean || 0)) * Math.min(1, dt * 5);
    model.seraLift = (model.seraLift || 0) + ((moving ? 0.75 : 0.45) - (model.seraLift || 0)) * Math.min(1, dt * 3);
    if (moving && Math.random() < dt * 10) this.burst(model.group.position.x, 0.35, model.group.position.z, { count: 1, color: 0xffe9b0, speed: 0.6, up: 0.4, size: 0.5, life: 0.7, gravity: -0.5 });
    return model.seraLift + 0.1 * Math.sin(model.seraT * 1.7);
  }
  /**
   * (0.93) An eye of the kind in the sky over the Seraph. (0.95) Drawn with more care: a soft gold glow round
   * it, a white rim (as if cut from the sky), a pearl-white eye, an amber iris with streaks, a deep pupil and two
   * points of light.
   */
  eyeTex() {
    if (this._eyeTex) return this._eyeTex;
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const cx = W / 2, cy = H / 2;
    const almond = (k = 1) => {
      g.beginPath();
      g.moveTo(cx - 210 * k, cy);
      g.bezierCurveTo(cx - 120 * k, cy - 112 * k, cx + 120 * k, cy - 112 * k, cx + 210 * k, cy);
      g.bezierCurveTo(cx + 120 * k, cy + 104 * k, cx - 120 * k, cy + 104 * k, cx - 210 * k, cy);
      g.closePath();
    };
    // the glow, and the white rim
    g.save();
    g.shadowColor = 'rgba(255, 214, 120, 0.95)';
    g.shadowBlur = 34;
    almond(1.06);
    g.fillStyle = '#fffaf0';
    g.fill();
    g.restore();
    // the white of the eye
    almond();
    const sc = g.createRadialGradient(cx, cy, 20, cx, cy, 220);
    sc.addColorStop(0, '#ffffff');
    sc.addColorStop(0.7, '#f6efe0');
    sc.addColorStop(1, '#d9c79c');
    g.fillStyle = sc;
    g.fill();
    g.save();
    almond();
    g.clip();
    // the iris: amber to deep gold, with fine streaks
    const R = 66;
    const ir = g.createRadialGradient(cx, cy, 8, cx, cy, R);
    ir.addColorStop(0, '#fff2b0');
    ir.addColorStop(0.35, '#f3b83c');
    ir.addColorStop(0.8, '#a8640c');
    ir.addColorStop(1, '#3a2204');
    g.fillStyle = ir;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255, 236, 170, 0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
      g.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
      g.stroke();
    }
    // the pupil, and the lights in it
    g.fillStyle = '#0c0804';
    g.beginPath();
    g.arc(cx, cy, 25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx - 20, cy - 22, 11, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(cx + 14, cy + 16, 5, 0, Math.PI * 2);
    g.fill();
    // the lid's shadow along the top
    const lid = g.createLinearGradient(0, cy - 100, 0, cy - 30);
    lid.addColorStop(0, 'rgba(60, 40, 10, 0.55)');
    lid.addColorStop(1, 'rgba(60, 40, 10, 0)');
    g.fillStyle = lid;
    g.fillRect(0, 0, W, cy);
    g.restore();
    // the line of the lids: heavier above
    almond();
    g.lineWidth = 7;
    g.strokeStyle = '#2a1c08';
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 210, cy);
    g.bezierCurveTo(cx - 120, cy - 112, cx + 120, cy - 112, cx + 210, cy);
    g.lineWidth = 12;
    g.stroke();
    this._eyeTex = new THREE.CanvasTexture(c);
    this._eyeTex.colorSpace = THREE.SRGBColorSpace;
    return this._eyeTex;
  }
  /** (0.95) A soft round glow (for the Seraph's shots and its light). */
  glowTex() {
    if (this._glowTex) return this._glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255, 255, 255, 1)');
    r.addColorStop(0.25, 'rgba(255, 236, 180, 0.85)');
    r.addColorStop(0.6, 'rgba(255, 200, 110, 0.25)');
    r.addColorStop(1, 'rgba(255, 190, 90, 0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    this._glowTex = new THREE.CanvasTexture(c);
    return this._glowTex;
  }
  /**
   * (0.95) The Seraph's shots, made properly: Dawnlance a spear of light (a white core in a gold sheath, a
   * point, a halo turning round it); a Choir's shot a shard of light in its own glow.
   */
  seraphShot(m, kind) {
    m.material = new THREE.MeshBasicMaterial({ visible: false }); // (its own: the shared shot materials stay seen)
    const add = (o) => (m.add(o), o);
    const glow = new THREE.SpriteMaterial({ map: this.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a0 });
    const bright = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending });
    const body = new THREE.Group();
    add(body);
    if (kind === 'lance') {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8).rotateX(Math.PI / 2), bright(0xffffff));
      const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 3.6, 12).rotateX(Math.PI / 2), bright(0xffc860, 0.55));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 12).rotateX(Math.PI / 2), bright(0xfff4d8));
      tip.position.z = 2.2;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 24), bright(0xffe9b0, 0.8));
      halo.position.z = 1.3;
      body.add(core, sheath, tip, halo);
      const sp = new THREE.Sprite(glow);
      sp.scale.set(2.2, 2.2, 1);
      sp.position.z = 1.6;
      body.add(sp);
      m.userData.halo = halo;
    } else if (kind === 'holy') {
      // (0.98) its strike: a bead of white light in a gold glow, a thin ring turning round it, a tail
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), bright(0xffffff));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 10).rotateX(-Math.PI / 2), bright(0xffd98a, 0.55));
      tail.position.z = -0.6;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20), bright(0xfff2c8, 0.85));
      const sp = new THREE.Sprite(glow);
      sp.scale.set(1.6, 1.6, 1);
      body.add(core, tail, ring, sp);
      m.userData.halo = ring;
    } else {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), bright(0xffffff));
      shard.scale.set(0.8, 0.8, 2.2);
      const sp = new THREE.Sprite(glow);
      sp.scale.set(1.5, 1.5, 1);
      body.add(shard, sp);
      m.userData.halo = shard;
    }
    m.userData.body = body;
  }
  /** (0.93) A thing that plays out over `dur` seconds: up(k, dt) each frame, then it is taken away. */
  fxBit(obj, dur, up) {
    this.scene.add(obj);
    (this.fxBits = this.fxBits || []).push({ obj, t: 0, dur, up });
    return obj;
  }
  /** (0.93) An eye that opens (a blink in reverse), stares, and closes: at (x, y, z), `size` wide. */
  skyEye(x, y, z, size, dur, delay = 0) {
    // (0.95) it opens wide with a little spring, a glow swells behind it, it holds with a slow breath of light,
    // and closes quickly (a blink), the glow lingering a moment after
    const g = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ map: this.eyeTex(), transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    const gm = new THREE.SpriteMaterial({ map: this.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd98a, opacity: 0 });
    const glow = new THREE.Sprite(gm);
    glow.scale.set(size * 1.6, size * 1.1, 1);
    g.add(glow, s);
    g.position.set(x, y, z);
    s.scale.set(size, 0.01, 1);
    const back = (u) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2); // ease out, overshooting
    return this.fxBit(g, dur + delay + 0.2, (k, t) => {
      const u = Math.max(0, t - delay) / dur;
      const open = u <= 0 ? 0 : u < 0.22 ? back(u / 0.22) : u > 0.9 ? Math.max(0, (1 - u) / 0.1) : 1;
      const breath = 1 + 0.04 * Math.sin(t * 6);
      s.scale.set(size * (0.85 + 0.15 * Math.min(1, open)) * breath, Math.max(0.01, size * 0.5 * open), 1);
      mat.opacity = Math.min(1, open * 1.6);
      gm.opacity = u <= 0 ? 0 : u < 1 ? 0.55 * Math.min(1, u * 4) * breath : Math.max(0, 0.55 * (1 - (t - delay - dur) / 0.2));
    });
  }
  /** (0.93) A cloud: a cluster of soft white puffs that swells in and thins away. */
  skyCloud(x, y, z, size, dur, { grow = 0.4, drift = 0 } = {}) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9aa4b8, emissiveIntensity: 0.55, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
    const geo = this._puffGeo || (this._puffGeo = new THREE.IcosahedronGeometry(1, 2));
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.55 + 0.25 * ((i * 7) % 3);
      m.position.set(Math.cos(a) * r * size, (i % 3) * 0.12 * size, Math.sin(a) * r * 0.6 * size);
      m.scale.setScalar(size * (i === 0 ? 0.6 : 0.36 + 0.08 * (i % 3)));
      g.add(m);
    }
    g.position.set(x, y, z);
    return this.fxBit(g, dur, (k) => {
      const s = 1 - grow + grow * Math.min(1, k * 3);
      g.scale.setScalar(s);
      g.position.y = y + drift * k;
      mat.opacity = Math.min(0.92, k * 6) * (k > 0.7 ? (1 - k) / 0.3 : 1);
    });
  }
  /** (0.93) The Seraph gathering light before a skill: eyes, clouds, light where it will land. */
  seraphWind(ev) {
    const d = ev.dur || 0.5;
    if (ev.slot === 'q') {
      // a crown of eyes opens over its head, and one more where the lance will go
      for (let i = 0; i < 5; i++) {
        const a = ev.dir - 1.5 + (i / 4) * 3.0; // an arc ahead of it (none between it and the camera)
        this.skyEye(ev.x + Math.cos(a) * 1.2, 3.5 + 0.35 * Math.cos((i - 2) * 0.8), ev.z + Math.sin(a) * 1.2, 0.5, d + 0.45, i * 0.04);
      }
      this.skyEye(ev.x + Math.cos(ev.dir) * 4, 2.6, ev.z + Math.sin(ev.dir) * 4, 0.9, d + 0.4, 0.1);
      this.burst(ev.x + Math.cos(ev.dir) * 0.6, 1.7, ev.z + Math.sin(ev.dir) * 0.6, { count: 14, color: 0xfff0c0, speed: 1.2, up: 0.6, life: d, gravity: -1 });
    } else if (ev.slot === 'w') {
      // clouds drawn in round it
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = this.skyCloud(ev.x + Math.cos(a) * 3.2, 1.2, ev.z + Math.sin(a) * 3.2, 0.7, d + 0.1);
        const sx = c.position.x, sz = c.position.z;
        this.fxBits[this.fxBits.length - 1].up2 = (k) => c.position.set(sx + (ev.x - sx) * k * 0.6, 1.2, sz + (ev.z - sz) * k * 0.6);
      }
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xfff4d8, from: ev.radius || 5, to: 1, dur: d, opacity: 0.6 });
    } else if (ev.slot === 'r') {
      // a cloud over where it will come down, its eyes opening on what is beneath (as in the old icons)
      const x = ev.tx, z = ev.tz;
      const objs = [this.skyCloud(x, 6.6, z, 2.2, d + 0.9, { grow: 0.7 })];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        objs.push(this.skyEye(x + Math.cos(a) * 3.0, 6.2 + (i % 2) * 0.9, z + Math.sin(a) * 3.0, 1.3, d + 0.6, 0.05 + i * 0.06));
      }
      objs.push(this.flash(this.ringGeo(), { x, z, y: 0.12, color: 0xffe9b0, from: 0.5, to: ev.radius || 5, dur: d, opacity: 0.8 }));
      objs.push(this.flash(this.discGeo(), { x, z, y: 0.1, color: 0xfff4d8, from: ev.radius || 5, to: ev.radius || 5, dur: d + 0.2, opacity: 0.18 }));
      this._rWind = ev.track ? { objs, x, z } : null; // (0.98) it follows its foe (seraphTrack)
    }
  }
  /** (0.94) Hand of Heaven: a fist of light comes down out of a cloud onto (x, z) in `delay` seconds. */
  seraphFist(x, z, delay, radius, teleId = null) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff8ee, emissive: 0xffd98a, emissiveIntensity: 0.65, roughness: 0.6, transparent: true, opacity: 0.96 });
    const box = (w, h, d, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    // knuckles down: the back of the hand on top, four curled fingers in a row beneath, the thumb across
    box(1.7, 1.2, 1.5, 0, 0.6, 0);
    for (let i = 0; i < 4; i++) box(0.4, 0.55, 0.62, -0.62 + i * 0.41, -0.15, 0.35).rotation.x = 0.3;
    box(0.42, 0.42, 1.1, -0.95, 0.2, 0.1).rotation.y = 0.5;
    box(1.3, 2.2, 1.2, 0, 2.2, 0); // the arm, up into the cloud
    g.scale.setScalar(radius / 3);
    const top = 7.5, bottom = 0.4; // out of the cloud its gathering made (seraphWind)
    g.position.set(x, top, z);
    this.flash(this.ringGeo(), { x, z, y: 0.12, color: 0xffe9b0, from: radius * 1.3, to: radius * 0.4, dur: delay, opacity: 0.8 });
    this.fxBit(g, delay + 0.5, (k, t) => {
      const u = Math.min(1, t / delay);
      g.position.y = top + (bottom - top) * u * u; // gathering speed as it falls
      const tg = teleId != null && this._world && this._world.telegraphs.find((o) => o.id === teleId); // (0.98) it follows its foe down
      if (tg) g.position.set(tg.x, g.position.y, tg.z);
      mat.opacity = t > delay ? 0.96 * (1 - (t - delay) / 0.5) : 0.96;
    });
  }
  /** (0.98) Dawnlance as a ray: leg by leg as it travels (90 m a second), each a white core in a gold sheath. */
  seraphLaser(ev) {
    const pts = ev.pts || [];
    if (pts.length < 2) return;
    const geo = this._rayGeo || (this._rayGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0));
    let t = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      const wide = i === 1 && ev.line;
      const leg = () => {
        const g = new THREE.Group();
        const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
        const sheath = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
        core.scale.set(len, wide ? 0.12 : 0.06, wide ? 0.12 : 0.06);
        sheath.scale.set(len, wide ? 0.55 : 0.22, wide ? 0.55 : 0.22);
        g.add(core, sheath);
        g.position.set(ax, i === 1 ? 1.75 : 1.3, az);
        g.rotation.y = -Math.atan2(bz - az, bx - ax);
        if (i > 1) g.rotation.z = Math.atan2(0, len);
        this.fxBit(g, 0.6, (k) => {
          core.material.opacity = 1 - k * k;
          sheath.material.opacity = 0.5 * (1 - k);
          sheath.scale.set(len, (wide ? 0.55 : 0.22) * (1 + k), (wide ? 0.55 : 0.22) * (1 + k));
        });
        this.burst(bx, 1.3, bz, { count: 10, color: 0xfff0c0, speed: 4, up: 3, life: 0.4, size: 0.5 });
        this.flash(this.ringGeo(), { x: bx, z: bz, y: 0.1, color: 0xffe9b0, from: 0.3, to: 1.6, dur: 0.3, opacity: 0.7 });
      };
      this.later(t, leg);
      t += len / 90;
    }
    this.shake = Math.max(this.shake, 0.15);
  }
  /** (0.93) The Seraph's skills landing, and its strike: light, eyes, clouds, feathers. */
  seraphFx(ev) {
    if (ev.kind === 'lance' || ev.kind === 'choir') {
      // (0.94) loosed: light from its hand (the lance and the eyes fly as shots)
      this.burst(ev.x + Math.cos(ev.dir) * 0.8, 1.8, ev.z + Math.sin(ev.dir) * 0.8, { count: 16, color: 0xfff0c0, speed: 4, up: 2, life: 0.4, size: 0.6 });
      this.shake = Math.max(this.shake, 0.15);
    } else if (ev.kind === 'halo') {
      const R = ev.radius || 6;
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xfff2c8, from: R, to: R, dur: 5, opacity: 0.7 });
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffe9b0, from: R, to: R, dur: 5, opacity: 0.18 });
      for (let i = 0; i < 6; i++) this.skyEye(ev.x + Math.cos(i * 1.047) * R * 0.8, 2.4, ev.z + Math.sin(i * 1.047) * R * 0.8, 0.7, 4.6, i * 0.08);
    } else if (ev.kind === 'rain') {
      this.flash(this.ringGeo(), { x: ev.tx, z: ev.tz, y: 0.12, color: 0xffe9b0, from: 0.5, to: ev.radius || 10, dur: 0.5, opacity: 0.7 });
    } else if (ev.kind === 'ray') {
      // one ray of the Rain of Eyes: an eye opens above, and looks down
      this.skyEye(ev.x, 6.4, ev.z, 1.2, 0.6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 6, 10, 1, true), mat);
      ray.position.set(ev.x, 3, ev.z);
      this.fxBit(ray, 0.35, (k) => {
        mat.opacity = 0.8 * (1 - k);
      });
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffe9b0, from: 0.4, to: 1.6, dur: 0.3, opacity: 0.6 });
      this.burst(ev.x, 0.6, ev.z, { count: 6, color: 0xfff4d8, speed: 4, up: 3, life: 0.35, size: 0.5 });
    } else if (ev.kind === 'hand') {
      // the pointing: light gathers at its raised hand
      this.burst(ev.x, 2.6, ev.z, { count: 14, color: 0xfff4d8, speed: 2, up: 4, life: 0.5, size: 0.6 });
    } else if (ev.kind === 'lance_old') {
      const len = ev.range || 16, w = ev.width || 1.8;
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, w * 0.5, w * 0.5), mat);
      beam.position.set(ev.x + Math.cos(ev.dir) * len * 0.5, 1.6, ev.z + Math.sin(ev.dir) * len * 0.5);
      beam.rotation.y = -ev.dir;
      this.fxBit(beam, 0.5, (k) => {
        beam.scale.set(1, Math.max(0.05, 1 - k), Math.max(0.05, 1 - k));
        mat.opacity = 0.95 * (1 - k);
      });
      this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.1, dir: ev.dir, color: 0xffd98a, from: len, to: len, sz: (w * 1.6) / len, dur: 0.6, opacity: 0.6 });
      for (let i = 1; i <= 4; i++) this.skyEye(ev.x + Math.cos(ev.dir) * (len * i) / 4.5, 2.8, ev.z + Math.sin(ev.dir) * (len * i) / 4.5, 1.0, 0.5, i * 0.05);
      this.burst(ev.x + Math.cos(ev.dir) * len, 1.6, ev.z + Math.sin(ev.dir) * len, { count: 18, color: 0xfff0c0, speed: 6, up: 4, life: 0.6 });
      this.shake = Math.max(this.shake, 0.3);
    } else if (ev.kind === 'wings') {
      // wings open: a ring of cloud thrown out, feathers, a ring of light
      const R = ev.radius || 5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const c = this.skyCloud(ev.x, 0.9, ev.z, 0.75, 0.9, { grow: 0.2 });
        this.fxBits[this.fxBits.length - 1].up2 = (k) => c.position.set(ev.x + Math.cos(a) * R * Math.min(1, k * 2.2), 0.9 + k * 0.6, ev.z + Math.sin(a) * R * Math.min(1, k * 2.2));
      }
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xffffff, from: 0.6, to: R * 1.15, dur: 0.45, opacity: 1 });
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffe9b0, from: R * 0.3, to: R, dur: 0.5, opacity: 0.4 });
      this.burst(ev.x, 2.2, ev.z, { count: 28, color: 0xfff6e0, speed: 8, up: 5, size: 0.55, life: 1.1, gravity: 2 }); // feathers
      this.shake = Math.max(this.shake, 0.35);
    } else if (ev.kind === 'descent') {
      // it rises: light gathers at the cloud
      this.burst(ev.x, 1.2, ev.z, { count: 24, color: 0xfff4d8, speed: 2, up: 12, size: 0.6, life: 0.6, gravity: 0 });
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffffff, from: 0.5, to: 3, dur: 0.4, opacity: 0.8 });
    } else if (ev.kind === 'land') {
      // a pillar of light from the cloud, and a ring of cloud along the ground
      const R = ev.radius || 5;
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 14, 24, 1, true), mat);
      pillar.position.set(ev.x, 7.5, ev.z);
      mat.opacity = 0.5;
      this.fxBit(pillar, 0.7, (k) => {
        pillar.scale.set(1 + 0.8 * k, 1, 1 + 0.8 * k);
        mat.opacity = 0.5 * (1 - k);
      });
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xffffff, from: 0.8, to: R * 1.4, dur: 0.6, opacity: 0.9 });
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffe9b0, from: R * 0.4, to: R, dur: 0.6, opacity: 0.35 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const c = this.skyCloud(ev.x, 0.6, ev.z, 0.9, 1.2, { grow: 0.3 });
        this.fxBits[this.fxBits.length - 1].up2 = (k) => c.position.set(ev.x + Math.cos(a) * R * 1.25 * Math.min(1, k * 1.8), 0.6, ev.z + Math.sin(a) * R * 1.25 * Math.min(1, k * 1.8));
      }
      this.burst(ev.x, 1, ev.z, { count: 36, color: 0xfff0c0, speed: 12, up: 8, size: 0.6, life: 0.9 });
      this.shake = Math.max(this.shake, 0.9);
    } else if (ev.kind === 'strike') {
      // a crescent of light, and for a moment an eye where it lands
      this.flash(this.sectorGeo(2.8, 0.5), { x: ev.x, z: ev.z, y: 1.2, dir: ev.dir, color: 0xffe2a0, from: 2.6, to: 3.4, dur: 0.28, opacity: 0.75 });
      this.skyEye(ev.tx, 2.6, ev.tz, 0.8, 0.35);
      this.burst(ev.tx, 1.2, ev.tz, { count: 10, color: 0xfff4d8, speed: 5, up: 3, life: 0.4 });
    } else if (ev.kind === 'pray') {
      // (0.98) the light leaves its joined hands
      const hx = ev.x + Math.cos(ev.dir) * 0.9, hz = ev.z + Math.sin(ev.dir) * 0.9;
      this.burst(hx, 1.8, hz, { count: 10, color: 0xfff4d8, speed: 3, up: 1, life: 0.35, size: 0.5 });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a0 }));
      sp.position.set(hx, 1.8, hz);
      this.fxBit(sp, 0.3, (k) => { sp.scale.setScalar(0.6 + 1.6 * k); sp.material.opacity = 1 - k; });
    } else if (ev.kind === 'wake') {
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffe9b0, from: ev.radius * 0.5, to: ev.radius, dur: 0.35, opacity: 0.45 });
      this.burst(ev.x, 0.4, ev.z, { count: 5, color: 0xfff4d8, speed: 1.5, up: 3, life: 0.5, size: 0.45, gravity: -1 });
    } else if (ev.kind === 'beam') {
      // (0.98) Sunfall: a shaft of sunlight out of the sky, burning the ground where it stands
      const R = ev.radius || 3;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const shaft = new THREE.Mesh(this._sunGeo || (this._sunGeo = new THREE.CylinderGeometry(1, 1, 22, 20, 1, true)), mat);
      shaft.position.set(ev.x, 11, ev.z);
      shaft.scale.set(R * 0.55, 1, R * 0.55);
      this.fxBit(shaft, 0.26, (k) => { mat.opacity = 0.55 * (1 - k * 0.8); shaft.scale.set(R * (0.55 + 0.1 * k), 1, R * (0.55 + 0.1 * k)); });
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffd070, from: R * 0.7, to: R, dur: 0.25, opacity: 0.4 });
      this.burst(ev.x, 0.5, ev.z, { count: 4, color: 0xfff0b0, speed: 3, up: 4, life: 0.4, size: 0.5 });
    } else if (ev.kind === 'sun' || ev.kind === 'ascend') {
      this.burst(ev.x, 2.2, ev.z, { count: ev.kind === 'ascend' ? 50 : 20, color: 0xfff0c0, speed: ev.kind === 'ascend' ? 7 : 3, up: 6, life: 0.9, size: 0.6 });
      if (ev.kind === 'ascend') {
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xffffff, from: 0.5, to: 7, dur: 0.6, opacity: 1 });
        for (let i = 0; i < 8; i++) this.skyEye(ev.x + Math.cos(i * 0.785) * 2.6, 3.6, ev.z + Math.sin(i * 0.785) * 2.6, 0.7, 0.9, i * 0.04);
        this.shake = Math.max(this.shake, 0.5);
      }
    } else if (ev.kind === 'glide') {
      const n = 6;
      for (let i = 0; i < n; i++) this.skyCloud(ev.x + (ev.ex - ev.x) * (i / n), 0.8, ev.z + (ev.ez - ev.z) * (i / n), 0.55, 0.9, { grow: 0.5, drift: 0.6 });
    }
  }

  updateFlashes(dt) {
    if (this.fxBits && this.fxBits.length) {
      // (0.93) the Seraph's eyes, clouds and light
      for (const b of this.fxBits) {
        b.t += dt;
        const k = Math.min(1, b.t / b.dur);
        b.up(k, b.t);
        if (b.up2) b.up2(k);
        if (k >= 1) {
          this.scene.remove(b.obj);
          b.obj.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry !== this._puffGeo && o.geometry.dispose) o.geometry.dispose(); });
          b.done = true;
        }
      }
      this.fxBits = this.fxBits.filter((b) => !b.done);
    }
    if (this.laters && this.laters.length) {
      const due = [];
      this.laters = this.laters.filter((l) => ((l.t -= dt) > 0 ? true : (due.push(l), false)));
      for (const l of due) l.fn();
    }
    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const s = lerp(f.from, f.to, easeOut(k));
      f.mesh.scale.set(s * f.sx, 1, s * f.sz);
      f.mat.opacity = f.opacity * (1 - k);
      if (k >= 1) {
        this.scene.remove(f.mesh);
        f.mat.dispose();
        f.done = true;
      }
    }
    this.flashes = this.flashes.filter((f) => !f.done);
  }

  moveMarker(x, z, attack) {
    this.flash(this.ringGeo(), { x, z, color: attack ? 0xff6b6b : 0x8dffb0, from: 1.1, to: 0.25, dur: 0.35, opacity: 0.9, additive: false });
  }

  /** React to a simulation event with visuals. */
  onEvent(ev, world) {
    if (ev.ally && !ev.inner) {
      // A friend's attack or skill (0.41.1): its effects show, but only this player's own shake the camera.
      const shake = this.shake;
      this.onEvent(Object.assign({}, ev, { inner: true }), world);
      this.shake = shake;
      return;
    }
    const p = world.player;
    switch (ev.type) {
      case 'swing': {
        // (a friend's swing animates their model, not this player's: 0.41.1)
        const an = ev.ally ? this.allyAnim(ev.hero) : this.heroAnim;
        an.swing = 0;
        an.swingDur = Math.max(0.12, ev.dur * 1.5);
        // the swipe only for melee swings (0.37: the Archer's draw showed a sword arc in front of her)
        if (ev.seraph) break; // (0.93) the Seraph's strike draws its own crescent as it lands (seraphFx)
        if ((ev.ally ? an.cls : this.heroCls) !== 'archer' && (ev.ally ? an.cls : this.heroCls) !== 'mage') this.flash(this.sectorGeo(2.4, 0.55), { x: ev.x, z: ev.z, y: 1.0, dir: ev.dir, color: 0xdff4ff, from: 2.4, to: 3.0, dur: 0.2, opacity: 0.5 });
        break;
      }
      case 'galeRain':
        // (0.96) the wind's arrows fall on them (instanced: a handful each, however many land)
        for (const [x, z, n] of ev.pts || []) this.rainArrows(x, z, Math.min(3, n));
        break;
      case 'shadowSpin':
        // (0.95) a beat of the shade's Whirlwind
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: 0x7a3cff, from: ev.radius * 0.6, to: ev.radius, dur: 0.25, opacity: 0.55 });
        break;
      case 'seraphFx':
        this.seraphFx(ev); // (0.93)
        break;
      case 'seraphBlink': {
        // (0.98) gone in a flash of light, and there
        for (const [x, z, n] of [[ev.fx, ev.fz, 18], [ev.x, ev.z, 28]]) {
          this.flash(this.discGeo(), { x, z, y: 0.1, color: 0xfff4d8, from: 0.4, to: 2.4, dur: 0.35, opacity: 0.6 });
          this.burst(x, 1.6, z, { count: n, color: 0xfff0c0, speed: 4, up: 5, life: 0.6, size: 0.55 });
        }
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 7, 12, 1, true), mat);
        col.position.set(ev.x, 3.5, ev.z);
        this.fxBit(col, 0.35, (k) => { mat.opacity = 0.7 * (1 - k); col.scale.set(1 - 0.6 * k, 1, 1 - 0.6 * k); });
        break;
      }
      case 'seraphTrack':
        // (0.98) the gathering cloud follows its foe
        if (this._rWind) {
          const dx = ev.x - this._rWind.x, dz = ev.z - this._rWind.z;
          for (const o of this._rWind.objs) if (o && o.position) [o.position.x, o.position.z] = [o.position.x + dx, o.position.z + dz];
          [this._rWind.x, this._rWind.z] = [ev.x, ev.z];
        }
        break;
      case 'seraphMend':
        this.burst(ev.x, 1.6, ev.z, { count: 16, color: 0xb8ffd0, speed: 2, up: 4, life: 0.7, size: 0.5 });
        break;
      case 'trialStart':
        // (0.98) the far sky opens
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffe9b0, from: 1, to: 14, dur: 1.2, opacity: 0.9 });
        for (let i = 0; i < 12; i++) this.skyEye(ev.x + Math.cos(i * 0.52) * 8, 8 + (i % 3), ev.z + Math.sin(i * 0.52) * 8, 1.6, 2.4, i * 0.08);
        this.shake = Math.max(this.shake, 0.8);
        break;
      case 'trialStare':
        for (let i = 0; i < 3; i++) this.skyEye(ev.x + (i - 1) * 1.6, 6.2, ev.z, 0.9, 0.8, i * 0.06);
        break;
      case 'trialGaze': {
        // a line of sight: a burning stare along the ground
        const c = Math.cos(ev.a), s = Math.sin(ev.a);
        this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.1, dir: ev.a, color: 0xff5a3a, from: ev.len, to: ev.len, sz: ev.w / ev.len, dur: 0.5, opacity: 0.7 });
        for (let i = 1; i <= 6; i++) this.burst(ev.x + c * (ev.len * i) / 6, 1, ev.z + s * (ev.len * i) / 6, { count: 5, color: 0xffa060, speed: 3, up: 3, life: 0.4 });
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case 'cast': {
        const an = ev.ally ? this.allyAnim(ev.hero) : this.heroAnim;
        if (ev.seraph === 'wind') {
          // (0.93) the Seraph gathers light: its own pose, and the sky answers
          an.move = ev.fx;
          this.seraphWind(ev);
          break;
        }
        if (ev.fx === 'dash' && (ev.ally ? (this.allyViews.get(ev.hero) || {}).look === 'statue' : this.heroCls === 'statue')) this.seraphFx({ kind: 'glide', x: ev.x, z: ev.z, ex: ev.ex, ez: ev.ez });
        if (ev.fx === 'seraphLaser') {
          // (0.98) Dawnlance: a ray from its hands, glancing from foe to foe
          an.move = 'line';
          this.seraphLaser(ev);
          break;
        }
        if (ev.fx === 'sunfall') {
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.12, color: 0xffd070, from: 0.5, to: (ev.radius || 3) * 1.6, dur: 0.5, opacity: 0.9 });
          this.skyEye(ev.x, 9, ev.z, 3.2, ev.dur || 3);
          break;
        }
        if (ev.fist) {
          this.seraphFist(ev.x, ev.z, ev.delay || 0.5, ev.radius || 6, ev.tele); // (0.94) Hand of Heaven
          break;
        }
        if (ev.halo) {
          this.seraphFx({ kind: 'halo', x: ev.x, z: ev.z, radius: ev.radius });
          break;
        }
        // Warrior abilities send no fx name, so fall back on the slot.
        const fx = ev.fx || { q: 'cone', w: 'nova', e: 'dash', r: 'leap' }[ev.slot];
        if (fx !== 'cone' && !ev.noMove && !ev.echo) an.move = fx; // a skill with its own animation (0.96: a shade's copy moves the shade, not you) (rigged.js moves; noMove: the shot that ends a channel, already animated)
        if (fx === 'cone') {
          an.swing = 0;
          an.swingDur = 0.2;
          if (!ev.echo) an.move = 'cone';
          // One shape, flat on the ground, exactly the area that is hit (0.36.1: a raised copy
          // and a wider ground sweep made it unclear where the hit really was).
          if (ev.fire) {
            // (0.72) Dragon's Breath: a cone of flame, embers thrown along it, the ground left glowing
            this.flash(this.sectorGeo(ev.angle, 0.02), { x: ev.x, z: ev.z, y: 0.1, dir: ev.dir, color: 0xff7a2a, from: ev.range * 0.3, to: ev.range, dur: 0.45, opacity: 0.75 });
            this.flash(this.sectorGeo(ev.angle * 0.7, 0.02), { x: ev.x, z: ev.z, y: 0.12, dir: ev.dir, color: 0xffd36a, from: ev.range * 0.2, to: ev.range * 0.8, dur: 0.35, opacity: 0.8 });
            for (let i = 0; i < 9; i++) {
              const a = ev.dir + (i / 8 - 0.5) * ev.angle * 0.9;
              const r = ev.range * (0.35 + (i % 3) * 0.22);
              this.burst(ev.x + Math.cos(a) * r, 0.9, ev.z + Math.sin(a) * r, { count: 7, color: i % 2 ? 0xff5a1f : 0xffc24a, speed: 5, up: 5, life: 0.6 });
            }
            this.shake = Math.max(this.shake, 0.3);
            break;
          }
          this.flash(this.sectorGeo(ev.angle, 0.12), { x: ev.x, z: ev.z, y: 0.08, dir: ev.dir, color: ev.echo ? 0xffe2a0 : 0xd8f2ff, from: ev.range * 0.85, to: ev.range, dur: 0.32, opacity: 0.7 });
          this.flash(this.sectorGeo(ev.angle, 0.93), { x: ev.x, z: ev.z, y: 0.09, dir: ev.dir, color: 0xffffff, from: ev.range, to: ev.range, dur: 0.32, opacity: 0.9 }); // its edge
          // sparks thrown off along the arc
          for (let i = -2; i <= 2; i++) {
            const a = ev.dir + (i / 2) * ev.angle * 0.45;
            this.burst(ev.x + Math.cos(a) * ev.range * 0.65, 1, ev.z + Math.sin(a) * ev.range * 0.65, { count: 5, color: ev.echo ? 0xffe2a0 : 0xe8f6ff, speed: 7, up: 3, life: 0.35 });
          }
          this.shake = Math.max(this.shake, 0.22);
        } else if (fx === 'barrage') {
          an.swing = 0;
          an.swingDur = 0.12;
        } else if (fx === 'nova' && ev.pull) {
          // (0.72) a drag inwards: violet rings closing, dust pulled to the middle
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xb99cff, from: ev.radius * 1.1, to: 0.6, dur: 0.38, opacity: 0.9 });
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.6, color: 0xffffff, from: ev.radius * 0.8, to: 0.4, dur: 0.3, opacity: 0.6 });
          this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x6a4ad0, from: ev.radius, to: 1, dur: 0.4, opacity: 0.25 });
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this.burst(ev.x + Math.cos(a) * ev.radius * 0.9, 0.5, ev.z + Math.sin(a) * ev.radius * 0.9, { count: 3, color: 0xd2c2ff, speed: 2, up: 1, life: 0.35 });
          }
          this.shake = Math.max(this.shake, 0.28);
        } else if (fx === 'nova') {
          an.spin = 1;
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.9, color: 0xbfeaff, from: ev.pull ? ev.radius : 1, to: ev.pull ? 1 : ev.radius, dur: 0.32, opacity: 0.9 });
          this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x7fd8ff, from: ev.radius, to: ev.radius, dur: 0.3, opacity: 0.22 });
          // a second, ground-level ring and dust kicked out by the spin
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.12, color: 0xffffff, from: 0.6, to: ev.radius * 1.12, dur: 0.42, opacity: 0.7 });
          this.burst(ev.x, 0.4, ev.z, { count: 22, color: 0xd6e9f5, speed: 9, up: 2, life: 0.45 });
          this.shake = Math.max(this.shake, 0.26);
        } else if (fx === 'dash') {
          const len = Math.hypot(ev.ex - ev.x, ev.ez - ev.z);
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.5, dir: ev.dir, color: 0x9fe8ff, sx: len, sz: 1.3, dur: 0.35, opacity: 0.7 });
          // a bright core to the streak, dust at the start and a burst where it ends
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.15, dir: ev.dir, color: 0xffffff, sx: len, sz: 0.45, dur: 0.3, opacity: 0.6 });
          this.burst(ev.x, 0.3, ev.z, { count: 10, color: 0xc9dbe6, speed: 5, up: 2, life: 0.4 });
          this.burst(ev.ex, 1, ev.ez, { count: 16, color: 0xe8f6ff, speed: 8, up: 3, life: 0.35 });
          this.shake = Math.max(this.shake, 0.2);
        } else if (fx === 'leap') {
          this.burst(ev.x, 0.3, ev.z, { count: 14, color: 0x9fe8ff, speed: 5, up: 6 });
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.12, color: 0xffffff, from: 0.4, to: 2.6, dur: 0.3, opacity: 0.6 });
        } else if (fx === 'aim') {
          // (0.51) Deadeye being drawn: a thin gold sightline for as long as she aims
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.1, dir: ev.dir, color: 0xffd27a, sx: ev.range, sz: 0.12, dur: ev.channel || 1, opacity: 0.45 });
        } else if (fx === 'deadeye') {
          // One shot across the map (0.42): a white-hot core in a gold streak, a flash at the bow
          // and a burst where it lands.
          an.swing = 0;
          an.swingDur = 0.32;
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.1, dir: ev.dir, color: 0xffc860, sx: ev.range, sz: ev.width * 0.9, dur: 0.7, opacity: 0.95 });
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.12, dir: ev.dir, color: 0xfffbea, sx: ev.range, sz: ev.width * 0.32, dur: 0.5, opacity: 1, additive: false });
          this.flash(this.ringGeo(), { x: ev.x + Math.cos(ev.dir) * 0.8, z: ev.z + Math.sin(ev.dir) * 0.8, y: 1.1, color: 0xfff0c0, from: 0.3, to: 2.6, dur: 0.3, opacity: 0.9 });
          this.burst(ev.x + Math.cos(ev.dir) * 0.9, 1.1, ev.z + Math.sin(ev.dir) * 0.9, { count: 14, color: 0xfff2c8, speed: 9, up: 1, life: 0.3 });
          if (ev.hit) {
            this.flash(this.ringGeo(), { x: ev.tx, z: ev.tz, y: 0.6, color: 0xffd27a, from: 0.4, to: 4.2, dur: 0.45, opacity: 1 });
            this.flash(this.discGeo(), { x: ev.tx, z: ev.tz, color: 0xffe2a0, from: 0.5, to: 3, dur: 0.35, opacity: 0.4 });
            this.burst(ev.tx, 1.2, ev.tz, { count: 36, color: 0xffd890, speed: 12, up: 4, life: 0.55 });
          }
          this.shake = Math.max(this.shake, 0.5);
        } else if (fx === 'focus') {
          // Steady Breath (0.42): a slow gold ring closing in, and motes drawn into the hero.
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xffe2a0, from: 3.2, to: 0.6, dur: 0.6, opacity: 0.8 });
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.3, color: 0xfff2c8, from: 2.2, to: 0.4, dur: 0.5, opacity: 0.6 });
          this.burst(ev.x, 1.4, ev.z, { count: 12, color: 0xffe9b0, speed: -3, up: 0.5, gravity: 0, life: 0.5 });
        } else if (fx === 'ricochet') {
          // Ricochet (0.42): the arrow glances from enemy to enemy, one streak per leg as it flies.
          an.swing = 0;
          an.swingDur = 0.18;
          let t = 0;
          for (let i = 1; i < ev.pts.length; i++) {
            const [x0, z0] = ev.pts[i - 1], [x1, z1] = ev.pts[i];
            const len = Math.hypot(x1 - x0, z1 - z0);
            const dir = Math.atan2(z1 - z0, x1 - x0);
            this.later(t, () => {
              this.flash(this.rectGeo(), { x: x0, z: z0, y: 1.0, dir, color: 0xffd27a, sx: len, sz: 0.5, dur: 0.3, opacity: 0.8 });
              this.flash(this.rectGeo(), { x: x0, z: z0, y: 1.02, dir, color: 0xfffbea, sx: len, sz: 0.16, dur: 0.24, opacity: 1, additive: false });
            });
            t += len / (ev.speed || 40);
            this.later(t, () => this.burst(x1, 1.0, z1, { count: 8, color: 0xfff2c8, speed: 6, up: 2, life: 0.3 }));
          }
        } else if (fx === 'hurricane') {
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.4, color: 0xd9fff1, from: 0.5, to: 6, dur: 0.5, opacity: 0.9 });
          this.burst(ev.x, 1, ev.z, { count: 40, color: 0xe6fff6, speed: 10, up: 3, gravity: 0, life: 0.7 });
        } else if (fx === 'frenzy') {
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.4, color: 0xff3b3b, from: 0.6, to: ev.radius, dur: 0.4, opacity: 1 });
          this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xa80f1e, from: 0.5, to: ev.radius, dur: 0.35, opacity: 0.55 });
          this.burst(ev.x, 1.2, ev.z, { count: 30, color: 0xff4a4a, speed: 7, up: 5, life: 0.6 });
          this.shake = Math.max(this.shake, 0.3);
        } else if (fx === 'bastion') {
          an.spin = 1;
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: 0xffd27a, from: ev.radius, to: 0.8, dur: 0.45, opacity: 1 });
          this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xffe2a0, from: 0.5, to: ev.radius, dur: 0.4, opacity: 0.35 });
          this.shake = Math.max(this.shake, 0.35);
        } else if (fx === 'line') {
          an.swing = 0;
          an.swingDur = 0.2;
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.0, dir: ev.dir, color: 0xfff0b0, sx: ev.range, sz: ev.width, dur: 0.3, opacity: 0.9 });
        } else if (fx === 'strike') {
          an.swing = 0;
          an.swingDur = 0.14;
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: ev.execute ? 0xff4a5c : ev.exposed ? 0xffe27a : 0xdff4ff, from: ev.execute ? 3 : 2.2, to: 0.4, dur: 0.22, opacity: 1 });
          if (ev.execute) this.burst(ev.x, 1.2, ev.z, { count: 18, color: 0xff4a5c, speed: 9, up: 4, life: 0.4 });
          this.burst(ev.x, 1.2, ev.z, { count: ev.exposed ? 22 : 10, color: ev.exposed ? 0xffe27a : 0xdff4ff, speed: 8, up: 4, life: 0.4 });
          if (ev.exposed) this.shake = Math.max(this.shake, 0.3);
        } else if (fx === 'bolt' || fx === 'zone' || fx === 'meteor' || fx === 'orb' || fx === 'kunai') {
          an.swing = 0;
          an.swingDur = 0.22;
        }
        const caster = ev.ally ? this.allyViews && [...this.allyViews.entries()].find(([pid]) => pid === ev.hero) : null;
        const isMage = ev.ally ? !!(caster && caster[1].cls === 'mage') : this.heroCls === 'mage';
        if (isMage && (fx === 'bolt' || fx === 'orb' || fx === 'meteor')) {
          // (0.56.3) A Mage's spells have weight: a flare at the hands as each one leaves.
          const ice = !ev.ally && world.mods && world.mods.frostMax > 0;
          const col = fx === 'orb' || ice ? 0xbff2ff : 0xffa040;
          const hx = ev.ally && caster ? caster[1].model.group.position.x : this.hero.group.position.x;
          const hz = ev.ally && caster ? caster[1].model.group.position.z : this.hero.group.position.z;
          this.flash(this.ringGeo(), { x: hx, z: hz, y: 1.3, color: col, from: 0.4, to: 1.9, dur: 0.22, opacity: 0.9 });
          this.burst(hx, 1.4, hz, { count: 8, color: col, speed: 5, up: 2, life: 0.3, gravity: 0 });
          if (fx === 'meteor') {
            // a star falling onto the mark, landing as it hits
            const tint = ice ? 0xbff2ff : 0xffb060;
            this.later(0.45, () => {
              const col2 = this.flash(this.geo('bolt', () => new THREE.CylinderGeometry(0.25, 0.1, 16, 5, 1, true).translate(0, 8, 0)), { x: ev.x, z: ev.z, y: 0, color: tint, from: 2.2, to: 0.6, dur: 0.45, opacity: 0.9 });
              col2.scale.y = 1;
              this.burst(ev.x, 9, ev.z, { count: 16, color: tint, speed: 2, up: -12, gravity: 10, life: 0.45, size: 1.4 });
            });
          }
        }

        break;
      }
      case 'mirrorCrack':
        this.burst(ev.x, 1.4, ev.z, { count: 8, color: 0xf4f2ec, speed: 5, up: 2, life: 0.3 });
        break;
      case 'mirrorBreak':
        // A Reflective elite's mirror shatters (0.42)
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: 0xffffff, from: 0.6, to: 3.4, dur: 0.4, opacity: 1 });
        this.burst(ev.x, 1.4, ev.z, { count: 30, color: 0xeef6ff, speed: 10, up: 5, life: 0.6 });
        break;
      case 'burst':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: ev.color || (ev.ice ? 0x9fe6ff : 0xff9a3a), from: 0.4, to: ev.radius, dur: 0.3, opacity: 0.7 });
        // (0.56.3) a ring that outruns the blast, and more of it flying
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.4, color: ev.color || (ev.ice ? 0xe6fbff : 0xffd08a), from: ev.radius * 0.4, to: ev.radius * 1.25, dur: 0.3, opacity: 0.9 });
        this.burst(ev.x, 1, ev.z, { count: 26, color: ev.color || (ev.ice ? 0xd8f6ff : 0xffb060), speed: 9, up: 5, life: 0.5, size: 1.2 });
        this.shake = Math.max(this.shake, 0.12);
        break;
      case 'frostShatter':
        // Hoarfrost Shatter: a ring of ice and a spray of shards.
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: 0xbff2ff, from: 0.6, to: ev.radius, dur: 0.35, opacity: 0.95 });
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x9fe6ff, from: 0.3, to: 1.6, dur: 0.25, opacity: 0.6 });
        this.burst(ev.x, 1.3, ev.z, { count: 26, color: 0xe6fbff, speed: 10, up: 5, life: 0.5, size: 1.2 });
        this.shake = Math.max(this.shake, 0.15);
        break;
      case 'orbTick':
        for (let n = 0; n < 5; n++) {
          const a = Math.random() * 6.283;
          const r = Math.sqrt(Math.random()) * ev.radius;
          this.burst(ev.x + Math.cos(a) * r, 0.4, ev.z + Math.sin(a) * r, { count: 2, color: 0xbfeaff, speed: 3, up: 3, life: 0.35 });
        }
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0x9fe8ff, from: ev.radius * 0.8, to: ev.radius, dur: 0.25, opacity: 0.35 });
        break;
      case 'mark':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: 0xb07cff, from: 3, to: 0.8, dur: 0.35, opacity: 1 });
        break;
      case 'markPop':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.6, color: 0xffffff, from: 0.5, to: 4.5, dur: 0.4, opacity: 1 });
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x7a3cff, from: 3, to: 3, dur: 0.5, opacity: 0.4 });
        this.burst(ev.x, 1.4, ev.z, { count: 44, color: 0xb07cff, speed: 12, up: 7, size: 1.4, life: 0.6 });
        this.shake = Math.max(this.shake, 0.55);
        break;
      case 'shadowSwap':
        this.burst(ev.fx, 1, ev.fz, { count: 18, color: 0x7a3cff, speed: 5, up: 3, life: 0.4 });
        this.burst(ev.x, 1, ev.z, { count: 18, color: 0xd7b8ff, speed: 5, up: 3, life: 0.4 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.5, color: 0xb07cff, from: 2.5, to: 0.6, dur: 0.3, opacity: 1 });
        break;
      case 'shadowSlash': {
        const dir = Math.atan2(ev.tz - ev.z, ev.tx - ev.x);
        const len = Math.hypot(ev.tx - ev.x, ev.tz - ev.z);
        // Veiled knives are thin and quick (they come with every basic attack); a Mirrored Cut is broad.
        this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.0, dir, color: 0xb07cff, sx: Math.max(1, len), sz: ev.veil ? 0.18 : 0.5, dur: ev.veil ? 0.14 : 0.25, opacity: 0.9 });
        this.burst(ev.tx, 1.2, ev.tz, { count: ev.veil ? 4 : 10, color: 0xd7b8ff, speed: 7, up: 3, life: 0.3 });
        break;
      }
      case 'oathBlade':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.8, color: 0xc8b8ff, from: 0.6, to: ev.radius, dur: 0.3, opacity: 1 });
        this.burst(ev.x, 1.2, ev.z, { count: 26, color: 0xc8b8ff, speed: 11, up: 3, life: 0.4 });
        break;
      case 'sporeHeal':
        // (0.61.5) Sporeheart bursts: a ring of spores out to 6 m
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.5, color: 0x9fe07a, from: 0.8, to: 6, dur: 0.45, opacity: 0.8 });
        this.burst(ev.x, 1, ev.z, { count: 14 + ev.n * 2, color: 0x9fe07a, speed: 9, up: 3, life: 0.6 });
        break;
      case 'starFeeds':
        this.burst(ev.x, 1.4, ev.z, { count: 18, color: 0x7ff5e1, speed: 6, up: 5, life: 0.5 });
        this.burst(ev.bx, 2.4, ev.bz, { count: 24, color: 0x7ff5e1, speed: 8, up: 4, life: 0.5 });
        break;
      case 'meteorLands':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xff8a3a, from: 1, to: 8, dur: 0.5, opacity: 0.6 });
        this.burst(ev.x, 1, ev.z, { count: 60, color: 0xffb060, speed: 14, up: 9, size: 1.5, life: 0.8 });
        this.shake = Math.max(this.shake, 0.7);
        break;
      case 'nightcut':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1, color: 0xff4a5c, from: 0.5, to: ev.radius + 0.5, dur: 0.25, opacity: 1 });
        break;
      case 'galeburst':
        this.burst(ev.x, 1.2, ev.z, { count: 20, color: 0xbff2ff, speed: 9, up: 3, life: 0.4 });
        break;
      case 'thiefCoins':
        this.burst(ev.x, 1.2, ev.z, { count: 8, color: 0xffd27a, speed: 6, up: 6, life: 0.6 });
        break;
      case 'thiefEscape':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.5, color: 0xffd27a, from: 0.4, to: 3, dur: 0.4, opacity: 1 });
        this.burst(ev.x, 1, ev.z, { count: 24, color: 0xfff2c0, speed: 7, up: 5, life: 0.5 });
        break;
      case 'remnantCast':
        this.burst(ev.x, 1.4, ev.z, { count: 14, color: 0xa64bff, speed: 5, up: 4, life: 0.5 });
        break;
      case 'doomImpact':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: COLORS.doom, from: ev.radius, to: ev.radius * 1.3, dur: 0.4, opacity: 0.7 });
        this.burst(ev.x, 1, ev.z, { count: 30, color: 0xd2a0ff, speed: 9, up: 7, size: 1.3, life: 0.6 });
        this.shake = Math.max(this.shake, 0.4);
        break;
      case 'spinTick':
        // Whirlwind (Berserker): a beat of the spin.
        this.heroAnim.spin = 1;
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.6, color: ev.first ? 0xff6a6a : 0xffb0a0, from: ev.radius * 0.5, to: ev.radius, dur: 0.3, opacity: 0.8 });
        this.burst(ev.x, 1, ev.z, { count: 10, color: 0xff7a7a, speed: 9, up: 2, life: 0.3 });
        break;
      case 'reckoning':
        // Reckoning (Bulwark): the stored blows come back.
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xffd27a, from: 1, to: 5 + ev.stacks * 0.4, dur: 0.35, opacity: 0.45 });
        this.burst(ev.x, 1.2, ev.z, { count: 10 + ev.stacks * 6, color: 0xffd27a, speed: 10, up: 4, life: 0.45 });
        this.shake = Math.max(this.shake, 0.15 + ev.stacks * 0.05);
        break;
      case 'wardBreak':
        this.burst(ev.x, 1.3, ev.z, { count: 16, color: 0xaadcff, speed: 7, up: 3, life: 0.4 });
        break;
      case 'veil':
        // Veilstep: a swirl of violet as you come out of it.
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.4, color: 0xb07cff, from: 0.5, to: 2.4, dur: 0.35, opacity: 0.9 });
        this.burst(ev.x, 1.1, ev.z, { count: 16, color: 0xd7b8ff, speed: 5, up: 3, life: 0.45 });
        break;
      case 'ambush':
        // Ambush: arriving at its back.
        this.burst(ev.x, 1.1, ev.z, { count: 14, color: 0x2a1840, speed: 6, up: 2, life: 0.4 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: 0xffe27a, from: 1.8, to: 0.5, dur: 0.25, opacity: 0.9 });
        break;
      case 'shatter':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.9, color: 0xffffff, from: 0.6, to: ev.radius * 1.1, dur: 0.35, opacity: 1 });
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x7fd8ff, from: ev.radius, to: ev.radius, dur: 0.45, opacity: 0.35 });
        this.burst(ev.x, 1, ev.z, { count: 40, color: 0xc8f0ff, speed: 11, up: 6, size: 1.4, life: 0.6 });
        this.shake = Math.max(this.shake, 0.35);
        break;
      case 'cloneStrike':
        // (0.81.3) an Ember Clone's blow
        this.flash(this.discGeo(), { x: ev.tx, z: ev.tz, color: 0xff8a2a, from: 0.3, to: ev.last ? 2.6 : 1.3, dur: 0.25, opacity: 0.6 });
        this.burst(ev.tx, 1, ev.tz, { count: ev.last ? 26 : 10, color: 0xffa040, speed: ev.last ? 7 : 4, up: 4, life: 0.45 });
        break;
      case 'iceGuard':
        // (0.72) Glacier Spin: a shell of ice snaps up round you
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.6, color: 0xdff6ff, from: 0.8, to: ev.radius, dur: 0.3, opacity: 1 });
        this.burst(ev.x, 1.1, ev.z, { count: 26, color: 0xc8f0ff, speed: 7, up: 4, life: 0.5 });
        break;
      case 'bloodOath':
      case 'bloodCost':
        // (0.72) an Oath taken: a red burst and a ring of blood at your feet
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xff2a3a, from: 0.6, to: 4.2, dur: 0.5, opacity: 0.95 });
        this.burst(ev.x, 1.2, ev.z, { count: 34, color: 0xff2a3a, speed: 8, up: 6, life: 0.6, size: 1.2 });
        this.shake = Math.max(this.shake, 0.3);
        break;
      case 'deathMark': {
        // (0.72) Death Mark (Eternal): a black-red ring snaps shut on the boss
        const tgt = world.enemies.find((e) => e.id === ev.id);
        const r = tgt ? tgt.def.radius || 1.5 : 1.5;
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.2, color: 0xff1030, from: r * 3, to: r * 0.8, dur: 0.3, opacity: 1 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: 0xffffff, from: r, to: r * 2.6, dur: 0.4, opacity: 0.8 });
        this.burst(ev.x, 1.6, ev.z, { count: 26, color: 0xff3d4f, speed: 10, up: 5, life: 0.5 });
        this.shake = Math.max(this.shake, 0.4);
        break;
      }
      case 'eternalDrop':
        // (0.72) an Eternal: a pillar of white and red light where the Granted fell
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xffffff, from: 0.5, to: 6, dur: 0.9, opacity: 0.85 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.2, color: 0xff3d4f, from: 1, to: 9, dur: 1.2, opacity: 1 });
        for (let i = 0; i < 6; i++) this.later(i * 0.12, () => this.burst(ev.x, 1 + i * 1.4, ev.z, { count: 24, color: i % 2 ? 0xff3d4f : 0xffffff, speed: 4, up: 14, life: 0.9, size: 1.5 }));
        this.shake = Math.max(this.shake, 0.6);
        break;
      case 'bloodied':
        if (ev.on) this.burst(ev.x, 1.2, ev.z, { count: 26, color: 0xff3344, speed: 6, up: 5, life: 0.5 });
        break;
      case 'zoneLoose':
        // (0.50) Arrow Storm leaves the string: a sheaf of arrows climbs from the archer;
        // (0.51) Skyfall: the first of them land together, a ring of light where they pin
        this.burst(ev.x, 2.2, ev.z, { count: 16, color: 0xfff0b0, speed: 3, up: 22, life: 0.5 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: 0xfff0b0, from: 0.6, to: 2.2, dur: 0.25, opacity: 0.8 });
        if (ev.tx != null) {
          this.flash(this.discGeo(), { x: ev.tx, z: ev.tz, color: 0xffe3a0, from: 0.5, to: ev.radius || 5, dur: 0.35, opacity: 0.6 });
          this.burst(ev.tx, 1.2, ev.tz, { count: 30, color: 0xfff0b0, speed: 7, up: 3, life: 0.45 });
          this.shake = Math.max(this.shake, 0.25);
        }
        break;
      case 'zoneTick':
        for (let n = 0; n < 7; n++) {
          const a = Math.random() * 6.283;
          const r = Math.sqrt(Math.random()) * ev.radius;
          this.burst(ev.x + Math.cos(a) * r, 0.2, ev.z + Math.sin(a) * r, { count: 3, color: 0xfff0b0, speed: 2, up: 5, life: 0.35 });
        }
        break;
      case 'impact': {
        if (ev.kind === 'hand') {
          this.seraphFx({ kind: 'land', x: ev.x, z: ev.z, radius: ev.radius, fist: true }); // (0.94) the fist lands
          break;
        }
        if (ev.seraph) {
          this.seraphFx({ kind: 'land', x: ev.x, z: ev.z, radius: ev.radius }); // (0.93) Descent: a pillar of light
          break;
        }
        // Skyfall lands hard; its aftershock and the Retribution shockwave are lighter.
        const big = ev.kind === 'skyfall';
        const tint = ev.kind === 'retribution' ? COLORS.immortal : ev.kind === 'aftershock' ? 0xffe2a0 : ev.kind === 'starfall' ? 0xfff0a0 : ev.kind === 'cinderfall' ? 0xff7a2a : 0x7fd8ff;
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xffffff, from: 1, to: ev.radius * 1.15, dur: 0.45, opacity: 1 });
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: tint, from: ev.radius, to: ev.radius, dur: 0.5, opacity: big ? 0.45 : 0.3 });
        this.burst(ev.x, 0.3, ev.z, { count: big ? 46 : 24, color: tint, speed: big ? 13 : 9, up: big ? 9 : 6, size: 1.5, life: 0.7 });
        if (big) {
          // the slam: a wide, slower shockwave along the ground and a column of light
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: tint, from: ev.radius * 0.5, to: ev.radius * 1.7, dur: 0.7, opacity: 0.6 });
          this.burst(ev.x, 0.5, ev.z, { count: 20, color: 0xffffff, speed: 3, up: 14, size: 1.2, life: 0.55, gravity: 0 });
        }
        this.shake = Math.max(this.shake, big ? 0.7 : 0.4);
        break;
      }
      case 'slowStart':
        this.flash(this.ringGeo(), { x: p.x, z: p.z, y: 0.1, color: COLORS.parry, from: 2, to: 26, dur: 0.9, opacity: 0.7 });
        break;
      case 'perfectDodge':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: COLORS.parry, from: 0.5, to: 3.2, dur: 0.3, opacity: 1 });
        this.burst(ev.x, 1, ev.z, { count: 20, color: COLORS.parry, speed: 8, up: 4, life: 0.45 });
        break;
      case 'smoulder':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xff6a1a, from: 0.5, to: ev.radius, dur: 0.35, opacity: 0.7 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: 0xffb060, from: ev.radius * 0.6, to: ev.radius * 1.1, dur: 0.4, opacity: 0.9 });
        this.burst(ev.x, 0.6, ev.z, { count: 30, color: 0xff8a3a, speed: 7, up: 6, life: 0.6 });
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'emberTick':
        for (let n = 0; n < 8; n++) {
          const a = Math.random() * 6.283;
          const r = Math.sqrt(Math.random()) * ev.radius;
          this.burst(ev.x + Math.cos(a) * r, 0.2, ev.z + Math.sin(a) * r, { count: 2, color: Math.random() < 0.5 ? 0xff7a2a : 0xffc060, speed: 1.5, up: 4, gravity: -2, life: 0.6 });
        }
        break;
      case 'proclaim':
        // The Herald reads a line: a ring of light from the court (0.40)
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.2, color: 0xffe2a0, from: 1, to: 9, dur: 0.8, opacity: 0.8 });
        this.burst(ev.x, 3, ev.z, { count: 20, color: 0xfff2c0, speed: 4, up: 6, life: 0.8 });
        break;
      case 'askerOffer':
        // The Asker stops and asks (0.40)
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xffd27a, from: 2, to: 12, dur: 1.2, opacity: 0.35 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0xfff2c0, from: 12, to: 2, dur: 1.0, opacity: 0.9 });
        this.burst(ev.x, 3.5, ev.z, { count: 40, color: 0xfff2c0, speed: 6, up: 4, life: 1.0, gravity: 0 });
        break;
      case 'askerGranted':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.2, color: 0xffd27a, from: 3, to: 0.6, dur: 0.6, opacity: 1 });
        this.burst(ev.x, 1.4, ev.z, { count: 24, color: 0xffd27a, speed: 3, up: 6, life: 0.8 });
        break;
      case 'askerLast':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: ev.grown ? 0xffa040 : 0xfff2c0, from: 1, to: 16, dur: 1.0, opacity: 0.4 });
        this.shake = Math.max(this.shake, 0.5);
        break;
      case 'wished': {
        // A Wishling gives an enemy what it wants (0.39): a thread of gold, a ring round the one it chose.
        const dir = Math.atan2(ev.tz - ev.z, ev.tx - ev.x);
        this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.1, dir, color: 0xffd27a, sx: Math.hypot(ev.tx - ev.x, ev.tz - ev.z), sz: 0.22, dur: 0.45, opacity: 0.9 });
        this.flash(this.ringGeo(), { x: ev.tx, z: ev.tz, y: 0.2, color: 0xffd27a, from: 0.6, to: 1.8, dur: 0.6, opacity: 0.9 });
        this.burst(ev.tx, 1.4, ev.tz, { count: 14, color: 0xffe8a8, speed: 4, up: 5, life: 0.6 });
        break;
      }
      case 'burnSpread': {
        const dir = Math.atan2(ev.tz - ev.z, ev.tx - ev.x);
        this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.0, dir, color: 0xff7a2a, sx: Math.hypot(ev.tx - ev.x, ev.tz - ev.z), sz: 0.35, dur: 0.3, opacity: 0.9 });
        this.burst(ev.tx, 1.2, ev.tz, { count: 12, color: 0xff8a3a, speed: 5, up: 4, life: 0.45 });
        break;
      }
      case 'wallRise':
        // (0.56.3) it erupts out of the ground: a hard line of ice, spray along its length
        this.flash(this.rectGeo(), { x: ev.x - Math.cos(ev.rot) * ev.hw, z: ev.z - Math.sin(ev.rot) * ev.hw, y: 0.1, dir: ev.rot, color: 0xbff2ff, sx: ev.hw * 2, sz: 3.2, dur: 0.35, opacity: 0.7 });
        for (let n = -4; n <= 4; n++) {
          const k = (n / 4) * ev.hw;
          this.burst(ev.x + Math.cos(ev.rot) * k, 0.3, ev.z + Math.sin(ev.rot) * k, { count: 7, color: n % 2 ? 0xdff6ff : 0x9fe6ff, speed: 5, up: 9, life: 0.6, size: 1.3 });
        }
        this.shake = Math.max(this.shake, 0.45);
        break;
      case 'wallShatter':
        for (let n = -4; n <= 4; n++) {
          const k = (n / 4) * ev.hw;
          this.burst(ev.x + Math.cos(ev.rot) * k, 1, ev.z + Math.sin(ev.rot) * k, { count: 10, color: 0xc8f0ff, speed: 9, up: 6, size: 1.3, life: 0.6 });
        }
        this.shake = Math.max(this.shake, 0.4);
        break;
      case 'motes':
        this.burst(ev.x, 1.2, ev.z, { count: 20, color: 0xfff3b0, speed: 6, up: 3, life: 0.4 });
        break;
      case 'starBolt': {
        const dir = Math.atan2(ev.tz - ev.z, ev.tx - ev.x);
        this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.2, dir, color: COLORS.immortal, sx: Math.hypot(ev.tx - ev.x, ev.tz - ev.z), sz: 0.45, dur: 0.3, opacity: 1 });
        this.burst(ev.tx, 1.2, ev.tz, { count: 18, color: COLORS.immortal, speed: 8, up: 4, life: 0.4 });
        break;
      }
      case 'empowered':
        this.burst(ev.x, 1.2, ev.z, { count: 12, color: 0xffd27a, speed: 4, up: 3, life: 0.35 });
        break;
      case 'lightning': {
        if (ev.small) {
          // Stormcaller (Warrior): one bolt per enemy hit, so keep each light.
          const b = this.flash(this.geo('bolt', () => new THREE.CylinderGeometry(0.25, 0.1, 16, 5, 1, true).translate(0, 8, 0)), { x: ev.x, z: ev.z, y: 0, color: COLORS.immortal, dur: 0.22, opacity: 0.9 });
          b.rotation.y = Math.random() * 3;
          this.burst(ev.x, 0.5, ev.z, { count: 8, color: COLORS.immortal, speed: 6, up: 5, life: 0.35 });
          this.shake = Math.max(this.shake, 0.15);
          break;
        }
        const bolt = this.flash(this.geo('bolt', () => new THREE.CylinderGeometry(0.25, 0.1, 16, 5, 1, true).translate(0, 8, 0)), { x: ev.x, z: ev.z, y: 0, color: COLORS.immortal, dur: 0.28, opacity: 1 });
        bolt.rotation.y = Math.random() * 3;
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: COLORS.immortal, from: 0.5, to: 3.3, dur: 0.35, opacity: 1 });
        this.burst(ev.x, 0.5, ev.z, { count: 26, color: COLORS.immortal, speed: 10, up: 8, life: 0.5 });
        this.shake = Math.max(this.shake, 0.35);
        break;
      }
      case 'undying':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: COLORS.immortal, from: 0.5, to: 7, dur: 0.8, opacity: 1 });
        this.burst(ev.x, 0.5, ev.z, { count: 50, color: COLORS.immortal, speed: 5, up: 12, gravity: 5, life: 1 });
        break;
      case 'rankUp':
      case 'augmentTaken':
        this.flash(this.ringGeo(), { x: p.x, z: p.z, color: 0xffe2a0, from: 0.5, to: 4, dur: 0.6, opacity: 0.9 });
        this.burst(p.x, 0.4, p.z, { count: 24, color: 0xffe2a0, speed: 3, up: 10, gravity: 6, life: 0.8 });
        break;
      case 'damage':
        if (ev.who === 'enemy') {
          this.burst(ev.x, 1.1, ev.z, { count: ev.crit ? 12 : 6, color: ev.stunned ? 0xffe27a : 0xffb3a0, speed: 5, up: 3 });
          if (ev.crit && !ev.dot) {
            // (0.72) a crit lands: a quick white ring where it hit. (0.72.1) Not on a boss: in a long
            // fight the rings and shakes piled up over its own warnings.
            const tgt = world.enemies.find((e) => e.id === ev.id);
            if (!(tgt && tgt.def.boss)) {
              this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.1, color: 0xfff2c8, from: 0.3, to: 1.4, dur: 0.14, opacity: 0.75 });
              this.shake = Math.max(this.shake, 0.15);
            }
          }
        } else {
          this.burst(ev.x, 1.2, ev.z, { count: 10, color: 0xff4a55, speed: 6, up: 4 });
          this.shake = Math.max(this.shake, 0.3);
        }
        break;
      case 'parryStart':
        this.flash(this.ringGeo(), { x: p.x, z: p.z, color: COLORS.parry, from: 1.6, to: 1.2, dur: 0.2, opacity: 0.5 });
        break;
      case 'parry': {
        const big = ev.perfect;
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: 0xffffff, from: 0.6, to: big ? 5.5 : 3.6, dur: big ? 0.45 : 0.32, opacity: 1 });
        if (big) this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1, color: COLORS.parry, from: 1, to: 8, dur: 0.6, opacity: 0.8 });
        this.burst(ev.x + Math.cos(p.facing) * 0.9, 1.3, ev.z + Math.sin(p.facing) * 0.9, { count: big ? 40 : 22, color: big ? 0xffffff : COLORS.parry, speed: big ? 13 : 9, up: 5, size: 1.2, life: 0.45 });
        this.shake = Math.max(this.shake, big ? 0.45 : 0.25);
        this.hero.parts.guardMat.opacity = 1;
        break;
      }
      case 'stagger':
        this.burst(ev.x, 1.6, ev.z, { count: 16, color: 0xffe27a, speed: 6, up: 6 });
        break;
      case 'dodge':
        this.burst(ev.x, 1, ev.z, { count: 6, color: 0x9fe8ff, speed: 3, up: 2 });
        break;
      case 'starImpact':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: FX_COLOR[ev.fx] || 0xbff2ff, from: 0.4, to: ev.radius, dur: 0.3, opacity: 0.85 });
        this.burst(ev.x, 0.6, ev.z, { count: 22, color: FX_COLOR[ev.fx] || 0xe6fbff, speed: 9, up: 7, life: 0.55 });
        this.shake = Math.max(this.shake, 0.25);
        break;
      case 'blink': {
        // a Storm Wraith steps through the air
        this.burst(ev.x, 1.2, ev.z, { count: 14, color: FX_COLOR.storm, speed: 4, up: 3, life: 0.4 });
        this.burst(ev.tx, 1.2, ev.tz, { count: 14, color: FX_COLOR.storm, speed: 4, up: 3, life: 0.4 });
        const v = this.views.get(ev.id);
        if (v) v.model.group.position.set(ev.tx, v.model.group.position.y, ev.tz);
        break;
      }
      case 'enemyHeal':
        this.burst(ev.x, 1.5, ev.z, { count: 20, color: 0x9fe07a, speed: 2, up: 6, gravity: 2, life: 0.9 });
        break;
      case 'bossLeap':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: 0xffe8c0, from: 0.8, to: ev.radius * 1.4, dur: 0.4, opacity: 0.9 });
        this.burst(ev.x, 0.4, ev.z, { count: 30, color: 0xb8a68a, speed: 8, up: 4, life: 0.6 });
        this.shake = Math.max(this.shake, 0.45);
        break;
      case 'bossPhase':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.5, color: 0x7ff5e1, from: 1, to: 16, dur: 0.8, opacity: 1 });
        this.burst(ev.x, 2.5, ev.z, { count: 60, color: 0xbff2ff, speed: 12, up: 6, gravity: 0, life: 0.9 });
        this.shake = Math.max(this.shake, 0.6);
        break;
      case 'strike': {
        const v = this.views.get(ev.id);
        if (v) v.strikeT = 0.25;
        const color = ev.parryable ? 0xffe8c0 : COLORS.danger;
        const tint = FX_COLOR[ev.fx];
        if (ev.shape === 'arc') this.flash(this.sectorGeo(ev.angle, 0.3), { x: ev.x, z: ev.z, y: 0.8, dir: ev.dir, color: tint && !ev.parryable ? tint : color, from: ev.range * 0.75, to: ev.range, dur: 0.22, opacity: 0.7 });
        else if (ev.shape === 'ring') {
          // a ring that breaks outward, safe in its middle (0.44)
          this.flash(this.sectorGeo(6.283, Math.max(0.05, ev.inner / ev.radius)), { x: ev.x, z: ev.z, y: 0.1, color: tint || color, from: ev.radius, to: ev.radius * 1.04, dur: 0.35, opacity: 0.75 });
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.3, color: tint || color, from: ev.inner, to: ev.radius * 1.15, dur: 0.4, opacity: 0.9 });
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2, r = (ev.inner + ev.radius) / 2;
            this.burst(ev.x + Math.cos(a) * r, 0.4, ev.z + Math.sin(a) * r, { count: 2, color: tint || 0xc9b9a0, speed: 3, up: 4, life: 0.5 });
          }
          this.shake = Math.max(this.shake, 0.35);
        } else if (ev.shape === 'beam') {
          // a still line of force: the Warden's gate, the Herald's decree, the Unmade's cross
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.12, dir: ev.dir, color: tint || color, sx: ev.length, sz: ev.width, from: 1, to: 1, dur: 0.35, opacity: 0.8 });
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.5, dir: ev.dir, color: 0xffffff, sx: ev.length, sz: ev.width * 0.35, from: 1, to: 1, dur: 0.18, opacity: 0.7 });
          for (let i = 0; i < 10; i++) {
            const k = (i + 0.5) / 10 * ev.length;
            this.burst(ev.x + Math.cos(ev.dir) * k, 0.4, ev.z + Math.sin(ev.dir) * k, { count: 2, color: tint || 0xffe8c0, speed: 2.5, up: 5, life: 0.45 });
          }
          this.shake = Math.max(this.shake, 0.3);
        }
        else if (ev.shape === 'circle') {
          this.flash(this.discGeo(), { x: ev.x, z: ev.z, color, from: ev.radius, to: ev.radius, dur: 0.3, opacity: 0.55 });
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color, from: ev.radius * 0.5, to: ev.radius * 1.1, dur: 0.35, opacity: 0.9 });
          this.burst(ev.x, 0.2, ev.z, { count: 18, color: 0xc9b9a0, speed: ev.radius * 2, up: 5, life: 0.6 });
          this.shake = Math.max(this.shake, ev.radius > 5 ? 0.6 : 0.3);
        }
        break;
      }
      case 'spawn':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x0a0a12, from: 0.3, to: 1.8, dur: 1.0, opacity: 0.9, additive: false });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xb44aff, from: 0.3, to: 1.9, dur: 1.0, opacity: 0.9 });
        break;
      case 'death':
        this.burst(ev.x, 1, ev.z, { count: ev.boss ? 60 : 16, color: ev.boss ? COLORS.ember : 0xb99aa5, speed: ev.boss ? 12 : 6, up: ev.boss ? 9 : 4, size: ev.boss ? 1.6 : 1, life: ev.boss ? 1 : 0.5 });
        if (ev.boss) this.shake = 0.8;
        break;
      case 'levelUp':
        this.flash(this.ringGeo(), { x: p.x, z: p.z, color: 0xffe2a0, from: 0.5, to: 6, dur: 0.8, opacity: 1 });
        this.burst(p.x, 0.4, p.z, { count: 40, color: 0xffe2a0, speed: 4, up: 12, gravity: 6, life: 0.9 });
        break;
      case 'heal':
        this.burst(ev.x, 0.5, ev.z, { count: 8, color: 0x7dffa8, speed: 1.5, up: 5, gravity: 2, life: 0.7 });
        break;
      case 'pickup':
        this.burst(p.x, 1, p.z, { count: 10, color: RARITIES[ev.item.rarity].color, speed: 3, up: 6, gravity: 8 });
        break;
      case 'reflect':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1, color: COLORS.parry, from: 0.3, to: 2, dur: 0.25, opacity: 1 });
        break;
      case 'playerDeath':
        this.shake = 0.9;
        this.burst(p.x, 1, p.z, { count: 40, color: 0xff4a55, speed: 8, up: 7, life: 0.9 });
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame sync with the simulation
  // -------------------------------------------------------------------------
  setEmissive(mats, r, g, b) {
    for (const m of mats) {
      const gl = m.userData.glow;
      const k = m.userData.cue || 1;
      if (gl) m.emissive.setRGB(r * k + gl[0], g * k + gl[1], b * k + gl[2]);
      else m.emissive.setRGB(r * k, g * k, b * k);
    }
  }

  /** Weapon glows (0.31): the weapon shines in the glow's colour, with a faint ring at the feet. */
  applyGlow(model, id) {
    const steel = model.parts && model.parts.steel;
    const g = id && (GLOWS[id] || (id === 'edricblue' ? { color: 0x4a7aff } : null)); // Edric's Sword keeps his blue (0.47)
    if (steel) {
      steel.emissive.set(g ? g.color : 0x7fd8ff);
      steel.emissiveIntensity = g ? 1.3 : 0.25;
    }
    // a weapon model (0.38.1) glows softly in the chosen colour, and not at all without one
    const radiant = !g && model.weaponLook === 'immortal'; // an Immortal weapon has a light of its own (0.48)
    for (const m of (model.parts && model.parts.weaponMats) || []) {
      if (!m.emissive) continue;
      m.emissive.set(g ? g.color : radiant ? 0xffc860 : 0x000000);
      m.emissiveIntensity = g ? 0.45 : radiant ? 0.35 : 0;
    }
    // (the weapon model may arrive after the glow was set: apply it again then)
    if (model.parts) model.applyGlowAgain = () => this.applyGlow(model, model.glowId);
    if (!model.glowRing) {
      model.glowRing = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
      model.glowRing.scale.setScalar(0.9);
      model.glowRing.position.y = 0.04;
      model.group.add(model.glowRing);
    }
    model.glowRing.visible = !!g;
    if (g) model.glowRing.material.color.set(g.color);
    model.glowId = id || null;
  }

  /** The travelling merchant and world events (0.31): a figure, a ring, a pillar of light. */
  syncExtras(world, dt) {
    if (this.altarRunes && this.altarRunes.length) {
      // The rune wakes when the boss is down and you carry a Remnant Sigil.
      const ready = world.bossAltar && world.bossAltar() && world.player.misc && world.player.misc.sigil > 0;
      this.altarT = (this.altarT || 0) + dt;
      for (const rune of this.altarRunes) rune.material.opacity = ready ? 0.6 + 0.35 * Math.sin(this.altarT * 3) : 0.18;
    }
    const mc = world.mode === 'explore' ? world.merchant : null;
    if (mc && !this.merchantView) {
      const g = buildNpc({ robe: 0x7a5a2a, trim: 0xffd27a, hair: 0x3a2a1a, scale: 1 });
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
      pack.position.set(0, 1.0, -0.38);
      g.add(pack);
      this.scene.add(g);
      this.merchantView = g;
      if (PEOPLE.merchant) {
        // (0.53) his own model, once it has loaded
        hideWhileLoading([...g.children], loadCreature(PEOPLE.merchant), () => this.merchantView === g && !this.merchantRig);
        loadCreature(PEOPLE.merchant).then((tpl) => {
          if (!tpl || this.merchantView !== g) return;
          for (const ch of g.children) ch.visible = false;
          this.merchantRig = makeCreature(tpl, PEOPLE.merchant);
          g.add(this.merchantRig.group);
        });
      }
    }
    if (this.merchantRig && this.merchantView) this.merchantRig.update(dt, {});
    if (this.merchantView) {
      if (!mc) {
        this.disposeGroup(this.merchantView);
        this.merchantView = null;
        this.merchantRig = null;
      } else this.merchantView.position.set(mc.x, 0, mc.z);
    }
    const ev = world.mode === 'explore' ? world.happening : null;
    const key = ev ? `${ev.kind}:${ev.x}:${ev.z}` : '';
    if (key !== this.eventKey) {
      if (this.eventView) this.disposeGroup(this.eventView);
      this.eventView = null;
      this.eventKey = key;
      if (ev) {
        const color = ev.kind === 'shrine' ? 0xffd27a : 0xff8a3a;
        const g = new THREE.Group();
        const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
        ring.scale.setScalar(ev.r);
        ring.position.y = 0.06;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
        beam.position.y = 7;
        g.add(ring, beam);
        if (ev.kind === 'shrine') {
          const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x9a8f7a, emissive: 0xffd27a, emissiveIntensity: 0.3 }));
          stone.position.y = 1.1;
          g.add(stone);
        }
        g.position.set(ev.x, 0, ev.z);
        this.scene.add(g);
        this.eventView = g;
        g.userData.ring = ring;
        g.userData.beam = beam;
      }
    }
    if (this.eventView && ev) {
      const live = ev.state === 'hold' || ev.state === 'fight';
      this.eventView.userData.ring.material.opacity = live ? 0.95 : 0.55;
      this.eventView.userData.ring.rotation.y += dt * (live ? 1.2 : 0.4);
    }
  }

  /**
   * (0.72) Rings under the hero while something lasts: a slow red pulse while an Oath is on, an icy
   * turning ring while Glacier Spin turns shots back. Drawn from the state itself, never left behind.
   */
  syncAuras(p, x, z, dt) {
    const make = (color) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(this.ringGeo(), mat);
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    if (!this.auraOath) {
      this.auraOath = make(0xff2a3a);
      this.auraIce = make(0xbfeaff);
      this.auraT = 0;
    }
    for (const m of [this.auraOath, this.auraIce]) if (m.parent !== this.scene) this.scene.add(m); // (a new map's scene)
    this.auraT += dt;
    const oath = !!(p.frenzyOn || p.oathOn || p.oathT > 0);
    const ice = p.frostSpinT > 0;
    const o = this.auraOath, i = this.auraIce;
    o.visible = oath;
    if (oath) {
      const k = 0.5 + 0.5 * Math.sin(this.auraT * 5);
      o.position.set(x, 0.08, z);
      o.scale.setScalar(1.3 + 0.25 * k);
      o.material.opacity = 0.45 + 0.35 * k;
    }
    i.visible = ice;
    if (ice) {
      i.position.set(x, 0.5, z);
      i.rotation.y = this.auraT * 3;
      i.scale.setScalar(p.frostSpinR || 3.5);
      i.material.opacity = 0.35 + 0.2 * Math.sin(this.auraT * 9);
    }
  }

  syncHero(world, alpha, dt) {
    const p = world.player;
    const h = this.hero;
    const wantGlow = p.glow || (p.equipped && p.equipped.weapon && p.equipped.weapon.effect === 'edric' ? 'edricblue' : null);
    if ((wantGlow || null) !== (h.glowId ?? null)) this.applyGlow(h, wantGlow);
    if (h.rig) setWeaponLook(h, world.cls, weaponLook(p.equipped && p.equipped.weapon)); // its look by rarity (0.48)
    const an = this.heroAnim;
    const g = h.group;
    const attackStart = an.swing === 0; // an attack or cast began since the last frame
    const pr = p.predicted; // a friend's own walk, drawn ahead of the host's word (0.41.1)
    const x = lerp(p.px, p.x, alpha) + (pr ? pr.dx : 0);
    const z = lerp(p.pz, p.z, alpha) + (pr ? pr.dz : 0);
    let y = 0;
    if (p.leap) y = Math.sin(Math.PI * Math.min(1, p.leap.t / p.leap.dur)) * 5.5;
    const sera = this.heroCls === 'statue';
    if (sera) y += this.seraphHover(h, !!p.moving && !p.dash && !p.leap, dt); // (0.93) the Seraph hovers and glides
    g.position.set(x, y, z);
    g.rotation.y = Math.PI / 2 - (pr ? pr.facing : p.facing);
    // (0.89) over the shoulder, standing still and not fighting: turn to where you look
    if (this.shoulder.on && !p.moving && p.targetId == null) {
      this.shoulderFace = this.shoulderFace == null ? p.facing : this.shoulderFace;
      let da = this.shoulder.yaw - this.shoulderFace;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.shoulderFace += da * (1 - Math.exp(-10 * dt));
      g.rotation.y = Math.PI / 2 - this.shoulderFace;
    } else this.shoulderFace = null;
    this.syncAuras(p, x, z, dt); // (0.72)
    const walking = p.moving || !!(pr && Math.hypot(pr.dx, pr.dz) > 0.05);

    // Legs + bob
    if (walking && !p.dash && !p.leap) an.walk += dt * 13;
    const sw = walking ? Math.sin(an.walk) * 0.7 : 0;
    h.parts.legL.rotation.x = lerp(h.parts.legL.rotation.x, sw, 0.3);
    h.parts.legR.rotation.x = lerp(h.parts.legR.rotation.x, -sw, 0.3);
    h.parts.body.position.y = walking ? Math.abs(Math.sin(an.walk)) * 0.06 : 0;
    h.parts.body.rotation.x = lerp(h.parts.body.rotation.x, p.dash ? 0.55 : p.leap ? -0.3 : 0, 0.3);

    // Whirlwind spin
    if (an.spin > 0) {
      an.spin = Math.max(0, an.spin - dt / 0.32);
      h.parts.body.rotation.y = (1 - an.spin) * Math.PI * 2;
    } else h.parts.body.rotation.y = 0;

    // Sword arm
    const arm = h.parts.arm;
    const parrying = p.parryT > 0;
    if (an.swing < 1) {
      an.swing = Math.min(1, an.swing + dt / an.swingDur);
      arm.rotation.y = lerp(1.7, -1.7, easeOut(an.swing));
      arm.rotation.x = -0.05;
    } else {
      const ty = parrying ? -1.15 : 0.3;
      const tx = parrying ? -0.5 : -0.8;
      const k = 1 - Math.exp(-22 * dt);
      arm.rotation.y = lerp(arm.rotation.y, ty, k);
      arm.rotation.x = lerp(arm.rotation.x, tx, k);
    }

    // Parry guard glow
    const gm = h.parts.guardMat;
    const targetOpacity = parrying ? 0.42 + Math.sin(this.time * 40) * 0.08 : 0;
    gm.opacity = gm.opacity > targetOpacity ? Math.max(targetOpacity, gm.opacity - dt * 4) : targetOpacity;
    h.parts.guard.visible = gm.opacity > 0.01;
    h.parts.steel.emissiveIntensity = parrying ? 2.2 : 0.25;

    if (p.hurtT > 0) this.setEmissive(h.mats, 0.9, 0.08, 0.1);
    else this.setEmissive(h.mats, 0, 0, 0);

    if (h.rig) {
      // The rigged model plays its own clips (0.35). Spin attacks turn it smoothly for as long as
      // they last (Whirlwind: the whole channel), then finish the turn instead of snapping back.
      const spinning = !!p.spin || an.spin > 0;
      const TAU = Math.PI * 2;
      an.spinAngle = an.spinAngle || 0;
      if (spinning || an.spinAngle > 0) {
        const step = dt * TAU * 2.4;
        if (!spinning && an.spinAngle + step >= Math.ceil(an.spinAngle / TAU) * TAU) an.spinAngle = 0;
        else an.spinAngle += step;
      }
      h.rig.group.rotation.y = h.rig.baseTurn + an.spinAngle;
      const hitStart = p.hurtT > 0 && !(h.prevHurt > 0);
      h.prevHurt = p.hurtT;
      // Skills with their own animation (0.36): Cleave from its cast; dashes and leaps when they start.
      let move = an.move || null;
      let moveDur = 0;
      // (a strike that closes the gap with a dash keeps its own animation)
      if (p.dash && !h.prevDash && (!move || move === 'dash')) [move, moveDur] = ['dash', p.dash.dur];
      if (p.leap && !h.prevLeap && (!move || move === 'leap')) [move, moveDur] = ['leap', p.leap.dur];
      h.prevDash = !!p.dash;
      h.prevLeap = !!p.leap;
      an.move = null;
      h.rig.update(dt, { dead: p.dead, attackStart: attackStart && !p.dead && !p.spin, attackDur: an.swingDur, moving: walking && !p.dash && !p.leap && !sera, walk: !!p.walkPace, speed: p.walkPace ? 1.8 : p.stats && p.stats.ms, spinning, hitStart, move: p.dead ? null : move, moveDur, period: p.stats && p.stats.as > 0 ? 1 / p.stats.as : 0 });
      g.rotation.z = 0;
      if (sera) {
        // (0.93) gliding: leaning into it, robes trailing (the idle plays on underneath)
        g.rotation.order = 'YXZ';
        g.rotation.x = h.seraLean || 0;
      }
      // The blade's glowing trail.
      if (!this.heroTrail) {
        this.heroTrail = new SlashTrail(0x9fd8ff);
        this.trailB = new THREE.Vector3();
        this.trailT = new THREE.Vector3();
        this.scene.add(this.heroTrail.mesh);
      }
      g.updateMatrixWorld(true);
      const sl = h.rig.slash;
      if (sl > 0 && h.rig.blade(this.trailB, this.trailT)) this.heroTrail.update(dt, sl, this.trailB, this.trailT);
      else this.heroTrail.update(dt, 0);
    } else if (p.dead) {
      an.deadT = Math.min(1, an.deadT + dt * 2.5);
      g.rotation.z = easeOut(an.deadT) * 1.5;
    } else {
      an.deadT = 0;
      g.rotation.z = 0;
    }
    return g.position;
  }

  syncEnemies(world, alpha, dt) {
    const seen = new Set();
    for (const e of world.enemies) {
      if (e.dead) continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        v = { id: e.id, type: e.type, shape: e.def.model || e.type, model: buildEnemy(e.type), strikeT: 0, walk: Math.random() * 6, height: e.def.height, size: e.rare ? 1.4 : e.remnant ? 1.12 : e.elite ? 1.22 : 1 };
        if (e.elite || e.def.thief || e.remnant) {
          // Elites: bigger, with a glowing ring in their first modifier's colour (a Rare's and the Wishthief's is gold; a Remnant's violet).
          const ringColor = e.rare || e.def.thief ? 0xffd27a : e.remnant ? 0xa64bff : AFFIXES[e.elite[0]].color;
          const aura = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.85, depthWrite: false }));
          aura.scale.setScalar(e.def.radius * 1.6);
          aura.position.y = 0.05;
          v.model.group.add(aura);
          v.aura = aura;
        }
        if (e.type === 'veilbearer') {
          // (0.84) its shroud: the Unmade inside take half damage
          v.veil = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0x8a6aff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
          v.veil.scale.setScalar(5.5);
          v.veil.position.y = 0.06;
          v.model.group.add(v.veil);
        }
        if (e.type === 'thief') {
          // (0.84) the Faith it carries off, glowing over its head
          v.loot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.95 }));
          v.loot.position.y = 2.0;
          v.loot.visible = false;
          v.model.group.add(v.loot);
        }
        this.scene.add(v.model.group);
        this.views.set(e.id, v);
        this.upgradeCreature(v, creatureSpec(e.type, e));
      }
      const { group, parts, mats } = v.model;
      if (v.tSwing > 0) v.tSwing -= dt;
      if (v.rig) {
        // a rigged body (0.44): its own clips for the wind-up, the walk, the stagger
        v.rig.update(dt, {
          moving: e.moving || e.state === 'charge',
          speed: e.def.speed * (e.state === 'charge' ? 2.5 : 1),
          stunned: e.state === 'stunned',
          windup: e.state === 'windup' && e.atk ? { kind: attackKind(e.type, e.atk), k: e.t / Math.max(0.01, e.dur) } : v.tSwing > 0 ? { kind: v.tKind, k: 1 - v.tSwing / v.tDur } : null, // (0.84) a Tide foe's blow, from its hit
        });
      }
      group.position.set(lerp(e.px, e.x, alpha), 0, lerp(e.pz, e.z, alpha));
      group.rotation.y = Math.PI / 2 - e.facing;

      // Spawn-in
      const s = (e.state === 'spawn' ? Math.max(0.01, easeOut(1 - e.t / 0.9)) : 1) * (v.size || 1);
      group.scale.setScalar(s);
      if (v.veil) v.veil.rotation.y -= dt * 0.6;
      if (v.loot) {
        v.loot.visible = !!e.loot;
        v.loot.position.y = 2.0 + Math.sin(this.time * 6) * 0.12;
      }
      if (v.aura) {
        v.aura.rotation.y += dt * 1.5;
        // a Reflective elite with its mirror shattered: the ring goes dim and cracked (0.42)
        v.aura.material.opacity = e.mirrorT > 0 ? 0.2 + 0.15 * Math.sin(this.time * 12) : 0.85;
      }

      // Walk cycle
      if (e.moving) v.walk += dt * (6 + e.def.speed * 1.6);
      const sw = e.moving ? Math.sin(v.walk) * 0.6 : 0;
      if (parts.legL) {
        parts.legL.rotation.x = lerp(parts.legL.rotation.x, sw, 0.3);
        parts.legR.rotation.x = lerp(parts.legR.rotation.x, -sw, 0.3);
      }
      const body = parts.body;
      if (parts.wheels || parts.wings) {
        // (0.98) the trial's eyes hang in the air: they bob, their wheels and wings turn
        const base = parts.wheels ? 3.4 : 1.5;
        body.position.y = base + Math.sin(this.time * (parts.wheels ? 1.3 : 6) + e.id) * (parts.wheels ? 0.35 : 0.12);
        if (parts.wheels) parts.wheels.forEach((w, i) => (w.rotation.z += dt * (i ? -0.5 : 0.7) * (e.raged ? 1.8 : 1)));
        if (parts.halo) parts.halo.rotation.z += dt * 2;
        if (parts.wings) parts.wings.forEach((w, i) => (w.rotation.x = Math.sin(this.time * 18 + i) * 0.6));
        if (parts.stars) parts.stars.visible = e.state === 'stunned' || e.stunT > 0;
        continue;
      }
      body.position.y = e.moving ? Math.abs(Math.sin(v.walk)) * 0.07 : 0;

      // Attack pose
      let armX = -0.25;
      let lean = 0;
      let tilt = 0;
      const stunned = e.state === 'stunned';
      if (e.state === 'windup') {
        const k = easeOut(Math.min(1, e.t / e.dur));
        armX = lerp(-0.25, -2.2, k);
        lean = -0.22 * k;
        if (parts.orb) parts.orb.scale.setScalar(1 + k * 1.4);
        if (v.shape === 'stalker') body.position.z = -0.5 * k;
        if (e.atk && e.atk.name === 'slam' && e.def.boss) body.position.y = k * 0.9;
      } else {
        if (parts.orb) parts.orb.scale.setScalar(1);
        if (v.shape === 'stalker') body.position.z = 0;
      }
      if (v.strikeT > 0) {
        v.strikeT -= dt;
        const k = 1 - Math.max(0, v.strikeT) / 0.25;
        armX = lerp(-2.2, 0.55, easeOut(k));
        lean = 0.3 * (1 - k);
      }
      if (e.state === 'charge') lean = 0.3;
      if (stunned) {
        tilt = 0.22 + Math.sin(this.time * 9) * 0.1;
        lean = 0.25;
        armX = 0.6;
      }
      if (parts.arm) parts.arm.rotation.x = lerp(parts.arm.rotation.x, armX, 0.45);
      body.rotation.x = lerp(body.rotation.x, lean, 0.35);
      body.rotation.z = lerp(body.rotation.z, tilt, 0.3);
      if (parts.stars) {
        parts.stars.visible = stunned;
        parts.stars.rotation.y = this.time * 5;
      }

      // Colour cues: white flash = parry now, red = cannot be parried.
      if (e.hitFlash > 0) this.setEmissive(mats, 0.8, 0.8, 0.8);
      else if (e.state === 'windup' && !e.atk.parryable) {
        const pulse = 0.35 + 0.25 * Math.sin(this.time * 22);
        this.setEmissive(mats, pulse * 1.6, 0.02, 0.05);
      } else if (e.cue) this.setEmissive(mats, 1.3, 1.25, 1.05);
      else if (e.state === 'windup') {
        const k = e.t / e.dur;
        this.setEmissive(mats, 0.25 * k, 0.2 * k, 0.08 * k);
      } else if (e.vulnT > 0) this.setEmissive(mats, 0.2, 0.03, 0.28); // Sunder: purple
      else if (e.state === 'stunned' && e.frostLock > 0.3) this.setEmissive(mats, 0.35, 0.6, 0.8); // frozen solid
      else if (e.burnT > 0) {
        const k = Math.min(1, (e.burnStacks || 1) / (e.burnCap || 50)); // (0.56.3) hotter as the burn piles up
        this.setEmissive(mats, 0.38 + 0.35 * k + 0.08 * Math.sin(this.time * 14), 0.13 + 0.12 * k, 0.0); // burning: orange flicker
        if (Math.random() < 0.2 + 0.8 * k) {
          const a = Math.random() * 6.283, r = (e.def.radius || 0.7) * 0.8;
          this.burst(e.x + Math.cos(a) * r, 0.5 + Math.random() * (v.height || 2) * 0.8, e.z + Math.sin(a) * r, { count: k > 0.66 ? 2 : 1, color: Math.random() < 0.5 ? 0xff6a1a : 0xffc060, speed: 0.6, up: 3 + 3 * k, gravity: -2, life: 0.5, size: 1 + k });
        }
      }
      else if (e.frostT > 0 && e.frostStacks > 0) {
        const k = e.frostStacks / (world.mods.frostMax || 6); // whiter the closer it is to shattering
        this.setEmissive(mats, 0.06 + 0.25 * k, 0.15 + 0.35 * k, 0.3 + 0.4 * k);
      }
      else if (e.bleedT > 0) this.setEmissive(mats, 0.28, 0.02, 0.04); // bleeding: dark red
      else if (e.slowT > 0 || world.slowT > 0) this.setEmissive(mats, 0.03, 0.12, 0.26); // slowed: cold blue
      else if (e.enraged) this.setEmissive(mats, 0.22, 0.03, 0.02);
      else this.setEmissive(mats, 0, 0, 0);

      // Second Death (on Last Rites): a broken purple ring that closes in until it goes off.
      if (e.markT > 0) {
        if (!v.markRing) {
          v.markRing = new THREE.Mesh(this.sectorGeo(5.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xb07cff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
          v.markRing.position.y = 0.08;
          group.add(v.markRing);
        }
        v.markRing.visible = true;
        v.markRing.rotation.y = this.time * 4;
        v.markRing.scale.setScalar((e.radius + 0.6) * (0.55 + 0.5 * Math.min(1, e.markT / 3)));
      } else if (v.markRing) v.markRing.visible = false;
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.views.delete(id);
        v.deathT = 0;
        this.setEmissive(v.model.mats, 0.6, 0.6, 0.6);
        if (v.model.parts.stars) v.model.parts.stars.visible = false;
        if (v.markRing) v.markRing.visible = false;
        this.corpses.push(v);
      }
    }
    for (const c of this.corpses) {
      if (c.rig) {
        // a rigged body falls the way it should, then sinks away
        c.rig.update(dt, { dead: true });
        c.deathT += dt / 1.8;
        const k = Math.min(1, c.deathT);
        c.model.group.position.y = -Math.max(0, k - 0.65) * 2.2;
        if (k >= 1) {
          this.disposeGroup(c.model.group);
          c.done = true;
        }
        continue;
      }
      c.deathT += dt / 0.45;
      const k = Math.min(1, c.deathT);
      c.model.group.scale.setScalar(1 - easeOut(k) * 0.95);
      c.model.group.position.y = -k * 0.4;
      c.model.group.rotation.y += dt * 8;
      if (k >= 1) {
        this.disposeGroup(c.model.group);
        c.done = true;
      }
    }
    this.corpses = this.corpses.filter((c) => !c.done);
  }

  /** Haven's people (0.44): idle, a look about now and then, a greeting when you come close. */
  /** (0.56.4) Glimmers turn and bob; an unread one shines and sparkles, a read one is a faint glow. */
  syncGlimmers(world, dt) {
    if (!this.glimmers || !this.glimmers.length) return;
    const read = world.player.signs || [];
    const px = world.player.x, pz = world.player.z;
    for (const gl of this.glimmers) {
      const want = read.includes(gl.id) ? 0.25 : 1;
      gl.lit += (want - gl.lit) * Math.min(1, dt * 2);
      const t = this.time + gl.phase;
      const P = gl.parts;
      P.shard.rotation.y += dt * (0.4 + 0.8 * gl.lit);
      P.shard.position.y = 1.35 + Math.sin(t * 1.6) * 0.12;
      P.glow.position.y = P.shard.position.y;
      P.shardMat.emissiveIntensity = 0.35 + 1.4 * gl.lit + 0.25 * gl.lit * Math.sin(t * 3);
      P.shardMat.opacity = 0.5 + 0.45 * gl.lit;
      P.coreMat.opacity = 0.2 + 0.7 * gl.lit;
      P.haloMat.opacity = (0.1 + 0.3 * gl.lit) * (0.8 + 0.2 * Math.sin(t * 2));
      P.glowMat.opacity = 0.05 + 0.16 * gl.lit;
      P.halo.scale.setScalar(1 + 0.08 * Math.sin(t * 2));
      // a few sparks drifting up from an unread one, only when you are near enough to see them
      if (gl.lit > 0.6 && Math.abs(gl.x - px) + Math.abs(gl.z - pz) < 40 && Math.random() < dt * 6) {
        const a = Math.random() * 6.283;
        this.burst(gl.x + Math.cos(a) * 0.5, 0.6 + Math.random() * 1.2, gl.z + Math.sin(a) * 0.5, { count: 1, color: Math.random() < 0.5 ? 0xffe2a0 : 0xfff8e8, speed: 0.3, up: 1.4, gravity: -0.6, life: 1.2, size: 0.9 });
      }
    }
  }

  syncPeople(world, dt) {
    if (!this.people || !this.people.length) return;
    const p = world.player;
    for (const n of this.people) {
      if (!n.rig) continue;
      let gesture = null;
      const near = Math.hypot(p.x - n.x, p.z - n.z) < 4.5;
      if (near && n.greeted <= 0) {
        gesture = 'greet';
        n.greeted = 20;
      } else if ((n.next -= dt) <= 0) {
        n.next = 7 + Math.random() * 9;
        gesture = Math.random() < 0.5 ? 'look' : Math.random() < 0.5 ? 'agree' : 'relax';
      }
      if (!near && n.greeted > 0) n.greeted -= dt;
      n.rig.update(dt, { gesture });
    }
  }

  /**
   * Swap a hand-built body for its rigged model once that has loaded (0.44). The aura, marks and
   * everything else on the view stay; the body's own pieces are hidden.
   */
  upgradeCreature(v, spec) {
    if (!spec) return;
    // (0.56.2) its hand-built body stays hidden while the model loads (the aura and marks stay)
    const keep = (ch) => ch === v.aura || ch === v.markRing || ch === v.veil || ch === v.loot || ch === v.judge; // (0.84) the shroud and the stolen Faith stay too
    hideWhileLoading(v.model.group.children.filter((ch) => !keep(ch)), loadCreature(spec), () => !!v.model.group.parent && !v.rig);
    loadCreature(spec).then((tpl) => {
      if (!tpl || v.deathT !== undefined || !v.model.group.parent) return;
      const rig = makeCreature(tpl, spec);
      for (const ch of v.model.group.children) if (!keep(ch)) ch.visible = false;
      v.model.group.add(rig.group);
      v.rig = rig;
      v.model.mats = rig.mats;
    });
  }

  disposeGroup(group) {
    this.scene.remove(group);
    const shared = new Set(this.geoCache.values());
    group.traverse((o) => {
      if (o.geometry && !shared.has(o.geometry) && !o.geometry.userData.keep) o.geometry.dispose();
      if (o.material) {
        if (o.material.map && !o.material.map.userData.keep) o.material.map.dispose();
        if (!o.material.userData.keep) o.material.dispose(); // (0.81.1) the keep's people share theirs
      }
    });
  }

  /** (0.95) One material for every shot of a colour (a fresh one per mote was a Windrunner borrower's lag). */
  shotMat(color) {
    this.shotMats = this.shotMats || new Map();
    let m = this.shotMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      m.userData.shared = true;
      m.userData.color = color;
      this.shotMats.set(color, m);
    }
    return m;
  }
  syncProjectiles(world, alpha) {
    const seen = new Set();
    for (const pr of world.projectiles) {
      seen.add(pr.id);
      let m = this.projViews.get(pr.id);
      if (!m) {
        if (pr.kind === 'crescent') {
          // (0.60.2) Crimson Reach: a flat red arc, bowed the way it flies
          const geo = new THREE.TorusGeometry(1, 0.11, 6, 22, Math.PI * 0.85);
          geo.rotateZ(-Math.PI * 0.425);
          geo.rotateX(-Math.PI / 2);
          m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.9 }));
        } else {
          // (0.81.5) one shared shape for every shot (a fresh one per arrow was most of a Windrunner's lag)
          if (!this.shotGeo) {
            this.shotGeo = new THREE.IcosahedronGeometry(0.32, 1);
            this.shotGeo.userData.keep = true;
          }
          m = new THREE.Mesh(this.shotGeo, this.shotMat(0xd78bff)); // (0.95) a material shared by every shot of a colour
        }
        this.scene.add(m);
        this.projViews.set(pr.id, m);
      }
      if (pr.volley > 0) m.userData.volley = pr.volley; // (0.81.5) arrows folded into this one
      m.userData.kind = pr.kind;
      const own = pr.ice ? 0x9fe6ff : { arrow: 0xfff0b0, spark: 0x8fd0ff, bolt: 0xff9a3a, orb: 0xc8f0ff, kunai: 0xe4d6ff, mote: 0xfff3b0, crescent: 0xff3a3a, lance: 0xfff0c0, eye: 0xffffff, holy: 0xfff4d8 }[pr.kind]; // the hero's own shots (0.94: the Seraph's lance and eyes)
      m.userData.color = own || 0xd78bff;
      const want = own || (pr.reflected ? 0xbff2ff : pr.parryable ? 0xe7a8ff : COLORS.danger);
      if (m.material.userData.shared) {
        if (m.material.userData.color !== want) m.material = this.shotMat(want);
      } else m.material.color.set(want);
      m.position.set(lerp(pr.px, pr.x, alpha), 1.2, lerp(pr.pz, pr.z, alpha));
      m.scale.setScalar(pr.kind === 'orb' ? 2.5 : pr.kind === 'bolt' ? 1.7 : pr.kind === 'spark' ? 0.75 : pr.kind ? 0.55 : pr.reflected ? 1.3 : 1);
      if (pr.kind === 'bolt' || pr.kind === 'spark') {
        // (0.56.3) a Mage's bolts burn a trail behind them
        const big = pr.kind === 'bolt';
        this.burst(m.position.x, 1.2, m.position.z, { count: big ? 2 : 1, color: own, speed: big ? 1.4 : 0.8, up: 0.6, gravity: big && !pr.ice ? -1.5 : 0, life: big ? 0.5 : 0.3, size: big ? 1.5 : 1 });
      }
      if (!pr.kind && pr.fx && FX_COLOR[pr.fx] && Math.random() < 0.7) {
        // an enemy's shot leaves a trail of what it is made of (bile, spores, embers, frost, tears)
        this.burst(m.position.x, 1.2, m.position.z, { count: 1, color: FX_COLOR[pr.fx], speed: 0.5, up: 0.4, gravity: 0.5, life: 0.45, size: 1.2 });
      }
      if (pr.kind === 'mote') {
        m.scale.setScalar(0.8); // (0.95) a lighter wake: many of them fly at once
        if (Math.random() < 0.3) this.burst(m.position.x, 1.2, m.position.z, { count: 1, color: 0xfff3b0, speed: 0.4, up: 0.3, gravity: 0, life: 0.35, size: 1 });
      }
      if (pr.kind === 'crescent') {
        const a = Math.atan2(pr.z - pr.pz, pr.x - pr.px);
        const w = Math.max(0.6, (pr.radius || 0.8) * 1.25);
        m.scale.set(w, 1, w);
        if (pr.x !== pr.px || pr.z !== pr.pz) m.rotation.set(0, -a, 0);
        m.position.set(m.position.x - Math.cos(a) * w * 0.7, 1.0, m.position.z - Math.sin(a) * w * 0.7);
        if (Math.random() < 0.8) this.burst(m.position.x + Math.cos(a) * w * 0.7, 1.0, m.position.z + Math.sin(a) * w * 0.7, { count: 1, color: 0xff5050, speed: 0.6, up: 0.3, gravity: 0, life: 0.3, size: 1.1 });
      }
      if (pr.kind === 'lance' || pr.kind === 'eye' || pr.kind === 'holy') {
        // (0.95) the Seraph's shots: a spear of light (Dawnlance) or a shard of light (Choir of Eyes), pointing
        // where they fly, a halo turning, a wake of gold
        if (!m.userData.body) this.seraphShot(m, pr.kind);
        m.scale.setScalar(1);
        if (pr.x !== pr.px || pr.z !== pr.pz) m.rotation.set(0, Math.atan2(pr.x - pr.px, pr.z - pr.pz), 0);
        m.position.y = pr.kind === 'lance' ? 1.8 : pr.kind === 'holy' ? 1.7 : 1.9;
        if (m.userData.halo) m.userData.halo.rotation.z += 0.25;
        if (pr.kind === 'holy') m.userData.halo.rotation.x += 0.18;
        const big = pr.kind === 'lance';
        if (Math.random() < (big ? 0.9 : 0.5)) this.burst(m.position.x, m.position.y, m.position.z, { count: big ? 2 : 1, color: big ? 0xffe2a0 : 0xfff6e0, speed: big ? 0.8 : 0.4, up: 0.15, gravity: 0, life: big ? 0.5 : 0.3, size: big ? 0.45 : 0.35 });
      }
      if (pr.kind === 'kunai') {
        // A thin blade pointing where it flies.
        m.scale.set(0.45, 0.45, 2.4);
        if (pr.x !== pr.px || pr.z !== pr.pz) m.rotation.set(0, Math.atan2(pr.x - pr.px, pr.z - pr.pz), 0);
      }
      if (pr.kind === 'orb') {
        m.rotation.y += 0.12;
        m.rotation.x += 0.07;
        if (Math.random() < 0.8) this.burst(m.position.x, 1.2, m.position.z, { count: 2, color: 0xe8fbff, speed: 2.5, up: 1, gravity: 0, life: 0.5, size: 1.1 });
      }
      if (pr.kind !== 'mote' && Math.random() < (pr.kind === 'arrow' ? 0.3 : 0.6)) this.burst(m.position.x, 1.2, m.position.z, { count: 1, color: own || (pr.reflected ? 0x9fe8ff : 0xb44aff), speed: 0.6, up: 0.4, gravity: 0, life: 0.35, size: 0.9 });
    }
    for (const [id, m] of this.projViews) {
      if (!seen.has(id)) {
        this.burst(m.position.x, 1.2, m.position.z, { count: m.userData.kind === 'arrow' ? 4 : m.userData.kind === 'mote' ? 3 : 8, color: m.userData.color || 0xd78bff, speed: 4, up: 2 });
        if (m.userData.volley > 0) this.rainArrows(m.position.x, m.position.z, m.userData.volley);
        this.scene.remove(m);
        if (!m.geometry.userData.keep) m.geometry.dispose();
        if (!m.material.userData.shared) m.material.dispose();
        this.projViews.delete(id);
      }
    }
    this.stepRain();
  }

  /**
   * (0.81.5) Arrows raining down where a Windrunner's volley lands: drawn only (the damage came with the
   * arrow that carried them), all in one instanced mesh, so a sky full of them costs one draw.
   */
  rainArrows(x, z, n) {
    if (!this.arrowRain) {
      const N = 256;
      const geo = new THREE.BoxGeometry(0.09, 0.09, 1.6);
      geo.translate(0, 0, -0.8); // the tip at the origin, the shaft trailing behind
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.arrowRain = { mesh, live: [], N, next: 0, m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), d: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), z: new THREE.Vector3(0, 0, 1) };
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < N; i++) mesh.setMatrixAt(i, zero);
    }
    const R = this.arrowRain;
    if (R.mesh.parent !== this.scene) this.scene.add(R.mesh);
    const shown = Math.min(6, Math.max(1, Math.round(n)));
    for (let i = 0; i < shown; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 1.1;
      const ex = x + Math.cos(a) * r, ez = z + Math.sin(a) * r;
      const from = Math.random() * Math.PI * 2;
      R.live.push({ slot: R.next, t: -i * 0.035, dur: 0.2, sx: ex + Math.cos(from) * 2.2, sy: 7.5, sz: ez + Math.sin(from) * 2.2, ex, ez });
      R.next = (R.next + 1) % R.N;
    }
    if (R.live.length > R.N) R.live.splice(0, R.live.length - R.N);
  }
  stepRain() {
    const R = this.arrowRain;
    if (!R || !R.live.length) return;
    const dt = this.lastDt || 1 / 60;
    const zero = R.m.clone().makeScale(0, 0, 0);
    R.live = R.live.filter((a) => {
      a.t += dt;
      if (a.t < 0) {
        R.mesh.setMatrixAt(a.slot, zero);
        return true;
      }
      if (a.t >= a.dur) {
        R.mesh.setMatrixAt(a.slot, zero);
        if (Math.random() < 0.5) this.burst(a.ex, 0.2, a.ez, { count: 1, color: 0xfff0b0, speed: 1.5, up: 1.2, life: 0.25 });
        return false;
      }
      const k = a.t / a.dur;
      R.v.set(a.sx + (a.ex - a.sx) * k, a.sy * (1 - k) + 0.1, a.sz + (a.ez - a.sz) * k);
      R.d.set(a.ex - a.sx, -a.sy, a.ez - a.sz).normalize();
      R.q.setFromUnitVectors(R.z, R.d);
      R.m.compose(R.v, R.q, R.s);
      R.mesh.setMatrixAt(a.slot, R.m);
      return true;
    });
    R.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * (0.95) An Immortal on the ground, unmistakable beside an Ancient: a white-hot heart in a larger gold gem,
   * a tall double beam (a white core in gold) that breathes, three gold rings turning round it, a turning sun
   * on the ground, a halo of light, a warm light on everything near, and sparks rising. An Eternal the same in
   * white and crimson.
   */
  lootRelic(v, eternal) {
    const g = v.group;
    const main = eternal ? 0xff3d4f : 0xffd24a, hot = eternal ? 0xffffff : 0xfff6d8;
    const add = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // the gem: larger, and a white-hot heart inside it
    v.gem.scale.setScalar(1.45);
    const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: hot }));
    v.gem.add(heart);
    // the beam, doubled and taller
    const H = 16;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.42, H, 12, 1, true), add(main, 0.55));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, H, 8, 1, true), add(hot, 0.9));
    outer.position.y = core.position.y = H / 2;
    // three rings turning round the gem, each its own way
    const rings = [0, 1, 2].map((i) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.18, 0.035, 6, 32), add(i === 1 ? hot : main, 0.85));
      r.rotation.x = Math.PI / 2 + (i - 1) * 0.5;
      return r;
    });
    // a sun on the ground: a ring and twelve rays, turning
    const sun = new THREE.Group();
    const disc = new THREE.Mesh(this.ringGeo(), add(main, 0.8));
    disc.scale.setScalar(1.5);
    sun.add(disc);
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.08, i % 2 ? 0.9 : 1.5).rotateX(-Math.PI / 2), add(main, 0.7));
      const a = (i / 12) * Math.PI * 2;
      ray.position.set(Math.cos(a) * (i % 2 ? 1.9 : 2.2), 0, Math.sin(a) * (i % 2 ? 1.9 : 2.2));
      ray.rotation.y = -a + Math.PI / 2;
      sun.add(ray);
    }
    sun.position.y = 0.05;
    // a halo of light round the gem, and a warm light
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: main, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(3.2, 3.2, 1);
    const light = new THREE.PointLight(main, 40, 9, 1.6);
    light.position.y = 1.2;
    g.add(outer, core, ...rings, sun, halo, light);
    v.relic = { outer, core, rings, sun, halo, light, main };
    if (eternal) this.lootEternal(v, add);
  }
  /**
   * (0.96) An Eternal goes far past an Immortal: a beam twice as tall wound round by a white and a crimson
   * strand, a crown of eight blades turning round the gem, a second sun turning the other way, a shockwave
   * along the ground every moment, and a deeper light.
   */
  lootEternal(v, add) {
    const g = v.group, R = v.relic;
    v.gem.scale.setScalar(1.9);
    R.outer.scale.set(1.6, 1.8, 1.6);
    R.outer.position.y = 14.4;
    R.core.scale.set(1.4, 1.8, 1.4);
    R.core.position.y = 14.4;
    R.light.distance = 14;
    // two strands wound round the beam
    const helix = (phase, color) => {
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, a = phase + t * Math.PI * 14;
        pts.push(new THREE.Vector3(Math.cos(a) * 0.75, t * 22, Math.sin(a) * 0.75));
      }
      return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.05, 5, false), add(color, 0.9));
    };
    const strands = new THREE.Group();
    strands.add(helix(0, 0xffffff), helix(Math.PI, 0xff2a3a));
    // a crown of eight blades turning round the gem
    const crown = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), add(i % 2 ? 0xffffff : 0xff3d4f, 0.95));
      b.scale.set(0.5, 0.5, 2.6);
      const a = (i / 8) * Math.PI * 2;
      b.position.set(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
      b.rotation.y = -a + Math.PI / 2;
      crown.add(b);
    }
    // a second sun, white, turning the other way, wider
    const sun2 = R.sun.clone();
    sun2.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.color.set(0xffffff); } });
    sun2.scale.setScalar(1.45);
    g.add(strands, crown, sun2);
    Object.assign(R, { strands, crown, sun2, wave: 0 });
  }
  stepLootRelic(v, l) {
    const R = v.relic, t = this.time + l.id;
    const breath = 0.5 + 0.5 * Math.sin(t * 2.4);
    R.outer.material.opacity = 0.35 + 0.3 * breath;
    R.core.material.opacity = 0.6 + 0.35 * breath;
    R.rings.forEach((r, i) => {
      r.position.y = v.gem.position.y;
      r.rotation.z += (i % 2 ? -1 : 1) * 0.03 * (1 + i * 0.4);
      r.rotation.y += 0.012 * (i + 1);
    });
    R.sun.rotation.y = t * 0.6;
    R.halo.position.y = v.gem.position.y;
    R.halo.material.opacity = 0.55 + 0.35 * breath;
    R.light.intensity = 30 + 25 * breath;
    if (Math.random() < (R.crown ? 0.6 : 0.25)) this.burst(v.group.position.x + (Math.random() - 0.5) * 1.6, 0.3, v.group.position.z + (Math.random() - 0.5) * 1.6, { count: 1, color: R.crown && Math.random() < 0.5 ? 0xffffff : R.main, speed: 0.3, up: 3, gravity: -0.5, life: 1.2, size: 0.6 });
    if (R.crown) {
      // (0.96) the Eternal's own
      R.strands.rotation.y = t * 1.4;
      R.crown.rotation.y = -t * 1.1;
      R.crown.position.y = v.gem.position.y + 0.9 + 0.15 * Math.sin(t * 2);
      R.sun2.rotation.y = -t * 0.45;
      R.light.intensity = 60 + 50 * breath;
      R.wave -= this.lastDt || 1 / 60;
      if (R.wave <= 0) {
        R.wave = 1.6;
        this.flash(this.ringGeo(), { x: v.group.position.x, z: v.group.position.z, y: 0.08, color: 0xff3d4f, from: 0.8, to: 7, dur: 1.1, opacity: 0.7 });
      }
    }
  }
  syncLoot(world) {
    const seen = new Set();
    const me = world.cur ? world.cur.pid : undefined;
    for (const l of world.loot) {
      if (l.owner !== undefined && me !== undefined && l.owner !== me) continue; // a party friend's drop: only they see it
      seen.add(l.id);
      let v = this.lootViews.get(l.id);
      if (!v) {
        const color = new THREE.Color(l.item.set ? SET_COLOR : RARITIES[l.item.rarity].color); // set pieces glow green (0.29)
        const group = new THREE.Group();
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color }));
        const beamH = 2.5 + l.item.rarity * 1.5;
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.14, beamH, 6, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 + l.item.rarity * 0.08, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        beam.position.y = beamH / 2;
        const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
        ring.scale.setScalar(0.6);
        ring.position.y = 0.04;
        group.add(gem, beam, ring);
        this.scene.add(group);
        v = { group, gem };
        if (l.item.rarity >= 6 && !l.item.set) this.lootRelic(v, l.item.rarity >= 7); // (0.95) Immortal (and Eternal): a look of their own
        this.lootViews.set(l.id, v);
      }
      v.group.position.set(l.x, 0, l.z);
      v.gem.position.y = 0.7 + Math.sin(this.time * 3 + l.id) * 0.15;
      v.gem.rotation.y = this.time * 2;
      if (v.relic) this.stepLootRelic(v, l);
    }
    for (const [id, v] of this.lootViews) {
      if (!seen.has(id)) {
        this.disposeGroup(v.group);
        this.lootViews.delete(id);
      }
    }
  }

  syncTelegraphs(world) {
    const seen = new Set();
    // (0.64) Clouded sight: short of a Caelum map's Animus, the ground warnings flicker (they never vanish
    // for long, and the moment to parry still turns white; it is only harder to read).
    const C = world.map && CAELUM.maps[world.map.id];
    const clouded = !!C && !!world.player && animusShort(world.player.animus, C.animus);
    const now = performance.now() / 1000;
    for (const t of world.telegraphs) {
      seen.add(t.id);
      let v = this.teleViews.get(t.id);
      if (!v) {
        let geo;
        if (t.kind === 'arc') geo = this.sectorGeo(t.angle);
        else if (t.kind === 'ring') geo = this.sectorGeo(6.283, Math.max(0.05, Math.min(0.95, (t.inner || 0) / Math.max(0.1, t.radius))));
        else if (t.kind === 'circle') geo = this.discGeo();
        else geo = this.rectGeo();
        const mk = (opacity) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
        const base = new THREE.Mesh(geo, mk(0.24));
        const fill = new THREE.Mesh(geo, mk(0.4));
        base.position.y = 0.03;
        fill.position.y = 0.045;
        const group = new THREE.Group();
        group.add(base, fill);
        this.scene.add(group);
        v = { group, base, fill };
        this.teleViews.set(t.id, v);
      }
      const k = Math.min(1, t.t / t.dur);
      v.group.position.set(t.x, 0, t.z);
      v.group.rotation.y = -t.dir;
      const color = t.friendly ? COLORS.friendly : t.doom ? COLORS.doom : t.pool ? FX_COLOR[t.poolKind] || 0x9cff4a : !t.parryable ? COLORS.danger : t.cue ? COLORS.cue : t.dominion != null ? COLORS.dominion : COLORS.parryable;
      if (clouded && !t.friendly) {
        const slot = Math.floor(now * 11 + t.id * 0.37);
        const r = ((slot * 2654435761) >>> 0) % 7;
        v.group.visible = t.cue || r > 1; // out for about two frames in seven, never during the cue
        v.base.material.opacity = 0.1 + (r / 7) * 0.2;
      } else {
        v.group.visible = true;
        v.base.material.opacity = t.dominion != null ? 0.42 : 0.24;
      }
      v.base.material.color.set(color);
      v.fill.material.color.set(color);
      v.fill.material.opacity = t.doom || t.pool ? 0.6 : t.cue && t.parryable ? 0.7 : t.dominion != null ? 0.62 : 0.4;
      if (t.kind === 'rect') {
        v.base.scale.set(t.length, 1, t.width);
        v.fill.scale.set(t.length * k, 1, t.width);
      } else {
        const size = t.kind === 'arc' ? t.range : t.radius;
        v.base.scale.set(size, 1, size);
        v.fill.scale.set(size * k, 1, size * k);
      }
    }
    for (const [id, v] of this.teleViews) {
      if (!seen.has(id)) {
        this.scene.remove(v.group);
        v.base.material.dispose();
        v.fill.material.dispose();
        this.teleViews.delete(id);
      }
    }
  }

  /**
   * (0.61.2) A held skill shot (Deadeye): its whole line on the ground, gold sparks running down it, a
   * sight at the far end, and a mark on each enemy it would hit, brightest on the first. `this.aim` is set
   * by main.js every frame from src/ui/aim.js, or null.
   */
  syncAim(world, heroPos) {
    const aim = this.aim;
    if (!aim) {
      if (this.aimView) this.aimView.group.visible = false;
      return;
    }
    if (!this.aimView) {
      const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const group = new THREE.Group();
      const line = new THREE.Group(); // turns with the aim; +X runs down the shot
      const band = new THREE.Mesh(this.rectGeo(), mat(0xffc860, 0.14));
      const edgeL = new THREE.Mesh(this.rectGeo(), mat(0xffc860, 0.55));
      const edgeR = new THREE.Mesh(this.rectGeo(), mat(0xffc860, 0.55));
      const core = new THREE.Mesh(this.rectGeo(), mat(0xfff2c8, 0.35));
      const sparks = [];
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(this.rectGeo(), mat(0xfff6dc, 0.8));
        line.add(m);
        sparks.push(m);
      }
      const sight = new THREE.Mesh(this.ringGeo(), mat(0xffe2a0, 0.9));
      const sightDot = new THREE.Mesh(this.discGeo(), mat(0xffd27a, 0.35));
      line.add(band, edgeL, edgeR, core, sight, sightDot);
      group.add(line);
      const marks = [];
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(this.ringGeo(), mat(i === 0 ? 0xffd27a : 0xffe9b8, i === 0 ? 1 : 0.6));
        const disc = new THREE.Mesh(this.discGeo(), mat(0xffc860, i === 0 ? 0.3 : 0.14));
        group.add(ring, disc);
        marks.push({ ring, disc });
      }
      this.scene.add(group);
      this.aimView = { group, line, band, edgeL, edgeR, core, sparks, sight, sightDot, marks };
    }
    const v = this.aimView;
    v.group.visible = true;
    // (0.62) the whole line turns red the moment an enemy is on it: locked on, no need to check the minimap
    const locked = aim.hits.length > 0;
    if (v.locked !== locked) {
      v.locked = locked;
      const set = (m, gold, red) => m.material.color.setHex(locked ? red : gold);
      set(v.band, 0xffc860, 0xff3a3a);
      set(v.edgeL, 0xffc860, 0xff5050);
      set(v.edgeR, 0xffc860, 0xff5050);
      set(v.core, 0xfff2c8, 0xffb0a0);
      set(v.sight, 0xffe2a0, 0xff7060);
      set(v.sightDot, 0xffd27a, 0xff4a3a);
      for (const sp of v.sparks) set(sp, 0xfff6dc, 0xffd0c0);
      v.band.material.opacity = locked ? 0.22 : 0.14;
      v.marks.forEach((mk, i) => {
        mk.ring.material.color.setHex(i === 0 ? 0xff3a3a : 0xff8070);
        mk.disc.material.color.setHex(0xff3a3a);
      });
    }
    const hx = heroPos ? heroPos.x : aim.x, hz = heroPos ? heroPos.z : aim.z;
    const w = aim.width, R = aim.range;
    v.line.position.set(hx, 0, hz);
    v.line.rotation.y = -aim.dir;
    v.band.position.set(0, 0.09, 0);
    v.band.scale.set(R, 1, w);
    v.edgeL.position.set(0, 0.1, -w / 2);
    v.edgeL.scale.set(R, 1, 0.09);
    v.edgeR.position.set(0, 0.1, w / 2);
    v.edgeR.scale.set(R, 1, 0.09);
    v.core.position.set(0, 0.1, 0);
    v.core.scale.set(R, 1, 0.12);
    // sparks run down the line, so it reads as a shot about to be loosed, not a drawing on the floor
    const n = v.sparks.length;
    for (let i = 0; i < n; i++) {
      const f = (i / n + this.time * 0.55) % 1;
      const m = v.sparks[i];
      m.position.set(f * R, 0.11, 0);
      m.scale.set(0.45, 1, w * 0.8);
      m.material.opacity = 0.7 * Math.sin(f * Math.PI);
    }
    const pulse = 1 + Math.sin(this.time * 8) * 0.08;
    v.sight.position.set(R, 0.12, 0);
    v.sight.scale.setScalar(1.1 * pulse);
    v.sightDot.position.set(R, 0.1, 0);
    v.sightDot.scale.setScalar(0.5);
    for (let i = 0; i < v.marks.length; i++) {
      const h = aim.hits[i];
      const mk = v.marks[i];
      mk.ring.visible = mk.disc.visible = !!h;
      if (!h) continue;
      const r = (h.e.radius || 0.6) + (i === 0 ? 0.7 : 0.45);
      mk.ring.position.set(h.e.x, 0.14, h.e.z);
      mk.ring.scale.setScalar(r * (i === 0 ? pulse : 1));
      mk.disc.position.set(h.e.x, 0.12, h.e.z);
      mk.disc.scale.setScalar(r);
    }
  }

  syncMarkers(world) {
    const p = world.player;
    const place = (ring, id, pulse) => {
      const e = id != null ? world.enemyById(id) : null;
      const v = e && this.views.get(e.id);
      ring.visible = !!v;
      if (v) {
        ring.position.x = v.model.group.position.x;
        ring.position.z = v.model.group.position.z;
        ring.scale.setScalar(e.radius * 1.5 + (pulse ? Math.sin(this.time * 6) * 0.05 : 0));
      }
    };
    place(this.targetRing, p.targetId, true);
    place(this.hoverRing, this.hoverId !== p.targetId ? this.hoverId : null, false);
  }

  render(world, alpha, dt) {
    this.lastDt = dt; // (0.81.5) for the arrow rain
    this._world = world; // (0.98) for effects that follow the sim (a Hand of Heaven over its foe)
    this.time += dt;
    const eform = eternalForm(world.player); // (0.76)
    const seraph = !!world.player.possess && !!world.map && world.map.id === 'wishkeep'; // (0.92) in the Seraph: its body
    if (seraph !== (this.heroCls === 'statue')) this.setHeroClass(seraph ? 'statue' : world.cls, seraph ? null : world.player.spec, seraph ? false : eform);
    else if (world.cls === this.heroCls && heroLook(world.cls, world.player.spec, eform) !== this.heroLook) this.setHeroClass(world.cls, world.player.spec, eform);
    this.lastHeroPos = { x: world.player.x, z: world.player.z };
    const heroPos = this.syncHero(world, alpha, dt);
    this.syncAllies(world, alpha, dt);
    this.updateKeep(world, dt); // (0.81)
    this.syncExtras(world, dt);
    this.syncShadows(world, dt);
    this.syncShades(world, alpha, dt); // (0.81.3) Umbra Gemina, Ember Clones, Rime Halo
    this.syncWalls(world);
    this.syncEnemies(world, alpha, dt);
    this.syncPeople(world, dt);
    this.syncGlimmers(world, dt);
    this.syncProjectiles(world, alpha);
    this.syncLoot(world);
    this.syncChests(world);
    this.syncTelegraphs(world);
    this.syncMarkers(world);
    this.syncAim(world, heroPos);
    this.syncIncarnate(world, dt, heroPos); // (0.85) the channel's light, the god rising
    this.syncMiracles(world, dt); // (0.87)
    this.updateParticles(dt);
    this.updateFlashes(dt);
    if (this.portalViews && this.exploreGroup && this.exploreGroup.visible) {
      for (const pv of this.portalViews) {
        const active = world.portalOn === pv.gate && world.portalArmed;
        pv.veil.material.opacity = active ? 0.9 : 0.32 + Math.sin(this.time * 2.5) * 0.1;
        pv.pad.scale.setScalar(pv.gate.r * (active ? 1 - 0.5 * Math.min(1, world.portalT / 0.9) : 1));
      }
    }
    if (this.wayView && this.exploreGroup && this.exploreGroup.visible) {
      // (0.61) the Waygate's rings turn; faster, lower and brighter while it carries you off
      const v = this.wayView;
      const on = world.wayArmed && world.wayT > 0;
      const k = on ? Math.min(1, world.wayT / 0.9) : 0;
      v.halo.rotation.z += dt * (0.6 + 4 * k);
      v.halo2.rotation.z -= dt * (0.9 + 5 * k);
      v.halo.position.y = 2.2 - 1.4 * k + Math.sin(this.time * 1.6) * 0.08;
      v.halo2.position.y = 2.6 - 1.8 * k + Math.sin(this.time * 1.6 + 1) * 0.08;
      v.halo.material.opacity = 0.6 + 0.4 * k + Math.sin(this.time * 3) * 0.1;
      v.caps.forEach((c, i) => { c.position.y = 3.0 + Math.sin(this.time * 2 + i * 1.6) * 0.12; c.rotation.y += dt * 1.2; });
      v.disc.material.opacity = on ? 0.55 : 0.14 + Math.sin(this.time * 2) * 0.05;
      v.pad.scale.setScalar(v.wg.r * (on ? 1 - 0.5 * k : 1));
    }
    if (this.stoneViews && this.exploreGroup && this.exploreGroup.visible) {
      for (let i = 0; i < this.stoneViews.length; i++) {
        const v = this.stoneViews[i];
        const on = world.stoneArmed && world.stoneT > 0 && world.stoneOn === v.ws;
        const k = on ? Math.min(1, world.stoneT / 0.9) : 0;
        v.crystal.rotation.y += dt * (1 + 6 * k);
        v.crystal.position.y = 3.05 + Math.sin(this.time * 1.8 + i) * 0.15;
        v.band.position.y = 0.6 + ((this.time * 0.6 + i * 0.3) % 1) * 2.0; // a band of runes that rises up the pillar
        v.band.material.opacity = 0.85 * (1 - ((this.time * 0.6 + i * 0.3) % 1)) + 0.15;
        v.disc.material.opacity = on ? 0.55 : 0.16 + Math.sin(this.time * 2 + i) * 0.05;
        v.pad.scale.setScalar(v.ws.r * (on ? 1 - 0.5 * k : 1));
      }
    }
    for (let i = 0; i < (this.ringViews || []).length; i++) {
      // (0.61) the Echo Ring's gate swirls, its column breathes, the star-glass bobs
      const v = this.ringViews[i];
      v.swirlA.rotation.y += dt * 1.1;
      v.swirlB.rotation.y -= dt * 1.7;
      v.column.material.opacity = 0.1 + Math.sin(this.time * 2.2) * 0.05;
      v.glow.material.opacity = 0.2 + Math.sin(this.time * 1.5) * 0.06;
      v.shards.forEach((sh, j) => { sh.position.y += Math.sin(this.time * 2 + j) * 0.002; sh.rotation.y += dt * 1.5; });
    }
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      b.rotation.y = this.time * 1.5 + i;
      b.scale.setScalar(1 + Math.sin(this.time * 7 + i * 2) * 0.15);
    }

    // Camera follows the hero with a little lag, plus screen shake.
    const follow = 1 - Math.exp(-7 * dt);
    this.camTarget.x = lerp(this.camTarget.x, heroPos.x, follow);
    this.camTarget.z = lerp(this.camTarget.z, heroPos.z * 0.92, follow);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake * 0.9;
    const ox = (Math.random() - 0.5) * sh;
    const oz = (Math.random() - 0.5) * sh;
    // (0.85) the channel draws the eye to where the god will land
    const ch = world.tide && world.tide.chan != null && world.tide.chanAt;
    this.chanLook = lerp(this.chanLook || 0, ch ? 1 : 0, 1 - Math.exp(-3 * dt));
    if (ch) this.chanAtSeen = world.tide.chanAt;
    const tx = this.chanAtSeen ? lerp(this.camTarget.x, this.chanAtSeen.x, this.chanLook * 0.75) : this.camTarget.x;
    const tz = this.chanAtSeen ? lerp(this.camTarget.z, this.chanAtSeen.z, this.chanLook * 0.75) : this.camTarget.z;
    const zoom = this.zoom * (1 - 0.18 * this.chanLook);
    const top = { x: tx + ox, y: this.camOffset.y * zoom, z: tz + this.camOffset.z * zoom + oz, lx: tx + ox, ly: 0.8, lz: tz + oz };
    // (0.85) over the shoulder: eased in and out, blended with the view from above
    const S = this.shoulder;
    S.k += ((S.on ? 1 : 0) - S.k) * (1 - Math.exp(-4.5 * dt));
    if (S.k < 0.002) S.k = 0;
    if (S.k > 0) {
      const hp = this.hero && this.hero.group ? this.hero.group.position : heroPos;
      const fx = dCosR(S.yaw), fz = dSinR(S.yaw);
      const rx = -fz, rz = fx; // to the right
      let back = 5.2;
      const up = 2.3 + 1.6 * S.pitch, side = 0.75;
      // (0.91) a wall, a pillar or a house between you and the camera: the camera comes in front of it
      if (world.navFree && world.map) {
        for (let d = 0.6; d <= back; d += 0.3) {
          if (!world.navFree(hp.x - fx * d + rx * side * (d / back), hp.z - fz * d + rz * side * (d / back))) {
            back = Math.max(1.6, d - 0.5);
            break;
          }
        }
      }
      this.camBack = this.camBack == null ? back : lerp(this.camBack, back, 1 - Math.exp(-(back < this.camBack ? 14 : 3) * dt));
      back = this.camBack;
      const ahead = 3 + 15 * (1 - S.pitch); // where the crosshair falls
      const sh = {
        x: hp.x - fx * back + rx * side + ox * 0.3, y: up, z: hp.z - fz * back + rz * side + oz * 0.3,
        lx: hp.x + fx * ahead + rx * side * 0.6, ly: 0.6 + 0.7 * (1 - S.pitch), lz: hp.z + fz * ahead + rz * side * 0.6,
      };
      const e = S.k * S.k * (3 - 2 * S.k); // smoothstep
      // the swoop arcs over the hero rather than cutting through them
      const arc = Math.sin(Math.PI * e) * 4;
      this.camera.position.set(lerp(top.x, sh.x, e), lerp(top.y, sh.y, e) + arc, lerp(top.z, sh.z, e));
      this.camera.lookAt(lerp(top.lx, sh.lx, e), lerp(top.ly, sh.ly, e), lerp(top.lz, sh.lz, e));
      this.camera.fov = 40 + 22 * e;
      this.camera.updateProjectionMatrix();
      if (this.scene.fog) {
        if (this.fogTop == null) this.fogTop = { near: this.scene.fog.near, far: this.scene.fog.far };
        this.scene.fog.near = lerp(this.fogTop.near, 22, e);
        this.scene.fog.far = lerp(this.fogTop.far, 70, e);
      }
    } else {
      this.camera.position.set(top.x, top.y, top.z);
      this.camera.lookAt(top.lx, top.ly, top.lz);
      if (this.camera.fov !== 40) {
        this.camera.fov = 40;
        this.camera.updateProjectionMatrix();
      }
      if (this.fogTop && this.scene.fog) {
        this.scene.fog.near = this.fogTop.near;
        this.scene.fog.far = this.fogTop.far;
        this.fogTop = null;
      }
    }
    this.camera.updateMatrixWorld();

    this.sun.position.set(this.camTarget.x + 14, 30, this.camTarget.z + 9);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.heroLight.position.set(heroPos.x, 7.5, heroPos.z + 2.5);
    this.windClock.value = this.time;
    if (this.motes && this.exploreGroup && this.exploreGroup.visible) this.motes.update(Math.min(dt, 0.1), this.camTarget.x, this.camTarget.z, this.time);
    if (this.rain && this.exploreGroup && this.exploreGroup.visible) this.rain.update(Math.min(dt, 0.1), this.camTarget.x, this.camTarget.z);
    if (this.lightning && this.exploreGroup && this.exploreGroup.visible && this.mood) {
      // Now and then the sky lights up: a double flash, then the dark again.
      const L = this.lightning;
      L.t -= dt;
      if (L.t <= 0) { L.flash = 0.45; L.t = 7 + Math.random() * 9; }
      if (L.flash > 0) L.flash = Math.max(0, L.flash - dt);
      const f = L.flash > 0.3 ? 1 : L.flash > 0.22 ? 0.2 : L.flash > 0.12 ? 0.8 : L.flash > 0 ? L.flash * 4 : 0;
      this.hemi.intensity = this.mood.sky * (1 + f * 2.2);
    }

    // (0.98) Ascension: the Seraph burns with its full light while it lasts
    const asc = seraph && world.player.ascendT > 0 && this.hero;
    if (asc && !this._asc) {
      const g = new THREE.Group();
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a0 }));
      sp.scale.set(5, 6, 1);
      sp.position.y = 1.6;
      const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.y = 0.1;
      ring.scale.setScalar(2.2);
      g.add(sp, ring);
      this.scene.add(g);
      this._asc = { g, sp, ring };
    }
    if (this._asc) {
      this._asc.g.visible = !!asc;
      if (asc) {
        this._asc.g.position.copy(this.hero.group.position);
        this._asc.sp.material.opacity = 0.55 + 0.25 * Math.sin(this.time * 6);
        this._asc.ring.rotation.y += dt * 2;
        if (Math.random() < 0.5) this.burst(this.hero.group.position.x, 2 + Math.random(), this.hero.group.position.z, { count: 1, color: 0xfff4d8, speed: 1, up: 2, life: 0.6, size: 0.45 });
      }
    }

    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Remove every enemy / projectile / loot view (used when a new run starts). */
  /** Party members: their hero model, walking or lying down. */
  /** Frostbinder Rimewalls: a row of ice blocks that sinks as it runs out. */
  /** Treasure chests: a box and a lid, tinted by how good the chest is; radiant ones glow. */
  syncChests(world) {
    if (!this.chestViews) this.chestViews = new Map();
    const seen = new Set();
    for (const c of world.chests || []) {
      seen.add(c.id);
      let v = this.chestViews.get(c.id);
      if (!v) {
        const look = { wooden: [0x8a5a2b, 0x5b3a1c, 0], gilded: [0xd9a441, 0x8a5a2b, 0.25], radiant: [0x7ff5e1, 0x3b6f8f, 0.9] }[c.tier] || [0x8a5a2b, 0x5b3a1c, 0];
        const group = new THREE.Group();
        const body = new THREE.MeshStandardMaterial({ color: look[1], roughness: 0.7, emissive: look[0], emissiveIntensity: look[2] * 0.3 });
        const trim = new THREE.MeshStandardMaterial({ color: look[0], roughness: 0.4, metalness: 0.5, emissive: look[0], emissiveIntensity: look[2] });
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.75), body);
        base.position.y = 0.3;
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 1.1, 10, 1, false, 0, Math.PI), trim);
        lid.rotation.z = Math.PI / 2;
        lid.position.y = 0.6;
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.78), trim);
        band.position.y = 0.31;
        base.castShadow = lid.castShadow = true;
        group.add(base, lid, band);
        if (c.tier !== 'wooden') {
          const color = new THREE.Color(look[0]);
          const h = c.tier === 'radiant' ? 7 : 3.5;
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, h, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: c.tier === 'radiant' ? 0.5 : 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
          beam.position.y = h / 2;
          group.add(beam);
        }
        group.position.set(c.x, 0, c.z);
        group.rotation.y = (c.id * 1.7) % 6.28;
        this.scene.add(group);
        v = { group, tier: c.tier };
        this.chestViews.set(c.id, v);
      }
      if (v.tier === 'radiant' && Math.random() < 0.25) this.burst(c.x, 1 + Math.random(), c.z, { count: 1, color: 0x7ff5e1, speed: 0.6, up: 1.2, gravity: 0, life: 0.9, size: 1 });
    }
    for (const [id, v] of this.chestViews) {
      if (!seen.has(id)) {
        this.disposeGroup(v.group);
        this.chestViews.delete(id);
      }
    }
  }

  syncWalls(world) {
    if (!this.wallViews) this.wallViews = new Map();
    const seen = new Set();
    for (const wl of world.walls || []) {
      seen.add(wl.id);
      let v = this.wallViews.get(wl.id);
      if (!v) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xbfeeff, emissive: 0x3a8fc0, emissiveIntensity: 0.5, transparent: true, opacity: 0.82, roughness: 0.2 });
        const n = Math.max(2, Math.round((wl.hw * 2) / 1.1));
        for (let i = 0; i < n; i++) {
          const h = 1.5 + ((i * 37) % 7) * 0.12;
          const b = new THREE.Mesh(new THREE.BoxGeometry((wl.hw * 2) / n - 0.06, h, wl.hd * 2), mat);
          b.position.set(-wl.hw + (wl.hw * 2 * (i + 0.5)) / n, h / 2, 0);
          b.rotation.z = (((i * 13) % 5) - 2) * 0.03;
          b.castShadow = true;
          group.add(b);
        }
        group.position.set(wl.x, 0, wl.z);
        group.rotation.y = -wl.rot;
        this.scene.add(group);
        v = { group, mat };
        this.wallViews.set(wl.id, v);
      }
      const rise = Math.min(1, (wl.dur - wl.t) / 0.2);
      const sink = Math.min(1, wl.t / 0.4);
      v.group.scale.y = Math.max(0.05, Math.min(rise, sink));
    }
    for (const [id, v] of this.wallViews) {
      if (seen.has(id)) continue;
      this.disposeGroup(v.group);
      this.wallViews.delete(id);
    }
  }

  /**
   * (0.81.3) A see-through copy of a hero in one material: the hand-built figure at once, then their own
   * rigged model (whatever look they wear: Eternal forms and the ninja too) once it has loaded.
   */
  makeGhost(cls, look, mat) {
    const group = new THREE.Group();
    const stand = buildHero(cls);
    stand.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    group.add(stand.group);
    const v = { group, rig: null, mat, alive: true };
    const id = 'hero_' + look;
    if (RIGGED[id]) {
      Promise.all([loadRigged(id), loadWeapon(cls, RIGGED[id].weaponScale || 1)]).then(([tpl, made]) => {
        if (!tpl || !v.alive) return;
        const rig = instantiate(tpl);
        if (tpl.spec.bow) rig.holdBow(mat, mat);
        else if (made) {
          const wpn = new THREE.Group();
          wpn.add(made.clone());
          rig.holdWeapon(wpn);
          if (tpl.spec.offhand) rig.holdOffhand(wpn.clone(), tpl.spec.offhand);
        }
        rig.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
        stand.group.visible = false;
        group.add(rig.group);
        rig.baseTurn = rig.group.rotation.y;
        v.rig = rig;
      });
    }
    this.scene.add(group);
    return v;
  }
  dropGhost(v) {
    v.alive = false;
    this.disposeGroup(v.group);
  }

  /** (0.81.3) Umbra Gemina's twin shadow at a hero's shoulder, Ember Clones in flight, and Rime Halo's rings. */
  syncShades(world, alpha, dt) {
    if (!this.shadeViews) this.shadeViews = new Map();
    if (!this.rimeViews) this.rimeViews = [];
    const p = world.player;
    const me = world.cur ? world.cur.pid : 0;
    const who = [];
    if (p && !p.dead) who.push({ pid: me, cls: world.cls, look: this.heroLook || world.cls, shade: p.shadeAt, clones: p.fireClones, rime: p.rimeT > 0 ? p.rimeR : 0, x: p.x, z: p.z });
    for (const a of world.mode === 'explore' && world.allies ? world.allies() : []) {
      if (a.dead) continue;
      who.push({ pid: a.pid, cls: a.cls, look: heroLook(a.cls, a.spec, !!a.eform), shade: a.shade, clones: a.clones, rime: a.rime || 0, x: a.x, z: a.z });
    }
    const seen = new Set();
    const rings = [];
    for (const h of who) {
      // the twin shadow
      if (h.shade) {
        const key = `shade:${h.pid}`;
        seen.add(key);
        let v = this.shadeViews.get(key);
        if (v && v.look !== h.look) {
          this.dropGhost(v);
          v = null;
        }
        if (!v) {
          const mat = new THREE.MeshBasicMaterial({ color: 0x3a2470, transparent: true, opacity: 0.5, depthWrite: false });
          v = this.makeGhost(h.cls, h.look, mat);
          v.look = h.look;
          v.atk = h.shade.atk || 0;
          v.group.position.set(h.shade.x, 0, h.shade.z);
          this.burst(h.shade.x, 1, h.shade.z, { count: 16, color: 0x7a3cff, speed: 3, up: 3, life: 0.5 });
          this.shadeViews.set(key, v);
        }
        const g = v.group;
        const k = 1 - Math.exp(-14 * dt); // (smoothed: it trails you like a shadow)
        g.position.x += (h.shade.x - g.position.x) * k;
        g.position.z += (h.shade.z - g.position.z) * k;
        // (0.95) the shade's own Whirlwind: it turns with it; (0.96) and every move of yours, played on its own body
        const spinning = h.shade.spinT > 0;
        v.spin = spinning ? (v.spin || 0) + dt * Math.PI * 2 * 2.4 : 0;
        g.rotation.y = Math.PI / 2 - (h.shade.facing || 0);
        if (v.rig) v.rig.group.rotation.y = (v.rig.baseTurn || 0) + v.spin;
        g.position.y = h.shade.y || 0;
        const attackStart = (h.shade.atk || 0) !== v.atk;
        v.atk = h.shade.atk || 0;
        const mv = h.shade.move;
        let move = null, moveDur = 0;
        if (mv && mv.n !== v.moveN) {
          v.moveN = mv.n;
          [move, moveDur] = [mv.fx, mv.dur || 0];
        }
        if (v.rig) v.rig.update(dt, { moving: !!h.shade.moving && !(h.shade.act), attackStart, attackDur: 0.25, move, moveDur, spinning });
        v.mat.opacity = 0.42 + 0.1 * Math.sin(this.time * 4 + h.pid);
        if (Math.random() < 0.15) this.burst(g.position.x, 0.3 + Math.random() * 1.5, g.position.z, { count: 1, color: 0x5a2aa0, speed: 0.4, up: 1, gravity: 0, life: 0.6 });
      }
      // the clones of fire
      for (const c of h.clones || []) {
        const key = `clone:${c.id}`;
        seen.add(key);
        let v = this.shadeViews.get(key);
        if (!v) {
          const mat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
          v = this.makeGhost(h.cls, h.look, mat);
          v.clone = true;
          v.hit = 0;
          v.group.scale.setScalar(0.85);
          this.burst(c.x, 1, c.z, { count: 12, color: 0xffb060, speed: 4, up: 3, life: 0.4 });
          this.shadeViews.set(key, v);
        }
        const g = v.group;
        g.position.set(lerp(c.px ?? c.x, c.x, alpha), 0.25, lerp(c.pz ?? c.z, c.z, alpha));
        g.rotation.y = Math.PI / 2 - c.facing;
        const striking = c.hitT > 0.2;
        if (v.rig) v.rig.update(dt, { moving: !striking, attackStart: striking && !v.wasHit, attackDur: 0.22 });
        v.wasHit = striking;
        v.mat.opacity = 0.65 + 0.2 * Math.sin(this.time * 20 + c.id);
        if (Math.random() < 0.6) this.burst(g.position.x, 0.5 + Math.random() * 1.4, g.position.z, { count: 1, color: Math.random() < 0.5 ? 0xff6a1a : 0xffc060, speed: 0.6, up: 2.2, gravity: 0, life: 0.45 });
      }
      // the rime rings: round the hero and their Shadows
      if (h.rime > 0) {
        rings.push({ x: h.pid === me ? this.hero.group.position.x : h.x, z: h.pid === me ? this.hero.group.position.z : h.z, r: h.rime });
        for (const sh of world.shadows || []) if (sh.pid === h.pid) rings.push({ x: sh.x, z: sh.z, r: h.rime });
      }
    }
    for (const [key, v] of this.shadeViews) {
      if (seen.has(key)) continue;
      const pos = v.group.position;
      this.burst(pos.x, 1, pos.z, { count: 14, color: v.clone ? 0xff8a3a : 0x7a3cff, speed: 3, up: 3, life: 0.45 });
      this.dropGhost(v);
      this.shadeViews.delete(key);
    }
    // rings, reused from a small pool
    while (this.rimeViews.length < rings.length) {
      const grp = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), ringMat);
      ring.rotation.x = -Math.PI / 2;
      const discMat = new THREE.MeshBasicMaterial({ color: 0x6ac8ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = -0.01;
      grp.add(ring, disc);
      const shards = new THREE.Group();
      const shardMat = new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.85, depthWrite: false });
      for (let i = 0; i < 12; i++) {
        const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), shardMat);
        const a = (i / 12) * Math.PI * 2;
        sh.position.set(Math.cos(a), 0.25 + (i % 2) * 0.25, Math.sin(a));
        sh.scale.set(0.7, 2.6, 0.7);
        shards.add(sh);
      }
      grp.add(shards);
      grp.userData = { ringMat, discMat, shards };
      this.scene.add(grp);
      this.rimeViews.push(grp);
    }
    this.rimeViews.forEach((grp, i) => {
      const r = rings[i];
      grp.visible = !!r;
      if (!r) return;
      if (grp.parent !== this.scene) this.scene.add(grp);
      grp.position.set(r.x, 0.06, r.z);
      grp.scale.set(r.r, 1, r.r);
      grp.userData.shards.rotation.y = this.time * 0.8;
      grp.userData.shards.children.forEach((c) => c.scale.set(0.7 / r.r, 2.6, 0.7)); // (the group is stretched flat; the shards are not)
      grp.userData.ringMat.opacity = 0.55 + 0.25 * Math.sin(this.time * 6 + i);
    });
  }

  /** Shadowdancer Shadows: dark, see-through copies of the hero that fade as they run out. (0.42:
   * the hero's own rigged model, blades and all, and they throw when the hero throws.) */
  syncShadows(world, dt) {
    if (!this.shadowViews) this.shadowViews = new Map();
    const seen = new Set();
    for (const s of world.shadows || []) {
      seen.add(s.id);
      let v = this.shadowViews.get(s.id);
      if (!v) {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0x4a2a88, transparent: true, opacity: 0.7, depthWrite: false });
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x9a6cff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(this.ringGeo(), ringMat);
        ring.position.y = 0.05;
        group.add(ring);
        // the hand-built figure stands in until the rigged one is ready
        const stand = buildHero(s.cls);
        stand.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
        group.add(stand.group);
        this.scene.add(group);
        v = { model: { group }, mat, ring, ringMat, rig: null, throwSeen: 0 };
        this.shadowViews.set(s.id, v);
        const look = heroLook(s.cls, 'shadowdancer');
        const id = 'hero_' + look;
        if (RIGGED[id]) {
          Promise.all([loadRigged(id), loadWeapon(s.cls, RIGGED[id].weaponScale || 1)]).then(([tpl, made]) => {
            if (!tpl || !this.shadowViews.has(s.id)) return;
            const rig = instantiate(tpl);
            if (made) {
              const wpn = new THREE.Group();
              wpn.add(made.clone());
              rig.holdWeapon(wpn);
              if (tpl.spec.offhand) rig.holdOffhand(wpn.clone(), tpl.spec.offhand);
            }
            rig.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
            stand.group.visible = false;
            group.add(rig.group);
            rig.baseTurn = rig.group.rotation.y;
            v.rig = rig;
          });
        }
        this.burst(s.x, 1, s.z, { count: 16, color: 0x7a3cff, speed: 4, up: 3, life: 0.5 });
      }
      const g = v.model.group;
      g.position.set(s.x, 0, s.z);
      g.rotation.y = Math.PI / 2 - s.facing;
      if (v.rig) {
        // a fresh throw (or copied cut): play the kunai throw once
        const throwing = s.throwT > 0;
        const start = throwing && !v.wasThrowing;
        v.wasThrowing = throwing;
        v.rig.update(dt, { moving: false, move: start ? 'kunai' : null, moveDur: 0 });
      } else g.position.y = s.throwT > 0 ? 0.15 : 0;
      const fade = Math.min(1, s.t / 0.8);
      v.mat.opacity = (0.55 + 0.12 * Math.sin(this.time * 5)) * fade;
      v.ringMat.opacity = 0.55 * fade;
      v.ring.scale.setScalar(0.9 + 0.5 * (s.t / s.dur));
      if (Math.random() < 0.25) this.burst(s.x, 0.4 + Math.random() * 1.4, s.z, { count: 1, color: 0x5a2aa0, speed: 0.6, up: 1.2, gravity: 0, life: 0.6 });
    }
    for (const [id, v] of this.shadowViews) {
      if (seen.has(id)) continue;
      const pos = v.model.group.position;
      this.burst(pos.x, 1, pos.z, { count: 14, color: 0x7a3cff, speed: 3, up: 3, life: 0.45 });
      this.disposeGroup(v.model.group);
      this.shadowViews.delete(id);
    }
  }


  /** A friend's animation state (0.41.1): their swings and skills, fed by their events. */
  allyAnim(pid) {
    if (!this.allyAnims) this.allyAnims = new Map();
    let an = this.allyAnims.get(pid);
    if (!an) {
      an = { swing: 1, swingDur: 0.2, spin: 0, move: null, cls: null };
      this.allyAnims.set(pid, an);
    }
    return an;
  }

  syncAllies(world, alpha, dt) {
    if (!this.allyViews) this.allyViews = new Map();
    const list = world.mode === 'explore' && world.allies ? world.allies().slice() : [];
    // (0.81) the Wishkeep's heroes, drawn like other players' heroes (with the keep's crimson on their blades)
    const day = !(world.tide && world.tide.state === 'on');
    if (!day && this.heroLife && this.heroLife.size) this.heroLife.clear(); // (the night: to their posts, as the game has them)
    for (const t of world.troops || []) {
      const it = { pid: 'troop:' + t.id, cls: t.cls, x: t.x, z: t.z, px: t.px, pz: t.pz, facing: t.facing, moving: !!t.moving, dead: !!t.dead, as: TROOP_AS[t.cls] || 1, troop: t.id, rar: t.rar || 0, shield: t.shield > 0, gender: t.gender || 'm' };
      if (day && !t.dead && world.map && world.map.id === 'wishkeep') {
        // (0.91) between nights: about their hall, and practising now and then (only drawn)
        const L = heroDay((this.heroLife = this.heroLife || new Map()), t, world, dt);
        [it.x, it.z, it.px, it.pz, it.facing, it.moving] = [L.x, L.z, L.x, L.z, L.facing, L.moving];
        if (L.swing) {
          const an = this.allyAnim(it.pid);
          an.swing = 0;
          an.swingDur = 0.35;
        }
      }
      list.push(it);
    }
    const seen = new Set();
    for (const a of list) {
      let v = this.allyViews.get(a.pid);
      const look = a.troop ? `keep_${a.cls}_${a.gender}:${a.rar || 0}` : a.seraph ? 'statue' : heroLook(a.cls, a.spec, !!a.eform); // (0.92) a keeper in their Seraph
      if (v && (v.cls !== a.cls || v.look !== look)) {
        v.model.disposed = true;
        this.disposeGroup(v.model.group);
        v = null;
      }
      if (!v && a.troop) {
        // (0.81.1) the keep's heroes are its own sworn, not copies of a player's hero; (0.83) a man or a woman
        // of their class in the keep's colours, animated like the party (the hand-built one only until it loads)
        const model = buildHero(a.cls);
        upgradeHero(model, a.cls, `keep_${a.cls}_${a.gender}`);
        if (a.rar >= 3) {
          // (0.82) Epic and rarer: a ring of their rarity's colour at their feet
          const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: RARITIES[a.rar].color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
          ring.position.y = 0.05;
          ring.scale.setScalar(a.rar >= 6 ? 1.1 : 0.85);
          model.group.add(ring);
        }
        this.scene.add(model.group);
        v = { model, cls: a.cls, look, walk: 0 };
        this.allyViews.set(a.pid, v);
      }
      if (!v) {
        const model = buildHero(a.cls);
        upgradeHero(model, a.cls, look);
        this.scene.add(model.group);
        v = { model, cls: a.cls, look, walk: 0 };
        this.allyViews.set(a.pid, v);
      }
      if (!v.model.keep && (a.glow || null) !== (v.model.glowId ?? null)) this.applyGlow(v.model, a.glow);
      seen.add(a.pid);
      const g = v.model.group;
      g.visible = true;
      g.rotation.order = 'YXZ';
      g.rotation.y = Math.PI / 2 - a.facing;
      const x = lerp(a.px ?? a.x, a.x, alpha);
      const z = lerp(a.pz ?? a.z, a.z, alpha);
      const an = this.allyAnim(a.pid);
      an.cls = a.cls;
      const attackStart = an.swing === 0;
      if (an.swing < 1) an.swing = Math.min(1, an.swing + dt / an.swingDur);
      if (an.spin > 0) an.spin = Math.max(0, an.spin - dt / 0.32);
      if (a.troop) {
        // (0.83) a Barrier: a pale bubble while it holds
        if (a.shield && !a.dead && !v.bubble) {
          v.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12), new THREE.MeshBasicMaterial({ color: 0x8ac8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
          v.bubble.position.y = 1.0;
          g.add(v.bubble);
        }
        if (v.bubble) v.bubble.visible = !!a.shield && !a.dead;
      }
      if (v.model.keep) {
        g.position.set(x, 0, z);
        v.model.anim(dt, { moving: a.moving, dead: a.dead, swing: an.swing });
      } else if (v.model.rig) {
        const sera = v.look === 'statue'; // (0.93) a friend in their Seraph hovers too
        const hov = sera ? this.seraphHover(v.model, !!a.moving && !a.dash && !a.leap, dt) : 0;
        g.rotation.order = 'YXZ';
        g.rotation.x = sera ? v.model.seraLean || 0 : 0;
        g.position.set(x, hov + (a.leap ? 0 : 0), z);
        // their attacks, skills, rolls and leaps, like this player's own (0.41.1)
        let move = an.move;
        let moveDur = 0;
        if (a.dash && !v.prevDash && (!move || move === 'dash')) [move, moveDur] = ['dash', a.dash];
        if (a.leap && !v.prevLeap && (!move || move === 'leap')) [move, moveDur] = ['leap', a.leap];
        v.prevDash = !!a.dash;
        v.prevLeap = !!a.leap;
        an.move = null;
        const spinning = !!a.spin || an.spin > 0;
        if (spinning) v.spinAngle = (v.spinAngle || 0) + dt * Math.PI * 2 * 2.4;
        else v.spinAngle = 0;
        v.model.rig.group.rotation.y = (v.model.rig.baseTurn || 0) + v.spinAngle;
        v.model.rig.update(dt, { dead: a.dead, moving: a.moving && !a.dash && !a.leap && !sera, walk: !!a.walk, speed: a.walk ? 1.8 : undefined, attackStart: attackStart && !a.dead && !a.spin, attackDur: an.swingDur, spinning, move: a.dead ? null : move, moveDur, period: a.as > 0 ? 1 / a.as : 0 });
      } else if (a.dead) {
        g.rotation.x = -Math.PI / 2 + 0.15;
        g.position.set(x, 0.3, z);
      } else {
        g.rotation.x = 0;
        if (a.moving) v.walk += dt * 11;
        g.position.set(x, a.moving ? Math.abs(Math.sin(v.walk)) * 0.12 : 0, z);
      }
    }
    for (const [pid, v] of this.allyViews) {
      if (seen.has(pid)) continue;
      this.disposeGroup(v.model.group);
      this.allyViews.delete(pid);
      if (this.allyAnims) this.allyAnims.delete(pid);
    }
  }

  /**
   * (0.85) The channel: a pillar of light where the god will land, growing as the aura gathers, a ring that
   * tightens toward it, and the god rising in a swirl of light.
   */
  syncIncarnate(world, dt, heroPos) {
    const t = world.tide;
    const on = !!(t && t.chan != null && t.chanAt);
    if (!this.incFx) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      ring.position.y = 0.08;
      const halo = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      this.incFx = { pillar, ring, halo, puff: 0, lift: 0 };
      for (const m of [pillar, ring, halo]) {
        m.visible = false;
        this.scene.add(m);
      }
    }
    const F = this.incFx;
    const aura = on ? Math.min(1, t.chan / 5) : 0;
    F.lift = lerp(F.lift, on ? 0.6 + 1.6 * aura : 0, 1 - Math.exp(-4 * dt));
    for (const m of [F.pillar, F.ring, F.halo]) m.visible = on || F.lift > 0.05;
    if (on) {
      const { x, z } = t.chanAt;
      F.pillar.position.set(x, 6, z);
      F.pillar.scale.set(0.5 + 0.9 * aura, 12, 0.5 + 0.9 * aura);
      F.pillar.material.opacity = 0.12 + 0.35 * aura + Math.sin(this.time * 9) * 0.04;
      F.ring.position.set(x, 0.08, z);
      F.ring.scale.setScalar(7 * (1.6 - 0.6 * aura));
      F.ring.material.opacity = 0.35 + 0.5 * aura;
      F.ring.rotation.y += dt * (1 + 3 * aura);
      // the god rises where they stand, in a swirl of light
      const hp = this.hero && this.hero.group ? this.hero.group.position : heroPos;
      F.halo.position.set(hp.x, 0.1 + F.lift * 0.5, hp.z);
      F.halo.scale.setScalar(1.2 + aura * 1.4 + Math.sin(this.time * 6) * 0.1);
      F.halo.material.opacity = 0.4 + 0.5 * aura;
      F.puff -= dt;
      if (F.puff <= 0) {
        F.puff = 0.12 - 0.07 * aura;
        const a = this.time * 7;
        this.burst(hp.x + Math.cos(a) * 0.9, 0.4 + F.lift, hp.z + Math.sin(a) * 0.9, { count: 2 + Math.round(4 * aura), color: aura >= 1 ? 0xffffff : 0xffe08a, speed: 1.2, up: 3 + 3 * aura, life: 0.7 });
        this.burst(x + (Math.random() - 0.5) * 3, 0.2, z + (Math.random() - 0.5) * 3, { count: 1 + Math.round(3 * aura), color: 0xfff0b0, speed: 0.5, up: 6, life: 0.9 });
      }
    } else {
      F.pillar.material.opacity *= Math.exp(-6 * dt);
      F.ring.material.opacity *= Math.exp(-6 * dt);
      F.halo.material.opacity *= Math.exp(-6 * dt);
    }
    if (this.hero && this.hero.group && F.lift > 0.01) this.hero.group.position.y += F.lift;
  }

  /** (0.91) Benches round the keep's plaza, for the old folk to sit and talk (only drawn). */
  buildBenches(world) {
    const spots = benchSpots(world);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 });
    for (const b of spots) {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.45), wood);
      seat.position.y = 0.46;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.08), wood);
      back.position.set(0, 0.78, -0.22);
      g.add(seat, back);
      for (const sx of [-0.65, 0.65]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.4), wood);
        leg.position.set(sx, 0.23, 0);
        g.add(leg);
      }
      for (const m of g.children) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      g.position.set(b.x, 0, b.z);
      g.rotation.y = Math.PI / 2 - b.face;
      this.scene.add(g);
      this.benchViews.push(g);
    }
    return spots;
  }

  /** (0.84) A Tide foe's swing, played from the moment it hits (its wind-up runs this long). */
  tideSwing(id, kind, dur) {
    const v = this.views.get(id);
    if (!v) return;
    [v.tSwing, v.tDur, v.tKind] = [dur, dur, kind];
  }

  /** (0.81) The Wishkeep's events: its heroes' blows and skills, the Tide's blows, wards and wrecks, the god's miracles. */
  /**
   * (0.92) The Seraph on its plinth: there once raised, gone while someone is in it, grey and cracked while it
   * is only stone. (A visitor sees their friend's, from the snapshot.)
   */
  syncSeraph(world, dt) {
    const v = this.seraphView;
    if (!v) return;
    const inKeep = world.map && world.map.id === 'wishkeep';
    const st = !inKeep ? null : world.keepVisit ? world.keepStatueShown : world.player && world.player.keep && world.player.keep.statue;
    const taken = !!world.player.possess || (world.allies ? world.allies().some((a) => a.seraph) : false);
    if (st && !v.model && !v.loading) {
      v.loading = true;
      loadRigged('hero_statue').then((tpl) => {
        if (!tpl || v.dead) return;
        const rig = instantiate(tpl);
        rig.group.rotation.y = (rig.group.rotation.y || 0) + v.face;
        rig.group.position.y = 0.55;
        v.group.add(rig.group);
        v.model = rig;
        v.mats = [];
        rig.group.traverse((o) => { if (o.isMesh) v.mats.push(o.material); });
      });
    }
    if (v.model) {
      v.model.group.visible = !!st && !taken;
      const rest = st && st.rest > 0;
      if (rest !== v.rest) {
        v.rest = rest;
        for (const m of v.mats) if (m.color) m.color.setScalar(rest ? 0.45 : 1);
      }
    }
    v.glow.visible = !!st && !taken && !(st.rest > 0);
    if (v.glow.visible) v.glow.material.opacity = 0.35 + 0.15 * Math.sin(this.time * 2.2);
  }
  keepFx(ev) {
    const streak = (x, z, tx, tz, color, w = 0.12, dur = 0.18) => {
      const len = Math.hypot(tx - x, tz - z) || 0.1;
      this.flash(this.rectGeo(), { x, z, y: 1.2, dir: Math.atan2(tz - z, tx - x), color, from: len, to: len, sz: w / len, dur, opacity: 0.85 });
    };
    if (ev.type === 'troopHit') {
      const an = this.allyAnim('troop:' + ev.id);
      an.cls = ev.cls;
      an.swing = 0;
      an.swingDur = 0.22;
      if (ev.ranged) streak(ev.x, ev.z, ev.tx, ev.tz, ev.cls === 'mage' ? 0xb48cff : 0xfff0c0);
      else this.flash(this.sectorGeo(2.2, 0.55), { x: ev.x, z: ev.z, y: 1.0, dir: ev.dir, color: 0xffd8dc, from: 2.0, to: 2.6, dur: 0.18, opacity: 0.45 });
    } else if (ev.type === 'troopSkill') {
      // (0.83) sixteen skills, each with its own mark, and a move of the hero's own where their class has one
      const an = this.allyAnim('troop:' + ev.id);
      an.swing = 0;
      an.swingDur = 0.3;
      const MOVE = { cleave: 'cone', bash: 'strike', pierce: 'line', volley: 'barrage', lunge: 'dash', fireball: 'bolt', frostnova: 'orb', chain: 'bolt', meteor: 'meteor' };
      if (ev.skill === 'whirlwind') an.spin = 1;
      else if (MOVE[ev.skill]) an.move = MOVE[ev.skill];
      const C = { cleave: 0xffd8a0, bash: 0xffe6b0, pierce: 0xfff0c0, volley: 0xfff0c0, warcry: 0xff9a3a, taunt: 0xff5a4a, lunge: 0xff9a7a, whirlwind: 0xffd8a0, fireball: 0xff6a2a, frostnova: 0x9ae0ff, mend: 0x7fe0a0, chain: 0xb8a8ff, barrier: 0x8ac8ff, meteor: 0xff7a2a, ward: 0x8ac8ff, radiance: 0xfff2a0 };
      const color = C[ev.skill] || 0xffffff;
      const ring = (x, z, from, to, dur = 0.4, opacity = 0.8) => this.flash(this.ringGeo(), { x, z, color, from, to, dur, opacity });
      const disc = (x, z, to, dur = 0.3, opacity = 0.5) => this.flash(this.discGeo(), { x, z, color, from: 0.5, to, dur, opacity });
      const sk = ev.skill;
      if (sk === 'cleave' || sk === 'whirlwind') {
        disc(ev.x, ev.z, ev.r || 2.8);
        if (sk === 'whirlwind') ring(ev.x, ev.z, 1, ev.r || 3.5, 0.5);
      } else if (sk === 'warcry' || sk === 'taunt' || sk === 'radiance') {
        ring(ev.x, ev.z, 0.6, ev.r || 7, 0.6, 0.7);
        disc(ev.x, ev.z, 2, 0.4, 0.35);
        if (sk === 'radiance') this.burst(ev.x, 1.5, ev.z, { count: 24, color, speed: 4, up: 5, life: 0.8 });
        if (sk === 'taunt') this.shake = Math.max(this.shake, 0.15);
      } else if (sk === 'chain' && ev.pts) {
        for (let i = 1; i < ev.pts.length; i++) {
          streak(ev.pts[i - 1][0], ev.pts[i - 1][1], ev.pts[i][0], ev.pts[i][1], color, 0.18, 0.28);
          this.burst(ev.pts[i][0], 1, ev.pts[i][1], { count: 6, color, speed: 3, up: 3, life: 0.3 });
        }
      } else if (sk === 'meteor') {
        // the warning: a ring that tightens until it lands
        this.flash(this.ringGeo(), { x: ev.tx, z: ev.tz, color: 0xff5a2a, from: ev.r * 1.6, to: ev.r, dur: ev.delay || 0.8, opacity: 0.9 });
      } else if (sk === 'pierce') {
        streak(ev.x, ev.z, ev.tx, ev.tz, color, 0.3, 0.3);
      } else if (sk === 'bash') {
        ring(ev.tx, ev.tz, 0.3, 1.4, 0.3);
        this.burst(ev.tx, 1.4, ev.tz, { count: 10, color, speed: 4, up: 3, life: 0.4 });
      } else {
        streak(ev.x, ev.z, ev.tx, ev.tz, color, 0.25, 0.3);
        ring(ev.tx, ev.tz, 0.4, ev.r || 1.6);
        this.burst(ev.tx, 1, ev.tz, { count: 14, color, speed: 5, up: 4, life: 0.5 });
      }
    } else if (ev.type === 'troopHeal') {
      // (0.83) a healer's strike: a thread of green light
      const an = this.allyAnim('troop:' + ev.id);
      an.swing = 0;
      an.swingDur = 0.25;
      streak(ev.x, ev.z, ev.tx, ev.tz, 0x7fe0a0, 0.1, 0.25);
      this.burst(ev.tx, 1.2, ev.tz, { count: 5, color: 0x9affb8, speed: 1.5, up: 3, life: 0.5 });
    } else if (ev.type === 'troopMeteor') {
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xff7a2a, from: 0.5, to: ev.r, dur: 0.45, opacity: 0.7 });
      this.burst(ev.x, 1.5, ev.z, { count: 30, color: 0xff8a3a, speed: 7, up: 7, life: 0.8 });
      this.shake = Math.max(this.shake, 0.3);
    } else if (ev.type === 'troopRaised') {
      this.burst(ev.x, 1, ev.z, { count: 20, color: 0xfff2a0, speed: 2, up: 6, life: 0.9 });
    } else if (ev.type === 'troopDodge') {
      this.burst(ev.x, 1.2, ev.z, { count: 3, color: 0xdddddd, speed: 3, up: 1, life: 0.25 });
    } else if (ev.type === 'tideSlamWarn' || ev.type === 'starWarn') {
      if (ev.id != null) this.tideSwing(ev.id, 'chop', ev.t);
      // (0.84) a ring that tightens until it lands
      const c = ev.type === 'starWarn' ? 0xffe08a : 0x8a6aff;
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: c, from: ev.r * 1.5, to: ev.r, dur: ev.t || 0.8, opacity: 0.9 });
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: c, from: ev.r, to: ev.r, dur: ev.t || 0.8, opacity: 0.18 });
    } else if (ev.type === 'tideSlam' || ev.type === 'starFall') {
      const c = ev.type === 'starFall' ? 0xffd070 : 0x8a6aff;
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: c, from: 0.5, to: ev.r, dur: 0.4, opacity: 0.6 });
      this.burst(ev.x, 1.2, ev.z, { count: 26, color: c, speed: 7, up: 6, life: 0.7 });
      this.shake = Math.max(this.shake, ev.type === 'tideSlam' ? 0.45 : 0.2);
    } else if (ev.type === 'possessFx') {
      // (0.92) into the Seraph or out: a column of pale gold
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xffe9b0, from: 0.4, to: 3.2, dur: 0.5, opacity: 0.6 });
      this.burst(ev.x, 1.4, ev.z, { count: 40, color: 0xfff4d8, speed: 4, up: 7, life: 0.9 });
    } else if (ev.type === 'rotSplit') {
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x9ac040, from: 0.3, to: 2.5, dur: 0.3, opacity: 0.55 });
      this.burst(ev.x, 0.8, ev.z, { count: 16, color: 0xb0d060, speed: 6, up: 4, life: 0.5 });
    } else if (ev.type === 'cinderBurst') {
      this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xff7a2a, from: 0.3, to: ev.r, dur: 0.3, opacity: 0.55 });
      this.burst(ev.x, 0.8, ev.z, { count: 16, color: 0xffa040, speed: 6, up: 4, life: 0.5 });
    } else if (ev.type === 'mournerRaise') {
      this.tideSwing(ev.id, 'cast', 0.5);
      streak(ev.x, ev.z, ev.tx, ev.tz, 0xb08aff, 0.12, 0.5);
      this.burst(ev.tx, 0.5, ev.tz, { count: 18, color: 0xb08aff, speed: 2, up: 5, life: 0.9 });
    } else if (ev.type === 'tideCall') {
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0x8a6aff, from: 0.5, to: 3.5, dur: 0.6, opacity: 0.8 });
    } else if (ev.type === 'tideBossRage' || ev.type === 'tideBossDown') {
      this.burst(ev.x, 2.5, ev.z, { count: 40, color: ev.type === 'tideBossDown' ? 0xfff2a0 : 0xff3d6a, speed: 6, up: 8, life: 1.1 });
      this.shake = Math.max(this.shake, 0.5);
    } else if (ev.type === 'thiefStole' || ev.type === 'thiefCaught' || ev.type === 'thiefEscaped') {
      this.burst(ev.x, 1.2, ev.z, { count: ev.type === 'thiefCaught' ? 22 : 10, color: ev.type === 'thiefEscaped' ? 0x5a4a6a : 0xffc060, speed: 3, up: 4, life: 0.7 });
    } else if (ev.type === 'foeHit') {
      this.tideSwing(ev.id, TIDE_KIND[(this.views.get(ev.id) || {}).type] || (ev.ranged ? 'fire' : 'slash'), 0.2);
      if (ev.ranged) streak(ev.x, ev.z, ev.tx, ev.tz, 0x9a6aff, 0.1, 0.2);
      this.burst(ev.tx, 1, ev.tz, { count: 3, color: 0x9a6aff, speed: 2, up: 2, life: 0.3 });
    } else if (ev.type === 'buildHit') {
      this.burst(ev.fx, 1.2, ev.fz, { count: 4, color: 0xd8b080, speed: 3, up: 3, life: 0.4 });
    } else if (ev.type === 'buildWrecked') {
      this.burst(ev.x, 2, ev.z, { count: 40, color: 0x5a4a3a, speed: 6, up: 7, life: 1.2 });
      this.burst(ev.x, 1.5, ev.z, { count: 20, color: 0xff7a3a, speed: 5, up: 5, life: 0.8 });
      this.shake = Math.max(this.shake, 0.5);
    } else if (ev.type === 'troopFall') {
      this.burst(ev.x, 1, ev.z, { count: 12, color: 0xff3d4f, speed: 3, up: 3, life: 0.6 });
    } else if (ev.type === 'incarnate') {
      // (0.81.1) the god steps down: a pillar of light, then a ring of it at their feet while it lasts
      for (let i = 0; i < 5; i++) this.later(i * 0.06, () => this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.1 + i * 0.6, color: 0xffd27a, from: 2.6 - i * 0.3, to: 0.6, dur: 0.5, opacity: 0.9 }));
      this.burst(ev.x, 2, ev.z, { count: 60, color: 0xfff2c8, speed: 6, up: 10, life: 0.9 });
      this.shake = Math.max(this.shake, 0.4);
      if (ev.r) {
        // (0.85) the landing's blast, as wide as it reaches, brighter the more aura was gathered
        const a = ev.aura == null ? 1 : ev.aura;
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xfff2c8, from: 0.5, to: ev.r, dur: 0.45, opacity: 0.45 + 0.4 * a });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xffd27a, from: 1, to: ev.r * 1.1, dur: 0.6, opacity: 0.95 });
        this.burst(ev.x, 0.5, ev.z, { count: Math.round(30 + 60 * a), color: 0xffe9a8, speed: 9, up: 4, life: 0.8 });
        this.shake = Math.max(this.shake, 0.4 + 0.5 * a);
      }
    } else if (ev.type === 'incarnateChannel') {
      this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xffe08a, from: 9, to: 6, dur: 0.6, opacity: 0.8 });
    } else if (ev.type === 'incarnateEnd') {
      this.burst(ev.x, 1.5, ev.z, { count: 30, color: ev.fell ? 0xff3d4f : 0xffd27a, speed: 4, up: 6, life: 0.8 });
    } else if (ev.type === 'miracle') {
      // (0.87) Judgement, Benediction, Hallowed Ground
      if (ev.id === 'judge') {
        for (let i = 0; i < 3; i++) streak(ev.x + (i - 1) * 0.4, ev.z - 0.01, ev.x, ev.z, 0xffffff, 0.3, 0.3);
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xffe08a, from: 0.4, to: ev.r, dur: 0.45, opacity: 0.8 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xffc040, from: ev.r * 0.6, to: ev.r * 1.15, dur: 0.5, opacity: 0.9 });
        this.burst(ev.x, 1.5, ev.z, { count: 40, color: 0xfff2c8, speed: 8, up: 8, life: 0.7 });
        this.shake = Math.max(this.shake, 0.35);
      } else if (ev.id === 'bless') {
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x7fe0a0, from: 0.5, to: ev.r, dur: 0.6, opacity: 0.45 });
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xb8ffd0, from: ev.r * 0.4, to: ev.r, dur: 0.7, opacity: 0.8 });
        this.burst(ev.x, 1, ev.z, { count: 40, color: 0xb8ffd0, speed: 4, up: 6, life: 1 });
      } else {
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xfff2c8, from: 0.5, to: ev.r, dur: 0.5, opacity: 0.9 });
        this.burst(ev.x, 0.3, ev.z, { count: 30, color: 0xfff2c8, speed: 5, up: 3, life: 0.7 });
      }
    }
  }

  /** (0.87) While they last: Hallowed Ground on the ground, and a mark of light over the Judged. */
  syncMiracles(world, dt) {
    const zones = (world.tide && world.tide.state === 'on' && world.tide.zones) || [];
    this.zoneViews = this.zoneViews || [];
    while (this.zoneViews.length < zones.length) {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(this.discGeo(), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.16, depthWrite: false }));
      const ring = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      const inner = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      disc.position.y = 0.04;
      ring.position.y = inner.position.y = 0.06;
      g.add(disc, ring, inner);
      this.scene.add(g);
      this.zoneViews.push({ g, disc, ring, inner });
    }
    this.zoneViews.forEach((v, i) => {
      const zo = zones[i];
      v.g.visible = !!zo;
      if (!zo) return;
      const fade = Math.min(1, zo.t / 1.2);
      v.g.position.set(zo.x, 0, zo.z);
      v.disc.scale.setScalar(zo.r);
      v.ring.scale.setScalar(zo.r);
      v.inner.scale.setScalar(zo.r * (0.55 + 0.1 * Math.sin(this.time * 2)));
      v.ring.rotation.y += dt * 0.6;
      v.disc.material.opacity = 0.16 * fade;
      v.ring.material.opacity = 0.8 * fade;
      v.inner.material.opacity = 0.4 * fade;
      if (Math.random() < dt * 8) this.burst(zo.x + (Math.random() - 0.5) * zo.r * 1.6, 0.1, zo.z + (Math.random() - 0.5) * zo.r * 1.6, { count: 1, color: 0xfff2c8, speed: 0.3, up: 2.5, life: 1, gravity: -1 });
    });
    for (const e of world.enemies) {
      const v = this.views.get(e.id);
      if (!v) continue;
      const on = e.judgedT > 0 && !e.dead;
      if (on && !v.judge) {
        v.judge = new THREE.Mesh(this.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
        v.judge.position.y = 0.07;
        v.model.group.add(v.judge);
      }
      if (v.judge) {
        v.judge.visible = on;
        if (on) {
          v.judge.scale.setScalar((e.def.radius || 0.8) * 1.5 + Math.sin(this.time * 6) * 0.08);
          v.judge.rotation.y -= dt * 2;
        }
      }
    }
  }

  /** (0.81) Per frame in the Wishkeep: wards shining, wrecks smoking, and the people walking about. */
  updateKeep(world, dt) {
    const builds = world.keepBuilds || [];
    const kp = world.player && world.player.keep;
    this.syncSeraph(world, dt); // (0.92)
    if (kp) {
      // (0.82.1) the works show their level; the halls their tier
      for (const v of this.worksViews || []) {
        const lvl = (kp.works && kp.works[v.id]) || 0;
        v.lit.forEach((m, i) => (m.visible = lvl > 0 && i < 1 + lvl));
      }
      for (const v of this.tierViews || []) {
        const t = (kp.btier && kp.btier[v.id]) || 0;
        if (t === v.tier) continue;
        v.tier = t;
        const c = t ? RARITIES[t].color : '#ff3d4f';
        v.cap.material.color.set(c);
        v.ring.material.color.set(c);
        v.ring.material.opacity = t ? 0.35 + 0.08 * t : 0;
      }
    }
    // (0.81.1) the incarnate god's light
    const inc = world.tide && world.tide.state === 'on' && world.tide.inc > 0 && world.player;
    if (inc && !this.incAura) {
      this.incAura = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      this.incAura.rotation.x = -Math.PI / 2;
      this.scene.add(this.incAura);
    } else if (!inc && this.incAura) {
      this.scene.remove(this.incAura);
      this.incAura.geometry.dispose();
      this.incAura.material.dispose();
      this.incAura = null;
    }
    if (this.incAura) {
      const pv = this.hero && this.hero.group ? this.hero.group.position : world.player;
      this.incAura.position.set(pv.x, 0.06, pv.z);
      this.incAura.material.opacity = 0.45 + 0.25 * Math.sin(performance.now() / 160);
    }
    this.wardViews = this.wardViews || new Map();
    for (const b of builds) {
      let v = this.wardViews.get(b.id);
      if (b.wardT > 0 && !v) {
        v = new THREE.Mesh(new THREE.SphereGeometry(b.r + 1.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ac8ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        v.position.set(b.x, 0, b.z);
        this.scene.add(v);
        this.wardViews.set(b.id, v);
      } else if (!(b.wardT > 0) && v) {
        this.scene.remove(v);
        v.geometry.dispose();
        v.material.dispose();
        this.wardViews.delete(b.id);
      }
      if (b.hp <= 0) {
        b.smokeT = (b.smokeT || 0) - dt;
        if (b.smokeT <= 0) {
          b.smokeT = 0.35;
          this.burst(b.x + (Math.random() - 0.5) * b.r, 2.5, b.z + (Math.random() - 0.5) * b.r, { count: 3, color: 0x4a4440, speed: 0.6, up: 2.5, life: 1.6, gravity: -1 });
        }
      }
    }
    // (0.85) in the night the keep's people shelter indoors (and keep out of the god's view, over the shoulder)
    const night = !!(world.tide && world.tide.state === 'on');
    for (const n of this.mapNpcs || []) n.visible = !night;
    for (const w of this.walkers || []) {
      w.g.visible = !night;
      if (night) continue;
      // (0.91) the keep's people at their day's work, walking paths round the buildings (only drawn, never
      // part of the game): see village.js
      if (!this.villageCtx) this.villageCtx = { benches: this.buildBenches(world), walkers: this.walkers };
      w.speed = w.speed || 1;
      const s = stepVillager(w, world, this.villageCtx, dt);
      if (w.rig) w.rig.update(dt, s);
      else w.m.anim(dt, { moving: s.moving, swing: 1 });
    }
  }

  reset() {
    for (const v of this.views.values()) this.disposeGroup(v.model.group);
    this.views.clear();
    for (const c of this.corpses) this.disposeGroup(c.model.group);
    this.corpses = [];
    for (const m of this.projViews.values()) this.scene.remove(m);
    this.projViews.clear();
    if (this.shadowViews) {
      for (const v of this.shadowViews.values()) this.disposeGroup(v.model.group);
      this.shadowViews.clear();
    }
    if (this.wallViews) {
      for (const v of this.wallViews.values()) this.disposeGroup(v.group);
      this.wallViews.clear();
    }
    for (const v of this.lootViews.values()) this.disposeGroup(v.group);
    this.lootViews.clear();
    if (this.chestViews) {
      for (const v of this.chestViews.values()) this.disposeGroup(v.group);
      this.chestViews.clear();
    }
    for (const v of this.teleViews.values()) this.scene.remove(v.group);
    this.teleViews.clear();
    this.camTarget.set(0, 0, 0);
    this.hoverId = null;
  }
}
