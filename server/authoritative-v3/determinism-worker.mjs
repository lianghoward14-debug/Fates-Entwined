import {canonicalHash, reduceCommand} from '../../shared/engine/index.mjs';
import {command, takeFromHandToBoard, testState} from './test-helpers.mjs';

let state = testState({matchId:'DETERMINISMV3', seed:'fixed-determinism-seed', player0:['27', '32'], player1:['32']});
const source = takeFromHandToBoard(state, 0, '27', {z:0, r:2, c:0});
const hashes = [canonicalHash(state)];
let result = reduceCommand(state, command(state, 'p0', 1, 'ACTIVATE_EFFECT', {sourceIid:source.iid}), {playerId:'p0'});
if(!result.ok) throw new Error(result.rejection.reason);
state = result.state;
hashes.push(result.stateHash);
result = reduceCommand(state, command(state, 'p0', 2, 'END_TURN'), {playerId:'p0'});
if(!result.ok) throw new Error(result.rejection.reason);
hashes.push(result.stateHash);
process.stdout.write(JSON.stringify(hashes));

