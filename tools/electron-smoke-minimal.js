'use strict';

const fs = require('fs');
const { app } = require('electron');

const out = process.env.FATE_ELECTRON_MINIMAL_OUT || '';
app.whenReady().then(()=>{
  if(out) fs.writeFileSync(out, 'ready', 'utf8');
  app.quit();
});
