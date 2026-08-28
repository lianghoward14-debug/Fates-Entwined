const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gameplay = fs.readFileSync(path.join(root, 'src/scripts/05-gameplay-core.js'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'src/scripts/07-ai.js'), 'utf8');
const codexUi = fs.readFileSync(path.join(root, 'src/scripts/45-match-ui-codex.js'), 'utf8');
const authorityAdapter = fs.readFileSync(path.join(root, 'src/scripts/authoritative-v3-single-player-adapter.mjs'), 'utf8');
const authorityScreen = fs.readFileSync(path.join(root, 'src/scripts/authoritative-v3-single-player-screen.mjs'), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start + 1) : source.length;
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

const endTurn = functionBody(gameplay, 'endTurn', 'showPassTurn');
const ownershipCheck = endTurn.indexOf('G._aiRunning && isActualAITurn');
const debounceRead = endTurn.indexOf('G._turnInputLockUntil && Date.now()');
const debounceWrite = endTurn.indexOf('G._turnInputLockUntil = isAICompletion ? 0 : Date.now() + 350');

assert(ownershipCheck >= 0, 'endTurn must block only a genuinely active AI-owned turn');
assert(ownershipCheck < debounceRead && ownershipCheck < debounceWrite,
  'AI ownership must be checked before consuming the shared input debounce');
assert.match(endTurn, /G\._aiRunning\s*&&\s*!isActualAITurn[\s\S]*G\._aiRunning\s*=\s*false/,
  'a stale AI-running flag must be cleared during a human-owned turn');
assert.doesNotMatch(endTurn, /if\s*\(G\._aiRunning\)\s*return/,
  'a bare AI-running flag must never block both human click and timeout paths');
assert.match(endTurn, /isAICompletion[\s\S]*!isAICompletion\s*&&\s*G\._turnInputLockUntil/,
  'the human click debounce must not reject natural AI completion');

const nextPlayerTurn = functionBody(gameplay, 'nextPlayerTurn', 'applyContinuousEffects');
assert.match(nextPlayerTurn, /G\.currentPlayer\s*=\s*1\s*-\s*G\.currentPlayer[\s\S]*G\._deferredEndTurn\s*=\s*null/,
  'a completed transition must clear deferred end-turn state');
assert.match(nextPlayerTurn, /!\(G\.aiEnabled\s*&&\s*G\.currentPlayer\s*===\s*G\.aiPlayer\)[\s\S]*G\._aiRunning\s*=\s*false/,
  'a new human turn must clear stale AI lifecycle state');

const runAITurn = functionBody(ai, 'runAITurn', 'aiSleep');
assert.match(runAITurn, /G\._aiRunning\s*=\s*false;[\s\S]*endTurn\(\{aiCompletion:true, skipEffectWarning:true, skipModalDeferral:true\}\)/,
  'AI completion must release its running state before using shared endTurn');
assert.doesNotMatch(runAITurn, /if\s*\(!G\._aiAbort\)\s*\{[\s\S]*LEGACY_END_TURN/,
  'a late lifecycle abort bit must not silently discard an already-validated AI turn completion');
assert.match(runAITurn, /G\.currentPlayer\s*!==\s*G\.aiPlayer[\s\S]*G\._aiTurnToken\s*!==\s*aiTurnToken[\s\S]*return/,
  'an expired AI task must not end the following human turn');

assert.match(codexUi, /function invokeEndTurn\(\)\s*\{[\s\S]*fate-authority-v3-single-player-active[\s\S]*currentScreen\?\.\(\)[\s\S]*screen\.submit\(command\)/,
  'the visible Codex end-turn control must submit to the authoritative single-player owner');
assert.match(endTurn, /v3LocalScreen[\s\S]*return false/,
  'legacy endTurn must not mutate state while authoritative single-player is active');
assert.match(codexUi, /root\.querySelector\('\[data-end\]'\)\.onclick=invokeEndTurn/,
  'the visible Codex end-turn control must use the authoritative forwarding handler');
assert.match(codexUi, /'turn-hud-turn':'tp-cur'[\s\S]*'turn-hud-player':'tp-phase'/,
  'the visible Codex clock must read the authoritative single-player turn fields');
assert.match(authorityAdapter, /const expectedType = String\(type \|\| ''\)/,
  'the authoritative AI adapter must normalize the selected command type');
assert.match(authorityAdapter, /String\(command\?\.type \|\| ''\) === expectedType[\s\S]*stableStringify\(command\?\.payload \|\| \{\}\) === expectedPayload/,
  'the authoritative AI adapter must match legal commands by type and payload, not incidental metadata');
assert.match(authorityAdapter, /template = chooseDeterministicV3AiCommand\(legal\)/,
  'the authoritative AI loop must fall back to a deterministic legal command');
const subscription = authorityAdapter.slice(
  authorityAdapter.indexOf('this.session.subscribe(change=>'),
  authorityAdapter.indexOf("this.publish('SESSION_CREATED')")
);
assert(subscription.indexOf('this.publish(change.type)') < subscription.indexOf('this.onEvents(change.events'),
  'authoritative state must publish before morale/event presentation listeners run');
assert.match(authorityScreen, /syncTurnTimer\(view\)[\s\S]*autoEndTimedOutTurn\(\)/,
  'the authoritative single-player screen must own the local player timeout');
assert.match(authorityScreen, /this\.view\.legalCommands\?\.find\(item=>item\.type === 'END_TURN'\)/,
  'the player timeout must submit only an engine-legal END_TURN command');

console.log('turn-end ownership smoke test passed');
