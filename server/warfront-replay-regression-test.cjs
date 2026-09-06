const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/scripts/47-challenger-war-event.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function legacyPresentation(){
  const ctx={clone};vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function replayAuthoritativeViewAt('),source.indexOf('const replayWait=')),ctx);
  const rp={actions:[{view:{kind:'accepted',revision:2,commandId:'set',state:{},events:[{type:'CARD_SET'},{type:'EFFECT_ACTIVATED'}]}}]};
  const view=ctx.replayAuthoritativeViewAt(rp,1);
  assert.equal(view.presentationBatch.events.length,2,'older recordings recover their real events instead of the abbreviated fallback');
  assert.equal(view.presentationBatch.id,'2:set');
  assert.equal(rp.actions[0].view.presentationBatch,undefined,'normalizing playback does not rewrite the recording');
}

async function playback(){
  let now=0, pending=null, resolvePresentation, renders=0;
  const match={replay:{actions:[{atMs:0},{atMs:10000},{atMs:20000}]}};
  const v={step:1,speed:1,playing:true,busy:false,positionMs:0,clockAt:0};
  const ctx={replayView:v,replayTicker:null,selectedMatchId:'one',Date:{now:()=>now},
    findMatch:()=>match,ensureReplayControls:()=>{},console,
    setTimeout:(fn,delay)=>{pending={fn,delay};return 1;},clearTimeout:()=>{pending=null;},
    renderFullWarReplay:()=>{renders++;return new Promise(resolve=>{resolvePresentation=resolve;});}};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function updateReplayClock(){'),source.indexOf('window.openWarReplay=')),ctx);
  ctx.scheduleReplayTick();assert.equal(pending.delay,10000,'preserve original thinking time');
  now=4000;ctx.updateReplayClock();v.speed=2;ctx.scheduleReplayTick();
  assert.equal(pending.delay,3000,'speed change preserves elapsed progress');
  now=7000;const fire=pending.fn;pending=null;const running=fire();assert.equal(renders,1);
  ctx.scheduleReplayTick();assert.equal(pending,null,'speed changes cannot overlap presentations');
  now=9000;resolvePresentation();await running;
  assert.equal(pending.delay,3000,'presentation time counts toward the next recorded action');
  ctx.updateReplayClock();v.playing=false;ctx.scheduleReplayTick();
  now=99000;ctx.updateReplayClock();v.playing=true;ctx.scheduleReplayTick();
  assert.equal(pending.delay,3000,'paused time does not advance the recording');
  const next=pending.fn();const oldStep=v.step;
  ctx.replayView={...v,step:0};resolvePresentation();await next;
  assert.equal(ctx.replayView.step,0,'an exited playback cannot mutate a new session');
  assert.equal(oldStep,3);
}

function capture(){
  let now=1000,listener,assembled;
  const ctx={window:{fateAuthorityV3Beta:{subscribe:fn=>{listener=fn;return ()=>{};},replayView:()=>assembled}},
    Date:{now:()=>now},seat:()=>({team:'b'}),me:()=>({uid:'me'}),opposite:t=>t==='a'?'b':'a',clone};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function beginReplayCapture('),source.indexOf('window.FATE_ONLINE_JOIN_WAR_QUEUE=')),ctx);
  ctx.beginReplayCapture({mapCode:'map',zoneId:'zone'});
  const view={playerIndex:0,state:{matchId:'m',revision:0,phase:'coin',board:[[[null]]],players:[{hand:[]},{hand:[]}]}};
  assembled=view;
  const deliver=()=>listener({kind:'accepted',state:clone(view.state),events:[{type:'WIRE_EVENT'}]});
  deliver();const cap=ctx.window.FATE_WAR_REPLAY_CAPTURE;
  assert.equal(cap.actions[0].atMs,0);assert.equal(cap.teamASeat,1);assert.equal(cap.recordedPerspective,'b');
  assert.equal(cap.actions[0].view.playerIndex,0,'wire messages must be converted to the render adapter view');
  now=8000;deliver();assert.equal(cap.actions.length,1,'ignore duplicate delivery');
  view.state.revision++;view.state.phase='main';deliver();
  assert.equal(cap.actions.length,2,'capture turn and phase changes on an unchanged board');
  assert.equal(cap.actions[1].atMs,7000);
  view.presentationBatch={id:'batch',events:[{type:'CARD_DRAWN',playerIndex:0}]};deliver();
  assert.equal(cap.actions.at(-1).view.presentationBatch.events[0].type,'CARD_DRAWN','preserve actual assembled presentation events');
  view.state.revision++;view.state.players[0].hand.push({id:'1'});deliver();
  assert.equal(cap.actions.at(-1).view.presentationBatch,null,'do not replay a stale batch');
  view.state.outcome={winner:0};cap.recordView(view);
  assert.equal(cap.actions.at(-1).view.state.outcome.winner,0,'retain the ending');
  view.state.outcome.winner=1;
  assert.equal(cap.actions.at(-1).view.state.outcome.winner,0,'recordings are immutable snapshots');
}

(async()=>{legacyPresentation();capture();await playback();console.log('Warfront replay capture, timing, speed, pause and isolation regressions passed');})().catch(error=>{console.error(error);process.exitCode=1;});
