const LANDSCAPE_IDS = Object.freeze(Array.from({length:24}, (_, index)=>`igb${index + 1}`));
// Morale is the standard match ruleset. Retain an explicit operator test override.
const MORALE_PRESSURE_SEALS_DEFAULT = process.env.FATE_MORALE_PRESSURE_SEALS !== '0';
const MORALE_CARD_REWORKS_DEFAULT = MORALE_PRESSURE_SEALS_DEFAULT
  && process.env.FATE_MORALE_CARD_REWORKS !== '0';
const ZONE_CONTROL_REWORK_DEFAULT = process.env.FATE_ZONE_CONTROL_REWORK !== '0';
const EXPANDED_CONTESTED_ROW_DEFAULT = process.env.FATE_EXPANDED_CONTESTED_ROW !== '0';
const ZONE_LAYOUT_444_DEFAULT = process.env.FATE_ZONE_LAYOUT_444 !== '0';

function validLandscapeId(value){
  const id = String(value || '');
  return LANDSCAPE_IDS.includes(id) ? id : 'igb1';
}

function boundedTimerMinutes(value){
  return Math.max(1, Math.min(10, Math.round(Number(value) || 3)));
}

export function normalizePhase7GameSettings(value, legacyLandscapeId = ''){
  const source = value && typeof value === 'object' ? value : null;
  if(!source){
    const legacy = String(legacyLandscapeId || '');
    return {
      landscapeMode:LANDSCAPE_IDS.includes(legacy) ? 'selected' : 'random',
      landscapeId:validLandscapeId(legacy),
      turnTimerMinutes:3,
      healthPressureSeals:MORALE_PRESSURE_SEALS_DEFAULT,
      pressureCardReworks:MORALE_CARD_REWORKS_DEFAULT,
      zoneControlRework:ZONE_CONTROL_REWORK_DEFAULT,
      expandedContestedRow:ZONE_CONTROL_REWORK_DEFAULT && EXPANDED_CONTESTED_ROW_DEFAULT,
      zoneLayout444:ZONE_CONTROL_REWORK_DEFAULT && EXPANDED_CONTESTED_ROW_DEFAULT && ZONE_LAYOUT_444_DEFAULT
    };
  }
  return {
    landscapeMode:source.landscapeMode === 'selected' ? 'selected' : 'random',
    landscapeId:validLandscapeId(source.landscapeId),
    turnTimerMinutes:boundedTimerMinutes(source.turnTimerMinutes),
    healthPressureSeals:source.healthPressureSeals === undefined ? MORALE_PRESSURE_SEALS_DEFAULT : source.healthPressureSeals === true,
    pressureCardReworks:source.healthPressureSeals === true && source.pressureCardReworks === true,
    zoneControlRework:ZONE_CONTROL_REWORK_DEFAULT && source.zoneControlRework !== false,
    expandedContestedRow:ZONE_CONTROL_REWORK_DEFAULT && source.zoneControlRework !== false
      && EXPANDED_CONTESTED_ROW_DEFAULT && source.expandedContestedRow !== false,
    zoneLayout444:ZONE_CONTROL_REWORK_DEFAULT && source.zoneControlRework !== false
      && EXPANDED_CONTESTED_ROW_DEFAULT && source.expandedContestedRow !== false
      && ZONE_LAYOUT_444_DEFAULT && source.zoneLayout444 !== false
  };
}

function stableIndex(seed, length){
  let hash = 2166136261;
  for(const character of String(seed || 'phase7-landscape')){
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % Math.max(1, length);
}

export function resolvePhase7GameSettings(value, matchSeed){
  const normalized = normalizePhase7GameSettings(value);
  const landscapeId = normalized.landscapeMode === 'selected'
    ? normalized.landscapeId
    : LANDSCAPE_IDS[stableIndex(`${matchSeed}:landscape`, LANDSCAPE_IDS.length)];
  return {
    ...normalized,
    resolvedLandscapeId:landscapeId,
    turnTimerSeconds:landscapeId === 'igb14' ? 30 : normalized.turnTimerMinutes * 60
  };
}

export const PHASE7_MULTIPLAYER_LANDSCAPE_IDS = LANDSCAPE_IDS;
