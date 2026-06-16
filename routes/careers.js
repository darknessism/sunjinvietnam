const express    = require('express');
const multer     = require('multer');
const nodemailer = require('nodemailer');
const pool       = require('../db/connection');
const router     = express.Router();

// HR inbox that receives applications
const HR_EMAIL = process.env.HR_EMAIL || 'thuhuong.mkttrangan@gmail.com';

// Accept a single CV/portfolio file, kept in memory, max 20 MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 20 * 1024 * 1024 },
});

// Reusable mail transporter (Gmail SMTP via app password)
let _transporter = null;
function getTransporter() {
    if (_transporter) return _transporter;
    _transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // Fail fast instead of hanging the request if SMTP is blocked/unreachable
        connectionTimeout: 15000,
        greetingTimeout:   10000,
        socketTimeout:     20000,
    });
    return _transporter;
}

const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Public: submit a job application -> email it to HR
router.post('/apply', upload.single('cv'), async (req, res, next) => {
    try {
        const { name, email, phone, experience, message, jobId, jobTitle } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({ error: 'Name, email and phone are required.' });
        }

        // Without SMTP credentials the email send would hang/fail — fail fast with a clear error
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.error('Career application not sent: SMTP_USER/SMTP_PASS not configured.');
            return res.status(503).json({ error: 'Mail service is not configured. Please try again later or contact HR directly.' });
        }

        const position = jobTitle || jobId || 'General application';
        const rows = [
            ['Position',          position],
            ['Full Name',         name],
            ['Email',             email],
            ['Phone',             phone],
            ['Years of Exp.',     experience || '—'],
        ];
        const html = `
            <h2 style="font-family:Arial,sans-serif;">New Job Application</h2>
            <table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse;">
                ${rows.map(([k, v]) => `<tr>
                    <td style="padding:4px 12px 4px 0;color:#666;"><strong>${esc(k)}</strong></td>
                    <td style="padding:4px 0;">${esc(v)}</td>
                </tr>`).join('')}
            </table>
            <h3 style="font-family:Arial,sans-serif;margin-top:20px;">Message</h3>
            <p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;">${esc(message) || '—'}</p>
            ${req.file ? '' : '<p style="font-family:Arial,sans-serif;color:#999;font-size:13px;"><em>No CV/portfolio file attached.</em></p>'}
        `;

        const attachments = req.file ? [{
            filename:    req.file.originalname || 'cv',
            content:     req.file.buffer,
            contentType: req.file.mimetype,
        }] : [];

        await getTransporter().sendMail({
            from:        `"SUNJIN Careers" <${process.env.SMTP_USER}>`,
            to:          HR_EMAIL,
            replyTo:     email,
            subject:     `New Application — ${position} — ${name}`,
            html,
            attachments,
        });

        res.json({ ok: true });
    } catch (e) { next(e); }
});

// Public: list published careers
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM careers WHERE status = "published" ORDER BY created_at DESC'
        );
        res.json(rows.map(toCareer));
    } catch (e) { next(e); }
});

// Public: filter options (departments / locations / levels), grouped by kind
router.get('/taxonomies', async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, kind, value, label FROM career_taxonomies ORDER BY kind, sort, label'
        );
        res.json(groupTaxonomies(rows));
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

// Shape flat taxonomy rows into { department:[{id,value,label}], location:[...], level:[...] }
function groupTaxonomies(rows) {
    const out = { department: [], location: [], level: [] };
    for (const r of rows) {
        (out[r.kind] || (out[r.kind] = [])).push({ id: r.id, value: r.value, label: r.label });
    }
    return out;
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
        deadline:     r.deadline ? new Date(r.deadline).toISOString().slice(0, 10) : null,
        coverImage:   r.cover_image,
        description:  r.description,
        requirements: r.requirements,
        benefits:     parse(r.benefits) || [],
        status:       r.status,
        createdAt:    r.created_at,
    };
}

module.exports = router;
