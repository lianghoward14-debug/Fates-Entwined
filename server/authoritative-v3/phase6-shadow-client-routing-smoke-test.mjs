import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rooms = fs.readFileSync(path.join(root, 'src', 'scripts', '18-online-rooms.js'), 'utf8');
const defaultFly = fs.readFileSync(path.join(root, 'fly.toml'), 'utf8');

assert.match(
  index,
  /params\.get\('fateV3ShadowSoak'\) === '1'/,
  'Phase 6 client routing must require the exact query value'
);
assert.match(
  index,
  /shadowConflict = shadowSoak[\s\S]*fateAuthority[\s\S]*flyWs[\s\S]*fateV3SinglePlayer/,
  'Phase 6 client routing must reject competing authority paths'
);
assert.match(
  index,
  /if\(shadowConflict \|\| phase7Conflict\)\{[\s\S]*FATE_PHASE6_SHADOW_SOAK_BLOCKED = true[\s\S]*FATE_WS_AUTHORITY_URL = ''[\s\S]*FATE_FLY_API_URL = ''/,
  'a route conflict must fail closed instead of falling back to production'
);
assert.match(
  index,
  /else if\(shadowSoak\)\{[\s\S]*FATE_PHASE6_SHADOW_SOAK = true[\s\S]*wss:\/\/fates-entwined-v3-shadow-soak\.fly\.dev[\s\S]*https:\/\/fates-entwined-v3-shadow-soak\.fly\.dev/,
  'the exact flag must select only the isolated shadow app'
);
assert.match(
  index,
  /if\(hostedFly && !shadowSoak && !phase7Beta\)\{[\s\S]*wss:\/\/fates-entwined-main\.fly\.dev/,
  'the normal hosted route must remain production-only when shadow soak is absent'
);

assert.match(
  rooms,
  /function authorityHttpBaseUrl\(\)\{[\s\S]*phase6ShadowSoakBlocked\(\)[\s\S]*phase6ShadowSoakEnabled\(\)[\s\S]*PHASE6_SHADOW_SOAK_API_URL[\s\S]*hostedFlyRuntime\(\)/,
  'shadow HTTP routing must precede stored and production defaults'
);
assert.match(
  rooms,
  /function configuredAuthorityUrl\(\)\{[\s\S]*phase6ShadowSoakBlocked\(\)[\s\S]*phase6ShadowSoakEnabled\(\)[\s\S]*PHASE6_SHADOW_SOAK_WS_URL[\s\S]*localStorage\.getItem\('fateWsAuthorityEnabled'\)/,
  'shadow WebSocket routing must precede local storage and production defaults'
);
assert.match(
  rooms,
  /function phase6ShadowSoakEnabled\(\)\{[\s\S]*FATE_PHASE6_SHADOW_SOAK === true[\s\S]*get\('fateV3ShadowSoak'\) === '1'/,
  'runtime routing must require both the early marker and exact query flag'
);
assert.match(
  rooms,
  /function rtdbDisabledMode\(\)\{[\s\S]*phase6ShadowSoakEnabled\(\)[\s\S]*localStorageFlag\('fateRtdbDisabled'\)/,
  'Fly-only room transport must be derived inside the online module, not set globally at boot'
);
assert.match(
  rooms,
  /if\(phase6ShadowSoakEnabled\(\)\) return window\.fateGetWebSocketAuthorityStatus\(\);/,
  'the soak route must not persist itself through generic test-mode storage'
);
assert.doesNotMatch(
  defaultFly,
  /fates-entwined-v3-shadow-soak|FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED/,
  'the default production Fly config must remain unaware of the soak route'
);

console.log('authoritative v3 Phase 6 shadow client routing smoke test passed');
