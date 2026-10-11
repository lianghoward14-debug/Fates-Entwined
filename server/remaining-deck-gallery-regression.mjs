import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {projectStateForPlayer,projectStateForSpectator} from '../shared/engine/index.mjs';
import {testState} from './authoritative-v3/test-helpers.mjs';
const state=testState();
state.players.forEach(player=>{player.deck=player.hand.splice(0,3);});
const before=JSON.stringify(state.players[0].deck);
const own=projectStateForPlayer(state,0);
assert.equal(own.players[0].remainingDeck.length,3);
assert.equal(own.players[1].remainingDeck,undefined);
const reversed=structuredClone(state);
reversed.players[0].deck.reverse();
assert.deepEqual(projectStateForPlayer(reversed,0).players[0].remainingDeck,own.players[0].remainingDeck);
state.landscapeId='igb12';
assert.equal(projectStateForPlayer(state,0).players[1].remainingDeck,undefined,'revealed hands must not reveal opponent deck');
assert.equal(projectStateForSpectator(state,0).players[0].remainingDeck,undefined);
assert.equal(JSON.stringify(state.players[0].deck),before,'inspection must not reorder the deck');
state.players[0].deck.pop();
assert.equal(projectStateForPlayer(state,0).players[0].remainingDeck.length,2);

const source=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const start=source.indexOf('function showRemainingDeckCards(');
const end=source.indexOf('window.showRemainingDeckCards=',start);
let gallery,back;
const context={G:{players:[{deck:[{id:'32'},{id:'05'}]}]},window:{},isPerspectivePlayer:p=>p===0,
  sortHowardDevDeckCards:cards=>cards.sort((a,b)=>a.id.localeCompare(b.id)),
  showCanvasCardGalleryModal:(title,cards,opts)=>{gallery={title,cards,opts};},
  openCardDetailFromDeckPreview(){},showDeckInfo:p=>{back=p;},toast(){},
  document:{querySelector:()=>({classList:{add(){}}}),createElement:()=>({}),getElementById:()=>({prepend:button=>{back=button;}})}};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
context.showRemainingDeckCards(0);
assert.equal(gallery.cards.length,2);
assert.equal(context.G.players[0].deck[0].id,'32');
back.onclick();assert.equal(back,0);
context.G.players[0].deck=[];
context.showRemainingDeckCards(0);assert.equal(gallery.cards.length,0);
context.G._phase7CurrentMultiplayer=true;
context.G.players[0].remainingDeck=[{id:'05'}];
context.showRemainingDeckCards(0);assert.equal(gallery.cards.length,1);
gallery=null;context.showRemainingDeckCards(1);assert.equal(gallery,null);
// Exercise the actual multiplayer reconciliation, not a hand-filled gallery list.
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const syncStart=online.indexOf('  function syncOnlinePlayersInPlace(');
const syncEnd=online.indexOf('  function captureOnlineCanonicalState(',syncStart);
context.cloneOnlinePlain=value=>structuredClone(value);
context.syncOnlineCardListInPlace=(_old,cards)=>structuredClone(cards||[]);
vm.runInContext(online.slice(syncStart,syncEnd),context);
for(const playerIndex of [0,1]){
 const projected=projectStateForPlayer(state,playerIndex);
 const players=projected.players.map(p=>({...p,deck:[],remainingDeck:p.remainingDeck}));
 context.G.players=context.syncOnlinePlayersInPlace(context.G.players,players,{});
 context.isPerspectivePlayer=p=>p===playerIndex;
 context.window.FateAuthorityV3SinglePlayer={currentScreen:()=>({view:{state:{players:[{remainingDeck:[{id:'stale-solo'}]},{remainingDeck:[{id:'stale-solo'}]}]}}})};
 context.showRemainingDeckCards(playerIndex);
 assert.deepEqual(gallery.cards.map(c=>c.id).sort(),projected.players[playerIndex].remainingDeck.map(c=>c.id).sort());
 assert.equal(context.G.players[1-playerIndex].remainingDeck,null);
 players[playerIndex].remainingDeck=[];
 context.G.players=context.syncOnlinePlayersInPlace(context.G.players,players,{});
 context.showRemainingDeckCards(playerIndex);assert.equal(gallery.cards.length,0);
 delete players[playerIndex].remainingDeck;
 context.G.players=context.syncOnlinePlayersInPlace(context.G.players,players,{});
 assert.equal(context.G.players[playerIndex].remainingDeck,null,'clear stale gallery when projection is absent');
}

console.log('Remaining deck gallery passed: live contents, empty deck, return navigation, local/multiplayer, ownership and hidden draw order.');
