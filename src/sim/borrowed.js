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
  hpTo: 0.4, hpCap: 0.49, leech: 25, leechFloor: 2, duration: 8, cd: 3, dmg: 0.2, // (0.71.5) under an Oath: lifesteal x25, uncapped (at least 2%), health no higher than 49%
  // health held at 40%; everything you deal +20%. (0.71.2) A toggle: cd is the wait between presses
  sharpshooter: { name: 'Deadeye', text: 'Deadeye fires with no draw, 2.2 times as wide, and deals 40% more.', width: 2.2, mult: 1.4, noChannel: true },
  windrunner: { name: 'Hurricane', text: 'Hurricane looses 3 more arrows, each 50% stronger.', extra: 3, mult: 1.5 },
  assassin: { name: 'Shadowstrike', text: 'Shadowstrike reaches 60% further and deals 50% more, and every ability heals you for 15% of what it deals.', range: 1.6, mult: 1.5, leech: 0.15 },
  shadowdancer: { name: 'Afterimages', text: 'Your afterimages copy your blows at twice the strength, and Starglass Kunai deal 40% more.', copy: 2, kunai: 1.4 },
  pyromancer: { name: 'Cinderfall', text: 'Cinderfall lands at once, 40% wider, for 40% more.', radius: 1.4, mult: 1.4, instant: true },
  frostbinder: { name: 'Rimewall', text: 'Rimewall is half as long again, stuns 50% longer, and Shatter deals 40% more.', length: 1.5, stun: 1.5, shatter: 1.4 },
  none: { name: 'your abilities', text: 'Your abilities deal 25% more.', mult: 1.25 },
};
const bloodOath = {
  name: 'Blood Oath', type: 'bloodoath', icon: 'frenzy', unlock: 1, cd: OATH.cd, toggleCd: OATH.cd, toggle: true, duration: OATH.duration, hpTo: OATH.hpTo, dmg: () => 0,
  desc: `A toggle. Turn it on to drain yourself to ${OATH.hpTo * 100}% health; until you turn it off nothing takes you above ${OATH.hpCap * 100}%, but your lifesteal is ${OATH.leech} times over, with no cap (at least ${OATH.leechFloor}%), so you live by hitting: you deal ${OATH.dmg * 100}% more, and your subclass's signature move goes past its limits.`,
};

/**
 * BORROWED[host class][donor subclass]: the skill that class learns from that subclass.
 *
 * (0.70.5) Made a real second source of damage: every active hits as hard as a big ability, on a short
 * cooldown, over a wide area, and grows with your MAIN skill (scale: Q's rank and the talents and
 * augments on Q, see world.js abilityDamage), so it keeps up with the build. Every Frostbinder borrowing
 * is its reflecting wall (that is the Frostbinder); a Pyromancer's leaves the ground burning.
 */
export const BORROWED = {
  archer: {
    assassin: { name: 'Shadow Shot', type: 'strike', icon: 'strike', unlock: 1, cd: 8, range: 16, gap: true, behind: 0.5, sureCrit: true, dmg: ad(4.0, 50, 12), desc: 'Blink behind an enemy up to 16 m away and loose a point-blank shot that always crits (50% more from behind).' },
    // (0.81.3) was Shade Partner: now Umbra Gemina ("the twin shadow"), a shade that walks with you, and a
    // Sharpshooter's draws Deadeye too
    shadowdancer: { name: 'Umbra Gemina', passive: true, icon: 'veil', apply: (m) => { m.shadeEcho = Math.max(m.shadeEcho || 0, 0.6); m.echoQ = Math.max(m.echoQ || 0, 0.6); m.shadeEye = Math.max(m.shadeEye || 0, 0.6); }, desc: 'Your twin shadow walks at your shoulder, wearing your look. It looses a copy of every basic attack and Q for 60%, and a Sharpshooter\'s shadow draws Deadeye with you: a second Deadeye from where it stands, for 60%. A Windrunner\'s shadow looses Hurricane\'s and Crosswind\'s arrows as one heavier arrow, and when you Skirmish Step it does not hop again: your next shots come two more at once, and harder.' },
    frostbinder: { name: 'Mirror Ice', type: 'wall', icon: 'wall', unlock: 1, cd: 14, range: 14, length: 12, duration: 6, stun: 1.2, rise: 0.8, apply: lendFrost, dmg: ad(3.2, 40, 10), desc: 'Raise a 12 m wall of ice for 6 seconds. Enemy shots that touch it fly back, faster, as yours. It rises hard and, when it shatters, hits and freezes everything beside it.' },
    pyromancer: { name: "Dragon's Breath", type: 'breath', icon: 'smoulder', unlock: 1, cd: 9, range: 10, angle: 1.9, stun: 1.0, burn: 8, linger: 5, lingerRadius: 4.5, apply: lendBurn, dmg: ad(4.2, 50, 12), desc: 'Breathe a great cone of fire, 10 m: it stuns for 1 s, sets heavy burns, and leaves the ground burning for 5 seconds.' },
    berserker: bloodOath,
    bulwark: { name: 'Anchor Shot', type: 'anchor', icon: 'bastion', unlock: 1, cd: 11, range: 16, radius: 7.5, stun: 1.5, dmg: ad(3.6, 40, 10), desc: 'A heavy bolt that drags everything within 7.5 m of where it lands into one place, stuns it for 1.5 s, and hits it.' },
  },
  mage: {
    sharpshooter: { name: 'Elemental Lance', type: 'deadeye', icon: 'deadeye', unlock: 1, cd: 10, range: 34, width: 2.2, channel: 0.4, channelSlow: 0.6, lance: { burn: 14, frost: 8 }, apply: (m) => { lendBurn(m); lendFrost(m); }, dmg: ad(5.5, 60, 14), desc: 'Draw a beam of fire or frost (as your subclass leans, both before it), then loose it through everything in a 34 m line: heavy burns or Hoarfrost on all it pierces.' },
    windrunner: { name: 'Gale Motes', passive: true, icon: 'hurricane', apply: (m) => { m.castMotes = Math.max(m.castMotes || 0, 3); m.castMotesDmg = Math.max(m.castMotesDmg || 0, 0.7); }, desc: 'Every spell you cast also looses 3 homing elemental motes at enemies near you, for 70% spell power each.' },
    berserker: bloodOath,
    bulwark: { name: 'Gravity Anchor', passive: true, icon: 'bastion', apply: (m) => { m.rGravity = Math.max(m.rGravity || 0, 9); m.wGravity = Math.max(m.wGravity || 0, 6); m.gravityVuln = Math.max(m.gravityVuln || 0, 0.25); }, desc: 'Your R drags every enemy within 9 m of where it lands into its centre first (your W, within 6 m) and stuns them for 1.5 s. What is dragged takes 25% more from you for 5 seconds.' },
    assassin: { name: 'Blink Strike', type: 'blink', icon: 'veil', unlock: 1, cd: 7, range: 14, empower: 2.0, burst: 4, dmg: ad(2.5, 30, 8), desc: 'Vanish and appear behind the enemy nearest your cursor (up to 14 m), bursting for damage around you. Your next spell deals twice as much and always crits.' },
    shadowdancer: { name: 'Echo Caster', passive: true, icon: 'kunai', apply: (m) => { m.echoQ = Math.max(m.echoQ || 0, 0.75); }, desc: 'A shade beside you casts your Q again a moment after you do, for 75%.' },
  },
  warrior: {
    sharpshooter: { name: 'Javelin', type: 'line', icon: 'line', unlock: 1, cd: 7, range: 22, width: 1.6, far: 1, dmg: ad(3.6, 40, 10), desc: 'Hurl a javelin through everything in a line, 22 m. The further it flies before it hits, the harder: up to twice as hard at the end.' },
    windrunner: { name: 'Gale Steps', passive: true, icon: 'hurricane', apply: (m) => { m.asMult *= 1.25; m.wTornado = Math.max(m.wTornado || 0, 4); m.wTornadoDmg = Math.max(m.wTornadoDmg || 0, 0.5); }, desc: '+25% attack speed, and every Whirlwind leaves a tornado behind that cuts what is in it (50% attack damage twice a second) for 4 seconds.' },
    assassin: { name: 'Shadow Lunge', type: 'strike', icon: 'strike', unlock: 1, cd: 8, range: 12, gap: true, behind: 0.5, execute: 0.3, dmg: ad(4.0, 50, 12), desc: 'Lunge behind an enemy up to 12 m away and strike: 50% more from behind, and double if it is below 30% health.' },
    shadowdancer: { name: 'Mirror Blade', passive: true, icon: 'kunai', apply: (m) => { m.echoQ = Math.max(m.echoQ || 0, 0.75); }, desc: 'A shade at your back swings your Cleave again a moment after you do, for 75%.' },
    pyromancer: { name: 'Ember Brand', passive: true, icon: 'smoulder', apply: (m) => { lendBurn(m); m.qBurn = Math.max(m.qBurn || 0, 2); m.wBurn = Math.max(m.wBurn || 0, 2); m.wBurning = Math.max(m.wBurning || 0, 0.4); }, desc: 'Cleave and Whirlwind set heavy burns on everything they hit, and Whirlwind deals 40% more to burning enemies.' },
    frostbinder: { name: 'Glacier Spin', passive: true, icon: 'wall', apply: (m) => { lendFrost(m); m.wFrostSpin = Math.max(m.wFrostSpin || 0, 1.5); m.wFrost = Math.max(m.wFrost || 0, 2); }, desc: 'Your Whirlwind is a Rimewall turned round you: while you spin (and for 1.5 s after a Whirlwind), every enemy shot that comes near flies back, faster, as yours, and every Whirlwind hit gives 2 Hoarfrost, freezing what fills up, as a Frostbinder does. A Bulwark\'s Hold the Line freezes everything it drags in at once and turns shots back for as long as it holds.' }, // (0.71.4) was Glacier Wall; (0.71.6) Bulwark
  },
  rogue: {
    sharpshooter: { name: 'Long Kunai', type: 'kunai', icon: 'kunai', unlock: 1, cd: 6, range: 26, speed: 46, width: 1.2, seek: 10, mark: 0.25, dmg: ad(3.4, 40, 10), desc: 'Throw a starglass kunai a long way (26 m). What it hits is Marked: it takes 25% more damage from everyone for 5 seconds.' },
    windrunner: { name: 'Tailwind Daggers', passive: true, icon: 'hurricane', apply: (m) => { m.daggerEvery = 2; m.daggerCount = Math.max(m.daggerCount || 0, 3); m.daggerDmg = Math.max(m.daggerDmg || 0, 0.6); }, desc: 'Every second attack throws 3 homing daggers at enemies near your target, for 60% attack damage each.' },
    berserker: bloodOath,
    bulwark: { name: 'Smoke Snare', type: 'snare', icon: 'bastion', unlock: 1, cd: 11, radius: 8, stun: 1.5, dmg: ad(3.0, 35, 9), desc: 'Burst into smoke: everything within 8 m is dragged to you, hit, and stunned for 1.5 s (and so Exposed to you).' },
    // (0.81.3) Fire Bomb became Ember Clones, Glass Ward became Rime Halo
    pyromancer: { name: 'Ember Clones', type: 'fireclones', icon: 'smoulder', unlock: 1, cd: 10, count: 3, strikes: 4, speed: 20, seek: 11, burn: 2, burst: 2.6, life: 4.5, apply: (m) => { lendBurn(m); m.hitBurn = Math.max(m.hitBurn || 0, 1); }, dmg: ad(0.85, 10, 2.6), desc: 'Three clones of you, made of fire, fly out at the nearest enemies. Each strikes four times, leaping to a new enemy after every blow, and sets 2 burns with each strike. Its last blow bursts over 2.6 m. Passive while slotted: your blows set burns.' },
    frostbinder: { name: 'Rime Halo', type: 'rimehalo', icon: 'wall', unlock: 1, cd: 12, radius: 4.5, duration: 6, tick: 0.5, burst: 2.4, frost: 2, tickFrost: 1, apply: (m) => { lendFrost(m); m.hitFrost = Math.max(m.hitFrost || 0, 1); }, dmg: ad(0.55, 7, 1.7), desc: 'A ring of rime, 4.5 m, round you and round each of your Shadows, for 6 seconds. Nothing stops you walking through it, but enemy shots that cross it fly back, faster, as yours. It bursts when it forms (2 Hoarfrost) and cuts everything inside it twice a second (1 Hoarfrost each time). Passive while slotted: your blows give Hoarfrost.' },
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
