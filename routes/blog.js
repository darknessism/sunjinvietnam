const express = require('express');
const pool    = require('../db/connection');
const router  = express.Router();

// Ensure the optional "featured" flag column exists (for curated home-page picks).
async function initBlog() {
    const [[col]] = await pool.query(
        `SELECT COUNT(*) AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'blog_posts' AND column_name = 'featured'`
    );
    if (!col.c) await pool.query('ALTER TABLE blog_posts ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0');
}

// Public: list published posts (optionally only featured ones via ?featured=1)
router.get('/', async (req, res, next) => {
    try {
        const onlyFeatured = req.query.featured === '1' || req.query.featured === 'true';
        const [rows] = await pool.query(
            'SELECT * FROM blog_posts WHERE status = "published"' + (onlyFeatured ? ' AND featured = 1' : '') +
            ' ORDER BY post_date DESC, created_at DESC'
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
        titleEn:    r.title_en || '',
        category:   r.category,
        author:     r.author,
        date:       fmtDate(r.post_date),
        readTime:   r.read_time,
        excerpt:    r.excerpt,
        excerptEn:  r.excerpt_en || '',
        coverImage: r.cover_image,
        status:     r.status,
        cols:       r.cols,
        featured:   !!r.featured,
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
        // ── English variants (bilingual content) ──
        leadEn:            r.lead_en || '',
        bodyEn:            parse(r.body_en) || [],
        pullQuoteEn:       r.pull_quote_en || '',
        pullQuoteCiteEn:   r.pull_quote_cite_en || '',
        figureCaptionEn:   r.figure_caption_en || '',
        bodyAfterFigureEn: parse(r.body_after_figure_en) || [],
        bodyHtml:          r.body_html || '',
        bodyHtmlEn:        r.body_html_en || '',
    };
}

module.exports = router;
module.exports.initBlog = initBlog;
