from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

DURATION=2.2
frames=int(SR*DURATION)
a=np.zeros((frames,2))
t=np.arange(frames)/SR

# One uninterrupted body of real moving water.
bed=clip(2454,31.0,DURATION,1.0)
bed=np.convolve(bed,np.ones(17)/17,'same')
bed/=max(.001,np.max(np.abs(bed)))

# Continuously accelerating rotation. The left and right channels follow the
# same water body with opposing circular emphasis, so no discrete contacts are
# audible while the four spiral arms tighten.
phase=2*np.pi*(1.15*t+1.72*t*t)
rotation_l=.66+.34*np.sin(phase)
rotation_r=.66+.34*np.sin(phase+np.pi)

# Energy rises with the spiral, broadens at the radial burst, and recedes without
# stopping. The minimum remains above zero throughout the animation.
rise=np.clip(t/.95,0,1)
release=np.where(t<1.24,1,np.clip(1-(t-1.24)/1.25,0,1))
envelope=.28+.50*rise*release
burst=.18*np.exp(-((t-1.20)/.25)**2)

# A continuous low water-pressure layer follows the same acceleration curve.
pressure=np.sin(2*np.pi*(54*t+18*t*t))
pressure+=.32*np.sin(2*np.pi*(103*t+8*t*t))
pressure*=.10+.10*rise

a[:,0]=bed*envelope*rotation_l+pressure*(.72+.28*np.sin(phase*.5))
a[:,1]=np.roll(bed,int(.013*SR))*envelope*rotation_r+pressure*(.72+.28*np.sin(phase*.5+np.pi))
a[:,0]+=bed*burst*.32
a[:,1]+=np.roll(bed,int(.021*SR))*burst*.32

# Only the file boundary fades; there are no internal gaps, hits, or resets.
a[:int(.04*SR)]*=np.linspace(0,1,int(.04*SR))[:,None]
a[-int(.18*SR):]*=np.linspace(1,0,int(.18*SR))[:,None]
result=save('selva-continuous-whirlpool-v4',a)
assert result['peak']<1 and result['rms']>.02
print(json.dumps(result))
