// Borrowed skills (0.70, docs/design/mastery.md): beat the Quiet on a class and every other class of the
// account may borrow from both of its subclasses. Each class has one skill from each subclass of the other
// three classes (six in all) and slots any two on D and F. A skill is a kit entry like Q W E R (see
// classes.js for the types), or a passive: `passive: true` and only `apply(m)`. Any skill may also have
// `apply(m)`, run while it is slotted (a fire or frost skill switches on burns or Hoarfrost for a class that
// has none of its own).
//
// Borrowing from the Berserker is a Blood Oath (type 'bloodoath'): it drains you to 40% health and holds you
// there while it lasts, and in exchange the signature move of your OWN subclass is pushed past its limits
// (OATH below). High risk, high reward.

const ad = (k, flat = 0, lvl = 0) => (s, l) => k * s.ad + flat + lvl * l;

// Burns and Hoarfrost for a class without them (the numbers a Pyromancer or Frostbinder starts with)
export const lendBurn = (m) => { m.burnPerStack = Math.max(m.burnPerStack, 0.15); m.burnPerLevel = Math.max(m.burnPerLevel, 1.5); m.burnMax = Math.max(m.burnMax || 0, 5); m.burnTime = Math.max(m.burnTime || 0, 4); };
export const lendFrost = (m) => { if (!(m.frostMax > 0)) m.frostMax = 6; };

/** What a Blood Oath does for each subclass's signature move, while it holds. */
export const OATH = {
  hpTo: 0.4, duration: 8, cd: 45, dmg: 0.2, // health held at 40%; everything you deal +20%
  sharpshooter: { name: 'Deadeye', text: 'Deadeye fires with no draw, 2.2 times as wide, and deals 40% more.', width: 2.2, mult: 1.4, noChannel: true },
  windrunner: { name: 'Hurricane', text: 'Hurricane looses 3 more arrows, each 50% stronger.', extra: 3, mult: 1.5 },
  assassin: { name: 'Shadowstrike', text: 'Shadowstrike reaches 60% further and deals 50% more, and every ability heals you for 15% of what it deals.', range: 1.6, mult: 1.5, leech: 0.15 },
  shadowdancer: { name: 'Afterimages', text: 'Your afterimages copy your blows at twice the strength, and Starglass Kunai deal 40% more.', copy: 2, kunai: 1.4 },
  pyromancer: { name: 'Cinderfall', text: 'Cinderfall lands at once, 40% wider, for 40% more.', radius: 1.4, mult: 1.4, instant: true },
  frostbinder: { name: 'Rimewall', text: 'Rimewall is half as long again, stuns 50% longer, and Shatter deals 40% more.', length: 1.5, stun: 1.5, shatter: 1.4 },
  none: { name: 'your abilities', text: 'Your abilities deal 25% more.', mult: 1.25 },
};
const bloodOath = {
  name: 'Blood Oath', type: 'bloodoath', icon: 'frenzy', unlock: 1, cd: OATH.cd, duration: OATH.duration, hpTo: OATH.hpTo, dmg: () => 0,
  desc: `Drain yourself to ${OATH.hpTo * 100}% health and stay there for ${OATH.duration} seconds: you deal ${OATH.dmg * 100}% more, and your subclass's signature move goes past its limits.`,
};

/** BORROWED[host class][donor subclass]: the skill that class learns from that subclass. */
export const BORROWED = {
  archer: {
    assassin: { name: 'Shadow Shot', type: 'strike', icon: 'strike', unlock: 1, cd: 14, range: 14, gap: true, behind: 0.5, sureCrit: true, dmg: ad(1.8, 30, 6), desc: 'Blink behind an enemy up to 14 m away and loose a point-blank shot that always crits (50% more from behind).' },
    shadowdancer: { name: 'Shade Partner', passive: true, icon: 'veil', apply: (m) => { m.shadeEcho = Math.max(m.shadeEcho || 0, 0.4); m.echoQ = Math.max(m.echoQ || 0, 0.4); }, desc: 'A shade stands at your shoulder and looses a copy of every basic attack and Q, for 40%.' },
    frostbinder: { name: 'Mirror Ice', type: 'wall', icon: 'wall', unlock: 1, cd: 18, range: 12, length: 7, duration: 4, stun: 0.6, rise: 0.5, apply: lendFrost, dmg: ad(1.4, 20, 4), desc: 'Raise a wall of ice that blocks enemies and sends their shots back. It rises hard, and everything beside it takes Hoarfrost.' },
    pyromancer: { name: "Dragon's Breath", type: 'breath', icon: 'smoulder', unlock: 1, cd: 16, range: 7.5, angle: 1.5, stun: 0.8, burn: 4, linger: 4, lingerRadius: 3.2, apply: lendBurn, dmg: ad(2.2, 30, 6), desc: 'Breathe a great cone of fire: it stuns for 0.8 s, sets burns, and leaves the ground burning for 4 seconds.' },
    berserker: bloodOath,
    bulwark: { name: 'Anchor Shot', type: 'anchor', icon: 'bastion', unlock: 1, cd: 16, range: 14, radius: 5.5, stun: 1.2, dmg: ad(1.8, 25, 5), desc: 'A heavy bolt that drags everything within 5.5 m of where it lands into one place and stuns it for 1.2 s.' },
  },
  mage: {
    sharpshooter: { name: 'Elemental Lance', type: 'deadeye', icon: 'deadeye', unlock: 1, cd: 22, range: 30, width: 1.6, channel: 0.6, channelSlow: 0.6, lance: { burn: 10, frost: 6 }, apply: (m) => { lendBurn(m); lendFrost(m); }, dmg: ad(3.0, 40, 8), desc: 'Draw a beam of fire or frost (as your subclass leans, both before it), then loose it through everything in a line: 10 burn stacks or 6 Hoarfrost on all it pierces.' },
    windrunner: { name: 'Gale Motes', passive: true, icon: 'hurricane', apply: (m) => { m.castMotes = Math.max(m.castMotes || 0, 2); }, desc: 'Every spell you cast also looses 2 homing elemental motes at enemies near you, for 35% spell power each.' },
    berserker: bloodOath,
    bulwark: { name: 'Gravity Anchor', passive: true, icon: 'bastion', apply: (m) => { m.rGravity = Math.max(m.rGravity || 0, 7); }, desc: 'Your R drags every enemy within 7 m of where it lands into its centre first, and stuns them for 1.2 s.' },
    assassin: { name: 'Blink Strike', type: 'blink', icon: 'veil', unlock: 1, cd: 12, range: 12, empower: 1.6, dmg: () => 0, desc: 'Vanish and appear behind the enemy nearest your cursor (up to 12 m). Your next spell deals 60% more and always crits.' },
    shadowdancer: { name: 'Echo Caster', passive: true, icon: 'kunai', apply: (m) => { m.echoQ = Math.max(m.echoQ || 0, 0.5); }, desc: 'A shade beside you casts your Q again a moment after you do, for 50%.' },
  },
  warrior: {
    sharpshooter: { name: 'Javelin', type: 'line', icon: 'line', unlock: 1, cd: 12, range: 18, width: 1.2, far: 1, dmg: ad(1.8, 25, 5), desc: 'Hurl a javelin through everything in a line, 18 m. The further it flies before it hits, the harder: up to twice as hard at the end.' },
    windrunner: { name: 'Gale Steps', passive: true, icon: 'hurricane', apply: (m) => { m.asMult *= 1.15; m.wTornado = Math.max(m.wTornado || 0, 3); }, desc: '+15% attack speed, and every Whirlwind leaves a small tornado behind that cuts what is in it for 3 seconds.' },
    assassin: { name: 'Shadow Lunge', type: 'strike', icon: 'strike', unlock: 1, cd: 12, range: 10, gap: true, behind: 0.5, execute: 0.3, dmg: ad(1.6, 25, 5), desc: 'Lunge behind an enemy up to 10 m away and strike: 50% more from behind, and double if it is below 30% health.' },
    shadowdancer: { name: 'Mirror Blade', passive: true, icon: 'kunai', apply: (m) => { m.echoQ = Math.max(m.echoQ || 0, 0.5); }, desc: 'A shade at your back swings your Cleave again a moment after you do, for 50%.' },
    pyromancer: { name: 'Ember Brand', passive: true, icon: 'smoulder', apply: (m) => { lendBurn(m); m.qBurn = Math.max(m.qBurn || 0, 1); m.wBurning = Math.max(m.wBurning || 0, 0.25); }, desc: 'Cleave sets burns on everything it hits, and Whirlwind deals 25% more to burning enemies.' },
    frostbinder: { name: 'Glacier Slam', type: 'nova', icon: 'wall', unlock: 1, cd: 15, radius: 5, stun: 1.5, freeze: true, apply: lendFrost, dmg: ad(1.6, 25, 5), desc: 'Slam the ground: everything within 5 m is frozen solid for 1.5 s and takes Hoarfrost.' },
  },
  rogue: {
    sharpshooter: { name: 'Long Kunai', type: 'kunai', icon: 'kunai', unlock: 1, cd: 10, range: 24, speed: 44, width: 1, seek: 10, mark: 0.2, dmg: ad(2.0, 25, 5), desc: 'Throw a starglass kunai a long way (24 m). What it hits is Marked: it takes 20% more damage from everyone for 5 seconds.' },
    windrunner: { name: 'Tailwind Daggers', passive: true, icon: 'hurricane', apply: (m) => { m.daggerEvery = 3; }, desc: 'Every third attack throws 2 homing daggers at enemies near your target, for 40% attack damage each.' },
    berserker: bloodOath,
    bulwark: { name: 'Smoke Snare', type: 'snare', icon: 'bastion', unlock: 1, cd: 16, radius: 6, stun: 1.2, dmg: ad(1.2, 20, 4), desc: 'Burst into smoke: everything within 6 m is dragged to you and stunned for 1.2 s (and so Exposed to you).' },
    pyromancer: { name: 'Fire Bomb', type: 'zone', icon: 'smoulder', unlock: 1, cd: 14, range: 12, radius: 3.5, duration: 4, tick: 0.5, burnTick: 1, apply: (m) => { lendBurn(m); m.hitBurn = Math.max(m.hitBurn || 0, 1); }, dmg: ad(2.0, 25, 5), desc: 'Throw a bomb that leaves the ground burning for 4 seconds. Passive while slotted: your blows set burns.' },
    frostbinder: { name: 'Frost Trap', type: 'trap', icon: 'icebolt', unlock: 1, cd: 14, range: 10, radius: 4, trigger: 2.2, freeze: 2, life: 20, apply: (m) => { lendFrost(m); m.hitFrost = Math.max(m.hitFrost || 0, 1); }, dmg: ad(1.4, 20, 4), desc: 'Set a trap: the first enemy to step on it freezes everything within 4 m for 2 seconds. Passive while slotted: your blows give Hoarfrost.' },
  },
};

/** The two slots, and the keys they live on. */
export const BORROW_SLOTS = ['d', 'f'];

/** What `hostCls` may borrow: every subclass of the classes mastered (Quiet beaten) other than its own. */
export function borrowable(hostCls, mastered, SPECS) {
  const out = [];
  for (const spec in SPECS) {
    const S = SPECS[spec];
    if (S.cls === hostCls || !mastered.includes(S.cls) || !(BORROWED[hostCls] && BORROWED[hostCls][spec])) continue;
    out.push(spec);
  }
  return out;
}

/** The kit entry for a borrowed skill in a slot (its key letter filled in). */
export function borrowedKit(hostCls, spec, slot) {
  const b = BORROWED[hostCls] && BORROWED[hostCls][spec];
  if (!b) return null;
  return Object.assign({}, b, { key: slot.toUpperCase(), borrowed: spec, unlock: 1, cd: b.cd || 0 });
}
