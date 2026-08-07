import {cardRule} from '../cards/registry.mjs';
import {landscapeRule} from '../landscapes/registry.mjs';

function unique(values){
  return [...new Set(values.filter(Boolean))].sort();
}

function matches(text, pattern){
  return pattern.test(text);
}

function cardTimings(text){
  const timings = [];
  if(matches(text, /\bwhen (?:this card is |it is )?set\b|\bwhen set\b/)) timings.push('WHEN_SET');
  if(matches(text, /\bwhile (?:this card is )?on the field\b|\bas long as\b/)) timings.push('CONTINUOUS');
  if(matches(text, /\bactivate effect\b|\bat any time during your turn\b|\bonce a turn\b/)) timings.push('ACTIVATE');
  if(matches(text, /\bwhenever\b|\beach time\b|\bnext time\b/)) timings.push('TRIGGERED');
  if(matches(text, /\bwhen (?:you draw|this card (?:appears|is added)|this card is drawn)\b/)) timings.push('WHEN_ADDED_TO_HAND');
  if(matches(text, /\bwhen this card is discarded\b|\bwhen it leaves the field\b/)) timings.push('WHEN_LEAVES_PLAY');
  if(matches(text, /\bconsolidat/)) timings.push('DURING_CONSOLIDATION');
  if(matches(text, /\bstart of the turn\b|\bdraw phase\b|\bfor each of your turns\b|\bnext turn\b/)) timings.push('TURN_BOUNDARY');
  if(timings.length === 0) timings.push('WHEN_SET_OR_RULE_QUERY');
  return unique(timings);
}

function cardOperations(text){
  const operations = [];
  if(matches(text, /\bdraw\b/)) operations.push('DRAW_CARD');
  if(matches(text, /\bsearch\b|\bfrom the deck\b.*\b(?:hand|set)\b|\badd(?:ed)? .* from (?:your |the )?deck\b/)) operations.push('SEARCH_DECK');
  if(matches(text, /\bset\b|\bplaced\b/)) operations.push('SET_CARD');
  if(matches(text, /\bmove\b|\bswap\b/)) operations.push('MOVE_CARD');
  if(matches(text, /\bdiscard\b|\bsend .* to (?:the |your )?discard\b/)) operations.push('DISCARD_CARD');
  if(matches(text, /\bgain(?:s)? \d+ fate\b|\blose(?:s)? \d+ fate\b|\breduc(?:e|es|ed).*fate\b|\bincrease.*fate\b|\bdouble.*fate\b/)) operations.push('MODIFY_FATE');
  if(matches(text, /\bfate is equal\b|\bincreases its own fate to\b/)) operations.push('SET_FATE');
  if(matches(text, /\breveal\b/)) operations.push('REVEAL_CARD');
  if(matches(text, /\bdeclare (?:any |a )?affiliation\b|\bchange .* affiliation\b/)) operations.push('CHANGE_AFFILIATION');
  if(matches(text, /\bchange the landscape\b/)) operations.push('CHANGE_LANDSCAPE');
  if(matches(text, /\bcopy the effect\b/)) operations.push('COPY_EFFECT');
  if(matches(text, /\btoken\b|\bcounter to your hand\b|\bsecond copy\b/)) operations.push('CREATE_CARD_INSTANCE');
  if(matches(text, /\breturn .* to (?:your |the )?(?:deck|hand)\b|\bbottom of the deck\b/)) operations.push('TRANSFER_CARD');
  if(matches(text, /\bextra safe (?:row|square)\b|\bnew safe square\b|\bsquare cannot be used\b/)) operations.push('MODIFY_BOARD_GEOMETRY');
  if(matches(text, /\bimmune\b|\bnegate\b|\bsuppress\b|\bcannot\b|\bfor the next\b/)) operations.push('CREATE_STATUS');
  return unique(operations);
}

function cardPrompts(text){
  const prompts = [];
  if(matches(text, /\bselect .*card\b|\bselect up to .*cards\b/)) prompts.push('CARD_SELECTION');
  if(matches(text, /\bselect .*square\b|\bopen square\b|\bmove .* square\b/)) prompts.push('BOARD_TARGET');
  if(matches(text, /\bselect any zone\b|\bin any zone\b/)) prompts.push('ZONE_SELECTION');
  if(matches(text, /\bdeclare (?:any |a )?(?:affiliation|card type)\b/)) prompts.push('DECLARATION');
  if(matches(text, /\byou can\b|\bmay\b|\bup to\b/)) prompts.push('OPTIONAL_CHOICE');
  if(matches(text, /\brandom\b/)) prompts.push('DETERMINISTIC_RANDOM');
  if(matches(text, /\bnegate\b|\bsuppress\b/)) prompts.push('REACTION');
  return unique(prompts);
}

function cardTriggers(text){
  const triggers = [];
  if(matches(text, /\bwhen (?:this card is |it is )?set\b|\bwhen set\b/)) triggers.push('CARD_SET');
  if(matches(text, /\bwhenever .*draw|\beach time .*draw|\bwhen you draw\b/)) triggers.push('CARD_DRAWN');
  if(matches(text, /\bwhen this card (?:appears|is added).*\bhand\b/)) triggers.push('CARD_ADDED_TO_HAND');
  if(matches(text, /\bwhen this card is discarded\b/)) triggers.push('CARD_DISCARDED');
  if(matches(text, /\bwhen it leaves the field\b/)) triggers.push('CARD_LEFT_FIELD');
  if(matches(text, /\bwhenever .*move|\bwould move\b/)) triggers.push('CARD_MOVED');
  if(matches(text, /\bwhenever .*search\b/)) triggers.push('DECK_SEARCHED');
  if(matches(text, /\bconsolidat/)) triggers.push('CARD_CONSOLIDATED');
  if(matches(text, /\bactivate .*effect\b|\bactivate the effect\b/)) triggers.push('EFFECT_ACTIVATED');
  if(matches(text, /\bnegate or suppress\b/)) triggers.push('EFFECT_NEGATED_OR_SUPPRESSED');
  if(matches(text, /\bturn\b|\bdraw phase\b/)) triggers.push('TURN_ADVANCED');
  return unique(triggers);
}

function cardModifiers(text){
  const modifiers = [];
  if(matches(text, /\badjacent\b|\bdiagonal\b/)) modifiers.push('ADJACENCY_QUERY');
  if(matches(text, /\bthis zone\b|\bzone's total fate\b/)) modifiers.push('ZONE_QUERY');
  if(matches(text, /\bwhile .*on the field\b|\ball .* gain\b|\ball .* lose\b/)) modifiers.push('CONTINUOUS_AURA');
  if(matches(text, /\breinforcement\b|\bcosts? \d+ (?:less|more)\b|\bno cost\b|\bhas no cost\b/)) modifiers.push('CONSOLIDATION_COST_OR_VALUE');
  if(matches(text, /\bcannot set\b|\bcan only be set\b|\bextra supporter\b|\bset limit\b/)) modifiers.push('PLACEMENT_PERMISSION_OR_LIMIT');
  if(matches(text, /\bcannot .*consolidat|\bused for consolidation\b|\buses characters for its consolidation\b/)) modifiers.push('CONSOLIDATION_PERMISSION');
  if(matches(text, /\bimmune\b|\bnegate\b|\bsuppress\b|\beffect blocked\b/)) modifiers.push('EFFECT_PERMISSION');
  if(matches(text, /\bhand from exceeding\b|\bhand limit\b/)) modifiers.push('HAND_LIMIT');
  if(matches(text, /\balways appear in your opening hand\b/)) modifiers.push('OPENING_HAND_CONSTRUCTION');
  if(matches(text, /\bonly character card you can control\b|\bonly one copy\b/)) modifiers.push('CONTROL_OR_UNIQUENESS_LIMIT');
  if(matches(text, /\bface down\b|\bflip .* face up\b/)) modifiers.push('CARD_VISIBILITY');
  if(matches(text, /\bfate is equal\b|\bgains? \d+ fate for each\b/)) modifiers.push('DERIVED_FATE');
  return unique(modifiers);
}

function cardFamilies(operations, modifiers, triggers){
  const families = [];
  if(operations.includes('DRAW_CARD') || operations.includes('SEARCH_DECK')) families.push('DRAW_AND_SEARCH');
  if(operations.includes('MODIFY_FATE') || operations.includes('SET_FATE') || modifiers.includes('DERIVED_FATE')) families.push('FATE_MODIFICATION');
  if(operations.includes('MOVE_CARD')) families.push('MOVEMENT');
  if(operations.includes('DISCARD_CARD') || operations.includes('TRANSFER_CARD')) families.push('DISCARD_REMOVAL_AND_TRANSFER');
  if(operations.includes('CREATE_STATUS') || modifiers.includes('EFFECT_PERMISSION')) families.push('STATUS_AND_IMMUNITY');
  if(modifiers.includes('CONTINUOUS_AURA')) families.push('CONTINUOUS_MODIFIERS');
  if(triggers.includes('CARD_SET')) families.push('PLACEMENT_EFFECTS');
  if(triggers.includes('EFFECT_ACTIVATED') || triggers.includes('EFFECT_NEGATED_OR_SUPPRESSED')) families.push('REACTIONS');
  if(operations.includes('MODIFY_BOARD_GEOMETRY')) families.push('BOARD_GEOMETRY');
  if(operations.includes('CREATE_CARD_INSTANCE')) families.push('TOKENS_AND_DYNAMIC_INSTANCES');
  if(families.length === 0) families.push('CUSTOM_RULE');
  return unique(families);
}

function ambiguityFlags(text){
  const flags = [];
  if(matches(text, /\brandom\b/)) flags.push('RNG_SELECTION_AND_TIMING');
  if(matches(text, /\bup to\b/)) flags.push('ZERO_SELECTION_AND_CANCELLATION');
  if(matches(text, /\badjacent\b/) && !matches(text, /\badjacent or diagonal\b/)) flags.push('ADJACENCY_DEFINITION');
  if(matches(text, /\bfor the next \w+ turns?\b|\bnext turn\b|\bstay.*turns?\b|\bexpires\b/)) flags.push('DURATION_BOUNDARY');
  if(matches(text, /\bat any time\b|\bwhenever .*would\b|\bnext time you would\b/)) flags.push('REACTION_WINDOW_ORDER');
  if(matches(text, /\bcopy the effect\b/)) flags.push('COPY_SNAPSHOT_VS_LIVE_RULE');
  if(matches(text, /\btotal fate\b|\bcurrent fate\b|\bfate is equal\b/)) flags.push('BASE_VS_EFFECTIVE_FATE');
  if(matches(text, /\bany card type\b|\bclassified as characters\b|\bbecome any card type\b/)) flags.push('TYPE_CHANGE_RULE_INTERACTIONS');
  if(matches(text, /\bface down\b/)) flags.push('FACE_DOWN_INFORMATION_AND_EFFECTS');
  return unique(flags);
}

export function classifyCardCoverage(card){
  const text = String(card?.effect || '').toLowerCase();
  const operations = cardOperations(text);
  const modifiers = cardModifiers(text);
  const triggers = cardTriggers(text);
  const prototypeRule = cardRule(card?.id);
  return {
    cardId:String(card?.id || ''),
    name:String(card?.name || ''),
    type:String(card?.type || ''),
    affiliation:String(card?.aff || ''),
    abilityText:String(card?.effect || ''),
    abilityTiming:cardTimings(text),
    effectFamilies:cardFamilies(operations, modifiers, triggers),
    operations,
    promptTypes:cardPrompts(text),
    triggerSubscriptions:triggers,
    modifiers,
    customHandler:`legacy-card:${String(card?.id || '')}`,
    coverageDeclaration:'phase-0-classified',
    implementationStatus:prototypeRule ? 'isolated-v3-prototype' : 'not-ported',
    parityFixtures:[],
    multiplayerEligibility:prototypeRule ? 'isolated-v3-test-only' : 'unsupported-until-ported',
    ambiguityFlags:ambiguityFlags(text)
  };
}

export function classifyLandscapeCoverage(landscape){
  const text = String(landscape?.description || '').toLowerCase();
  const operations = [];
  const modifiers = [];
  const triggers = [];
  const prompts = [];
  if(matches(text, /\bgains? \d+ fate\b|\bfate in any zone\b/)) operations.push('MODIFY_FATE');
  if(matches(text, /\bextra row\b/)) operations.push('MODIFY_BOARD_GEOMETRY');
  if(matches(text, /\bdiscarded\b|\bdiscard\b/)) operations.push('DISCARD_CARD');
  if(matches(text, /\bmove\b/)) operations.push('MOVE_CARD');
  if(matches(text, /\bdraw\b/)) operations.push('DRAW_CARD');
  if(matches(text, /\bhand.*revealed\b/)) operations.push('REVEAL_HAND');
  if(matches(text, /\brandom zone\b/)) operations.push('DETERMINISTIC_RANDOM');
  if(matches(text, /\bzone\b/)) modifiers.push('ZONE_QUERY');
  if(matches(text, /\breinforcement\b/)) modifiers.push('CONSOLIDATION_COST_OR_VALUE');
  if(matches(text, /\bgain \d+ fate\b|\ball .* gain\b/)) modifiers.push('CONTINUOUS_FATE_MODIFIER');
  if(matches(text, /\bcannot\b|\bskipped\b|\bonly\b/)) modifiers.push('RULE_PERMISSION_OR_LIMIT');
  if(matches(text, /\bhand\b/)) modifiers.push('HAND_INFORMATION_OR_LIMIT');
  if(matches(text, /\bturn \d+\b|\bevery .*turn\b|\bend of .*turn\b|\bdraw phase\b/)) triggers.push('TURN_ADVANCED');
  if(matches(text, /\bconsolidat/)) triggers.push('CARD_CONSOLIDATED');
  if(matches(text, /\bset\b/)) triggers.push('CARD_SET');
  if(matches(text, /\bdraw\b/)) triggers.push('CARD_DRAWN');
  if(matches(text, /\bdiscard\b/)) triggers.push('CARD_DISCARDED');
  if(matches(text, /\bany zone they choose\b/)) prompts.push('ZONE_SELECTION');
  if(matches(text, /\bselect any card\b/)) prompts.push('CARD_SELECTION');
  const prototypeRule = landscapeRule(landscape?.id);
  return {
    landscapeId:String(landscape?.id || ''),
    name:String(landscape?.name || ''),
    description:String(landscape?.description || ''),
    abilityTiming:unique(triggers.length ? triggers : ['CONTINUOUS_OR_SETUP']),
    effectFamilies:unique([
      operations.includes('MODIFY_FATE') ? 'FATE_MODIFICATION' : '',
      operations.includes('MODIFY_BOARD_GEOMETRY') ? 'BOARD_GEOMETRY' : '',
      operations.includes('MOVE_CARD') ? 'MOVEMENT' : '',
      operations.includes('DRAW_CARD') ? 'DRAW_AND_SEARCH' : '',
      operations.includes('DISCARD_CARD') ? 'DISCARD_AND_REMOVAL' : '',
      operations.includes('REVEAL_HAND') ? 'HIDDEN_INFORMATION' : '',
      operations.includes('DETERMINISTIC_RANDOM') ? 'DETERMINISTIC_RANDOMNESS' : '',
      modifiers.length ? 'CONTINUOUS_MODIFIERS' : '',
      operations.length === 0 && modifiers.length === 0 ? 'NO_EFFECT' : '',
      operations.length > 0 && modifiers.length === 0 ? 'CUSTOM_LANDSCAPE_RESOLUTION' : ''
    ]),
    operations:unique(operations),
    promptTypes:unique(prompts),
    triggerSubscriptions:unique(triggers),
    modifiers:unique(modifiers),
    customHandler:`legacy-landscape:${String(landscape?.id || '')}`,
    coverageDeclaration:'phase-0-classified',
    implementationStatus:prototypeRule ? 'isolated-v3-prototype' : 'not-ported',
    parityFixtures:[],
    multiplayerEligibility:prototypeRule ? 'isolated-v3-test-only' : 'unsupported-until-ported',
    ambiguityFlags:unique([
      matches(text, /\brandom\b/) ? 'RNG_SELECTION_AND_TIMING' : '',
      matches(text, /\bturn \d+\b|\bevery .*turn\b/) ? 'TURN_BOUNDARY' : '',
      matches(text, /\bwhichever player\b/) ? 'TIE_BEHAVIOR' : '',
      matches(text, /\bany zone they choose\b/) ? 'CHOICE_TIMING' : ''
    ])
  };
}
