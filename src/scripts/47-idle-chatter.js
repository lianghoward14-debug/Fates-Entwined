/* Local presentation only: never writes to the authoritative game state. */
(function(){
  'use strict';
  const characters = Object.freeze({
    anicka:{
      name:'Anicka Konvicka', portrait:'pfp/pfp2.png', ids:new Set(['02', 'bh01', 'bh04']), file:'Anicka',
      clips:[
        ['I used to play on the shores of the sea when I was young.', 'I collected seashells, built sandcastles, and watched the sun fall beneath the waves.', 'A lot of time has passed since then.'],
        ['In another time, in another place, these seas were once called Pacifique'],
        ['I wonder what lies beyond that horizon.'],
        ['Kalamitas is the name given to the western seas by the people of Colombo.', 'It stands for destruction and death.', 'But do you not think it could mean something else?'],
        ['I know that somewhere in the Western Seas, Kazumi is there, waiting for me.', "I'll find her, I'll bring her back.", "I won't let the seas take my family away from me ever again."]
      ]
    },
    felicyta:{
      name:'Felicyta Janowicz', portrait:'pfp/pfp1.png', ids:new Set(['01', '82', '85', '100', 'bh11']), file:'Felicyta',
      clips:[
        ["I've made my decision.", 'I will not deploy troops in the Polish heartland.', 'I will not force my soldiers to fight.', 'I will not subject my people to the horrors of war.'],
        ['A thousand year of history rests upon my shoulders.', 'But the only thing that matters are the people who live in this country right now.'],
        ['Their gaze was freezing iron, their rage the smothering darkness.', 'The marks on their chest ...recited the screams of their cruel ends, carved by the murderous implements of war.'],
        ['There is no nation without its people.', 'Cities can be rebuilt, farms replowed.', "But memories, those of one's first love... the embrace of a tender mother... and the breeze on a cool Summer Day... those are lost forever."],
        ['World tension is at a brink.', 'Are we not capable of coming to discourse? To compromise?', 'Even my own sibling, the Hungarian queen, refuse to back down...']
      ]
    }
  });
  let used = new Set(), failed = new Set(), current = null, panel = null;
  let eligibleNow = [];
  let quietSince = Date.now(), nextAt = quietSince + 15000, matchId = '', lastTurn = '';
  let voiceCount = 0;
  let hideAt = 0;
  function positionPanel(){
    if(!panel || panel.hidden) return;
    const anchor = document.querySelector('#s-game .codex-v19-command');
    const rect = anchor?.getBoundingClientRect();
    if(rect && rect.width > 0 && rect.height > 0){
      panel.style.right = Math.max(10, window.innerWidth - rect.right) + 'px';
      panel.style.bottom = Math.max(12, Math.min(window.innerHeight - panel.offsetHeight - 10,
        window.innerHeight - rect.top + 12)) + 'px';
    }
  }
  function stop(){
    if(current){
      const old = current;
      current = null;
      old.audio.pause();
      old.audio.removeAttribute('src');
      old.audio.load();
      nextAt = Date.now() + 15000;
    }
    if(panel && !panel.hidden && !hideAt){
      panel.style.opacity = '0';
      hideAt = Date.now() + 400;
    }
  }
  function activity(){ quietSince = Date.now(); }
  function reset(){
    stop(); used = new Set(); failed = new Set(); eligibleNow = []; matchId = ''; lastTurn = '';
    quietSince = Date.now(); nextAt = quietSince + 15000;
  }
  function trackVoice(audio){
    activity(); voiceCount++;
    let finished = false;
    const end = function(){
      if(finished) return;
      finished = true; voiceCount = Math.max(0, voiceCount - 1); quietSince = Date.now();
    };
    audio.addEventListener('ended', end, {once:true});
    audio.addEventListener('error', end, {once:true});
    audio.addEventListener('pause', end, {once:true});
    return end;
  }
  function snapshot(){
    const g = window.getFateGameState?.();
    const screen = document.getElementById('s-game');
    const report = window.FatePhase7CurrentMultiplayerUi?.report?.();
    const localScreen = document.body.classList.contains('fate-authority-v3-single-player-active')
      ? window.FateAuthorityV3SinglePlayer?.currentScreen?.() : null;
    const local = localScreen?.view;
    const state = local?.state || g;
    const player = local ? local.playerIndex : (typeof getPerspectivePlayerIndex === 'function' ? getPerspectivePlayerIndex() : 0);
    const cards = state?.board?.flat(3) || [];
    const eligibleCharacters = Object.entries(characters).filter(([, character]) =>
      cards.some(c => c && c.owner === player && !c.faceDown && character.ids.has(String(c.id)))
    ).map(([key]) => key);
    const now = Date.now();
    const locks = ['_actionPresentationLockUntil','_cinematicUiLockUntil','_effectActivationPresentationLockUntil','_postConsolidationFateFeedbackUntil','_coordinatorSignatureUntil'];
    const busy = voiceCount > 0 || locks.some(key => Number(g?.[key]) > now)
      || window.FateActionPresentation?.isActive?.()
      || window.FateActionPresentation?.wasActionRecently?.(250)
      || window.isMoraleCalculationPresentationActive?.()
      || (report?.active && (report.presentationBusy || report.presentationQueued || report.promptKey || report.pickerKey || report.consolidationActive))
      || document.body.classList.contains('cinematic-lock')
      || !!document.querySelector('#modal.on, .cc-overlay-v2, .effect-activation-cinematic, .morale-cycle-resolution-reveal');
    const audio = typeof fateAudioReport === 'function' ? fateAudioReport() : {voiceVolume:1, masterVolume:1};
    return {
      matchId:local?.state.matchId || (report?.active ? report.matchId : ''),
      turn:String(state?.turn) + ':' + (local ? state.activePlayer : g?.currentPlayer),
      // Board activity gates new chatter, but only consolidation interrupts a line.
      interrupt:!!(g?.consolidating || (report?.active && report.consolidationActive)
        || document.querySelector('.cc-overlay-v2:not(.effect-activation-cinematic), .consolidation-cinematic-overlay')),
      inactive:!screen?.classList.contains('active') || document.hidden || !!state?.outcome || !!g?._phase7Outcome,
      ready:!!(screen?.classList.contains('active') && !screen.classList.contains('spectator-mode')
        && !screen.classList.contains('warfront-team-spectator') && g?._onlineRole !== 'spectator'
        && !document.hidden && (local ? state.activePlayer : g?.currentPlayer) === player
        && (state.phase || 'main') === 'main' && !state.outcome && !g?._phase7Outcome
        && !state.pendingPrompt && !state.pendingHandLimit && !g?._phase7PendingHandLimit
        && !g?.pendingEffect && !g?.consolidating && !g?.placing && eligibleCharacters.length > 0 && !busy),
      eligibleCharacters,
      volume:Math.min(0.7, Math.max(0, audio.voiceVolume * audio.masterVolume))
    };
  }
  function ensurePanel(){
    if(panel) return;
    panel = document.createElement('aside');
    panel.id = 'fate-idle-chatter'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Character chatter');
    panel.innerHTML = '<div class="chatter-portrait"><img src="pfp/pfp2.png" alt=""></div><div class="chatter-copy"><div class="chatter-name">Anicka Konvicka</div><p aria-live="polite"></p><div class="chatter-rule" aria-hidden="true"></div></div>';
    document.body.appendChild(panel);
  }
  function start(choice, volume){
    ensurePanel();
    const character = characters[choice.characterKey];
    const audio = new Audio('assets/audio/chatter/' + character.file + (choice.index + 1) + '.mp3');
    const run = {audio, key:choice.key, started:false, requestedAt:Date.now()};
    current = run; audio.volume = volume;
    function fail(error){
      if(current !== run) return;
      // Autoplay denial is retryable after user input; corrupt/missing clips are skipped.
      if(error?.name !== 'NotAllowedError' && !used.has(choice.key)) failed.add(choice.key);
      stop();
    }
    audio.addEventListener('playing', function(){
      if(current !== run) return;
      run.started = true; hideAt = 0;
      panel.style.opacity = '0'; panel.hidden = false;
      panel.querySelector('img').src = character.portrait;
      panel.querySelector('.chatter-name').textContent = character.name;
      panel.querySelector('p').textContent = character.clips[choice.index][0];
      positionPanel();
      void panel.offsetWidth; // Commit the transparent frame before transitioning in.
      panel.style.opacity = '1';
    }, {once:true});
    audio.addEventListener('timeupdate', function(){
      if(current !== run || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const parts = character.clips[choice.index];
      const total = parts.reduce((n, text) => n + text.length, 0);
      const position = audio.currentTime / audio.duration * total;
      let length = 0;
      panel.querySelector('p').textContent = parts.find(text => (length += text.length) > position) || parts[parts.length - 1];
    });
    audio.addEventListener('ended', function(){
      if(current !== run) return;
      used.add(choice.key);
      stop();
    }, {once:true});
    audio.addEventListener('error', fail, {once:true});
    try { audio.play()?.catch(fail); } catch(error) { fail(error); }
  }
  function tick(){
    const s = snapshot(), now = Date.now();
    eligibleNow = s.eligibleCharacters;
    if(hideAt && now >= hideAt){panel.hidden = true; hideAt = 0;}
    positionPanel();
    if(s.matchId && s.matchId !== matchId){reset(); matchId = s.matchId;}
    if(s.turn !== lastTurn){activity(); lastTurn = s.turn;}
    if(!s.ready || s.volume <= 0) activity();
    if(s.interrupt || s.inactive || s.volume <= 0){stop(); return;}
    if(current){
      current.audio.volume = s.volume;
      if(now - current.requestedAt > 120000 || (!current.started && now - current.requestedAt > 10000)) stop();
      return;
    }
    if(!s.ready) return;
    if(now - quietSince < 8000 || now < nextAt) return;
    const remaining = s.eligibleCharacters.flatMap(characterKey =>
      characters[characterKey].clips.map((_, index) => ({characterKey, index, key:characterKey + ':' + index}))
    ).filter(choice => !used.has(choice.key) && !failed.has(choice.key));
    if(remaining.length) start(remaining[Math.floor(Math.random() * remaining.length)], s.volume);
  }
  window.FateIdleChatter = Object.freeze({reset, activity, trackVoice,
    report:() => ({
      used:used.size,
      remaining:eligibleNow.reduce((total, characterKey)=>total + characters[characterKey].clips.filter((_, index)=>
        !used.has(characterKey + ':' + index) && !failed.has(characterKey + ':' + index)
      ).length, 0),
      playing:!!current
    })});
  document.addEventListener('pointerdown', activity, true);
  document.addEventListener('keydown', activity, true);
  document.addEventListener('visibilitychange', activity);
  window.addEventListener('pagehide', stop);
  setInterval(tick, 250);
})();
