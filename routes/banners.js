const express     = require('express');
const multer      = require('multer');
const pool        = require('../db/connection');
const files       = require('../storage/files');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Manageable banner video clips on the public pages. Each slot maps to one
// <video> element (tagged with data-clip-slot="<slot>"). The `default` is the
// clip shipped in the HTML. Admins can override a slot in one of two ways:
//   1. paste a hosted video URL, or
//   2. upload a small video file (stored as a binary blob in MySQL, served
//      back via /api/banner-clips/raw/<slot>).
// The page loads the default, then swaps in any override.
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

const ver = d => (d ? new Date(d).getTime() : 0);
const rawUrl = (slot, updatedAt) => '/api/banner-clips/raw/' + slot + '?v=' + ver(updatedAt);

// Ensure the storage table exists and has the binary-upload columns.
async function initBanners() {
    await pool.query(`CREATE TABLE IF NOT EXISTS banner_clips (
        slot       VARCHAR(64)  NOT NULL PRIMARY KEY,
        page       VARCHAR(32)  NOT NULL,
        url        TEXT         NULL,
        mime       VARCHAR(80)  NULL,
        data       LONGBLOB     NULL,
        path       VARCHAR(255) NULL,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    // Migrate older installs (url was NOT NULL; mime/data/path columns absent).
    await ensureColumn('banner_clips', 'mime', 'ALTER TABLE banner_clips ADD COLUMN mime VARCHAR(80) NULL');
    await ensureColumn('banner_clips', 'data', 'ALTER TABLE banner_clips ADD COLUMN data LONGBLOB NULL');
    await ensureColumn('banner_clips', 'path', 'ALTER TABLE banner_clips ADD COLUMN path VARCHAR(255) NULL');
    await pool.query('ALTER TABLE banner_clips MODIFY url TEXT NULL').catch(() => {});
}

async function ensureColumn(table, col, alterSql) {
    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, col]
    );
    if (!row.c) await pool.query(alterSql);
}

// Uploaded clips are stored on the mounted Railway Volume (see storage/files.js).
// Very large videos are still better hosted on a CDN and referenced by URL.
const ALLOWED_MIME = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported video type. Use MP4, WEBM, OGG or MOV.'));
    },
});

// ── Public: map of overridden slots -> playable URL, so the page can swap clips ─
router.get('/overrides', async (req, res, next) => {
    try {
        const page = req.query.page;
        const [rows] = page
            ? await pool.query('SELECT slot, url, mime, updated_at FROM banner_clips WHERE page = ?', [page])
            : await pool.query('SELECT slot, url, mime, updated_at FROM banner_clips');
        const out = {};
        for (const r of rows) {
            if (!SLOT_MAP.has(r.slot)) continue;
            if (r.url) out[r.slot] = r.url;
            else if (r.mime) out[r.slot] = rawUrl(r.slot, r.updated_at);
        }
        res.set('Cache-Control', 'no-cache');
        res.json(out);
    } catch (e) { next(e); }
});

// ── Public: stream an uploaded clip's binary for a slot ──────────────────────
router.get('/raw/:slot', async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).end();
        const [[row]] = await pool.query('SELECT mime, path FROM banner_clips WHERE slot = ?', [req.params.slot]);
        if (!row || !row.mime) return res.status(404).end();
        // Safe to cache hard: the page requests this URL with a ?v=<updated_at>
        // cache-buster, so a new upload yields a new URL. Serving from disk also
        // gives real HTTP Range support, so seeking doesn't refetch the clip.
        if (row.path) return files.send(res, row.path, row.mime || 'video/mp4', next);
        // Not yet migrated to the volume — fall back to the legacy blob.
        const [[blob]] = await pool.query('SELECT data FROM banner_clips WHERE slot = ?', [req.params.slot]);
        if (!blob || !blob.data) return res.status(404).end();
        res.set('Content-Type', row.mime || 'video/mp4');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(blob.data);
    } catch (e) { next(e); }
});

// ── Admin: full list with current state for the management UI ────────────────
router.get('/admin/list', requireAuth, async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT slot, url, mime, updated_at FROM banner_clips');
        const overrides = new Map(rows.map(r => [r.slot, r]));
        const page = req.query.page;
        const list = SLOTS
            .filter(s => !page || s.page === page)
            .map(s => {
                const o = overrides.get(s.slot);
                const isUrl  = !!(o && o.url);
                const isFile = !!(o && !o.url && o.mime);
                return {
                    slot:        s.slot,
                    page:        s.page,
                    label:       s.label,
                    default:     s.default,
                    url:         isUrl ? o.url : '',
                    previewUrl:  isUrl ? o.url : (isFile ? rawUrl(s.slot, o.updated_at) : s.default),
                    kind:        isUrl ? 'url' : (isFile ? 'file' : ''),
                    hasOverride: !!o,
                };
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
        const [[prev]] = await pool.query('SELECT path FROM banner_clips WHERE slot = ?', [slot.slot]);
        if (!url) {
            await pool.query('DELETE FROM banner_clips WHERE slot = ?', [slot.slot]);
            if (prev && prev.path) files.remove(prev.path);
            return res.json({ ok: true, reset: true });
        }
        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: 'URL must start with http:// or https://' });
        }
        // Setting a URL clears any previously uploaded binary for the slot.
        await pool.query(
            `INSERT INTO banner_clips (slot, page, url, mime, data, path) VALUES (?, ?, ?, NULL, NULL, NULL)
             ON DUPLICATE KEY UPDATE url = VALUES(url), mime = NULL, data = NULL, path = NULL`,
            [slot.slot, slot.page, url]
        );
        if (prev && prev.path) files.remove(prev.path);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ── Admin: upload / replace the clip with a video file ───────────────────────
router.post('/admin/:slot/upload', requireAuth, upload.single('video'), async (req, res, next) => {
    try {
        const slot = SLOT_MAP.get(req.params.slot);
        if (!slot) return res.status(404).json({ error: 'Unknown banner slot.' });
        if (!req.file) return res.status(400).json({ error: 'No video file received.' });
        // Storing a file clears any previously set URL for the slot.
        const [[prev]] = await pool.query('SELECT path FROM banner_clips WHERE slot = ?', [slot.slot]);
        const rel = files.save('banner-clips', slot.slot, req.file.mimetype, req.file.buffer);
        await pool.query(
            `INSERT INTO banner_clips (slot, page, url, mime, data, path) VALUES (?, ?, NULL, ?, NULL, ?)
             ON DUPLICATE KEY UPDATE url = NULL, mime = VALUES(mime), data = NULL, path = VALUES(path)`,
            [slot.slot, slot.page, req.file.mimetype, rel]
        );
        if (prev && prev.path && prev.path !== rel) files.remove(prev.path);
        const [[row]] = await pool.query('SELECT updated_at FROM banner_clips WHERE slot = ?', [slot.slot]);
        res.json({ ok: true, slot: slot.slot, version: ver(row.updated_at) });
    } catch (e) { next(e); }
});

// ── Admin: remove the override, reverting to the default clip ────────────────
router.delete('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).json({ error: 'Unknown banner slot.' });
        const [[prev]] = await pool.query('SELECT path FROM banner_clips WHERE slot = ?', [req.params.slot]);
        await pool.query('DELETE FROM banner_clips WHERE slot = ?', [req.params.slot]);
        if (prev && prev.path) files.remove(prev.path);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initBanners = initBanners;
module.exports.SLOTS = SLOTS;
