# Phase 4 reaction classification

Accepted negate and suppress outcomes now emit the canonical
`EFFECT_REACTED` rule event. Explicit reaction-prompt choices and automatic
permission suppression use the same event shape, so downstream triggers do not
depend on UI callbacks or a particular card's resolver.

## Newly eligible complete rule

- **bh08 Maja Kaminska (University)** subscribes to `EFFECT_REACTED`. Each
  active face-up unsuppressed copy grants permanent Fate to mutable cards its
  controller controls in that source's zone. The base +2 is increased by active
  same-zone Jeremiah Jones potency, matching the existing shared aura rule.
  Multiple Maja sources trigger independently.

The trigger uses shared `MODIFY_FATE` operations and therefore preserves
immutable-card filtering, per-card events, deterministic replay, and atomic
command rejection. It observes Lydia/Secules reaction choices and automatic
Semper Fidelis suppression.

## Already covered in complete slices

- **56 Lydia**, **67 Mr. Secules**, and **79 Havano Citizen** remain the
  serializable reaction-prompt vertical slice.
- **18**, **26**, **40**, and **bh02** are implemented in their primary
  status, information, draw, or event-trigger families.

## Explicitly deferred

- **91 Wodny Potok Villager** belongs to landscapes and still has an unresolved
  five-turn boundary.
- Copy-driven reaction behavior remains rejected until copied ownership,
  limits, choices, and snapshot/link semantics are resolved.
- The global ambiguity ledger still governs priority if multiple different
  reaction and replacement kinds become eligible at the same timing window.

No deferred card is admitted to v3 matchmaking.
