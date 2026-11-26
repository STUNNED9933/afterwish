// Lacuna (Chapter 2): the test land, its own page (lacuna.html), apart from the game.
//
// Walk and fight on the land round Sunmere over the shoulder, alone (everything runs here) or together on the
// server world (the server runs the land, its beasts and every blow: see room.js).
// Keys: WASD move, mouse look (click to capture), left click attack (hold), Q E R skills, right click (hold)
// scope (Sharpshooter), Shift sprint, Ctrl walk, wheel zoom, 1-2 swap class, L try other Eternal levels
// (alone), Enter chat (together), B add a test player (alone), F3 overlay.
import * as THREE from 'three';
import { LandWorld, TICK, WAKE, KITS, LACUNA_CLASSES, LINK_SLOTS, linkFrom, linkPower, linkMult, JUMP } from './sim.js';
import { LandView, DRAW } from './view.js';
import { Crowd } from './crowd.js';
import { Fx } from './fx.js';
import { groundAt, BEASTS } from './land.js';
import { loadRigged, loadWeapon, instantiate, RIGGED } from '../render/rigged.js';
import { Interest, SEND_HZ, apply, decode, PLAYER_ID } from './net.js';
import { LACUNA_NET } from './room.js';
import { SERVERS } from '../net/servers.js';

const $ = (id) => document.getElementById(id);
const canvas = $('land');
const params = new URLSearchParams(location.search);
const world = new LandWorld();

// ---- the Dimension Link: your Eternal gear in this browser's saves (every class), or a level to try (L)
const SAVE_KEY = 'stunned-arena-save-v1';
function localSaves() {
  const out = [];
  for (const cls of ['warrior', 'archer', 'mage', 'rogue']) {
    try { const s = JSON.parse(localStorage.getItem(cls === 'warrior' ? SAVE_KEY : `${SAVE_KEY}-${cls}`) || 'null'); if (s) out.push(s); } catch (err) { /* unreadable: skip */ }
  }
  return out;
}
const ownLink = linkFrom(localSaves());
const TRY = [null, 0, 10, 20, 30]; // L cycles: your own, then every slot at these levels
let tryAt = 0;
const linkNow = () => (TRY[tryAt] === null ? ownLink : Object.fromEntries(LINK_SLOTS.map((s) => [s, TRY[tryAt]])));
const startCls = LACUNA_CLASSES.includes(params.get('cls')) ? params.get('cls') : 'warrior';
const me = world.addPlayer(1, undefined, { cls: startCls, link: linkNow() });
const view = new LandView(canvas, world);
const crowd = new Crowd(view.scene, 150);
const fx = new Fx(view.scene, $('fxlayer'));
// (alone) what a server would send you: made here 10 times a second and measured
const wire = new Interest(1), mirror = new Map();
let wireTick = 0, wireBytes = 0, wireRate = 0;
let linkFromLabel = TRY[tryAt] === null ? 'your Eternal gear on this browser' : '';

// ---- heroes: yours, and (together) everyone else's, each in their class's real model
const NAMES = { warrior: 'Berserker', archer: 'Sharpshooter' }; // (working names)
const standGeo = new THREE.CapsuleGeometry(0.32, 1.0, 4, 8).translate(0, 0.82, 0);
function makeHero(colour = 0xd8c8a8) {
  const h = { group: new THREE.Group(), body: new THREE.Group(), rig: null, cls: null, token: 0, stand: new THREE.Mesh(standGeo, new THREE.MeshLambertMaterial({ color: colour })), anim: { start: false, move: null, moveDur: 0, spinT: 0, hit: false, period: 0, jumpT: -1 } };
  h.stand.castShadow = true;
  h.group.add(h.body);
  h.body.add(h.stand);
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
    if (h.rig) h.body.remove(h.rig.group);
    h.rig = rig;
    h.stand.visible = false;
    h.body.add(rig.group);
  });
}
/** A blow or skill seen (yours, or someone else's from the server): what the model does. */
function animate(h, ev) {
  const a = h.anim;
  if (ev.skill === 'basic') { a.start = true; a.period = ev.every || 0.6; }
  else if (ev.skill === 'leap') { a.move = 'leap'; a.moveDur = ev.dur; }
  else if (ev.skill === 'whirl') a.spinT = ev.dur;
  else if (ev.skill === 'roll') { a.move = 'dash'; a.moveDur = ev.dur; }
  else if (ev.skill === 'volley') a.move = 'barrage';
  else if (ev.skill === 'deadeye') a.move = 'aim';
  else if (ev.skill === 'rage') a.move = 'cone';
  else if (ev.skill === 'jump') a.jumpT = 0;
}
/** Height of a hop, t seconds after it began (the sim's own arc, for other players: the server sends no height). */
function hopAt(t) {
  const y = JUMP.up * t - 0.5 * JUMP.gravity * t * t;
  return y > 0 ? y : 0;
}
function pose(h, dt, s) {
  const a = h.anim;
  // in the air: a little forward lean (no jump clip in these models yet)
  if (a.jumpT >= 0) { a.jumpT += dt; if (a.jumpT > (2 * JUMP.up) / JUMP.gravity) a.jumpT = -1; }
  const air = s.y !== undefined ? s.y : a.jumpT >= 0 ? hopAt(a.jumpT) : 0;
  h.body.position.y = air;
  h.body.rotation.x = air > 0.05 ? Math.min(0.22, air * 0.25) : 0;
  if (a.spinT > 0) { a.spinT -= dt; h.body.rotation.y += dt * 16; } else h.body.rotation.y = 0;
  if (!h.rig) return;
  h.rig.update(dt, { ...s, attackStart: a.start, attackDur: Math.min(0.4, a.period * 0.6), period: h.cls === 'archer' ? a.period : 0, move: a.move, moveDur: a.moveDur, spinning: a.spinT > 0, hitStart: a.hit });
  a.start = false;
  a.move = null;
  a.hit = false;
}
const hero = makeHero();
function wear(cls) {
  if (!KITS[cls]) return note('Pyromancer, Assassin and the other classes come later: the opening has the Berserker and the Sharpshooter.');
  if (hero.cls === cls) return;
  dress(hero, cls);
  world.setClass(1, cls);
  if (net && net.ready) net.send({ t: 'cls', cls });
  drawSkills();
  note(`Now a ${NAMES[cls]} (working name). ${KITS[cls].passive}`);
}

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
  world.players.get(pid).guard = 1e9; // test players cannot be hurt (they would only lie down)
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
function serverBase() {
  return (params.get('server') || (SERVERS[0] && SERVERS[0].url) || '').replace(/\/+$/, '');
}
/** Your sign-in on the server world, if you have one in this browser: the server reads your own Eternal gear. */
function session() {
  try { return (JSON.parse(localStorage.getItem('stunned-online-v1') || '{}') || {})[serverBase().replace(/^ws(s?):\/\//, 'http$1://')] || ''; } catch (err) { return ''; }
}
$('mp-name').value = savedName();
$('mp-pass').value = savedPass();
function joinServer() {
  if (net) return;
  const name = $('mp-name').value.trim(), pass = $('mp-pass').value.trim();
  if (!pass) return mpStatus('Type the server world\'s passcode (the one friends use for Haven).');
  try { localStorage.setItem('lacuna-name', name); } catch (err) { /* private window */ }
  mpStatus('Connecting…');
  let ws;
  try { ws = new WebSocket(serverBase() + '/lacuna'); } catch (err) { return mpStatus('That server address does not look right.'); }
  ws.binaryType = 'arraybuffer';
  net = { ws, ready: false, pid: 0, bytes: 0, ping: 0, sentAt: 0, pingAt: 0, send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  ws.onopen = () => net.send({ t: 'hello', v: LACUNA_NET, pass, name, cls: hero.cls, session: session(), link: linkNow() });
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
        if (u.dead && !s.dead) { s.x = s.fx = u.x; s.z = s.fz = u.z; }
        Object.assign(s, { id: u.id, facing: u.facing, moving: u.moving, type: u.type, player: u.player, state: u.state, dead: u.dead, hp: u.hp, r: u.type ? BEASTS[u.type].r : 0.4, tall: u.type === 'golem' ? 2.9 : 1.8 });
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
      world.setLink(1, msg.link);
      linkFromLabel = msg.linkFrom === 'account' ? 'your account\'s Eternal gear' : TRY[tryAt] === null ? 'your Eternal gear on this browser' : '';
      drawLink();
      $('mp').classList.add('joined');
      mpStatus(`On the server world's land as ${msg.name}. Enter to chat.`);
      note('You are on the shared land. Friends who join appear here, at the south gate.');
    } else if (msg.t === 'reject') mpStatus(msg.reason);
    else if (msg.t === 'roster') roster(msg.players);
    else if (msg.t === 'snap') { me.x = prev.x = msg.x; me.z = prev.z = msg.z; }
    else if (msg.t === 'me') {
      // the server's word on your health, mana and cooldowns (your page guessed them a moment early)
      const [hp, maxHp, mp, maxMp, q, e, r, rage, down, mult] = msg.v;
      Object.assign(me, { hp, maxHp, mp, maxMp, rage, mult });
      for (const [k, v] of [['Q', q], ['E', e], ['R', r]]) if (Math.abs(me.cd[k] - v) > 0.35) me.cd[k] = v;
      if (down && !me.dead) { me.dead = true; me.downT = down; me.leap = me.roll = me.whirl = me.draw = null; }
      if (!down && me.dead) me.dead = false;
    } else if (msg.t === 'evs') for (const ev of msg.list) onEvent(ev);
    else if (msg.t === 'chat') say(msg.name ? `${msg.name}: ${msg.text}` : msg.text, !msg.name);
    else if (msg.t === 'pong') net.ping = performance.now() - msg.at;
  };
  ws.onclose = (e) => {
    const was = net && net.ready;
    net = null;
    world.noBeasts = false;
    world.setLink(1, linkNow());
    me.dead = false;
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

// ---- what happens: blows, shots, hits, falls (alone from the sim here; together from the server)
function heroOf(pid) {
  if (pid === 1 && !net) return hero;
  if (net && pid === net.pid) return hero;
  const o = others.get(pid);
  return o ? o.hero : null;
}
const isMe = (pid) => (net ? pid === net.pid : pid === 1);
function onEvent(ev) {
  if (ev.type === 'shot') fx.shot(ev);
  else if (ev.type === 'cast') { const h = heroOf(ev.pid); if (h) animate(h, ev); }
  else if (ev.type === 'slam') fx.ring(ev.x, ev.z, ev.r, 0xffb347, 0.5);
  else if (ev.type === 'hit') fx.number(ev.x, ev.z, String(ev.dmg), isMe(ev.pid) ? (ev.shot && ev.dmg > 300 ? 'big' : 'dealt') : 'dealt');
  else if (ev.type === 'die') { fx.puff(ev.x, ev.z); if (isMe(ev.pid)) note(`${BEASTS[ev.kind] ? BEASTS[ev.kind].name : 'It'} falls.`); }
  else if (ev.type === 'aggro' && isMe(ev.pid)) { const t = net ? seen.get(ev.id) : world.beasts[ev.id - 1]; note(`A ${t && t.type ? BEASTS[t.type].name : 'beast'} is coming for you.`); }
  else if (ev.type === 'swipe') {
    const h = heroOf(ev.pid);
    if (h) h.anim.hit = true;
    if (isMe(ev.pid)) { if (ev.dmg) { hurtT = 0.35; fx.number(heroX, heroZ, `-${ev.dmg}`, 'taken'); } else fx.number(heroX, heroZ, 'dodged', 'heal'); }
  } else if (ev.type === 'down' && isMe(ev.pid)) note('You are down. You will get up at Sunmere\'s gate.');
  else if (ev.type === 'up' && isMe(ev.pid)) { prev.x = me.x; prev.z = me.z; note('Back on your feet at the gate.'); }
}

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
    relock(); // back to looking round (Enter is a key press: allowed)
  } else if (e.key === 'Escape') { $('chat-in').classList.add('hidden'); $('chat-in').blur(); drawLookHint(); }
  e.stopPropagation();
});

// ---- the battle display: health, mana, skills, the Link
function drawSkills() {
  const kit = KITS[me.cls];
  $('skills').innerHTML = '';
  for (const [k, key] of [['basic', 'LMB'], ['Q', 'Q'], ['E', 'E'], ['R', 'R']]) {
    const s = k === 'basic' ? kit.basic : kit[k];
    const d = document.createElement('div');
    d.className = 'sk';
    d.id = 'sk-' + k;
    d.title = s.text || '';
    d.innerHTML = `<span class="k">${key}</span><b>${s.name}</b><em>${k === 'basic' ? 'no mana' : `${s.mana} mana`}</em><div class="cd"></div><div class="n"></div>`;
    $('skills').appendChild(d);
  }
}
function drawLink() {
  const L = net && net.ready ? me.link : linkNow();
  const lv = LINK_SLOTS.map((s) => (L && L[s]) || 0);
  const from = TRY[tryAt] !== null && !(net && net.ready && linkFromLabel) ? `trying level ${TRY[tryAt]} in every slot (L)` : linkFromLabel || 'your Eternal gear';
  $('link').textContent = `Dimension Link ×${linkMult(linkPower(L)).toFixed(2)} · Eternal ${lv.join(' / ')} · ${from}`;
}
function drawHud() {
  const kit = KITS[me.cls];
  $('hp').firstChild.style.width = `${(me.hp / me.maxHp) * 100}%`;
  $('hp').lastChild.textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
  $('mpb').firstChild.style.width = `${(me.mp / me.maxMp) * 100}%`;
  $('mpb').lastChild.textContent = `${Math.floor(me.mp)} / ${me.maxMp} mana`;
  for (const k of ['basic', 'Q', 'E', 'R']) {
    const el = $('sk-' + k);
    if (!el) continue;
    const s = k === 'basic' ? kit.basic : kit[k];
    const left = k === 'basic' ? Math.max(0, me.basicT) : Math.max(0, me.cd[k]);
    const full = k === 'basic' ? kit.basic.every : s.cd;
    el.querySelector('.cd').style.height = `${Math.min(1, left / full) * 100}%`;
    el.querySelector('.n').textContent = left > 0.95 ? Math.ceil(left) : '';
    el.classList.toggle('dry', k !== 'basic' && me.mp < s.mana);
  }
  $('down').style.display = me.dead ? 'flex' : 'none';
  if (me.dead) $('down-t').textContent = `Getting up at Sunmere's gate in ${Math.max(0, Math.ceil(me.downT))} s`;
}

// ---- input
const keys = new Set();
let yaw = -Math.PI / 2, pitch = 0.32, dist = 5.2, overlay = true, firing = false, scoped = false;
let walking = false; // Ctrl (or C) toggles walking: held, Ctrl sets off the browser's own shortcuts
let altFree = false; // Alt held: the mouse is yours (hover for descriptions); let go and it looks around again
const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
const locked = () => document.pointerLockElement === canvas;
const chatOpen = () => !$('chat-in').classList.contains('hidden');
/** Take the mouse back for looking (needs a key or a click: browsers only allow it then). */
function relock() {
  if (locked() || altFree || chatOpen() || !canvas.requestPointerLock) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (err) {
    /* refused (too soon after Esc): the next key or click tries again */
  }
}
addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (e.key === 'Alt') {
    e.preventDefault(); // (Alt alone would open the browser's menu)
    if (!altFree) { altFree = true; firing = false; scoped = false; if (locked()) document.exitPointerLock(); drawLookHint(); }
    return;
  }
  // back from another tab or window: any game key takes the mouse again (Esc and the F keys do not)
  if (!locked() && e.code !== 'Escape' && !/^F\d+$/.test(e.code)) relock();
  if (e.repeat && (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC')) return;
  keys.add(e.code);
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') { walking = !walking; note(walking ? 'Walking (Ctrl or C to run again).' : 'Running.'); }
  if (e.code === 'F3') { overlay = !overlay; $('stats').classList.toggle('hidden', !overlay); e.preventDefault(); }
  if (e.code === 'KeyB') addBot();
  if (e.code === 'KeyL') {
    if (net && net.ready) note('Together, the server decides your Link (your account\'s Eternal gear if you are signed in).');
    else { tryAt = (tryAt + 1) % TRY.length; world.setLink(1, linkNow()); linkFromLabel = TRY[tryAt] === null ? 'your Eternal gear on this browser' : ''; drawLink(); note(TRY[tryAt] === null ? 'Your own Eternal gear again.' : `Trying Eternal level ${TRY[tryAt]} in every slot (beasts are tuned for 10).`); }
  }
  if (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'KeyR') act(e.code.slice(3));
  if (e.code === 'Enter' && net && net.ready) {
    keys.clear();
    if (locked()) document.exitPointerLock();
    $('chat-in').classList.remove('hidden');
    $('chat-in').focus();
    e.preventDefault();
  }
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) wear(['warrior', 'archer', 'mage', 'rogue'][n]);
  if (e.code === 'Space' && !e.repeat && world.jump(1) && net && net.ready) net.send({ t: 'jump' });
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.key === 'Alt') {
    e.preventDefault();
    altFree = false;
    hideTip();
    relock(); // (browsers allow it for a few seconds after a key press; held longer, the next key or click does it)
    drawLookHint();
  }
});
addEventListener('blur', () => { keys.clear(); firing = false; scoped = false; altFree = false; hideTip(); });
function drawLookHint() {
  $('look-hint').textContent = altFree ? 'Hover for descriptions · let go of Alt to look around' : 'Click, or press any key, to look around · hold Alt to use the mouse';
  $('look-hint').classList.toggle('hidden', locked() || chatOpen());
}
document.addEventListener('pointerlockchange', () => {
  if (!locked()) { firing = false; scoped = false; }
  drawLookHint();
});
canvas.addEventListener('mousedown', (e) => {
  if (!locked()) {
    if (!altFree) relock(); // a click takes the mouse back (it does not also shoot: you were not aiming); with Alt held, clicks are yours
    return;
  }
  if (e.button === 0) firing = true;
  if (e.button === 2 && me.cls === 'archer') scoped = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; if (e.button === 2) scoped = false; });
addEventListener('mousemove', (e) => {
  if (!locked()) { if (altFree) hoverAt(e.clientX, e.clientY); return; }
  const k = scoped ? 0.35 : 1;
  yaw += e.movementX * 0.0032 * k;
  pitch = Math.max(-0.6, Math.min(1.2, pitch + e.movementY * 0.0028 * k));
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- hover descriptions (hold Alt): skills, and beasts in the world
function showTip(html, x, y) {
  const t = $('tip');
  t.innerHTML = html;
  t.classList.remove('hidden');
  t.style.left = `${Math.min(innerWidth - t.offsetWidth - 8, x + 14)}px`;
  t.style.top = `${Math.max(8, y - t.offsetHeight - 10)}px`;
}
function hideTip() {
  $('tip').classList.add('hidden');
}
const tipV = new THREE.Vector3();
function hoverAt(x, y) {
  if (document.elementFromPoint(x, y) !== canvas) return; // over the HUD: its own descriptions
  const list = net ? seenBeasts : nearBeasts;
  let best = null, bd = 34 * 34;
  for (const b of list) {
    if (b.dead || (b.x - me.x) ** 2 + (b.z - me.z) ** 2 > 60 * 60) continue;
    tipV.set(b.x, (b.tall || 1.8) * 0.55, b.z).project(view.camera);
    if (tipV.z > 1) continue;
    const sx = ((tipV.x + 1) / 2) * innerWidth, sy = ((1 - tipV.y) / 2) * innerHeight;
    const d = (sx - x) ** 2 + (sy - y) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return hideTip();
  const type = best.type || (world.beasts[best.id - 1] && world.beasts[best.id - 1].type);
  const def = BEASTS[type];
  if (!def) return hideTip();
  const hp = Math.round((best.hp ?? 1) * def.hp);
  showTip(`<b>${def.name}</b><br>${hp.toLocaleString()} / ${def.hp.toLocaleString()} health<br><span>Hits for ${def.dmg}, every ${def.every} s · fights within ${def.aggro} m of you</span>`, x, y);
}
$('skills').addEventListener('mouseover', (e) => {
  const sk = e.target.closest && e.target.closest('.sk');
  if (!sk) return;
  const k = sk.id.slice(3), kit = KITS[me.cls];
  const s = k === 'basic' ? kit.basic : kit[k];
  const r = sk.getBoundingClientRect();
  const what = k === 'basic' ? (me.cls === 'warrior' ? 'Cut in front of you (hold left click).' : 'Shoot where the crosshair is (hold left click).') : s.text;
  showTip(`<b>${s.name}</b> <span>${k === 'basic' ? 'left click' : k}</span><br>${what}<br><span>${k === 'basic' ? `every ${s.every} s · no mana` : `${s.mana} mana · ${s.cd} s cooldown`}</span>${k === 'basic' ? `<br><em>${kit.passive}</em>` : ''}`, r.left, r.top);
});
$('skills').addEventListener('mouseout', hideTip);
addEventListener('wheel', (e) => { dist = Math.max(2.4, Math.min(11, dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });

/** Where the crosshair points, on the ground (looking up: straight ahead, 45 m off). */
const aimDir = new THREE.Vector3();
function aimPoint() {
  view.camera.getWorldDirection(aimDir);
  const c = view.camera.position;
  if (aimDir.y < -0.02) {
    const t = -c.y / aimDir.y;
    const x = c.x + aimDir.x * t, z = c.z + aimDir.z * t;
    if ((x - me.x) ** 2 + (z - me.z) ** 2 < 70 * 70) return { x, z };
  }
  const h = Math.hypot(aimDir.x, aimDir.z) || 1;
  return { x: me.x + (aimDir.x / h) * 45, z: me.z + (aimDir.z / h) * 45 };
}
function act(k) {
  if (!world.ready(me, k)) return;
  const a = aimPoint();
  world.act(1, k, a.x, a.z); // here at once (together, a guess the server confirms)
  if (net && net.ready) net.send({ t: 'act', k, ax: +a.x.toFixed(2), az: +a.z.toFixed(2) });
}

function wish() {
  const f = (k) => (keys.has(k) ? 1 : 0);
  const fwd = f('KeyW') + f('ArrowUp') - f('KeyS') - f('ArrowDown');
  const side = f('KeyD') + f('ArrowRight') - f('KeyA') - f('ArrowLeft');
  const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -Math.sin(yaw), rz = Math.cos(yaw);
  let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const pace = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 'sprint' : walking ? 'walk' : 'run';
  return { mx, mz, pace: scoped ? 'walk' : pace };
}

// ---- messages
let noteT = 0;
function note(text) {
  $('note').textContent = text;
  $('note').classList.remove('hidden');
  noteT = 4;
}
let hurtT = 0;
dress(hero, startCls);
drawSkills();
drawLink();

// ---- the loop
function resize() {
  view.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
let last = performance.now(), acc = 0, time = 0, heroX = me.x, heroZ = me.z, heroY = 0, prevY = 0, fov = 62;
const prev = { x: me.x, z: me.z };
const perf = { frames: 0, t: 0, fps: 0, worst: 0, worstNow: 0, simMs: 0, simN: 0, simShown: 0 };
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), proj = new THREE.Vector3();
const seenBeasts = [], nearBeasts = [];
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  perf.worstNow = Math.max(perf.worstNow, dt * 1000);
  acc += dt;
  if (firing && !me.dead) act('basic');
  if (me.cls !== 'archer') scoped = false;
  const w = wish();
  const s0 = performance.now();
  while (acc >= TICK) {
    prev.x = me.x; prev.z = me.z; prevY = me.y;
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
  heroX = prev.x + (me.x - prev.x) * alpha;
  heroZ = prev.z + (me.z - prev.z) * alpha;
  const hx = heroX, hz = heroZ;
  // together: say where you are, ten times a second (and see how long the server takes to answer, now and then)
  if (net && net.ready && now - net.sentAt >= 1000 / SEND_HZ) {
    net.sentAt = now;
    net.send({ t: 'pos', x: +me.x.toFixed(3), z: +me.z.toFixed(3), f: +me.facing.toFixed(3), m: me.moving ? 1 : 0, p: me.pace });
    if (now - net.pingAt > 2000) { net.pingAt = now; net.send({ t: 'ping', at: now }); }
  }
  // what happened here (together, only your own shots and blows: the server tells you the rest)
  for (const ev of world.events.splice(0)) {
    if (net && !((ev.type === 'shot' || ev.type === 'cast') && ev.pid === 1)) continue;
    if (net && ev.pid === 1) ev.pid = net.pid;
    if (bots.some((b) => b.pid === ev.pid)) continue;
    onEvent(ev);
  }
  // your hero (hidden down the scope)
  hero.group.position.set(hx, 0, hz);
  hero.group.rotation.y = Math.PI / 2 - me.facing;
  hero.group.visible = !scoped;
  heroY = prevY + (me.y - prevY) * alpha;
  pose(hero, dt, { moving: me.moving, speed: me.speed, walk: me.pace === 'walk' && me.moving, dead: me.dead, y: heroY });
  // the camera: over the right shoulder (or, scoped, through the hero's eyes), kept above the ground
  const lx = Math.cos(yaw) * Math.cos(pitch), ly = -Math.sin(pitch), lz = Math.sin(yaw) * Math.cos(pitch);
  const rx = -Math.sin(yaw), rz = Math.cos(yaw);
  if (scoped) {
    camPos.set(hx + Math.cos(yaw) * 0.3, 1.62 + heroY, hz + Math.sin(yaw) * 0.3);
    view.camera.position.copy(camPos);
    view.camera.lookAt(camPos.x + lx * 10, camPos.y + ly * 10, camPos.z + lz * 10);
  } else {
    camTarget.set(hx + rx * 0.7, 1.55 + heroY * 0.6, hz + rz * 0.7); // (follows a hop a little, not all the way: less bobbing)
    camPos.set(camTarget.x - lx * dist, camTarget.y - ly * dist, camTarget.z - lz * dist);
    if (camPos.y < 0.35) camPos.y = 0.35;
    view.camera.position.copy(camPos);
    view.camera.lookAt(camTarget.x + lx * 10, camTarget.y + ly * 10, camTarget.z + lz * 10);
  }
  fov += ((scoped ? 26 : 62) - fov) * Math.min(1, dt * 12);
  if (Math.abs(view.camera.fov - fov) > 0.05) { view.camera.fov = fov; view.camera.updateProjectionMatrix(); }
  $('scope').style.display = scoped ? 'block' : 'none';
  $('cross').classList.toggle('scoped', scoped);
  // the land round you, its beasts, its people, the other players
  view.stream(hx, hz);
  view.followSun(hx, hz);
  view.clearView(hx, hz, view.camera.position.x, view.camera.position.z);
  let fxBeasts;
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
    fxBeasts = seenBeasts;
    for (const [pid, o] of others) {
      const s = seen.get(PLAYER_ID + pid);
      o.hero.group.visible = !!s;
      if (!s) { o.label.style.display = 'none'; continue; }
      o.hero.group.position.set(s.x, 0, s.z);
      o.hero.group.rotation.y = Math.PI / 2 - s.facing;
      pose(o.hero, dt, { moving: s.moving, speed: 5.6, dead: s.dead });
      proj.set(s.x, 2.35, s.z).project(view.camera);
      const off = proj.z > 1 || Math.hypot(s.x - hx, s.z - hz) > 60;
      o.label.style.display = off ? 'none' : '';
      if (!off) o.label.style.transform = `translate(${((proj.x + 1) / 2) * innerWidth}px, ${((1 - proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    }
  } else {
    view.drawBeasts(hx, hz, alpha, time);
    nearBeasts.length = 0;
    for (const b of world.beasts) if (!b.dead && (b.x - hx) ** 2 + (b.z - hz) ** 2 < 60 * 60) nearBeasts.push({ id: b.id, x: b.x, z: b.z, r: BEASTS[b.type].r, hp: b.hp / b.maxHp, dead: b.dead, tall: b.type === 'golem' ? 2.9 : 1.8 });
    fxBeasts = nearBeasts;
  }
  fx.update(dt, fxBeasts, view.camera, innerWidth, innerHeight, me.rage > 0, hx, hz);
  crowd.update(dt, hx, hz, time);
  const m = new THREE.Matrix4();
  bots.forEach((b, i) => { const p = world.players.get(b.pid); botMesh.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z)); });
  botMesh.instanceMatrix.needsUpdate = true;
  view.render();
  drawHud();
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
        `at ${me.x.toFixed(0)}, ${me.z.toFixed(0)} · ${groundAt(me.x, me.z)} · ${NAMES[me.cls]}`,
      ].join('<br>');
    }
  }
}
requestAnimationFrame(frame);
note('Click to look around. Left click to attack, Q E R for skills, 1-2 to change class. Space to jump. Hold Alt to use the mouse (hover for descriptions).');
window.land = { world, view, crowd, me, fx, setYaw: (y) => (yaw = y), setPitch: (p) => (pitch = p), addBot, wear, joinServer, act, aimPoint, others, seen, get net() { return net; } }; // (tests)
