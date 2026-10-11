const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/49-jose-long-game.js','utf8');
function card(iid,id='09',owner=0,extra={}){return {iid,id,owner,...extra};}
const jose=card('jose','106',0,{counters:{joseFieldTurns:3}}),ally=card('ally'),enemy=card('enemy','09',1),immune=card('immune','76'),hidden=card('hidden','09',0,{faceDown:true,contributesFate:false}),other=card('other');
const state={board:[[[jose,ally,enemy],[immune,hidden]],[[other]]]};let calls=[];
const box={window:{getFateGameState:()=>state,flashCardEffect:(card,kind,opts)=>{calls.push({iid:card.iid,kind,opts});return true;}}};vm.createContext(box);vm.runInContext(source,box);
const event={type:'CARD_COUNTER_SET',counterKey:'joseFieldTurns',value:3,cardIid:'jose'};
assert.equal(box.window.presentJoseLongGameEvent(event,'tier'),true);
assert.deepEqual(calls.map(c=>c.iid),['jose','ally']);assert.ok(calls.every(c=>c.kind==='jose_clock'&&c.opts.waitForConsolidationCinematic));assert.equal(new Set(calls.map(c=>c.opts.soundKey)).size,1);
assert.equal(box.window.presentJoseLongGameEvent(event,'tier'),false);
calls=[];const newcomer=card('new');state.board[0][1].push(newcomer);
assert.equal(box.window.presentJoseAuraArrival(newcomer,'arrival'),true);assert.deepEqual(calls.map(c=>c.iid),['new']);
for(const type of ['CARD_SET','CARD_CONSOLIDATED','CARD_MOVED']){calls=[];box.window.presentJoseLongGameEvent({type,cardIid:'new'},type);assert.deepEqual(calls.map(c=>c.iid),['new']);}
for(const change of [{faceDown:true},{contributesAuras:false},{statuses:['EFFECTS_SUPPRESSED']},{counters:{joseFieldTurns:2}}]){
 const original={...jose};Object.assign(jose,change);calls=[];assert.equal(box.window.presentJoseAuraArrival(newcomer,JSON.stringify(change)),false);assert.equal(calls.length,0);for(const key of Object.keys(jose))delete jose[key];Object.assign(jose,original);
}
calls=[];box.window.presentJoseLongGameEvent({...event,value:4},'non-tier');assert.equal(calls.length,0);
// Explicit authoritative state works without a local game snapshot.
box.window.getFateGameState=()=>null;calls=[];box.window.presentJoseLongGameEvent(event,'authoritative',null,state);assert.deepEqual(calls.map(c=>c.iid),['jose','ally','new']);
console.log('PASS Jose zone-wide clocks, entry/set/consolidation/movement, suppression, immunity, ownership, zero-tier, authoritative state and deduplication.');
