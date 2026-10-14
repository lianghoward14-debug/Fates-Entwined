module.exports=function(e,mechanics){
 const replace=(a,b)=>{if(!e.includes(a))throw Error('Missing Alondras anchor: '+a);e=e.replace(a,b)};
 replace('const api={kits,',mechanics+'\nconst api={kits,');
 replace('addStar,basic};','addStar,basic,alondrasConfirm,alondrasTarget,spearRect};');
 replace('animation:0,','alondrasAim:null,blitz:0,spearPose:0,animation:0,');
 replace('t.invulnerable>0||jakeImmune(t)','t.invulnerable>0||t.queen||jakeImmune(t)');
 replace('||jakeBusy(f)||f.freeze','||jakeBusy(f)||alondrasBusy(f)||f.alondrasAim!=null||f.freeze');
 replace("if(f.kind==='howard'){howardCast", "if(f.kind==='alondras'){alondrasCast(s,f,i);return true}if(f.kind==='howard'){howardCast");
 e=e.replaceAll('!jakeBusy(p)&&','!jakeBusy(p)&&!alondrasBusy(p)&&p.alondrasAim==null&&').replaceAll('!jakeBusy(b)&&','!jakeBusy(b)&&!alondrasBusy(b)&&');
 replace('p.dodgeCd=3;',"p.dodgeCd=p.blitz>0?.5:3;");
 replace('p.dx=n?mx/n:Math.cos(p.aim);p.dy=n?my/n:Math.sin(p.aim);', 'p.dx=p.blitz>0?Math.cos(p.aim):n?mx/n:Math.cos(p.aim);p.dy=p.blitz>0?Math.sin(p.aim):n?my/n:Math.sin(p.aim);');
 replace('for(const point of input.points||[])',"if(input.cancelPath&&p.alondrasAim!=null)p.alondrasAim=null;for(const point of input.confirm||[])alondrasConfirm(s,p,point.x,point.y);\nfor(const point of input.points||[])");
 replace('howardStep(s,f,dt,control);','alondrasStep(s,f,dt,control);howardStep(s,f,dt,control);');
 replace('||jakeBusy(f)||f.basicCd','||jakeBusy(f)||alondrasBusy(f)||f.alondrasAim!=null||f.basicCd');
 replace("if(f.kind==='howard'){if(!f.fury)","if(f.kind==='alondras'){alondrasBasic(s,f,x,y);return}if(f.kind==='howard'){if(!f.fury)");
 // Damage immunity and control immunity deliberately have separate predicates.
 e=e.replaceAll('!jakeImmune(o)','!ccImmune(o)').replaceAll('!jakeImmune(f)','!ccImmune(f)').replaceAll('!jakeImmune(p)','!ccImmune(p)').replaceAll('!jakeImmune(b)','!ccImmune(b)');
 replace('o.invulnerable>0||jakeImmune(o)', 'ccImmune(o)');
 replace('o.invulnerable>0||jakeImmune(o)||o.hp<=0', 'ccImmune(o)||o.hp<=0');
 replace("desired=b.kind==='jake'?65:","desired=b.kind==='alondras'?75:b.kind==='jake'?65:");
 replace("if(b.kind==='jake'){if(b.hp", "if(b.kind==='alondras'){if(b.alondrasAim!=null)alondrasConfirm(s,b,p.x,p.y);else if(d<300)cast(s,b,3,p.x,p.y);if(d<220)cast(s,b,1,p.x,p.y);if(d>150)cast(s,b,0,p.x,p.y);return}if(b.kind==='jake'){if(b.hp");
 replace('if(d<44&&!p.phase&&!b.phase', 'if(d<44&&!alondrasBusy(p)&&!alondrasBusy(b)&&!p.phase&&!b.phase');
 return e;
};
