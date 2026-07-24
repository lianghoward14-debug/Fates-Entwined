(function(){
  const data = window.FATES_ARCHIVE_DATA || {cards:[], lore:[]};
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const lore = Array.isArray(data.lore) ? data.lore : [];

  const affMeta = {
    third_great_war:{label:'Third Great War', cls:'aff-red'},
    eventide:{label:'Eventide', cls:'aff-blue'},
    expanded_worlds:{label:'Expanded Worlds', cls:'aff-green'},
    reality:{label:'Reality', cls:'aff-gold'}
  };
  const loreSections = {
    'third-great-war':{label:'Third Great War', cls:'aff-red'},
    eventide:{label:'Eventide', cls:'aff-blue'},
    'expanded-worlds':{label:'Expanded Worlds', cls:'aff-green'},
    reality:{label:'Reality', cls:'aff-gold'}
  };

  const cardGrid = document.getElementById('archive-card-grid');
  const loreGrid = document.getElementById('archive-lore-grid');
  const cardCount = document.getElementById('archive-card-count');
  const loreCount = document.getElementById('archive-lore-count');
  const cardSearch = document.getElementById('archive-card-search');
  const cardAffiliation = document.getElementById('archive-card-affiliation');
  const cardSet = document.getElementById('archive-card-set');
  const cardType = document.getElementById('archive-card-type');
  const loreSearch = document.getElementById('archive-lore-search');
  const loreSection = document.getElementById('archive-lore-section');
  const modal = document.getElementById('archive-modal');

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, c=>({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  function normalize(value){
    return String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function toSearch(value){
    return String(value || '').toLowerCase();
  }

  function affLabel(id){
    return affMeta[id]?.label || String(id || 'Unknown').replace(/_/g, ' ');
  }

  function setLabel(card){
    if(card?.retired) return 'Retired';
    if(card?.token) return 'Token';
    return card?.set === 'brave_horizons' ? 'Brave Horizons' : 'Core Set';
  }

  function loreSectionLabel(id){
    return loreSections[id]?.label || String(id || 'Unknown').replace(/-/g, ' ');
  }

  function compactText(value, max){
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1).trim() + '...' : text;
  }

  function paragraphs(text){
    return String(text || '').split(/\n{2,}/).map(p=>p.trim()).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');
  }

  function imageFallback(event){
    const img = event.target;
    if(!(img instanceof HTMLImageElement)) return;
    const fallback = img.getAttribute('data-fallback');
    if(!fallback) return;
    img.removeAttribute('data-fallback');
    img.src = fallback;
  }
  document.addEventListener('error', imageFallback, true);

  const loreByTitle = new Map();
  lore.forEach(page=>{
    loreByTitle.set(normalize(page.title), page);
  });

  function loreForCard(card){
    return loreByTitle.get(normalize(card.name));
  }

  function populateTypeFilter(){
    if(!cardType) return;
    const types = Array.from(new Set(cards.map(card=>card.type).filter(Boolean))).sort();
    cardType.insertAdjacentHTML('beforeend', types.map(type=>`<option value="${esc(type)}">${esc(type)}</option>`).join(''));
  }

  function renderCards(){
    if(!cardGrid) return;
    const query = toSearch(cardSearch?.value);
    const aff = cardAffiliation?.value || '';
    const set = cardSet?.value || '';
    const type = cardType?.value || '';
    const filtered = cards.filter(card=>{
      if(aff && card.aff !== aff) return false;
      if(set === 'token' && !card.token) return false;
      if(set === 'retired' && !card.retired) return false;
      if(set && set !== 'token' && set !== 'retired' && card.set !== set) return false;
      if(type && card.type !== type) return false;
      if(!query) return true;
      return [card.name, card.ability, card.type, card.aff, card.rarity, card.set, card.effect, card.flavor]
        .some(value=>toSearch(value).includes(query));
    });
    cardCount.textContent = `${filtered.length} of ${cards.length} catalog entries`;
    cardGrid.innerHTML = filtered.map(card=>{
      const aff = affMeta[card.aff] || {};
      return `
        <button class="archive-card-tile ${esc(aff.cls || '')} ${card.retired ? 'is-retired' : ''}" type="button" data-card-id="${esc(card.id)}">
          <span class="archive-card-art"><img src="${esc(card.img)}" alt="${esc(card.name)} card art" data-fallback="assets/portraits/queen.png"></span>
          <span class="archive-card-copy">
            <span class="archive-card-kicker">${esc(setLabel(card))} · ${esc(affLabel(card.aff))} / ${esc(card.type || 'Card')}</span>
            <strong>${esc(card.name)}</strong>
            <span class="archive-card-ability">${esc(compactText(card.ability || card.effect, 96))}</span>
          </span>
          <span class="archive-card-stat">Fate ${esc(card.fate)}</span>
        </button>
      `;
    }).join('') || '<div class="archive-empty">No cards match those filters.</div>';
  }

  function renderLore(){
    if(!loreGrid) return;
    const query = toSearch(loreSearch?.value);
    const section = loreSection?.value || '';
    const filtered = lore.filter(page=>{
      if(section && page.section !== section) return false;
      if(!query) return true;
      return [page.title, page.subtitle, page.summary, page.body, page.section, ...(page.tags || [])]
        .some(value=>toSearch(value).includes(query));
    });
    loreCount.textContent = `${filtered.length} of ${lore.length} lore pages`;
    loreGrid.innerHTML = filtered.map(page=>{
      const meta = loreSections[page.section] || {};
      return `
        <button class="archive-lore-tile ${esc(meta.cls || '')}" type="button" data-lore-id="${esc(page.id)}">
          <span class="archive-lore-portrait"><img src="${esc(page.portrait || 'assets/portraits/reality.png')}" alt="${esc(page.title)} portrait" data-fallback="assets/portraits/reality.png"></span>
          <span class="archive-lore-copy">
            <span>${esc(loreSectionLabel(page.section))}</span>
            <strong>${esc(page.title)}</strong>
            <em>${esc(compactText(page.subtitle || page.summary || 'Character dossier', 118))}</em>
          </span>
        </button>
      `;
    }).join('') || '<div class="archive-empty">No lore pages match those filters.</div>';
  }

  function setTab(tab){
    const next = tab === 'lore' ? 'lore' : 'cards';
    document.querySelectorAll('[data-archive-tab]').forEach(button=>{
      const active = button.dataset.archiveTab === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.archive-panel').forEach(panel=>{
      const active = panel.id === `archive-${next}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if(next === 'lore') renderLore();
    else renderCards();
  }

  function statItem(label, value){
    return `<div><span>${esc(label)}</span><strong>${esc(value == null || value === '' ? '-' : value)}</strong></div>`;
  }

  function openModal(html){
    if(!modal) return;
    modal.innerHTML = `
      <div class="archive-modal-backdrop" data-archive-close></div>
      <section class="archive-modal-window" role="dialog" aria-modal="true">
        <button class="archive-modal-close" type="button" data-archive-close aria-label="Close archive window">X</button>
        ${html}
      </section>
    `;
    modal.hidden = false;
    document.body.classList.add('archive-modal-open');
  }

  function closeModal(){
    if(!modal) return;
    modal.hidden = true;
    modal.innerHTML = '';
    document.body.classList.remove('archive-modal-open');
  }

  function openCard(card){
    const relatedLore = loreForCard(card);
    const aff = affMeta[card.aff] || {};
    openModal(`
      <div class="archive-card-detail ${esc(aff.cls || '')}">
        <aside class="archive-detail-art">
          <img src="${esc(card.img)}" alt="${esc(card.name)} card art" data-fallback="assets/portraits/queen.png">
        </aside>
        <article class="archive-detail-copy">
          <div class="archive-detail-kicker">${esc(setLabel(card))} · ${esc(affLabel(card.aff))} / ${esc(card.rarity || 'Rarity')} rarity</div>
          <h3>${esc(card.name)}</h3>
          <p class="archive-detail-ability">${esc(card.ability || '')}</p>
          <div class="archive-detail-stats">
            ${statItem('Type', card.type)}
            ${statItem('Fate', card.fate)}
            ${statItem('Cost', card.cost)}
          </div>
          <div class="archive-rule-box">
            <span>Current Game Text</span>
            <p>${esc(card.effect || 'No effect text.')}</p>
          </div>
          ${card.flavor ? `<p class="archive-flavor">${esc(card.flavor)}</p>` : ''}
          ${relatedLore ? `<button class="archive-inline-action" type="button" data-open-related-lore="${esc(relatedLore.id)}">Read Lore Page</button>` : ''}
        </article>
      </div>
    `);
  }

  function openLore(page){
    const meta = loreSections[page.section] || {};
    const facts = Object.entries(page.facts || {}).slice(0, 10);
    openModal(`
      <div class="archive-lore-detail ${esc(meta.cls || '')}">
        <aside class="archive-lore-sidebar">
          <div class="archive-lore-large-portrait">
            <img src="${esc(page.portrait || 'assets/portraits/reality.png')}" alt="${esc(page.title)} portrait" data-fallback="assets/portraits/reality.png">
          </div>
          <div class="archive-detail-kicker">${esc(loreSectionLabel(page.section))}</div>
          <h3>${esc(page.title)}</h3>
          ${page.subtitle ? `<p>${esc(page.subtitle)}</p>` : ''}
          ${facts.length ? `<div class="archive-fact-list">${facts.map(([key, value])=>`<div><span>${esc(key)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>` : ''}
        </aside>
        <article class="archive-lore-article">
          ${page.summary ? `<p class="archive-lore-summary">${esc(page.summary)}</p>` : ''}
          ${paragraphs(page.body)}
          ${(page.tags || []).length ? `<div class="archive-tags">${page.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>` : ''}
        </article>
      </div>
    `);
  }

  document.querySelectorAll('[data-archive-tab]').forEach(button=>{
    button.addEventListener('click', ()=>setTab(button.dataset.archiveTab));
  });

  document.querySelectorAll('[data-archive-link]').forEach(link=>{
    link.addEventListener('click', ()=>setTimeout(()=>setTab(link.dataset.archiveLink), 0));
  });

  [cardSearch, cardAffiliation, cardSet, cardType].forEach(control=>{
    control?.addEventListener('input', renderCards);
    control?.addEventListener('change', renderCards);
  });
  [loreSearch, loreSection].forEach(control=>{
    control?.addEventListener('input', renderLore);
    control?.addEventListener('change', renderLore);
  });

  cardGrid?.addEventListener('click', event=>{
    const tile = event.target.closest('[data-card-id]');
    if(!tile) return;
    const card = cards.find(item=>item.id === tile.dataset.cardId);
    if(card) openCard(card);
  });

  loreGrid?.addEventListener('click', event=>{
    const tile = event.target.closest('[data-lore-id]');
    if(!tile) return;
    const page = lore.find(item=>item.id === tile.dataset.loreId);
    if(page) openLore(page);
  });

  modal?.addEventListener('click', event=>{
    const related = event.target.closest('[data-open-related-lore]');
    if(related){
      const page = lore.find(item=>item.id === related.dataset.openRelatedLore);
      if(page) openLore(page);
      return;
    }
    if(event.target.closest('[data-archive-close]')) closeModal();
  });

  document.addEventListener('keydown', event=>{
    if(event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  populateTypeFilter();
  renderCards();
  renderLore();
})();
