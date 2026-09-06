import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {createInitialState, legalCommandTemplates, projectStateForPlayer, reduceCommand, stableStringify} from '../../shared/engine/index.mjs';
import {chooseStrategicV3AiCommand, planStrategicV3AiTurn, evaluateAiCounterplay, selectDiverseAiCommands, scoreStrategicV3AiCommand} from '../../src/scripts/authoritative-v3-ai-policy.mjs';

const require = createRequire(import.meta.url);
const definitions = require('../fate-card-catalog.js').getCardCatalog().cards;
let serial = 0;
function fixture(decks, options = {}){
  return createInitialState({matchId:'ai-benchmark', seed:'ai-benchmark-fixed', handSize:12,
    cardDefinitions:definitions, players:decks.map((deckIds,i)=>({id:`p${i}`,deckIds})), ...options});
}
function place(state, player, id, z, c=0){
  const hand = state.players[player].hand;
  const index = hand.findIndex(card=>card.id === id);
  assert(index >= 0);
  const card = hand.splice(index,1)[0];
  state.board[z][player === 0 ? 2 : 0][c] = card;
  return card;
}
function apply(state, actor, command){
  const result = reduceCommand(state,{type:command.type,payload:command.payload || {},commandId:`benchmark:${++serial}`,
    matchId:state.matchId,expectedRevision:state.revision},{playerId:state.players[actor].id});
  assert(result.ok, JSON.stringify(result.rejection));
  return result.state;
}
function plan(state, player=state.activePlayer){
  return planStrategicV3AiTurn(legalCommandTemplates(state,player),projectStateForPlayer(state,player),
    {canonicalState:state,playerIndex:player,difficulty:'hard',onPlanEvaluated:process.env.AI_BENCH_DEBUG ? console.log : undefined});
}
const rows = [];
function check(name, run){
  const start = performance.now();
  run();
  rows.push({scenario:name,passed:true,ms:Math.round(performance.now()-start)});
}

check('Setup survives competing placements',()=>{
  const ranked = Array.from({length:20},(_,z)=>({type:'SET_CARD',payload:{cardIid:'high',destination:{z}}}));
  ranked.push({type:'SET_CARD',payload:{cardIid:'setup'}});
  assert(selectDiverseAiCommands(ranked,4).some(c=>c.payload.cardIid === 'setup'));
});
check('Immediate lethal and resource conservation',()=>{
  let state = fixture([['05','05','05'],['05']],{turn:4,gameSettings:{healthPressureSeals:true}});
  state.turn = 4;
  place(state,0,'05',0).currentFate = 30;
  state.moralePressure.morale[1] = 1;
  const result = plan(state);
  assert.equal(result.command.type,'END_TURN','take guaranteed lethal without spending additional cards');
  for(const command of result.sequence) state = apply(state,0,command);
  assert.equal(state.outcome?.winner,0,'planner must finish a won position');
});
check('Visible reaction is searched and hidden hand is not consulted',()=>{
  let state = fixture([['56','57','76','05'],['27','05'] ],{activePlayer:1});
  place(state,0,'56',0);
  place(state,0,'57',0,1);
  place(state,0,'76',0,2);
  const source = place(state,1,'27',1);
  state = apply(state,1,{type:'ACTIVATE_EFFECT',payload:{sourceIid:source.iid}});
  assert.equal(state.pendingPrompt?.type,'REACTION');
  const snapshot = stableStringify(state);
  const response = evaluateAiCounterplay(state,1,{difficulty:'hard'});
  assert(response.simulations > 1,'must explore reaction choices');
  const changed = structuredClone(state);
  changed.players[0].hand = changed.players[0].hand.map(c=>({...c,id:'01',currentFate:999}));
  assert.equal(evaluateAiCounterplay(changed,1,{difficulty:'hard'}).score,response.score);
  assert.equal(stableStringify(state),snapshot,'search must not change live state');
});
check('Supporter setup precedes consolidation payoff',()=>{
  let state = fixture([['47','67'],['05']]);
  state.turn = 5;
  const result = plan(state);
  const setup = result.sequence.findIndex(c=>c.type === 'SET_CARD');
  const payoff = result.sequence.findIndex(c=>c.type === 'CONSOLIDATE_CARD');
  assert(setup >= 0 && payoff > setup,'develop reinforcement before spending it');
  for(const command of result.sequence) state=apply(state,0,command);
  const payoffCard = state.board.flat(3).find(c=>c?.id === '67');
  assert(payoffCard && payoffCard.currentFate >= 4,'setup must produce the stronger board card');
});
check('Avoid incoming lethal using South Wind protection',()=>{
  let state = fixture([['20','05'],['05']],{gameSettings:{healthPressureSeals:true}});
  state.turn = 3;
  const shield = place(state,0,'20',0);
  place(state,1,'05',1).currentFate = 40;
  state.moralePressure.morale[0] = 1;
  const result = plan(state);
  assert(result.sequence.some(c=>c.type === 'ACTIVATE_EFFECT' && c.payload.sourceIid === shield.iid),
    'must activate available protection before lethal cycle');
  for(const command of result.sequence) state = apply(state,0,command);
  assert.notEqual(state.outcome?.winner,1);
});

// Optional paired-seat matches compare the planner with its greedy scoring
// baseline. A timeout is reported separately, never counted as a win or draw.
const gameArg = process.argv.indexOf('--games');
const requested = gameArg < 0 ? 0 : 2*Math.ceil(Math.max(2,Math.min(40,Number(process.argv[gameArg+1]) || 2))/2);
const matches = [];
const decks = [ ['05','05','20','32','47','27','56','34'], ['76','76','20','32','47','39','67','01'], ['47','47','32','20','67','27','56','01'] ];
for(let game=0;game<requested;game++){
  const plannerSeat = game%2;
  const matchup = Math.floor(game/2)%(decks.length-1);
  const pair = [decks[matchup],decks[matchup+1]];
  let state = fixture(plannerSeat === 0 ? pair : [...pair].reverse(),{seed:`paired:${Math.floor(game/2)}`,maxTurns:8,gameSettings:{zoneControlRework:false}});
  const caches = [{},{}];
  let commands = 0;
  let turnCommands = 0;
  let previousTurn = state.turn;
  const start = performance.now();
  while(!state.outcome && commands < 200){
    if(state.turn !== previousTurn){turnCommands=0;previousTurn=state.turn;}
    const actor = Number(state.pendingPrompt?.playerIndex ?? state.pendingHandLimit?.playerIndex ?? state.activePlayer);
    const view = projectStateForPlayer(state,actor);
    const legal = legalCommandTemplates(state,actor).filter(c=>c.type !== 'CONCEDE');
    if(!legal.length) break;
    const context = {canonicalState:state,playerIndex:actor,difficulty:'medium',planCache:caches[actor]};
    const forcedEnd = turnCommands >= 10 && legal.find(c=>c.type === 'END_TURN');
    const choice = forcedEnd || (actor === plannerSeat
      ? chooseStrategicV3AiCommand(legal,view,context)
      : [...legal].sort((a,b)=>scoreStrategicV3AiCommand(b,view,context)-scoreStrategicV3AiCommand(a,view,context))[0]);
    state=apply(state,actor,choice); commands++;turnCommands++;
  }
  matches.push({game,matchup,plannerSeat,commands,outcome:state.outcome || 'TIMEOUT',ms:Math.round(performance.now()-start)});
}
console.log(JSON.stringify({tactics:rows,matches},null,2));
