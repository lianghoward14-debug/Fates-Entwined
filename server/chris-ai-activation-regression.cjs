const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ai = fs.readFileSync('src/scripts/07-ai.js', 'utf8');
const core = fs.readFileSync('src/scripts/05-gameplay-core.js', 'utf8');
const eligibility = core.slice(core.indexOf('function canUseManualCharacterEffect('), core.indexOf('function automaticBoardEffectsEnabled('));
const effect = ai.slice(ai.indexOf('async function aiRunEffect('), ai.indexOf('// Mandatory Indie sequencing'));

(async () => {
  for (const owner of [0, 1]) for (const id of ['40', 'bh05']) {
    const card = {id, iid:'chris', owner, type:id === '40' ? 'Improvisor' : 'Initiator', usesLeft:2};
    const G = {currentPlayer:owner, aiPlayer:owner, board:[[[card]]], erbsActive:[false, false]};
    let finish, banners = 0, willing = true;
    const ctx = {G, MANUAL_EFFECT_BLOCKED_CARD_IDS:new Set(), getCardRuntimeEffectId:()=>'40',
      aiShouldActivateOptionalDrawEffect:()=>willing, checkReactions:async()=>true,
      playEffectActivationCinematic:()=>{banners++; return new Promise(resolve=>{finish=resolve;});},
      log:()=>{}, renderGame:()=>{}};
    vm.createContext(ctx);
    vm.runInContext(eligibility + effect, ctx);
    willing = false;
    await ctx.aiRunEffect(card, 0, 0, 0);
    assert.equal(banners, 0, 'declined activation must not show a banner');
    willing = true;
    const first = ctx.aiRunEffect(card, 0, 0, 0);
    await ctx.aiRunEffect(card, 0, 0, 0);
    assert.equal(banners, 1, 'overlapping activation must not restart the banner');
    assert.equal(card.usesLeft, 2, 'effect must wait for the complete cinematic');
    finish(); await first;
    assert.equal(card.usesLeft, 1);
    assert.equal(G.erbsActive[owner], true);
    await ctx.aiRunEffect(card, 0, 0, 0);
    assert.equal(banners, 1, 'armed Chris must not play another cinematic');
    assert.equal(card.usesLeft, 1);
    G.erbsActive[owner] = false; // Next eligible draw consumes the bonus.
    const second = ctx.aiRunEffect(card, 0, 0, 0);
    finish(); await second;
    assert.equal(banners, 2);
    assert.equal(card.usesLeft, 0, 'the legitimate second use remains available after drawing');
    G.erbsActive[owner] = false;
    await ctx.aiRunEffect(card, 0, 0, 0);
    assert.equal(banners, 2, 'exhausted Chris must not play a cinematic');
  }
  console.log('Chris AI activation: pending bonus, overlapping cinematics, copied effects and two-use limit passed for both seats.');
})().catch(error=>{console.error(error); process.exitCode=1;});
