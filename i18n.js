/* Shared EN/VI language toggle for SUNJIN Vietnam public pages.
 *
 * Usage on a page:
 *   1. Mark translatable text:   <h2 data-en="English">Tiếng Việt</h2>
 *      - visible text = Vietnamese (default, no flash); English kept in data-en.
 *      - placeholders:            <input data-en-ph="English" placeholder="Tiếng Việt">
 *      - rich/child markup:       <p data-en-html="<b>English</b>">…Vietnamese…</p>
 *   2. Drop a toggle anywhere:   <span data-lang-toggle></span>
 *   3. Include this file:        <script src="i18n.js" defer></script>
 *
 * Pages with JS-rendered content can listen for the `langchange` event
 * (event.detail.lang) to re-render dynamic strings.
 */
(function () {
    const KEY = 'sj_lang';
    let LANG = localStorage.getItem(KEY) || 'vi';

    // Toggle styling — background-agnostic so it works over dark or light navs.
    const style = document.createElement('style');
    style.textContent = `
        .lang-toggle { display:inline-flex; align-items:center; gap:2px; font-family:'Open Sans',sans-serif; }
        .lang-toggle .lang-btn { background:none; border:none; color:inherit; cursor:pointer;
            font-size:11px; letter-spacing:0.14em; text-transform:uppercase; padding:4px 6px; line-height:1;
            opacity:0.5; transition:opacity .2s ease; }
        .lang-toggle .lang-btn:hover { opacity:0.85; }
        .lang-toggle .lang-btn.active { opacity:1; font-weight:700; text-decoration:underline; text-underline-offset:3px; }
        .lang-toggle .lang-sep { opacity:0.35; font-size:11px; }
    `;
    (document.head || document.documentElement).appendChild(style);

    function renderToggles() {
        document.querySelectorAll('[data-lang-toggle]').forEach(slot => {
            if (slot.dataset.built) return;
            slot.dataset.built = '1';
            slot.classList.add('lang-toggle');
            slot.innerHTML =
                '<button type="button" class="lang-btn interactive" data-lang-btn="vi" onclick="applyLang(\'vi\')">VI</button>'
                + '<span class="lang-sep">/</span>'
                + '<button type="button" class="lang-btn interactive" data-lang-btn="en" onclick="applyLang(\'en\')">EN</button>';
        });
    }

    function apply(lang) {
        LANG = (lang === 'en') ? 'en' : 'vi';
        localStorage.setItem(KEY, LANG);
        document.documentElement.lang = LANG;

        document.querySelectorAll('[data-en]').forEach(el => {
            if (el.dataset.vi === undefined) el.dataset.vi = el.textContent;
            el.textContent = (LANG === 'en') ? el.dataset.en : el.dataset.vi;
        });
        document.querySelectorAll('[data-en-html]').forEach(el => {
            if (el.dataset.viHtml === undefined) el.dataset.viHtml = el.innerHTML;
            el.innerHTML = (LANG === 'en') ? el.dataset.enHtml : el.dataset.viHtml;
        });
        document.querySelectorAll('[data-en-ph]').forEach(el => {
            if (el.dataset.viPh === undefined) el.dataset.viPh = el.getAttribute('placeholder') || '';
            el.setAttribute('placeholder', (LANG === 'en') ? el.dataset.enPh : el.dataset.viPh);
        });
        document.querySelectorAll('[data-lang-btn]').forEach(b =>
            b.classList.toggle('active', b.dataset.langBtn === LANG));

        document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: LANG } }));
    }

    window.applyLang = apply;
    window.getLang = () => LANG;

    function init() { renderToggles(); apply(LANG); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
