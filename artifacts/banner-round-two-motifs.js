 if(r===0&&v===0){
  // Closed gates part to reveal the new dawn.
  const q=ease(seg(.16,.67));
  for(const s of [-1,1]){c.save();c.translate(s*47*q,0);line([[s*3,65],[s*3,-65],[s*55,-65],[s*55,65]],col);for(let j=1;j<4;j++)line([[s*(7+j*11),-53],[s*(7+j*11),54]],col,a*.6);c.restore()}
  c.save();c.scale(.25+.65*q,.25+.65*q);sun(0,-4,29);c.restore();line([[-119,69],[119,69]],gold);burst(0,-5,seg(.59,.95));
 }
 if(r===0&&v===1){
  // Sunlight travels along a continuous ribbon and ties the crest together.
  const q=ease(seg(.06,.68));sun(0,-20,26);
  for(const s of [-1,1])curve(z=>[s*(122-122*z),46-25*Math.sin(z*Math.PI)+11*Math.sin(z*TAU)],q,col);
  const fold=ease(seg(.4,.73));line([[-65*fold,43],[-44*fold,58],[0,47],[44*fold,58],[65*fold,43]],gold,a*fold);
  for(const s of [-1,1])star(s*122*(1-q),46-25*Math.sin(q*Math.PI)+11*Math.sin(q*TAU),4);burst(0,47,seg(.61,.96));
 }
 if(r===0&&v===2){
  // One falling star becomes a rising sun with spreading rays.
  const q=ease(seg(.06,.43)),b=ease(seg(.37,.76));star(0,-112+99*q,8,a*(1-b));
  line([[0,-125+85*q],[0,-113+99*q]],gold,a*(1-b));
  c.save();c.translate(0,-13);c.scale(.15+.85*b,.15+.85*b);sun(0,0,30);c.restore();
  for(const s of [-1,1])for(let j=0;j<3;j++)curve(z=>[s*z*(100-j*13)*b,30+j*16-Math.sin(z*Math.PI)*17],1,col,a*b);
  burst(0,-13,seg(.36,.82));
 }
 if(r===1&&v===0){
  // Two sabres cross under a raised revolutionary standard.
  const q=ease(seg(.06,.57));for(const s of [-1,1]){c.save();c.translate(s*35*(1-q),0);c.rotate(s*(-.9*q));line([[0,59],[0,-64],[6,-79],[10,-61],[7,59]],col);line([[-15,30],[18,30]],gold,a,2);line([[0,39],[7,39]],gold);line([[0,50],[7,50]],gold);c.restore()}
  flag(-8,-60,ease(seg(.36,.74)),.55);burst(0,0,seg(.5,.93));
 }
 if(r===1&&v===1){
  // A palm opens above a ring of equal citizens.
  const q=ease(seg(.08,.64));curve(z=>[-4+8*Math.sin(z*Math.PI),65-117*z],q,gold);
  for(const s of [-1,1])for(let j=0;j<3;j++)curve(z=>[s*z*(67-j*14)*q,-52+z*(j*20-15)+z*z*30],1,col,a*q);
  for(let j=0;j<5;j++){const z=Math.PI*.16+j*Math.PI*.17,x=Math.cos(z)*95,y=18+Math.sin(z)*61,p=ease(seg(.23+j*.05,.6+j*.05));ring(x,y-12,7*p,7*p,gold);curve(u=>[x-12+24*u,y+13-12*Math.sin(u*Math.PI)],p,col)}
  curve(z=>[Math.cos(z*Math.PI)*120,55+Math.sin(z*Math.PI)*41],u,col,a*.5);
 }
 if(r===1&&v===2){
  // A marching drum calls two crisp waves of reinforcements.
  ring(0,-18,47,17,gold);curve(z=>[Math.cos(z*Math.PI)*47,35+Math.sin(z*Math.PI)*17],1,gold);line([[-47,-18],[-47,35]],col);line([[47,-18],[47,35]],col);
  for(let i=0;i<5;i++){const x=-40+i*20;line([[x,-9],[x+10,36],[x+20,-9]],col,a*.7)}
  const hit=Math.sin(seg(.2,.55)*Math.PI);for(const s of [-1,1])line([[s*70,-69],[s*8,-39+22*hit]],gold,a,2);
  for(let i=0;i<2;i++){const p=seg(.31+i*.22,.68+i*.22);ring(0,0,57+70*p,35+42*p,col,a*Math.sin(p*Math.PI))}
 }
 if(r===2&&v===0){
  // Sand drains into a patient hourglass; the lower chamber fills.
  line([[-43,-70],[43,-70]],gold,a,2);line([[-43,70],[43,70]],gold,a,2);
  for(const s of [-1,1])curve(z=>[s*(35*Math.abs(2*z-1)**.7+2),-62+124*z],1,col);
  const q=ease(seg(.08,.75));line([[-25*(1-q),-42+32*q],[25*(1-q),-42+32*q]],gold);
  for(let i=0;i<6;i++){const y=58-i*5,hw=(27-i*4)*q;line([[-hw,y],[hw,y]],gold,a*q)}
  for(let i=0;i<7;i++){const y=((t*130+i*9)%57);star(0,y,1.1,a*(1-seg(.7,.85)))}
  burst(0,45,seg(.68,.96));
 }
 if(r===2&&v===1){
  // Pendulum settles as the long game reaches its chosen moment.
  curve(z=>[Math.cos(Math.PI+z*Math.PI)*65,-23+Math.sin(Math.PI+z*Math.PI)*65],1,gold);
  line([[-65,-23],[-65,82],[65,82],[65,-23]],col);line([[-51,67],[51,67]],gold,a*.55);
  const angle=Math.sin(t*TAU*2)*.7*(1-ease(seg(.1,.75)));c.save();c.translate(0,-45);c.rotate(angle);line([[0,0],[0,86]],gold);ring(0,91,15,15,gold);c.restore();ring(0,-45,5,5,col);
  for(let i=0;i<5;i++){const z=Math.PI+i*Math.PI/4;line([[Math.cos(z)*51,-23+Math.sin(z)*51],[Math.cos(z)*57,-23+Math.sin(z)*57]],col)}burst(0,47,seg(.73,.97));
 }
 if(r===2&&v===2){
  // Laurel branches grow around a steady restorative emblem.
  const q=ease(seg(.06,.72));for(const s of [-1,1]){curve(z=>[s*(16+62*Math.sin(z*1.65)) ,79-146*z],q,col);for(let i=0;i<6;i++){const p=ease(seg(.09+i*.075,.36+i*.075)),z=(i+.5)/6,x=s*(16+62*Math.sin(z*1.65)),y=79-146*z;line([[x,y],[x+s*22*p,y-20*p],[x+s*24*p,y-4*p],[x,y]],gold,a*p)}}
  line([[0,-40],[0,26]],gold,a*u,2);line([[-24,-7],[24,-7]],gold,a*u,2);ring(0,-7,40,40,col,a*.5*u);star(0,82,5);burst(0,-7,seg(.68,.96));
 }
