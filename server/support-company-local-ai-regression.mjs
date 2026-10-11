import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as support from '../shared/support-company.mjs';
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
const ui=fs.readFileSync('src/scripts/support-company.mjs','utf8');
const cards=[{id:'01',type:'Coordinator',cost:20,fate:50,rarity:'rare'},
  {id:'16',type:'Supporter',cost:0,fate:5,rarity:'common'}];
for(const mode of ['free','challenger','warfront']){
  const original=[];
  const G={aiEnabled:true,aiPlayer:1,currentPlayer:1,phase:'main',turn:2,
    players:[{hand:[]},{hand:original,name:'AI'}],_moralePressure:{morale:[200,200]}};
  let shown=0,limited=0;
  const sandbox={G,CURRENT_MODE:mode,CARDS:cards,window:{FATE_MORALE_PRESSURE_RULES_ENABLED:true},
    ...support,aiClearZoneScoreCache(){},aiGenerateAllMoves:()=>G.players[1].hand.filter(c=>!c.cost).map(card=>({card,z:1,type:'place'})),
    aiEvaluateMove:move=>move.card.fate*4,aiIntelligence:()=>({moraleCycleDamage:()=>({incoming:0})}),
    aiProjectedMoveFate:move=>move.card.fate,aiCachedZoneScore:()=>0,
    createCardInstance:(card,owner)=>({...card,owner,iid:'received'}),
    addCardToHand:(player,card)=>G.players[player].hand.push(card),renderGame(){},log(){},
    enforceHandLimit(){limited++;},playSupportCompanyAnimation:async()=>{shown++;}};
  vm.createContext(sandbox);
  vm.runInContext(ai.slice(ai.indexOf('function aiRankSupportCompanyOffers('),ai.indexOf('\nfunction aiEvaluateMove(')),sandbox);
  vm.runInContext(ui.replace(/^import .*;\r?\n/gm,''),sandbox);
  const ranked=sandbox.aiRankSupportCompanyOffers(cards.map(card=>({card})));
  assert.equal(ranked[0].card.id,'16');assert.equal(G.players[1].hand,original);assert.equal(original.length,0);
  assert.equal(await sandbox.window.tryAiSupportCompany(1),true,mode);
  assert.equal(original[0].id,'16');assert.equal(G._supportCompanyUses[1],1);assert.equal(shown,1);assert.equal(limited,1);
  assert.equal(await sandbox.window.tryAiSupportCompany(1),false,'preserve healthy Morale');
  original.length=0;G._moralePressure.morale[1]=10;
  assert.equal(await sandbox.window.tryAiSupportCompany(1),true,'affordable useful paid reinforcement');
  assert.equal(G._moralePressure.morale[1],5);assert.equal(G._supportCompanyUses[1],2);
  assert.equal(await sandbox.window.tryAiSupportCompany(1),false,'both uses exhausted');
  G._supportCompanyUses[1]=1;G._moralePressure.morale[1]=1;original.length=0;
  assert.equal(await sandbox.window.tryAiSupportCompany(1),false,'never pay last Morale');
  G.currentPlayer=0;
  assert.equal(await sandbox.window.tryAiSupportCompany(1),false,'never act out of turn');
  // Even a failing evaluator must restore the original hand.
  G.currentPlayer=1;sandbox.aiEvaluateMove=()=>{throw new Error('test');};
  assert.throws(()=>sandbox.aiRankSupportCompanyOffers(cards.map(card=>({card}))));
  assert.equal(G.players[1].hand,original);
}
assert(ai.indexOf('await window.tryAiSupportCompany(G.aiPlayer)')<ai.indexOf('if(hand.length===0 && !canSetPolishFromDeck'));
console.log('Local Support Company AI: mode-independent execution, strategic offers, cost restraint, uses, turn guards, presentation and restored speculative hand passed.');
