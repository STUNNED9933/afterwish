// Lacuna: emotes (the hero does something: wave, bow, dance, sit...) and emoticons (a little face or sign in a
// bubble over their head, MapleStory-style). Both are seen by everyone near. Hold T for the emote wheel, Y for
// the emoticons; let go on the one you want (or press its number). The emoticons are drawn here, in code, so
// they look the same on every computer (no emoji font involved).

/** Emotes: `clip` is found on the hero's model by name (exact, or a clip whose name contains it). */
export const EMOTES = [
  { id: 'wave', name: 'Wave', clip: 'greet_02', once: true },
  { id: 'bow', name: 'Bow', clip: 'bow', once: true },
  { id: 'nod', name: 'Nod', clip: 'ual_Yes', once: true },
  { id: 'no', name: 'No', clip: 'ual_Idle_No_Loop', once: true, len: 2.5 },
  { id: 'laugh', name: 'Laugh', clip: 'laugh_01', once: true },
  { id: 'clap', name: 'Clap', clip: 'clap' },
  { id: 'dance', name: 'Dance', clip: 'ual_Dance_Loop' },
  { id: 'sit', name: 'Sit', clip: 'ual_Sitting_Enter', then: 'ual_Sitting_Idle_Loop' },
  { id: 'swagger', name: 'Show off', clip: 'swagger', once: true },
  { id: 'cry', name: 'Cry', clip: 'sob', once: true },
];
export const EMOTE_IDS = EMOTES.map((e) => e.id);

export const EMOTICONS = ['happy', 'laugh', 'love', 'wow', 'sad', 'angry', 'sweat', 'question', 'exclaim', 'music'];
export const EMOTICON_NAMES = { happy: 'Happy', laugh: 'Laugh', love: 'Love', wow: 'Wow', sad: 'Sad', angry: 'Angry', sweat: 'Sweat', question: '?', exclaim: '!', music: 'Music' };

/** The clip on a model for an emote's clip name: exact, else the first whose name contains it. */
export function emoteClip(names, want) {
  if (!want || !names) return null;
  if (names.includes(want)) return want;
  const w = want.toLowerCase();
  return names.find((n) => n.toLowerCase().includes(w)) || null;
}

/** Draw an emoticon into a 2D canvas context, in a size x size square. */
export function drawEmoticon(g, id, size = 128) {
  const s = size / 128;
  g.save();
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // the bubble
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#2a2230';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(64, 58, 52, 48, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath(); // its little tail
  g.moveTo(54, 102); g.lineTo(62, 122); g.lineTo(72, 103);
  g.fillStyle = '#ffffff';
  g.fill();
  g.stroke();
  g.fillStyle = '#ffffff';
  g.fillRect(52, 96, 22, 7);
  const face = (fill = '#ffd34d') => {
    g.fillStyle = fill;
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 58, 34, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#3a2a1a';
  };
  const dot = (x, y, r = 4.5) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const arc = (x, y, r, a0, a1) => { g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
  const cheeks = () => { g.fillStyle = 'rgba(255,110,110,0.55)'; dot(44, 66, 6); dot(84, 66, 6); g.fillStyle = '#3a2a1a'; };
  switch (id) {
    case 'happy':
      face(); dot(52, 50); dot(76, 50); cheeks(); arc(64, 60, 15, 0.2 * Math.PI, 0.8 * Math.PI); break;
    case 'laugh':
      face(); arc(52, 52, 6, Math.PI * 1.1, Math.PI * 1.9); arc(76, 52, 6, Math.PI * 1.1, Math.PI * 1.9);
      g.beginPath(); g.moveTo(48, 62); g.quadraticCurveTo(64, 88, 80, 62); g.closePath(); g.fillStyle = '#7a2a2a'; g.fill(); g.stroke(); break;
    case 'love':
      g.fillStyle = '#ff4a6a'; g.strokeStyle = '#7a1a2a'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(64, 86); g.bezierCurveTo(24, 60, 34, 26, 64, 42); g.bezierCurveTo(94, 26, 104, 60, 64, 86); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; dot(50, 44, 5); break;
    case 'wow':
      face(); dot(52, 48, 5.5); dot(76, 48, 5.5); g.beginPath(); g.ellipse(64, 70, 7, 9, 0, 0, Math.PI * 2); g.fill(); break;
    case 'sad':
      face('#ffd34d'); dot(52, 52); dot(76, 52); arc(64, 80, 13, 1.2 * Math.PI, 1.8 * Math.PI);
      g.fillStyle = '#5ab4ff'; g.beginPath(); g.moveTo(80, 58); g.quadraticCurveTo(86, 70, 80, 74); g.quadraticCurveTo(74, 70, 80, 58); g.fill(); break;
    case 'angry':
      face('#ff7a5a'); g.lineWidth = 4.5; g.beginPath(); g.moveTo(44, 42); g.lineTo(58, 48); g.moveTo(84, 42); g.lineTo(70, 48); g.stroke();
      dot(53, 54); dot(75, 54); arc(64, 80, 12, 1.2 * Math.PI, 1.8 * Math.PI); break;
    case 'sweat':
      face(); g.lineWidth = 4; g.beginPath(); g.moveTo(47, 52); g.lineTo(57, 50); g.moveTo(71, 50); g.lineTo(81, 52); g.stroke();
      g.beginPath(); g.moveTo(52, 70); g.lineTo(76, 70); g.stroke();
      g.fillStyle = '#5ab4ff'; g.strokeStyle = '#2a6aaa'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(90, 28); g.quadraticCurveTo(100, 44, 90, 50); g.quadraticCurveTo(80, 44, 90, 28); g.fill(); g.stroke(); break;
    case 'question':
      g.fillStyle = '#3a6aff'; g.font = '900 78px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 62); break;
    case 'exclaim':
      g.fillStyle = '#ff3a3a'; g.font = '900 78px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 62); break;
    case 'music':
      g.fillStyle = '#7a4aff'; g.strokeStyle = '#7a4aff'; g.lineWidth = 6;
      dot(46, 76, 9); dot(82, 68, 9);
      g.beginPath(); g.moveTo(54, 76); g.lineTo(54, 34); g.lineTo(90, 26); g.lineTo(90, 68); g.stroke();
      g.beginPath(); g.moveTo(54, 44); g.lineTo(90, 36); g.stroke(); break;
    default:
      face();
  }
  g.restore();
}
