'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/scripts/18-online-rooms.js', 'utf8');
assert.match(
  source,
  /function phase7PlayImmediateCardSetFeedback[\s\S]*FateSquareFeedbackFx\.playSet/,
  'authoritative multiplayer must have an immediate accepted-placement animation path'
);
assert.match(
  source,
  /phase7CommitCurrentView\(placementPreview[\s\S]{0,700}phase7PlayImmediateCardSetFeedback\(view, events, batchId\)/,
  'multiplayer set feedback must start with the immediate placement preview'
);
assert.match(
  source,
  /feedbackRemaining[\s\S]{0,500}requestCharacterSetCinematic[\s\S]{0,300}delayMs:Math\.max\(90, feedbackRemaining\)/,
  'the character cinematic must follow the remaining physical set animation'
);

console.log('Phase 7 multiplayer card sets animate on accepted placement before queued cinematics');
