import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const target = source.slice(source.indexOf('function showBoardTargetPicker('), source.indexOf('function showZonePicker('));
const capacity = target.match(/const rowCap = ([\s\S]*?);/)[1];
for (const capacityInState of [1, 3, 4]) {
  for (const r of [3, 4, 5]) {
    assert.equal(vm.runInNewContext(capacity, {r, z:0, entryRowCap:3, getBoardRowCapacity:()=>capacityInState}), 4);
  }
}
const movement = source.slice(source.indexOf('function showMoveTarget('), source.indexOf('function showMoveTarget(') + 7000);
const display = movement.match(/const displayCols = ([\s\S]*?);/)[1];
assert.equal(vm.runInNewContext(display, {zoneRows:4, targetZ:0, getBoardRowCapacity:()=>3}), 4);
assert.equal(vm.runInNewContext(display, {zoneRows:3, targetZ:0, getBoardRowCapacity:()=>4}), 4);
assert.match(movement, /zoneRows \* displayCols/);
assert.match(movement, /Math.floor\(idx \/ displayCols\)/);
assert.match(movement, /idx % displayCols/);
assert.match(movement, /if\(!openKey.has\(key\)\)/);
console.log('Picker four-column layout expressions passed (including short legacy added rows)');
