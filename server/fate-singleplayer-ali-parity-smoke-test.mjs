import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const setup = fs.readFileSync(new URL('../src/scripts/04-game-setup.js', import.meta.url), 'utf8');
const gameplay = fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
const rendering = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const signatureEnd = source.indexOf(') {', start);
  assert.notEqual(signatureEnd, -1, `${name} must have a conventional function signature`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for(let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if(quote) {
      if(escaped) escaped = false;
      else if(char === '\\') escaped = true;
      else if(char === quote) quote = '';
      continue;
    }
    if(char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if(char === '{') depth += 1;
    if(char === '}') {
      depth -= 1;
      if(depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${name} must have a complete body`);
}

const scheduleAli = functionSource(setup, 'scheduleAliIndomitableHandTransfer');
assert.doesNotMatch(scheduleAli, /firstSetMade|first card|first set/i,
  'single-player Ali must not wait for the first board set before starting his transfer');
assert.match(scheduleAli, /classList\.contains\('active'\)[\s\S]*setTimeout\(function\(\)[\s\S]*5000/,
  'single-player Ali must remain visible for five seconds once the game screen is active');
assert.match(scheduleAli, /_bh03HandLimitPendingUntilTurnStart/,
  'single-player Ali must track the same deferred hand-limit activation used by multiplayer');

const resolvingBanner = functionSource(gameplay, 'showAliIndomitableResolvingBanner');
assert.match(resolvingBanner, /showAliIndomitableTransferPendingBanner/,
  'clicking pending Ali must use the multiplayer pending-transfer feedback');
assert.doesNotMatch(gameplay, /Wait Until the First Set/,
  'the obsolete first-set instruction must be removed');
assert.match(gameplay, /G\.currentPlayer = 1 - G\.currentPlayer;[\s\S]{0,120}activateAliIndomitableHandLimitForPlayer\(G\.currentPlayer\)/,
  'Ali hand-limit activation must run exactly at the new recipient turn boundary');

const getLimit = functionSource(rendering, 'getActiveHandLimit');
const limitContext = {
  G:{players:[{hand:[]}, {hand:[{
    id:'bh03',
    _bh03OpponentHand:true,
    _bh03HandLimitPendingUntilTurnStart:true
  }]}]}
};
vm.runInNewContext(`${getLimit}; globalThis.result = getActiveHandLimit(1);`, limitContext);
assert.equal(limitContext.result, 12, 'Ali must not cap the recipient before their next turn starts');
limitContext.G.players[1].hand[0]._bh03HandLimitPendingUntilTurnStart = false;
vm.runInNewContext('globalThis.result = getActiveHandLimit(1);', limitContext);
assert.equal(limitContext.result, 6, 'Ali must cap the recipient at six after their turn starts');

const activateLimit = functionSource(gameplay, 'activateAliIndomitableHandLimitForPlayer');
const pendingAli = {
  id:'bh03',
  owner:0,
  _bh03TransferPending:true,
  _bh03HandLimitRecipient:1,
  _bh03HandLimitPendingUntilTurnStart:true
};
const activationContext = {G:{players:[{hand:[pendingAli]}, {hand:[]}]}, window:{}};
vm.runInNewContext(`${activateLimit}; globalThis.activated = activateAliIndomitableHandLimitForPlayer(1);`, activationContext);
assert.equal(activationContext.activated, true);
assert.equal(pendingAli._bh03HandLimitPendingUntilTurnStart, false,
  'the turn boundary must activate the cap even if the five-second visual preview is still finishing');

assert.match(index, /04-game-setup\.js\?v=1787630001/);
assert.match(index, /05-gameplay-core\.js\?v=1787800001/);
assert.match(index, /06-rendering-and-helpers\.js\?v=1787800001/);

console.log('single-player Ali multiplayer-parity smoke passed');
