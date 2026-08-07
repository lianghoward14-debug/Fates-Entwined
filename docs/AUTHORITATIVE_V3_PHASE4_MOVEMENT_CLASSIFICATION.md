# Phase 4 movement family classification

Movement is authorized by shared `MOVE_CARD` validation. Card programs and
serialized statuses define who may request a move; they do not bypass
occupancy, immunity, destination, event, trigger, or invariant checks.

## Implemented movement slice

- 34 Rozsi Szocs observes every accepted `CARD_MOVED` event and grants the
  destination bonus through the shared Fate operation.
- 39 Juan Carlos selects an opponent card and an open destination in his zone.
- 54 Wolf Creek Light Infantry selects a controlled same-zone card, then moves
  or swaps it through shared destination validation.
- 69 Breakfast Republic Busser creates a serialized three-owner-turn movement
  grant. The target can move once per turn into an adjacent zone's contested
  or owner-safe row. The current resolving turn counts as the first turn,
  matching the legacy executable behavior.
- bh01 Anička Voyager uses the same movement operation, has an authoritative
  once-per-turn limit, and draws only after an accepted move.

## Deferred composite movement cards

- 62 Berkeley Homeless also changes consolidation and discard permissions, so
  it remains assigned to discard/removal and status-permission work.
- 70 Wine Country Guerilla moves between discard and the opponent's hidden
  hand, runs deterministic delayed Fate reductions, and remains a custom
  hidden-information effect.
- 73 ALPINE Expeditionary combines when-set mass discard, Fate aggregation,
  and ongoing movement. It remains assigned to the discard/removal slice so
  the card is not made multiplayer-eligible with only half its rule active.

Only registry-backed cards are accepted by isolated v3 match validation.
