const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const drag = fs.readFileSync('src/scripts/render-v2/09-hand-drag-bridge.js', 'utf8');
function extract(name) {
  const start = drag.indexOf(`  function ${name}(`);
  return drag.slice(start, drag.indexOf('\n  }', start) + 4);
}
let cleaned = 0;
const context = vm.createContext({
  state: {pointerType:'touch', dragging:true}, Date,
  document: {body:{classList:{contains:()=>false}}},
  isActiveDragPointer:()=>true,
  suppressHandClick:()=>{}, blockClickUntil:0,
  cleanup:()=>{ cleaned++; context.state = null; }
});
vm.runInContext(extract('onPointerCancel') + extract('onPointerDown'), context);
context.onPointerCancel({pointerType:'touch'});
assert.equal(cleaned, 1, 'Browser takeover must cancel touch drag');
context.state = {pointerType:'mouse', dragging:true};
context.onPointerCancel({pointerType:'mouse'});
assert.equal(cleaned, 1, 'Preserve existing mouse cancellation behavior');
context.state = {pointerType:'touch', dragging:true};
context.onPointerDown({pointerType:'touch', isPrimary:false});
assert.equal(cleaned, 2, 'Second finger cancels card drag before zoom');
const window = {};
vm.runInNewContext(fs.readFileSync('src/scripts/render-v2/06-match-scene-input.js','utf8'), {window, Date, performance:{now:()=>1000}});
const input = new window.FateMatchSceneInput();
input.pointerDownHit = input.viewportPointerDownHit = {kind:'card'};
input.pointerDownPoint = input.viewportPointerDownPoint = {clientX:10, clientY:10};
input.handleTouchCancel({pointerType:'touch'});
assert.equal(input.pointerDownPoint, null);
assert.equal(input.viewportPointerDownHit, null);
assert.ok(input.touchGestureUntil > Date.now());
assert.doesNotMatch(fs.readFileSync('index.html','utf8'), /user-scalable=no/);
console.log('Mobile cancellation, pinch safety, and desktop preservation checks passed.');

// CSS game zoom must preserve the relationship between painted UI and touch hits.
let coarse = true;
const mobileWindow = {matchMedia:()=>({matches:coarse}),addEventListener:()=>{}};
const mobileDocument = {getElementById:()=>({__fateCssW:400,__fateCssH:800,getBoundingClientRect:()=>({left:10,top:20,width:800,height:1600})})};
vm.runInNewContext(fs.readFileSync('src/scripts/mobile-input.js','utf8'),{window:mobileWindow,document:mobileDocument});
assert.equal(mobileWindow.FateMobileInput.uiPoint(210,420).x,100);
assert.equal(mobileWindow.FateMobileInput.uiPoint(210,420).y,200);
assert.equal(mobileWindow.FateMobileInput.uiRectToClient({x:100,y:200,w:40,h:60}).x,210);
coarse=false;
assert.equal(mobileWindow.FateMobileInput.uiPoint(210,420).x,210,'Desktop coordinates stay unchanged');
// Finger jitter should still activate a hand tap; a mouse keeps its old tolerance.
let dispatched=0;
input.scene={ownsBoard:()=>true};
input.isModalBlockingSceneInput=()=>false;
input.isAuthoritativeBoardSelectionActive=()=>false;
input.isDomControlTarget=()=>false;
input.viewportHitTest=()=>({kind:'hand-card',index:0});
input.shouldSuppressHandClick=()=>false;
input.recordInputDebug=()=>{};
input.dispatchViewportHit=()=>dispatched++;
input.viewportPointerDownHit={kind:'hand-card',index:0};
input.viewportPointerDownPoint={clientX:100,clientY:100};
input.lastHandledAt=-1000;

input.handleViewportPointerUp({pointerType:'touch',button:0,clientX:107,clientY:105,preventDefault(){},stopPropagation(){}});
assert.equal(dispatched,1,'Small finger movement must remain a tap');
input.viewportPointerDownHit={kind:'hand-card',index:0};
input.viewportPointerDownPoint={clientX:100,clientY:100};
input.lastHandledAt=-1000;
input.handleViewportPointerUp({pointerType:'mouse',button:0,clientX:107,clientY:105});
assert.equal(dispatched,1,'Mouse drag threshold stays unchanged');
console.log('Zoom coordinate mapping and touch tap tolerance checks passed.');

for(const [w,h] of [[844,390],[667,375],[932,430],[390,844],[320,568]]){
 const fit=mobileWindow.FateMobileInput.fitDimensions(w,h);
 assert.ok(fit.width>=1280);
 assert.ok(fit.height>=720-0.01);
 assert.ok(Math.abs(fit.width*fit.scale-w)<0.01);
 assert.ok(Math.abs(fit.height*fit.scale-h)<0.01);
}
console.log('Portrait and landscape fit checks passed across five phone sizes.');
