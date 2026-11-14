// Talking to the Weekly Echo server (server/ in this repo, a Cloudflare Worker).
//
// Where the server lives is set at build time (TRIAL_API_URL, see build.mjs and the
// Pages workflow). For testing, localStorage['stunned-trial-api'] overrides it.
// Without either, the Weekly Echo still works offline: runs are kept in this browser.

/* global __TRIAL_API__ */
const BUILT_IN = typeof __TRIAL_API__ !== 'undefined' ? __TRIAL_API__ : '';
const ID_KEY = 'stunned-trial-id-v1';

export function apiBase() {
  let url = '';
  try {
    url = localStorage.getItem('stunned-trial-api') || '';
  } catch (err) {
    /* storage unavailable */
  }
  return (url || BUILT_IN || '').replace(/\/+$/, '');
}

export function online() {
  return !!apiBase();
}

/** { id, token, name } once this browser has joined the boards. */
export function identity() {
  try {
    return JSON.parse(localStorage.getItem(ID_KEY) || 'null');
  } catch (err) {
    return null;
  }
}
function storeIdentity(v) {
  try {
    localStorage.setItem(ID_KEY, JSON.stringify(v));
  } catch (err) {
    /* storage unavailable */
  }
}

async function call(path, { method = 'GET', body = null, auth = false } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  const me = identity();
  if (auth && me) headers.authorization = `Bearer ${me.token}`;
  let res;
  try {
    res = await fetch(apiBase() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    return { ok: false, http: 0, status: 0, error: 'The boards cannot be reached right now.' };
  }
  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    /* not JSON */
  }
  // `http` is the HTTP status; `status` is the server's word for a run (verified, pending...) when it sends one.
  return Object.assign({ ok: res.ok, status: res.status }, data, { http: res.status });
}

/** Join the boards under a display name. */
export async function join(name) {
  const r = await call('/players', { method: 'POST', body: { name } });
  if (r.ok) storeIdentity({ id: r.id, token: r.token, name: r.name });
  return r;
}

export async function rename(name) {
  const r = await call('/players/rename', { method: 'POST', body: { name }, auth: true });
  if (r.ok) storeIdentity(Object.assign({}, identity(), { name: r.name }));
  return r;
}

/** Gzip and base64 a run's commands (a long run is about a megabyte of text, a tenth of that zipped). */
export async function packInputs(inputs) {
  const text = JSON.stringify(inputs);
  if (typeof CompressionStream === 'undefined') return { enc: 'json', data: text };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { enc: 'gzip64', data: btoa(bin) };
}

export async function unpackInputs(packed) {
  if (!packed) return [];
  if (packed.enc === 'json') return JSON.parse(packed.data);
  const bin = atob(packed.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/** Send a finished run. The server replays it and answers with its place. */
export function submitRun(payload) {
  return call('/runs', { method: 'POST', body: payload, auth: true });
}

export function board(week, spec) {
  const me = identity();
  return call(`/boards/${week}/${spec}${me ? `?me=${encodeURIComponent(me.id)}` : ''}`);
}

export function champions(week) {
  return call(`/champions/${week}`);
}

export function fetchReplay(runId) {
  return call(`/runs/${encodeURIComponent(runId)}/replay`);
}

export function current() {
  return call('/trial/current');
}
