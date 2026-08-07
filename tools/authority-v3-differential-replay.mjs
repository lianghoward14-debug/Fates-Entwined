import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  legalCommandTemplates,
  reduceCommand,
  stableStringify
} from '../shared/engine/index.mjs';
import {translateLegacyRecorderAction} from './authority-v3-legacy-normalization.mjs';

export const DIFFERENTIAL_CLASSIFICATIONS = new Set([
  'new-engine-defect',
  'existing-single-player-defect',
  'intentional-rule-clarification',
  'cosmetic-only-difference'
]);

export function firstDifference(expected, actual, currentPath = ''){
  if(Object.is(expected, actual)) return null;
  if(typeof expected !== typeof actual || expected === null || actual === null){
    return {path:currentPath || '(root)', expected, actual};
  }
  if(Array.isArray(expected) || Array.isArray(actual)){
    if(!Array.isArray(expected) || !Array.isArray(actual)){
      return {path:currentPath || '(root)', expected, actual};
    }
    if(expected.length !== actual.length){
      return {path:`${currentPath}.length`, expected:expected.length, actual:actual.length};
    }
    for(let index = 0; index < expected.length; index += 1){
      const difference = firstDifference(expected[index], actual[index], `${currentPath}[${index}]`);
      if(difference) return difference;
    }
    return null;
  }
  if(typeof expected === 'object'){
    for(const key of Object.keys(expected).sort()){
      if(!Object.hasOwn(actual, key)){
        return {path:currentPath ? `${currentPath}.${key}` : key, expected:expected[key], actual:undefined};
      }
      const difference = firstDifference(
        expected[key],
        actual[key],
        currentPath ? `${currentPath}.${key}` : key
      );
      if(difference) return difference;
    }
    return null;
  }
  return {path:currentPath || '(root)', expected, actual};
}

function directEngineAction(action){
  return {
    state:action.preState,
    command:action.command,
    actor:{playerId:action.playerId, playerIndex:action.playerIndex},
    expected:action.expectedPostState,
    normalizeActual:state=>state
  };
}

function translatedAction(action, corpus){
  return corpus?.format === 'fates-legacy-action-corpus-v2'
    ? translateLegacyRecorderAction(action, corpus)
    : directEngineAction(action);
}

function sameDestination(left, right){
  return Number(left?.z ?? left?.zone) === Number(right?.z ?? right?.zone)
    && Number(left?.r ?? left?.row) === Number(right?.r ?? right?.row)
    && Number(left?.c ?? left?.column) === Number(right?.c ?? right?.column);
}

function templateForRecordedChoice(state, actor, choice){
  const templates = legalCommandTemplates(state, actor.playerIndex)
    .filter(template=>template.type === 'ANSWER_PROMPT');
  return templates.find(template=>{
    const payload = template.payload || {};
    if(choice?.cancel === true) return payload.cancel === true;
    if(choice?.destination) return sameDestination(payload.destination, choice.destination);
    if(choice?.choice !== undefined) return String(payload.choice || '') === String(choice.choice);
    if(choice?.selectedIid !== undefined) return String(payload.selectedIid || '') === String(choice.selectedIid);
    if(Array.isArray(choice?.selectedIids)){
      return stableStringify((payload.selectedIids || []).map(String).sort())
        === stableStringify(choice.selectedIids.map(String).sort());
    }
    return false;
  }) || null;
}

export function reduceTranslatedAction(translated){
  let result = reduceCommand(translated.state, translated.command, translated.actor);
  if(!result.ok) return result;
  for(let index = 0; index < (translated.followupChoices || []).length; index += 1){
    if(!result.state.pendingPrompt) break;
    const choice = translated.followupChoices[index];
    const template = templateForRecordedChoice(result.state, translated.actor, choice);
    if(!template){
      return {
        ok:false,
        rejection:{
          code:'RECORDED_CHOICE_UNTRANSLATABLE',
          message:`recorded ${String(choice?.kind || 'choice')} does not match a legal v3 prompt answer`
        }
      };
    }
    result = reduceCommand(result.state, {
      commandId:`${translated.command.commandId}:choice:${index}`,
      matchId:result.state.matchId,
      expectedRevision:result.state.revision,
      ...template
    }, translated.actor);
    if(!result.ok) return result;
  }
  return result;
}

function expectedClassification(action){
  const classification = String(action?.expectedMismatch?.classification || '');
  return DIFFERENTIAL_CLASSIFICATIONS.has(classification) ? classification : '';
}

export function runDifferentialCorpus(corpus, corpusName = '(memory)'){
  if(!Array.isArray(corpus?.actions)) throw new Error('corpus actions must be an array');
  const report = {
    format:'fates-authority-v3-differential-report-v2',
    corpus:corpusName,
    sourceFormat:String(corpus.format || 'engine-state-v1'),
    compared:0,
    matched:0,
    classifiedMismatches:[],
    unexpectedMismatches:[],
    translationFailures:[]
  };
  for(const action of corpus.actions){
    report.compared += 1;
    let translated;
    try{
      translated = translatedAction(action, corpus);
    }catch(error){
      report.translationFailures.push({
        index:action.index,
        commandType:action.command?.type,
        code:String(error?.code || 'CORPUS_TRANSLATION_FAILED'),
        reason:String(error?.message || error)
      });
      continue;
    }
    const result = reduceTranslatedAction(translated);
    let mismatch = null;
    if(!result.ok){
      mismatch = {
        index:action.index,
        commandId:translated.command?.commandId,
        kind:'new-engine-rejection',
        rejection:result.rejection
      };
    }else{
      const actual = translated.normalizeActual(result.state);
      const difference = firstDifference(translated.expected, actual);
      if(difference){
        mismatch = {
          index:action.index,
          commandId:translated.command?.commandId,
          kind:'normalized-state-difference',
          engineHash:result.stateHash,
          expectedHash:action.expectedPostStateHash,
          firstDifference:difference
        };
      }
    }
    if(!mismatch){
      report.matched += 1;
      continue;
    }
    const classification = expectedClassification(action);
    if(classification){
      report.classifiedMismatches.push({
        ...mismatch,
        classification,
        rationale:String(action.expectedMismatch?.rationale || '')
      });
    }else{
      report.unexpectedMismatches.push({...mismatch, classification:'unclassified'});
    }
  }
  report.ok = report.translationFailures.length === 0 && report.unexpectedMismatches.length === 0;
  return report;
}

function main(){
  const corpusPath = process.argv[2];
  if(!corpusPath) throw new Error('usage: node tools/authority-v3-differential-replay.mjs <corpus.json>');
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const report = runDifferentialCorpus(corpus, corpusPath);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if(!report.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if(invokedPath && invokedPath === fileURLToPath(import.meta.url)) main();
