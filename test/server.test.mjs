// Tests for the Weekly Echo server (server/src/app.js), run in Node against SQLite
// standing in for Cloudflare D1. Run with: node test/server.test.mjs (part of npm test).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handle, daily, checkName } from '../server/src/app.js';
import { trialWeek, weekIndexAt, defaultBuild, TRIAL_EPOCH } from '../src/sim/trial.js';
import { SIM_VERSION } from '../src/sim/version.js';
import { packInputs } from '../src/net/trial-api.js';
import { playTrialBot } from './trialbot.mjs';

let pass = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('PASS', msg); } else { failed++; console.log('FAIL', msg); }
}

/** The small part of the D1 API the server uses, on node:sqlite. */
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../server/migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

const NOW = TRIAL_EPOCH + 2 * 24 * 3600 * 1000; // a Wednesday of week 0
const env = { DB: d1(), CHECKS_PER_DAY: '400', TICKS_PER_DAY: '6000000' };
async function req(path, { method = 'GET', body, token, ip = '1.2.3.4', env: e = env, now = NOW } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handle(new Request('https://api.test' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }), e, now);
  const data = res.status === 204 ? {} : await res.json();
  return Object.assign({}, data, { http: res.status, result: data.status, headers: res.headers });
}

console.log('--- Weekly Echo server');
ok(checkName('Ko Ko').name === 'Ko Ko' && checkName('  a  ').error && checkName('n1gg3r').error && checkName('Stun<script>').error, 'names: allowed characters, length and blocked words (with look-alike digits)');

const cur = await req('/trial/current');
ok(cur.week === 0 && cur.version === SIM_VERSION && cur.level === trialWeek(0).level, 'current week and simulation version');
ok((await req('/trial/current', { method: 'OPTIONS' })).http === 204, 'CORS preflight answered');

const a = await req('/players', { method: 'POST', body: { name: 'Stunner' } });
ok(a.http === 201 && /^[0-9a-f]{64}$/.test(a.token) && a.id, 'join returns an id and a secret token');
ok(!env.DB.raw.prepare('SELECT * FROM players').get().token_hash.includes(a.token), 'token is stored hashed only');
ok((await req('/players', { method: 'POST', body: { name: 'stun-ner' }, ip: '5.6.7.8' })).http === 409, 'look-alike name is taken');
const b = await req('/players', { method: 'POST', body: { name: 'Second' }, ip: '5.6.7.8' });
ok(b.http === 201, 'a second player joins');
for (let i = 0; i < 5; i++) await req('/players', { method: 'POST', body: { name: `Spam${i}x` }, ip: '9.9.9.9' });
ok((await req('/players', { method: 'POST', body: { name: 'Spam9x' }, ip: '9.9.9.9' })).http === 429, 'joins are rate limited per network address');

const rn = await req('/players/rename', { method: 'POST', body: { name: 'Stun' }, token: a.token });
ok(rn.http === 200 && rn.name === 'Stun', 'rename works');
ok((await req('/players/rename', { method: 'POST', body: { name: 'Stun Again' }, token: a.token })).http === 429, 'rename only once a week');
ok((await req('/players/rename', { method: 'POST', body: { name: 'Nobody' }, token: 'f'.repeat(64) })).http === 401, 'unknown token refused');

// A real recorded run.
const wk = trialWeek(0);
const build = defaultBuild(wk, 'warrior', 'berserker');
const live = playTrialBot(wk, build, 60 * 100, 3);
ok(live.score.floor >= 1, `bot clears at least one floor (floor ${live.score.floor})`);
const payload = async (claim = live.score, extra = {}) => Object.assign(
  { week: 0, version: SIM_VERSION, build, endTick: live.endTick, claim: { floor: claim.floor, clearTick: claim.clearTick }, inputs: await packInputs(live.record) },
  extra,
);

ok((await req('/runs', { method: 'POST', body: await payload(), token: 'f'.repeat(64) })).http === 401, 'runs need a joined player');
ok((await req('/runs', { method: 'POST', body: await payload(undefined, { version: 'old' }), token: a.token })).http === 409, 'old game version refused');
ok((await req('/runs', { method: 'POST', body: await payload(undefined, { week: 1 }), token: a.token })).http === 400, 'other weeks refused');
const cheat = Object.assign({}, build, { ranks: { q: 5, w: 5, e: 5, r: 3 }, talents: Object.assign({}, build.talents, { bz_cap: 1, bz_might: 5, bz_haste: 5 }) });
ok((await req('/runs', { method: 'POST', body: await payload(undefined, { build: cheat }), token: a.token })).http === 400, 'an impossible build is refused');

const t0 = Date.now();
const sent = await req('/runs', { method: 'POST', body: await payload(), token: a.token });
ok(sent.http === 200 && sent.result === 'verified' && sent.rank === 1 && sent.total === 1, `honest run checked and placed first (${Date.now() - t0} ms)`);
const bud = env.DB.raw.prepare('SELECT * FROM budget').get();
ok(bud.checks === 1 && bud.ticks === live.endTick, 'the check is counted against the daily budget');

const same = await req('/runs', { method: 'POST', body: await payload(), token: a.token });
ok(same.http === 200 && same.result === 'not-better' && same.rank === 1 && env.DB.raw.prepare('SELECT checks FROM budget').get().checks === 1, 'a run that is not better is not replayed again');

const lie = await req('/runs', { method: 'POST', body: await payload({ floor: live.score.floor + 3, clearTick: live.score.clearTick }), token: a.token });
ok(lie.http === 422 && lie.result === 'rejected', 'an inflated claim is rejected after replay');
const kept = env.DB.raw.prepare("SELECT * FROM runs WHERE player = ?").get(a.id);
ok(kept && kept.status === "verified" && kept.floor === live.score.floor, 'the earlier checked best stays on the board after a rejected run');

const boardA = await req(`/boards/0/berserker?me=${a.id}`);
ok(boardA.total === 1 && boardA.top[0].name === 'Stun' && boardA.top[0].floor === live.score.floor && boardA.me.rank === 1, 'board lists the run and finds me');
ok((await req('/boards/0/nosuch')).http === 404, 'unknown subclass board is 404');
const champs = await req('/champions/0');
ok(champs.specs.berserker && champs.specs.berserker[0].name === 'Stun', 'champions list the top runs');
const rep = await req(`/runs/${boardA.top[0].id}/replay`);
ok(rep.http === 200 && rep.inputs && rep.endTick === live.endTick && rep.build.spec === 'berserker', 'top runs can be fetched to watch');

// Budget: with no room left, a run waits as pending and the daily job checks it.
const tight = { DB: env.DB, CHECKS_PER_DAY: '1', TICKS_PER_DAY: '6000000' };
const live2 = playTrialBot(wk, defaultBuild(wk, 'warrior', 'bulwark'), 60 * 60, 5);
const p2 = { week: 0, version: SIM_VERSION, build: defaultBuild(wk, 'warrior', 'bulwark'), endTick: live2.endTick, claim: { floor: live2.score.floor, clearTick: live2.score.clearTick }, inputs: await packInputs(live2.record) };
if (live2.score.floor >= 1) {
  const pend = await req('/runs', { method: 'POST', body: p2, token: b.token, env: tight });
  ok(pend.http === 202 && pend.result === 'pending', 'over the daily budget: the run waits as pending');
  ok((await req('/boards/0/bulwark')).total === 0, 'pending runs are not on the board yet');
  const nextDay = NOW + 24 * 3600 * 1000;
  const job = await daily(tight, nextDay);
  ok(job.checked === 1 && (await req('/boards/0/bulwark', { now: nextDay })).total === 1, 'the daily job checks waiting runs the next day');
} else {
  ok(true, 'second bot run cleared no floor; pending path skipped');
}

// Rate limit on runs.
let limited = false;
for (let i = 0; i < 25 && !limited; i++) limited = (await req('/runs', { method: 'POST', body: { week: 0 }, token: a.token })).http === 429;
ok(limited, 'runs are rate limited per player');

ok(weekIndexAt(NOW) === 0, 'test clock sits in week 0');
console.log(`\n${pass} passed, ${failed} failed`);
if (failed) process.exit(1);
