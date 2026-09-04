"""Stage revisions without changing the current review board or approved part 2."""
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parent.parent
review = root / 'free-world-remaining-review'
out = review / 'pending-corrections'
out.mkdir(exist_ok=True)
ff = next((root / '.tools/ffmpeg').rglob('ffmpeg.exe'))
approved = review / 'clips/482-part-02.mp3'
checksum = hashlib.sha256(approved.read_bytes()).hexdigest()
records = []
for part in (1, 3, 4):
    source = review / f'clips/482-part-{part:02}.mp3'
    raw = subprocess.check_output([str(ff), '-v', 'error', '-i', str(source), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'])
    samples = np.frombuffer(raw, dtype=np.float32)
    duration = len(samples)/16000
    frames = samples[:len(samples)//80*80].reshape(-1,80)
    energy = np.sqrt(np.mean(frames**2, axis=1))
    # Use a sustained energy valley, away from the edges, for the next split.
    smooth = np.convolve(energy, np.ones(9)/9, mode='same')
    first, last = int(.40/.005), int((duration-.40)/.005)
    boundary = (first + int(np.argmin(smooth[first:last]))) * .005
    for suffix, start, end in [('a',0,boundary),('b',boundary,duration)]:
        name = f'482-part-{part:02}{suffix}.mp3'
        subprocess.run([str(ff),'-v','error','-y','-i',str(source),'-ss',str(start),'-t',str(end-start),'-af','afade=t=in:d=0.004,areverse,afade=t=in:d=0.006,areverse','-q:a','2',str(out/name)],check=True)
        records.append(dict(label=f'482 part {part}{suffix}',file=name,start=start,end=end,status='proposed; needs listening review'))
assert hashlib.sha256(approved.read_bytes()).hexdigest() == checksum
(out/'482.json').write_text(json.dumps(dict(approved_part=2,approved_sha256=checksum,replacements=records,notes='Parts 1, 3, 4 reported overmerged. Staged only; existing board and game unchanged.'),indent=2),encoding='utf-8')
print(json.dumps(records))
