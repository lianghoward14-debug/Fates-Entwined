'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../src/scripts/render-v2', name), 'utf8');
const window = {innerWidth:1280, innerHeight:720};
const sandbox = vm.createContext({window, console});
vm.runInContext(read('12-vfx-primitives.js'), sandbox);
vm.runInContext(read('13-vfx-recipes.js'), sandbox);
// Observe renderer output without loading art or creating a browser canvas.
vm.runInContext(read('11-vfx-director.js')
  .replace('function drawCard(ctx, card, r, options){', 'function drawCard(ctx, card, r, options){ window.testCard = {r, options}; return;')
  .replace('window.FateVfxDirector = {', 'window.testDraw = drawPrimitive; window.testEase = ease; window.FateVfxDirector = {'), sandbox);
let scale;
const ctx = new Proxy({}, {get:(_, key) => key === 'scale' ? (x,y) => {scale=[x,y];} : () => {}});
const fromRect = {x:30,y:410,w:70,h:98}, toRect = {x:650,y:590,w:70,h:98};
function render(p, progress){
  window.testDraw(ctx, {...p, start:0, progress, eased:window.testEase(p.easing,progress)}, {cssW:1280,cssH:720});
  assert.ok(scale.every(Number.isFinite));
  return window.testCard.options.faceDown;
}
for(const source of ['deck','discard']) for(const faceDown of [false,true]){
  const effects=window.FateVfxRecipes.expand('SEARCH_TO_HAND', {card:{iid:'test'},fromRect,toRect,source,faceDown,startOffset:45});
  assert.ok(effects.every(p => ['cardMove','soundCue'].includes(p.kind)), 'search has motion and audio only');
  const moves=effects.filter(p => p.kind==='cardMove');
  assert.equal(moves.length,5);
  assert.equal(moves[0].startOffset,45);
  assert.equal(moves[4].startOffset+moves[4].duration,1745);
  for(let i=1;i<moves.length;i++){
    assert.deepEqual(moves[i].fromRect,moves[i-1].toRect,'phase positions must join');
    assert.equal(moves[i].startOffset,moves[i-1].startOffset+moves[i-1].duration,'no gaps or overlapping cards');
    assert.equal(moves[i].startRotate||0,moves[i-1].endRotate||0,'phase rotations must join');
  }
  const flip=moves[1];
  assert.equal(render(flip,0),faceDown || source==='deck');
  assert.equal(render(flip,1),faceDown);
  const edge=(source==='deck' ? .5 : Math.cbrt(.25/4))*(1-flip.holdMs/flip.duration);
  render(flip,edge);
  assert.ok(scale[0]<.04,'flip passes edge-on during flight');
  for(const move of moves) for(let step=0;step<=20;step++){
    const hidden=render(move,step/20);
    if(faceDown) assert.equal(hidden,true,'opponent identity must never be shown');
  }
  assert.ok(moves[3].toRect.y < moves[4].toRect.y,'catch rebounds above its final position');
}
console.log('PASS: flip/catch timing, continuous phase boundaries, edge-on rotation, deck/discard and opponent privacy.');

// Execute the multiplayer arrival queue with transport/UI dependencies stubbed.
const online = fs.readFileSync(path.join(__dirname, '../src/scripts/18-online-rooms.js'), 'utf8');
const queue = online.slice(online.indexOf('    const drawEvents = events.map('), online.indexOf('    const aliTransfers = events.filter('));
const calls = [];
const events = [
  {type:'CARD_DRAWN',playerIndex:0,cardIid:'draw'},
  {type:'CARD_TRANSFERRED',from:'deck',to:'hand',playerIndex:0,cardIid:'search'},
  {type:'CARD_TRANSFERRED',from:'discard',to:'hand',playerIndex:0,cardIid:'recover'},
  {type:'CARD_TRANSFERRED',from:'deck',to:'hand',playerIndex:1,cardIid:'opponent'}
];
const onlineSandbox = {
  events,view:{playerIndex:0},batchId:'test',resultMotionStarted:false,
  gameState:()=>({}),phase7PresentationCard:c=>c,
  phase7FindAnyCard:()=>null,phase7FindCardLocation:()=>null,
  phase7FindProjectedEntry:(_,iid)=>({card:{iid}}),
  phase7RecordPresentationStage:()=>{},
  phase7WaitForPresentationIdle:async()=>{calls.push('wait');},
  window:{FateV2CardMotionFx:{
    drawFromPile:()=>{calls.push('draw');return true;},
    searchCardToHand:(card,owner,source)=>{calls.push(source+':'+card.iid);return true;}
  },playSfx:()=>{}}
};
vm.runInNewContext('(async()=>{'+queue+'})()',onlineSandbox).then(()=>{
  assert.deepEqual(calls,['draw','wait','deck:search','wait','discard:recover','wait']);
  console.log('PASS: multiplayer routes deck/discard searches to Flip & Catch, keeps ordinary draws, and waits between cards.');
}).catch(error=>{console.error(error);process.exitCode=1;});
