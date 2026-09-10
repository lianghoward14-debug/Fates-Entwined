import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';

const source = fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
function extract(name){
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}', start) + 2;
  assert(start >= 0 && end > start, name);
  return source.slice(start, end);
}
for(const player of [0, 1]){
  const presentations = [];
  const sandbox = {G:{turn:4,currentPlayer:player}, window:{},
    startBh19TurnSongForLegacyMatch(){}, toast(){}, clampCardToLandscapeFateCap(){},
    playFateChangeSound(){}, queueHighTPotencyOverlay(){},
    queuePairedOverlayFateGain(card, options){presentations.push(options); return true;}};
  vm.createContext(sandbox);
  vm.runInContext(['getHighTPotencyCount','activateHighTForTurn','modifyFate','applyPairedOverlayFateGain'].map(extract).join('\n'), sandbox);
  for(let copies = 1; copies <= 2; copies++){
    sandbox.activateHighTForTurn({id:'bh19',iid:`abed-${copies}`}, player);
    const target = {iid:'target',currentFate:5};
    sandbox.applyPairedOverlayFateGain(target, 3, player, {kind:'british_union_jack'});
    assert.equal(target.currentFate, 11, `legacy player ${player}, ${copies} Abed(s)`);
    assert.equal(presentations.at(-1).after, 8, 'British overlay shows base +3 before Abed bonus');
    assert.equal(presentations.at(-1).finalValue, 11);
  }
  assert.equal(sandbox.G._bh19HighTStatuses.length, 1);
}

let sequence = 0;
for(const player of [0, 1]){
  let state = E.createInitialState({matchId:`abed-regiment-${player}`,seed:'abed-regiment',handSize:12,
    activePlayer:player,cardDefinitions:catalog.getCardCatalog().cards,
    players:[0,1].map(p=>({id:`p${p}`,deckIds:p===player?['bh19','bh19','05','05','05','05','05','23']:[]}))});
  const row = player === 0 ? 2 : 0;
  function take(id){const hand=state.players[player].hand;return hand.splice(hand.findIndex(c=>c.id===id),1)[0];}
  function command(type,payload){
    const result=E.reduceCommand(state,{commandId:`command-${++sequence}`,matchId:state.matchId,expectedRevision:state.revision,type,payload},{playerIndex:player});
    assert.equal(result.ok,true,JSON.stringify(result.rejection));state=result.state;
  }
  for(let copies=1;copies<=2;copies++){
    const z=copies-1;
    state.board[z][row][0]=take('05');state.board[z][row][1]=take('05');
    const abed=state.players[player].hand.find(c=>c.id==='bh19');
    command('CONSOLIDATE_CARD',{cardIid:abed.iid,tributeIids:state.board[z][row].filter(Boolean).map(c=>c.iid),destination:{z,r:row,c:0}});
    assert.equal(state.statuses.filter(s=>s.type==='PERMANENT_FATE_GAIN_POTENCY').length,1);
  }
  const target=take('23');state.board[0][row][1]=target;
  const before=target.currentFate;
  const regiment=state.players[player].hand.find(c=>c.id==='05');
  command('SET_CARD',{cardIid:regiment.iid,destination:{z:0,r:row,c:2}});
  command('ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:[target.iid]});
  assert.equal(E.findBoardCard(state,target.iid).card.currentFate,before+6,`authority player ${player}: Regiment doubles after two Abed consolidations`);
}
console.log('Abed + British Regiment regression passed in legacy and authority engines for both players');
const rendering = fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const pulseStart = rendering.indexOf('function isHighTSourceCardActive(');
const pulseCode = rendering.slice(pulseStart, rendering.indexOf('\n}', pulseStart) + 2);
for(const multiplayer of [false,true]){
  const G = {turn:4};
  G[multiplayer ? '_phase7Statuses' : '_bh19HighTStatuses'] = [{
    type:'PERMANENT_FATE_GAIN_POTENCY',sourceIid:'first',playerIndex:0,turn:4,remainingOwnerTurns:1
  }];
  const context = vm.createContext({G});
  vm.runInContext(pulseCode,context);
  for(const iid of ['first','second']) assert(context.isHighTSourceCardActive({id:'bh19',iid,owner:0}));
  assert(!context.isHighTSourceCardActive({id:'bh19',iid:'opponent',owner:1}));
  G[multiplayer ? '_phase7Statuses' : '_bh19HighTStatuses'] = [];
  assert(!context.isHighTSourceCardActive({id:'bh19',iid:'second',owner:0}));
}
console.log('All friendly Abed copies pulse during High-T in both modes');
