import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as E from '../../shared/engine/index.mjs';
import catalog from '../fate-card-catalog.js';
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=online.indexOf('  function phase7CardToLegacy(');
const projection=online.slice(start,online.indexOf('  function phase7PresentationCard(',start));
const activeStart=core.indexOf('function isActiveWhisperToken(');
const active=core.slice(activeStart,core.indexOf('\n}',activeStart)+2);
const context=vm.createContext({window:{},cloneOnlinePlain:structuredClone,
  WHISPER_UNCOPYABLE_COORDINATOR_IDS:new Set(),isWhisperOfTheHeartToken:c=>c.id==='whisper17',
  isFaceDownCard:c=>c.faceDown===true,isCardEffectSuppressed:c=>c.statuses.includes('EFFECTS_SUPPRESSED')});
vm.runInContext(projection+active,context);
for(const owner of [0,1]) for(const copied of ['10','11']){
  let s=E.createInitialState({matchId:`aura-${owner}-${copied}`,seed:'aura',activePlayer:owner,
    landscapeId:'igb17',handSize:40,cardDefinitions:catalog.getCardCatalog().cards,
    players:[0,1].map(p=>({id:`p${p}`,deckIds:[copied,'05','05','05']}))});
  const row=owner===0?2:0;
  const hand=s.players[owner].hand;
  s.board[0][row][0]=hand.splice(hand.findIndex(c=>c.id===copied),1)[0];
  let seq=0;
  function run(command){const result=E.reduceCommand(s,{...command,matchId:s.matchId,expectedRevision:s.revision,commandId:`c${++seq}`},{playerIndex:owner});assert(result.ok,JSON.stringify(result.rejection));s=result.state;}
  run(E.legalCommandTemplates(s,owner).find(c=>c.type==='ACTIVATE_LANDSCAPE'));
  const token=s.players[owner].hand.find(c=>c.id==='whisper17');
  assert.equal(context.phase7CardToLegacy(token,s)._whisperEffectActivated,false);
  run(E.legalCommandTemplates(s,owner).find(c=>c.type==='SET_CARD'&&c.payload.cardIid===token.iid));
  const targetOwner=copied==='10'?1-owner:owner;
  for(let z=0;z<3;z++){
    const h=s.players[targetOwner].hand;
    const target=h.splice(h.findIndex(c=>c.id==='05'),1)[0];target.currentFate=8;
    s.board[z][targetOwner===0?2:0][3]=target;
    assert.equal(E.effectiveFate(s,E.findBoardCard(s,target.iid)),copied==='10'?5:11);
  }
  for(const viewer of [0,1]){
    const view=E.projectStateForPlayer(s,viewer);
    const card=context.phase7CardToLegacy(E.findBoardCard(s,token.iid).card,view);
    assert(context.isActiveWhisperToken(card,copied,owner),'both clients enable the field-wide aura');
    card.faceDown=true;assert(!context.isActiveWhisperToken(card,copied,owner));
    card.faceDown=false;card.statuses.push('EFFECTS_SUPPRESSED');assert(!context.isActiveWhisperToken(card,copied,owner));
  }
}
console.log('Shizuku auras: all zones, both owners/viewers, hand inactivity and suppression passed');
