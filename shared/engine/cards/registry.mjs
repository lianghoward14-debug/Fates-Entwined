const REGISTRY = Object.freeze({
  '07':{
    timings:['WHEN_SET', 'DECK_SET'],
    operations:['TRANSFER_CARDS', 'MODIFY_FATE', 'CHANGE_PLAYER_COUNTER'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CHANGE_PLAYER_COUNTER',
          field:'extraSupportersThisTurn',
          playerIndex:'$controller',
          amount:2
        }
      },
      {
        kind:'SELECT_CARDS',
        local:'targetIids',
        min:0,
        max:3,
        optional:true,
        cancelBehavior:'CONTINUE',
        filter:{locations:['deck'], playerIndex:'controller', type:'Supporter'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIids:'$targetIids',
          playerIndex:'$controller',
          destinationPile:'hand',
          fateBonus:4,
          reason:'OBLIQUE_ORDER'
        }
      }
    ]
  },
  '08':{
    timings:['WHEN_SET'],
    operations:['SET_CARD'],
    prompts:['CARD_SELECTION', 'BOARD_DESTINATION', 'REACTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        filter:{
          locations:['deck', 'discard'],
          playerIndex:'controller',
          affiliation:'reality'
        }
      },
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        filter:{ownSide:true, open:true}
      },
      {
        kind:'FREE_SET',
        cardIid:'$targetIid',
        destination:'$destination',
        countsAsConsolidation:true
      }
    ]
  },
  '25':{
    timings:['WHEN_SET'],
    whenSetTurnUseKey:'AFRICA_UNITED',
    operations:['SET_CARD'],
    prompts:['CARD_SELECTION', 'BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{
          locations:['deck', 'hand'],
          playerIndex:'controller',
          cardId:'25',
          excludeSource:true
        }
      },
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        filter:{ownSide:true, open:true}
      },
      {
        kind:'FREE_SET',
        cardIid:'$targetIid',
        destination:'$destination',
        turnUseKey:'AFRICA_UNITED'
      }
    ]
  },
  '28':{
    timings:['DECK_SET', 'PASSIVE'],
    operations:['SET_CARD'],
    prompts:[]
  },
  '37':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:[],
    prompts:['BOARD_TARGET'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        filter:{supporter:true, ruleTiming:'PASSIVE', excludeSource:true}
      },
      {
        kind:'COPY_EFFECT',
        cardIid:'$targetIid',
        execute:false
      }
    ]
  },
  '75':{
    timings:['WHEN_SET'],
    operations:[],
    prompts:['BOARD_TARGET'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        optional:true,
        filter:{supporter:true, ruleTiming:'WHEN_SET', excludeSource:true, copyEffectAvailable:true}
      },
      {
        kind:'COPY_EFFECT',
        cardIid:'$targetIid',
        execute:true
      }
    ]
  },
  '81':{
    timings:['WHEN_SET'],
    operations:['CREATE_TOKENS'],
    prompts:[],
    havanoTargeting:'OPPONENT',
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_TOKENS',
          playerIndex:'$controller',
          count:'$opponentPlacementsLastTurn',
          tokenKind:'PIEROGI'
        }
      }
    ]
  },
  '82':{
    timings:['WHEN_SET'],
    operations:['CHANGE_LANDSCAPE'],
    prompts:['MODAL_CHOICE'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'landscapeId',
        landscapeChoices:true,
        options:Array.from({length:24}, (_value, index)=>({
          value:`igb${index + 1}`,
          label:`Landscape ${index + 1}`
        })),
        defaultChoice:'igb1'
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CHANGE_LANDSCAPE',
          landscapeId:'$landscapeId',
          sourceIid:'$sourceIid',
          sourceController:'$controller'
        }
      }
    ]
  },
  '84':{
    timings:['WHEN_SET'],
    operations:['SET_CARD'],
    prompts:['CARD_SELECTION', 'BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        filter:{
          locations:['deck'],
          playerIndex:'controller',
          affiliation:'expanded_worlds',
          character:true,
          excludeCardId:'84'
        }
      },
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        filter:{ownSide:true, open:true}
      },
      {
        kind:'FREE_SET',
        cardIid:'$targetIid',
        destination:'$destination',
        countsAsConsolidation:true
      }
    ]
  },
  '01':{
    effectLabels:['ADJACENCY_BONUS'],
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '02':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['ADD_SAFE_ROW', 'MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['CARD_SET'],
    program:[
      {kind:'OPERATION', operation:{type:'ADD_SAFE_ROW', playerIndex:'$controller'}}
    ]
  },
  '04':{
    timings:['WHEN_SET'],
    operations:['CREATE_SQUARE_STATUS'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        filter:{sameZone:true, includeOccupied:true}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_SQUARE_STATUS',
          destination:'$destination',
          statusType:'FIELD_LEAVE_LOCKED',
          blockedPlayer:'$opponent'
        }
      }
    ]
  },
  '14':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['DISCARD_AND_GAIN_FATE'],
    prompts:['REACTION'],
    program:[
      {
        kind:'COLLECT_BOARD',
        local:'targetIids',
        filter:{
          adjacentOrDiagonal:true,
          opponent:true,
          supporter:true,
          targetable:'DISCARD_CARD'
        }
      },
      {
        kind:'OPERATION',
        operation:{
          type:'DISCARD_AND_GAIN_FATE',
          targetIids:'$targetIids',
          fatePerCard:1,
          reason:'UNSEEN_STRIKES'
        }
      }
    ]
  },
  '17':{
    timings:['WHEN_SET'],
    operations:['CREATE_SQUARE_STATUS'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        filter:{open:true, excludePermanentlyBlocked:true}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_SQUARE_STATUS',
          destination:'$destination',
          statusType:'PERMANENTLY_BLOCKED'
        }
      }
    ]
  },
  '21':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['CREATE_SQUARE_STATUS'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_DESTINATIONS',
        local:'destinations',
        min:1,
        max:2,
        filter:{sameZone:true, includeOccupied:true, adjacent:true}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_SQUARE_STATUS',
          destinations:'$destinations',
          statusType:'COORDINATOR_SUPPRESSED',
          blockedPlayer:'$opponent'
        }
      }
    ]
  },
  '24':{
    effectLabels:['ADJACENCY_BONUS'],
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '36':{
    timings:['PASSIVE'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    triggerSubscriptions:['CARD_CONSOLIDATED']
  },
  '41':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '43':{
    timings:['WHEN_SET'],
    operations:['ADD_SAFE_SQUARE'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {kind:'SELECT_DESTINATION', local:'destination', filter:{safeSquareSlot:true}},
      {kind:'OPERATION', operation:{type:'ADD_SAFE_SQUARE', playerIndex:'$controller', destination:'$destination'}}
    ]
  },
  '44':{
    effectLabels:['ADJACENCY_BONUS'],
    timings:['PASSIVE'],
    operations:['SET_CARD_COUNTER'],
    prompts:['MODAL_CHOICE'],
    program:[
      {kind:'CHOOSE_OPTION',local:'declaredType',options:[
        {value:'Supporter',label:'Supporter'},
        {value:'Initiator',label:'Initiator'},
        {value:'Improvisor',label:'Improviser'},
        {value:'Coordinator',label:'Coordinator'},
        {value:'Dauntless',label:'Dauntless'}
      ],defaultChoice:'Supporter'},
      {kind:'OPERATION',operation:{type:'SET_CARD_COUNTER',targetIid:'$sourceIid',counterKey:'sovietDeclaredType',value:'$declaredType',sourceIid:'$sourceIid'}}
    ]
  },
  '45':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '52':{
    timings:['WHEN_SET'],
    operations:['CREATE_CARD_MARK', 'RANDOM_DISCARD_HAND'],
    prompts:['BOARD_TARGET', 'REACTION'],
    triggerSubscriptions:['CARD_DISCARDED', 'CARD_TRANSFERRED'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        optional:true,
        filter:{sameZone:true, opponent:true, targetable:'CREATE_CARD_MARK'}
      },
      {
        kind:'OPERATION',
        targeted:true,
        operation:{type:'CREATE_CARD_MARK', targetIid:'$targetIid'}
      }
    ]
  },
  '61':{
    timings:['WHEN_SET'],
    operations:['REVEAL_HAND', 'MASS_MODIFY_MATCHING_CARD', 'MODIFY_FATE'],
    prompts:['CARD_SELECTION', 'REACTION'],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'REVEAL_HAND',
          viewerPlayerIndex:'$controller',
          targetPlayerIndex:'$opponent'
        }
      },
      {
        kind:'SELECT_CARDS',
        local:'selectedIid',
        min:0,
        max:1,
        optional:true,
        filter:{locations:['hand'], playerIndex:'opponent', character:true}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'MASS_MODIFY_MATCHING_CARD',
          selectedIid:'$selectedIid',
          targetPlayerIndex:'$opponent',
          amount:-7,
          reason:'PRECISE_SHOT'
        }
      }
    ]
  },
  '62':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['MOVE_CARD'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        optional:true,
        filter:{opponentSide:true, open:true}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'MOVE_CARD',
          cardIid:'$sourceIid',
          destination:'$destination'
        }
      }
    ]
  },
  '64':{
    effectLabels:['ADJACENCY_BONUS'],
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '70':{
    timings:['PASSIVE'],
    operations:['TRANSFER_CARDS', 'RANDOM_HAND_FATE', 'DISCARD_CARD'],
    prompts:[]
  },
  '71':{
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'FORT_CALVIN_WATCHER',
            playerIndex:'$opponent',
            sourceIid:'$sourceIid',
            remaining:3,
            characterRedirected:false
          }
        }
      }
    ]
  },
  '72':{
    timings:['WHEN_SET'],
    operations:['RANDOM_STEAL_HAND'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'RANDOM_STEAL_HAND',
          fromPlayerIndex:'$opponent',
          toPlayerIndex:'$controller'
        }
      }
    ]
  },
  '73':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['DISCARD_TYPES_AND_GAIN_FATE', 'MOVE_CARD'],
    prompts:[],
    customCommand:'EXPEDITIONARY_MOVE',
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'DISCARD_TYPES_AND_GAIN_FATE',
          cardTypes:['Initiator', 'Improvisor'],
          reason:'GLOBAL_MISSIONS'
        }
      }
    ]
  },
  '74':{
    timings:['PASSIVE'],
    operations:['CHANGE_PLAYER_COUNTER'],
    prompts:[],
    triggerSubscriptions:['CARD_DRAWN', 'CARD_TRANSFERRED']
  },
  '78':{
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'FACE_DOWN_CONSOLIDATION_PERMISSION',
            playerIndex:'$controller',
            sourceIid:'$sourceIid',
            inferSourceZone:true,
            remaining:1
          }
        }
      }
    ]
  },
  '91':{
    timings:['WHEN_SET'],
    operations:['CREATE_TIMED_PLAYER_STATUS'],
    prompts:[],
    sharedUseLimit:{key:'SNOWY_VILLAGE', maxUses:2},
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_TIMED_PLAYER_STATUS',
          statusType:'LANDSCAPE_CHANGE_BLOCKED',
          playerIndex:'$opponent',
          targetTurns:5,
          startsNextTargetTurn:true,
          useCounterKey:'SNOWY_VILLAGE',
          maxUses:2
        }
      }
    ]
  },
  '94':{
    timings:['WHEN_SET'],
    operations:['SCHEDULE_CARD', 'TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        filter:{locations:['deck'], playerIndex:'controller', rarity:'triangle'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'SCHEDULE_CARD',
          targetIid:'$targetIid',
          playerIndex:'$controller',
          ownerTurns:4
        }
      }
    ]
  },
  '98':{
    timings:['OPENING_HAND', 'PASSIVE'],
    operations:[],
    prompts:[]
  },
  '99':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'SUPPORTERS_AS_CHARACTERS',
            playerIndex:'$controller',
            sourceIid:'$sourceIid',
            remainingTargetTurns:5
          }
        }
      }
    ]
  },
  '100':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['TURN_STARTED']
  },
  '86':{
    timings:['PASSIVE'],
    operations:['DRAW_CARD', 'MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['DECK_SEARCHED']
  },
  '09':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '10':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[],
    havanoTargeting:'OPPONENT',
    havanoPassiveEntry:true
  },
  '11':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '12':{
    timings:['WHEN_SET'],
    operations:['CREATE_STATUS'],
    prompts:['BOARD_TARGET'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIids',
        min:0,
        max:2,
        optional:true,
        filter:{sameZone:true, controller:true, effectMutable:true}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_STATUS',
          targetIids:'$targetIids',
          status:'IMMUNE_TO_OPPONENT_EFFECTS'
        }
      }
    ]
  },
  '03':{
    timings:['ACTIVATE'],
    operations:['MODIFY_FATE'],
    prompts:['BOARD_TARGET'],
    maxUses:1,
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        filter:{sameZone:true, effectMutable:true, targetable:'MODIFY_FATE'}
      },
      {
        kind:'OPERATION',
        targeted:true,
        operation:{type:'MODIFY_FATE', targetIid:'$targetIid', multiplier:2, amount:5}
      }
    ]
  },
  '05':{
    timings:['WHEN_SET'],
    operations:['MODIFY_FATE'],
    prompts:['BOARD_TARGET'],
    program:[
      {kind:'SELECT_BOARD', local:'targetIid', filter:{sameZone:true, effectMutable:true, targetable:'MODIFY_FATE'}},
      {kind:'OPERATION', targeted:true, operation:{type:'MODIFY_FATE', targetIid:'$targetIid', amount:3}}
    ]
  },
  '06':{
    timings:['ACTIVATE'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    maxUses:1,
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{locations:['deck'], playerIndex:'controller', excludeRarity:'star'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIid:'$targetIid',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '13':{
    timings:['WHEN_SET'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIids',
        min:0,
        max:2,
        optional:true,
        filter:{locations:['deck'], playerIndex:'controller', type:'Supporter'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIids:'$targetIids',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '15':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['CARD_SET']
  },
  '16':{
    timings:['WHEN_SET'],
    operations:['DISCARD_CARD'],
    prompts:['BOARD_TARGET', 'REACTION'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{
          sameZone:true,
          opponent:true,
          supporter:true,
          effectMutable:true,
          targetable:'DISCARD_CARD'
        }
      },
      {
        kind:'OPERATION',
        targeted:true,
        operation:{type:'DISCARD_CARD', targetIid:'$targetIid', reason:'MINAE_DEATH_SQUAD'}
      }
    ]
  },
  '18':{
    timings:['WHEN_SET'],
    operations:['CREATE_TIMED_PLAYER_STATUS'],
    prompts:[],
    sharedUseLimit:{key:'SEMPER_FIDELIS', maxUses:3},
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_TIMED_PLAYER_STATUS',
          statusType:'SUPPORTER_EFFECTS_BLOCKED',
          playerIndex:'$opponent',
          targetTurns:1,
          startsNextTargetTurn:true,
          useCounterKey:'SEMPER_FIDELIS',
          maxUses:3
        }
      }
    ]
  },
  '19':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '20':{
    timings:['ACTIVATE'],
    operations:['CREATE_TIMED_PLAYER_STATUS'],
    prompts:['REACTION'],
    manualOnly:true,
    maxUses:2,
    program:[{kind:'OPERATION',operation:{type:'CREATE_TIMED_PLAYER_STATUS',statusType:'MORALE_DAMAGE_INFLICTED_ZERO',playerIndex:'$opponent',targetTurns:1,startsNextTargetTurn:true}}]
  },
  '22':{
    timings:['ACTIVATE'],
    operations:['MODIFY_FATE'],
    prompts:['BOARD_TARGET'],
    maxUses:1,
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIids',
        min:0,
        max:2,
        optional:true,
        filter:{sameZone:true, controller:true, effectMutable:true}
      },
      {
        kind:'OPERATION',
        operation:{type:'MODIFY_FATE', targetIids:'$targetIids', amount:3}
      }
    ]
  },
  '23':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '26':{
    timings:['ACTIVATE'],
    operations:['REVEAL_HAND'],
    prompts:[],
    program:[{kind:'OPERATION', operation:{type:'REVEAL_HAND', viewerPlayerIndex:'$controller', targetPlayerIndex:'$opponent'}}]
  },
  '27':{
    timings:['ACTIVATE'],
    operations:['DRAW_CARD'],
    prompts:[],
    maxUses:1,
    program:[{kind:'OPERATION', operation:{type:'DRAW_CARD', playerIndex:'$controller', count:3, activatedEffect:true}}]
  },
  '29':{
    timings:['ACTIVATE'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    maxUses:1,
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIids',
        min:0,
        max:2,
        optional:true,
        filter:{locations:['deck', 'discard'], playerIndex:'controller', affiliation:'third_great_war'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIids:'$targetIids',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '30':{
    timings:['ACTIVATE'],
    operations:['DISCARD_CARD'],
    prompts:['BOARD_TARGET', 'REACTION'],
    maxUses:1,
    program:[
      {kind:'SELECT_BOARD', local:'targetIid', filter:{sameZone:true, opponent:true, row:1}},
      {kind:'OPERATION', targeted:true, operation:{type:'DISCARD_CARD', targetIid:'$targetIid'}}
    ]
  },
  '31':{
    timings:['WHEN_SET'],
    operations:['MODIFY_FATE'],
    prompts:['BOARD_TARGET'],
    program:[
      {kind:'SELECT_BOARD', local:'targetIid', optional:true, filter:{sameZone:true}},
      {kind:'OPERATION', targeted:true, operation:{type:'MODIFY_FATE', targetIid:'$targetIid', amount:-3}}
    ]
  },
  '32':{
    timings:['WHEN_SET'],
    operations:['DRAW_CARD'],
    prompts:[],
    program:[{kind:'OPERATION', operation:{type:'DRAW_CARD', playerIndex:'$controller', count:1, activatedEffect:true}}]
  },
  '33':{
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'NEXT_CHARACTER_HAND_ARRIVAL',
            playerIndex:'$controller',
            sourceIid:'$sourceIid',
            fateBonus:2,
            costDelta:-1
          }
        }
      }
    ]
  },
  '34':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['CARD_MOVED']
  },
  '35':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '38':{
    timings:['ACTIVATE'],
    operations:['DISCARD_CARD', 'MODIFY_FATE'],
    prompts:['BOARD_TARGET'],
    oncePerTurn:true,
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        filter:{
          controller:true,
          supporter:true,
          effectMutable:true,
          targetable:'DISCARD_CARD'
        }
      },
      {
        kind:'OPERATION',
        operation:{type:'DISCARD_CARD', targetIid:'$targetIid', reason:'JAKE_SACRIFICE'}
      },
      {
        kind:'OPERATION',
        operation:{type:'MODIFY_FATE', targetIid:'$sourceIid', amount:4, reason:'JAKE_FATE_GAIN'}
      }
    ]
  },
  '39':{
    timings:['ACTIVATE'],
    operations:['MOVE_CARD'],
    prompts:['BOARD_TARGET', 'BOARD_DESTINATION', 'REACTION'],
    maxUses:1,
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        filter:{
          sameZone:true,
          opponent:true,
          movable:true,
          targetable:'MOVE_CARD',
          requiresDestination:{sameZone:true, open:true}
        }
      },
      {kind:'SELECT_DESTINATION', local:'destination', filter:{sameZone:true, open:true}},
      {kind:'OPERATION', targeted:true, operation:{type:'MOVE_CARD', cardIid:'$targetIid', destination:'$destination'}}
    ]
  },
  '40':{
    timings:['ACTIVATE'],
    manualOnly:true,
    operations:['CREATE_STATUS'],
    prompts:[],
    maxUses:2,
    blockedWhileStatus:'NEXT_DRAW_GAINS_6',
    program:[{kind:'OPERATION', operation:{type:'CREATE_STATUS', targetIid:'$sourceIid', status:'NEXT_DRAW_GAINS_6'}}]
  },
  '42':{
    timings:['WHEN_SET'],
    operations:['DRAW_CARD', 'DISCARD_CARD'],
    prompts:['HAND_SELECTION'],
    program:[
      {
        kind:'OPERATION',
        operation:{type:'DRAW_CARD', playerIndex:'$controller', count:2, activatedEffect:true}
      },
      {
        kind:'SELECT_HAND',
        local:'targetIids',
        exactUpToAvailable:2,
        filter:{playerIndex:'controller', targetable:'DISCARD_CARD'}
      },
      {
        kind:'OPERATION',
        operation:{type:'DISCARD_CARD', targetIids:'$targetIids', reason:'WEST_GERMAN_SOLDIER'}
      }
    ]
  },
  '46':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['DRAW_PHASE_COMPLETED']
  },
  '47':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['CARD_CONSOLIDATED']
  },
  '48':{
    timings:['ACTIVATE'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    maxUses:1,
    program:[
      {
        kind:'SELECT_CARDS',
        local:'deckTargetIid',
        min:0,
        max:1,
        optional:true,
        cancelBehavior:'CONTINUE',
        filter:{locations:['deck'], playerIndex:'controller', affiliation:'expanded_worlds'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIid:'$deckTargetIid',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      },
      {
        kind:'SELECT_CARDS',
        local:'discardTargetIid',
        min:0,
        max:1,
        optional:true,
        cancelBehavior:'CONTINUE',
        filter:{
          locations:['discard'],
          playerIndex:'controller',
          affiliation:'expanded_worlds',
          excludeRarity:'star'
        }
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIid:'$discardTargetIid',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '49':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '50':{
    timings:['WHEN_SET'],
    operations:['CREATE_TIMED_PLAYER_STATUS'],
    prompts:['ZONE_SELECTION'],
    program:[
      {kind:'SELECT_ZONE', local:'zone'},
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_TIMED_PLAYER_STATUS',
          statusType:'ZONE_ACTIONS_BLOCKED',
          playerIndex:'$opponent',
          zone:'$zone',
          targetTurns:1,
          startsNextTargetTurn:true
        }
      }
    ]
  },
  '51':{
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS', 'MODIFY_FATE'],
    prompts:['MODAL_CHOICE', 'REACTION'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'affiliation',
        options:[
          {value:'reality', label:'Reality'},
          {value:'third_great_war', label:'Third Great War'},
          {value:'expanded_worlds', label:'Expanded Worlds'},
          {value:'eventide', label:'Eventide'}
        ],
        defaultChoice:'reality'
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'RIVERA_AFFILIATION_BONUS',
            playerIndex:'$controller',
            sourceIid:'$sourceIid',
            affiliation:'$affiliation',
            value:4,
            remainingOwnerTurns:3
          }
        }
      }
    ]
  },
  '53':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '54':{
    timings:['WHEN_SET'],
    operations:['MOVE_CARD'],
    prompts:['BOARD_TARGET', 'BOARD_DESTINATION'],
    optional:true,
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        optional:true,
        filter:{
          sameZone:true,
          controller:true,
          movable:true,
          targetable:'MOVE_CARD',
          requiresDestination:{ownSide:true, openOrControlled:true}
        }
      },
      {kind:'SELECT_DESTINATION', local:'destination', filter:{ownSide:true, openOrControlled:true}},
      {kind:'OPERATION', operation:{type:'MOVE_CARD', cardIid:'$targetIid', destination:'$destination', allowSwap:true}}
    ]
  },
  '55':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '57':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '56':{
    timings:['REACTION'],
    operations:[],
    prompts:['REACTION'],
    reactionKind:'LYDIA',
    maxUses:3,
    triggerSubscriptions:['EFFECT_ACTIVATED']
  },
  '58':{
    timings:['WHEN_SET'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{locations:['discard'], playerIndex:'controller', type:'Supporter'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIid:'$targetIid',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '59':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '60':{
    timings:['WHEN_SET'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{locations:['deck'], playerIndex:'controller', type:'Supporter'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIid:'$targetIid',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '63':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '65':{
    timings:['WHEN_SET'],
    operations:['SET_FATE'],
    prompts:[],
    program:[{kind:'OPERATION', operation:{type:'SET_FATE', targetIid:'$sourceIid', value:4}}]
  },
  '66':{
    timings:['WHEN_SET'],
    operations:['CHANGE_ZONE_AFFILIATION', 'MODIFY_FATE'],
    prompts:['MODAL_CHOICE', 'REACTION'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'affiliation',
        options:[
          {value:'reality', label:'Reality'},
          {value:'third_great_war', label:'Third Great War'},
          {value:'expanded_worlds', label:'Expanded Worlds'},
          {value:'eventide', label:'Eventide'}
        ],
        defaultChoice:'reality'
      },
      {
        kind:'OPERATION',
        operation:{
          type:'CHANGE_ZONE_AFFILIATION',
          playerIndex:'$controller',
          affiliation:'$affiliation',
          reason:'MARK_MENZ_BEYOND_DRAWINGS'
        }
      }
    ]
  },
  '67':{
    timings:['REACTION'],
    operations:[],
    prompts:['REACTION'],
    reactionKind:'SECULES',
    maxUses:1,
    triggerSubscriptions:['EFFECT_ACTIVATED', 'CARD_SET']
  },
  '68':{
    timings:['WHEN_SET'],
    operations:['TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{locations:['deck'], playerIndex:'controller', type:'Coordinator', excludeRarity:'star'}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIid:'$targetIid',
          playerIndex:'$controller',
          destinationPile:'hand'
        }
      }
    ]
  },
  '69':{
    timings:['WHEN_SET'],
    operations:['MODIFY_MORALE', 'TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:1,max:1,
        filter:{locations:['discard'], playerIndex:'controller', type:'Initiator'}
      },
      {
        kind:'OPERATION',
        operation:{type:'MODIFY_MORALE',playerIndex:'$controller',sourceIid:'$sourceIid',amount:-25,reason:'BREAKFAST_REPUBLIC_BUSSER_COST'}
      },
      {
        kind:'OPERATION',
        operation:{type:'TRANSFER_CARDS',targetIid:'$targetIid',playerIndex:'$controller',destinationPile:'hand'}
      }
    ]
  },
  '76':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['MODIFY_FATE', 'CREATE_STATUS'],
    prompts:[],
    program:[
      {kind:'OPERATION', operation:{type:'MODIFY_FATE', targetIid:'$sourceIid', amount:5}},
      {kind:'OPERATION', operation:{type:'CREATE_STATUS', targetIid:'$sourceIid', status:'IMMUNE_TO_OPPONENT_EFFECTS'}}
    ]
  },
  '77':{
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['SET_CARD_COUNTER'],
    prompts:['MODAL_CHOICE'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'affiliation',
        options:[
          {value:'reality', label:'Reality'},
          {value:'third_great_war', label:'Third Great War'},
          {value:'expanded_worlds', label:'Expanded Worlds'},
          {value:'eventide', label:'Eventide'}
        ],
        defaultChoice:'reality'
      },
      {
        kind:'OPERATION',
        operation:{
          type:'SET_CARD_COUNTER',
          targetIid:'$sourceIid',
          counterKey:'declaredAffiliation',
          value:'$affiliation'
        }
      }
    ]
  },
  '79':{
    timings:['REACTION'],
    operations:['SET_CARD'],
    prompts:['REACTION', 'BOARD_DESTINATION'],
    reactionKind:'HAVANO',
    triggerSubscriptions:['CARD_TARGETED']
  },
  '80':{
    timings:['WHEN_SET'],
    operations:['DISCARD_CARD', 'DRAW_CARD'],
    prompts:['BOARD_TARGET'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{
          sameZone:true,
          controller:true,
          character:true,
          excludeSource:true,
          effectMutable:true,
          targetable:'DISCARD_CARD'
        }
      },
      {
        kind:'OPERATION',
        operation:{type:'DISCARD_CARD', targetIid:'$targetIid', reason:'APPARITION_POLITICAL_RAMBLINGS'}
      },
      {
        kind:'OPERATION',
        operation:{type:'DRAW_CARD', playerIndex:'$controller', count:2, activatedEffect:true}
      }
    ]
  },
  '83':{
    timings:['ACTIVATE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    maxUses:1,
    program:[
      {
        kind:'COLLECT_BOARD',
        local:'targetIids',
        filter:{sameZone:true, controller:true, character:true, faceUp:true, effectMutable:true}
      },
      {
        kind:'OPERATION',
        operation:{type:'MODIFY_FATE', targetIids:'$targetIids', amount:2}
      }
    ]
  },
  '85':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '87':{
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS', 'MODIFY_FATE'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'CONSOLIDATION_FATE_BONUS',
            playerIndex:'$controller',
            sourceIid:'$sourceIid',
            value:3,
            affectedIids:['$sourceIid']
          }
        }
      }
    ]
  },
  '88':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '89':{
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  '90':{
    timings:['WHEN_SET'],
    operations:['RANDOM_TRANSFER_CARDS', 'MODIFY_FATE'],
    prompts:['MODAL_CHOICE', 'REACTION'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'affiliation',
        options:[
          {value:'reality', label:'Reality'},
          {value:'third_great_war', label:'Third Great War'},
          {value:'expanded_worlds', label:'Expanded Worlds'},
          {value:'eventide', label:'Eventide'}
        ],
        defaultChoice:'reality'
      },
      {
        kind:'OPERATION',
        operation:{
          type:'RANDOM_TRANSFER_CARDS',
          playerIndex:'$controller',
          sourcePile:'deck',
          destinationPile:'hand',
          count:2,
          affiliation:'$affiliation',
          fateBonus:3,
          shuffleDeckAfter:true,
          activatedDrawEffect:true
        }
      }
    ]
  },
  '92':{
    timings:['PASSIVE'],
    operations:['CREATE_STATUS'],
    prompts:[],
    triggerSubscriptions:['EFFECT_REACTED']
  },
  '93':{
    timings:['ACTIVATE'],
    operations:['MODIFY_FATE'],
    prompts:['BOARD_TARGET', 'REACTION'],
    havanoTargeting:'OPPONENT',
    oncePerTurn:true,
    program:[
      {
        kind:'SELECT_BOARD',
        local:'targetIid',
        filter:{opponent:true, effectMutable:true, targetable:'MODIFY_FATE'}
      },
      {
        kind:'OPERATION',
        targeted:true,
        operation:{type:'MODIFY_FATE', targetIid:'$targetIid', amount:-1}
      }
    ]
  },
  '95':{
    timings:['PASSIVE'],
    operations:['TICK_COUNTER_FATE', 'MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['TURN_STARTED']
  },
  '96':{
    timings:['WHEN_SET'],
    operations:['RANDOM_TRANSFER_CARDS'],
    prompts:['REACTION'],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'RANDOM_TRANSFER_CARDS',
          playerIndex:'$controller',
          sourcePile:'discard',
          destinationPile:'deckRandom',
          count:4,
          excludeRarity:'star'
        }
      }
    ]
  },
  '97':{
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    havanoTargeting:'OPPONENT',
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'CONSOLIDATION_COST_MODIFIER',
            playerIndex:'$opponent',
            sourceIid:'$sourceIid',
            sourceController:'$controller',
            value:1,
            remaining:2
          }
        }
      }
    ]
  },
  'bh01':{
    timings:['ACTIVATE', 'PASSIVE'],
    operations:['MOVE_CARD', 'DRAW_CARD'],
    prompts:['BOARD_DESTINATION'],
    customCommand:'MOVE_AND_DRAW'
  },
  'bh02':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['DRAW_EFFECT_ACTIVATED']
  },
  'bh03':{
    timings:['HAND_ARRIVAL', 'PASSIVE'],
    operations:['TRANSFER_CARDS'],
    prompts:[]
  },
  'bh04':{
    timings:['WHEN_SET'],
    operations:['SPLIT_FATE_LOSS_BY_TYPE', 'MODIFY_FATE'],
    prompts:['MODAL_CHOICE', 'REACTION'],
    havanoTargeting:'OPPONENT',
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'cardType',
        options:[
          {value:'Supporter', label:'Supporter'},
          {value:'Initiator', label:'Initiator'},
          {value:'Improvisor', label:'Improviser'},
          {value:'Coordinator', label:'Coordinator'},
          {value:'Dauntless', label:'Dauntless'}
        ],
        defaultChoice:'Supporter'
      },
      {
        kind:'OPERATION',
        operation:{
          type:'SPLIT_FATE_LOSS_BY_TYPE',
          cardType:'$cardType',
          total:20,
          reason:'DESTRUCTION_OF_PARADISE'
        }
      }
    ]
  },
  'bh05':{
    timings:['HAND_ARRIVAL', 'WHEN_SET'],
    operations:[],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        filter:{
          locations:['hand', 'deck'],
          playerIndex:'controller',
          excludeCardId:'bh05',
          copyEffectAvailable:true
        }
      },
      {
        kind:'COPY_EFFECT',
        cardIid:'$targetIid',
        execute:true
      }
    ]
  },
  'bh06':{
    timings:['WHEN_SET'],
    minimumTurn:6,
    operations:['CREATE_TOKENS'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_TOKENS',
          playerIndex:'$controller',
          count:3,
          tokenKind:'ADAPTIVE'
        }
      }
    ]
  },
  'bh07':{
    effectLabels:['ADJACENCY_BONUS'],
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  'bh08':{
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['EFFECT_REACTED']
  },
  'bh09':{
    timings:['WHEN_SET'],
    operations:['GAIN_ZONE_FATE_DIFFERENCE'],
    prompts:['ZONE_SELECTION'],
    program:[
      {
        kind:'SELECT_ZONE',
        local:'zone'
      },
      {
        kind:'OPERATION',
        operation:{type:'GAIN_ZONE_FATE_DIFFERENCE', zone:'$zone'}
      }
    ]
  },
  'bh10':{
    timings:['WHEN_SET'],
    operations:['REDRAW_HAND', 'DRAW_CARD', 'DISCARD_CARD'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{type:'REDRAW_HAND', playerIndex:'$controller'}
      }
    ]
  },
  'bh11':{
    effectLabels:['ADJACENCY_BONUS_MULTIPLIER'],
    timings:['PASSIVE'],
    operations:[],
    prompts:[]
  },
  'bh12':{
    effectLabels:['ADJACENCY_BONUS'],
    timings:['WHEN_SET', 'PASSIVE'],
    operations:['CREATE_SQUARE_STATUS'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {
        kind:'SELECT_DESTINATION',
        local:'destination',
        filter:{sameZone:true, includeOccupied:true, adjacent:true}
      },
      {
        kind:'OPERATION',
        operation:{type:'CREATE_SQUARE_STATUS', destination:'$destination', statusType:'FLOWER_KING_BLESSED'}
      }
    ]
  },
  'bh13':{
    timings:['WHEN_SET'],
    operations:['MODIFY_FATE', 'TRANSFER_CARDS'],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_HAND',
        local:'targetIids',
        min:0,
        max:3,
        optional:true,
        cancelBehavior:'CONTINUE',
        filter:{playerIndex:'controller', targetable:'MODIFY_FATE'}
      },
      {
        kind:'OPERATION',
        operation:{type:'MODIFY_FATE', targetIids:'$targetIids', amount:6}
      },
      {
        kind:'OPERATION',
        operation:{
          type:'TRANSFER_CARDS',
          targetIids:'$targetIids',
          playerIndex:'$controller',
          destinationPile:'deckBottom',
          shuffleDeckAfter:true,
          reason:'SMART_INVESTMENTS'
        }
      }
    ]
  },
  'bh14':{
    timings:['WHEN_SET'],
    operations:['CHANGE_CARD_TYPE'],
    prompts:['MODAL_CHOICE', 'HAND_SELECTION'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'cardType',
        options:[
          {value:'Supporter', label:'Supporter'},
          {value:'Initiator', label:'Initiator'},
          {value:'Improvisor', label:'Improviser'},
          {value:'Coordinator', label:'Coordinator'},
          {value:'Dauntless', label:'Dauntless'}
        ],
        defaultChoice:'Supporter'
      },
      {
        kind:'SELECT_HAND',
        local:'targetIids',
        min:0,
        maxAvailable:true,
        optional:true,
        cancelBehavior:'CONTINUE',
        filter:{playerIndex:'controller', targetable:'CHANGE_CARD_TYPE'}
      },
      {
        kind:'OPERATION',
        operation:{type:'CHANGE_CARD_TYPE', targetIids:'$targetIids', playerIndex:'$controller', cardType:'$cardType', reason:'CHARTER_OF_THE_UNITED_NATIONS'}
      }
    ]
  },
  'bh15':{
    effectLabels:['FATE_GAIN_RIDER'],
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[]
  },
  'bh16':{
    effectLabels:['ZONE_FATE_REDUCTION'],
    timings:['ACTIVATE'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    havanoTargeting:'OPPONENT',
    manualOnly:true,
    maxUses:2,
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'ZONE_FATE_MODIFIER',
            playerIndex:'$opponent',
            sourceIid:'$sourceIid',
            inferSourceZone:true,
            countControlledAffiliation:'eventide',
            valuePerControlledCard:-1,
            stackPerUse:true,
            reason:'LI_HUA_STORM_OF_TEN_THOUSAND_BLADES'
          }
        }
      }
    ]
  },
  'bh17':{
    effectLabels:['CONSOLIDATION_FATE_BONUS'],
    timings:['PASSIVE'],
    operations:['MODIFY_FATE'],
    prompts:[],
    triggerSubscriptions:['CARD_CONSOLIDATED']
  },
  'bh18':{
    effectLabels:['MORALE_CALCULATION_ZONE_FATE_REDUCTION'],
    timings:['PASSIVE'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    havanoTargeting:'OPPONENT',
    triggerSubscriptions:['MORALE_CYCLE_RESOLVED']
  },
  'bh19':{
    effectLabels:['PERMANENT_FATE_GAIN_POTENCY'],
    timings:['WHEN_SET'],
    operations:['CREATE_MATCH_STATUS'],
    prompts:[],
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'CREATE_MATCH_STATUS',
          status:{
            type:'PERMANENT_FATE_GAIN_POTENCY',
            playerIndex:'$controller',
            sourceIid:'$sourceIid',
            value:1,
            remainingOwnerTurns:1,
            reason:'HIGH_T'
          }
        }
      }
    ]
  },
  'bh20':{
    effectLabels:['EXTEND_MATCH_TURN_LIMIT'],
    timings:['WHEN_SET'],
    operations:['SET_MAX_TURNS'],
    prompts:[],
    maxUses:1,
    program:[
      {
        kind:'OPERATION',
        operation:{
          type:'SET_MAX_TURNS',
          amount:2,
          reason:'THOUSAND_YEAR_BIRD_CULT'
        }
      }
    ]
  },
  'bh21':{
    effectLabels:['VIEWER_FIELD_INFORMATION_CONCEALMENT'],
    timings:['WHEN_SET'],
    operations:['CREATE_TIMED_PLAYER_STATUS'],
    prompts:[],
    program:[{kind:'OPERATION',operation:{
      type:'CREATE_TIMED_PLAYER_STATUS', statusType:'BH21_FATE_MORALE_CONCEALMENT',
      playerIndex:'$opponent', sourceIid:'$sourceIid', sourceController:'$controller',
      targetTurns:4, startsNextTargetTurn:true
    }}]
  },
  'bh22':{
    effectLabels:['MORALE_RECOVERY_SQUARE'],
    timings:['WHEN_SET','PASSIVE'],
    operations:['CREATE_SQUARE_STATUS','MODIFY_MORALE'],
    prompts:['BOARD_DESTINATION'],
    program:[
      {kind:'SELECT_DESTINATION',local:'destination',filter:{controllerSafeRow:true,includeOccupied:true}},
      {kind:'OPERATION',operation:{
        type:'CREATE_SQUARE_STATUS',destination:'$destination',statusType:'MORALE_RECOVERY_SQUARE',
        playerIndex:'$controller',sourceIid:'$sourceIid',sourceController:'$controller'
      }}
    ]
  },
  'bh23':{
    timings:['WHEN_SET'],
    operations:['MODIFY_FATE'],
    prompts:['BOARD_TARGET'],
    program:[
      {kind:'SELECT_BOARD',local:'coordinatorIid',filter:{sameZone:true,controller:true,faceUp:true,cardIds:['15','bh02','bh08']}},
      {kind:'INHERIT_TRIGGERED_FATE',coordinatorIid:'$coordinatorIid'}
    ]
  },
  'bh24':{
    effectLabels:['NEXT_SUPPORTER_SET_EXEMPT'],
    timings:['WHEN_SET'],
    operations:['MODIFY_MORALE','CREATE_MATCH_STATUS'],
    prompts:[],
    program:[
      {kind:'OPERATION',operation:{type:'MODIFY_MORALE',playerIndex:'$controller',sourceIid:'$sourceIid',amount:-15,reason:'DEFENSE_IN_DEPTH_COST'}},
      {kind:'OPERATION',operation:{type:'CREATE_MATCH_STATUS',status:{type:'NEXT_SUPPORTER_SET_EXEMPT',playerIndex:'$controller',sourceIid:'$sourceIid',remaining:1,fateBonus:4}}}
    ]
  },
  'bh25':{
    timings:['WHEN_SET'],
    effectLabels:['CONDITIONAL_FATE_TRIGGER_PROC'],
    operations:['MODIFY_FATE','DRAW_CARD'],
    prompts:[],
    program:[{kind:'PROC_ZONE_CONDITIONAL_FATE_TRIGGERS',minimumTurn:18}]
  },
  'test-p3-chain':{
    testOnly:true,
    timings:['ACTIVATE'],
    operations:['MODIFY_FATE'],
    prompts:['MODAL_CHOICE', 'ZONE_SELECTION', 'HAND_SELECTION'],
    program:[
      {
        kind:'CHOOSE_OPTION',
        local:'stance',
        options:['CAUTIOUS', 'BOLD'],
        defaultChoice:'CAUTIOUS'
      },
      {kind:'SELECT_ZONE', local:'zone'},
      {
        kind:'SELECT_HAND',
        local:'targetIid',
        min:1,
        max:1,
        filter:{playerIndex:'controller'}
      },
      {kind:'OPERATION', operation:{type:'MODIFY_FATE', targetIid:'$targetIid', amount:1}}
    ]
  },
  'test-p3-card-selection':{
    testOnly:true,
    timings:['ACTIVATE'],
    operations:[],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'selectedIids',
        min:2,
        max:2,
        filter:{locations:['hand'], playerIndex:'controller'}
      }
    ]
  },
  'test-p3-board-multi':{
    testOnly:true,
    timings:['ACTIVATE'],
    operations:[],
    prompts:['BOARD_TARGET'],
    program:[
      {
        kind:'SELECT_BOARD',
        local:'selectedIids',
        min:2,
        max:2,
        filter:{controller:true, excludeSource:true}
      }
    ]
  },
  'test-p3-optional':{
    testOnly:true,
    timings:['ACTIVATE'],
    operations:[],
    prompts:['CARD_SELECTION'],
    program:[
      {
        kind:'SELECT_CARDS',
        local:'targetIid',
        min:0,
        max:1,
        optional:true,
        filter:{locations:['hand'], playerIndex:'controller'}
      }
    ]
  }
});

const PRESSURE_REWORK_REGISTRY = Object.freeze({
  '20':{timings:['ACTIVATE'],operations:['CREATE_TIMED_PLAYER_STATUS'],prompts:['REACTION'],manualOnly:true,maxUses:2,program:[{kind:'OPERATION',operation:{type:'CREATE_TIMED_PLAYER_STATUS',statusType:'MORALE_DAMAGE_INFLICTED_ZERO',playerIndex:'$opponent',targetTurns:1,startsNextTargetTurn:true}}]},
  '25':{timings:['PASSIVE'],operations:[],prompts:[],program:[]},
  '33':{timings:['WHEN_SET'],operations:['MODIFY_MORALE'],prompts:[],program:[{kind:'OPERATION',operation:{type:'MODIFY_MORALE',playerIndex:'$controller',sourceIid:'$sourceIid',amount:16}}]},
  '34':{timings:['WHEN_SET','PASSIVE'],operations:['SET_CARD_COUNTER'],prompts:['MODAL_CHOICE','REACTION'],havanoTargeting:'OPPONENT',program:[
    {kind:'CHOOSE_OPTION',local:'affiliation',options:[{value:'reality',label:'Reality'},{value:'third_great_war',label:'Third Great War'},{value:'expanded_worlds',label:'Expanded Worlds'},{value:'eventide',label:'Eventide'}],defaultChoice:'reality'},
    {kind:'OPERATION',operation:{type:'SET_CARD_COUNTER',targetIid:'$sourceIid',counterKey:'moraleAffiliation',value:'$affiliation'}}
  ]},
  '35':{timings:['PASSIVE'],operations:[],prompts:['REACTION'],havanoPassiveEntry:true},
  '44':{timings:['PASSIVE'],operations:['SET_CARD_COUNTER'],prompts:['MODAL_CHOICE'],program:[
    {kind:'CHOOSE_OPTION',local:'declaredType',options:[
      {value:'Supporter',label:'Supporter'},
      {value:'Initiator',label:'Initiator'},
      {value:'Improvisor',label:'Improviser'},
      {value:'Coordinator',label:'Coordinator'},
      {value:'Dauntless',label:'Dauntless'}
    ],defaultChoice:'Supporter'},
    {kind:'OPERATION',operation:{type:'SET_CARD_COUNTER',targetIid:'$sourceIid',counterKey:'sovietDeclaredType',value:'$declaredType',sourceIid:'$sourceIid'}}
  ]},
  '45':{timings:['WHEN_SET','PASSIVE'],operations:['MODIFY_MORALE','DISCARD_CARD'],prompts:['BOARD_TARGET','REACTION'],program:[
    {kind:'OPERATION',operation:{type:'MODIFY_MORALE',playerIndex:'$controller',sourceIid:'$sourceIid',amount:-50,reason:'THE_LAST_MOHICAN_COST'}},
    {kind:'SELECT_BOARD',local:'targetIid',filter:{targetable:'DISCARD_CARD'}},
    {kind:'OPERATION',targeted:true,operation:{type:'DISCARD_CARD',targetIid:'$targetIid',reason:'THE_LAST_MOHICAN'}}
  ]},
  '47':{timings:['WHEN_SET'],operations:['MODIFY_MORALE'],prompts:['REACTION'],havanoTargeting:'OPPONENT',program:[{kind:'OPERATION',operation:{type:'MODIFY_MORALE',playerIndex:'$opponent',sourceIid:'$sourceIid',amount:-10}}]},
  '64':{timings:['WHEN_SET'],operations:['SET_CARD_COUNTER'],prompts:['REACTION'],havanoTargeting:'OPPONENT',program:[{kind:'OPERATION',operation:{type:'SET_CARD_COUNTER',targetIid:'$sourceIid',counterKey:'doubleNextMoraleDamage',value:true}}]},
  '65':{timings:['PASSIVE','TURN_BOUNDARY'],operations:['MODIFY_MORALE'],prompts:['REACTION'],havanoPassiveEntry:true,triggerSubscriptions:['TURN_STARTED'],program:[]},
  '69':{timings:['WHEN_SET'],operations:['MODIFY_MORALE','TRANSFER_CARDS'],prompts:['CARD_SELECTION'],program:[
    {kind:'SELECT_CARDS',local:'targetIid',min:1,max:1,filter:{locations:['discard'],playerIndex:'controller',type:'Initiator'}},
    {kind:'OPERATION',operation:{type:'MODIFY_MORALE',playerIndex:'$controller',sourceIid:'$sourceIid',amount:-25,reason:'BREAKFAST_REPUBLIC_BUSSER_COST'}},
    {kind:'OPERATION',operation:{type:'TRANSFER_CARDS',targetIid:'$targetIid',playerIndex:'$controller',destinationPile:'hand'}}
  ]},
  '73':{timings:['PASSIVE'],operations:[],prompts:[]}
});

export function cardRule(cardId, state = null){
  const id = String(cardId || '');
  if(['20','34','64','73'].includes(id) && PRESSURE_REWORK_REGISTRY[id]) return PRESSURE_REWORK_REGISTRY[id];
  if(state?.gameSettings?.pressureCardReworks === true && PRESSURE_REWORK_REGISTRY[id]) return PRESSURE_REWORK_REGISTRY[id];
  return REGISTRY[id] || null;
}

export function hasTiming(cardId, timing, state = null){
  return !!cardRule(cardId, state)?.timings?.includes(String(timing || ''));
}

export function multiplayerEligibleCardIds(){
  return Object.keys(REGISTRY).filter(id=>REGISTRY[id]?.testOnly !== true).sort();
}

export function cardCoverageInventory(cardDefinitions = []){
  return cardDefinitions.map(card=>{
    const rule = cardRule(card.id);
    return {
      cardId:String(card.id),
      name:String(card.name || ''),
      abilityTiming:rule?.timings || [],
      operations:rule?.operations || [],
      promptTypes:rule?.prompts || [],
      triggerSubscriptions:rule?.triggerSubscriptions || [],
      customHandler:rule?.customCommand || '',
      parityFixtures:rule ? [`card-${card.id}-vertical-slice`] : [],
      multiplayerEligibility:rule ? 'vertical-slice-beta' : 'unsupported'
    };
  });
}
