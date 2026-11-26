// Lacuna (Chapter 2), engine phase 1: the test land, its own page (lacuna.html), apart from the game.
//
// Walk Sunmere and the land round it over the shoulder, alone (everything runs here) or together on the
// server world (the server runs the land and its beasts: see room.js), with the performance overlay up.
// Keys: WASD move, mouse look (click to capture), Shift sprint, Ctrl walk, wheel zoom, 1-4 swap class (one
// hero, any class: the FFXIV way), Enter to chat (together), B add a test player (alone), F3 overlay.
import * as THREE from 'three';
import { LandWorld, TICK, WAKE } from './sim.js';
import { LandView, DRAW } from './view.js';
import { Crowd } from './crowd.js';
import { groundAt, BEASTS } from './land.js';
import { loadRigged, loadWeapon, instantiate, RIGGED } from '../render/rigged.js';
import { Interest, SEND_HZ, apply, decode, PLAYER_ID } from './net.js';
import { LACUNA_NET } from './room.js';
import { SERVERS } from '../net/servers.js';

const $ = (id) => document.getElementById(id);
const canvas = $('land');
const world = new LandWorld();
const me = world.addPlayer(1);
const view = new LandView(canvas, world);
const crowd = new Crowd(view.scene, 150);
// (alone) what a server would send you: made here 10 times a second and measured
const wire = new Interest(1), mirror = new Map();
let wireTick = 0, wireBytes = 0, wireRate = 0;

// ---- heroes: yours, and (together) everyone else's, each in their class's real model
const CLASSES = ['warrior', 'archer', 'mage', 'rogue'];
const NAMES = { warrior: 'Berserker', archer: 'Sharpshooter', mage: 'Pyromancer', rogue: 'Assassin' }; // (working: Lacuna's classes are rebuilt from these)
const standGeo = new THREE.CapsuleGeometry(0.32, 1.0, 4, 8).translate(0, 0.82, 0);
function makeHero(colour = 0xd8c8a8) {
  const h = { group: new THREE.Group(), rig: null, cls: null, token: 0, stand: new THREE.Mesh(standGeo, new THREE.MeshLambertMaterial({ color: colour })) };
  h.stand.castShadow = true;
  h.group.add(h.stand);
  view.scene.add(h.group);
  return h;
}
function dress(h, cls) {
  if (h.cls === cls) return;
  h.cls = cls;
  const token = ++h.token;
  const id = 'hero_' + cls;
  if (!RIGGED[id]) return;
  Promise.all([loadRigged(id), loadWeapon(cls, RIGGED[id].weaponScale || 1)]).then(([tpl, made]) => {
    if (!tpl || token !== h.token || h.gone) return;
    const rig = instantiate(tpl);
    if (tpl.spec.bow) rig.holdBow(new THREE.MeshStandardMaterial({ color: 0x7a5232 }), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    else if (made) {
      const w = new THREE.Group();
      w.add(made.clone());
      rig.holdWeapon(w);
      if (tpl.spec.offhand) rig.holdOffhand(w.clone(), tpl.spec.offhand);
    }
    rig.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (h.rig) h.group.remove(h.rig.group);
    h.rig = rig;
    h.stand.visible = false;
    h.group.add(rig.group);
  });
}
const hero = makeHero();
function wear(cls) {
  if (hero.cls === cls) return;
  dress(hero, cls);
  if (net && net.ready) net.send({ t: 'cls', cls });
  note(`Now a ${NAMES[cls]} (working name). One hero, any class: each levels on its own.`);
}
const params = new URLSearchParams(location.search);

// ---- test players (alone): walk about the land, so beasts wake in several places at once
const bots = [];
const botMesh = new THREE.InstancedMesh(standGeo, new THREE.MeshLambertMaterial({ color: 0x8fb8ff }), 8);
botMesh.count = 0;
botMesh.castShadow = true;
botMesh.frustumCulled = false;
view.scene.add(botMesh);
function addBot() {
  if (net) return note('Test players are for walking alone.');
  if (bots.length >= 8) return note('Eight test players is the most.');
  const k = bots.length;
  const a = (k / 8) * Math.PI * 2 + 0.4, r = 120 + (k % 3) * 40;
  const pid = 100 + k;
  world.addPlayer(pid, { x: Math.cos(a) * r, z: Math.sin(a) * r });
  bots.push({ pid, a: Math.random() * 6.28, t: 0 });
  botMesh.count = bots.length;
  note(`Test player ${bots.length} is wandering near (${Math.round(Math.cos(a) * r)}, ${Math.round(Math.sin(a) * r)}).`);
}

// ---- together: the server world's land (room.js)
let net = null;
const others = new Map(); // pid -> { hero, name, label }
const seen = new Map(); // id -> what the server says is in sight, eased between its updates
const SETTINGS_KEY = 'stunned-arena-settings-v1'; // the game's own settings: its server passcode, if typed there
function savedPass() {
  try { return (JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}).serverPass || ''; } catch (err) { return ''; }
}
function savedName() {
  try { return localStorage.getItem('lacuna-name') || ''; } catch (err) { return ''; }
}
$('mp-name').value = savedName();
$('mp-pass').value = savedPass();
function serverUrl() {
  const u = params.get('server') || (SERVERS[0] && SERVERS[0].url) || '';
  return u.replace(/\/+$/, '') + '/lacuna';
}
function joinServer() {
  if (net) return;
  const name = $('mp-name').value.trim(), pass = $('mp-pass').value.trim();
  if (!pass) return mpStatus('Type the server world\'s passcode (the one friends use for Haven).');
  try { localStorage.setItem('lacuna-name', name); } catch (err) { /* private window */ }
  mpStatus('Connecting…');
  let ws;
  try { ws = new WebSocket(serverUrl()); } catch (err) { return mpStatus('That server address does not look right.'); }
  ws.binaryType = 'arraybuffer';
  net = { ws, ready: false, pid: 0, bytes: 0, ping: 0, sentAt: 0, pingAt: 0, send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  ws.onopen = () => net.send({ t: 'hello', v: LACUNA_NET, pass, name, cls: hero.cls });
  ws.onmessage = (e) => {
    if (!net) return;
    if (typeof e.data !== 'string') {
      net.bytes += e.data.byteLength + 6;
      const now = performance.now() / 1000;
      const { ups, gone } = decode(e.data);
      for (const u of ups) {
        if (u.id === PLAYER_ID + net.pid) continue; // you: your own browser knows where you are
        let s = seen.get(u.id);
        if (!s) seen.set(u.id, (s = { x: u.x, z: u.z }));
        s.fx = s.x; s.fz = s.z; s.tx = u.x; s.tz = u.z; s.t0 = now;
        Object.assign(s, { id: u.id, facing: u.facing, moving: u.moving, type: u.type, player: u.player, state: u.state });
      }
      for (const id of gone) seen.delete(id);
      return;
    }
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.t === 'welcome') {
      net.ready = true;
      net.pid = msg.pid;
      world.noBeasts = true; // the server's beasts from now on
      for (const b of bots) world.removePlayer(b.pid);
      bots.length = 0;
      botMesh.count = 0;
      me.x = prev.x = msg.at.x; me.z = prev.z = msg.at.z;
      $('mp').classList.add('joined');
      mpStatus(`On the server world's land as ${msg.name}. Enter to chat.`);
      note('You are on the shared land. Friends who join appear here, at the south gate.');
    } else if (msg.t === 'reject') mpStatus(msg.reason);
    else if (msg.t === 'roster') roster(msg.players);
    else if (msg.t === 'snap') { me.x = prev.x = msg.x; me.z = prev.z = msg.z; }
    else if (msg.t === 'ev') {
      if (msg.type === 'swipe') hurtT = 0.35;
      if (msg.type === 'aggro') { const b = seen.get(msg.id); note(`A ${b && b.type ? BEASTS[b.type].name : 'beast'} has seen you.`); }
    } else if (msg.t === 'chat') say(msg.name ? `${msg.name}: ${msg.text}` : msg.text, !msg.name);
    else if (msg.t === 'pong') net.ping = performance.now() - msg.at;
  };
  ws.onclose = (e) => {
    const was = net && net.ready;
    net = null;
    world.noBeasts = false;
    for (const o of others.values()) drop(o);
    others.clear();
    seen.clear();
    $('mp').classList.remove('joined');
    mpStatus(was ? `Left the server world (${e.reason || 'the connection closed'}). Walking alone again.` : e.reason || 'Could not reach the server world.');
  };
}
function roster(players) {
  const here = new Set();
  for (const p of players) {
    if (p.pid === net.pid) continue;
    here.add(p.pid);
    let o = others.get(p.pid);
    if (!o) {
      const label = document.createElement('div');
      label.className = 'name';
      $('labels').appendChild(label);
      others.set(p.pid, (o = { hero: makeHero(0x9fc0ff), label }));
    }
    o.name = p.name;
    o.label.textContent = p.name;
    dress(o.hero, p.cls);
  }
  for (const [pid, o] of others) if (!here.has(pid)) { drop(o); others.delete(pid); }
  $('mp-who').textContent = players.length > 1 ? `${players.length} here: ${players.map((p) => p.name).join(', ')}` : 'Only you here so far.';
}
function drop(o) {
  o.hero.gone = true;
  view.scene.remove(o.hero.group);
  o.label.remove();
}
function mpStatus(text) {
  $('mp-status').textContent = text;
}
$('mp-join').addEventListener('click', joinServer);
$('mp-leave').addEventListener('click', () => net && net.ws.close(1000, 'You left'));

// ---- chat (together)
const chatLines = [];
function say(text, quiet) {
  chatLines.push({ text, t: 12, quiet });
  if (chatLines.length > 7) chatLines.shift();
  drawChat();
}
function drawChat() {
  $('chat-log').innerHTML = '';
  for (const l of chatLines) {
    const d = document.createElement('div');
    d.textContent = l.text;
    if (l.quiet) d.className = 'quiet';
    d.style.opacity = String(Math.min(1, l.t / 2));
    $('chat-log').appendChild(d);
  }
}
$('chat-in').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const t = $('chat-in').value.trim();
    if (t && net && net.ready) net.send({ t: 'chat', text: t });
    $('chat-in').value = '';
    $('chat-in').classList.add('hidden');
    $('chat-in').blur();
  } else if (e.key === 'Escape') { $('chat-in').classList.add('hidden'); $('chat-in').blur(); }
  e.stopPropagation();
});

// ---- input
const keys = new Set();
let yaw = -Math.PI / 2, pitch = 0.32, dist = 5.2, overlay = true;
const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
addEventListener('keydown', (e) => {
  if (typing(e)) return;
  keys.add(e.code);
  if (e.code === 'F3') { overlay = !overlay; $('stats').classList.toggle('hidden', !overlay); e.preventDefault(); }
  if (e.code === 'KeyB') addBot();
  if (e.code === 'Enter' && net && net.ready) {
    keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    $('chat-in').classList.remove('hidden');
    $('chat-in').focus();
    e.preventDefault();
  }
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
wear(CLASSES.includes(params.get('cls')) ? params.get('cls') : 'warrior');

// ---- the loop
function resize() {
  view.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
let last = performance.now(), acc = 0, time = 0;
const prev = { x: me.x, z: me.z };
const perf = { frames: 0, t: 0, fps: 0, worst: 0, worstNow: 0, simMs: 0, simN: 0, simShown: 0 };
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), proj = new THREE.Vector3();
const seenBeasts = [];
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
    if (!net && ++wireTick % Math.round(1 / TICK / SEND_HZ) === 0) { const msg = wire.delta(world); if (msg) { wireBytes += msg.byteLength + 6; apply(msg, mirror); } } // +6: a WebSocket frame's own header
    acc -= TICK;
    perf.simN++;
  }
  perf.simMs += performance.now() - s0;
  const alpha = acc / TICK;
  const hx = prev.x + (me.x - prev.x) * alpha, hz = prev.z + (me.z - prev.z) * alpha;
  // together: say where you are, ten times a second (and see how long the server takes to answer, now and then)
  if (net && net.ready && now - net.sentAt >= 1000 / SEND_HZ) {
    net.sentAt = now;
    net.send({ t: 'pos', x: +me.x.toFixed(3), z: +me.z.toFixed(3), f: +me.facing.toFixed(3), m: me.moving ? 1 : 0, p: me.pace });
    if (now - net.pingAt > 2000) { net.pingAt = now; net.send({ t: 'ping', at: now }); }
  }
  // what happened (alone: here; together: the server says)
  for (const ev of world.events.splice(0)) {
    if (ev.pid !== 1 || net) continue;
    if (ev.type === 'aggro') note(`A ${BEASTS[world.beasts[ev.id - 1].type].name} has seen you.`);
    if (ev.type === 'swipe') hurtT = 0.35;
  }
  // your hero
  hero.group.position.set(hx, 0, hz);
  hero.group.rotation.y = Math.PI / 2 - me.facing;
  if (hero.rig) hero.rig.update(dt, { moving: me.moving, speed: me.speed, walk: me.pace === 'walk' && me.moving });
  // the camera: over the right shoulder, kept above the ground
  const lx = Math.cos(yaw) * Math.cos(pitch), ly = -Math.sin(pitch), lz = Math.sin(yaw) * Math.cos(pitch);
  const rx = -Math.sin(yaw), rz = Math.cos(yaw);
  camTarget.set(hx + rx * 0.7, 1.55, hz + rz * 0.7);
  camPos.set(camTarget.x - lx * dist, camTarget.y - ly * dist, camTarget.z - lz * dist);
  if (camPos.y < 0.35) camPos.y = 0.35;
  view.camera.position.copy(camPos);
  view.camera.lookAt(camTarget.x + lx * 10, camTarget.y + ly * 10, camTarget.z + lz * 10);
  // the land round you, its beasts, its people, the other players
  view.stream(hx, hz);
  view.followSun(hx, hz);
  if (net) {
    // eased between the server's updates (a tenth of a second apart)
    const t = now / 1000;
    seenBeasts.length = 0;
    for (const s of seen.values()) {
      const k = Math.min(1, (t - s.t0) * SEND_HZ);
      s.x = s.fx + (s.tx - s.fx) * k;
      s.z = s.fz + (s.tz - s.fz) * k;
      if (!s.player) seenBeasts.push(s);
    }
    view.drawSeen(seenBeasts, time);
    for (const [pid, o] of others) {
      const s = seen.get(PLAYER_ID + pid);
      o.hero.group.visible = !!s;
      if (!s) { o.label.style.display = 'none'; continue; }
      o.hero.group.position.set(s.x, 0, s.z);
      o.hero.group.rotation.y = Math.PI / 2 - s.facing;
      if (o.hero.rig) o.hero.rig.update(dt, { moving: s.moving, speed: 5.6 });
      proj.set(s.x, 2.35, s.z).project(view.camera);
      const off = proj.z > 1 || Math.hypot(s.x - hx, s.z - hz) > 60;
      o.label.style.display = off ? 'none' : '';
      if (!off) o.label.style.transform = `translate(${((proj.x + 1) / 2) * innerWidth}px, ${((1 - proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    }
  } else view.drawBeasts(hx, hz, alpha, time);
  crowd.update(dt, hx, hz, time);
  const m = new THREE.Matrix4();
  bots.forEach((b, i) => { const p = world.players.get(b.pid); botMesh.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z)); });
  botMesh.instanceMatrix.needsUpdate = true;
  view.render();
  // notes, chat fading, overlay twice a second
  if (noteT > 0 && (noteT -= dt) <= 0) $('note').classList.add('hidden');
  $('hurt').style.opacity = hurtT > 0 ? String((hurtT -= dt) / 0.35) : '0';
  if (chatLines.length) {
    for (const l of chatLines) l.t -= dt;
    while (chatLines.length && chatLines[0].t <= 0) chatLines.shift();
    if (Math.floor(time * 4) !== Math.floor((time - dt) * 4)) drawChat();
  }
  perf.frames++;
  perf.t += dt;
  if (perf.t >= 0.5) {
    perf.fps = perf.frames / perf.t;
    perf.worst = perf.worstNow;
    perf.simShown = perf.simN ? perf.simMs / perf.simN : 0;
    const got = net ? net.bytes : wireBytes;
    wireRate = wireRate ? wireRate * 0.6 + (got / perf.t) * 0.4 : got / perf.t;
    wireBytes = 0;
    if (net) net.bytes = 0;
    perf.frames = 0; perf.t = 0; perf.worstNow = 0; perf.simMs = 0; perf.simN = 0;
    if (overlay) {
      const info = view.renderer.info.render;
      const st = world.stats, cs = crowd.stats, vs = view.stats;
      const on = net && net.ready;
      $('stats').innerHTML = [
        `<b>${perf.fps.toFixed(0)} fps</b> · slowest frame ${perf.worst.toFixed(1)} ms`,
        `draws ${info.calls} · triangles ${(info.triangles / 1000).toFixed(0)}k`,
        `chunks drawn ${vs.built} / 64${vs.waiting ? ` (${vs.waiting} to build)` : ''} · view ${DRAW} m`,
        on ? `<b class="on">together</b> · ${others.size + 1} here · ping ${net.ping.toFixed(0)} ms` : `alone · sim ${perf.simShown.toFixed(3)} ms a step · players ${world.players.size}`,
        on ? `sync ${(wireRate / 1024).toFixed(2)} KB/s from the server (${seen.size} things in sight) · goal under 20` : `sync ${(wireRate / 1024).toFixed(2)} KB/s if online (${SEND_HZ}/s, ${mirror.size} things in sight) · goal under 20`,
        on ? `beasts: the server's (${seenBeasts.length} in sight)` : `beasts ${world.beasts.length}: ${st.awake} awake, ${st.looked} looked at, rest asleep (wake ${WAKE} m)`,
        `townsfolk ${crowd.people.length}: ${cs.near} near, ${cs.mid} mid, ${cs.far} hidden · ${cs.moved} moved this frame`,
        `at ${me.x.toFixed(0)}, ${me.z.toFixed(0)} · ${groundAt(me.x, me.z)} · ${NAMES[hero.cls]}`,
      ].join('<br>');
    }
  }
}
requestAnimationFrame(frame);
note('Sunmere, a town in Lacuna. Click to look around. WASD to move, Shift to sprint, 1-4 to change class.');
window.land = { world, view, crowd, me, setYaw: (y) => (yaw = y), setPitch: (p) => (pitch = p), addBot, wear, joinServer, others, seen, get net() { return net; } }; // (tests)
