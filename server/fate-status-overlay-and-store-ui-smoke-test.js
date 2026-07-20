'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const renderer = read('src/scripts/06-rendering-and-helpers.js');
const snapshot = read('src/scripts/render-v2/01-render-snapshot.js');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const boardCanvas = read('src/scripts/23-board-canvas-renderer.js');
const css = read('src/styles/zz-codex-last.css');
const matchCss = read('src/styles/match-scene-v2.css');
const handBridge = read('src/scripts/render-v2/09-hand-drag-bridge.js');
const store = read('src/scripts/09-challenger-mode.js');
const index = read('index.html');

assert.match(renderer, /CARD_STATUS_VISUAL_PRIORITY = Object\.freeze\(\[\s*'effect_flash',\s*'snowball',\s*'negated',\s*'suppressed',\s*'blocked',\s*'marked',\s*'immune'\s*\]\)/, 'board statuses must use the fixed one-icon priority');
assert.match(renderer, /return \{ primary, immune:primary === 'immune'/, 'immune must be selected only when it is the primary status');
assert.doesNotMatch(renderer + adapter + boardCanvas + css, /drawProtectionMiniStatus|drawMiniProtectionGlyph|bc-protection-status-glyph|fate-has-primary-status/, 'no renderer may add a second protection icon');

assert.match(snapshot, /const onBoard = !!boardPos;/, 'snapshot must distinguish board cards from hand cards');
assert.match(snapshot, /markedForDeath:!!\(onBoard && card\._markedForDeath\)/, 'Mark for Death must not leak into hand snapshots');
assert.match(snapshot, /const negated = !!\(onBoard &&[\s\S]*const snowballHit = !!\(onBoard &&[\s\S]*const effectFlash = onBoard &&/, 'transient board statuses must be board-gated');
assert.match(adapter, /showStatus:false/, 'canvas hand cards must explicitly disable status overlays');

assert.match(renderer, /buildHandEffectMarkerHTML\(card\)/, 'legacy hands must retain the informational modifier badge');
assert.match(adapter, /function drawHandEffectIcon\([\s\S]*fillText\('i'/, 'canvas hands must retain the informational modifier badge');
assert.match(css, /\.hand-effect-marker\{[\s\S]*top:7px!important;[\s\S]*width:21px!important;[\s\S]*height:21px!important;/, 'legacy hand info badge must be raised and enlarged');
assert.match(css, /\.hand-effect-marker-icon\{[\s\S]*font-size:13px!important;/, 'legacy hand info badge letter must scale with the larger badge');
assert.match(adapter, /const size = Math\.max\(17, Math\.min\(22, cardRect\.w \* \.21\)\);[\s\S]*cardRect\.y \+ Math\.max\(4, cardRect\.w \* \.055\) \+ 2/, 'canvas hand info badge must be raised and enlarged');

assert.match(renderer, /TOPBAR_STATUS_TARGET_VISIBLE = 4[\s\S]*TOPBAR_STATUS_FLEX_MIN_WIDTH = 92[\s\S]*function getTopbarStatusAvailableWidth[\s\S]*viewportRoom[\s\S]*fitTopbarStatusTail\(list, container, visibleCount, availableWidth, true\)[\s\S]*if\(flexibleShown\) break;[\s\S]*visibleCount--/, 'status banners must target four visible effects, use viewport-aware room, and allow the last fitted banner to ellipsize before overflowing');
assert.match(renderer, /classList\.contains\('effect-pill-overflow'\)[\s\S]*hideEffectTooltipPortal\(\)[\s\S]*onmouseenter = function\(\)[\s\S]*showStatusEffectOverflowDropdown[\s\S]*onmouseleave = scheduleStatusEffectOverflowClose[\s\S]*onclick = null/, 'status overflow must open from hover or focus and suppress the duplicate generic tooltip');
assert.match(renderer, /status-overflow-banner effect-pill[\s\S]*effect-pill-icon status-overflow-dropdown-icon[\s\S]*status-overflow-title[\s\S]*effectName[\s\S]*status-overflow-duration[\s\S]*turnsLeft[\s\S]*status-overflow-dropdown-effect[\s\S]*effect/, 'status overflow rows must be compact entries with icon, ability, duration, and active effect text');
assert.doesNotMatch(renderer, /status-overflow-card-name/, 'status overflow rows must not spend space on the source character name');
assert.match(renderer, /function trimStatusOverflowActiveLead[\s\S]*is\\\\s\+active[\s\S]*const effect = trimStatusOverflowActiveLead\(formattedEffect, effectName\)/, 'overflow effect copy must omit the redundant ability-name-is-active lead-in');
assert.match(renderer, /A Noble Effort at a Ballad is active: your consolidations gain 3 Fate until you set a Supporter[\s\S]*printedEffect: card \? card\.effect/, 'Kvetka Ballad must retain its complete internal active-effect description before dropdown presentation cleanup');
assert.doesNotMatch(renderer, /if\(card\.id === '15'\)[\s\S]{0,500}value = 'Bonus Active'/, 'Zsofia card 15 must not have a match tracker');
assert.match(css, /#tp-status-left[\s\S]{0,180}\{\s*top:8px!important;[\s\S]*#tp-status-right[\s\S]{0,180}\{\s*top:8px!important;/, 'both status rails must sit at the final eight-pixel offset');
assert.match(css, /#tp-status-left \.effect-pill,[\s\S]*#tp-status-right \.effect-pill\{[\s\S]*max-width:none!important;[\s\S]*#tp-status-left \.effect-pill-label,[\s\S]*#tp-status-right \.effect-pill-label\{[\s\S]*overflow:visible!important;[\s\S]*text-overflow:clip!important;/, 'visible status banners must show complete effect names');
assert.match(css, /effect-pill-flex-tail[\s\S]*min-width:92px!important[\s\S]*text-overflow:ellipsis!important/, 'the final fitted status banner may shrink further to use leftover row space without forcing early overflow');
assert.match(css, /\.effect-pill \.effect-pill-icon\{[\s\S]*overflow:hidden!important;[\s\S]*\.effect-pill \.effect-pill-icon svg,[\s\S]*width:22px!important;[\s\S]*height:22px!important;[\s\S]*overflow:hidden!important;/, 'status SVG artwork must fit safely inside its circular icon frame');
assert.match(css, /\.effect-pill \.effect-pill-icon img,[\s\S]*object-fit:contain!important;[\s\S]*border-radius:50%!important;/, 'status image artwork must fit safely inside its circular icon frame');
assert.match(renderer, /const width = Math\.min\(430, Math\.max\(300, window\.innerWidth - 24\)\)/, 'overflow dropdown must use the slimmer hover-tray width');
assert.match(css, /\.status-overflow-dropdown-list\{[\s\S]*display:flex!important;[\s\S]*flex-direction:column!important;[\s\S]*\.status-overflow-banner\.effect-pill\{[\s\S]*grid-template-areas:[\s\S]*"icon title duration"[\s\S]*"icon effect effect"/, 'overflow dropdown must stack compact icon/ability/effect entries');
assert.match(css, /\.status-overflow-dropdown-effect\{[\s\S]*display:block!important;[\s\S]*overflow:visible!important;[\s\S]*\.status-overflow-dropdown-printed\{[\s\S]*display:none!important;/, 'overflow dropdown must show the full active effect text and hide extra printed copy');
assert.match(css, /\.status-overflow-banner\.effect-pill\{[\s\S]*grid-template-columns:36px minmax\(0,1fr\) auto!important;[\s\S]*\.status-overflow-banner \.status-overflow-dropdown-icon\{[\s\S]*width:34px!important;[\s\S]*transform:translate\(1px,6px\)!important;[\s\S]*border:1px solid rgba\(126,183,255,\.62\)!important;[\s\S]*\.status-overflow-dropdown-icon svg,[\s\S]*width:25px!important;[\s\S]*\.status-overflow-title\{[\s\S]*padding-left:\.34rem!important;/, 'overflow entries must use larger circular icons, sit one pixel right, and align ability titles exactly with their effect copy');
assert.match(handBridge, /handOrganizerControlIcon[\s\S]*fate-hand-organizer-control-icon[\s\S]*aria-label="Move left"[\s\S]*aria-label="Move right"[\s\S]*aria-label="Close"/, 'organizer controls must use centered vector icons');
assert.match(matchCss, /\.fate-hand-organizer-close,[\s\S]*display: grid;[\s\S]*place-items: center;[\s\S]*\.fate-hand-organizer-control-icon/, 'organizer buttons must center every vector control');

assert.match(renderer, /zoe_block:[\s\S]*M12 25V14h11[\s\S]*M17 32c5-7[\s\S]*circle cx="32" cy="32" r="4"/, 'INTJ Stare must use the clean eye-in-corners icon');
assert.doesNotMatch(renderer, /zoe_block:[\s\S]{0,600}M24 12v8/, 'INTJ Stare icon must not include the old stray outer ticks');
assert.match(renderer, /wci_bonus:[\s\S]*circle cx="32" cy="32" r="14"[\s\S]*M32 8v10/, "The Company's Finest must use the ship wheel icon");
assert.match(renderer, /maja_unlimited:[\s\S]*M10 46l14-14-14-14M24 46l14-14-14-14M38 46l14-14-14-14/, 'Oblique Order must use the cleaned F chevrons');
assert.doesNotMatch(renderer, /maja_unlimited:[\s\S]{0,500}M15 52h39/, 'Oblique Order must not include the removed bottom arrow');
assert.match(renderer, /selva:[\s\S]*M15 40a17 17 0 0 1 34 0[\s\S]*M16 35l-7-5M48 35l7-5/, 'A New Pacifica must use the adjusted rising sun icon');
assert.match(renderer, /blame_game:[\s\S]*blame-game-icon[\s\S]*circle cx="32" cy="32" r="22"[\s\S]*M21 46c1-10/, 'The Blame Game must use the selected K target icon');
assert.match(renderer, /busser_boot:[\s\S]*busser-boot-icon[\s\S]*M11 40h42[\s\S]*M42 14h12[\s\S]*getStatusEffectIcon\('busser_boot'\)/, 'Corner! Behind! must use the selected cloche-and-arrow icon');

assert.match(css, /#s-challenger \.ch-store-v3\{\s*zoom:1\.1!important;/, 'desktop store content must render at the requested 110% scale');
assert.match(store, /<em>Unlock two profile pictures for your account, sourced from every card art in the game<\/em>/, 'profile booster copy must match the requested text');
assert.match(index, /zz-codex-last\.css\?v=1784661006/, 'store, overlay, isolated preset picker, and lowered compact opponent hand stylesheet must be cache-busted');
assert.match(index, /match-scene-v2\.css\?v=1784654001/, 'hand organizer stylesheet must be cache-busted');
assert.match(index, /06-rendering-and-helpers\.js\?v=1784676001/, 'legacy renderer must be cache-busted');
assert.match(index, /render-v2\/04-match-renderer-adapter\.js\?v=1784667001/, 'canvas renderer must be cache-busted');
assert.match(index, /render-v2\/09-hand-drag-bridge\.js\?v=1784654001/, 'hand organizer bridge must be cache-busted');

console.log('Status overlay and store UI smoke test passed.');
