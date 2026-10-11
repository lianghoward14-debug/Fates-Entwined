import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {callToArmsReserveValue,recruitmentDeckFit,assessRecruitment} from '../../shared/ai/recruitment-timing.mjs';
import {evaluatePosition} from '../../shared/ai/position.mjs';
import {personalityFor} from '../../shared/ai/personality.mjs';
import {createInitialState,legalCommandTemplates,projectStateForPlayer,reduceCommand,stableStringify} from '../../shared/engine/index.mjs';
import {planDecision} from '../../shared/ai/policy.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
import {diverseCommands} from '../../shared/ai/search.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
function fixture(player=0,morale=true){
  const state=createInitialState({matchId:'support-ai',seed:'support-ai',activePlayer:player,handSize:0,cardDefinitions:cards,
    players:[{id:'p0',deckIds:[]},{id:'p1',deckIds:[]}],gameSettings:{healthPressureSeals:morale}});
  return state;
}
function decide(state,player){
  return planDecision(legalCommandTemplates(state,player),projectStateForPlayer(state,player),
    {canonicalState:state,playerIndex:player,samples:1,nodeBudget:240,width:6});
}
for(const player of [0,1])for(const morale of [false,true]){
  const state=fixture(player,morale);
  state.cardCatalog=[cards.find(c=>c.id==='05')];
  const before=stableStringify(state);
  const plan=decide(state,player);
  assert.equal(plan.command.type,'SUPPORT_COMPANY','empty-hand AI should recruit a useful card');
  assert.equal(plan.command.payload.ability,'call');
  assert.equal(stableStringify(state),before,'planning must not spend live uses or Morale');
  const result=reduceCommand(state,{...plan.command,matchId:state.matchId,expectedRevision:state.revision,commandId:'recruit'}, {playerIndex:player});
  assert(result.ok,JSON.stringify(result.rejection));
  assert.equal(result.state.supportCompanyUses[player],1);
  assert.equal(result.state.players[player].hand.at(-1).id,plan.command.payload.cardId);
  if(!morale)assert(!legalCommandTemplates(result.state,player).some(c=>c.type==='SUPPORT_COMPANY'));
}
for(const player of [0,1]){
  const state=fixture(player);
  state.supportCompanyUses=[1,1];state.moralePressure.morale[player]=1;
  assert.notEqual(decide(state,player).command.type,'SUPPORT_COMPANY','never pay last Morale');
  state.moralePressure.morale[player]=200;
  assert.notEqual(decide(state,player).command.type,'SUPPORT_COMPANY','do not halve healthy Morale just for a spare card');
}
// A cheap payment and a strong recruit still do not justify spending in a
// safe position. Cover both seats and several Morale levels.
for(const player of [0,1])for(const morale of [4,12,30,60]){
  const state=fixture(player);
  state.supportCompanyUses=[1,1];state.moralePressure.morale[player]=morale;
  state.cardCatalog=[{...cards.find(c=>c.id==='05'),fate:12}];
  assert.notEqual(decide(state,player).command.type,'SUPPORT_COMPANY',
    `save emergency recruitment in a safe position at ${morale} Morale`);
}
// A paid reserve can win the final calculation. Use a small public catalog to
// make the tactical line deterministic and independent of offer shuffling.
for(const player of [0,1]){
  const state=fixture(player);state.turn=state.maxTurns;state.activePlayer=player;state.supportCompanyUses=[1,1];
  state.cardCatalog=[{...cards.find(c=>c.id==='05'),fate:12}];
  const body=(owner,fate,iid)=>({id:'05',iid,owner,controller:owner,type:'Supporter',cost:0,baseFate:fate,currentFate:fate,faceDown:false,statuses:[],counters:{}});
  const row=player===0?2:0,other=2-row;
  state.board[0][row][0]=body(player,10,'own');
  state.board[1][other][0]=body(1-player,5,'enemy1');
  state.board[2][other][0]=body(1-player,5,'enemy2');
  const plan=decide(state,player);
  assert.equal(plan.command.type,'SUPPORT_COMPANY','spend Morale when recruiting enables a winning finish');
  assert.equal(plan.command.payload.ability,'desperate');
  assert(plan.principalVariation.some(s=>s.command.type==='SET_CARD'),'search must deploy the recruited card');
  assert.equal(plan.score,1e6,'recruitment line must actually win');
}
const state=fixture(),rank=createCommandOrderer(state,0);
const offers=legalCommandTemplates(state,0).filter(c=>c.type==='SUPPORT_COMPANY').sort((a,b)=>rank(b)-rank(a));
const retained=diverseCommands([{type:'END_TURN',payload:{}},...offers],6).filter(c=>c.type==='SUPPORT_COMPANY');
assert.equal(retained.length,3);assert.equal(new Set(retained.map(c=>c.payload.cardId)).size,3);
const crowded=Array.from({length:20},(_,i)=>({type:'SET_CARD',payload:{cardIid:`hand-${i}`}}));
const paid={type:'SUPPORT_COMPANY',payload:{ability:'desperate',category:'power',cardId:'05'}};
assert(diverseCommands([{type:'END_TURN',payload:{}},...crowded,paid],6).includes(paid),'a paid rescue must be explored even behind many ordinary moves');
state.pendingPrompt={title:'Call to Arms',playerIndex:0};
const promptRank=createCommandOrderer(state,0);
assert(promptRank({type:'ANSWER_PROMPT',payload:{selectedIid:'05'}})>promptRank({type:'ANSWER_PROMPT',payload:{selectedIid:'01'}}),'prefer deployable free support over stranded expensive card');
// Exercise the local ranking path with an ordinary move valued high enough
// to overwhelm the old cost penalty, then an actual lethal-pressure rescue.
const localSource=readFileSync(new URL('../../src/scripts/07-ai.js',import.meta.url),'utf8');
const rankSource=localSource.slice(localSource.indexOf('function aiRankSupportCompanyOffers('),localSource.indexOf('function aiEvaluateMove('));
const local={G:{aiPlayer:0,players:[{hand:[]}],_moralePressure:{morale:[12]},turn:1,maxTurns:20},
  aiClearZoneScoreCache(){},aiCachedZoneScore:()=>0,aiEvaluateMove:()=>100,
  aiProjectedMoveFate:()=>12,aiIntelligence:()=>({moraleCycleDamage:()=>({incoming:0})})};
local.aiGenerateAllMoves=()=>local.G.players[0].hand.map(card=>({card,z:0}));
vm.createContext(local);vm.runInContext(rankSource,local);
const localOffers=[{card:{id:'05',fate:12}}];
assert.equal(local.aiRankSupportCompanyOffers(localOffers,'desperate',6)[0].score,-Infinity,'local AI refuses ordinary development even with a large heuristic bonus');
assert(local.aiRankSupportCompanyOffers(localOffers,'call',0)[0].score>0,'free recruitment stays available');
local.aiIntelligence=()=>({moraleCycleDamage:own=>({incoming:own[0]>0?0:12})});
assert(local.aiRankSupportCompanyOffers(localOffers,'desperate',6)[0].score>0,'local AI may prevent lethal pressure');
assert.equal(local.G.players[0].hand.length,0,'preview restores the live hand');
const readyHand=Array.from({length:4},(_,i)=>({id:`support-${i}`,type:'Supporter',cost:0,aff:'third_great_war'}));
const heavyDeck=Array.from({length:12},()=>({id:'heavy',type:'Character',cost:4}));
const saved=style=>callToArmsReserveValue({hand:readyHand,deck:readyHand,style});
assert(saved('cautious')>saved('balanced') && saved('balanced')>saved('blitz'),'personality changes the price of spending the free recruit');
assert(callToArmsReserveValue({hand:[readyHand[0],...heavyDeck.slice(0,3)],deck:heavyDeck})<saved('balanced'),'a character-heavy deck short of fuel should recruit sooner');
assert.equal(callToArmsReserveValue({hand:readyHand,turn:20,maxTurns:20}),0,'do not hoard through the final calculation');
assert(recruitmentDeckFit({id:'new',aff:'third_great_war'},readyHand)>recruitmentDeckFit({id:'new',aff:'other'},readyHand),'prefer offers that fit the deck');
for(const player of [0,1]){
  const s=fixture(player);s.players[player].hand=readyHand.map((c,i)=>({...c,iid:`ready-${i}`,owner:player,controller:player,baseFate:2,currentFate:2,statuses:[],counters:{}}));
  const value=style=>evaluatePosition(s,player,personalityFor(style));
  const cautious=value('cautious'),blitz=value('blitz');
  s.supportCompanyUses=[1,1];
  assert(cautious-value('cautious')>blitz-value('blitz'),'search retains the personality-dependent value of an unused call');
  s.supportCompanyUses=[0,0];
  s.cardCatalog=[cards.find(c=>c.id==='05')];
  s.players[player].hand=s.players[player].hand.map(c=>({...c,id:'05'}));
  const opening=planDecision(legalCommandTemplates(s,player),projectStateForPlayer(s,player),
    {canonicalState:s,playerIndex:player,style:'cautious',samples:1,nodeBudget:240,width:6});
  assert.notEqual(opening.command.type,'SUPPORT_COMPANY','a supplied cautious opening should develop its hand before calling');
}
local.window={FateAIRecruitmentTiming:{callToArmsReserveValue,recruitmentDeckFit,assessRecruitment}};
local.G.players[0].hand=readyHand;local.G.players[0].deck=readyHand;
local.G._selectedAI={style:'cautious'};
local.aiIntelligence=()=>({moraleCycleDamage:()=>({incoming:0})});
assert(local.aiRankSupportCompanyOffers(localOffers,'call',0)[0].score<0,'local AI holds the call when the opening hand already has equally good plays');
local.G.players[0].hand=[];local.G.board=Array.from({length:3},()=>Array.from({length:3},()=>[null,null,null]));
const contextOffers=[{card:cards.find(c=>c.id==='30')},{card:cards.find(c=>c.id==='05')}];
assert.equal(local.aiRankSupportCompanyOffers(contextOffers,'call')[0].card.id,'05','local AI prefers development to targetless removal');
local.G.board[0][0][0]={...cards.find(c=>c.id==='05'),owner:1,controller:1};
local.G._selectedAI.style='sniper';
local.aiCachedZoneScore=(z,p)=>p===1?4:0;
assert.equal(local.aiRankSupportCompanyOffers(contextOffers,'call')[0].card.id,'30','local AI shifts to removal when a visible threat appears');
console.log('Support Company AI: both seats, Morale on/off, free recruitment, paid winning line, cost restraint, local emergency checks, distinct offers and triggered choices passed.');

