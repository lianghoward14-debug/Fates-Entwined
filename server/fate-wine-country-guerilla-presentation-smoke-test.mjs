import assert from 'node:assert/strict';
import fs from 'node:fs';

const online = fs.readFileSync(new URL('../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');

assert.match(
  online,
  /function phase7SuppressWineCountryHandFateDelta[\s\S]{0,500}WINE_COUNTRY_GUERILLA[\s\S]{0,120}sourceCardId === '70'/,
  'Wine Country Guerilla hand Fate feedback must be recognized by reason and semantic source'
);
assert.match(
  online,
  /function phase7SuppressWineCountryHandFateDelta[\s\S]{0,900}_suppressNextFatePulse = true[\s\S]{0,900}return true;/,
  'the multiplayer hand target must suppress both explicit and generic Fate-number motion'
);
assert.match(
  online,
  /function phase7SuppressWineCountryHandFateDelta[\s\S]{0,1400}playFateChangeSound[\s\S]{0,300}phase7ShowExactEffectOverlay/,
  'removing the number must not bypass the rest of effect presentation'
);
assert.match(online, /if\(phase7SuppressWineCountryHandFateDelta\(view, event, target, pos, eventIndex, fateBefore, fateAfter\)\) return;/);

console.log('Wine Country Guerilla multiplayer presentation smoke passed');
