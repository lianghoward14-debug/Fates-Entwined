'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getCardCatalog } = require('./fate-card-catalog');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const bh2 = getCardCatalog().byId.get('bh02');
assert.ok(bh2, 'BH2 must be present in the authoritative card catalog');
assert.strictEqual(bh2.name, 'Joie');
assert.strictEqual(bh2.ability, 'Thousand Reel Stare');
assert.strictEqual(bh2.type, 'Coordinator');
assert.strictEqual(bh2.aff, 'reality');
assert.strictEqual(bh2.fate, 1);
assert.strictEqual(bh2.cost, 5);
assert.strictEqual(bh2.rarity, 'square');
assert.strictEqual(bh2.set, 'brave_horizons');
assert.strictEqual(bh2.img, 'bh2.png');
assert.notStrictEqual(bh2.retired, true, 'BH2 must be available in deck building and boosters');
assert.match(bh2.effect, /activate a draw effect[\s\S]*all cards you control in this card's zone gain 1 Fate/i);

for(const relative of ['bh2.png', 'optimized/card-thumbs/bh2.jpg', 'setvoicelines/bh2.m4a']){
  assert.ok(fs.existsSync(path.join(root, relative)), relative + ' must exist');
}

const setup = read('src/scripts/04-game-setup.js');
const gameplay = read('src/scripts/05-gameplay-core.js');
const rendering = read('src/scripts/06-rendering-and-helpers.js');
const ai = read('src/scripts/07-ai.js');
const audio = read('src/scripts/08-audio-and-meta-ui.js');
const css = read('src/styles/zz-codex-last.css');
const adapter = read('src/scripts/render-v2/04-match-renderer-adapter.js');
const authority = read('server/fate-authority-reducer.js');
const index = read('index.html');

assert.match(setup, /options\.activatedDrawEffect[\s\S]*triggerJoieDrawEffectPassive/, 'draw effects must route through Joie before drawing');
assert.match(gameplay, /function triggerJoieDrawEffectPassive[\s\S]*cardActsAsPassive\(card, 'bh02'\)[\s\S]*_joieProcCount[\s\S]*getWhisperAuraPotencyBoost[\s\S]*joie_thousand_reel/, 'Joie must trigger from a draw effect anywhere, increment her tracker, and use the dedicated overlay');
assert.match(gameplay, /'bh02':'Each time you activate a draw effect, all cards you control on the field gain 1 Fate\.'/i, 'Concrete Roads must copy Joie\'s global draw trigger and apply its bonus fieldwide');
assert.match(gameplay, /drawCard\(G\.currentPlayer, 1, \{activatedDrawEffect:true, effectSource:card\}\)/, 'Brave Horizons draws must trigger Joie after movement');
assert.match(ai, /activatedDrawEffect:true, effectSource:inst/, 'AI draw effects must trigger Joie');
assert.match(rendering, /formatJoieDrawEffectsActivated[\s\S]*'Zero'[\s\S]*'One'[\s\S]*'Two'[\s\S]*Draw Effect[\s\S]*Activated[\s\S]*card\.id \|\| ''\) === 'bh02'[\s\S]*formatJoieDrawEffectsActivated\(triggers\)/, 'Joie Thousand Reel Stare tracker must use capitalized draw-effect wording for zero, one, two, and later counts');
assert.match(rendering, /"bh02": "Fake AF bro"/, 'BH2 consolidation subtitle must use the approved Fake AF bro line');
assert.match(authority, /function applyAuthorityJoieDrawEffectPassive[\s\S]*_joieProcCount[\s\S]*joie_thousand_reel[\s\S]*applyBoleslawSearchAuthorityReaction[\s\S]*applyAuthorityJoieDrawEffectPassive\(state, playerIndex, entry\.card, presentationEvents\)/, 'authority-resolved multiplayer draws must trigger Joie from anywhere, preserve her match tracker, and emit presentation separately from state');

assert.match(audio, /'bh02': 'bh2'/, 'BH2 must already point at the future bh2 audio basename');
assert.match(audio, /'bh1','bh2'[\s\S]{0,100}'horizons24set'/, 'the future BH2 audio basename must be allowed by the runtime');
assert.match(read('src/scripts/03-profile-and-progression.js'), /SET_VOICELINE_EXTENSIONS[\s\S]*bh2:'m4a'[\s\S]*SET_VOICELINE_PATH[\s\S]*SET_VOICELINE_EXTENSIONS\[key\] \|\| 'mp3'/, 'BH2 must resolve to its shipped m4a voiceline instead of the default mp3 extension');
assert.match(read('electron/main.js'), /'\.m4a': 'audio\/mp4'[\s\S]*'\.mp3', '\.m4a', '\.wav', '\.ogg'/, 'desktop static audio serving must support BH2 m4a audio');
assert.match(read('server/fate-ws-authority.js'), /ext === '\.m4a'[\s\S]*audio\/mp4/, 'authority static serving must support BH2 m4a audio');
assert.match(read('tools/solo-static-server.js'), /'\.m4a': 'audio\/mp4'/, 'solo static serving must support BH2 m4a audio');

assert.match(css, /effect-flash-joie_thousand_reel[\s\S]*rgba\(255,183,232,\.99\)[\s\S]*rect x='10' y='10'[\s\S]*circle cx='32' cy='32'[\s\S]*circle cx='45' cy='19'/, 'DOM overlay must use the pink camera glyph');
assert.match(adapter, /joie_thousand_reel:\{color:'rgba\(255,183,232,\.99\)'[\s\S]*kind === 'joie_thousand_reel'[\s\S]*roundedPath\(ctx, 10, 10, 44, 44, 9\)[\s\S]*circle\(32,32,11\)[\s\S]*dot\(45,19,3\.2\)/, 'canvas overlay must match the pink camera glyph');
assert.match(index, /01-data-and-state\.js\?v=\d+[\s\S]*04-game-setup\.js\?v=\d+[\s\S]*05-gameplay-core\.js\?v=\d+[\s\S]*04-match-renderer-adapter\.js\?v=\d+[\s\S]*07-ai\.js\?v=\d+[\s\S]*08-audio-and-meta-ui\.js\?v=\d+/, 'BH2 runtime surfaces must be cache-busted');

console.log('Brave Horizons BH2 smoke test passed.');
