const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-chain-blockade.cjs','utf8');
source=source.replace(/const variants=\[[^\n]+;/,"const variants=[{id:'parallel',name:'C12 · Parallel cinches'},{id:'opposed',name:'C13 · Opposing cinches'},{id:'lowcross',name:'C14 · Low crossed chains'}];");
const start=source.indexOf(" if(kind==='block_cross'){");const end=source.indexOf('\n ctx.restore();',start);
source=source.slice(0,start)+String.raw`
 // Corner cinches and exactly two full-width diagonal strands; no locks.
 chain(t=>[-5+37*t,31-37*t],7);
 chain(t=>[88+37*t,-6+37*t],7);
 chain(t=>[-5+37*t,137+37*t],7);
 chain(t=>[88+37*t,174-37*t],7);
 if(kind==='parallel'){
  chain(t=>[-5+130*t,41-24*t],19);
  chain(t=>[-5+130*t,145-24*t],19);
 }else if(kind==='opposed'){
  chain(t=>[-5+130*t,15+25*t],19);
  chain(t=>[-5+130*t,145-25*t],19);
 }else{
  chain(t=>[-5+130*t,116+35*t],19);
  chain(t=>[-5+130*t,151-35*t],19);
 }
`+source.slice(end);
source=source.replace("'rgba(12,19,29,.25)'","'rgba(12,19,29,.10)'");
source=source.replace("'chain-blockade',variants,'Military Blockade · Chain designs','Full-card restraints · interlocking iron links, cold highlights and aged-brass locks'","'double-diagonal-chains',variants,'Corner cinches · Two diagonal chains','No locks · central activation area kept clear'");
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'double-diagonal-chains.cjs'});
