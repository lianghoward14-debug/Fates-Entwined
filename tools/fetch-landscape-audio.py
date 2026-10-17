"""Download selected reusable ambience assets; retain provenance alongside files."""
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import unquote, urljoin, urlsplit, quote
import re, json, concurrent.futures

ROOT = Path(__file__).resolve().parents[1] / 'soundeffects' / 'landscapes'
SOURCES = [
 ('gull1','solo-seagull-sound-effects','Seagull Ambient 1.wav','Rango Mango','CC0'),
 ('gull2','solo-seagull-sound-effects','Seagull Ambient 2.wav','Rango Mango','CC0'),
 ('gull3','solo-seagull-sound-effects','Seagull Ambient 3.wav','Rango Mango','CC0'),
 ('ocean','beach-ocean-waves','wave_01','jasinski / qubodup','CC0'),
 ('ocean2','beach-ocean-waves','wave_04','jasinski / qubodup','CC0'),
 ('river','sea-and-river-wave-sounds','VistulaShort.mp3','RandomMind','CC0'),
 ('birds','ambient-bird-sounds','birds-isaiah658.ogg','isaiah658','CC0'),
 ('wind','wind1','wind1.wav','Luke.RUSTLTD','CC0'),
 ('crickets','crickets','crickets.mp3','dklon','CC-BY-3.0'),
 ('machine','steam-boiler-sound-loop','generator_loop.wav','bart','CC0'),
 ('engine','engine-loop-heavy-vehicletank','engine_heavy_loop.ogg','Nayckron / qubodup','CC-BY-3.0'),
 ('paper','various-paper-sound-effects','paper_sound_-_1.mp3','Luckius','CC0'),
 ('boom','muffled-distant-explosion','Muffled Distant Explosion.wav','NenadSimic','CC0')
]
def read(url):
    return urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=50).read()
def fetch(row):
    key,slug,needle,author,license=row
    page='https://opengameart.org/content/'+slug
    html=read(page).decode()
    links=re.findall(r'href="([^"]+)"',html)
    matches=[urljoin(page,x) for x in links if '/files/' in x and (needle.lower() in unquote(x).lower() or needle.lower() in re.sub(r'_\d+(?=\.[a-z0-9]+$)', '', unquote(x).lower()))]
    if not matches:
        raise ValueError(str((key,[x for x in links if '/files/' in x])))
    url=matches[0]
    url=quote(unquote(url),safe=':/')
    ext=Path(unquote(urlsplit(url).path)).suffix
    path=ROOT/(key+ext)
    if not path.exists(): path.write_bytes(read(url))
    print(key,path.stat().st_size,flush=True)
    return dict(key=key,file=path.name,source=page,download=url,author=author,license=license)
if __name__=='__main__':
    ROOT.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: rows=list(pool.map(fetch,SOURCES))
    old=json.loads((ROOT/'sources.json').read_text()) if (ROOT/'sources.json').exists() else []
    rows += [r for r in old if r['key'] not in {row['key'] for row in rows}]
    (ROOT/'sources.json').write_text(json.dumps(rows,indent=2))
