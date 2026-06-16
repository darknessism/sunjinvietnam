const express     = require('express');
const multer      = require('multer');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Manageable photo "slots" on the public pages. Each slot maps to one <img>
// on the page (tagged with data-img-slot="<slot>"). The `default` is the
// hardcoded image shipped in the HTML; admins can override it with an upload
// that is stored in MySQL (Railway's filesystem is ephemeral, so disk is not
// durable). The page loads the default, then swaps in any override.
// ──────────────────────────────────────────────────────────────────────────
const SLOTS = [
    { slot: 'careers-hero',        page: 'careers', label: 'Hero — ảnh nền đầu trang',           default: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2000&q=80' },
    { slot: 'careers-banner',      page: 'careers', label: 'Banner đội ngũ (giữa trang)',        default: 'images/teamwork.jpg' },
    { slot: 'careers-a1',          page: 'careers', label: 'Vì sao chọn · Dự án giàu ảnh hưởng',     default: '/images/sipaphin.jpg' },
    { slot: 'careers-a3',          page: 'careers', label: 'Vì sao chọn · Lộ trình thăng tiến rõ ràng', default: 'https://images.pexels.com/photos/380768/pexels-photo-380768.jpeg?auto=compress&cs=tinysrgb&w=900' },
    { slot: 'careers-a4',          page: 'careers', label: 'Vì sao chọn · Học hỏi không ngừng',     default: 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=900' },
    { slot: 'careers-a5',          page: 'careers', label: 'Vì sao chọn · Phúc lợi minh bạch',      default: 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=900' },
    { slot: 'careers-a6',          page: 'careers', label: 'Vì sao chọn · Bản sắc Việt Nam',        default: '/images/sanbayphanthiet.jpg' },
    { slot: 'careers-pf-planning', page: 'careers', label: 'Danh mục 01 · Quy hoạch',            default: '/images/quyhoach.jpg' },
    { slot: 'careers-pf-resi',     page: 'careers', label: 'Danh mục 02 · Khu dân cư / Nhà ở',   default: '/images/nhao.jpg' },
    { slot: 'careers-pf-school',   page: 'careers', label: 'Danh mục 03 · Trường học',           default: '/images/truonghoc.jpg' },
    { slot: 'careers-pf-hotel',    page: 'careers', label: 'Danh mục 04 · Khách sạn',            default: '/images/khachsan.jpg' },
    { slot: 'careers-pf-hq',       page: 'careers', label: 'Danh mục 05 · Trụ sở',              default: '/images/truso.jpg' },
    { slot: 'careers-culture-1',   page: 'careers', label: 'Dải văn hóa · Trái (Văn hóa studio)', default: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=900&q=80' },
    { slot: 'careers-culture-2',   page: 'careers', label: 'Dải văn hóa · Giữa (Hợp tác)',        default: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=900&q=80' },
    { slot: 'careers-culture-3',   page: 'careers', label: 'Dải văn hóa · Phải (Công việc)',      default: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=900&q=80' },
];
const SLOT_MAP = new Map(SLOTS.map(s => [s.slot, s]));

// Ensure the storage table exists (runs once at startup).
async function initPageImages() {
    await pool.query(`CREATE TABLE IF NOT EXISTS page_images (
        slot       VARCHAR(64)  NOT NULL PRIMARY KEY,
        page       VARCHAR(32)  NOT NULL,
        mime       VARCHAR(80)  NOT NULL,
        data       LONGBLOB     NOT NULL,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported file type. Use JPG, PNG, WEBP, GIF or AVIF.'));
    },
});

const ver = d => (d ? new Date(d).getTime() : 0);

// ── Public: version map of overridden slots, so the page knows what to swap ──
// e.g. { "careers-hero": 1718500000000, ... }
router.get('/overrides', async (req, res, next) => {
    try {
        const page = req.query.page;
        const [rows] = page
            ? await pool.query('SELECT slot, updated_at FROM page_images WHERE page = ?', [page])
            : await pool.query('SELECT slot, updated_at FROM page_images');
        const out = {};
        for (const r of rows) if (SLOT_MAP.has(r.slot)) out[r.slot] = ver(r.updated_at);
        res.set('Cache-Control', 'no-cache');
        res.json(out);
    } catch (e) { next(e); }
});

// ── Public: serve the overriding image binary for a slot ─────────────────────
router.get('/raw/:slot', async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).end();
        const [[row]] = await pool.query('SELECT mime, data FROM page_images WHERE slot = ?', [req.params.slot]);
        if (!row) return res.status(404).end();
        res.set('Content-Type', row.mime);
        // Safe to cache hard: the page requests this URL with a ?v=<updated_at>
        // cache-buster, so a new upload yields a new URL.
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(row.data);
    } catch (e) { next(e); }
});

// ── Admin: full list with current state for the management UI ────────────────
router.get('/admin/list', requireAuth, async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT slot, mime, updated_at FROM page_images');
        const overrides = new Map(rows.map(r => [r.slot, r]));
        const page = req.query.page;
        const list = SLOTS
            .filter(s => !page || s.page === page)
            .map(s => {
                const o = overrides.get(s.slot);
                return {
                    slot:        s.slot,
                    page:        s.page,
                    label:       s.label,
                    default:     s.default,
                    hasOverride: !!o,
                    version:     o ? ver(o.updated_at) : 0,
                };
            });
        res.json(list);
    } catch (e) { next(e); }
});

// ── Admin: upload / replace the image for a slot ─────────────────────────────
router.post('/admin/:slot', requireAuth, upload.single('image'), async (req, res, next) => {
    try {
        const slot = SLOT_MAP.get(req.params.slot);
        if (!slot) return res.status(404).json({ error: 'Unknown image slot.' });
        if (!req.file) return res.status(400).json({ error: 'No image file received.' });
        await pool.query(
            `INSERT INTO page_images (slot, page, mime, data) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)`,
            [slot.slot, slot.page, req.file.mimetype, req.file.buffer]
        );
        const [[row]] = await pool.query('SELECT updated_at FROM page_images WHERE slot = ?', [slot.slot]);
        res.json({ ok: true, slot: slot.slot, version: ver(row.updated_at) });
    } catch (e) { next(e); }
});

// ── Admin: remove the override, reverting to the default image ───────────────
router.delete('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).json({ error: 'Unknown image slot.' });
        await pool.query('DELETE FROM page_images WHERE slot = ?', [req.params.slot]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initPageImages = initPageImages;
module.exports.SLOTS = SLOTS;
