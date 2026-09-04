const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/scripts/09-challenger-mode.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'src/scripts/01-data-and-state.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'src/scripts/03-profile-and-progression.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles/99-ui-final.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const bhCards = [...data.matchAll(/\{id:'(bh\d{2})'[\s\S]*?rarity:'(circle|triangle|square|star)'[\s\S]*?set:'brave_horizons'/g)]
  .map(match=>({id:match[1], rarity:match[2]}));
assert.equal(bhCards.length, 25, 'Brave Horizons must contain BH01-BH25');
assert.deepEqual(bhCards.filter(card=>card.rarity === 'star').map(card=>card.id), ['bh01','bh05']);

const context = {CARDS:bhCards, Math:Object.create(Math)};
context.isRetiredChallengerCard = ()=>false;
context.getChallengerCardPool = ()=>context.CARDS;
vm.createContext(context);
const block = source.match(/function getBooster3CardPool\(\)[\s\S]*?(?=\r?\n\/\/ Add owned cards)/);
assert(block, 'Booster 3 generator must be extractable');
vm.runInContext(block[0], context);
assert.equal(vm.runInContext('getBooster3CardPool().length', context), 25);

context.Math.random = ()=>0.5;
let pack = vm.runInContext('generateBooster3Pack()', context);
assert.equal(pack.length, 3);
assert.equal(bhCards.find(card=>card.id===pack[2]).rarity, 'square', 'ordinary pack ends in a Square');
assert(pack.slice(0,2).every(id=>['triangle','circle'].includes(bhCards.find(card=>card.id===id).rarity)));

let rolls = [0, 0, 0.039, 0.24];
context.Math.random = ()=>rolls.shift() ?? 0;
pack = vm.runInContext('generateBooster3Pack()', context);
assert.equal(pack[2], 'bh01', 'BH01 owns 25% of successful Star rolls');
rolls = [0, 0, 0.039, 0.25];
context.Math.random = ()=>rolls.shift() ?? 0;
pack = vm.runInContext('generateBooster3Pack()', context);
assert.equal(pack[2], 'bh05', 'BH05 owns the remaining 75% of successful Star rolls');

assert.match(source, /const BOOSTER3_COST_STARLIGHT = 150;/);
assert.match(source, /Math\.random\(\) < 0\.04/);
assert.match(source, /numStar = Math\.random\(\)<0\.04\?1:0/);
assert.match(source, /card\?\.set[^\n]+brave_horizons[^\n]+return false/);
assert.match(source, /generateFavoredPack\(\)[\s\S]*brave_horizons/);
assert.match(source, /function booster2PackChance\(\) \{ return 0\.10; \}/);
assert.match(source, /function booster3PackChance\(\) \{ return 0\.10; \}/);
assert.match(source, /awardVictoryDrops\(didWin\)[\s\S]*unopenedBooster2Packs[\s\S]*unopenedBooster3Packs[\s\S]*unopenedProfilePacks/);
assert.match(source, /booster3\.png/);
assert.match(source, /scrollChStoreBoosters\(-1\)/);
assert.match(source, /track\.style\.transform = 'none'/);
assert.match(css, /ch-store-carousel:not\(\.showing-profile\) \.ch-store-product-profile\{display:none!important;\}/);
assert.match(css, /ch-store-carousel\.showing-profile \.ch-store-product-booster3\{display:none!important;\}/);
assert.match(css, /showing-profile \.ch-store-page-arrow-right\{display:grid!important;\}/);
assert.match(profile, /unopenedBooster3Packs:\s*0/);
assert.match(index, /09-challenger-mode\.js\?v=2026090109/);
assert.match(index, /03-profile-and-progression\.js\?v=2026090102/);
assert.match(sw, /fates-entwined-v21-store-carousel-sound-20260901/);
assert.doesNotMatch(profile, /showModal\('Daily Login Rewards',[\s\S]{0,180}\{silentOpen:true\}\)/);
assert.match(source, /track\.prepend\(profile\)/);
assert(fs.existsSync(path.join(root, 'booster3.png')));
console.log('fate Brave Horizons Booster 3 smoke passed');
