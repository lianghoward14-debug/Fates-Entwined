const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const read=p=>fs.readFileSync('src/scripts/'+p,'utf8');
function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
(async()=>{
 let remote={enabled:true,revision:0},posts=0;
 const c={USER_PROFILE:{ownedCards:{'01':1}},CARDS:[{id:'01',rarity:'circle'},{id:'119',rarity:'circle'},{id:'120',rarity:'star'}],window:{addEventListener(){},dispatchEvent(){},FateOnline:{flyApiRequest:async(route,options)=>{if(options.method==='POST'){posts++;assert.equal(options.body.expectedRevision,remote.revision);remote={enabled:options.body.enabled,revision:remote.revision+1};}return {access:{...remote}};}}},document:{hidden:false,addEventListener(){},getElementById:()=>null},CustomEvent:class{},setInterval(){},toast(){},_cdbCurrentDeckIds:[],refreshCdbCollectionCounts(){},renderCdbDecklist(){},getChallengerCardPool:()=>c.CARDS};
 vm.createContext(c);vm.runInContext(read('54-challenger-free-access.js'),c);
 const api=c.window.FateChallengerAccess;await api.refresh();
 assert.equal(api.collection()['119'],3);assert.equal(api.collection()['120'],1);assert.deepEqual(c.USER_PROFILE.ownedCards,{'01':1});
 const source=read('09-challenger-mode.js');vm.runInContext(fn(source,'cdbAdd')+'\n'+fn(source,'buildChallengerImportDeck'),c);
 for(let i=0;i<4;i++)c.cdbAdd('119');assert.equal(c._cdbCurrentDeckIds.length,3,'normal three-copy limit still enforced');
 const imported=c.buildChallengerImportDeck(['119','119','119','119','120','120']);assert.equal(imported.ids.length,4);
 c.USER_PROFILE.ownedCards['119']=1;await api.toggle();assert.equal(posts,1);assert.equal(api.enabled(),false);assert.equal(api.collection()['119'],1);assert.equal(api.allows(['119','119']),false,'borrowed saved deck unavailable after switch off');
 assert.equal(c.buildChallengerImportDeck(['119','119']).ids.length,1);
 await api.toggle();assert.equal(api.enabled(),true);assert.equal(api.collection()['119'],3);assert.equal(c.USER_PROFILE.ownedCards['119'],1);
 console.log('Challenger client: all cards available without inventory mutation; deck add/import limits and restoration preserve genuine acquisitions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
