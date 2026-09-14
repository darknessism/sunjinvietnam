/* Lazy loader for the managed banner clips (home hero, home culture, about
 * perspectives).
 *
 * Every banner is a group of three <video data-clip-slot> elements that a
 * page script cycles by toggling a class (Tailwind `opacity-100` on the home
 * page, `active` on the About page). Before this file existed all three were
 * `autoplay` with a src, so a single home-page visit pulled every clip down at
 * once -- about 50 MB -- even for the two hidden ones and even for the culture
 * banner far below the fold. That was the bulk of the Railway egress bill.
 *
 * Now a clip only gets a src when:
 *   - its group has scrolled to within a screen of the viewport, and
 *   - it is the visible one, or the one the cycle will show next
 *     (fetched ahead so the crossfade never lands on a black frame).
 * Hidden clips are paused so they stop decoding as well.
 *
 * Usage:  <script src="banner-clips.js" data-page="home" defer></script>
 */
(function () {
    var me   = document.currentScript;
    var page = (me && me.dataset.page) || '';
    if (!page) return;

    function isVisible(v) {
        return v.classList.contains('opacity-100') || v.classList.contains('active');
    }
    function safePlay(v) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
    }
    function ensureLoaded(v) {
        if (!v.dataset.clipSrc || v.getAttribute('src')) return;
        v.src = v.dataset.clipSrc;
        v.load();
    }

    function wire(group) {
        var armed = false;                    // group is near the viewport

        function sync() {
            if (!armed) return;
            for (var i = 0; i < group.length; i++) {
                var v = group[i];
                if (isVisible(v)) {
                    ensureLoaded(v);
                    if (v.paused) safePlay(v);
                    ensureLoaded(group[(i + 1) % group.length]);   // one ahead
                } else if (!v.paused) {
                    v.pause();
                }
            }
        }

        // The cycling scripts only touch the class attribute; react to that.
        var mo = new MutationObserver(sync);
        group.forEach(function (v) {
            v.preload = 'none';
            v.removeAttribute('autoplay');          // play() is called explicitly
            mo.observe(v, { attributes: true, attributeFilter: ['class'] });
        });

        var arm = function () { armed = true; sync(); };
        if (!('IntersectionObserver' in window)) return arm();
        var io = new IntersectionObserver(function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); arm(); }
        }, { rootMargin: '100% 0px' });
        io.observe(group[0].parentElement || group[0]);
    }

    fetch('/api/banner-clips/overrides?page=' + encodeURIComponent(page))
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (map) {
            var groups = new Map();
            document.querySelectorAll('video[data-clip-slot]').forEach(function (v) {
                var url = map[v.dataset.clipSlot];
                if (!url) return;                       // no override: leave the default clip alone
                v.dataset.clipSrc = url;
                var key = v.parentElement || v;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(v);
            });
            groups.forEach(wire);
        })
        .catch(function () {});                         // page keeps its default clips if the API is unavailable
})();
