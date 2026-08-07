# Phase 4 final-card dependency classification

This dependency batch first raised isolated authoritative-v3 card coverage
from 68 to 108 definitions. The completed landscape batch now enables card 82,
bringing the registry to all 109 definitions without changing the legacy
route or enabling a later phase.

## Shared rules added

- Board geometry uses stable zone/row/column coordinates, explicit row
  ownership, playable added-square records, and serialized square statuses.
  Unqualified adjacency is orthogonal; effects that also include diagonals use
  the explicit eight-neighbour query.
- Every placement updates canonical current-turn and last-turn counters.
  Dynamic safe rows, permanently unusable squares, Zoe consolidation locks,
  Henry Coordinator suppression squares, and Chingachlook restrictions share
  reducer validation and legal-command generation.
- Opening-hand and hand-arrival processing is authoritative. Skier extras,
  Taylor duplication, Ali transfer, Pirate grants, Watcher reveals, Robo
  theft, Guerilla infiltration, Mailman delivery, and random hand effects use
  permanent instance IDs and the match RNG.
- Free sets, deck-origin sets, copied effects, delayed delivery, face-down
  consolidation, card declarations, and multi-square choices remain
  serializable effect frames. They can be recovered without callbacks.
- Pierogi and Adaptive Tactics cards are canonical generated instances.
  Pierogi ownership, legal opponent-side placement, hand/board expiry, and
  discard protection are explicit. Adaptive tokens declare type, affiliation,
  rarity, and placement kind in their command.
- Copy rules snapshot the selected rule ID. Ledger-keepers immediately execute
  a copied when-set program. French Fusiliers and Taylor persist the copied
  passive identity while the copying card remains active.
- Stored Fate is never materialized for live Felicyta, Grenadier, Agent-K,
  Duelist, Jimmy, or Wintertide modifiers. Suppression, movement, control, and
  source removal are therefore reflected by the shared effective-Fate query.

## Eligibility boundary

Cards 01, 02, 04, 07, 08, 14, 17, 21, 24, 25, 28, 36, 37, 41, 43, 44,
45, 52, 61, 62, 64, 70, 71, 72, 73, 74, 75, 78, 81, 84, 86, 91, 94, 98,
99, 100, bh03, bh05, bh06, and bh07 are now in the isolated v3 registry.

Card 82 is now eligible. Its recoverable modal offers all 20 authoritative
landscapes, applies a canonical `CHANGE_LANDSCAPE` operation, initializes the
new landscape's seeded/runtime state, preserves permanent prior rewards, and
enforces the final-four-turn protection around igb2 and igb8.

The dedicated gate is
`npm run smoke:authority-v3-phase4-final-cards`.
Card 82 and its landscape dependency are additionally gated by
`npm run smoke:authority-v3-phase4-landscape-change`.
