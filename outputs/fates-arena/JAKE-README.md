# Jake — Tidebound

Open `tidebound.html`, select Jake, and enter Frostfall Harbour. Move with WASD, aim with the cursor, hold left click for melee attacks, and use 1–4 (Q / Space / E / R) for abilities.

Jake uses card 38.png as the appearance reference: olive-brown long hair, glasses, broad build, brown collared shirt and triangular hands/feet. His generated 16-pose sprite sheet is jake-motion-v2.png; animation timing and food effects are in jake-render.js; the original card is embedded in character selection.

Prototype balance: 460 HP, 40 base armor, 175 movement speed. Basic attacks deal 24 damage at melee range. Belly Slam travels up to 180 units, hits a 90-unit radius for 36 damage, and knocks up/stuns for 1.4 seconds. Consume heals 85 HP and adds 60 armor for six seconds. Momentum Charge winds up for 0.55 seconds, then follows the cursor for five seconds, accelerating from 240 to 640 speed; it grants damage/control immunity and hits each enemy once for 42 damage, knockback and a 1.8-second stun. Munchie Meal Special lands after 0.65 seconds in front of Jake for 65 damage and a three-second stun. Cooldowns are 8/12/16/22 seconds. Damage uses the existing armor formula.

Build: `node build-tidebound.cjs`. Jake integration is maintained in jake-build.cjs and jake-mechanics.js so rebuilding preserves it. Earlier arena variants are unchanged.

Verification: `node jake-test.cjs` checks melee range, slam, stun, healing, armor expiry, charge duration/steering/acceleration/immunity, knockback, burger direction and existing-character simulations. `node jake-browser-test.cjs` uses Playwright and Chrome to check selection, HUD, rendering all abilities, pause/menu and narrow layout. Balance remains prototype tuning, not competitive playtesting.

