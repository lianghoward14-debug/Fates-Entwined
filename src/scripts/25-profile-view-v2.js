// PROFILE-VIEW-V2: shared modal profile display for local and online players.
(function(){
  'use strict';

  let activeContext = null;
  let activeTab = 'overview';
  let legacyReturnMode = '';
  let eventsInstalled = false;

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch];
    });
  }

  function number(value, fallback){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function resolvePhoto(profile, options){
    if(options && options.photoSrc) return String(options.photoSrc);
    const candidates = [profile && profile.photoURL, profile && profile.profileImg, profile && profile.pfp, profile && profile.img];
    for(const candidate of candidates){
      try{
        if(typeof window.resolveProfileImgSrc === 'function'){
          const resolved = window.resolveProfileImgSrc(candidate, 'square');
          if(resolved && resolved !== '[object Object]') return String(resolved);
        }
      }catch(e){}
      if(typeof candidate === 'string' && candidate.trim() && candidate !== '[object Object]') return candidate.trim();
    }
    return 'blank.png';
  }

  function resolvePhotoStyle(profile, options){
    if(options && options.photoStyle) return String(options.photoStyle);
    const crop = profile && profile.profileImg && typeof profile.profileImg === 'object' ? profile.profileImg : {};
    const focusX = clamp(number(profile && profile.profileCropFocusX != null ? profile.profileCropFocusX : crop.cropFocusX, .5), 0, 1);
    const focusY = clamp(number(profile && profile.profileCropFocusY != null ? profile.profileCropFocusY : crop.cropFocusY, .5), 0, 1);
    const zoom = clamp(number(profile && profile.profileCropZoom != null ? profile.profileCropZoom : crop.cropZoom, 1), 1, 4);
    return 'width:100%;height:100%;object-fit:cover;object-position:' + focusX * 100 + '% ' + focusY * 100 + '%;transform:scale(' + zoom + ');transform-origin:' + focusX * 100 + '% ' + focusY * 100 + '%;';
  }

  function normalizeProfile(profile, options){
    const source = profile || {};
    const opts = options || {};
    const recordSource = opts.serverProfile && typeof opts.serverProfile === 'object' ? opts.serverProfile : source;
    const recordsCleared = !!recordSource.profileRecordResetVersion;
    const humanWins = recordsCleared ? 0 : number(recordSource.humanWins != null ? recordSource.humanWins : recordSource.wins, 0);
    const humanLosses = recordsCleared ? 0 : number(recordSource.humanLosses != null ? recordSource.humanLosses : recordSource.losses, 0);
    const challengerWins = recordsCleared ? 0 : number(recordSource.challengerWins, 0);
    const challengerLosses = recordsCleared ? 0 : number(recordSource.challengerLosses, 0);
    const totalWins = humanWins + challengerWins;
    const totalLosses = humanLosses + challengerLosses;
    const computedMatches = totalWins + totalLosses;
    const matchesPlayed = recordsCleared ? 0 : Math.max(number(recordSource.matchesPlayed, computedMatches), computedMatches);
    const elo = number(recordSource.challengerElo != null ? recordSource.challengerElo : recordSource.elo, number(source.challengerElo != null ? source.challengerElo : source.elo, 600));
    const level = Math.max(1, number(source.level, 1));
    let rankName = source.rank || 'Footman';
    try{ if(typeof window.getRank === 'function') rankName = window.getRank(elo).name || rankName; }catch(e){}
    return {
      uid:String(opts.uid || source.uid || ''),
      name:String(source.chosenUsername || source.displayName || source.username || source.baseCode || 'Player'),
      code:String(opts.code || source.baseCode || ''),
      bio:String(source.bio || source.status || ''),
      elo:Math.round(elo),
      level:Math.round(level),
      humanWins:Math.round(humanWins),
      humanLosses:Math.round(humanLosses),
      challengerWins:Math.round(challengerWins),
      challengerLosses:Math.round(challengerLosses),
      totalWins:Math.round(totalWins),
      totalLosses:Math.round(totalLosses),
      matchesPlayed:Math.round(matchesPlayed),
      winRate:computedMatches ? Math.round(totalWins * 100 / computedMatches) : 0,
      rankName:String(rankName),
      photoSrc:resolvePhoto(source, opts),
      photoStyle:resolvePhotoStyle(source, opts),
      isSelf:!!opts.isSelf,
      isFriend:!!opts.isFriend,
      actions:Array.isArray(opts.actions) ? opts.actions : []
    };
  }

  function rankBadge(model){
    try{ if(typeof window.renderRankBadge === 'function') return window.renderRankBadge(model.elo, 'lg'); }catch(e){}
    return '<span class="profile-view-rank-fallback">' + escapeHtml(model.rankName) + '</span>';
  }

  function levelBadge(model){
    try{ if(typeof window.renderLevelBadge === 'function') return window.renderLevelBadge(model.level).replace('level-badge', 'level-badge profile-level-badge'); }catch(e){}
    return '<span class="profile-view-level-fallback">Level ' + model.level + '</span>';
  }

  function rankProgress(model){
    try{
      if(typeof window.getRankProgressInfo === 'function'){
        const info = window.getRankProgressInfo(model.elo) || {};
        return {
          percent:clamp(number(info.progressPct, 0), 0, 100),
          copy:info.nextRank ? number(info.pointsToNext, 0) + ' ELO to ' + String(info.nextRank.name || 'next rank') : 'Highest rank reached'
        };
      }
    }catch(e){}
    return {percent:0, copy:model.elo + ' Challenger ELO'};
  }

  function actionButtons(model){
    const actions = [];
    if(model.isSelf){
      actions.push({id:'edit', label:'Edit Profile', primary:true});
      actions.push({id:'portrait', label:'Change Portrait'});
    }
    model.actions.forEach(function(action, index){
      if(action && action.label) actions.push({id:'external-' + index, label:String(action.label), primary:!!action.primary});
    });
    if(model.code) actions.push({id:'copy-code', label:'Copy Player ID'});
    return actions.map(function(action){
      return '<button type="button" class="btn sm profile-view-action' + (action.primary ? ' pri' : '') + '" data-profile-command="' + escapeHtml(action.id) + '">' + escapeHtml(action.label) + '</button>';
    }).join('');
  }

  function statTile(label, value, tone){
    return '<div class="profile-view-stat profile-view-stat-' + escapeHtml(tone || 'neutral') + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function overviewMarkup(model){
    return '<section class="profile-view-overview" role="tabpanel" aria-label="Overview"><div class="profile-view-stats">' +
      statTile('Challenger ELO', model.elo, 'gold') + statTile('Level', model.level, 'green') + statTile('Win Rate', model.winRate + '%', 'blue') + statTile('Matches', model.matchesPlayed, 'red') +
      '</div><div class="profile-view-lower-grid"><section class="profile-view-bio-section"><div class="profile-view-section-label">About</div><p class="profile-view-bio' + (model.bio ? '' : ' is-empty') + '">' + escapeHtml(model.bio || (model.isSelf ? 'Add a bio to introduce yourself.' : 'No bio set yet.')) + '</p></section>' +
      '<section class="profile-view-summary-section"><div class="profile-view-section-label">Career Summary</div><dl class="profile-view-summary-list"><div><dt>Overall record</dt><dd>' + model.totalWins + 'W / ' + model.totalLosses + 'L</dd></div><div><dt>Human matches</dt><dd>' + model.humanWins + 'W / ' + model.humanLosses + 'L</dd></div><div><dt>Challenger</dt><dd>' + model.challengerWins + 'W / ' + model.challengerLosses + 'L</dd></div></dl></section></div></section>';
  }

  function recordMarkup(model){
    const humanTotal = model.humanWins + model.humanLosses;
    const challengerTotal = model.challengerWins + model.challengerLosses;
    const humanRate = humanTotal ? Math.round(model.humanWins * 100 / humanTotal) : 0;
    const challengerRate = challengerTotal ? Math.round(model.challengerWins * 100 / challengerTotal) : 0;
    return '<section class="profile-view-record" role="tabpanel" aria-label="Match record"><div class="profile-view-record-head"><div><span>Career Record</span><strong>' + model.totalWins + 'W / ' + model.totalLosses + 'L</strong></div><div><span>Overall Win Rate</span><strong>' + model.winRate + '%</strong></div></div>' +
      '<div class="profile-view-record-table" role="table" aria-label="Match record by mode"><div class="profile-view-record-row profile-view-record-labels" role="row"><span>Mode</span><span>Wins</span><span>Losses</span><span>Win Rate</span></div><div class="profile-view-record-row" role="row"><strong>Human</strong><span>' + model.humanWins + '</span><span>' + model.humanLosses + '</span><span>' + humanRate + '%</span></div><div class="profile-view-record-row" role="row"><strong>Challenger</strong><span>' + model.challengerWins + '</span><span>' + model.challengerLosses + '</span><span>' + challengerRate + '%</span></div></div></section>';
  }

  function render(){
    if(!activeContext) return;
    const body = document.getElementById('modal-body');
    if(!body) return;
    const model = activeContext.model;
    const progress = rankProgress(model);
    const status = model.isSelf ? 'Your profile' : (model.isFriend ? 'Friend' : 'Player');
    body.innerHTML = '<div class="profile-view-main"><section class="profile-view-hero"><div class="profile-view-portrait" style="' + escapeHtml(activeContext.rankFrame || '') + '"><img src="' + escapeHtml(model.photoSrc) + '" alt="' + escapeHtml(model.name) + '" style="' + escapeHtml(model.photoStyle) + '" onerror="this.onerror=null;this.src=\'blank.png\'"></div>' +
      '<div class="profile-view-identity"><div class="profile-view-status"><i aria-hidden="true"></i>' + escapeHtml(status) + '</div><h2>' + escapeHtml(model.name) + '</h2>' + (model.code ? '<button type="button" class="profile-view-code" data-profile-command="copy-code" title="Copy player ID">' + escapeHtml(model.code) + '</button>' : '') + '<div class="profile-view-badges">' + rankBadge(model) + levelBadge(model) + '</div><div class="profile-view-rank-progress"><div><span style="width:' + progress.percent + '%"></span></div><small>' + escapeHtml(progress.copy) + '</small></div></div>' +
      '<div class="profile-view-actions">' + actionButtons(model) + '</div></section><nav class="profile-view-tabs" role="tablist" aria-label="Profile sections"><button type="button" role="tab" aria-selected="' + (activeTab === 'overview') + '" class="' + (activeTab === 'overview' ? 'is-active' : '') + '" data-profile-tab="overview">Overview</button><button type="button" role="tab" aria-selected="' + (activeTab === 'record') + '" class="' + (activeTab === 'record' ? 'is-active' : '') + '" data-profile-tab="record">Match Record</button></nav><div class="profile-view-content">' + (activeTab === 'record' ? recordMarkup(model) : overviewMarkup(model)) + '</div></div>';
  }

  function refreshSelfContext(){
    const local = typeof window.getFateLocalProfile === 'function' ? window.getFateLocalProfile() || {} : {};
    const online = window.FATE_ONLINE || {};
    const opts = Object.assign({}, activeContext && activeContext.options || {}, {
      uid:online.user && online.user.uid || local._fateAccountUid || '',
      code:online.baseCode || online.profile && online.profile.baseCode || '',
      serverProfile:online.profile || null,
      isSelf:true
    });
    try{ if(typeof window.getProfileImgSrc === 'function') opts.photoSrc = window.getProfileImgSrc('square'); }catch(e){}
    try{ if(typeof window.getProfileCropStyle === 'function') opts.photoStyle = window.getProfileCropStyle(); }catch(e){}
    const model = normalizeProfile(local, opts);
    let rankFrame = '';
    try{ if(typeof window.getRankFrameStyle === 'function') rankFrame = window.getRankFrameStyle(model.elo, 'icon'); }catch(e){}
    activeContext = {profile:local, options:opts, model:model, rankFrame:rankFrame};
    return activeContext;
  }

  function renderEditor(){
    const body = document.getElementById('modal-body');
    if(!body || !activeContext) return;
    const model = activeContext.model;
    body.innerHTML = '<div class="profile-edit-main"><div class="profile-edit-layout"><section class="profile-edit-portrait-column"><div class="profile-edit-portrait" style="' + escapeHtml(activeContext.rankFrame || '') + '"><img src="' + escapeHtml(model.photoSrc) + '" alt="' + escapeHtml(model.name) + '" style="' + escapeHtml(model.photoStyle) + '" onerror="this.onerror=null;this.src=\'blank.png\'"><button type="button" data-profile-command="edit-portrait">Change Portrait</button></div></section>' +
      '<section class="profile-edit-form"><div class="profile-edit-section-head"><span>Identity</span></div><label class="profile-edit-field" for="profile-edit-name"><span>Display Name</span><input id="profile-edit-name" type="text" maxlength="24" value="' + escapeHtml(model.name) + '" autocomplete="off"></label><label class="profile-edit-field profile-edit-bio-field" for="profile-edit-bio"><span>Bio</span><textarea id="profile-edit-bio" maxlength="240" placeholder="Write a short bio...">' + escapeHtml(model.bio) + '</textarea><small>Up to 240 characters</small></label></section></div></div>';
  }

  function saveEditor(){
    if(!activeContext || !activeContext.model.isSelf) return;
    const nameInput = document.getElementById('profile-edit-name');
    const bioInput = document.getElementById('profile-edit-bio');
    const name = String(nameInput && nameInput.value || '').trim();
    const bio = String(bioInput && bioInput.value || '').trim();
    if(!name){ if(window.toast) window.toast('Username cannot be empty'); return; }
    const profile = typeof window.getFateLocalProfile === 'function' ? window.getFateLocalProfile() : activeContext.profile;
    if(!profile) return;
    try{
      if(name !== profile.username && typeof LEADERBOARD !== 'undefined' && Array.isArray(LEADERBOARD)){
        const oldIndex = LEADERBOARD.findIndex(function(entry){ return entry && entry.username === profile.username; });
        if(oldIndex >= 0) LEADERBOARD.splice(oldIndex, 1);
      }
    }catch(e){}
    profile.username = name;
    profile.bio = bio;
    try{ if(typeof window.saveProfile === 'function') window.saveProfile(); }catch(e){}
    try{ if(typeof window.refreshProfileDisplays === 'function') window.refreshProfileDisplays(); }catch(e){}
    if(window.toast) window.toast('Profile saved');
    openSelf({tab:activeTab});
  }

  function openEditor(){
    refreshSelfContext();
    legacyReturnMode = '';
    if(typeof window.showModal === 'function'){
      window.showModal('Edit Profile', '', [
        {label:'Cancel', action:function(){ openSelf({tab:activeTab}); }},
        {label:'Save Changes', pri:true, action:saveEditor}
      ], {immediate:true});
    }
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('profile-view-modal-v2','profile-edit-modal-v2');
    installEvents();
    renderEditor();
  }

  function installEvents(){
    if(eventsInstalled) return;
    const modal = document.getElementById('modal');
    if(!modal) return;
    eventsInstalled = true;
    modal.addEventListener('click', function(event){
      const tab = event.target.closest('.profile-view-main [data-profile-tab]');
      if(tab){ activeTab = tab.getAttribute('data-profile-tab') === 'record' ? 'record' : 'overview'; render(); return; }
      const command = event.target.closest('.profile-view-modal-v2 [data-profile-command]');
      if(command) runCommand(command.getAttribute('data-profile-command') || '');
    });
  }

  function closeView(){
    activeContext = null;
    legacyReturnMode = '';
    if(typeof window.closeModal === 'function') window.closeModal();
    else document.getElementById('modal')?.classList.remove('on');
  }

  function open(profile, options){
    const opts = options || {};
    const model = normalizeProfile(profile, opts);
    let rankFrame = '';
    try{ if(typeof window.getRankFrameStyle === 'function') rankFrame = window.getRankFrameStyle(model.elo, 'icon'); }catch(e){}
    activeContext = {profile:profile || {}, options:opts, model:model, rankFrame:rankFrame};
    activeTab = opts.tab === 'record' ? 'record' : 'overview';
    legacyReturnMode = '';
    if(typeof window.showModal === 'function'){
      window.showModal('Profile', '', [{label:'Close', action:closeView}], {immediate:true});
    }else{
      document.getElementById('modal')?.classList.add('on');
    }
    const modalBox = document.querySelector('#modal .modal');
    if(modalBox) modalBox.classList.add('profile-view-modal-v2');
    installEvents();
    render();
    return true;
  }

  function openSelf(options){
    const local = typeof window.getFateLocalProfile === 'function' ? window.getFateLocalProfile() || {} : {};
    const online = window.FATE_ONLINE || {};
    let photoSrc = '';
    let photoStyle = '';
    try{ if(typeof window.getProfileImgSrc === 'function') photoSrc = window.getProfileImgSrc('square'); }catch(e){}
    try{ if(typeof window.getProfileCropStyle === 'function') photoStyle = window.getProfileCropStyle(); }catch(e){}
    return open(local, Object.assign({}, options || {}, {uid:online.user && online.user.uid || local._fateAccountUid || '', code:online.baseCode || online.profile && online.profile.baseCode || '', photoSrc:photoSrc, photoStyle:photoStyle, isSelf:true}));
  }

  function refreshSelf(){
    return openSelf({tab:activeTab});
  }

  function runCommand(command){
    if(!activeContext) return;
    const model = activeContext.model;
    if(command === 'copy-code'){
      if(model.code && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(model.code).then(function(){ if(window.toast) window.toast('Player ID copied'); }).catch(function(){});
      return;
    }
    if(command === 'edit'){
      openEditor();
      return;
    }
    if(command === 'portrait'){
      legacyReturnMode = 'view';
      if(typeof window.openProfileImageEditor === 'function') window.openProfileImageEditor();
      return;
    }
    if(command === 'edit-portrait'){
      legacyReturnMode = 'edit';
      if(typeof window.openProfileImageEditor === 'function') window.openProfileImageEditor();
      return;
    }
    if(command.indexOf('external-') === 0){
      const action = model.actions[Number(command.slice(9))];
      if(action && typeof action.action === 'function'){
        if(action.closeOnRun){
          activeContext = null;
          legacyReturnMode = '';
          if(typeof window.closeModal === 'function') window.closeModal({silent:true});
        }
        action.action();
      }
    }
  }

  function isActive(){
    const modal = document.getElementById('modal');
    return !!(activeContext && modal?.classList.contains('on') && document.querySelector('#modal .modal.profile-view-modal-v2'));
  }

  window.FateProfileView = {
    open:open,
    openSelf:openSelf,
    refreshSelf:refreshSelf,
    close:closeView,
    isActive:isActive,
    shouldReturnFromTool:function(){ return !!(legacyReturnMode && activeContext && activeContext.model.isSelf); },
    returnFromTool:function(){
      const mode = legacyReturnMode;
      legacyReturnMode = '';
      if(mode === 'edit') openEditor();
      else refreshSelf();
    },
    normalizeProfile:normalizeProfile
  };
})();
