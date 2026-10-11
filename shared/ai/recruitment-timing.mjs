import {personalityFor} from './personality.mjs';
import {SUPPORT_COMPANY_CATEGORIES} from '../support-company.mjs';

const rolesById=new Map();
for(const category of SUPPORT_COMPANY_CATEGORIES)for(const id of category.cardIds){
  if(!rolesById.has(id))rolesById.set(id,new Set());
  rolesById.get(id).add(category.id);
}
export function recruitmentRoles(card){return rolesById.get(String(card?.id)) || new Set();}
const preferences=style=>typeof style==='object'?{...personalityFor(),...style}:personalityFor(style);

// Value the flexibility of a saved, once-per-match recruit. Composition uses
// counts only: never the order of upcoming draws or the opponent's deck.
export function callToArmsReserveValue({hand=[],deck=[],turn=1,maxTurns=20,style='balanced',
  placements=2,open=9,margins=[],morale=200,incoming=0,drawAvailable=false,handLimit=12,reinforcement=0}={}){
  const p=preferences(style);
  const remaining=Math.max(0,Number(maxTurns)-Number(turn));
  if(!hand.length || remaining<=1)return 0;
  const supporters=hand.filter(c=>c.type==='Supporter').length;
  const composition=[...hand,...deck];
  const expensive=composition.filter(c=>Number(c.cost)>=3).length/Math.max(1,composition.length);
  const supporterDensity=composition.filter(c=>c.type==='Supporter').length/Math.max(1,composition.length);
  // Character-heavy decks need fuel earlier; hands already rich in Supporters
  // can develop naturally and preserve the recruit for a missing answer.
  const fuelShortage=supporters<2 && expensive>=.3 && reinforcement<3;
  const readiness=Math.min(1,hand.length/4)*(fuelShortage?.2:supporters>=2?1:.55);
  const patience=Math.max(.35,1+(p.resources-1)*1.8+(p.preservation-1)*1.5+(p.risk-.3)-(p.pressure-1)*2);
  const winning=margins.filter(m=>m>0).length,losing=margins.filter(m=>m<0).length;
  const safeLead=winning>=2 && losing===0?8*p.preservation:0;
  const pressure=Math.min(.8,Math.max(0,incoming)/Math.max(1,morale));
  const stranded=placements<=0 || open<=0?12:0;
  const overflow=hand.length>=handLimit?14:0;
  const alternatives=drawAvailable?10*p.resources:0;
  return ((18+supporterDensity*12)*readiness*patience+safeLead+stranded+overflow+alternatives)
    *(1-pressure)*Math.min(1,remaining/6);
}

export function recruitmentDeckFit(card,cards=[]){
  if(!card || !cards.length)return 0;
  const affiliation=card.affiliation || card.aff;
  const same=cards.filter(c=>(c.affiliation || c.aff)===affiliation).length;
  return (cards.some(c=>String(c.id)===String(card.id))?4:0)
    +(affiliation && same/cards.length>=.5?4:0);
}

// Contextual preferences only: effects and victory are still evaluated by
// legal simulation. Reasons are retained for decision traces and regression QA.
export function assessRecruitment(card,context={}){
  const {hand=[],deck=[],discard=[],ownBoard=[],enemyBoard=[],margins=[],placements=2,open=9,
    reinforcement=0,handLimit=12,morale=200,maxMorale=200,incoming=0,turn=1,maxTurns=20,
    drawAvailable=false,missingComboIds=[],playable=true,style='balanced'}=context;
  const p=preferences(style),roles=recruitmentRoles(card),reasons=[];
  const add=(reason,value)=>{if(value){reasons.push({reason,value});}};
  const available=[...hand,...ownBoard],composition=[...available,...deck,...discard];
  const hasRole=role=>available.some(c=>recruitmentRoles(c).has(role));
  const future=Math.max(0,maxTurns-turn),late=future<=3;
  const support=card?.type==='Supporter',fate=Number(card?.fate ?? card?.baseFate ?? 0);
  const copies=available.filter(c=>String(c.id)===String(card?.id)).length;
  const losing=margins.filter(m=>m<0).length;
  add('deck affiliation and known package',recruitmentDeckFit(card,composition));
  add('redundant copy already available',-Math.min(12,copies*5));
  if(missingComboIds.includes(String(card?.id)))add('missing combo piece',18*p.development);
  const demand=hand.filter(c=>c.type!=='Supporter').map(c=>Number(c.cost)||0);
  const deficit=demand.length?Math.max(0,Math.min(...demand)-reinforcement):0;
  const handFuel=hand.filter(c=>c.type==='Supporter' && !['62','76'].includes(String(c.id))).length;
  if(support && !['62','76'].includes(String(card?.id)) && deficit>handFuel){
    add('fuel for stranded characters',(deficit-handFuel<=2?12:6)*p.development);
  }
  if(support && handFuel>=Math.max(2,placements))add('supporter supply already covers this turn',-7*p.resources);
  if(!support && Number(card?.cost)>reinforcement+Math.min(handFuel,placements))add('cannot fund this character soon',-14);
  if(roles.has('draw')){
    add('hand running out',hand.length<=2 && deck.length?12*p.resources:0);
    add('draw engine already accessible',drawAvailable?-9:0);
    add('little time to use extra draws',late?-10:0);
    add('deck exhausted',!deck.length?-14:0);
  }
  if(roles.has('recycle'))add(discard.length?'recover spent resources':'no discard targets',discard.length?Math.min(10,discard.length*2)*p.resources:-12);
  if(roles.has('remove') || roles.has('weaken') || roles.has('disrupt')){
    add(enemyBoard.length?'answer visible enemy pressure':'no visible enemy target',enemyBoard.length?(losing?12:5)*p.disruption:-9);
    if(enemyBoard.length && !hasRole('remove') && !hasRole('disrupt'))add('missing interaction',5*p.disruption);
  }
  if(roles.has('protect')){
    add('protect developed board',ownBoard.length && enemyBoard.length?Math.min(9,ownBoard.length*2)*p.preservation:0);
    add('Morale recovery need',morale<maxMorale*.5 && incoming>0?8*p.preservation:0);
    add('no developed board or Morale need',!ownBoard.length && morale>=maxMorale? -7:0);
  }
  if(roles.has('morale'))add('pressure-oriented personality',8*(p.pressure-1));
  if(roles.has('power') || roles.has('deploy'))add('development-oriented personality',8*(p.development-1));
  const swing=margins.some(m=>m<0 && m+fate>0);
  if(swing)add('can contest a losing zone',(late?12:7)*p.zones);
  if(margins.length && margins.every(m=>m>=0) && margins.filter(m=>m>0).length>=2)
    add('already controls the board',-6*p.preservation);
  if(incoming>=morale && morale>0 && playable)add('urgent survival pressure',12*p.preservation);
  if(drawAvailable)add('try existing card access first',-5*p.resources);
  if(hand.length>=handLimit)add('recruitment forces a discard',-18*p.resources);
  if(!playable || (support && (placements<=0 || open<=0)))add('no immediate deployment route',late?-35:-18);
  return {score:reasons.reduce((n,r)=>n+r.value,0),reserve:callToArmsReserveValue(context),reasons};
}
