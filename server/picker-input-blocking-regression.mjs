import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/scripts/06-rendering-and-helpers.js', import.meta.url), 'utf8');
const start = source.indexOf('function isBoardInputBlockedByModal(');
const end = source.indexOf('function patchChangedBoardCells(', start);
let modalOpen = false;
let overlays = [];
let actions = 0;
const timers = [];
const handlers = new Map();
const cell = {dataset:{z:'0',r:'0',c:'0'}};
const board = {
  contains: node => node === cell,
  addEventListener(type, fn, options) {
    const list = handlers.get(type) || [];
    list.push({fn, capture:!!options?.capture});
    handlers.set(type, list);
  }
};
const context = vm.createContext({
  document:{
    getElementById: () => ({classList:{contains: () => modalOpen}}),
    querySelectorAll: () => overlays
  },
  window:{getComputedStyle: el => el.style},
  performance:{now:() => 1000},
  G:{board:[[[{}]]], placing:true},
  captureBoardViewportLock(){},
  restoreBoardViewportLockSoon(){},
  clickCell(){actions++;},
  activateBoardCard(){actions++;},
  openCardDetail(){actions++;},
  setTimeout:fn => timers.push(fn)
});
vm.runInContext(source.slice(start, end), context);
context.installBoardClickDelegation(board);
function fire(type) {
  const event = {
    target:{closest:selector => selector.startsWith('.cell') ? cell : null},
    button:0, clientX:10, clientY:10,
    preventDefault(){this.prevented = true;},
    stopImmediatePropagation(){this.stopped = true;}
  };
  for(const handler of [...handlers.get(type)].sort((a,b)=>Number(b.capture)-Number(a.capture))){
    handler.fn(event);
    if(event.stopped) break;
  }
  return event;
}

// Every legacy board event is intercepted before card or cell handlers.
modalOpen = true;
for(const type of ['pointerdown','pointerup','click','dblclick','contextmenu']){
  assert.equal(fire(type).stopped, true, type);
}
assert.equal(actions, 0);

// Input resumes immediately after closing; ordinary board targeting still works.
modalOpen = false;
fire('click');
assert.equal(actions, 1);

// A modal opening between release and the delayed fallback must cancel the action.
fire('pointerdown');
fire('pointerup');
modalOpen = true;
timers.splice(0).forEach(fn=>fn());
assert.equal(actions, 1);

// Secondary overlays block even while fading or with pointer-transparent parents.
modalOpen = false;
overlays = [{style:{display:'block',visibility:'visible',opacity:'0',pointerEvents:'none'},getClientRects:()=>[{}]}];
assert.equal(context.isBoardInputBlockedByModal(), true);
assert.equal(fire('click').stopped, true);
overlays[0].style.display = 'none';
assert.equal(context.isBoardInputBlockedByModal(), false);
overlays = [];

// Canvas dispatch uses the same guard, including direct/recovered dispatches.
vm.runInContext(fs.readFileSync(new URL('../src/scripts/render-v2/06-match-scene-input.js', import.meta.url),'utf8'), context);
const input = new context.window.FateMatchSceneInput();
input.isLiveBoardSelectionActive = () => true;
modalOpen = true;
input.dispatchHit({z:0,r:0,c:0,kind:'card'});
assert.equal(actions, 1);
modalOpen = false;
input.dispatchHit({z:0,r:0,c:0,kind:'card'});
assert.equal(actions, 2);
console.log('Picker input blocking passed: legacy events, delayed fallback, secondary overlays, canvas dispatch, and resume after close.');
