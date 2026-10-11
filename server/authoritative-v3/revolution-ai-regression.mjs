import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {createRevolutionPrior,revolutionContext,revolutionFutureValue,filterRevolutionTargets} from '../../shared/ai/revolution-heuristics.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
import {chooseCommand} from '../../shared/ai/policy.mjs';
import {warfrontAiDeck} from './warfront-simulation.mjs';
const require=createRequire(import.meta.url),{getDeckCatalog,extractArrayLiteral}=require('../fate-deck-catalog.js');
const defs=require('../fate-card-catalog.js').getCardCatalog().cards,decks=getDeckCatalog().decks;
const ids=['ai_revolutionary_oaf','ai_black_revolution'];
const source=readFileSync(new URL('../../src/scripts/09-challenger-mode.js',import.meta.url),'utf8');
const sandbox={};vm.createContext(sandbox);
vm.runInContext('const STARTER_DECKS='+extractArrayLiteral(source,'STARTER_DECKS')+';const AI_ONLY_RANDOM_DECKS='+extractArrayLiteral(source,'AI_ONLY_RANDOM_DECKS')+';'+source.slice(source.indexOf('function isAIDeckEnabled('),source.indexOf('let _challengerAssetWarmupStarted')),sandbox);
for(const rank of ['Footman','Captain-Officer','High Marshall'])for(const id of ids)assert(sandbox.getAIDeckPoolForOpponent({rank}).some(d=>d.id===id));
const reached=new Set();for(let i=0;i<1000;i++)reached.add(warfrontAiDeck({name:'revolution-test-'+i}).join(','));
for(const id of ids){const d=decks.find(d=>d.id===id);assert.equal(d.ids.length,40);assert(reached.has(d.ids.join(',')));}
function fixture(id,player){const s=createInitialState({matchId:'revolution',seed:'revolution',activePlayer:player,handSize:99,cardDefinitions:defs,players:[0,1].map(p=>({id:'p'+p,deckIds:decks.find(d=>d.id===id).ids}))});for(const p of s.players){p.hand.push(...p.deck);p.deck=[];}return s;}
function place(s,p,id,z=0,c=0){const h=s.players[p].hand,i=h.findIndex(c=>c.id===id);assert(i>=0);const card=h.splice(i,1)[0];s.board[z][p===0?2:0][c]=card;return card;}
const answer=iid=>({type:'ANSWER_PROMPT',payload:{selectedIids:[iid]}});
for(const player of [0,1]){
 let s=fixture(ids[0],player);assert.equal(revolutionContext(s,player).kind,'oaf');
 const jake=place(s,player,'38'),fuel=place(s,player,'32',0,1),un=place(s,player,'09',0,2),howard=place(s,player,'03',0,3);
 jake.currentFate=14;s.pendingPrompt={type:'BOARD_TARGET',sourceIid:jake.iid};
 let rank=createRevolutionPrior(s,player);assert(rank(answer(fuel.iid))>rank(answer(un.iid)),'save double reinforcement when short');
 s.pendingPrompt={type:'BOARD_TARGET',sourceIid:howard.iid};rank=createRevolutionPrior(s,player);assert(rank(answer(jake.iid))>rank(answer(fuel.iid)),'Howard doubles the grown carry');
 const apparition=place(s,player,'80',1,0);howard.counters.effectUses=1;s.pendingPrompt={type:'BOARD_TARGET',sourceIid:apparition.iid};rank=createRevolutionPrior(s,player);assert(rank(answer(howard.iid))>rank(answer(jake.iid)),'recycle spent initiators, preserve Jake');
 s=fixture(ids[1],player);assert.equal(revolutionContext(s,player).kind,'black');const anne=place(s,player,'102');
 s.pendingPrompt={type:'BOARD_DESTINATION',sourceIid:anne.iid};rank=createRevolutionPrior(s,player);
 const trap=(z,r,c)=>({type:'ANSWER_PROMPT',payload:{destinations:[{z,r,c}]}});
 assert(rank(trap(1,player===0?0:2,0))>rank(trap(1,player===0?2:0,0)),'mine enemy placements');
 s.statuses.push({type:'TIMED_PLAYER_STATUS',statusType:'ZONE_ACTIONS_BLOCKED',playerIndex:1-player,zone:1,remainingTargetTurns:1});rank=createRevolutionPrior(s,player);
 assert(rank(trap(2,1,0))>rank(trap(1,1,0)),'do not mine a locked zone');
 const jorge=place(s,player,'105',0,1);s.pendingPrompt={type:'MODAL_CHOICE',sourceIid:jorge.iid};
 const before=createRevolutionPrior(s,player)({type:'ANSWER_PROMPT',payload:{choice:'Dauntless'}});
 s.players[1-player].hand.forEach(c=>c.type='Dauntless');assert.equal(createRevolutionPrior(s,player)({type:'ANSWER_PROMPT',payload:{choice:'Dauntless'}}),before,'declaration ignores hidden hand');
 s.pendingPrompt=null;jorge.counters.jorgeTriggerTurn=s.turn+1;assert(revolutionFutureValue(s,player)>0);s.turn=s.maxTurns;assert.equal(revolutionFutureValue(s,player),0,'no next-turn payoff after final turn');
 // Resolve an actual hidden Anne activation and the AI-selected mine prompt.
 s=fixture(ids[1],player);const a=place(s,player,'102');a.faceDown=true;
 let legal=legalCommandTemplates(s,player),cmd=legal.find(c=>c.type==='ACTIVATE_EFFECT' && c.payload.sourceIid===a.iid);assert(cmd);
 let result=reduceCommand(s,{type:cmd.type,payload:{...cmd.payload,userActivated:true},matchId:s.matchId,expectedRevision:s.revision,commandId:'activate'},{playerIndex:player});assert(result.ok,JSON.stringify(result.rejection));s=result.state;
 legal=legalCommandTemplates(s,player);const limited=filterRevolutionTargets(legal,s,player);assert(limited.length<=12);assert(limited.every(c=>legal.includes(c)));legal=limited;const order=createCommandOrderer(s,player);cmd=legal.sort((a,b)=>order(b)-order(a))[0];assert.equal(cmd.payload.destinations.length,3);
 result=reduceCommand(s,{type:cmd.type,payload:cmd.payload,matchId:s.matchId,expectedRevision:s.revision,commandId:'mines'},{playerIndex:player});assert(result.ok,JSON.stringify(result.rejection));assert.equal(result.state.geometry.squareStatuses.filter(x=>x.type==='HIDDEN_BOMB_TRAP').length,3);
}
console.log('Both decks: all-rank roster, Warfront reachability, carry preservation, recycling, trap placement, hidden-information and final-turn checks passed');
// Exercise actual search and reducer integration on each deck's opening.
for(const id of ids){let s=createInitialState({matchId:id,seed:id,cardDefinitions:defs,players:[{id:'p0',deckIds:decks.find(d=>d.id===id).ids},{id:'p1',deckIds:decks.find(d=>d.id===ids[0]).ids}]});
 for(let n=0;n<8 && !s.outcome;n++){const p=s.pendingPrompt?.playerIndex ?? s.activePlayer;const legal=legalCommandTemplates(s,p);const c=chooseCommand(legal,projectStateForPlayer(s,p),{canonicalState:s,playerIndex:p,samples:1,nodeBudget:60,width:4});assert(c);const r=reduceCommand(s,{type:c.type,payload:{...c.payload,...(c.manualOnly?{userActivated:true}:{})},commandId:String(n),matchId:s.matchId,expectedRevision:s.revision},{playerIndex:p});assert(r.ok,JSON.stringify(r.rejection));s=r.state;}console.log(id+' opening search/reducer passed');}
