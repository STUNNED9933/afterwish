// The server's web endpoints for accounts (0.57), next to /health. The game page calls them with
// fetch (and opens one Discord popup); everything else goes over the WebSocket as before.
//
//   GET  /auth/config             which sign-ins this server offers (and Google's public client id)
//   POST /auth/google             { credential, mode: 'login' | 'link' }  -> { session, account }
//   POST /auth/discord/begin      { mode }                          -> { url } (open it in a popup)
//   GET  /auth/discord/callback   Discord sends the popup here; it tells the game page, then closes
//   POST /auth/discord/link       { ticket }  finishes adding Discord, from the page that asked for it
//   POST /auth/logout             ends this sign-in
//   GET  /account                 the signed-in account (name, sign-ins, online characters, wallet)
//   POST /account/import          { saves: { cls: save }, wallet }  once per account
//   POST /account/unlink          { provider }  (only while another way to sign in remains)
//
// Signed-in calls carry "Authorization: Bearer <session>". Only pages from ALLOWED_ORIGINS may call.
import { World } from '../src/sim/world.js';
import { CLASSES } from '../src/sim/classes.js';
import { verifyGoogle, googleKeys, Pending, discordAuthorizeUrl, discordUser } from './auth.mjs';

const BODY_MAX = 1024 * 1024; // an import of four characters is well under this
const RATE = { burst: 40, perMinute: 20 };

/** A browser's save made into exactly what the game writes (or null if it is not a save at all). */
export function cleanSave(cls, save) {
  if (!CLASSES[cls] || !save || typeof save !== 'object' || Array.isArray(save)) return null;
  if (JSON.stringify(save).length > 400 * 1024) return null;
  if (!(save.level >= 1)) return null;
  try {
    const w = new World({ seed: 1, mode: 'explore', cls, save: Object.assign({}, save, { cls }) });
    return w.toSave();
  } catch (err) {
    return null;
  }
}

/**
 * The handler. cfg: { googleId, discordId, discordSecret, publicUrl } (publicUrl: this server's https
 * address, for Discord's redirect). Returns (req, res) => true if it answered.
 */
export function createApi({ store, cfg, originOk, fetchFn = fetch, now = () => Date.now() }) {
  const getKeys = googleKeys(fetchFn);
  const pending = new Pending(now);
  const discord = { clientId: cfg.discordId, secret: cfg.discordSecret, redirect: `${(cfg.publicUrl || '').replace(/\/+$/, '')}/auth/discord/callback` };
  const buckets = new Map();
  const limited = (ip) => {
    const t = now();
    const b = buckets.get(ip) || { tokens: RATE.burst, at: t };
    b.tokens = Math.min(RATE.burst, b.tokens + ((t - b.at) / 60000) * RATE.perMinute);
    b.at = t;
    b.tokens -= 1;
    buckets.set(ip, b);
    if (buckets.size > 10000) buckets.clear();
    return b.tokens < 0;
  };

  return async function handle(req, res, ip = '') {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (!p.startsWith('/auth/') && p !== '/account' && !p.startsWith('/account/')) return false;
    const origin = req.headers.origin;
    const cors = origin && originOk(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' } : {};
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
      res.end(JSON.stringify(body));
      return true;
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return true;
    }
    if (limited(ip)) return send(429, { error: 'Too many tries. Wait a minute.' });
    // (the Discord popup comes back here from Discord, not from the game page: no Origin to check)
    if (p === '/auth/discord/callback') return discordCallback(url, res);
    if (origin && !originOk(origin)) return send(403, { error: 'Not from the game.' });
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const me = token ? store.bySession(token[1]) : null;

    try {
      if (p === '/auth/config' && req.method === 'GET') {
        return send(200, { google: cfg.googleId || null, discord: !!(cfg.discordId && cfg.discordSecret && cfg.publicUrl) });
      }
      if (req.method !== 'POST' && p !== '/account') return send(405, { error: 'No.' });
      const body = req.method === 'POST' ? await readJson(req) : {};

      if (p === '/auth/google') {
        const who = await verifyGoogle(body.credential, cfg.googleId, getKeys, now());
        if (body.mode === 'link') {
          if (!me) return send(401, { error: 'Sign in first, then add Google.' });
          const r = store.link(me.id, 'google', who.sub);
          return r.ok ? send(200, { account: store.summary(me) }) : send(409, { error: r.reason });
        }
        const a = store.signIn('google', who.sub, who.name);
        return send(200, { session: store.newSession(a.id), account: store.summary(a) });
      }
      if (p === '/auth/discord/begin') {
        if (!discord.clientId || !discord.secret || !cfg.publicUrl) return send(400, { error: 'Discord sign-in is not set up on this server.' });
        if (!origin || !originOk(origin) || origin === 'null') return send(400, { error: 'Open the game from its website to sign in with Discord.' });
        if (body.mode === 'link' && !me) return send(401, { error: 'Sign in first, then add Discord.' });
        const state = pending.add({ mode: body.mode === 'link' ? 'link' : 'login', account: me ? me.id : null, origin });
        return send(200, { url: discordAuthorizeUrl(discord, state) });
      }
      if (p === '/auth/discord/link') {
        const t = pending.take(String(body.ticket || ''));
        if (!me || !t || t.kind !== 'link' || t.account !== me.id) return send(400, { error: 'That did not work. Try adding Discord again.' });
        const r = store.link(me.id, 'discord', t.pid);
        return r.ok ? send(200, { account: store.summary(me) }) : send(409, { error: r.reason });
      }
      if (p === '/auth/logout') {
        if (token) store.endSession(token[1]);
        return send(200, { ok: true });
      }
      if (!me) return send(401, { error: 'Your sign-in has run out. Sign in again.' });
      if (p === '/account') return send(200, { account: store.summary(me) });
      if (p === '/account/import') {
        const r = store.importOnce(me.id, body.saves, body.wallet, cleanSave);
        return r.ok ? send(200, { account: store.summary(me), classes: r.classes }) : send(409, { error: r.reason });
      }
      if (p === '/account/unlink') {
        const r = store.unlink(me.id, String(body.provider));
        return r.ok ? send(200, { account: store.summary(me) }) : send(409, { error: r.reason });
      }
      return send(404, { error: 'No such thing.' });
    } catch (err) {
      return send(400, { error: err && err.message ? err.message : 'That did not work.' });
    }
  };

  /** Discord's answer: sign in or link, then hand the result to the game page that opened the popup. */
  async function discordCallback(url, res) {
    const info = pending.take(url.searchParams.get('state') || '');
    let out;
    if (!info) out = { ok: false, error: 'That sign-in took too long, or was already used. Try again.' };
    else if (url.searchParams.get('error')) out = { ok: false, error: 'Discord sign-in was cancelled.' };
    else {
      try {
        const who = await discordUser(url.searchParams.get('code'), discord, fetchFn);
        if (info.mode === 'link') {
          // Not linked here: the page that asked (signed in to that same account) must finish it, so a
          // "link" address sent to someone else cannot attach their Discord to the sender's account.
          out = { ok: true, mode: 'link', ticket: pending.add({ kind: 'link', account: info.account, pid: who.id }) };
        } else {
          const a = store.signIn('discord', who.id, who.name);
          out = { ok: true, mode: 'login', session: store.newSession(a.id) };
        }
      } catch (err) {
        out = { ok: false, error: err.message || 'Discord sign-in did not work.' };
      }
    }
    // The popup tells the page that opened it (only if that page is the game), then closes.
    const target = info ? info.origin : null;
    const html = `<!doctype html><meta charset="utf-8"><title>Afterwish</title><body style="background:#0a0d16;color:#ece5d6;font:16px sans-serif;padding:24px">
<p>${out.ok ? 'Signed in. You can close this window.' : 'Sign-in did not work: ' + esc(out.error)}</p>
<script>try{${target ? `window.opener&&window.opener.postMessage(${JSON.stringify({ afterwish: 'auth', provider: 'discord', ...out }).replace(/</g, '\\u003c')},${JSON.stringify(target)});` : ''}}catch(e){}setTimeout(function(){window.close()},${out.ok ? 300 : 4000});</script>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    res.end(html);
    return true;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_MAX) {
        reject(new Error('That is too big.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(new Error('That did not look right.'));
      }
    });
    req.on('error', reject);
  });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
