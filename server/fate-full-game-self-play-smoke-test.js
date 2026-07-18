#!/usr/bin/env node
'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const Learning=require('../src/scripts/07-ai-learning.js');
const {getCardCatalog}=require('./fate-card-catalog');
const {getDeckCatalog}=require('./fate-deck-catalog');
const Engine=require('./fate-full-game-self-play');

const decks=getDeckCatalog().decks;
const cardIds=new Set(getCardCatalog().cards.map(card=>card.id));
assert(decks.length>=20,'headless trainer should load the complete real deck pool');
decks.forEach(deck=>{
  assert.strictEqual(deck.ids.length,40,`${deck.id} must remain a real 40-card deck`);
  deck.ids.forEach(id=>assert(cardIds.has(id),`${deck.id} references missing card ${id}`));
});

const a=Engine.playFullGame({seed:'deterministic-smoke',exploration:0});
const b=Engine.playFullGame({seed:'deterministic-smoke',exploration:0});
assert.deepStrictEqual(a.result,b.result,'full-game simulation should be deterministic for a fixed seed');
assert.deepStrictEqual(a.state.traces,b.state.traces,'fixed seeds should reproduce the same complete action trace');
assert.strictEqual(a.state.turn,20,'headless matches should resolve the complete 20-turn game');
assert(a.state.traces[0].length>0 && a.state.traces[1].length>0,'both players should make real placement or consolidation decisions');
assert(a.state.consolidations.some(value=>value>0),'full-game matches should exercise consolidation');
const iids=[];
a.state.zones.forEach((zone,z)=>{
  [0,1].forEach(player=>assert(zone.cards.filter(card=>card.owner===player&&card.row==='safe').length<=a.state.safeCaps[player][z],'safe-row capacity must remain legal'));
  assert(zone.cards.filter(card=>card.row==='contested').length<=a.state.contestedCaps[z],'contested-row capacity must remain legal');
  zone.cards.forEach(card=>{ iids.push(card.iid); assert(Number(card.currentFate)>=0,'card Fate must remain non-negative'); });
});
assert.strictEqual(new Set(iids).size,iids.length,'board instances must remain unique');
a.state.players.forEach(player=>assert(player.hand.length<=12,'headless matches must enforce the hand limit'));

const trained=Engine.trainFullGamePolicies(Learning.createBasePolicies(),{games:16,seed:'training-smoke'});
assert.strictEqual(trained.games,16);
for(const name of Learning.POLICY_NAMES){
  const policy=trained.policies[name];
  assert(policy.fullGameEpisodes>0,`${name} should record full-game participation`);
  Learning.FEATURE_KEYS.forEach(key=>assert(Number.isFinite(policy.weights[key])&&Math.abs(policy.weights[key])<=1.5,`${name}.${key} must remain bounded`));
}
const validation=Engine.validateFullGamePolicies(Learning.createBasePolicies(),trained.policies,{games:8,seed:'validation-smoke',minimumScore:0.5});
assert.strictEqual(validation.games,8);
assert(validation.candidateWins+validation.baselineWins+validation.draws===8,'validation league must account for every match');

const root=path.resolve(__dirname,'..');
const authority=fs.readFileSync(path.join(root,'server/fate-ws-authority.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.strictEqual(pkg.scripts['train:ai-full-game'],'node server/fate-full-game-self-play-cli.js','full-game training must be an explicit offline command');
assert(!authority.includes("require('./fate-full-game-self-play')"),'live Fly authority must not run the full-game trainer');
assert(/SPECIALIST_POLICY_NAMES\.includes\(policyName\) \|\| state\.landscape === 'igb12'/.test(fs.readFileSync(path.join(root,'server/fate-full-game-self-play.js'),'utf8')),'hidden-hand knowledge must remain restricted to specialists or the revealed-hand landscape');

console.log(`full-game AI self-play smoke passed (${decks.length} real decks)`);
