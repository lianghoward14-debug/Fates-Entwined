const fs=require('fs');
function edit(file,fn){const old=fs.readFileSync(file,'utf8');fs.writeFileSync(file,fn(old));}
function replace(s,a,b){if(!s.includes(a))throw Error('Missing '+a.slice(0,100));return s.replace(a,b);}
edit('shared/engine/operations.mjs',s=>replace(s,"  if(type === 'PERMANENT_FATE_GAIN_POTENCY'){",`  if(type === 'MERCHANT_DRAW_DENIAL'){
    const existing=ctx.state.statuses.filter(status=>status.type===type && Number(status.playerIndex)===playerIndex);
    const remaining=existing.reduce((sum,status)=>sum+Math.max(0,Number(status.remainingDrawPhases)||0),0);
    const status={...input,type,sourceIid,playerIndex,statusId:'rule:merchant_draw_denial:p'+playerIndex,
      remainingDrawPhases:remaining+Math.max(0,Number(input.remainingDrawPhases)||0)};
    ctx.state.statuses=ctx.state.statuses.filter(status=>!existing.includes(status));
    ctx.state.statuses.push(status);
    ctx.events.push({type:'STATUS_CREATED',status:JSON.parse(JSON.stringify(status)),stacked:remaining>0});
    return {statusId:status.statusId};
  }
  if(type === 'PERMANENT_FATE_GAIN_POTENCY'){`));
edit('shared/engine/reducer.mjs',s=>replace(replace(s,'for(const status of merchantDenials)status.remainingDrawPhases--;','if(merchantDrawSkipped)merchantDenials[0].remainingDrawPhases--;'),"reason:merchantDrawSkipped ? 'MERCHANT_DRAW_DENIAL'", "remainingDrawPhases:merchantDenials.reduce((sum,status)=>sum+Math.max(0,status.remainingDrawPhases),0),\n      reason:merchantDrawSkipped ? 'MERCHANT_DRAW_DENIAL'"));
edit('src/scripts/05-gameplay-core.js',s=>replace(replace(s,'G.players[cp]._merchantDrawPhases=3;','G.players[cp]._merchantDrawPhases=(Number(G.players[cp]._merchantDrawPhases)||0)+3;'),'G.players[currentPlayer]._merchantDrawPhases--;','G.players[currentPlayer]._merchantDrawPhases--;\n    window.showMerchantDrawSkippedBanner?.(currentPlayer);'));
edit('src/scripts/06-rendering-and-helpers.js',s=>replace(replace(s,'Math.max(...canonical.map(s=>Number(s.remainingDrawPhases)||0))','canonical.reduce((sum,s)=>sum+Math.max(0,Number(s.remainingDrawPhases)||0),0)'), 'function getMerchantStatusBanners(g){',`function showMerchantDrawSkippedBanner(playerIndex){
  const viewer=typeof getPerspectivePlayerIndex==='function'?getPerspectivePlayerIndex():0;
  if(Number(playerIndex)!==Number(viewer))return;
  const t=text=>window.FateI18n?.t(text)||text;
  let banner=document.getElementById('merchant-draw-skipped-banner');
  if(!banner){
    banner=document.createElement('div');banner.id='merchant-draw-skipped-banner';
    banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
    banner.appendChild(document.createElement('strong'));banner.appendChild(document.createElement('span'));
    document.body.appendChild(banner);
  }
  banner.children[0].textContent=t('Havano Merchant')+' — '+t('Art of the Deal');
  banner.children[1].textContent=t('Your Draw Phase draw was skipped by Art of the Deal.');
  clearTimeout(banner._hideTimer);banner.classList.add('on');
  banner._hideTimer=setTimeout(()=>banner.classList.remove('on'),4800);
}
window.showMerchantDrawSkippedBanner=showMerchantDrawSkippedBanner;
function getMerchantStatusBanners(g){`));
edit('src/scripts/18-online-rooms.js',s=>replace(replace(s,"      if(type === 'LANDSCAPE_RESOLUTION_STARTED'){",`      if(type === 'DRAW_PHASE_SKIPPED' && event.reason === 'MERCHANT_DRAW_DENIAL'){
        window.showMerchantDrawSkippedBanner?.(event.playerIndex);
        return;
      }
      if(type === 'LANDSCAPE_RESOLUTION_STARTED'){`),'g._phase7CurrentMultiplayer = true;','g._phase7CurrentMultiplayer = true;\n    g._devRewardsDisabled = false;'));
edit('src/scripts/authoritative-v3-single-player-screen.mjs',s=>replace(s,"      if(type === 'EFFECT_ACTIVATED' || type === 'EFFECT_REACTED'){",`      if(type === 'DRAW_PHASE_SKIPPED' && event.reason === 'MERCHANT_DRAW_DENIAL'){
        this.window.showMerchantDrawSkippedBanner?.(event.playerIndex);
      }
      if(type === 'EFFECT_ACTIVATED' || type === 'EFFECT_REACTED'){`));
edit('src/scripts/47-challenger-war-event.js',s=>replace(s,'function rewardOnce(r){','function rewardOnce(r){\n  if(window.isFateDevRewardBlocked?.())return null;'));
edit('src/scripts/51-saboteur-clouds.js',s=>{
 s=replace(s,",lastGame=null",'');
 s=replace(s," function measure(){",` function boardSurface(){
  if(window.FateMatchRendererAdapter?.ownsBoard?.()){
   return document.getElementById('fate-match-v2-canvas')?.parentElement || document.getElementById('codex-board-v19') || document.getElementById('board');
  }
  return document.getElementById('board');
 }
 function measure(){`);
 s=s.replaceAll("const board=document.getElementById('board');if(!board||!canvas)return;","const board=boardSurface();if(!board||!canvas)return;");
 s=replace(s,"const g=typeof G==='undefined'?null:G,board=document.getElementById('board');","const g=typeof G==='undefined'?null:G,board=boardSurface();");
 s=s.replace(/  if\(g!==lastGame\)\{remove\(\);key='';lastGame=g;\}\r?\n/,'');
 return replace(s,'z-index:30;','z-index:405;');
});
edit('src/styles/zz-codex-last.css',s=>{
 s=s.replaceAll('html body #supporter-hard-cap-banner{','html body #merchant-draw-skipped-banner,\nhtml body #supporter-hard-cap-banner{').replaceAll('html body #supporter-hard-cap-banner.on{','html body #merchant-draw-skipped-banner.on,\nhtml body #supporter-hard-cap-banner.on{').replaceAll('html body #supporter-hard-cap-banner strong{','html body #merchant-draw-skipped-banner strong,\nhtml body #supporter-hard-cap-banner strong{').replaceAll('html body #supporter-hard-cap-banner span{','html body #merchant-draw-skipped-banner span,\nhtml body #supporter-hard-cap-banner span{');
 const pos=s.indexOf('html body .status-overflow-banner .status-overflow-dropdown-icon svg.merchant-bargain-icon');
 return s.slice(0,pos)+s.slice(pos).replaceAll('28px','27px');
});
edit('src/scripts/53-caribbea-translations.js',s=>replace(s,'const rows=[',`const rows=[
["Your Draw Phase draw was skipped by Art of the Deal.","「取引の極意」により、このドローフェイズのドローはスキップされた。","由于“交易的艺术”的效果，你本次抽牌阶段的抽牌被跳过。"],`));
edit('index.html',s=>s.replace(/((?:51-saboteur-clouds\.js|06-rendering-and-helpers\.js|18-online-rooms\.js|53-caribbea-translations\.js|zz-codex-last\.css)\?v=)[^"']+/g,'$120261024-merchant-mist'));
