# Expanded card-effects audit — 28 September 2026

## Wording correction

The subsequent text recheck found that Maja University's +2 and Hsei-Ling's +1 do not explicitly say permanent. The earlier fix chose permanent Maja gains for mode consistency, but that choice and the asserted Abed multiplier for Hsei-Ling are not justified by printed wording alone. Treat those intended-rule conclusions as unresolved, not approved solely because regression tests pass. Panacea's own text explicitly says it permanently gains Fate; that is a separate classification.

## Fix status

All five findings below have now been addressed locally. Maja's natural and Engineer-triggered gains are permanent in both engines, matching the authoritative behavior and history calculation. Hsei-Ling's derived-aura rider applies Abed without recursively triggering another rider. Panacea uses effective Coordinator type and runtime trigger identity for human, AI, and authoritative selection; face-down sources remain eligible. Copied Alondra uses runtime identity and the shared suppression check in legal placement generation.

Validation: the new `server/authoritative-v3/card-audit-expanded-regression-test.mjs` passes, including public-command Panacea inheritance from copied/face-down sources and suppressed copied-Alondra placement. The main authoritative, follow-up, legacy, Panacea, and Engineer regression suites pass. The catalog sweep remains 512/512 clean. Syntax checks and `git diff --check` pass. No live multiplayer session or deployment was performed. The findings below retain the original audit evidence for reference.

This continues the 27 September audit and its approved fixes. This pass adds diagnostics and this report; it does not change gameplay rules. Findings below are additional work, not a reversal of the user's decisions about Youth, face-down effects, Honor Guard, West Caribbea, Great Oak, Rozsi, Mailman, Mark Menz, Makenna, or Oktai.

## Confirmed findings

### A1 · P2 · Maja's Fate gain differs between singleplayer and multiplayer

With one active Abed effect, one Maja University suppression/negation trigger grants **2 Fate in singleplayer and 4 in multiplayer**. Singleplayer's natural trigger passes `type:'temporary'` to `applyPairedOverlayFateGain`; multiplayer's `MISCHIEVOUS_ACTIVITIES` operation uses the default permanent-gain behavior. The Engineer forced-proc path also needs to follow the chosen classification.

Evidence: `src/scripts/05-gameplay-core.js`, `triggerMajaMischievousActivities`; `shared/engine/triggers.mjs`, `EFFECT_REACTED` handling. Executable probe uses the actual legacy trigger and gain functions in a VM, and the actual authoritative rule-event handler. Presentation functions are stubbed; no Hsei-Ling is present.

Fix direction: choose one gain classification and use it consistently in natural triggers, Engineer, and history calculation. The catalog says “gain 2 Fate” without explicitly specifying permanence; this report establishes the mismatch rather than choosing a new rule.

### A2 · P2 · Panacea's Maja history exceeds the gain it is supposed to represent

In the same singleplayer reproduction, Maja actually grants **2**, but `_triggeredFateHistoryTotal` increases by **4**. The recently added history helper always applies permanent-gain potency, even though Maja's gain is temporary in this path. Panacea therefore inherits an inflated historical total before applying modifiers to its own separate permanent gain.

This is a gap in the previous history fix. Keep Panacea's own permanent-gain classification; fix the historical calculation to use the source trigger's actual rules. A1 and A2 should be resolved together.

### A3 · P2 · Hsei-Ling's permanent rider misses Abed when an aura raises Fate

With Hsei-Ling and Abed active, placing a Supporter-buffing Coordinator (11) increases an existing Supporter's aura Fate. The authoritative derived-aura handler grants Hsei-Ling's additional **1 permanent Fate**, instead of **2** under Abed. Its `commitPermanentFate` call adds the source count directly. The normal gain path and the legacy rider apply Abed to that permanent rider.

Evidence: `shared/engine/operations.mjs`, `applyChineseMacArthurToDerivedAuraGains`, compared with `changeFate`; `src/scripts/05-gameplay-core.js`, `applyChineseMacArthurFateRider`. The probe observes stored Fate separately from effective aura Fate so it does not mistake the temporary aura increase for a permanent increase.

Fix direction: apply the permanent-gain modifiers to the rider without recursively triggering Hsei-Ling. Cover aura entry, movement, suppression removal, and multiple Hsei-Ling sources.

### A4 · P2 · Panacea's selection ignores current Coordinator eligibility

The picker and inheritance interpreter whitelist physical IDs `15`, `bh02`, and `bh08`:

- A Zsofia reclassified by Chloe as a Supporter remains eligible.
- Taylor copying Zsofia and reclassified by Chloe as a Coordinator is excluded, even though its runtime trigger can accumulate history.
- Multiplayer additionally excludes face-down sources through `faceUp:true`. This does not follow from Panacea's printed text and conflicts with using the current intentional active face-down behavior as the general rule.

Copying alone does **not** make Taylor a Coordinator; the reproduction explicitly changes its effective type. The copied-source finding does not assume otherwise.

Evidence: `shared/engine/cards/registry.mjs`, `bh23`; `shared/engine/reducer.mjs`, `INHERIT_TRIGGERED_FATE`; `shared/engine/prompts.mjs`, `eligibleBoardTargets`. Both legacy human and AI Panacea branches also use the physical-ID whitelist.

Fix direction: validate effective Coordinator type and runtime triggered-gain capability in both selection and resolution. Preserve the agreed face-down policy rather than globally disabling hidden effects.

### A5 · P2 · Copied Alondra produces a misleading legal placement

An opposing Taylor copying Alondra (14) stands next to an empty neutral-row square. `legalCommandTemplates` offers setting a friendly Supporter in that square. Executing that exact placement returns `ILLEGAL_PLACEMENT: Alondra blocks an adjacent opponent Supporter set`.

The operation correctly enforces the copied lock; the legal-command helper `opponentAlondraBlocksSupporterSet` still checks physical ID `14`. This can offer unusable choices to consumers of the legal list, including AI/planning/UI paths. This probe establishes the mismatch, not that every UI exposes it or that a live AI necessarily loops.

Evidence: `shared/engine/legal-commands.mjs`, `opponentAlondraBlocksSupporterSet`; executable public-command reproduction in the expanded probes.

Fix direction: use the same runtime identity and suppression predicate as placement validation.

## Coverage and reproducibility

Run from the repository root:

```text
node tmp/card-audit-expanded-probes.mjs
node tmp/card-audit-catalog-sweep.mjs
node tmp/card-audit-expanded-runner.cjs
```

- **128 catalog entries × 2 seats × 2 pressure-rework settings = 512 authoritative smoke scenarios**, all completed without rejected commands or invariant violations after correcting fixture assumptions. These exercise placement, an available manual activation, and generated prompt choices.
- The sweep sets turn 18 and zeroes the source's consolidation cost to isolate effect execution. It supplies a small shared board, selects one generated answer per prompt, moves opening-hand Ali back for placement coverage, and places Chingachlook in an empty zone. It does not establish correct tribute costs, opening-hand Ali semantics, all prompt alternatives, all passive outcomes, or all pairwise combinations. A clean smoke scenario is not an assertion that its numerical effect is correct.
- **18 additional/confirmation test files: 12 pass, 6 fail.** This includes passing determinism, automatic/resolved AI timing, landscape picker, Moscow turn-20, hidden-Fate display, support-company picker, Havano choice UI, public combo/planning, and the two new authoritative audit regression suites.
- The six failures occur at: reaction-before-target prompt expectation (`engine-smoke`); old 16-versus-current-20 landscape count (`archive-expansion`); changed Carolyn status identifier (`archive-privacy`); hard-coded asset version (`ledger-archive`); automatic Guerilla transfer expectation before the new optional choice (`presentation-source-status`); and a source-regex expectation for face-down assignment (`mark-menz-overlay`). These failures do not independently demonstrate new gameplay defects. Each file stops at its first assertion, so later checks remain unverified.
- Multiple Abed statuses were probed as a negative control: Joie gain and recorded history both remain 2. Current engines deliberately cap that potency rather than stacking it; no finding was opened for it.
- Raw results: `tmp/card-audit-expanded-probe-results.json`, `tmp/card-audit-catalog-sweep-results.json`, and `tmp/card-audit-expanded-suite-results.json`.

## Still unverified

The earlier 70-file audit has existing failures documented in the original report; this pass does not make that suite green. No live two-client multiplayer or browser click-through was performed. The legacy Guerilla modal/turn-end race, all reconnect points during pending choices, and every landscape/card/copy/suppression combination need further targeted coverage. Low-level transfer immunity concerns were not promoted to findings without a reachable public-command reproduction. The total history model under unusual recipient-specific restrictions also needs broader tests.

This audit now includes a catalog-wide execution sweep and confirmed interaction counterexamples. It is not a proof that no other defects remain.
