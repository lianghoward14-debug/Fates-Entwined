import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';
const results=[];
for(const seat of [0,1])for(const [targetId,declared] of [['29','Coordinator'],['15','Initiator']]){
 let state=E.createInitialState({matchId:`search-${seat}-${targetId}`,seed:'search',activePlayer:seat,handSize:99,cardDefinitions:catalog.getCardCatalog().cards,players:[0,1].map(p=>({id:'p'+p,deckIds:p===seat?['bh14','bh13','68',targetId]:[]}))});
 let sequence=0;
 const hand=state.players[seat].hand;
 const ids=Object.fromEntries(hand.map(c=>[c.id,c.iid]));
 for(const card of hand)if(['bh14','bh13'].includes(card.id))card.cost=0;
 function run(type,payload){const result=E.reduceCommand(state,{type,payload,commandId:'s'+sequence++,matchId:state.matchId,expectedRevision:state.revision},{playerIndex:seat});if(!result.ok)throw Error(JSON.stringify(result.rejection));state=result.state;}
 function answer(payload){run('ANSWER_PROMPT',{promptId:state.pendingPrompt.promptId,...payload});}
 const row=seat===0?2:0;
 run('CONSOLIDATE_CARD',{cardIid:ids.bh14,tributeIids:[],destination:{z:0,r:row,c:0}});
 answer({choice:declared});answer({selectedIids:[ids[targetId]]});
 run('CONSOLIDATE_CARD',{cardIid:ids.bh13,tributeIids:[],destination:{z:1,r:row,c:0}});
 answer({selectedIids:[ids[targetId]]});
 const changed=E.findCard(state,ids[targetId]);
 run('SET_CARD',{cardIid:ids['68'],destination:{z:2,r:row,c:0}});
 const promptType=state.pendingPrompt?.type||null;
 if(state.pendingPrompt)answer({selectedIids:[ids[targetId]]});
 results.push({seat,targetId,declared,pileBeforeSearch:changed.zone,effectiveType:E.effectiveCardType(state,changed.card),printedType:changed.card.type,promptType,pileAfterSearch:E.findCard(state,ids[targetId]).zone,targetIid:ids[targetId]});
}
fs.writeFileSync('tmp/card-audit-chloe-search-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));

for(const r of results)assert.equal(r.pileAfterSearch,r.declared==="Coordinator"?"hand":"deck",JSON.stringify(r));console.log("Chloe/Hugh/search regression passed in both seats");
