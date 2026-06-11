(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateAnimationTimeline) return;

  const TIMELINE_VERSION = 1;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function animationsOff(){
    try {
      return document.documentElement.classList.contains('fate-animations-off') ||
        (document.body && document.body.classList && document.body.classList.contains('fate-animations-off'));
    } catch(e) {
      return false;
    }
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function ease(name, t){
    const x = clamp(Number(t) || 0, 0, 1);
    if(name === 'linear') return x;
    if(name === 'out-cubic') return 1 - Math.pow(1 - x, 3);
    if(name === 'in-out-cubic') return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    if(name === 'out-back-soft') {
      const c1 = 1.28;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    return 1 - Math.pow(1 - x, 2);
  }

  class FateAnimationTimeline {
    constructor(){
      this.animations = [];
      this.completed = [];
      this.added = 0;
      this.cleared = 0;
      this.lastTickMs = 0;
    }

    add(animation){
      if(!animation || !animation.kind) return null;
      if(animationsOff() && animation.kind !== 'consolidation') return null;
      const now = nowMs();
      const item = Object.assign({
        id:String(animation.id || (animation.kind + ':' + (animation.iid || '') + ':' + now + ':' + this.added)),
        start:now,
        duration:300,
        easing:'out-cubic',
        progress:0,
        eased:0,
        done:false
      }, animation);
      item.start = Number(item.start) || now;
      item.duration = Math.max(1, Number(item.duration) || 300);
      this.animations.push(item);
      this.added++;
      return item;
    }

    tick(now){
      const t = Number(now) || nowMs();
      const active = [];
      const completed = [];
      this.animations.forEach(function(anim){
        const raw = clamp((t - anim.start) / anim.duration, 0, 1);
        anim.progress = raw;
        anim.eased = ease(anim.easing, raw);
        anim.done = raw >= 1;
        if(anim.done) completed.push(anim);
        else active.push(anim);
      });
      this.animations = active;
      if(completed.length) this.completed = completed.concat(this.completed).slice(0, 24);
      this.lastTickMs = t;
      return {
        active:this.animations.length,
        completed:completed.length,
        hasActive:this.hasActiveAnimations()
      };
    }

    hasActiveAnimations(){
      return this.animations.length > 0;
    }

    clearForCard(iid, kind){
      const key = String(iid == null ? '' : iid);
      if(!key) return 0;
      const before = this.animations.length;
      this.animations = this.animations.filter(function(anim){
        if(String(anim.iid == null ? '' : anim.iid) !== key) return true;
        return kind && anim.kind !== kind;
      });
      const removed = before - this.animations.length;
      this.cleared += removed;
      return removed;
    }

    clearForCardKind(iid, kind){
      return this.clearForCard(iid, kind);
    }

    getForCard(iid, kind){
      const key = String(iid == null ? '' : iid);
      for(let i = this.animations.length - 1; i >= 0; i--){
        const anim = this.animations[i];
        if(String(anim.iid == null ? '' : anim.iid) === key && (!kind || anim.kind === kind)) return anim;
      }
      return null;
    }

    report(){
      const byKind = {};
      this.animations.forEach(function(anim){ byKind[anim.kind] = (byKind[anim.kind] || 0) + 1; });
      return {
        available:true,
        version:TIMELINE_VERSION,
        active:this.animations.length,
        byKind,
        added:this.added,
        cleared:this.cleared,
        lastTickMs:Math.round(this.lastTickMs || 0),
        recentCompleted:this.completed.slice(0, 8).map(function(anim){
          return {
            id:anim.id,
            kind:anim.kind,
            iid:anim.iid,
            duration:anim.duration
          };
        })
      };
    }
  }

  const timeline = new FateAnimationTimeline();

  window.FateAnimationTimeline = FateAnimationTimeline;
  window.FateMatchAnimationTimeline = timeline;
  window.fateAnimationTimelineReport = function(){ return timeline.report(); };
  window.fateClearCardAnimations = function(iid){ return timeline.clearForCard(iid); };
})();
