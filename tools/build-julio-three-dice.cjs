const fs=require('fs');
const dir='C:/Users/user/.codex/visualizations/2026/10/13/01a1375b-1f2f-74f2-baae-2db06e0d220c/';
const old=fs.readFileSync('artifacts/caribbea-108-110/julio-dice-samples.js','utf8');
let art=old.slice(0,old.indexOf(' line([[-138,78]'));
art=art.replace("['The Rolling Six','Double Down','The Dice Cup']","['Triple Tumble','Orbit of Fortune','Three from the Cup']");
art+=`
 if(v===2){
  const lift=ease(seg(.34,.58));
  c.save();c.translate(-96-24*lift,-50-40*lift);c.rotate((t<.34?Math.sin(t*90)*.12:0)-lift*.9);
  const opacity=a*(1-seg(.5,.63));
  line([[-25,-35],[25,-35],[33,29],[-33,29],[-25,-35]],gold,opacity,2);ring(0,-35,25,6,gold,opacity);c.restore();
 }
 for(let i=0;i<3;i++){
  const end=.59+i*.075,start=v===2?.34+i*.045:.06+i*.055;
  const raw=clamp((t-start)/(end-start)),p=ease(raw),target=(i-1)*87;
  let x,y,rot;
  if(v===0){x=target+(i===1?105:-100)*(1-p);y=22-(75+i*15)*Math.abs(Math.sin(raw*pi*2))*(1-raw);rot=(1-p)*pi*(i===1?-3:3);}
  else if(v===1){const angle=i*pi*2/3+(1-p)*pi*2;const radius=110*(1-p);x=target*p+Math.cos(angle)*radius;y=22*p+Math.sin(angle)*radius;rot=(1-p)*pi*3;}
  else{x=-90+(target+90)*p;y=-35+57*p-65*Math.sin(raw*pi);rot=(1-p)*pi*(2+i*.4);}
  if(t>=start)die(x,y,rot,26,t<end?1+Math.floor(t*25+i*2)%6:6,7);
  if(t>end)shine(target,22,seg(end,end+.18));
 }
 c.restore();
}
window.FateCaribbeaActivationArt={names,draw};
})();
`;
fs.writeFileSync('artifacts/caribbea-108-110/julio-three-dice.js',art);
let sfx=fs.readFileSync('src/scripts/render-v2/19-caribbea-activation-sfx.js','utf8');
for(let i=0;i<3;i++){
 const motion=i===2?"['roll',.08,.57,650],['cast',.68,.3,800],['roll',.7,.45,850]":i===1?"['cast',.12,.9,850],['roll',.7,.45,700]":"['roll',.12,.96,800],['click',.65,.1,370],['click',.82,.1,300]";
 sfx=sfx.replace(new RegExp("'dice-"+i+"':\\[.*\\]"),"'dice-"+i+"':["+motion+",['click',1.18,.13,250],['click',1.33,.13,210],['click',1.48,.16,180],['bell',1.52,.35,988]]");
}
let html=fs.readFileSync(dir+'julio-dice-samples.html','utf8');
html=html.replace(/<script>[\s\S]*?<\/script>/,()=>'<script>\n'+art+'\n'+sfx+'\n</script>').replaceAll('julio-dice-samples','julio-three-dice');
fs.writeFileSync(dir+'julio-three-dice.html',html);
let test=fs.readFileSync('tools/check-julio-dice-preview.cjs','utf8').replace("[['julio-dice-samples',3],['caribbea-approved-sound',2]]","[['julio-three-dice',3]]").replace('five animated previews','three new animated previews');
fs.writeFileSync('tools/check-julio-three-dice.cjs',test);
