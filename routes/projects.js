const express = require('express');
const pool    = require('../db/connection');
const router  = express.Router();

// Public: list published projects
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM projects WHERE status = "published" ORDER BY year DESC, created_at DESC'
        );
        res.json(rows.map(toProject));
    } catch (e) { next(e); }
});

// Public: single project + its detail
router.get('/:id', async (req, res, next) => {
    try {
        const [[proj]] = await pool.query(
            'SELECT * FROM projects WHERE id = ? AND status = "published"', [req.params.id]
        );
        if (!proj) return res.status(404).json({ error: 'Not found' });

        const [[detail]] = await pool.query(
            'SELECT * FROM project_details WHERE project_id = ?', [req.params.id]
        );
        res.json({ ...toProject(proj), detail: detail ? toDetail(detail) : null });
    } catch (e) { next(e); }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toProject(r) {
    return {
        id:          r.id,
        title:       r.title,
        category:    r.category,
        location:    r.location,
        year:        r.year,
        award:       r.award,
        architects:  r.architects,
        coverImage:  r.cover_image,
        status:      r.status,
        cols:        r.cols,
        createdAt:   r.created_at,
    };
}

function toDetail(r) {
    const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
    return {
        titlePlain:    r.title_plain,
        title:         r.title_display,
        category:      r.category_label,
        yearLoc:       r.year_loc,
        award:         r.award,
        images:        parse(r.images) || [],
        lead:          r.lead,
        photo1alt:     r.photo1_alt,
        photo1cap:     r.photo1_cap,
        photo2alt:     r.photo2_alt,
        photo2cap:     r.photo2_cap,
        photo3alt:     r.photo3_alt,
        photo3cap:     r.photo3_cap,
        narrative1:    parse(r.narrative1) || [],
        narrative2:    parse(r.narrative2) || [],
        highlights:    parse(r.highlights) || [],
        specs:         parse(r.specs) || [],
        credits:       parse(r.credits) || [],
        awards:        parse(r.awards_list) || [],
        next: r.next_id ? {
            id:    r.next_id,
            title: r.next_title,
            ty:    r.next_type,
            img:   r.next_img,
        } : null,
    };
}

module.exports = router;
