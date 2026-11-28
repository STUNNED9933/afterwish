// (1.2) Recorded instruments for the music and the sound effects: the Fluid R3 GM soundfont's flute, strings,
// harp, horn and the rest (tools/sound/samples.py; CC BY 3.0, credited in ASSETS.md), a few notes of each in
// sound/<inst>/<midi>.mp3. A note between two samples is the nearer one played faster or slower. Each instrument
// loads the first time a song asks for it; until then (or if it cannot load, as from file://) the old synthesised
// voice plays instead, so nothing is ever silent.

/** How each instrument is played: one-shot (it rings out by itself), and its envelope. */
const HOW = {
  pizz: { shot: true }, harp: { shot: true }, celesta: { shot: true }, glock: { shot: true }, bells: { shot: true },
  bass: { shot: true }, timp: { shot: true }, taiko: { shot: true }, woodblock: { shot: true }, tom: { shot: true },
  nylon: { shot: true }, tinkle: { shot: true }, cymbal: { shot: true }, breath: { shot: true }, birds: { shot: true },
  strings: { attack: 0.08, release: 0.5 }, tremolo: { attack: 0.06, release: 0.4 }, organ: { attack: 0.03, release: 0.35 },
  choir: { attack: 0.1, release: 0.6 }, cello: { attack: 0.05, release: 0.35 }, contrabass: { attack: 0.04, release: 0.3 },
  flute: { attack: 0.02, release: 0.18 }, recorder: { attack: 0.02, release: 0.15 }, oboe: { attack: 0.02, release: 0.18 },
  horn: { attack: 0.03, release: 0.25 }, trumpet: { attack: 0.02, release: 0.2 }, whistle: { attack: 0.02, release: 0.15 },
  sea: { attack: 0.5, release: 1.5 },
};

export class Sampler {
  constructor(ctx, base = 'sound/') {
    this.ctx = ctx;
    this.base = base;
    this.banks = new Map(); // inst -> [{ midi, buf, gain }] (sorted), once loaded
    this.loading = new Map(); // inst -> Promise
    this.index = null;
    this.ok = typeof fetch === 'function' && !(typeof location !== 'undefined' && location.protocol === 'file:');
  }

  async list() {
    if (this.index) return this.index;
    if (!this.ok) return (this.index = {});
    try {
      const r = await fetch(this.base + 'index.json');
      this.index = r.ok ? await r.json() : {};
    } catch {
      this.index = {};
    }
    return this.index;
  }

  /** Load an instrument (all its notes). Resolves true when it can play. */
  load(inst) {
    if (this.banks.has(inst)) return Promise.resolve(true);
    if (!this.loading.has(inst)) {
      this.loading.set(inst, (async () => {
        const idx = await this.list();
        const notes = idx[inst];
        if (!notes || !notes.length) return false;
        try {
          const bank = await Promise.all(notes.map(async (m) => {
            const r = await fetch(`${this.base}${inst}/${m}.mp3`);
            if (!r.ok) throw new Error(`${inst}/${m}: ${r.status}`);
            const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
            // evened out: every note at the same peak (the mix sets how loud each instrument is)
            let peak = 0;
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i += 7) peak = Math.max(peak, Math.abs(d[i]));
            // (1.2.1) and started where its sound starts: the MP3s carry 5-20 ms of silence first, different per
            // note, which put the recorded notes a little behind the drums and each other (the music sounded uneven)
            let lead = 0;
            while (lead < d.length && Math.abs(d[lead]) < peak * 0.02) lead++;
            return { midi: m, buf, gain: peak > 0.001 ? 0.9 / peak : 1, lead: Math.max(0, lead / buf.sampleRate - 0.002) };
          }));
          this.banks.set(inst, bank.sort((a, b) => a.midi - b.midi));
          return true;
        } catch {
          return false;
        }
      })());
    }
    return this.loading.get(inst);
  }

  ready(inst) {
    return this.banks.has(inst);
  }

  /**
   * Play a note at time `t` for `dur` seconds (a one-shot rings out on its own), `vol` loud, into `dest`.
   * Returns false if the instrument is not loaded (play the synthesised one instead).
   */
  play(inst, midi, t, dur, vol, dest, { rate = 1, attack, release, pan = 0 } = {}) {
    const bank = this.banks.get(inst);
    if (!bank) return false;
    let s = bank[0];
    for (const b of bank) if (Math.abs(b.midi - midi) < Math.abs(s.midi - midi)) s = b;
    const how = HOW[inst] || {};
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12) * rate;
    const g = ctx.createGain();
    const peak = vol * s.gain;
    const a = attack ?? how.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    let end;
    if (how.shot) end = t + Math.min(s.buf.duration / src.playbackRate.value, Math.max(dur, 0.2) + (release ?? 1.2));
    else {
      const rel = release ?? how.release ?? 0.2;
      const hold = t + Math.max(a + 0.01, Math.min(dur, s.buf.duration / src.playbackRate.value - rel));
      g.gain.setValueAtTime(peak, hold);
      g.gain.exponentialRampToValueAtTime(0.0001, hold + rel);
      end = hold + rel;
    }
    if (how.shot) g.gain.setTargetAtTime(0.0001, end - 0.08, 0.03);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(g);
    out.connect(dest);
    src.start(t, Math.min(s.lead || 0, 0.05));
    src.stop(end + 0.05);
    return true;
  }
}
