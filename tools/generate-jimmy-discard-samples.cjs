const fs=require('node:fs'),path=require('node:path');
const rate=48000,duration=.56,count=Math.floor(rate*duration),out=path.resolve(__dirname,'..','.tmp','jimmy-cynthia-discard-samples-v3');
fs.mkdirSync(out,{recursive:true});
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2147483648-1;};}
function env(t,start,attack,hold,decay,p=2.2){t-=start;if(t<0||t>attack+hold+decay)return 0;if(t<attack)return t/attack;if(t<attack+hold)return 1;return Math.pow(1-(t-attack-hold)/decay,p);}
function write(name,L,R){const b=Buffer.alloc(44+count*4);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*4,40);for(let i=0;i<count;i++){for(const[v,o]of[[L[i],44+i*4],[R[i],46+i*4]])b.writeInt16LE(Math.round(Math.tanh(v*1.22)*.88*32767),o);}fs.writeFileSync(path.join(out,name),b);}
function make(kind){const L=new Float64Array(count),R=new Float64Array(count),rand=rng(0x91ab+kind*977);let low=0,mid=0,high=0;for(let i=0;i<count;i++){const t=i/rate,n=rand();low+=(n-low)*.025;mid+=(n-mid)*.12;high+=(n-high)*.46;let l=0,r=0;
if(kind===1){const hit=low*env(t,0,.0004,.003,.13)*1.65;let cracks=0;for(const at of [0,.019,.041,.067])cracks+=high*env(t,at,.00015,.0005,.018)*(.98-at*5);const body=Math.sin(2*Math.PI*88*t)*env(t,0,.0005,.006,.18)*.66;l=hit+cracks*1.18+body;r=hit*.94-cracks*.82+body;}
else if(kind===2){const sweep=mid*env(t,0,.00025,.025,.11,1.45);const slap=low*env(t,.052,.0003,.004,.15)*1.7;const knock=Math.sin(2*Math.PI*73*(t-.052))*env(t,.052,.0003,.006,.19)*.78;l=sweep*1.24+slap+knock;r=-sweep*.72+slap*.91+knock;}
else{const punch=low*env(t,0,.00025,.004,.16)*1.75;const shred=high*env(t,.007,.0002,.038,.105,1.5)*1.08;let snaps=0;for(const at of [.012,.034,.058,.083])snaps+=mid*env(t,at,.00015,.0004,.014)*.85;const body=Math.sin(2*Math.PI*105*t)*env(t,0,.0003,.005,.13)*.48;l=punch+shred+snaps+body;r=punch*.92-shred*.76+snaps*.7+body;}L[i]=l;R[i]=r;}return[L,R];}
['01-mass-card-crack.wav','02-table-sweep-impact.wav','03-hand-obliteration.wav'].forEach((n,i)=>write(n,...make(i+1)));
console.log(out);
