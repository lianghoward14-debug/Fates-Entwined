//  SYNTHESIZED SOUND EFFECTS (Web Audio API)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _audioCtx = null;
let _sfxBusByContext = new WeakMap();
let _sfxNoiseBuffersByContext = new WeakMap();
function getAudioCtx(){
  if(!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if(_audioCtx.state==='suspended') _audioCtx.resume();
  return _audioCtx;
}

function getSfxBus(ctx){
  let bus = _sfxBusByContext.get(ctx);
  if(bus) return bus;

  const input = ctx.createGain();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 3;
  comp.attack.value = 0.003; comp.release.value = 0.15;

  const dry = ctx.createGain(); dry.gain.value = 0.72;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  const conv = ctx.createConvolver();
  const irLen = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
  const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for(let ch=0;ch<2;ch++){
    const d = irBuf.getChannelData(ch);
    for(let i=0;i<irLen;i++){
      const t = i/irLen;
      d[i] = (Math.random()*2-1) * Math.pow(1-t, 3.0) * (ch===0 ? 1 : -1) * (0.6 + Math.sin(t*40)*0.1);
    }
  }
  conv.buffer = irBuf;

  input.connect(comp);
  comp.connect(dry); dry.connect(ctx.destination);
  comp.connect(conv); conv.connect(wet); wet.connect(ctx.destination);

  bus = {input, comp, dry, wet, conv};
  _sfxBusByContext.set(ctx, bus);
  return bus;
}
window.getFateSfxBus = getSfxBus;

function getCachedSfxNoiseBuffer(ctx, dur, decay, gainVal, variant){
  let cache = _sfxNoiseBuffersByContext.get(ctx);
  if(!cache){
    cache = new Map();
    _sfxNoiseBuffersByContext.set(ctx, cache);
  }
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const key = [len, Math.round(decay * 100), Math.round(gainVal * 1000), variant || 'plain'].join(':');
  if(cache.has(key)) return cache.get(key);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) {
    const t = i / d.length;
    let sample = (Math.random()*2-1) * Math.pow(1-t, decay) * gainVal;
    if(variant === 'sine') sample *= Math.sin(Math.PI * t);
    d[i] = sample;
  }
  cache.set(key, buf);
  return buf;
}
window.getCachedFateSfxNoiseBuffer = getCachedSfxNoiseBuffer;

const FATE_SAMPLE_SFX = {
  menuOpen: {src:'soundeffects/codex-redesign/menu_open_silk_gate.wav', gain:0.92},
  menuClose: {src:'soundeffects/codex-redesign/menu_close_soft_lock.wav', gain:0.88},
  cardSelect: {src:'soundeffects/codex-redesign/card_select_fate_thread.wav', gain:0.82},
  boardCardClick: {src:'soundeffects/codex-redesign/board_card_coin_cascade.wav', gain:0.68},
  supporterSet: {src:'soundeffects/codex-redesign/supporter_gold_inlay.wav', gain:0.92},
  discard: {src:'soundeffects/codex-redesign/discard_deck_coffin.wav', gain:0.9},
  discardCard: {src:'soundeffects/codex-redesign/discard_deck_coffin.wav', gain:0.9},
  blocked: {src:'soundeffects/codex-redesign/blocked_metal_gate.wav', gain:0.82},
  fateGain: {src:'soundeffects/codex-redesign/fate_gain_gold_tick.wav', gain:0.92},
  fateLose: {src:'soundeffects/codex-redesign/fate_loss_dull_drop.wav', gain:1.25},
  landscapePulse: {src:'soundeffects/codex-redesign/effect_order_mark.wav', gain:0.82},
  landscapeMajor: {src:'soundeffects/codex-redesign/level_up_compact_fanfare.wav', gain:0.86},
  effect: {src:'soundeffects/codex-redesign/effect_order_mark.wav', gain:0.88},
  effectActivate: {src:'soundeffects/codex-redesign/effect_order_mark.wav', gain:0.88},
  immuneShield: {src:'soundeffects/codex-redesign/immune_glass_ward.wav', gain:0.92},
  reactionTrigger: {src:'soundeffects/codex-redesign/reaction_interrupt_sting.wav', gain:0.92},
  cardMove: {src:'soundeffects/codex-redesign/card_move_board_slide.wav', gain:0.86},
  searchFound: {src:'soundeffects/codex-redesign/search_page_reveal.wav', gain:0.9},
  zoneBlock: {src:'soundeffects/codex-redesign/zone_block_crystal_seal.wav', gain:0.88},
  zoeBlock: {src:'soundeffects/codex-redesign/zone_block_crystal_seal.wav', gain:0.88},
  timerWarn: {src:'soundeffects/codex-redesign/turn_warning_low_clock.wav', gain:0.82},
  coinFlip: {src:'soundeffects/codex-redesign/coin_flip_fate_coin.wav', gain:0.88},
  forfeit: {src:'soundeffects/codex-redesign/forfeit_quiet_collapse.wav', gain:0.9},
  modalConfirm: {src:'soundeffects/codex-redesign/modal_confirm.wav', gain:0.9},
  modalCancel: {src:'soundeffects/codex-redesign/modal_cancel.wav', gain:0.88},
  cardFlip: {src:'soundeffects/codex-redesign/card_flip_reveal_turn.wav', gain:0.9},
  deckComplete: {src:'soundeffects/codex-redesign/deck_complete_lock_in.wav', gain:0.92},
  onlineRemote: {src:'soundeffects/codex-redesign/online_remote_pulse.wav', gain:0.72},
  spectatorJoin: {src:'soundeffects/codex-redesign/spectator_soft_arrive.wav', gain:0.9},
  levelUp: {src:'soundeffects/codex-redesign/level_up_compact_fanfare.wav', gain:0.9},
  characterSet: {src:'soundeffects/codex-redesign/character_heroic_crest.wav', gain:0.9},
  characterSet_Initiator: {src:'soundeffects/codex-redesign/character_initiator_celestial_summon.wav', gain:0.9},
  characterSet_Coordinator: {src:'soundeffects/codex-redesign/character_coordinator_oceanic_arrival.wav', gain:0.9},
  characterSet_Dauntless: {src:'soundeffects/codex-redesign/character_dauntless_impact.wav', gain:0.9},
  characterSet_Improvisor: {src:'soundeffects/codex-redesign/character_improvisor_future_drop.wav', gain:0.9}
};
const _fateSampleAudioCache = new Map();

function getCharacterSetSfxType(cardOrType) {
  const raw = typeof cardOrType === 'string' ? cardOrType : (cardOrType && cardOrType.type);
  const type = String(raw || '').trim().toLowerCase();
  if(type === 'initiator') return 'characterSet_Initiator';
  if(type === 'coordinator') return 'characterSet_Coordinator';
  if(type === 'dauntless') return 'characterSet_Dauntless';
  if(type === 'improvisor') return 'characterSet_Improvisor';
  return 'characterSet';
}
window.getCharacterSetSfxType = getCharacterSetSfxType;

function playFateSampleSfx(type, isMenuSound, effectiveVol) {
  const spec = FATE_SAMPLE_SFX[type];
  if(!spec || !spec.src) return false;
  try {
    let base = _fateSampleAudioCache.get(spec.src);
    if(!base) {
      base = new Audio(spec.src);
      base.preload = 'auto';
      _fateSampleAudioCache.set(spec.src, base);
    }
    const audio = base.cloneNode(true);
    const gain = typeof spec.gain === 'number' ? spec.gain : 0.85;
    audio.volume = Math.max(0, Math.min(1, _masterVol * effectiveVol * gain * (isMenuSound ? 1.1 : 1)));
    audio.play().catch(()=>{});
  } catch(e) {}
  return true;
}

function warmFateSampleSfx(types) {
  const list = Array.isArray(types) && types.length
    ? types
    : ['menuOpen','menuClose','modalConfirm','modalCancel','uiClick','navClick','tabSwitch','hover'];
  list.forEach(function(type){
    const spec = FATE_SAMPLE_SFX[type];
    if(!spec || !spec.src || _fateSampleAudioCache.has(spec.src)) return;
    try {
      const base = new Audio(spec.src);
      base.preload = 'auto';
      try { base.load(); } catch(e) {}
      _fateSampleAudioCache.set(spec.src, base);
    } catch(e) {}
  });
}
window.fateWarmMenuAudioSamples = warmFateSampleSfx;

function playFateLossTone(effectiveVol) {
  try {
    const ctx = getAudioCtx();
    const bus = getSfxBus(ctx);
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = _masterVol * effectiveVol * 0.95;
    out.connect(bus.input);

    const drop = ctx.createOscillator();
    drop.type = 'sawtooth';
    drop.frequency.setValueAtTime(520, now);
    drop.frequency.exponentialRampToValueAtTime(110, now + 0.22);
    const dropFilter = ctx.createBiquadFilter();
    dropFilter.type = 'lowpass';
    dropFilter.frequency.setValueAtTime(1800, now);
    dropFilter.frequency.exponentialRampToValueAtTime(420, now + 0.22);
    const dropGain = ctx.createGain();
    dropGain.gain.setValueAtTime(0.16, now);
    dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    drop.connect(dropFilter);
    dropFilter.connect(dropGain);
    dropGain.connect(out);
    drop.start(now);
    drop.stop(now + 0.3);

    const tick = ctx.createOscillator();
    tick.type = 'square';
    tick.frequency.setValueAtTime(146, now + 0.015);
    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(0.11, now + 0.015);
    tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    tick.connect(tickGain);
    tickGain.connect(out);
    tick.start(now + 0.015);
    tick.stop(now + 0.13);
  } catch(e) {}
}

function playSfx(type) {
  if(_masterVol<=0) return;
  const isMenuSound = ['uiClick','navClick','tabSwitch','backBtn','filterClick','danger','deckAdd','deckRemove','menuOpen','menuClose','hover','deckComplete','cardPreview','playBtn','categorySwitch','modalConfirm','modalCancel'].includes(type);
  const effectiveVol = isMenuSound ? _menuVol : _sfxVol;
  if(effectiveVol<=0) return;
  if(type === 'fateLose') playFateLossTone(effectiveVol);
  if(playFateSampleSfx(type, isMenuSound, effectiveVol)) return;
  try {
    const ctx = getAudioCtx();
    const vol = ctx.createGain();
    vol.gain.value = _masterVol * effectiveVol * (isMenuSound ? 2.5 : 1.2);
    vol.connect(getSfxBus(ctx).input);
    const now = ctx.currentTime;

    // Helper: noise burst generator
    function noiseBurst(dur, decay, gainVal, filterType, filterFreq, filterQ) {
      const buf = getCachedSfxNoiseBuffer(ctx, dur, decay, gainVal);
      const src = ctx.createBufferSource(); src.buffer = buf;
      if(filterType){
        const f = ctx.createBiquadFilter(); f.type = filterType;
        f.frequency.value = filterFreq || 800; if(filterQ) f.Q.value = filterQ;
        src.connect(f); f.connect(vol);
      } else { src.connect(vol); }
      return src;
    }

    // Helper: saturator (soft clip waveshaper)
    function makeSaturator(amount) {
      const ws = ctx.createWaveShaper();
      const k = amount || 2;
      const n = 256; const curve = new Float32Array(n);
      for(let i=0;i<n;i++){
        const x = (i*2/n) - 1;
        curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
      }
      ws.curve = curve; ws.oversample = '2x';
      return ws;
    }

    if(type==='place'){
      // HEAVY card slam: sub-bass thud + saturated mid punch + metallic ring + noise crack
      // Sub thud
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(90,now); sub.frequency.exponentialRampToValueAtTime(35,now+0.25);
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.45,now); subG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.32);
      // Mid punch — saturated
      const mid = ctx.createOscillator(); mid.type='sawtooth';
      mid.frequency.setValueAtTime(180,now); mid.frequency.exponentialRampToValueAtTime(70,now+0.12);
      const midG = ctx.createGain(); midG.gain.setValueAtTime(0.2,now); midG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      const sat = makeSaturator(4);
      mid.connect(sat); sat.connect(midG); midG.connect(vol); mid.start(now); mid.stop(now+0.18);
      // Crack/impact noise
      const crack = noiseBurst(0.06, 2.2, 0.5, 'bandpass', 1200, 3);
      crack.start(now);
      // Metallic ring
      const ring = ctx.createOscillator(); ring.type='sine'; ring.frequency.value=2200;
      const ringG = ctx.createGain(); ringG.gain.setValueAtTime(0.07,now+0.01);
      ringG.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      ring.connect(ringG); ringG.connect(vol); ring.start(now+0.01); ring.stop(now+0.38);
    }

    else if(type==='consolidate'){
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(86,now);
      sub.frequency.exponentialRampToValueAtTime(48,now+0.22);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(0.13,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.34);

      [329.63,493.88].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sine';
        o.frequency.setValueAtTime(f,now+i*0.055);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001,now+i*0.055);
        g.gain.linearRampToValueAtTime(0.09,now+i*0.055+0.018);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.42+i*0.03);
        o.connect(g); g.connect(vol); o.start(now+i*0.035); o.stop(now+0.55);
      });

      const settle = ctx.createOscillator(); settle.type='triangle';
      settle.frequency.setValueAtTime(196,now+0.08);
      settle.frequency.exponentialRampToValueAtTime(146.83,now+0.34);
      const settleG = ctx.createGain();
      settleG.gain.setValueAtTime(0.001,now+0.08);
      settleG.gain.linearRampToValueAtTime(0.045,now+0.12);
      settleG.gain.exponentialRampToValueAtTime(0.001,now+0.44);
      settle.connect(settleG); settleG.connect(vol); settle.start(now+0.08); settle.stop(now+0.48);
    }

    else if(type==='searchFound'){
      const sweep = ctx.createOscillator(); sweep.type='triangle';
      const sweepG = ctx.createGain();
      sweep.frequency.setValueAtTime(540, now);
      sweep.frequency.exponentialRampToValueAtTime(1320, now + 0.16);
      sweepG.gain.setValueAtTime(0.001, now);
      sweepG.gain.linearRampToValueAtTime(0.14, now + 0.025);
      sweepG.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      sweep.connect(sweepG); sweepG.connect(vol);
      sweep.start(now); sweep.stop(now + 0.26);
      [880, 1320, 1760].forEach((freq, i)=>{
        const ping = ctx.createOscillator(); ping.type='sine'; ping.frequency.value=freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.055, now + 0.055 + i*0.035);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22 + i*0.035);
        ping.connect(g); g.connect(vol);
        ping.start(now + 0.055 + i*0.035); ping.stop(now + 0.25 + i*0.035);
      });
    }

    else if(type==='draw'){
      // Slick card slide: filtered swoosh + snappy transient + tonal pop
      // Swoosh noise
      const buf = ctx.createBuffer(1,ctx.sampleRate*0.15,ctx.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<d.length;i++){
        const t=i/d.length;
        d[i] = (Math.random()*2-1) * Math.sin(Math.PI*t) * 0.4 * (1-t*0.5);
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type='bandpass';
      bp.frequency.setValueAtTime(1200,now); bp.frequency.exponentialRampToValueAtTime(4000,now+0.12);
      bp.Q.value = 2.5;
      src.connect(bp); bp.connect(vol); src.start(now);
      // Snap transient
      const snap = ctx.createOscillator(); snap.type='square';
      snap.frequency.setValueAtTime(3000,now); snap.frequency.exponentialRampToValueAtTime(800,now+0.03);
      const snapG = ctx.createGain(); snapG.gain.setValueAtTime(0.1,now); snapG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      snap.connect(snapG); snapG.connect(vol); snap.start(now); snap.stop(now+0.05);
      // Tonal pop
      const pop = ctx.createOscillator(); pop.type='triangle';
      pop.frequency.setValueAtTime(500,now+0.02); pop.frequency.exponentialRampToValueAtTime(1200,now+0.1);
      const popG = ctx.createGain(); popG.gain.setValueAtTime(0.12,now+0.02);
      popG.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      pop.connect(popG); popG.connect(vol); pop.start(now+0.02); pop.stop(now+0.14);
    }

    else if(type==='turnChange'){
      // Deep war horn → bright chime cascade
      // Horn — filtered sawtooth
      const horn = ctx.createOscillator(); horn.type='sawtooth';
      horn.frequency.setValueAtTime(130,now); horn.frequency.exponentialRampToValueAtTime(260,now+0.3);
      const hornLp = ctx.createBiquadFilter(); hornLp.type='lowpass';
      hornLp.frequency.setValueAtTime(300,now); hornLp.frequency.exponentialRampToValueAtTime(1800,now+0.25);
      const hornG = ctx.createGain(); hornG.gain.setValueAtTime(0,now);
      hornG.gain.linearRampToValueAtTime(0.18,now+0.08);
      hornG.gain.exponentialRampToValueAtTime(0.001,now+0.5);
      horn.connect(hornLp); hornLp.connect(hornG); hornG.connect(vol);
      horn.start(now); horn.stop(now+0.55);
      // Chime cascade
      [523.25, 659.25, 783.99, 1046.50].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+0.15+i*0.08);
        g.gain.linearRampToValueAtTime(0.15,now+0.15+i*0.08+0.02);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.15+i*0.08+0.5);
        o.connect(g); g.connect(vol); o.start(now+0.15+i*0.08); o.stop(now+0.15+i*0.08+0.55);
        // Octave harmonic
        const o2 = ctx.createOscillator(); o2.type='triangle'; o2.frequency.value=f*2;
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0,now+0.15+i*0.08);
        g2.gain.linearRampToValueAtTime(0.05,now+0.15+i*0.08+0.02);
        g2.gain.exponentialRampToValueAtTime(0.001,now+0.15+i*0.08+0.4);
        o2.connect(g2); g2.connect(vol); o2.start(now+0.15+i*0.08); o2.stop(now+0.15+i*0.08+0.45);
      });
    }

    else if(type==='timerWarn'){
      // Urgent double-strike alarm
      [0, 0.12].forEach(delay=>{
        const o = ctx.createOscillator(); o.type='square';
        o.frequency.setValueAtTime(1200,now+delay); o.frequency.exponentialRampToValueAtTime(600,now+delay+0.08);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.15,now+delay);
        g.gain.exponentialRampToValueAtTime(0.001,now+delay+0.12);
        const filt = ctx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=900; filt.Q.value=3;
        o.connect(filt); filt.connect(g); g.connect(vol); o.start(now+delay); o.stop(now+delay+0.14);
      });
      // Sub thump
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=60;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.2,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.18);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.2);
    }

    else if(type==='starPlace'){
      // Epic celestial fanfare: deep brass → ascending chorus → shimmering explosion
      // Brass foundation
      [130.81, 196.00, 261.63].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
        const lp = ctx.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.setValueAtTime(400,now); lp.frequency.exponentialRampToValueAtTime(3000,now+0.4);
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now);
        g.gain.linearRampToValueAtTime(0.06,now+0.1);
        g.gain.exponentialRampToValueAtTime(0.001,now+1.2);
        o.connect(lp); lp.connect(g); g.connect(vol); o.start(now); o.stop(now+1.25);
      });
      // Ascending chorus
      [261.63, 392.00, 523.25, 783.99, 1046.50, 1567.98].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.07);
        g.gain.linearRampToValueAtTime(0.08,now+i*0.07+0.03);
        g.gain.exponentialRampToValueAtTime(0.001,now+1.3);
        o.connect(g); g.connect(vol); o.start(now+i*0.07); o.stop(now+1.35);
      });
      // Shimmering explosion
      const shimBuf = ctx.createBuffer(1,ctx.sampleRate*1.5,ctx.sampleRate);
      const shimD = shimBuf.getChannelData(0);
      for(let i=0;i<shimD.length;i++){
        const t=i/shimD.length;
        shimD[i]=(Math.random()*2-1) * Math.pow(1-t,2) * 0.05;
      }
      const shimSrc = ctx.createBufferSource(); shimSrc.buffer=shimBuf;
      const shimHp = ctx.createBiquadFilter(); shimHp.type='highpass'; shimHp.frequency.value=4000;
      shimSrc.connect(shimHp); shimHp.connect(vol); shimSrc.start(now+0.3);
      // Sub impact
      const subImp = ctx.createOscillator(); subImp.type='sine';
      subImp.frequency.setValueAtTime(50,now); subImp.frequency.exponentialRampToValueAtTime(25,now+0.5);
      const subImpG = ctx.createGain(); subImpG.gain.setValueAtTime(0.15,now);
      subImpG.gain.exponentialRampToValueAtTime(0.001,now+0.6);
      subImp.connect(subImpG); subImpG.connect(vol); subImp.start(now); subImp.stop(now+0.65);
    }

    else if(type==='squarePlace'){
      // Deep resonant pulse + mystical overtone cascade + trailing embers
      const o1 = ctx.createOscillator(); o1.type='sine';
      o1.frequency.setValueAtTime(80,now); o1.frequency.exponentialRampToValueAtTime(160,now+0.2);
      const g1 = ctx.createGain(); g1.gain.setValueAtTime(0.35,now);
      g1.gain.exponentialRampToValueAtTime(0.001,now+0.5);
      o1.connect(g1); g1.connect(vol); o1.start(now); o1.stop(now+0.55);
      // Mystical overtones with filter sweep
      [330,495,660,990].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
        const lp = ctx.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.setValueAtTime(200+i*100,now+0.08+i*0.04);
        lp.frequency.exponentialRampToValueAtTime(3000,now+0.08+i*0.04+0.2);
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+0.08+i*0.04);
        g.gain.linearRampToValueAtTime(0.08,now+0.08+i*0.04+0.03);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.08+i*0.04+0.6);
        o.connect(lp); lp.connect(g); g.connect(vol); o.start(now+0.08+i*0.04); o.stop(now+0.08+i*0.04+0.65);
      });
      // Ember sparkles
      for(let i=0;i<6;i++){
        const freq = 1600+Math.random()*2400;
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05,now+0.35+i*0.05);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.35+i*0.05+0.25);
        o.connect(g); g.connect(vol); o.start(now+0.35+i*0.05); o.stop(now+0.35+i*0.05+0.28);
      }
      // Impact crack
      noiseBurst(0.04, 2.5, 0.3, 'bandpass', 900, 2).start(now);
    }

    else if(type==='trianglePlace'){
      // Punchy thud + bright dual chime + subtle sub
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(120,now); sub.frequency.exponentialRampToValueAtTime(55,now+0.18);
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.3,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.25);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.28);
      // Impact crack
      noiseBurst(0.05, 2.0, 0.3, 'bandpass', 1000, 2).start(now);
      // Dual chime — fifth interval
      [880, 1320].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+0.03+i*0.05);
        g.gain.linearRampToValueAtTime(0.12,now+0.03+i*0.05+0.015);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.03+i*0.05+0.35);
        o.connect(g); g.connect(vol); o.start(now+0.03+i*0.05); o.stop(now+0.03+i*0.05+0.38);
      });
    }

    else if(type==='discard'){
      // Heavy crumple: saturated noise sweep down + sub drop + paper tear texture
      const buf = ctx.createBuffer(1,ctx.sampleRate*0.35,ctx.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<d.length;i++){
        const t=i/d.length;
        d[i] = (Math.random()*2-1) * Math.pow(1-t,1.2) * 0.35;
      }
      const src = ctx.createBufferSource(); src.buffer=buf;
      const filt = ctx.createBiquadFilter(); filt.type='lowpass';
      filt.frequency.setValueAtTime(3000,now); filt.frequency.exponentialRampToValueAtTime(120,now+0.35);
      const sat = makeSaturator(3);
      src.connect(filt); filt.connect(sat); sat.connect(vol); src.start(now);
      // Sub drop
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(200,now); sub.frequency.exponentialRampToValueAtTime(30,now+0.35);
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.15,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.42);
      // Tearing texture
      const tear = ctx.createOscillator(); tear.type='sawtooth';
      tear.frequency.setValueAtTime(400,now); tear.frequency.exponentialRampToValueAtTime(50,now+0.25);
      const tearG = ctx.createGain(); tearG.gain.setValueAtTime(0.06,now);
      tearG.gain.exponentialRampToValueAtTime(0.001,now+0.28);
      tear.connect(tearG); tearG.connect(vol); tear.start(now); tear.stop(now+0.3);
    }

    else if(type==='blocked'){
      // Heavy denial buzz: distorted low buzz + metallic clank
      const o = ctx.createOscillator(); o.type='square';
      o.frequency.setValueAtTime(180,now); o.frequency.setValueAtTime(120,now+0.06);
      o.frequency.setValueAtTime(80,now+0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.18,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.25);
      const sat = makeSaturator(5);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
      o.connect(sat); sat.connect(lp); lp.connect(g); g.connect(vol); o.start(now); o.stop(now+0.28);
      // Metallic clank
      const clank = ctx.createOscillator(); clank.type='triangle'; clank.frequency.value=440;
      const clankG = ctx.createGain(); clankG.gain.setValueAtTime(0.1,now);
      clankG.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      clank.connect(clankG); clankG.connect(vol); clank.start(now); clank.stop(now+0.1);
    }

    else if(type==='effect'){
      // Magical surge: sub rumble → filter-swept resonance → sparkle cascade
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(50,now); sub.frequency.exponentialRampToValueAtTime(100,now+0.2);
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.2,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.45);
      // Rising filtered sweep
      const sweep = ctx.createOscillator(); sweep.type='sawtooth';
      sweep.frequency.setValueAtTime(200,now); sweep.frequency.exponentialRampToValueAtTime(1600,now+0.35);
      const sweepLp = ctx.createBiquadFilter(); sweepLp.type='lowpass';
      sweepLp.frequency.setValueAtTime(300,now); sweepLp.frequency.exponentialRampToValueAtTime(5000,now+0.35);
      sweepLp.Q.value = 5;
      const sweepG = ctx.createGain(); sweepG.gain.setValueAtTime(0.12,now);
      sweepG.gain.exponentialRampToValueAtTime(0.001,now+0.5);
      sweep.connect(sweepLp); sweepLp.connect(sweepG); sweepG.connect(vol);
      sweep.start(now); sweep.stop(now+0.55);
      // Sparkle cascade
      for(let i=0;i<8;i++){
        const freq = 2000 + Math.random()*3000;
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05,now+0.25+i*0.03);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.25+i*0.03+0.2);
        o.connect(g); g.connect(vol); o.start(now+0.25+i*0.03); o.stop(now+0.25+i*0.03+0.23);
      }
    }

    else if(type==='win'){
      // Triumphant anthem: brass fanfare → full chord bloom → cymbal wash
      const chord1 = [196.00, 246.94, 293.66, 392.00]; // G major
      const chord2 = [293.66, 369.99, 440.00, 587.33]; // D major
      const chord3 = [261.63, 329.63, 392.00, 523.25, 783.99]; // C major + high
      const stabs = [[chord1,0],[chord2,0.25],[chord3,0.5],[chord3,0.8]];
      stabs.forEach(([notes,delay])=>{
        notes.forEach(f=>{
          const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
          const lp = ctx.createBiquadFilter(); lp.type='lowpass';
          lp.frequency.setValueAtTime(500,now+delay); lp.frequency.exponentialRampToValueAtTime(3000,now+delay+0.12);
          const g = ctx.createGain(); g.gain.setValueAtTime(0,now+delay);
          g.gain.linearRampToValueAtTime(0.1,now+delay+0.03);
          g.gain.exponentialRampToValueAtTime(0.001,now+delay+0.9);
          o.connect(lp); lp.connect(g); g.connect(vol); o.start(now+delay); o.stop(now+delay+0.95);
        });
      });
      // Cymbal wash
      const cymBuf = ctx.createBuffer(1,ctx.sampleRate*1.5,ctx.sampleRate);
      const cymD = cymBuf.getChannelData(0);
      for(let i=0;i<cymD.length;i++){
        const t=i/cymD.length;
        cymD[i]=(Math.random()*2-1)*Math.pow(1-t,1.5)*0.08;
      }
      const cymSrc = ctx.createBufferSource(); cymSrc.buffer=cymBuf;
      const cymHp = ctx.createBiquadFilter(); cymHp.type='highpass'; cymHp.frequency.value=3000;
      cymSrc.connect(cymHp); cymHp.connect(vol); cymSrc.start(now+0.5);
      // Sub foundation
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=65;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.25,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+1.2);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+1.25);
    }

    else if(type==='coinFlip'){
      // Metallic coin spin: rapid pings accelerating → final ring
      for(let i=0;i<12;i++){
        const t = i/12;
        const freq = 800 + i*60 + Math.sin(i*0.8)*50;
        const delay = i * (0.06 + (1-t)*0.04); // accelerating
        const o = ctx.createOscillator(); o.type='triangle'; o.frequency.value=freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0,now+delay); g.gain.linearRampToValueAtTime(0.08+t*0.06,now+delay+0.003);
        g.gain.exponentialRampToValueAtTime(0.001,now+delay+0.06);
        o.connect(g); g.connect(vol); o.start(now+delay); o.stop(now+delay+0.08);
      }
      // Final bell ring
      const bell = ctx.createOscillator(); bell.type='sine'; bell.frequency.value=1400;
      const bellG = ctx.createGain(); bellG.gain.setValueAtTime(0.15,now+0.85);
      bellG.gain.exponentialRampToValueAtTime(0.001,now+1.5);
      bell.connect(bellG); bellG.connect(vol); bell.start(now+0.85); bell.stop(now+1.55);
    }

    else if(type==='charSummon'){
      // War drum + rising battle horn + earth impact
      // War drum
      const drum = ctx.createOscillator(); drum.type='sine';
      drum.frequency.setValueAtTime(80,now); drum.frequency.exponentialRampToValueAtTime(40,now+0.2);
      const drumG = ctx.createGain(); drumG.gain.setValueAtTime(0.4,now);
      drumG.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      drum.connect(drumG); drumG.connect(vol); drum.start(now); drum.stop(now+0.4);
      // Drum noise head
      noiseBurst(0.04, 3, 0.45, 'lowpass', 500).start(now);
      // Battle horn — filtered sawtooth chord
      [165.00, 220.00, 330.00].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
        const lp = ctx.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.setValueAtTime(300,now+0.1); lp.frequency.exponentialRampToValueAtTime(2500,now+0.5);
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+0.1);
        g.gain.linearRampToValueAtTime(0.08,now+0.25);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.8);
        o.connect(lp); lp.connect(g); g.connect(vol); o.start(now+0.1); o.stop(now+0.85);
      });
      // Earth impact
      const imp = ctx.createOscillator(); imp.type='sine';
      imp.frequency.setValueAtTime(35,now+0.5); imp.frequency.exponentialRampToValueAtTime(20,now+0.7);
      const impG = ctx.createGain(); impG.gain.setValueAtTime(0.3,now+0.5);
      impG.gain.exponentialRampToValueAtTime(0.001,now+0.8);
      imp.connect(impG); impG.connect(vol); imp.start(now+0.5); imp.stop(now+0.85);
      noiseBurst(0.08, 2, 0.35, 'lowpass', 400).start(now+0.5);
    }

    else if(type==='hover'){
      // Soft tactile tick with subtle body
      const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.035,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.035);
      o.connect(g); g.connect(vol); o.start(now); o.stop(now+0.05);
      // Sub presence
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=150;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.025,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.03);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.04);
    }

    else if(type==='uiClick'){
      // Punchy mechanical click: transient snap + body thud + subtle ring
      // Sharp transient
      const snap = ctx.createOscillator(); snap.type='square';
      snap.frequency.setValueAtTime(2000,now); snap.frequency.exponentialRampToValueAtTime(400,now+0.02);
      const snapG = ctx.createGain(); snapG.gain.setValueAtTime(0.5,now);
      snapG.gain.exponentialRampToValueAtTime(0.001,now+0.035);
      const snapLp = ctx.createBiquadFilter(); snapLp.type='lowpass'; snapLp.frequency.value=3000;
      snap.connect(snapLp); snapLp.connect(snapG); snapG.connect(vol); snap.start(now); snap.stop(now+0.04);
      // Body thud
      const body = ctx.createOscillator(); body.type='sine';
      body.frequency.setValueAtTime(250,now); body.frequency.exponentialRampToValueAtTime(100,now+0.06);
      const bodyG = ctx.createGain(); bodyG.gain.setValueAtTime(0.55,now);
      bodyG.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      body.connect(bodyG); bodyG.connect(vol); body.start(now); body.stop(now+0.1);
      // Subtle ring
      const ring = ctx.createOscillator(); ring.type='sine'; ring.frequency.value=1100;
      const ringG = ctx.createGain(); ringG.gain.setValueAtTime(0.08,now+0.01);
      ringG.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      ring.connect(ringG); ringG.connect(vol); ring.start(now+0.01); ring.stop(now+0.14);
    }

    else if(type==='zoneBlock'){
      // Heavy lock: distorted slam + chains + low rumble
      const slam = ctx.createOscillator(); slam.type='sawtooth';
      slam.frequency.setValueAtTime(200,now); slam.frequency.exponentialRampToValueAtTime(40,now+0.35);
      const slamG = ctx.createGain(); slamG.gain.setValueAtTime(0.25,now);
      slamG.gain.exponentialRampToValueAtTime(0.001,now+0.45);
      const sat = makeSaturator(6);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
      slam.connect(sat); sat.connect(lp); lp.connect(slamG); slamG.connect(vol);
      slam.start(now); slam.stop(now+0.5);
      // Chain rattle
      for(let i=0;i<4;i++){
        const o = ctx.createOscillator(); o.type='triangle'; o.frequency.value=400+Math.random()*300;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.08,now+0.05+i*0.06);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.05+i*0.06+0.05);
        o.connect(g); g.connect(vol); o.start(now+0.05+i*0.06); o.stop(now+0.05+i*0.06+0.07);
      }
      noiseBurst(0.06, 2, 0.4, 'lowpass', 600).start(now);
    }

    else if(type==='zoeBlock'){
      // Zoe: crystalline barrier seal — high resonant ping + glass ward + echo
      const ping = ctx.createOscillator(); ping.type='sine'; ping.frequency.value=1800;
      const pingG = ctx.createGain(); pingG.gain.setValueAtTime(0.15,now);
      pingG.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      ping.connect(pingG); pingG.connect(vol); ping.start(now); ping.stop(now+0.42);
      // Glass ward
      const ward = ctx.createOscillator(); ward.type='triangle'; ward.frequency.value=2400;
      const wardG = ctx.createGain(); wardG.gain.setValueAtTime(0.08,now+0.05);
      wardG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      ward.connect(wardG); wardG.connect(vol); ward.start(now+0.05); ward.stop(now+0.32);
      // Subtle sub thud
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=120;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.12,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.18);
    }

    else if(type==='buff'){
      // Ascending power chord with shimmer
      [330, 440, 660, 880].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
        const lp = ctx.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.setValueAtTime(500,now+i*0.04);
        lp.frequency.exponentialRampToValueAtTime(3000,now+i*0.04+0.1);
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.04);
        g.gain.linearRampToValueAtTime(0.1,now+i*0.04+0.015);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.04+0.35);
        o.connect(lp); lp.connect(g); g.connect(vol); o.start(now+i*0.04); o.stop(now+i*0.04+0.38);
      });
    }
    else if(type==='cardSet'){
      // Deep thud when placing a card on the board
      const thud = ctx.createOscillator(); thud.type='sine'; thud.frequency.value=60;
      const thudG = ctx.createGain(); thudG.gain.setValueAtTime(0.25,now);
      thudG.gain.exponentialRampToValueAtTime(0.001,now+0.25);
      thud.connect(thudG); thudG.connect(vol); thud.start(now); thud.stop(now+0.28);
      // Impact click
      const click = ctx.createOscillator(); click.type='square'; click.frequency.value=200;
      const clickG = ctx.createGain(); clickG.gain.setValueAtTime(0.12,now);
      clickG.gain.exponentialRampToValueAtTime(0.001,now+0.06);
      click.connect(clickG); clickG.connect(vol); click.start(now); click.stop(now+0.08);
      // Body resonance
      const body = ctx.createOscillator(); body.type='triangle'; body.frequency.value=90;
      const bodyG = ctx.createGain(); bodyG.gain.setValueAtTime(0.15,now+0.03);
      bodyG.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      body.connect(bodyG); bodyG.connect(vol); body.start(now+0.03); body.stop(now+0.22);
    }

    else if(type==='debuff'){
      // Dark descending grind with distortion
      const o = ctx.createOscillator(); o.type='sawtooth';
      o.frequency.setValueAtTime(500,now); o.frequency.exponentialRampToValueAtTime(80,now+0.3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.15,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      const sat = makeSaturator(4);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass';
      lp.frequency.setValueAtTime(2000,now); lp.frequency.exponentialRampToValueAtTime(300,now+0.3);
      o.connect(sat); sat.connect(lp); lp.connect(g); g.connect(vol); o.start(now); o.stop(now+0.38);
      // Sub throb
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(60,now); sub.frequency.exponentialRampToValueAtTime(30,now+0.3);
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.2,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.38);
    }

    else if(type==='menuOpen'){
      // Smooth slide open: rising filtered sweep + soft chime
      const sweep = ctx.createOscillator(); sweep.type='triangle';
      sweep.frequency.setValueAtTime(200,now); sweep.frequency.exponentialRampToValueAtTime(800,now+0.15);
      const sweepLp = ctx.createBiquadFilter(); sweepLp.type='lowpass';
      sweepLp.frequency.setValueAtTime(400,now); sweepLp.frequency.exponentialRampToValueAtTime(4000,now+0.15);
      const sweepG = ctx.createGain(); sweepG.gain.setValueAtTime(0.1,now);
      sweepG.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      sweep.connect(sweepLp); sweepLp.connect(sweepG); sweepG.connect(vol);
      sweep.start(now); sweep.stop(now+0.22);
      const chime = ctx.createOscillator(); chime.type='sine'; chime.frequency.value=1200;
      const chimeG = ctx.createGain(); chimeG.gain.setValueAtTime(0.08,now+0.08);
      chimeG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      chime.connect(chimeG); chimeG.connect(vol); chime.start(now+0.08); chime.stop(now+0.32);
    }

    else if(type==='menuClose'){
      // Reverse of menuOpen: descending filtered sweep
      const sweep = ctx.createOscillator(); sweep.type='triangle';
      sweep.frequency.setValueAtTime(800,now); sweep.frequency.exponentialRampToValueAtTime(200,now+0.12);
      const sweepLp = ctx.createBiquadFilter(); sweepLp.type='lowpass';
      sweepLp.frequency.setValueAtTime(3000,now); sweepLp.frequency.exponentialRampToValueAtTime(400,now+0.12);
      const sweepG = ctx.createGain(); sweepG.gain.setValueAtTime(0.08,now);
      sweepG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      sweep.connect(sweepLp); sweepLp.connect(sweepG); sweepG.connect(vol);
      sweep.start(now); sweep.stop(now+0.18);
    }

    else if(type==='toast'){
      // Subtle notification ping with sub body
      const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=1600;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.08,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      o.connect(g); g.connect(vol); o.start(now); o.stop(now+0.18);
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=200;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.06,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.1);
    }

    else if(type==='packOpen'){
      // Card pack rip: tearing noise → reveal shimmer
      const tear = ctx.createBuffer(1,ctx.sampleRate*0.2,ctx.sampleRate);
      const tearD = tear.getChannelData(0);
      for(let i=0;i<tearD.length;i++){
        const t=i/tearD.length;
        tearD[i]=(Math.random()*2-1)*Math.pow(1-t,0.8)*0.4*(1+Math.sin(t*200)*0.3);
      }
      const tearSrc = ctx.createBufferSource(); tearSrc.buffer=tear;
      const tearBp = ctx.createBiquadFilter(); tearBp.type='bandpass';
      tearBp.frequency.setValueAtTime(800,now); tearBp.frequency.exponentialRampToValueAtTime(3000,now+0.2);
      tearBp.Q.value=1.5;
      tearSrc.connect(tearBp); tearBp.connect(vol); tearSrc.start(now);
      // Reveal shimmer
      for(let i=0;i<10;i++){
        const freq=1500+Math.random()*3500;
        const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
        const g=ctx.createGain(); g.gain.setValueAtTime(0.04,now+0.15+i*0.03);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.15+i*0.03+0.2);
        o.connect(g); g.connect(vol); o.start(now+0.15+i*0.03); o.stop(now+0.15+i*0.03+0.23);
      }
    }

    else if(type==='lose'){
      // Defeated: descending minor chord → sub rumble → silence
      const chord = [196.00, 233.08, 293.66, 392.00]; // G minor
      chord.forEach(f=>{
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
        o.frequency.exponentialRampToValueAtTime(f*0.5,now+1.0);
        const lp = ctx.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.setValueAtTime(2000,now); lp.frequency.exponentialRampToValueAtTime(200,now+1.0);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.1,now);
        g.gain.exponentialRampToValueAtTime(0.001,now+1.0);
        o.connect(lp); lp.connect(g); g.connect(vol); o.start(now); o.stop(now+1.05);
      });
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=50;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.25,now+0.3);
      subG.gain.exponentialRampToValueAtTime(0.001,now+1.2);
      sub.connect(subG); subG.connect(vol); sub.start(now+0.3); sub.stop(now+1.25);
    }


    else if(type==='navClick'){
      // Heavy navigation button — deep mechanical switch with resonant body
      // Sharp attack
      const snap = ctx.createOscillator(); snap.type='square';
      snap.frequency.setValueAtTime(1800,now); snap.frequency.exponentialRampToValueAtTime(300,now+0.025);
      const snapG = ctx.createGain(); snapG.gain.setValueAtTime(0.4,now);
      snapG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      snap.connect(snapG); snapG.connect(vol); snap.start(now); snap.stop(now+0.05);
      // Thick body thump
      const body = ctx.createOscillator(); body.type='sine';
      body.frequency.setValueAtTime(180,now); body.frequency.exponentialRampToValueAtTime(60,now+0.1);
      const bodyG = ctx.createGain(); bodyG.gain.setValueAtTime(0.5,now);
      bodyG.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      body.connect(bodyG); bodyG.connect(vol); body.start(now); body.stop(now+0.14);
      // Resonant overtone
      const ring = ctx.createOscillator(); ring.type='triangle'; ring.frequency.value=800;
      const ringG = ctx.createGain(); ringG.gain.setValueAtTime(0.06,now+0.01);
      ringG.gain.exponentialRampToValueAtTime(0.001,now+0.18);
      ring.connect(ringG); ringG.connect(vol); ring.start(now+0.01); ring.stop(now+0.2);
      // Sub weight
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=45;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.12,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.1);
    }

    else if(type==='tabSwitch'){
      // Smooth tab change — sliding notch click with pitch shift
      const o = ctx.createOscillator(); o.type='triangle';
      o.frequency.setValueAtTime(600,now); o.frequency.exponentialRampToValueAtTime(1200,now+0.06);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.3,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      o.connect(g); g.connect(vol); o.start(now); o.stop(now+0.1);
      // Notch
      const notch = ctx.createOscillator(); notch.type='square';
      notch.frequency.setValueAtTime(2500,now); notch.frequency.exponentialRampToValueAtTime(1000,now+0.015);
      const notchG = ctx.createGain(); notchG.gain.setValueAtTime(0.08,now);
      notchG.gain.exponentialRampToValueAtTime(0.001,now+0.025);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2000;
      notch.connect(lp); lp.connect(notchG); notchG.connect(vol); notch.start(now); notch.stop(now+0.03);
      // Body
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=120;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.1,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.06);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.08);
    }

    else if(type==='backBtn'){
      // Back button — descending whoosh with weight
      const sweep = ctx.createOscillator(); sweep.type='triangle';
      sweep.frequency.setValueAtTime(1000,now); sweep.frequency.exponentialRampToValueAtTime(250,now+0.12);
      const sweepLp = ctx.createBiquadFilter(); sweepLp.type='lowpass';
      sweepLp.frequency.setValueAtTime(4000,now); sweepLp.frequency.exponentialRampToValueAtTime(500,now+0.12);
      const sweepG = ctx.createGain(); sweepG.gain.setValueAtTime(0.22,now);
      sweepG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      sweep.connect(sweepLp); sweepLp.connect(sweepG); sweepG.connect(vol);
      sweep.start(now); sweep.stop(now+0.18);
      // Thump
      const thump = ctx.createOscillator(); thump.type='sine';
      thump.frequency.setValueAtTime(200,now+0.05); thump.frequency.exponentialRampToValueAtTime(60,now+0.12);
      const thumpG = ctx.createGain(); thumpG.gain.setValueAtTime(0.35,now+0.05);
      thumpG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      thump.connect(thumpG); thumpG.connect(vol); thump.start(now+0.05); thump.stop(now+0.18);
    }

    else if(type==='startGame'){
      // Game start — dramatic rising power surge + slam
      // Rising whoosh
      const swoosh = ctx.createBuffer(1,ctx.sampleRate*0.5,ctx.sampleRate);
      const swooshD = swoosh.getChannelData(0);
      for(let i=0;i<swooshD.length;i++){
        const t=i/swooshD.length;
        swooshD[i]=(Math.random()*2-1)*t*0.3;
      }
      const swooshSrc = ctx.createBufferSource(); swooshSrc.buffer=swoosh;
      const swooshBp = ctx.createBiquadFilter(); swooshBp.type='bandpass';
      swooshBp.frequency.setValueAtTime(500,now); swooshBp.frequency.exponentialRampToValueAtTime(6000,now+0.45);
      swooshBp.Q.value=2;
      swooshSrc.connect(swooshBp); swooshBp.connect(vol); swooshSrc.start(now);
      // Power chord slam at end
      [130.81, 196.00, 261.63, 392.00].forEach(f=>{
        const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
        const lp = ctx.createBiquadFilter(); lp.type='lowpass';
        lp.frequency.setValueAtTime(800,now+0.4); lp.frequency.exponentialRampToValueAtTime(3000,now+0.5);
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+0.4);
        g.gain.linearRampToValueAtTime(0.12,now+0.43);
        g.gain.exponentialRampToValueAtTime(0.001,now+1.0);
        o.connect(lp); lp.connect(g); g.connect(vol); o.start(now+0.4); o.stop(now+1.05);
      });
      // Sub impact
      const sub = ctx.createOscillator(); sub.type='sine';
      sub.frequency.setValueAtTime(50,now+0.4); sub.frequency.exponentialRampToValueAtTime(25,now+0.6);
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.35,now+0.4);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.7);
      sub.connect(subG); subG.connect(vol); sub.start(now+0.4); sub.stop(now+0.75);
      noiseBurst(0.08, 2, 0.4, 'lowpass', 600).start(now+0.4);
    }

    else if(type==='deckAdd'){
      // Smooth card slot-in — soft click + gentle ascending confirmation tone
      // Soft click
      const click = ctx.createOscillator(); click.type='triangle';
      click.frequency.setValueAtTime(1200,now); click.frequency.exponentialRampToValueAtTime(600,now+0.025);
      const clickG = ctx.createGain(); clickG.gain.setValueAtTime(0.12,now);
      clickG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      click.connect(clickG); clickG.connect(vol); click.start(now); click.stop(now+0.05);
      // Gentle ascending tone — sounds like a card sliding into place
      const tone = ctx.createOscillator(); tone.type='sine';
      tone.frequency.setValueAtTime(520,now+0.02); tone.frequency.exponentialRampToValueAtTime(780,now+0.12);
      const toneG = ctx.createGain(); toneG.gain.setValueAtTime(0.08,now+0.02);
      toneG.gain.exponentialRampToValueAtTime(0.001,now+0.18);
      tone.connect(toneG); toneG.connect(vol); tone.start(now+0.02); tone.stop(now+0.2);
      // Subtle body
      const body = ctx.createOscillator(); body.type='sine'; body.frequency.value=180;
      const bodyG = ctx.createGain(); bodyG.gain.setValueAtTime(0.06,now);
      bodyG.gain.exponentialRampToValueAtTime(0.001,now+0.06);
      body.connect(bodyG); bodyG.connect(vol); body.start(now); body.stop(now+0.08);
    }

    else if(type==='deckRemove'){
      // Card removed from deck — reverse pop + descending tone
      const pop = ctx.createOscillator(); pop.type='triangle';
      pop.frequency.setValueAtTime(1200,now); pop.frequency.exponentialRampToValueAtTime(400,now+0.08);
      const popG = ctx.createGain(); popG.gain.setValueAtTime(0.12,now);
      popG.gain.exponentialRampToValueAtTime(0.001,now+0.1);
      pop.connect(popG); popG.connect(vol); pop.start(now); pop.stop(now+0.12);
      // Whoosh out
      const buf = ctx.createBuffer(1,ctx.sampleRate*0.1,ctx.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.5)*0.15;
      const src = ctx.createBufferSource(); src.buffer=buf;
      const bp = ctx.createBiquadFilter(); bp.type='bandpass';
      bp.frequency.setValueAtTime(3000,now); bp.frequency.exponentialRampToValueAtTime(800,now+0.1);
      src.connect(bp); bp.connect(vol); src.start(now);
    }

    else if(type==='filterClick'){
      // Filter/toggle — crisp switch with subtle resonance
      const o = ctx.createOscillator(); o.type='triangle';
      o.frequency.setValueAtTime(1400,now); o.frequency.exponentialRampToValueAtTime(700,now+0.03);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.22,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.05);
      o.connect(g); g.connect(vol); o.start(now); o.stop(now+0.06);
      // Body tick
      const tick = ctx.createOscillator(); tick.type='sine'; tick.frequency.value=300;
      const tickG = ctx.createGain(); tickG.gain.setValueAtTime(0.18,now);
      tickG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      tick.connect(tickG); tickG.connect(vol); tick.start(now); tick.stop(now+0.05);
    }

    else if(type==='danger'){
      // Danger/delete button — warning buzz + descending tone
      const buzz = ctx.createOscillator(); buzz.type='square';
      buzz.frequency.setValueAtTime(250,now); buzz.frequency.setValueAtTime(200,now+0.05);
      const buzzG = ctx.createGain(); buzzG.gain.setValueAtTime(0.25,now);
      buzzG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      const sat = makeSaturator(3);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=600;
      buzz.connect(sat); sat.connect(lp); lp.connect(buzzG); buzzG.connect(vol);
      buzz.start(now); buzz.stop(now+0.18);
      const desc = ctx.createOscillator(); desc.type='sine';
      desc.frequency.setValueAtTime(500,now); desc.frequency.exponentialRampToValueAtTime(200,now+0.15);
      const descG = ctx.createGain(); descG.gain.setValueAtTime(0.08,now);
      descG.gain.exponentialRampToValueAtTime(0.001,now+0.18);
      desc.connect(descG); descG.connect(vol); desc.start(now); desc.stop(now+0.2);
    }

    else if(type==='purchase'){
      // Shop purchase — coin drop + register cha-ching
      for(let i=0;i<3;i++){
        const o = ctx.createOscillator(); o.type='triangle';
        o.frequency.value = 1200+i*200;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.06);
        g.gain.linearRampToValueAtTime(0.1,now+i*0.06+0.005);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.06+0.1);
        o.connect(g); g.connect(vol); o.start(now+i*0.06); o.stop(now+i*0.06+0.12);
      }
      // Register bell
      const bell = ctx.createOscillator(); bell.type='sine'; bell.frequency.value=2200;
      const bellG = ctx.createGain(); bellG.gain.setValueAtTime(0.12,now+0.2);
      bellG.gain.exponentialRampToValueAtTime(0.001,now+0.6);
      bell.connect(bellG); bellG.connect(vol); bell.start(now+0.2); bell.stop(now+0.65);
      // Sub
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=100;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.15,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.1);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.12);
    }

    else if(type==='cardReveal'){
      // Pack card reveal — dramatic reveal chime
      const chime = ctx.createOscillator(); chime.type='sine';
      chime.frequency.setValueAtTime(800,now); chime.frequency.exponentialRampToValueAtTime(1600,now+0.15);
      const chimeG = ctx.createGain(); chimeG.gain.setValueAtTime(0.12,now);
      chimeG.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      chime.connect(chimeG); chimeG.connect(vol); chime.start(now); chime.stop(now+0.45);
      // Shimmer
      for(let i=0;i<4;i++){
        const freq = 2000+Math.random()*2000;
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.04,now+0.1+i*0.04);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.1+i*0.04+0.2);
        o.connect(g); g.connect(vol); o.start(now+0.1+i*0.04); o.stop(now+0.1+i*0.04+0.22);
      }
    }

    else if(type==='screenTransition'){
      // Mechanical servo slide — gear engage + hydraulic hiss + latch
      // Gear engage click
      const gear = ctx.createOscillator(); gear.type='square';
      gear.frequency.setValueAtTime(800,now); gear.frequency.exponentialRampToValueAtTime(200,now+0.03);
      const gearG = ctx.createGain(); gearG.gain.setValueAtTime(0.2,now);
      gearG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      const gearLp = ctx.createBiquadFilter(); gearLp.type='lowpass'; gearLp.frequency.value=1500;
      gear.connect(gearLp); gearLp.connect(gearG); gearG.connect(vol);
      gear.start(now); gear.stop(now+0.05);
      // Hydraulic hiss — filtered noise sweep
      const hBuf = ctx.createBuffer(1,ctx.sampleRate*0.12,ctx.sampleRate);
      const hD = hBuf.getChannelData(0);
      for(let i=0;i<hD.length;i++){const t=i/hD.length; hD[i]=(Math.random()*2-1)*(1-t)*0.2;}
      const hSrc = ctx.createBufferSource(); hSrc.buffer=hBuf;
      const hBp = ctx.createBiquadFilter(); hBp.type='bandpass';
      hBp.frequency.setValueAtTime(3000,now+0.02); hBp.frequency.exponentialRampToValueAtTime(1000,now+0.12);
      hBp.Q.value=1.2;
      hSrc.connect(hBp); hBp.connect(vol); hSrc.start(now+0.02);
      // Latch thud
      const latch = ctx.createOscillator(); latch.type='sine';
      latch.frequency.setValueAtTime(160,now+0.08); latch.frequency.exponentialRampToValueAtTime(60,now+0.14);
      const latchG = ctx.createGain(); latchG.gain.setValueAtTime(0.2,now+0.08);
      latchG.gain.exponentialRampToValueAtTime(0.001,now+0.16);
      latch.connect(latchG); latchG.connect(vol); latch.start(now+0.08); latch.stop(now+0.18);
    }

    else if(type==='xpGain'){
      // XP earned — ascending sparkle burst
      [660,880,1100,1320,1760].forEach((f,i)=>{
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.05);
        g.gain.linearRampToValueAtTime(0.08,now+i*0.05+0.01);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.05+0.25);
        o.connect(g); g.connect(vol); o.start(now+i*0.05); o.stop(now+i*0.05+0.28);
      });
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=80;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.1,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.18);
    }


    // ═══════════════════════════════════════════
    //  AFFILIATION PLACEMENT SOUNDS
    // ═══════════════════════════════════════════
    else if(type==='affPlace_third_great_war'){
      // Militant brass hit + marching snare
      [130.81,196.00,261.63].forEach((f,i)=>{
        const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;
        const lp=ctx.createBiquadFilter();lp.type='lowpass';
        lp.frequency.setValueAtTime(600,now);lp.frequency.exponentialRampToValueAtTime(2500,now+0.15);
        const g=ctx.createGain();g.gain.setValueAtTime(0,now);
        g.gain.linearRampToValueAtTime(0.12,now+0.02);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.4);
        o.connect(lp);lp.connect(g);g.connect(vol);o.start(now);o.stop(now+0.45);
      });
      // Snare roll
      const snBuf=ctx.createBuffer(1,ctx.sampleRate*0.08,ctx.sampleRate);
      const snD=snBuf.getChannelData(0);
      for(let i=0;i<snD.length;i++) snD[i]=(Math.random()*2-1)*Math.pow(1-i/snD.length,1.5)*0.4;
      const snSrc=ctx.createBufferSource();snSrc.buffer=snBuf;
      const snHp=ctx.createBiquadFilter();snHp.type='highpass';snHp.frequency.value=2000;
      snSrc.connect(snHp);snHp.connect(vol);snSrc.start(now);
    }

    else if(type==='affPlace_eventide'){
      // Oceanic swell — filtered pad + water shimmer
      const pad=ctx.createOscillator();pad.type='sine';
      pad.frequency.setValueAtTime(220,now);pad.frequency.exponentialRampToValueAtTime(330,now+0.3);
      const padLp=ctx.createBiquadFilter();padLp.type='lowpass';
      padLp.frequency.setValueAtTime(400,now);padLp.frequency.exponentialRampToValueAtTime(2000,now+0.25);
      const padG=ctx.createGain();padG.gain.setValueAtTime(0,now);
      padG.gain.linearRampToValueAtTime(0.15,now+0.1);
      padG.gain.exponentialRampToValueAtTime(0.001,now+0.5);
      pad.connect(padLp);padLp.connect(padG);padG.connect(vol);pad.start(now);pad.stop(now+0.55);
      // Water shimmer
      const wBuf=ctx.createBuffer(1,ctx.sampleRate*0.4,ctx.sampleRate);
      const wD=wBuf.getChannelData(0);
      for(let i=0;i<wD.length;i++){const t=i/wD.length;wD[i]=(Math.random()*2-1)*Math.sin(Math.PI*t)*0.08*(1+Math.sin(t*80)*0.5);}
      const wSrc=ctx.createBufferSource();wSrc.buffer=wBuf;
      const wHp=ctx.createBiquadFilter();wHp.type='highpass';wHp.frequency.value=3000;
      wSrc.connect(wHp);wHp.connect(vol);wSrc.start(now+0.1);
      // Deep ocean sub
      const sub=ctx.createOscillator();sub.type='sine';sub.frequency.value=55;
      const subG=ctx.createGain();subG.gain.setValueAtTime(0.2,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      sub.connect(subG);subG.connect(vol);sub.start(now);sub.stop(now+0.45);
    }

    else if(type==='affPlace_expanded_worlds'){
      // Sci-fi pulse — electric zap + resonant ping + digital stutter
      const zap=ctx.createOscillator();zap.type='sawtooth';
      zap.frequency.setValueAtTime(100,now);zap.frequency.exponentialRampToValueAtTime(2000,now+0.08);
      zap.frequency.exponentialRampToValueAtTime(400,now+0.15);
      const zapG=ctx.createGain();zapG.gain.setValueAtTime(0.2,now);
      zapG.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      const zapLp=ctx.createBiquadFilter();zapLp.type='lowpass';zapLp.frequency.value=4000;
      zap.connect(zapLp);zapLp.connect(zapG);zapG.connect(vol);zap.start(now);zap.stop(now+0.22);
      // Resonant ping
      const ping=ctx.createOscillator();ping.type='sine';ping.frequency.value=1800;
      const pingG=ctx.createGain();pingG.gain.setValueAtTime(0.1,now+0.05);
      pingG.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      ping.connect(pingG);pingG.connect(vol);ping.start(now+0.05);ping.stop(now+0.38);
      // Sub pulse
      const sub=ctx.createOscillator();sub.type='sine';sub.frequency.value=60;
      const subG=ctx.createGain();subG.gain.setValueAtTime(0.25,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      sub.connect(subG);subG.connect(vol);sub.start(now);sub.stop(now+0.18);
    }

    else if(type==='affPlace_reality'){
      // Grounded percussive snap — wood block + finger snap + body
      noiseBurst(0.03,3,0.5,'bandpass',2500,4).start(now);
      const snap=ctx.createOscillator();snap.type='triangle';
      snap.frequency.setValueAtTime(3000,now);snap.frequency.exponentialRampToValueAtTime(800,now+0.02);
      const snapG=ctx.createGain();snapG.gain.setValueAtTime(0.2,now);
      snapG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      snap.connect(snapG);snapG.connect(vol);snap.start(now);snap.stop(now+0.05);
      // Wood body
      const body=ctx.createOscillator();body.type='sine';
      body.frequency.setValueAtTime(400,now);body.frequency.exponentialRampToValueAtTime(180,now+0.08);
      const bodyG=ctx.createGain();bodyG.gain.setValueAtTime(0.25,now);
      bodyG.gain.exponentialRampToValueAtTime(0.001,now+0.1);
      body.connect(bodyG);bodyG.connect(vol);body.start(now);body.stop(now+0.12);
    }

    // ═══════════════════════════════════════════
    //  COMBAT / INTERACTION SOUNDS
    // ═══════════════════════════════════════════
    else if(type==='fateReduce'){
      // Heavy crunch when fate gets reduced
      const crunch=ctx.createOscillator();crunch.type='sawtooth';
      crunch.frequency.setValueAtTime(300,now);crunch.frequency.exponentialRampToValueAtTime(60,now+0.15);
      const crunchG=ctx.createGain();crunchG.gain.setValueAtTime(0.2,now);
      crunchG.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      const sat=makeSaturator(5);
      const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=800;
      crunch.connect(sat);sat.connect(lp);lp.connect(crunchG);crunchG.connect(vol);
      crunch.start(now);crunch.stop(now+0.22);
      noiseBurst(0.04,2.5,0.3,'bandpass',1000,3).start(now);
    }

    else if(type==='immuneShield'){
      // Bright deflection ping + energy disperse
      const ping=ctx.createOscillator();ping.type='sine';ping.frequency.value=2400;
      const pingG=ctx.createGain();pingG.gain.setValueAtTime(0.15,now);
      pingG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      ping.connect(pingG);pingG.connect(vol);ping.start(now);ping.stop(now+0.32);
      // Disperse
      for(let i=0;i<5;i++){
        const f=1500+Math.random()*2000;
        const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;
        const g=ctx.createGain();g.gain.setValueAtTime(0.05,now+0.05+i*0.03);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.05+i*0.03+0.15);
        o.connect(g);g.connect(vol);o.start(now+0.05+i*0.03);o.stop(now+0.05+i*0.03+0.18);
      }
      // Sub shield thump
      const sub=ctx.createOscillator();sub.type='sine';sub.frequency.value=80;
      const subG=ctx.createGain();subG.gain.setValueAtTime(0.2,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.1);
      sub.connect(subG);subG.connect(vol);sub.start(now);sub.stop(now+0.12);
    }

    else if(type==='reactionTrigger'){
      // Dramatic interrupt — reverse cymbal + stinger chord
      const revBuf=ctx.createBuffer(1,ctx.sampleRate*0.3,ctx.sampleRate);
      const revD=revBuf.getChannelData(0);
      for(let i=0;i<revD.length;i++){const t=i/revD.length;revD[i]=(Math.random()*2-1)*t*t*0.15;}
      const revSrc=ctx.createBufferSource();revSrc.buffer=revBuf;
      const revHp=ctx.createBiquadFilter();revHp.type='highpass';revHp.frequency.value=2000;
      revSrc.connect(revHp);revHp.connect(vol);revSrc.start(now);
      // Stinger chord
      [220,330,440].forEach(f=>{
        const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;
        const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2000;
        const g=ctx.createGain();g.gain.setValueAtTime(0,now+0.2);
        g.gain.linearRampToValueAtTime(0.12,now+0.22);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.6);
        o.connect(lp);lp.connect(g);g.connect(vol);o.start(now+0.2);o.stop(now+0.65);
      });
      noiseBurst(0.05,2,0.35,'lowpass',500).start(now+0.2);
    }

    else if(type==='consolidateDenied'){
      // Locked gate slam — metallic + denial
      const o=ctx.createOscillator();o.type='square';
      o.frequency.setValueAtTime(250,now);o.frequency.exponentialRampToValueAtTime(100,now+0.12);
      const g=ctx.createGain();g.gain.setValueAtTime(0.2,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      const sat=makeSaturator(4);
      o.connect(sat);sat.connect(g);g.connect(vol);o.start(now);o.stop(now+0.18);
      // Metal clang
      const clang=ctx.createOscillator();clang.type='triangle';clang.frequency.value=550;
      const clangG=ctx.createGain();clangG.gain.setValueAtTime(0.12,now+0.02);
      clangG.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      clang.connect(clangG);clangG.connect(vol);clang.start(now+0.02);clang.stop(now+0.14);
      noiseBurst(0.04,2.5,0.3,'lowpass',600).start(now);
    }

    // ═══════════════════════════════════════════
    //  PROGRESSION / REWARD SOUNDS
    // ═══════════════════════════════════════════
    else if(type==='levelUp'){
      // Grand level-up fanfare — ascending trumpet + sparkle explosion + sub boom
      [261.63,329.63,392.00,523.25,659.25,783.99].forEach((f,i)=>{
        const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;
        const lp=ctx.createBiquadFilter();lp.type='lowpass';
        lp.frequency.setValueAtTime(500,now+i*0.06);lp.frequency.exponentialRampToValueAtTime(4000,now+i*0.06+0.15);
        const g=ctx.createGain();g.gain.setValueAtTime(0,now+i*0.06);
        g.gain.linearRampToValueAtTime(0.1,now+i*0.06+0.02);
        g.gain.exponentialRampToValueAtTime(0.001,now+1.2);
        o.connect(lp);lp.connect(g);g.connect(vol);o.start(now+i*0.06);o.stop(now+1.25);
      });
      // Sparkle explosion
      for(let i=0;i<12;i++){
        const freq=2000+Math.random()*4000;
        const o=ctx.createOscillator();o.type='sine';o.frequency.value=freq;
        const g=ctx.createGain();g.gain.setValueAtTime(0.04,now+0.4+i*0.03);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.4+i*0.03+0.25);
        o.connect(g);g.connect(vol);o.start(now+0.4+i*0.03);o.stop(now+0.4+i*0.03+0.28);
      }
      // Sub boom
      const sub=ctx.createOscillator();sub.type='sine';
      sub.frequency.setValueAtTime(60,now+0.35);sub.frequency.exponentialRampToValueAtTime(25,now+0.6);
      const subG=ctx.createGain();subG.gain.setValueAtTime(0.35,now+0.35);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.7);
      sub.connect(subG);subG.connect(vol);sub.start(now+0.35);sub.stop(now+0.75);
    }

    else if(type==='starlightEarn'){
      // Crystalline reward — glass chime cascade
      [1047,1319,1568,2093,2637].forEach((f,i)=>{
        const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;
        const g=ctx.createGain();g.gain.setValueAtTime(0,now+i*0.07);
        g.gain.linearRampToValueAtTime(0.1,now+i*0.07+0.01);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.07+0.5);
        o.connect(g);g.connect(vol);o.start(now+i*0.07);o.stop(now+i*0.07+0.55);
      });
    }

    else if(type==='eloUp'){
      // Quick ascending power blip
      [400,600,900].forEach((f,i)=>{
        const o=ctx.createOscillator();o.type='triangle';o.frequency.value=f;
        const g=ctx.createGain();g.gain.setValueAtTime(0,now+i*0.05);
        g.gain.linearRampToValueAtTime(0.12,now+i*0.05+0.01);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.05+0.15);
        o.connect(g);g.connect(vol);o.start(now+i*0.05);o.stop(now+i*0.05+0.18);
      });
    }

    else if(type==='eloDown'){
      // Quick descending power blip
      [900,600,400].forEach((f,i)=>{
        const o=ctx.createOscillator();o.type='triangle';o.frequency.value=f;
        const g=ctx.createGain();g.gain.setValueAtTime(0,now+i*0.05);
        g.gain.linearRampToValueAtTime(0.1,now+i*0.05+0.01);
        g.gain.exponentialRampToValueAtTime(0.001,now+i*0.05+0.15);
        o.connect(g);g.connect(vol);o.start(now+i*0.05);o.stop(now+i*0.05+0.18);
      });
    }

    // ═══════════════════════════════════════════
    //  DRAMATIC MOMENTS
    // ═══════════════════════════════════════════
    else if(type==='lastTurn'){
      // War drum announcement — deep double hit + horn blast
      [0,0.2].forEach(d=>{
        const drum=ctx.createOscillator();drum.type='sine';
        drum.frequency.setValueAtTime(70,now+d);drum.frequency.exponentialRampToValueAtTime(35,now+d+0.15);
        const drumG=ctx.createGain();drumG.gain.setValueAtTime(0.4,now+d);
        drumG.gain.exponentialRampToValueAtTime(0.001,now+d+0.25);
        drum.connect(drumG);drumG.connect(vol);drum.start(now+d);drum.stop(now+d+0.28);
        noiseBurst(0.04,3,0.4,'lowpass',400).start(now+d);
      });
      // Horn blast
      const horn=ctx.createOscillator();horn.type='sawtooth';horn.frequency.value=196;
      const hornLp=ctx.createBiquadFilter();hornLp.type='lowpass';
      hornLp.frequency.setValueAtTime(400,now+0.35);hornLp.frequency.exponentialRampToValueAtTime(2000,now+0.5);
      const hornG=ctx.createGain();hornG.gain.setValueAtTime(0,now+0.35);
      hornG.gain.linearRampToValueAtTime(0.15,now+0.45);
      hornG.gain.exponentialRampToValueAtTime(0.001,now+0.8);
      horn.connect(hornLp);hornLp.connect(hornG);hornG.connect(vol);
      horn.start(now+0.35);horn.stop(now+0.85);
    }

    else if(type==='zoneCaptured'){
      // Triumphant zone sting — bright major stab + shimmer
      [392,493.88,587.33,783.99].forEach(f=>{
        const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;
        const lp=ctx.createBiquadFilter();lp.type='lowpass';
        lp.frequency.setValueAtTime(800,now);lp.frequency.exponentialRampToValueAtTime(3000,now+0.1);
        const g=ctx.createGain();g.gain.setValueAtTime(0,now);
        g.gain.linearRampToValueAtTime(0.1,now+0.02);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.5);
        o.connect(lp);lp.connect(g);g.connect(vol);o.start(now);o.stop(now+0.55);
      });
      for(let i=0;i<5;i++){
        const freq=2000+Math.random()*2500;
        const o=ctx.createOscillator();o.type='sine';o.frequency.value=freq;
        const g=ctx.createGain();g.gain.setValueAtTime(0.04,now+0.15+i*0.04);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.15+i*0.04+0.2);
        o.connect(g);g.connect(vol);o.start(now+0.15+i*0.04);o.stop(now+0.15+i*0.04+0.22);
      }
    }

    else if(type==='zoneLost'){
      // Ominous minor sting
      [196,233.08,293.66].forEach(f=>{
        const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;
        o.frequency.exponentialRampToValueAtTime(f*0.7,now+0.4);
        const lp=ctx.createBiquadFilter();lp.type='lowpass';
        lp.frequency.setValueAtTime(1500,now);lp.frequency.exponentialRampToValueAtTime(300,now+0.4);
        const g=ctx.createGain();g.gain.setValueAtTime(0.1,now);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.45);
        o.connect(lp);lp.connect(g);g.connect(vol);o.start(now);o.stop(now+0.5);
      });
      const sub=ctx.createOscillator();sub.type='sine';sub.frequency.value=50;
      const subG=ctx.createGain();subG.gain.setValueAtTime(0.2,now+0.1);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      sub.connect(subG);subG.connect(vol);sub.start(now+0.1);sub.stop(now+0.45);
    }

    else if(type==='tensionPulse'){
      // Heartbeat-like pulse for close matches
      const beat=ctx.createOscillator();beat.type='sine';
      beat.frequency.setValueAtTime(55,now);beat.frequency.exponentialRampToValueAtTime(35,now+0.12);
      const beatG=ctx.createGain();beatG.gain.setValueAtTime(0.3,now);
      beatG.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      beat.connect(beatG);beatG.connect(vol);beat.start(now);beat.stop(now+0.22);
      // Echo beat
      const echo=ctx.createOscillator();echo.type='sine';
      echo.frequency.setValueAtTime(50,now+0.15);echo.frequency.exponentialRampToValueAtTime(30,now+0.25);
      const echoG=ctx.createGain();echoG.gain.setValueAtTime(0.15,now+0.15);
      echoG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      echo.connect(echoG);echoG.connect(vol);echo.start(now+0.15);echo.stop(now+0.32);
    }

    // ═══════════════════════════════════════════
    //  UI POLISH SOUNDS
    // ═══════════════════════════════════════════
    else if(type==='deckComplete'){
      // 40/40 completion — satisfying lock + ascending sparkle
      // Heavy lock
      noiseBurst(0.03,3,0.4,'bandpass',1500,3).start(now);
      const lock=ctx.createOscillator();lock.type='sine';lock.frequency.value=660;
      const lockG=ctx.createGain();lockG.gain.setValueAtTime(0.15,now+0.02);
      lockG.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      lock.connect(lockG);lockG.connect(vol);lock.start(now+0.02);lock.stop(now+0.32);
      // Ascending sparkle
      [880,1100,1320,1760].forEach((f,i)=>{
        const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;
        const g=ctx.createGain();g.gain.setValueAtTime(0,now+0.1+i*0.05);
        g.gain.linearRampToValueAtTime(0.08,now+0.1+i*0.05+0.01);
        g.gain.exponentialRampToValueAtTime(0.001,now+0.1+i*0.05+0.25);
        o.connect(g);g.connect(vol);o.start(now+0.1+i*0.05);o.stop(now+0.1+i*0.05+0.28);
      });
      const sub=ctx.createOscillator();sub.type='sine';sub.frequency.value=80;
      const subG=ctx.createGain();subG.gain.setValueAtTime(0.2,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.1);
      sub.connect(subG);subG.connect(vol);sub.start(now);sub.stop(now+0.12);
    }

    else if(type==='timerTick'){
      // Rhythmic heartbeat tick for last seconds
      const tick=ctx.createOscillator();tick.type='sine';
      tick.frequency.setValueAtTime(100,now);tick.frequency.exponentialRampToValueAtTime(50,now+0.06);
      const tickG=ctx.createGain();tickG.gain.setValueAtTime(0.2,now);
      tickG.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      tick.connect(tickG);tickG.connect(vol);tick.start(now);tick.stop(now+0.1);
      // Click transient
      const cl=ctx.createOscillator();cl.type='square';
      cl.frequency.setValueAtTime(1500,now);cl.frequency.exponentialRampToValueAtTime(600,now+0.01);
      const clG=ctx.createGain();clG.gain.setValueAtTime(0.08,now);
      clG.gain.exponentialRampToValueAtTime(0.001,now+0.02);
      cl.connect(clG);clG.connect(vol);cl.start(now);cl.stop(now+0.03);
    }

    else if(type==='cardPreview'){
      // Soft page-turn feel
      const buf=ctx.createBuffer(1,ctx.sampleRate*0.06,ctx.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++){const t=i/d.length;d[i]=(Math.random()*2-1)*Math.sin(Math.PI*t)*0.12;}
      const src=ctx.createBufferSource();src.buffer=buf;
      const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=3000;bp.Q.value=1.5;
      src.connect(bp);bp.connect(vol);src.start(now);
      const tone=ctx.createOscillator();tone.type='sine';tone.frequency.value=1200;
      const toneG=ctx.createGain();toneG.gain.setValueAtTime(0.05,now);
      toneG.gain.exponentialRampToValueAtTime(0.001,now+0.06);
      tone.connect(toneG);toneG.connect(vol);tone.start(now);tone.stop(now+0.08);
    }


    else if(type==='playBtn'){
      // Play vs AI / Play vs Human — dramatic heavy action button
      // Impact slam
      noiseBurst(0.05, 2, 0.5, 'bandpass', 1400, 3).start(now);
      const slam = ctx.createOscillator(); slam.type='sawtooth';
      slam.frequency.setValueAtTime(200,now); slam.frequency.exponentialRampToValueAtTime(80,now+0.1);
      const slamG = ctx.createGain(); slamG.gain.setValueAtTime(0.35,now);
      slamG.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      const sat = makeSaturator(3);
      slam.connect(sat); sat.connect(slamG); slamG.connect(vol);
      slam.start(now); slam.stop(now+0.18);
      // Rising power tone
      const rise = ctx.createOscillator(); rise.type='triangle';
      rise.frequency.setValueAtTime(400,now+0.04); rise.frequency.exponentialRampToValueAtTime(900,now+0.15);
      const riseG = ctx.createGain(); riseG.gain.setValueAtTime(0.15,now+0.04);
      riseG.gain.exponentialRampToValueAtTime(0.001,now+0.2);
      rise.connect(riseG); riseG.connect(vol); rise.start(now+0.04); rise.stop(now+0.22);
      // Sub weight
      const sub = ctx.createOscillator(); sub.type='sine'; sub.frequency.value=50;
      const subG = ctx.createGain(); subG.gain.setValueAtTime(0.3,now);
      subG.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      sub.connect(subG); subG.connect(vol); sub.start(now); sub.stop(now+0.14);
    }

    else if(type==='categorySwitch'){
      // Deck builder category change — chunky notch with harmonic shimmer
      const notch = ctx.createOscillator(); notch.type='square';
      notch.frequency.setValueAtTime(1600,now); notch.frequency.exponentialRampToValueAtTime(500,now+0.025);
      const notchG = ctx.createGain(); notchG.gain.setValueAtTime(0.2,now);
      notchG.gain.exponentialRampToValueAtTime(0.001,now+0.04);
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2500;
      notch.connect(lp); lp.connect(notchG); notchG.connect(vol);
      notch.start(now); notch.stop(now+0.05);
      // Harmonic ring
      const harm = ctx.createOscillator(); harm.type='sine'; harm.frequency.value=660;
      const harmG = ctx.createGain(); harmG.gain.setValueAtTime(0.1,now+0.02);
      harmG.gain.exponentialRampToValueAtTime(0.001,now+0.18);
      harm.connect(harmG); harmG.connect(vol); harm.start(now+0.02); harm.stop(now+0.2);
      // Body thud
      const body = ctx.createOscillator(); body.type='sine';
      body.frequency.setValueAtTime(200,now); body.frequency.exponentialRampToValueAtTime(90,now+0.06);
      const bodyG = ctx.createGain(); bodyG.gain.setValueAtTime(0.2,now);
      bodyG.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      body.connect(bodyG); bodyG.connect(vol); body.start(now); body.stop(now+0.1);
    }


    else if(type==='zoneFlip'){
      const thud = ctx.createOscillator(); thud.type='sine';
      thud.frequency.setValueAtTime(55,now); thud.frequency.exponentialRampToValueAtTime(28,now+0.4);
      const thudG = ctx.createGain(); thudG.gain.setValueAtTime(0.35,now); thudG.gain.exponentialRampToValueAtTime(0.001,now+0.45);
      thud.connect(thudG); thudG.connect(vol); thud.start(now); thud.stop(now+0.48);
      const swell = ctx.createOscillator(); swell.type='sawtooth';
      swell.frequency.setValueAtTime(110,now+0.05); swell.frequency.exponentialRampToValueAtTime(440,now+0.4);
      const swellLp = ctx.createBiquadFilter(); swellLp.type='lowpass';
      swellLp.frequency.setValueAtTime(300,now+0.05); swellLp.frequency.exponentialRampToValueAtTime(2000,now+0.4);
      const swellG = ctx.createGain(); swellG.gain.setValueAtTime(0,now+0.05); swellG.gain.linearRampToValueAtTime(0.12,now+0.2); swellG.gain.exponentialRampToValueAtTime(0.001,now+0.55);
      swell.connect(swellLp); swellLp.connect(swellG); swellG.connect(vol); swell.start(now+0.05); swell.stop(now+0.6);
      [523.25, 659.25, 783.99].forEach(function(f,i){
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.09,now+0.3+i*0.06); g.gain.exponentialRampToValueAtTime(0.001,now+0.3+i*0.06+0.6);
        o.connect(g); g.connect(vol); o.start(now+0.3+i*0.06); o.stop(now+1.0);
      });
    }

    else if(type==='effectActivate'){
      const shimmer = ctx.createOscillator(); shimmer.type='triangle';
      shimmer.frequency.setValueAtTime(880,now); shimmer.frequency.exponentialRampToValueAtTime(1320,now+0.15);
      const shimG = ctx.createGain(); shimG.gain.setValueAtTime(0.12,now); shimG.gain.exponentialRampToValueAtTime(0.001,now+0.25);
      shimmer.connect(shimG); shimG.connect(vol); shimmer.start(now); shimmer.stop(now+0.28);
      const pulse = ctx.createOscillator(); pulse.type='sine'; pulse.frequency.value=440;
      const pulseG = ctx.createGain(); pulseG.gain.setValueAtTime(0.08,now+0.05); pulseG.gain.exponentialRampToValueAtTime(0.001,now+0.35);
      pulse.connect(pulseG); pulseG.connect(vol); pulse.start(now+0.05); pulse.stop(now+0.38);
      for(let i=0;i<4;i++){
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=2400+i*400;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.03,now+0.08+i*0.03); g.gain.exponentialRampToValueAtTime(0.001,now+0.08+i*0.03+0.15);
        o.connect(g); g.connect(vol); o.start(now+0.08+i*0.03); o.stop(now+0.25+i*0.03);
      }
    }

    else if(type==='matchEnd'){
      const gong = ctx.createOscillator(); gong.type='sine';
      gong.frequency.setValueAtTime(80,now); gong.frequency.exponentialRampToValueAtTime(55,now+1.5);
      const gongG = ctx.createGain(); gongG.gain.setValueAtTime(0.4,now); gongG.gain.exponentialRampToValueAtTime(0.001,now+2.0);
      gong.connect(gongG); gongG.connect(vol); gong.start(now); gong.stop(now+2.2);
      [160,240,320,480].forEach(function(f,i){
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.08); g.gain.linearRampToValueAtTime(0.06,now+i*0.08+0.1); g.gain.exponentialRampToValueAtTime(0.001,now+1.8);
        o.connect(g); g.connect(vol); o.start(now+i*0.08); o.stop(now+2.0);
      });
      for(let i=0;i<6;i++){
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=3000+i*300+Math.random()*200;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.02,now+0.4+i*0.08); g.gain.exponentialRampToValueAtTime(0.001,now+0.4+i*0.08+0.6);
        o.connect(g); g.connect(vol); o.start(now+0.4+i*0.08); o.stop(now+1.2+i*0.08);
      }
    }

    else if(type==='challengeComplete'){
      [261.63, 329.63, 392.00, 523.25, 659.25, 783.99].forEach(function(f,i){
        const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
        const o2 = ctx.createOscillator(); o2.type='triangle'; o2.frequency.value=f*2;
        const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.06); g.gain.linearRampToValueAtTime(0.1,now+i*0.06+0.02); g.gain.exponentialRampToValueAtTime(0.001,now+i*0.06+0.4);
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0,now+i*0.06); g2.gain.linearRampToValueAtTime(0.04,now+i*0.06+0.02); g2.gain.exponentialRampToValueAtTime(0.001,now+i*0.06+0.3);
        o.connect(g); g.connect(vol); o.start(now+i*0.06); o.stop(now+i*0.06+0.45);
        o2.connect(g2); g2.connect(vol); o2.start(now+i*0.06); o2.stop(now+i*0.06+0.35);
      });
    }

        setTimeout(function(){
      try{ vol.disconnect(); }catch(e){}
    }, 3600);

  } catch(e){}
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  AUDIO SYSTEM
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const CARD_SOUNDS = {
  '01': '1set', '02': '2set', '03': '3set', '04': '4set',
  '05': '5set', '06': '6set', '07': '7set', '08': '8set',
  '09': '9set', '10': '10set', '11': '11set', '12': '12set',
  '13': '13set', '14': '14set', '15': '15set',
  '16': '16set', '17': '17set', '18': '18set', '19': '19set',
  '20': '20set', '21': '21set', '22': '22set', '23': '23set',
  '24': '24set', '25': '25set', '26': '26set', '27': '27set',
  '28': '28set', '29': '29set', '30': '30set', '31': '31set',
  '32': '32set', '33': '33set', '34': '34set', '35': '35set',
  '36': '36set', '37': '37set', '38': '38set', '39': '39set',
  '40': '40set', '41': '41set', '42': '42set', '43': '43set',
  '44': '44set', '45': '45set', '46': '46set', '47': '47set',
  '48': '48set', '49': '49set', '50': '50set', '51': '51set',
  '52': '52set', '53': '53set', '54': '54set', '55': '55set',
  '56': '56set', '57': '57set', '58': '58set', '59': '59set',
  '60': '60set', '61': '61set', '62': '62set', '63': '63set',
  '64': '64set', '65': '65set', '66': '66set', '67': '67set',
  '68': '68set', '69': '69set', '70': '70set', '71': '71set',
  '72': '72set', '73': '73set', '74': '74set', '75': '75set',
  '76': '76set', '77': '77set', '78': '78set', '79': '79set',
  '80': '80set',
  '81': '../new voices/81set', '82': '../new voices/82set', '83': '../new voices/83set',
  '84': '../new voices/84set', '85': '../new voices/85set', '86': '../new voices/86set',
  '87': '../new voices/87set', '88': '../new voices/88set', '89': '../new voices/89set',
  '90': '../new voices/90set',
  'bh01': 'horizons1set', 'bh25': 'bh25set'
};
const GAME_SONGS = Array.from({length:16}, (_,i)=>'board'+(i+1));
const GAME_AUDIO_FALLBACKS = {};
const DEFAULT_AUDIO_SETTINGS = {
  music: 0.20,
  voice: 0.8,
  sfx: 0.8,
  master: 1.0,
  menu: 1.0
};
let _musicEnabled = true;
let _bgMusic = null;
let _gameMusic = null;
let _currentScreen = 's-title';
let _musicVol = DEFAULT_AUDIO_SETTINGS.music;
let _voiceVol = DEFAULT_AUDIO_SETTINGS.voice;
let _sfxVol = DEFAULT_AUDIO_SETTINGS.sfx;
let _masterVol = DEFAULT_AUDIO_SETTINGS.master;
let _menuVol = DEFAULT_AUDIO_SETTINGS.menu;
let _musicRunId = 0;
const _badMusicSources = new Map();

function markBadMusicSource(src, err){
  if(!src) return;
  _badMusicSources.set(src, Date.now());
  if(typeof console !== 'undefined') console.warn('[Fate Audio] disabled failed music source for this session:', src, err && (err.message || err.name || err));
}

function isBadMusicSource(src){
  const at = _badMusicSources.get(src);
  if(!at) return false;
  if(Date.now() - at > 10 * 60 * 1000){
    _badMusicSources.delete(src);
    return false;
  }
  return true;
}

function pickGameSong() {
  return (GAME_SONGS.includes(_lastGameSong) ? _lastGameSong : null)
    || GAME_SONGS[Math.floor(Math.random()*GAME_SONGS.length)];
}

function getGameAudioSong(song) {
  return GAME_AUDIO_FALLBACKS[song] || song;
}

function applyGameBackground(song=null) {
  const tutorialRunning = (typeof _tutorialActive !== 'undefined' && _tutorialActive) || (typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE === 'tutorial');
  const pickedSong = tutorialRunning ? 'board1' : ((song && GAME_SONGS.includes(song)) ? song : pickGameSong());
  const board = document.getElementById('board');
  const gameScreen = document.getElementById('s-game');
  const coinScreen = document.getElementById('s-coin');
  const bgNum = Math.max(1, Math.min(16, parseInt(String(pickedSong).replace('board',''), 10) || 1));
  const bgImg = (typeof INGAME_BG_PATH === 'function')
    ? INGAME_BG_PATH(bgNum)
    : (typeof FATE_BACKGROUND_URL === 'function' ? FATE_BACKGROUND_URL(`optimized/backgrounds/ingamebackgrouds_igb${bgNum}.jpg`) : `optimized/backgrounds/ingamebackgrouds_igb${bgNum}.jpg`);
  if(board){
    board.style.backgroundImage = 'none';
    board.style.backgroundSize = '';
    board.style.backgroundPosition = '';
    board.style.backgroundColor = 'transparent';
  }
  if(gameScreen){
    gameScreen.style.setProperty('--game-bg-img', `url(${bgImg})`);
    gameScreen.style.backgroundImage = `linear-gradient(180deg,rgba(6,8,14,.04),rgba(6,8,14,.12)), url(${bgImg})`;
    gameScreen.style.backgroundSize = 'cover, cover';
    gameScreen.style.backgroundPosition = 'center, center';
    gameScreen.style.backgroundRepeat = 'no-repeat, no-repeat';
  }
  window.__fateLastGameBackground = {
    song:pickedSong,
    cssVar:`url(${bgImg})`,
    backgroundImage:`linear-gradient(180deg,rgba(6,8,14,.04),rgba(6,8,14,.12)), url(${bgImg})`,
    backgroundSize:'cover, cover',
    backgroundPosition:'center, center',
    backgroundRepeat:'no-repeat, no-repeat'
  };
  if(typeof initLandscapeForSong === 'function') initLandscapeForSong(pickedSong);
  if(coinScreen){
    coinScreen.style.setProperty('--game-bg-img', `url(${bgImg})`);
    coinScreen.style.backgroundImage = `linear-gradient(180deg,rgba(6,8,14,.16),rgba(6,8,14,.28)), url(${bgImg})`;
    coinScreen.style.backgroundSize = 'cover, cover';
    coinScreen.style.backgroundPosition = 'center, center';
    coinScreen.style.backgroundRepeat = 'no-repeat, no-repeat';
  }
  return pickedSong;
}

function transitionGameLandscape(song, opts = {}) {
  const pickedSong = (song && GAME_SONGS.includes(song)) ? song : pickGameSong();
  const bgNum = Math.max(1, Math.min(16, parseInt(String(pickedSong).replace('board',''), 10) || 1));
  if(typeof G !== 'undefined' && G) {
    G.landscapeId = 'igb' + bgNum;
    G.landscapeBgNum = bgNum;
    G.landscape = (typeof LANDSCAPES !== 'undefined' && LANDSCAPES) ? LANDSCAPES[G.landscapeId] : null;
    if(!opts.remote) {
      G._landscapeState = null;
      G._landscapeDrawQueue = [];
    }
    G._onlineGameSong = pickedSong;
    if(!opts.remote && typeof initLandscapeForSong === 'function') initLandscapeForSong(pickedSong);
  }

  const gameScreen = document.getElementById('s-game');
  const bgImg = (typeof INGAME_BG_PATH === 'function')
    ? INGAME_BG_PATH(bgNum)
    : (typeof FATE_BACKGROUND_URL === 'function' ? FATE_BACKGROUND_URL(`optimized/backgrounds/ingamebackgrouds_igb${bgNum}.jpg`) : `optimized/backgrounds/ingamebackgrouds_igb${bgNum}.jpg`);
  let layer = null;
  if(gameScreen) {
    layer = document.createElement('div');
    layer.className = 'landscape-transition-layer';
    layer.style.backgroundImage = `linear-gradient(180deg,rgba(6,8,14,.04),rgba(6,8,14,.12)), url(${bgImg})`;
    gameScreen.appendChild(layer);
    requestAnimationFrame(()=>{ layer.style.opacity = '1'; });
  }

  const oldMusic = _gameMusic;
  const targetVol = _musicVol * _masterVol;
  if(oldMusic) {
    const startVol = oldMusic.volume || targetVol;
    const started = Date.now();
    const fade = setInterval(()=>{
      const t = Math.min(1, (Date.now() - started) / 1200);
      oldMusic.volume = startVol * (1 - t);
      if(t >= 1){
        clearInterval(fade);
        try{ oldMusic.pause(); oldMusic.currentTime = 0; }catch(e){}
      }
    }, 80);
  }

  _lastGameSong = pickedSong;
  setTimeout(function(){
    applyGameBackground(pickedSong);
    if(!opts.remote && typeof initLandscapeForSong === 'function') initLandscapeForSong(pickedSong);
    if(layer) {
      layer.style.opacity = '0';
      setTimeout(()=>{ try{ layer.remove(); }catch(e){} }, 1300);
    }
    if(_musicEnabled && _currentScreen === 's-game') {
      clearGameMusicLoopState();
      try {
        const runId = ++_musicRunId;
        const src = SET_VOICELINE_PATH(getGameAudioSong(pickedSong));
        if(isBadMusicSource(src)) return;
        const audio = new Audio(src);
        audio.loop = true;
        audio.volume = 0;
        audio.onerror = function(e){ markBadMusicSource(src, e); if(_gameMusic === audio) _gameMusic = null; };
        _gameMusic = audio;
        const p = audio.play();
        const fadeIn = ()=>{ if(runId === _musicRunId) fadeInGameMusic(audio, targetVol, 1600); };
        if(p) p.then(fadeIn).catch(()=>{});
        else fadeIn();
      } catch(e) {}
    }
    if(typeof renderLandscapePanel === 'function') renderLandscapePanel();
    if(typeof updateTopBar === 'function') updateTopBar();
    if(typeof triggerLandscapeFlash === 'function') triggerLandscapeFlash('Landscape changed', 'none');
  }, 1150);
  return pickedSong;
}
window.transitionGameLandscape = transitionGameLandscape;

function playCardSound(cardId) {
  const soundFile = CARD_SOUNDS[cardId];
  if(!soundFile) return;
  try {
    const audio = new Audio(SET_VOICELINE_PATH(soundFile));
    // Normalize voiceline volume - cap at 0.7 to prevent loud clips
    audio.volume = Math.min(0.7, _voiceVol * _masterVol);
    audio.play().catch(()=>{});
  } catch(e){}
}

function applyAudioVolumes() {
  if(_bgMusic) _bgMusic.volume = _musicVol * _masterVol;
  if(_gameMusic) _gameMusic.volume = _musicVol * _masterVol;
}

function clampAudioPercent(val) {
  const n = Number(val);
  if(!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function syncAudioControl(id, val) {
  const pct = clampAudioPercent(val);
  const input = document.getElementById(id);
  if(input) input.value = pct;
  const label = document.getElementById(id + '-val');
  if(label) label.textContent = pct;
}

function syncAudioControls() {
  syncAudioControl('vol-master', _masterVol * 100);
  syncAudioControl('vol-music', _musicVol * 100);
  syncAudioControl('vol-sfx', _sfxVol * 100);
  syncAudioControl('vol-voice', _voiceVol * 100);
  applyAudioVolumes();
}

function setMasterVolume(val) {
  const pct = clampAudioPercent(val);
  _masterVol = pct/100;
  syncAudioControl('vol-master', pct);
  applyAudioVolumes();
}

function setMusicVolume(val) {
  const pct = clampAudioPercent(val);
  _musicVol = pct/100;
  syncAudioControl('vol-music', pct);
  applyAudioVolumes();
  if(pct > 0 && _musicEnabled && !((_bgMusic && !_bgMusic.paused) || (_gameMusic && !_gameMusic.paused))) {
    startMusic();
  }
}

function setVoiceVolume(val) {
  const pct = clampAudioPercent(val);
  _voiceVol = pct/100;
  syncAudioControl('vol-voice', pct);
}

function setSfxVolume(val) {
  const pct = clampAudioPercent(val);
  _sfxVol = pct/100;
  syncAudioControl('vol-sfx', pct);
}

function setMenuVolume(val) {
  const pct = clampAudioPercent(val);
  _menuVol = pct/100;
  syncAudioControl('vol-menu', pct);
}

function playMenuSfx() {
  if(_menuVol<=0 || _masterVol<=0) return;
  playSfx('uiClick');
}

function syncMusicToggleButtons() {
  document.querySelectorAll('#music-toggle-btn,[data-music-toggle]').forEach(btn => {
    btn.textContent = _musicEnabled ? 'Music On' : 'Music Off';
    btn.classList.toggle('off', !_musicEnabled);
  });
}

function toggleMusic() {
  _musicEnabled = !_musicEnabled;
  syncMusicToggleButtons();
  if(_musicEnabled) startMusic();
  else stopAllMusic();
}

function exitGame() {
  try {
    stopAllMusic();
    closeAllOverlays?.();
    window.open('', '_self');
    window.close();
    setTimeout(()=>{
      try{ window.location.replace('about:blank'); }catch(_e){}
    }, 120);
  } catch(e) {
    try{ window.location.replace('about:blank'); }catch(_e){}
  }
}

function startMusic() {
  if(!_musicEnabled) return;
  const menuScreens = ['s-title','s-preset','s-deck','s-coin','s-challenger','s-starter-pick','s-win','s-social','s-matchmaking'];
  if(menuScreens.includes(_currentScreen) || !_currentScreen) playBgMusic();
  else if(_currentScreen==='s-game') playGameMusic();
  else playBgMusic(); // fallback: always play bg music
}

function playBgMusic() {
  if(!_musicEnabled) return;
  if(_bgMusic && !_bgMusic.paused) return;
  if(_gameMusic){ _gameMusic.pause(); _gameMusic.currentTime=0; _gameMusic=null; }
  try {
    const runId = ++_musicRunId;
    const src = SET_VOICELINE_PATH('bgsong1');
    if(isBadMusicSource(src)) return;
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = _musicVol * _masterVol;
    audio.onerror = function(e){
      markBadMusicSource(src, e);
      if(_bgMusic === audio) _bgMusic = null;
    };
    // Assign immediately so a fast screen change can pause it even if play() resolves later.
    _bgMusic = audio;
    const p = audio.play();
    if(p) p.then(()=>{
      if(runId !== _musicRunId){ try{audio.pause();audio.currentTime=0;}catch(e){} return; }
    }).catch((err)=>{
      if(err && !/NotAllowed|Abort/i.test(String(err.name || err.message || err))) markBadMusicSource(src, err);
      if(_bgMusic === audio) _bgMusic = null;
    });
  } catch(e){}
}

function fateAudioReport() {
  const srcFor = (name) => {
    try { return SET_VOICELINE_PATH(name); } catch(e) { return ''; }
  };
  return {
    screen: _currentScreen,
    enabled: _musicEnabled,
    musicVolume: _musicVol,
    masterVolume: _masterVol,
    bg: _bgMusic ? { src: _bgMusic.currentSrc || _bgMusic.src, paused: _bgMusic.paused, readyState: _bgMusic.readyState, error: _bgMusic.error && _bgMusic.error.code } : null,
    game: _gameMusic ? { src: _gameMusic.currentSrc || _gameMusic.src, paused: _gameMusic.paused, readyState: _gameMusic.readyState, error: _gameMusic.error && _gameMusic.error.code } : null,
    expectedMenuSrc: srcFor('bgsong1'),
    expectedGameSrc: srcFor(_lastGameSong || 'board1'),
    badSources: Array.from(_badMusicSources.keys())
  };
}

function fateRestartMusic() {
  _badMusicSources.clear();
  stopAllMusic();
  _musicEnabled = true;
  syncMusicToggleButtons();
  startMusic();
  return fateAudioReport();
}

let _lastGameSong = null;
let _gameMusicLoopTimeout = null;
let _gameMusicFadeInterval = null;

function clearGameMusicLoopState() {
  if(_gameMusicLoopTimeout){
    clearTimeout(_gameMusicLoopTimeout);
    _gameMusicLoopTimeout = null;
  }
  if(_gameMusicFadeInterval){
    clearInterval(_gameMusicFadeInterval);
    _gameMusicFadeInterval = null;
  }
}

function fadeInGameMusic(audio, targetVolume, durationMs=1800) {
  if(!audio) return;
  if(_gameMusicFadeInterval) clearInterval(_gameMusicFadeInterval);
  audio.volume = 0;
  const steps = Math.max(8, Math.floor(durationMs / 120));
  let step = 0;
  _gameMusicFadeInterval = setInterval(()=>{
    if(!_gameMusic || _gameMusic !== audio){
      clearGameMusicLoopState();
      return;
    }
    step++;
    audio.volume = targetVolume * Math.min(1, step / steps);
    if(step >= steps){
      audio.volume = targetVolume;
      clearInterval(_gameMusicFadeInterval);
      _gameMusicFadeInterval = null;
    }
  }, Math.max(80, Math.floor(durationMs / steps)));
}

function playGameMusic() {
  clearGameMusicLoopState();
  if(_bgMusic){ try{ _bgMusic.pause(); _bgMusic.currentTime=0; }catch(e){} _bgMusic=null; }
  if(_gameMusic){ try{ _gameMusic.pause(); _gameMusic.currentTime=0; }catch(e){} _gameMusic=null; }
  const onlineSong = (typeof G !== 'undefined' && G && G._onlineGameSong) ? G._onlineGameSong : null;
  const song = applyGameBackground(onlineSong || _lastGameSong || null);
  _lastGameSong = song;
  if(!_musicEnabled) return;
  try {
    const runId = ++_musicRunId;
    const src = SET_VOICELINE_PATH(getGameAudioSong(song));
    if(isBadMusicSource(src)) return;
    const audio = new Audio(src);
    audio.loop = false;
    audio.volume = 0;
    audio.onerror = function(e){
      markBadMusicSource(src, e);
      if(_gameMusic === audio) _gameMusic = null;
      clearGameMusicLoopState();
    };
    // Assign immediately to avoid late promise race with screen changes.
    _gameMusic = audio;
    audio.onended = ()=>{
      if(runId !== _musicRunId || !_musicEnabled || _currentScreen!=='s-game') return;
      if(_gameMusicLoopTimeout) clearTimeout(_gameMusicLoopTimeout);
      _gameMusicLoopTimeout = setTimeout(()=>{
        if(runId !== _musicRunId || !_musicEnabled || _currentScreen!=='s-game' || !_gameMusic || _gameMusic!==audio) return;
        try{
          audio.currentTime = 0;
          const replay = audio.play();
          if(replay) replay.then(()=>fadeInGameMusic(audio, _musicVol * _masterVol, 1800)).catch(()=>{});
        } catch(e){}
      }, 10000);
    };
    const p = audio.play();
    if(p) p.then(()=>{
      if(runId !== _musicRunId){ try{audio.pause();audio.currentTime=0;}catch(e){} return; }
      fadeInGameMusic(audio, _musicVol * _masterVol, 1800);
    }).catch((err)=>{
      if(runId !== _musicRunId) return;
      if(err && !/NotAllowed|Abort/i.test(String(err.name || err.message || err))){
        markBadMusicSource(src, err);
        if(_gameMusic === audio) _gameMusic = null;
        return;
      }
      setTimeout(()=>{ if(runId===_musicRunId && !isBadMusicSource(src)) audio.play().catch(()=>{}); }, 200);
    });
  } catch(e){}
}

function stopAllMusic() {
  // Invalidate any pending play() promises.
  _musicRunId++;
  clearGameMusicLoopState();
  if(_bgMusic){ _bgMusic.pause(); _bgMusic.currentTime=0; _bgMusic=null; }
  if(_gameMusic){ _gameMusic.pause(); _gameMusic.currentTime=0; _gameMusic=null; }
}

let _tabHiddenMusicState = null;
function pauseMusicForTabHidden() {
  _tabHiddenMusicState = {
    bg:_bgMusic && !_bgMusic.paused,
    game:_gameMusic && !_gameMusic.paused
  };
  try{ if(_bgMusic && !_bgMusic.paused) _bgMusic.pause(); }catch(e){}
  try{ if(_gameMusic && !_gameMusic.paused) _gameMusic.pause(); }catch(e){}
}

function resumeMusicAfterTabHidden() {
  const state = _tabHiddenMusicState;
  _tabHiddenMusicState = null;
  if(!_musicEnabled || !state) return;
  try{
    if(state.bg && _bgMusic && _currentScreen !== 's-game') _bgMusic.play().catch(()=>{});
    if(state.game && _gameMusic && _currentScreen === 's-game') _gameMusic.play().catch(()=>{});
  }catch(e){}
}

window.fatePauseMusicForHidden = pauseMusicForTabHidden;
window.fateResumeMusicAfterHidden = resumeMusicAfterTabHidden;

function onScreenChange(screenId) {
  const prev = _currentScreen;
  _currentScreen = screenId;
  const menuScreens = ['s-title','s-preset','s-deck','s-coin','s-challenger','s-starter-pick','s-win','s-social','s-matchmaking'];
  const wasMenu = menuScreens.includes(prev);
  const isGame = screenId==='s-game';
  const isMenu = menuScreens.includes(screenId);
  if(isGame) applyGameBackground((typeof G !== 'undefined' && G && G._onlineGameSong) ? G._onlineGameSong : (_lastGameSong || null));
  // Always stop bg music when entering game screen, even if a race condition restarted it
  if(isGame && _bgMusic){
    try{ _bgMusic.pause(); _bgMusic.currentTime=0; }catch(e){}
    _bgMusic = null;
  }
  if(!_musicEnabled) return;
  if(isGame && (wasMenu || !_gameMusic)) playGameMusic();
  else if(isMenu && !_bgMusic && !wasMenu) playBgMusic();
  // Don't restart music if already playing menu music
}

function confirmEndGame() {
  showModal('End Game?',
    'Are you sure you want to forfeit the current game? This will count as a loss.',
    [
      {label:'Keep Playing', action:closeModal},
      {label:'Forfeit & Quit', danger:true, action:()=>{
        closeModal();
        stopTurnTimer();
        const gameScreen = document.getElementById('s-game');
        const forfeitBgVar = gameScreen ? gameScreen.style.getPropertyValue('--game-bg-img') : '';
        const forfeitBgImage = gameScreen ? getComputedStyle(gameScreen).backgroundImage : '';
        const lastBg = window.__fateLastGameBackground || null;
        const forfeitFallbackBg = (!forfeitBgVar && typeof _lastGameSong !== 'undefined' && typeof INGAME_BG_PATH === 'function')
          ? `url(${INGAME_BG_PATH(Math.max(1, Math.min(16, parseInt(String(_lastGameSong || lastBg?.song || 'board1').replace('board',''), 10) || 1)))})`
          : (lastBg?.cssVar || '');
        let eloChange = 0;
        if(G.aiEnabled){
          const settings = getAIDifficultySettings();
          if(CURRENT_MODE==='challenger'){
            // Forfeit counts as a loss/ELO change, but awards no XP and no drops.
            if(!USER_PROFILE.challengerElo) USER_PROFILE.challengerElo = 600;
            const myElo = USER_PROFILE.challengerElo;
            const opponentElo = settings.opponentElo;
            const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
            let change = Math.round(40 * (0 - expected));
            if(change >= 0) change = -1;
            USER_PROFILE.challengerElo = Math.max(0, myElo + change);
            USER_PROFILE.challengerLosses = (USER_PROFILE.challengerLosses||0) + 1;
            USER_PROFILE.matchesPlayed = (Number(USER_PROFILE.matchesPlayed) || 0) + 1;
            eloChange = change;
            saveProfile();
          } else {
            // Free Play forfeits are just exits: no XP.
            eloChange = 0;
          }
        }
        cleanupGame();
        // Show defeat screen instead of just going to title
        showScreen('s-win');
        const winScreen = document.getElementById('s-win');
        if(winScreen){
          winScreen.classList.add('forfeit-result-screen');
          const bgVar = forfeitBgVar || forfeitFallbackBg;
          if(bgVar) winScreen.style.setProperty('--game-bg-img', bgVar);
          if(bgVar) winScreen.style.setProperty('background-image', `linear-gradient(rgba(3,3,6,.58),rgba(3,3,6,.78)), ${bgVar}`, 'important');
          else if(forfeitBgImage && forfeitBgImage !== 'none') winScreen.style.setProperty('background-image', forfeitBgImage, 'important');
          else if(lastBg?.backgroundImage) winScreen.style.setProperty('background-image', lastBg.backgroundImage, 'important');
          winScreen.style.setProperty('background-size', 'cover, cover', 'important');
          winScreen.style.setProperty('background-position', 'center, center', 'important');
          winScreen.style.setProperty('background-repeat', 'no-repeat, no-repeat', 'important');
          winScreen.classList.add('win-screen-game-bg');
        }
        if(typeof applyWinScreenGameBackground === 'function') applyWinScreenGameBackground();
        document.getElementById('win-title').textContent = 'Defeat - Forfeited';
        document.getElementById('win-sub').textContent = 'You forfeited the match';
        document.getElementById('win-zones').innerHTML = '';
        const rewardsEl = document.getElementById('win-rewards');
        if(CURRENT_MODE==='challenger'){
          rewardsEl.style.display = 'block';
          rewardsEl.innerHTML = `
            <div style="text-align:center;font-family:'Cinzel',serif;font-size:.75rem;color:#ff7070;letter-spacing:.15em;margin-bottom:.6rem;">CHALLENGER FORFEIT</div>
            <div class="win-rewards-grid">
              <div class="win-reward-box">
                <div class="wrb-label" style="color:#ff7070;">ELO LOST</div>
                <div class="wrb-value" style="color:#ff7070;">${eloChange}</div>
                <div class="wrb-sub">now ${USER_PROFILE.challengerElo||600}</div>
              </div>
              <div class="win-reward-box">
                <div class="wrb-label">RANK</div>
                <div class="wrb-value win-rank-badge-large">${renderRankBadge(USER_PROFILE.challengerElo||600,'lg')}</div>
              </div>
            </div>`;
        } else {
          rewardsEl.style.display = 'none';
        }
      }}
    ]);
}

function showAudioSettings() {
  const av = Math.round(_masterVol*100);
  const mv = Math.round(_musicVol*100);
  const vv = Math.round(_voiceVol*100);
  const sv = Math.round(_sfxVol*100);
  showModal('Audio',`
    <div class="audio-settings-content">
      <div class="audio-settings-head">
        <div class="audio-settings-title">Audio Mix</div>
      </div>
      <div class="audio-slider-row">
        <div class="audio-slider-meta"><span>Master</span><output id="vol-master-readout">${av}%</output></div>
        <input type="range" min="0" max="100" value="${av}" oninput="setMasterVolume(this.value);var o=document.getElementById('vol-master-readout');if(o)o.textContent=this.value+'%';">
      </div>
      <div class="audio-slider-row">
        <div class="audio-slider-meta"><span>Music</span><output id="vol-music-readout">${mv}%</output></div>
        <input type="range" min="0" max="100" value="${mv}" oninput="setMusicVolume(this.value);var o=document.getElementById('vol-music-readout');if(o)o.textContent=this.value+'%';">
      </div>
      <div class="audio-slider-row">
        <div class="audio-slider-meta"><span>Effects</span><output id="vol-sfx-readout">${sv}%</output></div>
        <input type="range" min="0" max="100" value="${sv}" oninput="setSfxVolume(this.value);var o=document.getElementById('vol-sfx-readout');if(o)o.textContent=this.value+'%';">
      </div>
      <div class="audio-slider-row">
        <div class="audio-slider-meta"><span>Voices</span><output id="vol-voice-readout">${vv}%</output></div>
        <input type="range" min="0" max="100" value="${vv}" oninput="setVoiceVolume(this.value);var o=document.getElementById('vol-voice-readout');if(o)o.textContent=this.value+'%';">
      </div>
    </div>
    `,[{label:'Close',action:closeModal}], {immediate:true});
  syncMusicToggleButtons();
  const modalEl = document.querySelector('#modal .modal');
  if(modalEl) {
    modalEl.classList.add('audio-settings-modal');
    modalEl.style.setProperty('width', '468px', 'important');
    modalEl.style.setProperty('max-width', 'min(468px, calc(100vw - 32px))', 'important');
    modalEl.style.setProperty('min-width', '0', 'important');
    modalEl.style.setProperty('min-height', '0', 'important');
    modalEl.style.setProperty('padding', '1.45rem 1.65rem 1.55rem', 'important');
    modalEl.style.setProperty('overflow', 'visible', 'important');
  }
  const titleEl = document.getElementById('modal-title');
  if(titleEl) titleEl.style.display = 'none';
  const bodyEl = document.getElementById('modal-body');
  if(bodyEl) {
    bodyEl.style.setProperty('width', '100%', 'important');
    bodyEl.style.setProperty('min-height', '0', 'important');
    bodyEl.style.setProperty('padding', '0', 'important');
    bodyEl.style.setProperty('margin', '0 auto', 'important');
    bodyEl.style.setProperty('overflow', 'visible', 'important');
  }
  const actsEl = document.getElementById('modal-acts');
  if(actsEl) {
    actsEl.style.setProperty('justify-content', 'center', 'important');
    actsEl.style.setProperty('padding-top', '.18rem', 'important');
    actsEl.style.setProperty('margin-top', '.18rem', 'important');
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  VISUAL POLISH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Sparkle burst on card placement — disabled per user preference
function spawnPlacementSparkle(z,r,c) {
  return;
}

// Turn transition flash
function showTurnFlash() {
  playSfx('turnChange');
  const el = document.createElement('div');
  el.className='turn-flash';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),420);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  TITLE BACKGROUND CROSSFADE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PROFILE UI
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function showProfile() {
  renderProfileModal(false);
}

function refreshProfileDisplays() {
  if(typeof renderTitleProfile==='function') renderTitleProfile();
  if(typeof updatePlayerBanners==='function') updatePlayerBanners();
}

function renderProfileModal(editing) {
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const body = document.createElement('div');
  const picImg = getProfileImgSrc('square');
  const cropStyle = getProfileCropStyle();
  const rankFrame = typeof getRankFrameStyle === 'function' ? getRankFrameStyle(USER_PROFILE.challengerElo||600,'icon') : '';
  const bio = USER_PROFILE.bio || '';
  const winrate = USER_PROFILE.wins+USER_PROFILE.losses>0
    ? Math.round(USER_PROFILE.wins*100/(USER_PROFILE.wins+USER_PROFILE.losses))
    : 0;
  const chElo = USER_PROFILE.challengerElo||600;

  let html = `
    <div class="profile-wrap title-profile-modal-v2">
      <div class="profile-left-col">
        <div class="profile-img-wrap" style="${rankFrame}" onclick="openProfileImageEditor()">
          ${picImg ? `<img src="${picImg}" style="${cropStyle}" alt="">` : '<span class="pi-placeholder">P</span>'}
          <div class="pi-edit">EDIT IMAGE</div>
        </div>
      </div>
      <div class="profile-info">`;

  if(editing){
    html += `
        <input type="text" class="profile-input" id="prof-name-inp" maxlength="24" value="${escapeHtml(USER_PROFILE.username)}" placeholder="Username" style="font-family:'Cinzel',serif;font-size:1.4rem;margin-bottom:.5rem;">
        <div class="profile-stats">
          <div class="profile-stat elo"><div class="ps-label">Challenger ELO</div><div class="ps-value">${USER_PROFILE.challengerElo||600}</div></div>
          <div class="profile-stat wins"><div class="ps-label">vs Human</div><div class="ps-value">${USER_PROFILE.wins||0}W / ${USER_PROFILE.losses||0}L</div></div>
          <div class="profile-stat losses"><div class="ps-label">vs AI</div><div class="ps-value">${USER_PROFILE.challengerWins||0}W / ${USER_PROFILE.challengerLosses||0}L</div></div>
        </div>
        <textarea class="profile-input" id="prof-bio-inp" maxlength="240" placeholder="Write a bio...">${escapeHtml(bio)}</textarea>`;
  } else {
    const humanW = USER_PROFILE.wins||0;
    const humanL = USER_PROFILE.losses||0;
    const aiW = USER_PROFILE.challengerWins||0;
    const aiL = USER_PROFILE.challengerLosses||0;
    const totalW = humanW+aiW;
    const totalL = humanL+aiL;
    const wr = totalW+totalL>0 ? Math.round(totalW*100/(totalW+totalL)) : 0;
    html += `
        <div class="profile-name">${escapeHtml(USER_PROFILE.username)}</div>
        <div class="profile-rank-row profile-rank-level-row">${renderRankBadge(chElo,'lg')}${renderLevelBadge(USER_PROFILE.level).replace('level-badge','level-badge profile-level-badge')}</div>
        <div class="profile-stats profile-stats-lifted">
          <div class="profile-stat elo"><div class="ps-label">Challenger ELO</div><div class="ps-value">${chElo}</div></div>
          <div class="profile-stat"><div class="ps-label">vs Human</div><div class="ps-value" style="font-size:.9rem;">${humanW}W / ${humanL}L</div></div>
          <div class="profile-stat"><div class="ps-label">vs AI</div><div class="ps-value" style="font-size:.9rem;">${aiW}W / ${aiL}L</div></div>
          <div class="profile-stat"><div class="ps-label">Winrate</div><div class="ps-value">${wr}%</div></div>
        </div>
        <div class="profile-bio${bio?'':' empty'}">${bio ? escapeHtml(bio) : 'No bio set. Click Edit to add one.'}</div>`;
  }

  html += `
      </div>
    </div>`;

  body.innerHTML = html;

  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Profile';
  document.getElementById('modal-acts').innerHTML = '';
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('title-profile-modal');
  if(typeof FateSVG !== 'undefined' && FateSVG && typeof FateSVG.decorate === 'function'){
    FateSVG.decorate(document.getElementById('modal'));
  }

  const close = document.createElement('button');
  close.className='btn sm'; close.textContent='Close'; close.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(close);

  if(editing){
    const save = document.createElement('button');
    save.className='btn sm pri'; save.textContent='Save';
    save.onclick = ()=>{
      const n = document.getElementById('prof-name-inp').value.trim();
      const b = document.getElementById('prof-bio-inp').value.trim();
      if(!n){toast('Username cannot be empty');return;}
      // Handle username change in leaderboard
      if(n !== USER_PROFILE.username){
        const oldIdx = LEADERBOARD.findIndex(e=>e.username===USER_PROFILE.username);
        if(oldIdx>=0) LEADERBOARD.splice(oldIdx,1);
      }
      USER_PROFILE.username = n;
      USER_PROFILE.bio = b;
      saveProfile();
      refreshProfileDisplays();
      toast('Profile saved');
      renderProfileModal(false);
    };
    document.getElementById('modal-acts').appendChild(save);
  } else {
    const edit = document.createElement('button');
    edit.className='btn sm pri'; edit.textContent='Edit Profile';
    edit.onclick = ()=>renderProfileModal(true);
    document.getElementById('modal-acts').appendChild(edit);
  }

  document.getElementById('modal').classList.add('on');
}

function renderFeaturedPresets() {
  const container = document.getElementById('profile-presets-container');
  if(!container) return;
  const myPresets = Object.entries(PRESET_DECKS);
  if(myPresets.length===0){
    container.innerHTML = '<p style="color:var(--dim);font-style:italic;font-size:.85rem;">No saved decks yet. Create one in the Deck Builder.</p>';
    return;
  }
  const html = `<p style="color:var(--dim);font-size:.8rem;margin-bottom:.5rem;">Click stars to feature up to 3 decks on your profile.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem;">
    ${myPresets.map(([pid,p])=>{
      const faceCard = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : CARDS.find(c=>[...new Set(p.ids)].includes(c.id));
      const img = faceCard?.img || '';
      const isFeat = USER_PROFILE.featuredPresets.includes(pid);
      return `<div style="position:relative;border:1px solid ${isFeat?'var(--gold)':'var(--border)'};border-radius:4px;overflow:hidden;padding:.3rem;background:rgba(0,0,0,.3);">
        <div style="height:80px;background:#0a0a0f;overflow:hidden;border-radius:2px;margin-bottom:.3rem;">
          ${img?`<img src="${img}" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;" onerror="this.style.display='none'">`:''}
        </div>
        <div style="font-family:'Cinzel',serif;font-size:.72rem;color:var(--gold);margin-bottom:.15rem;">${escapeHtml(p.name)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.6rem;color:var(--dim);">${p.description?escapeHtml(p.description.slice(0,20)):''}</span>
          <button class="btn sm" style="padding:.15rem .4rem;font-size:.65rem;" onclick="toggleFeatured('${pid}')">${isFeat?'Featured':'Feature'}</button>
        </div>
      </div>`;
    }).join('')}
    </div>`;
  container.innerHTML = html;
}

window.toggleFeatured = function(pid){
  const idx = USER_PROFILE.featuredPresets.indexOf(pid);
  if(idx>=0) USER_PROFILE.featuredPresets.splice(idx,1);
  else {
    if(USER_PROFILE.featuredPresets.length>=3){toast('Max 3 featured decks. Unfeature one first.');return;}
    USER_PROFILE.featuredPresets.push(pid);
  }
  saveProfile();
  renderFeaturedPresets();
};

function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getProfileImgSrc(shape='circle'){
  return resolveProfileImgSrc(USER_PROFILE.profileImg, shape) || (typeof getDefaultProfileImgSrc === 'function' ? getDefaultProfileImgSrc() : 'blank.png');
}
function getProfileCropStyle(){
  const p = USER_PROFILE.profileImg;
  const base = 'width:100%!important;height:100%!important;object-fit:cover!important;max-width:none!important;max-height:none!important;';
  if(!p || typeof p === 'string') return base + 'object-position:center center!important;transform:none!important;';
  // Canvas-cropped data URLs are already cropped, so just contain the finished bitmap.
  if(p.dataUrl) return base + 'object-position:center center!important;transform:none!important;';
  // Fallback crop path: preserve crop focus AND zoom, but keep the image clipped by its frame.
  if(p.cropFocusX !== undefined || p.cropFocusY !== undefined || p.cropZoom !== undefined){
    const fx = Math.max(0, Math.min(100, Math.round(((p.cropFocusX ?? 0.5) * 1000)) / 10));
    const fy = Math.max(0, Math.min(100, Math.round(((p.cropFocusY ?? 0.5) * 1000)) / 10));
    const zoom = Math.max(1, Math.min(4, Number(p.cropZoom || 1)));
    return base + `object-position:${fx}% ${fy}%!important;transform:scale(${zoom})!important;transform-origin:${fx}% ${fy}%!important;`;
  }
  if(p.cropTx !== undefined || p.cropTy !== undefined || p.cropZoom !== undefined){
    const approxX = Math.max(0, Math.min(100, 50 - ((p.cropTx||0) * 0.35)));
    const approxY = Math.max(0, Math.min(100, 50 - ((p.cropTy||0) * 0.35)));
    const zoom = Math.max(1, Math.min(4, Number(p.cropZoom || 1)));
    return base + `object-position:${approxX}% ${approxY}%!important;transform:scale(${zoom})!important;transform-origin:${approxX}% ${approxY}%!important;`;
  }
  if(p.cropY !== undefined) return base + `object-position:center ${p.cropY}%!important;transform:none!important;`;
  if(p.pfpId) return base + 'object-position:center center!important;transform:none!important;';
  return base + 'object-position:center 20%!important;transform:none!important;';
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PROFILE IMAGE EDITOR (card picker + cropper)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _cropState = null;

function openProfileImageEditor() {
  const ownedPfps = normalizeOwnedPfps();
  const body = document.createElement('div');
  body.innerHTML = `
    <p style="font-size:.85rem;color:var(--dim);font-style:italic;margin-bottom:.6rem;">Choose one of your unlocked profile pictures, then frame the area you want to use:</p>
    <div class="cropper-picker" id="pfp-picker-grid"></div>
    ${ownedPfps.length ? '' : '<p style="font-size:.82rem;color:var(--dim);line-height:1.5;text-align:center;margin-top:.8rem;">You only have the default blank icon right now. Open Profile Picture Boosters in the store to unlock more profile pictures.</p>'}`;
  const grid = body.querySelector('#pfp-picker-grid');
  const defaultEl = document.createElement('div');
  defaultEl.className = 'cropper-pick-card';
  defaultEl.innerHTML = `<img src="${typeof getDefaultProfileImgSrc === 'function' ? getDefaultProfileImgSrc() : 'blank.png'}" alt="Default profile picture" onerror="this.style.display='none'">`;
  defaultEl.title = 'Default Profile Picture';
  defaultEl.onclick = ()=>{
    USER_PROFILE.profileImg = typeof getDefaultProfileImgSrc === 'function' ? getDefaultProfileImgSrc() : 'blank.png';
    saveProfile();
    renderProfileModal(false);
    toast('Default profile picture equipped');
  };
  grid.appendChild(defaultEl);
  ownedPfps.forEach(pfpId=>{
    const el = document.createElement('div');
    el.className='cropper-pick-card';
    el.innerHTML = `<img src="${PFP_PATH(pfpId, 'square')}" alt="Profile picture ${pfpId}" onerror="this.style.display='none'">`;
    el.title = `Profile Picture ${pfpId}`;
    el.onclick = ()=>openImageCropper({ img:PFP_PATH(pfpId, 'square'), pfpId, id:`pfp-${pfpId}`, name:`Profile Picture ${pfpId}` });
    grid.appendChild(el);
  });

  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent='Select a Profile Picture';
  document.getElementById('modal-acts').innerHTML='';
  const back=document.createElement('button');back.className='btn sm';back.textContent='Back';
  back.onclick=()=>renderProfileModal(false);
  document.getElementById('modal-acts').appendChild(back);
}

function openImageCropper(card) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="cropper-wrap">
      <p style="font-size:.82rem;color:var(--dim);font-style:italic;">Drag to reposition inside the selected frame. Scroll or use the slider to zoom.</p>
      <div class="cropper-area" id="cropper-area">
        <img id="cropper-img" src="${card.img}" alt="">
        <div class="cropper-ring cropper-box"></div>
      </div>
      <div class="cropper-controls">
        <label>ZOOM</label>
        <input type="range" id="cropper-zoom" min="100" max="400" value="150">
        <span id="cropper-zoom-val" style="color:var(--gold);min-width:40px;">150%</span>
      </div>
    </div>`;

  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent='Crop Profile Picture';
  document.getElementById('modal-acts').innerHTML='';
  const back=document.createElement('button');back.className='btn sm';back.textContent='Pick Different Picture';
  back.onclick=openProfileImageEditor;
  const save=document.createElement('button');save.className='btn sm pri';save.textContent='Save';
  save.onclick=()=>{ saveCroppedImage(card); };
  document.getElementById('modal-acts').appendChild(back);
  document.getElementById('modal-acts').appendChild(save);

  // Set up cropper
  setTimeout(()=>setupCropper(card),50);
}

function setupCropper(card) {
  const area = document.getElementById('cropper-area');
  const img = document.getElementById('cropper-img');
  if(!area||!img) return;
  _cropState = { zoom: 1.5, offsetX: 0, offsetY: 0, dragging:false, dragStartX:0, dragStartY:0, card };

  img.onload = ()=>{
    // Center the image initially
    const areaW=300, areaH=300;
    const iw=img.naturalWidth, ih=img.naturalHeight;
    const scaleX = areaW/iw, scaleY = areaH/ih;
    const baseScale = Math.max(scaleX, scaleY);
    _cropState.baseScale = baseScale;
    _cropState.offsetX = (areaW - iw*baseScale*_cropState.zoom)/2;
    _cropState.offsetY = (areaH - ih*baseScale*_cropState.zoom)/2;
    clampCropperOffsets();
    updateCropperDisplay();
  };
  if(img.complete) img.onload();

  area.onmousedown = (e)=>{
    _cropState.dragging=true;
    _cropState.dragStartX = e.clientX - _cropState.offsetX;
    _cropState.dragStartY = e.clientY - _cropState.offsetY;
  };
  document.onmousemove = (e)=>{
    if(!_cropState?.dragging) return;
    _cropState.offsetX = e.clientX - _cropState.dragStartX;
    _cropState.offsetY = e.clientY - _cropState.dragStartY;
    clampCropperOffsets();
    updateCropperDisplay();
  };
  document.onmouseup = ()=>{ if(_cropState) _cropState.dragging=false; };

  // Touch support
  area.ontouchstart = (e)=>{
    const t = e.touches[0];
    _cropState.dragging=true;
    _cropState.dragStartX = t.clientX - _cropState.offsetX;
    _cropState.dragStartY = t.clientY - _cropState.offsetY;
  };
  area.ontouchmove = (e)=>{
    if(!_cropState?.dragging) return;
    const t = e.touches[0];
    _cropState.offsetX = t.clientX - _cropState.dragStartX;
    _cropState.offsetY = t.clientY - _cropState.dragStartY;
    clampCropperOffsets();
    updateCropperDisplay();
    e.preventDefault();
  };
  area.ontouchend = ()=>{ if(_cropState) _cropState.dragging=false; };

  const zoomSlider = document.getElementById('cropper-zoom');
  zoomSlider.oninput = ()=>{
    const prevScale = (_cropState.baseScale || 1) * _cropState.zoom;
    const newZoom = parseInt(zoomSlider.value)/100;
    const cropBox = getCropBoxMetrics();
    const cx = cropBox.x + cropBox.w/2;
    const cy = cropBox.y + cropBox.h/2;
    const imgCX = (cx - _cropState.offsetX)/prevScale;
    const imgCY = (cy - _cropState.offsetY)/prevScale;
    _cropState.zoom = newZoom;
    const nextScale = (_cropState.baseScale || 1) * _cropState.zoom;
    _cropState.offsetX = cx - imgCX*nextScale;
    _cropState.offsetY = cy - imgCY*nextScale;
    document.getElementById('cropper-zoom-val').textContent = zoomSlider.value+'%';
    clampCropperOffsets();
    updateCropperDisplay();
  };

  area.onwheel = (e)=>{
    e.preventDefault();
    const curZoom = parseInt(zoomSlider.value);
    const newZoom = Math.max(100, Math.min(400, curZoom + (e.deltaY<0?10:-10)));
    zoomSlider.value = newZoom;
    zoomSlider.oninput();
  };
}

function getCropBoxMetrics() {
  const area = document.getElementById('cropper-area');
  const frame = area?.querySelector('.cropper-box');
  if(!area || !frame){
    return { x:18, y:18, w:264, h:264 };
  }
  return {
    x: frame.offsetLeft,
    y: frame.offsetTop,
    w: frame.offsetWidth,
    h: frame.offsetHeight
  };
}

function clampCropperOffsets() {
  const img = document.getElementById('cropper-img');
  if(!img || !_cropState?.baseScale) return;
  const cropBox = getCropBoxMetrics();
  const scale = _cropState.baseScale * _cropState.zoom;
  const scaledW = img.naturalWidth * scale;
  const scaledH = img.naturalHeight * scale;
  const minX = cropBox.x + cropBox.w - scaledW;
  const maxX = cropBox.x;
  const minY = cropBox.y + cropBox.h - scaledH;
  const maxY = cropBox.y;

  _cropState.offsetX = scaledW <= cropBox.w
    ? cropBox.x + (cropBox.w - scaledW)/2
    : Math.min(maxX, Math.max(minX, _cropState.offsetX));
  _cropState.offsetY = scaledH <= cropBox.h
    ? cropBox.y + (cropBox.h - scaledH)/2
    : Math.min(maxY, Math.max(minY, _cropState.offsetY));
}

function updateCropperDisplay() {
  const img = document.getElementById('cropper-img');
  if(!img||!_cropState) return;
  clampCropperOffsets();
  const scale = _cropState.baseScale * _cropState.zoom;
  img.style.transform = `translate(${_cropState.offsetX}px,${_cropState.offsetY}px) scale(${scale})`;
}

function saveCroppedImage(card) {
  // Try canvas approach first (works if same-origin)
  try {
    const img = document.getElementById('cropper-img');
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const scale = _cropState.baseScale * _cropState.zoom;
    const cropBox = getCropBoxMetrics();
    clampCropperOffsets();
    const sx = Math.max(0, (cropBox.x - _cropState.offsetX) / scale);
    const sy = Math.max(0, (cropBox.y - _cropState.offsetY) / scale);
    const sw = Math.min(img.naturalWidth - sx, cropBox.w / scale);
    const sh = Math.min(img.naturalHeight - sy, cropBox.h / scale);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    if(dataUrl && dataUrl.length > 100){
      USER_PROFILE.profileImg = { dataUrl, cardId: card.id, pfpId: card.pfpId||null };
      saveProfile();
      refreshProfileDisplays();
      toast('Profile picture saved');
      renderProfileModal(false);
      document.onmousemove = null;
      document.onmouseup = null;
      return;
    }
  } catch(e){}
  // Fallback: store card image with crop metadata for CSS-based cropping
  {
    const img2 = document.getElementById('cropper-img');
    const scale2 = (_cropState?.baseScale || 1) * (_cropState?.zoom || 1);
    const cropBox2 = getCropBoxMetrics();
    clampCropperOffsets();
    const sx = img2 ? Math.max(0, (cropBox2.x - _cropState.offsetX) / scale2) : 0;
    const sy = img2 ? Math.max(0, (cropBox2.y - _cropState.offsetY) / scale2) : 0;
    const sw = img2 ? Math.min(img2.naturalWidth - sx, cropBox2.w / scale2) : 0;
    const sh = img2 ? Math.min(img2.naturalHeight - sy, cropBox2.h / scale2) : 0;
    const focusX = img2 && img2.naturalWidth ? (sx + sw/2) / img2.naturalWidth : 0.5;
    const focusY = img2 && img2.naturalHeight ? (sy + sh/2) / img2.naturalHeight : 0.5;
    USER_PROFILE.profileImg = {
      cardImg: card.img,
      cardId: card.id,
      pfpId: card.pfpId||null,
      cropZoom: _cropState ? _cropState.zoom : 1,
      cropFocusX: Math.max(0, Math.min(1, focusX)),
      cropFocusY: Math.max(0, Math.min(1, focusY)),
      cropTx: _cropState ? Math.round((_cropState.offsetX / 300) * 100) : 0,
      cropTy: _cropState ? Math.round((_cropState.offsetY / 300) * 100) : 0,
      cropY: _cropState ? Math.round(_cropState.offsetY / 3) : 25
    };
    saveProfile();
    refreshProfileDisplays();
    toast('Profile picture saved');
    renderProfileModal(false);
    document.onmousemove = null;
    document.onmouseup = null;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  LEADERBOARD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function showLeaderboard() {
  updateLeaderboardEntry();
  AI_OPPONENTS.forEach(ai=>{
    if(!LEADERBOARD.find(e=>e.username===ai.name)){
    LEADERBOARD.push({username:ai.name, elo:ai.elo, wins:Math.floor(ai.elo/30), losses:Math.floor(ai.elo/60), profileImg:ai.img||'blank.png', isAI:true});
    }
  });
  saveLeaderboard();
  const sorted = [...LEADERBOARD].sort((a,b)=>b.elo-a.elo);
  const body = document.createElement('div');
  let html = `<div style="display:flex;gap:.4rem;margin-bottom:.8rem;flex-wrap:wrap;">
    <button class="btn sm pri" onclick="showLeaderboard()">Rankings</button>
    <button class="btn sm" onclick="showMatchHistory()">Recent Matches</button>
    <button class="btn sm" onclick="showDivisionPage()">Divisions</button>
  </div>`;
  if(sorted.length===0){
    html += `<div style="text-align:center;padding:2rem;color:var(--dim);">Leaderboard is empty.</div>`;
  } else {
    html += '<div class="lb-list" style="max-height:55vh;overflow-y:auto;">';
    sorted.forEach((entry,i)=>{
      const isMe = entry.username===USER_PROFILE.username;
      const rankCls = i===0?' top1':i===1?' top2':i===2?' top3':'';
      const imgSrc = entry.profileImg ? (typeof entry.profileImg==='string'?entry.profileImg:(entry.profileImg.dataUrl||entry.profileImg.cardImg)) : null;
      html += `<div class="lb-row${isMe?' me':''}" style="display:flex;align-items:center;gap:.6rem;padding:.5rem .6rem;border-bottom:1px solid var(--border);">
        <div class="lb-rank${rankCls}" style="width:32px;text-align:center;font-weight:700;flex-shrink:0;">#${i+1}</div>
        <div style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:#0a0a0f;flex-shrink:0;display:flex;align-items:center;justify-content:center;${typeof getRankFrameStyle==='function'?getRankFrameStyle(entry.elo,'icon'):''}">
          ${imgSrc?`<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;object-position:center 25%;">`:(entry.isAI?'<span style="font-size:1.2rem;">AI</span>':'<span style="font-size:1rem;color:var(--dim);">P</span>')}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:Cinzel,serif;font-size:.78rem;color:${isMe?'var(--gold)':'var(--text)'};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(entry.username)}${isMe?' <span style="color:var(--gold);font-size:.6rem;">(YOU)</span>':''}</div>
          <div style="margin-top:.18rem;">${renderRankBadge(entry.elo,'md')}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;font-family:Cinzel,serif;">
          <div style="font-size:.7rem;color:var(--dim);">${entry.wins||0}W / ${entry.losses||0}L</div>
          <div style="font-size:.85rem;color:${getRank(entry.elo).color};font-weight:700;">${entry.elo}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }
  body.innerHTML = html;
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Global Leaderboard';
  document.getElementById('modal-acts').innerHTML='';
  const close=document.createElement('button');close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(close);
  const modalBox = document.querySelector('#modal .modal');
  if(modalBox) modalBox.classList.add('leaderboard-modal');
  document.getElementById('modal').classList.add('on');
}

//  PUBLIC DECKS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _publicDecksPage = 0;

function showPublicDecks(page=_publicDecksPage) {
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const body = document.createElement('div');
  const sorted = [...PUBLIC_DECKS].sort((a,b)=>{
    const ar = avgRating(a), br = avgRating(b);
    return br-ar;
  });
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  _publicDecksPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageDecks = sorted.slice(_publicDecksPage * pageSize, _publicDecksPage * pageSize + pageSize);
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;">
      <p style="font-size:.85rem;color:var(--dim);font-style:italic;margin:0;">Browse and rate public decks shared by the community.</p>
      <button class="btn sm pri" onclick="openShareDeckFlow()">+ Share a Deck</button>
    </div>`;
  if(sorted.length===0){
    html += `<div style="text-align:center;padding:2rem;color:var(--dim);font-style:italic;">No public decks yet. Be the first to share!</div>`;
  } else {
    html += '<div class="pd-list">';
    pageDecks.forEach(d=>{
      const faceCard = d.faceCardId ? CARDS.find(c=>c.id===d.faceCardId) : null;
      const img = faceCard?.img || '';
      const rating = avgRating(d);
      const stars = renderStars(rating);
      html += `<div class="preset-browse-tile pd-tile" onclick="viewPublicDeck('${d.id}')">
        <div class="preset-tile-art">
          ${img?`<img src="${img}" onerror="this.style.display='none'">`:''}
          <div class="preset-tile-overlay"></div>
        </div>
        <div class="preset-tile-info">
          <div class="pd-author">by ${escapeHtml(d.username)}</div>
          <div class="preset-name">${escapeHtml(d.name)}</div>
          <div class="preset-desc">${escapeHtml(d.description||'')}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem;">
            <div class="pd-rating"><span class="pd-stars">${stars}</span><span style="color:var(--dim);font-size:.7rem;">(${d.ratings.length})</span></div>
            <div style="font-size:.65rem;color:var(--dim);">${d.comments.length} comment${d.comments.length!==1?'s':''}</div>
          </div>
        </div>
      </div>`;
    });
    html += `</div>
      <div style="display:flex;justify-content:flex-start;align-items:center;gap:.6rem;flex-wrap:wrap;margin-top:1rem;">
        <button class="btn sm" onclick="showPublicDecks(${_publicDecksPage-1})" ${_publicDecksPage<=0?'disabled':''}>Prev</button>
        <button class="btn sm" onclick="showPublicDecks(${_publicDecksPage+1})" ${_publicDecksPage>=totalPages-1?'disabled':''}>Next</button>
        <span style="font-family:'Cinzel',serif;font-size:.68rem;color:var(--dim);letter-spacing:.08em;">Page ${_publicDecksPage+1} / ${totalPages}</span>
      </div>`;
  }
  body.innerHTML = html;
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = 'Public Decks';
  document.getElementById('modal-acts').innerHTML='';
  const close=document.createElement('button');close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
  document.getElementById('modal-acts').appendChild(close);
  document.getElementById('modal').classList.add('on');
}

function avgRating(deck){
  if(!deck.ratings || !deck.ratings.length) return 0;
  return deck.ratings.reduce((s,r)=>s+r.stars,0)/deck.ratings.length;
}
function renderStars(r){
  const full = Math.round(r);
  return '&#9733;'.repeat(full) + '&#9734;'.repeat(5-full);
}

window.viewPublicDeck = function(id){
  const d = PUBLIC_DECKS.find(x=>x.id===id);
  if(!d) return;
  const body = document.createElement('div');
  const faceCard = d.faceCardId ? CARDS.find(c=>c.id===d.faceCardId) : null;
  const rating = avgRating(d);
  const myRating = d.ratings.find(r=>r.username===USER_PROFILE.username);
  // Count cards by type
  const counts = {};
  d.ids.forEach(id=>{counts[id]=(counts[id]||0)+1;});
  let html = `
    <div style="display:flex;gap:1rem;margin-bottom:1rem;">
      ${faceCard?.img?`<div style="width:140px;height:196px;flex-shrink:0;border:1px solid var(--gold);border-radius:4px;overflow:hidden;background:#0a0a0f;"><img src="${faceCard.img}" style="width:100%;height:100%;object-fit:cover;"></div>`:''}
      <div style="flex:1;">
        <div class="pd-author">by ${escapeHtml(d.username)}</div>
        <div style="font-family:'Cinzel',serif;font-size:1.2rem;color:var(--gold);margin-bottom:.4rem;">${escapeHtml(d.name)}</div>
        <div class="pd-rating" style="margin-bottom:.5rem;"><span class="pd-stars" style="font-size:1.1rem;">${renderStars(rating)}</span><span style="color:var(--dim);">${rating.toFixed(1)} (${d.ratings.length})</span></div>
        <div style="font-style:italic;color:var(--text);font-size:.9rem;line-height:1.5;">${escapeHtml(d.description||'No description.')}</div>
        <div style="margin-top:.8rem;">
          <button class="btn sm" onclick="loadPublicDeck('${d.id}')" ${Object.values(PRESET_DECKS).some(p=>p._importedFromPublicId===d.id||(p.name===d.name+' (imported)'&&JSON.stringify(p.ids)===JSON.stringify(d.ids)))?'disabled style="opacity:.5;"':''}>${Object.values(PRESET_DECKS).some(p=>p._importedFromPublicId===d.id||(p.name===d.name+' (imported)'&&JSON.stringify(p.ids)===JSON.stringify(d.ids)))?'Already Imported':'Import to My Presets'}</button>
          <button class="btn sm" onclick="rateDeck('${d.id}')">Rate</button>
        </div>
        <div id="pd-inline-rate"></div>
      </div>
    </div>
    <div style="font-family:'Cinzel',serif;font-size:.75rem;color:var(--gold);margin:.6rem 0;letter-spacing:.1em;">DECK CONTENTS (${d.ids.length} cards)</div>
    <div class="preset-view-grid">`;
  const entries = Object.entries(counts).map(([id,n])=>({card:CARDS.find(c=>c.id===id),count:n})).filter(e=>e.card);
  entries.sort((a,b)=>{
    const ta=a.card.type==='Supporter'?0:1, tb=b.card.type==='Supporter'?0:1;
    if(ta!==tb) return ta-tb;
    return (a.card.cost||0)-(b.card.cost||0);
  });
  entries.forEach(({card:c,count})=>{
    html += `<div class="mc visual-mc preset-view-card" title="${escapeHtml(c.name)}">
      <div class="mc-art">${c.img?`<img src="${c.img}">`:`<span class="mc-ico">${getAffIcon(c.aff)}</span>`}</div>
      <div class="mc-fate">${c.fate}</div>
      <div class="visual-name">${escapeHtml(c.name)}</div>
      <div class="preset-card-count">x${count}</div>
    </div>`;
  });
  html += `</div>
    <div class="pd-comments-section">
      <div style="font-family:'Cinzel',serif;font-size:.75rem;color:var(--gold);margin-bottom:.5rem;letter-spacing:.1em;">COMMENTS</div>
      <div id="pd-comments-list">`;
  if(d.comments.length===0) html += '<p style="color:var(--dim);font-size:.85rem;font-style:italic;">No comments yet.</p>';
  else d.comments.forEach(c=>{
    html += `<div class="pd-comment">
      <div class="pc-author">${escapeHtml(c.username)} <span style="color:var(--dim);font-family:'Crimson Pro',serif;font-weight:400;font-size:.65rem;">${new Date(c.timestamp).toLocaleDateString()}</span></div>
      <div>${escapeHtml(c.text)}</div>
    </div>`;
  });
  html += `</div>
      <div style="margin-top:.6rem;display:flex;gap:.4rem;">
        <input type="text" class="profile-input" id="pd-comment-inp" maxlength="240" placeholder="Leave a comment..." style="flex:1;font-size:.85rem;">
        <button class="btn sm pri" onclick="postComment('${d.id}')">Post</button>
      </div>
    </div>`;

  body.innerHTML = html;
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent = d.name;
  document.getElementById('modal-acts').innerHTML='';
  const back=document.createElement('button');back.className='btn sm';back.textContent='Back';back.onclick=()=>showPublicDecks(_publicDecksPage);
  document.getElementById('modal-acts').appendChild(back);
  if(d.username===USER_PROFILE.username){
    const del=document.createElement('button');del.className='btn sm danger';del.textContent='Delete';
    del.onclick=()=>{
      showModal('Delete Public Deck?',`Delete "${escapeHtml(d.name)}"? This cannot be undone.`,
        [{label:'Cancel',action:closeModal},{label:'Delete',danger:true,action:()=>{
          PUBLIC_DECKS = PUBLIC_DECKS.filter(x=>x.id!==d.id);
          savePublicDecks(); closeModal(); toast('Deck deleted'); showPublicDecks();
        }}]);
    };
    document.getElementById('modal-acts').appendChild(del);
  }
};

window.loadPublicDeck = function(id){
  const d = PUBLIC_DECKS.find(x=>x.id===id);
  if(!d) return;
  const alreadyImported = Object.values(PRESET_DECKS).some(p =>
    p._importedFromPublicId === id ||
    (p.name === d.name + ' (imported)' && JSON.stringify(p.ids) === JSON.stringify(d.ids))
  );
  if(alreadyImported){
    toast('Already imported this deck');
    return;
  }
  const key = 'user_'+Date.now();
  PRESET_DECKS[key] = {
    name: d.name+' (imported)',
    description: d.description||'',
    theme: 'Imported',
    ids: [...d.ids],
    faceCardId: d.faceCardId,
    displayCardIds: d.displayCardIds||[],
    _importedFromPublicId: id
  };
  savePresetsToStorage();
  toast('Deck imported to your presets');
  viewPublicDeck(id);
};

window.rateDeck = function(id){
  const d = PUBLIC_DECKS.find(x=>x.id===id);
  if(!d) return;
  const existing = d.ratings.find(r=>r.username===USER_PROFILE.username);
  const container = document.getElementById('pd-inline-rate');
  if(container){
    container.innerHTML = `<div style="padding:.6rem;border:1px solid rgba(201,168,76,.3);border-radius:8px;background:rgba(0,0,0,.3);margin-top:.5rem;">
      <p style="font-size:.8rem;color:var(--dim);margin:0 0 .4rem;">Your rating:</p>
      <div style="display:flex;gap:.3rem;font-size:1.6rem;">
        ${[1,2,3,4,5].map(n=>'<span style="cursor:pointer;color:'+(existing&&existing.stars>=n?'#ffd700':'var(--dim)')+';transition:color .15s;" onclick="submitRating(\''+id+'\','+n+')" onmouseenter="this.style.color=\'#ffd700\'" onmouseleave="this.style.color=\''+(existing&&existing.stars>=n?'#ffd700':'var(--dim)')+'\'">&starf;</span>').join('')}
      </div></div>`;
    container.scrollIntoView({behavior:'smooth',block:'nearest'});
    return;
  }
  viewPublicDeck(id);
};

window.submitRating = function(id, stars){
  const d = PUBLIC_DECKS.find(x=>x.id===id);
  if(!d) return;
  d.ratings = d.ratings.filter(r=>r.username!==USER_PROFILE.username);
  d.ratings.push({username:USER_PROFILE.username, stars, timestamp:Date.now()});
  savePublicDecks();
  toast('Rating submitted');
  viewPublicDeck(id);
};

window.postComment = function(id){
  const inp = document.getElementById('pd-comment-inp');
  if(!inp) return;
  const text = inp.value.trim();
  if(!text){toast('Comment cannot be empty');return;}
  const d = PUBLIC_DECKS.find(x=>x.id===id);
  if(!d) return;
  d.comments.push({username:USER_PROFILE.username, text, timestamp:Date.now()});
  savePublicDecks();
  viewPublicDeck(id);
};

function openShareDeckFlow(){
  const keys = Object.keys(PRESET_DECKS);
  if(keys.length===0){toast('Create a preset first');return;}
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const body = document.createElement('div');
  body.className = 'share-deck-pick-body';
  body.innerHTML = '<p class="share-deck-pick-subtitle">Select a preset to share with the community.</p>';
  const grid = document.createElement('div');
  grid.className = 'preset-browse-grid share-deck-pick-grid';
  keys.forEach(function(pid){
    const p = PRESET_DECKS[pid];
    const ok = p.ids && p.ids.length === 40;
    const alreadyShared = PUBLIC_DECKS.some(function(d){ return d.username===USER_PROFILE.username && d.sourcePid===pid; });
    const sampleIds = Array.from(new Set(p.ids||[]));
    const sampleCards = sampleIds.map(function(id){ return CARDS.find(function(c){ return c.id===id; }); }).filter(Boolean);
    const hero = p.faceCardId ? CARDS.find(function(c){ return c.id===p.faceCardId; }) : (sampleCards.sort(function(a,b){ return (b.fate||0)-(a.fate||0); })[0] || sampleCards[0]);
    const displayCards = (p.displayCardIds && p.displayCardIds.length
      ? p.displayCardIds.map(function(id){ return CARDS.find(function(c){ return c.id===id; }); }).filter(function(c){ return c&&c.img; })
      : sampleCards.filter(function(c){ return c.img; })
    ).slice(0,5);
    const tile = document.createElement('div');
    tile.className = 'preset-browse-tile share-deck-tile';
    tile.style.opacity = (ok && !alreadyShared) ? '1' : '.55';
    const heroImg = hero && hero.img ? '<img src="'+hero.img+'" alt="'+escapeHtml(hero.name)+'" onerror="this.style.display=\'none\'">' : '';
    const minis = displayCards.map(function(c){ return '<div class="preset-mini-art">'+(c.img?'<img src="'+c.img+'" alt="'+escapeHtml(c.name)+'">':'')+'</div>'; }).join('');
    const actionHtml = alreadyShared
      ? '<span style="color:var(--gold);font-size:.72rem;font-family:Cinzel,serif;letter-spacing:.06em;">Already Shared</span>'
      : '<button class="btn sm pri share-deck-publish-btn" type="button" '+(ok?'':'disabled')+'>Share</button>';
    tile.innerHTML = '<div class="preset-tile-art">'+heroImg+'<div class="preset-tile-overlay"></div></div>'
      +'<div class="preset-tile-info">'
      +'<div class="preset-name">'+escapeHtml(p.name)+'</div>'
      +'<div class="preset-desc">'+escapeHtml(p.description||'No description.')+'</div>'
      +'<div class="preset-minis">'+minis+'</div>'
      +'<div class="preset-action-row">'
      +'<span style="font-size:.68rem;color:var(--dim);">'+(ok ? sampleIds.length+' unique' : 'Needs 40 cards')+'</span>'
      +actionHtml
      +'</div></div>';
    if(!alreadyShared && ok){
      var publishBtn = tile.querySelector('.share-deck-publish-btn');
      if(publishBtn) publishBtn.onclick = (function(p2){ return function(e){ e.stopPropagation(); shareDeck(p2); }; })(pid);
    }
    grid.appendChild(tile);
  });
  body.appendChild(grid);
  document.getElementById('modal-body').innerHTML='';
  document.getElementById('modal-body').appendChild(body);
  document.getElementById('modal-title').textContent='Share a Deck';
  document.getElementById('modal-acts').innerHTML='';
  var back=document.createElement('button');back.className='btn sm';back.textContent='Back';back.onclick=function(){showPublicDecks(_publicDecksPage);};
  document.getElementById('modal-acts').appendChild(back);
  document.getElementById('modal').classList.add('on');
}

window.shareDeck = function(pid){
  const p = PRESET_DECKS[pid];
  if(!p) return;
  const shared = {
    id: 'pub_'+Date.now()+'_'+Math.floor(Math.random()*1000),
    sourcePid: pid,
    username: USER_PROFILE.username,
    name: p.name,
    description: p.description||'',
    ids: [...p.ids],
    faceCardId: p.faceCardId,
    displayCardIds: p.displayCardIds||[],
    ratings: [],
    comments: [],
    timestamp: Date.now()
  };
  PUBLIC_DECKS.push(shared);
  savePublicDecks();
  toast('Deck shared publicly!');
  showPublicDecks();
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PRESET EDITING (face card + display cards)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
window.editPreset = function(pid){
  if(typeof resetModalChrome === 'function') resetModalChrome();
  const p = PRESET_DECKS[pid];
  if(!p) return;
  const uniqueIds = [...new Set(p.ids)];
  const deckCards = uniqueIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);

  // Current face/display from preset (or defaults)
  let currentFace = p.faceCardId || deckCards[0]?.id;
  let currentDisplay = [...(p.displayCardIds || deckCards.slice(0,7).map(c=>c.id))];

  const renderEditor = ()=>{
    const body = document.createElement('div');
    body.className = 'deck-art-editor title-deck-art-editor challenger-deck-art-editor deck-art-editor-v2';
    body.innerHTML = `
      <div class="deck-art-editor-main">
        <aside class="deck-art-preview-panel">
          <div class="deck-art-preview-label">Selected Preview</div>
          <div class="deck-art-face-preview" id="edit-face-preview"></div>
          <div class="deck-art-display-preview" id="edit-display-preview"></div>
        </aside>
        <div class="deck-art-picker-stack">
        <section class="deck-art-editor-section">
          <div class="deck-art-editor-title">Face Card (main preview)</div>
          <div class="face-picker-grid" id="face-picker"></div>
        </section>
        <section class="deck-art-editor-section">
          <div class="deck-art-editor-title">Display Cards (up to 7 mini thumbnails) - <span id="display-count">${currentDisplay.length}/7</span></div>
          <div class="face-picker-grid" id="display-picker"></div>
        </section>
        </div>
      </div>`;

    document.getElementById('modal-body').innerHTML='';
    document.getElementById('modal-body').appendChild(body);

    const renderPreview = ()=>{
      const faceCard = deckCards.find(c=>c.id===currentFace) || deckCards[0];
      const facePreview = body.querySelector('#edit-face-preview');
      if(facePreview) {
        facePreview.innerHTML = faceCard?.img
          ? `<img src="${faceCard.img}" alt="${escapeHtml(faceCard.name)}"><span>${escapeHtml(faceCard.name)}</span>`
          : '';
      }
      const strip = body.querySelector('#edit-display-preview');
      if(strip) {
        strip.innerHTML = currentDisplay.map(id=>{
          const c = deckCards.find(card=>card.id===id);
          return c?.img ? `<div><img src="${c.img}" alt="${escapeHtml(c.name)}"></div>` : '';
        }).join('');
      }
    };

    const renderPickers = ()=>{
      const faceGrid = body.querySelector('#face-picker');
      const displayGrid = body.querySelector('#display-picker');
      if(false && typeof window.renderCanvasSelectableCardGrid === 'function') {
        window.renderCanvasSelectableCardGrid(faceGrid, deckCards, {
          isSelected: c=>c.id===currentFace,
          selectedLabel:'FACE',
          onSelect: c=>{ currentFace=c.id; renderPickers(); }
        });
        window.renderCanvasSelectableCardGrid(displayGrid, deckCards, {
          isSelected: c=>currentDisplay.includes(c.id),
          selectedLabel: c=>'#'+(currentDisplay.indexOf(c.id)+1),
          onSelect: c=>{
            const idx=currentDisplay.indexOf(c.id);
            if(idx>=0) currentDisplay.splice(idx,1);
            else {
              if(currentDisplay.length>=7){toast('Max 7 display cards');return;}
              currentDisplay.push(c.id);
            }
            const countEl = document.getElementById('display-count');
            if(countEl) countEl.textContent=currentDisplay.length+'/7';
            renderPickers();
          }
        });
        return;
      }
      const setBadge = function(el, text, gold){
        let badge = el.querySelector('.fp-badge');
        if(!text){
          if(badge) badge.remove();
          return;
        }
        if(!badge){
          badge = document.createElement('div');
          badge.className = 'fp-badge';
          el.appendChild(badge);
        }
        badge.textContent = text;
        badge.style.color = gold ? 'var(--gold)' : '';
      };
      const syncPickerState = function(){
        faceGrid.querySelectorAll('.face-picker-card').forEach(function(el){
          const selected = el.dataset.cardId === currentFace;
          el.classList.toggle('face-sel', selected);
          setBadge(el, selected ? 'FACE' : '', false);
        });
        displayGrid.querySelectorAll('.face-picker-card').forEach(function(el){
          const idx = currentDisplay.indexOf(el.dataset.cardId);
          const selected = idx >= 0;
          el.classList.toggle('display-sel', selected);
          setBadge(el, selected ? '#' + (idx + 1) : '', true);
        });
        const countEl = document.getElementById('display-count');
        if(countEl) countEl.textContent = currentDisplay.length + '/7';
        renderPreview();
      };
      if(faceGrid.childElementCount || displayGrid.childElementCount){
        syncPickerState();
        return;
      }
      faceGrid.innerHTML=''; displayGrid.innerHTML='';
      deckCards.forEach(c=>{
        const el=document.createElement('div');
        el.className='face-picker-card';
        el.dataset.cardId = c.id;
        el.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:''}`;
        el.title=c.name;
        el.onclick=()=>{ currentFace=c.id; syncPickerState(); };
        faceGrid.appendChild(el);

        const el2=document.createElement('div');
        el2.className='face-picker-card';
        el2.dataset.cardId = c.id;
        el2.innerHTML = `${c.img?`<img src="${c.img}" alt="${escapeHtml(c.name)}">`:''}`;
        el2.title=c.name;
        el2.onclick=()=>{
          const idx=currentDisplay.indexOf(c.id);
          if(idx>=0) currentDisplay.splice(idx,1);
          else {
            if(currentDisplay.length>=7){toast('Max 7 display cards');return;}
              currentDisplay.push(c.id);
            }
          syncPickerState();
        };
        displayGrid.appendChild(el2);
      });
      syncPickerState();
    };
    renderPickers();

    document.getElementById('modal-title').textContent='Edit Deck Art';
    document.getElementById('modal-acts').innerHTML='';
    const cancel=document.createElement('button');cancel.className='btn sm';cancel.textContent='Back';cancel.onclick=()=>browsePresets(_presetBrowsePage || 0);
    const save=document.createElement('button');save.className='btn sm pri';save.textContent='Save';
    save.onclick=()=>{
      p.faceCardId = currentFace;
      p.displayCardIds = currentDisplay;
      savePresetsToStorage();
      toast('Deck art updated');
      browsePresets(_presetBrowsePage || 0);
    };
    document.getElementById('modal-acts').appendChild(cancel);
    document.getElementById('modal-acts').appendChild(save);
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('deck-art-editor-modal','challenger-deck-art-editor-modal','title-deck-art-editor-modal');
    document.getElementById('modal').classList.add('on');
  };
  renderEditor();
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
