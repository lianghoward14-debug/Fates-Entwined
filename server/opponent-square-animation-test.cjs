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
