module.exports=(e,read)=>{
 const rep=(a,b)=>{if(!e.includes(a))throw Error('Felicyta anchor: '+a);e=e.replace(a,b)};
 rep('const api={kits,',read('felicyta-mechanics.js')+'\nconst api={felicytaConfirm,kits,');
 rep('function cast(s,f,i,ax,ay){','function cast(s,f,i,ax,ay){if(f.felAim!=null||f.debate>0)return false;');
 rep("if(f.kind==='maja'){majaCast", "if(f.kind==='felicyta'){felicytaCast(s,f,i);return true}if(f.kind==='maja'){majaCast");
 rep('function basic(s,f,x,y){','function basic(s,f,x,y){if(f.felAim!=null||f.debate>0)return;');
 rep("if(f.kind==='maja'){majaBasic", "if(f.kind==='felicyta'){f.basicCd=.65;f.felPose=.3;f.felGesture=0;f.aim=Math.atan2(y-f.y,x-f.x);shot(s,f,f.aim,{damage:22,speed:620,r:9,life:.85,color:'#eed2ff'});s.events.push({type:'basic',kind:f.kind,skill:0});return}if(f.kind==='maja'){majaBasic");
 rep('function ccImmune(f){return ', 'function ccImmune(f){return f.debate>0||');
 rep('let mx=input.x||0,my=input.y||0,n=Math.hypot(mx,my);','let mx=input.x||0,my=input.y||0,n=Math.hypot(mx,my);if(p.debate>0&&(n||input.dodge||input.cancelPath))p.debate=0;');
 rep('if(input.cancelPath)p.majaAim=null;', 'if(input.cancelPath){p.felAim=null;p.felShots=0;}for(const point of input.confirm||[])felicytaConfirm(s,p,point.x,point.y);if(input.cancelPath)p.majaAim=null;');
 rep('majaWorldStep(s,dt);','majaWorldStep(s,dt);felicytaStep(s,dt);');
 rep('amount*=flagBuff(s,origin||getUnit(s,owner))?1.5:1;', 'const sourceUnit=getUnit(s,owner);amount*=sourceUnit?.rhetoricPower??1;if(s.fighters.some(f=>f.debate>0&&enemies(s,f,sourceUnit)&&Math.hypot(sourceUnit.x-f.x,sourceUnit.y-f.y)<=320))amount*=.5;const rhetoric=t.rhetoric&&t.rhetoric.left>0&&enemies(s,getUnit(s,t.rhetoric.owner),t)?t.rhetoric:null;amount*=rhetoric?1.25:1;amount*=flagBuff(s,origin||getUnit(s,owner))?1.5:1;');
 rep('if(attacker)attacker.damage+=n;', 'if(attacker)attacker.damage+=n;if(rhetoric)felicytaHeal(s,getUnit(s,rhetoric.owner),n*.2);');
 rep('n-=absorb;t.hp=', 'const extra=rhetoric?Math.min(t.hp,n-absorb)-Math.min(t.hp,Math.max(0,n/1.25-absorb)):0;n=Math.min(t.hp,n-absorb);if(rhetoric)felicytaHeal(s,getUnit(s,rhetoric.owner),extra);t.hp=');
 rep('t.respawn=4;', 't.debate=0;t.felAim=null;t.felShots=0;t.rhetoric=null;t.respawn=4;');
 rep('shield:0,buff:0,','shield:0,buff:0,debate:0,felAim:null,felShots:0,felPose:0,felGesture:0,rhetoric:null,rhetoricPower:1,');
 rep('function campusBot(s,f,dt){if(f.hp<=0)return;', `function campusBot(s,f,dt){if(f.hp<=0)return;if(f.kind==='felicyta'){if(f.debate>0)return;let t=nearestEnemy(s,f);if(!t)return;f.aim=Math.atan2(t.y-f.y,t.x-f.x);if(f.felAim!=null){felicytaConfirm(s,f,t.x,t.y);return;}let d=Math.hypot(t.x-f.x,t.y-f.y);if(d>290)navigate(s,f,t,dt,kits[f.kind].speed);basic(s,f,t.x,t.y);if(d<500){for(const i of [2,0,3,1])if(f.cd[i]<=0&&(i!==1||d<300)){cast(s,f,i,t.x,t.y);break;}}return;}`);
 return e;
};
