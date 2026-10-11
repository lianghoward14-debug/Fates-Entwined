 function palmTree(side,baseX,baseY,height,lean,delay){
  const q=ease(seg(.05+delay,.47+delay)),leaf=ease(seg(.25+delay,.66+delay));
  const tx=side*(baseX-lean),ty=baseY-height;
  curve(z=>[side*(baseX-lean*z*z),baseY-height*z],q,gold,a,1.7);
  for(const dir of [-1,1])for(let j=0;j<3;j++){
   const width=43-j*6,dy=-19+j*16;
   curve(z=>[tx+dir*width*z*leaf,ty+(dy*z+26*z*z)*leaf],1,col,a*leaf);
  }
  for(let j=0;j<2;j++)ring(tx+(j?4:-4),ty+6,3,4,gold,a*leaf);
 }
 function sea(y,span){for(let j=0;j<3;j++)curve(z=>[-span+2*span*z,y+j*11+Math.sin(z*TAU*2-t*4+j*.5)*2.4],1,col,a*(.7-j*.18))}
 if(v===0){
  // Balanced palms grow first; a complete sun lifts between them.
  palmTree(-1,77,58,109,15,0);palmTree(1,77,58,109,15,.04);
  const q=ease(seg(.24,.7)),y=23-48*q;
  ring(0,y,22,22,gold,a*q);
  for(let j=0;j<12;j++){const z=j*TAU/12;line([[Math.cos(z)*30,y+Math.sin(z)*30],[Math.cos(z)*(30+9*q),y+Math.sin(z)*(30+9*q)]],col,a*q)}
  sea(70,109);curve(z=>[-93+186*z,59-6*Math.sin(z*Math.PI)],u,gold,a*.55);
 }
 if(v===1){
  // Taller, inward-curving palms form an arch around the radiant sun.
  palmTree(-1,92,75,138,35,0);palmTree(1,92,75,138,35,.06);
  const q=ease(seg(.22,.68));c.save();c.translate(0,-24);c.scale(.4+.6*q,.4+.6*q);sun(0,0,26);c.restore();
  const arc=ease(seg(.48,.77));curve(z=>[Math.cos(Math.PI*z)*107,70+Math.sin(Math.PI*z)*20],arc,gold,a*.7);
  sea(68,55);burst(0,-24,seg(.65,.95));
 }
 if(v===2){
  // Fronds sway in a sea breeze as a half-sun emerges over the horizon.
  const sway=Math.sin(t*TAU)*2.6;
  c.save();c.translate(sway,0);palmTree(-1,82,58,118,19,0);c.restore();
  c.save();c.translate(sway*.7,0);palmTree(1,83,58,103,10,.08);c.restore();
  const q=ease(seg(.2,.68)),rad=32*q;
  curve(z=>[Math.cos(Math.PI+z*Math.PI)*rad,22+Math.sin(Math.PI+z*Math.PI)*rad],1,gold);
  line([[-49,22],[49,22]],gold,a*.8);
  for(let j=0;j<7;j++){const z=Math.PI+j*Math.PI/6;line([[Math.cos(z)*(rad+8),22+Math.sin(z)*(rad+8)],[Math.cos(z)*(rad+18),22+Math.sin(z)*(rad+18)]],col,a*q)}
  for(let j=0;j<3;j++)line([[-(21-j*6),33+j*8],[(21-j*6),33+j*8]],gold,a*q*.6);
  sea(70,111);
 }
