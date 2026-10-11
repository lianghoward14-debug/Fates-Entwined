import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {filterAiTargets} from '../shared/ai/targeting.mjs';
const choices=['DECLINE','NEGATE','SUPPRESS'].map(choice=>({type:'ANSWER_PROMPT',payload:{choice}}));
for(const player of [0,1]){
 const source={iid:'hidden',id:'107',owner:1-player,faceDown:true};
 const state={board:[[[source]]],pendingPrompt:{type:'REACTION',playerIndex:player,sourceIid:source.iid}};
 assert.deepEqual(filterAiTargets(choices,state,player),[choices[0]]);
 state.board=[[[null]]];state.pendingPrompt.hiddenSource=true;
 assert.deepEqual(filterAiTargets(choices,state,player),[choices[0]],'redacted projection also declines');
}
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
const start=ai.indexOf('function aiChooseReaction('),end=ai.indexOf('\nfunction ',start+10);
const box={aiIntelligence:()=>{throw Error('hidden effect must not be evaluated');}};
vm.createContext(box);vm.runInContext(ai.slice(start,end),box);
assert.equal(box.aiChooseReaction([{type:'lydia'}],{card:{faceDown:true}}),null);
assert.equal(box.aiChooseReaction([{type:'havano'}],{hiddenSource:true}),null);
console.log('PASS AI hidden activations: both seats, canonical state, redacted state, legacy reactions.');
