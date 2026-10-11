import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {FateAuthoritativeV3SinglePlayerScreen} from '../src/scripts/authoritative-v3-single-player-screen.mjs';

const source=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const start=source.indexOf('  function phase7PromptModalMatches(prompt){');
const end=source.indexOf('  function phase7GuardOptionPrompt(',start);
let overlay={dataset:{promptKey:'prompt:santiago'}};
const document={querySelector:()=>overlay,getElementById:()=>null};
const context={document};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
assert.equal(context.phase7PromptModalMatches({promptId:'santiago'}),true);
assert.equal(context.phase7PromptModalMatches({promptId:'different'}),false);
overlay=null;assert.equal(context.phase7PromptModalMatches({promptId:'santiago'}),false);

overlay={dataset:{promptKey:'prompt:santiago'}};
let callback,reopens=0;
const screen=Object.create(FateAuthoritativeV3SinglePlayerScreen.prototype);
Object.assign(screen,{document,window:{setTimeout:fn=>{callback=fn;return 1;},clearTimeout(){}},
  view:{playerIndex:0,state:{pendingPrompt:{promptId:'santiago',playerIndex:0,type:'CARD_SELECTION'}}},
  visualPromptKey:'prompt:santiago'});
assert.equal(screen.syncVisualCardPrompt(screen.view),true,'existing overlay survives render');
screen.syncVisualCardPrompt=()=>{reopens++;};
screen.guardVisualCardPrompt('prompt:santiago');
for(let i=0;i<50;i++)callback();
assert.equal(reopens,0,'guard must not replay entry during idle or selection animation');
overlay=null;callback();assert.equal(reopens,1,'genuinely missing picker still recovers');
overlay={dataset:{promptKey:'prompt:other'}};screen.guardVisualCardPrompt('prompt:santiago');callback();
assert.equal(reopens,2,'unrelated overlay does not satisfy the current prompt');
console.log('PASS Royal Seal prompt ownership: online matching, stable local renders, repeated guard polls, missing/stale picker recovery.');
