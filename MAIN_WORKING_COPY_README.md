# Fates Entwined Main Working Copy

This folder is now the main working copy for future AI/code work:

`C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0 - Copy (3)`

Use this folder as the source of truth unless Howard explicitly says otherwise.

## Why This Copy

This copy was chosen as the best current baseline because it appears to be the smoothest/least contaminated version:

- It has the complete modern source structure.
- It has all expected game assets.
- It keeps the useful board/deck canvas work.
- It does not appear to include the later risky `fate-canvas-fx-mode` animation/FX conversion.
- It does not show the encoded `âœ•` text issue found in the mixed rollback folder.

## Do Not Guess Which Version Is Current

There are multiple folders and multiple `.exe` files on the Desktop. Do not assume the newest-looking executable is the newest source.

Before editing, confirm the working directory is:

`C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0 - Copy (3)`

Avoid editing:

- `C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0`
- `C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0 - Copy`
- `C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0 - Copy (2)`

unless Howard explicitly requests work in those folders.

## Save Changes Consistently

All source edits should be made inside this folder. Important paths:

- Source HTML: `index.html`
- Main scripts: `src\scripts\`
- Main styles: `src\styles\`
- Electron shell: `electron\main.js`
- Desktop build output: `dist\`

When packaging, build from this folder only. The expected commands are:

```powershell
cd "C:\Users\liang\OneDrive\Desktop\Fates Entwined v1.0 - Copy (3)"
npm.cmd run dist
```

The generated installer should be:

`dist\Fates-Entwined-Setup-1.0.0.exe`

The unpacked desktop app should be:

`dist\win-unpacked\Fates Entwined.exe`

## macOS Unsigned Build Note

macOS builds are currently unsigned. After downloading a macOS `.dmg` or `.zip` artifact, remove quarantine before opening the app:

```bash
xattr -dr com.apple.quarantine "/Applications/Fates Entwined.app"
```

## Backup Rule

Before broad rendering, multiplayer, deck-builder, animation, or packaging changes, create a full source backup, not a selective backup.

Recommended backup location:

`project-backups\YYYYMMDD-HHMMSS-description\`

The backup should include at minimum:

- `index.html`
- `fate-and-zones_1.html`
- `fate-and-zones_1_.html`
- `package.json`
- `electron\`
- `src\`
- key asset directories if they are being changed

Selective backups are not enough for large rendering work.

## Current Baseline Guidance

Use this copy as the stable baseline, then make changes one at a time. For performance work, measure before and after each change. Avoid broad canvas/DOM conversions without a restore point and a clear test.
