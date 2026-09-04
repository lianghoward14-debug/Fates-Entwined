import json
import subprocess
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parent.parent
ff = next((root / '.tools/ffmpeg').rglob('ffmpeg.exe'))
out = root / 'free-world-remaining-review'
(out / 'clips').mkdir(parents=True, exist_ok=True)
items = []
for number in range(482, 606):
    batch, local = (3, number - 473) if number <= 512 else (4, number - 512)
    source = root / f'voice-line-batches/set-{batch}/clips/voice-line-{local:03}.mp3'
    raw = subprocess.check_output([str(ff), '-v', 'error', '-i', str(source), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'])
    samples = np.frombuffer(raw, dtype=np.float32)
    duration = len(samples) / 16000
    frames = samples[:len(samples)//80*80].reshape(-1,80)
    energy = np.sqrt(np.mean(frames**2, axis=1))
    db = 20*np.log10(np.maximum(energy, 1e-7))
    # Locate actual low-energy valleys, not approximate ASR word timestamps.
    threshold = min(-25, max(-44, float(np.percentile(db, 90))-27))
    quiet = db < threshold
    edges = np.diff(np.r_[False, quiet, False].astype(int))
    gaps = [(a*.005,b*.005) for a,b in zip(np.where(edges==1)[0],np.where(edges==-1)[0]) if (b-a)*.005 >= .065]
    boundaries = [0.0]
    if duration > 1.8:
        for a,b in gaps:
            midpoint = (a+b)/2
            if midpoint-boundaries[-1] >= .48 and duration-midpoint >= .48:
                boundaries.append(midpoint)
    boundaries.append(duration)
    parts = []
    for index,(start,end) in enumerate(zip(boundaries,boundaries[1:]),1):
        filename = f'{number}-part-{index:02}.mp3'
        if len(boundaries)>2:
            subprocess.run([str(ff),'-v','error','-y','-i',str(source),'-ss',str(start),'-t',str(end-start),'-af','afade=t=in:d=0.004,areverse,afade=t=in:d=0.006,areverse','-q:a','2',str(out/'clips'/filename)],check=True)
            url = 'clips/'+filename
        else:
            url = '../'+source.relative_to(root).as_posix()
        parts.append(dict(label=f'{number} · part {index}' if len(boundaries)>2 else str(number),file=url,start=start,end=end,duration=end-start))
    items.append(dict(number=number,original='../'+source.relative_to(root).as_posix(),duration=duration,parts=parts))
data = json.dumps(items,ensure_ascii=False)
total = sum(len(x['parts']) for x in items)
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>All remaining Free World voices</title>
<style>body{background:#101722;color:#e8eef8;font:16px system-ui;margin:32px auto;padding:0 20px;max-width:1150px}p{color:#bbc9db;line-height:1.6}section{padding:18px;background:#192436;border-radius:12px;margin:14px 0}.parts{display:flex;gap:10px;flex-wrap:wrap}button,a{color:#e8eef8}button{cursor:pointer;background:#294568;border:1px solid #6583ab;border-radius:8px;padding:14px}button.active{background:#486da0}small{display:block;margin-top:6px;color:#c5d3e8}header{display:flex;align-items:center;gap:20px;margin-bottom:14px}header button{background:#27313e;padding:8px}input{padding:12px;border-radius:8px}#status{position:sticky;top:0;background:#101722;padding:12px}</style>
<h1>All remaining Free World voices · 482–605</h1><p>124 original numbered clips. Review-only: none are implemented. New proposed cuts use measured quiet gaps, preserve the entire source without overlaps, and avoid transcription-based trimming. Short originals are retained. These are candidates—not confirmed phrase-perfect cuts. Compare any split with its original.</p><p id="count"></p><input id="filter" placeholder="Find original clip number"><button id="stop">Stop audio</button><div id="status">Ready</div><main id="board"></main><script>
const items=DATA;let audio,active;const board=document.querySelector('#board');document.querySelector('#count').textContent=items.reduce((n,x)=>n+x.parts.length,0)+' playable candidates from 124 originals';
function play(file,button,label){audio?.pause();active?.classList.remove('active');audio=new Audio(file);active=button;button.classList.add('active');document.querySelector('#status').textContent='Playing '+label;audio.onended=()=>button.classList.remove('active');audio.play().catch(e=>document.querySelector('#status').textContent=e.message)}
for(const item of items){const s=document.createElement('section');s.dataset.number=item.number;const h=document.createElement('header');h.innerHTML='<b>Original '+item.number+'</b>';const original=document.createElement('button');original.textContent='Compare original · '+item.duration.toFixed(2)+'s';original.onclick=()=>play(item.original,original,'original '+item.number);h.append(original);s.append(h);const row=document.createElement('div');row.className='parts';for(const p of item.parts){const b=document.createElement('button');b.innerHTML=p.label+'<small>'+p.duration.toFixed(2)+' seconds</small>';b.onclick=()=>play(p.file,b,p.label);row.append(b)}s.append(row);board.append(s)}
document.querySelector('#stop').onclick=()=>{audio?.pause();active?.classList.remove('active');document.querySelector('#status').textContent='Stopped'};document.querySelector('#filter').oninput=e=>{for(const s of board.children)s.hidden=!s.dataset.number.includes(e.target.value.trim())};</script></html>'''.replace('DATA',data)
(out/'soundboard.html').write_text(html,encoding='utf-8')
(out/'manifest.json').write_text(data,encoding='utf-8')
print(json.dumps(dict(originals=len(items),candidates=total,split_originals=[x['number'] for x in items if len(x['parts'])>1])))
