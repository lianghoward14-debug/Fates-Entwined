const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-chain-blockade.cjs','utf8');
source=source.replace(/const variants=\[[^\n]+;/,"const variants=[{id:'rim',name:'C4 · Iron perimeter'},{id:'corners',name:'C5 · Corner shackles'},{id:'rails',name:'C6 · Twin restraints'},{id:'drape',name:'C7 · Hanging chains'},{id:'diagonal',name:'C8 · Corner cinches'}];");
const start=source.indexOf(" if(kind==='block_cross'){");const end=source.indexOf('\n ctx.restore();',start);
source=source.slice(0,start)+String.raw`
 // All chain geometry stays outside the central overlay area.
 function smallChain(fn,count){ctx.save();const originalLink=link;chain(fn,count);ctx.restore();}
 function smallLock(x,y){ctx.save();ctx.translate(x,y);ctx.scale(.55,.55);lock(0,0);ctx.restore();}
 if(kind==='rim'){
  chain(t=>[7+106*t,7],15);chain(t=>[7+106*t,161],15);
  chain(t=>[7,15+138*t],20);chain(t=>[113,15+138*t],20);smallLock(60,154);
 }else if(kind==='corners'){
  for(const [x,y,sx,sy] of [[0,0,1,1],[120,0,-1,1],[0,168,1,-1],[120,168,-1,-1]]){
   chain(t=>[x+sx*(5+28*t),y+sy*6],5);
   chain(t=>[x+sx*6,y+sy*(5+32*t)],5);
   ctx.save();ctx.translate(x+sx*12,y+sy*12);ctx.scale(.48,.48);lock(0,0);ctx.restore();
  }
 }else if(kind==='rails'){
  chain(t=>[9+3*Math.sin(t*Math.PI*2),-6+180*t],25);
  chain(t=>[111-3*Math.sin(t*Math.PI*2),-6+180*t],25);
  smallLock(10,145);smallLock(110,145);
 }else if(kind==='drape'){
  chain(t=>[4+112*t,5+12*Math.sin(t*Math.PI)],17);
  chain(t=>[5+112*t,157+6*Math.sin(t*Math.PI)],17);
  chain(t=>[5+6*Math.sin(t*Math.PI),6+153*t],22);
  chain(t=>[115-6*Math.sin(t*Math.PI),6+153*t],22);
  smallLock(60,155);
 }else{
  chain(t=>[-5+44*t,38-44*t],9);
  chain(t=>[81+44*t,-6+44*t],9);
  chain(t=>[-5+44*t,130+44*t],9);
  chain(t=>[81+44*t,174-44*t],9);
  smallLock(17,15);smallLock(104,145);
 }
`+source.slice(end);
source=source.replace("'rgba(12,19,29,.25)'","'rgba(12,19,29,.10)'");
source=source.replace("const start=source.indexOf(\"of [['revolutionary-overlays'\");", "source=source.replace('.grid{display:flex;gap:20px}', '.grid{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}').replace('height:banners?320:495','height:930');\nconst start=source.indexOf(\"of [['revolutionary-overlays'\");");
source=source.replace("'chain-blockade',variants,'Military Blockade · Chain designs','Full-card restraints · interlocking iron links, cold highlights and aged-brass locks'","'chain-clear-center',variants,'Military Blockade · Chains with a clear center','Five edge-focused treatments · central space reserved for other card overlays'");
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'chain-clear-center.cjs'});
