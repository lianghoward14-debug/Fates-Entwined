const fs=require('fs');function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8')))}
edit('src/scripts/01-data-and-state.js',s=>s.replace("{id:'103',pfpId:128,name:","{id:'103',pfpId:128,cinematicPortrait:'pfp/card-103-portrait.png?v=20261023',name:").replace("fate:2,cost:2,rarity:'triangle',effectClass:'DISCARD_HIGH_FATE_CALL_TO_ARMS'","fate:2,cost:1,rarity:'triangle',effectClass:'PAY_MORALE_DRAW'").replace('Discard all cards on your side of the field with 7 or more Fate, then trigger a Call to Arms.','Pay Morale in increments of 15. For every 15 Morale paid, draw 1 card.').replace("img:'103.png'","img:'103.png?v=20261023'"));
edit('shared/engine/cards/registry.mjs',s=>s.replace("timings:['WHEN_SET'],effectLabels:['DISCARD_HIGH_FATE_CALL_TO_ARMS'],operations:['DISCARD_CARD'],prompts:['MODAL_CHOICE','CARD_SELECTION'],\n    program:[{kind:'SANTIAGO_CALL_COST'},{kind:'SELECT_HOPLITE_CALL',local:'callCardId',unconditional:true},{kind:'RESOLVE_HOPLITE_CALL',cardId:'$callCardId'}]","timings:['WHEN_SET'],effectLabels:['PAY_MORALE_DRAW'],operations:['MODIFY_MORALE','DRAW_CARD'],prompts:['MODAL_CHOICE'],\n    program:[{kind:'CHOOSE_OPTION',local:'moralePayment',moralePaymentStep:15,defaultChoice:'0'},{kind:'SANTIAGO_MORALE_DRAW'}]"));
edit('shared/engine/reducer.mjs',s=>s.replace("    if(instruction.maxByControllerMorale===true){",`    if(instruction.moralePaymentStep){
      const maximum=Math.floor(Math.max(0,Number(state.moralePressure?.morale?.[frame.controller])||0)/15);
      options=Array.from({length:maximum+1},(_,i)=>({value:String(i*15),label:i?'Pay '+(i*15)+' Morale — Draw '+i:'Do not pay'}));
    }
    if(instruction.maxByControllerMorale===true){`).replace("      local:instruction.local,\n      cancellable:instruction.cancellable !== false,","      local:instruction.local,\n      ...(instruction.moralePaymentStep?{title:'Sangre Por Victoria',moralePaymentStep:15}:{}),\n      cancellable:instruction.cancellable !== false,").replace("    if(instruction.kind === 'SANTIAGO_CALL_COST'){",`    if(instruction.kind === 'SANTIAGO_MORALE_DRAW'){
      const amount=Number(frame.locals.moralePayment||0),before=Math.max(0,Number(state.moralePressure?.morale?.[frame.controller])||0);
      if(!Number.isInteger(amount)||amount<0||amount%15||amount>before)throw Object.assign(new Error('Invalid Morale payment'),{code:'INVALID_CHOICE'});
      if(amount){
        applyOperation(ctx,{type:'MODIFY_MORALE',playerIndex:frame.controller,amount:-amount,sourceIid:frame.sourceIid,sourceController:frame.controller,reason:'SANGRE_POR_VICTORIA_COST'});
        const paid=Math.max(0,before-Number(state.moralePressure?.morale?.[frame.controller]));
        if(paid>=15)applyOperation(ctx,{type:'DRAW_CARD',playerIndex:frame.controller,count:Math.floor(paid/15),activatedEffect:true,sourceIid:frame.sourceIid,sourceController:frame.controller});
      }
      frame.instructionIndex++;continue;
    }
    if(instruction.kind === 'SANTIAGO_CALL_COST'){`));
edit('src/scripts/05-gameplay-core.js',s=>s.replace('function showSangrePorVictoriaMoralePicker(player,onConfirm,onCancel){','function showSangrePorVictoriaMoralePicker(player,onConfirm,onCancel,options={}){').replace('const maximum=Math.floor(current/15)*15;','const maximum=Math.min(Math.floor(current/15)*15,options.maximum ?? Infinity);').replace('<img src="103.png"','<img src="pfp/card-103-portrait.png?v=20261023"').replace("const amount=Math.max(15,Math.min(maximum,Number(slider?.value)||15));","const amount=Math.max(15,Math.min(maximum,Math.floor(Number(slider?.value)/15)*15||15));").replace("    case '103': {\n      const targets=[];\n      forEachBoardCard(function(target,tz,tr,tc){if(Number(target.owner)===Number(cp)&&getEffectiveFate(target,tz)>=7)targets.push({card:target,z:tz,r:tr,c:tc});});\n      for(const target of targets)discardBoardCard(target.card,target.z,target.r,target.c);\n      if(typeof window.resolveHopliteCallToArms==='function')await window.resolveHopliteCallToArms(card,cp);\n      markInitialEffectResolved(card);\n      break;\n    }",`    case '103': {
      const current=Math.max(0,Number(G._moralePressure?.morale?.[cp])||0);
      const amount=G.aiEnabled && cp===G.aiPlayer
        ? Math.min(45,Math.floor(Math.max(0,current-30)/15)*15,G.players[cp].deck.length*15)
        : await new Promise(resolve=>showSangrePorVictoriaMoralePicker(cp,resolve,()=>resolve(0)));
      if(amount>0 && amount<=Number(G._moralePressure?.morale?.[cp])){
        const before=G._moralePressure.morale[cp];
        G._moralePressure.morale[cp]-=amount;
        window.presentLegacyMoraleDelta?.({playerIndex:cp,before,after:G._moralePressure.morale[cp],sourceIid:card.iid,semanticSourceCardId:'103',reason:'SANGRE_POR_VICTORIA_COST'});
        await drawCard(cp,amount/15,{afterSetOrCinematic:true,activatedDrawEffect:true,effectSource:card});
      }
      markInitialEffectResolved(card);
      break;
    }`));
edit('src/scripts/18-online-rooms.js',s=>s.replace("    if(prompt?.type==='MODAL_CHOICE' && prompt.title==='Call to Arms'",`    if(prompt?.type==='MODAL_CHOICE' && sourceId==='103' && prompt.local==='moralePayment' && typeof window.showSangrePorVictoriaMoralePicker==='function'){
      withOnlinePromptBypass(gameState(),function(){
        window.showSangrePorVictoriaMoralePicker(prompt.playerIndex,amount=>submitChoice(String(amount),'choice'),()=>submitChoice('0','choice'),{maximum:Math.max(...prompt.options.map(option=>Number(option.value)))});
      });
      return;
    }
    if(prompt?.type==='MODAL_CHOICE' && prompt.title==='Call to Arms'`));
edit('src/scripts/06-rendering-and-helpers.js',s=>s.replace('  const refreshedArtVersions=',"  if(/^103\\.png(?:[?#]|$)/.test(String(src||'')))src='103.png?v=20261023';\n  const refreshedArtVersions="));
edit('index.html',s=>s.replace(/((?:01-data-and-state|05-gameplay-core|06-rendering-and-helpers|18-online-rooms|53-caribbea-translations)\.js)\?v=[^"']+/g,'$1?v=20261023-santiago'));
