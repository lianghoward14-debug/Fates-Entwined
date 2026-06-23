#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function usage(){
  console.error([
    'Usage:',
    '  FATE_STATIC_HOTFIX_TOKEN=... node tools/publish-static-hotfix.js --url https://fates-entwined-main.fly.dev index.html src/scripts/18-online-rooms.js',
    '',
    'Options:',
    '  --url <origin>   Server origin. Defaults to FATE_STATIC_HOTFIX_URL or https://fates-entwined-main.fly.dev',
    '  --token <token> Token. Defaults to FATE_STATIC_HOTFIX_TOKEN'
  ].join('\n'));
}

function argValue(args, name){
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
}

function isOptionValue(args, value){
  const i = args.indexOf(value);
  return i > 0 && args[i - 1].startsWith('--');
}

function publicPathFor(filePath){
  const abs = path.resolve(ROOT, filePath);
  if(abs === ROOT || !abs.startsWith(ROOT + path.sep)) throw new Error(`Refusing file outside repo: ${filePath}`);
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  if(rel.startsWith('fates-entwined-website/')){
    const siteRel = rel.slice('fates-entwined-website'.length);
    return '/website' + (siteRel.startsWith('/') ? siteRel : '/' + siteRel);
  }
  return '/' + rel;
}

async function publishOne(origin, token, filePath){
  const abs = path.resolve(ROOT, filePath);
  const body = {
    token,
    path:publicPathFor(filePath),
    encoding:'base64',
    content:fs.readFileSync(abs).toString('base64')
  };
  const res = await fetch(origin.replace(/\/+$/, '') + '/api/static-overrides', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch(e){}
  if(!res.ok || json?.ok === false){
    throw new Error(`${filePath} failed ${res.status}: ${json?.error || text.slice(0, 200)}`);
  }
  console.log(`published ${body.path} (${json.written.bytes} bytes)`);
}

async function main(){
  const args = process.argv.slice(2);
  const origin = String(argValue(args, '--url') || process.env.FATE_STATIC_HOTFIX_URL || 'https://fates-entwined-main.fly.dev').trim();
  const token = String(argValue(args, '--token') || process.env.FATE_STATIC_HOTFIX_TOKEN || '').trim();
  const files = args.filter(arg=>!arg.startsWith('--') && !isOptionValue(args, arg));
  if(!origin || !token || !files.length){
    usage();
    process.exit(2);
  }
  for(const file of files){
    await publishOne(origin, token, file);
  }
}

main().catch(err=>{
  console.error(err.message || err);
  process.exit(1);
});
