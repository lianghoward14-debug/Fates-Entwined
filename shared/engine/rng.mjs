function seedHash(seed){
  let hash = 2166136261 >>> 0;
  const input = String(seed || 'fates-entwined-v3');
  for(let i = 0; i < input.length; i += 1){
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 0x9e3779b9;
}

export function createRngState(seed){
  return {
    algorithm: 'xorshift32',
    seed: String(seed || 'fates-entwined-v3'),
    value: seedHash(seed),
    counter: 0
  };
}

export function nextUint32(rngState){
  if(!rngState || rngState.algorithm !== 'xorshift32') throw new Error('unsupported RNG state');
  let value = Number(rngState.value) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  rngState.value = value >>> 0;
  rngState.counter = (Number(rngState.counter) || 0) + 1;
  return rngState.value;
}

export function nextInt(rngState, maxExclusive){
  const max = Number(maxExclusive);
  if(!Number.isInteger(max) || max <= 0) throw new RangeError('RNG maximum must be a positive integer');
  return nextUint32(rngState) % max;
}

export function shuffleInPlace(items, rngState){
  for(let i = items.length - 1; i > 0; i -= 1){
    const j = nextInt(rngState, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

