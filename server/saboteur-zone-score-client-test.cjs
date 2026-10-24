const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
// Exercise the real snapshot field copier, not just the projection mapper.
const start=online.indexOf("    [\n      'extraCells'")>=0?online.indexOf("    [\n      'extraCells'"):online.indexOf("    [\r\n      'extraCells'");
assert(start>=0);
const end=online.indexOf('    });',start)+7;
const copier=online.slice(start,end);
const getterStart=helpers.indexOf('function getCachedZoneScore(');
const getter=helpers.slice(getterStart,helpers.indexOf('\n}',getterStart)+2);
const frozenBoard=[{iid:'concealed',fate:1}];
const g={board:frozenBoard,_phase7ZoneScores:[[1,2],[3,4],[5,6]]};
const context={g,G:g,state:{},cloneOnlinePlain:structuredClone,
  _renderCalcCache:{zoneScores:new Map([['0:0',999]])},getZoneScore:()=>999};
vm.createContext(context);vm.runInContext(getter,context);
for(const totals of [[[13,2],[3,4],[5,6]],[[13,17],[0,4],[8,9]]]){
  context.state={_phase7ZoneScores:totals,_saboteurConcealment:{active:true}};
  vm.runInContext(copier,context);
  for(let z=0;z<3;z++)for(let seat=0;seat<2;seat++)assert.equal(context.getCachedZoneScore(z,seat),totals[z][seat]);
  assert.equal(g.board,frozenBoard,'Updating public totals must not replace concealed cards');
}
console.log('Saboteur client: successive live totals reach both seats in every zone while cards stay frozen.');
