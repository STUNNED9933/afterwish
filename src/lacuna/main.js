// Lacuna (Chapter 2), engine phase 1: the test land, its own page (lacuna.html), apart from the game.
//
// Walk Sunmere and the land round it over the shoulder, with the performance overlay up, to check the engine
// before anything is built on it. Gate for phase 1: 60 fps on a mid-range laptop (and, with sync, under
// 20 KB/s per player). Keys: WASD move, mouse look (click to capture), Shift sprint, Ctrl walk, wheel zoom,
// 1-4 swap class (one hero, any class: the FFXIV way), B add a test player (wakes beasts elsewhere), F3 overlay.
import * as THREE from 'three';
import { LandWorld, TICK, WAKE } from './sim.js';
import { LandView, DRAW } from './view.js';
import { Crowd } from './crowd.js';
import { groundAt, BEASTS, TOWN } from './land.js';
import { loadRigged, loadWeapon, instantiate, RIGGED } from '../render/rigged.js';
import { Interest, SEND_HZ, apply } from './net.js';

const $ = (id) => document.getElementById(id);
const canvas = $('land');
const world = new LandWorld();
const me = world.addPlayer(1);
const view = new LandView(canvas, world);
const crowd = new Crowd(view.scene, 150);
// (sync, measured) what a server would send this player: made here 10 times a second, sizes added up
const wire = new Interest(1), mirror = new Map();
let wireTick = 0, wireBytes = 0, wireRate = 0;

// ---- the hero (one, any class; swapped with 1-4)
const CLASSES = ['warrior', 'archer', 'mage', 'rogue'];
const NAMES = { warrior: 'Berserker', archer: 'Sharpshooter', mage: 'Pyromancer', rogue: 'Assassin' }; // (working: Lacuna's classes are rebuilt from these)
const hero = { group: new THREE.Group(), rig: null, cls: null, token: 0 };
const stand = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 8).translate(0, 0.82, 0), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
stand.castShadow = true;
hero.group.add(stand);
view.scene.add(hero.group);
function wear(cls) {
  if (hero.cls === cls) return;
  hero.cls = cls;
  const token = ++hero.token;
  const id = 'hero_' + cls;
  if (!RIGGED[id]) return;
  Promise.all([loadRigged(id), loadWeapon(cls, RIGGED[id].weaponScale || 1)]).then(([tpl, made]) => {
    if (!tpl || token !== hero.token) return;
    const rig = instantiate(tpl);
    if (tpl.spec.bow) rig.holdBow(new THREE.MeshStandardMaterial({ color: 0x7a5232 }), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    else if (made) {
      const w = new THREE.Group();
      w.add(made.clone());
      rig.holdWeapon(w);
      if (tpl.spec.offhand) rig.holdOffhand(w.clone(), tpl.spec.offhand);
    }
    rig.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (hero.rig) hero.group.remove(hero.rig.group);
    hero.rig = rig;
    stand.visible = false;
    hero.group.add(rig.group);
  });
  note(`Now a ${NAMES[cls]} (working name). One hero, any class: each levels on its own.`);
}
const params = new URLSearchParams(location.search);
wear(CLASSES.includes(params.get('cls')) ? params.get('cls') : 'warrior');

// ---- test players: walk about the land, so beasts wake in several places at once (and show as other people)
const bots = [];
const botMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 8).translate(0, 0.82, 0), new THREE.MeshLambertMaterial({ color: 0x8fb8ff }), 8);
botMesh.count = 0;
botMesh.castShadow = true;
botMesh.frustumCulled = false;
view.scene.add(botMesh);
function addBot() {
  if (bots.length >= 8) return note('Eight test players is the most.');
  const k = bots.length;
  const a = (k / 8) * Math.PI * 2 + 0.4, r = 120 + (k % 3) * 40;
  const pid = 100 + k;
  world.addPlayer(pid, { x: Math.cos(a) * r, z: Math.sin(a) * r });
  bots.push({ pid, a: Math.random() * 6.28, t: 0 });
  botMesh.count = bots.length;
  note(`Test player ${bots.length} is wandering near (${Math.round(Math.cos(a) * r)}, ${Math.round(Math.sin(a) * r)}).`);
}

// ---- input
const keys = new Set();
let yaw = -Math.PI / 2, pitch = 0.32, dist = 5.2, overlay = true;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'F3') { overlay = !overlay; $('stats').classList.toggle('hidden', !overlay); e.preventDefault(); }
  if (e.code === 'KeyB') addBot();
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) wear(CLASSES[n]);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('click', () => canvas.requestPointerLock && canvas.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas && !(e.buttons & 2)) return;
  yaw += e.movementX * 0.0032;
  pitch = Math.max(-0.35, Math.min(1.2, pitch + e.movementY * 0.0028));
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { dist = Math.max(2.4, Math.min(11, dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });

function wish() {
  const f = (k) => (keys.has(k) ? 1 : 0);
  const fwd = f('KeyW') + f('ArrowUp') - f('KeyS') - f('ArrowDown');
  const side = f('KeyD') + f('ArrowRight') - f('KeyA') - f('ArrowLeft');
  const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -Math.sin(yaw), rz = Math.cos(yaw);
  let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const pace = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 'sprint' : keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC') ? 'walk' : 'run';
  return { mx, mz, pace };
}

// ---- messages
let noteT = 0;
function note(text) {
  $('note').textContent = text;
  $('note').classList.remove('hidden');
  noteT = 4;
}
let hurtT = 0;

// ---- the loop
function resize() {
  view.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
let last = performance.now(), acc = 0, time = 0;
const prev = { x: me.x, z: me.z };
const perf = { frames: 0, t: 0, fps: 0, worst: 0, worstNow: 0, simMs: 0, simN: 0, simShown: 0 };
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  perf.worstNow = Math.max(perf.worstNow, dt * 1000);
  acc += dt;
  const w = wish();
  const s0 = performance.now();
  while (acc >= TICK) {
    prev.x = me.x; prev.z = me.z;
    world.input(1, w);
    for (const b of bots) {
      b.t -= TICK;
      if (b.t <= 0) { b.a += (Math.random() - 0.5) * 2; b.t = 2 + Math.random() * 4; }
      world.input(b.pid, { mx: Math.cos(b.a), mz: Math.sin(b.a), pace: 'run' });
    }
    world.step(TICK);
    if (++wireTick % Math.round(1 / TICK / SEND_HZ) === 0) { const msg = wire.delta(world); if (msg) { wireBytes += msg.byteLength + 6; apply(msg, mirror); } } // +6: a WebSocket frame's own header
    acc -= TICK;
    perf.simN++;
  }
  perf.simMs += performance.now() - s0;
  const alpha = acc / TICK;
  const hx = prev.x + (me.x - prev.x) * alpha, hz = prev.z + (me.z - prev.z) * alpha;
  // what happened
  for (const ev of world.events.splice(0)) {
    if (ev.pid !== 1) continue;
    if (ev.type === 'aggro') note(`A ${BEASTS[world.beasts[ev.id - 1].type].name} has seen you.`);
    if (ev.type === 'swipe') hurtT = 0.35;
  }
  // the hero
  hero.group.position.set(hx, 0, hz);
  hero.group.rotation.y = Math.PI / 2 - me.facing;
  if (hero.rig) hero.rig.update(dt, { moving: me.moving, speed: me.speed, walk: me.pace === 'walk' && me.moving });
  // the camera: over the right shoulder, pulled in if the ground is in the way
  const lx = Math.cos(yaw) * Math.cos(pitch), ly = -Math.sin(pitch), lz = Math.sin(yaw) * Math.cos(pitch);
  const rx = -Math.sin(yaw), rz = Math.cos(yaw);
  camTarget.set(hx + rx * 0.7, 1.55, hz + rz * 0.7);
  camPos.set(camTarget.x - lx * dist, camTarget.y - ly * dist, camTarget.z - lz * dist);
  if (camPos.y < 0.35) camPos.y = 0.35;
  view.camera.position.copy(camPos);
  view.camera.lookAt(camTarget.x + lx * 10, camTarget.y + ly * 10, camTarget.z + lz * 10);
  // the land round you, its beasts, its people, the test players
  view.stream(hx, hz);
  view.followSun(hx, hz);
  view.drawBeasts(hx, hz, alpha, time);
  crowd.update(dt, hx, hz, time);
  const m = new THREE.Matrix4();
  bots.forEach((b, i) => { const p = world.players.get(b.pid); botMesh.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z)); });
  botMesh.instanceMatrix.needsUpdate = true;
  view.render();
  // overlay, twice a second
  if (noteT > 0 && (noteT -= dt) <= 0) $('note').classList.add('hidden');
  $('hurt').style.opacity = hurtT > 0 ? String((hurtT -= dt) / 0.35) : '0';
  perf.frames++;
  perf.t += dt;
  if (perf.t >= 0.5) {
    perf.fps = perf.frames / perf.t;
    perf.worst = perf.worstNow;
    perf.simShown = perf.simN ? perf.simMs / perf.simN : 0;
    wireRate = wireRate ? wireRate * 0.6 + (wireBytes / perf.t) * 0.4 : wireBytes / perf.t;
    wireBytes = 0;
    perf.frames = 0; perf.t = 0; perf.worstNow = 0; perf.simMs = 0; perf.simN = 0;
    if (overlay) {
      const info = view.renderer.info.render;
      const st = world.stats, cs = crowd.stats, vs = view.stats;
      $('stats').innerHTML = [
        `<b>${perf.fps.toFixed(0)} fps</b> · slowest frame ${perf.worst.toFixed(1)} ms`,
        `draws ${info.calls} · triangles ${(info.triangles / 1000).toFixed(0)}k`,
        `chunks drawn ${vs.built} / 64${vs.waiting ? ` (${vs.waiting} to build)` : ''} · view ${DRAW} m`,
        `sim ${perf.simShown.toFixed(3)} ms a step · players ${world.players.size}`,
        `sync ${(wireRate / 1024).toFixed(2)} KB/s to you (${SEND_HZ}/s, ${mirror.size} things in sight) · goal under 20`,
        `beasts ${world.beasts.length}: ${st.awake} awake, ${st.looked} looked at, rest asleep (wake ${WAKE} m)`,
        `townsfolk ${crowd.people.length}: ${cs.near} near, ${cs.mid} mid, ${cs.far} hidden · ${cs.moved} moved this frame`,
        `at ${me.x.toFixed(0)}, ${me.z.toFixed(0)} · ${groundAt(me.x, me.z)} · ${NAMES[hero.cls]}`,
      ].join('<br>');
    }
  }
}
requestAnimationFrame(frame);
note('Sunmere, a town in Lacuna. Click to look around. WASD to move, Shift to sprint, 1-4 to change class, B for a test player.');
window.land = { world, view, crowd, me, setYaw: (y) => (yaw = y), setPitch: (p) => (pitch = p), addBot, wear }; // (tests)
void TOWN;
