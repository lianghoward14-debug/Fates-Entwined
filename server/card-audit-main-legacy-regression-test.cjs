const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const helpers=fs.readFileSync('src/scripts/00-structural-helpers.js','utf8');
function fn(name,source=core){let start=source.indexOf('function '+name+'(');assert(start>=0,name);if(source.slice(start-6,start)==='async ')start-=6;return source.slice(start,source.indexOf('\n}',start)+2);}
const noop=()=>{};
const c={window:{},G:{damageDoneP:[0,0],board:[],players:[{hand:[],deck:[],discard:[]},{hand:[],deck:[],discard:[]}]},toast:noop,log:noop,renderEffectResolutionForPlayer:noop,playFateChangeSound:noop,clampCardToLandscapeFateCap:noop,pressureCardReworkTimingActive:()=>false,applyDestructionOfParadisePermanentFateLoss:(card,n)=>{card.currentFate-=n;c.G.damageDoneP[0]++;return true;},cardHasEffectType:(card,type)=>(card.effectiveType||card.type)===type};
vm.createContext(c);
vm.runInContext(core.slice(0,core.indexOf('function chooseFrenchFusiliersPassive(')),c);
for(const id of ['25','44','93'])assert(c.canFrenchFusiliersCopyPassive({id,type:'Supporter'}));
for(const id of ['64','73','65'])assert(!c.canFrenchFusiliersCopyPassive({id,type:'Supporter'}));
vm.runInContext(fn('recordFateReductionEvent'),c);
const youth={id:'93',iid:'youth'};
c.recordFateReductionEvent(0,10,9,{countOncePerSourceEffect:youth});c.recordFateReductionEvent(0,9,8,{countOncePerSourceEffect:youth});assert.equal(c.G.damageDoneP[0],1);
vm.runInContext(fn('applyDestructionOfParadise'),c);
for(const n of [1,5,7]){
 const targets=Array.from({length:n},(_,i)=>({iid:String(i),owner:1,type:'Supporter',effectiveType:'Coordinator',currentFate:30}));
 c.G.board=[[targets]];const before=c.G.damageDoneP[0];c.applyDestructionOfParadise({id:'bh04'},0,0,'Coordinator');
 assert.equal(targets.reduce((total,card)=>total+30-card.currentFate,0),24);assert.equal(c.G.damageDoneP[0],before+1);
}
vm.runInContext(fn('tickMailDeliveriesForCurrentPlayer'),c);
const deliveries=[{player:0,card:{name:'Delivery'},turnsLeft:4}];c.ensureMailDeliveryState=()=>deliveries;let arrivals=0;c.addCardToHand=()=>arrivals++;
for(let turn=1;turn<=8;turn++){c.G.currentPlayer=turn%2;c.tickMailDeliveriesForCurrentPlayer();assert.equal(arrivals,turn===8?1:0);}
vm.runInContext(fn('getHighTPotencyCount')+'\n'+fn('modifyFate')+'\n'+fn('resolveSmartInvestments'),c);
vm.runInContext(fn('ensureBlameGameState')+'\n'+fn('activateBlameGameEffect')+'\n'+fn('tickBlameGameAtEndOfTurn')+'\n'+fn('adjustedTriggeredFateHistoryGain'),c);
c.G.turn=8;c.activateBlameGameEffect(0,{iid:'youth99'});
for(let turn=8;turn<13;turn++){c.G.turn=turn;c.tickBlameGameAtEndOfTurn();assert.equal(c.G._blameGameEffects[0].active,turn<12);}
c.queueHighTPotencyOverlay=noop;c.G.turn=8;c.G._bh19HighTStatuses=[{playerIndex:0,turn:8}];
assert.equal(c.adjustedTriggeredFateHistoryGain({owner:0},1),2);
c.activeChineseMacArthurSources=()=>[{}];
assert.equal(c.adjustedTriggeredFateHistoryGain({owner:0},1),3);
const investment={iid:'invest',currentFate:1};c.G.players[0].hand=[investment];c.pickCardsVisual=(cards,opts,cb)=>cb([cards[0]]);
vm.runInContext(fn('isWolfCreekMoveCandidateCard'),c);c.isCardEffectImmutable=card=>['76','bh01'].includes(card.id);
assert(!c.isWolfCreekMoveCandidateCard({id:'76',owner:0},0));assert(!c.isWolfCreekMoveCandidateCard({id:'bh01',owner:0},0));assert(c.isWolfCreekMoveCandidateCard({id:'05',owner:0},0));
vm.runInContext(fn('getSupportReinforcementValue',helpers),c);c.applyPermanentEffectImmunity=noop;c.isSupporterEffectSuppressed=card=>!!card.suppressed;c.isLandscapeActive=()=>false;
assert.equal(c.getSupportReinforcementValue({id:'09',suppressed:true}),1);assert.equal(c.getSupportReinforcementValue({id:'09'}),2);
(async()=>{await c.resolveSmartInvestments({id:'bh13'},0);assert.equal(investment.currentFate,15);assert(c.G.players[0].deck.includes(investment));console.log('PASS legacy main card audit: copy eligibility, Youth, Selva, eight-turn Mailman, Hugh/Abed, movement immunity, suppression.');})();
