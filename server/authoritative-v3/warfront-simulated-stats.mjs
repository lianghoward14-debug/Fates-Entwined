// Lightweight AI report generation; these results participate in commendations.
export function addWarfrontSimulatedStats(match){
  if(match.simulationKind!=='strength-probability')return match;
  match.commendationExcluded=false;
  if(match.statsSource==='simulated')return match;
  let seed=2166136261;
  for(const ch of String(match.id))seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const advantage=Math.abs((Number(match.winProbabilityA)||.5)-.5)*2;
  const durationMs=Math.round((360+random()*600-advantage*120))*1000;
  const losingFate=Math.round(45+random()*120);
  const margin=Math.round(8+random()*55+advantage*40);
  const playerStats={};
  for(const team of ['a','b'])playerStats[team]={
    totalFateGenerated:losingFate+(team===match.winnerTeam?margin:0),
    fateDifferential:team===match.winnerTeam?margin:0,
    consolidations:Math.round(4+random()*12),durationMs
  };
  return Object.assign(match,{statsSource:'simulated',commendationExcluded:false,playerStats,stats:{...playerStats[match.winnerTeam]}});
}
