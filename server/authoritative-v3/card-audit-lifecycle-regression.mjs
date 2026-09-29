import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8'),helpers=fs.readFileSync('src/scripts/00-structural-helpers.js','utf8');
function fn(n,text=core){const start=text.indexOf('function '+n+'(');if(start<0)throw Error(n);return text.slice(start,text.indexOf('\n}',start)+2);}
const results=[];let seq=0;
function fixture(ids){return E.createInitialState({matchId:'life'+(++seq),seed:'life',handSize:99,maxTurns:40,cardDefinitions:catalog.getCardCatalog().cards,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:[]}]});}
function put(s,id,z=0,r=2,c=0){const a=s.players[0].hand,i=a.findIndex(c=>c.id===id),card=a.splice(i,1)[0];s.board[z][r][c]=card;return card;}
function command(s,type,payload={}){const r=E.reduceCommand(s,{type,payload,commandId:'cmd'+(++seq),matchId:s.matchId,expectedRevision:s.revision},{playerIndex:s.pendingPrompt?.playerIndex??s.activePlayer});if(!r.ok)throw Error(JSON.stringify(r.rejection));return r.state;}
function probe(name,run){try{results.push({name,...run()});}catch(e){results.push({name,error:e.stack});}}
function legacyHenry(source,target){const c={isEffectImmuneSource:()=>false,cardActsAsPassive:(x,id)=>x.id===id,isDirectCardEffectSuppressed:()=>false,forEachBoardCard:f=>f(source,...source.position),isSameBoardSquare:(a,b)=>a.z===b.z&&a.r===b.r&&a.c===b.c,isAdjacentBoardSquare:(a,b)=>a.z===b.z&&Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1};vm.createContext(c);vm.runInContext(['getCardStructuralType','getCardEffectType','cardHasEffectType'].map(n=>fn(n,helpers)).join('\n'),c);vm.runInContext(fn('normalizeHenrySuppressionSquares')+'\n'+fn('isCardSuppressedByHenryDong'),c);return c.isCardSuppressedByHenryDong(target,0,1,0);}
probe('Henry moved away from selected square: authoritative versus legacy',()=>{
 let s=fixture(['21','15','54']);const target=put(s,'15',0,1,0);target.owner=1;target.controller=1;const henry=s.players[0].hand.find(c=>c.id==='21');henry.cost=0;
 s=command(s,'CONSOLIDATE_CARD',{cardIid:henry.iid,tributeIids:[],destination:{z:0,r:2,c:0}});
 s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,destinations:[{z:0,r:1,c:0}]});
 const before=E.isEffectSourceSuppressed(s,E.findBoardCard(s,target.iid));
 const wolf=s.players[0].hand.find(c=>c.id==='54');
 s=command(s,'SET_CARD',{cardIid:wolf.iid,destination:{z:0,r:2,c:1}});
 s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[henry.iid]});
 s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,destination:{z:1,r:2,c:0}});
 return {before,multiplayerAfterMove:E.isEffectSourceSuppressed(s,E.findBoardCard(s,target.iid)),singleplayerAfterMove:legacyHenry({id:'21',owner:0,position:[1,2,0],_henrySuppressionSquares:[{z:0,r:1,c:0}]},{id:'15',owner:1,type:'Coordinator'})};
});
for(const type of ['Supporter','Coordinator'])probe('Henry versus Chloe type '+type,()=>{
 const s=fixture(['21',type==='Supporter'?'15':'bh05']);const henry=put(s,'21'),target=s.players[0].hand[0];
 E.applyOperation({state:s,events:[],ruleEvents:[]},{type:'CHANGE_CARD_TYPE',targetIid:target.iid,cardType:type,sourceIid:target.iid,sourceController:0,playerIndex:0});
 put(s,target.id,0,1,0);target.owner=1;target.controller=1;
 E.applyOperation({state:s,events:[],ruleEvents:[]},{type:'CREATE_SQUARE_STATUS',destination:{z:0,r:1,c:0},statusType:'COORDINATOR_SUPPRESSED',blockedPlayer:1,sourceIid:henry.iid,sourceController:0});
 return {effectiveType:E.effectiveCardType(s,target),multiplayerSuppressed:E.isEffectSourceSuppressed(s,E.findBoardCard(s,target.iid)),singleplayerSuppressed:legacyHenry({id:'21',owner:0,position:[0,2,0],_henrySuppressionSquares:[{z:0,r:1,c:0}]},{id:target.id,owner:1,type:type==='Supporter'?'Coordinator':'Initiator',_bh14DeclaredType:type})};
});
probe('Guerilla expired and recovered: multiplayer can be set again',()=>{
 let s=fixture(['70']);const g=put(s,'70');E.applyOperation({state:s,events:[],ruleEvents:[]},{type:'DISCARD_CARD',targetIid:g.iid,sourceIid:g.iid,sourceController:0});
 for(let i=0;i<10;i++)s=command(s,'END_TURN');
 const expired=E.findCard(s,g.iid);const pile=expired.zone;
 E.applyOperation({state:s,events:[],ruleEvents:[]},{type:'TRANSFER_CARDS',targetIid:g.iid,playerIndex:0,destinationPile:'hand',sourceController:0});
 const canSet=E.legalCommandTemplates(s,0).some(c=>c.type==='SET_CARD'&&c.payload.cardIid===g.iid);
 return {expiredPile:pile,canSetAfterRecovery:canSet,statuses:E.findCard(s,g.iid).card.statuses};
});
probe('Guerilla legacy expiry retains cannot-set flag',()=>{
 const g={id:'70',iid:'g',owner:0,guerilla_transferred:true,guerilla_turnsLeft:1,guerilla_owner:0};
 const state={players:[{hand:[],discard:[]},{hand:[g],discard:[]}]};const noop=()=>{};
 const c={G:state,window:{},currentPlayer:1,cardActsAsPassive:(card,id)=>card.id===id,toast:noop,log:noop,playSfx:noop,playDiscardSfx:noop,renderHand:noop};vm.createContext(c);vm.runInContext(fn('fatePushDiscard',helpers),c);
 const start=core.indexOf('  const holderHand = G.players[currentPlayer].hand;'),end=core.indexOf('  renderHand();',start);vm.runInContext(core.slice(start,end),c);
 const recovered=state.players[0].discard.pop();state.players[0].hand.push(recovered);
 return {returnedToOwner:!!recovered,turnsLeft:recovered.guerilla_turnsLeft,stillMarkedInfiltrating:recovered.guerilla_transferred,handSelectionGuardBlocks:recovered.id==='70'&&recovered.guerilla_transferred};
});
probe('ALPINE intrinsic gain receives external Hsei bonus despite immunity',()=>{
 let s=fixture(['76','bh15']);put(s,'bh15',1);const infantry=s.players[0].hand[0];
 s=command(s,'SET_CARD',{cardIid:infantry.iid,destination:{z:0,r:2,c:0}});
 return {multiplayerFate:E.findCard(s,infantry.iid).card.currentFate,expectedWithoutExternalBonus:6};
});
fs.writeFileSync('tmp/card-audit-lifecycle-probe-results.json',JSON.stringify(results,null,2));for(const r of results)console.log(JSON.stringify(r));

for(const r of results)assert(!r.error,r.error);
assert.equal(results[0].multiplayerAfterMove,false);assert.equal(results[0].singleplayerAfterMove,false);assert.equal(results[1].singleplayerSuppressed,false);assert.equal(results[2].singleplayerSuppressed,true);assert.equal(results[3].canSetAfterRecovery,true);assert.equal(results[4].stillMarkedInfiltrating,undefined);assert.equal(results[4].handSelectionGuardBlocks,undefined);assert.equal(results[5].multiplayerFate,6);console.log("Lifecycle regression passed");
