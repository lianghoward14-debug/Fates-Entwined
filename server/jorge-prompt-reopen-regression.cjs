const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8'),ui=fs.readFileSync('src/scripts/06-rendering-and-helpers.js','utf8'),support=fs.readFileSync('src/scripts/support-company.mjs','utf8');
function extract(text,name){const start=text.indexOf('function '+name+'(');assert(start>=0);const end=text.indexOf('\n}',start);if(text===online){const next=text.indexOf('\n  function ',start+10);return text.slice(start,next);}return text.slice(start,end+2);}
let opens=0,actions=[],selected=0,visible=false,picker={dataset:{}};
const modal={classList:{contains:()=>visible},querySelector:selector=>selector.startsWith('[data-phase7-prompt-id=')?(picker.dataset.phase7PromptId===selector.split('"')[1]?picker:null):selector==='.jorge-declaration'?picker:null};
const box={window:{},document:{getElementById:()=>modal,querySelector:selector=>selector==='.sc-category-window'?picker:null,querySelectorAll:()=>[]},
 phase7CurrentUiSession:{pickerKey:''},phase7RecordPresentationStage:()=>{},phase7FindAnyCard:()=>({id:'105'}),
 withOnlinePromptBypass:(_state,fn)=>fn(),gameState:()=>({}),phase7SubmitCommand:()=>{selected++;},
 closeModal:opts=>{if(modal._mandatoryCardChoice&&!opts?.cardChoiceResolved)return false;visible=false;delete modal._mandatoryCardChoice;},
 showModal:(_title,_body,list,opts)=>{opens++;visible=true;picker={dataset:{}};actions=list;opts?.onOpen?.();},
 SUPPORT_COMPANY_CATEGORIES:[],SUPPORT_COMPANY_NAMES:{call:'Call to Arms'},categoryIcon:()=>'',escape:s=>s};
box.window.closeModal=box.closeModal;vm.createContext(box);
vm.runInContext(extract(ui,'showJorgeTypeDeclarationPicker'),box);box.window.showJorgeTypeDeclarationPicker=box.showJorgeTypeDeclarationPicker;
const start=support.indexOf('window.showSupportCompanyCategoryWindow ='),end=support.indexOf('\nwindow.openSupportCompany',start);vm.runInContext(support.slice(start,end),box);
vm.runInContext(extract(online,'phase7PromptModalMatches')+'\n'+extract(online,'phase7OpenOptionPrompt'),box);
const types=['Initiator','Improvisor','Coordinator','Dauntless'];
const commands=types.map(choice=>({type:'ANSWER_PROMPT',payload:{choice}})).concat({type:'ANSWER_PROMPT',payload:{cancel:true}});
box.phase7CommandLabel=command=>command.payload.cancel?'Cancel':command.payload.choice;
for(const kind of ['jorge','support']){
 visible=false;box.phase7CurrentUiSession.pickerKey='';const before=opens;
 const prompt={promptId:kind,type:'MODAL_CHOICE',sourceIid:'source',title:kind==='support'?'Call to Arms':'Jorge',options:types.map(value=>({value,label:value}))};
 box.phase7OpenOptionPrompt('prompt:'+kind,prompt,commands);
 for(let i=0;i<30;i++)box.phase7OpenOptionPrompt('prompt:'+kind,prompt,commands);
 assert.equal(opens,before+1,kind+' must open/play sound only once across repeated checks');
 if(kind==='jorge'){
  assert.deepEqual(Array.from(actions,a=>a.label),types);box.closeModal();assert.equal(visible,true,'Mandatory declaration cannot be dismissed');
  actions[0].action();assert.equal(selected,1);assert.equal(visible,false);
 }
}
// Legacy single-player uses the same mandatory four-choice window.
box.showJorgeTypeDeclarationPicker(types.map(label=>({label,action:()=>selected++})).concat({label:'Cancel',action:()=>{throw Error('cancel');}}));
assert.equal(actions.length,4);actions[1].action();assert.equal(selected,2);
console.log('PASS Jorge and Call to Arms prompts remain open through 30 refreshes; Jorge has four mandatory choices in shared and legacy flows.');

// Multiplayer Anne filters stale cancel commands as well as new mandatory prompts.
box.phase7FindAnyCard=()=>({id:'107'});box.phase7CurrentUiSession.pickerKey='';visible=false;
let anneActions=[];box.window.showAnneActionDeclarationPicker=list=>{anneActions=list;};
const anneOptions=['DRAW','SEARCH','FATE','MOVEMENT','STATUS','MORALE'];
box.phase7OpenOptionPrompt('prompt:anne',{promptId:'anne',type:'MODAL_CHOICE',sourceIid:'anne',options:anneOptions.map(value=>({value,label:value}))},anneOptions.map(choice=>({type:'ANSWER_PROMPT',payload:{choice}})).concat({type:'ANSWER_PROMPT',payload:{cancel:true}}));
assert.equal(anneActions.length,6);assert(!anneActions.some(action=>action.label==='Cancel'));
console.log('PASS multiplayer Anne has six declarations and no Cancel button.');
