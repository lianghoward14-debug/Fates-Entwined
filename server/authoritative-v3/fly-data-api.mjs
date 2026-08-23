import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FIREBASE_PROJECT_ID = String(process.env.FATE_FIREBASE_PROJECT_ID || 'fates-entwined-41491');
const DATA_DIR = path.resolve(process.env.FATE_FLY_DATA_API_DIR || path.join(process.cwd(), '.tmp', 'fate-authority'));
const SNAPSHOT_PATH = path.join(DATA_DIR, 'rooms.json');

function cleanId(value, max = 160){ return String(value || '').trim().slice(0, max); }
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function mapBy(list, key){ return new Map((Array.isArray(list) ? list : []).filter(Boolean).map(item=>[cleanId(item[key]), clone(item)]).filter(row=>row[0])); }
function objectFromSet(set){ return Object.fromEntries([...set].map(uid=>[uid, {uid, createdAt:Date.now()}])); }

export function createFlyDataApi({readBody, writeJson}){
  fs.mkdirSync(DATA_DIR, {recursive:true});
  let snapshot = {};
  try{ snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) || {}; }catch(error){
    if(error?.code !== 'ENOENT') console.warn('Fly data snapshot could not be read:', error.message);
  }
  const profiles = mapBy(snapshot.playerStats, 'uid');
  const aiRecords = mapBy(snapshot.aiRecords, 'aiId');
  const saves = mapBy(snapshot.playerSaves, 'uid');
  const decks = mapBy(snapshot.publicDecks, 'deckId');
  const listings = mapBy(snapshot.marketplaceListings, 'listingId');
  const friends = new Map((snapshot.friends || []).map(row=>[
    cleanId(row.uid,128),
    new Set((row.friends || []).map(value=>cleanId(value,128)).filter(Boolean))
  ]).filter(row=>row[0]));
  const requests = Array.isArray(snapshot.friendRequests) ? snapshot.friendRequests.map(clone) : [];
  const parties = mapBy(snapshot.parties, 'partyId');
  const partyInvites = Array.isArray(snapshot.partyInvites) ? snapshot.partyInvites.map(clone) : [];
  let worldChat = Array.isArray(snapshot.worldChat) ? snapshot.worldChat.map(clone) : [];
  let privateMessages = (Array.isArray(snapshot.privateMessages) ? snapshot.privateMessages : []).flatMap(row=>
    Array.isArray(row?.messages) ? row.messages.map(clone) : [clone(row)]
  ).filter(Boolean);
  let marketplaceTransactions = Array.isArray(snapshot.marketplaceTransactions)
    ? snapshot.marketplaceTransactions.map(clone)
    : [...listings.values()].filter(row=>row.status && row.status !== 'active').map(clone);
  let worldSeq = Number(snapshot.worldChatSeq || 0) || 0;
  let dmSeq = Number(snapshot.privateMessageSeq || 0) || 0;
  let saveTimer = null;
  const tokenCache = new Map();
  const presence = new Map();
  let certCache = {certs:null, expiresAt:0};

  function serialize(){
    return Object.assign({}, snapshot, {
      playerStats:[...profiles.values()], aiRecords:[...aiRecords.values()], playerSaves:[...saves.values()], publicDecks:[...decks.values()],
      marketplaceListings:[...listings.values()], marketplaceTransactions:marketplaceTransactions.slice(-500),
      friends:[...friends.entries()].map(([uid,set])=>({uid,friends:[...set]})), friendRequests:requests,
      parties:[...parties.values()], partyInvites, worldChatSeq:worldSeq, worldChat:worldChat.slice(-200),
      privateMessageSeq:dmSeq,
      privateMessages:[...privateMessages.slice(-1000).reduce((groups,message)=>{
        const key=[cleanId(message.fromUid,128),cleanId(message.toUid,128)].sort().join(':');
        if(!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(message);
        return groups;
      },new Map()).entries()].map(([conversationKey,messages])=>({conversationKey,messages}))
    });
  }
  function flush(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    const temp = SNAPSHOT_PATH + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(serialize()), 'utf8');
    fs.renameSync(temp, SNAPSHOT_PATH);
  }
  function persist(){ if(!saveTimer) saveTimer = setTimeout(()=>{ try{ flush(); }catch(error){ console.error('Fly data snapshot write failed:', error); } }, 80); }
  function profile(uid){
    const key = cleanId(uid, 128);
    const value = profiles.get(key) || {uid:key, displayName:'Player', chosenUsername:'Player', username:'Player', challengerElo:600, rank:'Footman'};
    return clone(value);
  }
  function mergeProfile(uid, incoming = {}){
    const key = cleanId(uid, 128);
    const current = profile(key);
    const cosmetic = ['baseCode','baseUsername','chosenUsername','displayName','username','usernameLower','photoURL','profileImg','level','bio','profileCropFocusX','profileCropFocusY','profileCropY','profileCropZoom','schemaVersion'];
    for(const field of cosmetic) if(incoming[field] !== undefined) current[field] = clone(incoming[field]);
    current.uid = key;
    current.challengerElo = Number(current.challengerElo ?? current.elo ?? 600) || 600;
    current.rank = current.rank || 'Footman';
    current.updatedAt = Date.now();
    profiles.set(key, current); persist(); return clone(current);
  }
  function authHeader(req){ return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); }
  function decodePart(value){
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    return Buffer.from(normalized+'='.repeat((4-normalized.length%4)%4),'base64');
  }
  async function firebaseCertificates(){
    if(certCache.certs && certCache.expiresAt>Date.now()+60000) return certCache.certs;
    const response=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if(!response.ok) throw Object.assign(new Error('account certificate fetch failed'),{status:503});
    const maxAge=Number((response.headers.get('cache-control')||'').match(/max-age=(\d+)/i)?.[1]||3600);
    certCache={certs:await response.json(),expiresAt:Date.now()+maxAge*1000};
    return certCache.certs;
  }
  async function verifyFirebaseToken(token){
    const parts=String(token||'').split('.');
    if(parts.length!==3) throw Object.assign(new Error('invalid account token'),{status:401});
    let header,payload;
    try{header=JSON.parse(decodePart(parts[0]).toString('utf8'));payload=JSON.parse(decodePart(parts[1]).toString('utf8'));}catch(_){throw Object.assign(new Error('invalid account token'),{status:401});}
    const cert=(await firebaseCertificates())[header?.kid];
    if(!cert) throw Object.assign(new Error('unknown account token key'),{status:401});
    const verifier=crypto.createVerify('RSA-SHA256');verifier.update(parts[0]+'.'+parts[1]);verifier.end();
    const now=Math.floor(Date.now()/1000);
    if(!verifier.verify(cert,decodePart(parts[2]))||payload.aud!==FIREBASE_PROJECT_ID||payload.iss!==`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`||!payload.sub||Number(payload.exp||0)<=now){
      throw Object.assign(new Error('invalid account token'),{status:401});
    }
    return cleanId(payload.sub,128);
  }
  async function verifiedUid(req){
    const token = authHeader(req);
    if(!token) throw Object.assign(new Error('sign-in required'), {status:401});
    const cached = tokenCache.get(token);
    if(cached && cached.expires > Date.now()){
      presence.set(cached.uid, Date.now());
      return cached.uid;
    }
    const uid = await verifyFirebaseToken(token);
    tokenCache.set(token, {uid, expires:Date.now()+300000});
    presence.set(uid, Date.now());
    return uid;
  }
  async function requireSelf(req, claimed){
    const uid = await verifiedUid(req);
    if(cleanId(claimed,128) && cleanId(claimed,128) !== uid) throw Object.assign(new Error('account mismatch'), {status:403});
    return uid;
  }
  function stateFor(uid){
    const ownFriends = friends.get(uid) || new Set();
    const incoming = requests.filter(item=>item.toUid === uid && item.status !== 'declined');
    const ownParty = [...parties.values()].find(item=>item?.members?.[uid]);
    const invites = partyInvites.filter(item=>item.toUid === uid);
    const online = [...presence.entries()].filter(([,at])=>Date.now()-at<60000).map(([onlineUid])=>onlineUid);
    const peerIds = new Set([uid, ...online, ...ownFriends, ...incoming.map(x=>x.fromUid), ...invites.map(x=>x.fromUid), ...Object.keys(ownParty?.members || {})]);
    const threadRows = privateMessages.filter(m=>m.fromUid === uid || m.toUid === uid);
    const threads = {};
    for(const message of threadRows){
      const peer = message.fromUid === uid ? message.toUid : message.fromUid;
      if(!threads[peer] || Number(threads[peer].timestamp || 0) < Number(message.timestamp || 0)) threads[peer] = {peerUid:peer,lastText:message.text,timestamp:message.timestamp,unread:0};
      peerIds.add(peer);
    }
    return {
      friends:objectFromSet(ownFriends), requests:Object.fromEntries(incoming.map(item=>[item.fromUid,item])), threads,
      onlineUids:online, partyInvites:Object.fromEntries(invites.map(item=>[item.fromUid,item])),
      profiles:Object.fromEntries([...peerIds].filter(Boolean).map(key=>[key,profile(key)])), party:ownParty ? clone(ownParty) : null
    };
  }
  function deckPublic(deck){
    const ratings = Array.isArray(deck.ratings) ? deck.ratings : [];
    return Object.assign({}, clone(deck), {id:deck.deckId, ratingCount:ratings.length, ratingAvg:ratings.length ? ratings.reduce((n,r)=>n+Number(r.stars||0),0)/ratings.length : 0, commentCount:(deck.comments||[]).length});
  }
  function routeParts(url){ return url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  async function handle(req, res, url){
    if(!url.pathname.startsWith('/api/')) return false;
    const p = routeParts(url);
    try{
      const profileMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if(profileMatch && req.method === 'GET'){
        await verifiedUid(req); writeJson(res,200,{ok:true,profile:profile(decodeURIComponent(profileMatch[1]))}); return true;
      }
      if(profileMatch && req.method === 'POST'){
        const body=await readBody(req), uid=await requireSelf(req,body.uid||decodeURIComponent(profileMatch[1]));
        writeJson(res,200,{ok:true,profile:mergeProfile(uid,body.profile||body)}); return true;
      }
      if(req.method==='GET' && url.pathname==='/api/leaderboards/challenger'){
        await verifiedUid(req); const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||100)));
        const leaderboard=[...profiles.values()].sort((a,b)=>Number(b.challengerElo||600)-Number(a.challengerElo||600)).slice(0,limit).map(clone);
        writeJson(res,200,{ok:true,leaderboard}); return true;
      }
      if(req.method==='POST' && url.pathname==='/api/challenger-results'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const current=profile(uid);
        const didWin=body.didWin===true,isDraw=body.isDraw===true,didLose=!isDraw&&!didWin;
        const oldElo=Math.max(0,Number(current.challengerElo??current.elo??600)||600),opponentElo=Math.max(0,Number(body.opponentElo)||1000);
        let delta=0;if(!isDraw){const expected=1/(1+Math.pow(10,(opponentElo-oldElo)/400));delta=Math.round((didWin?32:40)*((didWin?1:0)-expected));if(didWin&&delta<=0)delta=1;if(didLose&&delta>=0)delta=-1;}
        const newElo=Math.max(0,oldElo+delta);current.challengerElo=newElo;current.elo=newElo;
        current.challengerWins=Number(current.challengerWins??current.wins??0)+(didWin?1:0);current.challengerLosses=Number(current.challengerLosses??current.losses??0)+(didLose?1:0);
        current.wins=current.challengerWins;current.losses=current.challengerLosses;current.matchesPlayed=Number(current.matchesPlayed||0)+1;
        if(String(body.source||'client')!=='ai'){current.humanWins=Number(current.humanWins||0)+(didWin?1:0);current.humanLosses=Number(current.humanLosses||0)+(didLose?1:0);}
        current.updatedAt=Date.now();profiles.set(uid,current);persist();writeJson(res,200,{ok:true,profile:clone(current),result:{oldElo,newElo,delta,didWin,didLose,isDraw}});return true;
      }
      if(req.method==='POST' && p[1]==='challenger-ai' && ['seed','simulate'].includes(p[2])){
        const body=await readBody(req);await requireSelf(req,body.uid);
        if(p[2]==='seed') for(const incoming of (Array.isArray(body.roster)?body.roster:[])){
          const aiId=cleanId(incoming.aiId||incoming.id||incoming.name,128);if(!aiId)continue;
          aiRecords.set(aiId,Object.assign({},clone(incoming),aiRecords.get(aiId)||{},{aiId,monthKey:cleanId(body.monthKey,24),updatedAt:Date.now()}));
        }
        persist();writeJson(res,200,{ok:true,roster:[...aiRecords.values()].map(clone),matches:[]});return true;
      }
      if(req.method==='GET' && url.pathname==='/api/social/state'){
        const uid=await requireSelf(req,url.searchParams.get('uid'));writeJson(res,200,Object.assign({ok:true},stateFor(uid)));return true;
      }
      if(req.method==='GET' && url.pathname==='/api/social/lookup'){
        await verifiedUid(req);const term=cleanId(url.searchParams.get('term')).toLowerCase();
        const found=[...profiles.values()].filter(x=>[x.uid,x.baseCode,x.username,x.chosenUsername,x.displayName].some(v=>String(v||'').toLowerCase()===term)).slice(0,5).map(clone);
        writeJson(res,200,{ok:true,profiles:found});return true;
      }
      if(req.method==='POST' && p[1]==='friends'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid),action=p[2];
        if(action==='request'){ const toUid=cleanId(body.toUid,128); if(body.profile) mergeProfile(uid,body.profile); if(toUid&&!requests.some(x=>x.fromUid===uid&&x.toUid===toUid)) requests.push({fromUid:uid,toUid,status:'pending',createdAt:Date.now()}); }
        if(action==='accept'){ const from=cleanId(body.fromUid,128); if(!friends.has(uid))friends.set(uid,new Set());if(!friends.has(from))friends.set(from,new Set());friends.get(uid).add(from);friends.get(from).add(uid);for(let i=requests.length-1;i>=0;i--)if(requests[i].fromUid===from&&requests[i].toUid===uid)requests.splice(i,1); }
        if(action==='decline'){ for(let i=requests.length-1;i>=0;i--)if(requests[i].fromUid===cleanId(body.fromUid,128)&&requests[i].toUid===uid)requests.splice(i,1); }
        if(action==='remove'){ const peer=cleanId(body.friendUid,128);friends.get(uid)?.delete(peer);friends.get(peer)?.delete(uid); }
        persist();writeJson(res,200,{ok:true,state:stateFor(uid)});return true;
      }
      if(req.method==='POST' && p[1]==='parties'){
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        if(p.length===2){ const partyId='party_'+uid;const party={partyId,leaderUid:uid,members:{[uid]:{uid,status:'Leader',joinedAt:Date.now()}},createdAt:Date.now(),updatedAt:Date.now()};parties.set(partyId,party);persist();writeJson(res,200,{ok:true,party,state:stateFor(uid)});return true; }
        const partyId=cleanId(p[2]),action=p[3],party=parties.get(partyId);
        if(!party) throw Object.assign(new Error('party not found'),{status:404});
        if(action==='invite'){ const toUid=cleanId(body.toUid,128);partyInvites.push({partyId,fromUid:uid,toUid,status:'pending',createdAt:Date.now()}); }
        if(action==='accept'){ if(Object.keys(party.members||{}).length>=2&&!party.members[uid])throw new Error('party is full');party.members[uid]={uid,status:'Ready',joinedAt:Date.now()};for(let i=partyInvites.length-1;i>=0;i--)if(partyInvites[i].partyId===partyId&&partyInvites[i].toUid===uid)partyInvites.splice(i,1); }
        if(action==='decline'){ for(let i=partyInvites.length-1;i>=0;i--)if(partyInvites[i].partyId===partyId&&partyInvites[i].toUid===uid)partyInvites.splice(i,1); }
        if(action==='leave') parties.delete(partyId);
        party.updatedAt=Date.now();persist();writeJson(res,200,{ok:true,party:parties.get(partyId)||null,state:stateFor(uid)});return true;
      }
      if(p[1]==='world-chat'){
        if(req.method==='GET'){await verifiedUid(req);const after=Number(url.searchParams.get('after')||0),limit=Math.min(80,Number(url.searchParams.get('limit')||40));writeJson(res,200,{ok:true,messages:worldChat.filter(m=>Number(m.seq)>after).slice(-limit)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const pr=profile(uid);const message={id:'world_'+(++worldSeq),seq:worldSeq,uid,from:pr.chosenUsername||pr.displayName||pr.username||'Player',photoURL:pr.photoURL||pr.profileImg||null,text:cleanId(body.text,240),timestamp:Date.now()};worldChat.push(message);worldChat=worldChat.slice(-200);persist();writeJson(res,200,{ok:true,message,messages:[message]});return true;
      }
      if(p[1]==='direct-messages'&&p[2]){
        const peer=cleanId(p[2],128);if(req.method==='GET'){const uid=await requireSelf(req,url.searchParams.get('uid'));const after=Number(url.searchParams.get('after')||0),limit=Math.min(80,Number(url.searchParams.get('limit')||50));const rows=privateMessages.filter(m=>(m.fromUid===uid&&m.toUid===peer)||(m.fromUid===peer&&m.toUid===uid)).filter(m=>Number(m.seq)>after).slice(-limit);writeJson(res,200,{ok:true,messages:rows,peerProfile:profile(peer),state:stateFor(uid)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const message={id:'dm_'+(++dmSeq),seq:dmSeq,fromUid:uid,toUid:peer,text:cleanId(body.text,240),timestamp:Date.now()};privateMessages.push(message);privateMessages=privateMessages.slice(-1000);persist();writeJson(res,200,{ok:true,message,messages:[message],state:stateFor(uid)});return true;
      }
      if(p[1]==='player-save'&&p[2]){
        const target=cleanId(p[2],128);if(req.method==='GET'){await requireSelf(req,target);writeJson(res,200,{ok:true,save:clone(saves.get(target)||null),data:clone(saves.get(target)?.data||null)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid||target),existing=saves.get(uid)||{uid,data:{}};existing.data=Object.assign({},existing.data||{},clone(body.data||{}));existing.updatedAt=Date.now();saves.set(uid,existing);persist();writeJson(res,200,{ok:true,save:clone(existing),data:clone(existing.data)});return true;
      }
      if(p[1]==='public-decks'){
        // Public deck browsing is deliberately readable without an account.
        // Mutating routes below still verify Firebase identity and ownership.
        // Requiring a token here made the library and every deck preview fail
        // while Electron was still restoring the persisted Google session.
        if(req.method==='GET'&&!p[2]){const limit=Math.min(80,Number(url.searchParams.get('limit')||40));writeJson(res,200,{ok:true,decks:[...decks.values()].sort((a,b)=>Number(b.updatedAt||b.createdAt)-Number(a.updatedAt||a.createdAt)).slice(0,limit).map(deckPublic)});return true;}
        if(req.method==='POST'&&!p[2]){const body=await readBody(req),uid=await requireSelf(req,body.uid);if(body.profile)mergeProfile(uid,body.profile);const input=clone(body.deck||body),deckId=cleanId(input.deckId||input.id)||('deck_'+Date.now()+'_'+uid.slice(0,8));const deck=Object.assign({},decks.get(deckId)||{},input,{deckId,id:deckId,ownerUid:uid,uid,updatedAt:Date.now(),createdAt:decks.get(deckId)?.createdAt||Date.now()});decks.set(deckId,deck);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        const id=cleanId(p[2]),deck=decks.get(id);if(!deck)throw Object.assign(new Error('deck not found'),{status:404});
        if(req.method==='GET'){writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        if(p[3]==='delete'){if(cleanId(deck.ownerUid||deck.uid,128)!==uid)throw Object.assign(new Error('not deck owner'),{status:403});decks.delete(id);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        if(p[3]==='rating'){deck.ratings=(deck.ratings||[]).filter(r=>r.uid!==uid);deck.ratings.push({uid,username:cleanId(body.username,80),stars:Math.max(1,Math.min(5,Number(body.stars)||1)),createdAt:Date.now()});deck.updatedAt=Date.now();decks.set(id,deck);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck)});return true;}
        if(p[3]==='comments'){const comment={id:'comment_'+Date.now(),uid,username:cleanId(body.username,80),text:cleanId(body.text,240),createdAt:Date.now()};deck.comments=(deck.comments||[]).concat(comment).slice(-80);deck.updatedAt=Date.now();decks.set(id,deck);persist();writeJson(res,200,{ok:true,deck:deckPublic(deck),comment});return true;}
      }
      if(p[1]==='marketplace'){
        if(req.method==='GET'&&p[2]==='listings'){await verifiedUid(req);const active=[...listings.values()].filter(x=>x.status==='active').sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));writeJson(res,200,{ok:true,listings:active.map(clone),transactions:marketplaceTransactions.slice(-80).map(clone)});return true;}
        const body=await readBody(req),uid=await requireSelf(req,body.uid);
        if(req.method==='POST'&&p[2]==='listings'&&!p[3]){if(body.profile)mergeProfile(uid,body.profile);const pr=profile(uid),listingId='listing_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);const listing={listingId,type:body.type==='pfp'?'pfp':'card',cardId:cleanId(body.cardId),pfpId:Number(body.pfpId)||0,sellerUid:uid,seller:pr.chosenUsername||pr.displayName||'Player',sellerPhotoURL:pr.photoURL||pr.profileImg||null,price:Math.max(10,Number(body.price)||100),status:'active',createdAt:Date.now()};listings.set(listingId,listing);persist();writeJson(res,200,{ok:true,listing:clone(listing)});return true;}
        if(req.method==='POST'&&p[2]==='listings'&&p[3]){const listing=listings.get(cleanId(p[3]));if(!listing)throw Object.assign(new Error('listing not found'),{status:404});if(p[4]==='buy'){if(listing.sellerUid===uid)throw new Error('cannot buy own listing');listing.status='sold';listing.buyerUid=uid;listing.soldAt=Date.now();marketplaceTransactions.push(clone(listing));listings.set(listing.listingId,listing);}if(p[4]==='cancel'){if(listing.sellerUid!==uid)throw Object.assign(new Error('not listing owner'),{status:403});listing.status='cancelled';listings.set(listing.listingId,listing);}persist();writeJson(res,200,{ok:true,listing:clone(listing)});return true;}
        if(req.method==='POST'&&p[2]==='redeem'){const redeemed=marketplaceTransactions.filter(x=>x.sellerUid===uid&&x.status==='sold'&&!x.sellerRedeemed);for(const row of redeemed){row.sellerRedeemed=true;row.redeemedAt=Date.now();}persist();writeJson(res,200,{ok:true,redeemedStarlight:redeemed.reduce((n,x)=>n+Number(x.price||0),0),listings:clone(redeemed)});return true;}
      }
      return false;
    }catch(error){ writeJson(res,Number(error?.status)||400,{ok:false,error:String(error?.message||error)});return true; }
  }
  return {handle,flush,counts:()=>({profiles:profiles.size,saves:saves.size,decks:decks.size,listings:listings.size})};
}
