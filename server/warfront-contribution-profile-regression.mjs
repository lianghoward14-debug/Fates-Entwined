import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {warfrontAiDeck} from './authoritative-v3/warfront-simulation.mjs';
import {warfrontAiProfile} from './authoritative-v3/warfront-ai-profile.mjs';
const require=createRequire(import.meta.url);
const {getDeckCatalog,extractArrayLiteral}=require('./fate-deck-catalog.js');
const source=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
const match=(id,uid,starValue=1)=>({id,winnerTeam:'a',starValue,participants:{a:{uid}}});
const state={zones:[{matches:[match('one','foot')]},{matches:[match('two','foot'),match('other','other',5),{...match('void','foot',5),voidedByForfeit:true}]}]};
const ctx={state};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function commanderContribution('),source.indexOf('function miniSeat(')),ctx);
assert.equal(ctx.commanderContribution(state.zones[1],'a','foot').stars,2);
assert.equal(ctx.commanderContribution(state.zones[1],'a','foot').victories,2);
state.zones=[{matches:[]}];assert.equal(ctx.commanderContribution(state.zones[0],'a','foot').stars,0);
const setup=fs.readFileSync('src/scripts/04-game-setup.js','utf8');
const profiles=vm.runInNewContext('('+extractArrayLiteral(setup,'AI_OPPONENTS')+')');
const decks=getDeckCatalog().decks;assert.equal(decks.length,16);
for(const p of profiles){
 const profile=warfrontAiProfile(p);assert.equal(profile.style,p.style);
 const expected=decks.find(d=>d.id===p.deckRef)||decks[[...p.name].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%decks.length];
 assert.deepEqual(warfrontAiDeck(p),[...expected.ids]);
}
const reached=new Set();for(let i=0;i<1000;i++)reached.add(warfrontAiDeck({name:'commander-'+i}).join(','));assert.equal(reached.size,16);
console.log('Campaign contributions and all 16 shared AI decks/profile parity passed');

import {warfrontDueMatch} from './authoritative-v3/warfront-lifecycle.mjs';
const now=10000;
const event={status:'active',aiScheduleVersion:2,endsAt:now+86400000,zones:[{a:{isAI:true},b:{isAI:true},matches:[],aiRetryAt:now+60000},{a:{isAI:true},b:{isAI:true},matches:[]}]};
assert.equal(warfrontDueMatch(event,now).zone,event.zones[1]);
assert.equal(event.zones[1].aiSchedule.length,5);
console.log('Missing AI schedules recover and retrying zones do not block other fronts');

const {warfrontAiCommand}=await import('./authoritative-v3/warfront-ai-profile.mjs');
assert.equal(warfrontAiCommand({type:'ACTIVATE_EFFECT',manualOnly:true,payload:{iid:'manual'}}).payload.userActivated,true);
const ordinary={type:'END_TURN',payload:{}};assert.equal(warfrontAiCommand(ordinary),ordinary);
import {createInitialState,legalCommandTemplates,reduceCommand} from '../shared/engine/index.mjs';
let activationState=createInitialState({matchId:'warfront-manual',seed:'manual',handSize:1,cardDefinitions:[{id:'20',name:'Spearman',type:'Supporter',aff:'eventide',fate:1,cost:0}],players:[{id:'p0',deckIds:['20']},{id:'p1',deckIds:[]}]});
const apply=(s,c)=>reduceCommand(s,{type:c.type,payload:c.payload,matchId:s.matchId,expectedRevision:s.revision,commandId:'test:'+s.revision},{playerId:'p0'});
let activationResult=apply(activationState,{type:'SET_CARD',payload:{cardIid:activationState.players[0].hand[0].iid,destination:{z:0,r:2,c:0}}});assert.equal(activationResult.ok,true);
activationState=activationResult.state;
const manual=legalCommandTemplates(activationState,0).find(c=>c.type==='ACTIVATE_EFFECT'&&c.manualOnly);
assert(manual);assert.equal(apply(activationState,manual).rejection.code,'MANUAL_ACTIVATION_REQUIRED');
assert.equal(apply(activationState,warfrontAiCommand(manual)).ok,true);
console.log('Warfront manual AI activations accepted by real engine');
