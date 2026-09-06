export const WARFRONT_PHASE_MS = 24 * 60 * 60 * 1000;

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
      if(!zone[team]) zone[team] = {
        uid:`warfront-ai:${event.mapCode}:${zone.id}:${team}`,
        name:`AI Commander ${event.zones.indexOf(zone) + 1}${team.toUpperCase()}`,
        isAI:true, elo:600, joinedAt:now
      };
    }
    // One random instant in each fifth of the day prevents a single burst.
    zone.aiSchedule = zone.a.isAI && zone.b.isAI
      ? Array.from({length:5}, (_, index)=>now + Math.floor((index + .1 + random() * .8) * WARFRONT_PHASE_MS / 5))
      : [];
  }
  return event;
}

export function warfrontDueMatch(event, now){
  if(event?.status !== 'active') return null;
  for(const zone of event.zones){
    const index = warfrontPlayed(zone);
    if(index >= 5 || zone.activeMatch) continue;
    if(zone.a?.isAI && zone.b?.isAI && Number(zone.aiSchedule?.[index]) <= now){
      return {zone, index, deadline:false};
    }
    // Human fronts are untouched until the battle deadline. Only unplayed
    // slots receive an administrative random result; real results survive.
    if(now >= event.endsAt && (zone.a?.isAI || zone.b?.isAI)){
      return {zone, index, deadline:true};
    }
  }
  return null;
}
