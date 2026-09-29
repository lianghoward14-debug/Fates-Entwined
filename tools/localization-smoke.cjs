const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, '.tmp'), {recursive:true});
fs.writeFileSync(path.join(root, '.tmp', 'localization-test.html'), '<!doctype html><html lang="en"><body><button id="title-language-btn">日本語</button><span id="label">Free Play</span><input id="search" placeholder="Search names or card text..."><span class="tp-name" id="name">Normal</span><div id="nested">Your Hand <span>3</span></div></body></html>');
app.setPath('userData', path.join(root, '.tmp', 'localization-test-profile'));
app.whenReady().then(async () => {
 const win = new BrowserWindow({show:false, webPreferences:{contextIsolation:true, sandbox:true}});
 try {
  await win.loadFile(path.join(root, '.tmp', 'localization-test.html'));
  for (const file of ['53-japanese-content.js','53-japanese-catalog.js','53-japanese-lore.js','54-localization.js']) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/scripts',file),'utf8'));
  const result = await win.webContents.executeJavaScript(`(async () => {
   const check = (ok, message) => { if (!ok) throw new Error(message); };
   const tick = () => new Promise(resolve => setTimeout(resolve, 30));
   FateI18n.setLanguage('en');
   document.getElementById('title-language-btn').click();
   check(document.documentElement.lang === 'ja', 'language');
   check(document.getElementById('label').textContent === 'フリープレイ', 'title label');
   check(document.getElementById('search').placeholder === '名前やカードの説明を検索…', 'placeholder');
   check(document.getElementById('name').textContent === 'Normal', 'user name preserved');
   check(document.getElementById('nested').childElementCount === 1, 'nested markup preserved');
   const dynamic = document.createElement('div'); dynamic.textContent = 'End Turn'; document.body.append(dynamic); await tick();
   check(dynamic.textContent === 'ターン終了', 'dynamic insertion');
   dynamic.textContent = 'Turn 7/20'; await tick();
   check(dynamic.textContent === 'ターン 7/20', 'dynamic update');
   document.getElementById('title-language-btn').click();
   check(dynamic.textContent === 'Turn 7/20', 'latest English restored');
   check(document.getElementById('label').textContent === 'Free Play', 'English label restored');
   const lorePair = FateJapaneseLore.find(([source]) => source.length > 200);
   const article = document.createElement('article'); article.className = 'ch-lore-article';
   const paragraph = document.createElement('p'); paragraph.textContent = lorePair[0]; article.append(paragraph); document.body.append(article);
   FateI18n.setLanguage('ja'); await tick();
   check(paragraph.textContent === lorePair[1], 'lore paragraph translated');
   check(!/[\[【［]\s*\d{6}/.test(paragraph.textContent), 'lore has no batch markers');
   FateI18n.setLanguage('en');
   check(paragraph.textContent === lorePair[0], 'English lore restored');

   check(document.getElementById('search').placeholder === 'Search names or card text...', 'attribute restored');
   FateI18n.setLanguage('ja');
   check(localStorage.getItem('fate_language') === 'ja', 'preference saved');
   return 'PASS: title toggle, dynamic text, placeholders, original text restoration, user names, nested markup, saved preference';
  })()`);
  await win.reload();
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  for (const file of ['53-japanese-content.js','53-japanese-catalog.js','53-japanese-lore.js','54-localization.js']) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/scripts',file),'utf8'));
  const persisted = await win.webContents.executeJavaScript(`FateI18n.getLanguage() === 'ja' && document.getElementById('label').textContent === 'フリープレイ'`);
  if (!persisted) throw new Error('Reload persistence failed');
  fs.writeFileSync(path.join(root,'.tmp','localization-test-result.txt'), result + '\nPASS: preference restored after reload');
 } catch(error) { fs.writeFileSync(path.join(root,'.tmp','localization-test-result.txt'), 'FAIL: ' + error.stack); process.exitCode = 1; }
 app.quit();
});
