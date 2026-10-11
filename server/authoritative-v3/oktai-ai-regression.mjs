import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createInitialState,legalCommandTemplates,projectStateForPlayer,stableStringify} from '../../shared/engine/index.mjs';
import {planDecision,chooseCommand} from '../../shared/ai/policy.mjs';
import {isOktaiConcealed} from '../../shared/ai/oktai-concealment.mjs';
const require=createRequire(import.meta.url);
const state=createInitialState({matchId:'oktai-ai',seed:'oktai-ai',handSize:6,
  cardDefinitions:require('../fate-card-catalog.js').getCardCatalog().cards,
  players:[{id:'p0',deckIds:['05','47']},{id:'p1',deckIds:[]}],
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true}});
state.turn=3;
const status={type:'TIMED_PLAYER_STATUS',statusType:'BH21_FATE_MORALE_CONCEALMENT',
  playerIndex:0,activeFromTurn:4,remainingTargetTurns:4};
state.statuses.push(status);
assert.equal(isOktaiConcealed(state,0),false,'does not begin on activation turn');
state.turn=4;
assert.equal(isOktaiConcealed(state,0),true);
assert.equal(isOktaiConcealed(state,1),false,'caster is unaffected');
const commands=legalCommandTemplates(state,0);
const context={canonicalState:state,playerIndex:0,samples:1,nodeBudget:30};
const before=stableStringify(state);
const plan=planDecision(commands,projectStateForPlayer(state,0),context);
assert.equal(plan.trace.policy,'oktai-concealed');
assert.equal(plan.replySimulations,0);
assert(commands.includes(plan.command),'only issues supplied legal commands');
assert.notEqual(plan.command.type,'END_TURN','still develops instead of skipping turns');
assert.deepEqual(chooseCommand(commands,projectStateForPlayer(state,0),context),plan.command);
assert.equal(stableStringify(state),before,'does not mutate the game');
const altered=structuredClone(state);
altered.moralePressure.morale=[1,999];
altered.turn=40;
for(const card of altered.players[0].hand)card.currentFate=999;
assert.deepEqual(chooseCommand(commands,projectStateForPlayer(altered,0),{...context,canonicalState:altered}),plan.command,
  'concealed numerical values cannot influence choice');
for(let remaining=4;remaining>0;remaining--){status.remainingTargetTurns=remaining;assert(isOktaiConcealed(state,0));}
status.remainingTargetTurns=0;
assert.equal(isOktaiConcealed(state,0),false);
assert.equal(planDecision(commands,projectStateForPlayer(state,0),context).trace.policy,'rules-search-v2',
  'normal search resumes after expiry');
console.log('Oktai AI passed: timing, target isolation, legal development, concealed-value independence, immutable state and restored search.');
