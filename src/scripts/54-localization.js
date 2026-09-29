(function () {
  'use strict';
  const storageKey = 'fate_language';
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  const key = value => normalize(value).toLowerCase();
  const pairs = [...(window.FateJapaneseContent || []), ...Object.entries(window.FateJapaneseCatalog || {}), ...(window.FateJapaneseLore || [])];
  const catalog = new Map(pairs.filter(([en]) => !/ZXQ\d+QXZ/.test(en)).map(([en, ja]) => [key(en), ja]));
  const reverse = new Map(pairs.filter(([en]) => !/ZXQ\d+QXZ/.test(en)).map(([en, ja]) => [key(ja), en]));
  const cache = new Map();
  const originals = new WeakMap();
  const attributes = new WeakMap();
  const missing = new Set();
  const escaped = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const templates = pairs.filter(([en]) => /ZXQ\d+QXZ/.test(en)).map(([en, ja]) => {
    const ids = [];
    const chunks = normalize(en).split(/(ZXQ\d+QXZ)/g);
    const literal = chunks.filter(s => !/^ZXQ\d+QXZ$/.test(s)).join('');
    const pattern = chunks.map(s => {
      if (/^ZXQ\d+QXZ$/.test(s)) { ids.push(s); return '(.+?)'; }
      return escaped(s);
    }).join('');
    return { regex:new RegExp('^' + pattern + '$', 'i'), ids, ja, weight:literal.length };
  }).filter(t => t.weight >= 5).sort((a, b) => b.weight - a.weight);
  const protectedSelector = '[translate="no"],[data-no-translate],[contenteditable],#title-language-btn,.tp-name,.pb-name,.profile-name,.social-friend-name,.social-online-card-name,.social-dm-name,.social-dm-text,.social-dm-header-name,.ingame-chat-name,.wc-msg-text,.wc-msg-name,.party-member-copy > strong,.social-online-info > div:first-child,.card-flavor,.card-info-flavor,#s-campaign-intro';
  const excluded = 'script,style,textarea,input,' + protectedSelector;
  const attributeNames = ['title', 'aria-label', 'placeholder', 'alt'];
  let language = 'en';
  try { language = localStorage.getItem(storageKey) === 'ja' ? 'ja' : 'en'; } catch (_) {}
  function translatedCore(core, depth) {
    const direct = catalog.get(key(core));
    if (direct) return direct;
    if (depth < 2) {
      // Wrappers are presentation punctuation, not part of authored dialogue.
      const quote = core.match(/^([“"‘'])([\s\S]+)([”"’'])$/);
      if (quote) { const middle = translatedCore(quote[2], depth + 1); if (middle) return '「' + middle + '」'; }
      for (const t of templates) {
        const match = normalize(core).match(t.regex);
        if (!match) continue;
        const values = new Map(t.ids.map((id, i) => [id, catalog.get(key(match[i + 1])) || match[i + 1]]));
        return t.ja.replace(/ZXQ\d+QXZ/g, id => values.get(id) || id);
      }
      const suffix = core.match(/^(.+?)(\s*[:：]|\s*\(\d+\)|\s*[.!…])$/);
      if (suffix) { const label = catalog.get(key(suffix[1])); if (label) return label + suffix[2].replace(':', '：'); }
      // Joined AI dialogue and multi-paragraph effect descriptions.
      const sentences = core.split(/(?<=[.!?])\s+|\n+/);
      if (sentences.length > 1) {
        const translated = sentences.map(s => translatedCore(s, depth + 1) || s);
        if (translated.some((s, i) => s !== sentences[i])) return translated.join('\n');
      }
    }
    return null;
  }
  function translate(value) {
    const source = String(value == null ? '' : value);
    if (language !== 'ja' || !/[a-z]/i.test(source)) return source;
    if (cache.has(source)) return cache.get(source);
    const core = source.trim();
    let result = translatedCore(core, 0);
    if (!result) {
      const patterns = [
        [/^Turn (\d+)(\/\d+)?$/i, (_, n, total) => 'ターン ' + n + (total || '')],
        [/^(?:Zone|Realm|Front) ([IVX\d]+)$/i, (_, n) => 'ゾーン ' + n],
        [/^Player (\d+) Wins!$/i, (_, n) => 'プレイヤー' + n + 'の勝利！'],
        [/^Pass to Player (\d+)$/i, (_, n) => 'プレイヤー' + n + 'に交代'],
        [/^P(\d+) Deck$/i, (_, n) => 'プレイヤー' + n + 'のデッキ'],
        [/^(\d+)\s*\/\s*(\d+) cards$/i, (_, n, max) => n + ' / ' + max + ' 枚'],
        [/^Controls (\d+) of (\d+) Zones$/i, (_, n, total) => total + 'ゾーン中' + n + 'ゾーンを支配'],
        [/^Version (.+)$/i, (_, version) => 'バージョン ' + version]
      ];
      for (const [pattern, replacement] of patterns) if (pattern.test(core)) { result = core.replace(pattern, replacement); break; }
    }
    if (!result && missing.size < 2000 && /[a-z]{3}/i.test(core)) missing.add(core);
    const rendered = result ? source.slice(0, source.indexOf(core)) + result + source.slice(source.indexOf(core) + core.length) : source;
    if (cache.size > 6000) cache.clear();
    cache.set(source, rendered);
    return rendered;
  }
  function sourceText(node) {
    if (!node) return '';
    if (node.nodeType === 3) { const p = originals.get(node); return p && p.rendered === node.nodeValue ? p.source : (reverse.get(key(node.nodeValue)) || node.nodeValue); }
    return Array.from(node.childNodes || [], sourceText).join('');
  }
  function updateText(node) {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    const prior = originals.get(node);
    const source = prior && node.nodeValue === prior.rendered ? prior.source : (language === 'en' ? reverse.get(key(node.nodeValue)) || node.nodeValue : node.nodeValue);
    const rendered = translate(source);
    if (rendered !== node.nodeValue) node.nodeValue = rendered;
    if (rendered !== source) originals.set(node, { source, rendered });
    else originals.delete(node);
  }
  function updateAttributes(el) {
    if (el.closest('script,style,' + protectedSelector)) return;
    const prior = attributes.get(el) || {};
    for (const name of attributeNames) {
      if (!el.hasAttribute(name)) { delete prior[name]; continue; }
      const current = el.getAttribute(name);
      const source = prior[name] && current === prior[name].rendered ? prior[name].source : current;
      const rendered = translate(source);
      if (rendered !== current) el.setAttribute(name, rendered);
      if (rendered !== source) prior[name] = { source, rendered }; else delete prior[name];
    }
    attributes.set(el, prior);
  }
  function visit(root) {
    if (root.nodeType === 3) { updateText(root); return; }
    if (root.nodeType !== 1 || root.closest('script,style,' + protectedSelector)) return;
    updateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) { return node.nodeType === 1 && node.matches('script,style,' + protectedSelector) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === 3) updateText(walker.currentNode); else updateAttributes(walker.currentNode);
    }
  }
  const observer = new MutationObserver(records => {
    if (language !== 'ja') return;
    observer.disconnect();
    try {
      const roots = new Set();
      records.forEach(record => {
        if (record.type === 'childList') record.addedNodes.forEach(node => roots.add(node)); else roots.add(record.target);
      });
      roots.forEach(root => { if (root.isConnected && !Array.from(roots).some(other => other !== root && other.contains?.(root))) visit(root); });
    } finally { observe(); }
  });
  function observe() {
    if (language === 'ja') observer.observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributeNames });
  }
  // Translated headings can wrap differently. Fit the shared store column
  // from its physical viewport position rather than a fixed header allowance.
  let layoutFrame = 0;
  function fitStoreViewport() {
    layoutFrame = 0;
    const column = document.querySelector('#s-challenger .ch-store-market-column');
    if (!column || !column.getClientRects().length) return;
    if (!window.matchMedia('(min-width:1181px) and (min-height:720px)').matches) {
      column.style.removeProperty('height'); column.style.removeProperty('max-height'); return;
    }
    const rect = column.getBoundingClientRect();
    // CSS zoom affects both offsetWidth and client rectangles in Chromium.
    // Use the authored store scale, and never expand past the proven CSS budget.
    const scale = Number(getComputedStyle(column.closest('.ch-store-v3') || column).zoom) || 1;
    const height = Math.max(0, Math.min(
      (window.innerHeight - rect.top - 24) / scale,
      (window.innerHeight - 300 - Math.max(0, rect.top - 277) - (language === 'ja' ? 36 : 0)) / scale
    ));
    const value = height.toFixed(2) + 'px';
    if (column.style.height !== value) {
      column.style.setProperty('height', value, 'important');
      column.style.setProperty('max-height', value, 'important');
    }
  }
  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(fitStoreViewport);
  }
  window.addEventListener('resize', scheduleLayout);
  new MutationObserver(scheduleLayout).observe(document.body, {
    subtree:true, childList:true, characterData:true
  });
  document.fonts?.ready.then(scheduleLayout);
  function apply() {
    observer.disconnect(); cache.clear(); missing.clear();
    document.documentElement.lang = language;
    visit(document.body);
    const button = document.getElementById('title-language-btn');
    if (button) {
      button.textContent = language === 'ja' ? 'English' : '日本語'; button.lang = language === 'ja' ? 'en' : 'ja';
      button.setAttribute('aria-label', language === 'ja' ? 'Switch to English' : '日本語に切り替える');
      button.setAttribute('aria-pressed', String(language === 'ja'));
    }
    observe();
    window.FateCardTextureCache?.clear?.();
    window.FateMatchRendererAdapter?.resetBoardViewport?.('language-change');
    window.dispatchEvent(new CustomEvent('fate-language-change', { detail:{ language } }));
    window.dispatchEvent(new Event('resize'));
  }
  window.FateI18n = Object.freeze({
    t:translate, sourceText,
    getLanguage:() => language,
    report:() => ({language, messages:catalog.size, templates:templates.length, missing:Array.from(missing)}),
    setLanguage(next) { if (next !== 'en' && next !== 'ja') return; language = next; try { localStorage.setItem(storageKey, language); } catch (_) {} apply(); },
    toggle() { this.setLanguage(language === 'ja' ? 'en' : 'ja'); }
  });
  document.getElementById('title-language-btn')?.addEventListener('click', () => window.FateI18n.toggle());
  apply();
})();
