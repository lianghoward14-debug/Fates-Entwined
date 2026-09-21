import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const data=fs.readFileSync('src/scripts/01-data-and-state.js','utf8');
function fn(name){const re=new RegExp('(?:async )?function '+name+'\\(');const start=core.search(re);assert(start>=0,name);return core.slice(start,core.indexOf('\n}',start)+2);}
const noop=()=>{};
const ctx={window:{},G:{currentPlayer:0,turn:1,board:[Array.from({length:3},()=>Array(4).fill(null))],fateModifiers:{}},toast:noop,log:noop,renderEffectResolutionForPlayer:noop,setTimeout:noop,getCardRuntimeEffectId:c=>c.id,recordWojciechPlacementForTurn:noop,controlledEventideCardsForLiHua:()=>[],automaticBoardEffectsEnabled:()=>true};
ctx.pressureCardReworkTimingActive=()=>false; ctx.recalcCoordinatorEffects=noop; ctx.renderGame=noop;
vm.createContext(ctx);
const structural=fs.readFileSync('src/scripts/00-structural-helpers.js','utf8');
for(const name of ['ensureExtraRowOwnerState','getNextExtraRowIndex','addFullExtraSafeRowForPlayer','isFullExtraSafeRow','getExtraSafeRowOwner','isPlayableSafeSquare']){
 const start=structural.indexOf('function '+name+'(');
 vm.runInContext(structural.slice(start,structural.indexOf('\n}',start)+2),ctx);
}
vm.runInContext(data.slice(data.indexOf('window.FATE_PLAYER_TIMED_MANUAL_EFFECT_CARD_IDS'),data.indexOf('const CARDS')),ctx);
vm.runInContext("const MANUAL_EFFECT_BLOCKED_CARD_IDS=new Set(); const AUTHORITATIVE_ACTIVATE_EFFECT_IDS=new Set(['bh01']);"+[fn('markCardSetTurn'),fn('hasAnickaVoyagerMovedThisTurn'),fn('canUseManualCharacterEffect'),fn('shouldShowManualCharacterEffectButton'),fn('activateLiHuaStormOfTenThousandBlades'),fn('_executeWhenSetSwitch')].join('\n'),ctx);
for(const initial of [undefined,null,2]){
 const card={id:'bh16',owner:0,usesLeft:initial};
 assert.equal(ctx.shouldShowManualCharacterEffectButton(card),true);
 ctx.markCardSetTurn(card,0); assert.equal(card.usesLeft,2);
 for(let remaining=1;remaining>=0;remaining--){assert.equal(await ctx.activateLiHuaStormOfTenThousandBlades(card,0,0),true);assert.equal(card.usesLeft,remaining);}
 assert.equal(ctx.shouldShowManualCharacterEffectButton(card),false);
 assert.equal(await ctx.activateLiHuaStormOfTenThousandBlades(card,0,0),false);
}
const voyager={id:'bh01',owner:0};
assert.equal(ctx.window.fateEffectRequiresManualActivationId(voyager),true);
assert.equal(ctx.shouldShowManualCharacterEffectButton(voyager),true);
voyager.bh01MovedThisTurn=true;
assert.equal(ctx.shouldShowManualCharacterEffectButton(voyager),false);
// Exercise the actual Initiator switch route, which previously had no Anicka case.
const character=core.slice(core.indexOf('async function triggerCharacterEffect('));
const start=character.indexOf("    case '02':");assert(start>=0);
const end=character.indexOf("    case '103':",start);
for(const owner of [0,1]){
 const card={id:'02',iid:'anicka-'+owner,owner};
 ctx.G={currentPlayer:owner,board:[Array.from({length:3},()=>Array(4).fill(null))]};
 ctx.G.board[0][owner===0?2:0][0]=card;
 Object.assign(ctx,{card,z:0,r:owner===0?2:0,c:0,cp:owner,opp:1-owner,id:'02',forEachBoardCard:cb=>ctx.G.board.forEach(zone=>zone.forEach(row=>row.forEach(c=>c&&cb(c))))});
 await vm.runInContext('(async()=>{switch(id){'+character.slice(start,end)+'}})()',ctx);
 assert.equal(ctx.G.board[0][3].length,4);
 assert.equal(ctx.isPlayableSafeSquare(0,3,3,owner),true);
 assert.equal(ctx.G.board[0][3][3],null,'fourth square is a real empty slot');
 assert.equal(ctx.G.extraRowOwners[0][0],owner);
 assert.equal(ctx.G.anickaSafeRows[0].sourceIid,card.iid);
}
console.log('Anicka safe row for both seats, Voyager manual activation, Li Hua two uses: passed');
import {createInitialState,reduceCommand} from '../shared/engine/index.mjs';
import {command} from './authoritative-v3/test-helpers.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const definitions=require('./fate-card-catalog.js').getCardCatalog().cards;
for(const owner of [0,1]){
 let state=createInitialState({matchId:'manual-'+owner,seed:'manual',handSize:0,activePlayer:owner,cardDefinitions:definitions,players:[{id:'p0',deckIds:['bh01','bh16','32','32']},{id:'p1',deckIds:['bh01','bh16','32','32']}]});
 const put=(id,c)=>{const deck=state.players[owner].deck;const card=deck.splice(deck.findIndex(c=>c.id===id),1)[0];card.controller=owner;state.board[0][owner===0?2:0][c]=card;return card;};
 const voyager=put('bh01',0),lihua=put('bh16',1);
 let result=reduceCommand(state,command(state,'p'+owner,1,'MOVE_CARD',{cardIid:voyager.iid,destination:{z:1,r:1,c:0}}),{playerId:'p'+owner});
 assert.equal(result.ok,true,JSON.stringify(result.error));state=result.state;
 assert.equal(state.board[1][1][0].iid,voyager.iid);
 assert.equal(state.players[owner].hand.length,1,'Voyager draws once');
 result=reduceCommand(state,command(state,'p'+owner,2,'MOVE_CARD',{cardIid:voyager.iid,destination:{z:2,r:1,c:0}}),{playerId:'p'+owner});
 assert.equal(result.ok,false,'Voyager cannot move twice');
 for(let n=3;n<=5;n++){
  result=reduceCommand(state,command(state,'p'+owner,n,'ACTIVATE_EFFECT',{sourceIid:lihua.iid,userActivated:true}),{playerId:'p'+owner});
  assert.equal(result.ok,n<5,JSON.stringify(result.error));if(result.ok)state=result.state;
 }
}
console.log('Multiplayer: Voyager move/draw limit and Li Hua two manual uses pass for both seats');
const renderer=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
function renderFn(name){const start=renderer.indexOf('  function '+name+'(');assert(start>=0);return renderer.slice(start,renderer.indexOf('\n  }',start)+4);}
Object.assign(ctx,{getBoardCell:(z,r,c)=>ctx.G.board[z]?.[r]?.[c],isCellBlockedForTarget:(z,r,c)=>c===2});
vm.runInContext([renderFn('squareMatchesOption'),renderFn('isOpenSquareTarget'),renderFn('selectionOptionForCell'),renderFn('isSelectionTargetCell'),renderFn('getSelectionTargetKind')].join('\n'),ctx);
ctx.G={board:[[[null,null,null]]],_bh01Moving:{options:[{z:0,r:0,c:0},{z:0,r:0,c:2}]}};
assert.equal(ctx.getSelectionTargetKind({z:0,r:0,c:0}),'brave-horizons-move');
assert.equal(ctx.getSelectionTargetKind({z:0,r:0,c:1}),'','unlisted square is not highlighted');
assert.equal(ctx.getSelectionTargetKind({z:0,r:0,c:2}),'','blocked square is not highlighted');
ctx.G.board[0][0][0]={id:'32'};
assert.equal(ctx.getSelectionTargetKind({z:0,r:0,c:0}),'','occupied square is not highlighted');
console.log('Voyager renderer highlights only legal, empty, unblocked destinations');
vm.runInContext(fn('triggerCharacterEffect'),ctx);
for(const id of ['bh01','bh16'])for(const opts of [{fromSet:true},{autoActivation:true}]){
 assert.equal(await ctx.triggerCharacterEffect({id},0,0,0,opts),false,'player-timed ability cannot auto-fire');
}
console.log('Placement and automatic scheduler cannot trigger Voyager or Li Hua');
