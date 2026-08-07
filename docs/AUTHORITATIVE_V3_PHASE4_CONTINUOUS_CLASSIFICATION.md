# Phase 4 continuous-modifier classification

Continuous Fate is now calculated by a shared `effectiveFate` query. The query
starts from stored `currentFate`, reads active face-up unsuppressed sources,
applies compatible aura modifiers, clamps the card at zero, and never writes
the derived value back into canonical card state. Scoring uses this same query.

## Newly eligible complete rules

- **10 Post-Modernist Dylan:** each mutable opponent card in Dylan's zone has
  -3 effective Fate.
- **11 Anne Stone:** each controlled Supporter in Anne's zone has +3 effective
  Fate.
- **23 Cathy:** each controlled Character in Cathy's zone has +2 effective
  Fate, including Cathy.
- **57 Jeremiah Jones:** each active friendly Jeremiah in the source zone adds
  +1 potency to the eligible Coordinator auras above, preserving the active
  legacy interaction.
- **59 Czechoslovak Maroon Knights:** each controlled Supporter in its zone has
  +1 effective Fate, including the source card.
- **19 KvÄ›tka Svoboda:** controlled Coordinators in its zone receive +3
  effective Fate, increased by active Jeremiah potency.
- **55 Bobby Jones:** receives +5 effective Fate only while three other
  controlled, mutable, face-up cards in his zone share his affiliation.
- **63 Greek Hoplite:** each active copy receives +2 effective Fate for every
  active controlled copy in its zone, including itself.
- **88 Rozsi Szocs (Youth):** receives +2 effective Fate for every mutable,
  face-up Character controlled across the field, including itself.
- **85 Felicyta Janowicz (Specters):** receives +1 effective Fate for every
  Supporter the opponent has set during the match, including Supporters placed
  by effects.
- **89 Zsofia Szocs (Youth):** receives +7 effective Fate while its controller
  has fewer than ten proceeded Supporter effects during the match. Negated,
  suppressed, and timed-blocked effects do not count.
- **35 Alexander the Magnificient:** replaces its stored Fate with the live
  combined effective Fate of mutable, face-up controlled Supporters in its
  zone, then receives compatible external modifiers normally.
- **92 Wodny Potok Lumberjack:** a printed Supporter set in its controller's
  zone is permanently suppressed and gains one permanent reinforcement.
  Fully immutable or opponent-effect-immune Supporters are unaffected.
- **95 Carpathian Specter:** records authoritative field turns and gains one
  stored Fate every two global turn starts, capped after six gains.
- **77 Duncan Heyward:** stores a serialized affiliation declaration and grants
  matching controlled cards in his zone +4 effective Fate, with Jeremiah
  Coordinator-aura potency.

Aura sources stop contributing immediately when suppressed, face-down,
discarded, or moved out of the zone. Multiple sources stack by recomputation,
and fully immutable cards ignore both bonuses and penalties.

The cumulative Supporter counters are canonical per-player state, appear in
player and spectator projections, and survive snapshot recovery. They are
updated only by the shared placement and effect-stack pipelines.

## Already covered in another complete slice

- **20 and 53** are status/permission passives.
- **49 Irvine Businessman** extends the shared consolidation tribute query so
  mutable controlled Characters in his zone contribute one reinforcement.
- **83 and 93** change stored Fate through explicit operations rather than a
  live aura.
- **bh02** is an event trigger that permanently grants Fate after an activated
  draw.

## Explicitly deferred

- **14 and 21** depend on unresolved adjacency, square selection, and effect
  persistence.
- **15** is a placement trigger rather than a continuously derived aura.
- **24** remains blocked on the global unqualified-adjacency decision.
- **37** needs complete copy semantics, including whether the copied rule
  remains linked and how suppression and limits transfer.
- **61** depends on a selected definition identity spanning hidden piles and
  future copies.
- **64 and bh07** depend on authoritative adjacency and, for 64, deterministic
  persistent random-target selection.
- **bh08** must observe the later reaction family's canonical negate and
  suppress events.

These cards remain absent from the multiplayer registry, so the v3 server
rejects them rather than running a partial aura.
