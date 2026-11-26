# Third-party assets and their licences

Kept so the game's sources are clear before any commercial release.

| What | Where in the repo | Source | Licence |
|---|---|---|---|
| Buildings (homes, tavern, forge, chapel, mills, barracks, archery range, towers, market, mine, well, wheat) | `assets/models/kk_*.glb` (made by `tools/models/kaykit.mjs`) | KayKit Medieval Hexagon Pack 1.0 by Kay Lousberg (kaylousberg.com), github.com/KayKit-Game-Assets | CC0 (credit welcome, not required) |
| Walk cycles and villager animations | moved onto the game's rigs (see README) | Quaternius, Universal Animation Library | CC0 |
| Character, enemy and landmark models | `assets/models/*.glb` (not `kk_`) | Made with Tripo (tripo3d.ai) on Ko Ko's account, through the API (`TRIPO_API_KEY`) | Paid plan / paid credits: full rights to use, modify, distribute and sell; Tripo keeps a royalty-free licence to display them. Free-plan generations: Tripo keeps all rights (Terms 5.2.1), so they cannot ship commercially. |
| NPC voices (not shipped since 0.99.2) | `tools/voice/` | Kokoro TTS; Chatterbox (Resemble AI) tried | Apache-2.0; MIT |

## Tripo: what to keep before release

Rights follow the plan **at the time each model was generated** (tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially). Keep the receipts for the paid plan or API credits that cover every model in `assets/models/` (the `models.yml` workflow runs record when each was made), and regenerate on a paid plan any model made on free credits.
