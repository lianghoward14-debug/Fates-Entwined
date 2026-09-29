import assert from 'node:assert/strict';
import maps from '../../shared/warfront-maps.js';
import {warfrontLandscapeCatalog} from './warfront-landscape-catalog.mjs';
const catalog=warfrontLandscapeCatalog();
assert.equal(catalog.length,24);
const before=JSON.stringify(catalog),seen=new Set();
let seed=13;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let n=0;n<500;n++){
  const selected=maps.pickLandscapes(catalog,random);
  assert.equal(selected.length,5);
  assert.equal(new Set(selected.map(l=>l.id)).size,5);
  selected.forEach(l=>{assert(catalog.some(c=>c.id===l.id));seen.add(l.id);});
}
assert.equal(seen.size,24);
assert.equal(JSON.stringify(catalog),before,'selection does not mutate the catalog');
assert.deepEqual(maps.pickLandscapes(catalog,()=>0),maps.pickLandscapes(catalog,()=>0),'no history restrictions on independent draws');
console.log('Each new Warfront selects five distinct random landscapes from all 24');
