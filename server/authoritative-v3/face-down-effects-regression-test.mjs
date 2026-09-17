import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, effectiveFate, legalCommandTemplates, reduceCommand, zoneScore} from '../../shared/engine/index.mjs';
import {projectStateForPlayer, projectStateForSpectator, projectEvents} from '../../shared/engine/projections.mjs';
import {command, takeFromHandToBoard} from './test-helpers.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
let sequence=0;
function fixture(ids=['19','20','32'], opponent=['32']){
  return createInitialState({matchId:'HIDDEN-EFFECTS',seed:'hidden-effects',handSize:99,activePlayer:0,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:ids},{id:'p1',deckIds:opponent}]});
}
function place(state,owner,id,z=0,r=2,c=0){return takeFromHandToBoard(state,owner,id,{z,r,c});}
function act(state,player,type,payload){
  const result=reduceCommand(state,command(state,`p${player}`,++sequence,type,payload),{playerIndex:player});
  assert.equal(result.ok,true,JSON.stringify(result));return result;
}
{
  const state=fixture();
  const kvetka=place(state,0,'19');kvetka.faceDown=true;kvetka.currentFate=40;
  assert.equal(effectiveFate(state,kvetka),3,'Kvetka keeps her self aura, but none of her stored Fate');
  const plain=place(state,0,'32',1);plain.faceDown=true;plain.currentFate=90;
  assert.equal(effectiveFate(state,plain),0,'a card without aura bonuses contributes zero');
  const owner=projectStateForPlayer(state,0),opponent=projectStateForPlayer(state,1);
  assert.equal(owner.board[0][2][0].id,'19');
  assert.equal(opponent.board[0][2][0].id,undefined);
  assert.equal(opponent.board[0][2][0].name,'Face-down card');
  assert.equal(opponent.zoneScores[0][0],zoneScore(state,0,0));
  assert.equal(projectStateForSpectator(state).board[0][2][0].id,undefined);
  kvetka.statuses.push('EFFECTS_SUPPRESSED');
  assert.equal(effectiveFate(state,kvetka),0,'suppression still disables hidden auras');
}
{
  let state=fixture(['20','32'],['56','32']);
  const source=place(state,0,'20');source.faceDown=true;
  const reactor=place(state,1,'56',1,0,0);reactor.faceDown=true;
  assert(legalCommandTemplates(state,0).some(c=>c.type==='ACTIVATE_EFFECT'&&c.payload.sourceIid===source.iid));
  const opened=act(state,0,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true});
  assert.equal(opened.state.board[0][2][0].faceDown,true);
  assert.equal(opened.prompt.type,'REACTION','face-down Improvisors can react');
  const view=projectStateForPlayer(opened.state,1);
  assert.equal(view.pendingPrompt.hiddenSource,true);
  assert.equal(view.pendingPrompt.sourceIid,undefined);
  assert(view.pendingPrompt.options.some(o=>o.reactionIid===reactor.iid));
  assert(!projectEvents(opened.events,1).some(e=>e.type==='EFFECT_ACTIVATED'));
  const resolved=act(opened.state,1,'ANSWER_PROMPT',{promptId:opened.prompt.promptId,choice:'NEGATE',reactionIid:reactor.iid});
  assert.equal(resolved.state.board[1][0][0].faceDown,true);
  assert.equal(resolved.state.board[1][0][0].counters.reactionUses,1);
  assert(!resolved.state.statuses.some(s=>s.statusType==='MORALE_DAMAGE_INFLICTED_ZERO'));
}
{
  let state=fixture(['20','32']);const source=place(state,0,'20');source.faceDown=true;
  const result=act(state,0,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true});
  assert(result.state.statuses.some(s=>s.statusType==='MORALE_DAMAGE_INFLICTED_ZERO'),'hidden effect applies');
  assert(!projectStateForPlayer(result.state,1).statuses.some(s=>s.statusType==='MORALE_DAMAGE_INFLICTED_ZERO'),'opponent has no effect banner');
  assert(projectStateForPlayer(result.state,0).statuses.some(s=>s.statusType==='MORALE_DAMAGE_INFLICTED_ZERO'));
}
{
  let state=fixture(['08','32'],['56','32']);const source=place(state,0,'08');source.faceDown=true;
  const reactor=place(state,1,'56',1,0,0);
  // Oblique Order needs a reality card in deck/discard before its optional opening choice is legal.
  state.players[0].discard.push(state.players[0].hand.pop());
  assert(legalCommandTemplates(state,0).some(c=>c.type==='ACTIVATE_EFFECT'&&c.payload.sourceIid===source.iid));
  const opened=act(state,0,'ACTIVATE_EFFECT',{sourceIid:source.iid,userActivated:true});
  assert.equal(opened.state.board[0][2][0].counters.whenSetResolved,true);
  assert.equal(opened.events.filter(e=>e.type==='EFFECT_ACTIVATED'&&e.sourceIid===source.iid).length,1,'hidden When Set emits only one activation');
  const negated=act(opened.state,1,'ANSWER_PROMPT',{promptId:opened.prompt.promptId,choice:'NEGATE',reactionIid:reactor.iid});
  const flipped=act(negated.state,0,'FLIP_CARD',{cardIid:source.iid});
  assert.equal(flipped.state.board[0][2][0].faceDown,false);
  assert(!flipped.events.some(e=>e.type==='EFFECT_ACTIVATED'),'flipping never repeats a consumed When Set effect');
  assert(projectEvents(flipped.events,1).some(e=>e.type==='CARD_FLIPPED'));
}
// Exercise the actual single-player scoring function independently of the authority.
const core=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
function fn(name){const start=core.indexOf('function '+name+'(');assert(start>=0);return core.slice(start,core.indexOf('\n}',start)+2);}
const kvetka={id:'19',iid:'legacy-kvetka',owner:0,type:'Coordinator',fate:5,currentFate:40,faceDown:true};
const context={G:{board:[[[kvetka]]]},window:{},cardActsAsPassive:(c,id)=>c.id===id,
  isSupporterEffectSuppressed:()=>false,isCoordinatorSuppressedAt:()=>false,
  getSuperiorMarksMultiplier:()=>1,capEffectiveFateForLandscape:x=>x,capEffectiveFateForPermanentDebuff:(c,x)=>x,
  getAdjacentCards:()=>[],forEachBoardCard:fn=>fn(kvetka,0,0,0)};
vm.createContext(context);vm.runInContext(fn('getEffectiveFate'),context);
assert.equal(context.getEffectiveFate(kvetka,0),3,'single-player self aura counts while internal Fate stays hidden');
kvetka.faceDown=false;assert.equal(context.getEffectiveFate(kvetka,0),43);
// Use the actual single-player flip function: reveal, cinematic, and no second effect.
let cinematics=0,resolutions=0,revealOverlays=0;
const flipContext={G:{},window:{},isFaceDownCard:c=>c.faceDown,renderGame:()=>{},
  playSfx:()=>{},showConsolidationCinematic:c=>{assert.equal(c.faceDown,false);cinematics++;},
  scheduleCoordinatorPlacementFlash:(card,opts)=>{assert.equal(card.faceDown,false);assert.equal(opts.reveal,true);assert(opts.delayMs>=650);revealOverlays++;},
  setTimeout:fn=>fn(),requestAnimationFrame:fn=>fn(),resolveSetCardAfterPlacement:()=>{resolutions++;}};
vm.createContext(flipContext);vm.runInContext(fn('scheduleCoordinatorRevealFlash')+'\n'+fn('flipFaceDownBoardCard'),flipContext);
const hidden={id:'19',iid:'flip',owner:0,type:'Coordinator',faceDown:true,_whenSetActivatedHidden:true};
flipContext.flipFaceDownBoardCard(hidden,0,0,0);
await hidden._flipResolutionPromise;
assert.equal(cinematics,1);assert.equal(resolutions,0);
assert.equal(revealOverlays,1,'revealing a hidden activated coordinator still schedules its overlay');
const unused={id:'08',iid:'unused',owner:0,type:'Initiator',faceDown:true};
flipContext.flipFaceDownBoardCard(unused,0,0,0);
await unused._flipResolutionPromise;
assert.equal(cinematics,2);assert.equal(resolutions,1);
console.log('Face-down effects: aura scoring, hidden activation, status privacy, reactions, and flip deduplication passed.');
