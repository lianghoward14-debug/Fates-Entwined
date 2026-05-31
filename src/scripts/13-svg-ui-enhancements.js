// Lightweight UI enhancement hooks.
// The old pass injected SVG corners/dividers into many dynamic panels, which
// made board rerenders noisier and heavier than they needed to be.
(function(){
  'use strict';

  function escAttr(value){
    return String(value).replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  function toDataUri(svg){
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function dividerDiamond(width){
    return '';
  }

  function dividerSwords(width){
    return '';
  }

  function corner(kind){
    return '';
  }

  function panelCorners(){
    return '';
  }

  const palettes = [
    ['#e8a050','#a06020','#3a2517'],
    ['#d8d8e8','#9090a0','#242735'],
    ['#7ec8ff','#4a8ad4','#183b6a'],
    ['#60f0d0','#1a9a80','#0f4b46'],
    ['#ff8080','#e74c3c','#5d1519'],
    ['#eab0ff','#8b55d4','#25133d']
  ];

  function profileIconSvg(seed, shape){
    const n = Math.max(1, parseInt(seed, 10) || 1);
    const p = palettes[(n - 1) % palettes.length];
    const hue = (n * 37) % 360;
    const isSquare = shape === 'square';
    const clip = isSquare
      ? '<rect x="8" y="8" width="80" height="80" rx="14"/>'
      : '<circle cx="48" cy="48" r="39"/>';
    const border = isSquare
      ? '<rect x="5" y="5" width="86" height="86" rx="16" fill="none" stroke="url(#pf-g)" stroke-width="4"/><rect x="11" y="11" width="74" height="74" rx="11" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.2"/>'
      : '<circle cx="48" cy="48" r="43" fill="none" stroke="url(#pf-g)" stroke-width="4"/><circle cx="48" cy="48" r="36" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/>';
    const sigil = [
      `<path d="M48 18L56 39L78 43L60 56L65 78L48 66L31 78L36 56L18 43L40 39Z" fill="${p[1]}" opacity=".22" stroke="${p[0]}" stroke-width="2"/>`,
      `<path d="M28 61C35 45 61 45 68 61M35 37C35 28 41 22 48 22C55 22 61 28 61 37" fill="none" stroke="${p[0]}" stroke-width="4" stroke-linecap="round"/>`,
      `<path d="M26 29L48 17L70 29V52C70 66 48 78 48 78C48 78 26 66 26 52Z" fill="rgba(0,0,0,.12)" stroke="${p[0]}" stroke-width="3"/>`
    ][n % 3];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
      <defs>
        <linearGradient id="pf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${p[0]}"/>
          <stop offset="55%" stop-color="${p[1]}"/>
          <stop offset="100%" stop-color="${p[2]}"/>
        </linearGradient>
        <radialGradient id="pf-bg" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stop-color="hsl(${hue},55%,22%)"/>
          <stop offset="100%" stop-color="#06080e"/>
        </radialGradient>
        <clipPath id="pf-clip">${clip}</clipPath>
      </defs>
      <g clip-path="url(#pf-clip)">
        <rect width="96" height="96" fill="url(#pf-bg)"/>
        <path d="M0 72C22 54 39 62 56 40C72 20 82 16 96 10V96H0Z" fill="${p[1]}" opacity=".16"/>
        <path d="M12 84L84 12M-5 48L48 -5M48 101L101 48" stroke="#fff6bf" stroke-opacity=".07" stroke-width="2"/>
        ${sigil}
      </g>
      ${border}
      <path d="M48 1L52 9L48 6L44 9Z" fill="${p[0]}" opacity=".85"/>
      <path d="M48 95L52 87L48 90L44 87Z" fill="${p[0]}" opacity=".65"/>
      <path d="M1 48L9 44L6 48L9 52Z" fill="${p[1]}" opacity=".65"/>
      <path d="M95 48L87 44L90 48L87 52Z" fill="${p[1]}" opacity=".65"/>
    </svg>`;
  }

  function profileIconDataUri(seed, shape){
    return toDataUri(profileIconSvg(seed, shape || 'circle'));
  }

  function decorate(root){
    const scope = root && root.querySelectorAll ? root : document;
    function each(selector, cb){
      if(scope.matches && scope.matches(selector)) cb(scope);
      scope.querySelectorAll(selector).forEach(cb);
    }
    each('.modal,.overlay-panel,.preset-card,.preset-browse-tile,.public-deck-card,.lb-entry,.social-side-panel,.social-dm-header,.ch-card,.starter-deck-card,.market-listing,.booster-tile,.ch-play-choice,.ch-play-section', function(el){
      if(!el.classList.contains('fate-framed')) el.classList.add('fate-framed');
    });
    each('.modal-title,.profile-section-title,.db-deck-header,.ch-title-text,.social-title-text,.win-title,.starter-intro h1,.social-section-header', function(el){
      if(!el.classList.contains('fate-divider-host')) el.classList.add('fate-divider-host');
    });
    each('.rank-badge,.level-badge,.effect-pill,.starlight-pill,.ch-packs-pill', function(el){
      el.classList.add('fate-badge-frame');
    });
  }

  function boot(){
    decorate(document);
  }

  window.FateSVG = {
    dividerDiamond,
    dividerSwords,
    corner,
    panelCorners,
    profileIconSvg,
    profileIconDataUri,
    decorate,
    escAttr
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
