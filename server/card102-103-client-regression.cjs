const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const core=fs.readFileSync(require('path').join(__dirname,'../src/scripts/05-gameplay-core.js'),'utf8');
function fn(n){const a=core.indexOf('function '+n+'(');assert(a>=0);return core.slice(a,core.indexOf('\n}',a)+2)}
const constants=core.slice(core.indexOf('const INITIAL_SET_INITIATOR_IDS'),core.indexOf('function whenSetEffectsAreDeferred'));
const ctx={window:{},G:{},MANUAL_EFFECT_BLOCKED_CARD_IDS:new Set(),getCardRuntimeEffectId:c=>c.id};vm.createContext(ctx);vm.runInContext(constants+'\n'+fn('canUseManualCharacterEffect'),ctx);
assert(ctx.hasAuthoritativeWhenSetEffect({id:'103'}));
assert(ctx.canUseManualCharacterEffect({id:'102',type:'Improvisor',faceDown:true}));
assert(!ctx.canUseManualCharacterEffect({id:'102',type:'Improvisor',_blackRoseUsed:true}));
const a=core.indexOf("    case '103':",core.indexOf('async function triggerCharacterEffect')),b=core.indexOf("    case 'bh19':",a);
let called=0,discarded=[];Object.assign(ctx,{cp:0,card:{id:'103',iid:'general'},forEachBoardCard:fn=>[{iid:'high',owner:0,fate:7},{iid:'low',owner:0,fate:6},{iid:'enemy',owner:1,fate:9}].forEach(c=>fn(c,0,1,1)),markInitialEffectResolved:()=>{},getEffectiveFate:c=>c.fate,discardBoardCard:c=>discarded.push(c.iid)});ctx.window.resolveHopliteCallToArms=async()=>called++;
vm.runInContext("async function run(){switch('103'){"+core.slice(a,b)+'}}',ctx);
ctx.run().then(async()=>{assert.deepEqual(discarded,['high']);assert.equal(called,1);ctx.forEachBoardCard=fn=>fn({iid:'low',owner:0,fate:6},0,1,1);discarded=[];await ctx.run();assert.deepEqual(discarded,[]);assert.equal(called,2,'Call to Arms must still open with no eligible discards');console.log('Anne activation and Santiago legacy Call to Arms with and without eligible discards passed');}).catch(e=>{console.error(e);process.exitCode=1;});
