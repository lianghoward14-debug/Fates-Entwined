module.exports=function(e,m){
 const replace=(a,b)=>{if(!e.includes(a))throw Error('Missing Howard anchor '+a);e=e.replace(a,b)};
 replace('function damage(s,t,amount,owner)', 'function damage(s,t,amount,owner,penetration=0)');
 replace('n=amount*(t.mark', 'n=amount*(t.mark');
 replace('100/(100+armor)', '100/(100+armor*(1-clamp(penetration,0,1)))');
 replace('animation:0,','knives:0,footballs:0,fury:0,furyTick:0,haste:0,hastePower:1,bow:0,bleeds:[],animation:0,');
 replace("if(f.kind==='jake'){jakeCast", "if(f.kind==='howard'){howardCast(s,f,i);return true}if(f.kind==='jake'){jakeCast");
 replace('f.basicCd=.65;', "if(f.kind==='howard'){if(!f.fury)howardThrow(s,f,x,y);return}f.basicCd=.65;");
 replace('jakeStep(s,f,dt,control);','howardStep(s,f,dt,control);jakeStep(s,f,dt,control);');
 replace('kits[p.kind].speed*','kits[p.kind].speed*(p.haste>0?1+.4*p.hastePower:1)*');
 e=e.replaceAll('kits[b.kind].speed*travel','kits[b.kind].speed*(b.haste>0?1+.4*b.hastePower:1)*travel');
 replace('damage(s,o,q.damage,q.owner);','damage(s,o,q.damage,q.owner,q.penetration||0);howardHit(s,o,q);');
 replace('const error=Math.sin',"if(b.kind==='howard'){if(!b.fury){cast(s,b,3,p.x,p.y);cast(s,b,1,p.x,p.y);cast(s,b,2,p.x,p.y);cast(s,b,0,p.x,p.y)}return}const error=Math.sin");
 replace('const api={kits,',m+'\nconst api={kits,');return e;
};
