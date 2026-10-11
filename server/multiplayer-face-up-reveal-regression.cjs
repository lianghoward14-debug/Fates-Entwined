const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const start=source.indexOf("      if(type === 'CARD_FLIPPED' && target){");
const end=source.indexOf("      if(type === 'CARD_DISCARDED'",start);
assert(start>=0&&end>start);
const hydration=source.slice(source.indexOf('  function phase7PresentationCard('),source.indexOf('  function phase7IsTokenCard('));
const lookup=source.slice(source.indexOf('  function phase7FindProjectedEntry('),source.indexOf('  function phase7BuildCardSetPresentationPreview('));
for(const ownerView of [false,true])for(const motionEnabled of [false,true])for(const publicReveal of [false,true]){
 const oldCard={iid:'flip-1',owner:0,faceDown:true,hidden:!ownerView,id:ownerView?'104':undefined,img:ownerView?'104.png':'back.png',runtimeImg:ownerView?'104.png':'back.png'};
 const publicCard=publicReveal?{iid:'flip-1',id:'104',owner:0,faceDown:false}:structuredClone(oldCard);
 if(!publicReveal){publicCard.hidden=true;delete publicCard.id;}
 const g={board:[[[oldCard]]],unrelated:'pending'},calls=[];
 const view={state:{board:[[[publicCard]]],players:[]}};
 const ctx={CARDS:[{id:'104',name:'Rivera',img:'104.png',runtimeImg:'104.png',rarity:'square',type:'Character'}],phase7CardToLegacy:c=>structuredClone(c),type:'CARD_FLIPPED',target:oldCard,targetLocation:{zone:'board',z:0,r:0,c:0},event:{cardIid:'flip-1',faceDown:false},eventIndex:0,batchId:'reveal-batch',view,gameState:()=>g,resultMotionStarted:false,window:{
  FateV2CardMotionFx:{flipBoardCard:(card)=>{calls.push(['flip',card]);return motionEnabled;}},
  FateMatchRendererAdapter:{renderFromGameState:()=>calls.push(['board',g.board[0][0][0]])},
  requestCharacterSetCinematic:(card,options)=>{calls.push(['cinematic',card,options]);return true;}
 }};
 vm.createContext(ctx);vm.runInContext(hydration+lookup+'(function(){'+source.slice(start,end)+'})()',ctx);
 if(!publicReveal){assert.equal(calls.length,0,'unrevealed projection must stay concealed');assert.equal(g.board[0][0][0],oldCard);continue;}
 assert.deepEqual(calls.map(c=>c[0]),['flip','board','cinematic']);
 for(const [,card] of calls){assert.equal(card.img,'104.png');assert.equal(card.runtimeImg,'104.png');assert.equal(card.hidden,false);assert.equal(card.faceDown,false);}
 assert.equal(calls[2][2].delayMs,motionEnabled?980:90);
 assert.equal(ctx.resultMotionStarted,true,'wait for cinematic even when motion is disabled');
 assert.equal(oldCard.faceDown,true,'do not mutate previous snapshot');
 assert.equal(view.state.board[0][0][0],publicCard,'do not mutate incoming snapshot');
 assert.equal(g.unrelated,'pending');
}
console.log('Multiplayer face-up reveal: owner/opponent art, immediate board reveal, disabled-motion timing, and hidden projection safety passed.');
