const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-chain-blockade.cjs','utf8');
source=source.replace(/const variants=\[[^\n]+;/,"const variants=[{id:'upper',name:'C9 · Upper restraint'},{id:'slant',name:'C10 · Slanted restraint'},{id:'lower',name:'C11 · Lower restraint'}];");
const start=source.indexOf(" if(kind==='block_cross'){");const end=source.indexOf('\n ctx.restore();',start);
source=source.slice(0,start)+String.raw`
 function smallLock(x,y){ctx.save();ctx.translate(x,y);ctx.scale(.48,.48);lock(0,0);ctx.restore();}
 // Four corner cinches leave the central activation area open.
 chain(t=>[-5+37*t,31-37*t],7);
 chain(t=>[88+37*t,-6+37*t],7);
 chain(t=>[-5+37*t,137+37*t],7);
 chain(t=>[88+37*t,174-37*t],7);
 if(kind==='upper'){
  chain(t=>[-5+130*t,24+7*Math.sin(t*Math.PI)],19);
  smallLock(106,26);
 }else if(kind==='slant'){
  chain(t=>[-5+130*t,137-24*t+3*Math.sin(t*Math.PI)],19);
  smallLock(108,113);
 }else{
  chain(t=>[-5+130*t,133+8*Math.sin(t*Math.PI)],19);
  smallLock(15,133);
 }
`+source.slice(end);
source=source.replace("'rgba(12,19,29,.25)'","'rgba(12,19,29,.10)'");
source=source.replace("'chain-blockade',variants,'Military Blockade · Chain designs','Full-card restraints · interlocking iron links, cold highlights and aged-brass locks'","'corner-cinch-variants',variants,'Corner cinches · One crossing chain','Three placements · the center remains open for activation overlays'");
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'corner-cinch-variants.cjs'});
