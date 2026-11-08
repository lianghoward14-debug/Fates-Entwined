const {app,BrowserWindow}=require('electron');
const crypto=require('crypto');
const path=require('path');
const {pathToFileURL}=require('url');

const root=path.resolve(__dirname,'..');
const variants=['01-split-meridian.svg','02-entwined-orbits.svg','03-fate-seal.svg'];
app.setPath('userData',path.join(root,'.tmp','loading-wheel-animation-regression'));

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=image=>crypto.createHash('sha256').update(image.toPNG()).digest('hex');

app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1200,height:675,webPreferences:{backgroundThrottling:false}});
  try{
    for(const filename of variants){
      const target=path.join(root,'outputs','loading-wheel-variants',filename);
      await win.loadURL(pathToFileURL(target).href);
      await pause(180);
      const first=digest(await win.webContents.capturePage());
      await pause(760);
      const second=digest(await win.webContents.capturePage());
      if(first===second)throw new Error(`${filename} did not visibly animate`);
    }
    console.log('PASS: all three game-native loading wheel previews visibly animate in Electron.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{win.destroy();app.exit(process.exitCode||0);}
});
