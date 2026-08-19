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
      this.phase7ConsumedBoardClickUntil = 0;
      this.lastHoverSfxKey = '';
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
      this.container.addEventListener('pointerdown', this.handlePointerDown, {passive:false});
      this.container.addEventListener('pointerup', this.handlePointerUp, {passive:false});
      this.container.addEventListener('pointermove', this.handlePointerMove, {passive:true});
      this.container.addEventListener('wheel', this.handleWheel, {passive:false});
      document.addEventListener('pointerdown', this.handleViewportPointerDown, {capture:true, passive:false});
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
      this.lastHoverSfxKey = '';
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

    shouldSuppressHandClick(){
      return Date.now() < (Number(window.__fateV2SuppressHandClickUntil) || 0);
    }

    isAuthoritativeConsolidationActive(){
      try{
        const authoritativeUi = window.FatePhase7CurrentMultiplayerUi?.report?.();
        return authoritativeUi?.active === true && authoritativeUi?.consolidationActive === true;
      }catch(e){
        return false;
      }
    }

    isAuthoritativeBoardSelectionActive(){
      try{
        const authoritativeUi = window.FatePhase7CurrentMultiplayerUi?.report?.();
        return authoritativeUi?.active === true && (
          authoritativeUi?.consolidationActive === true
          || Number(authoritativeUi?.destinationCommandCount || 0) > 0
        );
      }catch(e){
        return false;
      }
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
          if(clientX >= r.x && clientX <= r.x + r.w && clientY >= r.y && clientY <= r.y + r.h) {
            return Object.assign({kind:group.kind, clientX, clientY, x:clientX, y:clientY, hitSpace:'viewport'}, hit);
          }
        }
      }
      return null;
    }

    maybePlayCardHoverSfx(hit){
      if(!hit || (hit.kind !== 'card' && hit.kind !== 'hand-card' && hit.kind !== 'opponent-hand-card')) return;
      if(window.__fateV2DraggingCard || (document.body && document.body.classList && document.body.classList.contains('fate-v2-dragging-card'))) return;
      const card = hit.card || {};
      const key = [hit.kind, card.iid || hit.iid || card.id || hit.index || hit.z + ':' + hit.r + ':' + hit.c].join(':');
      if(!key || key === this.lastHoverSfxKey) return;
      this.lastHoverSfxKey = key;
      if(hit.kind === 'card' && typeof window.playFateBoardCardHoverSfx === 'function') window.playFateBoardCardHoverSfx('v2-board:' + key);
      else if(typeof window.playFateCardHoverSfx === 'function') window.playFateCardHoverSfx('v2:' + key);
      else if(hit.kind === 'card' && typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('boardCardHover', 'v2-board:' + key, 110);
      else if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('cardHover', 'v2:' + key, 95);
    }

    handleViewportPointerDown(ev){
      if(this.isModalBlockingSceneInput()) {
        this.viewportPointerDownHit = null;
        this.viewportPointerDownPoint = null;
        return;
      }
      const viewportHit = this.viewportHitTest(ev.clientX, ev.clientY);
      // The command dock is painted on the same canvas as the board. During an
      // authoritative selector, capture only genuine board clicks; otherwise
      // STOP CONSOLIDATION and the other dock controls are swallowed as target
      // selections before dispatchViewportHit can see them.
      if(this.isAuthoritativeBoardSelectionActive()
        && this.isViewportCanvasTarget(ev.target)
        && viewportHit?.kind !== 'ui-command'){
        this.recordInputDebug('phase7-board-capture-down', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        this.handlePointerDown(ev);
        return;
      }
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(ev.button !== 0) return;
      if(this.isDomControlTarget(ev.target)) {
        this.recordInputDebug('viewport-down-dom-control', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      const hit = viewportHit;
      if(!hit) {
        this.recordInputDebug('viewport-down-miss', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      this.recordInputDebug('viewport-down-hit', {target:this.targetSummary(ev.target), kind:hit.kind, command:hit.command || '', index:hit.index, hitSpace:hit.hitSpace || '', clientX:ev.clientX, clientY:ev.clientY});
      this.viewportPointerDownHit = hit;
      this.viewportPointerDownPoint = {clientX:ev.clientX, clientY:ev.clientY};
    }

    handleViewportPointerUp(ev){
      const viewportHit = this.viewportHitTest(ev.clientX, ev.clientY);
      if(this.isAuthoritativeBoardSelectionActive()
        && this.isViewportCanvasTarget(ev.target)
        && this.viewportPointerDownHit?.kind !== 'ui-command'
        && viewportHit?.kind !== 'ui-command'){
        this.recordInputDebug('phase7-board-capture-up', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        this.handlePointerUp(ev);
        return;
      }
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
      if(started.kind === 'hand-card' && this.shouldSuppressHandClick()) {
        this.recordInputDebug('viewport-up-hand-drag-intent', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      const moveLimit = started.kind === 'hand-card' ? 4 : 10;
      if(Math.abs(ev.clientX - startedPoint.clientX) > moveLimit || Math.abs(ev.clientY - startedPoint.clientY) > moveLimit) {
        this.recordInputDebug('viewport-up-moved', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      const ended = viewportHit;
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
      // During an authoritative board selector (including consolidation), the
      // canvas pointer sequence has already been handled by dispatchHit. Do not
      // let the synthesized click continue into the legacy card-detail route;
      // that route can open a modal and cancel the just-made selection.
      const viewportHit = this.viewportHitTest(ev.clientX, ev.clientY);
      if((this.isAuthoritativeBoardSelectionActive() || (typeof G !== 'undefined' && G?._phase7CurrentMultiplayer === true && Date.now() < this.phase7ConsumedBoardClickUntil))
        && this.isViewportCanvasTarget(ev.target)
        && viewportHit?.kind !== 'ui-command'){
        this.recordInputDebug('phase7-board-click-consumed', {target:this.targetSummary(ev.target)});
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      if(this.isModalBlockingSceneInput()) return;
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(this.isDomControlTarget(ev.target)) {
        this.recordInputDebug('viewport-click-dom-control', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      if(performance.now && performance.now() - this.lastHandledAt < 80) return;
      const hit = viewportHit;
      if(!hit || (hit.kind !== 'hand-card' && hit.kind !== 'opponent-hand-card' && hit.kind !== 'pile' && hit.kind !== 'ui-command')) {
        this.recordInputDebug('viewport-click-miss', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        return;
      }
      if(hit.kind === 'hand-card' && this.shouldSuppressHandClick()) {
        this.recordInputDebug('viewport-click-hand-drag-intent', {target:this.targetSummary(ev.target), clientX:ev.clientX, clientY:ev.clientY});
        ev.preventDefault();
        ev.stopPropagation();
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
      if(window.__fateV2DraggingCard || (document.body && document.body.classList && document.body.classList.contains('fate-v2-dragging-card'))) {
        scene.setViewportHoverHit(null);
        return;
      }
      const hit = this.viewportHitTest(ev.clientX, ev.clientY);
      this.maybePlayCardHoverSfx(hit);
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
        this.maybePlayCardHoverSfx(hit);
        if(scene && typeof scene.setHoverHit === 'function') scene.setHoverHit(hit);
      });
    }

    handleWheel(ev){
      if(this.isModalBlockingSceneInput()) return;
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      // Layout/hit-map coordinates are canvas-local. Pointer handlers already
      // perform this conversion; wheel input must do the same when the board is
      // offset by the profile panel, otherwise every zone misses its scroll
      // rectangle and cards in clipped safe rows cannot be reached.
      const point = this.pointFromClient(ev.clientX, ev.clientY);
      if(typeof scene.scrollZoneAtClient === 'function' && scene.scrollZoneAtClient(point.x, point.y, ev.deltaY)) {
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
      this.recordInputDebug('board-down', {x:p.x, y:p.y, hit:!!this.pointerDownHit, z:this.pointerDownHit && this.pointerDownHit.z, r:this.pointerDownHit && this.pointerDownHit.r, c:this.pointerDownHit && this.pointerDownHit.c});
      if(this.isAuthoritativeBoardSelectionActive()){
        this.phase7ConsumedBoardClickUntil = Date.now() + 300;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    }

    isLiveBoardSelectionActive(){
      if(typeof G === 'undefined' || !G) return false;
      if(this.isAuthoritativeBoardSelectionActive()) return true;
      const localConsolidationActive = typeof isLocalConsolidationActive === 'function'
        ? isLocalConsolidationActive()
        : !!G._consolidating;
      const localActionTurn = typeof isLocalPlayerActionTurn === 'function'
        ? isLocalPlayerActionTurn()
        : true;
      const isMovementTargeting = !!(
        G._wolfCreekMoving ||
        G._expMoving ||
        G._berkeleyMoving ||
        G._bh01Moving ||
        G._landscapeMoving ||
        G._busserMoving ||
        G._busserMovingCard ||
        G._markSelecting
      );
      return !!(
        localActionTurn &&
        (localConsolidationActive || G.blockingCell || G._boardTargeting || G.placing || isMovementTargeting)
      );
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
      if(!startedPoint) { this.recordInputDebug('board-up-no-start'); return; }
      if(Math.abs(ev.clientX - startedPoint.clientX) > 10 || Math.abs(ev.clientY - startedPoint.clientY) > 10) { this.recordInputDebug('board-up-moved'); return; }
      const p = this.eventPoint(ev);
      const ended = this.hitTest(p.x, p.y);
      if(!ended) { this.recordInputDebug('board-up-miss', {x:p.x, y:p.y}); return; }
      // A board selector can render a new row or rebuild its hit map between
      // pointer-down and pointer-up. During an active selector the release hit
      // is the live contract; requiring its coordinates to match the stale
      // pointer-down hit makes the first valid choice disappear. Normal board
      // card clicks retain the stricter same-cell down/up requirement.
      if(!this.isLiveBoardSelectionActive() && (
        !started ||
        ended.z !== started.z ||
        ended.r !== started.r ||
        ended.c !== started.c
      )) { this.recordInputDebug('board-up-mismatch', {started:started && [started.z,started.r,started.c], ended:[ended.z,ended.r,ended.c]}); return; }
      if(performance.now && performance.now() - this.lastHandledAt < 80) { this.recordInputDebug('board-up-throttled'); return; }
      this.lastHandledAt = performance.now ? performance.now() : Date.now();
      this.recordInputDebug('board-dispatch', {z:ended.z, r:ended.r, c:ended.c});
      if(this.isAuthoritativeBoardSelectionActive()){
        this.phase7ConsumedBoardClickUntil = Date.now() + 300;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
      this.dispatchHit(ended);
    }

    dispatchHit(hit){
      if(!hit || typeof G === 'undefined' || !G) return;
      const z = Number(hit.z);
      const r = Number(hit.r);
      const c = Number(hit.c);
      const boardCard = G.board && G.board[z] && G.board[z][r] ? G.board[z][r][c] : null;
      const isCellActionMode = this.isLiveBoardSelectionActive();
      try {
        if(G._phase7CurrentMultiplayer === true && typeof window.fatePhase7HandleBoardClick === 'function'){
          window.fatePhase7HandleBoardClick(z, r, c);
          return;
        }
        if(G._isSpectator) {
          if(boardCard) {
            if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('boardCardClick', 'board-card-click', 120);
            else if(typeof playSfx === 'function') playSfx('boardCardClick');
            window.__fateSuppressNextCardInfoSfxUntil = Date.now() + 180;
            if(typeof openCardDetail === 'function') openCardDetail(boardCard, false, true);
          }
        } else if(isCellActionMode) {
          if(typeof clickCell === 'function') clickCell(z, r, c);
        } else if(boardCard && hit.kind === 'card') {
          if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('boardCardClick', 'board-card-click', 120);
          else if(typeof playSfx === 'function') playSfx('boardCardClick');
          window.__fateSuppressNextCardInfoSfxUntil = Date.now() + 180;
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
          const cp = G._phase7CurrentMultiplayer === true && Number.isInteger(Number(G._onlinePlayerIndex))
            ? Number(G._onlinePlayerIndex)
            : (typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : G.currentPlayer);
          const hand = G.players[cp] && Array.isArray(G.players[cp].hand) ? G.players[cp].hand : [];
          const byIid = hit.iid ? hand.find(function(candidate){
            return candidate && String(candidate.iid || '') === String(hit.iid);
          }) : null;
          const card = byIid || hand[Number(hit.index)] || null;
          const cardIndex = card ? hand.indexOf(card) : -1;
          this.recordInputDebug('hand-resolve', {
            cp,
            hitIid:String(hit.iid || ''),
            hitIndex:Number(hit.index),
            byIidId:String(byIid?.id || ''),
            byIndexId:String(hand[Number(hit.index)]?.id || ''),
            chosenId:String(card?.id || '')
          });
          if(!card) return;
          if(G._isSpectator){
            if(card.hidden || card._spectatorHidden) return;
            if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('cardInfoOpen', 'card-info-open', 180);
            else if(typeof playSfx === 'function') playSfx('cardInfoOpen');
            if(typeof openCardDetail === 'function') openCardDetail(card, false, false);
            return;
          }
          if(G._phase7CurrentMultiplayer === true){
            if(typeof openCardDetail === 'function') openCardDetail(card, true, false);
            return;
          }
          const canActFromHand = cp === G.currentPlayer;
          let selectable = false;
          try {
            selectable = canActFromHand && ((typeof canPlayCard === 'function' && canPlayCard(card)) || (typeof isSupporterLimitReachedForCard === 'function' && isSupporterLimitReachedForCard(card)));
          } catch(e) {}
          if(selectable && typeof selectHandCard === 'function') {
            selectHandCard(cardIndex >= 0 ? cardIndex : Number(hit.index));
            return;
          }
          if(selectable) {
            G.selectedHandCard = cardIndex >= 0 ? cardIndex : Number(hit.index);
            G.placing = false;
            if(typeof playSfx === 'function') playSfx('cardSelect');
            if(typeof openCardDetail === 'function') openCardDetail(card, true, false);
            return;
          }
          if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('cardInfoOpen', 'card-info-open', 180);
          else if(typeof playSfx === 'function') playSfx('cardInfoOpen');
          if(typeof openCardDetail === 'function') openCardDetail(card, true, false);
        } else if(hit.kind === 'opponent-hand-card') {
          const viewer = G._phase7CurrentMultiplayer === true && Number.isInteger(Number(G._onlinePlayerIndex))
            ? Number(G._onlinePlayerIndex)
            : (typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : (Number(G.currentPlayer) || 0));
          const fallbackOpponent = viewer === 0 ? 1 : 0;
          const playerIndex = Number.isInteger(Number(hit.playerIndex)) ? Number(hit.playerIndex) : fallbackOpponent;
          const isJanswick = (typeof isLandscapeActive === 'function' && isLandscapeActive('igb12')) || G.landscapeId === 'igb12';
          const revealedHit = !!(hit.card && (hit.card.revealed || (!hit.card.hidden && hit.card.visual && !hit.card.visual.isHidden)));
          if(!isJanswick && !revealedHit) return;
          const hand = G.players[playerIndex] && Array.isArray(G.players[playerIndex].hand) ? G.players[playerIndex].hand : [];
          const byIndex = hand[Number(hit.index)] || null;
          const byIid = hit.iid ? hand.find(function(c){ return c && String(c.iid) === String(hit.iid); }) : null;
          const fullCard = byIid || byIndex || null;
          if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('cardInfoOpen', 'card-info-open', 180);
          else if(typeof playSfx === 'function') playSfx('cardInfoOpen');
          if(fullCard && typeof openCardDetail === 'function') openCardDetail(fullCard, false, false);
          else if(hit.card && typeof openCardDetail === 'function') openCardDetail(hit.card, false, true);
          else if(typeof showRevealedHandWindow === 'function') showRevealedHandWindow(playerIndex);
        } else if(hit.kind === 'pile') {
          if(hit.pile === 'deck' && typeof showDeckInfo === 'function') showDeckInfo(Number(hit.playerIndex));
          if(hit.pile === 'discard' && typeof showDiscard === 'function') showDiscard(Number(hit.playerIndex));
        } else if(hit.kind === 'ui-command') {
          if(G._phase7CurrentMultiplayer === true && typeof window.fatePhase7HandleUiCommand === 'function'){
            if(window.fatePhase7HandleUiCommand(hit.command)) return;
          }
          if(hit.disabled) {
            if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('invalidAction', 'disabled-ui-command:' + (hit.command || 'unknown'), 180);
            else if(typeof playSfx === 'function') playSfx('invalidAction');
            return;
          }
          const localConsolidationActive = typeof isLocalConsolidationActive === 'function' ? isLocalConsolidationActive() : !!(typeof G !== 'undefined' && G && G._consolidating);
          if(hit.command === 'end-turn' && typeof endTurn === 'function') {
            if(typeof isLocalPlayerActionTurn === 'function' && !isLocalPlayerActionTurn()) {
              if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('invalidAction', 'end-turn-not-local', 180);
              return;
            }
            if(typeof G !== 'undefined' && G && G.aiEnabled && (G.currentPlayer === G.aiPlayer || G._aiRunning)) {
              if(typeof window.playFateSfxOnce === 'function') window.playFateSfxOnce('invalidAction', 'end-turn-ai', 180);
              return;
            }
            endTurn();
          } else if(hit.command === 'consolidate') {
            if(localConsolidationActive && typeof cancelConsolidation === 'function') cancelConsolidation();
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
