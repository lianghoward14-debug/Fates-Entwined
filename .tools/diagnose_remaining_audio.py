import json, subprocess, sys
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parent.parent
ff=next((root/'.tools/ffmpeg').rglob('ffmpeg.exe'))
out=root/'free-world-audio-diagnostics'
out.mkdir(exist_ok=True)
def read(p):
    return np.frombuffer(subprocess.check_output([str(ff),'-v','error','-i',str(p),'-f','f32le','-ac','1','-ar','16000','-']),dtype=np.float32).copy()
sources={}
results=[]
for batch,ids in [(3,[487,488,489,490]),(4,[548,549,550,571,572,573,585,586,587,595,596,597,598,599,604,605])]:
    path=Path('C:/Users/liang/Downloads')/f'Hearts of Iron IV All National Voice Sounds With WW2 Footages of Nations(1) (mp3cut.net)({batch-1}).mp3'
    src=read(path);sources[batch]=src
    for number in ids:
        local=number-(473 if batch==3 else 512)
        clip=read(root/f'voice-line-batches/set-{batch}/clips/voice-line-{local:03}.mp3')
        size=1<<(len(src)+len(clip)-1).bit_length()
        corr=np.fft.irfft(np.fft.rfft(src,size)*np.fft.rfft(clip[::-1],size),size)
        offset=int(np.argmax(corr[len(clip)-1:len(src)]))
        match=src[offset:offset+len(clip)]
        similarity=float(np.dot(match,clip)/(np.linalg.norm(match)*np.linalg.norm(clip)))
        results.append(dict(number=number,batch=batch,start=offset/16000,end=(offset+len(clip))/16000,similarity=similarity))
(out/'alignment.json').write_text(json.dumps(results,indent=2))
from PIL import Image, ImageDraw
fig=Image.new('RGB',(1600,1500),'white'); draw=ImageDraw.Draw(fig)
for panel,(batch,ids) in enumerate([(3,[488,489]),(4,[549]),(4,[572]),(4,[586]),(4,[596,597,598]),(4,[605])]):
    r=[x for x in results if x['number'] in ids]; start=max(0,min(x['start'] for x in r)-.5);end=min(len(sources[batch])/16000,max(x['end'] for x in r)+.5)
    x=sources[batch][int(start*16000):int(end*16000)]; t=np.arange(len(x))/16000+start
    top=panel*250; draw.text((10,top+5),str(ids),fill='black')
    px=lambda s: 50+(s-start)/(end-start)*1500
    for tick in np.arange(np.ceil(start*10)/10,end,.1):
        p=px(tick);draw.line((p,top+30,p,top+210),fill='#ddd');draw.text((p-12,top+220),f'{tick:.1f}',fill='black')
    peak=max(np.max(np.abs(x)),.01)
    for column in range(1500):
        seg=x[int(column*len(x)/1500):max(int((column+1)*len(x)/1500),int(column*len(x)/1500)+1)]
        draw.line((50+column,top+120-float(np.max(seg))/peak*80,50+column,top+120-float(np.min(seg))/peak*80),fill='#234c90')
    for v in r:
        draw.line((px(v['start']),top+30,px(v['start']),top+210),fill='green',width=2)
        draw.line((px(v['end']),top+30,px(v['end']),top+210),fill='red',width=2)
fig.save(out/'waveforms.png')
print(json.dumps(results))
