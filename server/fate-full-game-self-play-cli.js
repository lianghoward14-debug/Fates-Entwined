#!/usr/bin/env node
'use strict';

const Learning = require('../src/scripts/07-ai-learning.js');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {Worker}=require('worker_threads');

function argValue(name, fallback){
  const index=process.argv.indexOf(name);
  return index>=0 && process.argv[index+1]!==undefined ? process.argv[index+1] : fallback;
}

const games=Math.max(1,Math.min(1000000,Math.round(Number(argValue('--games',1000))||1000)));
const validationGames=Math.max(4,Math.min(20000,Math.round(Number(argValue('--validation',Math.min(2000,Math.max(200,games/5))))||400)));
const seed=String(argValue('--seed','offline-full-game-v1'));
const minimumScore=Math.max(0.5,Math.min(0.65,Number(argValue('--minimum-score',0.505))||0.505));
const defaultWorkers=Math.max(1,Math.min(7,os.cpus().length-1));
const workerCount=Math.max(1,Math.min(16,Math.round(Number(argValue('--workers',defaultWorkers))||1)));
const shardGames=Math.max(100,Math.min(5000,Math.round(Number(argValue('--shard-games',1000))||1000)));
const outputPath=String(argValue('--output','')).trim();

function makeTasks(total,size,mode,extra){
  const tasks=[];
  let remaining=total;
  while(remaining>0){
    const count=Math.min(size,remaining);
    tasks.push(Object.assign({mode,games:count},extra||{}));
    remaining-=count;
  }
  return tasks;
}

function runWorkerPool(tasks,onProgress){
  return new Promise((resolve,reject)=>{
    if(!tasks.length){ resolve([]); return; }
    const target=Math.min(workerCount,tasks.length);
    const workers=[];
    const results=new Array(tasks.length);
    let next=0,completed=0,failed=false;
    const workerPath=path.join(__dirname,'fate-full-game-worker.js');
    function stopAll(){ workers.forEach(worker=>worker.terminate().catch(()=>{})); }
    function assign(worker){
      if(failed) return;
      if(next>=tasks.length){
        if(completed>=tasks.length){ stopAll(); resolve(results); }
        return;
      }
      const index=next++;
      worker._taskIndex=index;
      worker.postMessage(Object.assign({id:index},tasks[index]));
    }
    for(let i=0;i<target;i++){
      const worker=new Worker(workerPath);
      workers.push(worker);
      worker.on('message',message=>{
        if(failed) return;
        const index=worker._taskIndex;
        if(!message||!message.ok){
          failed=true;stopAll();reject(new Error(message&&message.error||'full-game worker failed'));return;
        }
        results[index]=message.result;
        completed++;
        if(onProgress) onProgress(completed,tasks.length,message.result);
        assign(worker);
      });
      worker.on('error',error=>{ if(!failed){failed=true;stopAll();reject(error);} });
      assign(worker);
    }
  });
}

function mergeTraining(base,results){
  const policies=Learning.sanitizePolicySet(base);
  const totalGames=results.reduce((sum,result)=>sum+Number(result.games||0),0);
  const outcomes={wins:[0,0],draws:0};
  Learning.POLICY_NAMES.forEach(name=>{
    Learning.FEATURE_KEYS.forEach(key=>{
      const weightedDelta=results.reduce((sum,result)=>{
        const weight=Number(result.games||0)/Math.max(1,totalGames);
        return sum+(Number(result.policies?.[name]?.weights?.[key])-(Number(base[name]?.weights?.[key])||0))*weight;
      },0);
      policies[name].weights[key]=Math.max(-1.5,Math.min(1.5,(Number(base[name].weights[key])||0)+weightedDelta));
    });
    const added=results.reduce((sum,result)=>sum+Math.max(0,(Number(result.policies?.[name]?.fullGameEpisodes)||0)-(Number(base[name]?.fullGameEpisodes)||0)),0);
    policies[name].fullGameEpisodes=(Number(base[name].fullGameEpisodes)||0)+added;
    policies[name].updatedAt=Date.now();
  });
  results.forEach(result=>{
    outcomes.wins[0]+=Number(result.outcomes?.wins?.[0])||0;
    outcomes.wins[1]+=Number(result.outcomes?.wins?.[1])||0;
    outcomes.draws+=Number(result.outcomes?.draws)||0;
  });
  return {policies,games:totalGames,outcomes};
}

function mergeValidation(results){
  const merged={games:0,candidateWins:0,baselineWins:0,draws:0};
  results.forEach(result=>{
    merged.games+=Number(result.games)||0;
    merged.candidateWins+=Number(result.candidateWins)||0;
    merged.baselineWins+=Number(result.baselineWins)||0;
    merged.draws+=Number(result.draws)||0;
  });
  merged.score=(merged.candidateWins+merged.draws*0.5)/Math.max(1,merged.games);
  merged.promoted=merged.score>=minimumScore;
  return merged;
}

(async function main(){
  const started=Date.now();
  const base=Learning.createBasePolicies();
  const trainingTasks=makeTasks(games,shardGames,'train',{base,seed:'',learningRate:0.04,exploration:0.1});
  trainingTasks.forEach((task,index)=>{task.seed=`${seed}:train-shard:${index}`;});
  let trainedGames=0;
  const progressEvery=Math.max(1,Math.floor(trainingTasks.length/50));
  console.log(`[full-game] starting ${games} games on ${workerCount} local workers (${trainingTasks.length} shards)`);
  const trainingResults=await runWorkerPool(trainingTasks,(completed,total,result)=>{
    trainedGames+=Number(result.games)||0;
    if(completed%progressEvery===0||completed===total) console.log(`[full-game] training ${trainedGames}/${games} (${(trainedGames/games*100).toFixed(1)}%)`);
  });
  const training=mergeTraining(base,trainingResults);
  const validationTasks=makeTasks(validationGames,Math.min(200,shardGames),'validate',{base,candidate:training.policies,seed:'',minimumScore});
  validationTasks.forEach((task,index)=>{task.seed=`${seed}:validation-shard:${index}`;});
  let validated=0;
  console.log(`[full-game] validating candidate over ${validationGames} frozen-baseline games`);
  const validationResults=await runWorkerPool(validationTasks,(completed,total,result)=>{
    validated+=Number(result.games)||0;
    console.log(`[full-game] validation ${validated}/${validationGames}`);
  });
  const validation=mergeValidation(validationResults);
  const policies=validation.promoted?training.policies:base;
  const summary={games:training.games,workers:workerCount,validationGames:validation.games,validationScore:validation.score,candidateWins:validation.candidateWins,baselineWins:validation.baselineWins,draws:validation.draws,promoted:validation.promoted,totalElapsedMs:Date.now()-started};
  console.log(JSON.stringify(summary,null,2));
  const snapshot={version:Learning.POLICY_VERSION,summary,policies};
  if(outputPath){ fs.writeFileSync(path.resolve(outputPath),JSON.stringify(snapshot,null,2)); console.log(`[full-game] wrote ${path.resolve(outputPath)}`); }
  if(process.argv.includes('--json')) console.log(JSON.stringify(snapshot,null,2));
})().catch(error=>{console.error(error&&error.stack||error);process.exit(1);});
