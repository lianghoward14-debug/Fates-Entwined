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


// Losing control of the linked card immediately removes both halves of the aura.
chosen.controller=1;
assert.equal(effectiveFate(result.state,liveGrenadier),liveGrenadier.currentFate);
assert.equal(effectiveFate(result.state,chosen),chosen.currentFate);
// Force a new declaration resolution with only an opposing matching neighbor.
const enemyState=createInitialState({matchId:'enemy-only',seed:'enemy',handSize:99,cardDefinitions:definitions,
 players:[{id:'p0',deckIds:['44']},{id:'p1',deckIds:['support-a']}]});
const enemy=enemyState.players[1].hand.pop();enemy.controller=1;enemyState.board[0][1][1]=enemy;
const source=enemyState.players[0].hand[0];
let enemyResult=reduceCommand(enemyState,command(enemyState,1,'SET_CARD',{cardIid:source.iid,destination:{z:0,r:2,c:1}}),{playerId:'p0'});
assert.equal(enemyResult.ok,true);
enemyResult=reduceCommand(enemyResult.state,command(enemyResult.state,2,'ANSWER_PROMPT',{promptId:enemyResult.state.pendingPrompt.promptId,choice:'Supporter'}),{playerId:'p0'});
assert.equal(enemyResult.ok,true);
assert.equal(enemyResult.state.board[0][2][1].counters.sovietTargetIid,'');
assert.equal(effectiveFate(enemyResult.state,enemyResult.state.board[0][2][1]),1);
import catalogModule from './fate-card-catalog.js';
const catalog=catalogModule.getCardCatalog();
assert.equal(catalog.byId.get('bh04').cost,3);
assert.equal(catalog.byId.get('bh08').cost,4);
assert.equal(catalog.byId.get('bh08').fate,4);
assert.match(catalog.byId.get('bh08').effect,/gain 2 Fate/);
assert.match(catalog.byId.get('34').effect,/inflict 2 Morale Damage/);
assert.match(catalog.byId.get('44').effect,/adjacent card you control/);
import vm from 'node:vm';
const core=read('src/scripts/05-gameplay-core.js');
const getTarget=core.slice(core.indexOf('function getSovietGrenadierTarget('),core.indexOf('function queueSovietLinkPresentation('));
const friendly={iid:'friend',owner:0,type:'Supporter'};
const hostile={iid:'enemy',owner:1,type:'Supporter'};
const sandbox={getSovietDeclaredType:()=> 'Supporter',getSovietTargetIid:s=>s.target,
 findBoardPositionForCard:()=>({z:0,r:2,c:1}),getAdjacentCards:()=>[{card:friendly},{card:hostile}],cardHasEffectType:(c,t)=>c.type===t};
vm.createContext(sandbox);vm.runInContext(getTarget,sandbox);
assert.equal(sandbox.getSovietGrenadierTarget({owner:0,target:'enemy'}),null);
assert.equal(sandbox.getSovietGrenadierTarget({owner:0,target:'friend'}).card,friendly);
friendly.controller=1;
assert.equal(sandbox.getSovietGrenadierTarget({owner:0,target:'friend'}),null);
for(const name of ['34','44']) assert(fs.readFileSync(new URL(name+'.png',root)).equals(fs.readFileSync(new URL('assets/morale-card-reworks/'+name+'.png',root))));
console.log('October balance regression passed: shared catalog, multiplayer links, control changes, singleplayer links, supplied artwork.');
