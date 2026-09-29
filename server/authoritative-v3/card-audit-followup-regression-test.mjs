import assert from 'node:assert/strict';
import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';
let seq=0;
function fixture(ids){return E.createInitialState({matchId:'followup'+(++seq),seed:'followup',handSize:99,cardDefinitions:catalog.getCardCatalog().cards,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:[]}]});}
function command(s,type,payload={}){const r=E.reduceCommand(s,{commandId:'c'+(++seq),matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerIndex:s.pendingPrompt?.playerIndex??s.activePlayer});assert(r.ok,JSON.stringify(r.rejection));return r.state;}
function place(s,id,c){const i=s.players[0].hand.findIndex(x=>x.id===id);const card=s.players[0].hand.splice(i,1)[0];s.board[0][2][c]=card;return card;}
// Five global turns including the activation turn.
let s=fixture(['99']);const youth=s.players[0].hand[0];youth.cost=0;
s=command(s,'CONSOLIDATE_CARD',{cardIid:youth.iid,tributeIids:[],destination:{z:0,r:2,c:0}});
for(let i=1;i<=5;i++){s=command(s,'END_TURN');assert.equal(s.statuses.some(x=>x.type==='SUPPORTERS_AS_CHARACTERS'),i<5,'Youth boundary '+i);}
// History is adjusted at trigger time; later Panacea is a separate permanent gain.
s=fixture(['bh02','bh23']);const joie=place(s,'bh02',0);
s.statuses.push({statusId:'abed',type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1});
E.emitRuleEvent({state:s,events:[],ruleEvents:[]},{type:'DRAW_EFFECT_ACTIVATED',playerIndex:0});
assert.equal(joie.counters.triggeredFateHistoryTotal,2);
const militia=s.players[0].hand.find(x=>x.id==='bh23');
s=command(s,'SET_CARD',{cardIid:militia.iid,destination:{z:0,r:2,c:1}});
s=command(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[joie.iid]});
assert.equal(s.board[0][2][1].counters.bh23InheritedFate,2);
assert.equal(s.board[0][2][1].currentFate,5);
// Four owner-turn starts, no earlier delivery and no second search on arrival.
s=fixture(['94','67']);const mail=place(s,'94',0);const delivery=s.players[0].hand.pop();s.players[0].deck.push(delivery);
const ctx={state:s,events:[],ruleEvents:[]};E.applyOperation(ctx,{type:'SCHEDULE_CARD',targetIid:delivery.iid,playerIndex:0,sourceIid:mail.iid,ownerTurns:4});
assert.equal(ctx.events.filter(e=>e.type==='DECK_SEARCHED').length,1);
for(let i=1;i<=8;i++){s=command(s,'END_TURN');assert.equal(s.players[0].hand.some(c=>c.iid===delivery.iid),i===8,'Mail boundary '+i);}
console.log('PASS followup: Youth global duration, adjusted Panacea history and Abed, Mailman eight-turn delivery.');
