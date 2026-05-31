# Fates Entwined Online Rebuild V1.12

Focused update from V1.11.

## UI changes
- Moved the Google account badge directly above the title profile card.
- Lowered portrait columns in both the normal Profile modal and inspected player profile modal.
- Moved main profile content upward so name/rank/bio align better beside the portrait.
- Kept the inspected FATE code directly to the right of the username with truncation safeguards.
- Narrowed the Online Players panel and Party panel.
- Made Online player badges more square and snug in a 2x3 page grid.
- Made Online player badge backgrounds more transparent.

## Free Play Human bootstrap
- Host Start now writes a single `MATCH_START` action to the room action log.
- Room start now creates a shared match seed.
- The shared seed drives deterministic deck shuffling through a seeded RNG when in online room mode.
- Both clients keep local-only perspective fields: `G.localPlayerIndex`, `G.viewerPlayerIndex`, and `_onlinePlayerIndex`.
- Public profile snapshots are applied to `G.playerProfiles` for in-game banners.
- Still no render-loop sync and no full `G` snapshot sync.

## Not yet complete
- Full card-action replay is not finished yet.
- The current Free Play implementation is the safe bootstrap: lobby -> start -> local match startup with deterministic seed/action-log foundation.
