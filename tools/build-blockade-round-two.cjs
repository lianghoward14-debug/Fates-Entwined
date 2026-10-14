const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-caribbea-game-style-samples.cjs','utf8');
const variants=[
 {id:'block_wire',name:'H4 · Barbed wire',path:'M5 23C19 11 44 35 59 23 M5 43C19 31 44 55 59 43 M14 15L22 27 M13 26L23 16 M39 17L47 29 M38 28L48 18 M15 35L23 47 M14 46L24 36 M40 37L48 49 M39 48L49 38'},
 {id:'block_hedgehog',name:'H5 · Tank obstacle',path:'M13 10L54 51 M8 15L49 56 M10 50L51 9 M15 55L56 14 M7 32H57 M7 38H57'},
 {id:'block_gatehouse',name:'H6 · Checkpoint gate',path:'M8 55V21H17V55 M47 55V21H56V55 M8 21V13H17V21 M47 21V13H56V21 M18 25H46V37H18 M23 26L32 36 M36 26L45 36 M25 38V52 M39 38V52'}
];
source=source.replace(/const variants=\[[\s\S]*?\n\];/,'const variants='+JSON.stringify(variants)+';');
const start=source.indexOf("of [['revolutionary-overlays'");const end=source.indexOf(']]){const html',start);
if(start<0||end<0)throw Error('sample loop anchor');
source=source.slice(0,start)+"of [['blockade-round-two',variants,'Infantry of Havano · More blockade samples','Persistent overlays · same game renderer, scale, line weight and glow',false"+source.slice(end);
vm.runInNewContext(source,{require,console,process,__dirname:__dirname},{filename:'blockade-round-two.cjs'});
let index=fs.readFileSync('index.html','utf8');
for(const name of ['06-rendering-and-helpers.js','04-match-renderer-adapter.js','zz-codex-last.css']) index=index.replace(new RegExp('('+name.replaceAll('.','\\.')+'\\?v=)[^"\\s]+','g'),'$120261014-revolution-flame-r2');
fs.writeFileSync('index.html',index);
