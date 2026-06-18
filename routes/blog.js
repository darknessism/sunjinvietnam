const express = require('express');
const pool    = require('../db/connection');
const router  = express.Router();

// Public: list published posts
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM blog_posts WHERE status = "published" ORDER BY post_date DESC, created_at DESC'
        );
        res.json(rows.map(toPost));
    } catch (e) { next(e); }
});

// Public: single post with content
router.get('/:id', async (req, res, next) => {
    try {
        const [[post]] = await pool.query(
            'SELECT * FROM blog_posts WHERE id = ? AND status = "published"', [req.params.id]
        );
        if (!post) return res.status(404).json({ error: 'Not found' });

        const [[content]] = await pool.query(
            'SELECT * FROM blog_content WHERE post_id = ?', [req.params.id]
        );
        res.json({ ...toPost(post), content: content ? toContent(content) : null });
    } catch (e) { next(e); }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// DATE columns come back from mysql2 as JS Date objects; String(date) yields
// "Mon Jan 01 2024 …" whose .slice(0,10) drops the year. Normalise to YYYY-MM-DD.
function fmtDate(d) {
    if (!d) return null;
    if (d instanceof Date) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return String(d).slice(0, 10);
}

function toPost(r) {
    return {
        id:         r.id,
        title:      r.title,
        category:   r.category,
        author:     r.author,
        date:       fmtDate(r.post_date),
        readTime:   r.read_time,
        excerpt:    r.excerpt,
        coverImage: r.cover_image,
        status:     r.status,
        cols:       r.cols,
        createdAt:  r.created_at,
    };
}

function toContent(r) {
    const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
    return {
        lead:             r.lead,
        body:             parse(r.body) || [],
        pullQuote:        r.pull_quote,
        pullQuoteCite:    r.pull_quote_cite,
        figureImage:      r.figure_image,
        figureCaption:    r.figure_caption,
        bodyAfterFigure:  parse(r.body_after_figure) || [],
        tags:             r.tags,
        related:          parse(r.related_posts) || [],
    };
}

module.exports = router;
