// Signing in (0.57): proving who someone is with Google or Discord. Nothing here stores anything
// (that is accounts.mjs), and no password ever reaches the game.
//
// Google: the page shows Google's own "Sign in with Google" button, and Google hands the page a signed
// ID token. We check its signature against Google's published keys, that it was made for our client
// id, by Google, and has not expired. Only the client id is needed (it is public), no secret.
//
// Discord: the standard "authorization code" flow. The page opens Discord's consent screen in a popup;
// Discord sends the popup back to this server with a one-time code; this server swaps the code (with
// the app's client secret, which only the server knows, from its settings file) for the player's
// Discord id. A `state` value, made here and used once, ties the answer to the request that asked for
// it, so nobody can slip someone else's sign-in into your popup.
import crypto from 'node:crypto';

const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** Google's signing keys, fetched when needed and kept for as long as Google says (at least an hour). */
export function googleKeys(fetchFn = fetch, url = GOOGLE_KEYS) {
  let keys = null;
  let until = 0;
  return async (now = Date.now()) => {
    if (keys && now < until) return keys;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error('Google keys unavailable');
    const age = /max-age=(\d+)/.exec(res.headers.get ? res.headers.get('cache-control') || '' : '');
    const data = await res.json();
    keys = new Map(data.keys.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })]));
    until = now + Math.max(3600, age ? +age[1] : 0) * 1000;
    return keys;
  };
}

/**
 * Check a Google ID token. Returns { sub, name } (sub: Google's number for this person, which never
 * changes) or throws with a reason.
 */
export async function verifyGoogle(token, clientId, getKeys, now = Date.now()) {
  if (!clientId) throw new Error('Google sign-in is not set up on this server.');
  if (typeof token !== 'string' || token.length > 4096) throw new Error('That sign-in did not look right.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('That sign-in did not look right.');
  let head, body;
  try {
    head = b64json(parts[0]);
    body = b64json(parts[1]);
  } catch (err) {
    throw new Error('That sign-in did not look right.');
  }
  if (head.alg !== 'RS256') throw new Error('That sign-in did not look right.');
  const keys = await getKeys(now);
  const key = keys.get(head.kid);
  if (!key) throw new Error('That sign-in could not be checked. Try again.');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('That sign-in could not be checked.');
  if (!GOOGLE_ISSUERS.has(body.iss)) throw new Error('That sign-in was not from Google.');
  if (body.aud !== clientId) throw new Error('That sign-in was meant for a different app.');
  if (!(body.exp * 1000 > now - 60000)) throw new Error('That sign-in has expired. Try again.');
  if (!body.sub) throw new Error('That sign-in did not say who you are.');
  return { sub: String(body.sub), name: body.given_name || body.name || 'Player' };
}

/** One-time `state` values for Discord sign-ins in progress: what each was for, for 10 minutes. */
export class Pending {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.map = new Map();
  }
  add(info) {
    for (const [k, v] of this.map) if (v.exp < this.now()) this.map.delete(k);
    if (this.map.size > 5000) this.map.clear(); // (a flood of half-finished sign-ins)
    const state = crypto.randomBytes(24).toString('base64url');
    this.map.set(state, { ...info, exp: this.now() + 10 * 60000 });
    return state;
  }
  /** Take a state back (once only). */
  take(state) {
    const v = this.map.get(state);
    this.map.delete(state);
    return v && v.exp >= this.now() ? v : null;
  }
}

/** The address of Discord's consent screen for our app ("identify": the player's id and name only). */
export function discordAuthorizeUrl(cfg, state) {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: 'identify', state, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Swap Discord's one-time code for who the player is: { id, name }. */
export async function discordUser(code, cfg, fetchFn = fetch) {
  if (!cfg.clientId || !cfg.secret) throw new Error('Discord sign-in is not set up on this server.');
  if (typeof code !== 'string' || code.length > 200) throw new Error('That sign-in did not look right.');
  const res = await fetchFn('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.secret, grant_type: 'authorization_code', code, redirect_uri: cfg.redirect }).toString(),
  });
  if (!res.ok) throw new Error('Discord did not accept that sign-in. Try again.');
  const tok = await res.json();
  if (!tok.access_token) throw new Error('Discord did not accept that sign-in. Try again.');
  const me = await fetchFn('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${tok.access_token}` } });
  if (!me.ok) throw new Error('Discord did not say who you are. Try again.');
  const u = await me.json();
  if (!u.id) throw new Error('Discord did not say who you are.');
  return { id: String(u.id), name: u.global_name || u.username || 'Player' };
}
