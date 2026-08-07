import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {multiplayerEligibleCardIds} from '../../shared/engine/index.mjs';
import {AuthorityV3RoomManager} from './room-manager.mjs';
import {SQLiteAuthorityStore} from './storage.mjs';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-phase7-organic-fixtures-'));
const deckIds = multiplayerEligibleCardIds().slice(0, 18);
assert(deckIds.length >= 12, 'fixture isolation needs enough eligible cards to leave cards in deck');

const strictFixtureStore = new SQLiteAuthorityStore(path.join(tempDir, 'strict-fixture-deck.sqlite'));
const strictFixtureManager = new AuthorityV3RoomManager({
  store:strictFixtureStore,
  allowTestMatches:false,
  allowOrganicTestFixtures:true,
  snapshotInterval:20
});
const exactFixtureDeck = Array.from({length:40}, ()=>'32');
assert.throws(
  ()=>strictFixtureManager.validateDeckIds(exactFixtureDeck),
  /too many copies/,
  'ordinary matchmaking must retain production rarity limits'
);
assert.deepEqual(
  strictFixtureManager.validateDeckIds(exactFixtureDeck, {organicFixture:true}),
  exactFixtureDeck,
  'the separately authenticated organic fixture route may use an exact repeated scenario deck'
);
assert.doesNotThrow(()=>strictFixtureManager.createMatch({
  matchId:'EXACTFIXTUREDECK',
  seed:'exact-fixture-deck',
  landscapeId:'igb1',
  players:[
    {id:'exact-p0', deckIds:exactFixtureDeck, organicFixture:true},
    {id:'exact-p1', deckIds:exactFixtureDeck, organicFixture:true}
  ]
}), 'match creation must preserve the already-authorized fixture deck instead of reapplying production copy limits');
strictFixtureStore.close();

function createHarness(name, allowOrganicTestFixtures){
  const store = new SQLiteAuthorityStore(path.join(tempDir, `${name}.sqlite`));
  const manager = new AuthorityV3RoomManager({
    store,
    allowTestMatches:true,
    allowOrganicTestFixtures,
    snapshotInterval:20
  });
  return {store, manager};
}

function create(manager, matchId, requested = [], deckHeld = [], playerDeckIds = deckIds, deckTop = []){
  manager.createMatch({
    matchId,
    seed:'phase7-organic-fixture-isolation',
    landscapeId:'igb1',
    handSize:6,
    players:[
      {id:`${matchId}-p0`, deckIds:playerDeckIds, testOpeningCardIds:requested, testDeckCardIds:deckHeld, testDeckTopCardIds:deckTop},
      {id:`${matchId}-p1`, deckIds:playerDeckIds}
    ]
  });
  return manager.actor(matchId).state;
}

const baseline = createHarness('baseline', false);
const baselineState = create(baseline.manager, 'FIXTUREBASE');
const targetId = String(baselineState.players[0].deck[0]?.id || '');
assert(targetId, 'baseline shuffle must leave a target card in deck');
assert.equal(baselineState.players[0].hand.some(card=>String(card.id) === targetId), false);
baseline.store.close();

const disabled = createHarness('disabled', false);
const disabledState = create(disabled.manager, 'FIXTUREOFF', [targetId]);
assert.equal(
  disabledState.players[0].hand.some(card=>String(card.id) === targetId),
  false,
  'opening-card requests must be ignored when the isolated fixture flag is disabled'
);
disabled.store.close();

const enabled = createHarness('enabled', true);
const enabledState = create(enabled.manager, 'FIXTUREON', [targetId]);
assert.equal(
  enabledState.players[0].hand.some(card=>String(card.id) === targetId),
  true,
  'the isolated organic test fixture must move a requested deck card into the test hand'
);
assert.equal(enabledState.players[0].hand.length, 6, 'fixture swap must not change opening hand size');
assert.equal(enabledState.players[0].deck.length, baselineState.players[0].deck.length, 'fixture swap must not change deck size');
enabled.store.close();

const held = createHarness('held', true);
const naturallyDealtId = String(baselineState.players[0].hand[0]?.id || '');
const heldState = create(held.manager, 'FIXTUREHELD', [naturallyDealtId], [naturallyDealtId]);
assert.equal(heldState.players[0].hand.some(card=>String(card.id) === naturallyDealtId), false, 'a deck-set focus card must be removed from the staged opening hand');
assert.equal(heldState.players[0].deck.some(card=>String(card.id) === naturallyDealtId), true, 'a deck-set focus card must remain selectable in deck');
held.store.close();

const topped = createHarness('topped', true);
const topTargetId = String(baselineState.players[0].hand[1]?.id || '');
const toppedState = create(topped.manager, 'FIXTURETOP', [topTargetId], [], deckIds, [topTargetId]);
assert.equal(String(toppedState.players[0].deck[0]?.id || ''), topTargetId, 'a draw-arrival focus card must be the next genuine deck draw');
assert.equal(toppedState.players[0].hand.some(card=>String(card.id) === topTargetId), false, 'a draw-arrival focus card must not remain in the staged opening hand');
topped.store.close();

const specialIds = multiplayerEligibleCardIds();
for(const [cardId, assertion] of [
  ['bh05', state=>assert.equal(state.players[0].hand.filter(card=>String(card.id) === 'bh05').length, 2, 'forced Taylor opening must create exactly one duplicate')],
  ['bh03', state=>{
    assert.equal(state.players[0].hand.some(card=>String(card.id) === 'bh03'), false, 'forced Ali opening must leave original hand');
    assert(state.players[1].hand.some(card=>String(card.id) === 'bh03' && card.statuses.includes('HAND_EFFECT_IMMUNE')), 'forced Ali opening must enter opponent hand with protection');
  }]
]){
  assert(specialIds.includes(cardId), `${cardId} must be eligible for fixture regression`);
  const special = createHarness(`special-${cardId}`, true);
  const specialDeck = [cardId, ...deckIds.filter(id=>id !== cardId)];
  assertion(create(special.manager, `FIX${cardId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`, [cardId], [], specialDeck));
  special.store.close();
}

const serverText = fs.readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
assert.match(
  serverText,
  /const organicFixtureIdentity = PHASE7_ALLOW_ORGANIC_TEST_FIXTURES[\s\S]{0,120}phase7OrganicFixtureIdentity\(req, identity, requestedTestPool\)/,
  'HTTP matchmaking must gate curated opening cards through the isolated fixture identity check'
);
assert.match(
  serverText,
  /validateDeckIds\(body\.deckIds, \{organicFixture:organicFixtureIdentity\}\)/,
  'only the authenticated organic fixture request may bypass rarity limits for exact scenario decks'
);
assert.match(
  serverText,
  /!!identity\?\.uid[\s\S]{0,180}x-fate-organic-fixture/,
  'a fixture request must be authenticated and carry the exact organic marker'
);
assert.match(
  serverText,
  /const testPool = organicFixtureIdentity[\s\S]{0,260}fixture:\$\{identity\.uid\}/,
  'a malformed or absent fixture pool must fall back to a private pool, never ordinary matchmaking'
);

const betaClientText = fs.readFileSync(
  new URL('../../src/scripts/authoritative-v3-phase7-beta-client.mjs', import.meta.url),
  'utf8'
);
assert.match(
  betaClientText,
  /ORGANIC_TEST_IDENTITY_ENABLED[\s\S]*e2eOrganicCardCampaign[\s\S]*e2eStrictCardCertification/,
  'only an explicit strict organic browser campaign may select the test identity namespace'
);
assert.match(
  betaClientText,
  /ORGANIC_TEST_IDENTITY_ENABLED \? \{'x-fate-organic-fixture':'1'\} : \{\}/,
  'strict organic browser campaigns must mark their authenticated fixture requests'
);
assert.match(
  betaClientText,
  /testPool:ORGANIC_TEST_IDENTITY_ENABLED \? organicTestPool\(\) : ''/,
  'strict organic browser pairs must request an isolated matchmaking pool'
);
assert.match(
  serverText,
  /String\(entry\.testPool \|\| ''\) === testPool/,
  'the authority must match certification clients only within their exact pool'
);
assert.match(
  betaClientText,
  /const user = globalThis\.FATE_ONLINE/,
  'manual and shipping beta sessions must retain the Firebase identity path'
);

fs.rmSync(tempDir, {recursive:true, force:true});
console.log('phase7 organic opening fixture isolation smoke passed');
