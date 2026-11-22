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

  // Asterfell (0.39): the naming-day music, still playing. A slow, sweet F major, a little too slow.
  asterfell: {
    name: 'The Naming Day', bpm: 72,
    style: { lead: 'flute', pad: 'organ', arp: 'harp16', arpInst: 'bell', bass: 'half', stabs: false, drums: 'soft' },
    chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'F', 'Gm', 'C', 'Bb', 'F'],
    melody: [
      'A4:6 C5:2 F5:8', 'E5:4 D5:4 C5:8', 'D5:6 F5:2 A4:8', 'Bb4:4 D5:4 F5:4 D5:4',
      'C5:6 A4:2 F4:8', 'G4:4 C5:4 E5:8', 'D5:6 C5:2 Bb4:4 A4:4', 'G4:12 r:4',
      'F5:6 E5:2 D5:8', 'C5:4 E5:4 A5:8', 'G5:6 F5:2 D5:8', 'C5:4 A4:4 F5:8',
      'D5:6 Bb4:2 G4:8', 'E5:4 G5:4 C5:8', 'D5:4 C5:4 Bb4:4 G4:4', 'F4:12 r:4',
    ],
  },
  // The Starwell (0.40): the same naming-day tune, one voice, nearly nothing under it, every other line breaking off.
  starwell: {
    name: 'The Naming Day (the well)', bpm: 60,
    style: { lead: 'bell', pad: 'strings', arp: null, bass: 'half', stabs: false, drums: null },
    chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'F', 'Gm', 'C', 'Bb', 'F'],
    melody: [
      'A4:6 C5:2 F5:8', 'E5:4 D5:4 r:8', 'D5:6 F5:2 A4:8', 'Bb4:4 D5:4 F5:4 r:4',
      'C5:6 A4:2 F4:8', 'G4:4 C5:4 r:8', 'D5:6 C5:2 Bb4:4 A4:4', 'G4:12 r:4',
      'F5:6 E5:2 D5:8', 'C5:4 E5:4 r:8', 'G5:6 F5:2 D5:8', 'C5:4 A4:4 r:8',
      'D5:6 Bb4:2 G4:8', 'E5:4 G5:4 r:8', 'D5:4 C5:4 Bb4:4 G4:4', 'F4:12 r:4',
    ],
  },  // ======================================================================= (0.72) new themes
  // Written in the spirit of the classic JRPGs and MMOs (harp preludes, heroic brass, bright bouncing
  // field tunes), every one an original melody for this game.

  // The Sky Road (Caelum I): out above the clouds at last. Bb major, a bright bounding field tune.
  skyroad: {
    name: 'Above the Clouds', bpm: 128,
    style: { lead: 'bell', pad: 'strings', arp: 'harp16', bass: 'walk', stabs: false, drums: 'bounce' },
    chords: ['Bb', 'F/A', 'Gm', 'Eb', 'Bb', 'F', 'Eb', 'F', 'Gm', 'Dm', 'Eb', 'Bb', 'Cm', 'F', 'Bb', 'F'],
    melody: [
      'D5:2 F5:2 Bb5:4 A5:2 F5:2 C6:4', 'C6:6 Bb5:2 A5:8', 'G5:2 Bb5:2 D6:4 C6:2 Bb5:2 G5:4', 'G5:6 F5:2 Eb5:8',
      'F5:2 Bb5:2 D6:4 F6:4 D6:4', 'C6:4 A5:4 F5:4 A5:4', 'Bb5:4 G5:2 Eb5:2 G5:4 Bb5:4', 'C6:12 r:4',
      'D6:4 Bb5:2 G5:2 D5:4 G5:4', 'F5:2 A5:2 D6:4 C6:4 A5:4', 'G5:2 Bb5:2 Eb6:4 D6:2 C6:2 Bb5:4', 'D6:6 C6:2 Bb5:8',
      'Eb5:2 G5:2 C6:4 Bb5:2 G5:2 Eb6:4', 'D6:4 C6:4 A5:4 F5:4', 'Bb5:2 D6:2 F6:4 D6:2 Bb5:2 F5:4', 'A5:8 C6:4 r:4',
    ],
  },

  // The Court of Answers (Caelum II): every question already decided. D minor, stately and cold.
  answers: {
    name: 'The Decided Court', bpm: 100,
    style: { lead: 'oboe', pad: 'organ', arp: 'harp8', bass: 'walk', stabs: true, drums: 'timpani' },
    chords: ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Gm', 'C', 'F', 'Bb', 'Gm', 'A', 'Dm', 'Gm', 'Bb', 'A', 'A'],
    melody: [
      'D5:4 F5:4 A5:6 G5:2', 'F5:4 E5:4 D5:8', 'D5:2 F5:2 Bb5:4 A5:4 G5:4', 'E5:8 C#5:4 A4:4',
      'D5:4 A5:4 D6:6 C6:2', 'Bb5:4 G5:4 D5:8', 'E5:2 G5:2 C6:4 Bb5:4 G5:4', 'A5:12 r:4',
      'Bb5:6 A5:2 G5:4 F5:4', 'G5:4 Bb5:4 D6:8', 'C#6:6 B5:2 A5:4 E5:4', 'F5:4 E5:4 D5:8',
      'G5:4 Bb5:4 D6:4 Bb5:4', 'F5:4 D5:4 Bb4:8', 'A4:2 C#5:2 E5:4 G5:4 E5:4', 'A5:12 r:4',
    ],
  },

  // The Hall of Wants (Caelum III): soft carpets and too much gold. E minor, slinking.
  wants: {
    name: 'Everything You Asked For', bpm: 94,
    style: { lead: 'oboe', pad: 'strings', arp: 'harp8', arpInst: 'bell', bass: 'eighth', stabs: false, drums: 'hand' },
    chords: ['Em', 'C', 'Am', 'B', 'Em', 'C', 'D', 'B', 'Am', 'D', 'G', 'Em', 'Am', 'C', 'B', 'B'],
    melody: [
      'B4:3 E5:3 G5:2 F#5:4 E5:4', 'G5:3 E5:3 C5:2 E5:8', 'A5:3 G5:3 E5:2 C5:4 A4:4', 'B4:3 D#5:3 F#5:2 A5:8',
      'G5:3 F#5:3 E5:2 B5:8', 'C6:3 B5:3 G5:2 E5:8', 'F#5:3 A5:3 D6:2 C6:4 A5:4', 'B5:12 r:4',
      'C6:4 B5:2 A5:2 E5:8', 'F#5:3 A5:3 D6:2 C6:4 A5:4', 'B5:4 D6:4 G5:8', 'E5:3 G5:3 B5:2 E6:8',
      'E6:3 C6:3 A5:2 E5:8', 'G5:3 E5:3 C5:2 G5:8', 'F#5:3 A5:3 B5:2 D#6:8', 'E6:8 B5:4 r:4',
    ],
  },

  // The Zenith (Caelum IV): the top of everything, the Queen's light. C major, slow and enormous.
  zenith: {
    name: 'Let There Be', bpm: 72,
    style: { lead: 'flute', pad: 'organ', arp: 'harp16', arpInst: 'bell', bass: 'half', stabs: false, drums: 'soft' },
    chords: ['C', 'G/B', 'Am', 'Em', 'F', 'C/E', 'Dm', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'C', 'C'],
    melody: [
      'E4:4 G4:4 C5:8', 'B4:4 D5:4 G4:8', 'A4:4 C5:4 E5:6 D5:2', 'B4:8 G4:8',
      'A4:4 F4:4 C5:8', 'G4:4 E4:4 C4:8', 'D4:4 F4:4 A4:4 C5:4', 'B4:12 r:4',
      'C5:6 B4:2 A4:4 E4:4', 'F4:4 A4:4 C5:4 F5:4', 'E5:6 D5:2 C5:4 G4:4', 'D5:12 r:4',
      'C5:4 A4:4 F4:4 A4:4', 'B4:4 D5:4 G5:8', 'E5:6 D5:2 C5:4 E5:4', 'C5:12 r:4',
    ],
  },

  // The Granted (Caelum's bosses): a hundred lives deep, and they want you to know it. F minor, furious.
  granted: {
    name: 'A Hundred Lives Deep', bpm: 152,
    style: { lead: 'brass', pad: 'strings', arp: 'harp16', bass: 'drive', stabs: true, drums: 'epic' },
    chords: ['Fm', 'Fm', 'Db', 'Eb', 'Fm', 'Ab', 'Bbm', 'C', 'Db', 'Eb', 'Cm', 'Fm', 'Db', 'Bbm', 'C', 'C'],
    melody: [
      'F4:2 F4:2 C5:4 Ab4:2 F4:2 C5:4', 'Db5:4 C5:4 Ab4:4 F4:4', 'F4:2 Ab4:2 Db5:4 F5:4 Db5:4', 'Eb5:6 Db5:2 Bb4:8',
      'C5:2 C5:2 F5:4 Eb5:2 C5:2 Ab4:4', 'Ab4:2 C5:2 Eb5:4 Ab5:8', 'Bb4:4 Db5:4 F5:4 Db5:4', 'E5:8 G5:4 C5:4',
      'Ab4:2 Db5:2 F5:4 Db5:2 Ab4:2 F4:4', 'G4:2 Bb4:2 Eb5:4 G5:8', 'G4:4 C5:4 Eb5:4 G5:4', 'F5:8 C5:4 Ab4:4',
      'Db5:4 F5:4 Ab5:6 G5:2', 'F5:4 Db5:4 Bb4:8', 'C5:2 E5:2 G5:4 Bb5:4 G5:4', 'C6:8 G5:4 E5:4',
    ],
  },

  // The Ashen Deep (Depth VI, the Cinder): heat under the mountain. A minor, slow and smouldering.
  deepash: {
    name: 'Embers Under Everything', bpm: 86,
    style: { lead: 'oboe', pad: 'organ', arp: null, bass: 'eighth', stabs: false, drums: 'timpani' },
    chords: ['Am', 'Am', 'F', 'E', 'Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E', 'Am', 'Dm', 'F', 'E', 'E'],
    melody: [
      'A4:6 C5:2 E5:8', 'D5:4 C5:4 A4:8', 'F5:6 E5:2 C5:8', 'B4:4 G#4:4 E4:8',
      'A4:4 E5:4 A5:6 G5:2', 'F5:4 D5:4 A4:8', 'B4:4 D5:4 G5:6 F5:2', 'E5:12 r:4',
      'F5:6 A5:2 C6:8', 'A5:4 F5:4 D5:8', 'E5:4 G#5:4 B5:6 A5:2', 'A5:8 E5:8',
      'D5:4 F5:4 A5:4 D6:4', 'C6:6 A5:2 F5:8', 'E5:2 G#5:2 B5:4 E6:8', 'E6:12 r:4',
    ],
  },

  // The Drowned Deep (Depth VII, the Undertow): cold water closing over. D minor, bells and slow harp.
  drowned: {
    name: 'Fathoms', bpm: 68,
    style: { lead: 'bell', pad: 'strings', arp: 'harp16', bass: 'half', stabs: false, drums: null },
    chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A', 'Bb', 'F', 'Gm', 'Dm', 'Bb', 'C', 'A', 'A'],
    melody: [
      'D5:4 A5:4 F5:8', 'D5:4 F5:4 Bb5:8', 'A5:4 C6:4 F5:8', 'E5:4 G5:4 C5:8',
      'F5:4 A5:4 D6:8', 'Bb5:4 F5:4 D5:8', 'G5:6 Bb5:2 D6:8', 'C#6:12 r:4',
      'D6:4 Bb5:4 F5:8', 'C6:4 A5:4 F5:8', 'Bb5:4 G5:4 D5:8', 'A5:4 F5:4 D5:8',
      'F5:4 Bb5:4 D6:8', 'E5:4 G5:4 C6:8', 'C#6:4 E6:4 A5:8', 'A5:12 r:4',
    ],
  },

  // The Root Deep (Depth VIII, the Rootmother): something growing in the dark. G minor, hand drums.
  rootdeep: {
    name: 'What Grows Down', bpm: 100,
    style: { lead: 'flute', pad: 'strings', arp: 'harp8', bass: 'walk', stabs: false, drums: 'hand' },
    chords: ['Gm', 'Gm', 'Eb', 'D', 'Gm', 'Cm', 'F', 'Bb', 'Eb', 'Cm', 'D', 'Gm', 'Cm', 'Eb', 'D', 'D'],
    melody: [
      'G4:3 Bb4:3 D5:2 C5:4 Bb4:4', 'A4:4 G4:4 D4:8', 'G4:3 Eb4:3 G4:2 Bb4:8', 'A4:3 F#4:3 D4:2 A4:8',
      'Bb4:3 D5:3 G5:2 F5:4 D5:4', 'Eb5:4 C5:4 G4:8', 'F4:3 A4:3 C5:2 Eb5:8', 'D5:12 r:4',
      'Eb5:4 D5:2 C5:2 Bb4:8', 'G4:3 C5:3 Eb5:2 D5:4 C5:4', 'A4:3 C5:3 D5:2 F#5:8', 'G5:8 D5:8',
      'G4:3 C5:3 Eb5:2 G5:8', 'F5:4 Eb5:4 Bb4:8', 'A4:3 C5:3 F#5:2 A5:8', 'G5:12 r:4',
    ],
  },

  // The Choir Deep (Depth IX): voices with nobody singing them. E minor, organ and a high flute.
  choir: {
    name: 'Many Voices, None', bpm: 64,
    style: { lead: 'flute', pad: 'organ', arp: null, bass: 'half', stabs: false, drums: null },
    chords: ['Em', 'C', 'G', 'D', 'Em', 'Am', 'B', 'B', 'C', 'G', 'Am', 'Em', 'C', 'D', 'B', 'Em'],
    melody: [
      'E5:8 G5:4 B5:4', 'C6:8 B5:4 G5:4', 'D6:8 B5:8', 'A5:8 F#5:8',
      'G5:4 B5:4 E6:8', 'C6:4 A5:4 E5:8', 'F#5:4 A5:4 D#6:8', 'B5:12 r:4',
      'C6:8 E6:4 C6:4', 'B5:8 G5:8', 'A5:4 C6:4 E6:8', 'G5:8 E5:8',
      'E5:4 G5:4 C6:8', 'D6:8 A5:8', 'F#5:4 B5:4 D#6:8', 'E6:12 r:4',
    ],
  },

  // The Quiet (Depth X): almost nothing. B minor, a bell and long rests.
  quiet: {
    name: 'Enough', bpm: 54,
    style: { lead: 'bell', pad: 'strings', arp: null, bass: 'half', stabs: false, drums: null },
    chords: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'F#', 'Bm', 'G', 'D', 'A', 'G', 'Em', 'F#', 'Bm'],
    melody: [
      'B4:8 F#5:8', 'D5:8 r:8', 'A5:8 F#5:8', 'E5:8 r:8',
      'B4:8 D5:4 F#5:4', 'G5:8 r:8', 'E5:8 G5:8', 'F#5:12 r:4',
      'D5:8 B4:8', 'G5:8 r:8', 'F#5:4 A5:4 D6:8', 'C#6:8 r:8',
      'B5:8 G5:8', 'E5:8 r:8', 'C#5:4 F#5:4 A#5:8', 'B5:12 r:4',
    ],
  },

  // The Primordials (Depths VI-IX): the oldest things, woken. C minor, a great dark charge.
  primordial: {
    name: 'Older Than the Wish', bpm: 144,
    style: { lead: 'brass', pad: 'organ', arp: 'harp16', bass: 'drive', stabs: true, drums: 'epic' },
    chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Fm', 'Bb', 'Eb', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Bb', 'G', 'G'],
    melody: [
      'C4:4 G4:4 C5:6 Bb4:2', 'Ab4:2 G4:2 Eb4:4 C4:8', 'C4:2 Eb4:2 Ab4:4 C5:4 Ab4:4', 'B4:6 D5:2 G4:8',
      'C5:2 C5:2 G5:4 F5:2 Eb5:2 C5:4', 'Ab4:4 C5:4 F5:8', 'F5:4 D5:4 Bb4:4 F5:4', 'G5:8 Eb5:4 Bb4:4',
      'Ab4:2 C5:2 Eb5:4 Ab5:4 Eb5:4', 'F5:4 C5:4 Ab4:8', 'G4:2 B4:2 D5:4 G5:4 F5:4', 'Eb5:8 C5:4 G4:4',
      'Eb5:4 Ab5:4 C6:6 Bb5:2', 'Bb5:4 F5:4 D5:8', 'B4:2 D5:2 G5:4 B5:4 G5:4', 'G5:12 r:4',
    ],
  },

  // The Quiet's Stillness (the last Primordial): it does not want to fight. Then it does. E minor.
  stillness: {
    name: 'Wanting Nothing', bpm: 132,
    style: { lead: 'flute', pad: 'organ', arp: 'harp16', arpInst: 'bell', bass: 'drive', stabs: true, drums: 'epic' },
    chords: ['Em', 'C', 'Am', 'B', 'Em', 'C', 'D', 'B', 'C', 'D', 'Bm', 'Em', 'Am', 'C', 'B', 'B'],
    melody: [
      'E4:4 B4:4 G4:4 E5:4', 'E5:6 D5:2 C5:8', 'A4:4 C5:4 E5:6 D5:2', 'D#5:8 B4:8',
      'G4:4 B4:4 E5:4 G5:4', 'G5:6 F#5:2 E5:4 C5:4', 'D5:4 F#5:4 A5:6 G5:2', 'F#5:12 r:4',
      'E5:4 G5:4 C6:6 B5:2', 'A5:4 F#5:4 D5:8', 'D5:4 F#5:4 B5:8', 'G5:8 E5:8',
      'C5:4 E5:4 A5:6 G5:2', 'G5:4 E5:4 C5:8', 'B4:2 D#5:2 F#5:4 B5:4 A5:4', 'B5:12 r:4',
    ],
  },

  // The Herald and the Asker: an ordeal, not a war. G minor, quick strings and brass.
  ordeal: {
    name: 'The Asking', bpm: 140,
    style: { lead: 'brass', pad: 'strings', arp: 'harp16', bass: 'drive', stabs: true, drums: 'battle' },
    chords: ['Gm', 'Gm', 'Eb', 'F', 'Gm', 'Cm', 'D', 'D', 'Eb', 'F', 'Dm', 'Gm', 'Cm', 'Eb', 'D', 'D'],
    melody: [
      'G4:2 Bb4:2 D5:4 C5:2 Bb4:2 G4:4', 'A4:2 Bb4:2 C5:4 Bb4:4 A4:4', 'G4:2 Bb4:2 Eb5:4 D5:4 C5:4', 'F4:2 A4:2 C5:4 F5:8',
      'D5:4 G5:4 F5:2 D5:2 Bb4:4', 'C5:4 Eb5:4 G5:8', 'F#5:4 D5:4 A4:4 D5:4', 'F#5:12 r:4',
      'Eb5:2 D5:2 C5:4 G4:4 C5:4', 'F5:2 Eb5:2 D5:4 A4:4 D5:4', 'F5:4 D5:4 A4:8', 'G4:2 Bb4:2 D5:4 G5:8',
      'G5:4 Eb5:4 C5:4 G4:4', 'Bb4:4 Eb5:4 G5:8', 'F#5:2 A5:2 D6:4 C6:4 A5:4', 'G5:8 D5:4 r:4',
    ],
  },

  // The Echo Ring: wave after wave, and it keeps building. A minor, a bouncing chiptune-bright drive.
  ring: {
    name: 'Echoes Without End', bpm: 150,
    style: { lead: 'square', pad: 'strings', arp: 'harp16', bass: 'drive', stabs: true, drums: 'battle' },
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E', 'F', 'G', 'Em', 'Am', 'Dm', 'F', 'E', 'E'],
    melody: [
      'A4:2 A4:2 E5:2 A4:2 C5:4 E5:4', 'F5:4 E5:4 C5:4 A4:4', 'G4:2 C5:2 E5:2 G5:2 E5:4 C5:4', 'D5:4 B4:4 G4:8',
      'A4:2 C5:2 E5:4 A5:4 G5:4', 'F5:2 E5:2 D5:2 C5:2 A4:8', 'B4:2 D5:2 G5:4 F5:4 D5:4', 'E5:4 G#5:4 B5:8',
      'A5:4 F5:2 C5:2 F5:4 A5:4', 'G5:4 D5:2 B4:2 D5:4 G5:4', 'E5:4 B4:4 G4:4 B4:4', 'A4:2 C5:2 E5:4 A5:8',
      'F5:2 D5:2 A4:4 D5:4 F5:4', 'A5:2 G5:2 F5:4 C5:4 A4:4', 'G#4:2 B4:2 E5:4 G#5:4 B5:4', 'E6:8 B5:4 r:4',
    ],
  },
};

/** Which theme plays on which exploration map (by the map's `theme`). */
export const MAP_SONG = {
  town: 'haven', forest: 'greenwood', swamp: 'fen', ash: 'ridge', keep: 'keep',
  frost: 'frost', desert: 'dunes', fungal: 'hollow', storm: 'spire', volcano: 'maw', astral: 'sanctum', glass: 'asterfell',
  // the Deep (0.54): the mountain's own songs, from far below
  deepash: 'maw', drowned: 'fen', rootdeep: 'hollow', choir: 'sanctum', quiet: 'starwell',
  caelum: 'asterfell', // (0.64) the Granted: the Queen's city's gold, played high
};
/** Each arena boss brings a theme of its own. */
export const BOSS_SONG = { boss: 'keep', boss2: 'maw', boss3: 'spire' };
/** (0.72) A map's own song, by its id, ahead of its theme's. */
export const MAP_ID_SONG = { skyroad: 'skyroad', answers: 'answers', wants: 'wants', zenith: 'zenith', deep6: 'deepash', deep7: 'drowned', deep8: 'rootdeep', deep9: 'choir', deep10: 'quiet' };
/** (0.72) The song for a boss fight on an ordinary map, by the boss (and its kind). */
export const FIGHT_SONG = { herald: 'ordeal', asker: 'ordeal', stillness: 'stillness', boss: 'keep', boss2: 'maw', boss3: 'spire' };
/** (0.72) For kinds of boss with no song of their own: the Granted, and the Primordials. */
export const fightSong = (def, type) => FIGHT_SONG[type] || (def.granted ? 'granted' : def.primordial ? 'primordial' : null);

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
  bounce: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', timp: '................' }, // (0.72) a bright field-tune skip
  epic: { kick: 'x..x..x...x.x...', snare: '....x..x....x...', hat: 'xxxxxxxxxxxxxxxx', timp: 'x.......x...x...' }, // (0.72) the big fights
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
