# ADR 0001: Isolate authoritative v3 from legacy multiplayer

Status: accepted

The authoritative migration runs as protocol version 3 in a separate process,
database, WebSocket endpoint, browser module, Dockerfile, and Fly app. The
process refuses to start without `FATE_SERVER_AUTHORITATIVE_V3_ENABLED=1`.
Legacy multiplayer never imports or dispatches into v3.

This makes the authority model a match-level invariant and prevents a runtime
fallback from mixing client-resolved snapshots with engine commands.

