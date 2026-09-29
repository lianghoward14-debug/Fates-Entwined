import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState, reduceCommand, legalCommandTemplates, projectStateForPlayer} from '../../shared/engine/index.mjs';
import {SUPPORT_COMPANY_IDS, SUPPORT_COMPANY_NAMES, supportCompanyCardEligible, supportCompanyAvailability} from '../../shared/support-company.mjs';
const require=createRequire(import.meta.url);
const cards=require('../fate-card-catalog.js').getCardCatalog().cards;
const ui=fs.readFileSync(new URL('../../src/scripts/support-company.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const online=fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js',import.meta.url),'utf8');
function assignment(startText,endText){const start=online.indexOf(startText);assert(start>=0);const end=online.indexOf(endText,start);assert(end>=0);return online.slice(start,end+endText.length);}
const pickerWrapper=assignment('window.pickCardsVisual = function(cards, opts, onConfirm){','\n      };');
const bridge=assignment('window.fatePhase7UseSupportCompany = function(ability, cardId){','\n  };');
let serial=0;
for(const mode of ['singleplayer','multiplayer']) for(const player of [0,1]) for(const id of SUPPORT_COMPANY_IDS){
 let state=createInitialState({matchId:'support-picker',seed:'support-picker',activePlayer:player,handSize:2,
  gameSettings:{healthPressureSeals:true},cardDefinitions:cards,
  players:[{id:'p0',deckIds:['05','05','05','05']},{id:'p1',deckIds:['05','05','05','05']}]});
 state.supportCompanyPool=[...SUPPORT_COMPANY_IDS];
 let picker,submissions=0;
 const game={turn:state.turn,currentPlayer:player,_onlineRoomCode:state.matchId,_onlinePlayerIndex:player};
 const sandbox={G:game,CARDS:cards,SUPPORT_COMPANY_NAMES,supportCompanyCardEligible,supportCompanyAvailability,
  isPerspectivePlayer:p=>p===player,gameState:()=>game,isOnlineMatchState:()=>true,isRemoteOpponentReplay:()=>false,
  phase7CurrentUiActive:()=>true,phase7CurrentCommands:()=>legalCommandTemplates(state,player),
  closeModal:()=>{},playSupportCompanyAnimation:async()=>{},
  canSendLocalAction:()=>{throw Error('Non-authoritative action was blocked');},
  sendOptimisticAction:()=>{throw Error('Support Company entered legacy transport');},
  originals:{pickCardsVisual:(choices,opts,confirm)=>{picker={choices,opts,confirm};}},
  fatePhase7SupportCompany:()=>({state:projectStateForPlayer(state,player),commands:legalCommandTemplates(state,player)}),
  phase7SubmitCommand:async template=>{
   const result=reduceCommand(state,{...template,commandId:'support-picker-'+(++serial),matchId:state.matchId,expectedRevision:state.revision},{playerIndex:player});
   assert(result.ok,JSON.stringify(result.rejection));state=result.state;submissions++;return true;
  }};
 if(mode==='singleplayer'){
  delete sandbox.fatePhase7SupportCompany;
  sandbox.FateAuthorityV3SinglePlayer={currentScreen:()=>({view:{state:projectStateForPlayer(state,player),legalCommands:legalCommandTemplates(state,player)},submit:sandbox.phase7SubmitCommand})};
 }
 sandbox.window=sandbox;
 vm.createContext(sandbox);vm.runInContext(ui+'\n'+pickerWrapper+'\n'+bridge,sandbox);
 for(const ability of ['call','desperate']){
  sandbox.openSupportCompany(ability,player);
  assert(picker,ability+' opens the picker');
  assert.equal(picker.opts.allowCancel,true);
  assert.equal(picker.opts.minCount,1);
  await picker.confirm([]);assert.equal(submissions,ability==='call'?0:1);
  sandbox.openSupportCompany(ability,player);
  const choice=picker.choices.find(card=>card.id===id);assert(choice);
  await picker.confirm([choice]);
  assert.equal(state.players[player].hand.at(-1).id,id);
 }
 assert.equal(submissions,2);assert.equal(state.supportCompanyUses[player],2);
 assert.equal(state.moralePressure.morale[player],100);
 assert.equal(game._onlinePendingPickCardsVisual,undefined,'no retired picker state is created');
 await picker.confirm([picker.choices[0]]);
 assert.equal(submissions,2,'a stale confirmation cannot spend again');
}
console.log('Support Company multiplayer picker passed: real legacy wrapper and authority bridge, every card, both seats, free/paid use, and stale confirmations.');

// Exercise the actual picker footer: cancel is independent of required selection.
const renderer=fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const start=renderer.indexOf("  const ok=document.createElement('button');",renderer.indexOf('function pickCardsVisual('));
const end=renderer.indexOf("  modalRoot.classList.add('on');",start);
assert(start>0&&end>start);
for(const selected of [[],[0]]){
 const buttons=[];let confirmed=0,closed=0;
 const sandbox={document:{createElement:()=>({style:{}}),getElementById:()=>({appendChild:b=>buttons.push(b)})},
  opts:{allowCancel:true},minCount:1,selected,cards:[{id:'test'}],modalRoot:{},
  closeModal:()=>{closed++;},onConfirm:()=>{confirmed++;},toast:()=>{}};
 vm.createContext(sandbox);vm.runInContext(renderer.slice(start,end),sandbox);
 assert.equal(buttons.length,2);assert.equal(buttons[0].textContent,'Cancel');
 buttons[0].onclick();assert.equal(closed,1);assert.equal(confirmed,0);
 buttons[1].onclick();assert.equal(confirmed,selected.length);
}
console.log('Support Company single-player/multiplayer and picker cancel/explicit-confirm checks passed.');
