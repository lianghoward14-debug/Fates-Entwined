import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
const {cards,byId}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
assert.equal(byId.get('103').cost,1);
for(const seat of [0,1])for(const amount of [0,15,45,195]){
 let s=createInitialState({matchId:'payment',seed:'payment',handSize:99,activePlayer:seat,cardDefinitions:cards,gameSettings:{healthPressureSeals:true},players:[0,1].map(p=>({id:'p'+p,deckIds:['103','32',...Array(20).fill('32')]}))});
 s.players[seat].hand.push(...s.players[seat].deck.splice(0));
 const source=s.players[seat].hand.find(c=>c.id==='103');
 s.players[seat].deck=s.players[seat].hand.filter(c=>c.id==='32').slice(1);s.players[seat].hand=s.players[seat].hand.filter(c=>c.id==='103'||!s.players[seat].deck.includes(c));
 const tribute=s.players[seat].hand.find(c=>c.id==='32');s.players[seat].hand=s.players[seat].hand.filter(c=>c!==tribute);s.board[0][seat?0:2][0]=tribute;
 let serial=0;function run(type,payload){const r=reduceCommand(s,{commandId:String(++serial),matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p'+seat});assert(r.ok,JSON.stringify(r.rejection));if(type==='CONSOLIDATE_CARD'&&!r.state.pendingPrompt)console.log(JSON.stringify(r.events));s=r.state;return r;}
 run('CONSOLIDATE_CARD',{cardIid:source.iid,tributeIids:[tribute.iid],destination:{z:0,r:seat?0:2,c:0}});
 assert.equal(s.pendingPrompt.local,'moralePayment');assert.equal(s.pendingPrompt.title,'Sangre Por Victoria');
 assert(!s.pendingPrompt.options.some(x=>Number(x.value)>200));
 const before=s.players[seat].hand.length,deck=s.players[seat].deck.length;
 const bad=reduceCommand(s,{commandId:'bad',matchId:s.matchId,expectedRevision:s.revision,type:'ANSWER_PROMPT',payload:{promptId:s.pendingPrompt.promptId,choice:'16'}},{playerId:'p'+seat});assert(!bad.ok);
 run('ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,choice:String(amount)});
 assert.equal(s.moralePressure.morale[seat],200-amount);assert.equal(s.players[seat].hand.length,before+amount/15);assert.equal(s.players[seat].deck.length,deck-amount/15);
 assert.equal(s.board[0][seat?0:2][0].id,'103');
}
console.log('Santiago: both seats, 0/15/45/195 payment, exact draws, invalid amounts and new Reinforcement cost passed.');
const source=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const start=source.indexOf("    case '103': {",source.indexOf("    case '103': {")-1),end=source.indexOf("    case 'bh19':",start);
for(const seat of [0,1])for(const waived of [false,true])for(const amount of [0,15,45]){
 const drawn=[];const local={G:{_moralePressure:{morale:[200,200]}},window:{},showSangrePorVictoriaMoralePicker:(p,yes)=>yes(amount),isLandscapeActive:()=>waived,drawCard:async(p,n)=>drawn.push([p,n]),markInitialEffectResolved(){}};
 vm.createContext(local);vm.runInContext("async function apply(cp){const card={iid:'s'};switch('103'){"+source.slice(start,end)+'}}',local);
 await local.apply(seat);assert.equal(local.G._moralePressure.morale[seat],200-(waived?0:amount));assert.equal(drawn.reduce((n,x)=>n+x[1],0),waived?0:amount/15);
}
console.log('Santiago local: both seats, cancellation, payment, draws and waived-cost parity passed.');
