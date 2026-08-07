// Campaign mode first-pass shell. Disable by setting window.FATE_CAMPAIGN_ENABLED = false before this file loads.
(function(){
  'use strict';

  if(window.FATE_CAMPAIGN_ENABLED === undefined) window.FATE_CAMPAIGN_ENABLED = true;

  const CAMPAIGN_STARTERS = [
    {
      id: 'maja',
      cardId: '07',
      role: 'Field Commander',
      archetype: 'Zone pressure / burst damage',
      stats: { attack: 9, health: 8, defense: 7, evasion: 6 },
      abilityName: 'Command',
      abilityText: 'On your next turn, double the damage you deal.',
      passiveName: 'Oblique Formation',
      passiveText: 'Winning two or more zones stores 1 Command charge for the next battle.',
      description: 'A direct leader who turns board control into decisive campaign damage.'
    },
    {
      id: 'lina',
      cardId: '08',
      role: 'Reality Breaker',
      archetype: 'Tempo / free setup',
      stats: { attack: 7, health: 7, defense: 6, evasion: 10 },
      abilityName: 'Glitch Step',
      abilityText: 'Once per battle, ignore damage from your weakest losing zone.',
      passiveName: 'Reality Thread',
      passiveText: 'Your first Reality card each battle adds +1 pressure to its zone.',
      description: 'A slippery pick for players who want to turn bad zones into recoverable losses.'
    },
    {
      id: 'johnathan',
      cardId: '13',
      role: 'Charter Heir',
      archetype: 'Scaling / zone reward',
      stats: { attack: 8, health: 9, defense: 8, evasion: 5 },
      abilityName: 'Christmas Day Charter',
      abilityText: 'Claim one tied zone as controlled for end-of-match campaign bonus.',
      passiveName: 'Inherited Mandate',
      passiveText: 'If you control the center zone, gain +2 defense during campaign damage.',
      description: 'A steady campaign lead who converts close boards into real advantage.'
    },
    {
      id: 'dylan',
      cardId: '29',
      role: 'Free World Leader',
      archetype: 'Attack / rally finish',
      stats: { attack: 10, health: 7, defense: 6, evasion: 7 },
      abilityName: 'Rally Broadcast',
      abilityText: 'Your strongest winning zone deals +50% end-bonus damage this match.',
      passiveName: 'Free World Momentum',
      passiveText: 'After winning a match, start the next level with +1 attack until damaged.',
      description: 'A high-pressure opener who rewards clean victories and aggressive zone wins.'
    },
    {
      id: 'cosmic_gf',
      cardId: '48',
      role: 'Cosmic Anchor',
      archetype: 'Control / delayed payoff',
      stats: { attack: 7, health: 10, defense: 8, evasion: 5 },
      abilityName: 'End-Time Kitchen',
      abilityText: 'Freeze campaign damage from one zone until the end bonus resolves.',
      passiveName: 'Impossible Warmth',
      passiveText: 'Recover 3 health after any mission where you controlled more zones.',
      description: 'A durable story-mode pick built for attrition and multi-level survival.'
    },
    {
      id: 'maria',
      cardId: '61',
      role: 'Precision Duelist',
      archetype: 'Critical zone / focused damage',
      stats: { attack: 9, health: 6, defense: 5, evasion: 10 },
      abilityName: 'Precise Shot',
      abilityText: 'Choose one zone; its fate difference counts as +2 for your next damage check.',
      passiveName: 'Clean Angle',
      passiveText: 'If you control exactly one zone, that zone deals +3 campaign damage.',
      description: 'A sharp, evasive lead who can make one winning zone matter more than it should.'
    }
  ];

  let selectedCampaignCharacterId = 'maja';
  let activeMissionPage = 0;

  const SNOW_CARPATHIANS_MISSION = {
    id: 'snow_carpathians_01',
    chapter: 'Snow on the Carpathians',
    scene: 'The Lament of a Thousand Years',
    place: 'Poznan, Poland - September 23, 2042',
    background: 'optimized/backgrounds/ingamebackgrouds_igb15.jpg?v=bg20260801a',
    enemyName: 'Carpathian Specters',
    enemyCardId: '95',
    enemyHealth: 84,
    pages: [
      {
        speaker: 'Chapter',
        text: 'Snow presses against the windows in Poznan, and Felicyta remembers the Carpathians as they were when she was ten: a black forest, a wrong turn, and a night that seemed to swallow the path home.'
      },
      {
        speaker: 'The Forest',
        text: 'The wind carries the voices of dead soldiers through the trees. They do not roar at first. They plead, promising warm hearths, forgotten homes, and an eternal country just beyond the dark.'
      },
      {
        speaker: 'Felicyta',
        text: 'Every branch feels like a hand. Every drift of snow becomes a memory that does not belong to her: crops left unharvested, keepsakes buried in coats, watches stopped in pockets, rivers and doorways and sunlight.'
      },
      {
        speaker: 'Mission',
        text: 'When the grief gathers into shape, the Carpathian Specters take the field. Survive the first battle with your chosen lead. Your campaign health will carry forward in later chapters.'
      }
    ]
  };

  function html(value) {
    if(typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function getCard(cardId) {
    const cards = typeof CARDS !== 'undefined' && Array.isArray(CARDS) ? CARDS : [];
    return cards.find(card => String(card.id) === String(cardId)) || null;
  }

  function getCardArt(card) {
    if(!card?.img) return '';
    if(typeof getRuntimeCardImageSrc === 'function') return getRuntimeCardImageSrc(card.img, 'thumb');
    return `optimized/card-thumbs/${String(card.img).replace(/\.[^.]+$/, '.jpg')}`;
  }

  function getAffIconPath(card) {
    const icons = typeof AFF_ICON_IMG !== 'undefined' ? AFF_ICON_IMG : null;
    return icons?.[card?.aff] || '';
  }

  function getAffLabel(card) {
    const labels = typeof AFF_LABEL !== 'undefined' ? AFF_LABEL : null;
    return labels?.[card?.aff] || String(card?.aff || 'Unbound').replace(/_/g, ' ');
  }

  function statTotal(starter) {
    return Object.values(starter.stats).reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function statRows(starter) {
    const max = 12;
    return Object.entries(starter.stats).map(([key, value]) => {
      const pct = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
      return `
        <div class="campaign-stat-row">
          <span>${html(key)}</span>
          <div class="campaign-stat-track"><i style="width:${pct}%;"></i></div>
          <b>${Number(value || 0)}</b>
        </div>`;
    }).join('');
  }

  function renderStarterCard(starter) {
    const card = getCard(starter.cardId);
    const art = getCardArt(card);
    const affIcon = getAffIconPath(card);
    const selected = starter.id === selectedCampaignCharacterId;
    return `
      <button class="campaign-pick-card${selected ? ' selected' : ''}" type="button" data-campaign-character="${html(starter.id)}">
        <span class="campaign-pick-art">
          ${art ? `<img src="${html(art)}" alt="${html(card?.name || starter.id)}" loading="eager" decoding="async" draggable="false" onerror="this.style.display='none'">` : ''}
          <span class="campaign-art-shade"></span>
          <span class="campaign-status-banner">
            ${affIcon ? `<img src="${html(affIcon)}" alt="">` : '<i></i>'}
            <b>${html(starter.role)}</b>
          </span>
        </span>
        <span class="campaign-pick-copy">
          <span class="campaign-pick-name">${html(card?.name || starter.id)}</span>
          <span class="campaign-pick-meta">${html(starter.archetype)}</span>
          <span class="campaign-mini-stats">
            <i>ATK ${starter.stats.attack}</i>
            <i>HP ${starter.stats.health}</i>
            <i>DEF ${starter.stats.defense}</i>
            <i>EVA ${starter.stats.evasion}</i>
          </span>
        </span>
      </button>`;
  }

  function renderDetail(starter) {
    const card = getCard(starter.cardId);
    const art = getCardArt(card);
    const affIcon = getAffIconPath(card);
    const affLabel = getAffLabel(card);
    const profile = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
    const current = profile?.campaign?.selectedCharacterId === starter.id;
    const xp = profile?.campaign?.characters?.[starter.id]?.xp || 0;
    const xpPct = Math.max(0, Math.min(100, xp));
    return `
      <div class="campaign-detail-hero">
        <div class="campaign-detail-art">
          ${art ? `<img src="${html(art)}" alt="${html(card?.name || starter.id)}" decoding="async" draggable="false" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="campaign-detail-copy">
          <div class="campaign-kicker">${current ? 'Current Lead' : 'Starter Candidate'}</div>
          <h1>${html(card?.name || starter.id)}</h1>
          <div class="campaign-subline">
            <span>${affIcon ? `<img src="${html(affIcon)}" alt="">` : ''}${html(affLabel)}</span>
            <span>${html(card?.type || 'Character')}</span>
          </div>
          <p>${html(starter.description)}</p>
        </div>
      </div>
      <div class="campaign-detail-panels">
        <section class="campaign-detail-panel">
          <div class="campaign-panel-head"><span>Core Stats</span><b>${statTotal(starter)} pts</b></div>
          ${statRows(starter)}
        </section>
        <section class="campaign-detail-panel campaign-ability-panel">
          <div class="campaign-panel-head"><span>Unique Ability</span><b>Level 1</b></div>
          <div class="campaign-ability-name"><i class="campaign-icon-command"></i>${html(starter.abilityName)}</div>
          <p>${html(starter.abilityText)}</p>
          <div class="campaign-passive-name">${html(starter.passiveName)}</div>
          <p>${html(starter.passiveText)}</p>
        </section>
        <section class="campaign-detail-panel campaign-xp-panel">
          <div class="campaign-panel-head"><span>Experience</span><b>${xp} / 100 XP</b></div>
          <div class="campaign-xp-track"><i style="width:${xpPct}%;"></i></div>
          <div class="campaign-xp-notes">
            <span>Level 1</span>
            <span>Campaign health carries forward</span>
          </div>
        </section>
      </div>`;
  }

  function getSelectedStarter() {
    return CAMPAIGN_STARTERS.find(item => item.id === selectedCampaignCharacterId) || CAMPAIGN_STARTERS[0];
  }

  function getSelectedProfileStarter() {
    ensureCampaignProfile();
    const savedId = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE?.campaign?.selectedCharacterId : '';
    if(savedId && CAMPAIGN_STARTERS.some(starter => starter.id === savedId)) selectedCampaignCharacterId = savedId;
    return getSelectedStarter();
  }

  function getCharacterState(starter) {
    ensureCampaignProfile();
    if(typeof USER_PROFILE === 'undefined') {
      return { level: 1, xp: 0, currentHealth: starter.stats.health, maxHealth: starter.stats.health, stats: {...starter.stats} };
    }
    const state = USER_PROFILE.campaign.characters[starter.id];
    if(!state.maxHealth) state.maxHealth = starter.stats.health;
    if(!state.currentHealth) state.currentHealth = state.maxHealth;
    if(!state.stats) state.stats = {...starter.stats};
    return state;
  }

  function findCampaignPlayerDeck() {
    const profile = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
    const presetSource = profile?.challengerPresets;
    const presets = Array.isArray(presetSource) ? presetSource : Object.values(presetSource || {});
    const starterPreset = presets.find(preset => preset && (preset.starter || preset.lockedStarter) && Array.isArray(preset.ids) && preset.ids.length >= 40)
      || presets.find(preset => preset && Array.isArray(preset.ids) && preset.ids.length >= 40);
    if(starterPreset) return { name: starterPreset.name || 'Starter Deck', ids: starterPreset.ids.slice(0, 40) };
    const starterDecks = typeof STARTER_DECKS !== 'undefined' && Array.isArray(STARTER_DECKS) ? STARTER_DECKS : [];
    const fallback = starterDecks.find(deck => deck && Array.isArray(deck.ids) && deck.ids.length >= 40) || starterDecks[0];
    return { name: fallback?.name || 'Starter Deck', ids: (fallback?.ids || []).slice(0, 40) };
  }

  function buildCarpathianSpecterDeck() {
    const ids = [
      '95','95','95','95','95','95','95','95','95','95','95','95',
      '91','91','92','92','93','93','94','94',
      '82','82','83','83','84','84','85','85',
      '86','86','87','87','88','88','89','89',
      '90','90','99','100'
    ];
    return ids.slice(0, 40);
  }

  function renderMissionPanel() {
    const starter = getSelectedProfileStarter();
    const card = getCard(starter.cardId);
    const state = getCharacterState(starter);
    const hpPct = Math.max(0, Math.min(100, (Number(state.currentHealth || 0) / Math.max(1, Number(state.maxHealth || starter.stats.health))) * 100));
    return `
      <section class="campaign-mission-card">
        <div class="campaign-mission-copy">
          <div class="campaign-kicker">Trial Mission</div>
          <h2>${html(SNOW_CARPATHIANS_MISSION.chapter)}</h2>
          <p>${html(SNOW_CARPATHIANS_MISSION.scene)} begins with a memory of the Carpathians, then opens into a Specter-heavy AI battle on the Snow on the Carpathians board.</p>
          <div class="campaign-health-strip">
            <span>${html(card?.name || starter.id)} HP</span>
            <div class="campaign-health-track"><i style="width:${hpPct}%;"></i></div>
            <b>${Number(state.currentHealth || 0)} / ${Number(state.maxHealth || starter.stats.health)}</b>
          </div>
        </div>
        <button class="btn pri" type="button" onclick="openSnowCarpathiansLevel()">Start Chapter</button>
      </section>`;
  }

  function renderCampaignLevelScene() {
    const root = document.getElementById('campaign-level-scene');
    if(!root) return;
    const starter = getSelectedProfileStarter();
    const card = getCard(starter.cardId);
    const art = getCardArt(card);
    const state = getCharacterState(starter);
    const page = SNOW_CARPATHIANS_MISSION.pages[activeMissionPage] || SNOW_CARPATHIANS_MISSION.pages[0];
    root.innerHTML = `
      <aside class="campaign-level-party">
        <div class="campaign-level-portrait">${art ? `<img src="${html(art)}" alt="${html(card?.name || starter.id)}" draggable="false">` : ''}</div>
        <div class="campaign-level-party-copy">
          <span>Lead</span>
          <b>${html(card?.name || starter.id)}</b>
          <p>${html(starter.abilityName)} - ${html(starter.abilityText)}</p>
        </div>
        <div class="campaign-level-statgrid">
          <span>ATK <b>${starter.stats.attack}</b></span>
          <span>HP <b>${Number(state.currentHealth || 0)}/${Number(state.maxHealth || starter.stats.health)}</b></span>
          <span>DEF <b>${starter.stats.defense}</b></span>
          <span>EVA <b>${starter.stats.evasion}</b></span>
        </div>
      </aside>
      <section class="campaign-vn-stage">
        <div class="campaign-vn-location">
          <span>${html(SNOW_CARPATHIANS_MISSION.place)}</span>
          <b>${html(SNOW_CARPATHIANS_MISSION.scene)}</b>
        </div>
        <div class="campaign-vn-dialogue">
          <div class="campaign-vn-speaker">${html(page.speaker)}</div>
          <p>${html(page.text)}</p>
          <div class="campaign-vn-controls">
            <button class="btn sm" type="button" onclick="setSnowCarpathiansPage(${Math.max(0, activeMissionPage - 1)})" ${activeMissionPage <= 0 ? 'disabled' : ''}>Back</button>
            <span>${activeMissionPage + 1} / ${SNOW_CARPATHIANS_MISSION.pages.length}</span>
            ${activeMissionPage >= SNOW_CARPATHIANS_MISSION.pages.length - 1
              ? '<button class="btn sm pri" type="button" onclick="startSnowCarpathiansBattle()">Begin Battle</button>'
              : `<button class="btn sm pri" type="button" onclick="setSnowCarpathiansPage(${activeMissionPage + 1})">Next</button>`}
          </div>
        </div>
      </section>
      <aside class="campaign-level-enemy">
        <div class="campaign-kicker">Enemy Team</div>
        <h3>${html(SNOW_CARPATHIANS_MISSION.enemyName)}</h3>
        <p>AI trial deck tuned around repeated Carpathian Specter pressure.</p>
        <div class="campaign-level-enemy-card">
          <img src="${html(getCardArt(getCard(SNOW_CARPATHIANS_MISSION.enemyCardId)))}" alt="Carpathian Specter" draggable="false" onerror="this.style.display='none'">
          <span>Key Card</span>
          <b>Carpathian Specter</b>
        </div>
      </aside>`;
  }

  function renderCampaignSurface(root) {
    root = root || document;
    const grid = root.querySelector('[data-campaign-character-grid]');
    const detail = root.querySelector('[data-campaign-character-detail]');
    if(!grid || !detail) return;
    const profile = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
    const savedId = profile?.campaign?.selectedCharacterId;
    if(savedId && CAMPAIGN_STARTERS.some(starter => starter.id === savedId)) {
      selectedCampaignCharacterId = savedId;
    }
    const selected = CAMPAIGN_STARTERS.find(starter => starter.id === selectedCampaignCharacterId) || CAMPAIGN_STARTERS[0];
    grid.innerHTML = CAMPAIGN_STARTERS.map(renderStarterCard).join('');
    detail.innerHTML = renderDetail(selected);
    grid.querySelectorAll('[data-campaign-character]').forEach(button => {
      button.addEventListener('click', () => {
        selectedCampaignCharacterId = button.dataset.campaignCharacter;
        if(typeof playMenuSfx === 'function') playMenuSfx();
        renderCampaignSurface(root);
      });
    });
  }

  function renderCampaignIntro() {
    renderCampaignSurface(document.getElementById('s-campaign-intro') || document);
  }

  function renderChCampaignTab(content) {
    if(!content) return;
    if(window.FATE_CAMPAIGN_ENABLED === false) {
      content.innerHTML = `
        <div class="campaign-tab-disabled">
          <h2>Campaign Disabled</h2>
          <p>Campaign mode is hidden for this build.</p>
        </div>`;
      return;
    }
    ensureCampaignProfile();
    content.innerHTML = `
      <div class="campaign-intro-shell campaign-tab-shell">
        <div class="campaign-intro-topbar campaign-tab-heading">
          <div class="campaign-intro-title">
            <span>Campaign</span>
            <b>Choose Your Lead</b>
          </div>
          <button class="btn sm pri" type="button" onclick="confirmCampaignCharacter()">Confirm</button>
        </div>
        <div class="campaign-intro-layout">
          <section class="campaign-character-grid" data-campaign-character-grid aria-label="Campaign starter characters"></section>
          <aside class="campaign-character-detail" data-campaign-character-detail></aside>
        </div>
        <div data-campaign-mission-slot></div>
      </div>`;
    renderCampaignSurface(content);
    const missionSlot = content.querySelector('[data-campaign-mission-slot]');
    if(missionSlot) missionSlot.innerHTML = renderMissionPanel();
  }

  function ensureCampaignProfile() {
    if(typeof USER_PROFILE === 'undefined') return;
    if(!USER_PROFILE.campaign) USER_PROFILE.campaign = {};
    if(!USER_PROFILE.campaign.characters) USER_PROFILE.campaign.characters = {};
    CAMPAIGN_STARTERS.forEach(starter => {
      if(!USER_PROFILE.campaign.characters[starter.id]) {
        USER_PROFILE.campaign.characters[starter.id] = {
          level: 1,
          xp: 0,
          currentHealth: starter.stats.health,
          maxHealth: starter.stats.health,
          stats: {...starter.stats}
        };
      }
    });
  }

  function showCampaignIntro() {
    if(window.FATE_CAMPAIGN_ENABLED === false) {
      if(typeof toast === 'function') toast('Campaign mode is disabled for this build.');
      return;
    }
    if(typeof CURRENT_MODE !== 'undefined') CURRENT_MODE = 'challenger';
    if(typeof closeAllOverlays === 'function') closeAllOverlays();
    ensureCampaignProfile();
    if(typeof showScreen === 'function') showScreen('s-campaign-intro');
    renderCampaignIntro();
  }

  function confirmCampaignCharacter() {
    if(window.FATE_CAMPAIGN_ENABLED === false) return;
    ensureCampaignProfile();
    if(typeof USER_PROFILE === 'undefined') return;
    const starter = CAMPAIGN_STARTERS.find(item => item.id === selectedCampaignCharacterId) || CAMPAIGN_STARTERS[0];
    USER_PROFILE.campaign.selectedCharacterId = starter.id;
    USER_PROFILE.campaign.selectedAt = Date.now();
    if(typeof saveProfile === 'function') saveProfile();
    const card = getCard(starter.cardId);
    if(typeof toast === 'function') toast(`${card?.name || starter.id} selected for Campaign.`);
    renderCampaignIntro();
    const campaignPane = document.querySelector('#ch-content .ch-tab-pane[data-tab="campaign"]');
    if(campaignPane && campaignPane.classList.contains('active')) {
      renderCampaignSurface(campaignPane);
      const missionSlot = campaignPane.querySelector('[data-campaign-mission-slot]');
      if(missionSlot) missionSlot.innerHTML = renderMissionPanel();
    }
  }

  function returnToChallengerFromCampaign() {
    if(typeof showScreen === 'function') showScreen('s-challenger');
    if(typeof switchChTab === 'function') switchChTab('campaign');
  }

  function returnToCampaignHub() {
    if(typeof showScreen === 'function') showScreen('s-challenger');
    if(typeof switchChTab === 'function') switchChTab('campaign');
  }

  function openSnowCarpathiansLevel() {
    if(window.FATE_CAMPAIGN_ENABLED === false) return;
    ensureCampaignProfile();
    const starter = getSelectedProfileStarter();
    if(typeof USER_PROFILE !== 'undefined' && !USER_PROFILE.campaign.selectedCharacterId) {
      USER_PROFILE.campaign.selectedCharacterId = starter.id;
      if(typeof saveProfile === 'function') saveProfile();
    }
    activeMissionPage = 0;
    if(typeof showScreen === 'function') showScreen('s-campaign-level');
    renderCampaignLevelScene();
  }

  function setSnowCarpathiansPage(index) {
    activeMissionPage = Math.max(0, Math.min(SNOW_CARPATHIANS_MISSION.pages.length - 1, Number(index || 0)));
    renderCampaignLevelScene();
  }

  function renderCampaignMatchHud() {
    const battle = window.G?._campaignBattle;
    const game = document.getElementById('s-game');
    if(!battle || !game) {
      document.getElementById('campaign-match-hud')?.remove();
      return;
    }
    let hud = document.getElementById('campaign-match-hud');
    if(!hud) {
      hud = document.createElement('div');
      hud.id = 'campaign-match-hud';
      game.appendChild(hud);
    }
    const pPct = Math.max(0, Math.min(100, (Number(battle.playerHealth || 0) / Math.max(1, Number(battle.playerMaxHealth || 1))) * 100));
    const ePct = Math.max(0, Math.min(100, (Number(battle.enemyHealth || 0) / Math.max(1, Number(battle.enemyMaxHealth || 1))) * 100));
    hud.innerHTML = `
      <div class="campaign-match-kicker">Campaign Trial</div>
      <div class="campaign-match-row">
        <span>${html(battle.playerName || 'Lead')}</span>
        <div class="campaign-health-track"><i style="width:${pPct}%;"></i></div>
        <b>${Number(battle.playerHealth || 0)} / ${Number(battle.playerMaxHealth || 0)}</b>
      </div>
      <div class="campaign-match-row enemy">
        <span>${html(battle.enemyName || 'Enemy')}</span>
        <div class="campaign-health-track"><i style="width:${ePct}%;"></i></div>
        <b>${Number(battle.enemyHealth || 0)} / ${Number(battle.enemyMaxHealth || 0)}</b>
      </div>
      <div class="campaign-match-note">Zone fate differences become campaign damage after the match.</div>`;
  }

  function startSnowCarpathiansBattle() {
    if(window.FATE_CAMPAIGN_ENABLED === false) return;
    ensureCampaignProfile();
    const starter = getSelectedProfileStarter();
    const card = getCard(starter.cardId);
    const state = getCharacterState(starter);
    const playerDeck = findCampaignPlayerDeck();
    if(!playerDeck.ids.length) {
      if(typeof toast === 'function') toast('No starter deck is available yet.');
      return;
    }
    if(typeof G === 'undefined' || typeof startGame !== 'function') {
      if(typeof toast === 'function') toast('Campaign battle could not start.');
      return;
    }
    G.p1Deck = playerDeck.ids.slice(0, 40);
    G.p2Deck = [];
    G._selectedAI = {
      id: 'campaign_carpathian_specters',
      name: SNOW_CARPATHIANS_MISSION.enemyName,
      elo: 650,
      style: 'specter pressure',
      img: '95.jpg',
      deck: buildCarpathianSpecterDeck(),
      _deckStrategy: 'campaign_snow_carpathians'
    };
    G._onlineGameSong = 'board15';
    G._campaignBattle = {
      missionId: SNOW_CARPATHIANS_MISSION.id,
      chapter: SNOW_CARPATHIANS_MISSION.chapter,
      playerCharacterId: starter.id,
      playerName: card?.name || starter.id,
      playerHealth: Number(state.currentHealth || starter.stats.health),
      playerMaxHealth: Number(state.maxHealth || starter.stats.health),
      stats: {...starter.stats},
      abilityName: starter.abilityName,
      abilityText: starter.abilityText,
      enemyName: SNOW_CARPATHIANS_MISSION.enemyName,
      enemyHealth: SNOW_CARPATHIANS_MISSION.enemyHealth,
      enemyMaxHealth: SNOW_CARPATHIANS_MISSION.enemyHealth
    };
    if(typeof CURRENT_MODE !== 'undefined') CURRENT_MODE = 'challenger';
    if(typeof closeAllOverlays === 'function') closeAllOverlays();
    startGame(true);
    setTimeout(renderCampaignMatchHud, 600);
    setTimeout(renderCampaignMatchHud, 1600);
  }

  window.CAMPAIGN_STARTERS = CAMPAIGN_STARTERS;
  window.SNOW_CARPATHIANS_MISSION = SNOW_CARPATHIANS_MISSION;
  window.renderChCampaignTab = renderChCampaignTab;
  window.showCampaignIntro = showCampaignIntro;
  window.openChallengerCampaignIntro = showCampaignIntro;
  window.confirmCampaignCharacter = confirmCampaignCharacter;
  window.returnToChallengerFromCampaign = returnToChallengerFromCampaign;
  window.returnToCampaignHub = returnToCampaignHub;
  window.openSnowCarpathiansLevel = openSnowCarpathiansLevel;
  window.setSnowCarpathiansPage = setSnowCarpathiansPage;
  window.startSnowCarpathiansBattle = startSnowCarpathiansBattle;
  window.renderCampaignMatchHud = renderCampaignMatchHud;
  window.addEventListener('fate-screen-changed', event => {
    if(event?.detail?.to === 's-game') setTimeout(renderCampaignMatchHud, 450);
    if(event?.detail?.from === 's-game' && event?.detail?.to !== 's-game') document.getElementById('campaign-match-hud')?.remove();
  });
})();
