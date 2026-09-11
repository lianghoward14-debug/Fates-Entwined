import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const drag=fs.readFileSync('src/scripts/render-v2/09-hand-drag-bridge.js','utf8');
function extract(source,name){const start=source.indexOf(`  function ${name}(`);return source.slice(start,source.indexOf('\n  }',start)+4);}
let submitted=0,local=0;
const card={id:'whisper17',type:'Coordinator',cost:0};
const hit={kind:'cell',z:1,r:1,c:1};
const context=vm.createContext({state:{card,dragging:true},Date,
  document:{body:{classList:{contains:()=>false}}},isActiveDragPointer:()=>true,
  updateDropPreview:()=>({hit,dragState:'valid'}),isDirectSetCard:c=>c.id==='whisper17',
  isFreeSetCard:()=>false,boardCardAt:()=>null,canPlaceCardOnCell:()=>true,
  canConsolidateWithoutTributeAt:()=>true,G:{currentPlayer:0},blockClickUntil:0,
  finishSupporterDrop:()=>submitted++,finishConsolidationDrop:()=>local++,
  cleanup:()=>{},window:{consolidateZeroCostIntoAnickaRow:()=>local++}});
vm.runInContext(extract(drag,'isZeroCostAnickaRowDrop')+extract(drag,'onPointerUp'),context);
assert.equal(context.isZeroCostAnickaRowDrop(card,hit),false);
context.onPointerUp({preventDefault(){},stopPropagation(){}});
assert.equal(submitted,1,'Shizuku pointer release must reach authoritative direct placement');
assert.equal(local,0,'Shizuku must not mutate the local board via consolidation');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=core.indexOf('function consolidateZeroCostIntoAnickaRow(');
vm.runInContext(core.slice(start,core.indexOf('\n}',start)+2),context);
context.G._phase7CurrentMultiplayer=true;
context.window.fatePhase7HandleHandDrop=()=>{submitted++;return true;};
context.consolidateZeroCostIntoAnickaRow(card,hit);
assert.equal(submitted,2,'direct shortcut callers also dispatch through authority');
assert.equal(local,0);
console.log('Shizuku drag and zero-cost shortcuts use authority placement without local consolidation');
