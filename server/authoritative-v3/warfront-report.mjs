// Shared campaign reports must retain the same statistics and commendations
// shown by the tactical map, including completed forfeit continuations.
export function warfrontReportStats(zones){
  const rows=[];
  for(const zone of zones)for(const match of zone.matches||[]){
    if(match.voidedByForfeit||match.commendationExcluded||(match.forfeitSweep&&!match.continuationCompleted))continue;
    for(const team of ['a','b']){
      const player=zone[team];if(!player)continue;
      const stats=match.playerStats?.[team]||(team===match.winnerTeam?match.stats:null)||{};
      rows.push({uid:player.uid,name:player.name,photo:player.photo,team,
        totalFateGenerated:Number(stats.totalFateGenerated)||0,fateDifferential:Number(stats.fateDifferential)||0,
        consolidations:Number(stats.consolidations)||0,durationMs:team===match.winnerTeam?(Number(stats.durationMs)||0):0});
    }
  }
  const duration=ms=>{const seconds=Math.floor(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
  const achievements=[
    ['fate','∆','Decisive Force','Highest cumulative Fate differential','fateDifferential','sum'],
    ['speed','⌁','Lightning Victory','Fastest match victory','durationMs','min'],
    ['consolidation','◇','Master of Position','Most total consolidations','consolidations','sum']
  ].map(([id,icon,name,copy,metric,mode])=>{
    const values=new Map();
    for(const row of rows){
      if(mode==='min'&&!row[metric])continue;
      const entry=values.get(row.uid)||{uid:row.uid,name:row.name,photo:row.photo,team:row.team,value:mode==='min'?Infinity:0};
      entry.value=mode==='min'?Math.min(entry.value,row[metric]):entry.value+row[metric];values.set(row.uid,entry);
    }
    const ranked=[...values.values()].filter(x=>Number.isFinite(x.value)).sort((a,b)=>mode==='min'?a.value-b.value:b.value-a.value);
    const top=ranked[0],tied=!!top&&ranked.filter(x=>x.value===top.value).length>1;
    return {id,icon,name,copy,metric,mode,leader:tied?null:top,tied,
      display:top?(id==='speed'?duration(top.value):id==='fate'?'+'+top.value+' Fate':top.value+' consolidations'):'Awaiting first result'};
  });
  const playerStats=uid=>{
    const own=rows.filter(x=>x.uid===uid),sum=field=>own.reduce((n,x)=>n+x[field],0),max=field=>own.reduce((n,x)=>Math.max(n,x[field]),0);
    return {totalFate:sum('totalFateGenerated'),fate:sum('fateDifferential'),highestFate:max('totalFateGenerated'),highestDifferential:max('fateDifferential'),consolidations:sum('consolidations'),highestConsolidations:max('consolidations'),fastest:own.filter(x=>x.durationMs).reduce((n,x)=>Math.min(n,x.durationMs),Infinity)};
  };
  return {achievements,playerStats};
}
