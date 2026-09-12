import {assignWarfrontCommanderProfiles} from './warfront-commanders.mjs';
export const WARFRONT_PHASE_MS = 24 * 60 * 60 * 1000;
const AI_SCHEDULE_VERSION = 2;

export function scheduleWarfrontAI(event, now){
  const zones=(event.zones || []).filter(z=>z.a?.isAI && z.b?.isAI);
  const slots=[];
  // Interleave fronts, rather than giving each front independent random times.
  for(let index=0;index<5;index++)for(const zone of zones){
    if(index>=warfrontPlayed(zone))slots.push({zone,index});
  }
  const remaining=Math.max(0,Number(event.endsAt)-now);
  const interval=Math.min(WARFRONT_PHASE_MS/25,remaining/Math.max(1,slots.length));
  for(const zone of zones)zone.aiSchedule=[];
  slots.forEach(({zone,index},i)=>{zone.aiSchedule[index]=now+Math.floor((i+1)*interval);});
  event.aiScheduleVersion=AI_SCHEDULE_VERSION;
}

export function warfrontPlayed(zone){
  return (zone.matches || []).filter(match=>!match.voidedByForfeit)
    .reduce((sum, match)=>sum + Math.max(1, Math.min(5, Number(match.starValue) || 1)), 0);
}

export function startWarfrontBattle(event, now, random = Math.random){
  event.status = 'active';
  event.startedAt = now;
  event.endsAt = now + WARFRONT_PHASE_MS;
  event.lastResult = null;
  for(const zone of event.zones){
    for(const team of ['a','b']){
      if(event.humanOnly === true && zone[team]?.isAI) zone[team] = null;
      if(!zone[team] && event.humanOnly !== true) zone[team] = {
        uid:`warfront-ai:${event.mapCode}:${zone.id}:${team}`,
        name:`AI Commander ${event.zones.indexOf(zone) + 1}${team.toUpperCase()}`,
        isAI:true, elo:600, joinedAt:now
      };
    }
    zone.aiSchedule = [];
  }
  scheduleWarfrontAI(event,now);
  assignWarfrontCommanderProfiles(event);
  return event;
}

export function warfrontDueMatch(event, now){
  if(event?.status !== 'active' || event.humanOnly === true) return null;
  if(event.aiScheduleVersion!==AI_SCHEDULE_VERSION)scheduleWarfrontAI(event,now);
  let earliest=null;
  for(const zone of event.zones){
    const index=warfrontPlayed(zone);
    if(index<5 && zone.a?.isAI && zone.b?.isAI && !Number.isFinite(Number(zone.aiSchedule?.[index]))){
      zone.aiSchedule ||= [];
      for(let slot=index;slot<5;slot++)zone.aiSchedule[slot]=now+(slot-index)*WARFRONT_PHASE_MS/25;
    }
    if(Number(zone.aiRetryAt||0)>now)continue;
    const at=Number(zone.aiSchedule?.[index]);
    if(index<5 && !zone.activeMatch && zone.a?.isAI && zone.b?.isAI && at<=now && (!earliest || at<earliest.at))earliest={zone,index,deadline:false,at};
  }
  if(earliest){const {at,...due}=earliest;return due;}
  for(const zone of event.zones){
    const index = warfrontPlayed(zone);
    if(index >= 5 || zone.activeMatch) continue;
    // Human fronts are untouched until the battle deadline. Only unplayed
    // slots receive an administrative random result; real results survive.
    if(now >= event.endsAt && (zone.a?.isAI || zone.b?.isAI)){
      return {zone, index, deadline:true};
    }
  }
  return null;
}

export function prepareWarfrontRoster(event){
  event.service ||= {};
  event.waitingAI ||= [];
  for(const zone of event.zones){
    for(const match of zone.matches || []) match.participants ||= structuredClone({a:zone.a,b:zone.b});
    for(const team of ['a','b']) for(const player of [zone[team],...(zone.matches||[]).map(m=>m.participants?.[team])]) if(player && !player.isAI){
      const entry=event.service[player.uid] ||= {...structuredClone(player),team,zoneId:zone.id,matchIds:[]};
      for(const match of zone.matches||[]) if(!match.simulated && match.participants?.[team]?.uid===player.uid && !entry.matchIds.includes(match.id)) entry.matchIds.push(match.id);
    }
  }
}
export function relocateWarfrontAI(event){
  if(event.humanOnly === true){event.waitingAI=[];return;}
  for(let i=0;i<(event.waitingAI||[]).length;){
    const {player,team}=event.waitingAI[i];
    // Prefer an unfinished front, but an empty settled front is still an
    // available post. Occupying it never reopens its completed matches.
    const available=z=>!z[team]&&!z.activeMatch;
    const zone=event.zones.find(z=>available(z)&&warfrontPlayed(z)<5)||event.zones.find(available);
    if(!zone){i++;continue;}
    zone[team]=player;event.waitingAI.splice(i,1);
    if(zone.a?.isAI&&zone.b?.isAI&&!zone.aiSchedule?.length)scheduleWarfrontAI(event,Date.now());
  }
}
export function releaseWarfrontPlayers(event,zone,binding,matchId){
  prepareWarfrontRoster(event);
  for(const team of ['a','b']){
    const player=binding.participants[team];
    if(!player||player.isAI)continue;
    const entry=event.service[player.uid] ||= {...structuredClone(player),team,zoneId:zone.id,matchIds:[]};
    if(!entry.matchIds.includes(matchId))entry.matchIds.push(matchId);
    if(zone[team]?.uid===player.uid)zone[team]=null;
  }
  binding.settled=true;
  relocateWarfrontAI(event);
}
