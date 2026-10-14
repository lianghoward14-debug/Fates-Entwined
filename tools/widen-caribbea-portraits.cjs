const fs=require('fs');
// Use the complete illustration window, matching the established 591:453 portraits.
for(const id of [108,109,110]){
 const file=`pfp/card-${id}-portrait.svg`;
 const source=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,source.replace(/viewBox="[^"]+"/,'viewBox="76 128 604 463"'));
}
for(const file of ['src/scripts/01-data-and-state.js','src/scripts/03-profile-and-progression.js','src/scripts/06-rendering-and-helpers.js','src/scripts/render-v2/22-activation-banner.js']){
 let s=fs.readFileSync(file,'utf8');s=s.replace(/portrait\.svg\?v=20261014(?!-)/g,'portrait.svg?v=20261014-full-art');fs.writeFileSync(file,s);
}
let index=fs.readFileSync('index.html','utf8');
for(const name of ['01-data-and-state.js','03-profile-and-progression.js','06-rendering-and-helpers.js','22-activation-banner.js'])index=index.replace(new RegExp('('+name.replaceAll('.','\\.')+'\\?v=)[^"\\s]+','g'),'$120261014-full-art-portraits');
fs.writeFileSync('index.html',index);
let generator=fs.readFileSync('tools/finish-caribbea-presentation.cjs','utf8');generator=generator.replace('[[108,175,148,405,310],[109,203,133,382,293],[110,270,126,360,276]]','[[108,76,128,604,463],[109,76,128,604,463],[110,76,128,604,463]]');fs.writeFileSync('tools/finish-caribbea-presentation.cjs',generator);
console.log('Expanded all three shared portrait viewports and refreshed all consumer URLs.');
