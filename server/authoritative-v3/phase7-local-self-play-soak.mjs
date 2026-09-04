#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {
  assertInvariants,
  canonicalHash,
  createInitialState,
  legalCommandTemplates,
  multiplayerEligibleCardIds,
  multiplayerEligibleLandscapeIds,
  projectStateForPlayer,
  reduceCommand
} from '../../shared/engine/index.mjs';
import {findCard} from '../../shared/engine/selectors.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..', '..');

function option(name, fallback){
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

function integerOption(name, fallback, min, max){
  return Math.max(min, Math.min(max, Math.trunc(Number(option(name, fallback)) || fallback)));
}

function makeRng(seed){
  let value = 2166136261;
  for(const char of String(seed)){
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  value >>>= 0;
  return function random(){
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 0x100000000;
  };
}

function rotatedDeck(ids, offset, stride){
  const deck = [];
  let cursor = ((offset % ids.length) + ids.length) % ids.length;
  while(deck.length < 40){
    deck.push(ids[cursor]);
    cursor = (cursor + stride) % ids.length;
  }
  return deck;
}

function allCards(state){
  const cards = [];
  for(const player of state.players || []){
    for(const pile of ['deck', 'hand', 'discard', 'limbo']) cards.push(...(player[pile] || []));
  }
  for(const zone of state.board || []){
    for(const row of zone || []) for(const card of row || []) if(card) cards.push(card);
  }
  return cards;
}

function cardForTemplate(state, template){
  const iid = template?.payload?.sourceIid
    || template?.payload?.cardIid
    || template?.payload?.targetIid
    || template?.payload?.reactionIid;
  if(!iid) return null;
  return allCards(state).find(card=>String(card.iid) === String(iid)) || null;
}

function commandSignature(template){
  return `${String(template?.type || '')}:${JSON.stringify(template?.payload || {})}`;
}

function coverageKey(state, template){
  const card = cardForTemplate(state, template);
  return `${String(template?.type || '')}:${String(card?.id || '')}`;
}

function chooseTemplate(state, templates, context){
  const {rng, actionsThisTurn, maxActionsPerTurn, usedThisTurn, rejectedThisTurn, exercisedThisGame} = context;
  const promptActive = !!(state.pendingPrompt || state.pendingHandLimit);
  if(!promptActive && actionsThisTurn >= maxActionsPerTurn){
    const endTurn = templates.find(template=>template.type === 'END_TURN');
    if(!endTurn) throw new Error('active player cannot end a settled turn');
    return endTurn;
  }

  const usable = templates.filter(template=>{
    if(template.type === 'CONCEDE') return false;
    if(promptActive) return !usedThisTurn.has(commandSignature(template));
    if(template.type === 'END_TURN') return false;
    return !usedThisTurn.has(commandSignature(template))
      && !rejectedThisTurn.has(coverageKey(state, template));
  });
  if(!usable.length){
    const endTurn = templates.find(template=>template.type === 'END_TURN');
    if(endTurn) return endTurn;
    throw new Error(promptActive ? 'pending prompt has no legal answer' : 'active player has no progress command');
  }

  const weights = {
    ANSWER_PROMPT:700,
    DISCARD_TO_HAND_LIMIT:680,
    ACTIVATE_LANDSCAPE:620,
    ACTIVATE_EFFECT:600,
    SET_ADAPTIVE_TOKEN:540,
    SET_CARD_FROM_DECK:480,
    FLIP_CARD:430,
    MOVE_CARD:400,
    CONSOLIDATE_CARD:360,
    SET_CARD:300
  };
  const scored = usable.map(template=>{
    const signature = commandSignature(template);
    const interaction = coverageKey(state, template);
    let score = Number(weights[template.type] || 100);
    if(!exercisedThisGame.has(interaction)) score += 900;
    if(promptActive && template.payload?.cancel === true) score -= 260;
    if(promptActive && String(template.payload?.choice || '') === 'DECLINE') score -= 180;
    score += rng() * 120;
    return {template, signature, score};
  }).sort((a, b)=>b.score - a.score);
  return scored[Math.floor(rng() * Math.min(4, scored.length))].template;
}

function addCount(target, key, amount = 1){
  const normalized = String(key || '(none)');
  target[normalized] = (target[normalized] || 0) + amount;
}

function createCoverage(){
  return {
    commandTypes:{},
    cardIds:{},
    eventTypes:{},
    promptTypes:{},
    landscapeIds:{},
    landscapeCommandPairs:{},
    landscapeCardPairs:{},
    reactionSelections:{},
    rejectionCodes:{}
  };
}

function mergeCoverage(target, source){
  for(const bucket of Object.keys(target)){
    for(const [key, count] of Object.entries(source[bucket] || {})) addCount(target[bucket], key, count);
  }
}

function recordCoverage(coverage, state, template, result){
  const type = String(template.type || '');
  const card = cardForTemplate(state, template);
  const landscape = String(state.landscapeId || '');
  addCount(coverage.commandTypes, type);
  addCount(coverage.landscapeIds, landscape);
  addCount(coverage.landscapeCommandPairs, `${landscape}|${type}`);
  if(card){
    addCount(coverage.cardIds, card.id);
    addCount(coverage.landscapeCardPairs, `${landscape}|${card.id}|${type}`);
  }
  if(state.pendingPrompt) addCount(coverage.promptTypes, state.pendingPrompt.type);
  if(state.pendingHandLimit) addCount(coverage.promptTypes, 'HAND_LIMIT');
  if(result?.ok === true
    && state.pendingPrompt?.type === 'REACTION'
    && template.payload?.reactionIid){
    const reactionCard = allCards(state).find(card=>
      String(card.iid) === String(template.payload.reactionIid)
    );
    addCount(
      coverage.reactionSelections,
      `${String(reactionCard?.id || '(unknown)')}|${String(template.payload.choice || '(none)')}`
    );
  }
  for(const event of result.events || []) addCount(coverage.eventTypes, event.type);
  if(result?.ok === false) addCount(coverage.rejectionCodes, result.rejection?.code || 'UNKNOWN');
}

function compactTraceEntry(state, template, result){
  const card = cardForTemplate(state, template);
  return {
    revision:Number(state.revision),
    turn:Number(state.turn),
    activePlayer:Number(state.activePlayer),
    landscapeId:String(state.landscapeId || ''),
    pendingPrompt:String(state.pendingPrompt?.type || (state.pendingHandLimit ? 'HAND_LIMIT' : '')),
    type:String(template.type || ''),
    cardId:String(card?.id || ''),
    payload:template.payload || {},
    resultOk:result?.ok === true,
    rejection:result?.ok === false ? result.rejection || null : null,
    stateHash:String(result?.stateHash || '')
  };
}

function verifyPlayerViews(state){
  for(let playerIndex = 0; playerIndex < 2; playerIndex += 1){
    const view = projectStateForPlayer(state, playerIndex);
    const opponent = view.players[playerIndex === 0 ? 1 : 0];
    if(state.landscapeId !== 'igb12' && Object.prototype.hasOwnProperty.call(opponent, 'hand')){
      throw new Error(`player ${playerIndex} projection leaked the opponent hand`);
    }
    if(!Number.isInteger(Number(opponent.handCount)) || Number(opponent.handCount) < 0){
      throw new Error(`player ${playerIndex} projection has an invalid opponent hand count`);
    }
  }
}

function runGame(gameIndex, settings){
  const catalog = getCardCatalog();
  const eligibleSet = new Set(multiplayerEligibleCardIds().map(String));
  const eligibleIds = catalog.cards.map(card=>String(card.id)).filter(id=>eligibleSet.has(id));
  const landscapes = multiplayerEligibleLandscapeIds();
  if(eligibleIds.length < 40) throw new Error('authoritative soak requires at least 40 eligible cards');
  if(landscapes.length !== 24) throw new Error(`authoritative soak expected 24 landscapes, found ${landscapes.length}`);
  const seed = `${settings.seed}:game:${gameIndex}`;
  const landscapeId = landscapes[gameIndex % landscapes.length];
  const offset = (gameIndex * 17) % eligibleIds.length;
  const stateInput = {
    matchId:`SOAK-${gameIndex}-${landscapeId}`,
    seed,
    handSize:12,
    maxTurns:20,
    activePlayer:gameIndex % 2,
    landscapeId,
    cardDefinitions:catalog.cards,
    players:[
      {id:'p0', name:'Soak Player 0', deckIds:rotatedDeck(eligibleIds, offset, 7)},
      {id:'p1', name:'Soak Player 1', deckIds:rotatedDeck(eligibleIds, offset + 31, 11)}
    ]
  };
  let state = createInitialState(stateInput);
  const initialState = state;
  const rng = makeRng(seed);
  const coverage = createCoverage();
  const trace = [];
  const usedThisTurn = new Set();
  const rejectedThisTurn = new Set();
  const exercisedThisGame = new Set();
  const issues = [];
  let turnMarker = `${state.turn}:${state.activePlayer}`;
  let actionsThisTurn = 0;
  let steps = 0;
  assertInvariants(state);
  verifyPlayerViews(state);

  while(!state.outcome){
    if(steps >= settings.maxSteps) throw Object.assign(new Error('game exceeded the progress safety bound'), {trace});
    const nextTurnMarker = `${state.turn}:${state.activePlayer}`;
    if(nextTurnMarker !== turnMarker){
      turnMarker = nextTurnMarker;
      actionsThisTurn = 0;
      usedThisTurn.clear();
      rejectedThisTurn.clear();
    }
    const promptOwner = state.pendingPrompt?.playerIndex ?? state.pendingHandLimit?.playerIndex;
    const actor = Number.isInteger(Number(promptOwner)) ? Number(promptOwner) : Number(state.activePlayer);
    const templates = legalCommandTemplates(state, actor);
    if(!templates.length) throw Object.assign(new Error('game reached a state with no legal commands'), {trace});
    let template = null;
    try{
      template = chooseTemplate(state, templates, {
        rng,
        actionsThisTurn,
        maxActionsPerTurn:settings.maxActionsPerTurn,
        usedThisTurn,
        rejectedThisTurn,
        exercisedThisGame
      });
    }catch(error){
      error.trace = [...trace];
      error.issues = [...issues];
      error.pendingPrompt = state.pendingPrompt || null;
      error.pendingHandLimit = state.pendingHandLimit || null;
      throw error;
    }
    const preState = state;
    const signature = commandSignature(template);
    const interaction = coverageKey(state, template);
    const command = {
      commandId:`soak:${gameIndex}:${steps}`,
      matchId:state.matchId,
      expectedRevision:state.revision,
      type:template.type,
      payload:template.payload || {}
    };
    const preHash = canonicalHash(preState);
    const result = reduceCommand(state, command, {playerId:`p${actor}`});
    recordCoverage(coverage, preState, template, result);
    trace.push(compactTraceEntry(preState, template, result));
    if(trace.length > 100) trace.shift();
    if(!result.ok){
      if(canonicalHash(preState) !== preHash){
        throw Object.assign(new Error(`rejected ${template.type} command mutated authoritative state`), {trace});
      }
      issues.push({
        gameIndex,
        seed,
        landscapeId,
        turn:Number(preState.turn),
        revision:Number(preState.revision),
        type:String(template.type || ''),
        cardId:String(cardForTemplate(preState, template)?.id || ''),
        code:String(result.rejection?.code || 'UNKNOWN'),
        reason:String(result.rejection?.reason || 'unknown reason'),
        payload:template.payload || {},
        prompt:preState.pendingPrompt ? {
          type:preState.pendingPrompt.type,
          sourceIid:preState.pendingPrompt.sourceIid || null,
          sourceCardId:String(findCard(preState, preState.pendingPrompt.sourceIid)?.card?.id || ''),
          eligibleIids:preState.pendingPrompt.eligibleIids || null,
          eligibleCards:(preState.pendingPrompt.eligibleCards?.length
            ? preState.pendingPrompt.eligibleCards
            : (preState.pendingPrompt.eligibleIids || []).map(iid=>{
                const card = findCard(preState, iid)?.card;
                return {iid, id:String(card?.id || ''), copiedEffectId:String(card?.counters?.copiedEffectId || '')};
              })
          ).map(card=>({iid:card.iid, id:card.id, copiedEffectId:card.copiedEffectId || ''})),
          eligible:preState.pendingPrompt.eligible || null
        } : null,
        recentTrace:trace.slice(-6)
      });
      if(issues.length > 100){
        throw Object.assign(new Error('game exceeded the rejected-legal-command safety bound'), {trace});
      }
      usedThisTurn.add(signature);
      if(!preState.pendingPrompt && !preState.pendingHandLimit) rejectedThisTurn.add(interaction);
      steps += 1;
      continue;
    }
    if(Number(result.state.revision) <= Number(preState.revision)){
      throw Object.assign(new Error(`${template.type} did not advance the authoritative revision`), {trace});
    }
    if(canonicalHash(result.state) !== result.stateHash){
      throw Object.assign(new Error(`${template.type} returned a non-canonical state hash`), {trace});
    }
    state = result.state;
    assertInvariants(state);
    if(steps % 10 === 0 || template.type === 'END_TURN') verifyPlayerViews(state);
    if(!preState.pendingPrompt && !preState.pendingHandLimit && template.type !== 'END_TURN'){
      actionsThisTurn += 1;
      usedThisTurn.add(signature);
      exercisedThisGame.add(interaction);
    }
    steps += 1;
  }

  return {
    gameIndex,
    seed,
    landscapeId,
    steps,
    turns:Number(state.turn),
    winnerIndex:state.outcome?.winnerIndex ?? null,
    finalStateHash:canonicalHash(state),
    initialStateHash:canonicalHash(initialState),
    issues,
    coverage
  };
}

function serializeFailure(error, gameIndex, settings){
  return {
    gameIndex,
    seed:`${settings.seed}:game:${gameIndex}`,
    landscapeId:multiplayerEligibleLandscapeIds()[gameIndex % multiplayerEligibleLandscapeIds().length],
    message:String(error?.message || error),
    stack:String(error?.stack || ''),
    pendingPrompt:error?.pendingPrompt || null,
    pendingHandLimit:error?.pendingHandLimit || null,
    issues:Array.isArray(error?.issues) ? error.issues : [],
    trace:Array.isArray(error?.trace) ? error.trace : []
  };
}

function runShard(data){
  const coverage = createCoverage();
  const failures = [];
  const issues = [];
  const games = [];
  const startedAt = Date.now();
  const gameIndexes = Array.isArray(data.gameIndexes)
    ? data.gameIndexes
    : Array.from({length:data.count}, (_, offset)=>data.startIndex + offset);
  for(let offset = 0; offset < gameIndexes.length; offset += 1){
    const gameIndex = gameIndexes[offset];
    try{
      const result = runGame(gameIndex, data.settings);
      mergeCoverage(coverage, result.coverage);
      issues.push(...result.issues);
      games.push({
        gameIndex:result.gameIndex,
        seed:result.seed,
        landscapeId:result.landscapeId,
        steps:result.steps,
        turns:result.turns,
        winnerIndex:result.winnerIndex,
        finalStateHash:result.finalStateHash
      });
    }catch(error){
      failures.push(serializeFailure(error, gameIndex, data.settings));
    }
    if(parentPort && (offset + 1) % 10 === 0){
      parentPort.postMessage({kind:'progress', completed:offset + 1, failures:failures.length});
    }
  }
  return {games, failures, issues, coverage, elapsedMs:Date.now() - startedAt};
}

async function main(){
  const requestedIndexes = String(option('--indexes', ''))
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean)
    .map(value=>Number(value))
    .filter(value=>Number.isInteger(value) && value >= 0);
  const configuredGames = integerOption('--games', 1000, 1, 100000);
  const totalGames = requestedIndexes.length ? requestedIndexes.length : configuredGames;
  const startIndex = integerOption('--start-index', 0, 0, 1000000);
  const workerCount = integerOption('--workers', Math.min(8, Math.max(1, os.cpus().length - 1)), 1, 16);
  const settings = {
    seed:String(option('--seed', 'authority-v3-local-soak-v1')),
    maxActionsPerTurn:integerOption('--max-actions-per-turn', 10, 1, 30),
    maxSteps:integerOption('--max-steps', 1200, 40, 5000)
  };
  const outputPath = path.resolve(option(
    '--output',
    path.join(ROOT, '.tmp', 'authority-v3-soak', 'latest.json')
  ));
  const gameIndexes = requestedIndexes.length
    ? [...new Set(requestedIndexes)]
    : Array.from({length:totalGames}, (_, offset)=>startIndex + offset);
  const shards = Array.from(
    {length:Math.min(workerCount, gameIndexes.length)},
    ()=>({gameIndexes:[], settings})
  );
  gameIndexes.forEach((gameIndex, index)=>shards[index % shards.length].gameIndexes.push(gameIndex));
  for(const shard of shards) shard.count = shard.gameIndexes.length;
  const startedAt = Date.now();
  let reported = 0;
  process.stdout.write(`[authority-v3-soak] starting ${totalGames} games on ${shards.length} workers\n`);
  const results = await Promise.all(shards.map((data, workerIndex)=>new Promise((resolve, reject)=>{
    const worker = new Worker(SCRIPT_PATH, {workerData:data});
    let lastCompleted = 0;
    worker.on('message', message=>{
      if(message?.kind === 'progress'){
        reported += Math.max(0, Number(message.completed || 0) - lastCompleted);
        lastCompleted = Number(message.completed || 0);
        if(reported % 100 === 0 || reported === totalGames){
          process.stdout.write(`[authority-v3-soak] progress ${reported}/${totalGames}\n`);
        }
      }else if(message?.kind === 'complete'){
        reported += Math.max(0, data.count - lastCompleted);
        resolve(message.result);
      }
    });
    worker.on('error', reject);
    worker.on('exit', code=>{
      if(code !== 0) reject(new Error(`soak worker ${workerIndex} exited with code ${code}`));
    });
  })));

  const coverage = createCoverage();
  const failures = [];
  const issues = [];
  const games = [];
  for(const result of results){
    mergeCoverage(coverage, result.coverage);
    failures.push(...result.failures);
    issues.push(...result.issues);
    games.push(...result.games);
  }
  games.sort((a, b)=>a.gameIndex - b.gameIndex);
  failures.sort((a, b)=>a.gameIndex - b.gameIndex);
  issues.sort((a, b)=>a.gameIndex - b.gameIndex || a.revision - b.revision);
  const issueGroups = {};
  for(const issue of issues){
    const key = `${issue.type}|${issue.cardId}|${issue.code}|${issue.reason}`;
    const group = issueGroups[key] || {
      type:issue.type,
      cardId:issue.cardId,
      code:issue.code,
      reason:issue.reason,
      count:0,
      examples:[]
    };
    group.count += 1;
    if(group.examples.length < 5){
      group.examples.push({gameIndex:issue.gameIndex, seed:issue.seed, landscapeId:issue.landscapeId, turn:issue.turn, revision:issue.revision});
    }
    issueGroups[key] = group;
  }
  const eligibleCards = multiplayerEligibleCardIds().map(String);
  const eligibleCardCount = eligibleCards.length;
  const coveredEligibleCards = eligibleCards.filter(cardId=>Object.prototype.hasOwnProperty.call(coverage.cardIds, cardId));
  const summary = {
    format:'fates-authority-v3-local-self-play-soak-v1',
    generatedAt:new Date().toISOString(),
    requestedGames:totalGames,
    startIndex:requestedIndexes.length ? null : startIndex,
    requestedIndexes:requestedIndexes.length ? gameIndexes : null,
    completedGames:games.length,
    failedGames:failures.length,
    rejectedLegalCommands:issues.length,
    workers:shards.length,
    settings,
    elapsedMs:Date.now() - startedAt,
    coverageSummary:{
      landscapes:Object.keys(coverage.landscapeIds).length,
      eligibleLandscapes:multiplayerEligibleLandscapeIds().length,
      cards:coveredEligibleCards.length,
      eligibleCards:eligibleCardCount,
      uncoveredCards:eligibleCards.filter(cardId=>!coveredEligibleCards.includes(cardId)),
      commandTypes:Object.keys(coverage.commandTypes).length,
      promptTypes:Object.keys(coverage.promptTypes).length,
      eventTypes:Object.keys(coverage.eventTypes).length,
      landscapeCommandPairs:Object.keys(coverage.landscapeCommandPairs).length,
      landscapeCardPairs:Object.keys(coverage.landscapeCardPairs).length,
      reactionSelections:Object.keys(coverage.reactionSelections).length
    },
    coverage,
    issueGroups:Object.values(issueGroups).sort((a, b)=>b.count - a.count),
    issues,
    failures,
    games
  };
  fs.mkdirSync(path.dirname(outputPath), {recursive:true});
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok:failures.length === 0 && issues.length === 0,
    requestedGames:summary.requestedGames,
    completedGames:summary.completedGames,
    failedGames:summary.failedGames,
    rejectedLegalCommands:summary.rejectedLegalCommands,
    elapsedMs:summary.elapsedMs,
    coverage:summary.coverageSummary,
    outputPath
  }, null, 2)}\n`);
  if(failures.length || issues.length) process.exitCode = 1;
}

if(isMainThread){
  main().catch(error=>{
    process.stderr.write(`${String(error?.stack || error)}\n`);
    process.exitCode = 1;
  });
}else{
  try{
    parentPort.postMessage({kind:'complete', result:runShard(workerData)});
  }catch(error){
    throw error;
  }
}
