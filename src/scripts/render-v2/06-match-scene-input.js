(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateMatchSceneInput) return;

  class FateMatchSceneInput {
    constructor(scene){
      this.scene = scene || null;
      this.container = null;
      this.pointerDownHit = null;
      this.pointerDownPoint = null;
      this.viewportPointerDownHit = null;
      this.viewportPointerDownPoint = null;
      this.lastHandledAt = 0;
      this.moveRaf = 0;
      this.pendingMove = null;
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handleViewportPointerDown = this.handleViewportPointerDown.bind(this);
      this.handleViewportPointerUp = this.handleViewportPointerUp.bind(this);
      this.handleViewportPointerMove = this.handleViewportPointerMove.bind(this);
      this.handleViewportClick = this.handleViewportClick.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
    }

    attach(container){
      if(this.container === container) return;
      this.detach();
      this.container = container || null;
      if(!this.container) return;
      this.container.addEventListener('pointerdown', this.handlePointerDown, {passive:true});
      this.container.addEventListener('pointerup', this.handlePointerUp, {passive:true});
      this.container.addEventListener('pointermove', this.handlePointerMove, {passive:true});
      this.container.addEventListener('wheel', this.handleWheel, {passive:false});
      document.addEventListener('pointerdown', this.handleViewportPointerDown, {capture:true, passive:true});
      document.addEventListener('pointerup', this.handleViewportPointerUp, {capture:true, passive:false});
      document.addEventListener('pointermove', this.handleViewportPointerMove, {capture:true, passive:true});
      document.addEventListener('click', this.handleViewportClick, {capture:true, passive:false});
    }

    detach(){
      if(!this.container) return;
      this.container.removeEventListener('pointerdown', this.handlePointerDown);
      this.container.removeEventListener('pointerup', this.handlePointerUp);
      this.container.removeEventListener('pointermove', this.handlePointerMove);
      this.container.removeEventListener('wheel', this.handleWheel);
      document.removeEventListener('pointerdown', this.handleViewportPointerDown, true);
      document.removeEventListener('pointerup', this.handleViewportPointerUp, true);
      document.removeEventListener('pointermove', this.handleViewportPointerMove, true);
      document.removeEventListener('click', this.handleViewportClick, true);
      if(this.moveRaf) {
        cancelAnimationFrame(this.moveRaf);
        this.moveRaf = 0;
      }
      this.container = null;
      this.pointerDownHit = null;
      this.pointerDownPoint = null;
      this.viewportPointerDownHit = null;
      this.viewportPointerDownPoint = null;
      this.pendingMove = null;
    }

    updateScene(scene){
      this.scene = scene || this.scene;
    }

    eventPoint(ev){
      return this.pointFromClient(ev.clientX, ev.clientY);
    }

    recordInputDebug(kind, data){
      try {
        const perf = window.__fatePerf = window.__fatePerf || {};
        const list = perf.sceneInputDebug = Array.isArray(perf.sceneInputDebug) ? perf.sceneInputDebug : [];
        list.push(Object.assign({
          at:Math.round(performance.now ? performance.now() : Date.now()),
          kind
        }, data || {}));
        while(list.length > 36) list.shift();
      } catch(e) {}
    }

    targetSummary(target){
      if(!target) return '';
      const id = target.id ? ('#' + target.id) : '';
      const cls = target.className && typeof target.className === 'string'
        ? ('.' + target.className.trim().split(/\s+/).slice(0, 4).join('.'))
        : '';
      return String((target.tagName || 'node').toLowerCase() + id + cls);
    }

    pointFromClient(clientX, clientY){
      const target = this.container;
      const r = target && target.getBoundingClientRect ? target.getBoundingClientRect() : {left:0, top:0, width:1, height:1};
      const cssW = target && target.__fateCssW ? target.__fateCssW : (target && target.clientWidth ? target.clientWidth : r.width || 1);
      const cssH = target && target.__fateCssH ? target.__fateCssH : (target && target.clientHeight ? target.clientHeight : r.height || 1);
      return {
        x:(clientX - r.left) * (cssW / Math.max(1, r.width || cssW)),
        y:(clientY - r.top) * (cssH / Math.max(1, r.height || cssH)),
        clientX,
        clientY
      };
    }

    isModalBlockingSceneInput(){
      try {
        const modal = document.getElementById('modal');
        if(modal && modal.classList && modal.classList.contains('on')) {
          this.recordInputDebug('blocked-modal', {source:'#modal.on'});
          return true;
        }
        const blockers = document.querySelectorAll('.overlay.on, .card-info-overlay.on, [role="dialog"][aria-modal="true"], .modal[aria-modal="true"], .card-detail-modal.on, .card-info-modal.on');
        for(let i = 0; i < blockers.length; i++){
          const el = blockers[i];
          if(!el) continue;
          const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
          if(style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) continue;
          if(style && style.pointerEvents === 'none') continue;
          if(el.getClientRects && el.getClientRects().length) {
            this.recordInputDebug('blocked-modal', {source:this.targetSummary(el)});
            return true;
          }
        }
      } catch(e) {}
      return false;
    }

    isDomControlTarget(target){
      if(!target || !target.closest) return false;
      return !!target.closest('button, a, input, select, textarea, label, summary, [role="button"], [data-scene-input="ignore"], .side-panel, .right-panel, .hud-panel, .match-side-panel, #right-panel, #turn-panel, #topbar, #btn-end-turn');
    }

    isViewportCanvasTarget(target){
      if(!target) return false;
      if(target === this.container) return true;
      if(this.container && this.container.contains && this.container.contains(target)) return true;
      if(target.classList && target.classList.contains('fate-match-v2-layer-canvas')) return true;
      const ids = [
        'fate-match-v2-canvas',
        'fate-match-v2-ui-canvas',
        'fate-match-v2-hover-canvas',
        'fate-match-v2-effect-canvas',
        'fate-board-canvas'
      ];
      for(let i = 0; i < ids.length; i++){
        const canvas = document.getElementById(ids[i]);
        if(canvas && (target === canvas || (canvas.contains && canvas.contains(target)))) return true;
      }
      return false;
    }

    hitTest(x, y){
      const scene = this.scene || window.FateMatchRendererAdapter;
      const hitMap = scene && typeof scene.getHitMap === 'function' ? scene.getHitMap() : null;
      const cells = hitMap && Array.isArray(hitMap.cells) ? hitMap.cells : [];
      const cards = hitMap && Array.isArray(hitMap.cards) ? hitMap.cards : [];

      for(let i = cards.length - 1; i >= 0; i--){
        const hit = cards[i];
        const r = hit && hit.rect;
        if(r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return Object.assign({kind:'card'}, hit);
      }
      for(let j = cells.length - 1; j >= 0; j--){
        const hit = cells[j];
        const r = hit && hit.rect;
        if(r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return Object.assign({kind:'cell'}, hit);
      }
      return null;
    }

    viewportHitTest(clientX, clientY){
      const scene = this.scene || window.FateMatchRendererAdapter;
      const hitMap = scene && typeof scene.getHitMap === 'function' ? scene.getHitMap() : null;
      if(!hitMap) return null;
      const point = this.pointFromClient(clientX, clientY);
      const candidates = [
        {x:clientX, y:clientY, space:'viewport'},
        {x:point.x, y:point.y, space:'board'}
      ];
      const groups = [
        {items:Array.isArray(hitMap.uiCommands) ? hitMap.uiCommands : [], kind:'ui-command'},
        {items:Array.isArray(hitMap.handEffectIcons) ? hitMap.handEffectIcons : [], kind:'hand-effect-icon'},
        {items:Array.isArray(hitMap.handCards) ? hitMap.handCards : [], kind:'hand-card'},
        {items:Array.isArray(hitMap.opponentHandCards) ? hitMap.opponentHandCards : [], kind:'opponent-hand-card'},
        {items:Array.isArray(hitMap.piles) ? hitMap.piles : [], kind:'pile'}
      ];
      for(let g = 0; g < groups.length; g++){
        const group = groups[g];
        for(let i = group.items.length - 1; i >= 0; i--){
          const hit = group.items[i];
          const r = hit && hit.rect;
          if(!r) continue;
          for(let c = 0; c < candidates.length; c++){
            const p = candidates[c];
            if(p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
              return Object.assign({kind:group.kind, clientX, clientY, x:p.x, y:p.y, hitSpace:p.space}, hit);
            }
          }
        }
      }
      return null;
    }

    handleViewportPointerDown(ev){
      if(this.isModalBlockingSceneInput()) {
        this.viewportPointerDownHit = null;
        this.viewportPointerDownPoint = null;
        return;
      }
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(ev.button !== 0) return;
      if(this.isDomControlTarget(ev.target)) {
        this.recordInputDebug('viewport-down-dom-control', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      const hit = this.viewportHitTest(ev.clientX, ev.clientY);
      if(!hit) {
        this.recordInputDebug('viewport-down-miss', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      this.recordInputDebug('viewport-down-hit', {target:this.targetSummary(ev.target), kind:hit.kind, command:hit.command || '', index:hit.index, hitSpace:hit.hitSpace || '', clientX:ev.clientX, clientY:ev.clientY});
      this.viewportPointerDownHit = hit;
      this.viewportPointerDownPoint = {clientX:ev.clientX, clientY:ev.clientY};
    }

    handleViewportPointerUp(ev){
      if(this.isModalBlockingSceneInput()) {
        this.viewportPointerDownHit = null;
        this.viewportPointerDownPoint = null;
        return;
      }
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(ev.button !== 0) return;
      if(this.isDomControlTarget(ev.target)) {
        this.recordInputDebug('viewport-up-dom-control', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        this.viewportPointerDownHit = null;
        this.viewportPointerDownPoint = null;
        return;
      }
      const started = this.viewportPointerDownHit;
      const startedPoint = this.viewportPointerDownPoint;
      this.viewportPointerDownHit = null;
      this.viewportPointerDownPoint = null;
      if(!started || !startedPoint) {
        this.recordInputDebug('viewport-up-no-start', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      if(Math.abs(ev.clientX - startedPoint.clientX) > 10 || Math.abs(ev.clientY - startedPoint.clientY) > 10) {
        this.recordInputDebug('viewport-up-moved', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      const ended = this.viewportHitTest(ev.clientX, ev.clientY);
      if(!ended || ended.kind !== started.kind) {
        this.recordInputDebug('viewport-up-hit-mismatch', {target:this.targetSummary(ev.target), started:started.kind, ended:ended && ended.kind || '', clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      if(ended.kind === 'hand-card' && ended.index !== started.index) return;
      if(ended.kind === 'opponent-hand-card' && ended.index !== started.index) return;
      if(ended.kind === 'pile' && (ended.playerIndex !== started.playerIndex || ended.pile !== started.pile)) return;
      if(ended.kind === 'ui-command' && ended.command !== started.command) return;
      if(performance.now && performance.now() - this.lastHandledAt < 80) {
        this.recordInputDebug('viewport-up-throttled', {target:this.targetSummary(ev.target), kind:ended.kind, command:ended.command || ''});
        return;
      }
      this.lastHandledAt = performance.now ? performance.now() : Date.now();
      this.recordInputDebug('viewport-dispatch', {target:this.targetSummary(ev.target), kind:ended.kind, command:ended.command || '', index:ended.index, hitSpace:ended.hitSpace || ''});
      ev.preventDefault();
      ev.stopPropagation();
      this.dispatchViewportHit(ended);
    }

    handleViewportClick(ev){
      if(this.isModalBlockingSceneInput()) return;
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(this.isDomControlTarget(ev.target)) {
        this.recordInputDebug('viewport-click-dom-control', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      if(performance.now && performance.now() - this.lastHandledAt < 80) return;
      const hit = this.viewportHitTest(ev.clientX, ev.clientY);
      if(!hit || (hit.kind !== 'hand-card' && hit.kind !== 'opponent-hand-card' && hit.kind !== 'pile' && hit.kind !== 'ui-command')) {
        this.recordInputDebug('viewport-click-miss', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      this.lastHandledAt = performance.now ? performance.now() : Date.now();
      this.recordInputDebug('viewport-click-dispatch', {target:this.targetSummary(ev.target), kind:hit.kind, command:hit.command || '', index:hit.index, hitSpace:hit.hitSpace || ''});
      ev.preventDefault();
      ev.stopPropagation();
      this.dispatchViewportHit(hit);
    }

    handleViewportPointerMove(ev){
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard() || typeof scene.setViewportHoverHit !== 'function') return;
      const modal = document.getElementById('modal');
      if(modal && modal.classList && modal.classList.contains('on')) {
        scene.setViewportHoverHit(null);
        return;
      }
      if(document.body && document.body.classList && document.body.classList.contains('fate-v2-dragging-card')) {
        scene.setViewportHoverHit(null);
        return;
      }
      const hit = this.viewportHitTest(ev.clientX, ev.clientY);
        scene.setViewportHoverHit(hit && (hit.kind === 'hand-card' || hit.kind === 'hand-effect-icon' || hit.kind === 'pile') ? hit : null);
    }

    handlePointerMove(ev){
      if(this.isModalBlockingSceneInput()) {
        this.pendingMove = null;
        const scene = this.scene || window.FateMatchRendererAdapter;
        if(scene && typeof scene.setHoverHit === 'function') scene.setHoverHit(null);
        return;
      }
      this.pendingMove = {clientX:ev.clientX, clientY:ev.clientY};
      if(this.moveRaf) return;
      this.moveRaf = requestAnimationFrame(() => {
        this.moveRaf = 0;
        const scene = this.scene || window.FateMatchRendererAdapter;
        if(!scene || !scene.ownsBoard || !scene.ownsBoard() || !this.pendingMove) return;
        const p = this.pointFromClient(this.pendingMove.clientX, this.pendingMove.clientY);
        this.pendingMove = null;
        const hit = this.hitTest(p.x, p.y);
        if(scene && typeof scene.setHoverHit === 'function') scene.setHoverHit(hit);
      });
    }

    handleWheel(ev){
      if(this.isModalBlockingSceneInput()) return;
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(typeof scene.scrollZoneAtClient === 'function' && scene.scrollZoneAtClient(ev.clientX, ev.clientY, ev.deltaY)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }

    handlePointerDown(ev){
      if(this.isModalBlockingSceneInput()) {
        this.pointerDownHit = null;
        this.pointerDownPoint = null;
        return;
      }
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(ev.button !== 0) return;
      const p = this.eventPoint(ev);
      this.pointerDownHit = this.hitTest(p.x, p.y);
      this.pointerDownPoint = p;
    }

    handlePointerUp(ev){
      if(this.isModalBlockingSceneInput()) {
        this.pointerDownHit = null;
        this.pointerDownPoint = null;
        return;
      }
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(ev.button !== 0) return;
      const started = this.pointerDownHit;
      const startedPoint = this.pointerDownPoint;
      this.pointerDownHit = null;
      this.pointerDownPoint = null;
      if(!started || !startedPoint) return;
      if(Math.abs(ev.clientX - startedPoint.clientX) > 10 || Math.abs(ev.clientY - startedPoint.clientY) > 10) return;
      const p = this.eventPoint(ev);
      const ended = this.hitTest(p.x, p.y);
      if(!ended || ended.z !== started.z || ended.r !== started.r || ended.c !== started.c) return;
      if(performance.now && performance.now() - this.lastHandledAt < 80) return;
      this.lastHandledAt = performance.now ? performance.now() : Date.now();
      this.dispatchHit(ended);
    }

    dispatchHit(hit){
      if(!hit || typeof G === 'undefined' || !G) return;
      const z = Number(hit.z);
      const r = Number(hit.r);
      const c = Number(hit.c);
      const boardCard = G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
      const isCellActionMode = !!(G._consolidating || G.blockingCell || G._boardTargeting || G.placing);
      try {
        if(G._isSpectator) {
          if(boardCard && typeof openCardDetail === 'function') openCardDetail(boardCard, false, true);
        } else if(isCellActionMode) {
          if(typeof clickCell === 'function') clickCell(z, r, c);
        } else if(boardCard && hit.kind === 'card') {
          if(typeof activateBoardCard === 'function') activateBoardCard(boardCard, z, r, c);
        } else if(!boardCard) {
          if(typeof clickCell === 'function') clickCell(z, r, c);
        }
      } finally {
        if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
          if(isCellActionMode) {
            setTimeout(function(){
              if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
                window.FateMatchRendererAdapter.scheduleRender('input');
              }
            }, 120);
          } else {
            window.FateMatchRendererAdapter.scheduleRender('input');
          }
        }
      }
    }

    dispatchViewportHit(hit){
      if(!hit || typeof G === 'undefined' || !G || !Array.isArray(G.players)) return;
      try {
        if(hit.kind === 'hand-card'){
          const cp = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer;
          const card = G.players[cp] && G.players[cp].hand ? G.players[cp].hand[Number(hit.index)] : null;
          if(!card || G._isSpectator) return;
          const canActFromHand = cp === G.currentPlayer;
          let selectable = false;
          try {
            selectable = canActFromHand && ((typeof canPlayCard === 'function' && canPlayCard(card)) || (typeof isSupporterLimitReachedForCard === 'function' && isSupporterLimitReachedForCard(card)));
          } catch(e) {}
          if(selectable) {
            G.selectedHandCard = Number(hit.index);
            G.placing = false;
          }
          if(typeof openCardDetail === 'function') openCardDetail(card, true, false);
        } else if(hit.kind === 'opponent-hand-card') {
          const viewer = typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : (Number(G.currentPlayer) || 0);
          const fallbackOpponent = viewer === 0 ? 1 : 0;
          const playerIndex = Number.isInteger(Number(hit.playerIndex)) ? Number(hit.playerIndex) : fallbackOpponent;
          const isJanswick = (typeof isLandscapeActive === 'function' && isLandscapeActive('igb12')) || G.landscapeId === 'igb12';
          const revealedHit = !!(hit.card && (hit.card.revealed || (!hit.card.hidden && hit.card.visual && !hit.card.visual.isHidden)));
          if(!isJanswick && !revealedHit) return;
          const hand = G.players[playerIndex] && Array.isArray(G.players[playerIndex].hand) ? G.players[playerIndex].hand : [];
          const byIndex = hand[Number(hit.index)] || null;
          const byIid = hit.iid ? hand.find(function(c){ return c && String(c.iid) === String(hit.iid); }) : null;
          const fullCard = byIid || byIndex || null;
          if(fullCard && typeof openCardDetail === 'function') openCardDetail(fullCard, false, false);
          else if(hit.card && !hit.card.hidden && typeof openCardDetail === 'function') openCardDetail(hit.card, false, false);
          else if(typeof showRevealedHandWindow === 'function') showRevealedHandWindow(playerIndex);
        } else if(hit.kind === 'pile') {
          if(hit.pile === 'deck' && typeof showDeckInfo === 'function') showDeckInfo(Number(hit.playerIndex));
          if(hit.pile === 'discard' && typeof showDiscard === 'function') showDiscard(Number(hit.playerIndex));
        } else if(hit.kind === 'ui-command') {
          if(hit.disabled) return;
          if(hit.command === 'end-turn' && typeof endTurn === 'function') {
            endTurn();
          } else if(hit.command === 'consolidate') {
            if(typeof G !== 'undefined' && G && G._consolidating && typeof cancelConsolidation === 'function') cancelConsolidation();
            else if(typeof initiateConsolidate === 'function') initiateConsolidate();
            if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
              window.FateMatchRendererAdapter.scheduleRender('consolidation-state');
            }
          } else if(hit.command === 'end-game' && typeof confirmEndGame === 'function') {
            confirmEndGame();
          } else if(hit.command === 'audio' && typeof showAudioSettings === 'function') {
            showAudioSettings();
          } else if(hit.command === 'world-chat') {
            let inGameWidget = document.getElementById('ingame-chat-widget');
            if(!inGameWidget && typeof initInGameChat === 'function') {
              try { initInGameChat(); } catch(e) {}
              inGameWidget = document.getElementById('ingame-chat-widget');
            }
            const openInGameChat = function(){
              if(inGameWidget && typeof toggleInGameChat === 'function') {
                if(!inGameWidget.classList || !inGameWidget.classList.contains('is-open')) toggleInGameChat();
                if(typeof switchInGameChatTab === 'function') switchInGameChatTab('world');
                const input = document.getElementById('igwc-input') || document.getElementById('igc-input');
                if(input && typeof input.focus === 'function') input.focus({preventScroll:true});
                return true;
              }
              return false;
            };
            if(!openInGameChat()) {
              if(typeof initWorldChat === 'function') {
                try { initWorldChat(); } catch(e) {}
              }
              if(typeof toggleWorldChat === 'function') {
                toggleWorldChat();
              } else {
                const toggle = document.querySelector('#world-chat-toggle,.world-chat-toggle');
                if(toggle && typeof toggle.click === 'function') toggle.click();
              }
            }
          }
        }
      } finally {
        if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
          window.FateMatchRendererAdapter.scheduleRender('viewport-input');
        }
      }
    }
  }

  window.FateMatchSceneInput = FateMatchSceneInput;
})();
