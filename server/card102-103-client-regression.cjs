const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const core=fs.readFileSync(require('path').join(__dirname,'../src/scripts/05-gameplay-core.js'),'utf8');
function fn(n){const a=core.indexOf('function '+n+'(');assert(a>=0);return core.slice(a,core.indexOf('\n}',a)+2)}
const constants=core.slice(core.indexOf('const INITIAL_SET_INITIATOR_IDS'),core.indexOf('function whenSetEffectsAreDeferred'));
const ctx={window:{},G:{},MANUAL_EFFECT_BLOCKED_CARD_IDS:new Set(),getCardRuntimeEffectId:c=>c.id};vm.createContext(ctx);vm.runInContext(constants+'\n'+fn('canUseManualCharacterEffect'),ctx);
assert(ctx.hasAuthoritativeWhenSetEffect({id:'103'}));
assert(ctx.canUseManualCharacterEffect({id:'102',type:'Improvisor',faceDown:true}));
assert(!ctx.canUseManualCharacterEffect({id:'102',type:'Improvisor',_blackRoseUsed:true}));
const a=core.indexOf("    case '103':",core.indexOf('async function triggerCharacterEffect')),b=core.indexOf("    case 'bh19':",a);
let drawn=0;Object.assign(ctx,{cp:0,card:{id:'103',iid:'general'},G:{_moralePressure:{morale:[50,100]}},showSangrePorVictoriaMoralePicker:(p,confirm)=>confirm(30),drawCard:async(p,n)=>{drawn+=n},renderHand:()=>{}});
vm.runInContext("async function run(){switch('103'){"+core.slice(a,b)+'}}',ctx);
ctx.run().then(()=>{assert.equal(ctx.G._moralePressure.morale[0],20);assert.equal(drawn,2);console.log('Card 102 activation eligibility and card 103 timing/payment/draw passed');}).catch(e=>{console.error(e);process.exitCode=1;});
