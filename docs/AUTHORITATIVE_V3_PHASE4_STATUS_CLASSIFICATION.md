# Phase 4 status-effects classification

This family introduces serialized player statuses and shared permission
queries. A status records its target, source controller, first active turn,
remaining target turns, refresh behavior, and any shared per-player use
counter. It expires only at an authoritative turn boundary and survives the
same snapshot/replay path as prompts and movement grants.

## Newly eligible complete rules

- **18 1st US Marines** creates one `SUPPORTER_EFFECTS_BLOCKED` status for the
  opponent's next turn. Repeated resolutions refresh the same one-turn lock;
  they do not extend it. The three-use limit is shared by all copies controlled
  by that player, matching the legacy `usMarinesUses[player]` counter. A fourth
  copy can still be set, but its effect is skipped.
- **20 South Wind Spearman** uses the common opponent-effect immunity query
  while it is on the board. It remains targetable by its controller and does
  not retain the intrinsic board-only immunity in a hidden pile.
- **53 Colombo Thug** uses the shared consolidation permission query. An
  opponent consolidating into its zone cannot select tribute from another
  zone while Colombo's effect is active.
- **12 Makenna** selects zero to two mutable friendly cards in her zone through
  one recoverable prompt and atomically grants permanent opponent-effect
  immunity to the selected cards.

The pre-existing vertical slice already covers serialized immunity or
permission behavior for 56, 67, 69, 76, 79, and bh01.

Card 51 is now complete in the declaration/RNG checkpoint through a
three-owner-turn affiliation status and canonical set/affiliation-change
triggers.

## Explicitly deferred

- **07** combines deck-origin placement, three searches, Fate changes, and a
  temporary set-limit modifier; it belongs to placement/continuous work.
- **21** depends on unresolved square-selection, adjacency,
  source-leaves-play, and persistence decisions.
- **14 and 17** require authoritative adjacency or permanent board-geometry
  restrictions.
- **70 and bh03** require complete hidden-hand ownership, protection, cap,
  expiry, and return-routing lifecycles.
- **81 and bh06** require token identity, token duration, placement, and
  mutable-classification rules.
- **91** remains rejected until its five-turn landscape-lock boundary is
  resolved and the landscape command family exists.
- **99** remains rejected until every placement, consolidation, lookup, and
  historical-count query uses the same temporary type replacement.
- **bh08** belongs to the later reaction/continuous interaction slice because
  it must observe every successful negate or suppress event consistently.

Card 06 is already eligible through draw/search; its classifier assignment to
this family comes only from the phrase “cannot add Star cards,” which is a
search filter rather than a durable status.
