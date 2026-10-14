const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-caribbea-game-style-samples.cjs','utf8');
const variants=[
 {id:'block_wire_parallel',name:'W1 · Taut double strand',path:'M4 22Q18 18 32 22T60 22 M4 42Q18 46 32 42T60 42 M15 16L23 27 M15 27L23 16 M41 16L49 27 M41 27L49 16 M15 36L23 47 M15 47L23 36 M41 36L49 47 M41 47L49 36'},
 {id:'block_wire_cross',name:'W2 · Crossed wire',path:'M7 9Q26 23 32 32T57 55 M7 55Q23 40 32 32T57 9 M14 12L14 23 25 22 M40 39L40 50 51 49 M14 41L24 42 24 53 M40 12L50 13 50 24'},
 {id:'block_wire_coil',name:'W3 · Concertina coil',path:'M4 38C8 5 29 7 28 32C27 56 8 57 8 32C8 8 42 7 43 32C44 56 23 57 23 32C23 8 58 8 58 32C58 57 38 56 38 32 M10 14L19 22 M10 22L19 14 M31 43L40 51 M31 51L40 43 M47 13L56 21 M47 21L56 13'}
];
source=source.replace(/const variants=\[[\s\S]*?\n\];/,'const variants='+JSON.stringify(variants)+';');
const start=source.indexOf("of [['revolutionary-overlays'");const end=source.indexOf(']]){const html',start);
if(start<0||end<0)throw Error('sample loop anchor');
source=source.slice(0,start)+"of [['barbed-wire-variants',variants,'Infantry of Havano · Barbed-wire variations','Persistent overlays · same game renderer, scale, line weight and glow',false"+source.slice(end);
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'barbed-wire-variants.cjs'});
