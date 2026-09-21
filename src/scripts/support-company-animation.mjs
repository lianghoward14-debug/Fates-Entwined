export const SUPPORT_ANIMATIONS=Object.freeze([
{id:'call-standard',ability:'call',name:'Raise the Standard',subtitle:'A single company flag climbs its pole, unfurls, and catches the wind.'},
{id:'call-crossed',ability:'call',name:'Standards United',subtitle:'Two flags sweep inward and cross, their cloth rippling as the company rallies.'},
{id:'call-muster',ability:'call',name:'The Company Assembles',subtitle:'Three standards rise, a laurel draws around them, and sparks mark the rally.'},
{id:'call-wings',ability:'call',name:'Dispatch in Flight',subtitle:'A sealed dispatch opens into luminous wings and lifts toward the hand.'},
{id:'desperate-shield',ability:'desperate',name:'Hold the Line',subtitle:'A shield fractures under pressure; two reserve shields arrive to brace it.'},
{id:'desperate-flame',ability:'desperate',name:'The Last Signal',subtitle:'Half a ring burns away to kindle a signal fire; answering lights converge.'}]);
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>1-(1-clamp(x))**3,seg=(t,a,b)=>clamp((t-a)/(b-a));
// The same luminous contour / secondary gold stroke language as approved character art.
export function drawSupportCompanyEffect(ctx,id,t,w,h){
 ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h*.46);const scale=Math.min(w/460,h/310);ctx.scale(scale,scale);
 const desperate=id.startsWith('desperate'),color=desperate?'#e99792':'#a9d7cd',gold='#eed09b',alpha=ease(seg(t,0,.13))*(1-ease(seg(t,.82,1))),q=ease(seg(t,.08,.62));
 function line(pts,c=color,a=alpha,width=1.7){ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=c;ctx.lineWidth=width;ctx.shadowColor=c;ctx.shadowBlur=7;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();ctx.shadowBlur=0;ctx.lineWidth=.65;ctx.globalAlpha=a*.7;ctx.stroke();ctx.restore();}
 function curve(fn,u=1,c=color,a=alpha,width=1.7){line(Array.from({length:61},(_,i)=>fn(i/60*u)),c,a,width);}
 function at(x,y,r,fn){ctx.save();ctx.translate(x,y);ctx.rotate(r);fn();ctx.restore();}
 function star(x,y,r,c=gold,a=alpha){line([[x-r,y],[x+r,y]],c,a);line([[x,y-r],[x,y+r]],c,a);}
 function oval(x,y,rx,ry,c=color,a=alpha){curve(v=>[x+Math.cos(v*Math.PI*2)*rx,y+Math.sin(v*Math.PI*2)*ry],1,c,a);}
 function sparks(p){for(let j=0;j<18;j++){const z=j*2.39996,r=38+90*ease(p);star(Math.cos(z)*r,Math.sin(z)*r*.7,2,j%2?color:gold,alpha*Math.sin(p*Math.PI));}}
 function shield(x,y,s,a=alpha){at(x,y,0,()=>{ctx.scale(s,s);line([[-40,-51],[0,-65],[40,-51],[34,20],[0,58],[-34,20],[-40,-51]],color,a,2.4);line([[-30,-42],[0,-52],[30,-42],[24,16],[0,43],[-24,16],[-30,-42]],gold,a*.65);});}
 function flag(x,y,rotation,progress,size=1){at(x,y,rotation,()=>{ctx.scale(size,size);line([[0,82],[0,-99]],gold,alpha,2.2);line([[0,-111],[-4,-99],[4,-99],[0,-111]],gold,alpha,1.8);const rise=ease(seg(t,.04,.36)),yy=28-112*rise,span=86*progress;const wave=v=>Math.sin(v*Math.PI*2-t*10)*8*v*progress;curve(v=>[span*v,yy+wave(v)],1,color,alpha,2.2);curve(v=>[span*v,yy+58+wave(v)],1,color,alpha,2.2);line([[span,yy+wave(1)],[span,yy+58+wave(1)]],color,alpha,2.2);line([[0,yy],[0,yy+58]],color);if(progress>.2){curve(v=>[span*v,yy+10+wave(v)],1,gold,alpha*.55);curve(v=>[span*v,yy+48+wave(v)],1,gold,alpha*.55);const cx=span*.45,cy=yy+29+wave(.45);line([[cx,cy-11],[cx+9,cy],[cx,cy+11],[cx-9,cy],[cx,cy-11]],gold,alpha*progress);}});}
 if(id==='call-standard'){
 const open=ease(seg(t,.23,.65));flag(-39,0,0,open,1.05);sparks(seg(t,.64,.99));
 }else if(id==='call-crossed'){
 const enter=ease(seg(t,.08,.56)),open=ease(seg(t,.25,.66));for(const side of [-1,1]){ctx.save();ctx.scale(side,1);flag(95*(1-enter),10,.38*enter,open,.95);ctx.restore();}sparks(seg(t,.65,.99));
 }else if(id==='call-muster'){
 for(let j=0;j<3;j++){const p=ease(seg(t,.06+Math.abs(j-1)*.09,.56)),x=(j-1)*55,y=35*(1-p)+(j===1?-18:0);at(x,y,0,()=>{line([[0,61],[0,-80*p]],gold,alpha,2.2);line([[0,-74*p],[39,-67*p],[39,-14*p],[20,-24*p],[0,-19*p]],color,alpha,2.3);for(let k=0;k<2;k++)line([[8,-59*p+k*12],[30,-54*p+k*12]],gold,alpha*.5);star(0,-86*p,4);});}
 for(const side of [-1,1]){curve(v=>[side*(69+34*Math.sin(v*Math.PI)),83-148*v],q,gold);for(let j=0;j<7*q;j++){const v=j/7;at(side*(69+34*Math.sin(v*Math.PI)),83-148*v,side*.5,()=>oval(side*7,-5,5,11,color,alpha*.85));}}
 sparks(seg(t,.58,.96));
 }else if(id==='call-wings'){
 const open=ease(seg(t,.12,.63)),lift=ease(seg(t,.65,.92));at(0,15-65*lift,-.08+lift*.2,()=>{line([[-39,-20],[39,-20],[39,31],[-39,31],[-39,-20]],gold,alpha,2.2);line([[-39,-20],[0,10],[39,-20]],color);line([[-39,31],[0,-2],[39,31]],color,alpha*.5);oval(0,10,8,8,gold);for(const side of [-1,1]){curve(v=>[side*(39+95*v*open),-12-35*Math.sin(v*Math.PI)*open],1,color,alpha,2.3);for(let j=0;j<5;j++)line([[side*(43+j*16*open),-17-18*Math.sin(j/5*Math.PI)*open],[side*(49+j*19*open),22-j*9*open],[side*(39+j*13*open),15-j*4]],j%2?gold:color,alpha,1.5);}});for(let j=0;j<3;j++)curve(v=>[-55+110*v,62+j*11+Math.sin(v*Math.PI)*9],q,gold,alpha*(1-lift)*.5);sparks(seg(t,.62,.98));
 }else if(id==='desperate-shield'){
 const impact=ease(seg(t,.18,.43)),join=ease(seg(t,.39,.73));shield(Math.sin(t*75)*2*(1-join)*impact,0,1);line([[8,-59],[-8,-25],[13,-7],[-9,18],[0,52]],gold,alpha*impact,2.2);for(const side of [-1,1])shield(side*(151-89*join),18,.72,alpha*seg(t,.32,.48));for(let j=0;j<7;j++){const z=j*Math.PI*2/7,r=50+55*impact;line([[Math.cos(z)*r,Math.sin(z)*r],[Math.cos(z)*(r+12),Math.sin(z)*(r+12)]],color,alpha*(1-join)*impact);}sparks(seg(t,.68,.99));
 }else{
 const burn=ease(seg(t,.1,.6)),answer=ease(seg(t,.47,.85));curve(v=>{const z=-Math.PI/2+v*Math.PI;return[Math.cos(z)*81,Math.sin(z)*81]},1,gold);curve(v=>{const z=Math.PI/2+v*Math.PI;return[Math.cos(z)*81,Math.sin(z)*81]},1-burn,color,alpha*(1-burn*.8));
 at(0,20,0,()=>{line([[-23,38],[23,38],[15,50],[-15,50],[-23,38]],gold);curve(v=>[-23+46*v,38-Math.sin(v*Math.PI)*(40+44*burn)+Math.sin(v*Math.PI*4+t*9)*7*burn],1,color,alpha,2.5);curve(v=>[-12+24*v,36-Math.sin(v*Math.PI)*(22+33*burn)],1,gold,alpha,1.7);});for(let j=0;j<9;j++){const z=j*2.39996,r=135-100*answer;star(Math.cos(z)*r,Math.sin(z)*r*.7,2+j%3,gold,alpha*answer);line([[Math.cos(z)*(r+12),Math.sin(z)*(r+12)*.7],[Math.cos(z)*r,Math.sin(z)*r*.7]],color,alpha*answer*.45);}sparks(seg(t,.72,.99));
 }
 ctx.restore();
}
let activeFinish;
export function playSupportCompanyAnimation({variant='call-crossed',host=document.body,playerLabel='',duration=2200}={}){
 activeFinish?.();const item=SUPPORT_ANIMATIONS.find(x=>x.id===variant)||SUPPORT_ANIMATIONS[0];
 const vignette=document.createElement('div');
 vignette.className='support-company-vignette';
 vignette.setAttribute('aria-hidden','true');
 Object.assign(vignette.style,{
  position:host===document.body?'fixed':'absolute',inset:'0',pointerEvents:'none',zIndex:'12990',
  background:'radial-gradient(ellipse 46% 48% at 50% 46%,rgba(2,7,15,.76) 0%,rgba(2,7,15,.54) 48%,rgba(2,7,15,.12) 76%,transparent 100%)',
  animation:'support-company-vignette-pulse 2.2s ease both'
 });
 const layer=document.createElement('div');layer.className='support-company-cinematic';layer.setAttribute('role','status');const title=item.ability==='call'?'Call to Arms':'Desperate Reinforcement';layer.setAttribute('aria-label',playerLabel+' '+title);
 Object.assign(layer.style,{position:host===document.body?'fixed':'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'min(1100px,94%)',height:'min(720px,94%)',containerType:'inline-size',pointerEvents:'none',zIndex:'12995'});
 if(host===document.body){const b=document.getElementById('fate-match-v2-canvas')?.getBoundingClientRect();if(b){layer.style.left=b.left+b.width/2+'px';layer.style.top=b.top+b.height/2+'px';layer.style.width=Math.min(1100,b.width*.94)+'px';layer.style.height=Math.min(720,b.height*.94)+'px';}}
 const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%';canvas.setAttribute('aria-hidden','true');layer.append(canvas);const label=document.createElement('div');label.textContent=title;label.style.cssText='position:absolute;bottom:15%;width:100%;text-align:center;font:small-caps 600 clamp(22px,4cqw,44px)/1.15 Cinzel,Georgia,serif;letter-spacing:2px;color:#eed09b;text-shadow:0 2px 8px #000';layer.append(label);host.append(vignette,layer);
 const sound=window.FateApprovedActivationSfx?.play(item.ability==='call'?'support-call':'support-desperate');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||['fate-reduced-motion','fate-animations-off','fate-super-performance-mode'].some(c=>document.documentElement.classList.contains(c)||document.body.classList.contains(c));
 return new Promise(resolve=>{let frame,done=false;const start=performance.now(),length=reduced?1200:duration,ctx=canvas.getContext('2d');function finish(){if(done)return;done=true;sound?.stop();cancelAnimationFrame(frame);clearTimeout(timer);vignette.remove();layer.remove();document.removeEventListener('visibilitychange',visibility);if(activeFinish===finish)activeFinish=null;resolve();}function visibility(){if(document.hidden)finish();}function draw(now){if(done)return;const b=layer.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(b.width*dpr)||canvas.height!==Math.round(b.height*dpr)){canvas.width=Math.round(b.width*dpr);canvas.height=Math.round(b.height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);drawSupportCompanyEffect(ctx,item.id,reduced?.5:clamp((now-start)/length),b.width,b.height);if(now-start<length)frame=requestAnimationFrame(draw);else finish();}const timer=setTimeout(finish,length+150);activeFinish=finish;document.addEventListener('visibilitychange',visibility);if(ctx)frame=requestAnimationFrame(draw);else finish();});
}
