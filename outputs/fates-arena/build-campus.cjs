const fs=require('fs'),path=require('path'),d=__dirname,read=n=>fs.readFileSync(path.join(d,n),'utf8');
let e=read('tidebound-engine.js');
function rep(a,b){if(!e.includes(a))throw Error('Campus engine anchor missing: '+a);e=e.replace(a,b)}
rep("(function(root){'use strict';", "(function(root){'use strict';\n"+read('campus-map.js').replace("if(typeof module!=='undefined')module.exports=CampusMap;",''));
rep('const api={kits,',read('campus-mechanics.js')+'\nconst api={kits,');
rep('kits,create,step,cast,damage,move,blocked,addStar,basic,alondrasConfirm,alondrasTarget,spearRect}', 'kits,create:createCampus,step:campusStep,cast,damage,move,blocked,addStar,basic,alondrasConfirm,alondrasTarget,spearRect,majaConfirm,majaTarget,flagBuff,enemies,combatants,map:CampusMap,findRoute}');
// World boundaries: update all champion movement, targeting and projectile lifetimes.
e=e.replaceAll(',85,1115',',40,CampusMap.width-40').replaceAll(',130,610',',40,CampusMap.height-40').replaceAll(',50,1150',',40,CampusMap.width-40').replaceAll(',50,650',',40,CampusMap.height-40').replaceAll(',65,1135',',40,CampusMap.width-40').replaceAll(',65,635',',40,CampusMap.height-40').replaceAll('x<85||x>1115||y<130||y>610','x<40||x>CampusMap.width-40||y<40||y>CampusMap.height-40').replaceAll('q.x<1280','q.x<CampusMap.width+80').replaceAll('q.y<780','q.y<CampusMap.height+80');
// Team filters also prevent friendly crowd-control and projectile absorption.
e=e.replaceAll('o.id!==f.id','enemies(s,f,o)').replaceAll('o.id===f.id||ph.hits','!enemies(s,f,o)||ph.hits').replaceAll('f.id!==z.owner','enemies(s,getUnit(s,z.owner),f)').replaceAll('o.id!==q.owner','enemies(s,getUnit(s,q.owner),o)');
e=e.replaceAll('for(const o of s.fighters)','for(const o of combatants(s))');
rep('function damage(s,t,amount,owner,penetration=0){','function damage(s,t,amount,owner,penetration=0,origin=null){if(s.done||t.hp<=0||t.invulnerable>0||t.queen||jakeImmune(t)||!enemies(s,getUnit(s,owner),t))return 0;amount*=flagBuff(s,origin||getUnit(s,owner))?1.5:1;amount*=flagBuff(s,t)?.9:1;if(t.tank&&t.hp>0&&!s.done){let n=Math.min(t.tank.hp,amount);t.tank.hp-=n;let attacker=getUnit(s,owner);if(attacker)attacker.damage+=n;fx(s,\'impact\',t.x,t.y,\'#fbd79b\',40,.3);if(t.tank.hp<=0){t.tank=null;t.basicCd=.5;fx(s,\'burst\',t.x,t.y,\'#ffc88d\',95,.7);}return n;}');
rep("s.done=true;s.winner=owner;fx(s,'burst',t.x,t.y,'#fff4c3',130,1.5)",'campusDeath(s,t,owner)');
rep('q.damage,q.owner,q.penetration||0)','q.damage,q.owner,q.penetration||0,q.origin)');
rep('function move(s,f,dx,dy){','function move(s,f,dx,dy){if(f.hp<=0)return;');
rep('function cast(s,f,i,ax,ay){',"function cast(s,f,i,ax,ay){if(f.kind==='maja'&&i===2&&f.escort&&s.soldiers.some(u=>u.id===f.escort&&u.life>0&&u.hp>0)&&f.hp>0&&!f.stun&&!f.freeze&&!s.done&&s.countdown<=0){f.majaAim=f.majaAim==='command'?null:'command';return true;}if(f.majaAim)return false;");
rep("if(f.kind==='alondras'){alondrasCast", "if(f.kind==='maja'){majaCast(s,f,i,ax,ay);return true}if(f.kind==='alondras'){alondrasCast");
rep("if(f.kind==='alondras'){alondrasBasic", "if(f.majaAim)return;if(f.kind==='maja'){majaBasic(s,f,x,y);return}if(f.kind==='alondras'){alondrasBasic");
rep('if(input.dodge&&','if(input.dodge&&p.hp>0&&!p.tank&&');
rep('const speed=kits[p.kind].speed*','const speed=kits[p.kind].speed*(p.tank?.55:1)*');
rep('if(input.cancelPath&&p.alondrasAim!=null)',"if(input.cancelPath)p.majaAim=null;for(const point of input.confirm||[])majaConfirm(s,p,point.x,point.y);if(input.cancelPath&&p.alondrasAim!=null)");
rep('if(bot){botAction(s,b,p,dt);basic(s,b,p.x,p.y)}','if(bot)for(const botF of s.fighters.slice(1))campusBot(s,botF,dt);');
rep('const control=f.id===0?input:{ax:p.x,ay:p.y};','if(f.hp<=0)continue;const control=f.id===0?input:(f.botAim||{ax:p.x,ay:p.y});');
rep('let dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);if(d<44', 'let dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);if(p.hp>0&&b.hp>0&&d<44');
rep('if(f.id===1&&f.path.age>.7)', 'if(f.id!==0&&f.path.age>.7)');
rep('if(s.events.length>50)', 'majaWorldStep(s,dt);if(s.events.length>50)');
rep('if(!s.pickups.length)s.pickups.push({x:600,y:350})','for(const point of CampusMap.heals)if(!s.pickups.some(v=>v.x===point.x&&v.y===point.y))s.pickups.push({...point})');
rep('if(Math.hypot(f.x-v.x,f.y-v.y)<40&&f.hp<f.maxHp)','if(f.hp>0&&Math.hypot(f.x-v.x,f.y-v.y)<40&&f.hp<f.maxHp)');
// Dead units no longer cast lingering dashes; tank chassis resists displacement.
e=e.replace('if(f.dash>0){f.dash=', 'if(f.hp>0&&f.dash>0){f.dash=').replace('function ccImmune(f){return ', 'function ccImmune(f){return !!f.tank||');
// Unseen Strikes still deals damage to a control-immune charge.
e=e.replace('o.invulnerable<=0&&!o.queen&&!ccImmune(o)', 'o.invulnerable<=0&&!o.queen&&!jakeImmune(o)');
e=e.replace('f.invulnerable<=0&&!ccImmune(f)){f.slow=.2;f.soaked=3;if(d>10)move', 'f.invulnerable<=0&&!jakeImmune(f)&&!f.queen){if(!ccImmune(f)){f.slow=.2;f.soaked=3;}if(d>10&&!ccImmune(f))move');
e=require('./felicyta-integrate.cjs')(e,read);
fs.writeFileSync(path.join(d,'campus-engine.js'),e);
// Reuse the established animated champion renderer, replacing its fixed arena with a camera world.
let old=read('harbour-duel.html'),scripts=[...old.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);let r=scripts[2];
r=r.slice(0,r.indexOf('function ground(g,s)'))+'function ground(g,s){CampusView.ground(g,s);}\n'+r.slice(r.indexOf('function rollingWave'));
r=r.replace('g.save();if(!reduced&&s.shake>0)', 'g.save();g.translate(-CampusView.camera.x,-CampusView.camera.y);if(!reduced&&s.shake>0)');
r=r.replace("if(f.kind==='alondras')AlondrasView.body", "if(f.kind==='maja')MajaView.body(g,f,s,reduced);else if(f.kind==='alondras')AlondrasView.body");
r=r.replace(');ground(g,s);',');ground(g,s);MajaView.ground(g,s,aim,reduced);');
r=r.replace('const col=Arena.kits[f.kind].color;', 'if(f.hp<=0)continue;const col=Arena.kits[f.kind].color;');
r=r.replaceAll("f.id===0?'#147f9b':'#b9435c'", "f.team===s.fighters[0].team?'#147f9b':'#b9435c'");
r=r.replaceAll("f.id===0?'#46b6b4':'#d76474'", "f.team===s.fighters[0].team?'#46b6b4':'#d76474'");
r=r.replace('for(const q of s.shots){',"MajaView.units(g,s,reduced);for(const q of s.shots){if(q.kind==='bullet'){MajaView.bullet(g,q);continue;}");
r=r.replace("if(f.kind==='maja')MajaView.body", "if(f.kind==='felicyta')FelicytaView.body(g,f,s,reduced);else if(f.kind==='maja')MajaView.body");
r=r.replace('MajaView.ground(g,s,aim,reduced);','MajaView.ground(g,s,aim,reduced);FelicytaView.ground(g,s,aim,reduced);');
let snow=r.indexOf('for(let i=0;i<(reduced?18:85);i++)'),snowEnd=r.indexOf('g.restore();const vig=',snow);r=r.slice(0,snow)+r.slice(snowEnd);
r=r.replace("'DUEL'","'GO'").replace("'F R O S T F A L L   H A R B O U R'", "'C A M P U S   C L A S H'");
r=r.replace("g.textAlign='left';}","CampusView.minimap(g,s);g.textAlign='left';}");
// Layer motion and combat feedback around the existing card-art sprites.
r=r.replace('if(!reduced&&s.shake>0)g.translate(Math.sin(s.time*93)*s.shake,Math.cos(s.time*71)*s.shake*.6);','CombatPolish.camera(g,s,reduced);');
r=r.replace('FelicytaView.ground(g,s,aim,reduced);','FelicytaView.ground(g,s,aim,reduced);CombatPolish.ground(g,s,reduced);');
r=r.replace('if(Math.cos(f.aim)<0)g.scale(-1,1);','CombatPolish.pose(g,f,s,reduced);if(Math.cos(f.aim)<0)g.scale(-1,1);');
r=r.replace("if(f.hurt>0)g.globalAlpha=.6;","if(f.hurt>0)g.globalAlpha=.88;");
r=r.replace("g.font='bold 21px system-ui';", "g.font='bold '+(Number.parseFloat(f.text)>=50?21:17)+'px system-ui';");
r=r.replace("g.strokeStyle='#31536599';", "CombatPolish.foreground(g,s,reduced);g.strokeStyle='#31536599';");
r=r.replace('CampusView.minimap(g,s);', 'CombatPolish.overlay(g,s,reduced);CampusView.minimap(g,s);');
const img=n=>'data:image/png;base64,'+fs.readFileSync(path.join(d,n)).toString('base64');
const maja=read('maja-render.js').replace('MAJA_SPRITE',()=>img('maja-motion.png')).replace('MAJA_BOUNDS',()=>read('maja-frame-bounds.json'));
const felicyta=read('felicyta-render.js').replace('FELICYTA_SPRITE',()=>img('felicyta-motion.png')).replace('FELICYTA_BOUNDS',()=>read('felicyta-frame-bounds.json'));
let h=read('campus.template.html'),ui=read('campus-ui.js');
const tokens={ENGINE_CODE:e,FX_CODE:scripts[1]+'\n'+read('campus-render.js')+'\n'+maja+'\n'+felicyta+'\n'+read('combat-polish.js'),RENDER_CODE:r,UI_CODE:ui,MAJA_CARD:img('../../7.png'),FELICYTA_CARD:img('../../bh11.png'),ANICKA_CARD:img('../../2.png'),HOWARD_CARD:img('../../3.png'),JAKE_CARD:img('../../38.png'),ALONDRAS_CARD:img('../../14.png'),ANICKA_SPRITE:img('anicka-motion-v3.png'),HOWARD_SPRITE:img('howard-sprites.png'),MUSIC_DATA:'data:audio/mpeg;base64,'+fs.readFileSync(path.join(d,'../../warfront.mp3')).toString('base64')};
for(const [k,v]of Object.entries(tokens))h=h.replaceAll(k,()=>v);
fs.writeFileSync(path.join(d,'campus.html'),h);fs.writeFileSync(path.join(d,'tidebound.html'),h);console.log('Built Campus Clash');

