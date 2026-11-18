// Tests for accounts and online characters (0.57): game-server/accounts.mjs, auth.mjs, api.mjs, and the
// server world's use of them (src/net/shards.js). Google and Discord are stood in for by local fakes.
// Run with: node test/accounts.test.mjs (part of npm test).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { AccountStore } from '../game-server/accounts.mjs';
import { verifyGoogle } from '../game-server/auth.mjs';
import { createApi, cleanSave } from '../game-server/api.mjs';
import { ServerWorld } from '../src/net/shards.js';
import { NET_VERSION } from '../src/net/sync.js';
import { geared } from './balance.mjs';

let pass = 0, failed = 0;
function check(name, ok, info = '') {
  if (ok) pass++;
  else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + info : ''));
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'afterwish-acct-'));

// ------------------------------------------------------------------ the store
{
  let t = 1e12;
  const dir = tmp();
  const st = new AccountStore(dir, { now: () => t });
  const a = st.signIn('google', 'g-111', 'Ko');
  check('a first Google sign-in makes an account', !!a.id && a.google === 'g-111' && a.wallet.tickets === 3);
  check('signing in again finds the same account', st.signIn('google', 'g-111', 'Other').id === a.id);
  check('Discord can be added to it', st.link(a.id, 'discord', 'd-222').ok && st.byProvider('discord', 'd-222').id === a.id);
  const b = st.signIn('google', 'g-999', 'Mallory');
  const steal = st.link(b.id, 'discord', 'd-222');
  check('a Discord already on another account cannot be added', !steal.ok && /different/.test(steal.reason), steal.reason);
  check('removing one way leaves the other', st.unlink(a.id, 'google').ok && !st.byProvider('google', 'g-111') && st.byProvider('discord', 'd-222').id === a.id);
  check('the last way to sign in cannot be removed', !st.unlink(a.id, 'discord').ok);
  const tok = st.newSession(a.id);
  check('a session signs in to its account', st.bySession(tok).id === a.id && !st.bySession('nonsense'));
  check('only a hash of the token is kept', !JSON.stringify(st.sessions).includes(tok));
  t += 121 * 864e5;
  check('sessions run out', st.bySession(tok) === null);
  const tok2 = st.newSession(a.id);
  st.endSession(tok2);
  check('signing out ends a session', st.bySession(tok2) === null);
  const clean = (cls, s) => (s && s.level ? { ...s, cls } : null);
  const im = st.importOnce(a.id, { warrior: { level: 40 }, mage: { level: 90 }, junk: null }, { gold: 500, tickets: 7, rebirths: 2 }, clean);
  check('the import brings the characters and the wallet', im.ok && st.getChar(a.id, 'mage').level === 90 && a.wallet.gold === 500 && a.wallet.rebirths === 2, JSON.stringify(im));
  check('and only once', !st.importOnce(a.id, { warrior: { level: 99 } }, {}, clean).ok && st.getChar(a.id, 'warrior').level === 40);
  st.putChar(a.id, 'mage', { level: 91 });
  st.flush();
  const again = new AccountStore(dir, { now: () => t });
  check('everything is still there after a restart', again.byProvider('discord', 'd-222').id === a.id && again.getChar(a.id, 'mage').level === 91 && again.accounts[a.id].imported > 0);
  check('the files are private to the server', (fs.statSync(path.join(dir, 'accounts.json')).mode & 0o077) === 0);
}

// ------------------------------------------------------------------ Google's tokens
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const keys = async () => new Map([['k1', crypto.createPublicKey({ key: jwk, format: 'jwk' })]]);
const NOW = 1.7e12;
function idToken(claims, key = privateKey) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const b = enc({ iss: 'https://accounts.google.com', aud: 'gid', sub: 'g-1', exp: NOW / 1000 + 600, given_name: 'Ko', ...claims });
  return `${h}.${b}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${b}`), key).toString('base64url')}`;
}
{
  const ok = await verifyGoogle(idToken({}), 'gid', keys, NOW);
  check('a real Google token is accepted', ok.sub === 'g-1' && ok.name === 'Ko');
  const no = async (tok, why) => {
    try {
      await verifyGoogle(tok, 'gid', keys, NOW);
      check(why, false, 'accepted');
    } catch (err) {
      check(why, true);
    }
  };
  await no(idToken({ aud: 'someone-else' }), 'a token made for another app is refused');
  await no(idToken({ iss: 'https://evil.example' }), 'a token not from Google is refused');
  await no(idToken({ exp: NOW / 1000 - 3600 }), 'an expired token is refused');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await no(idToken({}, other), 'a token signed by anyone but Google is refused');
  const [h, , sig] = idToken({}).split('.');
  await no(`${h}.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'gid', sub: 'g-ADMIN', exp: NOW / 1000 + 600 })).toString('base64url')}.${sig}`, 'a token edited after signing is refused');
}

// ------------------------------------------------------------------ the web endpoints
{
  const dir = tmp();
  const store = new AccountStore(dir);
  const fakeFetch = async (url, opts = {}) => {
    const json = (o, ok = true) => ({ ok, json: async () => o, headers: { get: () => '' } });
    if (url.includes('googleapis.com')) return json({ keys: [jwk] });
    if (url.includes('/oauth2/token')) return json(String(opts.body).includes('code=good') ? { access_token: 'at-' + /code=good(\w*)/.exec(opts.body)[1] } : { error: 'bad' }, String(opts.body).includes('code=good'));
    if (url.includes('/users/@me')) return json({ id: 'd-' + opts.headers.authorization.slice(-3), username: 'kodiscord' });
    return json({}, false);
  };
  const realNow = Date.now;
  const api = createApi({ store, cfg: { googleId: 'gid', discordId: 'did', discordSecret: 'shh', publicUrl: 'https://play.example' }, originOk: (o) => o === 'http://localhost:5000', fetchFn: fakeFetch, now: () => NOW });
  const srv = http.createServer(async (req, res) => {
    if (!(await api(req, res, 'test'))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const req = async (p, { method = 'GET', body, session, origin = 'http://localhost:5000' } = {}) => {
    const res = await fetch(base + p, { method, headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(session ? { authorization: `Bearer ${session}` } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (err) { data = { html: text }; }
    return { status: res.status, data, cors: res.headers.get('access-control-allow-origin') };
  };
  const cfg = await req('/auth/config');
  check('the config says which sign-ins are offered', cfg.data.google === 'gid' && cfg.data.discord === true && cfg.cors === 'http://localhost:5000');
  const bad = await req('/auth/config', { origin: 'https://evil.example' });
  check('other websites may not call it', bad.status === 403);
  const g = await req('/auth/google', { method: 'POST', body: { credential: idToken({ sub: 'g-77' }), mode: 'login' } });
  check('Google sign-in gives a session and an account', g.status === 200 && !!g.data.session && g.data.account.google === true, JSON.stringify(g.data));
  const S = g.data.session;
  const me = await req('/account', { session: S });
  check('the account is there with that session', me.status === 200 && me.data.account.name === 'Ko' && !JSON.stringify(me.data).includes('g-77'));
  check('no session, no account', (await req('/account')).status === 401);
  // Discord, linked to it
  const begin = await req('/auth/discord/begin', { method: 'POST', body: { mode: 'link' }, session: S });
  const state = new URL(begin.data.url).searchParams.get('state');
  check('Discord linking starts at Discord, with a one-time state', begin.data.url.startsWith('https://discord.com/oauth2/authorize') && !!state && new URL(begin.data.url).searchParams.get('redirect_uri') === 'https://play.example/auth/discord/callback');
  const cb = await req(`/auth/discord/callback?code=good123&state=${state}`, { origin: undefined });
  const ticket = /"ticket":"([^"]+)"/.exec(cb.data.html);
  check('the popup hands a link ticket to the game page only', !!ticket && cb.data.html.includes('"http://localhost:5000"') && !/"session"/.test(cb.data.html));
  check('the same state cannot be used twice', /too long|already used/.test((await req(`/auth/discord/callback?code=good123&state=${state}`, { origin: undefined })).data.html));
  // someone else cannot finish that link with their own session
  const other = await req('/auth/google', { method: 'POST', body: { credential: idToken({ sub: 'g-88', given_name: 'Mallory' }), mode: 'login' } });
  const hijack = await req('/auth/discord/link', { method: 'POST', body: { ticket: ticket[1] }, session: other.data.session });
  check('a link ticket only works for the account that asked for it', hijack.status === 400);
  // (that try used the ticket up: ask again, and finish it properly)
  const begin2 = await req('/auth/discord/begin', { method: 'POST', body: { mode: 'link' }, session: S });
  const cb2 = await req(`/auth/discord/callback?code=good123&state=${new URL(begin2.data.url).searchParams.get('state')}`, { origin: undefined });
  const linked = await req('/auth/discord/link', { method: 'POST', body: { ticket: /"ticket":"([^"]+)"/.exec(cb2.data.html)[1] }, session: S });
  check('the account that asked can finish it: Google and Discord both sign in', linked.status === 200 && linked.data.account.google && linked.data.account.discord);
  const begin3 = await req('/auth/discord/begin', { method: 'POST', body: { mode: 'login' } });
  const cb3 = await req(`/auth/discord/callback?code=good123&state=${new URL(begin3.data.url).searchParams.get('state')}`, { origin: undefined });
  const dsess = /"session":"([^"]+)"/.exec(cb3.data.html);
  check('signing in with Discord now reaches the same account', !!dsess && (await req('/account', { session: dsess[1] })).data.account.name === 'Ko');
  check('Discord sign-in refused when Discord says no', /did not accept/.test((await req(`/auth/discord/callback?code=nope&state=${new URL((await req('/auth/discord/begin', { method: 'POST', body: { mode: 'login' } })).data.url).searchParams.get('state')}`, { origin: undefined })).data.html));
  // the import
  const im = await req('/account/import', { method: 'POST', session: S, body: { saves: { warrior: geared('warrior', 60, 4), mage: { level: 'lots', hacked: true }, notaclass: { level: 5 } }, wallet: { gold: 1234, tickets: 9, rebirths: 1 } } });
  check('the import brings real saves, and drops anything that is not one', im.status === 200 && im.data.classes.join() === 'warrior' && im.data.account.chars.warrior.level === 60 && im.data.account.wallet.gold === 1234, JSON.stringify(im.data).slice(0, 200));
  const im2 = await req('/account/import', { method: 'POST', session: S, body: { saves: { warrior: geared('warrior', 100, 6) } } });
  check('a second import is refused', im2.status === 409 && store.getChar(store.bySession(S).id, 'warrior').level === 60);
  check('signing out ends that session', (await req('/auth/logout', { method: 'POST', body: {}, session: S })).status === 200 && (await req('/account', { session: S })).status === 401);
  srv.close();
  void realNow;
}

// cleanSave: what a browser sends is rewritten as the game itself would write it
{
  const s = cleanSave('rogue', { ...geared('rogue', 50, 3), extra: 'x' });
  check('a save is rewritten by the game (unknown fields dropped)', s && s.level === 50 && s.cls === 'rogue' && !('extra' in s));
  check('not a save, not kept', cleanSave('rogue', { nope: 1 }) === null && cleanSave('bard', { level: 5 }) === null);
}

// ------------------------------------------------------------------ the server world
{
  const store = new AccountStore(tmp());
  const a = store.signIn('google', 'g-5', 'Ann');
  store.importOnce(a.id, { archer: geared('archer', 30, 3) }, { gold: 300, tickets: 4 }, cleanSave);
  const token = store.newSession(a.id);
  const inbox = new Map();
  const sw = new ServerWorld({ send: (c, m) => inbox.get(c).push(JSON.parse(JSON.stringify(m))), close: () => {}, passcode: 'stun', name: 'Test', seed: 3, accounts: store, requireAccount: true });
  const conn = () => {
    const c = {};
    inbox.set(c, []);
    return c;
  };
  const hello = (extra) => ({ t: 'hello', v: NET_VERSION, pass: 'stun', name: 'Ann', cls: 'archer', save: geared('archer', 100, 6), gold: 999999, tickets: 999, ...extra });
  const c0 = conn();
  sw.message(c0, hello({}));
  check('without signing in, a server that requires it says why', inbox.get(c0).some((m) => m.t === 'reject' && /Sign in/.test(m.reason)));
  const c1 = conn();
  sw.message(c1, hello({ session: token }));
  const welcome = inbox.get(c1).find((m) => m.t === 'welcome');
  check('signed in, you join as your online character', welcome && welcome.online === true);
  const pl = [...sw.players.values()][0];
  const p = pl.copy.world.heroByPid(pl.pid).player;
  check('the browser\'s own save and gold are ignored (level 100 sent, 30 played)', p.level === 30 && p.gold === 300 && p.tickets === 4, `${p.level} ${p.gold}`);
  const c2 = conn();
  sw.message(c2, hello({ session: token }));
  check('the same account cannot be in twice at once', inbox.get(c2).some((m) => m.t === 'reject' && /already/.test(m.reason)));
  p.gold = 777;
  p.exp += 50;
  for (let i = 0; i < 301; i++) sw.tick();
  check('progress goes back to the account as you play', store.getChar(a.id, 'archer').exp === p.exp && a.wallet.gold === 777);
  const sv = inbox.get(c1).filter((m) => m.t === 'save').pop();
  check('the browser gets a copy, marked as an online character\'s', sv && sv.online === true);
  p.gold = 800;
  sw.leave(c1, false);
  check('even dropping out without saying goodbye keeps the latest', a.wallet.gold === 800);
  const c3 = conn();
  sw.message(c3, hello({ session: 'expired-or-made-up' }));
  check('a sign-in that ran out is refused, with a reason', inbox.get(c3).some((m) => m.t === 'reject' && /run out/.test(m.reason)));
}

// (0.57.1) Playing alone on the server: a Haven of your own, off the player list, no chat or invites
{
  const store = new AccountStore(tmp());
  const a = store.signIn('google', 'g-alone', 'Solo');
  const token = store.newSession(a.id);
  const inbox = new Map();
  const sw = new ServerWorld({ send: (c, m) => inbox.get(c).push(JSON.parse(JSON.stringify(m))), close: () => {}, passcode: 'stun', name: 'Test', seed: 4, accounts: store, requireAccount: false });
  const conn = () => {
    const c = {};
    inbox.set(c, []);
    return c;
  };
  const base = { t: 'hello', v: NET_VERSION, pass: 'stun', cls: 'warrior' };
  const crowd = conn();
  sw.message(crowd, { ...base, name: 'Crowd', save: geared('warrior', 20, 2) });
  const solo = conn();
  sw.message(solo, { ...base, name: 'Solo', session: token, alone: true });
  const pc = [...sw.players.values()].find((o) => o.name === 'Crowd');
  const ps = [...sw.players.values()].find((o) => o.name === 'Solo');
  check('playing alone: told so on joining', inbox.get(solo).find((m) => m.t === 'welcome').alone === true);
  check('playing alone: a Haven of your own', ps.copy !== pc.copy && ps.copy.key.startsWith('town~') && ps.copy.world.map.id === 'town');
  check('no one is told you arrived', !inbox.get(crowd).some((m) => m.t === 'chat' && /Solo/.test(m.text || '')));
  sw.tick();
  sw.roster();
  const r1 = inbox.get(crowd).filter((m) => m.t === 'roster').pop();
  const r2 = inbox.get(solo).filter((m) => m.t === 'roster').pop();
  check('others do not see you in the player list', r1 && !r1.players.some((x) => x.name === 'Solo'));
  check('you see only yourself', r2 && r2.alone && r2.players.length === 1 && r2.players[0].name === 'Solo');
  sw.command(pc, { type: 'chat', text: 'hello all' });
  sw.command(ps, { type: 'chat', text: 'hi' });
  check('no chat reaches you, and yours goes nowhere', !inbox.get(solo).some((m) => m.t === 'chat' && m.from) && !inbox.get(crowd).some((m) => m.t === 'chat' && m.text === 'hi'));
  sw.command(pc, { type: 'partyInvite', pid: ps.pid });
  check('no one can invite you to a party', !inbox.get(solo).some((m) => m.t === 'invite') && !ps.invites.size);
  ps.copy.world.heroByPid(ps.pid).player.gold = 123;
  sw.leave(solo, true);
  check('and it is still your online character, saved to the account', a.wallet.gold === 123);
}

console.log(`\n${pass} passed, ${failed} failed`);
if (failed) process.exit(1);
