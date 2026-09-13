const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync('src/scripts/' + name, 'utf8');
const setup = read('04-game-setup.js');
const core = read('05-gameplay-core.js');
const online = read('18-online-rooms.js');
function topFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const sounds = [];
const context = vm.createContext({
  window: {}, G: {currentPlayer:0},
  isEffectImmuneSource: () => false,
  markInitialEffectResolved: () => {}, toast: () => {}, log: () => {},
  playSfx: sound => sounds.push(sound), showEffectNegatedBanner: () => {},
  renderEffectResolutionForPlayer: () => {}
});
vm.runInContext(topFunction(core, 'executeReaction'), context);
const lydia = {owner:1, usesLeft:2};
const target = {name:'Supporter'};
context.executeReaction({type:'lydia', card:lydia}, {card:target});
assert.deepEqual(sounds, ['effectNegated']);
assert.equal(lydia.usesLeft, 1);
assert.equal(target._effectNegatedByReaction, true);
assert.equal(target._lydiaSuppressed, true);
vm.runInContext(topFunction(setup, 'isHowardDevMode') + '\n' + topFunction(setup, 'clearHowardDevMode'), context);
context.window.__fateHowardDevMode = true;
context.G._howardDevMode = true;
assert.equal(context.isHowardDevMode(), true);
context.G._onlineRoomCode = 'REAL';
assert.equal(context.isHowardDevMode(), false);
context.G._onlineRoomCode = null;
context.window.__fateHowardDevLaunchPending = true;
context.window.__fateHowardDevLaunchToken = {};
context.clearHowardDevMode();
assert.equal(context.isHowardDevMode(), false);
assert.equal(context.G._howardDevMode, false);
assert.equal(context.window.__fateHowardDevLaunchPending, false);
assert.equal(context.window.__fateHowardDevLaunchToken, null);
context.window.__fateHowardDevMode = true;
assert.equal(context.isHowardDevMode(), false, 'stale global cannot enable dev catalog');
assert.match(read('02-screen-and-deckbuilder.js'), /id !== 's-game' && id !== 's-coin'.*clearHowardDevMode\(\)/);
assert.match(topFunction(setup, 'startOnlineServerBootstrappedGame'), /clearHowardDevMode\(\)/);
assert.ok(topFunction(setup, 'startGame').indexOf('clearHowardDevMode()') < topFunction(setup, 'startGame').indexOf('authority.startFromLegacyUi'));
assert.match(online, /function phase7CommitCurrentView[\s\S]{0,260}window.clearHowardDevMode\(\)/);
assert.match(online, /!isLydia && String\(event\?\.mode \|\| ''\)\.toUpperCase\(\) === 'SUPPRESS' \? 'effectSuppressed' : 'effectNegated'/);
assert.match(online, /if\(resolutionMode === 'suppressed'\) window.playSfx\('effectSuppressed'\);\s*else window.playSfx\('effectNegated'\)/);
assert.ok(fs.statSync('soundeffects/codex-redesign/reaction_interrupt_sting.wav').size > 44);
console.log('Lydia negate audio and Howard dev-mode isolation regressions passed');
