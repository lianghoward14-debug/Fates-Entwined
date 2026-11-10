import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {WARFRONT_MATCH_LIMIT,WARFRONT_TOTAL_MATCHES,warfrontPlayed} from './authoritative-v3/warfront-lifecycle.mjs';

assert.equal(WARFRONT_MATCH_LIMIT,3);
assert.equal(WARFRONT_TOTAL_MATCHES,15);
const source=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
const zones=Array.from({length:5},(_,i)=>({matches:Array.from({length:3},(_,j)=>({winnerTeam:(i+j)%2?'b':'a',starValue:1}))}));
const context={LIMIT:3,state:{zones},achievements:()=>[
  {leader:{team:'a'}},{leader:{team:'b'}},{leader:{team:'a'}}
]};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function score('),source.indexOf('function telemetry('))+
  source.slice(source.indexOf('function totals('),source.indexOf('function participation(')),context);
const totals=context.totals();
assert.equal(totals.match.a+totals.match.b,5,'five won fronts award five battle stars');
assert.equal(totals.award.a+totals.award.b,3,'three commendations award one star each');
assert.equal(totals.a+totals.b,8,'five front stars plus three commendation stars');
for(const zone of zones)assert.equal(warfrontPlayed(zone),3);
console.log('Warfront three-match limits and client star totals passed');
