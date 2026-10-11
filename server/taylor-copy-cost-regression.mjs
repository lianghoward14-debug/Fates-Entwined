import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../shared/engine/index.mjs';
import catalogModule from './fate-card-catalog.js';
const core=fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const check=core.slice(core.indexOf('function isTaylorCopyAvailable('),core.indexOf('async function resolveTaylorCopiedEffect('));
const sandbox={G:{turn:24}};vm.createContext(sandbox);vm.runInContext(check,sandbox);
for(const cost of [0,1,2,3,4,5,9]) assert.equal(sandbox.isTaylorCopyAvailable({id:'bh07',cost}),cost<4);
assert.equal(sandbox.isTaylorCopyAvailable({id:'bh05',cost:1}),false);
const definitions=[{id:'bh05',type:'Initiator',fate:5,cost:1},{id:'32',type:'Supporter',fate:1,cost:0},
 {id:'bh07',type:'Coordinator',fate:3,cost:3},{id:'23',type:'Coordinator',fate:4,cost:4},{id:'bh08',type:'Coordinator',fate:5,cost:5}];
const state=createInitialState({matchId:'taylor-cost',seed:'taylor-cost',handSize:99,cardDefinitions:definitions,
 players:[{id:'p0',deckIds:definitions.map(c=>c.id)},{id:'p1',deckIds:[]}]});
const tributeIndex=state.players[0].hand.findIndex(c=>c.id==='32');
const tribute=state.players[0].hand.splice(tributeIndex,1)[0];state.board[0][2][0]=tribute;
const taylor=state.players[0].hand.find(c=>c.id==='bh05');
const expensive=state.players[0].hand.find(c=>c.id==='23');
// Cover both hand and deck candidates.
const deckIndex=state.players[0].hand.findIndex(c=>c.id==='bh08');state.players[0].deck.push(state.players[0].hand.splice(deckIndex,1)[0]);
const cmd=(s,n,type,payload)=>({commandId:'p0:'+n,matchId:s.matchId,expectedRevision:s.revision,type,payload});
let result=reduceCommand(state,cmd(state,1,'CONSOLIDATE_CARD',{cardIid:taylor.iid,tributeIids:[tribute.iid],destination:{z:0,r:2,c:0}}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.prompt.type,'CARD_SELECTION');
assert(result.prompt.eligibleCards.some(c=>c.id==='bh07'));
assert(!result.prompt.eligibleCards.some(c=>['23','bh08'].includes(c.id)));
const denied=reduceCommand(result.state,cmd(result.state,2,'ANSWER_PROMPT',{promptId:result.state.pendingPrompt.promptId,selectedIids:[expensive.iid]}),{playerId:'p0'});
assert.equal(denied.ok,false,'Forged cost-4 selection must fail');
const allowed=result.prompt.eligibleCards.find(c=>c.id==='bh07');
result=reduceCommand(result.state,cmd(result.state,3,'ANSWER_PROMPT',{promptId:result.state.pendingPrompt.promptId,selectedIids:[allowed.iid]}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result.rejection));
assert.equal(result.state.board[0][2][0].counters.copiedPassiveId,'bh07');
assert.match(catalogModule.getCardCatalog().byId.get('bh05').effect,/fewer than 4 Reinforcements/);
console.log('Taylor restriction passed: singleplayer cost boundary, multiplayer hand/deck filtering, forged selection rejection, and cost-3 copy resolution.');
