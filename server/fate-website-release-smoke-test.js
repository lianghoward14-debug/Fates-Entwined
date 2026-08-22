'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {getCardCatalog} = require('./fate-card-catalog.js');

const root = path.resolve(__dirname, '..');
const website = path.join(root, 'fates-entwined-website');
const html = fs.readFileSync(path.join(website, 'index.html'), 'utf8');
const archiveJs = fs.readFileSync(path.join(website, 'archive.js'), 'utf8');
const css = fs.readFileSync(path.join(website, 'styles.css'), 'utf8');
const sandbox = {window:{}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(website, 'archive-data.js'), 'utf8'), sandbox);
const archive = sandbox.window.FATES_ARCHIVE_DATA;
const catalog = getCardCatalog().cards;

assert.equal(archive.cardCount, catalog.length, 'website archive count must match the current game catalog');
assert.equal(archive.cards.length, catalog.length, 'website archive entries must match the current game catalog');
for(const card of catalog){
  const archived = archive.cards.find(entry=>String(entry.id) === String(card.id));
  assert(archived, `website archive must include ${card.id}`);
  assert.equal(archived.name, card.name, `website card ${card.id} must use current name`);
  assert.equal(archived.effect, card.effect, `website card ${card.id} must use current rules text`);
  const imagePath = String(archived.img || '').replace(/^\.\.\//, '').split('?')[0];
  assert(imagePath && fs.existsSync(path.join(root, imagePath)), `website card ${card.id} art must resolve to a current game asset`);
}

assert.match(html, /releases\/latest\/download\/Fates-Entwined-Installer\.exe/, 'website must use the stable newest-installer release alias');
assert.doesNotMatch(html, /Latest Windows build:\s*v|installer,\s*v1\.39\.0/i, 'website must not hard-code a stale release version');
assert.match(html, /114-card catalog[\s\S]*Twenty Landscapes[\s\S]*All 114 current catalog entries/, 'website copy must describe the current catalog and landscape count');
assert.match(html, /id="archive-card-set"[\s\S]*Brave Horizons[\s\S]*Tokens[\s\S]*Retired/, 'website archive must expose current set/status filters');
assert.match(archiveJs, /function setLabel[\s\S]*cardSet\?\.value/, 'website archive must render and filter current sets');
assert.match(archiveJs, /set === 'token' && !card\.token[\s\S]*set === 'retired' && !card\.retired/, 'website archive must filter tokens and retired entries');
assert.match(css, /hero-bg\{background-image:url\('\.\.\/ingamebackgrouds\/igb20\.png'\)\}/, 'website hero must use current Battle of Pella art');
for(const relative of ['bh1.png','bh2.png','bh5.png','bh6.png','igb17/1.png','ingamebackgrouds/igb18.png','ingamebackgrouds/igb19.png','ingamebackgrouds/igb20.png']){
  assert(fs.existsSync(path.join(root, relative)), `website showcase asset must exist: ${relative}`);
}

console.log(`Website release smoke test passed (${archive.cards.length} cards).`);
