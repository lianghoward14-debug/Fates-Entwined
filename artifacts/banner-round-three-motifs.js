 if(r===0&&v===0){
  // A torch rises; its flame separates into two crisp tongues.
  const rise=ease(seg(.04,.5));c.save();c.translate(0,55*(1-rise));
  line([[-15,4],[-10,81],[10,81],[15,4]],col);line([[-24,-6],[-18,9],[18,9],[24,-6],[-24,-6]],gold,a,2);
  const q=ease(seg(.18,.67));
  curve(z=>[-22*Math.sin(z*Math.PI)+9*Math.sin(z*TAU),-7-77*z*q],1,gold);
  curve(z=>[27*Math.sin(z*Math.PI)-12*Math.sin(z*TAU),-7-77*z*q],1,gold);
  curve(z=>[12*Math.sin(z*TAU),-8-48*z*q],1,col);
  for(let i=0;i<5;i++){const p=seg(.36+i*.05,.76+i*.035);star((i-2)*20*p,-52-42*p,2,a*Math.sin(p*Math.PI))}c.restore();
 }
 if(r===0&&v===1){
  // A seed opens into a young plant under a slowly rising sun.
  const q=ease(seg(.12,.72));line([[-89,69],[89,69]],col,a*.6);
  curve(z=>[8*Math.sin(z*Math.PI),65-102*z],q,gold);
  for(const s of [-1,1]){const p=ease(seg(s<0?.2:.35,s<0?.62:.77)),y=s<0?21:-5;c.save();c.translate(5,y);c.scale(p,p);curve(z=>[s*60*z,-34*Math.sin(z*Math.PI/2)],1,col);curve(z=>[s*60*(1-z),-34+34*z*z],1,col);c.restore()}
  const sy=-32-40*ease(seg(.05,.55));ring(0,sy,19,19,gold);for(let i=0;i<7;i++){const z=Math.PI+i*Math.PI/6;line([[Math.cos(z)*27,sy+Math.sin(z)*27],[Math.cos(z)*36,sy+Math.sin(z)*36]],col,a*q)}
 }
 if(r===0&&v===2){
  // A sun is assembled from rotating segments, then locks into a crest.
  const q=ease(seg(.08,.67));for(let i=0;i<8;i++){const z=i*TAU/8,rad=98-55*q,rot=z+(1-q)*.8;
   curve(p=>[Math.cos(rot+p*.53)*rad,Math.sin(rot+p*.53)*rad],1,gold);
   line([[Math.cos(z+.26)*(rad+10),Math.sin(z+.26)*(rad+10)],[Math.cos(z+.26)*(rad+27),Math.sin(z+.26)*(rad+27)]],col);
  }star(0,0,12,a*q);burst(0,0,seg(.62,.96));
 }
 if(r===1&&v===0){
  // Three separate standards converge into one common base.
  const q=ease(seg(.08,.64));for(let i=0;i<3;i++){c.save();c.translate((i-1)*(93-35*q),i===1?-24:7);flag(-10,0,q,.65);c.restore()}
  const join=ease(seg(.48,.78));line([[-87*join,75],[87*join,75]],gold,a*join,2);line([[-58,61],[-58,75],[58,75],[58,61]],col,a*join);star(0,75,6,a*join);burst(0,75,seg(.65,.97));
 }
 if(r===1&&v===1){
  // A raised fist closes and rises as the rally's central emblem.
  const q=ease(seg(.08,.62));c.save();c.translate(0,49*(1-q));
  line([[-27,78],[-27,23],[-48,4],[-48,-19],[-38,-27],[-20,-11]],col,a,2);
  line([[-20,-11],[-24,-45],[-18,-54],[-6,-54],[0,-46],[0,-20]],gold,a,2);
  line([[0,-46],[5,-62],[18,-62],[24,-54],[24,-20]],gold,a,2);
  line([[24,-54],[31,-54],[40,-47],[40,-15]],gold,a,2);
  line([[40,-42],[48,-39],[52,-30],[52,2],[31,25],[31,78]],col,a,2);
  line([[-27,63],[31,63]],gold);line([[-20,-10],[9,-14],[23,-3],[12,13],[-4,10]],col);
  c.restore();for(let i=0;i<7;i++){const z=Math.PI+i*Math.PI/6;line([[Math.cos(z)*87,Math.sin(z)*87-9],[Math.cos(z)*(87+18*q),Math.sin(z)*(87+18*q)-9]],gold,a*q)}
 }
 if(r===1&&v===2){
  // Separate links join into a single strong chain.
  const q=ease(seg(.06,.65));for(let i=0;i<3;i++){c.save();c.translate((i-1)*(102-52*q),0);c.rotate((i-1)*(.65-.25*q));
   curve(z=>[Math.cos(z*TAU)*42,Math.sin(z*TAU)*24],1,i===1?gold:col);
   curve(z=>[Math.cos(z*TAU)*32,Math.sin(z*TAU)*14],1,i===1?gold:col,a*.7);c.restore();
  }for(const s of [-1,1])burst(s*26,0,seg(.62,.95));
  const p=ease(seg(.55,.8));line([[-14,60],[0,46-9*p],[14,60]],gold,a*p);line([[-14,-60],[0,-46+9*p],[14,-60]],gold,a*p);
 }
