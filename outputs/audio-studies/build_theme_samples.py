from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

def resonant(freq,length=.42,decay=8):
    t=np.arange(int(length*SR))/SR
    body=sum(np.sin(2*np.pi*freq*m*t)*g for m,g in [(1,.7),(1.47,.3),(2.19,.18)])
    return fade(body*np.exp(-t*decay)+rng.normal(0,.07,len(t))*np.exp(-t*35),.002,.035)

def rope_pull(length=.55):
    t=np.arange(int(length*SR))/SR
    n=rng.normal(0,1,len(t)); rough=n-np.roll(n,2)
    tension=np.sin(2*np.pi*(88*t+125*t*t))*np.exp(-t*4)
    return fade(rough*.11*np.sin(np.pi*t/length)**1.2+tension*.22,.015,.06)

results=[]

# Boleslaw: three visible rockets launch and blossom independently.
a=np.zeros((N,2))
whistle=clip(3103,.02,.62,1.12)
burst=clip(2994,.00,.74,1.0)
for j,(at,pan,rate) in enumerate([(.04,-.62,1.12),(.27,0,.98),(.50,.62,1.2)]):
    w=np.interp(np.linspace(0,len(whistle)-1,int(len(whistle)/rate)),np.arange(len(whistle)),whistle)
    put(a,w,at,.34,pan)
    b=np.interp(np.linspace(0,len(burst)-1,int(len(burst)*(1.05-j*.08))),np.arange(len(burst)),burst)
    put(a,b,at+.28,.48,pan)
results.append(save('boleslaw-three-firework-blooms',a))

# Sebastyen: four stone columns rise in sequence, then the pediment settles.
a=np.zeros((N,2))
bricks=clip(388,.08,.54,1.0)
for j,(at,pan,f) in enumerate([(.18,-.7,70),(.39,-.23,76),(.60,.23,82),(.81,.7,88)]):
    put(a,bricks,at,.19,pan)
    put(a,resonant(f,.38,9),at+.04,.34,pan)
put(a,resonant(48,.66,5),1.17,.58)
put(a,clip(388,.55,.68,.85),1.12,.23)
results.append(save('sebastyen-rising-stone-pillars',a))

# Li-Hua: twelve blades gather as three broad sweeps, then descend as one storm.
a=np.zeros((N,2))
fast=clip(2792,.01,.52,1.0); strike=clip(2160,.02,.48,1.03)
for at,pan,rate in [(.09,-.72,1.08),(.34,.72,.92),(.61,-.18,1.22)]:
    sw=np.interp(np.linspace(0,len(fast)-1,int(len(fast)/rate)),np.arange(len(fast)),fast)
    put(a,sw,at,.38,pan)
for j,at in enumerate([1.00,1.12,1.24]):
    put(a,strike,at,.27,(-1+j)*.48)
put(a,scrape(.50),1.03,.17)
results.append(save('li-hua-gathering-blade-storm',a))

# Fisherman Wojciech: net casts across the water, draws taut, then hauls two fish.
a=np.zeros((N,2))
put(a,rope_pull(.76),.06,.48,-.45)
put(a,clip(1311,.10,.52,1.35),.37,.26,.48)
for j,at in enumerate([.62,.77,.92]):
    put(a,rope_pull(.29),at,.25,-.35+j*.35)
put(a,resonant(92,.34,12),1.20,.23,-.35)
put(a,resonant(119,.31,14),1.36,.20,.38)
put(a,clip(1311,.19,.52,1.3),1.40,.16)
results.append(save('wojciech-net-cast-and-haul',a))

print(json.dumps(results,indent=2))
