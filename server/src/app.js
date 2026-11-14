// The Weekly Echo server: a Cloudflare Worker with a D1 database (binding DB).
//
//   GET  /trial/current               this week's echo and the simulation version
//   POST /players                     { name } -> { id, token, name }   (join the boards)
//   POST /players/rename              { name } with Authorization: Bearer <token>
//   POST /runs                        a finished run (see src/main.js finishTrial); replayed before it counts
//   GET  /boards/:week/:spec?me=id    top 10, the places around you, total, your percentile
//   GET  /champions/:week             top 3 of each subclass
//   GET  /runs/:id/replay             a top-3 run's recording, to watch in the game
//
// Spending safety (see README "Weekly Echo server"): every run is replayed at most once,
// only when it beats the player's best; replays per day are capped (CHECKS_PER_DAY and
// TICKS_PER_DAY) so CPU stays inside what the Workers Paid plan includes; anything over
// the cap waits as "pending" and is checked by the hourly scheduled job once the next day's budget opens.

import { trialWeek, weekIndexAt, validateBuild, replayTrial, TRIAL_MAX_TICKS, TRIAL_MAX_FLOOR } from '../../src/sim/trial.js';
import { SIM_VERSION } from '../../src/sim/version.js';
import { SPECS } from '../../src/sim/talents.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};
const MAX_BODY = 4_000_000; // bytes; a long run is about 150 KB zipped
const MAX_INPUTS = 250_000;
const SUBMITS_PER_HOUR = 20;
const JOINS_PER_HOUR = 5;
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'porn', 'dick', 'cock', 'pussy', 'whore', 'slut', 'retard', 'kys', 'admin', 'moderator', 'stunned'];

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: Object.assign({ 'content-type': 'application/json' }, CORS, extra) });
}
const fail = (status, error) => json({ error }, status);

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const today = (now) => new Date(now).toISOString().slice(0, 10);

/** A display name, or an error message. */
export function checkName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9 _-]{3,16}$/.test(name)) return { error: 'Names are 3 to 16 letters, numbers, spaces, hyphens or underscores.' };
  const key = name.toLowerCase().replace(/[\s_-]/g, '');
  const flat = key.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  if (key.length < 3 || BLOCKED.some((w) => flat.includes(w))) return { error: 'Please pick another name.' };
  return { name, key };
}

async function limited(db, key, max, now) {
  const hour = Math.floor(now / 3600000);
  await db.prepare('INSERT INTO limits (key, hour, n) VALUES (?, ?, 1) ON CONFLICT (key, hour) DO UPDATE SET n = n + 1').bind(key, hour).run();
  const row = await db.prepare('SELECT n FROM limits WHERE key = ? AND hour = ?').bind(key, hour).first();
  return row.n > max;
}

async function playerFor(db, request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const p = await db.prepare('SELECT * FROM players WHERE token_hash = ?').bind(await sha256(token)).first();
  return p && !p.banned ? p : null;
}

async function unpack(packed) {
  if (!packed || typeof packed !== 'object' || typeof packed.data !== 'string') throw new Error('no recording');
  if (packed.enc === 'json') return JSON.parse(packed.data);
  if (packed.enc !== 'gzip64') throw new Error('unknown recording format');
  const bin = atob(packed.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  if (text.length > 40_000_000) throw new Error('recording too large');
  return JSON.parse(text);
}

const better = (a, b) => !b || a.floor > b.floor || (a.floor === b.floor && a.clear_tick < b.clear_tick);

/** Room left in today's replay budget for a run of `ticks` steps. */
async function budgetAllows(db, env, ticks, now) {
  const row = (await db.prepare('SELECT checks, ticks FROM budget WHERE day = ?').bind(today(now)).first()) || { checks: 0, ticks: 0 };
  return row.checks < Number(env.CHECKS_PER_DAY || 1000) && row.ticks + ticks <= Number(env.TICKS_PER_DAY || 20_000_000);
}
async function spendBudget(db, ticks, now) {
  await db.prepare('INSERT INTO budget (day, checks, ticks) VALUES (?, 1, ?) ON CONFLICT (day) DO UPDATE SET checks = checks + 1, ticks = ticks + ?').bind(today(now), ticks, ticks).run();
}

/** Replay a stored run and settle its status. Returns the replay result. */
async function check(db, env, run, now) {
  const inputs = await unpack(JSON.parse(run.inputs));
  const result = replayTrial(trialWeek(run.week), JSON.parse(run.build), inputs, run.end_tick);
  await spendBudget(db, run.end_tick, now);
  const ok = result.ok && result.floor === run.floor && result.clearTick === run.clear_tick;
  await db.prepare('UPDATE runs SET status = ?, verified = ? WHERE id = ?').bind(ok ? 'verified' : 'rejected', now, run.id).run();
  return Object.assign({ match: ok }, result);
}

async function placeOf(db, week, spec, floor, clearTick, submitted) {
  const total = (await db.prepare("SELECT COUNT(*) AS n FROM runs r JOIN players p ON p.id = r.player WHERE r.week = ? AND r.spec = ? AND r.status = 'verified' AND p.banned = 0").bind(week, spec).first()).n;
  const ahead = (await db
    .prepare("SELECT COUNT(*) AS n FROM runs r JOIN players p ON p.id = r.player WHERE r.week = ? AND r.spec = ? AND r.status = 'verified' AND p.banned = 0 AND (r.floor > ? OR (r.floor = ? AND (r.clear_tick < ? OR (r.clear_tick = ? AND r.submitted < ?))))")
    .bind(week, spec, floor, floor, clearTick, clearTick, submitted)
    .first()).n;
  const rank = ahead + 1;
  return { rank, total, better: total > 1 ? Math.floor((100 * (total - rank)) / total) : 0 };
}

const ROW = 'SELECT r.id, r.player, p.name, r.floor, r.clear_tick AS clearTick FROM runs r JOIN players p ON p.id = r.player';
const ORDER = 'ORDER BY r.floor DESC, r.clear_tick ASC, r.submitted ASC';

export async function handle(request, env, now = Date.now()) {
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const week = weekIndexAt(now);

  try {
    if (request.method === 'GET' && path === '/trial/current') {
      const wk = trialWeek(week);
      return json({ week: wk.index, level: wk.level, featured: wk.featured, ends: wk.ends, version: SIM_VERSION });
    }

    if (request.method === 'POST' && (path === '/players' || path === '/players/rename')) {
      const body = await request.json().catch(() => ({}));
      const n = checkName(body.name);
      if (n.error) return fail(400, n.error);
      if (path === '/players') {
        if (await limited(db, `join:${await sha256(ip)}`, JOINS_PER_HOUR, now)) return fail(429, 'Too many new names from here. Try again in an hour.');
        const taken = await db.prepare('SELECT 1 FROM players WHERE name_key = ?').bind(n.key).first();
        if (taken) return fail(409, 'That name is taken. Try another.');
        const id = randomHex(8);
        const token = randomHex(32);
        await db.prepare('INSERT INTO players (id, name, name_key, token_hash, created) VALUES (?, ?, ?, ?, ?)').bind(id, n.name, n.key, await sha256(token), now).run();
        return json({ id, token, name: n.name }, 201);
      }
      const me = await playerFor(db, request);
      if (!me) return fail(401, 'Unknown player. Join the boards again.');
      if (me.renamed_week === week) return fail(429, 'You can change your name once a week.');
      const taken = await db.prepare('SELECT 1 FROM players WHERE name_key = ? AND id != ?').bind(n.key, me.id).first();
      if (taken) return fail(409, 'That name is taken. Try another.');
      await db.prepare('UPDATE players SET name = ?, name_key = ?, renamed_week = ? WHERE id = ?').bind(n.name, n.key, week, me.id).run();
      return json({ id: me.id, name: n.name });
    }

    if (request.method === 'POST' && path === '/runs') {
      if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'That run is too large to send.');
      const me = await playerFor(db, request);
      if (!me) return fail(401, 'Unknown player. Join the boards again.');
      if (await limited(db, `run:${me.id}`, SUBMITS_PER_HOUR, now)) return fail(429, 'Too many runs sent this hour. Your run is kept and will be sent later.');
      const text = await request.text();
      if (text.length > MAX_BODY) return fail(413, 'That run is too large to send.');
      const body = JSON.parse(text);
      if (body.version !== SIM_VERSION) return fail(409, 'The game has been updated. Refresh the page to play this week’s echo.');
      if (body.week !== week) return fail(400, 'That week’s echo has ended.');
      const wk = trialWeek(week);
      const build = body.build;
      const bad = validateBuild(wk, build);
      if (bad) return fail(400, `That build is not allowed: ${bad}.`);
      const claim = body.claim || {};
      const floor = claim.floor, clearTick = claim.clearTick, endTick = body.endTick;
      if (!Number.isInteger(floor) || floor < 1 || floor > TRIAL_MAX_FLOOR || !Number.isInteger(clearTick) || clearTick < 0 || !Number.isInteger(endTick) || endTick < clearTick || endTick > TRIAL_MAX_TICKS) {
        return fail(400, 'Runs that clear no floor are not put on the board.');
      }
      const spec = build.spec;
      const old = await db.prepare('SELECT * FROM runs WHERE week = ? AND player = ? AND spec = ?').bind(week, me.id, spec).first();
      const mine = { floor, clear_tick: clearTick };
      if (old && old.status !== 'rejected' && !better(mine, old)) {
        const place = old.status === 'verified' ? await placeOf(db, week, spec, old.floor, old.clear_tick, old.submitted) : {};
        return json(Object.assign({ status: 'not-better' }, place));
      }
      // Cheap shape checks before anything is stored.
      const inputs = await unpack(body.inputs).catch(() => null);
      if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) return fail(400, 'That run’s recording could not be read.');
      const id = randomHex(8);
      await db.prepare('DELETE FROM runs WHERE week = ? AND player = ? AND spec = ?').bind(week, me.id, spec).run();
      await db
        .prepare("INSERT INTO runs (id, week, player, cls, spec, floor, clear_tick, end_tick, status, version, build, inputs, submitted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
        .bind(id, week, me.id, build.cls, spec, floor, clearTick, endTick, SIM_VERSION, JSON.stringify(build), JSON.stringify(body.inputs), now)
        .run();
      if (!(await budgetAllows(db, env, endTick, now))) return json({ status: 'pending', id }, 202);
      const run = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(id).first();
      const res = await check(db, env, run, now);
      if (!res.match) {
        // Put back the earlier best, if there was one: a run that does not check out never replaces it.
        if (old && old.status === 'verified') {
          await db.prepare('DELETE FROM runs WHERE id = ?').bind(id).run();
          await db
            .prepare('INSERT INTO runs (id, week, player, cls, spec, floor, clear_tick, end_tick, status, version, build, inputs, submitted, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(old.id, old.week, old.player, old.cls, old.spec, old.floor, old.clear_tick, old.end_tick, old.status, old.version, old.build, old.inputs, old.submitted, old.verified)
            .run();
        }
        return json({ status: 'rejected', error: 'That run did not check out when it was replayed, so it is not on the board. If you think this is a mistake, play it again.' }, 422);
      }
      return json(Object.assign({ status: 'verified', id }, await placeOf(db, week, spec, floor, clearTick, now)));
    }

    let m = path.match(/^\/boards\/(-?\d+)\/([a-z]+)$/);
    if (request.method === 'GET' && m) {
      const wkn = Number(m[1]);
      const spec = m[2];
      if (!SPECS[spec]) return fail(404, 'No such subclass.');
      const top = (await db.prepare(`${ROW} WHERE r.week = ? AND r.spec = ? AND r.status = 'verified' AND p.banned = 0 ${ORDER} LIMIT 10`).bind(wkn, spec).all()).results.map((r, i) => Object.assign({ rank: i + 1 }, r));
      const total = (await db.prepare("SELECT COUNT(*) AS n FROM runs r JOIN players p ON p.id = r.player WHERE r.week = ? AND r.spec = ? AND r.status = 'verified' AND p.banned = 0").bind(wkn, spec).first()).n;
      let me = null;
      let around = [];
      const who = url.searchParams.get('me');
      if (who) {
        const run = await db.prepare("SELECT * FROM runs WHERE week = ? AND spec = ? AND player = ? AND status = 'verified'").bind(wkn, spec, who).first();
        if (run) {
          me = await placeOf(db, wkn, spec, run.floor, run.clear_tick, run.submitted);
          if (me.rank > 10) {
            const from = Math.max(10, me.rank - 3);
            around = (await db.prepare(`${ROW} WHERE r.week = ? AND r.spec = ? AND r.status = 'verified' AND p.banned = 0 ${ORDER} LIMIT 5 OFFSET ?`).bind(wkn, spec, from).all()).results.map((r, i) => Object.assign({ rank: from + i + 1 }, r));
          }
        }
      }
      return json({ week: wkn, spec, total, top, me, around }, 200, { 'cache-control': 'max-age=20' });
    }

    m = path.match(/^\/champions\/(-?\d+)$/);
    if (request.method === 'GET' && m) {
      const rows = (await db
        .prepare(`SELECT spec, name, floor, clearTick FROM (SELECT r.spec, p.name, r.floor, r.clear_tick AS clearTick, ROW_NUMBER() OVER (PARTITION BY r.spec ${ORDER}) AS rn FROM runs r JOIN players p ON p.id = r.player WHERE r.week = ? AND r.status = 'verified' AND p.banned = 0) WHERE rn <= 3 ORDER BY spec, rn`)
        .bind(Number(m[1]))
        .all()).results;
      const specs = {};
      for (const r of rows) (specs[r.spec] = specs[r.spec] || []).push({ name: r.name, floor: r.floor, clearTick: r.clearTick });
      return json({ week: Number(m[1]), specs }, 200, { 'cache-control': 'max-age=30' });
    }

    m = path.match(/^\/runs\/([0-9a-f]{16})\/replay$/);
    if (request.method === 'GET' && m) {
      const run = await db.prepare("SELECT r.*, p.name FROM runs r JOIN players p ON p.id = r.player WHERE r.id = ? AND r.status = 'verified' AND p.banned = 0").bind(m[1]).first();
      if (!run || !run.inputs) return fail(404, 'That run cannot be watched.');
      const place = await placeOf(db, run.week, run.spec, run.floor, run.clear_tick, run.submitted);
      if (place.rank > 3) return fail(404, 'Only the top three runs of each board can be watched.');
      return json({ week: run.week, build: JSON.parse(run.build), inputs: JSON.parse(run.inputs), endTick: run.end_tick, name: run.name, floor: run.floor }, 200, { 'cache-control': 'max-age=300' });
    }

    return fail(404, 'Not found.');
  } catch (err) {
    return fail(500, 'Something went wrong on the server.');
  }
}

const SLICE_TICKS = 1_500_000; // steps one scheduled run may replay, well inside cpu_ms

/** Hourly job: check runs that waited for budget, tidy up rate limits and old recordings. */
export async function daily(env, now = Date.now()) {
  const db = env.DB;
  const pending = (await db.prepare("SELECT * FROM runs WHERE status = 'pending' ORDER BY submitted ASC LIMIT 200").all()).results;
  let checked = 0, ticks = 0;
  for (const run of pending) {
    if (ticks + run.end_tick > SLICE_TICKS && checked > 0) break;
    if (run.version !== SIM_VERSION) {
      await db.prepare("UPDATE runs SET status = 'rejected' WHERE id = ?").bind(run.id).run();
      continue;
    }
    if (!(await budgetAllows(db, env, run.end_tick, now))) break;
    await check(db, env, run, now);
    checked++;
    ticks += run.end_tick;
  }
  await db.prepare('DELETE FROM limits WHERE hour < ?').bind(Math.floor(now / 3600000) - 48).run();
  await db.prepare("DELETE FROM budget WHERE day < ?").bind(today(now - 60 * 24 * 3600000)).run();
  // Recordings older than four weeks are only kept for each board's top 10.
  const oldWeek = weekIndexAt(now) - 4;
  await db
    .prepare(`UPDATE runs SET inputs = NULL WHERE week <= ? AND inputs IS NOT NULL AND id NOT IN (SELECT id FROM (SELECT r.id, ROW_NUMBER() OVER (PARTITION BY r.week, r.spec ${ORDER}) AS rn FROM runs r WHERE r.status = 'verified') WHERE rn <= 10)`)
    .bind(oldWeek)
    .run();
  return { checked };
}
