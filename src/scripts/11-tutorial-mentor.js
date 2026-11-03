// Event-driven curriculum. All actions still go through the shipping game controls.
(function(){
  'use strict';
  const root=new URL('../../',document.currentScript.src);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lessons=[
    {chapter:0,title:'Find your two winning zones',task:'Compare the three zone scores. Your aim: lead two zones.',why:'Two zone wins beat one overwhelming zone. Equal zone wins are decided by total Fate. Morale reaching zero can end a match earlier.',button:'Show me my first card',target:'scores'},
    {chapter:0,title:'Read a card before playing it',task:'Open Maroon Knights. Find its Fate, type, and effect.',why:'Fate is scoring strength. Reinforcement cost belongs to Characters. Card text explains how a card changes the usual rules.',target:'hand'},
    {chapter:1,title:'Place your first Supporter',task:'Choose Place on Board, then click a highlighted square in your safe row.',why:'Maroon Knights raises the Fate of your Supporters in its zone, including itself. Watch the score change after it arrives.',target:'hand'},
    {chapter:1,title:'Use your second Supporter placement',task:'Place IB Student. You normally get two Supporter placements each turn.',why:'You normally set up to two Supporters in a turn. IB Student also searches when set, so your next action will be a card choice.',target:'hand'},
    {chapter:2,title:'Resolve the search',task:'Select a Supporter in the search window. Confirm with Add to Hand.',why:'Searching chooses a card; drawing takes the next one. The searched card goes into your hand, not directly onto the board.',target:'prompt'},
    {chapter:2,title:'Hand the turn to your opponent',task:'Press End Turn. Now your opponent gets to play.',why:'Unused placement opportunities do not carry over. Before ending a normal turn, consider effects and consolidation as well as Supporter placements.',target:'end'},
    {chapter:2,title:'Watch the response',task:'Watch which zones your opponent strengthens.',why:'A lead is temporary. Your opponent can reinforce a zone, alter your Fate, or change which cards remain on the board.',target:'scores'},
    {chapter:3,title:'Turn your setup into a Character',task:'Choose Anne Stone. Pay 2 Reinforcement with eligible board cards, then place her.',why:'Consolidation spends the selected cards. Anne adds her own Fate and strengthens remaining Supporters in her zone. Compare the lost cards with the position you gain.',target:'hand'},
    {chapter:3,title:'Read the result of your play',task:'Compare the zone scores. Was the Character worth the cards you spent?',why:'A higher-cost card is not automatically a better play. Effects, placement, and the strength you sacrificed determine the real value.',button:'I see the trade-off',target:'scores'},
    {chapter:4,title:'Understand the match conditions',task:'Find the landscape and Morale counters. Open the rulebook for their rules.',why:'Landscapes and status effects can change the normal rules. Use live Fate values, and check the match counter rather than assuming every mode has the same length.',button:'Plan my next turn',target:'conditions'},
    {chapter:4,title:'Build a second front',task:'Make a play in a different zone. Build a second way to win.',why:'This is your decision: build with Supporters, consolidate, or use a card effect. The guide no longer chooses the card for you.',target:'scores'},
    {chapter:5,title:'Finish the match with your own plan',task:'Play on your own. Resolve effects, compare zones, then End Turn.',why:'You have practised the main controls. Now use them together. Winning is the objective, but the result is also useful feedback on your decisions.',target:'scores'}
  ];
  const chapterNames=['Read the board','Build a position','Effects & turns','Consolidation','Make a plan','Play independently'];
  let active=false,host=null,step=0,review=null,compact=false,key='',firstZone=null,lastFeedback='',highlight=null,confirmed=new Set();
  let inspected=false,placements=0,searches=0,consolidations=0,turnsEnded=0,returned=false,observedOpponent=false,secondFront=false;
  const placementIds=new Set();
  function board(){return (G.board||[]).flat(2).filter(c=>c && c.owner===0);}
  function hand(){return G.players?.[0]?.hand||[];}
  function modalOpen(){return !!document.getElementById('modal')?.classList.contains('on');}
  function advance(){
    if(step===1 && inspected)step++;
    if(step===2 && placements>=1)step++;
    if(step===3 && placements>=2)step++;
    if(step===4 && searches>=1)step++;
    if(step===5 && turnsEnded>=1)step++;
    if(step===6 && returned)step++;
    if(step===7 && consolidations>=1)step++;
    if(step===8 && confirmed.has(8))step++;
    if(step===9 && confirmed.has(9))step++;
    if(step===10 && secondFront)step++;
  }
  function suggested(){
    const cards=hand();
    if(step<=2)return cards.find(c=>c.id==='59')||cards.find(c=>c.type==='Supporter');
    if(step===3 || step===4)return cards.find(c=>c.id==='60');
    if(step===7)return cards.find(c=>c.id==='11')||cards.filter(c=>c.type!=='Supporter').sort((a,b)=>a.cost-b.cost)[0];
    return null;
  }
  function scores(){return [0,1,2].map(z=>{
    const own=typeof getZoneScore==='function'?getZoneScore(z,0):0;
    const other=typeof getZoneScore==='function'?getZoneScore(z,1):0;
    return {own,other};
  });}
  function clearHighlight(){document.querySelectorAll('[data-mentor-highlight]').forEach(el=>el.removeAttribute('data-mentor-highlight'));highlight=null;}
  function pointAt(target){
    if(highlight===target)return;clearHighlight();highlight=target;
    const selectors={hand:'[aria-label="View your hand"],#hand-cards',end:'[aria-label="End turn"],#btn-end-turn',scores:'#topbar',conditions:'[aria-label="Your status effects"]',prompt:'#modal.on .modal-acts'};
    document.querySelectorAll(selectors[target]||'').forEach(el=>el.setAttribute('data-mentor-highlight','true'));
  }
  function event(type,p={}){
    if(!active)return;
    if(type==='inspected' && p.card && (p.card.owner===0 || hand().includes(p.card))){inspected=true;lastFeedback='Card inspected.';}
    if(type==='placed' && p.player===0){
      const id=p.card?.iid;if(id && placementIds.has(id))return;if(id)placementIds.add(id);
      if(firstZone===null)firstZone=p.z;
      if(step>=10 && p.z!==firstZone)secondFront=true;
      if(p.card?.type==='Supporter')placements++;
      if(p.kind==='consolidate')consolidations++;
      lastFeedback=p.kind==='consolidate'?'Character placed. Reinforcement spent.':`${p.card?.name||'Card'} placed in Zone ${p.z+1}.`;
    }
    if(type==='searched' && p.player===0 && p.chosen?.length){searches++;lastFeedback=`${p.chosen.map(c=>c.name).join(', ')} added to your hand.`;}
    if(type==='endTurn' && p.player===0){turnsEnded++;returned=false;observedOpponent=false;lastFeedback='Turn ended. Watch the opponent’s response.';}
    const old=step;advance();if(step!==old){review=null;compact=false;key='';}render();
  }
  function begin(el){
    active=true;host=el;step=0;review=null;compact=false;key='';firstZone=null;lastFeedback='';confirmed.clear();placementIds.clear();
    inspected=false;placements=0;searches=0;consolidations=0;turnsEnded=0;returned=false;observedOpponent=false;secondFront=false;
    host.classList.add('mentor-panel');host.style.left='';host.style.top='';
  }
  function prepareOpening(){
    const pool=[...G.players[0].hand,...G.players[0].deck];
    const opening=[];
    for(const id of ['59','60','11','63','32','40']){const i=pool.findIndex(c=>c.id===id);if(i>=0)opening.push(...pool.splice(i,1));}
    while(opening.length<6 && pool.length)opening.push(pool.shift());
    G.players[0].hand=opening;G.players[0].deck=pool;
  }
  function canEndTurn(){
    if(!active || G.currentPlayer!==0)return true;
    if(step===0 || step===1){lastFeedback='First, use the guide to read the board and inspect a card. You can leave guided mode at any time.';compact=false;key='';render();return false;}
    // Never trap the player if the board or hand has changed unexpectedly.
    if([2,3].includes(step) && hand().some(c=>c.type==='Supporter') && Number(G.supportsPlacedThisTurn||0)<2){
      lastFeedback='Try the Supporter placement in this lesson before ending the turn. Use “Show card” for help.';compact=false;key='';render();return false;
    }
    return true;
  }
  function render(){
    if(!active || window.FateTutorialCatalog?.isOpen()){if(host)host.hidden=true;return;}
    if(!host || !document.getElementById('s-game')?.classList.contains('active'))return;
    if(step===6 && G.currentPlayer!==0)observedOpponent=true;
    if(step===6 && observedOpponent && G.currentPlayer===0 && G.phase==='main')returned=true;
    advance();
    const lesson=lessons[review??step],card=suggested(),values=scores(),opponent=G.currentPlayer!==0,prompt=modalOpen();
    let title=lesson.title,task=lesson.task;
    if(review===null){
      if(opponent){title='Watch the opponent’s turn';task='Watch your opponent. Your turn comes next.';}
      else if(prompt){
        title=step===4?'Choose a useful Supporter':'Use the card window';
        task=step===4?lesson.task:step===7?'Choose the placement action. Then select 2 Reinforcement.':step<=3?'Read the card, then choose Place on Board.':'Complete the open choice, then return to the board.';
      }
      else if(G._consolidating){title='Choose your Reinforcement';task='Select Reinforcement, then a destination. Selected cards are spent.';}
      else if(step===4 && !searches){task=card?'Play IB Student. Choose a Supporter in its search window.':'Open IB Student on the board. Activate its effect if available.';}
      else if(step===7 && board().filter(c=>c.type==='Supporter').length<2){task='Place Supporters first. Anne Stone needs 2 Reinforcement.';}
    }
    const newKey=JSON.stringify([step,review,compact,title,task,card?.iid,values,lastFeedback,opponent,prompt,placements,searches,consolidations]);
    if(newKey===key)return;key=newKey;
    host.classList.toggle('mentor-modal',prompt);
    pointAt(opponent?'scores':lesson.target);
    host.innerHTML=`<div class="coach-heading"><span>LEARN BY PLAYING <small>${lesson.chapter+1} / 6</small></span><button id="mentor-fold" aria-label="${compact?'Expand':'Minimize'} instruction">${compact?'+':'−'}</button></div>
      ${compact?`<button class="mentor-resume" id="mentor-resume">${escape(title)} →</button>`:`<div class="coach-body"><p class="mentor-task" role="status" aria-live="polite">${escape(task)}</p>
      ${card && !opponent && !prompt && review===null && [1,2,3,4,7].includes(step)?`<button class="mentor-pick" id="mentor-card"><img src="${escape(new URL(card.img||'back.png',root).href)}" alt=""><span><b>${escape(card.name)}</b><small>Open this card →</small></span></button>`:''}
      ${lesson.button && !opponent && !prompt?`<button id="mentor-next">${step===0?'Show my first card':'Continue'} →</button>`:''}
      <div class="mentor-bottom"><button id="mentor-book">Rulebook · pauses timer</button><button id="mentor-unguided" aria-label="Continue without tutorial prompts">Hide tips</button></div></div>`}`;
    const bind=(id,fn)=>{const el=host.querySelector('#'+id);if(el)el.onclick=fn;};
    bind('mentor-book',()=>window.FateTutorialCatalog?.open());
    bind('mentor-fold',()=>{compact=!compact;key='';render();});bind('mentor-resume',()=>{compact=false;key='';render();});
    bind('mentor-card',()=>{if(G.currentPlayer!==0)return;const idx=hand().findIndex(c=>c===card);if(idx>=0){if(modalOpen())window.closeModal?.();window.selectHandCard(idx);}});
    bind('mentor-next',()=>{
      const firstCard=step===0;
      if(firstCard)step=1;else confirmed.add(step);
      advance();key='';render();
      if(firstCard && G.currentPlayer===0){const chosen=suggested();const index=hand().indexOf(chosen);if(index>=0)window.selectHandCard(index);}
    });
    bind('mentor-review',()=>{review=Math.max(0,step-1);key='';render();});bind('mentor-live',()=>{review=null;key='';render();});
    bind('mentor-unguided',()=>{active=false;host.hidden=true;clearHighlight();});
  }
  function summary(){
    const skills=[['Inspect a card',inspected],['Build with Supporters',placements>=2],['Resolve a search',searches>0],['Complete a turn',turnsEnded>0],['Consolidate a Character',consolidations>0],['Build another zone',secondFront]];
    return `<section class="mentor-report"><h2>Your match, reviewed</h2><p>A result is not the same as mastery. Here is what you practised in this match.</p><div>${skills.map(([label,done])=>`<p><span>${done?'Practised':'Keep practising'}</span>${label}</p>`).join('')}</div><p>For your next match: read the opening hand, plan two zones, and compare what you gain and lose before consolidating.</p></section>`;
  }
  function stop(){active=false;clearHighlight();if(host)host.hidden=true;}
  function target(){
    if(!active || review!==null || G.currentPlayer!==0 || !G.placing || ![2,3].includes(step))return null;
    const card=hand()[G.selectedHandCard];if(!card || card.type!=='Supporter')return null;
    const z=step===2?0:1;
    const c=[1,0,2].find(c=>G.board?.[z]?.[2] && !G.board[z][2][c]);
    return c===undefined?null:{z,r:2,c,id:String(card.id),kind:'place'};
  }
  window.FateTutorialCoach={begin,prepareOpening,event,canEndTurn,render,summary,stop,target};
})();
