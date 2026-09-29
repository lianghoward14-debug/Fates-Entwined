# Consolidated card-effects audit — 28 September 2026

## Fix follow-up — 29 September 2026

The confirmed lifecycle and numerical findings below are now fixed locally in the applicable singleplayer, AI, and authoritative paths. Historical descriptions below explain the original failures, not the current implementation.

- Guerilla clears infiltration state on expiry and explicitly skips immediate reinfiltration during its return to discard.
- Henry requires current adjacency in authority, matching legacy, and legacy suppression reads the current effect type.
- Ordinary and Whisper auras use effect-facing classifications while structural placement rules remain separate. Jeremiah checks each source's current type; copied effects alone do not make Taylor a Coordinator.
- The user confirmed Jeremiah strengthens both ordinary and Whisper Dylan to −4. Both check opponent immunity.
- Honor Guard excludes ALPINE from its qualifying-neighbor condition. Intrinsically immune self-gains do not receive external Hsei or Abed riders.
- The user confirmed Abed doubles only explicitly permanent gains. Maja 07, Fisherman, Maja University (including Engineer procs), and Hsei's riders now follow that rule. Trigger history records the same gain calculation; Panacea's explicitly permanent inheritance remains separate.
- Type-specific pile searches use the surviving declared type in authority and relevant human/AI searches. Rarity restrictions remain in force.

Correction to the original search example: Taylor is a Star and High Schooler explicitly excludes Stars, so Taylor's exclusion was not evidence of a bug. The permanent public-command regression instead uses non-Star Dylan Kirby changed into a Coordinator, returned by Hugh, and searched successfully. The inverse Zsofia-to-Initiator case is excluded correctly, in both seats.

Validation: ten focused suites pass (main authority/legacy, follow-up, expanded, boundary, lifecycle, Chloe search, Panacea, Engineer, final-card expiry). Both 5,842-case aura regressions pass: 11,684 comparisons with zero differences and explicit checks for the two shared-engine errors. Syntax checks and `git diff --check` pass. These checks do not replace live two-client networking/UI testing. No deployment was performed.

This is the current outstanding-issues ledger. Earlier reports retain their historical evidence, including findings subsequently fixed or withdrawn. This continuation adds diagnostic scripts and this report; it does not change gameplay code. It does not give the game a clean bill of health.

## Rules retained

- Youth counts once per physical source. Face-down behavior remains intentional.
- Honor Guard is an adjacency aura. West Caribbea heals Morale, and Great Oak damages Morale; their retired effects must not return.
- Mailman delivers after four subsequent owner-turn starts. Rozsi/Zsofia Youth lasts five global turns including activation.
- Suppressed Regiment still contributes through an active Rozsi aura.
- Fisherman is a search. Guerilla transfers automatically. Mark Menz, Makenna, and Oktai retain the user-approved behavior.
- Panacea explicitly gains permanent Fate. That does not establish that the underlying Maja/Fisherman/Hsei gains are permanent. Earlier conclusions to that effect remain withdrawn.

## Outstanding lifecycle findings

These remain open; detailed reproductions are in `card-effects-lifecycle-audit-2026-09-28.md` and `tmp/card-audit-lifecycle-probes.mjs`.

| ID | Mode | Concrete failure |
|---|---|---|
| L1 | Singleplayer | After Guerilla finishes its five uses, returns to discard, and is recovered, its old infiltration flag still prevents setting it. Multiplayer clears the equivalent flags. |
| L2 | Mode mismatch | Move Henry to another zone after selecting a suppression square: singleplayer stops suppression; multiplayer keeps it. The engines need one explicit ongoing-adjacency rule. |
| L3 | Singleplayer | Henry still suppresses a printed Coordinator changed into a Supporter, and misses a printed Initiator changed into a Coordinator. |
| L4 | Multiplayer | Setting ALPINE with Hsei-Ling present produces 7 stored Fate instead of its intrinsic 6: an external rider bypasses immunity through the allowed self-effect. |

## Newly reproduced numerical failures

### N1 — Chloe changes are ignored by several singleplayer Fate calculations

The structural type used to pay placement/consolidation costs is being reused for effect-facing eligibility. Those are different questions. The authority generally uses the declared effect type for these auras; legacy does not consistently do so.

| Setup | Singleplayer | Multiplayer | Explanation |
|---|---:|---:|---|
| Anne with Zsofia changed to Supporter | 5 | 8 | Legacy misses Anne's +3. |
| Anne with Ralph changed to Dauntless | 4 | 1 | Legacy wrongly retains Anne's +3. |
| Cathy with Zsofia changed to Supporter | 7 | 5 | Legacy wrongly retains Cathy's +2 Character bonus. |
| Cathy with Ralph changed to Dauntless | 1 | 3 | Legacy misses Cathy's +2. |
| Maroon Knights with Zsofia changed to Supporter | 5 | 6 | Legacy misses the +1 Supporter bonus. |
| Agent-K adjacent to Zsofia changed to Dauntless | 5 | 7 | Legacy does not count the new Dauntless type. Changing an original Dauntless into a Supporter produces the opposite error. |
| Felicyta adjacent to Rozsi Youth, with Youth changed to Supporter | 9 | 7 | Legacy still counts Youth itself as a Character for its +2-per-Character effect. |

This is one family of classification defects, not hundreds of independent bugs. It also connects to Henry's L3. The affected code is in `getEffectiveFate`, `isCardSupporterForRules`, and `isCardCharacterForRules`; Agent-K directly reads printed `type`.

Fix direction: distinguish structural placement rules from current effect type explicitly at each consumer. Do not globally replace structural rules, since doing so would also change consolidation permissions. Test both directions of conversion, including self-counting sources.

### N2 — Jeremiah's potency eligibility is inconsistent for copied and reclassified auras

Two different cases:

1. **Singleplayer gives Taylor an extra potency point without making him a Coordinator.** Taylor copying Anne, with Jeremiah present, gives a 1-Fate Supporter a total of **5** in singleplayer versus **4** in multiplayer. Taylor is still an Initiator. The same extra point was reproduced for copied Felicyta, Kvetka, and Duncan with eligible recipients. Legacy adds the zone's Jeremiah count directly without checking the copied source's type.
2. **Both engines still boost Anne after Chloe changes her into a Supporter.** A 1-Fate Supporter receives Anne's +3 and an additional +1 from Jeremiah, reaching **5**. Using Anne's current Supporter classification would give **4**. The dedicated potency helpers check printed `type === 'Coordinator'`.

Fix direction: use the aura source's current effect type consistently, independently of its copied effect identity. Copying a Coordinator effect alone must not silently change Taylor's type.

### N3 — Whisper's copied Dylan aura bypasses immunity in singleplayer

Place a Whisper token copying Dylan in another zone. Give the opponent's 5-Fate Zsofia opponent-effect immunity. Multiplayer leaves her at **5**; singleplayer reduces her to **2**. The ordinary legacy Dylan branch checks immunity, but the separate field-wide Whisper branch does not.

The fixture uses the real Whisper activation predicate and Fate calculators, with equivalent explicit immunity state. It does not depend on changing the intentional face-down rule.

A related, separate mode mismatch: with an opposing Jeremiah next to the Whisper source and an unprotected 5-Fate target, singleplayer produces **1**, multiplayer **2**. Legacy applies -3 minus potency to Whisper Dylan while authority keeps -3. Ordinary Dylan also keeps -3. Unify ordinary/copied behavior after specifying how Jeremiah should modify negative auras; do not infer the intended sign from one implementation.

### N4 — Honor Guard counts ALPINE toward a bonus in both modes

Control Honor Guard elsewhere on the board. Place Agent-K next to ALPINE Infantry, with no other adjacent matching-affiliation card. Both share Expanded Worlds. **Both engines give Agent-K 4 instead of 3**, because ALPINE satisfies Honor Guard's same-affiliation-neighbor condition.

ALPINE's text explicitly says it cannot be counted for any bonuses. Preventing ALPINE itself from receiving a bonus does not prevent this indirect use. Both Honor Guard predicates omit the exclusion on the neighboring card.

Fix direction: exclude cards forbidden from satisfying bonus conditions, while preserving ordinary same-affiliation adjacency. Include a negative control where the neighbor is a normal Expanded Worlds card.

## Rule decisions still open, with evidence

1. **Gain permanence:** Maja 07's +4, Fisherman 90's +3, Maja University's +2, and Hsei-Ling's +1 do not explicitly say permanent. Existing implementation/tests cannot decide whether Abed applies. The earlier permanent-Maja implementation remains in the working tree; this audit has not silently approved or reverted it.
2. **Chloe and pile searches:** the declared type survives a return to the deck, but type-specific search filters use printed type. Public-command reproduction: Chloe makes Taylor a Coordinator; Hugh returns him to the deck; Great Oak High Schooler cannot find him. Conversely, Chloe makes Zsofia an Initiator; Hugh returns her; High Schooler successfully searches her as a Coordinator. Reproduced in both player seats. The legacy High Schooler predicate also reads printed type. Decide whether searches deliberately use printed classification or should follow the surviving declaration; board-effect selectors already use the latter. No zone-change reset is currently applied in this sequence.
3. **Henry movement:** L2 requires one rule for selected squares after Henry moves.
4. **Jeremiah and negative auras:** N3's potency discrepancy needs a consistent sign/eligibility rule.
5. **Player-wide Supporter activation bans versus opponent immunity:** the earlier boundary report's global Marines concern remains a rules question; no offered-but-rejected command was demonstrated there.

The search reproduction is `tmp/card-audit-chloe-search.mjs`. It executes Chloe's declaration/selection, Hugh's selection/return, and High Schooler's set/search through public commands. Character costs are waived in the fixture to isolate classification; it is not a reinforcement-cost test.

## Numerical coverage added in this continuation

`tmp/card-audit-aura-parity.mjs --all-targets` runs **5,842 comparisons per seat**, and `--seat1` mirrors ownership and board rows. Both seats produce the same **538 mode discrepancies**, with no harness exceptions. Those discrepancies are grouped above. The two shared-engine defects N2 case 2 and N4 have zero cross-engine delta, so separate text-based expectations are necessary to detect them.

The matrix covers all 128 catalog cards as targets of nine aura families under ordinary, Jeremiah, suppressed-source, declared-Supporter, and declared-Dauntless conditions, plus focused copied/immunity cases. Not every type-conversion fixture is a legal target (the initial small matrix contains harmless unchanged-result ALPINE conversion controls); the broad matrix excludes immutable type conversions. Results are diagnostic observations, not a passing assertion suite.

The legacy harness evaluates actual function declarations from the structural, gameplay, and rendering/helper scripts. It maps the authority's declared/copied counters to legacy fields. It does not replace rule predicates with success stubs. Card 65's deliberately different storage representation is normalized: authority stores 4 after setting; legacy stores 1 and derives +3. Without that normalization there were fixture-only differences, which are not reported as bugs.

This matrix exercises `getEffectiveFate`/`effectiveFate`; it does not execute every aura-state transition, animation, modal, or live client projection. Matching results do not alone prove that both engines follow the text, as N4 demonstrates.

## Existing coverage and its limits

| Area | Evidence | What it establishes |
|---|---|---|
| Catalog registration and source review | Initial 128-card audit | Every catalog definition was included in the source audit. |
| Basic execution | 512 catalog/seat/rework scenarios | Sampled effect programs resolve in constructed states. |
| Prompt branches and replay | 1,024 scenarios / 7,540 command-replay checks | Sampled prompts remain deterministic after JSON recovery. |
| Landscape extensions | Six landscapes plus branch-budget follow-up | Combined with the above, 19,610 command/replay checks; bounded sampling, not every combination. |
| Copied placement offers | 2,518 offered commands, zero rejected offers | Tested offered placements are accepted; missing legal offers are not comprehensively ruled out. |
| Earlier targeted regression suites | Main, follow-up, expanded, boundary, legacy, expiry/source-status suites passed | Their asserted cases hold. Unsupported permanence assumptions in older assertions do not establish intended rules. |
| Lifecycle counterexamples | L1–L4 | Passing immediate-resolution tests missed recovery, movement, type, and rider failures. |
| Aura outcome comparison | 11,684 comparisons across both seats | Numerical discrepancies and two same-result rule defects identified above. |
| Full matches (completed 29 September) | Ten matches, 609 accepted commands, all reached normal outcomes | Normal-cost lifecycle checks with Relentless Maelstrom versus The Free World, five paired seeds, alternating the deeper AI policy's seat. This is not coverage of every deck or every numerical outcome. |
| Live multiplayer/browser | Not performed | No claim about real socket reconnects, modal sequencing, or complete UI behavior. |

## Failing-suite coverage debt

The ordinary baseline remains **41 passing / 29 failing files out of 70**. In this continuation, diagnostic copies of all 29 failing files record assertion failures and continue where possible. **18 reached their ends; 11 still stopped on runtime/fixture errors; 85 failed assertions were recorded.** This is additional triage, not a green test run: assertions were deliberately nonfatal only in temporary diagnostic copies. Original test files were not altered.

Examples now checked beyond the first failure:

- The continuous-modifiers suite inserts Grenadiers without its selected-target/type link; all three later Jimmy expectations assume an automatic unselected aura.
- The large-batch suite still expects West Caribbea's retired arrival bonus, ALPINE total 5 instead of 6, and Specter growth before the current turn-14 draw-phase condition.
- Fisherman assertions still expect Joie's draw reaction, contrary to the user-confirmed search rule.
- The West Coast split-draw fixture supplies three different activation IDs while asserting one activation. Its observed three frames do not establish duplicate handling of one shared activation ID.
- Havano and Whisper projection failures expect face-down effects to stop, contrary to the confirmed current rule.
- The deterministic-landscape test manually activates UCPD, whose current registry timing is WHEN_SET; it stops before the rest of that section.
- Other files retain old geometry/catalog counts, old numeric effects, source-text regexes, and missing VM dependencies. Their later coverage must be repaired before they can serve as release gates.

Raw per-file downstream failures and terminal errors are preserved in `tmp/card-audit-downstream-results.json`; reproduce with `node tmp/card-audit-downstream.cjs`. Do not use its process exit status as a gameplay correctness result.

## Remaining validation needed for a clean sign-off

The ten-match process completed successfully. A source-read command was temporarily blocked by the automatic approval review's usage limit; after the user's continuation, execution resumed. That interruption did not invalidate the already completed numerical matrices.

Fix and regress the confirmed findings; resolve the narrowly identified rule decisions; update stale tests without weakening current-rule assertions; then test real two-client placement, reactions, reconnect during prompts, delayed delivery, and recovered cards. The present evidence is substantially broader than successful command execution, but the outstanding counterexamples mean the game cannot yet be declared interaction-clean.
