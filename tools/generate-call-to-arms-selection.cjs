// Original reinforcement selection: immediate impact and a bright, ringing confirmation chord.
const fs = require('node:fs');
const rate = 48000, seconds = 1.3, count = Math.ceil(rate * seconds);
const left = new Float64Array(count), right = new Float64Array(count);
let seed = 10585, low = 0, previous = 0;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
for(let i = 0; i < count; i++){
  const t = i / rate;
  // Air sweep resolves into the impact rather than masking the call.
  const n = noise(); low += .13 * (n - low);
  const air = low - previous; previous = low;
  const swell = Math.exp(-t * 45) * Math.min(1, t * 700);
  let v = air * swell * .8;
  const hit = t - .008;
  if(hit >= 0){
    v += .40 * Math.sin(2 * Math.PI * (82 * hit + 55 * (1 - Math.exp(-hit * 20)) / 20)) * Math.exp(-hit * 9) * Math.min(1, hit * 350);
    v += .15 * n * Math.exp(-hit * 65) * Math.min(1, hit * 600);
  }
  left[i] = right[i] = v;
  for(const [start, hz, pan] of [[.025,523.251,-.35],[.045,659.255,.35],[.065,783.991,-.1],[.11,1046.502,.2]]){
    const u = t - start;
    if(u < 0) continue;
    const envelope = Math.min(1,u/.008) * Math.exp(-u*5.6);
    const phase = 2 * Math.PI * hz * (u + .0007*(1-Math.exp(-u*35)));
    const brass = (Math.sin(phase)+.18*Math.sin(2.001*phase)+.08*Math.sin(3.998*phase))*.15*envelope;
    const shimmer = Math.sin(phase*3.002)*.026*Math.exp(-u*3.7)*Math.min(1,u/.01);
    left[i] += (brass+shimmer)*(1-pan*.4);
    right[i] += (brass+shimmer)*(1+pan*.4);
  }
}
// Short stereo room tail; fixed taps keep the cue reproducible.
const dryL=left.slice(),dryR=right.slice();
for(const [delay,gain] of [[.057,.17],[.103,.12],[.169,.08],[.251,.045]]){
  const offset=Math.round(delay*rate);
  for(let i=offset;i<count;i++){left[i]+=dryR[i-offset]*gain;right[i]+=dryL[i-offset]*gain;}
}
let peak=0;
for(let i=0;i<count;i++){
  const fade=Math.min(1,i/(rate*.005),(count-1-i)/(rate*.13));
  left[i]*=fade;right[i]*=fade;peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
}
const output=Buffer.alloc(44+count*4);
output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(2,22);output.writeUInt32LE(rate,24);output.writeUInt32LE(rate*4,28);output.writeUInt16LE(4,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(count*4,40);
for(let i=0;i<count;i++){output.writeInt16LE(Math.round(left[i]/peak*.86*32767),44+i*4);output.writeInt16LE(Math.round(right[i]/peak*.86*32767),46+i*4);}
const destination='soundeffects/codex-redesign/call_to_arms_card_selected.wav';
fs.writeFileSync(destination,output);
console.log(`Created ${destination}: ${seconds}s, stereo ${rate} Hz, peak -1.31 dBFS`);
