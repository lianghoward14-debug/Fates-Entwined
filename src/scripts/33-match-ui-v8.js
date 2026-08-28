(function(){
  'use strict';
  const ROOT_ID='fate-match-ui-v8';
  const LEGACY_ROOTS=['fate-match-ui-v3','fate-match-ui-v4','fate-match-ui-v5','fate-match-ui-v6','fate-match-ui-v7'];
  const LEGACY_CLASSES=['match-ui-v3-live','match-ui-v4-live','match-ui-v5-live','match-ui-v6-live','match-ui-v7-live'];
  const $=id=>document.getElementById(id);
  let timer=0;

  function markup(){
    return `<div class="v8-wash"></div>
      <header class="v8-command-rail">
        <section class="v8-player v8-player-self">
          <div class="v8-avatar" data-art="my-pic"></div>
          <div class="v8-identity"><small>YOUR COMMAND</small><strong data-text="my-name">PLAYER</strong><div data-html="my-stat"></div></div>
          <div class="v8-vital"><span class="v8-heart">♥</span><div><small>MORALE</small><b data-morale="you">200</b><i><u data-fill="you"></u></i></div></div>
          <button class="v8-hand-button v8-hand-button-self" data-hand-player="self" aria-label="View your hand"><span></span><b data-hand-count="self">0</b></button>
        </section>
        <button class="v8-status v8-status-self" data-status="you"><span>STATUS EFFECTS</span><b>0</b></button>
        <section class="v8-clock"><small data-text="turn-hud-turn">TURN 1 / 24</small><strong data-text="turn-hud-timer">3:00</strong><span data-text="turn-hud-player">YOUR TURN</span></section>
        <button class="v8-status v8-status-rival" data-status="opp"><b>0</b><span>STATUS EFFECTS</span></button>
        <section class="v8-player v8-player-rival">
          <button class="v8-hand-button v8-hand-button-rival" data-hand-player="rival" aria-label="View rival hand"><span></span><b data-hand-count="rival">0</b></button>
          <div class="v8-vital"><div><small>MORALE</small><b data-morale="opp">200</b><i><u data-fill="opp"></u></i></div><span class="v8-heart">♥</span></div>
          <div class="v8-identity"><small>RIVAL COMMAND</small><strong data-text="opp-name">OPPONENT</strong><div data-html="opp-stat"></div></div>
          <div class="v8-avatar" data-art="opp-pic"></div>
        </section>
      </header>
      <main class="v8-board-shell"><div class="v8-board-frame" data-board-slot></div></main>
      <aside class="v8-reserve"><header><small>ACTIVE LANDSCAPE</small><strong>FIELD RESERVE</strong></header><div class="v8-landscape" data-landscape></div><div class="v8-piles"><button data-deck><span>DECK</span><b data-text="my-deck-count">0</b></button><button data-discard><span>DISCARD</span><b data-text="my-discard-count">0</b></button></div></aside>
      <section class="v8-hand" data-hand-slot></section>
      <aside class="v8-controls"><header><small>TURN COMMAND</small><span data-text="act-hint">Select a card to play</span></header><button class="v8-end"><span>END TURN</span><b>›</b></button><footer><button data-audio>AUDIO</button><button data-chat>CHAT</button><button data-end-match>END MATCH</button></footer></aside>
      <div class="v8-status-pop" hidden></div>`;
  }

  function copyText(root,id){const out=root.querySelector(`[data-text="${id}"]`),src=$(id);if(out&&src)out.textContent=src.textContent||'';}
  function copyHtml(root,id){const out=root.querySelector(`[data-html="${id}"]`),src=$(id);if(out&&src&&out.dataset.cache!==src.innerHTML){out.innerHTML=src.innerHTML;out.dataset.cache=src.innerHTML;}}
  function copyArt(root,id){const out=root.querySelector(`[data-art="${id}"]`),src=$(id);if(!out||!src)return;const img=src.querySelector('img');const bg=getComputedStyle(src).backgroundImage;const url=img?.src?`url("${img.src}")`:(bg&&bg!=='none'?bg:'');if(url)out.style.backgroundImage=url;}
  function refreshVitals(root){
    const hud=$('morale-pressure-hud');
    const max=Math.max(1,Number(window.G?._moralePressure?.maxMorale||200));
    [['you','.mp-left','.mp-status-player'],['opp','.mp-right','.mp-status-opponent']].forEach(([key,sideSelector,statusSelector])=>{
      const side=hud?.querySelector(sideSelector);
      const value=Number(((side?.querySelector('.mp-heading strong')?.textContent||String(max)).match(/\d+/)||[max])[0]);
      const label=root.querySelector(`[data-morale="${key}"]`),fill=root.querySelector(`[data-fill="${key}"]`),button=root.querySelector(`[data-status="${key}"]`),status=hud?.querySelector(statusSelector);
      if(label)label.textContent=String(value);if(fill)fill.style.width=`${Math.max(0,Math.min(100,value/max*100))}%`;
      if(button){button.querySelector('b').textContent=status?.querySelector(':scope > b')?.textContent||'0';button.dataset.popover=status?.querySelector('.mp-status-popover')?.innerHTML||'<p>No active status effects.</p>';}
    });
  }
  function refresh(){const root=$(ROOT_ID);if(!root)return;['my-name','opp-name','turn-hud-turn','turn-hud-timer','turn-hud-player','my-deck-count','my-discard-count','act-hint'].forEach(id=>copyText(root,id));copyHtml(root,'my-stat');copyHtml(root,'opp-stat');copyArt(root,'my-pic');copyArt(root,'opp-pic');const src=$('landscape-panel'),out=root.querySelector('[data-landscape]');if(src&&out&&out.dataset.cache!==src.innerHTML){out.innerHTML=src.innerHTML;out.dataset.cache=src.innerHTML;}const raw=invoke('getPerspectivePlayerIndex'),self=Number.isInteger(Number(raw))?Number(raw):0,rival=self===0?1:0,players=window.G?.players||[];root.querySelector('[data-hand-count="self"]').textContent=String(players[self]?.hand?.length||0);root.querySelector('[data-hand-count="rival"]').textContent=String(players[rival]?.hand?.length||0);refreshVitals(root);}
  function invoke(name,...args){const fn=window[name];if(typeof fn==='function')return fn(...args);}
  function bind(root){
    root.querySelector('[data-deck]').onclick=()=>invoke('showDeckInfo',invoke('getPerspectivePlayerIndex'));
    root.querySelector('[data-discard]').onclick=()=>invoke('showDiscard',invoke('getPerspectivePlayerIndex'));
    root.querySelectorAll('[data-hand-player]').forEach(button=>{button.onclick=()=>{const raw=invoke('getPerspectivePlayerIndex'),self=Number.isInteger(Number(raw))?Number(raw):0;invoke('showPlayerHandWindow',button.dataset.handPlayer==='self'?self:(self===0?1:0));};});
    root.querySelector('.v8-end').onclick=()=>invoke('endTurn');root.querySelector('[data-audio]').onclick=()=>invoke('showAudioSettings');root.querySelector('[data-chat]').onclick=()=>invoke('toggleChat');root.querySelector('[data-end-match]').onclick=()=>invoke('confirmEndGame');
    root.addEventListener('pointerover',event=>{const trigger=event.target.closest('[data-status]');if(!trigger)return;const pop=root.querySelector('.v8-status-pop');pop.innerHTML=trigger.dataset.popover||'';pop.dataset.side=trigger.dataset.status;pop.hidden=false;});
    root.addEventListener('pointerout',event=>{if(event.target.closest('[data-status]'))root.querySelector('.v8-status-pop').hidden=true;});
  }
  function buildFreshBoard(root){
    const existing=$('fresh-board-v8');if(existing)return existing;
    const prior=$('board');if(prior){prior.hidden=true;prior.dataset.freshUiSource='true';}
    const board=document.createElement('div');board.id='fresh-board-v8';board.className='v8-render-surface';board.dataset.rendererSurface='fresh-v8';root.querySelector('[data-board-slot]').appendChild(board);return board;
  }
  function disableLegacy(game){
    LEGACY_CLASSES.forEach(name=>game.classList.remove(name));LEGACY_ROOTS.forEach(id=>$(id)?.remove());
    ['.topbar','.zscore','.game-layout','#turn-hud','#morale-pressure-hud','#match-utility-panel','#actbar','.fm-action-console','.fm-field-console'].forEach(selector=>game.querySelectorAll(selector).forEach(node=>{node.hidden=true;node.dataset.freshUiSource='true';}));
  }
  function mount(){
    if(new URLSearchParams(location.search).get('fateMatchDesign')!=='v8')return;
    if(window.FATE_MATCH_UI_REBUILD_ENABLED===false)return;const game=$('s-game');if(!game)return;
    let root=$(ROOT_ID);if(!root){root=document.createElement('div');root.id=ROOT_ID;root.innerHTML=markup();game.appendChild(root);bind(root);}
    disableLegacy(game);game.classList.add('match-ui-v8-live');const board=buildFreshBoard(root);const hand=game.querySelector('.hand-strip');if(hand&&hand.parentNode!==root.querySelector('[data-hand-slot]'))root.querySelector('[data-hand-slot]').appendChild(hand);
    refresh();if(!timer)timer=setInterval(refresh,250);requestAnimationFrame(()=>requestAnimationFrame(()=>{window.FateMatchRendererAdapter?.resetBoardViewport?.('v8-new-render-surface');window.dispatchEvent(new Event('resize'));}));return board;
  }
  window.FateMatchUiV8={mount,refresh};
  const observer=new MutationObserver(()=>{if($('s-game')&&!$(ROOT_ID))mount();});observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  document.addEventListener('click',()=>{if($('s-game')&&!$(ROOT_ID))mount();},{passive:true});
})();
