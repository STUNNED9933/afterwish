// Sound effects synthesised with the Web Audio API, so there are no audio
// files to download or license. Replace these with real samples later.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.muted = false;
  }

  /** Browsers only allow audio to start from a click, so call this from one. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyVolume();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (err) {
      this.ctx = null; // no audio available; the game plays silently
    }
  }

  applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.5;
  }
  setVolume(v) {
    this.volume = v;
    this.applyVolume();
  }
  setMuted(m) {
    this.muted = m;
    this.applyVolume();
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.004 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, freq = 1200, type = 'lowpass', slide = 0, delay = 0, q = 0.8 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  // --- Named sounds ------------------------------------------------------
  swing() {
    this.noise(0.14, { vol: 0.16, freq: 600, type: 'bandpass', slide: 2200, q: 1.2 });
  }
  hit(crit) {
    this.noise(0.09, { vol: 0.3, freq: 1800 });
    this.tone(crit ? 190 : 140, 0.1, { type: 'triangle', vol: 0.3, slide: -70 });
    if (crit) this.tone(880, 0.12, { type: 'square', vol: 0.06 });
  }
  hurt() {
    this.tone(200, 0.22, { type: 'sawtooth', vol: 0.22, slide: -120 });
    this.noise(0.12, { vol: 0.25, freq: 700 });
  }
  parryStart() {
    this.noise(0.06, { vol: 0.08, freq: 3000, type: 'highpass' });
  }
  parry(perfect) {
    // A bright metallic ring. The perfect version adds a rising shimmer.
    this.noise(0.05, { vol: 0.35, freq: 5000, type: 'highpass' });
    this.tone(1560, 0.35, { type: 'triangle', vol: 0.3 });
    this.tone(2340, 0.28, { type: 'sine', vol: 0.2 });
    this.tone(3130, 0.2, { type: 'sine', vol: 0.1 });
    if (perfect) {
      this.tone(2090, 0.5, { type: 'sine', vol: 0.22, delay: 0.06 });
      this.tone(3136, 0.6, { type: 'sine', vol: 0.16, delay: 0.12 });
      this.tone(4186, 0.7, { type: 'sine', vol: 0.1, delay: 0.18 });
    }
  }
  whiff() {
    this.tone(260, 0.1, { type: 'sine', vol: 0.06, slide: -80 });
  }
  stagger() {
    this.tone(520, 0.25, { type: 'square', vol: 0.07, slide: -300, delay: 0.05 });
  }
  cast(slot) {
    if (slot === 'q') this.noise(0.2, { vol: 0.28, freq: 500, type: 'bandpass', slide: 3000, q: 1 });
    else if (slot === 'w') {
      this.noise(0.34, { vol: 0.3, freq: 400, type: 'bandpass', slide: 1800, q: 0.9 });
      this.tone(220, 0.3, { type: 'triangle', vol: 0.12, slide: 200 });
    } else if (slot === 'e') this.noise(0.22, { vol: 0.28, freq: 3500, type: 'bandpass', slide: -2800, q: 1.4 });
    else if (slot === 'r') this.tone(180, 0.5, { type: 'sawtooth', vol: 0.14, slide: 600 });
  }
  impact() {
    this.tone(70, 0.6, { type: 'sine', vol: 0.6, slide: -40 });
    this.noise(0.5, { vol: 0.5, freq: 900, slide: -700 });
  }
  slam() {
    this.tone(90, 0.35, { type: 'sine', vol: 0.4, slide: -45 });
    this.noise(0.25, { vol: 0.3, freq: 600, slide: -400 });
  }
  shoot() {
    this.tone(640, 0.18, { type: 'square', vol: 0.06, slide: -380 });
  }
  death(boss) {
    this.tone(boss ? 110 : 170, boss ? 1.0 : 0.25, { type: 'sawtooth', vol: boss ? 0.3 : 0.12, slide: boss ? -80 : -110 });
    if (boss) this.noise(0.9, { vol: 0.4, freq: 1400, slide: -1200 });
  }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.2, delay: i * 0.08 }));
  }
  pickup(rarity) {
    const base = 660 + rarity * 110;
    this.tone(base, 0.12, { type: 'sine', vol: 0.16 });
    this.tone(base * 1.5, 0.2, { type: 'sine', vol: 0.14, delay: 0.07 });
    if (rarity >= 3) this.tone(base * 2, 0.4, { type: 'sine', vol: 0.12, delay: 0.14 });
  }
  potion() {
    this.tone(400, 0.25, { type: 'sine', vol: 0.18, slide: 400 });
  }
  wave(boss) {
    if (boss) {
      this.tone(98, 1.2, { type: 'sawtooth', vol: 0.22 });
      this.tone(147, 1.2, { type: 'sawtooth', vol: 0.14, delay: 0.05 });
    } else {
      this.tone(294, 0.25, { type: 'triangle', vol: 0.16 });
      this.tone(392, 0.4, { type: 'triangle', vol: 0.16, delay: 0.16 });
    }
  }
  clear() {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.15, delay: i * 0.1 }));
  }
  defeat() {
    [330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.18 }));
  }
  slow() {
    // Time slowing: a long falling tone under a soft wash.
    this.tone(880, 0.9, { type: 'sine', vol: 0.16, slide: -700 });
    this.noise(0.8, { vol: 0.12, freq: 2400, slide: -2100 });
  }
  dodge() {
    this.noise(0.18, { vol: 0.22, freq: 1200, type: 'bandpass', slide: 3200, q: 1.5 });
    this.tone(1320, 0.25, { type: 'sine', vol: 0.14, delay: 0.04 });
  }
  lightning() {
    this.noise(0.3, { vol: 0.5, freq: 6000, slide: -5200 });
    this.tone(110, 0.3, { type: 'sawtooth', vol: 0.2, slide: -60 });
  }
  augment() {
    [392, 587, 784, 1175].forEach((f, i) => this.tone(f, 0.45, { type: 'sine', vol: 0.18, delay: i * 0.06 }));
  }
  rankUp() {
    this.tone(660, 0.14, { type: 'triangle', vol: 0.18 });
    this.tone(990, 0.26, { type: 'triangle', vol: 0.18, delay: 0.09 });
  }
  upgrade() {
    this.noise(0.05, { vol: 0.3, freq: 4000, type: 'highpass' });
    this.tone(1200, 0.2, { type: 'triangle', vol: 0.22 });
    this.tone(1800, 0.3, { type: 'sine', vol: 0.14, delay: 0.08 });
  }
  ui() {
    this.tone(880, 0.05, { type: 'sine', vol: 0.08 });
  }
  denied() {
    this.tone(160, 0.08, { type: 'square', vol: 0.05 });
  }
}
