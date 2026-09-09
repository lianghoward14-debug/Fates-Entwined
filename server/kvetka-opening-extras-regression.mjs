import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState} from '../shared/engine/state.mjs';

const source = fs.readFileSync(new URL('../src/scripts/04-game-setup.js', import.meta.url), 'utf8');
const start = source.indexOf('  const avalancheEscapeCards =');
const end = source.indexOf('\n  });', source.indexOf('  avalancheEscapeCards.forEach', start)) + 6;
for (const copies of [0, 1, 3]) {
  const ids = [...Array(copies).fill('84'), ...Array(40-copies).fill('01')];
  const state = createInitialState({matchId:'opening-test', cardDefinitions:['01','84'].map(id=>({id,type:'Initiator',fate:3})), players:[{id:'a',deckIds:ids},{id:'b',deckIds:ids}]});
  const G = {players:[0,1].map(()=>({deck:ids.map(id=>({id})),hand:[]})),p1Deck:ids,p2Deck:ids};
  vm.runInNewContext(source.slice(start,end), {G,
    drawCard:p=>G.players[p].hand.push(G.players[p].deck.shift()),
    addCardToHand:(p,c)=>G.players[p].hand.push(c)});
  for (const player of [...state.players,...G.players]) {
    assert.equal(player.hand.length, 6+copies);
    assert.equal(player.hand.filter(c=>c.id==='84').length,copies);
    assert.equal(player.deck.length,34-copies);
  }
}
console.log('Kvetka additional opening cards pass in both engines');
