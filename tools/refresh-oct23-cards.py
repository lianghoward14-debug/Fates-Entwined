from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import re, hashlib, json
root=Path(__file__).resolve().parents[1]
def edit(path,fn):
 p=root/path;p.write_text(fn(p.read_text(encoding='utf-8')),encoding='utf-8')
ids=['103','bh21']+[str(i) for i in range(108,119)]+['120']
versions={i:hashlib.sha256((root/(i+'.png')).read_bytes()).hexdigest()[:12] for i in ids}
profiles={'103':128,'bh21':121,**{str(i):i+25 for i in range(108,119)},'120':144}
tiles=[]
for i in ids:
 im=Image.open(root/(i+'.png')).convert('RGB')
 im.resize((260,364),Image.Resampling.LANCZOS).save(root/'optimized/card-thumbs'/f'{i}.jpg',quality=90,optimize=True)
 # The printed cards share the same art panel; scale its bounds to each source.
 w,h=im.size
 art=im.crop((round(w*72/750),round(h*120/1050),round(w*690/750),round(h*595/1050)))
 if i=='103':art=art.crop((22,12,art.width-22,art.height-14))
 art.save(root/'pfp'/f'card-{i}-portrait.png')
 profile=ImageOps.fit(art,(591,453),Image.Resampling.LANCZOS)
 profile.save(root/'pfp'/f'pfp{profiles[i]}.png')
 profile.resize((209,160),Image.Resampling.LANCZOS).save(root/'optimized/pfp-thumbs'/f'pfp{profiles[i]}.jpg',quality=90)
 tile=Image.new('RGB',(236,205),'#182532');tile.paste(profile.resize((236,181)),(0,24));ImageDraw.Draw(tile).text((8,5),i,fill='white');tiles.append(tile)
sheet=Image.new('RGB',(236*4,205*4),'#182532')
for n,t in enumerate(tiles):sheet.paste(t,((n%4)*236,(n//4)*205))
sheet.save(root/'outputs/oct23-profile-crops.jpg')
def catalog(s):
 start=s.index("  {id:'118'");end=s.index("  {id:'120'",start)
 s=s[:start]+"  {id:'118',name:'Caribbea Fisherman',ability:'Treacherous Seas',type:'Supporter',aff:'eventide',\n    fate:1,cost:0,rarity:'circle',effect:'When set, a random card from your opponent’s deck is added to your hand.',\n    flavor:'\"Even during the harshest winters, there are few who are willing to brave the maelstroms of the Western Seas\"',img:'118.png'},\n"+s[end:]
 for i in ids:
  pattern=r"\{id:'"+i+r"'.*?(?=\n  \{id:|\n  //|\n\];)"
  def card(m):
   c=m[0]
   if i=='bh21':c=c.replace("cost:2,rarity:'triangle'","cost:1,rarity:'square'")
   c=re.sub(r"img:'[^']+'",f"img:'{i}.png?v={versions[i]}'",c)
   c=re.sub(r"cinematicPortrait:'[^']+',?",'',c)
   c=re.sub(r"pfpId:\d+,?",'',c)
   return c.replace("{id:'"+i+"',",f"{{id:'{i}',pfpId:{profiles[i]},cinematicPortrait:'pfp/card-{i}-portrait.png?v={versions[i]}',")
  s,n=re.subn(pattern,card,s,flags=re.S);assert n==1,(i,n)
 return s
edit('src/scripts/01-data-and-state.js',catalog)
edit('src/scripts/03-profile-and-progression.js',lambda s:s.replace("  if(id >= 133 && id <= 135) return `pfp/card-${id-25}-portrait.svg?v=20261014-full-art`;","  if((id>=133&&id<=144)||id===121||id===128) return `pfp/pfp${id}.png?v=20261023-portraits`;" ).replace('const PFP_CATALOG_SIZE = 135','const PFP_CATALOG_SIZE = 144'))
edit('src/scripts/08-audio-and-meta-ui.js',lambda s:s.replace('id>=126&&id<=135','id>=126&&id<=144'))
for p in ['src/scripts/06-rendering-and-helpers.js','src/scripts/render-v2/22-activation-banner.js']:
 edit(p,lambda s:s.replace("['108','109','110'].includes(String(card?.id)) ? 'pfp/card-'+card.id+'-portrait.svg?v=20261014-full-art' : ",''))
def runtime(s):
 a=s.index("  if(/^103\\.png",s.index('function getRuntimeCardImageSrc'));b=s.index("  if(/^107\\.png",a)
 s=s[:a]+"  const refreshedArtVersions="+json.dumps(versions)+";\n  const refreshedArtId=String(src||'').split(/[.?]/)[0];\n  if(refreshedArtVersions[refreshedArtId]) src=refreshedArtId+'.png?v='+refreshedArtVersions[refreshedArtId];\n"+s[b:]
 return s.replace('(102|103|104|105)','(102|104|105)')
edit('src/scripts/06-rendering-and-helpers.js',runtime)
print('Refreshed',len(ids),'cards and profile portraits; store catalog now 144.')
