import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
import {projectStateForPlayer} from '../../shared/engine/projections.mjs';
const cards=createRequire(import.meta.url)('../fate-card-catalog.js').getCardCatalog().cards;
const source=fs.readFileSync('server/authoritative-v3/server.mjs','utf8');
const relay=source.slice(source.indexOf('const chatterSessions ='),source.indexOf('async function handleSocketMessage'));
for(const owner of [0,1]){
 let state=createInitialState({matchId:'chatter-'+owner,seed:'chatter',handSize:99,activePlayer:owner,cardDefinitions:cards,players:[0,1].map(p=>({id:'p'+p,deckIds:['117','02']}))});
 const veil=state.players[owner].hand.find(c=>c.id==='117');
 const result=reduceCommand(state,{commandId:'veil',matchId:state.matchId,expectedRevision:0,type:'SET_CARD',payload:{cardIid:veil.iid,destination:{z:0,r:owner?0:2,c:0}}},{playerId:'p'+owner});assert(result.ok);state=result.state;
 const card=state.players[owner].hand.find(c=>c.id==='02');card.faceDown=false;
 state.players[owner].hand=state.players[owner].hand.filter(c=>c!==card);state.board[0][owner?0:2][1]=card;
 assert(!projectStateForPlayer(state,1-owner).board.flat(3).some(c=>c?.iid===card.iid));
 const actor={state},sent=[];const peers=[0,1].map(playerIndex=>({authorityV3Session:{playerIndex}}));
 const context=vm.createContext({manager:{actor:()=>actor},projectStateForPlayer,matchSockets:new Map([[state.matchId,new Map(peers.map((p,i)=>['p'+i,new Set([p])]))]]),send:(peer,event)=>sent.push(peer.authorityV3Session.playerIndex)});
 vm.runInContext(relay,context);context.session={matchId:state.matchId,playerIndex:owner};
 vm.runInContext("relayChatter(session,{characterKey:'anicka',index:0})",context);
 assert.deepEqual(sent,[owner],'new concealed character must only speak to its owner');
 delete state.saboteurVeil;sent.length=0;
 // Fresh actor resets only the test cadence, leaving the production relay unchanged.
 const ctx2=vm.createContext({...context,manager:{actor:()=>({state})}});vm.runInContext(relay,ctx2);
 vm.runInContext("relayChatter(session,{characterKey:'anicka',index:1})",ctx2);assert.deepEqual(sent,[0,1]);
}
console.log('PASS: Covert Operations chatter stays private for either seat and reaches both when visible.');
