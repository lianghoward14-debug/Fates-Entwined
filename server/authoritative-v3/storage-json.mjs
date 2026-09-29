import {gzipSync, gunzipSync} from 'node:zlib';
import {stableStringify} from '../../shared/engine/serialization.mjs';

// SQLite accepts BLOBs in the existing JSON columns. Plain JSON rows remain
// readable, so existing databases need no bulk rewrite or migration space.
export function encodeStoredJson(value){
  const json = stableStringify(value);
  if(Buffer.byteLength(json) < 1024) return json;
  const compressed = gzipSync(json, {level:1});
  return compressed.length < Buffer.byteLength(json) ? compressed : json;
}

export function decodeStoredJson(value){
  if(value == null || value === '') return null;
  if(ArrayBuffer.isView(value)){
    return JSON.parse(gunzipSync(value).toString('utf8'));
  }
  return JSON.parse(String(value));
}
