import assert from 'node:assert/strict';
import {scoreStrategicV3AiCommand} from '../../src/scripts/authoritative-v3-ai-policy.mjs';

function card(iid, id, fate, effect = ''){
  return {iid,id,name:`Card ${id}`,type:'Supporter',affiliation:'reality',fate,currentFate:fate,effect,owner:1,controller:1};
}

const normal = card('normal','01',1);
const healer = card('healer','33',1,'When set, recover 16 Morale');
const finisher = card('finisher','47',1,'When set, inflict 10 Morale Damage to your opponent');
const costly = {...card('costly','45',12,'When set, Pay 50 Morale and discard any card on the field'),type:'Dauntless'};
const projection = {
  activePlayer:1,
  turn:6,
  maxTurns:24,
  landscapeId:'igb2',
  gameSettings:{healthPressureSeals:true,pressureCardReworks:true},
  moralePressure:{maxMorale:100,morale:[8,35],shields:[0,0],pressure:[0,0]},
  baseSupportersPerTurn:1,
  extraSupportersThisTurn:[0,0],
  supportersSetThisTurn:[0,0],
  geometry:{rowOwners:[[1,-1,0],[1,-1,0],[1,-1,0]]},
  players:[
    {handCount:0,discard:[]},
    {hand:[normal,healer,finisher,costly],discard:[]}
  ],
  board:[
    [
      [{...card('enemy-a','e1',8),owner:0,controller:0}],
      [null],
      [{...card('own-a','o1',2)}]
    ],
    [
      [{...card('enemy-b','e2',2),owner:0,controller:0}],
      [null],
      [{...card('own-b','o2',10)}]
    ],
    [
      [null],
      [null],
      [null]
    ]
  ]
};

const set = (iid, z)=>({type:'SET_CARD',payload:{cardIid:iid,destination:{z,r:1,c:0}}});
const context = {playerIndex:1,style:'cautious'};
const defend = scoreStrategicV3AiCommand(set('normal',0),projection,context);
const pad = scoreStrategicV3AiCommand(set('normal',1),projection,context);
const disabled = structuredClone(projection);
disabled.gameSettings.healthPressureSeals = false;
disabled.moralePressure = null;
const disabledDefend = scoreStrategicV3AiCommand(set('normal',0),disabled,context);
const disabledPad = scoreStrategicV3AiCommand(set('normal',1),disabled,context);
assert(defend-pad > disabledDefend-disabledPad, 'active Morale must add urgency to reducing an incoming zone deficit');
assert(
  scoreStrategicV3AiCommand(set('healer',0),projection,context) > defend,
  'authoritative AI must value recovery while its own Morale is low'
);
assert(
  scoreStrategicV3AiCommand(set('finisher',0),projection,{playerIndex:1,style:'aggro'}) > defend+300,
  'authoritative aggressive AI must recognize direct lethal Morale damage'
);
assert(
  scoreStrategicV3AiCommand(set('costly',0),projection,context) < defend,
  'AI must reject a morale cost that would defeat its own side'
);

console.log('authoritative v3 morale AI policy smoke test passed.');
