'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const corePath = path.join(__dirname, '..', 'src', 'scripts', '05-gameplay-core.js');
const core = fs.readFileSync(corePath, 'utf8');
const setup = fs.readFileSync(path.join(__dirname, '..', 'src', 'scripts', '04-game-setup.js'), 'utf8');

assert.match(setup, /addCardToHand\(player, card, \{ openingHand: !!options\.openingHand, arrivalKind:'draw' \}\)/, 'single-player opening draws must identify Taylor as a drawn card');
assert.match(setup, /String\(card\.id \|\| ''\) === 'bh05'[\s\S]{0,240}inferredArrivalKind === 'draw'[\s\S]{0,500}_bh05GeneratedCopy = true[\s\S]{0,180}_bh05GeneratedFromIid = card\.iid/, 'single-player drawn/opening-hand Taylor must create one linked second copy');
assert.match(core, /function getWhisperCoordinatorEntries[\s\S]{0,500}card\.type !== 'Coordinator'/, 'Shizuku source selection must use the printed Coordinator type, so Taylor never qualifies through a copied effect');
assert.match(core, /function commitWhisperLandscapeConversion[\s\S]{0,500}liveSource\.type !== 'Coordinator'/, 'Shizuku conversion must revalidate that its live source is officially a Coordinator');

function extractFunction(name, nextName){
  const start = core.indexOf(`function ${name}(`);
  const end = core.indexOf(`\n${nextName}`, start);
  assert(start >= 0 && end > start, `could not extract ${name}`);
  return core.slice(start, end);
}

const helperSource = extractFunction('liveTaylorCopySource', 'async function resolveTaylorCopiedEffect');
const resolverStart = core.indexOf('async function resolveTaylorCopiedEffect(');
const resolverEnd = core.indexOf('\nwindow.resolveTaylorCopiedEffect', resolverStart);
assert(resolverStart >= 0 && resolverEnd > resolverStart, 'could not extract resolveTaylorCopiedEffect');
const resolverSource = core.slice(resolverStart, resolverEnd);

const staleTaylor = {
  id:'bh05',
  iid:'taylor-online-1',
  type:'Initiator',
  owner:0,
  effectUsedInitial:true,
  _effectTurnLocked:true,
  whenSetActivated:false
};
const liveTaylor = Object.assign({}, staleTaylor);
const selected = {
  id:'supporter-copy',
  iid:'supporter-copy-1',
  name:'Copied Supporter',
  ability:'Copied Ability',
  effect:'Gain Fate.',
  type:'Supporter'
};
let resolvedSource = null;

const context = {
  G:{
    board:[[[liveTaylor]]],
    _onlineRoomCode:'TAYLOR',
    _suppressEffectPrompt:false
  },
  findBoardCardByIid(iid){
    return iid === liveTaylor.iid ? liveTaylor : null;
  },
  async runWhenSetEffect(card){
    resolvedSource = card;
    card.currentFate = 17;
  },
  async triggerCharacterEffect(){
    throw new Error('Supporter copy should use runWhenSetEffect');
  },
  INITIAL_SET_INITIATOR_IDS:new Set(),
  WHEN_SET_IDS:new Set(),
  toast(){},
  renderEffectResolutionForPlayer(){},
  window:{}
};

vm.createContext(context);
vm.runInContext(`${helperSource}\n${resolverSource}\nthis.resolveTaylorCopiedEffect = resolveTaylorCopiedEffect;`, context);

(async()=>{
  const copied = await context.resolveTaylorCopiedEffect(staleTaylor, 0, 0, 0, selected);
  assert.strictEqual(copied, true, 'Taylor should resolve the selected copied effect');
  assert.strictEqual(resolvedSource, liveTaylor, 'multiplayer copy must resolve against the live board Taylor');
  assert.strictEqual(liveTaylor._bh05CopiedCardId, selected.id, 'live Taylor must retain the copied card identity');
  assert.strictEqual(liveTaylor._bh05CopiedAbility, selected.ability, 'live Taylor must retain the copied ability');
  assert.strictEqual(liveTaylor.currentFate, 17, 'the copied effect must mutate live Taylor');
  assert.strictEqual(liveTaylor.id, 'bh05', 'Taylor identity must be restored after copying');
  assert.strictEqual(liveTaylor.type, 'Initiator', 'Taylor type must be restored after copying');
  assert.strictEqual(staleTaylor._bh05CopiedCardId, undefined, 'a stale multiplayer snapshot must not receive the copy');
  console.log('Brave Horizons Taylor multiplayer smoke test passed');
})().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
