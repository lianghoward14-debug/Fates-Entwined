# Fates Arena — local prototype

Open arena.html directly in Chrome, Edge, or the app browser. All images and code are embedded; no server or internet connection is required. Select Anička or Howard and enter a match against the other character controlled by a bot.

Move with WASD or arrows, aim with the mouse, use abilities with 1–4 or Q / Space / E / R. Hold left mouse to repeat ability 1. Escape pauses. Debug controls toggle the bot and show circular collision hitboxes.

Features: health, armor damage reduction, temporary shields, four abilities per character, cooldowns, projectiles, dash contact damage, obstacle collision, victory/defeat, rematches. Armor mitigation is armor/(100+armor). Shield absorption follows armor mitigation. Shields expire after four seconds. Character animations retain triangular hands and feet.

Scope: local desktop keyboard/mouse bot play only. There is no online connection, lobby, matchmaking, prediction, or authoritative server. The engine is separated from rendering to make future networking work easier, but networking still needs implementation. Bot navigation and balance are basic. Movement art uses a small pose set rather than finished directional walk cycles. Audio and mobile movement controls are not implemented.

Sources: engine.js contains simulation; index.template.html contains UI and rendering; build.cjs embeds artwork into arena.html. Run node build.cjs after edits. test.cjs checks combat mechanics and completed simulated matches. browser-test.cjs checks interactive entry, movement, cooldowns, pause, selection, victory, rematch.

Howard sprite source: built-in image generation, referencing original card 3.png. Prompt: Create Howard game sprite sheet from attached card art. STRICT reference drawing style: rough black outlines, flat solid colours, oversized oval white eyes, black messy hair, black suit white shirt black tie, simple cartoon. ALL HANDS are sharp skin colored TRIANGLES with no fingers/thumbs/palms. FEET simple black TRIANGLES no shoes or soles. No shading no glossy chibi no anime embellishment. Exact regular grid 4 columns x 2 rows eight cells transparent background, full body centered consistent size baseline and generous padding in each cell. No card, text, border, props, penguin. Row1 four idle/walk poses: neutral, left stride, neutral, right stride. Row2 four casting poses: pull pointed arm back, extend pointed arm, both arms extended, recovery. Front three-quarter facing right. Keep identity faithful to original amateur cartoon art.

Anička uses the previously approved tidal-sprites-v2.png sheet. All arena ability kits are prototype adaptations, not changes to the original card game.
