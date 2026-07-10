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

// Public: lightweight search index — plain-text article bodies (VI + EN) per
// published post, for the site-wide search. Must be declared before '/:id'.
router.get('/search-index', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.id, c.\`lead\`, c.lead_en, c.body, c.body_en, c.body_html, c.body_html_en,
                    c.pull_quote, c.pull_quote_en, c.body_after_figure, c.body_after_figure_en
             FROM blog_posts p LEFT JOIN blog_content c ON c.post_id = p.id
             WHERE p.status = "published"`
        );
        const parse   = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
        const joinArr = v => { const a = parse(v); return Array.isArray(a) ? a.join(' ') : ''; };
        const strip   = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
        res.json(rows.map(r => ({
            id:     r.id,
            text:   strip([r.lead, joinArr(r.body), r.pull_quote, joinArr(r.body_after_figure), r.body_html].join(' ')),
            textEn: strip([r.lead_en, joinArr(r.body_en), r.pull_quote_en, joinArr(r.body_after_figure_en), r.body_html_en].join(' ')),
        })));
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
