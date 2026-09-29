# Main card audit fixes

Implemented the main findings from the card audit in the authoritative engine and applicable singleplayer/AI paths. The additional-issues section remains deferred.

## Confirmed rules

- Youth counts once per physical source for Jimmy.
- Honor Guard is an adjacency aura; its obsolete free-copy program was removed.
- West Caribbea Infantry recovers 16 Morale. Great Oak Infantry inflicts 10 Morale damage. Neither restores its obsolete effect when the pressure-rework setting is disabled.
- Mailman waits four owner turns (normally eight alternating turns).
- Suppressed friendly cards still contribute damage through an active Rozsi aura.

## Changes

- Mandatory West German Soldier discards cannot be cancelled after drawing.
- Wolf Creek validates both swap participants for immunity and movement restrictions.
- Dylan respects opponent-effect immunity; suppressed reinforcement providers stop contributing their passive bonuses.
- Leningrad's queued bonus no longer rejects an otherwise legal immune Supporter placement.
- Juan can select opposing cards in another zone and move them to an open square in his zone.
- Copied effects use their runtime identity in draw, search, placement, consolidation, and Morale consumers. French Fusiliers has explicit passive eligibility and initializes copied Grenadiers declarations.
- Engineer applies Coordinator potency and trigger history/counters, including fieldwide Whisper targets.
- Chauffeur-created cards run special hand-arrival handling.
- Selva uses effective card types and distributes exactly 24 requested Fate loss with deterministic integer remainders; Jimmy counts the activation once. Actual loss can be lower when a target has insufficient Fate.
- Maria reveals eligible Characters rather than the whole hand.
- Guerilla offers its owner an optional transfer after discard, and suppression prevents the offer.
- Mailman's deck search triggers Boleslaw, including the singleplayer AI path.
- Hugh uses the shared permanent Fate-gain calculation, including Abed.

## Validation

- New authoritative main-audit regression suite passes.
- New singleplayer regression suite passes.
- Fourteen touched runtime files pass syntax checks; `git diff --check` passes.
- Broad audit suites: 70 existing files, 41 passing and 29 failing, matching the original passing/failing file sets. Three assertions were updated for the approved rules (suppressed UN reinforcement, optional Guerilla, and Selva remainder allocation).
- No live multiplayer session or browser click-through was performed. Existing failing suites remain documented in the original audit; this is not a claim that the complete repository test suite is green.

Run the new tests from the repository root:

```text
node server/authoritative-v3/card-audit-main-regression-test.mjs
node server/card-audit-main-legacy-regression-test.cjs
```

Changes are local; no deployment or push was performed.

## Follow-up decisions

- Current face-down behavior, Mark Menz affecting all eligible friendly cards, Makenna's friendly-only selection, and Oktai's visual concealment are intentional and retained.
- Rozsi and Zsofia Youth (99) now lasts five global turns including its activation turn in both engines.
- Panacea's current printed effect explicitly grants permanent Fate. Its singleplayer and AI paths now use the shared permanent-gain calculation, so Abed applies. Historical Coordinator totals now include gain modifiers active at each trigger; suppression already prevents those triggers from contributing history. Panacea's later inheritance is a separate gain and uses modifiers active at that time.
- Mailman was rechecked: scheduling emits one deck-search event, and delivery occurs on the fourth subsequent owner-turn start (normally eight global turn changes). The new follow-up regression covers the turn boundaries.
- Newly recorded history is adjusted; old saved raw history cannot reconstruct modifiers from past turns.
