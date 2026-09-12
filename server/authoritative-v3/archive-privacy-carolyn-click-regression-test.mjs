import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand,projectStateForPlayer,projectStateForSpectator,projectEvents,projectEventsForSpectator,legalCommandTemplates} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
const definitions=[{id:'75',name:'Ledger',type:'Supporter',fate:1,cost:0},{id:'32',name:'Resident',type:'Supporter',fate:1,cost:0},{id:'67',name:'Secules',type:'Improvisor',fate:1,cost:1},{id:'17',name:'Carolyn',type:'Initiator',fate:1,cost:1}];
for(const owner of [0,1]){
 const opponent=1-owner;
 let state=createInitialState({matchId:'PRIVATE'+owner,seed:'private',activePlayer:owner,handSize:99,cardDefinitions:definitions,players:[{id:'p0',deckIds:['75','67','32','32','32','32','32','32']},{id:'p1',deckIds:['75','67','32','32','32','32','32','32']}]});
 const source=state.players[owner].hand.find(c=>c.id==='75');
 state.players[owner].deck=state.players[owner].hand.filter(c=>c.id==='32');
 state.players[owner].hand=state.players[owner].hand.filter(c=>c.id!=='32');
 const reactor=state.players[opponent].hand.splice(state.players[opponent].hand.findIndex(c=>c.id==='67'),1)[0];
 state.board[0][opponent===0?2:0][0]=reactor;
 let result=reduceCommand(state,command(state,'p'+owner,1,'SET_CARD',{cardIid:source.iid,destination:{z:0,r:owner===0?2:0,c:0}}),{playerId:'p'+owner});
 assert.equal(result.ok,true);assert.equal(result.prompt.type,'REACTION');
 result=reduceCommand(result.state,command(result.state,'p'+opponent,2,'ANSWER_PROMPT',{promptId:result.prompt.promptId,choice:'DECLINE'}),{playerId:'p'+opponent});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));
 state=JSON.parse(JSON.stringify(result.state));
 assert.equal(projectStateForPlayer(state,owner).pendingPrompt.eligibleCards.length,5);
 for(const view of [projectStateForPlayer(state,opponent),projectStateForSpectator(state)]){
  assert.equal(view.pendingPrompt.eligibleCards,undefined);
  assert.equal(view.pendingPrompt.revealedCards,undefined);
  assert.equal(view.pendingPrompt.eligibleIids,undefined);
 }
 assert.equal(projectEvents(result.events,owner).filter(e=>e.type==='DECK_TOP_REVEALED').length,1);
 assert.equal(projectEvents(result.events,opponent).filter(e=>e.type==='DECK_TOP_REVEALED').length,0);
 assert.equal(projectEventsForSpectator(result.events).filter(e=>e.type==='DECK_TOP_REVEALED').length,0);
 const order=state.pendingPrompt.eligibleIids.slice().reverse();
 const bad=reduceCommand(state,command(state,'p'+opponent,3,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:order}),{playerId:'p'+opponent});
 assert.equal(bad.ok,false);
 result=reduceCommand(state,command(state,'p'+owner,4,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIids:order}),{playerId:'p'+owner});
 assert.equal(result.ok,true);assert.deepEqual(result.state.players[owner].deck.slice(0,5).map(c=>c.iid),order);
}
const online=fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js',import.meta.url),'utf8');
const start=online.indexOf('        const sourceCard = phase7FindAnyCard(prompt?.sourceIid);',online.indexOf("}else if(['BOARD_DESTINATION']"));
const end=online.indexOf('        const multi = commands.filter',start);
const branch=online.slice(start,end);
for(const id of ['17','04']){
 const commands=[{type:'ANSWER_PROMPT',payload:{destination:{z:2,r:1,c:2}}}];
 const game={},session={};let chosen,label,classes;
 const sandbox=vm.createContext({prompt:{sourceIid:'source'},commands,promptKey:'p',phase7CurrentUiSession:session,phase7FindAnyCard:()=>({id}),gameState:()=>game,phase7BeginDestinationChoice:(c,l)=>{chosen=c;label=l;},hint:{},document:{querySelector:()=>({classList:{add:(...v)=>classes=v}})}});
 vm.runInContext('(function(){'+branch+'})()',sandbox);
 assert.equal(chosen.length,1);
 assert.equal(chosen[0],commands[0]);
 assert.equal(game._phase7EffectSquareKind,id==='17'?'carolyn':'zoe');
 assert(classes.includes(id==='17'?'carolyn-block-choice':'zoe-block-choice'));
 assert(label.startsWith(id==='17'?'Carolyn':'Zoe'));
}
assert(!online.includes('window.openLedgerArchive(prompt.revealedCards'));
console.log('Archive stays owner-only after reaction decline/reconnect; Carolyn and Zoe use direct board choices.');

for(const owner of [0,1]){
 let state=createInitialState({matchId:'CAROLYN'+owner,seed:'carolyn',activePlayer:owner,handSize:99,cardDefinitions:definitions,players:[{id:'p0',deckIds:['17']},{id:'p1',deckIds:['17']}]});
 const source=state.players[owner].hand.shift();source.faceDown=true;
 const occupied={z:0,r:owner===0?2:0,c:0};state.board[occupied.z][occupied.r][occupied.c]=source;
 let result=reduceCommand(state,command(state,'p'+owner,1,'FLIP_CARD',{cardIid:source.iid}),{playerId:'p'+owner});
 assert.equal(result.ok,true);assert.equal(result.prompt.type,'BOARD_DESTINATION');
 const choices=legalCommandTemplates(result.state,owner).filter(c=>c.payload?.destination);
 assert(choices.some(c=>c.payload.destination.z===2),'Carolyn can choose across zones');
 assert(!choices.some(c=>JSON.stringify(c.payload.destination)===JSON.stringify(occupied)),'occupied square is not selectable');
 const chosen=choices.find(c=>c.payload.destination.z===2);
 result=reduceCommand(result.state,command(result.state,'p'+owner,2,'ANSWER_PROMPT',chosen.payload),{playerId:'p'+owner});
 assert.equal(result.ok,true);
 assert(result.state.geometry.squareStatuses.some(s=>s.type==='PERMANENTLY_BLOCKED'&&s.z===chosen.payload.destination.z));
}
console.log('Carolyn direct-choice commands create the permanent square block for both seats.');

// Current multiplayer commits must sound on the confirmed square delta,
// including the receiving player, without sounding on unchanged snapshots.
{
 const start=online.indexOf('  function phase7PresentNewCarolynSquares(');
 const end=online.indexOf('  function phase7CommitCurrentView(',start);
 const heard=[];
 const context={window:{playCarolynLockSfx:key=>heard.push(key)}};
 vm.createContext(context);vm.runInContext(online.slice(start,end),context);
 const empty={blockedCells:[]};
 const locked={blockedCells:[{type:'carolyn',z:2,r:1,c:0}]};
 context.phase7PresentNewCarolynSquares(empty,locked);
 assert.deepEqual(heard,['carolyn-square:2:1:0']);
 context.phase7PresentNewCarolynSquares(locked,locked);
 context.phase7PresentNewCarolynSquares(empty,{blockedCells:[{type:'zoe',z:2,r:1,c:0}]});
 assert.equal(heard.length,1);
 assert(online.includes('phase7PresentNewCarolynSquares(previousSquareState, legacy)'));
}
console.log('Current multiplayer Carolyn square sound: confirmed addition only; unchanged snapshots and Zoe are silent.');
