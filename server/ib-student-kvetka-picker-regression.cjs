const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const slice=(a,b)=>helpers.slice(helpers.indexOf(a),helpers.indexOf(b,helpers.indexOf(a)));
const timing=slice('function getChoicePresentationDelayMs(', 'function pickCardInZone(');
const lifetime=slice('function bindLocalCardPickerLifetime(', '// Image-based card picker with pagination');
const entry=slice('function pickCardsVisual(', "  if(!cards.length){toast('No matching cards found')")+'\n mounted.push(opts.searchSourceCardId); }';
for(const owner of [0,1])for(const order of ['old-first','new-first']){
 const ib={id:'60',iid:'ib',owner},kvetka={id:'84',iid:'kvetka',owner};
 let field=[ib],active=ib,delay=80;const timers=[],mounted=[];
 const ctx={G:{turn:1,currentPlayer:owner},Date,mounted,
  localPickerSource:()=>active,findBoardPositionForCard:card=>field.includes(card)?{z:0,r:0,c:0}:null,
  getInteractionAnimationDelayMs:()=>delay,setTimeout:fn=>timers.push(fn)};
 ctx.window={FateActivationBanner:{pickerConfirmation:()=>null}};
 ctx.getMultiplayerCardSelectionTitle=id=>id;
 vm.createContext(ctx);vm.runInContext(timing+lifetime+entry,ctx);
 ctx.pickCardsVisual([{}],{searchSourceCardId:'60',immediate:true},()=>{});
 assert.equal(mounted.length,0);
 field=[kvetka];active=kvetka;
 ctx.pickCardsVisual([{}],{searchSourceCardId:'84',immediate:true},()=>{});
 delay=0;if(order==='new-first')timers.reverse();
 while(timers.length)timers.shift()();
 assert.deepEqual(mounted,['84'],'IB Student must not overwrite Kvetka after consolidation');
 assert.equal(ctx.G._deferredCardPickers,0);
 // IB Student still gets her own choice if she remains on the field.
 field=[ib];active=ib;delay=80;
 ctx.pickCardsVisual([{}],{searchSourceCardId:'60',immediate:true},()=>{});
 delay=0;timers.shift()();assert.deepEqual(mounted,['84','60']);
}
console.log('PASS IB Student → Kvetka: both local seats, both timer orders, stale prompt discarded, valid IB search preserved.');
