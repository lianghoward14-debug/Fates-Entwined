# Phase 4 declaration and deterministic-selection classification

This checkpoint adds one shared path for serialized affiliation/card-type
choices and one shared path for seeded selection without replacement. Choices
remain in the effect frame, RNG state remains in canonical match state, and
private selected identities are removed from opponent and spectator event
projections.

## Newly eligible complete rules

- **51 Rivera** creates a three-owner-turn affiliation status. Matching mutable
  face-up Characters gain +4 stored Fate once per Rivera declaration when set
  or when Mark Menz changes them to that affiliation. The resolving owner turn
  counts as the first turn.
- **66 Mark Menz** changes every mutable currently controlled card in his zone
  whose affiliation differs from the declaration, emits
  `AFFILIATION_CHANGED` per instance, and gains one stored Fate per change.
- **77 Duncan Heyward** stores his declaration on the card and grants matching
  controlled cards in his zone +4 effective Fate, plus normal Jeremiah
  Coordinator-aura potency. Suppression, face-down state, movement, and removal
  recompute the aura immediately.
- **90 Wojciech (Fisherman)** selects up to two matching deck instances with
  the match RNG, grants each +3 stored Fate, transfers them privately to hand,
  and shuffles the remaining deck.
- **96 Wodny Potok Snow Shoveler** selects up to four non-Star discard
  instances with the match RNG and inserts each at a seeded random deck
  position while preserving the existing deck's relative order.
- **bh04 Anicka Konvicka (Selva Island)** declares a printed card type and
  applies the legacy positive-integer rule `round(20 / eligible targets)` to
  every mutable face-up opponent-controlled match in her zone.

Fisherman emits one `DRAW_EFFECT_ACTIVATED` event for the whole effect. Joie
therefore resolves once whether zero, one, or two matching cards exist. Normal
multi-card draw operations now use the same one-event boundary.

## Determinism and privacy

Eligible candidates preserve their canonical pile order before each seeded
pick. A selected candidate is removed before the next pick. Invalid inputs are
validated before consuming RNG, and reducer cloning keeps rejected commands
atomic. Deck shuffling and seeded insertion use the same persisted xorshift32
state.

`RANDOM_TRANSFER_RESOLVED` contains selected instance IDs only in the
controller's event projection. Opponents and spectators see only projected
pile counts and public Fisherman shuffle events, never hidden identities or
deck order.

## Still deferred

This batch does not resolve general copy semantics, hidden ownership changes,
random adjacent target persistence, token generation, landscape randomness,
or delayed hidden-card queues. Cards depending on those mechanics remain
absent from the v3 registry and cannot fall back to legacy resolution.
