import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';
const definitions=catalog.getCardCatalog().cards;
const functions=[];
for(const file of ['00-structural-helpers.js','05-gameplay-core.js','06-rendering-and-helpers.js']){
 const text=fs.readFileSync('src/scripts/'+file,'utf8');
 for(const match of text.matchAll(/^(?:async )?function \w+\([^]*?^}/gm)) functions.push(match[0]);
}
let serial=0;
const seat=process.argv.includes('--seat1')?1:0;
function scenario(sourceId,targetId,configure=()=>{}){
 const state=E.createInitialState({matchId:'aura'+serial++,seed:'aura',handSize:99,cardDefinitions:definitions,players:[{id:'p0',deckIds:[sourceId,targetId,'57','76']},{id:'p1',deckIds:[]}]});
 const cards=state.players[0].hand.splice(0);
 const take=id=>cards.splice(cards.findIndex(c=>c.id===id),1)[0];
 const source=take(sourceId),target=take(targetId),jeremiah=take('57'),alpine=take('76');
 state.board[0][2][0]=source;state.board[0][2][1]=target;
 configure(state,source,target,jeremiah,alpine);
 // These fixtures represent resolved placement. Card 65 deliberately uses
 // stored 4 in authority and stored 1 plus a derived 3 in the legacy engine.
 if(target.id==='65')target.currentFate=4;
 if(seat===1){
  state.players.reverse();state.activePlayer=1;
  for(const zone of state.board){zone.reverse();for(const row of zone)for(const card of row)if(card){card.owner=1-card.owner;card.controller=1-card.controller;}}
 }
 const legacy=structuredClone(state);
 legacy.currentPlayer=seat;legacy.fateModifiers={};legacy.damageDoneP=[0,0];
 for(const zone of legacy.board)for(const row of zone)for(const card of row)if(card){
  card.fate=card.baseFate;card.aff=card.affiliation;
  if(card.id==='65')card.currentFate=1;
  card._bh14DeclaredType=card.counters?.bh14DeclaredType;
  card._bh14OriginalType=card.counters?.bh14OriginalType;
  card._bh05CopiedPassiveId=card.counters?.copiedEffectId;
  card._declaredAff=card.counters?.declaredAffiliation;
  if(card.counters?.whisperLandscapeToken){card.whisperLandscapeToken=true;card._whisperEffectActivated=true;card._whisperCopiedEffectId=card.counters.copiedEffectId;}
 }
 const context={G:legacy,window:{},console,WHISPER_UNCOPYABLE_COORDINATOR_IDS:new Set(['01','12','bh12'])};
 vm.createContext(context);vm.runInContext(functions.join('\n'),context);
 const targetPosition=E.findBoardCard(state,target.iid);
 const sp=context.getEffectiveFate(legacy.board[targetPosition.z][targetPosition.r][targetPosition.c],targetPosition.z),mp=E.effectiveFate(state,target);
 return {seat,sp,mp,delta:sp-mp,sourceType:source.type,targetType:target.type};
}
const results=[];
function test(name,...args){try{results.push({name,...scenario(...args)});}catch(error){results.push({name,error:error.stack});}}
for(const source of ['01','10','11','19','23','25','59','77','bh07'])for(const target of ['15','24','76']){
 for(const declared of ['', 'Supporter','Coordinator','Dauntless'])test(`${source}/${target} declared ${declared||'unchanged'}`,source,target,(state,s,t)=>{
  if(source==='10'){s.owner=1;s.controller=1;}
  if(source==='77')s.counters.declaredAffiliation=t.affiliation;
  if(declared)t.counters.bh14DeclaredType=declared;
 });
}
test('copied Anne with Jeremiah','bh05','24',(state,s,t,j)=>{s.counters.copiedEffectId='11';state.board[0][1][0]=j;});
test('Whisper Dylan versus opponent immunity','10','15',(state,s,t)=>{state.board[0][2][0]=null;state.board[1][2][0]=s;s.id='whisper17';s.owner=1;s.controller=1;s.counters.whisperLandscapeToken=true;s.counters.copiedEffectId='10';t.statuses.push('IMMUNE_TO_OPPONENT_EFFECTS');t.opponentEffectImmune=true;});
test('Honor Guard counts adjacent ALPINE for Agent-K','25','bh07',(state,s,t,j,a)=>{state.board[0][2][2]=a;});
results.at(-1).expectedWithoutCountingAlpine=3;
test('Anne reclassified Supporter still receives Jeremiah potency','11','24',(state,s,t,j)=>{s.counters.bh14DeclaredType='Supporter';state.board[0][1][0]=j;});
results.at(-1).expectedWithEffectiveSourceType=4;
test('Whisper Dylan with Jeremiah potency','10','15',(state,s,t,j)=>{state.board[0][2][0]=null;state.board[1][2][0]=s;s.id='whisper17';s.owner=1;s.controller=1;s.counters.whisperLandscapeToken=true;s.counters.copiedEffectId='10';j.owner=1;j.controller=1;state.board[1][1][0]=j;});
for(const id of ['01','11','19','23','77'])test('Taylor copying '+id+' with Jeremiah','bh05',id==='19'?'15':'24',(state,s,t,j)=>{s.counters.copiedEffectId=id;if(id==='77')s.counters.declaredAffiliation=t.affiliation;state.board[0][1][0]=j;});
if(true)for(const source of ['01','10','11','19','23','25','59','77','bh07'])for(const definition of definitions){
 const target=String(definition.id);
 for(const mode of ['plain','jeremiah','suppressed','chloe-supporter','chloe-dauntless']){
  if(mode.startsWith('chloe')&&['76','bh01','token1'].includes(target))continue;
  test(`matrix ${source}/${target}/${mode}`,source,target,(state,s,t,j)=>{
   if(source==='10'){s.owner=1;s.controller=1;}
   if(source==='77')s.counters.declaredAffiliation=t.affiliation;
   if(mode==='jeremiah')state.board[0][1][0]=j;
   if(mode==='suppressed')s.statuses.push('EFFECTS_SUPPRESSED');
   if(mode.startsWith('chloe')){t.counters.bh14OriginalType=t.type;t.counters.bh14DeclaredType=mode==='chloe-supporter'?'Supporter':'Dauntless';}
  });
 }
}
fs.writeFileSync(`tmp/card-audit-aura-parity${seat?'-seat1':''}-results.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify({total:results.length,errorCount:results.filter(x=>x.error).length,errors:results.filter(x=>x.error).slice(0,3),mismatchCount:results.filter(x=>x.delta).length,mismatches:results.filter(x=>x.delta).slice(0,20)},null,2));

for(const r of results){assert(!r.error,r.error);assert.equal(r.delta,0,r.name);if(r.expectedWithoutCountingAlpine!==undefined)assert.equal(r.sp,r.expectedWithoutCountingAlpine,r.name);if(r.expectedWithEffectiveSourceType!==undefined)assert.equal(r.sp,r.expectedWithEffectiveSourceType,r.name);}
console.log(`Aura outcome regression passed: ${results.length} cases, seat ${seat}`);
