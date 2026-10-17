"""Save the publicly playable preview of a CC0 field recording and its provenance."""
from pathlib import Path
from urllib.request import Request,urlopen
import re,json,sys,html
root=Path(__file__).resolve().parents[1]/'soundeffects'/'landscapes'
def read(url):return urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read()
key,author,sound_id=sys.argv[1:]
page=f'https://freesound.org/people/{author}/sounds/{sound_id}/'
text=read(page).decode()
if not re.search(r'creativecommons\.org/(?:publicdomain/zero|licenses/zero)',text):
    raise ValueError('Expected a verified CC0 source page')
links=re.findall(r'https://[^\s<>"\']+(?:\.mp3|\.ogg)',html.unescape(text).replace('\\/','/'))
previews=sorted(set(x for x in links if 'previews/' in x),key=lambda x:('hq.mp3' not in x,'mp3' not in x))
if not previews:raise ValueError('No public audio preview found')
url=previews[0];ext=Path(url).suffix;name=key+ext
# Long MP3 previews need only a leading excerpt for these quiet background layers.
with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=60) as response:
    data=response.read(3_000_000)
(root/name).write_bytes(data)
rows=json.loads((root/'sources.json').read_text());rows=[r for r in rows if r['key']!=key]
rows.append(dict(key=key,file=name,source=page,download=url,author=author,license='CC0',note='Public audio preview; leading excerpt capped at 3 MB'))
(root/'sources.json').write_text(json.dumps(rows,indent=2))
print(key,name,(root/name).stat().st_size)
