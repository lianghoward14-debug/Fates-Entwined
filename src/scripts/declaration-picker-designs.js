/* Approved declaration windows. Existing buttons retain their action handlers. */
(function(){
  const paths={Supporter:'M12 3 2 8l10 5 10-5-10-5M2 12l10 5 10-5M2 16l10 5 10-5',Initiator:'m4 3 17 17m-1-17L3 20M3 3l1 5 4-4-5-1m18 0-5 1 4 4 1-5M2 17l5 5m10-20 5 5',Improvisor:'m13 2-9 12h7l-1 8 10-13h-7l1-7',Coordinator:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m4 6-3 5-5 3 3-5 5-3',Dauntless:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4'};
  window.applyDeclarationPickerDesign=function(kind,source){
    const modal=document.querySelector('#modal .modal'),body=document.getElementById('modal-body');
    if(!modal||!body||body.querySelector('.declaration-profile'))return;
    const config={sov:['44','Soviet Grenadiers','The Bears of Russia'],selva:['104','Anička Konvička · Selva Island','The Destruction of Paradise'],chloe:['114','Chloe Kirk','Charter of the United Nations']};
    config.berkeley=['50','Berkeley CS Major','Artillery Distance'];
    const data=config[kind];
    modal.classList.add('declaration-approved','declaration-'+kind);
    if(kind==='berkeley') body.querySelectorAll('.zone-picker-tile').forEach(function(button){
      const number=button.querySelector('.zone-picker-num');
      if(number) number.textContent=['I','II','III'][Number(button.dataset.zone)] || number.textContent;
    });
    const head=document.createElement('header');head.className='declaration-profile';
    if(data){
      const img=document.createElement('img');img.src='pfp/pfp'+data[0]+'.png';img.alt=data[1];head.appendChild(img);
      const copy=document.createElement('div');
      [data[1],kind==='berkeley'?'Choose a zone':'Declare a card type',data[2]].forEach(function(text,i){const el=document.createElement(i===1?'h2':'div');el.className=i===0?'declaration-name':'declaration-ability';el.textContent=text;copy.appendChild(el);});head.appendChild(copy);
      body.prepend(head);
    }else if(kind==='aff'){
      source=source||{};
      const id=source.pfpId||(/^\d+$/.test(String(source.id))?Number(source.id):0);
      if(id){const img=document.createElement('img');img.src='pfp/pfp'+id+'.png';img.alt=source.name||'';head.appendChild(img);}
      const copy=document.createElement('div');
      [[source.name||'Affiliation declaration','declaration-name','div'],['Declare an affiliation','','h2'],[source.ability||'','declaration-ability','div']].forEach(function(item){const el=document.createElement(item[2]);el.className=item[1];el.textContent=item[0];copy.appendChild(el);});
      head.appendChild(copy);body.prepend(head);
      body.querySelectorAll('.aff-pick-square').forEach(function(button){
        const frame=button.querySelector('.aff-pick-icon-frame');
        if(frame&&['reality','third_great_war','expanded_worlds','eventide'].includes(button.dataset.aff)){
          const image=document.createElement('img');image.src='afficon/'+button.dataset.aff+'.png';image.alt='';frame.replaceChildren(image);
        }
      });
    }
    body.querySelectorAll('[data-bh04-type],[data-bh14-type],[data-soviet-type]').forEach(function(button){
      const type=button.dataset.bh04Type||button.dataset.bh14Type||button.dataset.sovietType;
      const icon=document.createElement('span');icon.className='declaration-type-icon';icon.setAttribute('aria-hidden','true');
      icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[type]||paths.Improvisor)+'"/></svg>';
      button.prepend(icon);
    });
  };
})();
