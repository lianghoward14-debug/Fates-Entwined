# Authoritative v3 phase status

This file is the gate ledger for
`SERVER_AUTHORITATIVE_MULTIPLAYER_MIGRATION_PLAN.md`. Phases are evaluated in
order. Prototype code from a later phase does not satisfy or bypass an earlier
gate.

| Phase | Status | Gate evidence |
| --- | --- | --- |
| Phase 0: Architecture and Rule Inventory | Complete | All 111 cards and 20 landscapes have machine-checked operation/modifier/trigger/custom-handler assignments. The observe-only recorder and ambiguity ledger pass `smoke:authority-v3-phase0`. |
| Phase 1: Engine Foundation | Complete | State construction, pinned RNG output, canonical hashing, strict command validation, permanent IDs, invariants, atomic rejection, and deterministic replay pass `smoke:authority-v3-phase1`. |
| Phase 2: Universal Gameplay | Complete | Draw, set and set limits, move, discard, consolidation, Fate mutation, end turn, scoring/victory, and hand limits pass `smoke:authority-v3-phase2` with legacy rule anchors. |
| Phase 3: Prompts and Effect Stack | Complete | Modal, card/hand, multi-board, destination, zone, optional, chained, cancellation, timeout, and reaction prompts recover with their exact continuation frames under `smoke:authority-v3-phase3`. |
| Phase 4: Card Families | Complete | All 111 cards and all 20 landscapes have isolated implementations. Deterministic, interactive, triggered, timer-owned, token-copying, and landscape-changing rules pass the complete Phase 4 aggregate. |
| Phase 5: Single-Player Cutover | Complete | The exact-flag route owns local state, UI commands, AI commands, hidden projections, replay, advanced browser interactions, and teardown. The 180-action differential gate, browser-family harness, and projection-only AI calibration all pass. Legacy remains the unflagged default to preserve strict route isolation. |
| Phase 6: Server Shadow Mode | Complete | Release 2 of the separate `fates-entwined-v3-shadow-soak` app produced 180 authenticated, one-room-per-action comparisons: 178 exact matches and only the two reviewed Phase 5 legacy defects. Accepted-log reconciliation is 180/180, all version/build/deployment pins agree, and no unreviewed or untranslated corpus records remain. |
| Phase 7: Unranked Authoritative Beta | Complete | Release 6 of the isolated beta app runs the pinned catalog-complete build on exactly one encrypted volume. Two Firebase-authenticated clients used distinct credentials, private projections, command-only placement/end-turn, then recovered the exact revision/hash after a real machine restart and completed the match with no legacy fallback. |
| Phase 8: Full Cutover | Not started | Legacy multiplayer remains the production path; production release 311 was unchanged by Phase 7. |

## Phase 0 evidence

- `docs/AUTHORITY_V3_PHASE0_RULE_INVENTORY.json` inventories all 111 playable
  card definitions and all 20 landscapes.
- Every definition declares timing, effect family, operations, prompts,
  triggers, modifiers, a legacy parity handler, implementation status, and
  multiplayer eligibility.
- `docs/AUTHORITATIVE_V3_AMBIGUOUS_RULES.md` records rule questions that must
  be decided before the affected mechanic is implemented.
- `?fateV3Recorder=1` enables an observe-only single-player recorder. It does
  not select a server, protocol, matchmaking queue, or gameplay reducer.
- `npm run smoke:authority-v3-phase0` fails if the committed inventory becomes
  stale or a playable definition loses its coverage declaration.

## Phase 5 evidence

- `?fateV3SinglePlayer=1` is the exact, independent Phase 5 browser opt-in.
  Without it, the Phase 5 module is not imported.
- Phase 5 refuses to coexist with the observe-only `?fateV3Recorder=1` mode and
  has no dependency on the v3 server flag or transport.
- `smoke:authority-v3-phase5` covers the two-seat local session, human
  projection boundary, complete set-card UI slice, atomic illegal-action
  rejection, command-submitting AI turn, replay recovery, selected-deck browser
  construction, projection events, renderer failure isolation, and 40-card
  production-shaped match creation.
- The Phase 5 screen-routing gate proves exact-flag start ownership occurs
  before legacy match setup; legacy canvas/render/hand-drag layers relinquish
  ownership; and the screen submits only v3 commands.
- The advanced screen gate covers projected added rows/squares; deck-origin,
  adaptive-token, consolidation, movement, activation, landscape, and concede
  commands; multi-card and multi-square prompt selection; projected outcome;
  replay recovery; and explicit screen teardown.
- The standalone browser-coverage harness requires the exact, test-only
  `?fateV3BrowserCoverage=1` flag and is not imported by `index.html`. Live
  interactions passed consolidation, adaptive-token, movement, activation and
  target prompt, hand-limit, landscape, generated geometry, multi-card,
  multi-square, and replay-resume scenarios. The pass found and fixed a missing
  multi-square confirmation button.
- The default v3 AI policy scores only its player projection and exact legal
  templates. The adapter revalidates its chosen template before reducer
  submission, and the policy has no legacy-state import.
- The committed AI-calibration gate compares 120 strategic legacy decisions
  and passes at 105 action-family, 73 card-instance, and 58 exact-destination
  matches. It also proves deterministic repeat choice, exact-template return,
  and absent opponent-hand data.
- The repaired differential runner consumes the actual legacy recorder schema,
  translates offline into reducer inputs, compares normalized visible
  outcomes, and fails translation or unclassified mismatches. Its committed
  three-action compatibility fixture passes 3/3.
- The tooling-only `?fateV3LegacyCorpus=1` driver requires the recorder flag,
  refuses the v3 single-player flag, and uses the actual legacy browser AI for
  both seats. Its committed baseline contains 20 matches, 180 action
  boundaries, all 20 starting landscapes, and 67 played card IDs.
- The real-corpus differential gate is 178 exact matches, two reviewed
  `existing-single-player-defect` classifications, zero translation failures,
  and zero unclassified mismatches. The reviewed differences are the legacy
  Snow Shoveler/Zion Canyon recovery bug and a legacy deferred-hand-limit
  ordering bug. The gate now passes without changing any runtime route.
- A live flagged browser pass rendered 27 v3-owned squares, selected a
  Supporter with 18 engine-derived destinations, resolved its nested prompts,
  and returned from the AI command loop at turn 3.
- A second live flagged pass exposed deck-origin commands, accepted an engine
  concession, rendered the projected winner, returned to the title screen,
  removed v3 DOM ownership, and restored the legacy End Turn binding.
- The latest live pass submitted a deck-origin command, completed a strategic
  AI turn at Turn 3, and corrected the hand/action panel offset that previously
  placed the leftmost v3 card under the legacy pile hit area.
- `AUTHORITATIVE_V3_PHASE5_SINGLE_PLAYER_CUTOVER.md` and
  `AUTHORITATIVE_V3_PHASE5_AI_CALIBRATION.md` record the completed cutover and
  calibration gates. Phase 5 is complete.

## Phase 6 evidence

- `FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1` is the exact, independent
  Phase 6 process flag. Without it, the worker exits before reading or writing
  any shadow file.
- The worker refuses to run while
  `FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1`, so observation and v3 authority
  cannot be selected in the same process configuration.
- The legacy authority does not import, start, or name the Phase 6 worker. The
  worker reads the existing append-only accepted-event file and has no network
  listener or connection back to the match server.
- Comparison output records the accepted command, legacy hash, engine hash,
  first differing normalized state path, engine version, and ruleset version.
  Unsupported gameplay envelopes are recorded as `not-compared`; they are not
  counted as parity.
- `smoke:authority-v3-phase6` replays all 180 real recorded actions through
  the independent observer boundary. It reports 178 matches and the same two
  known legacy defects retained by the Phase 5 differential gate.
- The production-shaped local soak starts the real client-resolved legacy
  authority and observer on the same append-only log, terminates the observer
  after `MATCH_START`, and proves the legacy match still accepts 14 actions
  through end-turn, board-effect, reaction, and forfeit paths. A bounded replay
  accounts for every accepted line and records the synthetic harness
  divergences rather than hiding them.
- `Dockerfile.authority-v3-shadow` and
  `fly.authority-v3-shadow.toml.example` provide a separately selected,
  dedicated-app, dedicated-volume soak deployment. The supervisor keeps
  protocol v2 legacy authority alive if its sibling observer exits. Static and
  live gates prove the default `Dockerfile` and `fly.toml` remain legacy-only.
- `predeploy:authority-v3-shadow` validates a caller-supplied private config
  without deploying. It rejects the default app and volume, placeholder names,
  wrong image/process, missing observer requirements, or conflicting flags.
  No shadow deploy command is wired into the package.
- The report reviewer deduplicates room/sequence/hash observations and applies
  only the two exact reviewed-legacy-defect fingerprints. An injected unknown
  mismatch fails `--fail-on-open`. Reviewed issues cannot waive accepted
  gameplay envelopes classified as `gameplay-untranslated`. Caller-declared
  minimum unique-record and match counts also fail an empty or undersized soak.
- Promotion review can require the original accepted-event log. Reconciliation
  matches room, sequence, multiplicity, and legacy hash, and fails for a
  missing comparison, unexpected comparison, malformed source line, invalid
  identity, or hash mismatch. The 180-action gate proves complete accounting
  and injects each failure class.
- Promotion thresholds also pin one exact engine version, one exact ruleset
  version, and a minimum distinct-room count. Mixed versions, missing version
  metadata, the wrong build, or insufficient room breadth fail even when raw
  record and match counts are high.
- `FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID` is mandatory and
  non-placeholder for the observer. Every telemetry record carries it;
  promotion pins one exact ID and requires agreement with the fingerprinted
  deployment config. Missing, mixed, wrong, or disagreeing builds fail.
- Each promotion summary contains SHA-256 fingerprints for the report,
  accepted log, and review ledger plus a deterministic path-independent audit
  digest. Optional audit output is exclusive-create and cannot reuse any
  evidence path; mutation changes the digest and overwrite attempts fail.
- The private shadow deployment config can be included as a fourth fingerprinted
  input. Promotion reruns the separate app/volume and exact-route validator;
  default production targets, conflicting flags, placeholders, or wrong
  processes fail the audit. Config mutation changes the audit digest.
- Evidence parsing, byte counts, and hashes come from one in-memory snapshot
  per file. An append after capture cannot make the audit hash bytes different
  from the bytes whose records were actually reviewed.
- Coverage telemetry distinguishes control baselines, presentation-only
  envelopes, missing state, and untranslated gameplay. The local
  client-resolved fixture exposes four `STATE_SYNC` control baselines, one
  presentation-only cinematic, and two reaction choices that cannot be
  reconstructed after its deliberate synthetic divergences. Those reaction
  records remain hard promotion failures rather than false parity matches.
- A matched prediction may carry its v3 reaction prompt into the immediately
  following accepted action. Exact Lydia decline, negate, and suppress
  continuations pass the Phase 6 gate. Any intervening reset or divergence
  clears the cache, which is why the deliberately divergent client-resolved
  fixture's two reactions correctly remain untranslated.
- A matched prediction with a real v3 `pendingHandLimit` may likewise consume
  only the affected player's exact legal discard set. The gate proves an exact
  discard matches, while a wrong-seat discard and a discard after `STATE_SYNC`
  cannot enter the stateful path, are rejected, and invalidate the cache.
- `AUTHORITATIVE_V3_PHASE6_SERVER_SHADOW.md` documents deployment, flags,
  input/output paths, telemetry, and the no-impact contract.
- Local Phase 6 implementation and regression gates are complete. The isolated
  `fates-entwined-v3-shadow-soak` release 2 is healthy with build ID
  `phase6-b896a72f0815774aa0f43d8e6d5267ea46a945333830ae2a5752b09e3730939d`,
  protocol v2, and its own encrypted `fate_authority_v3_shadow_soak` volume.
- The exact `FATE_PHASE6_REMOTE_CORPUS_SOAK=1` harness sent the approved
  180-action legacy corpus through authenticated client-resolved rooms on that
  deployment. A write-once, one-latest-record-per-index snapshot contains 178
  matches, the two reviewed legacy defects, zero untranslated records, and
  exact 180/180 accepted-event reconciliation. The pinned audit is
  `fixtures/AUTHORITY_V3_PHASE6_DEPLOYED_SHADOW_AUDIT.json`. Production
  authority remains legacy and unchanged at release 311. Phase 6 is complete;
  Phase 7 is now the next ordered phase.

## Phase 7 evidence

- The browser path is exact `?fateV3UnrankedBeta=1`; it fails closed on every
  Phase 5, Phase 6, generic authority, or URL-override conflict. The unflagged
  client and `fly.toml` remain on the legacy path.
- Firebase ID tokens authenticate `/v3/beta/matchmaking/*`. Matchmaking
  validates the 40-card deck before queueing, creates unranked matches only,
  and returns each user only their own persisted per-match credential.
- Private snapshots and accepted/rejected responses carry server-derived legal
  command templates. The full existing battle screen submits only their type
  and payload through the asynchronous beta adapter; nested client `postState`
  remains recursively rejected.
- `Dockerfile.authority-v3-phase7-beta` and
  `fly.authority-v3-phase7-beta.toml` start only the Phase 7 wrapper, disable
  generic/shadow/test paths, use their own app/data directory/volume, pin
  client `1.39.0-phase7-beta.1`, and pin source build
  `phase7-314e7aebd94921dd1af1427ebb9f18bef429fef59f375f000b8df36d75721d28`.
- The complete v3 suite, legacy client-resolved WebSocket regression,
  presentation routing regression, Fly readiness gate, Phase 7 predeploy gate,
  and Phase 7 local restart/matchmaking gate pass.
- `phase7-remote-beta-soak.mjs` is the exact-opt-in live gate for two real
  anonymous Firebase clients, distinct credentials, private projections,
  placement, prompt resolution, end turn, process restart/reconnect hash
  recovery, and match completion by concession.
- Release 6 of `fates-entwined-v3-unranked-beta` reports the exact pinned build
  and runs on sole machine `812e64c9760018` with encrypted volume
  `vol_vjyw602e7mmzwopv`. The interrupted-rollout duplicate was queried before
  deletion and contained zero matches, players, commands, or snapshots.
- The deployed restart soak paired two temporary Firebase users, issued
  distinct match credentials, hid opponent hands, accepted placement at
  revision 1 and end turn at revision 2, then restarted the sole Fly machine.
  Both clients recovered revision 2 and hash `fe3_c85578560cadcecb` before a
  concession completed the match at revision 3. The immutable audit is
  `fixtures/AUTHORITY_V3_PHASE7_DEPLOYED_BETA_AUDIT.json`.
- Production `fates-entwined-main` remained unchanged at release 311. Phase 7
  is complete; Phase 8 is the next ordered phase.

## Phase promotion rule

A phase moves to complete only when every deliverable and its exit gate in the
migration plan pass. Later-phase prototypes remain disabled and isolated until
then.

## Phase 4 evidence

- `smoke:authority-v3-phase4-draw-search` covers private deck/discard selection
  and shared card transfer for the first draw/search slice.
- `smoke:authority-v3-phase4-fate` covers stored-Fate transformation,
  multi-target atomic validation, automatic board queries, immunity filtering,
  zero clamping, per-card Fate events, Christopher Erbs's next-draw +6, and
  Wodny Potok Youth's recovered once-per-turn targeting.
- `AUTHORITATIVE_V3_PHASE4_FATE_CLASSIFICATION.md` records why live Fate
  calculations and effects coupled to searches, discards, declarations,
  placement, or delayed statuses remain assigned to their later/overlapping
  Phase 4 families.
- `smoke:authority-v3-phase4` runs every Phase 4 family and the completed
  111-card/20-landscape registry. No later phase is promoted.
- `smoke:authority-v3-phase4-movement` covers serialized movement grants,
  adjacent-zone/row validation, once-per-turn enforcement, owner-turn expiry,
  recovery, and standard movement-trigger interaction.
- `AUTHORITATIVE_V3_PHASE4_MOVEMENT_CLASSIFICATION.md` keeps composite movement
  cards assigned to the family that must implement their complete rule.
- `smoke:authority-v3-phase4-discard-removal` covers optional and mandatory
  board removal, immutable-target filtering, cross-zone sacrifice, ordered
  discard/Fate and discard/draw continuations, exact batch selection,
  consolidation-triggered effects, and prompt recovery.
- `AUTHORITATIVE_V3_PHASE4_DISCARD_CLASSIFICATION.md` records the hidden,
  random, replacement, token, and composite discard cards that remain rejected.
- `smoke:authority-v3-phase4-control` gates the shared owner-preserving
  `CHANGE_CONTROL` operation. No hidden-zone transfer card is newly eligible;
  `AUTHORITATIVE_V3_PHASE4_CONTROL_CLASSIFICATION.md` records why 70, 72, and
  bh03 remain rejected until their complete lifecycle rules exist.
- `smoke:authority-v3-phase4-status` covers restart-safe target-turn
  activation and expiry, refresh rather than duration stacking, shared
  per-player use limits, supporter-effect permission checks, immunity bypass,
  South Wind's board-only opponent immunity, and Colombo's cross-zone
  consolidation restriction.
- `AUTHORITATIVE_V3_PHASE4_STATUS_CLASSIFICATION.md` records the status rules
  still blocked on square persistence, hidden-hand ownership, token identity,
  type replacement, landscapes, or reaction ordering.
- `smoke:authority-v3-phase4-continuous` covers derived-versus-stored Fate,
  source suppression/removal/face-down behavior, stacking, zero clamps,
  Jeremiah aura potency, immutable targets, and canonical recovery.
- `AUTHORITATIVE_V3_PHASE4_CONTINUOUS_CLASSIFICATION.md` assigns adjacency,
  copying, declaration, random-target, placement-replacement, and reaction
  composites to their required later work.
- `smoke:authority-v3-phase4-placement` proves scoped zone selection,
  validation/legal-command parity, same-zone refresh, other-zone availability,
  snapshot recovery, and target-turn expiry for card 50.
- `AUTHORITATIVE_V3_PHASE4_PLACEMENT_CLASSIFICATION.md` keeps nested free-set,
  copy, hidden-owner, random, delayed, token, and consumable-consolidation
  placement rules rejected until their complete continuations exist.
- `smoke:authority-v3-phase4-reactions` covers canonical negate/suppress
  events, prompt recovery, Lydia negate and permanent suppression, automatic
  Semper suppression, Jeremiah potency, immutable filtering, and input-state
  atomicity for bh08.
- `AUTHORITATIVE_V3_PHASE4_REACTION_CLASSIFICATION.md` keeps landscape,
  copy-driven, and unresolved multi-kind priority behavior deferred.
- `smoke:authority-v3-phase4-landscapes` plus the deterministic, interactive,
  triggered, and landscape-change gates cover all 20 landscapes: seeded
  zones, timing boundaries, resumable choices, geometry, movement, hidden-hand
  expiry, server-owned turn timeout, atomic landscape commands, Concrete Roads
  copying, Fate thresholds, and card 82.
- `AUTHORITATIVE_V3_PHASE4_LANDSCAPE_CLASSIFICATION.md` records the completed
  authoritative decisions and dedicated gates.
- `smoke:authority-v3-phase4-custom` covers card 09's intrinsic value,
  consolidation legality, suppression behavior, control changes, igb10
  composition, and recovery.
- `AUTHORITATIVE_V3_PHASE4_CUSTOM_CLASSIFICATION.md` records the square,
  deck-origin, uniqueness, face-down, landscape-change, opening-hand, and
  declared-split rules that remain rejected.
- `smoke:authority-v3-phase4-expansion` covers Jeremiah-amplified Coordinator
  aura potency, conditional peer loss, active-copy counting, field-wide
  Character counting, immutable exclusions, Great Oak consolidation, and
  recovery for cards 19, 55, 63, 88, and 47.
- `smoke:authority-v3-phase4-event-query` covers Zsofia source suppression,
  Jeremiah potency, immutable filtering, canonical recovery, and Irvine
  tribute parity between legal-command generation and reducer validation.
- `smoke:authority-v3-phase4-counters` covers all Supporter placements,
  proceeded versus negated or timed-blocked Supporter effects, reaction-prompt
  recovery, public projections, non-materializing Fate, the exact tenth-use
  boundary, and canonical recovery for cards 85 and 89.
- `smoke:authority-v3-phase4-large-batch` covers recovered multi-target
  immunity, draw and search arrivals, suppressed stored sources, recursive
  effective Fate, draw-phase and two-turn ticks, Ballad termination,
  Lumberjack suppression plus immunity, and validation/legal-command parity
  for consumable consolidation penalties.
- `smoke:authority-v3-phase4-declarations-rng` covers restart-safe affiliation
  and type choices, Lydia and Secules ordering, seeded random replay, hidden
  event projection, Rivera's set/change and expiry boundaries, Mark's mutable
  zone conversion, Duncan's live aura, Fisherman and Shoveler deck mutation,
  and Selva Anicka's rounded multi-target split.
- `AUTHORITATIVE_V3_PHASE4_DECLARATION_RNG_CLASSIFICATION.md` records the
  shared declaration, duration, random ordering, draw-effect, and integer split
  decisions used by this batch.
- `smoke:authority-v3-phase4-final-cards` covers opening-hand construction,
  hidden ownership, deck-origin limits, recovered free sets, stable added-row
  geometry, orthogonal adjacency, deterministic hand replacement, generated
  Pierogi instances, legal-command parity, invariants, and recovery.
- `AUTHORITATIVE_V3_PHASE4_FINAL_CARD_CLASSIFICATION.md` records the shared
  geometry, copy, delayed, hidden-hand, token, type, placement-history, and
  all-landscape card 82 decisions.
