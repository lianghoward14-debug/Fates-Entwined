import {supportCompanyAvailability, supportCompanyCardEligible} from '../support-company.mjs';

export function supportCompanyCommands(state, player){
  if(state.phase !== 'main' || state.outcome || state.pendingPrompt || state.pendingHandLimit
    || state.activePlayer !== player) return [];
  const available = supportCompanyAvailability(state.supportCompanyUses?.[player],
    state.moralePressure?.morale?.[player], state.gameSettings?.healthPressureSeals === true);
  const ability = available.call ? 'call' : available.desperate ? 'desperate' : null;
  if(!ability) return [];
  return (state.cardCatalog || []).filter(supportCompanyCardEligible).map(card=>({
    type:'SUPPORT_COMPANY', payload:{ability, cardId:String(card.id)}
  }));
}

export function resolveSupportCompany(ctx, player, payload){
  const {state} = ctx;
  if(!supportCompanyCommands(state, player).some(command=>
    command.payload.ability === payload.ability && command.payload.cardId === payload.cardId)){
    throw Object.assign(new Error('Support Company selection or use is unavailable'), {code:'SUPPORT_COMPANY_UNAVAILABLE'});
  }
  const definition = state.cardCatalog.find(card=>String(card.id) === payload.cardId);
  const available = supportCompanyAvailability(state.supportCompanyUses?.[player], state.moralePressure?.morale?.[player]);
  const cost = payload.ability === 'desperate' ? available.cost : 0;
  if(cost){
    const before = state.moralePressure.morale[player];
    // This is a game-rule payment, not damage or a card-effect cost waiver.
    state.moralePressure.morale[player] -= cost;
    ctx.events.push({type:'MORALE_DAMAGED', playerIndex:player, amount:cost,
      before, after:state.moralePressure.morale[player], reason:'SUPPORT_COMPANY_COST'});
  }
  state.supportCompanyUses ||= [0, 0];
  state.supportCompanyUses[player] += 1;
  state.instanceCounter += 1;
  const fate = Number(definition.fate) || 0;
  const card = {iid:`${state.matchId}:p${player}:c${state.instanceCounter}`,
    id:definition.id, name:definition.name, ability:definition.ability, effect:definition.effect,
    type:definition.type, affiliation:definition.affiliation, rarity:definition.rarity,
    baseFate:fate, currentFate:fate, cost:definition.cost, owner:player, controller:player,
    faceDown:false, statuses:[], counters:{supportCompanyCreated:true}};
  state.players[player].hand.push(card);
  // Never put the selection, IID, type, or art in the public event.
  ctx.events.push({type:'SUPPORT_COMPANY_USED', playerIndex:player, ability:payload.ability, moraleCost:cost});
  ctx.events.push({type:'SUPPORT_COMPANY_CARD_ADDED', playerIndex:player, cardId:card.id,
    cardIid:card.iid, privateTo:[player]});
}
