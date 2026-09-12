const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
const when=ai.slice(ai.indexOf('async function aiTriggerWhenSet'),ai.indexOf('// ── Activate useful character effects')>0?ai.indexOf('// ── Activate useful character effects'):ai.indexOf('async function aiActivateEffects'));
const manual=ai.slice(ai.indexOf('async function aiRunEffect'));
const repaired=['04','07','08','13','17','21','43','77','bh22','bh23'];
for(const id of repaired){assert(when.includes("case '"+id+"':"),id+' resolves on set');assert(!manual.includes("case '"+id+"':"),id+' cannot be replayed later');}
(async()=>{
for(const owner of [0,1])for(const id of ['07','13']){
 const card={id,iid:'source',owner,type:'Initiator'};
 const G={currentPlayer:owner,aiPlayer:owner,turn:3,extraSupportsThisTurn:0,players:[{hand:[],deck:[]},{hand:[],deck:[]}],board:[]};
 G.players[owner].deck=Array.from({length:4},(_,i)=>({id:'s'+i,iid:'s'+i,type:'Supporter',fate:i+1}));
 let reactions=0,cinematics=0;
 const ctx={G,window:{},isFaceDownCard:()=>false,hasAuthoritativeWhenSetEffect:()=>true,playEffectActivationCinematic:async()=>{cinematics++},checkReactions:async()=>{reactions++;return true},aiDeckSearchPriority:()=>[],aiPriorityIndex:()=>0,log:()=>{}};
 vm.createContext(ctx);vm.runInContext(when,ctx);
 await ctx.aiTriggerWhenSet(card,0,0,0);
 const count=id==='07'?3:2;
 assert.equal(G.players[owner].hand.length,count);assert.equal(G.players[owner].deck.length,4-count);
 assert.equal(G.extraSupportsThisTurn,id==='07'?2:0);
 if(id==='07')for(const c of G.players[owner].hand)assert.equal(c.currentFate,c.fate+4);
 await ctx.aiTriggerWhenSet(card,0,0,0);
 assert.equal(G.players[owner].hand.length,count);assert.equal(reactions,1);assert.equal(cinematics,1);
}
for(const owner of [0,1]){
 const card={id:'48',iid:'cosmic',owner,type:'Initiator'},deck={id:'d',iid:'d',aff:'expanded_worlds',fate:2},discard={id:'r',iid:'r',aff:'expanded_worlds',fate:3},star={id:'x',iid:'x',aff:'expanded_worlds',rarity:'star',fate:99};
 const G={aiPlayer:owner,currentPlayer:owner,players:[{hand:[],deck:[],discard:[]},{hand:[],deck:[],discard:[]}],board:[[[card]]]};
 Object.assign(G.players[owner],{deck:[deck],discard:[star,discard]});
 const ctx={G,window:{},canUseManualCharacterEffect:c=>!c.effectUsedInitial,isFaceDownCard:()=>false,checkReactions:async()=>true,addCardToHand:(o,c)=>G.players[o].hand.push(c),renderGame:()=>{}};
 vm.createContext(ctx);vm.runInContext(manual,ctx);await ctx.aiRunEffect(card,0,0,0);
 assert.equal(G.players[owner].hand.length,2);assert.equal(G.players[owner].discard[0],star);
 await ctx.aiRunEffect(card,0,0,0);assert.equal(G.players[owner].hand.length,2);
}
console.log('AI When Set routing, Maja/Kirby resolution and replay prevention passed for both seats.');
})().catch(e=>{console.error(e);process.exitCode=1});
