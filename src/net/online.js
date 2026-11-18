// Your account on a server world (0.57): signing in with Google or Discord, adding the other, the
// one-time import of this browser's characters, and the online characters the server keeps. The
// server side is game-server/api.mjs; this is only the page's half.
//
// The sign-in token is kept in this browser only (never in an exported save, see save.js LOCAL_ONLY).

const KEY = 'stunned-online-v1'; // { [server base]: session token }
const CACHE = 'afterwish-online-cache'; // { [server base]: { cls: { level } } }: for showing levels only

/** A server's https address from its wss:// one. */
export const baseOf = (wsUrl) => String(wsUrl || '').replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');

function readMap(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || '{}') || {};
  } catch (err) {
    return {};
  }
}
function writeMap(k, m) {
  try {
    localStorage.setItem(k, JSON.stringify(m));
  } catch (err) {
    /* storage full or blocked: signing in still works for this visit */
  }
}
export function sessionFor(base) {
  return readMap(KEY)[base] || '';
}
export function setSession(base, token) {
  const m = readMap(KEY);
  if (token) m[base] = token;
  else delete m[base];
  writeMap(KEY, m);
}
export function cacheChar(base, cls, save) {
  const m = readMap(CACHE);
  m[base] = m[base] || {};
  m[base][cls] = { level: save.level || 1 };
  writeMap(CACHE, m);
}
export function cachedChars(base) {
  const all = readMap(CACHE)[base] || {};
  const out = {};
  for (const k in all) if (k !== '_name') out[k] = all[k];
  return out;
}
/** The signed-in name, for the title screen (no need to ask the server just to say hello). */
export function cacheName(base, name) {
  const m = readMap(CACHE);
  m[base] = m[base] || {};
  if (name) m[base]._name = name;
  else delete m[base]._name;
  writeMap(CACHE, m);
}
export function cachedName(base) {
  return (readMap(CACHE)[base] || {})._name || '';
}

/** Call the server's account endpoints. Throws with the server's own words when it says no. */
export async function call(base, path, { method = 'GET', body = null, auth = true } = {}) {
  const token = auth ? sessionFor(base) : '';
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error('Could not reach the server world.');
  }
  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    /* (an empty answer) */
  }
  if (!res.ok) {
    const e = new Error(data.error || 'That did not work.');
    e.status = res.status;
    throw e;
  }
  return data;
}

/** Google's sign-in script, loaded the first time it is needed. */
let gis = null;
export function loadGoogle() {
  if (gis) return gis;
  gis = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) return resolve(window.google.accounts.id);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google && window.google.accounts ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => {
      gis = null;
      reject(new Error('Google sign-in could not load (is something blocking it?).'));
    };
    document.head.appendChild(s);
  });
  return gis;
}

/**
 * Discord: open the popup at once (browsers only allow popups straight from a click), ask the server
 * where to send it, and wait for the answer it posts back. Resolves with { session } or { ticket }.
 */
export function discordPopup(base, mode) {
  const pop = window.open('about:blank', 'afterwish-discord', 'width=520,height=760');
  return new Promise((resolve, reject) => {
    if (!pop) return reject(new Error('Your browser blocked the Discord window. Allow popups for this site, then try again.'));
    let done = false;
    const origin = new URL(base).origin;
    const onMsg = (e) => {
      if (e.origin !== origin || !e.data || e.data.afterwish !== 'auth') return;
      done = true;
      window.removeEventListener('message', onMsg);
      clearInterval(watch);
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error || 'Discord sign-in did not work.'));
    };
    window.addEventListener('message', onMsg);
    const watch = setInterval(() => {
      if (pop.closed && !done) {
        clearInterval(watch);
        window.removeEventListener('message', onMsg);
        reject(new Error('The Discord window was closed.'));
      }
    }, 500);
    call(base, '/auth/discord/begin', { method: 'POST', body: { mode }, auth: mode === 'link' })
      .then(({ url }) => {
        pop.location.href = url;
      })
      .catch((err) => {
        pop.close();
        reject(err);
      });
  });
}
