const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-caribbea-game-style-samples.cjs','utf8');
const variants=[{id:'block_cross',name:'C1 · Iron arrest'},{id:'block_bind',name:'C2 · Bound in chains'},{id:'block_cage',name:'C3 · Hanging cage'}];
source=source.replace(/const variants=\[[\s\S]*?\n\];/,'const variants='+JSON.stringify(variants)+';');
const draw=String.raw`
function drawChainBlockade(ctx,r,kind){
 ctx.save();roundedPath(ctx,0,0,120,168,4);ctx.clip();ctx.fillStyle='rgba(12,19,29,.25)';ctx.fillRect(0,0,120,168);
 function link(x,y,a,n){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.shadowColor='#05080e';ctx.shadowBlur=2;ctx.shadowOffsetY=1.2;const w=n%2?2.5:4.5;ctx.beginPath();ctx.roundRect(-6,-w,12,w*2,w);ctx.strokeStyle='#111722';ctx.lineWidth=3.6;ctx.stroke();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle=n%2?'#8295a9':'#d1dae1';ctx.lineWidth=1.8;ctx.stroke();ctx.beginPath();ctx.moveTo(-3,-w+.5);ctx.lineTo(2,-w+.5);ctx.strokeStyle='#f0e7cf';ctx.lineWidth=.6;ctx.stroke();ctx.restore();}
 function chain(fn,count){for(let i=0;i<count;i++){const t=i/(count-1),p=fn(t),p2=fn(Math.min(1,t+.002)),p0=fn(Math.max(0,t-.002));link(p[0],p[1],Math.atan2(p2[1]-p0[1],p2[0]-p0[0]),i);}}
 function lock(x,y){ctx.save();ctx.translate(x,y);ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.strokeStyle='#10151e';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-7,-3);ctx.lineTo(-7,-10);ctx.arc(0,-10,7,Math.PI,0);ctx.lineTo(7,-3);ctx.stroke();ctx.strokeStyle='#c4d2da';ctx.lineWidth=2.4;ctx.stroke();ctx.fillStyle='#443e33';ctx.strokeStyle='#d3b884';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-12,-3,24,22,3);ctx.fill();ctx.stroke();ctx.fillStyle='#0a1019';ctx.beginPath();ctx.arc(0,5,2.5,0,Math.PI*2);ctx.fill();ctx.fillRect(-1.3,5,2.6,7);ctx.restore();}
 if(kind==='block_cross'){
  chain(t=>[-8+136*t,-5+178*t],25);chain(t=>[128-136*t,-5+178*t],25);lock(60,79);
 }else if(kind==='block_bind'){
  chain(t=>[-6+132*t,38+22*Math.sin(t*Math.PI)],19);
  chain(t=>[-6+132*t,89+22*Math.sin(t*Math.PI)],19);
  chain(t=>[-6+132*t,133+16*Math.sin(t*Math.PI)],19);
  chain(t=>[19+7*Math.sin(t*Math.PI*3),-7+182*t],24);
  lock(98,102);
 }else{
  for(const x of [14,44,76,106])chain(t=>[x+3*Math.sin(t*Math.PI),-7+180*t],24);
  chain(t=>[-4+128*t,14+10*Math.sin(t*Math.PI)],19);
  chain(t=>[-4+128*t,150+10*Math.sin(t*Math.PI)],19);
  for(const x of [14,44,76,106]){ctx.fillStyle='#313d4d';ctx.strokeStyle='#bbcad7';ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(x-5,4,10,7,2);ctx.fill();ctx.stroke();}
 }
 ctx.restore();
}
`;
source=source.replace('const renderer=palette','const chainDraw='+JSON.stringify(draw)+';\nconst renderer=palette');
source=source.replace("+fn('drawEffectFlashCardOverlay');","+fn('drawEffectFlashCardOverlay')+chainDraw;");
source=source.replace('drawEffectFlashCardOverlay(ctx,{x:0,y:0,w:120,h:168},v.id);','drawChainBlockade(ctx,{x:0,y:0,w:120,h:168},v.id);');
const start=source.indexOf("of [['revolutionary-overlays'");const end=source.indexOf(']]){const html',start);
source=source.slice(0,start)+"of [['chain-blockade',variants,'Military Blockade · Chain designs','Full-card restraints · interlocking iron links, cold highlights and aged-brass locks',false"+source.slice(end);
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'chain-blockade.cjs'});
