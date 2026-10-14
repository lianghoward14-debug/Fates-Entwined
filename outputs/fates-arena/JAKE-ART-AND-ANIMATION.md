# Jake artwork and animation — v2

Generated with the built-in image-generation tool, using original card 38.png for Jake's identity and anicka-motion-v3.png for the game's sprite treatment. Saved asset: jake-motion-v2.png. Alpha-connected frame bounds are saved in jake-frame-bounds.json; run analyze-jake.cjs to measure them again. The renderer uses the original transparent sheet without background removal or repainting.

Final generation prompt:
Use case: stylized-concept. Production game sprite animation sheet, transparent alpha background. Image 1 is Jake identity reference, preserve that character faithfully. Image 2 is Anicka animation sheet, match its hand-drawn line quality, flat colors, game proportions and sprite finish, NOT her identity. Create Jake full body with broad heavy belly, brown short sleeve button shirt, long center parted olive brown hair down to shoulders, black rectangular glasses with large white eyes, relaxed crooked smile, pale beige skin, dark trousers. Hands and feet MUST be pointed triangles like reference, no fingers or realistic shoes. No new costume. Exactly 4 columns by 4 rows, sixteen equally sized cells, consistent character scale and full body with padding in EVERY cell, no grid lines no text no ground shadows no scenery. Facing three-quarter RIGHT. Row 1: four sequential walking cycle frames, left step, passing, right step, passing. Row 2: melee windup with pointed arm pulled back; melee forward strike with pointed arm thrust; crouched belly slam takeoff; airborne belly forward arms wide feet tucked. Row 3: belly slam low landing compressed pose; taco raised towards mouth; taco held at mouth eating; charge crouched windup leaning forward. Row 4: charge running left stride leaning forward; charge running right stride; burger summon arms raised overhead (no burger shown); burger slam arms forcefully thrust down forward. Jake must remain identical and recognizably same as reference in all sixteen frames. Natural substantial pose changes across action frames, continuous animation-ready coherent design. Flat hand-drawn cartoon art with organic dark outlines, no glossy 3D or shaded anime, no circles as substitute glasses. Transparent background.

Animation integration:
- Four-frame walking loop and subtle idle breathing.
- Melee anticipation, strike, recovery; damage resolves after 0.1 seconds on the strike pose, with interruption checks.
- Belly Slam crouch for the first 18% of the leap, then travel and an arcing airborne pose, followed by a 0.28-second compressed landing.
- Consume raises the taco, bites, and lowers it over 0.85 seconds.
- Charge has a dedicated 0.55-second anticipation pose and alternating running frames; cadence increases with charge age.
- Burger summon/hold/downstroke with easing on its growth and fall, impact squash, and a 0.3-second recovery.
- Reduced-motion mode retains readable action frames while disabling extra squash, lean and bounce.

Verification: jake-test.cjs (combat and delayed hit timing), jake-animation-test.cjs (all sixteen poses and canvas rendering), jake-browser-test.cjs (selection, abilities, HUD, layout). Visual review: jake-preview.png and jake-animation-review.png. This is the same limited-pose sprite-animation approach used by Anicka, not a fully hand-animated directional character rig.
