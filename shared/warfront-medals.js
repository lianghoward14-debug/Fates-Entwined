// Warfront achievement medals 51–100. Loaded by the browser and Node tests.
(function(root){
  'use strict';
  const catalog=[];
  function add(name,description,rule,threshold,emblem,metal,ribbon,shape='round'){
    const id=51+catalog.length;
    catalog.push({id,name,description,rule,threshold,emblem,metal,ribbon,shape,
      image:'assets/medals/achievement/medal-'+id+'.svg'});
  }
  [10,25,50,100,250].forEach((n,i)=>add(['The Tenth Muster','Campaigner’s Seal','The Half-Century Watch','Centurion of the Front','The Endless Vigil'][i],`Complete ${n} Warfront campaigns.`,'participations',n,['standard','compass','tower','laurel','hourglass'][i],i%2?'silver':'gold',['charcoal','ivory','navy','crimson','charcoal'][i],i%2?'shield':'round'));
  [1,3,20,75,100].forEach((n,i)=>add(['First Alliance Triumph','The Triple Accord','Order of Twenty Victories','The Seventy-Fifth Laurel','The Century Crown'][i],`Win ${n} Warfront campaign${n===1?'':'s'}.`,'campaignWins',n,['sword','knots','crown','laurel','crownstar'][i],i===1?'silver':'gold',['crimson','navy','ivory','crimson','navy'][i],i===4?'shield':'round'));
  [1,2,3,4,5].forEach((n,i)=>add(['The Opening Advance','Twin Spear Citation','The Threefold Assault','The Fourth Standard','The Fivefold Offensive'][i],`Personally win ${n} completed, non-forfeit match${n===1?'':'es'} in one Warfront campaign.`,'campaignMatchWins',n,['spear','crossedspears','tridents','standard','fivestars'][i],i%2?'silver':'gold',['navy','crimson','charcoal','ivory','navy'][i]));
  [50,100,150,200,300].forEach((n,i)=>add(['Fatekindled Star','The Hundredfold Flame','The Rising Constellation','Order of the Fatewell','The Boundless Sun'][i],`Win a non-forfeit Warfront match with at least ${n} total Fate.`,'fate',n,['star','flame','constellation','chalice','sun'][i],i%2?'silver':'gold',['crimson','navy','ivory','charcoal','crimson'][i]));
  [10,25,50,75,100].forEach((n,i)=>add(['The Keen Edge','The Sundering Spear','The Broken Gate','The Crushing Advance','Order of Overwhelming Force'][i],`Win a non-forfeit Warfront match by at least ${n} Fate.`,'differential',n,['sword','spear','gate','fist','lightning'][i],i%2?'silver':'gold',['charcoal','crimson','navy','ivory','crimson'][i],i===2?'square':'round'));
  [3,5,10,15,20].forEach((n,i)=>add(['The First Formation','The Anchored Line','The Interlocking Front','The Iron Formation','Architect of Victory'][i],`Win a non-forfeit Warfront match with at least ${n} consolidations.`,'consolidations',n,['diamonds','anchor','knots','shield','castle'][i],i%2?'gold':'silver',['ivory','navy','charcoal','crimson','navy'][i],i===4?'shield':'round'));
  [300000,180000,60000].forEach((n,i)=>add(['The Swift Dispatch','The Thunderbolt Advance','The Fleeting Hour'][i],`Win a non-forfeit Warfront match using no more than ${n/60000} minute${n===60000?'':'s'} of your own recorded turn-clock time.`,'speed',n,['wing','lightning','hourglass'][i],i===1?'gold':'silver',['navy','crimson','charcoal'][i]));
  add('The Forged Position','Win a non-forfeit Warfront match with at least 100 Fate and 5 consolidations.','balanced',1,'anvil','gold','ivory','square');
  add('The Decisive Formation','Win a non-forfeit Warfront match by at least 50 Fate with at least 10 consolidations.','decisive',1,'shieldstar','silver','crimson','shield');
  ['north-gate','silver-crossing','heartland','sunken-road','crown-reach'].forEach((zone,i)=>add(['Northern Sentinel','The Bridgekeeper','Heartland Defender','The Roadward Star','The High Reach Standard'][i],`Win a non-forfeit Warfront match on front ${String(i+1).padStart(2,'0')} (${['North Gate','Silver Crossing','Heartland','Sunken Road','Crown Reach'][i]} position, across any map).`,'zone',zone,['tower','bridge','heart','road','standard'][i],i%2?'silver':'gold',['charcoal','navy','crimson','ivory','navy'][i],i%2?'round':'shield'));
  ['fate','speed','consolidation'].forEach((award,i)=>add(['The Unrivaled Edge','The Unrivaled Hour','The Unrivaled Position'][i],`Finish a Warfront campaign as the sole ${['Decisive Force','Lightning Victory','Master of Position'][i]} commendation leader.`,'commendation',award,['swordstar','wingstar','diamondstar'][i],i===1?'silver':'gold',['crimson','navy','charcoal'][i]));
  add('The Supreme Triad','Finish one Warfront campaign as the sole leader of all three commendations.','commendationCount',3,'triad','gold','ivory','shield');
  add('The Twin Distinction','Finish one Warfront campaign as the sole leader of at least two commendations.','commendationCount',2,'twinstars','silver','navy');
  add('The Stainless Campaign','Finish one Warfront campaign with exactly five recorded personal matches, all non-forfeit victories.','perfect',5,'laurelstar','gold','ivory');
  add('Pillar of the Alliance','Win a Warfront campaign and personally win at least three non-forfeit matches in it.','pillar',3,'pillar','silver','crimson','square');
  add('The Five-Front Dominion','Win a Warfront campaign in which your alliance controls all five fronts; personally win at least one non-forfeit match.','dominion',5,'fiveflags','gold','navy','shield');
  add('The Narrow Triumph','Win a Warfront campaign by exactly one final score point; personally win at least one non-forfeit match.','narrow',1,'scales','silver','charcoal');
  add('The Sovereign Campaign','Win a Warfront campaign, personally win five non-forfeit matches, and finish as sole leader of at least one commendation.','sovereign',5,'sovereign','gold','crimson','shield');
  const num=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  function matchValues(match,team,zoneId){
    if(!match||match.winnerTeam!==team||match.voidedByForfeit||match.forfeitSweep||match.commendationExcluded||match.forfeit||match.simulationKind||match.statsSource==='simulated')return null;
    const s=match.playerStats?.[team]||match.stats||{};
    return {fate:num(s.totalFateGenerated),differential:num(s.fateDifferential),consolidations:num(s.consolidations),speed:num(s.durationMs),zone:zoneId};
  }
  function matchEligible(m,v){
    if(!v)return false;
    if(['fate','differential','consolidations'].includes(m.rule))return v[m.rule]>=m.threshold;
    if(m.rule==='speed')return v.speed>0&&v.speed<=m.threshold;
    if(m.rule==='zone')return v.zone===m.threshold;
    if(m.rule==='balanced')return v.fate>=100&&v.consolidations>=5;
    if(m.rule==='decisive')return v.differential>=50&&v.consolidations>=10;
    return false;
  }
  function evaluateMatch(match,team,zoneId){const v=matchValues(match,team,zoneId);return catalog.filter(m=>matchEligible(m,v)).map(m=>m.id);}
  function evaluateCampaign(profile,result,uid){
    const mine=result.players?.find(p=>p.uid===uid);if(!mine||mine.isAI)return [];
    const team=mine.team,won=result.winner===team,zones=result.zones||[],own=[];
    for(const z of zones)for(const match of z.matches||[])if(match.participants?.[team]?.uid===uid)own.push({match,zone:z.id,value:matchValues(match,team,z.id)});
    const victories=own.filter(x=>x.value),wins=victories.length;
    const honors=(result.achievements||[]).filter(a=>!a.tied&&a.leader?.uid===uid).map(a=>a.id);
    const controls=zones.length===5&&zones.every(z=>{const scores={a:0,b:0};for(const m of z.matches||[])if(!m.voidedByForfeit&&['a','b'].includes(m.winnerTeam))scores[m.winnerTeam]+=Math.max(1,Math.min(5,num(m.starValue)||1));return scores[team]>=3&&scores[team]>scores[team==='a'?'b':'a'];});
    return catalog.filter(m=>{
      switch(m.rule){
        case 'participations':return num(profile.warfrontParticipations)>=m.threshold;
        case 'campaignWins':return num(profile.warfrontWins)>=m.threshold;
        case 'campaignMatchWins':return wins>=m.threshold;
        case 'commendation':return honors.includes(m.threshold);
        case 'commendationCount':return new Set(honors).size>=m.threshold;
        case 'perfect':return own.length===5&&wins===5;
        case 'pillar':return won&&wins>=3;
        case 'dominion':return won&&wins>0&&controls;
        case 'narrow':return won&&wins>0&&Math.abs(num(result.score?.a)-num(result.score?.b))===1;
        case 'sovereign':return won&&wins>=5&&honors.length>0;
        default:return victories.some(x=>matchEligible(m,x.value));
      }
    }).map(m=>m.id);
  }
  function unlock(profile,ids){
    profile.ownedMedals=[...new Set((profile.ownedMedals||[]).map(Number).filter(id=>Number.isInteger(id)&&id>=1&&id<=100))];
    profile.displayedMedals=[...new Set((profile.displayedMedals||[]).map(Number))].filter(id=>profile.ownedMedals.includes(id)).slice(0,3);
    const added=[];for(const id of ids)if(Number.isInteger(id)&&id>=51&&id<=100&&!profile.ownedMedals.includes(id)){profile.ownedMedals.push(id);added.push(id);if(profile.displayedMedals.length<3)profile.displayedMedals.push(id);}return added;
  }
  const api={catalog,evaluateMatch,evaluateCampaign,unlock};
  root.FateWarfrontMedals=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
