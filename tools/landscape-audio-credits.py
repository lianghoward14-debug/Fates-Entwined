from pathlib import Path
import json, html
root=Path(__file__).resolve().parents[1]/'soundeffects'/'landscapes'
rows=json.loads((root/'sources.json').read_text())
intro='Landscape ambience uses recorded and synthesized source samples, plus original procedural cues. Runtime modifications: excerpts up to 40 or 150 seconds, DC removal, volume normalization, filtering, playback-rate changes, stereo positioning, fades, randomized excerpts, irregular clusters and layering. Freesound assets use publicly playable previews capped at their leading 3 MB. These sounds represent the scenery, not authentic recordings of the named places. Sather uses church tower bells as a Campanile-style approximation. The winter bird is a black-capped chickadee used as a scenic sound-design reference.'
md=['# Landscape audio credits','',intro,'']
items=[]
for r in rows:
    license='https://creativecommons.org/licenses/by/3.0/' if r['license']=='CC-BY-3.0' else 'https://creativecommons.org/publicdomain/zero/1.0/'
    md.append(f"- `{r['file']}` — {r['author']}. [{r['license']}]({license}). [Source]({r['source']}).")
    items.append(f'<li><b>{html.escape(r["file"])}</b> — {html.escape(r["author"])}. <a href="{license}">{r["license"]}</a> · <a href="{r["source"]}">Original source</a></li>')
(root/'CREDITS.md').write_text('\n'.join(md),encoding='utf-8')
(root/'credits.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Landscape sound credits</title><style>body{max-width:850px;margin:50px auto;padding:24px;background:#101820;color:#f2eee4;font:16px/1.7 system-ui}a{color:#e3bd77}li{margin:16px 0}</style><h1>Landscape sound credits</h1><p>'+intro+'</p><ul>'+''.join(items)+'</ul><p><a href="../../landscape-sound-preview.html">Back to listening room</a></p></html>',encoding='utf-8')
