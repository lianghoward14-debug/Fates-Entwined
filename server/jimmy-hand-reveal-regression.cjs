const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8'),start=core.indexOf('async function resolveJimmyHandReset('),end=core.indexOf('\nasync function resolveChaparralCallToArms',start);let opts;
const g={currentPlayer:1,players:[{hand:[{iid:'old'}],discard:[]},{hand:[],discard:[]}]};const ctx={G:g,isTargetImmuneToEffectOwner:()=>false,fatePushDiscard:(p,c)=>g.players[p].discard.push(c),drawCard:async(p,n,o)=>{assert.equal(p,0);assert.equal(n,1);opts=o;},renderEffectResolutionForPlayer:()=>{}};vm.createContext(ctx);vm.runInContext(core.slice(start,end),ctx);await ctx.resolveJimmyHandReset({id:'bh18'},1);assert.equal(opts.sequentialHandReveal,true,'off-turn victim gets reveal-after-draw');
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');const a=online.indexOf('      // A hand reset can replace every IID'),b=online.indexOf('      return applied;',a);assert(a>online.indexOf('applied = phase7CommitCurrentView(view, reason) && applied;'));
for(const applied of [true,false]){const renders=[];const c={applied,events:[{type:'CARD_DRAWN',playerIndex:0}],window:{renderGameImmediate:p=>renders.push(p)}};vm.createContext(c);vm.runInContext(online.slice(a,b),c);assert.equal(renders.length,applied?1:0);if(applied)assert.equal(renders[0].hand,true);}
console.log('Jimmy off-turn sequential reveal and post-commit multiplayer hand refresh passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
