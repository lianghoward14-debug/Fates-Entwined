import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {projectStateForPlayer,projectStateForSpectator,projectEvents} from '../../shared/engine/projections.mjs';
const require=createRequire(import.meta.url),cards=require('../fate-card-catalog.js').getCardCatalog().cards;
let s=createInitialState({matchId:'veil117',seed:'veil',handSize:99,cardDefinitions:cards,players:[{id:'p0',deckIds:['117','32']},{id:'p1',deckIds:['32']}]});let serial=0;
function command(type,payload={}){let r=reduceCommand(s,{commandId:'v'+ ++serial,matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p'+s.activePlayer,allowDebugCommands:true});assert(r.ok,JSON.stringify(r.rejection));s=r.state;return r;}
const before=projectStateForPlayer(s,1),spectator=projectStateForSpectator(s);let card=s.players[0].hand.find(c=>c.id==='117');let r=command('SET_CARD',{cardIid:card.iid,destination:{z:0,r:2,c:0}});
assert.deepEqual(projectStateForPlayer(s,1).board,before.board);assert.deepEqual(projectStateForSpectator(s).board,spectator.board);assert.equal(projectStateForPlayer(s,0).board[0][2][0].id,'117');assert.deepEqual(projectEvents(r.events,1),[]);
r=command('MODIFY_FATE',{targetIid:card.iid,amount:12});assert.deepEqual(projectStateForPlayer(s,1).zoneScores,before.zoneScores);assert.deepEqual(projectEvents(r.events,1),[]);
assert(!JSON.stringify(projectStateForPlayer(s,0)).includes('"opponent":'));assert(!JSON.stringify(projectStateForPlayer(s,1)).includes('saboteurVeil'));
command('END_TURN');assert(s.saboteurVeil);
const own=s.players[1].hand.find(c=>c.id==='32');r=command('SET_CARD',{cardIid:own.iid,destination:{z:1,r:0,c:0}});
assert.equal(projectStateForPlayer(s,1).board[1][0][0].iid,own.iid);assert.equal(projectStateForPlayer(s,1).players[1].hand.length,s.players[1].hand.length);assert(projectEvents(r.events,1).length>0);assert.equal(projectStateForPlayer(s,1).board[0][2][0],null);
command('END_TURN');assert(s.saboteurVeil);command('END_TURN');assert.equal(projectStateForPlayer(s,1).board[0][2][0].id,'117');assert(!s.saboteurVeil);assert(!s.statuses.some(x=>x.type==='SABOTEUR_FIELD_VEIL'));
console.log('117: owner visibility, frozen opponent/spectator views, concealed events and turn-end reveal passed.');
