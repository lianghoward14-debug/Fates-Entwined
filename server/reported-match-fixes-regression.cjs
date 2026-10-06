'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync('src/scripts/' + name, 'utf8');
const core = read('05-gameplay-core.js');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a);
  return source.slice(a, b);
}
(async()=>{
  const ctx = vm.createContext({window:{}, G:{currentPlayer:0,_suppressEffectPrompt:true,players:[{hand:[],deck:[]},{}]},
    INITIAL_SET_INITIATOR_IDS:new Set(['bh13']), AUTHORITATIVE_ACTIVATE_EFFECT_IDS:new Set(),
    closeModal(){},toast(){},renderEffectResolutionForPlayer(){},shuffle(){},
    getCardRuntimeEffectId:c=>c._bh05CopiedPassiveId || c.id,
    cardHasEffectType:(c,t)=>c.type===t,
    markInitialEffectResolved(c){c.effectUsedInitial=true;},
    modifyFate(c,n){c.currentFate+=n;},
    pickCardsVisual(cards,opts,done){done(cards.slice(0,3));}
  });
  vm.runInContext(section(core,'async function resolveSmartInvestments(', 'function applyCharterOfUnitedNations('),ctx);
  vm.runInContext(section(core,'async function triggerCharacterEffect(', 'const MANUAL_EFFECT_BLOCKED_CARD_IDS'),ctx);
  vm.runInContext(section(core,'function isTriggeredFateCoordinator(', 'function canFrenchFusiliersCopyPassive('),ctx);
  for(const ai of [false,true]) {
    ctx.G.aiEnabled=ai;ctx.G.aiPlayer=0;
    ctx.G.players[0]={hand:Array.from({length:5},(_,i)=>({iid:String(i),currentFate:1})),deck:[]};
    await ctx.triggerCharacterEffect({id:'bh13',type:'Initiator'},0,2,0,{fromSet:true});
    assert.equal(ctx.G.players[0].hand.length,2);
    assert.equal(ctx.G.players[0].deck.length,3);
    assert(ctx.G.players[0].deck.every(c=>c.currentFate===8));
  }
  for(const id of ['15','bh02','bh08']) assert(ctx.isTriggeredFateCoordinator({id:'bh05',type:'Initiator',_bh05CopiedPassiveId:id}));
  assert(!ctx.isTriggeredFateCoordinator({id:'bh05',type:'Initiator',_bh05CopiedPassiveId:'32'}));
  const helpers=read('00-structural-helpers.js');
  const resetCtx=vm.createContext({G:{_endgameResolved:true,_finalZoneRevealActive:true,_aiRunning:true},
    cleanupTransientGameTimers(){},createEmptyBoard:()=>[],createEmptyExtraCells:()=>[],resetInteractionState(){}});
  vm.runInContext(section(helpers,'function resetMatchTransientState(', 'function hidePassTurnOverlay('),resetCtx);
  resetCtx.resetMatchTransientState();
  assert.equal(resetCtx.G._endgameResolved,false);
  assert.equal(resetCtx.G._finalZoneRevealActive,false);
  assert.equal(resetCtx.G._aiRunning,false);
  // A morale defeat must enter the reveal, without opening results first.
  let revealed=false;
  const winCtx=vm.createContext({window:{FATE_MORALE_PRESSURE_RULES_ENABLED:true},
    G:{_moralePressure:{morale:[0,100]},turn:4},_tutorialActive:false,
    hidePassTurnOverlay(){},stopTurnTimer(){},getZoneScore:(z,p)=>p?5:1,
    setTimeout:fn=>fn(),showFinalZoneReveal(results,opts){revealed=true;assert.equal(results.length,3);assert.equal(opts.winner,1);}});
  const winSource=core.slice(core.indexOf('function checkWin('));
  // Only execute through the reveal branch; the remaining result UI is unreachable.
  vm.runInContext(winSource.slice(0,winSource.indexOf('  // Multiple render and turn callbacks'))+'\n}',winCtx);
  winCtx.checkWin();assert(revealed);assert.equal(winCtx.G._finalZoneRevealActive,true);
  let multiplayerRevealed=false,resultsShown=false;
  const online=read('18-online-rooms.js');
  const onlineCtx=vm.createContext({location:{search:''},URLSearchParams,gameState:()=>({}),
    phase7CurrentUiSession:{presentationGeneration:1},
    phase7RenderAuthoritativeOutcome(){resultsShown=true;},
    window:{showFinalZoneReveal(zones,opts){multiplayerRevealed=true;assert.equal(zones.length,3);assert.equal(resultsShown,false);opts.onComplete();}}});
  vm.runInContext(section(online,'function phase7OutcomeZoneResults(', 'function phase7RenderAuthoritativeOutcome('),onlineCtx);
  vm.runInContext(section(online,'function phase7PresentAuthoritativeOutcome(', 'function phase7ResyncStatusBannersWhenGameReady('),onlineCtx);
  onlineCtx.phase7PresentAuthoritativeOutcome({state:{}},{type:'VICTORY',reason:'MORALE_DEPLETED',winner:1,
    zoneResults:[0,1,2].map(zone=>({zone,scores:[1,5],controller:1})),zoneWins:[0,3]});
  assert(multiplayerRevealed);assert(resultsShown);
  console.log('Reported legacy card, repeat-match and morale reveal regressions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
