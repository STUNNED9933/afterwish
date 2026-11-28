// Plays the songs in music/songs.js with the Web Audio API: a handful of
// synthesised instruments, a little reverb, and a scheduler that queues notes
// slightly ahead of time so the rhythm stays steady even if the game stutters.
import { SONGS, arrange, freq } from './songs.js';
import { Sampler } from './samples.js';

// (1.2) Each part's recorded instrument (music/samples.js): the old names map to one, and a song may name any
// sampled instrument directly (choir, cello, nylon...). Until it has loaded, the synthesised voice plays.
const SAMPLE = { flute: 'flute', oboe: 'oboe', brass: 'horn', strings: 'strings', organ: 'organ', stab: 'pizz', bell: 'celesta', harp: 'harp', bass: 'bass', timp: 'timp' };
const OWN = new Set(['flute', 'oboe', 'horn', 'trumpet', 'strings', 'tremolo', 'pizz', 'cello', 'harp', 'celesta', 'glock', 'bells', 'organ', 'choir', 'bass', 'contrabass', 'timp', 'taiko', 'woodblock', 'tom', 'nylon', 'recorder', 'whistle']);
// how loud each sampled instrument sits in the mix (they are all evened out to the same peak first)
const SMIX = { flute: 0.42, oboe: 0.36, recorder: 0.36, whistle: 0.25, horn: 0.34, trumpet: 0.28, strings: 0.11, tremolo: 0.1, cello: 0.2, choir: 0.14, organ: 0.16, pizz: 0.065, harp: 0.16, celesta: 0.14, glock: 0.11, bells: 0.14, nylon: 0.17, bass: 0.45, contrabass: 0.35, timp: 0.37, taiko: 0.4, woodblock: 0.14, tom: 0.25 }; // (matched, part by part, to the synthesised mix the songs were written for)
const SAMPLED_DRIVE = new Set(['pizz', 'taiko', 'tom', 'woodblock']);

// (0.72) The drums and the short string stabs are the "drive": they swell in a fight and sit back when
// things are calm (setIntensity). Everything else is the core of the song.
const DRIVE = new Set(['kick', 'snare', 'hat', 'timp', 'stab']);

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
    this.intensity = 0.5; // (0.72) 0 calm ... 1 a fight
    this.ducked = false; // (0.72) a menu is open: softer and muffled
    if (ctx) this.attach(ctx);
  }

  attach(ctx) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    this.sampler = this.sampler || new Sampler(ctx); // (1.2)
    this.out = ctx.createGain(); // master music volume
    this.out.connect(ctx.destination);
    // (0.72) the whole mix goes through one gentle low-pass: brighter in a fight, muffled behind a menu
    this.mix = ctx.createBiquadFilter();
    this.mix.type = 'lowpass';
    this.mix.Q.value = 0.5;
    this.mix.frequency.value = 16000;
    // (1.2.1) a gentle limiter last: the loudest moments (a fight theme, a cymbal) no longer jump out at the ear
    this.limit = ctx.createDynamicsCompressor();
    this.limit.threshold.value = -16;
    this.limit.knee.value = 12;
    this.limit.ratio.value = 4;
    this.limit.attack.value = 0.008;
    this.limit.release.value = 0.3;
    this.mix.connect(this.limit).connect(this.out);
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
    this.hall.connect(hall).connect(wet).connect(this.mix);
    this.newBus(1);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // one second of noise for drums
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd();
    this.applyVolume();
    if (this.current) this.start(this.current);
  }

  /**
   * (0.72) A fresh set of buses for a song: `bus` (melody, chords, bass) and `drive` (drums and stabs),
   * both into `songOut`, which fades the song in and out as a whole.
   */
  newBus(start = 0) {
    const ctx = this.ctx;
    this.songOut = ctx.createGain();
    this.songOut.gain.value = start;
    this.songOut.connect(this.mix);
    this.songOut.connect(this.hall);
    this.bus = ctx.createGain();
    this.bus.connect(this.songOut);
    this.drive = ctx.createGain();
    this.drive.gain.value = this.driveLevel();
    this.drive.connect(this.songOut);
  }

  driveLevel() {
    return 0.35 + 0.65 * this.intensity;
  }

  /** (0.72) How hard the music is pushing, 0 (calm) to 1 (a fight). Eased in over a second or two. */
  setIntensity(x) {
    x = Math.max(0, Math.min(1, x));
    if (Math.abs(x - this.intensity) < 0.01) return;
    this.intensity = x;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.drive.gain.cancelScheduledValues(t);
    this.drive.gain.setTargetAtTime(this.driveLevel(), t, 0.6);
    this.applyTone();
  }

  /** (0.72) A menu over the game: the music steps back (quieter, muffled) and comes forward again after. */
  setDucked(d) {
    if (d === this.ducked) return;
    this.ducked = d;
    this.applyVolume();
    this.applyTone();
  }

  applyTone() {
    if (!this.ctx) return;
    const f = this.ducked ? 1400 : 5500 + 10500 * this.intensity;
    this.mix.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.mix.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.25);
  }

  applyVolume() {
    // 0.68 leaves headroom so the busiest theme does not distort with the slider at full. (1.2.1) 0.5: the recorded
    // instruments carry more than the old synths did, and it was too loud
    if (!this.out) return;
    const v = this.muted || this.paused ? 0 : this.volume * 0.5 * (this.ducked ? 0.5 : 1);
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, this.muted || this.paused ? 0.01 : 0.15);
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
    // (0.72) A crossfade: the old song eases out over a second and a half while the new one eases in.
    const t = this.ctx.currentTime;
    const old = this.songOut;
    old.gain.cancelScheduledValues(t);
    old.gain.setValueAtTime(old.gain.value, t);
    old.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => old.disconnect(), 4500);
    this.newBus(0);
    this.songOut.gain.setValueAtTime(0, t + 0.25);
    this.songOut.gain.linearRampToValueAtTime(1, t + 1.6);
    if (id && !this.paused) {
      // (1.2) its instruments first (a second or two at most; it starts anyway if they are slow)
      const go = () => { if (this.current === id && !this.timer && !this.paused) this.start(id, 0.25); };
      Promise.race([this.preload(id), new Promise((r) => setTimeout(r, 2500))]).then(go);
    }
  }

  /** (1.2) The recorded instruments a song uses (loaded before it starts, so it does not begin on synths). */
  instrumentsOf(id) {
    const a = this.song(id), set = new Set();
    for (const ev of a.events) { const k = SAMPLE[ev.inst] || (OWN.has(ev.inst) ? ev.inst : null); if (k) set.add(k); }
    return [...set];
  }
  preload(id) {
    if (!this.sampler || !id || !SONGS[id]) return Promise.resolve();
    return Promise.all(this.instrumentsOf(id).map((k) => this.sampler.load(k)));
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
      const now = this.ctx.currentTime;
      if (this.nextTime < now - 1) this.nextTime = now + 0.1; // the tab slept; pick up from here
      // (1.2.1) Queue every note that starts in the next Music.AHEAD seconds. It was a fifth of a second: one slow
      // frame (ground loading, a busy fight) and the queue ran dry, then the notes it missed all played at once,
      // late (the music stuttered). A note whose time has already gone is left out, so the beat keeps its place.
      while (this.nextTime < now + Music.AHEAD) {
        const evs = a.byStep.get(this.step);
        if (evs && this.nextTime > now - 0.03) for (const ev of evs) this.note(ev, Math.max(this.nextTime, now), ev.dur * a.stepSeconds);
        else if (evs) this.dropped = (this.dropped || 0) + evs.length;
        this.step = (this.step + 1) % a.steps;
        this.nextTime += a.stepSeconds;
      }
    };
    tick();
    this.timer = setInterval(tick, 50);
  }

  /** (1.2.1) How far ahead notes are queued, in seconds: longer than any frame the game is likely to take. */
  static AHEAD = 0.8;

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
  env(t, dur, peak, attack, release, sustain = 1, dest = this.dest || this.bus) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (sustain < 1) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + Math.max(attack + 0.01, dur));
    else g.gain.setValueAtTime(peak, t + Math.max(attack, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, dur) + release);
    g.connect(dest);
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
    src.connect(f).connect(g).connect(this.dest || this.bus);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  note(ev, t, dur) {
    this.dest = DRIVE.has(ev.inst) || SAMPLED_DRIVE.has(ev.inst) ? this.drive || this.bus : this.bus; // (0.72) drums and stabs on the drive bus
    // (1.2) a recorded instrument, if it has one and it has loaded
    const sk = SAMPLE[ev.inst] || (OWN.has(ev.inst) ? ev.inst : null);
    if (sk && this.sampler && this.sampler.ready(sk) && ev.midi && this.sampler.play(sk, ev.midi, t, dur, (SMIX[sk] || 0.1) * ev.vol, this.dest)) return;
    if (OWN.has(ev.inst) && !SAMPLE[ev.inst]) ev = { ...ev, inst: { horn: 'brass', trumpet: 'brass', cello: 'strings', tremolo: 'strings', choir: 'organ', contrabass: 'bass', pizz: 'stab', celesta: 'bell', glock: 'bell', bells: 'bell', nylon: 'harp', recorder: 'flute', whistle: 'flute', taiko: 'timp', tom: 'timp', woodblock: 'hat' }[ev.inst] || 'flute' }; // (not loaded yet: the nearest synthesised voice)
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
        o.connect(g).connect(this.dest);
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
        o.connect(g).connect(this.dest);
        o.start(t);
        o.stop(t + 0.75);
        this.noiseHit(t, 0.06, v * 0.4, 'lowpass', 400);
        break;
      }
    }
  }

  /** (1.2) Render a few seconds of a song offline into an AudioBuffer (for measuring, or to save and listen to). */
  static async render(id, seconds = 6, { samples = true } = {}) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.floor(44100 * seconds), 44100);
    const m = new Music(ctx);
    if (samples) await m.preload(id);
    else m.sampler = null;
    m.setVolume(1);
    m.queue(id, seconds - 0.5);
    return ctx.startRendering();
  }

  /**
   * Render a few seconds of a song without playing it and measure how loud it is.
   * Used by the browser test to confirm every theme really produces sound.
   */
  static async measure(id, seconds = 6, { samples = true } = {}) {
    const buf = await Music.render(id, seconds, { samples });
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
