(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.FateVfxParticlePool) return;

  const VERSION = 1;
  const DEFAULT_MAX = 180;
  const LOW_MAX = 36;

  function nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function lowEffectsEnabled(){
    try {
      return localStorage.getItem('fateLowEffects') === '1'
        || document.documentElement.classList.contains('fate-low-effects')
        || document.documentElement.classList.contains('fate-animations-off');
    } catch(e) {
      return document.documentElement.classList.contains('fate-low-effects')
        || document.documentElement.classList.contains('fate-animations-off');
    }
  }

  function makeParticle(){
    return {
      active:false,
      x:0,
      y:0,
      vx:0,
      vy:0,
      life:0,
      maxLife:1,
      size:2,
      color:'rgba(255,220,120,1)',
      alpha:1,
      gravity:0,
      drag:.985,
      kind:'spark'
    };
  }

  class FateVfxParticlePoolClass {
    constructor(options){
      const opts = options || {};
      this.maxActiveParticles = Number(opts.maxActiveParticles) || DEFAULT_MAX;
      this.maxActiveParticlesLow = Number(opts.maxActiveParticlesLow) || LOW_MAX;
      this.pool = [];
      this.active = [];
      this.allocated = 0;
      this.reused = 0;
      this.dropped = 0;
      this.lastParticleMs = 0;
      for(let i = 0; i < this.maxActiveParticles; i++) this.pool.push(makeParticle());
    }

    budget(){
      return lowEffectsEnabled() ? this.maxActiveParticlesLow : this.maxActiveParticles;
    }

    spawn(options){
      const opts = options || {};
      if(document.documentElement.classList.contains('fate-animations-off')) {
        this.dropped++;
        return null;
      }
      const limit = this.budget();
      if(this.active.length >= limit){
        this.dropped++;
        return null;
      }
      let p = this.pool.pop();
      if(p) this.reused++;
      else {
        p = makeParticle();
        this.allocated++;
      }
      p.active = true;
      p.x = Number(opts.x) || 0;
      p.y = Number(opts.y) || 0;
      p.vx = Number(opts.vx) || 0;
      p.vy = Number(opts.vy) || 0;
      p.life = Math.max(1, Number(opts.life) || 520);
      p.maxLife = p.life;
      p.size = Math.max(.5, Number(opts.size) || 2.5);
      p.color = opts.color || 'rgba(255,220,120,1)';
      p.alpha = Number.isFinite(Number(opts.alpha)) ? Number(opts.alpha) : 1;
      p.gravity = Number(opts.gravity) || 0;
      p.drag = Number.isFinite(Number(opts.drag)) ? Number(opts.drag) : .985;
      p.kind = opts.kind || 'spark';
      this.active.push(p);
      return p;
    }

    burst(options){
      const opts = options || {};
      const low = lowEffectsEnabled();
      const requested = Math.max(0, Math.floor(Number(opts.count) || 18));
      const count = low ? Math.max(1, Math.floor(requested * .25)) : requested;
      const spread = Number(opts.spread) || Math.PI * 2;
      const baseAngle = Number(opts.angle) || 0;
      const speed = Number(opts.speed) || 150;
      const variance = Number(opts.variance) || .48;
      let spawned = 0;
      for(let i = 0; i < count; i++){
        const t = count <= 1 ? .5 : i / (count - 1);
        const jitter = (Math.random() - .5) * spread * variance;
        const angle = baseAngle - spread / 2 + spread * t + jitter;
        const s = speed * (.45 + Math.random() * .75);
        const p = this.spawn({
          x:opts.x,
          y:opts.y,
          vx:Math.cos(angle) * s,
          vy:Math.sin(angle) * s,
          life:Number(opts.life) || 620,
          size:(Number(opts.size) || 2.6) * (.72 + Math.random() * .7),
          color:opts.color || 'rgba(255,218,112,1)',
          gravity:Number(opts.gravity) || 0,
          drag:Number.isFinite(Number(opts.drag)) ? Number(opts.drag) : .982,
          kind:opts.kind || 'spark'
        });
        if(p) spawned++;
      }
      return spawned;
    }

    tick(dtMs){
      const dt = Math.max(0, Math.min(64, Number(dtMs) || 16)) / 1000;
      const started = nowMs();
      const keep = [];
      for(let i = 0; i < this.active.length; i++){
        const p = this.active[i];
        p.life -= dt * 1000;
        if(p.life <= 0){
          p.active = false;
          this.pool.push(p);
          continue;
        }
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        keep.push(p);
      }
      this.active = keep;
      this.lastParticleMs = nowMs() - started;
      return this.active.length;
    }

    draw(ctx){
      if(!ctx || !this.active.length) return 0;
      for(let i = 0; i < this.active.length; i++){
        const p = this.active[i];
        const t = Math.max(0, Math.min(1, p.life / Math.max(1, p.maxLife)));
        ctx.save();
        ctx.globalAlpha = p.alpha * Math.sin(t * Math.PI);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (.7 + (1 - t) * .65), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return this.active.length;
    }

    clear(){
      while(this.active.length){
        const p = this.active.pop();
        p.active = false;
        this.pool.push(p);
      }
    }

    report(){
      return {
        available:true,
        version:VERSION,
        active:this.active.length,
        pooled:this.pool.length,
        maxActiveParticles:this.maxActiveParticles,
        maxActiveParticlesLow:this.maxActiveParticlesLow,
        lowEffects:lowEffectsEnabled(),
        budget:this.budget(),
        particlesAllocated:this.allocated,
        particlesReused:this.reused,
        droppedEffects:this.dropped,
        lastParticleMs:Math.round(this.lastParticleMs * 10) / 10
      };
    }
  }

  const pool = new FateVfxParticlePoolClass();
  window.FateVfxParticlePoolClass = FateVfxParticlePoolClass;
  window.FateVfxParticlePool = pool;
  window.fateVfxParticlePoolReport = function(){ return pool.report(); };
})();
