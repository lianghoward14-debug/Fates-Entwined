const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const catalog=require('./fate-card-catalog').getCardCatalog().cards;
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.SUPPORT_BROWSER_CHANNEL || 'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8766/artifacts/support-company-preview.html');
    const deck=page.frameLocator('#deck-preview');
    await deck.locator('.sc-panel').waitFor();
    assert.equal(await page.locator('.pool li').count(),18);
    assert.equal(await deck.locator('.sc-call').isEnabled(),true);
    assert.equal(await deck.locator('.sc-desperate').isEnabled(),false);
    await deck.locator('.deck-info-modal').screenshot({path:'artifacts/support-company-compact-deck.png'});
    const bounds=await deck.locator('.sc-panel').boundingBox();assert(bounds.height<180,'compact desktop panel');
    await page.locator('#toggle-state').click();
    assert.equal(await deck.locator('.sc-call').isEnabled(),false);
    assert.equal(await deck.locator('.sc-desperate').isEnabled(),true);
    for(const variant of ['call-standard','call-crossed','desperate-shield']){
      await page.locator(`[data-variant="${variant}"]`).click();
      await page.locator('.support-company-cinematic').waitFor();
      await page.waitForTimeout(800);
      assert.equal(await page.locator('.support-company-cinematic').innerText(),variant.startsWith('call')?'Call to Arms':'Desperate Reinforcement');
      await page.locator('#stage').screenshot({path:`artifacts/support-company-${variant}-v4.png`});
      await page.locator('.support-company-cinematic').waitFor({state:'detached'});
    }
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile horizontal overflow');
    assert(await deck.locator('.sc-panel').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'support controls stay inside deck');
    await deck.locator('.deck-info-modal').screenshot({path:'artifacts/support-company-compact-mobile.png'});

    // Exercise the production picker and local payment handler, without
    // starting a match or contacting any online service.
    await page.goto('http://127.0.0.1:8766/artifacts/support-company-preview.html');
    await page.frameLocator('#deck-preview').locator('.sc-panel').waitFor();
    const result=await page.evaluate(async catalog=>{
      await import('/src/scripts/support-company.mjs?browser-regression');
      G={turn:1,phase:'main',currentPlayer:0,players:[{name:'You',hand:[]},{name:'Opponent',hand:[]}],_moralePressure:{morale:[137,200]}};
      window.CARDS=catalog;window.FATE_MORALE_PRESSURE_RULES_ENABLED=true;
      let picker,events=[],handChecks=0;
      window.pickCardsVisual=(cards,opts,confirm)=>{picker={cards,opts,confirm};};
      window.createCardInstance=(definition,player)=>({...definition,owner:player,iid:'support-'+G.players[player].hand.length});
      window.addCardToHand=(player,card,opts)=>{if(opts.announce!==false||opts.animate!==false||opts.skipHandLimit!==true)throw Error('private arrival flags missing');G.players[player].hand.push(card);return true;};
      window.closeModal=()=>{};window.log=()=>{};window.renderGame=()=>{};window.enforceHandLimit=()=>handChecks++;
      window.presentSupportCompanyUse=async event=>{events.push(event);};
      window.openSupportCompany('call',0);
      const ids=picker.cards.map(c=>c.id);const freePicker=picker;
      await freePicker.confirm([picker.cards.find(c=>c.id==='26')]);
      await freePicker.confirm([picker.cards.find(c=>c.id==='26')]); // stale double click
      window.openSupportCompany('desperate',0);
      const paidPrice=picker.opts.confirmLabel;
      await picker.confirm([picker.cards.find(c=>c.id==='30')]);
      const spent=G._supportCompanyUses[0],hand=G.players[0].hand.map(c=>c.id),morale=G._moralePressure.morale[0];
      return {ids,spent,hand,morale,paidPrice,events,handChecks};
    },catalog);
    assert.equal(result.ids.length,18);assert(!result.ids.includes('20'));
    assert.equal(result.spent,2);assert.deepEqual(result.hand,['26','30']);assert.equal(result.morale,68);
    assert.equal(result.handChecks,2);assert.equal(result.paidPrice,'Pay 69 Morale');
    assert(result.events.every(e=>!e.cardId&&!e.cardIid));
    assert.deepEqual(errors,[]);
    console.log('Support Company browser passed: two flag animations, revised shield and action subtitles, mobile layout, live panel states, private picker, payment, duplicate prevention.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

