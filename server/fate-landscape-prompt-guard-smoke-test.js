const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const helpersText = fs.readFileSync(path.join(root, 'src/scripts/06-rendering-and-helpers.js'), 'utf8');
const roomsText = fs.readFileSync(path.join(root, 'src/scripts/18-online-rooms.js'), 'utf8');
const authorityText = fs.readFileSync(path.join(root, 'server/fate-ws-authority.js'), 'utf8');
const start = helpersText.indexOf('function landscapeZonePromptKey');
const endMarker = 'window.chooseLandscapeZone = chooseLandscapeZone;';
const end = helpersText.indexOf(endMarker, start);

assert(start >= 0 && end > start, 'landscape prompt guard block is missing');
assert.match(roomsText, /online-landscape-prompt-duplicate-blocked/, 'online duplicate landscape diagnostic is missing');
assert.match(roomsText, /pending\.submitted\s*=\s*true[\s\S]*sendOptimisticAction\('PICK_LANDSCAPE_ZONE'/, 'landscape submission must lock before send');
assert.match(roomsText, /pending\.resolved\s*=\s*true;[\s\S]*_onlinePendingLandscapeZonePicker\s*=\s*null;[\s\S]*pending\.onChoose/, 'remote landscape prompt must clear before callback');
assert.match(roomsText, /preserveLandscapePrompt[\s\S]*fateIsLandscapeZonePromptGuarded/, 'authority sync must preserve an active landscape picker');
assert.match(helpersText, /choiceState\.committed[\s\S]*landscape-choice-card[\s\S]*onChoose/, 'landscape replacement cards must submit once');
assert.match(helpersText, /let frontierResolved = false[\s\S]*if\(frontierResolved\) return false/, 'Frontier resolution must be one-shot');
assert.match(helpersText, /let qingdaoResolved = false[\s\S]*if\(qingdaoResolved\) return false/, 'Qingdao resolution must be one-shot');
assert.match(helpersText, /let drawPromptSettled = false[\s\S]*if\(drawPromptSettled\) return false/, 'outside-draw landscape prompt must settle once');
assert.match(authorityText, /function findAcceptedLandscapePrompt[\s\S]*PICK_LANDSCAPE_ZONE[\s\S]*landscapePromptKey/, 'authority must index accepted landscape prompt keys');
assert.match(authorityText, /priorLandscapePrompt[\s\S]*replayAcceptedClientAction/, 'authority must replay rather than accept a second landscape choice');

let modalCount = 0;
let callbackCount = 0;
let modalButtons = [];
const modal = {dataset:{}};
const context = {
  Date,
  Object,
  Math,
  Number,
  String,
  Array,
  window:{},
  G:{
    turn:10,
    landscapeId:'igb8',
    _onlineRoomCode:'ROOM1',
    _onlineSeed:'seed-1',
    aiEnabled:false,
    aiPlayer:1
  },
  getCurrentLandscape:()=>({id:'igb8'}),
  getZoneScore:()=>0,
  escapeHtml:value=>String(value || ''),
  toast:()=>{},
  closeModal:()=>{},
  showModal:()=>{
    modalCount += 1;
    modalButtons = [0, 1, 2].map(zone=>({dataset:{zone:String(zone)}, disabled:false, onclick:null}));
  },
  document:{
    getElementById:id=>id === 'modal' ? modal : {innerHTML:''},
    querySelectorAll:selector=>selector.includes('landscape-zone-choice') ? modalButtons : []
  }
};
context.window.window = context.window;
vm.runInNewContext(helpersText.slice(start, end + endMarker.length), context);

const choose = context.window.chooseLandscapeZone;
assert.strictEqual(typeof choose, 'function');
assert.strictEqual(choose(0, 'Qingdao Breakthrough', 'Choose one zone.', ()=>{ callbackCount += 1; }, {kind:'row'}), true);
assert.strictEqual(choose(0, 'Qingdao Breakthrough', 'Choose one zone.', ()=>{ callbackCount += 1; }, {kind:'row'}), false, 'duplicate prompt must be refused');
assert.strictEqual(modalCount, 1, 'duplicate landscape delivery opened a second modal');

modalButtons[0].onclick();
modalButtons[0].onclick();
assert.strictEqual(callbackCount, 1, 'double click resolved one landscape prompt more than once');

assert.strictEqual(choose(0, 'Qingdao Breakthrough', 'Choose one zone.', ()=>{ callbackCount += 1; }, {kind:'row'}), false, 'resolved prompt reopened in the same turn');
context.G.turn = 11;
assert.strictEqual(choose(0, 'Qingdao Breakthrough', 'Choose one zone.', ()=>{ callbackCount += 1; }, {kind:'row'}), true, 'new-turn prompt key should remain available');
assert.strictEqual(modalCount, 2);

console.log('Landscape prompt guard smoke test passed');
