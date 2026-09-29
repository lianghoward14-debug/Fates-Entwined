import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand, projectStateForPlayer, isEffectSourceSuppressed} from '../../shared/engine/index.mjs';
import {legalCommandTemplates} from '../../shared/engine/legal-commands.mjs';
import {command} from './test-helpers.mjs';
const ids=['09','28','70','74','79','91','98','76','92','93','37','bh05','62','18','32'];
function fresh(a,b){return createInitialState({matchId:'reported-bugs',seed:'regression',handSize:99,
  cardDefinitions:ids.map(id=>({id,name:id,type:id==='bh05'?'Initiator':'Supporter',aff:'eventide',fate:10,cost:0})),
  players:[{id:'p0',deckIds:a},{id:'p1',deckIds:b}]});}
function board(s,p,id,z=0,r=p===0?2:0,c=0){const hand=s.players[p].hand;const i=hand.findIndex(x=>x.id===id);assert(i>=0);const card=hand.splice(i,1)[0];s.board[z][r][c]=card;return card;}
let seq=0;
function send(s,type,payload={},p=s.pendingPrompt?.playerIndex??s.activePlayer){const result=reduceCommand(s,command(s,'p'+p,++seq,type,payload),{playerId:'p'+p});assert(result.ok,JSON.stringify(result.rejection));return result.state;}
for(const id of ['09','28','70','74','79','91','98','92','76']){
  let s=fresh(['92',id],['32']);board(s,0,'92');const target=s.players[0].hand[0];
  s=send(s,'SET_CARD',{cardIid:target.iid,destination:{z:0,r:2,c:1}});
  assert.equal(isEffectSourceSuppressed(s,s.board[0][2][1]),id!=='76','Lumberjack '+id);
  assert.equal(s.board[0][2][1].statuses.includes('EFFECTS_SUPPRESSED'),id!=='76');
}
for(const id of ['09','28','70','74','79','91','98','92','76']){
  let s=fresh(['18'],[id]);const target=board(s,1,id);
  s=send(s,'SET_CARD',{cardIid:s.players[0].hand[0].iid,destination:{z:0,r:2,c:0}});
  s=send(s,'END_TURN');
  assert.equal(isEffectSourceSuppressed(s,s.board[0][0][0]),id!=='76','Marines '+id);
  assert.equal(projectStateForPlayer(s,1).board[0][0][0].statuses.includes('EFFECTS_SUPPRESSED'),id!=='76','icon '+id);
  s=send(s,'END_TURN');s=send(s,'END_TURN');
  assert.equal(isEffectSourceSuppressed(s,s.board[0][0][0]),false,'expiry '+id);
}
for(const id of ['93','37','bh05']){
  let s=fresh([id],['32']);const source=board(s,0,id),target=board(s,1,'32');
  if(id==='37') source.counters.copiedPassiveId='93';
  if(id==='bh05') source.counters.copiedEffectId='93';
  for(let n=0;n<2;n++){
    s=send(s,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true});
    s=send(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIid:target.iid});
    assert.equal(s.fateReductionEffectUses[0],1,id+' once per card');
    s=send(s,'END_TURN');s=send(s,'END_TURN');
  }
}
{
 let s=fresh(['32','32'],['62']);const target=board(s,1,'62',0,2,0);
 assert(legalCommandTemplates(s,0).some(x=>x.type==='DISCARD_CARD'&&x.payload.targetIid===target.iid));
 s=send(s,'DISCARD_CARD',{targetIid:target.iid});
 assert.equal(s.pendingPrompt.type,'HAND_SELECTION');
 assert.equal(s.board[0][2][0].iid,target.iid,'cost must be paid first');
 s=send(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:s.players[0].hand.map(x=>x.iid)});
 assert.equal(s.board[0][2][0],null);assert.equal(s.players[0].discard.length,2);assert.equal(s.players[1].discard.length,1);
}
// Both Havano choices permanently suppress, including older NEGATE clients.
for(const havanoMode of ['NEGATE','SUPPRESS']){
 let s=fresh(['93'],['79','32']);const source=board(s,0,'93');board(s,1,'32');
 s=send(s,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true});
 if(s.pendingPrompt.type==='BOARD_TARGET') s=send(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIid:s.board[0][0][0].iid});
 assert.equal(s.pendingPrompt.type,'REACTION');
 const havano=s.pendingPrompt.options.find(x=>x.kind==='HAVANO');assert(havano);
 s=send(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,reactionIid:havano.reactionIid,choice:havanoMode});
 if(s.pendingPrompt){
   const destination=s.pendingPrompt.eligible[0];
   assert(destination,JSON.stringify(s.pendingPrompt));
   s=send(s,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,destination});
 }
 assert(isEffectSourceSuppressed(s,s.board[0][2][0]));
 s=send(s,'END_TURN');
 s=send(s,'DISCARD_CARD',{targetIid:havano.reactionIid});
 s=send(s,'END_TURN');
 assert(isEffectSourceSuppressed(s,s.board[0][2][0]));
 const blocked=reduceCommand(s,command(s,'p0',++seq,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true}),{playerId:'p0'});
 assert.equal(blocked.ok,false);assert.equal(blocked.rejection.code,'EFFECT_SUPPRESSED');
}
// Berkeley's removal is confined to the opponent's own row and enforces its cost.
{
 let s=fresh(['32'],['62']);const target=board(s,1,'62',0,2,0);
 assert(!legalCommandTemplates(s,0).some(x=>x.type==='DISCARD_CARD'&&x.payload.targetIid===target.iid));
 const rejected=reduceCommand(s,command(s,'p0',++seq,'DISCARD_CARD',{targetIid:target.iid}),{playerId:'p0'});
 assert.equal(rejected.ok,false);assert.equal(rejected.rejection.code,'ADDITIONAL_DISCARD_REQUIRED');
 target.statuses.push('EFFECTS_SUPPRESSED');
 s=send(s,'DISCARD_CARD',{targetIid:target.iid});
 assert.equal(s.players[0].hand.length,1,'suppressed Berkeley has no discard cost');
 assert.equal(s.board[0][2][0],null);
}
const read=p=>fs.readFileSync(new URL('../../src/scripts/'+p,import.meta.url),'utf8');
function fn(src,name){const start=src.search(new RegExp('(?:async )?function '+name+'\\('));assert(start>=0,name);return src.slice(start,src.indexOf('\n}',start)+2);}
const core=read('05-gameplay-core.js'),render=read('06-rendering-and-helpers.js');
const browser={window:{},G:{currentPlayer:0,damageDoneP:[0,0],_phase7CurrentMultiplayer:true,oppSuppressedNextTurn:true,suppressTarget:0},
 getCardRuntimeEffectId:c=>c.id,isEffectImmuneSource:c=>c.id==='76',isCardSuppressedByHenryDong:()=>false,
 document:{getElementById:()=>null}};
vm.createContext(browser);
vm.runInContext(['hasNoSuppressibleFieldEffect','isDirectCardEffectSuppressed','isCardEffectSuppressed','isSupporterEffectSuppressed','isPlayerSupporterEffectsSuppressed','recordFateReductionEvent'].map(n=>fn(core,n)).join('\n')+'\n'+['isCardVisuallySuppressed','isCardVisuallyNegated'].map(n=>fn(render,n)).join('\n'),browser);
for(const id of ['09','98','76']) assert.equal(browser.isCardVisuallySuppressed({id,type:'Supporter',owner:0}),id!=='76');
for(const id of ['93','37','bh05']){const card={id};const before=browser.G.damageDoneP[0];browser.recordFateReductionEvent(0,5,4,{countOncePerSourceEffect:card});browser.recordFateReductionEvent(0,4,3,{countOncePerSourceEffect:card});assert.equal(browser.G.damageDoneP[0],before+1);}
browser.G._isSpectator=true;browser.G._onlineRole='spectator';browser.G._warReplayMode=true;browser.G.viewerPlayerIndex=1;
vm.runInContext(fn(read('04-game-setup.js'),'resetSpectatorStateBeforeGame'),browser);
browser.resetSpectatorStateBeforeGame();assert.equal(browser.G._isSpectator,false);assert.equal(browser.G._warReplayMode,false);assert.equal(browser.G._onlineRole,null);assert.equal(browser.G.viewerPlayerIndex,null);
Object.assign(browser, {ONGOING_REACTION_EFFECT_IDS:new Set(),DELAYED_REACTION_SUPPRESSION_IDS:new Set(),
  markInitialEffectResolved:()=>{},log:()=>{},beginHavanoDeployment:()=>true,
  getCardRuntimeEffectId:c=>c.copiedEffectId || c.id,
  TEMPORARY_CARD_STATUS_VISUAL_PRIORITY:['effect_flash','snowball'],
  PERMANENT_CARD_STATUS_VISUAL_FALLBACK_ORDER:['immune','marked','suppressed','negated'],
  cardPermanentStatusRecency:new Map(),cardPermanentStatusSequence:0,cardStatusVisualPrimarySeen:new Map(),queueCardStatusIconSfx:()=>{}});
vm.runInContext(['isOngoingReactionEffect','executeReaction'].map(n=>fn(core,n)).join('\n')+'\n'+fn(render,'getCardStatusVisualState'),browser);
for(const id of ['16','93','37','bh05']){
 const card={id,copiedEffectId:id==='16'?'16':'93',type:id==='bh05'?'Initiator':'Supporter',owner:0,statuses:[]};
 browser.executeReaction({type:'havano',card:{id:'79',owner:1}}, {card});
 assert(card.statuses.includes('EFFECTS_SUPPRESSED'));
 delete card._reactionSuppressed;delete card._effectSuppressedByReaction;
 browser.G.oppSuppressedNextTurn=false;
 assert(browser.isCardEffectSuppressed(card),'Havano stays permanent on '+id);
 assert(browser.isCardVisuallySuppressed(card));
}
const iconCard={iid:'icon-test'};
assert.equal(browser.getCardStatusVisualState(iconCard,{suppressed:true}).primary,'suppressed');
assert.equal(browser.getCardStatusVisualState(iconCard,{suppressed:true,marked:true}).primary,'suppressed');
vm.runInContext(['isBerkeleyHomelessEffectCard','canDiscardBerkeleyHomelessEffect'].map(n=>fn(render,n)).join('\n'),browser);
browser.G.phase='main';browser.G.currentPlayer=0;
assert(browser.canDiscardBerkeleyHomelessEffect({id:'62',owner:1},0,2,0,0));
assert.equal(browser.canDiscardBerkeleyHomelessEffect({id:'62',owner:1},0,0,0,0),false);
Object.assign(browser,{isFullyEffectImmuneCard:c=>c.id==='76',cardActsAsPassive:(c,id)=>c.id===id,
  showBlockedAnimation:()=>{},hasAuthoritativeWhenSetEffect:()=>false});
vm.runInContext(fn(core,'applyWodnyPotokLumberjackSuppression')+'\n'+fn(read('07-ai.js'),'aiTriggerWhenSet'),browser);
for(const id of ['09','28','70','74','79','91','98','92']){
 const lumberjack={id:'92',iid:'wood',type:'Supporter',owner:0};
 const target={id,iid:'new',type:'Supporter',owner:0};
 browser.G.board=[[[lumberjack,target]]];browser.G.oppSuppressedNextTurn=false;
 await browser.aiTriggerWhenSet(target,0,0,1);
 assert.equal(target._lumberjackSuppressed,true,'AI Lumberjack '+id);
 assert.equal(target._reinforcementBonus,1);
 assert.equal(browser.isCardVisuallySuppressed(target),true);
}
// Leaving spectating must clear a stale flag even after another path changed the role.
const spectatorGame={_isSpectator:true,_onlineRole:'guest',_onlinePlayerIndex:1,viewerPlayerIndex:1,localPlayerIndex:1};
const spectatorContext={getFateGameState:()=>spectatorGame,document:{getElementById:()=>null},
 spectatorGeneration:7,spectatorPollTimer:123,clearTimeout:()=>{},spectatingMatchId:'old-match',unmountGameScreen:()=>{},
 state:{},revision:5,stateHash:'old',playerIndex:1,legalCommands:[],privateActionCards:[],presentationBatch:{}};
vm.createContext(spectatorContext);
vm.runInContext(fn(read('authoritative-v3-phase7-beta-client.mjs'),'stopSpectating'),spectatorContext);
spectatorContext.stopSpectating({showWarfront:false});
assert.equal(spectatorContext.spectatorGeneration,8,'leaving invalidates pending spectator callbacks');
assert.equal(spectatorGame._isSpectator,false);assert.equal(spectatorGame._onlineRole,null);
assert.equal(spectatorGame.viewerPlayerIndex,null);assert.equal(spectatorContext.spectatingMatchId,'');
console.log('Reported spectator, suppression, copied Snowball and Berkeley regressions passed.');


