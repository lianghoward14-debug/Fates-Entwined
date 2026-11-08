/* Local presentation only: never writes to the authoritative game state. */
(function(){
  'use strict';
  const characters = Object.freeze({
    chingachlook:{name:'Chingachlook',portrait:'pfp/pfp45.png',file:'Chingachlook',ids:new Set(['45']),clips:[
      ['Great Spirit, Maker of All Life.','A warrior goes to you swift and straight as an arrow shot into the sun.','Welcome him and let him take his place at the council fire of my people.','He is Uncas, my son.'],
      ['The frontier moves with the sun and pushes the Red Man of these wilderness forests in front of it','until one day there will be nowhere left.','Then our race will be no more, or be not us.'],
      ['There is no future for someone like me.','There are no more paths to walk, no more stories to tell.','I hold onto my heritage, the traditions of my people, because I am the last of my kind.','If I die, then the Mohicans will die with me.'],
      ['Look upon the sky - the Running Deer, as swift as the wind, is visible tonight.','And look besides him, to the east - you can see the Leaping Salmon.','Across the vast prarie and trickling river, these animals run free, unbothered by the threat of the hunt.'],
      ['My son may have fallen years ago, but I still carry his axe besides me, so that his spirit may never be lost.','I know that even in this foreign wilderness, he and his ancestors still watch over me,','guiding me along my final journey.']
    ]},
    phil:{name:'Phil',portrait:'pfp/pfp46.png',file:'Phil',ids:new Set(['46']),clips:[
      ['It doesn\'t matter if its Moloch, Baal, Satan, Barack Obama, or Mason Russell-','there is no greater evil, no greater malice, no greater depravity in an infinite amount of eons of the universe,','than the 115 IQ rock climbing matcha drinking midwits who work in this financial firm.'],
      ["REAL feudalism hasn't been tried before -",'if you look here in my monarchist manifesto, you would see exactly what I\'m talking about.','Mrs. Stroschneider from high school even thought I made a convincing argument.'],
      ['We should all lament what our universities have become -','putrid farms for corporate advancement, stinking of upper middle class students who used ChatGPT and exaggerated resumes to buy their way in.','What happened to the love of learning?'],
      ['ARE YOU HAPPY? IS THIS WHAT YOU WANTED?','I DARE YOU TO CALL ME A BLACK HOLE ONE MORE TIME,','SEE WHAT HAPPENS, YOU SOCIOPATHIC LITTLE SHUT'],
      ['In the most respectful way possible,','I hope all of the subhumans who work in corporate finance have their bones grinded into dust under a hydraulic press.','They contribute nothing to society, and get paid hundreds of thousands a year','to let Claude make pretty colors on a computer app for eight hours straight.']
    ]},
    mark:{name:'Mark Kemper',portrait:'pfp/pfp43.png',file:'Mark',ids:new Set(['43']),clips:[
      ['Howard... take a fucking log and swallow it and fucking choke.'],
      ['I think this whole "back Israel no matter what" thing actually isn\'t good for our country.',"Now, I'm not antisemitic, I have Jewish friends, like Dylan.",'Well, sometimes he really gets on my nerves.','Like sometimes he gets a little too Jewish, you know?'],
      ["After I'm done pounding your face to a pulp with my bare hands,",'I think I\'m going to take a nap, hit the gym, take a nap, eat some Indian food, and suffer terrible indigestion.','Ahh, what a perfect day.'],
      ["Johnny Cash is God's greatest gift this past century.",'His iconic, deep baritone, his emotional themes, the weight he puts into every line.',"It's all so moving... Huh? What do you mean all his songs are stolen?"],
      ["What year was it again? 1914?","Didn't the South rise up against the North in the Civil War to eradicate the Jews from Europe during that time?"]
    ]},
    isaac:{name:'Isaac Perez',portrait:'pfp/pfp22.png',file:'Isaac',ids:new Set(['22']),clips:[
      ['The unfortunate reality is that infinite energy is not necessarily infinite energy for the masses -','it becomes a tool used by those in power to improve their own selfish positions.'],
      ['Look at the diagnostic feeds—alpha heating has completely taken over and Q is climbing past fifteen.','The external heaters are totally throttled down, but the confinement is holding;','we have a self-sustaining burning plasma.'],
      ["We're dealing with severe anomalous transport in the scrape-off layer,",'and the resulting edge-localized modes are threatening a catastrophic plasma disruption.',"If we can't mitigate these magnetohydrodynamic instabilities,",'the heat flux will completely erode the divertor armor.'],
      ["I'm not the head scientist of ALPINE because I know the most or am the smartest.","It's because I understand that the key to discovery is collaboration and humility."],
      ['No achievement is solely my own -','it is built on the backs of the great scientific minds of past and present.','May the lord continue to bless the path of discovery.']
    ]},
    jake:{name:'Jake',portrait:'pfp/pfp38.png',file:'Jake',ids:new Set(['38']),clips:[
      ['My name is Jake, my likes include Heroes, being fat, gay sex and hot men.','I hope I can be a good husband to a loving man.','Also I work at Del Taco and wish I was Mexican. I love Jimmy.'],
      ["Oh so you don't like watching me play Star of Providence?","Would you prefer it if you watched me make love to your sister instead,","burying her underneath the rolls of my stomach?"],
      ['Where is my goth, short hair, tomboy, small feet, Winco, King Gizzard, munchie meal, skater, asian girlfriend,','who I have to beg to physically pleasure me?'],
      ['Besides jacking off to tomboys and being fat, my favorite thing to do is to be playing video games with my friends,','leave to go use the bathroom, never come back,','and keep them waiting for hours with no indication.'],
      ['If you put a gun to my head and asked for me to choose between never eating a Munchie Meal from Jack in the Box ever again','or to accept that the Clockwork God cannot exist,','I will take the gun and blow my brains out immediately.']
    ]},
    juan:{name:'Juan Carlos',portrait:'pfp/pfp39.png',file:'Juan',ids:new Set(['39']),clips:[
      ['Stand behind me, my brothers and sisters of Costa Rica.','Gaze upon my unparalleled divinity, and be inspired!'],
      ['Down with the bird cult. Down with MINAE.','Down with Makenna. Down with Mimi, and all the misery that she\'s caused!'],
      ['Mimi is not what she seems. On the outside, is a regular bird.','But she is the fury of the nebula - she is the destruction of cosmos, of stars, of galaxies -','we must see to her defeat, else we risk the destruction all that we know!'],
      ['I am no mere mortal. I am the brother to Bobby Jones, Providence of the Cosmos.','I was born in the heart of a supernova.','My galactic flail, holds the core of an infinitely collapsing neutron star. Makenna cannot defeat me.'],
      ["Makenna's Bird Cult is divorced from the concept of true divinity.",'There is no god in such simple creatures,','There is no rationality behind behind her deluded cult of personality.']
    ]},
    chris:{name:'Christopher Erbs',portrait:'pfp/pfp40.png',file:'Chris',ids:new Set(['40']),clips:[
      ["People ask me, why do we patrol the wastes of Temecula, fighting zombie hordes?","I then ask them, what's the alternative? Hiding behind a wall like a sitting duck?"],
      ["Just like everyone else, I've lost my parents.","But I've also lost a many good men along the way. And yet we must march on, no?"],
      ["If you're resourceful enough, anything can become useful.",'Here in the wastes, the outside body of cars can be perfectly molded into a set of armor -',"that's what the kids at Great Oak do.",'And look, road signs are everywhere - they make the perfect shield.'],
      ['Pechanga...Pechanga has fallen. My old home... the parks I used to go to...','the walks I used to take with Daisy...all of it...it is completely overrun now...', 'Those zombies!...we will take it back one day...'],
      ['Brawler Company! Hold up your shields, fasten your weapons.','The students of Great Oak, our home, our comrades, are surrounded on all sides by miles of zombie hordes!','We must liberate them! We must break the siege!','Prepare to charge, show no mercy, and break their lines!']
    ]},
    jimmy:{name:'Jimmy',portrait:'pfp/pfp41.png',file:'Jimmy',ids:new Set(['41','bh18']),clips:[
      ['Within the depths of my unloving heart, burns a blazing fire -','The fire of incel rage!'],
      ['The establishment is out to get me - They keep sending me government agents to try to turn me,','because they know just how dangerous I can be, but I know the truth!','All of them are foids! All of them pretend to care about me, but its all a psyop!'],
      ['These foids would never understand the frighteningly complex inner world that I harbor.','Do they know about HOI4 space marines? NO.','Do they know how to find a sword shrine in Terraria? NO.','They are clueless people, and all they care about is hypergamy!'],
      ['I call upon the powers of incel past, incel present, and incel future to aid me in this defining moment!','May all those who have, do, and ever will feel incelic fury strike down the evil foid in front of me!'],
      ['In the depths of foidal hypergamy, there is an incel shackled to the earth.','He is the first incel, the true incel, and he has been filled with an unspeakable rage.','His wrath, his fury, his unparalleled desire to destroy foids -','his coming will bring true inceldom into this hypergamous world.']
    ]},
    santiago:{"name":"Santiago","portrait":"pfp/pfp30.png","file":"Santiago","clips":[["Your defiance is charming - I'm almost tempted to keep you alive.","But I do not take lightly to treason and disobedience.","Throw him overboard."],["I have no pity for who oppose me.","But I do have pity for those who may still be useful."],["Tengo muchos enemigos.","Pero muchos de mis enemigos también tienen sus propios enemigos.","Lo mejor es dejar que se enfrenten entre ellos mientras tanto."],["They don't call me \"El Matador del Mares\" because I kill people.","No, they call me \"El Matador\" because I kill people, and then I kill anyone who may have been allied with them, in one way or another."],["I hold many grudges.","But there is one grudge in particular that I've dedicated the entirety of my life to..."]],ids:new Set(["30"])},
    rozsi:{"name":"Rozsi Szocs","portrait":"pfp/pfp34.png","file":"Rozsi","clips":[["I want Hungarian schoolchildren across the nation, to feel the same joy I felt, when I picked up my first history book as a child."],["We are not true citizens of the country unless we are properly educated on what our nation is, where it came from, and what it could become"],["The future of our country lies with its ability to educate the population.","Already, under my sister and I, we have propelled Hungarian Education as the model to emulate across the world."],["I could not rule this country without my sister.","She knows me well, I know her well.","We cover each other weaknesses, and support each others strengths."],["Every day spent not reading a book, is a day spent as if you are dead."]],ids:new Set(["34"])},
    alexander:{"name":"Alexander the Magnificient","portrait":"pfp/pfp35.png","file":"Alexander","clips":[["That age may be over, of when kings used to fight their own battles - but here I stand, as a testament to that glorious tradition!"],["Athenians!","Macedonians!","Thracians!","Spartans!","Epirots!","Let us show them what it means to be Greek!","Let us show them the meaning of  a Hellenic Age!"],["I am not Alexander the Great.","I am not his cousin, his son, or even his grandson.","I am Alexander the Magnificient, and I will be Alexander the Magnificient untill I die!"],["A golden sun rises behind me.","The men of my nation stands beside me, at the ready.","I hold a bronze shield, and the spear of noble warriors that came before me.","On this day, on this battlefield, you will be defeated!"],["This is a war you cannot win.","We will fight, we will die, we will march to the ends of the world to defeat you!"]],ids:new Set(["35"])},
    marie:{"name":"Marie L'amboure","portrait":"pfp/pfp36.png","file":"Marie","clips":[["I am certain the Maginot will hold against the Soviet and German advance.","The French people today are unlike their ancestors in previous conflicts - they are fiercer, they are stronger, and most of all, they are ready to prove their point."],["hahaha, Do not bother me the trivialities of my political opponent.","Their voice is so meager, so frail, I cannot hear it over the sound of my own footsteps."],["Make no mistake about it.","Not only will never reach Paris, but even if Paris fell, I am not surrendering the French Nation.","I will not surrender even if all of France is taken, or if even all of her posessions across the sea are taken.","We will never surrender."],["I'm not sure my political opponent is even tall enough to speak to me eye to eye - isn't he like 168cm?","These days, that's a little short!","I better take off my shoes to speak to him, no?","I don't want to be mistaken around children."],["Denigrating your political opponent, insulting them, digging up their old dirt- this has been the way of winning politics for decades now.","To bury your head in the sand and pretend that this isn't true is delusion."]],ids:new Set(["36"])},

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
    const audio = typeof fateAudioReport === 'function' ? fateAudioReport() : {chatterVolume:0.8, masterVolume:1};
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
      volume:Math.min(0.7, Math.max(0, (audio.chatterVolume ?? audio.voiceVolume ?? 0.8) * audio.masterVolume))
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
    current = run; audio.volume = Math.min(1, volume * (character.file === 'Marie' ? 1.4 : 1));
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
      current.audio.volume = Math.min(1, s.volume * (characters[current.key.split(':')[0]]?.file === 'Marie' ? 1.4 : 1));
      if(now - current.requestedAt > 120000 || (!current.started && now - current.requestedAt > 10000)) stop();
      return;
    }
    if(!s.ready) return;
    if(now - quietSince < 8000 || now < nextAt) return;
    const remaining = s.eligibleCharacters.flatMap(characterKey =>
      characters[characterKey].clips.flatMap((clip, index) => clip ? [{characterKey, index, key:characterKey + ':' + index}] : [])
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
    if(s.inactive || s.interrupt || s.volume <= 0 || !s.eligibleCharacters.includes(message.characterKey)) return;
    stop();
    start({characterKey:message.characterKey,index:message.index,key}, s.volume);
  });
  window.FateIdleChatter = Object.freeze({reset, activity, trackVoice,
    clipsForCard:cardId => {
      const character = Object.values(characters).find(entry => entry.ids.has(String(cardId)));
      return character ? character.clips.flatMap((clip, index) => clip ? [clipUrl(character, index)] : []) : [];
    },
    report:() => ({
      used:used.size,
      remaining:eligibleNow.reduce((total, characterKey)=>total + characters[characterKey].clips.filter((clip, index)=>
        clip && !used.has(characterKey + ':' + index) && !failed.has(characterKey + ':' + index)
      ).length, 0),
      playing:!!current
    })});
  window.addEventListener('pagehide', stop);
  setInterval(tick, 250);
})();
