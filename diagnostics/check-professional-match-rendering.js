#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ACTION_TYPES = new Set([
  'set-card',
  'board-placement',
  'consolidation',
  'motion-play_card',
  'motion-draw_card',
  'motion-search_to_hand',
  'motion-deck_to_hand',
  'motion-deck_to_board',
  'motion-discard_card',
  'motion-destroy_card',
  'motion-return_to_hand',
  'motion-hand_discard',
  'motion-discard_to_hand',
  'motion-move_card',
  'motion-swap_cards',
  'motion-fate_gain',
  'motion-fate_loss',
  'motion-zone_win_flip'
]);

const args = process.argv.slice(2);
const files = [];
const required = {
  set: false,
  oneConsolidation: false,
  multiConsolidation: false,
  actions: Object.create(null)
};

function normalizeActionType(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/-/g, '_');
  if (lower === 'set' || lower === 'set_card') return 'set-card';
  if (lower === 'consolidate') return 'consolidation';
  if (lower === 'consolidation') return 'consolidation';
  if (lower.startsWith('motion_')) return lower.replace(/^motion_/, 'motion-');
  if (lower.startsWith('motion-')) return lower;
  if (/^[a-z0-9_]+$/.test(lower) && lower !== 'set-card') return 'motion-' + lower;
  return lower;
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--require-set') required.set = true;
  else if (arg === '--require-one-consolidation') required.oneConsolidation = true;
  else if (arg === '--require-multi-consolidation') required.multiConsolidation = true;
  else if (arg === '--require-action') {
    const type = normalizeActionType(args[++i]);
    if (!type) {
      console.error('--require-action needs an action type');
      process.exit(2);
    }
    required.actions[type] = (required.actions[type] || 0) + 1;
  }
  else if (arg === '--help' || arg === '-h') {
    console.log([
      'Usage: node diagnostics/check-professional-match-rendering.js [options] <jsonl...>',
      '',
      'Options:',
      '  --require-set',
      '  --require-one-consolidation',
      '  --require-multi-consolidation',
      '  --require-action <type>    Example: DRAW_CARD, SEARCH_TO_HAND, motion-discard_card'
    ].join('\n'));
    process.exit(0);
  } else {
    files.push(arg);
  }
}

if (!files.length) files.push('diagnostics/fate-match-performance-latest.jsonl');

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      error.message = `${file}:${index + 1}: ${error.message}`;
      throw error;
    }
  });
}

function addAction(map, action) {
  if (!action || !action.id) return;
  map.set(String(action.id), action);
}

function addVfx(map, recipe) {
  if (!recipe || !recipe.id) return;
  map.set(String(recipe.id), recipe);
}

function collect(file) {
  const rows = readJsonl(file);
  const actions = new Map();
  const vfx = new Map();

  for (const row of rows) {
    if (row && row.snapshot && row.snapshot.actionPresentation && Array.isArray(row.snapshot.actionPresentation.recent)) {
      row.snapshot.actionPresentation.recent.forEach(action => addAction(actions, action));
    }
    if (row && row.actionPresentation && Array.isArray(row.actionPresentation.recent)) {
      row.actionPresentation.recent.forEach(action => addAction(actions, action));
    }
    if (row && row.frameInterval && Array.isArray(row.frameInterval.slowFrameDetails)) {
      row.frameInterval.slowFrameDetails.forEach(detail => addAction(actions, detail && detail.action && detail.action.recent));
    }
    if (row && row.snapshot && row.snapshot.vfx && row.snapshot.vfx.recent && Array.isArray(row.snapshot.vfx.recent.recentRecipes)) {
      row.snapshot.vfx.recent.recentRecipes.forEach(recipe => addVfx(vfx, recipe));
    }
    if (row && row.vfx && row.vfx.recent && Array.isArray(row.vfx.recent.recentRecipes)) {
      row.vfx.recent.recentRecipes.forEach(recipe => addVfx(vfx, recipe));
    }
  }

  const interesting = Array.from(actions.values())
    .filter(action => ACTION_TYPES.has(action.type))
    .sort((a, b) => Number(String(a.id).split(':').pop()) - Number(String(b.id).split(':').pop()));
  const recipes = Array.from(vfx.values()).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  const sessionId = rows.find(row => row && row.sessionId)?.sessionId || rows.find(row => row && row.snapshot && row.snapshot.sessionId)?.snapshot.sessionId || '';
  return { file, sessionId, rows: rows.length, actions: interesting, recipes };
}

function actionFailures(action) {
  const failures = [];
  const animation = action.animation || {};
  const preflight = action.preflight || {};
  const status = String(action.status || '');

  if (status && status !== 'complete') failures.push(`status=${status}`);
  if (action.degraded) failures.push(`degraded=${action.degradedReason || true}`);
  if (preflight.ready === false) failures.push('preflight not ready');
  if (Array.isArray(preflight.missing) && preflight.missing.length) failures.push(`preflight missing=${preflight.missing.length}`);
  if ((Number(animation.fullSceneRedraws) || 0) !== 0) failures.push(`fullSceneRedraws=${animation.fullSceneRedraws}`);
  if ((Number(animation.layoutRebuilds) || 0) !== 0) failures.push(`layoutRebuilds=${animation.layoutRebuilds}`);
  if ((Number(animation.broadRenderRequests) || 0) !== 0) failures.push(`broadRenderRequests=${animation.broadRenderRequests}`);
  if ((Number(animation.broadRenderSchedules) || 0) !== 0) failures.push(`broadRenderSchedules=${animation.broadRenderSchedules}`);
  if ((Number(animation.textureMisses) || 0) !== 0) failures.push(`textureMisses=${animation.textureMisses}`);
  if ((Number(animation.legacyActionDomMutations) || 0) !== 0) failures.push(`legacyActionDomMutations=${animation.legacyActionDomMutations}`);
  if ((Number(animation.forbiddenCount) || 0) !== 0) failures.push(`forbiddenCount=${animation.forbiddenCount}`);
  return failures;
}

function tributeCountFor(action, recipes) {
  if (typeof action.tributeCount === 'number') return action.tributeCount;
  const actionAt = Number(action.at) || 0;
  const match = recipes
    .filter(recipe => recipe.type === 'CONSOLIDATE')
    .slice()
    .reverse()
    .find(recipe => Math.abs((Number(recipe.at) || 0) - actionAt) < 1000);
  const tributes = match && match.payloadSummary ? Number(match.payloadSummary.tributes) : NaN;
  return Number.isFinite(tributes) ? tributes : null;
}

const reports = files.map(file => collect(file));
const failures = [];
let setCount = 0;
let oneConsolidationCount = 0;
let multiConsolidationCount = 0;
const actionTypeCounts = Object.create(null);

for (const report of reports) {
  for (const action of report.actions) {
    const actionBad = actionFailures(action);
    if (actionBad.length) {
      failures.push({
        file: report.file,
        sessionId: report.sessionId,
        id: action.id,
        type: action.type,
        failures: actionBad
      });
    }
    actionTypeCounts[action.type] = (actionTypeCounts[action.type] || 0) + 1;
    if (action.type === 'set-card') setCount++;
    if (action.type === 'consolidation') {
      const tributes = tributeCountFor(action, report.recipes);
      if (tributes === 1) oneConsolidationCount++;
      if (tributes > 1) multiConsolidationCount++;
    }
  }
}

if (required.set && setCount < 1) failures.push({ requirement: 'set-card action', failures: ['missing'] });
if (required.oneConsolidation && oneConsolidationCount < 1) failures.push({ requirement: 'one-card consolidation', failures: ['missing'] });
if (required.multiConsolidation && multiConsolidationCount < 1) failures.push({ requirement: 'multi-card consolidation', failures: ['missing'] });
Object.keys(required.actions).forEach(type => {
  const expected = required.actions[type];
  const actual = actionTypeCounts[type] || 0;
  if (actual < expected) failures.push({ requirement: `${type} action`, expected, actual, failures: ['missing'] });
});

const summary = {
  pass: failures.length === 0,
  files: reports.map(report => ({
    file: path.normalize(report.file),
    sessionId: report.sessionId,
    rows: report.rows,
    checkedActions: report.actions.length,
    setCards: report.actions.filter(action => action.type === 'set-card').length,
    consolidations: report.actions.filter(action => action.type === 'consolidation').map(action => ({
      id: action.id,
      tributes: tributeCountFor(action, report.recipes),
      frames: action.animation && action.animation.frameCount,
      maxFrameGapMs: action.animation && action.animation.maxFrameGapMs
    }))
  })),
  totals: {
    checkedActions: reports.reduce((sum, report) => sum + report.actions.length, 0),
    setCards: setCount,
    oneCardConsolidations: oneConsolidationCount,
    multiCardConsolidations: multiConsolidationCount,
    byType: Object.assign({}, actionTypeCounts)
  },
  failures
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 1);
