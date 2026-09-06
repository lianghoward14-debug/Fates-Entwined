import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name=>fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const server = read('./server.mjs');
const client = read('../../src/scripts/authoritative-v3-phase7-beta-client.mjs');
const gameplay = read('../../src/scripts/05-gameplay-core.js');
const extract = (source, start, end)=>source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const timers = new Map();
let now = 100000;
const serverContext = vm.createContext({turnTimers:timers, Date:{now:()=>now}});
vm.runInContext(extract(server, 'function turnClockMessage(', 'function scheduleAuthorityTimers('), serverContext);
const actor = {state:{matchId:'clock1', turn:1, activePlayer:0, revision:1, phase:'main', turnTimerSeconds:180},
  turnTimeoutCommand:()=>({timeoutMs:180000})};
timers.set('clock1', {signature:'clock1:1:0', remainingMs:180000, deadlineAt:280000, suspended:false});
const sample = ()=>JSON.parse(JSON.stringify(serverContext.turnClockMessage(actor)));
assert.equal(sample().remainingMs, 180000);
now += 5000;
assert.equal(sample().remainingMs, 175000);

function browser(){
  let mono = 0;
  const context = vm.createContext({turnClock:null, credential:{matchId:'clock1'}, performance:{now:()=>mono}});
  vm.runInContext(client.match(/^const monotonicNow = .*;$/m)[0], context);
  vm.runInContext(extract(client, 'function readTurnClock(', '\nasync function connect('), context);
  return {context, advance:ms=>{mono+=ms;}, receive:message=>context.applyServerMessage(message),
    value:()=>context.readTurnClock('clock1',1,0)};
}
const a = browser(), b = browser();
const initial = sample();
a.receive(initial); b.receive(initial);
a.advance(12000); b.advance(12000); // no interval ticks required in a background tab
assert.equal(a.value().remaining, 163);
assert.equal(b.value().remaining, 163);
const entry = timers.get('clock1');
entry.remainingMs = 163000; entry.suspended = true;
actor.state.pendingPrompt = {promptId:'reaction'};
actor.state.revision++;
const paused = sample();
a.receive(paused); b.receive(paused);
a.advance(9000); b.advance(9000);
assert.equal(a.value().remaining, 163);
assert.equal(b.value().remaining, 163);
assert.equal(a.value().paused, true);
actor.state.pendingPrompt = null;
actor.state.revision++;
entry.suspended = false; entry.deadlineAt = now + 163000;
const resumed = sample();
a.receive(resumed); b.receive(resumed);
a.receive(paused); // delayed older revisions cannot re-pause the timer
a.advance(4000); b.advance(4000);
assert.equal(a.value().remaining, 159);
assert.equal(b.value().remaining, 159);
const reconnect = browser();
now += 4000;
reconnect.receive(sample());
assert.equal(reconnect.value().remaining, 159);
assert.equal(a.context.readTurnClock('different-match',1,0), null);
assert.equal(a.context.readTurnClock('clock1',2,1), null);
a.advance(200000);
assert.equal(a.value().remaining, 0);

// Exercise the actual interval callback: no local modal pause or expiry path.
let tick;
const g = {_phase7CurrentMultiplayer:true};
const ui = vm.createContext({G:g, window:{}, _turnTimerRemaining:0, _lastTurnWarnSecond:null,
  stopTurnTimer(){}, getTurnTimeLimit:()=>180, repairStaleOnlineTurnStartedAt(){},
  getOnlineSyncedTurnRemaining:()=>159, updateTurnTimerPauseState:()=>true,
  turnTimerPauseNow:()=>0, updateTimerDisplay(){},
  getAuthoritativeTurnClock:()=>({remaining:0,paused:false}),
  setInterval:fn=>{tick=fn;return 1;}, endTurn:()=>{throw new Error('client must not expire an authoritative turn');}
});
vm.runInContext(extract(gameplay, 'function startTurnTimer() {', '\nfunction stopTurnTimer()'), ui);
ui.startTurnTimer(); tick();
assert.equal(ui._turnTimerRemaining, 0, 'local modal pauses cannot override the shared clock');
console.log('Phase 7 turn clock: PASS (shared time, pause/resume, reconnect, delayed ticks, stale messages, server-only expiry)');
