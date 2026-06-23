const express     = require('express');
const crypto      = require('crypto');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Staff / people shown on the About page. Two groups:
//   grp = 'board' → Ban lãnh đạo (Leadership)
//   grp = 'team'  → Đội ngũ (Team)
// Each person has a photo (URL, uploaded via the shared /api/media endpoint),
// a name and a position, both with optional English variants. `sort_order`
// controls display order within a group.
// ──────────────────────────────────────────────────────────────────────────
async function initStaff() {
    await pool.query(`CREATE TABLE IF NOT EXISTS staff (
        id          VARCHAR(40)  NOT NULL PRIMARY KEY,
        grp         VARCHAR(20)  NOT NULL,
        name        VARCHAR(255),
        name_en     VARCHAR(255),
        position    TEXT,
        position_en TEXT,
        photo       TEXT,
        sort_order  INT          NOT NULL DEFAULT 0,
        status      VARCHAR(20)  NOT NULL DEFAULT 'published',
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}

const GROUPS = new Set(['board', 'team']);

function toStaff(r) {
    return {
        id:         r.id,
        grp:        r.grp,
        name:       r.name || '',
        nameEn:     r.name_en || '',
        position:   r.position || '',
        positionEn: r.position_en || '',
        photo:      r.photo || '',
        order:      r.sort_order,
        status:     r.status,
    };
}

// ── Public: published staff, ordered for display ─────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM staff WHERE status = 'published' ORDER BY grp, sort_order, created_at"
        );
        res.set('Cache-Control', 'no-cache');
        res.json(rows.map(toStaff));
    } catch (e) { next(e); }
});

// ── Admin: full list (all statuses) ──────────────────────────────────────────
router.get('/admin/list', requireAuth, async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM staff ORDER BY grp, sort_order, created_at');
        res.json(rows.map(toStaff));
    } catch (e) { next(e); }
});

// ── Admin: create a person ───────────────────────────────────────────────────
router.post('/admin', requireAuth, async (req, res, next) => {
    try {
        const p = req.body || {};
        const grp = GROUPS.has(p.grp) ? p.grp : 'team';
        const id = 'staff-' + crypto.randomBytes(8).toString('hex');
        await pool.query(
            `INSERT INTO staff (id, grp, name, name_en, position, position_en, photo, sort_order, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, grp, p.name ?? '', p.nameEn ?? '', p.position ?? '', p.positionEn ?? '',
             p.photo ?? '', Number.isFinite(+p.order) ? +p.order : 0, p.status || 'published']
        );
        const [[row]] = await pool.query('SELECT * FROM staff WHERE id = ?', [id]);
        res.status(201).json(toStaff(row));
    } catch (e) { next(e); }
});

// ── Admin: update a person ───────────────────────────────────────────────────
router.put('/admin/:id', requireAuth, async (req, res, next) => {
    try {
        const p = req.body || {};
        const grp = GROUPS.has(p.grp) ? p.grp : 'team';
        await pool.query(
            `UPDATE staff SET grp=?, name=?, name_en=?, position=?, position_en=?, photo=?, sort_order=?, status=?
             WHERE id=?`,
            [grp, p.name ?? '', p.nameEn ?? '', p.position ?? '', p.positionEn ?? '',
             p.photo ?? '', Number.isFinite(+p.order) ? +p.order : 0, p.status || 'published', req.params.id]
        );
        const [[row]] = await pool.query('SELECT * FROM staff WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(toStaff(row));
    } catch (e) { next(e); }
});

// ── Admin: delete a person ───────────────────────────────────────────────────
router.delete('/admin/:id', requireAuth, async (req, res, next) => {
    try {
        await pool.query('DELETE FROM staff WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initStaff = initStaff;
