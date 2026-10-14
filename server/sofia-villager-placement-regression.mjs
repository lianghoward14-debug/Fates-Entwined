import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
function fn(text,name){const a=text.indexOf('function '+name+'(');assert(a>=0,name);const open=text.indexOf('{',text.indexOf(')',a));let level=1,i=open+1;for(;level;i++){if(text[i]==='{')level++;if(text[i]==='}')level--;}return (text.slice(Math.max(0,a-6),a)==='async '?'async ':'')+text.slice(a,i);}
const timing=source.slice(source.indexOf('const INITIAL_SET_INITIATOR_IDS'),source.indexOf('function whenSetEffectsAreDeferred'));
for(const seat of [0,1])for(const id of ['108','111']){
const card={id,type:id==='108'?'Initiator':'Supporter',owner:seat};const players=[{hand:[{id:'old',iid:'old'}],deck:[],discard:[]},{hand:[{id:'old',iid:'old'}],deck:[],discard:[]}];players[1-seat].originalDeckIds=Array(8).fill('01');let picked=0;
const ctx=vm.createContext({window:{},G:{currentPlayer:seat,players,_suppressEffectPrompt:true},CARDS:[{id:'01'}],shuffle:a=>a,createCardInstance:(d,owner)=>({...d,owner}),drawCard:async(p,n)=>players[p].hand.push(...players[p].deck.splice(0,n)),fatePushDiscard:(p,c)=>players[p].discard.push(c),markInitialEffectResolved:c=>{c.effectUsedInitial=true;},resolveVillagerLandscapeChoice:async()=>{picked++;},card});
vm.runInContext(timing+'\n'+fn(source,'resolveSofiaOriginalDeck')+'\n'+fn(source,'_executeWhenSetSwitch'),ctx);
assert.equal(ctx.hasAuthoritativeWhenSetEffect(card),true,'card must pass automatic placement gate');
await ctx._executeWhenSetSwitch(card,0,2,0,seat,1-seat,id);
if(id==='108'){assert.equal(players[seat].hand.length,6);assert.equal(players[seat].deck.length,2);assert.equal(players[seat].discard.length,1);assert(card.effectUsedInitial);assert(vm.runInContext("INITIAL_SET_INITIATOR_IDS.has('108')",ctx));}else assert.equal(picked,1);
}
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');assert.match(ai,/case '108': await resolveSofiaOriginalDeck\(inst, cp\)/);assert.match(ai,/case '111':\s*case '82':/);
console.log('Browser on-set gate and dispatch passed for Sofia and Villager, both seats; Sofia draw and spent state, Villager picker, and AI routing.');
