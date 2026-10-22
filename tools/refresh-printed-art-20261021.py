from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
for name in ['101']+[str(i) for i in range(108,118)]+['fishtoken']:
    image=Image.open(root/(name+'.png')).convert('RGB')
    image.resize((260,364),Image.Resampling.LANCZOS).save(root/'optimized/card-thumbs'/f'{name}.jpg',quality=90,optimize=True)
    if name.isdigit() and 108<=int(name)<=117:
        art=image.crop((72,120,690,595))
        art.save(root/'pfp'/f'card-{name}-portrait.png')
        if int(name)<=110:
            pfp=int(name)+25
            square=art.crop((71,0,546,475))
            square.save(root/'pfp'/f'pfp{pfp}.png')
            square.resize((160,160),Image.Resampling.LANCZOS).save(root/'optimized/pfp-thumbs'/f'pfp{pfp}.jpg',quality=90)
print('Refreshed 12 card thumbnails, 10 art portraits, and 3 character profile thumbnails.')
