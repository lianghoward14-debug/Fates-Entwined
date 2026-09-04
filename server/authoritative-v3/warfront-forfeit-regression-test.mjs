import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {testState,command,takeFromHandToBoard} from './test-helpers.mjs';
import {reduceCommand,legalCommandTemplates,projectStateForPlayer} from '../../shared/engine/index.mjs';
import {createWarfrontTakeoverDriver} from './warfront-takeover.mjs';

function concede(state,seat){
  const result=reduceCommand(state,command(state,state.players[seat].id,state.revision,'CONCEDE'),{playerIndex:seat});
  assert.equal(result.ok,true,JSON.stringify(result.rejection));return result.state;
}
let initial=testState({matchId:'takeover-'+'x'.repeat(130)});
initial.warfrontMatch=true;
const locked=concede(initial,0);
assert.equal(locked.warfrontForfeit.winner,1);
assert.equal(locked.outcome,null);
const left=concede(locked,1);
assert.equal(left.outcome.winner,1,'leaving continuation retains the original win');
assert.equal(left.outcome.commendationsEligible,false);
assert.equal(left.phase,'ended');
assert.equal(concede(locked,0).warfrontForfeit.winner,1,'repeat original forfeit cannot flip result');

const actor={state:locked,
  snapshotForPlayer(seat){return {state:projectStateForPlayer(this.state,seat),legalCommands:legalCommandTemplates(this.state,seat)};},
  async dispatch(id,cmd){const r=reduceCommand(this.state,cmd,{playerId:id});if(r.ok)this.state=r.state;return {response:r.ok?{kind:'accepted'}:{kind:'rejected',rejection:r.rejection},broadcasts:[]};}
};
const step=createWarfrontTakeoverDriver();
for(let n=0;n<100 && actor.state.activePlayer===0&&!actor.state.outcome;n++) assert(await step(actor),'AI must produce a command');
assert(actor.state.activePlayer===1 || actor.state.outcome,'takeover AI must end its turn');

// Force a natural board result in which the AI side wins. Competitive winner
// remains the human, and completing the continuation permits commendations.
let final=testState({player0:['30'],player1:['27'],activePlayer:1});
final.warfrontMatch=true;final=concede(final,0);
takeFromHandToBoard(final,0,'30',{z:0,r:0,c:0});
final.maxTurns=final.turn;
const finish=reduceCommand(final,command(final,'p1',99,'END_TURN'),{playerId:'p1'});
assert.equal(finish.ok,true,JSON.stringify(finish.rejection));
assert(finish.state.outcome,'fixture must finish naturally');
assert.equal(finish.state.outcome.boardWinner,0,'AI actually wins the board in this fixture');
assert.equal(finish.state.outcome.winner,1);
assert.equal(finish.state.outcome.commendationsEligible,true);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-forfeit-test-'));
process.env.FATE_FLY_DATA_API_DIR=dir;
const originalFetch=globalThis.fetch;
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
globalThis.fetch=async()=>({ok:true,headers:new Headers(),json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const project=process.env.FATE_FIREBASE_PROJECT_ID||'fates-entwined-41491';
function token(uid){const input=`${encode({alg:'RS256',kid:'test'})}.${encode({sub:uid,aud:project,iss:`https://securetoken.google.com/${project}`,exp:Math.floor(Date.now()/1000)+3600})}`;return `${input}.${crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;}
const campaign={mapCode:'WF-TEST',sequence:1,status:'active',zones:Array.from({length:5},(_,i)=>({id:'z'+i,a:i?null:{uid:'alpha',elo:600},b:i?null:{uid:'bravo',elo:600},matches:[],bans:{a:[],b:[]},bansLocked:{a:false,b:false}})),archives:[]};
campaign.zones[0].activeMatch={matchId:locked.matchId,teamASeat:0};
campaign.zones[1].a={uid:'zero',elo:600};campaign.zones[1].b={uid:'unknown',elo:600};
fs.writeFileSync(path.join(dir,'rooms.json'),JSON.stringify({playerStats:[{uid:'alpha',challengerElo:970},{uid:'bravo',challengerElo:687},{uid:'zero',challengerElo:0}],warfrontEvent:campaign}));
let api;
try{
  const {createFlyDataApi}=await import('./fly-data-api.mjs');let response;
  let liveMatch={...initial,warfrontMatchmakingKey:'WF-TEST|z0|alpha|bravo'};
  api=createFlyDataApi({readBody:async req=>req.body,writeJson:(_res,status,body)=>{response={status,body};},
    resolveMatchState:id=>id===liveMatch.matchId?liveMatch:null,
    authenticateMatch:(id,playerId,secret)=>id===liveMatch.matchId&&secret==='test-seat-'+playerId?{seat:playerId==='p0'?0:1}:null});
  async function request(uid,method='GET',state){
    await api.handle({method,headers:{authorization:`Bearer ${token(uid)}`},body:{uid,state}},{},new URL('http://localhost/api/warfront/state'));
    assert.equal(response.status,200);return response.body.state;
  }
  let a=await request('alpha'),b=await request('bravo');
  assert.deepEqual(a,b,'both viewers receive identical ratings');
  assert.equal(a.zones[0].a.elo,970);assert.equal(a.zones[0].b.elo,687);
  assert.equal(a.zones[1].a.elo,0);assert.equal(a.zones[1].b.elo,null);
  a.zones[0].a.elo=99999;
  assert.equal((await request('alpha','POST',a)).zones[0].a.elo,970,'client seat ELO cannot override server profile');
  assert.equal(api.settleWarfrontForfeit(locked),false,'client-authored activeMatch alone cannot settle ratings');
  await api.handle({method:'POST',headers:{authorization:`Bearer ${token('alpha')}`},body:{mapCode:'WF-TEST',zoneId:'z0',credential:{matchId:liveMatch.matchId,playerId:'p0',token:'fabricated'}}},{},new URL('http://localhost/api/warfront/bind-match'));
  assert.equal(response.status,403,'fabricated match credential must not bind an account');
  for(const [uid,playerId] of [['alpha','p0'],['bravo','p1']]){
    await api.handle({method:'POST',headers:{authorization:`Bearer ${token(uid)}`},body:{mapCode:'WF-TEST',zoneId:'z0',credential:{matchId:liveMatch.matchId,playerId,token:'test-seat-'+playerId}}},{},new URL('http://localhost/api/warfront/bind-match'));
    assert.equal(response.status,200,'account binds only using a server-issued match credential');
  }
  liveMatch={...locked,warfrontMatchmakingKey:liveMatch.warfrontMatchmakingKey};
  api.settleWarfrontForfeit(liveMatch);
  a=await request('alpha');
  assert.equal(a.zones[0].matches[0].starValue,5);
  assert.equal(a.zones[0].matches[0].winnerTeam,'b');
  assert.equal(a.zones[0].matches[0].commendationExcluded,true);
  const earned=a.zones[0].b.elo;
  a.zones[0].matches[0].winnerTeam='a';a.zones[0].matches[0].starValue=1;
  assert.equal((await request('alpha','POST',a)).zones[0].matches[0].winnerTeam,'b','client cannot reverse an authoritative sweep');
  assert(earned>687);
  api.settleWarfrontForfeit(locked);
  assert.equal((await request('bravo')).zones[0].b.elo,earned,'repeat settlement must not award ELO twice');
  liveMatch={...left,warfrontMatchmakingKey:liveMatch.warfrontMatchmakingKey};
  api.settleWarfrontForfeit(liveMatch);
  a=await request('bravo');
  assert.equal(a.zones[0].b.elo,earned);
  assert.equal(a.zones[0].activeMatch,null);
  assert.equal(a.zones[0].matches[0].commendationExcluded,true);
  assert.deepEqual(a.zones[0].matches[0].playerStats,{a:{},b:{}});
  api.flush();
  const persisted=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'),'utf8'));
  assert.equal(persisted.warfrontEvent.zones[0].matches[0].starValue,5,'sweep persists without a connected client');
  assert.equal(persisted.playerStats.find(p=>p.uid==='bravo').challengerElo,earned);
  // Completing, rather than leaving, allows only the remaining human's stats.
  liveMatch={...liveMatch,outcome:{...finish.state.outcome,totalFate:[30,12]},warfrontConsolidations:[7,3]};
  api.settleWarfrontForfeit(liveMatch,{consumedMs:[4000,5000]});
  a=await request('alpha');
  assert.equal(a.zones[0].matches[0].continuationCompleted,true);
  assert.equal(a.zones[0].matches[0].playerStats.b.consolidations,3);
  assert.equal(a.zones[0].matches[0].playerStats.b.durationMs,5000);
  assert.deepEqual(a.zones[0].matches[0].playerStats.a,{});
  assert.equal(a.zones[0].b.elo,earned);
  console.log('Warfront forfeit, takeover turn progression, rating consistency and durable 5–0 regression passed');
}finally{api?.flush();globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});}
