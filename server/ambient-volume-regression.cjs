const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/08-audio-and-meta-ui.js','utf8');
const index=fs.readFileSync('index.html','utf8');
assert.doesNotMatch(index,/<script[^>]+08-landscape-ambience/,'Game does not load ambience');
assert.doesNotMatch(source,/FateLandscapeAmbience|setAmbientVolume|vol-ambient|Environmental ambience/,'No automatic playback or ambience control');
function fn(name){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\n}',start)+2);}
const music={volume:1};
const c=vm.createContext({music,syncAudioControl(){}});
vm.runInContext('let _masterVol=.5,_sfxVol=.8,_musicVol=.2,_bgMusic=music,_gameMusic=null,_bh19TurnSong=null;'+['clampAudioPercent','applyAudioVolumes','setSfxVolume'].map(fn).join('\n'),c);
c.applyAudioVolumes();assert.equal(music.volume,.1);
c.setSfxVolume(0);assert.equal(music.volume,.1,'Effects remain independent of music');
vm.runInContext('_masterVol=0',c);c.applyAudioVolumes();assert.equal(music.volume,0);
console.log('PASS: game ambience disabled, control removed, music/effects/master preserved.');
