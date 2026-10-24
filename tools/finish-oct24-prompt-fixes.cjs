const fs=require('node:fs');
for(const [file,from,to] of [
 ['index.html','06-rendering-and-helpers.js?v=20261024-merchant-mist','06-rendering-and-helpers.js?v=20261024-face-up'],
 ['src/scripts/authoritative-v3-single-player-adapter.mjs','authoritative-v3-single-player-screen.mjs?v=20261024-merchant','authoritative-v3-single-player-screen.mjs?v=20261024-emerald-handoff']
]){const s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw Error(file+' missing cache marker');fs.writeFileSync(file,s.replace(from,to));}
const dir='.tmp/saboteur-scores-release';
const p=dir+'/projections.mjs';
const old=fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const before="'outcome','completedHands'].includes(key)";
if(!old.includes(before))throw Error('Live projection patch did not match');
fs.writeFileSync(p,old.replace(before,"'outcome','completedHands','zoneScores'].includes(key)"));
fs.writeFileSync(dir+'/Dockerfile',`FROM ${fs.readFileSync(dir+'/base-image.txt','utf8').replace(/^\uFEFF/,'').trim()}\nCOPY projections.mjs /app/shared/engine/projections.mjs\nCOPY projections.mjs /app/public/shared/engine/projections.mjs\n`);
fs.writeFileSync(dir+'/fly.toml',fs.readFileSync('fly.toml','utf8').replace("dockerfile = 'Dockerfile.authority-v3-phase7-beta'","dockerfile = 'Dockerfile'"));
