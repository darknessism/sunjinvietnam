const express = require('express');
const pool    = require('../db/connection');
const router  = express.Router();

// Public: list published careers
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM careers WHERE status = "published" ORDER BY created_at DESC'
        );
        res.json(rows.map(toCareer));
    } catch (e) { next(e); }
});

// Public: single career
router.get('/:id', async (req, res, next) => {
    try {
        const [[row]] = await pool.query(
            'SELECT * FROM careers WHERE id = ? AND status = "published"', [req.params.id]
        );
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(toCareer(row));
    } catch (e) { next(e); }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCareer(r) {
    const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
    return {
        id:           r.id,
        title:        r.title,
        department:   r.department,
        location:     r.location,
        level:        r.level,
        type:         r.type,
        salary:       r.salary,
        deadline:     r.deadline ? String(r.deadline).slice(0, 10) : null,
        coverImage:   r.cover_image,
        description:  r.description,
        requirements: r.requirements,
        benefits:     parse(r.benefits) || [],
        status:       r.status,
        createdAt:    r.created_at,
    };
}

module.exports = router;
