// Never truncate an encoded image: a partial data URL cannot be displayed.
export function normalizeMultiplayerPhoto(value){
  if(typeof value!=='string')return '';
  const src=value.trim();
  const limit=/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(src)?512*1024:2048;
  return src.length<=limit&&src!=='[object Object]'?src:'';
}
