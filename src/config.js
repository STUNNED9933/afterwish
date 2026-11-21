// All the numbers you are most likely to want to tune live here.
// Change a value, run `npm run build`, refresh the page.

export const CONFIG = {
  // (0.61) Sharing a map: for each hero beyond the first in the same copy, enemies come back this much
  // faster (so each can farm a stretch of it), and a boss has this much more health and poise (still
  // faster to kill together: two heroes deal twice as much against 1.7 times the health)
  PARTY_RESPAWN: 0.9,
  PARTY_BOSS_HP: 0.7,
  PARTY_BOSS_POISE: 0.5,
  // (0.60.2) Crimson Reach (Berserker): by level (0 none, 1 Bloodied, 2 Crimson Oath)
  CRESCENT: {
    reach: [0, 6, 9.5], // a swing reaches this far as a red crescent
    width: [0, 0.8, 1.3], // how wide the crescent cuts
    behind: [0, 0.6, 0.8], // what it deals to those behind a target struck at arm's length
    speed: 26,
    grow: [1, 1.35, 1.75], // Cleave's reach and Whirlwind's spin grow this much
    wide: [1, 1.2, 1.4], // and Cleave's arc this much
    close: [0, 0.3, 0.5], // (0.60.3) Red Embrace: basic attacks, Cleave and Whirlwind deal this much more...
    closeAt: 3, // ...to enemies within this far (from their edge)
  },
  TICK: 1 / 60, // the simulation always advances in fixed 1/60s steps
  ARENA_RADIUS: 24,
  // Arena enemies are close to the hero's own level, so the arena stays worth
  // fighting in at any level. What makes later waves harder is this extra
  // health and damage per wave. Arena EXP is reduced: it is the place to farm
  // gold, and exploration is the place to level.
  // (0.25: arena runs are shorter and harder: they ramp about twice as fast as before.)
  ARENA_WAVE_HP: 0.22,
  ARENA_WAVE_DMG: 0.14,
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
  DEFAULT_PARRY_PRESET: 'standard', // (0.61) everyone parries on Standard; the choice is gone
  PARRY_CUE_LEAD: 0.33, // enemies flash this long before their hit lands
  PARRY_BUFFER: 0.2, // pressing parry slightly early (during cooldown) still counts
  PARRY_MOVE_MULT: 0.45, // movement speed while the parry stance is up
  // Mind-Locked (0.64): the Granted's stun. You cannot move, attack or cast; Animus shortens it. A lock
  // "cracks" now and then (first after `first` seconds, then every `every`), for `crack` seconds: press
  // parry inside a crack and you break free. Outside one, it holds `miss` seconds longer. Locks that come
  // close together (within `chain` seconds of the last one ending) are shorter (`dr`), and after one ends
  // you cannot be locked for `immune` seconds, unless you are short of the map's Animus: then nothing
  // stops the next one but your own timing.
  MIND_LOCK: { first: 0.45, every: 0.75, crack: 0.1, miss: 0.3, chain: 3, dr: [1, 0.6, 0.35, 0.2], immune: 2.5 },
  // Dominion (0.64): the Granted's great attacks. With the Animus a map asks, they are parried on the
  // perfect window only, and land for little (plus a short lock). Short of it, only on `frame` seconds
  // after the press (two ticks), and if one lands it takes `short` of your max health, nothing reduces
  // it, rolling through it does not help, and the lock is long.
  DOMINION: { frame: 0.034, short: 0.9, lock: 0.8, lockShort: 4 },
  // The Will (0.68; 0.69): what filters out those short of the Animus. While you are short of it and
  // within `range` of anything that asks for it (Caelum, the Echo Ring from wave 50), an amber ring follows
  // you every `every` seconds (`first` after it notices you) and strikes twice: after `windup`, then `gap`
  // later. Each strike is a Dominion that only a perfect parry turns (the ordinary perfect window); rolling
  // does not help. Fail one and it takes 90% of your health and Mind-Locks you (and the second does not
  // come). While it is on you, until `grace` after it ends, everything else hits you `guard` as hard: the
  // test is the parries, not surviving the crowd meanwhile. Those with the Animus are never asked.
  WILL: { range: 24, first: 3, every: [6, 8], windup: 1.3, gap: 0.8, strikes: 2, radius: 2.2, dmg: 10, guard: 0.01, grace: 0.5 },
  PERFECT_HEAL: 0.04, // fraction of max HP restored by a perfect parry
  // 0.28: warrior and mage
  RECKON_PER: 0.25, // Reckoning (Bulwark): Whirlwind deals this much more per stack
  RECKON_MAX: 5,
  RECKON_HP: 0.1, // a stack for every this much of your max health taken
  WARD_DELAY: 5, // Arcane Ward (Mage): seconds without being hurt before it comes back
  WARD_REFILL: 1, // ...and how long it takes to fill
  // 0.28: rewards for the fight in front of you, not the one you have outgrown
  BOSS_FALLOFF: 0.1, // a boss pays this much less for every level you are above it
  BOSS_FALLOFF_MIN: 0.1, // ...down to this
  STREAK_MAX: 5, // tier bosses in a row without being knocked out
  STREAK_LOOT: 0.1, // more loot per streak, on tier II and up
  IDLE_NO_REWARD: 30, // out in the world, after this many seconds with no input your kills pay nothing
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
  // Quest EXP (0.57.5): each quest pays its share of a level 4 times over, measured at your own level
  // (never below the quest's, and no more than QUEST_EXP_LATE above it), so a quest handed in late still moves the bar.
  QUEST_EXP: 4,
  QUEST_EXP_LATE: 10,
  // Pyromancer burns (0.56.3): ten times the stacks, each a fifth as hot, and gaining heat as they pile up
  // (roar: at a full burn every stack burns this much more, in a straight line from none). Applications add
  // ADD times the stacks they name; caps and haste stacks are CAP times theirs.
  BURN: { cap: 10, add: 2, dmg: 0.2, roar: 1 },
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
  CD_FLOOR: 1, // (0.50) no ability cooldown goes below this; haste past it makes the ability stronger (world.js overflowMult)

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
  // 0.32: lifesteal heals at most this share of max health per second (it fills back at that rate,
  // holding one second's worth), so a single huge hit late in the game cannot heal you to full.
  LIFESTEAL_RATE: 0.15,
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
  EXP_PACE: 4, // 2 = levelling takes twice as many kills, 0.5 = half as many (4 since 0.49: kills pay 2x to 10x by level band)
  BAG_SIZE: 24,
  MAX_POTIONS: 3,
  POTION_HEAL: 0.35,
  POTION_COOLDOWN: 8,

  // --- Exploration mode -------------------------------------------------
  TOWN_HEAL: 0.08, // fraction of max health restored per second in town
  AGGRO_RANGE: 11, // enemies notice you this close
  LEASH_RANGE: 30, // ... and give up at once this far from where they live
  PATIENCE_RANGE: 12, // past this far from home, an enemy starts losing patience...
  PATIENCE_TIME: 5, // ...and gives up after this many seconds out there (it heals on the walk home)
  PATIENCE_RANGE_BOSS: 22, // bosses fight over more ground (Doom keeps you moving, 0.28)...
  PATIENCE_TIME_BOSS: 8, // ...and give it longer
  LEASH_RANGE_BOSS: 45, // a boss's hard leash
  RESPAWN_TIME: 25, // seconds before a killed enemy returns
  PORTAL_TIME: 0.9, // seconds you must stand in a portal before it takes you
  WANDER_RANGE: 4, // idle enemies drift this far from their spot
  EXPLORE_RESPAWN_DELAY: 3, // seconds knocked out before you wake up in town
  TICKET_CHANCE: 0.06, // chance a kill in the wilds drops an arena ticket (big enemies always do)
  START_TICKETS: 0, // a new account starts with no shards: the road first, the Echo Ring once you have found some

  // --- Waves -----------------------------------------------------------
  FIRST_WAVE_DELAY: 3.5,
  INTERMISSION: 5,
  // Skill bonuses for a cleared floor: Flawless (no damage taken) and Swift (under par time).
  // Par is PAR_BASE seconds plus PAR_PER_ENEMY for each enemy on the floor (bosses: PAR_BOSS).
  PAR_BASE: 10,
  PAR_PER_ENEMY: 1.6,
  PAR_BOSS: 40,
  BOSS_EVERY: 5,
  MAX_ATTACKERS: 2, // how many normal enemies may wind up an attack at once
  ATTACK_STAGGER: 0.4, // minimum gap between two enemies starting an attack
  WAVE_CLEAR_HEAL: 0.2,

  // --- Treasure chests out in the world (0.23) --------------------------
  CHESTS_PER_MAP: 2, // plus one more half the time
  CHEST_GILDED: 0.24, // chance a chest is gilded
  CHEST_RADIANT: 0.015, // chance a chest is radiant (0.49: rarer, and richer: Immortal Fragments, Mythic or Ancient gear, a small chance of an Immortal)
  CHEST_RESPAWN: 150, // seconds before an opened chest comes back somewhere else on the map
};
