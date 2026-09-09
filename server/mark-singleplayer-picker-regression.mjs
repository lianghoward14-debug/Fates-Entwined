import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const start=source.indexOf("    case '43': { // Mark Kemper");
const branch=source.slice(start,source.indexOf("    case '48':",start));
let picker,confirm,clicked;
const context={G:{},cp:0,z:1,card:{iid:'mark'},closeModal(){},getMarkSafeSquareChoiceRow:()=>3,
  clearPlaceHighlights(){},renderGame(){},restoreMarkViewportSnapshotRepeated(){},
  isMarkSafeSquare:()=>false,showBoardTargetPicker:(opts,cb)=>{picker=opts;confirm=cb;},
  clickCell:(...pos)=>{clicked=pos;}};
vm.runInNewContext('switch("43"){'+branch+'}',context);
assert.equal(picker.pickerClass,'phase7-authoritative-board-picker');
assert.equal(picker.entries.length,4);
assert.equal(picker.allowSquareTargets,true);
assert.equal(picker.immediate,true);
confirm([picker.entries[3]]);
assert.deepEqual(clicked,[1,3,3]);
console.log('Singleplayer Mark uses shared four-square picker and forwards selected square');
