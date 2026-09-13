import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWarfrontReplayStore} from './warfront-replay-store.mjs';
import {warfrontWinProbability} from './warfront-ai-profile.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'warfront-replays-'));
try{
  const replay={version:6,actions:[{view:{state:{data:'recorded card data '.repeat(500000)}}}]};
  assert(Buffer.byteLength(JSON.stringify(replay))>8000000);
  const store=createWarfrontReplayStore(directory),reference=store.save(replay);
  assert(JSON.stringify(reference).length<200,'campaign carries a small reference');
  assert(fs.statSync(path.join(directory,reference.storageKey+'.json.gz')).size<100000,'repeated snapshots compress');
  assert.deepEqual(createWarfrontReplayStore(directory).read(reference.storageKey),replay,'recording survives store restart without truncation');
  assert.deepEqual(store.save(reference),reference);
  assert.throws(()=>store.read('../rooms'));
  assert.equal(warfrontWinProbability({elo:600},{elo:600}),.5);
  const chance=warfrontWinProbability({trueElo:600},{trueElo:1400});
  assert(chance<.01 && chance**5<1e-9,'large strength gaps make weak-side sweeps extremely unlikely');
  console.log('Large replay persistence, compression, restart and strength probability checks passed');
}finally{fs.rmSync(directory,{recursive:true,force:true});}
