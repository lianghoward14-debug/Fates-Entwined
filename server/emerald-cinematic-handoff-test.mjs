import assert from 'node:assert/strict';
import {FateAuthoritativeV3SinglePlayerScreen as Screen} from '../src/scripts/authoritative-v3-single-player-screen.mjs';
let finish, plays=0, actions=0;
const source={id:'120',iid:'emerald-1',owner:0};
const screen=Object.create(Screen.prototype);
Object.assign(screen,{
  view:{playerIndex:0,state:{matchId:'handoff',pendingPrompt:{title:'Call to Arms',sourceIid:source.iid}}},
  findCard:()=>source,presentationCard:card=>card,
  window:{showEffectActivationCinematic:()=>{plays++;return new Promise(resolve=>finish=resolve);}},
  renderActions:()=>{assert.equal(screen.callToArmsActivationPending,false);actions++;}
});
screen.prepareCallToArmsActivation();
assert.equal(screen.callToArmsActivationPending,true);
await Promise.resolve();
assert.equal(plays,1);assert.equal(actions,0);
screen.prepareCallToArmsActivation();assert.equal(plays,1);
finish();await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(actions,1);
screen.prepareCallToArmsActivation();assert.equal(plays,1);
console.log('Emerald Children: Call to Arms waits for the cinematic; updates do not replay it.');
