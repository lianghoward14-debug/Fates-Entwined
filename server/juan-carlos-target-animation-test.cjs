const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const rendering=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const art=fs.readFileSync('src/scripts/render-v2/21-juan-carlos-target-fx.js','utf8');
async function test(){
 let tick,removed=0,canvas,elapsed=0;
 const source={id:'39',iid:'juan',owner:0},target={id:'22',iid:'enemy',owner:1};
 const points=[];const ctx=new Proxy({}, {get:(o,k)=>o[k]||((...args)=>{assert(args.every(v=>typeof v!=='number'||Number.isFinite(v)));if(k==='moveTo'||k==='lineTo')points.push(args);})});
 const board={clientWidth:700,clientHeight:430,getBoundingClientRect:()=>({left:50,top:20,width:700,height:430})};
 const classes={contains:()=>false};
 const sandbox={window:{innerWidth:800,innerHeight:500,devicePixelRatio:1,matchMedia:()=>({matches:false}),FateMatchRendererAdapter:{getHitMap:()=>({cards:[{iid:'juan',rect:{x:10,y:200,w:60,h:85}},{iid:'enemy',rect:{x:430,y:40,w:60,h:85}}],cells:[{z:0,r:1,c:1,rect:{x:130,y:200,w:60,h:85}}]})}},
 document:{documentElement:{classList:classes},body:{classList:classes,appendChild:c=>{canvas=c;c.isConnected=true;}},getElementById:()=>board,createElement:()=>({style:{},dataset:{},setAttribute(){},getContext:()=>ctx,remove(){removed++;this.isConnected=false;}}),addEventListener(){},removeEventListener(){}},
 G:{},performance:{now:()=>elapsed},Date,localStorage:{getItem:()=>null},requestAnimationFrame:fn=>{tick=fn;return 1;},cancelAnimationFrame:()=>{tick=null;},setTimeout:()=>1,clearTimeout(){}};
 let soundStarts=0,soundStops=0;
 sandbox.window.FateApprovedActivationSfx={play:id=>{assert.equal(id,'39');soundStarts++;return {stop(){soundStops++;}};}};
 vm.runInNewContext(art,sandbox);const fx=sandbox.window.FateJuanCarlosTargetFx;
 assert.equal(await fx.play(source,{...target,owner:0},{z:0,r:1,c:1}),false,'allied card rejected');
 assert.equal(await fx.play(source,{...target,iid:'missing'},{z:0,r:1,c:1}),false,'missing target never animates at guessed coordinates');
 const playing=fx.play(source,target,{z:0,r:1,c:1});let done=false;playing.then(()=>done=true);
 for(const time of [0,500,1100,1999]){elapsed=time;tick(time);await Promise.resolve();assert.equal(done,false);}
 assert(points.some(([x,y])=>Math.abs(x-510)<50&&Math.abs(y-102.5)<65),'art reaches the actual opponent hit rectangle');
 tick(2000);await playing;assert.equal(removed,1);assert.equal(canvas.isConnected,false);assert.equal(sandbox.G._cinematicUiLockUntil,0);
 assert.equal(soundStarts,1,'only a valid target plays sound');assert.equal(soundStops,1,'completion stops the cue');
 const start=rendering.indexOf('window.doMove=async function(i){'),end=rendering.indexOf('\n};',start)+3;
 assert(start>=0);const moveSource=rendering.slice(start,end);
 for(const stale of [false,true]){
   let finish,plays=0,commits=0;
   const state={turn:1,currentPlayer:0,board:[[[null,null],[target,null]],[[null,null],[source,null]]]};
   const env={G:state,window:{_moveDests:[{r:0,c:1}],_moveFrom:{z:0,r:1,c:0},_moveCard:target,_moveSourceCard:source,_moveTargetZ:1,FateJuanCarlosTargetFx:{play:()=>{plays++;return new Promise(resolve=>finish=resolve);}}},isTargetImmuneToEffectOwner:()=>false,toast(){},closeModal(){},renderBoardActionForPlayer(){commits++;},markInitialEffectResolved(){},triggerRozsiPassive(){}};
   vm.runInNewContext(moveSource,env);
   const move=env.window.doMove(0);await env.window.doMove(0);
   assert.equal(plays,1,'duplicate clicks cannot duplicate presentation');assert.equal(state.board[0][1][0],target,'move waits for animation');
   if(stale)state.turn++;
   finish(true);await move;
   assert.equal(commits,stale?0:1);assert.equal(state.board[1][0][1],stale?null:target);
 }
 console.log('PASS: Juan targets opponents, renders at board coordinates, finishes in 2 seconds, cleans up, blocks duplicate movement and rejects stale commits.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
