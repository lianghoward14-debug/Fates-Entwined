#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const rendering = read('src/scripts/06-rendering-and-helpers.js');
const layout = read('src/scripts/render-v2/02-match-layout-engine.js');
const index = read('index.html');

assert.match(
  rendering,
  /const OPPONENT_HAND_PANEL_CARD_LIMIT = 12;[\s\S]*visibleOppHand = oppHand\.slice\(0, OPPONENT_HAND_PANEL_CARD_LIMIT\)[\s\S]*visibleOppHand\.forEach[\s\S]*visibleOppHand\.some/,
  'the DOM opponent-hand panel must render and retain no more than twelve cards'
);
assert.match(
  rendering,
  /ownsOpponentHand\(\)[\s\S]{0,500}applyOpponentHandDensity\(container, Math\.min\(oppHand\.length, OPPONENT_HAND_PANEL_CARD_LIMIT\)\)/,
  'the canvas-owned opponent-hand proxy must use the capped visual count'
);
assert.match(
  layout,
  /const OPPONENT_HAND_PANEL_CARD_LIMIT = 12;[\s\S]*opp\.hand\.slice\(0, OPPONENT_HAND_PANEL_CARD_LIMIT\)/,
  'the canvas opponent-hand layout must receive no more than twelve cards'
);
assert.match(
  rendering,
  /updateOpponentHandLabelDensity\(lbl, oppHand\.length\)/,
  'the true opponent hand size must remain available to non-card panel state'
);
assert.match(index, /06-rendering-and-helpers\.js\?v=1785165501/, 'the DOM renderer must be cache-busted');
assert.match(index, /render-v2\/02-match-layout-engine\.js\?v=1785072427/, 'the canvas layout must be cache-busted');

const sandbox = {
  window:{innerWidth:1600, innerHeight:900, devicePixelRatio:1, performance:{now:()=>0}},
  document:{querySelector:()=>null, getElementById:()=>null, documentElement:{}},
  performance:{now:()=>0},
  getComputedStyle:()=>({fontSize:'16px'})
};
vm.runInNewContext(layout, sandbox);
const thirteenCards = Array.from({length:13}, (_, index)=>({
  index,
  iid:'opponent-card-' + index,
  revealed:false,
  hidden:true
}));
const snapshot = {
  viewer:0,
  signature:'thirteen-opponent-cards',
  board:[{z:0, rows:[]}],
  players:[
    {hand:[], handCount:0},
    {hand:thirteenCards, handCount:13}
  ]
};
const built = sandbox.window.FateMatchLayoutEngine.build(
  snapshot,
  {x:0, y:0, w:1280, h:720, windowW:1600, windowH:900, dpr:1, renderScale:1},
  {productionCss:false}
);
assert.strictEqual(snapshot.players[1].hand.length, 13, 'the authoritative snapshot must retain all thirteen cards');
assert.strictEqual(built.opponentHand.cards.length, 12, 'the rendered opponent-hand panel must expose only twelve card slots');
assert.deepStrictEqual(
  Array.from(built.opponentHand.cards, card=>card.iid),
  thirteenCards.slice(0, 12).map(card=>card.iid),
  'the panel cap must preserve the first twelve hand positions'
);

console.log('Opponent hand panel 12-card cap smoke test passed.');
