const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const gameplay=fs.readFileSync('src/scripts/05-gameplay-core.js','utf8');
const online=fs.readFileSync('src/scripts/18-online-rooms.js','utf8');
function extract(source,name,indent=''){
 const start=source.indexOf('function '+name+'(');assert(start>=0,name);
 return source.slice(start,source.indexOf('\n'+indent+'}',start)+indent.length+2);
}
let opens=0,submitted=null;
const panel={dataset:{}},nodes={};
for(const id of ['sangre-pay-slider','sangre-pay-value','sangre-draw-count','sangre-remaining','sangre-pay-minus','sangre-pay-plus'])nodes[id]={value:'15',addEventListener(){},closest:()=>panel};
const modal={classList:{contains:()=>true},querySelector:selector=>selector===`[data-phase7-prompt-id="${panel.dataset.phase7PromptId}"]`?panel:null};
const c={window:{},G:{_moralePressure:{morale:[200,200]}},phase7CurrentUiSession:{pickerKey:''},document:{getElementById:id=>id==='modal'?modal:nodes[id],querySelector:()=>null},phase7FindAnyCard:()=>({id:'103'}),phase7RecordPresentationStage(){},gameState:()=>c.G,withOnlinePromptBypass:(g,fn)=>fn(),showModal:(title,body,acts,options)=>{opens++;panel.dataset={};options.onOpen();},closeModal(){},toast(){},phase7SubmitCommand:cmd=>{submitted=cmd;}};
vm.createContext(c);
vm.runInContext(extract(gameplay,'showSangrePorVictoriaMoralePicker')+'\nwindow.showSangrePorVictoriaMoralePicker=showSangrePorVictoriaMoralePicker;\n'+extract(online,'phase7PromptModalMatches','  ')+'\n'+extract(online,'phase7OpenOptionPrompt','  '),c);
const prompt={promptId:'payment-1',type:'MODAL_CHOICE',semanticSourceCardId:'103',local:'moralePayment',playerIndex:0,options:[{value:'0'},{value:'15'},{value:'150'}]};
const commands=prompt.options.map(option=>({type:'ANSWER_PROMPT',payload:{promptId:prompt.promptId,choice:option.value}}));
c.phase7OpenOptionPrompt('prompt:payment-1',prompt,commands);
assert.equal(panel.dataset.phase7PromptId,'payment-1');
nodes['sangre-pay-slider'].value='150';
for(let n=0;n<30;n++){
 assert(c.phase7PromptModalMatches({...prompt}),'recovery guard recognizes the existing payment panel');
 c.phase7OpenOptionPrompt('prompt:payment-1',{...prompt},commands);
}
assert.equal(opens,1,'refreshes must not reopen the modal or replay its sound');
assert.equal(nodes['sangre-pay-slider'].value,'150','player selection survives repeated snapshots');
const next={...prompt,promptId:'payment-2'};
assert.equal(c.phase7PromptModalMatches(next),false,'another payment must not reuse the previous prompt');
c.phase7OpenOptionPrompt('prompt:payment-2',next,commands);
assert.equal(opens,2);assert.equal(nodes['sangre-pay-slider'].value,'15');
console.log('Santiago multiplayer: 30 repeated updates preserve slider and open once; a new payment opens afresh.');
