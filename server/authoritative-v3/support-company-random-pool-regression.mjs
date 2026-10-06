import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState, legalCommandTemplates, reduceCommand, canonicalHash} from '../../shared/engine/index.mjs';
import {supportCompanyPool} from '../../shared/engine/support-company.mjs';
import {supportCompanyCardEligible} from '../../shared/support-company.mjs';
const require=createRequire(import.meta.url);
const cards=require('../fate-card-catalog.js').getCardCatalog().cards;
const initial=seed=>createInitialState({matchId:`pool-${seed}`,seed,handSize:0,cardDefinitions:cards,
  gameSettings:{healthPressureSeals:true},players:[{id:'a',deckIds:[]},{id:'b',deckIds:[]}]});
const samples=new Set();
const retired=['101','102','103'];
for(const id of retired){
  const card=cards.find(c=>String(c.id)===id);
  assert(card,`${id} stays defined for compatibility`);
  assert.equal(supportCompanyCardEligible({...card,retired:false,temporarilyDisabled:false}),false,`${id} excluded by identity even without flags`);
}
// Old saved pools must not expose retired choices or accept stale commands.
for(const ability of ['call','desperate']){
  const state=initial(`retired-${ability}`);
  state.supportCompanyPool.push(...retired);
  state.supportCompanyUses[0]=ability==='call'?0:1;
  const before=canonicalHash(state);
  const commands=legalCommandTemplates(state,0).filter(c=>c.type==='SUPPORT_COMPANY');
  assert(commands.length>0);
  assert(commands.every(c=>!retired.includes(c.payload.cardId)));
  for(const id of retired){
    const result=reduceCommand(state,{matchId:state.matchId,expectedRevision:state.revision,commandId:`retired-${ability}-${id}`,type:'SUPPORT_COMPANY',payload:{ability,cardId:id}},{playerIndex:0});
    assert.equal(result.ok,false,`${ability} rejects retired ${id}`);
    assert.equal(canonicalHash(state),before,'rejection cannot spend morale or the ability');
  }
}
for(let i=0;i<30;i++){
  const state=initial(String(i)), pool=state.supportCompanyPool;
  assert.equal(pool.length,15);assert.equal(new Set(pool).size,15);
  assert(pool.every(id=>!retired.includes(id)));
  const choices=pool.map(id=>cards.find(c=>String(c.id)===id));
  assert.equal(choices.filter(c=>c.type==='Supporter').length,10);
  assert.equal(choices.filter(c=>c.type!=='Supporter').length,5);
  assert(choices.every(supportCompanyCardEligible));
  assert.deepEqual(initial(String(i)).supportCompanyPool,pool);
  assert.deepEqual(supportCompanyPool(JSON.parse(JSON.stringify(state))),pool);
  const hash=canonicalHash(state);
  const commands=legalCommandTemplates(state,0).filter(c=>c.type==='SUPPORT_COMPANY');
  assert.equal(commands.length,15);assert.equal(canonicalHash(state),hash);
  const outside=cards.find(c=>supportCompanyCardEligible(c)&&!pool.includes(String(c.id)));
  const packet={matchId:state.matchId,expectedRevision:0,commandId:'outside',type:'SUPPORT_COMPANY',payload:{ability:'call',cardId:String(outside.id)}};
  assert.equal(reduceCommand(state,packet,{playerIndex:0}).ok,false);
  assert.equal(canonicalHash(state),hash);
  const used=reduceCommand(state,{...packet,commandId:'inside',payload:commands[0].payload},{playerIndex:0});
  assert(used.ok);assert.deepEqual(used.state.supportCompanyPool,pool);
  assert.deepEqual(used.state.supportCompanyUses,[1,0]);
  assert.equal(legalCommandTemplates(used.state,0).filter(c=>c.type==='SUPPORT_COMPANY').length,15);
  const old=JSON.parse(JSON.stringify(state));delete old.supportCompanyPool;
  assert.deepEqual(supportCompanyPool(old),pool);
  samples.add(pool.join(','));
}
assert(samples.size>1,'different games produce different pools');
console.log('Support Company random pool passed: 10/5 split, uniqueness, eligibility, deterministic replay, new games, snapshots, command validation, and stable paid pool.');
