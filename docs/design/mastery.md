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
  skill that echoes it (a Rogue's shadow step for an Archer, say), on one extra key. A small Mastery
  tree per class spends points earned on the other classes to strengthen it.

New, harder content, **the Granted**, needs both: crowds whose every attack stuns, and whose attacks
cannot be dodged, only parried, on a tighter window.

## Decisions

| Question | Decision |
| --- | --- |
| What earns Mastery | Each Primordial beaten on a class: 5 per class, 20 in all. The Quiet on a class marks it mastered |
| How alts reach the Deep | An Ember head start: half of the best Ember among your other classes |
| Borrowed skills in the kit | One extra key for one borrowed skill you choose; the Mastery tree strengthens it |
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
| Short of it | Cannot be parried; 90% of your max health and a long Mind-Lock (about 3 seconds) |

Two more mechanics, so it is the *mind* that is gated, not the health bar:

- **Clouded sight**: short of the need, the Granted's attack warnings flicker and fade before the
  hit; at it, they are clear and full length.
- **Mind-Lock chains**: each lock in a row is shorter, with a moment of immunity after; Animus
  shortens every one. Short of the need, the immunity is gone, so a crowd locks you down until
  you fall.

Told early and plainly: the Waygate shows each map's need beside your Animus; entering short of it
shows a warning; the Ex Voto pages say what Dominion does to an unready mind.

## Phases

1. **Mastery, read from the account** (0.63): the quest *The Other Lives*; Mastery and Animus
   worked out from every class's saves (offline and online); the Ember head start for alts; a
   Mastery panel; early warnings about being carried. Animus shows, and is ready for Mind-Locked.
2. **The Granted** (0.64): Mind-Locked on the player (with diminishing returns and immunity), Animus
   shortening it, attacks that can only be parried (tighter window, ping-fair), a new region of
   several maps beyond The Quiet with its own enemy models, rewards worth it.
3. **Borrowed skills** (0.65): one extra key, four borrowed skills (one per source class), a Mastery
   tree per class spending points from the other classes.
