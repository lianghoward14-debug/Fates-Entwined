const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const data=fs.readFileSync('src/scripts/01-data-and-state.js','utf8');
const cardsSource=data.slice(data.indexOf('const CARDS = ['),data.indexOf('\n];',data.indexOf('const CARDS = ['))+3);
const source=fs.readFileSync('src/scripts/11-tutorial.js','utf8');
const noop=()=>{};
const el={style:{},classList:{add:noop,remove:noop},setAttribute:noop,remove:noop};
const context=vm.createContext({console,window:{},document:{body:{classList:el.classList,appendChild:noop},getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({...el})},G:{turn:1,currentPlayer:0,players:[{hand:[],deck:[]},{hand:[],deck:[]}]},setTimeout,clearTimeout,CustomEvent:function(){},createCardInstance:(c,owner)=>({...c,owner}),renderHand:noop});
vm.runInContext(cardsSource+'\n'+source,context);
vm.runInContext(`
_tutorialActive=true;
G.p1Deck=TUTORIAL_FREE_WORLD_FALLBACK.slice();
applyTutorialScriptedCards();
this.plans=TUTORIAL_TURN_PLANS;
this.cards=CARDS;
`,context);
let count=0;
for(let turn=0;turn<context.plans.length;turn++){
 context.G.turn=turn*2+1;context.G._tutorialActionIndex=0;
 if(turn)context.G.players[0].hand.push(context.G.players[0].deck.shift());
 for(const action of context.plans[turn].actions){
  assert.equal(context.tutorialCanEndTurn(),false);
  const before=context.G._tutorialActionIndex;
  if(action.kind==='search'){
   const options={searchSourceCardId:action.sourceId};
   const choices=context.tutorialFilterCardPickerOptions(context.G.players[0].deck,options);
   assert.equal(choices.length,1);assert.equal(choices[0].id,action.id);
   assert.equal(options.minCount,1);assert.equal(options.allowCancel,false);
   context.tutorialAfterDeckSearch(0,[]);assert.equal(context.G._tutorialActionIndex,before,'empty search must not advance');
   context.G.players[0].deck=context.G.players[0].deck.filter(c=>c!==choices[0]);
   context.G.players[0].hand.push(choices[0]);context.tutorialAfterDeckSearch(0,choices);
   assert.match(context.cards.find(c=>c.id===action.sourceId).effect,/search/i);
  }else{
   const card=context.G.players[0].hand.find(c=>c.id===action.id);assert.ok(card,'required card in hand: '+action.id);
   assert.equal(context.tutorialCanStartHandAction(card,action.kind),true);
   if(action.kind==='place'){
    assert.equal(context.tutorialCanPlaceCardAt(card,action.z,action.r,action.c),true);
    assert.equal(context.tutorialCanPlaceCardAt(card,action.z,0,action.c),false);
   }else{
    assert.equal(card.cost,1);
    for(const t of action.tributes)assert.equal(context.tutorialCanSelectConsolidationTribute({card},t.z,t.r,t.c),true);
   }
   context.G.players[0].hand.splice(context.G.players[0].hand.indexOf(card),1);
   context.tutorialEvent(action.kind==='place'?'placeSupporter':'placeCharacter',{card});
  }
  assert.equal(context.G._tutorialActionIndex,before+1);count++;
 }
 assert.equal(context.tutorialCanEndTurn(),true);
}
assert.equal(count,8);
console.log('Tutorial progression passed: all 3 turns, 8 actions, required cards, mandatory searches, placement guards, end-turn gates.');
