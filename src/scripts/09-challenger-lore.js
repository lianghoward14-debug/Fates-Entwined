(function(){
  const AFFILIATIONS = [
    {id:'third-great-war', title:'Third Great War', img:'afficon/third_great_war.png', color:'#ef4b3f'},
    {id:'eventide', title:'Eventide', img:'afficon/eventide.png', color:'#62d7ff'},
    {id:'expanded-worlds', title:'Expanded Worlds', img:'afficon/expanded_worlds.png', color:'#67e08f'},
    {id:'reality', title:'Reality', img:'afficon/reality.png', color:'#f2d34f'}
  ];
  const DEFAULT_FACT_KEYS = ['Affiliation', 'Date of birth', 'Story', 'Titles', 'Relationships'];
  const LS_KEY = 'fateChallengerLorePagesV2';
  const ENTRY_TYPE = 'characters';
  const BASE_CHARACTER_PAGES = [
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'felicyta-janowicz', title:'Felicyta Janowicz', pfpId:'1',
      subtitle:'The Queen who never wanted to be a queen.',
      summary:'Raised in Wodny Potok under the shadow of Sebastyen Janowicz, Felicyta was prepared from childhood to become a political heir and eventually the queen of a reformed Poland-Lithuania.',
      body:'Felicyta grew up in the wistful peaks of the Carpathian Mountains, in a small village called Wodny Potok (2008-2026). Her father, Sebastyen Janowicz, was the most controversial European politician of his time, establishing Visegrad and separating Poland, Czechia, Slovakia, and Hungary from the rest of the European Union.\n\nFrom an early age, Felicyta and her adopted siblings, Kvetka Svoboda, Rozsi Szocs, and Zsofia Szocs, were groomed to become brilliant politicians and leaders for each of their respective countries, each receiving a world class education from tutors all over the world.\n\nFor college, Felicyta attended Jagiellonian University (2026-2029), where she met her lifelong friend Maja Kaminska. In college she began to stray from her charted course, finding joy in a simpler life with friends away from her controlling father. After three years, Sebastyen reeled her back in and spent the next decade preparing her to ascend to the throne.\n\nFelicyta was crowned Queen of Poland under the royal name Jadwiga II in 2038. She ruled Poland into the beginning of the Third Great War in 2052, becoming known for the relocation of Polish industry and the army abroad.',
      facts:{Affiliation:'Poland-Lithuania', Era:'2008-2052+', Origin:'Wodny Potok, Carpathian Mountains', Role:'Queen of Poland, Jadwiga II', Status:'Ruling monarch', 'Notable For':'Relocating Polish industry and army abroad'},
      tags:['Jadwiga II', 'Visegrad', 'Third Great War']
    },
    {
      section:'eventide', type:ENTRY_TYPE, slug:'anicka-konvicka', title:'Anicka Konvicka', pfpId:'2',
      subtitle:'A lonely farmer pulled into the conflicts of Pacifica.',
      summary:'Anicka lives in Colombo five hundred years after the Great Calamity. After Kazumi is taken into the Western Seas, she enters Pacifica and becomes tied to pirates, warlords, warships, and floating cities.',
      body:'Anicka Konvicka lives in the struggling land of Colombo five hundred years after the Great Calamity, in an abandoned stretch of land near the Western Sea. As an orphan who lost her mother to illness at a young age and her father in a sailing accident, she lives an independent and lonely life, tending crops and hunting to make ends meet.\n\nOne day she meets another orphan named Kazumi, and the two become exceptionally close. They dream of journeying to Caribbea, a prosperous land, to start a new life.\n\nOn a fateful evening, Kazumi is captured and taken into the Western Seas by an unknown assailant. Anicka resolves to bring her back. She travels into the Western Seas and discovers Pacifica, a civilization of pirates, warlords, warships, and floating cities.\n\nAlongside her newfound friend Maria Song, Anicka journeys into the Great Sea and finds herself embroiled within the conflicts of Pacifica.',
      facts:{Affiliation:'Eventide', Era:'500 years after the Great Calamity', Origin:'Colombo', Role:'Voyager and farmer', Status:'Searching for Kazumi', 'Notable For':'Entering Pacifica from the Western Seas'},
      tags:['Pacifica', 'Kazumi', 'Maria Song']
    },
    {
      section:'reality', type:ENTRY_TYPE, slug:'howard', title:'Howard', pfpId:'3',
      subtitle:'Temecula-born card game menace.',
      summary:'Howard grew up in Southern California, survived high school, Berkeley, Moffitt whiteboards, and now works in Japan while making kids play his card games.',
      body:'Howard grew up in Temecula, in the superior land of Southern California. He spent much of childhood drawing on desks and doodling on worksheets in class.\n\nHoward attended Great Oak High School, where he continued to harass his teachers and get really sleepy in fifth period. During COVID, Howard made a million dollars working at Ralphs and Breakfast Republic, then transferred to UC Berkeley to get really sleepy during classes again.\n\nAfter a brief affair with the Berkeley Police, Howard resorted to drawing on whiteboards in Moffitt, aura farming in MLK, and eating at Crossroads for the rest of his academic career.\n\nHoward is now working in Japan, forcing kids to play his obnoxious card games instead of following the lesson plan.',
      facts:{Affiliation:'Reality', Era:'Modern', Origin:'Temecula, Southern California', Role:'Creator and teacher', Status:'Working in Japan', 'Notable For':'Moffitt whiteboards and card game evangelism'},
      tags:['UC Berkeley', 'Japan', 'Moffitt']
    },
    {
      section:'reality', type:ENTRY_TYPE, slug:'zoe', title:'Zoe', pfpId:'4',
      subtitle:'Resident Evil loyalist and cinematic humanities scholar.',
      summary:'Zoe Inzer is a UC Berkeley student known for loving Resident Evil, film, and refusing to play Minecraft.',
      body:'Zoe Inzer is a junior year student at UC Berkeley notable for her exceptional adoration for the Resident Evil franchise and for being a cinephile.\n\nHailing from the wretched land of Connecticut, she moved to Southern California at a young age and went to school in Redondo Beach.\n\nAt Berkeley she is currently majoring in the Humanities, believed to be Scandinavian Studies if memory serves. Besides all of the characteristics mentioned above, she is also Wasian and refuses to play Minecraft with Howard.',
      facts:{Affiliation:'Reality', Era:'Modern', Origin:'Connecticut and Redondo Beach', Role:'UC Berkeley student', Status:'Junior year', 'Notable For':'Resident Evil, cinema, and anti-Minecraft principles'},
      tags:['UC Berkeley', 'Resident Evil', 'Cinema']
    },
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'17th-british-regiment-of-africa', title:'17th British Regiment of Africa', pfpId:'5',
      subtitle:'',
      summary:'A British regiment that gained fame through constant combat during the Botswana Campaign.',
      body:'Landing in Angola, the 17th Regiment of Africa was an unassuming unit of soldiers who gained fame for their hard fought victories during the Botswana Campaign from 2052 to 2054.\n\nFar from being known for amazing offensive breakthroughs or stalwart defense, the 17th Regiment was simply known for sheer experience given how frequently they found themselves engaged in combat.\n\nNotably, they participated in the Battle of Maun, the Battle of Bulawayo, and the Battle of Kgalagadi.\n\nAfter 2054, the 17th Regiment became redesignated as the 6th Guard Regiment of The King, redeploying to Europe to participate in the East German Campaign.',
      facts:{Affiliation:'British Army', Story:'Veteran soldiers of the Botswana Campaign.', Titles:'6th Guard Regiment of The King'},
      tags:['Botswana Campaign', 'Angola', 'East German Campaign']
    },
    {
      section:'eventide', type:ENTRY_TYPE, slug:'jorge-alvarez', title:'Jorge Alvarez', pfpId:'6',
      subtitle:'The man behind the Pina and the rise of Caribbea.',
      summary:'Born in West Caribbea in 470 AC, Jorge discovered the Pina, built a trading empire, overthrew the Old Elite, and transformed Caribbea through his Treasure Ports.',
      body:'Born in 470 AC in West Caribbea to a family of simple farmers, much of Jorge Alvarez\'s life was uninteresting until he discovered an all new fruit while foraging for seeds, later calling it the Pina.\n\nSensing the potential of this new crop, he relocated to Havano, the capital of Caribbea, and founded the West Caribbea Fruits Company. The Pina became wildly popular, and Jorge quickly became a wealthy merchant. His enterprise expanded into the West Caribbea Trading Company.\n\nAfter rising through Caribbea society, Jorge became exposed to the injustices of Caribbea and resolved to bring down the Old Elite. When members of the Old Elite discovered the plot, they forced him to flee to West Caribbea, intending permanent banishment.\n\nThere he met lifelong friends Anne Stone and Rivera, who helped him undergo El Viaje De Hombre Pina and gather support from all segments of the populace. Jorge eventually stood at the head of a popular revolution that overthrew the Old Elite.\n\nUnder the West Caribbea Trading Company, Jorge effectively seized control over all of Caribbea, initiating massive development projects over 16 years and creating a prosperous society anchored by his famous Treasure Ports. Because of Jorge, the sun never sets in Caribbea.',
      facts:{Affiliation:'Caribbea', Era:'470 AC onward', Origin:'West Caribbea', Role:'Merchant revolutionary', Status:'Leader of Caribbea', 'Notable For':'The Pina, Treasure Ports, and the West Caribbea Trading Company'},
      tags:['Caribbea', 'Pina', 'Treasure Ports']
    },
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'maja-kaminska', title:'Maja Kaminska', pfpId:'7',
      subtitle:'The undefeated commander of the United Nations 5th Army.',
      summary:'Studied by West Point, Sandhurst, and Saint-Cyr scholars after the Third Great War, Maja Kaminska is remembered as a once-in-history general who never suffered a tactical defeat across 56 battles.',
      body:'In a study conducted by war scholars from West Point, Sandhurst, and Saint-Cyr after the Third Great War in 2065, it was unanimously concluded that Maja Kaminska is the greatest general in human history.\n\nHailing from Poland, Kaminska studied at Jagiellonian University before transferring to West Point. She first served as a Brigadier Commander for the United Nations Army during UN intervention in the Mexican Civil War in 2029, where her unit became known for unconventional tactics and highly creative maneuvers.\n\nHer greatest feat in Mexico came during the Battle of Oaxaca de Juarez, where her separated unit of 500 soldiers inflicted massive casualties on a Falangist force numbering 4000 men.\n\nAfter the Mexican Civil War, Maja was promoted to Third Marshall and redeployed to Qingdao during the Chinese Civil War. She served as an advisor, but drew controversy when it was learned she personally commanded the Nationalist Army during the decisive victory at Hangzhou.\n\nShe was soon relocated to Persia to lead a small UN force in Iran, where she accumulated further success. For the next 12 years, Maja was constantly deployed to conflict zones around the world and eventually granted the rank of High Marshall, the highest rank in the United Nations Army.\n\nAt the outbreak of the Third Great War, Maja was given command of the United Nations 5th Army, a diversified and mobile force suited to her strengths. She led it to countless victories, including the famous Battle of Bremen, and never suffered a tactical defeat over 56 battles.',
      facts:{Affiliation:'United Nations 5th Army', Era:'2029-2065', Origin:'Poland', Role:'High Marshall', Status:'Legendary commander', 'Notable For':'56 battles without a tactical defeat'},
      tags:['United Nations', 'Battle of Bremen', 'High Marshall']
    },
    {
      section:'reality', type:ENTRY_TYPE, slug:'lina', title:'Lina', pfpId:'8',
      subtitle:'Former manga loyalist, current digital media appreciator.',
      summary:'Lina moved past an undersocialized, chronically online era, graduated from UC Berkeley in a biology-adjacent major, and now works a respectable job while dabbling in photography and Soulslike games.',
      body:'While Autistic Femcel Rizz is likely an over exaggeration on all fronts, Lina\'s unconventional past left her, in her words, undersocialized and chronically online.\n\nShe has since risen past that awkward phase of life and graduated from UC Berkeley in some kind of biology-adjacent major. She is now working a respectable job.\n\nOnce an ardent manga fan, she has transitioned into an appreciation of digital media through photography and dabbles in the world of Soulslike games.\n\nIt remains completely unclear why she takes several days to weeks to answer texts, but at least she bought Howard McDonald\'s a few times, so he can somewhat look past it.',
      facts:{Affiliation:'Reality', Era:'Modern', Origin:'UC Berkeley', Role:'Biology-adjacent graduate', Status:'Respectably employed', 'Notable For':'Photography, Soulslikes, and delayed text replies'},
      tags:['UC Berkeley', 'Photography', 'Soulslike']
    },
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'united-nations-5th-army', title:'United Nations 5th Army', pfpId:'9',
      subtitle:'',
      summary:'The most decorated and experienced army in the United Nations Army, led by Maja Kaminska.',
      body:'The United Nations 5th Army is the most decorated and experienced army in the entire United Nations Army, led under the famous general Maja Kaminska.\n\nThe 5th Army is noteworthy for being a highly diversified and experienced force, capable of pivoting to different combat styles. Over half of its units are consolidated from Kaminska\'s many foreign campaigns, such as the 12th and 15th Iranian Engineers, the 3rd, 34th, 87th, 13th and 68th Mexican Light Infantry, the 3rd and 5th Chinese Jian Guard, the 8th, 12th, and 2nd Brazilian Rifles, and the 32nd, 28th, and 4th Indian Motorized Division, amongst many others.\n\nThroughout the Third Great War, the 5th Army fought in over 50 battles across 5 different campaigns, winning brilliant battles like the Battle of Bremen, the Battle of Poznan, and the Battle of Belgorod.',
      facts:{Affiliation:'United Nations Army', Story:'A diversified veteran army commanded by Maja Kaminska.', Titles:'United Nations 5th Army', Relationships:'Maja Kaminska'},
      tags:['United Nations', 'Maja Kaminska', 'Battle of Bremen']
    }
  ];
  let lorePages = [];
  let currentPageId = '';
  let loadStarted = false;
  let loadPending = false;

  function esc(s){
    const FO = window.FateOnline || {};
    return FO.escapeHtml ? FO.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c] || c));
  }
  function slugify(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }
  function affById(id){ return AFFILIATIONS.find(a=>a.id === id) || AFFILIATIONS[AFFILIATIONS.length - 1]; }
  function user(){ return window.FateOnline?.auth?.currentUser || window.FATE_ONLINE?.user || null; }
  function profile(){ return window.FATE_ONLINE?.profile || (typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : {}) || {}; }
  function profileName(){
    const p = profile();
    return p.chosenUsername || p.displayName || p.username || p.baseCode || 'Player';
  }
  function localStorageFlag(name){ try{ return localStorage.getItem(name) === '1'; }catch(e){ return false; } }
  function canUseFly(){
    const FO = window.FateOnline || {};
    const hasBase = typeof FO.authorityHttpBaseUrl !== 'function' || !!FO.authorityHttpBaseUrl();
    return hasBase && typeof FO.flyApiRequest === 'function' && (
      localStorageFlag('fateFlyRoomsEnabled') ||
      localStorageFlag('fateRtdbDisabled') ||
      window.FATE_FLY_ROOMS_ENABLED === true ||
      window.FATE_RTDB_DISABLED === true
    );
  }
  function canUseRtdb(){
    const FO = window.FateOnline || {};
    if(typeof FO.rtdbAvailable === 'function' && !FO.rtdbAvailable()) return false;
    return !!(FO.rtdb && FO.ref && FO.get && FO.set);
  }
  function pfpIdFromName(name){
    const key = String(name || '').trim().toLowerCase();
    if(!key) return '';
    const card = (Array.isArray(window.CARDS) ? window.CARDS : (typeof CARDS !== 'undefined' ? CARDS : [])).find(c=>String(c?.name || '').trim().toLowerCase() === key);
    const id = Number(card?.id);
    return Number.isFinite(id) && id > 0 && id <= 999 ? String(id) : '';
  }
  function normalizePage(raw){
    raw = raw && typeof raw === 'object' ? raw : {};
    const section = affById(slugify(raw.section || raw.affiliation)).id;
    const type = ENTRY_TYPE;
    const slug = slugify(raw.slug || raw.title || raw.id);
    if(!section || !slug) return null;
    const id = `${section}:${type}:${slug}`;
    const facts = raw.facts && typeof raw.facts === 'object' ? raw.facts : {};
    const pfpId = String(raw.pfpId || facts.PFP || facts.Pfp || pfpIdFromName(raw.title)).replace(/[^\d]/g, '').slice(0, 3);
    return {
      id,
      section,
      type,
      slug,
      title:String(raw.title || slug.replace(/-/g, ' ') || 'Character').slice(0, 90),
      subtitle:String(raw.subtitle || '').slice(0, 140),
      pfpId,
      heroImage:String(raw.heroImage || raw.image || '').slice(0, 260000),
      gallery:(Array.isArray(raw.gallery) ? raw.gallery : []).map(String).filter(Boolean).slice(0, 6),
      summary:String(raw.summary || '').slice(0, 900),
      body:String(raw.body || '').slice(0, 9000),
      facts:Object.fromEntries(Object.entries(facts).slice(0, 18).map(([k,v])=>[String(k).slice(0,32), String(v || '').slice(0,180)]).filter(([k])=>k.trim())),
      tags:(Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',')).map(t=>String(t || '').trim()).filter(Boolean).slice(0, 10),
      createdBy:String(raw.createdBy || 'seed').slice(0,128),
      createdByName:String(raw.createdByName || raw.username || 'Codex').slice(0,32),
      updatedBy:String(raw.updatedBy || raw.createdBy || 'seed').slice(0,128),
      updatedByName:String(raw.updatedByName || raw.createdByName || raw.username || 'Codex').slice(0,32),
      createdAt:Number(raw.createdAt || 0) || Date.now(),
      updatedAt:Number(raw.updatedAt || raw.createdAt || 0) || Date.now()
    };
  }
  function basePages(){ return BASE_CHARACTER_PAGES.map(normalizePage).filter(Boolean); }
  function mergeWithBase(pages){
    const map = new Map(basePages().map(page=>[page.id, page]));
    (Array.isArray(pages) ? pages : []).map(normalizePage).filter(Boolean).forEach(page=>map.set(page.id, page));
    return [...map.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  }
  function setPages(pages){
    lorePages = mergeWithBase(pages);
    window.FATE_LORE_REVISION = (Number(window.FATE_LORE_REVISION || 0) || 0) + 1;
    try{
      const sharedOnly = lorePages.filter(p=>p.createdBy !== 'seed' || p.updatedBy !== 'seed');
      localStorage.setItem(LS_KEY, JSON.stringify(sharedOnly));
    }catch(e){}
  }
  function loadLocal(){
    try{
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      setPages(Array.isArray(saved) ? saved : []);
    }catch(e){ setPages([]); }
  }
  async function loadSharedLore(force){
    if(loadPending || (loadStarted && !force)) return;
    loadStarted = true;
    loadPending = true;
    try{
      if(canUseFly()){
        const data = await window.FateOnline.flyApiRequest('/api/lore');
        setPages(data?.pages || []);
      }else if(canUseRtdb()){
        const FO = window.FateOnline;
        const snap = await FO.get(FO.ref(FO.rtdb, 'lorePages'));
        setPages(Object.values(snap.val() || {}));
      }else{
        loadLocal();
      }
    }catch(e){
      console.warn('Lore load failed', e);
      loadLocal();
    }finally{
      loadPending = false;
      rerenderLore();
    }
  }
  async function saveSharedLore(page){
    const u = user();
    if(!u){ if(window.toast) toast('Sign in to publish lore for everyone'); throw new Error('not signed in'); }
    const normalized = normalizePage(Object.assign({}, page, {
      updatedBy:u.uid,
      updatedByName:profileName(),
      createdBy:page.createdBy && page.createdBy !== 'seed' ? page.createdBy : u.uid,
      createdByName:page.createdByName && page.createdByName !== 'Codex' ? page.createdByName : profileName()
    }));
    if(!normalized) throw new Error('invalid lore page');
    const nextLocal = [normalized, ...lorePages.filter(p=>p.id !== normalized.id && p.createdBy !== 'seed')];
    setPages(nextLocal);
    if(canUseFly()){
      const data = await window.FateOnline.flyApiRequest('/api/lore', {
        method:'POST',
        body:{uid:u.uid, profile:profile(), page:normalized}
      });
      setPages(data?.pages || nextLocal);
    }else if(canUseRtdb()){
      const FO = window.FateOnline;
      await FO.set(FO.ref(FO.rtdb, `lorePages/${normalized.id.replace(/[.#$/[\]]/g, '_')}`), normalized);
    }else{
      throw new Error('online lore storage is not ready');
    }
    if(window.toast) toast('Character entry published');
    return normalized;
  }
  async function deleteSharedLore(id){
    const u = user();
    if(!u){ if(window.toast) toast('Sign in to delete lore pages'); return; }
    const page = lorePages.find(p=>p.id === id);
    const remaining = lorePages.filter(p=>p.id !== id && p.createdBy !== 'seed');
    setPages(remaining);
    if(canUseFly()){
      const data = await window.FateOnline.flyApiRequest(`/api/lore/${encodeURIComponent(id)}/delete`, {method:'POST', body:{uid:u.uid}});
      setPages(data?.pages || remaining);
    }else if(canUseRtdb()){
      const FO = window.FateOnline;
      await FO.remove(FO.ref(FO.rtdb, `lorePages/${id.replace(/[.#$/[\]]/g, '_')}`));
    }
    if(page && window.toast) toast('Shared edit removed; built-in entry may remain');
    rerenderLore();
  }
  function loreStatusText(){ return 'Lore Wiki Page'; }
  function loreRoot(){
    const parent = document.getElementById('ch-content');
    return parent ? parent.querySelector(':scope > .ch-tab-pane[data-tab="lore"]') || parent : null;
  }
  function cardOrder(page){
    const pfp = Number(page.pfpId || pfpIdFromName(page.title));
    return Number.isFinite(pfp) && pfp > 0 ? pfp : 9999;
  }
  function characterPages(){
    return lorePages.filter(p=>p.type === ENTRY_TYPE)
      .sort((a,b)=>cardOrder(a) - cardOrder(b) || String(a.title).localeCompare(String(b.title)));
  }
  function portraitFor(page){
    const pfpId = page.pfpId || pfpIdFromName(page.title);
    if(pfpId) return `pfp/pfp${pfpId}.png`;
    return page.heroImage || affById(page.section).img;
  }
  function paragraphHtml(text){
    return String(text || '').split(/\n{2,}/).map(part=>part.trim()).filter(Boolean).map(part=>`<p>${esc(part)}</p>`).join('');
  }
  function firstFact(facts, keys){
    for(const key of keys){
      const value = facts?.[key];
      if(String(value || '').trim()) return String(value).trim();
    }
    return '';
  }
  function characterInfo(page){
    const facts = page.facts || {};
    const aff = affById(page.section);
    return {
      Affiliation:firstFact(facts, ['Affiliation']) || aff.title,
      'Date of birth':firstFact(facts, ['Date of birth', 'Date of Birth', 'Born']) || (page.slug === 'jorge-alvarez' ? '470 AC' : ''),
      Story:firstFact(facts, ['Story']) || page.subtitle || '',
      Titles:firstFact(facts, ['Titles', 'Title']) || (page.slug === 'felicyta-janowicz' ? 'Jadwiga II' : (page.slug === 'maja-kaminska' ? 'High Marshall' : '')),
      Relationships:firstFact(facts, ['Relationships', 'Related To', 'Related'])
    };
  }
  function factRows(page){
    const facts = characterInfo(page);
    return DEFAULT_FACT_KEYS.map(key=>`<dt>${esc(key)}</dt><dd>${facts[key] ? esc(facts[key]) : ''}</dd>`).join('');
  }
  function renderCharacterCard(page){
    const aff = affById(page.section);
    const summary = page.summary || page.body || '';
    return `
      <button class="ch-lore-character-card" type="button" onclick="openLorePage('${esc(page.id)}')" style="--lore-accent:${esc(aff.color)};">
        <span class="ch-lore-card-portrait"><img src="${esc(portraitFor(page))}" alt="" onerror="this.src='${esc(aff.img)}'"></span>
        <span class="ch-lore-card-copy">
          <span class="ch-lore-card-aff"><img src="${esc(aff.img)}" alt="">${esc(aff.title)}</span>
          <b>${esc(page.title)}</b>
          <small>${esc(summary).slice(0, 160)}</small>
        </span>
      </button>`;
  }
  function renderArchive(content){
    currentPageId = '';
    const pages = characterPages();
    content.innerHTML = `
      <div class="ch-lore-shell">
        <div class="ch-lore-command">
          <div>
            <div class="ch-lore-kicker">${esc(loreStatusText())}</div>
            <h2>Character Lore</h2>
            <p>Fandom-style dossiers for the people and legends of Fates Entwined.</p>
          </div>
          <div class="ch-lore-command-actions">
            <button class="btn sm" onclick="fateRefreshLore()">Refresh</button>
          </div>
        </div>
        ${pages.length ? `<div class="ch-lore-character-grid">${pages.map(renderCharacterCard).join('')}</div>` : `
          <div class="ch-lore-empty"><b>No lore entries yet</b><span>Published dossiers will appear here.</span></div>`}
      </div>`;
  }
  function renderPage(content){
    const page = lorePages.find(p=>p.id === currentPageId);
    if(!page){ renderArchive(content); return; }
    const aff = affById(page.section);
    content.innerHTML = `
      <div class="ch-lore-shell">
        <div class="ch-lore-page-top" style="--lore-accent:${esc(aff.color)};">
          <button class="btn sm" onclick="backToLoreArchive()">Back</button>
          <div><div class="ch-lore-kicker">${esc(aff.title)}</div><h2>${esc(page.title)}</h2></div>
          <div class="ch-lore-page-actions">
            <button class="btn sm" onclick="openLoreEditor('${esc(page.id)}')">Edit</button>
            <button class="btn sm danger" onclick="deleteLorePage('${esc(page.id)}')">Delete</button>
          </div>
        </div>
        <div class="ch-lore-dossier" style="--lore-accent:${esc(aff.color)};">
          <aside class="ch-lore-infobox">
            <div class="ch-lore-info-img"><img src="${esc(portraitFor(page))}" alt="" onerror="this.src='${esc(aff.img)}'"></div>
            <div class="ch-lore-info-title">
              <img src="${esc(aff.img)}" alt="">
              <div><h3>${esc(page.title)}</h3><p>${esc(page.subtitle || aff.title)}</p></div>
            </div>
            <dl>${factRows(page)}</dl>
          </aside>
          <article class="ch-lore-article">
            ${page.summary ? `<p class="ch-lore-summary">${esc(page.summary)}</p>` : ''}
            ${paragraphHtml(page.body || 'No article text yet.')}
            ${page.tags.length ? `<div class="ch-lore-tags">${page.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>` : ''}
            <p class="ch-lore-updated">Last edited by ${esc(page.updatedByName || page.createdByName || 'Player')}.</p>
          </article>
        </div>
      </div>`;
  }
  function rerenderLore(){
    const root = loreRoot();
    if(root) window.renderChLoreTab(root, {pageId:currentPageId});
  }
  function editorField(id, label, value, tag){
    const Tag = tag || 'input';
    if(Tag === 'textarea') return `<label>${esc(label)}<textarea id="${esc(id)}">${esc(value || '')}</textarea></label>`;
    return `<label>${esc(label)}<input id="${esc(id)}" type="text" value="${esc(value || '')}"></label>`;
  }
  function openEditor(pageId){
    const page = lorePages.find(p=>p.id === pageId) || normalizePage({section:'reality', type:ENTRY_TYPE, title:'', facts:{}});
    const facts = characterInfo(page);
    const factInputs = DEFAULT_FACT_KEYS.map(key=>`
      <input class="lore-fact-key" value="${esc(key)}" readonly>
      <input class="lore-fact-val" value="${esc(facts[key] || '')}" placeholder="Value">`).join('');
    const body = `
      <div class="ch-lore-editor">
        ${editorField('lore-title', 'Character Name', page.createdBy === 'seed' ? page.title : page.title)}
        <label>Affiliation
          <select id="lore-section">${AFFILIATIONS.map(aff=>`<option value="${esc(aff.id)}" ${aff.id === page.section ? 'selected' : ''}>${esc(aff.title)}</option>`).join('')}</select>
        </label>
        ${editorField('lore-pfp', 'PFP Icon Number', page.pfpId || pfpIdFromName(page.title))}
        ${editorField('lore-subtitle', 'Subtitle', page.subtitle)}
        ${editorField('lore-summary', 'Summary', page.summary, 'textarea')}
        ${editorField('lore-body', 'Article Text', page.body, 'textarea')}
        ${editorField('lore-tags', 'Tags', page.tags.join(', '))}
        <label>Upload Portrait Override<input id="lore-image" type="file" accept="image/*"></label>
        <div class="ch-lore-fact-grid">${factInputs}</div>
      </div>`;
    if(typeof showModal !== 'function') return;
    showModal(pageId ? 'Edit Character Entry' : 'New Character Entry', body, [
      {label:'Publish', primary:true, onClick:async()=>{
        try{
          const title = document.getElementById('lore-title')?.value?.trim() || 'Untitled Character';
          const section = document.getElementById('lore-section')?.value || 'reality';
          const imageInput = document.getElementById('lore-image');
          const next = Object.assign({}, page, {
            section,
            type:ENTRY_TYPE,
            slug:slugify(title),
            title,
            pfpId:document.getElementById('lore-pfp')?.value?.trim() || pfpIdFromName(title),
            subtitle:document.getElementById('lore-subtitle')?.value || '',
            summary:document.getElementById('lore-summary')?.value || '',
            body:document.getElementById('lore-body')?.value || '',
            tags:(document.getElementById('lore-tags')?.value || '').split(',').map(t=>t.trim()).filter(Boolean),
            facts:gatherFacts()
          });
          if(imageInput?.files?.[0]) next.heroImage = await imageToDataUrl(imageInput.files[0]);
          const saved = await saveSharedLore(next);
          currentPageId = saved.id;
          if(typeof closeModal === 'function') closeModal();
          rerenderLore();
        }catch(e){
          console.warn(e);
          if(window.toast) toast(e.message || 'Could not publish lore');
        }
      }},
      {label:'Cancel', onClick:()=>typeof closeModal === 'function' && closeModal()}
    ]);
  }
  function gatherFacts(){
    const keys = [...document.querySelectorAll('#modal .lore-fact-key')];
    const vals = [...document.querySelectorAll('#modal .lore-fact-val')];
    const facts = {};
    keys.forEach((keyEl, idx)=>{
      const key = keyEl.value.trim();
      const val = vals[idx]?.value?.trim() || '';
      if(key && val) facts[key] = val;
    });
    return facts;
  }
  function imageToDataUrl(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          const canvas = document.createElement('canvas');
          const max = 820;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  window.addLoreFactRow = function(){
    const grid = document.querySelector('#modal .ch-lore-fact-grid');
    if(!grid) return;
    grid.insertAdjacentHTML('beforeend', '<input class="lore-fact-key" placeholder="Field"><input class="lore-fact-val" placeholder="Value">');
  };
  window.backToLoreArchive = function(){ currentPageId = ''; rerenderLore(); };
  window.openLorePage = function(id){ currentPageId = id; rerenderLore(); };
  window.openLoreEditor = function(id){ openEditor(id || ''); };
  window.openLoreSection = function(){ currentPageId = ''; rerenderLore(); };
  window.openLoreList = function(){ currentPageId = ''; rerenderLore(); };
  window.deleteLorePage = function(id){
    if(!confirm('Delete the shared edit for this character entry?')) return;
    deleteSharedLore(id).catch(e=>{ console.warn(e); if(window.toast) toast('Could not delete lore page'); });
  };
  window.fateRefreshLore = function(){ loadStarted = false; loadSharedLore(true); };
  window.renderChLoreTab = function(content, opts){
    content = content || loreRoot();
    if(!content) return;
    currentPageId = opts?.pageId || currentPageId || '';
    if(!lorePages.length) setPages([]);
    if(currentPageId) renderPage(content);
    else renderArchive(content);
    loadSharedLore(false);
  };
})();
