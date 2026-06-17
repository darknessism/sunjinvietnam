const express     = require('express');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Editable static text on the public pages. Each translatable element is tagged
// in the HTML with data-tkey="<page>-t<NNN>" (page = home | about | careers).
// The set of editable texts and their default values live in the HTML itself
// (the admin reads them by parsing the live page); this table only stores the
// admin's Vietnamese/English overrides. The page loads its defaults, then a
// loader swaps in any override and re-applies the language.
// ──────────────────────────────────────────────────────────────────────────
const SLOT_RE = /^(home|about|careers)-t\d{1,4}$/;

async function initTextContent() {
    await pool.query(`CREATE TABLE IF NOT EXISTS text_content (
        slot       VARCHAR(64)  NOT NULL PRIMARY KEY,
        page       VARCHAR(32)  NOT NULL,
        vi         TEXT,
        en         TEXT,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
}

// ── Public/Admin: overrides for a page -> { slot: { vi, en } } ───────────────
router.get('/overrides', async (req, res, next) => {
    try {
        const page = req.query.page;
        const [rows] = page
            ? await pool.query('SELECT slot, vi, en FROM text_content WHERE page = ?', [page])
            : await pool.query('SELECT slot, vi, en FROM text_content');
        const out = {};
        for (const r of rows) out[r.slot] = { vi: r.vi, en: r.en };
        res.set('Cache-Control', 'no-cache');
        res.json(out);
    } catch (e) { next(e); }
});

// ── Admin: set / replace the VI & EN text for a slot (both empty resets) ─────
router.put('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        const slot = String(req.params.slot || '');
        if (!SLOT_RE.test(slot)) return res.status(400).json({ error: 'Invalid text slot.' });
        const vi = req.body && req.body.vi != null ? String(req.body.vi) : '';
        const en = req.body && req.body.en != null ? String(req.body.en) : '';
        if (!vi.trim() && !en.trim()) {
            await pool.query('DELETE FROM text_content WHERE slot = ?', [slot]);
            return res.json({ ok: true, reset: true });
        }
        const page = slot.split('-')[0];
        await pool.query(
            `INSERT INTO text_content (slot, page, vi, en) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE vi = VALUES(vi), en = VALUES(en)`,
            [slot, page, vi, en]
        );
        res.json({ ok: true });
    } catch (e) { next(e); }
});

// ── Admin: remove the override, reverting to the default text ────────────────
router.delete('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        const slot = String(req.params.slot || '');
        if (!SLOT_RE.test(slot)) return res.status(400).json({ error: 'Invalid text slot.' });
        await pool.query('DELETE FROM text_content WHERE slot = ?', [slot]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initTextContent = initTextContent;
