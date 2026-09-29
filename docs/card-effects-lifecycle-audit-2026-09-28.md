# Lifecycle and parity audit — 28 September 2026

This is a further audit after the automatic Guerilla, Fisherman, Henry-trigger, and copied-Chingachlook fixes. No gameplay code was changed in this pass. These are additional confirmed gaps; the passing focused suites did not cover them.

## L1 — Recovered Guerilla stays unplayable in legacy singleplayer

Sequence: Guerilla automatically infiltrates the opponent's hand, completes five uses, returns to its original owner's discard, and is subsequently recovered into that owner's hand.

Legacy expiry decrements `guerilla_turnsLeft` to zero and returns the card, but leaves `guerilla_transferred:true`. Hand selection and placement interpret that flag as ongoing infiltration, regardless of the remaining uses or current holder. The recovered card cannot be set and cannot begin another infiltration on a later discard. Multiplayer clears `GUERILLA_INFILTRATING` and `HAND_EFFECT_IMMUNE` on expiry, and the reproduced recovered card can be set normally.

Evidence: actual legacy expiry block and `fatePushDiscard` executed in a VM; ten authoritative END_TURN commands followed by recovery and legal-command inspection. See `src/scripts/05-gameplay-core.js` around the Guerilla turn-start expiry and hand-selection/placement guards.

Fix direction: clear the infiltration-only flags when returning the card, while explicitly preventing the expiry discard itself from immediately reinfiltrating. Verify recovery, replay, and a second five-use lifecycle.

## L2 — Henry's selected squares remain active after he moves away in multiplayer

Sequence: set Henry next to an opposing Coordinator, select its square, then use Wolf Creek's actual placement/target/destination prompts to move Henry into another zone.

Before moving, both engines suppress the target. After moving, multiplayer still suppresses it; legacy no longer does. The authoritative `isEffectSourceSuppressed` checks that the source exists and has Henry's runtime identity, but does not require it to remain adjacent to the selected square. The legacy predicate explicitly checks current adjacency.

This confirms a mode mismatch. Henry's text describes selected squares adjacent to him; the current legacy implementation treats adjacency as an ongoing requirement. If selections are intended to remain effective after movement, that contract would instead require changing legacy. Do not silently choose a different rule while repairing parity.

Fix direction: unify the current-position condition, then test moving away, moving back, removal, copied Henry, and Maja transition triggers.

## L3 — Legacy Henry ignores Chloe's current card type

Two cases were reproduced:

| Chloe's change before placement | Multiplayer Henry | Legacy Henry |
|---|---|---|
| Zsofia: Coordinator → Supporter | Does not suppress | Still suppresses |
| Taylor: Initiator → Coordinator | Suppresses | Does not suppress |

The legacy predicate checks printed `card.type`; Chloe preserves that field and records `_bh14DeclaredType`. Multiplayer checks `effectiveCardType`. The diagnostic uses the actual authoritative type-change operation while the target is in hand and actual legacy suppression functions with the equivalent declared-type state. Board positions/ownership are fixtures, not an end-to-end Chloe match.

Fix direction: use the same effective-type contract for suppression and its transition detection in both engines. Test changing a source's own classification and immunity separately.

## L4 — Hsei-Ling bypasses ALPINE Infantry's immunity during its self-gain

Sequence: control Hsei-Ling, then set ALPINE Infantry. No Abed is involved.

ALPINE begins at 1 and its own effect adds 5. Multiplayer produces **7**, because the generic gain handler adds Hsei-Ling's external +1 while resolving the permitted self-effect. ALPINE's immunity allows its own effect; it should not thereby allow another card's bonus. The legacy human/AI ALPINE branches set its Fate to the normal 6 and do not apply that rider.

Evidence: public SET_CARD command in `tmp/card-audit-lifecycle-probes.mjs`; `shared/engine/operations.mjs`, `changeFate`, gathers Hsei-Ling sources after self-target immunity checks without excluding immutable recipients. This finding does not assume that any gain is permanent.

Fix direction: separate intrinsic self-effects from external riders. Cover immune recipients for both stored gains and derived aura gains.

## Validation and limits

- Re-ran the main, expanded, follow-up, boundary, and legacy-main audit regression suites: all passed.
- Re-ran final-card expiry, source-status presentation, and Santiago reveal regressions: all passed.
- Copied-placement matrix: **2,518 offered commands, zero rejected offers**.
- Latest saved branching sweep: **1,024 scenarios, 7,540 command/replay comparisons**, zero reported failures/skips/truncations. This is bounded prompt sampling with constructed states, not all interaction sequences.
- Broad suites rerun: **56 authoritative files: 34 pass / 22 fail; 14 legacy files: 7 pass / 7 fail**. Passing/failing file sets match the original audit baseline. That does not establish that every failure is harmless, or that later assertions in failing files ran.
- The initial broader rerun was blocked by an approval-review usage limit. After the user requested continuation, execution became available and the reruns above completed.
- No live browser or real two-client multiplayer test was performed. Serialization comparison does not substitute for socket reconnect/UI coverage.
- Earlier gain-permanence conclusions were withdrawn in the prior reports. The unresolved classification questions are not treated as fixed here.

Reproduce the new findings with `node tmp/card-audit-lifecycle-probes.mjs`. Observations are saved to `tmp/card-audit-lifecycle-probe-results.json`. The diagnostic reports actual results; a zero process exit code does not mean that those results satisfy the intended rules.
