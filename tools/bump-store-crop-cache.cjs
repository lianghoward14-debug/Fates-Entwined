const fs=require('fs');let s=fs.readFileSync('index.html','utf8');
for(const name of ['zz-codex-last.css','01-data-and-state.js','03-profile-and-progression.js','06-rendering-and-helpers.js','22-activation-banner.js']){
 s=s.replace(new RegExp('('+name.replaceAll('.','\\.')+'\\?v=)[^"\\s]+','g'),'$120261025-store-portraits');
}
fs.writeFileSync('index.html',s);
