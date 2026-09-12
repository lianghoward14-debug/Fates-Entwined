import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {extractArrayLiteral,getDeckCatalog}=require('../fate-deck-catalog.js');
const source=readFileSync(new URL('../../src/scripts/04-game-setup.js',import.meta.url),'utf8');
const opponents=runInNewContext('('+extractArrayLiteral(source,'AI_OPPONENTS')+')',Object.create(null),{timeout:1000});
export function warfrontAiProfile(player={}){
  const named=opponents.find(p=>p.name===player.name);
  const elo=Number(player.elo ?? player.rankElo ?? named?.elo)||600;
  return {...named,name:player.name||named?.name,style:named?.style||'balanced',
    difficulty:elo>=1400?'extreme':elo>=1200?'hard':elo>=800?'medium':'easy'};
}
export function namedWarfrontDeck(player){
  return getDeckCatalog().byId.get(warfrontAiProfile(player).deckRef);
}

// The same explicit activation intent attached by the single-player adapter.
export function warfrontAiCommand(command){
  if(command?.type!=='ACTIVATE_EFFECT'||command.manualOnly!==true)return command;
  return {...command,payload:{...(command.payload||{}),userActivated:true}};
}
