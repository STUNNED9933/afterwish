// The server world (0.55): an always-on place friends join with a passcode, run on a server instead
// of one player's browser. Everyone meets in Haven; out on the road each party (or a hero alone)
// gets its own copy of a map, so parties can be on different maps at once. Rifts, delves and the
// Deep take just your party, into a copy of their own.
//
// This file is the whole of it apart from the transport: the Cloudflare Durable Object in
// server/src/world-do.js feeds it connections and messages, and test/shards.test.mjs drives it in Node.
// Each copy is an ordinary World (the same rules as single player); a hero who leaves one is moved
// to another by goMap's travelHook, carried across in their save.
import { World } from '../sim/world.js';
import { CLASSES } from '../sim/classes.js';
import { CONFIG } from '../config.js';
import { MAPS } from '../sim/maps.js';
import { makeSnapshot, eventFor, compactEvents, NET_VERSION } from './sync.js';
import { FRIEND_CMDS } from './cmds.js';

// (0.55.2) on the server each hero is their own: they may also be reborn and Unwish, as in single player
const SERVER_CMDS = new Set([...FRIEND_CMDS, 'setDepth', 'rebirth', 'unwish']);
// players: on the whole server. perCopy: in one copy of a road map. haven: in one copy of Haven (a
// full Haven opens another, so a crowd never costs anyone frames: each hero in view is ~15 draws).
export const SERVER_LIMITS = { players: 24, perCopy: 8, haven: 16, chatLen: 140, chatGap: 0.6, partyMax: CONFIG.PARTY_MAX, msgBytes: 64 * 1024 };

const clean = (text, n) => String(text || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);

export class ServerWorld {
  /**
   * send(conn, msg): deliver a message to one connection. close(conn, reason): drop it.
   * passcode: what a friend must type to get in ('' or missing: nobody gets in).
   * congested(conn): true while that connection's outgoing queue is backed up (it gets no new update
   * until it has caught up, so it never falls further and further behind).
   */
  constructor({ send, close = () => {}, congested = () => false, passcode = '', name = 'Afterwish', seed = Date.now(), maxPlayers = SERVER_LIMITS.players, havenMax = SERVER_LIMITS.haven, accounts = null, requireAccount = false }) {
    Object.assign(this, { send, close, congested, passcode: String(passcode || ''), name });
    // (0.57) Online characters: with an account store, a signed-in hero's save and wallet come from the
    // store and go back to it; the browser's own copy is never trusted. requireAccount: no other way in.
    this.accounts = accounts;
    this.requireAccount = !!(accounts && requireAccount);
    this.maxPlayers = Math.max(1, Math.floor(maxPlayers) || SERVER_LIMITS.players);
    this.havenMax = Math.max(2, Math.floor(havenMax) || SERVER_LIMITS.haven);
    this.seed = seed >>> 0;
    this.players = new Map(); // pid -> player
    this.byConn = new Map(); // conn -> pid
    this.copies = new Map(); // key -> { key, world, map }
    this.parties = new Map(); // id -> { id, leader, members: Set }
    this.nextPid = 1;
    this.nextParty = 1;
    this.ticks = 0;
    this.moves = [];
    this.reborn = [];
    this.rosterDirty = false;
  }

  get size() {
    return this.players.size;
  }

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------
  /** A message arrived on `conn` (already parsed). The first must be a hello. */
  message(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const pid = this.byConn.get(conn);
    if (pid === undefined) {
      if (msg.t === 'hello') this.join(conn, msg);
      return;
    }
    const pl = this.players.get(pid);
    if (!pl) return;
    pl.seen = this.ticks;
    if (msg.t === 'cmd' && msg.cmd && typeof msg.cmd.type === 'string') this.command(pl, msg.cmd);
    else if (msg.t === 'resync') pl.memo = {};
    else if (msg.t === 'ping') {
      pl.rtt = Number(msg.rtt) || 0;
      this.send(conn, { t: 'pong', at: msg.at });
    } else if (msg.t === 'bye') this.leave(conn, true);
  }

  join(conn, hello) {
    const say = (reason) => {
      this.send(conn, { t: 'reject', reason });
      this.close(conn, reason);
    };
    if (hello.v !== NET_VERSION) return say('You and the server are on different versions of the game. Reload the page (Ctrl+F5) and try again.');
    if (!this.passcode) return say('The server world is not open yet (its owner has not set a passcode).');
    if (String(hello.pass || '') !== this.passcode) return say('Wrong passcode.');
    if (this.players.size >= this.maxPlayers) return say(`This server is full (${this.maxPlayers} players). Try again later, or another server.`);
    let acct = null;
    if (this.accounts && hello.session) {
      acct = this.accounts.bySession(String(hello.session));
      if (!acct) return say('Your sign-in has run out. Sign in again (Play with friends, Your account).');
      if ([...this.players.values()].some((o) => o.accountId === acct.id)) return say('You are already in this server world, in another tab or on another computer.');
    } else if (this.requireAccount) return say('Sign in with Google or Discord to play in this server world (Play with friends, Your account). Your characters come with you once.');
    const pid = this.nextPid++;
    let name = clean(hello.name, 16) || 'Player';
    const taken = new Set([...this.players.values()].map((p) => p.name));
    for (let i = 2; taken.has(name); i++) name = `${clean(hello.name, 13) || 'Player'} ${i}`;
    const pl = { pid, conn, name, memo: {}, pending: [], copy: null, party: null, invites: new Set(), seen: 0, rtt: 0, chatAt: -1e9, savedKey: '' };
    this.players.set(pid, pl);
    this.byConn.set(conn, pid);
    const cls = CLASSES[hello.cls] ? hello.cls : 'warrior';
    this.send(conn, { t: 'welcome', pid, code: this.name, server: true, online: !!acct });
    let save = hello.save && typeof hello.save === 'object' ? hello.save : null;
    let gold = hello.gold, tickets = hello.tickets;
    pl.acctRebirths = Math.max(0, Math.floor(Number(hello.acctRebirths) || 0));
    if (acct) {
      // (0.57) an online character: everything from the account, nothing from the browser
      pl.accountId = acct.id;
      save = this.accounts.getChar(acct.id, cls);
      gold = acct.wallet.gold;
      tickets = acct.wallet.tickets;
      pl.acctRebirths = acct.wallet.rebirths || 0;
    }
    const signs = Array.isArray(hello.signs) ? hello.signs.slice(0, 200).map(String) : []; // (0.56.4) the account's
    this.place(pl, 'town', null, null, { save, name, cls, parry: hello.parry, autoAttack: hello.autoAttack !== false, gold, tickets, signs });
    this.chatAll(`${name} arrived in Haven.`);
    this.rosterDirty = true;
  }

  /** A connection closed (or said bye). Their latest save went to them a moment ago. */
  leave(conn, polite = false) {
    const pid = this.byConn.get(conn);
    if (pid === undefined) return;
    this.byConn.delete(conn);
    const pl = this.players.get(pid);
    if (!pl) return;
    if (polite || pl.accountId) this.sendSave(pl, true); // (an online character is kept even if they just vanish)
    this.partyLeave(pl, true);
    for (const other of this.players.values()) other.invites.delete(pid);
    if (pl.copy) this.removeFrom(pl.copy, pid);
    this.players.delete(pid);
    this.chatAll(`${pl.name} left.`);
    this.rosterDirty = true;
  }

  // -------------------------------------------------------------------------
  // Map copies
  // -------------------------------------------------------------------------
  partyKey(pl) {
    return pl.party ? 'party' + pl.party : 'solo' + pl.pid;
  }

  /** Which copy of Haven: one with party members in it, else the first with room, else a new one. */
  havenKey(pl) {
    const havens = [...this.copies.values()].filter((c) => c.key === 'town' || c.key.startsWith('town#'));
    if (pl.party) {
      const members = this.parties.get(pl.party).members;
      const withParty = havens.find((c) => c.world.heroes.length < this.havenMax && c.world.heroes.some((h) => h.pid !== pl.pid && members.has(h.pid)));
      if (withParty) return withParty.key;
    }
    const room = havens.find((c) => c.world.heroes.length < this.havenMax);
    if (room) return room.key;
    if (!this.copies.has('town')) return 'town';
    for (let i = 2; ; i++) if (!this.copies.has('town#' + i)) return 'town#' + i;
  }

  keyFor(pl, to, extra) {
    if (to === 'town') return this.havenKey(pl);
    if (extra && extra.rift) return `rift:${this.partyKey(pl)}:${extra.rift.seed}`;
    if (extra && extra.delve) return `delve:${this.partyKey(pl)}:${extra.delve.seed}`;
    if (to === 'rift' || to === 'delve') return null; // (only ever entered with a run to start)
    return `${to}:${this.partyKey(pl)}`;
  }

  /** Put a hero (described by `hello`: save, name, class...) into the copy for `to`. */
  place(pl, to, from, extra, hello) {
    let key = this.keyFor(pl, to, extra);
    if (!key || (!MAPS[to] && to !== 'rift' && to !== 'delve')) key = this.havenKey(pl);
    if (extra && extra.joinKey && this.copies.has(extra.joinKey)) key = extra.joinKey; // party members going into a rift or delve
    else if (pl.party && key !== 'town' && !(extra && (extra.rift || extra.delve))) {
      // a party member is already on that map: join their copy
      for (const pid of this.parties.get(pl.party).members) {
        const m = this.players.get(pid);
        if (m && m !== pl && m.copy && m.copy.world.map.id === to && this.copies.has(m.copy.key)) {
          key = m.copy.key;
          break;
        }
      }
    }
    let copy = this.copies.get(key);
    if (copy && copy.world.heroes.length >= SERVER_LIMITS.perCopy && !this.isHaven(key)) {
      key = `${key}:${pl.pid}`; // a full copy (a big party): this hero gets a copy of their own
      copy = this.copies.get(key);
    }
    if (!copy) {
      const w = new World({ mode: 'explore', save: hello.save, cls: hello.cls, name: hello.name, parryPreset: hello.parry, signs: hello.signs, seed: (this.seed + this.copies.size * 7919 + this.ticks) >>> 0 });
      w.cur.pid = pl.pid;
      w.cur.name = hello.name;
      const p = w.player;
      p.id = pl.pid;
      p.autoAttack = hello.autoAttack !== false;
      p.gold = Math.max(0, Number(hello.gold) || 0);
      p.tickets = Math.max(0, Number(hello.tickets) || 0);
      p.acctRebirths = pl.acctRebirths || 0;
      copy = { key, world: w, map: to };
      w.travelHook = (h, dest, src, ex) => this.moves.push({ pid: h.pid, copy, to: dest, from: src, extra: ex });
      if (extra && extra.rift) w.startRift(extra.rift);
      else if (extra && extra.delve) w.startDelve(extra.delve);
      else if (to !== 'town') w.loadMap(to, from);
      this.copies.set(key, copy);
    } else {
      const h = copy.world.addHero(pl.pid, hello);
      h.player.acctRebirths = pl.acctRebirths || 0;
      copy.world.arriveHero(h, from);
    }
    pl.copy = copy;
    pl.memo = {}; // the next update is a full one: a new map
    if (hello.hp != null) {
      const h = copy.world.heroByPid(pl.pid);
      copy.world.as(h, (p) => {
        p.hp = Math.max(1, Math.min(p.stats.maxHp, hello.hp));
        if (hello.potions != null) p.potions = hello.potions;
      });
    }
    this.rosterDirty = true;
  }

  isHaven(key) {
    return key === 'town' || key.startsWith('town#');
  }

  removeFrom(copy, pid) {
    const w = copy.world;
    if (!w.heroByPid(pid)) return;
    if (w.heroes.length <= 1) {
      this.copies.delete(copy.key); // the last one out: the copy goes (single player keeps nothing either)
      return;
    }
    w.removeHero(pid);
  }

  /** Everything about a hero that must survive a move to another copy. */
  carry(copy, pid) {
    const w = copy.world;
    const h = w.heroByPid(pid);
    return w.as(h, (p) => ({ save: w.toSave(), name: h.name, cls: w.cls, parry: w.parryPreset, autoAttack: p.autoAttack !== false, gold: p.gold, tickets: p.tickets, hp: p.dead ? p.stats.maxHp : p.hp, potions: p.potions }));
  }

  /** Move a hero (and, into a rift or delve, the party members with them) to another copy. */
  move(pl, to, from, extra) {
    const src = pl.copy;
    if (!src) return;
    const going = [pl];
    if (extra && (extra.rift || extra.delve) && pl.party) {
      for (const pid of this.parties.get(pl.party).members) {
        const m = this.players.get(pid);
        if (m && m !== pl && m.copy === src) going.push(m);
      }
    }
    const carried = going.map((m) => [m, this.carry(src, m.pid)]);
    for (const [m] of carried) this.removeFrom(src, m.pid);
    carried.forEach(([m, state], i) => this.place(m, to, from, i === 0 ? extra : { joinKey: going[0].copy.key }, state));
  }

  // -------------------------------------------------------------------------
  // Commands, parties and chat
  // -------------------------------------------------------------------------
  command(pl, cmd) {
    switch (cmd.type) {
      case 'chat':
        return this.chat(pl, cmd.text);
      case 'partyInvite':
        return this.partyInvite(pl, Number(cmd.pid));
      case 'partyAccept':
        return this.partyAccept(pl, Number(cmd.pid));
      case 'partyDecline':
        pl.invites.delete(Number(cmd.pid));
        this.rosterDirty = true;
        return;
      case 'partyLeave':
        return this.partyLeave(pl);
      case 'joinMember':
        return this.joinMember(pl, Number(cmd.pid));
    }
    if (!SERVER_CMDS.has(cmd.type) || !pl.copy) return;
    pl.copy.world.command(Object.assign({}, cmd, { pid: pl.pid }));
  }

  chat(pl, text) {
    const t = clean(text, SERVER_LIMITS.chatLen);
    if (!t || this.ticks - pl.chatAt < SERVER_LIMITS.chatGap / CONFIG.TICK) return;
    pl.chatAt = this.ticks;
    for (const o of this.players.values()) this.send(o.conn, { t: 'chat', from: pl.name, pid: pl.pid, text: t });
  }

  chatAll(text) {
    for (const o of this.players.values()) this.send(o.conn, { t: 'chat', text });
  }

  partyInvite(pl, pid) {
    const o = this.players.get(pid);
    if (!o || o === pl || (pl.party && pl.party === o.party)) return;
    const party = pl.party && this.parties.get(pl.party);
    if (party && party.members.size >= SERVER_LIMITS.partyMax) return this.send(pl.conn, { t: 'chat', text: `Your party is full (${SERVER_LIMITS.partyMax}).` });
    o.invites.add(pl.pid);
    this.send(o.conn, { t: 'invite', pid: pl.pid, name: pl.name });
    this.rosterDirty = true;
  }

  partyAccept(pl, pid) {
    const inviter = this.players.get(pid);
    if (!inviter || !pl.invites.has(pid)) return;
    pl.invites.delete(pid);
    let party = inviter.party && this.parties.get(inviter.party);
    if (party && party.members.size >= SERVER_LIMITS.partyMax) return this.send(pl.conn, { t: 'chat', text: 'That party is full.' });
    if (pl.party) this.partyLeave(pl, true);
    if (!party) {
      party = { id: this.nextParty++, leader: inviter.pid, members: new Set([inviter.pid]) };
      this.parties.set(party.id, party);
      inviter.party = party.id;
    }
    party.members.add(pl.pid);
    pl.party = party.id;
    for (const m of party.members) this.send(this.players.get(m).conn, { t: 'chat', text: `${pl.name} joined ${m === pl.pid ? `${inviter.name}'s` : 'your'} party.` });
    this.rosterDirty = true;
  }

  partyLeave(pl, quiet = false) {
    const party = pl.party && this.parties.get(pl.party);
    pl.party = null;
    if (!party) return;
    party.members.delete(pl.pid);
    if (party.leader === pl.pid) party.leader = [...party.members][0];
    for (const m of party.members) this.send(this.players.get(m).conn, { t: 'chat', text: `${pl.name} left the party.` });
    if (party.members.size <= 1) {
      for (const m of party.members) this.players.get(m).party = null;
      this.parties.delete(party.id);
    }
    if (!quiet) this.send(pl.conn, { t: 'chat', text: 'You left the party.' });
    this.rosterDirty = true;
  }

  /** Travel to where a party member is (their map, if this hero has been there), into their copy. */
  joinMember(pl, pid) {
    const o = this.players.get(pid);
    if (!o || !pl.party || o.party !== pl.party || !o.copy || o.copy === pl.copy) return;
    const to = o.copy.world.map.id;
    if (to === 'rift' || to === 'delve') return this.send(pl.conn, { t: 'chat', text: `${o.name} is in a ${to === 'rift' ? 'rift' : 'delve'}: it cannot be joined part-way.` });
    pl.copy.world.as(pl.copy.world.heroByPid(pl.pid), () => pl.copy.world.command({ type: 'travel', to, pid: pl.pid }));
  }

  roster() {
    const players = [...this.players.values()].map((o) => {
      const w = o.copy && o.copy.world;
      const h = w && w.heroByPid(o.pid);
      const p = h && (h === w.cur ? w.player : h.player);
      const haven = o.copy && o.copy.key.startsWith('town#') ? Number(o.copy.key.slice(5)) : 0;
      return { pid: o.pid, name: o.name, cls: h ? (h === w.cur ? w.cls : h.cls) : '', level: p ? p.level : 0, map: w ? w.map.id : '', haven, party: o.party || 0 };
    });
    for (const o of this.players.values()) {
      const party = o.party && this.parties.get(o.party);
      this.send(o.conn, { t: 'roster', world: this.name, players, party: party ? { id: party.id, leader: party.leader, members: [...party.members] } : null, invites: [...o.invites] });
    }
  }

  // -------------------------------------------------------------------------
  // The clock
  // -------------------------------------------------------------------------
  /** One step of every copy (call 60 times a second). */
  tick() {
    this.ticks++;
    for (const copy of [...this.copies.values()]) {
      const w = copy.world;
      w.step(CONFIG.TICK);
      const events = w.events;
      w.events = [];
      for (const h of w.heroes) {
        const pl = this.players.get(h.pid);
        if (!pl) continue;
        for (const ev of events) {
          if (ev.type === 'mapChange' || !eventFor(ev, h.pid)) continue;
          // a hero coming or going in Haven is someone passing through, not a party member
          if ((ev.type === 'partyJoin' || ev.type === 'partyLeave') && this.isHaven(copy.key)) continue;
          pl.pending.push(ev);
          // (0.55.2) reborn (or taken her place): the new life wakes in Haven, in a fresh hero
          if (ev.type === 'reborn' && ev.save && ev.hero === h.pid) this.reborn.push({ pid: h.pid, copy, save: ev.save });
        }
      }
    }
    for (const r of this.reborn.splice(0)) {
      const pl = this.players.get(r.pid);
      if (!pl || pl.copy !== r.copy) continue;
      const w = r.copy.world;
      const h = w.heroByPid(r.pid);
      if (!h) continue;
      const keep = w.as(h, (p) => ({ name: h.name, cls: w.cls, parry: w.parryPreset, autoAttack: p.autoAttack !== false, gold: p.gold, tickets: p.tickets }));
      pl.acctRebirths = (pl.acctRebirths || 0) + 1; // every hero on that player's account grows from it, as in single player
      this.removeFrom(r.copy, r.pid);
      this.place(pl, 'town', null, null, { ...keep, save: Object.assign({}, r.save, { acctRebirths: pl.acctRebirths }) });
      pl.savedKey = '';
    }
    // Heroes who left a copy this step (a portal, the Waygate, a rift...) arrive in their new one.
    const moves = this.moves;
    this.moves = [];
    const seen = new Set();
    for (const mv of moves) {
      const pl = this.players.get(mv.pid);
      if (!pl || seen.has(mv.pid) || pl.copy !== mv.copy) continue;
      seen.add(mv.pid);
      this.move(pl, mv.to, mv.from, mv.extra);
    }
    // (0.55.1) Updates every step while few are on (the server is close by, so this is what makes
    // a click feel immediate), every second step up to 16 players, then every third.
    const every = this.players.size <= 8 ? 1 : this.players.size <= 16 ? 2 : 3;
    if (this.ticks % every === 0) {
      for (const pl of this.players.values()) {
        if (!pl.copy) continue;
        if (this.congested(pl.conn)) {
          if (pl.pending.length > 400) pl.pending.splice(0, pl.pending.length - 400);
          continue;
        }
        const snap = makeSnapshot(pl.copy.world, pl.pid, pl.memo);
        if (!snap) continue;
        if (pl.pending.length > 400) pl.pending.splice(0, pl.pending.length - 400);
        snap.ev = compactEvents(pl.pending);
        pl.pending = [];
        this.send(pl.conn, snap);
      }
    }
    if (this.ticks % 300 === 0) for (const pl of this.players.values()) this.sendSave(pl);
    if (this.rosterDirty || this.ticks % 600 === 0) {
      this.rosterDirty = false;
      this.roster();
    }
  }

  /** Send a hero's save to their own browser (only when something in it changed). */
  sendSave(pl, force = false) {
    if (!pl.copy) return;
    const w = pl.copy.world;
    const h = w.heroByPid(pl.pid);
    if (!h) return;
    const out = w.as(h, (p) => ({ save: w.toSave(), gold: p.gold, tickets: p.tickets }));
    const key = JSON.stringify(out);
    if (!force && key === pl.savedKey) return;
    pl.savedKey = key;
    if (pl.accountId && this.accounts) {
      // (0.57) kept on the server: this is the copy that counts
      this.accounts.putChar(pl.accountId, out.save.cls, out.save);
      this.accounts.setWallet(pl.accountId, { gold: out.gold, tickets: out.tickets, rebirths: pl.acctRebirths });
    }
    this.send(pl.conn, { t: 'save', ...out, online: !!pl.accountId });
  }
}
