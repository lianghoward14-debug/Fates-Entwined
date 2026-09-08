import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,projectStateForPlayer,reduceCommand,stableStringify} from '../../shared/engine/index.mjs';
import {sampleWorld} from '../../shared/ai/belief.mjs';
import {planDecision,chooseCommand} from '../../shared/ai/policy.mjs';
import {personalityFor,personalityNames} from '../../shared/ai/personality.mjs';
import {evaluatePosition} from '../../shared/ai/position.mjs';
import {FateAuthoritativeV3SinglePlayerAdapter} from '../../src/scripts/authoritative-v3-single-player-adapter.mjs';
const require=createRequire(import.meta.url);
const definitions=require('../fate-card-catalog.js').getCardCatalog().cards;
function fixture(decks,activePlayer=0){return createInitialState({matchId:'replacement-regression',seed:'fixed',handSize:6,activePlayer,
  players:decks.map((deckIds,p)=>({id:`p${p}`,deckIds})),cardDefinitions:definitions,
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true}});}
let state=fixture([['05','47','67','32','09','20','28','60'],['56','47','79','32','09','20','28','60']]);
const original=stableStringify(state),world=sampleWorld(state,0);
const changed=structuredClone(state);
for(const card of [...changed.players[1].hand,...changed.players[1].deck]){card.id='01';card.currentFate=999;card.cost=0;}
changed.players[0].deck.reverse();changed.players[1].deck.reverse();changed.rngState.value=1234;
assert.equal(stableStringify(sampleWorld(changed,0)),stableStringify(world),'hidden identities, draw order and live RNG must not inform search');
assert.equal(stableStringify(state),original,'sampling must not mutate live state');
state.landscapeId='igb12';assert.equal(sampleWorld(state,0).players[1].hand[0].id,state.players[1].hand[0].id,'explicitly revealed hands remain known');
state=fixture([['05'],[]]);
const card=state.players[0].hand.pop();card.currentFate=40;state.board[0][2][0]=card;
state.turn=4;state.moralePressure.morale[1]=1;
for(const style of personalityNames){
  const decision=planDecision(legalCommandTemplates(state,0),projectStateForPlayer(state,0),{canonicalState:state,playerIndex:0,style,samples:1,nodeBudget:30});
  assert.equal(decision.command.type,'END_TURN',`${style} must take guaranteed lethal`);
  assert.equal(decision.trace.personality.name,style);
}
state.moralePressure.morale=[100,100];
assert.notEqual(evaluatePosition(state,0,personalityFor('cautious')),evaluatePosition(state,0,personalityFor('reckless')),'personality must affect valuation, not just diagnostics');
const poisonedCache={sequence:[{type:'CONCEDE',payload:{}}]};
const command=chooseCommand(legalCommandTemplates(state,0),projectStateForPlayer(state,0),{canonicalState:state,playerIndex:0,planCache:poisonedCache,samples:1,nodeBudget:30});
assert.notEqual(command.type,'CONCEDE');assert.deepEqual(poisonedCache.sequence,[],'replan instead of replaying stale intentions');
state=fixture([[],['05']],1);
let resolveDecision;
const pending=new Promise(resolve=>{resolveDecision=resolve;});
const adapter=new FateAuthoritativeV3SinglePlayerAdapter({state,humanPlayerId:'p0',aiPlayerId:'p1',aiPolicy:()=>pending});
const revision=adapter.session.state.revision;
const work=adapter.runAiTurnAsync();adapter.dispose();resolveDecision({type:'END_TURN',payload:{}});
assert.equal((await work).cancelled,true);assert.equal(adapter.session.state.revision,revision,'late worker result must not advance an abandoned match');
console.log(`Replacement AI regressions passed: hidden information, immutable worlds, ${personalityNames.length} personalities, tactical safeguards, replanning and cancelled async decisions.`);
