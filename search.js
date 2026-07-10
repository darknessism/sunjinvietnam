/* Site-wide search for SUNJIN Vietnam public pages.
 *
 * Injects a magnifier button into the fixed header (before the VI/EN toggle)
 * and a full-screen overlay that searches projects, blog articles and open
 * positions via the public APIs, plus the static pages. Bilingual: reads the
 * shared 'sj_lang' key so it works on pages with or without i18n.js.
 *
 * Include with:  <script src="search.js" defer></script>
 */
(function () {
    var lang = function () {
        try { return (window.getLang && window.getLang()) || localStorage.getItem('sj_lang') || 'vi'; }
        catch (e) { return 'vi'; }
    };
    var TXT = {
        vi: { ph: 'Tìm kiếm dự án, bài viết, tuyển dụng…', projects: 'Dự án', blog: 'Bài viết', careers: 'Tuyển dụng', pages: 'Trang', none: 'Không tìm thấy kết quả cho', hint: 'ESC để đóng', open: 'Tìm kiếm' },
        en: { ph: 'Search projects, articles, careers…', projects: 'Projects', blog: 'Articles', careers: 'Careers', pages: 'Pages', none: 'No results found for', hint: 'ESC to close', open: 'Search' },
    };
    var t = function (k) { return (TXT[lang()] || TXT.vi)[k]; };

    // Diacritic-insensitive normalize (also đ→d) for matching Vietnamese text.
    function norm(s) {
        return String(s || '').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd');
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    // Strip HTML tags from rich-text bodies so they can be text-searched.
    function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' '); }

    // ── Styles ────────────────────────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent =
        '#sj-search-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(10,10,10,0.97);display:none;flex-direction:column;font-family:"Open Sans",sans-serif;color:#fff;}'
      + '#sj-search-overlay.open{display:flex;}'
      + '#sj-search-overlay .sjs-head{display:flex;align-items:center;gap:16px;padding:26px 24px 18px;max-width:860px;width:100%;margin:0 auto;}'
      + '#sj-search-overlay .sjs-head svg{flex-shrink:0;opacity:.5;}'
      + '#sj-search-input{flex:1;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.22);color:#fff;font-size:clamp(18px,2.6vw,26px);font-weight:300;padding:10px 2px;outline:none;transition:border-color .25s ease;min-width:0;}'
      + '#sj-search-input:focus{border-bottom-color:rgba(255,255,255,.7);}'
      + '#sj-search-close{background:none;border:none;color:rgba(255,255,255,.55);cursor:pointer;padding:8px;transition:color .2s ease;}'
      + '#sj-search-close:hover{color:#fff;}'
      + '#sj-search-results{flex:1;overflow-y:auto;padding:8px 24px 60px;max-width:860px;width:100%;margin:0 auto;}'
      + '#sj-search-results .sjs-group{margin-top:26px;}'
      + '#sj-search-results .sjs-group-title{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,.38);margin:0 0 10px;}'
      + '#sj-search-results a.sjs-item{display:flex;align-items:center;gap:14px;padding:11px 10px;margin:0 -10px;border-radius:8px;text-decoration:none;color:#fff;transition:background .15s ease;}'
      + '#sj-search-results a.sjs-item:hover,#sj-search-results a.sjs-item.sel{background:rgba(255,255,255,.07);}'
      + '#sj-search-results .sjs-thumb{width:52px;height:38px;object-fit:cover;border-radius:4px;background:#1a1a1a;flex-shrink:0;}'
      + '#sj-search-results .sjs-body{min-width:0;}'
      + '#sj-search-results .sjs-title{font-size:15px;font-weight:300;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '#sj-search-results .sjs-meta{font-size:11px;color:rgba(255,255,255,.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '#sj-search-results .sjs-empty{color:rgba(255,255,255,.4);font-size:14px;margin-top:40px;text-align:center;}'
      + '#sj-search-overlay .sjs-hint{text-align:center;font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:rgba(255,255,255,.25);padding:14px;}'
      + '.sjs-nav-btn{background:none;border:none;color:inherit;cursor:pointer;padding:4px;display:inline-flex;align-items:center;opacity:.8;transition:opacity .2s ease;}'
      + '.sjs-nav-btn:hover{opacity:1;}';
    (document.head || document.documentElement).appendChild(style);

    // ── Overlay markup ────────────────────────────────────────────────────
    var overlay = document.createElement('div');
    overlay.id = 'sj-search-overlay';
    overlay.innerHTML =
        '<div class="sjs-head">'
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>'
      + '<input id="sj-search-input" type="text" autocomplete="off" spellcheck="false">'
      + '<button id="sj-search-close" type="button" aria-label="Close search"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>'
      + '</div>'
      + '<div id="sj-search-results"></div>'
      + '<div class="sjs-hint"></div>';

    function mountOverlay() { if (!overlay.parentNode) document.body.appendChild(overlay); }

    // ── Data (lazy-loaded once per page view) ─────────────────────────────
    var DATA = null, LOADING = null;
    function loadData() {
        if (DATA) return Promise.resolve(DATA);
        if (LOADING) return LOADING;
        var get = function (url) { return fetch(url).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); };
        LOADING = Promise.all([get('/api/projects'), get('/api/blog'), get('/api/careers'), get('/api/blog/search-index')]).then(function (res) {
            // Pre-normalize full article bodies once so typing stays fast.
            var bodyIdx = {};
            (res[3] || []).forEach(function (r) {
                bodyIdx[r.id] = norm((r.text || '') + ' ' + (r.textEn || ''));
            });
            DATA = { projects: res[0] || [], blog: res[1] || [], careers: res[2] || [], bodyIdx: bodyIdx };
            return DATA;
        });
        return LOADING;
    }

    // Static pages, searchable in both languages.
    var PAGES = [
        { vi: 'Trang chủ',  en: 'Home',      url: 'index.html',   kw: 'home trang chu' },
        { vi: 'Giới thiệu', en: 'About',     url: 'about.html',   kw: 'about gioi thieu cong ty company' },
        { vi: 'Dự án',      en: 'Projects',  url: 'project.html', kw: 'projects du an cong trinh' },
        { vi: 'Blog',       en: 'Blog',      url: 'blog.html',    kw: 'blog tin tuc news bai viet' },
        { vi: 'Tuyển dụng', en: 'Careers',   url: 'careers.html', kw: 'careers tuyen dung viec lam jobs' },
    ];

    // ── Search ────────────────────────────────────────────────────────────
    function searchAll(q, data) {
        var nq = norm(q);
        var hit = function (fields) {
            for (var i = 0; i < fields.length; i++) {
                if (fields[i] && norm(fields[i]).indexOf(nq) !== -1) return true;
            }
            return false;
        };
        var en = lang() === 'en';
        var pick = function (vi, e) { return (en && e && String(e).trim()) ? e : (vi || ''); };

        var projects = data.projects.filter(function (p) {
            return hit([p.title, p.titleEn, p.location, p.award, p.architects, String(p.year || '')]);
        }).map(function (p) {
            return { url: 'project-detail.html?id=' + encodeURIComponent(p.id), img: p.coverImage,
                     title: pick(p.title, p.titleEn), meta: [p.location, p.year].filter(Boolean).join(' · ') };
        });

        var blog = data.blog.filter(function (b) {
            return hit([b.title, b.titleEn, b.excerpt, b.excerptEn, b.author])
                || (data.bodyIdx[b.id] || '').indexOf(nq) !== -1;
        }).map(function (b) {
            return { url: 'blog-detail.html?id=' + encodeURIComponent(b.id), img: b.coverImage,
                     title: pick(b.title, b.titleEn), meta: [b.date, b.author].filter(Boolean).join(' · ') };
        });

        var careers = data.careers.filter(function (c) {
            return hit([c.title, c.titleEn, c.department, c.location, c.level,
                        stripTags(c.description), stripTags(c.descriptionEn)]);
        }).map(function (c) {
            return { url: 'careers-detail.html?id=' + encodeURIComponent(c.id), img: c.coverImage,
                     title: pick(c.title, c.titleEn), meta: [c.department, c.location].filter(Boolean).join(' · ') };
        });

        var pages = PAGES.filter(function (p) { return hit([p.vi, p.en, p.kw]); })
            .map(function (p) { return { url: p.url, img: null, title: en ? p.en : p.vi, meta: '' }; });

        return { projects: projects, blog: blog, careers: careers, pages: pages };
    }

    var MAX_PER_GROUP = 8;
    function renderResults(q) {
        var box = overlay.querySelector('#sj-search-results');
        if (!q.trim()) { box.innerHTML = ''; return; }
        loadData().then(function (data) {
            // Query may have changed while data loaded
            var cur = overlay.querySelector('#sj-search-input').value;
            if (cur !== q) return;
            var r = searchAll(q, data);
            var html = '';
            var group = function (label, items) {
                if (!items.length) return '';
                var g = '<div class="sjs-group"><p class="sjs-group-title">' + esc(label) + ' · ' + items.length + '</p>';
                items.slice(0, MAX_PER_GROUP).forEach(function (it) {
                    g += '<a class="sjs-item interactive" href="' + esc(it.url) + '">'
                       + (it.img ? '<img class="sjs-thumb" src="' + esc(it.img) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '')
                       + '<span class="sjs-body"><span class="sjs-title" style="display:block;">' + esc(it.title) + '</span>'
                       + (it.meta ? '<span class="sjs-meta" style="display:block;">' + esc(it.meta) + '</span>' : '')
                       + '</span></a>';
                });
                return g + '</div>';
            };
            html += group(t('projects'), r.projects);
            html += group(t('blog'), r.blog);
            html += group(t('careers'), r.careers);
            html += group(t('pages'), r.pages);
            if (!html) html = '<p class="sjs-empty">' + esc(t('none')) + ' “' + esc(q) + '”</p>';
            box.innerHTML = html;
        });
    }

    // ── Open / close ──────────────────────────────────────────────────────
    var prevOverflow = '';
    function openSearch() {
        mountOverlay();
        overlay.querySelector('#sj-search-input').setAttribute('placeholder', t('ph'));
        overlay.querySelector('.sjs-hint').textContent = t('hint');
        overlay.classList.add('open');
        prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        loadData();
        setTimeout(function () { overlay.querySelector('#sj-search-input').focus(); }, 40);
    }
    function closeSearch() {
        overlay.classList.remove('open');
        document.documentElement.style.overflow = prevOverflow;
        var inp = overlay.querySelector('#sj-search-input');
        inp.value = '';
        overlay.querySelector('#sj-search-results').innerHTML = '';
    }
    window.sjOpenSearch = openSearch;

    // Debounced input
    var debounce = null;
    function onOverlayReady() {
        var inp = overlay.querySelector('#sj-search-input');
        inp.addEventListener('input', function () {
            clearTimeout(debounce);
            var q = inp.value;
            debounce = setTimeout(function () { renderResults(q); }, 140);
        });
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var first = overlay.querySelector('#sj-search-results a.sjs-item');
                if (first) window.location.href = first.getAttribute('href');
            }
        });
        overlay.querySelector('#sj-search-close').addEventListener('click', closeSearch);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });
    }
    onOverlayReady();

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('open')) closeSearch();
    });

    // Keep placeholder/labels in sync when the language changes while open.
    document.addEventListener('langchange', function () {
        if (!overlay.classList.contains('open')) return;
        var inp = overlay.querySelector('#sj-search-input');
        inp.setAttribute('placeholder', t('ph'));
        overlay.querySelector('.sjs-hint').textContent = t('hint');
        renderResults(inp.value);
    });

    // ── Header button ─────────────────────────────────────────────────────
    function injectButton() {
        if (document.getElementById('sj-search-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'sj-search-btn';
        btn.type = 'button';
        btn.className = 'sjs-nav-btn interactive';
        btn.setAttribute('aria-label', t('open'));
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
        btn.addEventListener('click', openSearch);

        var anchor = document.querySelector('nav [data-lang-toggle]');
        if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(btn, anchor); return; }
        var menuBtn = document.getElementById('menu-btn');
        if (menuBtn && menuBtn.parentNode) { menuBtn.parentNode.insertBefore(btn, menuBtn); return; }
        var nav = document.querySelector('nav');
        if (nav) nav.appendChild(btn);
    }

    function init() { injectButton(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
