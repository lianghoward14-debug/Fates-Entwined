# Authoritative v3 Phase 7 unranked beta

Phase 7 is complete. Its isolated command-only server, authenticated
matchmaking, full UI adapter, packaging, deployed restart recovery, and remote
two-client soak all pass.

## Exact isolation

The server entry point is
`server/authoritative-v3/phase7-beta-server.mjs`. It refuses to start unless:

```text
FATE_SERVER_AUTHORITATIVE_V3_PHASE7_BETA_ENABLED=1
FATE_AUTHORITY_V3_PHASE7_CLIENT_VERSION=<exact-compatible-version>
```

It also refuses the Phase 6 shadow flag, refuses a pre-enabled generic v3 flag,
and owns only:

```text
POST /v3/beta/matches
POST /v3/beta/matchmaking/enter
GET  /v3/beta/matchmaking/status
POST /v3/beta/matchmaking/leave
GET  /v3/beta/matches/<matchId>/snapshot
WS   /v3/beta/socket
```

The generic `/v3/matches` and `/v3/socket` paths are unavailable in beta mode.
The existing protocol-v2 multiplayer server, default `Dockerfile`, and default
`fly.toml` do not name or start Phase 7.

The browser route requires exact `?fateV3UnrankedBeta=1`. It rejects concurrent
Phase 5 single-player, Phase 6 shadow, generic Fly authority, and authority URL
override flags. A conflict clears all legacy authority URLs and blocks
multiplayer. Without the exact flag, the Phase 7 client module is never loaded.

## Current beta protocol

- Protocol version is 3.
- The pinned compatible client is `1.39.0-phase7-beta.1`.
- Match creation accepts `mode: "unranked"` only.
- Unsupported or malformed decks are rejected before a match is persisted.
- Clients submit commands with `expectedRevision`; any nested client
  `postState` is rejected.
- Each player receives only their private projection.
- Accepted commands are idempotent by `commandId`.
- SQLite snapshots and accepted commands recover the actor after process
  restart.
- Reconnecting clients authenticate with a per-match token and receive a fresh
  canonical private snapshot.
- The browser beta transport reconnects to the beta endpoint only and declares
  `legacyFallback:false`.
- Matchmaking verifies a Firebase ID token, rejects the deck before queueing,
  creates unranked matches internally, and returns only the caller's private
  per-match credential. Direct public match creation is disabled.
- Server messages include private, server-generated legal command templates.
  The existing battle screen submits those templates through an asynchronous
  network adapter and never mutates canonical state.

## Gate

Run:

```text
npm run smoke:authority-v3-phase7
```

The gate proves exact-flag startup, route conflicts, client-version rejection,
unranked-only match creation, unsupported-deck rejection, hidden projection,
command-only enforcement, accepted command broadcast, durable server restart
recovery, client resume routing, and absence of default-production references.

## Deployed completion evidence

- App/release: `fates-entwined-v3-unranked-beta`, release 6.
- Build: `phase7-314e7aebd94921dd1af1427ebb9f18bef429fef59f375f000b8df36d75721d28`.
- Topology: one healthy machine and one encrypted beta-only volume.
- Live gate: two Firebase-authenticated clients, distinct per-match
  credentials, hidden opponent hands, command-only placement and end turn,
  exact revision/hash recovery after a real machine restart, and completed
  outcome with `legacyFallback:false`.
- Audit: `fixtures/AUTHORITY_V3_PHASE7_DEPLOYED_BETA_AUDIT.json`.
- Control: legacy production remained release 311 unchanged.
