const fs=require('fs');
const file='index.html';let source=fs.readFileSync(file,'utf8');
for(const name of ['zz-codex-last.css','51-saboteur-clouds.js','18-online-rooms.js','04-match-renderer-adapter.js']){
 source=source.replace(new RegExp('('+name.replaceAll('.','\\.')+'\\?v=)[^"\'\\s]+','g'),'$120261024-cloud-reveal');
}
fs.writeFileSync(file,source);
