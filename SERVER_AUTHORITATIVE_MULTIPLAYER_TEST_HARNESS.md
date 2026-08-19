# Server-Authoritative Multiplayer Shipping-Path Harness

## Certification rule

Only `fateV3PresentationE2E=1` is certification evidence. It runs the production presentation clock, animations, cinematics, modals, renderer, Phase 7 client adapter, legal-command generator, and authoritative reducer.

`fateV3FullUiE2E=1` remains a fast diagnostic mode. It is useful for locating rule failures, but its release gate always reports `NON_SHIPPING_PRESENTATION_MODE` because presentation is disabled.

Once matchmaking creates a scenario, the exact harness may interact only through visible production controls, pointer gestures, and modal choices. Direct `sendCommand` fallback is disabled. It can be enabled only in fast diagnostic mode with `e2eAllowDiagnosticFallback=1`, and any such run is non-certifying.

## Allowed deterministic setup

Before the match begins, test auth may select:

- both forty-card decks;
- opening cards and ordered deck cards;
- the landscape;
- the scenario/interaction variant;
- the two temporary test identities.

After the coin screen appears, no test-only effect resolver or state mutation is permitted. Coin choice, placement, consolidation, prompts, reactions, turns, and endgame all use the shipping pathways.

Exact decks rotate through broad Supporter and Character pools on both seats. No card, including Post-Modernist Dylan, is universal scaffolding. The target and adversarial partners are repeated enough to become playable, but the remaining slots vary by card, variant, match index, and seat.

The full campaign covers 107 target cards with ten shipping-path matches each (1,070 matches total). Only Jorge Alvarez and IB Student are exempt as the explicitly allowed basic deck-search cases. Jonathan Kirby, Crossroads Worker, Lina, and every other multiplayer-eligible card remain included because search ownership, empty-source behavior, chained placement, reactions, and presentation still need organic evidence.

The authenticated fixture may set consolidation cost to zero in effect-focused variants. This changes only the amount of Reinforcement required: a Character still uses the real consolidation UI, selects a real tribute/destination, sends the real command, and plays the real consolidation presentation. The shortcut is forbidden for the baseline variant and for any card or landscape whose oracle mentions Supporters, Reinforcement, tributes, or consolidation cost. Every match records `REAL` or `ZERO_COST`, and every card needs at least one complete `REAL` match.

## Per-card obligation gate

Match count is not certification. Each card contract is expanded into individual positive, prerequisite, beneficiary, target, cardinality, duration, use-limit, state, presentation, and forbidden/no-trigger obligations. The ten variants distribute those obligations across baseline, cancel, negate, suppress, immune-target, duplicate/use-limit, empty-prerequisite, landscape, and opposite-seat scenarios.

A clean match may automatically prove only what was actually observed. It cannot prove an invalid action was rejected merely because no error occurred. Negative, cleanup, ownership, immunity, cancellation, prerequisite, and repeated-use obligations require dedicated probe evidence. Any unobserved obligation leaves the card uncertified and is reported as `UNOBSERVED_RULE_OBLIGATIONS:<count>`.

The empty/ineligible variant builds the absence into the fixture. For deck-search effects it removes every eligible card from the deck and leaves only the single target/partner copies moved to the opening hand. `EFFECT_SKIPPED` is accepted only when the same source emitted no activation, mutation, or pending prompt; after the production renderer settles, the harness also verifies that no modal or activation cinematic appeared.

Use limits are checked against real server-issued legal commands after the first, second, or third use, including same-turn retry attempts and live reaction prompts. Timed statuses receive duration evidence only after the harness observes their entire canonical countdown and final removal. A skipped effect is tracked separately from `EFFECT_RESOLVED` and can never satisfy an eligible-resolution obligation.

## Assertions at every settled authoritative revision

The harness waits for the production renderer to commit the same revision and then verifies:

- coin screen, result text, and both turn-order choices;
- active-player turn number, ownership label, and ownership CSS state;
- local and opponent rendered hand counts;
- opponent-hand privacy;
- authoritative board positions, controllers, geometry, and effective Fate;
- both clients' public-state convergence;
- visible Adaptive Tactics artwork and broken image assets;
- one status banner per owner/card/effect group;
- status multiplicity label and count;
- authoritative status presence and lifetime;
- Lydia and Secules ready/consumed banner state;
- visible local prompt modals;
- visible opponent reaction waiting window;
- production overlay identity;
- cinematic, result, modal, and consolidation-motion ordering;
- the redesigned endgame screen and all three zone results;
- browser exceptions, unhandled rejections, and console errors.

## Failure and stall behavior

A failed gesture is never replaced by a direct legal command. The failure bundle records the deterministic deck, match/revision, legal command, visible modal, both public projections, rendered status banners, hit-map counts, presentation trace, recent oracle findings, and input trace.

If a production UI cannot become interactive or cannot advance for 12 seconds without an active presentation, the scenario is marked failed and disconnected. The harness advances to the next requested scenario instead of waiting for the turn timer. Failed scenarios remain release-gate failures and are never counted as completed matches.

## Launching one exact ten-match batch

Launch both commands at the same time:

```powershell
npm run electron:beta:e2e:shipping:a
npm run electron:beta:e2e:shipping:b
```

For larger campaigns, use the existing `electron:beta:e2e:organic:timing:a` and `:b` commands with matching run IDs and non-overlapping `e2eStartIndex` ranges.

## Throughput policy

Use two-client pairs. Two simultaneous pairs are the recommended ceiling for routine runs so animation timing remains representative and GPU/main-thread contention does not create false presentation failures. Additional pairs must first pass a timing calibration batch on the machine.

The August 9, 2026 local calibration completed a full 20-turn shipping-path match in 205.8 seconds. It drove 69 accepted client actions and performed 1,113 rendered checks with no browser, authority, cross-seat, presentation-order, gameplay-oracle, or DOM violations. Allowing for effect-heavy scenarios and matchmaking/reset overhead, budget 14-18 complete matches per hour for one pair or 28-36 per hour for two pairs. That makes a 100-match certification batch roughly 3-4 hours and 1,000 matches roughly 28-36 hours on this machine.

Fast diagnostic totals and authoritative Node simulations must never be reported as shipping-path certified matches.
