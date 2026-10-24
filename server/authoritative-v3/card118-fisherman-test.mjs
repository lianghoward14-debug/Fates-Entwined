import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
const {cards,byId}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
assert.equal(byId.get('118').name,'Caribbea Fisherman');
assert.equal(byId.get('119').name,'Havano Merchant');
for(const seat of [0,1])for(const empty of [false,true]){
 const setup=()=>{
  const s=createInitialState({matchId:'fish118',seed:'fish118',handSize:1,activePlayer:seat,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:p===seat?['118']:['32','33','34','35']}))});
  if(empty)s.players[1-seat].deck=[];
  return s;
 };
 const s=setup(),source=s.players[seat].hand[0],before=s.players[1-seat].deck.map(c=>c.iid);
 const cmd={commandId:'set',matchId:s.matchId,expectedRevision:s.revision,type:'SET_CARD',payload:{cardIid:source.iid,destination:{z:0,r:seat?0:2,c:0}}};
 const r=reduceCommand(s,cmd,{playerId:'p'+seat});assert(r.ok,JSON.stringify(r.rejection));
 assert.equal(r.state.players[seat].hand.length,empty?0:1);
 assert.equal(r.state.players[1-seat].deck.length,before.length-(empty?0:1));
 assert(!r.state.pendingPrompt);assert(!r.state.statuses.some(x=>x.type==='PERMANENT_DRAW_PHASE_LOCK'));
 assert(!r.events.some(x=>x.type==='DECK_SEARCHED'));
 if(!empty){
  const gained=r.state.players[seat].hand[0];assert(before.includes(gained.iid));assert.equal(gained.controller,seat);
  const again=reduceCommand(setup(),cmd,{playerId:'p'+seat});assert.equal(again.state.players[seat].hand[0].iid,gained.iid);
  assert.deepEqual(r.events.find(x=>x.type==='CARD_TRANSFERRED').privateTo,[seat]);
 }
}
const source=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const start=source.indexOf("  if(id === '118'){");const end=source.indexOf("  if(id === '116')",start);
for(const seat of [0,1]){
 const local={G:{players:[{deck:[{iid:'a'}],hand:[]},{deck:[{iid:'b'},{iid:'c'}],hand:[]}]},deterministicOnlineRandomIndex:()=>0,playSfx(){},renderHand(){}};
 local.addCardToHand=(p,c)=>local.G.players[p].hand.push(c);vm.createContext(local);
 vm.runInContext('async function apply(cp,id){'+source.slice(start,end)+'}',local);
 const before=local.G.players[1-seat].deck.length;await local.apply(seat,'118');
 assert.equal(local.G.players[seat].hand.length,1);assert.equal(local.G.players[seat].hand[0].owner,seat);assert.equal(local.G.players[1-seat].deck.length,before-1);
 local.G.players[1-seat].deck=[];await local.apply(seat,'118');assert.equal(local.G.players[seat].hand.length,1);
}
console.log('118: both seats, deterministic random transfer, empty deck, private arrival, no search/draw lock, and local effect passed.');
