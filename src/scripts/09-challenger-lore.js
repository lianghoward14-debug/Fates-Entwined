(function(){
  const AFFILIATIONS = [
    {id:'third-great-war', title:'Third Great War', img:'afficon/third_great_war.png', color:'#ef4b3f'},
    {id:'eventide', title:'Eventide', img:'afficon/eventide.png', color:'#62d7ff'},
    {id:'expanded-worlds', title:'Expanded Worlds', img:'afficon/expanded_worlds.png', color:'#67e08f'},
    {id:'reality', title:'Reality', img:'afficon/reality.png', color:'#f2d34f'}
  ];
  const DEFAULT_FACT_KEYS = ['Affiliation', 'Date of birth', 'Place of Birth', 'Story', 'Titles', 'Relationships'];
  const LS_KEY = 'fateChallengerLorePagesV2';
  const ENTRY_TYPE = 'characters';
  const BASE_CHARACTER_PAGES = [
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'felicyta-janowicz', title:'Felicyta Janowicz', pfpId:'1',
      subtitle:'The Queen who never wanted to be a queen.',
      summary:'Raised in Wodny Potok under the shadow of Sebastyen Janowicz, Felicyta was prepared from childhood to become a political heir and eventually the queen of a reformed Poland-Lithuania.',
      body:'Felicyta grew up in the wistful peaks of the Carpathian Mountains, in a small village called Wodny Potok (2008-2026). Her father, Sebastyen Janowicz, was the most controversial European politician of his time, establishing Visegrad and separating Poland, Czechia, Slovakia, and Hungary from the rest of the European Union.\n\nFrom an early age, Felicyta and her adopted siblings, Kvetka Svoboda, Rozsi Szocs, and Zsofia Szocs, were groomed to become brilliant politicians and leaders for each of their respective countries, each receiving a world class education from tutors all over the world.\n\nFor college, Felicyta attended Jagiellonian University (2026-2029), where she met her lifelong friend Maja Kaminska. In college she began to stray from her charted course, finding joy in a simpler life with friends away from her controlling father. After three years, Sebastyen reeled her back in and spent the next decade preparing her to ascend to the throne.\n\nFelicyta was crowned Queen of Poland under the royal name Jadwiga II in 2038. She ruled Poland into the beginning of the Third Great War in 2052, becoming known for the relocation of Polish industry and the army abroad.',
      facts:{Affiliation:'Poland-Lithuania', 'Date of birth':'December 12, 2008', 'Place of Birth':'Wodny Potok, Poland', Story:'Snow on the Carpathians; The Third Great War and Events Preceding', Titles:'The Queen of Poland, Jadwiga II, The White Eagle', Relationships:'Rozsi Szocs, Zsofia Szocs, Sebastyen Janowicz, Kvetka Svoboda', Era:'2008-2052+', Origin:'Wodny Potok, Carpathian Mountains', Role:'Queen of Poland, Jadwiga II', Status:'Ruling monarch', 'Notable For':'Relocating Polish industry and army abroad'},
      tags:['Jadwiga II', 'Visegrad', 'Third Great War']
    },
    {
      section:'eventide', type:ENTRY_TYPE, slug:'anicka-konvicka', title:'Anicka Konvicka', pfpId:'2',
      subtitle:'A lonely farmer pulled into the conflicts of Pacifica.',
      summary:'Anicka lives in Colombo five hundred years after the Great Calamity. After Kazumi is taken into the Western Seas, she enters Pacifica and becomes tied to pirates, warlords, warships, and floating cities.',
      body:'Anicka Konvicka lives in the struggling land of Colombo five hundred years after the Great Calamity, in an abandoned stretch of land near the Western Sea. As an orphan who lost her mother to illness at a young age and her father in a sailing accident, she lives an independent and lonely life, tending crops and hunting to make ends meet.\n\nOne day she meets another orphan named Kazumi, and the two become exceptionally close. They dream of journeying to Caribbea, a prosperous land, to start a new life.\n\nOn a fateful evening, Kazumi is captured and taken into the Western Seas by an unknown assailant. Anicka resolves to bring her back. She travels into the Western Seas and discovers Pacifica, a civilization of pirates, warlords, warships, and floating cities.\n\nAlongside her newfound friend Maria Song, Anicka journeys into the Great Sea and finds herself embroiled within the conflicts of Pacifica.',
      facts:{Affiliation:'Eventide', 'Date of birth':'December 12, 2008', 'Place of Birth':'Colombo', Story:'To Eventide', Relationships:'Kazumi, Maria Song', Era:'500 years after the Great Calamity', Origin:'Colombo', Role:'Voyager and farmer', Status:'Searching for Kazumi', 'Notable For':'Entering Pacifica from the Western Seas'},
      tags:['Pacifica', 'Kazumi', 'Maria Song']
    },
    {
      section:'reality', type:ENTRY_TYPE, slug:'howard', title:'Howard', pfpId:'3',
      subtitle:'Temecula-born card game menace.',
      summary:'Howard grew up in Southern California, survived high school, Berkeley, Moffitt whiteboards, and now works in Japan while making kids play his card games.',
      body:'Howard grew up in Temecula, in the superior land of Southern California. He spent much of childhood drawing on desks and doodling on worksheets in class.\n\nHoward attended Great Oak High School, where he continued to harass his teachers and get really sleepy in fifth period. During COVID, Howard made a million dollars working at Ralphs and Breakfast Republic, then transferred to UC Berkeley to get really sleepy during classes again.\n\nAfter a brief affair with the Berkeley Police, Howard resorted to drawing on whiteboards in Moffitt, aura farming in MLK, and eating at Crossroads for the rest of his academic career.\n\nHoward is now working in Japan, forcing kids to play his obnoxious card games instead of following the lesson plan.',
      facts:{Affiliation:'Reality', 'Date of birth':'April 25, 2002', 'Place of Birth':'Monterey Park, CA', Story:'None', Titles:'Howa, Moffitt Man, Piano Man', Era:'Modern', Origin:'Temecula, Southern California', Role:'Creator and teacher', Status:'Working in Japan', 'Notable For':'Moffitt whiteboards and card game evangelism'},
      tags:['UC Berkeley', 'Japan', 'Moffitt']
    },
    {
      section:'reality', type:ENTRY_TYPE, slug:'zoe', title:'Zoe', pfpId:'4',
      subtitle:'Resident Evil loyalist and cinematic humanities scholar.',
      summary:'Zoe Inzer is a UC Berkeley student known for loving Resident Evil, film, and refusing to play Minecraft.',
      body:'Zoe Inzer is a junior year student at UC Berkeley notable for her exceptional adoration for the Resident Evil franchise and for being a cinephile.\n\nHailing from the wretched land of Connecticut, she moved to Southern California at a young age and went to school in Redondo Beach.\n\nAt Berkeley she is currently majoring in the Humanities, believed to be Scandinavian Studies if memory serves. Besides all of the characteristics mentioned above, she is also Wasian and refuses to play Minecraft with Howard.',
      facts:{Affiliation:'Reality', 'Place of Birth':'Connecticut', Era:'Modern', Origin:'Connecticut and Redondo Beach', Role:'UC Berkeley student', Status:'Junior year', 'Notable For':'Resident Evil, cinema, and anti-Minecraft principles'},
      tags:['UC Berkeley', 'Resident Evil', 'Cinema']
    },
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'17th-british-regiment-of-africa', title:'17th British Regiment of Africa', pfpId:'5',
      subtitle:'',
      summary:'A British regiment that gained fame through constant combat during the Botswana Campaign.',
      body:'Landing in Angola, the 17th Regiment of Africa was an unassuming unit of soldiers who gained fame for their hard fought victories during the Botswana Campaign from 2052 to 2054.\n\nFar from being known for amazing offensive breakthroughs or stalwart defense, the 17th Regiment was simply known for sheer experience given how frequently they found themselves engaged in combat.\n\nNotably, they participated in the Battle of Maun, the Battle of Bulawayo, and the Battle of Kgalagadi.\n\nAfter 2054, the 17th Regiment became redesignated as the 6th Guard Regiment of The King, redeploying to Europe to participate in the East German Campaign.',
      facts:{Affiliation:'British Army', 'Place of Birth':'Angola campaign front', Story:'Veteran soldiers of the Botswana Campaign.', Titles:'6th Guard Regiment of The King'},
      tags:['Botswana Campaign', 'Angola', 'East German Campaign']
    },
    {
      section:'eventide', type:ENTRY_TYPE, slug:'jorge-alvarez', title:'Jorge Alvarez', pfpId:'6',
      subtitle:'The man behind the Pina and the rise of Caribbea.',
      summary:'Born in West Caribbea in 470 AC, Jorge discovered the Pina, built a trading empire, overthrew the Old Elite, and transformed Caribbea through his Treasure Ports.',
      body:'Born in 470 AC in West Caribbea to a family of simple farmers, much of Jorge Alvarez\'s life was uninteresting until he discovered an all new fruit while foraging for seeds, later calling it the Pina.\n\nSensing the potential of this new crop, he relocated to Havano, the capital of Caribbea, and founded the West Caribbea Fruits Company. The Pina became wildly popular, and Jorge quickly became a wealthy merchant. His enterprise expanded into the West Caribbea Trading Company.\n\nAfter rising through Caribbea society, Jorge became exposed to the injustices of Caribbea and resolved to bring down the Old Elite. When members of the Old Elite discovered the plot, they forced him to flee to West Caribbea, intending permanent banishment.\n\nThere he met lifelong friends Anne Stone and Rivera, who helped him undergo El Viaje De Hombre Pina and gather support from all segments of the populace. Jorge eventually stood at the head of a popular revolution that overthrew the Old Elite.\n\nUnder the West Caribbea Trading Company, Jorge effectively seized control over all of Caribbea, initiating massive development projects over 16 years and creating a prosperous society anchored by his famous Treasure Ports. Because of Jorge, the sun never sets in Caribbea.',
      facts:{Affiliation:'Caribbea', 'Date of birth':'470 AC', 'Place of Birth':'West Caribbea', Story:'To Eventide', Era:'470 AC onward', Origin:'West Caribbea', Role:'Merchant revolutionary', Status:'Leader of Caribbea', 'Notable For':'The Pina, Treasure Ports, and the West Caribbea Trading Company'},
      tags:['Caribbea', 'Pina', 'Treasure Ports']
    },
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'maja-kaminska', title:'Maja Kaminska', pfpId:'7',
      subtitle:'The undefeated commander of the United Nations 5th Army.',
      summary:'Studied by West Point, Sandhurst, and Saint-Cyr scholars after the Third Great War, Maja Kaminska is remembered as a once-in-history general who never suffered a tactical defeat across 56 battles.',
      body:'In a study conducted by war scholars from West Point, Sandhurst, and Saint-Cyr after the Third Great War in 2065, it was unanimously concluded that Maja Kaminska is the greatest general in human history.\n\nHailing from Poland, Kaminska studied at Jagiellonian University before transferring to West Point. She first served as a Brigadier Commander for the United Nations Army during UN intervention in the Mexican Civil War in 2029, where her unit became known for unconventional tactics and highly creative maneuvers.\n\nHer greatest feat in Mexico came during the Battle of Oaxaca de Juarez, where her separated unit of 500 soldiers inflicted massive casualties on a Falangist force numbering 4000 men.\n\nAfter the Mexican Civil War, Maja was promoted to Third Marshall and redeployed to Qingdao during the Chinese Civil War. She served as an advisor, but drew controversy when it was learned she personally commanded the Nationalist Army during the decisive victory at Hangzhou.\n\nShe was soon relocated to Persia to lead a small UN force in Iran, where she accumulated further success. For the next 12 years, Maja was constantly deployed to conflict zones around the world and eventually granted the rank of High Marshall, the highest rank in the United Nations Army.\n\nAt the outbreak of the Third Great War, Maja was given command of the United Nations 5th Army, a diversified and mobile force suited to her strengths. She led it to countless victories, including the famous Battle of Bremen, and never suffered a tactical defeat over 56 battles.',
      facts:{Affiliation:'United Nations 5th Army', 'Place of Birth':'Poland', Story:'The Third Great War and Events Preceding', Titles:'High Marshall', Era:'2029-2065', Origin:'Poland', Role:'High Marshall', Status:'Legendary commander', 'Notable For':'56 battles without a tactical defeat'},
      tags:['United Nations', 'Battle of Bremen', 'High Marshall']
    },
    {
      section:'reality', type:ENTRY_TYPE, slug:'lina', title:'Lina', pfpId:'8',
      subtitle:'Former manga loyalist, current digital media appreciator.',
      summary:'Lina moved past an undersocialized, chronically online era, graduated from UC Berkeley in a biology-adjacent major, and now works a respectable job while dabbling in photography and Soulslike games.',
      body:'While Autistic Femcel Rizz is likely an over exaggeration on all fronts, Lina\'s unconventional past left her, in her words, undersocialized and chronically online.\n\nShe has since risen past that awkward phase of life and graduated from UC Berkeley in some kind of biology-adjacent major. She is now working a respectable job.\n\nOnce an ardent manga fan, she has transitioned into an appreciation of digital media through photography and dabbles in the world of Soulslike games.\n\nIt remains completely unclear why she takes several days to weeks to answer texts, but at least she bought Howard McDonald\'s a few times, so he can somewhat look past it.',
      facts:{Affiliation:'Reality', 'Place of Birth':'UC Berkeley orbit', Era:'Modern', Origin:'UC Berkeley', Role:'Biology-adjacent graduate', Status:'Respectably employed', 'Notable For':'Photography, Soulslikes, and delayed text replies'},
      tags:['UC Berkeley', 'Photography', 'Soulslike']
    },
    {
      section:'third-great-war', type:ENTRY_TYPE, slug:'united-nations-5th-army', title:'United Nations 5th Army', pfpId:'9',
      subtitle:'',
      summary:'The most decorated and experienced army in the United Nations Army, led by Maja Kaminska.',
      body:'The United Nations 5th Army is the most decorated and experienced army in the entire United Nations Army, led under the famous general Maja Kaminska.\n\nThe 5th Army is noteworthy for being a highly diversified and experienced force, capable of pivoting to different combat styles. Over half of its units are consolidated from Kaminska\'s many foreign campaigns, such as the 12th and 15th Iranian Engineers, the 3rd, 34th, 87th, 13th and 68th Mexican Light Infantry, the 3rd and 5th Chinese Jian Guard, the 8th, 12th, and 2nd Brazilian Rifles, and the 32nd, 28th, and 4th Indian Motorized Division, amongst many others.\n\nThroughout the Third Great War, the 5th Army fought in over 50 battles across 5 different campaigns, winning brilliant battles like the Battle of Bremen, the Battle of Poznan, and the Battle of Belgorod.',
      facts:{Affiliation:'United Nations Army', 'Place of Birth':'United Nations Army foreign campaigns', Story:'A diversified veteran army commanded by Maja Kaminska.', Titles:'United Nations 5th Army', Relationships:'Maja Kaminska'},
      tags:['United Nations', 'Maja Kaminska', 'Battle of Bremen']
    }
  ];
  let lorePages = [];
  let currentPageId = '';
  const LORE_ARCHIVE_PAGE_SIZE = 9;
  let currentLoreArchivePage = 0;
  let currentLoreWindowArchivePage = 0;
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
  function documentTwoPages(){
    return [
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'felicyta-janowicz', title:'Felicyta Janowicz', pfpId:'1',
        subtitle:'The Queen who never wanted to be a queen.',
        summary:'Felicyta Janowicz, Jadwiga II, is the exiled Queen of Poland whose vow to become the White Eagle began in the haunted forests of the Carpathians.',
        body:'Felicyta grew up in the Carpathian village of Wodny Potok under the shadow of her father, Sebastyen Janowicz, the politician who created Visegrad and broke Poland, Czechia, Slovakia, and Hungary away from the European Union. She and her adopted siblings, Kvetka Svoboda, Rozsi Szocs, and Zsofia Szocs, were trained from childhood to become leaders for their respective countries.\n\nOn one stormy Christmas Eve, Felicyta became lost in the Carpathian forests and encountered specters of wars long past: gaunt figures carrying axes, rifles, swords, and grenades, all longing for lives they were never allowed to live. Their sorrow drove her vow to become the White Eagle, the person who would end conflict rather than feed it.\n\nAt Jagiellonian University, Felicyta met Maja Kaminska and briefly discovered the joy of a freer, simpler life. Sebastyen eventually forced her home, spending the next decade preparing her for the throne of a reformed Poland-Lithuania. She was crowned Queen of Poland in 2038 under the royal name Jadwiga II.\n\nHer reign emphasized diplomacy and warnings about the thin boundary between peace and war. When the Third Great War began in 2052, Felicyta made the controversial choice to surrender to the Comintern while arranging for millions of Polish citizens to flee. Her government went into exile, her military rebelled and fought abroad, and her image slowly changed from irrational monarch to queen who may have saved her people.',
        facts:{Affiliation:'Poland-Lithuania', 'Date of birth':'December 12, 2008', 'Place of Birth':'Wodny Potok, Poland', Story:'Snow on the Carpathians; The Third Great War and Events Preceding', Titles:'The Queen of Poland, Jadwiga II, The White Eagle', Relationships:'Rozsi Szocs, Zsofia Szocs, Sebastyen Janowicz, Kvetka Svoboda'},
        tags:['Jadwiga II', 'White Eagle', 'Snow on the Carpathians']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'anicka-konvicka', title:'Anicka Konvicka', pfpId:'2',
        subtitle:'A Colombo orphan who sails into Pacifica to recover Kazumi.',
        summary:'Anicka is a distrustful farmer from Colombo whose sisterly bond with Kazumi pulls her into the Western Seas and the hidden world of Pacifica.',
        body:'Anicka Konvicka lives in Colombo five hundred years after the Great Calamity. Orphaned by illness and a sailing accident, she survives alone by tending crops and hunting near the Western Sea. Her blue eyes are treated as an omen of bad luck because the people of Colombo associate them with the destructive Western Seas.\n\nShe rescues Kazumi from captors who intend to sell her into slavery. Anicka tries to keep her distance, but Kazumi has no family, and the two become sisters. They steal books, wander the coast, and dream of leaving for Caribbea together.\n\nBefore their departure, Kazumi sacrifices herself during the Sea Ritual in place of her former captors. Anicka, furious and heartbroken, tries to free her from mysterious rusted Sea Men but fails. Kazumi reveals a final memory of one captor buying a plush for his daughter, complicating Anicka\'s anger even as Kazumi is taken into the sea.\n\nAnicka travels north into Californique, enters the Western Seas from an abandoned Old Age city, and eventually reaches Panacea. There she meets Maria Song and discovers Pacifica: a civilization of pirates, warlords, warships, and floating cities. Her search for Kazumi becomes a journey through the Great Sea.',
        facts:{Affiliation:'None', 'Date of birth':'492 AC', 'Place of Birth':'Colombo', Story:'To Eventide', Titles:'None', Relationships:'Kazumi, Maria Song'},
        tags:['Colombo', 'Kazumi', 'Pacifica']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'howard', title:'Howard', pfpId:'3',
        subtitle:'Temecula-born creator, Berkeley whiteboard menace, and teacher in Japan.',
        summary:'Howard grew up in West Covina and Temecula, carried his stories through high school and Berkeley, and now teaches in Japan while making people play his card games.',
        body:'Howard was born in Monterey Park and spent his earliest years in West Covina before growing up in Temecula, Southern California. Childhood memories include preschool disasters, a friend named Julian, throwing snails into a pool, drawing on desks, and reading books before video games redirected his attention.\n\nIn middle school he fell into LOTRO, Minecraft modding, and mobile MMOs, while meeting lifelong friends Jimmy, Isaac, Chris, and Phil. At Great Oak High School he drew on desks, made stories, enjoyed Spanish class with Herney Jones, created early whiteboard drawings, and invented Duncan Heyward. Henry Pestilence Cloud was born in Mr. Boyatt\'s ELA class, beginning the larger story world behind Fates Entwined.\n\nCOVID arrived during Howard\'s senior year and spared him from studying for IB exams. During the pandemic he worked at Ralphs and Breakfast Republic, then transferred to UC Berkeley as a Global Studies major. There he met many of his modern friends and spent much of his college life drawing on Moffitt whiteboards, aura farming in MLK, and eating at Crossroads.\n\nAfter a short time at Chi Cha San Chen, Howard moved to Japan, where he now works while forcing kids to play his card games instead of following the lesson plan.',
        facts:{Affiliation:'University of California, Berkeley; The City of Temecula', 'Date of birth':'April 25, 2002', 'Place of Birth':'Monterey Park, CA', Story:'None', Titles:'Howa, Moffitt Man, Piano Man', Relationships:'Jimmy, Isaac, Chris, Phil, Mark, Harvey, Cathy, Zoe, Joie, Andi'},
        tags:['Temecula', 'UC Berkeley', 'Japan']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'zoe', title:'Zoe', pfpId:'4',
        subtitle:'Resident Evil loyalist, cinephile, and Berkeley humanities student.',
        summary:'Zoe Inzer is a UC Berkeley student from the Connecticut and Redondo Beach orbit, known for Resident Evil, film, visual taste, and refusal to play Minecraft.',
        body:'Zoe Inzer is a junior at UC Berkeley known for her adoration of Resident Evil and cinema. She comes from Connecticut, moved to Southern California at a young age, and went to school in Redondo Beach before Berkeley.\n\nAt Berkeley, she majors in the humanities, likely Scandinavian Studies if memory is reliable. She is Wasian, refuses to play Minecraft, and has a boyfriend named Lukas. She has said she wants to live long-term in Denmark or Britain because she hates Japan and America.\n\nZoe posts cinema character drawings and makes exceptionally polished Instagram posts. She once bought Howard food from Trader Joe\'s, which earned lasting appreciation. Her cinephile instincts, however, have not yet converted into a willingness to watch 2D works like Arcane.',
        facts:{Affiliation:'University of California, Berkeley; The City of Redondo Beach', 'Date of birth':'2005', 'Place of Birth':'Unknown', Story:'None', Titles:'Soe', Relationships:'Lukas, Howard'},
        tags:['UC Berkeley', 'Resident Evil', 'Cinema']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'17th-british-regiment-of-africa', title:'17th British Regiment of Africa', pfpId:'5',
        subtitle:'The Iron Guards of Africa.',
        summary:'A British regiment hardened by the Botswana Campaign, later redesignated as the 6th Guard Regiment of The King.',
        body:'The 17th British Regiment of Africa landed in Angola as an ordinary unit and became famous through the brutal Botswana Campaign from 2052 to 2054 under Lieutenant Burnes. It was not known for dazzling breakthroughs or legendary defensive stands, but for experience, endurance, and reliability.\n\nThe regiment fought in dozens of major battles and hundreds of skirmishes, often anchoring the center of the British frontline within the wider 4th Army. It participated in the Battle of Maun, the Battle of Bulawayo, and the Battle of Kgalagadi. At Kgalagadi, its rearguard action bought time for reinforcements during a near encirclement; at Maun, it fought for thirty-two straight hours.\n\nAfter the African Republic capitulated in 2054, the exhausted regiment was redesignated as the 6th Guard Regiment of The King and sent to Europe for the East German Campaign. Though reduced and dispersed, its veterans reinforced weak points across British formations. After the war, the regiment was recognized as one of Britain\'s most resilient fighting forces and received the second highest number of medals of any British regiment.',
        facts:{Affiliation:'The United Kingdom', 'Date of birth':'None', 'Place of Birth':'None', Story:'The Third Great War and Events Preceding', Titles:'The Iron Guards of Africa', Relationships:'Lieutenant Burnes'},
        tags:['Botswana Campaign', 'Iron Guards', 'East German Campaign']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'jorge-alvarez', title:'Jorge Alvarez', pfpId:'6',
        subtitle:'The Pineapple Man and conqueror of dawn.',
        summary:'Jorge Alvarez transforms a fruit stand into the West Caribbea Trading Company, then uses commerce and revolution to remake Caribbea.',
        body:'Jorge Alvarez was born in West Caribbea in 470 AC to simple farmers. He and his brother Santiago dreamed of becoming rich enough to escape their old life and move to Havano. That dream changed when Jorge discovered a new fruit, the Pina, and founded the West Caribbea Fruits Company.\n\nThe Pina became wildly popular. Jorge expanded from a small stand into the West Caribbea Trading Company, with shops across Havano. As he rose through society, he became aware of the cruelty of the Old Elite and resolved to bring them down. His brother, now a general for the Old Elite, exposed the plot and forced Jorge to flee.\n\nWashed ashore after an ambush, Jorge was rescued by Rivera and Rivera\'s daughter Sofia. Rivera\'s stories of hardship pushed Jorge toward El Viaje De Hombre Pina, a journey across Caribbea to understand the people. He was joined by Anne Stone, a brilliant organizer and revolutionary from a prestigious college in Havano.\n\nThe movement grew, survived the Santa Rosa massacre, and eventually became impossible for the Old Elite to contain. Jorge returned to Havano and delivered his famous El Sol Nunca se Pone en el Caribbea speech. His company seized control, expelled the Old Elite, reinvested its wealth into ports and countryside, and transformed Caribbea into a bright coastal society of Treasure Ports, ribbons, roads, estates, and blue seas.',
        facts:{Affiliation:'The West Caribbea Trading Company; The Pina Revolution', 'Date of birth':'470 AC', 'Place of Birth':'West Caribbea', Story:'To Eventide; El Viaje Del Hombre Pina', Titles:'The Pineapple Man, The Conquerer of Dawn, Headmaster of the West Caribbea Trading Company', Relationships:'Santiago Alvarez, Rivera, Sofia, Anne Stone, Sebastian'},
        tags:['Pina', 'Caribbea', 'Treasure Ports']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'maja-kaminska', title:'Maja Kaminska', pfpId:'7',
        subtitle:'Napoleon with ribbons in her hair.',
        summary:'Maja Kaminska is considered the greatest general in history, a creative commander whose doctrine made the UN 5th Army terrifyingly fluid.',
        body:'After the Third Great War, war scholars from West Point, Sandhurst, and Saint-Cyr concluded that Maja Kaminska was the greatest general in human history. Across her career she won 186 battles, suffered only four conventional defeats, and built an unmatched record of operations across the world.\n\nMaja grew up in Warsaw and was remembered as unconventional, funny, charming, and endearing. She studied at Jagiellonian University, where she met Felicyta Janowicz. Maja pulled Felicyta out of her shell through parties, mischief, boys, and at least one plan to vandalize the Palace of Science and Culture before a midterm. Their time together ended when Sebastyen Janowicz forced Felicyta back to southern Poland.\n\nMaja transferred to West Point, more interested in military history than political science. She first served in the United Nations Army during the Mexican Civil War in 2029, where her unit became famous for creative tactics. At Oaxaca de Juarez, her separated force of 500 inflicted massive losses on 4000 Falangists.\n\nShe later served in Qingdao during the Chinese Civil War, in Persia and Iran, and across numerous conflict zones before becoming High Marshall of the United Nations Army. During the Third Great War she commanded the United Nations 5th Army, using a fluid doctrine built around deception, movement, and tactical flexibility. In 56 battles during the war, she never suffered a tactical defeat.',
        facts:{Affiliation:'The United Nations, Jagiellonian University, West Point', 'Date of birth':'September 8, 2008', 'Place of Birth':'Warsaw, Poland', Story:'Snow on the Carpathians; The Third Great War and Events Preceding', Titles:'Napoleon with Ribbons in her Hair, Maiden of Victory, The Master of War', Relationships:'Felicyta Janowicz'},
        tags:['High Marshall', 'Kaminska Line', 'UN 5th Army']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'lina', title:'Lina', pfpId:'8',
        subtitle:'Former manga loyalist, current digital media appreciator.',
        summary:'Lina grows beyond an undersocialized, chronically online era into a more balanced life around Berkeley, photography, music, and work.',
        body:'Autistic Femcel Rizz is likely an exaggeration, but Lina\'s unconventional past left her, in her own words, undersocialized and chronically online, partly because of extensive homeschooling. A photo of her holding a katana like an anime character makes the point quickly enough.\n\nFrom 2023 to 2025 she made an active effort to move beyond that awkward phase. Her fashion sense improved, she no longer seems to cosplay as Denji from Chainsawman as a default social strategy, and she began valuing hobbies and a steadier life rather than only putting pedal to the metal for career goals.\n\nOnce an ardent manga fan, Lina moved toward photography, Soulslike games, and a stronger appreciation of music through Golden Records at UC Berkeley. She still takes days or weeks to answer texts, but she has bought Howard McDonald\'s several times, which somewhat softens the offense.\n\nLina graduated from UC Berkeley in a biology-adjacent major and now works a respectable job. She enjoys life in the Bay, remains close to her mother, meets friends from Golden Records, and has yet to play this card game, though it will surely happen one day.',
        facts:{Affiliation:'University of California, Berkeley', 'Date of birth':'2003', 'Place of Birth':'Heyward, CA', Story:'None', Titles:'Femcel', Relationships:'Golden Records, Howard'},
        tags:['UC Berkeley', 'Golden Records', 'Photography']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'united-nations-5th-army', title:'United Nations 5th Army', pfpId:'9',
        subtitle:'The Army of Bremen.',
        summary:'The most decorated army in the United Nations Army, built from Maja Kaminska\'s veteran foreign campaign units.',
        body:'The United Nations 5th Army is the most decorated and experienced army in the United Nations Army, led by Maja Kaminska. It is diversified, mobile, and able to pivot between styles because many of its units came from Kaminska\'s earlier foreign campaigns.\n\nIts formations include the 12th and 15th Iranian Engineers, the 3rd, 34th, 87th, 13th, and 68th Mexican Light Infantry, the 3rd and 5th Chinese Jian Guard, the 8th, 12th, and 2nd Brazilian Rifles, and the 32nd, 28th, and 4th Indian Motorized Division, among many others.\n\nMasters of Kaminska\'s doctrine, these soldiers do not panic when their flanks seem loose. They understand the battlefield as something closer to a water puddle than a fixed line: a defined core with fluid protrusions that constantly shift the boundaries of combat. Scholars believe the 5th Army\'s exceptional morale under Kaminska\'s name is what makes this doctrine possible.\n\nThroughout the Third Great War, the 5th Army fought in more than 50 battles across 3 campaigns, winning at Bremen, Poznan, and Belgorod.',
        facts:{Affiliation:'Army of the United Nations', 'Date of birth':'None', 'Place of Birth':'None', Story:'The Third Great War and Events Proceeding', Titles:'The Army of Bremen', Relationships:'Maja Kaminska'},
        tags:['Bremen', 'Poznan', 'Belgorod']
      },
      {
        section:'expanded-worlds', type:ENTRY_TYPE, slug:'post-modernist-dylan', title:'Post-Modernist Dylan', pfpId:'10',
        subtitle:'A corrupted Dylan tied to destruction, prophecy, and a Rubik cube.',
        summary:'Post-Modernist Dylan is an annihilating corrupted form of Dylan, born from abandoned ties, escalating bitterness, and a prophetic transformation.',
        body:'Post-Modernist Dylan is a mysterious being with divine ties and unclear origins, except that he was first drawn on a random piece of paper in high school and then nearly forgotten. He is an utterly corrupted version of Dylan, opposite in many ways to Dylan\'s ordinary high school personality.\n\nThis form is obsessed with annihilation, destruction, obliteration, extermination, eradication, and ending all things. His power is great, though still below greater universal deities like Bobby Jones, Cosmic GF, and Juan Carlos.\n\nPost-Modernist Dylan channels power from a corrupted Rubik cube displayed behind him. The cube casts an aura that atomizes everything it touches. A prophecy says Dylan will reach this form after abandoning all ties to Asian girls, becoming first a simp, then a White Knight, then the Master of SSRIs, before hatred fills the place where love once was.\n\nWhen that final transition occurs, the Earth will tremble as the Post-Modernist beast is born.',
        facts:{Affiliation:'None', 'Date of birth':'Unknown', 'Place of Birth':'Unknown', Story:'None', Titles:'None', Relationships:'Dylan Kirby, Bobby Jones, Cosmic GF, Juan Carlos'},
        tags:['Corrupted Dylan', 'Rubik cube', 'Expanded Worlds']
      }
    ];
  }
  const DOCUMENT_EXACT_BODIES = {
    'felicyta-janowicz': `The Queen who never wanted to be a queen. Felicyta grew up in the wistful peaks of the Carpathian Mountains, in a small village called Wodny Potok (2008-2026). Her father, Sebastyen Janowicz, was the most controversial European politician of his time, establishing Visegrad and separating Poland, Czechia, Slovakia, and Hungary from the rest of the European Union. Hence, from an early age, Felicyta and her adopted siblings, Kvetka Svoboda, Rozsi Szocs, and Zsofia Szocs, were groomed to become brilliant politicians and leaders for each of their respective countries, each receiving a world class education from tutors all over the world. Although Felicyta felt little passion for the work she conducted, her lack of other desires in life made work the only thing she could pass her time with.

Felicyta's otherwise monotonous life would shatter on one stormy Christmas Eve, when she found herself lost in the vast forests of the Carpathian mountains, where she came across horrid specters of wars long past - gaunt figures carrying axes, rifles, swords, and grenades, all longing for a life they never were able to live. Felicyta felt the burning sorrow of a thousand lives over thousands of years, men who lived only so that they could die. She vowed to become "The White Eagle," the one who would bring an end to all conflicts.

For college, Felicyta would attend the Jagiellonian university, (2026-2029) meeting her lifelong friend Maja Kaminska there. It was in college that Felicyta began to stray from her chartered course, realizing the joys of a simpler life with her newfound friends away from her controlling father, and far from the lingering shadows of those specters she encountered long ago. However, after just three years of this new life her father reeled her back in, forcing her to return home to the Carpathians. Sebastyen spent the next decade preparing her to ascend to the throne of a reformed Poland-Lithuania, leading Felicyta to be crowned the Queen of Poland, taking up the royal name of Jadwiga II (2038).

Her rule was characterized by relative calm, in the context of world tension reaching a breaking point during this decade. Despite calls for militarization, she continued her focus on the international forum, and was present for many diplomatic summits, adamant on a rhetoric for stability. Notably, she centered her tone on the consequences of aggressive action, highlighting the thin boundaries between peace and war. She would rule Poland into the beginning of the Third Great War (2052), where she became known for the extremely controversial immediate surrender to the Comintern. Millions in her homeland and abroad considered this decision to be the most irrational in all of history, suggesting that she must have been clinically troubled to have come to such a conclusion. While her government was taken into exile into the United Kingdom, the military rebelled and separated from the formal Polish government, deciding to continue the fight from abroad as an international expeditionary force in all fronts of the war. By terms of the surrender agreement, the people of Poland were given full immunity to flee the country, in a long and chaotic three month process in which transportation was arranged for millions of people. Most of the population found themselves in The United States or United Kingdom. From this point Felicyta became a queen in exile, offering encouraging words for her citizens and continuing her calls to end the war. Although they initially fell on deaf ears, as the war dragged on, the image of Felicyta began to grow more and more favorable as time passed, and many began to see the merit of her actions...`,
    'anicka-konvicka': `Anicka Konvicka lives in the struggling land of Colombo five hundred years after the Great Calamity, in an abandoned stretch of land near the Western Sea. As an orphan who lost her mother to illness at a young age and her father in a sailing accident, she lives an independent and lonely life, tending to her crops and hunting to make ends meet. Due to negative experiences with the people of Colombo in the past, Anicka harbors a general distrust of any people she meets. Her blue eyes, to the people of Colombo, are considered an omen of bad luck due to its association with the Western Seas - a calamitous force that only brings destruction and death.

One day, she meets another orphan named Kazumi, who she rescues from captors attempting to sell her into slavery. Although Anicka never intended to see her again, Kazumi disclosed that she herself never had a family, and Anicka ultimately decided to support her. After a short time they grew close, becoming sisters, and Kazumi disclosed that she loved reading, learning about the history of the Old Age. Together they would steal books from the library and wander the coast of Colombo, sharing dreams of one day journeying to Caribbea, a prosperous land, in order to start a new life. However on the fateful evening before departing to Caribbea, Kazumi sacrificed herself during the Sea Ritual to be taken as tribute to quell the Seas, in place of her former captors. Anicka, furious that Kazumi would sacrifice herself for her former captors, who were nothing but cruel to her, had initially continued on the road to Caribbea in disbelief by her decision. However, deciding to go back, Anicka witnesses the final moments before Kazumi was to be guided into the sea, in a cruel parallel to how she lost her father. In a fit of emotion, Anicka attempted to free Kazumi from the mysterious "Sea Men" clad in rusty armor and seaweed, to no avail. It was at this time Kazumi disclosed that her captor "had a daughter," recalling a time when she watched her captor spend all of his money on hand to buy her a plush.

After Kazumi was taken into the seas, Anicka resolved to bring her back, so she traveled North into Californique, far past Caribbea, venturing into the Western Seas from an abandoned city of the Old Age. After sailing for some weeks, Anicka eventually encounters a huge city on an island chain known as Panacea, where she meets a woman by the name of Maria Song. It was at this time that she realized that she had come across a whole new civilization of people and places she or the people of Colombo never knew existed - Pacifica. Pirates, and warlords, warships and floating cities - Anicka, alongside her newfound friend Maria Song, journey into the Great Sea, finding themselves embroiled within the conflicts of Pacifica, in search of Kazumi.`,
    'howard': `Howard grew up in Temecula, in the superior land of Southern California. Howard initially spent five years living in West Covina, from birth to the age of five, but memories of this life are few - I recall peeing my pants in preschool, I remember a friend named Julian, and I remember throwing snails into the pool. Howard spent most of his childhood not really thinking much, resorting to drawing on desks and doodling on worksheets in class. He was quite good with multiplication tables, and loved reading books such as The Magic Tree House, Bailey School Kids, and My Weird School, but the moment he discovered video games his life went downhill. He started playing LOTRO in middle school, which would basically continue all the way until college, and he was made aware of Minecraft modding and mobile MMOs like Pocket Legends. However it was during this time in elementary school and middle school that he would meet his lifelong friends Jimmy, Isaac, Chris, and Phil.

Howard would go on to attend Great Oak High School, where he continued to harass his teachers and get really sleepy in 5th periods after lunch, while mostly drawing on his desk and working on his stories. His favorite class was Herney Jones' Spanish class, where he created his first whiteboard drawings and invented the character Duncan Heyward. However, it would be one fateful day in Mr. Boyatt's ELA class where he created the legendary Henry Pestilence Cloud - leading to the birth of all stories you are reading now. He participated in the IB program, and actually thought it was quite fun, but only because he didn't really do much of the work. Somehow he failed AP Art History and IB SL Physics, but this was of no concern to him at the time. Covid began during Howard's senior year in High School, which lowkey saved him because he did not study for his IB exams at all.

During COVID, Howard made a million dollars working at Ralphs and Breakfast Republic, where he then transferred to UC Berkeley as a Global Studies Major where he met most of his modern friends, such as Mark, Harvey, Cathy, Zoe, Joie, Andi, amongst many others. After a brief affair with the Berkeley Police, Howard resorted to drawing on Whiteboards in Moffitt, aura farming in MLK, and eating at Crossroads for the rest of his academic career. After a brief stint working at Chi Cha San Chen, where Howard thought it was the hardest thing he ever did even though it was just a Boba shop, now Howard is working in Japan, forcing kids to play his obnoxious card games instead of following the lesson plan.`,
    'zoe': `Zoe Inzer is a Junior year student at UC Berkeley notable for her exceptional adoration for the Resident Evil franchise and being a cinephile. Hailing from the wretched land of Connecticut, she moved to Southern California at a young age and went to school in Redondo Beach. At Berkeley she is currently majoring in the Humanities, I believe in Scandinavian Studies if my failing memory serves me well. Besides all of the characteristics mentioned above, she also is Wasian and refuses to play Minecraft with me.

Zoe has a boyfriend named Lukas, and she has told me that she wants to long term live in Denmark or Britain or something because she hates Japan and America. She posts drawings of characters from cinema on her story, and is quite exceptional at making aesthetically pleasing instagram posts. One time she bought me food from Trader Joes which was cool. I got to eat Trader Joe dumplings or something for the first time because of that. Unfortunately, due to how much of a cinephile she is, she seems to refuse to watch 2D works like Arcane, even after we showed her the CaitVi lesbian scene.`,
    '17th-british-regiment-of-africa': `Landing in Angola, the 17th Regiment of Africa was an unassuming unit of soldiers who gained fame for their hard fought victories during the Botswana Campaign from 2052 to 2054, under the command of Lieutenant Burnes. Far from being known for their amazing offensive breakthroughs or stalwart defense, the 17th Regiment was simply known for their sheer experience - They participated in dozens of major battles, hundreds of skirmishes, and stood up when the time was needed for a trustworthy and reliable force. They often occupied the direct center of the British frontline during these campaigns, anchoring the wider 4th Army. Notably, they participated in the Battle of Maun, The Battle of Bulawayo, and the Battle of Kgalagadi, the latter in which they faced encirclement and potential annihilation, but their rearguard action bought enough time for reinforcements to come to their aid. In the Battle of Maun, the 17th Regiment fought for thirty-two hours straight with no clear respite. After 2054, when the African Republic capitulated, the 17th Regiment became redesignated as the 6th Guard Regiment of The King, redeploying to Europe to participate in the East German Campaign. This decision came in large part due to the recognition that this unit fought in too many battles and was overly expended. Although this new force had become a fraction of the size of the original 17th Regiment, and widely dispersed amongst many other regiments, the 6th Guard acted as an experienced veteran unit which often reinforced holes in the formation. After the war, the 17th Regiment would be recognized by the British government as one of the war's most resilient fighting forces, awarded the second highest number of medals of any British Regiment during the War.`,
    'jorge-alvarez': `Born in 470 AC in West Caribbea to a family of simple farmers, he and his brother Santiago Alvarez dreamed of one day becoming powerful and rich together, to escape their current life and move to Havano. For many years this was but a dream, and much of Jorge's life was uninteresting until he discovered an all new fruit while foraging for some seeds, which he would later call "The Pina." Sensing the potential of this new crop he relocated to Havano, the capital of Caribbea, and founded the West Caribbea Fruits Company, which specialized in the sale of this new crop. Although selling from a mere stand in the marketplace of Havano at the time, scouring for scraps and hardly making more than a few sales per day, "The Pina" eventually became wildly popular, and Jorge quickly became a wealthy merchant. He continued to rapidly expand his enterprise, eventually becoming The West Caribbea Trading Company, owning large shops across all of Havano.

After rising through the ranks of Caribbea society, he became more exposed to the injustices of Caribbea and eventually resolved to bring down the "Old Elite" - However, members of the Old Elite caught wind of this plot through his brother, who had become a general for the Old Elite, and this forced Jorge to flee to West Caribbea, after he was ambushed by mercenaries while giving an impactful speech in Havano. His friend, a fisherman named Sebastian, gave his life to save Jorge, attempting to flee pursuing Old Elite Sloops on his fishing boat. After washing up on shore, barely conscious and battered, It was here that Jorge met his lifelong friends Rivera, and his daughter Sofia, who lived in a remote shack on the coast of Caribbea. Rivera nursed Jorge back to full health, telling him stories of the hard life in Caribbea, highlighting furthermore the hundreds of years in which the Old Elite leeched from the populace. Jorge, resolving to help the people of Caribbea as best he could, decided to embark on a journey across all segments of society in Caribbea to learn of the people and their woes, in what would become known as his famous El Viaje De Hombre Pina.

It was here he met an aspiring revolutionary from a prestigious college in Havano, named Anne Stone, who spoke of an extreme ideology without government, advocating for violent revolution to undermine the Old Elite. She joined Jorge and Rivera on the Viaje, as Jorge recognized her intelligence and ability as an organizer. Eventually, as word spread of his journeys through Caribbea, helping local villages and speaking to people with great charisma and approachability, Jorge found himself at the head of a popular revolution, calling for the overthrow of the Old Elite through peaceful protest. The Old Elite caught wind of this situation and deployed an army to stop the revolution, resulting in a contentious debate between peaceful protest and violent revolution. This led to the infamous Santa Rosa massacre, where hundreds of protestors were gunned down by the Old Elite military. This event nearly broke Jorge, leading him to question everything he has done for the past year, only for Anne to flip and decide to fight the path of peaceful protest, encouraging Jorge to persevere. Eventually over the course of a year, after growing pressure in Havano and strikes around the countryside, this created a situation where the Old Elite could no longer afford to contain this popular movement due to military defections and starvation of the large ports, and Jorge triumphantly returned to Havano where he gave his famous "El Sol Nunca se Pone en el Caribbea" speech, which all but solidified the triumph of the revolution.

Jorge's company seized control of Havano, expelling the Old Elite, and continued his domination of all of Caribbea through diplomacy and his overwhelming economic power. Under The West Caribbea Trading Company, over the course of the next 16 years, Jorge effectively seized control over all of Caribbea, initiating massive development projects in which every last drop of money profited was reinvested into the city and land, which eventually created a prosperous society in all segments of life. The countryside of Caribbea, paved by cobbled roads and large estates, were anchored by his famous "Treasure Ports," large port cities with immense wealth and beautiful architecture, places where people would describe as a coastal paradise. Although Old Elite guerillas still remained in the far, remote jungle, the last bastion of Old Elite power crumbled in the year 510 AC, when the small region of Santa Clarita in the south was signed away to the Company. However, far by this point, Caribbea had already been transformed completely. The men and women of the treasure ports wear ribbons in their everyday clothing, signalling their newfound freedom and prosperity. The seas, blue and bright as the banner of West Caribbea, promise a future of continued hope and good fortune. The countryside, once gloomy and bare, springs to life with bright vegetation and unpolluted rivers, ferrying goods to all corners of Caribbea. Because of Jorge, "The Sun Never Sets in Caribbea."`
  };
  Object.assign(DOCUMENT_EXACT_BODIES, {
    'maja-kaminska': `In a study conducted by war scholars from West Point, Sandhurst, and Saint-Cyr after the Third Great War in the year 2065, it was unanimously concluded that Maja Kaminska is the greatest general in all of human history. 186 battles won, only four times defeated by conventional metrics, while garnering the most prolific experience profile in all of history, conducting operations in all corners of the world. No two of her battles are ever completely the same, as Kaminska ensures every battle takes upon tactics wildly different from anything that could be read in a textbook. She single handedly invented a new type of front line distribution by herself, named the Kaminska line, which featured rapidly shifting and deceptive movement rather than static positions or a committed reserve. Although her doctrine still draws upon principles of movement and flexibility, the creativity in which she manipulates the battlefield and her units are unparalleled. Hailing from Poland, and growing up in Warsaw, she was described by her peers as being somewhat unconventional and weird, but thoroughly funny, charming, and endearing to interact with.

She studied at the Jagiellonian university, where she met her lifelong friend and roommate Felicyta Janowicz, who she at the time described as gloomy, but hard working. The two grew close, and Kaminska managed to get Felicyta to break her shell, going on parties, conducting mischievous activities, and meeting boys for much of their time in college. Disagreements naturally occurred, given one situation where Felicyta did not want to drive all the way to Warsaw to vandalize the Palace of Science and Culture, and then drive back home in time before a midterm, but ultimately Felicyta changed as a person meeting Maja. However their time together in college would come to a dramatic end when her father, Sebastyen Janowicz, forced Felicyta to return home to Southern Poland, due to her faltering performance in college. Maja wouldn't be able to see Felicyta for many years until one day when Maja snuck into Felicyta's home, where they spent a heartfelt night walking around the forests of the Carpathians.

By this point however Kaminska had transferred to West Point, citing that she was more interested in Military history than Political Science, where she achieved decent marks and graduated with some distinction. Although Maja was initially a part of the US military as a Second Lieutenant, due to obligations of UN member nations needing to now supplement the UN army with mandatory units and a quota to meet, Kaminska first served as a Captain Commander for the United Nations Army during UN intervention during the Mexican Civil War in 2029, where her unit was noted for their unconventional tactics and highly creative maneuvers, especially in a skirmish near Mexico City where her unit annihilated a local supply hub. She quickly was promoted through the ranks, becoming a Brigadier Commander in just a year, and It was during this time that her unit found tremendous success in Oaxaca, her greatest feat coming during the Battle of Oaxaca de Juarez, where her separated unit of 500 soldiers managed to inflict massive casualties on a Falangist force numbering 4000 men.

After the Mexican Civil War Maja was promoted to a Third Marshall and redeployed to Qingdao during the Chinese Civil War, serving as an advisor but running into controversy when it was learned she personally commanded the Nationalist Army during the decisive victory at Hangzhou. She was soon relocated to Persia, to lead a small UN force in Iran, where she likewise accumulated noteworthy success. For the next 12 years Maja would be constantly deployed to conflict zones around the world, commanding detachments of anywhere from 1000 to 10,000 soldiers, eventually being granted the rank of High Marshall, the highest rank in the United Nations Army. By 2055, many around the world had recognized Maja as already the premier expert for any form of asymmetrical warfare, and she served as amongst the Highest ranking generals in the United Nations Army. In 2056, she was deployed in Russia commanding a force of 2500, but was unable to prevent the collapse of the wider Democratic Council of Russia in Leningrad. During the Third Great War, Maja would be given command of the United Nations 5th Army, a highly diversified and mobile force that suited Maja's strengths. Although some had doubts on her ability to transition into massive, formal warfare, these doubts were quickly silenced when she would proceed to lead the 5th Army to countless dazzling victories over the course of the war, such as the famous Battle of Bremen, and would never suffer a tactical defeat over the course of her 56 battles in The Third Great War.`,
    'lina': `While Autistic Femcel Rizz is likely an over exaggeration on all fronts, her somewhat unconventional past left her (in her words) "undersocialized" and chronically online, mostly due to extensive homeschooling. One only needs to see the picture of her holding a katana like an anime character to piece this together. However, she has since risen past this awkward phase of her life, resolving to not be a weirdo, and over the course of 2023 to 2025 this seems to have been mostly accomplished. Her fashion sense is dramatically improved, and notably, she doesn't seem to fall back on the habit of cosplaying as Denji from Chainsawman anymore, throwing herself at the feet of other women. More importantly however, whereas she more strongly dedicated herself to the pursuit of career in the past, citing that she wouldn't feel at ease if she didn't put "pedal to the metal", she now recognizes the value of hobbies and taking some things easier, so that she can more fully enjoy all aspects of life. Once an ardent manga fan, she has since transitioned to an appreciation of digital media, in the form of photography, and dabbles in the world of "Soulslike" games. She has also begun developing a stronger appreciation of music, likely due to her association with the Golden Records club in UC Berkeley. It is still completely unclear as to why she takes several days to weeks to answer my texts, but at least she bought me McDonald's a few times so I can somewhat look past it.

She now has graduated from UC Berkeley in some kind of Biology adjacent major and is working a respectable job, all thanks to my extensive help in marking her as present in her classes so she wouldn't be graded down for attendance. She enjoys her life in the bay, where she still gets to meet her friends from Golden Records and hang out with her friends, while staying close to her mother. Did I mention she is also Wasian? Although she has yet to play this card game as of writing, I am sure it will one day happen...`,
    'united-nations-5th-army': `The most decorated and experienced Army in the entire United Nations Army, led under the famous general Maja Kaminska. The 5th Army is noteworthy for being a highly diversified and experienced force, capable of pivoting to different combat styles - over half of the units are consolidated from Kaminska's many foreign campaigns, such as the 12, 15th Iranian Engineers, the 3rd, 34th, 87th, 13th and 68th Mexican Light Infantry, the 3rd, and 5th Chinese Jian Guard, the 8th, 12th, and 2nd Brazilian Rifles, the 32nd, 28th, and 4th Indian Motorized Division, amongst many others. Masters of Kaminska's Doctrine, these units do not falter when their flanks are not strongly held; rather they feel at ease, knowing that victory is only more likely when their tactical flexibility is increased. At 5am, the 15th engineers could be digging trenches, and at 9am, they might be conducting an ambush from a nearby forested area having feigned abandonment of these trenches. Fighting under Kaminska's doctrine is often described as fighting with less so a defined rectangular or curved front line, but rather as a water puddle - the core is defined, but dramatic fluid protrusions are what define the boundaries of battle. Scholars have also speculated that the exceptional morale of the 5th Army, under Kaminska's legendary name, is what makes this battle doctrine possible, as less experienced units would be unable to maintain cohesion with such fluid battle style. In the same line of thinking, because this formation requires itself to be flexible, this army could never find itself as the anchor of the full Allied force by being positioned in the center of the front lines. Nevertheless, the 5th Army, throughout the course of the Third Great War, fought in over 50 battles, in 3 different campaigns, winning brilliant battles like the Battle of Bremen, The Battle of Poznan, and the Battle of Belgorod.`,
    'post-modernist-dylan': `A mysterious being with some divine ties, though it's unclear what his origins are. Oh wait, I do know - because I first drew him on a random piece of paper in High school and never thought about him again. Postmodernist Dylan is an utterly corrupted version of Dylan that in many ways, was quite opposite of his high school personality - Postmodernist Dylan is very keen on annihilating his enemies, reciting mantras of destruction, to the extent that it's the only thing he says. His power is great, though he comfortably still scales under more powerful universal deities like Bobby Jones, Cosmic GF, Juan Carlos, and such. He channels power from a corrupted Rubik's Cube, which is displayed behind him, and casts an enveloping aura that atomizes everything it touches - a prophecy states that Dylan will ascend to this powerful form when he has abandoned all his ties to Asian Girls, becoming a shell of himself. First he will become a simp, elevating then to the White Knight, before crashing and becoming the Master of SSRIs, but this is but a temporary transition. Eventually, hatred will consume the space in which he once loved asian girls with, and the Earth will tremble when the Postmodernist beast is born.`
  });
  function withDocumentExactBody(page){
    const body = DOCUMENT_EXACT_BODIES[page?.slug];
    if(!body) return page;
    const next = Object.assign({}, page, {body});
    if(page.slug === 'anicka-konvicka') {
      next.summary = 'Anicka is a distrustful orphan from Colombo whose sisterly bond with Kazumi pulls her into the Western Seas and the hidden world of Pacifica.';
    }
    return next;
  }
  function basePages(){ return BASE_CHARACTER_PAGES.concat(documentTwoPages()).map(normalizePage).filter(Boolean).map(withDocumentExactBody); }
  function mergeWithBase(pages){
    const docs = documentTwoPages().map(normalizePage).filter(Boolean).map(withDocumentExactBody);
    const map = new Map(BASE_CHARACTER_PAGES.map(normalizePage).filter(Boolean).map(page=>[page.id, page]));
    (Array.isArray(pages) ? pages : []).map(normalizePage).filter(Boolean).forEach(page=>map.set(page.id, page));
    docs.forEach(page=>map.set(page.id, page));
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
  function loreArchivePageState(pages, pageIndex){
    const list = Array.isArray(pages) ? pages : [];
    const totalPages = Math.max(1, Math.ceil(list.length / LORE_ARCHIVE_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(totalPages - 1, Number(pageIndex) || 0));
    const start = safePage * LORE_ARCHIVE_PAGE_SIZE;
    return {
      pageIndex:safePage,
      totalPages,
      items:list.slice(start, start + LORE_ARCHIVE_PAGE_SIZE)
    };
  }
  function renderLorePager(pageState, fnName){
    if(!pageState || pageState.totalPages <= 1) return '';
    const prevDisabled = pageState.pageIndex <= 0 ? ' disabled' : '';
    const nextDisabled = pageState.pageIndex >= pageState.totalPages - 1 ? ' disabled' : '';
    return `
      <div class="ch-lore-pager" aria-label="Character lore pages">
        <button class="btn sm" type="button" onclick="${fnName}(-1)"${prevDisabled}>Prev</button>
        <button class="btn sm" type="button" onclick="${fnName}(1)"${nextDisabled}>Next</button>
      </div>`;
  }
  function ensureLoreSeeded(){
    if(!lorePages.length) setPages([]);
  }
  function lorePageForCard(card){
    ensureLoreSeeded();
    if(!card) return null;
    const cardId = Number(card.id);
    const nameKey = slugify(card.name || card.title || '');
    const exactTitle = String(card.name || card.title || '').trim().toLowerCase();
    return lorePages.find(page=>page.type === ENTRY_TYPE && (
      (Number.isFinite(cardId) && String(page.pfpId || '') === String(cardId)) ||
      page.slug === nameKey ||
      String(page.title || '').trim().toLowerCase() === exactTitle
    )) || null;
  }
  function portraitFor(page){
    const pfpId = page.pfpId || pfpIdFromName(page.title);
    if(pfpId) return `pfp/pfp${pfpId}.png`;
    return page.heroImage || affById(page.section).img;
  }
  function paragraphHtml(text){
    return String(text || '').split(/\n{2,}/).map(part=>part.trim()).filter(Boolean).map(part=>`<p>${esc(part)}</p>`).join('');
  }
  function loreTaglineText(text){
    return String(text || '').trim().replace(/[.。]+$/g, '');
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
      'Place of Birth':firstFact(facts, ['Place of Birth', 'Place of birth', 'Place birth', 'Place ofbirth', 'Origin']),
      Story:firstFact(facts, ['Story']) || page.subtitle || '',
      Titles:firstFact(facts, ['Titles', 'Title']) || (page.slug === 'felicyta-janowicz' ? 'Jadwiga II' : (page.slug === 'maja-kaminska' ? 'High Marshall' : '')),
      Relationships:firstFact(facts, ['Relationships', 'Related To', 'Related'])
    };
  }
  function factRows(page){
    const facts = characterInfo(page);
    return DEFAULT_FACT_KEYS.map(key=>`<dt>${esc(key)}</dt><dd>${facts[key] ? esc(facts[key]) : ''}</dd>`).join('');
  }
  function renderCharacterCard(page, openFn){
    const aff = affById(page.section);
    const summary = page.summary || page.body || '';
    const mode = openFn || 'tab';
    return `
      <button class="ch-lore-character-card" type="button" data-lore-page-id="${esc(page.id)}" data-lore-open="${esc(mode)}" style="--lore-accent:${esc(aff.color)};">
        <span class="ch-lore-card-portrait"><img src="${esc(portraitFor(page))}" alt="" onerror="this.src='${esc(aff.img)}'"></span>
        <span class="ch-lore-card-copy">
          <span class="ch-lore-card-aff"><img src="${esc(aff.img)}" alt="">${esc(aff.title)}</span>
          <b>${esc(page.title)}</b>
          <small>${esc(summary).slice(0, 160)}</small>
        </span>
      </button>`;
  }
  function bindLoreCards(root, handler){
    if(!root || typeof handler !== 'function') return;
    root.querySelectorAll('.ch-lore-character-card[data-lore-page-id]').forEach(btn=>{
      btn.onclick = function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        if(typeof window.playSfx === 'function') window.playSfx('uiClick');
        else if(typeof playSfx === 'function') playSfx('uiClick');
        handler(btn.dataset.lorePageId || '');
      };
    });
  }
  function renderArchive(content){
    currentPageId = '';
    document.getElementById('s-challenger')?.classList.remove('ch-lore-reading');
    const pages = characterPages();
    const pageState = loreArchivePageState(pages, currentLoreArchivePage);
    currentLoreArchivePage = pageState.pageIndex;
    content.innerHTML = `
      <div class="ch-lore-shell ch-lore-archive-shell">
        <div class="ch-lore-command">
          <div>
            <div class="ch-lore-kicker">${esc(loreStatusText())}</div>
            <h2>Character Lore</h2>
            <p>Fandom-style dossiers for the people and legends of Fates Entwined.</p>
          </div>
          <div class="ch-lore-command-actions">
            ${renderLorePager(pageState, 'fateLoreArchivePage')}
          </div>
        </div>
        ${pages.length ? `<div class="ch-lore-character-grid">${pageState.items.map(renderCharacterCard).join('')}</div>` : `
          <div class="ch-lore-empty"><b>No lore entries yet</b><span>Published dossiers will appear here.</span></div>`}
      </div>`;
    bindLoreCards(content, id=>window.openLorePage(id));
  }
  function renderPage(content){
    const page = lorePages.find(p=>p.id === currentPageId);
    if(!page){ renderArchive(content); return; }
    document.getElementById('s-challenger')?.classList.add('ch-lore-reading');
    const aff = affById(page.section);
    content.innerHTML = `
      <div class="ch-lore-shell">
        <div class="ch-lore-page-top" style="--lore-accent:${esc(aff.color)};">
          <button class="btn sm" onclick="event.stopPropagation(); backToLoreArchive()">Back</button>
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
              <div><h3>${esc(page.title)}</h3><p>${esc(loreTaglineText(page.subtitle) || aff.title)}</p></div>
            </div>
            <dl>${factRows(page)}</dl>
          </aside>
          <article class="ch-lore-article">
            ${page.summary ? `<p class="ch-lore-summary">${esc(page.summary)}</p>` : ''}
            ${paragraphHtml(page.body || 'No article text yet.')}
            ${page.tags.length ? `<div class="ch-lore-tags">${page.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>` : ''}
            <p class="ch-lore-updated">Last Edited by Howard Liang</p>
          </article>
        </div>
      </div>`;
  }
  function rerenderLore(){
    const root = loreRoot();
    if(root) window.renderChLoreTab(root, {pageId:currentPageId});
  }
  function closeLoreWindow(){
    document.getElementById('fate-lore-window-overlay')?.remove();
    document.body?.classList.remove('fate-lore-window-open');
  }
  function resetLoreState(opts){
    const options = opts || {};
    currentPageId = '';
    closeLoreWindow();
    document.getElementById('s-challenger')?.classList.remove('ch-lore-reading');
    if(options.render === true) rerenderLore();
  }
  function loreWindowContent(){
    let overlay = document.getElementById('fate-lore-window-overlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'fate-lore-window-overlay';
      overlay.innerHTML = '<div class="fate-lore-window-backdrop"></div><section class="fate-lore-window" role="dialog" aria-modal="true" aria-label="Card lore"><div class="fate-lore-window-content"></div></section>';
      overlay.querySelector('.fate-lore-window-backdrop').onclick = closeLoreWindow;
      document.body.appendChild(overlay);
    }
    document.body?.classList.add('fate-lore-window-open');
    return overlay.querySelector('.fate-lore-window-content');
  }
  function renderLoreWindowArchive(){
    const content = loreWindowContent();
    const pages = characterPages();
    const pageState = loreArchivePageState(pages, currentLoreWindowArchivePage);
    currentLoreWindowArchivePage = pageState.pageIndex;
    content.innerHTML = `
      <div class="ch-lore-shell ch-lore-archive-shell">
        <div class="ch-lore-command">
          <div>
            <div class="ch-lore-kicker">${esc(loreStatusText())}</div>
            <h2>Character Lore</h2>
            <p>Fandom-style dossiers for the people and legends of Fates Entwined.</p>
          </div>
          <div class="ch-lore-command-actions">
            ${renderLorePager(pageState, 'fateLoreWindowArchivePage')}
            <button class="btn sm" onclick="closeLoreWindow()">Close</button>
          </div>
        </div>
        ${pages.length ? `<div class="ch-lore-character-grid">${pageState.items.map(page=>renderCharacterCard(page, 'window')).join('')}</div>` : `
          <div class="ch-lore-empty"><b>No lore entries yet</b><span>Published dossiers will appear here.</span></div>`}
      </div>`;
    bindLoreCards(content, id=>renderLoreWindowPage(id, {allowBack:true}));
  }
  function renderLoreWindowPage(id, opts){
    const options = opts || {};
    const allowBack = options.allowBack === true;
    const page = lorePages.find(p=>p.id === id);
    if(!page){ allowBack ? renderLoreWindowArchive() : closeLoreWindow(); return; }
    const content = loreWindowContent();
    const aff = affById(page.section);
    content.innerHTML = `
      <div class="ch-lore-shell">
        <div class="ch-lore-page-top" style="--lore-accent:${esc(aff.color)};">
          ${allowBack ? `<button class="btn sm" onclick="openLoreWindowList()">Back</button>` : `<span class="ch-lore-window-spacer" aria-hidden="true"></span>`}
          <div><div class="ch-lore-kicker">${esc(aff.title)}</div><h2>${esc(page.title)}</h2></div>
          <div class="ch-lore-page-actions">
            <button class="btn sm" onclick="closeLoreWindow()">Close</button>
          </div>
        </div>
        <div class="ch-lore-dossier" style="--lore-accent:${esc(aff.color)};">
          <aside class="ch-lore-infobox">
            <div class="ch-lore-info-img"><img src="${esc(portraitFor(page))}" alt="" onerror="this.src='${esc(aff.img)}'"></div>
            <div class="ch-lore-info-title">
              <img src="${esc(aff.img)}" alt="">
              <div><h3>${esc(page.title)}</h3><p>${esc(loreTaglineText(page.subtitle) || aff.title)}</p></div>
            </div>
            <dl>${factRows(page)}</dl>
          </aside>
          <article class="ch-lore-article">
            ${page.summary ? `<p class="ch-lore-summary">${esc(page.summary)}</p>` : ''}
            ${paragraphHtml(page.body || 'No article text yet.')}
            ${page.tags.length ? `<div class="ch-lore-tags">${page.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>` : ''}
            <p class="ch-lore-updated">Last Edited by Howard Liang</p>
          </article>
        </div>
      </div>`;
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
  window.backToLoreArchive = function(){
    if(typeof window.playSfx === 'function') window.playSfx('backBtn');
    else if(typeof playSfx === 'function') playSfx('backBtn');
    currentPageId = '';
    document.getElementById('s-challenger')?.classList.remove('ch-lore-reading');
    rerenderLore();
  };
  window.fateLoreArchivePage = function(delta){
    const pages = characterPages();
    const pageState = loreArchivePageState(pages, currentLoreArchivePage + (Number(delta) || 0));
    currentLoreArchivePage = pageState.pageIndex;
    rerenderLore();
  };
  window.fateLoreWindowArchivePage = function(delta){
    const pages = characterPages();
    const pageState = loreArchivePageState(pages, currentLoreWindowArchivePage + (Number(delta) || 0));
    currentLoreWindowArchivePage = pageState.pageIndex;
    renderLoreWindowArchive();
  };
  window.fateChallengerLoreBack = function(){
    if(!currentPageId) return false;
    window.backToLoreArchive();
    return true;
  };
  window.challengerBack = function(){
    if(window.fateChallengerLoreBack && window.fateChallengerLoreBack()) return;
    document.getElementById('s-challenger')?.classList.remove('ch-lore-reading');
    if(typeof window.showScreen === 'function') window.showScreen('s-title');
  };
  window.openLorePage = function(id){ currentPageId = id; rerenderLore(); };
  window.openLoreWindowPage = function(id){
    ensureLoreSeeded();
    renderLoreWindowPage(id, {allowBack:true});
  };
  window.openLoreWindowList = function(pageIndex){
    ensureLoreSeeded();
    if(Number.isFinite(Number(pageIndex))) currentLoreWindowArchivePage = Number(pageIndex) || 0;
    renderLoreWindowArchive();
  };
  window.closeLoreWindow = closeLoreWindow;
  window.fateResetChallengerLoreState = resetLoreState;
  window.hasCardLorePage = function(card){ return !!lorePageForCard(card); };
  window.openCardLoreFromInfo = function(card){
    const page = lorePageForCard(card);
    if(!page){ if(window.toast) toast('No lore page for this card yet'); return false; }
    if(typeof window.dismissCardInfoOverlay === 'function') window.dismissCardInfoOverlay();
    if(typeof window.closeModal === 'function') window.closeModal();
    else document.getElementById('modal')?.classList.remove('on');
    renderLoreWindowPage(page.id, {allowBack:false});
    return true;
  };
  window.openLoreEditor = function(id){ openEditor(id || ''); };
  window.openLoreSection = function(){ currentPageId = ''; currentLoreArchivePage = 0; rerenderLore(); };
  window.openLoreList = function(){ currentPageId = ''; currentLoreArchivePage = 0; rerenderLore(); };
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
