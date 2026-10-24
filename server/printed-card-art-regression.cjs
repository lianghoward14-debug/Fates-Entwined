const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {byId}=require('./fate-card-catalog.js').getCardCatalog();
const runtime={window:{FateJapaneseCatalog:{},FateChineseContent:[]}};
vm.runInNewContext(fs.readFileSync('src/scripts/53-caribbea-translations.js','utf8'),runtime);
const zh=new Map(runtime.window.FateChineseContent);
const expected={108:['Sofia',2,3],109:['Don Julio',6,4],110:['Sebastián',2,2],111:['West Caribbea Villager',1,0],112:['Caribbea Revolutionary',1,0],113:['Old Elite Oligarch',1,0],114:['Loyalist Soldier',1,0],115:['Caribbea Loyalist',1,0],116:['Anarquista Revolutionary',1,0],117:['Anarquista Saboteur',1,0],118:['Caribbea Fisherman',1,0],119:['Havano Merchant',1,0],120:['The Emerald Eyed Children',1,0]};
for(const [id,[name,fate,cost]] of Object.entries(expected)){
  const card=byId.get(id);assert.deepEqual([card.name,card.fate,card.cost],[name,fate,cost]);
  assert.equal(card.img.split('?')[0],id+'.png');
  for(const path of [id+'.png','optimized/card-thumbs/'+id+'.jpg',card.cinematicPortrait.split('?')[0]])assert(fs.existsSync(path),path);
  for(const key of ['name','ability','effect','flavor']){
    assert(runtime.window.FateJapaneseCatalog[card[key]],id+' Japanese '+key);
    assert(zh.get(card[key]),id+' Chinese '+key);
  }
}
assert.equal(byId.get('119').name,'Havano Merchant');assert.equal(byId.get('bh21').cost,1);assert.equal(byId.get('bh21').rarity,'square');
assert.equal(byId.get('101').fate,1);
for(const p of ['101.png','optimized/card-thumbs/101.jpg','fishtoken.png','optimized/card-thumbs/fishtoken.jpg'])assert(fs.existsSync(p),p);
console.log('Printed art: IDs, names, Fate, Reinforcement, portraits, thumbnails and EN/JA/ZH catalog coverage passed.');
