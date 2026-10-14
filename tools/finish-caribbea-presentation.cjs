const fs=require('fs');
function edit(p,from,to){let s=fs.readFileSync(p,'utf8');if(!s.includes(from))throw Error('Missing anchor '+p);fs.writeFileSync(p,s.replace(from,to));}
for(const [id,x,y,w,h] of [[108,76,128,604,463],[109,76,128,604,463],[110,76,128,604,463]]){
 const art=fs.readFileSync(id+'.png').toString('base64');
 fs.writeFileSync('pfp/card-'+id+'-portrait.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="591" height="453" viewBox="${x} ${y} ${w} ${h}"><image width="750" height="1050" href="data:image/png;base64,${art}"/></svg>`);
}
for(const p of ['src/scripts/render-v2/22-activation-banner.js','src/scripts/06-rendering-and-helpers.js']){
 let s=fs.readFileSync(p,'utf8');s=s.replace('const dedicatedPortrait = ',"const dedicatedPortrait = ['108','109','110'].includes(String(card?.id)) ? 'pfp/card-'+card.id+'-portrait.svg?v=20261014' : ");fs.writeFileSync(p,s);
}
edit('src/scripts/08-audio-and-meta-ui.js','id >= 126 && id <= 132','id >= 126 && id <= 135');
edit('index.html','<script src="src/scripts/render-v2/19-approved-activation-art.js', '<script src="src/scripts/render-v2/19-caribbea-activation-art.js?v=20261014"></script>\n<script src="src/scripts/render-v2/19-approved-activation-art.js');
edit('index.html','<script defer src="src/scripts/54-localization.js','<script defer src="src/scripts/53-caribbea-translations.js?v=20261014"></script>\n<script defer src="src/scripts/54-localization.js');
let html=fs.readFileSync('index.html','utf8');
for(const name of ['01-data-and-state','03-profile-and-progression','06-rendering-and-helpers','08-audio-and-meta-ui','render-v2/19-approved-activation-art','render-v2/19-signature-activation-fx','render-v2/22-activation-banner'])html=html.replace(new RegExp('('+name.replaceAll('/','\\/')+'\\.js\\?v=)[^"\x27]+','g'),'$120261014-caribbea');
fs.writeFileSync('index.html',html);
