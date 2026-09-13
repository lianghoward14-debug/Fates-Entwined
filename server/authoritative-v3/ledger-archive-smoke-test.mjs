import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand, projectStateForPlayer, legalCommandTemplates} from '../../shared/engine/index.mjs';
import {applyOperation} from '../../shared/engine/operations.mjs';
import {runtimeRuleId} from '../../shared/engine/modifiers.mjs';
import {command} from './test-helpers.mjs';

const indexSource = fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const localGameplaySource = fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const onlineGameplaySource = fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js',import.meta.url),'utf8');
const ledgerUiSource = fs.readFileSync(new URL('../../src/scripts/51-ledger-archive.js',import.meta.url),'utf8');
const cardDataSource = fs.readFileSync(new URL('../../src/scripts/01-data-and-state.js',import.meta.url),'utf8');
assert.match(localGameplaySource,/case '75':[\s\S]{0,160}resolveLedgerArchive\(cp, inst\)/,'single-player must use the shared Ledger Archive resolver');
assert.match(onlineGameplaySource,/window\.openLedgerArchive\(/,'multiplayer must use the shared Ledger Archive window');
assert.match(ledgerUiSource,/ledger-archive-v2/,'shared Ledger Archive window must use the current UI');
assert.match(ledgerUiSource,/playFateSfxOnce\('modalConfirm', soundKey, 500\)/,'confirming a Ledger Archive order must play confirmation audio');
assert.match(indexSource,/ledger-archive\.css\?v=20260912-confirm-audio[\s\S]*51-ledger-archive\.js\?v=20260912-confirm-audio/,'Ledger Archive script and style cache versions must remain synchronized');
assert.match(cardDataSource,/id:'75'[\s\S]{0,600}img:'75\.png\?v=20260907-ledger2'/,'Ledger Keepers must use the current card art cache key');
assert.match(indexSource,/01-data-and-state\.js\?v=20260912-carolyn-art/,'the card database cache must use the current card catalog version');

const definitions = ['75','32','60','42','05','31','33','68'].map(id=>({
  id,name:'Card '+id,type:'Supporter',aff:'eventide',fate:1,cost:0,rarity:'circle'
}));
let serial = 0;
function make(count){
  const state = createInitialState({matchId:'LEDGER'+count,seed:'ledger',handSize:0,cardDefinitions:definitions,
    players:[{id:'p0',deckIds:['75',...Array.from({length:count},(_,i)=>definitions[1+i%7].id)]},{id:'p1',deckIds:['32']}]});
  const index = state.players[0].deck.findIndex(card=>card.id === '75');
  const source = state.players[0].deck.splice(index,1)[0];
  state.players[0].hand.push(source);
  // A tempting legacy copy target must have no effect on the new resolution.
  const target = state.players[1].deck.shift();
  state.board[0][0][0] = target;
  return {state,source};
}
function send(state,type,payload,player=0){
  return reduceCommand(state,command(state,'p'+player,++serial,type,payload),{playerId:'p'+player});
}
for(const count of [0,1,3,5,8]){
  let {state,source} = make(count);
  const before = state.players[0].deck.map(card=>card.iid);
  let result = send(state,'SET_CARD',{cardIid:source.iid,destination:{z:0,r:2,c:0}});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));
  if(!count){ assert.equal(result.prompt,null); continue; }
  assert.equal(result.prompt.type,'CARD_SELECTION');
  assert.equal(result.prompt.ordered,true);
  assert.deepEqual(result.prompt.eligibleIids,before.slice(0,5));
  assert.equal(result.prompt.min,Math.min(count,5));
  assert.equal(result.state.players[0].hand.length,0,'old copy target must not draw a card');
  assert.equal(result.events.filter(event=>event.type === 'DECK_TOP_REVEALED').length,1);
  state = JSON.parse(JSON.stringify(result.state)); // reconnect/replay continuation
  const opponent = projectStateForPlayer(state,1);
  assert.equal(opponent.pendingPrompt.revealedCards,undefined,'archive cards stay private to the activator');
  assert.equal(opponent.players[0].deck,undefined,'only the revealed cards may be projected');
  const selectedIids = before.slice(0,5).reverse();
  assert(legalCommandTemplates(state,0).some(candidate=>JSON.stringify(candidate.payload.selectedIids || [candidate.payload.selectedIid]) === JSON.stringify(selectedIids)), 'reverse order must be exposed as legal');
  const payload = {promptId:state.pendingPrompt.promptId,selectedIids};
  assert.equal(send(state,'ANSWER_PROMPT',payload,1).ok,false,'opponent cannot set the order');
  assert.equal(send(state,'ANSWER_PROMPT',{promptId:payload.promptId,cancel:true}).ok,false);
  if(count > 1){
    assert.equal(send(state,'ANSWER_PROMPT',{...payload,selectedIids:selectedIids.slice(1)}).ok,false);
    assert.equal(send(state,'ANSWER_PROMPT',{...payload,selectedIids:selectedIids.map(()=>selectedIids[0])}).ok,false);
  }
  if(count > 5) assert.equal(send(state,'ANSWER_PROMPT',{...payload,selectedIids:[...selectedIids.slice(0,4),before[5]]}).ok,false);
  result = send(state,'ANSWER_PROMPT',payload);
  assert.equal(result.ok,true,JSON.stringify(result.rejection));
  assert.equal(result.prompt,null);
  assert.deepEqual(result.state.players[0].deck.map(card=>card.iid),selectedIids.concat(before.slice(5)));
  assert.equal(result.events.filter(event=>event.type === 'DECK_REORDERED').length,1);
  assert.equal(send(result.state,'ANSWER_PROMPT',payload).ok,false,'stale submission cannot resolve twice');
  assert.equal(runtimeRuleId({id:'75',counters:{copiedEffectId:'32',copiedPassiveId:'33'}}),'75');
  state = result.state;
  const ctx = {state,events:[],ruleEvents:[]};
  if(count > 5){
    const removed = selectedIids[1];
    applyOperation(ctx,{type:'TRANSFER_CARDS',targetIid:removed,playerIndex:0,destinationPile:'hand'});
    const expected = selectedIids.filter(iid=>iid !== removed).concat(before.slice(5));
    assert.deepEqual(state.players[0].deck.map(card=>card.iid),expected,'search removes one instance and preserves all others');
    state.players[0].hand = [];
    applyOperation(ctx,{type:'DRAW_CARD',playerIndex:0,count:3,activatedEffect:true});
    assert.deepEqual(state.players[0].hand.map(card=>card.iid),expected.slice(0,3));
    applyOperation(ctx,{type:'DRAW_CARD',playerIndex:0,count:1,activatedEffect:false});
    assert.deepEqual(state.players[0].hand.map(card=>card.iid),expected.slice(0,4));
  }
}

// Run the shipping local resolver and actual local draw function without rendering.
const local = {G:{players:[{deck:[],hand:[]},{deck:[],hand:[]}],turn:1},console,
  log(){},toast(){},waitForEffectPresentationBeforeChoice:async()=>{}};
local.window = local;
vm.createContext(local);
vm.runInContext(fs.readFileSync(new URL('../../src/scripts/51-ledger-archive.js',import.meta.url),'utf8'),local);
const cards = Array.from({length:8},(_,i)=>({iid:i+1,id:'32',name:'Card '+i,fate:i}));
local.G.players[0].deck = cards.slice();
local.openLedgerArchive = async (top,opts)=>{ const order=top.slice().reverse(); await opts.onConfirm(order); return order; };
await local.resolveLedgerArchive(0,{iid:75});
assert.deepEqual(local.G.players[0].deck.map(card=>card.iid),[5,4,3,2,1,6,7,8]);
const setupSource = fs.readFileSync(new URL('../../src/scripts/04-game-setup.js',import.meta.url),'utf8');
const drawSource = setupSource.slice(setupSource.indexOf('async function drawCard(player,'),setupSource.indexOf('function transferAliIndomitableToOpponentHand('));
Object.assign(local,{
  getPerspectivePlayerIndex:()=>0,
  document:{getElementById:()=>null},
  playSfx(){},
  resolveFortCalvinDrawInterception:()=>({redirected:false}),
  addCardToHand:(player,card)=>{local.G.players[player].hand.push(card);return true;}
});
vm.runInContext(drawSource,local);
await local.drawCard(0,3,{skipPresentationWait:true});
assert.deepEqual(local.G.players[0].hand.map(card=>card.iid),[5,4,3]);
await local.drawCard(0,1,{drawPhase:true,skipPresentationWait:true});
assert.deepEqual(local.G.players[0].hand.map(card=>card.iid),[5,4,3,2]);
local.G.players[0].deck = [cards[4],cards[3],cards[2],cards[1],cards[0],...cards.slice(5)];
local.G.players[0].deck = local.G.players[0].deck.filter(card=>card.iid !== 3);
assert.deepEqual(local.G.players[0].deck.splice(0,3).map(card=>card.iid),[5,4,2]);
local.G.players[0].deck = cards.slice();
await local.resolveLedgerArchive(0,{iid:75},{ai:true});
assert.deepEqual(local.G.players[0].deck.map(card=>card.iid),[5,4,3,2,1,6,7,8]);
const helpers = fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
vm.runInContext(helpers.slice(helpers.indexOf('async function activateLedgerCopiedSupporterEffect('), helpers.indexOf('function showMoveTarget(')),local);
const unchanged = JSON.stringify(local.G);
assert.equal(await local.activateLedgerCopiedSupporterEffect(0,0,{id:'32'},{id:'75'}),false);
assert.equal(local.pickBoardSupporterEffect(0,0,{id:'75'}),false);
assert.equal(local.ledgerCopy(0),false);
assert.equal(JSON.stringify(local.G),unchanged,'retired callbacks cannot mutate the game');
local.pickCardsVisual = (cards,options,choose)=>choose([cards[1]]);
local.queueSearchToHandMotion = ()=>{};
local.renderBoardActionForPlayer = ()=>{};
local.shuffle = ()=>{throw new Error('Search must not shuffle');};
local.G.players[0].deck = cards.map(card=>({...card,type:'Supporter'}));
vm.runInContext(helpers.slice(helpers.indexOf('function searchDeckForType('),helpers.indexOf('function searchDeckForCard(')),local);
local.searchDeckForType(0,'Supporter','Search',1);
assert.deepEqual(local.G.players[0].deck.map(card=>card.iid),[1,3,4,5,6,7,8]);
console.log('Ledger Archive: authoritative ordering, short decks, invalid choices, replay, search/draw order, retired copy isolation, and local/AI parity passed.');
