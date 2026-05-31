//  SCREEN MANAGEMENT
// ══════════════════════════════════════════════════════════════
function showScreen(id) {
  const prev = document.querySelector('.screen.active');
  const prevId = prev ? prev.id : null;
  document.querySelectorAll('.screen').forEach(s=>{s.classList.remove('active');s.classList.remove('screen-fade-in');});
  const el = document.getElementById(id);
  el.classList.add('active');
  // Track game state on body for CSS targeting
  if(id==='s-game') document.body.classList.add('in-game');
  else document.body.classList.remove('in-game');
  // Leaving the game screen: clean up tutorial hints, AI dialogue, and other overlays
  if(prevId==='s-game' && id!=='s-game') {
    if(typeof cleanupLeavingGameScreenArtifacts === 'function') cleanupLeavingGameScreenArtifacts();
    else cleanupTutorialAndDialogueArtifacts({dismissTutorial:true});
  }
  window.dispatchEvent(new CustomEvent('fate-screen-changed', { detail:{from:prevId, to:id} }));
  // All screens get a subtle fade-in
  el.classList.add('screen-fade-in');
  setTimeout(()=>el.classList.remove('screen-fade-in'),500);
  if(typeof playSfx==='function') playSfx('screenTransition');
  // Log panel disabled
  const lw=document.getElementById('log-wrap');
  if(lw) lw.style.display = 'none';
  // Refresh title profile display when viewing title
  if(id==='s-title' && typeof renderTitleProfile==='function') renderTitleProfile();
  // Switch music
  if(typeof onScreenChange==='function') onScreenChange(id);
}

// ══════════════════════════════════════════════════════════════
//  DECK BUILDER
// ══════════════════════════════════════════════════════════════
let dbFilter_ = 'all';
let dbSearch_ = '';

function isRetiredCardForBuilder(cardOrId) {
  if(typeof isRetiredChallengerCard === 'function') return isRetiredChallengerCard(cardOrId);
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
  if(typeof TEMP_DISABLED_CARD_IDS !== 'undefined' && TEMP_DISABLED_CARD_IDS.has(String(id))) return true;
  return id === 'bh01' || id === 'bh25' || !!cardOrId?.retired;
}

function getActiveCardIdsForDeck(ids, targetCount = 40) {
  const activeIds = (ids || []).filter(id=>!isRetiredCardForBuilder(id) && CARDS.some(c=>c.id===id));
  if(activeIds.length >= targetCount) return activeIds.slice(0, targetCount);
  const fillPool = sortCardsByArtNumber(CARDS.filter(c=>!isRetiredCardForBuilder(c) && c.rarity!=='star'));
  let i = 0;
  while(activeIds.length < targetCount && fillPool.length){
    activeIds.push(fillPool[i % fillPool.length].id);
    i++;
  }
  return activeIds.slice(0, targetCount);
}

function syncDeckBuilderHeader() {
  const whoBtn = document.getElementById('db-who-btn');
  const deckLabel = document.getElementById('db-deck-label');
  if(whoBtn) whoBtn.textContent = 'Player 1';
  if(deckLabel) deckLabel.textContent = 'Deck List';
}

function showDeckBuilder() {
  G.dbCurrentPlayer = 0;
  dbSearch_ = '';
  showScreen('s-deck');
  syncDeckBuilderHeader();
  // Title deck builder is now P1-only. (Multiplayer deck selection will come later.)
  const whoBtn = document.getElementById('db-who-btn');
  if(whoBtn) whoBtn.style.display = 'none';
  const renderAll = ()=>{
    syncDeckBuilderHeader();
    renderDBCollection();
    renderDBDeck();
    // Sync starter-deck warning banner with current preset state
    const pid = G._loadedPresetId;
    if(pid && typeof PRESET_DECKS!=='undefined' && PRESET_DECKS[pid] && PRESET_DECKS[pid].builtin){
      if(typeof showStarterDeckWarningBanner==='function') showStarterDeckWarningBanner();
    } else {
      if(typeof hideStarterDeckWarningBanner==='function') hideStarterDeckWarningBanner();
    }
  };
  requestAnimationFrame(renderAll);
}

function setDbSearch(value) {
  dbSearch_ = String(value || '').trim().toLowerCase();
  renderDBCollection();
}

// Show preset picker screen (entry to starting a game)
function showPresetPicker(vsAI) {
  showScreen('s-preset');
  document.getElementById('s-preset')?.classList.toggle('no-edge-corners-modal', !!vsAI);
  document.getElementById('preset-mode-label').textContent =
    vsAI ? 'Playing vs AI - pick a preset deck' : 'Both players will use the same preset deck';
  const container = document.getElementById('preset-cards');
  container.innerHTML = '';
  const keys = Object.keys(PRESET_DECKS);
  if(keys.length===0){
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--dim);font-style:italic;">
        No saved presets. Go to the Deck Builder to create one.
      </div>`;
  } else {
    keys.forEach((pid, i)=>{
      const p = PRESET_DECKS[pid];
      const sampleIds = [...new Set((p.ids || []).filter(id=>!isRetiredCardForBuilder(id)))];
      const sampleCards = sampleIds.map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
      // Use saved face card if set
      const hero = p.faceCardId ? CARDS.find(c=>c.id===p.faceCardId) : ([...sampleCards].sort((a,b)=>(b.fate||0)-(a.fate||0))[0] || sampleCards[0]);
      // Use saved display cards if set
      const previews = (p.displayCardIds && p.displayCardIds.length>0)
        ? p.displayCardIds.filter(id=>!isRetiredCardForBuilder(id)).map(id=>CARDS.find(c=>c.id===id)).filter(c=>c&&c.img).slice(0,7)
        : sampleCards.filter(c=>c.img).slice(0,5);
      const el = document.createElement('div');
      el.className = 'preset-card';
      el.style.animationDelay = '0s';
      const useCanvasPreview = false;
      const heroArt = hero?.img ? `<img src="${hero.img}" alt="${hero.name}" loading="lazy" decoding="async" draggable="false" onerror="this.parentElement.style.display='none'">` : '';
      el.innerHTML = `
        <div class="preset-card-art">
          ${useCanvasPreview ? '<canvas class="canvas-deck-preview-hero" aria-hidden="true"></canvas>' : heroArt}
          <div class="preset-card-overlay"></div>
        </div>
        <div class="preset-card-body">
          <div class="preset-name">${escapeHtml(p.name)}</div>
          <div class="preset-desc">${escapeHtml(p.description||'')}</div>
          <div class="preset-minis">
            ${useCanvasPreview ? '<canvas class="canvas-deck-preview-minis" aria-hidden="true"></canvas>' : previews.map(c=>`<div class="preset-mini-art">${c.img?`<img src="${typeof getRuntimeCardImageSrc === 'function' ? getRuntimeCardImageSrc(c.img, 'thumb') : c.img}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async" draggable="false">`:''}</div>`).join('')}
          </div>
          <div class="preset-action-row">
            <button class="btn sm" onclick="event.stopPropagation();viewPresetContents('${pid}')">Preview</button>
            <button class="btn sm pri" onclick="event.stopPropagation();loadPresetAndStart('${pid}',${vsAI})">Play</button>
          </div>
        </div>`;
      if(useCanvasPreview) scheduleCanvasDeckPreviewTile(el, {hero, minis:previews});
      el.onclick = ()=>viewPresetContents(pid);
      container.appendChild(el);
    });
  }
  const customBtn = document.getElementById('preset-custom-btn');
  if(customBtn){
    customBtn.style.display = 'none';
    customBtn.disabled = true;
    customBtn.onclick = null;
    customBtn.title = '';
    customBtn.setAttribute('aria-hidden','true');
  }
}

function toggleDBPlayer() {
  G.dbCurrentPlayer = 0;
  syncDeckBuilderHeader();
  renderDBCollection();
  renderDBDeck();
  toast('Title deck builder is Player 1 only.');
}

function dbFilter(el, f) {
  dbFilter_ = f;
  document.querySelectorAll('.db-filter').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderDBCollection();
}

let _dbCollectionRenderSeq = 0;

function settleTitleDeckBuilderImages(root) {
  const imgs = Array.from(root.querySelectorAll('.db-mc .mc-art img')).slice(0, 36);
  if(!imgs.length) return Promise.resolve();
  imgs.forEach(img=>{
    img.loading = 'eager';
    img.decoding = 'async';
    img.setAttribute('fetchpriority', 'high');
  });
  const waitFor = imgs.map(img=>{
    const src = img.currentSrc || img.getAttribute('src') || img.src;
    if(!src) return Promise.resolve();
    const preloader = new Image();
    preloader.decoding = 'async';
    preloader.loading = 'eager';
    preloader.src = src;
    if(preloader.complete && preloader.naturalWidth > 0) return Promise.resolve();
    if(typeof preloader.decode === 'function') return preloader.decode().catch(()=>{});
    return new Promise(resolve=>{
      const done = ()=>resolve();
      preloader.addEventListener('load', done, {once:true});
      preloader.addEventListener('error', done, {once:true});
    });
  });
  return Promise.race([
    Promise.all(waitFor),
    new Promise(resolve=>setTimeout(resolve, 420))
  ]);
}

function renderDBCollection() {
  const col = document.getElementById('db-collection');
  if(!col) return;
  const searchEl = document.getElementById('db-search');
  if(searchEl && searchEl.value !== dbSearch_) searchEl.value = dbSearch_;
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  const rarities = ['star','square','triangle','circle'];
  const cards = sortCardsByArtNumber(CARDS.filter(c=>!isRetiredCardForBuilder(c)).filter(c=>{
    if(dbFilter_==='all') return true;
    if(['Supporter','Initiator','Coordinator','Dauntless','Improvisor'].includes(dbFilter_)) return c.type===dbFilter_;
    if(rarities.includes(dbFilter_)) return c.rarity===dbFilter_;
    return c.aff===dbFilter_;
  }).filter(c=>!dbSearch_ || c.name.toLowerCase().includes(dbSearch_)));
  if(false && typeof renderCanvasDeckCollection === 'function') {
    const entries = cards.map(c=>{
      const count = deck.filter(id=>id===c.id).length;
      return {
        card:c,
        count,
        title:`Click to view details. Right-click to add.\n${c.ability}`,
        ariaLabel:c.name
      };
    });
    if(renderCanvasDeckCollection(col, entries, {
      onClick:(card)=>openDeckBuilderCardDetail(card),
      onContextMenu:(card)=>addToDeck(card.id)
    })) return;
  }
  const renderSeq = ++_dbCollectionRenderSeq;
  const scrollTop = col.scrollTop;
  const fragment = document.createDocumentFragment();
  cards.forEach(c=>{
    const count = deck.filter(id=>id===c.id).length;
    const el = document.createElement('div');
    el.className='mc db-mc'+(count>0?' in-deck':'')+(c.rarity==='star'?' star-card-db':'')+(c.rarity==='square'?' square-card-db':'');
    el.dataset.cardId = c.id;
    el.innerHTML=renderCardHTML(c, count);
    // Click the card itself to open detail modal
    el.onclick=()=>openDeckBuilderCardDetail(c);
    // Right-click adds to deck (no more "+" UI).
    el.oncontextmenu=(e)=>{e.preventDefault();addToDeck(c.id);};
    el.title=`Click to view details. Right-click to add.\n${c.ability}`;
    fragment.appendChild(el);
  });
  col.setAttribute('aria-busy', 'true');
  settleTitleDeckBuilderImages(fragment).then(()=>{
    if(renderSeq !== _dbCollectionRenderSeq) return;
    col.classList.remove('canvas-card-grid-mode');
    col.replaceChildren(fragment);
    col.scrollTop = scrollTop;
    col.removeAttribute('aria-busy');
    refreshDBCollectionCounts();
  });
}

function refreshDBCollectionCounts() {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  if(typeof refreshCanvasDeckCollectionCounts === 'function' && refreshCanvasDeckCollectionCounts(document.getElementById('db-collection'), function(entry){
    entry.count = deck.filter(x=>x===entry.card.id).length;
  })) return;
  document.querySelectorAll('#db-collection .db-mc[data-card-id]').forEach(el=>{
    const id = el.dataset.cardId;
    const count = deck.filter(x=>x===id).length;
    el.classList.toggle('in-deck', count > 0);
    let limit = el.querySelector('.mc-limit');
    if(count > 0){
      if(!limit){
        limit = document.createElement('div');
        limit.className = 'mc-limit';
        el.appendChild(limit);
      }
      limit.textContent = 'x' + count;
    } else if(limit) {
      limit.remove();
    }
  });
}

// Open the detail modal from the deck builder, with add/remove actions
function openDeckBuilderCardDetail(card) {
  const body = document.getElementById('modal-body');
  const activeDeck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  const inDeckCount = activeDeck.filter(id=>id===card.id).length;
  const cardArt = card.img
    ? `<img src="${card.img}" alt="${escapeHtml(card.name)}">`
    : `<span class="cd-fallback">${getAffIcon(card.aff)}</span>`;
  const voiceButton = card.type !== 'Supporter'
    ? `<button type="button" class="card-voice-btn" title="Play voiceline" onclick="event.stopPropagation(); if(typeof playCardSound==='function') playCardSound('${escapeHtml(card.id)}');">♪</button>`
    : '';
  body.innerHTML = `
    <div class="cd-wrap">
      <div class="cd-img">
        ${cardArt}
      </div>
      <div class="cd-info">
        <div class="cd-name cd-name-with-audio">
          <span>${card.name}</span>
          ${voiceButton}
        </div>
        <div class="cd-ability">${card.ability}</div>
        <div class="cd-pills">
          <span class="pill type">${card.type}${card.cost>0?` (${card.xCost?'X':card.cost})`:''}</span>
          <span class="pill fate">${typeof getPrintedFateLabel === 'function' ? getPrintedFateLabel(card) : (card.xFate ? 'X' : card.fate)} Fate</span>
          <span class="pill">${AFF_LABEL[card.aff]||card.aff}</span>
          <span class="pill" style="border-color:var(--gold);color:var(--gold)">In deck: ${inDeckCount}</span>
        </div>
        <div class="cd-eff">${card.effect}</div>
        ${card.flavor?`<div class="cd-flavor">${card.flavor}</div>`:''}
      </div>
    </div>`;
  document.getElementById('modal-title').textContent = card.name;
  const acts = document.getElementById('modal-acts');
  acts.innerHTML = '';
  const close = document.createElement('button');
  close.className='btn sm';close.textContent='Close';close.onclick=closeModal;
  const remove = document.createElement('button');
  remove.className='btn sm danger';remove.textContent='Remove from Deck';
  remove.onclick=()=>{removeFromDeck(card.id);
    // Re-render modal to reflect new count
    openDeckBuilderCardDetail(card);};
  const add = document.createElement('button');
  add.className='btn sm pri';add.textContent='Add to Deck';
  add.onclick=()=>{addToDeck(card.id);
    openDeckBuilderCardDetail(card);};
  acts.appendChild(close);
  if(inDeckCount > 0) acts.appendChild(remove);
  acts.appendChild(add);
  document.getElementById('modal').classList.add('on');
}

function _buildDeckRowHTML(c, id, n) {
  return `
      <div class="db-deck-thumb-hi" style="width:88px;height:123px;flex-shrink:0;border-radius:5px;overflow:hidden;background:#0a0a0f;border:1px solid var(--border);box-shadow:0 10px 22px rgba(0,0,0,.58);">
        ${c.img?`<img src="${c.img}" decoding="async" loading="eager" style="width:100%;height:100%;object-fit:contain;object-position:center center;image-rendering:auto;">`:''}
      </div>
      <div style="flex:1;min-width:0;overflow:hidden;">
        <div style="font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Cinzel',serif;color:#fff;letter-spacing:.03em;">${c.name}</div>
        <div class="db-deck-type" style="font-size:.78rem;color:var(--dim);margin-top:.18rem;">${c.type}${c.cost>0?' ('+c.cost+')':''}</div>
      </div>
      <span class="db-row-actions">
        <span class="db-row-qty">x${n}</span>
        <span class="rm" onclick="event.stopPropagation();removeFromDeck('${id}')" title="Remove">Remove</span>
      </span>`;
}
function renderDBDeck() {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  const list = document.getElementById('db-deck-list');
  const cnt = document.getElementById('db-count');
  if(!list || !cnt) return;
  for(let i=deck.length-1;i>=0;i--){
    if(isRetiredCardForBuilder(deck[i])) deck.splice(i,1);
  }
  const counts = {};
  deck.forEach(id=>{counts[id]=(counts[id]||0)+1;});
  const entries = Object.entries(counts);
  if(typeof renderCanvasDeckList === 'function' && window.FATE_USE_CANVAS_TITLE_DECK_LIST === true) {
    const canvasEntries = entries.map(([id,n])=>{
      const c = CARDS.find(x=>x.id===id);
      if(!c) return null;
      return {
        id,
        card:c,
        count:n,
        subtitle:`${c.type}${c.cost>0?' ('+(c.xCost?'X':c.cost)+')':''}`,
        title:'Click to view details'
      };
    }).filter(Boolean);
    if(renderCanvasDeckList(list, canvasEntries, {
      onOpen:(card)=>openDeckBuilderCardDetail(card),
      onRemove:(id)=>removeFromDeck(id),
      removeLabel:'Remove'
    })) {
      const ok = deck.length===40;
      if(ok && !cnt._completePlayed){ cnt._completePlayed=true; if(typeof playSfx==='function') playSfx('deckComplete'); }
      if(!ok) cnt._completePlayed=false;
      cnt.textContent = deck.length+' / 40 cards';
      cnt.className='db-count'+(ok?' ok':'');
      return;
    }
  }
  const existingRows = list.children;
  const existingById = new Map();
  for(let i=0;i<existingRows.length;i++){
    const row = existingRows[i];
    if(row._deckCardId) existingById.set(row._deckCardId, row);
  }
  const newIds = new Set(entries.map(e=>e[0]));
  for(const [id, row] of existingById){
    if(!newIds.has(id)) row.remove();
  }
  entries.forEach(([id,n])=>{
    const c = CARDS.find(x=>x.id===id);
    if(!c) return;
    const existing = existingById.get(id);
    if(existing){
      const badge = existing.querySelector('.db-row-qty') || existing.querySelector('.rm')?.previousElementSibling;
      if(badge && badge.textContent !== 'x'+n) badge.textContent = 'x'+n;
      if(!list.contains(existing)) list.appendChild(existing);
      return;
    }
    const row = document.createElement('div');
    row.className='db-deck-row';
    row.style.cssText='cursor:pointer;display:flex;align-items:center;gap:.7rem;padding:.15rem;';
    row._deckCardId = id;
    row.innerHTML = _buildDeckRowHTML(c, id, n);
    row.onclick = ()=>openDeckBuilderCardDetail(c);
    row.title = 'Click to view details';
    list.appendChild(row);
  });
  const ok = deck.length===40;
  if(ok && !cnt._completePlayed){ cnt._completePlayed=true; if(typeof playSfx==='function') playSfx('deckComplete'); }
  if(!ok) cnt._completePlayed=false;
  cnt.textContent = deck.length+' / 40 cards';
  cnt.className='db-count'+(ok?' ok':'');
}

function addToDeck(id) {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  if(deck.length>=40){toast('Deck is full (40 cards)');return;}
  const c = CARDS.find(x=>x.id===id);
  if(!c){return;}
  if(isRetiredCardForBuilder(c)){toast('That card is retired from the current card pool');return;}
  // Limit checks — star=1, square/triangle/circle=3
  const count = deck.filter(x=>x===id).length;
  const lim = c.rarity==='star' ? 1 : 3;
  if(count>=lim){toast(`Max ${lim} copies of this card allowed`);return;}
  // Star rarity: only 1 star card total in the entire deck
  if(c.rarity==='star'){
    const totalStars = deck.filter(did=>{ const cd=CARDS.find(x=>x.id===did); return cd&&cd.rarity==='star'; }).length;
    if(totalStars>=1){toast('Only 1 Star rarity card allowed per deck');return;}
  }
  deck.push(id);
  if(G.dbCurrentPlayer===0) G.p1Deck=deck; else G.p2Deck=deck;
  if(typeof playSfx==='function') playSfx('deckAdd');
  if(typeof hideStarterDeckWarningBanner==='function') hideStarterDeckWarningBanner();
  refreshDBCollectionCounts();
  renderDBDeck();
}

function removeFromDeck(id) {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  const idx = deck.lastIndexOf(id);
  if(idx>-1) deck.splice(idx,1);
  if(G.dbCurrentPlayer===0) G.p1Deck=deck; else G.p2Deck=deck;
  if(typeof playSfx==='function') playSfx('deckRemove');
  if(typeof hideStarterDeckWarningBanner==='function') hideStarterDeckWarningBanner();
  refreshDBCollectionCounts();
  renderDBDeck();
}

function clearDeck() {
  if(G.dbCurrentPlayer===0) G.p1Deck=[]; else G.p2Deck=[];
  G._loadedPresetId = null;
  if(typeof hideStarterDeckWarningBanner==='function') hideStarterDeckWarningBanner();
  renderDBCollection();
  renderDBDeck();
}

function autoFillDeck() {
  const deck = G.dbCurrentPlayer===0 ? G.p1Deck : G.p2Deck;
  deck.length=0;
  G._loadedPresetId = null;
  // Fill with supporters first, then some character cards
  const activeCards = CARDS.filter(c=>!isRetiredCardForBuilder(c));
  const supporters = activeCards.filter(c=>c.type==='Supporter');
  const chars = activeCards.filter(c=>c.type!=='Supporter');
  let starUsed = false;
  // Add supporters up to 3 copies each (star still 1)
  for(const c of supporters){
    const lim = c.rarity==='star' ? 1 : 3;
    if(c.rarity==='star' && starUsed) continue;
    for(let i=0;i<lim && deck.length<28;i++) deck.push(c.id);
    if(c.rarity==='star') starUsed=true;
  }
  // Fill rest with characters
  for(const c of chars){
    const lim = c.rarity==='star' ? 1 : 3;
    if(c.rarity==='star' && starUsed) continue;
    for(let i=0;i<lim && deck.length<40;i++) deck.push(c.id);
    if(c.rarity==='star') starUsed=true;
    if(deck.length>=40) break;
  }
  if(G.dbCurrentPlayer===0) G.p1Deck=deck; else G.p2Deck=deck;
  if(typeof hideStarterDeckWarningBanner==='function') hideStarterDeckWarningBanner();
  renderDBCollection();
  renderDBDeck();
}
