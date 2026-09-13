import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {chooseStrategicV3AiCommand} from '../../src/scripts/authoritative-v3-ai-policy.mjs';
import {createCommandOrderer} from '../../shared/ai/ordering.mjs';
import {filterAiTargets} from '../../shared/ai/targeting.mjs';

export function chooseWarfrontCommand(legal,projection,context){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{
      workerData:{legal,projection,context},
      resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}
    });
    let settled=false,candidate=null;
    const finish=(command,error)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);void worker.terminate();
      if(command)resolve(command);else reject(error||new Error('Warfront AI produced no move'));
    };
    const timer=setTimeout(()=>finish(candidate,new Error('Warfront AI decision timed out')),4000);
    worker.on('message',message=>{
      if(message.kind==='candidate')candidate=message.command;
      else finish(message.command||candidate);
    });
    worker.once('error',error=>finish(candidate,error));
    worker.once('exit',code=>finish(candidate,new Error('Warfront AI worker exited: '+code)));
  });
}
if(!isMainThread){
  const {legal,projection,context}=workerData;
  // Publish a useful legal move before deeper search. These are the same
  // target restrictions and deck-specific heuristics used by normal search.
  const state=context.canonicalState,seat=context.playerIndex;
  const rank=createCommandOrderer(state,seat);
  const commands=filterAiTargets(legal,state,seat).filter(c=>c.type!=='CONCEDE');
  const candidate=commands.map(command=>({command,score:rank(command)})).sort((a,b)=>b.score-a.score)[0]?.command;
  parentPort.postMessage({kind:'candidate',command:candidate});
  parentPort.postMessage({kind:'final',command:chooseStrategicV3AiCommand(legal,projection,context)});
}
