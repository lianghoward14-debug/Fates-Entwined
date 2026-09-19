(function(){
  'use strict';
  const portraits = {
  "Felicyta Janowicz": 1,
  "Anicka Konvicka": 2,
  "Howard": 3,
  "Zoe": 4,
  "17th British Regiment of Africa": 5,
  "Jorge Alvarez": 6,
  "Maja Kaminska": 7,
  "Lina": 8,
  "United Nations 5th Army": 9,
  "Post-Modernist Dylan": 10,
  "Anne Stone": 11,
  "Makenna": 12,
  "Johnathan Kirby": 13,
  "Alondra Hopkins": 14,
  "Zsofia Szocs": 15,
  "MINAE Death Squad": 16,
  "Carolyn": 17,
  "1st US Marines": 18,
  "Květka Svoboda": 19,
  "South Wind Spearman": 20,
  "Henry Dong": 21,
  "Isaac Perez": 22,
  "Cathy": 23,
  "Ralph's Courtesy Clerk": 24,
  "Zimbabwean Honor Guard": 25,
  "UCPD": 26,
  "Kazumi": 27,
  "2nd Polish-Lithuanian Army": 28,
  "Dylan Kirby": 29,
  "Santiago": 30,
  "Oathbound Noble Fighter": 31,
  "Temecula Resident": 32,
  "West Caribbea Infantry": 33,
  "Rozsi Szocs": 34,
  "Alexander the Magnificient": 35
};
  let active = null;
  const shown = new Set();
  let shownMatch = null;
  function syncMatch(){
    const game = typeof G !== 'undefined' ? G : null;
    const match = game?.matchId || game?._matchId || game;
    if(match !== shownMatch){ shown.clear(); shownMatch = match; }
  }
  function key(card){ return card?.iid ? 'instance:' + String(card.iid) : catalogKey(card); }
  function catalogKey(card){
    const id = String(card?.id || '');
    return 'catalog:' + (/^\d+$/.test(id) ? String(Number(id)) : id);
  }
  function pickerConfirmation(card){
    if(!card) return function(){};
    syncMatch();
    // Picker fallback is only for sources with no banner presentation.
    // Actual activations always call play directly and are never suppressed here.
    const pickerMatch = shownMatch;
    const sourceKey = key(card);
    let confirmed = false;
    return function(){
      if(confirmed) return;
      confirmed = true;
      syncMatch();
      if(pickerMatch === shownMatch && !shown.has(sourceKey)) play(card);
    };
  }
  function play(card, options = {}){
    if(!card || String(card.type || '').toLowerCase() === 'supporter' || window.isHiddenEffectForViewer?.(card)) return null;
    const classes = document.documentElement.classList;
    if(classes.contains('fate-animations-off') || classes.contains('fate-super-performance-mode') || document.body.classList.contains('fate-super-performance-mode')) return null;
    const id = String(card.id || '');
    const expansion = /^bh0?(\d+)$/i.exec(id);
    const numeric = Number(id);
    const mapped = expansion && Number(expansion[1]) <= 25 ? 100 + Number(expansion[1]) : numeric > 0 && numeric <= 100 ? numeric : null;
    const pfp = card.pfpId || mapped || portraits[card.name];
    if(!pfp && !card.img) return null;
    syncMatch();
    shown.add(key(card));
    // Search helpers can carry only the catalogue ID, not the live instance.
    // Keep both identities; live-instance pickers still distinguish copies.
    shown.add(catalogKey(card));
    if(active) active();
    const banner = document.createElement('div');
    banner.className = 'fate-activation-film-cut';
    banner.setAttribute('aria-hidden','true');
    const reduced = classes.contains('fate-reduced-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('fateReducedMotion') === '1';
    if(reduced) banner.classList.add('reduced-motion');
    const image = document.createElement('img');
    image.alt = '';
    image.src = id === 'whisper17'
      ? 'pfp/pfp-shizuku.png'
      : Number(id) === 56
        ? 'pfp/pfp56-portrait.png'
        : pfp
          ? (typeof PFP_PATH === 'function' ? PFP_PATH(pfp, 'square') : 'pfp/pfp'+pfp+'.png')
          : card.img;
    image.onerror = function(){ image.remove(); };
    const skin = document.createElement('div');
    skin.className = 'fate-relay-skin';
    const echo = image.cloneNode();
    echo.className = 'fate-relay-echo';
    echo.onerror = function(){ echo.remove(); };
    const shade = document.createElement('div');
    shade.className = 'fate-relay-shade';
    const scan = document.createElement('div');
    scan.className = 'fate-relay-scan';
    const rail = document.createElement('div');
    rail.className = 'fate-relay-rail';
    rail.textContent = 'ACTIVATE EFFECT';
    const copy = document.createElement('div');
    copy.className = 'fate-activation-film-copy';
    const ability = document.createElement('div');
    ability.className = 'fate-activation-film-ability';
    ability.textContent = card.ability || 'Activate Effect';
    const name = document.createElement('div');
    name.className = 'fate-activation-film-name';
    name.textContent = id === '84' ? 'Květka Svoboda (Youth)' : card.name || '';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'fate-relay-eyebrow';
    eyebrow.textContent = 'Activate Effect';
    copy.append(eyebrow,name,ability);
    skin.append(image,echo,shade,scan,rail,copy);
    banner.append(skin);
    document.body.appendChild(banner);
    // Banner-only presentations never dim the board. The animation owner must
    // opt in after it has successfully created the companion animation.
    const vignette = options.hasCenterAnimation === true && !['04','17'].includes(id) ? document.createElement('div') : null;
    if(vignette){
      vignette.className = 'fate-activation-center-vignette';
      vignette.setAttribute('aria-hidden','true');
      document.body.appendChild(vignette);
    }
    function positionInZoneOne(){
      const canvas = document.getElementById('fate-match-v2-canvas');
      const cells = window.FateMatchRendererAdapter?.getHitMap?.()?.cells || [];
      const rects = cells.filter(cell=>Number(cell.z)===0).map(cell=>cell.rect).filter(Boolean);
      if(!canvas || !rects.length) return;
      const bounds = canvas.getBoundingClientRect();
      const sx = bounds.width / Math.max(1,canvas.clientWidth), sy = bounds.height / Math.max(1,canvas.clientHeight);
      const left = bounds.left + Math.min(...rects.map(r=>r.x))*sx;
      const top = bounds.top + Math.min(...rects.map(r=>r.y))*sy;
      const right = bounds.left + Math.max(...rects.map(r=>r.x+(r.w ?? r.width)))*sx;
      const bottom = bounds.top + Math.max(...rects.map(r=>r.y+(r.h ?? r.height)))*sy;
      if(![left,top,right,bottom].every(Number.isFinite)) return;
      const height = (bottom-top)*.96;
      const width = Math.min((right-left)*.82,height*.7);
      banner.style.width = width+'px';
      banner.style.height = height+'px';
      banner.style.left = (left+(right-left-width)/2)+'px';
      banner.style.top = (top+(bottom-top-height)/2)+'px';
    }
    positionInZoneOne();
    window.addEventListener('resize',positionInZoneOne);
    const stopSound = options.sfx === false ? null : playRelaySound();
    let timer;
    function dispose(){ clearTimeout(timer); window.removeEventListener('resize',positionInZoneOne); stopSound?.(); banner.remove(); vignette?.remove(); if(active === dispose) active = null; }
    active = dispose;
    timer = setTimeout(dispose,2000);
    return dispose;
  }
  function playRelaySound(){
    try {
      const level = (typeof _masterVol === 'number' ? _masterVol : 0) * (typeof _sfxVol === 'number' ? _sfxVol : 0);
      if(level <= 0 || typeof getAudioCtx !== 'function') return null;
      const ctx = getAudioCtx();
      if(ctx.state !== 'running') return null;
      const out = ctx.createGain(); out.gain.value = .28 * level; out.connect(ctx.destination);
      const t = ctx.currentTime + .01;
      function noise(at,duration,frequency,volume){
        const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
        const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
        source.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;
        gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
        source.connect(filter).connect(gain).connect(out);source.start(at);source.stop(at+duration+.01);
      }
      function tone(at,frequency,end,duration,volume){
        const source=ctx.createOscillator(),gain=ctx.createGain();source.type='sine';source.frequency.setValueAtTime(frequency,at);source.frequency.exponentialRampToValueAtTime(end,at+duration);
        gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.01);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
        source.connect(gain).connect(out);source.start(at);source.stop(at+duration+.01);
      }
      noise(t,.16,1600,.28);noise(t+.09,.055,2700,.13);noise(t+.21,.07,1900,.15);
      tone(t+.02,135,58,.32,.27);tone(t+.19,620,310,.22,.065);
      noise(t+1.65,.18,1100,.095);tone(t+1.68,180,75,.16,.065);
      return function(){out.gain.setTargetAtTime(0,ctx.currentTime,.01);setTimeout(()=>out.disconnect(),40);};
    } catch(e) { return null; }
  }
  window.FateActivationBanner = {play, pickerConfirmation};
})();
