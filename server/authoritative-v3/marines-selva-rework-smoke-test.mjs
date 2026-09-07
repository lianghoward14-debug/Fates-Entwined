import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'18',name:'1st US Marines',type:'Supporter',aff:'third_great_war',fate:1,cost:0,rarity:'circle'},
  {id:'bh04',name:'Anicka Konvicka (Selva Island)',type:'Initiator',aff:'eventide',fate:6,cost:4,rarity:'triangle'},
  {id:'fuel',name:'Fuel',type:'Supporter',aff:'eventide',fate:1,cost:0,rarity:'circle'},
  {id:'target',name:'Target',type:'Initiator',aff:'reality',fate:12,cost:1,rarity:'triangle'}
];
let sequence = 0;
function send(state,type,payload){
  return reduceCommand(state,command(state,'p0',++sequence,type,payload),{playerId:'p0'});
}
function take(state,player,id){
  const card = state.players[player].hand.find(entry=>entry.id === id);
  assert(card,`missing ${id}`);
  return card;
}

let state = createInitialState({matchId:'MARINES-UNLIMITED',seed:'marines',handSize:99,cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['18','18','18','18']},{id:'p1',deckIds:['target']}]});
state.baseSupportersPerTurn=5;
const marineSquares = [{z:0,r:2,c:0},{z:0,r:2,c:1},{z:1,r:2,c:0},{z:1,r:2,c:1}];
for(const destination of marineSquares){
  const marine = take(state,0,'18');
  const result = send(state,'SET_CARD',{cardIid:marine.iid,destination});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));
  assert(result.state.statuses.some(status=>status.statusType === 'SUPPORTER_EFFECTS_BLOCKED'));
  assert.equal(result.state.statuses.some(status=>status.ruleKey === 'SEMPER_FIDELIS' || String(status.statusId || '').includes('semper_fidelis')),false);
  assert.equal(result.events.some(event=>event.type === 'EFFECT_SKIPPED' && event.sourceIid === marine.iid),false);
  state = result.state;
}

state = createInitialState({matchId:'SELVA-24',seed:'selva',handSize:99,cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['bh04','fuel','fuel','fuel','fuel']},{id:'p1',deckIds:['target','target','target']}]});
for(const destination of [{z:0,r:2,c:0},{z:0,r:2,c:1},{z:1,r:2,c:0},{z:1,r:2,c:1}]){
  const fuel = take(state,0,'fuel');
  state.players[0].hand.splice(state.players[0].hand.indexOf(fuel),1);
  fuel.controller=0; state.board[destination.z][destination.r][destination.c]=fuel;
}
const targets = [{z:0,r:0,c:0},{z:0,r:0,c:1},{z:0,r:0,c:2}].map(destination=>{
  const card=take(state,1,'target'); state.players[1].hand.splice(state.players[1].hand.indexOf(card),1);
  card.controller=1; state.board[destination.z][destination.r][destination.c]=card; return card;
});
let result = send(state,'CONSOLIDATE_CARD',{cardIid:take(state,0,'bh04').iid,
  tributeIids:state.board.flat(2).filter(card=>card?.id === 'fuel').map(card=>card.iid),destination:{z:0,r:2,c:0}});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
result = send(result.state,'ANSWER_PROMPT',{promptId:result.state.pendingPrompt.promptId,choice:'Initiator'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.deepEqual(targets.map(target=>result.state.board[0].flat().find(card=>card?.iid === target.iid)?.currentFate),[4,4,4]);
const split=result.events.find(event=>event.type === 'SPLIT_FATE_LOSS_RESOLVED');
assert.equal(split.lossEach,8);
assert.equal(split.targetIids.length,3);

const data=fs.readFileSync(new URL('../../src/scripts/01-data-and-state.js',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const helpers=fs.readFileSync(new URL('../../src/scripts/00-structural-helpers.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const online=fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js',import.meta.url),'utf8');
assert.match(data,/id:'18'[\s\S]{0,300}img:'18\.png\?v=20260907-marines'/);
assert.match(data,/id:'bh04'[\s\S]{0,350}lose 24 Fate[\s\S]{0,200}img:'bh4\.png\?v=20260907-selva'/);
assert.match(core,/Math\.round\(24 \/ targets\.length\)[\s\S]*Math\.round\(24 \/ count\)/);
assert.doesNotMatch([data,helpers,ui,online].join('\n'),/usMarinesUses|getUsMarinesUses|canActivateUsMarines|recordUsMarines|Semper Fidelis Uses|activated three times/);
console.log('Marines unlimited-use and Anicka Selva 24-Fate reworks pass in local data/UI and authoritative multiplayer.');
