const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const maps=require('../../shared/warfront-maps.js');
assert.equal(maps.maps.length,10);
for(const map of maps.maps){assert(fs.existsSync(map.image));assert.equal(new Set(map.zones).size,5);for(let i=0;i<100;i++)assert.notEqual(maps.pick(map.id).id,map.id);}
const source=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
const ctx={MAPS:maps,ZONES:maps.zoneIds.map(id=>({id})),TEAMS:{},clone:structuredClone,landscape:()=>({id:'test'}),POST_WAR_DURATION:86400000};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function fresh('),source.indexOf('function normalize(')),ctx);
for(const previous of maps.maps){const event=ctx.fresh(3,[],{mapId:previous.id,completedAt:Date.now()});assert.notEqual(event.mapId,previous.id);assert.deepEqual(Array.from(event.zones,z=>z.name),maps.get(event.mapId).zones);}
const css=fs.readFileSync('src/styles/challenger-war-event-final.css','utf8');assert(!css.includes('warfront/map.png'));assert(css.includes('var(--warfront-map-image)'));
console.log('All ten maps exist, names match, fresh campaigns persist their selection, and consecutive maps differ.');

// Archived rosters must resolve against their campaign, not the current map.
const rosterSource=source.slice(source.indexOf('function war8Roster('),source.indexOf('function war8FrontCards('));
const rosterCtx={state:{mapId:'libya'},MAPS:maps,ZONES:maps.zoneIds.map(id=>({id})),esc:String,avatar:()=>''};vm.createContext(rosterCtx);
const metaLine=source.split(/\r?\n/).find(line=>line.startsWith('const meta='));
vm.runInContext(metaLine,rosterCtx);
vm.runInContext(rosterSource,rosterCtx);
for(const map of maps.maps){const report=maps.apply({zones:maps.zoneIds.map(id=>({id})),players:maps.zoneIds.map(zoneId=>({zoneId,team:'a',name:'Commander'}))},map);const html=rosterCtx.war8Roster(report,'a');for(const name of map.zones)assert(html.includes(name));}
console.log('Archived roster names follow each saved campaign map.');

for(const file of ['src/styles/challenger-war-event.css','src/styles/challenger-war-event-final.css']){const css=fs.readFileSync(file,'utf8');assert(!css.includes('challenger-war-map-v3.png'),file+' must not override the selected map');}
assert(source.includes('<h1>WARFRONT</h1>'));assert(!source.includes('<h1>WARFRONT ·'));
assert.equal(new Set(maps.maps.flatMap(m=>m.zones)).size,50);
