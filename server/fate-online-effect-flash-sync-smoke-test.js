'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rendering = fs.readFileSync(path.join(root, 'src', 'scripts', '06-rendering-and-helpers.js'), 'utf8');
const structural = fs.readFileSync(path.join(root, 'src', 'scripts', '00-structural-helpers.js'), 'utf8');
const rooms = fs.readFileSync(path.join(root, 'src', 'scripts', '18-online-rooms.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'src', 'scripts', '18a-online-effect-transactions.js'), 'utf8');
const authority = fs.readFileSync(path.join(root, 'server', 'fate-ws-authority.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(
  rendering,
  /function markCardEffectFlash[\s\S]*opts\.onlineRemote !== true[\s\S]*window\.fateBroadcastOnlineEffectFlash\(card, card\._effectFlash, opts\)/,
  'all locally-triggered card effect flashes must enter the online presentation path'
);
assert.match(
  rooms,
  /window\.fateBroadcastOnlineEffectFlash[\s\S]*type:'CARD_EFFECT_FLASH'[\s\S]*capturePresentationEvent\(event\)[\s\S]*sendAction\('EFFECT_CINEMATIC'/,
  'transactional effect flashes must join the parent action, with the legacy cinematic packet retained only as fallback'
);
assert.match(
  transactions,
  /function capturePresentationEvent\(event\)[\s\S]*tx\.payload\.presentationEvents[\s\S]*presentation-captured/,
  'the reversible transaction layer must own captured presentation events'
);
assert.match(
  rooms,
  /function showOnlineCardEffectFlashEvent[\s\S]*getFateFeedbackPresentationBlockUntil[\s\S]*scheduleOnlineEffectFlashPresentationRetry[\s\S]*onlineRemote:true/,
  'remote effect flashes must wait for active cinematics, retry until their target exists, and never echo back to authority'
);
assert.match(
  rendering,
  /function holdEffectActivationPresentationUntil[\s\S]*_effectActivationPresentationLockUntil[\s\S]*function queueEffectActivationCinematic[\s\S]*holdEffectActivationPresentationUntil[\s\S]*function showEffectActivationCinematic[\s\S]*holdEffectActivationPresentationUntil/,
  'effect activation cinematics must own a shared presentation lock whether they start immediately or wait in the queue'
);
assert.match(
  structural,
  /function getFateFeedbackPresentationBlockUntil[\s\S]*_effectActivationPresentationLockUntil/,
  'Fate number feedback must honor the effect activation presentation lock'
);
assert.match(
  rooms,
  /function maybeFlashOnlineTargetEffectDeltas\(action[\s\S]*effectTransactionVersion\) === 1\) return false[\s\S]*function maybeFlashOnlineAutomaticEffectDeltas\(action[\s\S]*effectTransactionVersion\) === 1\) return false/,
  'transaction-owned overlays must not also run through the legacy Fate-delta reconstruction fallback'
);
assert.match(
  rooms,
  /type === 'CARD_EFFECT_FLASH'[\s\S]*showOnlineCardEffectFlashEvent\(action, event, index\)/,
  'the shared online presentation dispatcher must render card effect flash events'
);
assert.doesNotMatch(
  rooms,
  /type !== 'REACTION_CHOICE'\) maybeShowOnlinePresentationEvents/,
  'reaction choices must not suppress presentation events released by the authority after an effect is allowed'
);
assert.match(
  rooms,
  /applyAuthoritativePostState\(action,[\s\S]*maybeShowOnlinePresentationEvents\(action\)[\s\S]*applyAuthoritativePostState\(directAction,[\s\S]*maybeShowOnlinePresentationEvents\(directAction\)/,
  'both buffered and immediate authoritative state paths must present released effect overlays'
);
assert.match(
  authority,
  /turnAgnosticEffectiveAction = \/\^\(PICK_LANDSCAPE_ZONE\|HAND_LIMIT_DISCARD\|ALI_INDOMITABLE_TRANSFER\|TAYLOR_OPENING_COPY\|EFFECT_CINEMATIC\)\$/,
  'presentation-only effect packets must be accepted even if the triggering animation fires after the active player changes'
);
assert.match(
  rooms,
  /captureOnlineTransientEffectFlashes[\s\S]*restoreOnlineTransientEffectFlashes\(g\.board, transientEffectFlashes\)/,
  'active opponent overlays must survive canonical card-object replacement for their full single-player lifetime'
);
assert.match(
  authority,
  /gateResult\.suppressPresentationEvents[\s\S]*delete action\.payload\.presentationEvents[\s\S]*gateResult\.presentationEvents/,
  'authority must withhold a captured overlay during a reaction and release it only with the reaction result'
);
assert.match(index, /06-rendering-and-helpers\.js\?v=1785160801/, 'rendering cache bust must include effect activation presentation locking');
assert.match(index, /18-online-rooms\.js\?v=1785160801&sync=1785160801/, 'online room cache bust must include single-flight Ali transfers and reaction-released effect overlays');
assert.match(index, /18a-online-effect-transactions\.js\?v=1785160801/, 'transactional search metadata fixes must bypass cached clients');

console.log('fate-online-effect-flash-sync smoke passed');
