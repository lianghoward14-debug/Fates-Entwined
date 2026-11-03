const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
function extract(file,name){
  const source=fs.readFileSync(path.join(__dirname,'..','src/scripts',file),'utf8');
  const match=new RegExp('^([ \\t]*)(?:async )?function '+name+'\\(', 'm').exec(source);
  assert.ok(match,name);
  const tail=source.slice(match.index);
  const end=tail.indexOf('\n'+match[1]+'}');
  assert.ok(end>0,name+' end');
  return tail.slice(0,end+match[1].length+2);
}
(async()=>{
  let opened=0;
  const context=vm.createContext({window:{openTutorialCourse(){opened++;}},console});
  vm.runInContext(extract('03-profile-and-progression.js','handleFateChatCommand'),context);
  context.window.handleFateChatCommand=context.handleFateChatCommand;
  assert.equal(context.handleFateChatCommand(' /TuToRiAl '),true);
  assert.equal(opened,1);
  assert.equal(context.handleFateChatCommand('ordinary chat'),false);
  const cases=[
    ['09-challenger-mode.js','sendWorldChat','wc-input'],
    ['09-challenger-mode.js','sendWorldChat','sp-wc-input'],
    ['09-challenger-mode.js','sendInGameChat','igc-input'],
    ['09-challenger-v2.js','sendWorldChat','wc-input'],
    ['09-challenger-v2.js','sendInGameChat','igc-input'],
    ['17-online-social.js','sendWorldChatOnline','wc-input'],
    ['17-online-social.js','sendWorldChatOnline','sp-wc-input'],
    ['18-online-rooms.js','sendRoomChat','online-room-chat-input'],
    ['22-spectator.js','sendSpectatorChat',null]
  ];
  for(const [file,name,id] of cases){
    const input={value:'/tutorial'};
    context.document={getElementById:key=>key===id?input:null};
    vm.runInContext(extract(file,name),context);
    const before=opened;
    await context[name](name==='sendSpectatorChat'?'/tutorial':undefined);
    assert.equal(opened,before+1,file+' '+name);
    if(id)assert.equal(input.value,'');
    // Sending dependencies are absent: attempting a network send fails the test.
  }
  console.log('Tutorial command: case/whitespace and 9 chat paths passed without sending.');
})().catch(error=>{console.error(error);process.exitCode=1;});
