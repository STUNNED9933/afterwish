// Plays the songs in music/songs.js with the Web Audio API: a handful of
// synthesised instruments, a little reverb, and a scheduler that queues notes
// slightly ahead of time so the rhythm stays steady even if the game stutters.
import { SONGS, arrange, freq } from './songs.js';

// How loud each instrument is in the mix.
const MIX = { flute: 0.2, oboe: 0.17, brass: 0.15, square: 0.11, strings: 0.035, organ: 0.04, harp: 0.09, bell: 0.085, stab: 0.035, bass: 0.17, kick: 0.3, snare: 0.11, hat: 0.03, timp: 0.24 };

export class Music {
  /** @param {BaseAudioContext} ctx  pass one in, or call attach() later once audio is unlocked */
  constructor(ctx = null) {
    this.ctx = null;
    this.volume = 0.45;
    this.muted = false;
    this.paused = false;
    this.current = null; // id of the song that is playing (or wanted, before audio is unlocked)
    this.arranged = {};
    this.timer = null;
    if (ctx) this.attach(ctx);
  }

  attach(ctx) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain(); // master music volume
    this.out.connect(ctx.destination);
    this.bus = ctx.createGain(); // every instrument plays into this; fades with the song
    this.bus.connect(this.out);
    // A simple hall reverb: a burst of fading noise used as the room's echo.
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = rnd() * Math.pow(1 - i / len, 2.6);
    }
    const hall = ctx.createConvolver();
    hall.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.hall = ctx.createGain(); // every bus also feeds the reverb through here
    this.hall.connect(hall).connect(wet).connect(this.out);
    this.bus.connect(this.hall);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // one second of noise for drums
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd();
    this.applyVolume();
    if (this.current) this.start(this.current);
  }

  applyVolume() {
    // 0.68 leaves headroom so the busiest theme does not distort with the slider at full.
    if (this.out) this.out.gain.value = this.muted || this.paused ? 0 : this.volume * 0.68;
  }
  setVolume(v) {
    this.volume = v;
    this.applyVolume();
  }
  setMuted(m) {
    this.muted = m;
    this.applyVolume();
  }
  /** Stop scheduling while the game tab is hidden; pick the song up again afterwards. */
  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p;
    this.applyVolume();
    if (!this.ctx || !this.current) return;
    if (p) this.stopTimer();
    else this.start(this.current);
  }

  /** Switch to a song (by id from SONGS), or to silence with null. The old one fades out. */
  play(id) {
    if (id && !SONGS[id]) id = null;
    if (id === this.current && (this.timer || !this.ctx)) return;
    this.current = id;
    if (!this.ctx) return; // remembered; starts when audio is unlocked
    this.stopTimer();
    // Fade out whatever is ringing, then give the new song a fresh bus.
    const t = this.ctx.currentTime;
    const old = this.bus;
    old.gain.setValueAtTime(old.gain.value, t);
    old.gain.linearRampToValueAtTime(0, t + 0.7);
    setTimeout(() => old.disconnect(), 3200);
    this.bus = this.ctx.createGain();
    this.bus.connect(this.out);
    this.bus.connect(this.hall);
    if (id && !this.paused) this.start(id, 0.35);
  }

  song(id) {
    if (!this.arranged[id]) {
      const a = arrange(SONGS[id]);
      a.byStep = new Map();
      for (const ev of a.events) {
        if (!a.byStep.has(ev.step)) a.byStep.set(ev.step, []);
        a.byStep.get(ev.step).push(ev);
      }
      this.arranged[id] = a;
    }
    return this.arranged[id];
  }

  start(id, delay = 0.1) {
    this.stopTimer();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + delay;
    const tick = () => {
      const a = this.song(id);
      // Queue every note that starts in the next fifth of a second.
      while (this.nextTime < this.ctx.currentTime + 0.2) {
        const evs = a.byStep.get(this.step);
        if (evs) for (const ev of evs) this.note(ev, this.nextTime, ev.dur * a.stepSeconds);
        this.step = (this.step + 1) % a.steps;
        this.nextTime += a.stepSeconds;
      }
      if (this.nextTime < this.ctx.currentTime - 1) this.nextTime = this.ctx.currentTime + 0.1; // the tab slept; catch up
    };
    tick();
    this.timer = setInterval(tick, 40);
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Queue `seconds` of a song all at once. Used to render a song offline for testing. */
  queue(id, seconds) {
    const a = this.song(id);
    let t = 0.05;
    for (let step = 0; t < seconds; step = (step + 1) % a.steps, t += a.stepSeconds) {
      const evs = a.byStep.get(step);
      if (evs) for (const ev of evs) this.note(ev, t, ev.dur * a.stepSeconds);
    }
  }

  // ------------------------------------------------------------ instruments
  osc(type, f, t, stop, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t);
    o.stop(stop);
    return o;
  }

  /** Volume envelope: rise over `attack`, hold, fall away over `release` after the note ends. */
  env(t, dur, peak, attack, release, sustain = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (sustain < 1) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + Math.max(attack + 0.01, dur));
    else g.gain.setValueAtTime(peak, t + Math.max(attack, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
    g.connect(this.bus);
    return g;
  }

  lowpass(cutoff, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = q;
    return f;
  }

  vibrato(target, t, stop, depth) {
    const lfo = this.osc('sine', 5.4, t, stop);
    const amt = this.ctx.createGain();
    amt.gain.setValueAtTime(0, t);
    amt.gain.linearRampToValueAtTime(depth, t + 0.35); // vibrato grows in, like a player would
    lfo.connect(amt).connect(target.detune);
  }

  noiseHit(t, dur, peak, type, cutoff) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  note(ev, t, dur) {
    const v = (MIX[ev.inst] || 0.1) * ev.vol;
    const f = ev.midi ? freq(ev.midi) : 0;
    switch (ev.inst) {
      case 'flute': {
        const g = this.env(t, dur * 0.95, v, 0.05, 0.14);
        const a = this.osc('sine', f, t, t + dur + 0.3);
        const b = this.osc('triangle', f, t, t + dur + 0.3);
        const half = this.ctx.createGain();
        half.gain.value = 0.45;
        this.vibrato(a, t, t + dur + 0.3, 9);
        a.connect(g);
        b.connect(half).connect(g);
        break;
      }
      case 'oboe': {
        const g = this.env(t, dur * 0.95, v, 0.04, 0.16);
        const lp = this.lowpass(2000, 1.5);
        const a = this.osc('square', f, t, t + dur + 0.3);
        const b = this.osc('sawtooth', f, t, t + dur + 0.3);
        this.vibrato(a, t, t + dur + 0.3, 12);
        a.connect(lp);
        b.connect(lp);
        lp.connect(g);
        break;
      }
      case 'brass': {
        const g = this.env(t, dur * 0.9, v, 0.035, 0.12);
        const lp = this.lowpass(700, 1);
        lp.frequency.setValueAtTime(700, t);
        lp.frequency.linearRampToValueAtTime(2600, t + 0.07); // the "blat" at the start of a brass note
        lp.frequency.linearRampToValueAtTime(1700, t + Math.max(0.1, dur));
        this.osc('sawtooth', f, t, t + dur + 0.25, -6).connect(lp);
        this.osc('sawtooth', f, t, t + dur + 0.25, 6).connect(lp);
        lp.connect(g);
        break;
      }
      case 'square': {
        const g = this.env(t, dur * 0.9, v, 0.008, 0.08);
        const lp = this.lowpass(3000);
        const a = this.osc('square', f, t, t + dur + 0.2);
        this.osc('sawtooth', f, t, t + dur + 0.2, 8).connect(lp);
        if (dur > 0.25) this.vibrato(a, t, t + dur + 0.2, 10);
        a.connect(lp);
        lp.connect(g);
        break;
      }
      case 'strings': {
        const g = this.env(t, dur, v, 0.22, 0.45);
        const lp = this.lowpass(1300);
        this.osc('sawtooth', f, t, t + dur + 0.6, -8).connect(lp);
        this.osc('sawtooth', f, t, t + dur + 0.6, 8).connect(lp);
        lp.connect(g);
        break;
      }
      case 'organ': {
        const g = this.env(t, dur, v, 0.12, 0.5);
        this.osc('sine', f, t, t + dur + 0.6).connect(g);
        this.osc('sine', f * 2, t, t + dur + 0.6).connect(g);
        this.osc('triangle', f * 0.5, t, t + dur + 0.6).connect(g);
        break;
      }
      case 'stab': {
        const g = this.env(t, dur * 0.8, v, 0.01, 0.09);
        const lp = this.lowpass(1800);
        this.osc('sawtooth', f, t, t + dur + 0.2, -7).connect(lp);
        this.osc('sawtooth', f, t, t + dur + 0.2, 7).connect(lp);
        lp.connect(g);
        break;
      }
      case 'bell': {
        // A struck bar: a pure tone plus two out-of-tune overtones that die away quickly.
        const g = this.env(t, 1.4, v, 0.003, 0.5, 0.02);
        this.osc('sine', f, t, t + 2).connect(g);
        const hi = this.ctx.createGain();
        hi.gain.setValueAtTime(0.4, t);
        hi.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        this.osc('sine', f * 2.76, t, t + 0.6).connect(hi);
        this.osc('sine', f * 5.4, t, t + 0.3).connect(hi);
        hi.connect(g);
        break;
      }
      case 'harp': {
        const g = this.env(t, 0.9, v, 0.004, 0.2, 0.02);
        this.osc('triangle', f, t, t + 1.2).connect(g);
        const top = this.ctx.createGain();
        top.gain.value = 0.25;
        this.osc('sine', f * 2, t, t + 1.2).connect(top).connect(g);
        break;
      }
      case 'bass': {
        const g = this.env(t, dur * 0.9, v, 0.012, 0.1, 0.5);
        const lp = this.lowpass(520);
        this.osc('triangle', f, t, t + dur + 0.2).connect(lp);
        this.osc('sawtooth', f, t, t + dur + 0.2).connect(lp);
        lp.connect(g);
        break;
      }
      case 'kick': {
        const o = this.ctx.createOscillator();
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(this.bus);
        o.start(t);
        o.stop(t + 0.22);
        break;
      }
      case 'snare':
        this.noiseHit(t, 0.13, v, 'bandpass', 1900);
        this.noiseHit(t, 0.05, v * 0.6, 'highpass', 5000);
        break;
      case 'hat':
        this.noiseHit(t, 0.04, v, 'highpass', 7500);
        break;
      case 'timp': {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * 1.12, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g).connect(this.bus);
        o.start(t);
        o.stop(t + 0.75);
        this.noiseHit(t, 0.06, v * 0.4, 'lowpass', 400);
        break;
      }
    }
  }

  /**
   * Render a few seconds of a song without playing it and measure how loud it is.
   * Used by the browser test to confirm every theme really produces sound.
   */
  static async measure(id, seconds = 6) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.floor(44100 * seconds), 44100);
    const m = new Music(ctx);
    m.setVolume(1);
    m.queue(id, seconds - 0.5);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
      sum += a * a;
    }
    return { peak, rms: Math.sqrt(sum / data.length) };
  }
}
