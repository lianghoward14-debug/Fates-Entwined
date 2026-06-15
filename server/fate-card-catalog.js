'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEFAULT_CARD_DATA_PATH = path.resolve(__dirname, '..', 'src', 'scripts', '01-data-and-state.js');

let cachedCatalog = null;

function extractCardsLiteral(source){
  const start = source.indexOf('const CARDS = [');
  if(start < 0) throw new Error('CARDS literal not found');
  const arrayStart = source.indexOf('[', start);
  if(arrayStart < 0) throw new Error('CARDS array start not found');
  let depth = 0;
  let quote = '';
  let escaped = false;
  for(let i = arrayStart; i < source.length; i += 1){
    const ch = source[i];
    if(quote){
      if(escaped){
        escaped = false;
      }else if(ch === '\\'){
        escaped = true;
      }else if(ch === quote){
        quote = '';
      }
      continue;
    }
    if(ch === '\'' || ch === '"' || ch === '`'){
      quote = ch;
      continue;
    }
    if(ch === '[') depth += 1;
    if(ch === ']'){
      depth -= 1;
      if(depth === 0) return source.slice(arrayStart, i + 1);
    }
  }
  throw new Error('CARDS array end not found');
}

function sanitizeCard(card){
  if(!card || typeof card !== 'object') return null;
  const out = {};
  Object.keys(card).forEach(key=>{
    const value = card[key];
    if(value === undefined || typeof value === 'function') return;
    if(value && typeof value === 'object') return;
    out[key] = value;
  });
  out.id = String(out.id || '');
  if(Object.prototype.hasOwnProperty.call(out, 'name')) out.name = String(out.name || '');
  if(Object.prototype.hasOwnProperty.call(out, 'ability')) out.ability = String(out.ability || '');
  if(Object.prototype.hasOwnProperty.call(out, 'type')) out.type = String(out.type || '');
  if(Object.prototype.hasOwnProperty.call(out, 'aff')) out.aff = String(out.aff || '');
  if(Object.prototype.hasOwnProperty.call(out, 'fate')) out.fate = Number(out.fate || 0) || 0;
  if(Object.prototype.hasOwnProperty.call(out, 'cost')) out.cost = Number(out.cost || 0) || 0;
  if(Object.prototype.hasOwnProperty.call(out, 'rarity')) out.rarity = String(out.rarity || '');
  if(Object.prototype.hasOwnProperty.call(out, 'effect')) out.effect = String(out.effect || '');
  if(Object.prototype.hasOwnProperty.call(out, 'flavor')) out.flavor = String(out.flavor || '');
  if(Object.prototype.hasOwnProperty.call(out, 'img')) out.img = String(out.img || '');
  if(Object.prototype.hasOwnProperty.call(out, 'set')) out.set = String(out.set || '');
  if(Object.prototype.hasOwnProperty.call(out, 'retired')) out.retired = !!out.retired;
  if(Object.prototype.hasOwnProperty.call(out, 'temporarilyDisabled')) out.temporarilyDisabled = !!out.temporarilyDisabled;
  return out;
}

function loadCardCatalog(filePath){
  const target = filePath || process.env.FATE_CARD_DATA_PATH || DEFAULT_CARD_DATA_PATH;
  const source = fs.readFileSync(target, 'utf8');
  const literal = extractCardsLiteral(source);
  const sandbox = Object.create(null);
  const cards = vm.runInNewContext(`(${literal})`, sandbox, {timeout:1000});
  if(!Array.isArray(cards)) throw new Error('CARDS literal did not evaluate to an array');
  const byId = new Map();
  cards.map(sanitizeCard).filter(Boolean).forEach(card=>{
    if(card.id) byId.set(card.id, card);
  });
  return {cards:[...byId.values()], byId, sourcePath:target};
}

function getCardCatalog(){
  if(!cachedCatalog) cachedCatalog = loadCardCatalog();
  return cachedCatalog;
}

module.exports = {
  getCardCatalog,
  loadCardCatalog
};
