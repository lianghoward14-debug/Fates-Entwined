import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand} from '../shared/engine/index.mjs';
import {command} from './authoritative-v3/test-helpers.mjs';

const core = fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const ai = fs.readFileSync('src/scripts/07-ai.js','utf8');
const helper = ai.match(/function aiChooseFelicytaYouthLandscape\([^]*?\n\}/)[0];
const start = core.indexOf("    case '82': { // Felicyta Janowicz (Youth): change landscape");
const branch = core.slice(start, core.indexOf("    case '83':", start));
for(const owner of [0,1]) {
  let transitions = 0, prompts = 0, blocked = false;
  const card = {id:'82', owner};
  const context = {G:{aiEnabled:true, aiPlayer:owner, currentPlayer:1-owner, landscapeId:'igb1'},
    LANDSCAPES:{igb1:{},igb15:{name:'Snow'}},
    isLandscapeChangeBlockedFor:()=>blocked, getFelicitaLandscapeChangeBlockReason:()=>'',
    transitionGameLandscape(song,opts){assert.equal(song,'board15');assert.equal(opts.player,owner);assert.equal(opts.sourceCard,card);transitions++;},
    showLandscapeChoiceModal(){prompts++;}, log(){}};
  vm.createContext(context);
  vm.runInContext(helper + `\nasync function resolve(card,cp){switch('82'){${branch}}}`,context);
  await context.resolve(card,1-owner);
  assert.equal(transitions,1); assert.equal(prompts,0);
  blocked = true;
  await context.resolve(card,owner);
  assert.equal(transitions,1); assert.equal(prompts,0);
  blocked = false;
  context.G.aiEnabled = false;
  context.ignoreBattleOfPellaThresholdsReachedBeforeEntry = ()=>{};
  context.renderGame = ()=>{};
  context.showLandscapeChoiceModal = (_mode, choose, options)=>{
    prompts++; assert.equal(options.player,owner); choose('board15');
  };
  await context.resolve(card,owner);
  assert.equal(prompts,1,'human-controlled Youth retains its landscape picker');
  assert.equal(transitions,2);
}

for(const owner of [0,1]) {
  let state = createInitialState({matchId:'taylor-youth-'+owner,seed:'copy',handSize:99,activePlayer:owner,
    landscapeId:'igb1', cardDefinitions:[
      {id:'bh05',name:'Taylor',type:'Initiator',aff:'reality',fate:4,cost:1},
      {id:'82',name:'Felicyta Youth',type:'Initiator',aff:'expanded_worlds',fate:4,cost:3},
      {id:'32',name:'Resident',type:'Supporter',aff:'reality',fate:1,cost:0}
    ],players:[0,1].map(i=>({id:'p'+i,deckIds:['bh05','82','32']}))});
  const hand = state.players[owner].hand;
  const tribute = hand.splice(hand.findIndex(c=>c.id==='32'),1)[0];
  tribute.controller = owner;
  const row = owner===0 ? 2 : 0;
  state.board[0][row][0] = tribute;
  const taylor = hand.find(c=>c.id==='bh05');
  let seq = 0;
  const submit = (player,type,payload) => reduceCommand(state,command(state,'p'+player,++seq,type,payload),{playerId:'p'+player});
  let result = submit(owner,'CONSOLIDATE_CARD',{cardIid:taylor.iid,tributeIids:[tribute.iid],destination:{z:0,r:row,c:0}});
  assert.equal(result.ok,true,JSON.stringify(result.error)); state=result.state;
  const youth=state.pendingPrompt.eligibleCards.find(c=>c.id==='82'); assert.ok(youth);
  result=submit(owner,'ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,selectedIid:youth.iid});
  assert.equal(result.ok,true); state=result.state;
  assert.equal(state.pendingPrompt.type,'MODAL_CHOICE');
  assert.equal(state.pendingPrompt.playerIndex,owner);
  const answer={promptId:state.pendingPrompt.promptId,choice:'igb15'};
  assert.equal(submit(1-owner,'ANSWER_PROMPT',answer).ok,false,'opponent cannot answer copied landscape choice');
  result=submit(owner,'ANSWER_PROMPT',answer);
  assert.equal(result.ok,true); assert.equal(result.state.landscapeId,'igb15');
}
console.log('PASS AI-owned landscape choices never open a human picker, respect locks, and multiplayer Taylor choices belong to their controller in both seats.');
