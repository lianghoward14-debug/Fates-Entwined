# Fates Entwined Online Rebuild V1.6 — World Chat Persistence Fix

Focused fixes:

- Uses the existing base `world-chat-widget` only. No new chat panels.
- Exposes the base `SOCIAL` object safely so the online bridge can clear local-only fake chat state.
- Prevents local fake/AI world chat messages from being persisted while online mode is active.
- Renders world chat from `window.FATE_ONLINE_WORLD_CHAT`, which is filled by RTDB `worldChat`.
- Keeps RTDB world chat messages persistent between sessions.
- Delegates the base `sendWorldChat()` to the online RTDB sender once the online module is loaded.

Testing:

1. Publish `REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1_6.json`.
2. Hard refresh both browsers.
3. Sign into two different Google accounts using separate browser profiles or incognito/session separation.
4. Open World Chat; old local fake messages should disappear after online initializes.
5. Send a message from Account A and verify Account B sees it.
6. Refresh and verify the real player messages persist.
