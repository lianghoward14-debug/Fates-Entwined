const LANDSCAPE_RULES = Object.freeze({
  igb1:{kind:'NO_EFFECT'},
  igb2:{kind:'TURN_CONSOLIDATION_REWARD', resolutionTurn:14, amount:16},
  igb3:{kind:'CONSOLIDATION_ZONE_FATE_BONUS', amount:4, beforeTurn:10},
  igb4:{kind:'DISCARD_RECOVERY_BLOCK'},
  igb5:{kind:'LEADER_SET_FATE_BONUS', amount:2},
  igb6:{kind:'CARD_SET_FATE_BONUS', affiliation:'reality', amount:3},
  igb7:{kind:'EVENTIDE_MOVEMENT'},
  igb8:{kind:'TURN_ZONE_CONTROL_ROW_REWARD', resolutionTurn:10},
  igb9:{kind:'OUTSIDE_DRAW_FIELD_FATE_BONUS', amount:3},
  igb10:{kind:'REINFORCEMENT_BONUS', type:'Supporter', affiliation:'third_great_war', amount:1},
  igb11:{kind:'CARD_SET_FATE_BONUS', type:'Initiator', amount:3},
  igb12:{kind:'REVEAL_BOTH_HANDS'},
  igb13:{kind:'ALTERNATING_DRAW_PHASE_SKIP'},
  igb14:{kind:'SERVER_TURN_TIMER', milliseconds:30000},
  igb15:{kind:'SUPPORTER_EFFECT_LIMIT', maxPerTurn:1},
  igb16:{kind:'DISCARD_HAND_FOR_SIDE_FATE', amount:4},
  igb17:{kind:'COORDINATOR_COPY_TOKEN', oncePerGame:true},
  igb18:{kind:'DRAW_PHASE_AFFILIATION_FATE_BONUS', affiliation:'expanded_worlds', amount:1},
  igb19:{kind:'HAND_CHARACTER_EXPIRY', ownerTurns:3},
  igb20:{kind:'TOTAL_FATE_THRESHOLDS', thresholds:[20, 35, 50]},
  igb21:{kind:'CATALOG_TO_HAND', maxCards:4, excludeRarity:'star', oncePerGame:true},
  igb22:{kind:'ZONE_CONSOLIDATION_COST', randomZoneCount:2, amount:1},
  igb23:{kind:'MORALE_COST_WAIVER_AND_HAND_HEAL', handMultiplier:2},
  igb24:{kind:'TURN_BOARD_SUPPORTER_FATE_BONUS', resolutionTurn:20, requiredBoardTurns:10, amount:6}
});

export function landscapeRule(landscapeId){
  return LANDSCAPE_RULES[String(landscapeId || '')] || null;
}

export function multiplayerEligibleLandscapeIds(){
  return Object.keys(LANDSCAPE_RULES).sort();
}
