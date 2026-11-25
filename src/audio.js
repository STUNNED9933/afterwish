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
        // (0.93) a hall's reverb for the big sounds: a decaying stereo noise tail (made here, no file)
        try {
          const sr = this.ctx.sampleRate, len = Math.floor(sr * 2.4);
          const ir = this.ctx.createBuffer(2, len, sr);
          for (let c = 0; c < 2; c++) {
            const d = ir.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
          }
          this.verb = this.ctx.createConvolver();
          this.verb.buffer = ir;
          this.verbIn = this.ctx.createGain();
          this.verbIn.gain.value = 0.55;
          this.verbIn.connect(this.verb).connect(this.master);
        } catch {
          this.verb = null;
        }
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

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.004, wet = 0, detune = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (detune) osc.detune.value = detune;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    if (wet && this.verbIn) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      gain.connect(send).connect(this.verbIn);
    }
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.3, freq = 1200, type = 'lowpass', slide = 0, delay = 0, q = 0.8, wet = 0, attack = 0 } = {}) {
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
    if (attack > 0) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    } else gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    if (wet && this.verbIn) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      gain.connect(send).connect(this.verbIn);
    }
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
  // --- (0.72) the borrowed skills, the Oaths, the Eternal -------------------------------------
  /** Dragon's Breath: a roar of flame that rises, and a crackle in it. */
  fireBreath() {
    this.noise(0.7, { vol: 0.42, freq: 300, type: 'bandpass', slide: 1600, q: 0.6 });
    this.noise(0.5, { vol: 0.18, freq: 4000, type: 'highpass', delay: 0.05 });
    this.tone(90, 0.6, { type: 'sawtooth', vol: 0.12, slide: 60 });
  }
  /** A drag inwards (Anchor Shot, Smoke Snare, Gravity Anchor, Hold the Line): a reversed whoosh and a thud. */
  pullIn() {
    this.noise(0.35, { vol: 0.3, freq: 5000, type: 'bandpass', slide: -4400, q: 1.1 });
    this.tone(70, 0.35, { type: 'sine', vol: 0.45, slide: -25, delay: 0.3 });
  }
  /** A wall of ice rising: glassy chimes over a crack. */
  iceWall() {
    this.noise(0.2, { vol: 0.25, freq: 3000, type: 'highpass' });
    [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.08, delay: 0.03 * i }));
    this.tone(110, 0.3, { type: 'triangle', vol: 0.2, slide: -40 });
  }
  /** A lobbed bomb: a falling whistle. */
  lob() {
    this.tone(1400, 0.4, { type: 'sine', vol: 0.08, slide: -900 });
  }
  /** Blink Strike: a quick zip out and back. */
  blink() {
    this.tone(400, 0.12, { type: 'square', vol: 0.06, slide: 1800 });
    this.noise(0.12, { vol: 0.14, freq: 6000, type: 'highpass', delay: 0.06 });
  }
  /** An Oath taken: a heartbeat and a growl. */
  oathOn() {
    this.tone(60, 0.18, { type: 'sine', vol: 0.6, slide: -15 });
    this.tone(60, 0.18, { type: 'sine', vol: 0.5, slide: -15, delay: 0.22 });
    this.tone(110, 0.6, { type: 'sawtooth', vol: 0.12, slide: -30, delay: 0.05 });
    this.noise(0.5, { vol: 0.15, freq: 500, type: 'lowpass', delay: 0.05 });
  }
  /** An Oath let go: a long breath out. */
  oathOff() {
    this.noise(0.5, { vol: 0.12, freq: 1200, type: 'bandpass', slide: -800, q: 0.8 });
  }
  /** Death Mark: a deep bell. */
  deathMark() {
    this.tone(98, 1.2, { type: 'sine', vol: 0.45 });
    this.tone(98 * 2.76, 0.6, { type: 'sine', vol: 0.12 });
    this.noise(0.08, { vol: 0.25, freq: 2500, type: 'bandpass' });
  }
  /** A shot turned back by ice: a bright ping. */
  ping() {
    this.tone(2200, 0.15, { type: 'sine', vol: 0.1, slide: 600 });
  }
  /** An Eternal falls: a rising choir of chimes over a low swell. */
  eternal() {
    this.tone(65, 1.6, { type: 'sine', vol: 0.4, attack: 0.3 });
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 1.1, { type: 'triangle', vol: 0.12, delay: 0.1 + i * 0.09 }));
    this.noise(1.4, { vol: 0.1, freq: 6000, type: 'highpass', delay: 0.2 });
  }

  /**
   * Deadeye (0.42): a hard crack, a deep boom and a long rolling echo. (0.93) Heavier: a supersonic snap,
   * a chest-deep sub that falls away, the air tearing behind the shot, and the echo off the mountains.
   */
  sniper(echo = false) {
    const k = echo ? 0.45 : 1;
    this.noise(0.05, { vol: 0.9 * k, freq: 5200, type: 'highpass', q: 0.7, wet: 0.4 });
    this.tone(2400, 0.04, { type: 'square', vol: 0.16 * k, slide: -2000 });
    this.tone(48, 1.6, { type: 'sine', vol: 0.95 * k, slide: -24, wet: 0.3 });
    this.tone(96, 0.7, { type: 'triangle', vol: 0.45 * k, slide: -50 });
    this.tone(160, 0.45, { type: 'sawtooth', vol: 0.26 * k, slide: -110 });
    this.noise(0.5, { vol: 0.42 * k, freq: 2400, type: 'bandpass', slide: -2000, q: 0.6, delay: 0.01 }); // the air torn behind it
    this.noise(1.6, { vol: 0.38 * k, freq: 1000, type: 'lowpass', slide: -800, delay: 0.02, wet: 0.7 });
    for (const [d, v] of [[0.25, 0.2], [0.55, 0.12], [0.9, 0.07], [1.3, 0.04]]) this.noise(0.6, { vol: v * k, freq: 650, type: 'lowpass', slide: -450, delay: d, wet: 0.5 });
  }

  /**
   * (0.93) Every kind of skill its own sound, by what it is (the cast's fx), and an ultimate (R) heavier: a
   * deep body under it and the hall's reverb. A borrowed skill (D, F) sounds like what it is too.
   */
  skill(fx, slot) {
    const big = slot === 'r';
    const w = big ? 0.45 : 0.15;
    const boom = () => {
      this.tone(55, 0.9, { type: 'sine', vol: 0.55, slide: -25, wet: 0.35 });
      this.noise(0.7, { vol: 0.3, freq: 500, slide: -380, wet: 0.5 });
    };
    switch (fx) {
      case 'cone': // a heavy blade sweeping wide: air, and the ring of steel
        this.noise(0.24, { vol: 0.34, freq: 450, type: 'bandpass', slide: 2600, q: 1.1, wet: w });
        this.tone(330, 0.22, { type: 'triangle', vol: 0.1, slide: -140 });
        this.tone(1250, 0.3, { type: 'sine', vol: 0.05, delay: 0.05 });
        break;
      case 'nova': // a burst all round: a thump and a ring of air thrown out
        this.tone(110, 0.35, { type: 'sine', vol: 0.4, slide: -60 });
        this.noise(0.4, { vol: 0.32, freq: 300, type: 'bandpass', slide: 2000, q: 0.8, wet: w });
        break;
      case 'spin':
        for (let i = 0; i < 3; i++) this.noise(0.16, { vol: 0.2, freq: 600, type: 'bandpass', slide: 2200, q: 1.2, delay: i * 0.12 });
        break;
      case 'dash': // a rush of air
        this.noise(0.26, { vol: 0.3, freq: 3600, type: 'bandpass', slide: -3000, q: 1.2 });
        this.tone(500, 0.18, { type: 'sine', vol: 0.06, slide: -300 });
        break;
      case 'leap': // up: a rising whoosh (the landing has its own boom)
        this.noise(0.45, { vol: 0.3, freq: 300, type: 'bandpass', slide: 2400, q: 1, attack: 0.15, wet: w });
        this.tone(160, 0.5, { type: 'sawtooth', vol: 0.1, slide: 400, attack: 0.2 });
        break;
      case 'line':
      case 'kunai':
      case 'ricochet': // a shot that pierces: a hard crack and a zip down the line
        this.noise(0.05, { vol: 0.4, freq: 4500, type: 'highpass' });
        this.tone(1900, 0.22, { type: 'sawtooth', vol: 0.07, slide: -1500 });
        this.noise(0.3, { vol: 0.2, freq: 2500, type: 'bandpass', slide: -1800, q: 1.4, wet: w });
        break;
      case 'bolt':
      case 'smoulder': // fire: a whoomph and a crackle
        this.noise(0.4, { vol: 0.34, freq: 350, slide: 900, wet: w });
        for (let i = 0; i < 4; i++) this.noise(0.03, { vol: 0.12, freq: 3000 + i * 700, type: 'highpass', delay: 0.05 + i * 0.07 });
        this.tone(140, 0.3, { type: 'sine', vol: 0.18, slide: -60 });
        break;
      case 'orb':
      case 'rimehalo': // frost: a glassy shimmer
        [1760, 2349, 2794].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.07, delay: i * 0.04, wet: 0.4 }));
        this.noise(0.4, { vol: 0.14, freq: 6000, type: 'highpass', wet: 0.3 });
        break;
      case 'zone':
        this.noise(0.6, { vol: 0.22, freq: 250, type: 'bandpass', slide: 600, q: 0.7, attack: 0.1, wet: w });
        this.tone(90, 0.6, { type: 'triangle', vol: 0.18 });
        break;
      case 'meteor': // something heavy called down: a high whistle falling
        this.tone(1800, 0.8, { type: 'sine', vol: 0.09, slide: -1500, wet: 0.4 });
        this.noise(0.8, { vol: 0.18, freq: 2000, type: 'bandpass', slide: -1700, q: 1.2, attack: 0.3 });
        break;
      case 'barrage':
      case 'hurricane': // many shots: a rattle of strings
        for (let i = 0; i < (fx === 'hurricane' ? 7 : 5); i++) this.tone(700 - i * 30, 0.1, { type: 'square', vol: 0.05, slide: -380, delay: i * 0.07 });
        this.noise(0.6, { vol: 0.16, freq: 1500, type: 'bandpass', slide: 1500, q: 0.7, wet: w });
        break;
      case 'strike':
        this.noise(0.12, { vol: 0.36, freq: 1800 });
        this.tone(180, 0.2, { type: 'triangle', vol: 0.25, slide: -100 });
        break;
      case 'fireclones':
        for (let i = 0; i < 3; i++) this.noise(0.3, { vol: 0.2, freq: 400, slide: 1200, delay: i * 0.08 });
        break;
      case 'bastion':
        this.tone(70, 0.7, { type: 'sine', vol: 0.45, slide: -20 });
        this.tone(220, 0.5, { type: 'triangle', vol: 0.12 });
        this.noise(0.4, { vol: 0.2, freq: 800, wet: 0.3 });
        break;
      default:
        return this.cast(slot);
    }
    if (big) boom();
  }

  /**
   * (0.93) The Seraph: a bell's partials, a breath of choir under them, and the hall around it. `power` (0 to
   * 1) for the heavier ones: the wind-up of Descent, the lance.
   */
  seraph(kind) {
    const bell = (f, vol, delay = 0, dur = 1.4) => [1, 2.76, 5.4, 8.93].forEach((m, i) => this.tone(f * m, dur / (1 + i * 0.6), { type: 'sine', vol: vol / (1 + i * 1.3), delay, wet: 0.7 }));
    const choir = (f, dur, vol, delay = 0) => [-9, 0, 7].forEach((d) => this.tone(f, dur, { type: 'sawtooth', vol: vol / 3, detune: d, attack: dur * 0.4, delay, wet: 0.8 }));
    if (kind === 'wind') {
      // a wind-up: light gathering
      choir(220, 0.9, 0.06);
      this.noise(0.8, { vol: 0.1, freq: 3000, type: 'bandpass', slide: 3000, q: 1, attack: 0.6, wet: 0.6 });
    } else if (kind === 'strike') {
      this.noise(0.18, { vol: 0.22, freq: 800, type: 'bandpass', slide: 2800, q: 1, wet: 0.3 });
      bell(880, 0.12, 0.02, 0.8);
    } else if (kind === 'lance') {
      bell(587, 0.22);
      this.noise(0.4, { vol: 0.3, freq: 5000, type: 'highpass', wet: 0.6 });
      this.tone(1175, 0.6, { type: 'sawtooth', vol: 0.06, slide: -400, wet: 0.5 });
      this.tone(73, 0.8, { type: 'sine', vol: 0.4, slide: -20 });
    } else if (kind === 'wings') {
      this.noise(0.5, { vol: 0.4, freq: 250, type: 'bandpass', slide: 1600, q: 0.7, wet: 0.5 });
      this.tone(98, 0.6, { type: 'sine', vol: 0.45, slide: -40 });
      bell(659, 0.14, 0.08);
      choir(330, 1.2, 0.07, 0.05);
    } else if (kind === 'rise') {
      this.noise(0.55, { vol: 0.3, freq: 300, type: 'bandpass', slide: 3200, q: 0.9, attack: 0.2, wet: 0.5 });
      bell(784, 0.12, 0.1);
    } else if (kind === 'glide') {
      this.noise(0.35, { vol: 0.25, freq: 2500, type: 'bandpass', slide: -1800, q: 1.2, wet: 0.4 });
      bell(1175, 0.07);
    } else if (kind === 'descent') {
      this.tone(41, 1.8, { type: 'sine', vol: 0.9, slide: -15, wet: 0.4 });
      this.noise(1.2, { vol: 0.5, freq: 700, slide: -550, wet: 0.7 });
      bell(392, 0.3);
      bell(523, 0.2, 0.12);
      choir(196, 2.2, 0.12, 0.05);
      choir(294, 2.2, 0.08, 0.05);
    }
  }
  /** Steady Breath (0.42): a slow breath in, and a low hum as the world goes quiet. */
  breath() {
    this.noise(0.7, { vol: 0.13, freq: 350, type: 'bandpass', slide: 700, q: 1.2 });
    this.tone(110, 0.9, { type: 'sine', vol: 0.12, slide: 10, attack: 0.25 });
    this.tone(880, 0.6, { type: 'sine', vol: 0.05, delay: 0.35, attack: 0.1 });
  }
  /** A Reflective elite's mirror cracks (0.42). */
  mirrorCrack() {
    this.tone(2600, 0.08, { type: 'sine', vol: 0.12, slide: -600 });
    this.noise(0.08, { vol: 0.12, freq: 5000, type: 'highpass' });
  }
  impact() {
    // (0.93) heavier, and the ground's echo
    this.tone(58, 0.9, { type: 'sine', vol: 0.75, slide: -32, wet: 0.3 });
    this.tone(120, 0.4, { type: 'triangle', vol: 0.25, slide: -70 });
    this.noise(0.6, { vol: 0.55, freq: 900, slide: -700, wet: 0.5 });
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
  shatter() {
    // Breaking ice: a bright crack and a glassy chime.
    this.noise(0.12, { vol: 0.22, freq: 4200, type: 'highpass' });
    this.tone(1760, 0.18, { type: 'triangle', vol: 0.09, slide: -400 });
    this.tone(2640, 0.12, { type: 'sine', vol: 0.05, delay: 0.03 });
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
