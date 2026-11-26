// Aiming a skill shot (0.61.2): Deadeye is held, not tapped.
//
// While R is down the Sharpshooter sees where the shot will go: a line on the ground the length of its
// whole range, the same line on the minimap (it reaches far past the edge of the screen), and the enemies
// it would hit, in order. Letting go of R looses it toward the cursor. Right-click or Escape puts the bow
// down without firing.
//
// This only shows the shot. The cast itself is the ordinary one, sent on release, so the server and the
// sim decide what it hits exactly as before. The hit test below copies fireDeadeye (src/sim/world.js).

import { MIRACLES, INCARNATE } from '../sim/wishkeep.js';

/** Abilities that are aimed while held. */
export const HELD_TYPES = new Set(['deadeye']);
const PIERCES = 4; // Deadeye hits up to four enemies on its line (DEADEYE_PIERCE in world.js)

/** Can this slot be aimed right now? (If not, a press just casts, and the usual "not ready" shows.) */
export function canAim(world, slot) {
  try {
    const def = world.kit && world.kit[slot];
    if (!def || !HELD_TYPES.has(def.type)) return false;
    const p = world.player;
    if (!p || p.dead || (p.cd && p.cd[slot] > 0)) return false;
    if (world.abilityUnlocked && !world.abilityUnlocked(slot)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a held shot would go, aimed at ground point (gx, gz).
 * @returns {{ x, z, dir, range, width, hits: { e, along }[] } | null}
 */
export function aimPreview(world, slot, gx, gz) {
  const def = world.kit && world.kit[slot];
  const p = world.player;
  if (!def || !p) return null;
  let dir = Math.atan2(gz - p.z, gx - p.x);
  if (!Number.isFinite(dir)) dir = p.facing || 0;
  const range = (def.range || 0) * ((world.mods && world.mods[slot + 'Range']) || 1);
  const width = def.width || 1;
  const cos = Math.cos(dir), sin = Math.sin(dir);
  const hits = [];
  for (const e of world.enemies || []) {
    if (e.dead || e.state === 'spawn') continue;
    const rx = e.x - p.x, rz = e.z - p.z;
    const along = rx * cos + rz * sin;
    const r = e.radius || 0.6;
    if (along < -r || along > range + r) continue;
    if (Math.abs(rz * cos - rx * sin) > width / 2 + r) continue;
    hits.push({ e, along });
  }
  hits.sort((a, b) => a.along - b.along);
  return { x: p.x, z: p.z, dir, range, width, hits: hits.slice(0, PIERCES) };
}

// ------------------------------------------------------------------------------------------------ (0.99.4)
// Every other skill, held: its range and the ground it will cover, drawn while the key is down; letting go
// casts it where you aim (as Deadeye does). A tap still casts, the moment the key comes up. As above, this
// only shows; the cast is the ordinary one, so the sim decides what it hits. The shapes are read from each
// skill's own numbers (range, radius, width, angle, with the hero's mods), close enough to aim by.

const SHAPE = {
  cone: 'cone', nova: 'self', dash: 'path', leap: 'circle', line: 'line', barrage: 'target', zone: 'circle', strike: 'target',
  bolt: 'line', orb: 'circle', meteor: 'circle', seraphLaser: 'line', seraphChoir: 'target', seraphRain: 'circle', seraphBeam: 'circle',
};

/** Is a Night's god aiming a miracle with this key (not a hero's skill)? */
function miracleOf(world, slot) {
  try {
    if (!(world.tide && world.tide.state === 'on' && world.map && world.map.id === 'wishkeep')) return null;
    if (world.inField && world.inField()) return null;
    if (world.keepOwns && !world.keepOwns()) return null;
    if (slot === INCARNATE.key) return { radius: INCARNATE.land.r, cd: 0 };
    const id = Object.keys(MIRACLES).find((m) => MIRACLES[m].key === slot);
    return id ? MIRACLES[id] : null;
  } catch {
    return null;
  }
}

function shapeOf(def) {
  if (!def) return null;
  if (def.blink) return 'circle'; // the Seraph's wings and halo: they go to where you aim
  if (SHAPE[def.type]) return SHAPE[def.type];
  if (def.radius && def.range) return 'circle';
  if (def.range) return 'target';
  if (def.radius) return 'self';
  return null; // a buff on yourself: nothing to aim, so a press casts at once
}

/** Can this slot be previewed while held (ready, open, and with something to aim)? */
export function canPreview(world, slot) {
  try {
    if (miracleOf(world, slot)) return !(world.tide.chan != null) && slot !== INCARNATE.key;
    const def = world.kit && world.kit[slot];
    if (!def || HELD_TYPES.has(def.type) || !shapeOf(def)) return false;
    const p = world.player;
    if (!p || p.dead || (p.cd && p.cd[slot] > 0)) return false;
    if (world.abilityUnlocked && !world.abilityUnlocked(slot)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * What a held skill would cover, aimed at (gx, gz) from (hx, hz) (where the hero is drawn).
 * @returns {{ shape, hx, hz, dir, range, radius, width, len, angle, tx, tz } | null}
 */
export function skillPreview(world, slot, gx, gz, hx, hz) {
  const p = world.player;
  if (!p) return null;
  const M = miracleOf(world, slot);
  if (M) return { shape: 'circle', hx, hz, dir: 0, range: 0, radius: M.radius || 3, tx: gx, tz: gz, free: true };
  const def = world.kit && world.kit[slot];
  const shape = shapeOf(def);
  if (!shape) return null;
  const m = world.mods || {};
  const range = (def.blink || def.range || 0) * (m[slot + 'Range'] || 1);
  const radius = (def.radius || 0) * (m[slot + 'Radius'] || 1);
  let dir = Math.atan2(gz - hz, gx - hx);
  if (!Number.isFinite(dir)) dir = p.facing || 0;
  const d = Math.hypot(gx - hx, gz - hz);
  const reach = range > 0 ? Math.min(d, range) : d;
  const out = { shape, hx, hz, dir, range, radius, width: def.width || def.line || 1.2, angle: Math.min(Math.PI * 2, (def.angle || 1.6) * (m[slot + 'Angle'] || 1)), tx: hx + Math.cos(dir) * reach, tz: hz + Math.sin(dir) * reach };
  if (shape === 'path') out.len = Math.max(def.minRange || 0, Math.min(range, d));
  if (shape === 'line') out.len = range;
  if (shape === 'cone') out.len = range;
  if (shape === 'self') [out.tx, out.tz] = [hx, hz];
  return out;
}
