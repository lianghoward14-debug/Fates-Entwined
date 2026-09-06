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
    '34', '47', '50', '52', '53', '61', '62', '64', '71', '72', '81', '91', '93', '97',
    'bh04', 'bh16', 'bh18'
  ]);
  const havanoTargetingSources = new Set(HAVANO_TARGETING_SOURCE_IDS);
  // Passive Morale sources expose Havano when they enter play, before their
  // continuous/automatic damage can begin. Hybrid WHEN_SET cards (such as
  // Rozsi) remain in the activation list above so their normal reaction frame
  // is not bypassed.
  const HAVANO_PASSIVE_ENTRY_SOURCE_IDS = Object.freeze(['10', '35', '36', '65', 'bh18']);
  const havanoPassiveEntrySources = new Set(HAVANO_PASSIVE_ENTRY_SOURCE_IDS);

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

  function canTriggerHavanoOnPassiveEntry(value){
    return havanoPassiveEntrySources.has(normalizedId(value));
  }

  function boardActivationClass(fnName){
    return BOARD_ACTIVATION_CLASSES[String(fnName || '')] || '';
  }

  return Object.freeze({
    HAVANO_TARGETING_SOURCE_IDS,
    HAVANO_PASSIVE_ENTRY_SOURCE_IDS,
    BOARD_ACTIVATION_CLASSES,
    canTriggerHavano,
    canTriggerHavanoOnPassiveEntry,
    boardActivationClass
  });
});
