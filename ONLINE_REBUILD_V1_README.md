# Fates Entwined Online Rebuild V1

This package starts from the uploaded single-player working version and adds a new planned online foundation.

Implemented in this first rebuild pass:

- Google sign-in/account panel in the top right.
- RTDB public profile sync with stable FATE player IDs.
- Local browser profile remains separate from Google/cloud identity. The cloud public profile mirrors chosen username/photo/level/Elo for display only.
- Existing Social screen now uses the shared public profile service for friends, requests, online players, and profile inspection.
- Free Play Human now opens the approved room-code UI.
- Private rooms use Realtime Database `rooms/{roomCode}` with host/guest seats and profile snapshots.
- Room actions are stored as an action log under `rooms/{roomCode}/actions`; there are no render-loop writes and no full `G` snapshots.
- Realtime Challenger leaderboard mirror scaffold under `leaderboards/challenger`.
- Marketplace/public deck cloud scaffold functions under `FateOnline`, but secure server-side economy is intentionally not enforced in browser-only code.

Not completed yet in V1:

- Full action replay for every card/effect during human games. This is the next major step and should be implemented action-by-action, not through full-state sync.
- Random Challenger matchmaking. The data model is planned, but not enabled until rooms/action transport are stable.
- Server-authoritative Elo/economy/monthly AI. These need Cloud Functions for real integrity.

Deployment:

1. Upload this folder.
2. Publish `REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1.json` to Realtime Database rules.
3. Clear old RTDB `rooms` before testing.
4. Hard refresh / unregister service worker if old patched files keep loading.
5. Test only Google sign-in, Social, and Free Play room create/join first.

## V1.2 additions

V1.2 keeps the V1/V1.1 foundation and adds communication features inside the existing Social screen:

- World chat backed by `worldChat` in Realtime Database.
- Friend private messages backed by mirrored per-user `privateMessages/{uid}/{friendUid}/messages` paths.
- Lightweight `privateThreads/{uid}/{friendUid}` last-message metadata for future notification badges.
- No new top-level screen; these panels live inside the existing Social screen.
- Free Play room code and account panel remain the only new top-level online UI.

Update Realtime Database rules with `REALTIME_DATABASE_RULES_ONLINE_REBUILD_V1_2.json` before testing chat/messages.
