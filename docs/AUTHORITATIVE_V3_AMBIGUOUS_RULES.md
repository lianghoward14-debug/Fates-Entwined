# Authoritative v3 ambiguous-rule ledger

These questions were found while completing Phase 0. The legacy implementation
remains the executable behavior until a decision is recorded. An affected rule
must not be ported merely by interpreting its display text.

## Global rules

1. **Adjacent versus diagonal.** Card text sometimes says only “adjacent” and
   elsewhere says “adjacent or diagonal.” Confirm that unqualified adjacent is
   orthogonal only across all placement, aura, and reinforcement queries.
2. **Base, current, and effective Fate.** Define which value is read before
   doubling, copying, totaling a zone, or calculating a derived Fate card, and
   whether continuous modifiers are included.
3. **Duration boundaries.** Define whether “next turn,” “for five turns,” and
   “for the next three of your turns” decrement at the source player's start,
   the target player's start, or global turn transition.
4. **Optional “up to” selections.** Confirm whether zero targets is always a
   legal decline and what cancellation does after earlier selections in the
   same effect.
5. **Reaction order.** Define ordering when Lydia, Mr. Secules, Havano Citizen,
   immunity, copied effects, and another replacement can all apply.
6. **Random selection.** Specify eligible-set construction, ordering before the
   seeded pick, and whether an invalidated target causes a re-roll.
7. **Copy semantics.** Decide whether copied effects snapshot the source rule at
   selection or remain linked, and how limits, owners, controller, and copied
   choices transfer.
8. **Type and affiliation changes.** State whether changes affect placement,
   consolidation cost, aura membership, historical counters, deck searches,
   and already-created delayed effects.
9. **Added board geometry.** Define stable coordinates, ownership, safe/contested
   classification, and behavior when the source effect leaves play.
10. **End-of-match ties.** Confirm the two-zone win, total-Fate tiebreaker, and
    exact-tie draw behavior for every mode and timed landscape resolution.

The final-card dependency batch resolves the card-side form of items 1, 6, 7,
8, and 9 for legacy parity: adjacency is orthogonal unless diagonals are
explicit; random eligible sets are IID-sorted before consuming match RNG;
copies snapshot a rule ID and execute with the copier as source; current type
and affiliation participate in live queries; and added rows/squares retain
stable coordinates and explicit owners. Landscape-specific variants remain
open until their landscape slices are ported.

## Card-specific questions

- **03 Howard (resolved for legacy parity):** “Current Fate” snapshots the
  stored non-negative integer `currentFate`, then applies `current × 2 + 5`.
  Continuous auras are not folded into the permanent stored value.
- **07 Maja Kaminska (resolved for legacy parity):** A deck-origin set is one
  authoritative command and cannot use a contested row. The recovered
  when-set frame selects up to the three available Supporters, transfers them
  atomically with +4 stored Fate, then grants two extra sets for the current
  turn. A failed or rejected continuation commits none of those mutations.
- **12 Makenna (resolved for legacy parity):** Zero, one, or two mutable
  friendly cards in Makenna's zone are legal. Granted immunity is permanent
  and does not depend on Makenna remaining in play. **21 Henry Dong** retains
  the separate adjacency, selected-square, and source-leaves-play questions.
- **14 Alondra Hopkins:** Define adjacency for placement prevention versus the
  explicitly broader “adjacent or diagonal” discard.
- **18 1st US Marines (resolved for legacy parity):** The opponent's next turn
  is the single target-player turn immediately following resolution. Repeated
  uses before that turn refresh one lock rather than extending it, and the
  three-use counter is shared by all copies controlled by that player.
- **35 Alexander the Magnificient (resolved for legacy parity):** While active,
  its own stored Fate is replaced by the sum of controlled, mutable, face-up
  Supporters' effective Fate in its zone. External modifiers then apply to
  Alexander normally. Suppression restores its stored Fate. Copy behavior
  remains part of the deferred general copy-mechanic decision.
- **36 Marie L'amboure:** “Reduce the zone's total Fate by 4” is represented in
  legacy code as a zone/player modifier; confirm duration and stacking.
- **37 6th French Fusiliers / 75 The Ledger-keepers (resolved for legacy
  parity):** Copying snapshots the selected rule ID. Fusiliers accepts an
  on-field Supporter with a passive rule and exposes that passive only while
  the copier remains active. Ledger-keepers accepts an on-field Supporter with
  a when-set program and immediately pushes a serializable child frame using
  Ledger-keepers as the source.
- **40 Christopher Erbs (resolved):** The next eligible draw gains **6** Fate.
  This agrees with the catalog and the current shared single-player draw path;
  the stale v3 `NEXT_DRAW_GAINS_4` prototype has been replaced.
- **45 Chingachlook:** Clarify “only character” enforcement if another character
  changes type, changes control, or enters simultaneously.
- **51 Rivera (resolved for legacy parity):** The resolving owner turn counts
  as the first of three owner turns. Each matching mutable face-up Character
  gains +4 once per active Rivera declaration when set or when card 66 changes
  its affiliation to the declaration. Rivera never grants its own arrival
  bonus.
- **52 The Vigilantes:** Define which leave-field reasons trigger the random
  hand discard and whose RNG stream owns the selection.
- **56 Lydia / 67 Mr. Secules / 79 Havano Citizen:** Define nested reaction
  priority, decline behavior, suppression permanence, and whether a negated
  targeting effect still counts as targeting.
- **61 Maria Song:** Define how all copies are identified and whether -7 applies
  to future-created copies or only instances existing at resolution.
- **64 Cook Islands Duelist (resolved for legacy parity):** The target is the
  first mutable face-up orthogonally adjacent opponent under the legacy stable
  source/target hash rank. The live query retains that target while eligible
  and deterministically reselects after movement, removal, or suppression.
- **66 Mark Menz (resolved):** The declaration changes every mutable card
  currently controlled by Mark's controller in his zone, including Mark, when
  its current affiliation differs. Each changed instance emits
  `AFFILIATION_CHANGED`; Mark gains one stored Fate per changed instance.
- **77 Duncan Heyward (resolved):** The declaration is stored on Duncan. His
  face-up unsuppressed aura reads each controlled card's current affiliation,
  grants +4 effective Fate, and receives normal Jeremiah Coordinator-aura
  potency without changing stored Fate.
- **69 Breakfast Republic Busser (resolved for legacy parity):** The resolving
  owner turn counts as the first of three turns. The granted card may move at
  most once on each of those turns to an adjacent zone's contested or
  owner-safe row.
- **70 Wine Country Guerilla:** Define ownership/controller while in the
  opponent hand, five-use expiration timing, and interaction with hand limits.
- **71 Fort Calvin Watcher (resolved for legacy parity):** Only normal
  draw-phase cards consume the three-card watch. Each is revealed. The first
  revealed Character is appended to the bottom of its current deck instead of
  entering hand; later Characters are only revealed.
- **72 Robo en la Noche:** Define hidden ownership, return routing after control
  changes, and what happens if the stolen card becomes a token or copy.
- **78 Chaparral Hoplite:** Define face-down public information, effects,
  attributes, scoring, targeting, and flip timing.
- **81 Wojciech (resolved for legacy parity):** Hand tenure counts six creator
  turns without decrementing on the creation turn. A placed Pierogi is hosted
  by the opponent and expires after three host turns. It may use contested or
  opponent-owned playable squares, including added squares, is protected from
  hand-limit discards, and raises the effective hand limit when protected
  instances alone exceed it.
- **87 Květka Svoboda (Ukulele):** Define whether “starting now” includes the
  current resolution and exactly which Supporter set consumes the continuing
  consolidation bonus.
- **90 Wojciech (Fisherman) (resolved):** Eligible deck instances retain
  canonical deck order before each seeded pick. Two are selected without
  replacement, gain +3 stored Fate while remaining private, enter hand, and
  the remaining deck is shuffled. The whole action is one activated draw
  effect for Joie.
- **91 Wodny Potok Villager:** Confirm the five-turn lock boundary; legacy code
  initializes a counter in a way that may include the resolving turn.
- **92 Wodny Potok Lumberjack:** Define whether negated/suppressed Supporters
  gain +1 reinforcement before or after copied/type-changing effects.
- **93 Wodny Potok Youth (resolved for legacy parity):** Snowball Fight can
  target any mutable opponent card on the field, including another zone. This
  matches the catalog and the active shared single-player target query.
- **96 Wodny Potok Snow Shoveler (resolved):** Up to four non-Star discard
  instances are selected without replacement from canonical discard order,
  then each is inserted at a seeded random deck position. Existing deck cards
  retain their relative order. Selected identities remain private to the
  controller.
- **99 Rozsi and Zsofia (Youth):** Define the complete rule surface affected
  while Supporters are classified as Characters.
- **100 Felicyta and Květka (Youth):** Clarify whether the +3 Fate condition is
  a one-time gain or a continuous derived modifier.
- **bh04 Anicka Konvicka (Selva Island) (resolved for legacy parity):** The
  declaration matches printed type on mutable face-up cards currently
  controlled by the opponent in Anicka's zone. Each target loses
  `Math.round(20 / targetCount)` stored Fate, clamped at zero; positive `.5`
  values round upward, so the applied total may differ from exactly 20.

## Landscape questions

The Phase 4 landscape decisions are now encoded in
`shared/engine/landscapes/runtime.mjs` and gated by the dedicated landscape
smoke tests. Card 82 is enabled with all 20 choices. The questions below are
retained as the historical decision checklist; the implementation and
classification document are now authoritative for v3 behavior.

- **igb2 and igb8:** Define tie behavior, the exact turn-10/14 resolution
  boundary, and when the winner chooses a destination zone.
- **igb3:** Define whether “before turn 10” includes actions during turn 10 and
  whether face-down consolidation receives the bonus.
- **igb5:** Define when “more total Fate” is sampled and how ties affect a set
  happening during a chained effect.
- **igb7:** Define once-a-turn ownership for movement granted to copied,
  controlled, or face-down Eventide cards.
- **igb9:** Define whether each card in a multi-card draw creates a separate
  optional prompt and how nested draw effects queue those prompts.
- **igb13:** Define which player's draw phase is the first skipped phase.
- **igb15:** Define what counts as activating a Supporter effect when it is
  copied, negated, optional and declined, or triggered during another effect.
- **igb19 and igb20:** Preserve their implemented legacy timing and targeting as
  fixtures before assigning final shared-engine operations.

The generated inventory also carries machine-readable ambiguity flags for every
card and landscape whose text matches one of these risk categories.
