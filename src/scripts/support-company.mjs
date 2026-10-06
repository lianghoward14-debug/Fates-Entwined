import {SUPPORT_COMPANY_NAMES, supportCompanyCardEligible, supportCompanyAvailability, createSupportCompanyPool} from '../../shared/support-company.mjs';
import {playSupportCompanyAnimation} from './support-company-animation.mjs?v=20260921-vignette';

const escape = value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy = false;
const seenEvents = new Set();

function context(player){
  const game = typeof G !== 'undefined' ? G : null;
  if(!game) return null;
  const authority = window.fatePhase7SupportCompany?.();
  const local = window.FateAuthorityV3SinglePlayer?.currentScreen?.();
  const view = local?.view;
  const state = authority?.state || view?.state;
  const uses = state?.supportCompanyUses || game._supportCompanyUses || [0,0];
  const morale = state?.moralePressure?.morale?.[player] ?? game._moralePressure?.morale?.[player];
  const enabled = state ? state.gameSettings?.healthPressureSeals === true
    : window.FATE_MORALE_PRESSURE_RULES_ENABLED === true && game._freePlayGameSettings?.healthPressureSeals !== false;
  const own = typeof isPerspectivePlayer === 'function' ? isPerspectivePlayer(player) : player === game.currentPlayer;
  const active = state ? state.activePlayer === player && state.phase === 'main' && !state.outcome && !state.pendingPrompt && !state.pendingHandLimit
    : game.currentPlayer === player && game.phase === 'main' && !game._endgameResolved && !game._reactionPending
      && !game.pendingEffect && !game._consolidating && !game._handLimitDiscard && !game._whenSetEffectsResolving;
  const commands = authority?.commands || view?.legalCommands;
  const available = supportCompanyAvailability(uses[player], morale, enabled);
  const browseAvailable = {...available};
  if(commands){
    available.call = commands.some(c=>c.type==='SUPPORT_COMPANY' && c.payload.ability==='call');
    available.desperate = commands.some(c=>c.type==='SUPPORT_COMPANY' && c.payload.ability==='desperate');
  }else if(game._onlineRoomCode){available.call=false;available.desperate=false;}
  return {game, player, own, active:active && !busy, uses:Number(uses[player] || 0), morale, available, browseAvailable, pool:state?.supportCompanyPool, authority, local, commands};
}

window.buildSupportCompanyPanel = function(player){
  const c=context(player);if(!c)return '';
  const button=ability=>{
    const disabled=!c.own || !c.browseAvailable[ability] || busy;
    const desperate=ability==='desperate';
    const icon=desperate?'<path d="M23 39h18l-3 8H26zM28 47v10h8V47M32 7c3 10 14 13 14 23a14 14 0 0 1-28 0c0-7 5-12 8-16-1 9 3 10 5 11 4-5 3-12 1-18zM31 28c-5 5-6 9 1 11 7-2 6-6 2-10M13 10l-5-5m43 5 5-5M9 25H3m52 0h6"/>':'<path d="M12 29h11L47 17v30L23 35H12zM12 26v12M47 14v36M22 35l5 15h8l-6-12M53 24l6-4m-6 12h8m-8 8 6 4"/>';
    const description=desperate?'Once per game, after using Call to Arms, add another card from this game’s pool by paying half your morale.':'Once per game, choose a card from a random pool of 10 supporters and 5 characters. Only spent when you confirm.';
    return `<button type="button" class="sc-order ${desperate?'sc-desperate':'sc-call'}" ${disabled?'disabled':''} onclick="openSupportCompany('${ability}',${Number(player)})"><span class="sc-mini" aria-hidden="true"><svg viewBox="0 0 64 64">${icon}</svg></span><span class="sc-order-content"><strong>${SUPPORT_COMPANY_NAMES[ability]}</strong><span class="sc-description">${description}</span></span></button>`;
  };
  return `<section class="sc-panel" aria-label="Support Company"><div class="sc-heading"><h2>Support Company</h2></div><div class="sc-orders">${button('call')}${button('desperate')}</div></section>`;
};

window.presentSupportCompanyUse = function(event, key=''){
  if(key && seenEvents.has(key))return Promise.resolve();
  if(key){seenEvents.add(key);if(seenEvents.size>200)seenEvents.delete(seenEvents.values().next().value);}
  const ability=event.ability==='desperate'?'desperate':'call';
  const playerLabel=typeof G !== 'undefined' ? G.players?.[event.playerIndex]?.name || '' : '';
  const variant=ability==='call'?'call-crossed':'desperate-shield';
  return playSupportCompanyAnimation({variant,playerLabel});
};

window.openSupportCompany = function(ability,player){
  const original=context(player);
  if(!original?.own || !original.browseAvailable[ability] || busy)return;
  if(typeof window.playFateSfxOnce === 'function'){
    window.playFateSfxOnce('uiClick', `support-company-${ability}`, 120);
  }else if(typeof playSfx === 'function'){
    playSfx('uiClick');
  }
  const game=original.game;
  if(!original.commands) game._supportCompanyPool ||= createSupportCompanyPool(typeof CARDS!=='undefined'?CARDS:[]);
  const cards=(typeof CARDS!=='undefined'?CARDS:[]).filter(supportCompanyCardEligible).filter(card=>
    original.commands ? (original.pool || original.commands.filter(c=>c.type==='SUPPORT_COMPANY').map(c=>String(c.payload.cardId))).includes(String(card.id)) : game._supportCompanyPool.includes(String(card.id)));
  if(!cards.length)return;
  const cost=ability==='desperate'?original.available.cost:0;
  pickCardsVisual(cards,{
    title:SUPPORT_COMPANY_NAMES[ability],
    subtitle:(original.active?'':'Browse now; select a card on your turn. ') + (ability==='desperate'?`Pay ${cost} Morale (${original.morale} → ${original.morale-cost}). Add one card privately.`:'Free once per game. Add one card privately.'),
    canSelect:()=>{const c=context(player);return c?.game===game && c.own && c.active && c.available[ability];},
    minCount:1,maxCount:1,allowCancel:true,confirmLabel:ability==='desperate'?`Pay ${cost} Morale`:'Call to Arms',
    // This picker builds a SUPPORT_COMPANY command, not a legacy picker action.
    authoritativeDirectAction:true,
    viewerPlayerIndex:player,immediate:true
  },async chosen=>{
    if(!chosen?.length || busy)return;
    const c=context(player),card=chosen[0];
    if(c?.game!==game || !c.own || !c.active || !c.available[ability] || !cards.includes(card) || !supportCompanyCardEligible(card))return;
    // A changed Morale total needs a refreshed price, not a silent larger payment.
    if(ability==='desperate' && c.available.cost!==cost){window.openSupportCompany(ability,player);return;}
    busy=true;
    try{
      if(c.authority){
        await window.fatePhase7UseSupportCompany(ability,card.id);
        return;
      }
      if(c.local){
        const command=c.commands.find(x=>x.type==='SUPPORT_COMPANY'&&x.payload.ability===ability&&x.payload.cardId===card.id);
        if(command)await c.local.submit(command);
        return;
      }
      if(game._onlineRoomCode)return;
      const instance=createCardInstance(card,player);
      game._supportCompanyUses ||= [0,0];
      game._supportCompanyUses[player]++;
      if(cost)game._moralePressure.morale[player]-=cost;
      // This is a reserve arrival, not a search or draw; do not expose the card.
      addCardToHand(player,instance,{arrivalKind:'support-company',announce:false,animate:false,skipHandLimit:true});
      closeModal();
      if(typeof log==='function')log('sys',`${game.players[player].name} used ${SUPPORT_COMPANY_NAMES[ability]}.`);
      await window.presentSupportCompanyUse({ability,playerIndex:player});
      if(typeof G==='undefined'||G!==game)return;
      window.refreshLegacyMoralePressure?.({announce:false});
      renderGame({hand:true,piles:true,scores:true,topbar:true});
      if(cost && game._moralePressure.morale[player]<=0)checkWin();
      else if(typeof enforceHandLimit==='function')enforceHandLimit(player);
    }finally{busy=false;}
  });
};

