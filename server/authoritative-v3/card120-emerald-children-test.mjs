import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {legalCommandTemplates} from '../../shared/engine/legal-commands.mjs';
const {cards,byId}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
const star=cards.find(c=>c.rarity==='star');
assert.equal(byId.get('120').name,'The Emerald Eyed Children');
for(const seat of [0,1])for(const hasStar of [false,true]){
 let s=createInitialState({matchId:'120',seed:'120',handSize:99,activePlayer:seat,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:p===seat?['120',hasStar?star.id:'32']:['32']}))});
 const card=s.players[seat].hand.find(c=>c.id==='120');
 // Current deck contents must not affect the original-deck condition.
 s.players[seat].deck=[];
 assert.equal(projectStateForPlayer(s,seat).players[seat].hand.find(c=>c.id==='120').emeraldChildrenEligible,!hasStar);
 s.supportersSetThisTurn[seat]=s.baseSupportersPerTurn;
 const available=()=>legalCommandTemplates(s,seat).some(c=>c.type==='SET_CARD'&&c.payload.cardIid===card.iid);
 assert.equal(available(),!hasStar);
 if(hasStar)s.supportersSetThisTurn[seat]=0;
 const before=s.supportersSetThisTurn[seat];let serial=0;
 function run(type,payload){const r=reduceCommand(s,{commandId:String(++serial),matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p'+seat});assert(r.ok,JSON.stringify(r.rejection));s=r.state;return r;}
 const setResult=run('SET_CARD',{cardIid:card.iid,destination:{z:0,r:seat?0:2,c:0}});
 assert.equal(s.supportersSetThisTurn[seat],before+(hasStar?1:0));
 assert.equal(s.pendingPrompt?.title==='Call to Arms',!hasStar);
 if(!hasStar){
  assert(setResult.events.some(event=>event.type==='EFFECT_ACTIVATED'&&event.sourceIid===card.iid));
  assert.equal(s.pendingPrompt.sourceIid,card.iid);
  run('ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,choice:s.pendingPrompt.options[0].value});
  const selected=s.pendingPrompt.eligibleIids[0];
  run('ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[selected]});
  assert(s.players[seat].hand.some(c=>c.id===selected));
 }
}
console.log('120: both seats, original Star eligibility, legal free sets, normal ineligible sets, projected eligibility and Call to Arms passed.');
