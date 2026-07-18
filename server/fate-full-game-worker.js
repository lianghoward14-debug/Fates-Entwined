'use strict';

const {parentPort}=require('worker_threads');
const Engine=require('./fate-full-game-self-play');

parentPort.on('message',message=>{
  const task=message||{};
  try{
    let result;
    if(task.mode==='train') result=Engine.trainFullGamePolicies(task.base,{games:task.games,seed:task.seed,learningRate:task.learningRate,exploration:task.exploration});
    else if(task.mode==='validate') result=Engine.validateFullGamePolicies(task.base,task.candidate,{games:task.games,seed:task.seed,minimumScore:task.minimumScore});
    else throw new Error('unknown full-game worker mode');
    parentPort.postMessage({id:task.id,ok:true,result});
  }catch(error){
    parentPort.postMessage({id:task.id,ok:false,error:String(error&&error.stack||error)});
  }
});
