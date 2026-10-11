import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand,effectiveFate} from '../../shared/engine/index.mjs';
import {cardRule} from '../../shared/engine/cards/registry.mjs';
import {SUPPORT_COMPANY_CATEGORIES,supportCompanyOffers} from '../../shared/support-company.mjs';
const require=createRequire(import.meta.url);
const defs=require('../fate-card-catalog.js').getCardCatalog().cards;
const metadata=require('../../src/scripts/02-effect-rule-metadata.js');
let serial=0;
function state(a,b,settings={}){return createInitialState({matchId:'REWORK'+(++serial),seed:'rework',handSize:99,cardDefinitions:defs,gameSettings:settings,players:[{id:'p0',deckIds:a},{id:'p1',deckIds:b}]});}
function board(s,p,id,z=0,r=p?0:2,c=0,hidden=false){const i=s.players[p].hand.findIndex(x=>x.id===id);assert(i>=0,id);const card=s.players[p].hand.splice(i,1)[0];card.faceDown=hidden;s.board[z][r][c]=card;return card;}
function command(s,p,type,payload){const result=reduceCommand(s,{commandId:'test:'+ ++serial,matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p'+p});assert(result.ok,JSON.stringify(result.rejection));return result;}
function flip(s,card){return command(s,0,'FLIP_CARD',{cardIid:card.iid});}
const henry=defs.find(c=>c.id==='21'),jimmy=defs.find(c=>c.id==='bh18');
assert.deepEqual([henry.fate,henry.cost,henry.type],[5,5,'Dauntless']);
assert.deepEqual([jimmy.fate,jimmy.cost,jimmy.type],[3,3,'Initiator']);
for(const settings of [{},{pressureCardReworks:true,healthPressureSeals:true}]){
 const s=state(['21','32','32'],['10'],settings),h=board(s,0,'21');
 assert.equal(effectiveFate(s,h),5);
 s.players[0].discard.push(s.players[0].hand.pop());assert.equal(effectiveFate(s,h),7);
 s.players[0].discard.push(s.players[0].hand.pop());assert.equal(effectiveFate(s,h),9);
 s.players[0].hand.push(s.players[0].discard.pop());assert.equal(effectiveFate(s,h),7);
 h.statuses.push('EFFECTS_SUPPRESSED');assert.equal(effectiveFate(s,h),5);
 assert.deepEqual(cardRule('21',s).timings,['PASSIVE']);
}
// Jimmy redraws only actual discards, respects immunity/replacement, and has no old cycle trigger.
for(const ids of [[],['32','32'],['32','76','70']]){
 const s=state(['bh18'],[...ids,...Array(5).fill('05')]);const j=board(s,0,'bh18',0,2,0,true);
 const replacement=s.players[1].hand.filter(c=>c.id==='05');s.players[1].hand=s.players[1].hand.filter(c=>c.id!=='05');s.players[1].deck.push(...replacement);
 const expected=ids.filter(id=>id==='32').length;
 const result=flip(s,j);assert.equal(result.state.players[1].discard.length,expected);
 assert.equal(result.state.players[1].deck.length,5-expected);
 assert.equal(result.state.players[1].hand.length,expected+(ids.includes('76')?1:0));
 assert.equal(cardRule('bh18',s).triggerSubscriptions,undefined);
}
// Inclusive 10 / 30 boundary, below minimum, below ratio, and repeated bonus uses.
for(const [own,enemy,eligible] of [[10,30,true],[10,29,false],[9,30,false],[11,33,true],[11,32,false]]){
 const s=state(['78','32'],['32']);s.supportCompanyUses=[2,0];
 const ally=board(s,0,'32',0,2,1);ally.currentFate=own-1;
 const foe=board(s,1,'32');foe.currentFate=enemy;
 const h=s.players[0].hand.find(c=>c.id==='78');
 let result=command(s,0,'SET_CARD',{cardIid:h.iid,destination:{z:0,r:2,c:0}});
 assert.equal(result.prompt?.type==='MODAL_CHOICE' && result.prompt?.sourceIid===h.iid,eligible,`${own}/${enemy}`);
 assert(!result.state.statuses.some(x=>x.type==='FACE_DOWN_CONSOLIDATION_PERMISSION'));
 if(eligible){
   const category=result.prompt.options[0].value;
   result=command(result.state,0,'ANSWER_PROMPT',{promptId:result.prompt.promptId,choice:category});
   assert.equal(result.prompt.type,'CARD_SELECTION');
   assert.equal(result.prompt.eligibleIids.length,3);
   assert.deepEqual(result.prompt.eligibleIids,supportCompanyOffers(result.state.cardCatalog,s.matchId,0,category));
   const picked=result.prompt.eligibleIids[0];result=command(result.state,0,'ANSWER_PROMPT',{promptId:result.prompt.promptId,selectedIids:[picked]});assert.equal(result.state.players[0].hand.at(-1).id,picked);assert.equal(result.state.supportCompanyUses[0],2);
 }
}
for(const id of ['10','21','35','36','53','65']){
 const s=state([id],['79'],{pressureCardReworks:true,healthPressureSeals:true});const source=board(s,0,id,0,2,0,true);
 const result=flip(s,source);assert.notEqual(result.prompt?.type,'REACTION',id+' must not offer Havano on passive entry');
 assert.equal(metadata.canTriggerHavano(id),false);
 assert.equal(cardRule(id,s).havanoTargeting,'NONE');
}
for(const id of ['bh18','14','62','bh16']){
 const s=state([id,'32'],['79','32']);const source=board(s,0,id,0,2,0,id!=='bh16');board(s,1,'32',0,1,0);
 const h=s.players[1].hand.find(c=>c.id==='79');
 let result=id==='bh16'?command(s,0,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true}):flip(s,source);
 assert.equal(result.prompt?.type,'REACTION',id);assert.deepEqual(result.prompt.options.find(o=>o.kind==='HAVANO').modes,['NEGATE']);
 const invalid=reduceCommand(result.state,{commandId:'bad'+ ++serial,matchId:s.matchId,expectedRevision:result.state.revision,type:'ANSWER_PROMPT',payload:{promptId:result.prompt.promptId,reactionIid:h.iid,choice:'SUPPRESS'}},{playerId:'p1'});assert.equal(invalid.ok,false);
 result=command(result.state,1,'ANSWER_PROMPT',{promptId:result.prompt.promptId,reactionIid:h.iid,choice:'NEGATE'});
 result=command(result.state,1,'ANSWER_PROMPT',{promptId:result.prompt.promptId,destination:result.prompt.eligible[0]});
 assert(!result.state.board[0][2][0].statuses.includes('EFFECTS_SUPPRESSED'),id+' source remains active');
 assert.equal(result.state.players[1].discard.length,0);
}
// Exercise the shipping browser helpers, not a second implementation of their rules.
const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
function fn(name){const start=core.indexOf('function '+name+'('),asyncStart=core.slice(start-6,start)==='async '?start-6:start;assert(start>=0,name);let end=core.indexOf('\n}',start)+2;return core.slice(asyncStart,end);}
const sandbox=vm.createContext({window:{FateEffectRuleMetadata:metadata},G:{players:[{hand:[],discard:[]},{hand:[],discard:[]}]},
 isTargetImmuneToEffectOwner:c=>c.id==='76',fatePushDiscard:(p,c)=>sandbox.G.players[p].discard.push(c),
 drawCard:async(p,n)=>{sandbox.drawn={p,n};},renderEffectResolutionForPlayer:()=>{},getZoneScore:(z,p)=>sandbox.scores[p],
 isEffectImmuneSource:()=>false,markInitialEffectResolved:c=>{c.effectUsedInitial=true;},log:()=>{},beginHavanoDeployment:()=>false});
vm.runInContext(['resolveJimmyHandReset','resolveChaparralCallToArms','isHavanoReactionSource','executeReaction'].map(fn).join('\n'),sandbox);
sandbox.G.players[1].hand=[{id:'32',iid:'one'},{id:'32',iid:'two'},{id:'76',iid:'immune'}];
await sandbox.resolveJimmyHandReset({id:'bh18'},0);assert.equal(sandbox.drawn.n,2);assert.equal(sandbox.G.players[1].hand.length,1);
let calls=0;sandbox.window.resolveHopliteCallToArms=async()=>{calls++;return true;};
for(const [own,enemy,expected] of [[10,30,true],[10,29,false],[9,30,false]]){sandbox.scores=[own,enemy];assert.equal(await sandbox.resolveChaparralCallToArms({},0,0),expected);}
assert.equal(calls,1);
for(const id of ['10','21','35','36','53','65'])assert.equal(sandbox.isHavanoReactionSource({card:{id,owner:0},affectedOwners:[1]}),false);
assert.equal(sandbox.isHavanoReactionSource({card:{id:'bh18',owner:0},affectedOwners:[1]}),true);
const source={id:'62',owner:0};sandbox.executeReaction({type:'havano',card:{owner:1}},{card:source,sourceOwner:0});assert.equal(source._reactionSuppressed,undefined);assert.equal(source._effectNegatedByReaction,undefined);assert.equal(source.statuses,undefined);
const browserHenry={id:'21',iid:'henry',type:'Dauntless',owner:0,currentFate:5,fate:5};
Object.assign(sandbox,{
 getFrenchFusiliersCopiedPassiveId:()=>'',frenchFusiliersCopies:()=>false,
 getSuperiorMarksMultiplier:()=>1,cardHasEffectType:(card,type)=>card.type===type,
 getWhisperAuraPotencyBoost:()=>0,capEffectiveFateForLandscape:value=>value,
 capEffectiveFateForPermanentDebuff:(_card,value)=>value,isSupporterEffectSuppressed:()=>false
});
sandbox.G.board=[[[browserHenry]]];sandbox.G.players[0].discard=[{},{}];
vm.runInContext(['cardActsAsPassive','getEffectiveFate'].map(fn).join('\n'),sandbox);
assert.equal(sandbox.getEffectiveFate(browserHenry,0),9);
sandbox.G.players[0].discard.pop();assert.equal(sandbox.getEffectiveFate(browserHenry,0),7);
browserHenry.statuses=['EFFECTS_SUPPRESSED'];assert.equal(sandbox.getEffectiveFate(browserHenry,0),5);
const supportSource=fs.readFileSync(new URL('../../src/scripts/support-company.mjs',import.meta.url),'utf8');
const supportSandbox=vm.createContext({window:{presentSupportCompanyUse:async()=>{},showSupportCompanyCategoryWindow:({categories,onSelect})=>onSelect(categories[0].id)},
 G:{players:[{hand:[]},{hand:[]}],_supportCompanyUses:[2,0],_supportCompanyOfferSeed:'parity-seed'},
 CARDS:defs,SUPPORT_COMPANY_CATEGORIES,supportCompanyOffers,context:()=>null,
 closeModal:()=>{},renderEffectResolutionForPlayer:()=>{},createCardInstance:card=>({...card}),
 addCardToHand:(player,card)=>supportSandbox.G.players[player].hand.push(card),
 showModal:(_title,_body,choices)=>choices[0].action(),
 pickRoyalSeal:(cards,options,commit)=>{
   assert.equal(cards.length,3);assert.equal(options.minCount,1);assert.equal(options.maxCount,1);
   assert.deepEqual(Array.from(cards,c=>c.id),supportCompanyOffers(defs,'parity-seed',0,SUPPORT_COMPANY_CATEGORIES[0].id));
   commit([cards[0]]);
 }
});
vm.runInContext(supportSource.slice(supportSource.indexOf('window.resolveHopliteCallToArms =')),supportSandbox);
assert.equal(await supportSandbox.window.resolveHopliteCallToArms({id:'78'},0),true);
assert.equal(supportSandbox.G.players[0].hand.length,1);
assert.equal(supportSandbox.G._supportCompanyUses[0],2);
console.log('Henry, Jimmy, Chaparral Hoplite and negate-only Havano: authoritative and browser regressions passed.');

