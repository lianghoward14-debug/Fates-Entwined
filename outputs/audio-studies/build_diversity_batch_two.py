from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

def resample(a,length):
    return np.interp(np.linspace(0,len(a)-1,int(length*SR)),np.arange(len(a)),a)

def binding_thump(length=.34):
    t=np.arange(int(length*SR))/SR
    return fade((np.sin(2*np.pi*72*t)*.6+np.sin(2*np.pi*131*t)*.22)*np.exp(-t*14)+rng.normal(0,.08,len(t))*np.exp(-t*55),.002,.035)

results=[]

# Kazumi: brisk browsing resolves into one large page and a leather-bound close.
a=np.zeros((N,2))
pages=clip(1102,.05,1.18,1.35)
put(a,pages,.05,.47,-.24)
put(a,clip(1105,.00,.78,.92),.84,.42,.35)
put(a,binding_thump(.42),1.48,.62)
results.append(save('kazumi-living-storybook',a))

# Jake: an actual burner bed, three ingredient placements, then iron and plate.
a=np.zeros((N,2))
stove=clip(1831,1.4,1.86,1.0);stove=np.convolve(stove,np.ones(9)/9,'same')
put(a,stove,.03,.25)
iron=clip(3135,.02,.54,1.0)
for j,(at,pan,rate) in enumerate([(.34,-.45,1.3),(.58,.05,1.05),(.82,.45,.85)]):
    put(a,resample(iron,len(iron)/SR/rate),at,.20+j*.035,pan)
put(a,clip(1799,.02,.85,1.0),1.24,.42)
results.append(save('jake-griddle-perfect-stack',a))

# Francisek: recognizable old car arrival, passenger door, clean departure.
a=np.zeros((N,2))
arrival=resample(clip(1536,.00,1.55,1.0),.72)
put(a,arrival,.02,.38,-.42)
put(a,clip(1564,.00,.62,1.0),.72,.48,.12)
departure=resample(clip(1538,.08,1.25,1.0),.86)
put(a,departure,1.13,.42,.55)
results.append(save('francisek-chauffeur-arrival',a))

# Isaac: a sustained nucleus charge with three orbiting electrical discharges.
a=np.zeros((N,2))
power=clip(2600,.08,1.82,1.0)
put(a,power,.03,.34)
spark=clip(1455,.02,.38,1.18)
for at,pan,rate in [(.52,-.62,1.2),(.76,0,1.0),(1.00,.62,.82)]:
    put(a,resample(spark,len(spark)/SR/rate),at,.28,pan)
t=np.arange(int(.58*SR))/SR
nucleus=np.sin(2*np.pi*(95*t+155*t*t))*np.exp(-t*5)
put(a,fade(nucleus,.01,.06),1.15,.22)
results.append(save('isaac-excited-nucleus',a))

print(json.dumps(results,indent=2))
