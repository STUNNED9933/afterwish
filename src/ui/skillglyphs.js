// (1.3) Skill icons for both games: one glyph per skill, drawn on a 24 by 24 grid in strokes (white, round ends), with
// accent strokes (class "a") in the skill's own colour and soft filled shapes (class "f"). A tile (CSS: .skill-ic in
// Lacuna, .slot in Haven) gives each a dark, lit background and a rim in the same colour, so every icon reads alike:
// what the skill does, at a glance, in the hand of the class that has it.
export const GLYPHS = {
  // ---- blades
  cleave: '<path class="a" d="M3.5 9.5A10 10 0 0 1 17 3.4"/><path d="M5 20l9.5-9.5"/><path d="M14.5 10.5l5-5.2 1 1-5.2 5"/><path d="M7 15.6l3.4 3.4"/><path d="M3.6 20.4l2-2"/>',
  skyfall: '<path d="M12 2.5v11"/><path d="M9 6h6"/><path class="f" d="M10 13.5h4L12 18z"/><path class="a" d="M3 21h18"/><path class="a" d="M5.5 17.6l2 2M18.5 17.6l-2 2M12 19.5V21"/>',
  whirl: '<path class="a" d="M12 4.5a7.5 7.5 0 1 1-7.5 7.5"/><path class="a" d="M12 8.5a3.5 3.5 0 1 0 3.5 3.5"/><path d="M4.5 12L2 9.5M12 4.5L14.5 2"/><path d="M15.5 12l2.2 2.2M8.5 12L6.3 9.8"/>',
  oath: '<path class="f" d="M12 21.2a5.2 5.2 0 0 1-5.2-5.2c0-4 5.2-9.4 5.2-9.4s5.2 5.4 5.2 9.4a5.2 5.2 0 0 1-5.2 5.2z"/><path class="a" d="M7.5 3.5l1.6 2.4M16.5 3.5l-1.6 2.4M12 1.8v3"/><path d="M9.8 16.4a2.3 2.3 0 0 0 2.2 2.2"/>',
  heavy: '<path d="M12 2.5v12.5"/><path d="M8.6 15h6.8M12 15v6"/><path class="a" d="M5 6.5a9 9 0 0 0 0 11M19 6.5a9 9 0 0 1 0 11"/><path class="a" d="M7.6 9a5 5 0 0 0 0 6M16.4 9a5 5 0 0 1 0 6"/>',
  counter: '<path d="M4 4l16 16"/><path d="M20 4L4 20"/><path class="f" d="M12 7.5l1.2 3.3 3.3 1.2-3.3 1.2L12 16.5l-1.2-3.3L7.5 12l3.3-1.2z"/>',
  plunge: '<path d="M12 2v13"/><path d="M8 11l4 4 4-4"/><path class="a" d="M3 20.5h18"/><path class="a" d="M6 17l1.5 2M18 17l-1.5 2"/>',
  breakthrough: '<path d="M3 12h11"/><path class="f" d="M14 7l6 5-6 5z"/><path class="a" d="M3 7.5h5M3 16.5h5"/><path d="M20 4v16"/>',
  // ---- fists
  punch: '<path d="M8 9.2h6.6a3.2 3.2 0 0 1 3.2 3.2v1.8a4 4 0 0 1-4 4h-3.6A3.4 3.4 0 0 1 6.8 14.8v-4.4A1.2 1.2 0 0 1 8 9.2z"/><path d="M6.8 12.4H18M10.4 9.2v3.2M14 9.2v3.2"/><path class="a" d="M1.8 10h2.6M1.8 14h2.6M2.6 18h2.4"/>',
  haymaker: '<path d="M10 9.2h6.6a3.2 3.2 0 0 1 3.2 3.2v1.8a4 4 0 0 1-4 4h-3.6a3.4 3.4 0 0 1-3.4-3.4v-4.4A1.2 1.2 0 0 1 10 9.2z"/><path d="M8.8 12.4H20"/><path class="a" d="M6 6.5a8 8 0 0 0 0 11"/><path class="a" d="M2.5 8.5a6 6 0 0 0 0 7"/>',
  // ---- bows
  shot: '<path d="M4 20L19 5"/><path class="f" d="M15.2 4.2l5.6-1-1 5.6z"/><path class="a" d="M4 16.2l3.8 3.8M6.6 13.6l3.8 3.8"/>',
  ricochet: '<path d="M3 18.5l5.5-9 5 7 6.5-11"/><path class="f" d="M16.8 4.2l4.6-1.2-1 4.7z"/><circle class="a" cx="8.5" cy="9.5" r="1.6"/><circle class="a" cx="13.5" cy="16.5" r="1.6"/>',
  roll: '<circle cx="7" cy="13" r="2.2"/><path d="M3 17.5c3-8.5 10-11.5 17-9.5"/><path class="f" d="M16.5 4.5l4.4 3.6-4.8 2.6z"/><path class="a" d="M2.5 21h7"/>',
  deadeye: '<circle class="a" cx="12" cy="12" r="7.2"/><circle class="f" cx="12" cy="12" r="2.2"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>',
  charged: '<path d="M4 20L18 6"/><path class="f" d="M14.5 5.2l5.6-1.2-1.2 5.6z"/><path class="a" d="M6.5 11a6 6 0 0 1 6.5-6.5M10.5 19.5A6 6 0 0 0 19.5 10.5"/>',
  fan: '<path d="M12 21V8"/><path d="M12 21L5 9.5M12 21l7-11.5"/><path class="f" d="M12 3.6l1.7 4.2h-3.4zM4 5.2l3.3 3.2-3 1.4zM20 5.2l-.3 4.6-3-1.4z"/>',
  pierce: '<path d="M2.5 12h17"/><path class="f" d="M16.5 8.5l5 3.5-5 3.5z"/><path class="a" d="M7 7v10M11 6v12"/>',
  barrage: '<path d="M3 15l9-9M6 19l9-9M10 22l9-9"/><path class="f" d="M9.4 4.6l3.2-.8-.8 3.2zM12.4 8.6l3.2-.8-.8 3.2zM16.4 11.6l3.2-.8-.8 3.2z"/>',
  storm: '<path class="a" d="M5 9.5a7 4 0 0 1 14 0"/><path d="M7 3v6M12 2v8M17 3v6"/><ellipse cx="12" cy="17" rx="7" ry="3.5"/><path class="a" d="M9 17h6"/>',
  // ---- the way out of trouble
  dodge: '<circle cx="15" cy="5" r="2"/><path d="M14.5 8l-2 5.2 3 3V21M12.5 13.2l-3.2 2"/><path d="M15 9.5l3 1.5"/><path class="a" d="M2.5 8h5M1.5 12h5.5M2.5 16h4"/>',
  blink: '<circle class="a" cx="6" cy="17" r="2.6" stroke-dasharray="2 2"/><circle cx="18" cy="7" r="2.6"/><path d="M8 15l7.6-6"/><path class="f" d="M14.2 7.2l3.4 1-2.4 2.6z"/>',
  starwake: '<path d="M3 19c4-1 8-5 18-12"/><path class="f" d="M8 11l1.1 2.4 2.4 1.1-2.4 1.1L8 18l-1.1-2.4L4.5 14.5l2.4-1.1z"/><path class="a" d="M16 15l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  // ---- shadow
  stab: '<path d="M20.5 3.5l-1.2 6-8.3 8.3-5.1-5.1L14.2 4.4z"/><path d="M6 12.6l5.4 5.4"/><path d="M3.2 20.8l3.8-3.8"/><path class="a" d="M17 7l-6 6"/>',
  rites: '<path d="M20.5 3.5l-1.2 6-8.3 8.3-5.1-5.1L14.2 4.4z"/><path d="M3.2 20.8l3.8-3.8"/><path class="f" d="M17.5 15.5a3 3 0 1 1 0 .1zM19.6 21.2l1.6 1.6"/><path class="a" d="M15 17.6l1.3 1.3 2.4-2.6"/>',
  knives: '<path class="a" d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M12 9V2.5M12 15v6.5M9 12H2.5M15 12h6.5M9.9 9.9L5.3 5.3M14.1 14.1l4.6 4.6M14.1 9.9l4.6-4.6M9.9 14.1l-4.6 4.6"/>',
  // ---- spells
  firebolt: '<path class="f" d="M14 3.5c3.6 3.6 5.4 6.3 5.4 9.9a5.4 5.4 0 0 1-10.8 0c0-1.8.9-3.6 1.8-4.5 0 1.8.9 2.7 1.8 2.7 0-2.7 0-5.4 1.8-8.1z"/><path class="a" d="M2 18l5-3M3 22l5.5-4"/>',
  frostorb: '<circle class="f" cx="12" cy="12" r="4.6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19"/>',
  meteor: '<circle class="f" cx="15.5" cy="15.5" r="4.5"/><path class="a" d="M3 3l8.5 8.5M7 2.5l6 6M2.5 7l6 6"/><path d="M14 13.6a2 2 0 0 1 2-1.6"/>',
};

/** Each Lacuna skill (by kit and key) to its glyph. */
export const LACUNA_GLYPH = {
  novice: { basic: 'punch', H: 'haymaker', D: 'dodge' },
  warrior: { basic: 'cleave', Q: 'skyfall', E: 'whirl', R: 'oath', H: 'heavy', D: 'dodge' },
  archer: { basic: 'shot', Q: 'ricochet', E: 'roll', R: 'deadeye', H: 'charged', D: 'dodge' },
};

/** The colours of each class's skills (tile rim and accents). */
export const CLASS_HUE = {
  novice: '#f2dcb8',
  warrior: '#ffb35a',
  archer: '#7fe0ff',
  rogue: '#c49bff',
  mage: '#7fb2ff',
};

/** An icon as markup: `<svg>` with the glyph (falls back to a plain ring). */
export const glyph = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[id] || '<circle cx="12" cy="12" r="7"/>'}</svg>`;
