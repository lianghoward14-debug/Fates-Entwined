import assert from 'node:assert/strict';
import {createInitialState,applyOperation,reduceCommand} from '../../shared/engine/index.mjs';
import {cardRule} from '../../shared/engine/cards/registry.mjs';
import {command} from './test-helpers.mjs';
function fresh(){return createInitialState({matchId:'villager',seed:'villager',landscapeId:'igb22',handSize:0,players:[{id:'p0',deckIds:[]},{id:'p1',deckIds:[]}],cardDefinitions:[]});}
function change(state,id,temp=true,seat=0){const ctx={state,events:[],ruleEvents:[]};applyOperation(ctx,{type:'CHANGE_LANDSCAPE',landscapeId:id,temporary:temp,sourceController:seat});return ctx;}
let s=fresh();const zones=s.landscapeState.targetZones.slice();s.landscapeState.oncePerGameUses[0]=1;
change(s,'igb20');assert.equal(s.landscapeReturnId,'igb22');s.landscapeState.fateThresholdClaims['20']={choiceResolved:true,winner:0};change(s,'igb21');assert.equal(s.landscapeReturnId,'igb22');s.landscapeState.oncePerGameUses[1]=1;
change(s,'igb20');assert.equal(s.landscapeState.fateThresholdClaims['20'].winner,0);
change(s,'igb21');assert.equal(s.landscapeState.oncePerGameUses[1],1);
change(s,'igb3',false);assert.equal(s.landscapeReturnId,'igb3');assert.equal(s.temporaryLandscape,null);const zone=s.landscapeState.targetZone;
change(s,'igb1');change(s,'igb2');assert.equal(s.landscapeReturnId,'igb3');
// Restore only after the opposing turn, through the real end-turn reducer.
s.turn=4;s.activePlayer=1;s.phase='main';s.temporaryLandscape.expiresTurn=4;
let result=reduceCommand(s,command(s,'p1',1,'END_TURN',{}),{playerId:'p1'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.state.landscapeId,'igb3');assert.equal(result.state.landscapeState.targetZone,zone);assert.equal(result.state.temporaryLandscape,null);
s=fresh();change(s,'igb1');s.turn=2;s.activePlayer=1;s.phase='main';result=reduceCommand(s,command(s,'p1',1,'END_TURN',{}),{playerId:'p1'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.state.landscapeId,'igb22');assert.deepEqual(result.state.landscapeState.targetZones,zones);
assert.equal(cardRule('111',s).program[1].operation.temporary,true);assert.throws(()=>change(s,'igb1'),/different landscape/);
console.log('Villager return target, successive changes, Felicyta override, expiry, Pella claims, once-per-game state and random configuration passed.');
