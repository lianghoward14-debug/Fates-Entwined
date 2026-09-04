const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const index=read('index.html');
const data=read('src/scripts/01-data-and-state.js');
const audio=read('src/scripts/08-audio-and-meta-ui.js');
const rooms=read('src/scripts/18-online-rooms.js');
const beta=read('src/scripts/authoritative-v3-phase7-beta-client.mjs');
const serverSettings=read('server/authoritative-v3/phase7-game-settings.mjs');

for(const id of ['igb21','igb22','igb23','igb24']){
  assert.match(data,new RegExp(`\\b${id}\\s*:`),`${id} must exist in the browser landscape catalog`);
  assert.match(serverSettings,new RegExp('length:24'),`the authority must accept ${id}`);
}
assert.match(audio,/GAME_SONGS\s*=\s*Array\.from\(\{length:24\}/,'the game bootstrap must accept board21 through board24');
assert.match(audio,/Math\.min\(24,\s*parseInt/,'multiplayer background application must not clamp selected landscapes to 20');
assert.match(rooms,/phase7LandscapeNumber[\s\S]{0,180}Math\.min\(24/,'the authoritative projection bridge must preserve landscape numbers 21–24');
assert.match(rooms,/\^igb\(\[1-9\]\|1\\d\|2\[0-4\]\)\$/,'the Free Play multiplayer settings bridge must accept landscape 24');
assert.match(beta,/landscapeId:String\(gameSettings\.landscapeId \|\| 'igb1'\)/,'the matchmaking request must send the selected landscape');

const requiredBuilds={
  '01-data-and-state.js':2026083103,
  '04-game-setup.js':2026083103,
  '06-rendering-and-helpers.js':2026083103,
  '08-audio-and-meta-ui.js':2026083101,
  '18-online-rooms.js':2026083103,
  'authoritative-v3-phase7-beta-client.mjs':2026083104
};
for(const [file,minimum] of Object.entries(requiredBuilds)){
  const escaped=file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=index.match(new RegExp(`${escaped}\\?v=(\\d+)`));
  assert(match,`${file} must have a cache-busted URL`);
  assert(Number(match[1])>=minimum,`${file} is still referenced by a pre-21–24 cache URL`);
}
assert.match(index,/phase7-landscapes-21-24-20260901b/,'the visible client build must identify the current 24-landscape multiplayer bundle');

console.log('multiplayer landscape 21–24 choice smoke passed');
