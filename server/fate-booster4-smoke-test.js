const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/scripts/09-challenger-mode.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'src/scripts/03-profile-and-progression.js'), 'utf8');
const cloud = fs.readFileSync(path.join(root, 'src/scripts/14-cloud-save.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles/99-ui-final.css'), 'utf8');
const translations = fs.readFileSync(path.join(root, 'src/scripts/53-caribbea-translations.js'), 'utf8');
const cards = [
  {id:'100', type:'Dauntless', rarity:'square'},
  {id:'101', type:'Dauntless', rarity:'square'},
  {id:'103', type:'Initiator', rarity:'triangle'},
  {id:'105', type:'Improvisor', rarity:'triangle'},
  {id:'111', type:'Supporter', rarity:'circle'},
  {id:'112', type:'Supporter', rarity:'circle'},
  {id:'120', type:'Supporter', rarity:'circle'},
];

const context = {CARDS:cards, Math:Object.create(Math)};
context.getChallengerCardPool = ()=>context.CARDS;
context.takeRandomBooster2Card = pool=>pool.splice(Math.floor(context.Math.random() * pool.length), 1)[0] || null;
vm.createContext(context);
const block = source.match(/function getBooster4CardPool\(\)[\s\S]*?(?=\r?\n\/\/ Brave Horizons)/);
assert(block, 'Booster 4 generator must be extractable');
vm.runInContext(block[0], context);
assert.deepEqual(Array.from(vm.runInContext('getBooster4CardPool().map(c=>c.id)', context)), cards.map(card=>card.id));

let rolls = [0.5, 0, 0, 0];
context.Math.random = ()=>rolls.shift() ?? 0;
let pack = vm.runInContext('generateBooster4Pack()', context);
assert.equal(pack.length, 3);
assert.equal(cards.find(card=>card.id === pack[0]).type, 'Supporter');
assert(pack.slice(1).every(id=>cards.find(card=>card.id === id).rarity === 'triangle'));

rolls = [0.8, 0, 0, 0];
context.Math.random = ()=>rolls.shift() ?? 0;
pack = vm.runInContext('generateBooster4Pack()', context);
assert.equal(cards.find(card=>card.id === pack[2]).rarity, 'square');

assert.match(source, /booster4\.png\?v=20261024/);
assert.doesNotMatch(source, /Cards 100–120 · 3 cards per pack/);
assert.match(source, /unopenedBooster4Packs/);
assert.match(source, /showPackOpening\(results, 'booster4'\)/);
assert.match(source, /ch-store-product-booster4[\s\S]*ch-store-product-booster3/);
assert.match(profile, /unopenedBooster4Packs:\s*0/);
assert.match(cloud, /unopenedBooster4Packs:0/);
assert.match(css, /showing-brave/);
assert.match(css, /align-items:flex-start!important/);
assert.match(translations, /El Sol Nunca Se Pone Booster','太陽は決して沈まない ブースター','永不落日补充包'/);
assert(fs.existsSync(path.join(root, 'booster4.png')));
console.log('fate El Sol Nunca Se Pone Booster 4 smoke passed');
