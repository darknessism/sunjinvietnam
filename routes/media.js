const express     = require('express');
const crypto      = require('crypto');
const multer      = require('multer');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Generic media store for admin-uploaded images that don't map to a fixed
// page "slot" — e.g. the per-project gallery photos, where each project has an
// arbitrary set of image URLs. An upload is stored as a binary blob in MySQL
// (Railway's filesystem is ephemeral, so disk is not durable) under a random
// id, and served back at a stable URL the editor saves like any other URL.
// ──────────────────────────────────────────────────────────────────────────
async function initMedia() {
    await pool.query(`CREATE TABLE IF NOT EXISTS media (
        id         VARCHAR(32)  NOT NULL PRIMARY KEY,
        mime       VARCHAR(80)  NOT NULL,
        data       LONGBLOB     NOT NULL,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
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

// ── Public: serve an uploaded image's binary ─────────────────────────────────
router.get('/raw/:id', async (req, res, next) => {
    try {
        const id = String(req.params.id || '');
        if (!/^[a-f0-9]{24}$/.test(id)) return res.status(404).end();
        const [[row]] = await pool.query('SELECT mime, data FROM media WHERE id = ?', [id]);
        if (!row) return res.status(404).end();
        res.set('Content-Type', row.mime);
        // Each id maps to immutable bytes, so it is safe to cache hard.
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(row.data);
    } catch (e) { next(e); }
});

// ── Admin: upload an image, get back a stable URL to store ───────────────────
router.post('/admin/upload', requireAuth, upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image file received.' });
        const id = crypto.randomBytes(12).toString('hex'); // 24 hex chars
        await pool.query(
            'INSERT INTO media (id, mime, data) VALUES (?, ?, ?)',
            [id, req.file.mimetype, req.file.buffer]
        );
        res.json({ ok: true, id, url: '/api/media/raw/' + id });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initMedia = initMedia;
