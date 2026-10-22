from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

def resample(a,length):
    return np.interp(np.linspace(0,len(a)-1,int(length*SR)),np.arange(len(a)),a)

def wing(length=.26,pitch=1):
    t=np.arange(int(length*SR))/SR
    n=rng.normal(0,1,len(t)); soft=np.convolve(n,np.ones(max(3,int(25/pitch)))/max(3,int(25/pitch)),'same')
    env=np.sin(np.pi*t/length)**1.8
    return fade(soft*env,.015,.04)

def moon_tone(freq,length=.7):
    t=np.arange(int(length*SR))/SR
    s=(np.sin(2*np.pi*freq*t)+.35*np.sin(2*np.pi*freq*1.502*t)+.16*np.sin(2*np.pi*freq*2.01*t))
    return fade(s*np.exp(-t*4.2),.012,.08)

results=[]

# Maja: a real tank engine advances continuously, with two gear changes and a
# heavy final transmission lock matching the vehicle's approach.
a=np.zeros((N,2))
engine=clip(2753,2.2,1.98,1.0);engine=np.convolve(engine,np.ones(9)/9,'same')
put(a,engine,.02,.43)
gear=clip(2757,.02,.72,1.0)
put(a,gear,.50,.30,-.32);put(a,resample(gear,.60),1.05,.34,.34)
put(a,resonant(54,.48,8) if 'resonant' in globals() else wood(54,.48),1.44,.33)
results.append(save('maja-armored-advance',a))

# Bird-Cult Makenna: three broad wing passes cross independently, while a distant
# flock keeps the scene organic rather than turning it into another wind effect.
a=np.zeros((N,2))
flock=clip(20,.45,1.85,1.0);flock=np.convolve(flock,np.ones(13)/13,'same')
put(a,flock,.06,.18)
for at,pan,pitch in [(.15,-.72,.82),(.49,.68,1.0),(.83,-.18,1.18)]:
    put(a,wing(.38,pitch),at,.65,pan);put(a,wing(.29,pitch),at+.20,.40,-pan*.55)
results.append(save('makenna-three-birds-in-flight',a))

# Jaime: a continuous gentle shore supports three rising healing glints and a
# warm crescent resonance. There is no impact or generic success chord.
a=np.zeros((N,2))
shore=clip(1204,.35,2.10,1.0);shore=np.convolve(shore,np.ones(11)/11,'same')
put(a,shore,.02,.38)
for at,pan,f in [(.60,-.48,293.66),(.78,0,369.99),(.96,.48,440.0)]:
    put(a,moon_tone(f,.62),at,.10,pan)
put(a,moon_tone(174.61,.82),1.18,.14)
results.append(save('jaime-moonlit-healing-shore',a))

# Mr Secules: the written statement appears briefly, is scrubbed away in three
# passes, and ends with dry chalk dust instead of a tonal resolution.
a=np.zeros((N,2))
put(a,clip(2372,.02,.66,1.0),.04,.30,-.35)
eraser=clip(3085,.03,.78,1.0)
for at,pan,rate in [(.48,-.55,1.18),(.76,.15,.96),(1.04,.55,1.28)]:
    put(a,resample(eraser,len(eraser)/SR/rate),at,.40,pan)
put(a,scrape(.34),1.43,.28)
results.append(save('mr-secules-erased-statement',a))

print(json.dumps(results,indent=2))
