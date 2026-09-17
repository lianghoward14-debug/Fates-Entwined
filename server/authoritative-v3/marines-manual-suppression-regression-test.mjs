import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {legalCommandTemplates} from '../../shared/engine/legal-commands.mjs';
import {command} from './test-helpers.mjs';

const core = fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js', import.meta.url), 'utf8');
function fn(name) {
  const start = core.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert(start >= 0, name);
  return core.slice(start, core.indexOf('\n}', start) + 2);
}
const browser = {
  window:{}, G:{currentPlayer:1, turn:2, oppSuppressedNextTurn:true, suppressTarget:1},
  getCardRuntimeEffectId:card=>card.id, isEffectImmuneSource:card=>!!card.immuneFlag,
  isCardSuppressedByHenryDong:()=>false, isDirectCardEffectSuppressed:()=>false,
  closeModal:()=>{}, toast:()=>{}, playSfx:()=>{},
  MANUAL_EFFECT_BLOCKED_CARD_IDS:new Set(), AUTHORITATIVE_ACTIVATE_EFFECT_IDS:new Set(['20','93']),
  canActivateLandscapeSupporterEffect:()=>true, checkReactions:async()=>true,
  recordSupporterEffectActivation:()=>{}, getSupporterEffectAffectedOwners:()=>[],
  renderEffectResolutionForPlayer:()=>{}
};
vm.createContext(browser);
vm.runInContext(['hasNoSuppressibleFieldEffect','isPlayerSupporterEffectsSuppressed',
  'isSupporterEffectSuppressed','isCardEffectSuppressed','canUseManualCharacterEffect',
  'beginManualSupporterEffectActivation','triggerCharacterEffect'].map(fn).join('\n'), browser);
for(const id of ['20','93']) {
  const card = {id, iid:id, name:id, type:'Supporter', owner:1, usesLeft:2};
  assert.equal(await browser.beginManualSupporterEffectActivation(card,0,0,0,[],{activationTiming:'ACTIVATE'}),false);
  await browser.triggerCharacterEffect(card,0,0,0);
  assert.equal(card.usesLeft,2);
  assert.equal(card.effectUsedInitial,undefined);
  assert.equal(browser.G._southWindMoraleBlock,undefined);
}
const shield = {id:'20', iid:'shield', name:'Shield Wall', type:'Supporter', owner:1, usesLeft:2};
assert.equal(browser.canUseManualCharacterEffect(shield),false);
browser.G.oppSuppressedNextTurn = false;
browser.G.suppressTarget = null;
assert.equal(browser.canUseManualCharacterEffect(shield),true);
await browser.triggerCharacterEffect(shield,0,0,0);
assert.equal(shield.usesLeft,1);
assert.equal(browser.G._southWindMoraleBlock.sourceIid,'shield');

// Exercise actual Marines creation, turn expiry, legal actions and server enforcement.
for(const id of ['20','93']) {
  const definitions = ['18',id].map(id=>({id,name:id,type:'Supporter',aff:'eventide',fate:1,cost:0}));
  let state = createInitialState({matchId:'suppression-'+id,seed:id,handSize:99,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:['18']},{id:'p1',deckIds:[id]}]});
  const card = state.players[1].hand.pop();
  state.board[0][0][0] = card;
  let seq = 0;
  function send(type,payload={}) {
    const playerId = 'p'+state.activePlayer;
    const result = reduceCommand(state,command(state,playerId,++seq,type,payload),{playerId});
    if(result.ok) state = result.state;
    return result;
  }
  assert.equal(send('SET_CARD',{cardIid:state.players[0].hand[0].iid,destination:{z:0,r:2,c:0}}).ok,true);
  assert.equal(send('END_TURN').ok,true);
  const activations = ()=>legalCommandTemplates(state,1).filter(c=>c.type==='ACTIVATE_EFFECT' && c.payload.sourceIid===card.iid);
  assert.equal(activations().length,0,id+' unavailable during suppression');
  const blocked = send('ACTIVATE_EFFECT',{sourceIid:card.iid,userActivated:true});
  assert.equal(blocked.ok,false,id+' server rejects direct activation');
  assert.equal(state.board[0][0][0].counters.effectUses || 0,0);
  assert.equal(send('END_TURN').ok,true);
  assert.equal(send('END_TURN').ok,true);
  assert(activations().length > 0,id+' becomes available after expiry');
  assert.equal(send('ACTIVATE_EFFECT',{sourceIid:card.iid,userActivated:true}).ok,true);
}
console.log('Marines suppression blocks manual Supporter effects without consuming uses, then expires in single-player and multiplayer.');
