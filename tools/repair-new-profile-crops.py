from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import re
root=Path(__file__).resolve().parents[1]
# Individually reviewed illustration interiors: exclude the rounded white frame.
bounds={i:(90,138,670,580) for i in [101,102,108,109,110,111,112,113,114,115,118]}
for i,box in bounds.items():
    art=Image.open(root/f'{i}.png').convert('RGB').crop(box)
    profile=ImageOps.fit(art,(591,453),Image.Resampling.LANCZOS)
    art.save(root/f'pfp/card-{i}-portrait.png')
    profile.save(root/f'pfp/pfp{i+25}.png')
    profile.resize((209,160),Image.Resampling.LANCZOS).save(root/f'optimized/pfp-thumbs/pfp{i+25}.jpg',quality=92)
    svg=root/f'pfp/card-{i}-portrait.svg'
    if svg.exists():
        s=svg.read_text();s=re.sub(r'viewBox="[^"]+"','viewBox="90 138 580 442"',s)
        s=re.sub(r'width="512" height="512"','width="591" height="453"',s,count=1)
        svg.write_text(s)
def edit(path,fn):
    p=root/path;s=p.read_bytes().decode();p.write_bytes(fn(s).encode())
ids=[i+25 for i in bounds]
edit('src/scripts/03-profile-and-progression.js',lambda s:s.replace("  if(id===128)","  if("+str(ids)+".includes(id)) return `pfp/pfp${id}.png?v=20261025-clean-crops`;\n  if(id===128)",1))
for path in ['src/scripts/01-data-and-state.js','src/scripts/06-rendering-and-helpers.js','src/scripts/render-v2/22-activation-banner.js']:
    edit(path,lambda s:re.sub(r'(pfp/card-(?:'+ '|'.join(map(str,bounds))+r')-portrait\.(?:png|svg)\?v=)[\w-]+',r'\g<1>20261025-clean-crops',s))
sheet=Image.new('RGB',(1470,624),'#18232d');d=ImageDraw.Draw(sheet)
for n,i in enumerate(range(100,121)):
    pid=100 if i==100 else 145 if i==119 else 144 if i==120 else i+25
    f=root/f'pfp/pfp{pid}.png'
    if not f.exists():f=root/f'pfp/card-{i}-portrait.png'
    if not f.exists():continue
    x=n%7*210;y=n//7*208
    sheet.paste(ImageOps.fit(Image.open(f),(210,161)),(x,y+24));d.text((x+8,y+5),f'{i} / pfp {pid}',fill='white')
sheet.save(root/'outputs/profile-crops-after.jpg')
