import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,applyOperation,projectEvents} from '../../shared/engine/index.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
for(const player of [0,1]){
 const state=createInitialState({matchId:'fish-overlay',seed:'fish',handSize:0,cardDefinitions:cards,players:[{id:'a',deckIds:['110']},{id:'b',deckIds:['110']}]});
 const ctx={state,events:[],ruleEvents:[]};
 applyOperation(ctx,{type:'CREATE_TOKENS',tokenKind:'FISH',count:1,playerIndex:player,sourceIid:'sebastian'});
 for(const viewer of [0,1]){
   const events=projectEvents(ctx.events,viewer);
   assert.equal(events.filter(e=>e.type==='FISH_COUNTER_CREATED').length,1);
   if(viewer!==player)assert(!events.some(e=>e.createdIids),'Opponent overlay does not expose private hand IDs');
 }
}
function extract(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0);let body=source.indexOf('{',start),depth=1,end=body+1;for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end);}
const source={iid:'sebastian',id:'110',owner:0};const flashes=[];
const runtime={window:{flashCardEffect:(...args)=>flashes.push(args)},phase7FindBoardCard:iid=>iid===source.iid?{card:source}:null};
vm.createContext(runtime);
vm.runInContext(extract(readFileSync('src/scripts/18-online-rooms.js','utf8'),'phase7PresentCardSetAuraOverlays'),runtime);
for(let n=0;n<2;n++)runtime.phase7PresentCardSetAuraOverlays([{type:'FISH_COUNTER_CREATED',sourceIid:source.iid}],`batch-${n}`);
assert.equal(flashes.length,2);assert(flashes.every(f=>f[0]===source&&f[1]==='sebastian_fish'));
assert.notEqual(flashes[0][2].soundKey,flashes[1][2].soundKey);
const core=readFileSync('src/scripts/05-gameplay-core.js','utf8');
Object.assign(runtime,{G:{players:[{hand:[]},{hand:[]}]},forEachBoardCard:fn=>fn(source),cardActsAsPassive:()=>true,isCardEffectSuppressed:()=>false,createCardInstance:c=>({...c,iid:'fish'}),flashCardEffect:(...a)=>flashes.push(a),ensureBalladState:()=>[[],[]]});
vm.runInContext(extract(core,'noteBalladConsolidation'),runtime);
runtime.noteBalladConsolidation(0,{id:'67',iid:'other'});assert.equal(runtime.G.players[0].hand.length,1);assert.equal(flashes.at(-1)[1],'sebastian_fish');
const renderer=readFileSync('src/scripts/render-v2/04-match-renderer-adapter.js','utf8');
const drawCalls=[];runtime.getEffectFlashPalette=()=>({color:'white',glow:'blue'});
vm.runInContext(extract(renderer,'drawEffectFlashIcon'),runtime);
runtime.drawEffectFlashIcon(new Proxy({},{get:(_,key)=>(...args)=>drawCalls.push([key,...args]),set:()=>true}),32,32,64,'sebastian_fish');
assert(drawCalls.some(c=>c[0]==='bezierCurveTo'),'Fish body draws through the existing canvas overlay renderer');
console.log('Sebastian overlay: public event privacy, repeated online triggers, local trigger and fish icon rendering passed.');
