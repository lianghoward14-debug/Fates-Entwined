// Run before the server loads its snapshot, with no live snapshot writer.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function remove(directory) {
  const file = path.join(directory, 'rooms.json');
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  const id = 'GWRnFxagbyQ8YerbJGRK0McWpQD3_1784545473365';
  const matches = snapshot.publicDecks.filter(deck => deck.deckId === id);
  if (!matches.length) return {alreadyRemoved:true};
  assert.equal(matches.length, 1);
  const deck = matches[0];
  assert.equal(deck.name, 'JAKE');
  assert.equal(deck.ownerUid, 'GWRnFxagbyQ8YerbJGRK0McWpQD3');
  assert.equal(deck.ownerName, 'PILOTMANJIM');
  const backup = path.join(directory, 'removed-jake-deck-20261030.backup.json');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(deck), {flag:'wx',mode:0o600});
  snapshot.publicDecks = snapshot.publicDecks.filter(entry => entry.deckId !== id);
  const temporary = file + '.remove-jake.tmp';
  fs.writeFileSync(temporary, JSON.stringify(snapshot), {mode:0o600});
  fs.renameSync(temporary, file);
  return {removed:id, name:deck.name, owner:deck.ownerName, backup};
}
module.exports = {remove};
