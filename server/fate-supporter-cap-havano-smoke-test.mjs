import assert from 'node:assert/strict';
import fs from 'node:fs';

const structural = fs.readFileSync('src/scripts/00-structural-helpers.js', 'utf8');
const metadata = fs.readFileSync('src/scripts/02-effect-rule-metadata.js', 'utf8');
const core = fs.readFileSync('src/scripts/05-gameplay-core.js', 'utf8');
const rendering = fs.readFileSync('src/scripts/06-rendering-and-helpers.js', 'utf8');
const online = fs.readFileSync('src/scripts/18-online-rooms.js', 'utf8');
const css = fs.readFileSync('src/styles/zz-codex-last.css', 'utf8');

assert.match(metadata, /HAVANO_PASSIVE_ENTRY_SOURCE_IDS\s*=\s*Object\.freeze\(\['10', '35', '65'\]\)/);
assert.match(core, /canTriggerHavanoOnPassiveEntry[\s\S]{0,500}checkReactions\('targeting_effect'/);
assert.match(core, /canTriggerHavanoOnPassiveEntry[\s\S]{0,700}lydiaEligible:false/);
assert.match(core, /isHavanoReactionSource[\s\S]{0,7000}isSupporterHardCapReached\(opp\)/);
assert.match(core, /case 'bh16'[\s\S]{0,120}await activateLiHuaStormOfTenThousandBlades/);
assert.match(core, /function activateLiHuaStormOfTenThousandBlades[\s\S]{0,1200}checkReactions\('targeting_effect'/);
assert.match(core, /resolveGenesisOfAllInceldomAtTurnEnd[\s\S]{0,1200}lydiaEligible:false/);

assert.match(structural, /SUPPORTER_HARD_TURN_CAP\s*=\s*5/);
assert.match(structural, /function recordSupporterHardCapSet[\s\S]{0,900}showSupporterHardCapBanner/);
assert.match(core, /isStructurallySupporterCard\(card\)[\s\S]{0,180}isSupporterHardCapReached\(G\.currentPlayer\)/);
assert.match(core, /recordSupporterHardCapSet\(inst, G\.currentPlayer\)/);
assert.match(core, /function applyHavanoPlacementRules[\s\S]{0,900}recordSupporterHardCapSet\(inst, owner\)/);

assert.match(rendering, /function showSupporterHardCapBanner/);
assert.match(rendering, /SUPPORTER CAP REACHED/);
assert.match(css, /#supporter-hard-cap-banner[\s\S]{0,220}position:fixed[\s\S]{0,220}bottom:/);
assert.match(online, /supportersSetForCapThisTurn:cloneOnlinePlain\(projected\.supportersSetForCapThisTurn/);
assert.match(online, /previousHardCapCounts[\s\S]{0,1800}showSupporterHardCapBanner/);

console.log('single-player/multiplayer Havano and Supporter hard-cap UI smoke test passed');
