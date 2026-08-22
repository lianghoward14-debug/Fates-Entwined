import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CARD_RULE_ORACLE,
  LANDSCAPE_RULE_ORACLE,
  auditRuleOraclePresentationBatch,
  auditRuleOracleState,
  cardRuleOracle,
  expectedEffectiveFateFromOracle,
  validateRuleOracleCatalog
} from '../../shared/engine/rules-oracle.mjs';
import {multiplayerEligibleCardIds} from '../../shared/engine/cards/registry.mjs';
import {createInitialState, effectiveFate, findBoardCard} from '../../shared/engine/index.mjs';

const eligible = multiplayerEligibleCardIds();
const landscapes = Array.from({length:20}, (_value, index)=>`igb${index + 1}`);
const catalog = validateRuleOracleCatalog(eligible, landscapes);
assert.equal(catalog.ok, true, catalog.errors.join('\n'));
assert.equal(catalog.cardCount, 114);
assert.equal(catalog.landscapeCount, 20);
assert.equal(Object.keys(CARD_RULE_ORACLE).length, 114);
assert.equal(Object.keys(LANDSCAPE_RULE_ORACLE).length, 20);

for(const id of eligible){
  const rule = cardRuleOracle(id);
  assert.equal(rule.reviewed, true, `${id} must be manually reviewed`);
  assert.equal(rule.authority, 'PRINTED_TEXT_AND_SINGLEPLAYER');
  assert(rule.resolution.length >= 20, `${id} must have a substantive resolution contract`);
  assert(rule.forbidden.length >= 8, `${id} must include negative cases plus global invariants`);
  assert(rule.presentation.includes('MODALS_AND_PICKERS_OPEN_LAST'));
}

assert.match(cardRuleOracle('02').resolution, /row owned by Anicka’s controller/);
assert(cardRuleOracle('02').forbidden.includes('SAFE_ROW_ASSIGNED_TO_OPPONENT'));
assert.match(cardRuleOracle('03').resolution, /snapshot × 2 \+ 5 exactly once/);
assert(cardRuleOracle('03').forbidden.includes('SECOND_ACTIVATION'));
assert(cardRuleOracle('41').forbidden.includes('COUNTS_SAME_EFFECT_USE_MULTIPLE_TIMES'));
assert(cardRuleOracle('87').forbidden.includes('SOURCE_SELF_QUALIFIES_AS_PRIOR_SUPPORTER_EVENT'));
assert(cardRuleOracle('100').forbidden.includes('SOURCE_QUALIFIES_ITSELF_FOR_PLUS_3'));

function cardValue(id, iid, controller){
  return {id, iid, controller, owner:controller, currentFate:1};
}

function anickaView(controller){
  const row = 3;
  const source = cardValue('02', `anicka-${controller}`, controller);
  const board = Array.from({length:3}, ()=>Array.from({length:3}, ()=>[null, null, null]));
  board[1].push([null, null, null]);
  board[1][controller === 0 ? 2 : 0][0] = source;
  return {
    playerIndex:controller,
    state:{
      matchId:`anicka-${controller}`,
      revision:2,
      players:[{hand:[]},{hand:[]}],
      board,
      geometry:{
        rowOwners:[[1,-1,0],[1,-1,0,controller],[1,-1,0]],
        playableExtraSquares:[0,1,2].map(c=>({z:1,r:row,c,owner:controller}))
      }
    }
  };
}

for(const controller of [0, 1]){
  const view = anickaView(controller);
  const audit = auditRuleOraclePresentationBatch(view, {
    id:`batch-anicka-${controller}`,
    events:[{type:'SAFE_ROW_ADDED', sourceIid:`anicka-${controller}`, playerIndex:controller, zone:1, row:3}]
  });
  assert.equal(audit.ok, true, JSON.stringify(audit.violations));
  const reversed = auditRuleOraclePresentationBatch(view, {
    id:`batch-anicka-reversed-${controller}`,
    events:[{type:'SAFE_ROW_ADDED', sourceIid:`anicka-${controller}`, playerIndex:1-controller, zone:1, row:3}]
  });
  assert.equal(reversed.ok, false);
  assert(reversed.violations.some(item=>item.code === 'ANICKA_SAFE_ROW_WRONG_BENEFICIARY'));
}

const ukuleleSource = {...cardValue('87', 'ukulele-source', 0), type:'Supporter'};
const ukuleleCharacter = {...cardValue('31', 'ukulele-character', 0), type:'Character'};
const ukuleleSupporter = {...cardValue('09', 'ukulele-supporter', 0), type:'Supporter'};
const ukuleleView = {
  playerIndex:0,
  state:{
    matchId:'ukulele-oracle',
    revision:3,
    players:[{hand:[]},{hand:[]}],
    board:[[[ukuleleCharacter,ukuleleSupporter,null],[null,null,null],[ukuleleSource,null,null]],[[null,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]]],
    geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]],playableExtraSquares:[]}
  }
};
let ukuleleAudit = auditRuleOraclePresentationBatch(ukuleleView, {
  id:'ukulele-consolidated-character',
  events:[{type:'FATE_CHANGED',sourceIid:'ukulele-source',cardIid:'ukulele-character',before:1,after:4,amount:3,reason:'KVETKA_BALLAD_CONSOLIDATION'}]
});
assert.equal(ukuleleAudit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(ukuleleAudit.violations));
ukuleleAudit = auditRuleOraclePresentationBatch(ukuleleView, {
  id:'ukulele-supporter-is-not-consolidation-target',
  events:[{type:'FATE_CHANGED',sourceIid:'ukulele-source',cardIid:'ukulele-supporter',before:1,after:4,amount:3,reason:'KVETKA_BALLAD_CONSOLIDATION'}]
});
assert(ukuleleAudit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'));

const whisperMajaSource = {
  ...cardValue('whisper17', 'whisper-maja-source', 0),
  type:'Coordinator',
  counters:{copiedPassiveId:'bh08', whisperLandscapeToken:true}
};
const whisperMajaTarget = {...cardValue('31', 'whisper-maja-target', 0), type:'Character'};
const whisperMajaView = {
  playerIndex:0,
  state:{
    matchId:'whisper-maja-oracle',
    revision:4,
    players:[{hand:[]},{hand:[]}],
    board:[[[whisperMajaSource,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[whisperMajaTarget,null,null]]],
    geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]],playableExtraSquares:[]}
  }
};
const whisperMajaAudit = auditRuleOraclePresentationBatch(whisperMajaView, {
  id:'whisper-maja-field-wide',
  events:[{type:'FATE_CHANGED',sourceIid:'whisper-maja-source',cardIid:'whisper-maja-target',before:1,after:3,amount:2,reason:'MISCHIEVOUS_ACTIVITIES'}]
});
assert.equal(
  whisperMajaAudit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'),
  false,
  JSON.stringify(whisperMajaAudit.violations)
);

const rozsiSource = {...cardValue('34', 'rozsi-source', 0), type:'Coordinator'};
const rozsiControlledTarget = {...cardValue('68', 'rozsi-controlled-target', 0), type:'Character'};
const rozsiOpponentTarget = {...cardValue('68', 'rozsi-opponent-target', 1), type:'Character'};
const rozsiView = {
  playerIndex:0,
  state:{
    matchId:'rozsi-oracle',
    revision:4,
    players:[{hand:[]},{hand:[]}],
    board:[[[null,null,null],[null,null,null],[rozsiSource,rozsiControlledTarget,rozsiOpponentTarget]],[[null,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]]],
    geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]],playableExtraSquares:[]}
  }
};
for(const target of [rozsiControlledTarget, rozsiOpponentTarget]){
  const rozsiAudit = auditRuleOraclePresentationBatch(rozsiView, {
    id:`rozsi-movement-${target.iid}`,
    events:[{
      type:'FATE_CHANGED',
      sourceIid:rozsiSource.iid,
      semanticSourceCardId:'39',
      cardIid:target.iid,
      before:1,
      after:4,
      amount:3,
      reason:'ROZSI_MOVEMENT_BONUS'
    }]
  });
  assert.equal(rozsiAudit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(rozsiAudit.violations));
}

const howard = cardValue('03', 'howard-0', 0);
const howardTarget = cardValue('31', 'target-1', 1);
const howardView = {
  playerIndex:0,
  state:{
    matchId:'howard-oracle',
    revision:3,
    players:[{hand:[]},{hand:[]}],
    board:[[[howardTarget,null,null],[null,null,null],[howard,null,null]],[[null,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]]],
    geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]],playableExtraSquares:[]}
  }
};
let audit = auditRuleOraclePresentationBatch(howardView, {
  id:'howard-good',
  events:[{type:'FATE_CHANGED', sourceIid:'howard-0', cardIid:'target-1', before:4, after:13, amount:9}]
});
assert.equal(audit.ok, true);

const jake = cardValue('38', 'jake-0', 0);
const jakeSupporter = {...cardValue('31', 'jake-food-0', 0), type:'Supporter'};
const jakeView = {
  playerIndex:0,
  state:{
    matchId:'jake-oracle',
    revision:4,
    players:[{hand:[]},{hand:[]}],
    board:[[[null,null,null],[null,null,null],[jake,jakeSupporter,null]],[[null,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]]],
    geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]],playableExtraSquares:[]}
  }
};
audit = auditRuleOraclePresentationBatch(jakeView, {
  id:'jake-good',
  events:[
    {type:'CARD_DISCARDED', sourceIid:'jake-0', cardIid:'jake-food-0', reason:'EFFECT'},
    {type:'FATE_CHANGED', sourceIid:'jake-0', cardIid:'jake-0', before:1, after:5, amount:4, reason:'JAKE_FATE_GAIN'}
  ]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
audit = auditRuleOraclePresentationBatch(howardView, {
  id:'howard-double',
  events:[
    {type:'FATE_CHANGED', sourceIid:'howard-0', cardIid:'target-1', before:4, after:13, amount:9},
    {type:'FATE_CHANGED', sourceIid:'howard-0', cardIid:'target-1', before:13, after:31, amount:18}
  ]
});
assert(audit.violations.some(item=>item.code === 'HOWARD_DUPLICATE_FATE_MUTATION'));
audit = auditRuleOraclePresentationBatch(howardView, {
  id:'howard-wrong-formula',
  events:[{type:'FATE_CHANGED', sourceIid:'howard-0', cardIid:'target-1', before:4, after:18, amount:14}]
});
assert(audit.violations.some(item=>item.code === 'HOWARD_WRONG_FATE_FORMULA'));

const fixedSource = cardValue('05', 'fixed-source', 0);
const fixedTarget = cardValue('31', 'fixed-target', 0);
const fixedView = {
  playerIndex:0,
  state:{
    matchId:'generic-oracle', revision:4, players:[{hand:[]},{hand:[]}],
    board:[[[fixedSource,fixedTarget,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]],[[null,null,null],[null,null,null],[null,null,null]]],
    geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]],playableExtraSquares:[]}
  }
};
audit = auditRuleOraclePresentationBatch(fixedView, {
  id:'wrong-fixed-delta',
  events:[{type:'FATE_CHANGED',sourceIid:'fixed-source',cardIid:'fixed-target',before:1,after:5,amount:4}]
});
assert(audit.violations.some(item=>item.code === 'WRONG_FIXED_FATE_DELTA'));
audit = auditRuleOraclePresentationBatch(fixedView, {
  id:'clamped-fixed-fate-loss',
  events:[{type:'FATE_CHANGED',sourceIid:'fixed-target',cardIid:'fixed-target',before:1,after:0,amount:-1}]
});
// Card 31 prints a fixed -3. The target only has 1 Fate, so the authoritative
// zero floor makes the observable delta -1; this is a valid full resolution.
assert.equal(audit.violations.some(item=>item.code === 'WRONG_FIXED_FATE_DELTA'), false);
const greatOakSource = cardValue('47', 'great-oak-source', 0);
const greatOakTarget = cardValue('20', 'great-oak-target', 0);
const greatOakView = JSON.parse(JSON.stringify(fixedView));
greatOakView.state.board[0][0] = [greatOakSource, greatOakTarget, null];
audit = auditRuleOraclePresentationBatch(greatOakView, {
  id:'stacked-great-oak-bonus',
  events:[{type:'FATE_CHANGED',sourceIid:'great-oak-source',cardIid:'great-oak-target',before:1,after:7,amount:6,reason:'GREAT_OAK_CONSOLIDATION'}]
});
assert.equal(audit.violations.some(item=>item.code === 'WRONG_FIXED_FATE_DELTA'), false, JSON.stringify(audit.violations));
audit = auditRuleOraclePresentationBatch(greatOakView, {
  id:'invalid-stacked-great-oak-bonus',
  events:[{type:'FATE_CHANGED',sourceIid:'great-oak-source',cardIid:'great-oak-target',before:1,after:6,amount:5,reason:'GREAT_OAK_CONSOLIDATION'}]
});
assert(audit.violations.some(item=>item.code === 'WRONG_FIXED_FATE_DELTA'));
const wrongZoneView = JSON.parse(JSON.stringify(fixedView));
wrongZoneView.state.board[0][0][1] = null;
wrongZoneView.state.board[1][0][0] = fixedTarget;
audit = auditRuleOraclePresentationBatch(wrongZoneView, {
  id:'wrong-source-zone',
  events:[{type:'FATE_CHANGED',sourceIid:'fixed-source',cardIid:'fixed-target',before:1,after:4,amount:3}]
});
assert(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION' && /target zone/.test(item.detail)));
audit = auditRuleOraclePresentationBatch(fixedView, {
  id:'duplicate-identical-mutation',
  events:[
    {type:'FATE_CHANGED',sourceIid:'fixed-source',cardIid:'fixed-target',before:1,after:4,amount:3},
    {type:'FATE_CHANGED',sourceIid:'fixed-source',cardIid:'fixed-target',before:1,after:4,amount:3}
  ]
});
assert(audit.violations.some(item=>item.code === 'DUPLICATE_IDENTICAL_MUTATION'));

const lumberjackStatusView = JSON.parse(JSON.stringify(fixedView));
const lumberjackSource = {...cardValue('92', 'lumberjack-source', 0), type:'Supporter'};
const lumberjackTarget = {...cardValue('20', 'lumberjack-target', 0), type:'Supporter'};
lumberjackStatusView.state.board[0][1] = [lumberjackSource, lumberjackTarget, null];
audit = auditRuleOraclePresentationBatch(lumberjackStatusView, {
  id:'distinct-status-mutations-are-not-duplicates',
  events:[
    {type:'STATUS_CREATED',sourceIid:'lumberjack-source',cardIid:'lumberjack-target',status:'SET_EFFECT_SUPPRESSED'},
    {type:'STATUS_CREATED',sourceIid:'lumberjack-source',cardIid:'lumberjack-target',status:'REINFORCEMENT:1'}
  ]
});
assert.equal(audit.violations.some(item=>item.code === 'DUPLICATE_IDENTICAL_MUTATION'), false, JSON.stringify(audit.violations));

const reclassifiedLumberjackView = JSON.parse(JSON.stringify(lumberjackStatusView));
reclassifiedLumberjackView.state.statuses = [{
  type:'SUPPORTERS_AS_CHARACTERS',
  playerIndex:0,
  remainingTargetTurns:2
}];
audit = auditRuleOraclePresentationBatch(reclassifiedLumberjackView, {
  id:'lumberjack-uses-printed-supporter-type',
  events:[
    {type:'STATUS_CREATED',sourceIid:'lumberjack-source',cardIid:'lumberjack-target',status:'SET_EFFECT_SUPPRESSED'},
    {type:'STATUS_CREATED',sourceIid:'lumberjack-source',cardIid:'lumberjack-target',status:'REINFORCEMENT:1'}
  ]
});
assert.equal(
  audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'),
  false,
  JSON.stringify(audit.violations)
);

const opponentOnlySource = cardValue('30', 'opponent-source', 0);
const wronglyOwnedTarget = cardValue('31', 'wrongly-owned-target', 0);
const opponentOnlyView = JSON.parse(JSON.stringify(fixedView));
opponentOnlyView.state.board[0][0] = [opponentOnlySource, wronglyOwnedTarget, null];
audit = auditRuleOraclePresentationBatch(opponentOnlyView, {
  id:'wrong-target-controller',
  events:[{type:'CARD_DISCARDED',sourceIid:'opponent-source',cardIid:'wrongly-owned-target',owner:0,previousZone:'board'}]
});
assert(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'));

// Mail Delivery belongs to the player who scheduled it. If the physical
// Mailman later changes control, the delayed limbo-to-hand transfer must still
// be judged using the captured effect controller, exactly as single-player's
// queued delivery does.
const mailmanControlChangeView = JSON.parse(JSON.stringify(fixedView));
const changedControlMailman = cardValue('94', 'mailman-changed-control', 1);
const scheduledTriangle = cardValue('30', 'scheduled-triangle', 0);
mailmanControlChangeView.state.board[0][0] = [changedControlMailman, null, null];
mailmanControlChangeView.state.players[0].hand = [scheduledTriangle];
audit = auditRuleOraclePresentationBatch(mailmanControlChangeView, {
  id:'mail-delivery-captured-controller',
  events:[{
    type:'CARD_TRANSFERRED', sourceIid:'mailman-changed-control',
    semanticSourceCardId:'94', sourceController:0,
    cardIid:'scheduled-triangle', from:'limbo', fromPlayerIndex:0,
    to:'hand', playerIndex:0, reason:'MAIL_DELIVERY'
  }]
});
assert.equal(
  audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'),
  false,
  JSON.stringify(audit.violations)
);

const copiedUnseenStrikesView = JSON.parse(JSON.stringify(fixedView));
const taylorCopySource = cardValue('bh05', 'taylor-copy-source', 0);
const unseenStrikesTarget = {...cardValue('09', 'unseen-strikes-target', 1), type:'Supporter'};
copiedUnseenStrikesView.state.board[0][0] = [taylorCopySource, unseenStrikesTarget, null];
audit = auditRuleOraclePresentationBatch(copiedUnseenStrikesView, {
  id:'copied-unseen-strikes-semantic-rule',
  events:[{
    type:'CARD_DISCARDED',sourceIid:'taylor-copy-source',semanticSourceCardId:'14',
    cardIid:'unseen-strikes-target',owner:1,previousZone:'board',reason:'UNSEEN_STRIKES'
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
assert(Number(audit.cardChecks['bh05'] || 0) > 0, 'a copied mutation must retain coverage for Taylor');
assert(Number(audit.cardChecks['14'] || 0) > 0, 'a copied mutation must be audited against the copied printed rule');

const unseenStrikesRewardView = JSON.parse(JSON.stringify(fixedView));
const unseenStrikesSource = cardValue('14', 'unseen-strikes-source', 0);
unseenStrikesRewardView.state.board[0][0] = [unseenStrikesSource, null, null];
audit = auditRuleOraclePresentationBatch(unseenStrikesRewardView, {
  id:'unseen-strikes-controller-reward',
  events:[{
    type:'FATE_CHANGED',sourceIid:'unseen-strikes-source',cardIid:'unseen-strikes-source',
    before:14,after:15,amount:1,reason:'UNSEEN_STRIKES'
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));

const copiedPassiveView = JSON.parse(JSON.stringify(fixedView));
const copiedPassiveTaylor = {...cardValue('bh05', 'copied-passive-taylor', 0), counters:{copiedPassiveId:'10'}};
const copiedPassiveOpponent = cardValue('31', 'copied-passive-opponent', 1);
copiedPassiveView.state.board[0][0] = [copiedPassiveTaylor, copiedPassiveOpponent, null];
audit = auditRuleOraclePresentationBatch(copiedPassiveView, {
  id:'taylor-copied-passive-target-contract',
  events:[{
    type:'FATE_CHANGED',sourceIid:'copied-passive-taylor',cardIid:'copied-passive-opponent',
    before:5,after:2,amount:-3
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
assert(Number(audit.cardChecks['bh05'] || 0) > 0, 'Taylor must retain coverage for a copied passive');
assert(Number(audit.cardChecks['10'] || 0) > 0, 'the copied passive rule must receive semantic coverage');

const panaceaMoveView = JSON.parse(JSON.stringify(fixedView));
const panaceaGroupedSource = cardValue('64', 'panacea-grouped-source', 0);
panaceaMoveView.state.board[1][1] = [panaceaGroupedSource, null, null];
audit = auditRuleOraclePresentationBatch(panaceaMoveView, {
  id:'landscape-panacea-move-is-not-card-effect',
  events:[{
    type:'CARD_MOVED',sourceIid:'panacea-grouped-source',cardIid:'panacea-grouped-source',
    from:{z:0,r:1,c:0},to:{z:1,r:1,c:0},reason:'LANDSCAPE_PANACEA_MOVE'
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));

const apparitionDrawView = JSON.parse(JSON.stringify(fixedView));
const apparitionSource = {...cardValue('80', 'apparition-source', 0), type:'Supporter'};
const arbitraryDrawnSupporter = {...cardValue('09', 'apparition-drawn-supporter', 0), type:'Supporter'};
apparitionDrawView.state.board[0][0] = [apparitionSource, null, null];
apparitionDrawView.state.players[0].hand = [arbitraryDrawnSupporter];
audit = auditRuleOraclePresentationBatch(apparitionDrawView, {
  id:'apparition-draw-output-is-not-character-target',
  events:[{
    type:'CARD_DRAWN',sourceIid:'apparition-source',cardIid:'apparition-drawn-supporter',
    playerIndex:0,reason:'APPARITION_POLITICAL_RAMBLINGS'
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));

const grantedMovementView = JSON.parse(JSON.stringify(fixedView));
const busserSource = cardValue('69', 'busser-source', 0);
const grantedMover = cardValue('07', 'granted-mover', 0);
grantedMovementView.state.board[0][2][0] = grantedMover;
grantedMovementView.state.board[0][1][1] = busserSource;
audit = auditRuleOraclePresentationBatch(grantedMovementView, {
  id:'movement-grant-semantic-source',
  events:[{
    type:'CARD_MOVED',sourceIid:'granted-mover',effectSourceIid:'busser-source',cardIid:'granted-mover',
    reason:'MOVEMENT_GRANT',from:{z:0,r:2,c:0},to:{z:1,r:2,c:0}
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
assert(Number(audit.cardChecks['69'] || 0) > 0, 'a granted move must be audited against the granting Busser rule');
const laterGrantedMovementView = JSON.parse(JSON.stringify(grantedMovementView));
laterGrantedMovementView.state.board[0][2][0] = null;
laterGrantedMovementView.state.board[2][2][0] = grantedMover;
audit = auditRuleOraclePresentationBatch(laterGrantedMovementView, {
  id:'movement-grant-later-turn-does-not-require-original-source-zone',
  events:[{
    type:'CARD_MOVED',sourceIid:'granted-mover',effectSourceIid:'busser-source',cardIid:'granted-mover',
    reason:'MOVEMENT_GRANT',from:{z:1,r:2,c:0},to:{z:2,r:2,c:0}
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));

const moveFromSourceZoneView = JSON.parse(JSON.stringify(fixedView));
const wolfSource = cardValue('54', 'wolf-source', 0);
const wolfTarget = cardValue('69', 'wolf-target', 0);
moveFromSourceZoneView.state.board[0][1][0] = wolfSource;
moveFromSourceZoneView.state.board[1][2][0] = wolfTarget;
audit = auditRuleOraclePresentationBatch(moveFromSourceZoneView, {
  id:'wolf-creek-origin-was-source-zone',
  events:[{
    type:'CARD_MOVED',sourceIid:'wolf-source',cardIid:'wolf-target',
    from:{z:0,r:1,c:1},to:{z:1,r:2,c:0}
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
audit = auditRuleOraclePresentationBatch(moveFromSourceZoneView, {
  id:'wolf-creek-origin-wrong-zone',
  events:[{
    type:'CARD_MOVED',sourceIid:'wolf-source',cardIid:'wolf-target',
    from:{z:2,r:2,c:0},to:{z:1,r:2,c:0}
  }]
});
assert(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION' && /target origin/.test(item.detail)));
audit = auditRuleOraclePresentationBatch(grantedMovementView, {
  id:'movement-grant-too-far',
  events:[{
    type:'CARD_MOVED',sourceIid:'granted-mover',effectSourceIid:'busser-source',cardIid:'granted-mover',
    reason:'MOVEMENT_GRANT',from:{z:0,r:2,c:0},to:{z:2,r:2,c:0}
  }]
});
assert(audit.violations.some(item=>item.code === 'ILLEGAL_GRANTED_MOVEMENT_DISTANCE'));

const guerillaExpiryView = JSON.parse(JSON.stringify(fixedView));
const expiringGuerilla = cardValue('70', 'expiring-guerilla', 0);
guerillaExpiryView.state.players[0].discard = [expiringGuerilla];
audit = auditRuleOraclePresentationBatch(guerillaExpiryView, {
  id:'guerilla-returns-itself-to-owner-discard',
  events:[{
    type:'CARD_DISCARDED',sourceIid:'expiring-guerilla',cardIid:'expiring-guerilla',
    owner:0,previousZone:'hand',reason:'GUERILLA_EXPIRED'
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'WRONG_PLAYER_CARD_DISCARDED'), false, JSON.stringify(audit.violations));

const replacementView = JSON.parse(JSON.stringify(fixedView));
const lydiaGroupingSource = cardValue('56', 'lydia-grouping-source', 1);
const replacedGuerilla = cardValue('70', 'replacement-guerilla', 1);
replacementView.state.board[0][0][0] = lydiaGroupingSource;
replacementView.state.players[0].hand = [replacedGuerilla];
audit = auditRuleOraclePresentationBatch(replacementView, {
  id:'guerilla-replacement-has-intrinsic-semantic-source',
  events:[{
    type:'CARD_TRANSFERRED',sourceIid:'lydia-grouping-source',effectSourceIid:'replacement-guerilla',
    semanticSourceCardId:'33',cardIid:'replacement-guerilla',from:'board',to:'hand',playerIndex:0,
    reason:'WINE_COUNTRY_GUERILLA'
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
const roboTransferView = JSON.parse(JSON.stringify(fixedView));
const roboSource = cardValue('72', 'robo-source', 0);
const returnedOwnerCard = cardValue('31', 'stolen-owner-zero-card', 0);
roboTransferView.state.board[0][1][0] = roboSource;
roboTransferView.state.players[0].hand = [returnedOwnerCard];
audit = auditRuleOraclePresentationBatch(roboTransferView, {
  id:'robo-transfer-uses-pre-transfer-hand-holder',
  events:[{
    type:'CARD_TRANSFERRED',sourceIid:'robo-source',cardIid:'stolen-owner-zero-card',
    from:'hand',fromPlayerIndex:1,to:'hand',playerIndex:0
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
const guerillaHandView = JSON.parse(JSON.stringify(fixedView));
const infiltratingGuerilla = cardValue('70', 'infiltrating-guerilla', 0);
infiltratingGuerilla.counters = {guerillaOriginalOwner:0};
const transferredHandTarget = cardValue('31', 'transferred-hand-target', 0);
guerillaHandView.state.players[1].hand = [infiltratingGuerilla, transferredHandTarget];
audit = auditRuleOraclePresentationBatch(guerillaHandView, {
  id:'guerilla-targets-opponent-hand-container-not-printed-owner',
  events:[{
    type:'FATE_CHANGED',sourceIid:'infiltrating-guerilla',cardIid:'transferred-hand-target',
    reason:'WINE_COUNTRY_GUERILLA',before:4,after:2,amount:-2
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
audit = auditRuleOraclePresentationBatch(opponentOnlyView, {
  id:'consolidation-tributes-are-command-costs',
  events:[
    {type:'CARD_DISCARDED',sourceIid:'opponent-source',cardIid:'wrongly-owned-target',owner:0,previousZone:'board',reason:'CONSOLIDATION_TRIBUTE'},
    {type:'CARD_DISCARDED',sourceIid:'opponent-source',cardIid:'fixed-target',owner:0,previousZone:'board',reason:'CONSOLIDATION_TRIBUTE'}
  ]
});
assert.equal(
  audit.violations.some(item=>['ILLEGAL_ORACLE_TARGET_RELATION','WRONG_PLAYER_CARD_DISCARDED','CARDINALITY_EXCEEDED'].includes(item.code)),
  false,
  JSON.stringify(audit.violations)
);
audit = auditRuleOraclePresentationBatch(opponentOnlyView, {
  id:'hand-limit-discard-is-a-game-rule-not-the-discarded-card-effect',
  events:[{
    type:'CARD_DISCARDED',sourceIid:'opponent-source',cardIid:'opponent-source',
    owner:0,previousZone:'hand',reason:'HAND_LIMIT'
  }]
});
assert.equal(
  audit.violations.some(item=>['ILLEGAL_ORACLE_TARGET_RELATION','WRONG_PLAYER_CARD_DISCARDED'].includes(item.code)),
  false,
  JSON.stringify(audit.violations)
);
audit = auditRuleOraclePresentationBatch(opponentOnlyView, {
  id:'manual-discard-is-a-player-rule-not-the-discarded-card-effect',
  events:[{
    type:'CARD_DISCARDED',sourceIid:'opponent-source',cardIid:'opponent-source',
    owner:0,previousZone:'board',reason:'MANUAL_DISCARD'
  }]
});
assert.equal(
  audit.violations.some(item=>['ILLEGAL_ORACLE_TARGET_RELATION','WRONG_PLAYER_CARD_DISCARDED'].includes(item.code)),
  false,
  JSON.stringify(audit.violations)
);

const compositeView = JSON.parse(JSON.stringify(fixedView));
const berkeleySource = cardValue('62', 'berkeley-source', 0);
const guerillaSource = cardValue('70', 'guerilla-source', 0);
const opponentHandCard = cardValue('31', 'opponent-hand-card', 1);
compositeView.state.board[0][1][0] = berkeleySource;
compositeView.state.board[0][1][1] = guerillaSource;
compositeView.state.players[1].hand = [opponentHandCard];
audit = auditRuleOraclePresentationBatch(compositeView, {
  id:'composite-source-and-opponent-clauses',
  events:[
    {type:'CARD_MOVED',sourceIid:'berkeley-source',cardIid:'berkeley-source',from:{z:0,r:1,c:0},to:{z:0,r:0,c:0}},
    {type:'FATE_CHANGED',sourceIid:'guerilla-source',cardIid:'opponent-hand-card',reason:'WINE_COUNTRY_GUERILLA',before:4,after:2,amount:-2}
  ]
});
assert.equal(
  audit.violations.some(item=>['ILLEGAL_ORACLE_TARGET_RELATION','ILLEGAL_ORACLE_DESTINATION_RELATION'].includes(item.code)),
  false,
  JSON.stringify(audit.violations)
);
audit = auditRuleOraclePresentationBatch(compositeView, {
  id:'berkeley-wrong-destination-owner',
  events:[{type:'CARD_MOVED',sourceIid:'berkeley-source',cardIid:'berkeley-source',from:{z:0,r:1,c:0},to:{z:0,r:2,c:0}}]
});
assert(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_DESTINATION_RELATION'));

const copiedEffectView = JSON.parse(JSON.stringify(fixedView));
const ledgerSource = cardValue('75', 'ledger-source', 1);
ledgerSource.counters = {copiedEffectId:'42'};
const copiedDrawA = cardValue('02', 'copied-draw-a', 1);
const copiedDrawB = cardValue('03', 'copied-draw-b', 1);
copiedEffectView.state.board[0][0][0] = ledgerSource;
copiedEffectView.state.players[0].hand = [fixedSource];
copiedEffectView.state.players[1].hand = [copiedDrawA, copiedDrawB];
audit = auditRuleOraclePresentationBatch(copiedEffectView, {
  id:'ledger-copied-west-german-soldier',
  events:[
    {type:'CARD_DRAWN',sourceIid:'ledger-source',cardIid:'copied-draw-a',playerIndex:1},
    {type:'CARD_DRAWN',sourceIid:'ledger-source',cardIid:'copied-draw-b',playerIndex:1},
    {type:'CARD_DISCARDED',sourceIid:'ledger-source',cardIid:'copied-draw-a',owner:1,previousZone:'hand',reason:'WEST_GERMAN_SOLDIER'},
    {type:'CARD_DISCARDED',sourceIid:'ledger-source',cardIid:'copied-draw-b',owner:1,previousZone:'hand',reason:'WEST_GERMAN_SOLDIER'}
  ]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
assert(Number(audit.cardChecks['75'] || 0) > 0, 'copy mutations must credit Ledger-keepers coverage');
assert(Number(audit.cardChecks['42'] || 0) > 0, 'copy mutations must also audit the copied West German Soldier rule');
audit = auditRuleOraclePresentationBatch(copiedEffectView, {
  id:'copied-effect-wrong-player-hand',
  events:[{type:'CARD_DISCARDED',sourceIid:'ledger-source',cardIid:'fixed-source',owner:0,previousZone:'hand',reason:'WEST_GERMAN_SOLDIER'}]
});
assert(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'));

const taylorCopiedMovementView = JSON.parse(JSON.stringify(fixedView));
const taylorMovementSource = cardValue('bh05', 'taylor-movement-source', 1);
taylorMovementSource.controller = 0;
taylorMovementSource.counters = {copiedEffectId:'39', effectUses:1, originalOwner:1, taylorArrivalDuplicate:true};
const taylorMovementTarget = cardValue('bh05', 'taylor-movement-target', 1);
taylorCopiedMovementView.state.board[0][0] = [taylorMovementTarget, null, null];
taylorCopiedMovementView.state.board[0][1] = [null, null, taylorMovementSource];
audit = auditRuleOraclePresentationBatch(taylorCopiedMovementView, {
  id:'taylor-copied-juan-carlos-repeated-physical-semantic-source',
  events:[{
    type:'CARD_MOVED', sourceIid:'taylor-movement-source', semanticSourceCardId:'bh05',
    cardIid:'taylor-movement-target', from:{z:0,r:0,c:0}, to:{z:0,r:0,c:1}
  }]
});
assert.equal(audit.violations.some(item=>item.code === 'ILLEGAL_ORACLE_TARGET_RELATION'), false, JSON.stringify(audit.violations));
assert(Number(audit.cardChecks['bh05'] || 0) > 0, 'Taylor must retain coverage for copied movement');
assert(Number(audit.cardChecks['39'] || 0) > 0, 'Taylor movement must be audited against copied Juan Carlos');

const reactionView = JSON.parse(JSON.stringify(fixedView));
reactionView.state.players[1].hand = [cardValue('56', 'lydia-reaction', 1)];
audit = auditRuleOraclePresentationBatch(reactionView, {
  id:'lydia-valid-reaction',
  events:[{type:'EFFECT_REACTED',sourceIid:'fixed-source',reactionIid:'lydia-reaction',playerIndex:1,mode:'NEGATE'}]
});
assert.equal(audit.ok, true, JSON.stringify(audit.violations));
assert(Number(audit.cardChecks['56'] || 0) > 0, 'reaction evidence must be credited to Lydia, not the interrupted source');
const hiddenReactionView = JSON.parse(JSON.stringify(fixedView));
audit = auditRuleOraclePresentationBatch(hiddenReactionView, {
  id:'lydia-hidden-opponent-reaction',
  events:[{type:'EFFECT_REACTED',sourceIid:'fixed-source',reactionIid:'hidden-lydia',reactionKind:'LYDIA',playerIndex:1,mode:'SUPPRESS'}]
});
assert(Number(audit.cardChecks['56'] || 0) > 0, 'the non-reacting seat must identify a hidden Lydia from public reactionKind evidence');
audit = auditRuleOraclePresentationBatch(reactionView, {
  id:'lydia-invalid-mode',
  events:[{type:'EFFECT_REACTED',sourceIid:'fixed-source',reactionIid:'lydia-reaction',playerIndex:1,mode:'USE'}]
});
assert(audit.violations.some(item=>item.code === 'IMPROVISOR_REACTION_USED_INVALID_MODE'));

const blockedPromptView = JSON.parse(JSON.stringify(fixedView));
blockedPromptView.state.pendingPrompt = {
  promptId:'snow-stall',
  sourceIid:'fixed-source',
  playerIndex:0
};
audit = auditRuleOraclePresentationBatch(blockedPromptView, {
  id:'snow-terminal-effect',
  events:[{type:'EFFECT_BLOCKED',sourceIid:'fixed-source',playerIndex:0,reason:'SUPPORTER_EFFECT_LIMIT'}]
});
assert(audit.violations.some(item=>item.code === 'TERMINAL_EFFECT_LEFT_PROMPT_OPEN'));

const lifecycleView = JSON.parse(JSON.stringify(reactionView));
lifecycleView.state.players[1].hand[0].counters = {reactionUses:4};
lifecycleView.state.statuses = [{
  statusId:'delivery-too-long',
  type:'DELAYED_HAND_DELIVERY',
  playerIndex:1,
  deliveryTurnsRemaining:5
}];
const lifecycleAudit = auditRuleOracleState(lifecycleView);
assert(lifecycleAudit.violations.some(item=>item.code === 'PER_CARD_REACTION_USE_LIMIT_EXCEEDED'));
assert(lifecycleAudit.violations.some(item=>item.code === 'STATUS_DURATION_OUT_OF_ORACLE_BOUNDS'));

const onlineSource = fs.readFileSync(new URL('../../src/scripts/18-online-rooms.js', import.meta.url), 'utf8');
assert.match(onlineSource, /function phase7GeometryToLegacy\(projected\)/);
assert.match(onlineSource, /extraRowOwners:legacyGeometry\.extraRowOwners/);
assert.match(onlineSource, /markSafeSquares:legacyGeometry\.markSafeSquares/);
assert.match(onlineSource, /window\.fatePhase7GeometryToLegacy = phase7GeometryToLegacy/);

const harnessSource = fs.readFileSync(new URL('../../src/scripts/authoritative-v3-phase7-full-ui-e2e.mjs', import.meta.url), 'utf8');
assert.match(harnessSource, /validateRuleOracleCatalog/);
assert.match(harnessSource, /auditRuleOraclePresentationBatch/);
assert.match(harnessSource, /ZERO_ORACLE_VIOLATIONS/);
assert.match(harnessSource, /auditCurrentUiProjection/);
assert.match(harnessSource, /e2eOrganicTargetCardId[\s\S]*requestedOrganicTargetCardId[\s\S]*\[requestedOrganicTargetCardId\]/, 'strict full-UI certification must be able to target every eligible card, including the former search-card exemptions');
assert.match(harnessSource, /TEST_RUN_READY_PREFIX[\s\S]*waitForPeerTestClientReady[\s\S]*await waitForPeerTestClientReady\(\)/, 'paired strict clients must both be ready before first matchmaking so one seat cannot lose a match to warmup');
assert.match(harnessSource, /expectedEffectiveFateFromOracle[\s\S]*getZoneScore[\s\S]*canonical-oracle/);
assert.match(harnessSource, /clickBoardCardWhenReady\(iid, 4000, true, true\)/, 'consolidation tribute retry must target the shipping canvas after a normal UI hit is intercepted and re-close any remounted detail modal');
assert.match(harnessSource, /clickBoardPosition\(destination, true\)/, 'every authoritative board destination gesture must target the shipping canvas instead of an overlapping DOM layer');
assert.match(harnessSource, /MODAL_CHOICE[\s\S]{0,1200}aff-pick-square\[data-aff\][\s\S]{0,500}dataset\.aff/, 'the full-UI campaign must drive the reused affiliation picker even when its optional Phase 7 metadata mounts one frame late');
assert.match(harnessSource, /organicTargetCommandsThisMatch = new Set/);
assert.match(harnessSource, /organicSetupPending[\s\S]{0,700}SET_CARD_FROM_DECK[\s\S]{0,300}CONSOLIDATE_CARD[\s\S]{0,300}SET_CARD/);
assert.match(harnessSource, /protectedIds = new Set[\s\S]{0,500}tributeIids[\s\S]{0,250}protectedIds\.has/, 'ordinary consolidations must preserve the assigned target and adversarial partner');
assert.match(harnessSource, /\['47','70'\]\.includes\(sourceCardId/, 'tribute-trigger targets must still be deliberately exercised as consolidation payments');

const textureSource = fs.readFileSync(new URL('../../src/scripts/render-v2/03-card-texture-cache.js', import.meta.url), 'utf8');
assert.match(textureSource, /function buildGeneratedBaseTexture\(rec, card, visual\)/);
assert.match(textureSource, /if\(!rec\.artSrc\)\{[\s\S]*buildGeneratedBaseTexture\(rec, card, visual\);[\s\S]*return rec;/);
assert.match(textureSource, /base-generated-fallback-ready/);

const PASSIVE_DEFINITIONS = [
  ['01','Felicyta','Coordinator','third_great_war',4],
  ['10','Dylan','Coordinator','reality',2],
  ['11','Anne','Coordinator','reality',3],
  ['19','Kvetka','Coordinator','expanded_worlds',3],
  ['23','Cathy','Coordinator','reality',3],
  ['35','Alexander','Initiator','third_great_war',7],
  ['41','Jimmy','Dauntless','reality',0],
  ['44','Grenadiers','Supporter','third_great_war',1],
  ['55','Bobby','Dauntless','reality',5],
  ['57','Jeremiah','Coordinator','expanded_worlds',3],
  ['59','Maroon','Supporter','third_great_war',1],
  ['63','Hoplite','Supporter','third_great_war',1],
  ['64','Duelist','Supporter','eventide',1],
  ['77','Duncan','Dauntless','eventide',7],
  ['76','Alpine','Supporter','expanded_worlds',5],
  ['85','Felicyta Specters','Dauntless','eventide',4],
  ['87','Kvetka Ukulele','Supporter','expanded_worlds',1],
  ['88','Rozsi Youth','Dauntless','expanded_worlds',5],
  ['89','Zsofia Youth','Dauntless','expanded_worlds',5],
  ['100','Felicyta Kvetka','Dauntless','expanded_worlds',8],
  ['bh07','Agent K','Coordinator','reality',4],
  ['plain-support','Plain Support','Supporter','reality',2],
  ['plain-char','Plain Character','Initiator','eventide',4],
  ['plain-dauntless','Plain Dauntless','Dauntless','reality',6]
].map(([id,name,type,affiliation,fate])=>({id,name,type,affiliation,aff:affiliation,fate,cost:type === 'Supporter' ? 0 : 2,rarity:'circle'}));

const passiveState = createInitialState({
  matchId:'ORACLE-PASSIVES',
  seed:'oracle-passives',
  handSize:0,
  cardDefinitions:PASSIVE_DEFINITIONS,
  players:[
    {id:'p0',deckIds:['01','41','35','55','88','100','plain-support','plain-support','plain-support','plain-char','76']},
    {id:'p1',deckIds:['10','plain-support','plain-char','plain-dauntless']}
  ]
});
function place(playerIndex, id, z, r, c){
  const index = passiveState.players[playerIndex].deck.findIndex(value=>value.id === id);
  assert(index >= 0, `missing passive fixture ${id}`);
  const value = passiveState.players[playerIndex].deck.splice(index, 1)[0];
  value.controller = playerIndex;
  passiveState.board[z][r][c] = value;
  return value;
}
place(0,'01',0,2,0);
place(0,'plain-char',0,2,1);
place(1,'plain-support',0,1,0);
place(0,'41',1,2,0);
passiveState.fateReductionEffectUses[0] = 2;
place(0,'35',1,2,1);
place(0,'76',1,1,0);
place(0,'plain-support',1,1,1);
place(0,'55',2,2,0);
place(0,'plain-support',2,2,1);
place(0,'plain-support',2,2,2);
place(0,'88',2,1,0);
place(0,'100',2,1,1);
place(1,'10',2,0,0);
place(1,'plain-char',2,0,1);
place(1,'plain-dauntless',2,0,2);
passiveState.supporterEffectsActivated[0] = 4;

for(const zone of passiveState.board) for(const row of zone) for(const value of row){
  if(!value) continue;
  const entry = findBoardCard(passiveState, value.iid);
  assert.equal(
    effectiveFate(passiveState, entry),
    expectedEffectiveFateFromOracle(passiveState, value.iid),
    `independent effective-Fate oracle mismatch for ${value.id}`
  );
}
let stateAudit = auditRuleOracleState(passiveState);
assert(Number(stateAudit.cardBranches['01|CONTINUOUS_CONDITION_TRUE'] || 0) > 0, 'Felicyta adjacency positive branch must be observed');
assert(Number(stateAudit.cardBranches['41|CONTINUOUS_CONDITION_TRUE'] || 0) > 0, 'Jimmy effect-use positive branch must be observed');
assert.equal(expectedEffectiveFateFromOracle(passiveState, passiveState.board[2][1][1].iid), 8, 'card 100 +3 kinship and opponent Dylan -3 must both apply');
assert.equal(expectedEffectiveFateFromOracle(passiveState, passiveState.board[1][2][0].iid), 6, 'Jimmy must use effect-use count, not raw damage');
assert.equal(expectedEffectiveFateFromOracle(passiveState, passiveState.board[1][2][1].iid), 7, 'Alexander must include both Supporters including immutable Alpine');

const selfOnlyState = createInitialState({
  matchId:'ORACLE-SELF-ONLY', seed:'oracle-self-only', handSize:0, cardDefinitions:PASSIVE_DEFINITIONS,
  players:[{id:'p0',deckIds:['100']},{id:'p1',deckIds:['plain-support']}]
});
const selfOnly = selfOnlyState.players[0].deck.shift();
selfOnly.controller = 0;
selfOnlyState.board[0][2][0] = selfOnly;
assert.equal(expectedEffectiveFateFromOracle(selfOnlyState, selfOnly.iid), 8, 'card 100 must not qualify itself for +3');
assert.equal(effectiveFate(selfOnlyState, findBoardCard(selfOnlyState, selfOnly.iid)), 8);
stateAudit = auditRuleOracleState(selfOnlyState);
assert(Number(stateAudit.cardBranches['100|CONTINUOUS_CONDITION_FALSE'] || 0) > 0, 'card 100 self-only negative branch must be observed');

const kinshipState = createInitialState({
  matchId:'ORACLE-KINSHIP', seed:'oracle-kinship', handSize:0, cardDefinitions:PASSIVE_DEFINITIONS,
  players:[{id:'p0',deckIds:['100','01']},{id:'p1',deckIds:['plain-support']}]
});
for(const [index,id] of ['100','01'].entries()){
  const cardIndex = kinshipState.players[0].deck.findIndex(value=>value.id === id);
  const value = kinshipState.players[0].deck.splice(cardIndex, 1)[0];
  value.controller = 0;
  kinshipState.board[index][2][0] = value;
}
const kinship = kinshipState.board[0][2][0];
assert.equal(expectedEffectiveFateFromOracle(kinshipState, kinship.iid), 11, 'another Felicyta must grant +3');
assert.equal(effectiveFate(kinshipState, findBoardCard(kinshipState, kinship.iid)), 11);
stateAudit = auditRuleOracleState(kinshipState);
assert(Number(stateAudit.cardBranches['100|CONTINUOUS_CONDITION_TRUE'] || 0) > 0, 'card 100 kinship positive branch must be observed');

const ukuleleKinshipState = createInitialState({
  matchId:'ORACLE-UKULELE-KINSHIP', seed:'oracle-ukulele-kinship', handSize:0, cardDefinitions:PASSIVE_DEFINITIONS,
  players:[{id:'p0',deckIds:['100','87']},{id:'p1',deckIds:['plain-support']}]
});
for(const [index,id] of ['100','87'].entries()){
  const cardIndex = ukuleleKinshipState.players[0].deck.findIndex(value=>value.id === id);
  const value = ukuleleKinshipState.players[0].deck.splice(cardIndex, 1)[0];
  value.controller = 0;
  ukuleleKinshipState.board[index][2][0] = value;
}
const ukuleleKinship = ukuleleKinshipState.board[0][2][0];
assert.equal(expectedEffectiveFateFromOracle(ukuleleKinshipState, ukuleleKinship.iid), 11, 'Kvetka Ukulele must qualify as the other Kvetka for Wintertide');
assert.equal(effectiveFate(ukuleleKinshipState, findBoardCard(ukuleleKinshipState, ukuleleKinship.iid)), 11);

console.log('authoritative-v3 Phase 7 detailed rules oracle smoke test passed');
