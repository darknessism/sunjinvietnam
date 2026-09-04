const express    = require('express');
const https      = require('https');
const multer     = require('multer');
const nodemailer = require('nodemailer');
const pool       = require('../db/connection');
const router     = express.Router();

// HR inbox that receives applications
const HR_EMAIL = process.env.HR_EMAIL || 'hr@sunjinvietnam.vn';

// Mail transport selection: prefer Brevo's HTTPS API in production (cloud hosts
// such as Railway block outbound SMTP), fall back to Gmail SMTP for local dev.
const USE_BREVO   = !!process.env.BREVO_API_KEY;
const MAIL_FROM   = process.env.MAIL_FROM || process.env.SMTP_USER;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'SUNJIN Careers';

// Accept a single CV/portfolio file, kept in memory, max 20 MB.
// Whatever is uploaded here is forwarded to HR as an email attachment, so the
// type must be restricted: without this the endpoint relays arbitrary files
// (executables, archives) straight into the inbox.
const CV_MIME = new Set([
    'application/pdf',
    'application/msword',                                                       // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
]);
const CV_EXT = /\.(pdf|doc|docx)$/i;

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 20 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        // Check both: browsers disagree on the MIME they report for .doc/.docx.
        if (CV_MIME.has(file.mimetype) && CV_EXT.test(file.originalname || '')) return cb(null, true);
        const err = new Error('CV must be a PDF, DOC or DOCX file.');
        err.status = 400;
        cb(err);
    },
});

// Reusable mail transporter (Gmail SMTP via app password).
// Port is configurable via SMTP_PORT so we can switch 587 (STARTTLS) <-> 465
// (SSL) on the host without a code change — some networks filter one but not
// the other. Default to 587, which Railway tends to allow.
let _transporter = null;
function getTransporter() {
    if (_transporter) return _transporter;
    const port = Number(process.env.SMTP_PORT) || 587;
    _transporter = nodemailer.createTransport({
        host:   'smtp.gmail.com',
        port,
        secure: port === 465,   // SSL for 465, STARTTLS for 587
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // Fail fast instead of hanging the request if SMTP is blocked/unreachable
        connectionTimeout: 15000,
        greetingTimeout:   10000,
        socketTimeout:     20000,
    });
    return _transporter;
}

// POST a transactional email through Brevo's HTTPS API (api.brevo.com:443).
function brevoRequest(method, path, payload) {
    return new Promise((resolve, reject) => {
        const data = payload ? JSON.stringify(payload) : null;
        const req = https.request({
            host: 'api.brevo.com', path, method,
            headers: {
                'api-key':      process.env.BREVO_API_KEY,
                'accept':       'application/json',
                ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
            },
            timeout: 15000,
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body ? JSON.parse(body) : {});
                } else {
                    reject(new Error(`Brevo API ${res.statusCode}: ${body}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Brevo API request timed out')));
        if (data) req.write(data);
        req.end();
    });
}

// Send an application email via whichever transport is configured.
async function sendApplicationMail({ subject, html, replyTo, replyToName, file }) {
    if (USE_BREVO) {
        return brevoRequest('POST', '/v3/smtp/email', {
            sender:  { name: MAIL_FROM_NAME, email: MAIL_FROM },
            to:      [{ email: HR_EMAIL }],
            replyTo: replyTo ? { email: replyTo, name: replyToName || replyTo } : undefined,
            subject,
            htmlContent: html,
            attachment:  file ? [{ content: file.buffer.toString('base64'), name: file.originalname || 'cv' }] : undefined,
        });
    }
    return getTransporter().sendMail({
        from:    `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
        to:      HR_EMAIL,
        replyTo,
        subject,
        html,
        attachments: file ? [{ filename: file.originalname || 'cv', content: file.buffer, contentType: file.mimetype }] : [],
    });
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

        // Without a configured transport the send would fail — fail fast with a clear error
        const mailReady = USE_BREVO ? !!MAIL_FROM : !!(process.env.SMTP_USER && process.env.SMTP_PASS);
        if (!mailReady) {
            console.error('Career application not sent: mail transport not configured.');
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

        await sendApplicationMail({
            subject:     `New Application — ${position} — ${name}`,
            html,
            replyTo:     email,
            replyToName: name,
            file:        req.file,
        });

        res.json({ ok: true });
    } catch (e) { next(e); }
});

// Diagnostic: verify mail connectivity WITHOUT sending an email. Used to test
// the transport after a deploy. Returns no secrets.
router.get('/mail-status', async (req, res) => {
    if (USE_BREVO) {
        try {
            const acct = await brevoRequest('GET', '/v3/account');
            return res.json({ ok: true, transport: 'brevo', from: MAIL_FROM, plan: !!acct.email });
        } catch (e) {
            return res.json({ ok: false, transport: 'brevo', from: MAIL_FROM, error: e.message });
        }
    }
    const port = Number(process.env.SMTP_PORT) || 587;
    const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    if (!configured) return res.json({ ok: false, transport: 'smtp', port, configured, error: 'SMTP not configured' });
    try {
        await getTransporter().verify();
        res.json({ ok: true, transport: 'smtp', port, configured });
    } catch (e) {
        res.json({ ok: false, transport: 'smtp', port, configured, error: e.message, code: e.code });
    }
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
        titleEn:        r.title_en,
        salaryEn:       r.salary_en,
        descriptionEn:  r.description_en,
        requirementsEn: r.requirements_en,
        benefitsEn:     parse(r.benefits_en) || [],
        status:       r.status,
        createdAt:    r.created_at,
    };
}

module.exports = router;
