// Lacuna (Chapter 2), engine phase 1: what the server tells each player, and how little that can be.
//
// Interest: a player hears only about what is within SEE metres (the distance their game draws). Deltas: of
// that, only what changed since it was last told (a sleeping beast never changes, so after the first time it
// costs nothing), and when something passes out of sight, its id once so the game can let it go. Townsfolk
// are not here at all: each game runs its own crowd.
//
// One update is 10 bytes: id (u16), x and z (i16, in 1/64 m: the land is 512 m across), facing (u8, 1/256 of
// a turn), flags (u8: moving, awake, a player, the beast's mood, its kind, fallen), health (u8, 0-255 of full),
// (1.2.1) patience (u8, 0-31 of full: a chasing beast giving up). Messages of the old 9-byte kind (type 1) still read.
// Sent 10 times a second.
import { CHUNKS, BEASTS } from './land.js';

export const SEE = 150;
export const SEND_HZ = 10;
export const PLAYER_ID = 65000; // a player's id on the wire: PLAYER_ID + pid
const KINDS = Object.keys(BEASTS);
const MOODS = ['idle', 'chase', 'return'];
const TAU = 6.283185307179586;

/** An entity as it goes on the wire (integers only, so "changed" is exact). */
function quantise(e, player) {
  const f = Math.round(((((e.facing % TAU) + TAU) % TAU) / TAU) * 256) & 255;
  const flags = (e.moving ? 1 : 0) | (e.awake || player ? 2 : 0) | (player ? 4 : 0) | ((player ? 0 : Math.max(0, MOODS.indexOf(e.state))) << 3) | ((player ? 0 : Math.max(0, KINDS.indexOf(e.type))) << 5) | (e.dead ? 128 : 0);
  const hp = e.maxHp ? Math.max(0, Math.min(255, Math.round((e.hp / e.maxHp) * 255))) : 255;
  const pat = player || e.state !== 'chase' ? 31 : Math.max(0, Math.min(31, Math.round((e.pat ?? 1) * 31)));
  return { x: Math.round(e.x * 64), z: Math.round(e.z * 64), f, flags, hp, pat };
}

/** What one player has been told, so the next message carries only the differences. */
export class Interest {
  constructor(pid) {
    this.pid = pid;
    this.told = new Map(); // id -> quantised state last sent
    this.bytes = 0;
  }

  /** The next message for this player: an ArrayBuffer (or null if nothing changed). */
  delta(world) {
    const me = world.players.get(this.pid);
    if (!me) return null;
    const ups = [], seen = new Set();
    const consider = (id, e, player) => {
      const dx = e.x - me.x, dz = e.z - me.z;
      if (dx * dx + dz * dz > SEE * SEE) return;
      seen.add(id);
      const q = quantise(e, player);
      const was = this.told.get(id);
      if (was && was.x === q.x && was.z === q.z && was.f === q.f && was.flags === q.flags && was.hp === q.hp && was.pat === q.pat) return;
      this.told.set(id, q);
      ups.push([id, q]);
    };
    for (const p of world.players.values()) consider(PLAYER_ID + p.pid, p, true);
    // beasts: only those whose home chunk could be in sight (a chunk is 64 m; SEE is 150)
    const cx = Math.floor((me.x + 256) / 64), cz = Math.floor((me.z + 256) / 64), reach = Math.ceil(SEE / 64) + 1;
    for (let z = cz - reach; z <= cz + reach; z++)
      for (let x = cx - reach; x <= cx + reach; x++) {
        if (x < 0 || z < 0 || x >= CHUNKS || z >= CHUNKS) continue;
        for (const b of world.byChunk[z * CHUNKS + x]) consider(b.id, b, false);
      }
    const gone = [];
    for (const id of this.told.keys()) if (!seen.has(id)) gone.push(id);
    for (const id of gone) this.told.delete(id);
    if (!ups.length && !gone.length) return null;
    const buf = new ArrayBuffer(5 + ups.length * 10 + gone.length * 2);
    const v = new DataView(buf);
    v.setUint8(0, 2);
    v.setUint16(1, ups.length, true);
    v.setUint16(3, gone.length, true);
    let o = 5;
    for (const [id, q] of ups) {
      v.setUint16(o, id, true);
      v.setInt16(o + 2, q.x, true);
      v.setInt16(o + 4, q.z, true);
      v.setUint8(o + 6, q.f);
      v.setUint8(o + 7, q.flags);
      v.setUint8(o + 8, q.hp);
      v.setUint8(o + 9, q.pat);
      o += 10;
    }
    for (const id of gone) { v.setUint16(o, id, true); o += 2; }
    this.bytes += buf.byteLength;
    return buf;
  }
}

/** Read a message: { ups: [{ id, x, z, facing, moving, awake, player, state, type }], gone: [id] }. */
export function decode(buf) {
  const v = new DataView(buf);
  const n = v.getUint16(1, true), g = v.getUint16(3, true), size = v.getUint8(0) >= 2 ? 10 : 9;
  const ups = [], gone = [];
  let o = 5;
  for (let i = 0; i < n; i++) {
    const id = v.getUint16(o, true), flags = v.getUint8(o + 7);
    ups.push({
      id, x: v.getInt16(o + 2, true) / 64, z: v.getInt16(o + 4, true) / 64, facing: (v.getUint8(o + 6) / 256) * TAU,
      moving: !!(flags & 1), awake: !!(flags & 2), player: !!(flags & 4), state: MOODS[(flags >> 3) & 3], type: flags & 4 ? null : KINDS[(flags >> 5) & 3], dead: !!(flags & 128), hp: v.getUint8(o + 8) / 255,
      pat: size >= 10 ? v.getUint8(o + 9) / 31 : 1,
    });
    o += size;
  }
  for (let i = 0; i < g; i++) { gone.push(v.getUint16(o, true)); o += 2; }
  return { ups, gone };
}

/** Apply a message to a player's copy of the world they can see: a Map id -> { x, z, facing, ... }. */
export function apply(buf, seen) {
  const { ups, gone } = decode(buf);
  for (const e of ups) seen.set(e.id, e);
  for (const id of gone) seen.delete(id);
  return seen;
}
