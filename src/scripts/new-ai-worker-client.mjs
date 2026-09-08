export class AiSearchWorker {
  constructor(WorkerClass=globalThis.Worker){
    this.serial=0;this.pending=new Map();
    this.worker=WorkerClass ? new WorkerClass(new URL('./new-ai-worker.mjs',import.meta.url),{type:'module'}) : null;
    if(this.worker){
      this.worker.onmessage=({data})=>{
        const pending=this.pending.get(data.id);if(!pending)return;
        this.pending.delete(data.id);clearTimeout(pending.timer);
        if(data.error)pending.reject(new Error(data.error));else pending.resolve(data);
      };
      this.worker.onerror=error=>this.dispose(new Error(error.message || 'AI worker failed'));
    }
  }
  decide(commands,projection,context){
    if(!this.worker)return Promise.reject(new Error('AI worker unavailable'));
    return new Promise((resolve,reject)=>{
      const id=++this.serial;
      const timer=setTimeout(()=>this.dispose(new Error('AI search timed out')),20000);
      this.pending.set(id,{resolve,reject,timer});
      this.worker.postMessage({id,commands,projection,context});
    });
  }
  dispose(reason=new Error('AI search cancelled')){
    this.worker?.terminate();this.worker=null;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(reason);}
    this.pending.clear();
  }
}
