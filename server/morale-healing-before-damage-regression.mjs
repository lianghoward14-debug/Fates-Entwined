import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,resolveMoralePressureCycle} from '../shared/engine/index.mjs';
const source=fs.readFileSync('src/scripts/27-morale-pressure-ui.js','utf8');
const start=source.indexOf('  function resolveLegacyMoralePressureTurnEnd(');
const code=source.slice(start,source.indexOf('  function resolveLegacyMoraleLowHandDiscard(',start));
for(const seat of [0,1]) for(const healing of ['landscape','square','both']) for(const initial of [1,100]){
 const state=createInitialState({matchId:'heal-first',seed:'heal-first',handSize:1,players:[{id:'p0',deckIds:['unit']},{id:'p1',deckIds:['unit']}],cardDefinitions:[{id:'unit',name:'Unit',type:'Supporter',aff:'reality',fate:10,cost:0}],gameSettings:{healthPressureSeals:true}});
 state.turn=4;state.landscapeId=healing==='square'?'igb2':'igb23';state.moralePressure.morale[seat]=initial;
 const own=structuredClone(state.players[seat].hand[0]);own.iid+='-board';own.fate=10;own.currentFate=10;
 const enemy=structuredClone(state.players[1-seat].hand[0]);enemy.iid+='-board';enemy.fate=110;enemy.currentFate=110;
 state.board[0][seat===0?2:0][0]=own;state.board[0][seat===0?0:2][0]=enemy;
 const square={type:'MORALE_RECOVERY_SQUARE',playerIndex:seat,z:0,r:seat===0?2:0,c:0};
 if(healing!=='landscape')state.geometry.squareStatuses=[square];
 const ctx={state,events:[],ruleEvents:[]};resolveMoralePressureCycle(ctx);
 const expected=Math.max(0,initial+(healing==='square'?0:2)+(healing==='landscape'?0:10)-33);
 assert.equal(state.moralePressure.morale[seat],expected,`engine ${seat} ${healing} ${initial}`);
 const legacy={turn:4,landscapeId:state.landscapeId,players:state.players,board:state.board,blockedCells:healing==='landscape'?[]:[{...square,type:'jaime',owner:seat}],_moralePressure:{morale:seat===0?[initial,200]:[200,initial],cycle:0}};
 let events=[];const context=vm.createContext({window:{},legacyGameState:()=>legacy,legacyRulesEnabled:()=>true,resolveLegacyMoraleSupporterExpiry:()=>[],resolveLegacyMoraleLowHandDiscard:()=>null,legacyBoardEntries:()=>[],getEffectiveFate:c=>c.fate,getZoneScore:(z,p)=>z===0?(p===seat?10:110):0,queueLegacyPresentation:e=>events=e});
 vm.runInContext(code,context);context.resolveLegacyMoralePressureTurnEnd(seat);
 assert.equal(legacy._moralePressure.morale[seat],expected,`local ${seat} ${healing} ${initial}`);
 for(const list of [ctx.events,events]){const healed=list.findIndex(e=>e.type==='MORALE_HEALED'&&e.playerIndex===seat);const damaged=list.findIndex(e=>e.type==='MORALE_DAMAGED'&&e.playerIndex===seat);assert(healed>=0&&healed<damaged,'Healing event precedes damage');if(expected===0)assert(list.some(e=>e.type==='MORALE_BROKEN'&&e.playerIndex===seat));}
}
console.log('Healing-before-damage passed: both players, landscape, recovery square, combined healing, lethal and surviving totals, online/local event order.');
