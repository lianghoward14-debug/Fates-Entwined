const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let viewer=0,draws=0,clipped=0,callback,overlay;
const bounds={left:100,top:150,width:900,height:600};
const board={getBoundingClientRect:()=>bounds,querySelectorAll:()=>[]};
const hiddenLegacyBoard={getBoundingClientRect:()=>({left:0,top:0,width:0,height:0})};
const gradient={addColorStop(){}};
const context=new Proxy({drawImage(){draws++;},rect(){clipped++;},createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
const cells=[0,1,2,3,4].map(r=>({z:0,r,c:0,rect:{x:10,y:r*100,w:200,h:90}}));
const renderer={ownsBoard:()=>true,getHitMap:()=>({cells})};
const sandbox={G:{turn:4,_saboteurCloudTurn:4,_saboteurCloudUntilTurn:6,_saboteurCloudOwner:0},window:{FateMatchRendererAdapter:renderer},matchMedia:()=>({matches:false}),setInterval(){},cancelAnimationFrame(){},requestAnimationFrame:fn=>{callback=fn;return 1;},performance:{now:()=>0},getPerspectivePlayerIndex:()=>viewer,getExtraSafeRowOwner:(z,r)=>r===3?1:0,
 Path2D:class{moveTo(){}quadraticCurveTo(){}closePath(){}},
 document:{hidden:false,addEventListener(){},getElementById:id=>id==='board'?hiddenLegacyBoard:id==='fate-match-v2-canvas'?{parentElement:board,getBoundingClientRect:()=>bounds}:null,createElement:()=>({width:0,height:0,style:{},setAttribute(){},getContext:()=>context,remove(){}}),body:{appendChild:c=>{overlay=c;}}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('src/scripts/51-saboteur-clouds.js','utf8'),sandbox);
const api=sandbox.window.FateSaboteurClouds;
sandbox.setTimeout=()=>1;sandbox.clearTimeout=()=>{};
const continuous=api.cloudBands([{x:0,y:0,w:200,h:90},{x:220,y:0,w:200,h:90},{x:0,y:100,w:200,h:90}],900);
assert.equal(continuous.length,1);assert.equal(continuous[0].w,900);assert.equal(continuous[0].h,190,'mist crosses cell, zone and row gutters');
let revealTime=0;sandbox.performance.now=()=>revealTime;
api.prepareReveal({saboteurConcealment:{active:true},board:[[[{iid:'same',fate:1},null]]]},{board:[[[{iid:'same',fate:1},{iid:'new',fate:3}]]]});
assert.equal(api.cardAlpha({iid:'same'}),1);assert.equal(api.cardAlpha({iid:'new'}),0);
revealTime=1825;assert.equal(api.cardAlpha({iid:'new'}),.5);
revealTime=2150;assert.equal(api.cardAlpha({iid:'new'}),1);revealTime=0;
assert.deepEqual(Array.from(api.cloudRects(board,bounds),r=>r.y),[0,100,300],'viewer 0: enemy, contested, enemy extra row');
viewer=1;assert.deepEqual(Array.from(api.cloudRects(board,bounds),r=>r.y),[100,200,400],'viewer 1 perspective');
api.sync();assert(overlay);assert(overlay.style.cssText.includes('pointer-events:none'));
callback(100);assert(draws>0);assert.equal(clipped,0,'wisps must extend past row and zone bounds');
const initialOverlay=overlay,initialOpacity=context.globalAlpha;
sandbox.G=JSON.parse(JSON.stringify(sandbox.G));api.sync();callback(200);
assert.equal(overlay,initialOverlay,'snapshot replacement must preserve the cloud canvas');
assert(context.globalAlpha>initialOpacity,'fade continues across snapshots');
assert(overlay.style.cssText.includes('z-index:405'),'mist stays above legacy board and below renderer UI');
assert(api.veilKey(sandbox.G));sandbox.G.turn=7;assert.equal(api.veilKey(sandbox.G),'');
assert(api.veilKey({turn:4,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',playerIndex:1,untilTurn:6}]},0));
assert(api.veilKey({turn:4,_saboteurConcealment:{active:true,owner:0,untilTurn:6}}));
assert.equal(api.veilKey({turn:7,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',playerIndex:1,untilTurn:6}]}),'');
assert(api.veilKey({turn:7,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',playerIndex:1,untilTurn:6},{type:'SABOTEUR_FIELD_VEIL',playerIndex:1,untilTurn:8}]},0),'latest veil duration wins');
sandbox.G={_phase7CurrentMultiplayer:true,_onlineRoomCode:'sync-test',turn:4,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',untilTurn:6}]};
api.acceptAuthority({matchId:'sync-test',revision:20,turn:7,statuses:[]});
const beforeFade=context.globalAlpha;callback(400);assert(context.globalAlpha<beforeFade,'authoritative expiry overrides delayed displayed turn');
renderer.ownsBoard=()=>false;board.querySelectorAll=()=>[{getBoundingClientRect:()=>({left:110,top:250,width:200,height:90})}];
assert.equal(api.cloudRects(board,bounds)[0].y,100,'legacy rows still supported');
console.log('Saboteur mist: canvas draw path, both perspectives, extra rows, legacy geometry, local/projected status and expiry passed.');

for(const owner of [0,1]){const state={turn:4,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',playerIndex:owner,untilTurn:6}]};assert.equal(api.veilKey(state,owner),'');assert(api.veilKey(state,1-owner));}
