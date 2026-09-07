// The Hidden Archive edits the physical deck. No separate draw queue is used.
(function(){
  'use strict';
  let active = null;
  function closeArchive(){
    if(!active) return;
    const previous = active;
    active = null;
    previous.root.remove();
    previous.focus?.focus?.();
    previous.resolve(null);
  }
  window.closeLedgerArchive = closeArchive;

  window.openLedgerArchive = function(cards, options = {}){
    if(active?.key === options.key && options.key) return active.promise;
    closeArchive();
    const ordered = cards.slice(0,5);
    const original = ordered.slice();
    const root = document.createElement('div');
    root.id = 'ledger-archive';
    root.innerHTML = '<section class="ledger-panel" role="dialog" aria-modal="true" aria-labelledby="ledger-title" aria-describedby="ledger-help"><header><span class="ledger-eyebrow">THE LEDGER-KEEPERS</span><h2 id="ledger-title">The Hidden Archive</h2><p id="ledger-help">Arrange your next draws. Drag cards or use the arrow buttons.</p></header><div class="ledger-direction"><span>01 · DRAWS NEXT</span><span>LATER DRAWS →</span></div><div class="ledger-cards" role="list"></div><p class="ledger-announcement" aria-live="polite"></p><footer><span>The rest of your deck stays in order.</span><div><button type="button" class="ledger-reset">Reset order</button><button type="button" class="ledger-confirm">Confirm order</button></div></footer></section>';
    const list = root.querySelector('.ledger-cards');
    const announce = root.querySelector('.ledger-announcement');
    const confirm = root.querySelector('.ledger-confirm');
    if(options.readOnly){
      root.querySelector('#ledger-help').textContent = 'Your opponent revealed these cards and is choosing their draw order.';
      root.querySelector('.ledger-direction').textContent = 'REVEALED CARDS · ORIGINAL ORDER';
      root.querySelector('footer>span').textContent = 'Waiting for your opponent.';
      root.querySelector('.ledger-reset').hidden = true;
      confirm.textContent = 'Close';
    }
    let dragging = null;
    let submitting = false;
    let resolve;
    const promise = new Promise(done=>{ resolve = done; });
    const session = {root, key:options.key, promise, resolve, focus:document.activeElement};
    active = session;
    function move(from,to,focus){
      if(options.readOnly || submitting || from === to || from < 0 || to < 0 || to >= ordered.length) return;
      const card = ordered.splice(from,1)[0];
      ordered.splice(to,0,card);
      render();
      announce.textContent = card.name + ' is now draw ' + (to+1) + '.';
      if(focus) list.children[to].querySelector('button:not(:disabled)')?.focus();
    }
    function render(){
      list.replaceChildren();
      ordered.forEach((card,index)=>{
        const item = document.createElement('article');
        item.className = 'ledger-card';
        item.setAttribute('role','listitem');
        item.draggable = !submitting && !options.readOnly;
        const badge = document.createElement('span');
        badge.className = 'ledger-position';
        badge.textContent = index === 0 ? '1 · Next draw' : String(index+1);
        const img = document.createElement('img');
        const base = typeof CARDS !== 'undefined' ? CARDS.find(c=>String(c.id) === String(card.id)) : null;
        img.src = base?.img || card.img || 'back.png';
        img.alt = card.name || base?.name || 'Card';
        img.draggable = false;
        const name = document.createElement('strong');
        name.textContent = card.name || base?.name || 'Card';
        const controls = document.createElement('div');
        controls.className = 'ledger-moves';
        [-1,1].forEach(delta=>{
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = delta < 0 ? '←' : '→';
          button.setAttribute('aria-label','Move '+name.textContent+(delta < 0 ? ' earlier' : ' later'));
          button.disabled = submitting || index+delta < 0 || index+delta >= ordered.length;
          button.onclick = ()=>move(index,index+delta,true);
          controls.append(button);
        });
        item.append(badge,img,name,controls);
        if(options.readOnly) controls.remove();
        item.ondragstart = event=>{ dragging = index; event.dataTransfer.setData('text/plain',String(index)); event.dataTransfer.effectAllowed = 'move'; item.classList.add('is-dragging'); };
        item.ondragend = ()=>{ dragging = null; item.classList.remove('is-dragging'); };
        item.ondragover = event=>{ if(dragging !== null && !submitting){ event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } };
        item.ondrop = event=>{ event.preventDefault(); if(dragging !== null) move(dragging,index,false); dragging = null; };
        list.append(item);
      });
    }
    root.querySelector('.ledger-reset').onclick = ()=>{ if(!submitting){ ordered.splice(0,ordered.length,...original); render(); announce.textContent = 'Original order restored.'; } };
    confirm.onclick = async function(){
      if(submitting) return;
      submitting = true;
      confirm.disabled = true;
      confirm.textContent = 'Saving order…';
      render();
      try{
        const accepted = options.onConfirm ? await options.onConfirm(ordered.slice()) : true;
        if(accepted === false) throw new Error('The order could not be saved. Please try again.');
        if(active === session){ active = null; root.remove(); session.focus?.focus?.(); }
        resolve(ordered.slice());
      }catch(error){
        submitting = false;
        confirm.disabled = false;
        confirm.textContent = 'Confirm order';
        announce.textContent = error.message || 'Please try again.';
        render();
      }
    };
    root.addEventListener('keydown',event=>{
      if(event.key === 'Escape'){ event.preventDefault(); event.stopPropagation(); return; }
      if(event.key !== 'Tab') return;
      const buttons = [...root.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length-1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last?.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first?.focus(); }
      event.stopPropagation();
    });
    document.body.append(root);
    render();
    confirm.focus();
    return promise;
  };

  window.resolveLedgerArchive = async function(player, source, options = {}){
    const game = G;
    const deck = game.players[player].deck;
    const top = deck.slice(0,5);
    if(!top.length){ if(typeof toast === 'function') toast('The Hidden Archive: your deck is empty.'); return; }
    const apply = ordered=>{
      if(G !== game) return false;
      const remaining = new Map(game.players[player].deck.map(card=>[String(card.iid),card]));
      const arranged = ordered.map(card=>remaining.get(String(card.iid))).filter(Boolean);
      const ids = new Set(arranged.map(card=>String(card.iid)));
      game.players[player].deck = arranged.concat(game.players[player].deck.filter(card=>!ids.has(String(card.iid))));
      if(typeof log === 'function') log(player === 0 ? 'p1' : 'p2','The Hidden Archive: rearranged '+arranged.length+' cards.');
      return true;
    };
    if(typeof log === 'function') log(player === 0 ? 'p1' : 'p2','The Hidden Archive revealed: '+top.map(card=>card.name).join(', '));
    if(options.ai){
      const strategy = game._selectedAI?._deckStrategy || '';
      const priority = typeof aiDeckSearchPriority === 'function' ? aiDeckSearchPriority(strategy,'character') : [];
      top.sort((a,b)=>{
        const rank = card=>{ const index = priority.indexOf(String(card.id)); return index < 0 ? 1000-Number(card.currentFate ?? card.fate ?? 0) : index; };
        return rank(a)-rank(b);
      });
      apply(top);
      return;
    }
    game._ledgerArchivePending = true;
    try{
      if(typeof waitForEffectPresentationBeforeChoice === 'function') await waitForEffectPresentationBeforeChoice();
      await window.openLedgerArchive(top,{key:'local-ledger:'+source.iid+':'+game.turn,onConfirm:apply});
    }finally{ delete game._ledgerArchivePending; }
  };
})();
