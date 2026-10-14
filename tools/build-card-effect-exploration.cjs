const fs=require('fs'),vm=require('vm');
let source=fs.readFileSync('tools/build-caribbea-game-style-samples.cjs','utf8');
const variants=[{id:'frost',name:'E1 · Deep freeze'},{id:'rift',name:'E2 · Dimensional fracture'},{id:'flame',name:'E3 · Spectral inferno'},{id:'seal',name:'E4 · Arcane confinement'},{id:'vines',name:'E5 · Overgrown'}];
source=source.replace(/const variants=\[[\s\S]*?\n\];/,'const variants='+JSON.stringify(variants)+';');
const draw=String.raw`
function drawExplore(ctx,r,kind){
 ctx.save();roundedPath(ctx,0,0,120,168,4);ctx.clip();
 const line=(p,c,w=1.2,glow=3)=>{ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.strokeStyle=c;ctx.lineWidth=w;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor=c;ctx.shadowBlur=glow;ctx.stroke();ctx.shadowBlur=0;};
 const wash=c=>{ctx.fillStyle=c;ctx.fillRect(0,0,120,168);};
 if(kind==='frost'){
 wash('rgba(85,158,210,.18)');
 for(let j=0;j<15;j++){const x=j*9-5,h=14+(j*17%31);ctx.beginPath();ctx.moveTo(x-10,0);ctx.lineTo(x+3,h);ctx.lineTo(x+10,0);ctx.fillStyle='rgba(180,239,255,.65)';ctx.fill();line([[x-8,0],[x+3,h],[x+7,5]],'#d6f9ff',.7);ctx.beginPath();ctx.moveTo(x-9,168);ctx.lineTo(x,168-h*.8);ctx.lineTo(x+10,168);ctx.fill();}
 for(const side of [0,1])for(let j=0;j<6;j++){const x=side?120:0,y=28+j*24,d=side?-1:1;line([[x,y],[x+d*12,y+6],[x+d*22,y+4],[x+d*29,y+13]],'#c5f4ff',.9);line([[x+d*12,y+6],[x+d*14,y+18]],'#c5f4ff',.7);}
 }else if(kind==='rift'){
 wash('rgba(28,12,54,.16)');
 const p=[[72,-5],[61,26],[74,44],[49,74],[68,99],[48,123],[57,145],[41,173]];
 ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v[0]-5,v[1]):ctx.moveTo(v[0]-5,v[1]));[...p].reverse().forEach(v=>ctx.lineTo(v[0]+6,v[1]));ctx.closePath();ctx.fillStyle='#120d2c';ctx.fill();
 line(p.map(v=>[v[0]-5,v[1]]),'#bfa1ff',1.5,9);line(p.map(v=>[v[0]+6,v[1]]),'#82f4ee',1.1,7);
 for(let j=0;j<15;j++){const x=20+j*37%91,y=12+j*43%149;line([[x,y],[x+5,y-4],[x+8,y+3],[x,y]],j%2?'#ba99ff':'#92f1eb',.8,5);}
 }else if(kind==='flame'){
 wash('rgba(35,20,75,.20)');
 for(let j=0;j<11;j++){const x=j*12,h=23+j*23%61;ctx.beginPath();ctx.moveTo(x-14,173);ctx.bezierCurveTo(x-28,145,x+11,143-h,x+4,168-h);ctx.bezierCurveTo(x+31,139,x+10,147,x+16,173);const g=ctx.createLinearGradient(0,168-h,0,174);g.addColorStop(0,'rgba(169,223,255,.06)');g.addColorStop(.55,'rgba(119,92,245,.65)');g.addColorStop(1,'rgba(64,224,236,.8)');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#9fcfff';ctx.lineWidth=.7;ctx.shadowColor='#7d92ff';ctx.shadowBlur=6;ctx.stroke();}
 for(let j=0;j<22;j++){ctx.fillStyle=j%2?'#b7faff':'#b496ff';ctx.beginPath();ctx.arc(6+j*37%109,35+j*41%114,.6+j%3*.25,0,7);ctx.fill();}
 }else if(kind==='seal'){
 wash('rgba(53,15,46,.22)');ctx.strokeStyle='#edb19c';ctx.shadowColor='#ec779d';ctx.shadowBlur=5;ctx.lineWidth=.8;
 for(const radius of [43,49,55]){ctx.beginPath();ctx.arc(60,84,radius,0,Math.PI*2);ctx.stroke();}
 const p=Array.from({length:6},(_,i)=>{const a=-Math.PI/2+i*Math.PI*4/5;return[60+42*Math.cos(a),84+42*Math.sin(a)];});line(p,'#ffd2a3',.9,5);
 for(let i=0;i<16;i++){ctx.save();ctx.translate(60,84);ctx.rotate(i*Math.PI/8);line([[-2,-51],[-2,-47],[2,-49],[2,-52]],'#ffd8b5',.8,2);ctx.restore();}
 for(const [x,y] of [[7,7],[113,7],[7,161],[113,161]]){line([[x,84],[60,y]],'rgba(242,171,147,.65)',.65,3);}
 }else{
 wash('rgba(21,48,24,.12)');
 function vine(side){const x=side?113:7,d=side?-1:1;const pts=Array.from({length:45},(_,i)=>[x+Math.sin(i*.24)*7,i*4-4]);line(pts,'#253724',4,0);line(pts,'#8aaf69',1.7,2);for(let i=0;i<10;i++){const y=i*18+6,bx=x+Math.sin(y*.06)*7;ctx.save();ctx.translate(bx,y);ctx.rotate(d*(i%2?.7:-.7));ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(d*19,-14,d*25,-3);ctx.quadraticCurveTo(d*15,8,0,0);ctx.fillStyle=i%2?'#719653':'#355e41';ctx.fill();line([[0,0],[d*21,-3]],'#bad087',.65,0);ctx.restore();}}
 vine(0);vine(1);line([[-4,149],[23,140],[49,144],[74,133],[99,140],[124,127]],'#99b274',2,1);
 for(const [x,y] of [[16,40],[104,119],[27,141]]){for(let i=0;i<5;i++){ctx.fillStyle='#d6b3d5';ctx.beginPath();ctx.ellipse(x+Math.cos(i*1.256)*3,y+Math.sin(i*1.256)*3,2,3,i*1.256,0,7);ctx.fill();}ctx.fillStyle='#ffdb83';ctx.beginPath();ctx.arc(x,y,1.8,0,7);ctx.fill();}
 }
 ctx.restore();
}
`;
source=source.replace('const renderer=palette','const exploreDraw='+JSON.stringify(draw)+';\nconst renderer=palette');
source=source.replace("+fn('drawEffectFlashCardOverlay');","+fn('drawEffectFlashCardOverlay')+exploreDraw;");
source=source.replace('drawEffectFlashCardOverlay(ctx,{x:0,y:0,w:120,h:168},v.id);','drawExplore(ctx,{x:0,y:0,w:120,h:168},v.id);');
source=source.replace("'Remains while consolidation is blocked'","'Full-card effect concept'");
source=source.replace('.grid{display:flex;gap:20px}', '.grid{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}');
source=source.replace('height:banners?320:495','height:930');
const start=source.indexOf("of [['revolutionary-overlays'");const end=source.indexOf(']]){const html',start);
source=source.slice(0,start)+"of [['card-effect-exploration',variants,'Full-card effects · Five new directions','Frost, fractured space, spectral fire, arcane geometry and living growth',false"+source.slice(end);
vm.runInNewContext(source,{require,console,process,__dirname},{filename:'card-effect-exploration.cjs'});
