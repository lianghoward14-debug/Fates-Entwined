const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let touch=true;
const classes={contains:()=>false};const document={documentElement:{classList:classes},getElementById:()=>null,querySelector:()=>null};
const window={innerWidth:1800,innerHeight:720,FateMobileInput:{isTouchLayout:()=>touch,gameHeight:()=>720},getComputedStyle:()=>({fontSize:'16px'})};
const context={window,document,Date,getComputedStyle:window.getComputedStyle};
vm.runInNewContext(fs.readFileSync('src/scripts/render-v2/02-match-layout-engine.js','utf8'),context);
const snap={viewer:0,players:[{hand:[]},{hand:[]}],board:[0,1,2].map(z=>({z,rows:[0,1,2].map(r=>({r,cells:[0,1,2,3].map(c=>({c,card:null}))}))}))};
for(const h of [240,360,480]){const result=window.FateMatchLayoutEngine.build(snap,{x:0,y:0,w:1800,h,windowW:1800,windowH:720});for(const zone of result.zones){assert.ok(zone.rect.y+zone.rect.h<=h+1,JSON.stringify({h,rect:zone.rect}));}console.log('All zone rows fit board height '+h);}
