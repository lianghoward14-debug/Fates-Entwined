import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  normalizePhase7GameSettings,
  PHASE7_MULTIPLAYER_LANDSCAPE_IDS,
  resolvePhase7GameSettings
} from './phase7-game-settings.mjs';

assert.equal(PHASE7_MULTIPLAYER_LANDSCAPE_IDS.length, 24);

// Every selected landscape must survive normalization and resolution exactly;
// no mode is allowed to collapse a valid choice back to Pacifica/igb1.
for(const landscapeId of PHASE7_MULTIPLAYER_LANDSCAPE_IDS){
  const settings = {landscapeMode:'selected', landscapeId, turnTimerMinutes:7};
  const normalized = normalizePhase7GameSettings(settings);
  const resolved = resolvePhase7GameSettings(normalized, `selected:${landscapeId}`);
  assert.equal(normalized.landscapeMode, 'selected');
  assert.equal(normalized.landscapeId, landscapeId);
  assert.equal(resolved.resolvedLandscapeId, landscapeId);
  assert.equal(resolved.turnTimerSeconds, landscapeId === 'igb14' ? 30 : 420);
}

// Random is deterministic for one match seed, shared by both clients, and is
// genuinely drawn from the whole landscape pool rather than always igb1.
const randomResults = new Set();
for(let index = 0; index < 200; index += 1){
  const seed = `random-landscape-${index}`;
  const first = resolvePhase7GameSettings({landscapeMode:'random', landscapeId:'igb1', turnTimerMinutes:3}, seed);
  const second = resolvePhase7GameSettings({landscapeMode:'random', landscapeId:'igb20', turnTimerMinutes:3}, seed);
  assert.equal(first.resolvedLandscapeId, second.resolvedLandscapeId, 'the preview card must not influence Random');
  assert(PHASE7_MULTIPLAYER_LANDSCAPE_IDS.includes(first.resolvedLandscapeId));
  randomResults.add(first.resolvedLandscapeId);
}
assert(randomResults.size >= 15, `random resolution covered only ${randomResults.size} landscapes`);
assert(randomResults.has('igb1'));
assert([...randomResults].some(id=>id !== 'igb1'));

// Legacy deterministic fixture callers remain selected, while an absent
// production setting is random and therefore cannot silently mean Pacifica.
assert.deepEqual(normalizePhase7GameSettings(null, 'igb17'), {
  landscapeMode:'selected', landscapeId:'igb17', turnTimerMinutes:3,
  healthPressureSeals:true, pressureCardReworks:true,
  zoneControlRework:true, expandedContestedRow:true, zoneLayout444:true
});
assert.equal(normalizePhase7GameSettings(null, '').landscapeMode, 'random');
assert.equal(normalizePhase7GameSettings({}).healthPressureSeals,true,'normal matchmaking defaults to Morale');
assert.equal(normalizePhase7GameSettings({landscapeMode:'selected',landscapeId:'igb1',turnTimerMinutes:3}).healthPressureSeals,true,'Warfront settings without a flag still enable Morale');
assert.equal(
  normalizePhase7GameSettings({healthPressureSeals:true}).healthPressureSeals,
  true,
  'an explicit client Morale flag survives authoritative normalization'
);
assert.equal(normalizePhase7GameSettings({healthPressureSeals:false}).healthPressureSeals, false);

console.log('authoritative-v3 Phase 7 game settings smoke test passed');

// The shipping page and Warfront queue must actually request the ruleset.
const page=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const assignment=page.match(/window\.FATE_MORALE_PRESSURE_RULES_ENABLED = [^;]+;/)[0];
for(const [query,expected] of [['',true],['fateMoralePressureRules=0',false],['fateMoralePressureRules=1',true]]){
  const context={window:{},params:new URLSearchParams(query)};
  vm.runInNewContext(assignment,context);
  assert.equal(context.window.FATE_MORALE_PRESSURE_RULES_ENABLED,expected);
}
const war=fs.readFileSync(new URL('../../src/scripts/47-challenger-war-event.js',import.meta.url),'utf8');
assert.match(war,/gameSettings:\{landscapeMode:'selected'[^}]*healthPressureSeals:true/,'Warfront explicitly requests Morale');
