from pathlib import Path

exec(Path(__file__).with_name('build_samples.py').read_text().split('results=[]')[0])

D=2.2
FRAMES=int(SR*D)

def fresh(): return np.zeros((FRAMES,2))

def tone(freq,length=.4,end=None,wave='sine',decay=5):
    t=np.arange(int(length*SR))/SR
    end=freq if end is None else end
    phase=2*np.pi*(freq*t+(end-freq)*t*t/(2*max(length,.001)))
    if wave=='triangle': s=2/np.pi*np.arcsin(np.sin(phase))
    elif wave=='square': s=np.sign(np.sin(phase))
    else: s=np.sin(phase)
    return fade(s*np.exp(-t*decay),.004,.04)

def noise(length=.35,smooth=1,shape='decay'):
    t=np.arange(int(length*SR))/SR;n=rng.normal(0,1,len(t))
    if smooth>1:n=np.convolve(n,np.ones(smooth)/smooth,'same')
    env=np.exp(-t*8) if shape=='decay' else np.sin(np.pi*t/length)**1.4
    return fade(n*env,.006,.035)

def chord(a,at,root,gain=.13,pan=0,minor=False):
    ratios=[1,1.2 if minor else 1.25,1.5,2]
    for j,r in enumerate(ratios):put(a,tone(root*r,.72,decay=4+j),at+j*.018,gain/(1+j*.35),pan)

def metallic(a,at,f=220,gain=.28,pan=0):
    for r,g in [(1,.7),(2.73,.34),(4.11,.17)]:put(a,tone(f*r,.42,decay=9+r),at,gain*g,pan)
    put(a,noise(.12,1),at,gain*.18,pan)

def thump(a,at,f=68,gain=.38,pan=0):
    put(a,tone(f,.45,max(35,f*.55),decay=11),at,gain,pan);put(a,noise(.11,15),at,gain*.5,pan)

def sweep(a,at,length=.45,low=180,high=900,gain=.22,pan=0):
    put(a,tone(low,length,high,decay=2),at,gain,pan);put(a,noise(length,7,'swell'),at,gain*.25,pan)

def src(number,start,length,rate=1): return clip(number,start,length,rate)

def output(name,a):
    if name.endswith('.wav'): name=name[:-4]
    result=save('new40-'+name,a)
    if result['rms']<.025: raise RuntimeError(name+' is too quiet')
    return result

results=[]

# 01 — heraldic eagle: wing launch, brass fifths, crown bell.
a=fresh();put(a,noise(.58,18,'swell'),.03,.24,-.4);put(a,noise(.58,18,'swell'),.18,.24,.4)
for j,f in enumerate([196,293.66,392]):put(a,tone(f,.55,wave='triangle',decay=4),.35+j*.24,.20)
metallic(a,1.22,587,.30);results.append(output('01-felicyta-white-eagle.wav',a))

# bh07 — a digital core boots, relays lock, then sustains.
a=fresh();put(a,src(2600,.03,1.45),.02,.34)
for j,(at,pan) in enumerate([(.32,-.5),(.57,0),(.82,.5)]):put(a,tone(210+j*85,.13,wave='square',decay=16),at,.13,pan)
put(a,src(1455,.05,.52,1.25),1.18,.28);results.append(output('bh07-agent-k-core-online.wav',a))

# bh11 — parchment agreement, pen signature, wax seal.
a=fresh();put(a,src(1105,.02,.72),.05,.37,-.35);put(a,src(2376,.02,.67),.54,.34,.28);thump(a,1.22,148,.42)
results.append(output('bh11-university-sealed-accord.wav',a))

# 45 — mountain wind and a descending sunset resonance.
a=fresh();put(a,noise(1.95,41,'swell'),.02,.28)
put(a,tone(330,1.65,92,decay=1.6),.12,.24);put(a,tone(165,1.25,82,decay=2),.48,.16,.32)
results.append(output('45-chingachlook-mountain-sunset.wav',a))

# 02 — six stars connect and an orbit completes.
a=fresh()
for j,(f,pan) in enumerate(zip([330,392,494,587,659,784],[-.7,-.42,-.14,.14,.42,.7])):put(a,tone(f,.32,decay=10),.08+j*.13,.16,pan)
put(a,tone(196,1.15,392,decay=3),.70,.14);results.append(output('02-anicka-starlit-path.wav',a))

# bh19 — two batteries charge independently and bridge together.
a=fresh();put(a,src(2600,.04,.95,1.2),.04,.28,-.45);put(a,src(2600,.10,.95,.92),.31,.28,.45)
put(a,src(1455,.02,.55),1.14,.36);results.append(output('bh19-abed-double-charge.wav',a))

# bh01 — sailcloth catches wind over a continuous sea.
a=fresh();put(a,src(1204,.3,2.05),.02,.31);put(a,noise(.85,23,'swell'),.18,.22,-.5);put(a,noise(.72,23,'swell'),.67,.18,.5)
put(a,tone(392,.62,523,decay=4),1.18,.12);results.append(output('bh01-anicka-voyage-at-sunrise.wav',a))

# 14 — spear drops, shield pulse throws four targets outward.
a=fresh();put(a,src(2792,.02,.52,1.25),.22,.38);metallic(a,.67,186,.34)
for j,pan in enumerate([-.7,-.24,.24,.7]):sweep(a,.76+j*.11,.30,260,1000,.12,pan)
results.append(output('14-alondra-clear-perimeter.wav',a))

# bh09 — one spear traces a full orbit and snaps into guard.
a=fresh();put(a,src(2792,.02,.62,.82),.08,.34,-.65);put(a,src(2792,.02,.62,1.2),.48,.31,.65);metallic(a,1.05,242,.38)
results.append(output('bh09-alondra-spear-orbit.wav',a))

# 66 — sketch strokes become three dry allegiance stamps.
a=fresh();put(a,src(2376,.02,.70),.04,.38,-.25)
for j,(at,pan) in enumerate([(.76,-.55),(.98,0),(1.20,.55)]):thump(a,at,150+j*12,.34,pan)
results.append(output('66-mark-menz-sketch-and-stamps-v2.wav',a))

# bh21 — granular desert wind climbs four dunes beneath a high sun.
a=fresh();put(a,noise(2.05,7,'swell'),.02,.31)
for j,(at,pan) in enumerate([(.16,-.6),(.38,-.2),(.60,.2),(.82,.6)]):put(a,noise(.52,3,'swell'),at,.16,pan)
put(a,tone(440,.54,523,decay=5),1.24,.09);results.append(output('bh21-oktai-high-desert-sun.wav',a))

# 56 — a spell hum is severed by one clean blade and two recoiling halves.
a=fresh();put(a,tone(185,1.10,310,decay=1.5),.02,.22);put(a,src(2792,.01,.55),.55,.43)
put(a,src(2160,.02,.48),.89,.34);sweep(a,1.08,.47,520,180,.15,-.55);sweep(a,1.08,.47,520,180,.15,.55)
results.append(output('56-lydia-sever-the-spell.wav',a))

# bh05 — one paper form unfolds into two mirrored identities.
a=fresh();p=src(1105,.02,.76);put(a,p,.09,.35,-.5);put(a,p[::-1].copy(),.37,.31,.5)
thump(a,1.02,205,.22,-.4);thump(a,1.02,205,.22,.4);chord(a,1.31,329,.08)
results.append(output('bh05-taylor-art-of-mimicry-v2.wav',a))

# 61 — rifle mechanism, supersonic shot, three target pings.
a=fresh();metallic(a,.06,118,.20,-.45);put(a,noise(.16,1),.29,.46);thump(a,.32,72,.38)
for j,(at,pan,f) in enumerate([(1.00,-.55,520),(1.12,0,610),(1.24,.55,730)]):metallic(a,at,f,.14,pan)
results.append(output('61-maria-song-precise-shot.wav',a))

# 13 — quill writes a charter, paper turns, small Christmas bells sign it.
a=fresh();put(a,src(2376,.02,.68),.04,.34,-.35);put(a,src(1105,.03,.64),.54,.30,.25)
for j,(f,pan) in enumerate([(659,-.4),(784,0),(988,.4)]):metallic(a,.98+j*.14,f,.13,pan)
results.append(output('13-kirby-christmas-charter.wav',a))

# 81 — dough folds, crimps repeatedly, then scatters across the board.
a=fresh();put(a,noise(.58,25,'swell'),.05,.26)
for j in range(5):thump(a,.32+j*.13,95+j*8,.18,(j-2)*.28)
for j,pan in enumerate([-.7,-.35,0,.35,.7]):sweep(a,1.10+j*.045,.30,180,520,.07,pan)
results.append(output('81-wojciech-pierogi-barrage.wav',a))

# 83 — alternate Visegrad treatment: sequential masonry, then roof lock.
a=fresh();stone=src(388,.05,.48)
for j,(at,pan) in enumerate([(.12,-.7),(.32,-.23),(.52,.23),(.72,.7)]):put(a,stone,at,.18,pan);thump(a,at+.04,62+j*8,.22,pan)
thump(a,1.12,48,.48);results.append(output('83-sebastyen-visegrad-v2.wav',a))

# 21 — chain strains, hammer breaks it, fragments fall away.
a=fresh()
for j,pan in enumerate([-.55,0,.55]):metallic(a,.12+j*.16,155+j*17,.19,pan)
put(a,src(2160,.02,.54),.72,.46);thump(a,.75,54,.48)
for j,pan in enumerate([-.7,-.35,0,.35,.7]):metallic(a,1.02+j*.07,310+j*55,.08,pan)
results.append(output('21-henry-break-the-chain.wav',a))

# 29 — eagle opens both wings and lifts through five stars.
a=fresh();put(a,noise(.72,18,'swell'),.06,.30,-.55);put(a,noise(.72,18,'swell'),.06,.30,.55)
put(a,tone(196,1.20,392,decay=2.4),.43,.16)
for j,pan in enumerate([-.65,-.32,0,.32,.65]):put(a,tone(523+j*55,.25,decay=11),1.02+j*.07,.08,pan)
results.append(output('29-dylan-wings-of-freedom.wav',a))

# 30 — a harpoon cuts through a continuous tide and splits the water.
a=fresh();put(a,src(1204,.5,1.95),.02,.29);put(a,src(2792,.03,.58,1.18),.22,.36,-.4);put(a,src(1311,.03,.70),.74,.43)
sweep(a,1.12,.55,260,90,.14,-.5);sweep(a,1.12,.55,260,90,.14,.5)
results.append(output('30-santiago-piercing-tide.wav',a))

# 102 — a hidden Black Rose fuse burns, detonates, and scatters sharp petals.
a=fresh();put(a,noise(1.08,2,'swell'),.08,.20);put(a,tone(145,.96,620,decay=1.2),.10,.15)
put(a,src(1455,.02,.42),.78,.31);thump(a,.82,44,.58)
for j,pan in enumerate([-.7,-.35,0,.35,.7]):sweep(a,1.02+j*.055,.30,760,180,.08,pan)
results.append(output('102-anne-black-rose-trap.wav',a))

# bh06 — three adaptive tokens engage as distinct mechanical relays.
a=fresh();put(a,src(2600,.06,.82),.04,.24)
for j,(at,pan,f) in enumerate([(.42,-.55,190),(.78,0,245),(1.14,.55,310)]):metallic(a,at,f,.28,pan);put(a,tone(f*2,.16,wave='square',decay=18),at+.05,.08,pan)
results.append(output('bh06-achille-adaptive-tactics.wav',a))

# bh16 — alternate blade storm: twelve light swishes tighten into three tears.
a=fresh();sw=src(2792,.01,.34,1.45)
for j in range(8):put(a,sw,.05+j*.09,.12,-.7+j*.2)
for j,(at,pan) in enumerate([(1.00,-.5),(1.16,0),(1.32,.5)]):put(a,src(2160,.02,.38,1.15),at,.25,pan)
results.append(output('bh16-li-hua-blade-storm-v2.wav',a))

# bh10 — alternate chauffeur: keys, engine approach, door, smooth drive-off.
a=fresh();metallic(a,.04,520,.10,-.5);put(a,src(1536,.05,.72,1.2),.14,.31,-.35);put(a,src(1564,.01,.57),.77,.42)
put(a,src(1538,.05,.93,1.16),1.12,.35,.55);results.append(output('bh10-francisek-chauffeur-v2.wav',a))

# bh14 — cards fan, one broad diplomatic seal lands, four copies answer.
a=fresh();put(a,src(1102,.03,.68,1.5),.04,.32)
thump(a,.63,142,.42)
for j,pan in enumerate([-.65,-.22,.22,.65]):thump(a,.91+j*.13,190+j*12,.19,pan)
results.append(output('bh14-chloe-delegation-seals-v2.wav',a))

# 10 — six electronic fragments implode toward a bass center.
a=fresh()
for j,pan in enumerate([-.7,-.42,-.14,.14,.42,.7]):sweep(a,.04+j*.10,.52,680+j*80,120,.12,pan)
put(a,src(1455,.03,.46),.72,.30);thump(a,.96,43,.55);results.append(output('10-dylan-esoteric-implosion.wav',a))

# bh12 — seven petals open through natural rustle and a coronation bloom.
a=fresh();put(a,noise(1.52,11,'swell'),.03,.24)
for j in range(7):put(a,tone(330+j*37,.30,decay=10),.20+j*.10,.07,-.7+j*.23)
chord(a,1.10,261.63,.13);results.append(output('bh12-louis-flower-king.wav',a))

# 35 — shield rises, paired laurels grow, edge rings at completion.
a=fresh();thump(a,.12,78,.38);metallic(a,.15,184,.24)
put(a,noise(.90,17,'swell'),.42,.19,-.5);put(a,noise(.90,17,'swell'),.42,.19,.5);metallic(a,1.24,440,.23)
results.append(output('35-alexander-shield-and-laurels.wav',a))

# 11 — three treaties slide into place and receive quiet seals.
a=fresh();page=src(1105,.02,.55,1.1)
for j,(at,pan) in enumerate([(.08,-.55),(.36,0),(.64,.55)]):put(a,page,at,.25,pan);thump(a,at+.25,178+j*8,.16,pan)
chord(a,1.18,220,.07);results.append(output('11-anne-three-treaties.wav',a))

# 41 — mirror hum, central fracture, shards ring in different directions.
a=fresh();put(a,tone(310,.86,420,decay=2),.04,.18);put(a,src(1455,.03,.38),.52,.31);metallic(a,.55,620,.26)
for j,pan in enumerate([-.7,-.35,0,.35,.7]):metallic(a,.82+j*.09,540+j*90,.09,pan)
results.append(output('41-jimmy-fractured-reflection.wav',a))

# 55 — four arms sweep around a low galactic drone and resolve at center.
a=fresh();put(a,tone(73.42,1.90,110,decay=.8),.02,.20)
for j,pan in enumerate([-.65,-.2,.2,.65]):sweep(a,.18+j*.16,.86,180+j*50,720+j*80,.12,pan)
put(a,tone(440,.48,660,decay=7),1.34,.12);results.append(output('55-bobby-four-arm-galaxy.wav',a))

# 106 — uninterrupted hourglass sand, three measured ticks, final glass bell.
a=fresh();put(a,noise(1.82,4,'swell'),.08,.29)
for j,(at,pan) in enumerate([(.28,-.4),(.72,0),(1.16,.4)]):metallic(a,at,920-j*120,.09,pan)
put(a,tone(196,.62,147,decay=5),1.39,.15);metallic(a,1.44,784,.16)
results.append(output('106-jose-sands-of-patience.wav',a))

# 36 — three shields move inward and lock with separate metal bodies.
a=fresh()
for j,(at,pan,f) in enumerate([(.16,-.55,170),(.40,.55,190),(.64,0,155)]):sweep(a,at,.38,260,90,.13,pan);metallic(a,at+.25,f,.27,pan)
thump(a,1.12,58,.34);results.append(output('36-marie-three-shields.wav',a))

# bh02 — camera aperture focuses, shutter fires, upload confirmation pulses.
a=fresh();put(a,src(1444,2.0,.72,1.5),.04,.18);put(a,src(1455,.03,.32,1.3),.54,.20)
metallic(a,.76,410,.18);put(a,tone(659,.36,784,decay=9),1.14,.13);results.append(output('bh02-joie-instagram-focus.wav',a))

# bh08 — restrained chuckle grows into a bright laugh-like cadence.
a=fresh()
for j,(at,f,pan) in enumerate([(.14,210,-.5),(.35,240,.35),(.55,195,-.25),(.72,275,.5),(.91,230,0)]):put(a,tone(f,.24,f*.76,decay=9),at,.16,pan);put(a,noise(.10,3),at,.06,pan)
chord(a,1.22,293.66,.09);results.append(output('bh08-maja-smirk-to-laughter.wav',a))

# 57 — alpine clock ticks, gears mesh, bell marks the completed mechanism.
a=fresh()
for j in range(8):metallic(a,.06+j*.13,720 if j%2 else 540,.07,-.45 if j%2 else .45)
for j,(at,pan) in enumerate([(.32,-.45),(.67,0),(1.02,.45)]):put(a,tone(95+j*22,.48,wave='square',decay=7),at,.09,pan)
metallic(a,1.32,784,.20);results.append(output('57-jeremiah-alpine-clockwork.wav',a))

# 12 — cloth insignia unfurls; broad wings open; pin fastens it.
a=fresh();put(a,noise(.68,19,'swell'),.05,.22);put(a,noise(.74,23,'swell'),.35,.23,-.5);put(a,noise(.74,23,'swell'),.35,.23,.5)
metallic(a,1.18,392,.24);results.append(output('12-makenna-winged-insignia.wav',a))

# 23 — a geometric fan clicks through five leaves and opens fully.
a=fresh()
for j,(at,pan,f) in enumerate([(.12,-.65,330),(.29,-.32,370),(.46,0,415),(.63,.32,466),(.80,.65,523)]):metallic(a,at,f,.13,pan)
put(a,noise(.52,9,'swell'),.87,.18);chord(a,1.18,261.63,.08);results.append(output('23-cathy-geometric-fan.wav',a))

# bh17 — wheels advance, timber strains, battering ram lands once.
a=fresh();put(a,noise(1.28,31,'swell'),.03,.25);put(a,tone(73,1.15,86,decay=1.2),.04,.17)
for j in range(4):thump(a,.22+j*.21,88,.14,-.45 if j%2 else .45)
put(a,src(388,.05,.64),1.16,.34);thump(a,1.18,42,.57);results.append(output('bh17-jakob-battering-ram.wav',a))

# bh18 — heartbeat accelerates under a distorted rage surge and abrupt slam.
a=fresh()
for j,at in enumerate([.08,.38,.64,.87]):thump(a,at,58+j*5,.26)
put(a,src(1455,.02,.72,.8),.62,.24);sweep(a,.82,.70,110,620,.25);thump(a,1.35,38,.62)
results.append(output('bh18-jimmy-rage.wav',a))

(ROOT/'new40-manifest.json').write_text(json.dumps(results,indent=2))
print(json.dumps({'count':len(results),'min_rms':min(r['rms'] for r in results),'max_peak':max(r['peak'] for r in results)},indent=2))
