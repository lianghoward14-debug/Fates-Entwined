import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand,legalCommandTemplates,assertInvariants,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {DRAW_EFFECT_CARD_IDS} from '../../shared/engine/cards/draw-effects.mjs';
import {command} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards.filter(c=>!c.retired&&!c.temporarilyDisabled);
assert.equal(definitions.find(c=>c.id==='bh10').cost,3);
assert(!DRAW_EFFECT_CARD_IDS.includes('bh10'));
for(const owner of [0,1]){
 const row=owner===0?2:0;
 let state=createInitialState({matchId:'CHAUFFEUR'+owner,seed:'catalog',handSize:99,activePlayer:owner,cardDefinitions:definitions,gameSettings:{pressureCardReworks:true},players:[{id:'p0',deckIds:['bh10','32']},{id:'p1',deckIds:['bh10','32']}]});
 const player=state.players[owner];
 const source=player.hand.splice(player.hand.findIndex(c=>c.id==='bh10'),1)[0];
 source.faceDown=true;state.board[0][row][0]=source;
 const hand=player.hand.map(c=>c.iid),deck=player.deck.map(c=>c.iid);
 let result=reduceCommand(state,command(state,'p'+owner,1,'FLIP_CARD',{cardIid:source.iid}),{playerId:'p'+owner});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));
 assert.equal(result.prompt.type,'CARD_SELECTION');
 assert(result.prompt.eligibleCards.length>40,'full Supporter catalog');
 assert(result.prompt.eligibleIids.includes('60'),'card absent from deck is selectable');
 assert(!result.prompt.eligibleIids.includes('bh10'),'characters excluded');
 const bad=reduceCommand(result.state,command(result.state,'p'+owner,2,'ANSWER_PROMPT',{promptId:result.prompt.promptId,selectedIid:'bh10'}),{playerId:'p'+owner});
 assert.equal(bad.ok,false);
 result=reduceCommand(result.state,command(result.state,'p'+owner,3,'ANSWER_PROMPT',{promptId:result.prompt.promptId,selectedIid:'09'}),{playerId:'p'+owner});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));
 state=result.state;
 assert.deepEqual(state.players[owner].deck.map(c=>c.iid),deck);
 assert.deepEqual(state.players[owner].hand.slice(0,-1).map(c=>c.iid),hand);
 assert.equal(state.players[owner].discard.length,0);
 assert(!result.events.some(e=>['DECK_SEARCHED','CARD_DRAWN','CARD_DISCARDED','DRAW_EFFECT_ACTIVATED'].includes(e.type)));
 const created=state.players[owner].hand.at(-1);
 assert.equal(created.id,'09');assert.equal(created.counters.chauffeurFreeSet,true);
 assert.equal(projectStateForPlayer(state,owner).players?.[owner]?.hand?.length ?? state.players[owner].hand.length,hand.length+1);
 state.supportersSetThisTurn[owner]=2;state.supportersSetForCapThisTurn[owner]=2;
 const choices=legalCommandTemplates(state,owner);
 assert(choices.some(c=>c.type==='SET_CARD'&&c.payload.cardIid===created.iid),'exempt card remains legal after ordinary card in hand');
 const capped=structuredClone(state);capped.supportersSetForCapThisTurn[owner]=5;
 assert(!legalCommandTemplates(capped,owner).some(c=>c.type==='SET_CARD'&&c.payload.cardIid===created.iid));
 const denied=reduceCommand(capped,command(capped,'p'+owner,4,'SET_CARD',{cardIid:created.iid,destination:{z:1,r:row,c:0}}),{playerId:'p'+owner});
 assert.equal(denied.ok,false);assert.equal(denied.rejection.code,'SUPPORTER_HARD_CAP_REACHED');
 result=reduceCommand(state,command(state,'p'+owner,5,'SET_CARD',{cardIid:created.iid,destination:{z:1,r:row,c:0}}),{playerId:'p'+owner});
 assert.equal(result.ok,true,JSON.stringify(result.rejection));
 assert.equal(result.state.supportersSetThisTurn[owner],2);
 assert.equal(result.state.supportersSetForCapThisTurn[owner],3);
 assert(!result.state.board[1][row][0].counters.chauffeurFreeSet);
 assertInvariants(result.state);
}
const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const fn=core.slice(core.indexOf('async function resolveChauffeurCatalog('),core.indexOf('async function resolveSmartInvestments('));
for(const ai of [false,true]){
 const game={aiEnabled:ai,aiPlayer:0,players:[{hand:[],deck:['untouched'],discard:[]}]};
 let arrivals=[];
 const sandbox=vm.createContext({G:game,CARDS:definitions,createCardInstance:(c,owner)=>({...c,owner,iid:1}),addCardToHand:(p,c,o)=>{game.players[p].hand.push(c);arrivals.push(o.arrivalKind);return true;},renderEffectResolutionForPlayer:()=>{},pickCardsVisual:(cards,options,done)=>{assert(cards.every(c=>c.type==='Supporter'));done([cards.find(c=>c.id==='09')]);}});
 vm.runInContext(fn,sandbox);await sandbox.resolveChauffeurCatalog({id:'bh10'},0);
 assert.equal(game.players[0].hand.length,1);assert.equal(game.players[0].hand[0].counters.chauffeurFreeSet,true);
 assert.deepEqual(game.players[0].deck,['untouched']);assert.equal(game.players[0].discard.length,0);assert.deepEqual(arrivals,['chauffeur-catalog']);
}
console.log('Chauffeur catalog, no-search/no-redraw, both seats, AI, one-use exemption and hard-cap regression checks passed.');

const rendering=fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const playHelpers=rendering.slice(rendering.indexOf('function canPlayCard('),rendering.indexOf('function renderZoneScores('));
for(const cap of [2,5]){
 const game={phase:'main',supportsPlacedThisTurn:2,maxSupportsPerTurn:2,extraSupportsThisTurn:0};
 const sandbox=vm.createContext({G:game,SUPPORTER_HARD_TURN_CAP:5,isStructurallySupporterCard:()=>true,isSupporterHardCapReached:()=>cap>=5});
 vm.runInContext(playHelpers,sandbox);
 const card={id:'09',type:'Supporter',owner:0,counters:{chauffeurFreeSet:true}};
 assert.equal(sandbox.canPlayCard(card),cap<5,'hand playability respects both limits');
 assert.equal(sandbox.isSupporterLimitReachedForCard(card),cap>=5);
}
assert(!core.includes('resolveChauffeurRedraw'));
assert(!core.includes('CHAUFFEUR_REDRAW'));
const registry=fs.readFileSync(new URL('../../shared/engine/cards/registry.mjs',import.meta.url),'utf8');
assert(!registry.includes('REDRAW_HAND'));
const artHelper=rendering.slice(rendering.indexOf('function getRuntimeCardImageSrc('),rendering.indexOf('function getFullCardImageFallbackSrc('));
const art=vm.createContext({isElectronCardImageRuntime:()=>false});vm.runInContext(artHelper,art);
assert.equal(art.getRuntimeCardImageSrc('bh10.png?v=20260911-catalog','thumb'),'bh10.png?v=20260911-catalog');
console.log('Chauffeur hand UI, stale-effect removal, and updated-art routing passed.');

const structural=fs.readFileSync(new URL('../../src/scripts/00-structural-helpers.js',import.meta.url),'utf8');
const modifierStart=structural.indexOf('function getHandCardEffectModifiers(card)');
const modifierEnd=structural.indexOf('\nfunction ',modifierStart+20);
const modifiers=vm.createContext({getCaliforniqueHandTurnsRemaining:()=>null,isCardEffectImmutable:card=>card.id==='76'});
vm.runInContext(structural.slice(modifierStart,modifierEnd),modifiers);
const markerSource=rendering.slice(rendering.indexOf('function buildHandEffectMarkerHTML('),rendering.indexOf('\nfunction ',rendering.indexOf('function buildHandEffectMarkerHTML(')+20));
const marker=vm.createContext({getHandCardEffectModifiers:modifiers.getHandCardEffectModifiers,escapePlacementAnimHtml:value=>String(value)});
vm.runInContext(markerSource,marker);
for(const id of ['09','76']) for(const owner of [0,1]){
 const card={id,owner,fate:1,currentFate:1,counters:{chauffeurFreeSet:true}};
 const rows=modifiers.getHandCardEffectModifiers(JSON.parse(JSON.stringify(card)));
 assert.equal(rows.filter(row=>row.key==='chauffeur-free-set').length,1);
 assert.match(rows[0].text,/Francisek/);
 assert.match(rows[0].text,/2-Supporter/);assert.match(rows[0].text,/5-Supporter/);
 const html=marker.buildHandEffectMarkerHTML(card);
 assert.match(html,/hand-effect-marker-icon/);assert.match(html,/Chauffeur/);
 card.handEffectModifiers=rows;
 assert.equal(modifiers.getHandCardEffectModifiers(card).filter(row=>row.key==='chauffeur-free-set').length,1,'no duplicate icon row');
 delete card.counters.chauffeurFreeSet;
 assert.equal(modifiers.getHandCardEffectModifiers(card).filter(row=>row.key==='chauffeur-free-set').length,0,'consumed benefit removes cached marker');
 assert.equal(marker.buildHandEffectMarkerHTML(card),'');
}
console.log('Chauffeur information marker: both owners, immune cards, reconnect data, deduplication and removal passed.');
