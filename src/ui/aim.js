// Aiming a skill shot (0.61.2): Deadeye is held, not tapped.
//
// While R is down the Sharpshooter sees where the shot will go: a line on the ground the length of its
// whole range, the same line on the minimap (it reaches far past the edge of the screen), and the enemies
// it would hit, in order. Letting go of R looses it toward the cursor. Right-click or Escape puts the bow
// down without firing.
//
// This only shows the shot. The cast itself is the ordinary one, sent on release, so the server and the
// sim decide what it hits exactly as before. The hit test below copies fireDeadeye (src/sim/world.js).

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
