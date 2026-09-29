const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const client=fs.readFileSync('src/scripts/authoritative-v3-phase7-beta-client.mjs','utf8');
const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

(async()=>{
  const notices=[];
  const noticeContext={spectatingMatchId:'',setTimeout:()=>1,clearTimeout(){},document:{
    getElementById:id=>id==='s-game'?{appendChild:n=>notices.push(n.textContent)}:null,
    createElement:()=>({style:{},setAttribute(){},remove(){}})
  }};
  vm.createContext(noticeContext);
  vm.runInContext(section(client,"let takeoverNoticeKey = '';",'function readTurnClock('),noticeContext);
  const aiMatch={matchId:'war-ai',aiTakeoverSeats:[0],outcome:null};
  noticeContext.updateTakeoverNotice(aiMatch,1);
  assert.equal(notices.length,0,'built-in AI is not a departed opponent');
  noticeContext.updateTakeoverNotice({...aiMatch,warfrontForfeit:{loser:1},aiTakeoverSeats:[0,1]},1);
  assert.match(notices.at(-1),/YOU FORFEITED/);
  noticeContext.updateTakeoverNotice({...aiMatch,matchId:'human',warfrontForfeit:{loser:0}},1);
  assert.match(notices.at(-1),/OPPONENT LEFT/);
  noticeContext.spectatingMatchId='watch';
  noticeContext.updateTakeoverNotice({...aiMatch,matchId:'watch',warfrontForfeit:{loser:0}},1);
  assert.equal(notices.length,2,'spectators do not receive personal takeover warnings');

  let stopped;
  const spectator=fs.readFileSync('src/scripts/22-spectator.js','utf8');
  const exitContext={window:{fateAuthorityV3Beta:{report:()=>({spectatingMatchId:'live'}),stopSpectating:opts=>{stopped=opts;}}}};
  vm.createContext(exitContext);
  // Exercise the shipping exit entry point without initializing legacy room subscriptions.
  vm.runInContext(section(spectator,'  function leaveSpectating(options){','    const code = spectatingRoom;')+'}',exitContext);
  assert.equal(exitContext.leaveSpectating(),true);
  assert.equal(stopped.showWarfront,true,'regular spectator exit stops the Warfront poll');

  let resolveBridge,mounts=0,exit,forgot,unsubscribed=false,exitScreen,exitTab;
  const game={_onlineRoomCode:'old',_onlineRole:'host'};
  const screen={credential:{queueMode:'warfront'},screenGeneration:0,takeoverNoticeTimer:null,takeoverNoticeKey:'',activeScreen:null,
    document:{getElementById:()=>null},clearTimeout(){},networkAdapter:{},
    waitForCurrentUiBridge:()=>new Promise(resolve=>{resolveBridge=resolve;}),
    disconnect:opts=>{forgot=opts.forget;},getFateGameState:()=>game,showScreen:value=>{exitScreen=value;},switchChTab:value=>{exitTab=value;},
    FATE_PENDING_WAR_MATCH:{},FATE_WAR_REPLAY_CAPTURE:{unsubscribe(){unsubscribed=true;}}
  };
  const bridge={mount:options=>{mounts++;exit=options.onExit;return {unmount(){}};}};
  vm.createContext(screen);
  vm.runInContext(section(client,'function unmountGameScreen(){','async function waitForCurrentUiBridge(')+section(client,'async function mountGameScreen(options = {}){','function stopSpectating('),screen);
  const pending=screen.mountGameScreen();
  screen.unmountGameScreen();resolveBridge(bridge);await pending;
  assert.equal(mounts,0,'late UI bridge cannot remount after exit');
  const active=screen.mountGameScreen();resolveBridge(bridge);await active;exit();
  assert.equal(forgot,true,'leaving clears saved match credentials');
  assert.equal(unsubscribed,true);assert.equal(screen.FATE_PENDING_WAR_MATCH,null);
  assert.equal(game._onlineRoomCode,null);
  assert.equal(exitScreen,'s-challenger');assert.equal(exitTab,'war');

  const requests=[],renders=[];
  const feed={spectatorGeneration:0,spectatingMatchId:'',spectatorPollTimer:null,
    spectatorPerspective:0,playerIndex:null,state:null,revision:0,stateHash:'',legalCommands:[],privateActionCards:[],presentationBatch:null,
    unmountGameScreen(){},disconnect(){},clone:value=>value,
    matchmakingRequest:()=>new Promise(resolve=>requests.push(resolve)),
    applyServerMessage:message=>renders.push(message.state.tag),enforceWarfrontSpectatorState(){},
    mountGameScreen:async()=>{},activeScreen:null,networkAdapter:{view:()=>null},
    setTimeout:()=>1,clearTimeout(){},console
  };
  vm.createContext(feed);
  vm.runInContext(section(client,'function returnToWarfrontScreen(','function enforceWarfrontSpectatorState(')+section(client,'async function startSpectating(','globalThis.fateAuthorityV3Beta ='),feed);
  const oldFeed=feed.startSpectating({matchId:'same-match'});
  feed.stopSpectating({showWarfront:false});
  const newFeed=feed.startSpectating({matchId:'same-match'});
  requests[0]({state:{tag:'stale'}});assert.equal(await oldFeed,false);
  requests[1]({state:{tag:'fresh'}});assert.equal(await newFeed,true);
  assert.deepEqual(renders,['fresh'],'late snapshots cannot revive a stopped feed, even for the same match');
  let scheduled=0;
  feed.setTimeout=()=>{scheduled++;return 1;};
  const ending=feed.startSpectating({matchId:'ended-match'});
  requests[2]({state:{tag:'ended',outcome:{winner:0}}});await ending;
  assert.equal(scheduled,0,'spectator results never schedule automatic exit or further polls');
  assert.equal(feed.spectatingMatchId,'ended-match','result remains mounted until manual exit');
  feed.stopSpectating({showWarfront:false});
  assert.equal(feed.spectatingMatchId,'');
  const removed=[],classes=[];
  feed.document={getElementById:id=>id==='s-game'?{classList:{remove:(...names)=>classes.push(...names)}}:{remove:()=>removed.push(id)}};
  feed.getFateGameState=()=>({_isSpectator:false,_onlineRole:null});
  feed.stopSpectating({showWarfront:false});
  assert.deepEqual(removed,['warfront-spectator-panel','spectator-badge','spectator-perspective-controls']);
  assert.deepEqual(classes,['spectator-mode','warfront-team-spectator'],'labels clear even after game cleanup reset its flags');

  let resumeActions,connections=0,resumeMounts=0;
  const resume={credential:{queueMode:'warfront',matchId:'saved'},spectatingMatchId:'',intentionallyClosed:false,
    playerIndex:1,state:{warfrontForfeit:{loser:1}},waitForCurrentUiBridge:async()=>{},
    showModal:(_title,_copy,actions)=>{resumeActions=actions;},closeModal(){},
    connect:async()=>{connections++;},waitForInitialView:async()=>{},
    mountGameScreen:async()=>{resumeMounts++;},disconnect:()=>{resume.credential=null;},toast(){}};
  vm.createContext(resume);
  vm.runInContext(section(client,'async function resumeSavedMatch(){','credential = loadCredential();'),resume);
  await resume.resumeSavedMatch();
  assert.equal(connections,0,'saved Warfront match cannot bypass deck selection with automatic connection');
  await resumeActions[1].action();
  assert.equal(resumeMounts,0,'a forfeited seat cannot reopen the match');
  assert.equal(resume.credential,null);

  let picker,selected,preview,stopCount=0;
  const decks=fs.readFileSync('src/scripts/09-challenger-mode.js','utf8');
  const deckContext={window:{fateAuthorityV3Beta:{report:()=>({spectatingMatchId:'old'}),stopSpectating:()=>stopCount++}},
    CURRENT_MODE:'free',G:{_pickDeckAfterAi:true,_pickDeckAfterMatchmaking:true,_selectedAI:{}},
    USER_PROFILE:{challengerPresets:{one:{name:'Chosen deck'}}},getOrderedDeckPickKeysForCurrentMode:()=>['one'],
    viewChallengerDeckContents:(_pid,options)=>{preview=options;},
    renderUnifiedChooseDeckModal:(_page,options)=>{picker=options;}
  };
  vm.createContext(deckContext);
  vm.runInContext(section(decks,'window.openWarfrontDeckPicker =','function buyBooster3Pack('),deckContext);
  deckContext.window.openWarfrontDeckPicker({onSelect:choice=>{selected=choice;}});
  assert.equal(stopCount,1);assert.equal(deckContext.G._pickDeckAfterAi,false);
  assert.equal(selected,undefined,'opening the picker never starts a match automatically');
  assert.equal(picker.freeMode,false);
  assert.equal(picker.allowOrder,false,'Warfront selection cannot escape into the generic order editor');
  picker.onPreview('one',{name:'Chosen deck'});preview.onBack();
  assert.equal(selected,undefined,'returning from preview still requires explicit deck confirmation');
  picker.onPlay('one',{name:'Chosen deck'},{ids:Array(40).fill('27')});
  assert.equal(selected.selectedDeckKey,'one');assert.equal(selected.deckIds.length,40);
  console.log('Warfront navigation, late mount cancellation, takeover notices and explicit deck selection passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
