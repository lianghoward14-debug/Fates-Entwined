"""Rebuild flagged candidates from recording coordinates, never previous recuts."""
import json,subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent.parent
out=root/'free-world-source-boundary-review'
(out/'clips').mkdir(parents=True,exist_ok=True)
ff=next((root/'.tools/ffmpeg').rglob('ffmpeg.exe'))
sources={}
def source(batch):
    if batch not in sources:
        p=Path('C:/Users/liang/Downloads')/f'Hearts of Iron IV All National Voice Sounds With WW2 Footages of Nations(1) (mp3cut.net)({batch-1}).mp3'
        sources[batch]=np.frombuffer(subprocess.check_output([str(ff),'-v','error','-i',str(p),'-f','f32le','-ac','1','-ar','24000','-']),dtype=np.float32).copy()
    return sources[batch]
rows=[]
def emit(label,batch,ranges,note):
    x=np.concatenate([source(batch)[round(a*24000):round(b*24000)] for a,b in ranges])
    filename=label.replace('+','_')+'.mp3'
    subprocess.run([str(ff),'-v','error','-y','-f','f32le','-ar','24000','-ac','1','-i','-','-af','afade=t=in:d=0.003,areverse,afade=t=in:d=0.004,areverse','-q:a','2',str(out/'clips'/filename)],input=x.astype(np.float32).tobytes(),check=True)
    rows.append(dict(label=label,file='clips/'+filename,duration=len(x)/24000,batch=batch,ranges=ranges,note=note))
emit('488',3,[(51.775,52.405)],'First complete command; no mid-word splice.')
emit('489',3,[(52.425,53.17)],'Second complete command; separate from 488.')
emit('549',4,[(29.90,30.535)],'Removed the extra repeated ending after the phrase.')
emit('586-1',4,[(70.26,71.835)],'Restored the full first phrase; previous split was inside it.')
emit('586-2',4,[(71.845,72.63)],'Starts at the next phrase, without the previous phrase tail.')
emit('572',4,[(57.19,57.625)],'Isolated the short command with its decay; removed neighboring speech added by the previous recovery.')

emit('605',4,[(87.765,88.505)],'Kept the command and its decay; removed the detached burst at the end of the recording.')

# The final 596/598 edit is recorded in a separate decision file after inspection.
decision=json.loads((root/'free-world-audio-diagnostics/final-596-decision.json').read_text())
for item in decision:
    emit(item['label'],4,item['ranges'],item['note'])

(out/'manifest.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Targeted voice repairs</title><style>
body{font:16px system-ui;background:#101722;color:#e8eef8;max-width:1000px;margin:32px auto;padding:0 20px}p{line-height:1.6;color:#b9c9dc}section{background:#1b2a3e;border:1px solid #354d6e;padding:20px;border-radius:12px;margin:14px 0}h2{margin:0 0 8px}audio{width:100%;max-width:600px}small{display:block;color:#bac9dd;margin-top:10px}button{padding:12px;background:#385b83;color:white;border:0;border-radius:8px;cursor:pointer}</style>
<h1>Targeted source-based repairs</h1><p>Only the flagged entries from the last review. 488/489 is separated as requested. 596/598 is also presented separately because its previous join combined separate source passages and shortened the ending of 598. These are review candidates, not certified phrase-perfect cuts. All other clips are recorded as approved and unchanged. Game pool unchanged.</p><button onclick="document.querySelectorAll('audio').forEach(a=>a.pause())">Stop audio</button><main id="board"></main><script>
const rows=DATA;
for(const row of rows){const section=document.createElement('section');const heading=document.createElement('h2');heading.textContent=row.label;const note=document.createElement('p');note.textContent=row.note;const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=row.file;audio.onplay=()=>document.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause()});const meta=document.createElement('small');meta.textContent=row.duration.toFixed(3)+' seconds';section.append(heading,note,audio,meta);document.querySelector('#board').append(section)}
</script></html>'''.replace('DATA',json.dumps(rows))
(out/'soundboard.html').write_text(html,encoding='utf-8')
for row in rows:
    decoded=subprocess.check_output([str(ff),'-v','error','-i',str(out/row['file']),'-f','f32le','-ac','1','-ar','24000','-'])
    assert abs(len(decoded)/4/24000-row['duration'])<.01
print(json.dumps(dict(candidates=len(rows),all_decoded=True)))
