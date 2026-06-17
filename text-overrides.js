/* Swap in admin-managed text overrides for elements tagged with data-tkey,
 * then re-apply the current language. Works with both the shared i18n.js
 * (home/about) and the inline language toggle on careers.html — both expose
 * window.applyLang and store translations on the same dataset properties. */
(function () {
    var p = location.pathname.toLowerCase();
    var page = p.indexOf('about') > -1 ? 'about'
             : p.indexOf('careers') > -1 ? 'careers'
             : 'home';

    fetch('/api/text-content/overrides?page=' + page)
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (map) {
            var applied = false;
            document.querySelectorAll('[data-tkey]').forEach(function (el) {
                var o = map[el.getAttribute('data-tkey')];
                if (!o) return;
                var hasVi = o.vi != null && o.vi !== '';
                var hasEn = o.en != null && o.en !== '';
                if (el.hasAttribute('data-en')) {
                    if (hasVi) el.dataset.vi = o.vi;
                    if (hasEn) el.dataset.en = o.en;
                } else if (el.hasAttribute('data-en-ph')) {
                    if (hasVi) el.dataset.viPh = o.vi;
                    if (hasEn) el.dataset.enPh = o.en;
                } else if (el.hasAttribute('data-en-html')) {
                    if (hasVi) el.dataset.viHtml = o.vi;
                    if (hasEn) el.dataset.enHtml = o.en;
                }
                applied = true;
            });
            if (applied && typeof window.applyLang === 'function') {
                window.applyLang(localStorage.getItem('sj_lang') || 'vi');
            }
        })
        .catch(function () {}); // page keeps its default text if the API is unavailable
})();
