# Fates Entwined Online Rebuild V1.4 — Existing Chat UI Bridge

This build keeps the V1.3 foundation and wires realtime chat into the base game's existing UI rather than adding new panels.

## Changes

- Keeps the existing World Chat widget from `09-challenger-mode.js`.
- Stops seeding/simulating local-only world chat messages in online mode.
- `sendWorldChat()` now writes to Realtime Database at `worldChat/{messageId}`.
- Subscribes to `worldChat` and feeds messages into the existing `SOCIAL.worldChat` array, then calls the existing renderer.
- Keeps the existing direct-message modal/classes and wires friend message buttons to RTDB-backed private messages.
- Private messages mirror under both users: `privateMessages/{ownerUid}/{peerUid}/messages/{msgId}`.
- No new top-level screens or new chat panels.

## Rules

Publish `REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1_4.json` if you have not already published V1.2 rules.

## What to test

1. Sign in two accounts in separate browser profiles/incognito windows.
2. Open the existing World Chat widget and send messages both ways.
3. Add friends, click the existing message button, and send private messages both ways.
4. Confirm the Social page, Free Play room-code lobby, and sign out still behave like V1.3.
