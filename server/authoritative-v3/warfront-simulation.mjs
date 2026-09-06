import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {createInitialState, legalCommandTemplates, reduceCommand, multiplayerEligibleCardIds} from '../../shared/engine/index.mjs';
import {chooseStrategicV3AiCommand} from '../../src/scripts/authoritative-v3-ai-policy.mjs';
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
    const worker = new Worker(new URL(import.meta.url), {workerData:input});
    const timer = setTimeout(()=>{worker.terminate();reject(new Error('Warfront simulation timed out'));},120000);
    worker.once('message',result=>{clearTimeout(timer);resolve(result);});
    worker.once('error',error=>{clearTimeout(timer);reject(error);});
    worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Warfront simulation exited '+code));});
  });
}

if(!isMainThread){
  let state = createInitialState({matchId:workerData.id, seed:workerData.id,
    landscapeId:workerData.landscapeId, cardDefinitions:getCardCatalog().cards,
    players:['a','b'].map(team=>({id:team,deckIds:warfrontAiDeck()}))});
  const plans=[{},{}], actions=[];
  const started=Date.now();
  for(let index=0; index<12000 && !state.outcome; index++){
    const seat=Number(state.pendingHandLimit?.playerIndex ?? state.pendingPrompt?.playerIndex ?? state.activePlayer);
    const legal=legalCommandTemplates(state,seat).filter(command=>command.type!=='CONCEDE');
    const choice=chooseStrategicV3AiCommand(legal,state,{playerIndex:seat,playerId:state.players[seat].id,canonicalState:state,difficulty:'medium',planningDepth:1,planCache:plans[seat]});
    if(!choice)throw new Error('Warfront simulation has no legal action');
    const command={...choice,matchId:state.matchId,expectedRevision:state.revision,commandId:`simulation:${index}`};
    const result=reduceCommand(state,command,{playerId:state.players[seat].id});
    if(!result.ok)throw new Error('Warfront simulation rejected '+result.rejection?.code);
    actions.push({playerIndex:seat,command});state=result.state;
  }
  if(!state.outcome)throw new Error('Warfront simulation did not finish');
  parentPort.postMessage({id:workerData.id,winnerTeam:state.outcome.winner===0?'a':state.outcome.winner===1?'b':null,
    completedAt:Date.now(),simulated:true,simulationKind:'full-match',outcome:state.outcome,
    engineActions:actions,stats:{durationMs:Date.now()-started},playerStats:{}});
}
