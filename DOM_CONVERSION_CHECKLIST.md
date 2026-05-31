# DOM Conversion Checklist

Date: 2026-05-18

This checklist is intentionally fixed. New items should only be added if we find a loaded, user-visible DOM render path that is not covered here.

## Progress

- [x] Board card visuals: canvas board renderer with DOM hitboxes.
- [x] Deck builder collection grids: canvas card grid.
- [x] Deck builder selected-deck lists: canvas list renderer.
- [x] Search/effect card picker pages: canvas picker.
- [x] Discard/revealed-hand gallery windows: canvas gallery.
- [x] Preset/deck preview tiles: canvas hero and mini strips.
- [x] Gameplay side-panel image surfaces: canvas profile pictures and discard previews.
- [x] Preset/public/Challenger deck detail card grids: canvas card grids.
- [x] Save-deck face/display pickers: canvas selectable grids.
- [x] Card detail/info image surfaces: convert image area to canvas.
- [x] Active edit-art face/display pickers: convert remaining loaded edit-art picker paths.
- [ ] Public/share deck legacy DOM paths: remove or mark inactive after confirming loaded replacement.
- [x] Topbar effect pills: retain DOM but convert to keyed nodes instead of `innerHTML`.
- [ ] Player rank/stat badges: retain DOM but reduce `innerHTML` rebuilds.
- [ ] Affiliation picker: retain small DOM or convert to canvas/icons after confirming visual risk.
- [ ] Opponent revealed hand cards: convert revealed mini cards to canvas.
- [ ] Player hand cards: final high-risk conversion to canvas visuals with DOM hitboxes.
- [ ] Legacy duplicate v2 files: quarantine/label as inactive to stop future confusion.

## Current Rule

Do not expand this list casually. If something new appears, map it to an existing bucket first.
