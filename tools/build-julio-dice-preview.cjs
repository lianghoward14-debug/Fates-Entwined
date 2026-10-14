const fs=require('fs');
const dir='C:/Users/user/.codex/visualizations/2026/10/13/01a1375b-1f2f-74f2-baae-2db06e0d220c/';
let s=fs.readFileSync(dir+'caribbea-more-animation-samples.html','utf8');
s=s.replace(/<script>[\s\S]*?<\/script>/,()=>'<script>\n'+fs.readFileSync('artifacts/caribbea-108-110/julio-dice-samples.js','utf8')+'\n'+fs.readFileSync('src/scripts/render-v2/19-caribbea-activation-sfx.js','utf8')+'\n</script>');
s=s.replace(/const cards=\[[^;]+;/,"const cards=[['109','Don Julio','Dice animation samples']];");
s=s.replaceAll('caribbea-more-samples','julio-dice-samples').replace('Play all nine','Play all three');
s=s.replace('const samples=[];',"const samples=[];let audio;function sound(v,stretch){audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume();return FateCaribbeaActivationSfx.schedule(audio,audio.destination,'dice-'+v,.6,stretch);}");
s=s.replace('sample.play=()=>{cancelAnimationFrame(sample.raf);',"sample.play=()=>{cancelAnimationFrame(sample.raf);sample.sound?.stop();sample.sound=sound(variant,root.querySelector('[data-slow]').checked?2:1);");
fs.writeFileSync(dir+'julio-dice-samples.html',s);
// Also retain a playable confirmation of the two accepted designs with matching audio.
let approved=fs.readFileSync(dir+'caribbea-more-animation-samples.html','utf8');
approved=approved.replace('</script>',()=>fs.readFileSync('src/scripts/render-v2/19-caribbea-activation-sfx.js','utf8')+'\n</script>');
approved=approved.replace(/const cards=\[[^;]+;/,"const cards=[['108','Sofia','A World in Bloom'],['110','Sebastian','The Big Catch']];");
approved=approved.replace('FateCaribbeaActivationArt.names[id].forEach((name,variant)=>{','FateCaribbeaActivationArt.names[id].forEach((name,variant)=>{if(variant!==2)return;');
approved=approved.replaceAll('caribbea-more-samples','caribbea-approved-sound').replace('Play all nine','Play both').replace('repeat(3,minmax(0,1fr))','repeat(1,minmax(0,1fr))');
approved=approved.replace('const samples=[];',"const samples=[];let audio;function sound(id,stretch){audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume();return FateCaribbeaActivationSfx.schedule(audio,audio.destination,id,.6,stretch);}");
approved=approved.replace('sample.play=()=>{cancelAnimationFrame(sample.raf);',"sample.play=()=>{cancelAnimationFrame(sample.raf);sample.sound?.stop();sample.sound=sound(id,root.querySelector('[data-slow]').checked?2:1);");
fs.writeFileSync(dir+'caribbea-approved-sound.html',approved);
