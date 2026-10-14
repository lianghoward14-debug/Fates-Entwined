import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';import vm from 'node:vm';
import {createInitialState,applyOperation,assertInvariants} from '../../shared/engine/index.mjs';
import {cardRule} from '../../shared/engine/cards/registry.mjs';
const require=createRequire(import.meta.url),{cards}=require('../fate-card-catalog.js').getCardCatalog();
for(const seat of [0,1]){
 const ids=['98','84','98','84','01','02','03','04','05','06'];
 const state=createInitialState({matchId:'extras',seed:'extras',handSize:1,players:[{id:'a',deckIds:seat===0?['108']:ids},{id:'b',deckIds:seat===1?['108']:ids}],cardDefinitions:cards});
 const before=JSON.stringify(state.players[1-seat]),ctx={state,events:[],ruleEvents:[]},sourceIid=state.players[seat].hand[0].iid;
 for(const step of cardRule('108',state).program)applyOperation(ctx,{...step.operation,playerIndex:seat,sourceController:seat,sourceIid});
 assert.equal(state.players[seat].hand.length,10);assert.equal(state.players[seat].deck.length,0);
 for(const id of ['98','84'])assert.equal(state.players[seat].hand.filter(c=>c.id===id).length,2);
 assert.equal(JSON.stringify(state.players[1-seat]),before);assertInvariants(state);
}
const drag=fs.readFileSync('src/scripts/render-v2/09-hand-drag-bridge.js','utf8');const sandbox={isFishCounter:c=>c.id==='token-fish'};vm.createContext(sandbox);vm.runInContext(drag.slice(drag.indexOf('  function isDirectSetCard('),drag.indexOf('  function isOnlineCharacterConsolidationDrag(')),sandbox);
assert(sandbox.isDirectSetCard({id:'token-fish',type:'Counter'}));assert(!sandbox.isDirectSetCard({id:'108',type:'Initiator'}));
const code=fs.readFileSync('src/scripts/28-don-julio-dice.js','utf8');let cinematic=true;const timers=[],shown=[];
const rt={window:{flashCardEffect:(...args)=>shown.push(args)},document:{querySelector:()=>cinematic?{}:null},setTimeout:fn=>timers.push(fn),Date:{now:(()=>{let now=0;return()=>now+=250;})()}};vm.runInNewContext(code,rt);
rt.window.queueSebastianFishOverlay({id:'110'},'fish-1',['fish-iid']);await rt.window.flushSebastianFishOverlays({pendingPrompt:{}});assert.equal(shown.length,0);assert(rt.window.isSebastianFishHidden({iid:'fish-iid'}));
const task=rt.window.flushSebastianFishOverlays({});await Promise.resolve();assert.equal(shown.length,0);cinematic=false;timers.shift()();await task;assert.equal(shown.length,1);assert.equal(shown[0][1],'sebastian_fish');assert(!rt.window.isSebastianFishHidden({iid:'fish-iid'}));
console.log('Sofia opening extras both seats; Fish direct drag classification; Sebastian picker and cinematic ordering passed.');
