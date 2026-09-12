import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,reduceCommand} from '../../shared/engine/index.mjs';
import {archiveArchetype,filterArchiveExpansionTargets,createArchiveExpansionPrior} from '../../shared/ai/archive-expansion-heuristics.mjs';
import {boardEntries} from '../../shared/engine/selectors.mjs';
import {runtimeRuleId} from '../../shared/engine/modifiers.mjs';
import {warfrontAiDeck} from './warfront-simulation.mjs';
const require=createRequire(import.meta.url);
const catalog=require('../fate-card-catalog.js').getCardCatalog();
const decks=require('../fate-deck-catalog.js').getDeckCatalog().decks;
assert.equal(decks.length,16);
const originalRandom=Math.random;
try{decks.forEach((deck,i)=>{assert.equal(deck.ids.length,40);Math.random=()=>(i+.5)/decks.length;assert.deepEqual(warfrontAiDeck(),Array.from(deck.ids));});}finally{Math.random=originalRandom;}
for(const [id,kind] of [['ai_real_estate','estate'],['ai_no_cards_sleeve','sleeve'],['ai_snowball_fight','snowball'],['ai_adjacency_agency','adjacency'],['ai_classic_coordinators','classic']]){
  const d=decks.find(d=>d.id===id);assert(d);assert.equal(archiveArchetype(d.ids.map(id=>catalog.byId.get(id))),kind);
}
function fixture(ids){return createInitialState({matchId:'expansion',seed:'expansion',handSize:99,cardDefinitions:catalog.cards,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:['32']}]});}
function place(s,player,id,z,r,c){const h=s.players[player].hand;const card=h.splice(h.findIndex(x=>x.id===id),1)[0];s.board[z][r][c]=card;return card;}
for(const copyId of ['37','bh05']){
  let s=fixture(['93','93','37','41','84','bh05']);
  s.phase='main';s.pendingPrompt=null;
  const youth=place(s,0,'93',0,2,0);place(s,1,'32',0,0,0);
  if(copyId==='bh05'){
    // Provide ordinary reinforcement without sacrificing the Youth engine.
    const donor=catalog.byId.get('09');
    s.board[1][2][0]={...donor,iid:'test-fuel',owner:0,controller:0,baseFate:1,currentFate:1,counters:{},statuses:[]};
  }
  const shell=s.players[0].hand.find(c=>c.id===copyId);
  let serial=0;
  const run=c=>{const result=reduceCommand(s,{type:c.type,payload:c.payload || {},matchId:s.matchId,commandId:`test:${++serial}`,expectedRevision:s.revision},{playerId:s.players[s.pendingPrompt?.playerIndex??s.activePlayer].id});assert(result.ok,JSON.stringify(result.rejection));s=result.state;};
  const set=legalCommandTemplates(s,0).find(c=>c.payload?.cardIid===shell.iid && c.payload?.destination && !(c.payload?.tributeIids || []).includes(youth.iid));
  assert(set,'copy shell has a legal deployment');run(set);
  const candidates=legalCommandTemplates(s,0);
  const selected=filterArchiveExpansionTargets(candidates,s,0);
  assert(selected.length);assert(selected.every(c=>[c.payload?.targetIid,c.payload?.selectedIid,...(c.payload?.selectedIids || [])].some(i=>i===youth.iid || [...s.players[0].deck,...s.players[0].hand].some(x=>x.iid===i && x.id==='93'))),'copy must select Youth');
  run(selected[0]);
  for(let i=0;i<8 && s.pendingPrompt;i++){
    const seat=s.pendingPrompt.playerIndex,legal=legalCommandTemplates(s,seat);
    run(legal.find(c=>c.payload?.choice==='DECLINE') || legal.find(c=>c.payload?.targetIid) || legal[0]);
  }
  const copied=boardEntries(s).find(e=>e.card.iid===shell.iid);
  assert.equal(runtimeRuleId(copied.card),'93');
  assert(legalCommandTemplates(s,0).some(c=>c.type==='ACTIVATE_EFFECT' && c.payload?.sourceIid===shell.iid),'copied Youth must have repeatable activation');
  run(legalCommandTemplates(s,0).find(c=>c.type==='ACTIVATE_EFFECT' && c.payload?.sourceIid===shell.iid));
  assert(s.pendingPrompt,'copied Youth activation must open its target picker');
}
const s=fixture(['17','04','14','48','49']);const source=place(s,0,'17',0,2,0);
s.pendingPrompt={type:'BOARD_DESTINATION',sourceIid:source.iid,playerIndex:0};
const entries=boardEntries(s),cards=new Map([...s.players[0].hand,...entries.map(e=>e.card)].map(c=>[c.iid,c]));
const prior=createArchiveExpansionPrior(s,0,entries,cards);
assert(prior({type:'ANSWER_PROMPT',payload:{destination:{z:0,r:0,c:1}}})>prior({type:'ANSWER_PROMPT',payload:{destination:{z:0,r:2,c:1}}}));
console.log('Archive expansion: 16 Warfront decks, five recognizers, Youth copies and enemy-space priority passed');
