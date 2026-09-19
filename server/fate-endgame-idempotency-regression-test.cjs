const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function functionSource(source,name,nextName){
  const start=source.indexOf('function '+name+'(');assert(start>=0,'missing '+name);
  const end=source.indexOf('function '+nextName+'(',start+name.length+10);assert(end>start,'missing boundary '+nextName);
  return source.slice(start,end);
}const offline=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const checkWin=functionSource(offline,'checkWin','startWolfCreekMove');
assert(checkWin.indexOf('if(G._endgameResolved) return;')>=0);
assert(checkWin.indexOf('G._endgameResolved = true;')<checkWin.indexOf("playSfx('win')"));
assert(checkWin.indexOf('G._endgameResolved = true;')<checkWin.indexOf("updateDailyChallengeProgress('matches'"));
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const renderOutcome=functionSource(online,'phase7RenderAuthoritativeOutcome','phase7PresentAuthoritativeOutcome');
const sounds=[];
const winScreen={classList:{remove(){}},dataset:{},querySelector(){return null;}};
const context={
  phase7CurrentUiSession:{outcomeAudioKey:'',onExit:null},
  phase7OutcomeZoneResults:()=>[],gameState:()=>null,esc:String,
  document:{getElementById:id=>id==='s-win'?winScreen:null},
  window:{playSfx:key=>sounds.push(key),showScreen(){},applyWinScreenGameBackground(){},stopTurnTimer(){},hidePassTurnOverlay(){},removeInGameChat(){},closeGameModal(){},cleanupTutorialAndDialogueArtifacts(){},cleanupFloatingGameArtifacts(){}},
  setTimeout:fn=>{fn();return 1;},console
};
vm.createContext(context);vm.runInContext(renderOutcome,context);
const view={playerIndex:0,state:{matchId:'match-one',players:[{name:'A'},{name:'B'}]}};
const outcome={type:'WIN',winner:0,zoneResults:[]};
assert.equal(context.phase7RenderAuthoritativeOutcome(view,outcome),true);
assert.equal(context.phase7RenderAuthoritativeOutcome(view,outcome),true);
assert.deepEqual(sounds,['win','matchEnd']);
const css=fs.readFileSync('src/styles/challenger-war-event.css','utf8');
assert.match(css,/\.war2-map\{[^}]*filter:none/);
assert.match(css,/\.war2-map-art\{[^}]*filter:saturate\(1\.6\)/);
assert.match(css,/\.war2-objective-ui-filter\{[^}]*filter:saturate\(1\.6\)/);
const warfrontSource=fs.readFileSync('src/scripts/47-challenger-war-event.js','utf8');
assert.equal((warfrontSource.match(/war2-objective-ui-filter/g)||[]).length,2);
console.log('Endgame effects run once; Warfront color affects map/objective UI while portraits remain unfiltered.');