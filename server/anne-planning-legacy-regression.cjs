const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/scripts/50-anne-planning.js'),'utf8');
for(const action of ['DRAW','SEARCH','FATE','MOVEMENT','STATUS','MORALE']){
 const anne={id:'107',iid:'anne',owner:0,currentFate:2},other={id:'32',iid:'other',owner:1,currentFate:1};
 const state={turn:1,currentPlayer:0,board:[[[anne,other,null]]],_moralePressure:{morale:[100,100]}};
 const window={getFateGameState:()=>state};
 vm.runInNewContext(source,{window,getEffectiveFate:c=>c.currentFate,modifyFate:(c,n)=>c.currentFate+=n});
 const api=window.FateAnnePlanning;api.arm(anne,action);api.notify(action,1);assert.equal(anne.currentFate,2);
 assert.equal(anne._anneLastActivatedTurn,1);
 state.turn=2;state.currentPlayer=1;
 other.currentFate++;state._moralePressure.morale[1]-=5;state.board[0][0]=[anne,null,other];api.observe();
 api.statuses([{owner:1,sourceIid:'existing',label:'Existing'}]);
 assert.equal(anne.currentFate,2,'raw state changes and existing statuses do not qualify');
 const trigger=()=>api.notify(action,1);
 trigger();assert.equal(anne.currentFate,10,action);trigger();assert.equal(anne.currentFate,10);
 assert.equal(anne._anneFateGained,8);
 state.turn=3;state.currentPlayer=0;api.arm(anne,action);state.turn=4;state.currentPlayer=1;
 state._phase7CurrentMultiplayer=true;api.notify(action,1);assert.equal(anne.currentFate,10,'authoritative state is never mutated');
}
{
 const ui=fs.readFileSync(path.join(__dirname,'../src/scripts/06-rendering-and-helpers.js'),'utf8');
 const start=ui.indexOf('function getAnnePlanningStatusEffects('),end=ui.indexOf('\nfunction ',start+10);
 const context={CARDS:[{id:'107',name:'Anne Stone (Revolutionary)'}],getStatusEffectIcon:()=>'<svg/>',coerceStatusOwner:(value,fallback)=>value??fallback};
 vm.createContext(context);vm.runInContext(ui.slice(start,end),context);
 const game={turn:1,board:[[[{id:'107',iid:'anne',owner:0,counters:{anneDeclarations:[{action:'DRAW',turn:2},{action:'SEARCH',turn:2}]}}]]]};
 const plans=context.getAnnePlanningStatusEffects(game,0);
 assert.equal(plans.length,2);assert.notEqual(plans[0].extraClass,plans[1].extraClass,'different predictions must not collapse into one banner');
 assert.equal(context.getAnnePlanningStatusEffects(game,1).length,0,'plans are owner-only');
 game.turn=3;assert.equal(context.getAnnePlanningStatusEffects(game,0).length,0,'expired plans disappear');
}
console.log('PASS Anne legacy/status UI: six triggers, one reward, own-turn gate, authoritative isolation, distinct private banners and expiry.');

{
 const core=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
 const ui=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
 const extract=(text,name)=>{const start=text.indexOf('function '+name+'(');return text.slice(start,text.indexOf('\nfunction ',start+10));};
 const card={id:'107',owner:0,_anneEffectUses:1,_anneLastActivatedTurn:1,_anneFateGained:8};
 const ctx={G:{turn:1,currentPlayer:0,phase:'main'},document:{getElementById:()=>({classList:{contains:()=>true}})},escapeHtml:String,
 forEachBoardCard:fn=>fn(card,0,0,0),hasDeferredLocalPicker:()=>false,canActivatePendingWhenSetEffect:()=>false,
 shouldShowManualCharacterEffectButton:()=>true,cardActsAsPassive:()=>false,pushEndTurnEffectWarning:list=>list.push(card)};
 vm.createContext(ctx);vm.runInContext(extract(core,'collectPendingCardWindowEffectsForEndTurn'),ctx);
 assert.equal(ctx.collectPendingCardWindowEffectsForEndTurn(0).length,0,'no reminder after activation');
 ctx.G.turn=3;assert.equal(ctx.collectPendingCardWindowEffectsForEndTurn(0).length,1,'remaining use reminded next turn');
 vm.runInContext(extract(ui,'buildCardDetailTrackerHTML'),ctx);
 let html=ctx.buildCardDetailTrackerHTML(card,0,false);assert(html.includes('1 Use Remaining'));assert(html.includes('+8 Fate gained'));
 card.counters={effectUses:2,anneFateGained:16};html=ctx.buildCardDetailTrackerHTML(card,0,false);assert(html.includes('0 Uses Remaining'));assert(html.includes('+16 Fate gained'));
 assert.equal(ctx.buildCardDetailTrackerHTML(card,1,true),'','hidden card tracker stays private');
 assert(!ui.includes('Choose your declared action · 2 uses per game'));
}

{
 const ui=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8');
 const start=ui.indexOf('function getRuntimeCardImageSrc('),end=ui.indexOf('\nfunction ',start+10);
 const context={};vm.createContext(context);vm.runInContext(ui.slice(start,end),context);
 for(const role of ['board','hand','detail','full'])assert.equal(context.getRuntimeCardImageSrc('107.png?v=20261010',role),'107.png?v=20261011');
}
