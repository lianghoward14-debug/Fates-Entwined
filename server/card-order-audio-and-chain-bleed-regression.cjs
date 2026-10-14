const assert=require('node:assert/strict');
const fs=require('node:fs');

const ledger=fs.readFileSync('src/scripts/51-ledger-archive.js','utf8');
const audio=fs.readFileSync('src/scripts/08-audio-and-meta-ui.js','utf8');
const renderer=fs.readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const julio=fs.readFileSync('src/scripts/28-don-julio-dice.js','utf8');
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const caribbeaSfx=fs.readFileSync('src/scripts/render-v2/19-caribbea-activation-sfx.js','utf8');

assert.match(audio,/function playLedgerReorderSfx\(oligarch=false,distance=1\)/);
assert.match(ledger,/playLedgerReorderSfx\?\.\(!!options\.opponentDeck,Math\.abs\(to-from\)\)/);
assert.match(ledger,/if\(changed\) window\.playLedgerReorderSfx\?\.\(!!options\.opponentDeck,2\)/);
assert.match(ledger,/playLedgerPanelSfx\(true,!!options\.opponentDeck\)/);
assert.match(audio,/Ledger Keepers uses a neutral modal transition/);
assert.match(audio,/filter\.type='bandpass'/);
assert.match(renderer,/texture\.width=480;texture\.height=672/);
assert.match(renderer,/ctx\.drawImage\(drawMilitaryBlockadeChains\.texture,r\.x,r\.y,r\.w,r\.h\)/);
assert.match(renderer,/ctx\.save\(\);roundedPath\(ctx,r\.x,r\.y,r\.w,r\.h,4\);ctx\.clip\(\);ctx\.translate\(r\.x,r\.y\)/);
for(const cue of ['enter','impact','land','exit']) assert.match(julio,new RegExp("playDonJulioDiceSfx\\?\\.\\('"+cue));
assert.match(julio,/const impactTimers=\[700,1400\]/);
assert.doesNotMatch(helpers,/isDonJulioSetCinematic/);
assert.match(caribbeaSfx,/'109':\[\['click',\.3[\s\S]{0,350}\['swell',1\.02/);
assert.match(caribbeaSfx,/String\(key\)===\s*'108'\?\.88:String\(key\)===\s*'109'\?1:String\(key\)===\s*'110'\?\.92:\.32/);
assert.match(caribbeaSfx,/'110':\[\['water',\.06[\s\S]{0,350}\['spark',1\.25/);

console.log('Card ordering audio, clipped Havano chains, and Don Julio/Sebastian cinematic cues passed.');
