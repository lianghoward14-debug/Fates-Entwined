const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8'),ui=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const arrival=core.slice(core.indexOf('async function resolveJorgeConsolidationArrival('),core.indexOf('async function triggerWhenSet('));
const tracker=ui.slice(ui.indexOf('function buildCardDetailTrackerHTML('),ui.indexOf('\nfunction ',ui.indexOf('function buildCardDetailTrackerHTML(')+10));
(async()=>{
for(const owner of [0,1])for(const hidden of [false,true]){
 let calls=0;const source={id:'105',owner,_jorgeDeclaredType:'Improvisor',_jorgeTriggerTurn:4},card={id:'06',type:'Improvisor',owner:1-owner,faceDown:hidden,_wasConsolidated:true};
 const sandbox={G:{turn:4,board:[[[source,card]]]},window:{resolveHopliteCallToArms:async(s,p)=>{assert.equal(s,source);assert.equal(p,owner);calls++}}};vm.createContext(sandbox);vm.runInContext(arrival,sandbox);
 await sandbox.resolveJorgeConsolidationArrival(card);assert.equal(calls,1);await sandbox.resolveJorgeConsolidationArrival(card);assert.equal(calls,1);assert.equal(source._jorgeDeclaredType,undefined);
 for(const overrides of [{_wasConsolidated:false},{type:'Coordinator'},{owner},{_jorgeArrivalObserved:true}]){source._jorgeDeclaredType='Improvisor';source._jorgeTriggerTurn=4;await sandbox.resolveJorgeConsolidationArrival({...card,_jorgeArrivalObserved:false,...overrides});assert.equal(calls,1);}
 source._jorgeTriggerTurn=3;await sandbox.resolveJorgeConsolidationArrival({...card,_jorgeArrivalObserved:false});assert.equal(calls,1);
 source._jorgeTriggerTurn=4;source.statuses=['EFFECTS_SUPPRESSED'];await sandbox.resolveJorgeConsolidationArrival({...card,_jorgeArrivalObserved:false});assert.equal(calls,1);
}
for(const changeMatch of [false,true]){
 let release,calls=0,active=true,polls=0;
 const source={id:'105',owner:0,_jorgeDeclaredType:'Initiator',_jorgeTriggerTurn:4};
 const card={id:'06',type:'Initiator',owner:1,_wasConsolidated:true};
 const sandbox={G:{turn:4,board:[[[source,card]]]},window:{resolveHopliteCallToArms:async()=>{assert.equal(active,false);calls++;}},
  waitForEffectPresentationBeforeChoice:()=>new Promise(resolve=>{release=resolve;}),
  getInteractionAnimationDelayMs:()=>0,consolidationCinematicIsActive:()=>active,
  setTimeout:callback=>{assert.equal(calls,0);polls++;active=false;queueMicrotask(callback);}};
 vm.createContext(sandbox);vm.runInContext(arrival,sandbox);
 const pending=sandbox.resolveJorgeConsolidationArrival(card);
 assert.equal(calls,0,'Jorge must wait for the consolidation presentation');
 await sandbox.resolveJorgeConsolidationArrival(card);assert.equal(calls,0,'Repeated arrival must not bypass the wait');
 if(changeMatch)sandbox.G={};
 release();await pending;
 assert.equal(calls,changeMatch?0:1);assert.equal(polls,changeMatch?0:1);
}
// A queued banner must hold the prompt even after the active cinematic ends.
{
 let polls=0,calls=0;
 const source={id:'105',owner:0,_jorgeDeclaredType:'Initiator',_jorgeTriggerTurn:4};
 const card={id:'06',owner:1,type:'Initiator',_wasConsolidated:true};
 const sandbox={G:{turn:4,board:[[[source,card]]]},window:{resolveHopliteCallToArms:async()=>{assert.equal(polls,3);calls++;}},
  getInteractionAnimationDelayMs:()=>0,consolidationCinematicIsActive:()=>false,
  getChoicePresentationDelayMs:()=>polls<3?80:0,
  setTimeout:callback=>{polls++;queueMicrotask(callback);}};
 vm.createContext(sandbox);vm.runInContext(arrival,sandbox);
 await sandbox.resolveJorgeConsolidationArrival(card);assert.equal(calls,1);
}
const choiceDelay=ui.slice(ui.indexOf('function getChoicePresentationDelayMs('),ui.indexOf('function deferPickerUntilAnimationFinishes('));
{
 const sandbox={G:{},window:{},Date,getInteractionAnimationDelayMs:()=>0,effectActivationPredecessorRemaining:()=>0,
  _effectActivationCinematicQueue:[{}],_effectActivationCinematicShowing:false};
 vm.createContext(sandbox);vm.runInContext(choiceDelay,sandbox);
 assert.equal(sandbox.getChoicePresentationDelayMs(),80);
 sandbox._effectActivationCinematicQueue=[];assert.equal(sandbox.getChoicePresentationDelayMs(),0);
 sandbox.effectActivationPredecessorRemaining=()=>80;assert.equal(sandbox.getChoicePresentationDelayMs(),80);
}
const resolution=core.slice(core.indexOf('async function resolveSetCardAfterPlacement('),core.indexOf('\nfunction ',core.indexOf('async function resolveSetCardAfterPlacement(')));
assert.ok(resolution.indexOf('await resolveJorgeConsolidationArrival(inst)')>resolution.indexOf('delete inst._onlineSetResolutionInFlight'),'Jorge runs after placement resolution, including early-return paths');
const consolidation=core.slice(core.indexOf('const inst = newInstance(card);',core.indexOf('function applyMarieDeterranceForConsolidation')));assert.ok(consolidation.indexOf('inst._wasConsolidated = true;')<consolidation.indexOf('markCardSetTurn(inst, cp)'));
const box={G:{},document:{getElementById:()=>({classList:{contains:()=>true}})},escapeHtml:s=>String(s)};vm.createContext(box);vm.runInContext(tracker,box);
for(const turns of [0,1,2,3,4,5,6]){const html=box.buildCardDetailTrackerHTML({id:'106',owner:0,counters:{joseFieldTurns:turns}},0,false);assert.ok(html.includes('Aura: +'+Math.floor(turns/3)+' Fate'));const next=3-turns%3;assert.ok(html.includes('<span class="cd-live-tracker-sub">Next Tier in '+next+' Turn'+(next===1?'':'s')+'</span>'));}
console.log('PASS local Jorge arrivals for both owners, hidden cards, dedupe, invalid triggers; Jose aura tiers and supplementary countdown.');
})().catch(e=>{console.error(e);process.exitCode=1});
