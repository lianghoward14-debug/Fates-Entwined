import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {testState,command} from './test-helpers.mjs';
import {reduceCommand} from '../../shared/engine/index.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';
import {FateAuthoritativeV3SinglePlayerAdapter} from '../../src/scripts/authoritative-v3-single-player-adapter.mjs';
import {FateAuthoritativeV3SinglePlayerScreen} from '../../src/scripts/authoritative-v3-single-player-screen.mjs';
for(const playerIndex of [0,1]){
  let state=testState({activePlayer:playerIndex});
  let result;
  const iid=state.players[playerIndex].hand[0].iid;
  state.effectStack=[{frameId:'expiry',kind:'CARD_EFFECT',sourceIid:iid,controller:playerIndex,instructionIndex:0,
    waitingFor:'CARD_SELECTION',locals:{},program:[{kind:'SELECT_CARDS',local:'targetIid',filter:{locations:['hand'],playerIndex:'controller'}}]}];
  state.pendingPrompt={promptId:'expiry-prompt',frameId:'expiry',type:'CARD_SELECTION',playerIndex,sourceIid:iid,min:1,max:1,eligibleIids:[iid],timeoutPolicy:'FIRST_ELIGIBLE'};
  const actor=new AuthoritativeRoomActor({state,store:{}});
  const timeout=actor.turnTimeoutCommand();
  assert.ok(timeout,'picker must not disable the turn timer');
  const adapter=new FateAuthoritativeV3SinglePlayerAdapter({state,humanPlayerId:`p${playerIndex}`,aiPlayerId:`p${1-playerIndex}`});
  const local=adapter.dispatchHuman('END_TURN',{expirePickers:true});
  assert.equal(local.ok,true,JSON.stringify(local.rejection));
  result=reduceCommand(state,timeout.command,{playerId:timeout.playerId});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));
  assert.equal(result.state.pendingPrompt,null);
  assert.equal(result.state.effectStack.length,0);
  assert.equal(result.state.activePlayer,1-playerIndex);
  assert.ok(result.events.some(event=>event.type==='PICKER_EXPIRED'));
  const stale=reduceCommand(result.state,command(result.state,`p${playerIndex}`,3,'ANSWER_PROMPT',{promptId:'expiry-prompt',selectedIid:iid}),{playerIndex});
  assert.equal(stale.ok,false,'expired selection must not execute on the next turn');
}
const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const sandbox={G:{pendingEffect:{},_phase7PendingPrompt:{}},getAuthoritativeTurnClock:()=>null,isImprovisorTurnTimerPaused:()=>false,
  document:{querySelector:()=>null},window:{}};
vm.createContext(sandbox);
vm.runInContext(core.slice(core.indexOf('function isTurnTimerInteractionPaused('),core.indexOf('function updateTurnTimerPauseState(')),sandbox);
assert.equal(sandbox.isTurnTimerInteractionPaused(),false);
// The single-player screen retains its original deadline when a picker opens.
const screen=Object.create(FateAuthoritativeV3SinglePlayerScreen.prototype);
let tick,submitted;
Object.assign(screen,{window:{setInterval:fn=>{tick=fn;return 1;},clearInterval(){},toast(){}},
  turnTimeLimit:30,turnTimerDeadline:0,turnTimerInterval:null,setTurnTimerText(){},submit:cmd=>{submitted=cmd;return {ok:true};}});
screen.view={playerIndex:0,state:{turn:1,activePlayer:0,pendingPrompt:{promptId:'open'}},legalCommands:[]};
screen.syncTurnTimer(screen.view);
const deadline=screen.turnTimerDeadline;
screen.syncTurnTimer(screen.view);
assert.equal(screen.turnTimerDeadline,deadline);
screen.turnTimerDeadline=Date.now()-1;
tick();
assert.equal(submitted.payload.expirePickers,true);
// Required hand-limit choices are fulfilled before advancing, never bypassed.
const overfull=testState({player0:Array(15).fill('32'),player1:['05']});
overfull.players[0].hand.push(...overfull.players[0].deck.splice(0));
overfull.pendingHandLimit={playerIndex:0,limit:12,required:3};
const capped=reduceCommand(overfull,command(overfull,'p0',9,'END_TURN',{expirePickers:true}),{playerIndex:0});
assert.equal(capped.ok,true,JSON.stringify(capped.rejection));
assert.equal(capped.state.players[0].hand.length,12);
assert.equal(capped.state.players[0].discard.length,3);
console.log('Picker expiry passes for both seats; stale answers rejected; local picker clock runs.');
