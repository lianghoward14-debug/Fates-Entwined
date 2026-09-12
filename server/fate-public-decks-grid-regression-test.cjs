#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/scripts/08-audio-and-meta-ui.js'),'utf8');
assert(source.includes(`html += '<div class="pd-list pd-list-page">';`),'public decks must use the anchored page grid');
const css=fs.readFileSync(path.join(root,'src/styles/99-ui-final.css'),'utf8');
assert(css.includes('display:grid!important'),'public deck grid must use CSS grid');
assert(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'),'public deck grid must fill rows from the top-left');
console.log('Public decks top-left row-major grid regression passed');
