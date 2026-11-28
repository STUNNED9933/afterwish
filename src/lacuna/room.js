// Lacuna (Chapter 2), engine phase 1: the land on the server, shared by everyone on it.
//
// One land per server (area splitting comes when one land is not enough). The server runs the beasts; each
// player moves themselves in their own browser (so it feels instant) and says where they are ten times a
// second; the server checks it (no faster than a sprint, never inside anything) and puts them back if not.
// Each player is sent, ten times a second, only what they can see and only what changed (see net.js).
//
// Messages, browser to server (JSON): hello { v, pass, name, cls }, pos { x, z, f, m, p }, cls { cls },
// act { k, ax, az } (a blow or skill, aimed at a point), jump, emote { id }, face { id } (an emoticon), chat { text }, ping { at }. Server to browser: welcome,
// reject, roster, snap (go back here), me (your health, mana, cooldowns), evs (what happened near you: shots,
// hits, falls, casts), chat, pong (JSON), and the state of what is in sight (binary, net.js).
// (phase 2) The Dimension Link comes from the account's characters when signed in (linkOf), else from the page.
// No storage and no save: the test land keeps nothing. It is behind the server world's passcode.
import { LandWorld, TICK, SPEED, KITS, LINK_SLOTS, MOVE, ACTS } from './sim.js';
import { Interest, SEND_HZ } from './net.js';
import { TOWN, HALF } from './land.js';
import { EMOTE_IDS, EMOTICONS } from './emotes.js';
import { valid as validItem, cleanWorn } from './loot.js';
import { levelOf } from './levels.js';

export const LACUNA_NET = 'L2'; // (1.1) gear, rifts, elites' marks
export const LAND_LIMITS = { players: 24, nameLen: 16, chatLen: 140, chatGap: 0.6 };
const CLASSES = Object.keys(KITS); // (phase 2) the opening's two classes
const R = 0.4;

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

export class LandRoom {
  /** send(conn, obj) sends JSON; sendBin(conn, ArrayBuffer) sends bytes; close(conn, why) ends it. */
  constructor({ send, sendBin, close = () => {}, passcode = '', seed, linkOf = null, progress = null } = {}) {
    this.linkOf = linkOf; // (session) -> Eternal levels by slot, or null (not signed in)
    this.progress = progress; // (0.99.38) { get(session), put(session, data) }: Lacuna progress kept with an account
    this.send = send;
    this.sendBin = sendBin;
    this.close = close;
    this.passcode = passcode;
    this.seed = seed;
    this.world = null; // made when the first player comes
    this.byConn = new Map(); // conn -> member
    this.nextPid = 1;
    this.acc = 0;
    this.steps = 0;
  }

  get size() {
    return this.byConn.size;
  }

  message(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const m = this.byConn.get(conn);
    if (!m) return msg.t === 'hello' ? this.hello(conn, msg) : undefined;
    if (msg.t === 'pos') this.pos(m, msg);
    else if (msg.t === 'cls' && CLASSES.includes(msg.cls) && msg.cls !== m.cls) { m.cls = msg.cls; this.world.setClass(m.pid, m.cls); this.roster(); }
    else if (msg.t === 'web') this.world.setWeb(m.pid, msg.ids);
    else if (msg.t === 'gear') this.world.setGear(m.pid, msg.worn); // (1.1) what they wear (checked: could have dropped for their level)
    else if (msg.t === 'rift') { const t = num(msg.tier, 1, 30); if (t === null || !this.world.openRift(m.pid, t)) this.send(conn, { t: 'riftNo' }); } // (1.1) the Ash Rift
    else if (msg.t === 'progress') this.keep(m, msg); // (0.99.38) the page's progress, kept with the account // (0.99.37) talents (checked: joined up, no more than the level allows)
    else if (msg.t === 'lvl') { const L = num(msg.L, 1, 60); if (L !== null) this.world.setLevel(m.pid, L); } // (0.99.36) the page's level (for now; with accounts, the server's)
    else if (msg.t === 'vig') { const v = num(msg.v, 0.5, 1); if (v !== null) this.world.setVigour(m.pid, v); } // (0.99.24) the page says how strong he has grown (for now)
    else if (msg.t === 'act') {
      const ax = num(msg.ax, -HALF, HALF), az = num(msg.az, -HALF, HALF);
      if (ax !== null && az !== null && ACTS.has(msg.k)) this.world.act(m.pid, msg.k, ax, az, msg.up === true, msg.down === true);
    }
    else if (msg.t === 'jump') this.world.jump(m.pid);
    else if (msg.t === 'slide') { const p = this.world.players.get(m.pid); if (p && !p.dead) this.world.emit('cast', { pid: m.pid, skill: 'slide', x: p.x, z: p.z, dur: MOVE.slideDur }); } // (0.99.35) for others to draw
    else if (msg.t === 'aim') { const ax = num(msg.ax, -HALF, HALF), az = num(msg.az, -HALF, HALF); if (ax !== null && az !== null) this.world.aim(m.pid, ax, az); } // (0.99.25) a drawn Deadeye following the aim
    else if ((msg.t === 'emote' && EMOTE_IDS.includes(msg.id)) || (msg.t === 'face' && EMOTICONS.includes(msg.id))) {
      // (0.99.19) an emote or an emoticon: for everyone near to see (not too often)
      const p = this.world.players.get(m.pid);
      if (!p || p.dead || this.world.time - (m.emoteAt || -1e9) < 0.4) return;
      m.emoteAt = this.world.time;
      this.world.emit(msg.t, { pid: m.pid, id: msg.id, x: p.x, z: p.z });
    }
    else if (msg.t === 'chat') this.chat(m, msg.text);
    else if (msg.t === 'ping') this.send(conn, { t: 'pong', at: num(msg.at, 0, 1e15) });
  }

  hello(conn, msg) {
    const no = (reason) => { this.send(conn, { t: 'reject', reason }); this.close(conn, reason); };
    if (msg.v !== LACUNA_NET) return no('Your page is out of date: reload it.');
    if (!this.passcode) return no('The server world is not open (no passcode is set).');
    if (msg.pass !== this.passcode) return no('That passcode is not right.');
    if (this.byConn.size >= LAND_LIMITS.players) return no(`The land is full (${LAND_LIMITS.players} players).`);
    if (!this.world) this.world = new LandWorld(this.seed !== undefined ? { seed: this.seed } : {});
    const pid = this.nextPid++;
    const name = String(msg.name || '').replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, LAND_LIMITS.nameLen) || `Traveller ${pid}`;
    const k = pid % 8;
    const at = { x: TOWN.x - 6 + (k % 4) * 4, z: TOWN.z + TOWN.r + 4 + Math.floor(k / 4) * 3 }; // by the south gate, side by side
    const cls = CLASSES.includes(msg.cls) ? msg.cls : 'warrior';
    // the Dimension Link: the account's own Eternal gear when signed in; otherwise what the page says (test land)
    const fromAccount = this.linkOf && msg.session ? this.linkOf(String(msg.session)) : null;
    const link = {};
    const src = fromAccount || (msg.link && typeof msg.link === 'object' ? msg.link : {});
    for (const slot of LINK_SLOTS) { const v = num(src[slot], 0, 30); if (v) link[slot] = Math.floor(v); }
    // (0.99.22) the Link sleeps until the story wakes it (the page says so for now; with accounts, the server will)
    const p = this.world.addPlayer(pid, at, { cls, link, linked: msg.linked === true, vigour: num(msg.vigour, 0.5, 1) ?? 1, level: num(msg.level, 1, 60) ?? 1 });
    p.driven = true; // moved by its own browser (checked), not by the sim
    if (Array.isArray(msg.web)) this.world.setWeb(pid, msg.web); // (0.99.37) talents
    if (msg.worn && typeof msg.worn === 'object') this.world.setGear(pid, msg.worn); // (1.1) gear
    const m = { conn, pid, name, cls, wire: new Interest(pid), last: { x: p.x, z: p.z, t: this.world.time }, chatAt: -1e9, me: '', linkFrom: fromAccount ? 'account' : 'page', session: typeof msg.session === 'string' ? msg.session.slice(0, 200) : '' };
    this.byConn.set(conn, m);
    this.send(conn, { t: 'welcome', pid, name, at: { x: p.x, z: p.z }, v: LACUNA_NET, hz: SEND_HZ, link, linkFrom: m.linkFrom });
    // (0.99.38) what the account has kept: the page compares it with its own and keeps the further on
    const kept = this.progress && m.session ? this.progress.get(m.session) : null;
    if (kept) this.send(conn, { t: 'progress', ...kept });
    this.roster();
    this.chatAll(`${name} has arrived.`);
  }

  /** Where a player says they are: taken if it could be so, otherwise they are put back. */
  pos(m, msg) {
    const w = this.world, p = w.players.get(m.pid);
    const x = num(msg.x, -HALF, HALF), z = num(msg.z, -HALF, HALF);
    if (!p || x === null || z === null) return;
    const dt = Math.max(TICK, w.time - m.last.t);
    const far = Math.hypot(x - m.last.x, z - m.last.z);
    if (p.dead) return; // down: you stay where you fell (the server brings you back to the gate)
    // faster than anyone can go (a leap or a roll allows for itself; (0.99.35) a bunny hop or a slide-jump is held to MOVE.cap)
    if (far > Math.max(SPEED.sprint, (MOVE.cap + Math.max(0, (p.web && p.web.mods.move) || 0)) * SPEED.run) * dt * 1.3 + 1.5 + p.burst) { p.burst = 0; return this.snap(m, p); }
    p.burst = Math.max(0, p.burst - far);
    p.x = x; p.z = z;
    p.y = num(msg.y, 0, 6) ?? 0; // (0.99.35) how high (a jump, a rock's top): over a rock is not inside it
    w.land.pushOut(p, R);
    if (Math.hypot(p.x - x, p.z - z) > 0.6) return this.snap(m, p); // inside something
    const f = num(msg.f, -10, 10);
    if (f !== null) p.facing = f;
    p.moving = !!msg.m;
    p.pace = SPEED[msg.p] ? msg.p : 'run';
    p.speed = p.moving ? SPEED[p.pace] : 0;
    m.last = { x: p.x, z: p.z, t: w.time };
  }

  /**
   * (0.99.38) Progress (experience, talent webs, tricks) to keep with a signed-in player's account: the most
   * experience either side has seen wins (progress is earned in the story, which is played alone in the browser).
   */
  keep(m, msg) {
    if (!this.progress || !m.session) return;
    const xp = num(msg.xp, 0, 1e8);
    if (xp === null) return;
    const web = {};
    for (const cls of Object.keys(KITS)) if (msg.web && Array.isArray(msg.web[cls])) web[cls] = msg.web[cls].filter((i) => Number.isInteger(i) && i >= 0 && i < 2000).slice(0, 80);
    const tricks = {};
    if (msg.tricks && typeof msg.tricks === 'object') for (const k of Object.keys(msg.tricks).slice(0, 20)) if (/^[a-zA-Z0-9]{1,16}$/.test(k)) tricks[k] = true;
    // (1.1) gear: what is worn, the bag (up to 80) and the shards; only what could have dropped at their level
    const level = levelOf(xp).level;
    let gear;
    if (msg.gear && typeof msg.gear === 'object') {
      const bag = Array.isArray(msg.gear.bag) ? msg.gear.bag.slice(0, 80).filter((it) => validItem(it, level)).map((it) => Object.values(cleanWorn({ [it.slot]: it }, level))[0]).filter(Boolean) : [];
      gear = { worn: cleanWorn(msg.gear.worn, level), bag, shards: num(msg.gear.shards, 0, 1e7) || 0, rift: num(msg.gear.rift, 0, 30) || 0 };
    }
    const had = this.progress.get(m.session);
    if (had && had.xp > xp) return this.send(m.conn, { t: 'progress', ...had }); // the account is further on: the page takes it
    this.progress.put(m.session, { xp: Math.floor(xp), web, tricks, ...(gear ? { gear } : had && had.gear ? { gear: had.gear } : {}) });
  }

  snap(m, p) {
    m.last = { x: p.x = m.last.x, z: p.z = m.last.z, t: this.world.time };
    this.send(m.conn, { t: 'snap', x: p.x, z: p.z });
  }

  chat(m, text) {
    const t = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, LAND_LIMITS.chatLen);
    if (!t || this.world.time - m.chatAt < LAND_LIMITS.chatGap) return;
    m.chatAt = this.world.time;
    for (const o of this.byConn.values()) this.send(o.conn, { t: 'chat', name: m.name, pid: m.pid, text: t });
  }

  chatAll(text) {
    for (const o of this.byConn.values()) this.send(o.conn, { t: 'chat', text });
  }

  roster() {
    const players = [...this.byConn.values()].map((o) => ({ pid: o.pid, name: o.name, cls: o.cls }));
    for (const o of this.byConn.values()) this.send(o.conn, { t: 'roster', players });
  }

  leave(conn) {
    const m = this.byConn.get(conn);
    if (!m) return;
    this.byConn.delete(conn);
    this.world.removePlayer(m.pid);
    this.roster();
    this.chatAll(`${m.name} has gone.`);
  }

  /** Called by the server's clock with however much time has passed. */
  tick(dt) {
    if (!this.world || !this.byConn.size) return;
    this.acc += Math.min(0.25, dt);
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.world.step(TICK);
      this.steps++;
      if (this.steps % Math.round(1 / TICK / SEND_HZ) === 0) this.sendState();
    }
  }

  sendState() {
    const events = this.world.events.splice(0);
    for (const m of this.byConn.values()) {
      const p = this.world.players.get(m.pid);
      if (!p) continue;
      // what happened near you (your own shots and casts your page already showed, so not those)
      const evs = [];
      for (const ev of events) {
        if (ev.type === 'up' && ev.pid === m.pid) { m.last = { x: p.x, z: p.z, t: this.world.time }; this.send(m.conn, { t: 'snap', x: p.x, z: p.z }); }
        if ((ev.type === 'shot' || ev.type === 'cast' || ev.type === 'emote' || ev.type === 'face') && ev.pid === m.pid) continue;
        if (ev.x !== undefined && Math.hypot(ev.x - p.x, ev.z - p.z) > 150) continue;
        evs.push(ev);
      }
      if (evs.length) this.send(m.conn, { t: 'evs', list: evs });
      // your health, mana and cooldowns, when they change
      const me = [Math.round(p.hp), p.maxHp, Math.floor(p.mp), p.maxMp, ...['Q', 'E', 'R'].map((k) => Math.max(0, Math.ceil(p.cd[k] * 10) / 10)), p.oath ? 1 : 0, p.dead ? Math.ceil(p.downT) : 0, +p.mult.toFixed(2)];
      const key = me.join();
      if (key !== m.me) { m.me = key; this.send(m.conn, { t: 'me', v: me }); }
    }
    // (1.1) which beasts in sight are more than they look (elites, named, bosses, a rift's foes): once a second, if changed
    if (this.steps % 30 === 0) {
      for (const m of this.byConn.values()) {
        const p = this.world.players.get(m.pid);
        if (!p) continue;
        const marks = [];
        for (const b of this.world.beasts) if (!b.dead && (b.rank || b.look) && Math.hypot(b.x - p.x, b.z - p.z) < 150) marks.push([b.id, b.rank || 0, b.name || '', b.look || '', b.size || 1, b.lv || 0]);
        const key = JSON.stringify(marks);
        if (key !== m.marks) { m.marks = key; this.send(m.conn, { t: 'marks', m: marks }); }
      }
    }
    for (const m of this.byConn.values()) {
      const buf = m.wire.delta(this.world);
      if (buf) this.sendBin(m.conn, buf);
    }
    // (0.99.35) who is off the ground, and how high (in cm): for others to draw them there
    const air = [];
    for (const p of this.world.players.values()) if (p.y > 0.05) air.push([p.pid, Math.round(p.y * 100)]);
    if (air.length || this.airWas) for (const m of this.byConn.values()) this.send(m.conn, { t: 'air', a: air.filter(([pid]) => pid !== m.pid) });
    this.airWas = air.length > 0;
  }
}
