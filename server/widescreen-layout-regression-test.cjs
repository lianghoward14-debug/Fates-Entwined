// Run with NODE_PATH pointing at a Playwright installation when not local.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    // Use the shipping markup and every shipping stylesheet, with game/network
    // startup excluded so this check never connects an account or starts a match.
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace('</head>', '<script defer src="/src/scripts/52-widescreen.js"></script></head>');
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fate.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
      return route.fulfill({ path: file });
    });
    await page.setViewportSize({ width: 3440, height: 1440 });
    await page.goto('http://fate.test/');
    await page.evaluate(() => document.getElementById('fate-loading-screen')?.remove());
    await page.locator('#widescreen-toggle-btn').click();
    assert.equal(await page.locator('#widescreen-toggle-btn').getAttribute('aria-pressed'), 'true');
    for (const [width, height] of [[3440,1440],[2560,1080],[1920,1080],[1280,720],[1080,1920]]) {
      await page.setViewportSize({ width, height });
      for (const id of ['s-title', 's-game']) {
        await page.evaluate(id => {
          document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === id));
        }, id);
        const box = await page.locator('#' + id).boundingBox();
        assert.ok(box, id + ' visible');
        assert.ok(Math.abs(box.width - width) < 2, JSON.stringify({id,width,height,box}));
        assert.ok(Math.abs(box.x - (width - box.width) / 2) < 2, 'centered ' + id);
        assert.ok(box.y >= -1 && box.y + box.height <= height + 1, 'vertical fit ' + id);
      }
    }
    await page.addScriptTag({ path: path.join(root, 'src/scripts/render-v2/02-match-layout-engine.js') });
    await page.evaluate(() => {
      const game = document.getElementById('s-game');
      game.classList.add('svg-board-v20-live', 'match-ui-v19-live');
      game.innerHTML = '<div id="fate-codex-ui-v19"><div class="codex-v19-field"><div id="codex-board-v19"></div></div><div class="codex-v19-footer"><div class="codex-v19-hand"></div></div></div>';
    });
    for (const [width, height] of [[3440,1440], [2560,1080], [5120,1440], [1920,1080]]) {
      await page.setViewportSize({ width, height });
      const measure = () => page.evaluate(() => {
        const snapshot = { viewer:0, players:[], board:Array.from({length:3}, (_,z) => ({z, rows:Array.from({length:3}, (_,r) => ({r, cells:Array.from({length:4}, () => ({}))}))})) };
        const layout = FateMatchLayoutEngine.buildFromCurrent({snapshot});
        return { metrics:layout.metrics, hand:document.querySelector('.codex-v19-hand').getBoundingClientRect().width };
      });
      const on = await measure();
      await page.evaluate(() => FateWidescreen.toggle());
      const off = await measure();
      if (width / height > 16 / 9) {
        assert.ok(on.metrics.cardW > off.metrics.cardW, JSON.stringify({width,on,off}));
        assert.ok(on.hand > off.hand, 'extra space used by hand');
        assert.ok(on.metrics.cardH * 3 + 100 <= height - 310, 'cards fit available board height');
      } else assert.equal(on.metrics.cardW, off.metrics.cardW, 'standard cards unchanged');
      console.log(JSON.stringify({width,height,on,off}));
      await page.evaluate(() => FateWidescreen.toggle());
    }
    await page.reload();
    assert.equal(await page.evaluate(() => FateWidescreen.isEnabled()), true, 'saved across reload');
    await page.evaluate(() => FateWidescreen.toggle());
    assert.equal(await page.evaluate(() => localStorage.getItem('fate_widescreen_mode')), '0');
    await page.setViewportSize({ width: 3440, height: 1440 });
    assert.equal(Math.round((await page.locator('#s-title').boundingBox()).width), 3440, 'off restores full width');
    console.log('PASS: title and game screen bounds at five resolutions, toggle, persistence, and restoration.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
