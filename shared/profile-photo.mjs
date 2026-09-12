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
    if(src&&src!=='blank.png'){
      const crop=profile.profileImg&&typeof profile.profileImg==='object'?profile.profileImg:{};
      const x=profile.profileCropFocusX??crop.cropFocusX,y=profile.profileCropFocusY??crop.cropFocusY,z=profile.profileCropZoom??crop.cropZoom;
      if(/^data:/i.test(src)||[x,y,z].every(v=>v==null))return src;
      const bound=(v,d,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v??d))?Number(v??d):d));
      const clean=src.replace(/([?&])fc=[^&#]*&?/g,'$1').replace(/[?&]$/,'');
      return clean+(clean.includes('?')?'&':'?')+'fc='+[Math.round(bound(x,.5,0,1)*1000),Math.round(bound(y,.5,0,1)*1000),Math.round(bound(z,1,1,4)*100)].join(',');
    }
  }
  return 'blank.png';
}
