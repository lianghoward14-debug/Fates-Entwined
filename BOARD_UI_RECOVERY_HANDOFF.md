# Board UI Recovery Handoff

Last updated: 2026-06-03

## Why This File Exists

The in-game board UI is currently broken after repeated CSS fixes. The user is extremely frustrated, and the next chat must not repeat the same patch-by-patch guessing cycle.

The immediate visual problem is the in-game board layout:

- The board now renders, but the zone header/fate score bars are wrong.
- Zone title/fate bars are not aligned with the visible zone/cell grid.
- Zone rows/cells appear offset inside the zone. In screenshots, each zone border starts correctly, but the cell grid is shoved toward the right side of the zone.
- The user says this is still wrong after several failed attempts.

Do not touch unrelated UI while fixing this. The user has explicitly complained about CSS fixes causing regressions in modals, deck preview, edit-art, public decks, zoom, and challenger views.

## Current User Expectation

The user wants the board UI restored to the old working look from backup.

They specifically said to refer to old UI in backup to know how it should look.

They do **not** want:

- More guessing from screenshots.
- Broad rollback of unrelated changes.
- DOM-board fallback.
- Disabling canvas board.
- Removing modal expansion rules.
- Cosmetic redesigns.
- Changes to deck preview, public decks, edit art, challenger deck previews, zoom, or daily login while fixing this board issue.

## Important Current State

Workspace:

```text
C:\Users\liang\OneDrive\Desktop\Fates Entwined main
```

Main files involved:

```text
index.html
src/styles/game.css
src/styles/99-ui-final.css
src/styles/zz-codex-last.css
src/scripts/06-rendering-and-helpers.js
src/scripts/23-board-canvas-renderer.js
project-backups/20260524-124036-full-backup/src/styles/game.css
project-backups/20260524-124036-full-backup/src/styles/zz-codex-last.css
Fates-Entwined-main-backup-20260601-195447.zip
```

Current stylesheet load order in `index.html`:

```html
<link rel="stylesheet" href="src/styles/game.css?v=1780269000">
<link rel="stylesheet" href="src/styles/99-ui-final.css?v=1780306400">
<link rel="stylesheet" href="src/styles/zz-codex-last.css?v=1780307000">
```

`zz-codex-last.css` loads last and currently overrides many board rules. It is the most likely place where bad final overrides are winning.

## Known Good Fix That Should Be Preserved

There was a real JS crash that prevented the board from rendering:

```text
Uncaught TypeError: Cannot set properties of null (setting 'boardPatched')
    at performGameRender (06-rendering-and-helpers.js:415)
```

This was caused by code writing to `breakdown.boardPatched` when `breakdown` could be `null`.

The important fix is:

```js
if(breakdown) breakdown.boardPatched = !!patched;
```

Also check that `performGameRender()` detects a board without `.zone` children and forces a full board render. This part helped get the board visible again.

Do not undo this JS crash fix unless you replace it with an equivalent guard.

## Failed Attempts To Avoid Repeating

Several final CSS blocks were added to `src/styles/zz-codex-last.css` near the end of the file. They did **not** fix the UI.

Bad/failed blocks currently present:

```css
/* Codex 2026-06-03: restore the old backup zone title/fate-bar geometry. */
...
/* Codex 2026-06-03b: backup board row geometry. */
...
```

These blocks start around the `src/styles/zz-codex-last.css` search hits:

```text
Codex 2026-06-03
Codex 2026-06-03b
```

They attempted to restore backup header geometry and row geometry, but the user confirmed the UI is still wrong. Treat these as suspect. The next fix should likely remove or replace them, not stack more overrides on top of them.

The failed approach was:

- Hide `.zone-floating-banner` / `#zone-floating-banners`.
- Restore `.zone-hdr-main` from backup.
- Force `.zone-score-card` to backup values.
- Force `.brow` to `grid-template-columns:12px max-content`.
- Force `.rcells` to `width:max-content`.

This was insufficient and may have made alignment worse because the current board CSS stack has changed more deeply than just header and row selectors.

## Critical Warning About Current CSS Stack

The live board CSS is heavily layered:

- `game.css` has many repeated board/zone rules.
- `99-ui-final.css` has many repeated board/zone rules and canvas-board-mode overrides.
- `zz-codex-last.css` has additional repeated final board rules.

Adding one more `!important` block at the bottom is very likely to make things worse unless the exact computed cause is verified first.

Do **not** guess from screenshots alone. Use computed layout inspection.

## How To Diagnose Correctly

Use the Browser plugin or devtools-like inspection to collect actual bounding boxes and computed styles from the running game.

Inspect these elements:

```js
const zones = [...document.querySelectorAll('#s-game #board .zone')];
zones.map((zone) => {
  const q = (s) => zone.querySelector(s);
  const rect = (el) => {
    if(!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom)
    };
  };
  const cs = (el) => el ? getComputedStyle(el) : null;
  const brow = q('.brow');
  const rcells = q('.rcells');
  const cell = q('.cell');
  return {
    zone: rect(zone),
    hdr: rect(q('.zone-hdr')),
    title: rect(q('.zone-hdr-main')),
    score: rect(q('.zone-score-card')),
    rows: rect(q('.zone-rows')),
    brow: rect(brow),
    rcells: rect(rcells),
    firstCell: rect(cell),
    zoneDisplay: cs(zone)?.display,
    zoneGridTemplateColumns: cs(zone)?.gridTemplateColumns,
    zoneRowsDisplay: cs(q('.zone-rows'))?.display,
    browDisplay: cs(brow)?.display,
    browGridTemplateColumns: cs(brow)?.gridTemplateColumns,
    rcellsDisplay: cs(rcells)?.display,
    rcellsWidth: cs(rcells)?.width,
    cellWidth: cs(cell)?.width,
    cellHeight: cs(cell)?.height
  };
});
```

Compare against the backup by running the same page or reading the backup CSS. Do not rely only on line-by-line copying.

Useful visual expectations:

- Each zone title should be visually centered above its zone.
- Each fate score pill should be centered under the zone title and above the cell grid.
- The 3x3 cell grid should be centered in the zone, not shoved to the right.
- Zone 1, Zone 2, and Zone 3 should have identical internal geometry.
- The card in a cell should sit inside the cell, not make the whole row look offset.

## Backup Source Of Truth

The most useful backup file found so far:

```text
project-backups/20260524-124036-full-backup/src/styles/game.css
```

Relevant backup sections:

```text
around 9011-9059: compact zone title and fate score header geometry
around 8338-8355: row/cell geometry for backup board
around 12218-12242: another late compact zone header override
```

Examples from backup:

```css
#s-game .zone-hdr{
  min-height:30px!important;
  height:30px!important;
  padding:0 .24rem .18rem!important;
  margin:0 0 .12rem!important;
}

#s-game .zone-hdr-main{
  left:50%!important;
  top:-18px!important;
  bottom:auto!important;
  transform:translateX(-50%)!important;
  width:auto!important;
  min-width:112px!important;
  max-width:calc(100% - 3.2rem)!important;
  height:20px!important;
  padding:0 .72rem!important;
  justify-content:center!important;
  border-radius:5px!important;
  background:linear-gradient(180deg,rgba(7,8,12,.92),rgba(0,0,0,.9))!important;
}

#s-game .zone-score-card{
  position:absolute!important;
  left:50%!important;
  right:auto!important;
  top:4px!important;
  transform:translateX(-50%)!important;
  width:clamp(190px,13vw,230px)!important;
  min-width:clamp(190px,13vw,230px)!important;
  height:23px!important;
  padding:.12rem .46rem .34rem!important;
  grid-template-columns:36px minmax(56px,1fr) 36px!important;
  border-radius:999px!important;
}

#s-game .brow{
  grid-template-columns:12px max-content!important;
  justify-content:center!important;
  gap:.08rem!important;
  padding:.05rem 0!important;
}

#s-game .rcells{
  gap:.12rem!important;
}
```

But copying only these snippets into the current final stylesheet did not fix the current UI. The current live CSS likely has another container-level rule altering zone layout, board scale, canvas-board mode, or row/cell positioning.

## Suspect Areas To Inspect

Search these selectors across all stylesheets:

```powershell
Select-String -LiteralPath 'src/styles/game.css','src/styles/99-ui-final.css','src/styles/zz-codex-last.css' -Pattern '#s-game \.board|#s-game \.zone|#s-game \.zone-rows|#s-game \.brow|#s-game \.rcells|#s-game \.cell|fate-canvas-board-mode'
```

Specific suspicious areas:

```text
src/styles/99-ui-final.css around 17650: fate-canvas-board-mode #board/.zone/.brow/.bc overrides
src/styles/99-ui-final.css around 14436-14475: zone-score-card and brow positioning
src/styles/game.css around 7577-7609: zone rows/cells grid layout
src/styles/game.css around 7789-7846: later zone rows/cells layout
src/styles/game.css around 8189-8208: compact board sizing
src/styles/game.css around 8741-8781 and 9011-9059: later zone header rules
src/styles/zz-codex-last.css around 8764 and 8909: failed latest handoff fixes
```

Do not assume the final `zz-codex-last.css` rule is enough. Check computed styles.

## Recommended Recovery Plan

### Step 1: Stop the bleeding

Do not make additional unrelated edits.

Make a temporary note of the current bad blocks in `zz-codex-last.css`, then remove or replace only the failed June 3 board blocks:

```text
/* Codex 2026-06-03: restore the old backup zone title/fate-bar geometry. */
/* Codex 2026-06-03b: backup board row geometry. */
```

Do not delete older unrelated `zz-codex-last.css` changes without verifying ownership and impact.

### Step 2: Inspect actual computed geometry

Use Browser/Playwright evaluate while the game is on the broken board screen.

Get bounding boxes for:

- `#board`
- `.zone`
- `.zone-hdr`
- `.zone-hdr-main`
- `.zone-score-card`
- `.zone-rows`
- `.brow`
- `.rl` / `.rlabel`
- `.rcells`
- `.cell`
- `.bc`

Also collect computed styles listed in the diagnostic JS above.

The fix should be based on the observed mismatch, not assumptions.

### Step 3: Restore board layout as one coherent board-scoped layer

If the current computed styles are too tangled, create a single board recovery layer in `zz-codex-last.css` that explicitly defines the complete board internal geometry:

- `#s-game #board`
- `#s-game #board .zone`
- `#s-game #board .zone-hdr`
- `#s-game #board .zone-hdr-main`
- `#s-game #board .zone-score-card`
- `#s-game #board .zone-rows`
- `#s-game #board .brow`
- `#s-game #board .rl`
- `#s-game #board .rcells`
- `#s-game #board .cell`

Keep it strictly under `#s-game #board`.

Avoid generic selectors like:

```css
html body .modal ...
html body .zone ...
.brow ...
.cell ...
```

### Step 4: Preserve canvas board path

The user explicitly said the board must be canvas, not DOM fallback.

Do not set:

```js
window.FATE_RUNTIME_FORCE_DOM_BOARD = true
localStorage.setItem('fateDisableCanvasBoard','1')
```

Do not remove or disable:

```html
<script src="src/scripts/23-board-canvas-renderer.js?..."></script>
```

Do not change `shouldUseCanvasBoardVisuals()` unless the computed diagnostics prove it is the source of the broken layout.

### Step 5: Verify with exact acceptance criteria

After changes:

1. Bump only the changed CSS file query string in `index.html`.
2. Restart Electron.
3. Start/enter a game.
4. Confirm:
   - Board zones render.
   - Zone title and fate score are centered over each zone.
   - 3x3 cells are centered within each zone.
   - No massive empty offset at left or right inside zones.
   - Hand panel still renders.
   - No console error from `performGameRender`.
   - No modal/deck/public deck UI was touched.

Use a screenshot or computed geometry to verify. Do not rely on "looks probably ok."

## Commands That Were Useful

Check current status:

```powershell
git status --short
```

Find board rules:

```powershell
Select-String -LiteralPath 'src/styles/game.css','src/styles/99-ui-final.css','src/styles/zz-codex-last.css' -Pattern '#s-game \.board|#s-game \.zone|#s-game \.zone-rows|#s-game \.brow|#s-game \.rcells|#s-game \.cell|fate-canvas-board-mode'
```

Read backup board snippets:

```powershell
Get-Content -LiteralPath 'project-backups/20260524-124036-full-backup/src/styles/game.css' | Select-Object -Skip 9010 -First 72
Get-Content -LiteralPath 'project-backups/20260524-124036-full-backup/src/styles/game.css' | Select-Object -Skip 8338 -First 36
Get-Content -LiteralPath 'project-backups/20260524-124036-full-backup/src/styles/game.css' | Select-Object -Skip 12218 -First 62
```

Restart Electron:

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList @('start') -WorkingDirectory (Get-Location)
```

Check for syntax/whitespace issues:

```powershell
git diff --check -- index.html src/styles/zz-codex-last.css src/scripts/06-rendering-and-helpers.js
node --check src/scripts/06-rendering-and-helpers.js
```

## What The Next Chat Should Avoid

This is important. Do not repeat the mistakes from this thread.

- Do not say "I fixed it" unless it has been visually or geometrically verified.
- Do not keep stacking final `!important` CSS guesses.
- Do not touch unrelated modals, deck preview, edit art, public decks, login rewards, zoom, challenger, or multiplayer while fixing board layout.
- Do not broad rollback the entire repo.
- Do not undo user/generated changes outside the board issue.
- Do not disable canvas board.
- Do not switch to DOM board fallback.
- Do not remove modal height expansion rules.
- Do not change card data, decks, online state, or saves.
- Do not treat the May 24 backup as a whole-project rollback source. Use it as a layout reference.
- Do not rely on cache-busting alone. Confirm loaded CSS and computed styles.

## User Communication Guidance

The user is at the end of their patience. Be direct and avoid overpromising.

Good response style:

```text
I am going to inspect computed board geometry first and make one board-scoped recovery patch. I will not touch modals, zoom, deck preview, or canvas enablement.
```

Bad response style:

```text
This should fix it.
```

unless verified.

If you cannot verify visually/geometrically, say so.

## Suggested First Action For New Chat

1. Read this file.
2. Search/remove the two failed June 3 blocks in `src/styles/zz-codex-last.css`.
3. Use Browser evaluate to capture computed geometry from the broken board.
4. Compare with backup geometry.
5. Patch only `src/styles/zz-codex-last.css` and `index.html` cache version.
6. Restart Electron and verify.

Do not proceed to other UI fixes until the board is correct.
