import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  validateShadowDeploymentConfig
} from '../../tools/authority-v3-shadow-predeploy.mjs';
import {
  buildShadowSourceIdentity,
  digestShadowSourceEntries
} from '../../tools/authority-v3-shadow-build-id.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultConfig = path.join(root, 'fly.toml');
const exampleConfig = path.join(root, 'fly.authority-v3-shadow.toml.example');
const example = fs.readFileSync(exampleConfig, 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-v3-shadow-predeploy-'));

const orderedDigest = digestShadowSourceEntries([
  {relativePath:'b.mjs', bytes:'second'},
  {relativePath:'a.mjs', bytes:'first'}
]);
assert.equal(orderedDigest, digestShadowSourceEntries([
  {relativePath:'a.mjs', bytes:'first'},
  {relativePath:'b.mjs', bytes:'second'}
]));
assert.notEqual(orderedDigest, digestShadowSourceEntries([
  {relativePath:'a.mjs', bytes:'changed'},
  {relativePath:'b.mjs', bytes:'second'}
]));
const sourceIdentity = buildShadowSourceIdentity(root);
assert.match(sourceIdentity.buildId, /^phase6-[a-f0-9]{64}$/);
assert(sourceIdentity.files.includes('server/authoritative-v3/phase6-shadow-core.mjs'));
assert(sourceIdentity.files.includes('server/authoritative-v3/phase6-shadow-worker.mjs'));
assert(sourceIdentity.files.includes('shared/engine/reducer.mjs'));
assert(sourceIdentity.files.includes('Dockerfile.authority-v3-shadow'));

function writeVariant(name, transform){
  const target = path.join(tempDir, `${name}.toml`);
  fs.writeFileSync(target, transform(example));
  return target;
}

try{
  const defaultResult = validateShadowDeploymentConfig(defaultConfig, {root, defaultConfigPath:defaultConfig});
  assert.equal(defaultResult.ok, false);
  assert(defaultResult.errors.some(error=>/default fly\.toml is legacy-only/.test(error)));

  const exampleResult = validateShadowDeploymentConfig(exampleConfig, {root, defaultConfigPath:defaultConfig});
  assert.equal(exampleResult.ok, false);
  assert(exampleResult.errors.some(error=>/non-placeholder app/.test(error)));
  assert(exampleResult.errors.some(error=>/non-placeholder volume/.test(error)));
  assert(exampleResult.errors.some(error=>/immutable build identifier/.test(error)));

  const validConfig = writeVariant('valid', text=>text
    .replace('replace-with-separate-shadow-app', 'fates-entwined-v3-shadow-soak')
    .replace('replace-with-separate-shadow-volume', 'fate_authority_v3_shadow_soak')
    .replace('replace-with-shadow-build-id', 'phase6-predeploy-test-build'));
  const valid = validateShadowDeploymentConfig(validConfig, {root, defaultConfigPath:defaultConfig});
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.ok, true);
  assert.equal(valid.app, 'fates-entwined-v3-shadow-soak');
  assert.equal(valid.volume, 'fate_authority_v3_shadow_soak');
  assert.equal(valid.buildId, 'phase6-predeploy-test-build');

  const sameApp = writeVariant('same-app', text=>text
    .replace('replace-with-separate-shadow-app', 'fates-entwined-main')
    .replace('replace-with-separate-shadow-volume', 'fate_authority_v3_shadow_soak')
    .replace('replace-with-shadow-build-id', 'phase6-predeploy-test-build'));
  const sameAppResult = validateShadowDeploymentConfig(sameApp, {root, defaultConfigPath:defaultConfig});
  assert.equal(sameAppResult.ok, false);
  assert(sameAppResult.errors.some(error=>/separate from the default legacy app/.test(error)));

  const sameVolume = writeVariant('same-volume', text=>text
    .replace('replace-with-separate-shadow-app', 'fates-entwined-v3-shadow-soak')
    .replace('replace-with-separate-shadow-volume', 'fate_authority_data')
    .replace('replace-with-shadow-build-id', 'phase6-predeploy-test-build'));
  const sameVolumeResult = validateShadowDeploymentConfig(sameVolume, {root, defaultConfigPath:defaultConfig});
  assert.equal(sameVolumeResult.ok, false);
  assert(sameVolumeResult.errors.some(error=>/separate from the default legacy volume/.test(error)));

  const conflictingFlag = writeVariant('conflicting-flag', text=>text
    .replace('replace-with-separate-shadow-app', 'fates-entwined-v3-shadow-soak')
    .replace('replace-with-separate-shadow-volume', 'fate_authority_v3_shadow_soak')
    .replace('replace-with-shadow-build-id', 'phase6-predeploy-test-build')
    .replace("FATE_SERVER_AUTHORITATIVE_V3_ENABLED = '0'", "FATE_SERVER_AUTHORITATIVE_V3_ENABLED = '1'"));
  const conflictingResult = validateShadowDeploymentConfig(
    conflictingFlag,
    {root, defaultConfigPath:defaultConfig}
  );
  assert.equal(conflictingResult.ok, false);
  assert(conflictingResult.errors.some(error=>/FATE_SERVER_AUTHORITATIVE_V3_ENABLED/.test(error)));

  const wrongProcess = writeVariant('wrong-process', text=>text
    .replace('replace-with-separate-shadow-app', 'fates-entwined-v3-shadow-soak')
    .replace('replace-with-separate-shadow-volume', 'fate_authority_v3_shadow_soak')
    .replace('replace-with-shadow-build-id', 'phase6-predeploy-test-build')
    .replace(
      'node server/authoritative-v3/phase6-shadow-supervisor.mjs',
      'node server/authoritative-v3/server.mjs'
    ));
  const wrongProcessResult = validateShadowDeploymentConfig(
    wrongProcess,
    {root, defaultConfigPath:defaultConfig}
  );
  assert.equal(wrongProcessResult.ok, false);
  assert(wrongProcessResult.errors.some(error=>/processes\.app/.test(error)));
}finally{
  fs.rmSync(tempDir, {recursive:true, force:true});
}

const defaultFly = fs.readFileSync(defaultConfig, 'utf8');
assert.doesNotMatch(defaultFly, /FATE_SERVER_AUTHORITATIVE_V3_SHADOW_ENABLED/);
assert.match(defaultFly, /app\s*=\s*['"]fates-entwined-main['"]/);

console.log('authoritative v3 Phase 6 shadow predeploy smoke test passed');
