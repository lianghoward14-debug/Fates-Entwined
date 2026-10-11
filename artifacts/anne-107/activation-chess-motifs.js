 // A foreshortened board shared by the three choreography variations.
 const board=(x,y)=>[(x-2.5)*(32+5*y),-2+19*y];
 const boardAlpha=a*ease(seg(.01,.2));
 for(let n=0;n<=5;n++){
  line([board(n,0),board(n,5)],jade,boardAlpha*.3,1);
  line([board(0,n),board(5,n)],jade,boardAlpha*.3,1);
 }
 function tile(x,y,alpha=a){line([board(x-.5,y-.5),board(x+.5,y-.5),board(x+.5,y+.5),board(x-.5,y+.5),board(x-.5,y-.5)],gold,alpha,1.5)}
 function pawn(x,y,size=1,alpha=a){c.save();c.translate(x,y);c.scale(size,size);ring(0,-43,10,alpha);line([[-7,-33],[-16,-11],[16,-11],[7,-33]],gold,alpha);line([[-21,-10],[21,-10],[24,0],[-24,0],[-21,-10]],gold,alpha);c.restore()}
 function queen(x,y,size=1,alpha=a){c.save();c.translate(x,y);c.scale(size,size);line([[-17,-30],[-24,-58],[-10,-47],[0,-66],[10,-47],[24,-58],[17,-30],[-17,-30]],gold,alpha);line([[-13,-29],[-18,-10],[18,-10],[13,-29]],gold,alpha);line([[-23,-10],[23,-10],[26,0],[-26,0],[-23,-10]],gold,alpha);for(const p of [[-24,-61],[0,-69],[24,-61]])ring(p[0],p[1],2.5,alpha);c.restore()}
 function knight(x,y,size=1,alpha=a){c.save();c.translate(x,y);c.scale(size,size);line([[-21,0],[24,0],[20,-10],[-18,-10],[-21,0]],gold,alpha);line([[-16,-11],[-13,-28],[0,-41],[-16,-37],[-22,-44],[-8,-59],[-7,-69],[2,-64],[11,-61],[19,-46],[21,-27],[16,-11]],gold,alpha);line([[-8,-51],[-4,-51]],jade,alpha,2);c.restore()}
 if(v===0){
  // A pawn crosses the board and earns a crown on the far rank.
  const move=ease(seg(.15,.57)),promote=ease(seg(.58,.76)),start=board(2.5,4.5),end=board(2.5,.5);
  const x=0,y=start[1]+(end[1]-start[1])*move;
  curve(z=>[0,start[1]+(end[1]-start[1])*z],move,jade,a*.6);
  tile(2.5,.5,a*ease(seg(.4,.62)));
  pawn(x,y-9*Math.sin(move*Math.PI),.85,a*(1-promote));
  queen(x,y-12*(1-promote),.9,a*promote);
  burst(x,y-40,seg(.61,.96));
 }
 if(v===1){
  // The L-shaped route is drawn before the knight leaps to its destination.
  const start=board(1.5,3.5),corner=board(1.5,1.5),end=board(3.5,1.5),q=ease(seg(.31,.7));
  const plan=ease(seg(.08,.37));
  if(plan<.5)line([start,[start[0]+(corner[0]-start[0])*plan*2,start[1]+(corner[1]-start[1])*plan*2]],jade,a*.7);
  else line([start,corner,[corner[0]+(end[0]-corner[0])*(plan-.5)*2,corner[1]+(end[1]-corner[1])*(plan-.5)*2]],jade,a*.7);
  tile(3.5,1.5,a*ease(seg(.2,.4)));
  const x=start[0]+(end[0]-start[0])*q,y=start[1]+(end[1]-start[1])*q-44*Math.sin(q*Math.PI);
  knight(x,y,.9);burst(end[0],end[1]-22,seg(.69,.97));
 }
 if(v===2){
  // Two supporting pawns clear lanes; the queen advances through the centre.
  const flanks=ease(seg(.1,.4)),advance=ease(seg(.36,.72));
  for(const s of [-1,1]){const sx=2.5+s,sy=3.5-flanks*2,[x,y]=board(sx,sy);curve(z=>board(sx,3.5-2*z),flanks,jade,a*.55);tile(sx,1.5,a*.55*flanks);pawn(x,y,.64,a*.85)}
  const [x,y]=board(2.5,4.5-2*advance);tile(2.5,2.5,a*advance);
  queen(x,y-12*Math.sin(advance*Math.PI),.85);
  for(const s of [-1,1])curve(z=>{const p=board(2.5+s*(1-z),1.5+z);return[p[0],p[1]-10*Math.sin(z*Math.PI)]},ease(seg(.6,.78)),gold,a*.65);
  burst(x,y-36,seg(.7,.98));
 }
