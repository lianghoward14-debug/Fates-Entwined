import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState, reduceCommand, projectStateForPlayer} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

// Jimmy's opponent-hand replacement must not invalidate Flower Picking.
for(const extra of [[],['32']]){
  const ids=['84','bh18','05',...extra];
  const state=createInitialState({matchId:'jimmy-kvetka',handSize:0,
    cardDefinitions:ids.map(id=>({id,type:id==='05'||id==='32'?'Supporter':'Initiator',fate:3,cost:0})),
    players:[0,1].map(p=>({id:`p${p}`,deckIds:ids}))});
  for(const player of state.players) assert.equal(player.flowerPickingEligible,extra.length===0);
  if(!extra.length){
    const card=state.players[0].hand.find(card=>card.id==='84');
    const result=reduceCommand(state,command(state,'p0',1,'CONSOLIDATE_CARD',{
      cardIid:card.iid,tributeIids:[],destination:{z:0,r:2,c:0}
    }),{playerId:'p0'});
    assert.equal(result.ok,true);
    assert.equal(result.state.pendingPrompt?.type,'CARD_SELECTION');
  }
  const setup=fs.readFileSync(new URL('../../src/scripts/04-game-setup.js',import.meta.url),'utf8');
  const assignment=setup.split('\n').find(line=>line.includes('G.players[player].flowerPickingEligible='));
  const legacy={G:{players:[{},{}],p1Deck:ids,p2Deck:ids},player:0};
  vm.runInNewContext(assignment,legacy);
  assert.equal(legacy.G.players[0].flowerPickingEligible,extra.length===0);
}

function fixture(owner, eligibility = true, empty = false, suppressed = false){
  const state = createInitialState({matchId:'kvetka-eligibility', handSize:0, activePlayer:owner,
    cardDefinitions:[{id:'84',name:'Kvetka Youth',type:'Initiator',fate:3,cost:0},
      {id:'05',name:'Search target',type:'Supporter',fate:1,cost:0}],
    players:[0,1].map(p=>({id:`p${p}`,deckIds:['84','05']}))});
  const player = state.players[owner];
  if(eligibility === null) delete player.flowerPickingEligible;
  else player.flowerPickingEligible = eligibility;
  if(empty) player.discard.push(...player.deck.splice(0));
  const source = player.hand.find(card=>card.id==='84');
  if(suppressed) source.statuses.push('EFFECTS_SUPPRESSED');
  return {state, source};
}

for(const owner of [0,1]){
  for(const [eligibility,empty,suppressed,reason] of [
    [true,false,false,null], [false,false,false,'ORIGINAL_DECK_CONTAINS_DRAW_EFFECT'],
    [null,false,false,'ORIGINAL_DECK_ELIGIBILITY_UNKNOWN'],
    [true,true,false,'NO_LEGAL_TARGETS'], [true,false,true,'EFFECT_SUPPRESSED']
  ]){
    const {state,source} = fixture(owner,eligibility,empty,suppressed);
    const before = projectStateForPlayer(state,owner).players[owner].hand.find(card=>card.iid===source.iid);
    assert.equal(before.flowerPickingStatus,reason || 'ELIGIBLE');
    const result = reduceCommand(state,command(state,`p${owner}`,1,'CONSOLIDATE_CARD',{
      cardIid:source.iid,tributeIids:[],destination:{z:0,r:owner===0?2:0,c:0}
    }),{playerId:`p${owner}`});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    if(reason){
      assert.equal(result.state.pendingPrompt,null);
      assert.ok(result.events.some(event=>event.type==='EFFECT_SKIPPED' && event.reason===reason),JSON.stringify(result.events));
    }else{
      assert.equal(projectStateForPlayer(result.state,owner).players[owner].flowerPickingEligible,true);
      const prompt = result.state.pendingPrompt;
      assert.equal(prompt.type,'CARD_SELECTION');
      assert.equal(projectStateForPlayer(result.state,owner).board[0][owner===0?2:0][0].flowerPickingStatus,'RESOLVING');
      const target = prompt.eligibleIids[0];
      const answer = reduceCommand(result.state,command(result.state,`p${owner}`,2,'ANSWER_PROMPT',{
        promptId:prompt.promptId,selectedIid:target
      }),{playerId:`p${owner}`});
      assert.equal(answer.ok,true);
      assert.ok(answer.state.players[owner].hand.some(card=>card.iid===target));
      assert.equal(projectStateForPlayer(answer.state,owner).board[0][owner===0?2:0][0].flowerPickingStatus,'RESOLVED');
    }
  }
}

const core = fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const helper = core.slice(core.indexOf('function isFlowerPickingEligible('),core.indexOf('//  TURN MANAGEMENT'));
const sandbox = {G:{players:[{}],p1Deck:['84','05']}};
vm.createContext(sandbox);
vm.runInContext(helper,sandbox);
assert.equal(sandbox.isFlowerPickingEligible(0),true,'local games retain original-list fallback');
sandbox.G.p1Deck=['84','bh18','05'];
assert.equal(sandbox.isFlowerPickingEligible(0),true,'Jimmy is exempt in the local fallback too');
for(const flag of ['_onlineRoomCode','_phase7CurrentMultiplayer']){
  sandbox.G[flag]=true;
  assert.equal(sandbox.isFlowerPickingEligible(0),false,'online games cannot use a stale local deck');
  sandbox.G.players[0].flowerPickingEligible=true;
  assert.equal(sandbox.isFlowerPickingEligible(0),true);
  sandbox.G.players[0].flowerPickingEligible=false;
  assert.equal(sandbox.isFlowerPickingEligible(0),false);
  delete sandbox.G.players[0].flowerPickingEligible;
  delete sandbox.G[flag];
}
const rendering = fs.readFileSync(new URL('../../src/scripts/06-rendering-and-helpers.js',import.meta.url),'utf8');
const trackerStart = rendering.indexOf('function buildCardDetailTrackerHTML(');
const trackerEnd = rendering.indexOf('\nfunction ',trackerStart+1);
const ui = {G:{_onlineRoomCode:'test',players:[{flowerPickingEligible:true}]},
  document:{getElementById:()=>({classList:{contains:()=>true}})},escapeHtml:String,
  isFlowerPickingEligible:()=>true};
vm.createContext(ui);
vm.runInContext(rendering.slice(trackerStart,trackerEnd),ui);
for(const [status,label] of [['ELIGIBLE','Eligible'],['EFFECT_SUPPRESSED','Suppressed'],['NO_LEGAL_TARGETS','Deck empty'],
  ['RESOLVING','Resolving'],['RESOLVED','Activated'],['ORIGINAL_DECK_CONTAINS_DRAW_EFFECT','Not eligible'],[undefined,'Eligibility unavailable']]){
  const html=ui.buildCardDetailTrackerHTML({id:'84',owner:0,flowerPickingStatus:status},0,false);
  assert.ok(html.includes('>'+label+'<'),html);
  if(status!=='ELIGIBLE') assert.ok(!html.includes('>Eligible<'),'a qualifying deck alone must never override server activation status');
}
console.log('Kvetka online eligibility, activation, skip reasons, and local fallback pass');
