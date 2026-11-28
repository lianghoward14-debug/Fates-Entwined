// Reproducible Sebastian fish-counter sound candidates (44.1 kHz mono WAV).
const fs = require('node:fs');
const path = require('node:path');
const rate = 44100;
const output = path.join(__dirname, '..', 'assets', 'audio', 'fish-plop-samples');
fs.mkdirSync(output, {recursive:true});
for (let variant = 1; variant <= 3; variant++) {
  const duration = variant === 1 ? .34 : variant === 2 ? .43 : .51;
  const count = Math.ceil(rate * duration);
  const pcm = Buffer.alloc(count * 2);
  let seed = 400 + variant * 53;
  let noise = 0;
  let phase = 0;
  const pitch = [0, 175, 128, 215][variant];
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = (seed / 4294967296) * 2 - 1;
    noise = noise * .84 + white * .16;
    const wet = noise * Math.exp(-t * [0, 22, 17, 13][variant]) * .29;
    const freq = pitch * (1 + .9 * Math.exp(-t * 19));
    phase += Math.PI * 2 * freq / rate;
    const body = Math.sin(phase) * (1 - Math.exp(-t * 320)) * Math.exp(-t * [0, 13, 10, 8][variant]) * .57;
    const bubbleTime = [0, .087, .12, .16][variant];
    const bubbleT = Math.max(0, t - bubbleTime);
    const bubble = t < bubbleTime ? 0 : Math.sin(2 * Math.PI * (pitch * 1.43 * bubbleT - 110 * bubbleT * bubbleT)) * Math.exp(-bubbleT * 18) * .22;
    const attack = Math.min(1, t * 180);
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round((wet + body + bubble) * attack * 22000))), i * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  fs.writeFileSync(path.join(output, `fish-plop-${variant}.wav`), wav);
}
