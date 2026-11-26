# Afterwish — Act IV design: The Lacuna

Copy of the Act IV design doc (claude.ai doc: https://claude.ai/artifact/LUtjeLny7XvXosJg5oFGC3), kept here so
future sessions read it beside the code. The claude.ai doc is the one to edit and comment on; update this copy
when it changes. Written 26 Nov 2026. Status: proposed, awaiting Ko Ko's answers to the open questions.

## Overview

Act IV follows the Unmade home: through the Wishkeep's gate into **the Lacuna**, one seamless land played
entirely over the shoulder, where the hero starts weak again. The Lacuna (Latin: a gap) is the hole that wanting
nothing left behind (keep chapter "Enough"); every stolen wish ends up there. The hero's god-power is made of
wishes (worship, the Eternals, the Seraph) and none of it crosses: they carry only the Hearth's flame.
(Act III is already the Deep in code, `act3`, so this is Act IV.)

## Decisions so far (Ko Ko, 26 Nov 2026)

| Question | Decision |
| --- | --- |
| Who you play | Your own hero (class, subclass, kit cross; power does not) |
| World shape | One seamless region, streamed |
| Progression | Weak start against powerful threats, with perks for having reached Eternal gear |
| Story | Act IV of the main story; also retells the Unwish clearly from the Unmade's side |
| View | Over the shoulder only (proposed) |

## Story

The Unmade are the husks who lay down when the glass broke, still empty, taking others' wishes because they
cannot make their own.

| # | Quest | Given by | Goal | Beat |
| --- | --- | --- | --- | --- |
| 1 | Follow Them Home | Bastian | Follow the retreating Unmade through the gate; relight the first Lantern | Your light goes out at the threshold |
| 2 | What Maren Lost | Maren | Bring home her stolen wish for light from the Unlit Wood | First wish returned (keep bonus) |
| 3 | Fences and Thieves | Hesper | Trail a procession to where the wishes are kept | They are kept like heirlooms, not eaten |
| 4 | The Ones Who Lay Down | Old Ysolde | Read the Unmade's markers in the Fair That Never Ended | Each was someone; Ysolde changes her story |
| 5 | The Hoard | Corwin, Liesl | Climb the mountain of stolen wishes | Its guardian is W., the queen's nurse, the first of the Unmade |
| 6 | Inanis | Wren | Face Inanis in the Hollow | Inanis (Latin: empty) has your shape |

Ending: **Give it all back** (wishes return, the Unmade slowly become settlers; Nights go on with only what is
still lost) or **Keep the hole** (become the Lacuna's warden; harder Lacuna, a title; only after the first ending).

## The Lacuna

About 1 km across, entered from the keep's gate. Zones, darkest toward the centre: the Threshold (tutorial),
the Unlit Wood, the Fair That Never Ended, the Hoard, the Hollow. Lanterns (relit with the Hearth's flame: safe
spot, respawn, fast travel, push back the dark), stolen wishes (brought home for small keep rewards),
processions (break them, the wishes scatter), world events (a Lantern under attack; dark tides).

## Starting weak

**Lumen** 1–40, earned only in the Lacuna (Lanterns most, wishes and events steady, kills small): sets health,
damage and light radius. Crosses: class, subclass, whole kit; **Remembrances** (one per Eternal slot ever owned:
a weaker form of its passive; all five: a brighter flame from Lumen 1); Mastery's borrowed skills and Animus.
Stays outside: gear stats, Immortals, Wishborne, rebirth power, Ember, world tier, the Seraph, the keep's heroes,
outside potions. Light matters: in the dark beyond your light the Unmade hit harder and see you first.

## Threats

Readable tells, then parry or roll; roles (Lantern-eaters, Collectors, Hollowed Knights, Hush-mothers);
roaming Hunters far above your Lumen (hide early, hunt late); a boss per zone; Inanis copies your class kit.
Death (proposed): wake at the last Lantern, carried wishes drop where you fell and fade.

## Technology

| Problem at 1 km | Today | For the Lacuna |
| --- | --- | --- |
| Drawing | Whole map built on arrival | 64 m chunks streamed, ~150 m drawn, fog; instancing per chunk |
| Collisions, paths | Every obstacle checked; one grid per map | Spatial hash; path grid per chunk, lazily |
| Enemies | All simulated every tick | Only within ~80 m of a player wake; others sleep |
| Server | Whole map's state to each player | Interest management: only what is near |

Flat ground first (a height map later). Targets: 60 fps on a mid-range laptop, under 20 KB/s per player. The
deterministic simulation and its cross-browser tests stay.

## Build order

1. Engine: a 512 m test land, chunk streaming, sleeping enemies, nearby-only sync. Gate: 60 fps, under 20 KB/s.
2. Vertical slice: Threshold and the Wood's edge, quests 1–2, Lumen 1–10, 4 foes, 1 Hunter. Gate: testers find it fun.
3. The middle: the Fair and the Hoard, quests 3–5, processions and events, Lumen to 30.
4. Finale: the Hollow, Inanis, both endings, Lumen to 40, Hunters to hunt.

Tripo: ~590 credits left; ~12 models (foes, Hunters, W., Inanis), cost shown before any batch. The land uses CC0 packs.

## Open questions (proposed answers)

- One shared Lacuna per server, quest bosses in the party's own copy?
- Lumen per hero (alts start a little brighter)?
- Gate opens after "What Does Not End" (all five Eternal slots owned)?
- Death drops carried wishes?
- No gear inside for the slice?
- Real hills later?
- The Seraph: never crosses, or once against Inanis?
