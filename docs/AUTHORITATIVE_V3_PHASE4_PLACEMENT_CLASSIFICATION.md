# Phase 4 placement-effects classification

Placement permissions are evaluated by the same shared query in authoritative
command validation and legal-command generation. A blocked action is therefore
neither advertised to a client nor accepted if a stale or malicious client
submits it directly.

## Newly eligible complete rule

- **50 Berkeley CS Major** opens a serialized zone-selection prompt and creates
  a scoped `ZONE_ACTIONS_BLOCKED` status for the opponent's next turn. While
  active, normal set, consolidation, and manual effect-activation commands in
  that zone are rejected. The other zones remain usable. Multiple locks on the
  same zone refresh one target-turn status rather than extending its duration.

The status survives canonical snapshot recovery and expires at the affected
player's authoritative end-turn boundary.

## Already covered in complete slices

Cards 05, 13, 16, 18, 31, 32, 33, 42, 51, 54, 58, 60, 65, 66, 68, 69, 76,
77, 80, 90, 96, 97, bh04, and bh25
already have their complete set restrictions or when-set continuations in the
registry through earlier operation families.

## Explicitly deferred

- **07** combines deck-origin free placement, three searches, Fate grants, and
  a temporary set-limit increase.
- **14** depends on the unresolved adjacency rule and combines placement denial
  with immediate diagonal removal.
- **25** requires a reusable nested free-placement continuation and a
  player-wide once-per-turn rule across all copies.
- **37, 75, and bh05** require complete copy semantics.
- **52** requires a durable leave-field subscription and seeded hidden-hand
  random discard.
- **61** requires definition-wide matching across private piles and future
  copies.
- **62 and 73** combine special placement or movement with discard replacement
  and consolidation permissions.
- **71** requires a three-draw phase-only watcher and bottom-deck replacement.
- **72 and bh03** require hidden-zone ownership and return routing.
- **84** requires a search followed by a nested free Character set.
- **94** requires a four-turn delayed hidden-card delivery queue.
- **bh06** requires dynamically classified tokens and their placement rules.

All deferred cards remain absent from the v3 eligibility registry.
