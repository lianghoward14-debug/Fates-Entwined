# Phase 4 Fate-modification family classification

This checkpoint keeps Phase 4 behavior families separate. A card mentioning
Fate is not automatically implemented as a stored `currentFate` mutation.
Live auras, delayed triggers, searches, discards, declarations, and landscapes
stay assigned to their primary Phase 4 family so the engine does not create a
second, partially overlapping rule path.

## Direct stored-Fate slice

The current isolated v3 registry implements these direct Fate behaviors:

- 03 Howard: selected stored Fate becomes `current × 2 + 5`.
- 05 17th British Regiment: selected same-zone card gains 3.
- 22 Isaac Perez: zero to two controlled same-zone cards gain 3 atomically.
- 31 Oathbound Noble Fighter: selected same-zone card loses 3, clamped at zero.
- 34 Rozsi Szocs: a card moved into her zone gains 3 through `CARD_MOVED`.
- 40 Christopher Erbs: the next eligible draw gains 6, twice per game.
- 65 1st West Caribbea Marines: intrinsic when-set Fate becomes 4.
- 76 ALPINE Infantry: intrinsic +4 resolves while external effects remain
  unable to mutate it.
- 83 Sebastyen Janowicz: all eligible controlled Characters in the zone gain 2.
- 93 Wodny Potok Youth: one mutable opponent board card loses 1 once per turn.
- 47 Great Oak Infantry: when used as consolidation tribute, the resulting
  card gains 3 stored Fate through the shared consolidation operation.
- 15 Zsofia Szocs: setting a face-up Coordinator in her zone grants permanent
  Fate to mutable controlled cards through `CARD_SET`, with Jeremiah potency.
- bh02 Joie: activated draws give controlled cards in her zone +1.

Cards 85 and 89 are complete continuous rules rather than stored-Fate
mutations. They read canonical Supporter set/effect counters through the
shared effective-Fate query.

The current shared-mechanism batch also completes 33's next-Character arrival
bonus, 35's live Supporter total, 46's draw-phase +2, 87's consolidation
Ballad, and 95's capped two-turn stored-Fate tick.

Cards 51, 66, 77, and 90 are now complete through the declaration/RNG
checkpoint. Fisherman's +3 remains private stored Fate, while Duncan's bonus
uses the shared live effective-Fate query.

## Explicitly deferred to overlapping Phase 4 families

- **Draw and search:** 07 and 86 combine Fate with card arrival,
  search, or draw triggers.
- **Discard and removal:** 14, 38, 61, and 73 calculate Fate from discarded
  cards or apply Fate loss across hidden/public card locations. Maria Song
  remains blocked by its copy-identity ambiguity.
- **Continuous modifiers:** 01, 36, 41, 44, 64, 100, and bh07
  must be computed through
  live effective-Fate queries. They must not permanently rewrite stored Fate.
- **Unusual delayed/custom effects:** 02 and 70 combine board geometry or
  hidden-hand residency with Fate and remain assigned to their custom families.

This classification is a sequencing decision, not a multiplayer eligibility
claim. Only cards present in `shared/engine/cards/registry.mjs` are accepted by
isolated v3 matches.
