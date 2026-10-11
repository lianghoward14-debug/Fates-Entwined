import assert from 'node:assert/strict';
import {createInitialState,modifyMorale,reduceCommand,isImmuneToOpponentEffects} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';
const defs=[{id:'101',name:'Jorge',type:'Dauntless',fate:4,cost:4},{id:'103',name:'Santiago',type:'Initiator',fate:2,cost:2},{id:'05',name:'Soldier',type:'Supporter',fate:1,cost:0,rarity:'circle'}];
const state=createInitialState({matchId:'new-effects',seed:'new-effects',handSize:9,players:[{id:'p0',deckIds:['101','103','05','05','05']},{id:'p1',deckIds:[]}],cardDefinitions:defs,gameSettings:{healthPressureSeals:true}});
function place(id,z,r,c,fate){const i=state.players[0].hand.findIndex(x=>x.id===id),card=state.players[0].hand.splice(i,1)[0];if(fate!==undefined)card.currentFate=fate;state.board[z][r][c]=card;return card;}
const jorge=place('101',0,2,0);const paid=place('05',1,2,0,7);const a=place('05',0,2,1),b=place('05',0,2,2);assert(!isImmuneToOpponentEffects(a,state));
modifyMorale({state,events:[],ruleEvents:[]},{playerIndex:0,amount:9,sourceIid:a.iid});assert.equal(jorge.currentFate,7);assert.equal(state.moralePressure.morale[0],209);
modifyMorale({state,events:[],ruleEvents:[]},{playerIndex:0,amount:12,sourceIid:paid.iid});assert.equal(jorge.currentFate,7,'other-zone healing must not convert');
modifyMorale({state,events:[],ruleEvents:[]},{playerIndex:0,amount:12});assert.equal(jorge.currentFate,7,'unattributed healing must not convert');
const s=state.players[0].hand[0];const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{cardIid:s.iid,tributeIids:[a.iid,b.iid],destination:{z:0,r:2,c:1}}),{playerId:'p0'});
assert.equal(result.ok,true,JSON.stringify(result));assert(result.state.players[0].discard.some(c=>c.iid===paid.iid));assert(result.state.players[0].discard.some(c=>c.iid===jorge.iid));assert.equal(result.state.pendingPrompt?.type,'MODAL_CHOICE');assert.equal(result.state.pendingPrompt?.title,'Call to Arms');
console.log('Jorge healing/overheal and removal of immunity; Santiago all 7+ Fate discard and shared Call to Arms passed');
