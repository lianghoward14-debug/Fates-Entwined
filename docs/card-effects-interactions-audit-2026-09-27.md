# Card effects and interactions audit — 2026-09-27

Audited the current working tree at base commit 9e5341b, including pre-existing uncommitted changes. This is a findings report; no gameplay implementation was changed.

Reviewed all 128 catalog definitions (125 non-retired cards and 3 retired cards), their authoritative registrations, shared targeting/operation/trigger/modifier paths, and relevant legacy gameplay paths. The normal local game still uses the legacy engine; the authoritative single-player route is explicitly opt-in ([index.html](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/index.html:805>)). Findings distinguish the two. Pressure-rework and non-rework behavior were considered separately.

This is a catalog-wide source audit with targeted executable checks, not proof that every possible board state or pairwise/multi-card combination is correct. Browser click-through, live networking, full-game balance simulations, and exhaustive combinations were not performed. Retired cards 101–103 were inspected as retained implementations, not treated as live multiplayer deck options.

## Validation

- 70 existing test files executed independently: **41 passed, 29 failed**. A failed file stops at its first failing assertion, so later assertions in that file did not run.
- 23 authoritative diagnostic scenarios and 5 isolated legacy-function scenarios executed without harness errors. These record actual behavior; they are diagnostic probes, not a passing regression suite. Some set up board/status state directly to isolate an interaction.
- The 29 failures are **not 29 confirmed gameplay defects**. Several use old card values, old board dimensions, old landscape/catalog counts, brittle source regexes, or incomplete VM stubs.
- Highest-priority fixes: F01–F05. F12 needs an explicit integer remainder rule; F17 is compatibility/settings-specific; F18 needs the intended duration unit confirmed.

Evidence: [authoritative probes](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/tmp/card-audit-probes.mjs>), [probe results](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/tmp/card-audit-probe-results.json>), [legacy probes](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/tmp/card-audit-legacy-probes.cjs>), [legacy probe results](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/tmp/card-audit-legacy-probe-results.json>), [authority suite output](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/tmp/card-audit-test-results.json>), [legacy suite output](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/tmp/card-audit-legacy-test-results.json>).

Reproduce from the repository root:

```text
node tmp/card-audit-probes.mjs
node tmp/card-audit-legacy-probes.cjs
node tmp/card-audit-runner.cjs
node tmp/card-audit-runner.cjs --legacy
```

## Findings

### F01 · P1 · West German Soldier can keep its draws without discarding

Cards: 42. Authoritative engine; command-level reproduction.

Set West German Soldier with cards available in the deck. After drawing three, its HAND_SELECTION prompt has min=3 but cancellable=true. ANSWER_PROMPT with cancel=true ends the effect: all three drawn cards remain and zero cards are discarded. This is a rules exploit, regardless of whether a particular client hides its cancel button.

Recommended correction: Make mandatory post-benefit costs non-cancellable. Preserve an explicit distinction between declining an optional effect before it starts and abandoning its mandatory remaining steps.

Source: [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:892>), [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:2013>), [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:923>).

### F02 · P1 · Wolf Creek swaps cards that are immune to effects

Cards: 54,76,bh01. Authoritative command reproduction; similar gap in legacy destination selection.

Select an ordinary friendly Supporter in Wolf Creek’s zone, then select your Voyager in another zone as the swap destination. The engine offers the square and moves Voyager. Only the primary moving card is checked for immunity; the displaced card is not. The same path also needs to enforce movement restrictions on both cards.

Recommended correction: Validate targeting, movement restrictions, and square restrictions for both participants before offering or committing a swap.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:568>), [shared/engine/prompts.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/prompts.mjs:306>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:11376>).

### F03 · P1 · Dylan’s negative aura ignores opponent-effect immunity

Cards: 10,12. Authoritative operation-level reproduction; legacy source corroboration.

A 10-Fate card carrying IMMUNE_TO_OPPONENT_EFFECTS still scores 7 beside an opposing Post-Modernist Dylan. The aura branch subtracts 3 without checking immunity. This undermines Makenna’s protection, while ordinary targeted Fate loss correctly respects it.

Recommended correction: Apply the opponent-effect immunity check to hostile continuous card modifiers as well as targeted operations.

Source: [shared/engine/modifiers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/modifiers.mjs:192>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:10754>).

### F04 · P1 · Suppressed reinforcement passives still pay consolidation costs

Cards: 09,24,49. Authoritative operation-level reproduction for 09 and 24; static follow-up for 49.

A suppressed United Nations 5th Army adjacent to a suppressed Ralph’s Courtesy Clerk is still worth 3 Reinforcement instead of 1. effectiveReinforcement never checks either source’s suppression. Irvine’s permission checks only the literal EFFECTS_SUPPRESSED status, bypassing the central suppression logic for timed Supporter suppression.

Recommended correction: Use the central active-source predicate for United Nations, Ralph, and Irvine, and test with both permanent suppression and 1st US Marines’ timed suppression.

Source: [shared/engine/modifiers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/modifiers.mjs:324>), [shared/engine/modifiers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/modifiers.mjs:362>).

### F05 · P1 · Leningrad’s queued bonus prevents ALPINE Infantry from being set

Cards: bh24,76. Authoritative command-level reproduction.

With NEXT_SUPPORTER_SET_EXEMPT pending, setting ALPINE Infantry rejects the entire command with TARGET_IMMUNE. The placement applies the +4 bonus unconditionally, which throws against ALPINE’s immunity. A beneficial queued effect becomes a placement restriction.

Recommended correction: Allow the legal placement and skip the bonus on an immune target. Specify whether this consumes the queued benefit; do not roll back the placement merely because its bonus is blocked.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:401>).

### F06 · P2 · Juan Carlos cannot select opponents in other zones online

Cards: 39. Authoritative command reproduction; single-player source comparison.

With Juan in zone 0 and the only opponent card in zone 1, activation rejects with NO_LEGAL_TARGETS. The card says move any opponent card into Juan’s zone. Single-player explicitly picks from any zone, whereas the authoritative source-target filter requires sameZone.

Recommended correction: Remove sameZone from the initial target filter and evaluate destination availability relative to Juan’s zone, not the selected target’s zone. Also reconcile the legacy destination restriction that excludes your own safe row with the printed “any open square” wording.

Source: [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:892>), [shared/engine/prompts.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/prompts.mjs:161>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:9035>).

### F07 · P2 · Copied effects resolve by printed ID in several downstream handlers

Cards: bh05,37,40,86,73. Command-level Taylor/Christopher reproduction plus operation-level copy-state probes.

Taylor can copy Christopher and acquire NEXT_DRAW_GAINS_6, but the next draw gains 0 instead of 7 and the status stays armed: the draw handler looks for printed id 40. A Taylor with copied Boleslaw similarly neither draws nor gains 2 when the opponent searches. A copied Alexander adds no card-effect Morale damage at calculation: a 12-Fate Taylor produces only 3 ordinary zone-difference damage instead of that damage plus Alexander’s 6. The consolidation bonus path likewise checks printed id 73 instead of the copied effect identity. These are concrete examples of a broader copy-dispatch inconsistency.

Recommended correction: Audit every downstream printed-ID check. Use runtimeRuleId for effect identity while retaining printed IDs for physical-card restrictions and named-card conditions. Add copy parity tests, including Taylor copying Alexander and Alondra, which also have printed-ID consumers.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:248>), [shared/engine/triggers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/triggers.mjs:131>), [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:492>), [shared/engine/morale-pressure.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/morale-pressure.mjs:635>).

### F08 · P2 · French Fusiliers has inconsistent eligibility and cannot initialize Grenadiers

Cards: 37,44,25. Authoritative command reproduction and isolated legacy function reproduction.

The authoritative picker accepts Soviet Grenadiers, but execute:false only records copiedPassiveId=44. It never asks for a declared type or initializes a target, so the copied aura does nothing. Normal single-player excludes Grenadiers entirely through a stale whitelist even though its text explicitly says “While this card is on the field”. Conversely, the authoritative PASSIVE timing filter admits cards such as ALPINE Expeditionary that do not have the specified while-on-field wording.

Recommended correction: Share an explicit semantic copyability definition and initialize any required declaration state on the new copy. Resolve whether Honor Guard’s “While active” wording is intended to qualify.

Source: [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:102>), [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:1217>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:30>).

### F09 · P2 · Engineer procs bypass Coordinator potency and trigger history

Cards: bh25,15,bh02,bh08,57,bh23. Authoritative command reproduction; legacy source shows the same special path.

With Joie and Jeremiah in one zone, Engineer gives their eligible target +1 rather than +2. Joie’s triggeredFateHistoryTotal stays 0. Panacea subsequently cannot inherit that proc. Engineer uses a hard-coded amount instead of the normal triggered resolution, which updates history and includes Jeremiah’s potency.

Recommended correction: Reuse the same per-source trigger implementation for forced and natural procs, including potency, history, field-wide Whisper scope, and downstream counters.

Source: [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:1291>), [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:1328>), [shared/engine/triggers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/triggers.mjs:285>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:5813>).

### F10 · P2 · Francisek-created cards skip hand-arrival abilities

Cards: bh10,74,91. Authoritative command reproduction for Selva; static confirmation for Villager.

Choosing Selva Islands Pirate in Francisek’s catalog creates it in hand but grants no extra Supporter set. CREATE_CHAUFFEUR_SUPPORTER pushes directly into hand and never runs arrival processing. The same bypass prevents a created Wodny Potok Villager from starting its landscape-card search. Single-player uses addCardToHand here.

Recommended correction: Route generated cards through the shared hand-arrival pipeline without incorrectly classifying the catalog action as a deck search.

Source: [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:1204>), [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:104>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:7376>).

### F11 · P2 · Anicka Selva ignores Chloe’s changed card types

Cards: bh04,bh14,99. Authoritative operation-level reproduction; same printed-type comparison in legacy.

A Supporter changed to Coordinator by Chloe reports effective type Coordinator, yet loses no Fate when Selva declares Coordinator. The effect compares card.type instead of effectiveCardType. Other effects already use effective classification, so this makes Chloe’s interaction inconsistent.

Recommended correction: Use effective type for effect targeting and retain structural type only for actual placement/consolidation rules. Check search and reveal filters for the same distinction.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:2021>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:7103>).

### F12 · P2 · Selva’s split loss does not conserve its stated total

Cards: bh04. Authoritative and isolated legacy reproductions; remainder rule needs a decision.

Five eligible targets each lose Math.round(24/5)=5, for 25 total Fate loss. Seven targets would each lose 3, for 21 total. The printed effect specifies 24 split evenly, but integer rounding silently changes the budget.

Recommended correction: Choose and document an integer remainder rule, such as 4/5/5/5/5 for five targets with deterministic remainder assignment. If rounded equal losses are intentional, update the card text accordingly.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:2030>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:7116>).

### F13 · P2 · Jimmy counts Wodny Potok Youth only once per source lifetime

Cards: 41,93. Authoritative and isolated legacy reproductions.

Use the same Youth on two different turns to reduce an opponent’s Fate. Jimmy’s qualifying count remains 1, not 2. jimmyReductionEffectCounted is set on the first use and never reset per activation. The printed wording says once per card effect use, not once per physical card.

Recommended correction: Deduplicate reductions by activation ID so a multi-target effect counts once and separate once-per-turn activations still count separately.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:834>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:10337>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:6272>).

### F14 · P2 · Maria reveals more of the opponent’s hand than allowed

Cards: 61. Authoritative command-level reproduction.

Against a hand containing a Character and a Supporter, Maria emits HAND_REVEALED containing both cards. Her text and legacy picker reveal only Character cards. Filtering the later selection prompt does not undo the information already sent.

Recommended correction: Filter the reveal operation itself to eligible Characters, with the same immunity and effective-type rules used for target selection.

Source: [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:361>), [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:900>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:8004>).

### F15 · P2 · Guerilla’s replacement is mandatory and ignores suppression

Cards: 70. Authoritative operation-level reproduction; optionality is a direct text mismatch.

Discarding a suppressed Wine Country Guerilla still moves it to the opponent’s hand rather than the discard. The replacement checks only its printed ID and infiltration status; it neither checks suppression nor offers the controller the “you can” decision in the card text.

Recommended correction: Separate mandatory discard from the optional replacement, preserve the choice owner, and respect source suppression. Test consolidation tribute, hand-limit discard, effect discard, and stolen copies.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:615>).

### F16 · P2 · West Caribbea Infantry’s arrival bonus bypasses gain modifiers

Cards: 33,bh15,bh19. Authoritative operation-level reproduction; non-rework version only.

With Hsei-Ling and Abed active, Infantry’s next-Character hand-arrival bonus is still exactly +2. The ordinary gain pipeline would produce +6 in this setup (+2 doubled, plus the doubled Hsei rider). applyHandArrivalModifiers writes Fate directly rather than using changeFate.

Recommended correction: Route permanent hand-arrival gains through the common Fate operation, preserving its modifier, immunity, and event behavior.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:73>), [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:750>).

### F17 · P2 · Current card text and non-rework behavior disagree

Cards: 25,47. Authoritative operation-level reproductions; conditional on pressureCardReworks being disabled.

Honor Guard’s current catalog text is an adjacency aura, but with reworks disabled the authority registry still runs the retired free-copy when-set effect and its aura grants 0. Great Oak Infantry’s non-rework text promises +3 when consumed in consolidation, but the consolidation code only awards ALPINE’s +4 and grants Great Oak 0. The legacy source explicitly calls Great Oak’s +3 retired. These cases require either restored compatibility behavior or corrected/removed compatibility text.

Recommended correction: Define one supported ruleset per setting and derive its displayed definition and engine behavior together. The default server enables reworks; do not present these as unconditional default-match bugs.

Source: [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:65>), [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:1966>), [shared/engine/modifiers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/modifiers.mjs:182>), [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:490>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:8298>).

### F18 · P2 · Mailman delivers after different numbers of turns in the two engines

Cards: 94. Static authority trace plus isolated legacy boundary reproduction.

Authority decrements deliveryTurnsRemaining only at the recipient’s turn start. Legacy tickMailDeliveriesForCurrentPlayer decrements every pending delivery on every turn start, regardless of recipient. A four-turn delivery therefore normally takes eight global turn transitions online versus four locally. The card only says “four turns”.

Recommended correction: Choose global turns or owner turns explicitly, align both implementations, and put that unit into the card text. Also verify Boleslaw receives the appropriate search event when a delivery is scheduled.

Source: [shared/engine/reducer.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/reducer.mjs:580>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:6123>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:1737>).

### F19 · P2 · Mailman’s deck search does not trigger Boleslaw

Cards: 94,86. Authoritative command-level reproduction.

Set Mailman, select a Triangle from the deck, and observe the opposing Boleslaw. The card enters limbo, but Boleslaw gains 0 Fate and draws nothing. SCHEDULE_CARD emits CARD_SCHEDULED without DECK_SEARCHED; eventual delivery originates in limbo, so it does not create that event either.

Recommended correction: Emit the deck-search event at confirmed selection, before delayed delivery. Keep search and hand-arrival timing distinct.

Source: [shared/engine/operations.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/operations.mjs:1711>), [shared/engine/triggers.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/triggers.mjs:129>).

### F20 · P2 · Rozsi excludes suppressed friendly cards from her Morale aura

Cards: 34,18,56,79. Authoritative morale-cycle reproduction.

With Rozsi declaring Third Great War and a suppressed British Regiment beside her, only Rozsi contributes her 3 damage; the Regiment contributes none. The cycle builds one unsuppressed entries list and reuses it for both effect sources and recipients. Suppression disables the Regiment’s own effect, not Rozsi’s ability to affect it.

Recommended correction: Filter active sources independently from eligible recipients. Keep ordinary suppressed cards eligible for another card’s aura, while separately checking genuine immunity or non-contribution rules.

Source: [shared/engine/morale-pressure.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/morale-pressure.mjs:616>), [shared/engine/morale-pressure.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/morale-pressure.mjs:628>).

### F21 · P2 · Hugh Roberts ignores Abed’s multiplier in normal single-player

Cards: bh13,bh19. Isolated execution of the actual legacy function.

With an active High-T status, Smart Investments returns a card to the deck with +7 Fate rather than +14. The function assigns currentFate directly instead of using the permanent-gain helper. The authoritative program uses MODIFY_FATE and takes the multiplier path.

Recommended correction: Apply the shared permanent-gain calculation even when suppressing floating-number presentation. Audit the similar direct assignment in legacy Panacea as a follow-up.

Source: [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:7423>), [shared/engine/cards/registry.mjs](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/shared/engine/cards/registry.mjs:1622>).

## Additional issues to resolve or test

- **Legacy Panacea may also bypass Abed:** Hugh is now confirmed in F21. The legacy Panacea branch directly adds inherited Fate; its full modifier combination remains a source-reviewed follow-up: [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:7423>), [src/scripts/05-gameplay-core.js](<C:/Users/liang/OneDrive/Desktop/Fates Entwined main/src/scripts/05-gameplay-core.js:8728>).
- **Face-down rules have drifted:** current code deliberately allows hidden effect activation and some passive behavior, while older Havano/oracle tests expect face-down cards to have no effects. The passing face-down regression and failing older tests need one explicit policy. Do not “fix” this by blindly restoring old test assertions.
- **Duration wording:** Mailman is not the only card using unspecified “turns”. Review Rozsi/Zsofia Youth (99), Oktai (bh21), Pierogi expiry (81), and Shield Wall (20) against owner-turn versus global-turn boundaries.
- **Mark Menz subset choice:** both implementations change every eligible friendly card in the zone. If “as many ... as you want” is intended, a subset picker is missing; otherwise clarify the printed wording.
- **Makenna target ownership:** printed text says select up to two cards, while both implementations restrict to friendly cards. Clarify the wording or broaden the effect intentionally.
- **Conditional Fate history:** Panacea uses a per-instance history total, not an explicit replay of historical target eligibility, Abed amplification, or prior suppression. Decide whether “would have received” means raw source potency or fully modified historical gain, then test that definition.
- **Delayed search events:** Mailman/Boleslaw is now confirmed in F19. Audit other selected-deck-to-non-hand operations for the same event omission.
- **Hidden-information effects:** Oktai concealment is largely presentation-level; projections still carry numeric values. If its intended contract includes preventing a modified client from reading them, server-side redaction needs a separate protocol audit.

## Test failures requiring triage

These are observed first failures, not assumed gameplay diagnoses. Full assertions and stack traces are linked above.

| Test file | First failure category |
|---|---|
| card-interaction-audit-regression-test.mjs | Old Anicka-copy test expects +4 outside the generated row. |
| card-update-20260830-smoke-test.mjs | Looks for an obsolete tick/status shape. |
| chauffeur-catalog-regression-test.mjs | Old catalog/stat expectation: 2 versus 3. |
| havano-expanded-coverage-smoke-test.mjs | Older face-down Secules reaction expectation. |
| morale-reaction-coverage-smoke-test.mjs | Shield Wall activation/reaction expectation differs. |
| phase4-continuous-modifiers-smoke-test.mjs | Grenadier/Jimmy fixture does not establish current declared-target state. |
| phase4-coverage-expansion-smoke-test.mjs | Consolidation bonus expectation differs (4 versus 7); see F17. |
| phase4-declarations-rng-smoke-test.mjs | 1 versus 2 expectation; inspect changed card behavior. |
| phase4-landscape-change-smoke-test.mjs | Hard-coded eligible-card count: 114 versus 125. |
| phase4-landscapes-deterministic-smoke-test.mjs | Boolean behavior expectation failed; not classified as a confirmed defect. |
| phase4-landscapes-smoke-test.mjs | Expected landscape list omits igb21–igb24. |
| phase4-landscapes-triggered-smoke-test.mjs | West Coast frame count 3 versus 1; needs isolated follow-up. |
| phase4-large-batch-smoke-test.mjs | Value expectation 6 versus 5. |
| phase4-movement-smoke-test.mjs | Expected target prompt is null after changed card behavior. |
| phase4-reactions-smoke-test.mjs | Reaction opens earlier than test expects. |
| phase7-current-interaction-acceptance-smoke-test.mjs | Source-pattern assertion for automatic activation. |
| phase7-live-interaction-regressions-smoke-test.mjs | Source-pattern assertion for placement UI locking. |
| phase7-reaction-coverage-smoke-test.mjs | Reaction opens earlier than target-picker expectation. |
| phase7-reported-regressions-smoke-test.mjs | Old 3-column extra-row expectation; current extra row has 4. |
| phase7-rules-oracle-smoke-test.mjs | Old +3 Wintertide oracle label. |
| reported-gameplay-regression-test.mjs | VM stub missing clearWarfrontSpectatorLabels. |
| shizuku-aura-projection-regression-test.mjs | Whisper activity expectation differs; needs policy reconciliation. |
| ai-effect-timing-regression-test.cjs | VM stub missing applyWodnyPotokLumberjackSuppression. |
| fate-card-catalog-smoke-test.js | Source-pattern assertion for Felicyta/Taylor aura. |
| fate-reported-card-ui-regressions-smoke-test.js | Source assertion for Duelist rework. |
| fate-singleplayer-ali-parity-smoke-test.mjs | Source assertion for Ali turn boundary. |
| fate-singleplayer-board-activation-cinematic-smoke-test.mjs | Source assertion for Christopher manual registration. |
| fate-singleplayer-board-render-regression-smoke-test.mjs | Cache-buster string expectation. |
| fate-singleplayer-multiplayer-ui-parity-smoke-test.mjs | Source-pattern assertion for zone picker. |

## Per-card review index

Every catalog entry is listed below. “No specific finding” means this audit did not establish a card-specific defect; it does not certify every interaction. Cross-cutting targeting, immunity, copied effects, forced discard, duration, and modifier findings can affect more cards than the explicit reproductions. Mode-dependent definitions also differ when pressure reworks are enabled.

| ID | Card | Findings / follow-up |
|---|---|---|
| 01 | Felicyta Janowicz | No specific finding. |
| 02 | Anicka Konvicka | No specific finding. |
| 03 | Howard | No specific finding. |
| 04 | Zoe | Clarify “cannot leave field” versus locking movement off the square. |
| 05 | 17th British Regiment of Africa | No specific finding. |
| 06 | Jorge Alvarez | No specific finding. |
| 07 | Maja Kaminska | No specific finding. |
| 08 | Lina | No specific finding. |
| 09 | United Nations 5th Army | F04 |
| 10 | Post-Modernist Dylan | F03 |
| 11 | Anne Stone | No specific finding. |
| 12 | Makenna | F03; F03; target-ownership wording. |
| 13 | Johnathan Kirby | No specific finding. |
| 14 | Alondra Hopkins | No specific finding. |
| 15 | Zsofia Szocs | F09 |
| 16 | MINAE Death Squad | No specific finding. |
| 17 | Carolyn | No specific finding. |
| 18 | 1st US Marines | F20 |
| 19 | Květka Svoboda | No specific finding. |
| 20 | South Wind Spearman | Face-down/reaction and duration policy. |
| 21 | Henry Dong | No specific finding. |
| 22 | Isaac Perez | No specific finding. |
| 23 | Cathy | No specific finding. |
| 24 | Ralph's Courtesy Clerk | F04 |
| 25 | Zimbabwean Honor Guard | F08; F17 |
| 26 | UCPD | No specific finding. |
| 27 | Kazumi | No specific finding. |
| 28 | 2nd Polish-Lithuanian Army | No specific finding. |
| 29 | Dylan Kirby | No specific finding. |
| 30 | Santiago | No specific finding. |
| 31 | Oathbound Noble Fighter | No specific finding. |
| 32 | Temecula Resident | No specific finding. |
| 33 | West Caribbea Infantry | F16 |
| 34 | Rozsi Szocs | F20 |
| 35 | Alexander the Magnificient | No specific finding. |
| 36 | Marie L'amboure | No specific finding. |
| 37 | 6th French Fusiliers | F07; F08 |
| 38 | Jake | No specific finding. |
| 39 | Juan Carlos | F06 |
| 40 | Christopher Erbs | F07 |
| 41 | Jimmy | F13 |
| 42 | West German Soldier | F01 |
| 43 | Mark Kemper | No specific finding. |
| 44 | Soviet Grenadiers | F08 |
| 45 | Chingachlook | No specific finding. |
| 46 | Phil | No specific finding. |
| 47 | Great Oak Infantry | F17 |
| 48 | Cosmic GF | No specific finding. |
| 49 | Irvine Businessman | F04 |
| 50 | Berkeley CS Major | No specific finding. |
| 51 | Rivera | Affiliation-change timing and duration reviewed. |
| 52 | The Vigilantes | No specific finding. |
| 53 | Colombo Thug | No specific finding. |
| 54 | Wolf Creek Light Infantry | F02 |
| 55 | Bobby Jones | No specific finding. |
| 56 | Lydia | F20 |
| 57 | Jeremiah Jones | F09 |
| 58 | Crossroads Worker | No specific finding. |
| 59 | Czechoslovak "Maroon Knights" | No specific finding. |
| 60 | IB Student | No specific finding. |
| 61 | Maria Song | F14 |
| 62 | Berkeley Homeless | No specific finding. |
| 63 | Greek Hoplite | No specific finding. |
| 64 | Cook Islands Duelist | No specific finding. |
| 66 | Mark Menz | Subset-choice wording. |
| 67 | Mr. Secules | No specific finding. |
| 68 | Great Oak High Schooler | No specific finding. |
| 69 | Breakfast Republic Busser | No specific finding. |
| 70 | Wine Country Guerilla | F15 |
| 71 | Fort Calvin Watcher | No specific finding. |
| 72 | Robo en la Noche | No specific finding. |
| 73 | ALPINE Expeditionary | F07 |
| 74 | Selva Islands Pirate | F10 |
| 77 | Duncan Heyward | No specific finding. |
| 78 | Chaparral Hoplite | Face-down timing policy; current tests conflict. |
| 79 | Havano Citizen | F20 |
| 80 | Apparition of Berkeley | No specific finding. |
| 81 | Wojciech | Token immunity/placement/expiry paths reviewed; duration wording. |
| 82 | Felicyta Janowicz (Youth) | No specific finding. |
| 83 | Sebastyen Janowicz | No specific finding. |
| 84 | Květka Svoboda (Youth) | Opening-hand and no-draw-deck eligibility paths reviewed. |
| 85 | Felicyta Janowicz (Specters) | No specific finding. |
| 86 | Boleslaw Kopewicz | F07; F19 |
| 87 | Květka Svoboda (Ukulele) | No specific finding. |
| 88 | Rozsi Szocs (Youth) | No specific finding. |
| 89 | Zsofia Szocs (Youth) | No specific finding. |
| 90 | Wojciech (Fisherman) | No specific finding. |
| 91 | Wodny Potok Villager | F10 |
| 92 | Wodny Potok Lumberjack | No specific finding. |
| 93 | Wodny Potok Youth | F13 |
| 94 | Wodny Potok Mailman | F18; F19; F18; Boleslaw search event follow-up. |
| 95 | Carpathian Specters | No specific finding. |
| 96 | Wodny Potok Snow Shoveler | No specific finding. |
| 97 | Visegrad Politician | No specific finding. |
| 98 | Wodny Potok Skier | No specific finding. |
| 99 | Rozsi and Zsofia (Youth) | F11; F11; duration wording and structural/effective-type distinction. |
| 100 | Felicyta and Květka (Youth) | Wintertide regression passed; historical test label stale. |
| 101 | Jorge Alvarez (El Hombre Piña) | Retired; retained passive implementation inspected. |
| 102 | Anne Stone (Anarchist) | Retired; retained trap implementation and client regression passed. |
| 103 | Santiago Alvarez (General) | Retired; retained morale-payment/draw implementation and client regression passed. |
| 65 | 1st West Caribbea Marines | No specific finding. |
| 75 | The Ledger-keepers | No specific finding. |
| 76 | ALPINE Infantry | F02; F05 |
| bh01 | Anička Konvička (Voyager) | F02 |
| bh02 | Joie | F09 |
| bh03 | Ali, The Indomitable | Hand transfer/immunity/cap reviewed; legacy parity test needs repair. |
| bh04 | Anicka Konvicka (Selva Island) | F11; F12 |
| bh05 | Taylor | F07 |
| bh06 | Achille Laurent | No specific finding. |
| bh07 | Agent-K | No specific finding. |
| bh08 | Maja Kaminska (University) | F09 |
| bh09 | Alondra Hopkins (Mercenary) | No specific finding. |
| bh10 | Francisek | F10 |
| bh11 | Felicyta Janowicz (University) | No specific finding. |
| bh12 | Louis LeJeune | No specific finding. |
| bh13 | Hugh Roberts | F21; Legacy Abed multiplier follow-up. |
| bh14 | Chloe Kirk | F11 |
| bh15 | Hsei-Ling | F16 |
| bh16 | Li-Hua (Battle-Ready) | No specific finding. |
| bh17 | Jakob Eltzholtz | No specific finding. |
| bh18 | Jimmy (Post-Cynthia Hug) | No specific finding. |
| bh19 | Abed | F16; F21 |
| bh20 | Makenna (Bird Cult) | No specific finding. |
| bh21 | Oktai | Duration wording; client concealment/server projection follow-up. |
| bh22 | Jaime | Safe-square healing and morale-resolution path reviewed. |
| bh23 | Panacea Militia | F09; F09; legacy multiplier and historical-gain interpretation follow-up. |
| bh24 | Leningrad 4th Rifles | F05 |
| bh25 | ALPINE Engineer | F09 |

## Suggested fix order

1. Close the free-draw cancellation path, immune swap path, suppressed reinforcement loophole, and ALPINE placement rejection.
2. Centralize hostile aura immunity, copied-effect identity, hand arrival, and natural/forced triggered Fate resolution.
3. Resolve mode parity and card-text contracts: Juan Carlos, Fusiliers, Mailman, and non-rework definitions.
4. Repair stale fixtures and missing VM stubs, then add behavioral regressions for each finding rather than relying on source regex checks.
