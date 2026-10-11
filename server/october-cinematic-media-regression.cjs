const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tmp','october-cinematics');fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(out,'profile'));
app.whenReady().then(async()=>{
const win=new BrowserWindow({show:false,width:900,height:800,webPreferences:{sandbox:true,contextIsolation:true}});
try{
await win.loadURL('about:blank');
for(const file of ['19-approved-activation-art.js','19-approved-activation-sfx.js','19-signature-activation-fx.js'])await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/scripts/render-v2',file),'utf8'));
const result=await win.webContents.executeJavaScript(`(async()=>{
document.body.style='margin:0;background:#10141e';const results=[];
for(const id of ['101','102','103']){
 const canvas=document.createElement('canvas');canvas.width=700;canvas.height=230;document.body.append(canvas);const ctx=canvas.getContext('2d');
 if(!FateApprovedActivationArt.handles(id)||FateSignatureActivationFx.durationFor({id})!==2000)throw Error('Missing route '+id);
 for(let n=0;n<=100;n++)FateApprovedActivationArt.draw(ctx,id,n/100,700,230);
 FateApprovedActivationArt.draw(ctx,id,.43,700,230);
 if(!ctx.getImageData(0,0,700,230).data.some((v,i)=>i%4===3&&v))throw Error('Blank '+id);
 const ac=new OfflineAudioContext(1,105600,48000);FateApprovedActivationSfx.schedule(ac,ac.destination,id,1);const b=await ac.startRendering(),d=b.getChannelData(0);let peak=0,power=0,tail=0;
 for(let i=0;i<d.length;i++){if(!Number.isFinite(d[i]))throw Error('Invalid sound');peak=Math.max(peak,Math.abs(d[i]));power+=d[i]*d[i];if(i>=96000)tail=Math.max(tail,Math.abs(d[i]));}
 if(peak>=1||power===0||tail!==0)throw Error('Audio failure '+id+' '+peak+' '+tail);
 const cancelled=new OfflineAudioContext(1,48000,48000);FateApprovedActivationSfx.schedule(cancelled,cancelled.destination,id,1).stop();if((await cancelled.startRendering()).getChannelData(0).some(x=>x!==0))throw Error('Cancel failure');
 const muted=new OfflineAudioContext(1,48000,48000);if(FateApprovedActivationSfx.schedule(muted,muted.destination,id,0)!==null)throw Error('Mute failure');
 results.push({id,peak,rms:Math.sqrt(power/d.length)});
}return results;})()`);
for(const id of ['101','102','103']){
 await win.webContents.executeJavaScript(`document.body.replaceChildren();var shot=document.createElement('canvas');shot.width=700;shot.height=430;document.body.append(shot);FateApprovedActivationArt.draw(shot.getContext('2d'),'${id}',.43,700,430);`);
 await new Promise(resolve=>setTimeout(resolve,80));
 fs.writeFileSync(path.join(out,id+'.png'),(await win.webContents.capturePage()).toPNG());
}
for(const name of ['101','103','2set']){
 const b64=fs.readFileSync(path.join(root,'setvoicelines',name+'.mp3')).toString('base64');
 const duration=await win.webContents.executeJavaScript(`(async()=>{const ac=new OfflineAudioContext(1,48000,48000),bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));return (await ac.decodeAudioData(bytes.buffer)).duration;})()`);
 assert.ok(duration>0);console.log(name+' voice decodes: '+duration.toFixed(2)+' seconds');
}
const audio=fs.readFileSync(path.join(root,'src/scripts/08-audio-and-meta-ui.js'),'utf8'),helpers=fs.readFileSync(path.join(root,'src/scripts/06-rendering-and-helpers.js'),'utf8');
for(const id of ['101','103']){assert.ok(audio.includes("'"+id+"': '"+id+"'"));assert.ok(fs.statSync(path.join(root,'setvoicelines',id+'.mp3')).size>1000);}
assert.ok(helpers.includes('Sometimes, happiness is as simple as a fresh bowl of diced pineapples'));assert.ok(helpers.includes('Unravel their delusions with the point of our bayonets'));
assert.ok(audio.includes("'02': '2set'"));assert.ok(audio.includes("soundFile === '2set' ? 'v=20261008-anicka-replacement'"));
console.log(JSON.stringify(result));console.log('PASS: all three production animations render, sound is finite/unclipped/ends within two seconds, mute and cancellation work, voice files and subtitles exist.');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{app.exit(process.exitCode||0);}
});
