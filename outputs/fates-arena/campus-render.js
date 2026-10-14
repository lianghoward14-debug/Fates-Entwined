const CampusView=(()=>{
const TAU=Math.PI*2,camera={x:0,y:0},map=()=>Arena.map;let terrain=null;
function rect(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(x,y,w,h);}
function oval(g,x,y,rx,ry,c){g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();}
function line(g,pts,c,w){g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.beginPath();pts.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.stroke();}
function tree(g,x,y,r=35){
// Compact stepped canopy, dark pixel outline, bright leaf clusters, trunk and cast shadow.
const u=6,blocks=[4,8,10,12,14,14,14,12,10,8,6],cy=y-r*.28;
rect(g,x-2,cy+r*.52,r*.48,13,'#43533c');rect(g,x-r*.72,cy+r*.62,r*1.45,7,'#273e303b');
for(let row=0;row<blocks.length;row++){const n=blocks[row],yy=cy+row*u-30,xx=x-n*u/2;for(let col=0;col<n;col++){let edge=row===0||row===blocks.length-1||col===0||col===n-1;let color=edge?'#31583d':((col+row)%5===0?'#81a85c':(col<Math.floor(n*.35)?'#527e48':'#69934f'));rect(g,xx+col*u,yy,u,u,color);}}
for(const [dx,dy,c]of [[-18,-20,'#a0b96a'],[0,-27,'#91af61'],[18,-13,'#8cad5f'],[-24,1,'#78a054'],[7,8,'#83a95a'],[24,6,'#789b50']])rect(g,x+dx,y+dy,6,6,c);
}
function poly(g,pts,fill,stroke=null,width=1){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
function segmentDistance(x,y,a,b){let dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}
function building(g,b){const{x,y,w,h}=b;if(b.tower){
// Campanile, Berkeley's landmark tower: broad stepped base, pale stone shaft, open belfry and copper crown.
rect(g,x-22,y-2,w+45,20,'#514b3c32');rect(g,x+7,y+52,w-14,44,'#8e8068');rect(g,x+13,y+58,w-26,34,'#b7a88a');
rect(g,x+18,y-174,w-36,232,'#d4c9aa');rect(g,x+24,y-168,w-48,220,'#e6dcc0');rect(g,x+24,y-116,w-48,5,'#c1b497');rect(g,x+24,y-55,w-48,5,'#c1b497');
for(const xx of [x+27,x+w-31]){rect(g,xx,y-164,5,210,'#b7aa8e');rect(g,xx-2,y-113,8,6,'#b1a486');rect(g,xx-2,y-52,8,6,'#b1a486');}
rect(g,x+8,y-222,w-16,54,'#b9ac8c');rect(g,x+12,y-218,w-24,46,'#e7ddc1');for(let i=0;i<3;i++){const xx=x+20+i*19;rect(g,xx,y-208,10,31,'#536c69');rect(g,xx+3,y-205,2,26,'#c9c0a8');}
rect(g,x+3,y-229,w-6,8,'#ad9f81');rect(g,x-1,y-238,w+2,9,'#e1d6b8');poly(g,[[x+8,y-239],[x+w/2,y-275],[x+w-8,y-239]],'#738078','#53665e',2);rect(g,x+w/2-3,y-283,6,9,'#d3c7a7');
// Four clock faces make the belfry read clearly at the game's camera scale.
for(let i=0;i<4;i++){const xx=i===0?x+12:i===1?x+w-24:x+30,yy=i<2?y-205:y-148;oval(g,xx+10,yy+10,8,8,'#4f655f');oval(g,xx+10,yy+10,6,6,'#f0e7cf');line(g,[[xx+10,yy+10],[xx+10,yy+5]],'#52615a',1.5);line(g,[[xx+10,yy+10],[xx+14,yy+12]],'#52615a',1.2);}
for(let xx=x+17;xx<x+w-17;xx+=15)rect(g,xx,y+15,7,35,'#6d8178');return;}
// Each hall is drawn as a small architectural plan with roof, deep eaves, a formal entry and readable windows.
rect(g,x+18,y+25,w+8,h+13,'#233a3030');rect(g,x-9,y-7,w+18,h+16,'#aaa48e');rect(g,x-3,y-3,w+6,h+8,'#d4c9ad');rect(g,x,y,w,h,b.roof||'#a49883');
rect(g,x+2,y+2,w-4,7,'#f4e7c477');rect(g,x+2,y+9,6,h-13,'#f1e3c366');rect(g,x+w-8,y+9,6,h-13,'#736f5d55');rect(g,x+7,y+h-12,w-14,5,'#706b5944');rect(g,x+8,y+8,w-16,h-16,'#0000000b');rect(g,x+13,y+13,w-26,h-42,'#ffffff10');
// Broad, offset roof tiles read as hand-built pixel-art shingles at gameplay zoom.
const shingles=b.roof==='#687e89'?['#536e7a','#5f7983','#718994','#8197a0']:b.roof==='#b48468'?['#936b58','#a47761','#bb8d6d','#c99b75']:['#887765','#9b866e','#ad977b','#bba688'];for(let yy=y+12,row=0;yy<y+h-60;yy+=14,row++)for(let xx=x+10+(row%2)*11;xx<x+w-12;xx+=22){const ix=(Math.floor(xx/22)+row*3)%shingles.length;rect(g,xx,yy,19,10,shingles[ix]);rect(g,xx+2,yy+1,15,2,'#fff2d033');rect(g,xx+1,yy+9,17,2,'#443d3455');}for(let xx=x+24;xx<x+w-15;xx+=76)rect(g,xx,y+22,18,13,'#3f6264');
rect(g,x+11,y+h-47,w-22,37,'#c9bea4');rect(g,x+15,y+h-43,w-30,28,'#d9ceb3');
const count=Math.max(3,Math.floor(w/41)),step=(w-62)/(count-1);for(let i=0;i<count;i++){const xx=x+31+i*step;rect(g,xx-9,y+h-42,18,31,'#536d6a');rect(g,xx-6,y+h-39,4,25,'#92a69a');rect(g,xx+4,y+h-39,3,25,'#91a39a');rect(g,xx-10,y+h-44,20,3,'#e9dfc8');}
const cx=x+w/2;rect(g,cx-38,y+h-50,76,46,'#a69c83');rect(g,cx-31,y+h-48,62,42,'#ede3c9');for(let i=0;i<4;i++){const xx=cx-24+i*16;rect(g,xx,y+h-43,7,34,'#c2b69b');rect(g,xx+1,y+h-43,2,34,'#f0e5c8');}
rect(g,cx-48,y+h-5,96,9,'#92866e');rect(g,cx-56,y+h+4,112,7,'#c5b99b');
// Classical pediment, characteristic UC sandstone facade.
poly(g,[[cx-68,y+15],[cx,y-12],[cx+68,y+15]],'#d6c9a9','#a89d84',2);line(g,[[cx-68,y+16],[cx+68,y+16]],'#ede1c2',4);line(g,[[cx-52,y+22],[cx-52,y+h-50]],'#eee2c4',4);line(g,[[cx+52,y+22],[cx+52,y+h-50]],'#eee2c4',4);
rect(g,x+12,y+11,w-24,3,'#f1e7cf77');g.textAlign='center';g.fillStyle='#283d35';g.font='bold 12px Georgia';g.fillText(b.name.toUpperCase(),cx,y+h-53);}
function bed(g,x,y,w,h,tone='#547455'){rect(g,x,y,w,h,'#4c6242');rect(g,x+3,y+3,w-6,h-6,'#d1b47f');rect(g,x+7,y+7,w-14,h-14,'#587c4c');const cols=Math.max(3,Math.floor((w-18)/17)),rows=Math.max(1,Math.floor((h-15)/15));for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const xx=x+11+col*17+(row%2)*3,yy=y+10+row*15;rect(g,xx,yy+3,10,5,tone);rect(g,xx+2,yy,5,5,row%2?'#8bb45b':'#9cc365');rect(g,xx+1,yy+7,3,3,'#416844');if((row*cols+col)%3===0){rect(g,xx+3,yy-2,4,4,'#f4d577');rect(g,xx+2,yy-1,2,2,'#fff2c6');}}}
function bake(){const m=map(),c=document.createElement('canvas');c.width=m.width;c.height=m.height;const g=c.getContext('2d');rect(g,0,0,m.width,m.height,'#72965b');
// Quiet watercolor grain replaces the old square lawn grid.
let seed=731;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<2100;i++){const x=rand()*m.width,y=rand()*m.height,r=1+rand()*5;oval(g,x,y,r,r*.5,i%3?'#d2d0a012':'#304a3810');}
// Memorial Glade: broad lawn, an axial path, specimen trees and planted edges.
rect(g,805,112,880,486,'#83a65f');rect(g,824,130,842,452,'#a5c876');rect(g,837,144,816,424,'#95ba70');for(let i=0;i<5;i++){const yy=180+i*86;line(g,[[855,yy],[1632,yy]],i%2?'#d5dc9955':'#668a5544',3);}

// Strawberry Creek's lawns and formal garden beds.
rect(g,1840,1368,650,365,'#91b66d');for(let i=0;i<11;i++)bed(g,1900+(i%4)*135,1400+Math.floor(i/4)*83,85,45,i%2?'#4f8252':'#6c9956');
// Landscape islands around open plazas.
for(const b of [{x:795,y:760,w:95,h:42},{x:1510,y:765,w:118,h:40},{x:1480,y:965,w:38,h:96},{x:935,y:1312,w:105,h:35},{x:1650,y:1310,w:115,h:40},{x:910,y:600,w:92,h:30},{x:1480,y:600,w:92,h:30},{x:730,y:1510,w:88,h:38},{x:1820,y:1510,w:93,h:38}])bed(g,b.x,b.y,b.w,b.h);
const paths=[[[1200,1850],[1200,1420],[900,1300],[900,900],[900,580],[1250,580],[1250,90]],[[80,780],[860,780],[900,900],[1770,900],[2490,900]],[[1200,1450],[1800,1450],[2350,1500]],[[900,580],[1650,580],[2290,620]],[[1780,580],[1780,1060],[1690,1450]],[[270,780],[270,1350],[950,1350]],[[2350,620],[2350,1650]]];
// 16-bit grass tufts and tiny wildflowers keep the large lawns lively at camera scale.
for(let i=0;i<11800;i++){const gx=Math.floor(rand()*m.width/2)*2,gy=Math.floor(rand()*m.height/2)*2;if(paths.some(p=>p.some((pt,j)=>j&&segmentDistance(gx,gy,p[j-1],pt)<57)))continue;if(m.buildings.some(b=>gx>b.x-25&&gx<b.x+b.w+25&&gy>b.y-30&&gy<b.y+b.h+20))continue;if(gy>1350&&gy<1500&&gx<2480)continue;const flower=i%7===0,green=['#527b48','#67904c','#7da251','#8bab59'][i%4];rect(g,gx,gy,10,4,green);rect(g,gx+4,gy-3,5,3,i%3?'#71994d':'#96b85c');rect(g,gx+8,gy+3,4,3,'#4f7848');if(i%3===0)rect(g,gx+3,gy+4,3,3,'#b1c36c');if(flower){const bloom=['#f3d779','#fff0c2','#e9a5a0','#d6b8ee'][i%4];rect(g,gx+4,gy-3,4,4,bloom);rect(g,gx+2,gy-1,2,2,'#f5e8bb');}}
// Broad paved promenades with shaded kerbs, fine joints and a warm sandstone center.
for(const p of paths){line(g,p,'#50664a',98);line(g,p,'#9c7652',88);line(g,p,'#c19b67',78);line(g,p,'#d7b47b',68);line(g,p,'#e8ce9b',58);line(g,p,'#f1dcad',2);for(let j=1;j<p.length;j++){const a=p[j-1],b=p[j],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/(len||1),ny=dx/(len||1),count=Math.floor(len/28);for(let k=1;k<count;k++){const t=k/count,x=a[0]+dx*t,y=a[1]+dy*t;line(g,[[x-nx*28,y-ny*28],[x+nx*28,y+ny*28]],'#93765377',1.4);line(g,[[x-nx*23+2,y-ny*23+2],[x+nx*23+2,y+ny*23+2]],'#f5e2b466',1);}}}
// Main library forecourt and Sproul's large tiled plaza.
rect(g,900,1500,570,345,'#886b4d');rect(g,908,1508,554,329,'#cfad79');for(let y=1518;y<1830;y+=28)line(g,[[916,y],[1454,y]],'#9a795577',1.4);for(let x=924;x<1460;x+=36)line(g,[[x,1510],[x,1834]],'#f3d9a077',1.4);for(let y=1532;y<1820;y+=56)for(let x=940+(Math.floor(y/56)%2)*18;x<1450;x+=72)rect(g,x,y,3,3,'#f1d99a66');
// Stone planters, benches and a central plaza fountain.
for(const [x,y]of [[944,1550],[1425,1550],[944,1790],[1425,1790]]){rect(g,x-21,y-15,42,30,'#93896f');rect(g,x-17,y-11,34,22,'#6c8464');for(let i=0;i<5;i++)oval(g,x-11+i*5,y-1,4,5,['#7d946c','#a1aa76','#bdba82'][i%3]);}
oval(g,1185,1680,37,25,'#918c76');oval(g,1185,1676,31,19,'#88aba3');oval(g,1185,1673,6,6,'#e6e0c5');for(let i=0;i<3;i++){g.globalAlpha=.7-i*.17;g.strokeStyle=i===0?'#dce6cf':'#d8e4d055';g.lineWidth=1.4;g.beginPath();g.ellipse(1185,1676,18+i*9,10+i*6,0,0,TAU);g.stroke();}g.globalAlpha=1;
// Strawberry Creek: layered banks, clear blue-green water, meanders and small ripples.
const creek=[[2550,340],[2470,700],[2440,1070],[2330,1420],[2040,1480],[1810,1370],[1600,1390],[1390,1420],[1170,1400],[940,1430],[700,1390],[460,1440],[120,1400]];
line(g,creek,'#516746',74);line(g,creek,'#a28a5f',62);line(g,creek,'#24777a',49);line(g,creek,'#319496',38);line(g,creek,'#6eb6a2',28);line(g,creek,'#b6d79d',3);for(let i=0;i<90;i++){let u=i/90,j=Math.min(creek.length-2,Math.floor(u*(creek.length-1))),t=u*(creek.length-1)-j,a=creek[j],b=creek[j+1],x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;line(g,[[x-7,y-3],[x+8,y+2]],i%3?'#bce0a666':'#e6edb688',2);}
// Four stone bridges reconnect the lawns across the creek.
for(const x of [900,1200,1790,2350]){rect(g,x-58,1364,116,78,'#756f5b');rect(g,x-52,1367,104,70,'#d0c4a4');rect(g,x-44,1373,88,58,'#e2d7b8');for(let j=0;j<7;j++)line(g,[[x-45,1375+j*8],[x+45,1375+j*8]],'#b2a486',2);for(const side of [-1,1]){line(g,[[x+side*51,1370],[x+side*51,1436]],'#786f5b',4);line(g,[[x-side*51,1370],[x-side*51,1436]],'#786f5b',4);}}
// Sather Gate landmark at the southern entrance to campus.
for(const tx of [1090,1287]){rect(g,tx-5,1364,49,81,'#77705a');rect(g,tx,1355,39,83,'#b3a78b');rect(g,tx+5,1361,29,68,'#d8c9a7');rect(g,tx+10,1372,19,48,'#495c56');rect(g,tx+13,1374,13,42,'#263d39');rect(g,tx-5,1350,49,10,'#e5d9b9');rect(g,tx-2,1344,43,7,'#a29372');poly(g,[[tx-6,1344],[tx+19,1327],[tx+44,1344]],'#a99d7f','#82795f',2);rect(g,tx+16,1323,6,8,'#e3d4b2');rect(g,tx-1,1398,42,5,'#ddceaa');for(let k=0;k<4;k++)rect(g,tx+7+k*8,1380,2,34,'#7e8e7b');}
line(g,[[1128,1401],[1128,1366],[1306,1366],[1306,1401]],'#81775f',5);line(g,[[1132,1367],[1302,1367]],'#e0d3b1',3);
// Campus halls, set after the paths so the architecture has crisp edges.
for(const b of m.buildings)building(g,b);
// Gardens, forecourts, and rows of native-looking trees. Keep open lanes around landmarks.
for(let i=0;i<168;i++){const x=65+rand()*2470,y=70+rand()*1740;if(m.buildings.some(b=>x>b.x-80&&x<b.x+b.w+80&&y>b.y-295&&y<b.y+b.h+60))continue;if((x>795&&x<1690&&y>110&&y<600)||(x>900&&x<1475&&y>1490&&y<1850)||(x>1070&&x<1340&&y>1310&&y<1450))continue;let near=false;for(const p of paths){for(let j=1;j<p.length;j++)if(segmentDistance(x,y,p[j-1],p[j])<118){near=true;break;}if(near)break;}if(near||(x>1740&&x<2510&&y>1350&&y<1740))continue;tree(g,x,y,19+rand()*17);}
// Deliberate tree allees frame the major lawns and axial paths.
for(const x of [845,1640])for(let y=185;y<555;y+=72)tree(g,x,y,14+Math.floor((x+y)%4)*2);for(const y of [850,950])for(let x=1010;x<1660;x+=116)tree(g,x,y,15);for(const y of [1518,1810])for(let x=865;x<1470;x+=112)tree(g,x,y,13);
// Benches, bicycle racks, lamp posts and fine campus wayfinding.
for(let x=930;x<1450;x+=112)for(const y of [1560,1807]){line(g,[[x,y],[x+42,y]],'#6f644d',8);line(g,[[x+5,y+6],[x+5,y+15]],'#4c5c4e',3);line(g,[[x+37,y+6],[x+37,y+15]],'#4c5c4e',3);}
for(const [x,y]of [[830,690],[1025,690],[1485,690],[1680,720],[1000,1260],[1470,1260],[1930,800],[2230,1050],[560,1280],[780,1280],[1750,1060],[1860,1500]]){oval(g,x,y+8,10,5,'#283d3044');rect(g,x-2,y-20,4,24,'#657466');oval(g,x,y-22,5,5,'#f2e2ab');}
// Location names are framed like engraved bronze campus signs.
for(const p of m.locations){g.save();g.textAlign='center';g.font='bold 12px system-ui';const w=g.measureText(p.name).width+26;g.fillStyle='#263e35b8';g.beginPath();g.roundRect(p.x-w/2,p.y-16,w,24,5);g.fill();g.fillStyle='#eadfbe';g.fillText(p.name,p.x,p.y);g.restore();}
let light=g.createRadialGradient(1120,610,180,1120,650,1570);light.addColorStop(0,'#fff1c514');light.addColorStop(.58,'#fff0c505');light.addColorStop(1,'#172d332b');g.fillStyle=light;g.fillRect(0,0,m.width,m.height);
return c;}
function ground(g,s){if(!terrain)terrain=bake();g.save();g.imageSmoothingEnabled=false;g.drawImage(terrain,0,0,map().width,map().height);g.imageSmoothingEnabled=true;const creek=[[2550,340],[2470,700],[2440,1070],[2330,1420],[2040,1480],[1810,1370],[1600,1390],[1390,1420],[1170,1400],[940,1430],[700,1390],[460,1440],[120,1400]];g.save();g.globalCompositeOperation='screen';for(let i=0;i<38;i++){const u=((i/38+s.time*.014)%1),v=u*(creek.length-1),j=Math.min(creek.length-2,Math.floor(v)),t=v-j,a=creek[j],b=creek[j+1],x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,phase=s.time*2.4+i*2.17,alpha=.12+.14*(.5+.5*Math.sin(phase));g.globalAlpha=alpha;g.fillStyle=i%4?'#dcf4d7':'#fff0bf';g.beginPath();g.ellipse(x+Math.sin(phase)*6,y+Math.cos(phase*.8)*3,5+2*Math.sin(phase),1.3,.25,0,TAU);g.fill();}g.restore();g.restore();}
function follow(s){let f=s.fighters[0];camera.x=Math.max(0,Math.min(map().width-1200,f.x-600));camera.y=Math.max(0,Math.min(map().height-700,f.y-350));}
function minimap(g,s){g.save();let x=22,y=500,w=190,h=139;g.globalAlpha=.94;rect(g,x-8,y-28,w+16,h+36,'#0c2829');g.drawImage(terrain,x,y,w,h);g.font='10px system-ui';g.fillStyle='#e2e7c7';g.textAlign='left';g.fillText('CAMPUS MAP',x,y-10);let sx=w/map().width,sy=h/map().height;g.strokeStyle='#fff7d4';g.lineWidth=1;g.strokeRect(x+camera.x*sx,y+camera.y*sy,1200*sx,700*sy);for(const f of s.fighters){if(f.hp<=0)continue;oval(g,x+f.x*sx,y+f.y*sy,f.id===0?4:3,f.id===0?4:3,f.id===0?'#fff7b8':f.team===s.fighters[0].team?'#6bd7dc':'#ff797b');}g.restore();}
return {camera,ground,follow,minimap};})();
