import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createInitialState,legalCommandTemplates,reduceCommand,projectStateForPlayer} from '../shared/engine/index.mjs';
import {chooseCommand} from '../shared/ai/policy.mjs';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const decks=require('../server/fate-deck-catalog.js').getDeckCatalog().decks;
const definitions=require('../server/fate-card-catalog.js').getCardCatalog().cards;
const arg=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
if(!isMainThread){
  const {index,out}=workerData, pair=Math.floor(index/2),swap=index%2;
  const a=pair%decks.length,b=(a+1+Math.floor(pair/decks.length)%(decks.length-1))%decks.length;
  const chosen=swap?[decks[b],decks[a]]:[decks[a],decks[b]];
  const seed=`local-batch-pair-${pair}`,start=Date.now(),actions=[];
  let state=createInitialState({matchId:`local-${index}`,seed,cardDefinitions:definitions,
    gameSettings:{healthPressureSeals:true,pressureCardReworks:true,zoneControlRework:true},
    players:chosen.map((d,i)=>({id:`p${i}`,deckIds:d.ids,name:d.name}))});
  const initialState=structuredClone(state);
  let error=null;
  try{
    for(let step=0;step<1800 && !state.outcome;step++){
      const seat=Number(state.pendingPrompt?.playerIndex ?? state.pendingHandLimit?.playerIndex ?? state.activePlayer);
      const legal=legalCommandTemplates(state,seat).filter(c=>c.type!=='CONCEDE');
      const c=chooseCommand(legal,projectStateForPlayer(state,seat),{canonicalState:state,playerIndex:seat,
        samples:1,nodeBudget:24,maxNodeBudget:24,width:4,style:'balanced'});
      if(!c)throw Error('No AI command');
      const command={type:c.type,payload:{...c.payload,...(c.manualOnly?{userActivated:true}:{})},matchId:state.matchId,expectedRevision:state.revision,commandId:`batch:${step}`};
      const result=reduceCommand(state,command,{playerId:`p${seat}`});
      if(!result.ok)throw Error(JSON.stringify(result.rejection));
      actions.push({seat,turn:state.turn,command});state=result.state;
    }
    if(!state.outcome)throw Error('1800 action safety limit reached');
  }catch(e){error=String(e.stack || e);}
  const record={index,seed,deckIds:chosen.map(d=>d.id),outcome:state.outcome,error,turn:state.turn,actions:actions.length,durationMs:Date.now()-start};
  const file=path.join(out,'games',String(index).padStart(5,'0')+'.json.gz');
  fs.writeFileSync(file+'.tmp',gzipSync(JSON.stringify({record,initialState,actions,finalState:state})));
  fs.renameSync(file+'.tmp',file);parentPort.postMessage(record);
}else{
  const out=path.resolve(arg('--out','simulation-results/local-5000'));
  const until=Number(arg('--until','5000')),workers=Number(arg('--workers','2'));
  fs.mkdirSync(path.join(out,'games'),{recursive:true});
  const records=new Map();
  if(fs.existsSync(path.join(out,'results.jsonl')))for(const line of fs.readFileSync(path.join(out,'results.jsonl'),'utf8').trim().split('\n')){
    if(line){const r=JSON.parse(line);records.set(r.index,r);}
  }
  let next=0,failures=0,stop=false;
  function status(){
    const rows=[...records.values()],byDeck={};
    for(const r of rows)r.deckIds?.forEach((id,seat)=>{
      const d=byDeck[id] ||= {games:0,wins:0,draws:0,errors:0};d.games++;if(r.error)d.errors++;else if(r.outcome?.winner==null)d.draws++;else if(r.outcome.winner===seat)d.wins++;
    });
    const data={target:5000,runUntil:until,finished:rows.length,successful:rows.filter(r=>!r.error).length,errors:rows.filter(r=>r.error).length,
      updatedAt:new Date().toISOString(),stopped:stop,complete:rows.length>=5000,byDeck};
    fs.writeFileSync(path.join(out,'summary.json.tmp'),JSON.stringify(data,null,2));fs.renameSync(path.join(out,'summary.json.tmp'),path.join(out,'summary.json'));
  }
  async function lane(){
    while(!stop && !fs.existsSync(path.join(out,'STOP'))){
      while(records.has(next))next++;
      if(next>=until)return;
      const index=next++;
      const result=await new Promise(resolve=>{
        const w=new Worker(new URL(import.meta.url),{workerData:{index,out}});
        const timer=setTimeout(()=>{w.terminate();resolve({index,error:'15 minute game timeout',durationMs:900000});},900000);
        w.once('message',r=>{clearTimeout(timer);resolve(r);});
        w.once('error',e=>{clearTimeout(timer);resolve({index,error:String(e.stack)});});
        w.once('exit',code=>{clearTimeout(timer);if(code)resolve({index,error:`Worker exit ${code}`});});
      });
      records.set(index,result);fs.appendFileSync(path.join(out,'results.jsonl'),JSON.stringify(result)+'\n');
      failures=result.error?failures+1:0;if(failures>=5)stop=true;
      status();console.log(new Date().toISOString(),index,result.error?'ERROR':'OK',result.durationMs);
    }
  }
  status();await Promise.all(Array.from({length:workers},lane));status();
}
