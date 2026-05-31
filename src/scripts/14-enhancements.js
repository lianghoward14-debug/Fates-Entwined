// ═══════════════════════════════════════════════════════════════
//  14-ENHANCEMENTS.js
// ═══════════════════════════════════════════════════════════════

/* ── 1. NEW SOUND EFFECTS ── */
(function(){
  if(window.__FATES_ENHANCED_SFX_INSTALLED) return;
  window.__FATES_ENHANCED_SFX_INSTALLED = true;
  var _orig = window.playSfx || (typeof playSfx==='function' ? playSfx : null);
  var _types = {cardInfoOpen:1,cardAddToHand:1,fateGain:1,fateLose:1,cardSetEnhanced:1,discardCard:1,dragStart:1,dragDrop:1};
  function enhanced(type){
    if(!_types[type]){if(_orig)return _orig(type);return;}
    if(typeof _masterVol!=='undefined'&&_masterVol<=0)return;
    var ev=(type==='cardInfoOpen'||type==='cardAddToHand')?(typeof _menuVol!=='undefined'?_menuVol:1):(typeof _sfxVol!=='undefined'?_sfxVol:0.8);
    if(ev<=0)return;
    try{
      var ctx=getAudioCtx(),vol=ctx.createGain(),now=ctx.currentTime;
      vol.gain.value=(typeof _masterVol!=='undefined'?_masterVol:1)*ev*1.2;
      if(typeof window.getFateSfxBus==='function') vol.connect(window.getFateSfxBus(ctx).input);
      else { var comp=ctx.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=6;comp.ratio.value=3;comp.attack.value=0.003;comp.release.value=0.15;vol.connect(comp);comp.connect(ctx.destination); }
      function cachedNoise(dur,dc,gv,variant){return typeof window.getCachedFateSfxNoiseBuffer==='function'?window.getCachedFateSfxNoiseBuffer(ctx,dur,dc,gv,variant):null;}
      function nb(dur,dc,gv,ft,ff,fq){var b=cachedNoise(dur,dc,gv)||ctx.createBuffer(1,ctx.sampleRate*dur,ctx.sampleRate);if(!b.__fateNoiseFilled&&typeof window.getCachedFateSfxNoiseBuffer!=='function'){var d=b.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,dc)*gv;b.__fateNoiseFilled=1;}var s=ctx.createBufferSource();s.buffer=b;if(ft){var f=ctx.createBiquadFilter();f.type=ft;f.frequency.value=ff||800;if(fq)f.Q.value=fq;s.connect(f);f.connect(vol);}else s.connect(vol);return s;}
      if(type==='cardInfoOpen'){var fl=cachedNoise(0.08,0,0.18,'sine')||ctx.createBuffer(1,ctx.sampleRate*0.08,ctx.sampleRate);if(!fl.__fateNoiseFilled&&typeof window.getCachedFateSfxNoiseBuffer!=='function'){var fd=fl.getChannelData(0);for(var i=0;i<fd.length;i++)fd[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/fd.length)*0.18;fl.__fateNoiseFilled=1;}var fs=ctx.createBufferSource();fs.buffer=fl;var bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2800;bp.Q.value=1.8;fs.connect(bp);bp.connect(vol);fs.start(now);var ch=ctx.createOscillator();ch.type='sine';ch.frequency.value=880;var cg=ctx.createGain();cg.gain.setValueAtTime(0.1,now+0.03);cg.gain.exponentialRampToValueAtTime(0.001,now+0.22);ch.connect(cg);cg.connect(vol);ch.start(now+0.03);ch.stop(now+0.25);}
      else if(type==='cardAddToHand'){var b2=ctx.createBuffer(1,ctx.sampleRate*0.1,ctx.sampleRate),d2=b2.getChannelData(0);for(var i=0;i<d2.length;i++){var t=i/d2.length;d2[i]=(Math.random()*2-1)*Math.sin(Math.PI*t)*0.25*(1-t*0.6);}var s2=ctx.createBufferSource();s2.buffer=b2;var fb=ctx.createBiquadFilter();fb.type='bandpass';fb.frequency.setValueAtTime(1500,now);fb.frequency.exponentialRampToValueAtTime(3500,now+0.08);fb.Q.value=2;s2.connect(fb);fb.connect(vol);s2.start(now);var sn=ctx.createOscillator();sn.type='triangle';sn.frequency.setValueAtTime(2200,now+0.06);sn.frequency.exponentialRampToValueAtTime(900,now+0.09);var sg=ctx.createGain();sg.gain.setValueAtTime(0.12,now+0.06);sg.gain.exponentialRampToValueAtTime(0.001,now+0.1);sn.connect(sg);sg.connect(vol);sn.start(now+0.06);sn.stop(now+0.12);}
      else if(type==='fateGain'){[660,880,1100].forEach(function(f,i){var o=ctx.createOscillator();o.type='sine';o.frequency.value=f;var g=ctx.createGain();g.gain.setValueAtTime(0,now+i*0.04);g.gain.linearRampToValueAtTime(0.1,now+i*0.04+0.01);g.gain.exponentialRampToValueAtTime(0.001,now+i*0.04+0.2);o.connect(g);g.connect(vol);o.start(now+i*0.04);o.stop(now+i*0.04+0.22);});}
      else if(type==='fateLose'){var o=ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(400,now);o.frequency.exponentialRampToValueAtTime(120,now+0.18);var g=ctx.createGain();g.gain.setValueAtTime(0.12,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.22);var lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(1500,now);lp.frequency.exponentialRampToValueAtTime(200,now+0.2);o.connect(lp);lp.connect(g);g.connect(vol);o.start(now);o.stop(now+0.24);nb(0.03,2.5,0.25,'bandpass',800,2).start(now);}
      else if(type==='cardSetEnhanced'){var sb=ctx.createOscillator();sb.type='sine';sb.frequency.setValueAtTime(80,now);sb.frequency.exponentialRampToValueAtTime(30,now+0.2);var sg2=ctx.createGain();sg2.gain.setValueAtTime(0.35,now);sg2.gain.exponentialRampToValueAtTime(0.001,now+0.3);sb.connect(sg2);sg2.connect(vol);sb.start(now);sb.stop(now+0.32);nb(0.05,2,0.45,'bandpass',1100,3).start(now);var bd=ctx.createOscillator();bd.type='triangle';bd.frequency.value=120;var bg=ctx.createGain();bg.gain.setValueAtTime(0.2,now+0.02);bg.gain.exponentialRampToValueAtTime(0.001,now+0.22);bd.connect(bg);bg.connect(vol);bd.start(now+0.02);bd.stop(now+0.24);}
      else if(type==='discardCard'){var b3=ctx.createBuffer(1,ctx.sampleRate*0.25,ctx.sampleRate),d3=b3.getChannelData(0);for(var i=0;i<d3.length;i++){var t=i/d3.length;d3[i]=(Math.random()*2-1)*Math.pow(1-t,1.4)*0.3;}var s3=ctx.createBufferSource();s3.buffer=b3;var fi=ctx.createBiquadFilter();fi.type='lowpass';fi.frequency.setValueAtTime(4000,now);fi.frequency.exponentialRampToValueAtTime(200,now+0.25);s3.connect(fi);fi.connect(vol);s3.start(now);}
      else if(type==='dragStart'){var o2=ctx.createOscillator();o2.type='sine';o2.frequency.value=600;var g2=ctx.createGain();g2.gain.setValueAtTime(0.06,now);g2.gain.exponentialRampToValueAtTime(0.001,now+0.06);o2.connect(g2);g2.connect(vol);o2.start(now);o2.stop(now+0.08);}
      else if(type==='dragDrop'){var th=ctx.createOscillator();th.type='sine';th.frequency.setValueAtTime(100,now);th.frequency.exponentialRampToValueAtTime(45,now+0.12);var tg=ctx.createGain();tg.gain.setValueAtTime(0.3,now);tg.gain.exponentialRampToValueAtTime(0.001,now+0.18);th.connect(tg);tg.connect(vol);th.start(now);th.stop(now+0.2);nb(0.04,2.5,0.35,'bandpass',1200,3).start(now);}
      setTimeout(function(){try{vol.disconnect();}catch(e){}},900);
    }catch(e){}
  }
  window.playSfx = enhanced;
})();

/* ── 2. Card info open sound ── */
(function(){
  if(window.__FATES_CARD_INFO_SOUND_INSTALLED) return;
  window.__FATES_CARD_INFO_SOUND_INSTALLED = true;
  var orig = window.openCardDetail || (typeof openCardDetail==='function'?openCardDetail:null);
  if(!orig) return;
  window.openCardDetail = function(c,fh,fb){ playSfx('cardInfoOpen'); return orig(c,fh,fb); };
})();

// Drag-to-place is intentionally disabled. The multiplayer UI uses click/detail
// selection only so hand-card hover and modal clicks do not fight old drag paths.
window.__FATES_HAND_DRAG_V9_INSTALLED = true;
window.__FATES_HAND_DRAG_INSTALLED = false;

/* ── 3. HOLD-TO-DRAG PLACEMENT (disabled legacy block) ── */
(function(){
  'use strict';
  // Replace any earlier installer in this build. Only this v9 path should own hand dragging.
  if(window.__FATES_HAND_DRAG_V9_INSTALLED) return;
  window.__FATES_HAND_DRAG_V9_INSTALLED = true;
  window.__FATES_HAND_DRAG_INSTALLED = true;

  var st = null;
  var THRESH = 5;

  function activeGame(){ var gs=document.getElementById('s-game'); return gs && gs.classList.contains('active'); }
  function handIndex(el){ var p=document.getElementById('hand-cards'); return p ? Array.prototype.indexOf.call(p.children, el) : -1; }
  function clearHover(){ document.querySelectorAll('.cell.drag-hover').forEach(function(c){c.classList.remove('drag-hover');}); }
  function clearDragTargets(){ document.querySelectorAll('.cell.drag-tribute-target').forEach(function(c){c.classList.remove('drag-tribute-target');}); }
  function clearGhost(){ var g=document.getElementById('drag-ghost'); if(g) g.remove(); }

  function makeGhost(el, x, y){
    clearGhost();
    var r = el.getBoundingClientRect();
    var g = el.cloneNode(true);
    g.id = 'drag-ghost';
    g.classList.remove('sel','hc-entering','dim');
    g.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:10000;opacity:.92;'+
      'width:'+r.width+'px;height:'+r.height+'px;'+
      'box-shadow:0 18px 52px rgba(0,0,0,.78),0 0 0 2px rgba(201,168,76,.72);'+
      'border-radius:6px;will-change:transform;transition:none;';
    document.body.appendChild(g);
    moveGhost(g, x, y);
    return g;
  }

  function moveGhost(g, x, y){
    if(!g) return;
    var w = g.offsetWidth || 110, h = g.offsetHeight || 154;
    g.style.transform = 'translate('+(x - w/2)+'px,'+(y - h/2 - 14)+'px) scale(1.06) rotate(-1.5deg)';
  }

  function cleanup(opts){
    opts = opts || {};
    if(st && st.ghost && st.ghost.parentNode) st.ghost.remove();
    clearGhost();
    if(st && st.el) st.el.style.opacity = '';
    clearHover();
    clearDragTargets();
    document.body.classList.remove('dragging-card');
    if(opts.clearPlacement && typeof G !== 'undefined' && G){
      G.selectedHandCard = null;
      G.placing = false;
      if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
      if(opts.render !== false && typeof renderHand === 'function') renderHand();
    }
    st = null;
  }

  var blockNextClick = false;
  document.addEventListener('click', function(e){
    if(!blockNextClick) return;
    blockNextClick = false;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
  }, true);

  function canStartFromEvent(e){
    if(e.button !== 0 || !activeGame()) return false;
    if(typeof G === 'undefined' || !G || G.phase !== 'main') return false;
    if(G._boardTargeting || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._busserMoving || G._busserMovingCard || G._markSelecting) return false;
    if(G.aiEnabled && (G.currentPlayer === G.aiPlayer || G._aiRunning)) return false;
    return true;
  }

  function beginDrag(e){
    if(!st || st.dragging) return;
    st.dragging = true;
    st.ghost = makeGhost(st.el, e.clientX, e.clientY);
    st.el.style.opacity = '0.18';
    document.body.classList.add('dragging-card');
    if(typeof playSfx === 'function') playSfx('dragStart');

    G.selectedHandCard = st.idx;
    G.placing = true;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof highlightValidCells === 'function') highlightValidCells(st.card);

    if(st.card.type !== 'Supporter'){
      var cp = G.currentPlayer;
      (G.board || []).forEach(function(zone,z){ (zone || []).forEach(function(row,r){
        (row || []).forEach(function(cell,c){
          if(cell && cell.owner === cp && cell.type === 'Supporter' && !cell.noConsolidate){
            var el = document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
            if(el) el.classList.add('placeable','drag-tribute-target');
          }
        });
      });});
    }
  }

  function onDown(e){
    if(!canStartFromEvent(e)) return;
    var hc = e.target && e.target.closest ? e.target.closest('#hand-cards .hc') : null;
    if(!hc || hc.classList.contains('dim')) return;
    var cp = (typeof getPerspectivePlayerIndex === 'function') ? getPerspectivePlayerIndex() : G.currentPlayer;
    if(cp !== G.currentPlayer) return;
    var idx = handIndex(hc);
    if(idx < 0) return;
    var card = G.players[cp] && G.players[cp].hand ? G.players[cp].hand[idx] : null;
    if(!card) return;
    st = {el:hc, idx:idx, card:card, sx:e.clientX, sy:e.clientY, dragging:false, ghost:null};
  }

  function onMove(e){
    if(!st) return;
    if(typeof e.buttons === 'number' && (e.buttons & 1) === 0){ cleanup({clearPlacement:true}); return; }
    var dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if(!st.dragging){
      if(Math.sqrt(dx*dx + dy*dy) < THRESH) return;
      beginDrag(e);
    }
    if(!st || !st.dragging) return;
    e.preventDefault();
    moveGhost(st.ghost, e.clientX, e.clientY);
    clearHover();
    if(st.ghost) st.ghost.style.display = 'none';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    if(st.ghost) st.ghost.style.display = '';
    var cell = under && under.closest ? under.closest('.cell') : null;
    if(cell && (cell.classList.contains('placeable') || !cell.querySelector('.bc'))) cell.classList.add('drag-hover');
  }

  function onUp(e){
    if(!st) return;
    if(!st.dragging){ cleanup(); return; }
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    blockNextClick = true;

    var idx = st.idx, card = st.card;
    if(st.ghost) st.ghost.style.display = 'none';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    if(st && st.ghost) st.ghost.style.display = '';
    var cell = under && under.closest ? under.closest('.cell') : null;
    if(!cell){ cleanup({clearPlacement:true}); return; }

    var z = parseInt(cell.dataset.z, 10), r = parseInt(cell.dataset.r, 10), c = parseInt(cell.dataset.c, 10);
    var boardCard = G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
    cleanup({clearPlacement:false, render:false});

    G.selectedHandCard = idx;
    G.placing = true;
    if(typeof playSfx === 'function') playSfx('dragDrop');

    if(card.type === 'Supporter'){
      if(boardCard){ toast('Cell is occupied'); G.selectedHandCard=null; G.placing=false; if(typeof clearPlaceHighlights==='function') clearPlaceHighlights(); if(typeof renderHand==='function') renderHand(); return; }
      if(typeof clickCell === 'function') clickCell(z,r,c);
      return;
    }

    // Non-supporters use the existing consolidate pathway; dropping on a friendly supporter selects it.
    G.placing = false;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof initiateConsolidate === 'function') initiateConsolidate();
    if(boardCard && boardCard.owner === G.currentPlayer && boardCard.type === 'Supporter' && typeof handleConsolidateClick === 'function'){
      setTimeout(function(){ handleConsolidateClick(z,r,c); }, 20);
    }
  }

  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
  window.addEventListener('blur', function(){ if(st) cleanup({clearPlacement:true}); clearGhost(); });
  document.addEventListener('mouseleave', function(e){ if(st && st.dragging && e.relatedTarget === null) cleanup({clearPlacement:true}); }, true);
})();


/* ── 4. LAST TURN RED ── */
(function(){
  if(window.__FATES_LAST_TURN_ENHANCED_INSTALLED) return;
  window.__FATES_LAST_TURN_ENHANCED_INSTALLED = true;
  var orig=window.showLastTurnBanner||(typeof showLastTurnBanner==='function'?showLastTurnBanner:null);
  if(!orig) return;
  window.showLastTurnBanner=function(pn,isFinal){
    var ex=document.getElementById('last-turn-banner');if(ex)ex.remove();
    var b=document.createElement('div');b.id='last-turn-banner';
    var text=isFinal?'FINAL TURN':(pn+'\'s LAST TURN');
    b.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:9000;pointer-events:none;animation:lastTurnIn .6s ease;background:radial-gradient(ellipse at center,rgba(80,0,0,.2) 0%,transparent 70%);';
    b.innerHTML='<div style="font-family:Cinzel,serif;font-size:2.4rem;font-weight:900;color:#ff4444;text-shadow:0 0 26px rgba(255,60,60,.85),0 0 62px rgba(255,30,30,.45),0 4px 12px rgba(0,0,0,.85);letter-spacing:.15em;text-transform:uppercase;animation:lastTurnPulse 1.5s ease;">'+text+'</div>';
    document.body.appendChild(b);
    if(typeof playSfx==='function') playSfx('lastTurn');
    var gs=document.getElementById('s-game');if(gs)gs.classList.add('final-turn');
    setTimeout(function(){if(b.parentNode){b.style.animation='lastTurnOut .5s ease forwards';setTimeout(function(){if(b.parentNode)b.remove();},500);}},2500);
  };
})();

/* ── 5. CINEMATIC PLACEMENT ANIMATIONS ── */
(function(){
  if(window.__FATES_PLACEMENT_CINEMATIC_INSTALLED) return;
  window.__FATES_PLACEMENT_CINEMATIC_INSTALLED = true;
  var orig=window.playPlacementAnimation||(typeof playPlacementAnimation==='function'?playPlacementAnimation:null);
  function buildOverlayMarkup(rarity){
    if(rarity==='star'){
      return '<div class="cine-core"></div><div class="cine-halo"></div><div class="cine-rays">'
        + '<span style="--rot:0deg"></span><span style="--rot:45deg"></span><span style="--rot:90deg"></span><span style="--rot:135deg"></span>'
        + '<span style="--rot:180deg"></span><span style="--rot:225deg"></span><span style="--rot:270deg"></span><span style="--rot:315deg"></span>'
        + '</div>';
    }
    if(rarity==='square'){
      return '<div class="cine-core"></div><div class="cine-frame frame-a"></div><div class="cine-frame frame-b"></div><div class="cine-shards">'
        + '<span style="--dx:-1;--dy:-1"></span><span style="--dx:1;--dy:-1"></span><span style="--dx:-1;--dy:1"></span><span style="--dx:1;--dy:1"></span>'
        + '</div>';
    }
    if(rarity==='triangle'){
      return '<div class="cine-core"></div><div class="cine-tri tri-a"></div><div class="cine-tri tri-b"></div><div class="cine-trails">'
        + '<span style="--tx:-40px"></span><span style="--tx:0px"></span><span style="--tx:40px"></span>'
        + '</div>';
    }
    return '<div class="cine-core"></div><div class="cine-ring cine-ring-1"></div><div class="cine-halo"></div>';
  }
  window.playPlacementAnimation=function(card,z,r,c){
    var ms=0;if(orig)ms=orig(card,z,r,c);
    var rarity=card?(card.rarity||'circle'):'circle';
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      var cellEl=document.querySelector('#board .cell[data-z="'+z+'"][data-r="'+r+'"][data-c="'+c+'"]');
      if(!cellEl)return;var rect=cellEl.getBoundingClientRect();
      var dur={star:1200,square:980,triangle:860,circle:700}[rarity]||780;
      var ov=document.createElement('div');ov.className='cinematic-overlay cinematic-'+rarity;
      ov.style.cssText='position:fixed;left:'+(rect.left+rect.width/2)+'px;top:'+(rect.top+rect.height/2)+'px;transform:translate(-50%,-50%);z-index:9500;pointer-events:none;';
      ov.innerHTML=buildOverlayMarkup(rarity);
      document.body.appendChild(ov);
      if(typeof showCinematicSubtitle==='function') setTimeout(function(){ showCinematicSubtitle(card,Math.max(1300,dur+900),rarity); }, 380);
      setTimeout(function(){if(ov.parentNode)ov.remove();},dur);
    });});
    return Math.max(ms, {star:900,square:760,triangle:680,circle:560}[rarity]||560);
  };
})();

/* ── 6. Felicyta Janowicz banner name fix ── */
(function(){
  if(window.__FATES_BANNER_FIT_ENHANCEMENT_INSTALLED) return;
  window.__FATES_BANNER_FIT_ENHANCEMENT_INSTALLED = true;
  var origFit=window.fitBannerNames||(typeof fitBannerNames==='function'?fitBannerNames:null);
  window.fitBannerNames=function(){
    if(origFit)origFit();
    document.querySelectorAll('#s-game .pb-name:not(.pb-name-wrap)').forEach(function(el){
      var text=(el.textContent||'').trim();if(!text||text.length<10)return;
      if(el.scrollWidth>el.clientWidth+2){
        el.classList.add('pb-name-fit-long','pb-name-wrap');
        var banner=el.closest?el.closest('.player-banner'):null;
        var pic=banner?banner.querySelector('.pb-pic'):null;
        if(banner&&pic){var br=banner.getBoundingClientRect();var pr=pic.getBoundingClientRect();var bs=getComputedStyle(banner);var gap=parseFloat(bs.columnGap||bs.gap)||12;var padR=parseFloat(bs.paddingRight)||0;el.style.maxWidth=Math.max(44,br.width-pr.width-gap-padR-6)+'px';}
        el.style.letterSpacing='0';
      }
    });
  };
  var origBanners=window.updatePlayerBanners||(typeof updatePlayerBanners==='function'?updatePlayerBanners:null);
  if(origBanners){window.updatePlayerBanners=function(){origBanners();requestAnimationFrame(function(){if(typeof fitBannerNames==='function')fitBannerNames();});};}
})();

/* ── 7. MULTIPLAYER STUBS ── */
(function(){
  function NM(){this.ws=null;this.roomId=null;this.playerId=null;this.isHost=false;this.connected=false;this.pendingActions=[];this.onGameState=null;this.onOpponentAction=null;this.onChat=null;this.onError=null;}
  NM.prototype.connect=function(url){var s=this;return new Promise(function(res,rej){try{s.ws=new WebSocket(url);s.ws.onopen=function(){s.connected=true;res();};s.ws.onmessage=function(e){s._handle(JSON.parse(e.data));};s.ws.onclose=function(){s.connected=false;};s.ws.onerror=function(e){if(s.onError)s.onError(e);rej(e);};}catch(e){rej(e);}});};
  NM.prototype.createRoom=function(d){this._send({type:'create_room',deck:d});};
  NM.prototype.joinRoom=function(id,d){this._send({type:'join_room',roomId:id,deck:d});};
  NM.prototype.sendAction=function(a){if(!this.connected){this.pendingActions.push(a);return;}this._send({type:'game_action',roomId:this.roomId,action:a});};
  NM.prototype.sendChat=function(t){this._send({type:'chat',roomId:this.roomId,text:t});};
  NM.prototype.disconnect=function(){if(this.ws){this.ws.close();this.ws=null;}this.connected=false;};
  NM.prototype._send=function(d){if(this.ws&&this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(d));};
  NM.prototype._handle=function(m){if(m.type==='room_created'){this.roomId=m.roomId;this.playerId=m.playerId;this.isHost=true;}else if(m.type==='room_joined'){this.roomId=m.roomId;this.playerId=m.playerId;}else if(m.type==='game_start'||m.type==='state_sync'){if(this.onGameState)this.onGameState(m.state);}else if(m.type==='opponent_action'){if(this.onOpponentAction)this.onOpponentAction(m.action);}else if(m.type==='chat'){if(this.onChat)this.onChat(m);}};
  window.LegacyNetworkManager=window.LegacyNetworkManager||NM;
  window.mpSendAction=function(){console.warn('[Fates Online] Legacy WebSocket multiplayer is disabled; use RTDB room actions.');};
})();

console.log('[Enhancements] 14-enhancements.js loaded');

/* CSS OVERRIDE CLEANUP v3
   Permanent UI overrides now live in src/styles/99-ui-final.css.
   This old JS-injected style block is intentionally disabled so CSS order is predictable. */



/* v9: cancel lingering board target/move flows with Escape or right click. */
(function(){
  if(window.__FATES_TARGET_CANCEL_V9) return;
  window.__FATES_TARGET_CANCEL_V9 = true;
  function cancelPendingTargetFlow(){
    if(typeof G === 'undefined' || !G) return false;
    var had = !!(G._boardTargeting || G._wolfCreekMoving || G._expMoving || G._berkeleyMoving || G._bh01Moving || G._busserMoving || G._busserMovingCard || G._markSelecting);
    if(!had) return false;
    if(typeof clearBoardTargetSelection === 'function') clearBoardTargetSelection();
    G._wolfCreekMoving = null; G._expMoving = null; G._berkeleyMoving = null; G._bh01Moving = null;
    G._busserMoving = null; G._busserMovingCard = null; G._markSelecting = null; G.placing = false;
    if(typeof clearPlaceHighlights === 'function') clearPlaceHighlights();
    if(typeof setHint === 'function') setHint('Select a card to play');
    if(typeof renderGame === 'function') renderGame();
    if(typeof renderHand === 'function') renderHand();
    if(typeof toast === 'function') toast('Selection cancelled');
    return true;
  }
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') cancelPendingTargetFlow(); }, true);
  document.addEventListener('contextmenu', function(e){ if(cancelPendingTargetFlow()){ e.preventDefault(); e.stopPropagation(); } }, true);
})();
