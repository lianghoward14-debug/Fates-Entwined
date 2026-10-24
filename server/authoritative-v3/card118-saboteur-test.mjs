import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {projectStateForPlayer,projectStateForSpectator,projectEvents} from '../../shared/engine/projections.mjs';
const require=createRequire(import.meta.url),cards=require('../fate-card-catalog.js').getCardCatalog().cards;
let s=createInitialState({matchId:'veil117',seed:'veil',handSize:99,cardDefinitions:cards,players:[{id:'p0',deckIds:['117','32']},{id:'p1',deckIds:['32']}]});let serial=0;
function command(type,payload={}){let r=reduceCommand(s,{commandId:'v'+ ++serial,matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p'+s.activePlayer,allowDebugCommands:true});assert(r.ok,JSON.stringify(r.rejection));s=r.state;return r;}
const before=projectStateForPlayer(s,1),spectator=projectStateForSpectator(s);let card=s.players[0].hand.find(c=>c.id==='117');let r=command('SET_CARD',{cardIid:card.iid,destination:{z:0,r:2,c:0}});
for(const view of [projectStateForPlayer(s,0),projectStateForPlayer(s,1),projectStateForSpectator(s)])assert.equal(view.board[0][2][0].id,'117');assert(projectEvents(r.events,1).length>0);const frozenScores=projectStateForPlayer(s,1).zoneScores;
r=command('MODIFY_FATE',{targetIid:card.iid,amount:12});
for(const view of [projectStateForPlayer(s,1),projectStateForSpectator(s)]){
 assert.equal(view.zoneScores[0][0],frozenScores[0][0]+12);
 assert.deepEqual(view.zoneScores,projectStateForPlayer(s,0).zoneScores);
 assert.equal(view.board[0][2][0].currentFate,1,'individual card change remains concealed');
}
assert.deepEqual(projectEvents(r.events,1),[]);
assert(!JSON.stringify(projectStateForPlayer(s,0)).includes('"opponent":'));assert(!JSON.stringify(projectStateForPlayer(s,1)).includes('saboteurVeil'));
command('END_TURN');assert(s.saboteurVeil);
const own=s.players[1].hand.find(c=>c.id==='32');r=command('SET_CARD',{cardIid:own.iid,destination:{z:1,r:0,c:0}});
assert.equal(projectStateForPlayer(s,1).board[1][0][0].iid,own.iid);assert.equal(projectStateForPlayer(s,1).players[1].hand.length,s.players[1].hand.length);assert(projectEvents(r.events,1).length>0);assert.equal(projectStateForPlayer(s,1).board[0][2][0].id,'117');
command('END_TURN');assert(s.saboteurVeil);command('END_TURN');assert.equal(projectStateForPlayer(s,1).board[0][2][0].id,'117');assert(!s.saboteurVeil);assert(!s.statuses.some(x=>x.type==='SABOTEUR_FIELD_VEIL'));
console.log('117: owner visibility, frozen opponent/spectator views, concealed events and turn-end reveal passed.');
for(const seat of [0,1]){
 let state=createInitialState({matchId:'visible117-'+seat,seed:'both',handSize:99,activePlayer:seat,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:['117','32']}))});
 const source=state.players[seat].hand.find(c=>c.id==='117'),row=seat?0:2;
 const result=reduceCommand(state,{commandId:'place',matchId:state.matchId,expectedRevision:state.revision,type:'SET_CARD',payload:{cardIid:source.iid,destination:{z:0,r:row,c:0}}},{playerId:'p'+seat});
 assert(result.ok);state=result.state;
 for(const viewer of [0,1])assert.equal(projectStateForPlayer(state,viewer).board[0][row][0].iid,source.iid);
 assert.equal(projectStateForSpectator(state).board[0][row][0].iid,source.iid);
 const next=state.players[seat].hand.find(c=>c.id==='32');
 const hidden=reduceCommand(state,{commandId:'hidden',matchId:state.matchId,expectedRevision:state.revision,type:'SET_CARD',payload:{cardIid:next.iid,destination:{z:1,r:row,c:0}}},{playerId:'p'+seat});
 assert(hidden.ok,JSON.stringify(hidden.rejection));
 assert.equal(projectStateForPlayer(hidden.state,1-seat).board[1][row][0],null);
 assert.equal(projectStateForPlayer(hidden.state,seat).board[1][row][0].iid,next.iid);
 for(const view of [projectStateForPlayer(hidden.state,1-seat),projectStateForSpectator(hidden.state)]){
  assert.deepEqual(view.zoneScores,projectStateForPlayer(hidden.state,seat).zoneScores,'hidden placement still changes public totals');
  assert.equal(view.zoneScores[1][seat],1);
  assert.equal(view.board[1][row][0],null,'no hidden card exposed with its score');
 }
 assert.deepEqual(projectEvents(hidden.events,1-seat),[],'action events remain concealed');
}
console.log('117: initial placement visible from either seat; subsequent placements remain concealed.');
