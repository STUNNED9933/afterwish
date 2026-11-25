// (0.99) The game's people, out loud. Lines are small MP3s (voice/<f>.mp3, made by tools/voice/make.py) played
// one at a time: a new line waits its turn unless it matters more (pri). Each speaker never says the same
// line twice in a row. What is said also shows (the caller draws the bubble or the feed line).
import { VOICE_LINES } from './voicelines.js';

export class Voice {
  constructor() {
    this.volume = 0.8;
    this.muted = false;
    this.busyUntil = 0; // performance.now() ms
    this.busyPri = 0;
    this.last = new Map(); // speaker+moment -> the file said last
    this.cool = new Map(); // speaker -> when they may chat again (walking past)
    this.audio = null;
  }
  has(who, moment) {
    return !!(VOICE_LINES[who] && VOICE_LINES[who][moment] && VOICE_LINES[who][moment].length);
  }
  /**
   * Say something: `who` (an NPC id, or hero_m / hero_f), `moment` (greet, near, night, ...). pri: 0 chatter,
   * 1 a reply, 2 the big moments (cuts in over anything less). Returns the line said ({ t, d }), or null.
   */
  say(who, moment, pri = 0) {
    const set = VOICE_LINES[who] && VOICE_LINES[who][moment];
    if (!set || !set.length) return null;
    const now = performance.now();
    if (now < this.busyUntil && pri <= this.busyPri) return null;
    const key = who + ':' + moment;
    let pick = set[Math.floor(Math.random() * set.length)];
    if (set.length > 1 && pick.f === this.last.get(key)) pick = set[(set.indexOf(pick) + 1) % set.length];
    this.last.set(key, pick.f);
    if (this.audio) {
      try { this.audio.pause(); } catch {}
    }
    const vol = this.muted ? 0 : this.volume;
    if (vol > 0) {
      try {
        const a = new Audio(`voice/${pick.f}.mp3`);
        a.volume = Math.max(0, Math.min(1, vol));
        a.play().catch(() => {});
        this.audio = a;
      } catch {}
    }
    this.busyUntil = now + (pick.d + 0.4) * 1000;
    this.busyPri = pri;
    return pick;
  }
  /** Is this speaker free to chat as you pass (once in a while each, never over another line)? */
  mayChat(who, every = 40000) {
    const now = performance.now();
    if (now < this.busyUntil || now < (this.cool.get(who) || 0) || now < (this.chatAt || 0)) return false;
    this.cool.set(who, now + every);
    this.chatAt = now + 12000; // and nobody chats more than once in 12 seconds
    return true;
  }
}
