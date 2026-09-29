import fs from 'node:fs';
import vm from 'node:vm';
import {multiplayerEligibleLandscapeIds} from '../../shared/engine/landscapes/registry.mjs';
let cached;
export function warfrontLandscapeCatalog(){
  if(cached)return cached;
  const source=fs.readFileSync(new URL('../../src/scripts/01-data-and-state.js',import.meta.url),'utf8');
  const start=source.indexOf('const LANDSCAPES = '),end=source.indexOf('window.LANDSCAPES = LANDSCAPES;',start);
  if(start<0||end<0)throw new Error('Landscape catalog not found');
  const catalog=vm.runInNewContext(source.slice(start,end)+'\nLANDSCAPES;',Object.create(null),{timeout:1000});
  cached=multiplayerEligibleLandscapeIds().map(id=>{
    if(!catalog[id])throw new Error('Missing landscape metadata: '+id);
    return JSON.parse(JSON.stringify(catalog[id]));
  });
  return cached;
}
