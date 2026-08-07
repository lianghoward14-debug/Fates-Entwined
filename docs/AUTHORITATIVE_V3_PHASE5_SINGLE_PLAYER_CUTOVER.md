# Authoritative v3 Phase 5 single-player cutover

Phase 5 is complete behind its exact, isolated opt-in. This ledger records the
local-authority implementation and its completed promotion gates.

## Independent activation boundary

The Phase 5 browser module is imported only when the URL contains the exact
query flag:

```text
?fateV3SinglePlayer=1
```

This flag is independent from:

- `?fateV3Recorder=1`, which remains an observe-only Phase 0 tool;
- `FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1`, which starts the isolated v3
  multiplayer server;
- every legacy local, online, matchmaking, and server route.

The recorder and Phase 5 local-authority mode are mutually exclusive. The
legacy setup and AI scripts do not import or dispatch into the Phase 5 module.
Without the exact query flag, the module is not loaded.

## Completed first cutover slice

`FateAuthoritativeV3LocalSession` now supports both match seats while retaining
one explicit rendering perspective:

- human and AI commands identify their own player actor;
- every accepted command carries the current match ID and expected revision;
- legal commands come from `legalCommandTemplates`;
- rejected commands leave revision and canonical state unchanged;
- render subscribers receive `projectStateForPlayer`, never canonical opponent
  hand or deck state;
- events pass through `projectEvents`;
- accepted commands export as one replay and recover with hash verification.

`FateAuthoritativeV3SinglePlayerAdapter` is the first UI-facing command
boundary. It renders a player projection plus that player's legal commands and
maps complete UI actions for set, consolidate, prompt answer, and end turn back
to exact legal command templates. Its deterministic AI chooses only from the
AI seat's legal templates and submits the selection through the same local
session.

The default AI policy is now a separate v3-only strategy layer. It ranks exact
legal templates using only the AI player's projection, including visible Fate,
zone pressure, tribute/discard cost, destination value, and declaration type.
It never receives canonical hidden opponent state, never imports legacy `G`,
and cannot submit directly; the adapter revalidates the returned template
before the local session sends it to the shared reducer.

The flagged browser controller can construct a production-shaped match from
the currently selected 40-card local decks through a narrow read-only catalog
bridge. It emits `fate-authority-v3-single-player-state` and
`fate-authority-v3-single-player-events` for the match screen adapter. These
events contain the human projection, legal commands, and projected events;
they do not expose canonical state. Renderer callback failures are recorded
downstream and cannot reverse or disguise an already accepted reducer command.

## Existing match-screen cutover slice

When the exact Phase 5 flag is present, `startGame(true)` now hands control to
the v3 local controller before legacy match setup can mutate `G`. If the module
is not ready or the requested mode is not an AI match, start fails closed; it
does not continue into legacy authority.

The first existing-screen adapter owns:

- player/opponent names and hidden opponent hand count;
- deck, hand, discard, landscape, turn, phase, and zone-score rendering;
- all 27 base board squares;
- hand-card selection and engine-derived legal destination highlights;
- set-card submission;
- generic serialized prompt and hand-limit actions;
- board-card effect, movement, flip, and landscape command buttons;
- end-turn submission and automatic command-only AI execution.

The advanced existing-screen slice additionally owns:

- added safe rows and generated individual squares from projected geometry;
- destination disambiguation for consolidation, movement, deck-origin setting,
  and adaptive-token declarations;
- deck-origin, adaptive-token, landscape, activation, concede, and every other
  engine-generated command family;
- exact multi-card, hand-limit, and multi-square selection without clipping the
  legal template list;
- friendly tribute, discard, reaction, target, and declaration labels;
- projection-only endgame presentation and return-to-menu cleanup;
- replay recovery remount through `resumeOnGameScreen`;
- explicit teardown that removes v3 ownership and restores the pre-existing
  End Turn handler.

The legacy canvas renderer, legacy render entry points, and legacy hand-drag
capture explicitly relinquish ownership while the v3 local screen is active.
The v3 screen imports no legacy state and never calls `selectHandCard`,
`clickCell`, or legacy `endTurn`.

The browser interaction check completed a real flagged Free Play route using a
selected 40-card preset: 27 projection-backed squares rendered, selecting a
Supporter exposed 18 legal destinations, setting it resolved two serialized
prompt steps, and End Turn completed the AI command loop before returning the
human at turn 3.

`smoke:authority-v3-phase5` proves:

- exact flag isolation and recorder exclusion;
- zero legacy setup/AI imports;
- hidden-information projection;
- a complete human `SET_CARD` interaction;
- atomic rejection of an illegal UI action;
- an AI turn made entirely of reducer commands;
- two-seat replay recovery with final-hash equality;
- projection event delivery from the selected legacy decks;
- renderer failure isolation after command acceptance;
- exact-flag `startGame(true)` ownership before legacy setup;
- canvas, legacy renderer, and hand-drag relinquishment;
- match-screen command routing with no direct legacy gameplay calls;
- dynamic geometry, advanced command-family, prompt-selection, outcome,
  recovery, and teardown routing;
- projection-only strategic AI choice with exact-template revalidation;
- offline translation of the real legacy-recorder schema plus normalized
  visible-outcome comparison and four-way mismatch classification;
- production-shaped 40-card local match construction.

## Completed Phase 5 gates

The differential parity item is complete: the representative 20-match,
180-action legacy corpus now reports 178 exact matches, two reviewed legacy
defects, zero translation failures, and zero unclassified mismatches.

The browser-family item is also complete. A standalone harness that requires
the exact, test-only `?fateV3BrowserCoverage=1` flag is never imported by the
game page. Live browser interactions passed consolidation, adaptive-token,
movement, activation plus target prompt, hand-limit, landscape, generated
geometry, multi-card, multi-square, and replay-resume scenarios. The pass found
and fixed the missing confirmation command for multi-square destination
prompts.

The AI-calibration item is complete. Across 120 comparable strategic legacy
decisions, the projection-only policy matches 105 action families, 73 card
instances, and 58 exact destinations. Repeated selection is deterministic,
every result is one of the supplied legal templates, and the opponent hand is
absent from the input projection.

Legacy single-player remains the unflagged default as an explicit route-
isolation requirement. The completed v3 path still requires
`?fateV3SinglePlayer=1`; no fallback or automatic route switch was added.

Phase 6 server shadow work has not started.
