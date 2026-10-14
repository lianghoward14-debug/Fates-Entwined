import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,applyOperation} from '../../shared/engine/index.mjs';
const defs=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
for(const player of [0,1]){
 const state=createInitialState({matchId:'maja-overlay',seed:'maja',handSize:0,cardDefinitions:defs,players:[0,1].map(p=>({id:'p'+p,deckIds:['32','76']}))});
 const ctx={state,events:[],ruleEvents:[]};const support=state.players[player].deck.find(c=>c.id==='32'),immune=state.players[player].deck.find(c=>c.id==='76');
 applyOperation(ctx,{type:'TRANSFER_CARDS',targetIids:[support.iid,immune.iid],playerIndex:player,destinationPile:'hand',fateBonus:4,permanentFateGain:false,reason:'OBLIQUE_ORDER'});
 assert.equal(support.counters.majaPendingBoost,4);assert(!immune.counters.majaPendingBoost);
 applyOperation(ctx,{type:'SET_CARD',playerIndex:player,cardIid:support.iid,destination:{z:0,r:player===0?2:0,c:0}});
 assert.equal(support.counters.majaPlacementBoost,4);assert(!support.counters.majaPendingBoost);
}
const core=readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=core.indexOf('function preparePlacementFateReveal('),end=core.indexOf("if(typeof window !== 'undefined') window.preparePlacementFateReveal",start);
const runtime={Date};vm.createContext(runtime);vm.runInContext(core.slice(start,end),runtime);
let card={id:'32',fate:1,currentFate:5,_handEffectModifiers:[{key:'maja-kaminska-oblique-order',fateDelta:4}]};
runtime.preparePlacementFateReveal(card,card,'set');assert(card._placementFateReveal.majaBoost);assert.equal(card._placementFateReveal.fromValue,1);
card={id:'32',fate:1,currentFate:1};runtime.preparePlacementFateReveal(card,card,'set');assert.equal(card._placementFateReveal.majaBoost,false);
const adapter=readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const flash=adapter.indexOf("window.flashCardEffect(live || card, 'maja_tank'");
assert(flash>adapter.indexOf('function schedulePlacementFateReveal('));
assert(flash<adapter.indexOf('presentFateDelta({',flash),'overlay starts before paired number presentation in same callback');
assert(adapter.includes('majaBoost:!!meta.majaBoost'));
const rooms=readFileSync('src/scripts/18-online-rooms.js','utf8');assert(rooms.includes("pairedEffectOverlayKind:'maja_tank'"));
console.log('Maja overlay: both seats, boosted-only tracking, immunity exclusion, local reveal synchronization and authority pairing passed');
