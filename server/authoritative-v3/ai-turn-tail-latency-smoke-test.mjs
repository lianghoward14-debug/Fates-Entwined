import assert from 'node:assert/strict';
import {aiSearchContextForStep} from '../../src/scripts/authoritative-v3-single-player-adapter.mjs';

const initial={difficulty:'hard',canonicalState:{turn:3}};
assert.equal(aiSearchContextForStep(initial,0),initial,'the opening decision keeps the full search configuration');

for(const difficulty of ['easy','medium','hard','extreme']){
  const bounded=aiSearchContextForStep({difficulty,canonicalState:{turn:3}},1);
  assert.equal(bounded.samples,1,`${difficulty} continuation search must use one belief sample`);
  assert(Number.isInteger(bounded.nodeBudget) && bounded.nodeBudget<=300,
    `${difficulty} continuation search must stay within the interactive turn-tail budget`);
}

console.log('AI turn-tail search budget regression passed.');
