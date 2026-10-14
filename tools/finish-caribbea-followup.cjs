const fs=require('fs');
const names=['src/styles/ledger-archive.css','src/styles/zz-codex-last.css','src/scripts/01-data-and-state.js','src/scripts/05-gameplay-core.js','src/scripts/06-rendering-and-helpers.js','src/scripts/08-audio-and-meta-ui.js','src/scripts/51-ledger-archive.js','src/scripts/render-v2/04-match-renderer-adapter.js','src/scripts/render-v2/19-approved-activation-sfx.js'];
let html=fs.readFileSync('index.html','utf8');
for(const name of names){const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');html=html.replace(new RegExp(escaped+'\\?v=[^"\\s]+','g'),name+'?v=20261014-blockade-opponent-turns');}
fs.writeFileSync('index.html',html);
for(const name of names.filter(x=>x.endsWith('.js')))new(require('vm').Script)(fs.readFileSync(name,'utf8'),{filename:name});
console.log('Updated asset versions; all edited classic scripts parse.');
