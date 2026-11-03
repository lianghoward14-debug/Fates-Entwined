/* Local presentation only: never writes to the authoritative game state. */
(function(){
  'use strict';
  const characters = Object.freeze({
    kvetka:{name:"Květka Svoboda",portrait:"pfp/pfp19.png",ids:new Set(["19","87"]),file:"Kvetka",
      clips:[["I may be the queen of Czechoslovakia, but I like to think I'm still a young girl at heart,","Picking snow-tipped flowers in the Carpathian mountains."],["If you were to ask me, whether I like being Queen of Czechoslovakia or being a","College student better, It's a pretty obvious decision.","After all, monarchies don't have midterms!"],["My siblings in Poland and Hungary have their own idea of what's the best for economic","Growth in their nations.","But Czechoslovakia has always been a land of winding rivers and picturesque woods -","I'm not going to spoil Bohemia with factories."],["I used to hate the idea of being a politician.","But I realize now, it's not so bad when the entire nation universally adores you."],["My favorite part of the day is the part where I wake up, walk up to my window,","And get thrown out by Slovakian secessionists."]]
    },
    henry:{name:"Henry Dong",portrait:"pfp/pfp21.png",ids:new Set(["21"]),file:"Henry",
      clips:[["The Comintern of the 20th century collapsed because it was run by incompetent tyrants.","We have learned that lesson.","Power belongs in the hands of the people—and nowhere else."],["We are surrounded on all sides by enemies - the wretched Europeans,","Who seek to destroy our ideals, the Chinese, who are no longer sympathetic to our cause,","And the Americans, who foolishly believe they understand what true freedom is."],["I've tried to negotiate with the leaders of the Free World - but every attempt I made","At diplomacy was met with hostility.","We should have coexisted.","But instead they are afraid of us, and look to squash us at any moment of weakness."],["The oligarchs of this country have poisoned us for far too long.","Let us march upon their strongholds, let us rally our fellow countrymen,","And let us fight a glorious battle, to see to their demise!"],["We are a people borne of hardship.","The vast emptiness of the Siberian Forest - it is representative of our ability to","Persevere no matter how harsh our circumstances.","The people of the wider world fear us - we are the winter, we are the storm,","We are the endless and undying."]]
    },
    kazumi:{name:"Kazumi",portrait:"pfp/pfp27.png",ids:new Set(["27"]),file:"Kazumi",
      clips:[["From what I understand, the humans of the old age used to ride on giant birds,","The size of 100 people, in order to travel vast distances across the land."],["I-I don't remember much of my past.","It's not even that it's blurry - it's just a vast emptiness.","There is nothing there."],["Our entire world is Caribbea and Colombo...","But these books, they speak of so many places, so many different people and cultures.","Just how small is our corner of the world?"],["Anicka!","We have to go north, to Caribbea - I've heard rumors that in a vast city by the sea,","They have hundreds of libraries,","Containing an unfathomable amount of books from the Old Age!","Please, we have to go!"],["No, Anicka, your eyes are like the sea.","But it is not destruction.","It is not calamity.","It is not death.","It is beauty.","It is the beauty of the waves and wind, the blue horizon and the peaceful calm."]]
    },
    alondra:{name:"Alondra Hopkins",portrait:"pfp/pfp14.png",ids:new Set(["14","bh09"]),file:"Alondra",
      clips:[["They're afraid of me. They always are.","Still, they've got nowhere to run."],["Whether they bring five, fifty, or five hundred men,","They have no hope of defeating me!"],["Ironic, isn't it?","It is the point of my spear that brought peace to Pacifica.","I ended the Fifth Warring. I brought low the Three Pirate Lords.","I ended the factional warfare that plagued our seas."],["In my youth, I was a very different person.","I wielded my spear because I saw no other path.","Now, I wield the spear because there is only one path for me:","The path of justice and redemption."],["Don't make me laugh.","Swords are hardly practical weapons.","Why would I use something slower and with less reach?","Perforating your opponent with several quick thrusts","Is the most efficient way of incapacitating someone."]]
    },
    zsofia:{name:"Zsofia Szocs",portrait:"pfp/pfp15.png",ids:new Set(["15"]),file:"Zsofia",
      clips:[["Picnics on the Danube!","It's quite the lovely experience, though better with a date."],["All this talk about who's actually in charge","And who's just the figurehead is sickening.","Rozsi is not above I, and I am not above Rozsi."],["This is a war we must fight.","The Hungarian heartland must be defended against the Comintern,","And I will not sit and idly watch","Our country fall into the hands of a dictatorship!"],["Standing idle while your country is in danger","Is the worst sin you can commit as a world leader.","We have a responsibility to our people, to our nation.","Felicyta, have you gone mad?"],["I enjoy visiting the Parliament building.","I recall my days here as a college student,","Watching videos of Viktor Orbán on my phone","And complaining about him loudly.","I was kicked out a few times."]]
    },
    carolyn:{name:"Carolyn",portrait:"pfp/pfp17.png",ids:new Set(["17"]),file:"Carolyn",
      clips:[["Umm, yeah, I'm flattered you're asking me out,","But I d-don't think it'll, umm, work between us.","B-between you and me, there's a chance that if you touch me,","Every atom in your body, umm, will be converted into antimatter."],["Yeah, ugh, hi. So, before I b-buy this milk tea,","I-is it okay for me to get a replacement","If, umm, it loses all s-semblance of its atomic structure","And b-becomes a completely new item?","T-that has a habit of happening around me."],["Why would I go out and party with random people I've never met before,","When I can sit at home and talk to these VTubers,","Which I've developed a parasocial relationship with,","Over the course of the last several years?"],["W-why give the shy girl the ability","To d-deconstruct all matter of physical e-existence?","I just want to sit at home all day and p-play video games."],["I-I was always pretty good at physics,","But I'm not going to lie, the ability to be able","To perfectly comprehend all of p-physical existence","Down to a s-subatomic level helps."]]
    },
    howard:{name:"Howard", portrait:'pfp/pfp3.png', ids:new Set(['03']), file:'Howard',
      clips:[["Moffitt Library… My only one true love.","She is my life, my soul, my entire existence."],["Just… Don’t waste your money?","Everyone thinks you need to make triple digits","With computer science income just to live in the Bay…","I don’t get what you guys are buying."],["Oh my God, my life is so hard.","I have to go out and play tag with kids during recess.","I have to have three hours of free time during work every day.","I have to go to Tokyo every week and have fun.","Life sucks!"],["Just play my card game! It’s been weeks!","Every time I try to get people online to play,","It feels like it’s pulling teeth."],["Hmm… You know, that tree over there?","It kind of reminds me of that one time in AOT","When there was a tree."]]
    },
    maja:{name:"Maja Kaminska", portrait:'pfp/pfp7.png', ids:new Set(['07']), file:'Maja',
      clips:[["Atop the shoulders of my German grenadiers…","I can observe the entire battlefield!"],["No way! They chose not to surrender to me immediately?","Who does this lowly Russian four-star general think he is?"],["Oh, don’t you worry your pretty little face one bit.","My tanks will see to your swift and monumental defeat."],["Next time you get into contact with the quartermaster…","Make sure my victory party has PURPLE ribbons, not pink ones!"],["Hehehehe… By adopting a defense in depth,","My opponent has already accepted his utter defeat!"]]
    },
    lina:{name:"Lina", portrait:'pfp/pfp8.png', ids:new Set(['08']), file:'Lina',
      clips:[["I used to be such a femcel, bro…","Like, I was homeschooled","And basically had no social interaction with anyone.","So, like, I low-key was autistic."],["No, no, no, no! Please don’t leave me!","You’re too pretty and nonchalant.","My heart skipped a beat when I saw you."],["This is low-key cooked, bro.","Like, I don’t know…","I might be too socially unadjusted for this. Hehehe."],["What makes you think I'm a lame weirdo weeb?","Oh… you saw that picture of me in high school with the katana?","And you found my Reddit account…?","B-but at least I'm half Japanese!","It's not that bad, right?"],["My romantic life is not that embarrassing!","I mean, if you ignore the fact my first girlfriend was chopped,","That I only held hands with my first boyfriend,","And that I was almost too femcel-pilled to even talk to my crush,","Then it's perfectly normal!"]]
    },
    anne:{name:"Anne Stone", portrait:'pfp/pfp11.png', ids:new Set(['11']), file:'Anne',
      clips:[["The power of the Guatameliano elite","Comes from their fishing industry.","There’s no telling what would happen","If we were to build a dam upstream,","Disguised as a development project."],["You call it coercion","Because you’re too unintelligent to recognize nuance.","I call it strategic diplomacy","Because I’m the one controlling the nuance."],["My sincere apologies.","I was not aware that the magistrate’s office in this county","Would be completely devoid of intelligent life."],["If we work together, we can resolve any issue that comes our way.","There is much to be gained from our partnership,","Given, of course, that we retain the ability to chart the course."],["We’re not so different, really, the two of us.","We are both warriors, after all.","You wage a ruthless war on the high seas,","While I conduct delicate battles in the chamber of politics.","In both cases, they are a matter of life and death."]]
    },
    makenna:{name:"Makenna", portrait:'pfp/pfp12.png', ids:new Set(['12']), file:'Makenna',
      clips:[["When I grow up, I want to establish","My own bird sanctuary in Costa Rica.","I will even make Mimi the face of my sanctuary’s logo!"],["Every time I pull up the news,","All I see are horrific news of birds being abused","All around the world.","When I grow up, I will bring them to justice."],["It is a shame about Juan Carlos.","I had half liked him at the time.","But… Any harm dealt upon birds cannot be ignored."],["Mimi soars high above the canopies","Of Costa Rica’s beautiful rainforests, as she should.","But not all birds in the world get such opportunity."],["I cannot go back to the United States anymore.","There are still so many birds to save in Costa Rica,","So much rainforest to preserve."]]
    },
    johnathan:{name:"Johnathan Kirby", portrait:'pfp/pfp13.png', ids:new Set(['13']), file:'Johnathan',
      clips:[["The sons and daughters of the United Kingdom","Shall stand together once more.","We are bound by our shared history,","Our shared struggles, and our shared blood."],["The Free World stands on principles","Of democracy, liberty, and equality.","Our ideals are not backed by guns and weaponry,","But our hearts and shared vision."],["Thousands of Australians have fought, struggled,","And gave their lives for decades in all corners of the world—","Europe, Africa, the Pacific, Asia.","Duty once more calls our nation to fight for a worthy cause…"],["I still remember my childhood in Santa Barbara.","I remember playing on the beach with my sister, Marie.","We used to talk about the future,","What we would do to make sure that we steer our own courses.","Now, we steer the course of entire nations…"],["The world is a dangerous place.","Sometimes, I can’t help but think—","What good will this war do for Australia?","For the world at large?","Is this charter a mistake?"]]
    },
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
  const clipUrl = (character, index) => 'assets/audio/chatter/' + character.file + (index + 1) + '.mp3' + (character.file === 'Lina' && (index === 3 || index === 4) ? '?v=20261103-new-lina' + (index + 1) : '');
  let used = new Set(), failed = new Set(), current = null, panel = null;
  let eligibleNow = [];
  let quietSince = Date.now(), nextAt = quietSince + 15000, matchId = '';
  let voiceCount = 0;
  let hideAt = 0;
  function positionPanel(){
    if(!panel || panel.hidden) return;
    const anchor = document.querySelector('#s-game .codex-v19-command');
    const rect = anchor?.getBoundingClientRect();
    if(rect && rect.width > 0 && rect.height > 0){
      panel.style.right = (Math.max(10, window.innerWidth - rect.right) + 10) + 'px';
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
    stop(); used = new Set(); failed = new Set(); eligibleNow = []; matchId = '';
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
      cards.some(c => c && !c.faceDown && character.ids.has(String(c.id)))
    ).map(([key]) => key);
    const now = Date.now();
    // Only major presentations and voices restart the quiet interval.
    // Card browsing, targeting, placement, and UI sounds do not affect it.
    const locks = ['_cinematicUiLockUntil','_effectActivationPresentationLockUntil','_postConsolidationFateFeedbackUntil','_coordinatorSignatureUntil'];
    const busy = voiceCount > 0 || locks.some(key => Number(g?.[key]) > now)
      || window.isMoraleCalculationPresentationActive?.()
      || g?.consolidating || (report?.active && report.consolidationActive)
      || document.body.classList.contains('cinematic-lock')
      || !!document.querySelector('.cc-overlay-v2, .effect-activation-cinematic, .morale-cycle-resolution-reveal, .consolidation-cinematic-overlay');
    const audio = typeof fateAudioReport === 'function' ? fateAudioReport() : {voiceVolume:1, masterVolume:1};
    return {
      matchId:local?.state.matchId || (report?.active ? report.matchId : ''),
      multiplayer:!!(report?.active && report.matchId && !local),
      majorPresentation:!!busy,
      // Board activity gates new chatter, but only consolidation interrupts a line.
      interrupt:!!(g?.consolidating || (report?.active && report.consolidationActive)
        || document.querySelector('.cc-overlay-v2:not(.effect-activation-cinematic), .consolidation-cinematic-overlay')),
      inactive:!screen?.classList.contains('active') || document.hidden || !!state?.outcome || !!g?._phase7Outcome,
      ready:!!(screen?.classList.contains('active') && !screen.classList.contains('spectator-mode')
        && !screen.classList.contains('warfront-team-spectator') && g?._onlineRole !== 'spectator'
        && !document.hidden && (local ? state.activePlayer : g?.currentPlayer) === player
        && (state.phase || 'main') === 'main' && !state.outcome && !g?._phase7Outcome
        && eligibleCharacters.length > 0 && !busy),
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
    const audio = new Audio(clipUrl(character, choice.index));
    window.applyCardVoiceGain?.(audio, [...character.ids][0]);
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
    if(s.majorPresentation) activity();
    if(s.interrupt || s.inactive || (s.volume <= 0 && !s.multiplayer)){stop(); return;}
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
    if(remaining.length){
      const choice = remaining[Math.floor(Math.random() * remaining.length)];
      if(s.multiplayer){
        // Only the active seat proposes; neither client plays until the server echoes it.
        nextAt = now + 3000;
        window.fateAuthorityV3Beta?.sendChatter?.(choice.characterKey, choice.index);
      } else start(choice, s.volume);
    }
  }
  window.addEventListener('fate-v3-beta-message', event => {
    const message = event.detail;
    if(message?.kind !== 'idle-chatter') return;
    const s = snapshot(), character = characters[message.characterKey];
    if(!s.multiplayer || String(message.matchId) !== String(s.matchId) || !character
      || !Number.isInteger(message.index) || !character.clips[message.index]) return;
    if(s.matchId !== matchId){reset(); matchId = s.matchId;}
    const key = message.characterKey + ':' + message.index;
    if(used.has(key)) return;
    used.add(key);
    nextAt = Date.now() + 60000;
    // Hidden/muted clients consume the shared selection without replaying it later.
    if(s.inactive || s.interrupt || s.volume <= 0) return;
    stop();
    start({characterKey:message.characterKey,index:message.index,key}, s.volume);
  });
  window.FateIdleChatter = Object.freeze({reset, activity, trackVoice,
    clipsForCard:cardId => {
      const character = Object.values(characters).find(entry => entry.ids.has(String(cardId)));
      return character ? character.clips.map((_, index) => clipUrl(character, index)) : [];
    },
    report:() => ({
      used:used.size,
      remaining:eligibleNow.reduce((total, characterKey)=>total + characters[characterKey].clips.filter((_, index)=>
        !used.has(characterKey + ':' + index) && !failed.has(characterKey + ':' + index)
      ).length, 0),
      playing:!!current
    })});
  window.addEventListener('pagehide', stop);
  setInterval(tick, 250);
})();
