// Accounts and online characters (0.57). Kept in plain files in one folder (on the server:
// /var/lib/afterwish, the service's StateDirectory), written safely (a new file, then a rename) a
// moment after anything changes, and at once when the server stops.
//
//   accounts.json   every account: its id, a display name, which Google and Discord identities sign
//                   in to it, whether its one-time import is used, and its wallet (gold, shards,
//                   rebirths); plus sessions, stored only as SHA-256 hashes (a stolen file signs no one in)
//   chars/<id>.json that account's online characters, one per class (the same save the game keeps)
//
// No emails or real names are kept: Google's account number ("sub") and Discord's user id, and the
// name the player chose. Nothing here talks to Google or Discord (that is auth.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROVIDERS = ['google', 'discord'];
const SESSION_DAYS = 120;
const SESSIONS_PER_ACCOUNT = 10;
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const newId = () => crypto.randomBytes(9).toString('base64url'); // 12 characters
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Player';

export class AccountStore {
  /** `dir`: the folder to keep everything in (made if missing). `now`: a clock, for tests. */
  constructor(dir, { now = () => Date.now() } = {}) {
    this.dir = dir;
    this.now = now;
    fs.mkdirSync(path.join(dir, 'chars'), { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'accounts.json');
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { v: 1, accounts: {}, sessions: {} };
    this.accounts = data.accounts || {};
    this.sessions = data.sessions || {};
    this.index = new Map(); // 'google:<sub>' -> account id
    for (const a of Object.values(this.accounts)) for (const p of PROVIDERS) if (a[p]) this.index.set(`${p}:${a[p]}`, a.id);
    this.chars = new Map(); // account id -> { cls: save } (loaded when first needed)
    this.dirty = new Set(); // 'accounts' and/or account ids whose characters changed
    this.timer = null;
  }

  // --------------------------------------------------------------- accounts
  byProvider(provider, pid) {
    const id = this.index.get(`${provider}:${pid}`);
    return id ? this.accounts[id] : null;
  }

  /** Sign in with a provider's identity: the account it belongs to, or a new one. */
  signIn(provider, pid, name) {
    if (!PROVIDERS.includes(provider) || !pid) throw new Error('bad provider');
    let a = this.byProvider(provider, pid);
    if (!a) {
      a = { id: newId(), name: cleanName(name), created: this.now(), [provider]: String(pid), imported: 0, wallet: { gold: 0, tickets: 3, rebirths: 0 } };
      this.accounts[a.id] = a;
      this.index.set(`${provider}:${pid}`, a.id);
      this.touch('accounts');
    }
    return a;
  }

  /**
   * Add a second way to sign in to an account the player is already signed in to. Refused if that
   * identity already belongs to another account (it could only be added by whoever controls both).
   */
  link(accountId, provider, pid) {
    const a = this.accounts[accountId];
    if (!a || !PROVIDERS.includes(provider) || !pid) return { ok: false, reason: 'Not signed in.' };
    const other = this.byProvider(provider, pid);
    if (other && other.id !== a.id) return { ok: false, reason: `That ${cap(provider)} account already signs in to a different Afterwish account.` };
    if (a[provider] && a[provider] !== String(pid)) return { ok: false, reason: `This account already has a ${cap(provider)} sign-in. Remove it first.` };
    a[provider] = String(pid);
    this.index.set(`${provider}:${pid}`, a.id);
    this.touch('accounts');
    return { ok: true };
  }

  /** Remove a way to sign in, as long as another one remains. */
  unlink(accountId, provider) {
    const a = this.accounts[accountId];
    if (!a || !a[provider]) return { ok: false, reason: 'Nothing to remove.' };
    if (!PROVIDERS.some((p) => p !== provider && a[p])) return { ok: false, reason: 'That is the only way you sign in. Add another before removing it.' };
    this.index.delete(`${provider}:${a[provider]}`);
    delete a[provider];
    this.touch('accounts');
    return { ok: true };
  }

  // --------------------------------------------------------------- sessions
  /** A new sign-in token for the account (only its hash is kept). */
  newSession(accountId) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions[hash(token)] = { id: accountId, exp: this.now() + SESSION_DAYS * 864e5, at: this.now() };
    // keep only the newest few per account
    const mine = Object.entries(this.sessions).filter(([, s]) => s.id === accountId).sort((x, y) => y[1].at - x[1].at);
    for (const [h] of mine.slice(SESSIONS_PER_ACCOUNT)) delete this.sessions[h];
    this.touch('accounts');
    return token;
  }

  /** The account a token signs in to, or null (unknown or expired). */
  bySession(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const s = this.sessions[hash(token)];
    if (!s) return null;
    if (s.exp < this.now()) {
      delete this.sessions[hash(token)];
      this.touch('accounts');
      return null;
    }
    return this.accounts[s.id] || null;
  }

  endSession(token) {
    if (this.sessions[hash(token)]) {
      delete this.sessions[hash(token)];
      this.touch('accounts');
    }
  }

  // --------------------------------------------------------------- characters
  charsOf(accountId) {
    if (!this.chars.has(accountId)) {
      const f = path.join(this.dir, 'chars', `${accountId}.json`);
      this.chars.set(accountId, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
    }
    return this.chars.get(accountId);
  }
  getChar(accountId, cls) {
    return this.charsOf(accountId)[cls] || null;
  }
  putChar(accountId, cls, save) {
    if (!this.accounts[accountId] || !save) return;
    this.charsOf(accountId)[cls] = save;
    this.touch(accountId);
  }
  setWallet(accountId, w) {
    const a = this.accounts[accountId];
    if (!a) return;
    const n = (v, d) => Math.max(0, Math.floor(Number.isFinite(+v) ? +v : d));
    const next = { gold: n(w.gold, a.wallet.gold), tickets: n(w.tickets, a.wallet.tickets), rebirths: n(w.rebirths, a.wallet.rebirths) };
    if (next.gold === a.wallet.gold && next.tickets === a.wallet.tickets && next.rebirths === a.wallet.rebirths) return;
    a.wallet = next;
    this.touch('accounts');
  }

  // --------------------------------------------------------------- the Weekly Echo (0.60)
  /** Link a Weekly Echo board name to this account. Refused if another account has it already. */
  linkBoard(accountId, boardId) {
    const a = this.accounts[accountId];
    if (!a || !boardId) return false;
    if (Object.values(this.accounts).some((o) => o.id !== accountId && o.board === boardId)) return false;
    if (a.board !== boardId) {
      a.board = String(boardId);
      this.touch('accounts');
    }
    return true;
  }
  /** Which weeks this account has been rewarded for taking part in, and the titles it holds. */
  weeklyOf(accountId) {
    const a = this.accounts[accountId];
    const w = (a && a.weekly) || {};
    return { claimed: Array.isArray(w.claimed) ? w.claimed.slice() : [], titles: Array.isArray(w.titles) ? w.titles.slice() : [] };
  }
  setWeekly(accountId, w) {
    const a = this.accounts[accountId];
    if (!a) return;
    a.weekly = { claimed: (w.claimed || []).slice(-60), titles: (w.titles || []).slice(0, 60) };
    this.touch('accounts');
  }

  /**
   * The one-time import (0.57 beta): bring the characters from a browser into the account. `clean`
   * turns each save into what the game itself would write (see server.mjs), dropping anything odd.
   */
  importOnce(accountId, saves, wallet, clean) {
    const a = this.accounts[accountId];
    if (!a) return { ok: false, reason: 'Not signed in.' };
    if (a.imported) return { ok: false, reason: 'This account has already brought its characters over (it can only be done once).' };
    const got = {};
    for (const cls of Object.keys(saves || {})) {
      const s = clean(cls, saves[cls]);
      if (s) got[cls] = s;
    }
    if (!Object.keys(got).length) return { ok: false, reason: 'There are no characters in this browser to bring.' };
    const mine = this.charsOf(accountId);
    for (const cls in got) mine[cls] = got[cls];
    this.touch(accountId);
    a.imported = this.now();
    this.setWallet(accountId, wallet || {});
    this.touch('accounts');
    return { ok: true, classes: Object.keys(got) };
  }

  /** What the account looks like to its owner (no tokens, no provider ids). */
  summary(a) {
    const chars = {};
    const mine = this.charsOf(a.id);
    for (const cls in mine) chars[cls] = { level: mine[cls].level || 1, rebirth: (mine[cls].rebirth && mine[cls].rebirth.n) || 0 };
    return { name: a.name, google: !!a.google, discord: !!a.discord, imported: a.imported || 0, wallet: a.wallet, chars };
  }

  // --------------------------------------------------------------- writing
  touch(what) {
    this.dirty.add(what);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 2000);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    for (const what of this.dirty) {
      if (what === 'accounts') write(path.join(this.dir, 'accounts.json'), { v: 1, accounts: this.accounts, sessions: this.sessions });
      else if (this.chars.has(what)) write(path.join(this.dir, 'chars', `${what}.json`), this.chars.get(what));
    }
    this.dirty.clear();
  }
}

function write(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
