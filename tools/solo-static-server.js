#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const portFlag = process.argv.indexOf('--port');
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT) || 8126;
const hostFlag = process.argv.indexOf('--host');
const host = String(hostFlag >= 0 ? process.argv[hostFlag + 1] : process.env.HOST || '127.0.0.1');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if(pathname === '/') pathname = '/index.html';
    const filePath = path.resolve(root, pathname.replace(/^\/+/, ''));
    if(!filePath.startsWith(root + path.sep) && filePath !== root) {
      send(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'Forbidden');
      return;
    }
    fs.stat(filePath, (statErr, stat) => {
      if(statErr || !stat.isFile()) {
        send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
        return;
      }
      const headers = {
        'content-type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        'pragma': 'no-cache',
        'expires': '0'
      };
      if(filePath.endsWith(path.join('tools', 'solo-multiplayer-client.html'))) {
        headers['clear-site-data'] = '"cache"';
      }
      if(req.method === 'HEAD') {
        send(res, 200, headers, '');
        return;
      }
      fs.createReadStream(filePath)
        .on('error', () => send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, 'Server error'))
        .pipe(res.writeHead(200, headers));
    });
  } catch (err) {
    send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, String(err && err.message || err));
  }
});

server.listen(port, host, () => {
  console.log(`Solo multiplayer server listening at http://${host}:${port}/`);
});
