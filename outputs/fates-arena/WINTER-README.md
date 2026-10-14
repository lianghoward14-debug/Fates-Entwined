# Frostbound Arena

Open winter-arena.html directly in a desktop browser. This self-contained file works offline. The previous prototype remains in arena-v1.html.

## Controls
WASD / arrows move. Mouse aims. Hold left mouse for ability one. 1–4 or Q / Space / E / R cast the four skills. Escape pauses. Sound, reduced effects, bot activity and hitboxes are configurable beneath the arena.

## Kits
Anička: Undertow launches three water blades that soak and briefly slow. Riptide dashes with contact damage, temporary shield and slowing water trail. Maelstrom targets a point up to 430 units away, warns for 0.55 seconds, then pulls, soaks and damages enemies while healing its owner inside. Ocean’s Wrath warns for 0.65 seconds then launches three piercing tidal fronts; soaked enemies freeze briefly.

Howard: Royal Decree marks for 20% increased incoming damage. King’s Gambit charges and consumes a mark for bonus damage. Moffitt Inspiration grants 75 shield and 25 additional armor for four seconds and strengthens Decree projectiles. Crownfall warns three adjacent areas then strikes them in succession, marking and slowing enemies.

## Map and presentation
Snowy ruins with solid cover, snowy pines, ice pond, lanterns, animated snowfall and footprints. The central healing crystal restores 40 health; first spawn is after 9 seconds and subsequent spawn checks are every 14 seconds. Ice is decorative, without movement sliding. Character art preserves triangular hands and feet using the existing generated sheets; animation uses casting sequences, movement bob, leaning, impacts and ability effects. No new hand-drawn directional walk cycles are claimed. Audio is synthesized locally, no remote assets.

## Validation
winter-test.cjs tests cooldowns, soaked status, vortex pull and healing, freeze combo, mark detonation, shield expiration, delayed strikes, cover and pickups, and completed bot simulations for both characters. winter-browser-test.cjs tests selection, keyboard movement, ability visuals, pause, victory/rematch and narrow layout, with JavaScript errors collected. This is a desktop keyboard/mouse prototype; narrow layout does not imply touch controls.

## Development
winter-engine.js: combat simulation and basic hazard-aware bot steering.
winter-render.js: winter map and effects.
upgrade-winter.cjs: builds winter.template.html from the preserved first prototype template.
build-winter.cjs: embeds simulation, renderer and images into winter-arena.html.

Online multiplayer is not implemented. Balance is provisional. Bot steering is local avoidance, not full pathfinding. Status interactions, art and sound still need human playtesting and refinement.
