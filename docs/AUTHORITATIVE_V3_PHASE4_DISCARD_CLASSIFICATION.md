# Phase 4 discard and removal family classification

Discard effects use the shared `DISCARD_CARD` operation. It resolves ownership,
routes cards to the owner's discard pile, checks targeting and immunity, emits
`CARD_DISCARDED`, and validates a whole selected batch before applying it.

## Implemented discard/removal slice

- 16 MINAE Death Squad optionally discards one mutable opponent Supporter in
  its zone.
- 29 Dylan Kirby, 48 Cosmic GF, and 58 Crossroads Worker use the shared transfer
  operation to recover cards from discard.
- 30 Santiago discards one opponent card from the same zone's contested row.
- 38 Jake discards a controlled Supporter anywhere on the field, then gains 4
  stored Fate, with an authoritative once-per-turn limit.
- 42 West German Soldier draws two, then atomically discards exactly the lesser
  of two cards and its current hand size.
- 96 Wodny Potok Snow Shoveler deterministically selects up to four non-Star
  discard instances and inserts each at a seeded random deck position without
  reordering the existing deck.
- 80 Apparition of Berkeley optionally discards a controlled same-zone
  Character, then draws two in the same effect frame.
- bh25 Jimmy (Viltrumite) discards any mutable board card after authoritative
  consolidation placement.

## Deferred discard/removal cards

- 08 Lina combines deck/discard search with immediate free placement.
- 14 Alondra combines adjacency placement prevention, mass removal, and
  count-derived Fate.
- 52 The Vigilantes requires a durable leave-field subscription and a
  deterministic random discard from hidden hand information.
- 62 Berkeley Homeless requires movement plus consolidation and discard-cost
  replacement rules.
- 70 Wine Country Guerilla and 72 Robo en la Noche change hidden-hand
  controller/return routing and need custom ownership replacements.
- 73 ALPINE Expeditionary requires batch Fate aggregation, mass discard, and
  its complete continuing movement permission.
- 81 Wojciech's protected counters belong to token, hand-protection, board
  geometry, and duration work.
These cards remain rejected during v3 deck validation until their complete
rule is present. No partial card silently falls back to legacy resolution.
