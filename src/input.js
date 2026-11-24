// Mouse and keyboard -> commands. This is the only place that knows about
// input devices. For multiplayer, the same commands would also be sent to
// the server instead of only to the local World.
import { canAim } from './ui/aim.js';

/** (0.70) Is there a borrowed skill to cast on D or F? (A passive has nothing to press.) */
function borrowedActive(world, key) {
  const def = world && world.kit && world.kit[key];
  return !!(def && !def.passive);
}

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

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
      // (0.85) over the shoulder, with the mouse caught: it turns the view instead of moving a cursor
      if (this.locked()) {
        const S = this.renderer.shoulder;
        S.yaw += (e.movementX || 0) * 0.0026;
        S.pitch = Math.max(0.04, Math.min(0.95, S.pitch + (e.movementY || 0) * 0.0021));
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
      if (e.key === ' ' && this.isPlaying()) e.preventDefault();
      if (this.held && (e.key || '').toLowerCase() === this.held.slot) this.release(true);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.right = false;
      this.release(false); // tabbing away puts the bow down
    });
  }

  ground() {
    if (this.shoulderOn()) return this.renderer.screenToGround(window.innerWidth / 2, window.innerHeight / 2); // (0.85) the crosshair
    return this.renderer.screenToGround(this.mouse.x, this.mouse.y);
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
    if (this.locked() || !this.canvas.requestPointerLock) return;
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
    const g = this.ground() || { x: world.player.x, z: world.player.z };
    world.command({ type: 'cast', slot: h.slot, x: g.x, z: g.z });
  }

  onMouseDown(e) {
    if (!this.isPlaying()) return;
    const world = this.getWorld();
    if (this.shoulderOn()) {
      // (0.85) over the shoulder: click to catch the mouse, then left attacks what is under the crosshair
      // (or attack-moves there), right attack-moves there
      e.preventDefault();
      if (!this.locked()) return this.lock();
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const enemy = e.button === 0 ? this.renderer.pickEnemy(cx, cy, world) : null;
      if (enemy) world.command({ type: 'attack', id: enemy.id });
      else {
        const g = this.ground();
        if (g) world.command({ type: 'attackMove', x: g.x, z: g.z, near: 'cursor' });
      }
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
    if (rankSlot && !e.metaKey && (e.ctrlKey || e.altKey || e.shiftKey)) {
      e.preventDefault();
      if (!e.repeat) this.getWorld().command({ type: 'rankUp', slot: rankSlot });
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
      if (canAim(world, key) && (!this.actions.heldAim || this.actions.heldAim())) {
        this.held = { slot: key }; // (0.61.2) held: aim now, loose it when the key comes up
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
   * (0.85) Keys over the shoulder: W A S D walk; (0.85.1) the skills stay under the left hand beside them:
   * Q, E and R as ever, and the W skill on F; the borrowed ones on Z and X; 1 a potion and Space a parry as
   * ever. True if the key was taken.
   */
  shoulderKey(e, key, world) {
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      e.preventDefault();
      this.keys.add(key);
      return true;
    }
    const slot = { q: 'q', f: 'w', e: 'e', r: 'r', z: 'd', x: 'f' }[key];
    if (slot) {
      e.preventDefault();
      if (e.repeat) return true;
      if ((slot === 'd' || slot === 'f') && !borrowedActive(world, slot)) return true;
      const g = this.ground() || { x: world.player.x, z: world.player.z };
      world.command({ type: 'cast', slot, x: g.x, z: g.z });
      return true;
    }
    return false;
  }

  /** Called every frame: hover highlight, and hold-right-click to keep moving. */
  update(now) {
    const world = this.getWorld();
    if (!this.isPlaying()) {
      this.held = null; // a menu opened while aiming: the shot is put down
      this.renderer.hoverId = null;
      this.canvas.style.cursor = 'default';
      return;
    }
    if (this.shoulderOn()) {
      // (0.85) walking over the shoulder: W A S D against the way you face, a step ahead at a time
      const S = this.renderer.shoulder;
      const fx = Math.cos(S.yaw), fz = Math.sin(S.yaw);
      let dx = 0, dz = 0;
      const k = this.keys;
      if (k.has('w') || k.has('arrowup')) [dx, dz] = [dx + fx, dz + fz];
      if (k.has('s') || k.has('arrowdown')) [dx, dz] = [dx - fx, dz - fz];
      if (k.has('d') || k.has('arrowright')) [dx, dz] = [dx - fz, dz + fx];
      if (k.has('a') || k.has('arrowleft')) [dx, dz] = [dx + fz, dz - fx];
      const n = Math.hypot(dx, dz);
      if (n > 0.01 && now - this.lastMoveSent > 80) {
        const p = world.player;
        world.command({ type: 'move', x: p.x + (dx / n) * 2.5, z: p.z + (dz / n) * 2.5 });
        this.lastMoveSent = now;
        this.walking = true;
      } else if (n <= 0.01 && this.walking) {
        world.command({ type: 'stop' });
        this.walking = false;
      }
      const enemy = this.renderer.pickEnemy(window.innerWidth / 2, window.innerHeight / 2, world);
      this.renderer.hoverId = enemy ? enemy.id : null;
      this.canvas.style.cursor = this.locked() ? 'none' : 'crosshair';
      return;
    }
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
