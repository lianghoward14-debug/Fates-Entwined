'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const moraleUi = read('src', 'scripts', '27-morale-pressure-ui.js');
const renderer = read('src', 'scripts', 'render-v2', '04-match-renderer-adapter.js');
const codexUi = read('src', 'scripts', '45-match-ui-codex.js');
const core = read('src', 'scripts', '05-gameplay-core.js');
const ai = read('src', 'scripts', '07-ai.js');

assert.match(
  moraleUi,
  /function waitForEffectActivationPresentation\(event\)[\s\S]*effectActivationPresentationActive\(\)\|\|moraleSourceResolutionPending\(event\)[\s\S]*setTimeout\(poll,40\)/,
  'Morale effect feedback must wait for both set resolution and its activation cinematic'
);
assert.match(
  moraleUi,
  /if\(\(type==='MORALE_DAMAGED'\|\|type==='MORALE_HEALED'\)[\s\S]{0,500}await waitForEffectActivationPresentation\(event\)[\s\S]{0,180}const sound = eventSound/,
  'Morale sound and animation must wait until the activated-effect cinematic ends'
);
assert.match(
  moraleUi,
  /'35':\{kind:'alexander_hellenic_glory',label:'Hellenic Glory'\}[\s\S]{0,180}'44':\{kind:'soviet_grenadiers',label:'The Bears of Russia'\}/,
  'Morale calculation must map Alexander and Soviet Grenadiers to their exact overlays'
);
const calculationDescriptors = moraleUi.match(/function flashMoraleCalculationSourceOverlays[\s\S]*?const descriptors=\{([\s\S]*?)\n    \};/)?.[1] || '';
assert.doesNotMatch(calculationDescriptors, /'34':/, 'Rozsi must not flash only on himself as a calculation source');
assert.match(calculationDescriptors, /'35':/);
assert.match(calculationDescriptors, /'44':/);
assert.doesNotMatch(calculationDescriptors, /'20':|'64':/, 'South Wind Spearman and Cook Islands Duelist must not receive calculation-damage overlays');
assert.match(
  moraleUi,
  /const contributingIids=new Set[\s\S]{0,1800}if\(hasSourceLedger&&!contributingIids\.has\(String\(card\.iid\|\|''\)\)\)return;/,
  'only cards credited with positive calculation damage may flash'
);
assert.match(
  read('shared', 'engine', 'morale-pressure.mjs'),
  /type:'MORALE_CYCLE_RESOLVED'[\s\S]{0,500}moraleDamageSources:cloneSerializable\(outgoingSources/,
  'the authoritative calculation event must identify its exact damage sources'
);
assert.match(
  moraleUi,
  /flashMoraleCalculationSourceOverlays\(moraleCycleEvent\);[\s\S]{0,180}commitMoralePresentationValue\(working,event\);[\s\S]{0,100}await animateMoraleDamage\(event\)/,
  'calculation source overlays, visible Morale commit, and damage animation must share one result sequence'
);
assert.match(
  moraleUi,
  /flashMoraleEffectSourceOverlay\(event\);[\s\S]{0,180}commitMoralePresentationValue\(working,event\)/,
  'ordinary Morale effects must show their source overlay only at result time'
);
assert.doesNotMatch(moraleUi, /morale_heal_source|morale_damage_source/, 'generic Morale source overlays must not exist');
assert.doesNotMatch(renderer, /morale_heal_source|morale_damage_source/, 'the renderer must not contain generic Morale overlay art');
assert.doesNotMatch(moraleUi, /rozsi_morale_calculation/, 'Morale calculation must not invent a second Rozsi overlay kind');
assert.doesNotMatch(renderer, /rozsi_morale_calculation/, 'the renderer must use the established Rozsi overlay art');
assert.match(moraleUi, /sourceCardId\|\|'\'\)==='34'[\s\S]{0,500}source\.affectedIids[\s\S]{0,500}flashCardEffect\(target,'rozsi_hungarian_crest'/, 'Rozsi must flash his Morale crest on every exact contributing card');
assert.match(renderer, /rozsi_hungarian_crest[\s\S]*Crowned double cross/, 'Rozsi Morale must use the Hungarian crest rather than the movement boot');
assert.match(read('shared', 'engine', 'morale-pressure.mjs'), /id === '34'[\s\S]{0,1000}affectedIids = affected\.map[\s\S]{0,1000}outgoingSources\[owner\]\.push\(\{card:source, amount:sourceDamage, affectedIids\}\)/, 'authority must identify each card contributing through Rozsi');
assert.doesNotMatch(moraleUi, /breakfast_republic_busser|BUSSER_INITIATOR_MORALE/, 'retired Busser source overlays must not remain in Morale presentation');
assert.match(core, /PRESSURE_REWORK_WHEN_SET_EFFECT_IDS = new Set\(\['20','33','34','45','47','64','69'\]\)/, 'Great Oak and the other genuine reworked set effects must receive activation cinematics');
assert.match(moraleUi, /String\(card\.id\|\|'\'\)==='33'[\s\S]{0,220}events\.push\(\{type:'MORALE_HEALED'[\s\S]{0,220}sourceIid:String\(card\.iid\|\|'\'\)/, 'West Caribbea Infantry must queue its Morale gain against its own set-effect source');
assert.match(core, /function hasAuthoritativeWhenSetEffect[\s\S]{0,500}PRESSURE_REWORK_TIMING_CARD_IDS\.has\(id\)[\s\S]{0,160}PRESSURE_REWORK_WHEN_SET_EFFECT_IDS\.has\(id\)/, 'reworked set timing must not leak into classic card rules');
assert.match(ai, /inst\._onlineSetResolutionPending = true;[\s\S]{0,180}recordLegacyMoralePressureCardSet\(inst\)/, 'AI Morale results must also wait for their set-effect cinematic');
assert.match(codexUi, /window\.getPresentedMoraleSystem\?\.\(\)\|\|authoritativeMorale/, 'the visible Codex Morale number must honor the staged presentation value');

console.log('fate Morale effect presentation order smoke passed');
