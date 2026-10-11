// Original Call to Arms reveal: rising air, a low impact, and a three-note brass call.
const fs = require('node:fs');
const rate = 48000, seconds = 1.65, count = Math.ceil(rate * seconds);
const left = new Float64Array(count), right = new Float64Array(count);
let seed = 10584, low = 0, previous = 0;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
for(let i = 0; i < count; i++){
  const t = i / rate;
  // Air sweep resolves into the impact rather than masking the call.
  const n = noise(); low += .13 * (n - low);
  const air = low - previous; previous = low;
  const swell = t < .32 ? Math.pow(t / .32, 1.8) : Math.exp(-(t - .32) * 18);
  let v = air * swell * 1.9;
  const hit = t - .30;
  if(hit >= 0){
    v += .40 * Math.sin(2 * Math.PI * (62 * hit + 42 * (1 - Math.exp(-hit * 20)) / 20)) * Math.exp(-hit * 9) * Math.min(1, hit * 350);
    v += .15 * n * Math.exp(-hit * 65) * Math.min(1, hit * 600);
  }
  left[i] = right[i] = v;
  for(const [start, hz, pan] of [[.32,293.665,-.30],[.46,440,.25],[.61,587.33,0]]){
    const u = t - start;
    if(u < 0) continue;
    const envelope = Math.min(1,u/.022) * Math.exp(-u*4.7);
    const phase = 2 * Math.PI * hz * (u + .0007*(1-Math.exp(-u*35)));
    const brass = (Math.sin(phase)+.32*Math.sin(2*phase)+.16*Math.sin(3*phase)+.055*Math.sin(5*phase))*.18*envelope;
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
const destination='soundeffects/codex-redesign/call_to_arms_reinforcement_reveal.wav';
fs.writeFileSync(destination,output);
console.log(`Created ${destination}: ${seconds}s, stereo ${rate} Hz, peak -1.31 dBFS`);
