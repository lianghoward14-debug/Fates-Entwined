 function palm(x,y,scale,q){c.save();c.translate(x,y);c.scale(scale,scale);curve(z=>[13*Math.sin(z*1.7),-104*z],q,gold);const top=13*Math.sin(1.7);for(const s of [-1,1])for(let j=0;j<3;j++){const p=ease(seg(.15+j*.05,.62+j*.04));curve(z=>[top+s*(52-j*8)*z*p,-104+(j*18-21)*z+31*z*z],1,col,a*q)}c.restore()}
 function waves(y,span=110){for(let j=0;j<3;j++)curve(z=>[-span+span*2*z,y+j*13+Math.sin(z*TAU*2-t*5+j*.6)*3],1,col,a*(.8-j*.2))}
 function fist(x,y,scale,q){c.save();c.translate(x,y+45*(1-q));c.scale(scale,scale);
  line([[-27,78],[-27,23],[-48,4],[-48,-19],[-38,-27],[-20,-11]],col,a,2);
  line([[-20,-11],[-24,-45],[-18,-54],[-6,-54],[0,-46],[0,-20]],gold,a,2);
  line([[0,-46],[5,-62],[18,-62],[24,-54],[24,-20]],gold,a,2);
  line([[24,-54],[31,-54],[40,-47],[40,-15]],gold,a,2);
  line([[40,-42],[48,-39],[52,-30],[52,2],[31,25],[31,78]],col,a,2);
  line([[-27,63],[31,63]],gold);line([[-20,-10],[9,-14],[23,-3],[12,13],[-4,10]],col);c.restore();
 }
 if(r===0&&v===0){
  // Dawn over a small island: palm, shoreline, and a rising half-sun.
  const q=ease(seg(.06,.65));waves(65);curve(z=>[-77+154*z,54-15*Math.sin(z*Math.PI)],u,gold);
  palm(-30,44,.8,q);const sy=32-61*q;
  curve(z=>[48+Math.cos(Math.PI+z*Math.PI)*26,sy+Math.sin(Math.PI+z*Math.PI)*26],1,gold);
  line([[22,sy],[74,sy]],gold);for(let i=0;i<7;i++){const z=Math.PI+i*Math.PI/6;line([[48+Math.cos(z)*34,sy+Math.sin(z)*34],[48+Math.cos(z)*44,sy+Math.sin(z)*44]],col,a*q)}
 }
 if(r===0&&v===1){
  // Two palms open around the Caribbea sun above a calm sea.
  const q=ease(seg(.06,.65));for(const s of [-1,1]){c.save();c.scale(s,1);palm(-70,63,.84,q);c.restore()}
  c.save();c.translate(0,-27);c.scale(.3+.7*q,.3+.7*q);sun(0,0,25);c.restore();waves(74,99);
  curve(z=>[-32+64*z,46-9*Math.sin(z*Math.PI)],u,gold,a*.7);burst(0,-27,seg(.63,.96));
 }
 if(r===0&&v===2){
  // A lateen sail crosses tropical water toward a low golden sun.
  const q=ease(seg(.05,.67));waves(54,118);c.save();c.translate(-54+73*q,0);
  line([[-54,26],[54,26],[37,43],[-35,43],[-54,26]],gold);
  line([[0,25],[0,-80]],gold);line([[-5,-70],[-48,17],[-5,17],[-5,-70]],col);
  curve(z=>[8+43*Math.sin(z*Math.PI/2),-68+85*z],1,col);line([[8,-68],[8,17],[51,17]],col);c.restore();
  ring(76,-61,21,21,gold,a*.8);for(let i=0;i<7;i++){const z=-Math.PI+i*Math.PI/6;line([[76+Math.cos(z)*29,-61+Math.sin(z)*29],[76+Math.cos(z)*36,-61+Math.sin(z)*36]],col,a*.6)}
 }
 if(r===1&&v===0){
  // One decisive lift, followed by a tight radial impact.
  const q=ease(seg(.07,.5));fist(0,0,1,q);
  for(let i=0;i<9;i++){const z=Math.PI*.85+i*Math.PI*1.3/8,p=ease(seg(.38,.68));line([[Math.cos(z)*88,Math.sin(z)*88],[Math.cos(z)*(88+23*p),Math.sin(z)*(88+23*p)]],gold,a*p)}
  burst(0,-10,seg(.43,.85));
 }
 if(r===1&&v===1){
  // Side fists rise first, the central fist follows to unite the crowd.
  fist(-92,18,.63,ease(seg(.04,.43)));fist(92,18,.63,ease(seg(.14,.53)));fist(0,-11,.9,ease(seg(.29,.67)));
  const q=ease(seg(.55,.78));line([[-118*q,85],[118*q,85]],gold,a*q);
  for(const s of [-1,1])line([[s*118,73],[s*118,85]],col,a*q);star(0,85,5,a*q);
 }
 if(r===1&&v===2){
  // The same raised fist, enclosed by a pair of tropical palm fronds.
  const q=ease(seg(.06,.55));fist(0,-6,.83,q);
  for(const s of [-1,1]){const p=ease(seg(.25,.72));curve(z=>[s*(25+79*Math.sin(z*1.4)),83-147*z],p,col);
   for(let j=0;j<7;j++){const z=(j+.5)/7,x=s*(25+79*Math.sin(z*1.4)),y=83-147*z,g=ease(seg(.23+j*.04,.48+j*.04));line([[x,y],[x-s*22*g,y-23*g]],gold);line([[x,y],[x+s*13*g,y-24*g]],col)}
  }line([[-17,87],[0,76],[17,87]],gold,a*q);
 }
