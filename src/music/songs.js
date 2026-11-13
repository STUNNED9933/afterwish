// The soundtrack, written as data. Every theme here is an original piece
// composed for this game: a melody, a chord for each bar, and a "style" that
// says how the band accompanies it. arrange() turns that into a list of notes
// for the player in music/player.js. There are no audio files.
//
// Melody notation, one string per bar: "NOTE:LENGTH ..." where LENGTH is in
// sixteenth notes and a bar holds 16. "r" is a rest. Example: "A4:4 C5:4 F5:8".
// Chords, one per bar ("F", "Dm", "C7", "F/A"); two in a bar share it ("G A").
//
// style:
//   lead   who plays the melody: flute | oboe | brass | square | bell
//   pad    sustained chords: strings | organ | null
//   arp    broken chords: harp8 (eighth notes) | harp16 | null
//   arpInst  what plays them: harp (default) | bell
//   bass   half | walk | eighth | drive
//   stabs  short repeated string chords under the tune (true / false)
//   drums  null | soft | march | battle | timpani | hand

export const SONGS = {
  // Haven: warm and unhurried. F major.
  haven: {
    name: 'Hearth of Haven', bpm: 84,
    style: { lead: 'flute', pad: 'strings', arp: 'harp8', bass: 'half', stabs: false, drums: null },
    chords: ['F', 'C/E', 'Dm', 'Bb', 'F/A', 'Bb', 'Gm', 'C', 'Dm', 'Am', 'Bb', 'F/A', 'Gm', 'Dm', 'Bb', 'C'],
    melody: [
      'A4:4 C5:4 F5:6 E5:2', 'D5:4 C5:4 G4:8', 'F4:4 A4:4 D5:6 C5:2', 'Bb4:4 A4:2 G4:2 F4:8',
      'A4:4 C5:4 F5:4 G5:4', 'A5:6 G5:2 F5:4 D5:4', 'Bb4:4 D5:4 G5:4 F5:2 E5:2', 'E5:6 D5:2 C5:8',
      'D5:6 E5:2 F5:4 A5:4', 'G5:4 E5:4 C5:8', 'D5:4 F5:4 Bb5:6 A5:2', 'A5:4 G5:2 F5:2 C5:8',
      'Bb4:4 D5:4 G5:8', 'F5:4 E5:2 D5:2 A4:8', 'Bb4:4 C5:4 D5:4 F5:4', 'E5:8 C5:4 r:4',
    ],
  },

  // Greenwood Trail: setting out on the road. D major with a borrowed C chord.
  greenwood: {
    name: 'The Road Out', bpm: 122,
    style: { lead: 'brass', pad: 'strings', arp: 'harp8', bass: 'walk', stabs: true, drums: 'march' },
    chords: ['D', 'D', 'C', 'G', 'D', 'A/C#', 'Bm', 'G A', 'Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'A'],
    melody: [
      'D5:6 A4:2 D5:4 E5:4', 'F#5:8 E5:4 D5:4', 'E5:6 C5:2 E5:4 G5:4', 'G5:4 F#5:2 E5:2 D5:8',
      'D5:6 A4:2 D5:4 E5:4', 'F#5:4 A5:4 E5:8', 'D5:4 F#5:4 B5:6 A5:2', 'G5:4 B5:4 A5:8',
      'B5:6 A5:2 F#5:4 D5:4', 'G5:6 F#5:2 D5:8', 'A5:6 F#5:2 A5:4 D6:4', 'C#6:4 B5:2 A5:2 E5:8',
      'B5:6 A5:2 F#5:4 D5:4', 'E5:4 G5:4 B5:8', 'G5:4 F#5:4 E5:4 G5:4', 'A5:8 E5:4 A4:4',
    ],
  },

  // Spitter Fen: slow, watchful, a little uneasy. E minor.
  fen: {
    name: 'Still Water', bpm: 72,
    style: { lead: 'oboe', pad: 'strings', arp: 'harp8', bass: 'half', stabs: false, drums: 'soft' },
    chords: ['Em', 'Em', 'C', 'B7', 'Em', 'Am', 'F', 'B7', 'Am', 'Em', 'C', 'G', 'Am', 'Em', 'F', 'B'],
    melody: [
      'r:4 B4:4 E5:6 D5:2', 'B4:8 G4:8', 'r:4 C5:4 E5:6 D5:2', 'D#5:8 B4:8',
      'r:4 B4:4 E5:4 G5:4', 'A5:6 G5:2 E5:8', 'F5:4 A5:4 C6:6 A5:2', 'B5:8 F#5:8',
      'C6:6 B5:2 A5:4 E5:4', 'G5:8 E5:8', 'E5:4 G5:4 C6:6 B5:2', 'B5:4 A5:2 G5:2 D5:8',
      'C5:4 E5:4 A5:8', 'G5:4 F#5:2 E5:2 B4:8', 'A4:4 C5:4 F5:4 A5:4', 'F#5:8 D#5:8',
    ],
  },

  // Ashen Ridge: tense and driving. D minor.
  ridge: {
    name: 'Cinder March', bpm: 132,
    style: { lead: 'brass', pad: 'strings', arp: null, bass: 'eighth', stabs: true, drums: 'timpani' },
    chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'F', 'Gm', 'A', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A', 'A'],
    melody: [
      'D5:4 r:2 D5:2 F5:4 E5:4', 'D5:8 A4:8', 'D5:4 r:2 D5:2 F5:4 G5:4', 'E5:8 C5:4 E5:4',
      'F5:4 r:2 F5:2 A5:4 G5:4', 'F5:6 E5:2 C5:8', 'D5:4 G5:4 Bb5:6 A5:2', 'A5:8 E5:4 C#5:4',
      'Bb5:6 A5:2 F5:4 D5:4', 'C6:6 Bb5:2 G5:4 E5:4', 'A5:4 D6:4 A5:4 F5:4', 'D5:12 r:4',
      'Bb5:6 A5:2 F5:4 D5:4', 'C6:6 Bb5:2 G5:4 C6:4', 'C#6:8 A5:4 E5:4', 'A5:12 r:4',
    ],
  },

  // Warden's Keep: heavy and solemn. C minor. Also plays for the arena boss.
  keep: {
    name: 'The Warden Waits', bpm: 100,
    style: { lead: 'brass', pad: 'organ', arp: 'harp8', bass: 'half', stabs: false, drums: 'timpani' },
    chords: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Bb', 'G', 'Eb', 'Bb', 'Fm', 'Cm', 'Ab', 'Fm', 'G', 'G'],
    melody: [
      'C5:8 Eb5:4 G5:4', 'Ab5:6 G5:2 Eb5:8', 'F5:8 Ab5:4 C6:4', 'B5:6 G5:2 D5:8',
      'C5:8 Eb5:4 G5:4', 'C6:6 Bb5:2 Ab5:8', 'Bb5:6 Ab5:2 F5:4 D5:4', 'G5:8 B4:4 D5:4',
      'G5:6 Bb5:2 Eb6:8', 'D6:6 C6:2 Bb5:4 F5:4', 'Ab5:6 G5:2 F5:4 C5:4', 'Eb5:8 C5:8',
      'C5:4 Eb5:4 Ab5:6 G5:2', 'F5:4 Ab5:4 C6:8', 'B5:6 C6:2 D6:8', 'G5:12 r:4',
    ],
  },

  // Arena: a fast battle theme. A minor.
  arena: {
    name: 'Steel on Steel', bpm: 150,
    style: { lead: 'square', pad: 'strings', arp: null, bass: 'drive', stabs: true, drums: 'battle' },
    chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'F', 'G', 'Em', 'Am', 'F', 'G', 'E', 'E'],
    melody: [
      'A4:2 C5:2 E5:4 A5:4 G5:2 E5:2', 'A5:6 G5:2 E5:8', 'F5:2 A5:2 C6:4 A5:4 F5:4', 'G5:4 B5:4 D6:4 B5:4',
      'A4:2 C5:2 E5:4 A5:4 B5:2 C6:2', 'E6:6 D6:2 C6:4 A5:4', 'F5:4 A5:4 C6:6 B5:2', 'B5:4 G#5:4 E5:8',
      'C6:6 A5:2 F5:4 A5:4', 'D6:6 B5:2 G5:4 B5:4', 'E6:4 B5:4 G5:4 B5:4', 'C6:8 A5:4 E5:4',
      'C6:6 A5:2 F5:4 C6:4', 'D6:6 B5:2 G5:4 D6:4', 'E6:8 D6:4 B5:4', 'G#5:8 E5:4 r:4',
    ],
  },

  // Frostfall Pass: thin air and falling snow. A minor, with bells for the harp.
  frost: {
    name: 'Snowblind', bpm: 76,
    style: { lead: 'flute', pad: 'strings', arp: 'harp8', arpInst: 'bell', bass: 'half', stabs: false, drums: null },
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E', 'F', 'G', 'Em', 'Am', 'F', 'Dm', 'E', 'Am'],
    melody: [
      'E5:8 A5:6 G5:2', 'F5:4 A5:4 C6:8', 'G5:6 E5:2 C5:8', 'D5:4 G5:4 B5:8',
      'E5:8 A5:6 B5:2', 'C6:6 A5:2 F5:8', 'D5:4 F5:4 A5:6 G5:2', 'G#5:8 E5:8',
      'A5:6 C6:2 F6:8', 'D6:6 B5:2 G5:8', 'E5:4 G5:4 B5:6 A5:2', 'A5:8 E5:4 C5:4',
      'F5:4 A5:4 C6:6 A5:2', 'D5:4 F5:4 A5:8', 'G#5:4 B5:4 E6:8', 'A5:12 r:4',
    ],
  },

  // Sunscar Dunes: a caravan tune over hand drums. D with a flat second and sixth.
  dunes: {
    name: 'Sunscar', bpm: 108,
    style: { lead: 'oboe', pad: 'strings', arp: null, bass: 'eighth', stabs: true, drums: 'hand' },
    chords: ['D', 'D', 'Eb', 'D', 'Gm', 'Gm', 'Eb', 'D', 'Cm', 'D', 'Gm', 'Eb', 'Cm', 'D', 'Eb', 'D'],
    melody: [
      'D5:4 Eb5:2 F#5:2 G5:4 F#5:2 Eb5:2', 'D5:6 F#5:2 A5:8', 'Bb5:4 A5:2 G5:2 Eb5:8', 'F#5:4 Eb5:4 D5:8',
      'G5:4 A5:2 Bb5:2 D6:4 C6:2 Bb5:2', 'A5:6 G5:2 D5:8', 'Eb5:4 G5:4 Bb5:6 A5:2', 'A5:4 F#5:4 D5:8',
      'C6:4 Eb6:4 D6:6 C6:2', 'D6:4 C6:2 Bb5:2 A5:8', 'Bb5:4 A5:2 G5:2 D5:4 G5:4', 'Eb5:6 G5:2 Bb5:8',
      'C6:4 Bb5:2 A5:2 G5:4 Eb5:4', 'F#5:6 A5:2 D6:8', 'Eb6:4 D6:2 C6:2 Bb5:4 G5:4', 'F#5:8 D5:4 r:4',
    ],
  },

  // Gloomcap Hollow: a music box in the dark. G minor.
  hollow: {
    name: 'Gloomcap Lullaby', bpm: 96,
    style: { lead: 'bell', pad: 'organ', arp: 'harp16', bass: 'walk', stabs: false, drums: 'soft' },
    chords: ['Gm', 'Eb', 'Cm', 'D', 'Gm', 'Bb', 'Eb', 'D', 'Bb', 'F', 'Cm', 'Gm', 'Eb', 'Cm', 'D', 'Gm'],
    melody: [
      'G5:4 Bb5:4 D6:4 Bb5:4', 'Eb6:6 D6:2 Bb5:8', 'C6:4 Eb6:4 G5:4 C6:4', 'A5:6 F#5:2 D5:8',
      'G5:4 Bb5:4 D6:4 F6:4', 'F6:6 D6:2 Bb5:8', 'Eb6:4 G5:4 Bb5:4 Eb6:4', 'D6:8 F#5:4 A5:4',
      'D6:6 F6:2 Bb5:8', 'C6:6 A5:2 F5:8', 'Eb6:4 C6:4 G5:6 Eb5:2', 'D5:4 G5:4 Bb5:8',
      'Eb5:4 G5:4 Bb5:4 Eb6:4', 'C6:4 Eb6:2 D6:2 C6:8', 'A5:4 D6:4 F#6:8', 'G5:12 r:4',
    ],
  },

  // Stormspire Cliffs: running along the edge in a gale. E minor, fast.
  spire: {
    name: 'Thunderhead', bpm: 138,
    style: { lead: 'brass', pad: 'strings', arp: 'harp16', bass: 'drive', stabs: true, drums: 'battle' },
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'G', 'C', 'B', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'B', 'B'],
    melody: [
      'E5:4 G5:2 B5:2 E6:6 D6:2', 'B5:8 G5:4 E5:4', 'C6:4 E6:4 G5:4 C6:4', 'D6:6 A5:2 F#5:8',
      'E5:4 G5:2 B5:2 E6:4 F#6:4', 'D6:6 B5:2 G5:8', 'E6:4 C6:4 G5:6 E6:2', 'D#6:8 B5:4 F#5:4',
      'G5:6 C6:2 E6:8', 'F#6:6 D6:2 A5:8', 'D6:4 B5:4 F#5:4 B5:4', 'E6:8 B5:4 G5:4',
      'G5:2 C6:2 E6:4 C6:4 G5:4', 'A5:2 D6:2 F#6:4 D6:4 A5:4', 'B5:4 D#6:4 F#6:8', 'B5:8 F#5:4 r:4',
    ],
  },

  // Obsidian Maw: slow, heavy, something huge underneath. F sharp minor.
  maw: {
    name: 'Black Glass', bpm: 92,
    style: { lead: 'oboe', pad: 'organ', arp: null, bass: 'eighth', stabs: false, drums: 'timpani' },
    chords: ['F#m', 'F#m', 'D', 'C#', 'F#m', 'A', 'D', 'C#', 'Bm', 'C#', 'D', 'F#m', 'Bm', 'D', 'C#', 'C#'],
    melody: [
      'F#5:8 A5:4 C#6:4', 'B5:6 A5:2 F#5:8', 'D5:4 F#5:4 A5:6 B5:2', 'G#5:8 C#5:4 F5:4',
      'F#5:8 A5:4 C#6:4', 'E6:6 C#6:2 A5:8', 'D6:4 A5:4 F#5:6 D6:2', 'C#6:8 G#5:8',
      'B5:6 D6:2 F#6:8', 'F6:6 C#6:2 G#5:8', 'A5:4 D6:4 F#6:6 E6:2', 'C#6:8 A5:4 F#5:4',
      'B4:4 D5:4 F#5:4 B5:4', 'A5:4 F#5:4 D5:8', 'C#5:4 F5:4 G#5:8', 'C#6:12 r:4',
    ],
  },

  // Starfall Sanctum: the end of the road, wide and strange. C sharp minor.
  sanctum: {
    name: 'Where Stars Fall', bpm: 80,
    style: { lead: 'flute', pad: 'strings', arp: 'harp16', arpInst: 'bell', bass: 'half', stabs: false, drums: 'soft' },
    chords: ['C#m', 'A', 'E', 'B', 'C#m', 'A', 'F#m', 'G#', 'A', 'B', 'G#m', 'C#m', 'A', 'F#m', 'G#', 'C#m'],
    melody: [
      'C#5:4 G#5:4 E6:8', 'C#6:2 E6:2 A5:4 C#6:8', 'B5:4 E5:4 G#5:8', 'F#5:2 B5:2 D#6:4 B5:8',
      'C#5:4 G#5:4 E6:6 F#6:2', 'E6:4 C#6:4 A5:4 E6:4', 'C#6:6 A5:2 F#5:8', 'G#5:4 C6:4 D#6:8',
      'C#6:2 E6:6 C#6:4 A5:4', 'D#6:2 F#6:6 D#6:4 B5:4', 'B5:6 G#5:2 D#5:8', 'E5:4 G#5:4 C#6:8',
      'A5:2 C#6:2 E6:4 C#6:8', 'F#6:6 C#6:2 A5:8', 'G#5:4 C6:4 D#6:4 C6:4', 'C#6:12 r:4',
    ],
  },
};

/** Which theme plays on which exploration map (by the map's `theme`). */
export const MAP_SONG = {
  town: 'haven', forest: 'greenwood', swamp: 'fen', ash: 'ridge', keep: 'keep',
  frost: 'frost', desert: 'dunes', fungal: 'hollow', storm: 'spire', volcano: 'maw', astral: 'sanctum',
};
/** Each arena boss brings a theme of its own. */
export const BOSS_SONG = { boss: 'keep', boss2: 'maw', boss3: 'spire' };

export const BAR = 16; // sixteenth notes in a bar

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C#5" -> MIDI note number (A4 = 69). */
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note: ' + name);
  return SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
export const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], dim: [0, 3, 6] };
/** "F/A" -> { root: pitch class, bass: pitch class, tones: [intervals] } */
export function parseChord(symbol) {
  const m = /^([A-G][#b]?)(m7|maj7|m|7|sus4|dim)?(?:\/([A-G][#b]?))?$/.exec(symbol);
  if (!m) throw new Error('bad chord: ' + symbol);
  const pc = (n) => (SEMITONE[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;
  return { root: pc(m[1]), bass: pc(m[3] || m[1]), tones: QUALITY[m[2] || ''] };
}

/** One bar of melody -> [{ step, dur, midi }] (rests are left out). Throws if the bar is not full. */
export function parseBar(text) {
  const out = [];
  let step = 0;
  for (const tok of text.trim().split(/\s+/)) {
    const [name, len] = tok.split(':');
    const dur = Number(len);
    if (!(dur > 0)) throw new Error('bad length in "' + tok + '"');
    if (name !== 'r') out.push({ step, dur, midi: midi(name) });
    step += dur;
  }
  if (step !== BAR) throw new Error(`bar "${text}" is ${step} sixteenths long, not ${BAR}`);
  return out;
}

const DRUMS = {
  //        1...2...3...4...
  soft: { kick: 'x...............', snare: '................', hat: '....x.......x...', timp: '................' },
  march: { kick: 'x.......x.......', snare: '....x..x....x.xx', hat: 'x.x.x.x.x.x.x.x.', timp: '................' },
  battle: { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', timp: '................' },
  timpani: { kick: 'x.......x.......', snare: '....x.......x...', hat: '................', timp: 'x.....x...x.x...' },
  hand: { kick: 'x.....x...x.....', snare: '....x.......x..x', hat: 'x.xx.xx.x.xx.xx.', timp: '................' },
};

/**
 * Turn a song into the notes every instrument plays.
 * @returns {{ steps: number, stepSeconds: number, events: Array<{step:number, dur:number, midi?:number, inst:string, vol:number}> }}
 */
export function arrange(song) {
  const st = song.style;
  const events = [];
  const add = (step, dur, m, inst, vol) => events.push({ step, dur, midi: m, inst, vol });
  if (song.chords.length !== song.melody.length) throw new Error(song.name + ': chords and melody have different lengths');

  song.melody.forEach((bar, b) => {
    for (const n of parseBar(bar)) add(b * BAR + n.step, n.dur, n.midi, st.lead, 1);
  });

  song.chords.forEach((cell, b) => {
    const parts = cell.split(/\s+/).map(parseChord);
    const len = BAR / parts.length;
    parts.forEach((ch, i) => {
      const at = b * BAR + i * len;
      // Chord tones gathered close around middle C, so the pad does not jump about.
      const voiced = ch.tones.map((t) => {
        let m = 48 + ((ch.root + t) % 12);
        if (m < 53) m += 12;
        return m;
      }).sort((x, y) => x - y);
      const bassNote = 36 + ch.bass + (ch.bass > 7 ? -12 : 0); // keeps the bass between G1 and G2

      if (st.pad) for (const m of voiced) add(at, len, m, st.pad, 1);

      if (st.arp) {
        const div = st.arp === 'harp16' ? 1 : 2;
        const ladder = [...voiced, ...voiced.map((m) => m + 12)];
        const shape = [0, 1, 2, 3, 4, 3, 2, 1];
        for (let s = 0; s < len; s += div) add(at + s, div * 2, ladder[shape[(s / div) % shape.length] % ladder.length] + 12, st.arpInst || 'harp', s === 0 ? 1 : 0.75);
      }

      if (st.stabs) {
        const pair = [voiced[0], voiced[voiced.length - 1]];
        for (let s = 0; s < len; s += 2) if (s % 8 !== 0) for (const m of pair) add(at + s, 1, m, 'stab', s % 4 === 2 ? 1 : 0.7);
      }

      const fifth = bassNote + 7;
      if (st.bass === 'half') {
        for (let s = 0; s < len; s += 8) add(at + s, 8, bassNote, 'bass', 1);
      } else if (st.bass === 'walk') {
        for (let s = 0; s < len; s += 4) add(at + s, 4, (s / 4) % 2 ? fifth : bassNote, 'bass', 1);
      } else if (st.bass === 'eighth') {
        for (let s = 0; s < len; s += 2) add(at + s, 2, bassNote, 'bass', s % 8 === 0 ? 1 : 0.8);
      } else if (st.bass === 'drive') {
        for (let s = 0; s < len; s += 2) add(at + s, 2, (s / 2) % 4 === 3 ? bassNote + 12 : bassNote, 'bass', s % 8 === 0 ? 1 : 0.8);
      }
    });

    const kit = DRUMS[st.drums];
    if (kit) {
      const fill = b % 4 === 3; // a little extra at the end of every fourth bar
      for (let s = 0; s < BAR; s++) {
        if (kit.kick[s] === 'x') add(b * BAR + s, 1, 0, 'kick', 1);
        if (kit.snare[s] === 'x' || (fill && st.drums !== 'soft' && s >= 12 && s % 2 === 0)) add(b * BAR + s, 1, 0, 'snare', s >= 12 && fill ? 0.7 + (s - 12) * 0.08 : 1);
        if (kit.hat[s] === 'x') add(b * BAR + s, 1, 0, 'hat', s % 4 === 0 ? 1 : 0.6);
        if (kit.timp[s] === 'x') add(b * BAR + s, 3, 36 + parts[0].root + (parts[0].root > 7 ? -12 : 0) + 12, 'timp', s === 0 ? 1 : 0.7);
      }
    }
  });

  events.sort((a, b) => a.step - b.step);
  return { steps: song.melody.length * BAR, stepSeconds: 60 / song.bpm / 4, events };
}
