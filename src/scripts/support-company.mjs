import {pickRoyalSeal} from './support-company-royal-seal.mjs?v=20261011-presentation-order';
import {callToArmsReserveValue,recruitmentDeckFit,assessRecruitment} from '../../shared/ai/recruitment-timing.mjs';
window.FateAIRecruitmentTiming={callToArmsReserveValue,recruitmentDeckFit,assessRecruitment};
import {SUPPORT_COMPANY_NAMES, supportCompanyCardEligible, supportCompanyAvailability, createSupportCompanyPool, SUPPORT_COMPANY_CATEGORIES, supportCompanyOffers} from '../../shared/support-company.mjs';
import {playSupportCompanyAnimation} from './support-company-animation.mjs?v=20261008-selected-title';

const escape = value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categoryPaths={"power": "M12 3v18M3 12h18M6 6l12 12M6 18L18 6", "weaken": "M4 5l8 14 8-14M6 5h12M8 12h8", "remove": "M5 5l14 14M19 5L5 19M4 9V4h5M15 20h5v-5", "disrupt": "M14 2L5 14h7l-2 8 9-13h-7z", "protect": "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12h8M12 8v8", "draw": "M4 5h11v15H4zM9 2h11v15M7 10h5M7 14h5", "recycle": "M4 10a8 8 0 0114-4l2 3M20 3v6h-6M20 14a8 8 0 01-14 4l-2-3M4 21v-6h6", "deploy": "M12 20V4M6 10l6-6 6 6M3 17v4h18v-4", "position": "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4", "morale": "M12 21S2 15 2 8a5 5 0 0110-2A5 5 0 0122 8c0 7-10 13-10 13M5 12h4l2-4 3 8 2-4h3", "tactics": "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"};
const categoryIcon=id=>`<span class="sc-category-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${categoryPaths[id]||categoryPaths.tactics}"/></svg></span>`;
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
  return {game, player, own, active:active && !busy, uses:Number(uses[player] || 0), morale, available, browseAvailable, state, pool:state?.supportCompanyPool, authority, local, commands};
}

window.buildSupportCompanyPanel = function(player){
  const c=context(player);if(!c)return '';
  const button=ability=>{
    const disabled=!c.own || !c.browseAvailable[ability] || busy;
    const desperate=ability==='desperate';
    const icon=desperate?'<path d="M23 39h18l-3 8H26zM28 47v10h8V47M32 7c3 10 14 13 14 23a14 14 0 0 1-28 0c0-7 5-12 8-16-1 9 3 10 5 11 4-5 3-12 1-18zM31 28c-5 5-6 9 1 11 7-2 6-6 2-10M13 10l-5-5m43 5 5-5M9 25H3m52 0h6"/>':'<path d="M12 29h11L47 17v30L23 35H12zM12 26v12M47 14v36M22 35l5 15h8l-6-12M53 24l6-4m-6 12h8m-8 8 6 4"/>';
    const description=desperate?'Once per game, after using Call to Arms, choose a category and take one of three non-Star cards by paying half your Morale.':'Choose a category, then take one of three random non-Star cards. Free once per game.';
    return `<button type="button" class="sc-order ${desperate?'sc-desperate':'sc-call'}" ${disabled?'disabled':''} onclick="openSupportCompany('${ability}',${Number(player)})"><span class="sc-mini" aria-hidden="true"><svg viewBox="0 0 64 64">${icon}</svg></span><span class="sc-order-content"><strong>${SUPPORT_COMPANY_NAMES[ability]}</strong><span class="sc-description">${description}</span></span></button>`;
  };
  return `<section class="sc-panel" aria-label="Support Company"><div class="sc-heading"><h2>Support Company</h2></div><div class="sc-orders">${button('call')}${button('desperate')}</div></section>`;
};

window.presentSupportCompanyUse = async function(event, key=''){
  if(key && seenEvents.has(key))return Promise.resolve();
  if(key){seenEvents.add(key);if(seenEvents.size>200)seenEvents.delete(seenEvents.values().next().value);}
  const game=typeof G!=='undefined'?G:null;
  if(window.waitForSupportCompanyPresentation && !await window.waitForSupportCompanyPresentation(()=>typeof G==='undefined'||G===game))return;
  const ability=event.ability==='desperate'?'desperate':'call';
  const playerLabel=typeof G !== 'undefined' ? G.players?.[event.playerIndex]?.name || '' : '';
  const variant=ability==='call'?'call-crossed':'desperate-shield';
  return playSupportCompanyAnimation({variant,playerLabel,categoryLabel:SUPPORT_COMPANY_CATEGORIES.find(c=>c.id===event.category)?.name || ''});
};

// Shared category window for normal orders and card-triggered free calls.
window.showSupportCompanyCategoryWindow = function(options){
  if(window.getSupportCompanyPresentationDelayMs?.()>0){
    const game=G;
    window.waitForSupportCompanyPresentation(()=>G===game && (!options.isCurrent || options.isCurrent())).then(ready=>{
      if(ready)window.showSupportCompanyCategoryWindow(options);
    });
    return;
  }
  const {ability='call',categories:offeredCategories=SUPPORT_COMPANY_CATEGORIES,cost=0,cancellable=true,onSelect,promptId}=options;
  let categories=offeredCategories;
  categories=categories.map(category=>({...SUPPORT_COMPANY_CATEGORIES.find(item=>item.id===category.id),...category,description:category.description || SUPPORT_COMPANY_CATEGORIES.find(item=>item.id===category.id)?.description || ''}));
  showModal(SUPPORT_COMPANY_NAMES[ability],`<section class="sc-category-window"><div class="sc-category-intro"><span>SUPPORT COMPANY · 01 / 02</span><h3>What does your battle need?</h3><p>Non-Star cards only · Your card stays private; your category is announced.</p>${ability==='desperate'?`<p class="sc-category-cost">${cost} Morale · Paid only when you choose a card</p>`:''}</div><div class="sc-category-grid">${categories.map((c,i)=>`<button type="button" class="sc-category" data-category="${c.id}">${categoryIcon(c.id)}<strong>${escape(c.name)}</strong><span>${escape(c.description)}</span><b aria-hidden="true">↗</b></button>`).join('')}</div></section>`,cancellable ? [{label:'Cancel',action:()=>closeModal()}] : [],{immediate:true});
  if(promptId){
    const picker=document.querySelector('.sc-category-window');
    if(picker)picker.dataset.phase7PromptId=String(promptId);
  }
  document.querySelectorAll('.sc-category').forEach(button=>button.addEventListener('click',()=>onSelect(button.dataset.category)));
  document.querySelector('.sc-category')?.focus();
};

window.openSupportCompany = function(ability,player,category){
  const original=context(player);
  if(!original?.own || !original.browseAvailable[ability] || busy)return;
  if(!category){
    if(typeof window.playFateSfxOnce === 'function'){
      window.playFateSfxOnce('uiClick', `support-company-${ability}`, 120);
    }else if(typeof playSfx === 'function'){
      playSfx('uiClick');
    }
  }
  const game=original.game;
  if(!category){
    window.showSupportCompanyCategoryWindow({ability,cost:original.available.cost,onSelect:category=>window.openSupportCompany(ability,player,category)});
    return;
  }
  // Browsing categories is allowed off-turn; revealing an offer is not.
  if(!original.active || !original.available[ability])return;
  const categoryInfo=SUPPORT_COMPANY_CATEGORIES.find(c=>c.id===category);
  if(!categoryInfo)return;
  game._supportCompanyOfferSeed ||= `${Date.now()}:${Math.random()}`;
  const offerSeed=original.state?.matchId || game._supportCompanyOfferSeed;
  const offerIds=supportCompanyOffers(typeof CARDS!=='undefined'?CARDS:[],ability==='desperate'?`${offerSeed}:desperate`:offerSeed,player,category);
  const cards=offerIds.map(id=>(typeof CARDS!=='undefined'?CARDS:[]).find(card=>String(card.id)===id)).filter(supportCompanyCardEligible);
  if(!cards.length)return;
  if(typeof playSfx === 'function')playSfx('cardSelect');
  const cost=ability==='desperate'?original.available.cost:0;
  pickRoyalSeal(cards,{
    abilityName:SUPPORT_COMPANY_NAMES[ability],
    categoryLabel:categoryInfo?.name,isCurrent:()=>typeof G!=='undefined'&&G===game,
    title:SUPPORT_COMPANY_NAMES[ability] + (categoryInfo ? ` — ${categoryInfo.name}` : ''),
    subtitle:(original.active?'':'Browse now; select a card on your turn. ') + (ability==='desperate'?`Pay ${cost} Morale (${original.morale} → ${original.morale-cost}). Add one card privately.`:'Free once per game. Add one card privately.'),
    canSelect:()=>{const c=context(player);return c?.game===game && c.own && c.active && c.available[ability];},
    minCount:1,maxCount:1,allowCancel:false,confirmLabel:ability==='desperate'?`Pay ${cost} Morale`:'Call to Arms',
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
        await window.fatePhase7UseSupportCompany(ability,card.id,category);
        return;
      }
      if(c.local){
        const command=c.commands.find(x=>x.type==='SUPPORT_COMPANY'&&x.payload.ability===ability&&x.payload.cardId===card.id&&x.payload.category===category);
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
      await window.presentSupportCompanyUse({ability,playerIndex:player,category});
      if(typeof G==='undefined'||G!==game)return;
      window.refreshLegacyMoralePressure?.({announce:false});
      renderGame({hand:true,piles:true,scores:true,topbar:true});
      if(cost && game._moralePressure.morale[player]<=0)checkWin();
      else if(typeof enforceHandLimit==='function')enforceHandLimit(player);
    }finally{busy=false;}
  });
};


// Local AI uses exactly the human offers and payment rules, without opening a
// picker. Authoritative matches execute their own legal SUPPORT_COMPANY command.
window.tryAiSupportCompany = async function(player){
  const c=context(player);
  if(!c || c.authority || c.local || !c.active || !c.game.aiEnabled || player!==c.game.aiPlayer
    || typeof aiRankSupportCompanyOffers!=='function')return false;
  const ability=c.available.call?'call':c.available.desperate?'desperate':null;
  if(!ability)return false;
  const game=c.game;
  game._supportCompanyOfferSeed ||= `${Date.now()}:${Math.random()}`;
  const seed=ability==='desperate'?`${game._supportCompanyOfferSeed}:desperate`:game._supportCompanyOfferSeed;
  const offers=SUPPORT_COMPANY_CATEGORIES.flatMap(category=>supportCompanyOffers(CARDS,seed,player,category.id)
    .map(id=>({category:category.id,card:CARDS.find(card=>String(card.id)===id)})));
  const cost=ability==='desperate'?c.available.cost:0;
  const best=aiRankSupportCompanyOffers(offers,ability,cost)[0];
  // Save a limited use when no offered card improves the current turn.
  if(!best || !(best.score>0))return false;
  busy=true;
  try{
    game._supportCompanyUses ||= [0,0];
    game._supportCompanyUses[player]++;
    if(cost)game._moralePressure.morale[player]-=cost;
    addCardToHand(player,createCardInstance(best.card,player),{arrivalKind:'support-company',announce:false,animate:false,skipHandLimit:true});
    if(typeof log==='function')log('sys',`${game.players[player].name} used ${SUPPORT_COMPANY_NAMES[ability]}.`);
    await window.presentSupportCompanyUse({ability,playerIndex:player,category:best.category});
    if(G!==game)return true;
    window.refreshLegacyMoralePressure?.({announce:false});
    renderGame({hand:true,piles:true,scores:true,topbar:true});
    if(typeof enforceHandLimit==='function')enforceHandLimit(player);
    return true;
  }finally{busy=false;}
};

// Card-triggered Call to Arms uses the normal category offers without spending either order.
window.resolveHopliteCallToArms = async function(source,player){
  const game=G;
  if(window.waitForSupportCompanyPresentation && !await window.waitForSupportCompanyPresentation(()=>G===game))return false;
  game._supportCompanyOfferSeed ||= `${Date.now()}:${Math.random()}`;
  const seed=context(player)?.state?.matchId || game._supportCompanyOfferSeed;
  const categories=SUPPORT_COMPANY_CATEGORIES.filter(category=>supportCompanyOffers(CARDS,seed,player,category.id).length);
  if(!categories.length)return false;
  const ai=game.aiEnabled && player===game.aiPlayer;
  const ranked=ai && typeof aiRankSupportCompanyOffers==='function' ? aiRankSupportCompanyOffers(categories.flatMap(category=>
    supportCompanyOffers(CARDS,seed,player,category.id).map(id=>({category:category.id,card:CARDS.find(card=>String(card.id)===id)})))) : [];
  const category=ai ? (ranked[0]?.category || categories[0].id) : await new Promise(resolve=>{
    window.showSupportCompanyCategoryWindow({categories,cancellable:false,onSelect:category=>{closeModal();resolve(category);}});
  });
  if(G!==game)return false;
  const offerIds=supportCompanyOffers(CARDS,seed,player,category);
  const cards=offerIds.map(id=>CARDS.find(card=>String(card.id)===id));
  if(!cards.length)return false;
  const add=async card=>{
    if(G!==game || !cards.includes(card))return false;
    addCardToHand(player,createCardInstance(card,player),{arrivalKind:'support-company',announce:false,animate:false,skipHandLimit:true});
    await window.presentSupportCompanyUse({ability:'call',playerIndex:player,category});
    renderEffectResolutionForPlayer(player,{bothHands:true,piles:true,scores:true});
    return true;
  };
  if(ai)return add(ranked[0]?.card || cards.slice().sort((a,b)=>Number(b.fate||0)-Number(a.fate||0))[0]);
  return new Promise(resolve=>pickRoyalSeal(cards,{
    abilityName:'Call to Arms',categoryLabel:categories.find(item=>item.id===category)?.name,isCurrent:()=>G===game,
    sourceCard:source,title:'Call to Arms',subtitle:'Choose one of these three cards for free.',
    minCount:1,maxCount:1,allowCancel:false,confirmLabel:'Call to Arms',viewerPlayerIndex:player,immediate:true
  },async chosen=>resolve(await add(chosen?.[0]))));
};
