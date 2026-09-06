import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ui = fs.readFileSync(new URL('../../src/scripts/45-match-ui-codex.js', import.meta.url), 'utf8');
const rooms = fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');
const portrait = ui.slice(ui.indexOf('  function playerPortraitArt('), ui.indexOf('  function suppressLegacyNode('));
const projection = rooms.slice(rooms.indexOf('    const projectedPlayers = Array.isArray(view.state.players)'), rooms.indexOf('    // Mark authority before rendering the projection.'));
const view = {state:{players:[
  {name:'Foot Predator', photoURL:'pfp/foot.png', rankElo:900},
  {name:'Triple T', photoURL:'pfp/triple.png', rankElo:600}
]}};
for(const seat of [0, 1]){
  const g = {_phase7CurrentMultiplayer:true, _onlinePlayerIndex:seat,
    playerProfiles:{0:{img:'stale-local.png', pfp:'stale-extra.png'},1:{img:'stale-opponent.png'}}};
  const context = vm.createContext({g, view:structuredClone(view),
    window:{getFateGameState:()=>g, getProfileImgSrc:()=>`local-account-${seat}.png`},
    invoke:()=>g,
    findArt:()=>{throw new Error('Multiplayer must not reuse legacy canvas art');},
    $:()=>null
  });
  vm.runInContext(`{${projection}}\n${portrait}`, context);
  assert.equal(context.window.G, undefined, 'exercise lexical G, as in the game');
  for(const player of [0, 1]){
    assert.equal(context.playerPortraitArt(player, '', context.view), `url("${view.state.players[player].photoURL}")`);
    assert.equal(g.playerProfiles[player].photoURL, view.state.players[player].photoURL);
  }
  // A new match/missing photo must clear every inherited image candidate.
  delete context.view.state.players[1-seat].photoURL;
  vm.runInContext(`{${projection}}`, context);
  assert.equal(g.playerProfiles[1-seat].img, 'blank.png');
  assert.equal(g.playerProfiles[1-seat].pfp, undefined);
  assert.equal(context.playerPortraitArt(1-seat, '', context.view), 'url("blank.png")');
  assert.equal(context.playerPortraitArt(1-seat, '', null), 'url("blank.png")');
}
// Singleplayer still uses its local portrait when no match profile exists.
{
  const g = {};
  const context = vm.createContext({window:{getProfileImgSrc:()=> 'local.png'}, invoke:()=>g, findArt:()=> 'legacy-opponent', $:()=>null});
  vm.runInContext(portrait, context);
  assert.equal(context.playerPortraitArt(0, ''), 'url("local.png")');
  assert.equal(context.playerPortraitArt(1, ''), 'legacy-opponent');
}
console.log('Phase 7 portrait seats: PASS (both clients, missing photos, stale profiles, singleplayer)');
