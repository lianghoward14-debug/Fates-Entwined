import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,stableStringify} from '../../shared/engine/index.mjs';
import {assessRecruitment,callToArmsReserveValue} from '../../shared/ai/recruitment-timing.mjs';
import {recruitmentContext} from '../../shared/ai/recruitment-context.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
import {personalityNames} from '../../shared/ai/personality.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
const card=id=>cards.find(c=>c.id===id);
const ready={hand:[card('05'),card('09'),card('32'),card('26')],deck:[card('05'),card('09')],
  ownBoard:[],enemyBoard:[],margins:[0,0,0],placements:2,open:9,turn:1,maxTurns:20};
const score=(id,changes={})=>assessRecruitment(card(id),{...ready,...changes}).score;
let checks=0;
const check=(condition,message)=>{assert(condition,message);checks++;};
check(score('30',{enemyBoard:[card('05')],margins:[-4,-4,0]})>score('30'),'removal needs visible targets');
check(score('30',{enemyBoard:[card('05')],margins:[-4,-4,0],style:'sniper'})>
  score('30',{enemyBoard:[card('05')],margins:[-4,-4,0],style:'balanced'}),'sniper values interaction more');
check(score('32',{hand:[],deck:[card('05')]})>score('32',{hand:[],deck:[]}),'draw requires a remaining deck');
check(score('32',{hand:[],turn:1})>score('32',{hand:[],turn:19}),'draw loses value near the finish');
check(score('32',{drawAvailable:true})<score('32'),'use existing draw access first');
check(score('58',{discard:[card('05'),card('09')]})>score('58',{discard:[]}),'recovery requires spent resources');
check(score('12',{ownBoard:[card('05'),card('09')],enemyBoard:[card('30')]})>score('12'),'protection needs a developed board');
check(score('09',{hand:[card('01')],reinforcement:0})>score('09',{hand:[card('01')],reinforcement:8}),'fuel is worth more when characters are stranded');
check(score('05',{hand:[]})>score('05',{hand:[card('05'),card('05')]}),'avoid duplicate generic supporters');
check(score('05',{placements:0})<score('05'),'exhausted placement allowance discourages recruitment');
check(score('05',{open:0})<score('05'),'board congestion discourages recruitment');
check(score('05',{playable:false,turn:20})<score('05',{playable:false,turn:1}),'unplayable recruits are worse at the finish');
check(score('05',{handLimit:4})<score('05'),'account for forced hand-limit discard');
check(score('03',{missingComboIds:['03']})>score('03'),'missing combo pieces get priority');
check(score('03',{missingComboIds:['03'],style:'combo'})>score('03',{missingComboIds:['03'],style:'balanced'}),'combo personality prioritizes completion');
check(score('05',{margins:[-1,-1,0]})>score('05',{margins:[20,20,20]}),'contest swing zones instead of padding a lead');
check(score('05',{morale:10,incoming:12})>score('05',{morale:200,incoming:0}),'survival pressure creates urgency');
check(callToArmsReserveValue({...ready,drawAvailable:true})>callToArmsReserveValue(ready),'retain call while a draw engine is available');
check(callToArmsReserveValue({...ready,margins:[5,5,0]})>callToArmsReserveValue(ready),'preserve flexible answers while ahead');
check(callToArmsReserveValue({...ready,morale:10,incoming:9})<callToArmsReserveValue(ready),'pressure reduces the value of waiting');
check(callToArmsReserveValue({...ready,turn:19})===0,'do not hoard on the last round');
for(const style of personalityNames){
  const result=assessRecruitment(card('05'),{...ready,style});
  check(Number.isFinite(result.score) && Number.isFinite(result.reserve),`${style} has valid recruitment preferences`);
}
for(const player of [0,1]){
  const s=createInitialState({matchId:'recruitment-nuance',seed:'recruitment-nuance',activePlayer:player,handSize:0,cardDefinitions:cards,
    players:[{id:'a',deckIds:['05','09','32']},{id:'b',deckIds:['05','09','32']}],gameSettings:{healthPressureSeals:true}});
  const before=stableStringify(s),baseline=recruitmentContext(s,player);
  assert.equal(stableStringify(s),before,'context inspection is read-only');
  s.players[1-player].deck.reverse();s.players[1-player].hand=[{...card('01'),iid:'secret'}];
  assert.deepEqual(recruitmentContext(s,player),baseline,'opponent hidden cards do not affect recruitment context');
  const a=assessRecruitment(card('05'),baseline);
  s.players[player].deck.reverse();
  const b=assessRecruitment(card('05'),recruitmentContext(s,player));
  assert.deepEqual(a,b,'own draw order cannot affect decisions');
  const row=player===0?0:2;
  s.board[0][row][0]={...card('05'),iid:'threat',owner:1-player,controller:1-player,baseFate:12,currentFate:12,statuses:[],counters:{}};
  const command={type:'SUPPORT_COMPANY',payload:{ability:'call',category:'remove',cardId:'30'}};
  check(createCommandOrderer(s,player,'sniper')(command)>createCommandOrderer(s,player,'balanced')(command),'personality reaches actual command ranking');
}
console.log(`Recruitment nuance: ${checks} checks passed for deck needs, roles, phase, pressure, capacity, all personalities, hidden information and ordering.`);
