import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {canUseAsConsolidationTribute} from '../../shared/engine/modifiers.mjs';
import {projectStateForPlayer} from '../../shared/engine/projections.mjs';
import {command,takeFromHandToBoard} from './test-helpers.mjs';
const {cards}=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog();
const row=p=>p?0:2;
function fresh(seat=0,deck=['112','113','114','114','115','32','32','76']){
  return createInitialState({matchId:'caribbea',seed:'caribbea',handSize:99,activePlayer:seat,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:deck}))});
}
let sequence=0;
function run(s,seat,type,payload){
  const result=reduceCommand(s,command(s,'p'+seat,++sequence,type,payload),{playerId:'p'+seat});
  assert.equal(result.ok,true,JSON.stringify(result.error));
  return result.state;
}
function set(s,seat,id,col=0){
  return run(s,seat,'SET_CARD',{cardIid:s.players[seat].hand.find(c=>c.id===id).iid,destination:{z:0,r:row(seat),c:col}});
}
for(const id of ['112','113','114','115']){
  const def=cards.find(c=>c.id===id);assert.equal(def.type,'Supporter');assert.equal(def.aff,'eventide');assert.equal(def.img,id+'.png');
}
for(const seat of [0,1]){
  // Arm only future flips; repeated copies stack and immunity does not reject the flip.
  let s=fresh(seat);
  const prior=takeFromHandToBoard(s,seat,'32',{z:1,r:row(seat),c:0});
  prior.counters.flippedFaceUpTurn=s.turn;
  const future=takeFromHandToBoard(s,seat,'114',{z:1,r:row(seat),c:1});future.faceDown=true;
  const immune=takeFromHandToBoard(s,seat,'76',{z:1,r:row(seat),c:2});immune.faceDown=true;
  s=set(s,seat,'112');
  assert.equal(s.board[1][row(seat)][0].currentFate,prior.currentFate,'earlier flip unchanged');
  assert(s.statuses.some(x=>x.type==='REVOLUTIONARY_FLIP_GAIN'));
  s=run(s,seat,'FLIP_CARD',{cardIid:future.iid});assert.equal(s.board[1][row(seat)][1].currentFate,5);
  s=run(s,seat,'FLIP_CARD',{cardIid:immune.iid});assert(s.board[1][row(seat)][2]);
  s=run(s,seat,'END_TURN',{});assert(!s.statuses.some(x=>x.type==='REVOLUTIONARY_FLIP_GAIN'));
  s=fresh(seat);
  const flipped=takeFromHandToBoard(s,seat,'114',{z:1,r:row(seat),c:0});flipped.faceDown=true;
  s=set(s,seat,'112');
  s.statuses.push({...s.statuses.find(x=>x.type==='REVOLUTIONARY_FLIP_GAIN'),statusId:'second-revolution',playerIndex:1-seat});
  s.board[0][row(seat)][0]=null;
  s=run(s,seat,'FLIP_CARD',{cardIid:flipped.iid});assert.equal(s.board[1][row(seat)][0].currentFate,9,'both players’ resolved effects stack even after the source leaves');

  // Opponent order only, private choices, short/empty decks, and unchanged tail.
  for(const count of [0,1,3,7]){
    s=fresh(seat);s.players[1-seat].deck=s.players[1-seat].hand.splice(0,count);
    const own=structuredClone(s.players[seat].deck),before=s.players[1-seat].deck.map(c=>c.iid);
    s=set(s,seat,'113');
    if(count){
      assert.equal(s.pendingPrompt.opponentDeck,true);
      assert.deepEqual(s.pendingPrompt.eligibleIids,before.slice(0,5));
      assert.equal(projectStateForPlayer(s,1-seat).pendingPrompt?.eligibleCards,undefined);
      s=run(s,seat,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:before.slice(0,5).reverse()});
    }
    assert.deepEqual(s.players[1-seat].deck.map(c=>c.iid),before.slice(0,5).reverse().concat(before.slice(5)));
    assert.deepEqual(s.players[seat].deck,own);
  }

  // Blockade is a live, zone-local aura, stacked against the supporter's entry turn.
  s=fresh(seat);
  const target=takeFromHandToBoard(s,seat,'32',{z:0,r:row(seat),c:0});target.counters.fieldEnteredTurn=1;
  const a=takeFromHandToBoard(s,1-seat,'114',{z:0,r:row(1-seat),c:0});
  const b=takeFromHandToBoard(s,1-seat,'114',{z:0,r:row(1-seat),c:1});
  const entry={card:target,zone:'board',z:0,r:row(seat),c:0};
  assert.equal(canUseAsConsolidationTribute(s,entry,seat).ok,false);
  s.turn=3;assert.equal(canUseAsConsolidationTribute(s,entry,seat).ok,false,'two Havanos still block on the first owner turn');
  b.statuses.push('EFFECTS_SUPPRESSED');assert.equal(canUseAsConsolidationTribute(s,entry,seat).ok,true);
  b.statuses=[];s.turn=5;assert.equal(canUseAsConsolidationTribute(s,entry,seat).ok,true,'two Havanos release on the second owner turn');
  s.turn=1;a.faceDown=true;b.faceDown=true;assert.equal(canUseAsConsolidationTribute(s,entry,seat).ok,true);
  a.faceDown=false;b.faceDown=false;s.board[0][row(1-seat)][0]=null;s.board[0][row(1-seat)][1]=null;
  assert.equal(canUseAsConsolidationTribute(s,entry,seat).ok,true);

  // Exactly 30 in the ORIGINAL deck; empty current deck must not change eligibility.
  for(const count of [29,30]){
    s=fresh(seat,['115',...Array(count-1).fill('114')]);
    s.players[seat].hand=[...s.players[seat].hand,...s.players[seat].deck].filter(c=>c.id==='115');s.players[seat].deck=[];
    s=set(s,seat,'115');
    assert.equal(s.pendingPrompt?.title==='Call to Arms',count===30);
    if(count===30){
      s=run(s,seat,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,choice:s.pendingPrompt.options[0].value});
      const selected=s.pendingPrompt.eligibleIids[0];
      s=run(s,seat,'ANSWER_PROMPT',{promptId:s.pendingPrompt.promptId,selectedIids:[selected]});
      assert(s.players[seat].hand.some(c=>c.id===selected));
    }
  }
}
console.log('Caribbea Supporters: catalog, future flips, immunity, expiry, opponent deck order/privacy, stacked live blockade, and original-deck Call to Arms passed for both seats');
