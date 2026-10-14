# Campus Clash

Open `tidebound.html` (the existing entry point) or `campus.html`. Both contain the same self-contained game, including sprites and music. The original harbour duel is preserved as `harbour-duel.html`.

## Campus and matches

The 2600 × 1900 campus spans about 5.9 arena viewports. A following camera, minimap, health pickups, building collisions, and bot route finding support exploration. The map interprets Sproul Plaza, Sather Gate, Memorial Glade, West Crescent, Strawberry Creek, and the Campanile for gameplay; it is not a scale campus map.

Choose 2v2 (you and one AI against two AI, first team to 8 defeats) or free-for-all (you against three AI, first to 5). Both have a four-minute limit and four-second respawns. A tied score at the time limit is a draw. Team attacks pass through allies and cannot damage or control them. All five champions are playable.

## Maja Kaminska

Hold left click to fire her gun. WASD moves, Shift evades, Escape pauses.

- Q / 1 — Tank Brigade: board a 240 HP tank. Move at 55% speed and click within 560 units to fire shells every 1.1s. Shells land after 0.65s and deal 48 base damage in a 95-unit radius. Damage goes into the tank, with no spillover to Maja when it breaks. Tank persists until destroyed. 20s cooldown.
- Space / 2 — Firing Squad: a wall of five UN 5th Army soldiers fires three parallel volleys, 11 base damage per projectile. Buildings can obstruct deployment or shots. 9s cooldown.
- E / 3 — Command: summon a destructible 70 HP rifle escort for 8s. It follows, finds enemies, and fires automatically. Press E again while it lives, then click an enemy within 650 units to select its focus target. Recasting works during the summon cooldown. Right click cancels targeting. 14s summon cooldown.
- R / 4 — Brilliant Tactician: click a clear position within 440 units to plant a flag. For 12s, allied champions and soldiers within its 320-unit radius deal 1.5× damage and take 0.9× damage. Overlapping flags do not stack. Right click cancels placement without cost. 26s cooldown starts on placement.

Damage numbers precede armor reduction. The flag also modifies tank damage. Prototype balance values can be adjusted in `campus-mechanics.js`.

## Music and art

Music uses the game's existing `warfront.mp3`, embedded locally. Music and sound effects have separate toggles; music also has a volume slider and pauses with the match, background tab, results, or champion menu.

Maja and the UN 5th Army use `maja-motion.png`, generated with the built-in image tool from original cards `7.png` and `9.png`. Flat card styling and triangular hands and legs were specified. The complete generation prompt is saved in `MAJA-ART-PROMPT.txt`. The campus and tank are drawn in canvas.

Campus references: [official Berkeley campus map](https://www.berkeley.edu/map/), [Sather Gate](https://www.berkeley.edu/map/sather-gate/), [Sproul Plaza](https://www.berkeley.edu/map/sproul-plaza/), [Memorial Glade](https://www.berkeley.edu/map/memorial-glade/), [Campanile](https://www.berkeley.edu/map/campanile-sather-tower/).

## Build and validation

Run `node build-campus.cjs` from this directory. It uses `tidebound-engine.js` as the shared champion base and `harbour-duel.html` for the established render assets, then writes `campus-engine.js`, `campus.html`, and `tidebound.html`. Campus code is kept in `campus-map.js`, `campus-mechanics.js`, `campus-render.js`, `maja-render.js`, `campus-ui.js`, and `campus.template.html`.

`node campus-test.cjs` checks team filtering, tank health/ejection, shell area/range, squad volleys, escort targeting/expiry, flag multipliers/expiry, respawns/scoring, expanded coordinates, navigation, and all five champion simulations. `node campus-browser-test.cjs` checks actual keyboard/click controls, rendered abilities, camera movement, four-player HUD, music playback and controls, responsive layout, and page errors. Browser checks require Playwright and Chrome. Original champion mechanics tests also pass. This is local play with three AI; network multiplayer is not implemented.
