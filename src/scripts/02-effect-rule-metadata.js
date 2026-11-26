(function installFateEffectRuleMetadata(root, factory){
  const api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root) root.FateEffectRuleMetadata = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFateEffectRuleMetadata(){
  'use strict';

  // Havano uses the Supporter's effect properties and the actual chosen target.

  const BOARD_ACTIVATION_CLASSES = Object.freeze({
    triggerCharacterEffect:'initiator_effect',
    activatePendingWhenSetEffect:'supporter_effect',
    activateVigilantes:'supporter_effect',
    activateExpeditionaryMove:'supporter_effect',
    activateBusserMove:'supporter_effect',
    activateWodnyPotokYouth:'supporter_effect'
  });

  function normalizedId(value){
    if(value && typeof value === 'object'){
      return String(value.effectSourceId || value.cardId || value.id || value.card && value.card.id || '');
    }
    return String(value || '');
  }

  function canTriggerHavano(value){
    return value?.type === 'Supporter' && value.havanoAffectsOpponent === true;
  }

  function canTriggerHavanoOnPassiveEntry(value){
    return value?.type === 'Supporter' && value.havanoPassiveEntry === true;
  }

  function boardActivationClass(fnName){
    return BOARD_ACTIVATION_CLASSES[String(fnName || '')] || '';
  }

  return Object.freeze({
    BOARD_ACTIVATION_CLASSES,
    canTriggerHavano,
    canTriggerHavanoOnPassiveEntry,
    boardActivationClass
  });
});
