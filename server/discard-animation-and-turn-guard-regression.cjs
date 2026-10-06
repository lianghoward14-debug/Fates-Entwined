'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync('src/scripts/' + file, 'utf8');
const calls = [];
const rect = {x:100,y:80,w:70,h:98};
const canvas = {clientWidth:1000,clientHeight:700,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:700})};
const map = {cards:[],cells:[{z:0,r:0,c:0,rect}],piles:[],handCards:[],opponentHandCards:[]};
const window = {innerWidth:1000,innerHeight:700,FateMatchRendererAdapter:{getHitMap:()=>map},FateVfxDirector:{play:(type,payload)=>(calls.push({type,payload}),true)}};
const document = {documentElement:{},body:{},getElementById:()=>canvas,querySelector:()=>null};
const ctx = vm.createContext({window,document,getPerspectivePlayerIndex:()=>0,G:{currentPlayer:1}});
vm.runInContext(read('render-v2/10-card-motion-fx.js'),ctx);
const fx = window.FateV2CardMotionFx;
assert(fx.flyBoardCard({iid:'removed',owner:1},0,0,0,'discard'));
assert.deepEqual({...calls.at(-1).payload.fromRect},rect,'removed board cards use the cell position');
for(const owner of [0,1]) for(const zone of ['hand','deck']){
  assert.equal(fx.discardCard({iid:zone+owner,owner},owner,{zone}),false,
    'hidden or missing source must never create a miniature discard');
}
assert.equal(fx.sendHandCardToDiscard({iid:'hidden',faceDown:true},1,0),false);
map.handCards.push({iid:'visible',rect:{x:100,y:680,w:130,h:180}});
map.piles.push({pile:'discard',playerIndex:0,rect});
assert(fx.sendHandCardToDiscard({iid:'visible',owner:0},0,0));
assert.equal(calls.at(-1).payload.fromRect.h,180,'visible hand retains its full size');
const helpers = read('00-structural-helpers.js');
const start = helpers.indexOf('function fatePushDiscard(');
const end = helpers.indexOf('window.isEnhancedVisualFxEnabled',start);
let count = 0;
const G = {players:[{hand:[],discard:[]},{hand:[],discard:[]}]};
const pushCtx = vm.createContext({G,window:{FateV2CardMotionFx:{discardCard:()=>count++}},playDiscardSfx(){}});
vm.runInContext(helpers.slice(start,end),pushCtx);
pushCtx.fatePushDiscard(1,[{id:'1',iid:'a'},{id:'2',iid:'b'}]);
assert.equal(count,2,'each card in a batch animates');
pushCtx.fatePushDiscard(0,{id:'3'},{animate:false});
assert.equal(count,2,'board/consolidation motion is not duplicated');
pushCtx.window.FateV2CardMotionFx=fx;
pushCtx.fatePushDiscard(0,{id:'32',iid:'already-removed',owner:0},{sourceLocation:{zone:'board',z:0,r:0,c:0}});
assert.deepEqual({...calls.at(-1).payload.fromRect},rect,'discard helper preserves explicit source after board removal');
const core = read('05-gameplay-core.js');
const turnStart = core.indexOf('function endTurn(opts)');
const turnEnd = core.indexOf('function showPassTurn(',turnStart);
for(const running of [false,true]){
 const state={aiEnabled:true,currentPlayer:1,aiPlayer:1,_aiRunning:running,turn:2};
 const turnCtx=vm.createContext({G:state,window:{}});
 vm.runInContext(core.slice(turnStart,turnEnd),turnCtx);
 for(let i=0;i<20;i++) assert.equal(turnCtx.endTurn(),false);
 assert.equal(state.turn,2,'repeated clicks cannot advance an AI turn');
}
const rendering=read('06-rendering-and-helpers.js');
const pella=rendering.slice(rendering.indexOf('function resolveBattleOfPellaDiscard('),rendering.indexOf('function chooseBattleOfPellaAiTarget('));
assert(!pella.includes('_suppressDiscardVfx'),'Pella must use normal discard animation');
console.log('Discard animation and repeated End Turn regression passed');
