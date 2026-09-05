(function(){
  'use strict';
  const ROOT='fate-codex-ui-v19';
  const LEGACY_SOURCE_SELECTOR='.topbar,.zscore,.game-layout,.game-left,.left-piles,#landscape-panel,#turn-hud,#morale-pressure-hud,#match-utility-panel,#actbar,.fm-action-console,.fm-field-console';
  const $=id=>document.getElementById(id);
  const invoke=(name,...args)=>typeof window[name]==='function'?window[name](...args):undefined;
  // Identical DOM writes still notify the game's observers and can invalidate
  // style/layout. Keep the polling cadence, but only publish actual changes.
  function setText(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value);}
  function setAttribute(node,key,value){if(node&&node.getAttribute(key)!==String(value))node.setAttribute(key,String(value));}
  const markup=`
    <div class="codex-v19-backdrop"></div>
    <header class="codex-v19-hud">
      <section class="codex-v19-player codex-v19-player-you">
        <div class="codex-v19-portrait" data-art="my-pic"></div>
        <div class="codex-v19-identity"><small>YOU</small><strong data-text="my-name">PLAYER</strong><div class="codex-v19-rank" data-html="my-stat"></div></div>
        <div class="codex-v19-morale" data-morale-panel="you"><span class="codex-v19-heart">♥</span><b data-morale="you">200</b><small>MORALE</small><i><u data-fill="you"></u></i></div>
        <button class="codex-v19-hand-button codex-v19-hand-you" data-hand-player="self" aria-label="View your hand"><svg viewBox="0 0 24 30" aria-hidden="true"><path d="M7 2h14v22H7z"/><path d="M3 6h4v20h12v3H3z"/><path d="M10 6h8M10 10h8"/></svg><b data-hand-count="self">0</b></button>
      </section>
      <div class="codex-v19-status codex-v19-status-you" data-status="you" aria-label="Your status effects"><span class="codex-v19-status-sigil"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3L55 16V43L32 61L9 43V16Z"/><path d="M32 13L45 21V38L32 49L19 38V21Z"/><path d="M32 19V43M23 31H41"/></svg><em>STATUS</em></span><b data-status-count>0</b></div>
      <section class="codex-v19-clock" aria-label="Match timer">
        <svg class="codex-v19-clock-frame" viewBox="0 0 410 110" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="codex-v19-clock-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#07101b"/>
              <stop offset="1" stop-color="#030a12"/>
            </linearGradient>
          </defs>
          <path class="codex-v19-clock-panel" d="M28 0H382L410 25V85L382 110H28L0 85V25Z"/>
          <path class="codex-v19-clock-inner" d="M34 8H376L399 29V81L376 102H34L11 81V29Z"/>
          <path class="codex-v19-clock-fin codex-v19-clock-fin-left" d="M7 55L26 39L21 72Z"/>
          <path class="codex-v19-clock-fin codex-v19-clock-fin-right" d="M396 58L378 43L382 75Z"/>
          <path class="codex-v19-clock-rule codex-v19-clock-rule-gold-top" d="M241 .75H367"/>
          <path class="codex-v19-clock-rule codex-v19-clock-rule-gold-bottom" d="M139 109.25H271"/>
        </svg>
        <div class="codex-v19-clock-face">
          <small data-text="turn-hud-turn">TURN 1 / 24</small>
          <strong data-text="turn-hud-timer">3:00</strong>
          <span data-text="turn-hud-player">YOUR TURN</span>
        </div>
      </section>
      <div class="codex-v19-status codex-v19-status-opp" data-status="opp" aria-label="Opponent status effects"><span class="codex-v19-status-sigil"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3L55 16V43L32 61L9 43V16Z"/><path d="M32 13L45 21V38L32 49L19 38V21Z"/><path d="M32 19V43M23 31H41"/></svg><em>STATUS</em></span><b data-status-count>0</b></div>
      <section class="codex-v19-player codex-v19-player-opp">
        <div class="codex-v19-morale" data-morale-panel="opp"><small>MORALE</small><b data-morale="opp">200</b><span class="codex-v19-heart">♥</span><i><u data-fill="opp"></u></i></div>
        <div class="codex-v19-identity"><small>YOUR OPPONENT</small><strong data-text="opp-name">OPPONENT</strong><div class="codex-v19-rank" data-html="opp-stat"></div></div>
        <div class="codex-v19-portrait" data-art="opp-pic"></div>
        <button class="codex-v19-hand-button codex-v19-hand-opp" data-hand-player="rival" aria-label="View opponent hand"><svg viewBox="0 0 24 30" aria-hidden="true"><path d="M7 2h14v22H7z"/><path d="M3 6h4v20h12v3H3z"/><path d="M10 6h8M10 10h8"/></svg><b data-hand-count="rival">0</b></button>
      </section>
    </header>
    <main class="codex-v19-field"><div id="codex-board-v19" data-renderer-surface="codex-v19"></div></main>
    <footer class="codex-v19-footer">
      <aside class="codex-v19-archive">
        <nav aria-label="Card piles">
          <button data-deck aria-label="View deck"><span class="codex-v19-archive-art" aria-hidden="true"><img src="back.png" alt=""></span><span class="codex-v19-archive-copy"><small>DECK</small><b data-text="my-deck-count">0</b></span></button>
          <button data-discard aria-label="View discard"><span class="codex-v19-archive-art" aria-hidden="true"><img src="back.png" alt=""></span><span class="codex-v19-archive-copy"><small>DISCARD</small><b data-text="my-discard-count">0</b></span></button>
        </nav>
      </aside>
      <div class="codex-v19-hand" data-hand></div>
      <aside class="codex-v19-command">
        <section class="codex-v19-landscape-banner"><div class="codex-v19-land" data-land></div></section>
        <section class="codex-v19-command-console">
          <button class="codex-v19-end" data-end aria-label="End turn" title="End turn"><em>END<br>TURN</em><small data-text="act-hint">SELECT A CARD</small><span aria-hidden="true">↻</span></button>
          <nav><button data-audio aria-label="Audio settings" title="Audio settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="M16 9c1 1 1 5 0 6M19 6c3 3 3 9 0 12"/></svg></button><button data-chat aria-label="Match chat" title="Match chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></svg></button><button data-quit>END MATCH</button><button data-stop-consolidate hidden>STOP CONSOLIDATION</button></nav>
        </section>
      </aside>
    </footer>
    <section class="codex-v19-popover" hidden></section>`;

  function copyText(root,key){
    const out=root.querySelector(`[data-text="${key}"]`);
    const authoritativeSource={
      'turn-hud-turn':'tp-cur',
      'turn-hud-player':'tp-phase',
      'turn-hud-timer':'tp-timer'
    }[key];
    const source=$(authoritativeSource&&document.body?.classList.contains('fate-authority-v3-single-player-active')
      ? authoritativeSource
      : key);
    if(out&&source&&source.textContent)setText(out,source.textContent);
  }
  function copyHtml(root,key){const out=root.querySelector(`[data-html="${key}"]`),source=$(key);if(out&&source&&out.dataset.cache!==source.innerHTML){out.innerHTML=source.innerHTML;out.dataset.cache=source.innerHTML}}
  function playEndTurnInputCue(key){
    // Run directly inside the trusted click gesture.  Deferred/authoritative
    // submission may happen after that gesture and Chromium can reject audio.
    const dedupeKey=String(key||'end-turn-input');
    const store=window.__fatePlayedEndTurnInputCues||(window.__fatePlayedEndTurnInputCues=new Set());
    if(store.has(dedupeKey))return false;
    store.add(dedupeKey);
    return playTurnStartCue('turn-end:'+dedupeKey);
  }
  window.playFateEndTurnInputCue=playEndTurnInputCue;
  function playTurnStartCue(key){
    const dedupeKey=String(key||'turn-start');
    const store=window.__fatePlayedTurnStartCues||(window.__fatePlayedTurnStartCues=new Set());
    if(store.has(dedupeKey))return false;
    store.add(dedupeKey);
    // The core sound has its own broad time throttle. Reset it here because
    // this exact turn key is the stronger dedupe and competing UI observers
    // must not consume the cue first.
    window.__fateLastTurnChangeSfxAt=0;
    if(typeof window.playSfx==='function'){window.playSfx('turnChange');return true;}
    if(typeof window.playFateSfxOnce==='function')return window.playFateSfxOnce('turnChange',dedupeKey,0);
    return false;
  }
  window.playFateTurnStartCue=playTurnStartCue;
  function invokeEndTurn(){
    // The authoritative screen is the only owner of a v3 local turn. Submit
    // directly to it; forwarding through the hidden legacy button makes human
    // input depend on a second controller's disabled state.
    if(document.body?.classList.contains('fate-authority-v3-single-player-active')){
      const screen=window.FateAuthorityV3SinglePlayer?.currentScreen?.();
      const command=screen?.view?.legalCommands?.find(item=>item.type==='END_TURN');
      if(screen&&command){
        const turn=Number(screen.view?.state?.turn||0);
        playEndTurnInputCue('end-turn:authority-local:'+turn);
        screen.submit(command);
      }
      return;
    }
    invoke('endTurn');
  }
  function findArt(source){
    if(!source)return '';
    for(const node of [source,...source.querySelectorAll('*')]){
      let src=node.currentSrc||node.src||node.dataset?.src||'';
      if(!src&&node.tagName==='CANVAS'){try{src=node.toDataURL('image/png')}catch(_){}}
      if(src)return `url("${String(src).replace(/"/g,'\\"')}")`;
      const bg=getComputedStyle(node).backgroundImage;
      if(bg&&bg!=='none')return bg;
    }
    return '';
  }
  function playerPortraitArt(playerIndex,legacyId){
    const profile=window.G?.playerProfiles?.[playerIndex]||null;
    let src='';
    if(profile){
      src=window.FateOnline?.profilePhoto
        ? window.FateOnline.profilePhoto(profile)
        : (profile.img||profile.photoURL||profile.profileImg||profile.pfp||'');
    }
    // The local profile is available before multiplayer identity hydration.
    if(!src&&playerIndex===0&&typeof window.getProfileImgSrc==='function')src=window.getProfileImgSrc()||'';
    if(src&&src!=='blank.png')return `url("${String(src).replace(/"/g,'\\"')}")`;
    return findArt($(legacyId));
  }
  function suppressLegacyNode(node){
    if(!node)return;
    if(!node.hidden)node.hidden=true;
    setAttribute(node,'aria-hidden','true');
    for(const [key,value] of [['display','none'],['visibility','hidden'],['pointer-events','none']]){
      if(node.style.getPropertyValue(key)!==value||node.style.getPropertyPriority(key)!=='important')node.style.setProperty(key,value,'important');
    }
  }
  function updateStatusItems(button,statusNode,count){
    if(!button)return;
    button.classList.toggle('has-effects',count>0);
    setAttribute(button,'data-effect-count',count);
  }
  function escapeStatusText(value){
    return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function concealedMoraleTooltip(html){
    const template=document.createElement('template');
    template.innerHTML=String(html||'');
    const value=template.content.querySelector('header b');
    if(value)value.textContent='???/???';
    return template.innerHTML;
  }
  function statusRailSummary(key,onlyTaklamakan){
    const rail=$(key==='you'?'tp-status-left':'tp-status-right');
    const completeEffects=Array.isArray(rail?._fateAllStatusEffects)?rail._fateAllStatusEffects:null;
    if(completeEffects){
      const seen=new Set(),entries=[];
      completeEffects.forEach(effect=>{
        if(!effect||effect.isOverflow)return;
        const ability=String(effect.cardAbility||effect.label||'Active Effect').trim();
        if(onlyTaklamakan&&ability!=='The Vast Taklamakan'&&!String(effect.extraClass||'').includes('oktai-conceal'))return;
        const description=String(effect.cardEffect||ability).replace(/\s+/g,' ').trim();
        const signature=(ability+'|'+description).toLowerCase();
        if(seen.has(signature))return;
        seen.add(signature);
        const icon=String(effect.icon||'');
        entries.push('<div class="mp-status-entry '+(key==='opp'?'opponent':'player')+'">'+(icon?'<span class="effect-pill-icon" aria-hidden="true">'+icon+'</span>':'<span class="effect-pill-icon" aria-hidden="true">&#9670;</span>')+'<span><strong>'+escapeStatusText(ability)+'</strong><span>'+escapeStatusText(description||ability)+'</span></span></div>');
      });
      return {count:entries.length,content:entries.join('')};
    }
    const pills=[...(rail?.querySelectorAll('.effect-pill:not(.effect-pill-overflow)')||[])];
    const seen=new Set(),entries=[];
    pills.forEach(pill=>{
      const ability=String(pill.dataset.effectAbility||pill.querySelector('.ept-ability')?.textContent||pill.querySelector('.effect-pill-label')?.textContent||'Active Effect').trim();
      if(onlyTaklamakan&&ability!=='The Vast Taklamakan'&&!pill.classList.contains('effect-pill-oktai-conceal'))return;
      const description=String(pill.querySelector('.ept-effect')?.textContent||pill.getAttribute('aria-label')||pill.getAttribute('title')||'').replace(/\s+/g,' ').trim();
      const signature=(ability+'|'+description).toLowerCase();
      if(seen.has(signature))return;
      seen.add(signature);
      const icon=pill.querySelector('.effect-pill-icon');
      entries.push('<div class="mp-status-entry '+(key==='opp'?'opponent':'player')+'">'+(icon?icon.outerHTML:'<span class="effect-pill-icon" aria-hidden="true">&#9670;</span>')+'<span><strong>'+escapeStatusText(ability)+'</strong><span>'+escapeStatusText(description||ability)+'</span></span></div>');
    });
    return {count:entries.length,content:entries.join('')};
  }
  function fitLandscapeText(panel){
    if(!panel)return;
    const name=panel.querySelector('.landscape-name');
    const copy=[...panel.querySelectorAll('.landscape-desc,.landscape-note')];
    if(name){name.style.removeProperty('font-size');name.style.removeProperty('-webkit-line-clamp');}
    copy.forEach(node=>{node.style.removeProperty('font-size');node.style.removeProperty('-webkit-line-clamp');node.style.removeProperty('display');});
    panel.dataset.landscapeTextScale='fixed';
  }
  function scheduleLandscapeFit(panel){
    if(!panel||panel.dataset.landscapeFitPending==='true')return;
    panel.dataset.landscapeFitPending='true';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      panel.dataset.landscapeFitPending='false';
      fitLandscapeText(panel);
    }));
  }
  function currentAuthoritativeView(){
    const localScreen=window.FateAuthorityV3SinglePlayer?.currentScreen?.();
    if(localScreen?.view?.state)return localScreen.view;
    const multiplayer=window.FatePhase7CurrentMultiplayerUi;
    if(multiplayer?.active?.()){
      const view=multiplayer.view?.();
      if(view?.state)return view;
    }
    return null;
  }
  function currentPilePlayer(fallbackPlayerIndex){
    const view=currentAuthoritativeView();
    const projectedSeat=Number(view?.playerIndex);
    const seat=Number.isInteger(projectedSeat)?projectedSeat:Number(fallbackPlayerIndex);
    const localState=invoke('getFateGameState')||window.FATE_GAME_STATE||null;
    return view?.state?.players?.[seat]||localState?.players?.[seat]||null;
  }
  function update(){
    const root=$(ROOT),game=$('s-game');if(!root||!game)return;
    game.querySelectorAll(LEGACY_SOURCE_SELECTOR).forEach(suppressLegacyNode);
    suppressLegacyNode($('board'));
    for(const cls of [...game.classList]){
      if((/^match-ui-v\d+-live$/.test(cls)&&cls!=='match-ui-v19-live')||cls==='poster-raster-live')game.classList.remove(cls);
    }
    if(!game.classList.contains('match-ui-v19-live'))game.classList.add('match-ui-v19-live');
    if(!game.classList.contains('svg-board-v20-live'))game.classList.add('svg-board-v20-live');
    ['my-name','opp-name','turn-hud-turn','turn-hud-timer','turn-hud-player','my-deck-count','my-discard-count','act-hint'].forEach(k=>copyText(root,k));
    ['my-name','opp-name'].forEach(key=>{const name=root.querySelector(`[data-text="${key}"]`),length=(name?.textContent||'').trim().length;if(name){name.classList.toggle('is-long-name',length>=21);name.classList.toggle('is-very-long-name',length>=28)}});
    const clockText=root.querySelector('[data-text="turn-hud-timer"]');
    const turnCountText=root.querySelector('[data-text="turn-hud-turn"]');
    const clockMatch=(clockText?.textContent||'').match(/\d+\s*:\s*\d+/);
    if(clockText&&clockMatch)clockText.textContent=clockMatch[0].replace(/\s/g,'');
    copyHtml(root,'my-stat');copyHtml(root,'opp-stat');
    const raw=invoke('getPerspectivePlayerIndex'),authorityView=currentAuthoritativeView(),projectedSelf=Number(authorityView?.playerIndex),self=Number.isInteger(projectedSelf)?projectedSelf:(Number.isInteger(Number(raw))?Number(raw):0),rival=self===0?1:0;
    const turnState=authorityView?.state||(invoke('getFateGameState')||window.FATE_GAME_STATE||{}),activePlayer=Number(turnState?.activePlayer??turnState?.currentPlayer),turnNumber=Number(turnState?.turn??turnState?.turnNumber??0),turnSoundKey=[String(turnState?.matchId||turnState?._onlineRoomCode||'local'),turnNumber,activePlayer].join(':');
    if(game.classList.contains('active')&&Number.isFinite(activePlayer)&&root._lastTurnOwnershipSoundKey!==turnSoundKey){
      root._lastTurnOwnershipSoundKey=turnSoundKey;
      if(activePlayer===self){
        playTurnStartCue('turn-start:'+turnNumber+':'+activePlayer);
      }
    }
    const selfProjected=authorityView?.state?.players?.[self],rivalProjected=authorityView?.state?.players?.[rival];
    const selfHand=Number.isFinite(Number(selfProjected?.handCount))?Number(selfProjected.handCount):(Number(invoke('getPlayerHandCount',self))||0),rivalHand=Number.isFinite(Number(rivalProjected?.handCount))?Number(rivalProjected.handCount):(Number(invoke('getPlayerHandCount',rival))||0);
    const bh21Concealed=typeof window.isBh21ViewerConcealed==='function'&&window.isBh21ViewerConcealed(self);
    setText(root.querySelector('[data-hand-count="self"]'),bh21Concealed?'?':String(selfHand));setText(root.querySelector('[data-hand-count="rival"]'),bh21Concealed?'?':String(rivalHand));
    if(clockText&&bh21Concealed)clockText.textContent='?:??';
    if(turnCountText&&bh21Concealed)turnCountText.textContent='??/??';
    const pilePlayer=currentPilePlayer(self);
    const discardArt=root.querySelector('[data-discard] .codex-v19-archive-art');
    if(discardArt){
      // Let the stylesheet resolve the packaged card back relative to itself.
      // The old inline URL resolved from the document and left this pile blank.
      discardArt.style.removeProperty('--archive-card-image');
    }
    [['my-pic',self,'my-pic'],['opp-pic',rival,'opp-pic']].forEach(([key,seat,id])=>{const out=root.querySelector(`[data-art="${key}"]`),art=playerPortraitArt(seat,id);if(out&&art)out.style.backgroundImage=art});
    const land=$('landscape-panel'),landOut=root.querySelector('[data-land]');
    if(land&&landOut){
      const landscapeClass=[...land.classList].find(cls=>/^landscape-id-/.test(cls));
      [...landOut.classList].forEach(cls=>{if(/^landscape-id-/.test(cls)&&cls!==landscapeClass)landOut.classList.remove(cls)});
      if(landscapeClass&&!landOut.classList.contains(landscapeClass))landOut.classList.add(landscapeClass);
      if(landOut.dataset.cache!==land.innerHTML){landOut.innerHTML=land.innerHTML;landOut.dataset.cache=land.innerHTML;scheduleLandscapeFit(landOut)}
    }
     const stopConsolidation=root.querySelector('[data-stop-consolidate]');if(stopConsolidation)stopConsolidation.hidden=!Boolean(invoke('isLocalConsolidationActive'));
     const endControl=root.querySelector('[data-end]');
     const authorityScreen=window.FateAuthorityV3SinglePlayer?.currentScreen?.();
      if(pilePlayer){
       const deckCount=Number.isFinite(Number(pilePlayer.deckCount))?Number(pilePlayer.deckCount):(Array.isArray(pilePlayer.deck)?pilePlayer.deck.length:0);
       const discardCount=Array.isArray(pilePlayer.discard)?pilePlayer.discard.length:Math.max(0,Number(pilePlayer.discardCount)||0);
       const deckLabel=root.querySelector('[data-text="my-deck-count"]');
       const discardLabel=root.querySelector('[data-text="my-discard-count"]');
       setText(deckLabel,deckCount);
       setText(discardLabel,discardCount);
     }
     if(endControl&&authorityScreen){
       const canEnd=authorityScreen.view?.legalCommands?.some(item=>item.type==='END_TURN')===true;
       if(endControl.disabled!==!canEnd)endControl.disabled=!canEnd;
       setAttribute(endControl,'aria-disabled',String(!canEnd));
     }
       const authoritativeMorale=authorityScreen?.view?.state?.moralePressure||null;
       const liveState=invoke('getFateGameState')||window.FATE_GAME_STATE||null;
       const moraleSystem=window.getPresentedMoraleSystem?.()||authoritativeMorale||liveState?._moralePressure||null;
       const hud=$('morale-pressure-hud'),max=Math.max(1,Number(moraleSystem?.maxMorale||200));
       if(!bh21Concealed)root._bh21MoraleUiSnapshot=null;
       if(bh21Concealed&&!root._bh21MoraleUiSnapshot){
         root._bh21MoraleUiSnapshot={values:[Math.max(0,Number(moraleSystem?.morale?.[0])||0),Math.max(0,Number(moraleSystem?.morale?.[1])||0)],contents:{}};
       }
      [['you','.mp-left','.mp-status-player'],['opp','.mp-right','.mp-status-opponent']].forEach(([key,side,status])=>{
        const panel=hud?.querySelector(side),legacyLocal=Number(invoke('getPerspectivePlayerIndex'))||0,local=authorityScreen?Number(authorityScreen.view?.playerIndex):legacyLocal,seat=key==='you'?local:1-local,stateMorale=Number(moraleSystem?.morale?.[seat]),value=Number.isFinite(stateMorale)?stateMorale:Number(((panel?.querySelector('.mp-heading strong')?.textContent||String(max)).match(/\d+/)||[max])[0]);
       const label=root.querySelector(`[data-morale="${key}"]`),fill=root.querySelector(`[data-fill="${key}"]`),button=root.querySelector(`[data-status="${key}"]`),statusNode=hud?.querySelector(status);
        const displayedValue=bh21Concealed?Number(root._bh21MoraleUiSnapshot?.values?.[seat]??value):value;
        setText(label,bh21Concealed?'???':String(value));if(fill)fill.style.width=Math.max(0,Math.min(100,displayedValue/max*100))+'%';
       const moralePanel=root.querySelector(`[data-morale-panel="${key}"]`);
        const liveMoraleContent=panel?.querySelector('.mp-morale-tip')?.innerHTML||'<p>Morale penalties are inactive.</p>';
        if(bh21Concealed&&root._bh21MoraleUiSnapshot&&!root._bh21MoraleUiSnapshot.contents[key])root._bh21MoraleUiSnapshot.contents[key]=concealedMoraleTooltip(liveMoraleContent);
        if(moralePanel)moralePanel.dataset.content=bh21Concealed?(root._bh21MoraleUiSnapshot?.contents?.[key]||liveMoraleContent):liveMoraleContent;
       if(button){
          const rail=statusRailSummary(key,bh21Concealed),summaryCount=Number((statusNode?.querySelector(':scope > b')?.textContent||'0').match(/\d+/)?.[0]||0),count=bh21Concealed?rail.count:Math.max(summaryCount,rail.count),content=rail.count?rail.content:(bh21Concealed?'<p>The Taklamakan hinders your ability to view active statuses.</p>':(statusNode?.querySelector('.mp-status-popover')?.innerHTML||'<p>No active status effects.</p>'));
           setText(button.querySelector('[data-status-count]'),bh21Concealed?'?':String(count));setAttribute(button,'data-content',content);
          setAttribute(button,'aria-label',(key==='you'?'Your':'Opponent')+' status effects');
         updateStatusItems(button,statusNode,count);
       }
    });
  }
  function wire(root){
    root.querySelector('[data-deck]').onclick=()=>invoke('showDeckInfo',invoke('getPerspectivePlayerIndex'));
    root.querySelector('[data-discard]').onclick=()=>invoke('showDiscard',invoke('getPerspectivePlayerIndex'));
    root.querySelectorAll('[data-hand-player]').forEach(button=>{button.onclick=()=>{const raw=invoke('getPerspectivePlayerIndex'),self=Number.isInteger(Number(raw))?Number(raw):0;invoke('showPlayerHandWindow',button.dataset.handPlayer==='self'?self:(self===0?1:0));}});
    root.querySelector('[data-end]').onclick=invokeEndTurn;root.querySelector('[data-audio]').onclick=()=>invoke('showAudioSettings');root.querySelector('[data-chat]').onclick=()=>{if(!document.getElementById('ingame-chat-widget'))invoke('initInGameChat');invoke('toggleInGameChat')};root.querySelector('[data-quit]').onclick=()=>invoke('confirmEndGame');root.querySelector('[data-stop-consolidate]').onclick=()=>invoke('cancelConsolidation');
    root.addEventListener('pointerover',event=>{const anchor=event.target.closest('[data-status],[data-morale-panel]');if(!anchor)return;const pop=root.querySelector('.codex-v19-popover');pop.innerHTML=anchor.dataset.content||'';pop.dataset.side=anchor.dataset.status||anchor.dataset.moralePanel;pop.dataset.kind=anchor.hasAttribute('data-morale-panel')?'morale':'status';pop.hidden=false});
    root.addEventListener('pointerout',event=>{if(event.target.closest('[data-status],[data-morale-panel]'))root.querySelector('.codex-v19-popover').hidden=true});
  }
  function mount(){
    const game=$('s-game');if(!game||$(ROOT))return;
    ['fate-citadel-ui','fate-folio-ui','fate-illuminated-ui','fate-engraved-ui','fate-atlas-ui','fate-loom-ui','fate-aureate-ui','fate-rose-ui','fate-observatory-ui','fate-cinematic-ui'].forEach(id=>$(id)?.remove());
    document.querySelectorAll('[id^="fate-"][id$="-ui"]:not(#fate-codex-ui-v19)').forEach(node=>{if(node.closest('#s-game'))node.remove()});
    game.querySelectorAll(LEGACY_SOURCE_SELECTOR).forEach(node=>{node.dataset.codexV19Source='true';suppressLegacyNode(node)});
    const root=document.createElement('div');root.id=ROOT;root.innerHTML=markup;game.appendChild(root);
    const board=$('board');if(board){board.dataset.codexV19Source='true';suppressLegacyNode(board)}
    const hand=game.querySelector('.hand-strip');if(hand)root.querySelector('[data-hand]').appendChild(hand);
    wire(root);update();setInterval(update,250);
    window.addEventListener('resize',()=>scheduleLandscapeFit(root.querySelector('[data-land]')),{passive:true});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{window.FateMatchRendererAdapter?.resetBoardViewport?.('codex-v19');window.dispatchEvent(new Event('resize'))}));
  }
  window.FateCodexUi={mount,update};
  new MutationObserver(()=>{if($('s-game')&&!$(ROOT))mount()}).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  document.addEventListener('click',mount,{passive:true});
})();
