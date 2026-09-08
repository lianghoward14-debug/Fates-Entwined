const fs=require('fs'),vm=require('vm');
const {extractArrayLiteral}=require('../server/fate-deck-catalog');
const {getCardCatalog}=require('../server/fate-card-catalog');
const path='src/scripts/09-challenger-mode.js';
const source=fs.readFileSync(path,'utf8');
const literal=extractArrayLiteral(source,'AI_ONLY_RANDOM_DECKS');
const decks=vm.runInNewContext('('+literal+')');
const cards=new Map(getCardCatalog().cards.map(c=>[c.id,c]));
const expand=s=>s.split(' ').flatMap(part=>{const [id,n]=part.split(':');return Array(Number(n||3)).fill(id);});
const core=expand('60 28 79 18');
const designs={
 ai_last_mohicans_ledger:['07:1','45:2 27 06:2 bh22:2','09 32 74 98 33 20','Develop cheap search and draw, fund a single Chingachlook removal play, and use Jaime and recovery to sustain the Morale cost. Additional finishers are replacements, not a required three-card engine.'],
 ai_hellenic_heartbreaker:['03:1','35 22 27','09 32 74 98 05 20','Build Alexander through affordable reinforcement and Isaac buffs. Howard is an optional finisher; Marines and Havano protect the pressure plan while South Wind buys a calculation.'],
 ai_hungarian_war_dance:['07:1','34 66 29','32 74 98 25 44 68','Search Rozsi, develop a supporter formation, and use Mark Menz to unify its affiliation. Win through repeated pressure and disruptive supporters without requiring Duncan alongside the engine.'],
 ai_great_oak_salvo:['07:1','35:2 27 06:2 bh22:2','32 74 98 47 58 20','Search and recur Great Oak Infantry for direct Morale damage while cheap draw sustains the hand. Alexander adds a separate clock; Jaime and South Wind support selective recursion rather than unlimited Morale spending.'],
 ai_adjacency_doctrine:['07:1','01  bh11 27'.replace(/  /g,' '),'09 32 74 98 25 44','Develop a cheap supporter formation, then add Felicyta and University Felicyta when adjacency already offers value. Avoid the former multiple-Dauntless setup; interaction remains available throughout development.'],
 ai_safe_row_sanctuary:['02:1','bh12  bh22 23'.replace(/  /g,' '),'09 32 74 98 59 68','Use Anicka to open discounted development, Louis to empower arrivals, and Jaime to turn one established safe-row threat into recovery. Search Cathy when the character formation supports her aura.'],
 ai_reinforcement_exchange:['07:1','14:2 21:2 27 06:2','09 24 49 32 74 98','Develop real reinforcement before committing Alondra or Henry. Cheap initiators supply access and can later be recycled through Irvine; Ralph and United Nations support the expensive threats.'],
 ai_alpine_furnace:['03:1','22 27 87','09 32 74 98 73 05','Build reinforcement and draw first, then activate the Ukulele sequence only when several consolidations are affordable. ALPINE Expeditionary and Isaac provide permanent gains without requiring multiple four-cost finishers.'],
 ai_alpine_iron_line:['07:1','27 22 bh22','09 32 74 98 76 50','Use immutable ALPINE Infantry for immediate zone pressure and Berkeley denial to protect tempo. Other supporters fund cheap characters; ALPINE Infantry is never counted as reinforcement or a buff target.'],
 ai_eventide_blockade:['02:1','11 14:2 06:2 27:2','09 32 74 98 53 50','Establish Anne-led supporters, then use Alondra selectively to close contested lanes. Colombo and Berkeley attack opposing development; affordable access replaces the separate Chingachlook package.'],
 ai_hand_quarantine:['56:1','bh03:2 27 06:2 67:2','32 74 98 70 72 42','Combine Ali hand pressure with theft, Guerilla filtering and cheap negation. Kazumi and Jorge sustain access; win through board development while disrupting the opponent rather than filling the deck with slow hand attacks.'],
 ai_high_t_draw_mill:['07:1','bh02:2 08 27 bh15:1','09 32 42 74 98 bh23','Use Lina to set Joie directly from deck or discard. Establish a populated zone before chaining draw effects; Panacea cashes in past triggers, while Hsei-Ling is optional rather than another prerequisite.'],
 ai_university_counterbattery:['56:1','bh08:2 67 27 06:1','09 32 74 98 bh23 bh25','Find University Maja through cheap search and draw, then turn Secules, Lydia, Marines and Havano into formation growth. Skier compresses the draw pool; Panacea and late Engineers provide payoff without extra expensive characters.'],
 ai_selva_tidal_strike:['02:1','bh04:2 06 27:2 bh16:2','09 32 74 98 50 53','Use cheap access to find Selva Anicka for a board-breaking reduction when targets justify the cost. Li-Hua is a secondary Eventide payoff; supporter denial buys time without demanding a large character assembly.'],
 ai_crown_of_five:['07:1','19 15 77','09 24 32 74 98 68','Build a supporter-funded Coordinator court with Kvetka, Zsofia and Duncan. High Schooler finds the needed aura; the deck no longer requires five different expensive Coordinators to become functional.'],
 ai_snowball_fight_club:['bh05:1','41:2 08 48:2 27:2','32 74 98 93 37 31','Find Jimmy through Lina and Wodny Potok Youth through supporter search. Repeated Snowball activations and Fusilier copies grow Jimmy while weakening opposing formations; Taylor supplies flexible access or redundancy.'],
 ai_wintertide_family_reunion:['02:1','99 100:2 88:2 82:2','09 32 74 98 84 90','Develop an affordable board before changing to Snow. Youth Rozsi enables the Blame Game conversion; convert established supporters into character reinforcement for Wintertide, with Kvetka supplying a separate free Expanded Worlds character route.']
};
const beforeStarter=extractArrayLiteral(source,'STARTER_DECKS');
const report=[];
for(const deck of decks){
 const design=designs[deck.id];if(!design)throw Error('Missing '+deck.id);
 const [star,characters,supporters,description]=design;
 // Kvetka 84 and Fisherman 90 are characters, not generic resource bodies;
 // the winter package uses a dedicated list below.
 let ids=[...core,...expand(star),...expand(characters),...expand(supporters)];
 if(deck.id==='ai_wintertide_family_reunion')ids=[...core,...expand('02:1 99:2 100:2 88:2 82:1 84:1 90:1 09 32 74 98 95 97')];
 if(ids.length!==40)throw Error(deck.id+' count '+ids.length);
 const counts={};for(const id of ids){if(!cards.has(id))throw Error(id);counts[id]=(counts[id]||0)+1;if(counts[id]>3)throw Error('copies '+id);}
 if(ids.filter(id=>cards.get(id).rarity==='star').length>1)throw Error('stars '+deck.id);
 const chars=ids.filter(id=>cards.get(id).type!=='Supporter');
 const cost=chars.reduce((n,id)=>n+(id==='45'?3:Number(cards.get(id).cost||0)),0);
 const supply=ids.reduce((n,id)=>n+(cards.get(id).type==='Supporter'&&!['62','76'].includes(id)?id==='09'?2:1:0),0);
 const oldCost=deck.ids.reduce((n,id)=>n+(cards.get(id).type!=='Supporter'?(id==='45'?3:Number(cards.get(id).cost||0)):0),0);
 deck.ids=ids;deck.description=description;deck.reinforcementCost=cost;
 deck.displayCardIds=[...new Set([...expand(characters),...expand(supporters),...core])].filter(id=>ids.includes(id)).slice(0,7);
 if(!ids.includes(deck.faceCardId))deck.faceCardId=chars.find(id=>cards.get(id).rarity!=='star')||ids[0];
 report.push({id:deck.id,name:deck.name,enabled:deck.enabled!==false,characters:chars.length,supporters:40-chars.length,cost,supply,oldCost});
}
const output=source.replace(literal,JSON.stringify(decks,null,2));
if(extractArrayLiteral(output,'STARTER_DECKS')!==beforeStarter)throw Error('Starter changed');
fs.writeFileSync(path,output);
fs.writeFileSync('docs/AI_DECK_REDESIGN.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
