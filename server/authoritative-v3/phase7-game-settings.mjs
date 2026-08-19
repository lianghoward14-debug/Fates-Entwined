const LANDSCAPE_IDS = Object.freeze(Array.from({length:20}, (_, index)=>`igb${index + 1}`));

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
      turnTimerMinutes:3
    };
  }
  return {
    landscapeMode:source.landscapeMode === 'selected' ? 'selected' : 'random',
    landscapeId:validLandscapeId(source.landscapeId),
    turnTimerMinutes:boundedTimerMinutes(source.turnTimerMinutes)
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
