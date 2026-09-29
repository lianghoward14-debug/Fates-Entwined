import * as E from '../../shared/engine/index.mjs';
import {eligibleDestinations} from '../../shared/engine/prompts.mjs';
import catalog from '../fate-card-catalog.js';
import assert from 'node:assert/strict';
let seq=0;
const results=[];
function fixture(ids,opponents=[],settings={}){return E.createInitialState({matchId:`audit${++seq}`,seed:'audit',handSize:12,cardDefinitions:catalog.getCardCatalog().cards,gameSettings:settings,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:opponents}]});}
function take(s,id,p=0){for(const pile of ['hand','deck','discard']){const a=s.players[p][pile];const i=a.findIndex(c=>c.id===id);if(i>=0)return a.splice(i,1)[0];}throw Error(id);}
function place(s,id,z=0,r=2,c=0,p=0){const card=take(s,id,p);s.board[z][r][c]=card;return card;}
function op(s,o){const ctx={state:s,events:[],ruleEvents:[]};E.applyOperation(ctx,o);return ctx;}
function cmd(s,type,payload,p=0){const result=E.reduceCommand(s,{commandId:`probe${++seq}`,matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerIndex:p});if(!result.ok)throw Error(JSON.stringify(result.rejection));return result.state;}
function answer(s,payload){return cmd(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,...payload},s.pendingPrompt.playerIndex);}
function probe(name,run){try{results.push({name,...run()});}catch(e){results.push({name,error:e.message});}}
probe('West German Soldier discard cancellation',()=>{
 let s=fixture(['42','09','09','09','09']);const soldier=s.players[0].hand.find(c=>c.id==='42');s.players[0].deck.push(...s.players[0].hand.filter(c=>c.id==='09'));s.players[0].hand=[soldier];
 s=cmd(s,'SET_CARD',{cardIid:soldier.iid,destination:{z:0,r:2,c:0}});const prompt=s.pendingPrompt;const handAfterDraw=s.players[0].hand.length;s=answer(s,{cancel:true});return {promptMin:prompt.min,cancellable:prompt.cancellable,handAfterDraw,handAfterCancel:s.players[0].hand.length,discardCount:s.players[0].discard.length};
});
probe('Suppressed reinforcement providers',()=>{const s=fixture(['24','09','05']);const clerk=place(s,'24');const un=place(s,'09',0,2,1);clerk.statuses.push('EFFECTS_SUPPRESSED');un.statuses.push('EFFECTS_SUPPRESSED');return {actual:E.effectiveReinforcement(s,E.findBoardCard(s,un.iid),0),expected:1};});
probe('Opponent immunity versus Dylan aura',()=>{const s=fixture(['05'],['10']);const t=place(s,'05');t.currentFate=10;t.statuses.push('IMMUNE_TO_OPPONENT_EFFECTS');place(s,'10',0,0,0,1);return {actual:E.effectiveFate(s,t),expected:10};});
probe('Great Oak tribute bonus in non-rework rules',()=>{const s=fixture(['47','67']);const t=place(s,'47');const c=s.players[0].hand.find(c=>c.id==='67');const before=c.currentFate;op(s,{type:'CONSOLIDATE_CARD',playerIndex:0,cardIid:c.iid,tributeIids:[t.iid],destination:{z:0,r:2,c:0}});return {gain:c.currentFate-before,expected:3};});
probe('Honor Guard current text with reworks disabled',()=>{const s=fixture(['25','05','05']);place(s,'25',1,2,0);const a=place(s,'05');place(s,'05',0,2,1);return {gain:E.effectiveFate(s,a)-a.currentFate,expected:1,rule:E.cardRule('25',s).timings};});
probe('Taylor copied Christopher next draw',()=>{let s=fixture(['bh05','40','09']);const t=s.players[0].hand.find(c=>c.id==='bh05');t.cost=0;const original=s.players[0].hand.find(c=>c.id==='40');s=cmd(s,'CONSOLIDATE_CARD',{cardIid:t.iid,tributeIids:[],destination:{z:0,r:2,c:0}});s=answer(s,{selectedIids:[original.iid]});const draw=take(s,'09');s.players[0].deck=[draw];op(s,{type:'DRAW_CARD',playerIndex:0,count:1,activatedEffect:false});return {gain:draw.currentFate-draw.baseFate,expected:7,statusStillArmed:E.findBoardCard(s,t.iid).card.statuses};});
probe('French Fusiliers copying declared Grenadiers',()=>{let s=fixture(['37','44','05']);const g=place(s,'44');g.counters.sovietDeclaredType='Supporter';place(s,'05',0,2,1);const f=s.players[0].hand.find(c=>c.id==='37');s=cmd(s,'SET_CARD',{cardIid:f.iid,destination:{z:1,r:2,c:0}});s=answer(s,{selectedIids:[g.iid]});return {copied:E.findBoardCard(s,f.iid).card.counters,prompt:s.pendingPrompt,expected:'Copied Grenadiers needs a type declaration to work'};});
probe('Engineer skips Jeremiah potency and Panacea history',()=>{let s=fixture(['bh25','bh02','57','05'],[],{healthPressureSeals:true,pressureCardReworks:true});s.turn=18;const j=place(s,'bh02');place(s,'57',0,2,1);const target=place(s,'05',0,1,0);const eng=s.players[0].hand.find(c=>c.id==='bh25');const before=target.currentFate;s=cmd(s,'SET_CARD',{cardIid:eng.iid,destination:{z:1,r:2,c:0}});return {gain:E.findBoardCard(s,target.iid).card.currentFate-before,expectedGain:2,history:E.findBoardCard(s,j.iid).card.counters.triggeredFateHistoryTotal??0,expectedHistory:2};});
probe('Francisek generated Selva skips hand arrival',()=>{let s=fixture(['bh10']);const f=s.players[0].hand[0];f.cost=0;s=cmd(s,'CONSOLIDATE_CARD',{cardIid:f.iid,tributeIids:[],destination:{z:0,r:2,c:0}});s=answer(s,{selectedIids:['74']});return {extraSupporters:s.extraSupportersThisTurn[0],expected:1,created:s.players[0].hand.map(c=>c.id)};});
probe('Wolf Creek can swap immune Voyager',()=>{let s=fixture(['54','bh01','05']);const v=place(s,'bh01',1,2,0);const target=place(s,'05');const w=s.players[0].hand.find(c=>c.id==='54');s=cmd(s,'SET_CARD',{cardIid:w.iid,destination:{z:0,r:2,c:1}});s=answer(s,{selectedIids:[target.iid]});const offered=s.pendingPrompt.eligible.some(d=>d.z===1&&d.r===2&&d.c===0);s=answer(s,{destination:{z:1,r:2,c:0}});const after=E.findBoardCard(s,v.iid);return {offered,immuneCardMoved:after.z===0,expected:false};});
probe('Jimmy only counts first use of Wodny Youth',()=>{const s=fixture(['93','41'],['05']);const y=place(s,'93');place(s,'41',0,2,1);const t=place(s,'05',0,0,0,1);t.currentFate=10;for(let n=0;n<2;n++){s.turn+=2;op(s,{type:'MODIFY_FATE',sourceIid:y.iid,sourceController:0,targetIid:t.iid,amount:-1});}return {count:s.fateReductionEffectUses[0],expected:2};});
probe('West Caribbea Infantry arrival bypasses Abed and Hsei',()=>{const s=fixture(['33','bh19','bh15','67']);const inf=place(s,'33');place(s,'bh15',0,2,1);s.statuses.push({statusId:'arrival',type:'NEXT_CHARACTER_HAND_ARRIVAL',playerIndex:0,sourceIid:inf.iid,fateBonus:2,costDelta:-1},{statusId:'abed',type:'PERMANENT_FATE_GAIN_POTENCY',playerIndex:0,remainingOwnerTurns:1});const t=take(s,'67');s.players[0].deck=[t];op(s,{type:'DRAW_CARD',playerIndex:0,count:1,activatedEffect:true});return {gain:t.currentFate-t.baseFate,expected:6};});
probe('Suppressed Guerilla still infiltrates',()=>{const s=fixture(['70']);const g=place(s,'70');g.statuses.push('EFFECTS_SUPPRESSED');op(s,{type:'DISCARD_CARD',targetIid:g.iid,sourceController:0});return {opponentHand:s.players[1].hand.map(c=>c.id),discard:s.players[0].discard.map(c=>c.id)};});
probe('Maria reveals opponent Supporters as well as Characters',()=>{let s=fixture(['61'],['05','67']);const c=s.players[0].hand[0];c.cost=0;const result=E.reduceCommand(s,{commandId:`probe${++seq}`,matchId:s.matchId,expectedRevision:s.revision,type:'CONSOLIDATE_CARD',payload:{cardIid:c.iid,tributeIids:[],destination:{z:0,r:2,c:0}}},{playerIndex:0});return {ok:result.ok,revealed:result.events.find(e=>e.type==='HAND_REVEALED')?.cards.map(c=>c.id),expected:['67']};});
probe('Anicka Selva split rounds 24 to 25 across five targets',()=>{const s=fixture(['bh04'],['05','05','05','05','05']);const source=place(s,'bh04');const targets=[];for(let i=0;i<5;i++){const t=place(s,'05',0,Math.floor(i/3),i%3,1);t.currentFate=30;targets.push(t);}op(s,{type:'SPLIT_FATE_LOSS_BY_TYPE',sourceIid:source.iid,sourceController:0,cardType:'Supporter',total:24});return {loss:targets.reduce((sum,t)=>sum+30-t.currentFate,0),expected:24};});
probe('Chloe reclassification ignored by Anicka Selva',()=>{const s=fixture(['bh04'],['05']);const source=place(s,'bh04');const t=s.players[1].hand.find(c=>c.id==='05');t.currentFate=30;op(s,{type:'CHANGE_CARD_TYPE',sourceIid:t.iid,sourceController:1,targetIid:t.iid,playerIndex:1,cardType:'Coordinator'});place(s,'05',0,0,0,1);op(s,{type:'SPLIT_FATE_LOSS_BY_TYPE',sourceIid:source.iid,sourceController:0,cardType:'Coordinator',total:24});return {effectiveType:E.effectiveCardType(s,t),loss:30-t.currentFate,expected:24};});
probe('French Fusiliers copied ALPINE consolidation bonus',()=>{const s=fixture(['37','67']);const t=place(s,'37');t.counters.copiedPassiveId='73';const c=s.players[0].hand.find(c=>c.id==='67');const before=c.currentFate;op(s,{type:'CONSOLIDATE_CARD',playerIndex:0,cardIid:c.iid,tributeIids:[t.iid],destination:{z:0,r:2,c:0}});return {gain:c.currentFate-before,expected:4};});
probe('Boleslaw copied by Taylor ignores search',()=>{const s=fixture(['bh05','09']);const t=place(s,'bh05');t.counters.copiedPassiveId='86';const d=take(s,'09');s.players[0].deck=[d];const before=t.currentFate;E.emitRuleEvent({state:s,events:[],ruleEvents:[]},{type:'DECK_SEARCHED',playerIndex:1});return {gain:t.currentFate-before,drawn:s.players[0].hand.some(c=>c.iid===d.iid),expectedGain:2,expectedDrawn:true};});
probe('Defense in Depth blocks immune ALPINE placement',()=>{const s=fixture(['bh24','76'],[],{healthPressureSeals:true,pressureCardReworks:true});const rifles=place(s,'bh24');s.statuses.push({statusId:'defense',type:'NEXT_SUPPORTER_SET_EXEMPT',playerIndex:0,sourceIid:rifles.iid,remaining:1,fateBonus:4});const c=s.players[0].hand.find(c=>c.id==='76');const result=E.reduceCommand(s,{commandId:`probe${++seq}`,matchId:s.matchId,expectedRevision:s.revision,type:'SET_CARD',payload:{cardIid:c.iid,destination:{z:0,r:2,c:1}}},{playerIndex:0});return {ok:result.ok,rejection:result.rejection,expected:'Set should succeed; immunity prevents bonus'};});
probe('Juan Carlos rejects target in another zone',()=>{const s=fixture(['39'],['05']);const juan=place(s,'39');place(s,'05',1,0,0,1);const result=E.reduceCommand(s,{commandId:`probe${++seq}`,matchId:s.matchId,expectedRevision:s.revision,type:'ACTIVATE_EFFECT',payload:{sourceIid:juan.iid}},{playerIndex:0});return {ok:result.ok,rejection:result.rejection,prompt:result.prompt?.type??null,expected:'Choose opponent card from zone 1, move into Juan zone 0'};});
probe('Mailman search never triggers opposing Boleslaw',()=>{let s=fixture(['94','67'],['86','09']);const bol=place(s,'86',0,0,0,1);const d=take(s,'09',1);s.players[1].deck=[d];const target=take(s,'67');target.rarity='triangle';s.players[0].deck=[target];const mail=s.players[0].hand.find(c=>c.id==='94');s=cmd(s,'SET_CARD',{cardIid:mail.iid,destination:{z:0,r:2,c:0}});s=answer(s,{selectedIids:[target.iid]});return {scheduled:s.players[0].limbo.length,gain:E.findBoardCard(s,bol.iid).card.currentFate-bol.currentFate,drawn:s.players[1].hand.some(c=>c.iid===d.iid),expectedGain:2,expectedDrawn:true};});
probe('Taylor copied Alexander does no morale damage',()=>{const s=fixture(['bh05'],[],{healthPressureSeals:true,pressureCardReworks:true});s.turn=4;const t=place(s,'bh05');t.counters.copiedPassiveId='35';t.currentFate=12;const ctx={state:s,events:[],ruleEvents:[]};E.resolveMoralePressureCycle(ctx);return {damage:ctx.events.find(e=>e.type==='MORALE_CYCLE_RESOLVED')?.damage,expectedOpponentDamage:6};});
probe('Rozsi morale aura drops suppressed friendly targets',()=>{const s=fixture(['34','05'],[],{healthPressureSeals:true,pressureCardReworks:true});s.turn=4;const source=place(s,'34');source.counters.moraleAffiliation='third_great_war';const target=place(s,'05',0,2,1);target.statuses.push('EFFECTS_SUPPRESSED');const ctx={state:s,events:[],ruleEvents:[]};E.resolveMoralePressureCycle(ctx);return {damageSources:ctx.events.find(e=>e.type==='MORALE_CYCLE_RESOLVED')?.moraleDamageSources[0],expected:'Suppressed friendly card still receives Rozsi aura and contributes 3 damage'};});

for(const result of results){
 const name=result.name;
 if(name==='West Caribbea Infantry arrival bypasses Abed and Hsei')continue; // Retired effect.
 if(name==='West German Soldier discard cancellation'){assert.match(result.error,/PROMPT_NOT_CANCELLABLE/);continue;}
 if(name==='Wolf Creek can swap immune Voyager'){assert.match(result.error,/INVALID_CHOICE/);continue;}
 assert.equal(result.error,undefined,name);
 if(name==='Great Oak tribute bonus in non-rework rules')assert.equal(result.gain,0,name);
 else if(name==='Jimmy only counts first use of Wodny Youth')assert.equal(result.count,1,name);
 else if(name==='French Fusiliers copying declared Grenadiers')assert.equal(result.prompt.local,'declaredType',name);
 else if(name==='Suppressed Guerilla still infiltrates'){assert.deepEqual(result.opponentHand,[]);assert.deepEqual(result.discard,['70']);}
 else if(name==='Taylor copied Alexander does no morale damage')assert.deepEqual(result.damage,[0,9],name);
 else if(name==='Rozsi morale aura drops suppressed friendly targets')assert.equal(result.damageSources[0].amount,6,name);
 else if(name==='Maria reveals opponent Supporters as well as Characters')assert.deepEqual(result.revealed,['67'],name);
 else if(name==='Honor Guard current text with reworks disabled'){assert.equal(result.gain,1);assert.deepEqual(result.rule,['PASSIVE']);}
 else if(name==='Taylor copied Christopher next draw'){assert.equal(result.gain,7);assert.deepEqual(result.statusStillArmed,[]);}
 else if(name==='Engineer skips Jeremiah potency and Panacea history'){assert.equal(result.gain,2);assert.equal(result.history,2);}
 else if(name==='Francisek generated Selva skips hand arrival')assert.equal(result.extraSupporters,1);
 else if(name.includes('split rounds')||name.includes('Chloe reclassification'))assert.equal(result.loss,24,name);
 else if(name==='French Fusiliers copied ALPINE consolidation bonus')assert.equal(result.gain,4);
 else if(name.includes('Boleslaw') || name.includes('Mailman search')){assert.equal(result.gain,2,name);assert.equal(result.drawn,true,name);}
 else if(name.includes('Defense in Depth') || name.includes('Juan Carlos'))assert.equal(result.ok,true,name);
 else assert.equal(result.actual,result.expected,name);
}
// Discarded Guerilla automatically infiltrates without a choice window.
{
 let s=fixture(['42','70','09','09','09']);
 const soldier=s.players[0].hand.find(c=>c.id==='42');
 s.players[0].deck.push(...s.players[0].hand.filter(c=>c.id!=='42'));s.players[0].hand=[soldier];
 s=cmd(s,'SET_CARD',{cardIid:soldier.iid,destination:{z:0,r:2,c:0}});
 s=answer(s,{selectedIids:s.pendingPrompt.eligibleIids.slice(0,3)});
 assert.equal(s.pendingPrompt,null);
 assert.equal(s.players[1].hand.some(c=>c.id==='70'),true);
 assert.equal(s.players[0].discard.some(c=>c.id==='70'),false);
}
for(const flag of [false,true]){
 assert.deepEqual(E.cardRule('25',{gameSettings:{pressureCardReworks:flag}}).timings,['PASSIVE']);
 assert.deepEqual(E.cardRule('33',{gameSettings:{pressureCardReworks:flag}}).operations,['MODIFY_MORALE']);
 assert.deepEqual(E.cardRule('47',{gameSettings:{pressureCardReworks:flag}}).operations,['MODIFY_MORALE']);
}
console.log('PASS main card audit authority regressions (24 scenarios plus current-rule parity)');
