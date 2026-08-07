# Authoritative Multiplayer v3

This is the isolated implementation of
`SERVER_AUTHORITATIVE_MULTIPLAYER_MIGRATION_PLAN.md`.

## Isolation boundary

- Legacy multiplayer continues to start with `server/fate-ws-authority.js`.
- V3 starts only with `server/authoritative-v3/server.mjs`.
- V3 refuses to start unless `FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1`.
- The legacy server does not import, inspect, or dispatch to V3.
- V3 uses protocol version 3 and the `/v3/socket` endpoint.
- V3 commands reject `postState` and `baseStateHash` anywhere in the payload.
- V3 uses a separate SQLite database and Fly configuration.
- The network browser adapter remains disconnected from `index.html`.
- The Phase 5 local single-player adapter is imported only for the exact
  `?fateV3SinglePlayer=1` opt-in. It has no server transport and refuses to
  coexist with the observe-only recorder flag.

This prevents a match from silently falling through between authority models.

## Prototype foundation (not a phase-completion claim)

Migration phases are enforced in document order. Phases 0 through 4 pass and
Phase 5 single-player cutover is active; see
`AUTHORITATIVE_V3_PHASE_STATUS.md`. The code below remains isolated and cannot
be promoted until every required phase gate passes.

The browser-and-Node-compatible engine under `shared/engine/` owns:

- canonical schema, permanent card instance IDs, seeded RNG, stable serialization,
  deterministic hashing, invariants, and private projections;
- universal draw, set, move, discard, Fate, reveal, and status operations;
- common targeting, immunity, movement, modifier, event, trigger, and reaction
  pipelines;
- serializable effect frames and prompts that survive process restart;
- the vertical-slice card families covering immediate draw effects, targeted
  Fate/discard effects, multi-step movement, movement and draw passives, Lydia,
  Mr. Secules, Havano Citizen, and Anička Voyager;
- the first Phase 4 draw/search slice, using private serialized search prompts
  and shared transfer operations for cards 06, 13, 29, 48, 58, 60, and 68;
- the first Phase 4 Fate-modification slice, using shared affine and batch Fate
  operations for cards 03, 22, 83, and 93, plus authoritative per-turn use
  tracking and the catalog-parity +6 next-draw behavior for card 40;
- the first Phase 4 movement slice, adding card 69 through a serialized,
  expiring movement grant that still executes the common `MOVE_CARD` pipeline;
- the first Phase 4 discard/removal slice, adding cards 16, 38, 42, 80, and
  bh25 through shared targeted and atomic batch discard operations;
- an owner-preserving `CHANGE_CONTROL` board operation. Hidden-zone transfer
  cards remain ineligible until every arrival and return path is implemented;
- the first Phase 4 status/permission slice, adding cards 18, 20, and 53
  through serialized target-player turn locks, shared use counters, and common
  immunity and consolidation permission queries;
- the first Phase 4 continuous-modifier slice, adding cards 10, 11, 23, 57,
  and 59 through one non-materializing effective-Fate query used by scoring;
- the first Phase 4 placement-permission slice, adding card 50 through a
  scoped, serialized target-turn status shared by validation and legal-command
  generation;
- the first Phase 4 reaction-event subscriber, adding bh08 through canonical
  negate/suppress events and shared Fate-trigger operations;
- a canonical landscape registry and the first five complete landscapes:
  igb1, igb6, igb10, igb11, and igb12;
- the first unusual-custom slice, adding card 09 through the same reinforcement
  query used by consolidation validation and legal-command generation;
- a second Phase 4 coverage pass adding cards 19, 47, 55, 63, and 88 through
  the existing effective-Fate and consolidation pipelines;
- an event/query expansion adding cards 15 and 49 through canonical `CARD_SET`
  triggers and shared tribute eligibility;
- a cumulative-counter expansion adding cards 85 and 89 through canonical
  Supporter set/effect totals and the shared non-materializing effective-Fate
  query. Effect activations count only after their reaction window proceeds;
- a shared-mechanism batch adding cards 12, 33, 35, 46, 87, 92, 95, and 97
  through atomic multi-target statuses, hand-arrival replacements, turn/draw
  ticks, suppression, and consumable consolidation modifiers.
- a declaration and deterministic-selection batch adding cards 51, 66, 77,
  90, 96, and bh04 through recoverable modal choices, match-owned RNG,
  canonical affiliation-change and draw-effect events, owner-turn expiry,
  live effective-Fate auras, and atomic rounded split loss.
- a final-card dependency batch raising card coverage to 108 of 109 through
  owner-tagged dynamic geometry, square statuses, deck-origin and free sets,
  copied programs, opening/hidden-hand replacements, delayed delivery,
  face-down consolidation, generated tokens, type replacement, placement
  history, and live adjacency/derived Fate queries;
- a completed landscape batch implementing all 20 IDs through seeded setup,
  canonical counters, resumable turn and triggered prompts, server-owned turn
  timeout, atomic player-facing landscape commands, copied field-wide token
  effects, threshold claims, and card 82's complete landscape transition.
  Phase 4 coverage is now 109 of 109 cards and 20 of 20 landscapes.

The room actor provides one logical writer, expected-revision checks,
`commandId` idempotency, private broadcasts, snapshots, compact command rows,
and replay-based recovery with hash verification.

The Phase 5 local session uses the same reducer without a transport. Human and
AI seats submit player-scoped commands, renderers receive only player
projections and projected events, and accepted commands form one hash-verified
recovery replay. Under the separate flag, AI game start is claimed before
legacy match setup and the first existing-screen loop renders directly from
the human projection. Canvas, legacy renderer, and hand-drag layers relinquish
ownership for that match. The screen now derives generated rows and squares
from projected geometry; presents every special command family and serialized
multi-selection prompt; renders projected endgame; and supports replay remount
plus explicit ownership teardown. A separate v3 AI policy scores only its
private player projection and exact engine templates; the adapter revalidates
the chosen template before reducer submission. Complete browser-family
coverage, AI corpus calibration, and differential gameplay parity are still
required before Phase 5 completion.

Phase 5 differential execution is offline. The recorder's wrapped legacy state
and `LEGACY_*` commands pass through
`tools/authority-v3-legacy-normalization.mjs`; only the translated state and
command reach `reduceCommand`. The result is reduced to the recorder's visible
outcome shape before comparison. This tooling does not change live authority
routing and is not Phase 6 shadow mode.

## Beta eligibility

Only cards declared by `shared/engine/cards/registry.mjs` may enter a V3 match.
All other cards receive an explicit `unsupported` coverage declaration and are
rejected before match creation. Test decks smaller than 40 cards require the
separate `FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES=1` flag.

This vertical slice is the template for porting the remaining card families.
It is intentionally not wired into ranked or legacy matchmaking.

## Local start

PowerShell:

```powershell
$env:FATE_SERVER_AUTHORITATIVE_V3_ENABLED = '1'
$env:FATE_AUTHORITY_V3_ALLOW_TEST_MATCHES = '1'
node server/authoritative-v3/server.mjs
```

The default bind is `127.0.0.1:8790`. Use `POST /v3/matches` to create a beta
match and connect each returned player credential to
`ws://127.0.0.1:8790/v3/socket`.

Any non-loopback bind also requires `FATE_AUTHORITY_V3_ADMIN_TOKEN`; the
separate Fly deployment should provide it as a secret.
