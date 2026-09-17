(function(){'use strict';if(window.FateSignatureActivationFx)return;
const studies={
"15":["15","Zsofia Szocs","Blue Danube Waltz","The embroidered rosette blooms","approved","#daa6ba",2000],
"34":["34","Rozsi Szocs","Hungarian Dance","The Hungarian dancing silhouettes","approved","#d88b94",2000],
"55":["55","Bobby Jones","Cosmic Convergence","The four-arm spiral galaxy","approved","#a5bde9",2000],
"85":["85","Felicyta Janowicz (Specters)","A Specter’s Lament","Three ghosts rise","approved","#b0d6dc",2000],
"36":["36","Marie L’amboure","Deterrance","Three shields lock together","approved","#afc7be",2000],
"bh02":["bh02","Joie","Thousand Reel Stare","Instagram comes into focus","approved","#dc9bbb",2000],
"bh08":["bh08","Maja Kaminska (University)","Mischievous Activities","The smirk breaks into laughter","approved","#e2b68d",2000],
"57":["57","Jeremiah Jones","ALPINE, The Future","The alpine clockwork","approved","#b5c0e3",2000],
"12":["12","Makenna","Robo en la Noche","The winged military insignia","approved","#b3c59d",2000],
"23":["23","Cathy","Cardigan Onslaught","The geometric fan unfolds","approved","#d9aac9",2000],
"41":["41","Jimmy","A True Incel’s Wrath","The fractured reflection","approved","#d393a7",2000],
"89":["89","Zsofia Szocs (Youth)","Terrible Twins: Diva","The frost-set tiara","approved","#d1b0e4",2000],
"35":["35","Alexander the Magnificient","Hellenic Glory","The shield and growing laurels","approved","#e2af79",2000],
"88":["88","Rozsi Szocs (Youth)","Terrible Twins: Toy Sword","A Carpathian winter tale","approved","#a9c8e9",2000],
"11":["11","Anne Stone","Coordination","Three treaties fall into place","approved","#99d5d0",2000],
"46":["46","Phil","The Monarchist Manifesto","The crowned empire rises","approved","#c0a5e4",2000],
"10":["10","Post-Modernist Dylan","Esoteric Annihilation","Six fragments collapse","approved","#c99ae9",2000],
"19":["19","Květka Svoboda","The Vltava’s Story","The bridge over the Vltava","approved","#a0d5bc",2000],
"bh12":["bh12","Louis LeJeune","The Flower King","The seven-petal coronation","approved","#b5d790",2000],
 "01":["01","Felicyta Janowicz","The White Eagle","The eagle claims the crown","approved","#fff0ef",2000],
 "bh07":["bh07","Agent-K","Overclock","The core goes live","approved","#b5c8f2",2000],
 "bh11":["bh11","Felicyta Janowicz (University)","Superior Marks","The sealed accord","approved","#f3e7e4",2000],
 "45":["45","Chingachlook","The Last Mohican","Sunset over the mountains","approved","#c6baaa",2000],
 "02":["02","Anicka Konvicka","The Starlit Path","The starlit orbit","approved","#a9d8f4",2000],
 "86":["86","Boleslaw Kopewicz","A Bombastic Character","Cascading fireworks","approved","#eab2ec",2000],
 "bh04":["bh04","Anicka Konvicka (Selva Island)","The Destruction of Paradise","Eye of the maelstrom","approved","#8fd9ed",2000],
 "bh20":["bh20","Makenna (Bird Cult)","Thousand Year Bird Cult","Three birds in flight","approved","#acd9ed",2000],
 "bh19":["bh19","Abed","High-T","Double charge","approved","#b9dfa1",2000],
 "bh01":["bh01","Anicka Konvicka (Voyager)","Brave Horizons","A voyage at sunrise","approved","#a4dede",2000],
 "14":["14","Alondra Hopkins","Clear the perimeter","Spear impact","approved","#eea697",2000],
 "bh09":["bh09","Alondra Hopkins (Mercenary)","The Child of War","Spear orbit","approved","#eea697",2000],
 "66":["66","Mark Menz","Beyond Drawings","The seal of allegiance","approved","#beb5ef",2000],
 "87":["87","Květka Svoboda (Ukulele)","A Noble Effort at a Ballad","The written melody","approved","#c7dfa1",2000],
 "67":["67","Mr. Secules","You Just Said Nothing","You just said nothing","approved","#efa899",2000],
 "bh21":["bh21","Oktai","The Vast Taklamakan","The high desert sun","approved","#e9b77a",2000],
 "38":["38","Jake","I'm Fat","The perfect stack","approved","#edbd82",2000],
 "bh22":["bh22","Jaime","A Moonlit Shore","The healing crescent","approved","#a1d7ee",2000],
 "56":["56","Lydia","Berknomaly!?@#","Sever the spell","approved","#ef6571",2000],
 "bh05":["bh05","Taylor","The Art of Mimicry","The unfolding double","approved","#b6a9ec",2000],
 "bh13":["bh13","Hugh Roberts","Smart Investments","The gilded portfolio","approved","#b7dfa7",2000],
 "13":["13","Johnathan Kirby","The Christmas Day Charter","Signed Christmas Charter","approved","#ecd09a",2000],
 "bh10":["bh10","Francisek","Chauffeur","A passenger from the catalog","approved","#b4dddf",2000],
 "bh14":["bh14","Chloe Kirk","Charter of the United Nations","One declaration, many cards","approved","#a3c8f4",2000],
 "07":["07","Maja Kaminska","Oblique Order","Tank advance","approved","#b6d9de",2000],
 "82":["82","Felicyta Janowicz (Youth)","A Quaint Polish Village","The snowflake mechanism","approved","#a6dfff",2000],
 "bh06":["bh06","Achille Laurent","Adaptive Tactics","Three adaptive tokens","approved","#a9c9ef",2000],
 "bh16":["bh16","Li-Hua (Battle-Ready)","Storm of Ten Thousand Blades","Storm of blades","approved","#82cfff",2000],
 "21":["21","Henry Dong","The Last Revolution","Break the chain","approved","#ee847c",2000],
 "29":["29","Dylan Kirby","Leader of the Free World","Wings of the free world","approved","#89bfff",2000],
 "30":["30","Santiago","El Matador del Mares","The piercing tide","approved","#fa8e83",2000],
 "84":["84","Květka Svoboda (Youth)","Flower Picking","The snowflake mechanism","approved","#c6e9a0",2000],
 "99":["99","Rozsi and Zsofia (Youth)","The Blame Game","The accusation scales","approved","#d4acfa",2000],
 '08':['08','Lina','Autistic Femcel Rizz','Reality Aperture','glitch','#c5a1ff',2000],
 '43':['43','Mark Kemper','Elephant Movie 2',"An impossible elephant",'approved','#f1c68d',2000],
 '51':['51','Rivera','Jorge’s Right Hand Man',"The binding promise",'approved','#7ed6c0',2000],
 '81':['81','Wojciech','Pierogi Barrage',"Fold, crimp, scatter",'approved','#f3cc8b',2000],
 '83':['83','Sebastyen Janowicz','Visegrad',"Pillars of Visegrad",'approved','#e4a3aa',2000],
 '90':['90','Wojciech (Fisherman)','Catch of the Day',"The constellation net",'approved','#80d9d4',2000],
 '03':['03','Howard','Moffitt Inspiration','Tactical Bloom','tactical','#e9c875',2000],
 '06':['06','Jorge Alvarez','The West Caribbea Trading Company','Mariner’s Compass','compass','#7fe2d5',2000],
 '22':['22','Isaac Perez','Down for the Count','Excited nucleus','approved','#77b8ff',2000],
 '27':['27','Kazumi','Fables of the Old Age','The Living Storybook','book','#eac989',2000],
 '40':['40','Christopher Erbs','Hard Times, Strong Men','Tempered Resolve','anvil','#f1a879',2000],
 '48':['48','Cosmic GF','The Kitchen at the End of Time','Galactic Breakfast','cosmic','#bc9bf2',2000]
};
const cardPalettes={"13":["#edb052","#ffdf9b"],"14":["#d68c9d","#ead1c0"],"17":["#b9d675","#f3e8b8"],"21":["#db6871","#ead4bb"],"22":["#e4c659","#a7d9f1"],"29":["#8cacd2","#ecbfc3"],"30":["#cedee4","#e5a48f"],"38":["#ed9e60","#eccc8e"],"39":["#dbc477","#92cbbd"],"40":["#bfc575","#e6a367"],"43":["#81b5df","#d2e6f5"],"45":["#d7b196","#edbe7d"],"48":["#ae99dc","#a2d2e6"],"51":["#88d19d","#d8edac"],"56":["#719ce8","#eed075"],"66":["#cbd170","#eece9c"],"67":["#b89de2","#d7e4fc"],"81":["#b5cd8a","#efd4a1"],"82":["#8bb8df","#e1efff"],"83":["#a8c878","#dfddb0"],"87":["#cf9dcd","#e8c58e"],"90":["#78acd1","#bae0db"],"99":["#e1a581","#f0d29e"],"01":["#fff1ee","#e25b65"],"bh11":["#f2ede8","#c74858"],"bh07":["#b4c4f0","#80d2db"],"02":["#77d6e3","#d9f1f2"],"03":["#e1ac56","#e7d1b3"],"04":["#b594ed","#e5c9ff"],"07":["#799feb","#d3e3f6"],"08":["#edce61","#a9d3f0"],"bh04":["#8faec9","#dcb184"],"bh05":["#d296ad","#e0bea5"],"bh06":["#8faeee","#dca6a2"],"bh09":["#b8d48e","#e6d9a6"],"bh10":["#8abea1","#ccd4b1"],"bh13":["#d2ad7a","#eed6a3"],"bh14":["#8caaeb","#bddff1"],"bh16":["#82cfff","#b2bff5"],"bh20":["#c2dbea","#e8ce9e"],"bh22":["#b8a1ec","#92cde9"]};
function mount(overlay,card,options){const id=String(card?.id||''),study=studies[id];if(!study||options?.perfLite)return null;
try{if(document.documentElement.classList.contains('fate-reduced-motion')||localStorage.getItem('fateReducedMotion')==='1'||matchMedia?.('(prefers-reduced-motion: reduce)').matches)return null;}catch(e){}
const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return null;
 canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none';
const previous=[...overlay.childNodes];overlay.replaceChildren(canvas);overlay.dataset.signatureActivation=id;
overlay.style.background='transparent';
let raf=0,disposed=false,started=false,start=0,signatureSound=null;
 function resize(){const vw=Math.max(320,overlay.clientWidth||innerWidth||700),vh=Math.max(240,overlay.clientHeight||innerHeight||430),scale=Math.min(vw/700,vh/430),dpr=Math.min(3,devicePixelRatio||1),renderScale=scale*dpr;canvas.style.width=Math.round(700*scale)+'px';canvas.style.height=Math.round(430*scale)+'px';canvas.width=Math.round(700*renderScale);canvas.height=Math.round(430*renderScale);ctx.setTransform(renderScale,0,0,renderScale,0,0)}
const PI=Math.PI,TAU=PI*2,clamp=x=>Math.max(0,Math.min(1,x)),seg=(t,a,b)=>clamp((t-a)/(b-a)),ease=t=>1-Math.pow(1-clamp(t),3);
let t=0,W=700,H=430;
 function line(pts,col,a=1,width=1.5,close=false,fill=false){ctx.save();ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(close)ctx.closePath();ctx.globalAlpha=clamp(a*.34);ctx.lineWidth=width+4;ctx.shadowColor=col;ctx.shadowBlur=7;if(fill)ctx.fill();else ctx.stroke();ctx.globalAlpha=clamp(Math.min(1,a*1.2));ctx.lineWidth=Math.max(1,width);ctx.shadowBlur=0;if(fill)ctx.fill();else ctx.stroke();ctx.restore();}
 function ring(x,y,rx,ry,col,a=1,rot=0,start=0,end=TAU){ctx.save();ctx.strokeStyle=col;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot,start,end);ctx.globalAlpha=clamp(a*.32);ctx.lineWidth=5.5;ctx.shadowColor=col;ctx.shadowBlur=7;ctx.stroke();ctx.globalAlpha=clamp(Math.min(1,a*1.2));ctx.lineWidth=1.6;ctx.shadowBlur=0;ctx.stroke();ctx.restore();}
function glow(x,y,r,col,a){if(r<=0||a<=0)return;ctx.save();ctx.globalAlpha=clamp(a);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(.16,col+'99');g.addColorStop(1,col+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}
function spark(x,y,r,u,col,n=36){if(u<=0||u>=1)return;for(let i=0;i<n;i++){const a=i*2.39996,rr=r*(.25+(i%7)/7)*ease(u);const xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr;line([[xx,yy],[xx-Math.cos(a)*6*(1-u),yy-Math.sin(a)*6*(1-u)]],col,Math.sin(u*PI),i%5===0?2:1);}}
function path(fn,end,col,alpha=1,width=1.5,start=0){let pts=[];for(let j=0;j<=45;j++)pts.push(fn(start+(end-start)*j/45));line(pts,col,alpha,width);}
function polygon(x,y,r,n,rot,col,a){let pts=[];for(let j=0;j<n;j++)pts.push([x+Math.cos(j*TAU/n+rot)*r,y+Math.sin(j*TAU/n+rot)*r]);line(pts,col,a,1.5,true);}
function txt(s,x,y,size,col,a=1){ctx.save();ctx.globalAlpha=clamp(a);ctx.fillStyle=col;ctx.font=size+'px Georgia';ctx.textAlign='center';ctx.fillText(s,x,y);ctx.restore();}
function frame(x,y,w,h,col,a){line([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],col,a,1.5,true);}
function draw(){const d=study,k=d[4],col=cardPalettes[id]?.[0]||d[5],gold=cardPalettes[id]?.[1]||'#efd29a',x=W/2,y=H*.50,s=Math.min(82,W*.235)*(["03","27","48"].includes(id)?1.45:1),a=ease(seg(t,0,.2))*(1-ease(seg(t,.8,1))),u=ease(seg(t,.08,.58));ctx.clearRect(0,0,W,H);

if(false){ring(x,y,s*.7,s*.7,col,.65);txt('ACTIVATE EFFECT',x,y+5,18,gold);return;}
if(window.FateApprovedActivationArt?.handles(id)){window.FateApprovedActivationArt.draw(ctx,id,t,W,H);return;}
glow(x,y,s*1.9,col,a*.13);
if(k==='pierogi'){
 for(let j=0;j<7;j++){const v=seg(t,.04+j*.045,.62+j*.035),xx=x-s*1.2+v*s*2.4,yy=y+(j%3-1)*s*.38-Math.sin(v*PI)*s*.65;ctx.save();ctx.translate(xx,yy);ctx.rotate(v*2+j*.4);ring(0,0,17,11,col,a,0,0,PI);line([[-17,0],[17,0]],gold,a,2);for(let n=0;n<5;n++){const z=(n+.5)*PI/5;line([[Math.cos(z)*14,Math.sin(z)*8],[Math.cos(z)*18,Math.sin(z)*12]],gold,a);}ctx.restore();}spark(x+s*.8,y,s,seg(t,.6,1),col,24);
}else if(k==='accord'){
 for(let j=0;j<4;j++){const z=j*TAU/4-PI/4,xx=x+Math.cos(z)*s*.85*u,yy=y+Math.sin(z)*s*.85*u;polygon(xx,yy,19*u,4,PI/4,col,a);line([[xx,yy],[x,y]],gold,a*seg(t,.25,.6),2);ring(xx,yy,25*u,25*u,gold,a*.45);}polygon(x,y,23*u,8,t*.35,gold,a);ring(x,y,s*1.1*u,s*1.1*u,col,a*.5);spark(x,y,s*1.4,seg(t,.58,1),gold);
}else if(k==='flower'){
 const bloom=ease(seg(t,.15,.65));path(v=>[x+Math.sin(v*PI)*12,y+s*.85-v*s*1.05],u,gold,a,2);for(let j=0;j<6;j++){const z=j*TAU/6+t*.25;ring(x+Math.cos(z)*23*bloom,y-s*.25+Math.sin(z)*23*bloom,23*bloom,10*bloom,col,a,z);}glow(x,y-s*.25,9,gold,a);for(let side of [-1,1])line([[x,y+s*.45],[x+side*s*.38*u,y+s*.1],[x+side*s*.23*u,y+s*.48],[x,y+s*.45]],col,a,1.5,true);spark(x,y-s*.25,s*1.3,seg(t,.62,1),col,24);
}else if(k==='ballad'){
 ctx.save();ctx.translate(x-s*.2,y+s*.2);ctx.rotate(.4);ring(0,0,26*u,33*u,gold,a);ring(0,-30,19*u,24*u,gold,a);ring(0,-16,8*u,8*u,col,a);frame(-6,-s,12,s*.7*u,gold,a);for(let j=-1;j<=1;j++)line([[j*3,-s],[j*3,20]],col,a*.6);ctx.restore();for(let j=0;j<4;j++){const v=seg(t,.2+j*.08,.8+j*.045),xx=x+s*.15+v*s*.9,yy=y-s*.15-v*s*.8+j*15;ring(xx,yy,6,4,col,a*v,-.3);line([[xx+5,yy],[xx+5,yy-23],[xx+13,yy-17]],gold,a*v);}for(let j=0;j<3;j++)ring(x,y,s*(.7+j*.3)*u,s*(.7+j*.3)*u,col,a*.25,0,-.7,.7);
}else if(k==='blame'){
 for(let side of [-1,1]){const xx=x+side*s*.68*u;ring(xx,y-23,15,15,side<0?col:gold,a);line([[xx-23,y+35],[xx-23,y+10],[xx,y-2],[xx+23,y+10],[xx+23,y+35]],side<0?col:gold,a,2);const v=seg(t,side<0?.12:.35,side<0?.55:.78);path(f=>[xx-side*f*s*1.1,y-55-Math.sin(f*PI)*25*side],v,col,a,2);}const pass=seg(t,.22,.78),xx=x+Math.cos(pass*PI)*s*.45;polygon(xx,y+s*.5,12,4,t*3,gold,a);spark(x,y+s*.5,s,seg(t,.7,1),col,20);
}else if(k==='tactical'){
 for(let j=0;j<6;j++){let z=j*TAU/6+t*.35,q=ease(seg(t,.04+j*.025,.58)),px=x+Math.cos(z)*s*.72*q,py=y+Math.sin(z)*s*.72*q;ctx.save();ctx.translate(px,py);ctx.rotate(z+PI/2);line([[0,-s*.34*q],[s*.22*q,0],[0,s*.34*q],[-s*.22*q,0],[0,-s*.34*q]],j%2?col:gold,a,2);ctx.restore();}
 ring(x,y,s*.2*u,s*.2*u,gold,a);for(let j=0;j<12;j++){let z=j*TAU/12;line([[x+Math.cos(z)*s*.13,y+Math.sin(z)*s*.13],[x+Math.cos(z)*s*.42*u,y+Math.sin(z)*s*.42*u]],col,a*.7,1.5);}glow(x,y,9,gold,a);
}else if(k==='crown'){
 for(let i=-2;i<=2;i++)line([[x+i*s*.65,y+s],[x+i*s*.23,y-s*.32]],gold,a*.48,1.5);
 const w=s*u;line([[x-w*.65,y+s*.24],[x-w*.85,y-s*.4],[x-w*.3,y-s*.12],[x,y-s*.68],[x+w*.3,y-s*.12],[x+w*.85,y-s*.4],[x+w*.65,y+s*.24]],gold,a,2,true);line([[x-w*.65,y+s*.36],[x+w*.65,y+s*.36]],col,a,4);for(let i=-1;i<=1;i++)glow(x+i*w*.53,y-s*.24,5,gold,a);spark(x,y,s*1.6,seg(t,.5,1),col);
}else if(k==='eye'){
 path(v=>[x+Math.cos(v*TAU)*s,y+Math.sin(v*TAU)*s*.35*u],1,col,a,2);ring(x,y,s*.27*u,s*.34*u,gold,a);glow(x,y,10,col,a);for(let j=0;j<4;j++){ctx.save();ctx.translate(x,y);ctx.rotate(j*PI/2+(1-u)*PI/2);line([[s*.65,-s*.8],[s*.9,-s*.8],[s*.9,-s*.53]],gold,a,2);ctx.restore();}for(let j=-1;j<=1;j++)line([[x+j*s*.55,y-s*.65*u],[x+j*s*.55,y+s*.65*u]],col,a*.28);
}else if(k==='compass'){
  ring(x,y,s*u,s*u,gold,a);ring(x,y,s*.86*u,s*.86*u,col,a*.65);for(let j=0;j<48;j++){let z=j*TAU/48;line([[x+Math.cos(z)*s*u,y+Math.sin(z)*s*u],[x+Math.cos(z)*(s-(j%4?5:13))*u,y+Math.sin(z)*(s-(j%4?5:13))*u]],gold,a*.8);}
  ctx.save();ctx.translate(x,y);ctx.rotate((1-u)*5.5-.35);line([[0,-s*.68],[11,0],[0,s*.68],[-11,0]],col,a,1.5,true,true);ctx.restore();txt('N',x,y-s*.66,12,gold,a);
}else if(k==='formation'){
 for(let j=0;j<3;j++){let v=ease(seg(t,.08+j*.08,.48+j*.08)),xx=x+(j-1)*s*.7,yy=y+(j-1)*s*.2+(1-v)*s;line([[xx-s*.22,yy+s*.18],[xx,yy-s*.2],[xx+s*.22,yy+s*.18]],col,a*v,4);line([[xx-s*.22,yy+s*.34],[xx,yy-s*.04],[xx+s*.22,yy+s*.34]],gold,a*v*.8,1);}
 path(v=>[x-s*1.2+v*s*2.4,y-s*.6+Math.sin(v*TAU+t*5)*10],u,col,a,3);for(let j=0;j<6;j++)line([[x-s+j*s*.4,y+s*.65],[x-s+j*s*.4,y+s*.9]],gold,a*.4);spark(x,y,s*1.5,seg(t,.6,1),col);
}else if(k==='glitch'){
 for(let j=0;j<8;j++){let yy=y-s+j*s*.25,dx=Math.sin(j*12+t*35)*s*(1-u)*.7;line([[x-s*.65+dx,yy],[x+s*.65+dx,yy]],j%2?gold:col,a*.6,2);}
 frame(x-s*.65*u,y-s,s*1.3*u,s*2,col,a);frame(x-s*.48*u,y-s*.82,s*.96*u,s*1.64,gold,a*.4);for(let j=0;j<20;j++){let z=j*2.4;const rr=s*(1.7-u*.55);frame(x+Math.cos(z)*rr,y+Math.sin(z)*rr,3+j%3*2,4,col,a*(1-seg(t,.5,.9)));}
}else if(k==='charter'){
 const w=s*.75*u;ctx.save();ctx.globalAlpha=a*.17;ctx.fillStyle=gold;ctx.fillRect(x-w,y-s*.75,w*2,s*1.5);ctx.restore();frame(x-w,y-s*.75,w*2,s*1.5,gold,a);ring(x-w,y,s*.13,s*.79,gold,a);ring(x+w,y,s*.13,s*.79,gold,a);for(let j=0;j<4;j++)line([[x-w*.65,y-s*.4+j*15],[x-w*.65+w*1.3*seg(t,.18+j*.05,.45+j*.05),y-s*.4+j*15]],gold,a*.6);polygon(x+s*.3,y+s*.55,18*ease(seg(t,.35,.6)),12,t,'#e38582',a);for(let side of [-1,1])path(v=>[x+s*.3+side*v*s,y+s*.55-v*s*.8-Math.sin(v*PI)*20],seg(t,.55,.9),col,a,2);
}else if(k==='entropy'){
 const collapse=seg(t,.5,.82);for(let j=0;j<3;j++){ctx.save();ctx.translate(x+Math.sin(j*3)*s*collapse*.8,y+Math.cos(j*3)*s*collapse*.6);ctx.rotate(t*2+j*PI/3);const r=s*(.7-collapse*.5);frame(-r/2,-r/2,r,r,j===1?gold:col,a);line([[-r/2,-r/2],[r/2,r/2]],col,a*.4);ctx.restore();}for(let j=0;j<22;j++){let z=j*2.4+t*2,rr=s*(1.4-collapse);line([[x+Math.cos(z)*rr,y+Math.sin(z)*rr],[x+Math.cos(z+.08)*rr,y+Math.sin(z+.08)*rr]],col,a,2);}glow(x,y,25, '#10091f',a);ring(x,y,16+collapse*18,16+collapse*18,gold,a*.7);
}else if(k==='atom'){
  for(let j=0;j<3;j++){const rot=j*PI/3;ring(x,y,s*.7*u,s*.24*u,col,a,rot);let z=t*10+j*TAU/3,xx=Math.cos(z)*s*.7*u,yy=Math.sin(z)*s*.24*u,px=x+xx*Math.cos(rot)-yy*Math.sin(rot),py=y+xx*Math.sin(rot)+yy*Math.cos(rot);glow(px,py,9,'#8fd8ff',a);ring(px,py,3.2,3.2,'#d7f4ff',a);}
  glow(x,y,20,'#123f9f',a);ring(x,y,8*u,8*u,'#1d5fd1',a);glow(x,y,7,'#246ee8',a);
}else if(k==='book'){
 for(let side of [-1,1]){line([[x,y+s*.55],[x+side*s*.8*u,y+s*.36],[x+side*s*.8*u,y-s*.35],[x,y-s*.15]],gold,a,2,true);for(let j=0;j<4;j++)line([[x+side*8,y-j*11+s*.34],[x+side*s*.66*u,y-j*11+s*.17]],gold,a*.35);}
 for(let j=0;j<3;j++){let v=seg(t,.22+j*.07,.68+j*.07),xx=x+(j-1)*s*.85*v,yy=y-s*.18-s*.72*v;ctx.save();ctx.translate(xx,yy);ctx.rotate((j-1)*v*.4);frame(-13,-20,26,40,col,a*(1-v*.7));ctx.restore();polygon(xx,yy,15*v,5,-PI/2,col,a*v);glow(xx,yy,8,col,a*v);if(j)line([[x+(j-2)*s*.85*v,yy],[xx,yy]],gold,a*v*.5);}
}else if(k==='arsenal'){
 for(let side of [-1,1]){line([[x+side*s*.8,y+s*.65],[x+side*s*(.2+u*.4),y-s*.9]],col,a*.5,5);for(let j=0;j<5;j++)line([[x+side*s*.16,y+j*7],[x+side*s*(.4+j*.14)*u,y-s*.3+j*8]],gold,a,2);}
 polygon(x,y-s*.3,s*.22*u,5,-PI/2,gold,a);for(let j=0;j<7;j++){const z=PI+j*PI/6;glow(x+Math.cos(z)*s,y+Math.sin(z)*s,4,gold,a);}line([[x,y],[x,y+s*.55]],col,a,3);
}else if(k==='cape'){
 for(let j=0;j<9;j++)path(v=>{let z=-PI*.8+v*PI*1.65,rr=s*(.5+j*.06)*u;return[x+Math.cos(z)*rr,y+Math.sin(z)*rr+Math.sin(v*8+t*7)*8]},1,col,a*(.22+j*.06),2);
 const v=seg(t,.4,.78);path(z=>[x+Math.cos(-PI*.8+z*PI*1.5)*s*1.1,y+Math.sin(-PI*.8+z*PI*1.5)*s*.9],v,gold,a,3,Math.max(0,v-.5));spark(x,y,s*1.5,seg(t,.56,1),col);
}else if(k==='goblet'){
 line([[x-s*.45*u,y-s*.55],[x-s*.34*u,y+s*.12],[x,y+s*.34],[x+s*.34*u,y+s*.12],[x+s*.45*u,y-s*.55]],gold,a,2);ring(x,y-s*.55,s*.45*u,s*.1,gold,a);line([[x,y+s*.34],[x,y+s*.7]],gold,a,3);line([[x-s*.3,y+s*.73],[x+s*.3,y+s*.73]],gold,a,2);
 for(let j=0;j<35;j++){let z=j*2.4,rr=s*(1-seg(t,.1,.7))*(.5+j%5*.2);glow(x+Math.cos(z)*rr,y-s*.2+Math.sin(z)*rr,2,col,a);}for(let side of [-1,1])for(let j=0;j<6;j++)ring(x+side*(s*.6+Math.sin(j*.3)*12),y+s*.5-j*s*.2,9,3,col,a,side*-.6);
}else if(k==='columns'){
 for(let side of [-1,1]){const xx=x+side*s*.65,top=y+s*.65-s*1.4*u;frame(xx-12,top,24,y+s*.65-top,gold,a);line([[xx-19,top-4],[xx+19,top-4]],col,a,4);for(let j=-1;j<=1;j++)line([[xx+j*6,top+7],[xx+j*6,y+s*.6]],gold,a*.4);}
 ring(x,y-s*.35,s*.25*u,s*.25*u,col,a);for(let j=0;j<12;j++){let z=j*TAU/12;line([[x+Math.cos(z)*s*.3,y-s*.35+Math.sin(z)*s*.3],[x+Math.cos(z)*s*.42,y-s*.35+Math.sin(z)*s*.42]],gold,a);}
 for(let j=0;j<3;j++)path(v=>[x-s*1.2+v*s*2.4,y+s*.1+j*12+Math.sin(v*6+t*4)*10],seg(t,.35,.85),col,a*.7,2);
}else if(k==='anvil'){
 line([[x-s*.7,y+s*.15],[x+s*.65,y+s*.15],[x+s*.4,y+s*.4],[x+s*.15,y+s*.4],[x+s*.28,y+s*.7],[x-s*.35,y+s*.7],[x-s*.22,y+s*.4],[x-s*.6,y+s*.4]],gold,a,2,true);
 ctx.save();ctx.translate(x,y+s*.08);ctx.rotate(-.8*(1-ease(seg(t,.1,.48))));line([[0,0],[0,-s*.65]],col,a,6);frame(-s*.32,-s*.9,s*.64,s*.26,gold,a);ctx.restore();spark(x,y+s*.12,s*1.5,seg(t,.43,.9),col);for(let j=0;j<7;j++){let z=PI+j*PI/6;glow(x+Math.cos(z)*s*.8,y+Math.sin(z)*s*.8,4,gold,a*seg(t,.45,.72));}
}else if(k==='film'){
 const xx=x-s*.38,yy=y-s*.15;ring(xx,yy,s*.5*u,s*.5*u,gold,a);for(let j=0;j<5;j++){let z=j*TAU/5+t*4;ring(xx+Math.cos(z)*s*.28*u,yy+Math.sin(z)*s*.28*u,s*.09,s*.09,col,a);}
 const v=seg(t,.2,.8);path(z=>[xx+z*s*1.5,yy+s*.5+Math.sin(z*5)*s*.23],v,gold,a,2);for(let j=0;j<8;j++){let f=j/8;if(f<v)frame(xx+f*s*1.5,yy+s*.5+Math.sin(f*5)*s*.23-3,5,6,gold,a);}
 const b=ease(seg(t,.5,.82));frame(x+s*.65-24*b,y-s*.2,48*b,48*b,col,a);spark(x+s*.65,y+4,s*.65,seg(t,.65,1),col,18);
}else if(k==='cosmic'){
 ring(x,y+s*.1,s*.75*u,s*.4*u,gold,a);ring(x,y+s*.2,s*.73*u,s*.4*u,col,a*.6);line([[x+s*.7*u,y+s*.1],[x+s*1.25*u,y-s*.13]],gold,a,5);
 for(let j=0;j<5;j++)path(v=>{let z=v*TAU*1.6+t*3+j,rr=v*s*.62*u;return[x+Math.cos(z)*rr,y+s*.08+Math.sin(z)*rr*.52]},1,j%2?col:gold,a*.45,1.5);
 for(let j=0;j<2;j++){const z=t*6+j*PI,xx=x+Math.cos(z)*s*.64,yy=y-s*.45+Math.sin(z)*s*.32;glow(xx,yy,17,j?gold:col,a);ring(xx,yy,10,5,gold,a,z);}for(let j=0;j<3;j++)path(v=>[x+(j-1)*s*.3+Math.sin(v*8+t*5)*8,y-s*.1-v*s*.8],u,col,a*.35);
}else if(k==='standard'){
 const top=y+s*.8-s*1.7*u;line([[x-s*.35,y+s*.8],[x-s*.35,top]],gold,a,3);const pts=[];for(let j=0;j<=25;j++){let v=j/25;pts.push([x-s*.35+v*s*1.2,top+Math.sin(v*7+t*5)*9]);}for(let j=25;j>=0;j--){let v=j/25;pts.push([x-s*.35+v*s*1.2,top+s*.55+Math.sin(v*7+t*5)*9]);}line(pts,col,a,1.5,true);for(let j=0;j<3;j++)path(v=>[x-s*.35+Math.sin(v*8+j*2+t*3)*s*.38,y+s*.7-v*s*1.3],u,j===1?gold:col,a*.7,2);polygon(x-s*.35,top-8,5,4,0,gold,a);
}else if(k==='sword'){
 ctx.save();ctx.translate(x,y);ctx.rotate(-.55+ease(seg(t,.1,.62))*.85);const v=u;line([[0,-s],[s*.12,-s*.65],[s*.09,s*.3],[0,s*.43],[-s*.09,s*.3],[-s*.12,-s*.65]],col,a*v,2,true);line([[-s*.35,s*.35],[s*.35,s*.35]],gold,a*v,3);line([[0,s*.4],[0,s*.77]],gold,a*v,5);ctx.restore();for(let j=0;j<6;j++)ring(x,y,s*.78,s*.78,col,a*.6,t*2+j*PI/3,0,PI*.22);path(v=>[x-s+v*s*2,y+s*.65-v*s*1.4],seg(t,.46,.76),gold,a,3);spark(x,y,s*1.4,seg(t,.6,1),col);
}else if(k==='snow'){
 ring(x,y,s*u,s*u,col,a);ctx.save();ctx.beginPath();ctx.arc(x,y,s*u,0,TAU);ctx.clip();for(let j=0;j<3;j++){line([[x-s*1.2,y+s*.45+j*10],[x-s*.5+j*14,y-s*.5+j*12],[x-s*.13+j*14,y-s*.1+j*12],[x+s*.25+j*14,y-s*.7+j*12],[x+s*1.2,y+s*.45+j*10]],j===0?gold:col,a*(.25+j*.25),1.7);}
 for(let j=0;j<4;j++){let xx=x-s*.7+j*s*.44;line([[xx,y+s*.2],[xx-10,y+s*.55],[xx+10,y+s*.55]],col,a,1.5,true);}
 for(let j=0;j<45;j++){let xx=x+Math.sin(j*13+t*1.5)*s,yy=y-s+((j*17+t*70)%(s*2));glow(xx,yy,j%3?1.5:2.5,'#e4f7ff',a*.7);}ctx.restore();line([[x-s*.6,y+s*1.02],[x+s*.6,y+s*1.02]],gold,a,4);
}else if(k==='fishing'){
 const v=ease(seg(t,.06,.57));path(z=>[x-s*.95+z*s*1.75,y+s*.15-Math.sin(z*PI)*s*1.15],v,gold,a,2);const hx=x-s*.95+v*s*1.75,hy=y+s*.15-Math.sin(v*PI)*s*1.15;ring(hx,hy+5,5,9,gold,a,0,0,PI*1.5);
 for(let j=0;j<4;j++)ring(x,y+s*.48,s*(.25+j*.24)*u,s*(.06+j*.045)*u,col,a*(1-j*.18));for(let j=0;j<2;j++){let z=seg(t,.4+j*.08,.85+j*.06);path(f=>[x+(j?1:-1)*s*(.12+f*.65),y+s*.5-Math.sin(f*PI)*s*.62],z,j?gold:col,a,3,Math.max(0,z-.38));}
}
}

function playSignatureSound(cardId){if(window.FateApprovedActivationSfx?.handles(cardId)){signatureSound=window.FateApprovedActivationSfx.play(cardId);return;}try{if(typeof getAudioCtx!=='function'||typeof getSfxBus!=='function')return;const ac=getAudioCtx(),out=ac.createGain(),master=(typeof _masterVol==='number'?_masterVol:1),sfx=(typeof _sfxVol==='number'?_sfxVol:.8),now=ac.currentTime;out.gain.setValueAtTime(Math.max(.0001,master*sfx*.22),now);out.connect(getSfxBus(ac).input);const tone=(type,f0,f1,at,dur,level=.7)=>{const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(f0,now+at);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),now+at+dur);g.gain.setValueAtTime(.0001,now+at);g.gain.exponentialRampToValueAtTime(level,now+at+.025);g.gain.exponentialRampToValueAtTime(.0001,now+at+dur);o.connect(g);g.connect(out);o.start(now+at);o.stop(now+at+dur+.03)};const chime=(freq,at)=>{tone('sine',freq,freq*1.012,at,.42,.42);tone('triangle',freq*2,freq*2.02,at+.015,.3,.13)};
 if(cardId==='03'){tone('triangle',180,460,0,.55,.55);chime(690,.58);chime(920,.76)}
 else if(cardId==='06'){tone('sine',210,330,0,.72,.48);tone('triangle',520,760,.18,.62,.3);chime(988,.82)}
 else if(cardId==='22'){tone('sine',190,380,0,.72,.42);tone('triangle',540,760,.18,.58,.28);tone('sine',820,1080,.62,.46,.22)}
 else if(cardId==='27'){chime(392,.04);chime(523,.28);tone('sine',260,780,.62,.75,.42)}
 else if(cardId==='39'){tone('square',105,82,0,.24,.2);tone('triangle',330,220,.22,.48,.38);chime(660,.76)}
 else if(cardId==='40'){tone('triangle',92,55,.03,.3,.7);tone('sine',680,190,.18,.5,.34);chime(440,.72)}
 else if(cardId==='48'){tone('sine',145,420,0,.9,.4);tone('sine',720,1180,.25,.75,.25);chime(1318,.88)}
 setTimeout(()=>{try{out.disconnect()}catch(e){}},2200)}catch(e){}}
function dispose(){if(disposed)return;disposed=true;signatureSound?.stop();cancelAnimationFrame(raf);removeEventListener('resize',resize)}
 function tick(now){if(disposed)return;if(!overlay.isConnected){dispose();return}try{t=clamp((now-start)/Math.max(1,Number(options?.duration)||study[6]));draw();if(t<1)raf=requestAnimationFrame(tick)}catch(e){dispose();overlay.replaceChildren(...previous)}}
resize();addEventListener('resize',resize);return{start(){if(started||disposed)return;started=true;start=performance.now();if(options?.sfx!==false)playSignatureSound(id);raf=requestAnimationFrame(tick)},dispose}}
function playCoordinator(card,options={}){
 if(!['01','bh07','bh11','10','19','bh12','11','bh02','bh08','57','12','23','15','34'].includes(String(card?.id||'')))return false;
 if(card.faceDown || (typeof window.isHiddenEffectForViewer==='function' && window.isHiddenEffectForViewer(card)))return false;
 if(document.documentElement.classList.contains('fate-animations-off') || document.documentElement.classList.contains('fate-super-performance-mode') || document.hidden)return false;
 const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:12990';overlay.setAttribute('aria-hidden','true');
 const fx=mount(overlay,card,{duration:2000,sfx:options.sfx!==false});if(!fx)return false;
 document.body.appendChild(overlay);
 const state=typeof G!=='undefined'?G:null,until=Date.now()+2000;
 if(state){state._coordinatorSignatureUntil=Math.max(Number(state._coordinatorSignatureUntil)||0,until);state._postConsolidationFateFeedbackUntil=Math.max(Number(state._postConsolidationFateFeedbackUntil)||0,until);}
 window.FateActivationBanner?.play(card,{sfx:false,hasCenterAnimation:true});fx.start();
 let ended=false;function finish(){if(ended)return;ended=true;fx.dispose();overlay.remove();document.removeEventListener('visibilitychange',hidden);if(state && state._coordinatorSignatureUntil===until)state._coordinatorSignatureUntil=0;}
 function hidden(){if(document.hidden)finish();}document.addEventListener('visibilitychange',hidden);setTimeout(finish,2000);return true;
}
window.FateSignatureActivationFx={mount,playCoordinator,approved:Object.keys(studies),durationFor:card=>studies[String(card?.id||'')]?.[6]||0};})();



