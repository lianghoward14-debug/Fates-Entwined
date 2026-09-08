import {chooseCommand} from '../../shared/ai/policy.mjs';
self.onmessage=event=>{
  const {id,commands,projection,context}=event.data;
  try{
    let trace=null;
    const command=chooseCommand(commands,projection,{...context,onDecision:value=>{trace=value;}});
    self.postMessage({id,command,trace});
  }catch(error){self.postMessage({id,error:String(error?.stack || error)});}
};
