import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {chooseStrategicV3AiCommand} from '../../src/scripts/authoritative-v3-ai-policy.mjs';

export function chooseWarfrontCommand(legal,projection,context){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{
      workerData:{legal,projection,context},
      resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}
    });
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;void worker.terminate();reject(new Error('Warfront AI decision timed out'));}},15000);
    worker.once('message',command=>{settled=true;clearTimeout(timer);resolve(command);});
    worker.once('error',error=>{settled=true;clearTimeout(timer);reject(error);});
    worker.once('exit',code=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error('Warfront AI worker exited: '+code));}});
  });
}
if(!isMainThread){
  parentPort.postMessage(chooseStrategicV3AiCommand(workerData.legal,workerData.projection,workerData.context));
}
