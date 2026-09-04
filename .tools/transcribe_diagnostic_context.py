import sys,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'.tools/python-audio'))
from faster_whisper import WhisperModel
model=WhisperModel('small',device='cpu',compute_type='int8',download_root=str(root/'.tools/whisper-models'))
ff=next((root/'.tools/ffmpeg').rglob('ffmpeg.exe'))
out=root/'free-world-audio-diagnostics'
result=[]
for batch,start,end in [(3,50,54),(4,28.5,32),(4,55,59),(4,69,74),(4,79,84),(4,85,88.644)]:
    src=Path('C:/Users/liang/Downloads')/f'Hearts of Iron IV All National Voice Sounds With WW2 Footages of Nations(1) (mp3cut.net)({batch-1}).mp3'
    dest=out/f'context-{batch}-{start}.wav'
    subprocess.run([str(ff),'-v','error','-y','-i',str(src),'-ss',str(start),'-t',str(end-start),str(dest)],check=True)
    segments,info=model.transcribe(str(dest),beam_size=5,word_timestamps=True,condition_on_previous_text=False)
    row=dict(batch=batch,start=start,language=info.language,segments=[dict(start=s.start+start,end=s.end+start,text=s.text,words=[dict(start=w.start+start,end=w.end+start,word=w.word) for w in s.words or []]) for s in segments])
    result.append(row);print(json.dumps(row,ensure_ascii=True),flush=True)
    (out/'context-transcripts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
