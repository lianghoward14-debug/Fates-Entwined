(function(){
  'use strict';
  function viewer(){var n=typeof getPerspectivePlayerIndex==='function'?Number(getPerspectivePlayerIndex()):0;return Number.isInteger(n)?n:0;}
  function visible(card,owner,local){return owner===local||(typeof isLandscapeActive==='function'&&isLandscapeActive('igb12'))||!!(G&&G._revealedCards&&card&&G._revealedCards[card.iid]);}
  function openHand(playerIndex){
    var player=G&&G.players&&G.players[playerIndex];if(!player)return;
    var hand=Array.isArray(player.hand)?player.hand:[],local=viewer();
    showModal((player.name||('Player '+(playerIndex+1)))+"'s Hand",'',[{label:'Close',action:closeModal}],{immediate:true});
    var body=document.getElementById('modal-body'),wrap=document.createElement('div');wrap.className='hand-viewer-window';
    if(!hand.length)wrap.innerHTML='<p class="hand-viewer-empty">No cards in hand</p>';
    hand.forEach(function(card){var face=visible(card,playerIndex,local),slot=document.createElement('button');slot.type='button';slot.className='hand-viewer-card '+(face?'is-revealed':'is-hidden');
      if(face){var src=card.img&&typeof getRuntimeCardImageSrc==='function'?getRuntimeCardImageSrc(card.img,'detail'):(card.img||'');slot.innerHTML=src?'<img src="'+src+'" alt="">':'<span>'+String(card.name||'Card')+'</span>';slot.title=card.name||'Revealed card';slot.onclick=function(){if(typeof openCardDetail==='function')openCardDetail(card,false,false);};}
      else{slot.innerHTML='<img src="back.png" alt="Face-down card">';slot.setAttribute('aria-label','Face-down card');slot.disabled=true;}wrap.appendChild(slot);});
    body.replaceChildren(wrap);document.querySelector('#modal .modal')?.classList.add('visual-card-picker-modal','hand-viewer-modal');
  }
  function handCount(playerIndex){var player=G&&G.players&&G.players[playerIndex];return Array.isArray(player&&player.hand)?player.hand.length:0;}
  window.getPlayerHandCount=handCount;window.showPlayerHandWindow=openHand;window.showRevealedHandWindow=openHand;
})();
