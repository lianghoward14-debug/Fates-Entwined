const fs=require('fs');
function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
function rep(s,a,b){if(!s.includes(a))throw Error('Missing '+a);return s.replace(a,b);}
edit('server/authoritative-v3/fly-data-api.mjs',s=>{
 s=rep(s,'  const saves = mapBy(snapshot.playerSaves, \'uid\');',`  // Access is a global entitlement; player collections are never rewritten.
  let challengerAccess=snapshot.challengerAccess && typeof snapshot.challengerAccess.enabled==='boolean'
    ? {...snapshot.challengerAccess} : {enabled:true,revision:0};
  const challengerAccessAdmins=new Set(String(process.env.FATE_CHALLENGER_ACCESS_ADMIN_UIDS || 'nNbfvYwsoDfnvTHQhK4lwN5a2B22').split(',').map(value=>value.trim()).filter(Boolean));
  const saves = mapBy(snapshot.playerSaves, 'uid');`);
 s=rep(s,'      playerStats:[...profiles.values()]','      challengerAccess:clone(challengerAccess),\n      playerStats:[...profiles.values()]');
 s=rep(s,"      if(req.method==='GET' && p[1]==='warfront' && p[2]==='replays'){",`      if(p[1]==='challenger-access' && p.length===2){
        res.setHeader?.('Cache-Control','no-store');
        if(req.method==='GET'){writeJson(res,200,{ok:true,access:clone(challengerAccess)});return true;}
        if(req.method!=='POST'){writeJson(res,405,{ok:false,error:'Method not allowed'});return true;}
        const uid=await verifiedUid(req);
        if(!challengerAccessAdmins.has(uid)){writeJson(res,403,{ok:false,error:'Only the game owner can change Challenger free access.'});return true;}
        const body=await readBody(req);
        if(typeof body.enabled!=='boolean'||!Number.isInteger(body.expectedRevision)){writeJson(res,400,{ok:false,error:'Expected enabled and revision'});return true;}
        if(body.expectedRevision!==challengerAccess.revision){writeJson(res,409,{ok:false,error:'Challenger access changed. Run the command again.',access:clone(challengerAccess)});return true;}
        const previous=challengerAccess;
        challengerAccess={enabled:body.enabled,revision:previous.revision+1,updatedAt:Date.now()};
        try{flush();}catch(error){challengerAccess=previous;throw error;}
        writeJson(res,200,{ok:true,access:clone(challengerAccess)});return true;
      }
      if(req.method==='GET' && p[1]==='warfront' && p[2]==='replays'){
`);
 return s;
});
edit('src/scripts/03-profile-and-progression.js',s=>rep(s,"  if(cmd === '/logincheck'){",`  if(cmd === '/challengerfree'){
    if(window.FateChallengerAccess)window.FateChallengerAccess.toggle();
    else if(typeof toast==='function')toast('Challenger access controls are still loading.');
    return true;
  }
  if(cmd === '/logincheck'){`));
for(const file of ['src/scripts/09-challenger-mode.js','src/scripts/09-challenger-v2.js'])edit(file,s=>{
 const names=['getChTabStateSig','renderChCollectionTab','renderChDeckBuilderTab','renderCdbCollection','refreshCdbCollectionCounts','buildChallengerImportDeck','cdbAdd','getChallengerDeckBuilderAddBlockReason'];
 for(const name of names){
  const start=s.indexOf('function '+name+'(');if(start<0)continue;
  const end=s.indexOf('\n}',start)+2;
  const block=s.slice(start,end).replaceAll('USER_PROFILE.ownedCards || {}','(window.FateChallengerAccess?.collection() || USER_PROFILE.ownedCards || {})')
   .replaceAll('p.ownedCards || {}','(window.FateChallengerAccess?.collection() || p.ownedCards || {})')
   .replaceAll('USER_PROFILE.ownedCards[c.id]','(window.FateChallengerAccess?.collection() || USER_PROFILE.ownedCards || {})[c.id]')
   .replaceAll('USER_PROFILE.ownedCards[id]','(window.FateChallengerAccess?.collection() || USER_PROFILE.ownedCards || {})[id]')
   .replaceAll('USER_PROFILE.ownedCards?.[card.id]','(window.FateChallengerAccess?.collection() || USER_PROFILE.ownedCards || {})[card.id]');
  s=s.slice(0,start)+block+s.slice(end);
 }
 for(const marker of ['window.chPickDeckAndStart = function(pid){','window.chPickDeckAndStartMatchmaking = function(pid){','function chStartWithDeck(pid) {']){
  const start=s.indexOf(marker);if(start<0)continue;const end=s.indexOf('\n}',start);
  let block=s.slice(start,end);
  block=block.replace('G.p1Deck = [...preset.ids];',"if(CURRENT_MODE!=='free' && window.FateChallengerAccess && !window.FateChallengerAccess.requireDeck(preset.ids))return;\n  G.p1Deck = [...preset.ids];");
  s=s.slice(0,start)+block+s.slice(end);
 }
 s=s.replace('function cdbSaveDeck() {',"function cdbSaveDeck() {\n  if(window.FateChallengerAccess && !window.FateChallengerAccess.requireDeck(_cdbCurrentDeckIds))return;");
 return s;
});
edit('src/scripts/47-challenger-war-event.js',s=>rep(s,"return ids.length===40&&presets.some", "return (!window.FateChallengerAccess||window.FateChallengerAccess.allows(ids))&&ids.length===40&&presets.some"));
edit('index.html',s=>{
 s=rep(s,'<script src="src/scripts/09-challenger-mode.js', '<script src="src/scripts/54-challenger-free-access.js?v=20261024-challengerfree"></script>\n<script src="src/scripts/09-challenger-mode.js');
 return s.replace(/((?:03-profile-and-progression|09-challenger-mode|09-challenger-v2|47-challenger-war-event)\.js\?v=)[^"']+/g,'$120261024-challengerfree');
});
