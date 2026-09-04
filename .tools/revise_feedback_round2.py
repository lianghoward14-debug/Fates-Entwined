from pathlib import Path
import json
import numpy as np

# Reuse audio helpers without running the previous batch generation.
exec((Path(__file__).parent/'build_feedback_corrections.py').read_text().split('# Preserve approved')[0])
previous=out
out=root/'free-world-feedback-round2'
(out/'clips').mkdir(parents=True,exist_ok=True)
def prior(name): return read(previous/'clips'/name)
def trim_fragment(label,x):
    cut=valley(x,len(x)/24000-.22,margin=.06)
    save(label,x[:cut],'ending fragment removed; review')
split('482-part-1a',prior('482-part-1a.mp3'),[1.06])
trim_fragment('482-part-3a',prior('482-part-3a.mp3'))
save('482-part-4a+4b',part(482,4),'rejoined')
save('488+489',np.concatenate([prior('488-corrected.mp3'),prior('489-corrected.mp3')]),'rejoined including transferred tail')
x=prior('586-1.mp3'); cut=valley(x,len(x)/24000-.20,margin=.06)
save('586-1',x[:cut],'tail transferred to part 2')
save('586-2',np.concatenate([x[cut:],prior('586-2.mp3')]),'includes missing start from part 1')
trim_fragment('596+598',prior('596_598.mp3'))
trim_fragment('512-part-4',prior('512-part-4-cleanup.mp3'))
trim_fragment('549',original(549))

# Align each truncated clip to the actual recording; recover context, not invented speech.
source=read(Path('C:/Users/liang/Downloads/Hearts of Iron IV All National Voice Sounds With WW2 Footages of Nations(1) (mp3cut.net)(3).mp3'))
recovery=[]
for number in [572,605]:
    clip=original(number)
    # FFT matched filtering on downsampled audio.
    a=source[::3]; b=clip[::3]; size=1<<(len(a)+len(b)-1).bit_length()
    corr=np.fft.irfft(np.fft.rfft(a,size)*np.fft.rfft(b[::-1],size),size)
    offset=max(0,int(np.argmax(corr[len(b)-1:len(a)]))*3)
    start=max(0,offset-int(.16*24000)); end=min(len(source),offset+len(clip)+int(.40*24000))
    candidate=source[start:end]
    save(str(number)+'-source-recovery',candidate,'source context restored; review boundary')
    recovery.append(dict(number=number,source_start=start/24000,source_end=end/24000,source_duration=len(source)/24000,reaches_source_end=end==len(source)))

flagged={'482 part 1a','482 part 3a','482 part 4a','482 part 4b','488-corrected','489-corrected','586-1','586-2','596+598','512-part-4-cleanup','549-cleanup','572-cleanup','605-cleanup'}
prev=json.loads((previous/'manifest.json').read_text())
approved=[x for x in prev if x['number'] not in flagged]
(out/'review-record.json').write_text(json.dumps(dict(approved_previous=approved,pending=rows,recovery=recovery,implemented=False),indent=2),encoding='utf-8')
(out/'manifest.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
html=(previous/'soundboard.html').read_text()
start=html.index('const items=');end=html.index(';let audio',start)
html=html[:start]+'const items='+json.dumps(rows)+html[end:]
start=html.index('<h1>');end=html.index('<p id="count">',start)
html=html[:start]+'<h1>Latest requested corrections</h1><p>Only the latest flagged clips. Approved files are unchanged. Source-recovery clips include extra original context and need boundary review; no speech was synthesized. Game pool unchanged.</p>'+html[end:]
(out/'soundboard.html').write_text(html,encoding='utf-8')
print(json.dumps(dict(candidates=len(rows),recovery=recovery)))
