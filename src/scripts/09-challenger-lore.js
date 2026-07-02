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
  const PFP_ASSET_VERSION = '1783030000';
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
        body:'Jorge Alvarez was born in West Caribbea in 470 AC to simple farmers. He and his brother Santiago dreamed of becoming rich enough to escape their old life and move to Havano. That dream changed when Jorge discovered a new fruit, the Pina, and founded the West Caribbea Fruits Company.\n\nThe Pina became wildly popular. Jorge expanded from a small stand into the West Caribbea Trading Company, with shops across Havano. As he rose through society, he became aware of the cruelty of the Old Elite and resolved to bring them down. His brother, now a general for the Old Elite, exposed the plot and forced Jorge to flee.\n\nWashed ashore after an ambush, Jorge was rescued by Rivera and Rivera\'s daughter Sofia. Rivera\'s stories of hardship pushed Jorge toward El Viaje De Hombre Pina, a journey across Caribbea to understand the people. He was joined by Anne Stone, a brilliant organizer and revolutionary from a prestigious college in Havano.\n\nThe movement grew, survived the Santa Rosa massacre, and eventually became impossible for the Old Elite to contain. Jorge returned to Havano and delivered his famous El Sol Nunca se Pone en el Caribbea speech. His company seized control, expelled the Old Elite, and began rebuilding Caribbea through diplomacy, overwhelming economic power, and the West Caribbea Trading Company.\n\nThe revolution did not end every wound. Santiago Alvarez later attempted to request an audience with Jorge at Santa Rosa Beach, the site of Jorge\'s rise as a revolutionary leader. The brothers had diverged too far to reconcile, and frustration from the military, guerrilla attacks, and the old order\'s collapse deepened the rupture between them.\n\nOver the next 16 years, Jorge reinvested the company\'s wealth into ports, roads, countryside estates, and public works. The Treasure Ports became coastal paradises, the countryside grew bright and fertile again, and Caribbea\'s people wore ribbons as a sign of prosperity and freedom. Because of Jorge, the sun never sets in Caribbea.',
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
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'anne-stone', title:'Anne Stone', pfpId:'11',
        subtitle:'The Black Rose of the West Caribbea Trading Company.',
        summary:'Anne Stone grows from radical student organizer into Jorge Alvarez\'s chief diplomat, revolutionary strategist, and master of pressure behind the West Caribbea Trading Company.',
        body:'Anne Stone grew up in Havano as the daughter of relatively wealthy parents, with access to elite education and a prosperous childhood. Direct exposure to the Old Elite made her question their legitimacy from a young age, and at the University of Havano she began studying power, politics, and the lower classes of Caribbea.\n\nAfter reading an Old Age manuscript about organization without authority, Anne developed radical views and founded the Anaquistas on campus. Her group became popular through newspaper critiques, protests against the Old Elite, and political flyers across Havano. As Anne radicalized, she abandoned her studies and fled into Caribbea with other club members, where her brigade burned estates, bombed garrisons, sank warships, kidnapped police, and destroyed roads.\n\nWhen she heard of Jorge Alvarez\'s exile in 495 AC, Anne saw the chance to bring down the Old Elite through him. She joined Jorge and Rivera on El Viaje Del Hombre Pina, temporarily delegating command of her movement while helping villages and building support. When Jorge refused to turn the journey into open revolution, Anne quietly arranged sabotage and guerrilla attacks to prepare for the worst. The resulting military frustration helped lead to the Santa Rosa massacre, forcing Anne to recognize the gravity of her actions and commit herself to Jorge\'s peaceful protest strategy.\n\nAfter the Old Elite fell, Anne became head diplomat for the West Caribbea Trading Company. She represented the company in public, organized summits, negotiated with Old Elite remnants, drafted treaties, and used subtle political manipulation to make lopsided agreements possible. For the next 14 years she helped Jorge build Caribbea\'s prosperity, while reports from her sources in the Western Seas suggested an unknown civilization beyond Caribbea that could change the company\'s future.',
        facts:{Affiliation:'The West Caribbea Trading Company, The Pina Revolution, Havano University, Anarchists of Havano', 'Date of birth':'474 AC', 'Place of Birth':'Havano', Story:'El Viaje Del Hombre Pina; To Eventide', Titles:'The Black Rose, Chief Diplomat of the West Caribbea Trading Company', Relationships:'Jorge Alvarez, Rivera'},
        tags:['Black Rose', 'Havano', 'Caribbea']
      },
      {
        section:'expanded-worlds', type:ENTRY_TYPE, slug:'makenna', title:'Makenna', pfpId:'12',
        subtitle:'Protector of bird-kind and tyrant of Costa Rica.',
        summary:'Makenna Parker begins as a homesick girl in Costa Rica, then becomes the violent head of MINAE and the Bird Cult before Juan Carlos ends her rule.',
        body:'Makenna Parker moves from Michigan to Costa Rica with her father, Dr. Parker, an ecologist who studies birds. She is unhappy about leaving behind her friends, her horse Bender, and memories of her late mother, but slowly adjusts to rural life after meeting Cecilio, Margarita, and Ines. She helps care for birds at the ranch and begins to feel at home.\n\nHer first adventure exposes an illegal bird-trafficking ring. With her friends and her father\'s knowledge of local wildlife, Makenna gathers clues, confronts the smugglers, rescues the stolen birds, and gains confidence in Costa Rica. Later, as an intern at MINAE, she sees the constant bird theft plaguing the country and becomes enraged by shallow official responses.\n\nMakenna takes matters into her own hands by tracking down bird robbers and killing them in broad daylight in San Jose. Public sympathy for her cause turns her murder trial into a political crisis. Protesters free her from prison, the army refuses to return her to jail, and she marches on the Legislative Assembly, dissolving the government and declaring herself Dictator of all Bird Kind.\n\nShe establishes the Bird Cult of Costa Rica, worshipping her first bird Mimi as a god, and grants MINAE effective control of the military. Its death squads execute bird robbers, careless campers, litterers, tourists, and factory owners. Makenna codifies her dictatorship through the 17 Points, until Juan Carlos leads a counter-revolution from 2030 to 2031 and ends her reign with a cannonball.',
        facts:{Affiliation:'The Bird Cult of Costa Rica, MINAE', 'Date of birth':'2014', 'Place of Birth':'Michigan, United States', Story:'Expanded Worlds', Titles:'Protector of Bird-King, Demagogue of all Avians, Chancellor of Costa Rica, Head Supervisor of MINAE, Dictator of all Bird Kind', Relationships:'Juan Carlos'},
        tags:['MINAE', 'Costa Rica', 'Bird Cult']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'johnathan-kirby', title:'Johnathan Kirby', pfpId:'13',
        subtitle:'Prime Minister of Australia and drafter of the Christmas Day Charter.',
        summary:'Johnathan Kirby rises from unusual family circumstances to become Australia\'s prime minister and unite the Commonwealth armies before the Third Great War.',
        body:'Johnathan Kirby was born in Irvine in 2024 under unfortunate circumstances, tied to one of Dylan Kirby\'s many relationships. His single mother could not support him, so another of Dylan\'s partners helped raise him alongside Marie L\'amboure. Dylan\'s surrogate mother was wealthy enough that Johnathan grew up in a large mansion on the coast of Santa Barbara, close to his half sister Marie.\n\nAt the University of Melbourne, Johnathan studied international relations and earned strong marks. He began working for the Australian Labor Party as an assistant and became a household name after the public learned he was related to American senator Dylan Kirby, whose many affairs had produced a sprawling family.\n\nJohnathan entered government at a moment of rising world tension and became Prime Minister of Australia in 2050. He advocated strong defensive policies that appealed across Australia and the wider British Commonwealth. He then drafted the Christmas Day Charter, coordinating and uniting the armies of the Commonwealth under the banner of the United Kingdom.\n\nOn December 25, 2051, Johnathan gave a famous speech in London celebrating the charter\'s signing before world representatives and the king of England. The moment was remembered as one final alliance before the end. Soon after, Johnathan visited Santa Barbara and reminisced with Marie before the Third Great War began on January 16, 2052.',
        facts:{Affiliation:'Australia, The Commonwealth of Nations, The Free World', 'Date of birth':'2024', 'Place of Birth':'Irvine, United States', Story:'The Third Great War and Events Preceding', Titles:'Prime Minister of Australia, Drafter of the Christmas Day Charter', Relationships:'Marie L\'amboure, Dylan Kirby'},
        tags:['Australia', 'Christmas Day Charter', 'Commonwealth']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'alondra-hopkins', title:'Alondra Hopkins', pfpId:'14',
        subtitle:'The Pirate Queen of Panacea and the child of war.',
        summary:'Alondra Hopkins is raised by the Scarlet Legion as a prodigy of violence, overthrows it from within, and becomes the guardian who holds Pacifica together.',
        body:'Alondra Hopkins was raised by the Scarlet Legion, a mercenary group that treated combat as the highest form of art. Her youth was spent learning technique, ideology, and the mindset of a fighter. She was prodigious, but the Legion\'s love of battle never truly satisfied her; she continued because she lacked any other purpose.\n\nBy age eight, Alondra surpassed most adult fighters. The Scarlet Legion poured its best resources into her training, and at age 12 she was deployed to Bluerocks Beach, where she defeated 18 opponents and delivered their heads to her commander. Within a year she had accumulated 286 kills and earned the name Child of War. For the next five years, formations fled rather than face her, and many believed she should become the next patriarch of the Legion.\n\nThe plots against her never succeeded. Instead, Alondra grew horrified by the killing she inflicted and the broken families the Legion left behind. In 494 AC, she entered the Legion stronghold on Farron Island, single-handedly dispatched its defenders, decapitated the patriarch, claimed the throne, and ordered the Legion to gather before her.\n\nRather than continue the Legion, Alondra announced its dissolution. She defeated those who resisted and scattered the rest across Pacifica. Remnants loyal to the old ideals survived as the Oathbound Fighters, but Alondra chose another path.\n\nFrom then on, she worked to right the wrongs she had committed. She traveled across Pacifica ending conflicts, forcing factions to make peace, liberating captured cities, and scattering hostile pirates. In 502 AC, Alondra became Pirate Queen of Panacea, the capital of Pacifica. Her presence on the Council of Pirates guaranteed that the major factions of Pacifica remained at peace for as long as she lived.',
        facts:{Affiliation:'The Pirate Council of Pacifica, Panacea, and The Scarlet Legion', 'Date of birth':'478 AC', 'Place of Birth':'Farron Island, Pacifica', Story:'To Eventide', Titles:'The Pirate Queen of Panacea, The Scarlet Spear, The Strongest, The Child of War, The Guardian of Pacifica, The Hero of Pacifica', Relationships:'None'},
        tags:['Panacea', 'Scarlet Legion', 'Oathbound Fighters']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'zsofia-szocs', title:'Zsofia Szocs', pfpId:'15',
        subtitle:'Twin monarch of Hungary and administrator of a restored kingdom.',
        summary:'Zsofia Szocs rises from the Janowicz household to become one of Hungary\'s twin monarchs, building defenses and carrying the nation in exile.',
        body:'Zsofia and Rozsi Szocs were adopted from a Prague orphanage into the Janowicz household and educated for a future Sebastyen Janowicz had already designed. Zsofia eventually became one of the twin monarchs of Hungary, acting as the administrator while Rozsi served as the stronger figurehead.',
        facts:{Affiliation:'The Kingdom of Greater Hungary, The Free World, Eotvos Lorand University, Visegrad', 'Date of birth':'August 12, 2008', 'Place of Birth':'Budapest, Hungary', Story:'The Third Great War and Events Preceding', Titles:'The Queen of Hungary, The Twin Monarchs of Hungary', Relationships:'Rozsi Szocs, Felicyta Janowicz, Kvetka Svoboda'},
        tags:['Hungary', 'Twin Monarchs', 'Visegrad']
      },
      {
        section:'expanded-worlds', type:ENTRY_TYPE, slug:'minae-death-squad', title:'MINAE Death Squad', pfpId:'16',
        subtitle:'The paramilitary fist of Makenna\'s Bird Cult.',
        summary:'The MINAE Death Squads are Makenna\'s fanatical environmental paramilitaries, built from Costa Rica\'s dissolved army and unleashed against poachers, dissenters, and civilians.',
        body:'When Makenna took Costa Rica, she transformed MINAE from an environmental ministry into the armed religious machine of the Bird Cult. The Death Squads became infamous for raids, executions, and the Night of Purification before Juan Carlos\' revolution broke them.',
        facts:{Affiliation:'MINAE, The Bird Cult of Costa Rica', 'Date of birth':'None', 'Place of Birth':'None', Story:'Expanded Worlds', Titles:'The Death Squads', Relationships:'Makenna, Juan Carlos'},
        tags:['MINAE', 'Death Squads', 'Bird Cult']
      },
      {
        section:'expanded-worlds', type:ENTRY_TYPE, slug:'carolyn', title:'Carolyn', pfpId:'17',
        subtitle:'Berkeley probability disaster and reluctant defender of Unit 1.',
        summary:'Carolyn cracks the Berkeley seal, unlocks the World of Weird, and discovers powers that make all probabilities around her equalized.',
        body:'Carolyn arrived at UC Berkeley as a shy, intensely online student who preferred games and optimization to social life. After she cracked the Berkeley seal, the World of Weird leaked out and gave her probability-warping powers she was not ready to use.',
        facts:{Affiliation:'UC Berkeley', 'Date of birth':'July 23, 2008', 'Place of Birth':'Milpitas, CA', Story:'Berkeley Time', Titles:'None', Relationships:'Lydia'},
        tags:['UC Berkeley', 'World of Weird', 'Lydia']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'1st-us-marines', title:'1st US Marines', pfpId:'18',
        subtitle:'Elite marine shock troops of the Third Great War.',
        summary:'The 1st US Marines specialize in rapid beachheads, close-range Byron Shotgun assaults, and devastating breakthroughs across Canada, Germany, and the Pacific.',
        body:'The 1st US Marines are the most elite marine regiment in the United States military, trained to make beachheads and breakthroughs immediately after landing. Their Byron Shotguns and speed made them decisive in Stuart\'s Island, Kimsquit, Vladivostok, and later Pacific operations.',
        facts:{Affiliation:'The United States of America, The Free World', 'Date of birth':'None', 'Place of Birth':'None', Story:'The Third Great War and Events Preceding', Titles:'None', Relationships:'None'},
        tags:['US Marines', 'Byron Shotgun', 'Third Great War']
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

Jorge's company seized control of Havano, expelling the Old Elite, and continued his domination of all of Caribbea through diplomacy and his overwhelming economic power. The revolution did not resolve every wound. Santiago Alvarez later attempted to request an audience with Jorge at Santa Rosa Beach, the site of Jorge's rise as a revolutionary leader, but the brothers had diverged too strongly to see eye to eye. Stalled negotiations, frustration from the military, and guerrilla attacks from the old order deepened the rupture between them.

Under The West Caribbea Trading Company, over the course of the next 16 years, Jorge effectively seized control over all of Caribbea, initiating massive development projects in which every last drop of money profited was reinvested into the city and land, which eventually created a prosperous society in all segments of life. The countryside of Caribbea, paved by cobbled roads and large estates, were anchored by his famous "Treasure Ports," large port cities with immense wealth and beautiful architecture, places where people would describe as a coastal paradise. Although Old Elite guerillas still remained in the far, remote jungle, the last bastion of Old Elite power crumbled in the year 510 AC, when the small region of Santa Clarita in the south was signed away to the Company. However, far by this point, Caribbea had already been transformed completely. The men and women of the treasure ports wear ribbons in their everyday clothing, signalling their newfound freedom and prosperity. The seas, blue and bright as the banner of West Caribbea, promise a future of continued hope and good fortune. The countryside, once gloomy and bare, springs to life with bright vegetation and unpolluted rivers, ferrying goods to all corners of Caribbea. Because of Jorge, "The Sun Never Sets in Caribbea."`
  };
  Object.assign(DOCUMENT_EXACT_BODIES, {
    'anne-stone': `Anne Stone grew up in Havano as the daughter of relatively wealthy parents, who were able to afford her an elite education and a prosperous environment to grow up in. However, being exposed directly to the actions of the Old Elite, Anne had from a very young age begun to question the legitimacy of their power, as she sympathized with the struggles of the lower class in Caribbea. At the age of 18, she attended the most prestigious college in all of Caribbea, The University of Havano, and it was there she began her study of power and politics.

During her time in university she developed very radical views, especially after reading an old manuscript from the Old Age that detailed an ideology that featured organization without authority. She started a group on campus called the "Anaquistas" advocating for this new ideology, becoming very popular over the course of a year. Her group published scathing critiques in the school newspaper, protested the Old Elite hierarchy, and distributed political flyers around Havano.

Anne Stone continued to become more and more radicalized over time, eventually deciding to abandon her studies to pursue a path of violent revolution to combat the Old Elite. She fled to Caribbea, along with sixteen other club members, and it is from Caribbea in which Anne would begin to conduct acts of sabotage, burning down estates, bombing military garrisons, sinking warships, kidnapping police, and destroying roads. Anne's actions became popular with the peasantry of Caribbea, and they would frequently assist Anne and her brigade with housing, food, and medicine. Many even pledged to join her cause, and by the end of the year 494 AC, her movement had accumulated two hundred members.

However, hearing of Jorge Alvarez's exile in Caribbea in 495, Anne saw the potential through Jorge to finally bring down the Old Elite, and decided to join him on his El Viaje Del Hombre Pina, delegating command of her Anaquista movement temporarily. Throughout the course of the year, Jorge, Anne, and Rivera would go from village to village in Caribbea, helping to the best of their abilities. Eventually, when Jorge's journey began to grow in popularity, Anne invited Jorge to join her movement, stating it was the best shot they had at overthrowing the Old Elite. Jorge declined this proposal, wanting to continue his current path.

Anne relented at the time, but secretly began arranging operations behind his back to increase sabotage activities and to prepare for the worst case scenario. Eventually, when the Old Elite military was deployed under Santiago Alvarez, Anne initiated her sabotage plans and guerilla attacks, inflicting many casualties on the army. This caused the army to grow frustrated, leading to the infamous massacre at Santa Rosa Beach. It was at this point that Anne had realized the gravity of her mistakes, and decided to commit herself to the path of peaceful protests as Jorge had advocated for. Together with Jorge and Rivera, they persevered over the course of the next year and eventually were able to overthrow the Old Elite, resulting in the creation of a new Caribbea under Jorge Alvarez.

From this point onwards Anne was formally employed under Jorge's West Caribbea Trading Company, acting as the head diplomat of his operations. She was the face of public relations, organized diplomatic summits between the West Caribbea Trading Company and remnants of the Old Elite, and drafted treaties and agreements. However she also played a more subtle role behind the scenes. She was also a master of political manipulation, playing a sleight hand in a variety of covert operations. She often found ways to convince people to do things they did not want to do, undermine the economic output of an entire region through strategic embargos and shifts in trade agreements, and found ways to sway public opinion in a way that undermined the power of local governments under the Old Elite.

Many lay observers noticed that agreements between the West Caribbea Trading Company and remnants of the Old Elite took the form of fairly lopsided deals that often involved cession of land, but it was all thanks to Anne's secret operations which made such a deal the only option for these regional elites. Over the next 14 years Anne would help Jorge build up the prosperity of the West Caribbea Trading Company, acting as his trusted aide alongside Rivera. However, information brought to her by her sources from around Caribbea pointed at the possibility of the existence of an entire civilization out in the Western Seas, which would be dramatically consequential for the future of the West Caribbea Trading Company. Already, Anne has begun probing and speculating on potential actions and preparations should such a civilization actually exist...`,
    'makenna': `Makenna Parker is a fifteen-year-old girl who moves from Michigan to Costa Rica with her father, Dr. Parker, an ecologist who studies birds. Makenna is unhappy about leaving behind her friends, her horse Bender, and the memories of her late mother, who died in a car accident several years earlier. At first, she struggles to adjust to her new home on a rural ranch, where she meets Cecilio, the ranch's security guard, Margarita, and Margarita's daughter, Ines. Although she misses her old life, Makenna gradually becomes more comfortable as she learns about Costa Rica and helps care for the birds at the ranch.

As Makenna settles into her new surroundings, she begins to notice strange events involving the birds. She discovers that a group of criminals is secretly capturing and stealing valuable birds to sell on the illegal wildlife market. With the help of her new friends and her father's knowledge of the local wildlife, Makenna starts gathering clues about the people responsible. The deeper she investigates, the more dangerous the situation becomes, as the smugglers realize someone may be uncovering their operation.

Eventually, Makenna and her allies expose the illegal bird-trafficking ring and help bring the criminals to justice. The stolen birds are rescued and returned to safety, protecting the wildlife that Dr. Parker has worked so hard to preserve. After everything she experiences, Makenna begins to feel at home in Costa Rica and develops close friendships with the people she has met there. By the end of the story, she has accepted her new life and looks toward the future with much greater confidence and hope.

However this was only the beginning of Makenna's story. She later on would become an intern at MINAE (Ministry of the Environment and Energy), where she would witness the constant bird thievery that plagued Costa Rica, observing first hand that MINAE resorted to shallow words rather than decisive action. Outraged by the lack of progress on MINAE's part, Makenna decided to take matters into her own hands one day by tracking down a group of bird robbers and gunning them down in broad daylight on the streets of San Jose. This story made national headlines, and Makenna was due to be put on national trial as her actions constituted first degree murder.

However a large portion of the population sympathized with Makenna's cause and thought her actions were reasonable, and one day a large mob of thousands of protesters marched upon the city prison and personally freed her. The army was called upon to put down this protest to send Makenna back into jail, but after meeting fierce resistance and being convinced by Makenna's rhetoric, the army laid down their arms and pledged loyalty to Makenna instead. With her newfound power, Makenna recognized that she now had the capabilities to make change herself, and so she marched her army upon the Legislative Assembly, dissolving the government and declaring herself as The Dictator of all Bird Kind.

At this point, in the year 2030, Makenna would go to work and establish the Bird Cult of Costa Rica, a religious organization that worshipped Mimi, Makenna's first bird, as a god. MINAE was granted effective control of the Costa Rican military, and became a violent paramilitary organization which mercilessly executed anyone who would cause harm to the environment. The MINAE "Death Squads" became infamous for having killed hundreds of individuals, not just bird robbers but also careless campers, tourists, litterers, and factory owners. Makenna solidified her dictatorship with the 17 Points, which mentions but is not limited to complete subjugation to avian-kind, the inherent superiority of birds, the divinity of Costa Rica's natural environment, and the pledge of one's entire existence to Makenna's personality cult.

However, Makenna's reign was challenged by Juan Carlos, the robo en la noche who started it all, as it turns out he was a galaxy level being whose power could not be matched by the Death Squads. From the years 2031-2032, Juan Carlos organized his own counter revolution, using his impeccable abs and long, golden hair to draw many to his cause. Eventually Makenna's tyrannical reign came to an end when a cannonball blasted a hole clean through her stomach.`,
    'johnathan-kirby': `Jonathan Kirby was born to unfortunate circumstances in Irvine as a product of one of Dylan Kirby's, future president of the United States of America, many relations during this time, in the back alley of a Taco Bell. Jonathan's single mother was unable to support him, and after some research she found another one of Dylan's romantic partners and she offered to help raise Johnathan alongside another one of Dylan's children, Marie L'amboure. Dylan's surrogate mother was quite wealthy and as a result he was able to grow up in a fairly large mansion on the coast of Santa Barbara. He lived a good life despite his absent father, growing close to his half sister Marie as they would often play on the beach after school, collecting seashells and playing in the water as sunset fell.

For college Jonathan found himself in the University of Melbourne, where he studied international relations and achieved strong marks during this time. He began work in government for the Australian Labor Party as an assistant, and eventually was propelled to household notability when it was revealed that he was related to American senator Dylan Kirby, who had become infamous during this time for his countless affairs across decades, resulting in 17 children.

Jonathan Kirby continued his good work and eventually became the Prime Minister for the Australian Labor Party in the year 2050. Jonathan became notable for recognizing the concerning pattern of world tension throughout the decade, and advocated for strong defensive policies which were popular amongst not just the people of Australia but the entirety of the British Commonwealth. Hence Johnathan began drafting a famous document which would become known as the "Christmas Day Charter," in which would effectively coordinate and unite all of the armies of the Commonwealth back under the banner of the United Kingdom.

On December 25th, 2051, he gave a famous speech in London which celebrated the final signing of this document, in the presence of not only representatives, presidents and prime ministers from all of the Commonwealth Nations around the world, but also before the king of England himself. It was considered to be one of the most monumental days in all of the history of the United Kingdom and The Commonwealth of Nations, effectively perceived as one final alliance before the end. Celebrations were brief, as Jonathan Kirby visited his hometown Santa Barbara one last time with his sister Marie L'amboure, reminiscing about their past childhood, before the onset of the Third Great War on January 16th, 2052.`,
    'alondra-hopkins': `For as long as Alondra could remember, she was raised to be a warrior by the Scarlet Legion, a mercenary group who revelled in the joy of battle. This group cared little for coin, as they treated combat as the utmost expression of art, taking pride in their unmatched skill and prowess and the cruel violence of war. The entirety of her youth was spent on the art of killing, learning not only technique but also the ideology and mindset of a fighter. While Alondra was clearly prodigious in the art of combat, the ideology itself fell flat - Alondra would describe that she did not enjoy battle in the same way as the rest of her comrades did, but continued on this path anyways because she lacked any other purpose in life.

Already by the age of eight, Alondra was superior in skill to most adult fighters, her blistering speed creating openings before her opponents could even react. Individuals in her age group were not even worth a consideration at this point, as they were astronomically below Alondra's combat abilities. Recognizing her immense talent, the Scarlet Legion specially trained her with the full extent of their best resources, dedicating their best fighters to privately maximize her abilities, and already at the age of 12 she was deployed to her first battle, at Bluerocks Beach. It was here that she immediately began her campaign of onslaught, defeating 18 opponents and bringing their heads to her lead commander. From this point onwards she would be deployed at any given opportunity possible, accumulating 286 kills by the end of the year. Already many in Pacifica feared her abilities and from this young age she was given the name the "Child of War."

For the next 5 years she would continue to campaign all over Pacifica, eventually reaching a point where she had full autonomy of where she chose to fight in battle. She would often single-handedly wipe out entire formations by herself, blitzing and decapitating men within seconds. After her second year campaigning, entire formations would rather choose to run away than face her head on. Her name commanded such a tremendous amount of fear and respect that even the Legion themselves were unsure of how to plan for the future. Many within the ranks of the Legion already presupposed Alondra should become the next Patriarch of the Legion, despite the fact a woman never became the Patriarch before. However, many within the ranks of Scarlet Legion feared the potential power she would wield, and had already begun plotting potential methods of assassination.

However these plots would never come to pass, as throughout the course of the past 4 years Alondra had begun to develop doubts about her current path. She had grown to hate the killing she was inflicting on seemingly innocent individuals, and had become thoroughly affected by the lives she had taken. She witnessed families being broken, children left without their parents, and lives ruined because of the Scarlet Legion. Although she had never expressed it outwardly, Alondra had already made the determination to repent.

In the year 494 AC, Alondra arrived at the capital stronghold of the Scarlet Legion on Farron Island, a tall imposing fortress meant to ward away invading fleets and hundreds of men. Alondra entered the keep and single-handedly dispatched the entire stronghold, killing dozens of Scarlet Legion soldiers and eventually decapitating the Patriarch herself. She claimed the throne of the Scarlet Legion and dispatched an order, demanding that the entire Legion obey her will. Despite the betrayal, none dared to resist her, and so when she called upon the entire Legion to rendezvous at the island in order to be given direct orders, all came to pay their respects.

However it was during this time that Alondra revealed her intention to disband the entire Legion, and although some would try to resist, Alondra quickly dispatched of these individuals. The rest of the Legion obeyed her orders and scattered across all corners of Pacifica, and from this point onwards although the Scarlet Legion would no longer exist, remnants still loyal to the old idea of Scarlet Legion continued on as a separate group known as the Oathbound Fighters.

From this point onwards Alondra resolved to right the wrongs she had committed in her life, and decided to fight for the side of the people. Her reputation of being feared was quickly turned into that of wide admiration, as she traveled across all of Pacifica ending conflicts, singlehandedly forcing factions to make peace, liberating captured cities, and scattering hostile pirates. In the year 502 AC, Alondra would become the Pirate Queen of Panacea, the capital of all of Pacifica, and her presence alone on the Council of Pirates guaranteed that all the major factions of Pacifica remained at peace for as long as she lived.`,
    'zsofia-szocs': `Zsofia and her brother Rozsi were orphaned from a very young age and transferred to an orphanage in Prague, where they spent the first five years of their life. One day, a man by the name of Sebastyen Janowicz desired to adopt the two siblings together, although he had barely interacted with them. Strangely enough this request was accepted, and both Zsofia and Rozsi moved to the small mountain town of Wodny Potok, nestled within the Carpathian Mountains in Poland.

There Zsofia would spend the rest of their childhood in this town, with not only Rozsi but also Kvetka Svoboda, a girl who came from the same orphanage, and Felicyta Janowicz, the biological daughter of Sebastyen. The four of them were given a world class education by the top tutors around the world, spending several hours a day of focused studying. Although the reasons for this level of education were initially unknown, it was revealed to Zsofia at the age of 12 that she and Rozsi were the long lost descendants of Matthias I, one of the greatest figures in all of Hungarian history. Sebastyen intended to use her lineage as a means to eventually propel her into becoming the monarch of Hungary, alongside her brother Rozsi.

Although Zsofia initially opposed this arrangement, alongside the rest of her siblings excluding Felicyta, they ultimately still loved life in Wodny Potok and did not want to leave. Whenever they had a respite from studying, Zsofia would often go to Krakow with Kvetka and Rozsi, spending an extravagant amount of money on clothing, jewelry and other similar items. Life in Wodny Potok was by no means poor in the traditional sense either, as although it was uneventful, this was buffered by the fact that their private chef, Wojciech, was an excellent cook and prepared delicious feasts every single day and told unbelievable stories from his time in the military. On chilly winter evenings, the Janowicz family would sit by a roaring fireplace and roast chestnuts, play board games and watch cozy Christmas movies.

For college, Zsofia would attend Eotvos Lorand University with Rozsi, where she excelled and participated in a wealth of extracurricular and curricular activities in politics, acting as a speaker at large conferences, making impactful research papers, and speaking at a United Nations summit in New York, all arranged by Sebastyen. Shortly after she graduated, Sebastyen was able to pull further strings and grant both Zsofia and Rozsi fast tracked positions to become parliamentary assistants to a member of parliament, and behind the scenes began to arrange for their eventual ascension as full parliament members.

Given the political climate that Sebastyen had meticulously devised for the last twenty five years, in 2035, Hungary was by this point primed for a monarchist revival which longed for a return to historical roots. Media campaigns focused on the achievements that the Kingdom of Hungary had procured in the past, and pointed to the failing democratic apparatus of Hungary, how it was clear indication that the ascension of an authoritarian leader is the will of the Hungarian people. Rozsi and Zsofia were both propelled to national fame when stories of their childhood and college achievements reached the public eye, and this was further exacerbated when it was learned that they were the direct descendants of Matthias I. This realization all but solidified their status as national icons, and by the year 2038, when it was clear that the democratic apparatus was about to fail, Rozsi and Zsofia were advocated by the Hungarian people to take the reins of the failing state and restore The Kingdom of Hungary.

In 2039, Rozsi and Zsofia were crowned as the twin monarchs of Hungary, and their reign for the next decade was characterized by strong domestic reform. While Rozsi was the better speaker and more so the figurehead, Zsofia acted as the administrator. However, they were well aware of the political climate, particularly in neighboring Russia and Yugoslavia, and opted for a high focus on national defense. The two of them would often collaborate on the best path forward, and constantly shared ideas with one another. The army was expanded, propelled by propaganda that glorified the Hungary of medieval history, and the standing manpower of Hungary increased from 70k to 300k. Defensive fortifications were constructed from Lake Balaton along the length of the Danube, and the expanded war industry found themselves well behind this line of defense. This drew some critiques from the populace, as it seemed most development was going to the north western portion of Hungary, but this was buried by the overall economic growth in all sectors of the economy nevertheless.

However, Zsofia's issues were not only in the realm of government. Zsofia also found herself at odds with Felicyta, now the Queen of Poland, due to her expansion of the military. At an informal picnic along the Danube in 2044, the two of them discussed the future of their countries. The siblings could not see eye to eye, as Felicyta thought Zsofia was making the political situation worse in Europe by resorting to the building up of arms. Zsofia insisted that it was in the best interest of the Hungarian people, but Felicyta thought she was dooming her people, as they could not realistically hold against both Russia and Yugoslavia. It was at this time that Felicyta revealed she was planning on surrendering immediately if war did start, which Zsofia vehemently disagreed with. Citing feelings of betrayal, Zsofia left the conversation immediately. The two siblings, although they would be present together for many conferences for years to come, continued these debates even into the Third Great War.

At the outbreak of the Third Great War, the defenses that Hungary had built up did play a role - the Comintern advance was stemmed, but Hungary fell regardless on the 14th of April, 2052. The Hungarian government became a government in exile, ruling from London. Zsofia at this time lost her composure somewhat, as she felt she had not done enough for her people, and was visibly stressed. Her brother helped guide her through these times, and the twin monarchs successfully maintained the spirit of the Hungarian nation, often seen interacting with soldiers of the Hungarian Army before deployment. Zsofia would continue the rule of her country from London until the liberation of Budapest in early 2054.`,
    'minae-death-squad': `When Makenna took control of Costa Rica in 2030, and declared it to be a Fascist State, one of her first reforms was to ensure that MINAE (Ministry of the Environment and Energy) no longer exhibited the same soft rhetoric that it used to when it came to preventing criminals which would harm the environment. Immediately, she dissolved the Costa Rican military and transferred its assets to MINAE, then initiated mandatory religious reform upon MINAE, following the tenets of her Bird Cult. Fanatical ministers became platoon leaders, and former soldiers of the army were integrated into MINAE, and soon enough MINAE became a deadly paramilitary force that operated on a fanatical religious doctrine, treating the environment as a sacred entity.

In an effort to prove their worth, and masked as a religious cleansing, MINAE was deployed all around Costa Rica to hunt down bird robbers. They were granted full legal immunity for their killings, and were encouraged to kill as many bird robbers as humanly possible. Over the course of 2030, the MINAE "Death Squads" became famous for conducting night raids and patrols, gunning down anyone they saw to be poaching wildlife. Bird poachers in particular, in line with the Bird Cult religious doctrine, were to be tortured before being executed. In the doctrine of the Bird Cult, the killing of poachers was seen as the most morally righteous action one could take, as it proved to the utmost extent that "Avian-kind was above all," even human lives.

Eventually, when it became clear that all of the wildlife poachers had either fled or been killed off, the MINAE Death Squads expanded the nature of their hunt to execute anyone seen harming wildlife in general, such as careless campers, tourists, litterers, and factory owners. Videos circulated online of MINAE Death Squads hiding around street corners, waiting for someone to drop a cup of coffee, then rushing out and brutally executing the "criminal" in broad daylight.

Eventually Makenna's Bird Cult grew vastly unpopular in Costa Rica, and consequently the Death Squads had to combat the populace too. The Death Squads were responsible for brutal killings of anyone seen defying the Bird Cult, such as protestors and common civilians, and on one controversial day on November 24th, 2030, called "The Night of Purification," hundreds of Death Squads swept the streets of San Jose, barging into homes, and executing anyone suspected of being a counter revolutionary.

In 2031, tensions reached a breaking point, and a popular revolution led under a man by the name of Juan Carlos began, which ultimately led to the fall of the Death Squads. For an unknown reason, many in the MINAE Death Squads spontaneously defected to the revolutionaries, crippling their manpower, and over time this led to the Death Squads being driven back. When Makenna was killed in 2032, the MINAE Death Squads put down their arms and surrendered, as by this point the delusion of the Bird Cult had worn off after months of Civil War and bloodshed.`,
    'carolyn': `Throughout her entire life, Carolyn was shy, and kind of a weirdo. She kept her head down and focused on her studies, while enjoying hobbies such as watching streamers, playing video games like Genshin Impact and Hoi4. She was a huge number cruncher, always finding the best way to optimize a build through hours of experimentation and calculation, often posting her findings on Reddit. She despised hanging out with other people, as she thought they were shallow and too extroverted to talk to. However, she has a deep love of sweet drinks, and claims to drink more soft drinks than water.

In 2026 when she got into UC Berkeley, she met her Unit 1 roommate, Lydia, during Golden Bear orientation. It was here that she accidentally not only stepped on, but cracked the Berkeley seal after dropping a matcha latte on it. As it turns out, the superstition of the Berkeley Seal, that you would not get a 4.0 GPA if you stepped on it, was true, albeit in a roundabout way - stepping on the seal unlocks "The World of Weird," subjecting oneself to talking dining hall cookies, apparitions of Karl Marx, legions of undead hippies, and giant crayfish from Strawberry Creek. How could one possibly get a 4.0 when an apparition of Pol Pot is breathing over your shoulder during a CS61B exam?

However, with the seal cracked, the "World of Weird" leaked uncontrollably into the environment, and Carolyn, alongside Lydia, manifested random powers after watching their GBO leader get beheaded by a giant crayfish. Carolyn and Lydia were saved by a strange man who called himself Billy, known to the people of Berkeley as the "X man in front of Sather Gate," and Billy taught Carolyn the true nature of her powers - that she could manipulate the space around her to cause all probabilities to become equalized, meaning that anything can and will occur around her. A fire hydrant might turn into a giant balloon elephant and then explode, or a nearby car might start singing, blasting radioactive waves through its asshole.

However, Billy emphasized that with the seal broken, it is unclear if he could continue to protect Berkeley any longer, and that Carolyn might need to one day contribute to protecting Berkeley. Carolyn ultimately was afraid of her powers, and decided to hole up in her room as much as she could instead. However, with the World of Weird permeated about her, she could hardly relax anyways. Deciding to finally take matters into her own hands, she and Lydia together purged Unit 1 of all elements of Weird, and Carolyn accidentally created a powerful forcefield around Unit 1 when she was trying to make The King Crayfish explode.

It was at this point that Carolyn decided to continue to hone her powers, partially because she actually had a cool power, but also partially because it helped her with her physics homework. As time passed she grew more and more confident, especially after having defeated the Lord of The Gays in single combat after a dispute over thongs. However, with the death of Billy after midterms, Berkeley plunged into even more chaos, as its greatest protector had fallen. Carolyn and Lydia were forced to step up in his place, and after learning that Evans Hall was the source of all weirdness in Berkeley, realized that they had to find a way to get into the center of Evans to contain The Weird once again.`,
    '1st-us-marines': `Especially after the Great American Plague in 2042, America was not notable for its particularly skilled infantry, ever since the doctrinal shift to air and sea in 2034. However, the need for strong marine forces remained imperative, as it was necessary for naval invasions to extend control of territory past just the sky and water. The 1st US Marines is the most elite Marine regiment in the entire United States military, trained to create beachheads and breakthroughs swiftly after being deployed by landing craft. Although speed was an important factor in their offense, so were their famous Byron Shotguns, the only shotgun that existed for plasma tech at the beginning of the war. It was capable of launching a wall of nine beams at close range, making it the superior choice for close quarters combat, alongside being very light and smaller than traditional rifles.

The 1st US Marines were first deployed at the Battle of Stuart's Island, intending to capture a supply depot for advancing Soviet forces. The marines made a decisive breakthrough against a concentrated force of the 48th, 123rd, and 56th Soviet Rifles, suffering high casualties (30%) but completely destroying the 48th Rifles and achieving their objectives, leading to the fall of the island. The fighting was highly dispersed as a result of the hilly and forested terrain, but ultimately the superior speed of the US Marines prevented all three enemy regiments from linking together. US commanders noted the victory at Stuart's Island, using it as a point of reference for future naval invasions.

Taking upon the lesson from Stuart's Island, recognizing that such high casualty rates were not sustainable for an elite unit, the US military strictly utilized the regiment to create an opening, rather than to continue to push in to exploit such an opening. Prolonged combat naturally bogged down the cohesion and consequent speed of the unit, and so in order to maximize effectiveness combat would be quick but intensive. At the Battle of Kimsquit, the 1st Marines made a rapid breakthrough within eight minutes, routing the entrenched positions of the 67th Soviet Rifles in close quarters and brutal combat, and allowing the 34th Virginia Rifles, 12th Californian Infantry, and 13th California Infantry to secure the island. The Byron Shotgun was highly effective in this battle, making opposing trenches almost a liability rather than advantage.

The US Marines would continuously be deployed throughout the West Canadian Campaign, successfully conducting eight naval invasions and only failing once. Eventually after the West Canadian front had stabilized, the 1st US Marines were taken to the European theater, where they conducted two naval landings in Germany before being redeployed to the Pacific in 2053. In tandem with the now revitalized US Navy, the 1st US Marines were a key asset in the Aleutian campaign and the Kamchatka campaign, creating brief but devastating breakthroughs within minutes of deploying from their landing crafts and allowing scores of other regiments to flood in.

Their greatest challenge came in the Invasion of Vladivostok, where they took upon an extremely fortified position on Russkiy Island, lined with dozens of forts and a thick line of three Russian regiments, nestled behind a line of trees. Recalling their very first victory also against three regiments on Stuart's Island, the regiment initiated a daring maneuver where they drastically loosened the formation, only to at the last minute quickly funnel back in to make a breakthrough, despite being showered on the flanks from the other two Russian regiments. After the victory at Vladivostok, the 1st US Marines would be continuously deployed in the Pacific until 2054, when they would begin a short campaign in China.`,
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
    if(pfpId) return `pfp/pfp${pfpId}.png?v=${PFP_ASSET_VERSION}`;
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
      <div class="ch-lore-shell ch-lore-reading-shell">
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
            <div class="ch-lore-article-scroll">
              ${paragraphHtml(page.body || 'No article text yet.')}
            </div>
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
      <div class="ch-lore-shell ch-lore-reading-shell">
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
            <div class="ch-lore-article-scroll">
              ${paragraphHtml(page.body || 'No article text yet.')}
            </div>
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
