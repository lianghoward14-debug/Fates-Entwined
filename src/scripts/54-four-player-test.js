(() => {
  const moduleUrl = new URL("../../shared/team-match.mjs", document.currentScript.src);
  window.openFourPlayerTest = async function(){
    if(document.getElementById("team-match-test")) return;
    const root = document.createElement('main');
    root.id="team-match-test";
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#101420;color:#eee;padding:clamp(12px,4vw,48px);font-family:Georgia,serif';
    document.body.append(root);
    try {
    const profiles = shuffle([...AI_OPPONENTS]).slice(0,4);
    const catalog = new Map(CARDS.map(card => [card.id,card]));
    const {createMatch,applyCommand,matchView} = await import(moduleUrl.href);
    const match = createMatch(profiles.map(()=>shuffle(buildFreePlayRandomDeck())));
    const send = (actor,command)=>applyCommand(match,actor,{...command,revision:match.revision},catalog);
    const fate = seat => seat.field.reduce((sum,id)=>sum+(Number(catalog.get(id).fate)||0),0);
    const log = [];
    function advance(){
      const turn=match.turn, team=(turn-1)%2, first=team*2;
      const pair=[first,first+1];
      const before=matchView(match);
      const recipient=shuffle([...pair]).sort((a,b)=>before.seats[a].handCount-before.seats[b].handCount)[0];
      send(first,{type:'draw',target:recipient});
      const moves=[profiles[recipient].name+' draws.'];
      for(const actor of pair){
        const hand=matchView(match,actor).seats[actor].hand.map(id=>catalog.get(id));
        const supporter=hand.filter(card=>card.type==='Supporter').sort((a,b)=>b.fate-a.fate)[0];
        if(supporter){
          send(actor,{type:'place',card:supporter.id});
          moves.push(profiles[actor].name+' sets '+supporter.name+'.');
        }
        const fuel=matchView(match).seats[actor].field.map(id=>catalog.get(id)).filter(c=>c.type==='Supporter');
        const gain=c=>c.fate-fuel.slice(0,c.cost).reduce((total,card)=>total+Number(card.fate),0);
        const character=hand.filter(c=>c.type!=='Supporter' && c.cost<=fuel.length && gain(c)>0)
          .sort((a,b)=>gain(b)-gain(a) || a.cost-b.cost)[0];
        if(character){
          send(actor,{type:'place',card:character.id});
          moves.push(profiles[actor].name+' consolidates '+character.name+'.');
        }
        send(actor,{type:'end'});
      }
      const seats=matchView(match).seats.map((seat,i)=>({...seat,profile:profiles[i]}));
      const drawer=seats[recipient];
      log.unshift('Turn '+turn+' · Team '+(team+1)+' — '+moves.join(' '));
      const scores = [fate(seats[0])+fate(seats[1]),fate(seats[2])+fate(seats[3])];
      root.innerHTML = '<h1>Two Fronts</h1><p>Team 1 '+scores[0]+' · '+scores[1]+' Team 2</p>';
      for(let t=0;t<2;t++){
        const section = document.createElement('section');
        section.innerHTML = '<h2>Team '+(t+1)+'</h2>';
        section.style.cssText='display:flex;align-items:center;gap:1rem;flex-wrap:wrap;border-top:1px solid #665838;padding:.7rem 0';
        for(const seat of seats.slice(2*t,2*t+2)){
          const panel=document.createElement('div');
          panel.style.cssText='display:flex;gap:.6rem;align-items:center;flex:1;min-width:160px';
          const img=new Image(56,56);
          img.src=getAIProfileImg(seat.profile,'circle') || seat.profile.img;
          img.style.cssText='object-fit:cover;border-radius:50%';
          const label=document.createElement('span');
          label.textContent=seat.profile.name+' · '+fate(seat)+' Fate';
          const stats=document.createElement('small');
          stats.style.display='block';
          stats.textContent=seat.handCount+' in hand · '+seat.deckCount+' in deck'+(seat===drawer?' · Drew this turn':'');
          label.append(stats); panel.append(img,label); section.append(panel);
        }
        root.append(section);
      }
      const heading=document.createElement('h3');
      heading.textContent=turn<24?'Turn '+turn+' of 24':scores[0]===scores[1]?'Draw':'Team '+(scores[0]>scores[1]?1:2)+' wins';
      root.append(heading);
      for(const line of log){const p=document.createElement('p');p.textContent=line;root.append(p);}
      if(turn<24) setTimeout(advance,3000);
    }
    advance();
    } catch(error){root.remove(); console.error(error); toast("Four-player test could not start: " + error.message);}
  };
  if(/^\/testnewmode\/?$/.test(location.pathname)){
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",window.openFourPlayerTest,{once:true});
    else window.openFourPlayerTest();
  }
})();
