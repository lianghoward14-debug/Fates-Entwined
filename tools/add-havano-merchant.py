from pathlib import Path
from PIL import Image, ImageOps
import hashlib,re
root=Path(__file__).resolve().parents[1]
def edit(name,fn):
 p=root/name;s=p.read_bytes();p.write_bytes(fn(s.decode()).encode())
version=hashlib.sha256((root/'119.png').read_bytes()).hexdigest()[:12]
im=Image.open(root/'119.png').convert('RGB')
im.resize((260,364),Image.Resampling.LANCZOS).save(root/'optimized/card-thumbs/119.jpg',quality=90)
art=im.crop((86,132,675,580));art.save(root/'pfp/card-119-portrait.png')
profile=ImageOps.fit(art,(591,453),Image.Resampling.LANCZOS);profile.save(root/'pfp/pfp145.png')
profile.resize((209,160),Image.Resampling.LANCZOS).save(root/'optimized/pfp-thumbs/pfp145.jpg',quality=90)
card="  {id:'119',pfpId:145,cinematicPortrait:'pfp/card-119-portrait.png?v="+version+"',name:'Havano Merchant',ability:'Art of the Deal',type:'Supporter',aff:'eventide',fate:1,cost:0,rarity:'circle',\n    effect:'When set, trigger a Call to Arms, but forgo drawing a card for your next three Draw Phases.',\n    flavor:'\"In the open air markets of Havano, a discount means market price\"',img:'119.png?v="+version+"'},\n"
edit('src/scripts/01-data-and-state.js',lambda s:s.replace("  {id:'120',",card+"  {id:'120',"))
edit('src/scripts/03-profile-and-progression.js',lambda s:s.replace('id<=144','id<=145').replace('PFP_CATALOG_SIZE = 144','PFP_CATALOG_SIZE = 145'))
edit('src/scripts/08-audio-and-meta-ui.js',lambda s:s.replace('id <= 144','id <= 145'))
edit('src/scripts/05-gameplay-core.js',lambda s:s.replace("new Set(['120','108'","new Set(['119','120','108'"))
edit('shared/support-company.mjs',lambda s:s.replace('108 115 118 120','108 115 118 119 120').replace('116 117 120','116 117 119 120'))
edit('index.html',lambda s:re.sub(r'((?:01-data-and-state|03-profile-and-progression|05-gameplay-core|06-rendering-and-helpers|08-audio-and-meta-ui|53-caribbea-translations|support-company)\.(?:js|mjs)\?v=)[^\"\']+',r'\g<1>20261023-merchant',s))
edit('src/scripts/support-company.mjs',lambda s:s.replace('20261023-catalog','20261023-merchant'))
print('119 art, portrait, profile 145, catalog, categories and cache versions updated.')
