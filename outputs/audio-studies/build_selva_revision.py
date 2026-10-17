from pathlib import Path

# Reuse mixing helpers without rebuilding any of the earlier samples.
exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

a=np.zeros((int(SR*2.2),2))
# Reverse a real water splash into the growing spiral, rather than using a
# continuous noise bed. Four swelling passes follow the four visible arms.
pull=clip(1311,.08,.82,.85)[::-1].copy()
pull=fade(pull,.12,.025)
for at,pan,gain in [(.16,-.65,.20),(.32,.65,.24),(.48,-.35,.28)]:
    put(a,pull,at,gain,pan)

# A low descending pressure tone gives the center weight without a chord.
t=np.arange(int(.92*SR))/SR
pressure=np.sin(2*np.pi*(105*t-28*t*t))*.20*np.sin(np.pi*t/.92)**2
put(a,pressure,.22,.65)

# The animation's radial burst starts at 1.12 seconds: broad recorded crash,
# then a shorter reflected splash. The tail resolves into discrete bubbles.
crash=clip(1311,.02,.80,.78)
put(a,crash,1.12,.85,-.18)
put(a,clip(1311,.12,.54,1.25),1.24,.32,.55)
t=np.arange(int(.38*SR))/SR
impact=np.sin(2*np.pi*(66*t-29*t*t))*np.exp(-t*14)
put(a,fade(impact,.003,.04),1.12,.38)
for j,(at,f) in enumerate([(1.47,480),(1.59,330),(1.72,590),(1.83,270)]):
    t=np.arange(int(.16*SR))/SR
    bubble=np.sin(2*np.pi*(f*t+f*3*t*t))*np.exp(-t*32)
    put(a,fade(bubble,.004,.03),at,.10,(-1 if j%2 else 1)*.5)
result=save('selva-undertow-crash-v2',a)
assert result['peak']<1 and result['rms']>.01
print(json.dumps(result))
