(function(){
  'use strict';
  const ROOT='fate-codex-ui-v19';
  const $=id=>document.getElementById(id);
  const invoke=(name,...args)=>typeof window[name]==='function'?window[name](...args):undefined;
  const markup=`
    <div class="codex-v19-backdrop"></div>
    <header class="codex-v19-hud">
      <section class="codex-v19-player codex-v19-player-you">
        <button class="codex-v19-status codex-v19-status-you" data-status="you" aria-label="Your status effects"><strong>STATUS EFFECTS</strong><b>0</b><span class="codex-v19-status-items"><i class="empty">NONE</i></span></button>
        <div class="codex-v19-portrait" data-art="my-pic"></div>
        <div class="codex-v19-identity"><small>YOU</small><strong data-text="my-name">PLAYER</strong><div class="codex-v19-rank" data-html="my-stat"></div></div>
        <div class="codex-v19-morale"><span class="codex-v19-heart">♥</span><b data-morale="you">200</b><small>MORALE</small><i><u data-fill="you"></u></i></div>
        <button class="codex-v19-hand-button codex-v19-hand-you" data-hand-player="self" aria-label="View your hand"><span>▰</span><b data-hand-count="self">0</b></button>
      </section>
      <section class="codex-v19-clock" aria-label="Match timer">
        <div class="codex-v19-clock-face">
          <small data-text="turn-hud-turn">TURN 1 / 24</small>
          <strong data-text="turn-hud-timer">3:00</strong>
          <span data-text="turn-hud-player">YOUR TURN</span>
        </div>
      </section>
      <section class="codex-v19-player codex-v19-player-opp">
        <div class="codex-v19-morale"><small>MORALE</small><b data-morale="opp">200</b><span class="codex-v19-heart">♥</span><i><u data-fill="opp"></u></i></div>
        <div class="codex-v19-identity"><small>YOUR OPPONENT</small><strong data-text="opp-name">OPPONENT</strong><div class="codex-v19-rank" data-html="opp-stat"></div></div>
        <div class="codex-v19-portrait" data-art="opp-pic"></div>
        <button class="codex-v19-status codex-v19-status-opp" data-status="opp" aria-label="Opponent status effects"><strong>STATUS EFFECTS</strong><b>0</b><span class="codex-v19-status-items"><i class="empty">NONE</i></span></button>
        <button class="codex-v19-hand-button codex-v19-hand-opp" data-hand-player="rival" aria-label="View opponent hand"><span>▰</span><b data-hand-count="rival">0</b></button>
      </section>
    </header>
    <main class="codex-v19-field"><div id="codex-board-v19" data-renderer-surface="codex-v19"></div></main>
    <footer class="codex-v19-footer">
      <aside class="codex-v19-archive"><header><span>ILLUMINATED LANDSCAPE</span><i>ACTIVE</i></header><div class="codex-v19-land" data-land></div><nav><button data-deck><span>DRAW ARCHIVE</span><b data-text="my-deck-count">0</b></button><button data-discard><span>SPENT ARCHIVE</span><b data-text="my-discard-count">0</b></button></nav></aside>
      <div class="codex-v19-hand" data-hand></div>
      <aside class="codex-v19-command"><header>CURRENT DECREE <small data-text="act-hint">Select a card to play</small></header><button class="codex-v19-end" data-end><span>END TURN</span><b>›</b></button><nav><button data-audio>AUDIO</button><button data-chat>CHAT</button><button data-quit>END MATCH</button></nav></aside>
    </footer>
    <section class="codex-v19-popover" hidden></section>`;

  function copyText(root,key){const out=root.querySelector(`[data-text="${key}"]`),source=$(key);if(out&&source)out.textContent=source.textContent||''}
  function copyHtml(root,key){const out=root.querySelector(`[data-html="${key}"]`),source=$(key);if(out&&source&&out.dataset.cache!==source.innerHTML){out.innerHTML=source.innerHTML;out.dataset.cache=source.innerHTML}}
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
  function updateStatusItems(button,statusNode,count){
    const tray=button?.querySelector('.codex-v19-status-items');if(!tray)return;
    const selectors=['.mp-status-item strong','.mp-status-entry strong','.status-effect-name','.effect-pill-label','.mp-status-popover strong'];
    const names=[];
    selectors.forEach(selector=>statusNode?.querySelectorAll(selector).forEach(node=>{
      const name=(node.textContent||'').replace(/\s+/g,' ').trim();
      if(name&&!names.includes(name)&&!/^status effects?$/i.test(name))names.push(name);
    }));
    tray.replaceChildren();
    if(!count){const empty=document.createElement('i');empty.className='empty';empty.textContent='NONE';tray.appendChild(empty);return;}
    const visible=Math.min(2,count);
    for(let index=0;index<visible;index++){
      const item=document.createElement('i');item.textContent=names[index]||`ACTIVE EFFECT ${index+1}`;tray.appendChild(item);
    }
    if(count>2){const overflow=document.createElement('i');overflow.className='overflow';overflow.textContent=`STATUS EFFECTS +${count-2}`;tray.appendChild(overflow)}
  }
  function update(){
    const root=$(ROOT),game=$('s-game');if(!root||!game)return;
    game.className=game.className.replace(/match-ui-v\d+-live|poster-raster-live|svg-board-v20-live/g,'').trim();game.classList.add('match-ui-v19-live','svg-board-v20-live');
    ['my-name','opp-name','turn-hud-turn','turn-hud-timer','turn-hud-player','my-deck-count','my-discard-count','act-hint'].forEach(k=>copyText(root,k));
    copyHtml(root,'my-stat');copyHtml(root,'opp-stat');
    const raw=invoke('getPerspectivePlayerIndex'),self=Number.isInteger(Number(raw))?Number(raw):0,rival=self===0?1:0,players=window.G?.players||[];
    root.querySelector('[data-hand-count="self"]').textContent=String(players[self]?.hand?.length||0);root.querySelector('[data-hand-count="rival"]').textContent=String(players[rival]?.hand?.length||0);
    [['my-pic','my-pic'],['opp-pic','opp-pic']].forEach(([key,id])=>{const out=root.querySelector(`[data-art="${key}"]`),art=findArt($(id));if(out&&art)out.style.backgroundImage=art});
    const land=$('landscape-panel'),landOut=root.querySelector('[data-land]');if(land&&landOut&&landOut.dataset.cache!==land.innerHTML){landOut.innerHTML=land.innerHTML;landOut.dataset.cache=land.innerHTML}
    const hud=$('morale-pressure-hud'),max=Math.max(1,Number(window.G?._moralePressure?.maxMorale||200));
    [['you','.mp-left','.mp-status-player'],['opp','.mp-right','.mp-status-opponent']].forEach(([key,side,status])=>{
      const panel=hud?.querySelector(side),value=Number(((panel?.querySelector('.mp-heading strong')?.textContent||String(max)).match(/\d+/)||[max])[0]);
      const label=root.querySelector(`[data-morale="${key}"]`),fill=root.querySelector(`[data-fill="${key}"]`),button=root.querySelector(`[data-status="${key}"]`),statusNode=hud?.querySelector(status);
      if(label)label.textContent=value;if(fill)fill.style.width=Math.max(0,Math.min(100,value/max*100))+'%';
      if(button){
        const count=Number((statusNode?.querySelector(':scope > b')?.textContent||'0').match(/\d+/)?.[0]||0),content=statusNode?.querySelector('.mp-status-popover')?.innerHTML||'<p>No active status effects.</p>';
        button.querySelector('b').textContent=String(count);button.dataset.content=content;
        updateStatusItems(button,statusNode,count);
      }
    });
  }
  function wire(root){
    root.querySelector('[data-deck]').onclick=()=>invoke('showDeckInfo',invoke('getPerspectivePlayerIndex'));
    root.querySelector('[data-discard]').onclick=()=>invoke('showDiscard',invoke('getPerspectivePlayerIndex'));
    root.querySelectorAll('[data-hand-player]').forEach(button=>{button.onclick=()=>{const raw=invoke('getPerspectivePlayerIndex'),self=Number.isInteger(Number(raw))?Number(raw):0;invoke('showPlayerHandWindow',button.dataset.handPlayer==='self'?self:(self===0?1:0));}});
    root.querySelector('[data-end]').onclick=()=>invoke('endTurn');root.querySelector('[data-audio]').onclick=()=>invoke('showAudioSettings');root.querySelector('[data-chat]').onclick=()=>invoke('toggleChat');root.querySelector('[data-quit]').onclick=()=>invoke('confirmEndGame');
    root.addEventListener('pointerover',event=>{const button=event.target.closest('[data-status]');if(!button)return;const pop=root.querySelector('.codex-v19-popover');pop.innerHTML=button.dataset.content||'';pop.dataset.side=button.dataset.status;pop.hidden=false});
    root.addEventListener('pointerout',event=>{if(event.target.closest('[data-status]'))root.querySelector('.codex-v19-popover').hidden=true});
  }
  function mount(){
    const game=$('s-game');if(!game||$(ROOT))return;
    ['fate-citadel-ui','fate-folio-ui','fate-illuminated-ui','fate-engraved-ui','fate-atlas-ui','fate-loom-ui','fate-aureate-ui','fate-rose-ui','fate-observatory-ui','fate-cinematic-ui'].forEach(id=>$(id)?.remove());
    document.querySelectorAll('[id^="fate-"][id$="-ui"]:not(#fate-codex-ui-v19)').forEach(node=>{if(node.closest('#s-game'))node.remove()});
    game.querySelectorAll('.topbar,.zscore,.game-layout,#turn-hud,#morale-pressure-hud,#match-utility-panel,#actbar,.fm-action-console,.fm-field-console').forEach(node=>{node.hidden=true;node.dataset.codexV19Source='true'});
    const root=document.createElement('div');root.id=ROOT;root.innerHTML=markup;game.appendChild(root);
    const board=$('board');if(board){board.hidden=true;board.dataset.codexV19Source='true'}
    const hand=game.querySelector('.hand-strip');if(hand)root.querySelector('[data-hand]').appendChild(hand);
    wire(root);update();setInterval(update,250);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{window.FateMatchRendererAdapter?.resetBoardViewport?.('codex-v19');window.dispatchEvent(new Event('resize'))}));
  }
  window.FateCodexUi={mount,update};
  new MutationObserver(()=>{if($('s-game')&&!$(ROOT))mount()}).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  document.addEventListener('click',mount,{passive:true});
})();
