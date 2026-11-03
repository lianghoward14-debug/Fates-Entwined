import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {serveGame} from './game-static.mjs';

process.env.FATE_WEBSITE_DIR = fileURLToPath(new URL('../../', import.meta.url));
for (const route of ['/tutorial', '/tutorial/']) {
  for (const method of ['GET', 'HEAD']) {
    let status, headers, body;
    const response = {
      writeHead(code, values) { status=code; headers=values; },
      end(value) { body=value; }
    };
    assert.equal(await serveGame({method}, response, route), true);
    assert.equal(status, 200);
    assert.match(headers['content-type'], /text\/html/);
    if(method==='GET') {
      assert.match(body, /<base href="\/">/);
      assert.match(body, /src\/scripts\/11-tutorial-course.js/);
      assert.equal(Number(headers['content-length']), Buffer.byteLength(body));
    } else assert.equal(body, undefined);
  }
}
for(const route of ['/tutorial/missing', '/.git/config', '/%2e%2e/package.json']) {
  assert.equal(await serveGame({method:'GET'}, {}, route), false);
}
assert.equal(await serveGame({method:'POST'}, {}, '/tutorial'), false);
console.log('Tutorial route: GET, HEAD, trailing slash, asset base and restricted paths passed.');
