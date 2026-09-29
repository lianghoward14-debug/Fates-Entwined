const copy = value=>JSON.parse(JSON.stringify(value));
const object = value=>value !== null && typeof value === 'object';
const own = (value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function changes(before,after,path=[],out=[]){
  if(before===after) return out;
  if(!object(before)||!object(after)||Array.isArray(before)!==Array.isArray(after)
    ||(Array.isArray(after)&&before.length!==after.length)){
    out.push([path,after]);return out;
  }
  for(const key of Object.keys(before)) if(!own(after,key)) out.push([[...path,key]]);
  for(const key of Object.keys(after)){
    if(!own(before,key)) out.push([[...path,key],after[key]]);
    else changes(before[key],after[key],[...path,key],out);
  }
  return out;
}

// One instance per authenticated socket: never share private projections.
export function createDeltaEncoder(){
  let baseline=null,sequence=0;
  return message=>{
    if(!message.state) return JSON.stringify(message);
    const next=copy(message),seq=sequence+1;
    const full=JSON.stringify({kind:'view-full',sequence:seq,message:next});
    let wire=full;
    if(baseline && baseline.matchId===next.matchId && next.kind!=='snapshot'){
      const delta=JSON.stringify({kind:'view-delta',base:sequence,sequence:seq,changes:changes(baseline,next)});
      if(delta.length < full.length * 0.9) wire=delta;
    }
    baseline=next;sequence=seq;
    return wire;
  };
}

export function createDeltaDecoder(){
  let baseline=null,sequence=0;
  return wire=>{
    if(wire.kind!=='view-full' && wire.kind!=='view-delta') return wire;
    if(!Number.isSafeInteger(wire.sequence)||wire.sequence<1) throw new Error('Invalid view sequence');
    let next;
    if(wire.kind==='view-full') next=copy(wire.message);
    else{
      if(!baseline||wire.base!==sequence||wire.sequence!==sequence+1||!Array.isArray(wire.changes)) throw new Error('View resync required');
      next=copy(baseline);
      for(const operation of wire.changes){
        if(!Array.isArray(operation)||operation.length<1||operation.length>2||!Array.isArray(operation[0])) throw new Error('Invalid view patch');
        const path=operation[0];
        if(path.some(key=>typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))) throw new Error('Unsafe view path');
        if(!path.length){if(operation.length!==2)throw new Error('Invalid root deletion');next=copy(operation[1]);continue;}
        let target=next;
        for(const key of path.slice(0,-1)){
          if(!object(target)||!own(target,key))throw new Error('Invalid view path');
          target=target[key];
        }
        if(!object(target))throw new Error('Invalid view target');
        const key=path.at(-1);
        if(operation.length===1) delete target[key];
        else Object.defineProperty(target,key,{value:copy(operation[1]),enumerable:true,writable:true,configurable:true});
      }
    }
    if(!next?.state||!['snapshot','accepted','rejected'].includes(next.kind))throw new Error('Invalid reconstructed view');
    baseline=next;sequence=wire.sequence;
    return copy(next);
  };
}
