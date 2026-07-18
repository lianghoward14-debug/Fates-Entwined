'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {getCardCatalog} = require('./fate-card-catalog');

const DEFAULT_DECK_DATA_PATH = path.resolve(__dirname, '..', 'src', 'scripts', '09-challenger-mode.js');
let cachedCatalog = null;

function extractArrayLiteral(source, declaration){
  const marker = `const ${declaration} = [`;
  const start = source.indexOf(marker);
  if(start < 0) throw new Error(`${declaration} literal not found`);
  const arrayStart = source.indexOf('[', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for(let i = arrayStart; i < source.length; i += 1){
    const ch = source[i];
    if(quote){
      if(escaped) escaped = false;
      else if(ch === '\\') escaped = true;
      else if(ch === quote) quote = '';
      continue;
    }
    if(ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if(ch === '[') depth += 1;
    else if(ch === ']' && --depth === 0) return source.slice(arrayStart, i + 1);
  }
  throw new Error(`${declaration} array end not found`);
}

function sanitizeDeck(deck, validIds){
  if(!deck || typeof deck !== 'object') return null;
  const ids = (Array.isArray(deck.ids) ? deck.ids : []).map(String).filter(id=>validIds.has(id)).slice(0, 40);
  if(ids.length !== 40) return null;
  return {
    id:String(deck.id || ''),
    baseStrategy:String(deck.baseStrategy || deck.id || ''),
    name:String(deck.name || deck.id || 'Headless deck'),
    theme:String(deck.theme || ''),
    ids
  };
}

function loadDeckCatalog(filePath){
  const target = filePath || DEFAULT_DECK_DATA_PATH;
  const source = fs.readFileSync(target, 'utf8');
  const sandbox = Object.create(null);
  const starter = vm.runInNewContext(`(${extractArrayLiteral(source, 'STARTER_DECKS')})`, sandbox, {timeout:1000});
  const aiOnly = vm.runInNewContext(`(${extractArrayLiteral(source, 'AI_ONLY_RANDOM_DECKS')})`, sandbox, {timeout:1000});
  const validIds = new Set(getCardCatalog().cards.map(card=>card.id));
  const decks = [...starter, ...aiOnly].map(deck=>sanitizeDeck(deck, validIds)).filter(Boolean);
  const byId = new Map(decks.map(deck=>[deck.id, deck]));
  return {decks, byId, sourcePath:target};
}

function getDeckCatalog(){
  if(!cachedCatalog) cachedCatalog = loadDeckCatalog();
  return cachedCatalog;
}

module.exports = {extractArrayLiteral, loadDeckCatalog, getDeckCatalog};
