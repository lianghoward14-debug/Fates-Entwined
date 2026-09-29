import assert from 'node:assert/strict';
import {warfrontSpectatorPerspective} from './warfront-spectator-perspective.mjs';
import {testState} from './test-helpers.mjs';
import {projectStateForSpectator} from '../../shared/engine/projections.mjs';

for(const aiSeat of [0,1]){
  const state=testState();state.warfrontMatch=true;state.warfrontAiSeats=[aiSeat];
  const selection=warfrontSpectatorPerspective(state,null,aiSeat);
  assert.equal(selection.perspective,aiSeat);assert.equal(selection.handSeat,aiSeat);
  const view=projectStateForSpectator(state,selection.handSeat);
  assert.deepEqual(view.players[aiSeat].hand,state.players[aiSeat].hand,'watched AI hand is visible');
  assert.equal(view.players[1-aiSeat].hand,undefined,'opposing human hand remains private');
  assert.equal(view.players[aiSeat].deck,undefined,'deck order remains private');
  assert.equal(warfrontSpectatorPerspective(state,null,1-aiSeat).handSeat,null,'public spectators cannot request a human hand');
  assert.equal(warfrontSpectatorPerspective(state,1-aiSeat,aiSeat).perspective,1-aiSeat,'team perspective stays locked');
  state.warfrontAiSeats=[];state.aiTakeoverSeats=[aiSeat];
  assert.equal(warfrontSpectatorPerspective(state,null,aiSeat).handSeat,null,'human takeover is not a server-created AI opponent');
}
console.log('Warfront AI spectator hands and opposing human privacy passed');
