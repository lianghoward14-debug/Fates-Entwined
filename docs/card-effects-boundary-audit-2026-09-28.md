# Further card-interaction audit — 28 September 2026

## Implemented follow-up

The user confirmed Fisherman is a search effect and Guerilla transfer is automatic. Fisherman's legacy human/AI gain paths now skip intrinsically immune cards, and the AI no longer calls Joie's draw trigger. Henry's authoritative suppression transitions emit Maja's trigger; legacy continuous reconciliation tracks newly suppressed cards and avoids duplicate triggers. Consolidation command generation now uses the shared placement restriction check for copied Chingachlook. Guerilla transfers synchronously on an eligible discard in both modes; the optional queues and modal are removed, while suppression and five-use expiry remain enforced.

Validation: `card-audit-boundary-regression-test.mjs`, main/follow-up/expanded audit suites, legacy main suite, final-card expiry suite, presentation status suite, and Santiago reveal regression pass. The copied-placement matrix has 2,518 offers and zero rejected offers. The 512 catalog smoke scenarios pass. Syntax and whitespace checks pass. No deployment or live two-client test was performed. The withdrawn permanence assumptions below were not used to change gain amounts in this follow-up.

## Correction after checking the printed text

B1's asserted +10 and B2's asserted +8 are withdrawn as intended-rule conclusions. Neither Maja 07 (“gain 4 Fate”) nor Fisherman 90 (“gain 3 Fate”) says permanent. Hsei-Ling's additional +1 also does not explicitly say permanent. The reproduced mode differences remain observations, but implementation labels and UI descriptions do not establish that Abed should apply. These gain classifications need to follow the intended rules before changing amounts. B3 (immunity), B4 (search versus draw), B5 (suppression trigger), B6 (offered/rejected placement), and B7 (pending-choice lifecycle) do not depend on those permanence assumptions.

The earlier change making Maja University gains permanent also rested on implementation consistency, not explicit printed permanence. Its text says only “gain 2 Fate”; that earlier choice is not established by the card wording. No runtime changes were made during this wording recheck.

This pass audits beyond the five fixes in `card-effects-expanded-audit-2026-09-28.md`. It adds diagnostic scripts and documentation, not gameplay changes. The previously clarified rules remain unchanged.

## Confirmed findings

### B1 · P2 · Original Maja's search bonus bypasses Abed in singleplayer

This is **Maja Kaminska (07), Oblique Order**, not Maja University (bh08).

With Abed and one Hsei-Ling active, a searched Supporter receives **+6** in the legacy human path instead of **+10**. The +4 permanent base gain is written directly; only Hsei-Ling's +1 rider receives Abed's multiplier. Multiplayer correctly grants `(4 + 1) × 2 = 10`. The AI uses the same direct base mutation.

Evidence: `src/scripts/05-gameplay-core.js:8851`, `src/scripts/07-ai.js:4182`. The diagnostic executes the actual human switch branch and actual legacy rider function, and compares against an authoritative consolidation and prompt answer.

Fix direction: route the +4 through the normal permanent-gain calculation in both legacy paths. Keep search arrival and Boleslaw notification ordered correctly and avoid applying the rider twice.

### B2 · P2 · Fisherman's search bonus bypasses Fate modifiers

With Abed and one Hsei-Ling active, **Wojciech (Fisherman), 90**, grants a searched card **+3 in multiplayer** and **+5 in the legacy human path**, instead of **+8**. Multiplayer's random transfer calls `commitPermanentFate` directly and invokes neither modifier; legacy directly adds 3 and then invokes Hsei-Ling's doubled rider. The AI has the same direct mutation pattern as the human path.

Evidence: `shared/engine/operations.mjs:1990`; `src/scripts/05-gameplay-core.js:9157`; `src/scripts/07-ai.js:4555`. The authoritative reproduction uses normal consolidation and the affiliation prompt, with exactly one matching deck card to eliminate random-selection uncertainty.

Fix direction: centralize the random-search bonus in the existing gain resolver. It is already treated as permanent by the authoritative implementation. Preserve search events and random selection/shuffle behavior.

### B3 · P2 · Fisherman increases an intrinsically immune card's Fate in singleplayer

The legacy Fisherman branch writes +3 before checking immutability. Its immutability check only governs the explanatory hand modifier, not the gain. With ALPINE Infantry (76) as the selected card, the VM reproduction records **+5** with Abed and Hsei-Ling, despite the card's effect immunity. The base +3 is unconditional; this is not solely a rider issue. The AI repeats the same pattern.

Evidence: the lines listed under B2 and the `90-immune` diagnostic. The VM exposes an immutability predicate that returns true for 76, demonstrating that this branch still mutates the card. The authoritative random-search bonus explicitly skips immutable cards, so this also differs by mode.

Fix direction: use the shared gain/immunity path. Test search delivery and Fate modification independently; this finding concerns the illegal Fate increase, not whether this card may be found by a search.

### B4 · P2 · Fisherman's AI path incorrectly triggers Joie

The AI's Fisherman branch calls `triggerJoieDrawEffectPassive` before selecting cards. Fisherman adds searched cards; the human branch and authoritative registry do not emit a draw-effect activation. Executing the actual AI branch calls the draw-trigger callback **once**, where the corresponding search should call it zero times.

Evidence: `src/scripts/07-ai.js:4538`. This can award extra Joie Fate/history only when the legacy AI resolves Fisherman. The old `phase4-declarations-rng` test expecting a Fisherman draw trigger conflicts with the current authoritative search behavior; it should not be used to justify changing all searches into draws.

Fix direction: remove the AI-only draw classification while retaining the proper deck-search notification to Boleslaw.

### B5 · P2 · Henry's suppression does not trigger Maja University in multiplayer

Place Maja University, then set Henry and choose an adjacent square occupied by an opposing Coordinator. The target becomes suppressed, but Maja gains **0 instead of 2**, and her trigger history remains **0**. Thus Panacea also misses that historical gain.

The public-command reproduction confirms `isEffectSourceSuppressed` is true after Henry's prompt resolves. Creating the square status emits a square-status event; Maja listens for `EFFECT_REACTED`, which this suppression does not emit.

Evidence: `shared/engine/cards/registry.mjs`, card 21; `shared/engine/operations.mjs`, `createSquareStatus`; `shared/engine/triggers.mjs`, `EFFECT_REACTED` handling for bh08.

Fix direction: represent actual transitions into suppression consistently, including occupied squares and later entry. Deduplicate transitions so continuous aura reevaluation does not repeatedly grant Fate. Test suppression removal, renewed suppression, immune recipients, and copied Henry separately.

### B6 · P2 · Taylor copying Chingachlook still produces false legal consolidations

After Taylor copies Chingachlook through its normal public effect, the legal list offers consolidating another Character in its zone. Submitting that offered command returns `CHINGACHLOOK_ZONE_RESTRICTED`.

This is analogous to the previously fixed copied-Alondra problem, in a different predicate. The legal-command generator uses physical ID 45 for the existing zone restriction; placement validation uses runtime identity. A focused matrix found ten rejected offered commands across both seats, all in this family. Explicitly suppressing the copied source removed the mismatch in the tested cases.

Evidence: `shared/engine/legal-commands.mjs:408–418`, compared with `consolidationPlacementCheck` in `shared/engine/modifiers.mjs`. The small public-copy reproduction rules out an impossible synthetic copied state.

Fix direction: share the full restriction predicate between command generation and execution, including effective types, runtime identity, suppression, uniqueness, and rework settings. Do not fix only one physical-ID comparison.

### B7 · P2 · Deferred Guerilla choices do not reliably hold the legacy turn

The optional Guerilla choice is queued on a timer. Before its modal opens, `endTurn` does not check the queue. An isolated execution of the actual function reaches the turn-mutation section while a choice remains pending. Moreover, `isTurnEndDeferrableModalOpen` deliberately returns false during an AI turn; calling the actual `endTurn({aiCompletion:true})` passes its interaction guards even with a modal open. A human-owned Guerilla choice caused during the AI turn can therefore be overtaken by AI completion.

Evidence: `src/scripts/00-structural-helpers.js:1659`, `src/scripts/05-gameplay-core.js:376` and `:638`. The VM stops at `resetInteractionState` with a sentinel after the guards; it proves the guard gap, not the full visual outcome of a live match. This is a gap in the optional-choice implementation from the earlier fix pass.

There is also a confirmed queue-lifecycle weakness: if the generic `closeModal` closes the first of two queued Guerilla windows without executing either choice action, one choice remains with **zero scheduled callbacks**. The queue only advances inside those actions. This was reproduced at function level; no dedicated Escape/backdrop dismissal was established for this modal, so it is recorded as a programmatic-dismissal edge case rather than a claimed normal user click path.

Fix direction: track the pending choice independently of the modal/timer, defer human and AI turn completion until it settles, and make all dismissal/replacement paths resolve or retain the queue explicitly.

## Rules questions and unconfirmed concerns

- An opponent-immune Youth is still considered suppressed by the global Marines timed status. The source-suppression helper and activation-availability helper treat that immunity differently. The diagnostic confirms suppression/rejection, but this report does not choose whether a player-wide activation prohibition is intended to bypass card immunity. The observed output shows `generated:false`; there is no demonstrated offered-command mismatch in that fixture.
- Several pile-selection filters still use printed `card.type`, while board effect selectors use effective type. Chloe/reclassification plus return-to-deck effects need an explicit search/type contract and targeted tests before treating every such filter as a defect.
- Low-level transfer checks alone do not establish an exploit through public commands. No new transfer-immunity finding is asserted here without a reachable reproduction.

## Coverage

- Catalog branching sweep: **1,024 scenarios** (128 cards × two seats × four configurations: ordinary, Abed/Hsei modifiers, immune targets, and hidden board targets).
- **7,540 command executions**, each repeated after JSON serialization of the pre-state; **zero command/replay divergences, command rejections, or state invariant failures** after correcting two test-fixture mistakes. All scenarios ran; none hit the 100-node scenario budget.
- Prompt exploration takes up to the first 12 generated alternatives per node. It does not enumerate every arbitrary target subset or every order of actions. Placement cost is zeroed to isolate effect execution; the source itself is not always face-down in the hidden-target configuration.
- Copied-placement matrix: **2,528 offered placements/consolidations**, spanning six restriction/aura identities, physical versus copied sources, three suppression conditions, and both seats. **Ten rejected commands**, all represented by B6. This tests false-positive legal offers; it does not prove that every legal move was offered.
- Two complete AI games with normal costs and turn flow finished successfully: **74 commands / turn 12** and **58 commands / turn 10**, using Relentless Maelstrom versus The Free World, alternating which seat uses the deeper AI policy. These are completion checks, not a comprehensive deck matchup corpus.
- Targeted numerical and lifecycle probes independently reproduce B1–B7. Legacy probes execute extracted current functions/switch branches with presentation/UI dependencies stubbed. They are not browser click-throughs.

- Landscape sweep: all 128 cards and both seats across **igb4, igb9, igb15, igb19, igb22, and igb24**. The first run completed 1,534 scenarios and **11,788 command/replay checks with zero failures**, with two Chingachlook fixtures lacking payable placements and two West German Soldier scenarios reaching the branch budget. A focused follow-up provided the required tribute and increased the branch budget: **all four passed, 282 additional command/replay checks, no skips or budget truncation**. This gives placement/effect coverage for all 1,536 intended card/seat/landscape cases, under the documented sampling limits. These scenarios do not prove every landscape's complete lifecycle: for example, the fixed turn-18 fixture does not exercise ten full turns of Moscow board tenure.
- Across the two branching sweeps and follow-up: **19,610 command/replay comparisons**. Landscape output: `tmp/card-audit-landscape-sweep-results.json`; follow-up: `tmp/card-audit-landscape-followup-results.json`.

## Reproduction

```text
node tmp/card-audit-boundary-probes.mjs
node tmp/card-audit-placement-matrix.mjs
node tmp/card-audit-deep-sweep.mjs
node tmp/card-audit-deep-sweep.mjs --landscapes
node tmp/card-audit-deep-sweep.mjs --followup
node server/authoritative-v3/new-ai-full-game-test.mjs 2
```

Diagnostics save observed results rather than exiting unsuccessfully for every known mismatch. Read the `failures`, `rejection`, `expected`, and actual-value fields; process exit zero alone does not mean the audited rules passed.

The existing stale/failing repository suites remain described in the earlier reports. No live two-client multiplayer session, reconnect through a real socket, or full browser UI run was performed. These limits and the new counterexamples mean the game cannot yet be described as free of card-interaction defects.
