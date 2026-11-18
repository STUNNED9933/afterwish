// The Afterwish server world (0.55): run with `node server.mjs` on a small server (see README,
// "Server world"). It runs the same rules as the game (src/sim) for everyone connected, 60 steps a
// second, and talks to browsers over WebSocket. All the game logic is in src/net/shards.js.
//
// Settings (environment variables):
//   AFTERWISH_PASSCODE  what friends type to get in. Without one, nobody can join.
//   PORT                where it listens (default 8787). Put HTTPS in front (Caddy, or Cloudflare's proxy).
//   ALLOWED_ORIGINS     pages allowed to connect (default: the game's site and localhost)
//   WORLD_NAME          shown to players (default "Haven")
//   MAX_PLAYERS         players on this server at once (default 24; see docs/ops/server-runbook.md)
//   HAVEN_MAX           players in one copy of Haven before another opens (default 16)
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { ServerWorld, SERVER_LIMITS } from '../src/net/shards.js';
import { CONFIG } from '../src/config.js';

const PORT = Number(process.env.PORT) || 8787;
const PASSCODE = process.env.AFTERWISH_PASSCODE || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://afterwish.stunnedgames.net,http://localhost,http://127.0.0.1,null').split(',').map((s) => s.trim());
const PER_IP = 4; // connections from one address
const HELLO_WITHIN = 10000; // ms to say hello before being dropped
const BURST = 240, REFILL = 90; // messages: a burst, then this many a second (moves while holding the button are ~10)
const BACKLOG = 256 * 1024; // bytes waiting to go out before a connection counts as backed up

const world = new ServerWorld({
  name: process.env.WORLD_NAME || 'Haven',
  passcode: PASSCODE,
  maxPlayers: Number(process.env.MAX_PLAYERS) || SERVER_LIMITS.players,
  havenMax: Number(process.env.HAVEN_MAX) || SERVER_LIMITS.haven,
  send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  },
  close(ws, reason) {
    setTimeout(() => ws.readyState === WebSocket.OPEN && ws.close(4000, String(reason).slice(0, 100)), 300);
  },
  congested: (ws) => ws.bufferedAmount > BACKLOG,
});

const perIp = new Map();
const ipOf = (req) => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const originOk = (origin) => !origin || ORIGINS.some((o) => origin === o || (o.startsWith('http://localhost') && origin.startsWith('http://localhost:')) || (o.startsWith('http://127.0.0.1') && origin.startsWith('http://127.0.0.1:')));

// How the world is doing, for a quick look in a browser (no player details).
const stats = { stepMs: 0, worst: 0, started: Date.now() };
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, name: world.name, open: !!PASSCODE, players: world.size, max: world.maxPlayers, copies: world.copies.size, stepMs: +stats.stepMs.toFixed(3), worstMs: +stats.worst.toFixed(1), upMinutes: Math.round((Date.now() - stats.started) / 60000) }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: SERVER_LIMITS.msgBytes,
  perMessageDeflate: false,
  verifyClient: ({ req, origin }, done) => {
    if (!originOk(origin)) return done(false, 403, 'Not from the game');
    const ip = ipOf(req);
    if ((perIp.get(ip) || 0) >= PER_IP) return done(false, 429, 'Too many connections');
    done(true);
  },
});

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  ws.alive = true;
  ws.tokens = BURST;
  ws.at = performance.now();
  const helloTimer = setTimeout(() => {
    if (!world.byConn.has(ws)) ws.terminate();
  }, HELLO_WITHIN);
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data, isBinary) => {
    // a token bucket: a burst is fine, a flood closes the connection
    const now = performance.now();
    ws.tokens = Math.min(BURST, ws.tokens + ((now - ws.at) / 1000) * REFILL);
    ws.at = now;
    if (--ws.tokens < 0) return ws.close(4008, 'Too many messages');
    if (isBinary) return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      return;
    }
    try {
      world.message(ws, msg);
    } catch (err) {
      console.error('message failed', err && err.stack);
    }
  });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
    if (!perIp.get(ip)) perIp.delete(ip);
    world.leave(ws);
  });
  ws.on('error', () => {});
});

// Drop connections that stopped answering (a closed laptop lid).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 15000);

// The clock: 60 steps a second, caught up if the machine was busy (never more than a few at once).
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let n = 0;
  while (acc >= CONFIG.TICK && n < 8) {
    acc -= CONFIG.TICK;
    n++;
    if (!world.size) continue;
    const a = performance.now();
    try {
      world.tick();
    } catch (err) {
      console.error('step failed', err && err.stack);
    }
    const ms = performance.now() - a;
    stats.stepMs = stats.stepMs * 0.98 + ms * 0.02;
    stats.worst = Math.max(stats.worst * 0.999, ms);
  }
  if (n >= 8) acc = 0;
}, 5);

// Stopping (an update): everyone gets their latest save first.
const stop = () => {
  for (const pl of world.players.values()) world.sendSave(pl, true);
  for (const ws of wss.clients) ws.close(1012, 'The server is restarting. Rejoin in a minute.');
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

httpServer.listen(PORT, () => console.log(`Afterwish server world on port ${PORT}${PASSCODE ? '' : ' (closed: set AFTERWISH_PASSCODE)'}`));
