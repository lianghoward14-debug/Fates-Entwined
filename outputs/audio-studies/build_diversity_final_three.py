from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

def resample(a,length):
    return np.interp(np.linspace(0,len(a)-1,int(length*SR)),np.arange(len(a)),a)

def crown_bell(freq=523.25,length=.72):
    t=np.arange(int(length*SR))/SR
    s=sum(np.sin(2*np.pi*freq*m*t)*g for m,g in [(1,.58),(2.01,.22),(2.77,.17),(4.08,.08)])
    return fade(s*np.exp(-t*5.5),.003,.08)

results=[]

# Chloe: the card fan opens, then four declarations receive distinct wax seals.
a=np.zeros((N,2))
put(a,clip(1102,.08,.72,1.35),.05,.34,-.18)
for j,(at,pan,f) in enumerate([(.61,-.62,142),(.82,-.20,156),(1.03,.20,149),(1.24,.62,163)]):
    put(a,wood(f,.26),at,.52,pan)
put(a,clip(2376,.04,.50,1.25),1.48,.22)
results.append(save('chloe-four-declaration-seals',a))

# Taylor: one paper identity unfolds, divides, and resolves as two matching forms.
a=np.zeros((N,2))
page=clip(1105,.01,.76,1.0)
put(a,page,.11,.40,-.56)
put(a,resample(page,.64)[::-1].copy(),.36,.34,.56)
for at,pan,f in [(.94,-.44,232),(1.10,.44,232)]:
    put(a,wood(f,.22),at,.28,pan)
put(a,crown_bell(329.63,.46),1.36,.10)
results.append(save('taylor-unfolding-double',a))

# Phil: four masonry rises lead to a single unmistakable crown bell.
a=np.zeros((N,2))
stone=clip(388,.12,.42,1.18)
for j,(at,pan,f) in enumerate([(.12,-.66,61),(.34,-.22,68),(.56,.22,75),(.78,.66,82)]):
    put(a,stone,at,.16,pan);put(a,wood(f,.30),at+.03,.31,pan)
put(a,crown_bell(523.25,.86),1.15,.42)
put(a,crown_bell(784.88,.52),1.27,.15)
results.append(save('phil-pillars-and-crown',a))

print(json.dumps(results,indent=2))
