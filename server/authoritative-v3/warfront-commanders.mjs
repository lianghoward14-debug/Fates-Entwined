import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {extractArrayLiteral}=require('../fate-deck-catalog.js');
let cached;

export function warfrontCommanderProfiles(){
  if(!cached){
    const source=fs.readFileSync(new URL('../../src/scripts/04-game-setup.js',import.meta.url),'utf8');
    const opponents=vm.runInNewContext(`(${extractArrayLiteral(source,'AI_OPPONENTS')})`,Object.create(null),{timeout:1000});
    cached=opponents.filter(p=>p.name && p.img).map(p=>({
      aiProfileId:`preset:${p.name}`,name:p.name,photo:p.img,
      elo:Number(p.elo),style:p.style,rank:p.rank
    }));
    if(!cached.length)throw new Error('Warfront requires existing AI commander profiles');
  }
  return cached;
}

// Keep Warfront seat UIDs: matches, rewards and archives refer to those IDs.
// Only unnamed AI seats are upgraded; human and existing named seats survive.
export function assignWarfrontCommanderProfiles(event){
  if(!event)return false;
  const profiles=warfrontCommanderProfiles();
  let hash=0;
  for(const c of String(event.mapCode || event.sequence || 'warfront'))hash=(hash*31+c.charCodeAt(0))>>>0;
  const used=new Set((event.zones || []).flatMap(z=>[z.a?.aiProfileId,z.b?.aiProfileId]).filter(Boolean));
  let changed=false,index=hash%profiles.length;
  for(const zone of event.zones || [])for(const team of ['a','b']){
    const seat=zone[team];
    if(!seat?.isAI || seat.aiProfileId || !/^AI Commander\b/i.test(String(seat.name || '')))continue;
    let chosen;
    for(let attempt=0;attempt<profiles.length;attempt++){
      const candidate=profiles[index++%profiles.length];
      if(!used.has(candidate.aiProfileId)){chosen=candidate;break;}
    }
    chosen ||= profiles[index++%profiles.length];
    Object.assign(seat,chosen);used.add(chosen.aiProfileId);changed=true;
  }
  return changed;
}
