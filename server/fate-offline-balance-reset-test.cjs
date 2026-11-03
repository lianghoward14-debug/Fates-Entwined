const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const {reset} = require(process.env.RESET_MODULE || '../tools/reset-player-balance-offline.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-reset-test-'));
try {
  const row = {uid:'nNbfvYwsoDfnvTHQhK4lwN5a2B22',data:{profile:{username:"Netanyahu's 1st Guard",starlight:4210,unopenedPacks:37,unopenedBooster2Packs:4,ownedCards:{101:2}},presets:{one:{name:'keep'}}}};
  const original = {playerSaves:[row,{uid:'other',data:{profile:{starlight:900}}}],otherState:{keep:true}};
  fs.writeFileSync(path.join(dir, 'rooms.json'), JSON.stringify(original));
  const result = reset(dir);
  assert(Object.values(result.after).every(value=>value===0));
  assert.equal(reset(dir).alreadyApplied, true);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'rooms.json')));
  assert.deepEqual(saved.playerSaves[1], original.playerSaves[1]);
  assert.deepEqual(saved.playerSaves[0].data.profile.ownedCards, row.data.profile.ownedCards);
  assert.deepEqual(saved.playerSaves[0].data.presets, row.data.presets);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'balance-reset-20261025-netanyahu.backup.json'))), row);
  console.log('Offline reset: zero balances, unchanged cards/decks/other accounts, backup, and repeat protection passed');
} finally { fs.rmSync(dir, {recursive:true, force:true}); }
