# Server-Authoritative Multiplayer Migration Plan

Last updated: 2026-07-31

Status: Phases 0 through 7 are complete. Phase 8, full cutover, is next. Later-phase code remains behind exact independent flags and does not bypass the ordered migration phases. See `docs/AUTHORITATIVE_V3_PHASE_STATUS.md`. Legacy multiplayer remains the production path; no match silently falls back between authority models.

## Purpose

This document is the handoff for migrating Fates Entwined from its current client-resolved multiplayer architecture to a stable server-authoritative architecture.

The current multiplayer implementation lets the acting client resolve gameplay, capture a complete `postState`, and submit that state to the authority server. This works most of the time, but it remains vulnerable to timing-dependent partial commits, late effect mutations, acknowledgement races, background repair commits, and client/server divergence.

The migration must not repeat the previous failed approach of independently recreating all card rules inside a separate server reducer. That approach creates two rule implementations which inevitably drift and requires interaction-specific patches.

The central architectural rule for the new system is:

> Single-player, multiplayer authority, AI simulations, and automated tests must execute the same deterministic game engine.

This prevents two implementations from drifting and avoids hunting down every card interaction twice.

## Target Architecture

```text
Client command
    |
    v
Authoritative room actor
    |
    v
Shared deterministic engine
    |
    v
Invariant validation
    |
    v
Durable command + new revision
    |
    v
Private state projection for each player
    |
    v
Clients render state and presentation events
```

The client sends commands, never completed game states:

```js
{
  commandId: "player-1:184",
  matchId: "ABC123",
  expectedRevision: 72,
  type: "ACTIVATE_EFFECT",
  payload: {
    sourceIid: "card-xyz"
  }
}
```

The server processes one command at a time and returns a result such as:

```js
{
  revision: 73,
  stateHash: "...",
  status: "NEEDS_CHOICE",
  prompt: {
    promptId: "prompt-91",
    type: "BOARD_TARGET",
    eligibleIids: ["target-a", "target-b"]
  },
  events: [
    { type: "EFFECT_ACTIVATED", sourceIid: "card-xyz" }
  ]
}
```

The client only renders the prompt. Its answer becomes another command.

There must be no uploaded `postState` snapshots, quiet-window completion guesses, background repair commits, or board-state preference heuristics in the final authoritative path.

## Shared Deterministic Engine

Create a browser-and-Node-compatible engine, likely under:

```text
shared/engine/
  state.mjs
  commands.mjs
  reducer.mjs
  prompts.mjs
  triggers.mjs
  modifiers.mjs
  selectors.mjs
  invariants.mjs
  rng.mjs
  serialization.mjs
  cards/
```

The engine must have no access to:

- DOM elements
- animations
- audio
- WebSockets
- local storage
- wall-clock time
- `Math.random()`
- callbacks or closures stored in game state

Its primary API should resemble:

```js
const result = reduceCommand(state, command, {
  ruleset,
  rng
});
```

It returns:

- the next isolated state
- presentation events
- an optional serializable prompt
- or a structured rejection

The server executes this function authoritatively. Single-player executes the same function locally.

## Rules System That Avoids Interaction Patching

Trying to encode every pair of interacting cards directly would recreate the current fragility. Rules should instead be built from universal gameplay operations.

Examples:

```text
DRAW_CARD
DISCARD_CARD
MOVE_CARD
SET_CARD
MODIFY_FATE
CHANGE_CONTROL
FLIP_CARD
SEARCH_ZONE
CREATE_STATUS
REMOVE_STATUS
OPEN_REACTION_WINDOW
```

Cards compose these operations rather than directly manipulating arbitrary match state.

### Targeting and Immunity

Effects should use shared rule queries:

```js
canTarget(state, source, target, operation)
effectiveCardType(state, card)
effectiveCost(state, card)
canMove(state, card, destination)
```

Individual effect handlers must not contain scattered special checks for unrelated cards.

Immunity, prevention, and replacement rules participate in a common operation pipeline:

```text
Effect proposes CARD_WOULD_BE_DISCARDED
    |
    v
Modifiers inspect the operation
    |
    v
Immunity may reject it
    |
    v
Replacement effects may transform it
    |
    v
Final operation is applied
    |
    v
CARD_DISCARDED triggers are collected
```

This allows a new immunity or replacement rule to affect every compatible operation without editing every card that performs that operation.

### Trigger and Reaction System

Every gameplay mutation emits standard rule events:

```text
CARD_SET
EFFECT_ACTIVATED
CARD_TARGETED
CARD_MOVED
CARD_DISCARDED
CARD_DRAWN
FATE_CHANGED
TURN_STARTED
TURN_ENDING
```

Triggers subscribe to event categories and use deterministic priority ordering. Lydia, Havano, and Mr. Secules should become standard reaction-window rules rather than special networking cases.

A reaction suspends the current effect using serializable state:

```js
pendingStack: [{
  frameId: "effect-54",
  sourceIid: "source-a",
  instructionIndex: 3,
  waitingFor: "REACTION",
  originalCommandId: "player-1:184"
}]
```

Never store a JavaScript callback as the continuation.

### Complex Cards

Do not force every complicated card into an oversized declarative language.

Use two levels:

- Data-driven effect programs for common mechanics
- Pure custom handlers for genuinely unusual cards

Custom handlers must still use the same operations, queries, triggers, prompts, and invariant checks. They cannot mutate state outside the engine.

## Canonical Match State

The authoritative state should contain gameplay data only:

```js
{
  schemaVersion,
  engineVersion,
  rulesetVersion,
  matchId,
  revision,
  phase,
  turn,
  activePlayer,
  rngState,
  players,
  board,
  statuses,
  effectStack,
  pendingPrompt,
  outcome
}
```

Required decisions:

- Every card instance has a permanent `iid`.
- Rules reference card identity, not UI position alone.
- Gameplay numbers use integers.
- Randomness comes from a seeded deterministic generator.
- Every match pins its engine and ruleset version.
- State serialization uses stable key ordering.
- Every accepted command produces a deterministic state hash.
- Hidden information remains inside the full server state.

Each player receives a private projection:

- Their complete hand
- Opponent hand count, not contents
- Public board and discard information
- Only prompts and choices they are authorized to see

Spectators receive a separate projection.

## Authoritative Room Actor

Each room has exactly one logical writer.

The room actor:

1. Receives a command.
2. Authenticates its player and client session.
3. Checks the expected state revision.
4. Deduplicates `commandId`.
5. Validates turn, phase, and active prompt ownership.
6. Runs the shared engine.
7. Runs engine invariants.
8. Persists the accepted command.
9. Advances the revision.
10. Broadcasts player-specific state projections and presentation events.

No two commands may execute concurrently in the same room.

A stale command is rejected with the latest revision. The client resynchronizes and asks the user to repeat an action if necessary. The server must never merge two independently mutated gameplay snapshots.

## Reconnection and Failure Handling

### Lost Acknowledgement

`commandId` is idempotent. Resending it returns the original accepted response without executing the effect twice.

### Disconnect During a Choice

The prompt remains in authoritative state. On reconnect, the server sends the same prompt and legal choices.

### Prompt Timeout

The ruleset defines a deterministic default:

- decline
- cancel
- select none
- or forfeit when appropriate

### Server Restart

Active rooms recover from the latest snapshot plus the compact accepted-command tail. Replaying the commands must recreate the same state hash.

### Client Crash After Prediction

Prediction is cosmetic. After reconnecting, the client discards its local prediction and renders the server state.

### Invalid or Unsupported Card

The engine rejects deck validation or match creation before play begins. Multiplayer must never silently fall back to client-resolved authority.

## Preserving Single-Player Parity

The existing single-player game should act as the executable specification during migration.

### Legacy Action Recorder

Instrument stable single-player action boundaries and record:

- canonical pre-state
- player command
- selected choices
- RNG seed and counter
- expected post-state
- visible gameplay outcomes

Use existing AI self-play to generate a large replay corpus.

### Differential Testing

Run identical recorded commands through:

1. The legacy single-player implementation
2. The new shared engine

Compare normalized gameplay states after every completed action.

Every mismatch must be classified as:

- new-engine defect
- existing single-player defect
- intentional rule clarification
- cosmetic-only difference

This avoids manually rediscovering every interaction.

### Coverage Inventory

Generate a registry from the card catalog showing:

- card ID
- ability timing
- operations used
- prompt types
- trigger subscriptions
- custom handler
- parity fixtures
- multiplayer eligibility

CI must fail if a playable card has no engine implementation or coverage declaration.

## Migration Phases

### Phase 0: Architecture and Rule Inventory

- Temporarily freeze new complex multiplayer mechanics or require them to follow the new engine design.
- Define canonical state, commands, events, and prompts.
- Inventory every card and landscape.
- Identify common effect families.
- Build the legacy action recorder.
- Document ambiguous rules before implementing them.

Exit gate: every current mechanic is assigned to an engine operation, modifier, trigger, or custom handler.

### Phase 1: Engine Foundation

Implement:

- state schema
- deterministic RNG
- revision and canonical hashing
- command validation
- permanent card identity
- invariant checks
- deterministic replay tooling

No production gameplay changes yet.

### Phase 2: Universal Gameplay

Port foundational operations:

- draw
- set
- move
- discard
- consolidate
- fate modification
- end turn
- victory calculation
- hand limits

Test single-player parity before introducing complicated effects.

### Phase 3: Prompts and Effect Stack

Implement serializable:

- modal choices
- card selection
- board targeting
- zone selection
- optional effects
- chained prompts
- cancellations
- timeouts
- reactions and interrupts

Exit gate: a process can stop while any prompt is open, reload the state, and continue correctly.

### Phase 4: Card Families

Port cards by behavior family rather than card number:

- draw and search
- fate modification
- movement
- discard and removal
- control changes
- status effects
- continuous modifiers
- placement effects
- reactions
- landscapes
- unusual custom effects

Every bug fix must occur in an engine operation, rule query, modifier, trigger, or isolated card handler, not the transport or UI layer.

Current checkpoint (2026-07-30): Phase 4 remains in progress. The draw/search
slice covers 06, 13, 29, 48, 58, 60, and 68. The first Fate-modification slice
covers 03, 22, 83, and 93 through shared affine/batch Fate mutation and
authoritative per-turn tracking, and corrects 40's pending draw bonus to +6.
Together with earlier vertical slices, 28 of 109 catalog cards are isolated-v3
prototypes. Remaining Fate-related cards are classified in
`docs/AUTHORITATIVE_V3_PHASE4_FATE_CLASSIFICATION.md` under their primary
overlapping families; this avoids permanently storing bonuses that must remain
live modifiers.

The movement family is now active. Its first new slice ports 69 through a
serialized three-owner-turn movement grant and the common movement operation.
Composite movement cards 62, 70, and 73 remain deferred to the families that
must implement their complete discard, hidden-information, status, and Fate
rules. Isolated-v3 prototype coverage is now 29 of 109 cards.

The discard/removal family is now active. Its first slice ports 16, 38, 42,
80, and bh25 through shared board/hand selection and targeted or atomic batch
discard. Hidden-hand, random, replacement, token, and multi-family discard
cards remain rejected and are classified in
`docs/AUTHORITATIVE_V3_PHASE4_DISCARD_CLASSIFICATION.md`. Isolated-v3
prototype coverage is now 34 of 109 cards.

The control-change family now has a shared owner-preserving board operation and
`CONTROL_CHANGED` event. It does not increase card eligibility: 70, 72, and
bh03 remain rejected because their hidden-hand ownership, arrival, immunity,
duration, cap, and return-routing lifecycles are not yet complete. See
`docs/AUTHORITATIVE_V3_PHASE4_CONTROL_CLASSIFICATION.md`.

The first status/permission slice is now active. It adds 18, 20, and 53 through
serialized target-turn statuses, shared per-player use counters, and common
effect-immunity and consolidation-permission queries. Statuses refresh without
accidentally stacking duration and expire only at authoritative target-turn
boundaries. Composite square, hidden-hand, token, type-replacement, landscape,
and reaction statuses remain rejected as classified in
`docs/AUTHORITATIVE_V3_PHASE4_STATUS_CLASSIFICATION.md`. Isolated-v3 prototype
coverage is now 37 of 109 cards.

The first continuous-modifier slice is now active. Cards 10, 11, 23, 57, and
59 use one shared effective-Fate query, so live auras respond immediately to
suppression, source removal, face-down state, overlap, and immutable targets
without permanently mutating stored Fate. Adjacency, copy, declaration,
random-target, placement-replacement, and reaction-dependent modifiers remain
rejected as classified in
`docs/AUTHORITATIVE_V3_PHASE4_CONTINUOUS_CLASSIFICATION.md`. Isolated-v3
prototype coverage is now 42 of 109 cards.

The first placement-permission slice is now active. Card 50 creates a
serialized, zone-scoped status that blocks the opponent's set, consolidation,
and effect-activation commands in the selected zone for their next turn.
Authoritative validation and legal-command generation use the same query.
Nested free placement, copy, hidden ownership, random selection, delayed
delivery, tokens, and consumable consolidation modifiers remain rejected as
classified in
`docs/AUTHORITATIVE_V3_PHASE4_PLACEMENT_CLASSIFICATION.md`. Isolated-v3
prototype coverage is now 43 of 109 cards.

The first new reaction-event subscriber is now active. Explicit reaction
choices and automatic permission suppression emit the same canonical
`EFFECT_REACTED` event, and bh08 consumes that event through shared Fate
operations with Jeremiah potency and immunity filtering. Landscape reactions,
copy-driven reactions, and unresolved multi-kind priority remain rejected as
classified in
`docs/AUTHORITATIVE_V3_PHASE4_REACTION_CLASSIFICATION.md`. Isolated-v3
prototype coverage is now 44 of 109 cards.

The first landscape slice is now active. Canonical match state pins a
registry-validated landscape ID, and igb1, igb6, igb10, igb11, and igb12 use
shared triggers, reinforcement queries, and private projections. Unsupported
landscapes fail v3 match creation without falling back to legacy behavior. The
remaining timing, random, choice, geometry, movement, timer, and custom-command
landscapes are classified in
`docs/AUTHORITATIVE_V3_PHASE4_LANDSCAPE_CLASSIFICATION.md`. Coverage is now
44 of 109 cards and 5 of 20 landscapes.

The first unusual-custom slice is now active. Card 09's intrinsic
two-reinforcement value is implemented in the shared consolidation query and
composes with control, suppression, igb10, recovery, validation, and legal
command generation. The other square, deck-origin, uniqueness, face-down,
landscape-change, opening-hand, and declared-split custom rules remain
rejected as classified in
`docs/AUTHORITATIVE_V3_PHASE4_CUSTOM_CLASSIFICATION.md`. Coverage is now 45 of
109 cards and 5 of 20 landscapes. Every Phase 4 family has a vertical slice,
but Phase 4 remains in progress until the remaining 64 cards and 15 landscapes
are complete.

The second Phase 4 coverage pass adds cards 19, 55, 63, and 88 through the
shared non-materializing effective-Fate query and adds card 47 through the
existing consolidation replacement pipeline. Source suppression, Jeremiah
potency, live condition loss, active-copy counting, immutable exclusions, and
recovery are gated together. Coverage is now 50 of 109 cards and 5 of 20
landscapes; Phase 4 remains in progress.

The next event/query expansion adds card 15 through the canonical `CARD_SET`
trigger with Jeremiah potency and adds card 49 through shared Character
tribute eligibility. Legal-command generation and reducer validation consume
the same consolidation query. Coverage is now 52 of 109 cards and 5 of 20
landscapes; Phase 4 remains in progress.

The cumulative-counter expansion adds canonical per-player totals for every
Supporter set and every Supporter effect that actually proceeds past its
reaction window. Cards 85 and 89 consume those restart-safe counters through
the shared non-materializing effective-Fate query. Negated, suppressed, and
timed-blocked effects do not inflate the activation total, while effect-driven
Supporter placement still increments the set total. Coverage is now 54 of 109
cards and 5 of 20 landscapes; the remaining 55 cards and 15 landscapes stay
rejected and Phase 4 remains in progress.

The large shared-mechanism batch adds cards 12, 33, 35, 46, 87, 92, 95, and
97. It introduces atomic multi-target status assignment, draw/search hand
arrival replacements, explicit draw-phase completion and turn-start ticks,
restart-safe consolidation bonuses and penalties, and the common Lumberjack
suppression path. These rules share the existing effect stack, reaction,
operation, projection, and recovery boundaries. Coverage is now 62 of 109
cards and 5 of 20 landscapes; 47 cards and 15 landscapes remain explicitly
rejected, so Phase 4 remains in progress.

The declaration and deterministic-selection batch adds cards 51, 66, 77, 90,
96, and bh04. Affiliation and type declarations now use recoverable modal
continuations; random deck/discard selection, deck reshuffling, and random
insertion consume the match RNG; affiliation changes emit canonical
events; owner-turn statuses expire at authoritative boundaries; and Duncan's
declared aura remains a live effective-Fate modifier. The batch also defines
Selva Anicka's legacy-parity integer split and makes Joie observe one activated
draw effect rather than one event per card drawn. Coverage is now 68 of 109
cards and 5 of 20 landscapes; 41 cards and 15 landscapes remain explicitly
rejected, so Phase 5 has not started.

The final-card dependency batch adds 40 more definitions through shared dynamic
geometry, square permissions, deck-origin and nested free placement,
opening/hidden-hand arrival replacement, copied serializable programs, delayed
delivery, face-down consolidation, deterministic hand effects, generated
tokens, type replacement, placement history, and live adjacency/derived Fate
queries. Coverage is now 108 of 109 cards and 5 of 20 landscapes. Card 82 is
intentionally still rejected because its complete choice set includes the 15
unported landscapes; exposing a shortened or partially functional landscape
path would violate the migration's no-fallback rule. Phase 4 and Phase 5
therefore remain in progress and not started, respectively.

The landscape completion batch implements the remaining 15 landscapes through
seeded setup, canonical counters, discard-recovery denial, movement grants,
resumable turn-boundary and triggered prompts, alternating draw phases,
Supporter activation limits, hidden-hand expiry, server-owned 30-second turn
timeouts, atomic landscape commands, field-wide copied Shizuku effects, and
20/35/50 Fate-threshold claims. With all 20 landscapes authoritative, card 82
now exposes its complete choice set and performs a canonical landscape
transition with timed-landscape protection. Coverage is 109 of 109 cards and
20 of 20 landscapes. `smoke:authority-v3-phase4` passes, so Phase 4 is
complete. Phase 5 remains not started.

### Phase 5: Single-Player Cutover

Make the shared engine own single-player state. The existing UI becomes an adapter that renders state and turns clicks into commands.

AI also submits engine commands.

This is the most important parity proof: multiplayer will use the same behavior already exercised by single-player.

Phase 5 checkpoint (2026-07-31): the first separately flagged cutover slice is
implemented behind the exact `?fateV3SinglePlayer=1` browser opt-in. The local
session now accepts commands from both match seats, projects state and events
for one human rendering perspective, exports and hash-verifies a unified
replay, and rejects non-player actors. A UI-facing adapter maps set,
consolidate, prompt-answer, and end-turn interactions to exact legal command
templates. Its deterministic AI chooses only engine-generated legal commands
and submits them as the AI seat. The opt-in is mutually exclusive with the
Phase 0 recorder and has no v3 server transport dependency.

The flagged browser controller can now construct that local match from the
currently selected 40-card decks and emit projection-only state/event messages
for the screen adapter. Renderer failures remain downstream of accepted
commands and cannot alter canonical state or command results.

The next Phase 5 slice claims exact-flag AI game start before any legacy match
setup. It renders the existing match screen's initial playable loop from the
human projection, including all base squares, hand selection, legal
destinations, set submission, serialized prompt actions, board commands, end
turn, and the AI command loop. Legacy canvas, renderer, and hand-drag layers
explicitly relinquish ownership in this mode. A live browser pass completed a
Supporter set with nested prompts and returned from the AI turn at turn 3.
Advanced interaction presentation and differential corpus parity remain open,
so Phase 5 is still in progress and Phase 6 remains blocked.

The advanced screen slice now derives added safe rows and individual generated
squares from projected geometry; exposes deck-origin, adaptive-token,
consolidation, movement, activation, landscape, concede, and end-turn command
families; and provides selection UI for multi-card, hand-limit, and multi-square
prompts without truncating the legal-command set. Endgame renders from the
projected outcome. Replay recovery can remount the same isolated screen, and
explicit teardown removes v3 ownership before restoring the legacy screen
handler. A live exact-flag pass verified concede, projected outcome rendering,
return-to-menu cleanup, and restoration of the legacy End Turn binding.

The local AI now uses a separate v3-only strategic policy. It scores only the
AI player's projection and the exact legal templates supplied by the engine,
then returns one of those templates to the adapter for revalidation and reducer
submission. It cannot import or mutate legacy game state. Differential
calibration against recorded legacy AI scenarios remains part of the Phase 5
parity gate.

The offline differential CLI now accepts the Phase 0 recorder's real
`fates-legacy-action-corpus-v2` envelope. It translates captured legacy state
and `LEGACY_*` commands, reduces the translated command, and compares normalized
visible outcomes. Translation failures and unexpected mismatches fail the
gate; declared mismatches must use one of the four classifications required by
this plan and include a rationale. A committed three-action compatibility
fixture passes 3/3, but is explicitly not the large legacy self-play corpus
required for Phase 5 promotion.

The next Phase 5 corpus checkpoint adds a tooling-only
`?fateV3LegacyCorpus=1` driver that requires the observe-only recorder flag,
refuses the v3 single-player flag, and drives both seats through the actual
legacy browser AI. Its committed baseline contains 20 matches, 180 recorded
actions, all 20 starting-landscape scenarios, and 67 played card IDs. Recorded
and inferred nested choices replay serialized v3 prompts. The differential
gate now passes with 178 exact matches, two reviewed
`existing-single-player-defect` classifications, zero translation failures,
and zero unclassified mismatches. The reviewed legacy defects are Snow
Shoveler bypassing Zion Canyon's discard-recovery prohibition and the legacy
AI continuing while Ali's mandatory six-card hand-limit resolution is
deferred.

A standalone, test-only Phase 5 browser harness now requires the exact
`?fateV3BrowserCoverage=1` flag and is never imported by the game page. Live
browser interactions submit consolidation, adaptive-token, movement,
activation plus target prompt, hand-limit, landscape, generated-geometry,
multi-card, multi-square, and replay-resume commands. This pass found and fixed
the missing confirmation action for multi-square destination prompts.

`smoke:authority-v3-phase5` covers the activation boundary, hidden information,
atomic UI rejection, a complete human set-card interaction, a complete
command-submitting AI turn, replay recovery, dynamic geometry routing, advanced
command labels, prompt selection state, projected endgame, and isolated
lifecycle cleanup. Its isolated browser harness also statically gates every
advanced interaction scenario listed above.

Phase 5 completion checkpoint (2026-07-31): the projection-only v3 AI now has a
deterministic calibration gate against the committed real legacy corpus. Of
120 comparable strategic decisions, it matches 105 recorded action families,
73 recorded card instances, and 58 exact destinations. The 60 legacy
`END_TURN` records are excluded because the corpus driver's external
maximum-actions scheduler is not part of a player projection. Every calibrated
choice remains an exact engine legal template, repeated selection is
deterministic, and the projected opponent hand stays absent.

`smoke:authority-v3-phase5` now passes the local-session, existing-screen,
advanced browser-family, AI-calibration, recorder-schema, real-corpus, and
classification gates. Phase 5 is complete. Per the migration's isolation
requirement, legacy single-player remains the unflagged default and the
completed v3 single-player path still requires exact
`?fateV3SinglePlayer=1`; no fallback or automatic route switch was added.
Phase 6 is implemented locally behind the separate exact process flag
`FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED=1`. The worker reads only the
legacy authority's append-only accepted-event log and writes a separate
append-only comparison report. The legacy authority does not import, start,
call, or receive data from the worker. The worker opens no network path and
refuses to run while `FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1`.

### Phase 6: Server Shadow Mode

Keep current multiplayer live temporarily, but have the server independently run the new engine and compare its predicted result against accepted legacy results.

Shadow mode must not affect matches. It records:

- command
- legacy hash
- engine hash
- first differing state path
- engine and ruleset version

Do not begin authority cutover until shadow discrepancies are understood.

Phase 6 local checkpoint (2026-07-31): the independent shadow worker records
the accepted command, legacy hash, engine hash, first differing normalized
state path, engine version, and ruleset version. Unsupported control or
gameplay envelopes are emitted as `not-compared`, never counted as matches.
The exact disabled flag writes nothing, conflicting shadow/authority flags are
rejected, and the 180-action real legacy corpus yields 178 matches plus the
same two known legacy defects from Phase 5. `smoke:authority-v3-phase6` gates
these guarantees. Legacy multiplayer remains live; production soak telemetry
must still be reviewed before Phase 7.

The Phase 6 aggregate also contains a production-shaped failure-isolation
soak. It runs the real client-resolved legacy authority and observer against
the same append-only log, terminates the observer immediately after
`MATCH_START`, and requires the legacy match to continue through 14 accepted
actions including end-turn, board-effect, reaction, and forfeit paths. The
completed log is then replayed through the observer and every line must produce
telemetry. The smoke harness intentionally uses synthetic state transitions,
so its reported mismatches/rejections prove coverage and cannot replace real
production parity soak evidence.

Deployment packaging remains separately selectable:
`Dockerfile.authority-v3-shadow` runs the unchanged protocol v2 legacy server
and file observer as sibling OS processes on a dedicated shadow-soak volume.
Observer failure is logged without terminating legacy authority. The separate
config must use an app and volume distinct from the default legacy deployment.
`predeploy:authority-v3-shadow` rejects the default app/config/volume, wrong
image or process, conflicting flags, and missing durable-log requirements
without deploying. The default `Dockerfile` and `fly.toml` remain legacy-only,
so the shadow system cannot start through the normal deployment path.

Shadow report promotion is machine-gated. The reviewer deduplicates
room/sequence/hash observations, recognizes only the two exact reviewed legacy
defect fingerprints, and fails on any other mismatch, engine rejection,
translation failure, invalid input, or untranslated gameplay envelope.
Control baselines and presentation-only envelopes are reported separately.
They never count as matches. A reviewed mismatch ledger cannot waive
`gameplay-untranslated` coverage. Promotion review also requires explicit
positive minimum unique-record and match counts, preventing empty, truncated,
or undersized soak evidence from passing. The promotion command also accepts
the immutable accepted-event log and reconciles room, accepted sequence,
multiplicity, and legacy hash. Any missing or unexpected comparison, malformed
source line, invalid identity, or hash inconsistency fails the Phase 6 gate.
Every unique comparison must also carry the explicitly approved engine and
ruleset versions, with no mixed or missing build metadata, and the soak must
meet a separately approved minimum distinct-room count.
The separately configured
`FATE_SERVER_AUTHORITATIVE_V3_SHADOW_BUILD_ID` is mandatory and emitted on
every comparison. Promotion pins one immutable build ID and requires exact
agreement between all telemetry and the validated deployment config; semantic
engine/ruleset versions alone cannot merge evidence from different builds.
The resulting promotion audit cryptographically binds the exact comparison
report, accepted-event log, and reviewed-issue ledger with SHA-256 fingerprints
and a deterministic decision digest. Audit files use exclusive creation and
cannot share a path with any evidence input, preventing silent overwrite or
evidence/output collision.
The private shadow deployment config is a fingerprinted promotion input too.
The promotion audit reruns the exact separate-app, separate-volume, image,
process, and flag validation, preventing telemetry from being approved apart
from the isolated route configuration that is claimed to have produced it.
Every input is captured once as immutable bytes; parsing, byte length, and
SHA-256 use that identical snapshot. Concurrent append activity therefore
cannot create a parse-versus-hash race inside one promotion decision.

Phase 6 completion checkpoint (2026-07-31): the isolated
`fates-entwined-v3-shadow-soak` Fly app is live on release 2 with its own
encrypted `fate_authority_v3_shadow_soak` volume. Its health endpoint reports
protocol v2 and startup logs show the unchanged legacy listener plus the
observer. The exact shadow flag is enabled, v3 authority is disabled, token
verification remains on, RTDB mirroring is disabled, and build ID
`phase6-b896a72f0815774aa0f43d8e6d5267ea46a945333830ae2a5752b09e3730939d`
matches the executable source digest. The exact
`FATE_PHASE6_REMOTE_CORPUS_SOAK=1` route then replayed the approved corpus
through 180 authenticated client-resolved rooms. A write-once snapshot selected
one latest comparison and its matching accepted event for each corpus index:
178 matched, the two known legacy defects were reviewed, no untranslated or
unreviewed records remained, and accepted-log reconciliation was 180/180.
`docs/fixtures/AUTHORITY_V3_PHASE6_DEPLOYED_SHADOW_AUDIT.json` pins the counts,
SHA-256 evidence fingerprints, deployment identity, build, engine, ruleset,
and decision digest. The production app and volume were not targeted and
remain on legacy release 311. Phase 6 is complete; Phase 7 may begin.

Matched shadow state may continue only across a canonical serialized reaction
prompt or mandatory hand-limit requirement. Exact decline, negate, and
suppress templates are selected by reaction card identity. Hand-limit
continuation requires the affected actor and an exact legal discard-IID set;
wrong-seat and post-reset discards cannot use it. Any reset, mismatch,
rejection, translation failure, or untranslated action invalidates the cached
v3 state before the next accepted event.

### Phase 7: Unranked Authoritative Beta

Enable authoritative rooms only for compatible client versions.

- No client `postState`
- No legacy fallback
- Full reconnect and crash recovery
- Unsupported decks rejected before matchmaking
- Existing multiplayer remains separately available during validation

Phase 7 local checkpoint (2026-07-31): the separate
`phase7-beta-server.mjs` entry point requires exact
`FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED=1`, a pinned compatible
client version, and beta-only `/v3/beta/*` paths. It rejects the Phase 6 shadow
route, generic pre-enabled v3 route, ranked match creation, unsupported decks,
old clients, and every client `postState`. Its SQLite actor recovers after an
actual process restart and reconnecting clients receive private canonical
snapshots. The browser module loads only for exact
`?fateV3UnrankedBeta=1`, blocks every competing authority route, reconnects
only to the separate beta endpoint, and declares no legacy fallback.
`smoke:authority-v3-phase7` gates these behaviors. The completion checkpoint
below records the separate deployment, authenticated matchmaking, full
multiplayer UI command integration, and real two-client restart evidence; the
default production route is unchanged.

Phase 7 implementation checkpoint (2026-07-31): Firebase-authenticated
unranked matchmaking now validates decks before queueing and issues distinct,
persisted per-match credentials without exposing an admin token. Private
server messages include server-derived legal command templates, and the full
battle screen routes them asynchronously through the command-only beta
transport. A separate Dockerfile, Fly config, encrypted-volume path,
predeploy validator, immutable source identity, and exact-opt-in two-client
restart soak are implemented. All local v3 and legacy regression gates pass.
Phase 7 completion checkpoint (2026-08-01): release 6 of the isolated
`fates-entwined-v3-unranked-beta` app runs build
`phase7-314e7aebd94921dd1af1427ebb9f18bef429fef59f375f000b8df36d75721d28`
on one machine and one encrypted beta-only volume. Before removal, the
interrupted-rollout duplicate was proven to contain zero matches, players,
commands, and snapshots. The live gate paired two Firebase-authenticated
clients with separate credentials, hid opponent hands, accepted placement and
end turn, restarted the sole Fly machine, recovered exact revision 2 and hash
`fe3_c85578560cadcecb`, and completed the match at revision 3 with no legacy
fallback. Production remained release 311. Phase 7 is complete; Phase 8 is the
next ordered phase.

### Phase 8: Full Cutover

After parity and soak gates:

- Enable server authority for all unranked modes
- Enable ranked last
- Remove client snapshot authority
- Remove automatic repair commits
- Remove board preference heuristics
- Remove obsolete server validators
- Remove duplicate legacy paths

There must be one gameplay mutation path after cutover.

## Testing Required Before Release

### Determinism

Replay the same match in separate Node processes and require identical hashes after every command.

### Property Tests

Examples:

- A card instance exists in exactly one zone.
- Deck, hand, board, and discard preserve total card identity.
- Fate values remain valid.
- Only authorized players answer prompts.
- A resolved prompt cannot resolve twice.
- Turn ownership changes only through legal commands.
- Hidden information never appears in opponent projections.

### Differential Tests

Recorded legacy single-player scenarios must match the new engine.

### Interaction Tests

Test mechanics by operation composition rather than only named cards:

- immunity plus every destructive operation
- replacement plus discard
- movement plus continuous modifiers
- reaction plus nested prompt
- consolidation plus departure triggers
- search plus opponent reactions

### Chaos Tests

Inject:

- delayed messages
- duplicate commands
- dropped acknowledgements
- reconnects
- server restart
- client restart
- prompt timeout
- malformed payloads
- old client versions

### Soak Tests

Before ranked cutover, run a large seeded automated match corpus across all legal cards and landscapes. Every accepted command must remain replayable with identical hashes.

## Preventing Future Patch Accumulation

Enforce architectural rules in CI:

- No direct gameplay mutation outside the engine.
- No card IDs in transport or room coordination code.
- No `Math.random()` inside rules.
- No browser timers inside rules.
- No callbacks stored in match state.
- No client `postState` in the authoritative protocol.
- No silent legacy fallback.
- No state-merging heuristics.
- No multiplayer-only version of a card effect.
- Every bug fix includes a replay, invariant, or property regression test.
- Replaced legacy paths are deleted rather than left dormant.

Maintain short architecture decision records for changes to prompts, triggers, persistence, protocol versioning, and room ownership.

## Fly.io Cost and Storage Design

A turn-based engine is inexpensive because it performs work only when a command arrives. Animations remain client-side.

### Active Rooms

Keep active room state in memory. Do not poll the server every one or two seconds. Use the WebSocket connection for state updates and bounded heartbeats.

### Persistence

For the initial deployment, a small SQLite database in WAL mode on a Fly volume is a cost-efficient option:

- compact accepted-command rows
- latest recovery snapshot
- match metadata
- final result summary
- idempotency records

Store one full recovery snapshot periodically, such as at turn boundaries, and append compact commands between snapshots. On recovery, load the snapshot and replay the command tail.

Do not permanently store:

- every complete post-state
- animations
- repeated player projections
- rendered data
- verbose diagnostics for successful matches

After a match:

- retain the small result and audit summary
- expire detailed command logs after a configurable debugging window
- remove abandoned rooms automatically
- retain longer logs only for flagged or disputed matches

### Scaling

Begin with one authoritative writer process. This is simpler, cheaper, and avoids split-brain room ownership.

When capacity requires multiple machines, assign each room to exactly one machine using explicit room ownership. Never allow multiple Fly machines to write the same room independently.

The engine and persistence interfaces must not depend directly on SQLite so the storage backend can be replaced later without changing game rules.

## Principal Risks and Prevention

| Risk | Prevention |
| --- | --- |
| Migration takes forever | Port operation families and use differential recordings instead of blindly rewriting cards |
| Single-player and multiplayer drift | Both use the same engine |
| Cross-card interaction explosion | Event, modifier, and replacement pipelines |
| Prompts cannot survive restart | Serializable effect stack and prompt state |
| Random outcomes disagree | Server-owned deterministic RNG |
| Rules change during an active match | Pin engine and ruleset versions |
| Client/server release mismatch | Protocol handshake and minimum compatible version |
| Hidden hand information leaks | Per-player state projections |
| Duplicate effect execution | Idempotent command IDs |
| Server crash loses a match | Recovery snapshot plus compact command tail |
| Storage grows indefinitely | Bounded logs and explicit retention policies |
| Fly horizontal scaling creates split brain | One explicit owner per room |
| New workaround bypasses architecture | CI architecture checks and deletion of replaced paths |
| Legacy behavior itself is incorrect | Explicit mismatch classification and rule decisions |
| A complex card does not fit the common effect format | Pure custom handler using shared operations |

## Recommended Initial Commitment

Do not begin with another full server reducer.

Begin with:

1. Canonical state schema and command protocol.
2. Legacy single-player action recorder.
3. Shared deterministic engine foundation.
4. One vertical slice containing:
   - an immediate effect
   - a multi-step picker
   - movement
   - a passive trigger
   - an Improvisor reaction
   - reconnect while a prompt is open
5. Deterministic replay and chaos validation.

If that slice cannot recover from restart and reproduce identical hashes, stop before porting more cards. If it succeeds, it becomes the required template for the rest of the game.

This is a substantial migration, but it avoids the two things that made previous attempts feel endless: duplicating rules and fixing card interactions inside the networking layer.

## Instructions for the Next Conversation

The next conversation should:

1. Read this document completely before proposing or making multiplayer changes.
2. Inspect the current repository rather than assuming older handoff files describe the active code.
3. Treat the existing multiplayer implementation as legacy during migration, not as the foundation of the new engine.
4. Avoid implementing another card-specific multiplayer patch.
5. Start with Phase 0 artifacts and the vertical-slice design.
6. Preserve existing single-player behavior until differential parity proves the new engine.
7. Never claim the authoritative architecture is ready based only on static smoke tests.
