import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  createInitialState,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {legalCommandTemplates} from '../../shared/engine/legal-commands.mjs';
import {command} from './test-helpers.mjs';

const browserSource = fs.readFileSync(new URL('../../src/scripts/01-data-and-state.js', import.meta.url), 'utf8');
const manualConfigStart = browserSource.indexOf('window.FATE_PLAYER_TIMED_MANUAL_EFFECT_CARD_IDS');
const manualConfigEnd = browserSource.indexOf('\n};', manualConfigStart) + 3;
assert(manualConfigStart >= 0 && manualConfigEnd > manualConfigStart);
const browser = {window:{}};
vm.createContext(browser);
vm.runInContext(browserSource.slice(manualConfigStart, manualConfigEnd), browser);
assert.equal(browser.window.fateEffectRequiresManualActivationId('20'), true,
  'single-player must keep Shield Wall out of automatic activation');
assert.equal(browser.window.fateEffectRequiresManualActivationId({id:'20'}), true,
  'single-player must show Shield Wall as a manual board action');

const definitions = [
  {id:'20',name:'South Wind Spearman',type:'Supporter',aff:'eventide',fate:1,cost:0}
];
let state = createInitialState({
  matchId:'shield-wall-manual-regression',seed:'shield-wall-manual-regression',handSize:1,
  cardDefinitions:definitions,players:[{id:'p0',deckIds:['20']},{id:'p1',deckIds:[]}]
});
const spearman = state.players[0].hand[0];
let result = reduceCommand(state, command(state,'p0',1,'SET_CARD',{
  cardIid:spearman.iid,destination:{z:0,r:2,c:0}
}), {playerId:'p0'});
assert.equal(result.ok,true);
state = result.state;
assert.equal(state.board[0][2][0].counters.effectUses || 0,0,
  'multiplayer must not activate Shield Wall when it is set');
const activation = legalCommandTemplates(state,0).find(candidate=>
  candidate.type === 'ACTIVATE_EFFECT' && candidate.payload?.sourceIid === spearman.iid
);
assert(activation,'multiplayer must expose the Shield Wall activation command');
assert.equal(activation.manualOnly,true);
result = reduceCommand(state, command(state,'p0',2,'ACTIVATE_EFFECT',{
  sourceIid:spearman.iid,userActivated:true
}), {playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.board[0][2][0].counters.effectUses,1,
  'multiplayer activates Shield Wall only after the explicit button command');

console.log('Shield Wall manual activation regression passed for single-player UI and multiplayer authority');
