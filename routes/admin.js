const express     = require('express');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// All admin routes require JWT
router.use(requireAuth);

// ══════════════════════════════════════════════════════
// PROJECTS
// ══════════════════════════════════════════════════════

router.get('/projects', async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM projects ORDER BY year DESC, created_at DESC');
        res.json(rows.map(toProject));
    } catch (e) { next(e); }
});

router.post('/projects', async (req, res, next) => {
    try {
        const p = req.body;
        await pool.query(
            `INSERT INTO projects (id, title, category, location, year, award, architects, cover_image, status, cols, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title=VALUES(title), category=VALUES(category), location=VALUES(location),
               year=VALUES(year), award=VALUES(award), architects=VALUES(architects),
               cover_image=VALUES(cover_image), status=VALUES(status)`,
            [p.id, p.title, p.category, p.location, p.year, p.award, p.architects,
             p.coverImage, p.status || 'draft', p.cols ?? 12,
             p.createdAt || new Date().toISOString().slice(0, 10)]
        );
        const [[row]] = await pool.query('SELECT * FROM projects WHERE id = ?', [p.id]);
        res.status(201).json(toProject(row));
    } catch (e) { next(e); }
});

router.put('/projects/:id', async (req, res, next) => {
    try {
        const p = req.body;
        await pool.query(
            `UPDATE projects SET title=?, category=?, location=?, year=?, award=?, architects=?,
             cover_image=?, status=? WHERE id=?`,
            [p.title, p.category, p.location, p.year, p.award, p.architects,
             p.coverImage, p.status, req.params.id]
        );
        const [[row]] = await pool.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        res.json(toProject(row));
    } catch (e) { next(e); }
});

router.delete('/projects/:id', async (req, res, next) => {
    try {
        await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// Project detail
router.get('/projects/:id/detail', async (req, res, next) => {
    try {
        const [[row]] = await pool.query('SELECT * FROM project_details WHERE project_id = ?', [req.params.id]);
        res.json(row ? toDetail(row) : null);
    } catch (e) { next(e); }
});

router.put('/projects/:id/detail', async (req, res, next) => {
    try {
        const d = req.body;
        const j = JSON.stringify.bind(JSON);

        // If admin sent _overview, sync those fields back to the projects table
        if (d._overview) {
            const ov = d._overview;
            await pool.query(
                `UPDATE projects SET title=COALESCE(?,title), category=COALESCE(?,category),
                 location=COALESCE(?,location), year=COALESCE(?,year), award=COALESCE(?,award),
                 architects=COALESCE(?,architects), cover_image=COALESCE(?,cover_image),
                 status=COALESCE(?,status) WHERE id=?`,
                [ov.title, ov.category, ov.location, ov.year, ov.award,
                 ov.architects, ov.coverImage, ov.status, req.params.id]
            );
        }

        const next_ = d.next || {};
        await pool.query(
            `INSERT INTO project_details
               (project_id, title_plain, title_display, category_label, year_loc, award,
                images, lead, photo1_alt, photo1_cap, photo2_alt, photo2_cap, photo3_alt, photo3_cap,
                narrative1, narrative2, highlights, specs, credits, awards_list,
                next_id, next_title, next_type, next_img)
             VALUES (?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?)
             ON DUPLICATE KEY UPDATE
               title_plain=VALUES(title_plain), title_display=VALUES(title_display),
               category_label=VALUES(category_label), year_loc=VALUES(year_loc), award=VALUES(award),
               images=VALUES(images), lead=VALUES(lead),
               photo1_alt=VALUES(photo1_alt), photo1_cap=VALUES(photo1_cap),
               photo2_alt=VALUES(photo2_alt), photo2_cap=VALUES(photo2_cap),
               photo3_alt=VALUES(photo3_alt), photo3_cap=VALUES(photo3_cap),
               narrative1=VALUES(narrative1), narrative2=VALUES(narrative2),
               highlights=VALUES(highlights), specs=VALUES(specs), credits=VALUES(credits),
               awards_list=VALUES(awards_list),
               next_id=VALUES(next_id), next_title=VALUES(next_title),
               next_type=VALUES(next_type), next_img=VALUES(next_img)`,
            [req.params.id, d.titlePlain, d.title, d.category, d.yearLoc, d.award,
             j(d.images), d.lead, d.photo1alt, d.photo1cap, d.photo2alt, d.photo2cap,
             d.photo3alt, d.photo3cap, j(d.narrative1), j(d.narrative2),
             j(d.highlights), j(d.specs), j(d.credits), j(d.awards),
             next_.id || null, next_.title || null, next_.ty || null, next_.img || null]
        );
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════
// BLOG
// ══════════════════════════════════════════════════════

router.get('/blog', async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM blog_posts ORDER BY post_date DESC, created_at DESC');
        res.json(rows.map(toPost));
    } catch (e) { next(e); }
});

router.post('/blog', async (req, res, next) => {
    try {
        const p = req.body;
        await pool.query(
            `INSERT INTO blog_posts (id, title, category, author, post_date, read_time, excerpt, cover_image, status, cols, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title=VALUES(title), category=VALUES(category), author=VALUES(author),
               post_date=VALUES(post_date), read_time=VALUES(read_time), excerpt=VALUES(excerpt),
               cover_image=VALUES(cover_image), status=VALUES(status)`,
            [p.id, p.title, p.category, p.author, p.date || null, p.readTime || 5,
             p.excerpt, p.coverImage, p.status || 'draft', p.cols ?? 12,
             p.createdAt || new Date().toISOString().slice(0, 10)]
        );
        const [[row]] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [p.id]);
        res.status(201).json(toPost(row));
    } catch (e) { next(e); }
});

router.put('/blog/:id', async (req, res, next) => {
    try {
        const p = req.body;
        await pool.query(
            `UPDATE blog_posts SET title=?, category=?, author=?, post_date=?, read_time=?,
             excerpt=?, cover_image=?, status=? WHERE id=?`,
            [p.title, p.category, p.author, p.date || null, p.readTime || 5,
             p.excerpt, p.coverImage, p.status, req.params.id]
        );
        const [[row]] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
        res.json(toPost(row));
    } catch (e) { next(e); }
});

router.delete('/blog/:id', async (req, res, next) => {
    try {
        await pool.query('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// Blog content
router.get('/blog/:id/content', async (req, res, next) => {
    try {
        const [[row]] = await pool.query('SELECT * FROM blog_content WHERE post_id = ?', [req.params.id]);
        res.json(row ? toContent(row) : null);
    } catch (e) { next(e); }
});

router.put('/blog/:id/content', async (req, res, next) => {
    try {
        const c = req.body;
        const j = JSON.stringify.bind(JSON);
        await pool.query(
            `INSERT INTO blog_content
               (post_id, lead, body, pull_quote, pull_quote_cite, figure_image,
                figure_caption, body_after_figure, tags, related_posts)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               lead=VALUES(lead), body=VALUES(body),
               pull_quote=VALUES(pull_quote), pull_quote_cite=VALUES(pull_quote_cite),
               figure_image=VALUES(figure_image), figure_caption=VALUES(figure_caption),
               body_after_figure=VALUES(body_after_figure), tags=VALUES(tags),
               related_posts=VALUES(related_posts)`,
            [req.params.id, c.lead, j(c.body), c.pullQuote, c.pullQuoteCite,
             c.figureImage, c.figureCaption, j(c.bodyAfterFigure), c.tags, j(c.related)]
        );
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════
// CAREERS
// ══════════════════════════════════════════════════════

router.get('/careers', async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM careers ORDER BY created_at DESC');
        res.json(rows.map(toCareer));
    } catch (e) { next(e); }
});

router.post('/careers', async (req, res, next) => {
    try {
        const c = req.body;
        await pool.query(
            `INSERT INTO careers (id, title, department, location, level, type, salary, deadline,
             cover_image, description, requirements, benefits, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               title=VALUES(title), department=VALUES(department), location=VALUES(location),
               level=VALUES(level), type=VALUES(type), salary=VALUES(salary),
               deadline=VALUES(deadline), cover_image=VALUES(cover_image),
               description=VALUES(description), requirements=VALUES(requirements),
               benefits=VALUES(benefits), status=VALUES(status)`,
            [c.id, c.title, c.department, c.location, c.level, c.type, c.salary,
             c.deadline || null, c.coverImage, c.description, c.requirements,
             JSON.stringify(c.benefits || []), c.status || 'draft',
             c.createdAt || new Date().toISOString().slice(0, 10)]
        );
        const [[row]] = await pool.query('SELECT * FROM careers WHERE id = ?', [c.id]);
        res.status(201).json(toCareer(row));
    } catch (e) { next(e); }
});

router.put('/careers/:id', async (req, res, next) => {
    try {
        const c = req.body;
        await pool.query(
            `UPDATE careers SET title=?, department=?, location=?, level=?, type=?, salary=?,
             deadline=?, cover_image=?, description=?, requirements=?, benefits=?, status=? WHERE id=?`,
            [c.title, c.department, c.location, c.level, c.type, c.salary,
             c.deadline || null, c.coverImage, c.description, c.requirements,
             JSON.stringify(c.benefits || []), c.status, req.params.id]
        );
        const [[row]] = await pool.query('SELECT * FROM careers WHERE id = ?', [req.params.id]);
        res.json(toCareer(row));
    } catch (e) { next(e); }
});

router.delete('/careers/:id', async (req, res, next) => {
    try {
        await pool.query('DELETE FROM careers WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════
// SEED — POST /api/admin/seed
// Seeds the database with default data from admin.html's SEED constant.
// Safe to call multiple times (uses INSERT IGNORE / ON DUPLICATE KEY).
// ══════════════════════════════════════════════════════

router.post('/seed', async (req, res, next) => {
    try {
        const { projects, blog, careers, details, blog_contents } = req.body;

        if (Array.isArray(projects)) {
            for (const p of projects) {
                await pool.query(
                    `INSERT IGNORE INTO projects (id,title,category,location,year,award,architects,cover_image,status,cols,created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                    [p.id, p.title, p.category, p.location, p.year, p.award, p.architects,
                     p.coverImage, p.status || 'published', p.cols ?? 12,
                     p.createdAt || new Date().toISOString().slice(0, 10)]
                );
            }
        }

        if (details && typeof details === 'object') {
            for (const [pid, d] of Object.entries(details)) {
                const next_ = d.next || {};
                const j = JSON.stringify.bind(JSON);
                await pool.query(
                    `INSERT IGNORE INTO project_details
                       (project_id,title_plain,title_display,category_label,year_loc,award,
                        images,lead,photo1_alt,photo1_cap,photo2_alt,photo2_cap,photo3_alt,photo3_cap,
                        narrative1,narrative2,highlights,specs,credits,awards_list,
                        next_id,next_title,next_type,next_img)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [pid, d.titlePlain, d.title, d.category, d.yearLoc, d.award,
                     j(d.images), d.lead,
                     d.photo1alt, d.photo1cap, d.photo2alt, d.photo2cap, d.photo3alt, d.photo3cap,
                     j(d.narrative1), j(d.narrative2), j(d.highlights), j(d.specs), j(d.credits), j(d.awards),
                     next_.id || null, next_.title || null, next_.ty || null, next_.img || null]
                );
            }
        }

        if (Array.isArray(blog)) {
            for (const b of blog) {
                await pool.query(
                    `INSERT IGNORE INTO blog_posts (id,title,category,author,post_date,read_time,excerpt,cover_image,status,cols,created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                    [b.id, b.title, b.category, b.author, b.date || null, b.readTime || 5,
                     b.excerpt, b.coverImage, b.status || 'published', b.cols ?? 12,
                     b.createdAt || new Date().toISOString().slice(0, 10)]
                );
            }
        }

        if (blog_contents && typeof blog_contents === 'object') {
            for (const [bid, c] of Object.entries(blog_contents)) {
                const j = JSON.stringify.bind(JSON);
                await pool.query(
                    `INSERT IGNORE INTO blog_content
                       (post_id,lead,body,pull_quote,pull_quote_cite,figure_image,
                        figure_caption,body_after_figure,tags,related_posts)
                     VALUES (?,?,?,?,?,?,?,?,?,?)`,
                    [bid, c.lead, j(c.body), c.pullQuote, c.pullQuoteCite,
                     c.figureImage, c.figureCaption, j(c.bodyAfterFigure), c.tags, j(c.related)]
                );
            }
        }

        if (Array.isArray(careers)) {
            for (const c of careers) {
                await pool.query(
                    `INSERT IGNORE INTO careers (id,title,department,location,level,type,salary,deadline,cover_image,description,requirements,benefits,status,created_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [c.id, c.title, c.department, c.location, c.level, c.type, c.salary,
                     c.deadline || null, c.coverImage, c.description, c.requirements,
                     JSON.stringify(c.benefits || []), c.status || 'published',
                     c.createdAt || new Date().toISOString().slice(0, 10)]
                );
            }
        }

        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toProject(r) {
    return {
        id:         r.id,
        title:      r.title,
        category:   r.category,
        location:   r.location,
        year:       r.year,
        award:      r.award,
        architects: r.architects,
        coverImage: r.cover_image,
        status:     r.status,
        cols:       r.cols,
        createdAt:  r.created_at,
    };
}

function toDetail(r) {
    const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return v; } };
    return {
        titlePlain:  r.title_plain,
        title:       r.title_display,
        category:    r.category_label,
        yearLoc:     r.year_loc,
        award:       r.award,
        images:      parse(r.images) || [],
        lead:        r.lead,
        photo1alt:   r.photo1_alt, photo1cap: r.photo1_cap,
        photo2alt:   r.photo2_alt, photo2cap: r.photo2_cap,
        photo3alt:   r.photo3_alt, photo3cap: r.photo3_cap,
        narrative1:  parse(r.narrative1) || [],
        narrative2:  parse(r.narrative2) || [],
        highlights:  parse(r.highlights) || [],
        specs:       parse(r.specs) || [],
        credits:     parse(r.credits) || [],
        awards:      parse(r.awards_list) || [],
        next: r.next_id ? { id: r.next_id, title: r.next_title, ty: r.next_type, img: r.next_img } : null,
    };
}

function toPost(r) {
    return {
        id:         r.id,
        title:      r.title,
        category:   r.category,
        author:     r.author,
        date:       r.post_date ? String(r.post_date).slice(0, 10) : null,
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
        lead:            r.lead,
        body:            parse(r.body) || [],
        pullQuote:       r.pull_quote,
        pullQuoteCite:   r.pull_quote_cite,
        figureImage:     r.figure_image,
        figureCaption:   r.figure_caption,
        bodyAfterFigure: parse(r.body_after_figure) || [],
        tags:            r.tags,
        related:         parse(r.related_posts) || [],
    };
}

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
