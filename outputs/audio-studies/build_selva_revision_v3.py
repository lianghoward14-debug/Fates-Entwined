from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

DURATION=2.2
a=np.zeros((int(SR*DURATION),2))

# A filtered river bed gives the maelstrom a physical water body while leaving
# room for the spiral rhythm and collapse.
bed=clip(2454,18.4,1.90)
bed=np.convolve(bed,np.ones(19)/19,'same')
bed*=np.sin(np.linspace(0,np.pi,len(bed)))**.7
put(a,bed,.06,.22)

# Four accelerating spiral arms. Each pass crosses the stereo field and grows
# shorter as the center tightens.
source=clip(1311,.03,.74,.92)
for j,(at,length,gain) in enumerate([
    (.18,.66,.18),(.42,.52,.23),(.63,.39,.29),(.80,.28,.36)
]):
    arm=np.interp(np.linspace(0,len(source)-1,int(length*SR)),np.arange(len(source)),source)
    arm=fade(arm,.08,.035)
    put(a,arm,at,gain,-.78 if j%2==0 else .78)

# Tightening watery rotor made from correlated low noise; its pulse accelerates
# and cuts out just before the visible radial burst.
length=.92;t=np.arange(int(length*SR))/SR
n=rng.normal(0,1,len(t)); smooth=np.convolve(n,np.ones(27)/27,'same')
phase=2*np.pi*(2.0*t+4.8*t*t)
rotor=smooth*(.22+.78*np.maximum(0,np.sin(phase))**2)*np.sin(np.pi*t/length)**.8
put(a,rotor,.24,.42,-.28)
put(a,np.roll(rotor,int(.025*SR)),.24,.42,.28)

# A brief vacuum: the water vanishes, followed by a low pressure snap precisely
# at the animation's outward burst.
vac_start=int(1.04*SR);vac_end=int(1.13*SR)
a[vac_start:vac_end]*=np.linspace(1,.04,vac_end-vac_start)[:,None]
t=np.arange(int(.43*SR))/SR
snap=(np.sin(2*np.pi*(58*t-20*t*t))+.28*np.sin(2*np.pi*117*t))*np.exp(-t*13)
put(a,fade(snap,.002,.025),1.115,.55)

# One large real crash, followed by a low receding undertow. No bubbles or
# musical resolution: the wave itself is the payoff.
crash=clip(1311,.01,.82,.70)
put(a,crash,1.12,.88)
tail=clip(2454,26.2,.84,1.28)[::-1].copy()
tail=np.convolve(tail,np.ones(31)/31,'same')
put(a,fade(tail,.025,.20),1.34,.27)

result=save('selva-tightening-maelstrom-v3',a)
assert result['peak']<1 and result['rms']>.02
print(json.dumps(result))
