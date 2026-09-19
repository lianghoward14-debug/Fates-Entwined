import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {filterAiTargets} from '../../shared/ai/targeting.mjs';
import {chooseCommand} from '../../shared/ai/policy.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
const legacy=fs.readFileSync(new URL('../../src/scripts/07-ai.js',import.meta.url),'utf8');
const helper=legacy.slice(legacy.indexOf('async function aiResolveAutomaticBoardEffects()'),legacy.indexOf('async function aiActivateEffects()'));
for(const player of [0,1]){
  const cards=['03','40','38','27'].map((id,i)=>({id,iid:String(i),owner:player}));
  const hidden={id:'03',iid:'hidden',owner:player,faceDown:true};
  const copied={id:'bh05',runtimeId:'38',iid:'copy',owner:player};
  const board=[...cards,hidden,copied];
  const events=[];
  const ctx={G:{aiPlayer:player,currentPlayer:player,turn:1},window:{fateEffectRequiresManualActivationId:c=>['38','40'].includes(typeof c==='string'?c:c.id)},automaticBoardEffectsEnabled:()=>true,isFaceDownCard:c=>!!c.faceDown,canUseManualCharacterEffect:c=>!c.used,getCardRuntimeEffectId:c=>c.runtimeId || c.id,forEachBoardCard:fn=>board.forEach((c,i)=>fn(c,0,0,i)),playEffectActivationCinematic:async c=>events.push('show:'+c.id),aiRunEffect:async c=>{events.push('effect:'+c.id);c.used=true;}};
  vm.createContext(ctx);vm.runInContext(helper,ctx);
  await ctx.aiResolveAutomaticBoardEffects();
  assert.deepEqual(events,['show:03','effect:03','show:27','effect:27']);
  await ctx.aiResolveAutomaticBoardEffects();
  assert.equal(events.length,4,'automatic effects cannot replay');
  assert(!cards[1].used && !cards[2].used && !hidden.used && !copied.used);

  const state=createInitialState({matchId:'automatic-'+player,seed:'automatic',activePlayer:player,handSize:99,cardDefinitions:definitions,players:[0,1].map(i=>({id:'p'+i,deckIds:['03','40','38','bh16','09','09']}))});
  const owner=state.players[player];
  const row=player===0?2:0;
  for(const [col,id] of ['03','40','38','bh16','09'].entries()){
    const card=owner.hand.splice(owner.hand.findIndex(c=>c.id===id),1)[0];
    card.controller=player;state.board[Math.floor(col/3)][row][col%3]=card;
  }
  const commands=legalCommandTemplates(state,player);
  const howard=commands.find(c=>c.type==='ACTIVATE_EFFECT' && c.cardId==='03');
  assert(howard,'Howard has a legal activation');
  assert(commands.some(c=>c.type==='SET_CARD'),'another placement could otherwise defer the effect');
  assert.deepEqual(filterAiTargets(commands,state,player),[howard]);
  assert.equal(chooseCommand(commands,state,{canonicalState:state,playerIndex:player,samples:1,maxNodeBudget:48}),howard);
  const result=reduceCommand(state,{type:howard.type,payload:howard.payload,commandId:'activate',matchId:state.matchId,expectedRevision:state.revision},{playerId:'p'+player});
  assert(result.ok,JSON.stringify(result.rejection));
  if(result.state.pendingPrompt){
    const actor=result.state.pendingPrompt.playerIndex;
    assert(filterAiTargets(legalCommandTemplates(result.state,actor),result.state,actor).every(c=>c.type==='ANSWER_PROMPT' || c.type==='CONCEDE'),'reaction/target choices retain priority');
  }
  state.board[0][row][0].faceDown=true;
  const hiddenCommands=legalCommandTemplates(state,player);
  const remaining=filterAiTargets(hiddenCommands,state,player);
  assert(remaining.some(c=>c.type==='SET_CARD'),'hidden and manual effects do not force automatic activation');
  for(const id of ['38','40','bh16'])assert(remaining.some(c=>c.type==='ACTIVATE_EFFECT' && c.cardId===id),'manual exception '+id+' remains available');
}
console.log('Automatic AI effect timing passed: both seats, immediate order, replay prevention, manual/copied/hidden exceptions and prompt priority.');
