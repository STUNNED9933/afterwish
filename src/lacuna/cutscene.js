// Lacuna (Chapter 2): the cutscene player. A scene is a script (an async function) given `api`: cards, lines of
// dialogue, camera moves, actors, prompts the player answers (tap a key, press one in time), effects. Played in
// the land itself, with letterbox bars. Skipping fast-forwards: every step finishes at once (actors arrive where
// they were going, lines and prompts pass), so the scene ends in the same state either way.
import * as THREE from 'three';
import { Actor, CAST } from './actor.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Cutscene {
  /** ctx: { view, fx, beastMesh, $ (getElementById), hero: { group, anim }, me (the sim's player) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.skipping = false;
    this.waits = []; // { left, resolve }
    this.cam = null; // { from: {at, look}, to: {at, look}, t, dur, resolve }
    this.camNow = { at: new THREE.Vector3(), look: new THREE.Vector3() };
    this.actors = new Map();
    this.line = null; // { text, shown, resolve }
    this.prompt = null; // { key, need, got, resolve }
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.blur = { now: 0, to: 0, speed: 0 };
  }

  get $() {
    return this.ctx.$;
  }

  /** Play a scene. Resolves when it ends (played or skipped). */
  async run(script) {
    this.active = true;
    this.skipping = false;
    this.$('cs').classList.remove('hidden');
    this.$('cs').classList.add('bars');
    this.camNow.at.copy(this.ctx.view.camera.position);
    this.ctx.view.camera.getWorldDirection(this.camNow.look).multiplyScalar(10).add(this.camNow.at);
    try {
      await script(this.api());
    } finally {
      this.active = false;
      this.line = this.prompt = this.cam = null;
      this.blur.to = this.blur.now = 0;
      this.ctx.view.renderer.domElement.style.filter = '';
      for (const id of ['cs-box', 'cs-card', 'cs-prompt']) this.$(id).classList.add('hidden');
      this.$('cs').classList.add('hidden');
      this.$('fade').style.opacity = '0';
    }
  }

  skip() {
    if (!this.active) return;
    this.skipping = true;
    for (const w of this.waits.splice(0)) w.resolve();
    if (this.cam) { const c = this.cam; this.cam = null; this.camNow.at.copy(c.to.at); this.camNow.look.copy(c.to.look); c.resolve(); }
    for (const a of this.actors.values()) if (a.path) { a.place(a.path.x, a.path.z); const r = a.path.resolve; a.path = null; a.loop('idle', 0); r(); }
    for (const a of this.actors.values()) if (a.once) { const o = a.once; a.once = null; o.resolve(); }
    if (this.line) this.endLine();
    if (this.prompt) this.endPrompt();
  }

  /** A key or click, while a scene plays. Returns true if the scene used it. */
  key(code) {
    if (!this.active) return false;
    if (code === 'Escape') { this.skip(); return true; }
    if (this.prompt) {
      if (code === this.prompt.key || (this.prompt.key === 'Space' && code === 'Click')) {
        this.prompt.got++;
        this.prompt.onTap && this.prompt.onTap(this.prompt.got);
        this.drawPrompt();
        if (this.prompt.got >= this.prompt.need) this.endPrompt();
      }
      return true;
    }
    if (this.line && (code === 'Space' || code === 'Enter' || code === 'KeyE' || code === 'Click')) {
      if (this.line.shown < this.line.text.length) this.line.shown = this.line.text.length;
      else this.endLine();
      return true;
    }
    return true; // during a scene, the game's own keys do nothing
  }

  endLine() {
    const l = this.line;
    this.line = null;
    this.$('cs-box').classList.add('hidden');
    l.resolve();
  }

  endPrompt() {
    const p = this.prompt;
    this.prompt = null;
    this.$('cs-prompt').classList.add('hidden');
    p.resolve();
  }

  drawPrompt() {
    const p = this.prompt;
    this.$('cs-prompt').innerHTML = `<kbd>${p.label}</kbd><span>${p.text}</span>${p.need > 1 ? `<i>${'●'.repeat(p.got)}${'○'.repeat(Math.max(0, p.need - p.got))}</i>` : ''}`;
  }

  wait(sec) {
    if (this.skipping || sec <= 0) return Promise.resolve();
    return new Promise((resolve) => this.waits.push({ left: sec, resolve }));
  }

  api() {
    const cs = this;
    const v = (p) => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));
    return {
      get skipping() {
        return cs.skipping;
      },
      wait: (s) => cs.wait(s),
      /** A full-screen card of text (black), each line in turn. */
      async card(lines, { hold = 3.2 } = {}) {
        if (cs.skipping) return;
        const el = cs.$('cs-card');
        el.classList.remove('hidden');
        for (const t of lines) {
          if (cs.skipping) break;
          el.innerHTML = `<p>${t}</p>`;
          el.firstChild.style.opacity = '0';
          requestAnimationFrame(() => el.firstChild && (el.firstChild.style.opacity = '1'));
          await cs.wait(hold + t.length / 60);
        }
        el.classList.add('hidden');
      },
      /** A line of dialogue (who: a name from CAST, '' for the hero's own thoughts). Waits for Space or a click. */
      say(who, text, { auto = 0 } = {}) {
        if (cs.skipping) return Promise.resolve();
        const c = CAST[who];
        const name = c ? c.name : who || '';
        cs.$('cs-box').classList.remove('hidden');
        cs.$('cs-box').classList.toggle('thought', !who);
        cs.$('cs-name').textContent = name;
        cs.$('cs-name').style.display = name ? '' : 'none';
        return new Promise((resolve) => {
          cs.line = { text, shown: 0, resolve, auto };
        });
      },
      /** Wait for the player: tap `key` `times` times. */
      prompt(key, text, { times = 1, label, onTap } = {}) {
        if (cs.skipping) return Promise.resolve();
        return new Promise((resolve) => {
          cs.prompt = { key, text, need: times, got: 0, resolve, label: label || (key === 'Space' ? 'Space' : key.replace('Key', '').replace('ShiftLeft', 'Shift')), onTap };
          cs.drawPrompt();
          cs.$('cs-prompt').classList.remove('hidden');
        });
      },
      /** Move the camera to look at `look` from `at` over `dur` seconds (0: at once). */
      camera(at, look, dur = 0) {
        const to = { at: v(at), look: v(look) };
        if (cs.skipping || dur <= 0) {
          cs.camNow.at.copy(to.at);
          cs.camNow.look.copy(to.look);
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          cs.cam = { from: { at: cs.camNow.at.clone(), look: cs.camNow.look.clone() }, to, t: 0, dur, resolve };
        });
      },
      fade(to, dur = 0.8) {
        cs.$('fade').style.transition = cs.skipping ? 'none' : `opacity ${dur}s`;
        cs.$('fade').style.opacity = String(to);
        return cs.wait(dur);
      },
      blur(px, dur = 0) {
        cs.blur.to = px;
        cs.blur.speed = dur > 0 ? Math.abs(px - cs.blur.now) / dur : 1e9;
      },
      shake(amt = 0.15, dur = 0.3) {
        if (cs.skipping) return;
        cs.shakeAmt = amt;
        cs.shakeT = dur;
      },
      bars(on) {
        cs.$('cs').classList.toggle('bars', on);
      },
      /** Someone in the scene (made once; the same one if asked again). */
      actor(who, x, z, facing = 0) {
        let a = cs.actors.get(who);
        if (!a) cs.actors.set(who, (a = new Actor(cs.ctx.view.scene, who, { beastMesh: cs.ctx.beastMesh })));
        if (x !== undefined) a.place(x, z, facing);
        return a;
      },
      walk(who, x, z, opts = {}) {
        const a = cs.actors.get(who);
        if (cs.skipping) { a.place(x, z); a.face(x + (x - a.x || 1), z + (z - a.z)); return Promise.resolve(); }
        return a.walkTo(x, z, opts);
      },
      anim(who, what, opts) {
        const a = cs.actors.get(who);
        if (cs.skipping) return Promise.resolve();
        return a.play(what, opts);
      },
      loop(who, what) {
        cs.actors.get(who).loop(what);
      },
      remove(who) {
        const a = cs.actors.get(who);
        if (a) { a.remove(); cs.actors.delete(who); }
      },
      /** The hero: where they stand, which way they face, a move ('lie', 'rise', 'hop', 'land'). */
      hero(x, z, facing, move) {
        const me = cs.ctx.me;
        if (x !== undefined) { me.x = x; me.z = z; cs.ctx.snapHero && cs.ctx.snapHero(); }
        if (facing !== undefined) me.facing = facing;
        if (move) cs.ctx.hero.anim.move = move;
      },
      fx: cs.ctx.fx,
      get ctx() {
        return cs.ctx;
      },
    };
  }

  /** Every frame, while a scene plays. Returns the camera's place for this frame. */
  update(dt) {
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      w.left -= dt;
      if (w.left <= 0) { this.waits.splice(i, 1); w.resolve(); }
    }
    for (const a of this.actors.values()) a.update(dt);
    if (this.cam) {
      const c = this.cam;
      c.t += dt;
      const k = ease(Math.min(1, c.t / c.dur));
      this.camNow.at.lerpVectors(c.from.at, c.to.at, k);
      this.camNow.look.lerpVectors(c.from.look, c.to.look, k);
      if (c.t >= c.dur) { this.cam = null; c.resolve(); }
    }
    if (this.line) {
      const l = this.line;
      if (l.shown < l.text.length) {
        l.shown = Math.min(l.text.length, l.shown + dt * 48);
        this.$('cs-text').textContent = l.text.slice(0, Math.floor(l.shown));
        this.$('cs-more').style.visibility = 'hidden';
      } else {
        this.$('cs-text').textContent = l.text;
        this.$('cs-more').style.visibility = 'visible';
        if (l.auto && (l.auto -= dt) <= 0) this.endLine();
      }
    }
    if (this.blur.now !== this.blur.to) {
      const d = this.blur.to - this.blur.now, step = this.blur.speed * dt;
      this.blur.now = Math.abs(d) <= step ? this.blur.to : this.blur.now + Math.sign(d) * step;
      this.ctx.view.renderer.domElement.style.filter = this.blur.now > 0.05 ? `blur(${this.blur.now.toFixed(1)}px)` : '';
    }
    const cam = this.ctx.view.camera;
    cam.position.copy(this.camNow.at);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeAmt * (this.shakeT > 0 ? 1 : 0);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.camNow.look);
  }

  /** Actors who stay after a scene (the Company, walking to town): handed over to the story. */
  keep(who) {
    const a = this.actors.get(who);
    this.actors.delete(who);
    return a;
  }

  clear() {
    for (const a of this.actors.values()) a.remove();
    this.actors.clear();
  }
}
