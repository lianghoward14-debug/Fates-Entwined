'use strict';
// Build offline Simplified Chinese from authored localization sources only.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const w = {};
for (const f of ['content','catalog','subtitles','card-updates','lore','warfront']) vm.runInNewContext(fs.readFileSync(path.join(root, 'src/scripts/53-japanese-'+f+'.js'), 'utf8'), {window:w});
const sources = new Set([...w.FateJapaneseContent, ...Object.entries(w.FateJapaneseCatalog), ...w.FateJapaneseLore, ...Object.entries(w.FateJapaneseSubtitles)].map(p=>p[0]));
const inventoryPath = path.join(root, 'docs/localization/zh-CN-source-inventory.json');
if (fs.existsSync(inventoryPath)) for (const entry of JSON.parse(fs.readFileSync(inventoryPath, 'utf8')).entries) sources.add(entry.source);
const css = new Map();
for (const f of fs.readdirSync(path.join(root,'src/styles')).filter(f=>f.endsWith('.css'))) {
 const s=fs.readFileSync(path.join(root,'src/styles',f),'utf8');
 for(const m of s.matchAll(/var\((--fate-label-[a-f0-9]+),\s*(['"])(.*?)\2\)/g)){ const en=m[3].replace(/\\A\s*/g,' '); css.set(m[1],en); sources.add(en); }
}
const cachePath=path.join(root,'docs/localization/zh-CN-cache.json');
const cache=fs.existsSync(cachePath)?JSON.parse(fs.readFileSync(cachePath,'utf8')):{};
Object.assign(cache, {'Free Play':'自由对战','Challenger':'挑战者','Deck Builder':'卡组构筑','End Turn':'结束回合','Your Hand':'你的手牌','Fate':'命运值','Morale':'士气','Search names or card text...':'搜索名称或卡牌描述…','Fates Entwined':'命运交织'});
Object.assign(cache, {'Supporters':'支援者','Supporter':'支援者','Initiators':'先驱者','Initiator':'先驱者','Coordinators':'协调者','Coordinator':'协调者','Improvisors':'应变者','Improvisor':'应变者','Dauntless':'无畏者','Deck List':'卡组列表','Preparing Free Play':'正在准备自由对战','Preparing Free Play ZXQ0QXZ':'正在准备自由对战 ZXQ0QXZ','Pass 1':'第一阶段'});
for (const source of Object.keys(cache)) {
  let value = cache[source];
  if (/\bFate\b/i.test(source)) value = value.replace(/命运(?!值|交织)/g, '命运值');
  if (/\bSupporters?\b/i.test(source)) value = value.replace(/支持者/g, '支援者');
  if (/\bInitiators?\b/i.test(source)) value = value.replace(/发起者|启动器|引发剂/g, '先驱者');
  if (/\bCoordinators?\b/i.test(source)) value = value.replace(/协调员/g, '协调者');
  if (/\bImprovisors?\b/i.test(source)) value = value.replace(/即兴演奏者/g, '应变者');
  cache[source] = value.replace(/免费游戏/g, '自由对战');
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(s){for(let n=0;n<5;n++){try{const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q='+encodeURIComponent(s),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);return (await r.json())[0].map(x=>x[0]||'').join('');}catch(e){if(n===4)throw e;await pause(1000*(n+1));}}}
const valid=(a,b)=>b && (a.match(/ZXQ\d+QXZ/g)||[]).sort().join()===(b.match(/ZXQ\d+QXZ/g)||[]).sort().join() && !/[\[【［]\s*\d{6}/.test(b);
const clean=s=>s.replace(/ZXQ\s*(\d+)\s*QXZ/gi,(_,n)=>'ZXQ'+n+'QXZ').trim();
const batches=[];let batch=[],size=0;
for(const s of sources){if(cache[s])continue;if(batch.length&&(size+s.length>2500||batch.length>=18)){batches.push(batch);batch=[];size=0;}batch.push(s);size+=s.length+16;}if(batch.length)batches.push(batch);
let cursor=0,done=0;const errors=[];
async function worker(){while(cursor<batches.length){const group=batches[cursor++];try{const raw=await request(group.map((s,i)=>'['+String(i).padStart(6,'0')+'] '+s).join('\n'));const mapped=new Map([...raw.matchAll(/\[\s*(\d{6})\s*\]\s*([\s\S]*?)(?=\[\s*\d{6}\s*\]|$)/g)].map(m=>[+m[1],clean(m[2])]));for(let i=0;i<group.length;i++){let t=mapped.get(i);if(!valid(group[i],t))t=clean(await request(group[i]));if(!valid(group[i],t))throw Error('Invalid placeholders: '+group[i]);cache[group[i]]=t;}}catch(e){errors.push(e.message);}done++;if(done%10===0||done===batches.length){fs.writeFileSync(cachePath,JSON.stringify(cache,null,2));console.log(JSON.stringify({done,total:batches.length,messages:Object.keys(cache).length,errors:errors.length}));}}}
(async()=>{await Promise.all(Array.from({length:6},worker));fs.writeFileSync(cachePath,JSON.stringify(cache,null,2));const missing=[...sources].filter(s=>!cache[s]);fs.writeFileSync(path.join(root,'docs/localization/zh-CN-report.json'),JSON.stringify({messages:sources.size,missing,errors},null,2));if(missing.length)throw Error(missing.length+' translations missing; rerun to resume');fs.writeFileSync(path.join(root,'src/scripts/53-chinese.js'),'/* Offline Simplified Chinese translations of authored game text. */\nwindow.FateChineseContent = '+JSON.stringify([...sources].map(s=>[s,cache[s]]))+';\nwindow.FateChineseSubtitles = '+JSON.stringify(Object.fromEntries(Object.keys(w.FateJapaneseSubtitles).map(s=>[s,cache[s]])))+';\n');fs.writeFileSync(path.join(root,'src/styles/localization-chinese.css'),'/* Simplified Chinese CSS labels. */\nhtml[lang="zh-CN"] {\n'+[...css].map(([id,s])=>'  '+id+': '+JSON.stringify(cache[s])+';').join('\n')+'\n}\n');})();
