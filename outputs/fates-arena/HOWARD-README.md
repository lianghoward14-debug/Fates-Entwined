# Howard — Tidebound

Open tidebound.html and select Howard. WASD moves, the cursor aims, left click throws rocks, and 1–4 (Q / Space / E / R) activate abilities.

- Bow and Arrow of the Agile Hunter: 0.3-second bow draw, 32 damage, 50% armor penetration, 180-unit knockback stopped by terrain. 5s cooldown.
- Knife Throw: replaces basic rocks with knives for 10s. Each knife deals 14 damage and independently adds six bleed ticks of 4 damage, one per second. Red wound trails and stack counters show bleeding. 14s cooldown.
- Football Throw: loads three football attacks. Aim at the ground and click or hold to throw; each hit grants +40% movement speed for 2s. Footballs take priority over knives until all three are spent. 9s cooldown.
- Furious Throwing: automatically fires an arrow, knife and football together every 0.28s for 6s, following the cursor. Every projectile applies all effects: double direct damage, 100% armor penetration, 360-unit knockback, six bleed ticks of 8 damage, and +80% speed for 2s on hit. Existing knife duration and football ammunition are preserved while the barrage fires. 22s cooldown. Stun/freeze suppress firing while the timer continues.

Build with node build-tidebound.cjs. Source: howard-build.cjs, howard-mechanics.js and howard-render.js, integrated with the shared Tidebound UI/template. Earlier arena variants remain separate.

Checks: howard-test.cjs, howard-browser-test.cjs, tidebound-tests.cjs and jake-test.cjs. Browser checks need Playwright and Chrome. Visual captures: howard-skill-1.png through howard-skill-4.png. Balance is provisional and needs playtesting.


Visual polish: cached eight-frame projectile sprites, spinning knives, axial football spirals, feathered arrows and tumbling rocks; attached arm poses for bow draw and throwing follow-through. Ultimate travel speed is 1.1x base, with restrained glow and no orbiting weapon clutter.
