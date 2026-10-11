import fs from 'node:fs';
import path from 'node:path';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'};
export async function serveGame(req, res, pathname) {
  if (!process.env.FATE_WEBSITE_DIR || !['GET','HEAD'].includes(req.method)) return false;
  const root = path.resolve(process.env.FATE_WEBSITE_DIR);
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded.split('/').some(p => p.startsWith('.') || p === 'tutorialvideos')) return false;
  const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!file.startsWith(root + path.sep) || !types[path.extname(file).toLowerCase()]) return false;
  let stat;
  try { stat = await fs.promises.stat(file); } catch { return false; }
  if (!stat.isFile()) return false;
  let body;
  if (file === path.join(root, 'index.html')) {
    body = (await fs.promises.readFile(file, 'utf8')).replace(/<button\b[^>]*onclick="playMenuSfx\(\);startTutorial\(\)"[^>]*>Tutorial<\/button>/, '');
  }
  res.writeHead(200, {'content-type':types[path.extname(file).toLowerCase()], 'cache-control':'no-cache', 'content-length':body === undefined ? stat.size : Buffer.byteLength(body), 'x-content-type-options':'nosniff'});
  if (req.method === 'HEAD') res.end();
  else if (body !== undefined) res.end(body);
  else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}
