from pathlib import Path
from PIL import Image, ImageOps
import re, io, base64
root=Path(__file__).resolve().parents[1]
im=Image.open(root/'103.png').convert('RGB')
w,h=im.size
art=im.crop((round(w*72/750),round(h*120/1050),round(w*690/750),round(h*595/1050)))
art=art.crop((22,12,art.width-22,art.height-14))
art.save(root/'pfp/card-103-portrait.png')
profile=ImageOps.fit(art,(591,453),Image.Resampling.LANCZOS)
profile.save(root/'pfp/pfp128.png')
profile.resize((209,160),Image.Resampling.LANCZOS).save(root/'optimized/pfp-thumbs/pfp128.jpg',quality=90)
for name in ['src/scripts/01-data-and-state.js','src/scripts/05-gameplay-core.js']:
 p=root/name;s=p.read_bytes()
 s=re.sub(rb'pfp/card-103-portrait\.png\?v=[a-zA-Z0-9-]+',b'pfp/card-103-portrait.png?v=20261023-tight-crop',s);p.write_bytes(s)
p=root/'src/scripts/03-profile-and-progression.js';s=p.read_bytes();needle=b'  if((id>=133&&id<=144)||id===121||id===128)'
s=s.replace(needle,b"  if(id===128)return 'pfp/pfp128.png?v=20261023-tight-crop';\n"+needle);p.write_bytes(s)
p=root/'index.html';s=p.read_bytes()
s=re.sub(rb'((?:01-data-and-state|03-profile-and-progression|05-gameplay-core)\.js\?v=)[^\"\']+',rb'\g<1>20261023-tight-crop',s);p.write_bytes(s)
p=Path('C:/Users/user/.codex/visualizations/2026/10/14/01a13a30-afc7-76c1-8766-3c8e46d4f8bd/santiago-morale-payment.html')
buf=io.BytesIO();art.resize((460,360),Image.Resampling.LANCZOS).save(buf,format='JPEG',quality=88)
s=p.read_text(encoding='utf-8');s,n=re.subn(r'data:image/jpeg;base64,[A-Za-z0-9+/=]+','data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode(),s);assert n==1,n;p.write_text(s,encoding='utf-8')
print('Tightened Santiago portrait, profile, thumbnail and sample.')
