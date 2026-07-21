'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const data = read('src/scripts/01-data-and-state.js');
const store = read('src/scripts/09-challenger-mode.js');
const storeV2 = read('src/scripts/09-challenger-v2.js');
const css = read('src/styles/zz-codex-last.css');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');

assert.match(rendering, /bc\.id==='93'[\s\S]{0,260}snowBtn\.textContent='Snowball Fight'/,
  'Wodny Potok Youth board action must be labelled Snowball Fight');
assert.match(data, /For the next five turns, your opponent cannot change the current landscape\. You can only activate this effect twice a game'/,
  'Wodny Potok Villager rules text must match the printed card');
assert.match(data, /any Supporter you set in this zone has their effect negated or suppressed, but gains 1 Reinforcement'/,
  'Wodny Potok Lumberjack rules text must match the printed card');
assert.match(data, /you can select any card your opponent controls in this Zone and reduce its Fate by 1, Once a turn'/,
  'Wodny Potok Youth rules text must match the printed card');
assert.match(data, /That card will be added to your hand in four turns'/,
  'Wodny Potok Mailman rules text must match the printed card');

assert.match(core, /function resolveSetCardAfterPlacement[\s\S]*applyWodnyPotokLumberjackSuppression\(inst, z, inst\.owner\)[\s\S]*if\(G\.aiEnabled/,
  'Lumberjack suppression must stamp before AI, deferred, and online placement gates');
assert.match(core, /function applyWodnyPotokLumberjackSuppression[\s\S]*inst\.type !== 'Supporter'[\s\S]*G\.board\[z\]/,
  'Lumberjack must use printed Supporter identity and only inspect the placement zone');
assert.match(core, /function isSupporterEffectSuppressed\(card\)[\s\S]*card\._lumberjackSuppressed[\s\S]*isCardSupporterForRules/,
  'Lumberjack suppression must remain visible during Blame Game');

assert.match(core, /const cellIsPrintedSupporter = !!\(cell && cell\.type === 'Supporter'\)[\s\S]*: \(cell && cellIsPrintedSupporter\)/,
  'only printed Supporters must remain normal reinforcement sources during Blame Game');
assert.match(core, /function tickWintertideForCurrentPlayer\(\)[\s\S]{0,900}playFateChangeSound\(card, before, card\.currentFate, G\.currentPlayer\)/,
  'Wintertide must use the live current player instead of an out-of-scope variable');
assert.match(ai, /if\(card\.type === 'Supporter'\) mySups\.push/,
  'AI consolidation must retain printed Supporter reinforcement sources without old Boleslaw exceptions');

assert.match(data, /id:'84'[\s\S]{0,300}excluding copies of this card\.'/,
  'Kvetka catalog text must allow Star cards');
assert.doesNotMatch(data, /id:'84'[\s\S]{0,300}Star Cards/,
  'Kvetka catalog text must not retain the obsolete Star exclusion');
assert.doesNotMatch(core, /case '84'[\s\S]{0,900}rarity !== 'star'/,
  'Kvetka player search must include Star cards');
assert.doesNotMatch(ai, /case '84'[\s\S]{0,900}rarity !== 'star'/,
  'Kvetka AI search must include Star cards');

for(const id of ['99', '100']) {
  assert.match(audio, new RegExp("'" + id + "': '../new voices/" + id + "set'"),
    `card ${id} must map to its new voice hook`);
  assert(fs.existsSync(path.join(root, 'new voices', `${id}set.mp3`)),
    `new voices/${id}set.mp3 must exist`);
}

for(const [label, source] of [['primary store', store], ['alternate store', storeV2]]) {
  assert.doesNotMatch(source, /8 cards from the Fates Entwined base set\.|3 cards from the Snow on the Carpathians set\./,
    `${label} must remove the obsolete pack-contents sections`);
  assert.match(source, /ch-store-product-profile[\s\S]{0,260}<img src="booster1\.png"/,
    `${label} profile booster must use booster1.png`);
  assert.match(source, /pack-art profile-pack-art[\s\S]{0,400}<img src="booster1\.png"/,
    `${label} profile pack opening must use booster1.png`);
  assert.match(source, /classList\.toggle\('ch-store-content', tab === 'store'\)/,
    `${label} must expose the no-scroll store state`);
}

assert.match(css, /ch-content\.ch-store-content[\s\S]*overflow:hidden[\s\S]*profile-pack-art[\s\S]*aspect-ratio:1\/1/,
  'store and profile pack art must use the compact no-scroll layout');
assert.match(css, /ch-store-products \.ch-store-product-info[\s\S]*flex:1 1 auto!important[\s\S]*ch-store-products \.booster-price-row[\s\S]*margin-top:auto!important/,
  'all three store Starlight price rows must share the same baseline');
assert.doesNotMatch(css, /ch-store-product \.ch-store-product-art\{[\s\S]{0,160}height:min\(21vh,208px\)/,
  'store booster cards must retain their earlier full-height artwork instead of the compact resize');
assert.match(css, /ch-store-hero::before,[\s\S]*ch-store-hero::after[\s\S]*content:none!important;[\s\S]*display:none!important;/,
  'store heading must remove its duplicate inner frame and underline');
assert.match(rendering, /mail_delivery:[^\n]*<rect x="10" y="18"[^\n]*M12 21l20 16 20-16[^\n]*<\/g><\/svg>/,
  'Mail Delivery must retain the envelope without the stray plus-shaped splotch');
assert.doesNotMatch(rendering, /mail_delivery:[^\n]*M43 10v12M37 16h12/,
  'Mail Delivery must not retain the stray plus glyph');
assert.match(css, /hand-limit-card:hover \.hand-limit-art[\s\S]*outline-offset:-2px[\s\S]*hand-limit-name[\s\S]*margin-top:2px/,
  'hand-limit hover ring must stay inset and its label must move down two pixels');
assert.match(css, /#modal\.card-detail-overlay \.modal\.card-detail-modal \.cd-img,[\s\S]*\.card-info-overlay \.cd-img[\s\S]*left:3px!important/,
  'card information artwork must be nudged right by exactly three pixels');
assert.match(rendering, /String\(card\.id \|\| ''\) === '04'[\s\S]*Number\(card\.cost\)/,
  'Zoe card information must show her printed Initiator cost of 2');
assert.match(rendering, /TOPBAR_STATUS_TARGET_VISIBLE = 4[\s\S]*TOPBAR_STATUS_FLEX_MIN_WIDTH = 92[\s\S]*function getTopbarStatusAvailableWidth[\s\S]*function fitTopbarStatusTail[\s\S]*effect-pill-flex-tail[\s\S]*visibleCount--[\s\S]*isOverflow: true[\s\S]*function showStatusEffectOverflowDropdown/,
  'topbar statuses must target four effects, use viewport-aware space, flex the last visible banner, and collapse into overflow when space runs out');
assert.match(rendering, /myVisibleEffects = compactTopbarStatusEffects\(myEffects, 'left', leftBar\)[\s\S]*oppVisibleEffects = compactTopbarStatusEffects\(oppEffects, 'right', rightBar\)/,
  'both players must use the same measured single-row status overflow behavior');
assert.match(rendering, /status-overflow-banner effect-pill[\s\S]*status-overflow-title[\s\S]*escapeHtml\(effectName\)[\s\S]*status-overflow-duration[\s\S]*escapeHtml\(turnsLeft\)[\s\S]*status-overflow-dropdown-effect[\s\S]*escapeHtml\(effect\)/,
  'overflow rows must retain sleek complete effect entries with ability, duration, active effect text, and their icon');
assert.doesNotMatch(rendering, /status-overflow-card-name/,
  'overflow rows must not spend space on the source character name');
assert.doesNotMatch(rendering, /effect-pill-wrapped-row/,
  'status banners must no longer be resized into a cramped second row');
assert.match(css, /#tp-status-left,[\s\S]*#tp-status-right[\s\S]*flex-wrap:nowrap!important[\s\S]*status-overflow-dropdown[\s\S]*position:fixed!important/,
  'status banners must stay on one row and expose extra effects in a floating dropdown');
assert.match(css, /#tp-status-left[\s\S]{0,180}\{\s*top:8px!important;[\s\S]*#tp-status-right[\s\S]{0,180}\{\s*top:8px!important;/,
  'both status rails must sit at the final eight-pixel offset');
assert.match(css, /fate-blocked-action[\s\S]*circle cx='32' cy='32' r='21'[\s\S]*M24 24L40 40M40 24L24 40/,
  'Zoe blocked-card overlay must use a centered X inside one circular medallion');
assert.match(rendering, /block-icon">[^<]+<\/div><div class="block-label">NO CONSOLIDATE/,
  'the separate legacy Zoe minus overlay must remain intact');
assert.match(adapter, /drawBlockOverlay[\s\S]*moveTo\(cx - iconR \* \.54, cy\)[\s\S]*lineTo\(cx \+ iconR \* \.54, cy\)/,
  'renderer-v2 must retain the separate Zoe minus overlay');
assert.match(adapter, /drawBlockedActionIcon[\s\S]*ctx\.arc\(cx, cy, size \* \.33[\s\S]*px\(24\), py\(24\)[\s\S]*px\(40\), py\(40\)/,
  'renderer-v2 must draw the balanced ring-and-X Zoe medallion');

const art = path.join(root, '84.png');
const thumb = path.join(root, 'optimized/card-thumbs/84.jpg');
assert(fs.existsSync(thumb), 'Kvetka optimized thumbnail must exist');
assert(fs.statSync(thumb).mtimeMs >= fs.statSync(art).mtimeMs,
  'Kvetka optimized thumbnail must be regenerated from the updated art');

console.log('Snow on the Carpathians polish smoke passed.');
