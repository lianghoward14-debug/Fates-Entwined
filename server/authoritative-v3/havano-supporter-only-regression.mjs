import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;

function fixture(sourceId){
  const state=createInitialState({matchId:`havano-supporter-${sourceId}`,seed:'havano-supporter',handSize:99,
    activePlayer:0,cardDefinitions:definitions,
    players:[{id:'p0',deckIds:[sourceId,'32','32','32']},{id:'p1',deckIds:['79','32','32','32']}],
    gameSettings:{healthPressureSeals:true}});
  const source=state.players[0].hand.find(card=>card.id===sourceId);
  const result=reduceCommand(state,command(state,'p0',1,'SET_CARD',
    {cardIid:source.iid,destination:{z:0,r:2,c:0}}),{playerIndex:0});
  assert.equal(result.ok,true,`${sourceId}: ${JSON.stringify(result.rejection)}`);
  return {result,source};
}

for(const id of ['47','53','114']){
  const {result,source}=fixture(id);
  assert.equal(result.state.pendingPrompt?.type,'REACTION',`${id} must offer Havano`);
  const option=result.state.pendingPrompt.options.find(value=>value.kind==='HAVANO');
  assert(option,`${id} must expose Havano`);
  const reacted=reduceCommand(result.state,command(result.state,'p1',2,'ANSWER_PROMPT',
    {promptId:result.state.pendingPrompt.promptId,choice:option.modes[0],reactionIid:option.reactionIid}),{playerIndex:1});
  assert.equal(reacted.ok,true,`${id}: ${JSON.stringify(reacted.rejection)}`);
  assert(reacted.state.board[0][2][0].statuses.includes('EFFECTS_SUPPRESSED'),`${id} must remain suppressed`);
  assert.equal(String(reacted.state.board[0][2][0].iid),String(source.iid));
}

{
  const state=createInitialState({matchId:'havano-fusilier-copy',seed:'havano-fusilier',handSize:99,activePlayer:0,
    cardDefinitions:definitions,players:[{id:'p0',deckIds:['37','53','32']},{id:'p1',deckIds:['79','32']}],
    gameSettings:{healthPressureSeals:true}});
  const source=state.players[0].hand.find(card=>card.id==='53');
  state.players[0].hand.splice(state.players[0].hand.indexOf(source),1);
  state.board[0][2][1]=source;
  const fusilier=state.players[0].hand.find(card=>card.id==='37');
  const placed=reduceCommand(state,command(state,'p0',1,'SET_CARD',
    {cardIid:fusilier.iid,destination:{z:0,r:2,c:0}}),{playerIndex:0});
  assert.equal(placed.ok,true,JSON.stringify(placed.rejection));
  assert.equal(placed.state.pendingPrompt?.type,'BOARD_TARGET');
  const copied=reduceCommand(placed.state,command(placed.state,'p0',2,'ANSWER_PROMPT',
    {promptId:placed.state.pendingPrompt.promptId,selectedIids:[source.iid]}),{playerIndex:0});
  assert.equal(copied.ok,true,JSON.stringify(copied.rejection));
  assert(copied.state.pendingPrompt?.options?.some(option=>option.kind==='HAVANO'),
    'copying an eligible Supporter effect must offer Havano');
}

{
  const state=createInitialState({matchId:'havano-british-excluded',seed:'havano-british',handSize:99,
    activePlayer:0,cardDefinitions:definitions,
    players:[{id:'p0',deckIds:['05','32']},{id:'p1',deckIds:['79','32']}],gameSettings:{healthPressureSeals:true}});
  const target=state.players[1].hand.find(card=>card.id==='32');
  state.players[1].hand.splice(state.players[1].hand.indexOf(target),1);
  state.board[0][0][0]=target;
  const source=state.players[0].hand.find(card=>card.id==='05');
  const placed=reduceCommand(state,command(state,'p0',1,'SET_CARD',
    {cardIid:source.iid,destination:{z:0,r:2,c:0}}),{playerIndex:0});
  assert.equal(placed.ok,true,JSON.stringify(placed.rejection));
  assert(!placed.state.pendingPrompt?.options?.some(option=>option.kind==='HAVANO'),
    'British Regiment must not offer Havano');
}

{
  const state=createInitialState({matchId:'havano-story-excluded',seed:'havano-story',handSize:99,
    activePlayer:0,cardDefinitions:definitions,
    players:[{id:'p0',deckIds:['120','32']},{id:'p1',deckIds:['79','36']}],gameSettings:{healthPressureSeals:true}});
  const story=state.players[0].hand.find(card=>card.id==='120');
  state.players[0].hand.splice(state.players[0].hand.indexOf(story),1);
  state.board[0][2][0]=story;
  const target=state.players[1].hand.find(card=>card.id==='36');
  state.players[1].hand.splice(state.players[1].hand.indexOf(target),1);
  state.board[0][0][0]=target;
  const started=reduceCommand(state,command(state,'p0',1,'ACTIVATE_EFFECT',{sourceIid:story.iid,userActivated:true}),{playerIndex:0});
  assert.equal(started.ok,true,JSON.stringify(started.rejection));
  assert.equal(started.state.pendingPrompt?.type,'BOARD_TARGET');
  const selected=reduceCommand(started.state,command(started.state,'p0',2,'ANSWER_PROMPT',
    {promptId:started.state.pendingPrompt.promptId,selectedIids:[target.iid]}),{playerIndex:0});
  assert.equal(selected.ok,true,JSON.stringify(selected.rejection));
  assert(!selected.state.pendingPrompt?.options?.some(option=>option.kind==='HAVANO'),
    'Story Never Ends must not offer Havano when it selects an opposing card');
}

console.log('PASS Havano suppresses opponent-facing Supporters, including passive entries');
