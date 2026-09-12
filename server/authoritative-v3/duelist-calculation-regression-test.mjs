import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand,resolveMoralePressureCycle} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const source=fs.readFileSync(new URL('../../src/scripts/27-morale-pressure-ui.js',import.meta.url),'utf8');
const legacy=source.slice(source.indexOf('  function resolveLegacyMoralePressureTurnEnd('),source.indexOf('  function resolveLegacyMoraleLowHandDiscard('));
const display=source.slice(source.indexOf('  function showMoraleCycleResolution('),source.indexOf('  function ',source.indexOf('  function showMoraleCycleResolution(')+12));
for(const seat of [0,1]) for(const reworks of [false,true]) for(const removed of [false,true]){
  let state=createInitialState({matchId:'duelist',seed:'duelist',players:[{id:'p0',deckIds:['64']},{id:'p1',deckIds:['64']}],cardDefinitions:[{id:'64',name:'Cook Islands Duelist',type:'Supporter',aff:'eventide',fate:5,cost:0}],handSize:1,activePlayer:seat,gameSettings:{healthPressureSeals:true,pressureCardReworks:reworks,zoneControlRework:true}});
  const result=reduceCommand(state,command(state,'p'+seat,1,'SET_CARD',{cardIid:state.players[seat].hand[0].iid,destination:{z:0,r:seat===0?2:0,c:0}}),{playerId:'p'+seat});
  assert.equal(result.ok,true);
  state=result.state;
  if(removed){
    const row=seat===0?2:0;
    const duelist=state.board[0][row][0];
    state.players[seat].discard.push(duelist);
    state.board[0][row][0]={...duelist,id:'vanilla',iid:'replacement',counters:{}};
  }
  state.turn=4;
  const ctx={state,events:[],ruleEvents:[]};
  resolveMoralePressureCycle(ctx);
  const event=ctx.events.find(e=>e.type==='MORALE_CYCLE_RESOLVED');
  assert.equal(event.damage[1-seat],2);
  assert.equal(event.zoneResults[0].damage,2);
  assert.equal(state.moralePressure.morale[1-seat],198);
  state.turn=6;
  ctx.events=[];
  resolveMoralePressureCycle(ctx);
  assert.equal(ctx.events.find(e=>e.type==='MORALE_CYCLE_RESOLVED').damage[1-seat],1,'double is consumed once');

  const card={id:'64',owner:seat};
  const local={turn:4,_moralePressure:{morale:[200,200],cycle:0}};
  const gameplay=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
  const ai=fs.readFileSync(new URL('../../src/scripts/07-ai.js',import.meta.url),'utf8');
  const armSource=seat===0?gameplay:ai;
  const arm=armSource.slice(armSource.indexOf('      inst._doubleNextMoraleDamage = true;'),armSource.indexOf('      inst._doubleNextMoraleDamage = true;')+500);
  vm.runInNewContext(arm.slice(0,arm.indexOf('      }')+7),{G:local,inst:card});
  assert.equal(local._moralePressure.pendingBladeDance[seat],1);
  let events;
  let modal;
  const sandbox=vm.createContext({window:{FATE_PRESSURE_CARD_REWORKS_ENABLED:reworks},legacyGameState:()=>local,legacyRulesEnabled:()=>true,resolveLegacyMoraleSupporterExpiry:()=>[],resolveLegacyMoraleLowHandDiscard:()=>null,legacyBoardEntries:()=>removed?[]:[{card,z:0}],legacyFaceDown:()=>false,legacySuppressed:()=>false,getZoneScore:(z,p)=>z===0&&p===seat?5:0,queueLegacyPresentation:value=>{events=value;},document:{createElement:()=>modal={},body:{appendChild:()=>{}}},setTimeout:()=>{}});
  vm.runInContext(legacy+display,sandbox);
  sandbox.resolveLegacyMoralePressureTurnEnd(seat);
  const localEvent=events.find(e=>e.type==='MORALE_CYCLE_RESOLVED');
  assert.equal(localEvent.damage[1-seat],2);
  assert.equal(localEvent.zoneResults[0].damage,2);
  assert.equal(local._moralePressure.morale[1-seat],198);
  local.turn=6;
  sandbox.resolveLegacyMoralePressureTurnEnd(seat);
  assert.equal(events.find(e=>e.type==='MORALE_CYCLE_RESOLVED').damage[1-seat],1,'local double consumed once after departure');
  for(const payload of [event,localEvent]){
    sandbox.showMoraleCycleResolution(payload);
    assert.match(modal.innerHTML,/controls · 2 Morale damage/,'calculation displays the doubled result');
  }
}
console.log('Duelist: both seats and rework settings double actual and displayed damage in authoritative and legacy games; consumed once.');
