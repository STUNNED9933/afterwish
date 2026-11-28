// Lacuna (Chapter 2): the test land, its own page (lacuna.html), apart from the game.
//
// Walk and fight on the land round Sunmere over the shoulder, alone (everything runs here) or together on the
// server world (the server runs the land, its beasts and every blow: see room.js).
// Keys: WASD move, mouse look (click to capture), left click attack (hold), Q E R skills, right click (hold)
// scope (Sharpshooter), Shift sprint, Ctrl walk, wheel zoom, 1-2 swap class, L try other Eternal levels
// (alone), Enter chat (together), B add a test player (alone), F3 overlay.
import { levelOf, QUEST_XP, TRICK_XP, STORY_BEAST, pointsAt } from './levels.js';
import { WebUI } from './webui.js';
import { GearUI, BAG_MOST } from './gearui.js';
import { gradeOf, itemName, salvageValue, UNIQUE, RIFT, RIFT_AT, BOSSES } from './loot.js';
import { makeRng } from '../sim/rng.js';
import * as THREE from 'three';
import { LandWorld, TICK, WAKE, KITS, LACUNA_CLASSES, LINK_SLOTS, linkFrom, linkPower, linkMult, JUMP } from './sim.js';
import { LandView, DRAW } from './view.js';
import { Crowd } from './crowd.js';
import { Fx } from './fx.js';
import { groundAt, BEASTS, CRYSTAL, TRAINING, WELL, WATCHTOWER } from './land.js';
import { placeBuilding } from '../render/buildings.js';
import { loadRigged, loadWeapon, instantiate, RIGGED, preload } from '../render/rigged.js';
import { Interest, SEND_HZ, apply, decode, PLAYER_ID } from './net.js';
import { LACUNA_NET } from './room.js';
import { SERVERS } from '../net/servers.js';
import { Cutscene } from './cutscene.js';
import { Actor } from './actor.js';
import { beastGeometry } from './view.js';
import { openingPull, openingWolves, openingTear, TEAR, KEEPSAKE, GLADE_EDGE, HOME, WOODPILE, WELL_AT, HERBS, RUN_ROUTE, HOME_SPOTS, VIGOUR, DAY_FOG, DAYS, lessonScene, nightScene, yearScene, vesperScene, deathScene, afterScene, thessalyScene, askingScene, springScene, reportScene, CONTRACTS, letterScene, towerScene, circleScene, WARDS, FOES, MAIN_STORY, SIDE_QUESTS, BOUNTIES, bountyXp, follow, ASHEN_AT, VESPER, VESPER_FROM, walkToTown, loadStory, saveStory, QUESTS, ROAD_IN, atGuild, crystalScene, atTraining, trainingScene, TRIALS } from './story.js';
import { buildCrack } from '../render/gates.js';
import { buildTellingGlass } from './guild.js';
import { EMOTES, EMOTICONS, EMOTICON_NAMES, emoteClip, drawEmoticon } from './emotes.js';

const $ = (id) => document.getElementById(id);
const canvas = $('land');
const params = new URLSearchParams(location.search);
const TIMESCALE = Math.max(0.25, Math.min(4, Number(params.get('timescale')) || 1)); // (tests on slow machines: ?timescale=3)
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
// (0.99.23) he starts with his fists; a weapon once Rowan hands him one (the trial), then the path he chose
const saved = loadStory();
const ownCls = saved.path || (saved.trial === 'warrior' || saved.trial === 'archer' ? saved.trial : 'novice');
const startCls = LACUNA_CLASSES.includes(params.get('cls')) ? params.get('cls') : ownCls;
// (0.99.22) the Link sleeps until the story wakes it (?link=1 wakes it early, for testing)
let linkAwake = params.get('link') === '1' || !!saved.linked;
// (0.99.24) how strong he has grown: weak through the tear, stronger each day with the Hounds
const startVig = ['new', 'stumble', 'rescued', 'waking'].includes(saved.stage || 'new') ? VIGOUR[0] : saved.stage === 'days' ? VIGOUR[Math.min(VIGOUR.length - 1, saved.day || 0)] : 1;
// (0.99.36) experience and level: from the story so far, for a save made before there were levels
const STAGE_ORDER = ['new', 'stumble', 'rescued', 'waking', 'asking', 'days', 'crystal', 'path', 'ambush', 'hunt', 'mourning', 'contracts', 'report', 'invitation', 'tower', 'wards', 'act2'];
if (saved.xp === undefined) {
  const at = STAGE_ORDER.indexOf(saved.stage || 'new');
  saved.xpq = {};
  saved.xp = 0;
  for (const st of STAGE_ORDER.slice(0, Math.max(0, at))) if (QUEST_XP[st]) { saved.xp += QUEST_XP[st]; saved.xpq[st] = true; }
  saved.xp += Object.keys(saved.tricks || {}).length * TRICK_XP;
}
const me = world.addPlayer(1, undefined, { cls: startCls, link: linkNow(), linked: linkAwake, vigour: startVig, level: levelOf(saved.xp).level });
const view = new LandView(canvas, world);
const crowd = new Crowd(view.scene, 150);
const fx = new Fx(view.scene, $('fxlayer'));
// (alone) what a server would send you: made here 10 times a second and measured
const wire = new Interest(1), mirror = new Map();
let wireTick = 0, wireBytes = 0, wireRate = 0;
let linkFromLabel = TRY[tryAt] === null ? 'your Eternal gear on this browser' : '';

// ---- heroes: yours, and (together) everyone else's, each in their class's real model
const NAMES = { novice: 'Unarmed', warrior: 'Berserker', archer: 'Sharpshooter' }; // (working names)
const HERO_H = 1.0; // (0.99.23) he is a small boy: about a metre tall
const standGeo = new THREE.CapsuleGeometry(0.2, 0.55, 4, 8).translate(0, 0.48, 0);
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
  const id = 'kid_' + cls; // (0.99.23) everyone in Lacuna is the small hero in rags, for now
  if (!RIGGED[id]) return;
  Promise.all([loadRigged(id), loadWeapon(cls, RIGGED[id].weaponScale || 1)]).then(([tpl, made]) => {
    if (!tpl || token !== h.token || h.gone) return;
    const rig = instantiate(tpl);
    h.clipNames = Object.keys(tpl.clips);
    h.clipLen = (n) => (tpl.clips[n] ? tpl.clips[n].duration : 1);
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
  else if (ev.skill === 'whirlEnd') a.spinT = 0;
  else if (ev.skill === 'roll') { a.move = 'dash'; a.moveDur = ev.dur; }
  else if (ev.skill === 'ricochet') { a.start = true; a.period = 0.6; }
  else if (ev.skill === 'deadeye') a.move = 'aimHold';
  else if (ev.skill === 'loose') a.move = 'loose';
  else if (ev.skill === 'oath') a.move = 'cone';
  else if (ev.skill === 'jump') { a.jumpT = 0; a.move = 'hop'; }
  // (0.99.35) moving well: each push off the air is a hop again; the slide crouches low for its length
  else if (ev.skill === 'jump2' || ev.skill === 'kick' || ev.skill === 'bounce' || ev.skill === 'recoil' || ev.skill === 'slideJump') { a.jumpT = 0; a.move = 'hop'; }
  else if (ev.skill === 'slide') { a.move = 'slide'; a.moveDur = ev.dur; }
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
  // (the opening) lying in the grass, once the model is in. (0.99.34) Kept so: laid down again on any new model
  // (leaving a server world re-dresses him as he was there), and nothing else (a landing, a hop) gets him up
  // before the scene says 'rise'
  if (a.lie) {
    if (h.rig && a.lieRig !== h.rig) { a.move = 'lie'; a.lieRig = h.rig; }
    else if (a.move && a.move !== 'lie') a.move = null;
  } else a.lieRig = null;
  const air = a.lie ? 0 : s.y !== undefined ? s.y : a.jumpT >= 0 ? hopAt(a.jumpT) : 0;
  h.body.position.y = air;
  if (a.air > 0.05 && air <= 0.001 && !a.move) a.move = 'land'; // touching down
  a.air = air;
  if (a.spinT > 0) { a.spinT -= dt; h.body.rotation.y += dt * 16; } else h.body.rotation.y = 0;
  if (!h.rig) return;
  // an emote: until it ends, or the hero moves, attacks or casts
  let emote = null, emoteOnce = false, emoteStart = false;
  if (a.em) {
    const e = a.em;
    if (s.moving || a.start || a.move || a.spinT > 0 || s.dead) a.em = null;
    else {
      if (!e.clip) { e.clip = emoteClip(h.clipNames, e.def.clip); e.len = e.def.len || (e.clip ? h.clipLen(e.clip) : 0); e.once = !!e.def.once || !!e.def.then; e.start = true; }
      if (!e.clip) a.em = null;
      else {
        e.t += dt;
        if (e.t >= e.len && e.once) {
          const next = e.def.then && emoteClip(h.clipNames, e.def.then);
          if (next) { e.clip = next; e.once = false; e.start = true; e.t = 0; e.len = Infinity; } else a.em = null;
        }
        if (a.em) { emote = e.clip; emoteOnce = e.once; emoteStart = e.start; e.start = false; }
      }
    }
  }
  h.rig.update(dt, { ...s, emote, emoteOnce, emoteStart, walkAs: a.carry ? 'ual_Walk_Carry_Loop' : null, attackStart: a.start, attackDur: Math.min(0.4, a.period * 0.6), period: h.cls === 'archer' ? a.period : 0, move: a.move, moveDur: a.moveDur, spinning: a.spinT > 0, hitStart: a.hit });
  a.start = false;
  a.move = null;
  a.hit = false;
}
const hero = makeHero();
function wear(cls, force = false) {
  if (trial && !force) return note('Finish the trial first (your teacher has handed you the weapon).');
  if (!force && !story.path && cls !== 'novice') return note('You have no weapon yet. (The Iron Hounds will see to that.)');
  if (!KITS[cls]) return note('Pyromancer, Assassin and the other classes come later: the opening has the Berserker and the Sharpshooter.');
  if (hero.cls === cls) return;
  dress(hero, cls);
  world.setClass(1, cls);
  if (net && net.ready) net.send({ t: 'cls', cls });
  applyWeb(); // (0.99.37) that path's talents
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
  if (cutscene.active) return mpStatus('After the scene.');
  const name = $('mp-name').value.trim(), pass = $('mp-pass').value.trim();
  if (!pass) return mpStatus('Type the server world\'s passcode (the one friends use for Haven).');
  try { localStorage.setItem('lacuna-name', name); } catch (err) { /* private window */ }
  mpStatus('Connecting…');
  let ws;
  try { ws = new WebSocket(serverBase() + '/lacuna'); } catch (err) { return mpStatus('That server address does not look right.'); }
  ws.binaryType = 'arraybuffer';
  net = { ws, ready: false, pid: 0, bytes: 0, ping: 0, sentAt: 0, pingAt: 0, send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  ws.onopen = () => net.send({ t: 'hello', v: LACUNA_NET, pass, name, cls: hero.cls, session: session(), link: linkNow(), linked: linkAwake, vigour: me.vigour, level: me.level, web: webOf(), worn: gear().worn });
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
        if (!s.marked && !u.player) { s.marked = true; Object.assign(s, marks.get(u.id) || NO_MARK); }
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
      sendProgress(); // (0.99.38) kept with your account, if you are signed in
      note('You are on the shared land. Friends who join appear here, at the south gate.');
    } else if (msg.t === 'reject') mpStatus(msg.reason);
    else if (msg.t === 'roster') roster(msg.players);
    else if (msg.t === 'snap') { me.x = prev.x = msg.x; me.z = prev.z = msg.z; }
    else if (msg.t === 'me') {
      // the server's word on your health, mana and cooldowns (your page guessed them a moment early)
      const [hp, maxHp, mp, maxMp, q, e, r, oath, down, mult] = msg.v;
      Object.assign(me, { hp, maxHp, mp, maxMp, oath: !!oath, mult });
      for (const [k, v] of [['Q', q], ['E', e], ['R', r]]) if (Math.abs(me.cd[k] - v) > 0.35) me.cd[k] = v;
      if (down && !me.dead) { me.dead = true; me.downT = down; me.leap = me.roll = me.whirl = me.draw = null; }
      if (!down && me.dead) me.dead = false;
    } else if (msg.t === 'evs') for (const ev of msg.list) onEvent(ev);
    else if (msg.t === 'progress') takeProgress(msg); // (0.99.38) your account's (further on than this browser)
    else if (msg.t === 'marks') { // (1.1) which beasts in sight are elites, named, bosses or a rift's foes
      marks.clear();
      for (const [id, rank, name, look, size, lv] of msg.m || []) marks.set(id, { rank, name, look, size, lv });
      for (const [id, s] of seen) if (!s.player) Object.assign(s, marks.get(id) || NO_MARK);
    } else if (msg.t === 'riftNo') toast('The rift will not open', 'Someone\'s rift is already open here, or you are not in the circle');
    else if (msg.t === 'air') for (const [pid, y] of msg.a) airOf.set(pid, { y: y / 100, at: performance.now() }); // (0.99.35) who is off the ground, how high
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
  if (trial) trialEvent(ev);
  huntEvent(ev);
  trickEvent(ev);
  bountyEvent(ev);
  gearEvent(ev);
  if (ev.type === 'die' && ev.story === 'unbound') showQuest(); // (1.0) a ward's guard down
  vesperEvent(ev);
  contractEvent(ev);
  if (ev.type === 'shot') {
    // (0.99.27) from his bow, jumping or not; (0.99.28) yours climb onto the crosshair's line
    const h = heroOf(ev.pid);
    let ray = null;
    if (isMe(ev.pid) && !cutscene.active) { view.camera.getWorldDirection(aimDir); const c = view.camera.position; ray = { x: c.x, y: c.y, z: c.z, dx: aimDir.x, dy: aimDir.y, dz: aimDir.z }; }
    fx.shot(h ? { ...ev, y: h.group.position.y + 0.62, ray } : ev);
  }
  else if (ev.type === 'cast') { const h = heroOf(ev.pid); if (h) animate(h, ev); if (ev.arc) fx.arc(ev.x, ev.z, ev.f, ev.r, ev.arc); }
  else if (ev.type === 'emote') { const h = heroOf(ev.pid); if (h) startEmote(h, ev.id); }
  else if (ev.type === 'face') { const h = heroOf(ev.pid); if (h) showFace(h, ev.id); }
  else if (ev.type === 'slam') fx.ring(ev.x, ev.z, ev.r, 0xffb347, 0.5);
  else if (ev.type === 'hit' && ev.shot) { fx.landed(ev.x, ev.z); fx.number(ev.x, ev.z, ev.crit ? `${ev.dmg}!` : String(ev.dmg), isMe(ev.pid) && (ev.crit || ev.dmg > 300) ? 'big' : 'dealt'); }
  else if (ev.type === 'hit') fx.number(ev.x, ev.z, ev.crit ? `${ev.dmg}!` : String(ev.dmg), isMe(ev.pid) && (ev.crit || (ev.shot && ev.dmg > 300)) ? 'big' : 'dealt');
  else if (ev.type === 'blood' && isMe(ev.pid)) fx.number(heroX, heroZ, `-${ev.n}`, 'taken'); // (0.99.21) a Berserker's blood price
  else if (ev.type === 'die') { fx.puff(ev.x, ev.z); if (isMe(ev.pid)) { note(`${BEASTS[ev.kind] ? BEASTS[ev.kind].name : 'It'} falls.`); gainXp((ev.xp || 0) * (ev.story ? STORY_BEAST : 1)); } } // (0.99.36) and its experience
  else if (ev.type === 'aggro' && isMe(ev.pid)) { const t = net ? seen.get(ev.id) : world.beasts[ev.id - 1]; note(`A ${t && t.type ? BEASTS[t.type].name : 'beast'} is coming for you.`); }
  else if (ev.type === 'swipe') {
    if (ev.id) view.swiped(ev.id); // (0.99.29) a beast with a body swings it
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
    if (!s) continue; // (unarmed: no skills yet)
    const d = document.createElement('div');
    d.className = 'sk';
    d.id = 'sk-' + k;
    d.title = s.text || '';
    d.innerHTML = `<span class="k">${key}</span><b>${s.name}</b><em>${k === 'basic' ? 'no mana' : s.manaText ? (s.mana ? `${s.mana}+ mana` : 'toggle') : `${s.mana} mana`}</em><div class="cd"></div><div class="n"></div>`;
    $('skills').appendChild(d);
  }
}
function drawLink() {
  if (!linkAwake) { $('link').textContent = 'Dimension Link: asleep · something is missing'; return; }
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
  const lv = levelOf(story.xp || 0);
  $('xpb').firstChild.style.width = `${lv.need ? (lv.into / lv.need) * 100 : 100}%`;
  $('xpb').lastChild.textContent = lv.need ? `Level ${lv.level} · ${lv.into} / ${lv.need} xp` : `Level ${lv.level} (the most there is)`;
  for (const k of ['basic', 'Q', 'E', 'R']) {
    const el = $('sk-' + k);
    if (!el) continue;
    const s = k === 'basic' ? kit.basic : kit[k];
    const left = k === 'basic' ? Math.max(0, me.basicT) : Math.max(0, me.cd[k]);
    const full = k === 'basic' ? kit.basic.every : s.cd;
    el.querySelector('.cd').style.height = `${Math.min(1, left / full) * 100}%`;
    // (0.99.21) a Deadeye being drawn shows the mana poured in; a skill only blood can pay for shows red
    const pouring = k === 'R' && me.draw;
    el.querySelector('.n').textContent = pouring ? `+${Math.round(me.draw.poured)}` : left > 0.95 ? Math.ceil(left) : '';
    const short = k !== 'basic' && me.mp < s.mana;
    el.classList.toggle('dry', short && !world.canPay(me, s.mana));
    el.classList.toggle('blood', short && world.canPay(me, s.mana));
    el.classList.toggle('on', (k === 'E' && !!me.whirl) || (k === 'R' && (!!me.oath || !!me.draw)));
  }
  $('hp').classList.toggle('bloodied', world.bloodied(me));
  $('down').style.display = me.dead ? 'flex' : 'none';
  if (me.dead) $('down-t').textContent = `Getting up at Sunmere's gate in ${Math.max(0, Math.ceil(me.downT))} s`;
}

// ---- input
const keys = new Set();
let yaw = -Math.PI / 2, pitch = 0.26, dist = 3.3, overlay = true, firing = false, scoped = false;
let walking = false; // Ctrl (or C) toggles walking: held, Ctrl sets off the browser's own shortcuts
let altFree = false; // Alt held: the mouse is yours (hover for descriptions); let go and it looks around again
const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
const locked = () => document.pointerLockElement === canvas;
const chatOpen = () => !$('chat-in').classList.contains('hidden');
/** Take the mouse back for looking (needs a key or a click: browsers only allow it then). */
function relock() {
  if (locked() || altFree || chatOpen() || webUI.open || ['journal', 'board', 'gear', 'riftpick'].some((id) => !$(id).classList.contains('hidden')) || !canvas.requestPointerLock) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (err) {
    /* refused (too soon after Esc): the next key or click tries again */
  }
}
addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (cutscene.active) {
    // a scene is playing: Space/E/Enter for its lines and prompts, Esc to skip; nothing else
    if (!e.repeat) cutscene.key(e.code);
    if (e.code !== 'F12') e.preventDefault();
    return;
  }
  if (e.key === 'Alt') {
    e.preventDefault(); // (Alt alone would open the browser's menu)
    if (!altFree) { altFree = true; firing = false; scoped = false; if (locked()) document.exitPointerLock(); drawLookHint(); }
    return;
  }
  // back from another tab or window: any game key takes the mouse again (Esc and the F keys do not)
  if (!locked() && e.code !== 'Escape' && e.code !== 'KeyP' && e.code !== 'KeyJ' && e.code !== 'KeyI' && !webUI.open && !/^F\d+$/.test(e.code)) relock(); // ((0.99.37) not for the talent web: it wants the mouse)
  if (e.repeat && (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC')) return;
  keys.add(e.code);
  // (0.99.35) C, running: a slide (and Space out of it, a long leap). Otherwise C (or Ctrl) walks, or runs again.
  if (e.code === 'KeyC' && !walking && me.moving && !cutscene.active && world.slide(1)) { if (net && net.ready) net.send({ t: 'slide' }); }
  else if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') { walking = !walking; note(walking ? 'Walking (Ctrl or C to run again).' : 'Running.'); }
  if (e.code === 'F3') { overlay = !overlay; $('stats').classList.toggle('hidden', !overlay); e.preventDefault(); }
  if (e.code === 'KeyB') addBot();
  if (e.code === 'KeyH') { showTricks(); $('tricks').classList.toggle('hidden'); } // (0.99.35) the tricks
  if (e.code === 'KeyP') toggleWeb(); // (0.99.37) the talent web
  if (e.code === 'KeyJ') toggleJournal(); // (1.0) the journal: what you are doing, and what you could
  if (e.code === 'KeyI') toggleGear(); // (1.1) gear
  if (e.code === 'KeyF') { const u = nearestUse(); if (u) u.fn(); }
  if (e.code === 'KeyL') {
    if (!linkAwake) note('The Link is asleep. Something was torn out of you on the way here. (Testing: add ?link=1 to the address to wake it.)');
    else if (net && net.ready) note('Together, the server decides your Link (your account\'s Eternal gear if you are signed in).');
    else { tryAt = (tryAt + 1) % TRY.length; world.setLink(1, linkNow()); linkFromLabel = TRY[tryAt] === null ? 'your Eternal gear on this browser' : ''; drawLink(); note(TRY[tryAt] === null ? 'Your own Eternal gear again.' : `Trying Eternal level ${TRY[tryAt]} in every slot (beasts are tuned for 10).`); }
  }
  if ((e.code === 'KeyT' || e.code === 'KeyY') && !e.repeat && !wheel) { openWheel(e.code === 'KeyT' ? 'emote' : 'face'); return; }
  if (wheel) {
    const d = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].indexOf(e.code);
    if (d >= 0 && d < wheel.items.length) { pick(d); closeWheel(true); }
    return;
  }
  if ((e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'KeyR') && !e.repeat) act(e.code.slice(3));
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
  if (e.code === 'KeyE' || e.code === 'KeyR') letGo(e.code.slice(3)); // (0.99.21) a held Whirlwind or Deadeye
  if ((e.code === 'KeyT' && wheel && wheel.kind === 'emote') || (e.code === 'KeyY' && wheel && wheel.kind === 'face')) closeWheel(true);
  if (e.key === 'Alt') {
    e.preventDefault();
    altFree = false;
    hideTip();
    relock(); // (browsers allow it for a few seconds after a key press; held longer, the next key or click does it)
    drawLookHint();
  }
});
addEventListener('blur', () => { keys.clear(); firing = false; scoped = false; altFree = false; hideTip(); closeWheel(false); letGo('E'); letGo('R'); });
function drawLookHint() {
  $('look-hint').textContent = altFree ? 'Hover for descriptions · let go of Alt to look around' : 'Click, or press any key, to look around · hold Alt to use the mouse';
  $('look-hint').classList.toggle('hidden', locked() || chatOpen());
}
document.addEventListener('pointerlockchange', () => {
  if (webUI.open && locked()) { document.exitPointerLock(); return; } // (0.99.37) the talent web keeps the mouse
  if (!locked()) { firing = false; scoped = false; }
  drawLookHint();
});
canvas.addEventListener('mousedown', (e) => {
  if (cutscene.active) { cutscene.key('Click'); return; }
  if (!locked()) {
    if (!altFree) relock(); // a click takes the mouse back (it does not also shoot: you were not aiming); with Alt held, clicks are yours
    return;
  }
  if (e.button === 0) firing = true;
  if (e.button === 2 && me.cls === 'archer') scoped = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; if (e.button === 2) scoped = false; });
addEventListener('mousemove', (e) => {
  if (wheel && locked()) { wheelMove(e.movementX, e.movementY); return; } // pointing at the wheel, not looking round
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
  const what = k === 'basic' ? (me.cls === 'warrior' ? 'Cut in front of you (hold left click).' : me.cls === 'novice' ? 'Punch in front of you (hold left click). Small fists; better than nothing.' : 'Shoot where the crosshair is (hold left click).') : s.text;
  showTip(`<b>${s.name}</b> <span>${k === 'basic' ? 'left click' : k}</span><br>${what}<br><span>${k === 'basic' ? `every ${s.every} s · no mana` : `${s.manaText || `${s.mana} mana`} · ${s.cd} s cooldown`}</span>${k === 'basic' ? `<br><em>${kit.passive}</em>` : ''}`, r.left, r.top);
});
$('skills').addEventListener('mouseout', hideTip);
addEventListener('wheel', (e) => { dist = Math.max(1.6, Math.min(10, dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });

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
/**
 * (0.99.27) Where an attack goes: where the crosshair points, but never behind the hero or at his feet. (Looking
 * down from close behind him, the crosshair met the ground between him and the camera: his cut swung ahead and
 * landed on whatever was at his back.) Too near or behind, it is straight ahead along the camera's look instead.
 */
function attackPoint() {
  const a = aimPoint();
  view.camera.getWorldDirection(aimDir);
  const h = Math.hypot(aimDir.x, aimDir.z) || 1, fx0 = aimDir.x / h, fz0 = aimDir.z / h;
  if ((a.x - me.x) * fx0 + (a.z - me.z) * fz0 < 2) return { x: me.x + fx0 * 45, z: me.z + fz0 * 45 };
  return a;
}
/** A held skill let go (Whirlwind stops, Deadeye looses). */
function letGo(k) {
  if (!(k === 'E' && me.whirl) && !(k === 'R' && me.draw)) return;
  const a = attackPoint(); // (0.99.25) a Deadeye flies where you point when you let go (scoped or not)
  world.act(1, k, a.x, a.z, true);
  if (net && net.ready) net.send({ t: 'act', k, ax: +a.x.toFixed(2), az: +a.z.toFixed(2), up: true });
}
// while a Deadeye is drawn, it follows the aim (ten times a second to the server)
let aimSent = 0;
function followAim(dt) {
  if (!me.draw) return;
  const a = attackPoint();
  world.aim(1, a.x, a.z);
  aimSent -= dt;
  if (net && net.ready && aimSent <= 0) { aimSent = 0.1; net.send({ t: 'aim', ax: +a.x.toFixed(2), az: +a.z.toFixed(2) }); }
}
function act(k) {
  // the Oath is a toggle: pressed again, it ends (no mana, nothing to aim)
  if (k === 'R' && me.oath) {
    if (me.cd.R > 0) return;
    world.act(1, k, me.x, me.z);
    if (net && net.ready) net.send({ t: 'act', k, ax: +me.x.toFixed(2), az: +me.z.toFixed(2) });
    return;
  }
  if (!world.ready(me, k)) return;
  hero.anim.em = null;
  const a = attackPoint();
  // (0.99.35) a Shot aimed down from the air: the recoil
  const down = k === 'basic' && me.y > me.g + 0.3 && pitch > 0.45;
  world.act(1, k, a.x, a.z, false, down); // here at once (together, a guess the server confirms)
  if (net && net.ready) net.send({ t: 'act', k, ax: +a.x.toFixed(2), az: +a.z.toFixed(2), ...(down ? { down: true } : {}) });
}

function wish() {
  if (cutscene.active) return { mx: 0, mz: 0, pace: 'run' };
  const f = (k) => (keys.has(k) ? 1 : 0);
  const fwd = f('KeyW') + f('ArrowUp') - f('KeyS') - f('ArrowDown');
  const side = f('KeyD') + f('ArrowRight') - f('KeyA') - f('ArrowLeft');
  const fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -Math.sin(yaw), rz = Math.cos(yaw);
  let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const pace = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 'sprint' : walking ? 'walk' : 'run';
  if (story.stage === 'stumble' || hero.anim.carry) return { mx, mz, pace: 'walk' }; // (0.99.22) just through the tear he can barely walk; (0.99.24) nor run carrying
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

// ---- emotes and emoticons (hold T / Y for their wheels)
function startEmote(h, id) {
  const def = EMOTES.find((e) => e.id === id);
  if (def) h.anim.em = { def, t: 0, clip: null };
}
const faceTex = {};
const bubbles = [];
function faceTexture(id) {
  if (!faceTex[id]) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    drawEmoticon(c.getContext('2d'), id, 128);
    faceTex[id] = new THREE.CanvasTexture(c);
    faceTex[id].colorSpace = THREE.SRGBColorSpace;
  }
  return faceTex[id];
}
function showFace(h, id) {
  if (!EMOTICONS.includes(id)) return;
  for (const b of bubbles) if (b.h === h) b.t = 99; // one at a time over each head
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTexture(id), transparent: true, depthWrite: false }));
  sp.position.set(0.35, 2.55, 0);
  sp.renderOrder = 10;
  h.group.add(sp);
  bubbles.push({ h, sp, t: 0 });
}
function updateBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.t += dt;
    const pop = b.t < 0.18 ? b.t / 0.18 : 1;
    const k = 0.75 * (pop < 1 ? 0.4 + 0.75 * pop : 1 + Math.sin(b.t * 5) * 0.03);
    b.sp.scale.set(k, k, k);
    b.sp.position.y = 2.55 + Math.min(b.t, 0.3) * 0.4;
    b.sp.material.opacity = b.t > 2.7 ? Math.max(0, 1 - (b.t - 2.7) / 0.3) : 1;
    if (b.t >= 3 || !b.h.group.parent) { b.h.group.remove(b.sp); b.sp.material.dispose(); bubbles.splice(i, 1); }
  }
}
function doEmote(id) {
  if (me.dead || cutscene.active) return;
  const def = EMOTES.find((e) => e.id === id);
  if (!def || !emoteClip(hero.clipNames, def.clip)) return note(`${def ? def.name : 'That'} comes with the next update (its animation is still being made).`);
  startEmote(hero, id);
  if (net && net.ready) net.send({ t: 'emote', id });
}
function doFace(id) {
  if (me.dead || cutscene.active) return;
  showFace(hero, id);
  if (net && net.ready) net.send({ t: 'face', id });
}
// the wheel: items round a circle; point with the mouse (or press a number), let go of the key to choose
let wheel = null;
function openWheel(kind) {
  const items = kind === 'emote' ? EMOTES.map((e) => ({ id: e.id, label: e.name, ok: !!emoteClip(hero.clipNames, e.clip) })) : EMOTICONS.map((id) => ({ id, label: EMOTICON_NAMES[id], icon: true, ok: true }));
  const el = $('wheel');
  el.innerHTML = `<div class="hub" id="wheel-hub">${kind === 'emote' ? 'Emotes' : 'Emoticons'}</div>`;
  items.forEach((it, i) => {
    const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
    const d = document.createElement('div');
    d.className = 'slot' + (it.ok ? '' : ' off');
    d.style.left = `${50 + Math.cos(a) * 38}%`;
    d.style.top = `${50 + Math.sin(a) * 38}%`;
    if (it.icon) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      drawEmoticon(c.getContext('2d'), it.id, 64);
      d.appendChild(c);
    }
    d.appendChild(Object.assign(document.createElement('span'), { textContent: `${(i + 1) % 10} ${it.label}` }));
    d.addEventListener('mouseenter', () => pick(i));
    d.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); closeWheel(true); });
    el.appendChild(d);
  });
  el.classList.remove('hidden');
  wheel = { kind, items, sel: -1, vx: 0, vy: 0 };
}
function pick(i) {
  if (!wheel) return;
  wheel.sel = i;
  [...$('wheel').querySelectorAll('.slot')].forEach((d, k) => d.classList.toggle('on', k === i));
  $('wheel-hub').textContent = wheel.items[i] ? wheel.items[i].label : '';
}
function closeWheel(choose) {
  if (!wheel) return;
  const w = wheel;
  wheel = null;
  $('wheel').classList.add('hidden');
  if (!choose || w.sel < 0) return;
  const it = w.items[w.sel];
  if (w.kind === 'emote') doEmote(it.id);
  else doFace(it.id);
}
function wheelMove(dx, dy) {
  if (!wheel) return;
  wheel.vx = Math.max(-120, Math.min(120, wheel.vx + dx));
  wheel.vy = Math.max(-120, Math.min(120, wheel.vy + dy));
  if (Math.hypot(wheel.vx, wheel.vy) < 25) return;
  const a = Math.atan2(wheel.vy, wheel.vx) + Math.PI / 2;
  const n = wheel.items.length;
  pick(((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n);
}

// ---- the story (Act I): the opening, then the Iron Hounds walking you to Sunmere
// (0.99.20) the Guild's reading crystal, in its yard north of the plaza
const crystal = buildTellingGlass(CRYSTAL); // (0.99.22) the Telling Glass (where the crystal stood)
view.scene.add(crystal.group);
const cutscene = new Cutscene({
  view, fx, $, me, hero, land: world.land, crystal, rift: null, fog: (l, d) => setFog(l, d), flash: (t, h) => memoryFlash(t, h),
  beastMesh: (type) => { const m = new THREE.Mesh(beastGeometry(type), view.mats.beast); m.castShadow = true; return m; },
  snapHero: () => { prev.x = me.x; prev.z = me.z; },
  hurt: () => { hurtT = 0.5; },
  heal: () => { me.hp = me.maxHp; },
  onEnd(fn) { cutscene.endFn = fn; },
});
let story = params.get('story') === 'new' ? { stage: 'new' } : loadStory();
if (story.xp === undefined) { story.xp = saved.xp || 0; story.xpq = saved.xpq || {}; } // (0.99.36) filled in from the story so far
setTimeout(() => applyWeb(), 0); // (0.99.37) your talents
let questRun = null;
const company = {};
// ---- (1.0) quest kinds, the journal (J), the Guild's board and its bounties
const KIND = {
  main: { name: 'Main Story', icon: '✦', note: 'Follow these to see what happens next.' },
  feature: { name: 'New Content', icon: '✚', note: 'Something new to learn or use. Worth doing once.' },
  side: { name: 'Side Quest', icon: '!', note: 'Experience and rewards. Safe to skip.' },
  repeat: { name: 'Repeatable', icon: '↻', note: 'Can be done again and again, for experience.' },
};
const many = (t) => ({ wolf: 'Mossback Wolves', hog: 'Thornhogs', golem: 'Cairn Golems' })[t] || `${BEASTS[t].name}s`;
const kindTag = (k) => `<i class="qk ${k}">${KIND[k].icon}</i>`;
function showQuest() {
  showMain();
  showSide();
  if (!$('journal').classList.contains('hidden')) drawJournal();
}
/** The side tracker: a bounty in hand (and how far along). */
function showSide() {
  if (ashRift) {
    $('side-quest').classList.toggle('hidden', cutscene.active);
    $('side-quest').innerHTML = `<b>${kindTag('repeat')} The Ash Rift · tier ${ashRift.tier}</b>${ashRift.wave ? `Wave ${ashRift.wave} of ${RIFT.waves}: ${ashRift.left} left` : 'It opens...'} · ${Math.floor(ashRift.time / 60)}:${String(Math.floor(ashRift.time % 60)).padStart(2, '0')}<br><small>Stay within ${RIFT.reach} m of the circle</small>`;
    return;
  }
  const b = story.bounty;
  $('side-quest').classList.toggle('hidden', !b || cutscene.active);
  if (!b) return;
  $('side-quest').innerHTML = `<b>${kindTag('repeat')} ${b.name}</b>${b.got >= b.n ? 'Done: back to the Guild\'s board for your reward' : `${many(b.type)} ${b.where}: ${b.got}/${b.n}`}`;
}
function showMain() {
  const q = QUESTS[story.stage] || null;
  $('quest').classList.toggle('hidden', !q);
  if (!q) return;
  $('quest-name').innerHTML = `${kindTag('main')}${q.name}`;
  if (story.stage === 'hunt' && hunt) {
    $('quest-goal').innerHTML = hunt.done ? 'Sorrel says something is wrong at the glade' : `Hunt the ashen wolves near the glade (${hunt.wolves.length - hunt.left}/${hunt.wolves.length})`;
    return;
  }
  if (story.stage === 'wards' && wards) {
    $('quest-goal').innerHTML = wards.map((W, k) => { const left = W.foes.filter((b) => !b.dead && b.story === 'unbound').length; return `<span class="step ${W.broken ? 'done' : 'now'}">${W.broken ? '✓' : '·'} The ${['west', 'east', 'north'][k]} ward${W.broken ? '' : left ? ` (${left} guarding it)` : ' (unguarded: F to break it)'}</span>`; }).join('');
    return;
  }
  if (story.stage === 'contracts' && job) {
    // (0.99.29) the three contracts, ticked off as they are done
    const done = new Set(story.done || []);
    $('quest-goal').innerHTML = CONTRACTS.map((c) => { const j = job.list.find((q) => q.c.id === c.id); const ok = done.has(c.id); return `<span class="step ${ok ? 'done' : 'now'}">${ok ? '✓' : '·'} ${c.title}, ${c.where}${!ok && j && j.foes.length > 1 ? ` (${j.foes.length - j.left}/${j.foes.length})` : ''}</span>`; }).join('');
    return;
  }
  if (story.stage === 'days' && day) {
    // (0.99.24) the day's chores, ticked off as you go
    const D = DAYS[day.n];
    $('quest-goal').innerHTML = `<span class="step now">${D.title}</span>` + D.tasks.map((t, i) => `<span class="step ${i < day.at ? 'done' : i === day.at ? 'now' : ''}">${i < day.at ? '✓' : '·'} ${t.text}${i === day.at && (t.need > 1 || t.kind === 'gather') ? ` (${day.n2 || 0}/${t.need || 3})` : ''}</span>`).join('');
    return;
  }
  if (trial) {
    // (0.99.21) a trial's steps, ticked off as you go
    const T = TRIALS[trial.cls];
    $('quest-goal').innerHTML = `<span class="step now">${T.title}</span>` + T.steps.map((st, i) => `<span class="step ${i < trial.at ? 'done' : i === trial.at ? 'now' : ''}">${i < trial.at ? '✓' : '·'} ${st.text}${i === trial.at && st.need > 1 ? ` (${trial.n}/${st.need})` : ''}</span>`).join('');
  } else $('quest-goal').textContent = story.trial === 'choose' ? 'Choose your path' : q.goal;
}
let toastT = 0;
function toast(title, sub) {
  $('toast').innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
  $('toast').classList.remove('hidden');
  toastT = 4;
}
const barks = [];
let barkT = 0;
function bark(lines) {
  barks.push(...lines);
  if (barkT <= 0) nextBark();
}
function nextBark() {
  const l = barks.shift();
  if (!l) { $('bark').classList.add('hidden'); barkT = 0; return; }
  const [who, text] = l;
  const name = who ? who[0].toUpperCase() + who.slice(1) : '';
  $('bark').innerHTML = name ? `<b>${name}</b>` : '';
  $('bark').appendChild(document.createTextNode(text));
  $('bark').classList.toggle('thought', !who);
  $('bark').classList.remove('hidden');
  barkT = 2.4 + text.length / 22;
}
function companyAt(spots) {
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) {
    if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
    const [x, z] = spots[who];
    company[who].place(x, z);
  }
}
function startWalk() {
  setStage('waking');
  questRun = walkToTown(company, bark, () => {
    toast('Quest complete: Waking Up', 'New quest: Someone Must Be Looking');
    playAsking();
  }, { x: me.x, z: me.z }, world.land);
}
/** (0.99.27) A few days of asking after his family, before the Hounds take him in; then the chores. */
async function playAsking() {
  setStage('asking');
  companyHome();
  crowd.keepOut = { x: HOME.door.x, z: HOME.door.z, r: 9 }; // (the townsfolk give the Hounds' step a wide berth)
  await runScene(askingScene);
  crowd.keepOut = null;
  story.day = 0;
  setStage('days');
  toast('Days with the Hounds', 'Nobody came. You\'re one of them now');
  startDay(0);
}
/** A scene: the HUD away, the Company handed in (and back after), the skip button. */
async function runScene(script, ...args) {
  if (cutscene.active) return;
  questRun = null;
  if (locked()) document.exitPointerLock();
  document.body.classList.add('scene');
  $('cs-skip').classList.remove('hidden');
  closeWheel(false);
  hero.anim.em = null;
  cutscene.adopt(company);
  try {
    await cutscene.run((a) => script(a, ...args));
  } finally {
    if (cutscene.endFn) { cutscene.endFn(); cutscene.endFn = null; }
    hero.anim.lie = false;
    document.body.classList.remove('scene');
    $('cs-skip').classList.add('hidden');
  }
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel', 'odile', 'vesper']) { const k = cutscene.keep(who); if (k) company[who] = k; }
  cutscene.clear();
  $('fade').style.transition = 'opacity 0.8s';
  $('fade').style.opacity = '0';
}

// ---- (0.99.22) the white fog at the edge of sight (the crossing's price: it thins as the days go by), and memories
const fog = { now: 0, want: 0, speed: 1 };
function setFog(level, dur = 1) {
  fog.want = Math.max(0, Math.min(1, level));
  fog.speed = dur > 0 ? Math.abs(fog.want - fog.now) / dur : 1e9;
}
function drawFog(dt, t) {
  const d = fog.want - fog.now;
  fog.now += Math.sign(d) * Math.min(Math.abs(d), fog.speed * dt);
  const l = Math.max(0, fog.now + (fog.now > 0.05 ? Math.sin(t * 0.9) * 0.04 : 0)); // it breathes
  $('fog').style.opacity = l > 0.005 ? '1' : '0';
  if (l > 0.005) $('fog').style.background = `radial-gradient(ellipse at center, rgba(236,239,245,0) ${Math.round(72 - 58 * l)}%, rgba(236,239,245,${(0.5 + 0.45 * l).toFixed(2)}) 100%)`;
}
/** How thick the fog is out of the scenes, by how far the story has come. */
const FOG_AT = { new: 0.7, stumble: 0.7, rescued: 0.5, waking: 0.38, days: 0.34, crystal: 0.1, path: 0.06, ambush: 0.04, hunt: 0.04, mourning: 0 };
let flashT = null;
function memoryFlash(text, hold = 2.8) {
  $('flash-text').textContent = text;
  $('flash').style.opacity = '1';
  clearTimeout(flashT);
  flashT = setTimeout(() => { $('flash').style.opacity = '0'; }, hold * 1000);
}

// ---- (0.99.22) the tear in the glade: open when he comes through, then a sliver that never quite closes
const rift = buildCrack(TEAR);
view.scene.add(rift.group);
let riftT = 0, riftClosing = 1;
let riftStir = false;
cutscene.ctx.rift = { open: () => { riftClosing = 0; }, close: () => { riftClosing = Math.max(riftClosing, 0.01); }, stir: (on) => { riftStir = !!on; } };
function drawRift(dt) {
  riftT += dt;
  if (riftClosing > 0 && riftClosing < 0.93) riftClosing = Math.min(0.93, riftClosing + dt * 1.5);
  // (0.99.26) stirring: the sliver opens part way, and breathes
  const k = riftStir && riftClosing >= 0.93 ? 0.62 + Math.sin(riftT * 2.2) * 0.06 : Math.min(riftClosing, 0.93);
  rift.group.scale.set(1.25 * (1 - k), 1.25 * (1 - k * 0.35), 1.25 * (1 - k));
  if (Math.hypot(TEAR.x - me.x, TEAR.z - me.z) < 120) rift.anim(dt, riftT);
}

// ---- the opening, in three scenes with walking between
async function playOpening() {
  if (cutscene.active) return;
  for (const who of Object.keys(company)) { company[who].remove(); delete company[who]; }
  questRun = null;
  crystal.mark(false);
  if (net) net.ws.close(1000, 'The opening is played alone');
  hero.anim.lie = true; hero.anim.lieRig = null;
  setVigour(VIGOUR[0]);
  if (hero.cls !== 'novice') { story.path = null; wear('novice', true); }
  setStage('new');
  await runScene(openingPull);
  hero.anim.move = cutscene.skipping ? 'land' : null;
  yaw = Math.atan2(GLADE_EDGE.z - me.z, GLADE_EDGE.x - me.x); pitch = 0.22;
  setStage('stumble');
  startStumble();
}
/** (0.99.36) Experience: the bar fills; a new level is a little more health and might, and a talent point. */
function gainXp(n, why = '') {
  if (!(n > 0)) return;
  const was = levelOf(story.xp || 0).level;
  story.xp = (story.xp || 0) + Math.round(n);
  saveStory(story);
  const now = levelOf(story.xp).level;
  if (why) note(`+${Math.round(n)} xp · ${why}`);
  clearTimeout(gainXp.sync); gainXp.sync = setTimeout(sendProgress, 4000); // (0.99.38) to your account, now and then
  if (now > was) {
    world.setLevel(1, now);
    if (net && net.ready) net.send({ t: 'lvl', L: now });
    fx.ring(me.x, me.z, 2.4, 0xffd24a, 0.7);
    fx.ring(me.x, me.z, 1.2, 0xfff0b0, 0.5);
    $('lvlup').innerHTML = `Level ${now}<small>A little stronger, and a talent point: press P</small>`;
    if (webUI.open) webUI.draw();
    $('lvlup').style.opacity = '1';
    clearTimeout(gainXp.t);
    gainXp.t = setTimeout(() => { $('lvlup').style.opacity = '0'; }, 2600);
  }
}
// ---- (0.99.37) the talent web: what you have taken, per path; P opens it
function webOf(cls = me.cls) { return ((story.web || {})[cls] || []).slice(); }
function applyWeb() {
  const ok = world.setWeb(1, webOf());
  if (!ok && webOf().length) { story.web[me.cls] = []; saveStory(story); world.setWeb(1, []); } // (a set the web no longer allows: given back)
  if (net && net.ready) net.send({ t: 'web', ids: webOf() });
}
const webUI = new WebUI($('web'), {
  cls: () => me.cls,
  have: () => webOf(),
  points: () => pointsAt(me.level || 1),
  set(ids) { story.web = story.web || {}; story.web[me.cls] = ids; saveStory(story); applyWeb(); featureCheck(); clearTimeout(gainXp.sync); gainXp.sync = setTimeout(sendProgress, 2000); },
});
function toggleWeb() {
  if (webUI.open) { webUI.hide(); relock(); return; }
  if (cutscene.active) return;
  if (me.cls !== 'warrior' && me.cls !== 'archer') return note('The talent web opens once you have a path (Rowan\'s or Juni\'s). Your points wait for you.');
  document.exitPointerLock();
  webUI.show();
}
$('web-close').addEventListener('click', () => toggleWeb());
$('web-reset').addEventListener('click', () => { if (webOf().length && confirmReset()) { story.web[me.cls] = []; saveStory(story); applyWeb(); webUI.draw(); } });
function confirmReset() { const b = $('web-reset'); if (b.dataset.sure) { delete b.dataset.sure; b.textContent = 'Give all back'; return true; } b.dataset.sure = '1'; b.textContent = 'Sure? Click again'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Give all back'; }, 2500); return false; }

/** (0.99.38) Your progress (experience, talent webs, tricks) to the server, to keep with your account. */
function sendProgress() {
  if (net && net.ready) net.send({ t: 'progress', xp: story.xp || 0, web: story.web || {}, tricks: story.tricks || {}, gear: story.gear });
}
/** (0.99.38) The account's progress, when it is further on than this browser's: taken. */
function takeProgress(msg) {
  if (!(msg.xp > (story.xp || 0))) return;
  story.xp = msg.xp;
  if (msg.web && typeof msg.web === 'object') story.web = msg.web;
  story.tricks = { ...(story.tricks || {}), ...(msg.tricks || {}) };
  if (msg.gear && typeof msg.gear === 'object') story.gear = { worn: msg.gear.worn || {}, bag: msg.gear.bag || [], shards: msg.gear.shards || 0, rift: msg.gear.rift || 0 }; // (1.1) and your gear
  saveStory(story);
  applyGear();
  const L = levelOf(story.xp).level;
  world.setLevel(1, L);
  net.send({ t: 'lvl', L });
  applyWeb();
  toast('Progress from your account', `Level ${L}, and your talents`);
}

/** The tricks, the web: done once you have learned every trick, or spent a point. */
const featureDone = { tricks: () => Object.keys(story.tricks || {}).length >= TRICKS.length, web: () => Object.values(story.web || {}).some((l) => l.length) };
/** (1.0) New Content done: a reward, once (Moving Well when every trick is learned; the web at its first point). */
const FEATURE_XP = { tricks: 200, web: 120 };
function featureCheck() {
  story.featXp = story.featXp || {};
  for (const id of Object.keys(FEATURE_XP)) {
    if (story.featXp[id] || !SIDE_QUESTS[id].opens(story) || !featureDone[id]()) continue;
    story.featXp[id] = true;
    saveStory(story);
    gainXp(FEATURE_XP[id], SIDE_QUESTS[id].name);
    toast(`Quest complete: ${SIDE_QUESTS[id].name}`, `New Content · +${FEATURE_XP[id]} xp`);
  }
  showQuest();
}
function drawJournal() {
  const q = QUESTS[story.stage];
  const hand = [];
  if (q) hand.push(`<div class="jq main"><span class="qkind qk main">${KIND.main.icon} Main Story</span><b>${q.name}</b><span>${$('quest-goal').textContent || q.goal}</span></div>`);
  if (story.bounty) { const b = story.bounty; hand.push(`<div class="jq repeat"><span class="qkind qk repeat">${KIND.repeat.icon} Repeatable</span><b>${b.name}</b><span>${b.got >= b.n ? 'Done: back to the Guild\'s board for your reward' : `${many(b.type)} ${b.where}: ${b.got}/${b.n}`}</span></div>`); }
  for (const [id, sq] of Object.entries(SIDE_QUESTS)) if (sq.cat === 'feature' && sq.opens(story) && !featureDone[id]()) hand.push(`<div class="jq feature"><span class="qkind qk feature">${KIND.feature.icon} New Content</span><b>${sq.name}</b><span>${sq.goal}</span><small>${sq.where}</small></div>`);
  $('j-hand').innerHTML = hand.join('') || '<div class="jq">Nothing in hand.</div>';
  const av = [];
  // the main story: where it goes on
  av.push(`<div class="jgroup qk main">${KIND.main.icon} Main Story<small>${KIND.main.note}</small></div>`);
  av.push(q ? `<div class="jq main"><b>${q.name}</b><span>${q.goal}</span></div>` : '<div class="jq">The story begins in the glade.</div>');
  const feats = Object.entries(SIDE_QUESTS).filter(([id, sq]) => sq.cat === 'feature');
  av.push(`<div class="jgroup qk feature">${KIND.feature.icon} New Content<small>${KIND.feature.note}</small></div>`);
  for (const [id, sq] of feats) av.push(sq.opens(story) ? `<div class="jq feature ${featureDone[id]() ? 'done' : ''}"><b>${sq.name}${featureDone[id]() ? ' ✓' : ''}</b><span>${sq.goal}</span><small>${sq.where} · reward: ${FEATURE_XP[id]} experience</small></div>` : `<div class="jq feature done"><b>${sq.name}</b><span>Opens once you have chosen a path (Quest 3)</span></div>`);
  av.push(`<div class="jgroup qk repeat">${KIND.repeat.icon} Repeatable<small>${KIND.repeat.note}</small></div>`);
  const bq = SIDE_QUESTS.bounty;
  av.push(bq.opens(story) ? `<div class="jq repeat"><b>${bq.name}</b><span>${bq.goal}</span><small>${bq.where} · ${story.bountiesDone || 0} done so far</small></div>` : `<div class="jq repeat done"><b>${bq.name}</b><span>Opens once you have chosen a path (Quest 3)</span></div>`);
  // (1.1) farming: none of it needs the story past choosing a path
  const farm = farmOpen();
  av.push(`<div class="jgroup qk repeat">${KIND.repeat.icon} Hunting for gear<small>Repeatable. For gear and experience; none of it needs the story. <kbd>I</kbd> opens your gear.</small></div>`);
  av.push(`<div class="jq repeat ${farm ? '' : 'done'}"><b>The Ash Rift</b><span>Five waves of the Unbound at the circle under the old watchtower (north), then a chest for all who stood in it. Higher tiers, better chests.</span><small>${farm ? `The watchtower's circle · best cleared: tier ${gear().rift || 0} · next: tier ${(gear().rift || 0) + 1}` : 'Opens once you have chosen a path (Quest 3)'}</small></div>`);
  av.push(`<div class="jq repeat"><b>World bosses</b><span>${Object.values(BOSSES).map((B) => B.name).join(', ')}: one in each wild corner of the land, back every twelve minutes or so. Mind the red circles: get out of them, roll, or jump.</span><small>Ashmaw in the far Wakewood (south-west) · Old Gorge in the far meadows (south-east) · the Cairn King on the far stony ground (north-east)</small></div>`);
  av.push(`<div class="jq repeat"><b>Elites and rare beasts</b><span>Ash-touched beasts (ember-glowing, bigger) always drop gear. Rarer still, named beasts (violet) drop the best of it, and now and then a unique.</span><small>Anywhere wild: the further from Sunmere, the more beasts there are</small></div>`);
  $('j-avail').innerHTML = av.join('');
}
function toggleJournal() {
  const open = $('journal').classList.contains('hidden');
  $('journal').classList.toggle('hidden', !open);
  if (open) { if (locked()) document.exitPointerLock(); drawJournal(); } else relock();
}
/** Today's three bounties (the same for everyone on a given day). */
function todaysBounties() {
  const day = Math.floor(Date.now() / 86400000);
  return [0, 1, 2].map((k) => BOUNTIES[(day + k * 2) % BOUNTIES.length]);
}
function openBoard() {
  if (locked()) document.exitPointerLock();
  const L = me.level || 1, b = story.bounty;
  let html;
  if (b && b.got >= b.n) {
    const xp = bountyXp(b, L);
    story.bounty = null;
    story.bountiesDone = (story.bountiesDone || 0) + 1;
    saveStory(story);
    gainXp(xp, `bounty: ${b.name}`);
    toast('Bounty done', `${b.name} · +${xp} xp`);
    showQuest();
    html = `<div class="jq repeat"><b>${b.name} ✓</b><span>Odile's clerk counts your tokens and pays out: ${xp} experience.</span></div>`;
  } else if (b) {
    html = `<div class="jq repeat"><b>${b.name}</b><span>${many(b.type)} ${b.where}: ${b.got}/${b.n}</span><small>One at a time. Press <kbd>X</kbd> to give it up.</small></div>`;
  } else html = '';
  if (!story.bounty) html += todaysBounties().map((q, k) => `<div class="jq repeat pick" data-k="${k}"><b><kbd>${k + 1}</kbd> ${q.name}</b><span>${q.n} ${many(q.type)}, ${q.where}</span><small>Reward: ${bountyXp(q, L)} experience · a fresh board each day</small></div>`).join('');
  $('board-list').innerHTML = html;
  $('board').classList.remove('hidden');
  for (const el of $('board-list').querySelectorAll('.pick')) el.addEventListener('click', () => takeBounty(+el.dataset.k));
}
function takeBounty(k) {
  if (story.bounty) return;
  const q = todaysBounties()[k];
  if (!q) return;
  story.bounty = { id: q.id, type: q.type, n: q.n, got: 0, name: q.name, where: q.where };
  saveStory(story);
  closeBoard();
  toast('Bounty taken', `${q.name}: ${q.n} ${many(q.type)} ${q.where}`);
  showQuest();
}
function closeBoard() { $('board').classList.add('hidden'); relock(); }
/** A beast of the bounty's kind falls to you: counted. */
function bountyEvent(ev) {
  const b = story.bounty;
  if (!b || ev.type !== 'die' || !isMe(ev.pid) || ev.kind !== b.type || ev.story || b.got >= b.n) return;
  b.got++;
  saveStory(story);
  if (b.got >= b.n) toast('Bounty done', 'Back to the Guild\'s board (by the Telling Glass) for your reward');
  showQuest();
}
const BOARD_AT = { x: CRYSTAL.x, z: CRYSTAL.z };

// ---- (1.1) gear: drops, the gear screen (I), world bosses, the Ash Rift
const marks = new Map(); // (online) id -> { rank, name, look, size, lv }
const NO_MARK = { rank: 0, name: '', look: '', size: 1, lv: 0 };
const lootRng = makeRng((Date.now() ^ 0x5eed) >>> 0); // for rerolls (your own; the server checks what results)
function gear() {
  if (!story.gear || typeof story.gear !== 'object') story.gear = { worn: {}, bag: [], shards: 0, rift: 0 };
  const g = story.gear;
  g.worn = g.worn || {}; g.bag = g.bag || []; g.shards = g.shards || 0; g.rift = g.rift || 0;
  return g;
}
/** What you wear, to the sim (and the server, which checks it). */
function applyGear() {
  const worn = gear().worn;
  world.setGear(1, worn);
  if (net && net.ready) net.send({ t: 'gear', worn });
}
function gearChanged() {
  saveStory(story);
  applyGear();
  clearTimeout(gainXp.sync);
  gainXp.sync = setTimeout(sendProgress, 2000);
}
const farmOpen = () => ['warrior', 'archer'].includes(story.path);
const gearUI = new GearUI($('gear'), { gear, level: () => me.level || 1, rng: lootRng, changed: gearChanged, toast });
function toggleGear() {
  const open = $('gear').classList.contains('hidden');
  $('gear').classList.toggle('hidden', !open);
  gearUI.open = open;
  if (open) { if (locked()) document.exitPointerLock(); gearUI.draw(); } else relock();
}
let ashRift = null; // { tier, wave, left, time } while yours is open
let riftRing = null;
{
  // the circle at the tower's foot: it never quite closed (it glows violet, brighter while a rift is open)
  const m = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a3ac0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(RIFT_AT.x, 0.06, RIFT_AT.z);
  view.scene.add(m);
  riftRing = m;
}
function openRiftPick() {
  if (locked()) document.exitPointerLock();
  const best = gear().rift || 0;
  $('riftpick-list').innerHTML = Array.from({ length: Math.min(RIFT.most, best + 1) }, (_, k) => k + 1).slice(-10).map((t) => `<button data-t="${t}"><b>Tier ${t}</b><small>${t <= best ? 'cleared' : 'new'} · chest: ${2 + Math.floor(t / 2)} items${t >= 3 ? `, ${['rare', 'rare', 'epic', 'epic', 'epic'][Math.min(4, Math.floor(t / 3) - 1)]} or better` : ''}</small></button>`).join('');
  for (const b of $('riftpick-list').querySelectorAll('button')) b.addEventListener('click', () => startRift(+b.dataset.t));
  $('riftpick').classList.remove('hidden');
}
function closeRiftPick() { $('riftpick').classList.add('hidden'); relock(); }
function startRift(tier) {
  closeRiftPick();
  if (net && net.ready) net.send({ t: 'rift', tier });
  else if (!world.openRift(1, tier)) toast('The rift will not open', 'Stand in the circle');
}
function drawBossBar(list, hx, hz) {
  let B = null;
  for (const b of list || []) if (b.rank === 3 && !b.dead && (b.x - hx) ** 2 + (b.z - hz) ** 2 < 50 * 50 && (b.hp < 0.999 || b.state === 'chase')) B = b;
  $('bossbar').classList.toggle('hidden', !B || cutscene.active);
  if (!B) return;
  $('bossbar').firstChild.textContent = `${B.name || 'A world boss'}${B.lv ? ` · level ${B.lv}` : ''}`;
  $('bossbar').lastChild.firstChild.style.width = `${Math.max(0, B.hp) * 100}%`;
}
function lootLine(it) { const g = gradeOf(it); return `<span class="lootnote" style="color:${g.color}">${itemName(it)}</span>`; }
function gearEvent(ev) {
  if (ev.type === 'loot' && isMe(ev.pid)) {
    const g = gear(), it = ev.item;
    if (!it || !it.slot) return;
    if (g.bag.length >= BAG_MOST) {
      // a full bag: the least of it is salvaged to make room (never a unique or a starred piece)
      const worst = g.bag.filter((i) => i.r !== UNIQUE && !(i.stars > 0)).sort((p, q) => p.r - q.r)[0];
      if (!worst || worst.r > it.r) { g.shards += salvageValue(it); toast('Bag full', `${itemName(it)} salvaged (+${salvageValue(it)} shards)`); saveStory(story); return; }
      g.bag = g.bag.filter((i) => i !== worst);
      g.shards += salvageValue(worst);
    }
    g.bag.push(it);
    saveStory(story);
    clearTimeout(gainXp.sync);
    gainXp.sync = setTimeout(sendProgress, 2000);
    note(`Found: ${lootLine(it)}${ev.from ? ` (${ev.from})` : ''}`);
    if (it.r >= 3) { toast(it.r === UNIQUE ? 'A unique!' : `${gradeOf(it).name} find`, itemName(it)); fx.ring(ev.x, ev.z, 1.6, parseInt(gradeOf(it).color.slice(1), 16), 1.2); }
    if (gearUI.open) gearUI.draw();
  } else if (ev.type === 'boss') { toast('A world boss has risen', `${ev.name}${ev.at ? ` (${compass(ev.at)})` : ''}`); note(`${ev.name} has risen.`); }
  else if (ev.type === 'tele') fx.warn(ev.x, ev.z, ev.r, ev.warn);
  else if (ev.type === 'crash') { fx.ring(ev.x, ev.z, ev.r, 0xff5a3a, 0.6); fx.puff(ev.x, ev.z, 0x6a5a4a); }
  else if (ev.type === 'fade') fx.puff(ev.x, ev.z, 0x3a2a4a);
  else if (ev.type === 'rift' && isMe(ev.pid)) { ashRift = { tier: ev.tier, wave: ev.wave, left: ev.left, time: ev.time, at: performance.now() }; if (ev.wave) toast(`Wave ${ev.wave} of ${RIFT.waves}`, ev.wave === RIFT.waves ? 'The Rift Warden comes through' : `${ev.left} of the Unbound`); showQuest(); }
  else if (ev.type === 'riftEnd' && isMe(ev.pid)) {
    ashRift = null;
    if (ev.ok) { gear().rift = Math.max(gear().rift || 0, ev.tier); saveStory(story); toast(`Ash Rift, tier ${ev.tier}: cleared`, 'The chest is yours (and everyone\'s who stood in it)'); }
    else toast('The rift closes', 'On nothing. (You fell, walked away, or ran out of time.)');
    showQuest();
  } else if (ev.type === 'die' && ashRift && ev.rift) { ashRift.left = Math.max(0, ashRift.left - 1); showQuest(); }
}
/** Which way something is from Sunmere, in words. */
function compass(at) {
  const dx = at.x - CRYSTAL.x, dz = at.z - CRYSTAL.z;
  return `${dz < -60 ? 'far north' : dz > 60 ? 'far south' : ''}${Math.abs(dz) > 60 && Math.abs(dx) > 60 ? '-' : ''}${dx < -60 ? 'west' : dx > 60 ? 'east' : ''}` || 'near Sunmere';
}
setInterval(() => { if (ashRift && ashRift.time > 0) { ashRift.time = Math.max(0, ashRift.time - 1); if (!cutscene.active) showSide(); } }, 1000);
addEventListener('keydown', (e) => {
  if (!$('riftpick').classList.contains('hidden')) {
    const n = /^Digit([1-9])$/.exec(e.code);
    const btns = [...$('riftpick-list').querySelectorAll('button')];
    if (n && btns[+n[1] - 1]) startRift(+btns[+n[1] - 1].dataset.t);
    else if (e.code === 'Escape' || e.code === 'KeyF') closeRiftPick();
    e.preventDefault(); e.stopImmediatePropagation();
  } else if (!$('gear').classList.contains('hidden') && (e.code === 'Escape' || e.code === 'KeyI')) {
    toggleGear();
    e.preventDefault(); e.stopImmediatePropagation();
  }
}, true);
// the board and the journal have the keys while open (numbers pick, not change your path)
addEventListener('keydown', (e) => {
  if (!$('board').classList.contains('hidden')) {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (k !== undefined) takeBounty(k);
    else if (e.code === 'KeyX' && story.bounty) { story.bounty = null; saveStory(story); showQuest(); openBoard(); }
    else if (e.code === 'Escape' || e.code === 'KeyF') closeBoard();
    e.preventDefault(); e.stopImmediatePropagation();
  } else if (!$('journal').classList.contains('hidden') && (e.code === 'Escape' || e.code === 'KeyJ')) {
    toggleJournal();
    e.preventDefault(); e.stopImmediatePropagation();
  }
}, true);

function setStage(stage) {
  // (0.99.36) leaving a part of the story: its experience, once
  const from = story.stage;
  story.xpq = story.xpq || {};
  if (from && from !== stage && QUEST_XP[from] && !story.xpq[from]) { story.xpq[from] = true; gainXp(QUEST_XP[from], 'the story'); }
  story.stage = stage;
  saveStory(story);
  showSkip();
  setFog(FOG_AT[stage] ?? 0, 1.5);
  showQuest();
}
// stumbling out of the glade: slow (he can only walk), memories coming and going, something in the grass
let stumbleFlash = false;
function startStumble() {
  bark([['', 'Somewhere past the fog: trees, and maybe a way out.']]);
  questRun = {
    update() {
      const d = Math.hypot(me.x - TEAR.x, me.z - TEAR.z);
      if (!stumbleFlash && d > 5) { stumbleFlash = true; memoryFlash('A hand on your shoulder. "Not yet. You\'re not ready yet."', 2.6); }
      if (Math.hypot(me.x - GLADE_EDGE.x, me.z - GLADE_EDGE.z) < 3 || d > 11) playWolves();
    },
  };
}
async function playWolves() {
  await runScene(openingWolves, { x: me.x, z: me.z });
  setStage('rescued');
  startRescued();
}
// rescued: the Company round you; Sorrel by the tear, studying it
function startRescued() {
  const near = { rowan: [me.x + 1.6, me.z - 1.2], ilse: [me.x - 0.6, me.z - 1.3], juni: [me.x + 2.2, me.z + 1.4] };
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
  for (const [who, at] of Object.entries(near)) if (Math.hypot(company[who].x - me.x, company[who].z - me.z) > 6) company[who].place(at[0], at[1]);
  company.sorrel.place(TEAR.x + 1.1, TEAR.z + 0.9).face(TEAR.x, TEAR.z);
  company.sorrel.loop('look');
  for (const who of ['rowan', 'ilse', 'juni']) company[who].face(me.x, me.z).loop('idle');
  bark([['juni', 'He\'s staring at it again. Sorrel stares at everything.'], ['ilse', 'Take your time. Get your legs back.']]);
  questRun = {
    update(dt) {
      for (const a of Object.values(company)) a.update(dt);
      if (Math.hypot(me.x - TEAR.x, me.z - TEAR.z) < 3.4) playTear();
    },
  };
}
async function playTear() {
  await runScene(openingTear);
  yaw = Math.atan2(ROAD_IN.z - me.z, ROAD_IN.x - me.x); pitch = 0.28;
  toast('New quest: Waking Up', QUESTS.waking.goal);
  startWalk();
}
// the keepsake: something in the grass where he woke (a mystery for later)
let keepsakeMesh = null;
if (!story.keepsake) {
  // a glint in the grass: a small four-pointed spark
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,250,230,1)'); r.addColorStop(0.25, 'rgba(255,230,160,0.6)'); r.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,240,0.95)';
  g.beginPath(); g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  keepsakeMesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  keepsakeMesh.scale.setScalar(0.35);
  keepsakeMesh.position.set(KEEPSAKE.x, 0.12, KEEPSAKE.z);
  view.scene.add(keepsakeMesh);
}
function nearKeepsake() {
  return keepsakeMesh && !cutscene.active && Math.hypot(me.x - KEEPSAKE.x, me.z - KEEPSAKE.z) < 1.8;
}
function takeKeepsake() {
  if (!nearKeepsake()) return false;
  view.scene.remove(keepsakeMesh);
  keepsakeMesh = null;
  story.keepsake = true;
  saveStory(story);
  memoryFlash('A white sleeve, a gold thread, a laugh. Then nothing.', 2.2);
  toast('A scrap of white cloth', 'Threaded with gold, burned at one edge. You don\'t know whose it was. You keep it.');
  return true;
}
$('cs-skip').addEventListener('click', () => cutscene.skip());
for (const id of ['cs-box', 'cs-card']) $(id).addEventListener('mousedown', () => cutscene.key('Click'));
// (1.1) what is yours, not the story's: kept when the opening is played again (experience, talents, tricks, gear)
const EARLY = () => STAGE_ORDER.slice(0, STAGE_ORDER.indexOf('path'));
const KEEP = ['xp', 'xpq', 'web', 'tricks', 'gear', 'featXp', 'bounty', 'bountiesDone'];
const kept = () => Object.fromEntries(KEEP.filter((k) => story[k] !== undefined).map((k) => [k, story[k]]));
$('replay').addEventListener('click', () => { story = { stage: 'new', ...kept() }; trial = null; $('choose').classList.add('hidden'); saveStory(story); playOpening(); });
// (1.1) here to hunt: a minute's read of the story so far, then straight to choosing a path
function showSkip() { $('skipstory').classList.toggle('hidden', !EARLY().includes(story.stage)); }
showSkip();
$('skipstory').addEventListener('click', () => { if (locked()) document.exitPointerLock(); $('recap').classList.remove('hidden'); });
$('recap-back').addEventListener('click', () => { $('recap').classList.add('hidden'); relock(); });
$('recap-go').addEventListener('click', () => {
  if (!EARLY().includes(story.stage)) return;
  story.xpq = story.xpq || {};
  let xp = 0;
  for (const st of EARLY()) if (QUEST_XP[st] && !story.xpq[st]) { story.xpq[st] = true; xp += QUEST_XP[st]; }
  story.xp = (story.xp || 0) + xp;
  story.stage = 'path';
  story.trial = 'choose';
  story.keepsake = true;
  story.skipped = true;
  saveStory(story);
  location.reload(); // (the page sets itself up at the training ground, the choice open)
});
const markV = new THREE.Vector3();
function drawMarker() {
  const lead = story.stage === 'invitation' ? HOME.door : story.stage === 'tower' ? WATCHTOWER : story.stage === 'wards' && wards ? nextWard() : story.stage === 'contracts' && job ? nearestFoe() : story.stage === 'report' ? CRYSTAL : story.stage === 'mourning' ? company.rowan : story.stage === 'hunt' && hunt ? (hunt.done ? TEAR : hunt.wolves.filter((w) => !w.dead && w.story === 'ashen').sort((p, q) => Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(q.x - me.x, q.z - me.z))[0]) : story.stage === 'ambush' ? company.rowan : story.stage === 'days' && day && day.marker ? day.marker() : story.stage === 'stumble' ? GLADE_EDGE : story.stage === 'rescued' ? TEAR : story.stage === 'waking' ? questRun && questRun.leader : story.stage === 'crystal' ? CRYSTAL : story.stage === 'path' && story.trial !== 'choose' ? (trial && trial.cls === 'archer' ? TRAINING.line : TRAINING.ring) : null;
  if (!lead || cutscene.active) { $('marker').classList.add('hidden'); return; }
  const d = Math.hypot(lead.x - me.x, lead.z - me.z);
  markV.set(lead.x, 2.3, lead.z).project(view.camera);
  let x = ((markV.x + 1) / 2) * innerWidth, y = ((1 - markV.y) / 2) * innerHeight;
  const behind = markV.z > 1;
  if (behind) { x = innerWidth - x; y = innerHeight - 40; }
  const m = 24;
  x = Math.max(m + 30, Math.min(innerWidth - m - 30, x));
  y = Math.max(m + 20, Math.min(innerHeight - 180, y));
  const what = story.stage === 'invitation' ? 'The lodging' : story.stage === 'tower' ? 'The watchtower' : story.stage === 'wards' ? 'An ash-ward' : story.stage === 'contracts' ? (lead.def && lead.def.name) || 'The quarry' : story.stage === 'report' ? 'The Guild' : story.stage === 'mourning' ? 'Rowan' : story.stage === 'hunt' ? (hunt && hunt.done ? 'The glade' : 'Ashen wolf') : story.stage === 'ambush' ? 'Rowan' : story.stage === 'days' ? (DAYS[day ? day.n : 0].tasks[day ? day.at : 0] || {}).text || '' : story.stage === 'stumble' ? 'Out of the glade' : story.stage === 'rescued' ? 'Sorrel' : story.stage === 'crystal' ? 'The Guild' : story.stage === 'path' ? (trial && trial.cls === 'archer' ? 'The line' : trial ? 'The ring' : 'Training ground') : 'Rowan';
  $('marker').textContent = `◆ ${what} · ${Math.round(d)} m`;
  $('marker').style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  $('marker').classList.toggle('hidden', d < 6 && !behind);
}
// (0.99.20) Quest 2: the Company and Magistra Odile wait in the Guild's yard; walk up to the crystal
function toGuild(walk = false) {
  if (!company.odile) company.odile = new Actor(view.scene, 'odile', { beastMesh: () => new THREE.Group() });
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) if (!company[who] && !(who === 'ilse' && story.ilse === 'gone')) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
  questRun = atGuild(company, { walk });
}
async function playCrystal() {
  if (cutscene.active) return;
  questRun = null;
  if (locked()) document.exitPointerLock();
  document.body.classList.add('scene');
  $('cs-skip').classList.remove('hidden');
  closeWheel(false);
  hero.anim.em = null;
  cutscene.adopt(company);
  crowd.keepOut = { x: CRYSTAL.x, z: CRYSTAL.z, r: 7.5 }; // nobody wanders through the shots (the onlookers stay round the edge)
  try {
    await cutscene.run(crystalScene);
  } finally {
    crowd.keepOut = null;
    if (cutscene.endFn) { cutscene.endFn(); cutscene.endFn = null; }
    document.body.classList.remove('scene');
    $('cs-skip').classList.add('hidden');
  }
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel', 'odile']) company[who] = cutscene.keep(who) || company[who];
  cutscene.clear();
  crystal.rest();
  crystal.mark(true); // the sand stays spent, the glass cracked
  setStage('path');
  questRun = atTraining(company); // (they go on ahead while the screen is dark)
  bark([['rowan', 'Training ground, outside the east gate. We\'ll be waiting.']]);
  yaw = CRYSTAL.a + Math.PI; pitch = 0.2;
  $('fade').style.transition = 'opacity 0.8s';
  $('fade').style.opacity = '0';
  toast('Quest complete: The Telling Glass', 'New quest: Choosing a Path');
  showQuest();
}
// ---- (0.99.21) Quest 3, Choosing a Path: the trials at the training ground, then the choice
let trial = null; // { cls, at (step), n (count), slamT, ricoT, ricoHit, looseT }
const posts = world.beasts.filter((b) => b.type === 'dummy');
const ringIds = new Set(posts.filter((b) => b.ring).map((b) => b.id));
const targetIds = posts.filter((b) => !b.ring).map((b) => b.id);
async function playTraining() {
  if (cutscene.active) return;
  questRun = null;
  if (locked()) document.exitPointerLock();
  document.body.classList.add('scene');
  $('cs-skip').classList.remove('hidden');
  closeWheel(false);
  hero.anim.em = null;
  cutscene.adopt({ rowan: company.rowan, ilse: company.ilse, juni: company.juni, sorrel: company.sorrel });
  try {
    await cutscene.run(trainingScene);
  } finally {
    if (cutscene.endFn) { cutscene.endFn(); cutscene.endFn = null; }
    document.body.classList.remove('scene');
    $('cs-skip').classList.add('hidden');
  }
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) company[who] = cutscene.keep(who) || company[who];
  cutscene.clear();
  questRun = atTraining(company);
  me.x = TRAINING.ring.x - 3.5; me.z = TRAINING.ring.z - 3.5; prev.x = me.x; prev.z = me.z;
  yaw = Math.atan2(TRAINING.ring.z - me.z, TRAINING.ring.x - me.x); pitch = 0.25;
  $('fade').style.transition = 'opacity 0.8s';
  $('fade').style.opacity = '0';
  startTrial('warrior');
}
function startTrial(cls) {
  trial = { cls, at: 0, n: 0, slamT: null, ricoT: -99, ricoHit: new Set(), looseT: -99 };
  story.trial = cls;
  saveStory(story);
  wear(cls, true);
  me.mp = me.maxMp;
  bark(TRIALS[cls].start);
  // (0.99.27) the teacher shows it once (that is all he will need)
  const t = company[TRIALS[cls].teacher];
  if (t) setTimeout(() => { if (!t.alive) return; t.face(cls === 'warrior' ? TRAINING.ring.x : TRAINING.targets[2].x, cls === 'warrior' ? TRAINING.ring.z : TRAINING.targets[2].z); t.play(cls === 'warrior' ? 'slash' : 'shoot'); }, 900);
  showQuest();
}
function stepDone() {
  const T = TRIALS[trial.cls];
  const st = T.steps[trial.at];
  bark([[T.teacher, st.done]]);
  trial.at++;
  trial.n = 0;
  if (trial.at < T.steps.length) return showQuest();
  // the trial is over
  bark(T.end);
  const was = trial.cls;
  trial = null;
  if (was === 'warrior') return setTimeout(() => { startTrial('archer'); toast('Juni\'s trial', 'Go to the shooting line'); }, 3500);
  story.trial = 'choose';
  saveStory(story);
  showQuest();
  setTimeout(showChoose, 3000);
}
/** What happened, for the trial (hits on the posts, a Skyfall, blood paid, a Ricochet, a Deadeye loosed). */
function trialEvent(ev) {
  if (!trial || !isMe(ev.pid)) return;
  const id = TRIALS[trial.cls].steps[trial.at].id;
  const now = performance.now() / 1000;
  if (id === 'cleave' && ev.type === 'hit' && !ev.shot && ringIds.has(ev.id)) { if (++trial.n >= 6) stepDone(); else showQuest(); }
  else if (id === 'skyfall') {
    if (ev.type === 'slam') { trial.slamT = ev.t; trial.slamHit = new Set(); }
    else if (ev.type === 'hit' && ev.t === trial.slamT && ringIds.has(ev.id)) { trial.slamHit.add(ev.id); if (trial.slamHit.size >= 2) stepDone(); }
  } else if (id === 'blood' && ev.type === 'blood') stepDone();
  else if (id === 'far' && ev.type === 'hit' && ev.shot && ev.id === targetIds[2] && me.x < TRAINING.line.x + 3) stepDone();
  else if (id === 'ricochet') {
    if (ev.type === 'cast' && ev.skill === 'ricochet') { trial.ricoT = now; trial.ricoHit = new Set(); }
    else if (ev.type === 'hit' && ev.shot && now - trial.ricoT < 3 && targetIds.includes(ev.id)) { trial.ricoHit.add(ev.id); if (trial.ricoHit.size >= 3) stepDone(); }
  } else if (id === 'deadeye') {
    if (ev.type === 'cast' && ev.skill === 'loose') trial.looseT = ev.poured >= 30 ? now : -99;
    else if (ev.type === 'hit' && ev.shot && now - trial.looseT < 2.5 && targetIds.includes(ev.id)) stepDone();
  }
}
function showChoose() {
  if (story.trial !== 'choose') return;
  if (locked()) document.exitPointerLock();
  $('choose').classList.remove('hidden');
}
function choosePath(cls) {
  $('choose').classList.add('hidden');
  story.trial = null;
  story.path = cls;
  setStage('ambush');
  setTimeout(startAmbush, 2500);
  wear(cls, true);
  bark(cls === 'warrior' ? [['rowan', 'Ha! Knew it. Blood and iron, then.'], ['juni', 'Your loss. Come and shoot with me some time.']] : [['juni', 'Yes! Another one for the bow.'], ['rowan', 'Fine. Someone has to stand behind me.']]);
  toast('Quest complete: Choosing a Path', 'New quest: When It Counts');
  setTimeout(() => note('New: tricks for moving well (bunny hops, slides, wall kicks...). Press H to see them. All optional.'), 9000);
  showQuest();
  relock();
}
$('choose-warrior').addEventListener('click', () => choosePath('warrior'));
$('choose-archer').addEventListener('click', () => choosePath('archer'));
// (0.99.29) and from the keyboard (the mouse is the camera's until Alt is held: not everyone knows)
addEventListener('keydown', (e) => {
  if ($('choose').classList.contains('hidden')) return;
  if (e.code === 'Digit1' || e.code === 'Numpad1') { e.preventDefault(); e.stopImmediatePropagation(); choosePath('warrior'); }
  else if (e.code === 'Digit2' || e.code === 'Numpad2') { e.preventDefault(); e.stopImmediatePropagation(); choosePath('archer'); }
}, true);
// ---- (0.99.24) things you can do with F (the keepsake, the chores): the nearest in reach is shown
const uses = new Set();
function nearestUse() {
  if (cutscene.active || me.dead) return null;
  let best = null, bd = Infinity;
  if (nearKeepsake()) return { label: 'Pick it up', fn: takeKeepsake };
  // (1.0) the Guild's board, once its bounties are open (unless a scene here wants the glass)
  if (SIDE_QUESTS.bounty.opens(story) && story.stage !== 'crystal' && Math.hypot(me.x - BOARD_AT.x, me.z - BOARD_AT.z) < 3) best = { label: story.bounty && story.bounty.got >= story.bounty.n ? 'Hand in your bounty' : 'The Guild\'s board (bounties)', fn: openBoard }, bd = Math.hypot(me.x - BOARD_AT.x, me.z - BOARD_AT.z);
  // (1.1) the Ash Rift
  if (farmOpen() && !ashRift && !['tower', 'wards'].includes(story.stage)) { const d = Math.hypot(me.x - RIFT_AT.x, me.z - RIFT_AT.z); if (d < 4 && d < bd) { best = { label: 'Open the Ash Rift', fn: openRiftPick }; bd = d; } }
  for (const u of uses) {
    const at = typeof u.at === 'function' ? u.at() : u.at;
    if (!at) continue;
    const d = Math.hypot(me.x - at.x, me.z - at.z);
    if (d < (u.r || 2.2) && d < bd && (!u.when || u.when())) { bd = d; best = u; }
  }
  return best;
}

Actor.land = world.land; // (0.99.25) people in the story keep out of houses, walls and trees

// ---- (0.99.24) Days with the Hounds: chores while they look after him; stronger and less fogged each day
const well = placeBuilding('well_blue', { x: WELL.x, z: WELL.z, fw: 1.9, fd: 1.9 });
well.then((b) => b && view.scene.add(b));
{
  // the woodpile by the lodging: a few split logs stacked
  const g = new THREE.Group();
  const bark = new THREE.MeshLambertMaterial({ color: 0x6a4a2e, flatShading: true }), cut = new THREE.MeshLambertMaterial({ color: 0xc9a46a, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 6), [bark, cut, cut]);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.12 + Math.floor(i / 3) * 0.2, (i % 3) * 0.23 - 0.23 + (Math.floor(i / 3) % 2) * 0.1);
    log.castShadow = true;
    g.add(log);
  }
  g.position.set(WOODPILE.x, 0, WOODPILE.z);
  view.scene.add(g);
}
function setVigour(v) {
  world.setVigour(1, v);
  if (net && net.ready) net.send({ t: 'vig', v });
}
let day = null; // { n, at (task), task state }
const herbMeshes = [];
function glint(x, z, size = 0.32) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  r.addColorStop(0, 'rgba(240,255,240,1)'); r.addColorStop(0.3, 'rgba(190,240,190,0.55)'); r.addColorStop(1, 'rgba(190,240,190,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.setScalar(size);
  sp.position.set(x, 0.25, z);
  view.scene.add(sp);
  return sp;
}
function companyHome() {
  if (company.rowan) company.rowan.sheathe(true); // (0.99.25) in town his sword stays at his hip
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) {
    if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
    const [x, z] = HOME_SPOTS[who];
    company[who].place(x, z).face(HOME.door.x, HOME.door.z);
    company[who].loop(who === 'rowan' ? 'arms' : who === 'sorrel' ? 'look' : 'idle');
  }
  if (company.odile) company.odile.place(...atGuildOdile());
}
const atGuildOdile = () => [CRYSTAL.x + Math.cos(CRYSTAL.a) * 1.45, CRYSTAL.z + Math.sin(CRYSTAL.a) * 1.45];
async function startDay(n, first = false) {
  day = { n, at: 0 };
  story.day = n;
  saveStory(story);
  setVigour(VIGOUR[n]);
  setFog(DAY_FOG[n], 2);
  companyHome();
  questRun = { update(dt) { for (const a of Object.values(company)) a.update(dt); if (day && day.tick) day.tick(dt); } };
  if (!first) { me.x = HOME.door.x + 1.5; me.z = HOME.door.z; prev.x = me.x; prev.z = me.z; }
  showQuest();
  startTask();
}
function startTask() {
  uses.clear();
  for (const m of herbMeshes.splice(0)) view.scene.remove(m);
  hero.anim.carry = false;
  const D = DAYS[day.n], T = D.tasks[day.at];
  day.tick = null;
  if (T.start) bark(T.start);
  showQuest();
  const finish = () => { if (T.done) bark(T.done); day.at++; startTask(); };
  if (T.kind === 'fetch') {
    let n = 0, carrying = false;
    const from = T.from === 'well' ? WELL_AT : WOODPILE;
    uses.add({ at: from, r: 2.4, label: T.from === 'well' ? 'Fill the bucket' : 'Pick up firewood', when: () => !carrying, fn: () => { carrying = true; hero.anim.carry = true; if (n === 0 && T.got) bark(T.got); } });
    uses.add({ at: () => company[T.to], r: 2.4, label: 'Hand it over', when: () => carrying, fn: () => {
      carrying = false; hero.anim.carry = false; n++; day.n2 = n;
      if (n >= T.need) finish(); else { if (T.each && T.each[n - 1]) bark(T.each.slice(n - 1, n + (n === 1 ? 1 : 0))); showQuest(); }
    } });
    day.marker = () => (carrying ? company[T.to] : from);
  } else if (T.kind === 'follow') {
    // Rowan runs the route; he waits (and calls) if you fall behind
    const r = company.rowan;
    let i = 0, waitT = 0, waits = 0, going = false;
    day.marker = () => r;
    day.tick = (dt) => {
      if (going) return;
      const d = Math.hypot(me.x - r.x, me.z - r.z);
      if (d > 9) { waitT -= dt; if (waitT <= 0) { bark([T.wait[waits++ % T.wait.length]]); waitT = 6; } r.loop('idle'); return; }
      if (i >= RUN_ROUTE.length) { day.tick = null; r.loop('arms'); return finish(); }
      const p = RUN_ROUTE[i++];
      going = true;
      r.walkTo(p.x, p.z, { run: true, speed: 3.4 + VIGOUR[day.n] }).then(() => { going = false; });
    };
  } else if (T.kind === 'gather') {
    let n = 0;
    const ilse = company.ilse;
    // out through the plaza and up the north road (not through the houses), to the meadow
    ilse.walkPath([{ x: -6, z: 2 }, { x: 2, z: -6 }, { x: 2.2, z: -16 }, { x: 1.8, z: -30 }, { x: 0.5, z: -44 }, { x: HERBS[0].x - 2, z: HERBS[0].z + 2 }]).then(() => ilse.loop('crouch'));
    for (const [k, h] of HERBS.entries()) {
      const m = glint(h.x, h.z);
      herbMeshes.push(m);
      const u = { at: h, r: 1.9, label: 'Pick the silverleaf', fn: () => { view.scene.remove(m); uses.delete(u); n++; day.n2 = n; if (n >= HERBS.length) { ilse.loop('idle'); finish(); } else { if (T.each && T.each[n - 1]) bark([T.each[n - 1]]); showQuest(); } } };
      uses.add(u);
      void k;
    }
    day.marker = () => HERBS.find((h, k) => herbMeshes[k] && herbMeshes[k].parent) || HERBS[0];
  } else if (T.kind === 'lesson') {
    const s2 = company.sorrel;
    s2.place(...HOME_SPOTS.sorrel).face(WELL.x, WELL.z);
    uses.add({ at: () => s2, r: 2.6, label: 'Sit with Sorrel', fn: async () => { uses.clear(); await runScene(lessonScene); questRun = { update(dt) { for (const a of Object.values(company)) a.update(dt); } }; finish(); } });
    day.marker = () => s2;
  } else if (T.kind === 'sleep') {
    companyHome(); // everyone home for the night (Ilse back from the meadow)
    uses.add({ at: HOME.door, r: 2.4, label: 'Sleep', fn: () => sleep() });
    day.marker = () => HOME.door;
  }
}
async function sleep() {
  uses.clear();
  const D = DAYS[day.n], next = day.n + 1;
  const last = next >= DAYS.length;
  await runScene(nightScene, D.night, last ? ['The morning of the Telling.', 'Rowan is at the door before the sun is up.'] : DAYS[next].morning);
  if (!last) return startDay(next);
  // the days are done: to the Guild
  day = null;
  setVigour(1);
  me.x = HOME.door.x + 1.5; me.z = HOME.door.z; prev.x = me.x; prev.z = me.z;
  setStage('crystal');
  toast('Quest complete: Days with the Hounds', 'New quest: The Telling Glass');
  companyHome();
  bark([['rowan', 'Today\'s the day. The Guild hall\'s the stone one with the red banners, north of the plaza. We\'ll walk you over.']]);
  toGuild(true);
}

// ---- (0.99.26) Quest 4, When It Counts: a year on; the ashen wolves; Vesper; Ilse; the Link wakes
function startAmbush() {
  uses.clear();
  bark([['rowan', 'Sprout. A word, when you have one.']]);
  uses.add({ at: () => company.rowan, r: 2.6, label: 'Talk to Rowan', fn: playYear });
}
async function playYear() {
  uses.clear();
  if (net) net.ws.close(1000, 'This part of the story is played alone');
  await runScene(yearScene);
  setStage('hunt');
  startHunt();
}
let hunt = null; // { wolves, left }
const airOf = new Map(); // (0.99.35) pid -> { y, at }: others' height off the ground (from the server)

// ---- (0.99.35) Moving well: the tricks, learned by doing them (H shows the list; none of it is needed)
const TRICKS = [
  { id: 'bhop', text: 'Bunny hop: <span class="k">Space</span> again the moment you land, three times running', need: 3 },
  { id: 'slideJump', text: 'Slide: <span class="k">C</span> while running, then <span class="k">Space</span> out of it for a long leap' },
  { id: 'jump2', text: 'Double jump: <span class="k">Space</span> again in the air' },
  { id: 'kick', text: 'Wall kick: in the air beside a tree, a rock or a wall, <span class="k">Space</span> (it gives your double jump back)' },
  { id: 'rock', text: 'Stand on top of a rock taller than you' },
  { id: 'launch', text: 'Berserker: <span class="k">Space</span> as Skyfall lands (a bounce). Sharpshooter: look down in mid-air and shoot (a recoil)' },
];
let hopRun = 0;
function showTricks() {
  const got = story.tricks || {};
  $('tricks-list').innerHTML = TRICKS.map((t) => `<span class="step ${got[t.id] ? 'done' : ''}">${got[t.id] ? '✓' : '·'} ${t.text}${t.need && !got[t.id] ? ` (${Math.min(hopRun, t.need)}/${t.need})` : ''}</span>`).join('');
}
function learnt(id) {
  story.tricks = story.tricks || {};
  if (story.tricks[id]) return;
  story.tricks[id] = true;
  saveStory(story);
  gainXp(TRICK_XP, 'a trick learned');
  const t = TRICKS.find((q) => q.id === id);
  const left = TRICKS.filter((q) => !story.tricks[q.id]).length;
  toast(left ? 'Trick learned' : 'Every trick learned', left ? t.text.replace(/<[^>]+>/g, '') : 'You move like Juni now. She will be furious.');
  showTricks();
  featureCheck();
}
/** Your own moves, as the sim reports them: which tricks they were. */
function trickEvent(ev) {
  if (ev.type !== 'cast' || !isMe(ev.pid)) return;
  if (ev.skill === 'jump') { hopRun = ev.bhop ? hopRun + 1 : 0; if (hopRun >= 3) learnt('bhop'); else if (!$('tricks').classList.contains('hidden')) showTricks(); }
  else if (ev.skill === 'slideJump') learnt('slideJump');
  else if (ev.skill === 'jump2') learnt('jump2');
  else if (ev.skill === 'kick') learnt('kick');
  else if (ev.skill === 'bounce' || ev.skill === 'recoil') learnt('launch');
}
/**
 * (0.99.29) The Hounds fight alongside you on a hunt: `foes()` the beasts being hunted. Rowan cuts, Juni shoots,
 * Sorrel burns; their blows are smaller than yours (the kills are meant to be yours), and Rowan says so once.
 */
const HOUND_HIT = { rowan: 10, juni: 8, sorrel: 9 };
function houndsFight(foes) {
  return {
    foes,
    call: () => bark([['rowan', 'We\'ll hold the flanks. The kill\'s yours, Sprout: that\'s how you learn.']]),
    strike(who, b, a) {
      if (b.dead || !world.players.get(1)) return;
      if (who === 'juni') { const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; fx.shot({ x: a.x, z: a.z, dx: (b.x - a.x) / d, dz: (b.z - a.z) / d, speed: 45, range: Math.max(0, d - 0.6), kind: 'arrow', y: 1.3 }); }
      if (who === 'sorrel') fx.ring(b.x, b.z, 1.2, 0xff8a3a, 0.4);
      world.hurt(b, world.players.get(1), HOUND_HIT[who]);
    },
  };
}
function startHunt() {
  // set out along the west road, the Hounds behind you
  me.x = ROAD_IN.x + 16; me.z = ROAD_IN.z + 2; prev.x = me.x; prev.z = me.z;
  yaw = Math.PI; pitch = 0.2;
  for (const who of ['rowan', 'ilse', 'juni', 'sorrel']) {
    if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
    company[who].place(me.x + 3 + Math.random() * 2, me.z + (Math.random() - 0.5) * 4);
  }
  company.rowan.draw(true);
  setVigour(1);
  const wolves = ASHEN_AT.map((p) => world.borrowBeast('wolf', p.x, p.z, { story: 'ashen' })).filter(Boolean);
  hunt = { wolves, left: wolves.length, done: false };
  const f = follow(company, world.land, houndsFight(() => hunt.wolves.filter((b) => b.story === 'ashen')));
  questRun = { update(dt) { f.update(dt, me); } };
  toast('When It Counts', 'Four ashen wolves, near the glade');
  bark([['juni', 'Ash in the air. Smell that? Like a cold fireplace.'], ['rowan', 'Spread out. Not too far. Sprout, with me.']]);
  showQuest();
}
function huntEvent(ev) {
  if (!hunt || ev.type !== 'die' || ev.story !== 'ashen') return;
  hunt.left--;
  showQuest();
  if (hunt.left === 2) bark([['juni', 'Two more! They\'re not running. Wolves always run.']]);
  if (hunt.left > 0) return;
  hunt.done = true;
  bark([['rowan', 'That\'s all of them.'], ['sorrel', 'Rowan. The glade. Something\'s wrong at the glade.']]);
  const f = follow(company, world.land);
  questRun = { update(dt) { f.update(dt, me); if (Math.hypot(me.x - TEAR.x, me.z - TEAR.z) < 13) playVesper(); } };
}
// the fights: Vesper is one of the land's golems with his own numbers, drawn as a man
let boss = null; // { b (sim), stage: 1 or 2, t, healT }
function syncVesper(dt) {
  const v = company.vesper, b = boss && boss.b;
  if (!v || !b) return;
  const d = Math.hypot(b.x - v.x, b.z - v.z);
  v.place(b.x, b.z, b.facing);
  void d;
  if (v.looping !== 'idle' && !v.once && !v.held) v.loop('idle'); // (0.99.27) walking or running: his own feet decide
}
const fightRun = { update(dt) { for (const [who, a] of Object.entries(company)) if (who !== 'vesper') a.update(dt); if (company.vesper) company.vesper.update(dt); syncVesper(dt); fightTick(dt); } };
async function playVesper() {
  questRun = null;
  await runScene(vesperScene);
  const b = world.borrowBeast('golem', VESPER_FROM.x, VESPER_FROM.z, { story: 'vesper', def: VESPER, ward: 0.02, hidden: true });
  b.state = 'chase'; b.target = 1;
  boss = { b, stage: 1, t: 0, healT: 4 };
  for (const who of ['rowan', 'juni', 'sorrel']) company[who].loop('idle');
  bark([['vesper', 'Go on. Hit me. I\'d like to see what you\'ve got.']]);
  questRun = fightRun;
}
function fightTick(dt) {
  if (!boss || cutscene.active) return;
  boss.t += dt;
  if (boss.stage === 1) {
    // Ilse keeps him on his feet; he cannot touch Vesper; it ends when it must
    boss.healT -= dt;
    const ilse = company.ilse;
    if (boss.t > 2.5 && ilse && ilse.looping !== 'idle' && !ilse.once) ilse.loop('idle');
    if (boss.healT <= 0 && ilse) {
      boss.healT = 6;
      ilse.face(me.x, me.z);
      ilse.play('cast');
      fx.ring(me.x, me.z, 1.3, 0x8fff9a, 1.0);
      me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.22);
      if (boss.t < 9) bark([['ilse', 'I\'ve got you, Sprout! Keep moving!']]);
    }
    if ((boss.t > 7 || boss.hits >= 3) && !boss.warned) { boss.warned = true; bark([['', 'Nothing you do so much as marks him.']]); }
    // (0.99.30) it ends when he has had enough of being hit (an archer keeping her distance is never hurt), or he of you
    if (boss.t > 20 || (boss.hits || 0) >= 8 || me.hp < me.maxHp * 0.35) { boss.stage = 0; playDeath(); }
  } else if (boss.stage === 2) {
    if (me.hp < me.maxHp * 0.25) me.hp = me.maxHp * 0.25; // the Link holds him up
    if (boss.b.hp < boss.b.maxHp * 0.1) { boss.stage = 0; playAfter(); }
    else if (boss.b.hp < boss.b.maxHp * 0.4 && !boss.said2) { boss.said2 = true; bark([['vesper', 'Stop. That\'s... enough. I said that\'s enough!']]); }
    else if (boss.b.hp < boss.b.maxHp * 0.75 && !boss.said) { boss.said = true; bark([['vesper', 'Ha! A scratch. Do it again. I want to see how.']]); }
  }
}
function vesperEvent(ev) {
  if (!boss || ev.id !== boss.b.id) return;
  if (ev.type === 'hit' && boss.stage === 1) boss.hits = (boss.hits || 0) + 1;
  if (ev.type === 'swipe' && company.vesper) { company.vesper.play('cast', { speed: 0.9, fade: 0.2 }); fx.ring(boss.b.x, boss.b.z, 2.2, 0x2a0a3a, 0.35); } // (0.99.30) unhurried, blended in (it snapped)
}
async function playDeath() {
  boss.b.state = 'idle';
  boss.b.target = 0;
  boss.b.stunUntil = world.time + 1e6; // still while the scene plays
  await runScene(deathScene);
  boss.b.stunUntil = 0;
  boss.b.ward = null;
  boss.b.state = 'chase'; boss.b.target = 1;
  boss.stage = 2;
  questRun = fightRun; // (a scene clears the quest's own running: back to the fight)
  bark([['vesper', 'Show me.']]);
}
function wakeLink() {
  story.linked = true;
  saveStory(story);
  linkAwake = true;
  me.linked = true;
  me.surge = 3; // (the first waking: far stronger than he will be again for a long while)
  world.refit(me, true);
  drawLink();
  toast('The Dimension Link wakes', 'Your Eternal gear lends you its strength in Lacuna now');
}
cutscene.ctx.wakeLink = wakeLink;
cutscene.ctx.heroStrike = () => { hero.anim.start = true; hero.anim.period = 0.5; }; // (0.99.27) a blow, in a scene
async function playAfter() {
  boss.b.state = 'idle'; boss.b.target = 0; boss.b.stunUntil = world.time + 1e6;
  boss.b.hp = Math.max(1, boss.b.hp); // (he does not fall to a stray hit while the scene plays: the hero ends it)
  await runScene(afterScene);
  // done: Vesper is dead, by the hero's hand; Ilse is gone
  boss.b.dead = true; boss.b.diedAt = 1e12; boss.b.hidden = false;
  story.vesper = 'dead';
  boss = null;
  me.surge = 0;
  if (company.vesper) { company.vesper.remove(); delete company.vesper; }
  if (company.ilse) { company.ilse.remove(); delete company.ilse; }
  story.ilse = 'gone';
  setStage('mourning');
  toast('Quest complete: When It Counts', 'New quest: Word Gets Around');
  toMourning();
  playThessaly();
}
/** (0.99.27) Weeks later: Thessaly of the Ninth Hand, at the training ground. */
async function playThessaly() {
  if (story.thessaly) return startSpring();
  await runScene(thessalyScene);
  story.thessaly = true;
  saveStory(story);
  toMourning();
  showQuest();
  startSpring();
}

// ---- (0.99.29) Quest 5, Word Gets Around: three contracts across the land, then the Guild
function startSpring() {
  uses.clear();
  setTimeout(() => bark([['rowan', 'Sprout. When you\'re ready. The Guild\'s been asking for us.']]), 2500);
  uses.add({ at: () => company.rowan, r: 2.6, label: 'Talk to Rowan', fn: playSpring });
}
async function playSpring() {
  uses.clear();
  if (net) net.ws.close(1000, 'This part of the story is played alone');
  await runScene(springScene);
  story.done = [];
  setStage('contracts');
  startContracts();
}
let job = null; // { c (the contract), foes, left }
function startContracts() {
  for (const who of ['rowan', 'juni', 'sorrel']) {
    if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
    if (Math.hypot(company[who].x - me.x, company[who].z - me.z) > 8) company[who].place(me.x + 2 + Math.random() * 2, me.z + (Math.random() - 0.5) * 3);
  }
  company.rowan.draw(true);
  setVigour(1);
  const done = new Set(story.done || []);
  const left = CONTRACTS.filter((c) => !done.has(c.id));
  if (!left.length) return toReport();
  job = { list: left.map((c) => ({ c, foes: c.at.map((p) => world.borrowBeast(c.type, p.x, p.z, { story: 'ashen', job: c.id, def: c.def })).filter(Boolean), said: false })) };
  for (const j of job.list) j.left = j.foes.length;
  const f = follow(company, world.land, houndsFight(() => job.list.filter((q) => q.left > 0).flatMap((q) => q.foes).filter((b) => b.story === 'ashen')));
  questRun = { update(dt) {
    f.update(dt, me);
    for (const j of job.list) if (!j.said && j.left > 0 && j.foes.some((b) => !b.dead && b.story === 'ashen' && Math.hypot(b.x - me.x, b.z - me.z) < 22)) { j.said = true; bark(j.c.near); }
  } };
  toast('Word Gets Around', left.map((c) => c.title).join(' · '));
  showQuest();
}
function contractEvent(ev) {
  if (!job || ev.type !== 'die' || ev.story !== 'ashen') return;
  const j = job.list.find((q) => q.foes.some((b) => b.id === ev.id));
  if (!j || j.left <= 0) return;
  j.left--;
  if (j.left > 0) return showQuest();
  story.done = [...(story.done || []), j.c.id];
  saveStory(story);
  bark(j.c.done);
  toast('Contract done', j.c.title);
  if (job.list.every((q) => q.left <= 0)) setTimeout(toReport, 4000);
  showQuest();
}
function toReport() {
  job = null;
  setStage('report');
  toast('Word Gets Around', 'Report to Magistra Odile at the Guild');
  bark([['rowan', 'That\'s all three. Back to the Guild, and Sorrel can tell Odile what he\'s been muttering about.']]);
  const f = follow(company, world.land);
  questRun = { update(dt) { f.update(dt, me); if (Math.hypot(me.x - CRYSTAL.x, me.z - CRYSTAL.z) < 9) playReport(); } };
  showQuest();
}
async function playReport() {
  questRun = null;
  if (!company.odile) company.odile = new Actor(view.scene, 'odile', { beastMesh: () => new THREE.Group() });
  crowd.keepOut = { x: CRYSTAL.x, z: CRYSTAL.z, r: 7.5 };
  await runScene(reportScene);
  crowd.keepOut = null;
  story.rank = 'E';
  setStage('invitation');
  toast('Quest complete: Word Gets Around', 'Guild rank E (provisional)');
  for (const who of ['rowan', 'juni', 'sorrel', 'odile']) if (company[who]) company[who] = cutscene.keep(who) || company[who];
  if (company.dace) { company.dace.remove(); delete company.dace; }
  questRun = atGuild(company);
  showQuest();
  startInvitation();
}

// ---- (1.0) Quest 6, An Invitation: the letter, the watchtower, the wards, the circle (the end of Act I)
function hounds() {
  for (const who of ['rowan', 'juni', 'sorrel']) if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
  if (company.ilse) { company.ilse.remove(); delete company.ilse; }
}
function startInvitation() {
  uses.add({ at: HOME.door, r: 2.6, label: 'Pick up the letter', fn: playLetter });
  setTimeout(() => bark([['juni', 'Sprout! There\'s something under the lodging door with your name on it!']]), 4000);
}
async function playLetter() {
  uses.clear();
  if (net) net.ws.close(1000, 'This part of the story is played alone');
  hounds();
  await runScene(letterScene);
  setStage('tower');
  startTower();
}
function startTower() {
  hounds();
  company.rowan.draw(true);
  const f = follow(company, world.land);
  questRun = { update(dt) { f.update(dt, me); if (Math.hypot(me.x - WATCHTOWER.x, me.z - WATCHTOWER.z) < 16) playTower(); } };
  toast('An Invitation', 'The old watchtower on the north ridge');
  showQuest();
}
async function playTower() {
  questRun = null;
  if (net) net.ws.close(1000, 'This part of the story is played alone');
  await runScene(towerScene);
  setStage('wards');
  startWards();
}
const wardMeshes = [];
let wards = null; // [{ w, foes, broken }]
function startWards() {
  hounds();
  company.rowan.draw(true);
  story.wardsDone = story.wardsDone || [];
  wards = WARDS.map((w, i) => {
    const broken = story.wardsDone.includes(i);
    const foes = [];
    if (!broken) for (const [kind, n] of w.foes) for (let k = 0; k < n; k++) {
      const F = FOES[kind], a = (k / n) * Math.PI * 2;
      const b = world.borrowBeast(F.type, w.x + Math.cos(a) * 2.6, w.z + Math.sin(a) * 2.6, { story: 'unbound', look: F.look, def: F.def });
      if (b) foes.push(b);
    }
    if (!broken && !wardMeshes[i]) {
      // a ward: a black standing stone, a violet glow round its foot
      const g = new THREE.Group();
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.9, emissive: 0x2a0a40, emissiveIntensity: 0.6 }));
      stone.position.y = 1.1;
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a3ac0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 0.06;
      g.add(stone, glow);
      g.position.set(w.x, 0, w.z);
      view.scene.add(g);
      wardMeshes[i] = g;
    }
    return { w, i, foes, broken };
  });
  uses.clear();
  wards.forEach((W) => uses.add({ at: W.w, r: 2.4, label: 'Break the ward', when: () => !W.broken && W.foes.every((b) => b.dead || b.story !== 'unbound'), fn: () => breakWard(W) }));
  const f = follow(company, world.land, houndsFight(() => wards.flatMap((W) => W.foes).filter((b) => !b.dead && b.story === 'unbound')));
  let said = false;
  questRun = { update(dt) {
    f.update(dt, me);
    for (const m of wardMeshes) if (m) m.children[1].material.opacity = 0.35 + 0.2 * Math.sin(performance.now() / 300);
    if (!said && wards.some((W) => W.foes.some((b) => !b.dead && Math.hypot(b.x - me.x, b.z - me.z) < 18))) { said = true; bark([['sorrel', 'Those aren\'t beasts. Those were people, once. Ash all the way through.'], ['rowan', 'Then we put them down kindly. The kill\'s yours where you can, Sprout.']]); }
  } };
  showQuest();
}
function breakWard(W) {
  W.broken = true;
  story.wardsDone = [...(story.wardsDone || []), W.i];
  saveStory(story);
  fx.ring(W.w.x, W.w.z, 3, 0xffd24a, 0.6);
  fx.puff(W.w.x, W.w.z, 0x3a2a4a);
  if (wardMeshes[W.i]) { view.scene.remove(wardMeshes[W.i]); wardMeshes[W.i] = null; }
  const left = wards.filter((q) => !q.broken).length;
  toast('A ward broken', left ? `${left} left` : 'The last of them');
  if (!left) setTimeout(playCircle, 1500);
  else bark([[['juni', 'sorrel', 'rowan'][W.i % 3], ['One down. Two to go.', 'That\'s two. The last one\'s on the far side.', 'Last one. Stay close.'][3 - left - 1] || 'Next.']]);
  showQuest();
}
async function playCircle() {
  questRun = null;
  uses.clear();
  await runScene(circleScene);
  story.ninth = true;
  setStage('act2');
  toast('Quest complete: An Invitation', 'The End of Act I · you have joined the Ninth Hand');
  hounds();
  const f = follow(company, world.land);
  questRun = { update(dt) { f.update(dt, me); } };
  showQuest();
}

function toMourning() {
  for (const who of ['rowan', 'juni', 'sorrel']) if (!company[who]) company[who] = new Actor(view.scene, who, { beastMesh: () => new THREE.Group() });
  if (company.ilse) { company.ilse.remove(); delete company.ilse; }
  me.x = TRAINING.line.x - 4; me.z = TRAINING.line.z + 4; prev.x = me.x; prev.z = me.z;
  questRun = atTraining(company);
  company.rowan.sheathe(true);
  company.rowan.loop('idle');
}

// (0.99.29) the townsfolk's and the beasts' bodies start loading now, a couple at a time (they appear close up)
setTimeout(() => preload(['e_wolf', 'e_thornhog', 'v_farmer_m', 'v_farmer_f', 'v_elder_m', 'v_elder_f', 'v_miner_m', 'v_child', 'e_golem']), 1500);

/** (1.0) The nearest ward still standing. */
function nextWard() {
  const left = wards.filter((W) => !W.broken).sort((p, q) => Math.hypot(p.w.x - me.x, p.w.z - me.z) - Math.hypot(q.w.x - me.x, q.w.z - me.z));
  return left.length ? left[0].w : null;
}

/** (0.99.29) The nearest beast still to be hunted for a contract. */
function nearestFoe() {
  let best = null, bd = Infinity;
  for (const j of job.list) if (j.left > 0) for (const b of j.foes) if (!b.dead && b.story === 'ashen') { const d = Math.hypot(b.x - me.x, b.z - me.z); if (d < bd) { bd = d; best = b; } }
  return best;
}

// where the story stands when the page opens
if (story.stage === 'new') setTimeout(playOpening, 300);
else if (story.stage === 'stumble') {
  me.x = TEAR.x + 1.5; me.z = TEAR.z + 3.5;
  riftClosing = 0.93;
  setFog(FOG_AT.stumble, 0);
  startStumble();
  showQuest();
} else if (story.stage === 'rescued') {
  me.x = GLADE_EDGE.x; me.z = GLADE_EDGE.z;
  setFog(FOG_AT.rescued, 0);
  startRescued();
  showQuest();
} else if (story.stage === 'waking') {
  me.x = ROAD_IN.x - 2; me.z = ROAD_IN.z + 3;
  companyAt({ juni: [ROAD_IN.x + 3, ROAD_IN.z], rowan: [ROAD_IN.x, ROAD_IN.z], ilse: [ROAD_IN.x - 2, ROAD_IN.z + 1], sorrel: [ROAD_IN.x - 3, ROAD_IN.z - 1] });
  yaw = 0;
  startWalk();
} else if (story.stage === 'days') {
  toGuild();
  setTimeout(() => startDay(story.day || 0), 0); // (after the page has finished setting up)
} else if (story.stage === 'crystal') {
  toGuild();
  showQuest();
} else if (story.stage === 'hunt') {
  toGuild();
  setTimeout(startHunt, 0);
} else if (story.stage === 'asking') {
  toGuild();
  setTimeout(playAsking, 300);
} else if (story.stage === 'mourning') {
  setTimeout(() => { toMourning(); playThessaly(); }, 0);
} else if (story.stage === 'contracts') {
  setTimeout(() => { toMourning(); startContracts(); }, 0);
} else if (story.stage === 'report') {
  setTimeout(() => { toMourning(); toReport(); }, 0);
} else if (story.stage === 'invitation') {
  toGuild();
  crystal.mark(true);
  showQuest();
  startInvitation();
} else if (story.stage === 'tower') {
  setTimeout(startTower, 0);
} else if (story.stage === 'wards') {
  me.x = WATCHTOWER.x - 2; me.z = WATCHTOWER.z + 16; prev.x = me.x; prev.z = me.z;
  setTimeout(startWards, 0);
} else if (story.stage === 'act2') {
  toGuild();
  crystal.mark(true);
  showQuest();
} else if (story.stage === 'path' || story.stage === 'ambush') {
  toGuild();
  questRun = atTraining(company);
  crystal.mark(true);
  if (story.stage === 'ambush') setTimeout(startAmbush, 0);
  if (story.stage === 'path' && (story.trial === 'warrior' || story.trial === 'archer')) startTrial(story.trial);
  else if (story.stage === 'path' && story.trial === 'choose') setTimeout(showChoose, 600);
  showQuest();
}

if (story.stage !== 'new') riftClosing = 0.93; // what is left of the tear
setFog(FOG_AT[story.stage] ?? 0, 0);

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
  const dt = Math.min(0.1, (now - last) / 1000) * TIMESCALE;
  last = now;
  time += dt;
  perf.worstNow = Math.max(perf.worstNow, dt * 1000);
  acc += dt;
  if (firing && !me.dead && !cutscene.active) act('basic');
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
  if (me.g >= 1 && me.y <= me.g + 0.01 && !(story.tricks && story.tricks.rock)) learnt('rock'); // (0.99.35) up on a tall rock
  heroX = prev.x + (me.x - prev.x) * alpha;
  heroZ = prev.z + (me.z - prev.z) * alpha;
  const hx = heroX, hz = heroZ;
  // together: say where you are, ten times a second (and see how long the server takes to answer, now and then)
  if (net && net.ready && now - net.sentAt >= 1000 / SEND_HZ) {
    net.sentAt = now;
    net.send({ t: 'pos', x: +me.x.toFixed(3), z: +me.z.toFixed(3), y: +me.y.toFixed(2), f: +me.facing.toFixed(3), m: me.moving ? 1 : 0, p: me.pace });
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
  if (cutscene.active) cutscene.beforePose();
  pose(hero, dt, { moving: me.moving || !!hero.anim.sceneWalk, speed: hero.anim.sceneWalk ? 1.6 : me.speed, walk: (me.pace === 'walk' && me.moving) || !!hero.anim.sceneWalk, dead: me.dead, y: heroY });
  // the camera: over the right shoulder (or, scoped, through the hero's eyes), kept above the ground
  const lx = Math.cos(yaw) * Math.cos(pitch), ly = -Math.sin(pitch), lz = Math.sin(yaw) * Math.cos(pitch);
  const rx = -Math.sin(yaw), rz = Math.cos(yaw);
  if (cutscene.active) cutscene.update(dt);
  else if (scoped) {
    camPos.set(hx + Math.cos(yaw) * 0.2, HERO_H * 0.9 + heroY, hz + Math.sin(yaw) * 0.2);
    view.camera.position.copy(camPos);
    view.camera.lookAt(camPos.x + lx * 10, camPos.y + ly * 10, camPos.z + lz * 10);
  } else {
    camTarget.set(hx + rx * 0.5, HERO_H * 1.05 + heroY * 0.6, hz + rz * 0.5); // (follows a hop a little, not all the way: less bobbing)
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
    view.drawSeen(seenBeasts, time, hx, hz);
    fxBeasts = seenBeasts;
    for (const [pid, o] of others) {
      const s = seen.get(PLAYER_ID + pid);
      o.hero.group.visible = !!s;
      if (!s) { o.label.style.display = 'none'; continue; }
      o.hero.group.position.set(s.x, 0, s.z);
      o.hero.group.rotation.y = Math.PI / 2 - s.facing;
      // (0.99.35) their height, as the server last told it (a rock's top, a double jump), fading if it stops
      const ay = airOf.get(pid);
      const y = ay && performance.now() - ay.at < 400 ? ay.y : undefined;
      pose(o.hero, dt, { moving: s.moving, speed: 5.6, dead: s.dead, y });
      proj.set(s.x, 2.35, s.z).project(view.camera);
      const off = proj.z > 1 || Math.hypot(s.x - hx, s.z - hz) > 60;
      o.label.style.display = off ? 'none' : '';
      if (!off) o.label.style.transform = `translate(${((proj.x + 1) / 2) * innerWidth}px, ${((1 - proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    }
  } else {
    view.drawBeasts(hx, hz, alpha, time);
    nearBeasts.length = 0;
    for (const b of world.beasts) if (!b.dead && (b.x - hx) ** 2 + (b.z - hz) ** 2 < 60 * 60) nearBeasts.push({ id: b.id, x: b.x, z: b.z, r: (b.def && b.def.r) || BEASTS[b.type].r, hp: b.hp / b.maxHp, dead: b.dead, tall: b.type === 'golem' ? 2.9 : 1.8, rank: b.rank || 0, name: b.name, size: b.size, lv: b.lv, state: b.state });
    fxBeasts = nearBeasts;
  }
  fx.update(dt, fxBeasts, view.camera, innerWidth, innerHeight, !!me.oath, hx, hz);
  drawBossBar(fxBeasts, hx, hz);
  if (riftRing) riftRing.material.opacity = (ashRift ? 0.75 : 0.32) + 0.12 * Math.sin(performance.now() / 260);
  if (questRun && !cutscene.active) questRun.update(dt, me);
  crystal.update(dt);
  if (story.stage === 'crystal' && !cutscene.active && questRun && Math.hypot(me.x - CRYSTAL.x, me.z - CRYSTAL.z) < 6.5) playCrystal();
  if (story.stage === 'path' && !story.trial && !trial && !cutscene.active && questRun && Math.hypot(me.x - TRAINING.ring.x, me.z - TRAINING.ring.z) < 12) playTraining();
  updateBubbles(dt);
  followAim(dt);
  drawFog(dt, performance.now() / 1000);
  drawRift(dt);
  if (keepsakeMesh) { const tw = 0.28 + Math.abs(Math.sin(performance.now() / 380)) * 0.18; keepsakeMesh.scale.setScalar(tw); } // it twinkles
  const near = nearestUse();
  $('hint').classList.toggle('hidden', !near);
  if (near) $('hint').innerHTML = `<b>F</b>${near.label}`;
  drawMarker();
  if (barkT > 0 && (barkT -= dt) <= 0) nextBark();
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.add('hidden');
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
note('Click to look around. Left click to attack, Q E R for skills, 1-2 to change class. Space to jump. Hold T for emotes, Y for emoticons. Hold Alt to use the mouse.');
setTimeout(featureCheck, 3000); // (1.0) New Content already done in an older save: its reward, once
applyGear(); // (1.1) what you wear
window.land = { world, view, crowd, me, fx, hero, get __web() { return webUI; }, __load: (id) => loadRigged(id).then((t) => !!t, (e) => String(e)), __company: company, __target: () => { const t = day && day.marker && day.marker(); return t ? { x: t.x, z: t.z } : null; }, __use: () => { const u = nearestUse(); return u ? u.label : null; }, __home: HOME.door, __board: BOARD_AT, __ward: () => wards && nextWard(), setYaw: (y) => (yaw = y), setPitch: (p) => (pitch = p), addBot, wear, joinServer, act, aimPoint, others, seen, get net() { return net; } }; // (tests)
