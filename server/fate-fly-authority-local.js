#!/usr/bin/env node
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, '.fly-authority-data');

const defaults = {
  FATE_WS_HOST:'127.0.0.1',
  FATE_WS_PORT:'8787',
  FATE_WS_REQUIRE_TOKEN:'0',
  FATE_WS_DISABLE_FIREBASE_RTDB:'1',
  FATE_RTDB_DISABLED:'1',
  FATE_WS_DURABLE_WRITES:'off',
  FATE_WS_REQUIRE_DURABLE_WRITES:'0',
  FATE_WS_STATE_GATE:'1',
  FATE_WS_REDUCER_MODE:'strict',
  FATE_WS_FLY_STORE:'1',
  FATE_WS_REQUIRE_FLY_STORE:'1',
  FATE_WS_DATA_DIR:DATA_DIR
};

Object.entries(defaults).forEach(([key, value])=>{
  if(!process.env[key]) process.env[key] = value;
});

require('./fate-ws-authority');
