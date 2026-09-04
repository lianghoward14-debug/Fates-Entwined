"""Install only versions approved in successive user review rounds."""
import json, shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
dest=root/'soundeffects/free-world-zone-voices'
def load(p): return json.loads((root/p).read_text(encoding='utf-8-sig'))
approved=[]
def add(base,label,file):
    source=(root/base/file).resolve()
    assert source.is_file(), source
    approved.append(dict(label=str(label),source=source.relative_to(root).as_posix()))
for p in load('free-world-feedback-corrections/approval-record.json')['approved']:
    add('free-world-remaining-review',p['label'],p['file'])
for p in load('free-world-feedback-round2/review-record.json')['approved_previous']:
    add('free-world-feedback-corrections',p['number'],p['original'])
round2=set(load('free-world-feedback-round2/latest-user-review.json')['approved'])
for p in load('free-world-feedback-round2/manifest.json'):
    if p['number'] in round2: add('free-world-feedback-round2',p['number'],p['original'])
excluded={'549','572','605','586-2','598-recut'}
for p in load('free-world-source-boundary-review/manifest.json'):
    if p['label'] not in excluded: add('free-world-source-boundary-review',p['label'],p['file'])
assert len({p['source'] for p in approved})==len(approved)
for i,p in enumerate(approved,1):
    p['installed_file']=f'approved-late-{i:03}.mp3'
    target=dest/p['installed_file']
    source=root/p['source']
    if target.exists(): assert target.read_bytes()==source.read_bytes(), 'Refusing to overwrite different asset'
    else: shutil.copyfile(source,target)
    assert target.stat().st_size>0
(dest/'approved-late-manifest.json').write_text(json.dumps(dict(excluded=sorted(excluded),clips=approved),indent=2),encoding='utf-8')
print(json.dumps(dict(count=len(approved),files=[p['installed_file'] for p in approved],labels=[p['label'] for p in approved])))
