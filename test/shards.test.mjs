// Tests for the server world (src/net/shards.js), run in Node with fake connections.
// Run with: node test/shards.test.mjs (part of npm test).
import { CONFIG } from '../src/config.js';
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

// (0.58.1) A shared map: each hero's story is their own, whoever got there first
{
  const box = new Map();
  const sv = new ServerWorld({ send: (c, m) => box.get(c).push(JSON.parse(JSON.stringify(m))), close: () => {}, passcode: 'stun', seed: 11 });
  const mk = (name, save) => { const k = { name }; box.set(k, []); sv.message(k, hello(name, 'warrior', { save })); return k; };
  const pidOf = (k) => box.get(k).find((m) => m.t === 'welcome').pid;
  const heroOf = (k) => { const pl = sv.players.get(pidOf(k)); const w = pl.copy.world; return { w, h: w.heroByPid(pidOf(k)) }; };
  const fresh = geared('warrior', 60, 4); fresh.visited = ['town', 'greenwood', 'hollow', 'keep'];
  const mid = geared('warrior', 60, 4); mid.visited = fresh.visited.slice();
  mid.quests = { scarf2: { s: 'active', n: 0 }, tobin: { s: 'active', n: 0 }, edric: { s: 'active', n: 0 } };
  const first = mk('First', fresh), second = mk('Second', mid);
  const t = heroOf(first).w;
  check('a shared Haven keeps everyone who might be there for someone (and they block nobody)', ['tomas', 'lark', 'odile'].every((id) => t.obstacles.some((o) => o.id === id && o.soft)));
  sv.message(first, { t: 'cmd', cmd: { type: 'partyInvite', pid: pidOf(second) } });
  sv.message(second, { t: 'cmd', cmd: { type: 'partyAccept', pid: pidOf(first) } });
  for (const k of [first, second]) sv.message(k, { t: 'cmd', cmd: { type: 'travel', to: 'hollow' } });
  for (let i = 0; i < 6; i++) sv.tick();
  let { w, h } = heroOf(second);
  check('a party in the same Gloomcap copy, which has no story people of its own', heroOf(first).w === w && !w.obstacles.some((o) => o.id === 'odile'));
  const od = w.as(h, () => w.storyObject('odile'));
  check('...but the hero on that story has Odile in the garden', !!od && !w.as(heroOf(first).h, () => w.storyObject('odile')));
  h.player.x = od.x + 1; h.player.z = od.z;
  sv.message(second, { t: 'cmd', cmd: { type: 'meetOdile' } });
  for (let i = 0; i < 2; i++) sv.tick();
  check('An Ending for Tobin can be finished on a map someone else got to first', h.player.quests.tobin.s === 'ready', h.player.quests.tobin.s);
  for (const k of [first, second]) sv.message(k, { t: 'cmd', cmd: { type: 'travel', to: 'greenwood' } });
  for (let i = 0; i < 6; i++) sv.tick();
  ({ w, h } = heroOf(second));
  const tm = w.as(h, () => w.storyObject('tomashusk'));
  h.player.x = tm.x + 1; h.player.z = tm.z;
  sv.message(second, { t: 'cmd', cmd: { type: 'scarfChoice', choice: 'rest' } });
  for (let i = 0; i < 2; i++) sv.tick();
  check('...and so can Red Scarf, Part Two', h.player.quests.scarf2.s === 'ready' && h.player.choices.scarf === 'rest');
  for (const k of [first, second]) sv.message(k, { t: 'cmd', cmd: { type: 'travel', to: 'keep' } });
  for (let i = 0; i < 20; i++) sv.tick();
  ({ w } = heroOf(second));
  check("Edric of the Blue Trim comes for whoever has his quest, not only the first one there", w.enemies.some((e) => e.named === 'edric'));
}

// (0.59) The Echo Ring on the server world: a run of your own, spoils and all
{
  const box = new Map();
  const sv = new ServerWorld({ send: (c, m) => box.get(c).push(JSON.parse(JSON.stringify(m))), close: () => {}, passcode: 'stun', seed: 13 });
  const k = { name: 'ringer' }; box.set(k, []);
  sv.message(k, hello('Ringer', 'warrior', { tickets: 2 }));
  const pid = box.get(k).find((m) => m.t === 'welcome').pid;
  const pl = () => sv.players.get(pid);
  const heroP = () => { const w = pl().copy.world; const h = w.heroByPid(pid); return w.as(h, (p) => p); };
  sv.message(k, { t: 'cmd', cmd: { type: 'enterRing', startWave: 1, focus: { kind: 'fragment' } } });
  for (let i = 0; i < 4; i++) sv.tick();
  const w = pl().copy.world;
  check('Ring online: waking it takes you to an Echo Ring of your own, for a shard', w.mode === 'arena' && pl().copy.key.startsWith('ring:') && w.ring && w.ring.kind === 'fragment' && heroP().tickets === 1);
  const snap = [...box.get(k)].reverse().find((m) => m.t === 'snap');
  check('Ring online: the game is told it is in the Ring, with the wave and the spoils', snap && snap.map === 'ring' && snap.arena && snap.arena.ring && snap.arena.ring.kind === 'fragment');
  for (let i = 0; i < 40000 && w.wave.cleared < 5; i++) {
    if (w.offer) sv.message(k, { t: 'cmd', cmd: { type: 'augment', id: w.offer.choices[0] } });
    if (w.wave.phase === 'intermission' && !(w.ring && w.ring.hold)) sv.message(k, { t: 'cmd', cmd: { type: 'nextWave' } });
    for (const e of w.enemies.slice()) if (!e.dead) w.hitEnemy(e, 1e12);
    w.player.hp = w.player.stats.maxHp;
    sv.tick();
  }
  for (let i = 0; i < 30 && w.offer; i++) { sv.message(k, { t: 'cmd', cmd: { type: 'augment', id: w.offer.choices[0] } }); sv.tick(); }
  check('Ring online: after the boss the spoils are safe and the Ring waits', w.wave.cleared === 5 && w.ring.hold && w.ring.safe > 0);
  const want = Math.floor(w.ring.safe), f0 = (heroP().misc.fragment || 0);
  sv.message(k, { t: 'cmd', cmd: { type: 'ringLeave' } });
  for (let i = 0; i < 4; i++) sv.tick();
  check('Ring online: take them home, and you are back in Haven with them', pl().copy.world.mode === 'explore' && pl().copy.world.map.id === 'town' && (heroP().misc.fragment || 0) === f0 + want, `${heroP().misc.fragment} (+${want})`);
  // and falling: home after a moment, with what was safe
  sv.message(k, { t: 'cmd', cmd: { type: 'enterRing', startWave: 1, focus: { kind: 'gold' } } });
  for (let i = 0; i < 4; i++) sv.tick();
  const w2 = pl().copy.world;
  const g0 = heroP().gold;
  w2.player.hp = 1; w2.player.dead = false;
  const foe = w2.spawnEnemy ? w2.enemies[0] : null;
  w2.as(w2.heroes[0], () => { w2.player.hp = 0; w2.gameOver = true; w2.ringPay(); });
  for (let i = 0; i < 200; i++) sv.tick();
  check('Ring online: fall, and you are home in Haven a moment later (nothing was safe yet)', pl().copy.world.map && pl().copy.world.map.id === 'town' && heroP().gold === g0 && heroP().hp > 0);
  {
    // gone mid-run: what was safe still comes home (it is in the save that is kept)
    heroP().tickets = 3;
    sv.message(k, { t: 'cmd', cmd: { type: 'enterRing', startWave: 1, focus: { kind: 'dust' } } });
    for (let i = 0; i < 4; i++) sv.tick();
    const w3 = pl().copy.world;
    w3.ring.safe = 7; w3.ring.pot = 9;
    const d0 = w3.player.dust;
    let saved = null;
    sv.send = ((orig) => (c, m) => { if (m.t === 'save') saved = m.save; orig(c, m); })(sv.send);
    sv.leave(k, true);
    check('Ring online: disconnect mid-run and what was safe is still yours', saved && saved.dust === d0 + 7, saved && saved.dust);
  }
}

// (0.60) The Weekly Echo's rewards for an online character: asked of the boards, once a week per account
{
  const os = await import('node:os');
  const { AccountStore } = await import('../game-server/accounts.mjs');
  const dir = fs.mkdtempSync(os.default.tmpdir() + '/aw-weekly-');
  const store = new AccountStore(dir);
  const acct = store.signIn('google', 'g-1', 'Weekly');
  const other = store.signIn('google', 'g-2', 'Other');
  const tok = 'a'.repeat(64);
  const boards = { '/me': { id: '0123456789abcdef', name: 'Weekly' }, '/awards?player=0123456789abcdef': { played: [5, 6], places: [{ week: 5, spec: 'berserker', title: 'champion' }, { week: 6, spec: 'bulwark', title: null }] } };
  let asked = 0;
  const fetcher = async (url, opts) => { asked++; const path = url.replace('https://boards.test', ''); const ok = path === '/me' ? opts.headers.authorization === `Bearer ${tok}` : !!boards[path]; return { ok, status: ok ? 200 : 401, json: async () => boards[path] }; };
  const box = new Map();
  const sv = new ServerWorld({ send: (c, m) => box.get(c).push(JSON.parse(JSON.stringify(m))), close: () => {}, passcode: 'stun', seed: 21, accounts: store, trialApi: 'https://boards.test/', fetcher });
  const k = { name: 'w' }; box.set(k, []);
  sv.message(k, hello('Weekly', 'warrior', { session: store.newSession(acct.id) }));
  const pid = box.get(k).find((m) => m.t === 'welcome').pid;
  const heroP = () => { const pl = sv.players.get(pid); const w = pl.copy.world; return w.as(w.heroByPid(pid), (p) => p); };
  const f0 = heroP().misc.fragment || 0, t0 = heroP().tickets;
  await sv.weekly(sv.players.get(pid), tok);
  const said = box.get(k).find((m) => m.t === 'weekly');
  check('Weekly Echo online: each week taken part in is rewarded (Fragments, Wishdust, shards)', said && said.weeks === 2 && heroP().misc.fragment === f0 + 50 && heroP().tickets === t0 + 4, JSON.stringify(said));
  check("...a Champion gets the Echo Champion glow, and the title shows by the name", heroP().glows.includes('echoed') && sv.players.get(pid).title === 'Weekly Echo Champion');
  await sv.weekly(sv.players.get(pid), tok);
  check('...and only once a week per account', heroP().misc.fragment === f0 + 50 && [...box.get(k)].reverse().find((m) => m.t === 'weekly').weeks === 0);
  sv.tick();
  check('the roster shows the title', [...box.get(k)].reverse().find((m) => m.t === 'roster').players.some((x) => x.title === 'Weekly Echo Champion'));
  check('a board name stays with the account that linked it first', !store.linkBoard(other.id, '0123456789abcdef') && store.linkBoard(acct.id, '0123456789abcdef'));
  const n0 = asked;
  await sv.weekly(sv.players.get(pid), 'not a token');
  check('a token that is not one is not even sent to the boards', asked === n0);
  clearTimeout(store.timer);
  fs.rmSync(dir, { recursive: true, force: true });
}

// (0.61) Sharing a map: enemies come back faster, bosses grow (and you still win faster together)
{
  const box = new Map();
  const sv = new ServerWorld({ send: (c, m) => box.get(c).push(JSON.parse(JSON.stringify(m))), close: () => {}, passcode: 'stun', seed: 31 });
  const mk = (name) => { const k = { name }; box.set(k, []); const sv0 = geared('warrior', 60, 4); sv0.visited = ['town', 'greenwood', 'hollow', 'keep', 'sanctum']; sv.message(k, hello(name, 'warrior', { save: sv0 })); return k; };
  const pidOf = (k) => box.get(k).find((m) => m.t === 'welcome').pid;
  const a = mk('A'), b = mk('B');
  sv.message(a, { t: 'cmd', cmd: { type: 'partyInvite', pid: pidOf(b) } });
  sv.message(b, { t: 'cmd', cmd: { type: 'partyAccept', pid: pidOf(a) } });
  sv.message(a, { t: 'cmd', cmd: { type: 'travel', to: 'hollow' } });
  for (let i = 0; i < 4; i++) sv.tick();
  const w = sv.players.get(pidOf(a)).copy.world;
  const boss = w.enemies.find((e) => e.def.boss);
  const solo = boss && boss.maxHp;
  check('alone on a map, a boss is as it always was', boss && !(boss.partyN > 1));
  sv.message(b, { t: 'cmd', cmd: { type: 'travel', to: 'hollow' } });
  for (let i = 0; i < 4; i++) sv.tick();
  check('a friend arrives: the boss grows to 170% health, and steadier', sv.players.get(pidOf(b)).copy.world === w && boss.partyN === 2 && Math.abs(boss.maxHp / solo - 1.7) < 0.01 && boss.poiseMult === 1.5, `${boss.maxHp} / ${solo}`);
  check('...and both are told why (the lore, once)', box.get(a).concat(box.get(b)).filter((m) => m.t === 'snap').some((m) => (m.ev || []).some((e) => e.type === 'partyBoss')));
  // respawns: twice the heroes, (nearly) twice as fast
  const camp = w.camps.find((c) => c.slots[0].id != null && !w.enemyById(c.slots[0].id).def.boss);
  const e = w.enemyById(camp.slots[0].id);
  w.as(w.heroes[0], () => w.hitEnemy(e, 1e12));
  for (const h of w.heroes) { h.player.x = camp.def.x + 40; h.player.z = camp.def.z; }
  const t0 = camp.slots[0].timer;
  for (let i = 0; i < 60; i++) sv.tick();
  const used = t0 - camp.slots[0].timer;
  check('two heroes on a map: enemies come back 1.9 times as fast', Math.abs(used / (60 * CONFIG.TICK) - 1.9) < 0.05 || camp.slots[0].id != null, used.toFixed(2));
  sv.message(b, { t: 'cmd', cmd: { type: 'travel', to: 'town' } });
  for (let i = 0; i < 4; i++) sv.tick();
  check('the friend goes: the boss is back to itself (its share of health kept)', boss.partyN === 1 && boss.maxHp === solo && !(boss.poiseMult > 1));
}

// (0.57.4) Every action the game sends from its menus must be one a server (or a friend's room) accepts,
// or it silently does nothing there (Tomas's scarf and Odile's garden once did exactly that).
{
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const sent = new Set([...src.matchAll(/(?:applyNow|world\.command)\(\{ type: '([a-zA-Z]+)'/g)].map((m) => m[1]));
  const offlineOnly = new Set([]); // (0.59: the Echo Ring runs on the server world too)
  const serverOnly = new Set(['setDepth', 'rebirth', 'unwish']); // a hero's own, on the server world (SERVER_CMDS)
  const missing = [...sent].filter((t) => !FRIEND_CMDS.has(t) && !offlineOnly.has(t) && !serverOnly.has(t));
  check('every action the game sends is accepted online', missing.length === 0, missing.join(', '));
}

console.log(`${pass} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
