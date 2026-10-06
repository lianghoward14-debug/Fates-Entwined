const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync('src/scripts/' + name, 'utf8');
const adapter = read('render-v2/04-match-renderer-adapter.js');
const audio = read('08-audio-and-meta-ui.js');
const ai = read('07-ai.js');
const online = read('18-online-rooms.js');
const helpers = read('06-rendering-and-helpers.js');
function section(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start);
  return text.slice(from, to);
}
const callbacks = [], frames = [], sounds = [];
const card = {id:'bh19', iid:'abed', owner:0};
const context = {
  window:{}, G:{turn:1, board:[[[card]]], _bh19HighTStatuses:[{playerIndex:0, turn:1}]},
  DIRTY_BOARD_CARDS:4, highTBeatTimer:0,
  lastReport:{available:true}, lastLayout:{}, lastSnapshot:{}, lastCanvasMetrics:{}, lastHitMap:{cards:[{card}]},
  setTimeout:fn => { callbacks.push(fn); return callbacks.length; },
  ownsBoard:()=>true, isActiveMatchScreen:()=>true,
  renderFromGameState:opts=>frames.push(opts),
  scheduleRender:()=>assert.fail('High T must not enter the shared deferred queue'),
  playSfxDeferred:type=>sounds.push(type), playCardSoundDeferred:()=>{},
};
vm.createContext(context);
vm.runInContext(section(adapter, '  function isCardOverlayPulseSource(', '  function scheduleLowMoraleSupporterPulse('), context);
vm.runInContext(section(adapter, '  function isPersistentOverlayAnimationFrame(', '  function isHighTAnimationFrame('), context);
vm.runInContext(section(helpers, 'function isHighTSourceCardActive(', 'function updateOpponentHandLabelDensity('), context);
vm.runInContext(section(adapter, '  function isHighTAnimationFrame(', '  function drawCardVisual('), context);
context.scheduleHighTBeat();
for(let i=0;i<5;i++) callbacks.shift()();
assert.equal(frames.length,5);
assert.equal(callbacks.length,1,'pulse continues without a gameplay redraw');
context.G.turn=2;
callbacks.shift()();
assert.equal(callbacks.length,0,'pulse ends with the turn');
assert.equal(context.isHighTAnimationFrame('high-t-beat',4),true);
assert.equal(context.isHighTAnimationFrame('high-t-beat+gameplay',4),false);
assert.equal(context.isHighTAnimationFrame('high-t-beat',12),false);
context.lastSnapshot=null;
assert.equal(context.isHighTAnimationFrame('high-t-beat',4),false);
context.lastSnapshot={};
// Execute the production render gate with an active action presentation.
Object.assign(context, {
  nowMs:()=>0, dirtyMaskForSource:()=>4, noteGameplayBurst(){},
  activeBoardSurface:()=>({}), ensureCanvas:()=>({getContext:()=>({})}),
  isActionAnimationActive:()=>true, isActionCommitRenderAllowed:()=>false,
  forbiddenActionDirtyMask:mask=>mask, deferActionDirtyRender:()=>sounds.push('deferred'),
  drawActionCompositorOnlyFrame:()=>true,
});
vm.runInContext(section(adapter, '  function renderFromGameState(options){', '    const vfxOnly =') + '\nreturn "pulse";\n}',context);
assert.equal(context.renderFromGameState({source:'high-t-beat',dirtyMask:4}),'pulse');
assert.equal(context.renderFromGameState({source:'gameplay',dirtyMask:4}),true);
assert.deepEqual(sounds.splice(0),['deferred']);
vm.runInContext(section(audio, 'function getCharacterSetSfxType(', 'function playFateSampleSfx('),context);
vm.runInContext(section(audio, 'function playCardSetAudio(', 'function applyAudioVolumes('),context);
const choices = ['Supporter','Initiator','Improvisor','Dauntless','Coordinator'];
const aiCinematic = section(ai, '    const hammerSet = !cardIsSupporterForRules', '    sourceList.splice(idx,1);');
for(const type of choices){
  context.card={id:'token2',type,achillesToken:true};
  Object.assign(context,{inst:context.card,cardIsSupporterForRules:type==='Supporter',isEffectFree:true,
    choice:{z:0,r:0,c:0},requestCharacterSetCinematic:()=>false});
  vm.runInContext('{'+aiCinematic+'if(!characterSetCinematic) playCardSetAudio(card);}',context);
  assert.deepEqual(sounds.splice(0),[type==='Supporter'?'supporterSet':'characterSet_'+type]);
}
Object.assign(context,{
  phase7FastPresentationMode:()=>false, phase7FindAnyCard:()=>context.card,
  phase7IsTokenCard:c=>!!c.achillesToken,
});
vm.runInContext(section(online,'  async function phase7PlayConsolidationCinematic(', '  function phase7PresentOutcomeAfterQueue('),context);
(async()=>{
  for(const type of choices){
    context.card={id:'token3',type,achillesToken:true};
    await context.phase7PlayConsolidationCinematic({}, {cardIid:'token',adaptiveToken:true,tributeIids:[]});
    assert.deepEqual(sounds.splice(0),[type==='Supporter'?'supporterSet':'characterSet_'+type]);
  }
  await context.phase7PlayConsolidationCinematic({}, {faceDown:true,adaptiveToken:true});
  assert.equal(sounds.length,0);
  console.log('High T continuous pulse and all five adaptive token placement sounds passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
