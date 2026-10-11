import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {legalCommandTemplates as legalCommands} from '../../shared/engine/legal-commands.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {replaceLandscapeState} from '../../shared/engine/landscapes/runtime.mjs';
import {projectStateForPlayer} from '../../shared/engine/projections.mjs';
import {command} from './test-helpers.mjs';

const definitions = ['Initiator','Coordinator','Dauntless','Improvisor','Supporter','Counter'].map((type,i)=>({id:String(200+i),name:type,type,fate:4,cost:1}));
function fixture(){
  const state=createInitialState({matchId:'twilight',seed:'twilight',handSize:99,landscapeId:'igb4',cardDefinitions:definitions,
    players:[0,1].map(i=>({id:'p'+i,deckIds:definitions.map(c=>c.id)}))});
  for(const p of state.players) p.discard=p.hand.splice(0);
  return state;
}
let seq=0;
function recover(state,player,targetIid){return reduceCommand(state,command(state,'p'+player,++seq,'ACTIVATE_LANDSCAPE',{targetIid}),{playerId:'p'+player});}
let state=fixture();
assert.equal(legalCommands(state,0).filter(c=>c.type==='ACTIVATE_LANDSCAPE').length,4);
for(const type of ['Supporter','Counter']) assert.equal(recover(state,0,state.players[0].discard.find(c=>c.type===type).iid).ok,false);
assert.equal(recover(state,0,state.players[1].discard[0].iid).ok,false);
assert.equal(recover(state,1,state.players[1].discard[0].iid).ok,false);
assert.equal(recover(state,0,'missing').ok,false);
assert.deepEqual(state.landscapeState.twilightRecoveryUses,[0,0]);
const target=state.players[0].discard[0];
target.counters={...target.counters,effectUses:2,whenSetResolved:true,lastEffectTurn:state.turn};
let result=recover(state,0,target.iid);
assert.equal(result.ok,true);
state=result.state;
assert.equal(state.players[0].hand[0].counters.effectUses,0);
assert.equal(state.players[0].hand[0].counters.whenSetResolved,undefined);
assert.equal(state.players[0].hand[0].counters.lastEffectTurn,undefined);
assert(state.players[0].hand.some(c=>c.iid===target.iid));
assert(!state.players[0].discard.some(c=>c.iid===target.iid));
assert.equal(recover(state,0,state.players[0].discard[0].iid).ok,false);
assert.equal(legalCommands(state,0).filter(c=>c.type==='ACTIVATE_LANDSCAPE').length,0);
for(const seat of [0,1]) assert.deepEqual(projectStateForPlayer(state,seat).landscapeState.twilightRecoveryUses,[1,0]);
replaceLandscapeState(state,'igb1');
replaceLandscapeState(state,'igb4');
assert.equal(recover(state,0,state.players[0].discard[0].iid).ok,false);
state.activePlayer=1;
result=recover(state,1,state.players[1].discard[0].iid);
assert.equal(result.ok,true);
assert.deepEqual(result.state.landscapeState.twilightRecoveryUses,[1,1]);
for(const type of ['Initiator','Coordinator','Dauntless','Improvisor']){
  const fresh=fixture();
  assert.equal(recover(fresh,0,fresh.players[0].discard.find(c=>c.type===type).iid).ok,true);
}

// Exercise the actual shipping singleplayer picker and multiplayer dispatch bridge.
const source=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function activateTwilightRecoveryLandscape('),source.indexOf('function activateWhiteboardDrawingsLandscape('));
const cards=definitions.map((c,i)=>({...c,iid:'c'+i}));
let picker,submitted=[];
const sandbox={window:{},G:{currentPlayer:0,phase:'main',landscapeId:'igb4',players:[{hand:[],discard:structuredClone(cards)},{hand:[],discard:[]}],_landscapeState:{twilightRecoveryUses:[0,0]}},
  isLandscapeActive:id=>sandbox.G.landscapeId===id,getPerspectivePlayerIndex:()=>0,getLandscapeState:()=>sandbox.G._landscapeState,
  document:{getElementById:()=>null},toast:()=>{},closeModal:()=>{},log:()=>{},renderGame:()=>{},
  pickCardsVisual:(cards,opts,confirm)=>{picker={cards,opts,confirm};},
  addCardToHand:(player,card)=>{sandbox.G.players[player].hand.push(card);return true;}};
vm.createContext(sandbox);vm.runInContext(fn,sandbox);
sandbox.activateTwilightRecoveryLandscape();
assert.equal(picker.opts.allowCancel,true);
assert.equal(picker.cards.length,4);
assert.equal(sandbox.G._landscapeState.twilightRecoveryUses[0],0,'opening spends nothing');
sandbox.activateTwilightRecoveryLandscape();
assert.equal(sandbox.G._landscapeState.twilightRecoveryUses[0],0,'reopening spends nothing');
sandbox.G.currentPlayer=1;
sandbox.activateTwilightRecoveryLandscape();
assert.equal(picker.opts.canSelect(),false,'opponent turn allows browsing, not recovery');
sandbox.G.currentPlayer=0;
Object.assign(picker.cards[0],{effectUsedInitial:true,effectUsedThisTurn:true,_blackRoseUsed:true,_effectTurnLocked:true});
picker.confirm([picker.cards[0]]);
if(sandbox.G.players[0].hand.length) { assert.equal(sandbox.G.players[0].hand[0].effectUsedInitial,false);assert.equal(sandbox.G.players[0].hand[0]._blackRoseUsed,undefined); }
assert.equal(sandbox.G.players[0].hand.length,1);
assert.equal(sandbox.G._landscapeState.twilightRecoveryUses[0],1);
picker.confirm([picker.cards[1]]);
assert.equal(sandbox.G.players[0].hand.length,1);
sandbox.G._landscapeState.twilightRecoveryUses=[0,0];
sandbox.G._phase7AuthorityMatchId='online';
sandbox.window.fatePhase7SubmitTwilightRecovery=iid=>{submitted.push(iid);return true;};
sandbox.activateTwilightRecoveryLandscape();
picker.confirm([picker.cards[0]]);
assert.equal(submitted.length,1);
assert.equal(sandbox.G.players[0].hand.length,1,'multiplayer never mutates the legacy hand');
assert.equal(sandbox.G._landscapeState.twilightRecoveryUses[0],0,'server owns multiplayer use');
assert.equal(picker.opts.authoritativeDirectAction,true,'picker bypasses legacy online action fencing');
// Render the real panel in an opponent-turn state and follow its actual button.
const rendering=fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const panelFn=rendering.slice(rendering.indexOf('function renderLandscapePanel()'),rendering.indexOf('function showLandscapeChoiceModal('));
const classes=new Set();classes.remove=classes.delete.bind(classes);classes.toggle=()=>{};
const panel={innerHTML:'',children:[],classList:classes};
sandbox.document.getElementById=id=>id==='landscape-panel'?panel:null;
sandbox.getCurrentLandscape=()=>({id:'igb4',name:'Zion Canyon: Memories of a Fading Twilight',description:'Recover one Character.'});
sandbox.syncGameLandscapeClass=()=>{};sandbox.escapeHtml=text=>String(text);sandbox._lastLandscapeRenderSignature='';
vm.runInContext(panelFn,sandbox);
sandbox.G.currentPlayer=1;sandbox.renderLandscapePanel();
assert(panel.innerHTML.includes('landscape-whisper-button'));
assert(!panel.innerHTML.includes(' disabled'),'landscape button remains accessible on opponent turn');
const handler=/onclick="([^"]+)"/.exec(panel.innerHTML)[1];
vm.runInContext(handler,sandbox);
assert.equal(picker.opts.allowCancel,true);
assert.equal(picker.opts.authoritativeDirectAction,true);
sandbox.G.currentPlayer=0;
// Run the actual shipping submission function into a room actor for both seats.
const onlineSource=fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js',import.meta.url),'utf8');
const submitSource=onlineSource.slice(onlineSource.indexOf('  window.fatePhase7SubmitTwilightRecovery ='),onlineSource.indexOf('  window.fatePhase7SubmitWhiteboardCatalog ='));
for(const seat of [0,1]){
  const fresh=fixture();fresh.activePlayer=seat;
  const actor=new AuthoritativeRoomActor({state:fresh,store:{commandResponse:()=>null,appendAccepted(){}}});
  let pending;
  const context={window:{},phase7CurrentUiSession:{adapter:{}},toast:()=>{},
    phase7SubmitCommand:template=>{pending=actor.dispatch('p'+seat,JSON.parse(JSON.stringify(command(actor.state,'p'+seat,++seq,template.type,template.payload))));return pending;}};
  vm.createContext(context);vm.runInContext(submitSource,context);
  const before=actor.snapshotForPlayer(seat);
  const legal=before.legalCommands.find(c=>c.type==='ACTIVATE_LANDSCAPE');
  assert(legal,'server offers panel recovery command to either seat');
  context.window.fatePhase7SubmitTwilightRecovery(legal.payload.targetIid);
  const response=await pending;
  assert.equal(response.response.kind,'accepted',JSON.stringify(response.response.rejection));
  assert.equal(response.broadcasts.length,2);
  for(const {message} of response.broadcasts) assert.equal(message.state.landscapeState.twilightRecoveryUses[seat],1);
  assert(actor.state.players[seat].hand.some(c=>c.iid===legal.payload.targetIid));
  assert.equal(actor.snapshotForPlayer(seat).legalCommands.filter(c=>c.type==='ACTIVATE_LANDSCAPE').length,0);
}
console.log('Twilight: both seats, all Character types, invalid targets, replay protection, landscape changes, projections, cancelable browsing and shipping dispatch passed');
