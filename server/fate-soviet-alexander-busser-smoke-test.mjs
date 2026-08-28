import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInitialState, effectiveFate, reduceCommand} from '../shared/engine/index.mjs';

const root = new URL('../', import.meta.url);
const read = relative=>fs.readFileSync(new URL(relative, root), 'utf8');
const definitions = [
  {id:'44',name:'Soviet Grenadiers',type:'Supporter',aff:'third_great_war',fate:1,cost:0,rarity:'circle'},
  {id:'support-a',name:'Support A',type:'Supporter',aff:'reality',fate:2,cost:0,rarity:'circle'},
  {id:'support-b',name:'Support B',type:'Supporter',aff:'eventide',fate:4,cost:0,rarity:'circle'},
  {id:'35',name:'Alexander the Magnificient',type:'Dauntless',aff:'third_great_war',fate:12,cost:3,rarity:'triangle'}
];
const state=createInitialState({
  matchId:'SOVIET-REWORK',seed:'soviet-rework-seed',handSize:99,cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['44','support-a','support-b','35']},{id:'p1',deckIds:[]}]
});
const take=id=>{
  const index=state.players[0].hand.findIndex(card=>card.id===id);
  assert(index>=0,`missing ${id}`);
  return state.players[0].hand.splice(index,1)[0];
};
const left=take('support-a');left.controller=0;state.board[0][2][0]=left;
const right=take('support-b');right.controller=0;state.board[0][2][2]=right;
const grenadier=state.players[0].hand.find(card=>card.id==='44');
const command=(current,number,type,payload)=>({commandId:`p0:${number}`,matchId:current.matchId,expectedRevision:current.revision,type,payload});
let result=reduceCommand(state,command(state,1,'SET_CARD',{cardIid:grenadier.iid,destination:{z:0,r:2,c:1}}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection||result));
assert.equal(result.prompt?.type,'MODAL_CHOICE');
assert.deepEqual(result.prompt.options.map(option=>option.value),['Supporter','Initiator','Improvisor','Coordinator','Dauntless']);
result=reduceCommand(result.state,command(result.state,2,'ANSWER_PROMPT',{promptId:result.state.pendingPrompt.promptId,choice:'Supporter'}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection||result));
const liveGrenadier=result.state.board[0][2][1];
const chosenIid=String(liveGrenadier.counters.sovietTargetIid||'');
assert([String(left.iid),String(right.iid)].includes(chosenIid));
const chosen=result.state.board[0][2].find(card=>String(card?.iid||'')===chosenIid);
const unchosen=result.state.board[0][2].find(card=>card&&card.id.startsWith('support-')&&String(card.iid)!==chosenIid);
assert.equal(effectiveFate(result.state,{zone:'board',card:liveGrenadier,z:0,r:2,c:1}),4);
assert.equal(effectiveFate(result.state,{zone:'board',card:chosen,z:0,r:2,c:result.state.board[0][2].indexOf(chosen)}),chosen.currentFate+3);
assert.equal(effectiveFate(result.state,{zone:'board',card:unchosen,z:0,r:2,c:result.state.board[0][2].indexOf(unchosen)}),unchosen.currentFate);
assert(result.events.some(event=>event.type==='SOVIET_GRENADIERS_TARGET_LINKED'&&String(event.targetIid)===chosenIid));

const data=read('src/scripts/01-data-and-state.js');
const reworks=read('src/scripts/01a-pressure-card-reworks.js');
const core=read('src/scripts/05-gameplay-core.js');
const moraleUi=read('src/scripts/27-morale-pressure-ui.js');
const triggers=read('shared/engine/triggers.mjs');
assert.match(data,/id:'35'[\s\S]{0,180}fate:12,cost:3[\s\S]{0,180}half of this card\\'s total Fate/);
assert.match(data,/id:'44'[\s\S]{0,260}declare a card type[\s\S]{0,200}max 1 target/);
assert.doesNotMatch(reworks,/Morale Damage equal to the number of Dauntless cards/);
assert.match(core,/function showSovietTypeDeclarationPicker[\s\S]*soviet-type-picker-modal/);
assert.match(core,/scheduleBusserInitiatorOverlayAfterResolution[\s\S]{0,900}flashCardEffect\(initiator,'breakfast_republic_busser'/);
assert.match(triggers,/overlayTargetIid:event\.sourceIid[\s\S]{0,140}BUSSER_INITIATOR_MORALE/);
assert.match(moraleUi,/findMoraleOverlaySource\(event&&\(event\.overlayTargetIid\|\|event\.sourceIid\)\)/);

const root44=fs.readFileSync(new URL('44.png',root));
const rework44=fs.readFileSync(new URL('assets/morale-card-reworks/44.png',root));
assert(root44.equals(rework44),'Soviet root and Morale-rework art must be identical');
assert(fs.statSync(new URL('optimized/card-thumbs/44.jpg',root)).size>10000,'Soviet thumbnail must be regenerated');

console.log('Soviet Grenadiers, Alexander, and Busser smoke test passed');
