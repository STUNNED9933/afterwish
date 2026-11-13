// Playable classes. Each class is its own character: its own level, gear,
// ability ranks and save. A class is three things:
//   stats      multipliers on the base hero stats (plus flat crit / haste)
//   basic      how the basic attack works (melee reach, or a ranged shot)
//   abilities  the Q W E R kit
//
// Abilities are built from a small set of `type`s that sim/world.js knows how
// to run, so a new ability is usually just numbers:
//   cone    hit everything in a cone toward the cursor      (range, angle)
//   nova    hit everything around the hero                  (radius)
//   dash    move fast toward the cursor, untouchable        (range, duration)
//   leap    jump to the cursor and land with an area hit    (range, radius)
//   line    instant shot that pierces everything in a line  (range, width)
//   bolt    a projectile that bursts on the first enemy     (range, speed, splash)
//   strike  one heavy hit on the enemy nearest the cursor   (range; gap = jump to it)
//   zone    an area at the cursor that keeps hurting        (range, radius, duration)
//   meteor  a delayed blast at the cursor                   (range, radius, delay)
//   orb     drifts to the cursor hurting what it passes, then shatters (range, speed, radius, burst)
// Optional extras on any ability: slow, bleed, stun, knockback, empower.
import { ABILITIES } from './defs.js';

for (const [slot, type] of [['q', 'cone'], ['w', 'nova'], ['e', 'dash'], ['r', 'leap']]) {
  ABILITIES[slot].type = type;
  ABILITIES[slot].icon = slot;
}

export const CLASSES = {
  warrior: {
    name: 'Warrior',
    role: 'Melee · durable',
    blurb: 'Fights up close with wide swings and a leaping finisher. The toughest class, and the more enemies around it the faster its abilities come back.',
    stats: { hp: 1.05, ad: 1.45, as: 1.2, armor: 1, ms: 1.12, crit: 0, haste: 10 },
    basic: { range: 2.1, mult: 1 },
    passive: { name: 'Battle Rhythm', desc: 'Every enemy hit by Cleave or Whirlwind takes 0.3 seconds off your other cooldowns (up to 1.5 seconds per swing). Wade into a crowd and Skyfall comes round again.', rhythm: 0.3, rhythmMax: 1.5 },
    abilities: ABILITIES,
  },

  archer: {
    name: 'Archer',
    role: 'Ranged · basic attacks',
    blurb: 'Shoots from range and attacks fast. Every third shot is a guaranteed crit, and crit chance over 100% becomes extra crit damage.',
    stats: { hp: 0.85, ad: 1.2, as: 1.32, armor: 0.7, ms: 1.05, crit: 8, haste: 0 },
    basic: { range: 9.5, mult: 1, shot: 'arrow', speed: 32 },
    passive: { name: 'Steady Aim', desc: 'Every third basic attack gets +100% crit chance: it always crits, and any crit chance over 100% becomes extra crit damage on that shot.' },
    abilities: {
      q: {
        key: 'Q', name: 'Piercing Shot', type: 'line', icon: 'line', unlock: 1, cd: 5, range: 15, width: 1.4,
        dmg: (s, lvl) => 1.5 * s.ad + 12 + 5 * lvl,
        desc: 'Loose an arrow that pierces every enemy in a line.',
      },
      w: {
        key: 'W', name: 'Barrage', type: 'barrage', icon: 'barrage', unlock: 2, cd: 8, range: 11, count: 5, gap: 0.09,
        dmg: (s, lvl) => 0.55 * s.ad + 2 + 1 * lvl, // per arrow
        desc: 'Loose 5 arrows at one target in quick succession. Each arrow counts as a basic attack: it advances Steady Aim, can be its guaranteed crit, and steals life.',
      },
      e: {
        key: 'E', name: 'Tumble', type: 'dash', icon: 'e', unlock: 3, cd: 9, range: 5.5, minRange: 3, duration: 0.18, width: 0,
        rush: { as: 0.5, time: 4 },
        dmg: () => 0,
        desc: 'Roll toward your cursor, then attack 50% faster for 4 seconds. Nothing can hit you mid-roll.',
      },
      r: {
        key: 'R', name: 'Arrow Storm', type: 'zone', icon: 'zone', unlock: 6, cd: 40, range: 12, radius: 5, duration: 3, tick: 0.5, slow: 0.3, slowDur: 1,
        dmg: (s, lvl) => 3.0 * s.ad + 60 + 14 * lvl,
        desc: 'Rain arrows on an area for 3 seconds, slowing everything inside.',
      },
    },
  },

  rogue: {
    name: 'Rogue',
    role: 'Melee · burst and mobility',
    blurb: 'Fast and fragile. Gets behind enemies, or stuns them with a parry, then bursts them down.',
    stats: { hp: 0.85, ad: 1.05, as: 1.2, armor: 0.75, ms: 1.15, crit: 15, haste: 0 },
    basic: { range: 2.1, mult: 1 },
    passive: { name: 'Opportunist', desc: '+15% crit chance. Backstab hits far harder from behind or on a stunned enemy.' },
    abilities: {
      q: {
        key: 'Q', name: 'Backstab', type: 'strike', icon: 'strike', unlock: 1, cd: 3.5, range: 3.4, behind: 0.6,
        dmg: (s, lvl) => 1.9 * s.ad + 12 + 5 * lvl,
        desc: 'Stab the enemy nearest your cursor. 60% more damage from behind or against a stunned enemy.',
      },
      w: {
        key: 'W', name: 'Fan of Knives', type: 'nova', icon: 'w', unlock: 2, cd: 8, radius: 4.5, knockback: 0, bleed: 0.8,
        dmg: (s, lvl) => 0.9 * s.ad + 10 + 4 * lvl,
        desc: 'Throw knives all around you. Enemies hit bleed for 80% attack damage over 3 seconds.',
      },
      e: {
        key: 'E', name: 'Shadowstep', type: 'dash', icon: 'e', unlock: 3, cd: 6, range: 8.5, minRange: 2, duration: 0.1, width: 0,
        empower: { mult: 1.5, time: 3 },
        dmg: () => 0,
        desc: 'Blink a long way toward your cursor. Your next basic attack deals 50% more.',
      },
      r: {
        key: 'R', name: 'Death Mark', type: 'strike', icon: 'strike', unlock: 6, cd: 30, range: 10, gap: true, behind: 0, refundOnKill: 0.6,
        dmg: (s, lvl) => 3.6 * s.ad + 70 + 16 * lvl,
        desc: 'Leap to the enemy nearest your cursor and strike. A kill gives back 60% of the cooldown.',
      },
    },
  },

  mage: {
    name: 'Mage',
    role: 'Ranged · abilities',
    blurb: 'Weak basic attacks, strong spells on short cooldowns. Keep your distance and aim.',
    stats: { hp: 0.82, ad: 1.22, as: 0.85, armor: 0.65, ms: 1, crit: 0, haste: 25 },
    basic: { range: 8.5, mult: 0.6, shot: 'spark', speed: 26 },
    passive: { name: 'Attunement', desc: '+25 ability haste. Basic attacks deal 60% damage.' },
    abilities: {
      q: {
        key: 'Q', name: 'Fire Bolt', type: 'bolt', icon: 'bolt', unlock: 1, cd: 3, range: 14, speed: 24, splash: 2.2, splashMult: 0.6,
        dmg: (s, lvl) => 1.7 * s.ad + 18 + 6 * lvl,
        desc: 'Hurl a bolt at your cursor. It bursts on the first enemy and scorches others nearby for 60%.',
      },
      w: {
        key: 'W', name: 'Frozen Orb', type: 'orb', icon: 'orb', unlock: 2, cd: 9, range: 13, minRange: 2.5, speed: 8, radius: 2.6, burst: 4.2,
        tick: 0.25, shard: 0.16, chill: 0.3, slow: 0.5, slowDur: 3,
        dmg: (s, lvl) => 1.05 * s.ad + 14 + 5 * lvl,
        desc: 'Send a slow orb of ice drifting to your cursor. Everything it passes is cut by shards and chilled, then it shatters for heavy damage, slowing by 50% and interrupting normal enemies. Press W again to shatter it early.',
      },
      e: {
        key: 'E', name: 'Blink', type: 'dash', icon: 'e', unlock: 3, cd: 9, range: 7.5, minRange: 2, duration: 0.08, width: 0,
        dmg: () => 0,
        desc: 'Teleport toward your cursor.',
      },
      r: {
        key: 'R', name: 'Meteor', type: 'meteor', icon: 'r', unlock: 6, cd: 38, range: 13, radius: 5.5, delay: 0.9, stun: 1,
        dmg: (s, lvl) => 3.8 * s.ad + 80 + 18 * lvl,
        desc: 'Call a meteor onto your cursor. It lands after a moment for heavy damage and a stun.',
      },
    },
  },
};
export const CLASS_IDS = Object.keys(CLASSES);
for (const id of CLASS_IDS) CLASSES[id].id = id;
