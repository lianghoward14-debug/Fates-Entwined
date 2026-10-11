import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {FateAuthoritativeV3SinglePlayerScreen} from '../src/scripts/authoritative-v3-single-player-screen.mjs';
const source=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const start=source.indexOf('const localPickerSessions =');
const end=source.indexOf('function collectPendingCardWindowEffectsForEndTurn',start);
const card={iid:'source',owner:0,name:'Regiment'};
const context={G:{turn:1,currentPlayer:0,phase:'main'},findBoardPositionForCard:()=>({z:0,r:2,c:0}),
  closeModal(){},renderGame(){},markInitialEffectResolved(card){card.spent=true;}};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);
let confirm, gains=0, afterChoice=0;
const effect=context.runLocalPickerEffect(card,async()=>{
  await new Promise(resolve=>{confirm=()=>{gains+=3;resolve();};});
  afterChoice++;
});
await Promise.resolve();
let reopened=0;
assert.equal(context.deferLocalEffectPicker(card,()=>{reopened++;}),true);
await effect;
assert.equal(gains,0);
assert.equal(afterChoice,0,'cancel must suspend the original async continuation');
assert.equal(context.hasDeferredLocalPicker(card),true);
context.resumeDeferredLocalPicker(card);
assert.equal(reopened,1);
assert.equal(context.hasDeferredLocalPicker(card),false);
confirm();
await Promise.resolve(); await Promise.resolve();
assert.equal(gains,3);
assert.equal(afterChoice,1,'post-picker steps must run exactly once after confirmation');
context.deferLocalEffectPicker(card,()=>{throw Error('expired picker reopened');});
context.expireDeferredLocalPickers();
context.G.turn++;
assert.equal(context.hasDeferredLocalPicker(card),false);
assert.equal(card.spent,true);

// All single-player end-turn entry points share submit(), including the custom HUD.
let warning, sent=0, discard;
const screen=Object.create(FateAuthoritativeV3SinglePlayerScreen.prototype);
Object.assign(screen,{window:{showEndTurnEffectWarning:(effects,cb)=>{warning={effects,cb};},
  confirmCardDiscard:(source,cb)=>{discard=cb;}},
  view:{legalCommands:[{type:'ACTIVATE_EFFECT',deferredPicker:true,payload:{sourceIid:card.iid}}]},
  findCard:()=>card, adapter:{dispatchLegalCommand(){sent++;return {ok:true};}},finishSubmit:value=>value});
screen.submit({type:'END_TURN'});
assert.equal(sent,0);
assert.equal(warning.effects[0].name,'Regiment');
warning.cb();
assert.equal(sent,1);
screen.submit({type:'DISCARD_CARD',payload:{targetIid:card.iid}});
assert.equal(sent,1);
discard();
assert.equal(sent,2);
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const submitStart=online.indexOf('  function phase7SubmitCommand(');
const submitBody=online.slice(submitStart,online.indexOf('    const activePrompt =',submitStart));
const onlineContext={window:{showEndTurnEffectWarning:(effects,cb)=>{warning={effects,cb};}},
  phase7CurrentUiSession:{adapter:{}},phase7CurrentCommands:()=>screen.view.legalCommands,
  phase7FindBoardCard:()=>({card,z:1})};
vm.createContext(onlineContext);
vm.runInContext(submitBody+'return "submitted";\n}',onlineContext);
assert.equal(await onlineContext.phase7SubmitCommand({type:'END_TURN'}),false);
assert.equal(warning.effects[0].zone,2);
assert.equal(warning.cb(),'submitted','multiplayer confirmation must bypass only the warning');
console.log('Local picker continuation and single-player discard/end-turn confirmation regressions passed.');
