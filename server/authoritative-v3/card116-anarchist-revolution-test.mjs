import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createInitialState,reduceCommand} from '../../shared/engine/index.mjs';
const require=createRequire(import.meta.url),defs=require('../fate-card-catalog.js').getCardCatalog().cards;
let seq=0;
let s=createInitialState({matchId:'anarchist116',seed:'116',handSize:99,cardDefinitions:defs,players:[{id:'p0',deckIds:['116','32','29']},{id:'p1',deckIds:['32']}]});
function run(type,payload){const r=reduceCommand(s,{commandId:'test'+ ++seq,matchId:s.matchId,expectedRevision:s.revision,type,payload},{playerId:'p0'});assert(r.ok,JSON.stringify(r.rejection));s=r.state;return r;}
const rev=s.players[0].hand.find(c=>c.id==='116');
run('SET_CARD',{cardIid:rev.iid,destination:{z:0,r:2,c:0}});
const permission=s.statuses.find(x=>x.type==='FACE_DOWN_CONSOLIDATION_PERMISSION');
assert(permission);assert.equal(permission.zone,undefined);assert.equal(permission.playerIndex,0);
const target=s.players[0].hand.find(c=>c.id==='29');target.cost=0;
run('CONSOLIDATE_CARD',{cardIid:target.iid,tributeIids:[],destination:{z:1,r:2,c:1},faceDown:true});
assert.equal(s.board[1][2][1].faceDown,true);assert(!s.statuses.some(x=>x.type==='FACE_DOWN_CONSOLIDATION_PERMISSION'));
run('FLIP_CARD',{cardIid:target.iid});assert.equal(s.board[1][2][1].faceDown,false);
const source=fs.readFileSync(new URL('../../src/scripts/05-gameplay-core.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function getUnusedChaparralAmbusherInZone('),source.indexOf('function getSuperiorMarksMultiplier('));
const card={id:'116',owner:0};const sandbox={G:{board:[[[card]]]},cardContributesAura:c=>!c.faceDown,isCardEffectSuppressed:()=>false};vm.createContext(sandbox);vm.runInContext(fn,sandbox);assert.equal(sandbox.getUnusedChaparralAmbusherInZone(0,0).card,card);card._chaparralAmbushUsed=true;assert.equal(sandbox.getUnusedChaparralAmbusherInZone(0,0),null);card._chaparralAmbushUsed=false;card.faceDown=true;assert.equal(sandbox.getUnusedChaparralAmbusherInZone(0,0),null);
assert(fs.existsSync(new URL('../../116.png',import.meta.url)));
console.log('Card 116: authority set/consolidate/flip, one-use permission and browser source checks passed.');

