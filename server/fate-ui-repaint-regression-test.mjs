import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const grid = fs.readFileSync(new URL('../src/scripts/24-card-grid-canvas-renderer.js', import.meta.url), 'utf8');
const frames = [];
const context = {
  Image: class {}, window: {},
  requestAnimationFrame: callback => frames.push(callback),
  setTimeout: callback => frames.push(callback)
};
vm.createContext(context);
vm.runInContext(grid.slice(0, grid.indexOf('  function px(')) + '\nwindow.getImage = getImage;})();', context);
let firstPaints = 0, secondPaints = 0;
const first = () => firstPaints++;
const second = () => secondPaints++;
const a = context.window.getImage('a.png', first);
const b = context.window.getImage('b.png', first);
assert.equal(context.window.getImage('a.png', second), a);
a.onload();
b.onload();
assert.equal(frames.length, 1, 'image bursts should schedule a single frame');
frames.shift()();
assert.equal(firstPaints, 1, 'one grid should paint once for multiple image completions');
assert.equal(secondPaints, 1, 'another grid sharing a pending image must also refresh');
const c = context.window.getImage('c.png', first);
c.onerror();
frames.shift()();
assert.equal(firstPaints, 2, 'failed images must also invalidate the grid');
context.window.getImage('a.png', first);
assert.equal(frames.length, 0, 'loaded cache hits should not schedule extra frames');

const hud = fs.readFileSync(new URL('../src/scripts/45-match-ui-codex.js', import.meta.url), 'utf8');
const poll = hud.match(/const updateVisible = function\(\)\{[\s\S]*?\n    \};/)[0];
let updates = 0, cleanups = 0, active = false;
const hudContext = {
  document: {hidden: false},
  root: {isConnected: true, __fateCodexCleanup: () => cleanups++},
  game: {classList: {contains: () => active}},
  update: () => updates++
};
vm.createContext(hudContext);
vm.runInContext(poll + '\nthis.poll = updateVisible;', hudContext);
hudContext.poll();
assert.equal(updates, 0, 'inactive match HUD must not poll');
active = true;
hudContext.poll();
assert.equal(updates, 1, 'visible match HUD must still refresh');
hudContext.document.hidden = true;
hudContext.poll();
assert.equal(updates, 1, 'background window must skip HUD work');
hudContext.document.hidden = false;
hudContext.poll();
assert.equal(updates, 2, 'returning to the visible match must refresh');
hudContext.root.isConnected = false;
hudContext.poll();
assert.equal(cleanups, 1, 'removed HUD must release its polling resources');
assert.equal(updates, 2);
console.log('UI repaint regression tests passed');
