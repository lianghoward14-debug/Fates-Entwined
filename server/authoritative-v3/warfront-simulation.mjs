import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {setTimeout as yieldCpu} from 'node:timers/promises';
import {createRequire} from 'node:module';
import {createInitialState, legalCommandTemplates, reduceCommand, multiplayerEligibleCardIds} from '../../shared/engine/index.mjs';
import {scoreStrategicV3AiCommand} from '../../src/scripts/authoritative-v3-ai-policy.mjs';
const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');

export function warfrontAiDeck(){
  const eligible = new Set(multiplayerEligibleCardIds());
  const cards = getCardCatalog().cards.filter(card=>eligible.has(String(card.id)));
  const shuffled = cards.map(card=>({card, order:Math.random()})).sort((a,b)=>a.order-b.order);
  return shuffled.slice(0,40).map(({card})=>String(card.id));
}

export function simulateWarfrontMatch(input){
  return new Promise((resolve,reject)=>{
    const worker = new Worker(new URL(import.meta.url), {workerData:{...input,warfrontSimulation:true}});
    const timer = setTimeout(()=>{worker.terminate();reject(new Error('Warfront simulation timed out'));},120000);
    worker.once('message',result=>{clearTimeout(timer);resolve(result);});
    worker.once('error',error=>{clearTimeout(timer);reject(error);});
    worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Warfront simulation exited '+code));});
  });
}

if(!isMainThread && workerData?.warfrontSimulation){
  let state = createInitialState({matchId:workerData.id, seed:workerData.id,
    landscapeId:workerData.landscapeId, cardDefinitions:getCardCatalog().cards,
    players:['a','b'].map(team=>({id:team,deckIds:warfrontAiDeck()}))});
  const actions=[], consolidations=[0,0];
  let actionTurn=-1, actionsThisTurn=0;
  const initialState=structuredClone(state);
  const started=Date.now();
  for(let index=0; index<12000 && !state.outcome; index++){
    const seat=Number(state.pendingHandLimit?.playerIndex ?? state.pendingPrompt?.playerIndex ?? state.activePlayer);
    const legal=legalCommandTemplates(state,seat).filter(command=>command.type!=='CONCEDE');
    // Background matches use the shared one-position heuristic, not thousands
    // of speculative reducer calls per action. Actual actions still resolve
    // through the canonical engine, preserving real matches and replay data.
    if(actionTurn!==state.turn){actionTurn=state.turn;actionsThisTurn=0;}
    const context={playerIndex:seat,canonicalState:state};
    const forcedEnd=actionsThisTurn>=24 ? legal.find(command=>command.type==='END_TURN') : null;
    const candidates=legal.map(command=>({command,score:scoreStrategicV3AiCommand(command,state,context)}))
      .sort((a,b)=>b.score-a.score).map(row=>row.command);
    if(forcedEnd)candidates.unshift(forcedEnd);
    actionsThisTurn++;
    await yieldCpu(25);
    let command,result;
    for(const choice of candidates){
      command={type:choice.type,payload:choice.payload||{},matchId:state.matchId,expectedRevision:state.revision,commandId:`simulation:${index}`};
      result=reduceCommand(state,command,{playerId:state.players[seat].id});
      if(result.ok)break;
    }
    if(!result?.ok)throw new Error('Warfront simulation has no accepted action: '+result?.rejection?.code);
    actions.push({playerIndex:seat,command});
    for(const event of result.events||[])if(event.type==='CARD_CONSOLIDATED')consolidations[seat]++;
    state=result.state;
  }
  if(!state.outcome)throw new Error('Warfront simulation did not finish');
  parentPort.postMessage({id:workerData.id,winnerTeam:state.outcome.winner===0?'a':state.outcome.winner===1?'b':null,
    completedAt:Date.now(),simulated:true,simulationKind:'full-match',outcome:state.outcome,
    engineActions:actions,initialState,stats:{durationMs:Date.now()-started},
    playerStats:Object.fromEntries(['a','b'].map((team,seat)=>[team,{
      totalFateGenerated:Number(state.outcome.totalFate?.[seat])||0,
      fateDifferential:Math.max(0,(Number(state.outcome.totalFate?.[seat])||0)-(Number(state.outcome.totalFate?.[1-seat])||0)),
      consolidations:consolidations[seat],durationMs:Date.now()-started
    }]))});
}
