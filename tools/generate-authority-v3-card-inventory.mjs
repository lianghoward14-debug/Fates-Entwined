import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {
  classifyCardCoverage,
  classifyLandscapeCoverage
} from '../shared/engine/coverage/phase0-classifier.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../server/fate-card-catalog.js');

function extractObjectLiteral(source, declaration){
  const start = source.indexOf(declaration);
  if(start < 0) throw new Error(`${declaration} literal not found`);
  const objectStart = source.indexOf('{', start);
  if(objectStart < 0) throw new Error(`${declaration} object start not found`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for(let index = objectStart; index < source.length; index += 1){
    const character = source[index];
    if(quote){
      if(escaped) escaped = false;
      else if(character === '\\') escaped = true;
      else if(character === quote) quote = '';
      continue;
    }
    if(character === '\'' || character === '"' || character === '`'){
      quote = character;
      continue;
    }
    if(character === '{') depth += 1;
    if(character === '}'){
      depth -= 1;
      if(depth === 0) return source.slice(objectStart, index + 1);
    }
  }
  throw new Error(`${declaration} object end not found`);
}

function getLandscapeCatalog(sourcePath){
  const source = fs.readFileSync(sourcePath, 'utf8');
  const literal = extractObjectLiteral(source, 'const LANDSCAPES =');
  const definitions = vm.runInNewContext(`(${literal})`, Object.create(null), {timeout:1000});
  return Object.values(definitions).map(item=>({
    id:String(item?.id || ''),
    name:String(item?.name || ''),
    shortName:String(item?.shortName || ''),
    description:String(item?.description || ''),
    needsTargetZone:item?.needsTargetZone === true
  }));
}

export function buildPhase0Inventory(){
  const catalog = getCardCatalog();
  const cards = catalog.cards.map(classifyCardCoverage);
  const landscapes = getLandscapeCatalog(catalog.sourcePath).map(classifyLandscapeCoverage);
  return {
    format:'fates-authority-v3-phase0-inventory-v2',
    generatedFrom:path.relative(process.cwd(), catalog.sourcePath).replaceAll('\\', '/'),
    phase:'Phase 0: Architecture and Rule Inventory',
    gateStatus:'classified-not-implemented',
    summary:{
      playableCards:cards.length,
      landscapes:landscapes.length,
      isolatedPrototypeCards:cards.filter(item=>item.implementationStatus === 'isolated-v3-prototype').length,
      unportedCards:cards.filter(item=>item.implementationStatus === 'not-ported').length,
      isolatedPrototypeLandscapes:landscapes.filter(item=>item.implementationStatus === 'isolated-v3-prototype').length,
      unportedLandscapes:landscapes.filter(item=>item.implementationStatus === 'not-ported').length,
      openCardAmbiguityFlags:cards.reduce((total, item)=>total + item.ambiguityFlags.length, 0),
      openLandscapeAmbiguityFlags:landscapes.reduce((total, item)=>total + item.ambiguityFlags.length, 0)
    },
    taxonomy:{
      assignmentKinds:['operation', 'modifier', 'trigger', 'custom-handler'],
      coverageMeaning:'Every playable definition has a Phase 0 classification. Classification is not an implementation or multiplayer eligibility claim.'
    },
    cards,
    landscapes
  };
}

function main(){
  const inventory = buildPhase0Inventory();
  const output = JSON.stringify(inventory, null, 2) + '\n';
  const outIndex = process.argv.indexOf('--out');
  if(outIndex >= 0){
    const target = process.argv[outIndex + 1];
    if(!target) throw new Error('--out requires a file path');
    fs.writeFileSync(target, output);
  }else{
    process.stdout.write(output);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invokedPath === fileURLToPath(import.meta.url)){
  main();
}
