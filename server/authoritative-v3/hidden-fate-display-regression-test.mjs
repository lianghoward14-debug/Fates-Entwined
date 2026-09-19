import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState, effectiveFate, zoneScore} from '../../shared/engine/index.mjs';
import {projectStateForPlayer, projectStateForSpectator} from '../../shared/engine/projections.mjs';
import {takeFromHandToBoard} from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
function fn(name){
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const state = createInitialState({matchId:'hidden-fate-display', seed:'hidden-fate-display', handSize:99, activePlayer:0,
  cardDefinitions:require('../fate-card-catalog.js').getCardCatalog().cards,
  players:[{id:'p0', deckIds:['19']}, {id:'p1', deckIds:['32']}]});
const card = takeFromHandToBoard(state, 0, '19', {z:0,r:2,c:0});
card.faceDown = true;
card.contributesFate = true;
card.contributesAuras = true;
card.currentFate = 40;
state.statuses.push({type:'ZONE_FATE_MODIFIER', zone:0, playerIndex:0, value:-7,
  sourceIid:card.iid, sourceController:0, hiddenSource:true});

for(const project of [s=>projectStateForPlayer(s,0), s=>projectStateForPlayer(s,1), projectStateForSpectator]){
  const view = project(state);
  const context = {G:{_phase7ZoneScores:view.zoneScores},
    _renderCalcCache:{effectiveFate:new Map(), zoneScores:new Map([['0:0',999]])},
    getEffectiveFate:()=>-1, getZoneScore:()=>-1, getCachedBaseZoneScore:()=>999,
    presentJimmyDynamicFateGain:()=>{}};
  vm.createContext(context);
  vm.runInContext(fn('getCachedEffectiveFate') + '\n' + fn('getCachedZoneScore'), context);
  const projectedCard = view.board[0][2][0];
  assert.equal(context.getCachedEffectiveFate(projectedCard,0), effectiveFate(state,card));
  assert.equal(context.getCachedZoneScore(0,0), zoneScore(state,0,0));
  // A newer snapshot can change only authoritative values on a concealed card.
  projectedCard._authoritativeFate = 17;
  context.G._phase7ZoneScores[0][0] = 10;
  assert.equal(context.getCachedEffectiveFate(projectedCard,0),17);
  assert.equal(context.getCachedZoneScore(0,0),10);
  projectedCard._authoritativeFate = 0;
  context.G._phase7ZoneScores[0][0] = 0;
  assert.equal(context.getCachedEffectiveFate(projectedCard,0),0);
  assert.equal(context.getCachedZoneScore(0,0),0);
  // Local games still follow the existing scoring path.
  context.G = {};
  context._renderCalcCache = null;
  assert.equal(context.getCachedEffectiveFate(projectedCard,0),-1);
  assert.equal(context.getCachedZoneScore(0,0),-1);
}
assert.equal(projectStateForPlayer(state,1).board[0][2][0].id,undefined);
assert.equal(projectStateForSpectator(state).board[0][2][0].id,undefined);
console.log('Hidden Fate display: both players, spectators, snapshot refresh, zero totals, and local fallback passed.');
