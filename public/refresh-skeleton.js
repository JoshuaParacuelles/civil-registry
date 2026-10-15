(function () {
  var FLAG = 'cr:hard-refresh';
  var ID = 'cr-refresh-skeleton';
  var STYLE_ID = 'cr-refresh-skeleton-style';
  var MIN_VISIBLE_MS = 500;
  var SAFETY_TIMEOUT_MS = 8000;
  var shownAt = 0;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + ID + '{position:fixed;inset:0;z-index:2147483647;display:flex;background:#f4f6fa;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}',
      '#' + ID + ' *{box-sizing:border-box;}',

      /* Sidebar (dark) */
      '#' + ID + ' .crs-side{width:313px;flex-shrink:0;background:#0b0d12;display:flex;flex-direction:column;}',
      '#' + ID + ' .crs-side-brand{height:108px;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid rgba(255,255,255,.07);}',
      '#' + ID + ' .crs-side-user{height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.07);}',
      '#' + ID + ' .crs-side-nav{padding:16px 15px;display:flex;flex-direction:column;gap:12px;}',
      '#' + ID + ' .crs-side-item{height:44px;border-radius:10px;}',
      '#' + ID + ' .crs-side-sub{display:flex;flex-direction:column;gap:14px;padding:6px 0 6px 40px;}',
      '#' + ID + ' .crs-side-sub div{height:12px;width:55%;}',
      '#' + ID + ' .crs-side-foot{margin-top:auto;height:72px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;padding:0 22px;}',

      /* Main area */
      '#' + ID + ' .crs-main{flex:1;min-width:0;display:flex;flex-direction:column;}',
      '#' + ID + ' .crs-top{height:80px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;padding:0 18px 0 14px;gap:12px;}',
      '#' + ID + ' .crs-top-left{display:flex;align-items:center;gap:12px;}',
      '#' + ID + ' .crs-top-right{display:flex;align-items:center;gap:10px;}',
      '#' + ID + ' .crs-body{flex:1;overflow:hidden;padding:24px 30px;display:flex;flex-direction:column;gap:16px;}',
      '#' + ID + ' .crs-live{align-self:flex-end;}',
      '#' + ID + ' .crs-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}',
      '#' + ID + ' .crs-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;}',
      '#' + ID + ' .crs-chart{flex:1;min-height:260px;}',

      /* Shimmer blocks */
      '#' + ID + ' .crs-block{border-radius:6px;background:linear-gradient(90deg,#e9edf3 25%,#f7f9fc 50%,#e9edf3 75%);background-size:200% 100%;animation:crs-shimmer 1.2s infinite linear;}',
      '#' + ID + ' .crs-dark{background:linear-gradient(90deg,rgba(255,255,255,.05) 25%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.05) 75%);background-size:200% 100%;animation:crs-shimmer 1.2s infinite linear;}',
      '@keyframes crs-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '@media (prefers-reduced-motion: reduce){#' + ID + ' .crs-block,#' + ID + ' .crs-dark{animation:none;}}',

      /* Responsive: sidebar hides under 768px, same as the app */
      '@media (max-width:767px){#' + ID + ' .crs-side{display:none;}#' + ID + ' .crs-top{padding-left:60px;}}',
      '@media (max-width:767px){#' + ID + ' .crs-grid3{grid-template-columns:1fr;}}',

      /* Fade out */
      '#' + ID + '.crs-out{opacity:0;transition:opacity .25s ease;}'
    ].join('');
    document.head.appendChild(s);
  }

  function bar(w, h, extra) {
    return '<div class="crs-block" style="width:' + w + ';height:' + h + ';' + (extra || '') + '"></div>';
  }
  function dark(w, h, extra) {
    return '<div class="crs-dark" style="width:' + w + ';height:' + h + ';' + (extra || '') + '"></div>';
  }

  function card() {
    return '<div class="crs-card">' +
      bar('40%', '14px') +
      bar('60%', '36px', 'margin-top:14px') +
      bar('70%', '10px', 'margin-top:14px') +
    '</div>';
  }

  function build() {
    var sidebar =
      '<aside class="crs-side">' +
        '<div class="crs-side-brand">' +
          dark('42px', '42px', 'border-radius:50%;flex-shrink:0;') +
          '<div style="display:flex;flex-direction:column;gap:8px;flex:1;">' +
            dark('150px', '14px') +
            dark('90px', '10px') +
          '</div>' +
        '</div>' +
        '<div class="crs-side-user">' +
          dark('70px', '14px') +
          dark('110px', '10px') +
        '</div>' +
        '<nav class="crs-side-nav">' +
          dark('100%', '44px', 'border-radius:10px;') +
          dark('100%', '44px', 'border-radius:10px;') +
          dark('100%', '44px', 'border-radius:10px;') +
          '<div class="crs-side-sub">' + dark('55%', '12px') + dark('55%', '12px') + '</div>' +
          dark('100%', '44px', 'border-radius:10px;') +
          dark('100%', '44px', 'border-radius:10px;') +
          dark('100%', '44px', 'border-radius:10px;') +
        '</nav>' +
        '<div class="crs-side-foot">' + dark('90px', '16px') + '</div>' +
      '</aside>';

    var topbar =
      '<header class="crs-top">' +
        '<div class="crs-top-left">' +
          bar('34px', '34px', 'border-radius:10px;') +
          bar('140px', '16px') +
        '</div>' +
        '<div class="crs-top-right">' +
          bar('150px', '34px', 'border-radius:10px;') +
          bar('34px', '34px', 'border-radius:10px;') +
          bar('34px', '34px', 'border-radius:10px;') +
        '</div>' +
      '</header>';

    var body =
      '<div class="crs-body">' +
        '<div class="crs-live">' + bar('110px', '14px') + '</div>' +
        '<div class="crs-card" style="height:190px">' +
          bar('120px', '12px') +
          bar('160px', '44px', 'margin-top:14px') +
          bar('200px', '10px', 'margin-top:14px') +
        '</div>' +
        '<div class="crs-grid3">' + card() + card() + card() + '</div>' +
        '<div class="crs-card crs-chart"><div class="crs-block" style="height:100%;"></div></div>' +
      '</div>';

    return sidebar + '<div class="crs-main">' + topbar + body + '</div>';
  }

  function show() {
    if (document.getElementById(ID)) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', show, { once: true });
      return;
    }
    ensureStyle();
    var el = document.createElement('div');
    el.id = ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('aria-label', 'Refreshing');
    el.innerHTML = build();
    document.body.appendChild(el);
    shownAt = Date.now();
  }

    function hide() {
    var el = document.getElementById(ID);
    if (!el) return;
    var wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
    setTimeout(function () {
      el.classList.add('crs-out');
      setTimeout(function () { el.remove(); }, 260);
    }, wait);
  }

  // Tapos nang mag-load ang app kapag nandiyan na ang topbar (Home),
  // o ang login/access-denied page. Hanggang doon, nananatili ang skeleton
  // para hindi lumabas ang LoadingScreen ng app.
  function appIsReady() {
    if (document.querySelector('.topbar')) return true;
    var path = location.pathname;
    var onPublicPage = path.indexOf('/login') === 0 || path.indexOf('/access-denied') === 0;
    var root = document.getElementById('root');
    return onPublicPage && !!root && root.children.length > 0;
  }

  function hideWhenAppReady() {
    var start = Date.now();
    var poll = setInterval(function () {
      if (appIsReady() || Date.now() - start > SAFETY_TIMEOUT_MS) {
        clearInterval(poll);
        hide();
      }
    }, 50);
  }

  // On a fresh load triggered by the Refresh button, show the skeleton immediately.
  try {
    if (sessionStorage.getItem(FLAG) === '1') {
      sessionStorage.removeItem(FLAG);
      show();
      hideWhenAppReady();
    }
  } catch (e) { /* sessionStorage unavailable: skip the skeleton */ }

  window.crRefreshSkeleton = { show: show, hide: hide };
})();