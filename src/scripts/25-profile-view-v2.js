// PROFILE-VIEW-V2: shared modal profile display for local and online players.
(function(){
  'use strict';

  let activeContext = null;
  let activeTab = 'overview';
  let legacyReturnMode = '';
  let eventsInstalled = false;
  const MEDAL_NAMES = ['The First Standard','Crimson Vanguard','Azure Vanguard','Crown of the Victor','Iron Laurel','Star of the Warfront','The Unbroken Line','Spearhead Citation','Gilded Campaigner','Medal of Entwined Fates','Dawnwatch Honor','Twilight Standard','The Fivefold Star','Heartland Cross','North Gate Ribbon','Silver Crossing Star','Sunken Road Crest','Crown Reach Laureate','Order of the Resolute','Order of the Red Comet','Order of the Blue Moon','The Fateforged Medal','Starlight Conqueror','The Golden Front','Ash and Glory Medal','Banner of Tenacity','The Final Advance','Shield of the Last Line','Laurel of Command',"Field Marshal's Star",'The Quiet Strategist','Master of Five Fronts','Stormbreaker Medal','The Long Vigil','Crest of the Warbound','The Concord Star','Twin Banners Medal','The Victorious Accord','Medal of Decisive Force','Lightning Laureate','Master of Position Star','The Gilded Hour','The Ember Crown','The Sapphire Crown','The Eternal Standard','Veteran of the War Table',"The Mapmaker's Honor",'Champion of the Five Zones','The Lasting Peace','Legend of the Warfront'];
  window.FATE_WAR_MEDAL_NAMES = MEDAL_NAMES.slice();
  let medalDraft = [];

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
    // The editable local username is authoritative for the signed-in player's
    // own profile. Legacy chosenUsername/displayName fields can survive old
    // saves and must not mask a newer name entered in the profile editor.
    const profileName = opts.isSelf
      ? (source.username || source.chosenUsername || source.displayName || source.baseCode || 'Player')
      : (source.chosenUsername || source.displayName || source.username || source.baseCode || 'Player');
    const recordSource = opts.serverProfile && typeof opts.serverProfile === 'object' ? opts.serverProfile : source;
    // The reset-version field is a migration marker, not a permanent instruction
    // to hide every result recorded after that migration.
    const challengerWins = number(recordSource.challengerWins, 0);
    const challengerLosses = number(recordSource.challengerLosses, 0);
    const challengerHumanWins = number(recordSource.challengerHumanWins != null ? recordSource.challengerHumanWins : recordSource.humanWins, 0);
    const challengerHumanLosses = number(recordSource.challengerHumanLosses != null ? recordSource.challengerHumanLosses : recordSource.humanLosses, 0);
    const challengerAIWins = number(recordSource.challengerAIWins, Math.max(0, challengerWins - challengerHumanWins));
    const challengerAILosses = number(recordSource.challengerAILosses, Math.max(0, challengerLosses - challengerHumanLosses));
    const freePlayWins = number(source.freePlayWins, 0);
    const freePlayLosses = number(source.freePlayLosses, 0);
    const freePlayHumanWins = number(source.freePlayHumanWins, 0);
    const freePlayHumanLosses = number(source.freePlayHumanLosses, 0);
    const totalWins = freePlayWins + challengerWins;
    const totalLosses = freePlayLosses + challengerLosses;
    const computedMatches = totalWins + totalLosses;
    const matchesPlayed = Math.max(number(recordSource.matchesPlayed, computedMatches), computedMatches);
    const elo = number(recordSource.challengerElo != null ? recordSource.challengerElo : recordSource.elo, number(source.challengerElo != null ? source.challengerElo : source.elo, 600));
    const level = Math.max(1, number(source.level, 1));
    let rankName = source.rank || 'Footman';
    try{ if(typeof window.getRank === 'function') rankName = window.getRank(elo).name || rankName; }catch(e){}
    return {
      uid:String(opts.uid || source.uid || ''),
      name:String(profileName),
      code:String(opts.code || source.baseCode || ''),
      bio:String(source.bio || source.status || ''),
      elo:Math.round(elo),
      level:Math.round(level),
      freePlayHumanWins:Math.round(freePlayHumanWins),
      freePlayHumanLosses:Math.round(freePlayHumanLosses),
      challengerHumanWins:Math.round(challengerHumanWins),
      challengerHumanLosses:Math.round(challengerHumanLosses),
      challengerAIWins:Math.round(challengerAIWins),
      challengerAILosses:Math.round(challengerAILosses),
      challengerWins:Math.round(challengerWins),
      challengerLosses:Math.round(challengerLosses),
      warfrontWins:number(recordSource.warfrontWins,0),
      warfrontLosses:number(recordSource.warfrontLosses,0),
      warfrontMatchWins:number(recordSource.warfrontMatchWins,0),
      warfrontMatchLosses:number(recordSource.warfrontMatchLosses,0),
      warfrontHumanWins:number(recordSource.warfrontHumanWins,0),
      warfrontHumanLosses:number(recordSource.warfrontHumanLosses,0),
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
      ,ownedMedals:[...new Set((Array.isArray(source.ownedMedals) ? source.ownedMedals : []).map(Number).filter(function(id){ return id >= 1 && id <= 50; }))],
      displayedMedals:[...new Set((Array.isArray(source.displayedMedals) ? source.displayedMedals : []).map(Number).filter(function(id){ return id >= 1 && id <= 50; }))].slice(0,3)
    };
  }

  function medalIcon(id, selected){
    const n = clamp(Math.round(number(id, 1)), 1, 50);
    const src = 'assets/medals/cropped/medal-' + String(n).padStart(2, '0') + '.png';
    return '<span class="profile-medal-icon' + (selected ? ' is-selected' : '') + '" aria-hidden="true"><img src="' + src + '" alt="" loading="eager"></span>';
  }

  function medalsMarkup(model){
    const shown = model.displayedMedals.filter(function(id){ return model.ownedMedals.includes(id); });
    return '<section class="profile-view-medals-section"><div class="profile-view-medals-head"><div><div class="profile-view-section-label">Displayed Medals</div><small>' + model.ownedMedals.length + ' earned · up to 3 displayed</small></div>' + (model.isSelf ? '<button type="button" data-profile-command="medals">' + (model.ownedMedals.length ? 'Choose medals' : 'No medals yet') + '</button>' : '') + '</div><div class="profile-view-medal-slots">' +
      Array.from({length:3}, function(_,i){ const id=shown[i]; return id ? '<div class="profile-view-medal-slot" title="' + escapeHtml(MEDAL_NAMES[id-1]) + '">' + medalIcon(id,false) + '<span>' + escapeHtml(MEDAL_NAMES[id-1]) + '</span></div>' : '<div class="profile-view-medal-slot is-empty"><i>+</i><span>Empty display</span></div>'; }).join('') +
      '</div></section>';
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
      '<section class="profile-view-summary-section"><div class="profile-view-section-label">Career Summary</div><dl class="profile-view-summary-list"><div><dt>Challenger Wins</dt><dd>' + model.challengerWins + 'W / ' + model.challengerLosses + 'L</dd></div><div><dt>Warfront Wins</dt><dd>' + model.warfrontWins + 'W / ' + model.warfrontLosses + 'L</dd></div><div><dt>Warfront Matches Win</dt><dd>' + model.warfrontMatchWins + 'W / ' + model.warfrontMatchLosses + 'L</dd></div></dl></section></div></section>';
  }

  function renderMedalPicker(){
    const body=document.getElementById('modal-body');
    if(!body||!activeContext)return;
    const model=activeContext.model;
    medalDraft=model.displayedMedals.filter(function(id){return model.ownedMedals.includes(id);}).slice(0,3);
    body.innerHTML='<div class="profile-medal-picker"><header><div><span>PROFILE DISPLAY</span><h2>Choose displayed medals</h2><p>Select up to three Warfront medals. Your selection appears on your public profile.</p></div><strong id="profile-medal-count">'+medalDraft.length+' / 3</strong></header><div class="profile-medal-picker-grid">'+(model.ownedMedals.length?model.ownedMedals.map(function(id){return '<button type="button" data-medal-id="'+id+'" class="'+(medalDraft.includes(id)?'is-selected':'')+'" title="'+escapeHtml(MEDAL_NAMES[id-1])+'">'+medalIcon(id,medalDraft.includes(id))+'<b>'+escapeHtml(MEDAL_NAMES[id-1])+'</b><small>WAR-'+String(id).padStart(3,'0')+'</small></button>';}).join(''):'<div class="profile-medal-empty"><b>No Warfront medals earned yet</b><span>Win a completed Warfront event to receive one.</span></div>')+'</div><footer><button type="button" data-profile-command="medals-cancel">Cancel</button><button type="button" class="primary" data-profile-command="medals-save" '+(model.ownedMedals.length?'':'disabled')+'>Save display</button></footer></div>';
  }

  function recordMarkup(model){
    const aiTotal = model.warfrontHumanWins + model.warfrontHumanLosses;
    const humanTotal = model.challengerHumanWins + model.challengerHumanLosses;
    const aiRate = aiTotal ? Math.round(model.warfrontHumanWins * 100 / aiTotal) : 0;
    const humanRate = humanTotal ? Math.round(model.challengerHumanWins * 100 / humanTotal) : 0;
    return '<section class="profile-view-record" role="tabpanel" aria-label="Match record"><div class="profile-view-record-head"><div><span>Career Record</span><strong>' + model.totalWins + 'W / ' + model.totalLosses + 'L</strong></div><div><span>Overall Win Rate</span><strong>' + model.winRate + '%</strong></div></div>' +
      '<div class="profile-view-record-table" role="table" aria-label="Challenger record by opponent"><div class="profile-view-record-row profile-view-record-labels" role="row"><span>Opponent</span><span>Wins</span><span>Losses</span><span>Win Rate</span></div><div class="profile-view-record-row" role="row"><strong>Warfront vs Human</strong><span>' + model.warfrontHumanWins + '</span><span>' + model.warfrontHumanLosses + '</span><span>' + aiRate + '%</span></div><div class="profile-view-record-row" role="row"><strong>Challenger vs Human</strong><span>' + model.challengerHumanWins + '</span><span>' + model.challengerHumanLosses + '</span><span>' + humanRate + '%</span></div></div></section>';
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
      medalsMarkup(model) + '<div class="profile-view-actions">' + actionButtons(model) + '</div></section><nav class="profile-view-tabs" role="tablist" aria-label="Profile sections"><button type="button" role="tab" aria-selected="' + (activeTab === 'overview') + '" class="' + (activeTab === 'overview' ? 'is-active' : '') + '" data-profile-tab="overview">Overview</button><button type="button" role="tab" aria-selected="' + (activeTab === 'record') + '" class="' + (activeTab === 'record' ? 'is-active' : '') + '" data-profile-tab="record">Match Record</button></nav><div class="profile-view-content">' + (activeTab === 'record' ? recordMarkup(model) : overviewMarkup(model)) + '</div></div>';
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
    // Keep the legacy aliases synchronized because multiplayer/public-profile
    // code still reads them while older saves are being migrated.
    profile.chosenUsername = name;
    profile.displayName = name;
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
      const medal = event.target.closest('.profile-medal-picker [data-medal-id]');
      if(medal){
        const id=Number(medal.getAttribute('data-medal-id'));
        const index=medalDraft.indexOf(id);
        if(index>=0)medalDraft.splice(index,1);
        else if(medalDraft.length<3)medalDraft.push(id);
        else { if(window.toast)window.toast('You can display up to 3 medals.'); return; }
        medal.classList.toggle('is-selected',medalDraft.includes(id));
        medal.querySelector('.profile-medal-icon')?.classList.toggle('is-selected',medalDraft.includes(id));
        const count=document.getElementById('profile-medal-count');if(count)count.textContent=medalDraft.length+' / 3';
        return;
      }
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
    return open(local, Object.assign({}, options || {}, {
      uid:online.user && online.user.uid || local._fateAccountUid || '',
      code:online.baseCode || online.profile && online.profile.baseCode || '',
      photoSrc:photoSrc,
      photoStyle:photoStyle,
      serverProfile:online.profile || null,
      isSelf:true
    }));
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
    if(command === 'medals'){
      if(!model.isSelf)return;
      renderMedalPicker();
      return;
    }
    if(command === 'medals-cancel'){
      render();
      return;
    }
    if(command === 'medals-save'){
      const profile=typeof window.getFateLocalProfile==='function'?window.getFateLocalProfile():activeContext.profile;
      if(profile){profile.displayedMedals=medalDraft.slice(0,3);try{if(typeof window.saveProfile==='function')window.saveProfile();}catch(e){}}
      refreshSelfContext();render();if(window.toast)window.toast('Displayed medals updated.');
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
