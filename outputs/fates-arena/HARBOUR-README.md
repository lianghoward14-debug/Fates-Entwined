# Frostfall Harbour

Open frostfall-harbour.html. All code and image assets are embedded, so no local server or network is needed. The previous winter-arena.html remains available for comparison.

## This pass

- New painted winter harbour and isolated snowy cover assets.
- New Anička sheet: four stepping poses and eight casting poses. Frame bounds and foot anchors measured from alpha; frames are aligned during rendering. Triangular hands and feet are retained.
- Dedicated eight-frame painted ocean effect, with rising and curling travel frames and foam breakup on contact. Water front visuals combine the three related hit zones rather than drawing three repeated icons.
- Vortex with layered moving water ribbons and foam, impact fragments, ice shards, revised casting and recovery timing.
- Movement acceleration/deceleration; heavy attacks briefly reduce movement and prevent overlapping casts. Heavy impacts pause the simulation briefly. Shift evade grants 0.16 seconds of invulnerability with a three-second cooldown.
- Match countdown, revised menus and cooldown display, viewport sizing, richer synthesized water and impact audio, optional reduced effects.

## Controls

WASD/arrows move; mouse aims; hold left click to repeat skill 1. Skills: 1–4 or Q / Space / E / R. Shift evades. Escape pauses. Bot, hitboxes, sound and reduced effects controls are below the arena. Desktop keyboard and mouse required for movement.

## Verification

harbour-tests.cjs checks countdown, evade, invulnerability, heavy-cast locking, ultimate timing, soak/freeze and mark/charge combos, movement collision and full simulated matches for both characters. harbour-browser.cjs checks entry, movement, quick Shift input, both kits, pause, win/rematch, narrow layout and page errors. Browser screenshots were visually inspected and the initial rectangular props and repeated crescent water shapes were replaced.

## Limits

This remains a local bot prototype, not a shipped commercial game or online multiplayer implementation. Generated frames still vary in drawing and proportions; Howard retains the earlier sheet. The environment is more detailed than the deliberately simple character art. Combat uses circular fighters/projectiles and rectangular cover footprints, not pixel-perfect sprite collision. No claim of human-tested competitive balance or professional hand animation is made.

## Sources

Final editable sources: harbour-engine.js, harbour-render.js, harbour.template.html, frame-bounds.json, extra-bounds.json. Run node build-harbour.cjs to rebuild the self-contained game. The upgrade helper scripts document the transformation from earlier versions but are one-time transformations; do not rerun them over finished sources.

New assets generated with the built-in image generation tool: harbour-map.png, anicka-motion-v3.png, water-motion.png and harbour-cover.png. Character reference: original card 2.png. Prompt text is saved in HARBOUR-ART-PROMPTS.txt.
