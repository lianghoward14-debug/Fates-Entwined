import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('server/authoritative-v3/server.mjs','utf8');
const start=source.indexOf('function scheduleDisconnectForfeit(');
const fn=source.slice(start,source.indexOf('\nfunction unregister(',start));
let callback,delay,concessions=0;
const actor={state:{matchId:'match',phase:'coin',revision:0,players:[{id:'p0'},{id:'p1'}]},dispatch:async()=>{concessions++;return {broadcasts:[]};}};
const ctx={shuttingDown:false,BETA_MODE:true,DISCONNECT_FORFEIT_MS:5000,MATCH_JOIN_GRACE_MS:120000,
  disconnectForfeitTimers:new Map(),disconnectForfeitKey:(a,b)=>a+':'+b,manager:{actor:()=>actor},
  matchSockets:new Map(),process:{uptime:()=>7200},setTimeout:(fn,ms)=>{callback=fn;delay=ms;return {unref(){}};},
  scheduleAuthorityTimers(){},console};
vm.createContext(ctx);vm.runInContext(fn,ctx);
ctx.scheduleDisconnectForfeit('match','p0');assert.equal(delay,120000,'new matches retain handshake grace even hours after boot');
ctx.matchSockets.set('match',new Map([['p0',new Set([{}])]]));await callback();assert.equal(concessions,0,'arrival cancels pending forfeit');
ctx.matchSockets.clear();ctx.scheduleDisconnectForfeit('match','p0');await callback();assert.equal(concessions,1,'abandoned reservations still expire');
actor.state.phase='main';actor.state.revision=4;ctx.scheduleDisconnectForfeit('match','p0');assert.equal(delay,5000,'established match disconnect policy stays intact');
ctx.disconnectForfeitTimers.clear();actor.state.outcome={winner:0};delay=null;ctx.scheduleDisconnectForfeit('match','p0');assert.equal(delay,null);
console.log('PASS: post-first-match handshake grace, successful arrival, abandoned reservation expiry, normal disconnects and completed matches.');
