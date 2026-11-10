import {controllerOf} from '../engine/selectors.mjs';
import {effectiveFate,effectiveReinforcement,isEffectSourceSuppressed} from '../engine/modifiers.mjs';

// Composition recognition also covers copied public decks and monthly AI decks.
export function createNewPublicDeckPrior(state,player,entries,cards){
  const owner=state.players[player],hand=owner.hand||[],deck=owner.deck||[],grave=owner.discard||[];
  const own=entries.filter(e=>controllerOf(e.card)===player);
  const known=[...(owner.originalDeck||[]),...hand,...deck,...grave,...own.map(e=>e.card)];
  const ids=new Set(known.map(c=>String(c?.id||c)));
  const elite=['109','113','115','111','117'].every(id=>ids.has(id));
  const bubble=['bh19','bh13','120','94','69'].every(id=>ids.has(id));
  if(!elite&&!bubble)return ()=>0;
  const live=own.filter(e=>!e.card.faceDown&&!isEffectSourceSuppressed(state,e));
  const held=id=>hand.some(c=>c.id===id);
  const active=id=>live.filter(e=>e.card.id===id);
  const source=cards.get(state.pendingPrompt?.sourceIid);
  const doubled=(state.statuses||[]).some(s=>s.type==='PERMANENT_FATE_GAIN_POTENCY'
    && Number(s.playerIndex)===player&&Number(s.remainingOwnerTurns)>0);
  const covert=(state.statuses||[]).some(s=>s.type==='SABOTEUR_FIELD_VEIL'&&Number(s.playerIndex)===player);
  const invested=deck.some(c=>Number(c.currentFate??c.baseFate??c.fate)>Number(c.baseFate??c.fate));
  const morale=Number(state.moralePressure?.morale?.[player]??200);
  const fuel=own.reduce((n,e)=>n+(e.card.type==='Supporter'?effectiveReinforcement(state,e,player):0),0);
  const access=c=>{
    if(!c)return 0;
    if(c.id==='79')return held('79')?0:10;
    if(elite){
      if(c.id==='109')return active('109').length?5:23;
      if(c.id==='36')return active('109').length?17:11;
      if(c.id==='117')return held('109')&&Number(state.turn)<=20?18:4;
      if(c.id==='113')return state.players[1-player].deck.length?13:0;
      if(c.id==='115')return 20; // Exactly 30 Eventide cards trigger Call to Arms.
      if(c.id==='119')return hand.length<3&&morale>35?4:-6;
      if(['09','74'].includes(c.id))return fuel<4&&held('109')?15:4;
    }
    if(bubble){
      if(c.id==='bh19')return doubled?0:held('bh13')?22:10;
      if(c.id==='bh13')return doubled?25:held('bh19')?15:8;
      if(c.id==='120')return 16;
      if(['27','32','60'].includes(c.id))return invested?17:hand.length<5?10:4;
      if(c.id==='69')return grave.some(x=>['bh13','bh19','27','13','06'].includes(x.id))&&morale>30?12:-8;
      if(c.id==='94')return Number(state.maxTurns||20)-Number(state.turn)>=5&&deck.some(x=>x.id==='bh13')?10:-5;
    }
    return 0;
  };
  return command=>{
    const p=command.payload||{},card=cards.get(p.cardIid||p.sourceIid);
    const selected=(p.selectedIids||[p.selectedIid||p.targetIid]).map(iid=>cards.get(iid)).filter(Boolean);
    let score=0;
    if(state.pendingPrompt?.type==='CARD_SELECTION'&&['06','13','60','69','94'].includes(source?.id))
      score+=selected.reduce((n,c)=>n+access(c),0);
    if(bubble&&source?.id==='bh13'&&selected.length)
      score+=selected.reduce((n,c)=>n+(['27','13','94','06','80','32','120'].includes(c.id)?12:2),0)
        +(doubled?10:0);
    if(elite&&source?.id==='113'&&p.selectedIids){
      // Only the five revealed candidates are used. Put weaker draws first.
      const revealed=new Map((state.pendingPrompt?.eligibleCards||[]).map(c=>[c.iid,c]));
      score+=p.selectedIids.reduce((n,iid,i)=>{
        const c=revealed.get(iid)||cards.get(iid);
        return n-(Number(c?.currentFate??c?.baseFate??c?.fate)||0)/(i+1);
      },0);
    }
    if(p.destination&&card){
      const z=Number(p.destination.z);
      if(elite){
        if(card.id==='117')score+=held('109')&&fuel>=3&&Number(state.turn)<=20?19:0;
        if(card.id==='109')score+=12+active('36').filter(e=>e.z===z).length*4+(covert?18:0)
          -(held('117')&&!covert&&Number(state.turn)<=20?15:0);
        if(card.id==='36')score+=active('109').filter(e=>e.z===z).length*8;
        if(card.id==='113')score+=state.players[1-player].deck.length>=3?8:0;
        if(card.id==='115')score+=15;
        if(card.id==='119')score-=hand.length>=4?9:0;
      }
      if(bubble){
        if(card.id==='bh19')score+=held('bh13')&&!doubled?21:0;
        if(card.id==='bh13')score+=doubled?24:held('bh19')?-12:0;
        if(card.id==='120')score+=14;
        if(['27','32','60'].includes(card.id))score+=invested?12:0;
      }
    }
    for(const iid of p.tributeIids||[]){
      const tribute=cards.get(iid);
      if(elite&&tribute?.id==='109')score-=25;
      if(bubble&&tribute?.id==='bh19'&&held('bh13'))score-=20;
    }
    return score;
  };
}
