import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {
  ENGINE_VERSION,
  RULESET_VERSION,
  canonicalHash,
  createInitialState,
  multiplayerEligibleCardIds,
  multiplayerEligibleLandscapeIds
} from '../../shared/engine/index.mjs';
import {AuthoritativeRoomActor} from './room-actor.mjs';

const require = createRequire(import.meta.url);
const {getCardCatalog} = require('../fate-card-catalog.js');

function tokenHash(token){
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function makeToken(){
  return crypto.randomBytes(32).toString('base64url');
}

function validateMatchId(value){
  const matchId = String(value || '');
  if(!/^[A-Za-z0-9_-]{3,80}$/.test(matchId)) throw new Error('matchId must contain 3-80 safe characters');
  return matchId;
}

function validatePlayer(player, seat){
  const id = String(player?.id || '');
  if(!/^[A-Za-z0-9_.:@-]{1,128}$/.test(id)) throw new Error(`player ${seat} id is invalid`);
  const deckIds = Array.isArray(player?.deckIds) ? player.deckIds.map(String) : [];
  const testOpeningCardIds = Array.isArray(player?.testOpeningCardIds)
    ? player.testOpeningCardIds.map(String).filter(Boolean).slice(0, 4)
    : [];
  const testDeckCardIds = Array.isArray(player?.testDeckCardIds)
    ? player.testDeckCardIds.map(String).filter(Boolean).slice(0, 2)
    : [];
  const testDeckTopCardIds = Array.isArray(player?.testDeckTopCardIds)
    ? player.testDeckTopCardIds.map(String).filter(Boolean).slice(0, 2)
    : [];
  return {id, name:String(player?.name || `Player ${seat + 1}`).slice(0, 80), rankElo:Math.max(0, Math.round(Number(player?.rankElo) || 600)), deckIds, testOpeningCardIds, testDeckCardIds, testDeckTopCardIds};
}

function forceTestOpeningCards(state, players){
  const forced = [];
  players.forEach((player, playerIndex)=>{
    const requested = [...new Set((player.testOpeningCardIds || []).map(String))];
    const requestedIds = new Set(requested);
    requested.forEach(cardId=>{
      const hand = state.players[playerIndex].hand;
      const deck = state.players[playerIndex].deck;
      if(hand.some(card=>String(card.id) === String(cardId))) return;
      const deckIndex = deck.findIndex(card=>String(card.id) === String(cardId));
      if(deckIndex < 0 || !hand.length) return;
      // Never evict another requested fixture card. In the old index-based
      // replacement, a target that naturally appeared in the opening hand
      // could be swapped back into the deck while inserting a later partner or
      // scaffold. The match then ran without the card it claimed to certify.
      const handIndex = hand.findLastIndex(card=>!requestedIds.has(String(card?.id || '')));
      if(handIndex < 0) return;
      const incoming = deck.splice(deckIndex, 1, hand[handIndex])[0];
      hand[handIndex] = incoming;
      forced.push({playerIndex, card:incoming});
    });
  });
  // Forced openings must run the same opening-hand behavior as cards that
  // arrived there through the initial shuffle. Otherwise the isolated fixture
  // would silently bypass Taylor/Ali rather than test them.
  for(const {playerIndex, card} of forced){
    if(String(card.id || '') === 'bh05'){
      state.instanceCounter += 1;
      const duplicate = JSON.parse(JSON.stringify(card));
      duplicate.iid = `${state.matchId}:p${playerIndex}:c${state.instanceCounter}`;
      duplicate.counters = {...duplicate.counters, taylorArrivalDuplicate:true};
      state.players[playerIndex].hand.push(duplicate);
    }
    if(String(card.id || '') === 'bh03'){
      const hand = state.players[playerIndex].hand;
      const index = hand.findIndex(value=>String(value.iid) === String(card.iid));
      if(index >= 0) hand.splice(index, 1);
      const recipient = playerIndex === 0 ? 1 : 0;
      card.owner = recipient;
      card.controller = recipient;
      if(!card.statuses.includes('OPPONENT_HAND_LIMIT_6')) card.statuses.push('OPPONENT_HAND_LIMIT_6');
      if(!card.statuses.includes('HAND_EFFECT_IMMUNE')) card.statuses.push('HAND_EFFECT_IMMUNE');
      card.statuses.sort();
      state.players[recipient].hand.push(card);
    }
  }
}

function forceTestDeckCards(state, players){
  players.forEach((player, playerIndex)=>{
    for(const cardId of (player.testDeckCardIds || [])){
      const hand = state.players[playerIndex].hand;
      const deck = state.players[playerIndex].deck;
      if(deck.some(card=>String(card.id) === String(cardId))) continue;
      const handIndex = hand.findIndex(card=>String(card.id) === String(cardId));
      if(handIndex < 0 || !deck.length) continue;
      const outgoing = hand[handIndex];
      hand[handIndex] = deck.pop();
      deck.push(outgoing);
    }
  });
}

function forceTestDeckTopCards(state, players){
  players.forEach((player, playerIndex)=>{
    for(const cardId of [...(player.testDeckTopCardIds || [])].reverse()){
      const hand = state.players[playerIndex].hand;
      const deck = state.players[playerIndex].deck;
      for(let handIndex = hand.length - 1; handIndex >= 0; handIndex -= 1){
        if(String(hand[handIndex]?.id) !== String(cardId)) continue;
        const replacementIndex = deck.findIndex(card=>String(card.id) !== String(cardId));
        if(replacementIndex < 0) break;
        const target = hand[handIndex];
        hand[handIndex] = deck[replacementIndex];
        deck[replacementIndex] = target;
      }
      const deckIndex = deck.findIndex(card=>String(card.id) === String(cardId));
      if(deckIndex >= 0){
        const card = deck.splice(deckIndex, 1)[0];
        deck.unshift(card);
        continue;
      }
    }
  });
}

function validateDeck(deckIds, catalog, allowTestMatches){
  if(allowTestMatches){
    if(deckIds.length < 1 || deckIds.length > 80) throw new Error('test decks must contain 1-80 cards');
  }else if(deckIds.length !== 40){
    throw new Error('authoritative v3 decks must contain exactly 40 cards');
  }
  const eligible = new Set(multiplayerEligibleCardIds());
  const counts = new Map();
  for(const id of deckIds){
    const definition = catalog.byId.get(id);
    if(!definition) throw new Error(`deck contains unknown card ${id}`);
    if(!eligible.has(id)) throw new Error(`card ${id} is not yet eligible for authoritative v3 multiplayer`);
    if(allowTestMatches) continue;
    const count = (counts.get(id) || 0) + 1;
    counts.set(id, count);
    const maximum = String(definition.rarity || '').toLowerCase() === 'star' ? 1 : 3;
    if(count > maximum) throw new Error(`deck contains too many copies of card ${id}`);
  }
}

export class AuthorityV3RoomManager {
  constructor({store, allowTestMatches = false, allowOrganicTestFixtures = false, snapshotInterval = 20, retainedMatches = 0}){
    this.store = store;
    this.allowTestMatches = allowTestMatches === true;
    this.allowOrganicTestFixtures = allowOrganicTestFixtures === true;
    this.snapshotInterval = snapshotInterval;
    this.retainedMatches = Math.max(0, Number(retainedMatches) || 0);
    this.actors = new Map();
  }

  pruneArchivedMatches(){
    if(!this.retainedMatches || typeof this.store.pruneOldMatches !== 'function') return [];
    const activeMatchIds = [...this.actors.entries()]
      .filter(([, actor])=>!actor?.state?.outcome)
      .map(([matchId])=>matchId);
    const deleted = this.store.pruneOldMatches({
      keepMostRecent:this.retainedMatches,
      excludeMatchIds:activeMatchIds
    });
    for(const matchId of deleted) this.actors.delete(matchId);
    return deleted;
  }

  validateDeckIds(deckIds, {organicFixture = false} = {}){
    const normalized = Array.isArray(deckIds) ? deckIds.map(String) : [];
    const allowExactFixtureDeck = organicFixture === true && this.allowOrganicTestFixtures;
    validateDeck(normalized, getCardCatalog(), this.allowTestMatches || allowExactFixtureDeck);
    return normalized;
  }

  createMatch(input = {}){
    this.pruneArchivedMatches();
    const matchId = validateMatchId(input.matchId);
    if(this.store.hasMatch(matchId)) throw new Error('matchId already exists');
    const requestedPlayers = input.players || [];
    const players = requestedPlayers.map(validatePlayer);
    if(players.length !== 2 || players[0].id === players[1].id) throw new Error('two distinct players are required');
    const catalog = getCardCatalog();
    const organicFixtureMatch = this.allowOrganicTestFixtures
      && requestedPlayers.length === 2
      && requestedPlayers.every(player=>player?.organicFixture === true);
    players.forEach((player, index)=>{
      const allowExactFixtureDeck = this.allowOrganicTestFixtures
        && requestedPlayers[index]?.organicFixture === true;
      validateDeck(player.deckIds, catalog, this.allowTestMatches || allowExactFixtureDeck);
    });
    const landscapeId = String(input.landscapeId || 'igb1');
    if(!multiplayerEligibleLandscapeIds().includes(landscapeId)){
      throw new Error(`landscape ${landscapeId || '(missing)'} is not yet eligible for authoritative v3 multiplayer`);
    }
    const state = createInitialState({
      matchId,
      seed:String(input.seed || matchId),
      players,
      cardDefinitions:catalog.cards,
      handSize:input.handSize,
      engineVersion:ENGINE_VERSION,
      rulesetVersion:RULESET_VERSION,
      activePlayer:input.activePlayer,
      requireTurnChoice:input.requireTurnChoice === true,
      coinWinner:input.coinWinner,
      landscapeId,
      gameSettings:input.gameSettings,
      turnTimerSeconds:input.turnTimerSeconds,
      testRules:organicFixtureMatch && input.testRules?.zeroReinforcementCost === true
        ? {zeroReinforcementCost:true}
        : null
    });
    if(this.allowOrganicTestFixtures){
      forceTestOpeningCards(state, players);
      forceTestDeckCards(state, players);
      forceTestDeckTopCards(state, players);
    }
    const stateHash = canonicalHash(state);
    const credentials = players.map((player, seat)=>{
      const token = makeToken();
      return {playerId:player.id, seat, token, tokenHash:tokenHash(token)};
    });
    this.store.createMatch(state, stateHash, credentials);
    const actor = new AuthoritativeRoomActor({
      state,
      store:this.store,
      snapshotInterval:this.snapshotInterval
    });
    this.actors.set(matchId, actor);
    return {
      matchId,
      protocolVersion:3,
      engineVersion:ENGINE_VERSION,
      rulesetVersion:RULESET_VERSION,
      revision:state.revision,
      stateHash,
      players:credentials.map(({playerId, seat, token})=>({playerId, seat, token}))
    };
  }

  actor(matchId){
    const id = validateMatchId(matchId);
    if(this.actors.has(id)) return this.actors.get(id);
    const recovered = AuthoritativeRoomActor.recover({
      matchId:id,
      store:this.store,
      snapshotInterval:this.snapshotInterval
    });
    if(recovered) this.actors.set(id, recovered);
    return recovered;
  }

  authenticate(matchId, playerId, token){
    const credential = this.store.playerCredential(validateMatchId(matchId), String(playerId || ''));
    if(!credential) return null;
    const actual = Buffer.from(tokenHash(token), 'hex');
    const expected = Buffer.from(String(credential.tokenHash), 'hex');
    if(actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    return credential;
  }
}
