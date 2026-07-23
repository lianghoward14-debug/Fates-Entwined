(function installFateEffectRuleMetadata(root, factory){
  const api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(root) root.FateEffectRuleMetadata = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFateEffectRuleMetadata(){
  'use strict';

  // These are effects whose rules can target an opposing player or one of that
  // player's cards. Havano consumes this shared registry in both the browser and
  // the authority so the two runtimes cannot silently drift apart.
  const HAVANO_TARGETING_SOURCE_IDS = Object.freeze([
    '04', '10', '14', '16', '17', '18', '21', '26', '30', '31', '36', '39',
    '50', '52', '53', '61', '62', '64', '71', '72', '91', '93', '97',
    'bh04', 'bh25'
  ]);
  const havanoTargetingSources = new Set(HAVANO_TARGETING_SOURCE_IDS);

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
    return havanoTargetingSources.has(normalizedId(value));
  }

  function boardActivationClass(fnName){
    return BOARD_ACTIVATION_CLASSES[String(fnName || '')] || '';
  }

  return Object.freeze({
    HAVANO_TARGETING_SOURCE_IDS,
    BOARD_ACTIVATION_CLASSES,
    canTriggerHavano,
    boardActivationClass
  });
});
