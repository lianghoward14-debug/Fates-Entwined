(function(){
  'use strict';

  const REWORKS = Object.freeze({
    '20':{fate:1,cost:0,type:'Supporter',effect:"When set, during your opponent's next turn, they inflict 0 Morale Damage."},
    '25':{fate:1,cost:0,type:'Supporter',effect:'While this card is on the field, any card adjacent to another card of the same affiliation you control gains 1 Fate (max 1 Fate)'},
    '33':{fate:1,cost:0,type:'Supporter',effect:'When set, recover 16 Morale'},
    '34':{fate:2,cost:2,type:'Coordinator',effect:"Declare an affiliation. All cards you control in this zone with that affiliation inflict 2 Morale Damage every Morale Calculation."},
    '35':{fate:12,cost:3,type:'Dauntless',xFate:false,effect:"Every Morale Calculation, half of this card's total Fate is inflicted as Morale Damage."},
    '44':{fate:1,cost:0,type:'Supporter',effectClass:'ADJACENCY_BONUS',effect:'While this card is on the field, declare a card type. If this card is adjacent to a card of that type, this card and one random matching adjacent card gain 3 Fate (max 1 target).'},
    '45':{fate:12,cost:3,type:'Dauntless',effect:'This card is the only character you can control in this zone. When set, Pay 50 Morale and discard any card on the field'},
    '47':{fate:1,cost:0,type:'Supporter',effect:'When set, inflict 10 Morale Damage to your opponent'},
    '64':{fate:1,cost:0,type:'Supporter',effectClass:null,effect:'When set, on the next Morale Damage Calculation, double the amount of Morale Damage you inflict.'},
    '65':{fate:1,cost:0,type:'Supporter',contestedOnly:false,effect:'While this card is on the field, inflict 2 Morale Damage at the start of each of your turns'},
    '73':{fate:1,cost:0,type:'Supporter',effect:'When this card would be used in the consolidation of a Character, that card gains 4 Fate.'}
  });

  const REWORK_IDS = Object.freeze(Object.keys(REWORKS));

  function cloneCardDefinition(card){
    if(!card || typeof card !== 'object') return card;
    if(typeof structuredClone === 'function') {
      try { return structuredClone(card); } catch(_err) {}
    }
    try { return JSON.parse(JSON.stringify(card)); } catch(_err) { return Object.assign({}, card); }
  }

  function sameValue(a, b){
    if(a === b) return true;
    if(a && b && typeof a === 'object' && typeof b === 'object') {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch(_err) { return false; }
    }
    return false;
  }

  function pressureCardReworksEnabled(){
    return window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true;
  }

  function auditPressureCardReworkIntegrity(){
    const enabled = pressureCardReworksEnabled();
    const originals = window.__fatePrePressureCardReworks || {};
    const issues = [];
    if(typeof CARDS === 'undefined' || !Array.isArray(CARDS)) {
      return {ok:false, enabled:enabled, issues:['CARDS is unavailable.']};
    }
    REWORK_IDS.forEach(function(cardId){
      const card = CARDS.find(function(entry){ return entry && String(entry.id || '') === cardId; });
      if(!card) {
        issues.push('Missing card ' + cardId + '.');
        return;
      }
      if(enabled) {
        const replacement = REWORKS[cardId];
        Object.keys(replacement).forEach(function(key){
          if(!sameValue(card[key], replacement[key])) issues.push(cardId + ' has stale rework field ' + key + '.');
        });
        if(card.moraleRework !== true) issues.push(cardId + ' is missing its rework marker.');
      } else {
        const original = originals[cardId];
        if(!original) {
          issues.push('Missing legacy snapshot for ' + cardId + '.');
          return;
        }
        const keys = new Set(Object.keys(card).concat(Object.keys(original)));
        keys.forEach(function(key){
          if(!sameValue(card[key], original[key])) issues.push(cardId + ' did not restore legacy field ' + key + '.');
        });
        if(card.moraleRework === true) issues.push(cardId + ' retained its rework marker.');
      }
    });
    ['10','41','87','bh19'].forEach(function(cardId){
      const card = CARDS.find(function(entry){ return entry && String(entry.id || '') === cardId; });
      if(card && card.moraleRework === true) issues.push('Legacy-only card ' + cardId + ' was incorrectly reworked.');
    });
    const report = {ok:issues.length === 0, enabled:enabled, issues:issues};
    window.__fatePressureCardReworkIntegrity = report;
    if(!report.ok && window.console && typeof window.console.error === 'function') {
      window.console.error('[Fates] Pressure card rework integrity failure', report);
    }
    return report;
  }

  function applyPressureCardReworks(enabled){
    if(typeof CARDS === 'undefined' || !Array.isArray(CARDS)) return false;
    if(!window.__fatePrePressureCardReworks){
      window.__fatePrePressureCardReworks = Object.fromEntries(CARDS.filter(function(card){ return REWORKS[card.id]; }).map(function(card){ return [card.id, cloneCardDefinition(card)]; }));
    }
    const originals = window.__fatePrePressureCardReworks;
    CARDS.forEach(function(card){
      // Preserve the lookup key before clearing a rewritten object. Reading
      // card.id after the delete loop leaves it undefined and used to turn
      // every restored card into a blank deck-builder entry.
      const cardId = String(card.id || '');
      const replacement = REWORKS[cardId];
      if(!replacement) return;
      if(enabled === true){
        Object.assign(card, replacement, {
          img:cardId === '20' ? '20.png?v=20260829b' : ('assets/morale-card-reworks/' + cardId + '.png?v=' + (cardId === '25' ? '20260829a' : (cardId === '35' || cardId === '44' ? '20260828c' : (cardId === '34' ? '20260828b' : '20260826b')))),
          moraleRework:true
        });
      }else if(originals[cardId]){
        const original = originals[cardId];
        Object.keys(card).forEach(function(key){ delete card[key]; });
        Object.assign(card, original);
      }
    });
    window.FATE_PRESSURE_CARD_REWORKS_ENABLED = enabled === true;
    const report = auditPressureCardReworkIntegrity();
    try { window.dispatchEvent(new CustomEvent('fate:pressure-card-reworks-changed', {detail:report})); } catch(_err) {}
    return report.ok;
  }

  window.FATE_PRESSURE_CARD_REWORKS = REWORKS;
  window.fatePressureCardReworksEnabled = pressureCardReworksEnabled;
  window.auditPressureCardReworkIntegrity = auditPressureCardReworkIntegrity;
  window.applyPressureCardReworks = applyPressureCardReworks;
  applyPressureCardReworks(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true);
})();
