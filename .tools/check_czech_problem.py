import sys,json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'.tools/python-audio'))
from faster_whisper import WhisperModel
model=WhisperModel('small',device='cpu',compute_type='int8',download_root=str(root/'.tools/whisper-models'))
out=[]
for start in [79,55]:
    segments,_=model.transcribe(str(root/f'free-world-audio-diagnostics/context-4-{start}.wav'),language='cs',beam_size=5,word_timestamps=True,condition_on_previous_text=False)
    rows=[dict(start=s.start+start,end=s.end+start,text=s.text,words=[dict(start=w.start+start,end=w.end+start,word=w.word) for w in s.words or []]) for s in segments]
    out.append(dict(start=start,segments=rows));print(json.dumps(out[-1],ensure_ascii=True),flush=True)
    (root/'free-world-audio-diagnostics/czech-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
