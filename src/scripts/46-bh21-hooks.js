(function(){
  'use strict';
  window.FATE_BH21_AUDIO_HOOKS = Object.freeze({set:'bh21', voice:'bh21', landscape:'oktai.mp3'});
  window.FATE_BH22_AUDIO_HOOKS = Object.freeze({set:'bh22', voice:'bh22'});
  window.FATE_BH21_STATUS_ICON = 'oktai_conceal';
  const originalPlayCardSound=window.playCardSound;
  window.playCardSound=function(cardId){
    const id=String(cardId||'');
    if(id!=='bh21'&&id!=='bh22')return typeof originalPlayCardSound==='function'?originalPlayCardSound(cardId):undefined;
    try{const audio=new Audio('setvoicelines/'+id+'.mp3?v=20260830a');audio.volume=.7;audio.play().catch(function(){});return audio;}catch(_){return undefined;}
  };
  let savedBackground=null;
  let replacementLandscapeAudio=null;
  let replacementLandscapeKind='';
  let replacementPausedBaseMusic=false;
  let displayedLandscapeKind='';
  function specialLandscapeImage(kind){
    return kind==='oktai'?'oktai.png?v=20260830b':(kind==='makenna'?'makenna.png?v=20260830a':'');
  }
  function fadeLandscapePresentation(game,fromBackground){
    if(!game||!fromBackground||fromBackground==='none')return;
    const old=game.querySelector('.landscape-transition-layer.bh-special-landscape-fade');if(old)old.remove();
    const layer=document.createElement('div');
    layer.className='landscape-transition-layer bh-special-landscape-fade';
    layer.style.transition='opacity 1.15s ease';
    layer.style.backgroundImage=fromBackground;
    layer.style.opacity='1';
    game.appendChild(layer);
    requestAnimationFrame(function(){requestAnimationFrame(function(){layer.style.opacity='0';});});
    setTimeout(function(){try{layer.remove();}catch(_){}},1350);
  }
  function startReplacementLandscapeAudio(kind){
    if(replacementLandscapeAudio&&replacementLandscapeKind===kind)return;
    stopReplacementLandscapeAudio(false);
    try{
      if(typeof window.fatePauseMusicForHidden==='function'){
        window.fatePauseMusicForHidden();
        replacementPausedBaseMusic=true;
      }
      const audio=new Audio((kind==='oktai'?'oktai.mp3?v=20260830b':'makenna.mp3?v=20260830a'));
      audio.loop=true;
      audio.volume=.22;
      replacementLandscapeKind=kind;
      replacementLandscapeAudio=audio;
      audio.play().catch(function(){if(replacementLandscapeAudio===audio)stopReplacementLandscapeAudio(true);});
    }catch(_){
      replacementLandscapeAudio=null;
      replacementLandscapeKind='';
      if(replacementPausedBaseMusic&&typeof window.fateResumeMusicAfterHidden==='function')window.fateResumeMusicAfterHidden();
      replacementPausedBaseMusic=false;
    }
  }
  function stopReplacementLandscapeAudio(resumeBase){
    if(replacementLandscapeAudio){
      try{replacementLandscapeAudio.pause();replacementLandscapeAudio.currentTime=0;}catch(_){}
    }
    replacementLandscapeAudio=null;
    replacementLandscapeKind='';
    if(resumeBase!==false&&replacementPausedBaseMusic&&typeof window.fateResumeMusicAfterHidden==='function')window.fateResumeMusicAfterHidden();
    if(resumeBase!==false)replacementPausedBaseMusic=false;
  }
  function captureUnderlyingBackground(game){
    return {image:game.style.backgroundImage,size:game.style.backgroundSize,position:game.style.backgroundPosition,repeat:game.style.backgroundRepeat,cssVar:game.style.getPropertyValue('--game-bg-img')};
  }
  function pauseReplacementLandscapeMusic(){
    if(typeof window.fatePauseMusicForHidden!=='function')return;
    if(replacementPausedBaseMusic)return;
    window.fatePauseMusicForHidden();
    replacementPausedBaseMusic=true;
  }
  function makennaAddedTurnActive(){
    const state=window.G;
    return !!(state&&state._makennaBirdCultActivated&&Number(state.turn)>=24&&Number(state.turn)<=Number(state.maxTurns));
  }
  function syncPresentation(){
    const game=document.getElementById('s-game');if(!game)return;
    const oktaiActive=!!window.isBh21ViewerConcealed?.();
    const makennaActive=makennaAddedTurnActive();
    const kind=oktaiActive?'oktai':(makennaActive?'makenna':'');
    const previousKind=displayedLandscapeKind;
    const transitionFrom=previousKind
      ? 'linear-gradient(180deg,rgba(4,3,8,.08),rgba(4,3,8,.20)),url("'+specialLandscapeImage(previousKind)+'")'
      : (savedBackground&&savedBackground.image)||game.style.backgroundImage;
    if(kind){
      const inlineBackground=String(game.style.backgroundImage||'');
      const replacementVisible=inlineBackground.indexOf('oktai.png')>=0||inlineBackground.indexOf('makenna.png')>=0;
      if(!savedBackground)savedBackground=captureUnderlyingBackground(game);
      else if(!replacementVisible){
        // A real landscape change is allowed to update the panel and canonical
        // match state beneath the temporary presentation. Remember that
        // newest background, then immediately cover it again.
        savedBackground=captureUnderlyingBackground(game);
        pauseReplacementLandscapeMusic();
      }
      const base=savedBackground.image||'linear-gradient(180deg,rgba(6,8,14,.04),rgba(6,8,14,.12))';
      const image=specialLandscapeImage(kind);
      game.style.backgroundImage='linear-gradient(180deg,rgba(4,3,8,.08),rgba(4,3,8,.20)), url("'+image+'"), '+base;
      game.style.backgroundSize='cover, cover, cover';game.style.backgroundPosition='center, center, center';game.style.backgroundRepeat='no-repeat';
      game.style.setProperty('--game-bg-img','url("'+image+'")');
      startReplacementLandscapeAudio(kind);
    }else if(savedBackground){
      game.style.backgroundImage=savedBackground.image;game.style.backgroundSize=savedBackground.size;game.style.backgroundPosition=savedBackground.position;game.style.backgroundRepeat=savedBackground.repeat;
      if(savedBackground.cssVar)game.style.setProperty('--game-bg-img',savedBackground.cssVar);else game.style.removeProperty('--game-bg-img');savedBackground=null;
      stopReplacementLandscapeAudio(true);
    }else if(!kind){
      stopReplacementLandscapeAudio(true);
    }
    game.classList.toggle('bh21-viewer-concealed',oktaiActive);
    game.classList.toggle('bh20-added-turn-presentation',makennaActive&&!oktaiActive);
    if(kind!==previousKind){
      displayedLandscapeKind=kind;
      fadeLandscapePresentation(game,transitionFrom);
    }
    document.querySelectorAll('#fate-codex-ui-v19 [data-morale], #morale-pressure-hud .mp-heading strong').forEach(function(node){
      if(oktaiActive)node.textContent='???';
    });
    if(oktaiActive){
      document.querySelectorAll('#fate-codex-ui-v19 [data-hand-count]').forEach(function(node){node.textContent='?';});
      document.querySelectorAll('#fate-codex-ui-v19 [data-text="turn-hud-timer"], #turn-hud-timer, #tp-timer').forEach(function(node){node.textContent='?:??';});
    }
  }
  window.syncBh21ViewerPresentation=syncPresentation;
  setInterval(syncPresentation,100);
  const style=document.createElement('style');style.textContent='.bh21-concealed-fate-icon{display:block;width:1.35em;height:1.35em;object-fit:contain;filter:drop-shadow(0 0 5px #ffd84a)}.bh21-viewer-concealed [data-morale]{color:#ffe36d!important;text-shadow:0 0 10px rgba(255,216,74,.85)}#s-game.bh21-viewer-concealed #fate-codex-ui-v19 [data-text="turn-hud-timer"]{position:relative!important;top:3px!important}#s-game.bh21-viewer-concealed{background-image:linear-gradient(180deg,rgba(4,3,8,.08),rgba(4,3,8,.20)),url("oktai.png?v=20260830b")!important;background-size:cover,cover!important;background-position:center,center!important;background-repeat:no-repeat!important}#s-game.bh20-added-turn-presentation:not(.bh21-viewer-concealed){background-image:linear-gradient(180deg,rgba(4,3,8,.08),rgba(4,3,8,.20)),url("makenna.png?v=20260830a")!important;background-size:cover,cover!important;background-position:center,center!important;background-repeat:no-repeat!important}';document.head.appendChild(style);
})();
