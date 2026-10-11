const fs=require('node:fs'),path=require('node:path');
const rate=48000,duration=.42,count=Math.floor(rate*duration);
const out=path.resolve(__dirname,'..','.tmp','jimmy-cynthia-discard-samples-v4');
fs.mkdirSync(out,{recursive:true});
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1;};}
function env(t,start,attack,hold,decay,p=2){t-=start;if(t<0||t>attack+hold+decay)return 0;if(t<attack)return t/attack;if(t<attack+hold)return 1;return Math.pow(1-(t-attack-hold)/decay,p);}
function write(name,L,R){const b=Buffer.alloc(44+count*4);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*4,40);for(let i=0;i<count;i++){for(const[v,o]of[[L[i],44+i*4],[R[i],46+i*4]])b.writeInt16LE(Math.round(Math.tanh(v*1.12)*.84*32767),o);}fs.writeFileSync(path.join(out,name),b);}
function make(kind){const L=new Float64Array(count),R=new Float64Array(count),random=rng(0x51d0+kind*811);let soft=0,paper=0,edge=0;for(let i=0;i<count;i++){const t=i/rate,n=random();soft+=(n-soft)*.035;paper+=(n-paper)*.18;edge+=(n-edge)*.42;let l=0,r=0;
  if(kind===1){const flick=paper*env(t,0,.0003,.014,.105,1.7);const land=soft*env(t,.047,.0004,.004,.13)*.72;l=flick*1.05+land;r=-flick*.68+land*.94;}
  else if(kind===2){const slide=paper*env(t,0,.0004,.026,.12,1.45);const tap=edge*env(t,.071,.0002,.001,.045)*.55;l=slide*.92+tap;r=-slide*.58+tap*.9;}
  else{const drop=soft*env(t,0,.00035,.005,.14)*.92;const card=edge*env(t,.009,.0002,.009,.07)*.64;const settle=paper*env(t,.064,.0003,.004,.07)*.3;l=drop+card+settle;r=drop*.9-card*.52+settle*.8;}
  L[i]=l;R[i]=r;
}return[L,R];}
['01-clean-card-discard.wav','02-soft-card-slide.wav','03-card-drop.wav'].forEach((name,index)=>write(name,...make(index+1)));
console.log(out);
