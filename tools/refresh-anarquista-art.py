from pathlib import Path
from PIL import Image, ImageOps
import hashlib,re
root=Path(__file__).resolve().parents[1]
def edit(name,fn):
 p=root/name;p.write_bytes(fn(p.read_bytes().decode('utf-8')).encode('utf-8'))
for card,profile in [('116',141),('117',142)]:
 version=hashlib.sha256((root/(card+'.png')).read_bytes()).hexdigest()[:12]
 im=Image.open(root/(card+'.png')).convert('RGB')
 im.resize((260,364),Image.Resampling.LANCZOS).save(root/'optimized/card-thumbs'/f'{card}.jpg',quality=90,optimize=True)
 w,h=im.size
 art=im.crop((round(w*86/750),round(h*132/1050),round(w*675/750),round(h*580/1050)))
 art.save(root/'pfp'/f'card-{card}-portrait.png')
 portrait=ImageOps.fit(art,(591,453),Image.Resampling.LANCZOS)
 portrait.save(root/'pfp'/f'pfp{profile}.png')
 portrait.resize((209,160),Image.Resampling.LANCZOS).save(root/'optimized/pfp-thumbs'/f'pfp{profile}.jpg',quality=90)
 edit('src/scripts/01-data-and-state.js',lambda s:re.sub(r'((?:pfp/card-'+card+r'-portrait|'+card+r')\.png\?v=)[A-Za-z0-9-]+',lambda m:m[1]+version,s))
 edit('src/scripts/06-rendering-and-helpers.js',lambda s:re.sub(r'("'+card+r'": ")[^"]+',lambda m:m[1]+version,s))
 def profile_path(s):
  line=f"  if(id==={profile})return 'pfp/pfp{profile}.png?v={version}';\n"
  if re.search(r'  if\(id==='+str(profile)+r'\)',s):return re.sub(r'  if\(id==='+str(profile)+r'\)[^\n]*\n',line,s)
  return s.replace('  if((id>=133',line+'  if((id>=133')
 edit('src/scripts/03-profile-and-progression.js',profile_path)
 print(card,version,im.size,'profile',profile)
edit('index.html',lambda s:re.sub(r'((?:01-data-and-state|03-profile-and-progression|06-rendering-and-helpers)\.js\?v=)[^\"\']+',r'\g<1>20261024-anarquista-art',s))
