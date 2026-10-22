const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s);
const cards=[
['108','Sofia','Childlike Whimsy',2,3,'Your deck becomes your opponent’s original deck. Discard your entire hand, then draw 6 cards.','"Daddy, come home safe! I want to play catch soon!"'],
['109','Don Julio','An Oligarch’s Gamble',6,4,'Whenever your opponent would set a Supporter in this card’s zone, roll a 6-sided die. This card gains Fate equal to the result.','"To quell a revolution, you have to be revolutionary."'],
['110','Sebastián','Fishmonger',2,2,'Whenever you would consolidate a card, add a Fish Token to your hand. Fish Tokens count as 0.5 Reinforcement and can be set for free.','"A longtime friend of Jorge Alvarez, working in the dockyards of Havano."'],
['111','West Caribbea Villager','Till the Land',1,0,'When set, select a Landscape. It becomes active for this turn and your opponent’s next turn.','"Much of the population of Caribbea resides in the countryside as farmers."'],
['112','Caribbea Revolutionary','The Revolution Victorious!',1,0,'When set, for this turn, all cards you flip face up gain 4 Fate permanently.','"For the first time in our lives, our spirits may now soar freely."'],
['113','Old Elite Oligarch','Oppression of the Old Elite',1,0,'When set, rearrange the top 5 cards of your opponent’s deck.','"For those that sit upon that high seat in Havano, all water is wine."'],
['114','Loyalist Soldier','Suppression',1,0,'While this card is on the field, all of your opponent’s newly set Supporters on the field cannot be used for consolidation until at least one of their turns has passed. This effect can stack.','"These soldiers are too well paid to let abstract moral quandaries influence their line of work."'],
['115','Caribbea Loyalist','Loyalty to Tradition',1,0,'When set, if your original deck has 30 or more cards of the same affiliation, initiate a Call to Arms.','"Particularly amongst the artisans and merchants, there is a belief that Caribbea couldn’t have survived the tribulations of the Ash Age without the Old Elite."'],
['116','Anarquista Revolutionary','The Underground Resistance',1,0,'When set, on your next consolidation, you can choose for the card to be set face down on the field.','"A good man is not one that never goes to war—rather he is one that knows when he has to raise a sword in the face of great injustice."'],
['117','Anarquista Saboteur','Covert Operations',1,0,'When set, for three turns, all of your card actions are hidden from your opponent.','"They call it a tantrum—we call it fighting for our future."']
];
let data=read('src/scripts/01-data-and-state.js');
const quote=s=>"'"+s.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const child=data.match(/  \{id:'117',[\s\S]*?(?=\r?\n  \{id:)/)[0];
data=data.replace(/  \{id:'118',[\s\S]*?(?=\r?\n  \/\/)/,child.replace("id:'117'","id:'118'"));
for(const [id,name,ability,fate,cost,effect,flavor] of cards){
 const type=id==='108'?'Initiator':id==='109'?'Dauntless':id==='110'?'Improvisor':'Supporter';
 const portrait=Number(id)<=110?`,pfpId:${Number(id)+25},cinematicPortrait:'pfp/card-${id}-portrait.png?v=20261021'`:`,cinematicPortrait:'pfp/card-${id}-portrait.png?v=20261021'`;
 const block=`  {id:'${id}'${portrait},name:${quote(name)},ability:${quote(ability)},type:'${type}',aff:'eventide',\n    fate:${fate},cost:${cost},rarity:'${cost?'triangle':'circle'}',\n    effect:${quote(effect)},\n    flavor:${quote(flavor)},img:'${id}.png?v=20261021-printed'},`;
 data=data.replace(new RegExp("  \\{id:'"+id+"',[\\s\\S]*?(?=\\r?\\n  \\{id:|\\r?\\n  //)"),block);
}
write('src/scripts/01-data-and-state.js',data);
// Existing identity keys stay stable for fish tokens; only presentation changes.
for(const file of ['src/scripts/05-gameplay-core.js','src/scripts/18-online-rooms.js','shared/engine/operations.mjs']){
 let s=read(file).replaceAll("'Fish Counter'","'Fish Token'").replaceAll("'Fresh Catch'","'The Daily Catch'").replaceAll("'token-fish.svg'","'fishtoken.png?v=20261021'").replaceAll("'Counts as 0.5 Reinforcement. Can be set for free.'","'This card counts as a token. This card counts as 0.5 Reinforcement and can be set for free.'").replaceAll("'A fresh catch from the wharf.'",quote('"Never bring an exotic fish fan to the docks of Havano."'));
 write(file,s);
}
// Swap rules with their printed identities, not arbitrary occurrences of numbers.
let registry=read('shared/engine/cards/registry.mjs').replace("  '118':{timings:","  '__swap':{timings:").replace("  '117':{timings:","  '118':{timings:").replace("  '__swap':{timings:","  '117':{timings:").replace("playerIndex:'$controller',zone:'$zone',sourceIid:'$sourceIid',remaining:1","playerIndex:'$controller',sourceIid:'$sourceIid',remaining:1");
write('shared/engine/cards/registry.mjs',registry);
let core=read('src/scripts/05-gameplay-core.js').replace("if(id === '118'){","if(id === '__swap'){").replace("if(id === '117'){","if(id === '118'){").replace("if(id === '__swap'){","if(id === '117'){").replace('G._saboteurCloudTurn=G.turn;','G._saboteurCloudTurn=G.turn;\n    G._saboteurCloudUntilTurn=G.turn+2;');
core=core.replace(/  const openingExtras=G.players\[cp\].deck.filter[\s\S]*?for\(const extra of openingExtras\) addCardToHand\(cp,extra,\{openingHand:true,announce:false\}\);\r?\n/,'');
core=core.replace('if(effect.turn !== G.turn) continue;','if(effect.turn !== G.turn || effect.owner !== card.owner) continue;');
core=core.replace("{type:'unclassified',kind:'revolutionary_spirit'","{type:'permanent',kind:'revolutionary_spirit'");
core=core.replace('  for(let r=0;r<(G.board[z]||[]).length;r++)for(let c=0;c<(G.board[z][r]||[]).length;c++){\n    const card=G.board[z][r][c];','  for(let z=0;z<G.board.length;z++)for(let r=0;r<(G.board[z]||[]).length;r++)for(let c=0;c<(G.board[z][r]||[]).length;c++){\n    const card=G.board[z][r][c];');
// Support CRLF source too.
core=core.replace('  for(let r=0;r<(G.board[z]||[]).length;r++)for(let c=0;c<(G.board[z][r]||[]).length;c++){\r\n    const card=G.board[z][r][c];','  for(let z=0;z<G.board.length;z++)for(let r=0;r<(G.board[z]||[]).length;r++)for(let c=0;c<(G.board[z][r]||[]).length;c++){\r\n    const card=G.board[z][r][c];');
write('src/scripts/05-gameplay-core.js',core);
let op=read('shared/engine/operations.mjs');
op=op.replace(/      const player=ctx.state.players\[playerIndex\];\r?\n      const extras=player.deck.filter[\s\S]*?(?=      return ctx.state.players\[playerIndex\].deck;)/,'');
write('shared/engine/operations.mjs',op);
for(const file of ['shared/engine/reducer.mjs','shared/engine/legal-commands.mjs']){
 let s=read(file).replace('&& Number(status.zone) === Number(payload.destination?.z)','&& (status.zone == null || Number(status.zone) === Number(payload.destination?.z))').replace('&& Number(status.zone) === destination.z','&& (status.zone == null || Number(status.zone) === destination.z)');
 s=s.replace("status.type === 'REVOLUTIONARY_FLIP_GAIN' && status.turn === state.turn","status.type === 'REVOLUTIONARY_FLIP_GAIN' && status.turn === state.turn && Number(status.playerIndex) === actorIndex").replace("permanentFateGain:false,reason:'REVOLUTIONARY_SPIRIT'","permanentFateGain:true,reason:'REVOLUTIONARY_SPIRIT'");
 s=s.replace('if(payload.faceDown === true && faceDownPermission){','if(faceDownPermission){');
 write(file,s);
}
fs.writeFileSync(path.join(root,'outputs/printed-cards-20261021.json'),JSON.stringify(cards,null,2));
console.log('Printed card catalog and base rule updates written.');
