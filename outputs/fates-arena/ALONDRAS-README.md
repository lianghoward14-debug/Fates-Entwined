# Alondras — melee assassin

Open `tidebound.html` and choose Alondras. WASD moves; hold left click for short spear attacks.

- Q / 1: Spear Charge. Three cursor-guided bursts, 24 base damage per burst. Crowd-control immune, but still takes damage. 10s cooldown.
- Space / 2: Unseen Strikes. Aim the 235 × 46 rectangle and click to lunge 180 units. 32 base damage, 1s stun, and cooldown reset on a valid enemy hit. Misses have a 7s cooldown. Right click cancels aiming without cost. Walls stop the lunge.
- E / 3: Blitzig Speed. For 6s, Shift dashes toward the cursor with a 0.5s cooldown. 16s ability cooldown.
- R / 4: Queen of Pacifica. Click an enemy within 330 units. Twelve spear strikes over 3s, 8 base damage each; untargetable during the flurry. Invalid clicks keep targeting active. Right click cancels. 24s cooldown.

All damage is reduced by armor. Balance numbers are prototype defaults.

Art: `alondras-motion-v2.png`, generated with the built-in image tool from original card `14.png`. The revised prompt preserves flat hand-drawn styling and triangular hands and legs. The first, rejected interpretation is not used by the game.

Build: `node build-tidebound.cjs`. Mechanics checks: `node alondras-test.cjs`. Browser checks: `node alondras-browser-test.cjs` (Playwright and Chrome required). Existing Tidebound, Jake, and Howard mechanics checks also pass.
