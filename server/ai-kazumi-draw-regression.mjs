import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../shared/engine/index.mjs';
import {command} from './authoritative-v3/test-helpers.mjs';
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8'),setup=fs.readFileSync('src/scripts/04-game-setup.js','utf8');
for(const deckSize of [5,2]){
 const card={id:'27',iid:'kazumi',type:'Initiator',owner:1};let cinematics=0;
 const c={G:{currentPlayer:1,aiPlayer:1,turn:2,players:[{hand:[],deck:[]},{hand:[],deck:Array.from({length:deckSize},(_,i)=>({id:'32',iid:'draw-'+i}))}],_suppressEffectPrompt:true},
 window:{fateEffectRequiresManualActivationId:()=>false},document:{getElementById:()=>null},
 getAIDifficultySettings:()=>({mistakeChance:0,skipEffectChance:1}),forEachBoardCard:fn=>fn(card,0,0,0),isFaceDownCard:()=>false,
 shouldShowManualCharacterEffectButton:()=>false,canUseManualCharacterEffect:c=>!c.effectUsedInitial,
 automaticBoardEffectsEnabled:()=>true,playEffectActivationCinematic:async()=>cinematics++,
 aiSleep:async()=>{},AI_VISUAL_PAUSE_EFFECTS:0,getPerspectivePlayerIndex:()=>0,
 resolveFortCalvinDrawInterception:()=>({redirected:false}),addCardToHand:(p,card)=>{c.G.players[p].hand.push(card);return true;},
 playSfx:()=>{},log:()=>{},renderGame:()=>{},setTimeout:fn=>fn()};
 vm.runInNewContext(ai.slice(ai.indexOf('async function aiActivateEffects()'),ai.indexOf('async function aiRunSupporterBoardAbility(')),c);
 vm.runInNewContext(ai.slice(ai.indexOf('async function aiRunEffect(')),c);
 vm.runInNewContext(setup.slice(setup.indexOf('async function drawCard('),setup.indexOf('function transferAliIndomitableToOpponentHand(')),c);
 await c.aiActivateEffects();
 assert.equal(c.G.players[1].hand.length,Math.min(3,deckSize));assert.equal(c.G.players[0].hand.length,0);
 assert.equal(cinematics,1);assert.equal(card.effectUsedInitial,true);
 await c.aiActivateEffects();assert.equal(cinematics,1,'once-only even with automatic effects and maximum AI skip chance');
}
let state=createInitialState({matchId:'ai-kazumi',seed:'test',handSize:0,cardDefinitions:[{id:'27',name:'Kazumi',type:'Initiator',fate:1,cost:1},{id:'32',name:'Resident',type:'Supporter',fate:1,cost:0}],players:[{id:'human',deckIds:['32']},{id:'ai',deckIds:['27','32','32','32','32']}]});
state.activePlayer=1;const deck=state.players[1].deck;
const kazumi=deck.splice(deck.findIndex(c=>c.id==='27'),1)[0];state.players[1].hand.push(kazumi);
const tribute=deck.shift();tribute.controller=1;state.board[0][0][0]=tribute;
const result=reduceCommand(state,command(state,'ai',1,'CONSOLIDATE_CARD',{cardIid:kazumi.iid,tributeIids:[tribute.iid],destination:{z:0,r:0,c:0}}),{playerId:'ai'});
assert.equal(result.ok,true);assert.equal(result.state.players[1].hand.length,3);assert.equal(result.state.players[0].hand.length,0);
console.log('AI Kazumi draws three exactly once with automatic effects, handles short decks, and draws correctly in authority');
