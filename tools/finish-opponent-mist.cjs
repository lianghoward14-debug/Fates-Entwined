const fs=require('fs');
let p='server/saboteur-cloud-renderer-regression.cjs',s=fs.readFileSync(p,'utf8');
s=s.replace("untilTurn:6}]}));","untilTurn:6}]},0));").replace("untilTurn:8}]}),'latest","untilTurn:8}]},0),'latest");
s+="\nfor(const owner of [0,1]){const state={turn:4,_phase7Statuses:[{type:'SABOTEUR_FIELD_VEIL',playerIndex:owner,untilTurn:6}]};assert.equal(api.veilKey(state,owner),'');assert(api.veilKey(state,1-owner));}\n";
fs.writeFileSync(p,s);
p='index.html';s=fs.readFileSync(p,'utf8').replace('20261024-subtle-mist','20261024-opponent-mist').replace('20261024-payment-lines','20261024-payment-footer');fs.writeFileSync(p,s);
s=fs.readFileSync('tools/check-broken-wisp-preview.cjs','utf8').replace('saboteur-broken-wisps.html','saboteur-natural-tapers.html').replace('broken-wisps.png','natural-tapers.png');fs.writeFileSync('tools/check-natural-mist-preview.cjs',s);
