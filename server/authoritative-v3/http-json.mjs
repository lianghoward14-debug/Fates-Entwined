import {gzip} from 'node:zlib';

function acceptsGzip(header){
  const codings = String(header || '').toLowerCase().split(',').map(part=>{
    const [name, ...parameters] = part.trim().split(';');
    const quality = parameters.map(value=>value.trim()).find(value=>value.startsWith('q='));
    return {name:name.trim(), q:quality === undefined ? 1 : Number(quality.slice(2))};
  });
  const coding = codings.find(value=>value.name === 'gzip') || codings.find(value=>value.name === '*');
  return !!coding && Number.isFinite(coding.q) && coding.q > 0 && coding.q <= 1;
}

// HTTP clients decompress transparently. WebSocket messages remain unchanged.
export function endJsonResponse(res, status, json){
  const payload = Buffer.from(json);
  const vary = String(res.getHeader('vary') || '').split(',').map(value=>value.trim()).filter(Boolean);
  if(!vary.some(value=>value.toLowerCase() === 'accept-encoding' || value === '*')) vary.push('Accept-Encoding');
  res.setHeader('vary', vary.join(', '));
  const finish = (body, compressed = false)=>{
    if(res.destroyed || res.writableEnded) return;
    if(compressed) res.setHeader('content-encoding', 'gzip');
    res.writeHead(status, {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'content-length':body.length});
    res.end(body);
  };
  if(payload.length < 1024 || !acceptsGzip(res.req?.headers?.['accept-encoding'])){
    finish(payload);
    return;
  }
  gzip(payload, {level:1}, (error, compressed)=>{
    if(error || compressed.length >= payload.length) finish(payload);
    else finish(compressed, true);
  });
}
