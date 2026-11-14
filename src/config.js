// All the numbers you are most likely to want to tune live here.
// Change a value, run `npm run build`, refresh the page.

export const CONFIG = {
  TICK: 1 / 60, // the simulation always advances in fixed 1/60s steps
  ARENA_RADIUS: 24,
  // Arena enemies are close to the hero's own level, so the arena stays worth
  // fighting in at any level. What makes later waves harder is this extra
  // health and damage per wave. Arena EXP is reduced: it is the place to farm
  // gold, and exploration is the place to level.
  ARENA_WAVE_HP: 0.12,
  ARENA_WAVE_DMG: 0.08,
  ARENA_EXP: 0.5,
  // Melee enemies that are close but cannot catch you speed up, so ranged
  // classes cannot kite them forever. Delay in seconds, then +RATE per second up to +MAX.
  CHASE_RAMP_DELAY: 3,
  CHASE_RAMP_RATE: 0.25,
  CHASE_RAMP_MAX: 0.9,

  // --- Parry -----------------------------------------------------------
  // window:   seconds after pressing parry during which a hit is deflected
  // perfect:  hits landing this soon after the press count as a PERFECT parry
  // cooldown: seconds before you can parry again after a MISSED parry
  //           (a successful parry refunds the cooldown completely)
  PARRY_PRESETS: {
    relaxed: { label: 'Relaxed', window: 0.42, perfect: 0.16, cooldown: 0.95 },
    standard: { label: 'Standard', window: 0.3, perfect: 0.11, cooldown: 1.25 },
    strict: { label: 'Strict', window: 0.18, perfect: 0.07, cooldown: 1.6 },
  },
  DEFAULT_PARRY_PRESET: 'relaxed',
  PARRY_CUE_LEAD: 0.33, // enemies flash this long before their hit lands
  PARRY_BUFFER: 0.2, // pressing parry slightly early (during cooldown) still counts
  PARRY_MOVE_MULT: 0.45, // movement speed while the parry stance is up
  PERFECT_HEAL: 0.04, // fraction of max HP restored by a perfect parry
  PERFECT_CD_REFUND: 1.0, // seconds shaved off ability cooldowns by a perfect parry
  STUN_DAMAGE_BONUS: 1.5, // damage multiplier against stunned enemies

  // --- Perfect parry slows time ---------------------------------------
  // Enemies and their projectiles slow down; you keep moving at full speed.
  PERFECT_SLOW: 1.2, // seconds the slow lasts
  SLOW_FACTOR: 0.3, // slowed things move at 30% speed

  // --- Perfect dodge ---------------------------------------------------
  // Dodging an attack with Breakthrough (E) drops its cooldown to this many seconds.
  DODGE_REFUND_CD: 0.5,

  // --- Ability ranks and augments --------------------------------------
  MAX_RANK: 20,
  RANK_DAMAGE: 0.06, // +6% ability damage per rank above 1
  RANK_COOLDOWN: 0.015, // -1.5% cooldown per rank above 1
  AUGMENT_REROLLS: 1, // free rerolls of an augment offer per run
  TOME_BASE_COST: 300, // gold for the first extra skill point at the trainer
  TOME_COST_GROWTH: 200, // each tome costs this much more than the last

  // --- Player ----------------------------------------------------------
  ATTACK_RANGE: 2.1, // measured from the edge of the enemy
  ACQUIRE_RANGE: 6.5, // idle hero auto-targets enemies this close
  CRIT_MULT: 1.75,
  // Crit chance over 100% is not wasted: each extra 1% becomes +1% crit damage.
  CRIT_OVERFLOW: 0.01,

  // --- Level gap (like MapleStory) ---
  // Enemies above your level hit harder and shrug off more of your damage;
  // enemies below it hit softer and take more. gap = enemy level - hero level.
  ENEMY_DMG: 1.5, // every enemy hits this much harder than before 0.10 (1.3 until 0.17)
  // Damage taken from an enemy above you: +7% per level, plus a part that grows with the
  // square of the gap, so a few levels is a nudge and twenty levels is deadly:
  // about 1.4x at +5, 2x at +10, 3.8x at +20 (most hits take half your health,
  // a heavy one all of it), and at most 5x from about +25.
  GAP_DMG_TAKEN_UP: 0.07,
  GAP_DMG_TAKEN_UP2: 0.0035,
  GAP_DMG_TAKEN_UP_MAX: 4,
  GAP_DMG_TAKEN_DOWN: 0.04, // -4% per level it is below you...
  GAP_DMG_TAKEN_DOWN_MIN: 0.4, // ...down to 40% of normal
  GAP_DMG_DEALT_UP: 0.05, // you deal -5% per level an enemy is above you...
  GAP_DMG_DEALT_UP_MIN: 0.2, // ...down to 20%: a level 1 hero cannot farm level 30s
  GAP_DMG_DEALT_DOWN: 0.02, // +2% per level it is below you...
  GAP_DMG_DEALT_DOWN_MAX: 1.3, // ...up to +30%
  // --- Lifesteal ---
  // Lifesteal heals in full from basic attacks only. Ability hits heal a third as much
  // (an ability that hits ten enemies would otherwise refill you at once), damage over
  // time does not heal at all, and lifesteal above the cap does nothing.
  LIFESTEAL_CAP: 25,
  ABILITY_LIFESTEAL: 0.33,
  MAX_LEVEL: 100,
  SPEC_LEVEL: 15, // level at which you choose a subclass
  TALENT_LEVEL: 16, // first talent point; then one more every TALENT_EVERY levels
  TALENT_EVERY: 4,
  RESPEC_GOLD: 40, // gold per hero level to reset talents and choose again
  BOSS_GOLD: 6, // bosses out in the world pay this many times their normal gold
  BOSS_EXP: 2.5, // ... and this many times their normal EXP
  INTERACT_RANGE: 2.4,
  PARTY_SHARE_RANGE: 30, // party members this close to a kill share its rewards
  PARTY_EXP: 0.75, // ... each getting this much of its EXP (a party of two earns 150% between them)
  PARTY_MAX: 4, // how close you must stand to talk to someone or read a sign
  EXP_PACE: 1, // 2 = levelling takes twice as many kills, 0.5 = half as many
  BAG_SIZE: 24,
  MAX_POTIONS: 3,
  POTION_HEAL: 0.35,
  POTION_COOLDOWN: 8,

  // --- Exploration mode -------------------------------------------------
  TOWN_HEAL: 0.08, // fraction of max health restored per second in town
  AGGRO_RANGE: 11, // enemies notice you this close
  LEASH_RANGE: 24, // ... and give up this far from where they live
  RESPAWN_TIME: 25, // seconds before a killed enemy returns
  PORTAL_TIME: 0.9, // seconds you must stand in a portal before it takes you
  WANDER_RANGE: 4, // idle enemies drift this far from their spot
  EXPLORE_RESPAWN_DELAY: 3, // seconds knocked out before you wake up in town
  TICKET_CHANCE: 0.06, // chance a kill in the wilds drops an arena ticket (big enemies always do)
  START_TICKETS: 3, // arena tickets a new account starts with

  // --- Waves -----------------------------------------------------------
  FIRST_WAVE_DELAY: 3.5,
  INTERMISSION: 8,
  BOSS_EVERY: 5,
  MAX_ATTACKERS: 2, // how many normal enemies may wind up an attack at once
  ATTACK_STAGGER: 0.4, // minimum gap between two enemies starting an attack
  WAVE_CLEAR_HEAL: 0.2,

  // --- Treasure chests out in the world (0.23) --------------------------
  CHESTS_PER_MAP: 2, // plus one more half the time
  CHEST_GILDED: 0.24, // chance a chest is gilded
  CHEST_RADIANT: 0.05, // chance a chest is radiant (12% of those hold an Immortal)
  CHEST_RESPAWN: 150, // seconds before an opened chest comes back somewhere else on the map
};
