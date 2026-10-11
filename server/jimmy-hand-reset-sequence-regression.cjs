const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
(async()=>{
for(const owner of [0,1]){
 const old=[{iid:'old-a',owner},{iid:'old-b',owner}],fresh=[{iid:'new-a',owner},{iid:'new-b',owner}];
 const events=[...old.map(card=>({type:'CARD_DISCARDED',cardIid:card.iid,owner,previousZone:'hand',reason:'JIMMY_HAND_RESET',sourceIid:'jimmy'})),
 ...fresh.map(card=>({type:'CARD_DRAWN',cardIid:card.iid,playerIndex:owner,sourceIid:'jimmy'}))];
 const players=[0,1].map(()=>({hand:[],discard:[]}));players[owner].hand=old.slice();
 const g={players};const view={playerIndex:owner,state:{players:structuredClone(players),board:[]},presentationBatch:{id:'test'}};
 view.state.players[owner].hand=fresh;view.state.players[owner].discard=old;
 const calls=[];
 const context={view,events,gameState:()=>g,cloneOnlinePlain:structuredClone,Set,Map,batchId:'test',resultMotionStarted:false,
 phase7FindCardLocation:iid=>{const index=g.players[owner].hand.findIndex(c=>c.iid===iid);return index<0?null:{zone:'hand',playerIndex:owner,index,card:g.players[owner].hand[index]};},
 phase7FindAnyCard:()=>null,phase7PresentationCard:c=>c,
 phase7FindProjectedEntry:(v,iid)=>({card:fresh.find(c=>c.iid===iid)}),
 phase7WaitForPresentationIdle:async()=>calls.push('wait'),phase7RecordPresentationStage:()=>{},
 window:{playSfx:key=>calls.push(key),renderGameImmediate:()=>calls.push('render'),FateV2CardMotionFx:{
 sendHandCardToDiscard:card=>{calls.push('discard:'+card.iid);return true;},
 drawFromPile:(index,p,options)=>{assert.equal(p,owner);assert.equal(options.drawIndex,0);assert.equal(options.drawCount,1);calls.push('normal-draw:'+options.card.iid);return true;}
 }}};
 vm.createContext(context);
 const previewStart=source.indexOf('  function phase7ConsolidationPresentationView(');
 vm.runInContext(source.slice(previewStart,source.indexOf('  function phase7CommitWithConsolidationMotion(',previewStart)),context);
 const preview=context.phase7ConsolidationPresentationView(view,{cardIid:'jimmy'},events);
 assert.deepEqual(preview.state.players[owner].hand,old,'old hand remains during cinematic');
 assert.equal(preview.state.players[owner].discard.length,0,'discards cannot appear early');
 assert.deepEqual(view.state.players[owner].hand,fresh,'final authoritative state is not mutated');
 const start=source.indexOf('    // Hand resets resolve visibly');
 const end=source.indexOf('    const aliTransfers =',start);
 await vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',context);
 assert.equal(calls.filter(c=>c==='jimmyHandShred').length,1);
 assert.ok(calls.indexOf('wait')>calls.indexOf('discard:old-b'));
 assert.ok(calls.indexOf('normal-draw:new-a')>calls.indexOf('wait'));
 assert.equal(calls.filter(c=>c.startsWith('normal-draw:')).length,2);
 assert.equal(g.players[owner].hand.length,0);
}
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const order=[],game={players:[{hand:[],discard:[]},{hand:[{iid:'old'}],discard:[]}]};
const local={G:game,window:{FateActionPresentation:{waitForIdle:async()=>order.push('wait')}},
 isTargetImmuneToEffectOwner:()=>false,fatePushDiscard:(p,c)=>{order.push('discard');game.players[p].discard.push(c);},
 playSfx:key=>order.push(key),drawCard:async()=>order.push('normal-draw'),renderEffectResolutionForPlayer:()=>{}};
vm.createContext(local);
vm.runInContext(core.slice(core.indexOf('async function resolveJimmyHandReset('),core.indexOf('\nasync function resolveChaparralCallToArms')),local);
await local.resolveJimmyHandReset({id:'bh18'},0);
assert.deepEqual(order,['wait','discard','jimmyHandShred','wait','normal-draw']);
console.log('Jimmy hand reset preserves the cinematic hand, then discards with one impact, then uses normal draws for both seats and local play.');
})().catch(error=>{console.error(error);process.exitCode=1;});
