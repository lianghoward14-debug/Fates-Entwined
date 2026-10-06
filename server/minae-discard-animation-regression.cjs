const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ai=fs.readFileSync('src/scripts/07-ai.js','utf8');
const helpers=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
const branch=ai.slice(ai.indexOf("    case '16': { // MINAE:"),ai.indexOf("    case '18':",ai.indexOf("    case '16': { // MINAE:")));
for(const blocked of [false,true]){
 const card={id:blocked?'76':'32',iid:'victim',name:'Victim',type:'Supporter',owner:0};
 const motion=[],pile=[],sounds=[],logs=[];
 const c={G:{board:[[[card]]]},z:0,cp:1,opp:0,
  window:{FateV2CardMotionFx:{flyBoardCard:(...args)=>motion.push(args)}},
  aiOpponentCardDecisionFate:()=>1,discardBerkeleyHomelessWithHandCost:()=>false,
  rendererV2OwnsBoardScene:()=>true,playDiscardSfx:()=>sounds.push('discard'),
  fatePushDiscard:(owner,target)=>pile.push({owner,target}),toast(){},log:(...args)=>logs.push(args)};
 vm.createContext(c);
 const start=helpers.indexOf('function discardBoardCard(');
 const end=helpers.indexOf('\nlet _hoverPreviewEl',start);
 vm.runInContext(helpers.slice(start,end),c);
 vm.runInContext("switch('16'){"+branch+'}',c);
 assert.equal(motion.length,blocked?0:1);
 assert.equal(sounds.length,blocked?0:1);
 assert.equal(pile.length,blocked?0:1);
 assert.equal(logs.length,blocked?0:1);
 if(!blocked){assert.equal(motion[0][0],card);assert.equal(motion[0][4],'discard');assert.equal(pile[0].owner,0);assert.equal(c.G.board[0][0][0],null);}
}
console.log('MINAE AI discard animation, audio, ownership and blocked-discard regression passed.');
