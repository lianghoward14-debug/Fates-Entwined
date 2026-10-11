const fs=require('node:fs'),path=require('node:path');
const rate=48000,duration=.52,count=Math.floor(rate*duration);
const out=path.resolve(__dirname,'..','.tmp','jimmy-cynthia-discard-samples-v5');
fs.mkdirSync(out,{recursive:true});
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1;};}
function env(t,s,a,h,d,p=2){t-=s;if(t<0||t>a+h+d)return 0;if(t<a)return t/a;if(t<a+h)return 1;return Math.pow(1-(t-a-h)/d,p);}
function write(name,L,R){const b=Buffer.alloc(44+count*4);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*4,40);for(let i=0;i<count;i++){for(const[v,o]of[[L[i],44+i*4],[R[i],46+i*4]])b.writeInt16LE(Math.round(Math.tanh(v*1.2)*.87*32767),o);}fs.writeFileSync(path.join(out,name),b);}
function make(kind){const L=new Float64Array(count),R=new Float64Array(count),random=rng(0xc71a+kind*1201);let body=0,paper=0,air=0;for(let i=0;i<count;i++){const t=i/rate,n=random();body+=(n-body)*.026;paper+=(n-paper)*.20;air+=(n-air)*.5;let l=0,r=0;
  if(kind===1){const cut=air*env(t,0,.0002,.003,.035)*1.25;const stack=paper*env(t,.012,.0003,.018,.115)*1.12;const punch=Math.sin(2*Math.PI*91*t)*env(t,0,.0004,.006,.17)*.62;l=cut+stack+punch;r=-cut*.7+stack*.86+punch;}
  else if(kind===2){const sweep=paper*env(t,0,.00025,.028,.105,1.55)*1.06;const vanish=body*env(t,.038,.0003,.006,.17)*1.35;const snap=air*env(t,.041,.00015,.001,.028)*.82;l=sweep+vanish+snap;r=-sweep*.64+vanish*.92-snap*.68;}
  else{const hit=body*env(t,0,.00025,.005,.14)*1.48;let cards=0;for(const at of [.006,.019,.034,.052])cards+=paper*env(t,at,.00015,.0015,.026)*(.9-at*4);const tail=air*env(t,.055,.0003,.012,.09)*.35;l=hit+cards+tail;r=hit*.9-cards*.62+tail*.72;}
  L[i]=l;R[i]=r;
}return[L,R];}
['01-hand-wipe.wav','02-sudden-hand-vanish.wav','03-full-hand-collapse.wav'].forEach((name,index)=>write(name,...make(index+1)));
console.log(out);
