/** Royal Seal: a private choice above the live board. */
let dismissCurrent;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function playCardClaimSound(){
 if(typeof playSfx==='function')playSfx('supportCardClaim');
}
export function pickRoyalSeal(cards,opts={},onConfirm){
 if(window.getSupportCompanyPresentationDelayMs?.()>0){
  const game=typeof G!=='undefined'?G:null;let cancelled=false;
  const cancel=()=>{cancelled=true;};dismissCurrent?.();dismissCurrent=cancel;
  window.waitForSupportCompanyPresentation(()=>!cancelled && (typeof G==='undefined'||G===game) && (!opts.isCurrent||opts.isCurrent())).then(ready=>{
   if(!ready)return;
   if(dismissCurrent===cancel)dismissCurrent=null;
   pickRoyalSeal(cards,opts,onConfirm);
  });
  return cancel;
 }
 if(opts.isCurrent && !opts.isCurrent())return ()=>{};
 dismissCurrent?.();if(typeof closeModal==='function')closeModal();
 const previous=document.activeElement,root=document.createElement('div');root.className='sc-royal-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',`${opts.abilityName||'Call to Arms'} — choose a reinforcement`);
 root.innerHTML=`<header class="sc-royal-heading"><span>${esc(opts.abilityName||'Call to Arms')}</span><h2>Choose your reinforcement</h2><p>${esc(opts.categoryLabel||'Choose one card to add to your hand')}</p></header><div class="sc-royal-cards">${cards.map((c,i)=>`<section class="sc-royal-entry"><button class="sc-royal-card" style="--angle:${(i-1)*4}deg" aria-label="Choose ${esc(c.name)}"><img src="${esc(c.img||`${c.id}.png`)}" alt="${esc(c.name)}"></button><div class="sc-royal-ability"><h3>${esc(c.ability||c.name)}</h3><p>${esc(c.effect)}</p></div></section>`).join('')}</div><div class="sc-royal-flare"></div><p class="sc-royal-status" aria-live="polite"></p>`;
 root.dataset.promptKey=String(opts.promptKey||'');
 // Shared by deck orders and every card-triggered reinforcement choice.
 if(typeof playSfx==='function')playSfx('supportReinforcementReveal');
 document.body.append(root);let disposed=false,selecting=false;const animations=[],buttons=[...root.querySelectorAll('.sc-royal-card')],status=root.querySelector('.sc-royal-status');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('fate-animations-off');
 function animate(el,frames,options={}){const a=el.animate(frames,{duration:800,fill:'both',easing:'cubic-bezier(.2,.75,.2,1)',...options,...(reduced?{duration:80,delay:0}:{})});animations.push(a);return a.finished.catch(()=>{});}
 function cleanup(){if(disposed)return;disposed=true;clearInterval(watch);animations.forEach(a=>a.cancel());root.remove();document.removeEventListener('keydown',keys,true);if(previous?.isConnected)previous.focus();if(dismissCurrent===cleanup)dismissCurrent=null;}
 dismissCurrent=cleanup;
 function keys(e){if(e.key==='Escape'&&opts.allowCancel!==false&&!selecting){e.preventDefault();cleanup();}if(e.key==='Tab'){const focusable=[...root.querySelectorAll('button:not(:disabled)')];if(!focusable.length)return;e.preventDefault();const at=focusable.indexOf(document.activeElement);focusable[(at+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus();}}
 document.addEventListener('keydown',keys,true);root.querySelector('.sc-royal-cancel')?.addEventListener('click',()=>{if(!selecting)cleanup();});
 const watch=setInterval(()=>{if(opts.isCurrent&&!opts.isCurrent()){cleanup();return;}if(!selecting)status.textContent=opts.canSelect&&!opts.canSelect()?'Waiting for your turn…':'';},250);
 buttons.forEach((button,i)=>{animate(button,[{opacity:0,transform:`translate(${(1-i)*220}px,60px) rotateY(70deg) scale(.8)`},{opacity:1,transform:'none'}],{duration:1000,delay:i*130}).then(()=>{if(disposed||selecting||reduced)return;const a=button.animate([{translate:'0 0'},{translate:'0 -12px'},{translate:'0 0'}],{duration:3600+i*250,iterations:Infinity,easing:'ease-in-out'});animations.push(a);});button.onclick=async()=>{
  if(selecting||disposed)return;if(opts.canSelect&&!opts.canSelect()){status.textContent='You can choose on your turn.';return;}selecting=true;root.classList.add('selecting');buttons.forEach(b=>{b.disabled=true;b.getAnimations().forEach(a=>a.cancel());});const cancel=root.querySelector('.sc-royal-cancel');if(cancel)cancel.disabled=true;playCardClaimSound();
  const box=button.getBoundingClientRect(),dx=innerWidth/2-box.left-box.width/2,dy=innerHeight*.43-box.top-box.height/2;button.parentElement.style.zIndex=3;
  const selectedTitle=document.createElement('div');selectedTitle.className='sc-royal-selected-title';selectedTitle.textContent='Card Selected';selectedTitle.setAttribute('role','status');
  selectedTitle.style.top=`${Math.min(innerHeight*.43+button.offsetHeight*.535+28,innerHeight-100)}px`;
  root.append(selectedTitle);
  animate(selectedTitle,[{opacity:0,transform:'translateY(18px) scale(.94)',filter:'blur(5px)'},{opacity:1,transform:'translateY(0) scale(1)',filter:'blur(0)'}],{duration:650,delay:550});
  buttons.filter(b=>b!==button).forEach((b,j)=>animate(b,[{opacity:1},{opacity:0,transform:`translate(${j?-90:90}px,130px) scale(.65)`}],{duration:600}));
  animate(root.querySelector('.sc-royal-flare'),[{opacity:0,transform:'translate(-50%,-50%) scale(1)'},{opacity:.65,offset:.4},{opacity:0,transform:'translate(-50%,-50%) scale(14)'}],{duration:1300});
  await animate(button,[{transform:'none',rotate:`${(i-1)*4}deg`},{transform:`translate(${dx}px,${dy}px) scale(1.17)`,rotate:'0deg',filter:'brightness(1.6)',offset:.6},{transform:`translate(${dx}px,${dy}px) scale(1.07)`,rotate:'0deg',filter:'brightness(1)'}],{duration:1250});
  if(disposed)return;animate(selectedTitle,[{opacity:1},{opacity:0,transform:'translateY(12px)'}],{duration:400,delay:650});await animate(button,[{transform:`translate(${dx}px,${dy}px) scale(1.07)`,rotate:'0deg',opacity:1},{transform:`translate(${dx}px,${innerHeight-box.top}px) scale(.1)`,rotate:'0deg',opacity:0}],{duration:750,delay:400});if(disposed)return;
  const valid=(!opts.isCurrent||opts.isCurrent())&&(!opts.canSelect||opts.canSelect());cleanup();if(valid)await onConfirm([cards[i]]);
 };});buttons[0]?.focus();return cleanup;
}
window.pickRoyalSeal=pickRoyalSeal;
window.dismissRoyalSeal=()=>dismissCurrent?.();
