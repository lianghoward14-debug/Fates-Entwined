const fs=require('fs');const edit=(p,f)=>fs.writeFileSync(p,f(fs.readFileSync(p,'utf8')));
fs.writeFileSync('shared/engine/emerald-children.mjs',`export function emeraldChildrenEligible(state,player){
 const original=state.players[player]?.originalDeck;
 return Array.isArray(original) && original.every(card=>String(card.rarity).toLowerCase()!=='star');
}
export function emeraldChildrenFreeSet(state,player,card){return String(card?.id)==='120' && emeraldChildrenEligible(state,player);}
`);
for(const name of ['reducer','operations','legal-commands'])edit('shared/engine/'+name+'.mjs',s=>"import {emeraldChildrenEligible,emeraldChildrenFreeSet} from './emerald-children.mjs';\n"+s);
edit('shared/engine/reducer.mjs',s=>s.replace("    if(instruction?.kind === 'REQUIRE_ORIGINAL_AFFILIATION_COUNT'){",`    if(instruction?.kind === 'REQUIRE_NO_ORIGINAL_STARS'){
      frame.instructionIndex=emeraldChildrenEligible(state,frame.controller)?frame.instructionIndex+1:frame.program.length;
      continue;
    }
    if(instruction?.kind === 'REQUIRE_ORIGINAL_AFFILIATION_COUNT'){`).replace('!entry.card.counters?.chauffeurFreeSet && state.supportersSetThisTurn','!entry.card.counters?.chauffeurFreeSet && !emeraldChildrenFreeSet(state,actorIndex,entry.card) && state.supportersSetThisTurn'));
edit('shared/engine/operations.mjs',s=>s.replace('!card.counters.chauffeurFreeSet){','!card.counters.chauffeurFreeSet && !emeraldChildrenFreeSet(ctx.state,playerIndex,card)){'));
edit('shared/engine/legal-commands.mjs',s=>s.replace('if(!defenseInDepthReady && !card.counters?.chauffeurFreeSet','if(!defenseInDepthReady && !card.counters?.chauffeurFreeSet && !emeraldChildrenFreeSet(state,player,card)'));
edit('shared/engine/cards/registry.mjs',s=>s.replace('const REGISTRY = Object.freeze({',`const REGISTRY = Object.freeze({
  '120':{timings:['WHEN_SET'],operations:[],prompts:['MODAL_CHOICE','CARD_SELECTION'],program:[
    {kind:'REQUIRE_NO_ORIGINAL_STARS'},
    {kind:'SELECT_HOPLITE_CALL',local:'callCardId',unconditional:true},
    {kind:'RESOLVE_HOPLITE_CALL',cardId:'$callCardId'}
  ]},`));
const effect='When set, if your original deck does not contain a Star card, trigger a Call to Arms. If this card was set with that condition met, it becomes a free set.';
const flavor='Their eyes shining emerald green even on this cloudy day, illustrated heroic adventures and epic voyages destined to pass.';
edit('src/scripts/01-data-and-state.js',s=>s.replace('  // Brave Horizons',`  {id:'120',name:'The Emerald Eyed Children',ability:'The Story Never Ends',type:'Supporter',aff:'eventide',
    fate:1,cost:0,rarity:'circle',effect:${JSON.stringify(effect)},flavor:${JSON.stringify(flavor)},img:'120.png?v=20261022',cinematicPortrait:'pfp/card-120-portrait.png?v=20261022'},
  // Brave Horizons`).replace(/((?:116|117)\.png|card-(?:116|117)-portrait\.png)\?v=[^']+/g,'$1?v=20261022'));
edit('src/scripts/05-gameplay-core.js',s=>`function emeraldChildrenEligibleLocal(player){
 const original=G.players[player]?.originalDeckIds || (player===0?G.p1Deck:G.p2Deck);
 return Array.isArray(original) && original.every(value=>{
   const card=typeof value==='object'?value:CARDS.find(c=>String(c.id)===String(value));
   return !!card && String(card.rarity).toLowerCase()!=='star';
 });
}
function emeraldChildrenFreeSetLocal(card,player){return String(card?.id)==='120' && emeraldChildrenEligibleLocal(player);}
`+s.replaceAll('isFishCounter(card) || card.counters?.chauffeurFreeSet','isFishCounter(card) || emeraldChildrenFreeSetLocal(card,G.currentPlayer) || card.counters?.chauffeurFreeSet').replace("new Set(['108','111'","new Set(['120','108','111'").replace("async function _executeWhenSetSwitch(inst, z, r, c, cp, opp, id) {",`async function _executeWhenSetSwitch(inst, z, r, c, cp, opp, id) {
  if(id==='120'){
    if(emeraldChildrenEligibleLocal(cp))await window.resolveHopliteCallToArms(inst,cp);
    return;
  }`));
edit('src/scripts/07-ai.js',s=>s.replace('const isEffectFree = isFishCounter(card) ||','const isEffectFree = emeraldChildrenFreeSetLocal(card,cp) || isFishCounter(card) ||'));
edit('src/scripts/06-rendering-and-helpers.js',s=>s.replace("  if(/^(101|10[89]|11[0-7]|fishtoken)","  if(/^(116|117|120)\\.png(?:[?#]|$)/.test(String(src||''))) src=String(src).split(/[?#]/)[0]+'?v=20261022';\n  else if(/^(101|10[89]|11[0-7]|fishtoken)"));
const rows=[['The Emerald Eyed Children','翠眼の子どもたち','翠眼的孩子们'],['The Story Never Ends','物語は終わらない','故事永不落幕'],[effect,'セット時、初期デッキにスターカードがなければ「戦友招集」を発動する。この条件を満たしてセットした場合、無料セットとなる。','放置时，若你的初始牌组中没有星级牌，则触发“武装号召”。满足此条件放置此牌时，此次放置免费。'],[flavor,'曇り空の下でもエメラルド色に輝く瞳には、これから訪れる英雄の冒険と壮大な航海が映っていた。','即使在阴云笼罩的日子里，他们的双眼仍闪耀着翡翠绿光，映出注定到来的英勇冒险与史诗远航。']];
edit('src/scripts/53-caribbea-translations.js',s=>s.replace('const rows=[','const rows=[\n'+rows.map(r=>JSON.stringify(r)+',').join('\n')));
edit('index.html',s=>s.replace(/((?:01-data-and-state|05-gameplay-core|06-rendering-and-helpers|07-ai|53-caribbea-translations)\.js)\?v=[^"']+/g,'$1?v=20261022-card120'));
