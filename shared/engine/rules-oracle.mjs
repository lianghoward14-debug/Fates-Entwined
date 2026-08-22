// Independent gameplay oracle for authoritative-v3 certification.
//
// This file intentionally does not import the executable card registry. Its
// contracts come from printed card/landscape text and the established
// single-player behavior. A reducer implementation cannot certify itself by
// changing these expectations.

const freeze = value=>Object.freeze(value);
const list = value=>freeze(Array.isArray(value) ? [...value] : [value]);

const GLOBAL_PRESENTATION_ORDER = freeze([
  'PLACEMENT_OR_CONSOLIDATION_MOTION_FINISHES',
  'SET_OR_CONSOLIDATION_CINEMATIC_FINISHES',
  'ACTIVATION_CINEMATIC_ONLY_IF_RESOLUTION_IS_LEGAL',
  'RESULT_OVERLAY_SOUND_AND_FATE_GAIN_MAY_RUN_TOGETHER',
  'DRAW_MOVE_OR_DISCARD_MOTION_WAITS_FOR_CINEMATICS',
  'MODALS_AND_PICKERS_OPEN_LAST'
]);

const GLOBAL_FORBIDDEN = freeze([
  'CLIENT_MUTATES_CANONICAL_RULE_STATE',
  'SAME_COMMAND_RESOLVES_TWICE',
  'EFFECT_BENEFITS_OPPONENT_UNLESS_TEXT_EXPLICITLY_ALLOWS_IT',
  'EFFECT_TARGETS_IMMUNE_OR_INELIGIBLE_CARD',
  'EFFECT_TRIGGERS_WITHOUT_PRINTED_PREREQUISITE',
  'EFFECT_CINEMATIC_WITHOUT_A_LEGAL_RESOLUTION',
  'PROMPT_OR_DRAW_MOTION_PRECEDES_REQUIRED_CINEMATIC',
  'SEATS_DISAGREE_ON_ACTIVE_PLAYER_OR_PUBLIC_STATE'
]);

function card(id, name, timing, beneficiary, target, resolution, details = {}){
  return freeze({
    kind:'CARD',
    id:String(id),
    name,
    reviewed:true,
    authority:'PRINTED_TEXT_AND_SINGLEPLAYER',
    timing:list(timing),
    prerequisites:list(details.prerequisites || 'SOURCE_EFFECT_IS_ACTIVE'),
    beneficiary,
    target,
    resolution,
    cardinality:details.cardinality || 'AS_PRINTED',
    duration:details.duration || 'AS_PRINTED',
    useLimit:details.useLimit || 'NO_ADDITIONAL_LIMIT',
    reactionWindow:details.reactionWindow || 'STANDARD_OPPONENT_EFFECT_REACTIONS_WHEN_APPLICABLE',
    stateEvidence:list(details.stateEvidence || 'PUBLIC_STATE_MATCHES_PRINTED_RESULT'),
    requiredBranches:list(details.requiredBranches || ['ELIGIBLE_RESOLUTION', 'INELIGIBLE_OR_EMPTY_CASE']),
    forbidden:list([...(details.forbidden || []), ...GLOBAL_FORBIDDEN]),
    presentation:list(details.presentation || GLOBAL_PRESENTATION_ORDER)
  });
}

const CARD_RULES = [
  card('01','Felicyta Janowicz','PASSIVE','CONTROLLER','ADJACENT_CONTROLLED_CARDS','Each face-up adjacent card controlled by Felicyta’s controller gains exactly +4 effective Fate while Felicyta remains active.',{prerequisites:['SOURCE_FACE_UP_ON_FIELD','TARGET_ADJACENT','TARGET_CONTROLLED_BY_SOURCE_CONTROLLER'],forbidden:['SOURCE_COUNTS_AS_ITS_OWN_ADJACENT_CARD','OPPONENT_ADJACENT_CARD_GAINS_FATE']}),
  card('02','Anicka Konvicka',['WHEN_SET','PASSIVE'],'CONTROLLER','SOURCE_ZONE','Create exactly one full three-square extra safe row owned by Anicka’s controller in her zone; every card placed in that zone gains exactly +4 effective Fate.',{stateEvidence:['SAFE_ROW_ADDED.playerIndex_EQUALS_SOURCE_CONTROLLER','THREE_PLAYABLE_EXTRA_SQUARES_HAVE_SOURCE_CONTROLLER','ROW_OWNER_IDENTICAL_IN_BOTH_SEAT_PROJECTIONS','ZONE_PLACEMENT_BONUS_IS_PLUS_4'],forbidden:['SAFE_ROW_ASSIGNED_TO_OPPONENT','VIEWER_INDEX_CHANGES_ROW_OWNER','ANICKA_QUALIFIES_AS_A_NEW_PLACEMENT_MORE_THAN_ONCE']}),
  card('03','Howard','ACTIVATE','SELECTED_CARD','ANY_EFFECT_MUTABLE_CARD_IN_SOURCE_ZONE','Snapshot target current Fate once; set permanent Fate to snapshot × 2 + 5 exactly once.',{cardinality:'EXACTLY_ONE',useLimit:'ONCE_PER_CARD',stateEvidence:['ONE_EFFECT_ACTIVATED_EVENT','ONE_FATE_CHANGED_EVENT','AFTER_EQUALS_BEFORE_TIMES_2_PLUS_5','EFFECT_USE_EQUALS_1'],forbidden:['AUTOMATIC_ACTIVATION_DOES_NOT_CONSUME_USE','SECOND_ACTIVATION','TWO_FATE_MUTATIONS_FOR_ONE_RESOLUTION','TARGET_OUTSIDE_SOURCE_ZONE']}),
  card('04','Zoe','WHEN_SET','CONTROLLER','ONE_SQUARE_IN_SOURCE_ZONE','Chosen square permanently forbids the opponent from consolidating on it or using a card on it as reinforcement.',{cardinality:'EXACTLY_ONE_OPEN_OR_OCCUPIED_SQUARE',duration:'REST_OF_GAME',forbidden:['BLOCKS_CONTROLLER_CONSOLIDATION','BLOCKS_PLACEMENT_INSTEAD_OF_CONSOLIDATION','TARGET_OUTSIDE_SOURCE_ZONE']}),
  card('05','17th British Regiment of Africa','WHEN_SET','SELECTED_CARD','ONE_EFFECT_MUTABLE_CARD_IN_SOURCE_ZONE','Selected card gains exactly +3 permanent Fate.',{cardinality:'EXACTLY_ONE',stateEvidence:['ONE_FATE_CHANGED_WITH_DELTA_PLUS_3'],forbidden:['TARGET_OUTSIDE_SOURCE_ZONE','MULTIPLE_TARGETS']}),
  card('06','Jorge Alvarez','ACTIVATE','CONTROLLER','ONE_NON_STAR_CARD_IN_CONTROLLERS_DECK','Move the selected non-Star card from controller deck to controller hand.',{cardinality:'EXACTLY_ONE',useLimit:'ONCE_PER_CARD',forbidden:['STAR_CARD_ELIGIBLE','CARD_MOVED_TO_OPPONENT_HAND','SEARCH_EMPTY_DECK_OPENS_ACTIVATION']}),
  card('07','Maja Kaminska',['DECK_SET','WHEN_SET'],'CONTROLLER','UP_TO_THREE_SUPPORTERS_IN_CONTROLLERS_DECK','May be set from deck only to controller safe row; on set, move up to three Supporters to controller hand, give each +4 permanent Fate, and grant exactly two extra Supporter sets this turn.',{cardinality:'UP_TO_THREE_AVAILABLE',duration:'EXTRA_SET_LIMIT_THIS_TURN_ONLY',forbidden:['DECK_SET_IN_CONTESTED_ROW','NON_SUPPORTER_SELECTED','BONUS_GRANTED_TO_OPPONENT','MORE_THAN_TWO_EXTRA_SUPPORTER_SETS']}),
  card('08','Lina','WHEN_SET','CONTROLLER','ONE_REALITY_CARD_IN_CONTROLLER_DECK_OR_DISCARD_THEN_LEGAL_DESTINATION','Select one Reality card and set it at no reinforcement cost; its own set effect proceeds normally after placement presentation.',{cardinality:'EXACTLY_ONE_IF_AVAILABLE',forbidden:['NON_REALITY_SELECTED','OPPONENT_PILE_SEARCHED','REINFORCEMENT_CHARGED','FREE_SET_SKIPS_TARGET_SET_EFFECT']}),
  card('09','United Nations 5th Army','PASSIVE','CONTROLLER','SOURCE_CARD','This card contributes exactly 2 Reinforcement whenever eligible as consolidation reinforcement.',{forbidden:['CONTRIBUTES_MORE_OR_LESS_THAN_2','SUPPRESSION_REMOVES_PRINTED_REINFORCEMENT']}),
  card('10','Post-Modernist Dylan','PASSIVE','CONTROLLER','OPPONENT_CARDS_IN_SOURCE_ZONE','Each opponent card in Dylan’s zone loses exactly 3 effective Fate while Dylan remains active.',{forbidden:['CONTROLLERS_CARDS_LOSE_FATE','CARDS_OUTSIDE_ZONE_LOSE_FATE','LOSS_BECOMES_PERMANENT']}),
  card('100','Felicyta and Květka (Youth)','PASSIVE','CONTROLLER','SOURCE_CARD','Gain +2 permanent Fate once for each controller turn during which Snow on the Carpathians is active; independently gain +3 effective Fate if controller controls another Felicyta or Květka card.',{prerequisites:['SNOW_COUNTER_REQUIRES_IGB15_ON_CONTROLLER_TURN','KINSHIP_REQUIRES_OTHER_QUALIFYING_CARD'],forbidden:['SOURCE_QUALIFIES_ITSELF_FOR_PLUS_3','OPPONENT_QUALIFYING_CARD_COUNTS','PLUS_2_TICKS_ON_OPPONENT_TURN','PLUS_2_TICKS_WITHOUT_SNOW']}),
  card('11','Anne Stone','PASSIVE','CONTROLLER','SUPPORTERS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each qualifying Supporter gains exactly +3 effective Fate.',{forbidden:['SOURCE_OR_NON_SUPPORTER_GAINS_BONUS','OPPONENT_SUPPORTER_GAINS_BONUS','SUPPORTER_OUTSIDE_ZONE_GAINS_BONUS']}),
  card('12','Makenna','WHEN_SET','CONTROLLER','UP_TO_TWO_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Selected cards become immune to opponent effects while the protection remains active.',{cardinality:'ZERO_TO_TWO',forbidden:['OPPONENT_CARD_SELECTABLE','TARGET_OUTSIDE_SOURCE_ZONE','MORE_THAN_TWO_TARGETS','IMMUNITY_BLOCKS_CONTROLLERS_OWN_EFFECT']}),
  card('13','Johnathan Kirby','WHEN_SET','CONTROLLER','UP_TO_TWO_SUPPORTERS_IN_CONTROLLER_DECK','Move up to two selected Supporters from controller deck to controller hand.',{cardinality:'ZERO_TO_TWO',forbidden:['NON_SUPPORTER_SELECTED','OPPONENT_DECK_SEARCHED','MORE_THAN_TWO','ACTIVATE_BUTTON_REQUIRED']}),
  card('14','Alondra Hopkins',['WHEN_SET','PASSIVE'],'CONTROLLER','ADJACENT_OR_DIAGONAL_OPPONENT_SUPPORTERS','On set, discard each qualifying opponent Supporter and give Alondra exactly +1 permanent Fate per card actually discarded; while active, opponent cannot set Supporters adjacent to her.',{forbidden:['CONTROLLERS_SUPPORTERS_DISCARDED','NON_SUPPORTER_DISCARDED','ALONDRA_GAINS_FOR_BLOCKED_OR_IMMUNE_TARGET','DIAGONAL_SQUARE_BLOCKED_FOR_FUTURE_SET']}),
  card('15','Zsofia Szocs','PASSIVE','CONTROLLER','ALL_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each time controller sets a Coordinator in this zone, every controlled card currently in the zone gains exactly +1 permanent Fate once.',{prerequisites:['NEW_CARD_IS_COORDINATOR','NEW_CARD_CONTROLLER_EQUALS_SOURCE_CONTROLLER','PLACEMENT_ZONE_EQUALS_SOURCE_ZONE'],forbidden:['SOURCE_PLACEMENT_SELF_TRIGGERS_WITHOUT_COORDINATOR_EVENT','OPPONENT_COORDINATOR_TRIGGERS','CARD_OUTSIDE_ZONE_GAINS','SAME_SET_EVENT_TRIGGERS_TWICE']}),
  card('16','MINAE Death Squad','WHEN_SET','CONTROLLER','ONE_OPPONENT_SUPPORTER_IN_SOURCE_ZONE','Optionally discard exactly one eligible opponent Supporter.',{cardinality:'ZERO_OR_ONE',forbidden:['CONTROLLERS_SUPPORTER_TARGETED','NON_SUPPORTER_TARGETED','TARGET_OUTSIDE_ZONE','CANCEL_DISCARDS_DEFAULT_TARGET']}),
  card('17','Carolyn','WHEN_SET','NEITHER_PLAYER','ONE_OPEN_SQUARE_ANYWHERE','Chosen open square becomes unusable by both players for the rest of the game.',{cardinality:'EXACTLY_ONE',duration:'REST_OF_GAME',forbidden:['OCCUPIED_SQUARE_SELECTABLE','ONLY_ONE_PLAYER_BLOCKED','CANCEL_BLOCKS_DEFAULT_SQUARE']}),
  card('18','1st US Marines','WHEN_SET','CONTROLLER','OPPONENT_NEXT_TURN_SUPPORTER_EFFECTS','Suppress opponent Supporter set effects during exactly the opponent’s next turn.',{useLimit:'THREE_USES_PER_PLAYER_PER_GAME',duration:'OPPONENT_NEXT_TURN_ONLY',forbidden:['CONTROLLERS_EFFECTS_SUPPRESSED','SUPPRESSION_PERSISTS_EXTRA_TURN','FOURTH_USE','BLOCKED_SUPPORTER_LEAVES_PENDING_EFFECT']}),
  card('19','Květka Svoboda','PASSIVE','CONTROLLER','COORDINATORS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each qualifying Coordinator gains exactly +3 effective Fate.',{forbidden:['SOURCE_QUALIFIES_IF_NOT_COORDINATOR','OPPONENT_COORDINATOR_GAINS','CARD_OUTSIDE_ZONE_GAINS']}),
  card('20','South Wind Spearman','PASSIVE','CONTROLLER','SOURCE_CARD','Source is immune to opponent effects while face up on field, but not to its controller’s effects or game rules.',{forbidden:['OPPONENT_EFFECT_MUTATES_SOURCE','CONTROLLERS_EFFECT_IS_BLOCKED','IMMUNITY_PERSISTS_OFF_FIELD']}),
  card('21','Henry Dong',['WHEN_SET','PASSIVE'],'CONTROLLER','UP_TO_TWO_ADJACENT_SQUARES','Suppress opponent Coordinator effects located on selected adjacent squares while Henry remains active.',{cardinality:'ZERO_TO_TWO',forbidden:['NON_ADJACENT_SQUARE_SELECTABLE','CONTROLLERS_COORDINATOR_SUPPRESSED','MORE_THAN_TWO_SQUARES','SUPPRESSION_PERSISTS_AFTER_SOURCE_LEAVES']}),
  card('22','Isaac Perez','ACTIVATE','CONTROLLER','UP_TO_TWO_EFFECT_MUTABLE_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each selected card gains exactly +3 permanent Fate once.',{cardinality:'ZERO_TO_TWO',useLimit:'ONCE_PER_CARD',forbidden:['OPPONENT_CARD_SELECTABLE','TARGET_OUTSIDE_ZONE','MORE_THAN_TWO','PARTIAL_MUTATION_ON_INVALID_BATCH']}),
  card('23','Cathy','PASSIVE','CONTROLLER','CHARACTERS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each qualifying Character gains exactly +2 effective Fate.',{forbidden:['SUPPORTER_GAINS','OPPONENT_CHARACTER_GAINS','CHARACTER_OUTSIDE_ZONE_GAINS']}),
  card('24','Ralph’s Courtesy Clerk','PASSIVE','CONTROLLER','ADJACENT_SUPPORTERS','Each adjacent Supporter contributes exactly +1 additional Reinforcement while source remains active.',{forbidden:['NON_SUPPORTER_GAINS','NON_ADJACENT_SUPPORTER_GAINS','BONUS_PERSISTS_AFTER_SOURCE_LEAVES']}),
  card('25','Zimbabwean Honor Guard','WHEN_SET','CONTROLLER','ONE_OTHER_COPY_IN_CONTROLLER_HAND_OR_DECK','Optionally set one other copy at no cost, once per controller turn.',{cardinality:'ZERO_OR_ONE',useLimit:'ONCE_PER_TURN',forbidden:['OPPONENT_COPY_SELECTED','NON_COPY_SELECTED','CHAIN_SETS_MORE_THAN_ONE_EXTRA_COPY','REINFORCEMENT_CHARGED']}),
  card('26','UCPD','ACTIVATE','CONTROLLER','OPPONENT_HAND','Reveal the opponent’s hand to controller without revealing controller’s private hand to opponent.',{useLimit:'NO_PRINTED_LIMIT',forbidden:['WRONG_HAND_REVEALED','REVEAL_CHANGES_CARD_OWNERSHIP']}),
  card('27','Kazumi','ACTIVATE','CONTROLLER','TOP_THREE_AVAILABLE_CARDS_CONTROLLER_DECK','Draw exactly three cards, or all remaining cards if fewer than three.',{useLimit:'ONCE_PER_CARD',forbidden:['OPPONENT_DRAWS','MORE_THAN_THREE','EMPTY_DECK_CREATES_CARDS']}),
  card('28','2nd Polish-Lithuanian Army',['DECK_SET','PASSIVE'],'CONTROLLER','SOURCE_CARD_IN_CONTROLLER_DECK','May be set from deck subject to normal placement and Supporter-set limits; once per turn and twice per game.',{useLimit:'ONCE_PER_TURN_AND_TWICE_PER_GAME',forbidden:['THIRD_DECK_SET','SECOND_DECK_SET_SAME_TURN','SET_FROM_OPPONENT_DECK']}),
  card('29','Dylan Kirby','ACTIVATE','CONTROLLER','UP_TO_TWO_THIRD_GREAT_WAR_CARDS_IN_CONTROLLER_DECK_OR_DISCARD','Move selected cards to controller hand.',{cardinality:'ZERO_TO_TWO',useLimit:'ONCE_PER_CARD',forbidden:['WRONG_AFFILIATION_SELECTED','OPPONENT_PILE_SEARCHED','MORE_THAN_TWO']}),
  card('30','Santiago','ACTIVATE','CONTROLLER','ONE_OPPONENT_CARD_IN_SOURCE_ZONE_CONTESTED_ROW','Discard exactly one eligible opponent card.',{cardinality:'EXACTLY_ONE_IF_AVAILABLE',useLimit:'ONCE_PER_CARD',forbidden:['SAFE_ROW_TARGET','CONTROLLERS_CARD_TARGET','TARGET_OUTSIDE_ZONE','IMMUNE_TARGET']}),
  card('31','Oathbound Noble Fighter','WHEN_SET','SOURCE_EFFECT','ONE_EFFECT_MUTABLE_CARD_IN_SOURCE_ZONE','Selected card loses exactly 3 permanent Fate, clamped at zero.',{cardinality:'EXACTLY_ONE_IF_AVAILABLE',forbidden:['TARGET_OUTSIDE_ZONE','CANCEL_OR_CLOSE_APPLIES_TO_SOURCE_AUTOMATICALLY','MULTIPLE_TARGETS','FATE_BELOW_ZERO']}),
  card('32','Temecula Resident','WHEN_SET','CONTROLLER','TOP_AVAILABLE_CARD_CONTROLLER_DECK','Draw exactly one card if available.',{forbidden:['OPPONENT_DRAWS','MORE_THAN_ONE','EMPTY_DECK_CREATES_CARD']}),
  card('33','West Caribbea Infantry','WHEN_SET','CONTROLLER','NEXT_CHARACTER_ADDED_TO_CONTROLLER_HAND','The next Character added to controller hand costs exactly 1 less Reinforcement and gains exactly +2 permanent Fate; consume once.',{duration:'UNTIL_NEXT_ELIGIBLE_CHARACTER_ADDED',forbidden:['SUPPORTER_CONSUMES_STATUS','OPPONENT_CARD_BUFFED','MORE_THAN_ONE_CHARACTER_BUFFED']}),
  card('34','Rozsi Szocs','PASSIVE','CONTROLLER','CARD_MOVED_BY_EFFECT_INTO_SOURCE_ZONE','Each qualifying moved card gains exactly +3 permanent Fate once; setting is not movement.',{prerequisites:['MOVEMENT_EVENT','DESTINATION_ZONE_EQUALS_SOURCE_ZONE'],forbidden:['SET_CARD_TRIGGERS','CARD_MOVED_OUT_OF_ZONE_TRIGGERS','SAME_MOVE_TRIGGERS_TWICE']}),
  card('35','Alexander the Magnificient','PASSIVE','CONTROLLER','SOURCE_CARD','Source dynamic base equals the sum of current Fate of every Supporter controller controls in source zone, including effect-immune Supporters; normal external Fate modifiers still apply.',{forbidden:['SOURCE_PRINTED_BASE_FATE_ADDED_ON_TOP','IGNORES_EXTERNAL_FATE_MODIFIERS','OPPONENT_SUPPORTER_COUNTS','SUPPORTER_OUTSIDE_ZONE_COUNTS','IMMUNE_SUPPORTER_EXCLUDED']}),
  card('36','Marie L’amboure','PASSIVE','CONTROLLER','OPPONENT_CONSOLIDATION_IN_SOURCE_ZONE','After each qualifying opponent consolidation, apply exactly -4 to opponent zone total through the established zone modifier.',{forbidden:['CONTROLLERS_CONSOLIDATION_TRIGGERS','CONSOLIDATION_OUTSIDE_ZONE_TRIGGERS','SAME_CONSOLIDATION_TRIGGERS_TWICE']}),
  card('37','6th French Fusiliers',['WHEN_SET','PASSIVE'],'CONTROLLER','ONE_OTHER_SUPPORTER_WITH_ACTIVE_FIELD_PASSIVE','Copy the selected Supporter’s field passive only; do not execute a when-set effect.',{cardinality:'EXACTLY_ONE_IF_AVAILABLE',forbidden:['SOURCE_COPIES_ITSELF','CHARACTER_SELECTED','WHEN_SET_EFFECT_EXECUTED','COPIED_EFFECT_RECURSES']}),
  card('38','Jake','ACTIVATE','CONTROLLER','ONE_SUPPORTER_CONTROLLER_CONTROLS_ON_FIELD','Once per turn, discard selected controlled Supporter and give Jake exactly +4 permanent Fate if discard succeeds.',{useLimit:'ONCE_PER_TURN',forbidden:['OPPONENT_SUPPORTER_SELECTED','JAKE_GAINS_IF_DISCARD_BLOCKED','MORE_THAN_ONE_USE_PER_TURN']}),
  card('39','Juan Carlos','ACTIVATE','CONTROLLER','ONE_OPPONENT_CARD_THEN_OPEN_SQUARE_IN_SOURCE_ZONE','Move selected opponent card to chosen legal open square in Juan’s zone.',{cardinality:'EXACTLY_ONE_CARD_AND_ONE_DESTINATION',useLimit:'ONCE_PER_CARD',forbidden:['CONTROLLERS_CARD_SELECTED','DESTINATION_OUTSIDE_ZONE','OCCUPIED_DESTINATION','CARD_DUPLICATED_OR_LOST']}),
  card('40','Christopher Erbs','ACTIVATE','CONTROLLER','NEXT_CARD_CONTROLLER_DRAWS','Arm the next draw; that card gains exactly +6 permanent Fate, then consume the arm.',{useLimit:'TWO_USES_PER_CARD',duration:'UNTIL_NEXT_CONTROLLER_DRAW',forbidden:['ARMED_TWICE_SIMULTANEOUSLY','OPPONENT_DRAW_CONSUMES','MORE_THAN_PLUS_6','STATUS_NOT_CONSUMED']}),
  card('41','Jimmy','PASSIVE','CONTROLLER','SOURCE_CARD','Jimmy establishes a dynamic base of exactly +3 Fate times the number of distinct opponent-Fate-reduction card-effect uses performed by controller this game; normal external Fate modifiers still apply.',{forbidden:['COUNTS_RAW_FATE_POINTS_REDUCED','COUNTS_SAME_EFFECT_USE_MULTIPLE_TIMES','COUNTS_NON_EFFECT_OR_SELF_REDUCTION','IGNORES_EXTERNAL_FATE_MODIFIERS','DISPLAY_FATE_DIVERGES_FROM_SCORE_FATE']}),
  card('42','West German Soldier','WHEN_SET','CONTROLLER','CONTROLLER_DECK_THEN_CONTROLLER_HAND','Draw exactly two available cards, then require exactly two legal hand discards; resolution remains pending until selection completes.',{cardinality:'DRAW_TWO_THEN_DISCARD_TWO',forbidden:['DISCARD_BEFORE_DRAW_PRESENTATION','OPPONENT_HAND_USED','CLOSING_PICKER_AUTO_SELECTS','TURN_ENDS_WITH_PENDING_SELECTION']}),
  card('43','Mark Kemper','WHEN_SET','CONTROLLER','ONE_CHOSEN_AVAILABLE_SQUARE_IN_CONTROLLERS_EXTRA_ROW_IN_SOURCE_ZONE','Controller chooses one of the available positions in the current partial extra row; if none exists, choose one of three positions in a new row.',{cardinality:'EXACTLY_ONE_DESTINATION',forbidden:['AUTO_SELECTS_WITHOUT_PROMPT','FULL_ROW_ADDED_PER_MARK','SQUARE_OWNED_BY_OPPONENT','NEW_ROW_CREATED_WHILE_PARTIAL_ROW_OPEN']}),
  card('44','Soviet Grenadiers','PASSIVE','CONTROLLER','SOURCE_AND_ADJACENT_DAUNTLESS','While adjacent, source and each qualifying Dauntless gain exactly +3 effective Fate.',{forbidden:['NON_DAUNTLESS_QUALIFIES','NON_ADJACENT_CARD_GAINS','BONUS_PERSISTS_AFTER_ADJACENCY_ENDS']}),
  card('45','Chingachlook','PASSIVE','CONTROLLER','SOURCE_ZONE_AND_SOURCE_CARD_ID','Controller may control no other Character in source zone and may play only one Chingachlook copy.',{forbidden:['SECOND_CHARACTER_ALLOWED_IN_ZONE','SECOND_COPY_ALLOWED','OPPONENT_CHARACTERS_BLOCK_CONTROLLER']}),
  card('46','Phil','PASSIVE','CONTROLLER','SOURCE_CARD','At each controller Draw phase after the phase in which Phil was set, gain exactly +2 permanent Fate once.',{forbidden:['GAINS_ON_OPPONENT_DRAW_PHASE','GAINS_IMMEDIATELY_WHEN_SET','SAME_DRAW_PHASE_TICKS_TWICE']}),
  card('47','Great Oak Infantry','PASSIVE','CONTROLLER','CARD_CONSOLIDATED_USING_SOURCE_AS_REINFORCEMENT','The newly consolidated card gains exactly +3 permanent Fate once if this source was actually consumed.',{forbidden:['SOURCE_CARD_GAINS_INSTEAD','UNSELECTED_COPY_TRIGGERS','SAME_CONSOLIDATION_TRIGGERS_TWICE']}),
  card('48','Cosmic GF','ACTIVATE','CONTROLLER','ONE_EXPANDED_WORLDS_CARD_IN_DECK_THEN_ONE_NON_STAR_EXPANDED_WORLDS_CARD_IN_DISCARD','Move the first selected deck card and then the second selected discard card to controller hand, independently skipping unavailable steps.',{useLimit:'ONCE_PER_CARD',forbidden:['DISCARD_STAR_SELECTED','WRONG_AFFILIATION','OPPONENT_PILES_SEARCHED']}),
  card('49','Irvine Businessman','PASSIVE','CONTROLLER','CHARACTERS_IN_SOURCE_ZONE','Controller’s Characters in source zone may be used for consolidation and contribute exactly 1 Reinforcement each.',{forbidden:['OPPONENT_CHARACTER_USABLE','CHARACTER_OUTSIDE_ZONE_USABLE','CONTRIBUTES_MORE_THAN_1']}),
  card('50','Berkeley CS Major','WHEN_SET','CONTROLLER','ONE_DECLARED_ZONE_ON_OPPONENT_NEXT_TURN','During opponent’s next turn only, prohibit setting, consolidating, and activating effects in selected zone.',{cardinality:'EXACTLY_ONE_ZONE',duration:'OPPONENT_NEXT_TURN_ONLY',forbidden:['CONTROLLERS_TURN_BLOCKED','OTHER_ZONES_BLOCKED','LOCK_PERSISTS_EXTRA_TURN','ONE_ACTION_KIND_REMAINS_ALLOWED']}),
  card('51','Rivera','WHEN_SET','CONTROLLER','CHARACTERS_CONTROLLER_SETS_WITH_DECLARED_AFFILIATION','Declare one affiliation; during controller’s next three turns including changed affiliations, each matching Character set gains exactly +4 permanent Fate.',{duration:'THREE_CONTROLLER_TURNS',forbidden:['OPPONENT_CARD_GAINS','NON_CHARACTER_GAINS','FOURTH_TURN_GAINS','DECLARATION_DEFAULTS_ON_CANCEL']}),
  card('52','The Vigilantes','WHEN_SET','CONTROLLER','ONE_OPPONENT_CARD_IN_SOURCE_ZONE','Mark selected opponent card; when that exact card leaves field, discard exactly one deterministic-random card from opponent hand.',{forbidden:['OTHER_CARD_LEAVING_TRIGGERS','CONTROLLER_HAND_DISCARDED','MARK_TRIGGERS_TWICE','EMPTY_HAND_CREATES_DISCARD']}),
  card('53','Colombo Thug','PASSIVE','CONTROLLER','OPPONENT_CONSOLIDATIONS_IN_SOURCE_ZONE','Opponent consolidations into this zone may use reinforcement only from this zone.',{forbidden:['CONTROLLERS_CONSOLIDATION_RESTRICTED','OTHER_ZONE_DESTINATION_RESTRICTED','OUTSIDE_ZONE_TRIBUTE_ACCEPTED']}),
  card('54','Wolf Creek Light Infantry','WHEN_SET','CONTROLLER','ONE_CARD_CONTROLLER_CONTROLS_IN_SOURCE_ZONE_THEN_LEGAL_OWN_SIDE_DESTINATION_OR_SWAP','Move selected controlled card to any open own-side square, or swap with a controlled field card when allowed.',{forbidden:['OPPONENT_CARD_SELECTED','SOURCE_ZONE_TARGET_REQUIREMENT_IGNORED','OPPONENT_SIDE_OPEN_DESTINATION','MOVE_DUPLICATES_OR_LOSES_CARD']}),
  card('55','Bobby Jones','PASSIVE','CONTROLLER','SOURCE_CARD','Gain exactly +5 effective Fate only if at least three other cards controller controls in source zone all share one affiliation.',{prerequisites:['AT_LEAST_THREE_OTHER_CONTROLLED_CARDS','ALL_OTHER_CONTROLLED_CARDS_IN_ZONE_SHARE_AFFILIATION'],forbidden:['SOURCE_COUNTS_TOWARD_THREE','MIXED_AFFILIATIONS_QUALIFY','OPPONENT_CARDS_COUNT']}),
  card('56','Lydia','REACTION','CONTROLLER','OPPONENT_EFFECT_ACTIVATION','Up to three times per card, controller may negate that resolution and permanently suppress its source; decline changes nothing.',{useLimit:'THREE_REACTIONS_PER_CARD',forbidden:['REACTS_TO_CONTROLLERS_EFFECT','DECLINE_CONSUMES_USE','NEGATED_EFFECT_MUTATES_STATE','SOURCE_NOT_SUPPRESSED_AFTER_LYDIA','FOURTH_REACTION']}),
  card('57','Jeremiah Jones','PASSIVE','CONTROLLER','COORDINATOR_ZONE_AURAS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Increase each qualifying numeric zone aura’s potency by exactly +1, not the card’s own Fate directly.',{forbidden:['NON_COORDINATOR_AURA_AMPLIFIED','OPPONENT_AURA_AMPLIFIED','CARD_OUTSIDE_ZONE_AMPLIFIED','RECURSIVE_AMPLIFICATION']}),
  card('58','Crossroads Worker','WHEN_SET','CONTROLLER','ONE_SUPPORTER_IN_CONTROLLER_DISCARD','Move selected Supporter to controller hand; with no eligible Supporter, skip without activation cinematic or modal.',{cardinality:'EXACTLY_ONE_IF_AVAILABLE',forbidden:['EMPTY_DISCARD_OPENS_EFFECT_CINEMATIC','NON_SUPPORTER_SELECTED','OPPONENT_DISCARD_SEARCHED']}),
  card('59','Czechoslovak Maroon Knights','PASSIVE','CONTROLLER','SUPPORTERS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each qualifying Supporter gains exactly +1 effective Fate.',{forbidden:['NON_SUPPORTER_GAINS','OPPONENT_SUPPORTER_GAINS','OUTSIDE_ZONE_GAINS']}),
  card('60','IB Student','WHEN_SET','CONTROLLER','ONE_SUPPORTER_IN_CONTROLLER_DECK','Move selected Supporter to controller hand; with no eligible Supporter, skip cleanly.',{forbidden:['NON_SUPPORTER_SELECTED','OPPONENT_DECK_SEARCHED','EMPTY_SEARCH_OPENS_MODAL']}),
  card('61','Maria Song','WHEN_SET','CONTROLLER','ONE_REVEALED_CHARACTER_NAME_FROM_OPPONENT_HAND','Reveal opponent Characters; chosen card identity causes every copy in opponent hand, deck, and field to lose exactly 7 permanent Fate, clamped at zero.',{forbidden:['NON_CHARACTER_SELECTED','CONTROLLERS_COPIES_LOSE','DISCARD_COPIES_LOSE_IF_TEXT_EXCLUDES_DISCARD','SAME_COPY_MUTATED_TWICE']}),
  card('62','Berkeley Homeless',['WHEN_SET','PASSIVE'],'CONTROLLER_THEN_OPPONENT','SOURCE_CARD_AND_OPPONENT_OWNED_OPEN_DESTINATION','Optionally move source to an opponent-owned open square; neither player may use it for consolidation; opponent must discard exactly two hand cards to discard it.',{forbidden:['CONTROLLER_OWNED_DESTINATION','CONTESTED_DESTINATION','USED_AS_REINFORCEMENT','OPPONENT_DISCARDS_SOURCE_WITHOUT_TWO_CARD_COST']}),
  card('63','Greek Hoplite','PASSIVE','CONTROLLER','SOURCE_CARD','Gain exactly +2 effective Fate for each copy of Greek Hoplite controller controls in source zone, including itself as established singleplayer does.',{forbidden:['OPPONENT_COPY_COUNTS','COPY_OUTSIDE_ZONE_COUNTS','BONUS_BECOMES_PERMANENT']}),
  card('64','Cook Islands Duelist','PASSIVE','CONTROLLER','ONE_DETERMINISTIC_RANDOM_ADJACENT_OPPONENT_CARD_AND_SOURCE','While active with eligible target, one adjacent opponent card loses exactly 3 effective Fate and source gains exactly 3 effective Fate.',{forbidden:['CONTROLLERS_ADJACENT_CARD_LOSES','NON_ADJACENT_CARD_LOSES','MULTIPLE_TARGETS_LOSE','RERENDER_REROLLS_TARGET']}),
  card('65','1st West Caribbea Marines','WHEN_SET','CONTROLLER','SOURCE_CARD','Can only be set in contested row; when set, set its permanent Fate to exactly 4 rather than adding 4.',{forbidden:['SAFE_ROW_PLACEMENT','RESULT_FATE_BASE_PLUS_4','REPEATED_RENDER_RESETS_FATE']}),
  card('66','Mark Menz','WHEN_SET','CONTROLLER','ANY_NUMBER_OF_EFFECT_MUTABLE_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Declare affiliation; change every eligible controlled card in zone to it, and give source exactly +1 permanent Fate per card whose affiliation actually changed.',{forbidden:['OPPONENT_CARD_CHANGED','CARD_OUTSIDE_ZONE_CHANGED','ALREADY_MATCHING_CARD_COUNTS_AS_CHANGED','IMMUTABLE_CARD_CHANGED']}),
  card('67','Mr. Secules','REACTION','CONTROLLER','OPPONENT_CHARACTER_INITIATOR_OR_SUPPORTER_WHEN_SET_EFFECT','Once per card, negate one qualifying opponent effect.',{useLimit:'ONCE_PER_CARD',forbidden:['CONTROLLERS_EFFECT_NEGATED','NONQUALIFYING_EFFECT_REACTION','DECLINE_CONSUMES_USE','NEGATED_EFFECT_MUTATES']}),
  card('68','Great Oak High Schooler','WHEN_SET','CONTROLLER','ONE_NON_STAR_COORDINATOR_IN_CONTROLLER_DECK','Move selected eligible Coordinator to controller hand.',{forbidden:['STAR_CARD_SELECTED','NON_COORDINATOR_SELECTED','OPPONENT_DECK_SEARCHED']}),
  card('69','Breakfast Republic Busser','WHEN_SET','CONTROLLER','ONE_CARD_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','For controller’s next three turns, selected card may move once per turn to a zone at most one zone away.',{duration:'THREE_CONTROLLER_TURNS',forbidden:['OPPONENT_CARD_SELECTED','MOVE_MORE_THAN_ONE_ZONE','SECOND_MOVE_SAME_TURN','FOURTH_TURN_MOVE']}),
  card('70','Wine Country Guerilla','PASSIVE','CONTROLLER','SOURCE_CARD_THEN_OPPONENT_HAND_RANDOM_CARD','When discarded by any method, optionally move source to opponent hand for five opponent turns; at each start reduce one deterministic-random card there by exactly 2 permanent Fate, then return source to original owner discard after five uses.',{duration:'FIVE_EFFECT_USES',forbidden:['SOURCE_CAN_BE_SET_FROM_HOST_HAND','SOURCE_TARGETABLE_IN_HOST_HAND','CONTROLLERS_HAND_DAMAGED','MORE_OR_FEWER_THAN_FIVE_TICKS']}),
  card('71','Fort Calvin Watcher','WHEN_SET','CONTROLLER','OPPONENT_NEXT_THREE_DRAW_PHASE_DRAWS','Reveal exactly the next three eligible Draw-phase cards; send the first revealed Character among them to deck bottom, then expire after third eligible draw.',{duration:'THREE_ELIGIBLE_DRAW_PHASE_DRAWS',forbidden:['EFFECT_DRAW_COUNTS','MORE_THAN_ONE_CHARACTER_BOTTOMED','FOURTH_DRAW_REVEALED','CARD_SENT_TO_WRONG_DECK']}),
  card('72','Robo en la Noche','WHEN_SET','CONTROLLER','ONE_DETERMINISTIC_RANDOM_CARD_FROM_OPPONENT_HAND','Move random card to controller hand; after it is set and later leaves field, send it to original owner discard.',{forbidden:['CONTROLLERS_HAND_STOLEN','CARD_RETURNS_BEFORE_LEAVING_FIELD','CARD_SENT_TO_THIEFS_DISCARD','OWNERSHIP_METADATA_LOST']}),
  card('73','ALPINE Expeditionary',['WHEN_SET','ACTIVATE'],'CONTROLLER','CONTROLLERS_INITIATORS_AND_IMPROVISORS_IN_SOURCE_ZONE_THEN_SOURCE','Discard every qualifying controlled card in zone; source gains permanent Fate equal to their pre-discard current Fate total, then may move once per turn to any open own-side square.',{forbidden:['SUPPORTER_OR_COORDINATOR_DISCARDED','OPPONENT_CARD_DISCARDED','FATE_TOTAL_RECOMPUTED_AFTER_DISCARD','SECOND_MOVE_SAME_TURN']}),
  card('74','Selva Islands Pirate','HAND_ARRIVAL','CONTROLLER','CONTROLLER_SUPPORTER_SET_LIMIT_THIS_TURN','Whenever source is drawn or otherwise added to controller hand, grant exactly one extra Supporter set for that turn.',{duration:'CURRENT_TURN_ONLY',forbidden:['OPENING_SETUP_DOUBLE_TRIGGERS','OPPONENT_GETS_EXTRA_SET','BONUS_PERSISTS_NEXT_TURN']}),
  card('75','The Ledger-keepers','WHEN_SET','CONTROLLER','ONE_SUPPORTER_ON_FIELD_WITH_WHEN_SET_EFFECT','Copy and immediately execute selected Supporter when-set effect with Ledger-keepers as source/controller.',{forbidden:['CHARACTER_SELECTED','PASSIVE_ONLY_SUPPORTER_SELECTED','COPIED_EFFECT_USES_ORIGINAL_CONTROLLER','RECURSIVE_COPY_LOOP']}),
  card('76','ALPINE Infantry',['WHEN_SET','PASSIVE'],'CONTROLLER','SOURCE_CARD','On set gain exactly +4 permanent Fate; source cannot count for bonuses, is effect-immutable, and cannot be used for consolidation.',{forbidden:['OTHER_EFFECT_MUTATES_SOURCE','SOURCE_COUNTS_FOR_ANY_CONDITION_OR_AURA','SOURCE_USED_AS_REINFORCEMENT','OWN_INTRINSIC_PLUS_4_BLOCKED']}),
  card('77','Duncan Heyward',['WHEN_SET','PASSIVE'],'CONTROLLER','CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE_WITH_DECLARED_AFFILIATION','Declare one affiliation; each matching controlled card in zone gains exactly +4 effective Fate while source active.',{forbidden:['OPPONENT_CARD_GAINS','CARD_OUTSIDE_ZONE_GAINS','NONMATCHING_CARD_GAINS','CANCEL_DEFAULTS_DECLARATION']}),
  card('78','Chaparral Hoplite','WHEN_SET','CONTROLLER','NEXT_CONTROLLER_CONSOLIDATION_IN_SOURCE_ZONE','Grant the next consolidation in source zone permission to set the new card face down; consume once. Controller may flip it face up during own turn, then its effect resolves once.',{duration:'UNTIL_NEXT_QUALIFYING_CONSOLIDATION',forbidden:['CONSOLIDATION_OUTSIDE_ZONE_CONSUMES','OPPONENT_CONSOLIDATION_CONSUMES','FACE_DOWN_CARD_EFFECT_TRIGGERS_EARLY','PICKER_STYLE_DIFFERS_FROM_SINGLEPLAYER']}),
  card('79','Havano Citizen','REACTION','CONTROLLER','OPPONENT_EFFECT_TARGETING_CONTROLLER_OR_CONTROLLERS_CARD','While in controller hand, may negate or suppress the targeting effect, then set Havano from hand at no cost to a legal destination.',{forbidden:['REACTS_TO_UNTARGETED_EFFECT','REACTS_TO_CONTROLLERS_EFFECT','NEGATED_EFFECT_MUTATES','HAVANO_REMAINS_IN_HAND_AFTER_ACCEPTED_REACTION']}),
  card('80','Apparition of Berkeley','WHEN_SET','CONTROLLER','ONE_CHARACTER_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Optionally discard selected controlled Character; only if discard succeeds, draw exactly two cards.',{forbidden:['OPPONENT_CHARACTER_SELECTED','NON_CHARACTER_SELECTED','DRAW_OCCURS_IF_DISCARD_BLOCKED_OR_CANCELLED','TARGET_OUTSIDE_ZONE']}),
  card('81','Wojciech','WHEN_SET','CONTROLLER','CONTROLLER_HAND','Create one Pierogi Counter per card opponent set or consolidated last turn. Counters last six controller hand turns, are protected in hand, can be placed only in contested/opponent-owned squares, and remain three opponent turns.',{forbidden:['COUNTS_CONTROLLERS_LAST_TURN_PLACEMENTS','COUNTER_SET_IN_CONTROLLER_SAFE_ROW','COUNTER_DISCARDED_BY_OPPONENT_EFFECT','WRONG_EXPIRY_CLOCK']}),
  card('82','Felicyta Janowicz (Youth)','WHEN_SET','CONTROLLER','ONE_OF_TWENTY_LANDSCAPES','Change current landscape to chosen valid landscape, unless a landscape-change lock prohibits controller.',{cardinality:'EXACTLY_ONE',forbidden:['INVALID_LANDSCAPE','CHANGE_IGNORES_LOCK','CANCEL_CHANGES_TO_DEFAULT','OLD_LANDSCAPE_STATUS_PERSISTS']}),
  card('83','Sebastyen Janowicz','ACTIVATE','CONTROLLER','ALL_EFFECT_MUTABLE_FACE_UP_CHARACTERS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each qualifying Character gains exactly +2 permanent Fate once.',{useLimit:'ONCE_PER_CARD',forbidden:['SUPPORTER_GAINS','FACE_DOWN_CARD_GAINS','OPPONENT_CHARACTER_GAINS','CARD_OUTSIDE_ZONE_GAINS']}),
  card('84','Květka Svoboda','WHEN_SET','CONTROLLER','ONE_EXPANDED_WORLDS_CHARACTER_OTHER_THAN_SOURCE_ID_IN_CONTROLLER_DECK','Move selected eligible card from deck and set it at no cost; its own placement effect resolves normally.',{forbidden:['COPY_OF_SOURCE_SELECTED','NON_CHARACTER_SELECTED','WRONG_AFFILIATION','OPPONENT_DECK_SEARCHED','FREE_SET_EFFECT_SKIPPED']}),
  card('85','Felicyta Janowicz (Specters)','PASSIVE','CONTROLLER','SOURCE_CARD','Gain exactly +1 effective Fate per Supporter opponent has set this game.',{forbidden:['CONTROLLERS_SUPPORTERS_COUNT','CONSOLIDATED_SUPPORTER_COUNTS_AS_SET_TWICE','VALUE_CHANGES_WITHOUT_COUNTER_EVENT']}),
  card('86','Boleslaw Kopewicz','PASSIVE','CONTROLLER','SOURCE_AND_CONTROLLER_DECK','Whenever opponent completes a card search, controller draws exactly one and source gains exactly +2 permanent Fate once.',{forbidden:['CONTROLLERS_SEARCH_TRIGGERS','NONSEARCH_DRAW_TRIGGERS','SAME_SEARCH_TRIGGERS_TWICE','OPPONENT_DRAWS_BONUS_CARD']}),
  card('87','Květka Svoboda (Ukulele)','WHEN_SET','CONTROLLER','NEXT_CONTROLLER_CONSOLIDATIONS_UNTIL_CONTROLLER_SETS_SUPPORTER','Starting now, each qualifying consolidation card gains exactly +3 permanent Fate; status ends immediately when controller sets a Supporter.',{duration:'UNTIL_CONTROLLER_SETS_SUPPORTER',forbidden:['SOURCE_SELF_QUALIFIES_AS_PRIOR_SUPPORTER_EVENT','OPPONENT_CONSOLIDATION_GAINS','BONUS_PERSISTS_AFTER_SUPPORTER_SET','SAME_CONSOLIDATION_GAINS_TWICE']}),
  card('88','Rozsi Szocs (Youth)','PASSIVE','CONTROLLER','SOURCE_CARD','Gain exactly +2 effective Fate for every Character controller controls anywhere on field, excluding effect-immutable cards that cannot count for bonuses; include source if source is a Character.',{forbidden:['OPPONENT_CHARACTER_COUNTS','SUPPORTER_COUNTS','EFFECT_IMMUTABLE_CARD_COUNTS','ONLY_SOURCE_ZONE_COUNTED']}),
  card('89','Zsofia Szocs (Youth)','PASSIVE','CONTROLLER','SOURCE_CARD','Gain exactly +7 effective Fate while controller has activated fewer than 10 Supporter effects this game; lose bonus at count 10.',{forbidden:['OPPONENT_EFFECT_COUNT_USED','TEN_STILL_QUALIFIES','PLACEMENT_WITH_SKIPPED_EFFECT_COUNTS_AS_ACTIVATION']}),
  card('90','Wojciech (Fisherman)','WHEN_SET','CONTROLLER','TWO_DETERMINISTIC_RANDOM_MATCHING_AFFILIATION_CARDS_IN_CONTROLLER_DECK','After declaration, move up to two matching random cards to controller hand and give each exactly +3 permanent Fate.',{cardinality:'UP_TO_TWO_AVAILABLE',forbidden:['NONMATCHING_CARD_SELECTED','OPPONENT_DECK_USED','MORE_THAN_TWO','RERENDER_REROLLS_SELECTION']}),
  card('91','Wodny Potok Villager','WHEN_SET','CONTROLLER','OPPONENT_LANDSCAPE_CHANGE_ACTIONS','For the next five turns, prevent opponent from changing landscape; at most two activations per game.',{duration:'FIVE_TURNS_AS_SINGLEPLAYER_CLOCK','useLimit':'TWO_USES_PER_GAME',forbidden:['CONTROLLER_BLOCKED','SIXTH_TURN_BLOCKED','THIRD_USE']}),
  card('92','Wodny Potok Lumberjack','PASSIVE','CONTROLLER','SUPPORTERS_CONTROLLER_SETS_IN_SOURCE_ZONE','Each qualifying Supporter has its set effect negated/suppressed and gains exactly +1 Reinforcement; no unresolved frame may remain.',{forbidden:['OPPONENT_SUPPORTER_AFFECTED','CARD_OUTSIDE_ZONE_AFFECTED','BLOCKED_EFFECT_FRAME_REMAINS_PENDING','SUPPORTER_EFFECT_RESOLVES_ANYWAY']}),
  card('93','Wodny Potok Youth','ACTIVATE','CONTROLLER','ONE_EFFECT_MUTABLE_OPPONENT_CARD_ANYWHERE_ON_FIELD','Once per turn, selected opponent card loses exactly 1 permanent Fate, clamped at zero.',{useLimit:'ONCE_PER_TURN',forbidden:['CONTROLLERS_CARD_SELECTABLE','SECOND_USE_SAME_TURN','MORE_THAN_MINUS_1','TARGET_IMMUNITY_IGNORED']}),
  card('94','Wodny Potok Mailman','WHEN_SET','CONTROLLER','ONE_TRIANGLE_CARD_IN_CONTROLLER_DECK','Schedule selected Triangle card; add it to controller hand after exactly four controller turns if still valid.',{duration:'FOUR_CONTROLLER_TURNS',forbidden:['NON_TRIANGLE_SELECTED','OPPONENT_DECK_SEARCHED','DELIVERED_EARLY_OR_LATE','DUPLICATE_DELIVERY']}),
  card('95','Carpathian Specter','PASSIVE','CONTROLLER','SOURCE_CARD','For each two turns source remains continuously on field, gain exactly +1 permanent Fate, at most six times.',{useLimit:'SIX_TICKS_MAXIMUM',forbidden:['TICKS_EVERY_TURN','TICKS_OFF_FIELD','SEVENTH_TICK','SAME_BOUNDARY_TICKS_TWICE']}),
  card('96','Wodny Potok Snow Shoveler','WHEN_SET','CONTROLLER','UP_TO_FOUR_DETERMINISTIC_RANDOM_NON_STAR_CARDS_IN_CONTROLLER_DISCARD','Return up to four eligible random cards from controller discard to controller deck.',{cardinality:'UP_TO_FOUR_AVAILABLE',forbidden:['STAR_RETURNED','OPPONENT_DISCARD_USED','MORE_THAN_FOUR','RERENDER_REROLLS_SELECTION']}),
  card('97','Visegrad Politician','WHEN_SET','CONTROLLER','OPPONENT_NEXT_TWO_CONSOLIDATIONS','Increase reinforcement cost of each of opponent’s next two consolidations by exactly 1, then expire.',{duration:'TWO_OPPONENT_CONSOLIDATIONS',forbidden:['CONTROLLERS_CONSOLIDATION_TAXED','SET_CARD_CONSUMES','THIRD_CONSOLIDATION_TAXED','COST_INCREASE_MORE_THAN_1']}),
  card('98','Wodny Potok Skier','OPENING_HAND','CONTROLLER','CONTROLLER_OPENING_HAND','Always appears as one additional opening-hand card without replacing a normal opening card; only existing deck copy moves.',{forbidden:['NORMAL_OPENING_HAND_SIZE_REDUCED','CARD_DUPLICATED','OPPONENT_RECEIVES_CARD','TRIGGERS_ON_LATER_DRAW']}),
  card('99','Rozsi and Zsofia (Youth)',['WHEN_SET','PASSIVE'],'CONTROLLER','CONTROLLER_SUPPORTERS_AND_SOURCE_CONSOLIDATION_RULE','For controller’s next five turns, Supporters are classified as Characters; source has zero cost if controller already controls another Rozsi or Zsofia, and source uses Characters for reinforcement.',{duration:'FIVE_CONTROLLER_TURNS',forbidden:['OPPONENT_SUPPORTERS_RECLASSIFIED','SIXTH_TURN_RECLASSIFIED','SOURCE_QUALIFIES_ITSELF_FOR_ZERO_COST','SUPPORTERS_USED_FOR_SOURCE_CONSOLIDATION']}),
  card('bh01','Anička Konvička (Voyager)',['ACTIVATE','PASSIVE'],'CONTROLLER','SOURCE_AND_ONE_OPEN_SQUARE_ANY_ZONE','Once per turn move source to any open square, then controller draws exactly one; source is immune to all effects.',{useLimit:'ONCE_PER_TURN',forbidden:['OCCUPIED_DESTINATION','MOVE_WITHOUT_DRAW','SECOND_MOVE_SAME_TURN','OPPONENT_EFFECT_MUTATES_SOURCE']}),
  card('bh02','Joie','PASSIVE','CONTROLLER','ALL_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each time controller activates a draw effect, every controlled card in Joie’s zone gains exactly +1 permanent Fate once.',{forbidden:['DRAW_PHASE_TRIGGERS','OPPONENT_DRAW_EFFECT_TRIGGERS','CARD_OUTSIDE_ZONE_GAINS','SAME_DRAW_EFFECT_TRIGGERS_TWICE']}),
  card('bh03','Ali, The Indomitable',['HAND_ARRIVAL','PASSIVE'],'ORIGINAL_OWNER','SOURCE_IN_OPPONENT_HAND','When source appears in original owner hand, transfer it to opponent hand; there it is effect-immune and caps that hand at six until set, then loses immunity.',{forbidden:['SOURCE_REMAINS_IN_ORIGINAL_HAND','WRONG_HAND_CAPPED','CAP_EXCEEDS_SIX','IMMUNITY_REMAINS_AFTER_SET']}),
  card('bh04','Anicka Konvicka (Selva Island)','WHEN_SET','CONTROLLER','ALL_EFFECT_MUTABLE_OPPONENT_CARDS_OF_DECLARED_TYPE_IN_SOURCE_ZONE','Split exactly 20 permanent Fate loss evenly using established integer distribution among eligible opponent cards of declared type.',{forbidden:['CONTROLLERS_CARDS_LOSE','WRONG_TYPE_OR_ZONE_LOSES','TOTAL_LOSS_EXCEEDS_AVAILABLE_FATE_OR_20','DISTRIBUTION_REROLLS_ON_RENDER']}),
  card('bh05','Taylor',['HAND_ARRIVAL','WHEN_SET'],'CONTROLLER','SECOND_COPY_THEN_ONE_COPYABLE_CARD_IN_CONTROLLER_HAND_OR_DECK','On draw/search arrival create exactly one additional Taylor copy as established; when set, copy and execute one eligible card effect using Taylor/controller context.',{forbidden:['RECURSIVE_TAYLOR_COPY','ARRIVAL_EVENT_CREATES_MORE_THAN_ONE_COPY','OPPONENT_PILE_SELECTED','COPIED_EFFECT_RUNS_TWICE']}),
  card('bh06','Achille Laurent','WHEN_SET','CONTROLLER','CONTROLLER_HAND','Cannot activate before turn 6; when legally set, add exactly three Adaptive Tactics tokens. Each token has 2 Fate, no set limit, and requires explicit type, placement type, affiliation, and rarity declarations.',{prerequisites:['TURN_AT_LEAST_6'],forbidden:['PRE_TURN_6_EFFECT','MORE_OR_FEWER_THAN_THREE_TOKENS','TOKEN_USES_DEFAULT_DECLARATIONS_WITHOUT_CHOICE','TOKEN_COUNTS_TOWARD_SET_LIMIT']}),
  card('bh07','Agent-K','PASSIVE','CONTROLLER','ALL_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','For each Dauntless adjacent to Agent-K, every controlled card in source zone gains exactly +2 effective Fate; stack linearly.',{forbidden:['AGENT_K_COUNTS_AS_ADJACENT_TO_ITSELF','NON_DAUNTLESS_COUNTS','OPPONENT_CARD_GAINS','BONUS_MULTIPLIES_NONLINEARLY']}),
  card('bh08','Maja Kaminska (University)','PASSIVE','CONTROLLER','ALL_CARDS_CONTROLLER_CONTROLS_IN_SOURCE_ZONE','Each time controller actually negates or suppresses an effect, every controlled card in source zone gains exactly +2 permanent Fate once.',{forbidden:['DECLINED_REACTION_TRIGGERS','OPPONENT_REACTION_TRIGGERS','CARD_OUTSIDE_ZONE_GAINS','SAME_REACTION_TRIGGERS_TWICE']}),
  card('bh09','Alondra Hopkins (Mercenary)','WHEN_SET','CONTROLLER','SOURCE_CARD_AND_ONE_SELECTED_ZONE','Select any zone; source gains permanent Fate equal to the non-negative difference between controller total Fate and opponent total Fate in that zone.',{forbidden:['ZONE_SELECTED_BY_OPPONENT','WRONG_ZONE_SCORED','NEGATIVE_DIFFERENCE_REDUCES_SOURCE','DIFFERENCE_APPLIED_MORE_THAN_ONCE']}),
  card('bh10','Francisek','WHEN_SET','CONTROLLER','ALL_EFFECT_MUTABLE_CARDS_IN_CONTROLLER_HAND','Discard every eligible card in controller hand, then activate one draw effect for exactly the number actually removed.',{forbidden:['OPPONENT_HAND_DISCARDED','IMMUNE_HAND_CARD_DISCARDED','DRAW_COUNT_EXCEEDS_DISCARDED_COUNT','REDRAW_ACTIVATES_MORE_THAN_ONCE']}),
  card('bh25','Jimmy (Viltrumite)','WHEN_SET','CONTROLLER','ONE_EFFECT_MUTABLE_CARD_ANYWHERE_ON_FIELD','Discard exactly one selected eligible card on either side of the field.',{cardinality:'EXACTLY_ONE_IF_AVAILABLE',forbidden:['IMMUNE_OR_UNAFFORDABLE_PROTECTED_TARGET','MORE_THAN_ONE_CARD_DISCARDED','CANCEL_DISCARDS_DEFAULT_TARGET']})
];

function landscape(id, name, timing, beneficiary, resolution, forbidden = []){
  return freeze({kind:'LANDSCAPE',id,name,reviewed:true,authority:'PRINTED_TEXT_AND_SINGLEPLAYER',timing:list(timing),beneficiary,resolution,forbidden:list([...forbidden, ...GLOBAL_FORBIDDEN]),presentation:GLOBAL_PRESENTATION_ORDER});
}

const LANDSCAPE_RULES = [
  landscape('igb1','Pacifica: Peaceful Seas','NONE','NEITHER_PLAYER','No gameplay effect.'),
  landscape('igb2','ALPINE Headquarters: The Frontier of Innovation','END_OF_TURN_14','PLAYER_WITH_MORE_CONSOLIDATIONS','Winner chooses one zone and gains exactly 12 zone Fate; tie grants neither.', ['WRONG_PLAYER_CHOSES','RESOLVES_BEFORE_TURN_14','TIE_GRANTS_BONUS']),
  landscape('igb3','The Soviet Invasion of Anchorage, 2052',['SETUP','BEFORE_TURN_10_CONSOLIDATION'],'BOTH_PLAYERS','Select one deterministic-random zone at setup; cards consolidated there before turn 10 gain exactly +4 permanent Fate.', ['WRONG_ZONE_GAINS','TURN_10_OR_LATER_GAINS','SET_CARD_GAINS']),
  landscape('igb4','Zion Canyon: Memories of a Fading Twilight','CONTINUOUS','NEITHER_PLAYER','Cards in discard cannot be recovered by either player.', ['ONE_PLAYER_CAN_RECOVER','SEARCH_MODAL_OFFERS_DISCARD_TARGET']),
  landscape('igb5','A Quaint Polish River: Flowing Currents','CARD_SET','CURRENT_TOTAL_FATE_LEADER','Cards set by the player who had more total Fate immediately before the set gain exactly +2 permanent Fate; tie grants no bonus.', ['LOSING_PLAYER_GAINS','TIE_GAINS','SAME_SET_GAINS_TWICE']),
  landscape('igb6','Great Oak Highschool: Home of the Wolfpack','CONTINUOUS','BOTH_PLAYERS','Every Reality card gains exactly +3 effective Fate.', ['NON_REALITY_GAINS','BONUS_BECOMES_PERMANENT']),
  landscape('igb7','Panacea: The Founding of Pacifica','CONTINUOUS','BOTH_PLAYERS','Each Eventide card may move once per its controller turn.', ['NON_EVENTIDE_MOVES','SECOND_MOVE_SAME_TURN']),
  landscape('igb8','The Invasion of Qingdao, 2033',['SETUP','END_OF_TURN_10'],'ZONE_FATE_WINNER','Select one deterministic-random scoring zone; at turn 10 its Fate leader chooses a zone and gains one full safe row; tie grants neither.', ['WRONG_PLAYER_GAINS_ROW','ROW_OWNER_DEPENDS_ON_VIEWER','RESOLVES_WRONG_TURN']),
  landscape('igb9','Californian Sunsets: West Coast Dreaming','OUTSIDE_DRAW_PHASE_CARD_DRAWN','DRAWING_PLAYER','After each qualifying draw, drawing player may select any mutable field card to gain exactly +3 permanent Fate.', ['DRAW_PHASE_TRIGGERS','OPPONENT_CHOSES','EMPTY_TARGET_LEAVES_PENDING_PROMPT']),
  landscape('igb10','The 5th United Nations Army at Bremen, 2052','CONTINUOUS','BOTH_PLAYERS','Each Third Great War Supporter contributes exactly +1 additional Reinforcement.', ['WRONG_AFFILIATION_OR_TYPE_GAINS']),
  landscape('igb11','University of California, Berkeley: Sather Gate','CONTINUOUS','BOTH_PLAYERS','Every Initiator gains exactly +3 effective Fate.', ['NON_INITIATOR_GAINS','BONUS_BECOMES_PERMANENT']),
  landscape('igb12','Port Janswick: Vault of the Ledger Keepers','CONTINUOUS','BOTH_PLAYERS','Both hands are mutually revealed for the match.', ['ONLY_ONE_HAND_REVEALED','HAND_CONTENT_DIFFERS_BETWEEN_AUTHORIZED_VIEWS']),
  landscape('igb13','Big Sur: The Great American Plague, 2041','DRAW_PHASE','ACTIVE_PLAYER','Skip each player’s Draw phase every other one of that player’s turns using the established parity.', ['SKIPS_EFFECT_DRAWS','ONE_PLAYER_PARITY_USED_FOR_BOTH']),
  landscape('igb14','46352 Lone Pine Drive: Envoy of Chaos','TURN_TIMER','BOTH_PLAYERS','Set each turn timer to exactly 30 seconds.', ['CLIENTS_USE_DIFFERENT_LIMIT','TEST_SPEED_FLAG_CHANGES_PRODUCTION_LIMIT']),
  landscape('igb15','Snow on the Carpathians','SUPPORTER_EFFECT_ACTIVATION','BOTH_PLAYERS','Each player may activate at most one Supporter effect per turn; blocked/skipped effects cannot leave unresolved frames.', ['ONE_PLAYERS_USE_BLOCKS_OTHER','COUNT_NOT_RESET_ON_TURN','BLOCKED_EFFECT_PREVENTS_TURN_END']),
  landscape('igb16','Santa Anna: Prosperity of a Treasure Port','ACTIVE_PLAYER_ACTION','ACTING_PLAYER','During own turn, discard one hand card to give one card on own side exactly +4 permanent Fate.', ['OPPONENT_SIDE_TARGET','NO_DISCARD_COST','MORE_THAN_PLUS_4']),
  landscape('igb17','Tama City: Concrete Roads','ACTIVE_PLAYER_ACTION','ACTING_PLAYER','Once per game, discard one controlled Coordinator and exactly two hand cards; create one 5-Fate Shizuku token that applies an eligible copied Coordinator effect to controller’s whole field.', ['COST_NOT_PAID','SECOND_USE','INELIGIBLE_COORDINATOR_COPIED','TOKEN_GIVEN_TO_OPPONENT']),
  landscape('igb18','Wodny Potok: An Idyllic Polish Village','CONTROLLER_DRAW_PHASE_START','ACTIVE_PLAYER','Each Expanded Worlds Character active player controls gains exactly +1 permanent Fate once.', ['OPPONENT_CARD_GAINS','WRONG_AFFILIATION_OR_TYPE_GAINS','SAME_DRAW_PHASE_TICKS_TWICE']),
  landscape('igb19','Californique: Lost Civilization of the Old Age','CONTROLLER_HAND_TURN_AGE','CARD_OWNER','Discard each Character after it remains in the same player’s hand for three of that player’s turns; reset ownership clock on transfer.', ['SUPPORTER_EXPIRES','OPPONENT_TURN_ADVANCES_AGE','WRONG_DISCARD_OWNER']),
  landscape('igb20','The Battle of Pella, 2052','FIRST_REACH_TOTAL_FATE_THRESHOLD','THRESHOLD_REACHING_PLAYER','At first reach of 20, 35, and 50 total Fate, that player may discard one eligible field card; each threshold resolves once globally as established.', ['SAME_THRESHOLD_RESOLVES_TWICE','WRONG_PLAYER_CHOSES','INELIGIBLE_TARGET_DISCARDED'])
];

export const CARD_RULE_ORACLE = freeze(Object.fromEntries(CARD_RULES.map(rule=>[rule.id, rule])));
export const LANDSCAPE_RULE_ORACLE = freeze(Object.fromEntries(LANDSCAPE_RULES.map(rule=>[rule.id, rule])));
export const RULE_ORACLE_GLOBAL_PRESENTATION_ORDER = GLOBAL_PRESENTATION_ORDER;
export const RULE_ORACLE_GLOBAL_FORBIDDEN = GLOBAL_FORBIDDEN;

export function cardRuleOracle(cardId){
  return CARD_RULE_ORACLE[String(cardId || '')] || null;
}

export function landscapeRuleOracle(landscapeId){
  return LANDSCAPE_RULE_ORACLE[String(landscapeId || '')] || null;
}

export function validateRuleOracleCatalog(cardIds = [], landscapeIds = []){
  const errors = [];
  const duplicateCards = CARD_RULES.filter((rule, index)=>CARD_RULES.findIndex(item=>item.id === rule.id) !== index).map(rule=>rule.id);
  const duplicateLandscapes = LANDSCAPE_RULES.filter((rule, index)=>LANDSCAPE_RULES.findIndex(item=>item.id === rule.id) !== index).map(rule=>rule.id);
  if(duplicateCards.length) errors.push(`duplicate card contracts: ${[...new Set(duplicateCards)].join(', ')}`);
  if(duplicateLandscapes.length) errors.push(`duplicate landscape contracts: ${[...new Set(duplicateLandscapes)].join(', ')}`);
  for(const id of cardIds.map(String)){
    const rule = cardRuleOracle(id);
    if(!rule) errors.push(`missing card contract ${id}`);
    else for(const field of ['name','timing','prerequisites','beneficiary','target','resolution','forbidden','presentation']){
      if(rule[field] === undefined || rule[field] === '' || (Array.isArray(rule[field]) && !rule[field].length)) errors.push(`card ${id} missing ${field}`);
    }
  }
  for(const id of landscapeIds.map(String)) if(!landscapeRuleOracle(id)) errors.push(`missing landscape contract ${id}`);
  for(const id of Object.keys(CARD_RULE_ORACLE)) if(cardIds.length && !cardIds.map(String).includes(id)) errors.push(`stale card contract ${id}`);
  for(const id of Object.keys(LANDSCAPE_RULE_ORACLE)) if(landscapeIds.length && !landscapeIds.map(String).includes(id)) errors.push(`stale landscape contract ${id}`);
  return freeze({ok:errors.length === 0, errors:freeze(errors), cardCount:CARD_RULES.length, landscapeCount:LANDSCAPE_RULES.length});
}

function allProjectedCards(view){
  const state = view?.state || view || {};
  const cards = [];
  for(const player of (state.players || [])){
    for(const pileName of ['hand','deck','discard','limbo']){
      for(const value of (Array.isArray(player?.[pileName]) ? player[pileName] : [])) if(value?.iid) cards.push(value);
    }
  }
  for(const zone of (state.board || [])) for(const row of (zone || [])) for(const value of (row || [])) if(value?.iid) cards.push(value);
  for(const value of (view?.privateActionCards || [])) if(value?.iid) cards.push(value);
  return cards;
}

function projectedCard(view, iid){
  return projectedCardEntry(view, iid)?.card || null;
}

function projectedCardEntry(view, iid){
  const wanted = String(iid || '');
  const state = view?.state || view || {};
  for(let z = 0; z < (state.board || []).length; z += 1){
    for(let r = 0; r < (state.board[z] || []).length; r += 1){
      for(let c = 0; c < (state.board[z][r] || []).length; c += 1){
        const value = state.board[z][r][c];
        if(value && String(value.iid || '') === wanted) return {card:value,zone:'board',z,r,c,playerIndex:controllerOfProjected(value)};
      }
    }
  }
  for(let playerIndex = 0; playerIndex < (state.players || []).length; playerIndex += 1){
    const player = state.players[playerIndex] || {};
    for(const zone of ['hand','deck','discard','limbo']){
      const index = (Array.isArray(player[zone]) ? player[zone] : []).findIndex(value=>String(value?.iid || '') === wanted);
      if(index >= 0) return {card:player[zone][index],zone,index,playerIndex};
    }
  }
  const privateCard = (view?.privateActionCards || []).find(value=>String(value?.iid || '') === wanted);
  return privateCard ? {card:privateCard,zone:'private-action',playerIndex:controllerOfProjected(privateCard)} : null;
}

function controllerOfProjected(cardValue){
  const value = Number(cardValue?.controller ?? cardValue?.owner);
  return [0, 1].includes(value) ? value : null;
}

function oracleBoardEntries(state){
  const entries = [];
  for(let z = 0; z < (state?.board || []).length; z += 1){
    for(let r = 0; r < (state.board[z] || []).length; r += 1){
      for(let c = 0; c < (state.board[z][r] || []).length; c += 1){
        const value = state.board[z][r][c];
        if(value) entries.push({card:value,z,r,c,zone:'board'});
      }
    }
  }
  return entries;
}

function oracleRuntimeId(value){
  return String(value?.counters?.copiedPassiveId || value?.counters?.copiedEffectId || value?.id || '');
}

function oracleEffectImmutable(value){
  return ['bh01','76'].includes(String(value?.id || '')) || (value?.statuses || []).some(status=>
    ['IMMUNE_TO_ALL_EFFECTS','EFFECT_IMMUTABLE','HAND_EFFECT_IMMUNE'].includes(String(status))
  );
}

function oracleEffectiveType(state, value){
  const controller = controllerOfProjected(value);
  const globalOverride = (state?.statuses || []).some(status=>
    status?.type === 'SUPPORTERS_AS_CHARACTERS'
    && Number(status.playerIndex) === controller
    && Number(status.remainingTargetTurns || 0) > 0
  );
  if(globalOverride && String(value?.type || '') === 'Supporter') return 'Character';
  const ownOverride = (value?.statuses || []).find(status=>String(status).startsWith('TYPE:'));
  return ownOverride ? String(ownOverride).slice(5) : String(value?.type || '');
}

function oracleSourceActive(state, entry){
  if(!entry?.card || entry.card.faceDown === true || entry.card.statuses?.includes('EFFECTS_SUPPRESSED')) return false;
  if(String(entry.card.type || '') !== 'Coordinator') return true;
  if(oracleEffectImmutable(entry.card) || (entry.card.statuses || []).includes('IMMUNE_TO_OPPONENT_EFFECTS')) return true;
  return !(state?.geometry?.squareStatuses || []).some(status=>{
    if(!(status?.type === 'COORDINATOR_SUPPRESSED'
      && Number(status.z) === entry.z
      && Number(status.r) === entry.r
      && Number(status.c) === entry.c
      && Number(status.blockedPlayer) === controllerOfProjected(entry.card))) return false;
    const source = oracleBoardEntries(state).find(value=>String(value.card.iid || '') === String(status.sourceIid || ''));
    return !!source
      && oracleRuntimeId(source.card) === '21'
      && controllerOfProjected(source.card) !== controllerOfProjected(entry.card)
      && source.card.faceDown !== true
      && !source.card.statuses?.includes('EFFECTS_SUPPRESSED');
  });
}

function oracleAdjacent(left, right){
  return left.z === right.z && Math.abs(left.r - right.r) + Math.abs(left.c - right.c) === 1;
}

function oraclePassiveRank(source, target){
  const key = `${String(source?.iid || source?.id || '')}:${String(target?.iid || target?.id || '')}`;
  let hash = 2166136261;
  for(let index = 0; index < key.length; index += 1){
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function oracleDuelistTarget(state, source, entries){
  if(!oracleSourceActive(state, source) || oracleRuntimeId(source.card) !== '64') return null;
  return entries.filter(target=>
    target.z === source.z
    && controllerOfProjected(target.card) !== controllerOfProjected(source.card)
    && target.card.faceDown !== true
    && !oracleEffectImmutable(target.card)
    && oracleAdjacent(source, target)
  ).sort((a,b)=>
    oraclePassiveRank(source.card, a.card) - oraclePassiveRank(source.card, b.card)
    || String(a.card.iid).localeCompare(String(b.card.iid))
  )[0] || null;
}

function oracleAuraBoost(state, source, entries){
  if(String(source?.card?.type || '') !== 'Coordinator') return 0;
  const controller = controllerOfProjected(source.card);
  return entries.filter(value=>
    (value.z === source.z || value.card.counters?.whisperLandscapeToken === true)
    && controllerOfProjected(value.card) === controller
    && oracleRuntimeId(value.card) === '57'
    && oracleSourceActive(state, value)
  ).length;
}

const ORACLE_CONTINUOUS_BRANCH_IDS = freeze(new Set([
  '01','10','11','19','23','35','41','44','55','59','63','64','77','85','88','89','100','bh07'
]));
export const RULE_ORACLE_CONTINUOUS_BRANCH_CARD_IDS = freeze([
  '01','10','11','35','41','44','55','64','77','85','89','100','bh07'
]);

function oracleContinuousConditionPositive(state, source, entries){
  const id = oracleRuntimeId(source.card);
  const controller = controllerOfProjected(source.card);
  const controlled = entry=>controllerOfProjected(entry.card) === controller && entry.card.faceDown !== true;
  const inZone = entry=>entry.z === source.z;
  if(!oracleSourceActive(state, source)) return false;
  if(id === '01') return entries.some(entry=>String(entry.card.iid) !== String(source.card.iid) && controlled(entry) && oracleAdjacent(source, entry));
  if(id === '10') return entries.some(entry=>inZone(entry) && controllerOfProjected(entry.card) !== controller);
  if(id === '11' || id === '59') return entries.some(entry=>inZone(entry) && controlled(entry) && oracleEffectiveType(state, entry.card) === 'Supporter');
  if(id === '19') return entries.some(entry=>inZone(entry) && controlled(entry) && oracleEffectiveType(state, entry.card) === 'Coordinator');
  if(id === '23') return entries.some(entry=>inZone(entry) && controlled(entry) && oracleEffectiveType(state, entry.card) !== 'Supporter');
  if(id === '35') return entries.some(entry=>inZone(entry) && String(entry.card.iid) !== String(source.card.iid) && controlled(entry) && oracleEffectiveType(state, entry.card) === 'Supporter');
  if(id === '41') return Number(state?.fateReductionEffectUses?.[controller] || 0) > 0;
  if(id === '44') return entries.some(entry=>String(entry.card.iid) !== String(source.card.iid) && controlled(entry) && oracleEffectiveType(state, entry.card) === 'Dauntless' && oracleAdjacent(source, entry));
  if(id === '55'){
    const peers = entries.filter(entry=>inZone(entry)
      && String(entry.card.iid) !== String(source.card.iid)
      && controlled(entry)
      && !oracleEffectImmutable(entry.card));
    const affiliation = String(peers[0]?.card?.affiliation || '');
    return peers.length >= 3 && !!affiliation && peers.every(entry=>String(entry.card.affiliation || '') === affiliation);
  }
  if(id === '63') return entries.some(entry=>inZone(entry) && controlled(entry) && oracleRuntimeId(entry.card) === '63');
  if(id === '64') return !!oracleDuelistTarget(state, source, entries);
  if(id === '77') return entries.some(entry=>inZone(entry) && controlled(entry) && String(source.card.counters?.declaredAffiliation || '') === String(entry.card.affiliation || ''));
  if(id === '85') return Number(state?.supportersSetTotal?.[controller === 0 ? 1 : 0] || 0) > 0;
  if(id === '88') return entries.some(entry=>controlled(entry) && !oracleEffectImmutable(entry.card) && oracleEffectiveType(state, entry.card) !== 'Supporter');
  if(id === '89') return Number(state?.supporterEffectsActivated?.[controller] || 0) < 10;
  if(id === '100'){
    const related = new Set(['01','19','82','84','85','87','100']);
    return entries.some(entry=>controlled(entry) && String(entry.card.iid) !== String(source.card.iid) && related.has(String(entry.card.id || '')));
  }
  if(id === 'bh07') return entries.some(entry=>controlled(entry) && oracleEffectiveType(state, entry.card) === 'Dauntless' && oracleAdjacent(source, entry));
  return false;
}

export function expectedEffectiveFateFromOracle(state, cardIid){
  const entries = oracleBoardEntries(state);
  const entry = entries.find(value=>String(value.card.iid || '') === String(cardIid || ''));
  if(!entry?.card || entry.card.faceDown === true) return 0;
  const memo = new Map();
  const evaluating = new Set();
  function calculate(target){
    const iid = String(target.card.iid || '');
    if(memo.has(iid)) return memo.get(iid);
    const stored = Math.max(0, Number(target.card.currentFate) || 0);
    if(oracleEffectImmutable(target.card)) return stored;
    if(evaluating.has(iid)) return stored;
    evaluating.add(iid);
    const controller = controllerOfProjected(target.card);
    const type = oracleEffectiveType(state, target.card);
    const selfId = oracleRuntimeId(target.card);
    const permanentAdjustment = (Number(target.card.currentFate) || 0) - (Number(target.card.baseFate) || 0);
    let derived = oracleSourceActive(state, target) && selfId === '41'
      ? Math.max(0, Number(state?.fateReductionEffectUses?.[controller] || 0) * 3 + permanentAdjustment)
      : stored;
    if(oracleSourceActive(state, target) && selfId === '35'){
      derived = entries.filter(peer=>
        peer.z === target.z
        && String(peer.card.iid) !== iid
        && controllerOfProjected(peer.card) === controller
        && peer.card.faceDown !== true
        && oracleEffectiveType(state, peer.card) === 'Supporter'
      ).reduce((sum, peer)=>sum + calculate(peer), 0) + permanentAdjustment;
    }
    let modifier = 0;
    for(const source of entries){
      const fieldWide = source.card.counters?.whisperLandscapeToken === true;
      if((source.z !== target.z && !fieldWide) || !oracleSourceActive(state, source)) continue;
      const sourceController = controllerOfProjected(source.card);
      const sourceId = oracleRuntimeId(source.card);
      if(sourceId === '10' && sourceController !== controller){ modifier -= 3; continue; }
      if(sourceController !== controller) continue;
      const boost = oracleAuraBoost(state, source, entries);
      if(sourceId === '01' && oracleAdjacent(source, target)) modifier += 4 + boost;
      else if(sourceId === '11' && type === 'Supporter') modifier += 3 + boost;
      else if(sourceId === '19' && type === 'Coordinator') modifier += 3 + boost;
      else if(sourceId === '23' && type !== 'Supporter') modifier += 2 + boost;
      else if(sourceId === '77' && String(source.card.counters?.declaredAffiliation || '') === String(target.card.affiliation || '')) modifier += 4 + boost;
      else if(sourceId === '59' && type === 'Supporter') modifier += 1;
      else if(sourceId === 'bh07'){
        const adjacent = entries.filter(peer=>
          peer.card.faceDown !== true
          && oracleEffectiveType(state, peer.card) === 'Dauntless'
          && oracleAdjacent(source, peer)
        ).length;
        modifier += adjacent * (2 + boost);
      }
    }
    if(oracleSourceActive(state, target) && selfId === '44' && entries.some(peer=>
      controllerOfProjected(peer.card) === controller
      && peer.card.faceDown !== true
      && oracleEffectiveType(state, peer.card) === 'Dauntless'
      && oracleAdjacent(target, peer)
    )) modifier += 3;
    if(type === 'Dauntless') modifier += entries.filter(source=>
      controllerOfProjected(source.card) === controller
      && oracleRuntimeId(source.card) === '44'
      && oracleSourceActive(state, source)
      && oracleAdjacent(source, target)
    ).length * 3;
    if(oracleSourceActive(state, target) && selfId === '55'){
      const peers = entries.filter(peer=>peer.z === target.z
        && String(peer.card.iid) !== iid
        && controllerOfProjected(peer.card) === controller
        && peer.card.faceDown !== true
        && !oracleEffectImmutable(peer.card));
      const affiliation = String(peers[0]?.card?.affiliation || '');
      if(peers.length >= 3 && affiliation && peers.every(peer=>String(peer.card.affiliation || '') === affiliation)) modifier += 5;
    }
    if(oracleSourceActive(state, target) && selfId === '63') modifier += entries.filter(peer=>
      peer.z === target.z
      && controllerOfProjected(peer.card) === controller
      && oracleRuntimeId(peer.card) === '63'
      && oracleSourceActive(state, peer)
      && !oracleEffectImmutable(peer.card)
    ).length * 2;
    if(oracleSourceActive(state, target) && selfId === '88') modifier += entries.filter(peer=>
      controllerOfProjected(peer.card) === controller
      && peer.card.faceDown !== true
      && !oracleEffectImmutable(peer.card)
      && oracleEffectiveType(state, peer.card) !== 'Supporter'
    ).length * 2;
    if(oracleSourceActive(state, target) && selfId === '85') modifier += Number(state?.supportersSetTotal?.[controller === 0 ? 1 : 0] || 0);
    if(oracleSourceActive(state, target) && selfId === '89' && Number(state?.supporterEffectsActivated?.[controller] || 0) < 10) modifier += 7;
    if(oracleSourceActive(state, target) && selfId === '64' && oracleDuelistTarget(state, target, entries)) modifier += 3;
    for(const duelist of entries){
      if(oracleRuntimeId(duelist.card) !== '64') continue;
      if(String(oracleDuelistTarget(state, duelist, entries)?.card?.iid || '') === iid) modifier -= 3;
    }
    if(oracleSourceActive(state, target) && selfId === '100'){
      const related = new Set(['01','19','82','84','85','87','100']);
      if(entries.some(peer=>controllerOfProjected(peer.card) === controller && String(peer.card.iid) !== iid && related.has(String(peer.card.id || '')))) modifier += 3;
    }
    const uncappedResult = Math.max(0, derived + modifier);
    const permanentCeiling = Number(target.card.counters?.permanentFateCeiling);
    const result = Number.isFinite(permanentCeiling)
      ? Math.min(uncappedResult, Math.max(0, permanentCeiling))
      : uncappedResult;
    evaluating.delete(iid);
    memo.set(iid, result);
    return result;
  }
  return calculate(entry);
}

export function auditRuleOracleState(view, observedEffectiveFate = null){
  const state = view?.state || view || {};
  const violations = [];
  const cardChecks = {};
  const cardBranches = {};
  let checks = 0;
  const projectedCards = [];
  const projectedIids = new Set();
  for(const value of allProjectedCards(view)){
    const iid = String(value?.iid || '');
    if(!iid || projectedIids.has(iid)) continue;
    projectedIids.add(iid);
    projectedCards.push(value);
  }
  for(const value of projectedCards){
    const id = String(value.id || '');
    const rule = cardRuleOracle(id);
    if(!rule) continue;
    checks += 1;
    cardChecks[id] = Number(cardChecks[id] || 0) + 1;
    const useLimit = String(rule.useLimit || '').toUpperCase();
    const effectUses = Number(value?.counters?.effectUses || 0);
    const reactionUses = Number(value?.counters?.reactionUses || 0);
    if((useLimit === 'ONCE_PER_CARD' || useLimit === 'ONCE_PER_CARD_AND_TWICE_PER_GAME') && effectUses > 1){
      violations.push(issue('PER_CARD_EFFECT_USE_LIMIT_EXCEEDED',id,'',`${value.iid} effectUses=${effectUses}`));
    }
    if(useLimit === 'TWO_USES_PER_CARD' && effectUses > 2){
      violations.push(issue('PER_CARD_EFFECT_USE_LIMIT_EXCEEDED',id,'',`${value.iid} effectUses=${effectUses}`));
    }
    if(useLimit === 'THREE_REACTIONS_PER_CARD' && reactionUses > 3){
      violations.push(issue('PER_CARD_REACTION_USE_LIMIT_EXCEEDED',id,'',`${value.iid} reactionUses=${reactionUses}`));
    }
    if((rule.timing || []).includes('REACTION') && useLimit === 'ONCE_PER_CARD' && reactionUses > 1){
      violations.push(issue('PER_CARD_REACTION_USE_LIMIT_EXCEEDED',id,'',`${value.iid} reactionUses=${reactionUses}`));
    }
  }
  const statusBounds = {
    FORT_CALVIN_WATCHER:['remaining',3],
    FACE_DOWN_CONSOLIDATION_PERMISSION:['remaining',1],
    LANDSCAPE_CHANGE_BLOCKED:['remainingTargetTurns',5],
    SUPPORTERS_AS_CHARACTERS:['remainingTargetTurns',5],
    SUPPORTER_EFFECTS_BLOCKED:['remainingTargetTurns',1],
    ZONE_ACTIONS_BLOCKED:['remainingTargetTurns',1],
    RIVERA_AFFILIATION_BONUS:['remainingOwnerTurns',3],
    MOVEMENT_GRANT:['remainingOwnerTurns',3],
    DELAYED_HAND_DELIVERY:['deliveryTurnsRemaining',4],
    CONSOLIDATION_COST_MODIFIER:['remaining',2]
  };
  const opponentOwnedStatusTypes = new Set([
    'FORT_CALVIN_WATCHER','LANDSCAPE_CHANGE_BLOCKED','SUPPORTER_EFFECTS_BLOCKED',
    'ZONE_ACTIONS_BLOCKED','CONSOLIDATION_COST_MODIFIER'
  ]);
  for(const status of (state.statuses || [])){
    const type = String(status?.statusType || status?.type || '').toUpperCase();
    const bound = statusBounds[type];
    const source = projectedCard(view, status?.sourceIid);
    const sourceId = String(source?.id || '');
    if(sourceId){
      checks += 1;
      cardChecks[sourceId] = Number(cardChecks[sourceId] || 0) + 1;
    }
    if(bound){
      const [field, maximum] = bound;
      const remaining = Number(status?.[field]);
      if(!Number.isInteger(remaining) || remaining < 1 || remaining > maximum){
        violations.push(issue('STATUS_DURATION_OUT_OF_ORACLE_BOUNDS',sourceId,'',`${type}.${field}=${status?.[field]} maximum=${maximum}`));
      }
    }
    if(type === 'RULE_USE_COUNTER'){
      const uses = Number(status?.uses || 0);
      const maximum = Number(status?.maxUses || 0);
      if(!Number.isInteger(uses) || uses < 0 || (maximum > 0 && uses > maximum)){
        violations.push(issue('SHARED_USE_LIMIT_EXCEEDED',sourceId,'',`${status?.ruleKey || ''} uses=${uses} maximum=${maximum}`));
      }
    }
    if(source && opponentOwnedStatusTypes.has(type)){
      // Timed effects retain the controller who created them. The physical
      // source may later change control or move into another player's pile;
      // that must not invert an already-created opponent-facing status.
      const sourceController = [0, 1].includes(Number(status?.sourceController))
        ? Number(status.sourceController)
        : controllerOfProjected(source);
      if(sourceController !== null && Number(status?.playerIndex) === sourceController){
        violations.push(issue('OPPONENT_STATUS_ASSIGNED_TO_SOURCE_CONTROLLER',sourceId,'',`${type} playerIndex=${status?.playerIndex}`));
      }
    }
  }
  const board = oracleBoardEntries(state);
  for(const source of board){
    const id = oracleRuntimeId(source.card);
    if(!ORACLE_CONTINUOUS_BRANCH_IDS.has(id)) continue;
    const branch = oracleContinuousConditionPositive(state, source, board)
      ? 'CONTINUOUS_CONDITION_TRUE'
      : 'CONTINUOUS_CONDITION_FALSE';
    cardBranches[`${id}|${branch}`] = Number(cardBranches[`${id}|${branch}`] || 0) + 1;
    cardChecks[id] = Number(cardChecks[id] || 0) + 1;
    checks += 1;
  }
  for(const entry of board){
    const expected = expectedEffectiveFateFromOracle(state, entry.card.iid);
    checks += 1;
    cardChecks[String(entry.card.id || '')] = Number(cardChecks[String(entry.card.id || '')] || 0) + 1;
    if(typeof observedEffectiveFate !== 'function') continue;
    const observed = Number(observedEffectiveFate(entry.card.iid, entry));
    if(Number.isFinite(observed) && observed !== expected){
      violations.push(issue('EFFECTIVE_FATE_ORACLE_MISMATCH',entry.card.id,'',`${entry.card.iid} expected=${expected} observed=${observed}`));
    }
  }
  return freeze({ok:violations.length === 0, checks, cardChecks:freeze(cardChecks), cardBranches:freeze(cardBranches), violations:freeze(violations)});
}

function issue(code, cardId, batchId, detail){
  return freeze({code, cardId:String(cardId || ''), batchId:String(batchId || ''), detail:String(detail || '')});
}

const ORACLE_MUTATION_EVENTS = freeze(new Set([
  'CARD_DRAWN','CARD_DISCARDED','CARD_MOVED','CARD_TRANSFERRED','FATE_CHANGED',
  'STATUS_CREATED','STATUS_REMOVED','SAFE_ROW_ADDED','SAFE_SQUARE_ADDED',
  'SQUARE_STATUS_CREATED','TOKENS_CREATED','PLAYER_COUNTER_CHANGED','CONTROL_CHANGED'
]));

function eventTargetIid(event){
  return String(event?.cardIid || event?.targetIid || event?.status?.targetIid || '');
}

function oracleMutationSignature(event){
  const status = event?.status;
  return JSON.stringify([
    String(event?.type || ''), String(event?.sourceIid || ''), String(event?.effectSourceIid || ''), eventTargetIid(event),
    event?.playerIndex ?? null, event?.owner ?? null, event?.before ?? null,
    event?.after ?? null, event?.amount ?? null, event?.zone ?? null,
    event?.row ?? null, event?.column ?? null, event?.reason ?? null,
    typeof status === 'string' ? status : (status?.statusId ?? status?.type ?? null),
    event?.statusId ?? null, event?.statusType ?? null, event?.value ?? status?.value ?? null
  ]);
}

function mutationTargetLimit(cardinality){
  const value = String(cardinality || '').toUpperCase();
  if(['EXACTLY_ONE','EXACTLY_ONE_IF_AVAILABLE','ZERO_OR_ONE','ZERO_OR_ONE_IF_AVAILABLE'].includes(value)) return 1;
  if(['UP_TO_TWO','ZERO_TO_TWO','EXACTLY_TWO'].includes(value)) return 2;
  if(['UP_TO_THREE','ZERO_TO_THREE','EXACTLY_THREE'].includes(value)) return 3;
  if(['UP_TO_FOUR','ZERO_TO_FOUR','EXACTLY_FOUR'].includes(value)) return 4;
  return null;
}

function simplePrintedFateDelta(rule){
  const text = String(rule?.resolution || '');
  // Aggregate, aura, distribution, and multi-target formulas require their
  // dedicated state oracle. This parser is only for unambiguous fixed deltas.
  if(/\b(each|every|all|per|equal|sum|total|times|split|random|current Fate|becomes)\b/i.test(text)) return null;
  let match = text.match(/gains? exactly \+(\d+) permanent Fate/i);
  if(match) return Number(match[1]);
  match = text.match(/loses? exactly (\d+) permanent Fate/i);
  if(match) return -Number(match[1]);
  match = text.match(/gains? exactly \+(\d+) effective Fate/i);
  return match ? null : null;
}

function observedFixedFateDeltaIsLegal(printedDelta, before, after, amount){
  if(printedDelta === null) return true;
  if(amount === printedDelta) return true;
  // Fate is bounded at zero.  A printed loss still resolves for its full
  // semantic amount even when the observable mutation is clamped by the
  // target's remaining Fate (for example, "lose 3" on a 1-Fate card).
  return printedDelta < 0
    && before >= 0
    && before + printedDelta < 0
    && after === 0
    && amount === -before;
}

function mutationIsSourceCardEffect(event){
  // These mutations are rule/activation costs or expiry cleanup. sourceIid can
  // identify the card being paid, the card being placed, or a landscape solely
  // so presentation can group the events; it must not make the mutation obey
  // that card's printed target contract. Printed-effect consequences use their
  // own reason codes and continue through the semantic checks below.
  const nonEffectReasons = new Set([
    'CONSOLIDATION_TRIBUTE',
    'MANUAL_DISCARD',
    'HAND_LIMIT',
    'PEOPLES_PARK_COST',
    'LANDSCAPE_IGB16_COST',
    'LANDSCAPE_IGB17_COORDINATOR_COST',
    'LANDSCAPE_IGB17_HAND_COST',
    'LANDSCAPE_IGB19_HAND_EXPIRY',
    'LANDSCAPE_PANACEA_MOVE',
    'GUERILLA_EXPIRED'
  ]);
  return !nonEffectReasons.has(String(event?.reason || '').toUpperCase());
}

function targetRelationViolation(view, rule, sourceEntry, targetEntry, event){
  const source = sourceEntry?.card;
  const target = targetEntry?.card;
  if(!rule || !source || !target) return '';
  const scope = String(rule.target || '').toUpperCase();
  // Use the effect's captured controller when the authoritative event exposes
  // one. Delayed effects (Mail Delivery) remain owned by their activating
  // player even if the physical source changes control before resolution.
  const sourceController = event?.sourceController !== null
    && event?.sourceController !== undefined
    && [0, 1].includes(Number(event.sourceController))
      ? Number(event.sourceController)
      : controllerOfProjected(source);
  // For private piles, the semantic player is the pile holder. A transferred
  // card can retain its printed owner/controller metadata while legally
  // residing in the other player's hand (most importantly Guerilla). Effects
  // worded "your opponent's hand" target that container, not printed ownership.
  const preTransferHolder = String(event?.type || '').toUpperCase() === 'CARD_TRANSFERRED'
    && ['hand','deck','discard'].includes(String(event?.from || '').toLowerCase())
    && [0, 1].includes(Number(event?.fromPlayerIndex))
      ? Number(event.fromPlayerIndex)
      : null;
  const targetController = preTransferHolder !== null
    ? preTransferHolder
    : ['hand','deck','discard','limbo'].includes(String(targetEntry?.zone || ''))
      && [0, 1].includes(Number(targetEntry?.playerIndex))
        ? Number(targetEntry.playerIndex)
        : controllerOfProjected(target);
  if(sourceController === null || targetController === null) return '';
  const targetIsSource = String(source.iid || '') === String(target.iid || '');
  // A source-zone selection is tautologically legal when the effect moves its
  // own source card.  The projected source entry is post-resolution, so using
  // its current zone would otherwise compare the movement origin against the
  // destination and falsely reject a self-move across zones (Wolf Creek).
  if(targetIsSource
    && String(event?.type || '').toUpperCase() === 'CARD_MOVED'
    && (scope.includes('SOURCE_ZONE') || scope.includes('IN_SOURCE_ZONE'))){
    return '';
  }
  if(scope.includes('SOURCE_CARD') && targetIsSource){
    // Composite contracts such as Berkeley Homeless and Wine Country
    // Guerilla describe both the source card and a later destination/secondary
    // target.  A mutation of the source satisfies the source-card branch; the
    // word OPPONENT in the destination clause must not be misread as requiring
    // the source itself to be opponent-controlled.
    return '';
  }
  const permitsSecondaryOpponentCard = scope.includes('THEN_OPPONENT_HAND_RANDOM_CARD');
  if(scope.includes('SOURCE_CARD') && !targetIsSource && !permitsSecondaryOpponentCard) return 'target is not source card';
  if(scope.includes('OPPONENT') && targetController === sourceController) return 'controller-owned target used where opponent target is required';
  if((scope.includes('CONTROLLER_CONTROLS') || scope.includes('CONTROLLED_CARD') || scope.includes('CARDS_CONTROLLER_CONTROLS'))
    && targetController !== sourceController) return 'opponent-owned target used where controller target is required';
  if((scope.includes('CONTROLLER_HAND') || scope.includes('CONTROLLER_DECK'))
    && targetController !== sourceController) return 'opponent-owned card used where controller hand/deck card is required';
  // Busser's same-zone clause constrains only the initial BOARD_TARGET that
  // receives the grant. Later MOVE_CARD commands originate wherever that card
  // finished its previous granted move; only controller, once-per-turn,
  // duration, own-side destination, and adjacent-zone distance remain relevant.
  if(String(event?.type || '').toUpperCase() === 'CARD_MOVED'
    && String(event?.reason || '').toUpperCase() === 'MOVEMENT_GRANT') return '';
  // Whisper of the Heart deliberately makes Shizuku's copied Coordinator
  // aura field-wide.  The authoritative triggers and effective-Fate engine
  // therefore allow a copied source-zone rule to reach controlled cards in
  // every zone.  Retain the copied rule's controller/type constraints while
  // skipping only its normal same-zone constraint.
  const whisperFieldWide = source?.counters?.whisperLandscapeToken === true;
  if((scope.includes('SOURCE_ZONE') || scope.includes('IN_SOURCE_ZONE'))
    && sourceEntry.zone === 'board'
    && !whisperFieldWide){
    // "Select in this/source zone, then move" constrains the origin, not the
    // post-resolution square. Effects worded "moved into source zone" instead
    // constrain the destination/current location.
    const movedFromSourceThen = String(event?.type || '').toUpperCase() === 'CARD_MOVED'
      && scope.includes('IN_SOURCE_ZONE_THEN');
    const comparedZone = movedFromSourceThen ? Number(event?.from?.z) : Number(targetEntry.z);
    if(Number.isInteger(comparedZone) && Number(sourceEntry.z) !== comparedZone){
      return `${movedFromSourceThen ? 'target origin' : 'target'} zone ${comparedZone} differs from source zone ${sourceEntry.z}`;
    }
  }
  const state = view?.state || view || {};
  // Květka (Ukulele) ends its ongoing consolidation bonus when its controller
  // later sets a Supporter, but the mutation target is the consolidated
  // Character. Do not let the duration clause's SUPPORTER token masquerade as
  // a target-type requirement.
  if(String(event?.reason || '').toUpperCase() === 'KVETKA_BALLAD_CONSOLIDATION'){
    if(oracleEffectiveType(state, target) === 'Supporter') return 'Supporter target used for consolidation bonus';
    return '';
  }
  // Lumberjack follows the shipping/single-player rule: it suppresses a card
  // that was printed as a Supporter even while a temporary classification
  // effect (for example Rozsi and Zsofia) makes that card act as a Character.
  // The reducer deliberately checks card.type for this interaction, so the
  // independent oracle must not turn that legal suppression status into a
  // target-relation violation merely because effective type changed.
  // Private-pile searches in the shipping game filter printed card type. A
  // temporary field classification (Blame Game) must not make a Supporter in
  // deck/discard illegal for Maja, Kirby, Crossroads Worker, IB Student, etc.
  const printedSupporterContract = ['hand','deck','discard','limbo'].includes(String(targetEntry?.zone || ''));
  const supporterTargetType = printedSupporterContract || String(rule?.id || '') === '92'
    ? String(target?.type || '')
    : oracleEffectiveType(state, target);
  if(scope.includes('SUPPORTER') && supporterTargetType !== 'Supporter') return 'non-Supporter target used';
  if(scope.includes('CHARACTER') && oracleEffectiveType(state, target) === 'Supporter') return 'non-Character target used';
  return '';
}

function oracleDestinationOwner(state, destination){
  const z = Number(destination?.z);
  const r = Number(destination?.r);
  const c = Number(destination?.c);
  if(!Number.isInteger(z) || !Number.isInteger(r) || !Number.isInteger(c)) return null;
  const extra = (state?.geometry?.playableExtraSquares || []).find(square=>
    Number(square?.z) === z && Number(square?.r) === r && Number(square?.c) === c
  );
  if(extra && Number.isInteger(Number(extra.owner))) return Number(extra.owner);
  const owner = Number(state?.geometry?.rowOwners?.[z]?.[r]);
  return Number.isInteger(owner) ? owner : null;
}

function auditGenericCardMutationSemantics(view, events, batchId){
  const violations = [];
  const cardChecks = {};
  const mutationSignatures = new Set();
  const targetIidsBySource = new Map();
  for(const event of events){
    const type = String(event?.type || '').toUpperCase();
    if(!ORACLE_MUTATION_EVENTS.has(type)) continue;
    const oracleSourceIid = String(event?.effectSourceIid || event?.sourceIid || '');
    const sourceEntry = projectedCardEntry(view, oracleSourceIid);
    const source = sourceEntry?.card || null;
    const cardId = String(source?.id || event?.sourceCardId || '');
    // Copy cards remain the public source/controller, but the mutations they
    // produce must obey the copied card's contract.  The authoritative state
    // exposes this as a public counter, independently of the implementation
    // registry.  Coverage is credited to both the copier and copied rule.
    const copiedRuleId = String(source?.counters?.copiedEffectId || source?.counters?.copiedPassiveId || '');
    // Triggered passive consequences can be emitted while another card's
    // effect frame is still resolving. The explicit consequence reason is
    // authoritative in that case: Rozsi's +3 obeys Rozsi's movement contract,
    // not the enclosing mover's target contract.
    const semanticReason = String(event?.reason || '').toUpperCase();
    const reasonSemanticRuleId = semanticReason === 'ROZSI_MOVEMENT_BONUS'
      ? '34'
      : (semanticReason === 'WINE_COUNTRY_GUERILLA' ? '70' : '');
    const eventSemanticRuleId = String(event?.semanticSourceCardId || '');
    // Reducer events commonly repeat the physical source card id as
    // semanticSourceCardId.  That does not replace the copied-effect contract:
    // Taylor/Ledger remain the visible source while their public copiedEffectId
    // defines which printed targeting rule the mutation must obey.  A genuinely
    // different explicit semantic source still wins, as do intrinsic consequence
    // reasons such as Rozsi's movement bonus.
    const explicitSemanticRuleId = eventSemanticRuleId && eventSemanticRuleId !== cardId
      ? eventSemanticRuleId
      : '';
    const semanticRuleId = reasonSemanticRuleId && cardRuleOracle(reasonSemanticRuleId)
      ? reasonSemanticRuleId
      : (explicitSemanticRuleId && cardRuleOracle(explicitSemanticRuleId)
        ? explicitSemanticRuleId
        : (copiedRuleId && cardRuleOracle(copiedRuleId) ? copiedRuleId : cardId));
    const rule = cardRuleOracle(semanticRuleId);
    if(!rule) continue;
    cardChecks[cardId] = Number(cardChecks[cardId] || 0) + 1;
    if(semanticRuleId !== cardId) cardChecks[semanticRuleId] = Number(cardChecks[semanticRuleId] || 0) + 1;
    const signature = oracleMutationSignature(event);
    if(mutationSignatures.has(signature)){
      violations.push(issue('DUPLICATE_IDENTICAL_MUTATION',cardId,batchId,signature));
    }
    mutationSignatures.add(signature);
    const sourceController = event?.sourceController !== null
      && event?.sourceController !== undefined
      && [0, 1].includes(Number(event.sourceController))
        ? Number(event.sourceController)
        : controllerOfProjected(source);
    const sourceEffectMutation = mutationIsSourceCardEffect(event);
    if(['CARD_DRAWN','TOKENS_CREATED','SAFE_ROW_ADDED','SAFE_SQUARE_ADDED','PLAYER_COUNTER_CHANGED'].includes(type)
      && sourceController !== null
      && ['CONTROLLER','ORIGINAL_OWNER','ACTING_PLAYER'].includes(String(rule.beneficiary || '').toUpperCase())
      && Number(event.playerIndex) !== sourceController){
      violations.push(issue('MUTATION_BENEFITS_WRONG_PLAYER',cardId,batchId,`${type} expected player ${sourceController}, got ${event.playerIndex}`));
    }
    const targetIid = eventTargetIid(event);
    const targetEntry = targetIid ? projectedCardEntry(view, targetIid) : null;
    const target = targetEntry?.card || null;
    const relationOutputEvent = ['CARD_DRAWN','TOKENS_CREATED','SAFE_ROW_ADDED','SAFE_SQUARE_ADDED','PLAYER_COUNTER_CHANGED'].includes(type)
      || (type === 'FATE_CHANGED'
        && targetIid === String(source?.iid || '')
        && ['UNSEEN_STRIKES','JAKE_FATE_GAIN'].includes(String(event?.reason || '').toUpperCase()));
    if(target && sourceEffectMutation && !relationOutputEvent){
      const relation = targetRelationViolation(view, rule, sourceEntry, targetEntry, event);
      if(relation) violations.push(issue('ILLEGAL_ORACLE_TARGET_RELATION',cardId,batchId,`${type} ${targetIid} reason=${event?.reason || 'UNSPECIFIED'}: ${relation}`));
      const scope = String(rule.target || '').toUpperCase();
      if(type === 'CARD_MOVED'
        && targetIid === String(source?.iid || '')
        && scope.includes('OPPONENT_OWNED_OPEN_DESTINATION')
        && sourceController !== null){
        const destinationOwner = oracleDestinationOwner(view?.state || view || {}, event.to);
        const expectedOwner = sourceController === 0 ? 1 : 0;
        if(destinationOwner !== expectedOwner){
          violations.push(issue(
            'ILLEGAL_ORACLE_DESTINATION_RELATION',
            cardId,
            batchId,
            `CARD_MOVED destination owner ${destinationOwner}, expected opponent ${expectedOwner}`
          ));
        }
      }
      if(type === 'CARD_MOVED' && String(event?.reason || '').toUpperCase() === 'MOVEMENT_GRANT'){
        const fromZone = Number(event?.from?.z);
        const toZone = Number(event?.to?.z);
        if(!Number.isInteger(fromZone) || !Number.isInteger(toZone) || Math.abs(toZone - fromZone) > 1){
          violations.push(issue('ILLEGAL_GRANTED_MOVEMENT_DISTANCE',cardId,batchId,`from zone ${event?.from?.z} to ${event?.to?.z}`));
        }
      }
      if(targetIid !== String(source?.iid || '') || String(rule.target || '').toUpperCase().includes('SOURCE_CARD')){
        if(!targetIidsBySource.has(oracleSourceIid)) targetIidsBySource.set(oracleSourceIid, new Set());
        targetIidsBySource.get(oracleSourceIid).add(targetIid);
      }
    }
    if(type === 'FATE_CHANGED'){
      const before = Number(event.before);
      const after = Number(event.after);
      const amount = Number(event.amount);
      if(!Number.isInteger(before) || !Number.isInteger(after) || !Number.isInteger(amount) || amount !== after - before || after < 0){
        violations.push(issue('MALFORMED_FATE_MUTATION',cardId,batchId,`before=${event.before} after=${event.after} amount=${event.amount}`));
      }
      const printedDelta = simplePrintedFateDelta(rule);
      // Great Oak resolves once per consumed copy, while the authoritative
      // consolidation operation emits the stacked bonus as one Fate mutation
      // attributed to the first consumed copy.  Therefore +6/+9 are legal
      // only for this specifically tagged operation; unrelated fixed deltas
      // must still match their printed amount exactly.
      const legalStackedGreatOakDelta = cardId === '47'
        && String(event?.reason || '').toUpperCase() === 'GREAT_OAK_CONSOLIDATION'
        && printedDelta === 3
        && Number.isInteger(amount)
        && amount >= 3
        && amount % 3 === 0;
      if(!legalStackedGreatOakDelta && !observedFixedFateDeltaIsLegal(printedDelta, before, after, amount)){
        violations.push(issue('WRONG_FIXED_FATE_DELTA',cardId,batchId,`printed=${printedDelta} observed=${amount} target=${targetIid}`));
      }
    }
    if(type === 'CARD_DISCARDED' && sourceEffectMutation){
      const scope = String(rule.target || '').toUpperCase();
      const targetController = controllerOfProjected(target);
      const sourceCardBranch = scope.includes('SOURCE_CARD') && targetIid === String(source?.iid || '');
      if(!sourceCardBranch && scope.includes('OPPONENT') && sourceController !== null && targetController === sourceController){
        violations.push(issue('WRONG_PLAYER_CARD_DISCARDED',cardId,batchId,targetIid));
      }
      if(!sourceCardBranch && (scope.includes('CONTROLLER_CONTROLS') || scope.includes('CONTROLLED_CARD'))
        && sourceController !== null && targetController !== sourceController){
        violations.push(issue('WRONG_PLAYER_CARD_DISCARDED',cardId,batchId,targetIid));
      }
    }
  }
  for(const [sourceIid, targets] of targetIidsBySource){
    const source = projectedCard(view, sourceIid);
    const cardId = String(source?.id || '');
    const rule = cardRuleOracle(cardId);
    const limit = mutationTargetLimit(rule?.cardinality);
    if(limit !== null && targets.size > limit){
      violations.push(issue('CARDINALITY_EXCEEDED',cardId,batchId,`${sourceIid} mutated ${targets.size} targets, maximum ${limit}`));
    }
  }
  return {violations, cardChecks};
}

// Audits observable authoritative presentation events. This is deliberately
// narrower than the prose oracle: a full match certifier also evaluates state
// transitions and branch coverage. These checks catch high-impact plausible-
// looking failures immediately on either client.
export function auditRuleOraclePresentationBatch(view, batch){
  const violations = [];
  const cardChecks = {};
  const events = Array.isArray(batch?.events) ? batch.events : [];
  const batchId = String(batch?.id || '');
  const ids = new Set();
  const generic = auditGenericCardMutationSemantics(view, events, batchId);
  for(const violation of generic.violations) violations.push(violation);
  for(const [cardId, count] of Object.entries(generic.cardChecks)) cardChecks[cardId] = Number(cardChecks[cardId] || 0) + Number(count || 0);
  for(const event of events){
    const eventId = String(event?.eventId || event?.id || '');
    if(eventId){
      if(ids.has(eventId)) violations.push(issue('DUPLICATE_EVENT_ID','',batchId,eventId));
      ids.add(eventId);
    }
    const eventType = String(event?.type || '').toUpperCase();
    if(eventType === 'EFFECT_REACTED'){
      const reaction = projectedCard(view, event.reactionIid);
      const reactionId = String(reaction?.id || ({LYDIA:'56',SECULES:'67',HAVANO:'79'})[String(event?.reactionKind || '').toUpperCase()] || '');
      if(reactionId) cardChecks[reactionId] = Number(cardChecks[reactionId] || 0) + 1;
      const controller = controllerOfProjected(reaction);
      if(controller !== null && Number(event.playerIndex) !== controller){
        violations.push(issue('REACTION_ATTRIBUTED_TO_WRONG_PLAYER',reactionId,batchId,`expected ${controller}, got ${event.playerIndex}`));
      }
    const allowedModes = {56:['NEGATE'],67:['NEGATE'],79:['NEGATE','SUPPRESS']}[reactionId] || null;
      if(allowedModes && !allowedModes.includes(String(event.mode || '').toUpperCase())){
        violations.push(issue('IMPROVISOR_REACTION_USED_INVALID_MODE',reactionId,batchId,String(event.mode || '')));
      }
      continue;
    }
    if(eventType !== 'EFFECT_ACTIVATED') continue;
    const source = projectedCard(view, event.sourceIid);
    const controller = controllerOfProjected(source);
    if(controller !== null && Number(event.playerIndex) !== controller){
      violations.push(issue('ACTIVATION_ATTRIBUTED_TO_WRONG_PLAYER',source?.id,batchId,`expected ${controller}, got ${event.playerIndex}`));
    }
  }
  const sourceId = event=>{
    const eventType = String(event?.type || '').toUpperCase();
    const iid = eventType === 'EFFECT_REACTED' ? event?.reactionIid : (event?.effectSourceIid || event?.sourceIid);
    const reactionId = ({LYDIA:'56',SECULES:'67',HAVANO:'79'})[String(event?.reactionKind || '').toUpperCase()] || '';
    return String(projectedCard(view, iid)?.id || (eventType === 'EFFECT_REACTED' ? reactionId : event?.sourceCardId) || '');
  };
  const terminalEffects = events.filter(event=>{
    const type = String(event?.type || '').toUpperCase();
    return type === 'EFFECT_BLOCKED' || type === 'EFFECT_SKIPPED';
  });
  const pendingSourceIid = String(view?.state?.pendingPrompt?.sourceIid || '');
  for(const event of terminalEffects){
    const sourceIid = String(event?.sourceIid || '');
    if(sourceIid && pendingSourceIid === sourceIid){
      violations.push(issue(
        'TERMINAL_EFFECT_LEFT_PROMPT_OPEN',
        sourceId(event),
        batchId,
        `${String(event.type).toUpperCase()} left prompt ${String(view.state.pendingPrompt?.promptId || '')} open for ${sourceIid}`
      ));
    }
  }
  for(const event of events){
    const id = sourceId(event);
    if(id) cardChecks[id] = Number(cardChecks[id] || 0) + 1;
  }
  const anickaRows = events.filter(event=>String(event?.type || '').toUpperCase() === 'SAFE_ROW_ADDED' && sourceId(event) === '02');
  for(const event of anickaRows){
    const source = projectedCard(view, event.sourceIid);
    const controller = controllerOfProjected(source);
    const rowOwner = Number(view?.state?.geometry?.rowOwners?.[Number(event.zone)]?.[Number(event.row)]);
    const squares = (view?.state?.geometry?.playableExtraSquares || []).filter(square=>
      Number(square?.z) === Number(event.zone) && Number(square?.r) === Number(event.row)
    );
    if(controller === null || Number(event.playerIndex) !== controller || rowOwner !== controller || squares.length !== 3 || squares.some(square=>Number(square.owner) !== controller)){
      violations.push(issue('ANICKA_SAFE_ROW_WRONG_BENEFICIARY','02',batchId,`controller=${controller} event=${event.playerIndex} row=${rowOwner} squares=${squares.map(square=>square.owner).join(',')}`));
    }
  }
  const howardChanges = events.filter(event=>String(event?.type || '').toUpperCase() === 'FATE_CHANGED' && sourceId(event) === '03');
  if(howardChanges.length > 1) violations.push(issue('HOWARD_DUPLICATE_FATE_MUTATION','03',batchId,`count=${howardChanges.length}`));
  for(const event of howardChanges){
    const before = Number(event.before);
    const after = Number(event.after);
    if(!Number.isFinite(before) || after !== before * 2 + 5){
      violations.push(issue('HOWARD_WRONG_FATE_FORMULA','03',batchId,`before=${event.before} after=${event.after}`));
    }
  }
  const activationBySource = new Map();
  for(const event of events){
    if(String(event?.type || '').toUpperCase() !== 'EFFECT_ACTIVATED') continue;
    const key = String(event.sourceIid || '');
    activationBySource.set(key, Number(activationBySource.get(key) || 0) + 1);
  }
  for(const [sourceIid, count] of activationBySource){
    if(count > 1){
      violations.push(issue('DUPLICATE_ACTIVATION_EVENT',projectedCard(view, sourceIid)?.id,batchId,`${sourceIid} count=${count}`));
    }
  }
  return freeze({ok:violations.length === 0, checks:events.length, cardChecks:freeze(cardChecks), violations:freeze(violations)});
}
