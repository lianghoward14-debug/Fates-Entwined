import json, subprocess, runpy
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parent.parent
ff=next((root/'.tools/ffmpeg').rglob('ffmpeg.exe'))
old=root/'free-world-remaining-review'
out=root/'free-world-feedback-corrections'
(out/'clips').mkdir(parents=True,exist_ok=True)
manifest=json.loads((old/'manifest.json').read_text(encoding='utf-8-sig'))
lookup={x['number']:x for x in manifest}
rows=[]
def read(path):
    return np.frombuffer(subprocess.check_output([str(ff),'-v','error','-i',str(path),'-f','f32le','-ac','1','-ar','24000','-']),dtype=np.float32).copy()
def original(n): return read(old/lookup[n]['original'])
def part(n,p): return read(old/lookup[n]['parts'][p-1]['file'])
def valley(x,target=None,margin=.16):
    step=120
    rms=np.sqrt(np.mean(x[:len(x)//step*step].reshape(-1,step)**2,axis=1))
    rms=np.convolve(rms,np.ones(5)/5,mode='same')
    dur=len(x)/24000
    lo,hi=margin,dur-margin
    if target is not None: lo,hi=max(lo,target-.12),min(hi,target+.12)
    a,b=int(lo/.005),int(hi/.005)
    return (a+int(np.argmin(rms[a:max(a+1,b)])))*step
def save(label,x,note):
    name=label.replace(' ','-').replace('+','_')+'.mp3'
    subprocess.run([str(ff),'-v','error','-y','-f','f32le','-ar','24000','-ac','1','-i','-','-af','afade=t=in:d=0.004,areverse,afade=t=in:d=0.008,areverse','-q:a','2',str(out/'clips'/name)],input=x.astype(np.float32).tobytes(),check=True)
    rows.append(dict(number=label,original='clips/'+name,duration=len(x)/24000,parts=[dict(label=label+' — '+note,file='clips/'+name,duration=len(x)/24000)]))
def split(label,x,targets):
    cuts=[0]+[valley(x,t) for t in targets]+[len(x)]
    assert cuts==sorted(set(cuts))
    for i,(a,b) in enumerate(zip(cuts,cuts[1:]),1): save(f'{label}-{i}',x[a:b],'new split; review')

# Preserve approved 482 part 2; expose only staged replacements.
pending=json.loads((old/'pending-corrections/482.json').read_text())
for p in pending['replacements']: save(p['label'],read(old/'pending-corrections'/p['file']),'pending recut')
split('483-part-1',part(483,1),[.54,1.10,1.77,2.31,2.90,3.38,4.10,4.95,5.76])
split('484-part-1',part(484,1),[.98])
for a,b,target in [(485,486,1.05),(488,489,.40)]:
    x=original(a); cut=valley(x,target,margin=.08)
    save(str(a)+'-corrected',x[:cut],'tail moved to next clip')
    save(str(b)+'-corrected',np.concatenate([x[cut:],original(b)]),f'includes tail of {a}')
split('492',original(492),[.85])
split('493',original(493),[.80,1.92])
split('498',original(498),[1.71,2.96,4.08])
split('501-part-2',part(501,2),[.70])
split('511',original(511),[.83])
split('512-part-3',part(512,3),[1.04,2.21])
split('586',original(586),[1.18])
for a,b in [(508,509),(532,533),(566,567),(596,598)]:
    save(f'{a}+{b}',np.concatenate([original(a),original(b)]),'merged in requested order')
# Unspecified defects: edge cleanup only, explicitly not claimed as repaired speech.
for n,p in [(512,4),(549,None),(572,None),(605,None)]:
    x=part(n,p) if p else original(n)
    active=np.where(np.abs(x)>max(.003,float(np.max(np.abs(x)))*.025))[0]
    if len(active): x=x[max(0,active[0]-240):min(len(x),active[-1]+481)]
    save(f'{n}'+(f'-part-{p}' if p else '')+'-cleanup',x,'edge cleanup only; defect still needs review')
affected={482,483,484,485,486,488,489,492,493,498,501,508,509,511,512,532,533,549,566,567,572,586,596,598,605}
approved=[]
for x in manifest:
    for i,p in enumerate(x['parts'],1):
        if x['number'] not in affected or (x['number'],i) in [(482,2),(483,2),(484,2),(501,1),(512,1),(512,2)]: approved.append(p)
(out/'approval-record.json').write_text(json.dumps(dict(approved=approved,pending_numbers=sorted(affected),implemented=False),indent=2),encoding='utf-8')
(out/'manifest.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
html=(old/'soundboard.html').read_text(encoding='utf-8')
start=html.index('const items=');end=html.index(';let audio',start)
html=html[:start]+'const items='+json.dumps(rows)+html[end:]
html=html.replace('All remaining Free World voices','Requested voice corrections').replace('All remaining Free World voices · 482–605','Requested voice corrections')
start=html.index('<h1>');end=html.index('<p id="count">',start)
html=html[:start]+'<h1>Requested corrections only</h1><p>New cuts and requested merges, including pending 482 revisions. These are review candidates. 512 part 4, 549, 572 and 605 have edge cleanup only—the specific speech defect remains unverified. Approved clips and game assets are untouched.</p>'+html[end:]
html=html.replace("+' playable candidates from 124 originals'","+' correction candidates'")
html=html.replace("s.dataset.number=item.number","s.dataset.number=String(item.number)")
html=html.replace("'<b>Original '","'<b>Correction '").replace("'Compare original · '","'Play correction · '")
(out/'soundboard.html').write_text(html,encoding='utf-8')
assert all((out/p['file']).is_file() for row in rows for p in row['parts'])
print(json.dumps(dict(corrections=len(rows),approved_candidates=len(approved))))
