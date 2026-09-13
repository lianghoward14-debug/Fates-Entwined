import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export function createWarfrontReplayStore(directory){
  fs.mkdirSync(directory,{recursive:true});
  const file=key=>path.join(directory,key+'.json.gz');
  return {
    save(replay){
      if(replay?.storageKey){
        if(!/^[a-f0-9]{64}$/.test(replay.storageKey)||!fs.existsSync(file(replay.storageKey)))throw new Error('Warfront replay recording is missing');
        return {version:replay.version,storageKey:replay.storageKey,actionCount:replay.actionCount};
      }
      const json=JSON.stringify(replay),key=crypto.createHash('sha256').update(json).digest('hex');
      if(!fs.existsSync(file(key))){
        const temp=file(key)+'.tmp';
        fs.writeFileSync(temp,gzipSync(json));
        fs.renameSync(temp,file(key));
      }
      return {version:replay.version,storageKey:key,actionCount:replay.actions.length};
    },
    read(key){
      if(!/^[a-f0-9]{64}$/.test(String(key)))throw new Error('Invalid replay reference');
      return JSON.parse(gunzipSync(fs.readFileSync(file(key))).toString('utf8'));
    }
  };
}
