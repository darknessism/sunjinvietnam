const express     = require('express');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Manageable banner video clips on the public pages. Each slot maps to one
// <video> element (tagged with data-clip-slot="<slot>"). The `default` is the
// clip shipped in the HTML; admins can override it with a hosted video URL
// stored in MySQL. The page loads the default, then swaps in any override.
// Video files are large, so we store a URL reference rather than the binary.
// ──────────────────────────────────────────────────────────────────────────
const SLOTS = [
    // HOME — hero banner (cycling)
    { slot: 'home-hero-clip-1',    page: 'home',  label: 'Hero banner · Clip 1', default: 'https://videos.pexels.com/video-files/19798518/19798518-hd_1920_1080_30fps.mp4' },
    { slot: 'home-hero-clip-2',    page: 'home',  label: 'Hero banner · Clip 2', default: 'https://videos.pexels.com/video-files/6890371/6890371-hd_1920_1080_30fps.mp4' },
    { slot: 'home-hero-clip-3',    page: 'home',  label: 'Hero banner · Clip 3', default: 'https://videos.pexels.com/video-files/12248558/12248558-uhd_2560_1440_25fps.mp4' },
    // HOME — culture section banner (cycling)
    { slot: 'home-culture-clip-1', page: 'home',  label: 'Culture banner · Clip 1', default: 'https://videos.pexels.com/video-files/3121459/3121459-uhd_2560_1440_24fps.mp4' },
    { slot: 'home-culture-clip-2', page: 'home',  label: 'Culture banner · Clip 2', default: 'https://videos.pexels.com/video-files/3255275/3255275-uhd_2560_1440_25fps.mp4' },
    { slot: 'home-culture-clip-3', page: 'home',  label: 'Culture banner · Clip 3', default: 'https://videos.pexels.com/video-files/8189164/8189164-uhd_2560_1440_25fps.mp4' },
    // ABOUT — perspective banner (cycling)
    { slot: 'about-persp-clip-1',  page: 'about', label: 'Perspective banner · Clip 1', default: 'https://videos.pexels.com/video-files/31366924/13385366_2560_1440_50fps.mp4' },
    { slot: 'about-persp-clip-2',  page: 'about', label: 'Perspective banner · Clip 2', default: 'https://videos.pexels.com/video-files/32537471/13876144_2560_1440_24fps.mp4' },
    { slot: 'about-persp-clip-3',  page: 'about', label: 'Perspective banner · Clip 3', default: 'https://videos.pexels.com/video-files/15439673/15439673-uhd_2558_1440_30fps.mp4' },
];
const SLOT_MAP = new Map(SLOTS.map(s => [s.slot, s]));

// Ensure the storage table exists (runs once at startup).
async function initBanners() {
    await pool.query(`CREATE TABLE IF NOT EXISTS banner_clips (
        slot       VARCHAR(64)  NOT NULL PRIMARY KEY,
        page       VARCHAR(32)  NOT NULL,
        url        TEXT         NOT NULL,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
}

// ── Public: map of overridden slots -> URL, so the page can swap clips ───────
router.get('/overrides', async (req, res, next) => {
    try {
        const page = req.query.page;
        const [rows] = page
            ? await pool.query('SELECT slot, url FROM banner_clips WHERE page = ?', [page])
            : await pool.query('SELECT slot, url FROM banner_clips');
        const out = {};
        for (const r of rows) if (SLOT_MAP.has(r.slot)) out[r.slot] = r.url;
        res.set('Cache-Control', 'no-cache');
        res.json(out);
    } catch (e) { next(e); }
});

// ── Admin: full list with current state for the management UI ────────────────
router.get('/admin/list', requireAuth, async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT slot, url, updated_at FROM banner_clips');
        const overrides = new Map(rows.map(r => [r.slot, r]));
        const page = req.query.page;
        const list = SLOTS
            .filter(s => !page || s.page === page)
            .map(s => {
                const o = overrides.get(s.slot);
                return { slot: s.slot, page: s.page, label: s.label, default: s.default, url: o ? o.url : '', hasOverride: !!o };
            });
        res.json(list);
    } catch (e) { next(e); }
});

// ── Admin: set / replace the clip URL for a slot (empty url resets) ──────────
router.put('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        const slot = SLOT_MAP.get(req.params.slot);
        if (!slot) return res.status(404).json({ error: 'Unknown banner slot.' });
        const url = String((req.body && req.body.url) || '').trim();
        if (!url) {
            await pool.query('DELETE FROM banner_clips WHERE slot = ?', [slot.slot]);
            return res.json({ ok: true, reset: true });
        }
        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: 'URL must start with http:// or https://' });
        }
        await pool.query(
            `INSERT INTO banner_clips (slot, page, url) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE url = VALUES(url)`,
            [slot.slot, slot.page, url]
        );
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ── Admin: remove the override, reverting to the default clip ────────────────
router.delete('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).json({ error: 'Unknown banner slot.' });
        await pool.query('DELETE FROM banner_clips WHERE slot = ?', [req.params.slot]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initBanners = initBanners;
module.exports.SLOTS = SLOTS;
