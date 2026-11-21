# Mastery: the other lives (design, 0.63+)

Status: phase 1 in progress. Decisions by Ko Ko on 2026-11-21. Content spans several maps, like the base story, with new enemy models (Tripo).

## The idea

After The Quiet (Depth X) the game stops asking you to climb the same ladder again. It asks you to
*master yourself*: beat the Deep's five Primordials on each of the four classes. Every Primordial
beaten on a class is a point of **Mastery** for the whole account. Mastery makes every hero on the
account stronger in two ways:

- **Animus** (a stat; Latin for mind, will): shortens being **Mind-Locked**, the stun the Granted
  inflict (*animus* is Latin for mind and will: the mind that will not be locked). 3% per Mastery point, up to 60% at all 20.
- **Borrowed skills**: once a class is *mastered* (its Quiet beaten), every *other* class learns a
  skill from each of its two subclasses, made to fit the borrower, on D and F (two slotted at a time).
  (0.70; the Mastery tree that was planned was dropped.)

New, harder content, **the Granted**, needs both: crowds whose every attack stuns, and whose attacks
cannot be dodged, only parried, on a tighter window.

## Decisions

| Question | Decision |
| --- | --- |
| What earns Mastery | Each Primordial beaten on a class: 5 per class, 20 in all. The Quiet on a class marks it mastered |
| How alts reach the Deep | An Ember head start: half of the best Ember among your other classes |
| Borrowed skills in the kit | D and F: any two of six (one per subclass of the other classes), unlocked by the Quiet on that class. No Mastery tree (0.70) |
| The Berserker's | A Blood Oath: 40% health, held; +20% damage; the borrower's own subclass signature pushed past its limits |
| Paying for it | Caelum 1.5x health, 1.2x damage on every map (0.70) |
| Being carried | A Primordial counts only if you meet its Ember yourself, or nobody in the fight does (0.62). Warned early and often |
| The stun's name | **Mind-Locked** (clear to read; pairs with Animus, Latin for mind) |
| The stat's name | **Animus** (Latin: will, spirit; "Resolve" is taken by combat power) |
| Parry window vs ping | Tighter than usual, but timed from when the warning appeared on the player's own screen |
| Stun chains | Diminishing returns, and a short immunity after each stun ends |

## Where Mastery comes from (no new storage)

Every class's save already records the Act III quests it has finished, kept through rebirth
(`rebirth.act3`). The Primordial quests map to Depths:

| Quest | Primordial | Depth |
| --- | --- | --- |
| deep2 | The Cinder (Ending) | VI |
| deep3 | The Undertow (Forgetting) | VII |
| deep4 | The Rootmother (Growing) | VIII |
| deep5 | The Choir (Remembering) | IX |
| deep6q | The Stillness (Enough) | X |

So Mastery is read from the account's characters: offline from the browser's saves for each class,
online from the account's characters on the server. Past kills count at once.

## Lore (gameplay first, story wrapped round it)

The Choir sings every voice the star took, "all your yous": every life the wish kept of you, in every
shape. After *Enough*, Wren sends you back down to listen to it properly (**The Other Lives**). The
voices are you as a warrior, an archer, a rogue, a mage; what one of you learned, the others can
remember. Mastering yourself is learning from all of them.

The **Granted** are what the star made of the people whose wishes it answered completely: not
husks, but something more than people. They do not hit you so much as seize your mind (Mind-Locked).
Animus is the will to stand in front of a god.

## Gating by Animus (the Granted's answer to Ember)

The Granted must be impossible without Mastery, and not through numbers (no "your blows barely
land"): through what they *do* to a mind that is not ready. Each map of Caelum asks for an Animus,
the way each Depth asks for Ember, and each hero is judged on their own Animus, so being carried
fails by itself.

| Map | Asks for | Mastery points |
| --- | --- | --- |
| The Sky Road | Animus 15% | 5 |
| The Court of Answers | Animus 30% | 10 |
| The Hall of Wants | Animus 45% | 15 |
| The Zenith | Animus 60% | 20: every class Mastered |

**Dominion**: every Granted's signature attack, too large to step out of. Withstood or not is
decided by your Animus against the map's need:

| Your Animus | A Dominion does |
| --- | --- |
| At or above the need | Parryable on a tight window; small damage and a brief Mind-Lock if it lands |
| Short of it | Parryable only on a near-frame-perfect window; if it lands, 90% of your max health and a long Mind-Lock (about 3 seconds) |

**Never a hard lock with no counterplay** (Ko Ko, 2026-11-21): short of the need it is nearly impossible,
never impossible. A skilled player can parry a Dominion on the tightest window, and a Mind-Lock can be
broken early by a perfectly timed parry press. Some fights are not meant to be won under-prepared, and
winning them anyway is something for others to watch and be inspired by.

Two more mechanics, so it is the *mind* that is gated, not the health bar:

- **Clouded sight**: short of the need, the Granted's attack warnings flicker and fade before the
  hit; at it, they are clear and full length.
- **Mind-Lock chains**: each lock in a row is shorter, with a moment of immunity after; Animus
  shortens every one. Short of the need, the immunity is gone, so a crowd keeps you down, unless
  you break each lock with a perfect parry.

**Exploration first** (Ko Ko, 2026-11-21): unlike the Deep's single boss rooms, every Caelum map is a
full map to explore, like the base story's: roads, camps, side paths, signs and glimmers, an elite or
two, and its boss at the far end. (A later pass may give the Deep the same.)

Told early and plainly: the Waygate shows each map's need beside your Animus; entering short of it
shows a warning; the Ex Voto pages say what Dominion does to an unready mind.

## Phases

1. **Mastery, read from the account** (0.63): the quest *The Other Lives*; Mastery and Animus
   worked out from every class's saves (offline and online); the Ember head start for alts; a
   Mastery panel; early warnings about being carried. Animus shows, and is ready for Mind-Locked.
2. **The Granted** (0.64): Mind-Locked on the player (with diminishing returns and immunity), Animus
   shortening it, attacks that can only be parried (tighter window, ping-fair), a new region of
   several maps beyond The Quiet with its own enemy models, rewards worth it.
3. **Borrowed skills** (shipped 0.70): D and F, six per class (src/sim/borrowed.js), the Blood Oath per
   subclass, the picker in the Mastery panel, Caelum made harder to answer them.

## Shipped in 0.64 (phase 2)

Numbers as built (src/config.js MIND_LOCK and DOMINION, src/sim/endgame.js CAELUM):
- Mind-Lock cracks first at 0.45 s, then every 0.75 s, each open for 0.1 s; a press outside a crack adds
  0.3 s. Chains within 3 s of the last lock: 100%, 60%, 35%, 20%. Immunity after a lock: 2.5 s (only with
  the Animus asked).
- Dominion: with the Animus asked, the perfect window (0.11 s); short of it, 0.034 s (two ticks). A short
  Dominion that lands: 90% of max health, unreduced, rolling does not avoid it, and a 4 s lock before Animus.
- Caelum maps are tier V times their own (health 6.5x to 10x, damage 3x to 3.6x) with no Ember.

## The Will (0.68)

Testing showed Animus was too easy to ignore: a Dominion only came when a Granted happened to use one.
The Will makes the gate unavoidable without making it impossible. Short of a place's Animus, and near
anything asking for it, a ring follows you and lands every 5 to 7 s (CONFIG.WILL): a Dominion, so a
parry within two ticks turns it and nothing else does. Players with the Animus never see it.
