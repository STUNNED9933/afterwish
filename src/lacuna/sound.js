// (1.2) Lacuna's sound: its music (music/player.js, the themes in music/lacuna-songs.js), its sound effects and
// its ambience. Effects are built from the recorded instruments (music/samples.js: taiko for thuds, nylon for a
// bowstring, celesta and bells for loot) and from shaped noise (whooshes, footsteps, growls). Sounds away from the
// hero are quieter with distance and placed left or right of the camera.
import { Music } from '../music/player.js';
import { Sampler } from '../music/samples.js';

const KEY = 'lacuna-sound-v1';
// how much louder (or softer) each effect is made, so they sit together (filtered noise loses most of its energy)
const LIFT = { swing: 4, whirl: 3.5, dodge: 4, jump: 4, jump2: 3, slide: 3, leap: 3, draw: 8, growl: 4, snort: 3, step: 3, ui: 2, kick: 1.3, stone: 1.6, bite: 1.2, hit: 0.7, crash: 0.75, grind: 1.8 };
const SFX_SAMPLES = ['taiko', 'nylon', 'celesta', 'bells', 'harp', 'horn', 'woodblock', 'tom', 'cymbal', 'breath', 'birds', 'sea', 'tinkle', 'glock', 'cello', 'timp'];

export class LandSound {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private window */ }
    this.vol = saved.vol ?? 0.8;
    this.musicVol = saved.music ?? 0.45; // (1.2.1) was 0.6: too loud
    this.muted = !!saved.muted;
    this.ctx = null;
    this.music = new Music();
    this.music.volume = this.musicVol;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.stepT = 0;
    this.birdT = 3;
    this.windOn = null;
    this.song = null;
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify({ vol: this.vol, music: this.musicVol, muted: this.muted })); } catch { /* */ } }

  /** From a click or a key (browsers start audio only then). */
  unlock(given = null) {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !given) return;
    try {
      this.ctx = given || new AC(); // (a test renders into an OfflineAudioContext)
    } catch { return; }
    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    // a little room for the effects (a short decaying noise tail)
    const len = Math.floor(ctx.sampleRate * 1.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.25;
    this.verbIn.connect(this.verb).connect(this.out);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.sampler = new Sampler(ctx);
    this.loaded = Promise.all(SFX_SAMPLES.map((k) => this.sampler.load(k)));
    this.music.attach(ctx);
    this.music.sampler = this.sampler; // (one set of samples for both)
    this.apply();
    if (this.song) this.music.play(this.song);
  }

  /** (tests) Every effect, rendered offline: [{ name, peak, rms }]. */
  static async measureAll(names) {
    const out = [];
    for (const name of names) {
      const ctx = new OfflineAudioContext(2, 44100 * 3, 44100), s = new LandSound();
      s.muted = false; s.vol = 1;
      s.unlock(ctx);
      await s.loaded;
      s.play(name, null, null, { r: 5, warn: 1.3, crit: true, hard: 1, road: true });
      const buf = await ctx.startRendering(), d = buf.getChannelData(0);
      let peak = 0, sum = 0, nan = false;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (!Number.isFinite(a)) nan = true; peak = Math.max(peak, a); sum += a * a; }
      out.push({ name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), nan });
    }
    return out;
  }

  apply() {
    if (this.out) this.out.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.05);
    this.music.setVolume(this.musicVol);
    this.music.setMuted(this.muted);
  }
  setVolume(v) { this.vol = v; this.apply(); this.save(); }
  setMusic(v) { this.musicVol = v; this.apply(); this.save(); }
  toggleMute() { this.muted = !this.muted; this.apply(); this.save(); return this.muted; }

  // ------------------------------------------------------------------ building blocks
  /** How loud and where a sound at (x, z) is: [volume 0..1, pan -1..1]. */
  place(x, z, range = 38) {
    if (x == null) return [1, 0];
    const dx = x - this.listener.x, dz = z - this.listener.z, d = Math.hypot(dx, dz);
    if (d > range) return [0, 0];
    const near = 1 - d / range;
    const ang = Math.atan2(dz, dx) - this.listener.yaw;
    return [near * near, d < 1.5 ? 0 : Math.max(-0.8, Math.min(0.8, Math.sin(ang)))];
  }

  bus(vol, pan, wet = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let node = g;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.out);
    if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; node.connect(w).connect(this.verbIn); }
    setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 6000);
    return g;
  }

  /** Filtered noise: a whoosh, a thud, a scrape. from/to: the filter's sweep; vol: its loudness. */
  noise(dest, t, dur, { type = 'bandpass', from = 1200, to = from, q = 1, vol = 0.5, attack = 0.005 } = {}) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(dest, t, dur, f0, f1 = f0, { type = 'sine', vol = 0.4, attack = 0.004 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** A recorded instrument as an effect (if it has loaded). */
  sample(dest, t, inst, midi, dur = 0.5, vol = 0.5, rate = 1) {
    return this.sampler && this.sampler.play(inst, midi, t, dur, vol, dest, { rate });
  }

  // ------------------------------------------------------------------ the sounds
  /** Play a named sound, at (x, z) if given (else on the hero). */
  play(name, x = null, z = null, opt = {}) {
    if (!this.ctx || this.muted) return;
    const [v, pan] = this.place(x, z, opt.range);
    if (v <= 0.01) return;
    const t = this.ctx.currentTime + 0.005;
    const lift = LIFT[name] || 1; // (evened out by measuring each: tools test them in lacuna's test)
    const D = (vol, wet = 0) => this.bus(vol * v * lift, pan, wet);
    switch (name) {
      case 'swing': this.noise(D(0.5), t, 0.18, { from: 700, to: 2600, q: 1.4, vol: 0.6, attack: 0.04 }); break;
      case 'whirl': for (let k = 0; k < 4; k++) this.noise(D(0.4), t + k * 0.16, 0.16, { from: 600, to: 2200, q: 1.2, vol: 0.6, attack: 0.05 }); break;
      case 'shot': { // a bowstring: a low nylon pluck and a snap
        const d = D(0.7, 0.1);
        if (!this.sample(d, t, 'nylon', 43, 0.25, 0.6, 1)) this.tone(d, t, 0.15, 180, 120, { type: 'triangle', vol: 0.5 });
        this.noise(d, t, 0.05, { type: 'highpass', from: 3500, vol: 0.4 });
        this.noise(d, t + 0.02, 0.22, { from: 1800, to: 900, q: 2, vol: 0.18, attack: 0.02 });
        break;
      }
      case 'hit': { // flesh and fur: a low thump and a slap
        const d = D(0.75, 0.05);
        this.tone(d, t, 0.12, 120, 55, { vol: 0.7 });
        this.noise(d, t, 0.09, { type: 'lowpass', from: 1400, to: 300, vol: 0.6 });
        if (opt.crit) { this.sample(d, t, 'glock', 88, 0.4, 0.25) || this.tone(d, t, 0.3, 1900, 1900, { vol: 0.15 }); this.noise(d, t, 0.06, { type: 'highpass', from: 4000, vol: 0.35 }); }
        break;
      }
      case 'stone': { // a blow on a golem
        const d = D(0.75, 0.08);
        this.noise(d, t, 0.14, { from: 900, to: 400, q: 0.8, vol: 0.7 });
        this.sample(d, t, 'woodblock', 60, 0.2, 0.35, 0.7);
        break;
      }
      case 'hurt': { // the hero is struck
        const d = D(0.8);
        this.tone(d, t, 0.18, 160, 60, { vol: 0.7 });
        this.noise(d, t, 0.12, { type: 'lowpass', from: 2000, to: 300, vol: 0.5 });
        this.sample(d, t + 0.02, 'breath', 60, 0.25, 0.25, 1.4);
        break;
      }
      case 'dodge': this.noise(D(0.45), t, 0.22, { from: 2400, to: 900, q: 1.5, vol: 0.5, attack: 0.03 }); break;
      case 'growl': { // a wolf's wind-up
        const d = D(0.55), ctx = this.ctx;
        const lfo = ctx.createOscillator(), amt = ctx.createGain(), g = ctx.createGain();
        lfo.frequency.value = 28; amt.gain.value = 0.5; g.gain.value = 0.5;
        lfo.connect(amt).connect(g.gain);
        g.connect(d);
        this.noise(g, t, 0.45, { from: 260, to: 180, q: 4, vol: 0.9, attack: 0.08 });
        this.tone(g, t, 0.45, 95, 80, { type: 'sawtooth', vol: 0.12, attack: 0.08 });
        lfo.start(t); lfo.stop(t + 0.5);
        break;
      }
      case 'snort': this.noise(D(0.5), t, 0.3, { from: 700, to: 300, q: 3, vol: 0.7, attack: 0.02 }); this.noise(D(0.4), t + 0.18, 0.2, { from: 900, to: 400, q: 3, vol: 0.5 }); break;
      case 'grind': this.noise(D(0.6), t, 0.42, { type: 'lowpass', from: 300, to: 160, q: 2, vol: 0.9, attack: 0.1 }); this.sample(D(0.4), t, 'tom', 40, 0.4, 0.3, 0.6); break;
      case 'bite': this.noise(D(0.6), t, 0.06, { type: 'highpass', from: 2500, vol: 0.6 }); this.noise(D(0.4), t, 0.1, { from: 1200, to: 700, vol: 0.4 }); break;
      case 'fall': { // a beast goes down
        const d = D(0.8, 0.1);
        if (!this.sample(d, t, 'taiko', 40, 0.6, 0.55, 0.85)) this.tone(d, t, 0.3, 80, 40, { vol: 0.7 });
        this.noise(d, t + 0.03, 0.3, { type: 'lowpass', from: 600, to: 150, vol: 0.5 });
        break;
      }
      case 'jump': this.noise(D(0.3), t, 0.2, { from: 500, to: 1600, q: 1, vol: 0.5, attack: 0.03 }); break;
      case 'jump2': this.noise(D(0.35), t, 0.25, { from: 700, to: 2600, q: 1.2, vol: 0.5, attack: 0.03 }); this.sample(D(0.3), t, 'tinkle', 84, 0.3, 0.15, 1.2); break;
      case 'kick': this.tone(D(0.6), t, 0.1, 140, 70, { vol: 0.6 }); this.noise(D(0.4), t, 0.2, { from: 600, to: 2000, vol: 0.5, attack: 0.02 }); break;
      case 'land': { const k = Math.min(1, opt.hard || 0.4); this.tone(D(0.6 * k), t, 0.12, 90, 45, { vol: 0.7 }); this.noise(D(0.45 * k), t, 0.12, { type: 'lowpass', from: 900, to: 200, vol: 0.6 }); break; }
      case 'slide': this.noise(D(0.4), t, 0.55, { type: 'lowpass', from: 1600, to: 500, q: 0.6, vol: 0.5, attack: 0.03 }); break;
      case 'step': this.noise(D(opt.road ? 0.16 : 0.12), t, 0.07, { type: 'lowpass', from: opt.road ? 2600 : 1300, to: 400, vol: 0.6 }); break;
      case 'leap': this.noise(D(0.45), t, 0.5, { from: 400, to: 2000, q: 0.8, vol: 0.5, attack: 0.1 }); break;
      case 'slam': {
        const d = D(0.9, 0.2);
        if (!this.sample(d, t, 'taiko', 36, 0.8, 0.7, 0.8)) this.tone(d, t, 0.4, 70, 35, { vol: 0.8 });
        this.noise(d, t, 0.5, { type: 'lowpass', from: 1500, to: 120, vol: 0.6 });
        break;
      }
      case 'oath': this.sample(D(0.6, 0.3), t, 'cymbal', 60, 1.5, 0.35) ; this.sample(D(0.5, 0.3), t + 0.3, 'cello', 38, 1.2, 0.4); break;
      case 'blood': this.tone(D(0.5), t, 0.1, 60, 50, { vol: 0.6 }); this.tone(D(0.5), t + 0.16, 0.1, 58, 48, { vol: 0.45 }); break;
      case 'draw': this.noise(D(0.35), t, 0.6, { from: 300, to: 1400, q: 6, vol: 0.4, attack: 0.3 }); break;
      case 'loose': { const d = D(0.8, 0.15); this.sample(d, t, 'nylon', 40, 0.3, 0.7, 1) || this.tone(d, t, 0.2, 160, 100, { type: 'triangle', vol: 0.5 }); this.noise(d, t, 0.45, { from: 2600, to: 600, q: 1.4, vol: 0.5, attack: 0.01 }); break; }
      case 'levelup': { const d = D(0.7, 0.4); [67, 71, 74, 79, 83].forEach((m, i) => this.sample(d, t + i * 0.07, 'harp', m, 1.2, 0.45) || this.tone(d, t + i * 0.07, 0.6, 440 * Math.pow(2, (m - 69) / 12), undefined, { type: 'triangle', vol: 0.25 })); this.sample(d, t + 0.4, 'celesta', 91, 1.5, 0.35); break; }
      case 'loot': { // by rarity: a note, a run, then bells
        const d = D(0.6, 0.35), r = opt.r || 0;
        const runs = [[84], [84, 88], [84, 88, 91], [84, 88, 91, 96], [79, 84, 88, 91, 96], [72, 79, 84, 88, 91, 96], [72, 76, 79, 84, 88, 91, 96]];
        runs[Math.min(6, r)].forEach((m, i) => this.sample(d, t + i * 0.06, r >= 4 ? 'glock' : 'celesta', m, 1, 0.35) || this.tone(d, t + i * 0.06, 0.4, 440 * Math.pow(2, (m - 69) / 12), undefined, { vol: 0.15 }));
        if (r >= 5) this.sample(d, t + 0.35, 'bells', r >= 6 ? 64 : 67, 3, 0.5);
        break;
      }
      case 'quest': { const d = D(0.6, 0.35); [[62, 0], [67, 0.16], [71, 0.32], [74, 0.48]].forEach(([m, k]) => this.sample(d, t + k, 'horn', m, k === 0.48 ? 1.2 : 0.3, 0.5) || this.tone(d, t + k, 0.3, 440 * Math.pow(2, (m - 69) / 12), undefined, { type: 'triangle', vol: 0.25 })); break; }
      case 'ui': this.sample(D(0.4), t, 'woodblock', 72, 0.1, 0.3) || this.tone(D(0.3), t, 0.05, 900, 700, { vol: 0.2 }); break;
      case 'tele': { // a world boss marks where it will strike: a rising roar into the ground
        const d = D(0.7, 0.2), w = opt.warn || 1.3;
        this.sample(d, t + Math.max(0, w - 1.6), 'cymbal', 60, 1.6, 0.5, 1.6 / Math.max(0.6, w));
        this.noise(d, t, w, { type: 'lowpass', from: 120, to: 400, q: 3, vol: 0.5, attack: w * 0.8 });
        break;
      }
      case 'crash': { const d = D(1, 0.25); this.sample(d, t, 'taiko', 36, 1, 0.8, 0.7) || this.tone(d, t, 0.5, 60, 30, { vol: 0.9 }); this.noise(d, t, 0.8, { type: 'lowpass', from: 2400, to: 100, vol: 0.8 }); break; }
      case 'boss': this.sample(this.bus(0.5, 0, 0.5), t, 'bells', 52, 4, 0.6); this.sample(this.bus(0.4, 0, 0.5), t + 0.8, 'bells', 52, 4, 0.5); break;
      case 'rift': this.sample(D(0.6, 0.4), t, 'cymbal', 60, 2.5, 0.5, 0.8); this.sample(D(0.6, 0.3), t + 1.6, 'taiko', 38, 1, 0.7); break;
      case 'wave': this.sample(D(0.7, 0.2), t, 'taiko', 38, 0.6, 0.7); this.sample(D(0.7, 0.2), t + 0.22, 'taiko', 38, 0.6, 0.6); break;
      case 'riftWon': this.play('quest'); this.sample(this.bus(0.4, 0, 0.5), t + 0.5, 'bells', 60, 3, 0.5); break;
      case 'riftLost': this.sample(D(0.6, 0.3), t, 'cello', 41, 1.6, 0.5); this.sample(D(0.6, 0.3), t + 0.5, 'cello', 36, 2, 0.5); break;
      case 'ward': { const d = D(0.8, 0.4); this.noise(d, t, 0.5, { type: 'highpass', from: 3000, to: 6000, vol: 0.5 }); this.sample(d, t + 0.05, 'bells', 72, 2, 0.4); this.sample(d, t + 0.05, 'glock', 96, 1, 0.3); break; }
      case 'down': this.sample(D(0.7, 0.4), t, 'cello', 43, 2, 0.5); this.sample(D(0.6, 0.4), t + 0.6, 'cello', 38, 2.5, 0.45); break;
      case 'bird': this.sample(this.bus(0.12 * v, pan, 0.4), t, 'birds', opt.m || 78, 1.5, 0.5, opt.rate || 1); break;
    }
  }

  /** Each frame: the hero's own sounds (footsteps, landing), ambience, and the song wanted (`song`, `fight` 0..1). */
  frame(dt, { x, z, yaw, onGround, moving, speed, road, vy, song, fight, wild, wind }) {
    this.listener = { x, z, yaw };
    // (1.2.1) a new theme has to be wanted for a moment before it takes over, so walking along the edge of town or
    // a fight that stops and starts cannot flip the music back and forth (each switch restarts a song)
    if (song === this.song) this.want = null;
    else if (!this.song) { this.song = song; if (this.ctx) this.music.play(song); }
    else {
      if (this.want !== song) { this.want = song; this.wantFor = 0; }
      this.wantFor += dt;
      if (this.wantFor > 1.2) { this.song = song; this.want = null; if (this.ctx) this.music.play(song); }
    }
    if (this.ctx) this.music.setIntensity(fight);
    if (!this.ctx || this.muted) return;
    // footsteps: one every ~0.33 s at a run, slower at a walk
    if (onGround && moving && speed > 0.5) {
      this.stepT -= dt * Math.min(2.2, speed / 2.2);
      if (this.stepT <= 0) { this.stepT = 0.36; this.play('step', null, null, { road }); }
    } else this.stepT = 0.05;
    // landing: from a real fall (not a hop)
    if (onGround && this.wasAir && this.fallV < -4) this.play('land', null, null, { hard: Math.min(1, -this.fallV / 12) });
    this.wasAir = !onGround;
    this.fallV = onGround ? 0 : Math.min(this.fallV || 0, vy || 0);
    // birds in the woods by day
    if (wild) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 2.5 + Math.random() * 7;
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 18;
        this.play('bird', x + Math.cos(a) * r, z + Math.sin(a) * r, { m: 74 + Math.floor(Math.random() * 10), rate: 0.85 + Math.random() * 0.4 });
      }
    }
    // the wind (on the ridge, at the tear): the seashore sample, darkened, looped
    if (!!wind !== !!this.windOn) {
      if (wind && this.sampler && this.sampler.ready('sea')) {
        const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = this.sampler.banks.get('sea')[0].buf;
        src.loop = true;
        src.playbackRate.value = 0.55;
        f.type = 'lowpass'; f.frequency.value = 650;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2);
        src.connect(f).connect(g).connect(this.out);
        src.start();
        this.windOn = { src, g };
      } else if (!wind && this.windOn) {
        const w = this.windOn, ctx = this.ctx;
        w.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
        setTimeout(() => { try { w.src.stop(); } catch { /* */ } }, 3000);
        this.windOn = null;
      }
    }
  }
}
