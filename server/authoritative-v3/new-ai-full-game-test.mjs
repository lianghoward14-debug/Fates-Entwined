import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {createInitialState,legalCommandTemplates,projectStateForPlayer,reduceCommand} from '../../shared/engine/index.mjs';
import {chooseCommand} from '../../shared/ai/policy.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
const decks=require('../fate-deck-catalog.js').getDeckCatalog().decks;
const games=Number(process.argv[2] || 2);
for(let game=0;game<games;game++){
 const seat=game%2;
 let state=createInitialState({matchId:`new-ai-full-${game}`,seed:`paired-${Math.floor(game/2)}`,cardDefinitions:definitions,
  players:[{id:'p0',deckIds:decks[0].ids},{id:'p1',deckIds:decks[1].ids}],
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true}});
 let count=0,maxMs=0;const start=performance.now();
 while(!state.outcome && count<500){
  const actor=Number(state.pendingPrompt?.playerIndex ?? state.pendingHandLimit?.playerIndex ?? state.activePlayer);
  const legal=legalCommandTemplates(state,actor).filter(c=>c.type!=='CONCEDE');
  assert(legal.length,`No commands turn ${state.turn}`);
  const before=performance.now();
  const priority=createCommandOrderer(state,actor);
  const command=actor===seat ? chooseCommand(legal,projectStateForPlayer(state,actor),{canonicalState:state,playerIndex:actor,samples:1,nodeBudget:100,width:5})
    : legal.map(command=>({command,score:priority(command)})).sort((a,b)=>b.score-a.score)[0].command;
  maxMs=Math.max(maxMs,performance.now()-before);
  const payload=command.manualOnly===true?{...(command.payload || {}),userActivated:true}:command.payload || {};
  const result=reduceCommand(state,{type:command.type,payload,commandId:`full-${++count}`,matchId:state.matchId,expectedRevision:state.revision},{playerId:state.players[actor].id});
  assert(result.ok,JSON.stringify({command,rejection:result.rejection}));state=result.state;
  if(count%25===0)console.log(JSON.stringify({game,seat,commands:count,turn:state.turn,elapsedMs:Math.round(performance.now()-start)}));
 }
 assert(state.outcome,'Full game did not finish');
 console.log(JSON.stringify({game,seat,decks:decks.slice(0,2).map(d=>d.name),commands:count,outcome:state.outcome,maxDecisionMs:Math.round(maxMs),elapsedMs:Math.round(performance.now()-start)}));
}
