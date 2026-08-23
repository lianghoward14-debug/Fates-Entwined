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
      summary:'The Queen who never wanted to be a queen.',
      body:'Felicyta grew up in the wistful peaks of the Carpathian Mountains, in a small village called Wodny Potok (2008-2026). Her father, Sebastyen Janowicz, was the most controversial European politician of his time, establishing Visegrad and separating Poland, Czechia, Slovakia, and Hungary from the rest of the European Union.\n\nFrom an early age, Felicyta and her adopted siblings, Květka Svoboda, Rozsi Szocs, and Zsofia Szocs, were groomed to become brilliant politicians and leaders for each of their respective countries, each receiving a world class education from tutors all over the world.\n\nFor college, Felicyta attended Jagiellonian University (2026-2029), where she met her lifelong friend Maja Kaminska. In college she began to stray from her charted course, finding joy in a simpler life with friends away from her controlling father. After three years, Sebastyen reeled her back in and spent the next decade preparing her to ascend to the throne.\n\nFelicyta was crowned Queen of Poland under the royal name Jadwiga II in 2038. She ruled Poland into the beginning of the Third Great War in 2052, becoming known for the relocation of Polish industry and the army abroad.',
      facts:{Affiliation:'Poland-Lithuania', 'Date of birth':'December 12, 2008', 'Place of Birth':'Wodny Potok, Poland', Story:'Snow on the Carpathians; The Third Great War and Events Preceding', Titles:'The Queen of Poland, Jadwiga II, The White Eagle', Relationships:'Rozsi Szocs, Zsofia Szocs, Sebastyen Janowicz, Květka Svoboda', Era:'2008-2052+', Origin:'Wodny Potok, Carpathian Mountains', Role:'Queen of Poland, Jadwiga II', Status:'Ruling monarch', 'Notable For':'Relocating Polish industry and army abroad'},
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
    if(canUseRtdb()) return false;
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
      body:String(raw.body || '').slice(0, 30000),
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
        body:'Felicyta grew up in the Carpathian village of Wodny Potok under the shadow of her father, Sebastyen Janowicz, the politician who created Visegrad and broke Poland, Czechia, Slovakia, and Hungary away from the European Union. She and her adopted siblings, Květka Svoboda, Rozsi Szocs, and Zsofia Szocs, were trained from childhood to become leaders for their respective countries.\n\nOn one stormy Christmas Eve, Felicyta became lost in the Carpathian forests and encountered specters of wars long past: gaunt figures carrying axes, rifles, swords, and grenades, all longing for lives they were never allowed to live. Their sorrow drove her vow to become the White Eagle, the person who would end conflict rather than feed it.\n\nAt Jagiellonian University, Felicyta met Maja Kaminska and briefly discovered the joy of a freer, simpler life. Sebastyen eventually forced her home, spending the next decade preparing her for the throne of a reformed Poland-Lithuania. She was crowned Queen of Poland in 2038 under the royal name Jadwiga II.\n\nHer reign emphasized diplomacy and warnings about the thin boundary between peace and war. When the Third Great War began in 2052, Felicyta made the controversial choice to surrender to the Comintern while arranging for millions of Polish citizens to flee. Her government went into exile, her military rebelled and fought abroad, and her image slowly changed from irrational monarch to queen who may have saved her people.',
        facts:{Affiliation:'Poland-Lithuania', 'Date of birth':'December 12, 2008', 'Place of Birth':'Wodny Potok, Poland', Story:'Snow on the Carpathians; The Third Great War and Events Preceding', Titles:'The Queen of Poland, Jadwiga II, The White Eagle', Relationships:'Rozsi Szocs, Zsofia Szocs, Sebastyen Janowicz, Květka Svoboda'},
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
        subtitle:'Chief Diplomat of the West Caribbea Trading Company.',
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
        facts:{Affiliation:'The Bird Cult of Costa Rica, MINAE', 'Date of birth':'2014', 'Place of Birth':'Michigan, United State of America', Story:'Expanded Worlds', Titles:'Protector of Bird-King, Demagogue of all Avians, Chancellor of Costa Rica, Head Supervisor of MINAE, Dictator of all Bird Kind', Relationships:'Juan Carlos'},
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
        facts:{Affiliation:'The Kingdom of Greater Hungary, The Free World, Eotvos Lorand University, Visegrad', 'Date of birth':'August 12, 2008', 'Place of Birth':'Budapest, Hungary', Story:'The Third Great War and Events Preceding', Titles:'The Queen of Hungary, The Twin Monarchs of Hungary', Relationships:'Rozsi Szocs, Felicyta Janowicz, Květka Svoboda'},
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
        body:'The 1st US Marines are the most elite marine regiment in the United State of America military, trained to make beachheads and breakthroughs immediately after landing. Their Byron Shotguns and speed made them decisive in Stuart\'s Island, Kimsquit, Vladivostok, and later Pacific operations.',
        facts:{Affiliation:'The United State of America, The Free World', 'Date of birth':'None', 'Place of Birth':'None', Story:'The Third Great War and Events Preceding', Titles:'None', Relationships:'None'},
        tags:['US Marines', 'Byron Shotgun', 'Third Great War']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'kvetka-svoboda', title:'Květka Svoboda', pfpId:'19',
        subtitle:'The Bohemian Queen and Demon of the Ukulele.',
        summary:'Květka Svoboda grows from Sebastyen Janowicz\'s adopted daughter in Wodny Potok into the Bohemian Queen of Czechoslovakia, balancing family loyalty, politics, and careful resistance to militarization.',
        body:'Květka Svoboda was adopted from a Prague orphanage by Sebastyen Janowicz alongside Rozsi and Zsofia Szocs, then raised in Wodny Potok with Felicyta Janowicz. She became especially close to Felicyta, sharing walks, secrets, snow, village life, fishing trips with Wojciech, and an infamous childhood talent for terrible ukulele playing.\n\nSebastyen intended Květka to become Czechia\'s future leader, giving her the same world class education as the rest of the household. She attended Charles University in 2025, became a senator\'s aide, and rose through ANO 2011 as a sharp administrator. After the senator age threshold was lowered, she won District 6 in Prague in 2029 and became known for strong education policy.\n\nWhen monarchist currents spread beyond Sebastyen\'s original plans, Květka was pushed into public myth through the film The Bohemian Queen. Though uncomfortable with how much her father controlled her image, she endured it for the family. By the 2040s, as her siblings rose into their planned positions and disagreements over militarization deepened, Květka tried to hold a neutral, pragmatic line while quietly leaning toward Felicyta\'s caution.',
        facts:{Affiliation:'Czechoslovakia, Charles University, The Free World, Visegrad', 'Date of birth':'March 19, 2007', 'Place of Birth':'Prague, Czech Republic', Story:'The Third Great War and Events Preceding', Titles:'The Bohemian Queen, The Queen of Czechoslovakia, The Demon of the Ukulele', Relationships:'Felicyta Janowicz, Rozsi Szocs, Zsofia Szocs'},
        tags:['Czechoslovakia', 'Bohemian Queen', 'Wodny Potok']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'south-wind-spearman', title:'South Wind Spearman', pfpId:'20',
        subtitle:'The defensive backbone of South Wind Island.',
        summary:'The South Wind Spearmen are Pacifica\'s disciplined defensive force, born from South Wind Island\'s pragmatic move away from unreliable mercenaries and toward a loyal standing army.',
        body:'The South Wind Islands built their strength on pragmatism and stability. While many Pacifica factions relied on mercenary forces, South Wind leadership cultivated a national identity that tied civilians more closely to the state, making a loyal standing army possible.\n\nIn 326 AC, South Wind Island introduced a conscription law requiring male civilians to serve quarter-year deployments from ages 20 to 32. The result was a force of roughly 3,000 soldiers at any given time, far larger and more reliable than the average faction could afford through mercenaries.\n\nThe South Wind Spearmen became the army\'s signature formation. Their broad shields, chain mail, long warding spears, cohesion, morale, and discipline made them an ultimate defensive force. They broke Scarlet Legion assaults at Flora Islands, later supported offensive maneuvers at Black Crag Bay, and by 500 AC numbered 12,000 soldiers despite South Wind Island\'s general reluctance to fight unnecessary wars.',
        facts:{Affiliation:'South Wind Island', 'Date of birth':'None', 'Place of Birth':'None', Story:'To Eventide', Titles:'None', Relationships:'None'},
        tags:['South Wind Island', 'Pacifica', 'Spearmen']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'henry-dong', title:'Henry Dong', pfpId:'21',
        subtitle:'Founder of the Neo Comintern and the last revolution.',
        summary:'Henry Dong leaves Southern California for Russia, radicalizes through factory work and repression, survives imprisonment in the Far East, and becomes the revolutionary force behind the Neo Comintern.',
        body:'Henry Dong grew up in Southern California before moving to Russia in 2022 in search of opportunity. Factory work, oligarchic inequality, Putin\'s death, political instability, and far-left reading drew him into Marxist activism. After his factory closed in 2025, he organized protests, wrote political papers, and gained recognition among Russian leftists.\n\nBoris Abashev\'s authoritarian government arrested Henry on December 6, 2025 and sent him to prison. In 2026, he was transferred to the Udokan copper mine in Zabaykalsky Krai, one of the remote Far East work camps created for political prisoners.\n\nIn the mine, Henry met Svaski Kunetsov, Iosif Arapov, and Ivan Paltsev. Their debates refined Henry\'s ideology beyond traditional Marxism into a modern revolutionary movement. As tens of thousands of political prisoners were scattered across the Far East, Henry and his comrades quietly spread their ideas, built organization, gathered resources, and laid the foundation for the revolution that would become the Neo Comintern.',
        facts:{Affiliation:'The Neo Comintern', 'Date of birth':'March 8, 2002', 'Place of Birth':'Southern California', Story:'The Third Great War and Events Preceding', Titles:'None', Relationships:'Svaski Kunetsov, Iosif Arapov, Ivan Paltsev'},
        tags:['Neo Comintern', 'Russia', 'Last Revolution']
      },
      {
        section:'expanded-worlds', type:ENTRY_TYPE, slug:'isaac-perez', title:'Isaac Perez', pfpId:'22',
        subtitle:'ALPINE head scientist and creator of nuclear fusion.',
        summary:'ALPINE head scientist and creator of nuclear fusion.',
        body:'Isaac Perez grew up in Temecula, studied Chemical Engineering at UC San Diego, worked at a chemical plant in Arizona, and later pursued graduate physics at UC Berkeley. His yearly breakthroughs in nuclear fusion made him a major scientific figure.\n\nIn 2031, Jeremiah Jones invited Isaac to a hidden ALPINE facility in the Swiss mountains. Jeremiah described an anomaly that threatened Earth and asked Isaac to become ALPINE\'s head scientist. Once Isaac saw the modern mountain facility and its secret village, he accepted.\n\nAt ALPINE, Isaac managed hundreds of scientists, advised Jeremiah, studied the anomaly, and pursued fusion by attempting to hold a miniature star inside a chamber. In 2034, he stabilized it, creating immense energy and a discovery many believed would change the world. The achievement also coincided with ALPINE\'s darker turn under Montgomery, forcing Isaac to confront the military uses of the technology he helped create.',
        facts:{Affiliation:'ALPINE', 'Date of birth':'March 17, 2002', 'Place of Birth':'Temecula, Southern California', Story:'Broken Arrow', Titles:'None', Relationships:'Christopher Erbs, Jeremiah Jones, Agent K'},
        tags:['ALPINE', 'Broken Arrow', 'Nuclear fusion']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'cathy', title:'Cathy', pfpId:'23',
        subtitle:'Berkeley friend, Cheez-It sovereign, and cardigan tactician.',
        summary:'Cathy is a UC Berkeley student from Redondo Beach whose friendships, apartment gatherings, Cheez-It stacks, Denny\'s rituals, and dry humor make her a fixture of Howard\'s Berkeley years.',
        body:'Cathy grew up in Redondo Beach with her childhood friend Zoe and entered UC Berkeley as part of the class of 2026. She lived in Unit 1, met Howard in Moffitt after mentioning his drawings, and shared his appreciation for works like Look Back and Arcane, though not his devotion to Crossroads.\n\nAfter moving out of Unit 1, Cathy lived with her twin sister in an apartment that became memorable for its enormous teddy bear, massive Cheez-It supply, parties, and gatherings. Cathy, Howard, Zoe, Carrie, Mark, and Lena frequently treated Denny\'s as a near-sacred ritual.\n\nHer major remains hazy, probably biology-adjacent despite Howard initially assuming computer science. Cathy is known for her sarcastic riiight, excellent tiramisu, clean egg-cracking skills, and the open question of where her post-Berkeley life will take her.',
        facts:{Affiliation:'University of California, Berkeley', 'Date of birth':'2006', 'Place of Birth':'Redondo Beach, Southern California', Story:'None', Titles:'None', Relationships:'Zoe, Evan, Howard'},
        tags:['UC Berkeley', 'Cheez-It', 'Denny\'s']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'ralphs-courtesy-clerk', title:'Ralph\'s Courtesy Clerk', pfpId:'24',
        subtitle:'The unparalleled workers at the front line of Kroger.',
        summary:'The unparalleled workers at the front line of Kroger.',
        body:'The Ralphs Courtesy Clerk is the frontline infantry of Kroger grocery stores. Courtesy clerks perform the hardest work in the company: floor sweeps that save lives, cart pushing that tests mythic strength, constant customer interaction, and the mental discipline required to withstand the public.\n\nBagging is the courtesy clerk\'s iconic art. It demands judgment, prediction, speed, and spatial mastery as groceries arrive in chaotic waves and must be arranged efficiently while cashiers continue scanning.\n\nWithin courtesy clerk society, opening clerks, daytime clerks, and night clerks occupy different levels of the hierarchy. The night courtesy clerk is the legendary form, closing multiple areas before time runs out. In this worldview, a Ralphs courtesy clerk is perhaps the most complete human a human can become.',
        facts:{Affiliation:'Kroger Company, Ralphs', 'Date of birth':'None', 'Place of Birth':'The Pits of Hell', Story:'None', Titles:'None', Relationships:'Howard Liang'},
        tags:['Ralphs', 'Kroger', 'Courtesy Clerk']
      }
,
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'zimbabwean-honor-guard', title:'Zimbabwean Honor Guard', pfpId:'25',
        subtitle:'The Horns of the Buffalo.',
        summary:'',
        body:'',
        facts:{Affiliation:'The African Union', 'Date of birth':'None', 'Place of Birth':'None', Story:'The Third Great War and Events Preceding', Titles:'The Horns of the Buffalo', Relationships:'Shaka Zulu II'},
        tags:['African Union', 'Botswana Campaign', 'Horns of the Buffalo']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'ucpd', title:'UCPD', pfpId:'26',
        subtitle:'Perhaps Howard\'s greatest ops in Berkeley were the UCPD.',
        summary:'',
        body:'',
        facts:{Affiliation:'The University of California, Berkeley', 'Date of birth':'None', 'Place of Birth':'None', Story:'None', Titles:'None', Relationships:'Howard Liang'},
        tags:['UC Berkeley', 'UCPD', 'Howard Liang']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'kazumi', title:'Kazumi', pfpId:'27',
        subtitle:'Fables of the Old Age.',
        summary:'',
        body:'',
        facts:{Affiliation:'None', 'Date of birth':'494 AC', 'Place of Birth':'Unknown, presumably Colombo', Story:'To Eventide', Titles:'None', Relationships:'Anicka Konvicka'},
        tags:['Colombo', 'Anicka Konvicka', 'To Eventide']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'2nd-polish-lithuanian-army', title:'2nd Polish-Lithuanian Army', pfpId:'28',
        subtitle:'The Army of Exiles.',
        summary:'',
        body:'',
        facts:{Affiliation:'Poland-Lithuania, The Free World', 'Date of birth':'None', 'Place of Birth':'None', Story:'The Third Great War and Events Preceding', Titles:'None', Relationships:'Felicyta Janowicz'},
        tags:['Poland-Lithuania', 'Free World', 'Army of Exiles']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'dylan-kirby', title:'Dylan Kirby', pfpId:'29',
        subtitle:'50th President of the United States.',
        summary:'',
        body:'',
        facts:{Affiliation:'The United States, the Free World, The University of California, San Diego', 'Date of birth':'2002', 'Place of Birth':'Temecula, California', Story:'The Third Great War and Events Preceding', Titles:'50th President of the United States', Relationships:'Johnathan Kirby, Marie L\'amboure'},
        tags:['United States', 'Fireside Talks', 'Third Great War']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'santiago', title:'Santiago', pfpId:'30',
        subtitle:'El Matador del Mares',
        summary:'',
        body:'',
        facts:{Affiliation:'The Cook Islands', 'Date of birth':'Unknown', 'Place of Birth':'Unknown', Story:'To Eventide', Titles:'El Matador del Mares, Excellency of the Cook Islands', Relationships:'None'},
        tags:['Cook Islands', 'El Matador del Mares', 'To Eventide']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'oathbound-noble-fighter', title:'Oathbound Noble Fighter', pfpId:'31',
        subtitle:'',
        summary:'',
        body:'',
        facts:{Affiliation:'The Oathbound', 'Date of birth':'Unknown', 'Place of Birth':'Unknown', Story:'To Eventide', Titles:'None', Relationships:'None'},
        tags:['Oathbound', 'To Eventide']
      },
      {
        section:'reality', type:ENTRY_TYPE, slug:'temecula-resident', title:'Temecula Resident', pfpId:'32',
        subtitle:'',
        summary:'',
        body:'',
        facts:{Affiliation:'The City of Temecula', 'Date of birth':'None', 'Place of Birth':'None', Story:'None', Titles:'None', Relationships:'None'},
        tags:['Temecula', 'Riverside County', 'Reality']
      },
      {
        section:'eventide', type:ENTRY_TYPE, slug:'west-caribbea-infantry', title:'West Caribbea Infantry', pfpId:'33',
        subtitle:'The Company\'s Finest',
        summary:'',
        body:'',
        facts:{Affiliation:'The West Caribbea Trading Company', 'Date of birth':'None', 'Place of Birth':'None', Story:'None', Titles:'The Company\'s Finest', Relationships:'None'},
        tags:['West Caribbea Trading Company', 'The Company\'s Finest', 'Caribbea']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'rozsi-szocs', title:'Rozsi Szocs', pfpId:'34',
        subtitle:'The King of Hungary',
        summary:'',
        body:'',
        facts:{Affiliation:'The Kingdom of Greater Hungary, The Free World, Eötvös Loránd University, Visegrad', 'Date of birth':'August 12, 2008', 'Place of Birth':'Budapest, Hungary', Story:'The Third Great War and Events Preceding', Titles:'The King of Hungary, The Twin Monarchs of Hungary', Relationships:'Zsofia Szocs, Felicyta Janowicz, Květka Svoboda'},
        tags:['King of Hungary', 'Twin Monarchs of Hungary', 'Visegrad']
      },
      {
        section:'third-great-war', type:ENTRY_TYPE, slug:'alexander-the-magnificient', title:'Alexander the Magnificient', pfpId:'35',
        subtitle:'Alexander the Magnificent',
        summary:'',
        body:'',
        facts:{Affiliation:'The Kingdom of Greece and Macedon, The Hellenic Union', 'Date of birth':'June 5th, 2004', 'Place of Birth':'Athens, Greece', Story:'Third Great War and Events Preceding', Titles:'Alexander the Magnificent, The King of Greece and Macedon, Alexander himself, The Regent of Greece', Relationships:'None'},
        tags:['Alexander the Magnificent', 'Hellenic Union', 'Kingdom of Greece and Macedon']
      }
    ];
  }
  const DOCUMENT_EXACT_BODIES = {
    'felicyta-janowicz': `The Queen who never wanted to be a queen. Felicyta grew up in the wistful peaks of the Carpathian Mountains, in a small village called Wodny Potok (2008-2026). Her father, Sebastyen Janowicz, was the most controversial European politician of his time, establishing Visegrad and separating Poland, Czechia, Slovakia, and Hungary from the rest of the European Union. Hence, from an early age, Felicyta and her adopted siblings, Květka Svoboda, Rozsi Szocs, and Zsofia Szocs, were groomed to become brilliant politicians and leaders for each of their respective countries, each receiving a world class education from tutors all over the world. Although Felicyta felt little passion for the work she conducted, her lack of other desires in life made work the only thing she could pass her time with.

Felicyta's otherwise monotonous life would shatter on one stormy Christmas Eve, when she found herself lost in the vast forests of the Carpathian mountains, where she came across horrid specters of wars long past - gaunt figures carrying axes, rifles, swords, and grenades, all longing for a life they never were able to live. Felicyta felt the burning sorrow of a thousand lives over thousands of years, men who lived only so that they could die. She vowed to become "The White Eagle," the one who would bring an end to all conflicts.

For college, Felicyta would attend the Jagiellonian university, (2026-2029) meeting her lifelong friend Maja Kaminska there. It was in college that Felicyta began to stray from her chartered course, realizing the joys of a simpler life with her newfound friends away from her controlling father, and far from the lingering shadows of those specters she encountered long ago. She went to college parties for the first time, smoked for the first time, watched Netflix, ate cup ramen, faked an ID, painted graffiti on campus, deliberately skipped classes so she could sleep in, played video games, had long girl talks with her friends in their dorm. Maja brought her all over Krakow, finding ways to come as close to breaking the law without breaking it. They often would meet up with their other friend, Francisek, at the banks of the Vistula River near Wawel castle, planning their weekend moves, then go shopping in the Sukiennice afterwards. Over time Felicyta also developed feelings for her taxi driver, Francisek, but ultimately was never able to confess despite the encouragement of Maja. However, after just three years of this new life her father reeled her back in, forcing her to return home to the Carpathians after learning of her lack of focus in college. He reprimanded her, comparing her to her siblings who never let "bad" influences get to their head, and threatened to cut her off. Felicyta debated for some time whether she should create her own path forward and deny her father completely, and Maja encouraged this decision, but after recalling the specters of the Carpathian Mountains Felicyta caved. Shortly after she was forced to return, Maja and Francisek visited Felicyta in Wodny Potok one last time, reminiscing over their college years while enjoying a beautiful sunset over the forests of the Carpathians. Sebastyen spent the next decade preparing her to ascend to the throne of a reformed Poland-Lithuania, leading Felicyta to be crowned the Queen of Poland, taking up the royal name of Jadwiga II (2038).

Her rule was characterized by relative calm, in the context of world tension reaching a breaking point during this decade. Despite calls for militarization, she continued her focus on the international forum, and was present for many diplomatic summits, adamant on a rhetoric for stability. Notably, she centered her tone on the consequences of aggressive action, highlighting the thin boundaries between peace and war. This rhetoric would bring her into conflict with her sister and brother, Rozsi and Zsofia Szocs, who had become the Twin Monarchs of Hungary at this point. In an informal picnic with Zsofia, she could not bring herself to see eye to eye with her militarization, and the relationship between the two siblings would become strained. Regardless, Felicyta continued on her path, focusing on managing the international sphere of issues and somewhat neglecting domestic policy. She visited conflict zones around the world and made a number of diplomatic arrangements, ranging from the purchase of industry and the establishing of good relations. She created trade agreements and reinforced Polish embassies abroad, also establishing new ones in Costa Rica, Guatemala, Cambodia, amongst many others. She drew critiques from her populace as it seemed she was out of the country much more than she was in it, and only enacted a handful of policies around unemployment and the reallocation of funds away from the military to reinforce the national treasury. However, there were not enough issues within the country itself to demand her resignation.

She would rule Poland into the beginning of the Third Great War (2052), where she became known for the extremely controversial immediate surrender to the Comintern. As it turns out, much of her international diplomacy focused on enacting this plan from the very beginning, attempting to redistribute industry abroad so that she could continue to support her people during the war. Millions in her homeland and abroad considered this decision to be the most irrational in all of history, suggesting that she must have been clinically troubled to have come to such a conclusion. While her government was taken into exile into the United Kingdom, the military rebelled and separated from the formal Polish government, deciding to continue the fight from abroad as an international expeditionary force in all fronts of the war. By terms of the surrender agreement, the people of Poland were given full immunity to flee the country, in a long and chaotic three month process in which transportation was arranged for millions of people. Most of the population found themselves in The United State of America or United Kingdom. From this point Felicyta became a queen in exile, offering encouraging words for her citizens and continuing her calls to end the war. These words initially fell on deaf ears, for her decision was still dramatically denounced at this time, but as the war dragged on the image of Felicya began to grow more and more favorable as time passed, and many began to see the merit of her actions...`,

    'anicka-konvicka': `Anicka Konvicka lives in the struggling land of Colombo five hundred years after the Great Calamity, in an abandoned stretch of land near the Western Sea. As an orphan who lost her mother to illness at a young age and her father in a sailing accident, she lives an independent and lonely life, tending to her crops and hunting to make ends meet. The only thing she had left from her parents was a beautiful sea blue pendant, which her father gave to her shortly before the accident. Due to negative experiences with the people of Colombo in the past, Anicka harbors a general distrust of any people she meets. Her blue eyes, to the people of Colombo, are considered an omen of bad luck due to its association with the Western Seas - a calamitous force that only brings destruction and death.

One day, in 510 AC, she meets another orphan named Kazumi, who she rescues from captors attempting to sell her into slavery. However in the rescue she was forced to take off her blindfold, which revealed her blue eyes to the rest of the villagers and caused them to verbally shun her. She fled the scene and eventually arrived at a large cliff over the sea near her home, crying over the state of her life and contemplating suicide. She recalls the very first time that she had encountered the other people of Colombo in her youth, shortly after her father's boating accident. Not knowing of the people's beliefs during this time, she wandered into a village without her blue eyes covered, and tried to get help for her father, who had been swept into the sea. She was immediately met with great disdain, with many people calling her a witch and telling her to never come back. From that point onwards Anicka kept to herself and her lonely stretch of land near the sea, only going to villages for necessities like grain and medicine and keeping her eyes covered by a blindfold at all times during these trips.

Although Anicka was initially shocked to see the girl she had rescued again, as it was unthinkable that anyone in Colombo would ever venture this close to the Western Seas, it seemed she barely acknowledged it. Naturally Anicka wanted to tell her to just go away, but her very first words to Anicka had a tremendous influence on her - "I think your eyes are beautiful." The girl revealed herself as being named Kazumi, and she disclosed that she never had a family either, and Anicka ultimately decided to support her, although reluctantly at first. After a short time they grew close, becoming practically like sisters, and Kazumi shared that she loved reading, learning about the history of the Old Age. Together they would steal books from the library and wander the coast of Colombo, sharing dreams of one day journeying to Caribbea, a prosperous land, in order to start a new life. However on the fateful evening before departing to Caribbea, Kazumi sacrificed herself during an event known as the Sea Ritual to be taken as tribute to quell the Seas, in place of her former captors. Anicka, furious that Kazumi would sacrifice herself for her former captors, as she thought they were nothing but unfair to her, had initially continued on the road to Caribbea in disbelief by her decision. However, deciding to go back, Anicka witnesses the final moments before Kazumi was to be taken by the sea, in a cruel parallel to how she lost her father. In a fit of emotion, Anicka attempted to free Kazumi from the mysterious "Sea Men" clad in rusty armor and seaweed, to no avail. It was at this time Kazumi revealed that she sacrificed herself because she knew her captor "had a daughter," and didn't want to cause the same pain onto his daughter that she observed through Anicka during the time they spent together.

After Kazumi was taken into the seas, Anicka resolved to bring her back, so she traveled North into Californique, far past Caribbea, venturing into the Western Seas from an abandoned city of the Old Age. The reason for this was because it was said that the Seas were completely impassable from the coast of Colombo all the way past Caribbea due to perpetual storms, evidenced by the countless number of shipwrecks littered along the beaches of Colombo, all hundreds of years old. After sailing for some weeks, Anicka eventually encounters a huge city on an island chain known as Panacea, where she meets a woman by the name of Maria Song. It was at this time that she realized that she had come across a whole new civilization of people and places she or the people of Colombo never knew existed - Pacifica. Pirates, and warlords, warships and floating cities - alongside her newfound friend Maria, they journey into the Great Sea, finding themselves embroiled within the conflicts of Pacifica, in search of Kazumi.`,

    'howard': `Howard grew up in Temecula, in the superior land of Southern California. Howard initially spent five years living in West Covina, from birth to the age of five, but memories of this life are few - I recall peeing my pants in preschool, I remember a friend named Julian, and I remember throwing snails into the pool. Howard spent most of his childhood not really thinking much, resorting to drawing on desks and doodling on worksheets in class. He was quite good with multiplication tables, and loved reading books such as The Magic Tree House, Bailey School Kids, and My Weird School, but the moment he discovered video games his life went downhill. He started playing LOTRO in middle school, which would basically continue all the way until college, and he was made aware of Minecraft modding and mobile mmos like Pocket Legends. However it was during this time in elementary school and middle school that he would meet his lifelong friends Jimmy, Isaac, Chris, and Phil.

Howard would go on to attend Great Oak High School, where he continued to harass his teachers and get really sleepy in 5th periods after lunch, while mostly drawing on his desk and working on his stories. His favorite class was Herney JOnes' Spanish class, where he created his first whiteboard drawings and invented the character Duncan Heyward. However, it would be one fateful day in Mr. Boyatt's ELA class where he created the legendary Henry Pestilence Cloud - leading to the birth of all stories you are reading now. He participated in the IB program, and actually thought it was quite fun, but only because he didn't really do much of the work. Somehow he failed AP Art History and IB SL Physics, but this was of no concern to him at the time. Covid began during Howard's senior year in High School, which lowkey saved him because he did not study for his IB exams at all.

During COVID, Howard made a million dollars working at Ralphs and Breakfast Republic, where he then transferred to UC Berkeley as a Global Studies Major where he met most of his modern friends, such as Mark, Harvey, Cathy, Zoe, Joie, Andi, amongst many others. After a brief affair with the Berkeley Police, Howard resorted to drawing on Whiteboards in Moffiott, aura farming in MLK, and eating at Crossroads for the rest of his academic career. After a brief stint working at Chi Cha Sa Chen, where Howard thought it was the hardest thing he ever did even though it was just a Boba shop, now Howard is working in Japan, forcing kids to play his obnoxious card games instead of following the lesson plan.`,

    'zoe': `Zoe Inzer is a Junior year student at UC Berkeley notable for her exceptional adoration for the Resident Evil franchise and being a cinephile. Hailing from the wretched land of Connecticut, she moved to Southern California at a young age and went to school in Redondo Beach. At Berkeley she is currently majoring in the Humanities, I believe in Scandinavian Studies if my failing memory serves me well. Besides all of the characteristics mentioned above, she also is Wasian and refuses to play Minecraft with me.

Zoe has a boyfriend named Lukas, and she has told me that she wants to long term live in Denmark or Britain or something because she hates Japan and America. She posts drawings of characters from cinema on her story, and is quite exceptional at making aesthetically pleasing instagram posts. One time she bought me food from Trader Joes which was cool. I got to eat Trader Joe dumplings or something for the first time because of that. Unfortunately, due to how much of a cinephile she is, she seems to refuse to watch 2D works like Arcane, even after we showed her the CaitVi lesbian scene.`,

    '17th-british-regiment-of-africa': `Landing in Angola, the 17th Regiment of Africa was an unassuming unit of soldiers who gained fame for their hard fought victories during the Botswana Campaign from 2052 to 2054, under the command of Lieutenant Burnes. Far from being known for their amazing offensive breakthroughs or stalwart defense, the 17th Regiment was simply known for their sheer experience - They participated in dozens of major battles, hundreds of skirmishes, and stood up when the time was needed for a trustworthy and reliable force. They often occupied the direct center of the British frontline during these campaigns, anchoring the wider 4th Army. Notably, they participated in the Battle of Maun, The Battle of Bulawayo, and the Battle of Kgalagadi, the latter in which they faced encirclement and potential annihilation, but their rearguard action bought enough time for reinforcements to come to their aid. In the Battle of Maun, the 17th Regiment fought for thirty-two hours straight with no clear respite. However the most famous battle of The Botswana Campaign would come in May 2055, during the vicious battle of Lusaka, which saw the 17th British Regiment clash for seven days straight with the Zimbabwean HOnor Guard, resulting in their destruction but not after significant casualties to the Commonwealth forces, a pyrrhic victory. After 2054, when the African Republic capitulated, the 17th Regiment became redesignated as the 6th Guard Regiment of The King, redeploying to Europe to participate in the East German Campaign. This decision came in large part due to the recognition that this unit fought in too many battles and was overly expended. Although this new force had become a fraction of the size of the original 17th Regiment, and widely dispersed amongst many other regiments, the 6th Guard acted as an experienced veteran unit which often reinforced holes in the formation. After the war, the 17th Regiment would be recognized by the British government as one of the war's most resilient fighting forces, awarded the second highest number of medals of any British Regiment during the War.`,

    'jorge-alvarez': `Born in 470 AC in West Caribbea to a family of simple farmers, he and his brother Santiago Alvarez dreamed of one day becoming powerful and rich together, to escape their current life and move to Havano. For many years this was but a dream, and much of Jorge's life was uninteresting until he discovered an all new fruit while foraging for some seeds, which he would later call "The Piña." Sensing the potential of this new crop he relocated to Havano, the capital of Caribbea, and founded the West Caribbea Fruits Company, which specialized in the sale of this new crop. Although selling from a mere stand in the marketplace of Havano at the time, scouring for scraps and hardly making more than a few sales per day, "The Piña" eventually became wildly popular, and Jorge quickly became a wealthy merchant. He continued to rapidly expand his enterprise, eventually becoming The West Caribbea Trading Company, owning large shops across all of of Havano.

After rising through the ranks of Caribbea society, he became more exposed to the injustices of Caribbea and eventually resolved to bring down the "Old Elite" - However, in the year 495 AC, members of the Old Elite caught wind of this plot through his brother, who had become a general for the Old Elite, and this forced Jorge to flee to West Caribbea, after he was ambushed by mercenaries while giving an impactful speech in Havano. His friend, a fisherman named Sebastian, gave his life to save Jorge, attempting to flee pursuing Old Elite Sloops on his fishing boat. After washing up on shore, barely conscious and battered, It was here that Jorge met his lifelong friends Rivera, and his daughter Sofia, who lived in a remote shack on the coast of Caribbea. Rivera nursed Jorge back to full health, telling him stories of the hard life in Caribbea, highlighting furthermore the hundreds of years in which the Old Elite leeched from the populace. Jorge, resolving to help the people of Caribbea as best he could, decided to embark on a journey across all segments of society in Caribbea to learn of the people and their woes, in what would become known as his famous El Viaje De Hombre Pina. It was here he met an aspiring revolutionary from a prestigious college in Havano, named Anne Stone, who spoke of an extreme ideology without government, advocating for violent revolution to undermine the Old Elite. She joined Jorge and Rivera on the Viaje, as Jorge recognized her intelligence and ability as an organizer. Eventually, as word spread of his journeys through Caribbea, helping local villages and speaking to people with great charisma and approachability, people began to join in on his Viaje, and eventually, over time, thousands followed Jorge in a massive column to celebrate his journey. This event concerned the Old Elite greatly, but even more importantly, it sparked hope into the people of Caribbea. Eventually at the end of the Viaje, Jorge found himself with over six thousand followers at Santa Rosa beach, and it here that all six thousand of his newfound followers chanted for Jorge to become the First President of of Caribbea.

Jorge was thrusted at the head of a popular revolution, calling for the overthrow of the Old Elite through peaceful protest. The Old Elite caught wind of this situation and deployed an army to stop the revolution, resulting in a contentious debate between peaceful protest and violent revolution. Jorge maintained his stance and led demonstrations throughout all of the port cities of Caribbea, marching through city centers and applying pressure on the local leadership, while Anne secretly went behind Jorge's back to coordinate violent militia attacks onto the Old Elite Army to convince Jorge that violence was the only way forward. It was also revealed that Santiago Alvarez, Jorge's own brother, was at the head of this military force. Santiago, wanting to request an audience with Jorge, decided to meet up with his brother at Santa Rosa beach, the site of Jorge's ascension as a revolutionary leader. The brothers, having diverged so strongly from one another, could not see eye to eye or make an agreement. Eventually, due to stalled negotiations, frustration by the military due to the guerilla attacks led to the infamous Santa Rosa massacre, where hundreds of protestors were gunned down by the Old Elite military. This event nearly broke Jorge, leading him to question everything he has done for the past year - Anne recognized the mistake she had made and decided at this juncture to fight the path of peaceful protest, encouraging Jorge to persevere. Jorge, empowered as a result of Anne renouncing her old ways, continued on the fight as a result. Eventually over the course of a year, after growing pressure in Havano and strikes around the countryside, this created a situation where the Old Elite could no longer afford to contain this popular movement due to military defections and starvation of the large ports, and Jorge triumphantly returned to Havano where he gave his famous "El Sol Nunca se Pone en el Caribbea" speech, which all but solidified the triumph of the revolution.

Jorge's company seized control of Havano in 496 AC, expelling the Old Elite, and continued his domination of all of Caribbea through diplomacy and his overwhelming economic power. Under The West Caribbea Trading Company, over the course of the next 14 years, Jorge effectively seized control over all of Caribbea, initiating massive development projects in which every last drop of money profited was reinvested into the city and land, which eventually created a prosperous society in all segments of life. The countryside of Caribbea, paved by cobbled roads and large estates, were anchored by his famous "Treasure Ports," large port cities with immense wealth and beautiful architecture, places where people would describe as a coastal paradise. Although Old Elite guerillas still remained in the far, remote jungle, the last bastion of Old Elite power crumbled in the year 510 AC, when the small region of Santa Clarita in the south was signed away to the Company. However, far by this point, Caribbea had already been transformed completely. The men and women of the treasure ports wear ribbons in their everyday clothing, signalling their newfound freedom and prosperity. The seas, blue and bright as the banner of West Caribbea, promise a future of continued hope and good fortune. The countryside, once gloomy and bare, springs to life with bright vegetation and unpolluted rivers, ferrying goods to all corners of Caribbea. Because of Jorge, "The Sun Never Sets in Caribbea."`,

    'maja-kaminska': `In a study conducted by war scholars from West Point, Sandhurst, and Saint-Cyr after the Third Great War in the year 2065, it was unanimously concluded that Maja Kaminska is the greatest general in all of human history. 186 battles won, only four times defeated by conventional metrics, while garnering the most prolific experience profile in all of history, conducting operations in all corners of the world. No two of her battles are ever completely the same, as Kaminska ensures every battle takes upon tactics wildly different from anything that could be read in a textbook.She single handedly invented a new type of front line distribution by herself, named the Kaminska line, which featured rapidly shifting and deceptive movement rather than static positions or a committed reserve. Although her doctrine still draws upon principles of movement and flexibility, the creativity in which she manipulates the battlefield and her units are unparalleled. Hailing from Poland, and growing up in Warsaw, she was described by her peers as being somewhat unconventional and weird, but thoroughly funny, charming, and endearing to interact with.

She studied at the Jagiellonian university, where she met her lifelong friend and roommate Felicyta Janowicz, who she at the time described as gloomy, but hard working. The two of the grew close, and Kaminska managed to get Felicyta to break her shell, going on parties, conducting mischievous activities, and meeting boys for much of their time in college. Disagreements naturally occurred, given one situation where Felicyta did not want to drive all the way to Warsaw to vandalize the Palace of Science and Culture, and then drive back home in time before a midterm, but ultimately Felicyta changed as a person meeting Maja. However their time together in college would come to a dramatic end when her father, Sebastyen Janowicz, forced Felicyta to return home to Southern Poland, due to her faltering performance in college. Maja wouldn't be able to see Felicyta for many years until one day when Maja snuck into Felicyta's home, where they spent a heartfelt night walking around the forests of the Carpathians.

By this point however Kaminska had transferred to West Point, citing that she was more in interested in Military history than Political Science, where she achieved decent marks and graduated with some distinction. Although Maja was initially a part of the US military as a Second Lieutenant, due to obligations of UN member nations needing to now supplement the UN army with mandatory units and a quota to meet, Kaminska first served as a Captain Commander for the United Nations Army during UN intervention during the Mexican Civil War in 2029, where her unit was noted for their unconventional tactics and highly creative maneuvers, especially in a skirmish near Mexico City where her unit annihilated a local supply hub. She quickly was promoted through the ranks, becoming a Brigadier Commander in just a year, and It was during this time that her unit found tremendous success in Oaxaca, her greatest feat coming during the Battle of Oaxaca de Juarez, where her separated unit of 500 soldiers managed to inflict massive casualties on a Falangist force numbering 4000 men.

After the Mexican Civil War Maja was promoted to a Third Marshall and redeployed to QIngdao during the Chinese Civil War, serving as an advisor but running into controversy when it was learned she personally commanded the Nationalist Army during the decisive victory at Hangzhou. She was soon relocated to Persia, to lead a small UN force in Iran, where she likewise accumulated noteworthy success. By 2034, many around the world had recognized Maja as already the premier expert for any form of asymmetrical warfare, and she served as amongst the Highest ranking generals in the United Nations Army. In 2035, she was deployed in Russia commanding a force of 2500, but was unable to prevent the collapse of the wider Democratic League of Russia in Leningrad .For the next 12 years Maja would be constantly deployed to conflict zones around the world, commanding detachments of anywhere from 1000 to 10,000 soldiers, eventually being granted the rank of High Marshall, the highest rank in the United Nations Army. During the Third Great War, Maja would be given command of the United Nations 5th Army, a highly diversified and mobile force that suited Maja's strengths. Although some had doubts on her ability to transition into massive, formal warfare, these doubts were quickly silenced when she would proceed to lead the 5th Army to countless dazzling victories over the course of the war, such as the famous Battle of Bremen, and would never suffer a tactical defeat over the course of her 56 battles in The Third Great War.`,

    'lina': `While Autistic Femcel Rizz is likely an over exaggeration on all fronts, her somewhat unconventional past left her (in her words) "undersocialized" and chronically online, mostly due to extensive homeschooling. One only needs to see the picture of her holding a katana like an anime character to piece this together. However, she has since risen past this awkward phase of her life, resolving to not be a weirdo, and over the course of 2023 to 2025 this seems to have been mostly accomplished. Her fashion sense is dramatically improved, and notably, she doesn't seem to fall back on the habit of cosplaying as Denji from Chainsawman anymore, throwing herself at the feet of other women. More importantly however, whereas she more strongly dedicated herself to the pursuit of career in the past, citing that she wouldn't feel at ease if she didn't put "pedal to the metal", she now recognizes the value of hobbies and taking some things easier, so that she can more fully enjoy all aspects of life. Once an ardent manga fan, she has since transitioned to an appreciation of digital media, in the form of photography, and dabbles in the world of "Soulslike" games. She has also begun developing a stronger appreciation of music, likely due to her association with the Golden Records club in UC Berkeley. It is still completely unclear as to why she takes several days to weeks to answer my texts, but at least she bought me McDonald's a few times so I can somewhat look past it.

She now has graduated from UC Berkeley in some kind of Biology adjacent major and is working a respectable job, all thanks to my extensive help in marking her as present in her classes so she wouldn't be graded down for attendance. She enjoys her life in the bay, where she still gets to meet her friends from Golden Records and hang out with her friends, while staying close to her mother. Did I mention she is also Wasian? Although she has yet to play this card game as of writing, I am sure it will one day happen...`,

    'united-nations-5th-army': `The most decorated and experienced Army in the entire United Nations Army, led under the famous general Maja Kaminska. The 5th Army is noteworthy for being a highly diversified and experienced force, capable of pivoting to different combat styles - over half of the units are consolidated from Kaminska's many foreign campaigns, such as the 12, 15th Iranian Engineers, the 3rd, 34th, 87th, 13th and 68th Mexican Light Infantry, the 3rd, and 5th Chinese Jian Guard, the 8th, 12th, and 2nd Brazilian Rifles, the 32nd, 28th, and 4th Indian Motorized Division, amongst many others. Masters of Kaminska's Doctrine, these units do not falter when their flanks are not strongly held; rather they feel at ease, knowing that victory is only more likely when their tactical flexibility is increased. At 5am, the 15th engineers could be digging trenches, and at 9am, they might be conducting an ambush from a nearby forested area having feigned abandonment of these trenches. Fighting under Kaminska's doctrine is often described as fighting with less so a defined rectangular or curved front line, but rather as a water puddle - the core is defined, but dramatic fluid protrusions are what define the boundaries of battle. Scholars have also speculated that the exceptional morale of the 5th Army, under Kaminska's legendary name, is what makes this battle doctrine possible, as less experienced units would be unable to maintain cohesion with such fluid battle style. In the same line of thinking, because this formation requires itself to be flexible, this army could never find itself as the anchor of the full Allied force by being positioned in the center of the front lines. Nevertheless, the 5th Army, throughout the course of the Third Great War, fought in over 50 battles, in 3 different campaigns, winning brilliant battles like the Battle of Bremen, The Battle of Poznan, and the Battle of Belgorod.`,

    'post-modernist-dylan': `A mysterious being with some divine ties, though it's unclear what his origins are. Oh wait, I do know - because I first drew him on a random piece of paper in High school and never thought about him again. Postmodernist Dylan is an utterly corrupted version of Dylan that in many ways, was quite opposite of his high school personality - Postmodernist Dylan is very keen on annihilating his enemies, reciting mantras of destruction, to the extent that it's the only thing he says. His power is great, though he comfortably still scales under more powerful universal deities like Bobby Jones, Cosmic GF, Juan Carlos, and such. HIs channels power from a corrupted Rubik's Cube, which is displayed behind him, and casts an enveloping aura that atomizes everything it touches - a prophecy states that Dylan will ascend to this powerful form when he has abandoned all his ties to Asian Girls, becoming a shell of himself. First he will become a simp, elevating then to the White Knight, before crashing and becoming the Master of SSRI's, but this is but a temporary transition. Eventually, hatred will consume the space in which he once loved asian girls with, and the Earth will tremble when the Postmodernist beast is born.`,

    'anne-stone': `Anne Stone grew up in Havano as the daughter of relatively wealthy parents, who were able to afford her an elite education and a prosperous environment to grow up in. However, being exposed directly to the actions of the Old Elite, Anne had from a very young age begun to question the legitimacy of their power, as she sympathized with the struggles of the lower class in Caribbea. At the age of 18, she attended the most prestigious college in all of Caribbea, The University of Havano, and it was there she began her study of power and politics.

During her time in university she developed very radical views, especially after reading an old manuscript from the Old Age that detailed an ideology that featured organization without authority. She started a group on campus called the "Anaquistas" advocating for this new ideology, becoming very popular over the course of a year. Her group published scathing critiques in the school newspaper, protested the Old Elite hierarchy, and distributed political flyers around Havano. Anne Stone continued to become more and more radicalized over time, eventually deciding to abandon her studies to pursue a path of violent revolution to combat the Old Elite. She fled to Caribbea, along with sixteen other club members, and it is from Caribbea in which Anne would begin to conduct acts of sabotage, burning down estates, bombing military garrisons, sinking warships, kidnapping police, and destroying roads. Anne's actions became popular with the peasantry of Caribbea, and would frequently assist Anne and her brigade with housing, food, and medicine. Many even pledged to join her cause, and by the end of the year 494 AC, her movement had accumulated two hundred members. However, hearing of Jorge Alvarez's exile Caribbea in 495, Anne saw the potential through Jorge to finally bring down the Old Elite, and decided to join him on his El Vije Del Hombre Pina, delegating command of her Anaquista movement temporarily. Throughout the course of the year, Jorge, Anne, and Rivera would go from village to village in Caribbea, helping to the best of their abilities. Eventually, when Jorge's journey began to grow in popularity, Anne invited Jorge to join her movement, stating its the best shot they had at overthrowing the Old Elite. Jorge declined this proposal, wanting to continue his current path. Anne relented at the time, but secretly began arranging operations behind his back to increase sabotage activities and to prepare for the worst case scenario. Eventually, when the Old Elite military was deployed under Santiago Alvarez, Anne initiated her sabotage plans and guerilla attacks, inflicting many casualties on the army. This caused the Army to grow frustrated, leading to the infamous massacre at Santa Rosa Beach. It was at this point that Anne had realized the gravity of her mistakes, and decided to commit herself to the path of peaceful protists as Jorge had advocated for. Together with Jorge and Rivera, they persevered over the course of the next year and eventually were able to overthrow the Old Elite, resulting in the creation of a new Caribbea under Jorge Alvarez.

From this point onwards Anne was formerly employed under Jorge's West Caribbea Trading Company, acting as the Chief Diplomat of his operations. She was the face of public relations, organized diplomatic summits between the West Caribbea Trading Company and remnants of the Old Elite, and drafted treaties and agreements. However she also played a more subtle role behind the scenes. She was also a master of political manipulation, playing a sleight hand in a variety of covert operations .She often found ways to convince people to do things that didn't want to do, undermine the economic output of an entire region from strategic embargos and shifts in trade agreements, and found ways to sway public opinion in a way to undermine the power of local governments under the Old Elite. Many lay observers have noticed that agreements between the West Caribbea Trading Company and remnants of the old Elite take the form of fairly lopsided deals that often involved cessation of land, however it was all thanks to Anne's secret operations which made such a deal the only option for these Regional Elites.

Over the next 14 years Anne would help Jorge build up the prosperity of the West Caribbea Trading company, acting as his trusted aide alongside Rivera. However, information brought to her by her sources from around Caribbea have pointed at the possibility of the existence of an entire civilization out in the Western Seas, which would be dramatically consequential for the future of the West Caribbea Trading Company. Already, Anne has begun probing and speculating on potential actions and preparations should such a civilization actually exist...`,

    'makenna': `Makenna Parker is a fifteen-year-old girl who moves from Michigan to Costa Rica with her father, Dr. Parker, an ecologist who studies birds. Makenna is unhappy about leaving behind her friends, her horse Bender, and the memories of her late mother, who died in a car accident several years earlier. At first, she struggles to adjust to her new home on a rural ranch, where she meets Cecilio, the ranch's security guard, Margarita, and Margarita's daughter, Inés. Although she misses her old life, Makenna gradually becomes more comfortable as she learns about Costa Rica and helps care for the birds at the ranch.

As Makenna settles into her new surroundings, she begins to notice strange events involving the birds. She discovers that a group of criminals is secretly capturing and stealing valuable birds to sell on the illegal wildlife market. With the help of her new friends and her father's knowledge of the local wildlife, Makenna starts gathering clues about the people responsible. The deeper she investigates, the more dangerous the situation becomes, as the smugglers realize someone may be uncovering their operation.

Eventually, Makenna and her allies expose the illegal bird-trafficking ring and help bring the criminals to justice. The stolen birds are rescued and returned to safety, protecting the wildlife that Dr. Parker has worked so hard to preserve. After everything she experiences, Makenna begins to feel at home in Costa Rica and develops close friendships with the people she has met there. By the end of the story, she has accepted her new life and looks toward the future with much greater confidence and hope.

However this was only the beginning of Makenna's story. She later on would become an intern at MINAE (Ministry of the Environment and Energy), where she would witness the constant bird thievery that plagued Costa Rica, observing first hand that MINAE resorted to shallow words rather than decisive action. Outraged by the lack of progress on MINAE's part, Makenna decided to take matters into her own hands one day by tracking down a group of bird robbers and gunning them down in broad daylight on the streets of San Jose. This story made national headlines, and Makenna was due to be put on national trial as her actions constituted first degree murder. However a large portion of the population sympathized with McKenna's cause and thought her actions were reasonable, and one day a large mob of thousands of protesters marched upon the City prison and personally freed her. The Army was called upon to put down this protest to send McKenna back into jail, but after meeting fierce resistance and being convinced by McKenna's rhetoric, the army laid down their arms and pledged loyalty to McKenna instead. With her new found power, McKenna recognized that she now had the capabilities to make change herself, and so she marched her Army upon The Legislative assembly, dissolving the government and declaring herself as The Supreme Leader of Costa Rica

At this point, in the year 2030, McKenna would go to work and establish the Bird Cult of Costa Rica, a religious organization that worshipped Mimi, Makenna's first bird, as a god. MINAE was granted effective control of the Costa Rican military, and became a violent paramilitary organization in which mercilessly executed anyone who would cause harm to the environment. The MINAE "Death Squads" became infamous for having killed hundreds of individuals, not just bird robbers but also careless campers, tourists, litterers, and factory owners. Makenna solidified her dictatorship with the 17 Points, which mentions but is not limited to complete subjugation to avian-kind, the inherent superiority of birds, the divinity of Costa Rica"s natural environment, and to pledge one's entire existence to Makenna's personality cult. However, Makenna's reign was challenged by Juan Carlos, the robo en la noche who started it all, as it turns out he was a galaxy level being whose power could not be matched by the Death Squads. From the years 2031-2032, Juan Carlos organized his own counter revolution, using his impeccable abs and long, golden hair to draw many to his cause. Eventually Makenna's tyrannical reign came to an end when a cannonball blasted a hole clean through her stomach.`,

    'johnathan-kirby': `Jonathan Kirby was born to unfortunate circumstances in Irvine as a product of one of Dylan Kirby's (Future president of the United State of America) many relations during this time, in the back alley of a Taco Bell. Jonathan's single mother was unable to support him, and after some research she found another one of Dylan's romantic partners and she offered to help raise Johnathan alongside another one of Dylan's children, Marie L'amboure. Dylan's surrogate mother was quite wealthy and as a result he was able to grow up in a fairly large mansion on the coast of Santa Barbara. He lived a good life despite his absent father, growing close to his half sister Marie as they would often play on the beach after school, collecting seashells and playing in the water as sunset fell.

For college Jonathan found himself in the University of Melbourne, where he studied international relations and achieved strong marks during this time. He began work in Government for the Australian Labor Party as an assistant, and eventually was propelled to household notability when it was revealed that he was related to American Senator Dylan Kirby, who had become infamous during this time for his countless affairs across decades, resulting in 17 children. Jonathan Kirby continued his good work and eventually became the Prime Minister for the Australian labor party in the year 2050. Jonathan became notable for recognizing the concerning pattern of world tension throughout the decade, and advocated for strong defensive policies which were popular amongst not just the people of Australia but the entirety of the British Commonwealth. Hence Johnathan began drafting a famous document which would become known as the "Christmas Day Charter," in which would effectively coordinate and unite all of the armies of the Commonwealth back under the banner of the United Kingdom. On December 25th, 2051, he gave a famous speech in London which celebrated the final signing of this document, in the presence of not only representatives, presidents and prime ministers from all of the Commonwealth Nations around the world, but also before the king of England himself. It was considered to be one of the most monumental days in all of the history of the United Kingdom and The Commonwealth of Nations, effectively perceived as one final alliance before the end. Celebrations were brief, as Jonathan Kirby visited his hometown Santa Barbara one last time with his sister Marie L'amboure, reminiscing about their past childhood, before the onset of the Third Great War on January 16th, 2052.`,

    'alondra-hopkins': `For as long as Alondra could remember, she was raised to be a Warrior by the Scarlet Legion, a mercenary group who revelled in the joy of battle. This group cared little for coin, as they treated combat as the utmost expression of art, taking pride in their unmatched skill and prowess and the cruel violence of war. The entirety of her youth was spent on the art of killing, learning not only technique but also the ideology and mindset of a fighter. While Alondra was clearly prodigious in the art of combat, the ideology itself fell flat - Alondra would describe that she did not enjoy battle in the same way as the rest of her comrades did, but continued on this path anyways because she lacked any other purpose in life.

Already by the age of eight, Alondra was superior in skill to most adult fighters, her blistering speed creating openings before her opponents could even react. Individuals in her age group were not even worth a consideration at this point, as they were astronomically below Alondra's combat abilities. Recognizing her immense talent, the Scarlet Legion specially trained her with the full extent of their best resources, dedicating their best fighters to privately maximize her abilities, and already at the age of 12 she was deployed to her first battle, at Bluerocks Beach. It was here that she immediately began her campaign of onslaught, defeating 18 opponents and bringing their heads to her lead Commander. From this point onwards she would be deployed at any given opportunity possible, accumulating 286 kills by the end of the year. Already many in Pacifica feared her abilities and from this young age she was given the name the "Child of War." For the next 5 years she would continue to campaign all over Pacifica, eventually reaching a point where she had full autonomy of where she chose to fight in battle. She would often single-handedly wipe out entire formations by herself, blitzing and decapitating men within seconds. After her second year campaigning, entire formations would rather choose to run away than face her head on. Her name commanded such a tremendous amount of fear and respect that even that Legion themselves were unsure of how to plan for the future. Many within the ranks of the Legion already presupposed Alondra should become the next Patriarch of the legion, despite the fact a woman never became the Patriarch before. However, many within the ranks of Scarlet Legion feared the potential power she would wield, and have already begun plotting potential methods of assassination.

However these plots would never come to pass, as throughout the course of the past 4 years Alondra had begun to develop doubts about her current path. She had grown to hate the killing she was inflicting on seemingly innocent individuals, and had become thoroughly affected by the lives she had taken. She witnessed families being broken, children left without their parents, and lives ruined because of the Scarlet Legion. Although she had never expressed it outwardly, Alondra had already made the determination to repent.

In the year 494 AC, Alondra arrived at the Capital stronghold of the Scarlet Legion on Farron island, a tall imposing Fortress meant to ward away invading fleets and hundreds of men. Alondra entered the keep and single-handedly dispatched the entire stronghold, killing dozens of Scarlet Legion soldiers and eventually decapitating the Patriarch herself. She claimed the Throne of the Scarlet Legion and dispatched an order, demanding that the entire Legion obey her will. Despite the betrayal, none dared to resist her, and so when she called upon the entire Legion to rendezvous at the island in order to be given direct orders, all came to pay their respects. However it was during this time that Alondra revealed her intention to disband the entire Legion, and although some would try to resist, Alondra quickly dispatched of these individuals. The rest of the Legion obeyed her orders and scattered across all corners of Pacifica, and from this point onwards although the Scarlet Legion would no longer exist, remnants still loyal to the old idea of Scarlet Legion continued on as a separate group known as the Oathbound Fighters.

From this point onwards Alondra resolved to right the wrongs she had committed in her life, and decided to fight for the side of the people. Her reputation of being feared was quickly turned into that of wide admiration, as she traveled across all of Pacifica ending conflicts, singlehandedly forcing factions to make peace, liberating captured cities, and scattering hostile pirates. In the year 502 AC, Alondra would become the Pirate Queen of Panacea, the capital of all of Pacifica, and her presence alone on the Council of Pirates guaranteed that all the major factions of Pacifica remained at peace for as long as she lived.`,

    'zsofia-szocs': `Zsofia and her brother Rozsi were orphaned from a very young age and transferred to an orphanage in Prague, where they spent the first five years of their life. One day, a man by the name of Sebastian Janowicz desired to adopt the two siblings together, although he had barely interacted with them. Strangely enough this request was accepted, and both Zsofia and Rozsi moved to the small mountain town of Wodny Potok, nestled within the Carpathian Mountains in Poland. There Zsofia would spend the rest of their childhood in this town, with not only Rozsi but also Květka Svoboda, a girl who came from the same orphanage, and Felicyta Janowicz, the biological daughter of Sebastyen. The four of them were given a world class education by the top tutors around the world, spending several hours a day of focus studying. Although the reasons for this level of education was initially unknown, it was revealed to Zsofia at the age of 12 that she an Rozsi were the long lost descendants of Matthias I, one of the greatest figures in all of Hungarian history. Sebastyen intended to use her lineage as a means to eventually propel her into becoming the Monarch of Hungary, alongside her brother Roszi.

Although Zsofia initially opposed this arrangement, alongside the rest of her siblings excluding Felicyta, they ultimately still loved life in Wodny Potok and did not want to leave. Whenever they had a respite from studying, Zsofia would often go to Krakow with Květka and Rozsi, spending an extravagant amount of money on clothing, jewelry and other similar items. Life in Wodny Potok was by no means poor in the traditional sense either, as although it was uneventful, this was buffered by the fact that their private chef, Wojciech, was an excellent cook and prepared delicious feasts every single day and told unbelievable stories from his time in the military. On chilly winter evenings, the Janowicz family would sit by a roaring fireplace and roast chestnuts, play board games and watch cozy Christmas movies.

For college, Zsofia would attend Eötvös Loránd University with Rozsi, where she excelled and participated in a wealth of extracurricular and curricular activities in politics, acting as a speaker at large conferences, making impactful research papers, and spoke at a United Nations summit in New York, all arranged by Sebastyen. Shortly after she graduated, Sebastyen was able to pull further strings and grant both Zsofia and Rozsi fast tracked positions to become parliamentary assistants to a member of parliament, and behind the scenes began to arrange for their eventual ascension as full parliament members. Given the political climate that Sebastyen had meticulously devised for the last twenty five years, in 2035, Hungary was by this point primed for a monarchist revival which longed for a return to historical roots. Media campaigns focused on the achievements that the Kingdom of Hungary had procured in the past, and pointed to the failing democratic apparatus of Hungary, how it was clear indication that the ascension of an Authoritarian leader is the will of the Hungarian people. Rozsi and Zsofia were both propelled to national fame when stories of their childhood and college achievements reached the public eye, and this was further exacerbated when it was learned that they were the direct descendants of Matthias I. This realization all but solidified their status as National icons, and by the year 2038, when it was clear that the democratic apparatus was about to fail, Rozsi and Zsofia were advocated by the Hungarian People to take the reins of the failing state and restore The Kingdom of Hungary.

In 2039, Rozsi and Zsofia were crowned as the twin monarchs of Hungary, and their reign for the next decade was characterized by strong domestic reform. While Rozsi was the better speaker and more so the figurehead, Zsofia acted as the administrator. However, they were well aware of the political climate, particularly in neighboring Russia and Yugoslavia, and opted for a high focus on National Defense. The two of them would often collaborate on the best path forward, and constantly shared ideas with one another. The army was expanded, propelled by propaganda that glorified the Hungary of medieval history, and the standing manpower of Hungary increased from 70k to 300k. Defensive fortifications were constructed from Lake Balaton along the length of the Danube, and the expanded war industry found themselves well behind this line of defense. This drew some critiques from the populace, as it seemed most development was going to the north western portion of Hungary, but this was buried by the overall economic growth in all sectors of the economy nevertheless.

However, Zsofia's issues were not only in the realm of government. Zsofia also found herself at odds with Felicyta, now the Queen of Poland, due to her expansion of the military. At an informal picnic along the Danube in 2044, the two of them discussed the future of their countries. The siblings could not see eye to eye, as Felicyta thought Zsofia was making the political situation worse in Europe by resorting to the building up of arms. Zsofia insisted that it was in the best interest of the Hungarian people, but Felicyta thought she was dooming her people, as they could not realistically hold against both Russia and Yugoslavia. It was at this time that Felicyta revealed she was planning on surrendering immediately if war did start, which Zsofia vehemently disagreed with. Citing feelings of betrayal, Zsofia left the conversation immediately. The two siblings, although they would be present together for many conferences for years to come, continued these debates even into the Third Great War.

At the outbreak of the Third Great War, the defenses that Hungary had built up did play a role - the Comintern advance was stemmed, but Hungary fell regardless on the 14th of April, 2025. The Hungarian government became a government in exile, ruling from London. Zsofia at this time lost her composure somewhat, as she felt she had not done enough for her people, and was visibly stressed. Her brother helped guide her through these times, and the Twin Monarchs successfully maintained the spirit of the Hungarian Nation, often seen interacting with soldiers of the Hungarian Army before deployment. Zsofia would continue the rule of her country from London until the liberation of Budapest in early 2054.`,

    'minae-death-squad': `When Makenna took control of Costa Rica in 2030, and declared it to be a Fascist State, one of her first reforms was to ensure that MINAE (Ministry of the Environment and Energy) no longer exhibited the same soft rhetoric that it used to when it came to preventing criminals which would harm the environment. Immediately, she dissolved the Costa Rican military and transferred its assets to MINAE, then initiated mandatory religious reform upon MINAE, following the tenets of her Bird Cult. Fanatical ministers became platoon leaders, and former soldiers of the army were integrated into MINAE, and soon enough MINAE became a deadly paramilitary force that operated on a fanatical religious doctrine, treating the environment as a sacred entity.

In an effort to prove their worth, and masked as a religious cleansing, MINAE was deployed all around Costa Rica to hunt down bird robbers. They were granted full legal immunity for their killings, and were encouraged to kill as many bird robbers as humanly possible. Over the course of 2030, the MINAE "Death Squads" became famous for conducting night raids and patrols, gunning down anyone they saw to be poaching wildlife. Bird poachers in particular, in line with the Bird Cult religious doctrine, were to be tortured before being executed. In the doctrine of the Bird Cult, the killing of poachers was seen as the most morally righteous action one could take, as it proved to the utmost extent, that "Avian-kind was above all," even human lives. Eventually, when it became clear that all of the wildlife poachers had either fled or been killed off, the MINAE Death Squads expanded the nature of their hunt to execute anyone seen harming wildlife in general, such as careless campers, tourists, litterers, and factory owners. Videos circulated online of MINAE Death Squads hiding around street corners, waiting for someone to drop a cup of coffee, then rushing out and brutally executing the "criminal in broad daylight".

Eventually Makenna's BIrd Cult grew vastly unpopular in Costa RIca, and consequently the Death Squads had to combat the populace too. The Death Squads were responsible for brutal killings of anyone seen defying the Bird Cult, such as protestors and common civilians, and on one controversial day on November 24th, 2030, called "The Night of Purification," hundreds of Death Squads swept the streets of San Jose, barging into homes, and executing anyone suspected of being a counter revolutionary. In 2031, tensions reached a breaking point, and a popular revolution led under a man by the name of Juan Carlos began, which ultimately led to the fall of the Death Squads. For an unknown reason, many in the MINAE Death Squads spontaneously defected to the revolutionaries, crippling their manpower, and over time this led to the Death Squads being driven back. When Makenna was killed in 2032, the MINAE Death Squads put down their arms and surrendered, as by this point the delusion of the Bird Cult had worn off after months of Civil War and bloodshed.`,

    'carolyn': `Throughout her entire life, Carolyn was shy, and kind of a weirdo. She kept her head down and focused on her studies, while enjoying hobbies such as watching streamers, playing video games like Genshin Impact and Hoi4. She was a huge number cruncher, always finding the best way to optimize a build through hours of experimentation and calculation, often posting her findings on Reddit. She despised hanging out with other people, as she thought they were shallow and too extroverted to talk to. However, she has a deep love of sweet drinks, and claims to drink more soft drinks than water.

In 2026 when she got into UC Berkeley, she met her Unit 1 roommate, Lydia, during Golden Bear orientation. It was here that she accidentally not only stepped on, but cracked the Berkeley seal (after dropping a matcha latte on it). As it turns out, the superstition of the Berkeley Seal (that you wouldn't get a 4.0 gpa if you stepped on it) was true, albeit in a roundabout way - stepping on the seal unlocks "The World of Weird," subjecting oneself to talking dining hall cookies, apparitions of Karl Marx, legions of undead hippies, and giant crayfish from Strawberry Creek. How could one possibly get a 4.0 when an apparition of Pol Pot is breathing over your shoulder during a CS61B exam? However, with the seal cracked, the "World of Weird" leaked uncontrollably into the environment, and Carolyn, alongside Lydia, manifested random powers - after watching their GBO leader get beheaded by a giant crayfish.

Carolyn and Lydia were saved by a strange man who called himself Billy (Known to the people of Berkeley as the "X man in front of Sather Gate"), and Billy taught Carolyn the true nature of her powers - that she could manipulate the space around her to cause "all probabilities to become equalized," meaning that anything can and will occur around her - a fire hydrant might turn into a giant balloon elephant and then explode, or a nearby car might start singing, blasting radioactive waves through its asshole. However, Billy emphasized that with the seal broken, it is unclear if he could continue to protect Berkeley any longer, and that Carolyn might need to one day contribute to protecting Berkeley. Carolyn ultimately was afraid of her powers, and decided to hole up in her room as much as she could instead. However, with the World of Weird permeated about her, she could hardly relax anyways. Deciding to finally take matters into her own hands, she and Lydia together purged Unit 1 of all elements of Weird, and Carolyn accidentally created a powerful forcefield around Unit 1 when she was trying to make The King Crayfish explode.

It was at this point that Carolyn decided to continue to hone her powers, partially because she actually had a cool power, but also partially because it helped her with her physics homework. As time passed she grew more and more confident, especially after having defeated the Lord of The Gays in single combat after a dispute over thongs. However, with the death of Billy after midterms, Berkeley plunged into even more chaos, as its greatest protector had fallen. Carolyn and Lydia were forced to step up in his place, and after learning that Evans Hall was the source of all weirdness in Berkeley, realized that they had to find a way to get into the center of Evans to contain The Weird once again.`,

    '1st-us-marines': `Especially after the Great American Plague in 2042, America was not notable for its particularly skilled infantry, ever since the doctrinal shift to air and sea in 2034. However, the need for strong marine forces remained imperative, as it was necessary for naval invasions to extend control of territory past just the sky and water. The 1st US Marines is the most elite Marine regiment in the entire United State of America military, trained to create beachheads and breakthroughs swiftly after being deployed by landing craft. Although speed was an important factor in their offense, so were their famous Byron Shotguns, the only shotgun that existed for plasma tech at the beginning of the war. It was capable of launching a wall of nine beams at close range, making it the superior choice for close quarters combat, alongside being very light and smaller than traditional rifles.

The 1st US Marines were first deployed at the Battle of Stuart's Island, intending to capture a supply depot for advancing Soviet forces. The marines made a decisive breakthrough against a concentrated force of the 48th, 123rd, and 56th Soviet Rifles, suffering high casualties (30%) but completely destroying the 48th Rifles and achieving their objectives, leading to the fall of the island. The fighting was highly dispersed as a result of the hilly and forested terrain, but ultimately the superior speed of the US Marines prevented all three enemy regiments from linking together. US commanders noted the victory at Stuart's Island, using it as a point of reference for future naval invasions. Taking upon the lesson from Stuart's Island, recognizing that such high casualty rates were not sustainable for an elite unit, The US military strictly utilized the regiment to create an opening, rather than to continue to push in to exploit such an opening. Prolonged combat naturally bogged down the cohesion and consequent speed of the unit, and so in order to maximize effectiveness combat would be quick but intensive. At the Battle of Kimsquit, the 1st Marines made a rapid breakthrough within eight minutes, routing the entrenched positions of the 67th Soviet Rifles in close quarters and brutal combat, and allowing the 34th Virginia Rifles, 12th Californian Infantry, and 13th California Infantry to secure the island. The Byron Shotgun was highly effective in this battle, making opposing trenches almost a liability rather than advantage. The US Marines would continuously be deployed throughout the West Canadian Campaign, successfully conducting eight naval invasions and only failing once.

Eventually after the West Canadian front had stabilized, the 1st US Marines were taken to the European theater, where they conducted two naval landings in Germany before being redeployed to the Pacific in 2053. In tandem with the now revitalized US Navy, the 1st US Marines were a key asset in the Aleutian campaign and the Kamchatka campaign, creating brief but devastating breakthroughs within minutes of deploying from their landing crafts and allowing scores of other regiments to flood in. Their greatest challenge came in the Invasion of Vladivistok, where they took upon an extremely fortified position on Russkiy Island, lined with dozens of forts and a thick line of three Russian regiments, nestled behind a line of trees. Recalling their very first victory also against three regiments on Stuart's Island, the regiment initiated a daring maneuver where they drastically loosened the formation, only to at the last minute quickly funnel back in to make a breakthrough, despite being showered on the flanks from the other two Russian regiments. After the victory at Vladivistok, the 1st US Marines would be continuously deployed in the Pacific until 2054, when they would begin a short campaign in China.`,

    'kvetka-svoboda': `Květka Svoboda was brought to an orphanage in Prague when both her father and mother abandoned her at a young age, staying until the age of seven until she was adopted by Sebastyen Janowicz alongside Rozsi, and Zsofia Szocs. Květka met Felicyta Janowicz for the first time at this moment, and would grow exceptionally close to her over the course of their childhood.

Květka moved to Wodny Potok, a small mountain village in the Carpathian Mountains. Life in Wodny Potok, although uneventful, was quaint and idyllic - Květka in particular enjoyed hiking through the mountain forests, playing in the snow, and talking to the villagers of Wodny Potok. She would accompany the family housekeeper, Wojciech, on fishing trips frequently and together they would bring back scores of Brown Trout in order to cook for the night's dinner. Květka loved talking to her sister Felicyta, and together they would go around long walks in the town. They often shared secrets with one another and participated in all manner of activities together, whether it was watching T.V, studying, or having a snack at the kitchen counter. She often would try to encourage Felicyta to find some hobbies of her own so that she wasn't just studying for most of the day, but this was to no avail. Regardless she was incredibly supportive of Felicyta, often taking care of her whenever she was sick. One of Květka's main hobbies during her childhood was playing the ukulele, which she was infamously very poor at it - she was dubbed the Demon of the Ukulele by her siblings.

However, due to the high expectations of their father, Sebastian Janowicz, who was the leader of Visegrad during this time period, Květka spent a large chunk of her time being homeschooled by private tutors, given a world class education. Kveka was often sent away to participate in extra curricular activities like debates, conferences, and educational excursions around the world, as a means to boost her achievements from a young age. As it turns out, Sebastian intended for the four siblings to eventually take the mantle as Monarchs or leaders for each of the respective nations, and in this case Květka was expected to become the President of the Czech Republic.

For college, Květka attended Charles University in the year 2025. Shortly after graduating, she was granted a position as a senator's aide, working in politics for the next few years. Whereas her siblings Rozsi and Zsofia were to rely on their heritage as being descendants of a great Hungarian king to be propelled into fame, Květka had to be guided through the political ladder in order to achieve the same status. Her senator appointment was one of the most recognizable politicians in the country, known for his defiance of political opponents, ability to judge the economic situation of the country well, and having guided the country through the 2027 Silicon Valley Crash. She worked hard to prove her capabilities, and was praised by the senator for her efforts and clear intelligence. Hence Květka became a notable figure in the ANO 2011 party, a right wing populist movement, and continued to handle administrative tasks and coordination for the next several years. In 2029, when the senator age threshold was lowered to 22, thanks in part to some political maneuvering on Sebastyen's part, Květka was able to run for senator and win in 2029, representing District 6 in Prague. She would enact strong policies around Education, dramatically improving test scores around her district and increasing student happiness. The Czech Technical College in district 6 rose dramatically in ranking during this time, moving from #400 to the #98.

Initially, Sebastyen had planned for Květka to become the President of Czechia, and her current trajectory reflected that. However, Sebastyen's nurtured Monarchist movement in Hungary and Poland achieved unexpected success even abroad, fairly unintentionally, and Czechia found itself well within the currents of that movement. Recognizing that their strategy had to change, but also not to fall back on a glorious lineage like in Hungary, Sebastyen devised a scheme to propel Květka into the conversation in 2035. Hiring the best screenwriters and filmmakers in Europe, he commissioned a movie called "The Bohemian Queen", utilizing Květka's exceptionally good looks as a means to make her a movie star. Květka, although generally open to such experiences, was not fond of her father controlling her life to this extent, and forcing her to become a movie star against her will. However, not wanting to create family friction, Květka beared with the process and tried to not think too hard about it, announcing her retirement from her senator position. In the release of the movie, timed with large, Pro-Monarchism marches in Poland and Hungary, and having circulated widely some of Květka's exceptional achievements in college, as a senator, and in her childhood, one question floated around popular discourse after the movie was released - "Wouldn't she make a good queen in real life?

From this point onwards, Sebastyen helped launch massive Monarchist Marches in Prague, centered around the conversation of making Květka the Bohemian Queen. Unintentionally during this time, interest in creating a united Czechoslovak nation also soared. In 2037, after having developed enough momentum, a referendum was held in both Czechia and Slovakia, resulting in the Declaration of a Monarchy, one in which would be chosen by the people. Květka naturally made the conversation, and after a long series of political maneuvers in which discredited her opponents, Květka won the bid and became The Bohemian Queen in August 18th, 2037.

Květka's domestic policies centered around the continuous expansion of Education and tackling inflation. Over the course of the next eight years, three Czech Universities would make it into the top 100 of world rankings when there had been none even in the top 200, and secondary and postsecondary education was reinforced with a revitalized curriculum devised by Květka herself. Titled the "Svoboda Method," she drew upon the brilliant tutors in her youth to help map a more comprehensive curriculum that encouraged creative thinking and philosophy more strongly than before. Drawing upon the lessons of the senator she had worked under, she managed to stem inflation down to a respectable level thanks to the careful management of energy resources. In the international sphere however, Květka found herself in a difficult position. By 2045, all of her siblings had ascended into their planned positions - Felicyta as Queen of Poland, and Rozsi and Zsofia as the twin monarchs of Hungary. Sebastyen had begun aging during this time, and played less of a role in Visegrad politics. As a result, disagreements ensued over the siblings, particularly with Felicyta and Zsofia on the topic of militarization. Květka took a neutral stance, but generally sided with Felicyta internally - she did not pursue policy that would encourage militarization for most the decade, but was aware of the precarious state of tension in Europe. It was not until 2051 when Květka would order some form of militarization, when it became glaringly obvious that conflict was looming, and it became a necessity to make some form of military preparation as a way to pacify the concerns of the population.

At the outbreak of the Third Great War, Květka remained in Prague for the duration of her country's five month resistance against the Comintern forces, although she was not known to be a particularly encouraging leader. Rather she focused on maintaining the stability of the country so that collapse did not occur, ensuring that resources were distributed accordingly so that theft and starvation did not occur despite encirclement. Her War Rations act in January of 2052 properly allocated foodstuff so that the military were able to maximize the amount of food they had access to, while making sure civilians were not malnourished. It also maximized the production of the most amount of crops with as little land as possible, establishing the bare minimum for a healthy amount of diversity. Květka explicitly did not want to engage in any form of siege warfare and so she advocated for the construction of fortifications around Prague as a main system of defense for the oncoming invasion. When Czechoslovakia inevitably fell in May of 2052, Květka's government moved to New York in exile. From exile she would continue her mediation between Felicyta and Zsofia, focusing on bringing them back together.`,

    'south-wind-spearman': `Above all, The South Wind Islands embody the Ideas of pragmatism and stability within their nation. For hundreds of years the factions of Pacifica would often rely on mercenary groups in order to engage in warfare with other factions, resulting in not only unstable agreements, but also incurring a heavier cost. However at this point most faction leadership had not developed sufficient organization yet where standing army was possible, as civilians populations more so see themselves as external forces that happen to be within the geographical area of a faction rather than being a part of it. However the South Winds Islands became one of the first factions to cultivate a form of united identity, bringing the civilian population more closely with the ideals and principles of the leadership. This initiative only occurred in the first place because of the recognition that mercenaries were far from reliable to the cause of one's Nation - They often engaged in acts of betrayal, defecting to those who could pay higher amounts of coin. Thus a national identity was necessary in order to establish a standing army that was loyal not to whoever paid more but to the actual Nation they lived in. It was simply the more pragmatic and stable option.

However besides being one of the largest nations in Pacifica, The South Wind Island"s strength came from their diplomatic agreements with other islands nearby, often offering protection in exchange for goods, services, and favorable trade - this required that the South Wind Islands invest significant efforts into protecting these nearby islands. With a large standing army, this meant that mercenary contracts did not need to be paid out as often and thus could result in much more efficient expenditure of coin.

In the year 326 AC, the South Wind Islands announced a new conscription law which required male civilians to be drafted into the standing army of the nation, serving in quarter year deployments from ages 20 to 32. The reason for this choice was because of the possibility of incurring large amounts of general dissatisfaction if a large portion of the population was drafted at the same time. As a result of this new conscription law, the South Wind Army was able to field at any given time about 3,000 soldiers, over 6x more than the average faction, at a fraction of the cost of mercenaries.

Notably, one of the main characteristics of the South Wind Army was their famous South Wind Spearman. As stated before, The South Wind Islands were very pragmatic - They already controlled a very large swath of territory, so the need for expansion was not by any means necessary as opposed to simply developing what they already had. Hence, the need to actually attack other factions was completely unnecessary. Understanding that attacking expends more resources and simply defending, the Southwind Spearmen's armoury and doctrine manifested as a result of that calculation. Broad shields, revolutionary chain mail armor, and long, warding spears, the South Wind Spearman are the ultimate defensive Force. Their military training did not focus on individual combat or lethal weapon skills as much as maintaining cohesion, morale, and organization.

Very early on, the South Wind Spearman enjoyed tremendous success. Enemy formations were unable to break their discipline and cohesion, and often they found themselves tiring out as a result. Attacks simply floundered, and offensive gains could not be meaningfully progressed. In the famous battle of Flora Islands in 380 AC, an entire mercenary battalion (three hundred soldiers) from the Scarlet Legion were unable to break a formation of just two hundred spearmen, finding themselves exhausted and trampled after several hours of combat. For the next 50 years, the South Wind Spearman prevented any more offensive from being launched on their home territory, but soon enough doctrinal shifts occurred which speculated on the use of South Wind offensively, particularly in tandem with mercenaries. Southwind Spearman would hold the main line, while elite offensive units would flank around and collapse enemy forces. In the battle of Black Crag Bay in 445 AC, this strategy worked to tremendous success against the Petronas Faction, annihilating an army of 800 men while suffering less than twenty casualties.

However, despite the potential, leadership of the South Wind Islands remained pragmatic, and avoided offensive military campaigns when they weren't necessary. South Wind Spearmen would engage in minor campaigns in 462 AC, 465 to 466 AC, 476 AC, and 482 AC to 483 AC, conquering rebel groups and breaking up the power of rivals whenever they began to grow threatening. By the year 500 AC, The South Wind Spearmen boasted 12,000 soldiers in their ranks. Despite the lack of combat experience, it is universally recognized that the Southwind Spearman are the premier military force of Pacifica, representing the perfect example of a stable, consistent, and professional army.`,

    'henry-dong': `Henry's early life was uneventful, growing up in a relatively unknown suburb in Southern California. However, due to lack of opportunity after graduating high school, Henry found himself in Russia attempting to start a new life there in the year 2022, working an undesirable job at a metal factory. While working at this job from the years 2022 to 2025, Russia began to experience significant instability within their nation as long standing leader Vladimir Putin unexpectedly died of heart attack in the year 2023, leading to political chaos as a proper successor was not determined. While working his job, Henry had started to become politically radicalized, observing the unequal treatment that the lower echelons of society had to experience compared to the rich oligarchs in Moscow. He had begun reading the works of Karl Marx and Mao Zedong, learning about various communist ideologies and developing his own thoughts around them. Henry followed the political developments in his country, but ultimately was unable to take any form of significant action. However, Henry did hope that one day a form of Communist leadership would take over Russia and fix the many issues that the country was experiencing.

In 2025, an unexpected closure of his factory resulted in Henry being left completely unemployed, which resulted in him taking to political activism to fill this time. He joined a niche underground Marxist movement, participated in far left rallies in Moscow, and was able to publish some minor papers under his name, gaining some recognizability in the Far left community in Russia. It was clear that he was an excellent orator and writer, able to elicit strong emotions from his readers even if his political ideas were relatively underdeveloped. Henry was promoted to some notability within his Marxist group, organizing protests and continuing to write political works as his main role. It was in mid 2025 when a strong authoritarian leader, Boris Abashev, took control of the government and attempted to reestablish the status quo that Putin had left behind, mobilizing the Army to crush protesters and clamping down on the various political movements to develop traction. On December 6th 2025, Henry was arrested by Russian police and sent to prison for his political activism, after being abducted while conducting a protest. In 2026, with the controversial re-establishment of work camps as a way to put political prisoners to work, Henry was transferred to the Far East to work at the Udokan copper mine in Zabaykalsky Krai, an extremely remote region of Russia.

It was at this point that Henry thought his life was over, as there was no realistic situation where he could escape the Work Camp. The work was long and arduous, and there was little prospect that he would be released anytime soon. However, it didn't take Henry very long to realize that many who worked in this mine were typically very radical political prisoners, who often sympathized with his ideas, even if they believed in variations of leftist ideologies. It was here that Henry met three similarly minded individuals - Svaski Kunetsov, Iosif Arapov, and Ivan Paltsev. Frequently, at the bar after work where all the workers gathered in order to drink beer and take their only hours of respite, Husky Yosef Ivan and Henry would often speak of their beliefs and ideologies, debating but refining each of their individual ideas. The other three quickly recognized Henry for the work he had conducted in Moscow, after learning that they had all in fact read his articles and participated in protests that he had organized at least a few times.

Over the course of the next several years, the new Russian government under Boris Abashev would continue their repressive campaigns, securing the silence of opposing political movements at the cost of high instability and tension within the populace. Although the Army and new government reigned supreme, it was clear and well acknowledged that most of those who lived in Russia were unhappy with the current political situation, but ultimately had to repress their thoughts. Those who were caught by the government were sent to work camps, which had begun to spring up all over the Far East, which often were intended as prison sentences for one's entire life. Over the course of the next decade, over 50,000 political prisoners would be scattered around the Work Camp to the Far East.

During this time Henry and his comrades, as he would grow to call them, had to begin to secretly spread their political ideas to the rest of the several hundred prisoners within the mine. Henry's ideology had also matured, moving past traditional Marxism and focusing on a modern reinterpretation, centering not any one social group as paramountly important, such as the workers or peasants, but reframing the issue as "The regular people versus the extravagant oligarchs," taking an internationalist stance that saw the need for Communism to coexist with world ideologies rather than actively in conflict. By the end of the sixth year, right under the noses of the Russian government, the Udokan mine had secretly become a Marxist stronghold - The soldiers, overseers, and engineers who supposedly had been working for the government were already by this point converted or secretly assassinated, acting as double agents to give the impression that things are proceeding as normal. Henry had become the main ringreader, giving passionate speeches in front of the entire workforce, coordinating activities, and managing the resources of the mine. Secretly Henry had started keeping a large vault of money and materials within the mine, to one day use as a means to conduct sabotage operations. Because of how the mine was so remote, there was a large amount of liberty in which actions could be conducted in the mine without anyone knowing - Henry ordered Iosif and Ivan to conduct military training operations, as they had previously been soldiers in the Russian Army, and Svaski was ordered to manage construction of basic weaponry within the factory. Henry only intended for them to carry out small scale sabotage operations, becoming a guerilla movement in the Far East which would constantly harass the Russian government. However, as Henry continued to observe the situation in Russia, he felt as if the government was making a huge mistake. Henry predicted that by the year 2035, over 80,000 political prisoners would be located in the Far East work camps, all relatively within range of the Udokan mine, and far away from the main centers of Russian power. This meant that if a large enough number of political prisoners in the East could rally together, they could actually initiate a full revolution from a relatively secure position, able to consolidate much land before the Russians could react. In 2032, Henry named his three comrades as his Marshalls, and would begin large-scale preparations over the course of the next few years.

In the year 2035, Henry's opportunity came - the Russian government collapsed on February 25th, during what would be called the February Revolt, splitting into four competing factions between the Oligarchs (The Russian Federation), The Democrats (The Democratic League of Russia), and the New Authoritarians (The Russian Greenshirts). Although the Russian Federation still held a substantial part of the army, controlling almost 40%, the army still found itself in a state of disarray. Consequently Henry mustered his Marshalls and his workers and declared The Neo Soviet Union, marching out from the mine and immediately conducting a large-scale campaign, focused on not just liberating work camps, but also bringing them under his fold. For over half a year, Henry was completely uncontested in the east, moving freely from work camp to work camp and liberating hundreds at a time, resulting in the recruitment of thousands monthly. By the end of 2035, Henry had liberated all but a handful of work camps in the East, recruiting nearly 40,000 political prisoners to his cause. In addition, Henry spent a significant amount of time spreading his ideology throughout the civilian populace, resulting in the recruitment of over 60,000 additional manpower to his cause. While typically Svaski, Iosif, and Uvan would handle the actual liberation of the work camps through their three "Battle Groups," while Henry would visit local cities and villages, convincing them to join his cause and ultimately securing further supplies and actual influence over the land they claimed. Hence, more than just a liberation of work camps, Henry was properly securing territory for himself to the extent that almost the entirety of the central Far East was under Henry's control, from the Urals to the Lena River. The leadership of Moscow was deeply concerned by this development, however they were completely occupied by the three other factions competing for power in the West, as in August the United Nations had reinforced the Democratic League with famous general Maja Kaminska, who had been winning battles against the Federation, saving the Democratic League from collapse temporarily. By this point, the Russian Federation was dealing with a full on Civil War involving hundreds of thousands of combatants, and could not afford to transport a sufficient number of troops to the far east away from the chaotic fronts. It would not be until February of the next year in 2036, when Henry's forces came into contact with the first contingents of the Russian Federation Army in the Ural Mountains, which Henry's highly motivated armies crushed in The Battle of Rezh, leading to the capture of Yekaterinburg.

From this point onwards Henry would only continue to gain more momentum. By mid 2036, after hearing of Henry's extensive success, hundreds of thousands volunteers would flock to Henry's cause, as his rhetoric and ideology to them seemed the most appealing and idealistic in the gloom of the last three decades. By this point the Democratic League had mostly been contained, as the Russian Federation launched a concentrated campaign against them as a means to alleviate pressure on the front lines, and the New Authoritarians were on the verge of internal collapse anyways. Despite this, the leadership of the Russian Federation were no less worried, As although they commanded an equally large amount of soldiers and had vastly superior equipment, the morale of the army had already reached a breaking point due to a constant year of warfare, while Henry's armies remain extremely motivated due to their uncontested success and genuine connection to the ideology.

By late 2037 the last phase of the Civil War had begun, with Henry trying to make a decisive push into Moscow with his armies. The armies of the Russian Federation ultimately could not reasonably defend against this mass movement, as even In their own back lines soldiers have begun defecting, and other parts of Western Russia have capitulated over to Henry's side. In addition, an expedition conducted by Svaski in secret resulted in the mass acquisition of new advanced weaponry known as plasma rifles, which were effective against the forces of the Russian Federation, easily piercing their outdated tanks. On March 18th, 2037, Henry marched into Russia and secured victory in the Civil War, declaring the Neo- Soviet Union, and the Neo-Comintern.

From this point onwards Henry would attempt to open up negotiations with the Western world, but significant casualties over the destruction of the Democratic League caused resentment and overall disdain for the Neo-Soviet Union. Sanctions and embargos were immediately initiated, and many countries of the free World stated they would not tolerate the presence of a second Soviet Union. Henry continued to reach out and did make a number of trade agreements, but the breaking point came when the United State of America openly stated that the Neo Soviet Union will plunge the world into a second Cold War. Henry's dream of cooperation with the wider world had begun to falter, and already his marshals began suggesting that Henry should begin contributing to the promising Communist movements in both Africa and Germany, while supporting the People's Republic of China in their war against the nationalists. However Henry did not want to completely abandon his dream of cooperation yet, and so he arranged for a summit at Switzerland in the year 2038 as a means to reconcile with the Western world. The issue was that Henry up to this point had been a great leader, but not a politician - poor choice of words and overly defensive rhetoric led to him being denounced in the summit, creating even more resentment. At this point, Henry abandoned the hope that he would be able to cooperate with the wider world. From 2039 onwards Henry would openly support the efforts of the Communist movements in Africa and Germany, leading to the Declaration of Communist governments in Africa in the year 2041 and Germany in the year 2045, albeit only the eastern half. Perception of harmful intentions continued to accelerate shortly after these declarations, and Henry and his marshals decided on the dramatic build up of their military in the year 2045, only to be met with militarization of the wider world in response. Diplomatic meetings were held between members of the Comintern and the UN at Brussels, but they were of no avail and by the year 2050 they had practically ceased. War at this point seemed inevitable, and in 2052, on January 16, Henry would launch a decisive Invasion of Anchorage and begin pushing into Poland from the East. The Third Great War had begun.`,

    'isaac-perez': `Hailing from a suburb of Southern California, Isaac grew up in a comfortable environment and was able to perform solidly in academics, allowing him to attend college at The University of California, San Diego. There he would study Chemical Engineering, graduating with exceptional marks, working his first job at a Chemical plant in Arizona. Eventually he pursued graduate school at University of California, Berkeley, studying Physics, and was widely praised for his research on nuclear fusion energy. Isaac consequently became a notable figure in the scientific community, as many believed he would be the one to discover a way to apply the theory. Each year he published a new groundbreaking paper, and gave a conference speech which top scientists from all around the world participated in. Every year, Isaac was inching ever so slightly closer.

In the summer of 2031, Shortly after completing his PhD and working on landing a tenured job at an university, Isaac received a mysterious call from a childhood friend, Jeremiah Jones, who asked him to come meet him in Switzerland, in a remote part of the Alpine mountains. It was here, within a hidden cave at an unmarked trail, that Jeremiah revealed to Isaac his intentions on creating a scientific organization hidden within the Alpine mountains, called ALPINE, researching cutting edge technology and changing the world for the better. He described the presence of an "anomaly," that threatened the destruction of Earth, and that he needed to accelerate the scientific progress of mankind in order to stop it. He intended to bring the greatest scientific minds of the world to the Alpine mountains to conduct their research within this cutting-edge facility, and he wanted Isaac to be the head scientist.

Initially, Isaac did not truly believe Jeremiah's claims, but after Jeremiah showed him the facility itself, which was extremely modern and already fully constructed, Isaac decided to agree to his proposal and began working in ALPINE from the year 2031 onwards. Although the workers of the facility conducted exceptionally difficult work, they ultimately believed strongly in the philosophy that Jeremiah spoke about, and wanted to contribute to humanity for the better. Life in ALPINE was exceptionally unique, as its facilities were beyond anything that any normal research center on Earth could offer, filled with thousands of individuals and carved entirely within the inside of a mountain, hidden away from civilization.

Perhaps even stranger than the facility itself was a nearby village in which all of the inhabitants of ALPINE lived, a very rustic and Christmas-like town which accommodated most of the amenities that the ALPINE facility itself could not, such as shopping, dining, entertainment, and so forth. It was a secret village unmarked on all maps around the world, accessible only through difficult hiking trails, and contained only the scientists of ALPINE or workers adjacent to it.

A number of top scientists from around the world worked with Isaac on his nuclear fusion project, which at this point involved creating an actual miniature sun as a way to generate an immense amount of energy. This project, of course, would not come without significant issues, as more than twice the fusion reactor nearly exploded, which would have caused mass destruction. Besides his commitment to this particular project, Isaac also had to manage the other five hundred scientists who lived within the facility, coordinate their research projects, and stand as one of Jeremiah's closest subordinates, often offering him advice and counseling alongside realistic projections of scientific progress. He also had to divert some pieces of work to researching the anomaly itself, as this was the primary concern of ALPINE in the first place.

In 2033, instead of making an explicit reactor-type apparatus, Isaac decided to create a large chamber which would actually hold a miniature star within it. This was an extremely ambitious project, but Isaac wanted to maximize the amount of energy he could achieve, and felt that the math checked out. In 2034, Isaac's great breakthrough would occur. He successfully stabilized the miniature star within the chamber, and was able to generate immense amounts of energy using it. The event called for an entire pause in the day's work, and scientists from all over the world celebrated Isaac's new achievement, with many believing it would change the world forever. However, this discovery coincided with a concerning shift in ALPINE's philosophy.

Jeremiah was frequently conducting operations and meetings worldwide, and so much of the direct control over the ALPINE facility went to Jeremiah's right hand man, Montgomery. However, Montgomery very frequently pushed for technology and research that focused more strongly on militarization rather than scientific discovery, and hence a great deal of ALPINE's recent discoveries began to take on a military focus.

As it turns out, one of Isaac's closest scientific partners, Rashid Abdur, who helped in the discovery of nuclear fusion, was specifically under the influence of Montgomery. Rashid had been told not only to observe and understand how the new reactor would work, but to find a way to channel it into some form of weaponry, which he had secretly conducted research for. Shortly after Isaac was able to discover fusion, it was revealed to him that Rashid had, at the same time, used the energy from the fusion reactor in order to create a new type of rifle known as the plasma rifle. It used supercharged high-energy cartridges in order to emit a plasma-like laser as a projectile, and this was fundamentally able to pierce almost every form of modern military equipment. This was only possible due to the sheer energy output that their reactor was able to produce and turn into these cartridges. Shortly after hearing about this, Isaac directly confronted Montgomery, but there was very little he could do, as Montgomery was higher than him in authority, and Jeremiah could not be contacted because he was conducting an operation in Russia. Isaac slowly began to notice that things were changing within the facility, as more and more people became aware of what Montgomery was doing, but nothing could be done because Montgomery controlled most of the military elements of ALPINE.

Isaac spoke to his close friends at ALPINE, Chris and Taylor, of his concerns at a restaurant in the village. However, Chris slowly realized that most of the workers in the restaurant were also plants working for Montgomery, and that they needed to leave as soon as possible. They returned to the facility to pack up their things, but as this was happening Montgomery decided to launch an operation that he had kept secret, known as Broken Arrow, which was effectively his takeover of ALPINE. Gathering those military units loyal to him, he dispatched several dozens of scientists and opposing military elements that were not on his side, and forced everyone else to either work for him or be executed. Isaac, Chris, and Taylor were able to escape, but consequently were exiled and could not return.

They would spend the next year and a half attempting to take back ALPINE, while also defending themselves against agents of Montgomery who were actively hunting them down all around the world. Isaac spent most of his time in exile in Japan, spending time with an operative known as Agent K, who helped him survive. During this time, Isaac had to constantly move around the country, as if he stayed in one area for too long one of Montgomery's agents would have caught up to him. He and Agent K also worked together in order to find a way to dispatch Montgomery's newest technology, which he had created using the fusion reactor.

This project attempted to create super soldiers through the use of a highly powered exoskeleton, which would drastically multiply the strength and durability of individual soldiers. With the help of Agent K, a brilliant operative of ALPINE, Isaac was eventually able to find a way to hack the exoskeletons and render them useless, while also triggering a massive failure in the nuclear reactor, causing a contained but powerful explosion. This allowed them to eventually take back ALPINE, after Jeremiah rallied his contacts from around the world in order to retake ALPINE by force.

Upon returning to ALPINE, Isaac would spend the next several years focusing on his fusion research, refining his reactor, and eventually making significant progress on tracking the anomaly which Jeremiah had mentioned several years ago. As a result of Montgomery's takeover, however, Jeremiah took more direct control over ALPINE, but emphasized that in order to defend itself, it had to focus more on military technology. Although Isaac was unhappy about this shift, he did not protest the decision, as he had personally witnessed Broken Arrow firsthand.

Consequently, Isaac would contribute to the creation of further weaponry, particularly the plasma shield, which was the only technology capable of deflecting the energy cartridges from the plasma rifle. Isaac also played a role in developing new military technologies such as the jet hook, which gave ordinary individuals much more mobility, allowing them to use it like a grappling hook that propelled them forwards, enabling them to scale buildings and move from rooftop to rooftop much more easily.

Perhaps Isaac's greatest conflict was the fact that the primary weaponry of the Third Great War, the plasma rifle, ended up becoming so widespread that it was used by practically every single man who fought in the war. Naturally, the plasma rifle only existed because of Isaac's nuclear fusion invention, which led to the invention of the cartridges that were used for the plasma rifle, although many assured him that this was not his fault whatsoever. From this point onwards, Isaac resolved to create more forms of defensive technology, and would continue to work on technology well into the Third Great War.`,

    'cathy': `Cathy grew up in Redondo Beach alongside her childhood friend Zoe, and together the two of them would enter UC Berkeley as part of the class of 2026. Interestingly enough, Cathy also has a twin sister, who somehow also got into Berkeley at the same time. She initially lived in Unit 1 of the residential halls, and would meet Howard for the first time in Moffitt after she mentioned that she liked his drawings.

Cathy and Howard share many interests, such as their refined appreciation of Yuri, Through works of media like Look Back and Arcane, though in other respects their interests diverge quite dramatically. Most notably, Cathy does not share Howard's deep and uncompromising love for Crossroads, especially after moving out of Unit 1. From that point onwards, she lived in an apartment with her twin sister, where they would remain for multiple years.

Cathy's apartment became notable in its own right, partially because, somehow through their friend Joey, she and her sister came across a giant teddy bear which now occupies about a fifth of the entire apartment. This does not even take into consideration the giant stack of Cheez-It boxes, which occupies another solid fifth of the apartment. Cathy's voracious love for Cheez-Its is truly unparalleled, to the point where one must question whether or not her boyfriend Evan can even compete.

During her time at Berkeley, Cathy used to stay in Moffitt a fairly decent amount. Of course, this did not rival anywhere close to the amount of time Howard stayed there, but it was still respectable by ordinary standards. Cathy and her friends Howard, Zoe, Carrie, Mark, and Lina would also frequently go to Denny's together, treating it almost as a form of divine ritual. Likewise, whenever parties were hosted, Cathy's apartment was often one of the top choices. It was there that multiple events were celebrated, including MY birthday party, MY going away party, and MY Halloween party, and several other gatherings.

As for Cathy's academic career, it is still somewhat unclear to me what her college major actually is. It was likely something adjacent to biology, although I initially thought it was computer science when he first met her, because she just seems like a computer science type of person, and I continued thinking this for a surprisingly decent amount of time. Cathy's signature quote is her sarcastically phrased "riiiight," usually delivered in response to absurd statements. Among her signature skills, she possesses the ability to make very delicious tiramisu, as well as the ability to crack eggs without breaking the yolk. However, Howard is still clearly the superior cook.

Now, at the eve of her time in Berkeley, one must wonder what she is planning next in her life.`,

    'ralphs-courtesy-clerk': `The courtesy clerk is the frontline infantry of all grocery stores under the Kroger line. Brave, skilled, and hard-working individuals, courtesy clerks are forced to handle the greatest amount of stress in the entire company, while also performing the most difficult and challenging work imaginable.

One of the courtesy clerk's most dangerous tasks is the hourly floor sweep, in which the courtesy clerk saves millions of lives that otherwise would have been lost to customers slipping on the ground and cracking their skulls open. Naturally, the courtesy clerk risks their own life while completing this task, as they themselves could also slip on the wet floor and break their own skull, precisely because the floor is wet and no one has cleaned it yet.

Cart pushing is likewise considered an exceptionally arduous task. A courtesy clerk can push not only eight carts, but sometimes as many as twelve, rivaling the strength of Samson from the Bible himself. Even Samson likely capped at eleven carts pushed, whereas many courtesy clerks at the higher end can go as far as fourteen. I personally could do 16.

Courtesy clerks also possess tremendous mental resolve. Most of the people shopping at grocery stores are boomers, and boomers are undoubtedly some of the most insufferable people on Earth to talk to. The fact that courtesy clerks can speak to boomers every single day without losing their sanity is a testament to their exceptional mental fortitude and intelligence.

Perhaps the most iconic task of the courtesy clerk is undoubtedly bagging. This is a skill that requires exceptional aptitude, judgment, and prediction. The courtesy clerk must scan the mountain of groceries heading their way and instantly determine how to reorient the placement of these objects so that they fit within the bag as efficiently as possible, all while keeping up with the scanning speed of the cashiers, legendary beings in their own right. The mental side of bagging is easily harder than any form of PhD level of mathematics, physics, or science, and requires greater handiwork than that of watch makers, luthiers and chefs.

However, even within the ranks of courtesy clerks, there are multiple hierarchies to consider. Opening courtesy clerks occupy the lowest level of courtesy clerk society, simply by merit of being the natural opponent of the closing courtesy clerk. They often complain about the work of the closing courtesy clerk without realizing just how more difficult it is. The daytime courtesy clerk exists somewhere in between, but the night courtesy clerk is a truly legendary being. Not only must they handle the typical tasks of a courtesy clerk, but they must also close several different areas at once before the clock runs out. It is said that if the night time courtesy clerk fails to finish their tasks before 2:00 a.m., the entire store will spontaneously explode and cause a Republican to win the next election. Thus, the responsibility and skill of a night courtesy clerk are far beyond anything that could possibly be imagined by even the greatest intellectual minds. Truly, a Ralphs courtesy clerk is perhaps the most complete human a human can become.`,

    'zimbabwean-honor-guard': `In the 19th century, the Zulu armies were famous for their "buffalo horns" strategy, consisting of the chest, horns, and loins formation, which revolutionized warfare during the era. The chest consisted of veteran forces that pinned the enemy in place and met the opposing formation head-on. The horns were made up of faster, younger warriors who could rapidly maneuver around the enemy and encircle them, while the loins acted as a reserve force.

In the year 2044, shortly after the African Union declared itself an independent unified nation consisting of most of Africa - with the exceptions of Rhodesia and South Africa - the new government sought to emphasize its uniquely African identity rather than associate itself too closely with the Western world. During this period of revitalization, the armies of the African Union chose to revive the ancient Zulu buffalo horns strategy as a legitimate form of modern warfare. This decision reflected both their commitment to preserving older military traditions and their desire to emphasize a distinctly African identity, for which their Zulu heritage served as a powerful symbol. Thus, the Zimbabwean Honor Guard was born.

It would be a mistake, however, to suggest that the Zimbabwean Honor Guard was inherently a veteran force. While the veteran troops traditionally formed the stable and reliable chest of the formation, the Honor Guard instead fulfilled the role of the horns. They are more accurately described as shock troops, known for their relentless mindset and little regard for their own well-being. They were exceptionally aggressive units, typically suffering somewhat higher casualty rates than conventional infantry, but were equally renowned for their ability to create decisive action on the battlefield.

The Honor Guard formed the two horns of the typical African Union battle formation, attempting to sweep around the enemy's flanks and encircle them. For every Honor Guard regiment positioned on one side of the formation, another was always deployed on the opposite flank. One of their signature tactics was to hold their fire until they were at much closer range than conventional infantry before unleashing a devastating volley designed to inflict maximum damage on enemy morale. Even so, their primary focus remained movement. They created constant pressure on the enemy line, steadily threatening encirclement rather than seeking immediate breakthroughs. Their objective was less to smash through enemy positions than to surround them completely and induce panic.

The Honor Guard first distinguished itself during the capture of Rhodesia in March 2052. Their tactics were put to notable use during the Battle of Harare, where the Rhodesian forces proved unable to withstand the highly motivated soldiers of the Honor Guard. During the battle, the horns successfully maneuvered all the way around the rear of the Rhodesian formation, resulting in a swift and decisive victory that brought an end to the Rhodesian presence in Zimbabwe. Earlier in the Botswana Campaign, at the Battle of Gobabis, the horns once again enveloped the enemy, causing a panicked collapse of the Australian-held right flank. The resulting chaotic retreat secured another African Union victory. The Battle of Zutswa saw similar success under the same tactical formula, resulting in the capture of approximately 12,000 Commonwealth soldiers. At the Battle of Kgalagadi, however, the Honor Guard's maneuver fell short. Their movement came close to completely collapsing the British flanks and almost encircled the entire army, if not for a decisive rearguard action by the famous 17th British Regiment, which ultimately saved much of the formation and secured an eventual British victory. The Honor Guard's most famous engagement came during the Battle of Bulawayo in January 2053. There, they achieved a remarkable victory through the successful execution of their horn formation, rapidly collapsing the Free World's flanks and encircling 16,000 men before reinforcements could break them out. The victory dramatically prolonged the Botswana Campaign at a time when it had appeared the African Union was on the verge of collapse.

From this point onward, however, the strategy became increasingly predictable. The Honor Guard frequently found itself cut off after overextending during encirclement attempts and consequently suffered extremely high casualties. As a result, from mid-2053 onward, the Honor Guard continued to occupy the traditional position of the horns on the flanks of African Union formations, but they were no longer consistently ordered to conduct sweeping encirclements. Instead, they increasingly served as more conventional infantry units, though still occupying the same positions within the battle line.

By 2054, it had become clear that the African Union was on the defensive. As the fighting moved back toward their homeland, observers noted that the Honor Guard fought with even greater ferocity, severely slowing Commonwealth advances for a considerable period. However, as the African Union gradually exhausted its supply of experienced units, it became necessary to deploy the Honor Guard in the center of the formation rather than on the flanks. There, they assumed the traditional role once occupied by veteran infantry, holding firm against repeated Commonwealth offensives.

This culminated in the brutal Battle of Lusaka, where the Honor Guard clashed directly with the central formations of the famed 17th British Regiment in a battle that lasted several days. Although the British achieved a tactical victory, it came at enormous cost. The Zimbabwean Honor Guard suffered catastrophic losses, losing nearly 70% of its effective fighting strength through sheer attrition. The British, however, fared little better, suffering as many as 35,000 casualties during the fighting despite ultimately prevailing.

Shortly after the Battle of Lusaka, the capital of the African Union fell in June 2052, bringing the Botswana Campaign to an end. By this point, the Honor Guard had been formally disbanded, its surviving members dispersed among desperate final regiments attempting to defend the capital. Their efforts ultimately proved insufficient, and with the fall of the capital, the Zimbabwean Honor Guard passed into history, but not from memory - the unit was recognized by Commonwealth forces after the war to be a worthy opponent, a counterpart to the famous 17th British Regiment.`,

    'ucpd': `Perhaps Howard's greatest ops in Berkeley were the UCPD.

The University of California Police Department (UCPD) is the law enforcement agency of the University of California, Berkeley, responsible for policing matters on campus and operating separately from the city's regular police force. Despite this distinction, University police officers meet the same standards as city and county peace officers in California and are specifically selected and trained to address the unique needs of the campus community.The department operates under the regulations of the California Commission on Peace Officer Standards and Training (POST), as well as oversight from the University, the State of California, and federal authorities. It also maintains a close working relationship with the Berkeley Police Department. According to its stated mission, the UCPD is committed to working in partnership with the diverse campus community to enhance public trust, reduce both the incidence and fear of crime, and promote safety throughout the university. The department pledges to protect individual rights and safeguard the property of students, faculty, staff, and guests while supporting the University's academic, research, and public service missions with professionalism, integrity, and sensitivity.

Howard, however, has had a rather different relationship with the UCPD.

Over the years, Howard ran into a number of issues with campus police, primarily after being caught throwing knives on campus - not once, but twice. The first incident resulted in only a warning. The second proved considerably more serious, leading to disciplinary probation. Perhaps most devastating of all, the officers confiscated Howard's knives and, despite his hopes, never returned them. To make matters worse, Howard was required to write a formal letter admitting that he had made a mistake and promising not to repeat them, something deeply painful to his ego.

As a result, Howard's bad blood with the UCPD runs deep. Indeed, by this point, the department has become a primordial enemy in Howard's personal mythology - an institution whose rivalry is destined to be remembered by all of Howard's future descendants.

Beyond Howard's own encounters, the UCPD is also responsible for dealing with a wide variety of challenges on and around campus. These include the persistent presence of tweakers and homeless individuals, the catastrophically dangerous anti-Zionist protests that periodically take place on campus, and the responsibility of protecting controversial right-wing political speakers from the infamous "Berzerkeley" horde that will literally chop off their limbs and cannibalize them alive if allowed into close contact.`,

    'kazumi': `Kazumi's origins are unknown, even to herself. Presumably born around 494 AC, she suffers from some form of amnesia and remembers practically nothing before the age of twelve. For the next four years of her life, she wandered from village to village across Colombo, surviving through begging and making do with almost no resources. To the best of her knowledge, she never had a family, and believes she was abandoned from a very young age. Her appearance resembles that of the people known as the Asiaticos, a rare ethnic group in Colombo who were heavily discriminated against because of their distinct features, and were frequently sold into forced labor or slavery by what little upper class existed within Colombo society.

One day, Kazumi was taken in by a man who offered her basic food and shelter on the condition that he would eventually sell her to a wealthy patron. Kazumi agreed to this arrangement, having little alternative. Despite the controversial circumstances, she gradually grew close to the family during her stay, frequently speaking with the man's young daughter and, for the first time in her life, witnessing what having a family might feel like.

Eventually, the agreed upon day arrived. Bound in chains and blindfolded, Kazumi quietly followed her captors to be sold. However, while passing through a small village, another girl around her age unexpectedly intervened, threatening the captors with a pair of knives and forcing them to flee. Kazumi initially attempted to explain that the situation had been a misunderstanding, but during the rescue her blindfold had been removed, revealing the girl's striking blue eyes. The nearby villagers immediately began verbally assaulting her, believing blue eyes to be a dreadful omen associated with the Western Seas.

Intrigued by the strange girl who had rescued her, Kazumi briefly considered returning to her captors to honor their agreement. Instead, she decided to follow her rescuer. For several leagues she trailed behind her, eventually arriving at a lonely home overlooking the sea in one of the most remote regions of Colombo. There, atop a large rocky cliff, Kazumi finally revealed herself. The girl appeared to have been crying, standing dangerously close to the cliff's edge. Her expression changed almost immediately when Kazumi quietly remarked, "I think your eyes are beautiful. They remind me of the sea."

Kazumi revealed that she too was an orphan, and learned that the girl's name was Anicka. After some persuasion, Kazumi convinced the reluctant Anicka to allow her to stay for a short while.

Over time, the two grew inseparable, becoming practically like sisters. Kazumi spent much of her time reading through her modest collection of books from the Old Age with Anicka, sharing stories and knowledge of the forgotten world while the two enjoyed simple picnics of bread and stewed vegetables beneath bright blue skies overlooking the sea. She encouraged Anicka to accompany her to village libraries, where the pair frequently stole books together, using Anicka's extra carrying capacity to bring back even larger collections.

In return, Anicka showed Kazumi the coast of Colombo, taking her hiking along the cliffs where they gathered Blancanos, the white flowers unique to the shoreline, and explored shipwrecks scattered below the cliffs. During these journeys, the two often dreamed of one day leaving Colombo behind and traveling north to Caribbea by crossing the Marien Gap, believing that the prosperity of Caribbea might finally allow them to begin new lives.

Yet beneath Anicka's quiet demeanor, Kazumi sensed a deep sadness. She knew of Anicka's father's death in a sailing accident, and recognized that although Anicka loved the sea, she feared it just as deeply, believing it responsible for nearly every hardship she had endured. The sea had taken her father, condemned her blue eyes as an omen, and left her isolated from nearly everyone around her. Kazumi also recognized the pain Anicka carried from having lived almost her entire life without anyone she could truly confide in.

While visiting a nearby village together, Kazumi overheard news of the coming Sea Ritual, an annual ceremony in which a randomly selected tribute was sacrificed to the sea in hopes of pacifying the oceans and preventing disaster from befalling Colombo. She soon discovered that the man who had once taken her in had been chosen as that year's sacrifice. Kazumi immediately thought not of the man himself, but of his daughter, imagining the grief she would suffer if her father were taken away.

This realization remained with her until the very day she and Anicka prepared to leave Colombo for Caribbea. Without telling Anicka, Kazumi secretly departed and offered herself as tribute in place of her former captor.

As mysterious figures emerged from the sea to escort her into the waters, Anicka arrived and desperately attempted to rescue her, but was unable to stop the ritual. When Anicka demanded to know why she would sacrifice herself for people who had intended to sell her into slavery, Kazumi explained that she had witnessed the pain Anicka still carried after losing her own father. She could not bear the thought of forcing another daughter to endure that same grief. Kazumi chose to sacrifice herself not out of obligation, but out of sympathy for someone she barely knew.

With those final words, Kazumi willingly disappeared beneath the waters alongside the mysterious beings of the sea. From this point onward, Kazumi's fate became unknown, But Anicka, trusting that Kazumi must still be out there, decided to sail into the Western Seas in order to bring her back.`,

    '2nd-polish-lithuanian-army': `When Queen Felicyta Janowicz decided to abandon the defense of Poland-Lithuania and immediately surrender her country to the Comintern at the beginning of the Third Great War, supposedly in order to save the civilian population, the remainder of the Polish-Lithuanian government vehemently opposed her decision. The Polish Army in particular desired to continue fighting, although its commanders disagreed over how this resistance should be conducted. Much of the army elected to remain within the homeland and continue the struggle from Poland itself, while another portion believed it was strategically wiser to fight from abroad, making use of the international infrastructure that Felicyta had spent the preceding several years preparing. Those who supported the overseas strategy generally regarded continued resistance within the homeland as hopeless and relatively futile, believing that their influence abroad would be far more strategically valuable even if they were isolated from the resources and manpower available in Poland-Lithuania.

Approximately eighty to ninety percent of the Polish-Lithuanian Army remained in the homeland, while the remainder escaped abroad, primarily establishing themselves in the United Kingdom and the United States. Because these forces lacked the resources to operate entirely independently, many Polish soldiers were incorporated into local Allied formations, fighting as scattered regiments within the Australian, American, British, French, and numerous other Free World armies. However, a small portion of the military, representing roughly ten percent of the original army, continued to fight within dedicated Polish-Lithuanian formations. Only two complete armies were organized in this manner: the First Polish-Lithuanian Army, consisting of approximately 50,000 regular soldiers, and the Second Polish-Lithuanian Army, consisting of approximately 60,000 regulars.

The Second Polish-Lithuanian Army was commanded by Field Marshal Michał Krawczyk and first participated in combat during the French Campaign of 2052, fighting throughout Western Europe against both the German and Soviet armies. Unfortunately, the army was no longer connected to the industrial, logistical, and recruitment base that had traditionally supported the Polish-Lithuanian military. Consequently, it was forced to conduct relatively defensive operations, holding fixed positions rather than performing massive maneuvers or independent offensives. The Second Army primarily occupied territory approximately sixty to eighty miles south of Paris, where it faced the German Fifth Army and the Soviet Sixteenth Army.

Although the Second Polish-Lithuanian Army participated in several pitched engagements, including the Battle of Melun and the Battle of Courtenay, most of its service during the French Campaign consisted of trench warfare along a heavily fortified defensive line. The army suffered a minor tactical defeat at Melun but later achieved victory at Courtenay. Nevertheless, even when local victories were won against the German and Soviet forces, the Polish-Lithuanian Army found it difficult to exploit these gains. Rather than acting as a force capable of conducting significant and decisive operations, it frequently served as a reserve formation or fixed anchor along the wider Allied line.

One of the greatest challenges facing the Second Polish-Lithuanian Army was its continued desire to operate as an independent national army, separate from the larger force hosting it. During the French Campaign, Polish commanders continued to defer primarily to the orders of Field Marshal Krawczyk rather than those of the French high command. This made coordination between the French Army and the Polish-Lithuanian formations considerably more difficult, particularly whenever the two forces attempted to exploit victories or organize wider operations against the German and Soviet armies.

When the initial German and Soviet advances were stemmed by the middle of 2052, greater efforts were made to coordinate the Second Polish-Lithuanian Army with the remainder of the Free World. Eventually, the Polish-Lithuanian command began to accept most of its orders from the wider Free World command structure under the War Council of the Free World, an organization consisting of generals and field marshals from every major Free World military, including the United Nations Army. Although Krawczyk continued to exercise direct command over his soldiers, the Second Army became considerably more integrated into Allied strategic planning.

Later in 2052, the Second Polish-Lithuanian Army was withdrawn from Europe entirely and redeployed to North Africa, where it helped reinforce the Libyan Army against the African Union. During this campaign, components of the Second Army were given opportunities to do more than simply hold defensive positions, achieving important victories at the Battle of Abu Nujaym and the Battle of Tripoli in January 2053.

The Battle of Abu Nujaym became particularly famous for its harsh desert fighting. The 56th, 18th, 54th, 43rd, 33rd, and 22nd Polish Rifles were ordered to defend the small town against the relentless advances of the African Union Fourth Army. The Polish formations launched vicious raids from the surrounding desert, repeatedly striking enemy positions and severing African Union supply lines. During the Battle of Tripoli, the Second Polish-Lithuanian Army held the right flank of a combined Free World force numbering approximately 230,000 soldiers, consisting of Libyan, British, Australian, Indian, and American formations.

Following its service in North Africa, the Second Polish-Lithuanian Army was redeployed to South America, specifically Venezuela, after Brazil turned communist and entered the war during the middle of 2053. The Polish-Lithuanian soldiers immediately found themselves operating within extremely unfamiliar territory. Unable to launch significant offensives against the Brazilian Army, they were once again forced to resort primarily to defensive operations, holding existing positions rather than attempting to conquer additional territory.

In Venezuela, the Second Polish-Lithuanian Army operated alongside Commonwealth formations, a small detachment of the United States military, and several smaller Latin American armies. However, the Brazilian forces possessed a superior understanding of the local terrain, giving them a considerable advantage over the Allied armies. The Polish-Lithuanian formations remained involved in these predominantly defensive operations into April 2055, spending approximately a year and a half fighting in South America.

Despite their initial difficulties, the soldiers of the Second Army fought valiantly throughout the campaign, participating in grueling jungle and mountain warfare and gaining an immense wealth of experience in the process. During 2054, as the Free World armies gradually began to make progress through the Amazon, the Polish-Lithuanian soldiers became increasingly proficient in jungle warfare. They learned to navigate the dense terrain, conduct effective ambushes, and coordinate attacks under extremely difficult environmental conditions, eventually winning several minor pitched battles against the Brazilian Army.

In February 2055, the American Navy landed at Vitória and brought the United States Fourth and Sixth Armies into the theater. The Brazilian forces quickly found themselves on the back foot, as they were unable to contain the sudden opening of this new invasion front. With American forces advancing from the coast and the existing Free World armies placing increasing pressure upon the Brazilian defenses, the strategic situation rapidly deteriorated as the 2nd Polish Lithuanian Army marched into the state of MInas Geraid. By the middle of 2055, the Brazilian Army had surrendered.

Following the Brazilian surrender, the Second Polish-Lithuanian Army returned to the United States for a brief period of rest and reorganization before being deployed to China for a short campaign, before the Comintern as a whole ultimately surrendered in early 2056.

In both Polish and international media, the Second Polish-Lithuanian Army was recognized for its valiant efforts fighting across numerous international fronts despite the fact that its homeland had already fallen. Its soldiers became particularly noted for their exceptional willpower and their ability to adapt to drastically different circumstances, as demonstrated by their campaigns in Western Europe, North Africa, South America, and China. Although the army rarely conducted the massive or decisive operations that was famous of other armies, it repeatedly served as a dependable reserve and fixed anchor for the wider Free World forces. From the fortified lines south of Paris to the deserts of Libya and the jungles of the Amazon, the Second Polish-Lithuanian Army remained one of the most enduring symbols of Poland-Lithuania's determination to continue the war from abroad.`,

    'dylan-kirby': `Unlike many politicians of his age, Dylan Kirby did not grow up studying political science, working in government, or demonstrating any particular talent for politics. He attended the respectable University of California, San Diego, where he studied primarily as an engineer rather than as a political science student. After graduating, Dylan found himself uncertain of what to do with his life. He spent much of his early adulthood infamously forming relationships with not merely one, two, or several women, but dozens. By the end of this period, he had fathered fourteen children, none of whom he chose to raise himself.\n\nAfter his twenties, Dylan settled into an otherwise average life in Pennsylvania, working as an electrician to make ends meet. Little of historical significance occurred during the following decade. He remained single and, although his life was relatively uneventful, his income allowed him to live comfortably. Everything changed, however, when he returned to California in 2041, only a few months before the outbreak of the infamous Great American Plague.\n\nThe Great American Plague became one of the most devastating events in the history of the United State of America. Although the disease first emerged in Oregon, the administration in power proved incapable of exercising the federal authority necessary to contain it. The plague rapidly spread southward into California's major population centers while also reaching Arizona and, to a more limited extent, Mexico. Its precise origins remained unknown, but it was identified as a highly contagious and moderately lethal strain of bacteria. More than one million people died during the first several months of the outbreak, with the earliest deaths concentrated primarily in the San Francisco Bay Area. As the disease began spreading exponentially throughout Southern California, the federal government attempted to contain it through increasingly extraordinary measures. These efforts were undermined by the erosion of federal authority over the preceding two decades, caused by both the wider global shift in politics and years of domestic polarization. The government lacked the power and coordination necessary to respond to a crisis of such magnitude, and soon more than ten million people had been infected across California, Arizona, and Oregon. Of those ten million, approximately two million had already died.\n\nAt this point, the government announced that the entire state of California was to be abandoned. Scientists had partially concluded that the plague was geographically restricted by the climate of the West Coast and could not easily survive transportation across greater distances, but it remained exceptionally dangerous within the region itself. Dylan became one of the millions forced to evacuate California. During the evacuation, however, he began livestreaming the crisis and producing podcasts and videos in which he offered advice and comfort to those suffering around him. Dylan's exceptionally charismatic manner of speaking quickly made him famous throughout the United State of America. Americans began to regard him as a natural leader - someone capable of reassuring the population while the country appeared to be collapsing around them. His broadcasts combined practical advice, encouragement, and reflections on the state of American society. He urged displaced civilians to cooperate with one another rather than surrender to fear and panic.\n\nThe government had failed to properly coordinate the evacuation of the civilian population, lacking both the resources and the ability to coordinate assistance between federal and state authorities. As a result, civilians took the evacuation into their own hands and formed what became known as the Great Californian Convoy. Perhaps the most famous image of the Great American Plague was that of millions of people traveling along California's Highway 1 to escape the infected region - an immense procession of refugees carrying backpacks and rucksacks moved northward through a coastal landscape littered with abandoned vehicles, hastily made encampments, and debris. The convoy stretched from Los Angeles, continued far beyond the Bay Area, and eventually turned east toward Idaho. Refugees sang, danced, established campsites, played music, shared food around campfires, slept beneath the stars in immense refugee camps together, exchanged stories, drank together, and divided their limited rations among strangers. Although the situation remained dangerous and uncertain, the Great Californian Convoy became one of the most iconic events in American history. The shared suffering of the evacuation began to rebuild a sense of social trust that had been absent for decades. For the first time in years, Americans appeared willing to empathize with one another and offer whatever assistance they could.\n\nDylan traveled as part of the convoy and became particularly famous for what would later be called his "Fireside Talks." He would sit beside a campfire in the center of one of the sprawling refugee camps, surrounded by millions of displaced people scattered across the beautiful California coastline, and speak about the crisis. These talks combined encouragement, political observations, personal reflections, and advice for those enduring the evacuation. They were recorded and distributed throughout the country, transforming Dylan from an ordinary electrician into one of the most recognizable public figures in the United State of America.\n\nBy 2043, the evacuation had been completed and the plague had been relatively contained. Nevertheless, the government declared that California would remain uninhabitable for approximately another decade. The disaster also forced the American population to confront the extent to which federal authority had deteriorated in favor of the individual states. Many concluded that the inability of state and federal institutions to coordinate their resources had directly contributed to the collapse of society throughout the region, resulting in unnecessary death and destruction. Calls to transform the United State of America into a single, more centralized state consequently became increasingly prominent. Under this proposed system, the authority of the individual states would be greatly diminished in favor of a stronger federal government and a far more powerful presidency. Dylan had been among the first major public figures to advocate for this idea, having proposed it during one of his earliest Fireside Talks.\n\nSupport for centralization grew further as additional stories emerged concerning the government's failures during the plague. The most infamous example was the Dallas Incident, during which the government of Texas withheld desperately needed supplies from federal troops and hoarded them for its own purposes. The weakened federal government proved incapable of seizing or otherwise acquiring these resources, even while millions elsewhere remained in danger. The incident became a symbol of the destructive consequences of excessive state autonomy and greatly strengthened the movement for a United State of America.\n\nBecause of his immense popularity, many Americans began calling for Dylan to become the first president under this new political system. In 2044, he contested the presidency against five other candidates and emerged victorious with fifty-six percent of the total vote. Dylan officially became the first president of the newly centralized United State of America, although, for reasons of institutional continuity, he was still formally recognized as the fiftieth president of the United State of America. Shortly after his election, news emerged concerning the scandals of his early twenties. Reports of his numerous relationships and fourteen children dominated the news for approximately three to four months, giving his presidency a remarkably unstable beginning. Many questioned the nature of his character and whether he was worthy of serving as the first president of the reformed country. Nevertheless, Dylan eventually recovered from the controversy by achieving significant progress in domestic policy.\n\nHis administration established a nationwide infrastructure fund intended to finance development in states that lacked the resources to do so independently. He also oversaw the redevelopment of American factories and heavy industry throughout the Great Lakes region. Recognizing the immense financial vacuum created by California's abandonment, Dylan encouraged much of the American financial sector to relocate not only to New York but also to parts of Washington, greatly revitalizing the economy of the Pacific Northwest.\n\nDylan also introduced a new military doctrine that emphasized American naval and air power rather than the maintenance of an overwhelmingly large land army. By 2047, he had begun to recognize the rapidly deteriorating state of world affairs and participated in numerous international diplomatic meetings, including several summits held through the United Nations, in an effort to mediate growing tensions. As a precaution, however, in March 2047 he initiated drastic measures to expand American naval and air capabilities, both of which had faltered over the preceding decades. The program concentrated on developing superior technologies and constructing a vast number of ships and aircraft. It also helped revive American industry, which had become increasingly stagnant following the Great American Plague, and began propelling the United State of America back toward its former position as the world's leading power. Massive dockyards were constructed in Louisiana, South Carolina, and Maine to restore American naval production. Aircraft factories were established throughout the Great Lakes region and along the Mississippi River, bringing desperately needed industrial investment to these areas.\n\nIn 2050, Dylan began negotiations with the other nations of the Free World, including France, Britain, Australia, Sweden, and several South American countries. He initially sought to establish a new defensive treaty separate from NATO, which had been faltering for decades. This proposal was ultimately abandoned in favor of an alliance formed through the recently reformed United Nations, whose membership represented a broader and more robust collection of nations from around the world. Dylan stood at the head of these negotiations alongside the leaders of several other major powers, and in August 2050 a formal military alliance was reestablished in Brussels, owing in considerable part to his contributions. By 2052, it had become clear that a global war could begin at any moment. Dylan returned to California and delivered one final Fireside Talk, wearing his old clothing and speaking in the same style as he had during his original plague-era podcasts. The address was wildly popular and greatly strengthened American morale, preparing the population for what he believed was soon to come.\n\nNevertheless, the United State of America was not prepared for the Soviet Union to invade through Alaska. In January of 2052, Soviet forces assaulted Anchorage from the sea and landed approximately twelve armies, consisting of roughly 700,000 infantry. War spread throughout the Americas and along the Canadian coast as American and Allied forces attempted to push back the Soviet invasion, in the midst of a brutal winter. Many American lives were lost in the defense of both Canada and the United State, as fighting was made difficult by the snow and mountainous terrain of Western Canada. Throughout the Third Great War, Dylan continued delivering his famous Fireside Talks in an effort to encourage and reassure the population. His speeches drew frequent comparisons to those of Franklin Delano Roosevelt.\n\nDylan continued leading the American nation for the entire duration of the conflict, encountering little meaningful political opposition. He was widely praised not only for his ability to inspire the civilian population but also for making generally sound decisions concerning the American war effort.\n\nShortly after the war ended in 2056, Dylan unexpectedly passed away in his sleep. His funeral was held in Cuba and attended by all fourteen of his children, as well as all but one of his wives. Among those present were Jonathan Kirby and Marie L'amboure, who had themselves become famous political figures in Australia and France. Dylan Kirby's life had begun without any apparent political ambition or distinction, yet through the Great American Plague, the Great Californian Convoy, the reformation of the United State of America, and the Third Great War, he became one of the most important and beloved presidents in American history.`
  };
  Object.assign(DOCUMENT_EXACT_BODIES, window.CARD_INFORMATION_5_LORE_BODIES || {});
  function withDocumentExactBody(page){
    const body = DOCUMENT_EXACT_BODIES[page?.slug];
    if(!body) return page;
    const next = Object.assign({}, page, {body, summary:''});
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
            <p>Information dossiers for the people and legends of Fates Entwined.</p>
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
          <div class="ch-lore-page-actions"></div>
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
            <p>Information dossiers for the people and legends of Fates Entwined.</p>
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
  window.openLoreEditor = function(){ if(window.toast) toast('Lore pages are read-only'); return false; };
  window.openLoreSection = function(){ currentPageId = ''; currentLoreArchivePage = 0; rerenderLore(); };
  window.openLoreList = function(){ currentPageId = ''; currentLoreArchivePage = 0; rerenderLore(); };
  window.deleteLorePage = function(){ if(window.toast) toast('Lore pages are read-only'); return false; };
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
