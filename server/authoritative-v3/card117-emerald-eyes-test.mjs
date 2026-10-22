import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
const require=createRequire(import.meta.url),cards=require('../fate-card-catalog.js').getCardCatalog().cards;
assert.equal(cards.find(c=>c.id==='116').type,'Supporter');
let s=createInitialState({matchId:'emerald118',seed:'emerald',handSize:1,cardDefinitions:cards,players:[{id:'p0',deckIds:['118',...Array(20).fill('32')]},{id:'p1',deckIds:Array(22).fill('32')}]});
// Put the subject into hand independently of shuffle order.
const p=s.players[0],idx=p.deck.findIndex(c=>c.id==='118');if(idx>=0)p.hand.push(p.deck.splice(idx,1)[0]);
let serial=0;
function command(player,type,payload={}){let r=reduceCommand(s,{commandId:'cmd'+ ++serial,matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p'+player});assert(r.ok,JSON.stringify(r.rejection));s=r.state;return r;}
const card=p.hand.find(c=>c.id==='118');let r=command(0,'SET_CARD',{cardIid:card.iid,destination:{z:0,r:2,c:0}});
assert(s.statuses.some(x=>x.type==='PERMANENT_DRAW_PHASE_LOCK'&&x.playerIndex===0));assert.equal(r.prompt.type,'MODAL_CHOICE');
r=command(0,'ANSWER_PROMPT',{promptId:r.prompt.promptId,choice:r.prompt.options[0].value});const picked=r.prompt.eligibleIids[0];
r=command(0,'ANSWER_PROMPT',{promptId:r.prompt.promptId,selectedIids:[picked]});assert.equal(s.players[0].hand.at(-1).id,picked);
// Removing the source cannot undo the permanent restriction.
s.players[0].discard.push(s.board[0][2][0]);s.board[0][2][0]=null;
for(let i=0;i<3;i++){const enemy=s.players[1].deck.length;command(0,'END_TURN');assert.equal(s.players[1].deck.length,enemy-1);const own=s.players[0].deck.length;r=command(1,'END_TURN');assert.equal(s.players[0].deck.length,own);assert(s.statuses.some(x=>x.type==='PERMANENT_DRAW_PHASE_LOCK'));}
console.log('118: Call to Arms, permanent own draw-phase lock across three turns, source removal, and opponent draws passed.');
const source=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const start=source.indexOf("  if(id === '118'){");const end=source.indexOf("  if(id === '116')",start);
let calls=0;const local={G:{players:[{},{}]},window:{resolveHopliteCallToArms:async()=>{calls++;}}};vm.createContext(local);
vm.runInContext('async function apply(inst,cp,id){'+source.slice(start,end)+'}',local);
await local.apply({},0,'118');assert.equal(calls,1);assert.equal(local.G.players[0]._emeraldDrawPhaseLocked,true);assert.equal(local.G.players[1]._emeraldDrawPhaseLocked,undefined);
assert(source.includes('!moraleDrawSkipped && !G.players[currentPlayer]._emeraldDrawPhaseLocked'));
console.log('118: single-player lock and Call to Arms passed.');
