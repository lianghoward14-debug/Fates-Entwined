const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const start=src.indexOf('  function phase7PresentNewCarolynSquares('),end=src.indexOf('  function phase7CommitCurrentView(',start);
const calls=[],fallback=[];const context={window:{FateCharacterBoardEffects:{play(...args){calls.push(args);return true;}},playCarolynLockSfx:k=>fallback.push(k)}};
vm.createContext(context);vm.runInContext(src.slice(start,end),context);
for(const owner of [0,1]){
 const blocks=[{type:'zoe',owner,z:0,r:1,c:2,sourceIid:'zoe'+owner},{type:'carolyn',owner,z:1,r:2,c:0,sourceIid:'carolyn'+owner}];
 const before=calls.length;context.phase7PresentNewCarolynSquares({blockedCells:[]},{blockedCells:blocks});assert.equal(calls.length,before+2);
 assert.equal(calls[before][0],'cage');assert.equal(calls[before+1][0],'possibility');assert.equal(calls[before][2].c,2);
 context.phase7PresentNewCarolynSquares({blockedCells:blocks},{blockedCells:blocks});assert.equal(calls.length,before+2,'No replay for unchanged snapshot');
 context.phase7PresentNewCarolynSquares({blockedCells:[]},{blockedCells:[blocks[0],blocks[0]]});assert.equal(calls.length,before+3,'Duplicate statuses play once');
}
assert.equal(fallback.length,0,'Full animation owns sound');
console.log('PASS Zoe and Carolyn square animations for either owner; unchanged snapshots and duplicates do not replay.');

// Execute the actual AI ability branch, including target selection.
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
const aiStart=ai.indexOf("    case '04': { // Zoe:");
const aiEnd=ai.indexOf("    case '17':",aiStart);
assert(aiStart>=0 && aiEnd>aiStart);
for(const animationAvailable of [true,false]){
 const effects=[],sounds=[];
 const game={board:[Array.from({length:3},()=>[null,null,null])],blockedCells:[]};
 const aiContext={G:game,z:0,cp:1,opp:0,inst:{iid:'opponent-zoe'},
  getBoardRowCapacity:()=>3,getAdjacentAndDiagonalCards:()=>[],
  window:{FateCharacterBoardEffects:{play(...args){effects.push(args);return animationAvailable;}}},
  playSfx:name=>sounds.push(name),log:()=>{}};
 vm.createContext(aiContext);
 vm.runInContext("switch('04'){"+ai.slice(aiStart,aiEnd)+'}',aiContext);
 assert.equal(game.blockedCells.length,1);
 assert.equal(effects.length,1);
 assert.equal(effects[0][0],'cage');
 assert.equal(effects[0][1].iid,'opponent-zoe');
 const selected=game.blockedCells[0];
 assert.deepEqual({...effects[0][2]},{z:selected.z,r:selected.r,c:selected.c});
 assert.deepEqual(sounds,animationAvailable?[]:['zoeBlock'],'Animation owns audio; unavailable animation retains fallback sound');
}
console.log('PASS AI Zoe animates the selected square with sound fallback.');

const carolynStart=ai.indexOf("    case '17': { // Carolyn:");
const carolynEnd=ai.indexOf("    case '07':",carolynStart);
assert(carolynStart>=0 && carolynEnd>carolynStart);
for(const animationMode of ['played','disabled','missing']){
 for(const audioMode of ['lock','once','basic']){
  const effects=[],sounds=[];
  const game={board:Array.from({length:3},()=>Array.from({length:3},()=>[null,null,null])),blockedCells:[]};
  const win={};
  if(animationMode!=='missing')win.FateCharacterBoardEffects={play(...args){effects.push(args);return animationMode==='played';}};
  if(audioMode==='lock')win.playCarolynLockSfx=()=>sounds.push('lock');
  if(audioMode==='once')win.playFateSfxOnce=()=>sounds.push('once');
  const aiContext={G:game,z:1,cp:1,opp:0,inst:{iid:'opponent-carolyn'},
   getBoardRowCapacity:()=>3,getAdjacentAndDiagonalCards:()=>[],
   window:win,playSfx:()=>sounds.push('basic'),log:()=>{}};
  vm.createContext(aiContext);
  vm.runInContext("switch('17'){"+ai.slice(carolynStart,carolynEnd)+'}',aiContext);
  assert.equal(game.blockedCells.length,1);
  const selected=game.blockedCells[0];
  assert.equal(selected.type,'carolyn');
  assert.equal(effects.length,animationMode==='missing'?0:1);
  if(effects.length){
   assert.equal(effects[0][0],'possibility');
   assert.equal(effects[0][1].iid,'opponent-carolyn');
   assert.deepEqual({...effects[0][2]},{z:selected.z,r:selected.r,c:selected.c});
  }
  assert.deepEqual(sounds,animationMode==='played'?[]:[audioMode]);
 }
}
console.log('PASS AI Carolyn animates the selected square; all audio fallbacks play once.');
