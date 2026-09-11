import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState} from '../../shared/engine/state.mjs';
import {filterAiTargets} from '../../shared/ai/targeting.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
function fixture(ids){
  const s=createInitialState({matchId:'combo',seed:'combo',handSize:99,cardDefinitions:definitions,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:['32']}]});
  s.turn=8;s.phase='MAIN';s.pendingPrompt=null;
  return s;
}
function place(s,id,z=0,r=0,c=0){const h=s.players[0].hand;const card=h.splice(h.findIndex(x=>x.id===id),1)[0];s.board[z][r][c]=card;return card;}
const end={type:'END_TURN',payload:{}};
function move(s,id,z=0){return {type:'CONSOLIDATE_CARD',payload:{cardIid:s.players[0].hand.find(c=>c.id===id).iid,destination:{z,r:0,c:3}}};}
const s=fixture(['87','bh19','bh06','07','bh24','80',...Array(6).fill('32')]);
for(let i=0;i<6;i++)place(s,'32',Math.floor(i/3),0,i%3);
const abed=move(s,'bh19'),uke=move(s,'87'),achille=move(s,'bh06');
assert.deepEqual(filterAiTargets([abed,uke,achille,end],s,0),[abed,end]);
s.statuses.push({type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1});
assert.deepEqual(filterAiTargets([abed,uke,achille,end],s,0),[uke]);
s.statuses.push({type:'CONSOLIDATION_FATE_BONUS',playerIndex:0});
assert.deepEqual(filterAiTargets([abed,uke,achille,end],s,0),[achille]);
const token={type:'SET_ADAPTIVE_TOKEN',payload:{placementType:'CONSOLIDATED',declaredType:'Initiator'}};
assert.deepEqual(filterAiTargets([token,end],s,0),[token]);
const p=fixture(['89','84','bh19','03','32','32']);
place(p,'89');place(p,'32',1,0,0);place(p,'32',1,0,1);
const howard=move(p,'03'),wrongZone=move(p,'03',1);
assert.deepEqual(filterAiTargets([howard,wrongZone,end],p,0),[end]);
p.statuses.push({type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1});
assert.deepEqual(filterAiTargets([howard,wrongZone,end],p,0),[howard]);
console.log('Public combo sequencing regressions passed');
