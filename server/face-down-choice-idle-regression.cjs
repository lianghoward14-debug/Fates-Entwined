const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
(async()=>{
const ui=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
for(const type of ['Supporter','Initiator','Coordinator'])for(const faceDown of [true,false])for(const fate of [true,false]){
 let callbacks={},titles=[],result;
 const c={window:{},closeModal(){},document:{querySelector:s=>({addEventListener:(_,fn)=>callbacks[s.includes('"flip"')?'flip':'activate']=fn})},showModal:(title,html,actions,options)=>{titles.push(title);callbacks={};options.onOpen();}};
 vm.createContext(c);vm.runInContext(ui.slice(ui.indexOf('function showFaceDownEffectChoice(')),c);
 c.window.showFaceDownPlacementChoice({id:'01',type},x=>result={faceDown:false,...x},x=>result={faceDown:true,...x});
 callbacks[faceDown?'activate':'flip']();callbacks[fate?'flip':'activate']();
 if(type==='Coordinator'){assert.equal(result,undefined);callbacks.activate();assert.equal(result.contributesAuras,false);}
 else assert(!titles.includes('Contribute Zone Auras?'));
 assert.equal(result.faceDown,faceDown);assert.equal(result.contributesFate,fate);
}
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const base={type:'CONSOLIDATE_CARD',payload:{cardIid:'one',tributeIids:['two'],destination:{z:0,r:2,c:0},faceDown:true}};
const c={cloneOnlinePlain:x=>JSON.parse(JSON.stringify(x)),phase7CommandKey:x=>JSON.stringify(x),phase7CurrentUiSession:{adapter:{view:()=>({legalCommands:[base]})}}};
vm.createContext(c);vm.runInContext(online.slice(online.indexOf('  function phase7CurrentEquivalentCommand('),online.indexOf('  function phase7DispatchCommandAttempt(')),c);
for(const fate of [true,false])for(const auras of [true,false]){
 const cmd={...base,payload:{...base.payload,contributesFate:fate,contributesAuras:auras}};
 assert.deepEqual(JSON.parse(JSON.stringify(c.phase7CurrentEquivalentCommand(cmd))),cmd);
 assert.equal(c.phase7CurrentEquivalentCommand({...cmd,payload:{...cmd.payload,cardIid:'stale'}}),null);
 assert.equal(c.phase7CurrentEquivalentCommand({...cmd,payload:{...cmd.payload,contributesFate:'invalid'}}),null);
}
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
let waits=[];const game={aiPlayer:1,currentPlayer:1,board:[]};
const cards=Array.from({length:8},(_,i)=>({iid:String(i),id:'26',type:'Supporter',owner:1,effectUsedInitial:true}));
const a={G:game,window:{},getAIDifficultySettings:()=>({mistakeChance:0,skipEffectChance:0}),aiResolveAutomaticBoardEffects:async()=>{},forEachBoardCard:fn=>cards.forEach(card=>fn(card,0,0,0)),isFaceDownCard:()=>false,aiSleep:async ms=>waits.push(ms),AI_VISUAL_PAUSE_EFFECTS:900};
vm.createContext(a);vm.runInContext(ai.slice(ai.indexOf('async function aiActivateEffects('),ai.indexOf('async function aiRunEffect(')),a);
await a.aiActivateEffects();await a.aiActivateEffects();assert.deepEqual(waits,[],'Used supporters must not accumulate idle pauses');
a.triggerCharacterEffect=async card=>{card.effectUsedInitial=true;};cards[0].effectUsedInitial=false;
await a.aiActivateEffects();assert.deepEqual(waits,[900],'A real activation retains pacing');
console.log('PASS Coordinator-only aura prompts, preserved multiplayer retry choices, and no-op AI pacing.');
})().catch(e=>{console.error(e);process.exitCode=1;});
