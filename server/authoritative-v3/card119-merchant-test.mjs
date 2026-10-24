import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {applyOperation} from '../../shared/engine/operations.mjs';
const {cards,byId}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
assert.equal(byId.get('119').type,'Supporter');
for(const seat of [0,1]){
 let s=createInitialState({matchId:'merchant'+seat,seed:'merchant',handSize:1,activePlayer:seat,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:p===seat?['119',...Array(22).fill('32')]:Array(24).fill('32')}))});
 const own=s.players[seat];const index=own.deck.findIndex(c=>c.id==='119');if(index>=0)own.hand.push(own.deck.splice(index,1)[0]);
 const source=own.hand.find(c=>c.id==='119');let n=0;
 const run=(player,type,payload={})=>{const r=reduceCommand(s,{commandId:String(++n),matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerIndex:player});assert(r.ok,JSON.stringify(r.rejection));s=r.state;return r;};
 run(seat,'SET_CARD',{cardIid:source.iid,destination:{z:0,r:seat?0:2,c:0}});
 assert.equal(s.pendingPrompt.title,'Call to Arms');
 run(seat,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,choice:s.pendingPrompt.options[0].value});
 const picked=s.pendingPrompt.eligibleIids[0];run(seat,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[picked]});
 assert(s.players[seat].hand.some(c=>c.id===picked));assert.deepEqual(s.supportCompanyUses,[0,0]);
 for(const viewer of [0,1])assert.equal(projectStateForPlayer(s,viewer).statuses.find(x=>x.type==='MERCHANT_DRAW_DENIAL').remainingDrawPhases,3);
 // This is a resolved cost, independent of the source staying on the board.
 s.players[seat].discard.push(s.board[0][seat?0:2][0]);s.board[0][seat?0:2][0]=null;
 const before=s.players[seat].deck.length;
 applyOperation({state:s,events:[],ruleEvents:[]},{type:'DRAW_CARD',playerIndex:seat,count:1,activatedEffect:true});
 assert.equal(s.players[seat].deck.length,before-1);assert.equal(s.statuses.find(x=>x.type==='MERCHANT_DRAW_DENIAL').remainingDrawPhases,3);
 // Both a second copy and a repeated activation add three, including while debt remains.
 for(const iid of [source.iid+'-second',source.iid])applyOperation({state:s,events:[],ruleEvents:[]},{type:'CREATE_MATCH_STATUS',status:{type:'MERCHANT_DRAW_DENIAL',sourceIid:iid,playerIndex:seat,remainingDrawPhases:3}});
 assert.equal(s.statuses.filter(x=>x.type==='MERCHANT_DRAW_DENIAL').length,1);
 assert.equal(s.statuses.find(x=>x.type==='MERCHANT_DRAW_DENIAL').remainingDrawPhases,9);
 for(let phase=1;phase<=10;phase++){
  const enemy=s.players[1-seat].deck.length;run(seat,'END_TURN');assert.equal(s.players[1-seat].deck.length,enemy-1);
  const ownDeck=s.players[seat].deck.length;const r=run(1-seat,'END_TURN');
  assert.equal(s.players[seat].deck.length,ownDeck-(phase===10?1:0));
  assert.equal(s.statuses.find(x=>x.type==='MERCHANT_DRAW_DENIAL')?.remainingDrawPhases||0,Math.max(0,9-phase));
  if(phase<=9)assert(r.events.some(e=>e.reason==='MERCHANT_DRAW_DENIAL'&&e.remainingDrawPhases===9-phase));
 }
}
const source=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const block=source.slice(source.indexOf("  if(id === '119'){"),source.indexOf("  if(id === '118'){"));
const drawBlock=source.slice(source.indexOf('  // Draw 1 card unless'),source.indexOf('  if(typeof tickCarpathianSpecters'));
const render=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
for(const seat of [0,1]){
 let calls=0,draws=0,notifications=0;
 const ctx={G:{players:[{},{}]},window:{showMerchantDrawSkippedBanner:p=>{assert.equal(p,seat);notifications++;},location:{search:''},resolveHopliteCallToArms:async()=>calls++},URLSearchParams,log(){},toast(){},drawCard:async()=>draws++,getStatusEffectIcon:x=>x};
 vm.createContext(ctx);vm.runInContext('async function set(cp,id){const inst={};'+block+'}\nasync function phase(currentPlayer){'+drawBlock+'}\n'+render.slice(render.indexOf('function getMerchantStatusBanners'),render.indexOf('function getSaboteurStatusBanner')),ctx);
 await ctx.set(seat,'119');assert.equal(calls,1);assert.equal(ctx.getMerchantStatusBanners(ctx.G).length,1);
 await ctx.set(seat,'119');assert.equal(ctx.G.players[seat]._merchantDrawPhases,6);
 for(let i=0;i<6;i++){await ctx.phase(seat);assert.equal(draws,0);assert.equal(ctx.G.players[seat]._merchantDrawPhases,5-i);}
 assert.equal(notifications,6);
 assert.equal(ctx.getMerchantStatusBanners(ctx.G).length,0);await ctx.phase(seat);assert.equal(draws,1);
 ctx.G._phase7CurrentMultiplayer=true;ctx.G._phase7Statuses=[{type:'MERCHANT_DRAW_DENIAL',playerIndex:seat,remainingDrawPhases:2}];
 assert(ctx.getMerchantStatusBanners(ctx.G)[0].cardEffect.includes('2 Draw Phase'));
}
console.log('119: free Call to Arms, both seats, stacked copies/retriggers add nine own Draw Phases, tenth draw resumes, opponent/effect draws unaffected, source removal, local parity and status countdown passed.');
