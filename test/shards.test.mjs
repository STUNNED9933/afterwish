// Tests for the server world (src/net/shards.js), run in Node with fake connections.
// Run with: node test/shards.test.mjs (part of npm test).
import { ServerWorld } from '../src/net/shards.js';
import { NET_VERSION } from '../src/net/sync.js';
import { geared } from './balance.mjs';
import { FRIEND_CMDS } from '../src/net/cmds.js';
import fs from 'node:fs';

let pass = 0, failed = 0;
function check(name, ok, info = '') {
  if (ok) pass++;
  else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : ''));
}

const inbox = new Map(); // conn -> messages
const closed = new Set();
const sw = new ServerWorld({ send: (c, m) => inbox.get(c).push(JSON.parse(JSON.stringify(m))), close: (c) => closed.add(c), passcode: 'stun', name: 'Test World', seed: 7 });
const conn = (name) => {
  const c = { name };
  inbox.set(c, []);
  return c;
};
const last = (c, t) => [...inbox.get(c)].reverse().find((m) => m.t === t);
const run = (n) => {
  for (let i = 0; i < n; i++) sw.tick();
};
const hello = (name, cls, extra = {}) => ({ t: 'hello', v: NET_VERSION, pass: 'stun', name, cls, save: geared(cls, 60, 4), gold: 100, tickets: 3, ...extra });
const where = (pid) => sw.players.get(pid).copy;
const hero = (pid) => {
  const w = where(pid).world;
  const h = w.heroByPid(pid);
  return h === w.cur ? w.player : h.player;
};

// Getting in
const x = conn('x');
sw.message(x, hello('Mallory', 'rogue', { pass: 'nope' }));
check('a wrong passcode is turned away', last(x, 'reject') && /passcode/i.test(last(x, 'reject').reason) && closed.has(x) && sw.size === 0);
const old = conn('old');
sw.message(old, hello('Oldie', 'mage', { v: 'nope' }));
check('an old version is turned away', last(old, 'reject') && /version/i.test(last(old, 'reject').reason));
const shut = new ServerWorld({ send: () => {}, passcode: '' });
let shutReason = '';
shut.send = (c, m) => m.t === 'reject' && (shutReason = m.reason);
shut.message({}, hello('A', 'warrior'));
check('with no passcode set, nobody gets in', /not open/.test(shutReason));

const a = conn('a'), b = conn('b');
sw.message(a, hello('Ann', 'archer'));
sw.message(b, hello('Ann', 'warrior'));
const A = last(a, 'welcome').pid, B = last(b, 'welcome').pid;
check('two friends get in, each with their own hero', A && B && A !== B && sw.size === 2);
check('a name already taken gets a number', sw.players.get(B).name === 'Ann 2', sw.players.get(B).name);
check('both start in the same Haven', where(A) === where(B) && where(A).key === 'town' && where(A).world.map.id === 'town');
run(6);
check('each gets updates of Haven, with the other in it', last(a, 'snap').map === 'town' && last(a, 'snap').allies.some((h) => h.pid === B) && last(b, 'snap').allies.some((h) => h.pid === A));
check('the roster lists everyone and where they are', last(a, 'roster').players.length === 2 && last(a, 'roster').players.every((p) => p.map === 'town' && p.level === 60));
check('arriving in Haven is not a party join', !inbox.get(a).some((m) => m.t === 'snap' && (m.ev || []).some((e) => e.type === 'partyJoin')));

// Different maps at once
hero(A).visited.push('greenwood', 'ridge');
hero(B).visited.push('greenwood', 'ridge');
sw.message(a, { t: 'cmd', cmd: { type: 'travel', to: 'greenwood' } });
run(6);
check('Ann travels alone: her own copy of the Greenwood', where(A).world.map.id === 'greenwood' && where(B).world.map.id === 'town' && where(A).key === `greenwood:solo${A}`);
check('her updates now show the Greenwood, starting with a full one', last(a, 'snap').map === 'greenwood' && inbox.get(a).find((m) => m.t === 'snap' && m.map === 'greenwood').full && where(A).world.enemies.length > 3);
sw.message(b, { t: 'cmd', cmd: { type: 'travel', to: 'greenwood' } });
run(6);
check('Ann 2 alone in the Greenwood gets another copy', where(B).world.map.id === 'greenwood' && where(B) !== where(A));
sw.message(b, { t: 'cmd', cmd: { type: 'travel', to: 'ridge' } });
run(6);
check('...and can be on another map while Ann stays', where(B).world.map.id === 'ridge' && where(A).world.map.id === 'greenwood');

// A party
sw.message(a, { t: 'cmd', cmd: { type: 'partyInvite', pid: B } });
run(1);
check('an invite reaches the friend', last(b, 'invite') && last(b, 'invite').pid === A && last(b, 'roster').invites.includes(A));
sw.message(b, { t: 'cmd', cmd: { type: 'partyAccept', pid: A } });
run(1);
check('accepting makes a party of two', sw.players.get(A).party && sw.players.get(A).party === sw.players.get(B).party && last(a, 'roster').party.members.length === 2);
sw.message(b, { t: 'cmd', cmd: { type: 'joinMember', pid: A } });
run(6);
check('a party member can go to where the other is, into the same copy', where(B) === where(A) && where(A).world.heroes.length === 2, `${where(B).key} vs ${where(A).key}`);
check('...and is told of the other as a party member there', last(b, 'snap').allies.some((h) => h.pid === A));
const copies = sw.copies.size;
check('the copies they left are gone', ![...sw.copies.keys()].some((k) => k.startsWith('ridge')), [...sw.copies.keys()].join(' '));

// A portal takes just the one who steps in
const wa = where(A).world;
const gate = wa.map.portals[0];
wa.as(wa.heroByPid(A), (p) => { p.x = p.px = gate.x; p.z = p.pz = gate.z; p.moveTarget = null; });
run(120);
check('a portal takes only the hero who stands in it', where(A).world.map.id === gate.to && where(B).world.map.id === 'greenwood', `${where(A).world.map.id} / ${where(B).world.map.id}`);
check('Ann 2 keeps the copy alone', where(B).world.heroes.length === 1);

// A rift takes the party members who are with you
sw.message(a, { t: 'cmd', cmd: { type: 'travel', to: 'town' } });
sw.message(b, { t: 'cmd', cmd: { type: 'travel', to: 'town' } });
run(6);
check('both back in Haven', where(A).key === 'town' && where(B).key === 'town');
const c = conn('c');
sw.message(c, hello('Cal', 'mage'));
run(3);
const C = last(c, 'welcome').pid;
hero(A).bossKills.boss = 1;
hero(A).tickets = 2;
sw.message(a, { t: 'cmd', cmd: { type: 'enterRift', tier: 1 } });
run(6);
check('a rift takes the leader and the party member beside them', where(A).world.map.id === 'rift' && where(B) === where(A) && where(A).world.rift && where(A).world.rift.state === 'run', `${where(A).key} ${where(B).key}`);
check('...but not someone else in Haven', where(C).key === 'town' && where(C).world.heroes.length === 1);
check('the shard is spent', hero(A).tickets === 1);

// Chat
sw.message(c, { t: 'cmd', cmd: { type: 'chat', text: 'hello <b>world</b>\n' } });
check('chat reaches everyone, cleaned', [a, b, c].every((k) => last(k, 'chat') && last(k, 'chat').text === 'hello bworld/b' && last(k, 'chat').from === 'Cal'), last(a, 'chat') && last(a, 'chat').text);
sw.message(c, { t: 'cmd', cmd: { type: 'chat', text: 'spam' } });
check('chat too fast is dropped', last(a, 'chat').text !== 'spam');

// Saves
run(300);
check('each hero is sent their save', last(a, 'save') && last(a, 'save').save.cls === 'archer' && last(b, 'save').save.cls === 'warrior');
const before = inbox.get(c).filter((m) => m.t === 'save').length;
run(300);
check('a save that has not changed is not sent again', inbox.get(c).filter((m) => m.t === 'save').length === before);

// Rebirth on the server (0.55.2): this hero's alone, with others around
const d = conn('d');
sw.message(d, hello('Dee', 'rogue', { save: geared('rogue', 100, 5), acctRebirths: 2 }));
run(3);
const D = last(d, 'welcome').pid;
hero(D).bossKills.boss3 = 1; // The Unmade beaten
sw.message(d, { t: 'cmd', cmd: { type: 'rebirth' } });
run(6);
const dSnaps = inbox.get(d).filter((m) => m.t === 'snap');
const rebornEv = dSnaps.flatMap((m) => m.ev || []).find((e) => e.type === 'reborn');
check('a rebirth works on the server, even with others in Haven', rebornEv && rebornEv.save && hero(D).level === 1 && where(D).key === 'town', `level ${hero(D).level}`);
check('...the new life knows the account grew by one', hero(D).acctRebirths === 3 && rebornEv.save.rebirth.n >= 1);
check('...and nobody else is told it was theirs', ![c].some((k) => inbox.get(k).filter((m) => m.t === 'snap').flatMap((m) => m.ev || []).some((e) => e.type === 'reborn')));
run(300);
check("...and the new life's save goes to that player", last(d, 'save') && last(d, 'save').save.level === 1);
sw.leave(d);

// Leaving
sw.leave(a);
run(3);
check('when one leaves, the other carries on in the rift', !sw.players.has(A) && where(B).world.map.id === 'rift' && where(B).world.heroes.length === 1);
check('...and is no longer in a party', !sw.players.get(B).party);
sw.leave(b);
sw.leave(c);
run(3);
check('when everyone has gone, nothing is left running', sw.size === 0 && sw.copies.size === 0);

// Capacity (0.55.2): a full server turns people away; a full Haven opens another
{
  const box = new Map();
  const small = new ServerWorld({ send: (c, m) => box.get(c).push(m), passcode: 'p', maxPlayers: 3, havenMax: 2, seed: 9 });
  const mk = (n) => {
    const k = { n };
    box.set(k, []);
    small.message(k, { t: 'hello', v: NET_VERSION, pass: 'p', name: n, cls: 'warrior', save: geared('warrior', 30, 3) });
    return k;
  };
  const [p1, p2, p3, p4] = ['One', 'Two', 'Three', 'Four'].map(mk);
  const pidOf = (k) => box.get(k).find((m) => m.t === 'welcome').pid;
  const keyOf = (k) => small.players.get(pidOf(k)).copy.key;
  check('a full server turns the next one away, kindly', box.get(p4).some((m) => m.t === 'reject' && /full \(3 players\)/.test(m.reason)) && small.size === 3);
  check('a full Haven opens a second one', keyOf(p1) === 'town' && keyOf(p2) === 'town' && keyOf(p3) === 'town#2', [p1, p2, p3].map(keyOf).join(' '));
  small.message(p3, { t: 'cmd', cmd: { type: 'partyInvite', pid: pidOf(p1) } });
  small.message(p1, { t: 'cmd', cmd: { type: 'partyAccept', pid: pidOf(p3) } });
  small.leave(p2);
  small.message(p3, { t: 'cmd', cmd: { type: 'travel', to: 'town' } });
  for (let i = 0; i < 6; i++) small.tick();
  check('going back to Haven, a party member joins the Haven their party is in', keyOf(p3) === keyOf(p1), `${keyOf(p3)} / ${keyOf(p1)}`);
  small.tick();
  check('the roster says which Haven', small.players.size === 2);
}

// (0.57.4) Every action the game sends from its menus must be one a server (or a friend's room) accepts,
// or it silently does nothing there (Tomas's scarf and Odile's garden once did exactly that).
{
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const sent = new Set([...src.matchAll(/(?:applyNow|world\.command)\(\{ type: '([a-zA-Z]+)'/g)].map((m) => m[1]));
  const offlineOnly = new Set(['augment', 'reroll']); // the Echo Ring, which only runs in the browser
  const serverOnly = new Set(['setDepth', 'rebirth', 'unwish']); // a hero's own, on the server world (SERVER_CMDS)
  const missing = [...sent].filter((t) => !FRIEND_CMDS.has(t) && !offlineOnly.has(t) && !serverOnly.has(t));
  check('every action the game sends is accepted online', missing.length === 0, missing.join(', '));
}

console.log(`${pass} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
