import {createRequire} from 'node:module';
import {namedWarfrontDeck,warfrontAiProfile} from './warfront-ai-profile.mjs';
const require=createRequire(import.meta.url);
const {getDeckCatalog}=require('../fate-deck-catalog.js');
const {getCardCatalog}=require('../fate-card-catalog.js');
const STATS_VERSION=4;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function deckProfile(player={}){
  const decks=getDeckCatalog().decks;
  const identity=String(player.aiId||player.id||player.name||'default');
  const hash=[...identity].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0);
  const deck=namedWarfrontDeck(player)||decks[hash%decks.length];
  const catalog=new Map(getCardCatalog().cards.map(c=>[String(c.id),c]));
  const cards=(deck?.ids||[]).map(id=>catalog.get(String(id))).filter(Boolean);
  const characters=cards.filter(c=>c.type!=='Supporter');
  const supporters=cards.length-characters.length;
  const cost=characters.reduce((n,c)=>n+(Number(c.cost)||1),0)/Math.max(1,characters.length);
  // Cheap characters and abundant supporters permit more consolidations.
  const consolidation=clamp(.5*(characters.length/20)+.3*(supporters/22)+.2*(1-cost/6),0,1);
  const growth=cards.filter(c=>/gain|double|increase/i.test(c.effect||'')&&/fate/i.test(c.effect||'')).length/Math.max(1,cards.length);
  const baseFate=characters.reduce((n,c)=>n+(Number(c.fate)||0),0)/Math.max(1,characters.length);
  return {id:deck?.id||null,consolidation,power:clamp(growth*1.5+baseFate/16,0,1)};
}
// Cheap report model, not an engine replay. Preserve already recorded winners.
export function addWarfrontSimulatedStats(match){
  if(match.simulationKind!=='strength-probability')return match;
  if(match.statsSource&&match.statsSource!=='simulated')return match;
  match.commendationExcluded=false;
  if(match.statsVersion===STATS_VERSION)return match;
  let seed=2166136261;
  for(const ch of String(match.id))seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const sides={};
  for(const team of ['a','b']){
    const player=match.participants?.[team]||{},deck=deckProfile(player);
    const elo=Number(player.trueElo??player.elo??player.rankElo??warfrontAiProfile(player).elo)||600;
    const skill=clamp((elo-400)/1400,0,1);
    const execution=clamp(.15+skill*.5+(random()-.5)*.65,0,1);
    sides[team]={deck,skill,execution};
  }
  const winner=sides[match.winnerTeam],loser=sides[match.winnerTeam==='a'?'b':'a'];
  const dominance=clamp(.2+(winner.skill-loser.skill)*.35+(winner.execution-loser.execution)*.4+(winner.deck.power-loser.deck.power)*.25+random()*.35,0,1);
  const margin=clamp(Math.round(1+99*dominance),1,100);
  const durationMs=Math.round(360+random()*600-dominance*150)*1000;
  const losingFate=Math.round(35+loser.deck.power*65+loser.execution*55);
  const playerStats={},statModel={};
  for(const team of ['a','b']){
    const {deck,skill,execution}=sides[team];
    playerStats[team]={totalFateGenerated:losingFate+(team===match.winnerTeam?margin:0),fateDifferential:team===match.winnerTeam?margin:0,
      consolidations:clamp(Math.round(6+14*clamp(deck.consolidation*.35+execution*.45+skill*.1+(random()-.5)*.6,0,1)),6,20),durationMs};
    statModel[team]={deckId:deck.id,execution};
  }
  return Object.assign(match,{statsSource:'simulated',statsVersion:STATS_VERSION,statModel,playerStats,stats:{...playerStats[match.winnerTeam]}});
}
