// Never truncate an encoded image: a partial data URL cannot be displayed.
export function normalizeMultiplayerPhoto(value){
  if(typeof value!=='string')return '';
  const src=value.trim();
  const limit=/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(src)?512*1024:2048;
  return src.length<=limit&&src!=='[object Object]'?src:'';
}
export function resolveWarfrontPhoto(profile={},fallback=''){
  for(let value of [profile.profileImg,profile.photoURL,profile.photo,fallback]){
    if(value&&typeof value==='object')value=value.dataUrl||value.src||value.cardImg||(value.pfpId?'pfp/pfp'+(parseInt(value.pfpId,10)||1)+'.png':'');
    const src=normalizeMultiplayerPhoto(value);
    if(src&&src!=='blank.png')return src;
  }
  return 'blank.png';
}
