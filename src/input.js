// Mouse and keyboard -> commands. This is the only place that knows about
// input devices. For multiplayer, the same commands would also be sent to
// the server instead of only to the local World.
import { canAim } from './ui/aim.js';

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

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
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
      if (e.key === ' ' && this.isPlaying()) e.preventDefault();
      if (this.held && (e.key || '').toLowerCase() === this.held.slot) this.release(true);
    });
    window.addEventListener('blur', () => {
      this.mouse.right = false;
      this.release(false); // tabbing away puts the bow down
    });
  }

  ground() {
    return this.renderer.screenToGround(this.mouse.x, this.mouse.y);
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
    if (e.ctrlKey && !e.metaKey && !e.altKey && (key === 'q' || key === 'w' || key === 'e' || key === 'r')) {
      // Ctrl + ability key spends a skill point, as in League (Shift works too).
      e.preventDefault();
      if (!e.repeat) this.getWorld().command({ type: 'rankUp', slot: key });
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const world = this.getWorld();

    if (key === ' ' || key === 'f') {
      e.preventDefault();
      if (!e.repeat) world.command({ type: 'parry' });
    } else if (key === 'q' || key === 'w' || key === 'e' || key === 'r') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.shiftKey) {
        world.command({ type: 'rankUp', slot: key }); // Shift (or Ctrl, above) + ability key spends a skill point
        return;
      }
      if (this.held && this.held.slot === key) return; // other abilities still work while aiming (roll, then loose)
      if (canAim(world, key) && (!this.actions.heldAim || this.actions.heldAim())) {
        this.held = { slot: key }; // (0.61.2) held: aim now, loose it when the key comes up
        return;
      }
      const g = this.ground() || { x: world.player.x, z: world.player.z };
      world.command({ type: 'cast', slot: key, x: g.x, z: g.z });
    } else if (key === '1' || key === 'd') {
      if (!e.repeat) world.command({ type: 'potion' });
    } else if (key === 'a') {
      if (!e.repeat) this.attackMove(); // as in League: A attack-moves to the cursor
    } else if (key === 's') {
      world.command({ type: 'stop' });
    } else if (key === 'enter') {
      world.command({ type: 'nextWave' });
    }
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
