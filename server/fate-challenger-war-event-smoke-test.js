const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/scripts/47-challenger-war-event.js'),'utf8');
const styles=fs.readFileSync(path.join(root,'src/styles/challenger-war-event.css'),'utf8');
const setupSource=fs.readFileSync(path.join(root,'src/scripts/04-game-setup.js'),'utf8');
const flyDataSource=fs.readFileSync(path.join(root,'server/authoritative-v3/fly-data-api.mjs'),'utf8');
const storage=new Map(),listeners={};
const target={innerHTML:'',classList:{contains:()=>true}};
const landscapes=Object.fromEntries(Array.from({length:24},(_,i)=>['igb'+(i+1),{id:'igb'+(i+1),name:'Landscape '+(i+1),shortName:'Land '+(i+1),description:'Test landscape'}]));
const cards=Array.from({length:40},(_,i)=>({id:String(i+1),name:'Card '+(i+1),type:'Character'}));
const sandbox={console,Date,Math,JSON,String,Number,Array,Object,CARDS:cards,LANDSCAPES:landscapes,CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},document:{hidden:false,getElementById:()=>null,querySelector:()=>target},USER_PROFILE:{username:'Alpha',profileImg:'blank.png'},resolveChRenderTarget:x=>x,toast:()=>{}};
sandbox.window=sandbox;sandbox.window.addEventListener=(type,fn)=>{listeners[type]=fn;};sandbox.window.dispatchEvent=()=>{};
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'47-challenger-war-event.js'});

assert.equal(typeof sandbox.renderChWarEventTab,'function');
sandbox.renderChWarEventTab(target);
assert.match(target.innerHTML,/WARFRONT/);
assert.equal((target.innerHTML.match(/class="war2-objective /g)||[]).length,5);
assert.match(target.innerHTML,/Fixed landscape/);
assert.match(source,/Enter Warfront Queue/);
assert.match(source,/queueMode:'warfront'/,'Warfront must use its dedicated authoritative queue mode');
assert.match(source,/completedHands/,'completed authoritative matches must feed both players’ hands into Warfront replays');
assert.match(source,/delete compact\.view/,'shared Warfront replays must discard full private views while retaining replay actions');
assert.match(source,/\/api\/warfront\/state/,'Warfront clients must synchronize the shared campaign through the authenticated data API');
assert.match(source,/window\.refreshFateWarfrontState=\(\)=>pullRemoteState\(\)/,'opening Warfront must have an immediate shared-state refresh hook');
assert.match(source,/window\.addEventListener\('focus',pullRemoteState\)/,'returning to the app must refresh shared Warfront state');
assert.match(source,/remotePushQueued/,'a Warfront mutation made during an in-flight push must be sent afterward');
assert.match(source,/getEphemeralMultiplayerGuestUser/,'unsigned npm clients must use their installation identity for shared Warfront synchronization');
assert.match(source,/window\.FateOnline\.flyApiRequest\('\/api\/warfront\/state'/,'Warfront must call the API object that actually exports flyApiRequest');
assert.doesNotMatch(source,/window\.FATE_ONLINE\.flyApiRequest/,'Warfront must not call the profile-state object as though it were the API');
assert.match(flyDataSource,/startsWith\('session:'\)/,'the authority must authenticate installation sessions used by the desktop client');
assert.match(flyDataSource,/warfrontEvent:clone\(warfrontEvent\)/,'the Fly data snapshot must persist the shared Warfront event');
assert.match(flyDataSource,/mergeWarfrontState/,'concurrent Warfront clients must merge deployments and match results');
assert.match(source,/matchmakingKey:key/,'Warfront queue must be isolated to the assigned matchup');
assert.match(source,/eloGainMultiplier:3/,'Warfront victories must request the 3x ELO gain modifier');
assert.match(source,/xpMultiplier:3/,'Warfront matches must request the 3x XP modifier');
assert.match(source,/dropMultiplier:3/,'Warfront matches must request three drop rolls');
assert.match(source,/MATCH_RECEIPTS/,'Warfront match rewards must be idempotent across outcome replays');
assert.match(source,/reward=rewardOnce/,'remote archive adoption must use the profile-backed event reward receipt path');
assert.match(source,/warfrontRewardReceipts/,'event-end rewards must synchronize an idempotency receipt with the player profile');
assert.match(source,/warfrontMatchReceipts/,'per-match rewards must synchronize an idempotency receipt with the player profile');
assert.match(source,/No Warfront star was awarded/,'draws must clear the queue without fabricating a zone star');
assert.match(source,/kind:'snapshot'/,'live replays must retain authoritative board snapshots so movement and removal are visible');
assert.match(source,/CARD_CONSOLIDATED.*CONSOLIDATION_COMPLETED/,'live match reports must count authoritative consolidations');
assert.match(styles,/war2-avatar\.compact\{width:44px;height:44px;flex-basis:44px/,'map profile portraits must remain large enough to identify players');
assert.match(styles,/war2-zone-stars i\{font-size:19px/,'zone victory stars must retain their enlarged final size');
assert.match(setupSource,/function clearCompletedOnlineSessionBeforeLocalGame\(\)[\s\S]{0,900}FATE_PENDING_WAR_MATCH = null[\s\S]{0,500}leaveMatchmaking/,'local play must cancel a reserved Warfront request and its asynchronous queue');
assert.match(setupSource,/FATE_WAR_REPLAY_CAPTURE[\s\S]{0,220}unsubscribe[\s\S]{0,220}FATE_WAR_REPLAY_CAPTURE = null/,'local play must detach Warfront replay capture');
assert.match(setupSource,/disconnect\?\.\(\{forget:true\}\)/,'local play must forget stale authoritative match credentials');

sandbox.selectWarEventTeam('a');sandbox.joinWarEventZone('north-gate','a');
sandbox.USER_PROFILE.username='Bravo';sandbox.selectWarEventTeam('b');sandbox.joinWarEventZone('north-gate','b');
let event=sandbox.getFateClanEventState();
assert.equal(event.zones[0].a.name,'Alpha');assert.equal(event.zones[0].b.name,'Bravo');
assert.ok(event.zones.every(zone=>zone.landscape&&zone.landscape.id));

// Each player locks exactly three bans.
sandbox.USER_PROFILE.username='Alpha';sandbox.openWarBanEditor('north-gate');
['1','2','3'].forEach(id=>sandbox.toggleWarBanCard('north-gate',id));sandbox.lockWarBans('north-gate');
sandbox.USER_PROFILE.username='Bravo';sandbox.openWarBanEditor('north-gate');
['4','5','6'].forEach(id=>sandbox.toggleWarBanCard('north-gate',id));sandbox.lockWarBans('north-gate');
event=sandbox.getFateClanEventState();assert.equal(event.zones[0].bansLocked.a,true);assert.equal(event.zones[0].bansLocked.b,true);
assert.equal(sandbox.validateFateWarDeck('north-gate','a',['4','9']).ok,false);
assert.equal(sandbox.validateFateWarDeck('north-gate','a',['7','9']).ok,true);

assert.equal(sandbox.fateClanEventChatCommand('/event 1 2 3'),true);
event=sandbox.getFateClanEventState();assert.equal(event.status,'active');assert.equal(event.endsAt-event.startedAt,48*60*60*1000);

// Alpha takes the series and leads all three two-star commendations.
for(let i=0;i<3;i++)assert.equal(sandbox.fateClanEventReportMatch({zoneId:'north-gate',winnerTeam:'a',matchId:'m'+i,playerStats:{a:{totalFateGenerated:50+i,fateDifferential:10+i,durationMs:90000-i*10000,consolidations:3+i},b:{totalFateGenerated:100+i,fateDifferential:1,consolidations:1}}}),true);
sandbox.openWarAchievements();assert.match(target.innerHTML,/Three ways to earn \+2/);assert.match(target.innerHTML,/Alpha/);
event=sandbox.getFateClanEventState();
event.endsAt=Date.now()-1;storage.set('fate_challenger_war_event_v2',JSON.stringify(event));listeners.storage({key:'fate_challenger_war_event_v2'});sandbox.renderChWarEventTab(target);
event=sandbox.getFateClanEventState();assert.equal(event.status,'enrollment');assert.equal(event.archives.length,1);assert.equal(event.archives[0].score.a,10);assert.equal(event.archives[0].achievements.length,3);assert.equal(event.zones.every(z=>!z.a&&!z.b),true);
assert.equal(sandbox.USER_PROFILE.warfrontParticipations,1);assert.equal(sandbox.USER_PROFILE.warfrontWins,0);
assert.ok(sandbox.USER_PROFILE.warfrontRewardReceipts[event.archives[0].mapCode],'event-end rewards must leave a profile-backed receipt');
assert.deepEqual(Array.from(sandbox.USER_PROFILE.ownedMedals),[1,22]);
assert.deepEqual(Array.from(event.archives[0].localReward.medalIds),[1,22]);
sandbox.openWarArchive();assert.match(target.innerHTML,/Previous campaigns/);assert.match(target.innerHTML,/10 — 0/);

// Test helpers expose every medal surface and fully undo simulated event rewards.
assert.equal(sandbox.fateClanEventChatCommand('/medals'),true);assert.equal(sandbox.USER_PROFILE.ownedMedals.length,50);assert.deepEqual(Array.from(sandbox.USER_PROFILE.displayedMedals),[1,2,3]);
assert.equal(sandbox.fateClanEventChatCommand('/medalsreset'),true);assert.equal(sandbox.USER_PROFILE.ownedMedals.length,0);assert.equal(sandbox.USER_PROFILE.displayedMedals.length,0);
const beforeSimulation=JSON.stringify(sandbox.getFateClanEventState()),beforeStarlight=sandbox.USER_PROFILE.starlight||0,beforeRewardReceipts=JSON.stringify(sandbox.USER_PROFILE.warfrontRewardReceipts||{}),beforeMatchReceipts=JSON.stringify(sandbox.USER_PROFILE.warfrontMatchReceipts||{});
assert.equal(sandbox.fateClanEventChatCommand('/eventsimulation'),true);event=sandbox.getFateClanEventState();assert.equal(event.archives[0].matches,25);assert.equal(event.lastResult.matches,25);assert.match(target.innerHTML,/AFTER-ACTION REPORT/);
assert.equal(sandbox.fateClanEventChatCommand('/eventreset'),true);assert.equal(JSON.stringify(sandbox.getFateClanEventState()),beforeSimulation);assert.equal(sandbox.USER_PROFILE.starlight||0,beforeStarlight);assert.equal(JSON.stringify(sandbox.USER_PROFILE.warfrontRewardReceipts||{}),beforeRewardReceipts);assert.equal(JSON.stringify(sandbox.USER_PROFILE.warfrontMatchReceipts||{}),beforeMatchReceipts);
const beforeRandom=JSON.stringify(sandbox.getFateClanEventState());assert.equal(sandbox.fateClanEventChatCommand('/eventrandom'),true);event=sandbox.getFateClanEventState();const randomMatches=event.zones.reduce((n,z)=>n+z.matches.length,0),randomPlayers=event.zones.reduce((n,z)=>n+(z.a?1:0)+(z.b?1:0),0);assert.equal(event.status,'active');assert.equal(randomPlayers,10);assert.ok(randomMatches>=1&&randomMatches<=24);assert.match(target.innerHTML,/LIVE WAR RECORD/);assert.equal(sandbox.fateClanEventChatCommand('/eventreset'),true);assert.equal(JSON.stringify(sandbox.getFateClanEventState()),beforeRandom);
const liveBeforeArchive=sandbox.getFateClanEventState(),medalsBeforeArchive=JSON.stringify(sandbox.USER_PROFILE.ownedMedals);
assert.equal(sandbox.fateClanEventChatCommand('/archive simulation'),true);event=sandbox.getFateClanEventState();assert.equal(event.mapCode,liveBeforeArchive.mapCode);assert.equal(event.archives.length,liveBeforeArchive.archives.length+1);assert.equal(event.archives[0].matches,25);assert.equal(event.archives[0].localReward,null);assert.equal(JSON.stringify(sandbox.USER_PROFILE.ownedMedals),medalsBeforeArchive);assert.match(target.innerHTML,/AFTER-ACTION REPORT/);
assert.equal(sandbox.fateClanEventChatCommand('/archiveclear'),true);event=sandbox.getFateClanEventState();assert.equal(event.archives.length,0);assert.equal(event.lastResult,null);
assert.equal(sandbox.fateClanEventChatCommand('/match replay'),true);event=sandbox.getFateClanEventState();assert.equal(event.zones.reduce((n,z)=>n+z.matches.length,0),1);assert.ok(event.zones[0].matches[0].replay.actions.length);assert.match(target.innerHTML,/REPLAY ·/);assert.match(target.innerHTML,/PAUSE/);assert.match(target.innerHTML,/1×/);assert.match(target.innerHTML,/2×/);assert.match(target.innerHTML,/4×/);sandbox.setWarReplayPerspective('b');assert.match(target.innerHTML,/Rook HAND/);sandbox.exitWarReplay();assert.match(target.innerHTML,/WATCH REPLAY/);
assert.match(source,/ingamebackgrouds\/'\+esc\(l\.id\|\|'igb1'\)\+'\.png/,'landscape art must fall back to the original PNG');
assert.match(source,/igb17\/1\.png/,'igb17 must use image 1 from its dedicated folder');
assert.match(source,/n>=1&&n<=16\?'optimized\/backgrounds\/[\s\S]{0,120}:'ingamebackgrouds\/'\+id\+'\.png'/,'landscapes without optimized art must load their original PNG directly');
assert.match(source,/photo:'pfp\/pfp/,'simulated players must use bundled profile portraits');

console.log('Challenger war event v2 smoke test passed.');
