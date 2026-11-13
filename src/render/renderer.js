// Draws the World with Three.js. It only reads simulation state and reacts to
// events; it never changes the game. Everything visual (camera, models,
// attack telegraphs, particles) lives here.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { RARITIES } from '../sim/items.js';
import { buildHero, buildEnemy, buildNpc, buildSign } from './models.js';
import { NPCS } from '../sim/story.js';

const R = CONFIG.ARENA_RADIUS;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const COLORS = {
  parry: 0x9fe8ff,
  parryable: 0xffe2a0, // attacks you can parry are drawn in pale gold
  cue: 0xffffff, // ... and turn white at the moment to press parry
  danger: 0xff3b4a, // attacks you must avoid are red
  friendly: 0x7fd8ff,
  ember: 0xff8a3a,
  immortal: 0x7ff5e1, // matches the Immortal rarity colour
};

// Colours for each kind of exploration map (see sim/maps.js).
const MAP_THEMES = {
  town: { ground: '#33483a', hue: 130, sky: 0x0e1620, tree: 0x2a5a3e, trunk: 0x3b2c22, rock: 0x5a5d68, edge: 0x1c2420 },
  forest: { ground: '#2c4a34', hue: 125, sky: 0x0c1814, tree: 0x1f5133, trunk: 0x3b2c22, rock: 0x4a4d5a, edge: 0x16201a },
  swamp: { ground: '#223c3e', hue: 178, sky: 0x08141a, tree: 0x2a5560, trunk: 0x24262c, rock: 0x3a4a4c, edge: 0x101c1e },
  ash: { ground: '#4a3c36', hue: 16, sky: 0x1a100e, tree: 0x6a4230, trunk: 0x2a1c18, rock: 0x6a5850, edge: 0x1c1412 },
  keep: { ground: '#32323e', hue: 238, sky: 0x0a0a12, tree: 0x34344a, trunk: 0x1c1c26, rock: 0x585b6a, edge: 0x12121a },
  // crown: the shape on top of each "tree". glow: rocks or crowns that give off light.
  frost: { ground: '#6f8799', hue: 205, light: 42, sky: 0x1a2a3a, tree: 0xdcecf5, trunk: 0x4a4038, rock: 0x9ad4f0, edge: 0x3a5060, rockGlow: 0x2a6a9a },
  desert: { ground: '#b08a52', hue: 36, light: 48, sky: 0x2a1c14, tree: 0x5a8a4a, trunk: 0x4a7a40, rock: 0xb07a4a, edge: 0x5a4028, crown: 'cactus' },
  fungal: { ground: '#2a2238', hue: 280, sky: 0x0c0814, tree: 0xb44a9a, trunk: 0xd8cfc0, rock: 0x4a3a5a, edge: 0x140c1c, crown: 'cap', crownGlow: 0x5a1a4a },
  storm: { ground: '#3a4250', hue: 215, sky: 0x10141e, tree: 0x4a5a6a, trunk: 0x2a2e38, rock: 0x6a7484, edge: 0x1a1e28, crown: 'spike' },
  volcano: { ground: '#241a1a', hue: 8, sky: 0x180806, tree: 0x1a1414, trunk: 0x100c0c, rock: 0x2a1a18, edge: 0x100808, crown: 'spike', rockGlow: 0xc23a0c },
  astral: { ground: '#1c1a3a', hue: 250, sky: 0x06061a, tree: 0x8fe8ff, trunk: 0x2a2a5a, rock: 0x3a3a7a, edge: 0x0c0c24, crown: 'crystal', crownGlow: 0x2a8aa8, rockGlow: 0x2a2a8a },
};
const CROWNS = {
  cone: () => new THREE.ConeGeometry(1.5, 3.6, 6).translate(0, 3.2, 0),
  cap: () => new THREE.SphereGeometry(1.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 1.6, 0), // mushroom
  spike: () => new THREE.ConeGeometry(0.7, 4.4, 5).translate(0, 2.6, 0), // dead spire
  crystal: () => new THREE.OctahedronGeometry(1.25, 0).scale(0.75, 1.9, 0.75).translate(0, 3.3, 0),
  cactus: () => new THREE.CylinderGeometry(0.42, 0.5, 2.6, 7).translate(0, 2.4, 0),
};

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
    this.scene.add(new THREE.HemisphereLight(0x9db4ff, 0x241a20, 1.15));
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
    if (this.exploreGroup) this.disposeGroup(this.exploreGroup);
    const g = (this.exploreGroup = new THREE.Group());
    this.scene.add(g);
    this.mapId = map.id;
    const T = (this.mapTheme = MAP_THEMES[map.theme] || MAP_THEMES.forest);
    const R = map.radius;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

    // Ground, tinted for the map's theme. The walkable part ends at the dark rim.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c2 = cv.getContext('2d');
    c2.fillStyle = T.ground;
    c2.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) {
      c2.fillStyle = `hsla(${T.hue + rnd() * 30}, 24%, ${(T.light || 15) + rnd() * 16}%, 0.5)`;
      c2.fillRect(rnd() * 256, rnd() * 256, 3 + rnd() * 5, 3 + rnd() * 5);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((R + 45) / 3.2, (R + 45) / 3.2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 45, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.receiveShadow = true;
    g.add(ground);
    const beyond = new THREE.Mesh(new THREE.RingGeometry(R + 0.6, R + 45, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.55, depthWrite: false }));
    beyond.position.y = 0.02;
    g.add(beyond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.8, 0.9, 5, 80).rotateX(Math.PI / 2), flat(T.edge));
    g.add(rim);

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
    const wall = flat(0xb9a98c);
    const roof = flat(0x8e3b34);
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    const fire = new THREE.MeshBasicMaterial({ color: COLORS.ember });
    const dark = flat(0x2b2d3a);
    const trees = map.obstacles.filter((o) => o.kind === 'tree');
    const rocks = map.obstacles.filter((o) => o.kind === 'rock');
    const d = new THREE.Object3D();
    if (trees.length) {
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.5, 1.7, 6).translate(0, 0.85, 0), flat(T.trunk), trees.length);
      const crowns = new THREE.InstancedMesh(CROWNS[T.crown || 'cone'](), flat(T.tree, T.crownGlow ? { emissive: T.crownGlow } : {}), trees.length);
      trees.forEach((o, n) => {
        d.position.set(o.x, 0, o.z);
        d.rotation.set(0, o.turn, 0);
        d.scale.setScalar(o.scale);
        d.updateMatrix();
        trunks.setMatrixAt(n, d.matrix);
        crowns.setMatrixAt(n, d.matrix);
      });
      trunks.castShadow = crowns.castShadow = true;
      g.add(trunks, crowns);
    }
    if (rocks.length) {
      const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), flat(T.rock, T.rockGlow ? { emissive: T.rockGlow } : {}), rocks.length);
      rocks.forEach((o, n) => {
        d.position.set(o.x, o.r * 0.35, o.z);
        d.rotation.set(o.turn, o.turn * 2, 0);
        d.scale.set(o.r * 1.05, o.r * 0.8, o.r * 1.05);
        d.updateMatrix();
        mesh.setMatrixAt(n, d.matrix);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    }
    for (const o of map.obstacles) {
      if (o.kind === 'house') {
        const house = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, o.height, o.hd * 2), wall);
        base.position.y = o.height / 2;
        base.castShadow = true;
        const top = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(o.hw, o.hd) + 0.5, 2.6, 4).rotateY(Math.PI / 4), roof);
        top.scale.set(1, 1, o.hd / o.hw + 0.12);
        top.position.y = o.height + 1.3;
        top.castShadow = true;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), glow);
        win.position.set(0, o.height * 0.55, -o.hd - 0.02);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.1), dark);
        door.position.set(1.3, 0.85, -o.hd - 0.02);
        house.add(base, top, win, door);
        house.position.set(o.x, 0, o.z);
        house.rotation.y = -o.rot; // the simulation turns the same box by `rot`
        g.add(house);
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
        npc.position.set(o.x, 0, o.z);
        npc.rotation.y = Math.atan2(-o.x, -o.z); // face the middle of the plaza
        g.add(npc);
      } else if (o.kind === 'sign') {
        const sign = buildSign();
        sign.position.set(o.x, 0, o.z);
        sign.rotation.y = Math.atan2(-o.x, -o.z);
        g.add(sign);
      } else if (o.kind === 'well') {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 0.9, 10), flat(0x6a6d78));
        ring.position.set(o.x, 0.45, o.z);
        ring.castShadow = true;
        const water = new THREE.Mesh(new THREE.CircleGeometry(o.r * 0.78, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f8fb0 }));
        water.position.set(o.x, 0.92, o.z);
        g.add(ring, water);
      }
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
    }
    // The Waygate in town: a ring of standing stones around a glowing pad.
    this.wayView = null;
    if (map.waygate) {
      const wg = map.waygate;
      const gate = new THREE.Group();
      const gold = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false });
      const pad = new THREE.Mesh(this.ringGeo(), gold);
      pad.scale.setScalar(wg.r);
      pad.position.y = 0.06;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(wg.r * 0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb84a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      disc.position.y = 0.05;
      gate.add(pad, disc);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
        stone.position.set(Math.cos(a) * wg.r, 1.2, Math.sin(a) * wg.r);
        stone.scale.y = 1.8;
        gate.add(stone);
      }
      gate.position.set(wg.x, 0, wg.z);
      g.add(gate);
      this.wayView = { gate, pad, disc, wg };
    }
    this.setEnvironment('explore');
  }

  /** Switch between the arena ring and the exploration scenery. */
  setEnvironment(mode) {
    const explore = mode === 'explore' && !!this.exploreGroup;
    this.arenaGroup.visible = !explore;
    if (this.exploreGroup) this.exploreGroup.visible = explore;
    const sky = explore ? this.mapTheme.sky : 0x0a0d16;
    this.scene.background.set(sky);
    this.scene.fog.color.set(sky);
    this.scene.fog.near = explore ? 48 : 42;
    this.scene.fog.far = explore ? 105 : 90;
  }

  /** Swap the hero model when a different class is played. */
  setHeroClass(cls) {
    if (cls === this.heroCls) return;
    this.heroCls = cls;
    this.disposeGroup(this.hero.group);
    this.hero = buildHero(cls);
    this.scene.add(this.hero.group);
  }

  buildHero() {
    this.heroCls = 'warrior';
    this.hero = buildHero();
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
    if (world.mode !== 'explore' || !world.obstacles) return null;
    const ray = this.setRay(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    for (const o of world.obstacles) {
      if (o.kind !== 'npc' && o.kind !== 'sign') continue;
      this.tmpV.set(o.x, 0.1, o.z);
      this.tmpV2.set(o.x, 1.8, o.z);
      const d = Math.sqrt(ray.distanceSqToSegment(this.tmpV, this.tmpV2));
      if (d < 0.95 && d < bestD) {
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
      const d = Math.sqrt(ray.distanceSqToSegment(this.tmpV, this.tmpV2));
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

  updateFlashes(dt) {
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
    const p = world.player;
    switch (ev.type) {
      case 'swing':
        this.heroAnim.swing = 0;
        this.heroAnim.swingDur = Math.max(0.12, ev.dur * 1.5);
        this.flash(this.sectorGeo(2.4, 0.55), { x: ev.x, z: ev.z, y: 1.0, dir: ev.dir, color: 0xdff4ff, from: 2.4, to: 3.0, dur: 0.2, opacity: 0.5 });
        break;
      case 'cast': {
        // Warrior abilities send no fx name, so fall back on the slot.
        const fx = ev.fx || { q: 'cone', w: 'nova', e: 'dash', r: 'leap' }[ev.slot];
        if (fx === 'cone') {
          this.heroAnim.swing = 0;
          this.heroAnim.swingDur = 0.2;
          this.flash(this.sectorGeo(ev.angle, 0.3), { x: ev.x, z: ev.z, y: 0.9, dir: ev.dir, color: ev.echo ? 0xffe2a0 : 0xbfeaff, from: ev.range * 0.7, to: ev.range, dur: 0.28, opacity: 0.85 });
          this.shake = Math.max(this.shake, 0.12);
        } else if (fx === 'barrage') {
          this.heroAnim.swing = 0;
          this.heroAnim.swingDur = 0.12;
        } else if (fx === 'nova') {
          this.heroAnim.spin = 1;
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.9, color: 0xbfeaff, from: ev.pull ? ev.radius : 1, to: ev.pull ? 1 : ev.radius, dur: 0.32, opacity: 0.9 });
          this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x7fd8ff, from: ev.radius, to: ev.radius, dur: 0.3, opacity: 0.22 });
          this.shake = Math.max(this.shake, 0.18);
        } else if (fx === 'dash') {
          const len = Math.hypot(ev.ex - ev.x, ev.ez - ev.z);
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 0.5, dir: ev.dir, color: 0x9fe8ff, sx: len, sz: 1.3, dur: 0.35, opacity: 0.7 });
        } else if (fx === 'leap') {
          this.burst(ev.x, 0.3, ev.z, { count: 14, color: 0x9fe8ff, speed: 5, up: 6 });
        } else if (fx === 'line') {
          this.heroAnim.swing = 0;
          this.heroAnim.swingDur = 0.2;
          this.flash(this.rectGeo(), { x: ev.x, z: ev.z, y: 1.0, dir: ev.dir, color: 0xfff0b0, sx: ev.range, sz: ev.width, dur: 0.3, opacity: 0.9 });
        } else if (fx === 'strike') {
          this.heroAnim.swing = 0;
          this.heroAnim.swingDur = 0.14;
          this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 1.0, color: ev.exposed ? 0xffe27a : 0xdff4ff, from: 2.2, to: 0.4, dur: 0.22, opacity: 1 });
          this.burst(ev.x, 1.2, ev.z, { count: ev.exposed ? 22 : 10, color: ev.exposed ? 0xffe27a : 0xdff4ff, speed: 8, up: 4, life: 0.4 });
          if (ev.exposed) this.shake = Math.max(this.shake, 0.3);
        } else if (fx === 'bolt' || fx === 'zone' || fx === 'meteor' || fx === 'orb') {
          this.heroAnim.swing = 0;
          this.heroAnim.swingDur = 0.22;
        }

        break;
      }
      case 'burst':
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0xff9a3a, from: 0.4, to: ev.radius, dur: 0.3, opacity: 0.7 });
        this.burst(ev.x, 1, ev.z, { count: 18, color: 0xffb060, speed: 8, up: 5, life: 0.45 });
        break;
      case 'orbTick':
        for (let n = 0; n < 5; n++) {
          const a = Math.random() * 6.283;
          const r = Math.sqrt(Math.random()) * ev.radius;
          this.burst(ev.x + Math.cos(a) * r, 0.4, ev.z + Math.sin(a) * r, { count: 2, color: 0xbfeaff, speed: 3, up: 3, life: 0.35 });
        }
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.15, color: 0x9fe8ff, from: ev.radius * 0.8, to: ev.radius, dur: 0.25, opacity: 0.35 });
        break;
      case 'shatter':
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, y: 0.9, color: 0xffffff, from: 0.6, to: ev.radius * 1.1, dur: 0.35, opacity: 1 });
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: 0x7fd8ff, from: ev.radius, to: ev.radius, dur: 0.45, opacity: 0.35 });
        this.burst(ev.x, 1, ev.z, { count: 40, color: 0xc8f0ff, speed: 11, up: 6, size: 1.4, life: 0.6 });
        this.shake = Math.max(this.shake, 0.35);
        break;
      case 'bloodied':
        if (ev.on) this.burst(ev.x, 1.2, ev.z, { count: 26, color: 0xff3344, speed: 6, up: 5, life: 0.5 });
        break;
      case 'zoneTick':
        for (let n = 0; n < 7; n++) {
          const a = Math.random() * 6.283;
          const r = Math.sqrt(Math.random()) * ev.radius;
          this.burst(ev.x + Math.cos(a) * r, 0.2, ev.z + Math.sin(a) * r, { count: 3, color: 0xfff0b0, speed: 2, up: 5, life: 0.35 });
        }
        break;
      case 'impact': {
        // Skyfall lands hard; its aftershock and the Retribution shockwave are lighter.
        const big = ev.kind === 'skyfall';
        const tint = ev.kind === 'retribution' ? COLORS.immortal : ev.kind === 'aftershock' ? 0xffe2a0 : 0x7fd8ff;
        this.flash(this.ringGeo(), { x: ev.x, z: ev.z, color: 0xffffff, from: 1, to: ev.radius * 1.15, dur: 0.45, opacity: 1 });
        this.flash(this.discGeo(), { x: ev.x, z: ev.z, color: tint, from: ev.radius, to: ev.radius, dur: 0.5, opacity: big ? 0.45 : 0.3 });
        this.burst(ev.x, 0.3, ev.z, { count: big ? 46 : 24, color: tint, speed: big ? 13 : 9, up: big ? 9 : 6, size: 1.5, life: 0.7 });
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
      case 'lightning': {
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
          if (ev.crit) this.shake = Math.max(this.shake, 0.15);
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
      case 'strike': {
        const v = this.views.get(ev.id);
        if (v) v.strikeT = 0.25;
        const color = ev.parryable ? 0xffe8c0 : COLORS.danger;
        if (ev.shape === 'arc') this.flash(this.sectorGeo(ev.angle, 0.3), { x: ev.x, z: ev.z, y: 0.8, dir: ev.dir, color, from: ev.range * 0.75, to: ev.range, dur: 0.22, opacity: 0.7 });
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
    for (const m of mats) m.emissive.setRGB(r, g, b);
  }

  syncHero(world, alpha, dt) {
    const p = world.player;
    const h = this.hero;
    const an = this.heroAnim;
    const g = h.group;
    const x = lerp(p.px, p.x, alpha);
    const z = lerp(p.pz, p.z, alpha);
    let y = 0;
    if (p.leap) y = Math.sin(Math.PI * Math.min(1, p.leap.t / p.leap.dur)) * 5.5;
    g.position.set(x, y, z);
    g.rotation.y = Math.PI / 2 - p.facing;

    // Legs + bob
    if (p.moving && !p.dash && !p.leap) an.walk += dt * 13;
    const sw = p.moving ? Math.sin(an.walk) * 0.7 : 0;
    h.parts.legL.rotation.x = lerp(h.parts.legL.rotation.x, sw, 0.3);
    h.parts.legR.rotation.x = lerp(h.parts.legR.rotation.x, -sw, 0.3);
    h.parts.body.position.y = p.moving ? Math.abs(Math.sin(an.walk)) * 0.06 : 0;
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

    if (p.dead) {
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
        v = { id: e.id, type: e.type, shape: e.def.model || e.type, model: buildEnemy(e.type), strikeT: 0, walk: Math.random() * 6, height: e.def.height };
        this.scene.add(v.model.group);
        this.views.set(e.id, v);
      }
      const { group, parts, mats } = v.model;
      group.position.set(lerp(e.px, e.x, alpha), 0, lerp(e.pz, e.z, alpha));
      group.rotation.y = Math.PI / 2 - e.facing;

      // Spawn-in
      const s = e.state === 'spawn' ? Math.max(0.01, easeOut(1 - e.t / 0.9)) : 1;
      group.scale.setScalar(s);

      // Walk cycle
      if (e.moving) v.walk += dt * (6 + e.def.speed * 1.6);
      const sw = e.moving ? Math.sin(v.walk) * 0.6 : 0;
      if (parts.legL) {
        parts.legL.rotation.x = lerp(parts.legL.rotation.x, sw, 0.3);
        parts.legR.rotation.x = lerp(parts.legR.rotation.x, -sw, 0.3);
      }
      const body = parts.body;
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
      else if (e.bleedT > 0) this.setEmissive(mats, 0.28, 0.02, 0.04); // bleeding: dark red
      else if (e.slowT > 0 || world.slowT > 0) this.setEmissive(mats, 0.03, 0.12, 0.26); // slowed: cold blue
      else if (e.enraged) this.setEmissive(mats, 0.22, 0.03, 0.02);
      else this.setEmissive(mats, 0, 0, 0);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.views.delete(id);
        v.deathT = 0;
        this.setEmissive(v.model.mats, 0.6, 0.6, 0.6);
        if (v.model.parts.stars) v.model.parts.stars.visible = false;
        this.corpses.push(v);
      }
    }
    for (const c of this.corpses) {
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

  disposeGroup(group) {
    this.scene.remove(group);
    const shared = new Set(this.geoCache.values());
    group.traverse((o) => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
      if (o.material) {
        if (o.material.map && !o.material.map.userData.keep) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  syncProjectiles(world, alpha) {
    const seen = new Set();
    for (const pr of world.projectiles) {
      seen.add(pr.id);
      let m = this.projViews.get(pr.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: 0xd78bff }));
        this.scene.add(m);
        this.projViews.set(pr.id, m);
      }
      const own = { arrow: 0xfff0b0, spark: 0x8fd0ff, bolt: 0xff9a3a, orb: 0xc8f0ff }[pr.kind]; // the hero's own shots
      m.userData.color = own || 0xd78bff;
      m.material.color.set(own || (pr.reflected ? 0xbff2ff : pr.parryable ? 0xe7a8ff : COLORS.danger));
      m.position.set(lerp(pr.px, pr.x, alpha), 1.2, lerp(pr.pz, pr.z, alpha));
      m.scale.setScalar(pr.kind === 'orb' ? 2.1 : pr.kind === 'bolt' ? 1.3 : pr.kind ? 0.55 : pr.reflected ? 1.3 : 1);
      if (pr.kind === 'orb') {
        m.rotation.y += 0.12;
        m.rotation.x += 0.07;
        if (Math.random() < 0.8) this.burst(m.position.x, 1.2, m.position.z, { count: 2, color: 0xe8fbff, speed: 2.5, up: 1, gravity: 0, life: 0.5, size: 1.1 });
      }
      if (Math.random() < 0.6) this.burst(m.position.x, 1.2, m.position.z, { count: 1, color: own || (pr.reflected ? 0x9fe8ff : 0xb44aff), speed: 0.6, up: 0.4, gravity: 0, life: 0.35, size: 0.9 });
    }
    for (const [id, m] of this.projViews) {
      if (!seen.has(id)) {
        this.burst(m.position.x, 1.2, m.position.z, { count: 8, color: m.userData.color || 0xd78bff, speed: 4, up: 2 });
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        this.projViews.delete(id);
      }
    }
  }

  syncLoot(world) {
    const seen = new Set();
    for (const l of world.loot) {
      seen.add(l.id);
      let v = this.lootViews.get(l.id);
      if (!v) {
        const color = new THREE.Color(RARITIES[l.item.rarity].color);
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
        this.lootViews.set(l.id, v);
      }
      v.group.position.set(l.x, 0, l.z);
      v.gem.position.y = 0.7 + Math.sin(this.time * 3 + l.id) * 0.15;
      v.gem.rotation.y = this.time * 2;
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
    for (const t of world.telegraphs) {
      seen.add(t.id);
      let v = this.teleViews.get(t.id);
      if (!v) {
        let geo;
        if (t.kind === 'arc') geo = this.sectorGeo(t.angle);
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
      const color = t.friendly ? COLORS.friendly : !t.parryable ? COLORS.danger : t.cue ? COLORS.cue : COLORS.parryable;
      v.base.material.color.set(color);
      v.fill.material.color.set(color);
      v.fill.material.opacity = t.cue && t.parryable ? 0.7 : 0.4;
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
    this.time += dt;
    const heroPos = this.syncHero(world, alpha, dt);
    this.syncAllies(world, alpha, dt);
    this.syncEnemies(world, alpha, dt);
    this.syncProjectiles(world, alpha);
    this.syncLoot(world);
    this.syncTelegraphs(world);
    this.syncMarkers(world);
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
      const v = this.wayView;
      const on = world.wayArmed && world.wayT > 0;
      v.gate.children.forEach((c, i) => { if (i >= 2) c.position.y = 1.2 + Math.sin(this.time * 2 + i) * 0.18; });
      v.disc.material.opacity = on ? 0.6 : 0.18 + Math.sin(this.time * 2) * 0.06;
      v.pad.scale.setScalar(v.wg.r * (on ? 1 - 0.5 * Math.min(1, world.wayT / 0.9) : 1));
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
    this.camera.position.set(this.camTarget.x + ox, this.camOffset.y * this.zoom, this.camTarget.z + this.camOffset.z * this.zoom + oz);
    this.camera.lookAt(this.camTarget.x + ox, 0.8, this.camTarget.z + oz);
    this.camera.updateMatrixWorld();

    this.sun.position.set(this.camTarget.x + 14, 30, this.camTarget.z + 9);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);

    this.renderer.render(this.scene, this.camera);
  }

  /** Remove every enemy / projectile / loot view (used when a new run starts). */
  /** Party members: their hero model, walking or lying down. */
  syncAllies(world, alpha, dt) {
    if (!this.allyViews) this.allyViews = new Map();
    const list = world.mode === 'explore' && world.allies ? world.allies() : [];
    const seen = new Set();
    for (const a of list) {
      let v = this.allyViews.get(a.pid);
      if (v && v.cls !== a.cls) {
        this.disposeGroup(v.model.group);
        v = null;
      }
      if (!v) {
        const model = buildHero(a.cls);
        this.scene.add(model.group);
        v = { model, cls: a.cls, walk: 0 };
        this.allyViews.set(a.pid, v);
      }
      seen.add(a.pid);
      const g = v.model.group;
      g.visible = true;
      g.rotation.order = 'YXZ';
      g.rotation.y = Math.PI / 2 - a.facing;
      const x = lerp(a.px ?? a.x, a.x, alpha);
      const z = lerp(a.pz ?? a.z, a.z, alpha);
      if (a.dead) {
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
    }
  }

  reset() {
    for (const v of this.views.values()) this.disposeGroup(v.model.group);
    this.views.clear();
    for (const c of this.corpses) this.disposeGroup(c.model.group);
    this.corpses = [];
    for (const m of this.projViews.values()) this.scene.remove(m);
    this.projViews.clear();
    for (const v of this.lootViews.values()) this.disposeGroup(v.group);
    this.lootViews.clear();
    for (const v of this.teleViews.values()) this.scene.remove(v.group);
    this.teleViews.clear();
    this.camTarget.set(0, 0, 0);
    this.hoverId = null;
  }
}
