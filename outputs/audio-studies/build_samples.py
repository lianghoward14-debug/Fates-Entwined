from pathlib import Path
import wave, json
import numpy as np

ROOT=Path(__file__).parent
SR=32000
N=int(SR*2.35)
rng=np.random.default_rng(1766)

def read(number):
    with wave.open(str(ROOT/f'source-{number}.wav'),'rb') as w:
        width,channels,rate=w.getsampwidth(),w.getnchannels(),w.getframerate()
        raw=w.readframes(w.getnframes())
    if width==3:
        b=np.frombuffer(raw,np.uint8).reshape(-1,3).astype(np.int32)
        a=b[:,0]+(b[:,1]<<8)+(b[:,2]<<16)
        a=np.where(a>=8388608,a-16777216,a)/8388608
    else: a=np.frombuffer(raw,'<i2').astype(float)/32768
    a=a.reshape(-1,channels).mean(axis=1)
    return np.interp(np.arange(int(len(a)*SR/rate))*rate/SR,np.arange(len(a)),a)

def fade(a,attack=.008,release=.04):
    a=a.copy(); na=min(len(a),int(SR*attack)); nr=min(len(a),int(SR*release))
    a[:na]*=np.linspace(0,1,na); a[-nr:]*=np.linspace(1,0,nr)
    return a

def clip(number,start,length,rate=1):
    a=read(number); pos=(start+np.arange(int(length*SR))*rate/SR)*SR
    a=np.interp(pos,np.arange(len(a)),a,left=0,right=0)
    peak=max(.001,np.max(np.abs(a)))
    return fade(a/peak)

def put(out,a,at,gain=1,pan=0):
    i=int(at*SR); a=a[:len(out)-i]
    out[i:i+len(a),0]+=a*gain*np.sqrt((1-pan)/2)
    out[i:i+len(a),1]+=a*gain*np.sqrt((1+pan)/2)

def wood(freq=150,length=.22):
    t=np.arange(int(length*SR))/SR
    # Inharmonic, rapidly damped wooden body with a short contact transient.
    return fade(sum(np.sin(2*np.pi*freq*m*t)*np.exp(-t*d)*g for m,d,g in [(1,24,.7),(2.73,48,.28),(4.21,80,.12)])+rng.normal(0,.15,len(t))*np.exp(-t*190),.001,.02)

def scrape(length=.14):
    t=np.arange(int(length*SR))/SR; n=rng.normal(0,1,len(t))
    return fade(np.convolve(n,np.ones(13)/13,'same')*(.3+.7*np.sin(np.pi*t/length)**2),.015,.04)

def save(name,a):
    peak=np.max(np.abs(a)); a*=.78/max(peak,.01)
    a[-int(.07*SR):]*=np.linspace(1,0,int(.07*SR))[:,None]
    with wave.open(str(ROOT/f'{name}.wav'),'wb') as w:
        w.setparams((2,2,SR,0,'NONE','not compressed')); w.writeframes((a*32767).astype('<i2').tobytes())
    return {'file':name+'.wav','seconds':len(a)/SR,'peak':round(float(np.max(np.abs(a))),3),'rms':round(float(np.sqrt(np.mean(a*a))),3)}

results=[]
a=np.zeros((N,2))
put(a,clip(1444,2,1.12),.04,.36,-.15)
put(a,scrape(.20),.18,.3,-.4); put(a,scrape(.24),.65,.34,.3)
put(a,wood(70,.4),1.14,.8); put(a,wood(112,.2),1.37,.25,.25)
results.append(save('mark-kemper-projector-and-paper',a))

a=np.zeros((N,2))
put(a,clip(2376,.05,.63),.05,.50,-.35)
for at,pan,f in [(1.04,-.5,155),(1.24,0,170),(1.44,.5,145)]:
    put(a,wood(f),at,.65,pan); put(a,scrape(.09),at+.025,.26,pan)
results.append(save('mark-menz-pencil-and-seals',a))

a=np.zeros((N,2))
for at,pan,rate in [(.68,-.5,1.05),(.94,0,.94),(1.20,.5,1.12)]:
    put(a,clip(1993,.02,.40,rate),at,.5,pan)
put(a,scrape(.23),1.48,.4); put(a,wood(95,.19),1.65,.65)
# Dry latch, deliberately no generic musical success chord.
put(a,wood(680,.055),1.71,.23)
results.append(save('hugh-roberts-coins-and-case',a))

a=np.zeros((N,2))
bed=clip(2454,12,1.95); bed=fade(bed,.25,.4)
put(a,bed,.02,.40)
for at,pan,rate in [(.34,-.55,.9),(.94,.55,1.15)]:
    splash=clip(1311,0,.65,rate)
    put(a,splash,at,.55,pan); put(a,splash,at+.19,.13,-pan)
results.append(save('duncan-heyward-river-and-echo',a))
(ROOT/'sample-checks.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
