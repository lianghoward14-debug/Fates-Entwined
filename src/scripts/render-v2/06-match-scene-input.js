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
      this.lastHandledAt = 0;
      this.moveRaf = 0;
      this.pendingMove = null;
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
    }

    attach(container){
      if(this.container === container) return;
      this.detach();
      this.container = container || null;
      if(!this.container) return;
      this.container.addEventListener('pointerdown', this.handlePointerDown, {passive:true});
      this.container.addEventListener('pointerup', this.handlePointerUp, {passive:true});
      this.container.addEventListener('pointermove', this.handlePointerMove, {passive:true});
    }

    detach(){
      if(!this.container) return;
      this.container.removeEventListener('pointerdown', this.handlePointerDown);
      this.container.removeEventListener('pointerup', this.handlePointerUp);
      this.container.removeEventListener('pointermove', this.handlePointerMove);
      if(this.moveRaf) {
        cancelAnimationFrame(this.moveRaf);
        this.moveRaf = 0;
      }
      this.container = null;
      this.pointerDownHit = null;
      this.pointerDownPoint = null;
      this.pendingMove = null;
    }

    updateScene(scene){
      this.scene = scene || this.scene;
    }

    eventPoint(ev){
      return this.pointFromClient(ev.clientX, ev.clientY);
    }

    pointFromClient(clientX, clientY){
      const target = this.container;
      const r = target && target.getBoundingClientRect ? target.getBoundingClientRect() : {left:0, top:0, width:1, height:1};
      const cssW = target && target.clientWidth ? target.clientWidth : r.width || 1;
      const cssH = target && target.clientHeight ? target.clientHeight : r.height || 1;
      return {
        x:(clientX - r.left) * (cssW / Math.max(1, r.width || cssW)),
        y:(clientY - r.top) * (cssH / Math.max(1, r.height || cssH)),
        clientX,
        clientY
      };
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

    handlePointerMove(ev){
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

    handlePointerDown(ev){
      const scene = this.scene || window.FateMatchRendererAdapter;
      if(!scene || !scene.ownsBoard || !scene.ownsBoard()) return;
      if(ev.button !== 0) return;
      const p = this.eventPoint(ev);
      this.pointerDownHit = this.hitTest(p.x, p.y);
      this.pointerDownPoint = p;
    }

    handlePointerUp(ev){
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
      try { if(typeof captureBoardViewportLock === 'function') captureBoardViewportLock(); } catch(e) {}
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
        try { if(typeof restoreBoardViewportLockSoon === 'function') restoreBoardViewportLockSoon(); } catch(e) {}
        if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') {
          window.FateMatchRendererAdapter.scheduleRender('input');
        }
      }
    }
  }

  window.FateMatchSceneInput = FateMatchSceneInput;
})();
