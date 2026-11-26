// Mouse and keyboard -> commands. This is the only place that knows about
// input devices. For multiplayer, the same commands would also be sent to
// the server instead of only to the local World.
import { canAim, canPreview } from './ui/aim.js';

/** (0.70) Is there a borrowed skill to cast on D or F? (A passive has nothing to press.) */
function borrowedActive(world, key) {
  const def = world && world.kit && world.kit[key];
  return !!(def && !def.passive);
}

/**
 * (0.91.1) How many ranks a held rank-up asks for each 70 ms, after `held` seconds: one at first, then
 * faster (about 100 ranks in under three seconds).
 */
export const rankBurst = (held) => Math.max(1, Math.min(25, Math.floor(1 + held * held * 3)));

/**
 * (0.91.1) Hold a rank-up button to keep ranking (faster the longer it is held); Shift-click spends all
 * the points the skill can take.
 */
export function holdToRank(btn, send) {
  let timer = null, at = 0;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
  };
  const tick = () => {
    send(rankBurst((performance.now() - at) / 1000));
    timer = setTimeout(tick, 70);
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.shiftKey) return send(1000);
    send(1);
    at = performance.now();
    stop();
    timer = setTimeout(tick, 320);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) btn.addEventListener(ev, stop);
}

const NIGHT_HOLD = 1200; // (0.94) ms N must be held to call the night over the shoulder
const NIGHT_MAX = 50;

export class Input {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {object} o.renderer
   * @param {function} o.getWorld   () => World
   * @param {function} o.isPlaying  () => boolean (false while a menu is open)
   * @param {object} o.actions      { toggleInventory, togglePause, toggleMute }
   */
  constructor({ canvas, renderer, getWorld, isPlaying, actions }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.getWorld = getWorld;
    this.isPlaying = isPlaying;
    this.actions = actions;
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, right: false };
    this.lastMoveSent = 0;
    this.held = null; // (0.61.2) a skill shot being aimed: { slot } while its key is down
    this.keys = new Set(); // (0.85) movement keys held, over the shoulder
    this.walking = false;
    // (0.89) action combat over the shoulder: the enemy soft-locked in front of you, the left button held
    this.softId = null;
    this.lmb = false;
    this.forceId = null; // (0.89) the target picked with Tab
    this.lastAtk = 0;
    this.sens = 1; // look sensitivity (a setting)

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 0) {
        // (0.89) (0.90) let go, and over the shoulder the strikes stop, as in action games
        if (this.lmb && this.shoulderOn() && this.isPlaying()) {
          const world = this.getWorld();
          if (world.player && world.player.targetId != null) world.command({ type: 'stop' });
        }
        this.lmb = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      // (0.85) over the shoulder, with the mouse caught: it turns the view instead of moving a cursor
      // (0.95) and if the browser let go of it (Esc does, always), it still turns the view while it is over
      // the game, until any key or click catches it again: only Alt frees the mouse for the screen
      const looseLook = !this.locked() && !this.altFree && this.shoulderOn() && this.isPlaying() && e.target === this.canvas;
      if (this.locked() || looseLook) {
        const S = this.renderer.shoulder;
        // (0.89) clamped (a browser can report a huge jump when the mouse is caught), scaled by the setting
        const mx = Math.max(-120, Math.min(120, e.movementX || 0)), my = Math.max(-120, Math.min(120, e.movementY || 0));
        S.yaw += mx * 0.0022 * this.sens;
        S.pitch = Math.max(0.04, Math.min(0.95, S.pitch + my * 0.0018 * this.sens));
        return;
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        renderer.zoom = Math.max(0.7, Math.min(1.3, renderer.zoom + Math.sign(e.deltaY) * 0.06));
      },
      { passive: false }
    );
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.keys.delete((e.key || '').toLowerCase());
      const kk = (e.key || '').toLowerCase();
      if (kk === 'alt' && this.altFree) {
        // (0.94) let go of Alt: the mouse is caught again for looking
        e.preventDefault();
        this.altFree = false;
        if (this.shoulderOn() && this.isPlaying()) this.lock();
      }
      if (kk === 'n') this.nightHold = null; // (0.94) let go before it filled: no night
      if (kk === 'capslock' && /Mac/.test((typeof navigator !== 'undefined' && navigator.platform) || '') && this.isPlaying() && !(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) {
        // (0.95) a Mac sends Caps Lock's keydown only as it turns on, its keyup only as it turns off: each press is one
        const w = this.getWorld();
        w.command({ type: 'walkPace', on: !(w.player && w.player.walkPace) });
      }
      // (0.91.1) letting go of the skill's key, or of every modifier, ends a held rank-up
      if (this.rankHold && (e.code === this.rankHold.code || (!e.ctrlKey && !e.altKey && !e.shiftKey))) this.rankHold = null;
      if (e.key === ' ' && this.isPlaying()) e.preventDefault();
      if (this.held && (e.key || '').toLowerCase() === (this.held.key || this.held.slot)) this.release(true);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.altFree = false;
      this.ctrlTap = null;
      this.nightHold = null;
      this.rankHold = null;
      this.lmb = false;
      this.mouse.right = false;
      this.release(false); // tabbing away puts the bow down
    });
  }

  ground() {
    if (this.shoulderOn()) return this.renderer.screenToGround(window.innerWidth / 2, window.innerHeight / 2); // (0.85) the crosshair
    return this.renderer.screenToGround(this.mouse.x, this.mouse.y);
  }

  /** (0.91) Walk the keep over your shoulder, or go back above. */
  toggleWalk() {
    const w = this.getWorld();
    const on = !(w.player && w.player.keepWalk);
    w.command({ type: 'keepWalk', on });
    if (on) this.lock(); // (a key press or a click allows it now)
    else this.unlock();
  }
  /** (0.92) Into the Seraph, or back out of it (anywhere in your own keep). */
  togglePossess() {
    const w = this.getWorld();
    const on = !(w.player && w.player.possess);
    w.command({ type: 'keepPossess', on });
    if (on) this.lock(); // (a key press or a click allows it now)
    else if (!(w.player && w.player.possess && w.player.possess.walk)) this.unlock();
  }
  /** (0.85) Over the shoulder (incarnate in your keep's night)? */
  shoulderOn() {
    return !!(this.renderer.shoulder && this.renderer.shoulder.on);
  }
  /** (0.85) Is the mouse caught (pointer lock) for looking around? */
  locked() {
    return typeof document !== 'undefined' && document.pointerLockElement === this.canvas;
  }
  /** (0.85) Catch the mouse for looking around (needs a key press or click to be allowed). */
  lock() {
    this.lockAt = performance.now(); // (0.94) asked for just now: a frame's lag in the world must not let it go again
    if (this.locked() || this.altFree || !this.canvas.requestPointerLock) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch {
      /* not allowed now: a click will ask again */
    }
  }
  unlock() {
    if (this.locked() && document.exitPointerLock) document.exitPointerLock();
  }

  /** Let go of a held skill shot: loose it at the cursor (fire), or put it down (not fire). */
  release(fire) {
    const h = this.held;
    if (!h) return;
    this.held = null;
    if (!fire || !this.isPlaying()) return;
    const world = this.getWorld();
    const g = h.shoulder ? this.shoulderAim(h.slot, world) : this.ground() || { x: world.player.x, z: world.player.z };
    world.command({ type: 'cast', slot: h.slot, x: g.x, z: g.z });
  }
  /** (0.99.4) Is a skill held to preview it (let go to cast), and is that wanted? */
  previewOn(world, slot) {
    return canPreview(world, slot) && (!this.actions.skillPreview || this.actions.skillPreview());
  }

  onMouseDown(e) {
    if (!this.isPlaying()) return;
    const world = this.getWorld();
    if (this.shoulderOn()) {
      // (0.89) over the shoulder, as action games do: click to catch the mouse; then hold the left button to
      // strike the enemy locked in front of you. The right button does not walk (W A S D do).
      e.preventDefault();
      if (!this.locked()) {
        if (this.altFree) return; // (0.94) Alt held: the mouse is free for the screen
        this.lock(); // (0.95) caught again, and the click still counts (a strike), not a wasted one
      }
      if (e.button === 0) {
        this.lmb = true;
        const under = this.renderer.pickEnemy(window.innerWidth / 2, window.innerHeight / 2, world);
        if (under && !under.dead) this.forceId = this.softId = under.id; // (0.89) clicked on: this one
        if (this.softId != null) this.strike(world, performance.now(), true);
        else this.freeStrike(world, performance.now()); // (0.90) nothing locked: strike where you aim
      } else if (e.button === 2 && this.actions.shoulderTip) this.actions.shoulderTip('Move with W A S D. Hold the left button to strike; Shift dashes.');
      return;
    }
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    if (this.held) {
      // Aiming: left-click looses the shot at once, right-click puts the bow down.
      e.preventDefault();
      this.release(e.button === 0);
      return;
    }
    if ((e.button === 2 || e.button === 0) && e.shiftKey) {
      // Shift + right-click (or Shift + left-click): attack-move. Firefox always opens its own menu on
      // Shift + right-click, whatever the page asks, so Shift + left-click and the A key do the same (0.43).
      e.preventDefault();
      this.attackMove();
      this.mouse.right = false;
      return;
    }
    const enemy = this.renderer.pickEnemy(e.clientX, e.clientY, world);
    if (e.button === 2) {
      e.preventDefault();
      this.mouse.right = true;
      const prop = enemy ? null : this.renderer.pickInteractable(e.clientX, e.clientY, world);
      if (prop && this.actions.walkToInteract) {
        // Right-click a person or a sign: walk over and talk to them / read it.
        this.actions.walkToInteract(prop);
        this.renderer.moveMarker(prop.x, prop.z, false);
        this.mouse.right = false;
      } else if (enemy) {
        world.command({ type: 'attack', id: enemy.id });
        this.renderer.moveMarker(enemy.x, enemy.z, true);
        this.mouse.right = false; // do not turn the attack into a move while held
      } else {
        if (this.actions.cancelInteract) this.actions.cancelInteract();
        const g = this.ground();
        if (g) {
          world.command({ type: 'move', x: g.x, z: g.z });
          this.renderer.moveMarker(g.x, g.z, false);
        }
      }
    } else if (e.button === 0 && enemy) {
      // Left-click on an enemy also attacks, which is friendlier on a trackpad.
      world.command({ type: 'attack', id: enemy.id });
      this.renderer.moveMarker(enemy.x, enemy.z, true);
    }
  }

  /** Attack-move at the cursor (nearest to you or to the cursor: a pause-menu setting). */
  attackMove() {
    const g = this.ground();
    if (!g) return;
    if (this.actions.cancelInteract) this.actions.cancelInteract();
    this.getWorld().command({ type: 'attackMove', x: g.x, z: g.z, near: this.actions.attackMoveNear ? this.actions.attackMoveNear() : 'cursor' });
    this.renderer.moveMarker(g.x, g.z, true);
  }

  onKeyDown(e) {
    const key = (e.key || '').toLowerCase();
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    // (0.95) Ctrl (a tap) or Caps Lock: walk or run, anywhere you play (Caps Lock never closes a tab, whatever is held with it)
    // (0.96) Ctrl walks or runs the moment it is pressed (it no longer ranks skills: Shift or Alt + Q W E R does)
    if ((key === 'capslock' || key === 'control') && !e.repeat && this.isPlaying() && !typing) {
      e.preventDefault();
      const w = this.getWorld();
      w.command({ type: 'walkPace', on: !(w.player && w.player.walkPace) });
      return;
    }
    // (0.99.4) [ and ]: the next Night's level, from anywhere in your keep (over the shoulder too)
    if ((key === '[' || key === ']') && !typing && this.isPlaying()) {
      const w = this.getWorld(), k = w.player && w.player.keep;
      if (k && w.map && w.map.id === 'wishkeep' && !w.keepVisit) {
        e.preventDefault();
        const top = Math.min(NIGHT_MAX, (k.nightMax || 0) + 1);
        const cur = Math.max(1, Math.min(top, k.night || top));
        w.command({ type: 'keepNightPick', level: Math.max(1, Math.min(top, cur + (key === ']' ? 1 : -1))) });
        return;
      }
    }
    if (this.shoulderOn() && this.isPlaying() && !typing) {
      // (0.95) the mouse was let go (Esc): any key catches it again
      if (!this.locked() && !this.altFree && key !== 'alt' && key !== 'escape') this.lock();
      // (0.94) over the shoulder: hold Alt to see and use the mouse (as action MMOs do); tap Ctrl to walk or run
      if (key === 'alt') {
        e.preventDefault();
        if (!e.repeat) {
          this.altFree = true;
          this.unlock();
        }
        return;
      }
      // (0.94) hold N to call the night from here (a hold, so a stray press never calls one)
      if (key === 'n' && !e.repeat) {
        const w = this.getWorld();
        if (w.map && w.map.id === 'wishkeep' && !w.keepVisit && w.player && w.player.keep && !(w.tide && w.tide.state === 'on')) {
          e.preventDefault();
          this.nightHold = { at: performance.now() };
          return;
        }
      }
    }

    // (0.91) V: walk a keep over your shoulder between nights (and back above)
    if (key === 'v' && !typing && this.isPlaying() && !e.repeat) {
      const w = this.getWorld();
      if (w.map && w.map.id === 'wishkeep' && !(w.tide && w.tide.state === 'on') && !(w.player && w.player.possess)) {
        e.preventDefault();
        this.toggleWalk();
        return;
      }
    }
    // (0.92) Y: into the keep's Seraph, or back out (anywhere in your own keep, a night included)
    if (key === 'y' && !typing && this.isPlaying() && !e.repeat) {
      const w = this.getWorld();
      if (w.map && w.map.id === 'wishkeep' && !w.keepVisit && w.player && w.player.keep && w.player.keep.statue) {
        e.preventDefault();
        this.togglePossess();
        return;
      }
    }
    // (0.89) over the shoulder, Tab picks the next enemy (the bag is still on I and C)
    if (key === 'tab' && this.shoulderOn() && this.isPlaying() && !typing) {
      e.preventDefault();
      if (!e.repeat) this.cycleTarget(this.getWorld());
      return;
    }
    // Menu keys work whether or not the fight is running.
    if (key === 'tab' || key === 'i' || key === 'c') {
      e.preventDefault();
      this.actions.toggleInventory();
      return;
    }
    if (key === 'escape' && this.held) {
      e.preventDefault();
      this.release(false); // Escape puts an aimed shot down before it opens the menu
      return;
    }
    if (key === 'escape' || key === 'p') {
      e.preventDefault();
      this.release(false);
      this.actions.togglePause();
      return;
    }
    if (!typing && !e.repeat && (key === 'j' || key === 't' || key === 'g' || key === 'b')) {
      if (key === 'j') this.actions.toggleJournal();
      else if (key === 'b') this.actions.toggleCasebook();
      else if (key === 't') this.actions.toggleTalents();
      else this.actions.interact();
      return;
    }
    if (key === 'm' && !typing) {
      this.actions.toggleMute();
      return;
    }
    if (!typing && this.actions.menuKey && this.actions.menuKey(key)) {
      e.preventDefault();
      return;
    }
    if (!this.isPlaying() || typing) return;
    // Ctrl, Shift or Alt + ability key spends a skill point, as in League. (0.62) Alt for Firefox, where
    // Ctrl+Q and the like are the browser's own; read by the key's place (e.code), so Alt on a Mac, which
    // types a symbol instead of a letter, works as well.
    const rankSlot = { KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r' }[e.code] || (['q', 'w', 'e', 'r'].includes(key) ? key : null);
    if (rankSlot && !e.metaKey && !e.ctrlKey && (e.altKey || e.shiftKey)) { // (0.96: not Ctrl, which walks)
      e.preventDefault();
      if (!e.repeat) {
        // (0.91.1) one rank now; held, more and more of them (see update)
        this.getWorld().command({ type: 'rankUp', slot: rankSlot, n: 1 });
        this.rankHold = { slot: rankSlot, code: e.code, at: performance.now(), next: performance.now() + 320 };
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const world = this.getWorld();
    if (this.shoulderOn() && this.shoulderKey(e, key, world)) return;

    if (key === ' ') {
      e.preventDefault();
      if (!e.repeat) world.command({ type: 'parry' });
    } else if (key === 'q' || key === 'w' || key === 'e' || key === 'r' || ((key === 'd' || key === 'f') && borrowedActive(world, key))) {
      // (0.70) D and F are the borrowed skills (passives have nothing to press)
      e.preventDefault();
      if (e.repeat) return;
      if (this.held && this.held.slot === key) return; // other abilities still work while aiming (roll, then loose)
      if (this.held && this.held.preview) this.release(true); // (0.99.4) another skill while one is held: the held one goes first
      if (canAim(world, key) && (!this.actions.heldAim || this.actions.heldAim())) {
        this.held = { slot: key }; // (0.61.2) held: aim now, loose it when the key comes up
        return;
      }
      if (this.previewOn(world, key)) {
        this.held = { slot: key, key, preview: true }; // (0.99.4) held: its area shows; let go to cast
        return;
      }
      const g = this.ground() || { x: world.player.x, z: world.player.z };
      world.command({ type: 'cast', slot: key, x: g.x, z: g.z });
      // (0.85) R in your keep's night begins the channel: catch the mouse now (a key press allows it), so
      // the view can turn as soon as you land
      if (key === 'r' && world.tide && world.tide.state === 'on' && !(world.tide.inc > 0) && world.keepOwns && world.keepOwns()) this.lock();
    } else if (key === '1') {
      if (!e.repeat) world.command({ type: 'potion' });
    } else if (key === 'a') {
      if (!e.repeat) this.attackMove(); // as in League: A attack-moves to the cursor
    } else if (key === 's') {
      world.command({ type: 'stop' });
    } else if (key === 'enter' || (this.actions.nextWaveKey && key === this.actions.nextWaveKey())) {
      world.command({ type: 'nextWave' }); // (0.62) Enter, or the key chosen in the menu (X by default)
    }
  }

  /**
   * (0.85) Keys over the shoulder: W A S D walk (twice quickly: a roll that way); (0.90) Q and R as ever, the
   * W skill on E, the class's dash (its E) on Shift; the borrowed ones on Z and X; 1 a potion and Space a
   * parry as ever. True if the key was taken.
   */
  shoulderKey(e, key, world) {
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      e.preventDefault();
      if (!e.repeat) {
        // (0.90) a direction tapped twice quickly: the roll, that way
        const now = performance.now();
        if (this.lastTap && this.lastTap.key === key && now - this.lastTap.at < 260) {
          const S = this.renderer.shoulder, fx = Math.cos(S.yaw), fz = Math.sin(S.yaw);
          const [ux, uz] = { w: [fx, fz], arrowup: [fx, fz], s: [-fx, -fz], arrowdown: [-fx, -fz], d: [-fz, fx], arrowright: [-fz, fx], a: [fz, -fx], arrowleft: [fz, -fx] }[key];
          const p = world.player;
          world.command({ type: 'dodge', x: p.x + ux * 3, z: p.z + uz * 3 });
          this.lastTap = null;
        } else this.lastTap = { key, at: now };
      }
      this.keys.add(key);
      return true;
    }
    if (key === 'shift') {
      // (0.90) the class's dash (its E): the way you are moving, or the way you look if you are not
      e.preventDefault();
      if (e.repeat) return true;
      const [dx, dz] = this.moveDir();
      const S = this.renderer.shoulder;
      const n = Math.hypot(dx, dz);
      const [ux, uz] = n > 0.01 ? [dx / n, dz / n] : [Math.cos(S.yaw), Math.sin(S.yaw)];
      const p = world.player;
      world.command({ type: 'cast', slot: 'e', x: p.x + ux * 8, z: p.z + uz * 8 });
      return true;
    }
    const slot = { q: 'q', e: 'w', r: 'r', z: 'd', x: 'f' }[key];
    if (slot) {
      e.preventDefault();
      if (e.repeat) return true;
      if ((slot === 'd' || slot === 'f') && !borrowedActive(world, slot)) return true;
      if (this.held && this.held.slot === slot) return true;
      if (this.held && this.held.preview) this.release(true); // (0.99.4) the held one goes first
      if (this.previewOn(world, slot)) {
        this.held = { slot, key, preview: true, shoulder: true }; // (0.99.4) held: its area shows where it will land; let go to cast
        return true;
      }
      const g = this.shoulderAim(slot, world);
      world.command({ type: 'cast', slot, x: g.x, z: g.z });
      return true;
    }
    return false;
  }

  /**
   * (0.89) Where a skill goes over the shoulder: at the enemy you have locked, if any; else where you look.
   * (0.94) A skill that lands on the ground (a leap, a blast from the sky) goes where you look, never sideways
   * to a locked foe. (0.99.4: one place for it, so a held skill lands where its preview showed.)
   */
  shoulderAim(slot, world) {
    const def = world.kit && world.kit[slot];
    const onGround = !!def && ['leap', 'meteor', 'zone', 'seraphRain'].includes(def.type);
    const lockOn = !onGround && this.softId != null && world.enemies.find((o) => o.id === this.softId && !o.dead);
    const S = this.renderer.shoulder, p = world.player;
    const ahead = { x: p.x + Math.cos(S.yaw) * ((def && (def.range || def.blink)) || 8), z: p.z + Math.sin(S.yaw) * ((def && (def.range || def.blink)) || 8) };
    const look = this.ground();
    return lockOn ? { x: lockOn.x, z: lockOn.z } : look && (!onGround || Math.hypot(look.x - p.x, look.z - p.z) > 1.5) ? look : ahead;
  }

  /**
   * (0.89) The soft lock, as action MMOs have it: the enemy under the crosshair if there is one; else, in a
   * cone before you (wider the closer they are) and within reach of your strike (a little more for a
   * blade), the one nearest where you look.
   */
  softLock(world) {
    const p = world.player;
    if (!p || p.dead) return null;
    if (this.forceId != null) {
      // (0.89) the one picked with Tab (or clicked on) holds until it falls or is left far behind
      const f = world.enemies.find((o) => o.id === this.forceId && !o.dead);
      if (f && Math.hypot(f.x - p.x, f.z - p.z) < 22) return f.id;
      this.forceId = null;
    }
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const under = this.renderer.pickEnemy(cx, cy, world);
    if (under && !under.dead) return under.id;
    const S = this.renderer.shoulder;
    const reach = (world.basic && world.basic.range) || 2;
    const far = reach > 4 ? reach + 2 : reach + 4.5;
    let best = null, bs = 1e9;
    for (const e of world.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) - (e.radius || 0.5);
      if (d > far) continue;
      let da = Math.atan2(dz, dx) - S.yaw;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      const cone = 0.55 + Math.max(0, 2.5 - d) * 0.5;
      if (da > cone) continue;
      const sc = da * 6 + d * 0.3 - (e.id === this.softId ? 0.8 : 0); // (it holds a little, so it does not flicker)
      if (sc < bs) [best, bs] = [e, sc];
    }
    return best ? best.id : null;
  }
  /** (0.85) Which way W A S D point, against the way you face (not normalised). */
  moveDir() {
    const S = this.renderer.shoulder;
    const fx = Math.cos(S.yaw), fz = Math.sin(S.yaw);
    let dx = 0, dz = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) [dx, dz] = [dx + fx, dz + fz];
    if (k.has('s') || k.has('arrowdown')) [dx, dz] = [dx - fx, dz - fz];
    if (k.has('d') || k.has('arrowright')) [dx, dz] = [dx - fz, dz + fx];
    if (k.has('a') || k.has('arrowleft')) [dx, dz] = [dx + fz, dz - fx];
    return [dx, dz];
  }
  /**
   * (0.89) Tab: the next enemy before you, nearest first and each once before starting round again (it
   * stays your target until it falls or is left far behind).
   */
  cycleTarget(world) {
    const p = world.player;
    if (!p) return;
    const S = this.renderer.shoulder;
    const reach = (world.basic && world.basic.range) || 2;
    const list = [];
    for (const e of world.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > Math.max(14, reach + 6)) continue;
      let da = Math.atan2(e.z - p.z, e.x - p.x) - S.yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 1.4) continue;
      list.push({ id: e.id, da, d });
    }
    if (!list.length) return (this.forceId = null);
    // nearest first, each one once, then round again (the order does not shuffle as they move)
    this.tabSeen = this.tabSeen || new Set();
    if (this.softId != null) this.tabSeen.add(this.softId);
    let fresh = list.filter((o) => !this.tabSeen.has(o.id));
    if (!fresh.length) {
      this.tabSeen = new Set(this.softId != null ? [this.softId] : []);
      fresh = list.filter((o) => !this.tabSeen.has(o.id));
      if (!fresh.length) fresh = list;
    }
    fresh.sort((a, b) => a.d - b.d);
    this.forceId = fresh[0].id;
    this.softId = this.forceId;
    this.tabSeen.add(this.forceId);
  }

  /** (0.90) With nothing locked, strike at the air where you aim (the game paces it to your attack speed). */
  freeStrike(world, now) {
    if (now - (this.lastSwing || 0) < 100) return;
    this.lastSwing = now;
    const g = this.ground();
    const p = world.player;
    const S = this.renderer.shoulder;
    const at = g && Math.hypot(g.x - p.x, g.z - p.z) > 0.5 ? g : { x: p.x + Math.cos(S.yaw) * 4, z: p.z + Math.sin(S.yaw) * 4 };
    world.command({ type: 'swing', x: at.x, z: at.z });
  }

  /** (0.89) Strike the locked enemy (again, if the last one fell or the lock moved on). */
  strike(world, now, fresh) {
    if (this.softId == null) return;
    const p = world.player;
    if (!fresh && p.targetId === this.softId && now - this.lastAtk < 400) return;
    if (now - this.lastAtk < 90) return;
    world.command({ type: 'attack', id: this.softId });
    this.lastAtk = now;
  }

  /** Called every frame: hover highlight, and hold-right-click to keep moving. */
  /** (0.94) How far a held N has come (0 to 1), or null. */
  nightHoldK(now = performance.now()) {
    return this.nightHold ? Math.min(1, (now - this.nightHold.at) / NIGHT_HOLD) : null;
  }
  update(now) {
    if (this.nightHold && now - this.nightHold.at >= NIGHT_HOLD) {
      // (0.94) held long enough: the night is called, at the level last chosen at the Hearth
      this.nightHold = null;
      const w = this.getWorld(), k = w.player && w.player.keep;
      if (k && !(w.tide && w.tide.state === 'on')) w.command({ type: 'keepTide', level: k.night || Math.min(NIGHT_MAX, (k.nightMax || 0) + 1) });
    }
    const world = this.getWorld();
    if (this.rankHold && now >= this.rankHold.next) {
      // (0.91.1) a held rank-up: every 70 ms, more each time the longer it is held
      const held = (now - this.rankHold.at) / 1000;
      world.command({ type: 'rankUp', slot: this.rankHold.slot, n: rankBurst(held) });
      this.rankHold.next = now + 70;
    }
    if (!this.isPlaying()) {
      this.held = null; // a menu opened while aiming: the shot is put down
      this.renderer.hoverId = null;
      this.canvas.style.cursor = 'default';
      return;
    }
    if (this.shoulderOn()) {
      // (0.89) the soft lock: the enemy in front of you nearest your crosshair, highlighted
      this.softId = this.softLock(world);
      this.renderer.hoverId = this.softId;
      if (this.lmb) {
        if (this.softId != null) this.strike(world, now, false);
        else this.freeStrike(world, now);
      }
      // (0.85) walking over the shoulder: W A S D against the way you face, a step ahead at a time;
      // (0.89) but while you hold the strike on a foe, you stand and fight
      const [dx, dz] = this.moveDir();
      let n = Math.hypot(dx, dz);
      if (this.lmb && this.softId != null) n = 0;
      if (n > 0.01 && now - this.lastMoveSent > 80) {
        const p = world.player;
        world.command({ type: 'move', x: p.x + (dx / n) * 2.5, z: p.z + (dz / n) * 2.5 });
        this.lastMoveSent = now;
        this.walking = true;
      } else if (n <= 0.01 && this.walking) {
        world.command({ type: 'stop' });
        this.walking = false;
      }
      this.canvas.style.cursor = this.locked() ? 'none' : 'crosshair';
      return;
    }
    this.softId = null;
    this.forceId = null;
    this.lmb = false;
    if (this.walking) {
      this.walking = false;
      this.keys.clear();
    }
    const enemy = this.renderer.pickEnemy(this.mouse.x, this.mouse.y, world);
    this.renderer.hoverId = enemy ? enemy.id : null;
    this.canvas.style.cursor = enemy ? 'pointer' : 'crosshair';
    if (this.mouse.right && now - this.lastMoveSent > 90) {
      const g = this.ground();
      if (g) {
        world.command({ type: 'move', x: g.x, z: g.z });
        this.lastMoveSent = now;
      }
    }
  }
}
