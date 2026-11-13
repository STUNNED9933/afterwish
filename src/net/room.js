// Rooms: one player hosts, friends join with a five-letter code.
//
// Browsers talk to each other directly (WebRTC). To find each other they use
// PeerJS's free public matchmaking server, so nobody has to run a server.
// The host's room is registered there as "stunned-games-<CODE>".
//
// For testing on one computer you can point it at your own matchmaker with
// ?peer=localhost:9000 in the address (run `npx peerjs --port 9000`).

import { Peer } from 'peerjs';
import { NET_VERSION } from './sync.js';
import { CONFIG } from '../config.js';

const PREFIX = 'stunned-games-v1-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L to misread

export function makeCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 5; i++) s += LETTERS[Math.floor(rnd() * LETTERS.length)];
  return s;
}
export function cleanCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function peerOptions() {
  const opts = { debug: 0 };
  try {
    const q = new URLSearchParams(location.search).get('peer');
    if (q) {
      const [host, port] = q.split(':');
      Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' });
    }
  } catch (err) {
    /* no address bar (tests) */
  }
  return opts;
}

const REASONS = {
  'peer-unavailable': 'No room with that code. Check the code, and that the host is still in the game.',
  network: 'Could not reach the matchmaking server. Check your internet connection.',
  'server-error': 'The matchmaking server is not answering. Try again in a minute.',
  'socket-error': 'Lost the connection to the matchmaking server.',
  'browser-incompatible': 'This browser cannot do peer-to-peer connections.',
  'ssl-unavailable': 'The connection needs a secure page.',
};
const reason = (err) => REASONS[err && err.type] || (err && err.message) || 'Something went wrong with the connection.';

/**
 * The host's side of a room.
 *   onJoin(pid, hello)  a friend arrived; return true to let them in
 *   onCmd(pid, cmd)     a friend did something
 *   onLeave(pid)        a friend left (or their connection dropped)
 */
export class HostRoom {
  constructor({ onJoin, onCmd, onLeave, onError }) {
    Object.assign(this, { onJoin, onCmd, onLeave, onError });
    this.code = null;
    this.peer = null;
    this.friends = new Map(); // pid -> { conn, name, memo }
    this.nextPid = 1;
    this.closed = false;
  }

  /** Register a room code. Resolves with the code. */
  open(tries = 4) {
    return new Promise((resolve, reject) => {
      const code = makeCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      this.peer = peer;
      peer.on('open', () => {
        this.code = code;
        resolve(code);
      });
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && tries > 0) {
          peer.destroy();
          this.open(tries - 1).then(resolve, reject); // that code is taken: pick another
        } else if (!this.code) {
          peer.destroy();
          reject(new Error(reason(err)));
        } else if (err.type !== 'peer-unavailable') this.onError && this.onError(reason(err));
      });
      peer.on('disconnected', () => {
        // Lost the matchmaker (friends already here stay connected). Try to keep the code.
        if (!this.closed) setTimeout(() => !this.closed && peer.reconnect(), 2000);
      });
    });
  }

  accept(conn) {
    let pid = null;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (pid === null) {
        if (msg.t !== 'hello') return;
        const say = (why) => {
          conn.send({ t: 'reject', reason: why });
          setTimeout(() => conn.close(), 500);
        };
        if (msg.v !== NET_VERSION) return say('The host is running a different version of the game. Both of you need the same version.');
        if (this.friends.size + 1 >= CONFIG.PARTY_MAX) return say(`That room is full (${CONFIG.PARTY_MAX} players).`);
        pid = this.nextPid++;
        const ok = this.onJoin(pid, msg);
        if (ok !== true) {
          pid = null;
          return say(typeof ok === 'string' ? ok : 'The host could not add you right now.');
        }
        this.friends.set(pid, { conn, name: msg.name, memo: {} });
        conn.send({ t: 'welcome', pid, code: this.code });
        return;
      }
      if (msg.t === 'cmd' && msg.cmd && typeof msg.cmd.type === 'string') this.onCmd(pid, msg.cmd);
      else if (msg.t === 'bye') conn.close();
    });
    const gone = () => {
      if (pid !== null && this.friends.has(pid)) {
        this.friends.delete(pid);
        this.onLeave(pid);
      }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  sendTo(pid, msg) {
    const f = this.friends.get(pid);
    if (f && f.conn.open) f.conn.send(msg);
  }

  get size() {
    return this.friends.size + 1;
  }

  close() {
    this.closed = true;
    for (const f of this.friends.values()) {
      try {
        f.conn.send({ t: 'closed' });
      } catch (err) {
        /* already gone */
      }
    }
    setTimeout(() => this.peer && this.peer.destroy(), 300);
  }
}

/** A friend's side: join a room by its code. */
export class JoinRoom {
  constructor({ onMessage, onClose }) {
    Object.assign(this, { onMessage, onClose });
    this.peer = null;
    this.conn = null;
    this.pid = null;
    this.closed = false;
  }

  /** Connect and say hello. Resolves with the welcome message, or rejects with a reason. */
  join(code, hello) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let done = false;
      const fail = (why) => {
        if (done) return;
        done = true;
        peer.destroy();
        reject(new Error(why));
      };
      const timer = setTimeout(() => fail('The room did not answer. Check the code and try again.'), 15000);
      peer.on('error', (err) => {
        if (!done) fail(reason(err));
      });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + cleanCode(code), { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => conn.send(Object.assign({ t: 'hello', v: NET_VERSION }, hello)));
        conn.on('data', (msg) => {
          if (!msg || typeof msg !== 'object') return;
          if (!done) {
            if (msg.t === 'welcome') {
              done = true;
              clearTimeout(timer);
              this.pid = msg.pid;
              resolve(msg);
            } else if (msg.t === 'reject') fail(msg.reason);
            return;
          }
          this.onMessage(msg);
        });
        conn.on('close', () => {
          if (!done) fail('The host closed the connection.');
          else if (!this.closed) this.onClose('The connection to the host was lost.');
        });
      });
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    try {
      this.send({ t: 'bye' });
    } catch (err) {
      /* already gone */
    }
    setTimeout(() => this.peer && this.peer.destroy(), 300);
  }
}
