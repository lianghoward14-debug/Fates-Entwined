// Run only before the game server loads its snapshot, never alongside a live writer.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const uid = 'nNbfvYwsoDfnvTHQhK4lwN5a2B22';
const username = "Netanyahu's 1st Guard";
const fields = ['starlight', 'unopenedPacks', 'unopenedProfilePacks', 'unopenedFavoredPacks', 'unopenedBooster2Packs', 'unopenedBooster3Packs', 'unopenedBooster4Packs'];
const operation = 'balance-reset-20261025-netanyahu';
function reset(directory) {
  const receiptPath = path.join(directory, operation + '.done.json');
  if (fs.existsSync(receiptPath)) return {alreadyApplied:true};
  const snapshotPath = path.join(directory, 'rooms.json');
  const original = fs.readFileSync(snapshotPath, 'utf8');
  const snapshot = JSON.parse(original);
  const matches = snapshot.playerSaves.filter(row => row.uid === uid);
  assert.equal(matches.length, 1, 'Expected exactly one matching account');
  const save = matches[0], profile = save.data?.profile;
  assert.equal(profile?.username, username, 'Player identity mismatch');
  const before = JSON.parse(JSON.stringify(save));
  const now = Date.now();
  for (const field of fields) profile[field] = 0;
  profile._clientUpdatedAt = Math.max(now, Number(profile._clientUpdatedAt || 0) + 1);
  save.updatedAt = now;
  // Prove that no collection, other profile field, or other account changes.
  const restored = JSON.parse(JSON.stringify(snapshot));
  restored.playerSaves[restored.playerSaves.findIndex(row => row.uid === uid)] = before;
  assert.deepEqual(restored, JSON.parse(original));
  for (const key of Object.keys(before.data.profile)) {
    if (!fields.includes(key) && key !== '_clientUpdatedAt') assert.deepEqual(profile[key], before.data.profile[key]);
  }
  const backupPath = path.join(directory, operation + '.backup.json');
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, JSON.stringify(before), {flag:'wx', mode:0o600});
  const temporary = snapshotPath + '.maintenance.tmp';
  fs.writeFileSync(temporary, JSON.stringify(snapshot), {mode:0o600});
  fs.renameSync(temporary, snapshotPath);
  const verified = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')).playerSaves.find(row=>row.uid===uid);
  assert.deepEqual(verified, save);
  const receipt = {uid, username, at:now, before:Object.fromEntries(fields.map(key=>[key,before.data.profile[key]||0])), after:Object.fromEntries(fields.map(key=>[key,verified.data.profile[key]]))};
  fs.writeFileSync(receiptPath, JSON.stringify(receipt), {flag:'wx',mode:0o600});
  return receipt;
}
module.exports = {reset};
