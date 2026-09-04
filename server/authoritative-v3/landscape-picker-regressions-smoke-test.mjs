import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInitialState, reduceCommand} from '../../shared/engine/index.mjs';
import {command} from './test-helpers.mjs';

const definitions = [
  {id:'05',name:'17th British Regiment of Africa',type:'Supporter',aff:'third_great_war',fate:1,cost:0,rarity:'circle'},
  {id:'32',name:'Temecula Resident',type:'Supporter',aff:'reality',fate:1,cost:0,rarity:'circle'},
  {id:'76',name:'ALPINE Infantry',type:'Supporter',aff:'expanded_worlds',fate:5,cost:2,rarity:'triangle'},
  {id:'27',name:'Kazumi',type:'Initiator',aff:'eventide',fate:1,cost:1,rarity:'star'}
];

// Closing an effect picker must submit an authoritative cancel and consume the
// pending frame instead of allowing the same modal to reopen forever.
let state = createInitialState({
  matchId:'PICKER-CANCEL',seed:'picker-cancel',handSize:99,activePlayer:0,
  cardDefinitions:definitions,
  players:[{id:'p0',deckIds:['05','32']},{id:'p1',deckIds:['32','32']}]
});
const target = state.players[0].hand.find(card=>card.id === '32');
state.players[0].hand = state.players[0].hand.filter(card=>card.iid !== target.iid);
target.controller = 0;
state.board[0][2][0] = target;
const regiment = state.players[0].hand.find(card=>card.id === '05');
let result = reduceCommand(state, command(state,'p0',1,'SET_CARD',{
  cardIid:regiment.iid,destination:{z:0,r:2,c:1}
}), {playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.pendingPrompt?.cancellable,true,'Regiment target picker must expose authoritative cancel');
state = result.state;
result = reduceCommand(state, command(state,'p0',2,'ANSWER_PROMPT',{
  promptId:state.pendingPrompt.promptId,cancel:true
}), {playerId:'p0'});
assert.equal(result.ok,true);
assert.equal(result.state.pendingPrompt,null,'cancel must clear the pending picker');
assert.equal(result.state.effectStack.length,0,'cancel must finish the unresolved effect frame');

// Moffitt's selected IDs cross the authority boundary and create fresh cards.
state = createInitialState({
  matchId:'MOFFITT-CATALOG',seed:'moffitt-catalog',handSize:0,activePlayer:0,
  landscapeId:'igb21',cardDefinitions:definitions,
  players:[{id:'p0',deckIds:[]},{id:'p1',deckIds:[]}]
});
result = reduceCommand(state, command(state,'p0',1,'ACTIVATE_LANDSCAPE',{cardIds:['05','32']}), {playerId:'p0'});
assert.equal(result.ok,true);
assert.deepEqual(result.state.players[0].hand.map(card=>card.id),['05','32']);
assert.equal(result.state.landscapeState.oncePerGameUses[0],1);

// Full effect immunity also protects against the low-Morale Supporter debuff.
state = createInitialState({
  matchId:'IMMUNE-MORALE',seed:'immune-morale',handSize:99,activePlayer:0,
  cardDefinitions:definitions,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:false,zoneControlRework:true,expandedContestedRow:true},
  players:[{id:'p0',deckIds:['76']},{id:'p1',deckIds:['32']}]
});
const alpine = state.players[0].hand.find(card=>card.id === '76');
state.players[0].hand = state.players[0].hand.filter(card=>card.iid !== alpine.iid);
alpine.controller = 0;
state.board[0][2][0] = alpine;
state.moralePressure.morale[0] = 40;
for(const [sequence,playerId] of [[1,'p0'],[2,'p1'],[3,'p0']]){
  result = reduceCommand(state,command(state,playerId,sequence,'END_TURN'),{playerId});
  assert.equal(result.ok,true);
  state = result.state;
}
assert.equal(state.board[0][2][0]?.id,'76','effect-immune Supporter must survive low-Morale expiry');
assert.equal(state.board[0][2][0]?.counters?.moraleSupporterExpiryTurns,undefined);

const online = fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
const gameplay = fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
assert.match(online,/phase7FlushPendingWhiteboardCatalog[\s\S]{0,900}phase7SubmitCommand\(\{type:'ACTIVATE_LANDSCAPE', payload:\{cardIds:ids\}\}\)/);
assert.doesNotMatch(online,/fatePhase7SubmitWhiteboardCatalog[\s\S]{0,450}state\?\.landscapeId/);
assert.match(online,/fatePhase7SubmitWhiteboardCatalog[\s\S]{0,1800}phase7PendingWhiteboardCatalogIds = ids[\s\S]{0,120}phase7FlushPendingWhiteboardCatalog\(\)/,'catalog submission must queue across a transient authoritative UI remount');
assert.match(online,/phase7CurrentUiSession\.mounted = true;[\s\S]{0,100}phase7FlushPendingWhiteboardCatalog\(\)/,'mount must flush a retained Whiteboard catalog selection');
assert.match(gameplay,/authoritativeCatalogAtOpen[\s\S]{0,1800}fatePhase7SubmitWhiteboardCatalog\(ids, \{authoritativeIntent:true\}\)/,'the picker must retain authoritative ownership from open through confirmation');
assert.doesNotMatch(gameplay,/fatePhase7SubmitWhiteboardCatalog\(ids\)\)[\s\S]{0,220}addCardToHand/,'multiplayer Whiteboard confirmation must not fall through to local hand mutation');
assert.match(gameplay,/title:'Moffitt Library: Whiteboard Drawings'[\s\S]{0,300}authoritativeDirectAction:true/,'Moffitt must identify its catalog as a direct authoritative command picker');
assert.match(online,/if\(opts\?\.authoritativeDirectAction === true\) return originals\.pickCardsVisual\.apply\(this, arguments\)/,'direct authoritative pickers must bypass the retired PICK_CARDS_VISUAL transport');
assert.match(online,/submitWhiteboardCatalog\(cardIds\)[\s\S]{0,180}fatePhase7SubmitWhiteboardCatalog\(cardIds\)/,'the public authoritative UI bridge must expose catalog submission');
assert.match(online,/con\._phase7VisualReady = exact\.length > 0/,'exact Chihuahuan command must drive the blue ready border');
assert.match(gameplay,/con\._phase7Authoritative === true\)[\s\S]{0,180}return fallback/,'client must not add the Chihuahuan surcharge twice');

console.log('landscape and picker regression smoke test passed');
