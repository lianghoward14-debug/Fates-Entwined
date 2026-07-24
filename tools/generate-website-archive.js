'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const cardDataPath = path.join(root, 'src', 'scripts', '01-data-and-state.js');
const archivePath = path.join(root, 'fates-entwined-website', 'archive-data.js');

function extractArrayLiteral(source, declaration){
  const declarationIndex = source.indexOf(declaration);
  if(declarationIndex < 0) throw new Error(`Could not find ${declaration}`);
  const start = source.indexOf('[', declarationIndex + declaration.length);
  if(start < 0) throw new Error(`Could not find the array for ${declaration}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for(let index = start; index < source.length; index += 1){
    const char = source[index];
    const next = source[index + 1];
    if(lineComment){
      if(char === '\n') lineComment = false;
      continue;
    }
    if(blockComment){
      if(char === '*' && next === '/'){
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if(quote){
      if(escaped){
        escaped = false;
      }else if(char === '\\'){
        escaped = true;
      }else if(char === quote){
        quote = '';
      }
      continue;
    }
    if(char === '/' && next === '/'){
      lineComment = true;
      index += 1;
      continue;
    }
    if(char === '/' && next === '*'){
      blockComment = true;
      index += 1;
      continue;
    }
    if(char === '\'' || char === '"' || char === '`'){
      quote = char;
      continue;
    }
    if(char === '[') depth += 1;
    if(char === ']'){
      depth -= 1;
      if(depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not find the end of ${declaration}`);
}

function loadExistingLore(){
  if(!fs.existsSync(archivePath)) return [];
  const sandbox = {window:{}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(archivePath, 'utf8'), sandbox, {filename:archivePath});
  return Array.isArray(sandbox.window.FATES_ARCHIVE_DATA?.lore)
    ? sandbox.window.FATES_ARCHIVE_DATA.lore
    : [];
}

function websiteImagePath(value){
  const image = String(value || '').split('?')[0].replace(/\\/g, '/').replace(/^\.?\//, '');
  if(!image) return '../blank.png';
  if(/^(?:data:|https?:|\/)/i.test(image)) return image;
  return '../' + image;
}

const cardSource = fs.readFileSync(cardDataPath, 'utf8');
const cardLiteral = extractArrayLiteral(cardSource, 'const CARDS =');
const cards = vm.runInNewContext(`(${cardLiteral})`, {Object}, {filename:'website-card-catalog.js'})
  .map(card=>({
    id:String(card.id || ''),
    name:String(card.name || ''),
    ability:String(card.ability || ''),
    type:String(card.type || 'Card'),
    aff:String(card.aff || ''),
    fate:Number(card.fate) || 0,
    cost:Number(card.cost) || 0,
    rarity:String(card.rarity || ''),
    set:String(card.set || 'core'),
    token:card.token === true,
    retired:card.retired === true,
    effect:String(card.effect || ''),
    flavor:String(card.flavor || ''),
    img:websiteImagePath(card.img)
  }));

const archive = {
  generatedAt:new Date().toISOString(),
  cardCount:cards.length,
  cards,
  lore:loadExistingLore()
};

fs.writeFileSync(
  archivePath,
  'window.FATES_ARCHIVE_DATA = ' + JSON.stringify(archive, null, 2) + ';\n',
  'utf8'
);

console.log(`Generated website archive with ${cards.length} cards.`);
