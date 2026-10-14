const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-caribbea-game-style-samples.cjs','utf8');
const variants=[{id:'block_wrap',name:'F1 · Wrapped in wire'},{id:'block_perimeter',name:'F2 · Sealed perimeter'},{id:'block_mesh',name:'F3 · Wire mesh'}];
source=source.replace(/const variants=\[[\s\S]*?\n\];/,'const variants='+JSON.stringify(variants)+';');
const draw=String.raw`
function drawFullBlockade(ctx,r,kind){
 ctx.save();roundedPath(ctx,r.x,r.y,r.w,r.h,4);ctx.clip();
 ctx.fillStyle='rgba(27,18,15,.23)';ctx.fillRect(0,0,r.w,r.h);
 function wire(points,barbs=true){
  for(const [color,width,blur] of [['rgba(20,14,12,.9)',3.6,0],['#d6b78a',1.25,3]]){
   ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowColor='#ecb36c';ctx.shadowBlur=blur;ctx.lineCap='round';
   ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();
   if(barbs)for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;for(let d=12;d<len;d+=24){const x=a[0]+ux*d,y=a[1]+uy*d;ctx.beginPath();ctx.moveTo(x-ux*3-uy*4,y-uy*3+ux*4);ctx.lineTo(x+ux*3+uy*4,y+uy*3-ux*4);ctx.moveTo(x-ux*3+uy*4,y-uy*3-ux*4);ctx.lineTo(x+ux*3-uy*4,y+uy*3+ux*4);ctx.stroke();}}
  }
 }
 if(kind==='block_wrap'){
  wire([[-6,29],[36,54],[83,65],[127,89]]);wire([[-6,35],[36,60],[83,71],[127,95]],false);
  wire([[-7,128],[36,112],[82,108],[127,85]]);wire([[-7,134],[36,118],[82,114],[127,91]],false);
  wire([[18,-8],[26,40],[17,99],[31,176]]);
 }else if(kind==='block_perimeter'){
  ctx.fillStyle='rgba(61,28,17,.28)';ctx.fillRect(0,0,120,12);ctx.fillRect(0,156,120,12);ctx.fillRect(0,0,12,168);ctx.fillRect(108,0,12,168);
  wire([[8,8],[112,8],[112,160],[8,160],[8,8]]);
  wire([[3,3],[117,3],[117,165],[3,165],[3,3]],false);
  for(const [x,y] of [[8,8],[112,8],[112,160],[8,160]]){ctx.fillStyle='#241b15';ctx.strokeStyle='#d6b78a';ctx.lineWidth=1.2;ctx.shadowBlur=3;ctx.beginPath();ctx.arc(x,y,3.7,0,Math.PI*2);ctx.fill();ctx.stroke();}
 }else{
  for(let x=-150;x<180;x+=34)wire([[x,0],[x+168,168]],false);
  for(let x=-50;x<300;x+=34)wire([[x,0],[x-168,168]],false);
  wire([[-3,42],[123,42]]);wire([[-3,125],[123,125]]);
 }
 ctx.restore();
}
`;
source=source.replace("const renderer=palette",'const fullDraw='+JSON.stringify(draw)+';\nconst renderer=palette');
source=source.replace("+fn('drawEffectFlashCardOverlay');","+fn('drawEffectFlashCardOverlay')+fullDraw;");
source=source.replace('drawEffectFlashCardOverlay(ctx,{x:0,y:0,w:120,h:168},v.id);','drawFullBlockade(ctx,{x:0,y:0,w:120,h:168},v.id);');
const start=source.indexOf("of [['revolutionary-overlays'");const end=source.indexOf(']]){const html',start);
source=source.slice(0,start)+"of [['full-card-blockade',variants,'Military Blockade · Full-card effects','Persistent wire treatment across the card · no central icon',false"+source.slice(end);
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'full-card-blockade.cjs'});
