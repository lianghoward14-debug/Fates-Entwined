function normalize(value, seen){
  if(value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if(typeof value === 'number'){
    if(!Number.isFinite(value)) throw new TypeError('canonical state contains a non-finite number');
    return Object.is(value, -0) ? 0 : value;
  }
  if(typeof value === 'bigint') return value.toString();
  if(typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol'){
    throw new TypeError('canonical state contains a non-serializable value');
  }
  if(seen.has(value)) throw new TypeError('canonical state contains a cycle');
  seen.add(value);
  let result;
  if(Array.isArray(value)){
    result = value.map(item=>normalize(item, seen));
  }else{
    const prototype = Object.getPrototypeOf(value);
    if(prototype !== Object.prototype && prototype !== null){
      throw new TypeError('canonical state contains a non-plain object');
    }
    result = Object.create(null);
    for(const key of Object.keys(value).sort()){
      const item = value[key];
      if(item === undefined) continue;
      result[key] = normalize(item, seen);
    }
  }
  seen.delete(value);
  return result;
}

export function canonicalize(value){
  return normalize(value, new Set());
}

export function stableStringify(value){
  return JSON.stringify(canonicalize(value));
}

export function cloneSerializable(value){
  return JSON.parse(stableStringify(value));
}

// A portable deterministic 64-bit FNV-1a hash. It is deliberately implemented
// without Node APIs so browser, server, AI, and tests calculate the same value.
export function canonicalHash(value){
  const input = typeof value === 'string' ? value : stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for(let i = 0; i < input.length; i += 1){
    const code = input.charCodeAt(i);
    hash ^= BigInt(code & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt((code >>> 8) & 0xff);
    hash = (hash * prime) & mask;
  }
  return `fe3_${hash.toString(16).padStart(16, '0')}`;
}
