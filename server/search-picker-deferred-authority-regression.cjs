const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const online = fs.readFileSync('src/scripts/18-online-rooms.js', 'utf8');
const helpers = fs.readFileSync('src/scripts/06-rendering-and-helpers.js', 'utf8');
const slice = (source, start, end)=>source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const wrapper = slice(online, "    if(typeof window.pickCardsVisual === 'function' && !originals.pickCardsVisual)", "    if(typeof window.showZonePicker === 'function' && !originals.showZonePicker)");
const bypass = slice(online, '  function withOnlinePromptBypass(', '  function sendServerPendingAction(');
const defer = slice(helpers, 'function getChoicePresentationDelayMs(', 'function pickCardInZone(');
// Execute the production picker entry, including both animation deferral paths;
// stop at the DOM rendering boundary and expose its confirmation callback.
const entry = slice(helpers, 'function pickCardsVisual(', "  if(!cards.length){toast('No matching cards found')")
  + '\n mountedConfirm = onConfirm; mountedOptions = opts; }';

for(const cardName of ['IB Student', 'Johnathan Kirby']){
  for(const delayPath of ['cinematic', 'placement']){
    const timers = [];
    let animationDelay = 80;
    let confirmations = 0;
    let blocked = 0;
    const g = {turn:1, currentPlayer:0, _onlinePlayerIndex:0};
    const ctx = {
      bindLocalCardPickerLifetime:opts=>opts, G:g, originals:{}, mountedConfirm:null, mountedOptions:null, Date,
      gameState:()=>g, setTimeout:fn=>timers.push(fn),
      getInteractionAnimationDelayMs:()=>animationDelay,
      isOnlineMatchState:()=>true, isRemoteOpponentReplay:()=>false,
      canSendLocalAction:()=>{ blocked++; return false; }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(defer + entry + bypass + wrapper, ctx);
    if(delayPath === 'placement') ctx.deferPickerUntilAnimationFinishes = ()=>false;
    const cards = [{id:cardName === 'IB Student' ? '60' : '13', iid:'chosen'}];
    const options = {title:cardName, immediate:delayPath === 'cinematic'};
    ctx.withOnlinePromptBypass(g, ()=>ctx.pickCardsVisual(cards, options, chosen=>{
      assert.equal(chosen, cards);
      confirmations++;
    }));
    assert.equal(g._onlineServerPromptBypass, false);
    assert.equal(ctx.__fateOnlineServerPromptBypass, false);
    assert.equal(options.authoritativeDirectAction, undefined, 'do not mutate caller options');
    assert.equal(timers.length, 1);
    timers.shift()(); // A second animation wait must also preserve ownership.
    assert.equal(timers.length, 1);
    animationDelay = 0;
    timers.shift()();
    assert.equal(ctx.mountedOptions.authoritativeDirectAction, true);
    ctx.mountedConfirm(cards);
    assert.equal(confirmations, 1, 'first confirmation reaches the authoritative callback');
    assert.equal(blocked, 0, 'no legacy action is attempted');
    assert.equal(g._deferredCardPickers, 0);
    // Ordinary legacy calls must still go through the existing authority fence.
    ctx.pickCardsVisual(cards, {}, ()=>assert.fail('legacy callback must be blocked'));
    ctx.mountedConfirm(cards);
    assert.equal(blocked, 1);
    console.log(`PASS: ${cardName}, ${delayPath} deferral, first confirmation and legacy fence`);
  }
}
