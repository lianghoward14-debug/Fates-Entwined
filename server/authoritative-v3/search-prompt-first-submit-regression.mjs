import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const client = fs.readFileSync(new URL('../../src/scripts/authoritative-v3-phase7-beta-client.mjs', import.meta.url), 'utf8');
const extract = (start, end)=>client.slice(client.indexOf(start), client.indexOf(end, client.indexOf(start)));

for(const [name, payload] of [
  ['IB Student', {selectedIid:'supporter-a'}],
  ['Johnathan Kirby', {selectedIids:['supporter-a', 'supporter-b']}]
]){
  const sent = [];
  const context = vm.createContext({
    state:null, revision:0, stateHash:'', playerIndex:0, legalCommands:[], privateActionCards:[], presentationBatch:null,
    credential:{matchId:'search', playerId:'p0'}, inflight:new Map(), activeScreen:null,
    clone:structuredClone, updateTakeoverNotice(){}, emit(){}, clearTimeout(){}, setTimeout:()=>1,
    fatalError:'', intentionallyClosed:false, WebSocket:{OPEN:1}, crypto:{randomUUID:()=> 'answer'},
    socket:{readyState:1, send:value=>sent.push(JSON.parse(value))}
  });
  vm.runInContext(extract('function applyServerMessage(', '\nasync function connect(')
    + extract('function containsForbiddenPostState(', '\nfunction emit(')
    + extract('async function sendCommand(', '\nfunction subscribe('), context);
  const answer = {type:'ANSWER_PROMPT', payload:{promptId:'current-search', ...payload}};
  const latest = {kind:'accepted', revision:12, commandId:'placement', stateHash:'current',
    state:{revision:12, pendingPrompt:{promptId:'current-search', type:'CARD_SELECTION', sourceCardId:name}},
    legalCommands:[answer], privateActionCards:[{iid:'supporter-a'}], events:[{type:'PROMPT_CREATED'}]};
  context.applyServerMessage(latest);
  const batch = structuredClone(context.presentationBatch);
  for(const kind of ['snapshot', 'accepted', 'rejected']){
    let settled = false;
    context.inflight.set('older-command', {timer:1, resolve(){settled = true;}, reject(){settled = true;}});
    context.applyServerMessage({kind, revision:11, commandId:'older-command', stateHash:'old',
      state:{revision:11, pendingPrompt:{promptId:'old-search'}}, legalCommands:[], privateActionCards:[],
      events:[{type:'OLD_EVENT'}], rejection:{code:'STALE_REVISION'}});
    assert.equal(context.state.pendingPrompt.promptId, 'current-search', `${name}: ${kind} cannot restore old prompt`);
    assert.equal(context.legalCommands[0].payload.promptId, 'current-search');
    assert.equal(context.privateActionCards.length, 1);
    assert.equal(context.stateHash, 'current');
    assert.deepEqual(structuredClone(context.presentationBatch), batch);
    assert.equal(settled, kind !== 'snapshot', 'old acknowledgements must still settle');
  }
  const pending = context.sendCommand(answer.type, context.legalCommands[0].payload);
  assert.equal(sent.length, 1, `${name}: first confirmation sends exactly once`);
  assert.equal(sent[0].command.expectedRevision, 12);
  assert.deepEqual(sent[0].command.payload, answer.payload);
  context.applyServerMessage({kind:'accepted', revision:13, commandId:sent[0].command.commandId,
    state:{revision:13, pendingPrompt:null}, legalCommands:[], privateActionCards:[]});
  assert.equal((await pending).kind, 'accepted');
  assert.equal(context.state.pendingPrompt, null);
  // Rejection snapshots at a newer revision still resynchronize normally.
  context.applyServerMessage({...latest, kind:'rejected', revision:14, state:{...latest.state, revision:14}});
  assert.equal(context.revision, 14);
  assert.equal(context.state.pendingPrompt.promptId, 'current-search');
  console.log(`PASS: ${name} first submission survives delayed server updates`);
}
